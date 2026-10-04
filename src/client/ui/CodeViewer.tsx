/**
 * CodeViewer —— 只读源码查看器（替换官方 Shiki CodeBlock）。
 *
 * 为什么换成 CodeMirror 6：官方 CodeBlock 把整篇 tokenize 成 <pre> + 每 token 一个
 * <span> 的巨型 DOM，拖动改宽会触发整棵子树重排，5000 行大文件首屏与拖拽都卡。CodeMirror
 * 是行级视图 + Lezer 增量高亮，宽度变化只重排可视区，天然不为整篇买单。
 *
 * 只读但可选中：仅用 <CodeMirror readOnly>（= EditorState.readOnly，挡住一切输入），
 * 不设置 EditorView.editable=false —— 后者会把内容设为不可编辑并连带禁用鼠标选区，
 * 导致用户无法框选复制某一句。保留 editable 后选区/复制正常，输入仍被 readOnly 拦下。
 *
 * 外观：theme="none" 关掉 @uiw 默认 light 主题的白底，cmSurfaceTheme 透明底叠在宿主面板上；
 * 默认 EditorView.lineWrapping（全换行，避免横向滚动条）；复制钮为右上角官方图标，hover 浮现。
 */
import * as React from 'react'
import { useEffect, useMemo, useState, type ReactElement } from 'react'
import CodeMirror from '@uiw/react-codemirror'
import { type Extension } from '@codemirror/state'
import { EditorView } from '@codemirror/view'
import {
  IconCheckOutlineRegular,
  IconCopyOutlineRegular,
  writeClipboard,
} from '@deepseek-ai/dsh-client-ui-primitives'
import type { Translate } from '../locales'
import { languageForPath } from './lang'
import { codeMirrorTheme } from './cm-themes'

function isDarkScheme(): boolean {
  if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return true
  return window.matchMedia('(prefers-color-scheme: dark)').matches
}

export function CodeViewer(props: {
  text: string
  path: string
  t: Translate
  /** 可选：透传调用方样式类名（如 ocOr('ToolRow','codeBody',...)），保留既有皮肤与高度上下文 */
  className?: string
  /** 可选：透传根 div 行内样式 */
  style?: React.CSSProperties
  /** 可选：编辑器高度，默认 "100%"（填满父容器）；无确定高度上下文（如工具卡代码）传 "auto" 随内容撑高 */
  height?: string
}): ReactElement {
  const { text, path, t, className, style, height = '100%' } = props
  const [copied, setCopied] = useState(false)
  const [dark, setDark] = useState<boolean>(isDarkScheme)

  useEffect(() => {
    if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return
    const mq = window.matchMedia('(prefers-color-scheme: dark)')
    const onChange = (): void => setDark(mq.matches)
    mq.addEventListener?.('change', onChange)
    return () => mq.removeEventListener?.('change', onChange)
  }, [])

  const language = useMemo(() => languageForPath(path), [path])

  const extensions = useMemo<Extension[]>(() => [
    ...codeMirrorTheme(dark),
    EditorView.lineWrapping, // 默认全换行，避免横向滚动条（用户要求）
    ...(language !== null ? [language] : []),
  ], [dark, language])

  const copy = (): void => {
    void writeClipboard(text).then((ok: boolean) => {
      if (ok) {
        setCopied(true)
        window.setTimeout(() => setCopied(false), 1500)
      }
    })
  }

  return (
    <div className={`dsh-tdt-sv-cmviewer${className ? ` ${className}` : ''}`} style={style}>
      <button
        type="button"
        className="dsh-tdt-sv-cm-copy"
        onClick={copy}
        title={copied ? t('copiedLabel') : t('copyLabel')}
        aria-label={copied ? t('copiedLabel') : t('copyLabel')}
      >
        {copied ? <IconCheckOutlineRegular /> : <IconCopyOutlineRegular />}
      </button>
      <CodeMirror
        value={text}
        className="dsh-tdt-sv-cm-editor"
        theme="none"
        extensions={extensions}
        readOnly
        height={height}
        style={{ flex: '1 1 auto', minHeight: 0, overflow: 'hidden' }}
        basicSetup={{
          lineNumbers: true,
          foldGutter: false,
          highlightActiveLine: false,
          highlightActiveLineGutter: false,
          autocompletion: false,
          bracketMatching: true,
          closeBrackets: false,
          indentOnInput: false,
          searchKeymap: false,
        }}
      />
    </div>
  )
}
