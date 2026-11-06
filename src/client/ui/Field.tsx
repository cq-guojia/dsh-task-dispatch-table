/**
 * 下拉锚点 —— 本仓**唯一保留**的输入类件（2026-11-06）。
 *
 * `Input` / `PrefixedInput` / `NumberInput` 已全部改接核心 `dsh-plugin-core/ui`；
 * 这里只剩 `SelectField`：核心 `Picker` 目前没有 `error`（校验描红）/ `title`（悬停提示）/ `marquee` 语义，
 * 属核心缺口（见 worklog），在核心补齐前继续用官方 `Menu` 薄包装。
 */
import { createElement as h, useMemo, useState, type ReactElement, type ReactNode } from 'react'
import { IconChevronDownOutlineRegular, Menu, type MenuEntry } from '@deepseek-ai/dsh-client-ui-primitives'
import { MarqueeText, fieldMetricsOf, FIELD_ANCHOR_STYLE, FIELD_LABEL_STYLE, type FieldSize } from 'dsh-plugin-core/ui'
import { ensureControlsStyle } from './controls-css'

/** 下拉 / 日期 / 时分的选项（value = 写进任务定义的真值）。 */
export interface EditorOption {
  value: string
  label: string
}

function IconSeat(props: { children: ReactNode }): ReactElement {
  return h('span', { style: { display: 'inline-flex', width: '16px', height: '16px', alignItems: 'center', justifyContent: 'center', flex: 'none', color: 'var(--dshpc-fg-3)' } }, props.children)
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
  size?: FieldSize
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
      background: hover && usable ? 'var(--dshpc-hover)' : 'var(--dshpc-surface-1)',
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
        style: { ...FIELD_LABEL_STYLE, color: current === undefined ? 'var(--dshpc-fg-dim)' : 'var(--dshpc-fg)' },
      })
      : h('span', { className: 'dsh-tdt-ellipsis', style: { ...FIELD_LABEL_STYLE, color: current === undefined ? 'var(--dshpc-fg-dim)' : 'var(--dshpc-fg)' } },
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
