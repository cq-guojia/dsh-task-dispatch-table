// 官方对照：packages/client/ui-chat/src/client/chat/MessageItem.tsx（0.1.7-rc.2）
// 用户消息：userRow（右对齐，gap 6px）> userStack（宽 ≤ min(内容宽×.702, 82%)，gap 8px）
//          > bubble（background:--dsw-specific-bubble; radius-xl; padding:10px 16px; 14px/22px 行高）。
// 助手正文不走气泡：AssistantMarkdown（root 14px/24px，body 块间 gap 16px）。
// 重试/轮次失败/限长三件套同在官方 MessageItem.tsx（lib/client.js:1235-1338）：
//   ModelRetryItem   = <details.retryRow data-active> > summary.retrySummary > span.retryText
//                      + div.retryDetails（重试延迟 / 失败原因 两行，retryDetailLabel 标签）；
//                      active（retryState==='scheduled'）时摘要走渐隐 shimmer + 250ms 倒计时。
//   TurnErrorItem    = div.turnErrorRow（grid 10px/1fr/auto）> StateDot(error) + turnErrorCopy
//                      （标题红 600 + 原因灰）+ code.turnErrorCode（右侧机器路由码，如 SERVER）。
//   TurnMaxTokensItem= 同行结构，StateDot(warning) + maxTokensTitle（警示色）+ 提示语。
// 文案逐字抄官方词典（message.retry.* / message.turnError / message.maxTokens*，zh+en）。
import { createElement as h, useEffect, useMemo, useState } from 'react'
import { MarkdownText, StateDot } from '@deepseek-ai/dsh-client-ui-primitives'
import { ocOr } from '../official-classes'
import type { Translate } from '../locales'

/** markdown 文档级外壳文案（引用稳定——新身份会打断 MarkdownText 的流式渲染缓存）。 */
const MD_LABELS = { code: { copyLabel: '复制', copiedLabel: '已复制' }, footnotes: '脚注' }

/** 助手正文：官方 MarkdownText 渲染 + 官方 AssistantMarkdown.root 类（fallback 自绘）。 */
export function AssistantMarkdown(props: { text: string }): ReturnType<typeof h> {
  if (props.text.trim() === '') return h('span', null)
  return h('div', { className: ocOr('AssistantMarkdown', 'root', 'dsh-tdt-sv-md') },
    h(MarkdownText, { text: props.text, labels: MD_LABELS }),
  )
}

/** 用户消息：官方 MessageItem userRow > userStack > bubble（右对齐气泡）。 */
export function UserMessage(props: { text: string }): ReturnType<typeof h> {
  return h('div', { className: ocOr('MessageItem', 'userRow', '') },
    h('div', { className: ocOr('MessageItem', 'userStack', '') },
      h('div', { className: ocOr('MessageItem', 'bubble', 'dsh-tdt-sv-user') },
        h(MarkdownText, { text: props.text, labels: MD_LABELS }),
      ),
    ),
  )
}

// ── 重试 / 轮次失败 / 限长三件套（官方 lib/client.js:1235-1338 逐字照抄）──

/** 重试节点消费面（官方 ModelRetryNode = LlmRetryEventData & {retryState}，records.d.ts:112）。 */
export interface RetryAttemptFace {
  retryState?: 'scheduled' | 'started' | 'cancelled'
  mode?: string
  retry?: number
  maxRetries?: number
  delayMs?: number
  failure?: { message?: string; code?: string } | null
}

/** 轮次失败节点消费面（官方 TurnErrorNode，records.d.ts:127）。 */
export interface TurnErrorFace {
  message?: string
  code?: string
}

/** 官方 retrySeconds（lib/client.js:1215）：下限 1 秒。 */
function retrySeconds(milliseconds: number): number {
  return Math.max(1, Math.ceil(milliseconds / 1_000))
}

/**
 * 官方 failureMessage（lib/client.js:1219）：已知机器码走本地化文案，其余原样展示。
 * 官方判定顺序逐字：ACCOUNT_SIGNED_OUT / ACCOUNT_SIGN_IN_REQUIRED / QUOTA|ACCOUNT_QUOTA / AUTH。
 */
function failureMessage(message: string | undefined, code: string | undefined, t: Translate): string {
  if (code === 'ACCOUNT_SIGNED_OUT') return t('failureAccountSignedOut')
  if (code === 'ACCOUNT_SIGN_IN_REQUIRED') return t('failureAccountSignInRequired')
  if (code === 'QUOTA' || code === 'ACCOUNT_QUOTA') return t('failureQuota')
  return code === 'AUTH' ? t('failureAuth') : (message ?? '')
}

/**
 * 重试行（官方 ModelRetryItem）：折叠 = 「已重试模型请求 (5/5) · 9s ⌄」摘要；
 * 展开 = 重试延迟 / 失败原因 两行。active（等待重试）时官方走 250ms 倒计时 + 渐隐 shimmer。
 */
export function ModelRetryItemMirror(props: { node: RetryAttemptFace; active: boolean; t: Translate }): ReturnType<typeof h> {
  const { active, t } = props
  const node = props.node
  const delayMs = typeof node.delayMs === 'number' ? node.delayMs : 0
  // 官方 maximum：mode==='normal' 给 maxRetries，否则 ∞（mode 缺失且无 maxRetries 时按 ∞ 兜底）。
  const maximum = node.mode === 'normal' && typeof node.maxRetries === 'number'
    ? node.maxRetries
    : '∞'
  const deadline = useMemo(() => Date.now() + delayMs, [delayMs, node.retryState])
  const scheduledSeconds = retrySeconds(delayMs)
  const [countdown, setCountdown] = useState(() => ({ deadline, seconds: retrySeconds(deadline - Date.now()) }))
  const remainingSeconds = countdown.deadline === deadline
    ? countdown.seconds
    : retrySeconds(deadline - Date.now())
  useEffect(() => {
    if (!active) return
    const updateCountdown = (): number => {
      const next = retrySeconds(deadline - Date.now())
      setCountdown(current => current.deadline === deadline && current.seconds === next
        ? current
        : { deadline, seconds: next })
      return next
    }
    if (updateCountdown() === 1) return
    const timer = window.setInterval(() => {
      if (updateCountdown() === 1) window.clearInterval(timer)
    }, 250)
    return () => { window.clearInterval(timer) }
  }, [active, deadline])
  const label = active
    ? t('retryActive')
    : node.retryState === 'cancelled'
      ? t('retryCancelled')
      : node.retryState === 'started' ? t('retryStarted') : t('retryScheduled')
  const seconds = active ? remainingSeconds : scheduledSeconds
  const failure = node.failure
  return h('details', {
    className: ocOr('MessageItem', 'retryRow', 'dsh-tdt-sv-retry'),
    'data-active': active || undefined,
  },
    h('summary', { className: ocOr('MessageItem', 'retrySummary', 'dsh-tdt-sv-retry-summary') },
      h('span', {
        className: ocOr('MessageItem', 'retryText', 'dsh-tdt-sv-retry-text'),
        role: 'status',
      }, t('retryStatus', { label, retry: node.retry ?? 0, maximum, seconds })),
    ),
    h('div', { className: ocOr('MessageItem', 'retryDetails', 'dsh-tdt-sv-retry-details') },
      h('div', null,
        h('span', { className: ocOr('MessageItem', 'retryDetailLabel', 'dsh-tdt-sv-retry-label') }, t('retryDelay')),
        t('durationMilliseconds', { milliseconds: Math.round(delayMs) }),
      ),
      h('div', null,
        h('span', { className: ocOr('MessageItem', 'retryDetailLabel', 'dsh-tdt-sv-retry-label') }, t('retryFailure')),
        failureMessage(failure?.message, failure?.code, t),
      ),
    ),
  )
}

/** 轮次失败行（官方 TurnErrorItem）：红点 + 红标题「本轮运行失败」+ 灰原因 + 右侧机器码标签。 */
export function TurnErrorItemMirror(props: { node: TurnErrorFace; t: Translate }): ReturnType<typeof h> {
  const { node, t } = props
  return h('div', { className: ocOr('MessageItem', 'turnErrorRow', 'dsh-tdt-sv-turnerr'), role: 'status' },
    h(StateDot, {
      state: 'error',
      className: ocOr('MessageItem', 'turnErrorDot', 'dsh-tdt-sv-turnerr-dot'),
    }),
    h('div', { className: ocOr('MessageItem', 'turnErrorCopy', 'dsh-tdt-sv-turnerr-copy') },
      h('span', { className: ocOr('MessageItem', 'turnErrorTitle', 'dsh-tdt-sv-turnerr-title') },
        node.code === 'ACCOUNT_SIGNED_OUT' ? t('accountStopped') : t('turnErrorTitle'),
      ),
      h('span', { className: ocOr('MessageItem', 'turnErrorMessage', 'dsh-tdt-sv-turnerr-msg') },
        failureMessage(node.message, node.code, t),
      ),
    ),
    node.code !== undefined && node.code !== ''
      ? h('code', { className: ocOr('MessageItem', 'turnErrorCode', 'dsh-tdt-sv-turnerr-code') }, node.code)
      : null,
  )
}

/** 限长行（官方 TurnMaxTokensItem）：黄点 + 警示标题 + 截断提示。 */
export function TurnMaxTokensItemMirror(props: { t: Translate }): ReturnType<typeof h> {
  const { t } = props
  return h('div', { className: ocOr('MessageItem', 'turnErrorRow', 'dsh-tdt-sv-turnerr'), role: 'status' },
    h(StateDot, {
      state: 'warning',
      className: ocOr('MessageItem', 'turnErrorDot', 'dsh-tdt-sv-turnerr-dot'),
    }),
    h('div', { className: ocOr('MessageItem', 'turnErrorCopy', 'dsh-tdt-sv-turnerr-copy') },
      h('span', { className: ocOr('MessageItem', 'maxTokensTitle', 'dsh-tdt-sv-turnerr-warn') }, t('maxTokensTitle')),
      h('span', { className: ocOr('MessageItem', 'turnErrorMessage', 'dsh-tdt-sv-turnerr-msg') }, t('maxTokensHint')),
    ),
  )
}
