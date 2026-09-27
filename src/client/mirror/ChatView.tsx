// 官方对照：packages/client/ui-chat/src/client/chat/ChatView.tsx（0.1.7-rc.2 lib/client.js:5004-5260）
// 骨架四层：frame（> TurnNavigator）> root[data-chat-following-tail] > scroll > column[data-chat-flow]
//   column 子项：hint（loading）/ openError / older（hasMore）/ 各 flowItem（ChatNodeList）
// root 内另有 toBottomSlot（官方按「是否贴尾」显隐，弹窗恒贴尾 ⇒ 不渲染）。
// ChatNodeList：entries → seat；官方 entries 优先取 grouped('chat')，取不到时 = order.map(key)。
// 本弹窗走 order 兜底路径（分组项 ChatGroupSeat 未实现，见 ChatNodeSeat.tsx 偏差说明）。
import { createElement as h } from 'react'
import type { ReactNode } from 'react'
import { ocOr } from '../official-classes'
import type { Translate } from '../locales'
import { ChatGroupSeatMirror } from './ChatGroupSeat'
import { ChatNodeSeatMirror, type ChatNodeStoreFace, type NodeRenderer } from './ChatNodeSeat'
import type { ChatEntry, ProcessGroupSnapshot } from './process-groups'

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
  /** 官方 grouped('chat') 的 entries + 组快照（buildProcessGroups 产出）；缺省走 order 兜底。 */
  entries?: ReadonlyArray<ChatEntry>
  groups?: ReadonlyMap<string, ProcessGroupSnapshot>
  /** 官方 timeline.turns（判 turn 是否 open ⇒ grouped 政策）。 */
  turns?: TurnsFace
  openState: ReadonlyMap<number, number>
  onSetOpen(turn: number, answerStep: number, open: boolean): void
  foldCompleted: boolean
  renderNode: NodeRenderer
  t: Translate
}): Array<ReturnType<typeof h> | null> {
  const { order, store, entries, groups, turns, openState, onSetOpen, foldCompleted, renderNode, t } = props
  const rows: Array<ReturnType<typeof h> | null> = []
  const read = store === undefined ? undefined : (store as Partial<ChatNodeStoreFace>).get
  if (typeof read !== 'function' || store === undefined) return rows
  const readSafe = (key: string): ReturnType<ChatNodeStoreFace['get']> => {
    try {
      return read.call(store, key)
    } catch {
      return undefined
    }
  }
  if (entries !== undefined && groups !== undefined) {
    // 官方 ChatNodeList 的 entries 路径：group 条目 → ChatGroupSeat（二级收折）。
    for (const entry of entries) {
      if (entry.kind === 'group') {
        const group = groups.get(entry.key)
        if (group === undefined) continue
        rows.push(h(ChatGroupSeatMirror, {
          key: entry.key,
          group,
          grouped: turnStatus(turns, group.data.turn) !== 'open',
          store,
          openState,
          onSetOpen,
          foldCompleted,
          renderNode,
          t,
        }))
      } else {
        const node = readSafe(entry.key)
        if (node === undefined) continue
        rows.push(h(ChatNodeSeatMirror, {
          key: JSON.stringify([entry.key, entry.groupPart ?? null]),
          node,
          groupPart: entry.groupPart,
          store,
          openState,
          onSetOpen,
          foldCompleted,
          renderNode,
        }))
      }
    }
    return rows
  }
  for (const key of order) {
    const node = readSafe(key)
    if (node === undefined) continue
    rows.push(h(ChatNodeSeatMirror, { key, node, store, openState, onSetOpen, foldCompleted, renderNode }))
  }
  return rows
}

/** 官方 ConversationTimelineSnapshot.turns 的消费面（键为 number，兼容字符串键）。 */
export type TurnsFace = ReadonlyMap<number | string, { status?: 'open' | 'closed' }>

/** turn 状态（官方 turns.get(turn)?.status）。 */
function turnStatus(turns: TurnsFace | undefined, turn: number): 'open' | 'closed' | undefined {
  const row = turns?.get(turn) ?? turns?.get(String(turn))
  return row?.status
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
