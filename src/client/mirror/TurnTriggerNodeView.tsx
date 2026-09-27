// 官方对照：packages/client/ui-chat/src/client/chat/TurnTriggerNodeView.tsx（0.1.7-rc.2）
//   + turn-trigger.ts 的 turnTriggerDetails（lib/client.js:6538-6605）。
// root（border .5px border-l1 / radius-xl / bg markdown-code-block / hover interactive-bg-hover）
//   > header（button，padding 12px 16px，gap 10px）
//       > icon（14px，tertiary）> title（dsw-font-xs-13）> time（margin-left:auto，xxs-12，caption）
//       > chevron（12px；展开用 openChevron = rotate 180°）
//   > body（展开时：padding 0 16px 12px 40px）> explanation（8px 0）+ content（pre-wrap，max-height 240px）
// 「非人类触发的 turn」就以这一行开头——官方原图里那句「收到执行请求 9月26日 01:35」就是它。
import { createElement as h, useState } from 'react'
import type { ComponentType } from 'react'
import {
  IconAgentPresetOutlineRegular,
  IconAlarmClockOutlineRegular,
  IconBranchOutlineRegular,
  IconChevronDownOutlineRegular,
  IconContextInjectionOutlineRegular,
  IconCordisPluginOutlineRegular,
  IconGlobeOutlineRegular,
  IconGoalOutlineRegular,
  IconPaperPlaneOutlineRegular,
  IconQueueOutlineRegular,
} from '@deepseek-ai/dsh-client-ui-primitives'
import { ocOr } from '../official-classes'
import type { LocaleKey, Translate } from '../locales'
import { formatMessageClock } from './message-chrome'

/** 官方 TRIGGER_ICONS（lib/client.js:6634）。 */
const TRIGGER_ICONS: Record<string, ComponentType<{ size?: number; className?: string }>> = {
  request: IconContextInjectionOutlineRegular,
  goal: IconGoalOutlineRegular,
  agent: IconPaperPlaneOutlineRegular,
  team: IconAgentPresetOutlineRegular,
  subagent: IconAgentPresetOutlineRegular,
  github: IconBranchOutlineRegular,
  webhook: IconGlobeOutlineRegular,
  schedule: IconAlarmClockOutlineRegular,
  job: IconQueueOutlineRegular,
  plugin: IconCordisPluginOutlineRegular,
}

/** 官方 turnTriggerDetails：source.kind → 标题与图标家族（默认 request）。 */
export function turnTriggerDetails(source: unknown): { title: LocaleKey; icon: string } {
  const record = (value: unknown): Record<string, unknown> =>
    (typeof value === 'object' && value !== null && !Array.isArray(value) ? value as Record<string, unknown> : {})
  const src = record(source)
  const kind = typeof src.kind === 'string' ? src.kind : ''
  switch (kind) {
    case 'goal': return { title: 'triggerGoal', icon: 'goal' }
    case 'agent-message': return { title: 'triggerAgent', icon: 'agent' }
    case 'team-message': return { title: 'triggerTeam', icon: 'team' }
    case 'subagent-settled': return { title: 'triggerSubagent', icon: 'subagent' }
    case 'webhook': {
      const github = src.provider === 'github'
      return github ? { title: 'triggerGithub', icon: 'github' } : { title: 'triggerWebhook', icon: 'webhook' }
    }
    case 'schedule': return { title: 'triggerSchedule', icon: 'schedule' }
    case 'tool-jobs': return { title: 'triggerJob', icon: 'job' }
    case 'cordis-host-runner': return { title: 'triggerPlugin', icon: 'plugin' }
    default: return { title: 'triggerRequest', icon: 'request' }
  }
}

/** 触发行：折叠时只有「图标 + 标题 + 时间 + 箭头」，点开展示注入原文。 */
export function TurnTriggerNodeViewMirror(props: {
  /** turn-trigger 节点 data（ContextMessageNode & { waking? }）。 */
  data: Record<string, unknown> | undefined
  t: Translate
}): ReturnType<typeof h> {
  const { data, t } = props
  const [open, setOpen] = useState<boolean>(false)
  const details = turnTriggerDetails(data?.source)
  const TriggerIcon = TRIGGER_ICONS[details.icon] ?? IconContextInjectionOutlineRegular
  const time = typeof data?.time === 'number' ? data.time : undefined
  const content = triggerContent(data?.content)
  return h('section', {
    className: ocOr('TurnTriggerNodeView', 'root', 'dsh-tdt-sv-trigger'),
    'data-turn-trigger': true,
  },
    h('button', {
      type: 'button',
      className: ocOr('TurnTriggerNodeView', 'header', 'dsh-tdt-sv-trigger-header'),
      'aria-expanded': open,
      onClick: () => { setOpen(value => !value) },
    },
      h('span', { className: ocOr('TurnTriggerNodeView', 'icon', 'dsh-tdt-sv-trigger-icon'), 'aria-hidden': true },
        h(TriggerIcon, { size: 14 })),
      h('span', { className: ocOr('TurnTriggerNodeView', 'title', 'dsh-tdt-sv-trigger-title') }, t(details.title)),
      time === undefined
        ? null
        : h('time', {
            className: ocOr('TurnTriggerNodeView', 'time', 'dsh-tdt-sv-trigger-time'),
            dateTime: new Date(time).toISOString(),
          }, formatMessageClock(time, t)),
      h(IconChevronDownOutlineRegular, {
        size: 12,
        className: open
          ? ocOr('TurnTriggerNodeView', 'openChevron', 'dsh-tdt-sv-trigger-chevron-open')
          : ocOr('TurnTriggerNodeView', 'chevron', 'dsh-tdt-sv-trigger-chevron'),
      }),
    ),
    open
      ? h('div', { className: ocOr('TurnTriggerNodeView', 'body', 'dsh-tdt-sv-trigger-body') },
          h('p', { className: ocOr('TurnTriggerNodeView', 'explanation', 'dsh-tdt-sv-trigger-explanation') },
            t('triggerExplanation')),
          h('div', { className: ocOr('TurnTriggerNodeView', 'content', 'dsh-tdt-sv-trigger-content') },
            content === '' ? t('sessionEmpty') : content),
        )
      : null,
  )
}

/** 注入原文：content 块的 text 拼接（官方 NoticeBody 的文本消费面）。 */
function triggerContent(content: unknown): string {
  if (!Array.isArray(content)) return ''
  return content.map((block) => {
    const b = block as { type?: string; text?: string } | null
    if (b !== null && typeof b === 'object' && b.type === 'text' && typeof b.text === 'string') return b.text
    return ''
  }).filter(part => part !== '').join('\n')
}
