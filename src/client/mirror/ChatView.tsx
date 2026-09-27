// 官方对照：packages/client/ui-chat/src/client/chat/ChatView.tsx（0.1.7-rc.2 lib/client.js:5004-5260）
// 骨架四层：frame（> TurnNavigator）> root[data-chat-following-tail] > scroll > column[data-chat-flow]
//   column 子项：hint（loading）/ openError / older（hasMore）/ 各 flowItem（ChatNodeList）
// root 内另有 toBottomSlot（官方按「是否贴尾」显隐，弹窗恒贴尾 ⇒ 不渲染）。
// ChatNodeList：entries → seat；官方 entries 优先取 grouped('chat')，取不到时 = order.map(key)。
// 本弹窗走 order 兜底路径（分组项 ChatGroupSeat 未实现，见 ChatNodeSeat.tsx 偏差说明）。
import { createElement as h } from 'react'
import type { ReactNode } from 'react'
import { ocOr } from '../official-classes'
import { ChatNodeSeatMirror, type ChatNodeStoreFace, type NodeRenderer } from './ChatNodeSeat'

/** 会话区骨架：frame > root > scroll > column（类名取官方 ChatView.module.css，缺失回退自绘）。 */
export function ChatViewFrame(props: { children?: ReactNode }): ReturnType<typeof h> {
  return h('div', { className: ocOr('ChatView', 'frame', 'dsh-tdt-sv-body') },
    h('div', { className: ocOr('ChatView', 'root', '') },
      h('div', { className: ocOr('ChatView', 'scroll', '') },
        h('div', { className: ocOr('ChatView', 'column', 'dsh-tdt-sv-col'), 'data-chat-flow': '' }, props.children),
      ),
    ),
  )
}

/** 官方 ChatNodeList：order → seat 列表（grouped 视图未实现 ⇒ 走官方 order 兜底分支）。 */
export function ChatNodeListMirror(props: {
  order: readonly string[]
  store?: ChatNodeStoreFace
  openState: ReadonlyMap<number, number>
  onSetOpen(turn: number, answerStep: number, open: boolean): void
  foldCompleted: boolean
  renderNode: NodeRenderer
}): Array<ReturnType<typeof h> | null> {
  const { order, store, openState, onSetOpen, foldCompleted, renderNode } = props
  const rows: Array<ReturnType<typeof h> | null> = []
  const read = store === undefined ? undefined : (store as Partial<ChatNodeStoreFace>).get
  if (typeof read !== 'function' || store === undefined) return rows
  for (const key of order) {
    let node: ReturnType<ChatNodeStoreFace['get']>
    try {
      node = read.call(store, key)
    } catch {
      continue
    }
    if (node === undefined) continue
    rows.push(h(ChatNodeSeatMirror, { key, node, store, openState, onSetOpen, foldCompleted, renderNode }))
  }
  return rows
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
