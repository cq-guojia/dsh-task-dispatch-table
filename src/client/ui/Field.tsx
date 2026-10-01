/**
 * 输入类控件 —— **全站唯一实现**（L2 组件皮肤，P3）
 *
 * - `Input`：文本输入（size sm 24 / md 28，error 描红）；
 * - `PrefixedInput`：前缀 + 文本输入（如路径 / 接口前缀）；
 * - `NumberInput`：数字步进（显式 `− / +`，替换原生 `<input type="number">` 的浏览器 spinner，
 *   支持 step / min / max、clamp、Enter 提交、失焦回弹）。
 *
 * 高度一律吃 `--tdt-control-h-*`；有边 / 无边同高（边框在内部补回）。
 */
import { createElement as h, useEffect, useState, type CSSProperties } from 'react'
import { IconButton } from './Button'
import { ensureControlsStyle } from './controls-css'

/** 输入高度档（sm 24 / md 28）。 */
export type FieldSize = 'sm' | 'md'

function sizeClass(size: FieldSize): string {
  return size === 'md' ? '--md' : '--sm'
}

export interface InputProps {
  /** 当前值。 */
  value: string
  /** 变更回调（原生 input value）。 */
  onChange: (value: string) => void
  /** 占位。 */
  placeholder?: string
  /** 高度档（默认 sm）。 */
  size?: FieldSize
  /** 校验不通过：描红。 */
  error?: boolean
  /** 禁用。 */
  disabled?: boolean
  /** 原生 type（默认 text）。 */
  type?: string
  /** 无障碍名。 */
  'aria-label'?: string
  /** 悬停提示。 */
  title?: string
  /** 追加 class。 */
  className?: string
  /** 追加样式（只允许补布局）。 */
  style?: CSSProperties
}

/** 文本输入。 */
export function Input(props: InputProps): ReturnType<typeof h> {
  ensureControlsStyle()
  const { value, onChange, placeholder, size = 'sm', error, disabled, type, className, style } = props
  return h('input', {
    type: type ?? 'text',
    value,
    placeholder,
    disabled,
    'aria-label': props['aria-label'],
    title: props.title,
    className: `dsh-tdt-input dsh-tdt-input${sizeClass(size)}${error === true ? ' dsh-tdt-input--error' : ''}${className !== undefined && className !== '' ? ' ' + className : ''}`,
    style,
    onChange: (event: { target: { value: string } }) => { onChange(event.target.value) },
  } as never)
}

export interface PrefixedInputProps extends Omit<InputProps, 'className'> {
  /** 前置文案（如 https:// / C:\）。 */
  prefix: string
  /** 追加 class。 */
  className?: string
}

/** 前缀 + 文本输入。 */
export function PrefixedInput(props: PrefixedInputProps): ReturnType<typeof h> {
  ensureControlsStyle()
  const { prefix, value, onChange, placeholder, size = 'sm', error, disabled, type, className, style } = props
  return h('div', {
    className: `dsh-tdt-pfx dsh-tdt-pfx${sizeClass(size)}${error === true ? ' dsh-tdt-pfx--error' : ''}${className !== undefined && className !== '' ? ' ' + className : ''}`,
    style,
  },
    h('span', { className: 'dsh-tdt-pfx__label' }, prefix),
    h('input', {
      type: type ?? 'text',
      value,
      placeholder,
      disabled,
      'aria-label': props['aria-label'],
      title: props.title,
      className: 'dsh-tdt-pfx__input',
      onChange: (event: { target: { value: string } }) => { onChange(event.target.value) },
    } as never))
}

export interface NumberInputProps {
  /** 当前值（数字）。 */
  value: number
  /** 变更回调（已 clamp）。 */
  onChange: (value: number) => void
  /** 最小值（默认 -Infinity）。 */
  min?: number
  /** 最大值（默认 +Infinity）。 */
  max?: number
  /** 步进（默认 1）。 */
  step?: number
  /** 高度档（默认 sm）。 */
  size?: FieldSize
  /** 禁用。 */
  disabled?: boolean
  /** 后缀（如「秒」「次」）。 */
  suffix?: string
  /** 无障碍名。 */
  label?: string
  /** 减号无障碍名。 */
  decreaseLabel?: string
  /** 加号无障碍名。 */
  increaseLabel?: string
  /** 追加 class。 */
  className?: string
  /** 追加样式（只允许补布局）。 */
  style?: CSSProperties
}

/**
 * 数字步进输入：显式 `− / +` 按钮 + 可输入数字。
 *
 * @param props 见 {@link NumberInputProps}。
 * @returns 数字步进控件。
 */
export function NumberInput(props: NumberInputProps): ReturnType<typeof h> {
  ensureControlsStyle()
  const {
    value, onChange, min = -Infinity, max = Infinity, step = 1, size = 'sm',
    disabled, suffix, label, decreaseLabel = '减少', increaseLabel = '增加', className, style,
  } = props
  const [text, setText] = useState(String(value))
  // 外部值变化（如切档位重置）时同步回输入框。
  useEffect(() => { setText(String(value)) }, [value])
  const clamp = (n: number): number => Math.min(max, Math.max(min, n))
  const commit = (raw: string): void => {
    const n = Number(raw)
    if (!Number.isFinite(n)) { setText(String(value)); return }
    const next = clamp(n)
    setText(String(next))
    if (next !== value) onChange(next)
  }
  const bump = (dir: number): void => {
    const base = Number.isFinite(Number(text)) ? Number(text) : value
    const next = clamp(base + dir * step)
    setText(String(next))
    if (next !== value) onChange(next)
  }
  return h('div', {
    className: `dsh-tdt-num dsh-tdt-num${sizeClass(size)}${disabled === true ? ' dsh-tdt-num--disabled' : ''}${className !== undefined && className !== '' ? ' ' + className : ''}`,
    style,
  },
    h(IconButton, { variant: 'plain', size, icon: '−', label: decreaseLabel, disabled, onClick: () => { bump(-1) } }),
    h('input', {
      className: 'dsh-tdt-num__input',
      value: text,
      disabled,
      inputMode: 'numeric',
      'aria-label': label,
      onChange: (event: { target: { value: string } }) => { setText(event.target.value) },
      onBlur: () => { commit(text) },
      onKeyDown: (event: { key: string }) => { if (event.key === 'Enter') commit(text) },
    } as never),
    suffix !== undefined ? h('span', { className: 'dsh-tdt-num__suffix' }, suffix) : null,
    h(IconButton, { variant: 'plain', size, icon: '+', label: increaseLabel, disabled, onClick: () => { bump(1) } }))
}
