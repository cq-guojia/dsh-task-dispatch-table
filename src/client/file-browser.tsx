// 工作区文件浏览器 / 预览 —— **业务薄壳**（2026-11-06）。
//
// 浏览与预览本体已整体改用核心 `dsh-plugin-core/adv/explorer` 的 `FileBrowser`
// （面包屑 / ▾ 选层 / 内联目录树 / 文件预览 / md·源码切换 / 复制 / 刷新全在核心，
// 核心文件头写明「源实现 = 本仓旧 file-browser.tsx」）。本文件只保留本仓**外壳**：
//   · 页面级 dock 的 `<aside>` 与左缘拖拽条（宽度由 index.ts 的 `--dsh-tdt-preview-w` 管）；
//   · 选择器浮层的撑满样式；
//   · 相对路径 → 绝对路径（核心 `FsFace` 只吃绝对路径；相对口径仍沿用本仓「工作区相对」）。
// 本地 868 行实现与 `file-preview.tsx`（752 行）已删除；预览相关旧类名不再使用。
import { createElement as h, type CSSProperties } from 'react'
import { workspaceList } from 'dsh-plugin-core/ui'
import { t as coreT } from 'dsh-plugin-core/utils'
import { FileBrowser as CoreFileBrowser, getFsFace } from 'dsh-plugin-core/adv/explorer'
import type { Translate } from './locales'
import type { OfficeToPdfFace } from 'dsh-plugin-core/adv/explorer'

/** 绝对路径判定（POSIX `/` 或 Windows 盘符）。 */
function isAbsoluteish(path: string): boolean {
  return path.startsWith('/') || /^[A-Za-z]:[\\/]/.test(path)
}

/** 会话所属工作区的绝对根（宿主快照真值；拿不到 = ''）。 */
function rootOfSession(sessionId: string): string {
  const item = workspaceList.getSnapshot().find(ws => (ws.sessionIds ?? []).includes(sessionId))
  return item?.path ?? ''
}

/** 按显示名取工作区绝对根（选择器用；拿不到 = ''）。 */
function rootOfWorkspace(name: string | undefined): string {
  if (name === undefined) return ''
  return workspaceList.getSnapshot().find(ws => ws.title === name)?.path ?? ''
}

/** 相对路径拼到根上（只处理 `/` 与 Windows 分隔符；不引入 path 依赖）。 */
function resolvePath(root: string, path: string): string {
  if (path === '') return root
  if (isAbsoluteish(path) || root === '') return path
  return `${root.replace(/[\\/]+$/, '')}/${path}`
}

export interface FileBrowserProps {
  /** 官方 `remote.officeToPdf`（Office 转 PDF）；未就位为 null ⇒ Office 文件出「不可用」空态。 */
  officeToPdf?: OfficeToPdfFace | null
  /** 会话 id：dock 用来定位所属工作区根；picker 可省略。 */
  sessionId: string
  /** 起始路径（工作区相对或绝对）。 */
  path: string
  t: Translate
  onClose: () => void
  /** 页面级 dock 形态（固定右侧 + 推压整页）。 */
  dock?: boolean
  /** 左缘拖拽条按下（调宽）；不传 = 不渲染拖拽条。 */
  onResizeStart?: (event: { clientX: number; pointerId: number; preventDefault?: () => void }) => void
  /** 选择器模式：点文件即回调 onPick（不进预览）。 */
  picker?: boolean
  /** 选择器回调（path 为**工作区相对**路径；isDir = 选的是整个文件夹）。 */
  onPick?: (path: string, isDir: boolean) => void
  /** 工作区根的显示名（选择器 = 用户选中的工作区名）。 */
  rootName?: string
  /** ▾ 下拉顶部的工作区清单。 */
  workspaces?: readonly string[]
  /** 从 ▾ 下拉选择其他工作区。 */
  onSelectWorkspace?: (name: string) => void
  /** 外部容器样式（嵌入弹层时撑满高度用）。 */
  style?: CSSProperties
}

/**
 * 文件浏览 / 预览（页面级 dock 或选择器浮层）。
 * 浏览本体全部走核心；这里只负责外壳与路径口径。
 */
export function FileBrowser(props: FileBrowserProps): ReturnType<typeof h> {
  const { officeToPdf, sessionId, path, t, onClose, dock, onResizeStart, picker, onPick, rootName, workspaces, onSelectWorkspace, style } = props
  const files = getFsFace()
  const root = picker === true ? rootOfWorkspace(rootName) : rootOfSession(sessionId)
  const startPath = resolvePath(root, path)
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
    files === undefined
      ? h('div', { className: 'dsh-tdt-sv-preview-err' }, t('previewRenderFailed'))
      : h(CoreFileBrowser, {
        files,
        officeToPdf,
        rootPath: root === '' ? undefined : root,
        sessionId,
        path: startPath,
        rootName,
        workspaces,
        onSelectWorkspace,
        translate: coreT,
        picker,
        onPick: onPick === undefined ? undefined : (picked) => { onPick(picked.workspaceRel ?? picked.path, picked.isDir) },
        onClose,
        style: { flex: '1 1 auto', minWidth: 0, minHeight: 0, height: '100%' },
      }),
  )
}
