/**
 * 按钮 / 图标钮 —— **全站唯一实现**（L2 组件皮肤，P2）
 *
 * 两轴模型（同 Segmented）：
 *  - `variant`：`primary`（实心强调）/ `outline`（描边中性）/ `ghost`（无底无边）/ `danger`（实心红，破坏性确认）
 *  - `size`：`sm`(24) / `md`(28) / `lg`(32) —— 高度一律吃 `--tdt-control-h-*`，**有边 / 无边同高**（边框在内部补回）
 *
 * `IconButton` 是纯图标钮：`plain`（默认无底无边，hover 起灰底）/ `outline`（描边）/ `danger`（红）。
 * 链接型文字钮 = `Button variant="ghost"` + 修饰类 `dsh-tdt-btn--link`（红字危险描边 = `outline` + `dsh-tdt-btn--danger-ink`）。
 *
 * ⚠️ 不许在任何使用点就地写按钮样式；要多一档外观 ⇒ 走
 * docs/design/ui-style-guide.md §五 的流程（改基础层，一处改全站生效）。
 */
import { createElement as h, type CSSProperties, type ReactNode } from 'react'
import { ensureControlsStyle } from './controls-css'

/** 按钮外观档。 */
export type ButtonVariant = 'primary' | 'outline' | 'ghost' | 'danger'
/** 按钮高度档（sm 24 / md 28 / lg 32）。 */
export type ButtonSize = 'sm' | 'md' | 'lg'

export interface ButtonProps {
  /** 外观档（默认 outline）。 */
  variant?: ButtonVariant
  /** 高度档（默认 sm）。 */
  size?: ButtonSize
  /** 前置图标（可选）。 */
  icon?: ReactNode
  /** 追加 class（只允许补布局、或挂本文件声明的修饰类，不许覆盖皮肤）。 */
  className?: string
  /** 追加样式（只允许补布局，不许覆盖皮肤）。 */
  style?: CSSProperties
  /** 文案 / 内容。 */
  children?: ReactNode
  /** 其余原生 button 属性（type / disabled / title / aria-* / onClick …）原样透传。 */
  [key: string]: unknown
}

export interface IconButtonProps {
  /** 外观档（默认 plain）。 */
  variant?: 'plain' | 'outline' | 'danger'
  /** 高度档（默认 sm）。 */
  size?: ButtonSize
  /** 图标（必填）。 */
  icon: ReactNode
  /** 无障碍名（必填；同时作为默认 title）。 */
  label: string
  /** 追加 class。 */
  className?: string
  /** 追加样式。 */
  style?: CSSProperties
  /** 其余原生 button 属性原样透传。 */
  [key: string]: unknown
}

/** 组装按钮 class（结构一套 + 轴类）。 */
function buttonClass(variant: ButtonVariant, size: ButtonSize, extra?: string): string {
  return `dsh-tdt-btn dsh-tdt-btn--${variant} dsh-tdt-btn--${size}${extra !== undefined && extra !== '' ? ' ' + extra : ''}`
}

/**
 * 渲染一个文字 / 图标 + 文字按钮。
 *
 * @param props 见 {@link ButtonProps}。
 * @returns 按钮元素。
 */
export function Button(props: ButtonProps): ReturnType<typeof h> {
  ensureControlsStyle()
  const { variant = 'outline', size = 'lg', icon, className, style, children, ...rest } = props
  const attrs = {
    ...rest,
    type: (rest.type as string | undefined) ?? 'button',
    className: buttonClass(variant, size, className),
    style,
  }
  return h('button', attrs as never,
    icon !== undefined && icon !== null ? h('span', { className: 'dsh-tdt-btn__icon' }, icon) : null,
    children)
}

/**
 * 渲染一个纯图标按钮。
 *
 * @param props 见 {@link IconButtonProps}。
 * @returns 图标按钮元素。
 */
export function IconButton(props: IconButtonProps): ReturnType<typeof h> {
  ensureControlsStyle()
  const { variant = 'plain', size = 'lg', icon, label, className, style, ...rest } = props
  const attrs = {
    ...rest,
    type: (rest.type as string | undefined) ?? 'button',
    title: rest.title ?? label,
    'aria-label': rest['aria-label'] ?? label,
    className: `dsh-tdt-iconbtn dsh-tdt-iconbtn--${variant} dsh-tdt-iconbtn--${size}${className !== undefined && className !== '' ? ' ' + className : ''}`,
    style,
  }
  return h('button', attrs as never, icon)
}
