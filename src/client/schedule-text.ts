// schedule-text.ts — 排期「结构化 → 人话」的**唯一**实现（2026-09-30 用户拍板）。
//
// **为什么单独一个文件**：此前任务列表（`task-list.tsx` 的 `cronToHuman`，从 cron 字符串反解）
// 与编辑器「预计执行」（`task-editor.tsx` 的 `describeSchedule`，从表单草稿生成）**各写了一份**，
// 同一个排期两处文案不一样（用户真机看到「周一…每 10 分钟执行一次」vs「每天每 10 分钟执行一次」）。
// 现在两处都只走这里，物理上不可能再不一致。
//
// **两步走（照用户要求的结构）**：
//   ① 取结构化：`scheduleSpecFromDraft`（编辑器有表单草稿）/ `scheduleSpecFromSchedule`
//      （列表只有任务定义里的 `schedule`）⇒ 都产出同一个 `ScheduleSpec`；
//   ② 出文字：`scheduleSegments` / `scheduleText` / `renderSchedule` 吃 spec 吐文案，
//      且**支持样式参数**（片段带 `emphasis` 标记，`renderSchedule` 按传入样式包一层）。
//
// 文案一律走 locale（明暗自适应、可翻译），与编辑器原「预计执行」逐字一致（列表从此对齐它）。
import { createElement as h } from 'react'
import { pad2 } from './format'
import type { CSSProperties, ReactNode } from 'react'
import type { LocaleKey } from './locales'

/** 本模块只要一个「按 key 取文案」的席位（client 半侧惯例：无参 t）。 */
type T = (key: LocaleKey) => string

export type ScheduleSpecKind = 'once' | 'periodic' | 'interval' | 'custom'
export type ScheduleFreq = 'daily' | 'weekly' | 'monthly' | 'quarterly' | 'yearly'

/** 结构化排期（两个来源统一收敛到它）。 */
export interface ScheduleSpec {
  kind: ScheduleSpecKind
  /** `periodic` 的粒度（`once` / `interval` / `custom` 时无意义，给 `daily` 兜底）。 */
  freq: ScheduleFreq
  /** 周一 = 1 … 周日 = 7（与表单一致）。 */
  weekdays: number[]
  /** 每周档重复步长（周）：1 = 每周。 */
  weekStep: number
  /** 每月 / 每年第几日。 */
  monthDay: string
  /** 每月档月份口径：`every` / `odd` / `even`。 */
  monthMode: string
  /** 每季度档：季度里的第几个月。 */
  quarterMonth: string
  /** 每年档：第几月。 */
  yearMonth: string
  intervalUnit: 'minute' | 'hour'
  /** 0 = 未填 / 非法。 */
  intervalStep: number
  /** `HH:mm`。 */
  time: string
  /** `YYYY-MM-DD`（单次）。 */
  date: string
  /** `custom` 时原样显示的 cron（不编造，认不出就照抄原值）。 */
  cron: string
}

/** 一段文案：`emphasis` = 关键片段（如「每 10 分钟执行一次」），供调用方加样式。 */
export interface ScheduleSegment {
  text: string
  emphasis?: boolean
}

const WEEKDAY_KEYS: LocaleKey[] = [
  'editorWeekday1', 'editorWeekday2', 'editorWeekday3', 'editorWeekday4',
  'editorWeekday5', 'editorWeekday6', 'editorWeekday7',
]

const fmt = (template: string, vars: Record<string, string>): string =>
  Object.entries(vars).reduce((acc, [key, value]) => acc.replace(`{${key}}`, value), template)

/** 周几串：全选 = 「每天」；未选 = 空串（由调用方补「还没选生效日」）。 */
function weekdayText(t: T, days: readonly number[]): string {
  if (days.length === 0) return ''
  if (days.length >= 7) return t('editorSchedEveryday')
  return [...days].sort((a, b) => a - b).map(day => t(WEEKDAY_KEYS[day - 1])).join('、')
}

// ── ① 结构化：从两个来源取 spec ─────────────────────────────────────────

/** 编辑器表单草稿里本模块用到的字段（结构化声明，避免与 task-editor 循环引用）。 */
export interface DraftScheduleInput {
  scheduleKind: 'periodic' | 'interval'
  periodFreq: 'once' | 'daily' | 'weekly' | 'monthly' | 'quarterly' | 'yearly'
  weekdays: number[]
  weekStep: string
  monthDay: string
  monthMode: string
  quarterMonth: string
  yearMonth: string
  intervalUnit: 'minute' | 'hour'
  intervalStep: string
  time: string
  date: string
}

/** 列表拿到的任务定义 `schedule` 子集（含新建 / 编辑双写的结构化 `ui`）。 */
export interface ScheduleRowInput {
  cron: string | null
  once: string | null
  start: string | null
  everyNWeeks: number | null
  /** 结构化排期（编辑态留档）；老任务没有 ⇒ 退回从 cron 反解。 */
  ui?: Record<string, unknown> | null
}

const EMPTY_SPEC: ScheduleSpec = {
  kind: 'custom', freq: 'daily', weekdays: [], weekStep: 1, monthDay: '1',
  monthMode: 'every', quarterMonth: '1', yearMonth: '1',
  intervalUnit: 'minute', intervalStep: 0, time: '09:00', date: '', cron: '',
}

/** 表单草稿 → spec（编辑器用）。 */
export function scheduleSpecFromDraft(draft: DraftScheduleInput): ScheduleSpec {
  const step = Number.parseInt(draft.intervalStep, 10)
  const wstep = Number.parseInt(draft.weekStep, 10)
  const kind: ScheduleSpecKind = draft.scheduleKind === 'interval'
    ? 'interval'
    : (draft.periodFreq === 'once' ? 'once' : 'periodic')
  return {
    kind,
    freq: draft.periodFreq === 'once' ? 'daily' : draft.periodFreq,
    weekdays: [...draft.weekdays],
    weekStep: Number.isFinite(wstep) && wstep > 0 ? wstep : 1,
    monthDay: draft.monthDay,
    monthMode: draft.monthMode,
    quarterMonth: draft.quarterMonth,
    yearMonth: draft.yearMonth,
    intervalUnit: draft.intervalUnit,
    intervalStep: Number.isFinite(step) && step > 0 ? step : 0,
    time: /^\d{2}:\d{2}$/.test(draft.time) ? draft.time : '09:00',
    date: draft.date,
    cron: '',
  }
}

/** cron 的「分 时」两位 → `HH:mm`（间隔档分钟位是「星号 + 斜杠 + N」，取不到就给默认，反正间隔档不用它）。 */
function timeFromCron(cron: string): string {
  const parts = cron.trim().split(/\s+/)
  if (parts.length !== 5) return '09:00'
  const [minute, hour] = parts
  if (!/^\d+$/.test(minute) || !/^\d+$/.test(hour)) return '09:00'
  return `${pad2(hour)}:${pad2(minute)}`
}

/**
 * cron 星期位 → 表单星期数组（cron 0 = 周日 ⇒ 7）。
 * ⚠️ **只认「纯数字逗号列表」**（如 `1,2,5`）；`1-5` / `MON-FRI` / 步长写法 这类返回 `null`，
 * 由调用方**整体降级 custom**——绝不静默滤空（2026-09-30 专家团复核：此前 `0 9 * * 1-5` 被滤成空数组，
 * 文案反而说「还没选生效日」，与「周一到周五都跑」的事实相反）。
 */
const weekdaysFromDow = (dow: string): number[] | null => {
  if (dow === '' || dow === '*') return []
  if (!/^\d+(,\d+)*$/.test(dow)) return null
  return dow.split(',').map(Number).map(n => (n === 0 ? 7 : n))
}

/**
 * 老任务（没有结构化 `ui`）：从 cron 反解出 spec。认得几个常见形态，认不出走 `custom`（原样显示）。
 *
 * **cron → 结构化的唯一实现**（2026-09-30 抽象收敛）：此前列表文案（这里）与编辑器表单反解
 * （`task-editor.scheduleFromCron`）各写一份、严格度还不一致 ⇒ 同一个 cron 两处说法不一样，
 * 修 bug 还得两边分别修。现在编辑器也只调这里。
 */
export function scheduleSpecFromCron(cron: string, everyNWeeks: number | null): ScheduleSpec {
  const base = { ...EMPTY_SPEC, cron }
  const parts = cron.trim().split(/\s+/)
  if (parts.length !== 5) return base
  const [minute, hour, dom, months, dow] = parts
  const minuteStep = /^\*\/(\d+)$/.exec(minute)
  const hourStep = /^\*\/(\d+)$/.exec(hour)
  const time = timeFromCron(cron)
  const wd = weekdaysFromDow(dow)
  if (wd === null) return base // 星期位认不出（区间 / 名称 / 步长）⇒ 整体 custom，别猜
  // 间隔 / 每天 / 每周：都要求「日 + 月」不限定（2026-09-30 复核：此前忽略月份位 ⇒
  // `0 9 * 6 *`（仅 6 月）被误说成「每天 09:00 执行」）。
  if (dom === '*' && months === '*') {
    // `dow` 为 `*`/空 = cron 未限定星期 = **每天**（不是表单的「没勾选」）⇒ 补成全 7 天，
    // 免得文案把「每天跑」说成「还没选生效日」（2026-09-30 复核）。表单草稿侧的空数组另有语义。
    const everyDay = wd.length === 0 ? [1, 2, 3, 4, 5, 6, 7] : wd
    // 分钟间隔：**必须「小时不限定」**——否则 `* 9 * * *`（9 点内每分钟）/`*/1 9 * * *` 会被
    // 误说成「每分钟执行一次」（2026-09-30 复核复现），实际只在那一个小时里跑。
    if (hour === '*' && (minute === '*' || minuteStep !== null)) {
      return { ...base, kind: 'interval', intervalUnit: 'minute', intervalStep: minuteStep === null ? 1 : Number(minuteStep[1]), time, weekdays: everyDay }
    }
    // 小时间隔：**与执行器 `tasks.intervalSpecOf` 同口径**（分钟位必须是具体数字）——否则
    // `*/5 */2 * * *` 会被说成「每 2 小时」（实际是「偶数小时里每 5 分钟」），`0-30 * * * *`
    // 会被说成「每小时执行一次」（实际每小时 30 次）；且表单再保存会把时刻静默改掉。
    if (hourStep !== null && /^\d+$/.test(minute)) {
      return { ...base, kind: 'interval', intervalUnit: 'hour', intervalStep: Number(hourStep[1]), time, weekdays: everyDay }
    }
    // 每小时的整点（`0 * * * *`）≡「每隔 1 小时」；分钟不是 0 的（如 `30 * * * *`）表单表达不了 ⇒ 降级 custom。
    if (hour === '*' && minute === '0') {
      return { ...base, kind: 'interval', intervalUnit: 'hour', intervalStep: 1, time, weekdays: everyDay }
    }
    // 每天 / 每周：分 + 小时都必须是**具体数字**，否则（如 `* 9 * * *`）表单表达不了 ⇒ 降级 custom。
    if (!/^\d+$/.test(minute) || !/^\d+$/.test(hour)) return base
    if (dow === '*') return { ...base, kind: 'periodic', freq: 'daily', time }
    return { ...base, kind: 'periodic', freq: 'weekly', time, weekdays: wd, weekStep: everyNWeeks !== null && everyNWeeks > 1 ? everyNWeeks : 1 }
  }
  if (dom !== '*' && dow === '*') {
    const monthList = months === '*' ? null : months.split(',').map(Number).filter(Number.isInteger)
    if (monthList !== null && monthList.length === 12) {
      // 全 12 个月 = cron 把「全部月份」写全了 ⇒ 当「每月」。
      return { ...base, kind: 'periodic', freq: 'monthly', time, monthDay: dom, monthMode: 'every' }
    }
    if (monthList !== null && monthList.length === 6 && monthList.every(m => m % 2 === 1)) {
      return { ...base, kind: 'periodic', freq: 'monthly', time, monthDay: dom, monthMode: 'odd' }
    }
    if (monthList !== null && monthList.length === 6 && monthList.every(m => m % 2 === 0)) {
      return { ...base, kind: 'periodic', freq: 'monthly', time, monthDay: dom, monthMode: 'even' }
    }
    if (monthList !== null && monthList.length > 1) {
      // 等间距 3 个月 ⇒ 每季度第 N 个月。
      const sorted = [...monthList].sort((a, b) => a - b)
      const spaced = sorted.every((m, i) => i === 0 || m - sorted[i - 1] === 3)
      if (spaced && sorted.length === 4) {
        return { ...base, kind: 'periodic', freq: 'quarterly', time, monthDay: dom, quarterMonth: String(sorted[0]) }
      }
      return base
    }
    if (monthList !== null && monthList.length === 1) {
      return { ...base, kind: 'periodic', freq: 'yearly', time, monthDay: dom, yearMonth: String(monthList[0]) }
    }
    return { ...base, kind: 'periodic', freq: 'monthly', time, monthDay: dom, monthMode: 'every' }
  }
  return base
}

/** 任务定义 `schedule` → spec（列表用）。优先结构化 `ui`，没有则从 cron 反解。 */
export function scheduleSpecFromSchedule(sched: ScheduleRowInput): ScheduleSpec {
  if (sched.once !== null && sched.once !== '') {
    return {
      ...EMPTY_SPEC,
      kind: 'once',
      date: sched.once.slice(0, 10),
      time: sched.once.length >= 16 ? sched.once.slice(11, 16) : '00:00',
    }
  }
  const cron = sched.cron ?? ''
  const ui = sched.ui ?? null
  if (ui !== null && typeof ui === 'object') {
    const days = Array.isArray(ui.weekdays)
      ? ui.weekdays.filter((d): d is number => typeof d === 'number' && d >= 1 && d <= 7)
      : []
    const kindNum = (v: unknown, fallback: number): number => {
      const n = typeof v === 'string' ? Number.parseInt(v, 10) : (typeof v === 'number' ? v : Number.NaN)
      return Number.isFinite(n) && n > 0 ? n : fallback
    }
    const stepNum = (v: unknown): number => {
      const n = typeof v === 'string' ? Number.parseInt(v, 10) : (typeof v === 'number' ? v : Number.NaN)
      return Number.isFinite(n) && n > 0 ? n : 0
    }
    const str = (v: unknown, fallback: string): string => (typeof v === 'string' && v !== '' ? v : fallback)
    const uiKind = ui.scheduleKind === 'interval' ? 'interval' : 'periodic'
    const uiFreq = ui.periodFreq
    const freq: ScheduleFreq = uiKind === 'interval'
      ? 'daily'
      : (uiFreq === 'daily' || uiFreq === 'weekly' || uiFreq === 'monthly' || uiFreq === 'quarterly' || uiFreq === 'yearly' ? uiFreq : 'daily')
    return {
      kind: uiKind,
      freq,
      weekdays: days,
      weekStep: kindNum(ui.weekStep, sched.everyNWeeks ?? 1),
      monthDay: str(ui.monthDay, '1'),
      monthMode: str(ui.monthMode, 'every'),
      quarterMonth: str(ui.quarterMonth, '1'),
      yearMonth: str(ui.yearMonth, '1'),
      intervalUnit: ui.intervalUnit === 'hour' ? 'hour' : 'minute',
      intervalStep: stepNum(ui.intervalStep),
      time: timeFromCron(cron),
      date: '',
      cron,
    }
  }
  return scheduleSpecFromCron(cron, sched.everyNWeeks)
}

// ── ② 出文字：spec → 文案（可带样式）────────────────────────────────────

/** 时间嵌在句子中间（每天 **09:00** 执行）：拆成「前 / 时间 / 后」三段，时间标 emphasis。 */
const withTime = (spec: ScheduleSpec, head: string, tail: string): ScheduleSegment[] => [
  { text: head },
  { text: spec.time, emphasis: true },
  { text: tail },
]

/**
 * spec → 文案片段（**唯一**的文案生成处）。`emphasis` 标出「关键片段」，
 * 调用方可用 `renderSchedule` 给它们加粗 / 加色 / 加间距（用户 2026-09-30 要求的样式参数）。
 */
export function scheduleSegments(spec: ScheduleSpec, t: T): ScheduleSegment[] {
  // 认不出的 cron 原样显示（真实值，不编造）；连 cron 都没有（畸形定义）只给占位符。
  if (spec.kind === 'custom') return [{ text: spec.cron === '' ? '—' : fmt(t('schedCustom'), { cron: spec.cron }) }]
  if (spec.kind === 'once') return [{ text: `${spec.date} ${spec.time} ${t('editorSchedOnce')}` }]
  if (spec.kind === 'interval') {
    if (spec.intervalStep <= 0) return [{ text: t('editorSchedInvalidStep') }]
    const per = spec.intervalUnit === 'minute'
      ? fmt(t('editorSchedIntervalMin'), { n: String(spec.intervalStep) })
      : (spec.intervalStep === 1 ? t('editorSchedHourlyOnce') : fmt(t('editorSchedIntervalHour'), { n: String(spec.intervalStep) }))
    // 生效日：**全选 7 天（全天候）不写「每天」**——间隔本身就含连续义，写出来是废话（用户 2026-09-30：
    // 「不用去提『每天』，它就是每 10 分钟执行一次」）；只有限定星期（子集，周末确实不跑）时才写星期。
    // 未选星期仍提示「还没选生效日」。
    // 星期位为空 = cron 写的是 `*`（**每天都跑**），不是表单的「还没勾」——别报反话
    // （2026-09-30 复核：空数组曾一律追加「还没选生效日」，与「每天跑」的事实相反）。
    if (spec.weekdays.length === 0 || spec.weekdays.length >= 7) return [{ text: per, emphasis: true }]
    return [{ text: weekdayText(t, spec.weekdays) }, { text: per, emphasis: true }]
  }
  // periodic
  switch (spec.freq) {
    case 'daily':
      return withTime(spec, `${t('editorSchedDaily')} `, ` ${t('editorSchedRun')}`)
    case 'weekly': {
      const wd = weekdayText(t, spec.weekdays)
      const everyN = spec.weekStep > 1
      if (wd === '') {
        const head = `${everyN ? fmt(t('editorSchedEveryNWeek'), { n: String(spec.weekStep) }) : t('editorSchedWeekly')} `
        return [...withTime(spec, head, ` ${t('editorSchedRun')}`), { text: t('editorSchedNoDaySuffix') }]
      }
      // zh：'每周'+'一' ⇒「每周一」；en：'every '+'Mon' ⇒「every Mon」。
      const dayText = everyN
        ? wd
        : [...spec.weekdays].sort((a, b) => a - b)
          .map(d => `${t('editorSchedWeeklyDayPrefix')}${t(WEEKDAY_KEYS[d - 1]).replace(/^周/, '')}`).join('、')
      const head = `${everyN ? fmt(t('editorSchedEveryNWeek'), { n: String(spec.weekStep) }) : ''}${dayText} `
      return withTime(spec, head, ` ${t('editorSchedRun')}`)
    }
    case 'monthly':
      return withTime(spec, `${t(`editorMonthMode_${spec.monthMode}` as LocaleKey)}${spec.monthDay} 日 `, ` ${t('editorSchedRun')}`)
    case 'quarterly':
      return withTime(spec, `${fmt(t('editorSchedQuarterly'), { n: spec.quarterMonth })} ${spec.monthDay} 日 `, ` ${t('editorSchedRun')}`)
    case 'yearly':
      return withTime(spec, `${t('editorMonthMode_every')}${spec.yearMonth} 月 ${spec.monthDay} 日 `, ` ${t('editorSchedRun')}`)
  }
}

/** spec → 纯文本（任务列表跑马灯等只收字符串的地方用）。 */
export function scheduleText(spec: ScheduleSpec, t: T): string {
  return scheduleSegments(spec, t).map(seg => seg.text).join('')
}

/**
 * spec → React 节点：默认等价 `scheduleText`；传了 `emphasisStyle` 则把关键片段包一层。
 * 这就是用户要的「方法支持样式参数」——加粗 / 换色 / 加间距都从这里出，不必各写一份。
 */
export function renderSchedule(
  spec: ScheduleSpec,
  t: T,
  opts?: { emphasisStyle?: CSSProperties },
): ReactNode {
  const segments = scheduleSegments(spec, t)
  if (opts?.emphasisStyle === undefined) return scheduleText(spec, t)
  return segments.map((seg, index) => (seg.emphasis === true
    ? h('strong', { key: index, style: { fontWeight: 600, ...opts.emphasisStyle } }, seg.text)
    : h('span', { key: index }, seg.text)))
}

// ── 草稿 → cron（2026-10-05 从 task-editor.tsx 迁入）──────────────────────
// 放这里与「排期 → 人话」做邻居：一个模块管「草稿/定义的排期怎么表达」，不散在编辑器里。
// 消费方：编辑器保存（draftToDefinitionJson）与查看档「预计下次执行」（喂 schedule-next 纯核）。

/** 每月档的月份口径 → cron 月份位。 */
const MONTH_MODE_CRON: Record<string, string> = {
  every: '*',
  odd: '1,3,5,7,9,11',
  even: '2,4,6,8,10,12',
}

/** ISO 序号（1..7）→ cron 星期位（0..6）。 */
function cronDow(day: number): number {
  return day === 7 ? 0 : day
}

/** `scheduleCron` 只读草稿的这些字段（`TaskEditorDraft` 天然形状兼容，不反向依赖编辑器）。 */
export interface ScheduleCronDraft {
  scheduleKind: 'interval' | 'periodic'
  periodFreq: 'once' | 'daily' | 'weekly' | 'monthly' | 'quarterly' | 'yearly'
  weekdays: number[]
  monthDay: string
  monthMode: string
  quarterMonth: string
  yearMonth: string
  intervalUnit: 'minute' | 'hour'
  intervalStep: string
  time: string
}

/** 草稿 → 排期的 cron 形态；表达不了的组合返回 null（由调用方给出可见提示，不编假值）。 */
export function scheduleCron(draft: ScheduleCronDraft): string | null {
  const match = /^(\d{2}):(\d{2})$/.exec(draft.time)
  const hour = match === null ? 9 : Number(match[1])
  const minute = match === null ? 0 : Number(match[2])
  const days = draft.weekdays.slice().sort((a, b) => a - b).map(cronDow).join(',')

  if (draft.scheduleKind === 'interval') {
    const step = Number.parseInt(draft.intervalStep, 10)
    if (!Number.isFinite(step) || step <= 0) return null
    const dow = days === '' ? '*' : days
    // ⚠️ 必须按 intervalUnit 出**正确形态**（2026-09-30 专家团复核发现的硬伤）：
    //    此前两种单位都出 `*/N * * * *` ⇒ 选「每 2 小时」实际按**每 2 分钟**跑（文案却写「每 2 小时」）。
    //    分钟档 = `*/N * * * <dow>`；小时档 = `0 */N * * <dow>`（分钟固定 0，与「每 N 小时」一致）。
    return draft.intervalUnit === 'hour'
      ? `0 */${step} * * ${dow}`
      : `*/${step} * * * ${dow}`
  }

  switch (draft.periodFreq) {
    case 'once':
      return null // 单次走 `schedule.once`，没有 cron。
    case 'daily':
      return `${minute} ${hour} * * *`
    case 'weekly':
      return days === '' ? null : `${minute} ${hour} * * ${days}`
    case 'monthly':
      // 单数月 / 双数月 = 隔月执行，cron 的月份位写得出（1,3,5… / 2,4,6…）。
      return `${minute} ${hour} ${draft.monthDay} ${MONTH_MODE_CRON[draft.monthMode]} *`
    case 'quarterly': {
      // 「每季度第 N 个月」= N, N+3, N+6, N+9（起月本身就要跑）——
      // 旧写法漏掉起月（选第 1 个月 ⇒ 4,7,10，1 月永不执行，评审 P1#5）。
      const start = Number.isFinite(Number.parseInt(draft.quarterMonth, 10))
        ? Number.parseInt(draft.quarterMonth, 10)
        : 1
      const months = [0, 1, 2, 3].map(offset => start + offset * 3).join(',')
      return `${minute} ${hour} ${draft.monthDay} ${months} *`
    }
    case 'yearly':
      return `${minute} ${hour} ${draft.monthDay} ${draft.yearMonth} *`
  }
}
