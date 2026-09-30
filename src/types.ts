export type Role = 'author' | 'reviewer' | 'editor'
export type ParagraphStatus = 'open' | 'accepted' | 'locked'
export type CommentStatus = 'open' | 'accepted' | 'rejected' | 'merged' | 'closed'
export type CommentType = 'comment' | 'suggestion'

export interface Reply {
  id: string
  author: string
  role: Role
  body: string
  createdAt: number
}

export interface Comment {
  id: string
  paragraphId: string
  /** 所属审阅回合（按投稿编号与投审系统对账的口径） */
  roundNo: number
  author: string
  role: Role
  type: CommentType
  quote: string
  body: string
  suggestion?: string
  status: CommentStatus
  replies: Reply[]
  createdAt: number
  mergedInto?: string
}

export interface Paragraph {
  id: string
  section: string
  number: string
  text: string
  original: string
  status: ParagraphStatus
  highlighted: boolean
}

export interface Version {
  id: string
  label: string
  createdAt: number
  paragraphs: Paragraph[]
}

export interface EditConflict {
  id: string
  paragraphId: string
  localText: string
  remoteText: string
  localAuthor: string
  remoteAuthor: string
  detectedAt: number
}

export interface HistorySnapshot {
  paragraphs: Paragraph[]
  comments: Comment[]
  versions: Version[]
}

/** 投审系统里一个回合的决定 */
export type RoundDecision = 'major' | 'minor' | 'accept' | 'reject' | 'pending'
/** 回合在投审系统里的状态：进行中 / 已结束 */
export type RoundStage = 'open' | 'closed'
/** 编辑对“系统已结束、工作台还压着意见”的回合的逐个定夺 */
export type RoundAdjudication = 'continue' | 'next' | 'close'

/** 随回执附上的意见 */
export interface RoundNote {
  id: string
  author: string
  body: string
  attachedAt: number
}

/** 投审系统返回的回合回执。receiptId 是同一份回执再拉一次也不多出回合的依据 */
export interface SubmissionRound {
  receiptId: string
  roundNo: number
  stage: RoundStage
  decision: RoundDecision
  deadline: number | null
  notes: RoundNote[]
  systemUpdatedAt: number
}

export interface SubmissionResponse {
  submissionId: string
  rounds: SubmissionRound[]
  fetchedAt: number
}

/** 对不上的字段：决定 / 截止时间 */
export interface FieldMismatch {
  field: 'decision' | 'deadline'
  local: string
  remote: string
}

/** 回合在对账链路中的状态 */
export type RoundSyncState =
  | 'local-only'        // 只在工作台（邮件）侧有记录，还没成功对账
  | 'pending-delivery'  // 对账失败，降级挂起，恢复后补送/补拉
  | 'new-remote'        // 投审系统有、工作台没有，首次并入
  | 'matched'           // 两边已对上
  | 'mismatch'          // 决定或截止时间对不上，已圈出

/** 工作台侧保存的回合台账 */
export interface ReviewRound {
  roundNo: number
  stage: RoundStage
  /** 合并后的决定：成功对账后以投审系统为准 */
  decision: RoundDecision
  /** 合并后的截止时间：成功对账后以投审系统为准 */
  deadline: number | null
  notes: RoundNote[]
  /** 已并入的投审系统回执编号；没有说明该回合还没对成账 */
  receiptId?: string
  /** 工作台（邮件）原记录，用于圈差异 */
  localDecision?: RoundDecision
  localDeadline?: number | null
  /** 工作台这侧正文/批注最后动作时间 */
  localTouchedAt: number
  systemUpdatedAt?: number
  pulledAt?: number
  mismatches: FieldMismatch[]
  /** 同一个回合两边都动过：正文与批注依工作台，决定与截止依投审 */
  bothTouched: boolean
  /** 投审系统已结束、工作台仍有未处理完意见，等编辑逐个定夺 */
  needsAdjudication: boolean
  adjudication?: RoundAdjudication
  adjudicationAt?: number
  state: RoundSyncState
}
