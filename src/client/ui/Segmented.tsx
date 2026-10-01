/**
 * 分段控件（滑动块）—— **全站唯一实现**（L2 组件皮肤，P1）
 *
 * 它是「同一份结构 + 两个受控轴」的样板：
 *  - `size`：`sm`(控件总高 24) / `md`(28) —— 全站只有这两档，调用点**不许**自己写高度；
 *  - `variant`：`default`（轨道第二层面、选中亮片）/ `inset`（已有底色的容器里用，轨道第一层面、选中第三层面）
 *    —— 变体只改两个颜色变量，结构 / 尺寸 / 交互规则零重复（见 `controls-css.ts`）。
 *
 * 用法：
 *   h(Segmented<'a' | 'b'>, { value: v, size: 'md', items: [{ value: 'a', label: '甲' }], onChange: setV })
 *
 * ⚠️ 不许在任何使用点就地写分段样式；要多一档高度 / 多一个外观 ⇒ 走
 * docs/design/ui-style-guide.md §五 的流程（改基础层，一处改全站生效）。
 */
import { createElement as h, type CSSProperties } from 'react'
import { ensureControlsStyle } from './controls-css'
import { ensureUiBase } from './style'

/** 一段（一个可选值）。 */
export interface SegmentedItem<T extends string = string> {
  /** 该段代表的值（唯一）。 */
  value: T
  /** 段内文字。 */
  label: string
  /** 段内角标数字（如「异常 3」）；`undefined` 或 ≤0 不显示。 */
  badge?: number
  /** 置灰不可点。 */
  disabled?: boolean
}

export interface SegmentedProps<T extends string = string> {
  /** 当前选中值。 */
  value: T
  items: readonly SegmentedItem<T>[]
  onChange: (value: T) => void
  /** 高度档（默认 sm）。 */
  size?: 'sm' | 'md'
  /** 外观档（默认 default）。 */
  variant?: 'default' | 'inset'
  /** 撑满父宽、各段等分。 */
  block?: boolean
  /** 无障碍组名（读屏用）。 */
  label?: string
  /** 外层追加样式（只允许补布局，不许覆盖皮肤）。 */
  style?: CSSProperties
}

/**
 * 渲染一个分段控件。
 *
 * @param props 见 {@link SegmentedProps}。
 * @returns 分段控件元素。
 */
export function Segmented<T extends string>(props: SegmentedProps<T>): ReturnType<typeof h> {
  // 幂等：token 层 + 控件皮肤（首次渲染时挂上，之后是空转）
  ensureUiBase()
  ensureControlsStyle()
  const size = props.size ?? 'sm'
  const variant = props.variant ?? 'default'
  return h('div', {
    role: 'group',
    'aria-label': props.label,
    className: `dsh-tdt-seg dsh-tdt-seg--${variant} dsh-tdt-seg--${size}${props.block === true ? ' dsh-tdt-seg--block' : ''}`,
    style: props.style,
  }, props.items.map(item => h('button', {
    key: item.value,
    type: 'button',
    className: 'dsh-tdt-seg__item',
    // 选中态用 aria-pressed 表达 ⇒ 读屏可读，皮肤也只认这一个选择器
    'aria-pressed': item.value === props.value,
    disabled: item.disabled,
    onClick: () => { props.onChange(item.value) },
  }, item.label, item.badge !== undefined && item.badge > 0
    ? h('span', { className: 'dsh-tdt-seg__badge' }, String(item.badge))
    : null)))
}
