// U11 产出物预览（决策 39，docs/design/features/artifact-opening.md §四）：弹窗内右侧分栏的文件预览引擎。
//
// 渲染底层全官方（拍板红线：不许自研预览器）：
//   · markdown   → 官方 MarkdownText；
//   · 代码 / 文本 → CodeViewer（只读 CodeMirror 6，ui/CodeViewer.tsx；行级视图 + Lezer 增量高亮，根除官方 Shiki CodeBlock 整篇 DOM 重排卡顿；lang = 扩展名）；
//   · 图片        → readBytes → Blob → objectURL（卸载时 revoke）；
//   · PDF        → readBytes 全量（服务端上限 32MiB）→ 浏览器 iframe 原生渲染；
//   · 不可内嵌    → 空态 + 复制路径；错误态按官方 RemoteError.code 分支（不按消息文本）。
// 数据一律 remote.workspaceFiles 真实取数（工作区铁律：禁模拟）。
// 单一入口：面板只认调用方 openFile(path) 传入的路径；未来任务列表整页同走此组件（本轮不落 UI）。
//
// 契约事实来源：@deepseek-ai/dsh-api-workspace-files@0.2.0-rc.2 lib/typert.remote-client.js
// —— read(sessionId, path, range) → {offset, text, lines, eof, ...}（单页
// 2MiB/5000 行，文本页 \n 连接、末行不带终止符，翻页 offset = 页 offset + lines）；
// readBytes(sessionId, path, options) → {offset, data: Uint8Array, eof, ...}（options 不带
// range = 全量，上限 = 部署 maxFileBytes，docs 早前写的「32MiB」是部署值非协议常量）。
// ⚠️ 两个方法的第三参都**必传**（全量也要传 `{}`）：远端按位置参数个数校验，少传即
// `expected 3 business argument(s) plus an optional AbortSignal, got 2`（真机 2026-10-03）。
import { Component, createElement as h, Fragment, useEffect, useRef, useState } from 'react'
import type { ErrorInfo, ReactNode } from 'react'
import { Button, IconButton, MarqueeText, Segmented } from './ui'
import {
  IconCheckOutlineRegular,
  IconCloseOutlineRegular,
  IconCopyOutlineRegular,
  IconRefreshOutlineRegular,
  MarkdownText,
  Tooltip,
  writeClipboard,
} from '@deepseek-ai/dsh-client-ui-primitives'
import { CodeViewer } from './ui'
import type { LocaleKey, Translate } from './locales'
import { MD_LABELS } from './md-labels'
import { ocOr } from './official-classes'

// 官方气泡提示包裹：给图标钮加 hover/focus tooltip（用户 2026-09-28：图标都缺悬停提示，统一用官方 Tooltip，不自研）。
const tooled = (label: string, node: ReactNode): ReactNode =>
  h(Tooltip, { label, side: 'bottom' }, node)

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

/** `stat` 结果防御解析：只取 absolutePath（信封剥壳同款；stat 仅认 regular file）。 */
export function absolutePathOf(result: unknown): string | null {
  const envelope = unwrapEnvelope(result)
  if (envelope.kind === 'error') return null
  const raw = envelope.payload
  if (typeof raw !== 'object' || raw === null) return null
  const abs = (raw as { absolutePath?: unknown }).absolutePath
  return typeof abs === 'string' && abs !== '' ? abs : null
}

/** 失败分支判空（TS 收窄用）。 */
export const isFailed = (value: unknown): value is { failed: unknown } =>
  typeof value === 'object' && value !== null && 'failed' in (value as object)

/** `list` 结果防御解析：返回 WorkspaceDirectoryListing 或失败/非法信封。 */
export function listingOf(result: unknown): {
  path: string
  entries: ReadonlyArray<{ name: string; type: 'file' | 'directory' | 'other'; size?: number }>
  truncated: boolean
} | { failed: unknown } | null {
  const envelope = unwrapEnvelope(result)
  if (envelope.kind === 'error') return { failed: envelope.error }
  const raw = envelope.payload
  if (typeof raw !== 'object' || raw === null) {
    console.warn(`[task-dispatch:file-preview] list 返回非对象：${shapeOf(result)}`)
    return null
  }
  const r = raw as { path?: unknown; entries?: unknown; truncated?: unknown }
  if (typeof r.path !== 'string' || !Array.isArray(r.entries) || typeof r.truncated !== 'boolean') {
    console.warn(`[task-dispatch:file-preview] list 返回形状不符契约：${shapeOf(result)}`)
    return null
  }
  return {
    path: r.path,
    entries: r.entries as ReadonlyArray<{ name: string; type: 'file' | 'directory' | 'other'; size?: number }>,
    truncated: r.truncated,
  }
}

/**
 * 官方 `remote.officeToPdf` 的消费面（**本地结构化声明，零 npm 依赖**——与下面 `WorkspaceFilesFace` 同款做法；
 * 本仓惯例见 src/client/index.ts 顶部「宿主能力的类型全部本地结构化声明」）。
 *
 * 契约来源（@deepseek-ai/dsh-office-to-pdf@0.2.0-rc.2，逐字核实）：
 * - 服务名 = cordis dotted 键 `remote.officeToPdf`（底层 Typert key `officeToPdf/render`）；
 * - `lib/typert.remote-client.d.ts`：`render(workspaceFileScopeId, path, priority, signal?)`
 *   ⇒ `Promise<RemoteResult<RenderedDocumentBytes>>`；
 * - `OfficeToPdfPriority = 'foreground' | 'background'`（前台预览取 `foreground`）；
 * - `RenderedDocumentBytes extends WorkspaceFileBytes` ⇒ PDF 字节在信封 payload 的 **`data: Uint8Array`**
 *   （与 `readBytes` 同字段名 ⇒ 可复用 `bytesOf` 解析）。
 * ⚠️ 运行时服务由**宿主**提供（宿主装了 `@deepseek-ai/dsh-office-to-pdf` 才有）；未装 ⇒ dotted inject
 *   回调不触发 ⇒ 保持 null ⇒ Office 文件呈现「Office 预览不可用」（与官方提示同款）。
 */
export interface OfficeToPdfFace {
  render(
    sessionId: string,
    path: string,
    priority: 'foreground' | 'background',
    signal?: AbortSignal,
  ): Promise<unknown>
}

/** @deepseek-ai/dsh-api-workspace-files 的消费面（官方 remote.workspaceFiles 命名空间的用到的子集）。 */
export interface WorkspaceFilesFace {
  /**
   * 文本分页读：返回页文本与 eof；翻页 offset = 页 offset + lines。
   * ⚠️ 第三参 `range` **必传**（官方 `read(scope, path, range, signal)`），读全量也要传 `{}`。
   * 真机 2026-10-03：`readBytes` 曾因少传第三参被远端拒（`expected 3 business argument(s) … got 2`），
   * 官方按**位置参数个数**校验，故两个方法一律不得省。出处见 docs/design/external/dsh-capabilities.md。
   */
  read(
    sessionId: string,
    path: string,
    range: { offset?: number; limit?: number },
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
  /**
   * 二进制读：**不传 `range` 读全量**（受部署 `maxFileBytes` 封顶，超出抛 too-large）。
   * ⚠️ 第三参 **必传**，全量也要传 `{}`（真机 2026-10-03 踩过，见上）。
   * ⚠️ `range` 是 `{ offset?, length? }`，**不是** `[start, end]` 元组（官方 `WorkspaceByteRange`）。
   */
  readBytes(
    sessionId: string,
    path: string,
    options: { range?: { offset?: number; length?: number } },
    signal?: AbortSignal,
  ): Promise<{ offset: number; data: Uint8Array; eof: boolean; bytes?: number }>
  /** 目录列举：返回直接子项（官方 list，目录 ≤2000 条，限工作区内）。list 一个文件会报 not-directory。 */
  list(
    sessionId: string,
    path: string,
    signal?: AbortSignal,
  ): Promise<{
    path: string
    entries: ReadonlyArray<{ name: string; type: 'file' | 'directory' | 'other'; size?: number }>
    truncated: boolean
  }>
  /**
   * 单文件 stat（可选：宿主过旧无此方法时降级）。**只认 regular file**——目录会抛
   * not-regular-file（locateFile: `entry.type !== "file"` 即 throw，lib/index.js:594）。
   * 返回 absolutePath（宿主绝对路径，statOf → fs.processPath）。
   */
  stat?(
    sessionId: string,
    path: string,
    signal?: AbortSignal,
  ): Promise<{ absolutePath: string; version?: number | string; bytes?: number }>
}

/** 错误视图：文案键 + 占位参数（官方 RemoteError 按 code 分支，不按消息文本）。 */
export interface ErrView {
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

/** HTML 静态预览的取数档位（官方 `HtmlBody` 注册为 `loading: 'bytes-complete'`：一次取全量字节）。 */
export const HTML_KINDS = ['html', 'htm'] as const

/** 源码态读取上限（用户 2026-10-04 拍板 256K；官方走 `read` 分页、上限是部署 maxBytes，无此常量）。 */
export const SOURCE_MAX_BYTES = 256 * 1024

/**
 * Office 预览扩展名（官方 `remote.officeToPdf` 转 PDF 后再渲染）。
 * ⚠️ 官方 `OfficeExtension` 还含 `xls` / `xlsx`，但用户 2026-10-05 拍板「Excel 向后讨论」⇒ 本轮**不纳入**，
 * 表格文件维持原「暂不支持预览」提示（避免与「Excel 走可编辑表格引擎」的路线混为一谈）。
 */
export const OFFICE_KINDS = ['doc', 'docx', 'ppt', 'pptx'] as const

/** 预览类型分发（拍板：按扩展名定渲染器，未知二进制由 read 抛 not-text 后落空态）。 */
export function previewKind(path: string): { kind: 'image' | 'pdf' | 'md' | 'html' | 'office' | 'text'; ext: string; mime?: string } {
  const base = path.slice(path.lastIndexOf('/') + 1)
  const dot = base.lastIndexOf('.')
  const ext = dot <= 0 ? '' : base.slice(dot + 1).toLowerCase()
  if (ext !== '' && IMAGE_MIME[ext] !== undefined) return { kind: 'image', ext, mime: IMAGE_MIME[ext] }
  if (ext === 'pdf') return { kind: 'pdf', ext, mime: 'application/pdf' }
  if (ext === 'md' || ext === 'markdown') return { kind: 'md', ext }
  // HTML 与官方 `htmlBodyDefinition` 同款扩展名（documentpreview lib/client.js:4102）。
  if (HTML_KINDS.some(kind => kind === ext)) return { kind: 'html', ext }
  // Office：官方 `remote.officeToPdf.render` 转 PDF ⇒ 与 pdf 同款 iframe 渲染（mime 即转换产物）。
  if (OFFICE_KINDS.some(kind => kind === ext)) return { kind: 'office', ext, mime: 'application/pdf' }
  return { kind: 'text', ext }
}

/**
 * HTML 静态预览的**安全处理，逐条照抄官方**（`documentpreview` lib/client.js）：
 * - 禁用标签（`:3827-3840`）：noscript / base / link / meta / iframe / frame / object / embed / set /
 *   animate / animateMotion / animateTransform；
 * - 禁用属性（`:3841`）：href / xlink:href；
 * - head 第一项插入官方那条 CSP（`:3844-3846`）；
 * - 外层 `sandbox=""`（`:4069`）——**不比官方多开一点、也不少关一点**。
 * 官方用 DOMPurify 做第一层，本仓不引第三方包 ⇒ 用浏览器原生 DOMParser 做**等价的剔除**，
 * 效果对齐官方清单；真正的兜底是 `sandbox=""`（禁脚本执行）+ CSP `default-src 'none'`（禁一切外链）。
 */
const HTML_FORBID_TAGS = ['noscript', 'base', 'link', 'meta', 'iframe', 'frame', 'object', 'embed', 'set', 'animate', 'animatemotion', 'animatetransform']
const HTML_FORBID_ATTRS = ['href', 'xlink:href']
/** 官方 CSP 原文（`:3846`）。 */
const HTML_CSP = "default-src 'none'; script-src 'none'; style-src 'unsafe-inline'; img-src data:; font-src data:; media-src data:"

/** 把 HTML 文本做成官方同款的静态预览文档；解析/解码失败返回 undefined（调用方出错误态）。 */
export function buildStaticHtml(data: Uint8Array): string | undefined {
  let source: string
  try {
    source = new TextDecoder('utf-8', { fatal: true }).decode(data)
  } catch {
    return undefined
  }
  const parsed = new DOMParser().parseFromString(source, 'text/html')
  for (const tag of HTML_FORBID_TAGS) {
    for (const element of Array.from(parsed.querySelectorAll(tag))) element.remove()
  }
  for (const element of Array.from(parsed.querySelectorAll('*'))) {
    for (const attr of HTML_FORBID_ATTRS) element.removeAttribute(attr)
  }
  // CSP 必须是 head 的第一项（官方 parsed.head 前置插入）。
  const policy = parsed.createElement('meta')
  policy.setAttribute('http-equiv', 'Content-Security-Policy')
  policy.setAttribute('content', HTML_CSP)
  const head = parsed.head ?? parsed.documentElement
  head.insertBefore(policy, head.firstChild)
  return '<!doctype html>' + parsed.documentElement.outerHTML
}

/** 官方错误码的裸段（wire 里带命名空间前缀，如 workspace-file/not-found、gateway/lookup-not-found）。 */
export function bareCode(code: string): string {
  return code.includes('/') ? code.slice(code.lastIndexOf('/') + 1) : code
}

/** 文本的 UTF-8 字节数（源码态上限按**字节**判，与官方 maxBytes 口径一致，不按字符数）。 */
function byteLengthOf(text: string): number {
  return new TextEncoder().encode(text).length
}

/**
 * 按**字节**上限精确截断（UTF-8 边界安全：不会切出半个多字节字符）。
 * 官方是"切在 512K 整"，我们照做——此前整页追加会多带一整页（真机 2026-10-04 显示到 1 万行）。
 */
function sliceToBytes(text: string, maxBytes: number): string {
  const bytes = new TextEncoder().encode(text)
  if (bytes.length <= maxBytes) return text
  const decoder = new TextDecoder('utf-8')
  // 逐步回退到合法边界（最多 3 字节，UTF-8 单字符上限）。
  for (let cut = maxBytes; cut > maxBytes - 4 && cut > 0; cut--) {
    try {
      return decoder.decode(bytes.subarray(0, cut))
    } catch { /* 切在多字节字符中间 ⇒ 回退一字节 */ }
  }
  return text
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
export function errView(error: unknown): ErrView {
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
    case 'outside-workspace':
      // 官方 list 限定工作区内；常见于指向外部的符号链接（如 workspace→宿主目录），官方同样拒绝。
      return { key: 'previewOutsideWorkspace' }
    case 'invocation-unavailable':
    case 'service-unavailable':
      // 官方 gateway 侧「服务未启用」：Office 预览依赖宿主启用文档预览服务（dsh-office-to-pdf + libreoffice-kit）。
      return { key: 'previewOfficeUnavailable' }
    case 'failed':
      // 官方 `document-render/failed`：details.reason ∈ OfficeToPdfErrorCode；
      // 其中 `unavailable` = 宿主未启用文档预览服务（用户真机 2026-10-05 见到的就是这句）。
      return details !== null && details.reason === 'unavailable'
        ? { key: 'previewOfficeUnavailable' }
        : { key: 'previewOfficeFailed' }
    default:
      return {
        key: 'previewError',
        params: { code: code !== '' ? code : typeof e.message === 'string' ? e.message : String(error) },
      }
  }
}

/** 错误/空态体：仅原因文案（复制路径已上提到顶栏按钮组，见 FilePreviewPanel head）。 */
export function ErrBox(props: { err: ErrView; t: Translate }): ReturnType<typeof h> {
  const { err, t } = props
  return h('div', { className: 'dsh-tdt-sv-preview-body' },
    h('div', { className: 'dsh-tdt-sv-preview-err' },
      h('span', null, t(err.key, err.params)),
    ),
  )
}

/** 图片 / PDF：readBytes → Blob → objectURL（卸载 revoke，防内存泄漏）。 */
export function BytesPreview(props: {
  workspaceFiles: WorkspaceFilesFace
  sessionId: string
  path: string
  kind: 'image' | 'pdf'
  mime: string
  t: Translate
  /** 顶栏「刷新」自增，触发重读（重读字节）。 */
  reloadNonce: number
}): ReturnType<typeof h> {
  const { workspaceFiles, sessionId, path, kind, mime, t, reloadNonce } = props
  const [url, setUrl] = useState<string | null>(null)
  const [err, setErr] = useState<ErrView | null>(null)
  useEffect(() => {
    let alive = true
    let objectUrl: string | null = null
    setUrl(null)
    setErr(null)
    workspaceFiles.readBytes(sessionId, path, {})
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
  }, [workspaceFiles, sessionId, path, mime, reloadNonce])
  if (err !== null) return h(ErrBox, { err, t })
  if (url === null) {
    // 硬性规定：**不新建 / 不改造 Loading**，也**不显示任何加载文案** ⇒ 还在加载就**空着**（用户 2026-10-05）。
    return h('div', { className: 'dsh-tdt-sv-preview-body' })
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

/**
 * Office（doc / docx / ppt / pptx）：官方 `remote.officeToPdf.render` 转 PDF → Blob → objectURL →
 * **与 PDF 同款 iframe 原生渲染**。转换本身是官方能力，我方只做取数与渲染壳（零 npm 依赖）。
 * 服务未就位（宿主未启用文档预览服务）⇒ 不发起请求，直接出「Office 预览不可用」（与官方提示同款）。
 */
export function OfficePreview(props: {
  /** 官方 `remote.officeToPdf` 服务（未就位为 null ⇒ 出「不可用」空态）。 */
  officeToPdf: OfficeToPdfFace | null
  sessionId: string
  path: string
  t: Translate
  /** 顶栏「刷新」自增，触发重新转换。 */
  reloadNonce: number
}): ReturnType<typeof h> {
  const { officeToPdf, sessionId, path, t, reloadNonce } = props
  const [url, setUrl] = useState<string | null>(null)
  const [err, setErr] = useState<ErrView | null>(null)
  useEffect(() => {
    let alive = true
    let objectUrl: string | null = null
    setUrl(null)
    setErr(null)
    // 服务未就位 ⇒ 不发起请求（dotted inject 没触发，说明宿主没装文档预览服务，等也等不来）。
    if (officeToPdf === null) { setErr({ key: 'previewOfficeUnavailable' }); return }
    // priority = 'foreground'：前台预览优先（官方 OfficeToPdfPriority 仅这两档）。
    officeToPdf.render(sessionId, path, 'foreground')
      .then((page) => {
        if (!alive) return
        // 转换产物 RenderedDocumentBytes extends WorkspaceFileBytes ⇒ 字节在信封 payload 的 data，复用 bytesOf。
        const data = bytesOf(page)
        if (isFailed(data)) { setErr(errView(data.failed)); return }
        if (data === null) { setErr({ key: 'previewBadPayload' }); return }
        objectUrl = URL.createObjectURL(new Blob([data as unknown as BlobPart], { type: 'application/pdf' }))
        setUrl(objectUrl)
      })
      .catch((error: unknown) => { if (alive) setErr(errView(error)) })
    return () => {
      alive = false
      if (objectUrl !== null) URL.revokeObjectURL(objectUrl)
    }
  }, [officeToPdf, sessionId, path, reloadNonce])
  if (err !== null) return h(ErrBox, { err, t })
  if (url === null) {
    // 硬性规定：**不新建 / 不改造 Loading**，也**不显示任何加载文案** ⇒ 还在加载就**空着**（用户 2026-10-05）。
    return h('div', { className: 'dsh-tdt-sv-preview-body' })
  }
  return h('div', { className: 'dsh-tdt-sv-preview-body dsh-tdt-sv-preview-fill' },
    h('iframe', { className: 'dsh-tdt-sv-preview-pdf', src: url, title: path }),
  )
}

/**
 * HTML 静态预览（照官方 `BasicHtmlFrame`，`documentpreview` lib/client.js:4052-4073）：
 * `readBytes` 取全量字节（官方 `loading: 'bytes-complete'`）→ 官方同款安全处理 →
 * `<iframe srcDoc sandbox="" data-html-preview>`。frames 名按官方 `dsh-sidebar-html-<id>` 同款隔离。
 */
export function HtmlPreview(props: {
  workspaceFiles: WorkspaceFilesFace
  sessionId: string
  path: string
  t: Translate
  /** 顶栏「刷新」自增，触发重读字节。 */
  reloadNonce: number
}): ReturnType<typeof h> {
  const { workspaceFiles, sessionId, path, t, reloadNonce } = props
  const [doc, setDoc] = useState<string | undefined>(undefined)
  const [err, setErr] = useState<ErrView | null>(null)
  useEffect(() => {
    let alive = true
    setDoc(undefined)
    setErr(null)
    workspaceFiles.readBytes(sessionId, path, {})
      .then((page) => {
        if (!alive) return
        const data = bytesOf(page)
        if (isFailed(data)) { setErr(errView(data.failed)); return }
        if (data === null) { setErr({ key: 'previewBadPayload' }); return }
        const built = buildStaticHtml(data)
        if (built === undefined) { setErr({ key: 'previewHtmlFailed' }); return }
        setDoc(built)
      })
      .catch((error: unknown) => { if (alive) setErr(errView(error)) })
    return () => { alive = false }
  }, [workspaceFiles, sessionId, path, reloadNonce])
  if (err !== null) return h(ErrBox, { err, t })
  if (doc === undefined) {
    // 同上：不动 Loading、不写加载文案 ⇒ 空着。
    return h('div', { className: 'dsh-tdt-sv-preview-body' })
  }
  return h('div', { className: 'dsh-tdt-sv-preview-body dsh-tdt-sv-preview-fill' },
    h('iframe', {
      className: 'dsh-tdt-sv-preview-html',
      name: 'dsh-sidebar-html-preview',
      srcDoc: doc,
      sandbox: '',
      title: t('previewHtmlFrame'),
      'data-html-preview': true,
    }),
  )
}

/** markdown / 代码 / 文本：官方 read 分页（单页 5000 行 / 2MiB），!eof 时出「加载更多」。
 * md 两态（渲染 ⇄ 源码）由面板顶层持有 `sourceView` 并下传——切换控件在顶栏（见 FilePreviewPanel head），
 * 内容体只按 `showSource` 渲染，不再在内部 overlay 任何控件。 */
export function TextPreview(props: {
  workspaceFiles: WorkspaceFilesFace
  sessionId: string
  path: string
  ext: string
  markdown: boolean
  sourceView: boolean
  /** 顶栏「刷新」自增，触发重读第一页。 */
  reloadNonce: number
  t: Translate
  /**
   * 源码态的**字节上限**：累计达到即停止翻页（不再出「加载更多」），底部给一行提示。
   * 不传 = 不设限（旧行为）。用户 2026-10-04 拍板：HTML 源码态截前 256K。
   */
  maxBytes?: number
}): ReturnType<typeof h> {
  const { workspaceFiles, sessionId, path, ext, markdown, sourceView, reloadNonce, t, maxBytes } = props
  const [text, setText] = useState<string | null>(null)
  const [nextOffset, setNextOffset] = useState<number | null>(null)
  const [loading, setLoading] = useState(true)
  const [loadingMore, setLoadingMore] = useState(false)
  const [err, setErr] = useState<ErrView | null>(null)
  // 截断标记：有上限（HTML）且累计字节已达 ⇒ 顶部出横幅（官方位置/措辞），且不再有任何翻页按钮。
  const [truncated, setTruncated] = useState(false)
  // 源码态改用只读 CodeMirror 6（ui/CodeViewer.tsx），流式渲染与整篇高亮卡顿问题已根除，无 streaming 概念。
  // 折行：CodeViewer 默认开启 EditorView.lineWrapping（全换行，避免横向滚动条；
  // 用户 2026-10-04 明确「进来就全部换行，不要换行/不换行切换」），故不提供换行钮。
  useEffect(() => {
    let alive = true
    setText(null)
    setNextOffset(null)
    setLoading(true)
    setErr(null)
    setTruncated(false)
    workspaceFiles.read(sessionId, path, {})
      .then(async (page) => {
        if (!alive) return
        const parsed = textPageOf(page)
        if (isFailed(parsed)) { setErr(errView(parsed.failed)); setLoading(false); return }
        if (parsed === null) { setErr({ key: 'previewBadPayload' }); setLoading(false); return }
        // 无上限（md / 普通文本）：维持旧行为 —— 单页 + 「加载更多」按钮。
        if (maxBytes === undefined) {
          setText(parsed.text)
          setNextOffset(parsed.eof ? null : parsed.offset + parsed.lines)
          setLoading(false)
          return
        }
        // 有上限（HTML 源码态）：照官方**渐进**——先渲染第一页并标记 streaming，之后逐页追加，
        // 达到 256K 上限就**按字节精确截断**（官方是切在 512K 整，不是"多塞一整页"）。
        let merged = parsed.text
        let offset: number | null = parsed.eof ? null : parsed.offset + parsed.lines
        setText(merged)
        while (alive && offset !== null && byteLengthOf(merged) < maxBytes) {
          let raw: Awaited<ReturnType<WorkspaceFilesFace['read']>> | null = null
          try {
            raw = await workspaceFiles.read(sessionId, path, { offset })
          } catch { /* 落到下面的失败分支 */ }
          if (!alive) return
          const next = raw === null ? null : textPageOf(raw)
          if (next === null || isFailed(next)) { setErr(next === null ? { key: 'previewBadPayload' } : errView(next.failed)); setLoading(false); return }
          merged = `${merged}\n${next.text}`
          offset = next.eof ? null : next.offset + next.lines
          // 达到上限即**精确切到 maxBytes**（UTF-8 边界），不把最后一整页多带进来。
          if (byteLengthOf(merged) > maxBytes) merged = sliceToBytes(merged, maxBytes)
          setText(merged)
        }
        if (!alive) return
        setTruncated(offset !== null) // 还有剩余 ⇒ 是被上限截断的
        setText(merged)
        setNextOffset(null)
        setLoading(false)
      })
      .catch((error: unknown) => {
        if (!alive) return
        setErr(errView(error))
        setLoading(false)
      })
    return () => { alive = false }
  }, [workspaceFiles, sessionId, path, reloadNonce])
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
  if (err !== null) return h(ErrBox, { err, t })
  if (loading || text === null) {
    // 同上：不动 Loading、不写加载文案 ⇒ 空着。
    return h('div', { className: 'dsh-tdt-sv-preview-body' })
  }
  const showSource = !markdown || sourceView
  // 截断横幅：**顶部**（官方位置，真机截图：橙字「文件过大，仅显示前 512KB」），在滚动区之外。
  const banner = truncated
    ? h('div', { className: 'dsh-tdt-sv-truncated' }, t('previewTruncated', { size: t('previewTruncatedSize') }))
    : null
  const body = h('div', {
    className: showSource && !markdown
      ? 'dsh-tdt-sv-preview-body dsh-tdt-sv-preview-body-code'
      : 'dsh-tdt-sv-preview-body',
  },
    showSource
      // 源码态改用只读 CodeMirror 6 渲染（ui/CodeViewer.tsx）：行级视图 + Lezer 增量高亮，
      // 拖动改宽只重排可视区，根除 Shiki CodeBlock 整篇 DOM 重排导致的卡顿；默认全换行（lineWrapping）。
      ? h('div', {
          className: ocOr('CodeBody', 'renderer', 'dsh-tdt-sv-preview-coderender'),
          'data-code-preview': true,
        },
        h(CodeViewer, { text, path, t }))
      : h('div', { className: 'dsh-tdt-sv-preview-md' }, h(MarkdownText, { text, labels: MD_LABELS })),
    // 无上限的普通文本才保留「加载更多」；有上限的（HTML）永远不出按钮。
    !truncated && nextOffset !== null
      ? h('div', { className: 'dsh-tdt-sv-older' },
          h(Button, { variant: 'outline', size: 'sm', disabled: loadingMore, onClick: loadMore }, t('previewLoadMore')))
      : null,
  )
  return h(Fragment, null, banner, body)
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
}): ReturnType<typeof h> {
  const { workspaceFiles, officeToPdf, sessionId, path, t, onClose, dock, onResizeStart } = props
  const { kind, ext, mime } = previewKind(path)
  const isMd = kind === 'md'
  const isHtml = kind === 'html'
  // md / html 两态（渲染 ⇄ 源码）由面板顶层持有，切换控件放在顶栏（不飘进内容区，见上方 head）。
  // 两者**默认都是预览**（md=渲染、html=HTML 渲染），与官方一致；HTML 的入口形态照 md 抄。
  const [sourceView, setSourceView] = useState(false)
  const switchable = isMd || isHtml
  // 「刷新」自增：触发子预览重读（图片/PDF 重读字节、文本重读第一页）。
  const [reloadNonce, setReloadNonce] = useState(0)
  const [copied, setCopied] = useState(false)
  const copyPath = (): void => {
    void writeClipboard(path).then(ok => { if (ok) { setCopied(true); window.setTimeout(() => setCopied(false), 1500) } })
  }
  const fallback = h(ErrBox, { err: { key: 'previewRenderFailed' }, t })
  return h('aside', {
    className: dock === true ? 'dsh-tdt-sv-preview dsh-tdt-sv-preview-dock' : 'dsh-tdt-sv-preview',
    'data-preview-dock': dock === true ? true : undefined,
  },
    onResizeStart === undefined ? null
      : h('div', {
          className: 'dsh-tdt-resizer dsh-tdt-sv-resizer',
          role: 'separator',
          'aria-orientation': 'vertical',
          title: t('previewResize'),
          onPointerDown: (event: { clientX: number; pointerId: number; preventDefault?: () => void }) => { onResizeStart(event) },
        }),
    h('div', { className: 'dsh-tdt-sv-preview-head' },
      h('span', { className: 'dsh-tdt-sv-preview-label' }, t('previewFileLabel')),
      // 路径跑马灯：走全站唯一实现 MarqueeText（等宽皮肤由 `-inner` 类带出）。
      // 旧手写版（内层 `overflow:hidden` 把盒子压到容器宽 ⇒ 滚的是"半截文本"，尾部永不显示、
      // 盒子滑出后右侧一片黑）已废弃，2026-10-03 收编。
      h(MarqueeText, {
        text: path,
        title: path,
        className: 'dsh-tdt-sv-preview-title-inner',
        style: { flex: '1 1 auto', minWidth: 0 },
      }),
      h('div', { className: 'dsh-tdt-sv-head-actions' },
        switchable
          ? h(Segmented, {
              size: 'sm',
              variant: 'default',
              label: t(isMd ? 'previewMdSwitchAria' : 'previewHtmlSwitchAria'),
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
            onClick: () => { setReloadNonce(n => n + 1) },
          })),
        tooled(t('previewClose'),
          h(IconButton, {
            variant: 'plain', size: 'md', icon: h(IconCloseOutlineRegular, { size: 14 }),
            label: t('previewClose'),
            onClick: onClose,
          })),
      ),
    ),
    h(PreviewBoundary, {
      fallback,
      children: (kind === 'image' || kind === 'pdf')
        ? h(BytesPreview, { workspaceFiles, sessionId, path, kind, mime: mime ?? 'application/octet-stream', t, reloadNonce })
        : kind === 'office'
          ? h(OfficePreview, { officeToPdf: officeToPdf ?? null, sessionId, path, t, reloadNonce })
          : isHtml && !sourceView
          // HTML 默认 = 静态预览（照官方 srcDoc + sandbox=""）；点「源码」才走文本态。
          ? h(HtmlPreview, { workspaceFiles, sessionId, path, t, reloadNonce })
          : h(TextPreview, {
              workspaceFiles, sessionId, path, ext, markdown: isMd, sourceView, reloadNonce, t,
              // HTML 源码态截前 256K（用户拍板）；md / 其余文本不设限（维持旧行为）。
              maxBytes: isHtml ? SOURCE_MAX_BYTES : undefined,
            }),
    }),
  )
}
