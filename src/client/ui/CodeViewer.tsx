/**
 * CodeViewer —— 只读源码查看器（替换官方 Shiki CodeBlock）。
 *
 * 为什么换成 CodeMirror 6：官方 CodeBlock 把整篇 tokenize 成 <pre> + 每 token 一个
 * <span> 的巨型 DOM，拖动改宽会触发整棵子树重排，5000 行大文件首屏与拖拽都卡。CodeMirror
 * 是行级视图 + Lezer 增量高亮，宽度变化只重排可视区，天然不为整篇买单。
 *
 * 严格只读：readOnly + editable=false，无脏点/保存/Ctrl+S，仅渲染。风格对齐
 * DSH-better-sidebar 的 TextEditor，但去掉其可编辑部分。功能面与原源码态一致：行号、
 * 复制、换行开关、256K 截断横幅（由父级透传）、单滚动容器、HTML 默认预览/点源码切换。
 */
import * as React from 'react'
import { useEffect, useMemo, useState, type ReactElement } from 'react'
import CodeMirror from '@uiw/react-codemirror'
import { type Extension } from '@codemirror/state'
import { EditorView } from '@codemirror/view'
import { writeClipboard } from '@deepseek-ai/dsh-client-ui-primitives'
import type { Translate } from '../locales'
import { languageForPath } from './lang'
import { codeMirrorTheme } from './cm-themes'

function isDarkScheme(): boolean {
  if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return true
  return window.matchMedia('(prefers-color-scheme: dark)').matches
}

export function CodeViewer(props: { text: string; path: string; t: Translate }): ReactElement {
  const { text, path, t } = props
  const [wrap, setWrap] = useState(false)
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

  const extensions = useMemo<Extension[]>(() => {
    const exts: Extension[] = [
      ...codeMirrorTheme(dark),
      EditorView.editable.of(false), // 严格只读
      ...(language !== null ? [language] : []),
      ...(wrap ? [EditorView.lineWrapping] : []),
    ]
    return exts
  }, [dark, language, wrap])

  const copy = (): void => {
    void writeClipboard(text).then((ok: boolean) => {
      if (ok) {
        setCopied(true)
        window.setTimeout(() => setCopied(false), 1500)
      }
    })
  }

  return (
    <div className="dsh-tdt-sv-cmviewer">
      <div className="dsh-tdt-sv-cm-bar">
        <button type="button" className="dsh-tdt-sv-cm-btn" onClick={copy} title={t('copyLabel')}>
          {copied ? t('copiedLabel') : t('copyLabel')}
        </button>
        <button
          type="button"
          className="dsh-tdt-sv-cm-btn"
          onClick={() => { setWrap((w) => !w) }}
          title={wrap ? t('diffUnwrapLabel') : t('diffWrapLabel')}
        >
          {wrap ? t('diffUnwrapLabel') : t('diffWrapLabel')}
        </button>
      </div>
      <CodeMirror
        value={text}
        className="dsh-tdt-sv-cm-editor"
        extensions={extensions}
        readOnly
        height="100%"
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
