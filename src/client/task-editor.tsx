// 浏览器侧：新建 / 编辑任务的**右侧贴边弹窗**（用户 2026-09-28 拍板形态：
// 盖在页面上的浮层，不是把页面往左推的分栏——分栏是 U11 预览 dock 的行为）。
//
// 2026-09-29 用户返工轮（本文件形状的全部来由）：
//   ① 「启用」不再单占一行 ⇒ 移到头部右侧、关闭钮左边；选中色按用户要求改绿。
//   ② 次要说明进输入框的 placeholder，不再单独占行。
//   ③ 提示词区按参考图重排：大输入框 + **左下角选工作区 / 右下角选模型**；
//      右侧原来的「来源」文字 chip 行去掉，改成右上角**三项切换（手输 / 选择 / 上传）**
//      ——即原来挂「版本历史」的位置。
//   ④ 执行频率整段重做：照参考图 = 顶部「周期 / 间隔」两档；周期含单次/每天/每周/双周/每月/每年，
//      间隔 = 周几多选 + 每隔 N 单位执行一次。
//   ⑤ 原生 `<select>` / `<input type=datetime-local>` 全部换掉（前者是自绘箭头太贴边，
//      后者是浏览器原生控件、丑）：下拉改用**官方 `Menu`**，日期/时间改用自绘日历与时分列。
//
// P0 边界（分期见 docs/worklog/task-editor-ui.md §九）：只做界面与前端交互。
// **不接保存逻辑**（P2）、**不接工作区/模型数据面**（P1，未接时下拉显示空态，不塞假数据）、
// **不做版本历史**（P3）。

import { createElement as h, useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { CSSProperties, ReactElement, ReactNode } from 'react'
import {
  Button,
  FileTypeIcon,
  IconCloseOutlineRegular,
  IconFolderOpenOutlineRegular,
  IconPlusOutlineRegular,
  IconQuestionOutlineRegular,
  MarkdownText,
  Switch,
  Tooltip,
} from '@deepseek-ai/dsh-client-ui-primitives'
import {
  C,
  DateField,
  SelectField,
  Segmented,
  TimeField,
  WeekdayPicker,
  type CalendarLabels,
  type EditorOption,
  type TimeLabels,
  type WeekdayLabels,
} from './editor-fields'
import { ensureTaskEditorStyle } from './task-editor-css'
import { interpolateTranslate, type LocaleKey } from './locales'
import CodeMirror from '@uiw/react-codemirror'
import { markdown } from '@codemirror/lang-markdown'
import { EditorView } from '@codemirror/view'
import { MD_LABELS } from './md-labels'
import { ALLOWED_ATTACHMENT_EXT, ATTACHMENT_MAX_BYTES, extOf } from '../attachment-allowlist.js'
import { FileBrowser } from './file-browser'
import type { WorkspaceFilesFace } from './file-preview'

/** 与 index.ts 同形的 t 席位（本仓库 client 半侧惯例：无参 t；带占位符的文案走 tTemplate）。 */
type T = (key: LocaleKey) => string

export type { EditorOption }

export type EditorMode = 'create' | 'edit'

/** 提示词来源：手输（我们管版本）/ 选择工作区里的任务手册（只记路径）/ 上传 MD（我们管版本）。 */
export type PromptSource = 'inline' | 'manual' | 'upload'

/** 附加文件（2026-09-29）：链接工作目录已有文件，或上传到插件数据目录。 */
export interface Attachment {
  /** 草稿内唯一 id（用于增删）。 */
  id: string
  /** 展示名（上传原名 / 链接文件名）。 */
  name: string
  /** 'link' = 链接工作区已有文件（只存路径，不复制）；'upload' = 已上传到插件数据目录（UID-序号. ext，不覆盖累加）。 */
  kind: 'link' | 'upload'
  /** link：工作区路径；upload：插件数据目录下的文件名。 */
  ref: string
  /**
   * link：来源工作区 title（选择器现可浏览任意有历史会话的工作区，同一路径在不同工作区
   * 指向不同文件 ⇒ 必须带上来源，P2 派发注入时按它把 ref 绝对化）。upload 无此字段。
   */
  workspace?: string
}

/** 提示词版本（2026-09-29）：每次保存快照，文件系统方案落库（P3 决策）。 */
export interface PromptVersion {
  /** 版本唯一 id。 */
  id: string
  /** ISO 时间戳。 */
  ts: string
  /** 该版本的提示词全文。 */
  content: string
  /** 版本备注（可选）。 */
  note: string
}

/** 排期三档（用户 2026-09-29：参考图是「周期 / 间隔」，周期里含「单次」）。 */
export type ScheduleKind = 'periodic' | 'interval'

/**
 * 周期档内的频率粒度。
 * 「每 N 周」（含双周）不靠 cron 的隔周位——cron 没有该位——而是由每周档的 `weekStep`
 * + 任务定义的 `start` 锚点 + 引擎取模实现（用户 2026-09-29）。隔月仍走「单数月 / 双数月」。
 */
export type PeriodFreq = 'once' | 'daily' | 'weekly' | 'monthly' | 'quarterly' | 'yearly'

/** 每月档的月份口径：每月 / 单数月(1,3,5,7,9,11) / 双数月(2,4,6,8,10,12)——用来表达「隔月执行」。 */
export type MonthMode = 'every' | 'odd' | 'even'

/** 间隔单位（只留 cron 能表达的两种；天/周的映射待 P2 定）。 */
export type IntervalUnit = 'minute' | 'hour'

/** 依赖语义：与宿主 schema 一致（决策 33 后只有这两种）。 */
export type DepSemantics = 'same_period' | 'latest_success'

export interface EditorDependency {
  task: string
  semantics: DepSemantics
}

/**
 * 表单草稿：字段与 taskDefinitionSchema（src/tasks.ts:24-63）一一对应（`id` 不在表单里，
 * 只有高级区的 JSON 逃生口认得它）。排期在草稿里是**结构化**的（档 + 粒度 + 时刻），
 * 落到 cron / once 的映射归 P2 —— 本轮 `draftToDefinitionJson` 只做只读预览。
 */
export interface TaskEditorDraft {
  title: string
  code: string
  enabled: boolean
  prompt: string
  promptSource: PromptSource
  /** 来源 = 选择文件时的路径（工作区内相对路径）。 */
  manualPath: string
  workspace: string
  /** 选中项的 id；`HostLlmModelInfo` 自带 provider ⇒ 一个下拉同时填 provider + model。 */
  model: string
  /** 附加文件（链接 / 上传），见 {@link Attachment}。 */
  attachments: Attachment[]
  /** 提示词版本历史，见 {@link PromptVersion}。 */
  versions: PromptVersion[]
  scheduleKind: ScheduleKind
  periodFreq: PeriodFreq
  /** 周一 = 1 … 周日 = 7（周期-每周/双周 与 间隔 共用）。 */
  weekdays: number[]
  /** 每月 / 每年第几日（1..31）。 */
  monthDay: string
  /** 每月档的月份口径（每月 / 单数月 / 双数月）。 */
  monthMode: MonthMode
  /** 每季度档：季度里的第几个月（1..3）。 */
  quarterMonth: string
  /** 每年档：第几月（1..12）。 */
  yearMonth: string
  intervalUnit: IntervalUnit
  intervalStep: string
  /** 每周档重复步长（周）：1=每周，2=每两周……上限 4（用户 2026-09-29）。 */
  weekStep: string
  /** `YYYY-MM-DD`（单次运行时刻 / 周期锚点「开始时间」）。 */
  date: string
  /** `HH:mm`。 */
  time: string
  window: string
  maxAttempts: string
  validStatuses: string
  deps: EditorDependency[]
}

const WEEKDAY_KEYS: LocaleKey[] = [
  'editorWeekday1', 'editorWeekday2', 'editorWeekday3', 'editorWeekday4',
  'editorWeekday5', 'editorWeekday6', 'editorWeekday7',
]

/** 本地今天（真实时间）。 */
function todayIso(): string {
  const now = new Date()
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`
}

/** 新建任务的初始草稿（与 task-template.jsonc 的推荐默认值同拍）。 */
export function emptyTaskDraft(): TaskEditorDraft {
  return {
    title: '',
    code: '',
    enabled: true,
    prompt: '',
    promptSource: 'inline',
    manualPath: '',
    workspace: '',
    model: '',
    attachments: [],
    versions: [],
    scheduleKind: 'periodic',
    periodFreq: 'daily',
    // 星期默认**一到星期日全选**（用户 2026-09-29）。
    weekdays: [1, 2, 3, 4, 5, 6, 7],
    monthDay: '1',
    monthMode: 'every',
    quarterMonth: '1',
    yearMonth: '1',
    intervalUnit: 'hour',
    intervalStep: '1',
    weekStep: '1',
    date: todayIso(),
    time: '09:00',
    // 没有时区字段：**一律跟随宿主时区**（用户 2026-09-29：没人会去选标准时区，要算自己算）。
    window: 'PT4H',
    maxAttempts: '1',
    validStatuses: 'ok',
    deps: [],
  }
}

// ─────────────────────── 排期 → cron 只读预览（P2 才落真映射） ───────────────────────


/** 每月档的月份口径 → cron 月份位。 */
const MONTH_MODE_CRON: Record<MonthMode, string> = {
  every: '*',
  odd: '1,3,5,7,9,11',
  even: '2,4,6,8,10,12',
}

/** ISO 序号（1..7）→ cron 星期位（0..6）。 */
function cronDow(day: number): number {
  return day === 7 ? 0 : day
}

/** 草稿 → 排期的 cron 形态；表达不了的组合返回 null（由调用方给出可见提示，不编假值）。 */
function scheduleCron(draft: TaskEditorDraft): string | null {
  const match = /^(\d{2}):(\d{2})$/.exec(draft.time)
  const hour = match === null ? 9 : Number(match[1])
  const minute = match === null ? 0 : Number(match[2])
  const days = draft.weekdays.slice().sort((a, b) => a - b).map(cronDow).join(',')

  if (draft.scheduleKind === 'interval') {
    const step = Number.parseInt(draft.intervalStep, 10)
    if (!Number.isFinite(step) || step <= 0) return null
    const dow = days === '' ? '*' : days
    return draft.intervalUnit === 'minute'
      ? `*/${step} * * * *`
      : `0 */${step} * * ${dow}`
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
      const start = Number.parseInt(draft.quarterMonth, 10)
      const months = [1, 2, 3].map(offset => (Number.isFinite(start) ? start : 1) + offset * 3).join(',')
      return `${minute} ${hour} ${draft.monthDay} ${months} *`
    }
    case 'yearly':
      return `${minute} ${hour} ${draft.monthDay} ${draft.yearMonth} *`
  }
}

/** 草稿 → 任务定义 JSON（**只读预览**用；真保存归 P2）。 */
export function draftToDefinitionJson(draft: TaskEditorDraft): string {
  const schedule: Record<string, unknown> = { window: draft.window }
  if (draft.scheduleKind === 'periodic' && draft.periodFreq === 'once') {
    schedule.once = `${draft.date}T${draft.time}`
  } else if (draft.scheduleKind === 'periodic') {
    const cron = scheduleCron(draft)
    if (cron !== null) schedule.cron = cron
    // 「任务开始时间」(date+time) 作为周期锚点：首跑下界 + 每 N 周取模参考（与频率区时刻对齐，避免跨周偏移）。
    schedule.start = `${draft.date}T${draft.time}`
    const step = Number.parseInt(draft.weekStep, 10)
    if (draft.periodFreq === 'weekly' && Number.isFinite(step) && step > 1) schedule.everyNWeeks = step
  } else if (draft.scheduleKind === 'interval') {
    // 间隔档也有「任务开始时间」锚点（日期 + 时刻）；cron 映射归 P2，此处只落锚点。
    schedule.start = `${draft.date}T${draft.time}`
  }
  // scheduleKind === 'interval' 的 cron 映射（每隔 N 分钟/小时）归 P2，此处不产出 schedule.cron。

  const target: Record<string, unknown> = { workspace: draft.workspace }
  if (draft.model.trim() !== '') {
    // 模型下拉的 value 形如 `provider/model`，写回时拆成成对的 provider + model（决策 22）。
    const slash = draft.model.indexOf('/')
    if (slash > 0) {
      target.provider = draft.model.slice(0, slash)
      target.model = draft.model.slice(slash + 1)
    } else target.model = draft.model
  }
  if (draft.promptSource === 'manual') {
    if (draft.manualPath.trim() !== '') target.manual = draft.manualPath.trim()
    target.prompt = draft.prompt.trim() === '' ? '按任务手册执行。' : draft.prompt
  } else target.prompt = draft.prompt

  const definition: Record<string, unknown> = {
    enabled: draft.enabled,
    schedule,
    target,
    contract: { validStatuses: draft.validStatuses.split(',').map(item => item.trim()).filter(item => item !== '') },
    retry: { maxAttempts: Number.parseInt(draft.maxAttempts, 10) > 0 ? Number.parseInt(draft.maxAttempts, 10) : 1 },
  }
  if (draft.title.trim() !== '') definition.title = draft.title.trim()
  if (draft.code.trim() !== '') definition.code = draft.code.trim()
  if (draft.deps.length > 0) definition.depends_on = draft.deps.filter(dep => dep.task !== '')
  if (draft.attachments.length > 0) definition.attachments = draft.attachments
  return JSON.stringify(definition, null, 2)
}

// ─────────────────────── 布局小件 ───────────────────────

/** 单行输入的度量全在 `dsh-tdt-ed-input` 类里（逐条照官方 Input.module.css，含 focus 描边与占位色）。 */
const sectionLabelStyle: CSSProperties = { fontSize: '12px', fontWeight: 600, color: C.text, marginBottom: '6px' }

/**
 * 前置标签输入框：标签不另起一行，直接做成框的左半段（带底 + 分隔线），右半段是输入框。
 * 用户 2026-09-29：「任务名称」别单独占一行，位置紧张。
 */
function PrefixedInput(props: {
  prefix: string
  value: string
  placeholder: string
  onChange: (next: string) => void
}): ReactElement {
  return h('div', { className: 'dsh-tdt-ed-pfx' },
    h('span', { className: 'dsh-tdt-ed-pfx-label' }, props.prefix),
    h('input', {
      className: 'dsh-tdt-ed-pfx-input',
      value: props.value,
      placeholder: props.placeholder,
      'aria-label': props.prefix,
      onChange: (event: { target: { value: string } }) => { props.onChange(event.target.value) },
    }),
  )
}

function Section(props: { label?: string; children?: ReactNode }): ReactElement {
  return h('div', { className: 'dsh-tdt-ed-section' },
    props.label === undefined ? null : h('div', { className: 'dsh-tdt-ed-label', style: { marginBottom: '6px' } }, props.label),
    props.children ?? null,
  )
}

// ─────────────────────── 排期区 ───────────────────────

/** 周期档的子控件：内容行 = 频率 + 月/日 + 时间；星期恒定在下面一行。 */
function PeriodControls(props: {
  draft: TaskEditorDraft
  patch: (part: Partial<TaskEditorDraft>) => void
  freqOptions: EditorOption[]
  t: T
  tt: (key: LocaleKey, params?: Record<string, string | number>) => string
  weekdayLabels: WeekdayLabels
  calendarLabels: CalendarLabels
  timeLabels: TimeLabels
}): ReactElement {
  const { draft, patch, freqOptions, t, tt, weekdayLabels, calendarLabels, timeLabels } = props
  const timeField = h(TimeField, {
    value: draft.time,
    onChange: value => { patch({ time: value }) },
    placeholder: t('editorTimePh'),
    ariaLabel: t('editorTime'),
    labels: timeLabels,
    width: 110,
  })
  const monthOptions: EditorOption[] = useMemo(
    () => Array.from({ length: 12 }, (_, index) => ({ value: String(index + 1), label: tt('editorMonthOption', { m: index + 1 }) })),
    [tt],
  )
  const dayOptions: EditorOption[] = useMemo(
    () => Array.from({ length: 31 }, (_, index) => ({ value: String(index + 1), label: tt('editorDayOption', { d: index + 1 }) })),
    [tt],
  )
  /** 每月档：每月 / 单数月 / 双数月（隔月执行就选单/双数月）。 */
  const monthModeOptions: EditorOption[] = useMemo(() => [
    { value: 'every', label: t('editorMonthEvery') },
    { value: 'odd', label: t('editorMonthOdd') },
    { value: 'even', label: t('editorMonthEven') },
  ], [t])
  /** 每季度档：季度里的第 1 / 2 / 3 个月。 */
  const quarterMonthOptions: EditorOption[] = useMemo(
    () => [1, 2, 3].map(m => ({ value: String(m), label: tt('editorQuarterMonthOption', { m }) })),
    [tt],
  )

  // 单行说完：频率（+ 月 / 日 / 每 N 周）+ 时间，时间直接跟在频率行末尾（用户 2026-09-29）。
  // 单次档没有频率，整行就是「运行时刻 = 日期 + 时间」。
  const above: ReactNode[] = []
  if (draft.periodFreq === 'once') {
    above.push(h(DateField, {
      key: 'once-date',
      value: draft.date,
      onChange: value => { patch({ date: value }) },
      placeholder: t('editorDatePh'),
      ariaLabel: t('editorDate'),
      labels: calendarLabels,
      width: 148,
    }))
  } else {
    above.push(h(SelectField, {
      key: 'freq',
      value: draft.periodFreq,
      options: props.freqOptions,
      onChange: value => { patch({ periodFreq: value as PeriodFreq }) },
      placeholder: t('editorFreqDaily'),
      emptyLabel: t('editorNoOptions'),
      ariaLabel: t('editorFreq'),
    }))
    if (draft.periodFreq === 'monthly') {
      above.push(h(SelectField, {
        key: 'month-mode',
        value: draft.monthMode,
        options: monthModeOptions,
        onChange: value => { patch({ monthMode: value as MonthMode }) },
        placeholder: t('editorMonthEvery'),
        emptyLabel: t('editorNoOptions'),
        ariaLabel: t('editorMonth'),
      }))
    }
    if (draft.periodFreq === 'yearly') {
      above.push(h(SelectField, {
        key: 'month',
        value: draft.yearMonth,
        options: monthOptions,
        onChange: value => { patch({ yearMonth: value }) },
        placeholder: t('editorMonth'),
        emptyLabel: t('editorNoOptions'),
        ariaLabel: t('editorMonth'),
      }))
    }
    if (draft.periodFreq === 'quarterly') {
      above.push(h(SelectField, {
        key: 'quarter-month',
        value: draft.quarterMonth,
        options: quarterMonthOptions,
        onChange: value => { patch({ quarterMonth: value }) },
        placeholder: quarterMonthOptions[0]?.label ?? t('editorMonth'),
        emptyLabel: t('editorNoOptions'),
        ariaLabel: t('editorMonth'),
      }))
    }
    if (draft.periodFreq === 'monthly' || draft.periodFreq === 'quarterly' || draft.periodFreq === 'yearly') {
      above.push(h(SelectField, {
        key: 'day',
        value: draft.monthDay,
        options: dayOptions,
        onChange: value => { patch({ monthDay: value }) },
        placeholder: t('editorDayOfMonth'),
        emptyLabel: t('editorNoOptions'),
        ariaLabel: t('editorDayOfMonth'),
      }))
    }
    // 每周档：每 N 周（1–4）与「每周」同排（用户 2026-09-29）。
    if (draft.periodFreq === 'weekly') {
      above.push(h(SelectField, {
        key: 'week-step',
        value: draft.weekStep,
        options: [1, 2, 3, 4].map(n => ({ value: String(n), label: tt('editorEveryNWeeks', { n }) })),
        onChange: value => { patch({ weekStep: value }) },
        placeholder: tt('editorEveryNWeeks', { n: 1 }),
        emptyLabel: t('editorNoOptions'),
        ariaLabel: tt('editorEveryNWeeks', { n: 1 }),
        width: 120,
      }))
    }
  }
  // 时间（执行时刻）统一跟在频率行末尾；单次档也走这里（运行时刻）。
  above.push(timeField)

  return h('div', { style: { display: 'flex', flexDirection: 'column', gap: '10px' } },
    h('div', { className: 'dsh-tdt-ed-row' }, above),
    draft.periodFreq === 'weekly'
      ? h(WeekdayPicker, {
        value: draft.weekdays,
        onChange: value => { patch({ weekdays: value }) },
        labels: weekdayLabels,
        label: t('editorWeekdayLabel'),
      })
      : null,
    draft.periodFreq === 'once'
      ? h('p', { className: 'dsh-tdt-ed-hint' }, t('editorOnceHint'))
      : null,
  )
}

/** 间隔档的子控件（照参考图：每隔 N 单位执行一次 + 周几筛选）。 */
function IntervalControls(props: {
  draft: TaskEditorDraft
  patch: (part: Partial<TaskEditorDraft>) => void
  t: T
  weekdayLabels: WeekdayLabels
}): ReactElement {
  const { draft, patch, t, weekdayLabels } = props
  const unitOptions: EditorOption[] = [
    { value: 'minute', label: t('unitMinutes') },
    { value: 'hour', label: t('unitHours') },
  ]
  return h('div', { style: { display: 'flex', flexDirection: 'column', gap: '8px' } },
    // 一行说完：每隔 [1] [小时] 执行一次（照参考图的写法，不再拆成标签列）。
    h('div', { className: 'dsh-tdt-ed-row' },
      h('span', { style: { fontSize: '13px', color: C.text } }, t('editorIntervalEvery')),
      h('input', {
        type: 'number',
        min: 1,
        value: draft.intervalStep,
        onChange: (event: { target: { value: string } }) => { patch({ intervalStep: event.target.value }) },
        'aria-label': t('editorIntervalStep'),
        className: 'dsh-tdt-ed-input',
        style: { width: '68px', textAlign: 'center' },
      }),
      h(SelectField, {
        value: draft.intervalUnit,
        options: unitOptions,
        onChange: value => { patch({ intervalUnit: value as IntervalUnit }) },
        placeholder: t('unitHours'),
        emptyLabel: t('editorNoOptions'),
        ariaLabel: t('editorIntervalUnit'),
        width: 96,
      }),
      h('span', { style: { fontSize: '13px', color: C.text } }, t('editorIntervalSuffix')),
    ),
    h(WeekdayPicker, {
      value: draft.weekdays,
      onChange: value => { patch({ weekdays: value }) },
      labels: weekdayLabels,
      label: t('editorWeekdayLabel'),
    }),
  )
}

// ─────────────────────── 弹窗本体 ───────────────────────

/** 宽度持久化（纯本地偏好；隐私模式也不崩）。 */
const WIDTH_KEY = 'dsh-tdt-editor-width'
const WIDTH_DEFAULT = 560
const WIDTH_MIN = 560

function clampWidth(value: number): number {
  const max = Math.max(WIDTH_MIN, Math.floor(window.innerWidth * 0.9))
  return Math.min(Math.max(Math.round(value), WIDTH_MIN), max)
}

function readWidth(): number {
  try {
    const raw = window.localStorage.getItem(WIDTH_KEY)
    const value = raw === null ? Number.NaN : Number(raw)
    return Number.isFinite(value) ? clampWidth(value) : WIDTH_DEFAULT
  } catch {
    return WIDTH_DEFAULT
  }
}

function formatVersionTime(iso: string): string {
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return iso
  const pad = (n: number): string => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`
}

/**
 * 键序稳定的 JSON 序列化（脏判定专用）：草稿永远是 `{...draft, ...part}` 摊开出来的，
 * 键序本来就不会变，但这里仍按键名排序，保证「值相同 ⇒ 串相同」与历史无关——
 * 「1 改成 2 再改回 1」比较结果与最初一致，不算改过（用户 2026-09-29 的判定口径）。
 */
function stableStringify(value: unknown): string {
  if (value === null || typeof value !== 'object') return JSON.stringify(value) ?? 'undefined'
  if (Array.isArray(value)) return `[${value.map(item => stableStringify(item)).join(',')}]`
  const record = value as Record<string, unknown>
  return `{${Object.keys(record).sort().map(key => `${JSON.stringify(key)}:${stableStringify(record[key])}`).join(',')}}`
}

/**
 * 全屏提示词编辑器：编辑态用 CodeMirror 6（@uiw/react-codemirror + @codemirror/lang-markdown）
 * 提供语法高亮 + 行号；预览态复用官方 MarkdownText（GFM + KaTeX，主题与宿主一致）。
 * 右侧版本历史（保存 / 回滚）保留；编辑 / 预览切换在顶部（复用任务编辑器 tab 样式）。
 */
// CodeMirror 主题：背景 / 文字 / 行号全部走宿主 --dsw-alias-* token，明暗自适应；
// 编辑器本身只负责「带语法高亮的纯文本」（gzip ~60KB，且仅在全屏编辑时才加载）。
const promptEditorTheme = EditorView.theme({
  '&': { backgroundColor: 'var(--dsw-alias-bg-base, #22252a)', color: C.text, height: '100%', width: '100%' },
  '.cm-editor': { height: '100%', width: '100%', backgroundColor: 'var(--dsw-alias-bg-base, #22252a)' },
  // 软折行：长行自动换行，不出现横向滚动条（编辑器随列宽收缩也跟着重折）。
  '.cm-scroller': { fontFamily: 'ui-monospace, SFMono-Regular, Menlo, Consolas, monospace', fontSize: '13px', lineHeight: '1.6', overflowX: 'hidden' },
  '.cm-content': { width: '100%' },
  '.cm-line': { padding: '0 4px' },
  '.cm-gutters': { backgroundColor: 'var(--dsw-alias-bg-layer-1, rgba(128,128,128,0.08))', color: C.textDim, border: 'none' },
  '.cm-activeLine': { backgroundColor: 'var(--dsw-alias-interactive-bg-hover, rgba(128,128,128,0.16))' },
  '.cm-activeLineGutter': { backgroundColor: 'transparent', color: C.text },
  '&.cm-focused': { outline: 'none' },
}, { dark: true })

/** 关闭「新建任务」拉栏前的确认。
 *  故意不用官方 Modal：其 className 只落到卡片 .dialog，无法抬升整层 .root(z1000)，
 *  会被拉栏遮罩(z1040)压住、点不了。这里渲染在拉栏遮罩内（overlay 子层），
 *  绝对定位盖住整个抽屉，天然在表单/编辑器之上，也随抽屉一起浮在宿主之上。 */
function ConfirmDiscard(props: {
  t: T
  onStay: () => void
  onLeave: () => void
}): ReactNode {
  return h('div', {
    role: 'alertdialog',
    'aria-modal': true,
    'aria-label': props.t('editorDiscardTitle'),
    style: { position: 'absolute', inset: 0, zIndex: 10, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '24px', background: 'var(--dsw-alias-bg-mask-1, rgba(0,0,0,0.45))' },
    onClick: props.onStay,
  },
    h('div', {
      style: { width: 'min(380px, 100%)', boxSizing: 'border-box', background: 'var(--dsw-alias-bg-layer-2, #2a2e33)', borderRadius: 'var(--dsw-radius-panel, 10px)', boxShadow: 'var(--dsw-elevation-prominent, 0 12px 40px rgba(0,0,0,0.4))', padding: '22px 24px', color: C.text },
      onClick: (event: { stopPropagation(): void }) => { event.stopPropagation() },
    },
      h('div', { style: { fontSize: '16px', fontWeight: 500, marginBottom: '8px' } }, props.t('editorDiscardTitle')),
      h('div', { style: { fontSize: '14px', lineHeight: '22px', color: C.textDim, marginBottom: '20px' } }, props.t('editorDiscardDesc')),
      h('div', { style: { display: 'flex', justifyContent: 'flex-end', gap: '8px' } },
        h(Button, { variant: 'outline', size: 'sm', onClick: props.onStay }, props.t('editorDiscardStay')),
        h(Button, { variant: 'primary', size: 'sm', onClick: props.onLeave }, props.t('editorDiscardLeave')),
      ),
    ),
  )
}

/** DEMO 模拟版本（仅样式预览用）：真实接入后由 props.versions 驱动，此常量删除。 */
const DEMO_VERSIONS: PromptVersion[] = [
  { id: 'demo-1', ts: '2026-09-28T14:30:00.000Z', content: '# 周一版本\n这里是周一 下午 初版的提示词正文……', note: '周一 下午 · 初版' },
  { id: 'demo-2', ts: '2026-09-29T09:12:00.000Z', content: '# 周二版本\n调整了调度说明与依赖。', note: '周二 上午 · 调整' },
  { id: 'demo-3', ts: '2026-09-30T11:48:00.000Z', content: '# 周三版本\n补充了产出物登记说明。', note: '周三 上午 · 补充' },
  { id: 'demo-4', ts: '2026-10-01T16:24:00.000Z', content: '# 周四版本\n最终定稿，措辞收紧。', note: '周四 下午 · 定稿' },
]

/** 版本管理内的小型确认框（复用关闭确认的自绘样式：盖在编辑器之上、随抽屉浮在宿主之上）。 */
function VersionConfirm(props: {
  t: T
  title: string
  desc: string
  confirmLabel?: string
  onCancel: () => void
  onConfirm: () => void
}): ReactNode {
  return h('div', {
    role: 'alertdialog',
    'aria-modal': true,
    style: { position: 'absolute', inset: 0, zIndex: 20, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '24px', background: 'var(--dsw-alias-bg-mask-1, rgba(0,0,0,0.45))' },
    onClick: props.onCancel,
  },
    h('div', {
      style: { width: 'min(380px, 100%)', boxSizing: 'border-box', background: 'var(--dsw-alias-bg-layer-2, #2a2e33)', borderRadius: 'var(--dsw-radius-panel, 10px)', boxShadow: 'var(--dsh-elevation-prominent, 0 12px 40px rgba(0,0,0,0.4))', padding: '22px 24px', color: C.text },
      onClick: (event: { stopPropagation(): void }) => { event.stopPropagation() },
    },
      h('div', { style: { fontSize: '16px', fontWeight: 500, marginBottom: '8px' } }, props.title),
      h('div', { style: { fontSize: '14px', lineHeight: '22px', color: C.textDim, marginBottom: '20px' } }, props.desc),
      h('div', { style: { display: 'flex', justifyContent: 'flex-end', gap: '8px' } },
        h(Button, { variant: 'outline', size: 'sm', onClick: props.onCancel }, props.t('editorCancel')),
        h(Button, { variant: 'primary', size: 'sm', onClick: props.onConfirm }, props.confirmLabel ?? props.t('editorConfirm')),
      ),
    ),
  )
}

function PromptEditorModal(props: {
  t: T
  /** 抽屉模式：'create' = 新建（标签叫「历史版本」且暂无可查版本）；'edit' = 编辑（标签「版本历史」）。 */
  mode: EditorMode
  value: string
  versions: PromptVersion[]
  onChange: (value: string) => void
  onClose: () => void
}): ReactNode {
  const { t, mode: editorMode, value, versions, onChange, onClose } = props
  // 编辑器扩展固定引用：markdown 高亮 + 软折行（长行自动换行，宽度失控/横向滚动的根源在此）。
  const cmExtensions = useMemo(() => [markdown(), EditorView.lineWrapping], [])
  const [mode, setMode] = useState<'edit' | 'preview'>('edit')
  const [showVersions, setShowVersions] = useState(false)
  // 本地版本表（DEMO：真实版本为空且处于编辑态时，塞 4 个模拟版本用于看样式；真实接入后由 props.versions 驱动）。
  const [localVersions, setLocalVersions] = useState<PromptVersion[]>(() =>
    versions.length > 0 ? versions : (editorMode === 'edit' ? DEMO_VERSIONS : []),
  )
  const [hoveredId, setHoveredId] = useState<string | null>(null)
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null)
  const [confirmUseId, setConfirmUseId] = useState<string | null>(null)

  const versionTitle = editorMode === 'create' ? t('editorHistoryVersions') : t('editorVersions')
  const confirmDelete = localVersions.find(v => v.id === confirmDeleteId) ?? null
  const confirmUse = localVersions.find(v => v.id === confirmUseId) ?? null

  return h('div', {
    style: { display: 'flex', flexDirection: 'column', flex: '1 1 auto', minHeight: 0, background: 'var(--dsw-alias-bg-base, #22252a)', color: C.text, overflow: 'hidden', position: 'relative' },
  },
    h('div', { style: { display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '12px', padding: '10px 14px', borderBottom: `1px solid ${C.borderL2}` } },
      h('span', { style: { fontSize: '14px', fontWeight: 600 } }, t('editorPromptEditorTitle')),
      h('div', { style: { display: 'flex', alignItems: 'center', gap: '8px' } },
        h(Segmented, {
          id: 'dsh-tdt-ed-prompt-mode',
          value: mode,
          options: [
            { value: 'edit', label: t('editorModeEdit') },
            { value: 'preview', label: t('editorModePreview') },
          ],
          onChange: (next: string) => { setMode(next as 'edit' | 'preview') },
          label: t('editorPromptEditorTitle'),
          className: 'dsh-tdt-ed-seg',
        }),
        h(Button, { variant: 'outline', size: 'sm', onClick: () => { setShowVersions(v => !v) } }, versionTitle),
        h(Button, { variant: 'ghost', size: 'sm', onClick: onClose }, t('editorClose')),
      ),
    ),
    // minWidth:0 ⇒ 编辑态长内容时编辑器自行横向滚动，固定 280px 的版本面板不再被挤掉。
    h('div', { style: { flex: '1 1 auto', display: 'flex', minHeight: 0, minWidth: 0 } },
      mode === 'edit'
        ? h('div', { style: { flex: '1 1 auto', display: 'flex', minHeight: 0, minWidth: 0 } },
            h(CodeMirror, {
              value,
              onChange: (next: string) => { onChange(next) },
              extensions: cmExtensions,
              theme: promptEditorTheme,
              height: '100%',
              basicSetup: { lineNumbers: true, foldGutter: false, highlightActiveLine: true, autocompletion: false, searchKeymap: false },
              // 每次切回编辑（CodeMirror 重新挂载）即聚焦，免去手动点一下。
              onCreateEditor: (view: EditorView) => { view.focus() },
            } as never),
          )
        : h('div', { style: { flex: '1 1 auto', minWidth: 0, overflow: 'auto', padding: '14px 18px' } },
            h(MarkdownText, { text: value, labels: MD_LABELS }),
          ),
      showVersions
        ? h('div', { style: { flex: '0 0 280px', borderLeft: `1px solid ${C.borderL4}`, display: 'flex', flexDirection: 'column', minHeight: 0 } },
            h('div', { style: { padding: '10px 12px', borderBottom: `1px solid ${C.borderL4}`, fontSize: '13px', fontWeight: 600 } }, versionTitle),
            editorMode === 'create'
              ? h('div', { style: { padding: '16px 12px', fontSize: '12px', color: C.textDim, lineHeight: '1.6' } }, t('editorNewTaskNoVersions'))
              : localVersions.length === 0
                ? h('p', { style: { padding: '0 12px', fontSize: '12px', color: C.textDim } }, t('editorNoVersions'))
                : h('ul', { style: { listStyle: 'none', margin: 0, padding: '0 12px 12px', overflow: 'auto' } },
                    localVersions.map(v => h('li', {
                      key: v.id,
                      style: { padding: '10px 0', borderBottom: `1px solid ${C.borderL4}`, position: 'relative' },
                      onMouseEnter: () => { setHoveredId(v.id) },
                      onMouseLeave: () => { setHoveredId(cur => (cur === v.id ? null : cur)) },
                    },
                      h('div', { style: { fontSize: '11px', color: C.textDim } }, formatVersionTime(v.ts)),
                      v.note ? h('div', { style: { fontSize: '12px', margin: '2px 0 0' } }, v.note) : null,
                      hoveredId === v.id
                        ? h('div', { style: { display: 'flex', gap: '6px', marginTop: '8px' } },
                            h(Button, { variant: 'outline', size: 'sm', onClick: () => { setConfirmUseId(v.id) } }, t('editorUseVersion')),
                            h(Button, { variant: 'ghost', size: 'sm', onClick: () => { setConfirmDeleteId(v.id) } }, t('editorDeleteVersion')),
                          )
                        : null,
                    )),
                  ),
          )
        : null,
    ),
    confirmDelete !== null
      ? h(VersionConfirm, {
        t,
        title: t('editorConfirmDeleteTitle'),
        desc: t('editorConfirmDeleteDesc'),
        onCancel: () => { setConfirmDeleteId(null) },
        onConfirm: () => { setLocalVersions(list => list.filter(x => x.id !== confirmDelete!.id)); setConfirmDeleteId(null) },
      })
      : null,
    confirmUse !== null
      ? h(VersionConfirm, {
        t,
        title: t('editorConfirmUseTitle'),
        desc: t('editorConfirmUseDesc'),
        confirmLabel: t('editorUseVersion'),
        onCancel: () => { setConfirmUseId(null) },
        onConfirm: () => { onChange(confirmUse!.content); setConfirmUseId(null) },
      })
      : null,
  )
}

/**
 * 新建 / 编辑任务弹窗：右侧贴边、上下顶满、左缘可拖拽、**浮层盖在整页之上**（不推压页面）。
 */
export function TaskEditorDrawer(props: {
  t: T
  mode: EditorMode
  draft: TaskEditorDraft
  onChange: (next: TaskEditorDraft) => void
  /** 工作区列表（P1 接真数据；空 ⇒ 下拉显示空态）。 */
  workspaces: EditorOption[]
  /** 模型列表（P1 接真数据；空 ⇒ 下拉显示空态）。 */
  models: EditorOption[]
  /** 可选的前置任务（= 现有任务表，真数据）。 */
  tasks: EditorOption[]
  onClose: () => void
  /** 保存回调；**P0 不传** ⇒ 点「保存」只提示待接，不做任何写入。 */
  onSave?: ((draft: TaskEditorDraft) => void) | undefined
  /** 工作区文件服务（选择工作区文件用；未就位为 null ⇒ 选择器不可用）。 */
  workspaceFiles?: WorkspaceFilesFace | null
  /**
   * 工作区 title → 锚点会话 id（GET /options 下发：该工作区最近一个会话，官方 entity.sessionIds 末位）。
   * remote.workspaceFiles 的 list 以 sessionId 解析工作区根（0.2.0-rc.1 仍如此，源码已核实）⇒
   * 浏览某工作区必须有属于它的会话当锚点；没有锚点的工作区官方无浏览入口（不造假会话）。
   */
  workspaceAnchors?: Record<string, string>
}): ReactElement {
  const { t, mode, draft, onChange, workspaces, models, tasks, onClose, onSave, workspaceFiles, workspaceAnchors } = props
  const [width, setWidth] = useState<number>(readWidth)
  const [tab, setTab] = useState<'basic' | 'records'>('basic')
  const [advancedOpen, setAdvancedOpen] = useState(false)
  const [jsonOpen, setJsonOpen] = useState(false)
  const [editorOpen, setEditorOpen] = useState(false)
  const [pendingHint, setPendingHint] = useState(false)
  // 附加文件：选择器 / 上传交互状态（2026-09-29 本轮新增）。
  const [pickerOpen, setPickerOpen] = useState(false)
  const [uploading, setUploading] = useState(false)
  // 选择器可浏览任意有历史会话的工作区（用户 2026-09-29 放开「必须先选任务工作区」）：
  // pickerWs = 当前浏览的工作区 title，打开时默认任务已选工作区（没有就取第一个有锚点的）。
  const [pickerWs, setPickerWs] = useState('')
  // 上传失败的机器码（file-type-not-allowed / payload-too-large / …），渲染时映射成具体文案。
  const [uploadError, setUploadError] = useState<string | null>(null)
  // 脏判定 + 关闭确认（用户 2026-09-29：点 ✕ / 点遮罩空白 / Esc / 取消，只要改过就先确认再关）。
  const [confirmDiscard, setConfirmDiscard] = useState(false)
  // 原始快照：挂载那一刻定死。弹窗关闭即卸载、重开即重挂 ⇒ 每次打开都从当次初始值算起；
  // 「改成 2 又改回 1」序列化结果与快照一致 ⇒ 不算改过。
  const initialDraftRef = useRef(draft)
  const dirty = stableStringify(draft) !== stableStringify(initialDraftRef.current)

  useEffect(() => { ensureTaskEditorStyle() }, [])

  const patch = useCallback((part: Partial<TaskEditorDraft>): void => {
    onChange({ ...draft, ...part })
  }, [draft, onChange])

  /** 统一关闭入口：改过 ⇒ 先弹官方 Modal 确认；没改过 ⇒ 直接关。 */
  const requestClose = useCallback((): void => {
    if (dirty) setConfirmDiscard(true)
    else onClose()
  }, [dirty, onClose])

  // 带 `{name}` 占位符的文案（复用 locales 的替换器；本页 t 席位是无参形态）。
  const tt = useMemo(() => interpolateTranslate(t), [t])

  // Esc 关闭；浮层（下拉 / 日历 / 时分）自己先处理并 preventDefault ⇒ 此处不再关弹窗。
  // 确认弹窗开着时 Esc 关掉确认框（留在编辑）；否则 Esc 走统一关闭入口。
  useEffect(() => {
    const onKey = (event: KeyboardEvent): void => {
      if (confirmDiscard) { setConfirmDiscard(false); return }
      if (event.key === 'Escape' && !event.defaultPrevented) requestClose()
    }
    window.addEventListener('keydown', onKey)
    return () => { window.removeEventListener('keydown', onKey) }
  }, [requestClose, confirmDiscard])

  /** 左缘拖拽调宽：拖动期间只改本地 state，松手落 localStorage。 */
  const startResize = useCallback((start: { clientX: number }): void => {
    const startX = start.clientX
    const startWidth = width
    const onMove = (event: PointerEvent): void => { setWidth(clampWidth(startWidth + (startX - event.clientX))) }
    const onUp = (event: PointerEvent): void => {
      window.removeEventListener('pointermove', onMove)
      window.removeEventListener('pointerup', onUp)
      const next = clampWidth(startWidth + (startX - event.clientX))
      setWidth(next)
      try { window.localStorage.setItem(WIDTH_KEY, String(next)) } catch { /* 隐私模式忽略 */ }
    }
    window.addEventListener('pointermove', onMove)
    window.addEventListener('pointerup', onUp)
  }, [width])

  /** 周几的**单字**标签（方块上显示；`editorWeekdayShorts` 里以 `|` 分隔，两种语言各自给全）。 */
  const weekdayShorts = useMemo(() => t('editorWeekdayShorts').split('|'), [t])

  const weekdayLabels: WeekdayLabels = useMemo(() => ({
    weekdays: WEEKDAY_KEYS.map(key => t(key)),
    shorts: weekdayShorts,
    empty: t('editorWeekdayEmpty'),
  }), [t, weekdayShorts])

  const calendarLabels: CalendarLabels = useMemo(() => ({
    today: t('editorToday'),
    prevMonth: t('editorPrevMonth'),
    nextMonth: t('editorNextMonth'),
    prevYear: t('editorPrevYear'),
    nextYear: t('editorNextYear'),
    monthTitle: (year: number, month: number) => tt('editorMonthTitle', { y: year, m: month }),
    // 日历表头就用单字（一…日 / Mo…Su），日历的通用写法。
    weekdays: weekdayShorts,
  }), [t, tt, weekdayShorts])

  const timeLabels: TimeLabels = useMemo(() => ({
    hour: t('editorHour'),
    minute: t('editorMinute'),
    now: t('editorNow'),
    confirm: t('editorConfirm'),
  }), [t])

  // 提示词一律手输（2026-09-29 决定）：来源三档选择器已废除，「选文件 / 上传」挪到下方独立的「附加文件」框。
  // 「单次」已经提上去当独立的档了 ⇒ 周期下拉里只有重复的那几个（用户 2026-09-29）。
  // 「双周」语义不明（哪几周、从哪周开始）且 cron 无隔周位 ⇒ 不做；隔月走「单数月 / 双数月」。
  const freqOptions: EditorOption[] = [
    { value: 'daily', label: t('editorFreqDaily') },
    { value: 'weekly', label: t('editorFreqWeekly') },
    { value: 'monthly', label: t('editorFreqMonthly') },
    { value: 'quarterly', label: t('editorFreqQuarterly') },
    { value: 'yearly', label: t('editorFreqYearly') },
  ]

  // 允许延迟（原「有效期」）：说人话（`PT4H` 没人看得懂 ⇒ 显示「4 小时」）。
  const windowOptions: EditorOption[] = [
    { value: 'PT30M', label: `30 ${t('unitMinutes')}` },
    { value: 'PT1H', label: `1 ${t('unitHours')}` },
    { value: 'PT2H', label: `2 ${t('unitHours')}` },
    { value: 'PT4H', label: `4 ${t('unitHours')}` },
    { value: 'PT8H', label: `8 ${t('unitHours')}` },
    { value: 'P1D', label: `1 ${t('unitDays')}` },
  ]

  /**
   * 顶部三档的当前值：**推导**出来的，不是另存一份状态——
   * 「单次」只是「周期档的频率 = 单次」，所以周期档里把频率改成别的，顶部自动回到「周期」。
   */
  const scheduleTab: 'once' | 'periodic' | 'interval' = draft.scheduleKind === 'interval'
    ? 'interval'
    : (draft.periodFreq === 'once' ? 'once' : 'periodic')

  // 任务开始时间（锚点）：周期（非单次）/ 间隔都有；单次没有（单次整行就是运行时刻）。
  const showTaskStart = draft.scheduleKind === 'interval' || (draft.scheduleKind === 'periodic' && draft.periodFreq !== 'once')

  // ① 提示词卡（主视觉）：提示词一律手输（版本管理由插件负责，P 待做）；
  // 选文件 / 上传不再属于提示词，挪到下方独立的「附加文件」框（决策：提示词只手输）。
  const promptCard = h('div', { className: 'dsh-tdt-ed-card' },
    h('div', { className: 'dsh-tdt-ed-card-head' },
      h('div', { className: 'dsh-tdt-ed-label' }, t('editorPrompt')),
      h(Button, { variant: 'ghost', size: 'sm', title: t('editorOpenEditor'), 'aria-label': t('editorOpenEditor'), onClick: () => { setEditorOpen(true) } }, t('editorOpenEditor')),
    ),
    h('textarea', {
      id: 'dsh-tdt-ed-source-inline-panel',
      className: 'dsh-tdt-ed-prompt',
      value: draft.prompt,
      placeholder: t('editorPromptPh'),
      spellCheck: false,
      onChange: (event: { target: { value: string } }) => { patch({ prompt: event.target.value }) },
    }),
    // 底部一行：左 = 工作区（真实工作区列表，P1 接），右 = 模型（不填 = 跟随宿主默认）。
    h('div', { className: 'dsh-tdt-ed-card-foot' },
      h(SelectField, {
        value: draft.workspace,
        options: workspaces,
        onChange: value => { patch({ workspace: value }) },
        placeholder: t('editorWorkspacePh'),
        emptyLabel: t('editorNoOptions'),
        ariaLabel: t('editorWorkspace'),
        icon: h(IconFolderOpenOutlineRegular, { size: 16 }),
      }),
      h('span', { className: 'dsh-tdt-ed-spacer' }),
      h(SelectField, {
        value: draft.model,
        options: models,
        onChange: value => { patch({ model: value }) },
        placeholder: t('editorModelPh'),
        emptyLabel: t('editorNoOptions'),
        ariaLabel: t('editorModel'),
        align: 'end',
      }),
    ),
  )

  // ①-附加：附加文件卡（展示 + 删除 + 选择/上传入口；选择=链接工作区文件，上传=拖拽/本地文件落盘）。
  const fileInputRef = useRef<HTMLInputElement>(null)
  const addAttachment = (att: Attachment): void => {
    patch({ attachments: [...draft.attachments, att] })
  }
  const makeId = (): string => (typeof crypto !== 'undefined' && crypto.randomUUID !== undefined ? crypto.randomUUID() : Math.random().toString(36).slice(2))
  // 上传失败机器码 → 具体文案（用户 2026-09-29：报错要按具体情况说人话，不透出机器码）。
  const uploadErrText = (code: string): string => {
    if (code === 'file-type-not-allowed') return t('editorUploadErrType')
    if (code === 'payload-too-large' || code === 'body-too-large') return t('editorUploadErrSize')
    if (code === 'empty-file') return t('editorUploadErrEmpty')
    return t('editorUploadErrGeneric')
  }
  const uploadFiles = async (files: FileList | File[]): Promise<void> => {
    const list = Array.from(files)
    if (list.length === 0 || uploading) return
    setUploadError(null)
    // 发包前当场预检（与宿主共用同一份约束，src/attachment-allowlist.ts）：
    // 尺寸超限 / 扩展名不在白名单都直接拒，不白传（用户 2026-09-29：不该转半天才报错）。
    // 不合规的跳过并提示，其余照传。
    const oversize = list.filter(file => file.size > ATTACHMENT_MAX_BYTES)
    const badType = list.filter(file => file.size <= ATTACHMENT_MAX_BYTES && !ALLOWED_ATTACHMENT_EXT.has(extOf(file.name)))
    const sendable = list.filter(file => file.size <= ATTACHMENT_MAX_BYTES && ALLOWED_ATTACHMENT_EXT.has(extOf(file.name)))
    if (oversize.length > 0) setUploadError('payload-too-large')
    if (badType.length > 0) setUploadError('file-type-not-allowed')
    if (sendable.length === 0) return
    setUploading(true)
    // ⚠️ 多选修复：逐个收进本地数组、循环末**一次性** patch。此前每次 addAttachment 都展开
    // 渲染闭包里的旧 draft.attachments ⇒ 多选时后一个把前一个覆盖掉，列表只剩最后一个文件。
    const added: Attachment[] = []
    let lastErr: string | null = null
    for (const file of sendable) {
      try {
        const res = await fetch('/api/task-dispatch-table/attachment', {
          method: 'POST',
          headers: { 'x-filename': encodeURIComponent(file.name), 'content-type': 'application/octet-stream' },
          body: file,
        })
        const data = await res.json().catch(() => null)
        if (data === null || data.ok !== true) { lastErr = typeof data?.error === 'string' ? data.error : 'upload-failed'; continue }
        added.push({ id: makeId(), name: data.name, kind: 'upload', ref: data.ref })
      } catch (error) { lastErr = error instanceof Error ? error.message : 'network-error' }
    }
    setUploading(false)
    if (added.length > 0) patch({ attachments: [...draft.attachments, ...added] })
    if (lastErr !== null) setUploadError(lastErr)
  }
  const attachmentsCard = h('div', { className: 'dsh-tdt-ed-card' },
    h('div', { className: 'dsh-tdt-ed-card-head' },
      h('div', { className: 'dsh-tdt-ed-label', style: { display: 'flex', alignItems: 'center', gap: '4px' } },
        t('editorAttachments'),
        h(Tooltip, { label: t('editorAttachmentsHint'), side: 'bottom' },
          h(IconQuestionOutlineRegular, { size: 14 })),
      ),
    ),
    // 附件列表（空数组不渲染任何东西——投放框常驻已是明确的空态，不再重复「暂无」文案）。
    draft.attachments.length === 0 ? null : h('div', { style: { display: 'flex', flexDirection: 'column', gap: '6px', marginBottom: '10px' } },
          // 行样式（用户 2026-09-29）：不要边框，用半透明浅底衬出每一行。
          draft.attachments.map(att => h('div', { key: att.id, style: { display: 'flex', alignItems: 'center', gap: '8px', padding: '6px 10px', borderRadius: '6px', background: 'var(--dsw-alias-interactive-bg-hover, rgba(127, 127, 127, 0.14))' } },
            h('span', { style: { flex: 'none', display: 'flex', alignItems: 'center' } }, h(FileTypeIcon, { path: att.name, size: 16 })),
            h('span', { style: { flex: '1 1 auto', minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', fontSize: '13px' } }, att.name),
            h('span', { title: att.ref, style: { flex: 'none', fontSize: '11px', color: C.textDim, borderRadius: '4px', padding: '1px 6px', background: 'var(--dsw-alias-interactive-bg-hover, rgba(127, 127, 127, 0.14))' } }, att.kind === 'link' ? t('editorAttachmentLink') : t('editorAttachmentUpload')),
            h(Button, { variant: 'ghost', size: 'sm', onClick: () => { patch({ attachments: draft.attachments.filter(a => a.id !== att.id) }) }, title: t('editorAttachmentRemove'), 'aria-label': t('editorAttachmentRemove') }, t('editorAttachmentRemove')),
          )),
        ),
    // 一行两块（用户 2026-09-29）：左边大块 = 点击/拖拽上传；右边 = 小号「选择工作区文件」按钮。
    // 隐藏 input 挂卡片层、始终在册。
    h('div', { style: { display: 'flex', gap: '10px', alignItems: 'stretch' } },
      h('div', {
        style: { flex: '1 1 auto', border: `1px dashed ${C.borderL4}`, borderRadius: C.radiusMd, padding: '16px 12px', textAlign: 'center', cursor: uploading ? 'default' : 'pointer', background: C.layer1 },
        onClick: () => { if (!uploading) fileInputRef.current?.click() },
        onDragOver: (event: { preventDefault(): void }) => { event.preventDefault() },
        onDrop: (event: { preventDefault(): void; dataTransfer?: { files?: FileList } }) => {
          event.preventDefault()
          if (!uploading && event.dataTransfer?.files !== undefined) void uploadFiles(event.dataTransfer.files)
        },
      },
        h('div', { style: { fontSize: '13px', color: C.text } }, uploading ? t('editorUploading') : t('editorDropZoneHint')),
        uploading ? null : h('div', { style: { fontSize: '11px', color: C.textDim, marginTop: '4px' } }, t('editorDropZoneFormats')),
      ),
      h('div', { style: { flex: 'none', display: 'flex' } },
        h(Button, {
          variant: 'outline',
          size: 'sm',
          style: { height: '100%' },
          icon: h(IconPlusOutlineRegular, { size: 14 }),
          onClick: () => {
            // 默认浏览任务已选工作区；没选就取第一个工作区（用户 2026-09-29：默认最近/第一个都行）。
            setPickerWs(draft.workspace !== '' ? draft.workspace : (workspaces[0]?.value ?? ''))
            setPickerOpen(true)
          },
        }, t('editorPickWorkspaceFile')),
      ),
    ),
    h('input', {
      ref: fileInputRef,
      type: 'file',
      multiple: true,
      style: { display: 'none' },
      onChange: (event: { target: { files?: FileList } }) => { if (event.target.files !== undefined) void uploadFiles(event.target.files) },
    }),
    uploadError === null ? null : h('p', { style: { color: '#e5484d', fontSize: '12px', margin: '9px 0 0' } }, uploadErrText(uploadError)),
  )

  // ② 执行频率卡：**单次 / 周期 / 间隔** 三档 + 时区 / 有效期。
  //    「单次」不是第四种排期，它就是「周期档的频率 = 单次」——所以切到单次时把 periodFreq 设成 once，
  //    而在周期档里把频率改成别的，顶部会自动回到「周期」（值是从 periodFreq 推导的，无需额外回写）。
  const scheduleCard = h('div', { className: 'dsh-tdt-ed-card' },
    h('div', { className: 'dsh-tdt-ed-card-head', style: { marginBottom: '12px' } },
      h('div', { className: 'dsh-tdt-ed-label' }, t('editorSchedule')),
      h('div', { style: { display: 'flex', alignItems: 'center', gap: '8px', flex: 'none' } },
        h(Segmented, {
          id: 'dsh-tdt-ed-schedule',
          value: scheduleTab,
        options: [
          { value: 'once', label: t('editorFreqOnce') },
          { value: 'periodic', label: t('editorSchedulePeriodic') },
          { value: 'interval', label: t('editorScheduleInterval') },
        ],
        onChange: value => {
          if (value === 'once') { patch({ scheduleKind: 'periodic', periodFreq: 'once' }); return }
          if (value === 'interval') { patch({ scheduleKind: 'interval' }); return }
          // 回到「周期」：原来停在一次性的话，落到每天（否则保持原频率）。
          patch({ scheduleKind: 'periodic', periodFreq: draft.periodFreq === 'once' ? 'daily' : draft.periodFreq })
        },
        label: t('editorSchedule'),
          className: 'dsh-tdt-ed-seg',
        }),
      ),
    ),
    draft.scheduleKind === 'interval'
      ? h('div', { id: 'dsh-tdt-ed-schedule-interval-panel', role: 'tabpanel', 'aria-label': t('editorScheduleInterval') },
          h(IntervalControls, { draft, patch, t, weekdayLabels }),
        )
      : h('div', {
        id: `dsh-tdt-ed-schedule-${draft.periodFreq === 'once' ? 'once' : 'periodic'}-panel`,
        role: 'tabpanel',
        'aria-label': draft.periodFreq === 'once' ? t('editorFreqOnce') : t('editorSchedulePeriodic'),
      },
        h(PeriodControls, {
          draft, patch, freqOptions, t, tt, weekdayLabels, calendarLabels, timeLabels,
        }),
      ),
    // 底部：左 = 任务开始时间（锚点，周期/间隔都有，带 ? 说明），右 = 允许延迟（次要，居右）。
    h('div', { className: 'dsh-tdt-ed-schedfoot', style: { display: 'flex', alignItems: 'center', gap: '8px' } },
      showTaskStart
        ? h('div', { style: { display: 'flex', alignItems: 'center', gap: '4px' } },
            h('span', { style: { fontSize: '11px', color: C.text } }, t('editorTaskStart')),
            h(DateField, {
              value: draft.date,
              onChange: value => { patch({ date: value }) },
              placeholder: t('editorDatePh'),
              ariaLabel: t('editorTaskStart'),
              labels: calendarLabels,
              width: 126,
            }),
            // 间隔档要选时刻；周期档时刻由上方频率区决定，这里只选日期。
            draft.scheduleKind === 'interval'
              ? h(TimeField, {
                value: draft.time,
                onChange: value => { patch({ time: value }) },
                placeholder: t('editorTimePh'),
                ariaLabel: t('editorTaskStart'),
                labels: timeLabels,
                width: 92,
              })
              : null,
            h(Tooltip, { label: t('editorTaskStartHint'), side: 'top', align: 'center', maxWidth: 300 },
              h('button', { type: 'button', className: 'dsh-tdt-ed-help', 'aria-label': t('editorTaskStartHint') },
                h(IconQuestionOutlineRegular, { size: 14 }),
              ),
            ),
          )
        : null,
      h('span', { className: 'dsh-tdt-ed-spacer', style: { flex: '1 1 auto' } }),
      h('div', { style: { display: 'flex', alignItems: 'center', gap: '6px' } },
        h('span', { style: { flex: 'none', whiteSpace: 'nowrap', fontSize: '11px', color: C.textDim } }, t('editorWindow')),
        h(SelectField, {
          value: draft.window,
          options: windowOptions,
          onChange: value => { patch({ window: value }) },
          placeholder: t('editorWindow'),
          emptyLabel: t('editorNoOptions'),
          ariaLabel: t('editorWindow'),
          size: 'sm',
          align: 'end',
        }),
        h(Tooltip, { label: t('editorWindowHint'), side: 'top', align: 'end', maxWidth: 320 },
          h('button', { type: 'button', className: 'dsh-tdt-ed-help', 'aria-label': t('editorWindowHint') },
            h(IconQuestionOutlineRegular, { size: 14 }),
          ),
        ),
      ),
    ),
  )

  // ③ 前置任务（只做界面；怎么校验归另一个任务）。
  const taskOptions = tasks
  const depsBlock = h(Section, { label: t('editorDeps') },
    h('div', { className: 'dsh-tdt-ed-row' },
      h(Button, {
        variant: 'outline',
        size: 'sm',
        icon: h(IconPlusOutlineRegular, { size: 14 }),
        disabled: taskOptions.length === 0,
        title: taskOptions.length === 0 ? t('editorNoOptions') : t('editorDepAdd'),
        onClick: () => { patch({ deps: [...draft.deps, { task: taskOptions[0]?.value ?? '', semantics: 'same_period' }] }) },
      }, t('editorDepAdd')),
      draft.deps.length === 0 ? h('span', { className: 'dsh-tdt-ed-hint', style: { margin: 0 } }, t('editorDepEmpty')) : null,
    ),
    draft.deps.length === 0
      ? null
      : h('div', null, draft.deps.map((dep, index) => h('div', { key: index, className: 'dsh-tdt-ed-deprow' },
          h(SelectField, {
            value: dep.task,
            options: taskOptions,
            onChange: value => {
              const next = draft.deps.slice()
              next[index] = { ...dep, task: value }
              patch({ deps: next })
            },
            placeholder: t('editorDepTask'),
            emptyLabel: t('editorNoOptions'),
            ariaLabel: t('editorDepTask'),
          }),
          h(SelectField, {
            value: dep.semantics,
            options: [
              { value: 'same_period', label: t('editorDepSamePeriod') },
              { value: 'latest_success', label: t('editorDepLatestSuccess') },
            ],
            onChange: value => {
              const next = draft.deps.slice()
              next[index] = { ...dep, semantics: value as DepSemantics }
              patch({ deps: next })
            },
            placeholder: t('editorDepSemantics'),
            emptyLabel: t('editorNoOptions'),
            ariaLabel: t('editorDepSemantics'),
          }),
          h(Button, {
            variant: 'ghost',
            size: 'sm',
            title: t('editorDepRemove'),
            onClick: () => { patch({ deps: draft.deps.filter((_, i) => i !== index) }) },
          }, t('editorDepRemove')),
        ))),
  )

  // ④ 高级：重试 / 成功状态清单 / 版本历史（P3）/ JSON 逃生口。
  const advancedBlock = h('div', { className: 'dsh-tdt-ed-section' },
    h('button', {
      className: 'dsh-tdt-ed-summary',
      type: 'button',
      'aria-expanded': advancedOpen,
      onClick: () => { setAdvancedOpen(!advancedOpen) },
    },
      h('span', null, t('editorAdvanced')),
      h('span', { style: { color: C.textDim } }, advancedOpen ? '▴' : '▾'),
    ),
    advancedOpen
      ? h('div', { style: { marginTop: '10px' } },
          h('div', { className: 'dsh-tdt-ed-row' },
            h('span', { style: { fontSize: '12px', color: C.textDim } }, t('editorRetry')),
            h('input', {
              type: 'number',
              min: 1,
              value: draft.maxAttempts,
              onChange: (event: { target: { value: string } }) => { patch({ maxAttempts: event.target.value }) },
              'aria-label': t('editorRetry'),
              className: 'dsh-tdt-ed-input',
              style: { width: '84px', textAlign: 'center' },
            }),
            h('span', { className: 'dsh-tdt-ed-spacer' }),
            h(Button, {
              variant: 'outline',
              size: 'sm',
              disabled: true,
              title: t('editorUnavailable'),
            }, `${t('editorVersions')}（P3）`),
          ),
          h('div', { style: { marginTop: '10px' } },
            h('div', { style: sectionLabelStyle }, t('editorValidStatuses')),
            h('input', {
              value: draft.validStatuses,
              placeholder: 'ok',
              spellCheck: false,
              onChange: (event: { target: { value: string } }) => { patch({ validStatuses: event.target.value }) },
              'aria-label': t('editorValidStatuses'),
              className: 'dsh-tdt-ed-input dsh-tdt-ed-mono',
              style: { width: '100%' },
            }),
          ),
          h('div', { style: { marginTop: '12px' } },
            h('button', {
              className: 'dsh-tdt-ed-summary',
              type: 'button',
              'aria-expanded': jsonOpen,
              onClick: () => { setJsonOpen(!jsonOpen) },
            },
              h('span', null, `⚙ ${t('editorJson')}`),
              h('span', { style: { color: C.textDim } }, jsonOpen ? '▴' : '▾'),
            ),
            jsonOpen
              ? h('div', null,
                  h('textarea', {
                    className: 'dsh-tdt-ed-json',
                    readOnly: true,
                    spellCheck: false,
                    value: draftToDefinitionJson(draft),
                    'aria-label': t('editorJson'),
                  }),
                  h('p', { className: 'dsh-tdt-ed-hint' }, t('editorJsonHint')),
                )
              : null,
          ),
        )
      : null,
  )

  const body = tab === 'records'
    ? h('p', { className: 'dsh-tdt-ed-hint' }, t('editorRecordsPending'))
    : h('div', null,
        // 任务名称 / 编号：标签**塞进框里**（左半段带底 + 分隔线），不再单独占一行。
        h('div', { className: 'dsh-tdt-ed-section' },
          h(PrefixedInput, {
            prefix: t('editorTitle'),
            value: draft.title,
            placeholder: t('editorTitlePh'),
            onChange: value => { patch({ title: value }) },
          }),
        ),
        h('div', { className: 'dsh-tdt-ed-section' },
          h(PrefixedInput, {
            prefix: t('editorCode'),
            value: draft.code,
            placeholder: t('editorCodePh'),
            onChange: value => { patch({ code: value }) },
          }),
        ),
        // 各区块间距统一走 `.dsh-tdt-ed-section` 的 margin（此前这里多了两个 16px 空 div，
        // 导致「编号 → 提示词」比别的间隔小一截）。
        h('div', { className: 'dsh-tdt-ed-section' }, promptCard),
        h('div', { className: 'dsh-tdt-ed-section' }, attachmentsCard),
        h('div', { className: 'dsh-tdt-ed-section' }, scheduleCard),
        depsBlock,
        advancedBlock,
      )

  // 全屏编辑 = 把整个「新建任务」拉栏的内容换成编辑器（同样的边、同样的宽度、随左缘拖拽一起变宽）；
  // 关闭编辑器即把后面的表单露出来。故编辑器与表单在拉栏内二选一，而不是再做一个居中弹窗。
  const panelInner = editorOpen
    ? h(PromptEditorModal, {
      t,
      mode,
      value: draft.prompt,
      versions: draft.versions,
      onChange: (value: string) => { patch({ prompt: value }) },
      onClose: () => { setEditorOpen(false) },
    })
    : h('div', { style: { display: 'flex', flexDirection: 'column', flex: '1 1 auto', minHeight: 0 } },
      // 头部：标题 + 启用开关（关闭钮左边）+ 关闭。启用不再单占一行。
      h('div', { className: 'dsh-tdt-ed-header' },
        h('div', { className: 'dsh-tdt-ed-title' }, mode === 'create' ? t('editorNew') : t('editorEdit')),
        h('div', { className: 'dsh-tdt-ed-headactions' },
          h('span', { className: 'dsh-tdt-ed-enable' },
            h('span', null, t('editorEnabled')),
            h(Switch, {
              checked: draft.enabled,
              onChange: next => { patch({ enabled: next }) },
              label: t('editorEnabled'),
              title: draft.enabled ? t('editorEnabledOn') : t('editorEnabledOff'),
            }),
          ),
          h('button', {
            className: 'dsh-tdt-ed-close',
            type: 'button',
            title: t('editorClose'),
            'aria-label': t('editorClose'),
            onClick: requestClose,
          }, h(IconCloseOutlineRegular, { size: 16 })),
        ),
      ),
      // 编辑态两 tab：基本信息 / 执行记录；创建态只有基本信息。
      mode === 'edit'
        ? h('div', { className: 'dsh-tdt-ed-tabs', role: 'tablist' },
            h('button', {
              className: 'dsh-tdt-ed-tab',
              type: 'button',
              role: 'tab',
              'aria-selected': tab === 'basic',
              onClick: () => { setTab('basic') },
            }, t('editorTabBasic')),
            h('button', {
              className: 'dsh-tdt-ed-tab',
              type: 'button',
              role: 'tab',
              'aria-selected': tab === 'records',
              onClick: () => { setTab('records') },
            }, t('editorTabRecords')),
          )
        : null,
      h('div', { className: 'dsh-tdt-ed-body' }, body),
      h('div', { className: 'dsh-tdt-ed-footer' },
        pendingHint ? h('span', { className: 'dsh-tdt-ed-hint', style: { margin: '0 8px 0 0' } }, t('editorSavePending')) : null,
        h(Button, { variant: 'outline', size: 'sm', onClick: requestClose }, t('editorCancel')),
        h(Button, {
          variant: 'primary',
          size: 'sm',
          onClick: () => {
            if (onSave === undefined) setPendingHint(true)
            else onSave(draft)
          },
        }, t('editorSave')),
      ),
    )

  return h('div', {
    className: 'dsh-tdt-ed-overlay',
    onPointerDown: (event: { target: unknown; currentTarget: unknown }) => {
      if (event.target === event.currentTarget) requestClose()
    },
  },
    h('div', { className: 'dsh-tdt-ed-panel', style: { width: `${width}px` }, role: 'dialog', 'aria-modal': true, 'aria-label': mode === 'create' ? t('editorNew') : t('editorEdit') },
      h('div', {
        className: 'dsh-tdt-ed-resizer',
        title: t('previewResize'),
        onPointerDown: (event: { clientX: number }) => { startResize({ clientX: event.clientX }) },
      }),
      panelInner,
    ),
    // 选择工作区文件：覆盖层（盖在表单/编辑器之上、随抽屉一起在宿主之上）；复用 FileBrowser 的目录树，
    // picker 模式下点文件即回调、不进预览。**可浏览任意工作区**（用户 2026-09-29 放开）：
    // 每个工作区用自己最近的会话当锚点（/options 逐工作区下发 anchorSessionId，官方 entity.sessionIds 末位）；
    // 切工作区按 `${ws}:${anchor}` 重挂 FileBrowser（浏览状态归零）。无锚点的工作区列不出来 ⇒ 空态。
    pickerOpen
      ? h('div', { style: { position: 'absolute', inset: 0, zIndex: 30, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '24px', background: 'var(--dsw-alias-bg-mask-1, rgba(0,0,0,0.45))' } },
        h('div', { style: { width: 'min(720px, 100%)', height: '72vh', boxSizing: 'border-box', background: 'var(--dsw-alias-bg-layer-2, #2a2e33)', borderRadius: 'var(--dsh-radius-panel, 10px)', boxShadow: 'var(--dsw-elevation-prominent, 0 12px 40px rgba(0,0,0,0.4))', display: 'flex', flexDirection: 'column', overflow: 'hidden' } },
          h('div', { style: { display: 'flex', alignItems: 'center', gap: '12px', padding: '10px 14px', borderBottom: `1px solid ${C.borderL2}` } },
            h('span', { style: { fontSize: '14px', fontWeight: 600, flex: 'none' } }, t('editorPickWorkspaceFile')),
            h('div', { style: { flex: '1 1 auto', minWidth: 0 } },
              h(SelectField, {
                value: pickerWs,
                // 列**全部**工作区（用户 2026-09-29：别只给有会话的）；没会话的选中后正文给提示。
                options: workspaces,
                onChange: value => { setPickerWs(value) },
                placeholder: t('editorWorkspacePh'),
                emptyLabel: t('editorNoOptions'),
                ariaLabel: t('editorWorkspace'),
                icon: h(IconFolderOpenOutlineRegular, { size: 14 }),
                size: 'sm',
              }),
            ),
            h(Button, { variant: 'outline', size: 'sm', onClick: () => { setPickerOpen(false) } }, t('editorPickerCancel')),
          ),
          (() => {
            const anchorSessionId = (workspaceAnchors ?? {})[pickerWs] ?? ''
            return workspaceFiles !== null && workspaceFiles !== undefined && anchorSessionId !== ''
              ? h(FileBrowser, {
                key: `${pickerWs}:${anchorSessionId}`,
                workspaceFiles,
                sessionId: anchorSessionId,
                path: '',
                t,
                onClose: () => { setPickerOpen(false) },
                picker: true,
                onPick: (p: string) => {
                  const name = p.slice(Math.max(p.lastIndexOf('/'), p.lastIndexOf('\\')) + 1)
                  addAttachment({ id: makeId(), name, kind: 'link', ref: p, workspace: pickerWs })
                  setPickerOpen(false)
                },
                style: { flex: '1 1 auto', minHeight: 0 },
              })
              : h('div', { style: { flex: '1 1 auto', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '24px', textAlign: 'center', color: C.textDim, fontSize: '13px' } }, t('editorPickerNoSession'))
          })(),
        ),
      )
      : null,
    // 关闭确认（拉栏内联层，盖在表单/编辑器之上、且随抽屉一起在宿主之上）：改过才出现；
    // 点遮罩/离开 ⇒ 真正关抽屉，继续编辑 ⇒ 留在原处。
    confirmDiscard
      ? h(ConfirmDiscard, {
        t,
        onStay: () => { setConfirmDiscard(false) },
        onLeave: () => { setConfirmDiscard(false); onClose() },
      })
      : null,
  )
}
