import type { SubmissionResponse } from '../types'

const wait = (milliseconds: number) => new Promise((resolve) => setTimeout(resolve, milliseconds))

export const SUBMISSION_ID = 'MS-2026-0417'

const DAY = 86400000
const now = Date.now()

/**
 * 投审系统里的回执台账（评审回合、决定、截止时间、随附意见）。
 * receiptId 是回执的稳定编号：同一份回执再拉一次，receiptId 不变。
 */
const submissionRounds: SubmissionResponse['rounds'] = [
  {
    receiptId: 'rcpt-ms20260417-r1',
    roundNo: 1,
    stage: 'closed',
    decision: 'major',
    deadline: now - 18 * DAY,
    notes: [
      { id: 'n-r1-1', author: '审稿人 A', body: '研究问题需要进一步聚焦，核心构念缺少可操作定义。', attachedAt: now - 41 * DAY },
      { id: 'n-r1-2', author: '审稿人 C', body: '编码流程描述不完整，请补充一致性系数与裁决规则。', attachedAt: now - 40 * DAY },
      { id: 'n-r1-3', author: '编委', body: '请在修回说明里逐条回应两位审稿人意见。', attachedAt: now - 39 * DAY },
    ],
    systemUpdatedAt: now - 39 * DAY,
  },
  {
    receiptId: 'rcpt-ms20260417-r2',
    roundNo: 2,
    stage: 'open',
    decision: 'minor',
    deadline: now + 6 * DAY,
    notes: [
      { id: 'n-r2-1', author: '审稿人 B', body: '统计检验部分已补充，但效应量仍需在表注中说明。', attachedAt: now - 9 * DAY },
      { id: 'n-r2-2', author: '编委', body: '语言问题不多，建议送专业润色后定稿。', attachedAt: now - 8 * DAY },
    ],
    systemUpdatedAt: now - 8 * DAY,
  },
]

/**
 * 恢复后才会出现的新回合：演示“恢复后只补没送成的回合”。
 * 台账在故障期间挂起，恢复时这份回执被首次送达。
 */
const recoveredRound: SubmissionResponse['rounds'][number] = {
  receiptId: 'rcpt-ms20260417-r3',
  roundNo: 3,
  stage: 'open',
  decision: 'minor',
  deadline: now + 20 * DAY,
  notes: [
    { id: 'n-r3-1', author: '编委', body: '二审意见已处理，请按格式核对参考文献。', attachedAt: now - 2 * DAY },
  ],
  systemUpdatedAt: now - 2 * DAY,
}

class SubmissionSystemMock {
  private online = true
  private recovered = false

  /** 模拟投审系统故障：对账请求开始失败，工作台只能按本侧重试/降级 */
  setOffline() {
    this.online = false
  }

  /** 恢复：之后的对账请求成功，并可送达挂起期间的第三轮回执 */
  setOnline(exposeNewRound = false) {
    this.online = true
    if (exposeNewRound) this.recovered = true
  }

  isOnline() {
    return this.online
  }

  reset() {
    this.online = true
    this.recovered = false
  }

  /** 按投稿编号拉取全部回合回执。同一份回执 receiptId 稳定，天然幂等 */
  async fetchRounds(submissionId: string): Promise<SubmissionResponse> {
    await wait(500)
    if (!this.online) {
      throw new Error('投审系统不可达：网络超时（HTTP 503）')
    }
    if (submissionId !== SUBMISSION_ID) {
      throw new Error(`投审系统查无此投稿编号：${submissionId}`)
    }
    const rounds = this.recovered ? [...submissionRounds, recoveredRound] : [...submissionRounds]
    return { submissionId, rounds: JSON.parse(JSON.stringify(rounds)) as SubmissionResponse['rounds'], fetchedAt: Date.now() }
  }
}

/** 浏览器内单例，模拟跨页面的同一套投审系统 */
export const submissionSystem = new SubmissionSystemMock()
