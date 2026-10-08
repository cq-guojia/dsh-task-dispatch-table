/**
 * 模块标题行（UI 基础层）：**icon + 标题 + 右侧控件** 三段式。
 *
 * 2026-10-08 设置页重构时定型：每块 = 标题行 + 一块内容，标题行左侧 icon、右侧留给该块的控件
 * （日志块的自动刷新 / 刷新钮，表查询块的表切换）。此前三个块各写一个 `h3`，形态不统一。
 *
 * 排版规则：字号 / 行高 / 字色走 `--tdt-*` token；`right` 用 `marginLeft:auto` 靠右；
 * 标题 `flex:none` 不被压缩（与手册 §五「窄栏里的一行」同口径）。
 */
import { createElement as h, type ReactNode } from 'react'

export function SectionHead(props: { icon: ReactNode; title: string; right?: ReactNode }): ReturnType<typeof h> {
  return h('div', {
    style: { display: 'flex', alignItems: 'center', gap: 'var(--tdt-space-2)', marginBottom: 'var(--tdt-space-3)' },
  },
  h('span', { style: { display: 'inline-flex', alignItems: 'center', flex: 'none', color: 'var(--tdt-fg-3)' } }, props.icon),
  h('span', { style: { fontSize: 'var(--tdt-font-lg)', lineHeight: 'var(--tdt-line-lg)', fontWeight: 600, color: 'var(--tdt-fg)', flex: 'none' } }, props.title),
  props.right === undefined
    ? null
    : h('div', { style: { marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: 'var(--tdt-space-2)', minWidth: 0 } }, props.right),
  )
}
