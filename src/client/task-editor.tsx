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
  IconChevronDownOutlineRegular,
  IconCloseOutlineRegular,
  IconFolderOpenOutlineRegular,
  IconPlusOutlineRegular,
  IconQuestionOutlineRegular,
  MarkdownText,
  CodeBlock,
  Switch,
  Tooltip,
  IconPlanOutlineRegular,
} from '@deepseek-ai/dsh-client-ui-primitives'
import {
  C,
  DateField,
  MarqueeText,
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
import { createPortal } from 'react-dom'
import { ALLOWED_ATTACHMENT_EXT, ATTACHMENT_MAX_BYTES, extOf } from '../attachment-allowlist.js'
import { FileBrowser } from './file-browser'
import type { WorkspaceFilesFace } from './file-preview'
import { ensureToastStyle, FloatingToast } from './toast-css'

/** 与 index.ts 同形的 t 席位（本仓库 client 半侧惯例：无参 t；带占位符的文案走 tTemplate）。 */
type T = (key: LocaleKey) => string

export type { EditorOption }

export type EditorMode = 'create' | 'edit'

/** 服务端历史版本条目（对应 `tasks/<id>/prompt-versions/<时间戳>.md`）。 */
export interface HistoryVersion {
  file: string
  ts: string
  note: string
}
/** 服务端配置快照条目（对应 `tasks/<id>/snapshots/<时间戳>.json`，整份找回用）。 */
export interface HistorySnapshot {
  file: string
  ts: string
}
/** 编辑态历史面板的数据面（新建任务为 null）。 */
export interface EditorHistory {
  versions: HistoryVersion[]
  snapshots: HistorySnapshot[]
}

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
 * 前置任务可选项（= 现有任务表行，真数据）。`workspace` = 该任务定义 `target.workspace`
 * 的工作区 title ⇒ 表单里「先选工作区、再选任务」两级过滤（用户 2026-09-29）。
 * `enabled` = 任务启停开关：**停用（锁住）的任务同样可选**——用户 2026-09-29 拍板：
 * 发布任务只是「暂时不开它」，设置前置不受影响；下拉里显式标「（已停用）」让这件事看得见。
 */
export interface EditorTaskOption {
  id: string
  label: string
  workspace: string
  enabled: boolean
}

/**
 * Agent 权限档位（决策 50，用户 2026-09-29：照宿主新建会话的权限三档 + 默认档）。
 * `default` = 会话默认（沿用宿主新建会话时的权限设置，不额外约束）。
 * ⚠️ 与 src/tasks.ts 的同名类型**两处各写一份**：client bundle 不引 host 模块（构建双轨），
 * 改枚举务必两边同步。
 */
export type PermissionMode = 'default' | 'readOnly' | 'workspace' | 'full'

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
  /** 保留字段（round-trip）：UI 已砍（用户：无意义），JSON 预览与任务定义照旧带 contract.validStatuses。 */
  validStatuses: string
  /** 以 dsh 内置 /goal 开始执行（多轮续跑）；默认开（用户 2026-09-29），派发侧缺省一致。 */
  goalMode: boolean
  /** 多 Agent 协作（决策 49，用户 2026-09-29）：默认关；派发侧缺宿主 Agent Teams 时降级单轮。 */
  agentTeam: boolean
  /** Agent 权限档位（决策 50，用户 2026-09-29）：默认「会话默认」；宿主暂无按任务下发权限的接口，
   *  所选档位经派发消息的约束指令执行。 */
  permission: PermissionMode
  deps: EditorDependency[]
  /**
   * 排期降级（编辑态反解不出结构化形态时）：**保留 JSON 里的原始 cron**，保存时原样写回
   * ⇒ 手改过的 cron 不会被表单悄悄重写（不丢原值）。非空即代表「自定义 cron」态。
   */
  customCron?: string
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
    goalMode: true,
    agentTeam: false,
    permission: 'default',
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
    // 分钟档同样带星期位（用户 2026-09-30：选了生效日就照办，文案也如实带星期）。
    return `*/${step} * * * ${dow}`
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

/** 结构化排期（双写的 `schedule.ui`）：表单控件的原样留档，供下次编辑反解。 */
function structuredOf(draft: TaskEditorDraft): Record<string, unknown> {
  return {
    scheduleKind: draft.scheduleKind,
    periodFreq: draft.periodFreq,
    weekdays: [...draft.weekdays],
    monthDay: draft.monthDay,
    monthMode: draft.monthMode,
    quarterMonth: draft.quarterMonth,
    yearMonth: draft.yearMonth,
    intervalUnit: draft.intervalUnit,
    intervalStep: draft.intervalStep,
    weekStep: draft.weekStep,
  }
}

/**
 * 排期 → 人话（用户 2026-09-30：用户看不懂设置，要直接告诉他「预计什么时候执行」）。
 * 通用方法：吃草稿、吐一句中文执行说明；编辑时实时改、也能给任务列表复用。
 * 文案全部走 locale（含周几 / 月口径），明暗自适应。
 */
function weekdayText(t: T, days: number[]): string {
  if (days.length === 0) return ''
  if (days.length >= 7) return t('editorSchedEveryday')
  return days.map(day => t(WEEKDAY_KEYS[day - 1])).join('、')
}

export function describeSchedule(draft: TaskEditorDraft, t: T): string {
  const time = /^\d{2}:\d{2}$/.test(draft.time) ? draft.time : '09:00'
  const step = Number.parseInt(draft.intervalStep, 10)
  const stepN = Number.isFinite(step) && step > 0 ? step : 0
  const days = [...draft.weekdays].sort((a, b) => a - b)
  const wd = weekdayText(t, days)

  if (draft.scheduleKind === 'interval') {
    if (stepN === 0) return t('editorSchedInvalidStep')
    // 间隔档：参照周期档句式——生效日在前、不加括号：「周一、周三每小时执行一次」。
    const per = draft.intervalUnit === 'minute'
      ? t('editorSchedIntervalMin').replace('{n}', String(stepN))
      : (stepN === 1 ? t('editorSchedHourlyOnce') : t('editorSchedIntervalHour').replace('{n}', String(stepN)))
    return wd === '' ? `${per}${t('editorSchedNoDaySuffix')}` : `${wd}${per}`
  }
  if (draft.periodFreq === 'once') return `${draft.date} ${time} ${t('editorSchedOnce')}`
  switch (draft.periodFreq) {
    case 'daily':
      return `${t('editorSchedDaily')} ${time} ${t('editorSchedRun')}`
    case 'weekly': {
      // 每 N 周（N>1）⇒「每 4 周周一、周二 09:00 执行」；恰好每周 ⇒ 用户举例的「每周一、每周二 …」。
      const wstep = Number.parseInt(draft.weekStep, 10)
      const everyN = Number.isFinite(wstep) && wstep > 1
      if (wd === '') {
        return `${everyN ? t('editorSchedEveryNWeek').replace('{n}', String(wstep)) : t('editorSchedWeekly')} ${time} ${t('editorSchedRun')}${t('editorSchedNoDaySuffix')}`
      }
      // zh：'每周'+'一' ⇒「每周一」；en：'every '+'Mon' ⇒「every Mon」（星期键去掉「周」字后拼前缀）。
      const dayText = everyN
        ? wd
        : days.map(d => `${t('editorSchedWeeklyDayPrefix')}${t(WEEKDAY_KEYS[d - 1]).replace(/^周/, '')}`).join('、')
      return `${everyN ? t('editorSchedEveryNWeek').replace('{n}', String(wstep)) : ''}${dayText} ${time} ${t('editorSchedRun')}`
    }
    case 'monthly':
      return `${t(`editorMonthMode_${draft.monthMode}`)}${draft.monthDay} 日 ${time} ${t('editorSchedRun')}`
    case 'quarterly':
      return `${t('editorSchedQuarterly').replace('{n}', draft.quarterMonth)} ${draft.monthDay} 日 ${time} ${t('editorSchedRun')}`
    case 'yearly':
      return `${t('editorMonthMode_every')}${draft.yearMonth} 月 ${draft.monthDay} 日 ${time} ${t('editorSchedRun')}`
  }
}

/**
 * 草稿 → 任务定义 JSON（保存 / 预览同源）。
 * 排期**双写**（data-model §5.4）：`cron`/`once`/`start`/`everyNWeeks` 是执行真源，
 * `schedule.ui` 是编辑态反解真源；两者都由**表单**产出 ⇒ 保存以表单为准重写 cron
 * （用户手改坏了 JSON 里的 cron，保存时被覆盖，不会留个坏 cron 在库里）。
 *
 * ⚠️ 间隔档（每隔 N 分钟 / 小时）**必须产出 cron**——此前漏了 ⇒ 任务保存后
 * `scheduledSlotsFor` 取不到 cron、永不执行（评审 P2 / C1）。
 */
export function draftToDefinitionJson(draft: TaskEditorDraft): string {
  const schedule: Record<string, unknown> = { window: draft.window }
  const customCron = draft.customCron !== undefined ? draft.customCron.trim() : ''
  if (customCron !== '') {
    // 自定义 cron 降级态（编辑时反解不出来）：cron **原样写回**，且**不写 schedule.ui / start**——
    // 否则 ui 与 cron 相互矛盾，下次反解会被 ui 带偏、再保存把手写 cron 悄悄覆盖掉（评审 P1#6）。
    schedule.cron = customCron
  } else if (draft.scheduleKind === 'periodic' && draft.periodFreq === 'once') {
    schedule.once = `${draft.date}T${draft.time}`
  } else if (draft.scheduleKind === 'periodic') {
    const cron = scheduleCron(draft)
    if (cron !== null) schedule.cron = cron
    // 「任务开始时间」(date+time) 作为周期锚点：首跑下界 + 每 N 周取模参考（与频率区时刻对齐，避免跨周偏移）。
    schedule.start = `${draft.date}T${draft.time}`
    const step = Number.parseInt(draft.weekStep, 10)
    if (draft.periodFreq === 'weekly' && Number.isFinite(step) && step > 1) schedule.everyNWeeks = step
    schedule.ui = structuredOf(draft)
  } else if (draft.scheduleKind === 'interval') {
    // 间隔档：cron 必须由表单产出（`*/N * * * *` / `0 */N * * <dow>`），否则任务永不执行。
    const cron = scheduleCron(draft)
    if (cron !== null) schedule.cron = cron
    schedule.start = `${draft.date}T${draft.time}`
    schedule.ui = structuredOf(draft)
  }

  const target: Record<string, unknown> = {
    workspace: draft.workspace,
    goal: draft.goalMode,
    agentTeam: draft.agentTeam,
    permission: draft.permission,
  }
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

/** 校验出的问题归属字段（决定哪个框描红）。 */
export type ErrorField = 'title' | 'workspace' | 'prompt' | 'schedule'

/** 一条校验问题：归属字段 + 人话说明（用户 2026-09-30：逐项判断、逐框描红、文案说人话不啰嗦但讲清后果）。 */
export interface FieldProblem {
  field: ErrorField
  message: string
}

/**
 * 保存前的客户端校验（用户 2026-09-30：别把宿主那串机器码「任务定义不合法（target.workspace: Too small…）」
 * 直接甩给用户——先在本地把必填项 / 排期冲突查清楚、用人话列出来）。空数组 = 可保存。
 *
 * 必填判定严格对齐宿主 zod schema（src/tasks.ts）：`target.workspace` 与 `target.prompt` 都是 `.min(1)`，
 * 二者空了保存必被拒。`title` 在 schema 里是可选（空则回退 id）⇒ 不强制；提示词在「按任务手册」模式下由
 * `manual` 兜底默认句 ⇒ 也不空。排期则对齐 `scheduleCron`：每周没勾星期 / 间隔步长非法都产不出 cron ⇒ 永不执行。
 */
export function validateTaskDraft(draft: TaskEditorDraft): FieldProblem[] {
  const problems: FieldProblem[] = []
  // ⓪ 必填：任务名称（用户 2026-09-30 明确要求：列表里要靠名字认任务，不能空着保存）。
  if (draft.title.trim() === '') {
    problems.push({ field: 'title', message: '还没填任务名称——任务列表里靠它认任务，请给任务起个名字。' })
  }
  // ① 必填：工作区（target.workspace .min(1)）。
  if (draft.workspace.trim() === '') {
    problems.push({ field: 'workspace', message: '还没选工作区——任务必须挂在某个工作区下才能执行，请在上方下拉里选一个。' })
  }
  // ② 必填：提示词（target.prompt .min(1)）；「按任务手册」模式由 manual 兜底，不在此查。
  if (draft.promptSource !== 'manual' && draft.prompt.trim() === '') {
    problems.push({ field: 'prompt', message: '还没写提示词——这是告诉 Agent 要做什么的指令，不能为空，请填写具体内容。' })
  }
  // ③ 排期冲突：产不出 cron 的组合（每周没勾星期 / 间隔步长非法）⇒ 任务永不执行。
  const step = Number.parseInt(draft.intervalStep, 10)
  if (draft.scheduleKind === 'interval' && (!Number.isFinite(step) || step <= 0)) {
    problems.push({ field: 'schedule', message: '执行间隔没填或填错——「每隔 N 分钟/小时」里的 N 必须是大于 0 的整数（比如 1 或 2）。' })
  } else if (draft.scheduleKind === 'periodic' && draft.periodFreq === 'weekly' && draft.weekdays.length === 0) {
    problems.push({ field: 'schedule', message: '每周执行但没勾选任何星期——请至少勾选一天，否则任务永远不会跑。' })
  }
  return problems
}

/**
 * 把宿主返回的机器码错误翻成人话（保底用：客户端校验已拦掉绝大多数必填问题，这里只兜底漏网的）。
 * 命中已知 zod 片段就翻译，否则原样返回（前缀「任务定义不合法（…）」尽量保留上下文）。
 */
export function humanizeTaskError(raw: string): string {
  if (raw.includes('target.workspace') && raw.toLowerCase().includes('too small')) {
    return '工作区不能为空，请先选择工作区'
  }
  if (raw.includes('target.prompt') && raw.toLowerCase().includes('too small')) {
    return '提示词不能为空，请先填写提示词'
  }
  if (raw.includes('.title') && raw.toLowerCase().includes('too small')) {
    return '任务名称不能为空'
  }
  return raw
}

// ─────────────────────── 定义 → 草稿（编辑态反解，P1） ───────────────────────

/** 附件 / 草稿条目的本地 id（反解时补上定义里缺失的 id）。 */
function newAttachmentId(): string {
  return typeof crypto !== 'undefined' && crypto.randomUUID !== undefined
    ? crypto.randomUUID()
    : `a-${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`
}

/** cron 星期位 → ISO 序号（cron 0 = 周日 ⇒ 7）。 */
function isoDow(day: number): number {
  return day === 0 ? 7 : day
}

/** 五段 cron → 结构化排期；表达不了的组合返回 null（调用方降级为「自定义 cron」，不丢原值）。 */
function scheduleFromCron(cron: string): Partial<TaskEditorDraft> | null {
  const parts = cron.trim().split(/\s+/)
  if (parts.length !== 5) return null
  const minute = parts[0] ?? ''
  const hour = parts[1] ?? ''
  const dom = parts[2] ?? ''
  const mon = parts[3] ?? ''
  const dow = parts[4] ?? ''
  const hh = /^\d{1,2}$/.test(hour) ? hour.padStart(2, '0') : null
  const mm = /^\d{1,2}$/.test(minute) ? minute.padStart(2, '0') : null
  const time = hh !== null && mm !== null ? `${hh}:${mm}` : null

  // 间隔档：每隔 N 分钟 / 每小时
  if (minute.startsWith('*/') && hour === '*' && dom === '*' && mon === '*' && dow === '*') {
    const step = minute.slice(2)
    if (!/^\d+$/.test(step) || Number(step) <= 0) return null
    return { scheduleKind: 'interval', intervalUnit: 'minute', intervalStep: step, ...(time === null ? {} : { time }) }
  }
  if (hour.startsWith('*/') && dom === '*' && mon === '*') {
    const step = hour.slice(2)
    if (!/^\d+$/.test(step) || Number(step) <= 0) return null
    const weekdays = dow === '*'
      ? [1, 2, 3, 4, 5, 6, 7]
      : dow.split(',').map(Number).filter(n => Number.isFinite(n)).map(isoDow)
    if (weekdays.length === 0) return null
    return { scheduleKind: 'interval', intervalUnit: 'hour', intervalStep: step, weekdays, ...(time === null ? {} : { time }) }
  }
  if (time === null || dow !== '*' && dom !== '*') {
    // DOM 与 DOW 同时指定 = cron 的 OR 语义，表单表达不了 ⇒ 降级
    if (dom !== '*' && dow !== '*') return null
    if (time === null) return null
  }
  if (dom === '*' && mon === '*' && dow === '*') return { scheduleKind: 'periodic', periodFreq: 'daily', time }
  if (dom === '*' && mon === '*' && dow !== '*') {
    const weekdays = dow.split(',').map(Number).filter(n => Number.isFinite(n)).map(isoDow)
    if (weekdays.length === 0) return null
    return { scheduleKind: 'periodic', periodFreq: 'weekly', weekdays, time }
  }
  if (!/^\d{1,2}$/.test(dom)) return null
  if (mon === '*') return { scheduleKind: 'periodic', periodFreq: 'monthly', monthDay: dom, monthMode: 'every', time }
  const months = mon.split(',').map(Number).filter(n => Number.isFinite(n))
  if (months.length === 1) {
    return { scheduleKind: 'periodic', periodFreq: 'yearly', yearMonth: String(months[0] ?? 1), monthDay: dom, time }
  }
  if (months.length === 4 && months.every((m, i) => i === 0 || m - (months[i - 1] ?? 0) === 3)) {
    return {
      scheduleKind: 'periodic', periodFreq: 'quarterly',
      quarterMonth: String((((months[0] ?? 1) - 1) % 3) + 1), monthDay: dom, time,
    }
  }
  if (months.length === 6) {
    const odd = [1, 3, 5, 7, 9, 11]
    const even = [2, 4, 6, 8, 10, 12]
    const mode = months.every((m, i) => m === odd[i]) ? 'odd' : months.every((m, i) => m === even[i]) ? 'even' : null
    if (mode !== null) return { scheduleKind: 'periodic', periodFreq: 'monthly', monthDay: dom, monthMode: mode, time }
  }
  return null
}

/**
 * 任务定义 → 表单草稿（编辑现有任务用）。
 * 排期反解优先级：`schedule.ui`（双写的结构化留档）> cron 尽力反解 > **自定义 cron 降级**
 * （保留原串，保存时原样写回 ⇒ 手改过的 cron 不会被悄悄重写）。
 */
export function definitionToDraft(definition: Record<string, unknown>): TaskEditorDraft {
  const base = emptyTaskDraft()
  const target = (definition.target ?? {}) as Record<string, unknown>
  const schedule = (definition.schedule ?? {}) as Record<string, unknown>
  const retry = (definition.retry ?? {}) as Record<string, unknown>
  const contract = (definition.contract ?? {}) as Record<string, unknown>

  const model = typeof target.provider === 'string' && typeof target.model === 'string'
    ? `${target.provider}/${target.model}`
    : typeof target.model === 'string' ? target.model : ''

  const draft: TaskEditorDraft = {
    ...base,
    title: typeof definition.title === 'string' ? definition.title : '',
    code: typeof definition.code === 'string' ? definition.code : '',
    enabled: definition.enabled !== false,
    prompt: typeof target.prompt === 'string' ? target.prompt : '',
    workspace: typeof target.workspace === 'string' ? target.workspace : '',
    model,
    permission: (typeof target.permission === 'string' ? target.permission : 'default') as PermissionMode,
    goalMode: target.goal !== false,
    agentTeam: target.agentTeam === true,
    window: typeof schedule.window === 'string' ? schedule.window : base.window,
    maxAttempts: String(typeof retry.maxAttempts === 'number' ? retry.maxAttempts : 1),
    validStatuses: Array.isArray(contract.validStatuses)
      ? contract.validStatuses.filter((item): item is string => typeof item === 'string').join(',')
      : 'ok',
    deps: Array.isArray(definition.depends_on)
      ? definition.depends_on
        .filter((item): item is { task: string; semantics: DepSemantics } => (
          item !== null && typeof item === 'object'
          && typeof (item as { task?: unknown }).task === 'string'
          && ((item as { semantics?: unknown }).semantics === 'same_period'
            || (item as { semantics?: unknown }).semantics === 'latest_success')
        ))
        .map(item => ({ task: item.task, semantics: item.semantics }))
      : [],
    attachments: Array.isArray(definition.attachments)
      ? definition.attachments
        .filter((item): item is Attachment => (
          item !== null && typeof item === 'object'
          && typeof (item as { name?: unknown }).name === 'string'
          && typeof (item as { ref?: unknown }).ref === 'string'
          && ((item as { kind?: unknown }).kind === 'link' || (item as { kind?: unknown }).kind === 'upload')
        ))
        .map(item => ({
          id: typeof (item as { id?: unknown }).id === 'string' ? (item as { id: string }).id : newAttachmentId(),
          name: item.name, kind: item.kind, ref: item.ref,
          ...(typeof (item as { workspace?: unknown }).workspace === 'string'
            ? { workspace: (item as { workspace: string }).workspace } : {}),
        }))
      : [],
    versions: [],
  }

  const start = typeof schedule.start === 'string' ? schedule.start : ''
  const once = typeof schedule.once === 'string' ? schedule.once : ''
  if (start.length >= 16) {
    draft.date = start.slice(0, 10)
    if (once === '') draft.time = start.slice(11, 16)
  }
  if (once !== '') {
    draft.scheduleKind = 'periodic'
    draft.periodFreq = 'once'
    draft.date = once.slice(0, 10)
    draft.time = once.slice(11, 16)
  } else {
    const ui = (typeof schedule.ui === 'object' && schedule.ui !== null ? schedule.ui : {}) as Record<string, unknown>
    if (Object.keys(ui).length > 0) {
      if (ui.scheduleKind === 'interval' || ui.scheduleKind === 'periodic') draft.scheduleKind = ui.scheduleKind as ScheduleKind
      if (typeof ui.periodFreq === 'string') draft.periodFreq = ui.periodFreq as PeriodFreq
      if (Array.isArray(ui.weekdays)) draft.weekdays = ui.weekdays.filter((n): n is number => typeof n === 'number')
      if (typeof ui.monthDay === 'string') draft.monthDay = ui.monthDay
      if (ui.monthMode === 'every' || ui.monthMode === 'odd' || ui.monthMode === 'even') draft.monthMode = ui.monthMode
      if (typeof ui.quarterMonth === 'string') draft.quarterMonth = ui.quarterMonth
      if (typeof ui.yearMonth === 'string') draft.yearMonth = ui.yearMonth
      if (ui.intervalUnit === 'minute' || ui.intervalUnit === 'hour') draft.intervalUnit = ui.intervalUnit
      if (typeof ui.intervalStep === 'string') draft.intervalStep = ui.intervalStep
      if (typeof ui.weekStep === 'string') draft.weekStep = ui.weekStep
    } else {
      const cron = typeof schedule.cron === 'string' ? schedule.cron : ''
      const parsed = cron === '' ? null : scheduleFromCron(cron)
      if (parsed !== null) Object.assign(draft, parsed)
      else if (cron !== '') draft.customCron = cron
    }
  }
  const everyNWeeks = typeof schedule.everyNWeeks === 'number' ? schedule.everyNWeeks : undefined
  if (everyNWeeks !== undefined && everyNWeeks > 1) draft.weekStep = String(everyNWeeks)
  return draft
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
  /** 校验不通过：描红边（明暗自适应，与卡片 / 下拉同源）。 */
  error?: boolean
}): ReactElement {
  return h('div', { className: `dsh-tdt-ed-pfx${props.error === true ? ' dsh-tdt-ed-pfx--error' : ''}` },
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
  /** 服务端真历史（`tasks/<id>/prompt-versions` 与 `snapshots`）；新建态为 null。 */
  history: EditorHistory | null
  onChange: (value: string) => void
  onClose: () => void
  /** 只找回提示词（把该版本内容填进编辑器）。 */
  onRestoreVersion: (file: string) => void
  /** 删除某个版本（用户自己删；系统从不自动删）。 */
  onDeleteVersion: (file: string) => void
}): ReactNode {
  const { t, mode: editorMode, value, history, onChange, onClose, onRestoreVersion, onDeleteVersion } = props
  // 编辑器扩展固定引用：markdown 高亮 + 软折行（长行自动换行，宽度失控/横向滚动的根源在此）。
  const cmExtensions = useMemo(() => [markdown(), EditorView.lineWrapping], [])
  const [mode, setMode] = useState<'edit' | 'preview'>('edit')
  const [showVersions, setShowVersions] = useState(false)
  const versions = history?.versions ?? []
  const [hoveredId, setHoveredId] = useState<string | null>(null)
  const [confirmDeleteFile, setConfirmDeleteFile] = useState<string | null>(null)
  const [confirmUseFile, setConfirmUseFile] = useState<string | null>(null)

  const versionTitle = editorMode === 'create' ? t('editorHistoryVersions') : t('editorVersions')

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
        h('button', {
          type: 'button',
          className: `dsh-tdt-ed-histtoggle${showVersions ? ' dsh-tdt-ed-histtoggle--on' : ''}`,
          onClick: () => { setShowVersions(v => !v) },
          'aria-pressed': showVersions,
        }, h('span', { className: 'dsh-tdt-ed-histtoggle-seg' }, t('editorVersionToggle'))),
        h(Button, { variant: 'ghost', size: 'sm', onClick: onClose }, t('editorClose')),
      ),
    ),
    // minWidth:0 ⇒ 编辑态长内容时编辑器自行横向滚动，固定 232px 的版本面板不再被挤掉。
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
        // 面板缩窄（用户 2026-09-30：固定 280 太占地方）= 232px：够放日期 + hover 两个小钮，左栏多让 48px。
        ? h('div', { style: { flex: '0 0 232px', borderLeft: `1px solid ${C.borderL4}`, display: 'flex', flexDirection: 'column', minHeight: 0 } },
            h('div', { style: { padding: '10px 12px', borderBottom: `1px solid ${C.borderL4}`, fontSize: '13px', fontWeight: 600 } }, versionTitle),
            editorMode === 'create'
              ? h('div', { style: { padding: '16px 12px', fontSize: '12px', color: C.textDim, lineHeight: '1.6' } }, t('editorNewTaskNoVersions'))
              : h('div', { style: { display: 'flex', flexDirection: 'column', minHeight: 0, overflow: 'auto' } },
                versions.length === 0
                  ? h('p', { style: { padding: '0 12px', fontSize: '12px', color: C.textDim } }, t('editorNoVersions'))
                  : h('ul', { style: { listStyle: 'none', margin: 0, padding: '0 0 8px', overflow: 'auto' } },
                    versions.map(v => h('li', {
                      key: v.file,
                      className: 'dsh-tdt-ed-ver',
                      onMouseEnter: () => { setHoveredId(v.file) },
                      onMouseLeave: () => { setHoveredId(cur => (cur === v.file ? null : cur)) },
                    },
                      // 行首小尖括号（用户 2026-09-30：弃时钟，用右指小角标）。
                      h('span', { className: 'dsh-tdt-ed-ver-ic', style: { transform: 'rotate(-90deg)' } },
                        h(IconChevronDownOutlineRegular, { size: 12 })),
                      // 左边 = **版本日期**（用户点名：左边正常显示日期，别挪去右边）；有备注补一行小字。
                      h('span', { className: 'dsh-tdt-ed-ver-main' },
                        h(MarqueeText, { text: formatVersionTime(v.ts) }),
                        v.note !== '' ? h('span', { className: 'dsh-tdt-ed-ver-note' }, v.note) : null,
                      ),
                      // 右侧固定槽（宽高恒定 ⇒ hover 出按钮绝不撑高行高）：常态空，hover 出「使用 / ×」。
                      h('span', { className: 'dsh-tdt-ed-ver-right' },
                        hoveredId === v.file
                          ? h('span', { className: 'dsh-tdt-ed-ver-actions' },
                            h('button', { type: 'button', className: 'dsh-tdt-ed-ver-use', onClick: () => { setConfirmUseFile(v.file) } }, t('editorUseShort')),
                            h('button', { type: 'button', className: 'dsh-tdt-ed-ver-del', title: t('editorDeleteVersion'), 'aria-label': t('editorDeleteVersion'), onClick: () => { setConfirmDeleteFile(v.file) } },
                              h(IconCloseOutlineRegular, { size: 12 })),
                          )
                          : null,
                      ),
                    )),
                  ),
              ),
          )
        : null,
    ),
    // 三处确认一律严厉措辞：找回前必须让用户知道「会用历史版本覆盖现有修改的所有数据」。
    confirmDeleteFile !== null
      ? h(VersionConfirm, {
        t,
        title: t('editorConfirmDeleteTitle'),
        desc: t('editorConfirmDeleteDesc'),
        onCancel: () => { setConfirmDeleteFile(null) },
        onConfirm: () => { onDeleteVersion(confirmDeleteFile); setConfirmDeleteFile(null) },
      })
      : null,
    confirmUseFile !== null
      ? h(VersionConfirm, {
        t,
        title: t('editorRestorePromptTitle'),
        desc: t('editorRestorePromptDesc'),
        confirmLabel: t('editorUseVersion'),
        onCancel: () => { setConfirmUseFile(null) },
        onConfirm: () => { onRestoreVersion(confirmUseFile); setConfirmUseFile(null) },
      })
      : null,
  )
}

/**
 * 配置预览面板（用户 2026-09-29 定稿）：与「编辑提示词」一样大的右侧面板，覆盖拉篮区域；
 * 只读展示当前配置生成的任务定义 JSON——官方 CodeBlock（Shiki：行号 + 语法着色 + 自带复制），
 * 面板按钮只有「关闭」（复制由 CodeBlock 工具条承担），不允许修改。
 */
function ConfigPreviewPanel(props: { t: T; json: string; onClose: () => void }): ReactNode {
  const { t, json, onClose } = props
  return h('div', { style: { display: 'flex', flexDirection: 'column', flex: '1 1 auto', minHeight: 0, background: 'var(--dsw-alias-bg-base, #22252a)', color: C.text, overflow: 'hidden', position: 'relative' } },
    h('div', { style: { display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '12px', padding: '10px 14px', borderBottom: `1px solid ${C.borderL2}` } },
      h('span', { style: { fontSize: '14px', fontWeight: 600 } }, t('editorPreview')),
      h(Button, { variant: 'ghost', size: 'sm', onClick: onClose }, t('editorClose')),
    ),
    h('div', { style: { flex: '1 1 auto', minWidth: 0, overflow: 'auto', padding: '14px 18px' } },
      h(CodeBlock, {
        code: json,
        lang: 'json',
        lineNumbers: true,
        copyLabel: t('copyLabel'),
        copiedLabel: t('copiedLabel'),
        toolbarLabels: {
          codeLabel: t('codeBlockLabel'),
          wrapLabel: t('diffWrapLabel'),
          unwrapLabel: t('diffUnwrapLabel'),
        },
      }),
    ),
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
  /** 可选的前置任务（= 现有任务表，真数据，带所属工作区）。 */
  tasks: EditorTaskOption[]
  /** 当前正在编辑的任务 id（编辑态有；新建态无）。用于在前置列表里**排除自己**（防止自我依赖）。 */
  currentTaskId?: string
  onClose: () => void
  /** 保存回调（新增 / 修改都走它）。未接时点「保存」只提示待接。 */
  onSave?: ((draft: TaskEditorDraft) => void) | undefined
  /** 删除任务（仅编辑态有按钮）；未接时不显示按钮。 */
  onDelete?: (() => void) | undefined
  /** 保存失败原因（服务端文案），由外部回传展示。 */
  saveError?: string | null
  /** 服务端历史（版本 + 快照）；编辑态由外部拉取后传入。 */
  history?: EditorHistory | null
  /** 只找回提示词（外部取内容后回填表单）。 */
  onRestoreVersion?: ((file: string) => void) | undefined
  /** 删除某个历史版本。 */
  onDeleteVersion?: ((file: string) => void) | undefined
  /** 启用开关实时写回（编辑态）：null = 成功，否则返回人话错误。新建态不接（统一保存时建）。 */
  onToggleEnabled?: ((enabled: boolean) => Promise<string | null>) | undefined
  /** 工作区文件服务（选择工作区文件用；未就位为 null ⇒ 选择器不可用）。 */
  workspaceFiles?: WorkspaceFilesFace | null
  /**
   * 工作区 title → 锚点会话 id（GET /options 下发：该工作区最近一个会话，官方 entity.sessionIds 末位）。
   * remote.workspaceFiles 的 list 以 sessionId 解析工作区根（0.2.0-rc.1 仍如此，源码已核实）⇒
   * 浏览某工作区必须有属于它的会话当锚点；没有锚点的工作区官方无浏览入口（不造假会话）。
   */
  workspaceAnchors?: Record<string, string>
}): ReactElement {
  const {
    t, mode, draft, onChange, workspaces, models, tasks, onClose, onSave, onDelete, saveError,
    history, onRestoreVersion, onDeleteVersion, onToggleEnabled, workspaceFiles, workspaceAnchors,
    currentTaskId,
  } = props
  const [width, setWidth] = useState<number>(readWidth)
  const [tab, setTab] = useState<'basic' | 'records'>('basic')
  const [advancedOpen, setAdvancedOpen] = useState(false)
  const [jsonOpen, setJsonOpen] = useState(false)
  const [editorOpen, setEditorOpen] = useState(false)
  const [previewOpen, setPreviewOpen] = useState(false)
  const [pendingHint, setPendingHint] = useState(0) // >0 = Toast seq（「预览态不可保存」中性提示）
  const [confirmDeleteTask, setConfirmDeleteTask] = useState(false)
  const [confirmReset, setConfirmReset] = useState(false)
  const [resetHint, setResetHint] = useState(0) // >0 = Toast seq（「已恢复为打开时的内容」中性提示）
  const hintSeq = useRef(0)
  // 保存失败：服务端文案不「长显」占 footer，改为浮现 Toast（用户 2026-09-30：与面板保存提示同款）。
  // 用本地副本 + 自增 seq，使得同一句错误连点也能重播淡入淡出动画。
  const [saveErrToast, setSaveErrToast] = useState<{ msg: string; seq: number } | null>(null)
  const saveErrSeq = useRef(0)
  useEffect(() => {
    if (saveError === null || saveError === undefined) return
    saveErrSeq.current += 1
    setSaveErrToast({ msg: saveError, seq: saveErrSeq.current })
  }, [saveError])
  // 保存前的客户端校验总览（用户 2026-09-30：点保存才判定；判定后问题逐项列出、对应框描红，随用户修正实时消退）。
  const [showErrors, setShowErrors] = useState(false)
  const fieldProblems = showErrors ? validateTaskDraft(draft) : []
  const fieldErrorMap: Record<string, string> = {}
  for (const p of fieldProblems) if (!(p.field in fieldErrorMap)) fieldErrorMap[p.field] = p.message
  const problemsByField = (field: ErrorField): boolean => field in fieldErrorMap
  // 校验提示 Toast：**与判断逻辑解耦**（用户 2026-09-30）——红框是持续态（改好才退），
  // 文字提示是一次性的：点保存弹一次、统一 2.8s 自退，全部问题拼成一句（红框负责逐项指位）。
  const [problemsToast, setProblemsToast] = useState<{ text: string; seq: number } | null>(null)
  const problemsSeq = useRef(0)
  // 启用开关 = 独立操作（用户 2026-09-30）：编辑态点击即写回（不走保存链路），成败都弹 Toast；
  // 新建态只改草稿（统一保存时建）。写回成功后同步脏判定基线 ⇒ 关弹窗不会被误问「放弃更改」。
  const [enabledToast, setEnabledToast] = useState<{ msg: string; err: boolean; seq: number } | null>(null)
  const enabledSeq = useRef(0)
  const handleToggleEnabled = (next: boolean): void => {
    patch({ enabled: next })
    if (mode !== 'edit' || currentTaskId === undefined || currentTaskId === '' || onToggleEnabled === undefined) return
    void onToggleEnabled(next).then(error => {
      if (error !== null) {
        patch({ enabled: !next }) // 写回失败：开关回弹，草稿与真值保持一致
        enabledSeq.current += 1
        setEnabledToast({ msg: error, err: true, seq: enabledSeq.current })
        return
      }
      initialDraftRef.current = { ...initialDraftRef.current, enabled: next }
      enabledSeq.current += 1
      setEnabledToast({ msg: next ? t('editorToggleOn') : t('editorToggleOff'), err: false, seq: enabledSeq.current })
    })
  }
  // 「已重置」提示自退交给 FloatingToast 动画（onDone），不再用定时器（统一 2.8s 时间线）。
  // 附加文件：选择器 / 上传交互状态（2026-09-29 本轮新增）。
  const [pickerOpen, setPickerOpen] = useState(false)
  const [uploading, setUploading] = useState(false)
  // 选择器可浏览任意有历史会话的工作区（用户 2026-09-29 放开「必须先选任务工作区」）：
  // pickerWs = 当前浏览的工作区 title，打开时默认任务已选工作区（没有就取第一个有锚点的）。
  const [pickerWs, setPickerWs] = useState('')
  // 选择器浮层：锚定「工作区文件」方按钮（在其左侧展开、下缘齐平），不用全屏弹窗（用户 2026-09-29）。
  const pickerAnchorRef = useRef<HTMLButtonElement | null>(null)
  const pickerPanelRef = useRef<HTMLDivElement | null>(null)
  // Esc 先关浮层（preventDefault ⇒ 抽屉的 window Esc 让路，同 DateField 惯例）。
  useEffect(() => {
    if (!pickerOpen) return
    const onKeyDown = (event: KeyboardEvent): void => {
      if (event.key !== 'Escape') return
      event.preventDefault()
      setPickerOpen(false)
    }
    document.addEventListener('keydown', onKeyDown)
    return () => { document.removeEventListener('keydown', onKeyDown) }
  }, [pickerOpen])
  // 点外关闭（自实现，不用官方 useDismissOnOutsidePointer）：浮层头部的工作区下拉是
  // portal 到 body 的官方 Menu，点菜单项会被误判「点外」把整个浮层关掉 —— 这里豁免
  // 官方菜单面（role / class 双保险）再关。
  useEffect(() => {
    if (!pickerOpen) return
    const onPointerDown = (event: PointerEvent): void => {
      const target = event.target
      if (!(target instanceof Element)) return
      if (pickerPanelRef.current?.contains(target) === true) return
      if (pickerAnchorRef.current?.contains(target) === true) return
      if (target.closest('[role="menu"], [role="menuitem"], [class*="menusurface" i], [class*="menuitem" i]') !== null) return
      setPickerOpen(false)
    }
    document.addEventListener('pointerdown', onPointerDown, true)
    return () => { document.removeEventListener('pointerdown', onPointerDown, true) }
  }, [pickerOpen])
  // 上传失败的机器码（file-type-not-allowed / payload-too-large / …），渲染时映射成具体文案。
  // 呈现为浮层 Toast（与保存失败同款），动画结束 onAnimationEnd 自退，不占卡内版面。
  const [uploadError, setUploadError] = useState<string | null>(null)
  // 脏判定 + 关闭确认（用户 2026-09-29：点 ✕ / 点遮罩空白 / Esc / 取消，只要改过就先确认再关）。
  const [confirmDiscard, setConfirmDiscard] = useState(false)
  // 原始快照：挂载那一刻定死。弹窗关闭即卸载、重开即重挂 ⇒ 每次打开都从当次初始值算起；
  // 「改成 2 又改回 1」序列化结果与快照一致 ⇒ 不算改过。
  const initialDraftRef = useRef(draft)
  const dirty = stableStringify(draft) !== stableStringify(initialDraftRef.current)

  // 全屏面板（提示词编辑 / 配置预览）滚动位置保持（用户 2026-09-29 bug）：面板打开 = 表单整体
  // 换挂载（同一容器二选一渲染），关闭重挂后 scrollTop 归零——打开前把滚动位置存下来，
  // 回到表单后（重挂提交完成）在 effect 里原样恢复。
  const bodyRef = useRef<HTMLDivElement | null>(null)
  const savedScrollRef = useRef(0)
  const openEditorPanel = useCallback((): void => {
    savedScrollRef.current = bodyRef.current?.scrollTop ?? 0
    setEditorOpen(true)
  }, [])
  const openPreviewPanel = useCallback((): void => {
    savedScrollRef.current = bodyRef.current?.scrollTop ?? 0
    setPreviewOpen(true)
  }, [])
  useEffect(() => {
    if (!editorOpen && !previewOpen && bodyRef.current !== null) {
      bodyRef.current.scrollTop = savedScrollRef.current
    }
  }, [editorOpen, previewOpen])

  useEffect(() => { ensureTaskEditorStyle(); ensureToastStyle() }, [])

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

  // 权限档位（决策 50，用户 2026-09-29：照宿主新建会话的权限选择）——默认档 = 会话默认
  // （沿用宿主新建会话的权限设置，我们不加约束）。宿主 0.2.0-rc.2 的 AgentOptions 只有
  // provider / model / reasoningEffort / maxTokens，**没有按任务下发权限的参数** ⇒ 所选档位
  // 经派发消息的约束指令执行（真实行为，非系统级拦截），说明文案已如实写明。
  const permissionOptions: EditorOption[] = [
    { value: 'default', label: t('editorPermDefault') },
    { value: 'readOnly', label: t('editorPermReadOnly') },
    { value: 'workspace', label: t('editorPermWorkspace') },
    { value: 'full', label: t('editorPermFull') },
  ]

  // ① 提示词卡（主视觉）：提示词一律手输（版本管理由插件负责，P 待做）；
  // 选文件 / 上传不再属于提示词，挪到下方独立的「附加文件」框（决策：提示词只手输）。
  const promptCard = h('div', { className: 'dsh-tdt-ed-card' },
    h('div', { className: 'dsh-tdt-ed-card-head' },
      h('div', { className: 'dsh-tdt-ed-label' }, t('editorPrompt')),
      h(Button, { variant: 'ghost', size: 'sm', title: t('editorOpenEditor'), 'aria-label': t('editorOpenEditor'), onClick: openEditorPanel }, t('editorOpenEditor')),
    ),
    h('textarea', {
      id: 'dsh-tdt-ed-source-inline-panel',
      className: `dsh-tdt-ed-prompt${problemsByField('prompt') ? ' dsh-tdt-ed-prompt--error' : ''}`,
      value: draft.prompt,
      placeholder: t('editorPromptPh'),
      spellCheck: false,
      onChange: (event: { target: { value: string } }) => { patch({ prompt: event.target.value }) },
    }),
    // 底部一行：左 = 工作区（真实工作区列表，P1 接）；工作区右侧 = 权限档位（决策 50）；
    // 右 = 模型（不填 = 默认模型）。
    h('div', { className: 'dsh-tdt-ed-card-foot' },
      h(SelectField, {
        value: draft.workspace,
        options: workspaces,
        onChange: value => { patch({ workspace: value }) },
        placeholder: t('editorWorkspacePh'),
        emptyLabel: t('editorNoOptions'),
        ariaLabel: t('editorWorkspace'),
        error: problemsByField('workspace'),
        icon: h(IconFolderOpenOutlineRegular, { size: 16 }),
        // 超长工作区名不再把整行撑爆：**封顶 200px**，超出即省略号，hover 在图标右侧
        // 自己的盒子里跑马灯（用户 2026-09-29；跑马灯不得压到文件夹图标下）。
        maxWidth: 200,
        marquee: true,
      }),
      // 权限：紧挨工作区（用户 2026-09-29：选完工作区就定权限，两者同一件事的前后脚）。
      h(SelectField, {
        value: draft.permission,
        options: permissionOptions,
        onChange: value => { patch({ permission: value as PermissionMode }) },
        placeholder: t('editorPermDefault'),
        emptyLabel: t('editorNoOptions'),
        ariaLabel: t('editorPermission'),
        title: t('editorPermissionHint'),
        width: '120px',
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
        // ⚠️ 照 editorTaskStartHint 的可用形态：图标必须包在真实 DOM 按钮（.dsh-tdt-ed-help）里
        // 再交给 Tooltip——官方接管 ref/事件需要真元素锚点，裸图标组件 ref 挂不上 ⇒ 悬停无字。
        h(Tooltip, { label: t('editorAttachmentsHint'), side: 'bottom', maxWidth: 300 },
          h('button', { type: 'button', className: 'dsh-tdt-ed-help', 'aria-label': t('editorAttachmentsHint') },
            h(IconQuestionOutlineRegular, { size: 14 }),
          ),
        ),
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
        // 正方形虚线按钮（用户 2026-09-29：与投放区同语言——加号在上、文字在下）。
        h('button', {
          type: 'button',
          ref: pickerAnchorRef,
          'aria-haspopup': 'dialog',
          'aria-expanded': pickerOpen,
          onClick: () => {
            if (pickerOpen) { setPickerOpen(false); return }
            // 默认浏览任务已选工作区；没选就取第一个工作区（用户 2026-09-29：默认最近/第一个都行）。
            setPickerWs(draft.workspace !== '' ? draft.workspace : (workspaces[0]?.value ?? ''))
            setPickerOpen(true)
          },
          style: {
            display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: '6px',
            width: '92px', padding: '8px', border: `1px dashed ${C.borderL4}`, borderRadius: C.radiusMd,
            background: C.layer1, cursor: 'pointer', color: C.text,
          },
        },
          h(IconPlusOutlineRegular, { size: 20 }),
          h('span', { style: { fontSize: '12px', lineHeight: 1.2 } }, t('editorPickWorkspaceFileShort')),
        ),
      ),
    ),
    h('input', {
      ref: fileInputRef,
      type: 'file',
      multiple: true,
      style: { display: 'none' },
      onChange: (event: { target: { files?: FileList } }) => { if (event.target.files !== undefined) void uploadFiles(event.target.files) },
    }),
  )

  // ② 执行频率卡：**单次 / 周期 / 间隔** 三档 + 时区 / 有效期。
  //    「单次」不是第四种排期，它就是「周期档的频率 = 单次」——所以切到单次时把 periodFreq 设成 once，
  //    而在周期档里把频率改成别的，顶部会自动回到「周期」（值是从 periodFreq 推导的，无需额外回写）。
  const scheduleCard = h('div', { className: `dsh-tdt-ed-card${problemsByField('schedule') ? ' dsh-tdt-ed-card--error' : ''}` },
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
    // 「预计执行」人话说明（用户 2026-09-30）：在「任务开始时间」上方画两条**虚线**，中间夹一句实时翻译。
    h('div', { style: { marginTop: '14px' } },
      h('div', { style: { borderTop: `1px dashed ${C.borderL2}`, paddingTop: '10px', fontSize: '12px', lineHeight: '1.6', color: C.textDim } },
        h('span', { style: { color: C.text, fontWeight: 600, marginRight: '4px' } }, t('editorSchedForecast') + '：'),
        describeSchedule(draft, t),
      ),
      h('div', { style: { borderTop: `1px dashed ${C.borderL2}`, marginTop: '10px' } }),
    ),
    // 底部：左 = 任务开始时间（锚点，周期/间隔都有，带 ? 说明），右 = 允许延迟（次要，居右）。
    // 上间距与「预计执行」上边线离「星期」的间距对齐 = 14px（此前 CSS margin12+padding12=24 是两倍）。
    h('div', { className: 'dsh-tdt-ed-schedfoot', style: { display: 'flex', alignItems: 'center', gap: '8px', borderTop: 'none', marginTop: '14px', paddingTop: '0' } },
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

  // ③ 前置任务卡（用户 2026-09-29 多轮拍板，照「附加文件」卡同款灰框 + 同款外距）：
  //  - 停用（锁住）的任务同样可选（快照本就全量下发，无启停过滤）；下拉里标「（已停用）」；
  //  - 布局：上 = 已选前置任务列表（空则显示上传投放区同款虚线占位框）；下 = 工作区→任务→添加；
  //  - 标题「添加前置任务」+「?」Tooltip：含义（强调『所有』）/ 判定方式（所有前置任务上一次
  //    执行必须成功，跳过不算失败）/ 执行时自动移交前置产出文件；
  //  - 选择 = 先工作区后任务两级（工作区下拉只列确实有可选任务的工作区），点「添加」固定成一行，
  //    行内「移除」可删；同一任务不能加两次（选项里直接排除已加的，按钮再拦一道）；
  //  - 支持跨工作区（每个前置任务可来自不同工作区）；加完工作区保留、任务清空，连着加第二个；
  //  - 三段式选择行（用户定稿）：左「工作区」定宽 112px（约 5~6 个字）居左，右「添加」
  //    定宽 88px 居右，中间「任务」flex 吃掉剩余宽度（随抽拉分栏同步伸缩）；
  //  - 语义下拉删除（用户：选「同一天的」没有意义）——判定方式就是「上一次执行必须成功」，
  //    新增依赖固定写 `latest_success`；存量依赖的 semantics 原样保留（编辑无损往返）。
  const addedDepIds = new Set(draft.deps.map(dep => dep.task))
  const depWsOptions: EditorOption[] = []
  for (const task of tasks) {
    if (task.workspace === '' || addedDepIds.has(task.id) || task.id === currentTaskId) continue
    if (!depWsOptions.some(option => option.value === task.workspace)) depWsOptions.push({ value: task.workspace, label: task.workspace })
  }
  // 默认选中：第一个「还有可选任务」的工作区（列表本就按任务表顺序推导）；
  // 全都加满了没有可选任务 ⇒ 退回第一个工作区（用户 2026-09-29）。
  const [depWs, setDepWs] = useState(() => depWsOptions[0]?.value ?? workspaces[0]?.value ?? '')
  const [depTaskId, setDepTaskId] = useState('')
  const depTaskOptions: EditorOption[] = depWs === ''
    ? []
    : tasks.filter(task => task.workspace === depWs && !addedDepIds.has(task.id) && task.id !== currentTaskId)
      .map(task => ({ value: task.id, label: task.enabled === false ? `${task.label}${t('editorDepDisabledTag')}` : task.label }))
  const addDep = (): void => {
    if (depTaskId === '' || addedDepIds.has(depTaskId)) return
    // semantics 固定 latest_success = 「上一次执行必须成功」（用户口述的判定方式）。
    patch({ deps: [...draft.deps, { task: depTaskId, semantics: 'latest_success' }] })
    setDepTaskId('') // 工作区保留，方便连着加同工作区的第二个、第三个。
  }
  const depsBlock = h('div', { className: 'dsh-tdt-ed-card' },
    h('div', { className: 'dsh-tdt-ed-card-head' },
      h('div', { className: 'dsh-tdt-ed-label', style: { display: 'flex', alignItems: 'center', gap: '4px' } },
        t('editorDeps'),
        // 照附加文件卡的可用形态：图标必须包在真实 DOM 按钮（.dsh-tdt-ed-help）里再交给 Tooltip。
        h(Tooltip, { label: t('editorDepsHint'), side: 'bottom', maxWidth: 320 },
          h('button', { type: 'button', className: 'dsh-tdt-ed-help', 'aria-label': t('editorDepsHint') },
            h(IconQuestionOutlineRegular, { size: 14 }),
          ),
        ),
      ),
    ),
    // 上：已选前置任务列表；空 = 上传投放区同款虚线占位框（灰字居中，主行 + 次行提示）。
    h('div', { style: { marginBottom: '10px' } },
      draft.deps.length === 0
        ? h('div', {
            // 空态 = 上传投放区（上方附件卡）同款虚线框，同一组 C.* 常量保证观感一致。
            style: { border: `1px dashed ${C.borderL4}`, borderRadius: C.radiusMd, padding: '16px 12px', textAlign: 'center', background: C.layer1 },
          },
            h('div', { style: { fontSize: '13px' } }, t('editorDepEmpty')),
            h('div', { style: { color: C.textDim, fontSize: '12px', marginTop: '4px' } }, t('editorDepEmptyHint')),
          )
        : h('div', { style: { display: 'flex', flexDirection: 'column', gap: '6px' } },
            draft.deps.filter(dep => dep.task !== currentTaskId).map((dep, index) => {
              const known = tasks.find(task => task.id === dep.task)
              const ws = known?.workspace ?? ''
              return h('div', { key: index, className: 'dsh-tdt-ed-depitem' },
                // 行首只留「有点任务」icon（官方 IconPlanOutlineRegular）——「前置任务：」文字按用户要求删除（太占地方）。
                h('span', { style: { display: 'inline-flex', flex: 'none', color: C.textTertiary } }, h(IconPlanOutlineRegular, { size: 14 })),
                // 任务名吃剩余宽度：超长省略号，hover 跑马灯（MarqueeText，动画只在内层 span 上跑）。
                h(MarqueeText, { text: known?.label ?? dep.task, style: { flex: '1 1 auto', minWidth: 0, fontSize: '13px' } }),
                // 工作区固定宽（72px）+ 省略号 + 跑马灯（跨工作区时分得清是哪个区的任务）。
                ws === '' ? null : h(MarqueeText, { text: ws, style: { flex: '0 0 72px', color: C.textDim, fontSize: '11px' } }),
                // 「移除」宽度固定（flex none），不被任务名挤动。
                h(Button, { variant: 'ghost', size: 'sm', style: { flex: 'none' }, onClick: () => { patch({ deps: draft.deps.filter(d => d.task !== dep.task) }) }, title: t('editorDepRemove'), 'aria-label': t('editorDepRemove') }, t('editorDepRemove')),
              )
            }),
          ),
    ),
    // 下：工作区 → 任务 → 添加（百分比定宽见 .dsh-tdt-ed-deppick-*）。
    h('div', { className: 'dsh-tdt-ed-deppick' },
      h('span', { className: 'dsh-tdt-ed-deppick-ws' },
        h(SelectField, {
          value: depWs,
          options: depWsOptions,
          onChange: value => { setDepWs(value); setDepTaskId('') },
          placeholder: t('editorWorkspacePh'),
          emptyLabel: t('editorDepEmpty'),
          ariaLabel: t('editorWorkspace'),
          icon: h(IconFolderOpenOutlineRegular, { size: 16 }),
          width: '100%',
        }),
      ),
      h('span', { className: 'dsh-tdt-ed-deppick-task' },
        h(SelectField, {
          value: depTaskId,
          options: depTaskOptions,
          onChange: setDepTaskId,
          placeholder: depWs === '' ? t('editorDepPickWsFirst') : t('editorDepTaskPh'),
          emptyLabel: t('editorNoOptions'),
          ariaLabel: t('editorDepTask'),
          disabled: depWs === '',
          width: '100%',
        }),
      ),
      h(Button, {
        variant: 'outline',
        size: 'sm',
        icon: h(IconPlusOutlineRegular, { size: 14 }),
        disabled: depTaskId === '',
        title: depTaskId === '' ? t('editorDepTaskPh') : t('editorDepAdd'),
        onClick: addDep,
        // 三段式右段：定宽、居右（flex 布局里排最后即贴右），文字图标居中。
        // 88 → 72px（用户 2026-09-29：窄一点，把宽度让给中间的任务名）。
        style: { flex: '0 0 72px', height: '32px', justifyContent: 'center' },
      }, t('editorDepAdd')),
    ),
  )

  // ④ 高级设置（用户 2026-09-29 第二轮返工）：收起 = 整卡一条灰、**无内层黑框**——「高级设置」
  //    +「?」说明气泡 + 官方 chevron-down（12px；展开 rotate 180°，照官方 TurnTriggerNodeView
  //    的展开图标）。展开 = 每项「控件一行 + 说明一行」两拍，项与项之间虚线分隔。
  //    重置次数改官方 Segmented 长条（同星期块观感）且标题与控件同一排；配置预览不设标题，
  //    按钮直接叫「配置预览」；新增「多 Agent 协作」开关（决策 49，默认关，派发侧缺宿主组件降级）。
  const retryOptions: EditorOption[] = [
    { value: '1', label: t('editorRetryOnce') },
    { value: '2', label: t('editorRetryTwice') },
    { value: '3', label: t('editorRetryThrice') },
    { value: '5', label: t('editorRetryFive') },
  ]
  const advancedBlock = h('div', { className: 'dsh-tdt-ed-section' },
    h('div', { className: 'dsh-tdt-ed-card' },
      h('button', {
        className: 'dsh-tdt-ed-advhead',
        type: 'button',
        'aria-expanded': advancedOpen,
        onClick: () => { setAdvancedOpen(!advancedOpen) },
      },
        h('span', { className: 'dsh-tdt-ed-label', style: { display: 'inline-flex', alignItems: 'center', gap: '4px' } },
          t('editorAdvanced'),
          // 「?」说明气泡：span 塞进按钮内（button 嵌 button 非法），点击拦截不触发展开。
          h(Tooltip, { label: t('editorAdvancedHelp'), side: 'bottom', maxWidth: 300 },
            h('span', {
              className: 'dsh-tdt-ed-help',
              role: 'img',
              'aria-label': t('editorAdvancedHelp'),
              onClick: (event: { stopPropagation: () => void }) => { event.stopPropagation() },
            }, h(IconQuestionOutlineRegular, { size: 14 })),
          ),
        ),
        h(IconChevronDownOutlineRegular, {
          size: 12,
          className: advancedOpen ? 'dsh-tdt-ed-advchevron-open' : 'dsh-tdt-ed-advchevron',
        }),
      ),
      advancedOpen
        ? h('div', { className: 'dsh-tdt-ed-advbody' },
            // ① 重置次数：四档 Segmented 长条（一次/两次/三次/五次），标题与控件同一排。
            h('div', { className: 'dsh-tdt-ed-advitem' },
              h('div', { className: 'dsh-tdt-ed-row' },
                h('span', { className: 'dsh-tdt-ed-label' }, t('editorRetry')),
                h(Segmented, {
                  id: 'dsh-tdt-ed-retry',
                  value: draft.maxAttempts,
                  options: retryOptions,
                  onChange: (value: string) => { patch({ maxAttempts: value }) },
                  label: t('editorRetry'),
                }),
              ),
              h('p', { className: 'dsh-tdt-ed-hint' }, t('editorRetryHint')),
            ),
            // ② 以 dsh 内置 /goal 开始执行（多轮续跑），默认开；派发侧缺省一致（决策 48）。
            h('div', { className: 'dsh-tdt-ed-advitem' },
              h('div', { className: 'dsh-tdt-ed-row' },
                h(Switch, {
                  checked: draft.goalMode,
                  onChange: (next: boolean) => { patch({ goalMode: next }) },
                  label: t('editorGoal'),
                }),
                h('span', { style: { fontSize: '13px', fontWeight: 600 } }, t('editorGoal')),
              ),
              h('p', { className: 'dsh-tdt-ed-hint' }, t('editorGoalHint')),
            ),
            // ③ 多 Agent 协作（决策 49，用户 2026-09-29），默认关：宿主启用 Agent Teams 时
            //    派发消息注入团队执行指令；未启用自动降级单轮（不阻塞、日志留痕）。
            h('div', { className: 'dsh-tdt-ed-advitem' },
              h('div', { className: 'dsh-tdt-ed-row' },
                h(Switch, {
                  checked: draft.agentTeam,
                  onChange: (next: boolean) => { patch({ agentTeam: next }) },
                  label: t('editorAgentTeam'),
                }),
                h('span', { style: { fontSize: '13px', fontWeight: 600 } }, t('editorAgentTeam')),
              ),
              h('p', { className: 'dsh-tdt-ed-hint' }, t('editorAgentTeamHint')),
            ),
            // ④ 配置预览：右侧展开只读面板（同「编辑提示词」大小），带行号与着色，可复制不可改。
            //    不设标题，按钮直接叫「配置预览」（用户 2026-09-29）。
            h('div', { className: 'dsh-tdt-ed-advitem' },
              h('div', { className: 'dsh-tdt-ed-row' },
                h(Button, { variant: 'outline', size: 'sm', onClick: openPreviewPanel }, t('editorPreview')),
              ),
              h('p', { className: 'dsh-tdt-ed-hint' }, t('editorPreviewHint')),
            ),
          )
        : null,
    ),
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
            error: problemsByField('title'),
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
        // 附件卡：外层 position:relative（兼带 .dsh-tdt-ed-section 的 16px 下间距，避免与「执行频率」卡贴在一起）。
        h('div', { className: 'dsh-tdt-ed-section', style: { position: 'relative' } },
          attachmentsCard,
          uploadError !== null
            ? h(FloatingToast, {
              seq: uploadError,
              tone: 'error',
              onDone: () => { setUploadError(null) },
              text: uploadErrText(uploadError),
            })
            : null,
        ),
        h('div', { className: 'dsh-tdt-ed-section' }, scheduleCard),
        h('div', { className: 'dsh-tdt-ed-section' }, depsBlock),
        advancedBlock,
      )

  // 全屏编辑 = 把整个「新建任务」拉栏的内容换成编辑器（同样的边、同样的宽度、随左缘拖拽一起变宽）；
  // 关闭编辑器即把后面的表单露出来。故编辑器与表单在拉栏内二选一，而不是再做一个居中弹窗。
  const panelInner = editorOpen
    ? h(PromptEditorModal, {
      t,
      mode,
      value: draft.prompt,
      history: history ?? null,
      onChange: (value: string) => { patch({ prompt: value }) },
      onClose: () => { setEditorOpen(false) },
      onRestoreVersion: (file: string) => { onRestoreVersion?.(file); setEditorOpen(false) },
      onDeleteVersion: (file: string) => { onDeleteVersion?.(file) },
    })
    : previewOpen
      ? h(ConfigPreviewPanel, {
        t,
        json: draftToDefinitionJson(draft),
        onClose: () => { setPreviewOpen(false) },
      })
      : h('div', { style: { display: 'flex', flexDirection: 'column', flex: '1 1 auto', minHeight: 0 } },
      // 头部：左侧 = 启用开关（标题左边，**独立操作**：编辑态点击即写回+Toast，不走保存）+ 联动文字 + 标题。
      h('div', { className: 'dsh-tdt-ed-header' },
        h('div', { className: 'dsh-tdt-ed-headleft' },
          h('span', { className: 'dsh-tdt-ed-enable' },
            h(Switch, {
              checked: draft.enabled,
              onChange: handleToggleEnabled,
              label: t('editorEnabled'),
              title: draft.enabled ? t('editorEnabledOn') : t('editorEnabledOff'),
            }),
            h('span', { style: { fontSize: '12px', color: 'var(--dsw-alias-label-secondary,rgba(128,128,128,.95))' } },
              draft.enabled ? t('editorEnabledStateOn') : t('editorEnabledStateOff')),
          ),
          h('div', { className: 'dsh-tdt-ed-title' }, mode === 'create' ? t('editorNew') : t('editorEdit')),
        ),
        h('div', { className: 'dsh-tdt-ed-headactions' },
          // 启用开关写回结果 Toast（共用组件：成功绿 / 失败红），浮在头部下方，2.5s 上飘淡出自退。
          enabledToast !== null
            ? h(FloatingToast, {
              seq: enabledToast.seq,
              tone: enabledToast.err ? 'error' : 'success',
              below: true,
              onDone: () => { setEnabledToast(null) },
              text: enabledToast.msg,
            })
            : null,
          mode === 'edit'
            ? h(Segmented, {
              id: 'dsh-tdt-ed-tabs',
              value: tab,
              options: [
                { value: 'basic', label: t('editorTabBasic') },
                { value: 'records', label: t('editorTabRecords') },
              ],
              onChange: (next: string) => { setTab(next as 'basic' | 'records') },
              label: t('editorTabBasic'),
              className: 'dsh-tdt-ed-seg',
            })
            : null,
          h('button', {
            className: 'dsh-tdt-ed-close',
            type: 'button',
            title: t('editorClose'),
            'aria-label': t('editorClose'),
            onClick: requestClose,
          }, h(IconCloseOutlineRegular, { size: 16 })),
        ),
      ),
      h('div', { className: 'dsh-tdt-ed-body', ref: bodyRef }, body),
      // 底部：删除任务（红，仅编辑态）· 重置 · 取消 · 保存。
      // 提示全部收编共用 FloatingToast（浮在 footer 正上方、统一 2.8s 自退、不占版面）：
      //   校验问题 = 错误红（一次性，与描红解耦）/ 重置完成 = 中性灰 / 预览态不可保存 = 中性灰 / 保存失败 = 错误红。
      h('div', { className: 'dsh-tdt-ed-footer' },
        mode === 'edit' && onDelete !== undefined
          ? h(Button, {
            variant: 'outline', size: 'sm', className: 'dsh-tdt-ed-danger',
            onClick: () => { setConfirmDeleteTask(true) },
          }, t('editorDeleteTask'))
          : null,
        h(Button, {
          variant: 'ghost', size: 'sm',
          onClick: () => { setConfirmReset(true) },
        }, t('editorReset')),
        h('span', { style: { flex: '1 1 auto' } }),
        problemsToast !== null
          ? h(FloatingToast, {
            seq: problemsToast.seq,
            tone: 'error',
            onDone: () => { setProblemsToast(null) },
            text: problemsToast.text,
          })
          : null,
        resetHint !== 0
          ? h(FloatingToast, {
            seq: resetHint,
            tone: 'neutral',
            onDone: () => { setResetHint(0) },
            text: t('editorResetDone'),
          })
          : null,
        saveErrToast !== null
          ? h(FloatingToast, {
            seq: saveErrToast.seq,
            tone: 'error',
            onDone: () => { setSaveErrToast(null) },
            text: saveErrToast.msg,
          })
          : null,
        pendingHint !== 0
          ? h(FloatingToast, {
            seq: pendingHint,
            tone: 'neutral',
            onDone: () => { setPendingHint(0) },
            text: t('editorSavePending'),
          })
          : null,
        h(Button, { variant: 'outline', size: 'sm', onClick: requestClose }, t('editorCancel')),
        h(Button, {
          variant: 'primary',
          size: 'sm',
          onClick: () => {
            if (onSave === undefined) {
              hintSeq.current += 1
              setPendingHint(hintSeq.current)
              return
            }
            // 保存前先本地查必填 / 排期冲突：问题字段描红（持续态）+ 一次性 Toast 列全部问题。
            const problems = validateTaskDraft(draft)
            if (problems.length > 0) {
              setShowErrors(true)
              problemsSeq.current += 1
              setProblemsToast({ text: problems.map(p => p.message).join('；'), seq: problemsSeq.current })
              return
            }
            setShowErrors(false)
            setProblemsToast(null)
            onSave(draft)
          },
        }, t('editorSave')),
      ),
      // 删除任务的严厉确认（用户 2026-09-30：措辞「所有的移除都是找不回来的，不可逆的」）。
      confirmDeleteTask
        ? h(VersionConfirm, {
          t,
          title: t('editorDeleteTaskTitle'),
          desc: t('editorDeleteTaskDesc'),
          confirmLabel: t('editorDeleteTask'),
          onCancel: () => { setConfirmDeleteTask(false) },
          onConfirm: () => { setConfirmDeleteTask(false); onDelete?.() },
        })
        : null,
      // 重置确认（用户 2026-09-30：重置也要先确认，避免误点把已填写内容清空）。
      confirmReset
        ? h(VersionConfirm, {
          t,
          title: t('editorResetTitle'),
          desc: t('editorResetDesc'),
          confirmLabel: t('editorReset'),
          onCancel: () => { setConfirmReset(false) },
          onConfirm: () => { setConfirmReset(false); onChange(initialDraftRef.current); hintSeq.current += 1; setResetHint(hintSeq.current) },
        })
        : null,
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
    // 选择工作区文件：**锚定浮层**（用户 2026-09-29：不要全屏弹窗，像选日期那样在按钮旁出浮窗，
    // 且不用那么高）。portal 到 body 躲抽屉层叠；面板在方按钮**左侧**展开、**下缘与按钮下缘齐平**；
    // 高度收窄（440px / 55vh）。复用 FileBrowser（picker 模式，点文件即回调）。
    pickerOpen && pickerAnchorRef.current !== null
      ? createPortal(h('div', {
          ref: pickerPanelRef,
          role: 'dialog',
          'aria-label': t('editorPickWorkspaceFile'),
          style: (() => {
            const rect = pickerAnchorRef.current.getBoundingClientRect()
            return {
              position: 'fixed', zIndex: 1100, display: 'flex', flexDirection: 'column', overflow: 'hidden',
              // 右缘 = 按钮左缘（贴住按钮、不留空隙）；下缘 = 按钮下缘（齐平）。
              right: Math.max(12, window.innerWidth - rect.left),
              bottom: Math.max(12, window.innerHeight - rect.bottom),
              // 宽 = 用户 2026-09-29：定 480（此前 840 → 420 → 480 微调）；高 = **按按钮上方实际可用空间算**
              // （视口顶 − 12px 余量，封顶 660）——面板向上长，绝不顶出浏览器顶部。
              width: 'min(480px, calc(100vw - 24px))',
              height: Math.min(660, Math.max(240, rect.top - 12)),
              background: 'var(--dsw-alias-bg-layer-2, #2a2e33)',
              border: `1px solid ${C.borderL2}`,
              borderRadius: 'var(--dsh-radius-panel, 10px)',
              boxShadow: 'var(--dsw-elevation-prominent, 0 12px 40px rgba(0,0,0,0.4))',
            }
          })(),
        },
          // 无标题条（用户 2026-09-29：标题/叉那行没意义，整个去掉）——关闭走 FileBrowser
          // 自带 ✕、点外部、Esc、再点方按钮四条路。
          (() => {
            const anchorSessionId = (workspaceAnchors ?? {})[pickerWs] ?? ''
            return workspaceFiles !== null && workspaceFiles !== undefined && anchorSessionId !== ''
              ? h(FileBrowser, {
                key: `${pickerWs}:${anchorSessionId}`,
                workspaceFiles,
                sessionId: anchorSessionId,
                path: '',
                rootName: pickerWs,
                // 工作区选择统一收进 ▾ 下拉（用户 2026-09-29：头部下拉冗余，撤掉）：
                // 顶部列全部工作区（带图标区分当前），下面才是当前路径的缩进层级。
                workspaces: workspaces.map(w => w.value),
                onSelectWorkspace: (name: string) => { setPickerWs(name) },
                t,
                onClose: () => { setPickerOpen(false) },
                picker: true,
                onPick: (p: string) => {
                  const name = p.slice(Math.max(p.lastIndexOf('/'), p.lastIndexOf('\\')) + 1)
                  addAttachment({ id: makeId(), name, kind: 'link', ref: p, workspace: pickerWs })
                  setPickerOpen(false)
                },
                // 复用 FileBrowser 本体，宽高/显示经由 style prop 控制：.dsh-tdt-sv-preview 类里
                // 带着旧分栏时代的固定宽（min(520px,48%)+flex:0 0 auto）⇒ 浮层里只占一半宽、
                // 右边全是浮层底色（真机 2026-09-29）。内联样式压过类默认：撑满浮层、去掉
                // 自带的 border-left（浮层已有外框）。
                style: { flex: '1 1 auto', width: '100%', minWidth: 0, minHeight: 0, borderLeft: 'none' },
              })
              : h('div', { style: { flex: '1 1 auto', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '24px', textAlign: 'center', color: C.textDim, fontSize: '13px' } }, t('editorPickerNoSession'))
          })(),
        ), document.body)
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
