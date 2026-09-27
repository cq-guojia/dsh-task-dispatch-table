// 官方对照：packages/client/ui-chat/src/client/chat/ReasoningRow.tsx（0.1.7-rc.2 lib/client.js:5718-5778）
// root[data-variant=think][data-state=running|ok][data-expanded][data-preview]
//   > DisclosureRow（icon=IconThinkOutlineRegular 14px，title=t("message.think")=「思考」，
//     collapsedContent = separator(2×2px) + summary（首行、去 **），content = thinkBody MarkdownText compact）
// 折叠态 root 固定一行高（contain:size layout + height 24px+delta）；预览受 settledReasoningPreview 政策控制。
// 官方截图里组内思考行 = 「思考 · Let me submit the receipt now.」——标题是「思考」，不是「思考过程」。
import { Fragment, createElement as h, useState } from 'react'
import { DisclosureRow, IconThinkOutlineRegular, MarkdownText } from '@deepseek-ai/dsh-client-ui-primitives'
import { ocOr } from '../official-classes'
import type { Translate } from '../locales'

const MD_LABELS = { code: { copyLabel: '复制', copiedLabel: '已复制' }, footnotes: '脚注' }

/** 官方 firstLine（lib/client.js:5687）：首行。 */
function firstLine(text: string): string {
  const newline = text.indexOf('\n')
  return newline === -1 ? text : text.slice(0, newline)
}

/** 思考行：折叠 = 「思考 · 首行预览 ⌄」；展开 = thinkBody 全文（MarkdownText compact）。 */
export function ReasoningRowMirror(props: {
  text: string
  running?: boolean
  /** 官方 preview 政策（settledReasoningPreview）：完成后是否仍显示首行预览。 */
  preview?: boolean
  t: Translate
}): ReturnType<typeof h> | null {
  const { text, running = false, preview = true, t } = props
  const [open, setOpen] = useState<boolean>(false)
  if (text.trim() === '') return null
  const summary = firstLine(text).replaceAll('**', '')
  return h('div', {
    className: ocOr('ReasoningRow', 'root', 'dsh-tdt-sv-reasoning'),
    'data-variant': 'think',
    'data-state': running ? 'running' : 'ok',
    'data-expanded': open || undefined,
    'data-preview': preview && summary !== '' || undefined,
  },
    h(DisclosureRow, {
      icon: h(IconThinkOutlineRegular, { size: 14 }),
      title: t('thinkLabel'),
      open,
      expandable: true,
      expandOnRowClick: true,
      onToggle: () => { setOpen(value => !value) },
      rowClassName: ocOr('ReasoningRow', 'row', 'dsh-tdt-sv-reasoning-row'),
      leadingClassName: ocOr('ReasoningRow', 'leading', 'dsh-tdt-sv-reasoning-leading'),
      titleClassName: ocOr('ReasoningRow', 'title', 'dsh-tdt-sv-reasoning-title'),
      chevronClassName: ocOr('ReasoningRow', 'chevron', 'dsh-tdt-sv-reasoning-chevron'),
      collapsedContent: h(Fragment, null,
        h('span', { className: ocOr('ReasoningRow', 'separator', 'dsh-tdt-sv-reasoning-sep'), 'aria-hidden': true }),
        h('span', { className: ocOr('ReasoningRow', 'summary', 'dsh-tdt-sv-reasoning-preview') }, summary),
      ),
      children: open
        ? h('div', { className: ocOr('ReasoningRow', 'thinkBody', 'dsh-tdt-sv-reasoning-body') },
            h(MarkdownText, { text, labels: MD_LABELS, variant: 'compact' }))
        : undefined,
    }),
  )
}
