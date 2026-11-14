/**
 * 下拉选择 —— 核心 `Picker` 的薄包装（2026-11-06）。
 *
 * 触发器 / 弹层 / 分组 / 搜索 / 空态 / 跑马灯 / 键盘与明暗全部归核心；
 * 本仓只补核心 `Picker` 尚未提供的一点：
 *  - `error` 校验描红：外层 `className` + 一条皮肤规则（`.dsh-tdt-picker--error`）。
 * 悬停提示**不在这里**（2026-11-06：全站原生 title 清退；需要的调用方在真 DOM 外套官方 `Tooltip`）。
 * 空列表 ⇒ 禁用并显示业务空态文案（不塞假值）。
 */
import { createElement as h, type ReactElement, type ReactNode } from 'react'
import { Picker } from 'dsh-plugin-core/ui/picker'
import type { PickerGroup } from 'dsh-plugin-core/ui/picker-logic'
import { ensureControlsStyle } from './controls-css'

/** 下拉 / 日期 / 时分的选项（value = 写进任务定义的真值）。 */
export interface EditorOption {
  value: string
  label: string
  /** 同一实体的历史标识（工作区用：老 title / 老 id），仅供展示归一与校验，不写入任务定义。 */
  aliases?: readonly string[]
}

export interface SelectFieldProps {
  /** 当前值。 */
  value: string
  /** 分组候选（给了就优先于 options；空组由调用方过滤）。 */
  groups?: PickerGroup[]
  /** 选项（未给 groups 时使用）。 */
  options?: EditorOption[]
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
  /** 定宽（数字 = px）。⚠️ 核心一收到 `width` 就把 width / minWidth / maxWidth 锁成同一个值 ⇒ 不可收缩。 */
  width?: number | string
  /** 最大宽（数字 = px）。 */
  maxWidth?: number | string
  /** 最小宽（数字 = px）；传 0 = 拆掉核心默认的 120 下限，交给外层弹性布局决定。 */
  minWidth?: number | string
  /** 根节点额外类名（布局类由调用方给；校验描红的 `dsh-tdt-picker--error` 由 `error` 自动拼）。 */
  className?: string
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
  const groups = props.groups
  const empty = groups === undefined
    ? (props.options ?? []).length === 0
    : groups.every((group) => group.options.length === 0)
  const usable = !empty && props.disabled !== true
  const width = props.width ?? (props.block === true ? '100%' : undefined)
  const cls = [
    props.className ?? '',
    props.block === true ? 'dsh-tdt-picker--block' : '',
    props.error === true ? 'dsh-tdt-picker--error' : '',
  ].filter(Boolean).join(' ')

  const picker = h(Picker, {
    ...(groups === undefined ? { options: props.options ?? [] } : { groups }),
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
    ...(props.minWidth === undefined ? {} : { minWidth: props.minWidth }),
    ...(props.maxWidth === undefined ? {} : { maxWidth: props.maxWidth }),
    ariaLabel: props.ariaLabel,
    ...(props.searchable === true ? { searchable: true } : {}),
  })

  return picker
}
