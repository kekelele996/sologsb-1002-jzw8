import type { Paragraph, RoundDecision, RoundState, AttachedOpinion } from '../types'

const wait = (milliseconds: number) => new Promise((resolve) => setTimeout(resolve, milliseconds))

export interface RemotePatch {
  accepted: boolean
  paragraphId: string
  remoteText: string
  remoteAuthor: string
  serverRevision: number
}

export const submitRemotePatch = async (paragraph: Paragraph): Promise<RemotePatch> => {
  await wait(650)
  const remoteText = paragraph.text.includes('然而')
    ? paragraph.text.replace('然而', '但是')
    : `${paragraph.text.replace(/。$/, '')}。作者补充：该结论仅适用于本次样本。`
  return {
    accepted: true,
    paragraphId: paragraph.id,
    remoteText,
    remoteAuthor: '协作者 · 王教授',
    serverRevision: Math.floor(Date.now() / 1000),
  }
}

// —— 投审系统（模拟）：按投稿编号对账，回执幂等 ——

const SYSTEM_KEY = 'sologsb-1002-submission-v1'

export interface SubmissionRound {
  id: string
  submissionId: string
  roundNumber: number
  decision: RoundDecision
  deadline: number | null
  state: RoundState
  opinions: AttachedOpinion[]
  receiptId: string
  updatedAt: number
}

export interface PushRoundInput {
  submissionId: string
  roundNumber: number
  decision: RoundDecision
  deadline: number | null
  state: RoundState
  opinions: AttachedOpinion[]
  receiptId: string
}

const seedSystemRounds = (): SubmissionRound[] => {
  const now = Date.now()
  const days = (n: number) => n * 86400000
  return [
    {
      id: 'sys-r1',
      submissionId: 'MS-2026-0417',
      roundNumber: 1,
      decision: 'major_revision',
      deadline: now - days(30),
      state: 'closed',
      opinions: [
        { id: 'op-101', reviewer: '审稿人 A', body: '建议补充编码者间一致性系数，并说明抽样方式与地域分布。', createdAt: now - days(45) },
        { id: 'op-102', reviewer: '审稿人 B', body: '议题生命周期三阶段（响应、评审、合并）的划分需要理论依据。', createdAt: now - days(44) },
      ],
      receiptId: 'rcp-r1',
      updatedAt: now - days(30),
    },
    {
      id: 'sys-r2',
      submissionId: 'MS-2026-0417',
      roundNumber: 2,
      decision: 'minor_revision',
      deadline: now - days(5),
      state: 'closed',
      opinions: [
        { id: 'op-201', reviewer: '审稿人 A', body: '上一轮意见已基本回应，仍需补充效应量报告与统计检验。', createdAt: now - days(16) },
        { id: 'op-202', reviewer: '审稿人 C', body: '建议把“系统证据”范围限定为本研究覆盖的议题语料后再报告结论。', createdAt: now - days(15) },
      ],
      receiptId: 'rcp-r2',
      updatedAt: now - days(5),
    },
    {
      id: 'sys-r3',
      submissionId: 'MS-2026-0417',
      roundNumber: 3,
      decision: 'pending',
      deadline: now + days(25),
      state: 'open',
      opinions: [
        { id: 'op-301', reviewer: '审稿人 B', body: '复审中：关注新增统计检验的稳健性与结论外推范围。', createdAt: now - days(2) },
      ],
      receiptId: 'rcp-r3',
      updatedAt: now - days(2),
    },
  ]
}

const cloneSystemRounds = (rounds: SubmissionRound[]): SubmissionRound[] =>
  rounds.map((round) => ({ ...round, opinions: round.opinions.map((opinion) => ({ ...opinion })) }))

const loadSystemRounds = (): SubmissionRound[] => {
  try {
    const raw = localStorage.getItem(SYSTEM_KEY)
    if (raw) return cloneSystemRounds(JSON.parse(raw) as SubmissionRound[])
  } catch {
    // 数据损坏时重新播种
  }
  const seeded = seedSystemRounds()
  localStorage.setItem(SYSTEM_KEY, JSON.stringify(seeded))
  return seeded
}

let systemAvailable = true
let systemRounds: SubmissionRound[] = loadSystemRounds()

export const isSubmissionSystemAvailable = () => systemAvailable
export const setSubmissionSystemAvailable = (available: boolean) => {
  systemAvailable = available
}

export const fetchSubmissionRounds = async (submissionId: string): Promise<SubmissionRound[]> => {
  await wait(500)
  if (!systemAvailable) throw new Error('投审系统暂时不可用（模拟故障），对账失败')
  return cloneSystemRounds(systemRounds.filter((round) => round.submissionId === submissionId))
}

// 回执幂等：同一 receiptId 只入库一次，重复推送不重复出回合
export const pushRoundToSubmission = async (input: PushRoundInput): Promise<{ receiptId: string; duplicated: boolean }> => {
  await wait(600)
  if (!systemAvailable) throw new Error('投审系统暂时不可用（模拟故障），回执未生成')
  const existing = systemRounds.find((round) => round.receiptId === input.receiptId)
  if (existing) return { receiptId: existing.receiptId, duplicated: true }
  systemRounds = [...systemRounds, { ...input, id: `sys-${input.receiptId}`, updatedAt: Date.now() }]
  localStorage.setItem(SYSTEM_KEY, JSON.stringify(systemRounds))
  return { receiptId: input.receiptId, duplicated: false }
}
