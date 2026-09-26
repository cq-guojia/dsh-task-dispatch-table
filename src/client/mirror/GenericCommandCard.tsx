// 官方对照：packages/client/ui-chat/src/client/chat/GenericCommandCard.tsx（0.1.7-rc.2）
// root[data-variant="others"][data-state] > DisclosureRow(row: leading + title [+ separator + summary] + chevron)；展开 = pre.body。
// 关键样式：root 无边框无底色；title 400 字重；separator 2×2px（margin 0 8px）；summary 13px tertiary + flex:auto（把箭头推到最右）。
// 官方摘要为人话（命令 / 文件名），不是原始 JSON ⇒ 这里按常见参数键提取。
import { Fragment, createElement as h, useState } from 'react'
import { DisclosureRow, IconCodeOutlineRegular } from '@deepseek-ai/dsh-client-ui-primitives'
import { ocOr } from '../official-classes'
import type { Translate } from '../session-view'

/** 单行截断（官方 summary 是单行省略号样式）。 */
const preview = (text: string): string => {
  const first = text.split('\n').find(line => line.trim() !== '') ?? ''
  return first.length > 90 ? `${first.slice(0, 90)}…` : first
}

/** 人话摘要：优先取常见工具参数的关键字段，否则回退「输出优先、参数次之」的首行。 */
const summarize = (argsRaw: string, output: string): string => {
  const raw = argsRaw.trim()
  if (raw.startsWith('{')) {
    try {
      const parsed = JSON.parse(raw) as Record<string, unknown>
      for (const key of ['command', 'file_path', 'path', 'pattern', 'query', 'url', 'title']) {
        const value = parsed[key]
        if (typeof value === 'string' && value.trim() !== '') return value
      }
    } catch { /* 非法 JSON 走兜底 */ }
  }
  return preview(output.trim() !== '' ? output : argsRaw)
}

/** 工具调用 / 命令卡（默认折叠成一行；错误态摘要变红由 summary[data-error] 承担）。 */
export function GenericCommandCard(props: {
  name: string
  argsRaw: string
  output: string
  isError: boolean
  errorName?: string
  t: Translate
}): ReturnType<typeof h> {
  const { name, argsRaw, output, isError, errorName, t } = props
  const [open, setOpen] = useState<boolean>(isError)
  const summaryCls = ocOr('GenericCommandCard', 'summary', '')
  const summaryText = summarize(argsRaw, output)
  const bodyText = [
    argsRaw.trim() !== '' ? `${t('sessionArgs')}:\n${argsRaw}` : '',
    output.trim() !== '' ? `${t('sessionOutput')}:\n${output}` : '',
  ].filter(part => part !== '').join('\n\n')
  return h('div', {
    className: ocOr('GenericCommandCard', 'root', 'dsh-tdt-sv-tool'),
    'data-variant': 'others',
    'data-state': isError ? 'error' : 'success',
  },
    h(DisclosureRow, {
      icon: h(IconCodeOutlineRegular, {}),
      title: isError ? `${name}  ✕ ${errorName ?? 'error'}` : name,
      open,
      expandable: bodyText !== '',
      onToggle: () => { setOpen(value => !value) },
      expandOnRowClick: true,
      rowClassName: ocOr('GenericCommandCard', 'row', 'dsh-tdt-sv-tool-head'),
      leadingClassName: ocOr('GenericCommandCard', 'leading', ''),
      titleClassName: ocOr('GenericCommandCard', 'title', 'dsh-tdt-sv-tool-name'),
      chevronClassName: ocOr('GenericCommandCard', 'chevron', ''),
      collapsedContent: summaryText === '' ? null : h(Fragment, null,
        h('span', { className: ocOr('GenericCommandCard', 'separator', ''), 'aria-hidden': true }),
        h('span', {
          className: summaryCls,
          'data-error': isError || undefined,
        }, summaryText),
      ),
      children: bodyText === '' ? null : h('pre', { className: ocOr('GenericCommandCard', 'body', '') }, bodyText),
    }),
  )
}
