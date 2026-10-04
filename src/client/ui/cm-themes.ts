/**
 * CodeMirror 6 主题（移植自 DSH-better-sidebar 的 cm-themes.ts，token 名换成
 * 本仓的 --tdt-*）。提供：
 *  - cmSurfaceTheme：透明底 + 13px + 等宽字体 + 行号槽用 --tdt-fg-3，随宿主滚动；
 *  - codeMirrorTheme(dark)：表面主题 + 选区/激活行微调 + one-dark/one-light 语法色。
 * 主矛盾是“不卡”，配色/字号顺带对齐到用户认可的 one-dark 13px 观感。
 */
import { HighlightStyle, syntaxHighlighting } from '@codemirror/language'
import { tags, type Tag } from '@lezer/highlight'
import { type Extension } from '@codemirror/state'
import { EditorView } from '@codemirror/view'

const ONE_DARK = {
  black: '#282c34', gray: '#abb2bf', faintGray: '#5c6370', white: '#ffffff',
  red: '#e06c75', green: '#98c379', yellow: '#e5c07b', blue: '#61afef',
  magenta: '#c678dd', cyan: '#56b6c2', orange: '#d19a66', link: '#56b6c2',
} as const

const ONE_LIGHT = {
  black: '#383a42', gray: '#a0a1a7', faintGray: '#4f525e', white: '#ffffff',
  red: '#e45649', green: '#50a14f', yellow: '#c18401', blue: '#0184bc',
  magenta: '#a626a4', cyan: '#0997b3', orange: '#986801', link: '#4078f2',
} as const

// 表面层：透明底、13px、等宽字体、行号槽取 --tdt-fg-3；不抢背景，叠在宿主面板上。
export const cmSurfaceTheme = EditorView.theme({
  '&': {
    height: '100%',
    fontSize: '13px',
    backgroundColor: 'transparent',
    color: 'var(--tdt-fg, #1f2328)',
  },
  '.cm-scroller': {
    overflow: 'auto',
    fontFamily: 'var(--tdt-font-mono, ui-monospace, SFMono-Regular, Menlo, Consolas, monospace)',
  },
  '.cm-content': {
    caretColor: 'var(--tdt-fg, #1f2328)',
  },
  '.cm-gutters': {
    backgroundColor: 'transparent',
    color: 'var(--tdt-fg-3, rgba(128,128,128,0.8))',
    border: 'none',
  },
  '.cm-activeLine': {
    backgroundColor: 'transparent',
  },
  '.cm-activeLineGutter': {
    backgroundColor: 'transparent',
  },
})

function cmSurfaceTint(dark: boolean): ReturnType<typeof EditorView.theme> {
  return EditorView.theme({
    '.cm-selectionBackground, .cm-focused .cm-selectionBackground, ::selection': {
      backgroundColor: dark ? 'rgba(255,255,255,0.22)' : 'rgba(0,0,0,0.12)',
    },
  })
}

interface HighlightRule {
  tag: Tag | readonly Tag[]
  color?: string
  fontStyle?: string
  fontWeight?: string
  textDecoration?: string
}

const HIGHLIGHTS_DARK: HighlightRule[] = [
  { tag: [tags.comment, tags.lineComment, tags.blockComment], color: ONE_DARK.faintGray, fontStyle: 'italic' },
  { tag: [tags.keyword, tags.modifier, tags.controlKeyword, tags.moduleKeyword], color: ONE_DARK.magenta },
  { tag: [tags.operator, tags.operatorKeyword, tags.compareOperator, tags.logicOperator, tags.bitwiseOperator], color: ONE_DARK.cyan },
  { tag: [tags.definitionKeyword, tags.atom], color: ONE_DARK.cyan },
  { tag: [tags.number, tags.bool, tags.null, tags.escape], color: ONE_DARK.orange },
  { tag: [tags.string, tags.special(tags.string), tags.regexp], color: ONE_DARK.green },
  { tag: [tags.character, tags.special(tags.character)], color: ONE_DARK.orange },
  { tag: [tags.propertyName], color: ONE_DARK.yellow },
  { tag: [tags.variableName], color: ONE_DARK.white },
  { tag: [tags.function(tags.variableName), tags.function(tags.propertyName), tags.labelName], color: ONE_DARK.blue },
  { tag: [tags.className, tags.typeName, tags.namespace], color: ONE_DARK.yellow },
  { tag: [tags.definition(tags.typeName), tags.definition(tags.className), tags.definition(tags.namespace)], color: ONE_DARK.yellow },
  { tag: [tags.tagName], color: ONE_DARK.red },
  { tag: [tags.attributeName], color: ONE_DARK.yellow },
  { tag: [tags.self, tags.standard(tags.variableName), tags.constant(tags.variableName)], color: ONE_DARK.orange },
  { tag: [tags.punctuation, tags.separator, tags.bracket], color: ONE_DARK.gray },
  { tag: [tags.squareBracket, tags.paren, tags.brace], color: ONE_DARK.gray },
  { tag: [tags.meta, tags.documentMeta, tags.annotation], color: ONE_DARK.gray },
  { tag: [tags.link, tags.url], color: ONE_DARK.link, fontStyle: 'underline' },
  { tag: [tags.heading], color: ONE_DARK.blue, fontStyle: 'bold' },
  { tag: [tags.emphasis], fontStyle: 'italic' },
  { tag: [tags.strong], fontWeight: 'bold' },
  { tag: [tags.strikethrough], textDecoration: 'line-through' },
  { tag: [tags.monospace], color: ONE_DARK.green },
  { tag: [tags.contentSeparator], color: ONE_DARK.faintGray },
  { tag: [tags.invalid], color: ONE_DARK.red },
]

const HIGHLIGHTS_LIGHT: HighlightRule[] = [
  { tag: [tags.comment, tags.lineComment, tags.blockComment], color: ONE_LIGHT.faintGray, fontStyle: 'italic' },
  { tag: [tags.keyword, tags.modifier, tags.controlKeyword, tags.moduleKeyword], color: ONE_LIGHT.magenta },
  { tag: [tags.operator, tags.operatorKeyword, tags.compareOperator, tags.logicOperator, tags.bitwiseOperator], color: ONE_LIGHT.cyan },
  { tag: [tags.definitionKeyword, tags.atom], color: ONE_LIGHT.cyan },
  { tag: [tags.number, tags.bool, tags.null, tags.escape], color: ONE_LIGHT.orange },
  { tag: [tags.string, tags.special(tags.string), tags.regexp], color: ONE_LIGHT.green },
  { tag: [tags.character, tags.special(tags.character)], color: ONE_LIGHT.orange },
  { tag: [tags.propertyName], color: ONE_LIGHT.black },
  { tag: [tags.variableName], color: ONE_LIGHT.black },
  { tag: [tags.function(tags.variableName), tags.function(tags.propertyName), tags.labelName], color: ONE_LIGHT.blue },
  { tag: [tags.className, tags.typeName, tags.namespace], color: ONE_LIGHT.yellow },
  { tag: [tags.definition(tags.typeName), tags.definition(tags.className), tags.definition(tags.namespace)], color: ONE_LIGHT.yellow },
  { tag: [tags.tagName], color: ONE_LIGHT.red },
  { tag: [tags.attributeName], color: ONE_LIGHT.yellow },
  { tag: [tags.self, tags.standard(tags.variableName), tags.constant(tags.variableName)], color: ONE_LIGHT.orange },
  { tag: [tags.punctuation, tags.separator, tags.bracket], color: ONE_LIGHT.gray },
  { tag: [tags.squareBracket, tags.paren, tags.brace], color: ONE_LIGHT.gray },
  { tag: [tags.meta, tags.documentMeta, tags.annotation], color: ONE_LIGHT.gray },
  { tag: [tags.link, tags.url], color: ONE_LIGHT.link, fontStyle: 'underline' },
  { tag: [tags.heading], color: ONE_LIGHT.blue, fontStyle: 'bold' },
  { tag: [tags.emphasis], fontStyle: 'italic' },
  { tag: [tags.strong], fontWeight: 'bold' },
  { tag: [tags.strikethrough], textDecoration: 'line-through' },
  { tag: [tags.monospace], color: ONE_LIGHT.green },
  { tag: [tags.contentSeparator], color: ONE_LIGHT.faintGray },
  { tag: [tags.invalid], color: ONE_LIGHT.red },
]

/** 返回 CodeMirror 6 主题扩展数组（表面 + 选区微调 + one-dark/one-light 语法色）。 */
export function codeMirrorTheme(dark: boolean): Extension[] {
  return [
    cmSurfaceTheme,
    cmSurfaceTint(dark),
    syntaxHighlighting(HighlightStyle.define(dark ? HIGHLIGHTS_DARK : HIGHLIGHTS_LIGHT)),
  ]
}
