// task-calendar.tsx — 任务日程页（月历视图，2026-10-05 首版 / 2026-10-06 交互改造）
//
// 形态：**一个自然月一页**的日历，格子里同时填两种东西 ——
//   ① **已发生**：`task_instances` 的真实行（成功 / 失败 / 跳过 / 运行中 / 未知，状态色**实心**小点）；
//   ② **计划**：按**当前任务定义**现算的未来刻度（**虚线空心**点，见 `calendar-plan.ts`）。
// 格子里**只给时刻**（一个时刻 = 一次任务，用户 2026-10-06：名字都不需要），有多少列多少（不收 `+N`）；
// 悬停给出这条是什么。点某天 ⇒ **那一天所在的那一周像手风琴一样拉开**，当天全部执行信息铺在拉开区里
// （有多少条显示多少条，不设内部滚动条）；拉开区里的执行块 = 执行记录页那**同一套** `RecordItem`
// （能再展开 ⇒ 前置任务 / 产出 / 事件流水）。
//
// ⚠️ 两态必须分得清：未来**没有实例行**（决策 31 懒建行：到点才 INSERT，不预建）⇒ ② 是
// 「按现在的配置推算出来的计划」，任务改配置 / 停用后会跟着变 —— 真实计算、不是模拟数据
// （AGENTS.md 第五条：正常功能一律真实取数，禁止模拟）。悬停与图例都要如实说明这一点。
//
// 取数：整月历史走 `GET /tasks/instances?light=1`（`fetchInstancesLite`，一次取满、不含 snapshot 大列）；
// 未来走浏览器内的 `planEntriesByDay`（与服务端同一份纯核，不许另写 cron 解析）；
// 拉开区里某条要展开时，按会话 id 补拉**全量行**拿 `snapshot`（前置 / 产出就靠它）+ `fetchEvents` 取事件。
import { createElement as h, Fragment, useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { IconChevronLeftOutlineRegular, IconChevronRightOutlineRegular, Tooltip } from '@deepseek-ai/dsh-client-ui-primitives'
import { pad2 } from './format'
import { fetchEvents, fetchInstanceBySession, fetchInstancesLite, type EventRow, type InstanceRow } from './query'
import { type ResolvedDependency } from '../deps.js'
import { isRunningStatus, statusTextOf, statusToneOf } from './status-text'
import { useInstancesRunningPoll } from './instances-poll'
import { monthRangeOf, monthRangeQuery, planEntriesByDay, type CalendarPlanEntry, type CalendarTask } from '../calendar-plan.js'
import { logicalDateOf } from '../schedule-next.js'
// 执行块**唯一实现**从执行记录页复用（不许再写一份条目渲染）+ 它的样式注入（幂等）。
import { RecordItem, ensureRecordsStyle } from './records-timeline'
import {
  Button, IconButton, Loading, PANEL_CONTENT_ID, PANEL_CONTENT_STYLE, SelectField, TaskPicker,
  applyStyle, buildMonthCells,
} from './ui'
import type { EditorOption, TaskOption } from './ui'
// 无时刻的占位走**共享层单源**（`NO_TIME`，与基础信息面板同一份），不在这里另写一份 `--:--`。
import { NO_TIME } from './task-info'
import { calendarLabelsOf } from './editor-fields'
import { interpolateTranslate, type Translate } from './locales'
import type { TaskOverviewRow } from './task-list'
import { IconClockOutlineRegular } from '@deepseek-ai/dsh-client-ui-primitives'

// ── 样式（走基础层注入器；只消费 var(--tdt-*)，不自建 <style>、不硬编码色值）──
const CALENDAR_CSS = `
/* 顶部一行：左 = 月份导航；右 = 图例计数 + 工作区 + 任务（**同一行、居右**，用户 2026-10-06） */
.dsh-tdt-cal-nav{display:flex;align-items:center;gap:var(--tdt-space-2);margin-bottom:var(--tdt-space-3);}
/* 月份标题：纯文本（无框、不可点）；左右单箭头走月、双箭头走年，不再用日期选择器弹层。
   固定宽度 + 居中（用户 2026-10-06：年 4 位 + 月 2 位，内容定长，但数字字形不等宽会带着箭头晃；
   定宽盒 + 文字居中 ⇒ 左右箭头不再跳动）。 */
.dsh-tdt-cal-title{font-size:var(--tdt-font-lg);line-height:var(--tdt-line-lg);font-weight:600;color:var(--tdt-fg);
  flex:none;width:6em;text-align:center;white-space:nowrap;font-variant-numeric:tabular-nums;}

.dsh-tdt-cal-right{display:flex;align-items:center;gap:var(--tdt-space-2);margin-left:auto;}

/* 网格（用户 2026-10-06 定死的三条）：① 格子是**纯粹的正方形**、**不要圆角**；
   ② 格子之间只留 **1px 间隔**（容器底色从缝里透出来当分隔线）；③ 格子**不描边**，
   只靠底色区分（本月 / 相邻月 / 选中）。 */
/* 表头（周一~周日）：**与网格连成一张整表**（用户 2026-10-06：不要「上面独立一块 + 底下再画一条线」）。
   做法 = 与网格同材质：外圈与列间 1px 全走「容器底色透出」（padding + background），无独立边框；
   表头格底色与本月格一致（淡蓝），整表上下一个颜色。 */
.dsh-tdt-cal-head{display:grid;grid-template-columns:repeat(7,1fr);gap:1px;
  background:var(--tdt-border);padding:1px 1px 0;}
.dsh-tdt-cal-head>div{text-align:center;font-size:var(--tdt-font-xs);line-height:var(--tdt-line-sm);
  /* 表头字：加粗 + 提亮（用户 2026-10-06：比格内浅灰字更醒目；续：700 偏粗，回调到 650）。 */
  font-weight:650;color:var(--tdt-fg);
  /* 表头底：比本月格更深的蓝（business 14% vs 格 8%），和下面可选块形成对比（用户 2026-10-06）。 */
  background:color-mix(in srgb,var(--tdt-business) 14%,var(--tdt-surface-1));padding:8px 0;}
/* 「选中 / 展开」的底色走 **token 层的 --tdt-selected-bg**（主题特判只许在 token 层）：
   浅色 = 掺 12% 文字色 ⇒ 深一档；深色 = 掺 12% 背景色 ⇒ 暗一档但不到背景的黑。
   ⚠️ 深色下掺文字色（白）会变亮 ⇒ 选中比本月还浅，用户明确否掉；
   别用 --tdt-plate / surface-2：与常态底色太接近，用户「完全没感觉到变化」。 */
.dsh-tdt-cal-grid{display:grid;grid-template-columns:repeat(7,1fr);gap:1px;background:var(--tdt-border);padding:1px;}
/* ⚠️ 格子**定宽定高**（用户 2026-10-06）：本月格与相邻月补位格**高度一模一样**，
   box-sizing:border-box 是这道保证（补位格是 div、本月格是 button，不统一盒模型就会差 2px）。 */
/* ⚠️ 上内边距留到 12px：选中格顶部那条线占 top 4–8px，内容从 12px 起才不会被线压住；
   下面空间是够的（104 - 12 - 6 = 86px，够 1 行日期 + 3 行标签的 80px）⇒ 所有格子统一留白、对齐一致。 */
.dsh-tdt-cal-cell{display:flex;flex-direction:column;gap:4px;box-sizing:border-box;height:104px;padding:6px;
  overflow:hidden;background:var(--tdt-cal-cell-bg);border:0;border-radius:0;font:inherit;text-align:left;cursor:pointer;
  transition:background var(--tdt-dur-fast) var(--tdt-ease);}
.dsh-tdt-cal-cell:hover{background:var(--tdt-cal-cell-hover);}
/* 补位格（相邻月）：只是**底色淡一档**，尺寸与本月格完全一致、**不放数据**、不可点。 */
.dsh-tdt-cal-cell--out{background:var(--tdt-surface-2);cursor:default;}
.dsh-tdt-cal-cell--out:hover{background:var(--tdt-surface-2);}
/* 选中格（**点开的那一块**）= 顶部一条 4px 蓝胶囊线（离边 4px）；**底色与其它格子完全相同**
   （surface-1）。⚠️ 底色**不许叠淡蓝**：那层半透明蓝压在格内的状态色标签上 ⇒ 深色主题下发灰、
   浅色主题下发暗，把原本的绿色/红色全带脏了（用户 2026-10-06）。「选中」只由那条线表达。
   ⚠️ 曾做反过两次：① 给没点开的格子画线、点开的空着；② 替换没落地导致两边都没线。以本段为准。
   ⚠️ 底色（2026-10-06 续2 定稿）：**与拉开区同色** = --tdt-cal-panel-bg（浅色近白、深色近背景），
   手风琴拉开时选中格与拉开区连成一体；「选中」由那条蓝胶囊线 + 与未选中格（淡蓝）的色差表达。
   **不用蓝**（open-bg 系在这里显灰），也不许叠半透明（会把状态色带脏）。 */
.dsh-tdt-cal-cell--sel{position:relative;background:var(--tdt-cal-panel-bg);outline:0;padding-top:12px;
  /* 手风琴拉开时：脚下那道 1px 网格缝用 box-shadow 盖掉（只盖选中格自己一段），
     同行**未选中**格子的下边线保留（用户 2026-10-06）。选中格底色 = 拉开区同色 ⇒ 连成一体。 */
  box-shadow:0 1px 0 var(--tdt-cal-panel-bg);}
.dsh-tdt-cal-cell--sel:hover{background:var(--tdt-cal-panel-bg);}
/* 线在格子**顶部**（不是底部）：高 4px、两端**全圆**（左右各一个半圆，成胶囊形）；
   稍亮的品牌蓝（--tdt-business），明确标出「这是当前选中那天」（用户 2026-10-06：用蓝表示选中）。 */
.dsh-tdt-cal-cell--sel::after{content:'';position:absolute;left:4px;right:4px;top:4px;height:4px;
  border-radius:999px;background:var(--tdt-business);}
/* 日期数字：左对齐、去掉 5px 内缩与胶囊框（用户 2026-10-06：左边距要和顶间距一致，之前太长） */
.dsh-tdt-cal-daterow{display:flex;align-items:baseline;gap:4px;padding-left:6px;}
.dsh-tdt-cal-num{font-size:var(--tdt-font-sm);line-height:18px;color:var(--tdt-fg-2);font-weight:600;}
.dsh-tdt-cal-num--today{color:var(--tdt-business);font-weight:600;}
.dsh-tdt-cal-today{color:var(--tdt-business);font-weight:600;font-size:var(--tdt-font-xs);}
.dsh-tdt-cal-num--out{color:var(--tdt-fg-4);}
/* 格内条目 = **方形小标签**（用户 2026-10-06：不要圆点、**不要任何圆角**）：
   标签前 3px 状态色竖线 + 同色系底 + 时刻；时刻位数固定 ⇒ 标签宽度固定；
   一行 3 个、共 3 行（第 9 个位子留给「…N」）；文字在**竖线后面的底色里居中**。 */
.dsh-tdt-cal-tags{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:2px;overflow:hidden;}
.dsh-tdt-cal-tag{display:flex;align-items:stretch;min-width:0;height:18px;border-radius:0;overflow:hidden;box-sizing:border-box;
  background:var(--cal-soft,transparent);}
.dsh-tdt-cal-tag::before{content:'';flex:none;width:3px;background:var(--cal-tone,var(--tdt-fg-4));}
.dsh-tdt-cal-tag>span{flex:1 1 auto;min-width:0;padding:0 2px;overflow:hidden;text-align:center;
  display:flex;align-items:center;justify-content:center;
  font-size:var(--tdt-font-xs);line-height:18px;color:var(--tdt-fg);font-variant-numeric:tabular-nums;}
/* 计划 = **虚线空心**（与「已发生」的实底标签一眼分得开）；左侧竖线**实心**、整体走蓝
   （用户 2026-10-06：虚线与竖线都是蓝色、不要灰——与执行记录「预计执行」块同一支蓝）。
   用户 2026-10-06 续：虚线**只包上/右/下**，左边不包——左缘是那条实心蓝竖条，虚线从它右边起到最右；蓝色调淡一点。 */
.dsh-tdt-cal-tag--plan{background:transparent;border:1px dashed color-mix(in srgb,var(--tdt-business) 50%,transparent);border-left:0;}
.dsh-tdt-cal-tag--plan::before{background:transparent;border-left:2px solid var(--tdt-business);}
.dsh-tdt-cal-tag--plan>span{color:var(--tdt-fg-3);}
/* 「还有 N 条」：占第 9 个位子，点了 = 拉开当天看全部 */
.dsh-tdt-cal-tag--more{background:var(--tdt-chip-bg);}
.dsh-tdt-cal-tag--more::before{background:var(--tdt-fg-4);}
.dsh-tdt-cal-tag--more>span{color:var(--tdt-fg-3);}
/* 语义色调 → 本域局部变量。底色取 **24%**（基础层 -soft 只有 8%，用户说「太浅看不出来」⇒ 这里调深；
   只在本域局部变量上调深，不动 ui/tokens.ts 里的 token）。 */
.dsh-tdt-cal-t--ok{--cal-tone:var(--tdt-success);--cal-soft:color-mix(in srgb,var(--tdt-success) 24%,transparent);}
.dsh-tdt-cal-t--bad{--cal-tone:var(--tdt-danger);--cal-soft:color-mix(in srgb,var(--tdt-danger) 24%,transparent);}
.dsh-tdt-cal-t--warn{--cal-tone:var(--tdt-warning);--cal-soft:color-mix(in srgb,var(--tdt-warning) 24%,transparent);}
.dsh-tdt-cal-t--busy{--cal-tone:var(--tdt-business);--cal-soft:color-mix(in srgb,var(--tdt-business) 24%,transparent);}
.dsh-tdt-cal-t--neutral{--cal-tone:var(--tdt-fg-4);--cal-soft:var(--tdt-chip-bg);}
/* 拉开区（**跨 7 列**，铺在该周下面）：当天全部执行信息，有多少显示多少，不设内部滚动条。
   max-height 动画的上限只是动画期间的裁剪值，动画结束即恢复 none ⇒ 再长的内容也照常显示。 */
/* 拉开区与选中格**同色**（--tdt-cal-panel-bg，浅色近白/深色近背景）⇒ 视觉一体。
   margin-top 不再上提：与上一行之间保留那道 1px 网格缝——同行**未选中**格子的下边线要保留；
   选中格脚下那一段由 --sel 的 box-shadow 盖掉（用户 2026-10-06）。 */
.dsh-tdt-cal-panel{position:relative;grid-column:1/-1;background:var(--tdt-cal-panel-bg);border:0;border-radius:0;
  /* 下内边距 = 左内边距（用户 2026-10-06：拉开区底部留白要跟左右一模一样，都是 16px）。 */
  padding:calc(var(--tdt-space-4) + 6px) var(--tdt-space-4) var(--tdt-space-4);
  overflow:hidden;animation:dsh-tdt-cal-open 180ms var(--tdt-ease);}
@keyframes dsh-tdt-cal-open{from{max-height:0;opacity:0}to{max-height:1600px;opacity:1}}

.dsh-tdt-cal-panel-head{display:flex;align-items:center;gap:var(--tdt-space-2);margin-bottom:var(--tdt-space-2);
  font-size:var(--tdt-font-md);line-height:var(--tdt-line-md);color:var(--tdt-fg);font-weight:500;}
.dsh-tdt-cal-panel-list{display:flex;flex-direction:column;gap:var(--tdt-space-1);}
/* 拉开区里的**计划**条目（没有执行记录 ⇒ 不可展开）：虚线框一行，内容可折行 */
.dsh-tdt-cal-row{display:flex;align-items:center;flex-wrap:wrap;gap:var(--tdt-space-1) var(--tdt-space-2);padding:7px 10px;
  border-radius:0;font-size:var(--tdt-font-sm);line-height:var(--tdt-line-sm);
  background:var(--cal-soft,transparent);}

.dsh-tdt-cal-time{font-variant-numeric:tabular-nums;}
/* 拉开区里可点的名字（任务名 / 前置任务名）：链接色 + hover 下划线，与执行记录页「任务名可点」同观感 */
.dsh-tdt-cal-link{border:0;background:none;padding:0;font:inherit;color:var(--tdt-business);cursor:pointer;text-align:left;}
.dsh-tdt-cal-link:hover{text-decoration:underline;}
/* 拉开区里的小字标注（「计划」/ 条数）—— 与格内标签类重名会互相打架，故单独命名 */
.dsh-tdt-cal-mini{flex:none;font-size:var(--tdt-font-xs);color:var(--tdt-fg-3);}
/* 面板头里的日期小字行：时钟图标 + 日期 · 星期 · N 条（与执行记录页同款）。 */
.dsh-tdt-cal-clock{flex:none;color:var(--tdt-fg-3);}
.dsh-tdt-cal-sep{color:var(--tdt-border-heavy);}
.dsh-tdt-cal-date{font-weight:500;color:var(--tdt-fg-2);}
.dsh-tdt-cal-weekday{color:var(--tdt-fg-2);}
.dsh-tdt-cal-hint{margin-top:var(--tdt-space-2);font-size:var(--tdt-font-xs);color:var(--tdt-danger);}
.dsh-tdt-cal-empty{padding:20px 0;text-align:center;font-size:var(--tdt-font-md);color:var(--tdt-fg-3);}
`
const CALENDAR_DOMAIN = 'domain:calendar'

/**
 * 一格能放的标签位子数 = **3 列 × 3 行 = 9**（第 9 位留给「还有 N 条」）。
 * 时刻位数固定 ⇒ 标签宽度固定；格子又定宽定高 ⇒ 这个数在同一版面下是常数，不需要测量。
 */
const CELL_CAP = 9

/** 格内 / 拉开区的统一条目：已发生（真实行）与计划（现算）两种。 */
type CalItem =
  | { kind: 'done'; at: string; row: InstanceRow; name: string }
  | { kind: 'plan'; at: string; entry: CalendarPlanEntry }

/** `HH:mm`（格子只到分钟：计划时刻本来就没有秒的意义）。 */
function hhmmOf(iso: string): string {
  const ms = Date.parse(iso)
  if (Number.isNaN(ms)) return NO_TIME
  const d = new Date(ms)
  return `${pad2(d.getHours())}:${pad2(d.getMinutes())}`
}

/** 月键 `YYYY-MM`（选中日是否还落在新月内，用它比）。 */
const monthKeyOf = (y: number, m: number): string => `${y}-${pad2(m)}`

export interface TaskCalendarProps {
  t: Translate
  /** 任务定义行（含 `schedule` / `enabled`）：未来计划由它现算，任务名也由它映射。 */
  rows: readonly TaskOverviewRow[]
  /** 任务选择器候选（`[编号] 名称` 口径，父级用 overview 组装 —— 这里不重写一份）。 */
  tasks: readonly TaskOption[]
  /** 工作区候选真源（面板级唯一，来自 `GET /options`）。 */
  workspaces: readonly EditorOption[]
  /** 打开归档会话弹窗：**只传会话 id**。 */
  onOpenSession?: (sessionId: string) => void
  /** 打开产出物预览（预览面没就位 ⇒ 不传，产出物降级不可点）。 */
  onOpenFile?: (sessionId: string, path: string) => void
  /** 点任务名 ⇒ 右侧栏以查看档打开该任务；不给 ⇒ 名字纯文本。 */
  onViewTask?: (taskId: string) => void
}

/** 任务日程页（月历）。 */
export function TaskCalendarView(props: TaskCalendarProps): ReturnType<typeof h> {
  applyStyle(CALENDAR_DOMAIN, CALENDAR_CSS)
  // 拉开区里的执行块复用执行记录页那一份 ⇒ 它的样式域（`.dsh-tdt-rec-*` + task-info 皮肤）也要注入。
  ensureRecordsStyle()
  const { t, rows, tasks, workspaces, onOpenSession, onOpenFile, onViewTask } = props
  const tt = useMemo(() => interpolateTranslate(t), [t])
  const calLabels = useMemo(() => calendarLabelsOf(t), [t])

  const today = useMemo(() => logicalDateOf(new Date(), undefined), [])
  const [cursor, setCursor] = useState<{ y: number; m: number }>(() => {
    const now = new Date()
    return { y: now.getFullYear(), m: now.getMonth() + 1 }
  })
  /** 拉开的那一天（手风琴：'' = 没拉开）。 */
  const [selected, setSelected] = useState(today)
  const [workspace, setWorkspace] = useState('')
  const [taskId, setTaskId] = useState('')
  const [instances, setInstances] = useState<readonly InstanceRow[]>([])
  const [loading, setLoading] = useState(false)
  const [loaded, setLoaded] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [truncated, setTruncated] = useState(false)
  /** 「现在」的时刻（计划只算 >= now 的刻度）：每次取数成功后跟着刷新一次。 */
  const [now, setNow] = useState(() => Date.now())

  /** 拉开区里**再展开**的那条执行（手风琴第二层：前置 / 产出 / 事件流水）。 */
  const [openId, setOpenId] = useState<string | null>(null)
  const [eventsCache, setEventsCache] = useState<ReadonlyMap<string, readonly EventRow[]>>(() => new Map())
  const [eventsBusy, setEventsBusy] = useState(false)
  const [eventsError, setEventsError] = useState<string | null>(null)
  /** 实例 id → 派发快照（轻量行没有 ⇒ 展开那条时按会话 id 补一次全量行）。 */
  const [snapshots, setSnapshots] = useState<ReadonlyMap<string, string | null>>(() => new Map())

  const seqRef = useRef(0)
  const eventsSeqRef = useRef(0)
  const instancesRef = useRef(instances)
  instancesRef.current = instances
  const eventsRef = useRef(eventsCache)
  eventsRef.current = eventsCache
  const snapshotsRef = useRef(snapshots)
  snapshotsRef.current = snapshots

  /**
   * 定义行的**排期指纹**：overview 是 10 秒轮询的，每次都换出新的数组引用；
   * 计划重算（几十个任务 × 5 次 cron 解析）不该被轮询白白带起来 ⇒ 指纹不变就不重算。
   */
  const scheduleSig = useMemo(
    () => rows.map(row => `${row.id}|${row.enabled}|${row.schedule.cron}|${row.schedule.once}|${row.schedule.start}|${row.schedule.everyNWeeks}|${row.schedule.timezone}`).join(';'),
    [rows],
  )
  const rowsRef = useRef(rows)
  rowsRef.current = rows

  const { y, m } = cursor
  const cells = useMemo(() => buildMonthCells(y, m), [y, m])
  /** 按周切片：拉开区要插在「选中日所在的那一行」下面 ⇒ 必须按周分块渲染。 */
  const weeks = useMemo(() => {
    const out: Array<Array<ReturnType<typeof buildMonthCells>[number]>> = []
    for (let i = 0; i < cells.length; i += 7) out.push(cells.slice(i, i + 7))
    return out
  }, [cells])

  // 历史：整月一次取满（轻量行，不含 snapshot）⇒ 点某天不再发起请求。
  const load = useCallback((): void => {
    const seq = seqRef.current + 1
    seqRef.current = seq
    setLoading(true)
    setError(null)
    const q = monthRangeQuery(y, m)
    fetchInstancesLite({
      workspace: workspace === '' ? undefined : workspace,
      taskId: taskId === '' ? undefined : taskId,
      from: q.fromTs,
      to: q.toTs,
    })
      .then(page => {
        if (seq !== seqRef.current) return
        setInstances(page.rows)
        setTruncated(page.truncated)
        setNow(Date.now())
      })
      .catch((e: unknown) => {
        if (seq !== seqRef.current) return
        setError(e instanceof Error ? e.message : String(e))
      })
      .finally(() => {
        if (seq !== seqRef.current) return
        setLoading(false)
        setLoaded(true)
      })
  }, [y, m, workspace, taskId])

  useEffect(() => { void load(); return () => { seqRef.current += 1 } }, [load])

  // 运行状态轮询（与执行记录页共用同一 hook）：当天还有在跑的实例时，每 5 秒静默刷新当月，
  // 跑完即停 ⇒ 任务跑完、日历开着也能跟着更新（不再卡在「运行中」）。
  const hasRunning = instances.some(r => isRunningStatus(r.status))
  useInstancesRunningPoll(hasRunning, () => { void load() })

  // 未来计划（浏览器内现算，无请求）：只算启用任务，且跟着工作区 / 任务过滤一起收窄。
  const planByDay = useMemo(() => {
    const source = rowsRef.current
    const picked: CalendarTask[] = source.filter(row => (
      row.enabled !== false
      && (workspace === '' || row.workspace === workspace)
      && (taskId === '' || row.id === taskId)
    ))
    const { from, to } = monthRangeOf(y, m)
    return planEntriesByDay(picked, from, to, new Date(now))
    // ⚠️ 依赖排期指纹而不是 rows：避免 10 秒轮询把 cron 解析重跑一遍（见 scheduleSig）。
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [scheduleSig, y, m, workspace, taskId, now])

  /** 任务名（真实标题，不带编号；查不到就给 id —— 不编造名字）。 */
  const nameOf = useCallback((id: string): string => {
    const row = rowsRef.current.find(item => item.id === id)
    if (row === undefined) return id
    return row.title === '' ? id : row.title
  }, [])
  /** 任务所属工作区（任务定义为准；查不到给空串，不猜）。 */
  const workspaceOf = useCallback((id: string): string => {
    return rowsRef.current.find(item => item.id === id)?.workspace ?? ''
  }, [])
  /** 可点的任务名（点 ⇒ 右侧栏查看档；没给 onViewTask ⇒ 降级纯文本）。 */
  const nameNode = useCallback((id: string, name: string): ReturnType<typeof h> =>
    onViewTask !== undefined
      ? h('button', { key: id, type: 'button', className: 'dsh-tdt-cal-link', title: name, onClick: () => { onViewTask(id) } }, name)
      : h('span', { key: id }, name), [onViewTask])

  // 按本地日分桶（与执行记录页同一抉择：用 `scheduled_at` 的本地日，不用 `logical_date`）。
  const byDay = useMemo(() => {
    const out = new Map<string, CalItem[]>()
    for (const row of instances) {
      const day = logicalDateOf(new Date(row.scheduled_at), undefined)
      const list = out.get(day)
      const item: CalItem = { kind: 'done', at: row.scheduled_at, row, name: nameOf(row.task_id) }
      if (list === undefined) out.set(day, [item])
      else list.push(item)
    }
    for (const [day, entries] of planByDay) {
      const list = out.get(day) ?? []
      for (const entry of entries) list.push({ kind: 'plan', at: entry.scheduledAt, entry })
      out.set(day, list)
    }
    for (const list of out.values()) list.sort((a, b) => (a.at < b.at ? -1 : a.at > b.at ? 1 : 0))
    return out
  }, [instances, planByDay, nameOf])

  /** 展开某条执行 ⇒ 取事件流水 + 补它的派发快照（前置 / 产出就靠快照，零额外请求以外的请求）。 */
  const loadDetail = useCallback((id: string): void => {
    const row = instancesRef.current.find(item => item.id === id)
    if (row === undefined) return
    if (!eventsRef.current.has(id)) {
      const seq = eventsSeqRef.current + 1
      eventsSeqRef.current = seq
      setEventsBusy(true)
      setEventsError(null)
      fetchEvents(id)
        .then(list => { if (seq === eventsSeqRef.current) setEventsCache(prev => new Map(prev).set(id, list)) })
        .catch((e: unknown) => {
          if (seq === eventsSeqRef.current) setEventsError(e instanceof Error ? e.message : String(e))
        })
        .finally(() => { if (seq === eventsSeqRef.current) setEventsBusy(false) })
    }
    // 轻量行没有 snapshot ⇒ 按会话 id 补一次全量行（会话弹窗就走这条，契约现成）。
    // 没有会话 id = 压根没派发（如 skipped）⇒ 本来就没有前置 / 产出，不补、也不假装有。
    const sid = row.session_id
    if (sid !== null && sid !== '' && !snapshotsRef.current.has(id)) {
      fetchInstanceBySession(sid).then(full => {
        setSnapshots(prev => new Map(prev).set(id, full?.snapshot ?? null))
      })
    }
  }, [])

  /** 只补派发快照（前置 / 产出靠它），不拉事件 —— 给日历展开区在**默认就展开**前置用，免去点一下才出。 */
  const loadSnapshotOf = useCallback((id: string): void => {
    const row = instancesRef.current.find(item => item.id === id)
    if (row === undefined) return
    const sid = row.session_id
    if (sid !== null && sid !== '' && !snapshotsRef.current.has(id)) {
      fetchInstanceBySession(sid).then(full => {
        setSnapshots(prev => new Map(prev).set(id, full?.snapshot ?? null))
      })
    }
  }, [])

  const toggleItem = useCallback((id: string): void => {
    setOpenId(cur => {
      const next = cur === id ? null : id
      if (next !== null) loadDetail(next)
      return next
    })
  }, [loadDetail])

  const workspaceOptions = useMemo<EditorOption[]>(
    () => [{ value: '', label: t('listFilterWorkspaceAll') }, ...workspaces],
    [workspaces, t],
  )
  const dayFormatter = useMemo<Intl.DateTimeFormat | null>(
    () => (typeof Intl === 'undefined' ? null : new Intl.DateTimeFormat(t('localeTag'), { month: 'long', day: 'numeric' })),
    [t],
  )
  // 星期单独成段（与执行记录页同一套「日期 · 星期 · N 条」），不再跟日期 glued 在一起。
  const weekdayFormatter = useMemo<Intl.DateTimeFormat | null>(
    () => (typeof Intl === 'undefined' ? null : new Intl.DateTimeFormat(t('localeTag'), { weekday: 'long' })),
    [t],
  )
  /** 跨天时刻（前置任务的「执行于」用）：`M 月 D 日 HH:mm`，与执行记录页同款。 */
  const crossFmt = useMemo<Intl.DateTimeFormat | null>(
    () => (typeof Intl === 'undefined' ? null
      : new Intl.DateTimeFormat(t('localeTag'), { month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit' })),
    [t],
  )

  const stepMonth = useCallback((delta: number): void => {
    setCursor(cur => {
      const d = new Date(cur.y, cur.m - 1 + delta, 1)
      const next = { y: d.getFullYear(), m: d.getMonth() + 1 }
      // 拉开的那天跟随：还在新月内就保持，否则收起（不拉一个看不见的日期）。
      setSelected(sel => (sel.slice(0, 7) === monthKeyOf(next.y, next.m) ? sel : ''))
      return next
    })
    setOpenId(null)
  }, [])
  const stepYear = useCallback((delta: number): void => {
    setCursor(cur => {
      const next = { y: cur.y + delta, m: cur.m }
      setSelected(sel => (sel.slice(0, 7) === monthKeyOf(next.y, next.m) ? sel : ''))
      return next
    })
    setOpenId(null)
  }, [])
  const goToday = useCallback((): void => {
    const now2 = new Date()
    setCursor({ y: now2.getFullYear(), m: now2.getMonth() + 1 })
    setSelected(today)
    setOpenId(null)
  }, [today])
  const changeWorkspace = useCallback((next: string): void => {
    setWorkspace(next)
    // 任务掉出新工作区就清掉（否则「工作区筛了 B、任务却是 A 的那条」自相矛盾）。
    setTaskId(cur => {
      if (next === '' || cur === '') return cur
      const hit = tasks.find(o => o.id === cur)
      return hit !== undefined && hit.workspace !== next ? '' : cur
    })
  }, [tasks])

  const dayItems = byDay.get(selected) ?? []

  // 选中某天时，把当天已发生条目的快照**预先**拉好 ⇒ 前置任务在展开区里**默认就显示**，不用再点一下。
  useEffect(() => {
    for (const item of dayItems) {
      if (item.kind === 'done') loadSnapshotOf(item.row.id)
    }
  }, [selected, dayItems, loadSnapshotOf])

  /** 拉开区里的一条（已发生 = 执行记录那套可展开的块；计划 = 一行虚线，没有记录可展开）。 */
  const panelItemNode = (item: CalItem): ReturnType<typeof h> => {
    if (item.kind === 'plan') {
      // 「预计执行」= 按当前配置推算、尚未产生实例 ⇒ 复用与「已执行」**同一个** RecordItem 块（虚线皮肤 + 占位字段），
      // 不另写一份块渲染（用户 2026-10-06：用同一个东西）。前置取任务定义的 depends_on。
      const planId = `plan:${item.entry.taskId}:${item.at}`
      const deps = (rowsRef.current.find(row => row.id === item.entry.taskId)?.depends ?? []) as ReadonlyArray<{ id: string }>
      const plannedDeps: ResolvedDependency[] = deps.map(d => ({
        task: d.id, semantics: 'latest_success', instanceId: '', scheduledAt: '', sessionId: null, workspacePath: null, outputs: [],
      }))
      return h(RecordItem, {
        key: planId,
        row: {
          id: planId,
          task_id: item.entry.taskId,
          scheduled_at: item.entry.scheduledAt,
          status: 'pending',
          attempt: 0,
          session_id: null,
          dispatched_at: null,
          finished_at: null,
          outputs: null,
          snapshot: null,
          token_in: null, token_out: null, token_in_cache: null,
          updated_at: item.entry.scheduledAt,
        },
        label: item.entry.title,
        workspace: workspaceOf(item.entry.taskId),
        t,
        tt,
        snapshot: null,
        depTitleOf: nameOf,
        planned: true,
        plannedDeps,
        open: openId === planId,
        onToggle: toggleItem,
        openSession: (sid: string) => { onOpenSession?.(sid) },
        openFile: onOpenFile,
        onViewTask,
        events: null,
        eventsBusy: false,
        eventsError: null,
        crossFmt,
      })
    }
    return h(RecordItem, {
      key: item.row.id,
      row: item.row,
      label: item.name,
      workspace: workspaceOf(item.row.task_id),
      t,
      tt,
      snapshot: snapshots.get(item.row.id) ?? null,
      depTitleOf: nameOf,
      open: openId === item.row.id,
      onToggle: toggleItem,
      openSession: (sid: string) => { onOpenSession?.(sid) },
      openFile: onOpenFile,
      onViewTask,
      events: openId === item.row.id ? eventsCache.get(item.row.id) ?? null : null,
      eventsBusy: openId === item.row.id && eventsBusy,
      eventsError: openId === item.row.id ? eventsError : null,
      crossFmt,
    })
  }

  return h('div', { style: { width: '100%', display: 'flex', justifyContent: 'center' } },
    h('div', { id: PANEL_CONTENT_ID, style: PANEL_CONTENT_STYLE },
      // ── 一行：左 = 月份导航；右 = 图例计数 + 工作区 + 任务（与月份同一行、居右）──
      h('div', { className: 'dsh-tdt-cal-nav' },
        // 双箭头（两个并排 chevron）= 走一年；左/右各一个。
        h(IconButton, {
          variant: 'plain', size: 'md', label: calLabels.prevYear, title: calLabels.prevYear,
          icon: h('span', { style: { display: 'inline-flex', alignItems: 'center' } },
            h('span', { style: { display: 'inline-flex' } }, h(IconChevronLeftOutlineRegular, { size: 15 })),
            h('span', { style: { display: 'inline-flex', marginLeft: -9 } }, h(IconChevronLeftOutlineRegular, { size: 15 }))),
          onClick: () => { stepYear(-1) },
        }),
        // 单箭头 = 走一个月。
        h(IconButton, {
          variant: 'plain', size: 'md', label: calLabels.prevMonth, title: calLabels.prevMonth,
          icon: h(IconChevronLeftOutlineRegular, { size: 16 }),
          onClick: () => { stepMonth(-1) },
        }),
        h('span', { className: 'dsh-tdt-cal-title' }, calLabels.monthTitle(y, m)),
        h(IconButton, {
          variant: 'plain', size: 'md', label: calLabels.nextMonth, title: calLabels.nextMonth,
          icon: h(IconChevronRightOutlineRegular, { size: 16 }),
          onClick: () => { stepMonth(1) },
        }),
        h(IconButton, {
          variant: 'plain', size: 'md', label: calLabels.nextYear, title: calLabels.nextYear,
          icon: h('span', { style: { display: 'inline-flex', alignItems: 'center' } },
            h('span', { style: { display: 'inline-flex' } }, h(IconChevronRightOutlineRegular, { size: 15 })),
            h('span', { style: { display: 'inline-flex', marginLeft: -9 } }, h(IconChevronRightOutlineRegular, { size: 15 }))),
          onClick: () => { stepYear(1) },
        }),
        h(Button, { variant: 'outline', size: 'sm', onClick: goToday }, calLabels.today),
        h('div', { className: 'dsh-tdt-cal-right' },
          h(SelectField, {
            value: workspace,
            options: workspaceOptions,
            onChange: changeWorkspace,
            placeholder: t('listFilterWorkspaceAll'),
            emptyLabel: t('editorNoOptions'),
            ariaLabel: t('listFilterWorkspaceAll'),
            size: 'md',
            width: 120,
          }),
          h(TaskPicker, {
            value: taskId,
            onChange: setTaskId,
            allOption: { value: '', label: t('listFilterTaskAll') },
            options: tasks,
            scope: workspace,
            placeholder: t('recordsTaskPh'),
            emptyLabel: t('editorNoOptions'),
            ariaLabel: t('recordsTaskPh'),
            searchPlaceholder: t('recordsTaskSearch'),
            moreLabel: t('recordsMore'),
            collapseLabel: t('recordsCollapse'),
            outOfScopeHint: t('recordsOutOfScope'),
            size: 'md',
            width: 150,
          }),
        ),
      ),

      // 加载走页面右下角统一的那个 Loading（与执行记录页同一条规矩）。
      loading ? h(Loading, {}) : null,
      error !== null
        ? h('div', { className: 'dsh-tdt-cal-hint' },
            `${t('calLoadFail')}：${error}`,
            h(Button, { variant: 'outline', size: 'sm', onClick: () => { void load() } }, t('calRetry')),
          )
        : null,
      truncated ? h('div', { className: 'dsh-tdt-cal-hint' }, t('calTruncated')) : null,

      // ── 月历网格（按周分块：选中日所在那周的下面插拉开区）──
      h('div', { className: 'dsh-tdt-cal-head' },
        t('calWeekdays').split('|').map(name => h('div', { key: name }, name)),
      ),
      h('div', { className: 'dsh-tdt-cal-grid' },
        weeks.map(week => {
          const hasSel = week.some(cell => cell.iso === selected)
          return h(Fragment, { key: week[0]?.iso ?? '' },
          week.map(cell => {
            // 补位格（相邻月）：淡化、不可点、**不放数据**（那不是本月的日程）。
            if (!cell.inMonth) {
              return h('div', { key: cell.iso, className: 'dsh-tdt-cal-cell dsh-tdt-cal-cell--out' },
                h('span', { className: 'dsh-tdt-cal-num dsh-tdt-cal-num--out' }, String(cell.day)),
              )
            }
            const items = byDay.get(cell.iso) ?? []
            return h('button', {
              key: cell.iso,
              type: 'button',
              // 只有**点开的那一块**加顶部那条线（其余格子保持原样）。
              className: `dsh-tdt-cal-cell${cell.iso === selected ? ' dsh-tdt-cal-cell--sel' : ''}`,
              // 点格子 = 拉开 / 收起这一天（手风琴：同一天再点即收起）。
              onClick: () => {
                setSelected(cell.iso === selected ? '' : cell.iso)
                setOpenId(null)
              },
            },
              h('span', { className: 'dsh-tdt-cal-daterow' },
                h('span', { className: `dsh-tdt-cal-num${cell.isToday ? ' dsh-tdt-cal-num--today' : ''}` }, String(cell.day)),
                cell.isToday ? h('span', { className: 'dsh-tdt-cal-today' }, ` · ${t('calToday')}`) : null,
              ),
              // 方形小标签：3 列 × 3 行 = 9 个位子，前 8 位放时刻，第 9 位放「还有 N 条」。
              // 悬停提示走 DSH 原生 Tooltip（用户 2026-10-06：原生 title 反应太慢），不是手搓。
              h('div', { className: 'dsh-tdt-cal-tags' },
                items.slice(0, CELL_CAP - 1).map(item => item.kind === 'done'
                  ? h(Tooltip, {
                    side: 'top',
                    label: `${hhmmOf(item.at)} ${item.name} · ${statusTextOf(item.row.status, t)}`,
                  }, h('div', {
                    key: item.row.id,
                    className: `dsh-tdt-cal-tag dsh-tdt-cal-t--${statusToneOf(item.row.status)}`,
                  }, h('span', null, hhmmOf(item.at))))
                  : h(Tooltip, {
                    side: 'top',
                    label: `${hhmmOf(item.at)} ${item.entry.title}（${t('calPlanHint')}）`,
                  }, h('div', {
                    key: `p:${item.entry.taskId}:${item.at}`,
                    className: 'dsh-tdt-cal-tag dsh-tdt-cal-tag--plan',
                  }, h('span', null, hhmmOf(item.at))))),
                items.length > CELL_CAP - 1
                  ? h(Tooltip, {
                    side: 'top',
                    label: tt('calCellMore', { n: items.length - (CELL_CAP - 1) }),
                  }, h('div', {
                    className: 'dsh-tdt-cal-tag dsh-tdt-cal-tag--more',
                  }, h('span', null, `…${items.length - (CELL_CAP - 1)}`)))
                  : null,
              ),
            )
          }),
          hasSel
            ? h('div', { className: 'dsh-tdt-cal-panel' },
                h('div', { className: 'dsh-tdt-cal-panel-head' },
                  h(IconClockOutlineRegular, { size: 12, className: 'dsh-tdt-cal-clock' }),
                  h('span', { className: 'dsh-tdt-cal-date' }, dayFormatter === null ? selected : dayFormatter.format(new Date(`${selected}T00:00:00`))),
                  h('span', { className: 'dsh-tdt-cal-sep' }, '·'),
                  h('span', { className: 'dsh-tdt-cal-weekday' }, weekdayFormatter === null ? '' : weekdayFormatter.format(new Date(`${selected}T00:00:00`))),
                  h('span', { className: 'dsh-tdt-cal-sep' }, '·'),
                  h('span', { className: 'dsh-tdt-cal-mini' }, tt('recordsDayCount', { n: dayItems.length })),
                ),
                dayItems.length === 0
                  ? h('div', { className: 'dsh-tdt-cal-empty' }, loaded ? t('calDayEmpty') : t('calEmpty'))
                  : h('div', { className: 'dsh-tdt-cal-panel-list' }, dayItems.map(panelItemNode)),
              )
            : null,
          )
        }),
      ),
    ),
  )
}
