/* 对账逻辑冒烟测试：合并、幂等、失败重试、编辑定夺 */
const store = new Map<string, string>()
const localStorageMock: Storage = {
  getItem: (key: string) => store.get(key) ?? null,
  setItem: (key: string, value: string) => { store.set(key, value) },
  removeItem: (key: string) => { store.delete(key) },
  clear: () => store.clear(),
  key: (index: number) => Array.from(store.keys())[index] ?? null,
  get length() { return store.size },
}
;(globalThis as unknown as { localStorage: Storage }).localStorage = localStorageMock

const { useReviewStore } = await import('../src/store/review')
const { setSubmissionSystemAvailable } = await import('../src/services/mockApi')

const assert = (condition: boolean, message: string) => {
  if (!condition) {
    console.error('FAIL:', message)
    process.exit(1)
  }
  console.log('ok:', message)
}

// 1. 初始状态
let state = useReviewStore.getState()
assert(state.rounds.length === 3, '初始 3 个回合')
assert(state.rounds.find((r) => r.id === 'wb-r2')?.decision === 'major_revision', 'r2 工作台记录为大修（待对账）')
assert(state.rounds.find((r) => r.id === 'wb-r4')?.syncState === 'pending_push', 'r4 未送达')

// 2. 对账：系统正常
await useReviewStore.getState().reconcile()
state = useReviewStore.getState()
assert(state.reconcileStatus === 'succeeded', '对账成功')
assert(state.rounds.length === 4, '对账后 4 个回合（新增 r3）')
const r2 = state.rounds.find((r) => r.id === 'wb-r2')!
assert(r2.decision === 'minor_revision', 'r2 决定已按投审系统更新为小修')
assert(r2.mismatches.some((m) => m.type === 'decision'), 'r2 决定不一致被圈出')
assert(r2.mismatches.some((m) => m.type === 'open_comments'), 'r2 未处理批注被圈出')
assert(r2.syncState === 'mismatch', 'r2 状态为对不上')
const r3 = state.rounds.find((r) => r.id === 'sys-r3')!
assert(r3.decision === 'pending' && r3.state === 'open', 'r3 新回合已并入')
assert(r3.opinions.some((o) => o.id === 'op-301'), 'r3 随附意见已并入')
const r4 = state.rounds.find((r) => r.id === 'wb-r4')!
assert(r4.receiptId !== null && r4.syncState === 'synced', 'r4 已补送并取得回执')
assert(state.reconcileReport?.created === 1, '报告：新增 1')
assert(state.reconcileReport?.pushed === 1, '报告：补送 1')
assert(state.reconcileReport?.skipped === 2, '报告：跳过已有回执 2')

// 3. 幂等：同一份回执再拉一次不多出回合
await useReviewStore.getState().reconcile()
state = useReviewStore.getState()
assert(state.rounds.length === 4, '重复对账不增加回合（回执幂等）')
assert(state.reconcileReport?.created === 0, '报告：新增 0')

// 4. 编辑定夺：结转下一轮
const carried = useReviewStore.getState().resolveRoundComments('wb-r2', 'carry_over')
assert(carried, '结转成功（r3 存在）')
state = useReviewStore.getState()
const r2After = state.rounds.find((r) => r.id === 'wb-r2')!
assert(!r2After.mismatches.some((m) => m.type === 'open_comments'), '结转后 r2 未处理批注圈示消除')
assert(r2After.editorDisposition === 'carry_over', 'r2 已记录结转定夺')
const moved = state.comments.filter((c) => c.roundId === 'sys-r3')
assert(moved.length === 6, '6 条未处理批注已结转到 r3')

// 5. 系统故障：对账失败，工作台状态原样保留
setSubmissionSystemAvailable(false)
useReviewStore.getState().setSystemAvailable(false)
await useReviewStore.getState().reconcile()
state = useReviewStore.getState()
assert(state.reconcileStatus === 'failed', '故障时对账失败')
assert(state.rounds.length === 4, '失败后回合数不变（工作台状态保留）')
assert(state.comments.length === 6, '失败后批注数不变')
assert(state.paragraphs.length === 7, '失败后正文段落数不变')

// 6. 恢复后重试：只补没送成的，已有回执不重发
setSubmissionSystemAvailable(true)
useReviewStore.getState().setSystemAvailable(true)
await useReviewStore.getState().reconcile()
state = useReviewStore.getState()
assert(state.reconcileStatus === 'succeeded', '恢复后重试成功')
assert(state.reconcileReport?.pushed === 0, '报告：恢复后无需补送（都有回执）')
assert(state.reconcileReport?.skipped === 4, '报告：跳过 4 个已有回执回合')

// 7. 登记新回合 → 故障送失败 → 恢复补送
useReviewStore.getState().addRound()
state = useReviewStore.getState()
const newRound = state.rounds[0]
assert(newRound.syncState === 'pending_push' && newRound.receiptId === null, '新回合未送达')
setSubmissionSystemAvailable(false)
useReviewStore.getState().setSystemAvailable(false)
await useReviewStore.getState().reconcile()
state = useReviewStore.getState()
assert(state.reconcileStatus === 'failed', '新回合在故障时送失败')
assert(state.rounds.find((r) => r.id === newRound.id)?.receiptId === null, '失败后新回合仍无回执')
setSubmissionSystemAvailable(true)
useReviewStore.getState().setSystemAvailable(true)
await useReviewStore.getState().reconcile()
state = useReviewStore.getState()
assert(state.rounds.find((r) => r.id === newRound.id)?.receiptId !== null, '恢复后新回合补送成功')
assert(state.rounds.length === 5, '回合总数 5')

// 8. 标记已处理路径
useReviewStore.getState().addRound()
state = useReviewStore.getState()
const markRound = state.rounds[0]
// 先把它变成“已结束且有未处理批注”的场景：直接构造一个带批注的已结束回合
useReviewStore.setState((s) => ({
  rounds: s.rounds.map((r) => r.id === markRound.id ? { ...r, state: 'closed' as const, mismatches: [{ type: 'open_comments' as const, openCount: 1 }] } : r),
  comments: [...s.comments, {
    id: 'c-mark', roundId: markRound.id, paragraphId: 'p-01', author: '审稿人 A', role: 'reviewer' as const,
    type: 'comment' as const, quote: '测试', body: '测试批注', status: 'open' as const, replies: [], createdAt: Date.now(),
  }],
}))
const marked = useReviewStore.getState().resolveRoundComments(markRound.id, 'mark_handled')
assert(marked, '标记已处理成功')
state = useReviewStore.getState()
const markAfter = state.rounds.find((r) => r.id === markRound.id)!
assert(markAfter.editorDisposition === 'mark_handled', '已记录标记处理定夺')
assert(!markAfter.mismatches.some((m) => m.type === 'open_comments'), '标记后未处理批注圈示消除')

console.log('\n全部通过')
