/**
 * 下拉选择 —— 核心 `Picker` 的薄包装（2026-11-06）。
 *
 * 触发器 / 弹层 / 分组 / 搜索 / 空态 / 跑马灯 / 键盘与明暗全部归核心；
 * 本仓只补核心 `Picker` 尚未提供的两点：
 *  - `error` 校验描红：外层 `className` + 一条皮肤规则（`.dsh-tdt-picker--error`）；
 *  - `title` 悬停提示：外层 `span` 兜底（核心没有该 prop）。
 * 空列表 ⇒ 禁用并显示业务空态文案（不塞假值）。
 */
import { createElement as h, type ReactElement, type ReactNode } from 'react'
import { Picker } from 'dsh-plugin-core/ui'
import { ensureControlsStyle } from './controls-css'

/** 下拉 / 日期 / 时分的选项（value = 写进任务定义的真值）。 */
export interface EditorOption {
  value: string
  label: string
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
  /** 禁用。 */
  disabled?: boolean
  /** 悬停提示。 */
  title?: string
  /** 定宽（数字 = px）。 */
  width?: number | string
  /** 最大宽（数字 = px）。 */
  maxWidth?: number | string
  /** 整行下拉（撑满父宽）。 */
  block?: boolean
  /** 高度档（sm 24 / md 28 / lg 32，默认 lg = 32 标准行）。 */
  size?: 'sm' | 'md' | 'lg'
  /** 校验不通过：描红。 */
  error?: boolean
  /** 下拉内搜索框（工作区这类长候选必须开）。 */
  searchable?: boolean
}

/**
 * 下拉选择：核心 `Picker`（portal 到 body，选中项自动带对勾，内容超长走跑马灯）。
 * 空列表 ⇒ 禁用并显示空态文案（接不到真数据时不塞假值）。
 */
export function SelectField(props: SelectFieldProps): ReactElement {
  ensureControlsStyle()
  const size = props.size ?? 'lg'
  const empty = props.options.length === 0
  const usable = !empty && props.disabled !== true
  const width = props.width ?? (props.block === true ? '100%' : undefined)
  const cls = [
    props.block === true ? 'dsh-tdt-picker--block' : '',
    props.error === true ? 'dsh-tdt-picker--error' : '',
  ].filter(Boolean).join(' ')

  const picker = h(Picker, {
    options: props.options,
    value: props.value,
    onChange: (next: string | string[]) => {
      if (typeof next === 'string') props.onChange(next)
    },
    placeholder: empty ? props.emptyLabel : props.placeholder,
    disabled: !usable,
    size,
    icon: props.icon,
    className: cls === '' ? undefined : cls,
    width,
    ...(props.maxWidth === undefined ? {} : { maxWidth: props.maxWidth }),
    ariaLabel: props.ariaLabel,
    ...(props.searchable === true ? { searchable: true } : {}),
  })

  return props.title === undefined
    ? picker
    : h('span', {
      title: props.title,
      style: props.block === true ? { display: 'block' } : { display: 'inline-flex', minWidth: 0 },
    }, picker)
}
