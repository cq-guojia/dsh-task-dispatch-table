/**
 * 时间范围筛选控件 —— **全站唯一实现**（执行记录 / 日志 / 未来总查询页复用）。
 *
 * 形态（用户 2026-10-02 第四轮）：把「预设档 + 开始框 + 结束框」**包成一件事**，调用方一行渲染。
 * - `precision`：`day`（只到天）/ `minute`（日期 + 时:分，日志定位到分钟用）；
 * - `size`：**必传**高度档（各使用处高度不一定一样，由调用方给）；
 * - 边界归一（半开区间）在 `time-range.ts`，控件本身只产出展示值，不算边界。
 *
 * 颜色 / 尺寸 / 圆角全走 `--tdt-*`；官方件只有 `Menu`（预设下拉）与图标。
 */
import { createElement as h, useState, type ReactElement } from 'react'
import { IconChevronDownOutlineRegular, Menu } from '@deepseek-ai/dsh-client-ui-primitives'
import { Button } from './Button'
import { DateField, TimeField, type CalendarLabels, type TimeLabels } from './DateTime'
import { ALL_TIME_PRESETS, presetRange, type TimePrecision, type TimePresetId, type TimeRangeValue } from './time-range'

/** 各预设档的显示名（由调用方按语言给）。 */
export type TimePresetLabels = Record<TimePresetId, string>

/** 控件文案（由调用方按语言组装）。 */
export interface TimeRangeLabels {
  /** 预设下拉按钮文案。 */
  preset: string
  /** 「从」/「到」标签。 */
  from: string
  to: string
  /** 清除按钮。 */
  clear: string
  /** 各预设档名。 */
  presets: TimePresetLabels
}

export interface TimeRangeProps {
  value: TimeRangeValue
  onChange: (next: TimeRangeValue) => void
  labels: TimeRangeLabels
  calendarLabels: CalendarLabels
  timeLabels: TimeLabels
  /** 粒度（默认 day）。 */
  precision?: TimePrecision
  /** 高度档（默认 md）。 */
  size?: 'sm' | 'md' | 'lg'
  /** 显示哪些预设档（缺省 = 全部）。 */
  presets?: readonly TimePresetId[]
  disabled?: boolean
}

const labelStyle: Record<string, string | number> = {
  display: 'inline-flex', alignItems: 'center', gap: '4px',
  fontSize: 'var(--tdt-font-xs)', color: 'var(--tdt-fg-3)', flex: 'none',
}

/** 预设下拉锚点按钮（与任务列表顶部下拉同款外壳；高度吃 `--tdt-control-h-*`）。 */
function anchorStyle(size: 'sm' | 'md' | 'lg'): Record<string, string | number> {
  return {
    display: 'inline-flex', alignItems: 'center', gap: '6px', boxSizing: 'border-box',
    height: `var(--tdt-control-h-${size})`, padding: '0 10px', borderRadius: 'var(--tdt-radius-sm)',
    border: `1px solid var(--tdt-border)`, background: 'var(--tdt-surface-1)', color: 'var(--tdt-fg)',
    fontFamily: 'inherit', fontSize: 'var(--tdt-font-sm)', cursor: 'pointer',
  }
}

/** 本机今天（`YYYY-MM-DD`）—— 分钟档里只选了时刻、没选日期时补的默认日期。 */
function todayIso(): string {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

export function TimeRange(props: TimeRangeProps): ReactElement {
  const { value, onChange, labels, calendarLabels, timeLabels } = props
  const precision: TimePrecision = props.precision ?? 'day'
  const size = props.size ?? 'md'
  const presets = props.presets ?? ALL_TIME_PRESETS
  const [menuOpen, setMenuOpen] = useState(false)
  const withTime = precision === 'minute'

  const merge = (patch: Partial<TimeRangeValue>): void => { onChange({ ...value, ...patch }) }
  const dateOf = (v: string): string => (withTime ? v.slice(0, 10) : v)
  const timeOf = (v: string): string => (withTime && v.length >= 16 ? v.slice(11, 16) : '')
  /** 日期 + 时刻 → 值串；日期空 ⇒ 值串为空（不产半截值）。 */
  const join = (date: string, time: string): string => {
    if (date === '') return ''
    return withTime ? `${date} ${time === '' ? '00:00' : time}` : date
  }

  const endFields = (which: 'from' | 'to'): ReactElement => {
    const raw = value[which]
    const date = dateOf(raw)
    const time = timeOf(raw)
    return h('label', { style: labelStyle },
      which === 'from' ? labels.from : labels.to,
      h(DateField, {
        value: date,
        onChange: (next: string) => { merge({ [which]: join(next, time) } as Partial<TimeRangeValue>) },
        placeholder: which === 'from' ? labels.from : labels.to,
        ariaLabel: which === 'from' ? labels.from : labels.to,
        labels: calendarLabels, size, disabled: props.disabled,
      }),
      withTime
        ? h(TimeField, {
          value: time,
          onChange: (next: string) => { merge({ [which]: join(date === '' ? todayIso() : date, next) } as Partial<TimeRangeValue>) },
          placeholder: 'HH:mm',
          ariaLabel: which === 'from' ? labels.from : labels.to,
          labels: timeLabels, size, disabled: props.disabled, width: 84,
        })
        : null,
    )
  }

  return h('div', { style: { display: 'inline-flex', alignItems: 'center', gap: '6px', flexWrap: 'wrap' } },
    h(Menu, {
      open: menuOpen,
      align: 'start',
      anchor: h('button', {
        type: 'button',
        style: anchorStyle(size),
        title: labels.preset,
        'aria-label': labels.preset,
        disabled: props.disabled,
        onClick: () => { setMenuOpen(open => !open) },
      }, labels.preset, h(IconChevronDownOutlineRegular, { size: 14 })),
      items: presets.map(id => ({ id, label: labels.presets[id] })),
      onSelect: (id: string) => { onChange(presetRange(id as TimePresetId, precision)); setMenuOpen(false) },
      onClose: () => { setMenuOpen(false) },
    }),
    endFields('from'),
    endFields('to'),
    value.from !== '' || value.to !== ''
      ? h(Button, { variant: 'ghost', size, onClick: () => { onChange({ from: '', to: '' }) } }, labels.clear)
      : null,
  )
}
