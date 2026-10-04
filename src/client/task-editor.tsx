// 浏览器侧：新建 / 编辑任务的**右侧分栏**（用户 2026-10-01 拍板形态，U21）：
// 占布局的分栏（把主窗口往左推窄），不再是从右边浮出来盖住页面的浮层——
// 与 U11 预览 dock 同一套形态（根容器的 flex 成员，`sticky + 100vh + flex:0 0 auto`）。
//
// 2026-10-01 U21：
//   ① 头部「基本信息 / 执行记录」切换删除 ⇒ 编辑界面只管表单，不再展示执行记录
//      （执行记录归主面板自己的 tab）。
//   ② 「启用」开关从标题左边挪回头部**右侧、关闭 ✕ 的左边**（09-29 就是这个位置，
//      09-30 挪到左边，本轮依用户要求复位；此后再动先看这里）。
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

import { createElement as h, Fragment, useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { formatDateTime, pad2 } from './format'
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
  Switch,
  Tooltip,
  IconPlanOutlineRegular,
} from '@deepseek-ai/dsh-client-ui-primitives'
import { CodeViewer } from './ui/CodeViewer'
import {
  calendarLabelsOf,
  DateField,
  MarqueeText,
  SelectField,
  TimeField,
  WeekdayPicker,
  type CalendarLabels,
  type EditorOption,
  type TimeLabels,
  type WeekdayLabels,
} from './editor-fields'
import { Button as TdtButton, IconButton, NumberInput, PrefixedInput as TdtPrefixedInput, Segmented } from './ui'
import { ensureTaskEditorStyle } from './task-editor-css'
import { interpolateTranslate, type LocaleKey } from './locales'
import { renderSchedule, scheduleSpecFromCron, scheduleSpecFromDraft } from './schedule-text'
import CodeMirror from '@uiw/react-codemirror'
import { markdown } from '@codemirror/lang-markdown'
import { EditorView } from '@codemirror/view'
import { MD_LABELS } from './md-labels'
import { createPortal } from 'react-dom'
import { ALLOWED_ATTACHMENT_EXT, ATTACHMENT_MAX_BYTES, extOf, isSafeAttachmentRef } from '../attachment-allowlist.js'
import { FileBrowser } from './file-browser'
import type { OfficeToPdfFace, WorkspaceFilesFace } from './file-preview'
import { ensureToastStyle, FloatingToast } from './toast-css'

/**
 * 「?」说明钮（2026-09-30 抽象收敛：此前同样的 JSX 写了 5 份）。
 *
 * ⚠️ 图标**必须包在真实 DOM 元素**里再交给官方 Tooltip——它靠给子元素挂 ref，
 * 裸图标组件 ref 挂不上 ⇒ 悬停无字（本仓库踩过两次的坑，此处固化）。
 * `insideClickable`：挂在可点行（如「高级设置」折叠头）里时用 `span + role=img`，
 * 并吞掉点击冒泡，免得点说明把行本身开关了。
 */
function HelpButton(props: {
  hint: string
  side?: 'top' | 'bottom'
  align?: 'center' | 'end'
  maxWidth?: number
  insideClickable?: boolean
}) {
  const { hint, side = 'bottom', align, maxWidth = 300, insideClickable = false } = props
  // ⚠️ 两分支都必须给官方 Tooltip 一个**真实 DOM 元素**当子节点：若传函数组件（如 IconButton），
  //    Tooltip 挂不上 ref ⇒ 悬停不弹气泡（本仓库踩过两次的坑）。故非 insideClickable 也直接用原生 button，
  //    并统一挂 .dsh-tdt-ed-help（尺寸 / 颜色一处定义），不再借 IconButton 的按钮壳。
  const anchor = insideClickable
    ? h('span', {
        className: 'dsh-tdt-ed-help',
        role: 'img',
        'aria-label': hint,
        onClick: (event: { stopPropagation: () => void }) => { event.stopPropagation() },
      }, h(IconQuestionOutlineRegular, { size: 14 }))
    : h('button', {
        type: 'button',
        className: 'dsh-tdt-ed-help',
        'aria-label': hint,
      }, h(IconQuestionOutlineRegular, { size: 14 }))
  const tip: { label: string; side: 'top' | 'bottom'; maxWidth: number; align?: 'center' | 'end' } =
    { label: hint, side, maxWidth }
  if (align !== undefined) tip.align = align
  return h(Tooltip, tip, anchor)
}

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
  /** link：**工作区相对**路径（宿主 zod 拒绝对路径 / `..` / 反斜杠；派发期按 workspace 绝对化）；upload：插件数据目录下的文件名。 */
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
  /**
   * 创建时间（**表单不管理**，只做原样透传，用户 2026-09-30）：编辑保存必须把它带回定义，
   * 否则卡片「创建于 X」会消失。服务端更新时也会从原定义保留一份，这里是**双保险**。
   */
  createdAt?: string
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
  return `${now.getFullYear()}-${pad2(now.getMonth() + 1)}-${pad2(now.getDate())}`
}

/**
 * 表单里的「日期 + 时刻」是否**已经过去**（缺值 / 解析不出也算过去 ⇒ 走智能默认）。
 * 用户在表单里填的是**宿主本地时间**（没有时区字段，见草稿注释）⇒ 这里也按本地解析，口径一致。
 */
function isPastMoment(date: string, time: string): boolean {
  const parsed = Date.parse(`${date}T${time}`)
  return !Number.isFinite(parsed) || parsed <= Date.now()
}

/**
 * **新建任务的智能默认时刻**（用户 2026-09-30）：`现在 + 1 小时` → 再**往上取整点**。
 * 例：22:10 → 23:10 → 次日 `00:00`；8:50 → 9:50 → `10:00`。正好落在整点就取它本身（提前量仍 ≥ 1 小时）。
 *
 * 目的：单次执行 / 间隔锚点**别默认落在过去** —— 原先写死「今天 09:00」，晚上新建时那个时刻早就过了
 * （用户真机点名）。周期档不参与：每天 / 每周… 本来就不挑「今天这一下」。
 */
function smartDefaultMoment(now: Date = new Date()): { date: string; time: string } {
  const target = new Date(now.getTime() + 3_600_000)
  if (target.getMinutes() !== 0 || target.getSeconds() !== 0 || target.getMilliseconds() !== 0) {
    target.setHours(target.getHours() + 1, 0, 0, 0)
  }
  return {
    date: `${target.getFullYear()}-${pad2(target.getMonth() + 1)}-${pad2(target.getDate())}`,
    time: `${pad2(target.getHours())}:${pad2(target.getMinutes())}`,
  }
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
  // 创建时间原样带回（表单不管理它，只透传）—— 用户 2026-09-30：编辑保存不能把「创建于」弄丢。
  if (draft.createdAt !== undefined && draft.createdAt !== '') definition.createdAt = draft.createdAt
  if (draft.deps.length > 0) definition.depends_on = draft.deps.filter(dep => dep.task !== '')
  if (draft.attachments.length > 0) definition.attachments = draft.attachments
  return JSON.stringify(definition, null, 2)
}

/** 校验出的问题归属字段（决定哪个框描红）。 */
export type ErrorField = 'title' | 'workspace' | 'prompt' | 'schedule' | 'attachments'

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
 * 附件则对齐 schema 的 `ref` refine：link 型 ref 必须是**工作区相对路径**（不许绝对 / `..` / 反斜杠）。
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
  // ④ 附加文件：link 型 ref 必须**工作区相对**（宿主 zod：不许 `..` / 绝对路径 / 反斜杠）。
  //    ⚠️ 用户 2026-09-30 真机：选工作区文件曾把**绝对路径**当 ref 存 ⇒ 保存被 422 拒、且**无红框**、文案还是黑话。
  //    根因已在选择器修（回调改为工作区相对路径）；这里是**兜底** + 归属附件卡描红，防止再有非法 ref 写进来。
  const badAttachment = draft.attachments.find(att => !isSafeAttachmentRef(att.ref))
  if (badAttachment !== undefined) {
    problems.push({ field: 'attachments', message: `附加文件「${badAttachment.name}」的引用路径不合法——必须是工作区内的相对路径。请删掉它、重新选择一次。` })
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
  // ⚠️ 宿主路径是 `title`（`path.join('.')`，**无前导点**）——此前写成 `.title` 永不命中（2026-09-30 专家团复核）。
  if (raw.includes('title') && raw.toLowerCase().includes('too small')) {
    return '任务名称不能为空'
  }
  // 排期时长（允许延迟）非法：宿主只认 `PT…H/M/S`（如选了 `P1D` 这类会走到这里）。
  if (raw.includes('ISO 8601') || raw.includes('schedule.window')) {
    return '「允许延迟」的时长不合法——请从下拉里重选一个（如 4 小时）。'
  }
  if (raw.includes('schedule.cron')) {
    return '执行排期不合法——请重新选一次执行频率。'
  }
  // 附件 ref 非法（选工作区文件的历史 bug 会走到这里）：给出可执行的动作，别把「相对路径上跳」这种黑话甩给用户。
  if (raw.includes('附件 ref 非法') || (raw.includes('attachments') && raw.includes('ref'))) {
    return '附加文件的引用路径不合法——必须是工作区内的相对路径。请删掉那个附件、重新选择一次。'
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

/**
 * 五段 cron → 表单字段；表达不了的组合返回 null（调用方降级为「自定义 cron」，不丢原值）。
 *
 * ⚠️ **解析唯一实现** = [`./schedule-text.ts`](./schedule-text.ts) 的 `scheduleSpecFromCron`
 * （2026-09-30 抽象收敛：此前列表文案与编辑器**各写一份反解**、严格度还不一致 ⇒
 * 同一个 cron 两处说法不一样，修 bug 还得两边分别修）。这里只做 spec → 表单字段的映射。
 */
function scheduleFromCron(cron: string, everyNWeeks: number | null): Partial<TaskEditorDraft> | null {
  const spec = scheduleSpecFromCron(cron, everyNWeeks)
  if (spec.kind === 'custom' || spec.kind === 'once') return null
  const draft: Partial<TaskEditorDraft> = spec.kind === 'interval'
    ? {
        scheduleKind: 'interval',
        intervalUnit: spec.intervalUnit,
        intervalStep: String(spec.intervalStep),
        weekdays: spec.weekdays,
      }
    : {
        scheduleKind: 'periodic',
        periodFreq: spec.freq,
        weekdays: spec.weekdays,
        weekStep: String(spec.weekStep),
      }
  if (spec.kind === 'periodic') {
    if (spec.freq === 'monthly') {
      draft.monthDay = spec.monthDay
      // spec.monthMode 是宽泛 string（来自 cron / 老 `ui`）⇒ 收窄到表单三档，认不出回 'every'。
      draft.monthMode = spec.monthMode === 'odd' || spec.monthMode === 'even' ? spec.monthMode : 'every'
    }
    if (spec.freq === 'quarterly') { draft.monthDay = spec.monthDay; draft.quarterMonth = spec.quarterMonth }
    if (spec.freq === 'yearly') { draft.monthDay = spec.monthDay; draft.yearMonth = spec.yearMonth }
  }
  // ⚠️ 只有**周期档**才把 cron 的时分当执行时刻套用（那时分/时是具体数字）。间隔档的 cron 形如
  // `*/N …`，`spec.time` 是 `timeFromCron` 认不出时**编造**的 `09:00`——套上去会把 `start` 推导出的
  // 真实锚点（如 18:03）覆盖掉，保存即写回 `T09:00`，用户设的「18:03 起每 10 分钟」当场作废
  // （2026-09-30 复核发现的硬伤）。
  if (spec.kind === 'periodic') draft.time = spec.time
  return draft
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
    // 创建时间原样反解进草稿（表单不管理它，只透传）——保存时再写回，双保险防「创建于」消失。
    ...(typeof definition.createdAt === 'string' && definition.createdAt !== '' ? { createdAt: definition.createdAt } : {}),
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
      const nWeeks = typeof schedule.everyNWeeks === 'number' ? schedule.everyNWeeks : null
      const parsed = cron === '' ? null : scheduleFromCron(cron, nWeeks)
      if (parsed !== null) Object.assign(draft, parsed)
      else if (cron !== '') draft.customCron = cron
    }
  }
  const everyNWeeks = typeof schedule.everyNWeeks === 'number' ? schedule.everyNWeeks : undefined
  if (everyNWeeks !== undefined && everyNWeeks > 1) draft.weekStep = String(everyNWeeks)
  return draft
}

// ─────────────────────── 布局小件 ───────────────────────

/** 区块小标题（分组标签）：600 字重小字。（原注释指向已删除的 `dsh-tdt-ed-input` 类，2026-10-01 修正。） */
const sectionLabelStyle: CSSProperties = { fontSize: 'var(--tdt-font-sm)', fontWeight: 600, color: 'var(--tdt-fg)', marginBottom: '6px' }

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
  return h(TdtPrefixedInput, {
    prefix: props.prefix,
    value: props.value,
    placeholder: props.placeholder,
    error: props.error,
    'aria-label': props.prefix,
    onChange: props.onChange,
    // 撑满整行：PrefixedInput 根是 inline-flex（收缩盒），不指定宽度会缩到「前缀 + 默认 input 宽」，
    // 比下面各张全宽卡片短一截（用户 2026-10-01 点名）。这一层是编辑器专用包装，无其它调用点。
    style: { width: '100%' },
  })
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
      h('span', { style: { fontSize: 'var(--tdt-font-md)', color: 'var(--tdt-fg)' } }, t('editorIntervalEvery')),
      h(NumberInput, {
        value: Number.parseInt(draft.intervalStep, 10) || 1,
        min: 1,
        step: 1,
        // 高度走默认 lg(=32)，与同排「小时 / 分钟」下拉同档（此前 sm=24 显矮）。
        label: t('editorIntervalStep'),
        onChange: (n: number) => { patch({ intervalStep: String(n) }) },
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
      h('span', { style: { fontSize: 'var(--tdt-font-md)', color: 'var(--tdt-fg)' } }, t('editorIntervalSuffix')),
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

/** 分栏宽度持久化（纯本地偏好；隐私模式也不崩）。 */
const EDITOR_WIDTH_KEY = 'dsh-tdt-editor-width'
/** 最小宽度（用户 2026-10-02：560 偏宽 → 试 500 → 试 530 → 定 520）。 */
const EDITOR_WIDTH_MIN = 520
const EDITOR_WIDTH_DEFAULT = 520
/** 主面板的最小宽度（≥1120 的列永远不被压到出横向滚动条）。与新一分栏同时开时也要保住。 */
export const PAGE_MIN_WIDTH = 760

/**
 * 夹到允许区间：**给主面板留够最小宽度**（用户 2026-10-01 Q3）——
 * 上限 = 视口 − 主面板最小宽 − 其它分栏已占的宽度（两个分栏同时开时也成立）；
 * 下限保住 520，两头挤不动时下限优先（宁可主面板出滚动条也不许分栏被压塌）。
 * @param value - 目标宽度。
 * @param reserved - 右侧其它分栏（预览 dock）已经占掉的宽度，0 = 没有。
 */
export function clampEditorWidth(value: number, reserved = 0): number {
  const avail = window.innerWidth - PAGE_MIN_WIDTH - reserved
  const max = Math.max(EDITOR_WIDTH_MIN, Math.min(Math.floor(window.innerWidth * 0.9), Math.floor(avail)))
  return Math.min(Math.max(Math.round(value), EDITOR_WIDTH_MIN), max)
}

/** 读上次宽度（无效 / 越界一律回默认）。 */
export function readEditorWidth(reserved = 0): number {
  try {
    const raw = window.localStorage.getItem(EDITOR_WIDTH_KEY)
    const value = raw === null ? Number.NaN : Number(raw)
    return Number.isFinite(value) ? clampEditorWidth(value, reserved) : EDITOR_WIDTH_DEFAULT
  } catch {
    return EDITOR_WIDTH_DEFAULT
  }
}

/** 宽度写盘（隐私模式抛错就忽略；宽度是纯本地偏好，丢了回默认宽度）。 */
export function writeEditorWidth(value: number): void {
  try { window.localStorage.setItem(EDITOR_WIDTH_KEY, String(value)) } catch { /* 隐私模式忽略 */ }
}

/**
 * 提示词卡底部三下拉的**定宽**（用户 2026-10-02）：
 * 以「权限」为基准 120px，工作区 / 模型 = 1.5 倍 = 180px。
 * 不再按选项文字自适应宽度——那样换一个选项宽度就变一下（先各自撑到上限、三个都长才开始挤），
 * 观感一直在跳；用户很清楚自己选的工作区和模型，显示不下就省略号（MarqueeText 悬停可读全名）。
 */
const PROMPT_SELECT_BASE = '120px'
const PROMPT_SELECT_WIDE = '180px'

/** 版本条目时间（tooltip / 行内）：`YYYY-MM-DD HH:mm`。 */
const formatVersionTime = (iso: string): string => formatDateTime(iso)

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
// CodeMirror 主题：背景 / 文字 / 行号全部走 `--tdt-*` token，明暗自适应；
// 编辑器本身只负责「带语法高亮的纯文本」（gzip ~60KB，且仅在全屏编辑时才加载）。
const promptEditorTheme = EditorView.theme({
  '&': { backgroundColor: 'var(--tdt-surface-base, #22252a)', color: 'var(--tdt-fg)', height: '100%', width: '100%' },
  '.cm-editor': { height: '100%', width: '100%', backgroundColor: 'var(--tdt-surface-base, #22252a)' },
  // 软折行：长行自动换行，不出现横向滚动条（编辑器随列宽收缩也跟着重折）。
  '.cm-scroller': { fontFamily: 'ui-monospace, SFMono-Regular, Menlo, Consolas, monospace', fontSize: 'var(--tdt-font-md)', lineHeight: '1.6', overflowX: 'hidden' },
  '.cm-content': { width: '100%' },
  '.cm-line': { padding: '0 4px' },
  '.cm-gutters': { backgroundColor: 'var(--tdt-surface-1, rgba(128,128,128,0.08))', color: 'var(--tdt-fg-2)', border: 'none' },
  '.cm-activeLine': { backgroundColor: 'var(--tdt-hover, rgba(128,128,128,0.16))' },
  '.cm-activeLineGutter': { backgroundColor: 'transparent', color: 'var(--tdt-fg)' },
  '&.cm-focused': { outline: 'none' },
}, { dark: true })

/** 关闭「新建 / 编辑任务」分栏前的确认。
 *  故意不用官方 Modal：其 className 只落到卡片 .dialog，抬不到分栏这一层(z1040)，会被压住、点不了。
 *  这里以**绝对定位**挂在分栏面板内（面板 = position:relative），盖住整条分栏，
 *  天然在表单 / 全屏编辑器之上。（U21 撤掉全屏遮罩后，容器从遮罩改挂面板本体。） */
function ConfirmDiscard(props: {
  t: T
  onStay: () => void
  onLeave: () => void
}): ReactNode {
  return h('div', {
    role: 'alertdialog',
    'aria-modal': true,
    'aria-label': props.t('editorDiscardTitle'),
    style: { position: 'absolute', inset: 0, zIndex: 10, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '24px', background: 'var(--tdt-mask, rgba(0,0,0,0.45))' },
    onClick: props.onStay,
  },
    h('div', {
      style: { width: 'min(380px, 100%)', boxSizing: 'border-box', background: 'var(--tdt-surface-2, #2a2e33)', borderRadius: 'var(--tdt-radius-panel, 10px)', boxShadow: 'var(--tdt-shadow-2)', padding: '22px 24px', color: 'var(--tdt-fg)' },
      onClick: (event: { stopPropagation(): void }) => { event.stopPropagation() },
    },
      h('div', { style: { fontSize: 'var(--tdt-font-xl)', fontWeight: 500, marginBottom: '8px' } }, props.t('editorDiscardTitle')),
      h('div', { style: { fontSize: 'var(--tdt-font-lg)', lineHeight: 'var(--tdt-line-lg)', color: 'var(--tdt-fg-2)', marginBottom: '20px' } }, props.t('editorDiscardDesc')),
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
  /** 结构化圆点清单（用户 2026-09-30：正文别糊成一坨——说明是说明、条目是条目，层级拉开）。 */
  bullets?: readonly string[]
  confirmLabel?: string
  /** 标题染警告橙（高危确认，如「完全权限」保存确认）。 */
  warning?: boolean
  /** 勾选确认：提供时确认钮在勾选前置灰（用户 2026-09-30：完全权限保存前须打勾）。 */
  checkbox?: { label: string; checked: boolean; onToggle: (next: boolean) => void }
  onCancel: () => void
  onConfirm: () => void
}): ReactNode {
  const needAck = props.checkbox !== undefined
  const acked = needAck && props.checkbox?.checked === true
  return h('div', {
    role: 'alertdialog',
    'aria-modal': true,
    style: { position: 'absolute', inset: 0, zIndex: 20, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '24px', background: 'var(--tdt-mask, rgba(0,0,0,0.45))' },
    onClick: props.onCancel,
  },
    h('div', {
      style: { width: 'min(400px, 100%)', boxSizing: 'border-box', background: 'var(--tdt-surface-2, #2a2e33)', borderRadius: 'var(--tdt-radius-panel, 10px)', boxShadow: 'var(--tdt-shadow-2)', padding: '20px 24px 18px', color: 'var(--tdt-fg)' },
      onClick: (event: { stopPropagation(): void }) => { event.stopPropagation() },
    },
      // 层级：标题 15/600（警告橙可选）→ 说明 13 次要色 → 圆点清单 13 主色、条目间留呼吸 → 勾选 → 按钮。
      h('div', { style: { fontSize: 'var(--tdt-font-lg)', fontWeight: 600, lineHeight: 'var(--tdt-line-lg)', marginBottom: '10px', ...(props.warning === true ? { color: 'var(--tdt-warning)' } : {}) } }, props.title),
      props.desc !== ''
        ? h('div', { style: { fontSize: 'var(--tdt-font-md)', lineHeight: 'var(--tdt-line-md)', color: 'var(--tdt-fg-2)', marginBottom: props.bullets !== undefined ? '8px' : '18px' } }, props.desc)
        : null,
      props.bullets !== undefined && props.bullets.length > 0
        ? h('ul', { style: { listStyle: 'none', margin: '0 0 18px', padding: '10px 12px', borderRadius: 'var(--tdt-radius-md,8px)', background: 'var(--tdt-surface-1,rgba(128,128,128,.08))', display: 'flex', flexDirection: 'column', gap: '6px' } },
          ...props.bullets.map(b => h('li', { key: b, style: { fontSize: 'var(--tdt-font-md)', lineHeight: 'var(--tdt-line-md)', display: 'flex', gap: '8px' } },
            h('span', { style: { flex: 'none', width: '5px', height: '5px', borderRadius: '50%', background: 'var(--tdt-fg-3,rgba(128,128,128,.8))', margin: '7px 0 0' } }),
            h('span', null, b),
          )),
        )
        : null,
      needAck
        ? h('label', { style: { display: 'flex', alignItems: 'flex-start', gap: '8px', fontSize: 'var(--tdt-font-md)', lineHeight: 'var(--tdt-line-md)', cursor: 'pointer', marginBottom: '16px' } },
          h('input', {
            type: 'checkbox',
            checked: props.checkbox?.checked === true,
            onChange: (event: { target: { checked: boolean } }) => { props.checkbox?.onToggle(event.target.checked) },
            style: { flex: 'none', margin: '2px 0 0', accentColor: 'var(--tdt-warning)', width: '14px', height: '14px', cursor: 'pointer' },
          }),
          h('span', null, props.checkbox?.label),
        )
        : null,
      h('div', { style: { display: 'flex', justifyContent: 'flex-end', gap: '8px' } },
        h(Button, { variant: 'outline', size: 'sm', onClick: props.onCancel }, props.t('editorCancel')),
        h(Button, { variant: 'primary', size: 'sm', disabled: needAck && !acked, onClick: props.onConfirm }, props.confirmLabel ?? props.t('editorConfirm')),
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
    style: { display: 'flex', flexDirection: 'column', flex: '1 1 auto', minHeight: 0, background: 'var(--tdt-surface-base, #22252a)', color: 'var(--tdt-fg)', overflow: 'hidden', position: 'relative' },
  },
    h('div', { style: { display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '12px', padding: '10px 14px', borderBottom: `1px solid var(--tdt-border)` } },
      h('span', { style: { fontSize: 'var(--tdt-font-lg)', fontWeight: 600 } }, t('editorPromptEditorTitle')),
      h('div', { style: { display: 'flex', alignItems: 'center', gap: '8px' } },
        h(Segmented, {
          id: 'dsh-tdt-ed-prompt-mode',
          value: mode,
          size: 'md',
          variant: 'default',
          items: [
            { value: 'edit', label: t('editorModeEdit') },
            { value: 'preview', label: t('editorModePreview') },
          ],
          onChange: (next: string) => { setMode(next as 'edit' | 'preview') },
          label: t('editorPromptEditorTitle'),
        }),
        // 版本开关（2026-10-01：并入统一 Segmented——multiple 单段做 on/off，根 id 保留 dsh-tdt-ed-histtoggle
        // 供冒烟/锚点使用；样式走灰底变体 inset，即「版本」观感本身）
        h(Segmented, {
          id: 'dsh-tdt-ed-histtoggle',
          size: 'md',
          variant: 'inset',
          multiple: true,
          value: showVersions ? ['on'] : [],
          items: [{ value: 'on', label: t('editorVersionToggle') }],
          onChange: (next: string[]) => { setShowVersions(next.includes('on')) },
          label: versionTitle,
        }),
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
        ? h('div', { style: { flex: '0 0 232px', borderLeft: `1px solid var(--tdt-border-heavy)`, display: 'flex', flexDirection: 'column', minHeight: 0 } },
            h('div', { style: { padding: '10px 12px', borderBottom: `1px solid var(--tdt-border-heavy)`, fontSize: 'var(--tdt-font-md)', fontWeight: 600 } }, versionTitle),
            editorMode === 'create'
              ? h('div', { style: { padding: '16px 12px', fontSize: 'var(--tdt-font-sm)', color: 'var(--tdt-fg-2)', lineHeight: '1.6' } }, t('editorNewTaskNoVersions'))
              : h('div', { style: { display: 'flex', flexDirection: 'column', minHeight: 0, overflow: 'auto' } },
                versions.length === 0
                  ? h('p', { style: { padding: '0 12px', fontSize: 'var(--tdt-font-sm)', color: 'var(--tdt-fg-2)' } }, t('editorNoVersions'))
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
                            h(TdtButton, { variant: 'ghost', size: 'sm', className: 'dsh-tdt-btn--link', onClick: () => { setConfirmUseFile(v.file) } }, t('editorUseShort')),
                            h(IconButton, { variant: 'danger', size: 'sm', icon: h(IconCloseOutlineRegular, { size: 12 }), label: t('editorDeleteVersion'), onClick: () => { setConfirmDeleteFile(v.file) } }),
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
 * 只读展示当前配置生成的任务定义 JSON——用 CodeViewer（只读 CodeMirror 6：行号 + 语法着色 + 右上角官方复制图标），
 * 面板按钮只有「关闭」（复制由 CodeViewer 复制钮承担），不允许修改。
 */
function ConfigPreviewPanel(props: { t: T; json: string; onClose: () => void }): ReactNode {
  const { t, json, onClose } = props
  return h('div', { style: { display: 'flex', flexDirection: 'column', flex: '1 1 auto', minHeight: 0, background: 'var(--tdt-surface-base, #22252a)', color: 'var(--tdt-fg)', overflow: 'hidden', position: 'relative' } },
    h('div', { style: { display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '12px', padding: '10px 14px', borderBottom: `1px solid var(--tdt-border)` } },
      h('span', { style: { fontSize: 'var(--tdt-font-lg)', fontWeight: 600 } }, t('editorPreview')),
      h(Button, { variant: 'ghost', size: 'sm', onClick: onClose }, t('editorClose')),
    ),
    h('div', { style: { flex: '1 1 auto', minWidth: 0, minHeight: 0, overflow: 'hidden' } },
      h(CodeViewer, { text: json, path: 'task-definition.json', t }),
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
  /** Office 预览服务（remote.officeToPdf；未就位为 null ⇒ Office 文件出「不可用」空态）。 */
  officeToPdf?: OfficeToPdfFace | null
  /**
   * 工作区 title → 锚点会话 id（GET /options 下发：该工作区最近一个会话，官方 entity.sessionIds 末位）。
   * remote.workspaceFiles 的 list 以 sessionId 解析工作区根（0.2.0-rc.1 仍如此，源码已核实）⇒
   * 浏览某工作区必须有属于它的会话当锚点；没有锚点的工作区官方无浏览入口（不造假会话）。
   */
  workspaceAnchors?: Record<string, string>
  /**
   * 分栏宽度（受控，真源在 TaskPage）：侧栏是根容器的 flex 成员，宽度要能被 TaskPage
   * 拿去给另一条侧栏（预览）与全屏会话弹窗算可用宽度，不能困在本组件里。
   */
  width: number
  /** 宽度变化（拖拽**松手**时才回调，此时才落 state + localStorage）。 */
  onWidthChange: (next: number) => void
  /** 右侧**另一条**分栏（预览 dock）当前占掉的宽度；用于给主面板留够最小宽度（Q3）。 */
  reserved: number
}): ReactElement {
  const {
    t, mode, draft, onChange, workspaces, models, tasks, onClose, onSave, onDelete, saveError,
    history, onRestoreVersion, onDeleteVersion, onToggleEnabled, workspaceFiles, workspaceAnchors,
    officeToPdf, currentTaskId, width, onWidthChange, reserved,
  } = props
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
  // 「完全权限」保存确认（用户 2026-09-30）：选 full 时点保存先弹高危确认，**打勾后**确认钮才可点；
  // 确认按钮就叫「保存」（保持原样），确认即执行保存。勾选每次打开弹窗都要重勾（高危操作不记忆）。
  const [fullPermOpen, setFullPermOpen] = useState(false)
  const [fullPermAck, setFullPermAck] = useState(false)
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

  /**
   * 左缘拖拽调宽（U21：与预览 dock 同一套手势）：拖动期间**只改 CSS 变量**
   * `--dsh-tdt-editor-w`（不重渲染整页），松手才回调父 state + 落 localStorage。
   *
   * 拖拽为什么会「选中文字」（用户 2026-10-02）：pointerdown 的默认动作会开一次**文本选区**，
   * 指针扫过主窗口的文字时选区跟着扩 ⇒ 看着像在拖选。两道闸：
   *   ① `preventDefault()`：掐掉 pointerdown 的默认动作（连带后面的兼容 mousedown），选区压根不起；
   *   ② 拖动期间给 `document.body` 上 `user-select:none`（window pointerup 恢复）：即使有别处
   *      已存在的选区，拖动过程中也不会再变，也不会刷出高亮。
   */
  const startResize = useCallback((start: { clientX: number; preventDefault?: () => void }): void => {
    start.preventDefault?.()
    const startX = start.clientX
    const startWidth = width
    const next = (clientX: number): number => clampEditorWidth(startWidth + (startX - clientX), reserved)
    const body = document.body
    const prevUserSelect = body.style.userSelect
    body.style.userSelect = 'none'
    window.getSelection()?.removeAllRanges()
    const onMove = (event: PointerEvent): void => {
      const root = document.getElementById('dsh-tdt-root')
      if (root !== null) root.style.setProperty('--dsh-tdt-editor-w', `${next(event.clientX)}px`)
    }
    const onUp = (event: PointerEvent): void => {
      window.removeEventListener('pointermove', onMove)
      window.removeEventListener('pointerup', onUp)
      body.style.userSelect = prevUserSelect
      onWidthChange(next(event.clientX))
    }
    window.addEventListener('pointermove', onMove)
    window.addEventListener('pointerup', onUp)
  }, [width, reserved, onWidthChange])

  /** 周几的**单字**标签（方块上显示；`editorWeekdayShorts` 里以 `|` 分隔，两种语言各自给全）。 */
  const weekdayShorts = useMemo(() => t('editorWeekdayShorts').split('|'), [t])

  const weekdayLabels: WeekdayLabels = useMemo(() => ({
    weekdays: WEEKDAY_KEYS.map(key => t(key)),
    shorts: weekdayShorts,
    empty: t('editorWeekdayEmpty'),
  }), [t, weekdayShorts])

  // 日历文案走**单源** `calendarLabelsOf`（editor-fields，决策 55 起与任务卡片三面板共用，不再各处各拼）。
  const calendarLabels: CalendarLabels = useMemo(() => calendarLabelsOf(t), [t])

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
    // ⚠️ 必须写 `PT24H` 而不是 `P1D`：宿主 isoDuration 正则只认 `PT…H/M/S`（2026-09-30 专家团复核：
    //    选「1 天」此前会 422「must match pattern /^PT…/」，且文案是机器码）。
    { value: 'PT24H', label: `1 ${t('unitDays')}` },
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
    // 三框宽度**全部定宽**（用户 2026-10-02）：以权限框为基准 PROMPT_SELECT_BASE(120)，
    // 工作区 / 模型 = 1.5 倍(180)。不再按内容自适应 —— 以前换选项宽度就跟着变（先撑到 cap、
    // 三个都长才开始挤），观感一直在跳；用户很清楚自己选的工作区 / 模型，显示不下就省略号。
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
        width: PROMPT_SELECT_WIDE,
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
        width: PROMPT_SELECT_BASE,
      }),
      h('span', { className: 'dsh-tdt-ed-spacer' }),
      h(SelectField, {
        value: draft.model,
        options: models,
        onChange: value => { patch({ model: value }) },
        placeholder: t('editorModelPh'),
        emptyLabel: t('editorNoOptions'),
        ariaLabel: t('editorModel'),
        width: PROMPT_SELECT_WIDE,
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
      // 每个文件独立超时（90s：附件上限 20MB，给慢盘留余量）——此前**没有超时**，
      // 一旦请求挂住 ⇒ 循环卡死、`setUploading(false)` 永不执行 ⇒ **上传按钮永久禁用**
      // （2026-09-30 评审 P0；与列表轮询那条同款病）。
      const controller = new AbortController()
      const abortTimer = window.setTimeout(() => controller.abort(), 90_000)
      try {
        const res = await fetch('/api/task-dispatch-table/attachment', {
          method: 'POST',
          headers: { 'x-filename': encodeURIComponent(file.name), 'content-type': 'application/octet-stream' },
          body: file,
          signal: controller.signal,
        })
        const data = await res.json().catch(() => null)
        if (data === null || data.ok !== true) { lastErr = typeof data?.error === 'string' ? data.error : 'upload-failed'; continue }
        added.push({ id: makeId(), name: data.name, kind: 'upload', ref: data.ref })
      } catch (error) { lastErr = error instanceof Error ? error.message : 'network-error' } finally {
        window.clearTimeout(abortTimer)
      }
    }
    setUploading(false)
    if (added.length > 0) patch({ attachments: [...draft.attachments, ...added] })
    if (lastErr !== null) setUploadError(lastErr)
  }
  const attachmentsCard = h('div', { className: `dsh-tdt-ed-card${problemsByField('attachments') ? ' dsh-tdt-ed-card--error' : ''}` },
    h('div', { className: 'dsh-tdt-ed-card-head' },
      h('div', { className: 'dsh-tdt-ed-label', style: { display: 'flex', alignItems: 'center', gap: '4px' } },
        t('editorAttachments'),
        h(HelpButton, { hint: t('editorAttachmentsHint') }),
      ),
    ),
    // 附件列表（空数组不渲染任何东西——投放框常驻已是明确的空态，不再重复「暂无」文案）。
    draft.attachments.length === 0 ? null : h('div', { style: { display: 'flex', flexDirection: 'column', gap: '6px', marginBottom: '10px' } },
          // 行样式（用户 2026-09-29）：不要边框，用半透明浅底衬出每一行。
          draft.attachments.map(att => h('div', { key: att.id, style: { display: 'flex', alignItems: 'center', gap: '8px', padding: '6px 10px', borderRadius: 'var(--tdt-radius-sm)', background: 'var(--tdt-hover, rgba(127, 127, 127, 0.14))' } },
            h('span', { style: { flex: 'none', display: 'flex', alignItems: 'center' } }, h(FileTypeIcon, { path: att.name, size: 16 })),
            // 文件名占据左侧所有可用空间，把「上传/链接」标签和「移除」按钮顶到最右边；
            // 自己保留 flex-shrink，容器窄时自动截断成省略号，不会挤变形按钮（用户 2026-10-03）。
            h('span', { style: { flex: '1 1 auto', minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', fontSize: 'var(--tdt-font-md)' } }, att.name),
            h('span', { title: att.ref, style: { flex: 'none', fontSize: 'var(--tdt-font-xs)', color: 'var(--tdt-fg-2)', borderRadius: 'var(--tdt-radius-xs)', padding: '1px 6px', background: 'var(--tdt-hover, rgba(127, 127, 127, 0.14))' } }, att.kind === 'link' ? t('editorAttachmentLink') : t('editorAttachmentUpload')),
            // 移除按钮也声明不收缩 / 不折行，确保不会被文件名挤到换行或压扁。
            h(Button, { variant: 'ghost', size: 'sm', onClick: () => { patch({ attachments: draft.attachments.filter(a => a.id !== att.id) }) }, title: t('editorAttachmentRemove'), 'aria-label': t('editorAttachmentRemove'), style: { flex: 'none', whiteSpace: 'nowrap' } }, t('editorAttachmentRemove')),
          )),
        ),
    // 一行两块（用户 2026-09-29）：左边大块 = 点击/拖拽上传；右边 = 小号「选择工作区文件」按钮。
    // 隐藏 input 挂卡片层、始终在册。
    h('div', { style: { display: 'flex', gap: '10px', alignItems: 'stretch' } },
      h('div', {
        style: { flex: '1 1 auto', border: `1px dashed var(--tdt-border-heavy)`, borderRadius: 'var(--tdt-radius-md)', padding: '16px 12px', textAlign: 'center', cursor: uploading ? 'default' : 'pointer', background: 'var(--tdt-surface-1)' },
        onClick: () => { if (!uploading) fileInputRef.current?.click() },
        onDragOver: (event: { preventDefault(): void }) => { event.preventDefault() },
        onDrop: (event: { preventDefault(): void; dataTransfer?: { files?: FileList } }) => {
          event.preventDefault()
          if (!uploading && event.dataTransfer?.files !== undefined) void uploadFiles(event.dataTransfer.files)
        },
      },
        h('div', { style: { fontSize: 'var(--tdt-font-md)', color: 'var(--tdt-fg)' } }, uploading ? t('editorUploading') : t('editorDropZoneHint')),
        uploading ? null : h('div', { style: { fontSize: 'var(--tdt-font-xs)', color: 'var(--tdt-fg-2)', marginTop: '4px' } }, t('editorDropZoneFormats')),
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
            width: '92px', padding: '8px', border: `1px dashed var(--tdt-border-heavy)`, borderRadius: 'var(--tdt-radius-md)',
            background: 'var(--tdt-surface-1)', cursor: 'pointer', color: 'var(--tdt-fg)',
          },
        },
          h(IconPlusOutlineRegular, { size: 20 }),
          h('span', { style: { fontSize: 'var(--tdt-font-sm)', lineHeight: 1.2 } }, t('editorPickWorkspaceFileShort')),
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
        h(Segmented<string>, {
          id: 'dsh-tdt-ed-schedule',
          value: scheduleTab,
          size: 'md',
          variant: 'inset',
        items: [
          { value: 'once', label: t('editorFreqOnce') },
          { value: 'periodic', label: t('editorSchedulePeriodic') },
          { value: 'interval', label: t('editorScheduleInterval') },
        ],
        onChange: (value: string) => {
          // 智能默认（用户 2026-09-30）：切到「单次 / 间隔」时，若表单里那个时刻**已经过去**，就换成
          // 「现在 + 1 小时再取整点」（22:10 ⇒ 次日 00:00；8:50 ⇒ 10:00）—— 免得一进表单就是个过期时刻
          //（原先写死「今天 09:00」）。**已填的未来时刻不覆盖**；周期档（每天/每周…）不参与。
          // ⚠️ **只在「新建」态替换**（2026-09-30 验收评审抓到的必修项）：编辑既有任务时点一下档位，
          // 就会把人家填好的时刻换成「明天整点」，保存即写回 `schedule.start` / `once` —— 间隔任务的
          // 锚点是创建时刻（必然在过去）⇒ 被改后 `filterSlotsBySchedule` 会丢掉所有早于 `start` 的刻度
          // ⇒ **当天直接不再跑、相位也变了**。
          const notPast = (): Partial<TaskEditorDraft> => (mode === 'create' && isPastMoment(draft.date, draft.time) ? smartDefaultMoment() : {})
          if (value === 'once') { patch({ scheduleKind: 'periodic', periodFreq: 'once', ...notPast() }); return }
          if (value === 'interval') { patch({ scheduleKind: 'interval', ...notPast() }); return }
          // 回到「周期」：原来停在一次性的话，落到每天（否则保持原频率）。
          patch({ scheduleKind: 'periodic', periodFreq: draft.periodFreq === 'once' ? 'daily' : draft.periodFreq })
        },
        label: t('editorSchedule'),
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
      h('div', { style: { borderTop: `1px dashed var(--tdt-border)`, paddingTop: '10px', fontSize: 'var(--tdt-font-sm)', lineHeight: '1.6', color: 'var(--tdt-fg-2)' } },
        h('span', { style: { color: 'var(--tdt-fg)', fontWeight: 600, marginRight: '4px' } }, t('editorSchedForecast') + '：'),
        // 关键片段（时间 / 「每 N 分钟执行一次」）加粗提亮（用户 2026-09-30：方法要支持样式参数）。
        renderSchedule(scheduleSpecFromDraft(draft), t, { emphasisStyle: { color: 'var(--tdt-fg)' } }),
      ),
      h('div', { style: { borderTop: `1px dashed var(--tdt-border)`, marginTop: '10px' } }),
    ),
    // 底部：左 = 任务开始时间（锚点，周期/间隔都有，带 ? 说明），右 = 允许延迟（次要，居右）。
    // 上间距与「预计执行」上边线离「星期」的间距对齐 = 14px（此前 CSS margin12+padding12=24 是两倍）。
    // ⚠️ 窄分栏（最小 530）下的空间账（用户 2026-10-02：中文标签被压成两行）：
    //   标签一律 `flex:none + nowrap`（标签**永不被压折行**），三个控件也 `flex:none` 只吃自己那份宽度
    //   （谁都不许被挤到出省略号 —— 用户点名「不要影响那三个框的字的显示」）；
    //   空间不够时靠 `flexWrap` 让右组（允许延迟）整组落到第二行，绝不切字。
    h('div', { className: 'dsh-tdt-ed-schedfoot', style: { display: 'flex', alignItems: 'center', flexWrap: 'wrap', gap: '6px', borderTop: 'none', marginTop: '14px', paddingTop: '0' } },
      showTaskStart
        ? h('div', { style: { display: 'flex', alignItems: 'center', gap: '4px' } },
            h('span', { style: { flex: 'none', whiteSpace: 'nowrap', fontSize: 'var(--tdt-font-xs)', color: 'var(--tdt-fg)' } }, t('editorTaskStart')),
            // ⚠️ 日期 / 时刻**不给定宽**（2026-10-02 返工）：定宽就有可能被内容顶破，
            // 框内文字走 `text-overflow:ellipsis` ⇒ 直接显示成「2026-09-3…」/「18:5…」，而日期必须完整可见。
            // 现在 = **内容宽 + flex:none**：框宽恰好等于内容（`2026-09-30` / `18:50` + 图标），
            // 天然不会被省略号吃掉，还比原来的定宽（126 / 92）省出十几像素给标签。
            h('span', { style: { flex: 'none', display: 'inline-flex' } }, h(DateField, {
              value: draft.date,
              onChange: value => { patch({ date: value }) },
              placeholder: t('editorDatePh'),
              ariaLabel: t('editorTaskStart'),
              labels: calendarLabels,
            })),
            // 间隔档要选时刻；周期档时刻由上方频率区决定，这里只选日期。
            draft.scheduleKind === 'interval'
              ? h('span', { style: { flex: 'none', display: 'inline-flex' } }, h(TimeField, {
                value: draft.time,
                onChange: value => { patch({ time: value }) },
                placeholder: t('editorTimePh'),
                ariaLabel: t('editorTaskStart'),
                labels: timeLabels,
              }))
              : null,
            h(HelpButton, { hint: t('editorTaskStartHint'), side: 'top', align: 'center' }),
          )
        : null,
      h('span', { className: 'dsh-tdt-ed-spacer', style: { flex: '1 1 auto', minWidth: 0 } }),
      h('div', { style: { display: 'flex', alignItems: 'center', gap: '6px' } },
        h('span', { style: { flex: 'none', whiteSpace: 'nowrap', fontSize: 'var(--tdt-font-xs)', color: 'var(--tdt-fg-2)' } }, t('editorWindow')),
        h('span', { style: { flex: 'none', display: 'inline-flex' } }, h(SelectField, {
          value: draft.window,
          options: windowOptions,
          onChange: value => { patch({ window: value }) },
          placeholder: t('editorWindow'),
          emptyLabel: t('editorNoOptions'),
          ariaLabel: t('editorWindow'),
          // 高度走默认 lg(=32)，与同排「开始时间」的日期 / 时间锚点同档（此前 sm=24 显矮）。
          // 定宽 96（同排下拉定宽那条规矩，不随选项文字跳）：按**最宽**那一档取值定（`30 分钟`
          // ≈ 46 + 内边距/箭头 38 ≈ 84），留足余量 ⇒ 切到哪一档都不会被省略号吃掉。
          width: 96,
          align: 'end',
        })),
        h(HelpButton, { hint: t('editorWindowHint'), side: 'top', align: 'end', maxWidth: 320 }),
      ),
    ),
  )

  // ③ 前置任务卡（用户 2026-09-29 多轮拍板，照「附加文件」卡同款灰框 + 同款外距）：
  //  - 停用（锁住）的任务同样可选（快照本就全量下发，无启停过滤）；下拉里标「（已停用）」；
  //  - 布局：上 = 已选前置任务列表（空则显示上传投放区同款虚线占位框）；下 = 工作区→任务→添加；
  //  - 标题「添加前置任务」+「?」Tooltip：含义（强调『所有』）/ 判定方式（所有前置任务上一次
  //    执行必须成功，跳过不算失败）/ 执行时自动移交前置产出文件；
  //  - 选择 = 先工作区后任务两级（2026-10-04 起工作区候选 = **真源** `/options`，与另两处「选工作区」
  //    完全一致；允许选到「没有任务的工作区」⇒ 下一级给空态文案，不再把空工作区藏起来），点「添加」固定成一行，
  //    行内「移除」可删；同一任务不能加两次（选项里直接排除已加的，按钮再拦一道）；
  //  - 支持跨工作区（每个前置任务可来自不同工作区）；加完工作区保留、任务清空，连着加第二个；
  //  - 三段式选择行（用户定稿）：左「工作区」定宽 112px（约 5~6 个字）居左，右「添加」
  //    定宽 88px 居右，中间「任务」flex 吃掉剩余宽度（随抽拉分栏同步伸缩）；
  //  - 语义下拉删除（用户：选「同一天的」没有意义）——判定方式就是「上一次执行必须成功」，
  //    新增依赖固定写 `latest_success`；存量依赖的 semantics 原样保留（编辑无损往返）。
  const addedDepIds = new Set(draft.deps.map(dep => dep.task))
  // 工作区候选 = **真源**（`GET /options` 的宿主真实工作区，与编辑器底部、任务列表顶部同一份）。
  // ⚠️ 2026-10-04 前这里是「从任务表反推只列有可选任务的工作区」⇒ 空工作区凭空消失（用户拍板修掉）。
  const depWsOptions: EditorOption[] = workspaces
  // 默认选中：真源里的第一个工作区；取不到（degraded ⇒ 空数组）就是未选，下拉显示「暂无可选」。
  const [depWs, setDepWs] = useState(() => workspaces[0]?.value ?? '')
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
        h(HelpButton, { hint: t('editorDepsHint'), maxWidth: 320 }),
      ),
    ),
    // 上：已选前置任务列表；空 = 上传投放区同款虚线占位框（灰字居中，主行 + 次行提示）。
    h('div', { style: { marginBottom: '10px' } },
      draft.deps.length === 0
        ? h('div', {
            // 空态 = 上传投放区（上方附件卡）同款虚线框，同一组 --tdt-* token 保证观感一致。
            style: { border: `1px dashed var(--tdt-border-heavy)`, borderRadius: 'var(--tdt-radius-md)', padding: '16px 12px', textAlign: 'center', background: 'var(--tdt-surface-1)' },
          },
            h('div', { style: { fontSize: 'var(--tdt-font-md)' } }, t('editorDepEmpty')),
            h('div', { style: { color: 'var(--tdt-fg-2)', fontSize: 'var(--tdt-font-sm)', marginTop: '4px' } }, t('editorDepEmptyHint')),
          )
        : h('div', { style: { display: 'flex', flexDirection: 'column', gap: '6px' } },
            draft.deps.filter(dep => dep.task !== currentTaskId).map((dep, index) => {
              const known = tasks.find(task => task.id === dep.task)
              const ws = known?.workspace ?? ''
              return h('div', { key: index, className: 'dsh-tdt-ed-depitem' },
                // 行首只留「有点任务」icon（官方 IconPlanOutlineRegular）——「前置任务：」文字按用户要求删除（太占地方）。
                h('span', { style: { display: 'inline-flex', flex: 'none', color: 'var(--tdt-fg-3)' } }, h(IconPlanOutlineRegular, { size: 14 })),
                // 任务名吃剩余宽度：超长省略号，hover 跑马灯（MarqueeText，动画只在内层 span 上跑）。
                h(MarqueeText, { text: known?.label ?? dep.task, style: { flex: '1 1 auto', minWidth: 0, fontSize: 'var(--tdt-font-md)' } }),
                // 工作区固定宽（72px）+ 省略号 + 跑马灯（跨工作区时分得清是哪个区的任务）。
                ws === '' ? null : h(MarqueeText, { text: ws, style: { flex: '0 0 72px', color: 'var(--tdt-fg-2)', fontSize: 'var(--tdt-font-xs)' } }),
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
          // 真源取不到（degraded ⇒ 空数组）⇒ 「暂无可选」，**不回退反推**（回退就是又造第二真源）。
          emptyLabel: t('editorNoOptions'),
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
          // 选到「真源里有、但当前没有可选任务」的工作区 ⇒ 明说，而不是显示成「暂无可选」让人以为出错了。
          emptyLabel: depWs === '' ? t('editorNoOptions') : t('editorDepTaskEmpty'),
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
        style: { flex: '0 0 72px', height: 'var(--tdt-control-h-lg)', justifyContent: 'center' },
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
          h(HelpButton, { hint: t('editorAdvancedHelp'), insideClickable: true }),
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
                  size: 'md',
                  variant: 'inset',
                  items: retryOptions,
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
                h('span', { style: { fontSize: 'var(--tdt-font-md)', fontWeight: 600 } }, t('editorGoal')),
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
                h('span', { style: { fontSize: 'var(--tdt-font-md)', fontWeight: 600 } }, t('editorAgentTeam')),
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

  // 正文恒为表单（U21：删掉「基本信息 / 执行记录」切换 ⇒ 编辑界面不展示执行记录，
  // 执行记录归主面板自己的 tab；那条分支原本也只有一句占位文案）。
  const body = h('div', null,
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

  // 全屏编辑 = 把整条分栏的内容换成编辑器（同样的边、同样的宽度、随左缘拖拽一起变宽）；
  // 关闭编辑器即把后面的表单露出来。故编辑器与表单在分栏内二选一，而不是再做一个居中弹窗。
  const panelInner = editorOpen
    ? h(PromptEditorModal, {
      t,
      mode,
      value: draft.prompt,
      history: history ?? null,
      onChange: (value: string) => { patch({ prompt: value }) },
      onClose: () => { setEditorOpen(false) },
      // 找回版本 = 把内容覆盖到左侧编辑器（用户 2026-09-30：不关全屏编辑器，用户接着改）。
      onRestoreVersion: (file: string) => { onRestoreVersion?.(file) },
      onDeleteVersion: (file: string) => { onDeleteVersion?.(file) },
    })
    : previewOpen
      ? h(ConfigPreviewPanel, {
        t,
        json: draftToDefinitionJson(draft),
        onClose: () => { setPreviewOpen(false) },
      })
      : h('div', { style: { display: 'flex', flexDirection: 'column', flex: '1 1 auto', minHeight: 0 } },
      // 头部：左 = 标题；右 = 启用开关（**独立操作**：编辑态点击即写回+Toast，不走保存）
      //       → 关闭 ✕（用户 2026-10-01：开关回到右侧、紧贴关闭钮左边）。
      h('div', { className: 'dsh-tdt-ed-header' },
        h('div', { className: 'dsh-tdt-ed-headleft' },
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
          // 启用开关 + 联动状态文字：**紧挨关闭钮左边**（U21）。
          h('span', { className: 'dsh-tdt-ed-enable dsh-tdt-switch' },
            h(Switch, {
              checked: draft.enabled,
              onChange: handleToggleEnabled,
              label: t('editorEnabled'),
              title: draft.enabled ? t('editorEnabledOn') : t('editorEnabledOff'),
            }),
            h('span', { style: { fontSize: 'var(--tdt-font-sm)', color: 'var(--tdt-fg-2,rgba(128,128,128,.95))' } },
              draft.enabled ? t('editorEnabledStateOn') : t('editorEnabledStateOff')),
          ),
          h(IconButton, {
            variant: 'plain',
            size: 'md',
            icon: h(IconCloseOutlineRegular, { size: 16 }),
            label: t('editorClose'),
            onClick: requestClose,
          }),
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
        // 「重置」只在**改过内容**时才出现（用户 2026-09-30）：直接复用关闭确认那份脏判定
        // （`dirty` = 当前草稿 ≠ 打开时快照）；重置后草稿回到初始 ⇒ dirty 变 false ⇒ 按钮自己消失。
        dirty
          ? h(Button, {
            variant: 'ghost', size: 'sm',
            onClick: () => { setConfirmReset(true) },
          }, t('editorReset'))
          : null,
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
              // 一行一条（\n 换行，Toast 文字区 pre-line），每条以句号收尾——标点统一，不混分号。
              setProblemsToast({ text: problems.map(p => p.message).join('\n'), seq: problemsSeq.current })
              return
            }
            setShowErrors(false)
            setProblemsToast(null)
            // 「完全权限」= 高危档：保存前强制勾选确认（每次保存都确认，勾选不记忆）。
            if (draft.permission === 'full') {
              setFullPermAck(false)
              setFullPermOpen(true)
              return
            }
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
      // 「完全权限」保存确认（高危）：标题警告橙 + 结构化风险清单 + 勾选「我已了解风险」后才可点「保存」。
      fullPermOpen
        ? h(VersionConfirm, {
          t,
          warning: true,
          title: t('editorFullPermTitle'),
          desc: t('editorFullPermDesc'),
          bullets: [t('editorFullPermB1'), t('editorFullPermB2')],
          checkbox: { label: t('editorFullPermCheck'), checked: fullPermAck, onToggle: setFullPermAck },
          confirmLabel: t('editorSave'),
          onCancel: () => { setFullPermOpen(false) },
          onConfirm: () => { setFullPermOpen(false); onSave?.(draft) },
        })
        : null,
    )

  // U21：不再有遮罩层 —— 分栏是根容器（`#dsh-tdt-root`）的布局成员，主窗口被推窄而不是被盖住，
  // 因此关闭路径只有 ✕ / Esc / 取消钮三条（原来那条「点遮罩空白关闭」随遮罩一起取消）。
  return h(Fragment, null,
    h('div', {
      className: 'dsh-tdt-ed-panel',
      // 非模态：主窗口此刻仍可见可点（这话原来写 aria-modal=true 就不成立了）。
      role: 'dialog',
      'aria-label': mode === 'create' ? t('editorNew') : t('editorEdit'),
    },
      h('div', {
        className: 'dsh-tdt-ed-resizer',
        title: t('previewResize'),
        onPointerDown: (event: { clientX: number; preventDefault: () => void }) => { startResize(event) },
      }),
      panelInner,
      // 关闭确认（分栏内联层，绝对定位盖住整条分栏）：改过才出现；
      // 「继续编辑」⇒ 留在原处，「放弃更改」⇒ 真正关分栏。
      // 原来它挂在遮罩层里（遮罩是全屏 fixed，天然 covers-all）；撤遮罩后改挂面板自身
      // —— 面板已是 position:relative，覆盖范围就是分栏本体。
      confirmDiscard
        ? h(ConfirmDiscard, {
          t,
          onStay: () => { setConfirmDiscard(false) },
          onLeave: () => { setConfirmDiscard(false); onClose() },
        })
        : null,
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
              background: 'var(--tdt-surface-2, #2a2e33)',
              border: `1px solid var(--tdt-border)`,
              borderRadius: 'var(--tdt-radius-md)',
              boxShadow: 'var(--tdt-shadow-2)',
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
                officeToPdf,
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
              : h('div', { style: { flex: '1 1 auto', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '24px', textAlign: 'center', color: 'var(--tdt-fg-2)', fontSize: 'var(--tdt-font-md)' } }, t('editorPickerNoSession'))
          })(),
        ), document.body)
      : null,
  )
}
