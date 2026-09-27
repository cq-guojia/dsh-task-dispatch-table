// 官方对照：packages/client/ui-chat/src/client/chat/TurnProcessNodeView.tsx（0.1.7-rc.2 lib/client.js:6129-6196）
// root（button，高 calc(33px + delta)、border-bottom .5px border-l2、padding 0 0 8px、flex）
//   :disabled{cursor:default} / :not(:disabled):hover{color:primary} / :not([data-open]){margin-bottom:8px}
//   > label（13px，ellipsis）> chevron（14px caption，[data-open] 旋转 180°）
// label 官方文案（源码 6167-6170 逐字）：
//   running → 「深度求索中，用时D」；aborted → 「已停止」；error → 「处理失败」；
//   其余 → 有时长「用时 D」、无时长「已完成工作」。D 由 turn 位置（start/end）算出，下限 1 秒。
// 这就是官方原图里那行「用时 34 秒 ⌄」——它把整个 turn 的过程（工具调用 / 中间文本 / 思考）折在下面。
import { Fragment, createElement as h, useEffect, useState } from 'react'
import { IconChevronDownOutlineRegular } from '@deepseek-ai/dsh-client-ui-primitives'
import { ocOr } from '../official-classes'
import type { Translate } from '../locales'
import type { TurnLocationFace, TurnProcessHandle } from './ChatNodeSeat'
import { formatLiveRunDuration, formatRunDuration } from './message-chrome'

/** 官方 LIVE_RUN_CLOCK_INTERVAL_MS（lib/client.js:979）。 */
const LIVE_RUN_CLOCK_INTERVAL_MS = 1_000

/** Turn 过程行：折叠时只有 label + 箭头；点开由外层 seat 把过程节点放出来。 */
export function TurnProcessNodeViewMirror(props: {
  turn: TurnLocationFace | undefined
  turnProcess: TurnProcessHandle
  t: Translate
}): ReturnType<typeof h> | null {
  const { turn, turnProcess, t } = props
  const open = !turnProcess.foldable || turnProcess.open
  const [now, setNow] = useState<number>(() => Date.now())
  const ticking = turn?.status === 'open' && turn.start !== undefined
  useEffect(() => {
    if (!ticking) return
    setNow(Date.now())
    const timer = setInterval(() => { setNow(Date.now()) }, LIVE_RUN_CLOCK_INTERVAL_MS)
    return () => { clearInterval(timer) }
  }, [ticking])
  if (turn === undefined || (turn.start === undefined && turn.status !== 'closed')) return null
  const canCollapse = turnProcess.foldable && turnProcess.hasContent && !turnProcess.alwaysOpen
  const running = turn.status === 'open'
  const reason = turn.end?.data?.reason?.kind
  const elapsedMs = turn.start === undefined ? undefined : Math.max(1_000, (turn.end?.time ?? now) - turn.start.time)
  const duration = elapsedMs === undefined
    ? undefined
    : running ? formatLiveRunDuration(elapsedMs, t) : formatRunDuration(elapsedMs, t)
  const label = running
    ? (duration === undefined ? t('chatDeepDiving') : t('turnProcessDeepDiving', { duration }))
    : reason === 'aborted' ? t('turnStopped')
      : reason === 'error' ? t('turnProcessFailed')
        : duration === undefined ? t('turnProcessWorked') : t('turnProcessTook', { duration })
  const announcement = running
    ? t('chatDeepDiving')
    : reason === 'aborted' ? t('turnStopped')
      : reason === 'error' ? t('turnProcessFailed')
        : t('turnProcessWorked')
  const spec = turnProcess.spec
  return h(Fragment, null,
    h('span', {
      className: ocOr('accessibility', 'visuallyHidden', 'dsh-tdt-sv-visuallyhidden'),
      role: 'status',
      'aria-live': 'polite',
      'aria-atomic': 'true',
    }, announcement),
    h('button', {
      type: 'button',
      className: ocOr('TurnProcessNodeView', 'root', 'dsh-tdt-sv-process'),
      'data-open': open || undefined,
      'data-turn-process': spec?.turn,
      'data-turn-process-messages': spec?.messageCount,
      'data-turn-process-tool-calls': spec?.toolCallCount,
      'data-turn-process-subagents': spec?.subagentCount,
      disabled: !canCollapse,
      'aria-expanded': turnProcess.hasContent ? open : undefined,
      onClick: (): void => { turnProcess.setOpen(!open) },
    },
      h('span', { className: ocOr('TurnProcessNodeView', 'label', 'dsh-tdt-sv-process-label') }, label),
      canCollapse
        ? h(IconChevronDownOutlineRegular, { className: ocOr('TurnProcessNodeView', 'chevron', 'dsh-tdt-sv-process-chevron') })
        : null,
    ),
  )
}
