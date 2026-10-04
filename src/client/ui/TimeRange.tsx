/**
 * 时间范围筛选控件 —— **全站唯一实现**（执行记录 / 日志 / 未来总查询页复用）。
 *
 * 形态（用户 2026-10-02 第五轮定稿）：「下拉（全部 / 预设档 / 自定义）+ 开始框 + 结束框」一体。
 * - 下拉**就是当前选择的真值**：选「全部」清空两框；选预设填入区间并停在档名上；
 *   用户手动改框 ⇒ 自动落到「自定义」（该选项此时才出现）。
 * - 下拉走基础层 `SelectField`（与全站下拉同款皮肤——不许自绘锚点）。
 * - `precision`：`day`（只到天）/ `minute`（日期 + 时:分）；`size`：高度档必传。
 * - **起 / 止框定长**（用户 2026-10-02：填进内容就撑开、不停跳——宽度固定，不随值变）。
 * - 边界归一（半开区间）在 `time-range.ts`，控件只产出展示值。
 */
import { createElement as h, Fragment, useMemo, type ReactElement } from 'react'
import { DateField, TimeField, fieldWidthOf, type CalendarLabels, type TimeLabels } from './DateTime'
import { SelectField, type EditorOption } from './Field'
import { ALL_TIME_PRESETS, presetRange, type TimePrecision, type TimePresetId, type TimeRangeValue } from './time-range'

/** 各预设档的显示名（由调用方按语言给）。 */
export type TimePresetLabels = Record<TimePresetId, string>

/** 控件文案（由调用方按语言组装）。 */
export interface TimeRangeLabels {
  /** 「全部」（清空两框的默认档）。 */
  all: string
  /** 「自定义」（用户手动改时间后自动落位）。 */
  custom: string
  /** 两框的**灰色占位**（用户 2026-10-02：不写「时间：」、也不要「到」字，靠占位区分哪端是哪端）。 */
  from: string
  to: string
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

/** 本机今天（`YYYY-MM-DD`）—— 分钟档里只选了时刻、没选日期时补的默认日期。 */
function todayIso(): string {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

/** 当前值命中的档位 id：空 ⇒ all；等于某预设区间 ⇒ 该档；否则 custom。 */
function selectionOf(value: TimeRangeValue, presets: readonly TimePresetId[], precision: TimePrecision): string {
  if (value.from === '' && value.to === '') return 'all'
  for (const id of presets) {
    const range = presetRange(id, precision)
    if (range.from === value.from && range.to === value.to) return id
  }
  return 'custom'
}

export function TimeRange(props: TimeRangeProps): ReactElement {
  const { value, onChange, labels, calendarLabels, timeLabels } = props
  const precision: TimePrecision = props.precision ?? 'day'
  const size = props.size ?? 'md'
  const presets = props.presets ?? ALL_TIME_PRESETS
  const withTime = precision === 'minute'
  const selection = selectionOf(value, presets, precision)

  const options: EditorOption[] = useMemo(() => {
    const list: EditorOption[] = [{ value: 'all', label: labels.all }]
    for (const id of presets) list.push({ value: id, label: labels.presets[id] })
    // 「自定义」只在当前确实是自定义时出现（用户 2026-10-02：手动改时间才多出这一档）。
    if (selection === 'custom') list.push({ value: 'custom', label: labels.custom })
    return list
  }, [labels, presets, selection])

  const merge = (patch: Partial<TimeRangeValue>): void => { onChange({ ...value, ...patch }) }
  const dateOf = (v: string): string => (withTime ? v.slice(0, 10) : v)
  const timeOf = (v: string): string => (withTime && v.length >= 16 ? v.slice(11, 16) : '')
  /**
   * 日期 + 时刻 → 值串；日期空 ⇒ 值串为空（不产半截值）。
   *
   * ⚠️ 时刻为空时按**哪一端**给默认（用户 2026-10-02 揪出）：
   * - 起始 = `00:00`（从这天开头算起，没毛病）；
   * - **结束 = `23:59`** —— 若也默认 `00:00`，选「10-2 作结束」就只查到 10-2 的 00:00 那一刻，
   *   10-2 当天数据**全漏**（用户原话：「我选 10 月 2 号，我的意思是要查 10 月 2 号的数据」）。
   */
  const join = (which: 'from' | 'to', date: string, time: string): string => {
    if (date === '') return ''
    if (time !== '') return withTime ? `${date} ${time}` : date
    return withTime ? `${date} ${which === 'to' ? '23:59' : '00:00'}` : date
  }

  /** 一端 = 日期框（+ 分钟档的时分框）；「时间：」「到」由外层排（用户 2026-10-02 定式）。 */
  const endFields = (which: 'from' | 'to'): ReactElement => {
    const raw = value[which]
    const date = dateOf(raw)
    const time = timeOf(raw)
    const hint = which === 'from' ? labels.from : labels.to
    return h(Fragment, null,
      // 宽度**不写死**：走基础层字段壳的默认（inline-flex ⇒ 刚好包住内容）。
      // （用户 2026-10-04：时间控件别留多余长度，默认就该「刚好把这几个字显示完，不要长也不要短」。）
      h(DateField, {
        value: date,
        onChange: (next: string) => { merge({ [which]: join(which, next, time) } as Partial<TimeRangeValue>) },
        placeholder: hint,
        ariaLabel: hint,
        labels: calendarLabels, size, disabled: props.disabled,
      }),
      // ④ 有小时分钟就**跟在那两个框后面**。
      withTime
        ? h(TimeField, {
          value: time,
          onChange: (next: string) => { merge({ [which]: join(which, date === '' ? todayIso() : date, next) } as Partial<TimeRangeValue>) },
          placeholder: 'HH:mm',
          ariaLabel: hint,
          labels: timeLabels, size, disabled: props.disabled,
        })
        : null,
    )
  }

  // 下拉**定宽**：按「全部 + 全部预设 + 自定义」里最长的一个算 ⇒ 选到「自定义」时也不会变宽
  // （用户 2026-10-05：宽度定死，不要左右跳；预设档文案已统一成两个字）。
  const selectWidth = useMemo(
    () => Math.max(...[labels.all, labels.custom, ...Object.values(labels.presets)].map(text => fieldWidthOf(text, size))) + 11,
    [labels, size],
  )

  // 定式（用户 2026-10-02）：`<起始框> ～ <结束框> <范围>` —— 不写「时间：」，
  // 两端各用**灰色占位**（起始时间 / 截止时间）自证身份，中间用 `～` 连接；「范围」下拉在**最后**。
  return h('div', { style: { display: 'inline-flex', alignItems: 'center', gap: '6px', flexWrap: 'wrap' } },
    endFields('from'),
    // 分隔符用 `～`：比 `-` 更像「区间」、比「到」字省地方，且不占语义。
    h('span', { style: labelStyle, 'aria-hidden': 'true' }, '～'),
    endFields('to'),
    h(SelectField, {
      value: selection,
      options,
      onChange: (next: string) => {
        if (next === 'all') { onChange({ from: '', to: '' }); return }
        if (next === 'custom') return // 自定义态选中自身 = 维持现状（两框已可手改）
        onChange(presetRange(next as TimePresetId, precision))
      },
      placeholder: labels.all,
      emptyLabel: labels.all,
      ariaLabel: labels.all,
      size,
      width: selectWidth,
      disabled: props.disabled,
    }),
  )
}
