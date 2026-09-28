// U11 产出物预览（决策 39，docs/design/artifact-opening.md §四）：弹窗内右侧分栏的文件预览引擎。
//
// 渲染底层全官方（拍板红线：不许自研预览器）：
//   · markdown   → 官方 MarkdownText；
//   · 代码 / 文本 → 官方 CodeBlock（primitives Shiki 积木，diff 面同源；lang = 扩展名）；
//   · 图片        → readBytes → Blob → objectURL（卸载时 revoke）；
//   · PDF        → readBytes 全量（服务端上限 32MiB）→ 浏览器 iframe 原生渲染；
//   · 不可内嵌    → 空态 + 复制路径；错误态按官方 RemoteError.code 分支（不按消息文本）。
// 数据一律 remote.workspaceFiles 真实取数（工作区铁律：禁模拟）。
// 单一入口：面板只认调用方 openFile(path) 传入的路径；未来任务列表整页同走此组件（本轮不落 UI）。
//
// 契约事实来源：@deepseek-ai/dsh-api-workspace-files@0.1.7-rc.2 lib/typert.remote-client.js
// —— read(sessionId, path, {offset?, limit?}) → {offset, text, lines, eof, ...}（单页
// 2MiB/5000 行，文本页 \n 连接、末行不带终止符，翻页 offset = 页 offset + lines）；
// readBytes(sessionId, path, ...) → {offset, data: Uint8Array, eof, ...}（全量 ≤32MiB）。
import { Component, createElement as h, useEffect, useState } from 'react'
import type { ErrorInfo, ReactNode } from 'react'
import {
  CodeBlock,
  IconCloseOutlineRegular,
  MarkdownText,
  languageForPath,
  writeClipboard,
} from '@deepseek-ai/dsh-client-ui-primitives'
import type { LocaleKey, Translate } from './locales'
import { MD_LABELS } from './md-labels'
import { ocOr } from './official-classes'

/** 预览渲染错误边界（真机 2026-09-28：渲染器抛错 ⇒ React 卸载整页 ⇒ 面板黑屏；此处拦在预览体内）。 */
export class PreviewBoundary extends Component<{ children: ReactNode; fallback: ReactNode }, { crashed: boolean }> {
  state = { crashed: false }

  static getDerivedStateFromError(): { crashed: boolean } {
    return { crashed: true }
  }

  componentDidCatch(error: Error, info: ErrorInfo): void {
    console.warn('[task-dispatch:file-preview] 预览渲染崩溃（已拦在预览体内）:', error, info.componentStack ?? '')
  }

  render(): ReactNode {
    return this.state.crashed ? this.props.fallback : this.props.children
  }
}

/** 值形状取证（真机排障锚点：远端返回与契约不符时打出来，别靠猜）。 */
function shapeOf(value: unknown): string {
  if (value === null || value === undefined) return String(value)
  if (typeof value !== 'object') return typeof value
  if (Array.isArray(value)) return `array(${value.length})`
  return `{${Object.keys(value as object).slice(0, 12).join(',')}}`
}

/**
 * 远端结果信封（真机 2026-09-28 实测）：失败时 **resolve 出 `{ ok: false, error }`**
 * 而不是 reject（typert 远端面把错误封进结果），成功时是结果本身（也可能包一层 `{ value }`）。
 * ⇒ 先剥信封：失败按官方 bareCode 走错误态文案，成功才交给渲染器。
 */
type Envelope = { kind: 'ok'; payload: unknown } | { kind: 'error'; error: unknown }

function unwrapEnvelope(result: unknown): Envelope {
  if (typeof result === 'object' && result !== null) {
    const r = result as { ok?: unknown; error?: unknown; value?: unknown }
    if (r.ok === false) return { kind: 'error', error: r.error }
    if (r.ok === true && 'value' in r) return { kind: 'ok', payload: r.value }
  }
  return { kind: 'ok', payload: result }
}

/**
 * `read` 结果防御解析（真机 2026-09-28 根因：page.text 为 undefined ⇒ 渲染器内部
 * `endsWith` 抛错 ⇒ 整页黑屏，界面出现「undefined undefined undefined」）。
 * 官方 wire 契约 = `{ offset, text, lines, eof, absolutePath, version, bytes? }`
 * （typert.remote-client.js 的 read_result schema）；**取不到字符串一律按错误态处理**，
 * 绝不把 undefined 喂给官方渲染器。
 */
function textPageOf(result: unknown): { text: string; offset: number; lines: number; eof: boolean } | { failed: unknown } | null {
  const envelope = unwrapEnvelope(result)
  if (envelope.kind === 'error') return { failed: envelope.error }
  const raw = envelope.payload
  if (typeof raw !== 'object' || raw === null) {
    console.warn(`[task-dispatch:file-preview] read 返回非对象：${shapeOf(result)}`)
    return null
  }
  const r = raw as { text?: unknown; offset?: unknown; lines?: unknown; eof?: unknown }
  if (typeof r.text !== 'string') {
    console.warn(`[task-dispatch:file-preview] read 返回形状不符契约（无 text 字段）：${shapeOf(result)}`)
    return null
  }
  const offset = typeof r.offset === 'number' ? r.offset : 0
  const lines = typeof r.lines === 'number' ? r.lines : (r.text === '' ? 0 : r.text.split('\n').length)
  return { text: r.text, offset, lines, eof: r.eof !== false }
}

/** `readBytes` 结果防御解析：data 必须是 Uint8Array（multipart 还原），否则错误态。 */
function bytesOf(result: unknown): Uint8Array | { failed: unknown } | null {
  const envelope = unwrapEnvelope(result)
  if (envelope.kind === 'error') return { failed: envelope.error }
  const data = (envelope.payload as { data?: unknown } | null | undefined)?.data
  if (data instanceof Uint8Array) return data
  console.warn(`[task-dispatch:file-preview] readBytes 返回形状不符契约：${shapeOf(result)}`)
  return null
}

/** 失败分支判空（TS 收窄用）。 */
const isFailed = (value: unknown): value is { failed: unknown } =>
  typeof value === 'object' && value !== null && 'failed' in (value as object)

/** @deepseek-ai/dsh-api-workspace-files 的消费面（官方 remote.workspaceFiles 命名空间的用到的子集）。 */
export interface WorkspaceFilesFace {
  /** 文本分页读：返回页文本与 eof；翻页 offset = 页 offset + lines。 */
  read(
    sessionId: string,
    path: string,
    opts?: { offset?: number; limit?: number },
    signal?: AbortSignal,
  ): Promise<{
    offset: number
    text: string
    lines: number
    eof: boolean
    absolutePath?: string
    version?: number | string
    bytes?: number
  }>
  /** 二进制读：不传 range = 全量（服务端上限 32MiB，超出抛 too-large）。 */
  readBytes(
    sessionId: string,
    path: string,
    opts?: { range?: [number, number] },
    signal?: AbortSignal,
  ): Promise<{ offset: number; data: Uint8Array; eof: boolean; bytes?: number }>
}

/** 错误视图：文案键 + 占位参数（官方 RemoteError 按 code 分支，不按消息文本）。 */
interface ErrView {
  key: LocaleKey
  params?: Record<string, string | number>
}

/** 图片扩展名 → MIME（svg 走 <img> 渲染：img 上下文不执行脚本）。 */
const IMAGE_MIME: Readonly<Record<string, string>> = {
  png: 'image/png',
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  gif: 'image/gif',
  webp: 'image/webp',
  bmp: 'image/bmp',
  svg: 'image/svg+xml',
  ico: 'image/x-icon',
  avif: 'image/avif',
}

/** 预览类型分发（拍板：按扩展名定渲染器，未知二进制由 read 抛 not-text 后落空态）。 */
function previewKind(path: string): { kind: 'image' | 'pdf' | 'md' | 'text'; ext: string; mime?: string } {
  const base = path.slice(path.lastIndexOf('/') + 1)
  const dot = base.lastIndexOf('.')
  const ext = dot <= 0 ? '' : base.slice(dot + 1).toLowerCase()
  if (ext !== '' && IMAGE_MIME[ext] !== undefined) return { kind: 'image', ext, mime: IMAGE_MIME[ext] }
  if (ext === 'pdf') return { kind: 'pdf', ext, mime: 'application/pdf' }
  if (ext === 'md' || ext === 'markdown') return { kind: 'md', ext }
  return { kind: 'text', ext }
}

/** 官方错误码的裸段（wire 里带命名空间前缀，如 workspace-file/not-found、gateway/lookup-not-found）。 */
function bareCode(code: string): string {
  return code.includes('/') ? code.slice(code.lastIndexOf('/') + 1) : code
}

/** 字节数 → 人话（too-large 的 details.limit 展示用）。 */
function formatBytes(n: number): string {
  if (n >= 1024 * 1024) {
    const mb = n / (1024 * 1024)
    return `${Number.isInteger(mb) ? mb : mb.toFixed(1)} MB`
  }
  if (n >= 1024) {
    const kb = n / 1024
    return `${Number.isInteger(kb) ? kb : kb.toFixed(1)} KB`
  }
  return `${n} B`
}

/** 官方 RemoteError → 文案键（按 code 裸段分支；顺序即官方语义优先级）。 */
function errView(error: unknown): ErrView {
  const e = (error ?? {}) as { code?: unknown; details?: unknown; message?: unknown }
  const code = typeof e.code === 'string' ? e.code : ''
  const details = (e.details ?? null) as Record<string, unknown> | null
  switch (bareCode(code)) {
    case 'not-found':
    case 'lookup-not-found':
      // gateway/lookup-not-found = cold 会话未挂 persistence，同样按「文件不存在」呈现。
      return { key: 'previewNotFound' }
    case 'too-large': {
      const limit = details !== null && typeof details.limit === 'number' ? details.limit : undefined
      return { key: 'previewTooLarge', params: limit === undefined ? undefined : { limit: formatBytes(limit) } }
    }
    case 'not-text':
      return { key: 'previewUnknownBinary' }
    case 'not-regular-file':
      return details !== null && details.kind === 'directory'
        ? { key: 'previewDirectory' }
        : { key: 'previewNotRegular' }
    default:
      return {
        key: 'previewError',
        params: { code: code !== '' ? code : typeof e.message === 'string' ? e.message : String(error) },
      }
  }
}

/** 错误/空态体：原因文案 + 复制路径（拍板：不可内嵌 = 空态 + 复制路径）。 */
function ErrBox(props: { err: ErrView; path: string; t: Translate }): ReturnType<typeof h> {
  const { err, path, t } = props
  const [copied, setCopied] = useState(false)
  return h('div', { className: 'dsh-tdt-sv-preview-body' },
    h('div', { className: 'dsh-tdt-sv-preview-err' },
      h('span', null, t(err.key, err.params)),
      h('button', {
        type: 'button',
        className: 'dsh-tdt-sv-btn',
        onClick: () => { void writeClipboard(path).then(ok => { if (ok) setCopied(true) }) },
      }, copied ? t('copiedLabel') : t('previewCopyPath')),
    ),
  )
}

/** 图片 / PDF：readBytes → Blob → objectURL（卸载 revoke，防内存泄漏）。 */
function BytesPreview(props: {
  workspaceFiles: WorkspaceFilesFace
  sessionId: string
  path: string
  kind: 'image' | 'pdf'
  mime: string
  t: Translate
}): ReturnType<typeof h> {
  const { workspaceFiles, sessionId, path, kind, mime, t } = props
  const [url, setUrl] = useState<string | null>(null)
  const [err, setErr] = useState<ErrView | null>(null)
  useEffect(() => {
    let alive = true
    let objectUrl: string | null = null
    setUrl(null)
    setErr(null)
    workspaceFiles.readBytes(sessionId, path)
      .then((page) => {
        if (!alive) return
        const data = bytesOf(page)
        if (isFailed(data)) { setErr(errView(data.failed)); return }
        if (data === null) { setErr({ key: 'previewBadPayload' }); return }
        objectUrl = URL.createObjectURL(new Blob([data as unknown as BlobPart], { type: mime }))
        setUrl(objectUrl)
      })
      .catch((error: unknown) => { if (alive) setErr(errView(error)) })
    return () => {
      alive = false
      if (objectUrl !== null) URL.revokeObjectURL(objectUrl)
    }
  }, [workspaceFiles, sessionId, path, mime])
  if (err !== null) return h(ErrBox, { err, path, t })
  if (url === null) {
    return h('div', { className: 'dsh-tdt-sv-preview-body' }, h('div', { className: 'dsh-tdt-sv-hint' }, t('previewLoading')))
  }
  if (kind === 'pdf') {
    return h('div', { className: 'dsh-tdt-sv-preview-body dsh-tdt-sv-preview-fill' },
      h('iframe', { className: 'dsh-tdt-sv-preview-pdf', src: url, title: path }),
    )
  }
  return h('div', { className: 'dsh-tdt-sv-preview-body' },
    h('img', { className: 'dsh-tdt-sv-preview-img', src: url, alt: path }),
  )
}

/** markdown / 代码 / 文本：官方 read 分页（单页 5000 行 / 2MiB），!eof 时出「加载更多」。 */
function TextPreview(props: {
  workspaceFiles: WorkspaceFilesFace
  sessionId: string
  path: string
  ext: string
  markdown: boolean
  t: Translate
}): ReturnType<typeof h> {
  const { workspaceFiles, sessionId, path, ext, markdown, t } = props
  const [text, setText] = useState<string | null>(null)
  const [nextOffset, setNextOffset] = useState<number | null>(null)
  const [loading, setLoading] = useState(true)
  const [loadingMore, setLoadingMore] = useState(false)
  const [err, setErr] = useState<ErrView | null>(null)
  // md 的两态：渲染视图（官方 MarkdownBody 同款）⇄ 源码（官方 CodeBody 同款）。
  const [sourceView, setSourceView] = useState(false)
  useEffect(() => {
    let alive = true
    setSourceView(false)
    setText(null)
    setNextOffset(null)
    setLoading(true)
    setErr(null)
    workspaceFiles.read(sessionId, path, {})
      .then((page) => {
        if (!alive) return
        const parsed = textPageOf(page)
        if (isFailed(parsed)) { setErr(errView(parsed.failed)); setLoading(false); return }
        if (parsed === null) { setErr({ key: 'previewBadPayload' }); setLoading(false); return }
        setText(parsed.text)
        setNextOffset(parsed.eof ? null : parsed.offset + parsed.lines)
        setLoading(false)
      })
      .catch((error: unknown) => {
        if (!alive) return
        setErr(errView(error))
        setLoading(false)
      })
    return () => { alive = false }
  }, [workspaceFiles, sessionId, path])
  const loadMore = (): void => {
    if (nextOffset === null || loadingMore) return
    setLoadingMore(true)
    workspaceFiles.read(sessionId, path, { offset: nextOffset })
      .then((page) => {
        const parsed = textPageOf(page)
        if (isFailed(parsed)) { setErr(errView(parsed.failed)); setLoadingMore(false); return }
        if (parsed === null) { setErr({ key: 'previewBadPayload' }); setLoadingMore(false); return }
        // 页间以 \n 拼接（官方页末行不带终止符）。
        setText(prev => (prev === null ? parsed.text : `${prev}\n${parsed.text}`))
        setNextOffset(parsed.eof ? null : parsed.offset + parsed.lines)
        setLoadingMore(false)
      })
      .catch((error: unknown) => {
        setErr(errView(error))
        setLoadingMore(false)
      })
  }
  if (err !== null) return h(ErrBox, { err, path, t })
  if (loading || text === null) {
    return h('div', { className: 'dsh-tdt-sv-preview-body' }, h('div', { className: 'dsh-tdt-sv-hint' }, t('previewLoading')))
  }
  // 官方 code/CodeBody（sidebar-documentpreview lib/client.js:5033）同款参数：
  // CodeBlock + lineNumbers: true + lang = languageForPath(path) + toolbar（复制 / 自动换行）。
  // md 两态切换（用户 2026-09-28 定样式）：官方分段控件（预览|源码），**绝对定位叠进 CodeBlock
  // 工具条**（语言标签右侧、图标左侧）——不加行（加行会顶出滚动条）、不套框；渲染态时浮在右上角。
  // ⚠ CodeBlock 无自定义插槽 prop（lib/types/markdown/CodeBlock.d.ts），故只能 overlay。
  const language = languageForPath(path)
  const showSource = !markdown || sourceView
  const seg = markdown
    ? h('div', {
        className: 'dsh-tdt-sv-seg',
        'data-mode': showSource ? 'source' : 'render',
        role: 'group',
        'aria-label': t('previewMdSwitchAria'),
      },
      h('button', {
        type: 'button',
        className: 'dsh-tdt-sv-seg-btn',
        'aria-pressed': !sourceView,
        onClick: () => { setSourceView(false) },
      }, t('previewRender')),
      h('button', {
        type: 'button',
        className: 'dsh-tdt-sv-seg-btn',
        'aria-pressed': sourceView,
        onClick: () => { setSourceView(true) },
      }, t('previewSource')),
      )
    : null
  return h('div', { className: 'dsh-tdt-sv-preview-body' },
    showSource
      ? h('div', {
          className: ocOr('CodeBody', 'renderer', 'dsh-tdt-sv-preview-coderender'),
          'data-code-preview': true,
          style: { position: 'relative' },
        },
        seg,
        h(CodeBlock, {
          className: ocOr('CodeBody', 'code', 'dsh-tdt-sv-preview-code'),
          code: text,
          lang: language,
          lineNumbers: true,
          // md 源码态按 prose 语义换行（官方 wrap 语义 = 采用调用方偏好并隐藏工具条换行钮），
          // 避免短文档也出现横向滚动条；代码文件不传 = 保留官方换行切换钮。
          wrap: markdown === true ? true : undefined,
          copyLabel: t('copyLabel'),
          copiedLabel: t('copiedLabel'),
          toolbarLabels: {
            codeLabel: t('codeBlockLabel'),
            wrapLabel: t('diffWrapLabel'),
            unwrapLabel: t('diffUnwrapLabel'),
          },
        }))
      : h('div', { className: 'dsh-tdt-sv-preview-mdwrap' }, seg,
          h('div', { className: 'dsh-tdt-sv-preview-md' }, h(MarkdownText, { text, labels: MD_LABELS }))),
    nextOffset !== null
      ? h('div', { className: 'dsh-tdt-sv-older' },
          h('button', { type: 'button', disabled: loadingMore, onClick: loadMore }, t('previewLoadMore')))
      : null,
  )
}

/**
 * 文件预览分栏（`.dsh-tdt-sv-preview`）：头 = 「文件 · 路径 · 关闭」，体按扩展名分发。
 *
 * 唯一一份预览体，两种宿主：
 *  · 页面级 dock（`dock: true`）——固定在屏幕最右侧，把整页（含弹窗）往左推（用户 2026-09-28 拍板
 *    「弹窗与整页共用同一个预览面，且弹窗不遮盖它」）；左缘带拖拽条可调宽；
 *  · 内联（缺省）——历史上的弹窗内分栏形态，保留以防回退。
 * 调用方须以 `${sessionId}:${path}` 作 React key 重挂载，保证换文件时内部状态归零。
 */
export function FilePreviewPanel(props: {
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
  const { kind, ext, mime } = previewKind(path)
  const fallback = h(ErrBox, { err: { key: 'previewRenderFailed' }, path, t })
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
    h('div', { className: 'dsh-tdt-sv-preview-head' },
      h('span', { className: 'dsh-tdt-sv-preview-label' }, t('previewFileLabel')),
      h('span', { className: 'dsh-tdt-sv-preview-title', title: path }, path),
      h('button', {
        type: 'button',
        className: 'dsh-tdt-sv-close',
        'aria-label': t('previewClose'),
        onClick: onClose,
      }, h(IconCloseOutlineRegular, { size: 14 })),
    ),
    h(PreviewBoundary, {
      fallback,
      children: (kind === 'image' || kind === 'pdf')
        ? h(BytesPreview, { workspaceFiles, sessionId, path, kind, mime: mime ?? 'application/octet-stream', t })
        : h(TextPreview, { workspaceFiles, sessionId, path, ext, markdown: kind === 'md', t }),
    }),
  )
}
