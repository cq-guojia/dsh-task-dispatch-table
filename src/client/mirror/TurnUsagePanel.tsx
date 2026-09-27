// 官方对照：packages/client/ui-chat/src/client/chat/TurnUsagePanel.tsx（0.1.7-rc.2 lib/client.js:6378-6452）
// root > trigger（button：IconDatabaseOutlineRegular + label「用量 91.5K tok」）
//   + 展开时 portal 到 body 的 stat-dialog 面板（本轮用量 / 提供方·模型 / 缓存命中 / 未缓存输入 /
//     缓存读取 / 缓存写入 / 输出（其中推理 N））。
// 官方只在「性能与用量 = 详细」时挂这个 pill（MessageIconActions 的 usageAction）；弹窗恒显 tokenUsage 存在的那一轮。
import { Fragment, createElement as h } from 'react'
import { createPortal } from 'react-dom'
import { IconDatabaseOutlineRegular } from '@deepseek-ai/dsh-client-ui-primitives'
import { ocOr } from '../official-classes'
import type { Translate } from '../locales'
import { useStatDialog } from './StatDialog'
import { formatCacheHitPercent, formatCompactCount, formatExactCount } from './message-chrome'

/** 官方 TurnTokenUsage 的消费面。 */
export interface TurnTokenUsageFace {
  totalTokens: number
  uncachedInputTokens: number
  cacheReadTokens?: number
  cacheWriteTokens?: number
  outputTokens: number
  reasoningTokens?: number
  routes?: ReadonlyArray<{ provider: string; model: string }>
}

/** 本轮用量 pill + 明细弹层。 */
export function TurnUsagePanelMirror(props: {
  usage: TurnTokenUsageFace
  t: Translate
}): ReturnType<typeof h> {
  const { usage, t } = props
  const { open, setOpen, rootRef, panelRef, pos } = useStatDialog()
  const cacheHit = usage.cacheReadTokens === undefined
    ? null
    : formatCacheHitPercent(usage.cacheReadTokens, usage.totalTokens - usage.outputTokens, 1)
  const total = formatCompactCount(usage.totalTokens, t)
  const routes = usage.routes?.map(route => `${route.provider}/${route.model}`).join(', ') ?? ''
  return h('span', { ref: rootRef, className: ocOr('TurnUsagePanel', 'root', 'dsh-tdt-sv-usage') },
    h('button', {
      type: 'button',
      className: ocOr('TurnUsagePanel', 'trigger', 'dsh-tdt-sv-usage-trigger'),
      'aria-haspopup': 'dialog',
      'aria-expanded': open,
      onClick: (): void => { setOpen(!open) },
    },
      h(IconDatabaseOutlineRegular, null),
      h('span', { className: ocOr('TurnUsagePanel', 'label', 'dsh-tdt-sv-usage-label') }, t('turnUsageConsumed', { total })),
    ),
    open
      ? createPortal(h('div', {
          ref: panelRef,
          className: ocOr('statDialog', 'panel', 'dsh-tdt-sv-stats'),
          role: 'dialog',
          'aria-label': t('turnUsageTitle'),
          style: pos,
        },
          h('div', { className: ocOr('statDialog', 'title', 'dsh-tdt-sv-stats-title') },
            h('span', { className: ocOr('statDialog', 'titleLabel', 'dsh-tdt-sv-stats-titlelabel') },
              h(IconDatabaseOutlineRegular, null),
              t('turnUsageTitle'),
            ),
            h('span', { className: ocOr('statDialog', 'titleValue', 'dsh-tdt-sv-stats-titlevalue') },
              formatExactCount(usage.totalTokens, t)),
          ),
          h('div', { className: ocOr('statDialog', 'titleRule', 'dsh-tdt-sv-stats-rule'), 'aria-hidden': true }),
          h('dl', { className: ocOr('statDialog', 'details', 'dsh-tdt-sv-stats-details'), 'data-turn-usage-details': true },
            routes === '' ? null : h(Fragment, null,
              h('dt', null, t('turnUsageModel')),
              h('dd', { className: ocOr('statDialog', 'route', 'dsh-tdt-sv-stats-route') }, routes),
            ),
            cacheHit === null ? null : h(Fragment, null,
              h('dt', null, t('turnUsageCacheHit')),
              h('dd', null, `${cacheHit}%`),
            ),
            h('dt', null, t('turnUsageInput')),
            h('dd', null, formatExactCount(usage.uncachedInputTokens, t)),
            usage.cacheReadTokens === undefined ? null : h(Fragment, null,
              h('dt', null, t('turnUsageCacheRead')),
              h('dd', null, formatExactCount(usage.cacheReadTokens, t)),
            ),
            usage.cacheWriteTokens === undefined ? null : h(Fragment, null,
              h('dt', null, t('turnUsageCacheWrite')),
              h('dd', null, formatExactCount(usage.cacheWriteTokens, t)),
            ),
            h('dt', null, t('turnUsageOutput')),
            h('dd', null,
              formatExactCount(usage.outputTokens, t),
              usage.reasoningTokens === undefined
                ? null
                : h('span', {
                    className: ocOr('statDialog', 'reasoning', 'dsh-tdt-sv-stats-reasoning'),
                  }, t('turnUsageReasoning', { tokens: formatExactCount(usage.reasoningTokens, t) })),
            ),
          ),
        ), document.body)
      : null,
  )
}
