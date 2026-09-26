// 官方对照：会话输入区（@deepseek-ai/dsh-client-ui-conversation 的 conversation.composer 槽）。
// 续聊功能未开放（见 ui-map §十五数据缺口与 PROGRESS U1/U5）⇒ 先做**占位**：布局与官方输入区
// 同位（会话区下方一条），禁用输入，明确告知只读。
import { createElement as h } from 'react'

/** 对话框占位（禁用）。 */
export function ComposerPlaceholder(props: { placeholder: string }): ReturnType<typeof h> {
  return h('div', { className: 'dsh-tdt-sv-composer' },
    h('div', { className: 'dsh-tdt-sv-composer-box' },
      h('input', {
        type: 'text',
        disabled: true,
        placeholder: props.placeholder,
        'aria-readonly': true,
      }),
    ),
  )
}
