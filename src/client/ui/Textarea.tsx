/**
 * 多行文本输入（P3 输入类家族唯一实现；皮肤见 controls-css.ts 的 `.dsh-tdt-textarea`）。
 *
 * 以前提示词框是 `task-editor.tsx` 里手写的 `<textarea>` + 业务 CSS `.dsh-tdt-ed-prompt`；
 * 现上提为基础层件（U20 #6，2026-10-05），业务文件只 `import { Textarea }`。
 */
import { createElement as h, type CSSProperties, type ReactNode } from 'react'
import { ensureControlsStyle } from './controls-css'

export interface TextareaProps {
  /** 当前值。 */
  value: string
  /** 变更回调（原生 textarea value）。 */
  onChange: (value: string) => void
  /** 占位。 */
  placeholder?: string
  /** 校验不通过：描红盒。 */
  error?: boolean
  /** 禁用。 */
  disabled?: boolean
  /** 原生 id（用于 label 关联 / 锚点）。 */
  id?: string
  /** 原生 rows（默认不传，靠 CSS min-height 撑开）。 */
  rows?: number
  /** 拼写检查（默认关）。 */
  spellCheck?: boolean
  /** 无障碍名。 */
  'aria-label'?: string
  /** 追加 class。 */
  className?: string
  /** 追加样式（只允许补布局）。 */
  style?: CSSProperties
}

/** 多行文本输入。 */
export function Textarea(props: TextareaProps): ReturnType<typeof h> {
  ensureControlsStyle()
  const { value, onChange, placeholder, error, disabled, id, rows, spellCheck, className, style } = props
  return h('textarea', {
    id,
    rows,
    value,
    placeholder,
    disabled,
    spellCheck: spellCheck === true,
    'aria-label': props['aria-label'],
    className: `dsh-tdt-textarea${error === true ? ' dsh-tdt-textarea--error' : ''}${className !== undefined && className !== '' ? ' ' + className : ''}`,
    style,
    onChange: (event: { target: { value: string } }) => { onChange(event.target.value) },
  } as never)
}
