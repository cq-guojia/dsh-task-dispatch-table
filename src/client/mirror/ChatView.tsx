// 官方对照：packages/client/ui-chat/src/client/chat/ChatView.tsx（0.1.7-rc.2）
// 骨架四层：frame > root > scroll > column（> flowItem*），另有 hint / older / toBottom。
// 样式值见 docs/design/session-view-ui-map.md §一；官方升级时先 diff 本文件 + ui-map。
import { createElement as h } from 'react'
import type { ReactNode } from 'react'
import { ocOr } from '../official-classes'

/** 会话区骨架：frame > root > scroll > column（类名取官方 ChatView.module.css，缺失回退自绘）。 */
export function ChatViewFrame(props: { children?: ReactNode }): ReturnType<typeof h> {
  return h('div', { className: ocOr('ChatView', 'frame', 'dsh-tdt-sv-body') },
    h('div', { className: ocOr('ChatView', 'root', '') },
      h('div', { className: ocOr('ChatView', 'scroll', '') },
        h('div', { className: ocOr('ChatView', 'column', 'dsh-tdt-sv-col') }, props.children),
      ),
    ),
  )
}

/** 单条流式项：官方块间距规则（`.column > .flowItem ~ .flowItem { margin-top: var(--dsh-chat-flow-gap,16px) }`）的作用目标。 */
export function ChatFlowItem(props: { children?: ReactNode }): ReturnType<typeof h> {
  return h('div', { className: ocOr('ChatView', 'flowItem', 'dsh-tdt-sv-flowitem') }, props.children)
}

/** 加载 / 空态提示行（13px tertiary）。 */
export function ChatHint(props: { text: string }): ReturnType<typeof h> {
  return h('div', { className: ocOr('ChatView', 'hint', 'dsh-tdt-sv-hint') }, props.text)
}

/** 「加载更早记录」按钮（官方 older：按钮 4px 12px / 12px 字号 / radius-sm / 底色 interactive-bg-hover-solid）。 */
export function ChatOlderButton(props: { label: string; onClick: () => void }): ReturnType<typeof h> {
  return h('div', { className: ocOr('ChatView', 'older', 'dsh-tdt-sv-older') },
    h('button', { type: 'button', onClick: props.onClick }, props.label),
  )
}

/** 「到底部」悬浮钮（官方 toBottom：34×34 圆形悬浮，仅在有更多历史时显示）。 */
export function ChatToBottom(props: { label: string; onClick: () => void }): ReturnType<typeof h> {
  return h('div', { className: ocOr('ChatView', 'toBottomSlot', 'dsh-tdt-sv-tobottom') },
    h('button', { type: 'button', className: ocOr('ChatView', 'toBottom', ''), onClick: props.onClick, 'aria-label': props.label }, '↓'),
  )
}
