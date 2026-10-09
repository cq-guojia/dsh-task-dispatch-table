// U11 目录浏览器（面包屑导航，2026-09-28 用户拍板）：在预览 dock 内浏览工作区目录与文件。
//
// 入口与 FilePreviewPanel 同源：调用方 openFile(path) 传入的路径。本组件先 list(path) 探明是
// 目录还是文件——list 成功 ⇒ 目录（渲染树）；报 not-directory ⇒ 文件（预览，dir 取其父目录）。
//
// 头部两排：第一排 = 面包屑（目录路径，独占一排）+ 导航钮（选层▾/刷新/关闭）；
// 第二排 = 文件名（跑马灯）+ 操作按钮（md 切段 / 复制 / 刷新）——**仅文件预览态显示**，
// 目录态整排隐藏（用户 2026-09-28 本轮：没选文件时空着没意义）。目录态刷新改放第一排。
// 面包屑超宽时折叠为当前层名（行首▾点开**下拉菜单**列出全部层级、带缩进/树形连接符供选层回跳）；
// 不超长时**还原完整路径**（溢出判定用与可见态同构的隐藏测量条 + ResizeObserver，确保精确还原）。
//
// 渲染底层以官方为主（md=MarkdownText / 图片·PDF=readBytes→blob），代码源码态复用 file-preview 的 CodeViewer（只读 CodeMirror 6）；数据一律
// remote.workspaceFiles 真实取数（工作区铁律：禁模拟）。复用 file-preview.tsx 的预览体组件。
import { createElement as h, Fragment, useEffect, useLayoutEffect, useRef, useState } from 'react'
import type { CSSProperties, ReactNode } from 'react'
import { IconButton, MarqueeText, Segmented } from './ui'
import {
  FileTypeIcon,
  IconCheckOutlineRegular,
  IconChevronDownOutlineRegular,
  IconFolderCloseRegular,
  IconFolderOpenOutlineRegular,
  IconChevronRightOutlineRegular,
  IconCloseOutlineRegular,
  IconCopyOutlineRegular,
  IconRefreshOutlineRegular,
  Tooltip,
  writeClipboard,
} from '@deepseek-ai/dsh-client-ui-primitives'
import type { Translate } from './locales'
import {
  absolutePathOf,
  bareCode,
  BytesPreview,
  ErrBox,
  errView,
  HtmlPreview,
  isFailed,
  listingOf,
  OfficePreview,
  PreviewBoundary,
  previewKind,
  SOURCE_MAX_BYTES,
  TextPreview,
  type ErrView,
  type OfficeToPdfFace,
  type WorkspaceFilesFace,
} from './file-preview'

// 官方气泡提示包裹：给图标钮加 hover/focus tooltip（用户 2026-09-28：图标都缺悬停提示，统一用官方 Tooltip，不自研）。
const tooled = (label: string, node: ReactNode): ReactNode =>
  h(Tooltip, { label, side: 'bottom' }, node)

/**
 * list 的线上路径包装：**0.2.0-rc.1 起官方 list 拒绝空路径**（`gateway/bad-request` "path is required"，
 * 官方 lib/index.js `inspect()` 首行校验；0.1.7-rc.2 还允许空串列根，行为变更）。
 * 空串（= 工作区根）一律以 `'.'` 上线：路径按 `cwd = 工作区根` 归一 ⇒ `'.'` 解析为根本身，containment 通过。
 * 响应里根目录的 `path` 仍是 `''`（官方 workspacePathOf 对根返回空串）⇒ 内部目录状态 / 面包屑不受影响。
 */
function listDir(workspaceFiles: WorkspaceFilesFace, sessionId: string, dir: string): ReturnType<WorkspaceFilesFace['list']> {
  return workspaceFiles.list(sessionId, dir === '' ? '.' : dir)
}

/** 路径工具：取父目录（无父 = 空串，list('') = 工作区根）。 */
function dirnameOf(p: string): string {
  const i = Math.max(p.lastIndexOf('/'), p.lastIndexOf('\\'))
  if (i <= 0) return ''
  return p.slice(0, i)
}

/**
 * ▾ 下拉条目构造（**picker 与 dock 共用同一段代码**，差别只在入参——用户 2026-09-29 点名提炼，
 * 严禁两处各写一份）：
 * - 当前工作区排第一（打开文件夹图标 + 加粗），**其下路径紧跟**（每层一个右箭头位缩进），
 *   再列其他工作区（关合图标 + 灰）——「打开哪个就跟在哪个下面」；
 * - 当前工作区未知（rootName 空或不在清单）时路径段置顶、全部工作区按「其他」罗列；
 * - workspaces 不传 = 不显示工作区段（旧形态兜底：根无箭头、其下逐层缩进）。
 */
function crumbsMenuEntries(params: {
  workspaces: readonly string[] | undefined
  rootName: string
  /** 根完全未知时下拉的兜底占位文案（调用方传 t('explorerRootName')）。 */
  rootFallbackLabel: string
  crumbs: ReadonlyArray<{ label: string; path: string }>
  onPickWorkspace?: (name: string) => void
  onLoadDir: (path: string) => void
}): ReactNode[] {
  const { workspaces, rootName, rootFallbackLabel, crumbs, onPickWorkspace, onLoadDir } = params
  const wsEntry = (ws: string, current: boolean): ReactNode => h('button', {
    key: `ws:${ws}`,
    type: 'button',
    role: 'menuitem',
    className: 'dsh-tdt-sv-crumbs-menu-item',
    style: { paddingLeft: 8, display: 'flex', alignItems: 'center', gap: '6px' },
    title: ws,
    onClick: () => { if (!current) onPickWorkspace?.(ws) },
  },
    h('span', { style: { display: 'inline-flex', alignItems: 'center', flex: 'none', color: current ? 'var(--tdt-fg)' : 'var(--tdt-fg-2)' } },
      h(current ? IconFolderOpenOutlineRegular : IconFolderCloseRegular, { size: 13 })),
    h('span', { className: 'dsh-tdt-sv-crumbs-menu-label', style: { fontWeight: current ? 600 : 400 } }, ws),
  )
  const pathEntry = (crumb: { label: string; path: string }, depth: number, withArrow = true): ReactNode => h('button', {
    key: `p:${crumb.path}`,
    type: 'button',
    role: 'menuitem',
    className: 'dsh-tdt-sv-crumbs-menu-item',
    style: { paddingLeft: 8 },
    title: crumb.path,
    onClick: () => { onLoadDir(crumb.path) },
  },
    withArrow
      ? h(Fragment, null,
          Array.from({ length: depth }, (_, s) =>
            h('span', { key: `s${s}`, className: 'dsh-tdt-sv-crumbs-chev-slot', 'aria-hidden': true })),
          h('span', { className: 'dsh-tdt-sv-crumbs-chev' }, h(IconChevronRightOutlineRegular, { size: 11 })),
        )
      : null,
    h('span', { className: 'dsh-tdt-sv-crumbs-menu-label' }, crumb.label),
  )
  if (workspaces === undefined) {
    if (crumbs.length === 0) return [h('div', { className: 'dsh-tdt-sv-crumbs-menu-empty' }, rootFallbackLabel)]
    return crumbs.map((crumb, index) => pathEntry(crumb, index === 0 ? 0 : index - 1, index !== 0))
  }
  // 路径段：根 crumb（path=''）已由工作区段表达时剔除，深度从根下一层（0 个占位 + 1 箭头）起算。
  const segments = rootName !== '' && crumbs.length > 0 && crumbs[0].path === '' ? crumbs.slice(1) : crumbs
  const out: ReactNode[] = []
  if (rootName !== '' && workspaces.includes(rootName)) {
    // 当前工作区排第一，其下路径紧跟，然后是其他工作区（保持原相对顺序）。
    out.push(wsEntry(rootName, true))
    segments.forEach((crumb, i) => { out.push(pathEntry(crumb, i)) })
    for (const ws of workspaces) {
      if (ws !== rootName) out.push(wsEntry(ws, false))
    }
  } else {
    segments.forEach((crumb, i) => { out.push(pathEntry(crumb, i)) })
    for (const ws of workspaces) out.push(wsEntry(ws, false))
  }
  return out
}

/** 路径工具：dir 拼接 name（处理根与绝对/相对）。 */
function joinPath(dir: string, name: string): string {
  if (dir === '' || dir === '/') return (dir === '/' ? '/' : '') + name
  return dir.replace(/\/+$/, '') + '/' + name
}

/**
 * 面包屑/下拉统一按**工作区相对**展示（用户 2026-09-29：把根目录刨掉、名字不写死）。
 * dir 为宿主绝对路径时（openFile 入口 / 目录反推），用缓存的 workspaceRoot 把根剥掉——
 * 根名字每个部署都不同，绝不能写死；根未知或不在根下时原样返回（退化现行为）。
 */
function relativizeToRoot(dir: string, sessionId: string): string {
  if (!dir.startsWith('/')) return dir
  const root = workspaceRoots.get(sessionId)
  if (root === undefined) return dir
  const norm = root.replace(/\/+$/, '')
  if (dir === norm) return ''
  if (dir.startsWith(norm + '/')) return dir.slice(norm.length + 1)
  return dir
}

/** 面包屑段：把目录路径拆成可点层级（绝对路径保留前导 /）。 */
function crumbsOf(dir: string): { label: string; path: string }[] {
  const isAbs = dir.startsWith('/')
  const segs = dir.split('/').filter(s => s.length > 0)
  const out: { label: string; path: string }[] = []
  let acc = ''
  for (const seg of segs) {
    acc = acc === '' ? (isAbs ? '/' + seg : seg) : acc + '/' + seg
    out.push({ label: seg, path: acc })
  }
  return out
}

type ListEntry = { name: string; type: 'file' | 'directory' | 'other'; size?: number }

/** 子项排序：目录在前，文件在后，各自按名称（不区分大小写）升序。 */
function sortEntries(entries: readonly ListEntry[]): ListEntry[] {
  return [...entries].sort((a, b) => {
    const ad = a.type === 'directory' ? 0 : 1
    const bd = b.type === 'directory' ? 0 : 1
    if (ad !== bd) return ad - bd
    return a.name.toLowerCase().localeCompare(b.name.toLowerCase())
  })
}

/** 宿主绝对路径形态（/ 开头或 Windows 盘符）。 */
function isAbsoluteish(p: string): boolean {
  return p.startsWith('/') || p.startsWith('\\') || /^[a-zA-Z]:[\\/]/.test(p)
}

/**
 * 已探明的**工作区根**（宿主绝对路径），按会话缓存。
 * 官方没有任何「目录的绝对路径」接口（stat 只认 regular file，locateFile 对目录抛
 * not-regular-file，dsh-api-workspace-files lib/index.js:594），但工作区根可以由
 * 「任一文件的 relativePath + stat.absolutePath」反推一次后复用 ⇒ 之后**空目录 /
 * 只含子目录**的相对名目录也能拼出绝对路径（用户 2026-09-29 要求不留遗留）。
 */
const workspaceRoots = new Map<string, string>()

/** 由「相对路径 + 该文件宿主绝对路径」反推工作区根并缓存（absolute = 根 + '/' + 相对路径）。 */
function learnRoot(sessionId: string, relativePath: string, absolutePath: string): string | null {
  const rel = relativePath.replace(/^\/+/, '').replace(/\/+$/, '')
  if (rel === '' || !absolutePath.endsWith('/' + rel)) return null
  const root = absolutePath.slice(0, absolutePath.length - rel.length - 1)
  workspaceRoots.set(sessionId, root)
  return root
}

/** 相对路径拼接（保持工作区相对形态，不做绝对路径处理）。 */
function relJoin(dir: string, name: string): string {
  return dir.replace(/\/+$/, '') === '' ? name : dir.replace(/\/+$/, '') + '/' + name
}

/**
 * 在相对目录树里找**任意一个文件**并 stat（广度优先、有界：每层最多 5 个目录、最多 3 层）。
 * 用于目标目录本身没有文件子项（空目录 / 只有子目录）时反推工作区根。
 * @returns 该文件的宿主绝对路径与相对路径；找不到（工作区里一个文件都没有）返回 null。
 */
async function findAnyFileAbs(
  workspaceFiles: WorkspaceFilesFace,
  sessionId: string,
  startDir: string,
): Promise<{ absolutePath: string; relativePath: string } | null> {
  const stat = workspaceFiles.stat
  if (stat === undefined) return null
  let frontier = [startDir]
  for (let depth = 0; depth < 3 && frontier.length > 0; depth++) {
    const nextDirs: string[] = []
    for (const dir of frontier.slice(0, 5)) {
      let entries: readonly ListEntry[]
      try {
        const parsed = listingOf(await listDir(workspaceFiles, sessionId, dir))
        if (isFailed(parsed) || parsed === null) continue
        entries = parsed.entries
      } catch { continue }
      const file = entries.find(entry => entry.type === 'file')
      if (file !== undefined) {
        const rel = relJoin(dir, file.name)
        try {
          const abs = absolutePathOf(await stat(sessionId, rel))
          if (abs !== null) return { absolutePath: abs, relativePath: rel }
        } catch { /* 换下一个候选 */ }
      }
      for (const entry of entries) {
        if (entry.type === 'directory' && nextDirs.length < 5) nextDirs.push(relJoin(dir, entry.name))
      }
    }
    frontier = nextDirs
  }
  return null
}

/**
 * 把「工作区相对名」的目录解析成宿主绝对路径（面包屑才能从工作区根往下列）。
 *
 * 场景（用户 2026-09-29 实测）：交付卡 / 执行记录「产出」列把回契声明的产出**原样**传入
 * `openFile`，常是工作区相对名（如 `20260928`）⇒ 面包屑只剩这一层。
 * 解析优先级（每一步失败都自然落到下一步）：
 *   ① 工作区根已缓存 ⇒ 根 + '/' + 规范相对路径（覆盖**空目录 / 只有子目录**）；
 *   ② 目录里有文件子项 ⇒ stat 它，`absolutePath = 根 + '/' + 目录 + '/' + 文件名`，
 *      掐掉文件名即得目录绝对路径，并**记住工作区根**供后续复用；
 *   ③ 目录里没文件 ⇒ 有界 BFS 在目录树里找任一文件 stat 出根，再拼。
 * 全部失败（工作区里一个文件都没有 / stat 不可用）⇒ 退回入参，浏览不受影响。
 */
async function absolutizeDir(
  workspaceFiles: WorkspaceFilesFace,
  sessionId: string,
  dir: string,
  canonical: string,
  entries: readonly ListEntry[],
): Promise<string> {
  if (isAbsoluteish(dir)) return dir
  const rel = canonical !== '' ? canonical : dir
  const cached = workspaceRoots.get(sessionId)
  if (cached !== undefined) return cached + '/' + rel
  const stat = workspaceFiles.stat
  if (stat === undefined) return dir
  // ② 本目录里的文件子项
  const file = entries.find(entry => entry.type === 'file')
  if (file !== undefined) {
    try {
      const sub = relJoin(rel, file.name)
      const abs = absolutePathOf(await stat(sessionId, sub))
      if (abs !== null && abs.endsWith('/' + file.name) && learnRoot(sessionId, sub, abs) !== null) {
        return abs.slice(0, abs.length - file.name.length - 1)
      }
    } catch { /* 落到 ③ */ }
  }
  // ③ 有界 BFS 找一个文件反推根
  const found = await findAnyFileAbs(workspaceFiles, sessionId, rel)
  if (found === null) return dir
  const root = learnRoot(sessionId, found.relativePath, found.absolutePath)
  return root === null ? dir : root + '/' + rel
}

/** 内联展开目录拉到的子项缓存：loading / ready(子项) / error。 */
type ChildData =
  | { status: 'loading' }
  | { status: 'ready'; entries: readonly ListEntry[]; truncated: boolean }
  | { status: 'error'; error: ErrView }

/** 单个文件预览体（复用 file-preview 的官方渲染组件，外裹错误边界）。 */
function FileBody(props: {
  workspaceFiles: WorkspaceFilesFace
  /** 官方 `remote.officeToPdf`（Office 转 PDF）；未就位为 null ⇒ Office 文件出「不可用」空态。 */
  officeToPdf?: OfficeToPdfFace | null
  sessionId: string
  path: string
  sourceView: boolean
  reloadNonce: number
  t: Translate
}): ReturnType<typeof h> {
  const { workspaceFiles, officeToPdf, sessionId, path, sourceView, reloadNonce, t } = props
  const { kind, ext, mime } = previewKind(path)
  const isMd = kind === 'md'
  const isHtml = kind === 'html'
  const fallback = h(ErrBox, { err: { key: 'previewRenderFailed' }, t })
  return h(PreviewBoundary, {
    fallback,
    children: (kind === 'image' || kind === 'pdf')
      ? h(BytesPreview, { workspaceFiles, sessionId, path, kind, mime: mime ?? 'application/octet-stream', t, reloadNonce })
      : kind === 'office'
        ? h(OfficePreview, { officeToPdf: officeToPdf ?? null, sessionId, path, t, reloadNonce })
        : isHtml && !sourceView
        ? h(HtmlPreview, { workspaceFiles, sessionId, path, t, reloadNonce })
        : h(TextPreview, {
            workspaceFiles, sessionId, path, ext, markdown: isMd, sourceView, reloadNonce, t,
            maxBytes: isHtml ? SOURCE_MAX_BYTES : undefined,
          }),
  })
}

/**
 * 目录浏览器（在预览 dock 内）。与 FilePreviewPanel 同接 `openFile(path)`：
 * list(path) 成功 ⇒ 目录树；not-directory ⇒ 文件预览（dir = 父目录，面包屑保留可返回）。
 */
export function FileBrowser(props: {
  workspaceFiles: WorkspaceFilesFace
  /** 官方 `remote.officeToPdf`（Office 转 PDF）；未就位为 null ⇒ Office 文件出「不可用」空态。 */
  officeToPdf?: OfficeToPdfFace | null
  sessionId: string
  path: string
  t: Translate
  onClose: () => void
  /** 页面级 dock 形态（固定右侧 + 推压整页）。 */
  dock?: boolean
  /** 左缘拖拽条按下（调宽）；不传 = 不渲染拖拽条。preventDefault 用于掐掉拖选（由调用方决定）。 */
  onResizeStart?: (event: { clientX: number; pointerId: number; preventDefault?: () => void }) => void
  /** 选择器模式：点文件即回调 onPick（不进预览），用于「选择工作区文件」附件。 */
  picker?: boolean
  /** 选择器模式下的选文件回调（path 为**工作区相对**路径：任务定义 link 附件的 ref 口径）。 */
  onPick?: (path: string) => void
  /** 工作区根的显示名（选择器 = 用户选中的工作区名）；不传则用缓存根的末段。 */
  rootName?: string
  /**
   * ▾ 下拉顶部的工作区清单（选择器传；dock 不传 = 不显示工作区段——dock 锚定会话所属
   * 工作区，不该在浏览时切走）。当前工作区（=== rootName）用打开文件夹图标 + 加粗区分。
   */
  workspaces?: readonly string[]
  /** 从 ▾ 下拉选择其他工作区（配合 workspaces；选当前工作区为 no-op）。 */
  onSelectWorkspace?: (name: string) => void
  /** 外部容器样式（嵌入弹层时撑满高度用）。 */
  style?: CSSProperties
}): ReturnType<typeof h> {
  const { workspaceFiles, officeToPdf, sessionId, path, t, onClose, dock, onResizeStart, picker, onPick, rootName, workspaces, onSelectWorkspace, style } = props
  // mode：加载/目录树/文件预览/列举错误。viewing 非空 ⇒ 在 dir 树内预览文件。
  const [mode, setMode] = useState<'loading' | 'dir' | 'file' | 'error'>('loading')
  const [dir, setDir] = useState<string>('')
  const [listing, setListing] = useState<readonly ListEntry[] | null>(null)
  const [truncated, setTruncated] = useState(false)
  const [viewing, setViewing] = useState<string | null>(null)
  const [listErr, setListErr] = useState<ErrView | null>(null)
  // 面包屑折叠（超宽时只显示当前层名；行首文件夹图标常驻，点开下拉选层）。
  const [crumbsOverflow, setCrumbsOverflow] = useState(false)
  const [menuOpen, setMenuOpen] = useState(false)
  const barRef = useRef<HTMLDivElement>(null)
  const regionRef = useRef<HTMLDivElement>(null)
  const measureRef = useRef<HTMLSpanElement>(null)
  // 预览态：md 渲染⇄源码 + 刷新自增（触发 Bytes/Text 重读）。
  const [sourceView, setSourceView] = useState(false)
  const [reloadNonce, setReloadNonce] = useState(0)
  const [copied, setCopied] = useState(false)
  // 内联展开：openDirs = 已展开目录路径集合；childCache = 各展开目录拉到的子项（loading/ready/error）。
  const [openDirs, setOpenDirs] = useState<ReadonlySet<string>>(new Set())
  const [childCache, setChildCache] = useState<Record<string, ChildData>>({})
  // 工作区根补学完成信号（workspaceRoots 是模块级 Map 非响应式，学成后 bump 触发面包屑重算）。
  const [, setRootNonce] = useState(0)
  // 当前目录在会话工作区之外（用户 2026-10-03）：官方 list 限工作区内，越界即报 outside-workspace。
  // 依据 = list 的**真实错误码**，不靠 workspaceRoots 猜（根学不出来时会误判成"在区内"）。
  // 命中时第一排整条退化为只读完整路径：▾ 选层 / 面包屑点选 / ← 返回 / ↑ 上一层 全不渲染
  // （点在工作区外的目录必然失败 ⇒ 不给这种入口），只留 ✕ 关闭。
  const [outside, setOutside] = useState(false)

  /** 记一次 list 结果的"是否越界"（outside-workspace / not-found 均视为不可浏览）。 */
  const noteOutside = (parsed: ReturnType<typeof listingOf>): void => {
    if (parsed === null || parsed === undefined) return
    if (!isFailed(parsed)) { setOutside(false); return }
    const raw = (parsed.failed ?? {}) as { code?: unknown }
    const code = typeof raw.code === 'string' ? bareCode(raw.code) : ''
    if (code === 'outside-workspace' || code === 'not-found' || code === 'lookup-not-found') setOutside(true)
  }


  /** 列举某目录并展示（清空 viewing；收起下拉）。 */
  const fetchDir = (targetDir: string): void => {
    setDir(targetDir)
    setViewing(null)
    setListErr(null)
    setMenuOpen(false)
    setMode('loading')
    // 切换顶层目录：清空内联展开态（展开树只属于当前这一层）。
    setOpenDirs(new Set())
    setChildCache({})
    listDir(workspaceFiles, sessionId, targetDir)
      .then((result) => {
        const parsed = listingOf(result)
        noteOutside(parsed)
        if (isFailed(parsed)) { setListErr(errView(parsed.failed)); setMode('error'); return }
        if (parsed === null) { setListErr({ key: 'previewBadPayload' }); setMode('error'); return }
        setListing(parsed.entries)
        setTruncated(parsed.truncated)
        setMode('dir')
      })
      .catch((error: unknown) => { setListErr(errView(error)); setMode('error') })
  }

  /** 进入某目录：当前目录压栈（供「返回」回跳）。 */
  const loadDir = (targetDir: string): void => {
    // 点到当前目录本身 = 刷新本层（重列），避免无意义重列（用户 2026-09-28）。
    if (targetDir === dir) { fetchDir(targetDir); return }
    fetchDir(targetDir)
  }

  // 初次进入（openFile(path)；dock 以 `${sessionId}:${path}` 作 key 重挂载，故每次换新路径都会重跑）。
  useEffect(() => {
    let alive = true
    setMode('loading')
    setListErr(null)
    setViewing(null)
    setSourceView(false)
    setReloadNonce(0)
    setMenuOpen(false)
    setOpenDirs(new Set())
    setChildCache({})
    // 补学工作区根（面包屑根名显示用）：绝对路径入口此前会跳过学习（absolutizeDir / 文件 stat
    // 都对 isAbsoluteish 提前返回）⇒ dock 面包屑退化成宿主绝对层级（真机 2026-09-29 实测）。
    // 列当前目录拿**规范相对路径**（list 响应恒为工作区相对）→ 目录内有文件就 stat 它反推根，
    // 没有就走有界 BFS；学成 setRootNonce 触发重渲染。选择器不依赖它（rootName 直传）。
    const ensureRootLearned = (currentDir: string): void => {
      if (workspaceRoots.get(sessionId) !== undefined) return
      void (async () => {
        try {
          const parsed = listingOf(await listDir(workspaceFiles, sessionId, currentDir))
          if (!alive || isFailed(parsed) || parsed === null) return
          const stat = workspaceFiles.stat
          if (stat === undefined) return
          const rel = parsed.path
          const file = parsed.entries.find(entry => entry.type === 'file')
          if (file !== undefined) {
            const sub = relJoin(rel, file.name)
            const abs = absolutePathOf(await stat(sessionId, sub))
            if (abs !== null && learnRoot(sessionId, sub, abs) !== null) { setRootNonce(n => n + 1); return }
          }
          const found = await findAnyFileAbs(workspaceFiles, sessionId, rel)
          if (found !== null && learnRoot(sessionId, found.relativePath, found.absolutePath) !== null) setRootNonce(n => n + 1)
        } catch { /* 学不出就维持退化显示 */ }
      })()
    }
    listDir(workspaceFiles, sessionId, path)
      .then(async (result) => {
        if (!alive) return
        const parsed = listingOf(result)
        if (!isFailed(parsed) && parsed !== null) {
          setOutside(false)
          // 目录：直接展示树。dir 尽量取宿主绝对路径 ⇒ 面包屑从工作区根往下列。
          // 入口可能是工作区相对名（交付卡/产出列把回契声明原样传入，如 `20260928`），
          // 直接用入参面包屑只剩这一层（用户 2026-09-29 实测）。官方没有目录级绝对路径
          // 接口（stat 只认 regular file）⇒ 用目录里任一「文件」子项的 stat 反推；
          // 解析不出（空目录/只有子目录/stat 缺失）就退回入参，不阻塞浏览。
          const absDir = await absolutizeDir(workspaceFiles, sessionId, path, parsed.path, parsed.entries)
          if (!alive) return
          setDir(absDir)
          setListing(parsed.entries)
          setTruncated(parsed.truncated)
          setMode('dir')
          ensureRootLearned(absDir)
          return
        }
        // 不是目录（not-directory / not-found 等）⇒ 当作文件预览，dir 取父目录，尽量把父树也列出来。
        // 相对名文件先 stat 自身解析宿主绝对路径再取父目录（stat 恰好只认文件，此处可用）。
        let parent = dirnameOf(path)
        if (!isAbsoluteish(path)) {
          const stat = workspaceFiles.stat
          if (stat !== undefined) {
            try {
              const abs = absolutePathOf(await stat(sessionId, path))
              if (abs !== null) {
                parent = dirnameOf(abs)
                // 顺带把工作区根记住 ⇒ 之后同会话里「空目录 / 只含子目录」的相对名也能解析。
                learnRoot(sessionId, path, abs)
              }
            } catch { /* 解析不出就用入参父目录 */ }
          }
        }
        if (!alive) return
        setDir(parent)
        setViewing(path)
        setMode('file')
        ensureRootLearned(parent)
        listDir(workspaceFiles, sessionId, parent)
          .then((pres) => {
            if (!alive) return
            const pl = listingOf(pres)
            noteOutside(pl)
            if (!isFailed(pl) && pl !== null) {
              setListing(pl.entries)
              setTruncated(pl.truncated)
            }
          })
          .catch(() => { /* 父树列不出不影响文件预览 */ })
      })
      .catch(() => {
        if (!alive) return
        // 传输层失败：仍尝试按文件预览（预览体内部会给出错误态）。
        const parent = dirnameOf(path)
        setDir(parent)
        setViewing(path)
        setMode('file')
        ensureRootLearned(parent)
      })
    return () => { alive = false }
  }, [workspaceFiles, sessionId, path])

  // 面包屑溢出测量：隐藏测量条渲染与可见态完全相同的 crumb 按钮（含 padding/max-width），
  // 使溢出判定与真实排版一致——不超长时必定还原完整路径（用户本轮 point3）。ResizeObserver
  // 同时覆盖 dock 宽度变化 / 初次布局，避免初始 0 宽造成的「卡在折叠态」。
  useLayoutEffect(() => {
    const region = regionRef.current
    const measure = measureRef.current
    if (region === null || measure === null) return
    const recompute = (): void => {
      setCrumbsOverflow(measure.scrollWidth > region.clientWidth + 1)
    }
    recompute()
    const ro = new ResizeObserver(recompute)
    ro.observe(region)
    return () => ro.disconnect()
  }, [dir, viewing, mode, listing])

  const reload = (): void => {
    if (viewing !== null) { setReloadNonce(n => n + 1); return }
    loadDir(dir)
  }

  const copyPath = (): void => {
    const target = viewing ?? dir
    if (target === '') return
    void writeClipboard(target).then(ok => { if (ok) { setCopied(true); window.setTimeout(() => setCopied(false), 1500) } })
  }

  /** 内联展开/收起某目录（点 ▸）：只切展开态，不导航、不进历史；首次展开才拉子项。 */
  const toggleDir = (path: string): void => {
    setOpenDirs(prev => {
      const next = new Set(prev)
      if (next.has(path)) next.delete(path); else next.add(path)
      return next
    })
    if (!(path in childCache)) {
      setChildCache(prev => ({ ...prev, [path]: { status: 'loading' } }))
      listDir(workspaceFiles, sessionId, path)
        .then((result) => {
          const parsed = listingOf(result)
          if (isFailed(parsed)) { setChildCache(prev => ({ ...prev, [path]: { status: 'error', error: errView(parsed.failed) } })); return }
          if (parsed === null) { setChildCache(prev => ({ ...prev, [path]: { status: 'error', error: { key: 'previewBadPayload' } } })); return }
          setChildCache(prev => ({ ...prev, [path]: { status: 'ready', entries: parsed.entries, truncated: parsed.truncated } }))
        })
        .catch((error: unknown) => { setChildCache(prev => ({ ...prev, [path]: { status: 'error', error: errView(error) } })) })
    }
  }

  /** 递归渲染目录树（内联展开）。file = 点开预览；dir = ▸ 切展开、名字点导航。 */
  const renderTree = (entries: readonly ListEntry[], baseDir: string): ReactNode => {
    return sortEntries(entries).map((entry) => {
      const childPath = joinPath(baseDir, entry.name)
      const isDir = entry.type === 'directory'
      if (!isDir) {
        const pick = (): void => {
          // 选择器回调**工作区相对路径**（用户 2026-09-30 真机 bug）：任务定义的 link 附件 `ref` 必须是
          // 工作区相对路径——宿主 zod 拒绝绝对路径 / `..` / 反斜杠，派发期再按来源工作区把它绝对化
          // （`reconcile.ts` 的 `join(工作区根, ref)`）。此前回传绝对路径 ⇒ 保存被 422 拒。
          if (picker && onPick !== undefined) { onPick(relativizeToRoot(childPath, sessionId)); return }
          setViewing(childPath); setReloadNonce(0); setSourceView(false)
        }
        return h('div', {
          key: childPath,
          className: 'dsh-tdt-sv-tree-row' + (picker === true ? ' dsh-tdt-sv-tree-row-pick' : ''),
          role: 'button',
          tabIndex: 0,
          title: picker === true ? t('editorPickerPick') : childPath,
          onClick: pick,
          onKeyDown: (event: { key: string }) => { if (event.key === 'Enter' || event.key === ' ') pick() },
        },
          h('span', { className: 'dsh-tdt-sv-tree-icon' }, h(FileTypeIcon, { path: childPath, size: 18 })),
          h('span', { className: 'dsh-tdt-sv-tree-name' }, entry.name),
        )
      }
      const cached: ChildData | undefined = childCache[childPath]
      const isOpen = openDirs.has(childPath)
      // 目录行的点击（用户 2026-10-09：文件夹本身要能当附件）：picker 模式 = 整行选此目录，
      // 非 picker 才导航进该目录。回传工作区相对路径，task-editor 取 basename 当 name
      // ⇒ 用户口头说的「附件里的 XX」就是这条。▸ 仍负责内联展开（自身 stopPropagation）。
      const pickDir = (): void => {
        if (picker === true && onPick !== undefined) { onPick(relativizeToRoot(childPath, sessionId)); return }
        loadDir(childPath)
      }
      return h(Fragment, { key: childPath },
        h('div', {
          className: 'dsh-tdt-sv-tree-row' + (picker === true ? ' dsh-tdt-sv-tree-row-pick' : ''),
          role: 'button',
          tabIndex: 0,
          title: picker === true ? t('editorPickerPickDir') : childPath,
          onClick: pickDir,
          onKeyDown: (event: { key: string }) => { if (event.key === 'Enter' || event.key === ' ') pickDir() },
        },
          tooled(isOpen ? t('explorerCollapse') : t('explorerExpand'),
            h('button', {
              type: 'button',
              className: 'dsh-tdt-sv-tree-toggle' + (isOpen ? ' dsh-tdt-sv-tree-toggle-open' : ''),
              'aria-expanded': isOpen,
              'aria-label': isOpen ? t('explorerCollapse') : t('explorerExpand'),
              onClick: (event: { stopPropagation: () => void }) => { event.stopPropagation(); toggleDir(childPath) },
            }, h(IconChevronRightOutlineRegular, { size: 16 }))),
          h('span', { className: 'dsh-tdt-sv-tree-name' }, entry.name),
        ),
        isOpen
          ? h('div', { className: 'dsh-tdt-sv-tree-children' },
              // 硬性规定：**不新建 / 不改造 Loading**，也**不写加载文案** ⇒ 还在拉就**空着**（用户 2026-10-05）。
              cached === undefined || cached.status === 'loading'
                ? null
                : cached.status === 'error'
                  ? h('div', { className: 'dsh-tdt-sv-tree-err' }, t(cached.error.key, cached.error.params))
                  : h(Fragment, null,
                      renderTree(cached.entries, childPath),
                      cached.truncated ? h('div', { className: 'dsh-tdt-sv-tree-truncated' }, t('explorerTruncated')) : null,
                    ),
            )
          : null,
      )
    })
  }

  // 面包屑 = 入参路径（宿主绝对形态，如 /workspace/Temp）逐段展开 ⇒ 从工作区根往下列。
  // 相对名入口（交付卡/产出列）已在初次进入时经 absolutizeDir / stat 解析成宿主绝对路径（含空目录/只含子目录：workspace-root 缓存 + 有界 BFS）。
  // ⚠️ 切勿改用服务端 list 返回的 path 当面包屑：那是 workspacePathOf(root, target) 的
  //    **工作区相对**形式（dsh-api-workspace-files lib/index.js:494），会丢掉根以下的前导段，
  //    面包屑只剩最近一层（2026-09-29 踩过 ⇒ 已回退为入参路径）。
  // 面包屑/下拉 = **工作区根 + 其下相对层级**（用户 2026-09-29：从选中的工作区目录开始，
  // 工作区再往上不显示；根名不写死——选择器传 rootName，dock 用缓存根的末段）。
  // 根未知（缓存未学出且无 rootName）时退化为原样 crumbs（可能是绝对层级）。
  const rootAbs = workspaceRoots.get(sessionId)
  const rootLabel = props.rootName ?? (rootAbs !== undefined ? rootAbs.replace(/\/+$/, '').split('/').pop() ?? '' : '')
  const crumbs = rootLabel !== ''
    ? [{ label: rootLabel, path: '' }, ...crumbsOf(relativizeToRoot(dir, sessionId))]
    : crumbsOf(dir)
  // md / html 都出「渲染 ⇄ 源码」切换（HTML 入口形态照 md 抄；默认都是预览）。
  const switchKind = viewing !== null ? previewKind(viewing).kind : null
  const isMdPreview = switchKind === 'md'
  const isHtmlPreview = switchKind === 'html'
  const switchable = isMdPreview || isHtmlPreview

  /**
   * 工作区之外时的第一排：**只读完整路径**（用户 2026-10-03）。
   * 不给任何会失败的入口：▾ 选层（下拉里全是点不动的层）、面包屑点选、← 返回、↑ 上一层
   * 全部不渲染，只留 ✕ 关闭；路径过长省略号截断，**hover 跑马灯**（同文件名那套，用户点名；
   * 不可点、无 tooltip）。
   */
  const crumbbarPlain: ReactNode = h('nav', {
    className: 'dsh-tdt-sv-crumbbar',
    'aria-label': t('explorerCrumbsAria'),
  },
    // 只读完整路径走全站唯一 MarqueeText（等宽 + 灰字皮肤由 `-inner` 类带出）。
    // 旧手写版内层 overflow:hidden ⇒ 盒子被压到容器宽、滚的是「半截文本」（尾部永不显示 + 右侧黑块）。
    h(MarqueeText, {
      text: dir,
      title: dir,
      className: 'dsh-tdt-sv-crumbbar-plain-inner',
      style: { flex: '1 1 auto', minWidth: 0 },
    }),
    h('div', { className: 'dsh-tdt-sv-head-actions' },
      tooled(t('previewClose'),
        h(IconButton, {
          variant: 'plain', size: 'md', icon: h(IconCloseOutlineRegular, { size: 14 }),
          label: t('previewClose'),
          onClick: onClose,
        })),
  )
  )

  // —— 主体 ——
  let body: ReactNode
  if (viewing !== null) {
    body = h(FileBody, { workspaceFiles, officeToPdf, sessionId, path: viewing, sourceView, reloadNonce, t })
  } else if (mode === 'error' && listErr !== null) {
    // 列举失败（如 outside-workspace）：只给错误文案；关闭预览（✕）即退出——
    // 导航已改由面包屑点选 + ▾ 选层承担（2026-10-05 移除历史栈「返回」）。
    body = h('div', { className: 'dsh-tdt-sv-preview-body' },
      h('div', { className: 'dsh-tdt-sv-preview-err' },
        h('span', null, t(listErr.key, listErr.params)),
      ),
    )
  } else if (listing !== null) {
    body = listing.length === 0
      ? h('div', { className: 'dsh-tdt-sv-preview-body' },
        h('div', { className: 'dsh-tdt-sv-hint' }, t('explorerEmpty')))
      : h('div', { className: 'dsh-tdt-sv-tree' },
        renderTree(listing, dir),
        truncated
          ? h('div', { className: 'dsh-tdt-sv-tree-truncated' }, t('explorerTruncated'))
          : null,
      )
  } else {
    // 同上：不动 Loading、不写加载文案 ⇒ 空着。
    body = h('div', { className: 'dsh-tdt-sv-preview-body' })
  }

  return h('aside', {
    className: dock === true ? 'dsh-tdt-sv-preview dsh-tdt-sv-preview-dock' : 'dsh-tdt-sv-preview',
    'data-preview-dock': dock === true ? true : undefined,
    style: style ?? undefined,
  },
    onResizeStart === undefined ? null
      : h('div', {
        className: 'dsh-tdt-resizer dsh-tdt-sv-resizer',
        role: 'separator',
        'aria-orientation': 'vertical',
        title: t('previewResize'),
        onPointerDown: (event: { clientX: number; pointerId: number; preventDefault?: () => void }) => { onResizeStart(event) },
      }),
    // 第一排（用户 2026-09-28 五验拍板顺序）：[▾ 选层] [面包屑…] [✕ 关闭]。
    // 下拉菜单挂在 crumbbar（overflow 可见）下，不被面包屑区域裁剪。
    // ⚠️ 工作区之外（用户 2026-10-03）⇒ 整条换成只读完整路径（见 crumbbarPlain）。
    outside ? crumbbarPlain : h('nav', {
      ref: barRef,
      className: 'dsh-tdt-sv-crumbbar',
      'aria-label': t('explorerCrumbsAria'),
    },
      h('div', { className: 'dsh-tdt-sv-crumbs-menu-wrap' },
        tooled(t('explorerLevels'),
          h(IconButton, {
            variant: 'plain', size: 'md', icon: h(IconChevronDownOutlineRegular, { size: 14 }),
            label: t('explorerLevels'),
            'aria-expanded': menuOpen,
            onClick: () => { setMenuOpen(value => !value) },
          })),
        menuOpen
          ? h(Fragment, null,
            h('div', { className: 'dsh-tdt-sv-crumbs-backdrop', onClick: () => { setMenuOpen(false) } }),
            h('div', { className: 'dsh-tdt-sv-crumbs-menu', role: 'menu' },
              // 条目构造 = 模块级共用函数（picker 与 dock 同一段代码，用户 2026-09-29 点名提炼）。
              crumbsMenuEntries({
                workspaces,
                rootName: rootLabel,
                rootFallbackLabel: t('explorerRootName'),
                crumbs,
                onPickWorkspace: onSelectWorkspace,
                onLoadDir: loadDir,
              }),
            ))
          : null,
      ),
      h('div', { ref: regionRef, className: 'dsh-tdt-sv-crumbs-region' },
        // 隐藏测量条：渲染与可见态完全相同的 crumb 按钮（含 padding/max-width），使溢出判定
        // 与真实排版一致——不超长时必定还原完整路径（用户本轮 point3）。
        h('span', { ref: measureRef, className: 'dsh-tdt-sv-crumbs-measure', 'aria-hidden': true },
          crumbs.length === 0
            ? h('button', { type: 'button', className: 'dsh-tdt-sv-crumb', disabled: true, tabIndex: -1 }, t('explorerRootName'))
            : crumbs.map((crumb, index) => h(Fragment, { key: crumb.path },
              index > 0 ? h(IconChevronRightOutlineRegular, { size: 12 }) : null,
              h('button', { type: 'button', className: 'dsh-tdt-sv-crumb', disabled: true, tabIndex: -1 }, crumb.label),
            ))),
        // 工作区根目录（crumbs 空）也要有可见的面包屑占位（用户 2026-09-29：从工作区开始列）。
        crumbsOverflow
          ? h('span', { className: 'dsh-tdt-sv-crumb dsh-tdt-sv-crumb-current' },
            crumbs.length > 0 ? crumbs[crumbs.length - 1].label : t('explorerRootName'))
          : crumbs.length === 0
            ? h('span', { className: 'dsh-tdt-sv-crumb dsh-tdt-sv-crumb-current' }, t('explorerRootName'))
            : crumbs.map((crumb, index) => h(Fragment, { key: crumb.path },
            index > 0 ? h(IconChevronRightOutlineRegular, { className: 'dsh-tdt-sv-crumb-sep', size: 12 }) : null,
            h('button', {
              type: 'button',
              className: 'dsh-tdt-sv-crumb',
              onClick: () => { loadDir(crumb.path) },
            }, crumb.label),
          )),
      ),
      h('div', { className: 'dsh-tdt-sv-head-actions' },
        tooled(t('previewClose'),
          h(IconButton, {
            variant: 'plain', size: 'md', icon: h(IconCloseOutlineRegular, { size: 14 }),
            label: t('previewClose'),
            onClick: onClose,
          })),
      ),
    ),
    // （用户本轮 point1：没选文件时空着没意思，复制/刷新本就该随文件走）。
    viewing !== null
      ? h('div', { className: 'dsh-tdt-sv-titlebar' },
        // 文件名走全站唯一 MarqueeText（超长省略号，hover 跑一遍停在尾字）。
        h(MarqueeText, {
          text: viewing.slice(Math.max(viewing.lastIndexOf('/'), viewing.lastIndexOf('\\')) + 1),
          title: viewing,
          className: 'dsh-tdt-sv-preview-title-inner',
          style: { flex: '1 1 auto', minWidth: 0 },
        }),
        h('div', { className: 'dsh-tdt-sv-head-actions' },
          switchable
            ?             h(Segmented, {
              size: 'sm',
              variant: 'default',
              label: t(isMdPreview ? 'previewMdSwitchAria' : 'previewHtmlSwitchAria'),
              value: sourceView ? 'source' : 'render',
              items: [
                { value: 'render', label: t('previewRender') },
                { value: 'source', label: t('previewSource') },
              ],
              onChange: (next: string) => { setSourceView(next === 'source') },
            })
            : null,
          tooled(t('previewCopyPath'),
            h(IconButton, {
              variant: 'plain', size: 'md', icon: copied ? h(IconCheckOutlineRegular, { size: 14 }) : h(IconCopyOutlineRegular, { size: 14 }),
              label: t('previewCopyPath'),
              onClick: copyPath,
            })),
          tooled(t('previewRefresh'),
            h(IconButton, {
              variant: 'plain', size: 'md', icon: h(IconRefreshOutlineRegular, { size: 14 }),
              label: t('previewRefresh'),
              onClick: reload,
            })),
        ),
      )
      : null,
    body,
  )
}
