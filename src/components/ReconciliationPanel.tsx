import { useState } from 'react'
import {
  ClockCircleOutlined, CloudServerOutlined, ExclamationCircleOutlined,
  FileSyncOutlined, ReloadOutlined, ThunderboltOutlined,
} from '@ant-design/icons'
import { Alert, Badge, Button, Divider, Modal, Space, Tag, Tooltip, message } from 'antd'
import { submissionSystem } from '../services/submissionSystem'
import { decisionLabel, stageLabel } from '../services/reconcile'
import { useReviewStore } from '../store/review'
import type { ReviewRound, RoundAdjudication } from '../types'

const formatDate = (value: number) => new Date(value).toLocaleString('zh-CN', { month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' })
const formatDay = (value: number) => new Date(value).toLocaleDateString('zh-CN', { month: '2-digit', day: '2-digit' })

const decisionColor: Record<ReviewRound['decision'], string> = {
  major: 'volcano', minor: 'orange', accept: 'green', reject: 'red', pending: 'default',
}
const stateMeta: Record<ReviewRound['state'], { label: string; color: string }> = {
  'local-only': { label: '仅工作台（邮件口径）', color: 'default' },
  'pending-delivery': { label: '挂起·待恢复补送', color: 'gold' },
  'new-remote': { label: '投审系统新并入', color: 'blue' },
  matched: { label: '已对上', color: 'green' },
  mismatch: { label: '对不上·已圈出', color: 'red' },
}
const adjudicationLabel: Record<RoundAdjudication, string> = {
  continue: '继续在本回合处理', next: '转入下一轮', close: '随回合收口关闭',
}

interface Props {
  open: boolean
  onClose: () => void
}

export default function ReconciliationPanel({ open, onClose }: Props) {
  const {
    role, rounds, comments, submission, reconcileWithSubmission, adjudicateRound,
  } = useReviewStore()
  const [busy, setBusy] = useState(false)
  const isEditor = role === 'editor'

  const runReconcile = async () => {
    setBusy(true)
    const response = await reconcileWithSubmission()
    setBusy(false)
    if (response.ok) {
      const result = response.result!
      if (result.nothingNew) {
        message.success('回执均已在账：同一份回执再拉一次，没有多出回合')
      } else {
        message.success(`对账完成：新送达 ${result.deliveredReceipts.length} 份回执${result.backfilledRoundNos.length ? `，补上挂起回合 R${result.backfilledRoundNos.join('、R')}` : ''}`)
      }
    } else {
      message.warning(`对账失败，已按工作台侧重试 ${submission.retryCount} 次：${response.error ?? ''}。恢复后点“立即重试”只补没送成的回合`)
    }
  }

  const triggerFault = () => {
    submissionSystem.setOffline()
    message.warning('已模拟投审系统故障（HTTP 503），下次对账将失败并按工作台侧重试')
  }
  const recoverSystem = () => {
    submissionSystem.setOnline(true)
    message.info('投审系统已恢复，并生成第三轮的新回执；点“立即重试”只补挂起回合')
  }

  const openCount = (roundNo: number) => comments.filter((comment) => comment.roundNo === roundNo && comment.status === 'open').length
  const adjudicationTotal = rounds.filter((round) => round.needsAdjudication).length

  return (
    <Modal
      title={<span><FileSyncOutlined /> 投审对账台 <span className="recon-subtitle">按投稿编号并入评审回合、决定与截止时间</span></span>}
      open={open} onCancel={onClose} width={920}
      footer={[
        <Space key="demo" className="recon-demo">
          <span className="recon-demo-label">投审系统模拟：</span>
          <Tooltip title="让投审系统返回 503，演示失败后按工作台侧重试与降级挂起">
            <Button size="small" danger icon={<ThunderboltOutlined />} onClick={triggerFault}>模拟故障</Button>
          </Tooltip>
          <Tooltip title="恢复投审系统，并让第三轮回执首次可送达，演示只补没送成的回合">
            <Button size="small" icon={<CloudServerOutlined />} onClick={recoverSystem}>恢复并出新回执</Button>
          </Tooltip>
        </Space>,
        <Button key="close" onClick={onClose}>关闭</Button>,
        <Button key="retry" type="primary" loading={busy} icon={<ReloadOutlined />} onClick={() => void runReconcile()}>立即对账</Button>,
      ]}
    >
      <div className="recon-head">
        <div className="recon-identity">
          <Badge status={submission.status === 'synced' ? 'success' : submission.status === 'degraded' ? 'error' : submission.status === 'syncing' ? 'processing' : 'default'} />
          <div>
            <b>投稿编号 {submission.submissionId}</b>
            <p>
              {submission.status === 'synced' && <>上次对账 {submission.lastSyncedAt ? formatDate(submission.lastSyncedAt) : '—'} · 已送达回执 {submission.deliveredReceipts.length} 份</>}
              {submission.status === 'syncing' && '正在按投稿编号向投审系统拉取回执…'}
              {submission.status === 'degraded' && <>降级中：工作台优先，正文与批注照常处理（已重试 {submission.retryCount} 次）</>}
              {submission.status === 'idle' && '尚未对账，当前回合信息来自工作台邮件记录'}
            </p>
          </div>
        </div>
        {adjudicationTotal > 0 && <Tag color="red" icon={<ExclamationCircleOutlined />}>{adjudicationTotal} 个回合待编辑定夺</Tag>}
      </div>

      {submission.status === 'degraded' && (
        <Alert
          type="error" showIcon className="recon-alert"
          message="对账失败：投审系统不可达，已先按工作台侧重试"
          description={<Space direction="vertical" size={2}>
            <span>工作台仍可正常工作：正文、批注与本侧回合记录均为权威，未对成账的回合标记为“挂起·待恢复补送”。</span>
            <span>投审系统恢复后点“立即重试”，只补没送成的回合；已送达的回执再拉一次不会多出回合。{submission.lastError ? `（最后错误：${submission.lastError}）` : ''}</span>
          </Space>}
        />
      )}

      <div className="recon-list">
        {rounds.map((round) => {
          const unresolved = openCount(round.roundNo)
          const overdue = round.deadline != null && round.deadline < Date.now()
          const deadlineMismatch = round.mismatches.find((item) => item.field === 'deadline')
          const decisionMismatch = round.mismatches.find((item) => item.field === 'decision')
          const meta = stateMeta[round.state]
          const hasNext = rounds.some((item) => item.roundNo === round.roundNo + 1)
          return (
            <section key={round.roundNo} className={`recon-round ${round.mismatches.length ? 'has-mismatch' : ''} ${round.needsAdjudication ? 'needs-adj' : ''}`}>
              <header className="recon-round-head">
                <div>
                  <b>第 {round.roundNo} 轮</b>
                  <Tag color={round.stage === 'closed' ? 'purple' : 'cyan'}>{stageLabel(round.stage)}</Tag>
                  <Tag color={meta.color}>{meta.label}</Tag>
                  {round.bothTouched && <Tooltip title="正文与批注的处置按工作台；决定与截止时间按投审系统"><Tag color="geekblue">两边都动过</Tag></Tooltip>}
                  {round.adjudication && <Tag color="green">已定夺：{adjudicationLabel[round.adjudication]}</Tag>}
                </div>
                <small>{round.receiptId ? `回执 ${round.receiptId}` : '回执未送达'}</small>
              </header>

              <div className="recon-fields">
                <div className={`recon-field ${decisionMismatch ? 'mismatch' : ''}`}>
                  <span className="recon-field-label">决定</span>
                  <Tag color={decisionColor[round.decision]}>{decisionLabel(round.decision)}</Tag>
                  {decisionMismatch && (
                    <Tooltip title={`工作台邮件口径为“${decisionMismatch.local}”，投审系统为“${decisionMismatch.remote}”`}>
                      <span className="mismatch-flag"><ExclamationCircleOutlined /> 工作台记为 {decisionMismatch.local}，以投审系统 {decisionMismatch.remote} 为准</span>
                    </Tooltip>
                  )}
                </div>
                <div className={`recon-field ${deadlineMismatch || overdue ? 'mismatch' : ''}`}>
                  <span className="recon-field-label"><ClockCircleOutlined /> 截止时间</span>
                  <span className={overdue ? 'deadline-overdue' : ''}>{round.deadline == null ? '未设置' : `${formatDay(round.deadline)}${overdue ? '（已逾期）' : ''}`}</span>
                  {deadlineMismatch && (
                    <Tooltip title={`工作台邮件口径为 ${deadlineMismatch.local}，投审系统为 ${deadlineMismatch.remote}`}>
                      <span className="mismatch-flag"><ExclamationCircleOutlined /> 工作台记为 {deadlineMismatch.local}，以投审系统 {deadlineMismatch.remote} 为准</span>
                    </Tooltip>
                  )}
                </div>
                <div className="recon-field">
                  <span className="recon-field-label">工作台批注</span>
                  <span>未处理 <b className={unresolved ? 'unresolved' : ''}>{unresolved}</b> 条{round.bothTouched && ' · 处置依工作台'}</span>
                </div>
              </div>

              {round.notes.length > 0 && (
                <ul className="recon-notes">
                  {round.notes.map((note) => (
                    <li key={`${note.id}-${note.attachedAt}`}>
                      <b>{note.author}</b><span>{note.body}</span><small>{formatDate(note.attachedAt)}</small>
                    </li>
                  ))}
                </ul>
              )}

              {round.needsAdjudication && (
                <div className="recon-adj">
                  <div className="recon-adj-title"><ExclamationCircleOutlined /> 投审系统这轮已结束，工作台还压着 {unresolved} 条没处理完的意见，请逐个定夺：</div>
                  {isEditor ? (
                    <Space wrap>
                      <Button size="small" onClick={() => { adjudicateRound(round.roundNo, 'continue'); message.success(`第 ${round.roundNo} 轮：意见继续在本回合处理`) }}>继续在本回合处理</Button>
                      <Tooltip title={hasNext ? '' : '当前没有下一轮可挂，先对账并入下一轮后再用'}>
                        <Button size="small" disabled={!hasNext} onClick={() => { adjudicateRound(round.roundNo, 'next'); message.success(`第 ${round.roundNo} 轮未处理意见已转入第 ${round.roundNo + 1} 轮`) }}>转入下一轮</Button>
                      </Tooltip>
                      <Button size="small" danger onClick={() => { adjudicateRound(round.roundNo, 'close'); message.success(`第 ${round.roundNo} 轮：${unresolved} 条意见随回合收口关闭`) }}>随回合收口关闭</Button>
                    </Space>
                  ) : (
                    <span className="recon-adj-readonly">仅编辑可定夺，请切换到编辑工作区</span>
                  )}
                </div>
              )}
            </section>
          )
        })}
      </div>

      <Divider className="recon-divider" />
      <p className="recon-rule">
        对账口径：同一回合两边都动过时，<b>正文与批注的处置按工作台</b>，<b>决定与截止时间按投审系统</b>，对不上的字段红框圈出；
        回执以 receiptId 去重，重复对账不多出回合。
      </p>
    </Modal>
  )
}
