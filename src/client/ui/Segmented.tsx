/**
 * 分段控件（滑动块）—— **全站唯一实现**（L2 组件皮肤，P1）
 *
 * 它是「同一份结构 + 两个受控轴」的样板：
 *  - `size`：`sm`(24) / `md`(28) / `lg`(32) —— **离散三档**，调用点**不许**自己写高度
 *    （真不够用才允许在调用点本地覆盖 `--tdt-control-h-*`，属例外而非常态）；
 *  - `variant`：`default`（纯黑面：轨道=第二层面 + 外描边）/ `inset`（灰底面：抄「版本」开关观感，
 *    轨道=交互灰 hover 底、无外描边）—— 两套都保留、不合并；变体只改两个颜色变量，结构 / 尺寸 / 交互规则零重复。
 *
 * 用法：
 *   // 单选
 *   h(Segmented<'a' | 'b'>, { value: v, size: 'md', items: [{ value: 'a', label: '甲' }], onChange: setV })
 *   // 多选（如星期）
 *   h(Segmented<'1' | '2'>, { multiple: true, value: vs, items: [...], onChange: setVs })
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

interface SegmentedBaseProps<T extends string = string> {
  /** 段定义。 */
  items: readonly SegmentedItem<T>[]
  /** 高度档（默认 sm）。 */
  size?: 'sm' | 'md' | 'lg'
  /** 外观档（默认 default）。 */
  variant?: 'default' | 'inset'
  /** 撑满父宽、各段等分。 */
  block?: boolean
  /** 无障碍组名（读屏用）。 */
  label?: string
  /** 根节点 id（锚点 / 自动化测试用）。 */
  id?: string
  /** 追加到根节点的 class（只允许补布局，不许覆盖皮肤）。 */
  className?: string
  /** 整组禁用（表单只读态用）。 */
  disabled?: boolean
  /** 外层追加样式（只允许补布局，不许覆盖皮肤）。 */
  style?: CSSProperties
}

export interface SegmentedSingleProps<T extends string = string> extends SegmentedBaseProps<T> {
  multiple?: false
  /** 当前选中值。 */
  value: T
  onChange: (value: T) => void
}

export interface SegmentedMultiProps<T extends string = string> extends SegmentedBaseProps<T> {
  /** 多选模式（如星期）。 */
  multiple: true
  /** 当前选中值集合。 */
  value: T[]
  onChange: (value: T[]) => void
}

export type SegmentedProps<T extends string = string> = SegmentedSingleProps<T> | SegmentedMultiProps<T>

/**
 * 渲染一个分段控件（单选 / 多选同体）。
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
  const multiple = props.multiple === true
  const value = props.value
  const onChange = props.onChange
  return h('div', {
    role: 'group',
    'aria-label': props.label,
    id: props.id,
    // 结构一套、皮肤只在 controls-css 里；此处只拼「轴」类名，不写任何颜色 / 尺寸字面值。
    className: `dsh-tdt-seg dsh-tdt-seg--${variant} dsh-tdt-seg--${size}${props.block === true ? ' dsh-tdt-seg--block' : ''}${props.className !== undefined ? ' ' + props.className : ''}`,
    style: props.style,
  }, props.items.map(item => {
    const on = multiple ? (value as T[]).includes(item.value) : value === item.value
    const disabled = item.disabled === true || props.disabled === true
    const handle = (): void => {
      if (disabled) return
      if (multiple) {
        const arr = value as T[]
        const next = arr.includes(item.value) ? arr.filter(v => v !== item.value) : [...arr, item.value]
        ;(onChange as (v: T[]) => void)(next)
      } else {
        ;(onChange as (v: T) => void)(item.value)
      }
    }
    return h('button', {
      key: item.value,
      type: 'button',
      className: 'dsh-tdt-seg__item',
      // 选中态用 aria-pressed 表达 ⇒ 读屏可读，皮肤也只认这一个选择器
      'aria-pressed': on,
      disabled,
      onClick: handle,
    }, item.label, item.badge !== undefined && item.badge > 0
      ? h('span', { className: 'dsh-tdt-seg__badge' }, String(item.badge))
      : null)
  }))
}
