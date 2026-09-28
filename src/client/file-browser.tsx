// U11 目录浏览器（面包屑导航，2026-09-28 用户拍板）：在预览 dock 内浏览工作区目录与文件。
//
// 入口与 FilePreviewPanel 同源：调用方 openFile(path) 传入的路径。本组件先 list(path) 探明是
// 目录还是文件——list 成功 ⇒ 目录（渲染树）；报 not-directory ⇒ 文件（预览，dir 取其父目录）。
//
// 头部两排（用户 2026-09-28 三验拍板）：第一排 = 面包屑（目录路径，独占一排）；
// 第二排 = 文件名（跑马灯）+ 操作按钮（md 切段 / 复制 / 刷新 / 关闭）。
// 面包屑超宽时折叠：行首出一个小图标，点开**下拉菜单**列出全部层级供选层回跳（不换行展开）。
//
// 渲染底层全官方（md=MarkdownText / 代码=CodeBlock / 图片·PDF=readBytes→blob），数据一律
// remote.workspaceFiles 真实取数（工作区铁律：禁模拟）。复用 file-preview.tsx 的预览体组件。
import { createElement as h, Fragment, useEffect, useLayoutEffect, useRef, useState } from 'react'
import type { ReactNode } from 'react'
import {
  FileTypeIcon,
  IconCheckOutlineRegular,
  IconChevronDownOutlineRegular,
  IconChevronRightOutlineRegular,
  IconChevronUpOutlineRegular,
  IconCloseOutlineRegular,
  IconCopyOutlineRegular,
  IconRefreshOutlineRegular,
  writeClipboard,
} from '@deepseek-ai/dsh-client-ui-primitives'
import type { Translate } from './locales'
import {
  BytesPreview,
  ErrBox,
  errView,
  isFailed,
  listingOf,
  PreviewBoundary,
  previewKind,
  TextPreview,
  type ErrView,
  type WorkspaceFilesFace,
} from './file-preview'

/** 路径工具：取父目录（无父 = 空串，list('') = 工作区根）。 */
function dirnameOf(p: string): string {
  const i = Math.max(p.lastIndexOf('/'), p.lastIndexOf('\\'))
  if (i <= 0) return ''
  return p.slice(0, i)
}

/** 路径工具：dir 拼接 name（处理根与绝对/相对）。 */
function joinPath(dir: string, name: string): string {
  if (dir === '' || dir === '/') return (dir === '/' ? '/' : '') + name
  return dir.replace(/\/+$/, '') + '/' + name
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

/** 单个文件预览体（复用 file-preview 的官方渲染组件，外裹错误边界）。 */
function FileBody(props: {
  workspaceFiles: WorkspaceFilesFace
  sessionId: string
  path: string
  sourceView: boolean
  reloadNonce: number
  t: Translate
}): ReturnType<typeof h> {
  const { workspaceFiles, sessionId, path, sourceView, reloadNonce, t } = props
  const { kind, ext, mime } = previewKind(path)
  const isMd = kind === 'md'
  const fallback = h(ErrBox, { err: { key: 'previewRenderFailed' }, t })
  return h(PreviewBoundary, {
    fallback,
    children: (kind === 'image' || kind === 'pdf')
      ? h(BytesPreview, { workspaceFiles, sessionId, path, kind, mime: mime ?? 'application/octet-stream', t, reloadNonce })
      : h(TextPreview, { workspaceFiles, sessionId, path, ext, markdown: isMd, sourceView, reloadNonce, t }),
  })
}

/**
 * 目录浏览器（在预览 dock 内）。与 FilePreviewPanel 同接 `openFile(path)`：
 * list(path) 成功 ⇒ 目录树；not-directory ⇒ 文件预览（dir = 父目录，面包屑保留可返回）。
 */
export function FileBrowser(props: {
  workspaceFiles: WorkspaceFilesFace
  sessionId: string
  path: string
  t: Translate
  onClose: () => void
  /** 页面级 dock 形态（固定右侧 + 推压整页）。 */
  dock?: boolean
  /** 左缘拖拽条按下（调宽）；不传 = 不渲染拖拽条。 */
  onResizeStart?: (event: { clientX: number; pointerId: number }) => void
}): ReturnType<typeof h> {
  const { workspaceFiles, sessionId, path, t, onClose, dock, onResizeStart } = props
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
  // 导航历史栈：loadDir 压栈，「返回」弹栈回上一次位置（报错页的返回按钮同源）。
  const [history, setHistory] = useState<string[]>([])
  const barRef = useRef<HTMLDivElement>(null)
  const regionRef = useRef<HTMLDivElement>(null)
  const measureRef = useRef<HTMLSpanElement>(null)
  // 文件名跑马灯（同 FilePreviewPanel：超长省略，hover 时向左滚动露出全名）。
  const titleRef = useRef<HTMLSpanElement>(null)
  const titleInnerRef = useRef<HTMLSpanElement>(null)
  // 预览态：md 渲染⇄源码 + 刷新自增（触发 Bytes/Text 重读）。
  const [sourceView, setSourceView] = useState(false)
  const [reloadNonce, setReloadNonce] = useState(0)
  const [copied, setCopied] = useState(false)

  const startMarquee = (): void => {
    const outer = titleRef.current
    const inner = titleInnerRef.current
    if (outer === null || inner === null) return
    inner.style.maxWidth = 'none'
    inner.style.textOverflow = 'clip'
    const shift = inner.scrollWidth - outer.clientWidth
    if (shift > 0) {
      inner.style.transition = 'transform 3s linear'
      void inner.offsetWidth
      inner.style.transform = `translateX(${-shift}px)`
    }
  }
  const stopMarquee = (): void => {
    const inner = titleInnerRef.current
    if (inner === null) return
    inner.style.transition = 'none'
    inner.style.transform = 'translateX(0)'
    inner.style.maxWidth = ''
    inner.style.textOverflow = ''
  }

  /** 列举某目录并展示（清空 viewing；收起下拉）。 */
  const fetchDir = (targetDir: string): void => {
    setDir(targetDir)
    setViewing(null)
    setListErr(null)
    setMenuOpen(false)
    setMode('loading')
    workspaceFiles.list(sessionId, targetDir)
      .then((result) => {
        const parsed = listingOf(result)
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
    setHistory(prev => [...prev, dir])
    fetchDir(targetDir)
  }

  /** 返回上一次位置（历史栈弹栈；报错页的返回按钮同源）。 */
  const goBack = (): void => {
    if (history.length === 0) return
    const target = history[history.length - 1]
    setHistory(history.slice(0, -1))
    fetchDir(target)
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
    workspaceFiles.list(sessionId, path)
      .then((result) => {
        if (!alive) return
        const parsed = listingOf(result)
        if (!isFailed(parsed) && parsed !== null) {
          // 目录：直接展示树。
          setDir(path)
          setListing(parsed.entries)
          setTruncated(parsed.truncated)
          setMode('dir')
          return
        }
        // 不是目录（not-directory / not-found 等）⇒ 当作文件预览，dir 取父目录，尽量把父树也列出来。
        const parent = dirnameOf(path)
        setDir(parent)
        setViewing(path)
        setMode('file')
        workspaceFiles.list(sessionId, parent)
          .then((pres) => {
            if (!alive) return
            const pl = listingOf(pres)
            if (!isFailed(pl) && pl !== null) { setListing(pl.entries); setTruncated(pl.truncated) }
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
      })
    return () => { alive = false }
  }, [workspaceFiles, sessionId, path])

  // 面包屑溢出测量：隐藏测量条永远渲染完整面包屑，宽度超面包屑区域 ⇒ 折叠为当前层名。
  useLayoutEffect(() => {
    const region = regionRef.current
    const measure = measureRef.current
    if (region === null || measure === null) return
    setCrumbsOverflow(measure.scrollWidth > region.clientWidth + 1)
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

  const crumbs = crumbsOf(dir)
  const isMdPreview = viewing !== null && previewKind(viewing).kind === 'md'

  // —— 主体 ——
  let body: ReactNode
  if (viewing !== null) {
    body = h(FileBody, { workspaceFiles, sessionId, path: viewing, sourceView, reloadNonce, t })
  } else if (mode === 'error' && listErr !== null) {
    // 列举失败（如 outside-workspace）：错误文案 + 「返回」按钮回上一次位置（用户 2026-09-28 四验：
    // 停在报错页没有任何办法回去，必须在报错下面给一个返回）。
    body = h('div', { className: 'dsh-tdt-sv-preview-body' },
      h('div', { className: 'dsh-tdt-sv-preview-err' },
        h('span', null, t(listErr.key, listErr.params)),
      ),
      history.length > 0
        ? h('div', { className: 'dsh-tdt-sv-err-actions' },
          h('button', { type: 'button', className: 'dsh-tdt-sv-err-back', onClick: goBack }, t('explorerBack')))
        : null,
    )
  } else if (listing !== null) {
    body = listing.length === 0
      ? h('div', { className: 'dsh-tdt-sv-preview-body' },
        h('div', { className: 'dsh-tdt-sv-hint' }, t('explorerEmpty')))
      : h('div', { className: 'dsh-tdt-sv-tree' },
        sortEntries(listing).map((entry) => {
          const childPath = joinPath(dir, entry.name)
          const isDir = entry.type === 'directory'
          return h('div', {
            key: childPath,
            className: 'dsh-tdt-sv-tree-row',
            role: 'button',
            tabIndex: 0,
            title: childPath,
            onClick: () => { if (isDir) loadDir(childPath); else { setViewing(childPath); setReloadNonce(0); setSourceView(false) } },
            onKeyDown: (event: { key: string }) => { if (event.key === 'Enter' || event.key === ' ') { if (isDir) loadDir(childPath); else { setViewing(childPath); setReloadNonce(0); setSourceView(false) } } },
          },
            h('span', { className: 'dsh-tdt-sv-tree-icon' },
              isDir
                ? h(IconChevronRightOutlineRegular, { size: 16 })
                : h(FileTypeIcon, { path: childPath, size: 18 })),
            h('span', { className: 'dsh-tdt-sv-tree-name' }, entry.name),
          )
        }),
        truncated
          ? h('div', { className: 'dsh-tdt-sv-tree-truncated' }, t('explorerTruncated'))
          : null,
      )
  } else {
    body = h('div', { className: 'dsh-tdt-sv-preview-body' },
      h('div', { className: 'dsh-tdt-sv-hint' }, t('previewLoading')))
  }

  return h('aside', {
    className: dock === true ? 'dsh-tdt-sv-preview dsh-tdt-sv-preview-dock' : 'dsh-tdt-sv-preview',
    'data-preview-dock': dock === true ? true : undefined,
  },
    onResizeStart === undefined ? null
      : h('div', {
        className: 'dsh-tdt-sv-resizer',
        role: 'separator',
        'aria-orientation': 'vertical',
        title: t('previewResize'),
        onPointerDown: (event: { clientX: number; pointerId: number }) => { onResizeStart(event) },
      }),
    // 第一排：常驻图标组（下拉选层 / 返回上一层 / 返回）+ 面包屑区域（独占一排）。
    // 下拉菜单挂在 crumbbar（overflow 可见）下，不被面包屑区域裁剪（四验修复：之前被 overflow:hidden 挡住）。
    h('nav', {
      ref: barRef,
      className: 'dsh-tdt-sv-crumbbar',
      'aria-label': t('explorerCrumbsAria'),
    },
      h('div', { className: 'dsh-tdt-sv-crumbs-menu-wrap' },
        h('button', {
          type: 'button',
          className: 'dsh-tdt-sv-head-btn',
          'aria-label': t('explorerLevels'),
          title: t('explorerLevels'),
          'aria-expanded': menuOpen,
          onClick: () => { setMenuOpen(value => !value) },
        }, h(IconChevronDownOutlineRegular, { size: 14 })),
        menuOpen
          ? h(Fragment, null,
            h('div', { className: 'dsh-tdt-sv-crumbs-backdrop', onClick: () => { setMenuOpen(false) } }),
            h('div', { className: 'dsh-tdt-sv-crumbs-menu', role: 'menu' },
              crumbs.length === 0
                ? h('div', { className: 'dsh-tdt-sv-crumbs-menu-empty' }, t('explorerRootName'))
                : crumbs.map(crumb => h('button', {
                  key: crumb.path,
                  type: 'button',
                  role: 'menuitem',
                  className: 'dsh-tdt-sv-crumbs-menu-item',
                  title: crumb.path,
                  onClick: () => { loadDir(crumb.path) },
                }, crumb.label)),
            ))
          : null,
      ),
      h('button', {
        type: 'button',
        className: 'dsh-tdt-sv-head-btn',
        'aria-label': t('explorerUp'),
        title: t('explorerUp'),
        disabled: dir === '',
        onClick: () => { const p = dirnameOf(dir); if (p !== dir) loadDir(p) },
      }, h(IconChevronUpOutlineRegular, { size: 14 })),
      h('button', {
        type: 'button',
        className: 'dsh-tdt-sv-head-btn',
        'aria-label': t('explorerBack'),
        title: t('explorerBack'),
        disabled: history.length === 0,
        onClick: goBack,
      }, h('span', { className: 'dsh-tdt-sv-icon-back' }, h(IconChevronRightOutlineRegular, { size: 14 }))),
      h('div', { ref: regionRef, className: 'dsh-tdt-sv-crumbs-region' },
        h('span', { ref: measureRef, className: 'dsh-tdt-sv-crumbs-measure', 'aria-hidden': true },
          crumbs.map((crumb, index) => h(Fragment, { key: crumb.path },
            index > 0 ? h(IconChevronRightOutlineRegular, { size: 12 }) : null,
            h('span', null, crumb.label),
          ))),
        crumbsOverflow
          ? crumbs.length > 0
            ? h('span', { className: 'dsh-tdt-sv-crumb dsh-tdt-sv-crumb-current' }, crumbs[crumbs.length - 1].label)
            : null
          : crumbs.map((crumb, index) => h(Fragment, { key: crumb.path },
            index > 0 ? h(IconChevronRightOutlineRegular, { className: 'dsh-tdt-sv-crumb-sep', size: 12 }) : null,
            h('button', {
              type: 'button',
              className: 'dsh-tdt-sv-crumb',
              onClick: () => { loadDir(crumb.path) },
            }, crumb.label),
          )),
      ),
    ),
    // 第二排：文件名（跑马灯）+ 操作按钮。
    h('div', { className: 'dsh-tdt-sv-titlebar' },
      viewing !== null
        ? h('span', { ref: titleRef, className: 'dsh-tdt-sv-preview-title', onMouseEnter: startMarquee, onMouseLeave: stopMarquee },
          h('span', { ref: titleInnerRef, className: 'dsh-tdt-sv-preview-title-inner', title: viewing },
            viewing.slice(Math.max(viewing.lastIndexOf('/'), viewing.lastIndexOf('\\')) + 1)))
        : h('span', { className: 'dsh-tdt-sv-preview-title' }),
      h('div', { className: 'dsh-tdt-sv-head-actions' },
        isMdPreview
          ? h('div', {
            className: 'dsh-tdt-sv-seg',
            role: 'group',
            'aria-label': t('previewMdSwitchAria'),
          },
            h('button', { type: 'button', className: 'dsh-tdt-sv-seg-btn', 'aria-pressed': !sourceView, onClick: () => { setSourceView(false) } }, t('previewRender')),
            h('button', { type: 'button', className: 'dsh-tdt-sv-seg-btn', 'aria-pressed': sourceView, onClick: () => { setSourceView(true) } }, t('previewSource')),
          )
          : null,
        h('button', {
          type: 'button',
          className: 'dsh-tdt-sv-head-btn',
          'aria-label': t('previewCopyPath'),
          title: t('previewCopyPath'),
          onClick: copyPath,
        }, copied ? h(IconCheckOutlineRegular, { size: 14 }) : h(IconCopyOutlineRegular, { size: 14 })),
        h('button', {
          type: 'button',
          className: 'dsh-tdt-sv-head-btn',
          'aria-label': t('previewRefresh'),
          title: t('previewRefresh'),
          onClick: reload,
        }, h(IconRefreshOutlineRegular, { size: 14 })),
        h('button', {
          type: 'button',
          className: 'dsh-tdt-sv-head-btn dsh-tdt-sv-close',
          'aria-label': t('previewClose'),
          title: t('previewClose'),
          onClick: onClose,
        }, h(IconCloseOutlineRegular, { size: 14 })),
      ),
    ),
    body,
  )
}
