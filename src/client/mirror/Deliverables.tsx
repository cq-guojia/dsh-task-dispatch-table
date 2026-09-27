// 官方对照：packages/client/ui-deliverables/src/client/{PresentRow,PresentedFileCard,Deliverables}.tsx
// （0.1.7-rc.2 lib/client.js：PresentRow 488-560、PresentedFileCard 1529-1600、Deliverables 1632-1710）
//
// 官方产出物层的两个用户可见面，逐值镜像：
//   ① 交付文件行 = `present` 工具调用的专属渲染（官方经 tool.call.toolview 槽位 key='present'
//      挂 PresentRow）：标题「交付文件」+ IconDeliverDocRegular，折叠摘要 = 状态词（已交付…）
//      + 文件路径列表（官方纯文本**不可点**），展开体 = 工具结果原文（pre.output）。
//   ② 交付文件卡网格 = turnTail 槽位挂 DeliverablesTail：每轮被 `present` 交付成功的文件
//      （deliverables/presented 事件的 files，本弹窗从 present 工具调用参数同源推导）画成
//      卡片（FileTypeIcon + 文件名 + 简介），**整卡可点 → 预览**；>4 张折叠 +「全部 N 个文件」。
//      官方另有原生打开（桌面 Host）的状态行/重试行——本弹窗无原生层，不渲染（官方在
//      canOpenWorkspacePath 不可用时也只是把卡片降级为侧栏预览，卡片本体不变）。
// 数据真源 = 会话 keyed 流里的 present 工具调用（真实取数，禁模拟）。
import { createElement as h, useState } from 'react'
import type { MouseEvent as ReactMouseEvent } from 'react'
import {
  DisclosureRow,
  FileTypeIcon,
  IconChevronDownOutlineRegular,
  IconChevronUpOutlineRegular,
  IconDeliverDocRegular,
  fileExtension,
} from '@deepseek-ai/dsh-client-ui-primitives'
import { ocOr } from '../official-classes'
import type { LocaleKey, Translate } from '../locales'

/** 官方 PresentedFile 的消费面（presented.d.ts：path 必有，description 可选）。 */
export interface DeliveredFileFace {
  path: string
  description?: string
}

/** 官方 Tool block（present 调用）的消费面：running 半截 vs 结算（kind in block）。 */
interface PresentBlockFace {
  argsRaw?: string
  phase?: string
  kind?: string
  call?: { argsRaw?: string } | null
  content?: ReadonlyArray<{ type?: string; text?: string }>
  isError?: boolean
  error?: { code?: string; name?: string } | null
}

const basename = (path: string): string => path.slice(Math.max(path.lastIndexOf('/'), path.lastIndexOf('\\')) + 1)

/** 官方 fileNames（PresentRow.tsx）：argsRaw.files[].path 逗号连接；解析不出回原样。 */
function fileNames(raw: string): string {
  let args: unknown
  try { args = JSON.parse(raw) } catch { return raw }
  if (typeof args !== 'object' || args === null || !('files' in args) || !Array.isArray((args as { files: unknown }).files)) return raw
  return (args as { files: unknown[] }).files
    .flatMap((file) => (typeof file === 'object' && file !== null && 'path' in file && typeof (file as { path: unknown }).path === 'string' ? [(file as { path: string }).path] : []))
    .join(', ')
}

/** 官方 PresentRow：present 工具调用的状态行（折叠 = 状态词 + 路径；展开 = 结果原文）。 */
export function PresentRowMirror(props: { block: unknown; t: Translate }): ReturnType<typeof h> {
  const { block, t } = props
  const b = (block ?? {}) as PresentBlockFace
  const settled = typeof b.kind === 'string'
  const state = !settled
    ? (b.phase === 'preparing' ? 'preparing' : 'running')
    : b.error?.code === 'interrupted' ? 'stopped' : b.isError ? 'error' : 'ok'
  const argsRaw = (settled ? b.call?.argsRaw : b.argsRaw) ?? ''
  const details = settled
    ? ((b.content ?? []).map((item) => item.type === 'text' ? item.text ?? '' : JSON.stringify(item)).join('\n')
      || (b.error ? `${b.error.name ?? ''}: ${b.error.code ?? ''}` : ''))
    : ''
  const [expanded, setExpanded] = useState(false)
  const statusKey: LocaleKey = state === 'preparing' ? 'deliverRowPreparing'
    : state === 'running' ? 'deliverRowRunning'
    : state === 'error' ? 'deliverRowError'
    : state === 'stopped' ? 'deliverRowStopped'
    : 'deliverRowOk'
  return h('div', {
    className: ocOr('ToolRow', 'root', 'dsh-tdt-sv-tool'),
    'data-tool': 'present',
    'data-state': state,
  },
    h(DisclosureRow, {
      icon: h(IconDeliverDocRegular, { size: 14 }),
      title: t('deliverRowTitle'),
      open: expanded && details !== '',
      expandable: details !== '',
      expandOnRowClick: true,
      keepContentWhenOpen: true,
      onToggle: () => { setExpanded((value) => !value) },
      running: state === 'running' || state === 'preparing',
      rowClassName: ocOr('ToolRow', 'row', 'dsh-tdt-sv-tool-row'),
      leadingClassName: ocOr('ToolRow', 'leading', 'dsh-tdt-sv-tool-leading'),
      titleClassName: ocOr('ToolRow', 'title', 'dsh-tdt-sv-tool-title'),
      chevronClassName: ocOr('ToolRow', 'chevron', 'dsh-tdt-sv-tool-chevron'),
      collapsedContent: h('span', { className: ocOr('PresentRow', 'summary', 'dsh-tdt-sv-deliv-rowsummary') },
        h('span', null, t(statusKey)),
        h('span', { className: ocOr('PresentRow', 'paths', 'dsh-tdt-sv-deliv-rowpaths') }, fileNames(argsRaw)),
      ),
      children: details !== '' && expanded
        ? h('pre', { className: ocOr('PresentRow', 'output', 'dsh-tdt-sv-deliv-rowoutput') }, details)
        : null,
    }),
  )
}

/** 官方 COLLAPSED_PRESENTED_COUNT（Deliverables.tsx）：超过 4 张折叠。 */
const COLLAPSED_DELIVERED_COUNT = 4

/** 官方 cardDescription：简介去尾部括注后为空则回退扩展名大写（再退「文件」）。 */
function cardDescription(description: string | undefined, fallback: string): string {
  const trimmed = description?.replace(/\s*(?:\([^()]*\)|（[^（）]*）)\s*$/u, '').trim()
  return trimmed === undefined || trimmed === '' ? fallback : trimmed
}

/** 官方 PresentedFileCard：整卡可点 → onPreview（官方 = 右栏预览，本弹窗 = openFile 分栏）。 */
function DeliveredFileCard(props: {
  file: DeliveredFileFace
  onPreview?: () => void
  t: Translate
}): ReturnType<typeof h> {
  const { file, onPreview, t } = props
  const name = basename(file.path)
  const metadata = fileExtension(name).toUpperCase() || t('deliverFileLabel')
  return h('div', {
    className: ocOr('Deliverables', 'file', 'dsh-tdt-sv-deliv-file'),
    'data-presented-file': true,
  },
    onPreview !== undefined
      ? h('button', {
          type: 'button',
          className: ocOr('Deliverables', 'cardPreview', 'dsh-tdt-sv-deliv-cardpreview'),
          title: file.path,
          'aria-label': t('deliverPreviewCard', { name: file.path }),
          onClick: (event: ReactMouseEvent<HTMLButtonElement>) => { event.stopPropagation(); onPreview() },
        })
      : null,
    h('span', { className: ocOr('Deliverables', 'fileIcon', 'dsh-tdt-sv-deliv-icon') },
      h(FileTypeIcon, { path: file.path, size: 20 })),
    h('div', { className: ocOr('Deliverables', 'fileBody', 'dsh-tdt-sv-deliv-body') },
      h('div', { className: ocOr('Deliverables', 'details', 'dsh-tdt-sv-deliv-details') },
        h('span', { className: ocOr('Deliverables', 'fileName', 'dsh-tdt-sv-deliv-name') }, name),
        h('span', { className: ocOr('Deliverables', 'description', 'dsh-tdt-sv-deliv-desc'), 'data-presented-description': true },
          h('span', { className: ocOr('Deliverables', 'secondaryText', 'dsh-tdt-sv-deliv-secondary') }, cardDescription(file.description, metadata)),
          onPreview !== undefined
            ? h('span', { className: ocOr('Deliverables', 'previewHint', 'dsh-tdt-sv-deliv-hint') }, t('deliverPreviewHint'))
            : null,
        ),
      ),
    ),
  )
}

/**
 * 官方 DeliverablesTail 的 presented 网格（改动文件卡 ChangedFiles 依赖 Host git 摘要路由，
 * 本弹窗无该通道 ⇒ 不渲染，与官方「summary 未就绪时不画」同态）。
 */
export function DeliverablesGridMirror(props: {
  files: readonly DeliveredFileFace[]
  onOpen?: (path: string) => void
  t: Translate
}): ReturnType<typeof h> | null {
  const { files, onOpen, t } = props
  const [expanded, setExpanded] = useState(false)
  if (files.length === 0) return null
  const collapsible = files.length > COLLAPSED_DELIVERED_COUNT
  const shown = collapsible && !expanded ? files.slice(0, COLLAPSED_DELIVERED_COUNT) : files
  return h('div', {
    className: ocOr('Deliverables', 'root', 'dsh-tdt-sv-deliv'),
    'data-presented-files-grid': true,
  },
    h('div', {
      className: ocOr('Deliverables', 'presented', 'dsh-tdt-sv-deliv-grid'),
      'data-presented-files-row': true,
      'data-single': files.length === 1 ? true : undefined,
    },
      shown.map((file, index) => h(DeliveredFileCard, {
        key: `${file.path}:${index}`,
        file,
        onPreview: onOpen === undefined ? undefined : () => { onOpen(file.path) },
        t,
      })),
    ),
    collapsible
      ? h('button', {
          type: 'button',
          className: ocOr('Deliverables', 'toggle', 'dsh-tdt-sv-deliv-toggle'),
          'aria-expanded': expanded,
          'aria-label': t(expanded ? 'deliverCollapseAria' : 'deliverExpandAria', { count: files.length }),
          onClick: () => { setExpanded((value) => !value) },
        },
          h('span', null, t(expanded ? 'deliverCollapse' : 'deliverAll', { count: files.length })),
          expanded ? h(IconChevronUpOutlineRegular, {}) : h(IconChevronDownOutlineRegular, {}),
        )
      : null,
  )
}
