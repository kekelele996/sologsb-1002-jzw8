import { create } from 'zustand'
import {
  fetchSubmissionRounds, isSubmissionSystemAvailable, pushRoundToSubmission, setSubmissionSystemAvailable,
  type SubmissionRound,
} from '../services/mockApi'
import type {
  AttachedOpinion, Comment, EditConflict, Paragraph, Reply, ReviewRound, Role, RoundDecision,
  RoundEditorDisposition, RoundMismatch, Version,
} from '../types'

const DRAFT_KEY = 'sologsb-1002-draft-v1'
export const SUBMISSION_ID = 'MS-2026-0417'

export const DECISION_LABEL: Record<RoundDecision, string> = {
  major_revision: '大修',
  minor_revision: '小修',
  accept: '录用',
  reject: '拒稿',
  pending: '待定',
}

const id = (prefix: string) => `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`

const baseParagraphs: Paragraph[] = [
  { id: 'p-01', section: '摘要', number: '1.', text: '开源软件供应链的稳定性不仅取决于代码质量，也取决于维护者能否持续识别并回应社区需求。', original: '开源软件供应链的稳定性不仅取决于代码质量，也取决于维护者能否持续识别并回应社区需求。', status: 'accepted', highlighted: false },
  { id: 'p-02', section: '1 引言', number: '2.', text: '近年来，大型语言模型被广泛用于代码生成与缺陷定位，但其在真实维护工作流中的影响仍缺少系统证据。', original: '近年来，大型语言模型被广泛用于代码生成与缺陷定位，但其在真实维护工作流中的影响仍缺少系统证据。', status: 'open', highlighted: true },
  { id: 'p-03', section: '1 引言', number: '3.', text: '本文收集 12 个活跃开源项目连续 18 个月的议题记录，并访谈 26 位核心维护者。', original: '本文收集 12 个活跃开源项目连续 18 个月的议题记录，并访谈 26 位核心维护者。', status: 'open', highlighted: true },
  { id: 'p-04', section: '2 方法', number: '4.', text: '我们采用混合研究方法，将议题生命周期划分为响应、评审与合并三个阶段。编码过程由两名研究者独立完成。', original: '我们采用混合研究方法，将议题生命周期划分为响应、评审与合并三个阶段。编码过程由两名研究者独立完成。', status: 'open', highlighted: false },
  { id: 'p-05', section: '2 方法', number: '5.', text: '当编码结果不一致时，研究者通过讨论达成一致；若仍有分歧，则邀请第三位研究者裁决。', original: '当编码结果不一致时，研究者通过讨论达成一致；若仍有分歧，则邀请第三位研究者裁决。', status: 'accepted', highlighted: true },
  { id: 'p-06', section: '3 结果', number: '6.', text: '初步结果显示，辅助工具缩短了首次响应时间，但没有显著降低维护者处理复杂议题的认知负担。', original: '初步结果显示，辅助工具缩短了首次响应时间，但其对复杂议题处理时长与自我报告认知负担的影响仍需进一步检验。', status: 'open', highlighted: true },
  { id: 'p-07', section: '3 结果', number: '7.', text: '在高活跃度项目中，维护者更关注建议是否可验证，而非建议生成速度。', original: '在高活跃度项目中，维护者更关注建议是否可验证，而非建议生成速度。', status: 'open', highlighted: false },
]
const baseComments: Comment[] = [
  { id: 'c-01', roundId: 'wb-r2', paragraphId: 'p-02', author: '审稿人 A', role: 'reviewer', type: 'suggestion', quote: '其真实维护工作流中的影响', body: '建议把“影响”具体化为可观察指标。', suggestion: '近年来，大型语言模型被广泛用于代码生成与缺陷定位，但在真实维护工作流中究竟改变了哪些协作行为，仍缺少系统证据。', status: 'open', replies: [{ id: 'r-01', author: '作者', role: 'author', body: '可以，修改后会补充指标定义。', createdAt: Date.now() - 7200000 }], createdAt: Date.now() - 86400000 },
  { id: 'c-02', roundId: 'wb-r2', paragraphId: 'p-02', author: '审稿人 B', role: 'reviewer', type: 'comment', quote: '缺少系统证据', body: '这里的“系统证据”范围过大，建议限定为本研究覆盖的议题语料。', status: 'open', replies: [], createdAt: Date.now() - 64000000 },
  { id: 'c-03', roundId: 'wb-r2', paragraphId: 'p-03', author: '审稿人 A', role: 'reviewer', type: 'comment', quote: '26 位核心维护者', body: '请说明抽样方式和地域分布，避免样本选择偏差。', status: 'open', replies: [], createdAt: Date.now() - 54000000 },
  { id: 'c-04', roundId: 'wb-r2', paragraphId: 'p-04', author: '审稿人 C', role: 'reviewer', type: 'comment', quote: '两名研究者独立完成', body: '建议报告编码者间一致性系数，并明确不一致处理规则。', status: 'open', replies: [], createdAt: Date.now() - 48000000 },
  { id: 'c-05', roundId: 'wb-r2', paragraphId: 'p-05', author: '审稿人 D', role: 'reviewer', type: 'comment', quote: '邀请第三位研究者裁决', body: '与上一段重复：都在说明编码分歧如何解决，建议合并意见。', status: 'open', replies: [], createdAt: Date.now() - 43000000 },
  { id: 'c-06', roundId: 'wb-r2', paragraphId: 'p-06', author: '审稿人 B', role: 'reviewer', type: 'suggestion', quote: '但没有显著降低维护者处理复杂议题的认知负担', body: '“显著”需要给出统计检验与效应量。', suggestion: '初步结果显示，辅助工具缩短了首次响应时间，但对复杂议题处理时长与自我报告认知负担均未产生统计显著影响。', status: 'open', replies: [], createdAt: Date.now() - 36000000 },
]

const days = (n: number) => n * 86400000
const now = Date.now()
const baseRounds: ReviewRound[] = [
  {
    id: 'wb-r1',
    submissionId: SUBMISSION_ID,
    roundNumber: 1,
    decision: 'major_revision',
    deadline: now - days(30),
    state: 'closed',
    opinions: [
      { id: 'op-101', reviewer: '审稿人 A', body: '建议补充编码者间一致性系数，并说明抽样方式与地域分布。', createdAt: now - days(45) },
      { id: 'op-102', reviewer: '审稿人 B', body: '议题生命周期三阶段（响应、评审、合并）的划分需要理论依据。', createdAt: now - days(44) },
    ],
    receiptId: 'rcp-r1',
    syncState: 'synced',
    mismatches: [],
    editorDisposition: null,
    createdAt: now - days(45),
    syncedAt: now - days(30),
  },
  {
    id: 'wb-r2',
    submissionId: SUBMISSION_ID,
    roundNumber: 2,
    decision: 'major_revision', // 工作台未更新；投审系统为「小修」，对账时以系统为准
    deadline: now - days(5),
    state: 'closed',
    opinions: [
      { id: 'op-201', reviewer: '审稿人 A', body: '上一轮意见已基本回应，仍需补充效应量报告与统计检验。', createdAt: now - days(16) },
      { id: 'op-202', reviewer: '审稿人 C', body: '建议把“系统证据”范围限定为本研究覆盖的议题语料后再报告结论。', createdAt: now - days(15) },
    ],
    receiptId: 'rcp-r2',
    syncState: 'synced',
    mismatches: [],
    editorDisposition: null,
    createdAt: now - days(16),
    syncedAt: now - days(5),
  },
  {
    id: 'wb-r4',
    submissionId: SUBMISSION_ID,
    roundNumber: 4,
    decision: 'pending',
    deadline: null,
    state: 'open',
    opinions: [],
    receiptId: null,
    syncState: 'pending_push',
    mismatches: [],
    editorDisposition: null,
    createdAt: now - days(2),
    syncedAt: null,
  },
]

const seed = typeof localStorage !== 'undefined' ? localStorage.getItem(DRAFT_KEY) : null
const parsed = seed ? JSON.parse(seed) as Partial<{ paragraphs: Paragraph[]; comments: Comment[]; versions: Version[]; rounds: ReviewRound[] }> : null
const initialParagraphs = parsed?.paragraphs?.length ? parsed.paragraphs : baseParagraphs
const initialComments = parsed?.comments?.length ? parsed.comments : baseComments
const initialRounds: ReviewRound[] = parsed?.rounds?.length ? parsed.rounds : baseRounds
const initialVersions: Version[] = parsed?.versions?.length ? parsed.versions : [
  { id: 'v-01', label: '投稿初稿 v1', createdAt: Date.now() - 1209600000, paragraphs: JSON.parse(JSON.stringify(baseParagraphs)) as Paragraph[] },
  { id: 'v-02', label: '审阅基线 v2', createdAt: Date.now() - 172800000, paragraphs: JSON.parse(JSON.stringify(baseParagraphs.map((p) => p.id === 'p-04' ? { ...p, text: `${p.text} 编码规则在预注册方案中说明。` } : p))) as Paragraph[] },
]

const persistDraft = (paragraphs: Paragraph[], comments: Comment[], versions: Version[], rounds: ReviewRound[]) => {
  localStorage.setItem(DRAFT_KEY, JSON.stringify({ paragraphs, comments, versions, rounds }))
}
const clone = <T,>(value: T): T => JSON.parse(JSON.stringify(value)) as T

// —— 对账纯函数 ——

const mergeOpinions = (local: AttachedOpinion[], remote: AttachedOpinion[]): AttachedOpinion[] => {
  const ids = new Set(local.map((opinion) => opinion.id))
  return [...local, ...remote.filter((opinion) => !ids.has(opinion.id))]
}

const countOpenComments = (comments: Comment[], roundId: string): number =>
  comments.filter((comment) => comment.roundId === roundId && comment.status === 'open').length

const formatDeadline = (value: number | null): string =>
  value === null ? '未设定' : new Date(value).toLocaleString('zh-CN', { year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' })

// 拉取投审系统对账单，按回执幂等合并：决定/截止时间/状态以系统为准，正文批注不动，对不上的圈出
function mergeSystemRounds(local: ReviewRound[], remote: SubmissionRound[], comments: Comment[]): { rounds: ReviewRound[]; created: number; updated: number } {
  const rounds = local.map((round) => ({
    ...round,
    opinions: round.opinions.map((opinion) => ({ ...opinion })),
    mismatches: round.mismatches.map((mismatch) => ({ ...mismatch })),
  }))
  let created = 0
  let updated = 0
  for (const sys of remote) {
    let index = rounds.findIndex((round) => round.receiptId !== null && round.receiptId === sys.receiptId)
    if (index < 0) index = rounds.findIndex((round) => round.receiptId === null && round.submissionId === sys.submissionId && round.roundNumber === sys.roundNumber)
    if (index < 0) {
      rounds.push({
        id: sys.id,
        submissionId: sys.submissionId,
        roundNumber: sys.roundNumber,
        decision: sys.decision,
        deadline: sys.deadline,
        state: sys.state,
        opinions: sys.opinions.map((opinion) => ({ ...opinion })),
        receiptId: sys.receiptId,
        syncState: 'synced',
        mismatches: [],
        editorDisposition: null,
        createdAt: sys.updatedAt,
        syncedAt: Date.now(),
      })
      created += 1
      continue
    }
    const current = rounds[index]
    const mismatches: RoundMismatch[] = []
    if (current.decision !== sys.decision) {
      mismatches.push({ type: 'decision', localLabel: DECISION_LABEL[current.decision], remoteLabel: DECISION_LABEL[sys.decision] })
    }
    if (current.deadline !== sys.deadline) {
      mismatches.push({ type: 'deadline', localLabel: formatDeadline(current.deadline), remoteLabel: formatDeadline(sys.deadline) })
    }
    const openCount = countOpenComments(comments, current.id)
    if (sys.state === 'closed' && openCount > 0 && current.editorDisposition === null) {
      mismatches.push({ type: 'open_comments', openCount })
    }
    rounds[index] = {
      ...current,
      decision: sys.decision,
      deadline: sys.deadline,
      state: sys.state,
      opinions: mergeOpinions(current.opinions, sys.opinions),
      receiptId: sys.receiptId,
      syncedAt: Date.now(),
      mismatches,
      syncState: mismatches.length > 0 ? 'mismatch' : 'synced',
    }
    updated += 1
  }
  return { rounds, created, updated }
}

// 推送没送成的回合：已有回执的不重发；回执号由工作台回合 id 确定性生成，重试幂等
async function pushPendingRounds(rounds: ReviewRound[]): Promise<{ rounds: ReviewRound[]; pushed: number; skipped: number }> {
  let pushed = 0
  let skipped = 0
  const next: ReviewRound[] = []
  for (const round of rounds) {
    if (round.receiptId !== null) { skipped += 1; next.push(round); continue }
    const receiptId = `rcp-wb-${round.id}`
    await pushRoundToSubmission({
      submissionId: round.submissionId,
      roundNumber: round.roundNumber,
      decision: round.decision,
      deadline: round.deadline,
      state: round.state,
      opinions: round.opinions,
      receiptId,
    })
    next.push({ ...round, receiptId, syncState: 'synced', syncedAt: Date.now() })
    pushed += 1
  }
  return { rounds: next, pushed, skipped }
}

export interface ReconcileReport {
  pushed: number
  skipped: number
  created: number
  updated: number
  mismatchCount: number
}

interface ReviewState {
  role: Role
  paragraphs: Paragraph[]
  comments: Comment[]
  versions: Version[]
  submissionId: string
  rounds: ReviewRound[]
  systemAvailable: boolean
  reconcileStatus: 'idle' | 'working' | 'succeeded' | 'failed'
  reconcileError: string | null
  reconcileReport: ReconcileReport | null
  lastReconcileAt: number | null
  selectedParagraphId: string
  commentFilter: 'all' | 'open' | 'suggestion' | 'duplicate'
  revisionMode: boolean
  dirty: boolean
  conflicts: EditConflict[]
  past: { paragraphs: Paragraph[]; comments: Comment[]; versions: Version[] }[]
  future: { paragraphs: Paragraph[]; comments: Comment[]; versions: Version[] }[]
  setRole: (role: Role) => void
  selectParagraph: (id: string) => void
  setCommentFilter: (filter: ReviewState['commentFilter']) => void
  setRevisionMode: (value: boolean) => void
  updateParagraph: (id: string, text: string) => void
  addComment: (input: Pick<Comment, 'paragraphId' | 'type' | 'quote' | 'body' | 'suggestion'>) => void
  replyComment: (commentId: string, body: string) => void
  resolveSuggestion: (commentId: string, accepted: boolean) => void
  mergeComment: (commentId: string, targetId: string) => void
  toggleLock: (paragraphId: string) => void
  createVersion: (label: string) => void
  addConflict: (conflict: EditConflict) => void
  resolveConflict: (conflictId: string, strategy: 'local' | 'remote') => void
  dismissConflict: (conflictId: string) => void
  reconcile: () => Promise<void>
  setSystemAvailable: (available: boolean) => void
  acknowledgeRound: (roundId: string) => void
  resolveRoundComments: (roundId: string, disposition: RoundEditorDisposition) => boolean
  addRound: () => void
  undo: () => void
  redo: () => void
  save: () => void
  resetDemo: () => void
}

export const useReviewStore = create<ReviewState>((set, get) => {
  const record = (producer: (state: ReviewState) => Partial<ReviewState>) => set((state) => {
    const history = { paragraphs: clone(state.paragraphs), comments: clone(state.comments), versions: clone(state.versions) }
    const next = producer(state)
    const paragraphs = next.paragraphs ?? state.paragraphs
    const comments = next.comments ?? state.comments
    const versions = next.versions ?? state.versions
    persistDraft(paragraphs, comments, versions, state.rounds)
    return { ...next, past: [...state.past.slice(-49), history], future: [], dirty: true }
  })

  const commitRounds = (producer: (rounds: ReviewRound[]) => ReviewRound[]) => set((state) => {
    const rounds = producer(state.rounds)
    persistDraft(state.paragraphs, state.comments, state.versions, rounds)
    return { rounds }
  })

  return {
    role: 'reviewer',
    paragraphs: initialParagraphs,
    comments: initialComments,
    versions: initialVersions,
    submissionId: SUBMISSION_ID,
    rounds: initialRounds,
    systemAvailable: isSubmissionSystemAvailable(),
    reconcileStatus: 'idle',
    reconcileError: null,
    reconcileReport: null,
    lastReconcileAt: null,
    selectedParagraphId: 'p-02',
    commentFilter: 'all',
    revisionMode: false,
    dirty: false,
    conflicts: [],
    past: [],
    future: [],
    setRole: (role) => set({ role, selectedParagraphId: get().paragraphs[0]?.id ?? '' }),
    selectParagraph: (selectedParagraphId) => set({ selectedParagraphId }),
    setCommentFilter: (commentFilter) => set({ commentFilter }),
    setRevisionMode: (revisionMode) => set({ revisionMode }),
    updateParagraph: (paragraphId, text) => record((state) => ({
      paragraphs: state.paragraphs.map((paragraph) => paragraph.id === paragraphId && paragraph.status !== 'locked'
        ? { ...paragraph, text, status: 'open' as const, highlighted: true }
        : paragraph),
    })),
    addComment: (input) => record((state) => ({
      comments: [{
        ...input,
        id: id('comment'),
        roundId: state.rounds.find((round) => round.state === 'open')?.id ?? state.rounds[0]?.id,
        author: state.role === 'reviewer' ? '审稿人 A' : state.role === 'author' ? '作者' : '编辑',
        role: state.role,
        status: 'open',
        replies: [],
        createdAt: Date.now(),
      }, ...state.comments],
    })),
    replyComment: (commentId, body) => record((state) => ({
      comments: state.comments.map((comment) => comment.id === commentId ? {
        ...comment,
        replies: [...comment.replies, { id: id('reply'), author: state.role === 'author' ? '作者' : state.role === 'reviewer' ? '审稿人 A' : '编辑', role: state.role, body, createdAt: Date.now() } as Reply],
      } : comment),
    })),
    resolveSuggestion: (commentId, accepted) => record((state) => {
      const comment = state.comments.find((item) => item.id === commentId)
      return {
        comments: state.comments.map((item) => item.id === commentId ? { ...item, status: accepted ? 'accepted' : 'rejected' } : item),
        paragraphs: comment?.suggestion && accepted
          ? state.paragraphs.map((paragraph) => paragraph.id === comment.paragraphId ? { ...paragraph, text: comment.suggestion as string, status: 'accepted' } : paragraph)
          : state.paragraphs,
      }
    }),
    mergeComment: (commentId, targetId) => record((state) => ({
      comments: state.comments.map((comment) => comment.id === commentId ? { ...comment, status: 'merged', mergedInto: targetId } : comment),
    })),
    toggleLock: (paragraphId) => record((state) => ({
      paragraphs: state.paragraphs.map((paragraph) => paragraph.id === paragraphId ? {
        ...paragraph,
        status: paragraph.status === 'locked' ? 'accepted' : 'locked',
      } : paragraph),
    })),
    createVersion: (label) => record((state) => ({
      versions: [{ id: id('version'), label: label.trim() || `版本 ${state.versions.length + 1}`, createdAt: Date.now(), paragraphs: clone(state.paragraphs) }, ...state.versions],
    })),
    addConflict: (conflict) => set((state) => ({ conflicts: [conflict, ...state.conflicts] })),
    resolveConflict: (conflictId, strategy) => record((state) => {
      const conflict = state.conflicts.find((item) => item.id === conflictId)
      return {
        paragraphs: conflict && strategy === 'remote'
          ? state.paragraphs.map((paragraph) => paragraph.id === conflict.paragraphId ? { ...paragraph, text: conflict.remoteText, highlighted: true } : paragraph)
          : state.paragraphs,
        conflicts: state.conflicts.filter((item) => item.id !== conflictId),
      }
    }),
    dismissConflict: (conflictId) => set((state) => ({ conflicts: state.conflicts.filter((item) => item.id !== conflictId) })),
    reconcile: async () => {
      set({ reconcileStatus: 'working', reconcileError: null })
      try {
        // 1. 先补没送成的回合（工作台 → 投审系统）；已有回执的不重发，工作台草稿不动
        const pushResult = await pushPendingRounds(get().rounds)
        set((state) => {
          persistDraft(state.paragraphs, state.comments, state.versions, pushResult.rounds)
          return { rounds: pushResult.rounds }
        })
        // 2. 再拉取投审系统对账单，按回执幂等合并（同一份回执再拉一次不多出回合）
        const remote = await fetchSubmissionRounds(SUBMISSION_ID)
        const merged = mergeSystemRounds(get().rounds, remote, get().comments)
        const mismatchCount = merged.rounds.filter((round) => round.mismatches.length > 0).length
        set((state) => {
          persistDraft(state.paragraphs, state.comments, state.versions, merged.rounds)
          return {
            rounds: merged.rounds,
            reconcileStatus: 'succeeded',
            lastReconcileAt: Date.now(),
            reconcileReport: {
              pushed: pushResult.pushed,
              skipped: pushResult.skipped,
              created: merged.created,
              updated: merged.updated,
              mismatchCount,
            },
          }
        })
      } catch (error) {
        // 对账失败：工作台状态原样保留，可按工作台这侧重试
        set({ reconcileStatus: 'failed', reconcileError: error instanceof Error ? error.message : '对账失败' })
      }
    },
    setSystemAvailable: (available) => {
      setSubmissionSystemAvailable(available)
      set({ systemAvailable: available })
    },
    acknowledgeRound: (roundId) => commitRounds((rounds) => rounds.map((round) => round.id === roundId
      ? { ...round, mismatches: [], syncState: 'synced' }
      : round)),
    resolveRoundComments: (roundId, disposition) => {
      const state = get()
      const round = state.rounds.find((item) => item.id === roundId)
      if (!round) return false
      let comments = state.comments
      if (disposition === 'carry_over') {
        const target = state.rounds.find((item) => item.submissionId === round.submissionId && item.roundNumber === round.roundNumber + 1)
        if (!target) return false
        comments = state.comments.map((comment) => comment.roundId === roundId ? { ...comment, roundId: target.id } : comment)
      }
      const rounds = state.rounds.map<ReviewRound>((item) => {
        if (item.id !== roundId) return item
        const mismatches = item.mismatches.filter((mismatch) => mismatch.type !== 'open_comments')
        return { ...item, editorDisposition: disposition, mismatches, syncState: mismatches.length > 0 ? 'mismatch' : 'synced' }
      })
      persistDraft(state.paragraphs, comments, state.versions, rounds)
      set({ comments, rounds })
      return true
    },
    addRound: () => commitRounds((rounds) => {
      const roundNumber = rounds.reduce((max, round) => Math.max(max, round.roundNumber), 0) + 1
      return [{
        id: id('round'),
        submissionId: SUBMISSION_ID,
        roundNumber,
        decision: 'pending',
        deadline: null,
        state: 'open',
        opinions: [],
        receiptId: null,
        syncState: 'pending_push',
        mismatches: [],
        editorDisposition: null,
        createdAt: Date.now(),
        syncedAt: null,
      }, ...rounds]
    }),
    undo: () => set((state) => {
      const previous = state.past.at(-1)
      if (!previous) return state
      const current = { paragraphs: clone(state.paragraphs), comments: clone(state.comments), versions: clone(state.versions) }
      persistDraft(previous.paragraphs, previous.comments, previous.versions, state.rounds)
      return { ...previous, past: state.past.slice(0, -1), future: [current, ...state.future], dirty: true }
    }),
    redo: () => set((state) => {
      const next = state.future[0]
      if (!next) return state
      const current = { paragraphs: clone(state.paragraphs), comments: clone(state.comments), versions: clone(state.versions) }
      persistDraft(next.paragraphs, next.comments, next.versions, state.rounds)
      return { ...next, past: [...state.past, current], future: state.future.slice(1), dirty: true }
    }),
    save: () => {
      persistDraft(get().paragraphs, get().comments, get().versions, get().rounds)
      set({ dirty: false })
    },
    resetDemo: () => {
      localStorage.removeItem(DRAFT_KEY)
      set({
        paragraphs: clone(baseParagraphs),
        comments: clone(baseComments),
        versions: clone(initialVersions),
        rounds: clone(baseRounds),
        reconcileStatus: 'idle',
        reconcileError: null,
        reconcileReport: null,
        lastReconcileAt: null,
        systemAvailable: true,
        conflicts: [],
        past: [],
        future: [],
        dirty: false,
      })
      persistDraft(baseParagraphs, baseComments, initialVersions, baseRounds)
    },
  }
})
