// 任务表单的控件层（2026-09-29 用户返工轮：「下拉按官方来、日期时间控件别这么丑」）。
//
// P6 收口：`SelectField` / `MarqueeText` / `DateField` / `TimeField` 的实现已全部迁到 `src/client/ui/`
// （Field.tsx / MarqueeText.tsx / DateTime.tsx，唯一实现 + 皮肤在 controls-css.ts）。
// 本文件只保留两样东西：
//   1. `calendarLabelsOf`——日历文案**单源**（决策 55，跨页面共用）；
//   2. `WeekdayPicker`——周几多选（Segmented multiple + `.dsh-tdt-seg--weekday` 特殊化变体）。
// 并对既有调用方（task-editor / task-list）**再导出**统一件，保持它们原来的 `from './editor-fields'` 不变。

import { createElement as h, useMemo } from 'react'
import { pad2 } from './format'
import { interpolateTranslate, type Translate } from './locales'
import type { ReactElement } from 'react'
import { Segmented, type CalendarLabels, type SegmentedItem, type TimeLabels } from './ui'

// ─────────────────────── 统一控件再导出（实现都在 ui/） ───────────────────────

export { DateField, TimeField } from './ui'
export { SelectField, type EditorOption, type SelectFieldProps } from './ui'
export { MarqueeText } from './ui'
export type { CalendarLabels, TimeLabels } from './ui'

// ─────────────────────── 日历文案单源 ───────────────────────

/**
 * 日历文案**单源**（决策 55）：`DateField` 的所有调用方（任务编辑器 / 任务卡片三面板）共用这一份，
 * 不再各处各拼月标题与按钮文案——要做日历相关改动只改这里。
 */
export function calendarLabelsOf(t: Translate): CalendarLabels {
  const tt = interpolateTranslate(t)
  return {
    today: t('editorToday'),
    prevMonth: t('editorPrevMonth'),
    nextMonth: t('editorNextMonth'),
    prevYear: t('editorPrevYear'),
    nextYear: t('editorNextYear'),
    // 月补两位（用户 2026-09-30「日期和时间的显示都补成两位」）⇒ zh「2026年09月」/ en「09/2026」。
    monthTitle: (year: number, month: number) => tt('editorMonthTitle', { y: String(year), m: pad2(month) }),
    // 日历表头用单字（一…日 / Mo…Su），日历的通用写法。
    weekdays: t('editorWeekdayShorts').split('|'),
  }
}

/**
 * 时分文案**单源**：`TimeField` 的所有调用方（任务编辑器 / 时间范围控件）共用这一份，
 * 不再各处各拼「小时 / 分钟 / 现在 / 确定」。
 */
export function timeLabelsOf(t: Translate): TimeLabels {
  return {
    hour: t('editorHour'),
    minute: t('editorMinute'),
    now: t('editorNow'),
    confirm: t('editorConfirm'),
  }
}

// ─────────────────────── 周几多选（小方块勾选） ───────────────────────

export interface WeekdayLabels {
  /** 周一起 7 项（完整名，用于 title / 无障碍名）。 */
  weekdays: readonly string[]
  /** 周一起 7 项的**单字**（方块上显示，如 一…日 / Mo…Su）。 */
  shorts: readonly string[]
  /** 一个都不选时的说明（= 每天）。 */
  empty: string
}

/**
 * 周几多选 = 全站统一分段控件 `Segmented`（multiple 模式），不再自绘一套
 * （2026-10-01 P1b：统一基础样式，派生只覆盖轴、不另写结构）。
 * 唯二差异走「特殊化变体」`.dsh-tdt-seg--weekday`（用户 2026-10-01 明确要求，复刻原 WeekdayPicker 观感）：
 *   - 每格正方形（宽 = 段高）；
 *   - 选中态品牌蓝 + 反白字（原自绘即蓝底）。
 * 皮肤集中在 `controls-css.ts`、不内联，调用点只挂一个修饰类。一个都不选 = 每天（间隔档语义）。
 */
export function WeekdayPicker(props: {
  value: number[]
  onChange: (next: number[]) => void
  labels: WeekdayLabels
  /** 段左边的说明（「星期」），没有它就是七个光秃秃的字，用户看不懂（2026-09-29）。 */
  label?: string
  disabled?: boolean
}): ReactElement {
  const items = useMemo<SegmentedItem<string>[]>(
    () => props.labels.shorts.map((short, index) => ({ value: String(index + 1), label: short })),
    [props.labels.shorts],
  )
  return h('div', { style: { display: 'flex', alignItems: 'center', flexWrap: 'wrap', gap: '8px' } },
    props.label === undefined
      ? null
      : h('span', { style: { flex: 'none', fontSize: 'var(--tdt-font-md)', color: 'var(--tdt-fg)' } }, props.label),
    // 多选；放在间隔卡里 ⇒ variant="inset"；星期多选做成「正方形 + 蓝选中」的特殊化变体
    // （用户 2026-10-01：原 WeekdayPicker 即蓝底方块，统一到 Segmented 后由 .dsh-tdt-seg--weekday 补回）。
    h(Segmented, {
      multiple: true,
      value: props.value.map(String),
      items,
      size: 'lg',
      variant: 'inset',
      className: 'dsh-tdt-seg--weekday',
      label: props.label,
      disabled: props.disabled,
      onChange: (next: string[]) => { props.onChange(next.map(Number).sort((a, b) => a - b)) },
    }),
    props.value.length === 0
      ? h('span', { style: { fontSize: 'var(--tdt-font-sm)', color: 'var(--tdt-fg-dim)' } }, props.labels.empty)
      : null,
  )
}
