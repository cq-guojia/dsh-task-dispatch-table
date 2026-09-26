// 官方对照：packages/client/ui-chat/src/client/chat/TurnProcessNodeView.tsx（0.1.7-rc.2）
// 过程行：root 高 calc(33px + delta)、border-bottom .5px var(--dsw-alias-border-l2)、padding 0 0 8px；
//         :not([data-open]) 时 margin-bottom 8px；label 13px ellipsis；chevron 14px、[data-open] 旋转 180°。
// 这是官方把一个 turn 的工具调用折起来的那行分隔条（label 官方是「用时 N 秒」，我们暂无 turn 时长 ⇒ 用「过程 · N」）。
import { Fragment, createElement as h, useState } from 'react'
import type { ReactNode } from 'react'
import { IconChevronDownOutlineRegular } from '@deepseek-ai/dsh-client-ui-primitives'
import { ocOr } from '../official-classes'
import type { Translate } from '../session-view'

/** 过程行：默认收起（label = 过程 · N），点开显示本组工具卡。 */
export function TurnProcessNodeViewMirror(props: { count: number; t: Translate; children?: ReactNode }): ReturnType<typeof h> | null {
  const { count, t } = props
  const [open, setOpen] = useState<boolean>(false)
  if (count === 0) return null
  return h(Fragment, null,
    h('button', {
      type: 'button',
      className: ocOr('TurnProcessNodeView', 'root', 'dsh-tdt-sv-process'),
      'data-open': open || undefined,
      onClick: () => { setOpen(value => !value) },
    },
      h('span', { className: ocOr('TurnProcessNodeView', 'label', 'dsh-tdt-sv-process-label') },
        `${t('sessionProcess')} · ${count}`),
      h('span', { className: ocOr('TurnProcessNodeView', 'chevron', 'dsh-tdt-sv-process-chevron') },
        h(IconChevronDownOutlineRegular, {})),
    ),
    open ? h('div', { className: ocOr('ChatGroupSeat', 'body', 'dsh-tdt-sv-process-body') }, props.children) : null,
  )
}
