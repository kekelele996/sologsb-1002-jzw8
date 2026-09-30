import type {
  Comment, FieldMismatch, ReviewRound, RoundDecision, RoundNote,
  RoundStage, SubmissionResponse,
} from '../types'

export interface ReconcileInput {
  localRounds: ReviewRound[]
  comments: Comment[]
  remote: SubmissionResponse
}

export interface ReconcileResult {
  rounds: ReviewRound[]
  /** 本次首次送达的回执（新并入的回合或对成账的回合） */
  deliveredReceipts: string[]
  /** 本次对账前仍挂起、本次补上的回合编号 */
  backfilledRoundNos: number[]
  /** 本次是否完全没有新回执（用于“同一份回执再拉一次也不多出回合”的提示） */
  nothingNew: boolean
}

export const decisionLabel = (decision: RoundDecision): string => ({
  major: '大修',
  minor: '小修',
  accept: '录用',
  reject: '拒稿',
  pending: '待定',
}[decision])

export const stageLabel = (stage: RoundStage): string => stage === 'closed' ? '已结束' : '进行中'

const formatDeadline = (value: number | null | undefined): string =>
  value == null ? '未设置' : new Date(value).toLocaleDateString('zh-CN', { year: 'numeric', month: '2-digit', day: '2-digit' })

// 邮件记录与回执里同一条意见 id 可能不同，按作者+内容判重
const noteKey = (note: RoundNote) => `${note.author}|${note.body}`

const mergeNotes = (local: RoundNote[], remote: RoundNote[]): RoundNote[] => {
  const seen = new Set<string>()
  const merged: RoundNote[] = []
  // 工作台侧邮件/批注里留存的随附意见在前，投审系统回执在后，按回执 id 去重
  for (const note of [...local, ...remote].sort((a, b) => a.attachedAt - b.attachedAt)) {
    const key = noteKey(note)
    if (seen.has(key)) continue
    seen.add(key)
    merged.push(note)
  }
  return merged
}

/** 未处理完的意见：开放态视为工作台这边还压着 */
export const isCommentOpen = (comment: Comment) => comment.status === 'open'

/**
 * 按投稿编号把工作台回合台账与投审系统回执对账。
 *
 * 合并口径（同一个回合两边都动过时）：
 *  - 正文与批注的处置完全留在工作台（这里不碰 comments，由编辑逐个定夺）；
 *  - 决定与截止时间以投审系统为准；
 *  - 两边对不上的字段记入 mismatches 圈出来；
 *  - 投审系统已结束而工作台仍有未处理意见，needsAdjudication = true。
 *
 * 幂等：回执以 receiptId 为准，同一回执重复送达只就地刷新，不产生新回合。
 */
export const reconcileRounds = ({ localRounds, comments, remote }: ReconcileInput): ReconcileResult => {
  const openCountByRound = new Map<number, number>()
  for (const comment of comments) {
    if (isCommentOpen(comment)) openCountByRound.set(comment.roundNo, (openCountByRound.get(comment.roundNo) ?? 0) + 1)
  }

  const localByReceipt = new Map(localRounds.filter((round) => round.receiptId).map((round) => [round.receiptId as string, round]))
  const localByNo = new Map(localRounds.map((round) => [round.roundNo, round]))
  const knownReceipts = new Set(localRounds.map((round) => round.receiptId).filter(Boolean) as string[])

  const nextRounds = [...localRounds]
  const deliveredReceipts: string[] = []
  const backfilledRoundNos: number[] = []

  for (const remoteRound of remote.rounds) {
    if (knownReceipts.has(remoteRound.receiptId)) {
      // 同一份回执再拉一次：只按投审系统刷新决定/截止时间与随附意见，绝不多出回合
      const index = nextRounds.findIndex((round) => round.receiptId === remoteRound.receiptId)
      if (index >= 0) {
        const local = nextRounds[index]
        nextRounds[index] = {
          ...local,
          stage: remoteRound.stage,
          decision: remoteRound.decision,
          deadline: remoteRound.deadline,
          notes: mergeNotes(local.notes, remoteRound.notes),
          systemUpdatedAt: remoteRound.systemUpdatedAt,
          pulledAt: remote.fetchedAt,
        }
      }
      continue
    }

    deliveredReceipts.push(remoteRound.receiptId)
    const local = localByReceipt.get(remoteRound.receiptId) ?? localByNo.get(remoteRound.roundNo)

    if (!local) {
      // 投审系统有、工作台没有：新回执并入
      nextRounds.push({
        roundNo: remoteRound.roundNo,
        stage: remoteRound.stage,
        decision: remoteRound.decision,
        deadline: remoteRound.deadline,
        notes: mergeNotes([], remoteRound.notes),
        receiptId: remoteRound.receiptId,
        localTouchedAt: 0,
        systemUpdatedAt: remoteRound.systemUpdatedAt,
        pulledAt: remote.fetchedAt,
        mismatches: [],
        bothTouched: false,
        needsAdjudication: false,
        state: 'new-remote',
      })
      continue
    }

    // 同一个回合两边都动过：决定/截止按投审系统，差异圈出来，批注处置留工作台
    const mismatches: FieldMismatch[] = []
    if (local.decision !== remoteRound.decision) {
      mismatches.push({ field: 'decision', local: decisionLabel(local.decision), remote: decisionLabel(remoteRound.decision) })
    }
    if ((local.deadline ?? null) !== (remoteRound.deadline ?? null)) {
      mismatches.push({ field: 'deadline', local: formatDeadline(local.deadline), remote: formatDeadline(remoteRound.deadline) })
    }
    const unresolved = openCountByRound.get(remoteRound.roundNo) ?? 0

    const index = nextRounds.findIndex((round) => round === local)
    nextRounds[index] = {
      ...local,
      stage: remoteRound.stage,
      // 定夺结论不受重复对账影响
      adjudication: local.adjudication,
      adjudicationAt: local.adjudicationAt,
      // 决定与截止时间：投审系统说了算
      decision: remoteRound.decision,
      deadline: remoteRound.deadline,
      notes: mergeNotes(local.notes, remoteRound.notes),
      receiptId: remoteRound.receiptId,
      systemUpdatedAt: remoteRound.systemUpdatedAt,
      pulledAt: remote.fetchedAt,
      mismatches,
      bothTouched: true,
      // 投审已结束、工作台还有未处理意见：逐个交编辑定夺
      needsAdjudication: local.adjudication == null && remoteRound.stage === 'closed' && unresolved > 0,
      state: mismatches.length ? 'mismatch' : 'matched',
    }
    if (local.state === 'pending-delivery') backfilledRoundNos.push(remoteRound.roundNo)
  }

  nextRounds.sort((a, b) => a.roundNo - b.roundNo)
  return {
    rounds: nextRounds,
    deliveredReceipts,
    backfilledRoundNos,
    nothingNew: deliveredReceipts.length === 0,
  }
}
