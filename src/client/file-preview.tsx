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
import { createElement as h, useEffect, useState } from 'react'
import { CodeBlock, IconCloseOutlineRegular, MarkdownText, writeClipboard } from '@deepseek-ai/dsh-client-ui-primitives'
import type { LocaleKey, Translate } from './locales'

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

/** markdown 外壳文案（引用稳定——新身份会打断 MarkdownText 的渲染缓存；与 mirror/MessageItem 同款）。 */
const MD_LABELS = { code: { copyLabel: '复制', copiedLabel: '已复制' }, footnotes: '脚注' }

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
        objectUrl = URL.createObjectURL(new Blob([page.data as unknown as BlobPart], { type: mime }))
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
  useEffect(() => {
    let alive = true
    setText(null)
    setNextOffset(null)
    setLoading(true)
    setErr(null)
    workspaceFiles.read(sessionId, path, {})
      .then((page) => {
        if (!alive) return
        setText(page.text)
        setNextOffset(page.eof ? null : page.offset + page.lines)
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
        // 页间以 \n 拼接（官方页末行不带终止符）。
        setText(prev => (prev === null ? page.text : `${prev}\n${page.text}`))
        setNextOffset(page.eof ? null : page.offset + page.lines)
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
  return h('div', { className: 'dsh-tdt-sv-preview-body' },
    markdown
      ? h('div', { className: 'dsh-tdt-sv-preview-md' }, h(MarkdownText, { text, labels: MD_LABELS }))
      : h(CodeBlock, {
          code: text,
          lang: ext === '' ? undefined : ext,
          copyLabel: t('copyLabel'),
          copiedLabel: t('copiedLabel'),
          className: 'dsh-tdt-sv-preview-code',
        }),
    nextOffset !== null
      ? h('div', { className: 'dsh-tdt-sv-older' },
          h('button', { type: 'button', disabled: loadingMore, onClick: loadMore }, t('previewLoadMore')))
      : null,
  )
}

/**
 * 文件预览分栏（`.dsh-tdt-sv-preview`）：头 = 「文件 · 路径 · 关闭」，体按扩展名分发。
 * 调用方须以 `${sessionId}:${path}` 作 React key 重挂载，保证换文件时内部状态归零。
 */
export function FilePreviewPanel(props: {
  workspaceFiles: WorkspaceFilesFace
  sessionId: string
  path: string
  t: Translate
  onClose: () => void
}): ReturnType<typeof h> {
  const { workspaceFiles, sessionId, path, t, onClose } = props
  const { kind, ext, mime } = previewKind(path)
  return h('aside', { className: 'dsh-tdt-sv-preview' },
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
    kind === 'image' || kind === 'pdf'
      ? h(BytesPreview, { workspaceFiles, sessionId, path, kind, mime: mime ?? 'application/octet-stream', t })
      : h(TextPreview, { workspaceFiles, sessionId, path, ext, markdown: kind === 'md', t }),
  )
}
