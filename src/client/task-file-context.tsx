// 会话弹窗「任务文件上下文」：**顶部 = 输入**（接收 / 随附），产出卡留在会话末尾（官方同位）。
//
// 定位：官方没有「任务的上游产出 / 附加文件」这个概念（本插件调度域独有）⇒ 自绘，
// 但零件（FileTypeIcon）与 token 全走官方，观感与会话区一致。
// 真源：实例快照 `resolvedDeps`（决策 43，判定那一刻冻结的上游实例与产出）+ 快照 `attachments`
// + 服务端解析好的附件绝对路径。**绝不造值**：拿不到就不渲染该组。
//
// ⚠️ 只在我们自己的弹窗里可见；从弹窗 fork 出去到官方页，上游那部分仍是消息里的文本路径
// （官方没有对应渲染面）——已知边界，不做伪原生兜底。
//
// 排版口径（2026-10-03 专家团）：
// · 左右内边距 = 官方 `ChatView.scroll`（16 + clearance）⇒ 与会话正文**同一条左基线**；
// · 输入区**一行一个文件**（图标 + 文件名），不占产出卡那种大卡；
// · 长名省略 + 悬停全文；一排放几个交给 flex-wrap（不写死列数）；
// · 文件 >6 折叠、上游任务 >3 折叠（数量再大也不撑爆弹窗）；
// · 目录按尾斜杠识别，图标 + 名字，可点开（openFile 支持目录）。
import { createElement as h, useState } from 'react'
import { FileTypeIcon } from '@deepseek-ai/dsh-client-ui-primitives'
import { formatDateTime } from './format'
import type { ResolvedDependency } from '../deps.js'
import type { Translate } from './locales'

/** 一条上游输入的视图模型（任务名由调用方按 id 反查，查不到 ⇒ 短 id）。 */
export interface UpstreamInputView extends ResolvedDependency {
  taskTitle: string
}

/** 一个随附文件（本任务设置里加的；`path` 由服务端解析，null = 打不开）。 */
export interface AttachedFileView {
  name: string
  kind: 'link' | 'upload'
  /** 绝对路径（服务端按 kind 解析：upload 走任务目录、link 走来源工作区）；null ⇒ 不可点。 */
  path: string | null
}

/** 目录标记：产出按**尾斜杠**表示目录（回执归一 `receipt.ts` normalizeOutputs 的约定）。 */
export function isDirPath(path: string): boolean {
  return path.endsWith('/')
}

/** 相对路径 → 绝对路径（基准 = 上游工作区；无基准 ⇒ null，如实降级为不可点，不拿当前工作区猜）。 */
export function upstreamAbsPath(base: string | null, rel: string): string | null {
  if (base === null || base === '') return null
  const trimmed = rel.replace(/^\.\//, '')
  return base.endsWith('/') ? `${base}${trimmed}` : `${base}/${trimmed}`
}

/** 文件/目录的显示名（去掉尾斜杠取最后一段）。 */
export function displayName(path: string): string {
  const raw = path.replace(/\/+$/, '')
  const cut = Math.max(raw.lastIndexOf('/'), raw.lastIndexOf('\\'))
  return cut < 0 ? raw : raw.slice(cut + 1)
}

/** 折叠阈值：超过就收起（与官方 Deliverables「>4 折叠」同思路，输入区给宽松些）。 */
const COLLAPSE_FILES = 6
const COLLAPSE_TASKS = 3

/**
 * 快照 → 随附文件视图（服务端已把绝对路径解析在 `paths` 里，按序配对）。
 * 形状不对 / 解析失败 ⇒ 空数组（不渲染该组，绝不显示假文件）。
 */
export function attachmentsOf(
  snapshot: string | null,
  paths: readonly (string | null)[] | null | undefined,
): AttachedFileView[] {
  if (snapshot === null || snapshot === '') return []
  try {
    const parsed: unknown = JSON.parse(snapshot)
    if (typeof parsed !== 'object' || parsed === null) return []
    const list = (parsed as { attachments?: unknown }).attachments
    if (!Array.isArray(list)) return []
    return list.flatMap((item, index) => {
      if (typeof item !== 'object' || item === null) return []
      const one = item as { name?: unknown; kind?: unknown }
      if (typeof one.name !== 'string' || one.name === '') return []
      return [{
        name: one.name,
        kind: one.kind === 'upload' ? 'upload' as const : 'link' as const,
        path: paths?.[index] ?? null,
      }]
    })
  } catch {
    return []
  }
}

/** 一个文件行：图标 + 名字（超长省略、悬停全文）；有路径才可点。 */
function FileChip(props: {
  keyOf: string
  iconPath: string
  label: string
  title: string
  onClick?: () => void
}): ReturnType<typeof h> {
  const { keyOf, iconPath, label, title, onClick } = props
  const clickable = onClick !== undefined
  return h(clickable ? 'button' : 'span', {
    key: keyOf,
    className: 'dsh-tdt-sv-tfc-file',
    ...(clickable
      ? { type: 'button' as const, title, 'aria-label': title, onClick }
      : { title }),
  },
    h('span', { className: 'dsh-tdt-sv-tfc-icon' }, h(FileTypeIcon, { path: iconPath, size: 14 })),
    h('span', { className: 'dsh-tdt-sv-tfc-label' }, label),
  )
}

/** 文件行列表（含 >N 折叠；空 ⇒ 不渲染）。 */
function FileLines(props: {
  files: readonly { keyOf: string; iconPath: string; label: string; title: string; onClick?: () => void }[]
  t: Translate
}): ReturnType<typeof h> | null {
  const { files, t } = props
  const [expanded, setExpanded] = useState(false)
  if (files.length === 0) return null
  const collapsible = files.length > COLLAPSE_FILES
  const shown = collapsible && !expanded ? files.slice(0, COLLAPSE_FILES) : files
  return h('div', { className: 'dsh-tdt-sv-tfc-lines' },
    h('div', { className: 'dsh-tdt-sv-tfc-files' },
      shown.map(file => h(FileChip, file)),
    ),
    collapsible
      ? h('button', {
          type: 'button',
          className: 'dsh-tdt-sv-tfc-more',
          'aria-expanded': expanded,
          onClick: () => { setExpanded(value => !value) },
        }, t(expanded ? 'tfcCollapse' : 'tfcMore', { count: files.length }))
      : null,
  )
}

/** 一组：标题行 + 内容。 */
function Group(props: { title: string; children: ReturnType<typeof h> | null }): ReturnType<typeof h> | null {
  const { title, children } = props
  if (children === null) return null
  return h('div', { className: 'dsh-tdt-sv-tfc-group' },
    h('div', { className: 'dsh-tdt-sv-tfc-head' }, h('span', { className: 'dsh-tdt-sv-tfc-title' }, title)),
    children,
  )
}

/** 接收区：按上游任务分组，组头 = 任务名 + 计划时刻；任务多 ⇒ 折叠。 */
function ReceivedGroup(props: { items: readonly UpstreamInputView[]; onOpenFile?: (path: string) => void; t: Translate }): ReturnType<typeof h> | null {
  const { items, onOpenFile, t } = props
  const [expanded, setExpanded] = useState(false)
  if (items.length === 0) return null
  const collapsible = items.length > COLLAPSE_TASKS
  const shown = collapsible && !expanded ? items.slice(0, COLLAPSE_TASKS) : items
  return h(Group, {
    title: t('tfcReceived', { count: items.length }),
    children: h('div', { className: 'dsh-tdt-sv-tfc-tasks' },
      shown.map(item => {
        const files = item.outputs.map(path => {
          const abs = upstreamAbsPath(item.workspacePath, path)
          const name = displayName(path)
          return {
            keyOf: path,
            iconPath: isDirPath(path) ? `${name}/` : name,
            label: abs === null ? `${name} ${t('tfcRelOnly')}` : name,
            title: abs ?? path,
            onClick: abs !== null && onOpenFile !== undefined ? (): void => { onOpenFile(abs) } : undefined,
          }
        })
        return h('div', { key: `${item.task}:${item.instanceId}`, className: 'dsh-tdt-sv-tfc-task' },
          h('div', { className: 'dsh-tdt-sv-tfc-taskrow' },
            h('span', { className: 'dsh-tdt-sv-tfc-name', title: item.task }, item.taskTitle),
            h('span', { className: 'dsh-tdt-sv-tfc-meta' }, formatDateTime(item.scheduledAt, { fallback: item.scheduledAt })),
          ),
          files.length === 0
            ? h('div', { className: 'dsh-tdt-sv-tfc-none' }, t('tfcNoOutputs'))
            : h(FileLines, { files, t }),
        )
      }),
      collapsible
        ? h('button', {
            type: 'button',
            className: 'dsh-tdt-sv-tfc-more',
            'aria-expanded': expanded,
            onClick: () => { setExpanded(value => !value) },
          }, t(expanded ? 'tfcCollapse' : 'tfcMoreTasks', { count: items.length }))
        : null,
    ),
  })
}

/** 随附区：本任务设置里加的文件（来源标注「上传 / 工作区」）。 */
function AttachedGroup(props: { files: readonly AttachedFileView[]; onOpenFile?: (path: string) => void; t: Translate }): ReturnType<typeof h> | null {
  const { files, onOpenFile, t } = props
  if (files.length === 0) return null
  return h(Group, {
    title: t('tfcAttached', { count: files.length }),
    children: h(FileLines, {
      files: files.map(file => ({
        keyOf: `${file.name}:${file.kind}`,
        iconPath: file.name,
        label: `${file.name}（${file.kind === 'upload' ? t('tfcFromUpload') : t('tfcFromWorkspace')}）`,
        title: file.path ?? file.name,
        onClick: file.path !== null && onOpenFile !== undefined ? (): void => { onOpenFile(file.path as string) } : undefined,
      })),
      t,
    }),
  })
}

/**
 * 任务文件上下文（输入侧）：接收（上游） + 随附（本任务设置）。
 * 两组都空 ⇒ 整块不渲染（返回 null），不留空壳。
 */
export function TaskFileContextPanel(props: {
  upstream: readonly UpstreamInputView[]
  attached: readonly AttachedFileView[]
  /** U11 单一入口 `openFile`；undefined ⇒ 文件行降级纯文本（不可点）。 */
  onOpenFile?: (path: string) => void
  t: Translate
}): ReturnType<typeof h> | null {
  const { upstream, attached, onOpenFile, t } = props
  if (upstream.length === 0 && attached.length === 0) return null
  return h('div', { className: 'dsh-tdt-sv-tfc', 'data-task-file-context': true },
    h(ReceivedGroup, { items: upstream, onOpenFile, t }),
    h(AttachedGroup, { files: attached, onOpenFile, t }),
  )
}
