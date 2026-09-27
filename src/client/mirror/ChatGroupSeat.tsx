// 官方对照：packages/client/ui-chat/src/client/chat/ChatGroupSeat.js（0.1.7-rc.2 lib/client.js:2178-2385）
// 二级收折：root[data-step-process] > title（button，activity 图标 ↔ 箭头 hover/展开互换，
//   label = processTitle(summary)）+ body（max-height min(400px,50vh)，上下 24px 渐隐遮罩，
//   --dsh-chat-flow-gap:8px）> content > 组内条目（ChatNodeSeat 逐个，三级各自展开）。
// 外层可见性沿用官方 outerHidden：foldCompleted && turn 已闭合 && 有 spec && !alwaysOpen
//   && 存储的 answerStep 不匹配 ⇒ 整组 hidden（一级「用时 N 秒」行收起时组随之隐藏）。
// grouped（历史轮才收折：policy.stepGrouping === 'history' && turn 非 open）为 false 时
//   隐藏标题行、body 展开不限高（expandedBody）。
import { createElement as h, useCallback, useEffect, useRef, useState } from 'react'
import type { ComponentType } from 'react'
import {
  IconAgentPresetOutlineRegular,
  IconApiOutlineRegular,
  IconBrowseOutlineRegular,
  IconChevronDownOutlineRegular,
  IconChevronUpOutlineRegular,
  IconCodeOutlineRegular,
  IconEditOutlineRegular,
  IconGlobeOutlineRegular,
  IconPlanOutlineRegular,
  IconQuestionOutlineRegular,
  IconSearchOutlineRegular,
  IconSparkleRegular,
  IconThinkOutlineRegular,
} from '@deepseek-ai/dsh-client-ui-primitives'
import { ocOr } from '../official-classes'
import type { Translate } from '../locales'
import { ChatNodeSeatMirror, readPresentation, type ChatNodeStoreFace, type NodeRenderer, type TurnProcessPresentationFace } from './ChatNodeSeat'
import { processTitle, type ProcessActivity, type ProcessGroupSnapshot } from './process-groups'

/** 官方 PROCESS_ICONS（lib/client.js:2187-2201）；工具行图标同源（edit/write=铅笔、generic=sparkle）。 */
export const PROCESS_ICONS: Record<ProcessActivity | 'thinking', ComponentType<{ size?: number; className?: string }>> = {
  thinking: IconThinkOutlineRegular,
  read: IconBrowseOutlineRegular,
  readImage: IconBrowseOutlineRegular,
  search: IconSearchOutlineRegular,
  edit: IconEditOutlineRegular,
  write: IconEditOutlineRegular,
  commands: IconApiOutlineRegular,
  code: IconCodeOutlineRegular,
  webSearch: IconGlobeOutlineRegular,
  webFetch: IconBrowseOutlineRegular,
  subagents: IconAgentPresetOutlineRegular,
  plan: IconPlanOutlineRegular,
  questions: IconQuestionOutlineRegular,
  tools: IconSparkleRegular,
}

/** 官方图标尺寸（14px，除 thinking/commands/webSearch/plan/questions 用默认）。 */
const SMALL_ICONS: ReadonlySet<ProcessActivity | 'thinking'> = new Set([
  'read', 'readImage', 'search', 'edit', 'write', 'code', 'webFetch', 'subagents', 'tools',
])

/** 过程分组（二级收折）：汇总行 + 组内条目。 */
export function ChatGroupSeatMirror(props: {
  group: ProcessGroupSnapshot
  /** 官方 grouped：历史轮（turn 非 open）才收折。 */
  grouped: boolean
  store?: ChatNodeStoreFace
  openState: ReadonlyMap<number, number>
  onSetOpen(turn: number, answerStep: number, open: boolean): void
  foldCompleted: boolean
  renderNode: NodeRenderer
  t: Translate
}): ReturnType<typeof h> | null {
  const { group, grouped, store, openState, onSetOpen, foldCompleted, renderNode, t } = props
  const [open, setOpen] = useState<boolean>(false)
  const first = group.members[0]
  const firstNode = first === undefined ? undefined : store?.get(first.key)
  const presentation: TurnProcessPresentationFace | undefined = first === undefined
    ? undefined
    : readPresentation(store, first.key)
  const spec = presentation?.spec ?? undefined
  const location = firstNode?.location
  const reason = location?.kind === 'turn' || location?.kind === 'step'
    ? location.turn?.end?.data?.reason?.kind
    : undefined
  // 官方 ChatGroupSeat 的 alwaysOpen（2301）：与 seat 的版本略有差异（多 turnClosed === false 分支）。
  const alwaysOpen = presentation?.turnClosed === false
    || presentation?.hasInterleavedInput === true
    || reason === 'aborted'
    || reason === 'error'
  const storedAnswerStep = openState.get(group.data.turn)
  const outerHidden = foldCompleted && presentation?.turnClosed === true && spec !== undefined
    && !alwaysOpen && storedAnswerStep !== (spec.answerStep ?? 0)
  useEffect(() => {
    if (outerHidden) setOpen(false)
  }, [outerHidden])
  const bodyRef = useRef<HTMLDivElement | null>(null)
  const [edges, setEdges] = useState<{ up: boolean; down: boolean }>({ up: false, down: false })
  const measure = useCallback((): void => {
    const el = bodyRef.current
    if (el === null) return
    setEdges({
      up: el.scrollTop > 1,
      down: el.scrollTop + el.clientHeight < el.scrollHeight - 1,
    })
  }, [])
  useEffect(() => {
    if (grouped && open) measure()
  }, [grouped, open, measure])
  if (first === undefined || firstNode === undefined) return null
  const label = group.data.closed ? processTitle(group.data.summary, t) : t('stepProcessDoneThinking')
  const activity = group.data.summary.counts[0]?.kind ?? 'thinking'
  const ActivityIcon = PROCESS_ICONS[activity] ?? IconThinkOutlineRegular
  const bodyClass = [
    ocOr('ChatGroupSeat', 'body', 'dsh-tdt-sv-group-body'),
    grouped ? '' : ocOr('ChatGroupSeat', 'expandedBody', 'dsh-tdt-sv-group-expanded'),
    grouped && edges.up ? ocOr('ChatGroupSeat', 'fadeTop', 'dsh-tdt-sv-group-fade-top') : '',
    grouped && edges.down ? ocOr('ChatGroupSeat', 'fadeBottom', 'dsh-tdt-sv-group-fade-bottom') : '',
  ].filter(part => part !== '').join(' ')
  return h('div', {
    className: ocOr('ChatGroupSeat', 'root', 'dsh-tdt-sv-group'),
    'data-chat-group-key': group.key,
    'data-chat-flow-key': group.key,
    'data-chat-anchor-key': `group:${group.key}`,
    'data-chat-turn': group.data.turn,
    'data-step-process': true,
    'data-group-expanded-mode': !grouped || undefined,
    hidden: outerHidden || undefined,
  },
    grouped
      ? h('button', {
          type: 'button',
          className: ocOr('ChatGroupSeat', 'title', 'dsh-tdt-sv-group-title'),
          'aria-expanded': open,
          onClick: () => { setOpen(value => !value) },
        },
          h('span', {
            className: ocOr('ChatGroupSeat', 'leading', 'dsh-tdt-sv-group-leading'),
            'aria-hidden': true,
          },
            h('span', {
              className: ocOr('ChatGroupSeat', 'activityIcon', 'dsh-tdt-sv-group-icon'),
              'data-step-process-icon': true,
            }, h(ActivityIcon, SMALL_ICONS.has(activity) ? { size: 14 } : {})),
            open
              ? h(IconChevronUpOutlineRegular, { className: ocOr('ChatGroupSeat', 'chevron', 'dsh-tdt-sv-group-chevron') })
              : h(IconChevronDownOutlineRegular, { className: ocOr('ChatGroupSeat', 'chevron', 'dsh-tdt-sv-group-chevron') }),
          ),
          h('span', { className: ocOr('ChatGroupSeat', 'label', 'dsh-tdt-sv-group-label') }, label),
        )
      : null,
    h('div', {
      ref: bodyRef,
      className: bodyClass,
      'data-step-process-body': true,
      'data-scroll-up': edges.up || undefined,
      'data-scroll-down': edges.down || undefined,
      onScroll: measure,
      hidden: grouped && !open || undefined,
    },
      h('div', {
        className: ocOr('ChatGroupSeat', 'content', 'dsh-tdt-sv-group-content'),
        'data-step-process-content': true,
        'data-chat-flow': '',
      },
        group.members.map(member => h(ChatNodeSeatMirror, {
          key: JSON.stringify([member.key, member.groupPart ?? null]),
          node: store?.get(member.key) ?? { key: member.key, kind: '', anchorSeq: 0 },
          groupPart: member.groupPart,
          store,
          openState,
          onSetOpen,
          foldCompleted,
          renderNode,
        })),
      ),
    ),
  )
}
