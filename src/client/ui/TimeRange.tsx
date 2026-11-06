/**
 * 时间范围筛选 —— **核心 `DateTimePicker` 的薄包装**（2026-11-06 起）。
 *
 * 分工：
 *  - 核心负责：触发器、两块日历、预设档竖列、「确定 / 取消 / 清除」、键盘与明暗；
 *  - 本仓负责：值串 ⇄ 核心 ISO 的换算 + 预设档文案（`presets` 的 expr 由核心展开）。
 *
 * 值形态不变（`TimeRangeValue`：`YYYY-MM-DD` / `YYYY-MM-DD HH:mm`，空串 = 不过滤），
 * 查询边界仍由 `rangeToQuery`（`time-range.ts`）统一算，控件不碰边界。
 */
import { createElement as h } from 'react'
import { DateTimePicker, type DateTimeOutput } from 'dsh-plugin-core/ui'
import { ALL_TIME_PRESETS, type TimePrecision, type TimePresetId, type TimeRangeValue } from './time-range'

/** 各预设档的显示名（由调用方按语言给）。 */
export type TimePresetLabels = Record<TimePresetId, string>

/** 控件文案（由调用方按语言组装）。 */
export interface TimeRangeLabels {
  /** 「全部」（弹层右列第一档，点击清空起止）。 */
  all: string
  /** 各预设档名。 */
  presets: TimePresetLabels
}

export interface TimeRangeProps {
  value: TimeRangeValue
  onChange: (next: TimeRangeValue) => void
  labels: TimeRangeLabels
  /** 粒度（默认 day）。 */
  precision?: TimePrecision
  /** 高度档（默认 md）。 */
  size?: 'sm' | 'md' | 'lg'
  /** 显示哪些预设档（缺省 = 全部）。 */
  presets?: readonly TimePresetId[]
  disabled?: boolean
}

/** 预设档 → 核心的 date-math 算式（整档取齐：`/d` `/w` `/M`；周一为周首，与核心一致）。 */
const PRESET_EXPR: Record<TimePresetId, string> = {
  today: 'now/d',
  yesterday: 'now-1d/d',
  thisWeek: 'now/w',
  lastWeek: 'now-1w/w',
  thisMonth: 'now/M',
  lastMonth: 'now-1M/M',
}

/** 值串 → 核心 ISO（本端 floor 到 00:00:00.000，对端 ceil 到 23:59:59.999）。 */
function toIso(value: string, end: boolean, precision: TimePrecision): string {
  const minute = precision === 'minute'
  const date = value.slice(0, 10)
  // 只有日期、没带时刻时：起点补 00:00、终点补 23:59（否则「选到某天」会漏掉当天后面的数据）。
  const time = minute ? (value.length >= 16 ? value.slice(11, 16) : (end ? '23:59' : '00:00')) : '00:00'
  return minute
    ? `${date}T${time}:${end ? '59.999' : '00.000'}`
    : `${date}T${end ? '23:59:59.999' : '00:00:00.000'}`
}

/** 本仓值 → 核心受控值；任一端为空 ⇒ 交给核心显示「未选」（核心的 range 需要两端齐全才提交）。 */
function toCoreValue(value: TimeRangeValue, precision: TimePrecision): DateTimeOutput {
  if (value.from === '' || value.to === '') return null
  return [toIso(value.from, false, precision), toIso(value.to, true, precision)]
}

/** 核心受控值 → 本仓值：day 取日期，minute 取到分钟（与 `TimeRangeValue` 的口径一致）。 */
function fromCoreValue(out: DateTimeOutput, precision: TimePrecision): TimeRangeValue {
  if (out === null || Array.isArray(out) === false) return { from: '', to: '' }
  const fmt = (iso: string): string => (precision === 'minute' ? `${iso.slice(0, 10)} ${iso.slice(11, 16)}` : iso.slice(0, 10))
  return { from: fmt(out[0]), to: fmt(out[1]) }
}

export function TimeRange(props: TimeRangeProps): ReturnType<typeof h> {
  const precision: TimePrecision = props.precision ?? 'day'
  const presetIds = props.presets ?? ALL_TIME_PRESETS
  const presets = [
    { label: props.labels.all, expr: null },
    ...presetIds.map(id => ({ label: props.labels.presets[id], expr: PRESET_EXPR[id] })),
  ]

  return h(DateTimePicker, {
    mode: 'range',
    precision,
    value: toCoreValue(props.value, precision),
    onChange: (next) => { props.onChange(fromCoreValue(next, precision)) },
    presets,
    size: props.size ?? 'md',
    disabled: props.disabled,
  })
}
