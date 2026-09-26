// 官方对照：packages/client/ui-chat/src/client/chat/ReasoningRow.tsx（0.1.7-rc.2）
// root:not([data-expanded]) 折叠时固定一行高 calc(24px + delta)；row 相对定位 + running 扫光；
// 展开体 = thinkBody。我们无 running 数据 ⇒ 只做折叠/展开与固定行高（data-expanded 语义）。
import { createElement as h, useState } from 'react'
import { ocOr } from '../official-classes'
import type { Translate } from '../session-view'

/** 思考行：折叠 = 一行「思考 + 首行预览 + 箭头」；展开 = thinkBody 全文。 */
export function ReasoningRowMirror(props: { text: string; t: Translate }): ReturnType<typeof h> | null {
  const { text, t } = props
  if (text.trim() === '') return null
  const [open, setOpen] = useState<boolean>(false)
  const first = text.split('\n').find(line => line.trim() !== '') ?? ''
  const previewLine = first.length > 90 ? `${first.slice(0, 90)}…` : first
  return h('div', {
    className: ocOr('ReasoningRow', 'root', 'dsh-tdt-sv-reasoning'),
    'data-expanded': open || undefined,
  },
    h('button', {
      type: 'button',
      className: ocOr('ReasoningRow', 'row', 'dsh-tdt-sv-reasoning-head'),
      'aria-expanded': open,
      onClick: () => { setOpen(value => !value) },
    },
      h('span', { className: ocOr('ReasoningRow', 'title', 'dsh-tdt-sv-tool-name') }, t('sessionReasoning')),
      h('span', { className: ocOr('ReasoningRow', 'summary', 'dsh-tdt-sv-reasoning-preview') }, previewLine),
      h('span', { className: ocOr('ReasoningRow', 'chevron', 'dsh-tdt-sv-reasoning-chevron') }, open ? '▾' : '▸'),
    ),
    open ? h('div', { className: ocOr('ReasoningRow', 'thinkBody', 'dsh-tdt-sv-reasoning-body') }, text) : null,
  )
}
