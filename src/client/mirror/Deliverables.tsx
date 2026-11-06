// 官方对照：`@deepseek-ai/dsh-client-ui-deliverables` 的 `Deliverables.tsx`
// （PresentedFileCard + presented 网格 + >4 折叠）。
//
// 用途：会话弹窗 bodyFooter 里只补「快照没覆盖到的 DB 交付物」——核心 SessionViewModal 已按
// 快照 turn 级 deliverables.presented 在最后一轮 turn-tail 画出自己的网格，本文件只负责补差，
// 两个网格不重复（去重逻辑见 ../session-view.ts）。
// 官方类命中时走 ocOr（官方 CSS module），缺失时回退下方 dsh-tdt-sv-deliv* 兜底类。
import { createElement as h, useState } from 'react'
import type { MouseEvent as ReactMouseEvent } from 'react'
import {
  FileTypeIcon,
  IconChevronDownOutlineRegular,
  IconChevronUpOutlineRegular,
  fileExtension,
} from '@deepseek-ai/dsh-client-ui-primitives'
import { ocOr } from '../official-classes'
import type { Translate } from '../locales'

/** 官方 PresentedFile 的消费面（presented.d.ts：path 必有，description 可选）。 */
export interface DeliveredFileFace {
  path: string
  description?: string
}

const basename = (path: string): string => path.slice(Math.max(path.lastIndexOf('/'), path.lastIndexOf('\\')) + 1)

/** 官方 COLLAPSED_PRESENTED_COUNT（Deliverables.tsx）：超过 4 张折叠。 */
const COLLAPSED_DELIVERED_COUNT = 4

/** 官方 cardDescription：简介去尾部括注后为空则回退扩展名大写（再退「文件」）。 */
function cardDescription(description: string | undefined, fallback: string): string {
  const trimmed = description?.replace(/\s*(?:\([^()]*\)|（[^（）]*）)\s*$/u, '').trim()
  return trimmed === undefined || trimmed === '' ? fallback : trimmed
}

/** 官方 PresentedFileCard：整卡可点 → onPreview（官方 = 右栏预览，本仓 = 页面级预览 dock）。 */
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
