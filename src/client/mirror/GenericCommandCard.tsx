// 官方对照：packages/client/ui-chat/src/client/chat/GenericCommandCard.tsx（0.1.7-rc.2 lib/client.js:5966-6035）
//   + 工具结果 meta.diffs（@deepseek-ai/dsh-tool-fs lib/index.js:408-452：FileDiff{path,oldText,newText}[]）
//   + primitives DiffBlock / diffTotals（文件变更 = 内联 diff 面；无 diff 走 输入/输出 两行）。
// root[data-variant=others][data-state] > DisclosureRow(row: leading + title [+ separator + summary] + chevron)
//   · 图标按 activity 取官方 PROCESS_ICONS（edit/write=铅笔、generic 工具=sparkle、命令=api…）
//   · 摘要：有 diff = 路径 + 「+N -M」（官方截图「写入 · path +1 -0」）；无 diff = 人话摘要
//   · 展开体：有 diff = DiffBlock（红 - 绿 +）；无 diff = 输入（参数 JSON）/ 输出（结果文本）
import { Fragment, createElement as h, useState } from 'react'
import { DiffBlock, DisclosureRow, diffTotals } from '@deepseek-ai/dsh-client-ui-primitives'
import { ocOr } from '../official-classes'
import type { LocaleKey, Translate } from '../locales'
import { toolActivity } from './process-groups'
import { PROCESS_ICONS } from './ChatGroupSeat'

/** 官方 tool.title.*（uic lib/client.js:14703-14719）：工具名 → 本地化标题；未收录走 generic「工具调用」。 */
const TOOL_TITLE_KEYS: Readonly<Record<string, LocaleKey>> = {
  read: 'toolTitleRead',
  read_image: 'toolTitleReadImage',
  grep: 'toolTitleGrep',
  glob: 'toolTitleGlob',
  bash: 'toolTitleBash',
  pwsh: 'toolTitleBash',
  write: 'toolTitleWrite',
  edit: 'toolTitleEdit',
  run_code: 'toolTitleCode',
  web_search: 'toolTitleWebSearch',
  web_fetch: 'toolTitleWebFetch',
}

/** 工具行标题：官方字典命中用本地化动词，未命中 = generic（摘要补工具名，对齐官方「工具调用 · name · 摘要」）。 */
const toolTitle = (name: string, t: Translate): { title: string; generic: boolean } => {
  const key = TOOL_TITLE_KEYS[name]
  if (key !== undefined) return { title: t(key), generic: false }
  return { title: t('toolTitleGeneric'), generic: true }
}

/** 官方 FileDiff 的防御收窄（tool-fs isFileDiff 同构；meta 是 opaque 的）。 */
interface FileDiffFace { path: string; oldText: string | null; newText: string }

function diffsFromMeta(meta: unknown): FileDiffFace[] | undefined {
  if (typeof meta !== 'object' || meta === null || Array.isArray(meta)) return undefined
  const diffs = (meta as { diffs?: unknown }).diffs
  if (!Array.isArray(diffs) || diffs.length === 0) return undefined
  return diffs.every((diff): diff is FileDiffFace => {
    if (typeof diff !== 'object' || diff === null || Array.isArray(diff)) return false
    const { path, oldText, newText } = diff as Record<string, unknown>
    return typeof path === 'string' && (oldText === null || typeof oldText === 'string') && typeof newText === 'string'
  }) ? diffs as FileDiffFace[] : undefined
}

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

/** 官方 diff 面文案（codeLabel = 官方截图里的「代码块」；diff.*：收起差异 / 展开其余 N 行差异）。 */
const diffLabels = (t: Translate) => ({
  codeLabel: t('codeBlockLabel'),
  wrapLabel: t('diffWrapLabel'),
  unwrapLabel: t('diffUnwrapLabel'),
  copy: t('copyLabel'),
  copied: t('copiedLabel'),
  collapseAria: t('diffCollapseAria'),
  expandAria: (count: number) => t('diffExpandAria', { count }),
  collapse: t('diffCollapseLabel'),
  expand: (count: number) => t('diffExpandRest', { count }),
})

/** 工具调用 / 命令卡（默认折叠成一行；错误态摘要变红由 summary[data-error] 承担）。 */
export function GenericCommandCard(props: {
  name: string
  argsRaw: string
  output: string
  isError: boolean
  errorName?: string
  /** 官方 ToolResultNode.meta（内含 tool-fs 写入的 FileDiff[]；归档会话经 snapshot 透传）。 */
  meta?: unknown
  t: Translate
}): ReturnType<typeof h> {
  const { name, argsRaw, output, isError, errorName, meta, t } = props
  const [open, setOpen] = useState<boolean>(isError)
  const diffs = diffsFromMeta(meta)
  const localized = toolTitle(name, t)
  // 摘要：官方「写入 · 路径 +1 -0」= 路径 + diffTotals；无 diff 走人话摘要（generic 补工具名）。
  const summaryText = diffs !== undefined
    ? (() => {
        const firstPath = diffs[0]?.path ?? ''
        const totals = diffTotals(diffs)
        return `${firstPath} +${totals.added} -${totals.removed}`
      })()
    : localized.generic ? `${name} · ${summarize(argsRaw, output)}` : summarize(argsRaw, output)
  const rowTitle = isError ? `${localized.title}  ✕ ${errorName ?? 'error'}` : localized.title
  // 展开（官方格式）：
  //   有 diff（编辑/写入）⇒ DiffBlock 裸放（官方不加 body 外框，色条通到块最左缘——
  //     套 `._5OnbHa_body`（边框+padding）会让色条缩进 = 真机踩过）；
  //   无 diff ⇒ 输入（参数 JSON，可解析则按官方缩进两格美化）/ 输出（结果文本）两行，行间分隔线。
  const prettyArgs = (() => {
    const raw = argsRaw.trim()
    if (raw === '') return ''
    if (raw.startsWith('{') || raw.startsWith('[')) {
      try { return JSON.stringify(JSON.parse(raw), null, 2) } catch { /* 非法 JSON 原样 */ }
    }
    return raw
  })()
  const ActivityIcon = PROCESS_ICONS[toolActivity(name)] ?? PROCESS_ICONS.tools
  return h('div', {
    className: ocOr('GenericCommandCard', 'root', 'dsh-tdt-sv-tool'),
    'data-variant': 'others',
    'data-state': isError ? 'error' : 'success',
  },
    h(DisclosureRow, {
      icon: h(ActivityIcon, { size: 14 }),
      title: rowTitle,
      open,
      expandable: diffs !== undefined || prettyArgs !== '' || output !== '',
      onToggle: () => { setOpen(value => !value) },
      expandOnRowClick: true,
      keepContentWhenOpen: true,
      rowClassName: ocOr('GenericCommandCard', 'row', 'dsh-tdt-sv-tool-head'),
      collapsedContent: h(Fragment, null,
        h('span', { className: ocOr('GenericCommandCard', 'separator', ''), 'aria-hidden': true }),
        h('span', {
          className: ocOr('GenericCommandCard', 'summary', 'dsh-tdt-sv-outcome-ok'),
          'data-error': isError || undefined,
        }, summaryText),
      ),
      children: diffs !== undefined
        ? h(DiffBlock, { diffs, labels: diffLabels(t) })
        : h('div', { className: 'dsh-tdt-sv-io' },
            prettyArgs === ''
              ? null
              : h('div', { className: 'dsh-tdt-sv-io-row' },
                  h('span', { className: 'dsh-tdt-sv-io-label' }, t('toolInputLabel')),
                  h('pre', { className: 'dsh-tdt-sv-io-content' }, prettyArgs)),
            output.trim() === ''
              ? null
              : h('div', { className: 'dsh-tdt-sv-io-row' },
                  h('span', { className: 'dsh-tdt-sv-io-label' }, t('toolOutputLabel')),
                  h('pre', { className: 'dsh-tdt-sv-io-content' }, output)),
          ),
    }),
  )
}
