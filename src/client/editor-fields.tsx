// 任务表单的控件层（2026-09-29 用户返工轮：「下拉按官方来、日期时间控件别这么丑」）。
//
// P6 收口：`SelectField` / `MarqueeText` 的实现已全部迁到 `src/client/ui/`；
// 日期 / 时刻已全部改接核心 `dsh-plugin-core/ui` 的 `DateTimePicker`（2026-11-06），本仓不再自绘。
// 本文件只保留两样东西：
//   1. `calendarLabelsOf`——日历文案**单源**（决策 55，任务日历页共用）；
//   2. `WeekdayPicker`——周几多选（核心 Segmented multiple + 核心自带 `.dshpc-seg--weekday` 修饰）。
// ⚠️ 2026-10-06：**不再二次再导出 `ui/` 的控件**（design/client-refresh-disposition.md §四 W6）——
// 同一控件曾有两条 import 路径。要 `SelectField` / `MarqueeText` 请走 `./ui`。

import { createElement as h, useMemo } from 'react'
import { pad2 } from './format'
import { interpolateTranslate, type Translate } from './locales'
import type { ReactElement } from 'react'
import { Segmented, type SegmentedItem } from './ui'

/** 日历文案（由调用方按语言组装；`calendarLabelsOf` 在下面给单源实现）。 */
export interface CalendarLabels {
  /** 「今天」按钮。 */
  today: string
  /** 上/下月、上/下年（无障碍名）。 */
  prevMonth: string
  nextMonth: string
  prevYear: string
  nextYear: string
  /** 月份标题（如 2026年09月），由调用方按语言拼。 */
  monthTitle: (year: number, month: number) => string
  /** 周标题，**周一起**共 7 项。 */
  weekdays: readonly string[]
}

// ─────────────────────── 日历文案单源 ───────────────────────

/**
 * 日历文案**单源**（决策 55）：任务日历页共用这一份，
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
 * 唯二差异走核心自带修饰类 `.dshpc-seg--weekday`（用户 2026-10-01 明确要求，复刻原 WeekdayPicker 观感）：
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
      : h('span', { style: { flex: 'none', fontSize: 'var(--dshpc-font-md)', color: 'var(--dshpc-fg)' } }, props.label),
    // 多选；放在间隔卡里 ⇒ variant="inset"；星期多选做成「正方形 + 蓝选中」的特殊化变体
    // （用户 2026-10-01：原 WeekdayPicker 即蓝底方块，改接核心后由 .dshpc-seg--weekday 补回）。
    h(Segmented, {
      multiple: true,
      value: props.value.map(String),
      items,
      size: 'lg',
      bordered: false,
      className: 'dshpc-seg--weekday',
      label: props.label,
      disabled: props.disabled,
      onChange: (next: string[]) => { props.onChange(next.map(Number).sort((a, b) => a - b)) },
    }),
    props.value.length === 0
      ? h('span', { style: { fontSize: 'var(--dshpc-font-sm)', color: 'var(--dshpc-fg-dim)' } }, props.labels.empty)
      : null,
  )
}
