/**
 * 输入类控件 —— **全站唯一实现**（L2 组件皮肤，P3）
 *
 * - `Input`：文本输入（size sm 24 / md 28 / lg 32，error 描红）；
 * - `PrefixedInput`：前缀 + 文本输入（如路径 / 接口前缀）；
 * - `NumberInput`：数字步进（显式 `− / +`，替换原生 `<input type="number">` 的浏览器 spinner，
 *   支持 step / min / max、clamp、Enter 提交、失焦回弹）。
 *
 * 高度一律吃 `--tdt-control-h-*`；有边 / 无边同高（边框在内部补回）。
 */
import { createElement as h, useEffect, useMemo, useState, type CSSProperties, type ReactElement, type ReactNode, type RefObject } from 'react'
import { IconChevronDownOutlineRegular, Menu, type MenuEntry } from '@deepseek-ai/dsh-client-ui-primitives'
import { IconButton } from './Button'
import { ensureControlsStyle } from './controls-css'
import { MarqueeText } from './MarqueeText'

/** 输入高度档（sm 24 / md 28 / lg 32）。 */
export type FieldSize = 'sm' | 'md' | 'lg'

function sizeClass(size: FieldSize): string {
  return size === 'lg' ? '--lg' : size === 'md' ? '--md' : '--sm'
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
  /** 原生 input 的 ref（调用方需要主动聚焦时用，如任务选择器的搜索框）。 */
  inputRef?: RefObject<HTMLInputElement | null>
  /** 键盘事件（如搜索框里 Enter 直接选中第一项）。 */
  onKeyDown?: (event: { key: string; preventDefault(): void }) => void
  /** 失焦（如数字框把「清空 / 输一半」的草稿回弹成已提交值）。 */
  onBlur?: () => void
}

/** 文本输入。 */
export function Input(props: InputProps): ReturnType<typeof h> {
  ensureControlsStyle()
  const { value, onChange, placeholder, size = 'lg', error, disabled, type, className, style } = props
  return h('input', {
    ref: props.inputRef,
    type: type ?? 'text',
    value,
    placeholder,
    disabled,
    'aria-label': props['aria-label'],
    title: props.title,
    className: `dsh-tdt-input dsh-tdt-input${sizeClass(size)}${error === true ? ' dsh-tdt-input--error' : ''}${className !== undefined && className !== '' ? ' ' + className : ''}`,
    style,
    onChange: (event: { target: { value: string } }) => { onChange(event.target.value) },
    onKeyDown: props.onKeyDown,
    onBlur: props.onBlur,
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
  const { prefix, value, onChange, placeholder, size = 'lg', error, disabled, type, className, style } = props
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
  /** 内部数字输入区宽度（px；不传取 CSS 规格 36，够 3~4 位数）。 */
  inputWidth?: number
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
    value, onChange, min = -Infinity, max = Infinity, step = 1, size = 'lg', inputWidth,
    disabled, suffix, label, decreaseLabel = '减少', increaseLabel = '增加', className, style,
  } = props
  const [text, setText] = useState(String(value))
  // 外部值变化（如切档位重置）时同步回输入框。
  useEffect(() => { setText(String(value)) }, [value])
  const clamp = (n: number): number => Math.min(max, Math.max(min, n))
  const commit = (raw: string): void => {
    // ⚠️ 空串按「输入无效」回弹，**不能**当成 0（2026-10-08 真机 bug：`Number('') === 0` ⇒
    // 用户按 Delete 把数字删空后失焦，值被 clamp 成 min，看起来就是「按 Delete 不管用」）。
    if (raw.trim() === '') { setText(String(value)); return }
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
      ...(inputWidth === undefined ? {} : { style: { width: `${inputWidth}px` } }),
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

// ─────────────────────── 下拉（官方 Menu）P6 ───────────────────────

/** 下拉 / 日期 / 时分的选项（value = 写进任务定义的真值）。 */
export interface EditorOption {
  value: string
  label: string
}

/**
 * 下拉锚点的统一样式（**全站唯一一份**）：`SelectField` 与 `TaskPicker` 共用 —— 两者是同一类锚点，
 * 不许各抄一份（2026-10-04 评审：TaskPicker 曾抄第二/第三份，观感会持续漂移）。
 */
export const FIELD_ANCHOR_STYLE: CSSProperties = {
  display: 'inline-flex', alignItems: 'center', gap: '6px', height: 'var(--tdt-control-h-lg)', boxSizing: 'border-box',
  minWidth: 0, maxWidth: '100%', padding: '0 var(--tdt-space-2)',
  border: '0.5px solid var(--tdt-border-heavy)', borderRadius: 'var(--tdt-radius-md)', background: 'var(--tdt-surface-1)',
  color: 'var(--tdt-fg)', font: 'inherit', fontSize: 'var(--tdt-font-md)', lineHeight: 'var(--tdt-line-md)', cursor: 'pointer',
  transition: 'background var(--tdt-dur-fast) var(--tdt-ease), color var(--tdt-dur-fast) var(--tdt-ease), border-color var(--tdt-dur-fast) var(--tdt-ease)',
}

/** 下拉锚点里那行文字（省略号三件套收敛到 `.dsh-tdt-ellipsis`，见 ui-style-guide §三 待抽象 #1）。 */
export const FIELD_LABEL_STYLE: CSSProperties = {
  flex: '1 1 auto', minWidth: 0, textAlign: 'left',
}

/** 尺寸档 → 锚点几何（高度 / 字号 / 行高 / 图标 / 间距）。**翻译只此一处**，下拉类控件共用。 */
export function fieldMetricsOf(size: FieldSize): { height: string; font: string; line: string; icon: number; gap: string } {
  return {
    height: size === 'sm' ? 'var(--tdt-control-h-sm)' : size === 'md' ? 'var(--tdt-control-h-md)' : 'var(--tdt-control-h-lg)',
    font: size === 'sm' ? 'var(--tdt-font-sm)' : 'var(--tdt-font-md)',
    line: size === 'sm' ? 'var(--tdt-line-sm)' : 'var(--tdt-line-md)',
    icon: size === 'sm' ? 14 : 16,
    gap: size === 'sm' ? 'var(--tdt-space-1)' : '6px',
  }
}

function IconSeat(props: { children: ReactNode }): ReactElement {
  return h('span', { style: { display: 'inline-flex', width: '16px', height: '16px', alignItems: 'center', justifyContent: 'center', flex: 'none', color: 'var(--tdt-fg-3)' } }, props.children)
}

export interface SelectFieldProps {
  /** 当前值。 */
  value: string
  /** 选项。 */
  options: EditorOption[]
  /** 选中回调。 */
  onChange: (value: string) => void
  /** 未选中时的占位。 */
  placeholder: string
  /** 列表为空时的文案。 */
  emptyLabel: string
  /** 无障碍名。 */
  ariaLabel: string
  /** 行首图标。 */
  icon?: ReactNode
  /** 浮层对齐。 */
  align?: 'start' | 'end'
  /** 禁用。 */
  disabled?: boolean
  /** 悬停提示。 */
  title?: string
  /** 锚点宽度（数字 = px）。 */
  width?: number | string
  /** 锚点最大宽度（数字 = px）。 */
  maxWidth?: number | string
  /** 文本超长时走 MarqueeText（默认省略号）。 */
  marquee?: boolean
  /** 整行下拉（撑满父宽）。 */
  block?: boolean
  /** 高度档（sm 24 / md 28 / lg 32，默认 lg = 32 标准行）。 */
  size?: 'sm' | 'md' | 'lg'
  /** 校验不通过：描红。 */
  error?: boolean
}

/**
 * 下拉选择：官方 `Menu`（portal 到 body，避免被弹窗内部滚动裁掉；选中项自动带对勾）。
 * 空列表 ⇒ 禁用并显示空态文案（接不到真数据时不塞假值）。
 */
export function SelectField(props: SelectFieldProps): ReactElement {
  ensureControlsStyle()
  const [open, setOpen] = useState(false)
  const [hover, setHover] = useState(false)
  const size = props.size ?? 'lg'
  const metrics = fieldMetricsOf(size)
  const iconSize = metrics.icon
  const usable = props.options.length > 0 && props.disabled !== true
  const current = props.options.find(option => option.value === props.value)
  const items: MenuEntry[] = useMemo(
    () => props.options.map(option => ({ id: option.value, label: option.label })),
    [props.options],
  )

  const anchor = h('button', {
    type: 'button',
    className: `dsh-tdt-ed-field${props.error === true ? ' dsh-tdt-ed-field--error' : ''}`,
    disabled: !usable,
    'aria-haspopup': 'menu',
    'aria-expanded': open,
    'aria-label': props.ariaLabel,
    title: props.title,
    onPointerEnter: () => { setHover(true) },
    onPointerLeave: () => { setHover(false) },
    onClick: () => { setOpen(!open) },
    style: {
      ...FIELD_ANCHOR_STYLE,
      height: metrics.height, gap: metrics.gap, fontSize: metrics.font, lineHeight: metrics.line,
      width: props.width ?? (props.block === true ? '100%' : undefined),
      ...(props.maxWidth === undefined ? {} : { maxWidth: props.maxWidth }),
      background: hover && usable ? 'var(--tdt-hover)' : 'var(--tdt-surface-1)',
      cursor: usable ? 'pointer' : 'not-allowed',
      opacity: usable ? 1 : 0.6,
    },
  },
    props.icon === undefined ? null : h(IconSeat, null, props.icon),
    props.marquee === true
      ? h(MarqueeText, {
        text: current?.label ?? (usable ? props.placeholder : props.emptyLabel),
        title: props.title ?? props.ariaLabel,
        className: 'dsh-tdt-ellipsis',
        style: { ...FIELD_LABEL_STYLE, color: current === undefined ? 'var(--tdt-fg-dim)' : 'var(--tdt-fg)' },
      })
      : h('span', { className: 'dsh-tdt-ellipsis', style: { ...FIELD_LABEL_STYLE, color: current === undefined ? 'var(--tdt-fg-dim)' : 'var(--tdt-fg)' } },
        current?.label ?? (usable ? props.placeholder : props.emptyLabel)),
    h(IconSeat, null, h(IconChevronDownOutlineRegular, { size: iconSize })),
  )

  if (!usable) return anchor
  return h(Menu, {
    open,
    anchor,
    items,
    selectedId: props.value,
    selection: 'check',
    align: props.align ?? 'start',
    portal: true,
    className: props.block === true ? 'dsh-tdt-ed-selectwrap' : undefined,
    onSelect: (id: string) => { setOpen(false); props.onChange(id) },
    onClose: () => { setOpen(false) },
  })
}
