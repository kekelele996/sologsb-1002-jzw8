import { useEffect, useMemo, useState } from 'react'
import {
  ArrowLeftOutlined, ArrowRightOutlined, BranchesOutlined, CheckOutlined, CheckCircleOutlined, CloseOutlined,
  CommentOutlined, DiffOutlined, DeleteOutlined, FileDoneOutlined, FileTextOutlined,
  HistoryOutlined, LockOutlined, MenuFoldOutlined, MessageOutlined, PlusOutlined,
  RedoOutlined, SaveOutlined, SendOutlined, SwapOutlined, SyncOutlined, UndoOutlined, UnlockOutlined, UserSwitchOutlined,
} from '@ant-design/icons'
import { Alert, Badge, Button, Card, Checkbox, Divider, Empty, Input, Modal, Radio, Segmented, Select, Space, Switch, Tag, message } from 'antd'
import { submitRemotePatch } from './services/mockApi'
import { DECISION_LABEL, SUBMISSION_ID, useReviewStore } from './store/review'
import type { Comment, CommentType, Paragraph, ReviewRound, Role, RoundEditorDisposition } from './types'

const roleMeta: Record<Role, { label: string; description: string; color: string }> = {
  author: { label: '作者工作区', description: '编辑正文，逐条接受或拒绝修改建议', color: '#2f6f5e' },
  reviewer: { label: '审稿人工作区', description: '引用原文、添加批注与修改建议并参与讨论', color: '#9a5b25' },
  editor: { label: '编辑工作区', description: '合并重复意见、锁定已确认段落并比较版本', color: '#5b4d8e' },
}
const roleIcon = (role: Role) => role === 'author' ? <FileDoneOutlined /> : role === 'reviewer' ? <CommentOutlined /> : <BranchesOutlined />
const formatDate = (value: number) => new Date(value).toLocaleString('zh-CN', { month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' })
const formatDeadline = (value: number | null) => value === null ? '未设定' : new Date(value).toLocaleDateString('zh-CN', { year: 'numeric', month: '2-digit', day: '2-digit' })

const decisionColor: Record<string, string> = {
  major_revision: 'orange',
  minor_revision: 'blue',
  accept: 'green',
  reject: 'red',
  pending: 'default',
}
const syncMeta: Record<ReviewRound['syncState'], { label: string; color: string }> = {
  synced: { label: '已同步', color: 'green' },
  pending_push: { label: '未送达', color: 'orange' },
  mismatch: { label: '对不上', color: 'red' },
}

export default function App() {
  const {
    role, paragraphs, comments, versions, selectedParagraphId, commentFilter, revisionMode, dirty, conflicts,
    submissionId, rounds, systemAvailable, reconcileStatus, reconcileError, reconcileReport, lastReconcileAt,
    setRole, selectParagraph, setCommentFilter, setRevisionMode, updateParagraph, addComment, replyComment,
    resolveSuggestion, mergeComment, toggleLock, createVersion, addConflict, resolveConflict, dismissConflict,
    reconcile, setSystemAvailable, acknowledgeRound, resolveRoundComments, addRound,
    undo, redo, save, resetDemo,
  } = useReviewStore()
  const [composerOpen, setComposerOpen] = useState(false)
  const [commentType, setCommentType] = useState<CommentType>('comment')
  const [commentBody, setCommentBody] = useState('')
  const [suggestion, setSuggestion] = useState('')
  const [quote, setQuote] = useState('')
  const [replyDrafts, setReplyDrafts] = useState<Record<string, string>>({})
  const [versionOpen, setVersionOpen] = useState(false)
  const [versionA, setVersionA] = useState(versions[1]?.id ?? versions[0]?.id)
  const [versionB, setVersionB] = useState(versions[0]?.id)
  const [versionLabel, setVersionLabel] = useState('')
  const [reconcileOpen, setReconcileOpen] = useState(false)

  const selected = paragraphs.find((paragraph) => paragraph.id === selectedParagraphId) ?? paragraphs[0]
  const sections = useMemo(() => Array.from(new Set(paragraphs.map((paragraph) => paragraph.section))), [paragraphs])
  const paragraphCommentCounts = useMemo(() => comments.reduce<Record<string, number>>((acc, comment) => {
    acc[comment.paragraphId] = (acc[comment.paragraphId] ?? 0) + 1
    return acc
  }, {}), [comments])
  const duplicateParagraphIds = useMemo(() => new Set(Object.entries(paragraphCommentCounts).filter(([, count]) => count > 1).map(([id]) => id)), [paragraphCommentCounts])
  const visibleComments = useMemo(() => comments.filter((comment) => {
    if (commentFilter === 'open') return comment.status === 'open'
    if (commentFilter === 'suggestion') return comment.type === 'suggestion' && comment.status === 'open'
    if (commentFilter === 'duplicate') return duplicateParagraphIds.has(comment.paragraphId) && comment.status === 'open'
    return true
  }).sort((a, b) => b.createdAt - a.createdAt), [commentFilter, comments, duplicateParagraphIds])

  useEffect(() => {
    const handleBeforeUnload = (event: BeforeUnloadEvent) => {
      if (!dirty) return
      event.preventDefault()
      event.returnValue = ''
    }
    window.addEventListener('beforeunload', handleBeforeUnload)
    return () => window.removeEventListener('beforeunload', handleBeforeUnload)
  }, [dirty])

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement
      if (['INPUT', 'TEXTAREA', 'SELECT'].includes(target.tagName) || target.isContentEditable) return
      const state = useReviewStore.getState()
      const index = state.paragraphs.findIndex((paragraph) => paragraph.id === state.selectedParagraphId)
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'z') {
        event.preventDefault()
        event.shiftKey ? state.redo() : state.undo()
      } else if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'y') {
        event.preventDefault(); state.redo()
      } else if (event.key.toLowerCase() === 'j') {
        event.preventDefault(); const next = state.paragraphs[Math.min(state.paragraphs.length - 1, index + 1)]; if (next) state.selectParagraph(next.id)
      } else if (event.key.toLowerCase() === 'k') {
        event.preventDefault(); const previous = state.paragraphs[Math.max(0, index - 1)]; if (previous) state.selectParagraph(previous.id)
      } else if (event.key.toLowerCase() === 't') {
        event.preventDefault(); state.setRevisionMode(!state.revisionMode)
      } else if (event.key.toLowerCase() === 'l' && state.role === 'editor') {
        event.preventDefault(); state.toggleLock(state.selectedParagraphId)
      }
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [])

  const scrollToParagraph = (id: string) => {
    selectParagraph(id)
    document.getElementById(`paragraph-${id}`)?.scrollIntoView({ behavior: 'smooth', block: 'center' })
  }
  const openComposer = (type: CommentType) => {
    const selectedText = window.getSelection()?.toString().trim()
    setQuote(selectedText && selected?.text.includes(selectedText) ? selectedText : selected?.text.slice(0, 64) ?? '')
    setSuggestion(type === 'suggestion' ? selected?.text ?? '' : '')
    setCommentType(type)
    setComposerOpen(true)
  }
  const submitComment = () => {
    if (!selected || !commentBody.trim()) { message.warning('请填写批注内容'); return }
    addComment({ paragraphId: selected.id, type: commentType, quote, body: commentBody.trim(), suggestion: commentType === 'suggestion' ? suggestion : undefined })
    setCommentBody(''); setSuggestion(''); setQuote(''); setComposerOpen(false)
    message.success(commentType === 'suggestion' ? '修改建议已提交' : '段落批注已添加')
  }
  const handleMockConflict = async () => {
    if (!selected) return
    const response = await submitRemotePatch(selected)
    addConflict({
      id: `conflict-${Date.now()}`, paragraphId: selected.id, localText: selected.text, remoteText: response.remoteText,
      localAuthor: roleMeta[role].label, remoteAuthor: response.remoteAuthor, detectedAt: Date.now(),
    })
    message.warning('模拟接口返回了同段落的远端修改，请处理冲突')
  }
  const handleCreateVersion = () => {
    if (versionLabel.trim()) createVersion(versionLabel.trim())
    else createVersion('')
    setVersionLabel('')
    message.success('当前版本已保存')
  }
  const comparedA = versions.find((version) => version.id === versionA)
  const comparedB = versions.find((version) => version.id === versionB)
  const comparedRows = comparedA && comparedB ? comparedA.paragraphs.map((paragraph, index) => ({ a: paragraph, b: comparedB.paragraphs[index] })) : []

  const sortedRounds = useMemo(() => [...rounds].sort((a, b) => b.roundNumber - a.roundNumber), [rounds])
  const mismatchCount = rounds.filter((round) => round.mismatches.length > 0).length
  const pendingPushCount = rounds.filter((round) => round.syncState === 'pending_push').length
  const roundsNeedingAttention = mismatchCount + pendingPushCount
  const handleResolveRound = (roundId: string, disposition: RoundEditorDisposition) => {
    const ok = resolveRoundComments(roundId, disposition)
    if (!ok) {
      message.warning('未找到下一轮可结转；请先登记新回合，或先与投审系统对账后再定夺')
      return
    }
    message.success(disposition === 'carry_over' ? '未处理批注已结转至下一轮' : '已标记处理，该回合在工作台收口')
  }
  const handleAddRound = () => {
    addRound()
    message.success('已在工作台登记新回合，对账时补送到投审系统')
  }

  return (
    <div className="review-app">
      <header className="app-header">
        <div className="paper-identity">
          <div className="paper-mark">CR</div>
          <div><h1>学术论文协作审阅台</h1><p>Collaborative Research Review · {submissionId}</p></div>
        </div>
        <div className="role-switch">
          <Segmented block value={role} onChange={(value) => setRole(value as Role)} options={(Object.keys(roleMeta) as Role[]).map((item) => ({ label: <span>{roleIcon(item)} {roleMeta[item].label.replace('工作区', '')}</span>, value: item }))} />
        </div>
        <Space>
          <Badge count={roundsNeedingAttention} size="small" offset={[-4, 4]}>
            <Button icon={<SyncOutlined />} onClick={() => setReconcileOpen(true)}>对账</Button>
          </Badge>
          <Badge dot={dirty}><Button icon={<SaveOutlined />} onClick={() => { save(); message.success('草稿已保存到浏览器') }}>保存</Button></Badge>
          <Button icon={<UndoOutlined />} disabled={!useReviewStore.getState().past.length} onClick={undo} />
          <Button icon={<RedoOutlined />} disabled={!useReviewStore.getState().future.length} onClick={redo} />
          <Button danger={conflicts.length > 0} icon={<SwapOutlined />} onClick={() => void handleMockConflict()}>模拟冲突</Button>
        </Space>
      </header>

      <div className="role-banner" style={{ '--role-color': roleMeta[role].color } as React.CSSProperties}>
        <span className="role-badge">{roleIcon(role)} {roleMeta[role].label}</span>
        <span>{roleMeta[role].description}</span>
        <span className="paper-state"><FileTextOutlined /> 论文正文 v2.4</span>
      </div>

      {conflicts.length > 0 && (
        <div className="conflict-stack">
          {conflicts.map((conflict) => (
            <Alert
              key={conflict.id} type="error" showIcon message={`段落冲突：${conflict.localAuthor} 与 ${conflict.remoteAuthor} 同时修改`}
              description={(
                <div className="conflict-content">
                  <div><b>本页版本</b><p>{conflict.localText}</p></div>
                  <div><b>模拟远端版本</b><p>{conflict.remoteText}</p></div>
                  <Space><Button size="small" onClick={() => resolveConflict(conflict.id, 'local')}>保留本页</Button><Button size="small" type="primary" onClick={() => resolveConflict(conflict.id, 'remote')}>采用远端</Button><Button size="small" type="text" onClick={() => dismissConflict(conflict.id)}>稍后处理</Button></Space>
                </div>
              )}
            />
          ))}
        </div>
      )}

      <main className="workspace">
        <aside className="toc-panel">
          <div className="panel-title"><MenuFoldOutlined /> 侧边目录</div>
          <nav>
            {sections.map((section) => (
              <div key={section} className="toc-section">
                <strong>{section}</strong>
                {paragraphs.filter((paragraph) => paragraph.section === section).map((paragraph) => (
                  <button key={paragraph.id} className={paragraph.id === selected?.id ? 'active' : ''} onClick={() => scrollToParagraph(paragraph.id)}>
                    <span>{paragraph.number}</span>
                    <span>{paragraph.text.slice(0, 24)}…</span>
                    {paragraph.status === 'locked' && <LockOutlined />}
                    {!!paragraphCommentCounts[paragraph.id] && <Badge count={paragraphCommentCounts[paragraph.id]} size="small" />}
                  </button>
                ))}
              </div>
            ))}
          </nav>
          <div className="version-box">
            <div className="panel-title"><HistoryOutlined /> 版本</div>
            <Input value={versionLabel} onChange={(event) => setVersionLabel(event.target.value)} placeholder="新版本名称" onPressEnter={handleCreateVersion} />
            <Button block icon={<PlusOutlined />} onClick={handleCreateVersion}>保存当前版本</Button>
            <Button block icon={<DiffOutlined />} onClick={() => setVersionOpen(true)}>比较两个版本</Button>
          </div>
        </aside>

        <section className="document-panel">
          <div className="document-toolbar">
            <div><h2>大语言模型辅助下的开源维护协作研究</h2><p>作者：林晓、陈默、王远 · 最近保存 {formatDate(Date.now())}</p></div>
            <Space>
              <Checkbox checked={revisionMode} onChange={(event) => setRevisionMode(event.target.checked)}>修订模式</Checkbox>
              <Tag color={dirty ? 'gold' : 'green'}>{dirty ? '有未保存修改' : '已保存'}</Tag>
            </Space>
          </div>

          <div className="paper-sheet">
            <div className="paper-kicker">RESEARCH ARTICLE · CONFIDENTIAL REVIEW</div>
            {sections.map((section) => (
              <section key={section} className="paper-section">
                <h3>{section}</h3>
                {paragraphs.filter((paragraph) => paragraph.section === section).map((paragraph) => (
                  <article
                    id={`paragraph-${paragraph.id}`} key={paragraph.id} onMouseUp={() => setQuote(window.getSelection()?.toString().trim() ?? '')}
                    className={`paragraph-card ${paragraph.id === selected?.id ? 'selected' : ''} ${paragraph.highlighted ? 'highlighted' : ''} ${paragraph.status === 'locked' ? 'locked' : ''}`}
                    onClick={() => selectParagraph(paragraph.id)}
                  >
                    <div className="paragraph-meta">
                      <span className="paragraph-no">{paragraph.number}</span>
                      <span>段落 {paragraph.number.replace('.', '')}</span>
                      {paragraph.status === 'locked' && <Tag icon={<LockOutlined />} color="purple">已锁定</Tag>}
                      {paragraph.status === 'accepted' && <Tag icon={<CheckOutlined />} color="green">已确认</Tag>}
                      {!!paragraphCommentCounts[paragraph.id] && <Tag icon={<MessageOutlined />}>{paragraphCommentCounts[paragraph.id]} 条意见</Tag>}
                    </div>
                    {revisionMode ? (
                      <div className="revision-grid">
                        <div><small>原稿</small><p>{paragraph.original}</p></div>
                        <div><small>当前修订</small><p>{paragraph.text}</p></div>
                      </div>
                    ) : role === 'author' ? (
                      <Input.TextArea autoSize={{ minRows: 2, maxRows: 8 }} value={paragraph.text} readOnly={paragraph.status === 'locked'} onChange={(event) => updateParagraph(paragraph.id, event.target.value)} />
                    ) : (
                      <p className="paragraph-text">{paragraph.text}</p>
                    )}
                    <div className="paragraph-actions">
                      {role === 'reviewer' && <><Button size="small" icon={<CommentOutlined />} onClick={(event) => { event.stopPropagation(); selectParagraph(paragraph.id); openComposer('comment') }}>添加批注</Button><Button size="small" icon={<FileDoneOutlined />} onClick={(event) => { event.stopPropagation(); selectParagraph(paragraph.id); openComposer('suggestion') }}>提出建议</Button></>}
                      {role === 'editor' && <Button size="small" icon={paragraph.status === 'locked' ? <UnlockOutlined /> : <LockOutlined />} onClick={(event) => { event.stopPropagation(); toggleLock(paragraph.id) }}>{paragraph.status === 'locked' ? '解除锁定' : '锁定段落'}</Button>}
                      {role === 'author' && <span className="author-tip">可直接修改正文，右侧逐条处理建议</span>}
                    </div>
                  </article>
                ))}
              </section>
            ))}
          </div>
        </section>

        <aside className="comments-panel">
          <div className="comments-header">
            <div><h2><CommentOutlined /> 审阅意见 <Badge count={comments.filter((comment) => comment.status === 'open').length} /></h2><p>引用原文、讨论与修订建议</p></div>
          </div>
          <div className="comment-filters">
            <Radio.Group value={commentFilter} onChange={(event) => setCommentFilter(event.target.value)} buttonStyle="solid" size="small">
              <Radio.Button value="all">全部</Radio.Button><Radio.Button value="open">待处理</Radio.Button><Radio.Button value="suggestion">建议</Radio.Button><Radio.Button value="duplicate">重复</Radio.Button>
            </Radio.Group>
          </div>
          <div className="comment-list">
            {visibleComments.map((comment) => {
              const paragraph = paragraphs.find((item) => item.id === comment.paragraphId)
              return (
                <Card key={comment.id} size="small" className={`comment-card ${comment.status}`} title={<span>{comment.author} <Tag>{comment.type === 'suggestion' ? '修改建议' : '段落批注'}</Tag></span>} extra={<small>{formatDate(comment.createdAt)}</small>}>
                  <button className="quote-line" onClick={() => paragraph && scrollToParagraph(paragraph.id)}>“{comment.quote}” · 段落 {paragraph?.number}</button>
                  <p className="comment-body">{comment.body}</p>
                  {comment.suggestion && <div className="suggestion-box"><small>建议改为</small><p>{comment.suggestion}</p></div>}
                  {comment.status !== 'open' && <Tag color={comment.status === 'accepted' ? 'green' : comment.status === 'rejected' ? 'red' : 'blue'}>{comment.status === 'accepted' ? '已接受' : comment.status === 'rejected' ? '已拒绝' : '已合并'}</Tag>}
                  <div className="replies">
                    {comment.replies.map((reply) => <div key={reply.id} className="reply"><b>{reply.author}</b><span>{reply.body}</span></div>)}
                  </div>
                  <div className="reply-box">
                    <Input size="small" value={replyDrafts[comment.id] ?? ''} onChange={(event) => setReplyDrafts((drafts) => ({ ...drafts, [comment.id]: event.target.value }))} placeholder="回复讨论…" onPressEnter={() => { const body = replyDrafts[comment.id]?.trim(); if (body) { replyComment(comment.id, body); setReplyDrafts((drafts) => ({ ...drafts, [comment.id]: '' })) } }} />
                    <Button size="small" type="text" icon={<SendOutlined />} onClick={() => { const body = replyDrafts[comment.id]?.trim(); if (body) { replyComment(comment.id, body); setReplyDrafts((drafts) => ({ ...drafts, [comment.id]: '' })) } }} />
                  </div>
                  {comment.status === 'open' && role === 'author' && comment.type === 'suggestion' && <div className="decision-row"><Button type="primary" size="small" icon={<CheckOutlined />} onClick={() => resolveSuggestion(comment.id, true)}>接受修改</Button><Button danger size="small" icon={<CloseOutlined />} onClick={() => resolveSuggestion(comment.id, false)}>拒绝</Button></div>}
                  {comment.status === 'open' && role === 'editor' && duplicateParagraphIds.has(comment.paragraphId) && (() => {
                    const sibling = comments.find((item) => item.id !== comment.id && item.paragraphId === comment.paragraphId && item.status === 'open')
                    return sibling ? <Button size="small" type="dashed" icon={<BranchesOutlined />} onClick={() => mergeComment(comment.id, sibling.id)}>合并到“{sibling.author}”意见</Button> : null
                  })()}
                </Card>
              )
            })}
            {!visibleComments.length && <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="当前筛选下没有意见" />}
          </div>
          <div className="keyboard-hint"><span><kbd>J</kbd>/<kbd>K</kbd> 段落导航</span><span><kbd>T</kbd> 修订模式</span>{role === 'editor' && <span><kbd>L</kbd> 锁定</span>}<span><kbd>⌘Z</kbd> 撤销</span></div>
        </aside>
      </main>

      <Modal title={commentType === 'suggestion' ? '提出修改建议' : '添加段落批注'} open={composerOpen} onCancel={() => setComposerOpen(false)} onOk={submitComment} okText="提交" width={620}>
        <div className="composer">
          <label>引用原文</label>
          <Input.TextArea value={quote} onChange={(event) => setQuote(event.target.value)} autoSize={{ minRows: 2, maxRows: 4 }} />
          <label>{commentType === 'suggestion' ? '建议改为' : '批注内容'}</label>
          {commentType === 'suggestion' && <Input.TextArea value={suggestion} onChange={(event) => setSuggestion(event.target.value)} autoSize={{ minRows: 3, maxRows: 7 }} />}
          <label>说明</label>
          <Input.TextArea value={commentBody} onChange={(event) => setCommentBody(event.target.value)} placeholder="说明修改理由或希望作者关注的问题" autoSize={{ minRows: 2, maxRows: 5 }} />
        </div>
      </Modal>

      <Modal title="版本比较" open={versionOpen} onCancel={() => setVersionOpen(false)} footer={null} width={980}>
        <div className="compare-selectors">
          <Select value={versionA} onChange={setVersionA} options={versions.map((version) => ({ label: `${version.label} · ${formatDate(version.createdAt)}`, value: version.id }))} />
          <ArrowRightOutlined />
          <Select value={versionB} onChange={setVersionB} options={versions.map((version) => ({ label: `${version.label} · ${formatDate(version.createdAt)}`, value: version.id }))} />
        </div>
        <div className="version-table">
          <div className="version-head"><b>{comparedA?.label ?? '版本 A'}</b><b>{comparedB?.label ?? '版本 B'}</b></div>
          {comparedRows.map(({ a, b }) => (
            <div key={a.id} className={`version-row ${a.text !== b?.text ? 'changed' : ''}`}>
              <div><span>{a.number}</span>{a.text}</div><div><span>{b?.number ?? '—'}</span>{b?.text ?? '段落已删除'}</div>
            </div>
          ))}
        </div>
      </Modal>

      <Modal
        title={<Space><SyncOutlined /> 投审系统对账 <Tag>{submissionId}</Tag></Space>}
        open={reconcileOpen}
        onCancel={() => setReconcileOpen(false)}
        width={920}
        footer={[
          <Button key="close" onClick={() => setReconcileOpen(false)}>关闭</Button>,
          role === 'editor' && <Button key="add" icon={<PlusOutlined />} onClick={handleAddRound}>登记新回合</Button>,
          <Button key="reconcile" type="primary" icon={<SyncOutlined />} loading={reconcileStatus === 'working'} onClick={() => void reconcile()}>立即对账</Button>,
        ]}
      >
        <div className="reconcile-status">
          <Space wrap>
            <Tag color={systemAvailable ? 'green' : 'red'}>{systemAvailable ? '投审系统正常' : '投审系统故障（模拟）'}</Tag>
            <span>最近对账：{lastReconcileAt ? formatDate(lastReconcileAt) : '尚未对账'}</span>
            <Switch
              checked={systemAvailable}
              onChange={setSystemAvailable}
              checkedChildren="系统正常"
              unCheckedChildren="模拟故障"
            />
          </Space>
          {reconcileStatus === 'failed' && (
            <Alert
              type="error" showIcon
              message={`对账失败：${reconcileError}`}
              description="工作台草稿、正文与批注均未受影响；系统恢复后重试时只补送没有回执的回合，已有回执的回合不重发。"
              action={<Button size="small" type="primary" icon={<SyncOutlined />} onClick={() => void reconcile()}>按工作台这侧重试</Button>}
            />
          )}
          {reconcileStatus === 'succeeded' && reconcileReport && (
            <Alert
              type={reconcileReport.mismatchCount > 0 ? 'warning' : 'success'} showIcon
              message={`对账完成：新增 ${reconcileReport.created} 个回合，更新 ${reconcileReport.updated} 个回合，补送 ${reconcileReport.pushed} 个回合，跳过已有回执 ${reconcileReport.skipped} 个${reconcileReport.mismatchCount > 0 ? `；圈出 ${reconcileReport.mismatchCount} 处不一致，请编辑定夺` : ''}`}
            />
          )}
          {reconcileStatus === 'working' && <Alert type="info" showIcon message="正在与投审系统对账…" />}
        </div>

        <div className="round-list">
          {sortedRounds.map((round) => {
            const roundComments = comments.filter((comment) => comment.roundId === round.id)
            const openComments = roundComments.filter((comment) => comment.status === 'open')
            const mismatched = round.mismatches.length > 0
            const overdue = round.deadline !== null && round.deadline < Date.now() && round.state === 'open'
            return (
              <Card
                key={round.id}
                size="small"
                className={`round-card ${mismatched ? 'mismatch' : ''} ${round.syncState === 'pending_push' ? 'pending' : ''}`}
                title={(
                  <Space wrap>
                    <span>第 {round.roundNumber} 轮</span>
                    <Tag color={round.state === 'closed' ? 'default' : 'blue'}>{round.state === 'closed' ? '已结束' : '进行中'}</Tag>
                    <Tag color={syncMeta[round.syncState].color}>{syncMeta[round.syncState].label}</Tag>
                    {round.receiptId && <Tag icon={<CheckCircleOutlined />}>回执 {round.receiptId}</Tag>}
                  </Space>
                )}
                extra={(
                  <Space>
                    <Tag color={decisionColor[round.decision]}>{DECISION_LABEL[round.decision]}</Tag>
                    <span className={overdue ? 'deadline-overdue' : ''}>截止 {formatDeadline(round.deadline)}{overdue ? '（已逾期）' : ''}</span>
                  </Space>
                )}
              >
                {round.opinions.length > 0 && (
                  <div className="opinion-block">
                    <small>投审系统随附意见（{round.opinions.length}）</small>
                    {round.opinions.map((opinion) => (
                      <div key={opinion.id} className="opinion-item">
                        <b>{opinion.reviewer}</b>
                        <span>{formatDate(opinion.createdAt)}</span>
                        <p>{opinion.body}</p>
                      </div>
                    ))}
                  </div>
                )}
                <div className="workbench-comments">
                  <small>工作台批注 {roundComments.length} 条 · 未处理 {openComments.length} 条</small>
                  {openComments.map((comment) => (
                    <Tag key={comment.id}>{comment.author}：{comment.quote.slice(0, 14) || comment.body.slice(0, 14)}</Tag>
                  ))}
                  {!openComments.length && roundComments.length > 0 && <span className="comments-cleared">本回合批注均已收口</span>}
                </div>
                {mismatched && (
                  <div className="mismatch-block">
                    {round.mismatches.map((mismatch, index) => {
                      if (mismatch.type === 'decision') {
                        return <Alert key={index} type="warning" showIcon message={`对不上：工作台记录为「${mismatch.localLabel}」，投审系统为「${mismatch.remoteLabel}」—— 已按投审系统为准更新`} />
                      }
                      if (mismatch.type === 'deadline') {
                        return <Alert key={index} type="warning" showIcon message={`对不上：工作台截止时间 ${mismatch.localLabel}，投审系统 ${mismatch.remoteLabel}—— 已按投审系统为准更新`} />
                      }
                      return (
                        <Alert
                          key={index} type="error" showIcon
                          message={`对不上：投审系统该轮已结束，工作台还压着 ${mismatch.openCount} 条未处理批注`}
                          description={role === 'editor' ? (
                            <Space>
                              <Button size="small" type="primary" onClick={() => handleResolveRound(round.id, 'carry_over')}>结转下一轮</Button>
                              <Button size="small" onClick={() => handleResolveRound(round.id, 'mark_handled')}>标记已处理</Button>
                            </Space>
                          ) : '请编辑定夺后处置'}
                        />
                      )
                    })}
                    {role === 'editor' && !round.mismatches.some((mismatch) => mismatch.type === 'open_comments') && (
                      <Button size="small" onClick={() => acknowledgeRound(round.id)}>已知悉</Button>
                    )}
                  </div>
                )}
                {round.syncState === 'pending_push' && (
                  <Alert type="info" showIcon message="该回合仅存在于工作台，对账时补送到投审系统；同一回执不会重复出回合" />
                )}
                {round.editorDisposition && (
                  <Tag color="purple">{round.editorDisposition === 'carry_over' ? '已定夺：未处理批注结转至下一轮' : '已定夺：标记已处理'}</Tag>
                )}
              </Card>
            )
          })}
        </div>
      </Modal>

      <footer className="app-footer">
        <span>本地草稿自动持久化 · 模拟接口用于演示多人修改后的冲突处理</span>
        <Button type="text" size="small" icon={<DeleteOutlined />} onClick={() => { resetDemo(); message.success('已重置示例数据') }}>重置示例</Button>
      </footer>
    </div>
  )
}
