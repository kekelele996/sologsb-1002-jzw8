import { create } from 'zustand'
import type {
  Comment, EditConflict, Paragraph, Reply, ReviewRound, Role, RoundAdjudication, Version,
} from '../types'
import { SUBMISSION_ID, submissionSystem } from '../services/submissionSystem'
import { reconcileRounds } from '../services/reconcile'
import type { ReconcileResult } from '../services/reconcile'

const DRAFT_KEY = 'sologsb-1002-draft-v2'
const id = (prefix: string) => `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`
const DAY = 86400000

const baseParagraphs: Paragraph[] = [
  { id: 'p-01', section: '摘要', number: '1.', text: '开源软件供应链的稳定性不仅取决于代码质量，也取决于维护者能否持续识别并回应社区需求。', original: '开源软件供应链的稳定性不仅取决于代码质量，也取决于维护者能否持续识别并回应社区需求。', status: 'accepted', highlighted: false },
  { id: 'p-02', section: '1 引言', number: '2.', text: '近年来，大型语言模型被广泛用于代码生成与缺陷定位，但其在真实维护工作流中的影响仍缺少系统证据。', original: '近年来，大型语言模型被广泛用于代码生成与缺陷定位，但其在真实维护工作流中的影响仍缺少系统证据。', status: 'open', highlighted: true },
  { id: 'p-03', section: '1 引言', number: '3.', text: '本文收集 12 个活跃开源项目连续 18 个月的议题记录，并访谈 26 位核心维护者。', original: '本文收集 12 个活跃开源项目连续 18 个月的议题记录，并访谈 26 位核心维护者。', status: 'open', highlighted: true },
  { id: 'p-04', section: '2 方法', number: '4.', text: '我们采用混合研究方法，将议题生命周期划分为响应、评审与合并三个阶段。编码过程由两名研究者独立完成。', original: '我们采用混合研究方法，将议题生命周期划分为响应、评审与合并三个阶段。编码过程由两名研究者独立完成。', status: 'open', highlighted: false },
  { id: 'p-05', section: '2 方法', number: '5.', text: '当编码结果不一致时，研究者通过讨论达成一致；若仍有分歧，则邀请第三位研究者裁决。', original: '当编码结果不一致时，研究者通过讨论达成一致；若仍有分歧，则邀请第三位研究者裁决。', status: 'accepted', highlighted: true },
  { id: 'p-06', section: '3 结果', number: '6.', text: '初步结果显示，辅助工具缩短了首次响应时间，但没有显著降低维护者处理复杂议题的认知负担。', original: '初步结果显示，辅助工具缩短了首次响应时间，但没有显著降低维护者处理复杂议题的认知负担。', status: 'open', highlighted: true },
  { id: 'p-07', section: '3 结果', number: '7.', text: '在高活跃度项目中，维护者更关注建议是否可验证，而非建议生成速度。', original: '在高活跃度项目中，维护者更关注建议是否可验证，而非建议生成速度。', status: 'open', highlighted: false },
]
const baseComments: Comment[] = [
  { id: 'c-01', paragraphId: 'p-02', roundNo: 1, author: '审稿人 A', role: 'reviewer', type: 'suggestion', quote: '其真实维护工作流中的影响', body: '建议把“影响”具体化为可观察指标。', suggestion: '近年来，大型语言模型被广泛用于代码生成与缺陷定位，但在真实维护工作流中究竟改变了哪些协作行为，仍缺少系统证据。', status: 'open', replies: [{ id: 'r-01', author: '作者', role: 'author', body: '可以，修改后会补充指标定义。', createdAt: Date.now() - 7200000 }], createdAt: Date.now() - 86400000 },
  { id: 'c-02', paragraphId: 'p-02', roundNo: 1, author: '审稿人 B', role: 'reviewer', type: 'comment', quote: '缺少系统证据', body: '这里的“系统证据”范围过大，建议限定为本研究覆盖的议题语料。', status: 'open', replies: [], createdAt: Date.now() - 64000000 },
  { id: 'c-03', paragraphId: 'p-03', roundNo: 1, author: '审稿人 A', role: 'reviewer', type: 'comment', quote: '26 位核心维护者', body: '请说明抽样方式和地域分布，避免样本选择偏差。', status: 'open', replies: [], createdAt: Date.now() - 54000000 },
  { id: 'c-04', paragraphId: 'p-04', roundNo: 1, author: '审稿人 C', role: 'reviewer', type: 'comment', quote: '两名研究者独立完成', body: '建议报告编码者间一致性系数，并明确不一致处理规则。', status: 'open', replies: [], createdAt: Date.now() - 48000000 },
  { id: 'c-05', paragraphId: 'p-05', roundNo: 1, author: '审稿人 D', role: 'reviewer', type: 'comment', quote: '邀请第三位研究者裁决', body: '与上一段重复：都在说明编码分歧如何解决，建议合并意见。', status: 'open', replies: [], createdAt: Date.now() - 43000000 },
  { id: 'c-06', paragraphId: 'p-06', roundNo: 2, author: '审稿人 B', role: 'reviewer', type: 'suggestion', quote: '但没有显著降低维护者处理复杂议题的认知负担', body: '“显著”需要给出统计检验与效应量。', suggestion: '初步结果显示，辅助工具缩短了首次响应时间，但对复杂议题处理时长与自我报告认知负担均未产生统计显著影响。', status: 'open', replies: [], createdAt: Date.now() - 36000000 },
]

/**
 * 工作台侧回合台账：编辑过去靠翻邮件记录的评审回合信息。
 * 此时还没和投审系统对账（local-only），决定与截止时间都是邮件口径。
 */
const buildBaseRounds = (): ReviewRound[] => [
  {
    roundNo: 1,
    stage: 'closed',
    decision: 'minor',
    deadline: Date.now() - 22 * DAY,
    notes: [
      { id: 'mail-r1-1', author: '编委', body: '请在修回说明里逐条回应两位审稿人意见。', attachedAt: Date.now() - 39 * DAY },
    ],
    localDecision: 'minor',
    localDeadline: Date.now() - 22 * DAY,
    localTouchedAt: Date.now() - 30 * DAY,
    mismatches: [],
    bothTouched: false,
    needsAdjudication: false,
    state: 'local-only',
  },
  {
    roundNo: 2,
    stage: 'open',
    decision: 'minor',
    deadline: Date.now() + 9 * DAY,
    notes: [
      { id: 'mail-r2-1', author: '审稿人 B', body: '统计检验部分已补充，但效应量仍需在表注中说明。', attachedAt: Date.now() - 9 * DAY },
    ],
    localDecision: 'minor',
    localDeadline: Date.now() + 9 * DAY,
    localTouchedAt: Date.now() - 7 * DAY,
    mismatches: [],
    bothTouched: false,
    needsAdjudication: false,
    state: 'local-only',
  },
]
const baseRounds = buildBaseRounds()

export type SubmissionSyncStatus = 'idle' | 'syncing' | 'synced' | 'degraded'

export interface SubmissionSync {
  submissionId: string
  status: SubmissionSyncStatus
  lastSyncedAt?: number
  lastError?: string
  retryCount: number
  /** 已成功送达的回执编号（与 rounds[].receiptId 互为冗余，刷新后仍不重复并回合） */
  deliveredReceipts: string[]
}

interface DraftShape {
  paragraphs?: Paragraph[]
  comments?: Comment[]
  versions?: Version[]
  rounds?: ReviewRound[]
  submission?: SubmissionSync
}

const seed = typeof localStorage !== 'undefined' ? localStorage.getItem(DRAFT_KEY) : null
const parsed: DraftShape = seed ? JSON.parse(seed) as DraftShape : {}
const initialParagraphs = parsed.paragraphs?.length ? parsed.paragraphs : baseParagraphs
const initialComments = parsed.comments?.length ? parsed.comments : baseComments
const initialRounds = parsed.rounds?.length ? parsed.rounds : baseRounds
const initialVersions: Version[] = parsed.versions ?? [
  { id: 'v-01', label: '投稿初稿 v1', createdAt: Date.now() - 1209600000, paragraphs: JSON.parse(JSON.stringify(baseParagraphs)) as Paragraph[] },
  { id: 'v-02', label: '审阅基线 v2', createdAt: Date.now() - 172800000, paragraphs: JSON.parse(JSON.stringify(baseParagraphs.map((p) => p.id === 'p-04' ? { ...p, text: `${p.text} 编码规则在预注册方案中说明。` } : p))) as Paragraph[] },
]
const initialSubmission: SubmissionSync = parsed.submission ?? {
  submissionId: SUBMISSION_ID, status: 'idle', retryCount: 0, deliveredReceipts: [],
}

const persistDraft = (state: { paragraphs: Paragraph[]; comments: Comment[]; versions: Version[]; rounds: ReviewRound[]; submission: SubmissionSync }) => {
  localStorage.setItem(DRAFT_KEY, JSON.stringify({
    paragraphs: state.paragraphs, comments: state.comments, versions: state.versions,
    rounds: state.rounds, submission: state.submission,
  }))
}
const clone = <T,>(value: T): T => JSON.parse(JSON.stringify(value)) as T

const wait = (milliseconds: number) => new Promise((resolve) => setTimeout(resolve, milliseconds))

interface ReviewState {
  role: Role
  paragraphs: Paragraph[]
  comments: Comment[]
  versions: Version[]
  rounds: ReviewRound[]
  submission: SubmissionSync
  selectedParagraphId: string
  commentFilter: 'all' | 'open' | 'suggestion' | 'duplicate'
  revisionMode: boolean
  dirty: boolean
  conflicts: EditConflict[]
  past: { paragraphs: Paragraph[]; comments: Comment[]; versions: Version[]; rounds: ReviewRound[] }[]
  future: { paragraphs: Paragraph[]; comments: Comment[]; versions: Version[]; rounds: ReviewRound[] }[]
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
  /** 按投稿编号与投审系统对账；失败时按工作台侧重试，最终降级为工作台优先 */
  reconcileWithSubmission: () => Promise<{ ok: boolean; result?: ReconcileResult; error?: string }>
  /** 编辑对单个回合的逐个定夺；正文与批注的处置在这里落到工作台 */
  adjudicateRound: (roundNo: number, decision: RoundAdjudication) => void
  undo: () => void
  redo: () => void
  save: () => void
  resetDemo: () => void
}

export const useReviewStore = create<ReviewState>((set, get) => {
  const record = (producer: (state: ReviewState) => Partial<ReviewState>) => set((state) => {
    const history = { paragraphs: clone(state.paragraphs), comments: clone(state.comments), versions: clone(state.versions), rounds: clone(state.rounds) }
    const next = producer(state)
    const paragraphs = next.paragraphs ?? state.paragraphs
    const comments = next.comments ?? state.comments
    const versions = next.versions ?? state.versions
    const rounds = next.rounds ?? state.rounds
    persistDraft({ paragraphs, comments, versions, rounds, submission: state.submission })
    return { ...next, past: [...state.past.slice(-49), history], future: [], dirty: true }
  })

  return {
    role: 'reviewer',
    paragraphs: initialParagraphs,
    comments: initialComments,
    versions: initialVersions,
    rounds: initialRounds,
    submission: initialSubmission,
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
        // 新批注挂到当前最新一轮（没有台账时默认第 1 轮）
        roundNo: state.rounds.length ? Math.max(...state.rounds.map((round) => round.roundNo)) : 1,
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

    reconcileWithSubmission: async () => {
      if (get().submission.status === 'syncing') return { ok: false, error: '正在对账中' }

      // 降级前把还没对成账的回合挂起：恢复后只补这些回合
      const markDegraded = (error: string, retryCount: number) => set((state) => {
        const rounds = state.rounds.map((round) => (round.receiptId ? round : { ...round, state: 'pending-delivery' as const }))
        const submission: SubmissionSync = { ...state.submission, status: 'degraded', lastError: error, retryCount }
        persistDraft({ ...state, rounds, submission })
        return { rounds, submission }
      })

      set((state) => ({ submission: { ...state.submission, status: 'syncing', lastError: undefined } }))

      const maxAttempts = 3
      let lastError = '投审系统不可达'
      for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
        try {
          const remote = await submissionSystem.fetchRounds(get().submission.submissionId)
          const state = get()
          const result = reconcileRounds({ localRounds: state.rounds, comments: state.comments, remote })
          const submission: SubmissionSync = {
            ...state.submission,
            status: 'synced',
            lastSyncedAt: Date.now(),
            lastError: undefined,
            retryCount: 0,
            deliveredReceipts: Array.from(new Set([...state.submission.deliveredReceipts, ...result.deliveredReceipts])),
          }
          persistDraft({ ...state, rounds: result.rounds, submission })
          set({ rounds: result.rounds, submission })
          return { ok: true, result }
        } catch (error) {
          lastError = error instanceof Error ? error.message : String(error)
          // 先按工作台这侧重试：工作台数据保持权威，等下一次拉取
          if (attempt < maxAttempts) await wait(500)
        }
      }
      markDegraded(lastError, maxAttempts)
      return { ok: false, error: lastError }
    },

    adjudicateRound: (roundNo, decision) => record((state) => {
      const round = state.rounds.find((item) => item.roundNo === roundNo)
      if (!round || !round.needsAdjudication) return {}
      // “转入下一轮”需要有下一轮可挂；否则不动批注
      const hasNextRound = state.rounds.some((item) => item.roundNo === roundNo + 1)
      const comments = decision === 'close'
        ? state.comments.map((comment) => (comment.roundNo === roundNo && comment.status === 'open' ? { ...comment, status: 'closed' as const } : comment))
        : decision === 'next' && hasNextRound
          ? state.comments.map((comment) => (comment.roundNo === roundNo && comment.status === 'open' ? { ...comment, roundNo: roundNo + 1 } : comment))
          : state.comments
      return {
        comments,
        rounds: state.rounds.map((item) => (item.roundNo === roundNo
          ? { ...item, needsAdjudication: false, adjudication: decision, adjudicationAt: Date.now() }
          : item)),
      }
    }),

    undo: () => set((state) => {
      const previous = state.past.at(-1)
      if (!previous) return state
      const current = { paragraphs: clone(state.paragraphs), comments: clone(state.comments), versions: clone(state.versions), rounds: clone(state.rounds) }
      persistDraft({ ...previous, submission: state.submission })
      return { ...previous, past: state.past.slice(0, -1), future: [current, ...state.future], dirty: true }
    }),
    redo: () => set((state) => {
      const next = state.future[0]
      if (!next) return state
      const current = { paragraphs: clone(state.paragraphs), comments: clone(state.comments), versions: clone(state.versions), rounds: clone(state.rounds) }
      persistDraft({ ...next, submission: state.submission })
      return { ...next, past: [...state.past, current], future: state.future.slice(1), dirty: true }
    }),
    save: () => {
      persistDraft(get())
      set({ dirty: false })
    },
    resetDemo: () => {
      submissionSystem.reset()
      const freshRounds = buildBaseRounds()
      const freshSubmission: SubmissionSync = { submissionId: SUBMISSION_ID, status: 'idle', retryCount: 0, deliveredReceipts: [] }
      set({
        paragraphs: clone(baseParagraphs), comments: clone(baseComments), versions: clone(initialVersions),
        rounds: freshRounds, submission: freshSubmission,
        conflicts: [], past: [], future: [], dirty: false,
      })
      persistDraft({ paragraphs: baseParagraphs, comments: baseComments, versions: initialVersions, rounds: freshRounds, submission: freshSubmission })
    },
  }
})
