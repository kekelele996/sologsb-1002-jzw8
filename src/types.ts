export type Role = 'author' | 'reviewer' | 'editor'
export type ParagraphStatus = 'open' | 'accepted' | 'locked'
export type CommentStatus = 'open' | 'accepted' | 'rejected' | 'merged'
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
  roundId?: string
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

// 评审回合决定（投审系统权威）
export type RoundDecision = 'major_revision' | 'minor_revision' | 'accept' | 'reject' | 'pending'
// 回合状态（投审系统权威）
export type RoundState = 'open' | 'closed'
// 回合对账状态
export type RoundSyncState = 'synced' | 'pending_push' | 'mismatch'

// 投审系统随附意见
export interface AttachedOpinion {
  id: string
  reviewer: string
  body: string
  createdAt: number
}

// 对不上、圈给编辑看的项
export type RoundMismatchType = 'decision' | 'deadline' | 'open_comments'
export interface RoundMismatch {
  type: RoundMismatchType
  localLabel?: string
  remoteLabel?: string
  openCount?: number
}

// 编辑对“系统已结束、工作台未收口”回合的定夺
export type RoundEditorDisposition = 'carry_over' | 'mark_handled'

// 评审回合（工作台侧，按投稿编号与投审系统对账合并）
export interface ReviewRound {
  id: string
  submissionId: string
  roundNumber: number
  decision: RoundDecision
  deadline: number | null
  state: RoundState
  opinions: AttachedOpinion[]
  receiptId: string | null
  syncState: RoundSyncState
  mismatches: RoundMismatch[]
  editorDisposition: RoundEditorDisposition | null
  createdAt: number
  syncedAt: number | null
}
