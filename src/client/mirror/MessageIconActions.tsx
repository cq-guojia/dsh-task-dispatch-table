// 官方对照：packages/client/ui-chat/src/client/chat/MessageIconActions.tsx（0.1.7-rc.2）
// 操作行：actions 行高 calc(28px + delta)、gap 8px；复制 = IconCopy → 成功后 IconCheck（1 秒还原）+ Tooltip；
// 分支 = forkAt(seq)（有后续节点置灰）；用时 = timeEnd（需 turn 起止时间，暂缺）；👍👎 来自槽位
// conversation.chat.assistant-actions（仅官方会话区可渲染）⇒ 弹窗内只自绘复制按钮。
// 显隐时机：turn 尾 data-actions-reveal = 有答复 ? "always" : "hover"。
import { createElement as h, useRef, useState } from 'react'
import { IconCheckOutlineRegular, IconCopyOutlineRegular } from '@deepseek-ai/dsh-client-ui-primitives'
import { ocOr } from '../official-classes'

/** 操作行（复制按钮）：挂在助手答复流式项之后。 */
export function MessageIconActionsMirror(props: { text: string }): ReturnType<typeof h> | null {
  const [copied, setCopied] = useState<boolean>(false)
  const timer = useRef<number | null>(null)
  if (props.text.trim() === '') return null
  const onCopy = (): void => {
    if (copied) return
    const clipboard = navigator.clipboard
    if (clipboard === undefined) return
    void clipboard.writeText(props.text).then(() => {
      setCopied(true)
      if (timer.current !== null) window.clearTimeout(timer.current)
      timer.current = window.setTimeout(() => { setCopied(false); timer.current = null }, 1_000)
    }).catch(() => undefined)
  }
  return h('div', {
    className: ocOr('MessageIconActions', 'actions', 'dsh-tdt-sv-actions'),
    'data-actions-reveal': 'always',
  },
    h('button', {
      type: 'button',
      className: ocOr('MessageIconActions', 'action', 'dsh-tdt-sv-action'),
      'aria-label': copied ? '已复制' : '复制',
      onClick: onCopy,
    }, copied ? h(IconCheckOutlineRegular, {}) : h(IconCopyOutlineRegular, {})),
  )
}
