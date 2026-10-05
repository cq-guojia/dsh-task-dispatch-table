/**
 * 勾选框（P3 输入类家族唯一实现；U20 #6，2026-10-05）。
 *
 * 以前确认弹窗里是裸 `<input type="checkbox">` + 业务内联样式，现上提为基础层件。
 * 标记色默认随业务色；高危确认可传 `accentColor`（如 `var(--tdt-warning)`）染橙。
 */
import { createElement as h, type ReactNode } from 'react'

export interface CheckboxProps {
  /** 当前勾选态。 */
  checked: boolean
  /** 变更回调。 */
  onChange: (next: boolean) => void
  /** 右侧文案（不传 = 只渲染一个勾选框）。 */
  label?: ReactNode
  /** 勾选标记色（默认 `var(--tdt-business)`）。 */
  accentColor?: string
  /** 禁用。 */
  disabled?: boolean
  /** 追加 class。 */
  className?: string
}

/** 勾选框（label + input 一体，整行可点）。 */
export function Checkbox(props: CheckboxProps): ReturnType<typeof h> {
  const { checked, onChange, label, accentColor, disabled, className } = props
  return h('label', {
    className: `dsh-tdt-checkbox${className !== undefined && className !== '' ? ' ' + className : ''}`,
    style: {
      display: 'flex', alignItems: 'flex-start', gap: '8px',
      fontSize: 'var(--tdt-font-md)', lineHeight: 'var(--tdt-line-md)',
      cursor: disabled === true ? 'default' : 'pointer',
    },
  },
    h('input', {
      type: 'checkbox',
      checked,
      disabled,
      style: {
        flex: 'none', margin: '2px 0 0',
        accentColor: accentColor ?? 'var(--tdt-business)',
        width: '14px', height: '14px',
        cursor: disabled === true ? 'default' : 'pointer',
      },
      onChange: (event: { target: { checked: boolean } }) => { onChange(event.target.checked) },
    }),
    label !== undefined ? h('span', null, label) : null,
  )
}
