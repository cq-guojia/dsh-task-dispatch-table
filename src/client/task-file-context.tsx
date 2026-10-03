// 会话弹窗「任务文件上下文」：**顶部 = 输入**（接收 / 随附），产出卡留在会话末尾（官方同位）。
//
// 定位：官方没有「任务的上游产出 / 附加文件」这个概念（本插件调度域独有）⇒ 自绘，
// 但零件（FileTypeIcon / IconFolderCloseRegular）与 token 全走官方，观感与会话区一致。
// 真源：实例快照 `resolvedDeps`（决策 43，判定那一刻冻结的上游实例与产出）+ 快照 `attachments`
// + 服务端解析好的附件绝对路径（按 ref 配对）。**绝不造值**：拿不到就不渲染 / 不可点。
//
// ⚠️ 只在我们自己的弹窗里可见；从弹窗 fork 出去到官方页，上游那部分仍是消息里的文本路径
// （官方没有对应渲染面）——已知边界，不做伪原生兜底。
//
// 排版口径（2026-10-03 立，经专家团评审 + 用户两次点名后横向重排）：
// · **左右 34px** = 官方 `ChatView.scroll`（16 + clearance）⇒ 与会话正文同一条左基线；
//   **上 34 / 下 18**（同「四边等距 34」口径，与分隔线到会话正文首行的距离一致）；
// · 文件**横向排**（用户原话：「为什么要竖着一溜列？横向有这么宽」）：chip 宽**跟文件名走**，
//   短名就短、长名就长，**最少 8 字、最多 20 字**（超出出省略号 + 悬停看全文），排满自动换行；
// · **前置任务一排两个**：每块 = 任务名一行 + 产出物**同样横向排**；块前一条 3px 浅色半透明竖线，
//   跨「任务名 + 产出物」整块高度做分隔（用户口径：「横跨这两行」「把相邻的任务隔开」）；
// · **高度有上限 + 自己滚**（`max-height:min(38vh,340px)`）⇒ 前置任务再多也压不没会话区；
// · 文件 >4 折叠、前置任务 >3 折叠，折叠态每任务只出前 3 个文件；有产出的任务**排前面**；
// · 目录用官方文件夹图标；**跨工作区的目录不可点**（当前会话的工作区列不出它 ⇒ 点了必报错）。
import { createElement as h, useState } from 'react'
import { FileTypeIcon, IconFolderCloseRegular } from '@deepseek-ai/dsh-client-ui-primitives'
import { MarqueeText } from './ui'
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

/**
 * 实例快照 → 本任务工作区 path（判上游目录是否跨区用）。
 * 与 `attachmentsOf` 同款：**不强求整份快照合法**，取不到 ⇒ null（调用方按「未知」处理）。
 */
export function workspacePathOf(snapshot: string | null): string | null {
  if (snapshot === null || snapshot === '') return null
  try {
    const parsed: unknown = JSON.parse(snapshot)
    if (typeof parsed !== 'object' || parsed === null) return null
    const path = (parsed as { workspacePath?: unknown }).workspacePath
    return typeof path === 'string' && path !== '' ? path : null
  } catch {
    return null
  }
}

/** 目录标记：产出按**尾斜杠**表示目录（回执归一 `receipt.ts` normalizeOutputs 的约定）。 */
function isDirPath(path: string): boolean {
  return path.endsWith('/')
}

/** 相对路径 → 绝对路径（基准 = 上游工作区；无基准 ⇒ null，如实降级为不可点，不拿当前工作区猜）。 */
function upstreamAbsPath(base: string | null, rel: string): string | null {
  if (base === null || base === '') return null
  const trimmed = rel.replace(/^\.\//, '')
  return base.endsWith('/') ? `${base}${trimmed}` : `${base}/${trimmed}`
}

/** 文件/目录的显示名（去掉尾斜杠取最后一段）。 */
function displayName(path: string): string {
  const raw = path.replace(/\/+$/, '')
  const cut = Math.max(raw.lastIndexOf('/'), raw.lastIndexOf('\\'))
  return cut < 0 ? raw : raw.slice(cut + 1)
}

/** 工作区路径归一（补尾斜杠）后再比前缀 —— 否则 `/ws` 会把 `/ws-2` 误判成同区。 */
function inWorkspace(candidate: string, base: string): boolean {
  const norm = (value: string): string => (value.endsWith('/') ? value : `${value}/`)
  return norm(candidate).startsWith(norm(base))
}

/** 折叠阈值：文件 >4 折叠（与官方 Deliverables 同思路）；前置任务 >3 折叠。 */
const COLLAPSE_FILES = 4
const COLLAPSE_TASKS = 3
/** 任务处于折叠态时，每个任务最多露几个文件（避免 20 个任务的默认高度失控）。 */
const COLLAPSED_TASK_FILES = 3

/**
 * 快照 → 随附文件视图（服务端按 **ref** 下发了绝对路径，这里按 ref 配对，不按序）。
 * 形状不对 / 解析失败 ⇒ 空数组（不渲染该组，绝不显示假文件）。
 */
export function attachmentsOf(
  snapshot: string | null,
  paths: readonly { ref: string; path: string | null }[] | null | undefined,
): AttachedFileView[] {
  if (snapshot === null || snapshot === '') return []
  try {
    const parsed: unknown = JSON.parse(snapshot)
    if (typeof parsed !== 'object' || parsed === null) return []
    const list = (parsed as { attachments?: unknown }).attachments
    if (!Array.isArray(list)) return []
    return list.flatMap(item => {
      if (typeof item !== 'object' || item === null) return []
      const one = item as { name?: unknown; kind?: unknown; ref?: unknown }
      if (typeof one.name !== 'string' || one.name === '') return []
      if (typeof one.ref !== 'string') return []
      const hit = paths?.find(entry => entry.ref === one.ref)
      return [{
        name: one.name,
        kind: one.kind === 'upload' ? 'upload' as const : 'link' as const,
        path: hit === undefined ? null : hit.path,
      }]
    })
  } catch {
    return []
  }
}

/** 一条文件行的数据（组件内部流转用）。 */
interface FileLine {
  key: string
  /** 图标取型用的路径（目录传 `名字/` 无效 ⇒ 目录单独走文件夹图标）。 */
  iconPath: string
  isDir: boolean
  label: string
  /** 悬停全文（含为什么不可点的说明）。 */
  title: string
  /** 不可点时的短标记（独立 span，不参与文件名省略）。 */
  note?: string
  onClick?: () => void
}

/** 一个文件行：图标 + 名字 + 来源标记；有路径才可点。
 *  文件名走全站唯一实现 `MarqueeText`：放不下出省略号、hover 来回滚动露出全名
 *  （用户 2026-10-03：前置任务产出与随附文件**所有**显示不全的名字都要跑马灯）。 */
function FileChip(props: { file: FileLine }): ReturnType<typeof h> {
  const { file } = props
  const clickable = file.onClick !== undefined
  return h(clickable ? 'button' : 'span', {
    className: 'dsh-tdt-sv-tfc-file',
    ...(clickable
      ? { type: 'button' as const, title: file.title, 'aria-label': file.title, onClick: file.onClick }
      : { title: file.title, 'data-noclick': true }),
  },
    h('span', { className: 'dsh-tdt-sv-tfc-icon' },
      // 目录：官方 FileTypeIcon 按扩展名分类，尾斜杠 ⇒ 空扩展名 ⇒ 通用文件图标（不是文件夹）
      // ⇒ 目录单独用官方文件夹图标（与文件浏览器目录行同源）。
      file.isDir ? h(IconFolderCloseRegular, { size: 14 }) : h(FileTypeIcon, { path: file.iconPath, size: 14 })),
    // 来源标记**紧贴文件名前面**、用方括号（用户 2026-10-03：`[链接]foo.md`）——
    // 原来挂在最右边（正文与标记之间被 flex 撑开）⇒ 越看越像个按钮。与文件名同一 Flex 无间距容器，
    // 保证 `]` 和文件名之间不留缝。
    h('span', { className: 'dsh-tdt-sv-tfc-namewrap' },
      file.note === undefined ? null : h('span', { className: 'dsh-tdt-sv-tfc-note' }, `[${file.note}]`),
      h(MarqueeText, { text: file.label, title: file.title, style: { minWidth: 0, flex: '1 1 auto' } }),
    ),
  )
}

/** 文件行列表（含 >N 折叠；空 ⇒ 不渲染）。**横向排**（`flex-wrap`，排满换行）。 */
function FileLines(props: { files: readonly FileLine[]; t: Translate }): ReturnType<typeof h> | null {
  const { files, t } = props
  const [expanded, setExpanded] = useState(false)
  if (files.length === 0) return null
  const collapsible = files.length > COLLAPSE_FILES
  const shown = collapsible && !expanded ? files.slice(0, COLLAPSE_FILES) : files
  return h('div', { className: 'dsh-tdt-sv-tfc-files' },
    shown.map((file, index) => h(FileChip, { key: `${file.key}#${index}`, file })),
    // 「全部 N 个」也排在**同一个横向流**里（末位），不另起一行。
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

/** 一组：标题行 + 内容（组间由 CSS 加细线分隔，不靠颜色、不靠左缩进）。 */
function Group(props: { title: string; children: ReturnType<typeof h> | null }): ReturnType<typeof h> | null {
  const { title, children } = props
  if (children === null) return null
  return h('div', { className: 'dsh-tdt-sv-tfc-group' },
    h('div', { className: 'dsh-tdt-sv-tfc-head' }, h('span', { className: 'dsh-tdt-sv-tfc-title' }, title)),
    children,
  )
}

/** 接收区：按前置任务分组，组头 = 任务名 + 计划时刻；任务多 ⇒ 折叠（有产出的排前面）。 */
function ReceivedGroup(props: {
  items: readonly UpstreamInputView[]
  /** 当前会话所在工作区（跨区的目录/文件列不出来 ⇒ 降级不可点）。 */
  workspacePath: string | null
  onOpenFile?: (path: string) => void
  t: Translate
}): ReturnType<typeof h> | null {
  const { items, workspacePath, onOpenFile, t } = props
  const [expanded, setExpanded] = useState(false)
  if (items.length === 0) return null
  // 有产出的排前面：折叠态默认露 3 个，若全是「未声明产出」的空壳就毫无信息量。
  // ⚠️ 比较器必须**反对称**（第二轮评审抓出）：只写「空 ⇒ 靠后」时，两个非空任务恒返回 -1
  // ⇒ 非空任务之间会被 V8 的二分插入排序**反序**。故只比较「是否为空」这一位。
  const ordered = items.slice().sort((a, b) => (a.outputs.length > 0 ? 0 : 1) - (b.outputs.length > 0 ? 0 : 1))
  const collapsible = ordered.length > COLLAPSE_TASKS
  const shown = collapsible && !expanded ? ordered.slice(0, COLLAPSE_TASKS) : ordered
  const totalFiles = ordered.reduce((sum, item) => sum + item.outputs.length, 0)
  return h(Group, {
    title: t('tfcReceived', { tasks: ordered.length, files: totalFiles }),
    children: h('div', { className: 'dsh-tdt-sv-tfc-tasks' },
      // 序号取**显示顺序**的下标：`shown` 恒是 `ordered` 的前缀（slice）或全量 ⇒ 折叠 / 展开
      // 都不会让已显示任务的编号跳变（前 3 个始终 1、2、3，展开后接着 4、5…）。
      shown.map((item, index) => {
        // 跨工作区判定：**任一侧未知 ⇒ 当作跨区**（未知还去点 = 点了必报错，正是要拦的）；
        // 前缀比到分隔符边界（`/ws` 不得把 `/ws-2` 判成同区）。
        const crossWorkspace = workspacePath === null
          || item.workspacePath === null
          || !inWorkspace(item.workspacePath, workspacePath)
        const all = item.outputs.map(path => {
          const abs = upstreamAbsPath(item.workspacePath, path)
          const name = displayName(path)
          const dir = isDirPath(path)
          // 跨工作区：**目录**列不出来（工作区文件浏览以会话为锚、限该工作区）⇒ 不可点；
          // 普通文件按绝对路径读是允许的 ⇒ 仍可点。
          const blocked = abs === null || (dir && crossWorkspace)
          return {
            key: path,
            iconPath: name,
            isDir: dir,
            label: name,
            title: abs ?? path,
            note: abs === null ? t('tfcRelOnly') : blocked ? t('tfcCrossWorkspace') : undefined,
            onClick: !blocked && onOpenFile !== undefined && abs !== null ? (): void => { onOpenFile(abs) } : undefined,
          }
        })
        // 任务处于折叠态 ⇒ 该任务最多露 3 个文件，其余收进「+N」（控制默认高度）。
        const capped = !expanded && collapsible && all.length > COLLAPSED_TASK_FILES
          ? all.slice(0, COLLAPSED_TASK_FILES)
          : all
        return h('div', { key: `${item.task}:${item.instanceId}`, className: 'dsh-tdt-sv-tfc-task' },
          h('div', { className: 'dsh-tdt-sv-tfc-taskrow' },
            // 任务名前的标记：**一条 4px 竖线**（用户 2026-10-03：图标太大太丑，换成「和字差不多高」的竖线，
            // 宽约 4px、带小圆角）。
            h('span', { className: 'dsh-tdt-sv-tfc-taskbar' }),
            // 序号徽标：灰色圆角小方框 + 小号数字，按显示顺序 1、2、3…（⚠️ 用户 2026-10-03 二次调整：
            // 放在**竖线后面**、任务标题前面 —— 「竖线 | [1] 任务名」）。
            // ⚠️ 用方框不用正圆：任务多于 9 个时编号是两位数，正圆会被撑变形（同「筛选角标」结论）。
            h('span', { className: 'dsh-tdt-sv-tfc-seq' }, String(index + 1)),
            h('span', { className: 'dsh-tdt-sv-tfc-name', title: item.task }, item.taskTitle),
            h('span', { className: 'dsh-tdt-sv-tfc-meta' }, formatDateTime(item.scheduledAt, { fallback: item.scheduledAt })),
          ),
          all.length === 0
            ? h('div', { className: 'dsh-tdt-sv-tfc-none' }, t('tfcNoOutputs'))
            : h('div', { className: 'dsh-tdt-sv-tfc-files' },
                capped.map((file, index) => h(FileChip, { key: `${file.key}#${index}`, file })),
                // 折叠态的「还有 N 个」跟在末位（同一条横向流），不另起一行。
                capped.length < all.length
                  ? h('span', { className: 'dsh-tdt-sv-tfc-none' }, t('tfcRestFiles', { count: all.length - capped.length }))
                  : null,
              ),
        )
      }),
      collapsible
        ? h('button', {
            type: 'button',
            className: 'dsh-tdt-sv-tfc-more',
            'aria-expanded': expanded,
            onClick: () => { setExpanded(value => !value) },
          }, t(expanded ? 'tfcCollapse' : 'tfcMoreTasks', { count: ordered.length }))
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
      files: files.map(file => {
        const abs = file.path
        return {
          key: `${file.name}:${file.kind}`,
          iconPath: file.name,
          isDir: false,
          label: file.name,
          title: abs ?? `${file.name}（${t('tfcNoPath')}）`,
          note: file.kind === 'upload' ? t('tfcFromUpload') : t('tfcFromWorkspace'),
          onClick: abs !== null && onOpenFile !== undefined ? (): void => { onOpenFile(abs) } : undefined,
        }
      }),
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
  /** 当前会话所在工作区（判跨区目录可否点开）；null = 未知 ⇒ 目录一律不可点。 */
  workspacePath?: string | null
  /** U11 单一入口 `openFile`；undefined ⇒ 文件行降级纯文本（不可点）。 */
  onOpenFile?: (path: string) => void
  t: Translate
}): ReturnType<typeof h> | null {
  const { upstream, attached, workspacePath, onOpenFile, t } = props
  if (upstream.length === 0 && attached.length === 0) return null
  return h('div', { className: 'dsh-tdt-sv-tfc', 'data-task-file-context': true },
    h(ReceivedGroup, { items: upstream, workspacePath: workspacePath ?? null, onOpenFile, t }),
    h(AttachedGroup, { files: attached, onOpenFile, t }),
  )
}
