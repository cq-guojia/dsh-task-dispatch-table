// 官方对照：packages/client/ui-chat/src/client/chat/MessageItem.tsx（0.1.7-rc.2）
// 用户消息：userRow（右对齐，gap 6px）> userStack（宽 ≤ min(内容宽×.702, 82%)，gap 8px）
//          > bubble（background:--dsw-specific-bubble; radius-xl; padding:10px 16px; 14px/22px 行高）。
// 助手正文不走气泡：AssistantMarkdown（root 14px/24px，body 块间 gap 16px）。
import { createElement as h } from 'react'
import { MarkdownText } from '@deepseek-ai/dsh-client-ui-primitives'
import { ocOr } from '../official-classes'

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
