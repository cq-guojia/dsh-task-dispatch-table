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

import { createElement as h, useCallback, useEffect, useMemo, useState } from 'react'
import type { CSSProperties, ReactElement, ReactNode } from 'react'
import {
  Button,
  IconCloseOutlineRegular,
  IconFolderOpenOutlineRegular,
  IconPlusOutlineRegular,
  Switch,
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

/** 与 index.ts 同形的 t 席位（本仓库 client 半侧惯例：无参 t；带占位符的文案走 tTemplate）。 */
type T = (key: LocaleKey) => string

export type { EditorOption }

export type EditorMode = 'create' | 'edit'

/** 提示词来源：手输（我们管版本）/ 选择工作区里的任务手册（只记路径）/ 上传 MD（我们管版本）。 */
export type PromptSource = 'inline' | 'manual' | 'upload'

/** 排期三档（用户 2026-09-29：参考图是「周期 / 间隔」，周期里含「单次」）。 */
export type ScheduleKind = 'periodic' | 'interval'

/** 周期档内的频率粒度。 */
export type PeriodFreq = 'once' | 'daily' | 'weekly' | 'biweekly' | 'monthly' | 'yearly'

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
  scheduleKind: ScheduleKind
  periodFreq: PeriodFreq
  /** 周一 = 1 … 周日 = 7（周期-每周/双周 与 间隔 共用）。 */
  weekdays: number[]
  /** 每月第几天（1..31）。 */
  monthDay: string
  /** 每年第几月（1..12）。 */
  yearMonth: string
  intervalUnit: IntervalUnit
  intervalStep: string
  /** `YYYY-MM-DD`（单次 / 周期锚点）。 */
  date: string
  /** `HH:mm`。 */
  time: string
  timezone: string
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
    scheduleKind: 'periodic',
    periodFreq: 'daily',
    weekdays: [1, 2, 3, 4, 5],
    monthDay: '1',
    yearMonth: '1',
    intervalUnit: 'hour',
    intervalStep: '1',
    date: todayIso(),
    time: '09:00',
    timezone: '',
    window: 'PT4H',
    maxAttempts: '1',
    validStatuses: 'ok',
    deps: [],
  }
}

// ─────────────────────── 排期 → cron 只读预览（P2 才落真映射） ───────────────────────

const WINDOW_PRESETS = ['PT30M', 'PT1H', 'PT2H', 'PT4H', 'PT8H', 'P1D'] as const

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
    case 'biweekly':
      // cron 没有「隔周」位；映射方式（加字段 or 别的手段）待 P2 拍板 ⇒ 不编造。
      return null
    case 'monthly':
      return `${minute} ${hour} ${draft.monthDay} * *`
    case 'yearly':
      return `${minute} ${hour} ${draft.monthDay} ${draft.yearMonth} *`
  }
}

/** 草稿 → 任务定义 JSON（**只读预览**用；真保存归 P2）。 */
export function draftToDefinitionJson(draft: TaskEditorDraft): string {
  const schedule: Record<string, unknown> = { window: draft.window }
  if (draft.scheduleKind === 'periodic' && draft.periodFreq === 'once') {
    schedule.once = `${draft.date}T${draft.time}`
  } else {
    const cron = scheduleCron(draft)
    if (cron !== null) schedule.cron = cron
  }
  if (draft.timezone.trim() !== '') schedule.timezone = draft.timezone.trim()

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
  return JSON.stringify(definition, null, 2)
}

// ─────────────────────── 布局小件 ───────────────────────

/** 单行输入的度量全在 `dsh-tdt-ed-input` 类里（逐条照官方 Input.module.css，含 focus 描边与占位色）。 */
const sectionLabelStyle: CSSProperties = { fontSize: '12px', fontWeight: 600, color: C.text, marginBottom: '6px' }

function Section(props: { label?: string; children?: ReactNode }): ReactElement {
  return h('div', { className: 'dsh-tdt-ed-section' },
    props.label === undefined ? null : h('div', { className: 'dsh-tdt-ed-label', style: { marginBottom: '6px' } }, props.label),
    props.children ?? null,
  )
}

// ─────────────────────── 排期区 ───────────────────────

/** 周期档的子控件（照参考图：单次=日期+时间；每天=时间；每周/双周=周几+时间；每月/每年=日/月+时间）。 */
function PeriodControls(props: {
  draft: TaskEditorDraft
  patch: (part: Partial<TaskEditorDraft>) => void
  t: T
  tt: (key: LocaleKey, params?: Record<string, string | number>) => string
  weekdayLabels: WeekdayLabels
  calendarLabels: CalendarLabels
  timeLabels: TimeLabels
}): ReactElement {
  const { draft, patch, t, tt, weekdayLabels, calendarLabels, timeLabels } = props
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

  const rows: ReactNode[] = []
  rows.push(h(DateField, {
    key: 'date',
    value: draft.date,
    onChange: value => { patch({ date: value }) },
    placeholder: t('editorDatePh'),
    ariaLabel: t('editorDate'),
    labels: calendarLabels,
    width: 148,
  }))
  if (draft.periodFreq === 'yearly') {
    rows.push(h(SelectField, {
      key: 'month',
      value: draft.yearMonth,
      options: monthOptions,
      onChange: value => { patch({ yearMonth: value }) },
      placeholder: t('editorMonth'),
      emptyLabel: t('editorNoOptions'),
      ariaLabel: t('editorMonth'),
      width: 96,
    }))
  }
  if (draft.periodFreq === 'monthly' || draft.periodFreq === 'yearly') {
    rows.push(h(SelectField, {
      key: 'day',
      value: draft.monthDay,
      options: dayOptions,
      onChange: value => { patch({ monthDay: value }) },
      placeholder: t('editorDayOfMonth'),
      emptyLabel: t('editorNoOptions'),
      ariaLabel: t('editorDayOfMonth'),
      width: 110,
    }))
  }
  rows.push(timeField)

  return h('div', null,
    h('div', { className: 'dsh-tdt-ed-row' }, rows),
    draft.periodFreq === 'weekly' || draft.periodFreq === 'biweekly'
      ? h('div', { style: { marginTop: '8px' } },
          h(WeekdayPicker, {
            value: draft.weekdays,
            onChange: value => { patch({ weekdays: value }) },
            labels: weekdayLabels,
          }),
        )
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
  return h('div', null,
    h('div', { className: 'dsh-tdt-ed-row' },
      h('span', { style: { fontSize: '13px', color: C.text } }, t('editorIntervalEvery')),
      h('input', {
        type: 'number',
        min: 1,
        value: draft.intervalStep,
        onChange: (event: { target: { value: string } }) => { patch({ intervalStep: event.target.value }) },
        'aria-label': t('editorIntervalStep'),
        className: 'dsh-tdt-ed-input',
        style: { width: '72px', textAlign: 'center' },
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
    h('div', { style: { marginTop: '8px' } },
      h('div', { className: 'dsh-tdt-ed-label', style: { marginBottom: '4px' } }, t('editorIntervalOn')),
      h(WeekdayPicker, {
        value: draft.weekdays,
        onChange: value => { patch({ weekdays: value }) },
        labels: weekdayLabels,
      }),
    ),
  )
}

// ─────────────────────── 弹窗本体 ───────────────────────

/** 宽度持久化（纯本地偏好；隐私模式也不崩）。 */
const WIDTH_KEY = 'dsh-tdt-editor-width'
const WIDTH_DEFAULT = 540
const WIDTH_MIN = 380

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
}): ReactElement {
  const { t, mode, draft, onChange, workspaces, models, tasks, onClose, onSave } = props
  const [width, setWidth] = useState<number>(readWidth)
  const [tab, setTab] = useState<'basic' | 'records'>('basic')
  const [advancedOpen, setAdvancedOpen] = useState(false)
  const [jsonOpen, setJsonOpen] = useState(false)
  const [pendingHint, setPendingHint] = useState(false)

  useEffect(() => { ensureTaskEditorStyle() }, [])

  const patch = useCallback((part: Partial<TaskEditorDraft>): void => {
    onChange({ ...draft, ...part })
  }, [draft, onChange])

  // 带 `{name}` 占位符的文案（复用 locales 的替换器；本页 t 席位是无参形态）。
  const tt = useMemo(() => interpolateTranslate(t), [t])

  // Esc 关闭；浮层（下拉 / 日历 / 时分）自己先处理并 preventDefault ⇒ 此处不再关弹窗。
  useEffect(() => {
    const onKey = (event: KeyboardEvent): void => {
      if (event.key === 'Escape' && !event.defaultPrevented) onClose()
    }
    window.addEventListener('keydown', onKey)
    return () => { window.removeEventListener('keydown', onKey) }
  }, [onClose])

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

  const weekdayLabels: WeekdayLabels = useMemo(() => ({
    weekdays: WEEKDAY_KEYS.map(key => t(key)),
    add: t('editorWeekdayAdd'),
    empty: t('editorWeekdayEmpty'),
    remove: (name: string) => tt('editorWeekdayRemove', { name }),
  }), [t, tt])

  const calendarLabels: CalendarLabels = useMemo(() => ({
    today: t('editorToday'),
    prevMonth: t('editorPrevMonth'),
    nextMonth: t('editorNextMonth'),
    prevYear: t('editorPrevYear'),
    nextYear: t('editorNextYear'),
    monthTitle: (year: number, month: number) => tt('editorMonthTitle', { y: year, m: month }),
    weekdays: ['editorWeekday1', 'editorWeekday2', 'editorWeekday3', 'editorWeekday4', 'editorWeekday5', 'editorWeekday6', 'editorWeekday7']
      .map(key => t(key as LocaleKey).replace(/^周/, '')),
  }), [t, tt])

  const timeLabels: TimeLabels = useMemo(() => ({
    hour: t('editorHour'),
    minute: t('editorMinute'),
    now: t('editorNow'),
    confirm: t('editorConfirm'),
  }), [t])

  const promptSourceOptions: { value: PromptSource; label: string }[] = [
    { value: 'inline', label: t('editorSourceInline') },
    { value: 'manual', label: t('editorSourceManual') },
    { value: 'upload', label: t('editorSourceUpload') },
  ]

  const freqOptions: EditorOption[] = [
    { value: 'once', label: t('editorFreqOnce') },
    { value: 'daily', label: t('editorFreqDaily') },
    { value: 'weekly', label: t('editorFreqWeekly') },
    { value: 'biweekly', label: t('editorFreqBiweekly') },
    { value: 'monthly', label: t('editorFreqMonthly') },
    { value: 'yearly', label: t('editorFreqYearly') },
  ]

  const tzOptions: EditorOption[] = [
    { value: 'Asia/Shanghai', label: 'Asia/Shanghai' },
    { value: 'UTC', label: 'UTC' },
  ]
  const windowOptions: EditorOption[] = WINDOW_PRESETS.map(value => ({ value, label: value }))

  const scheduleNote = draft.scheduleKind === 'periodic' && draft.periodFreq === 'biweekly'
    ? t('editorBiweeklyWarn')
    : null

  // ① 提示词卡（主视觉）：右上角三档来源；左下角工作区、右下角模型。
  const promptCard = h('div', { className: 'dsh-tdt-ed-card' },
    h('div', { className: 'dsh-tdt-ed-card-head' },
      h('div', { className: 'dsh-tdt-ed-label' }, t('editorPrompt')),
      h(Segmented, {
        id: 'dsh-tdt-ed-source',
        value: draft.promptSource,
        options: promptSourceOptions,
        onChange: value => { patch({ promptSource: value as PromptSource }) },
        label: t('editorSource'),
      }),
    ),
    draft.promptSource === 'inline'
      // 面板 id 与官方 `SegmentedControl` 的 `aria-controls`（`<id>-<value>-panel`）对上。
      ? h('textarea', {
        id: 'dsh-tdt-ed-source-inline-panel',
        className: 'dsh-tdt-ed-prompt',
        value: draft.prompt,
        placeholder: t('editorPromptPh'),
        spellCheck: false,
        onChange: (event: { target: { value: string } }) => { patch({ prompt: event.target.value }) },
      })
      : draft.promptSource === 'manual'
        ? h('div', { id: 'dsh-tdt-ed-source-manual-panel', role: 'tabpanel', 'aria-label': t('editorSourceManual') },
            h('div', { className: 'dsh-tdt-ed-row' },
              h('input', {
                value: draft.manualPath,
                placeholder: t('editorManualPathPh'),
                spellCheck: false,
                onChange: (event: { target: { value: string } }) => { patch({ manualPath: event.target.value }) },
                'aria-label': t('editorManualPath'),
                className: 'dsh-tdt-ed-input dsh-tdt-ed-mono',
                style: { flex: '1 1 auto', minWidth: 0 },
              }),
              h(Button, {
                variant: 'outline',
                size: 'sm',
                disabled: true,
                title: t('editorUnavailable'),
              }, t('editorPickFile')),
            ),
            h('p', { className: 'dsh-tdt-ed-hint' }, t('editorManualHint')),
          )
        : h('div', { id: 'dsh-tdt-ed-source-upload-panel', role: 'tabpanel', 'aria-label': t('editorSourceUpload') },
            h('div', { className: 'dsh-tdt-ed-drop' }, t('editorUploadHint')),
            h('p', { className: 'dsh-tdt-ed-hint' }, t('editorUploadWarn')),
          ),
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

  // ② 执行频率卡：周期 / 间隔 两档 + 时区 / 有效期。
  const scheduleCard = h('div', { className: 'dsh-tdt-ed-card' },
    h('div', { className: 'dsh-tdt-ed-card-head' },
      h('div', { className: 'dsh-tdt-ed-label' }, t('editorSchedule')),
      h(Segmented, {
        id: 'dsh-tdt-ed-schedule',
        value: draft.scheduleKind,
        options: [
          { value: 'periodic', label: t('editorSchedulePeriodic') },
          { value: 'interval', label: t('editorScheduleInterval') },
        ],
        onChange: value => { patch({ scheduleKind: value as ScheduleKind }) },
        label: t('editorSchedule'),
      }),
    ),
    draft.scheduleKind === 'periodic'
      ? h('div', { id: 'dsh-tdt-ed-schedule-periodic-panel', role: 'tabpanel', 'aria-label': t('editorSchedulePeriodic') },
          h('div', { className: 'dsh-tdt-ed-row', style: { marginBottom: '8px' } },
            h('span', { style: { fontSize: '13px', color: C.text } }, t('editorFreq')),
            h(SelectField, {
              value: draft.periodFreq,
              options: freqOptions,
              onChange: value => { patch({ periodFreq: value as PeriodFreq }) },
              placeholder: t('editorFreqDaily'),
              emptyLabel: t('editorNoOptions'),
              ariaLabel: t('editorFreq'),
              width: 110,
            }),
          ),
          h(PeriodControls, {
            draft, patch, t, tt, weekdayLabels, calendarLabels, timeLabels,
          }),
        )
      : h('div', { id: 'dsh-tdt-ed-schedule-interval-panel', role: 'tabpanel', 'aria-label': t('editorScheduleInterval') },
          h(IntervalControls, { draft, patch, t, weekdayLabels }),
        ),
    scheduleNote === null ? null : h('p', { className: 'dsh-tdt-ed-warn' }, scheduleNote),
    h('div', { className: 'dsh-tdt-ed-row', style: { marginTop: '10px' } },
      h('span', { style: { fontSize: '12px', color: C.textDim } }, t('editorTimezone')),
      h(SelectField, {
        value: draft.timezone,
        options: tzOptions,
        onChange: value => { patch({ timezone: value }) },
        placeholder: t('editorFollowHost'),
        emptyLabel: t('editorNoOptions'),
        ariaLabel: t('editorTimezone'),
        width: 148,
      }),
      h('span', { style: { fontSize: '12px', color: C.textDim } }, t('editorWindow')),
      h(SelectField, {
        value: draft.window,
        options: windowOptions,
        onChange: value => { patch({ window: value }) },
        placeholder: t('editorWindow'),
        emptyLabel: t('editorNoOptions'),
        ariaLabel: t('editorWindow'),
        width: 110,
      }),
    ),
    h('p', { className: 'dsh-tdt-ed-hint' }, t('editorWindowHint')),
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
        h(Section, { label: t('editorTitle') },
          h('input', {
            value: draft.title,
            placeholder: t('editorTitlePh'),
            onChange: (event: { target: { value: string } }) => { patch({ title: event.target.value }) },
            'aria-label': t('editorTitle'),
            className: 'dsh-tdt-ed-input',
            style: { width: '100%' },
          }),
        ),
        h(Section, { label: t('editorCode') },
          h('input', {
            value: draft.code,
            placeholder: t('editorCodePh'),
            onChange: (event: { target: { value: string } }) => { patch({ code: event.target.value }) },
            'aria-label': t('editorCode'),
            className: 'dsh-tdt-ed-input',
            style: { width: '100%' },
          }),
        ),
        h(Section, { label: undefined }, promptCard),
        h('div', { style: { height: '16px' } }),
        h(Section, { label: undefined }, scheduleCard),
        h('div', { style: { height: '16px' } }),
        depsBlock,
        advancedBlock,
      )

  return h('div', {
    className: 'dsh-tdt-ed-overlay',
    onPointerDown: (event: { target: unknown; currentTarget: unknown }) => {
      if (event.target === event.currentTarget) onClose()
    },
  },
    h('div', { className: 'dsh-tdt-ed-panel', style: { width: `${width}px` }, role: 'dialog', 'aria-modal': true, 'aria-label': mode === 'create' ? t('editorNew') : t('editorEdit') },
      h('div', {
        className: 'dsh-tdt-ed-resizer',
        title: t('previewResize'),
        onPointerDown: (event: { clientX: number }) => { startResize({ clientX: event.clientX }) },
      }),
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
            onClick: onClose,
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
        h(Button, { variant: 'outline', size: 'sm', onClick: onClose }, t('editorCancel')),
        h(Button, {
          variant: 'primary',
          size: 'sm',
          onClick: () => {
            if (onSave === undefined) setPendingHint(true)
            else onSave(draft)
          },
        }, t('editorSave')),
      ),
    ),
  )
}
