// task-calendar.tsx — 任务日程页（月历视图，2026-10-05）
//
// 形态：**一个自然月一页**的日历，格子里同时填两种东西 ——
//   ① **已发生**：`task_instances` 的真实行（成功 / 失败 / 跳过 / 运行中 / 未知，状态色**实心**小点）；
//   ② **计划**：按**当前任务定义**现算的未来刻度（**虚线空心**点，见 `calendar-plan.ts`）。
// 点某一天 ⇒ 下方清单列出当天全部条目（不发起请求：整月行已在内存）。
//
// ⚠️ 两态必须分得清：未来**没有实例行**（决策 31 懒建行：到点才 INSERT，不预建）⇒ ② 是
// 「按现在的配置推算出来的计划」，任务改配置 / 停用后会跟着变 —— 真实计算、不是模拟数据
// （AGENTS.md 第五条：正常功能一律真实取数，禁止模拟）。悬停与图例都要如实说明这一点。
//
// 取数：历史走 `GET /tasks/instances?light=1`（`fetchInstancesLite`，一次取满整月、不含 snapshot 大列）；
// 未来走浏览器内的 `planEntriesByDay`（与服务端同一份纯核，不许另写 cron 解析）。
// 状态名 / 色调 / 过滤桶一律走 `status-text.ts` 单源；月历网格走 UI 基础层的 `buildMonthCells`。
import { createElement as h, useCallback, useEffect, useMemo, useRef, useState, type CSSProperties } from 'react'
import { IconChevronLeftOutlineRegular, IconChevronRightOutlineRegular } from '@deepseek-ai/dsh-client-ui-primitives'
import { pad2 } from './format'
import { fetchInstancesLite, type InstanceRow } from './query'
import { statusesOfBucket, statusTextOf, statusToneOf } from './status-text'
import { monthRangeOf, monthRangeQuery, planEntriesByDay, type CalendarPlanEntry, type CalendarTask } from '../calendar-plan.js'
import { logicalDateOf } from '../schedule-next.js'
import {
  Button, IconButton, Loading, PANEL_CONTENT_ID, PANEL_CONTENT_STYLE, Segmented, SelectField, TaskPicker,
  applyStyle, buildMonthCells,
} from './ui'
import type { EditorOption, TaskOption } from './ui'
// 无时刻的占位走**共享层单源**（`NO_TIME`，与基础信息面板同一份），不在这里另写一份 `--:--`。
import { NO_TIME } from './task-info'
import { calendarLabelsOf } from './editor-fields'
import { interpolateTranslate, type Translate } from './locales'
import type { TaskOverviewRow } from './task-list'

/** 单格最多列几条（再多就收成 `+N`，格子高度不跟着条目数涨）。 */
const MAX_CELL_ITEMS = 3

// ── 样式（走基础层注入器；只消费 var(--tdt-*)，不自建 <style>、不硬编码色值）──
const CALENDAR_CSS = `
/* 月份导航行 */
.dsh-tdt-cal-nav{display:flex;align-items:center;gap:var(--tdt-space-2);margin-bottom:var(--tdt-space-3);}
.dsh-tdt-cal-title{font-size:var(--tdt-font-lg);line-height:var(--tdt-line-lg);font-weight:600;color:var(--tdt-fg);}
.dsh-tdt-cal-legend{display:flex;align-items:center;gap:var(--tdt-space-3);margin-left:auto;
  font-size:var(--tdt-font-xs);color:var(--tdt-fg-3);}
.dsh-tdt-cal-legend>span{display:flex;align-items:center;gap:4px;}
/* 网格：1px 间隙 + 底色当线（不画外框，与执行记录页「无外框」同基调） */
.dsh-tdt-cal-head{display:grid;grid-template-columns:repeat(7,1fr);gap:1px;margin-bottom:var(--tdt-space-1);}
.dsh-tdt-cal-head>div{text-align:center;font-size:var(--tdt-font-xs);line-height:var(--tdt-line-sm);color:var(--tdt-fg-3);}
.dsh-tdt-cal-grid{display:grid;grid-template-columns:repeat(7,1fr);gap:1px;
  background:var(--tdt-border-faint);border:1px solid var(--tdt-border-faint);border-radius:var(--tdt-radius-md);overflow:hidden;}
.dsh-tdt-cal-cell{display:flex;flex-direction:column;gap:2px;min-height:88px;padding:6px;
  background:var(--tdt-surface-1);border:0;font:inherit;text-align:left;cursor:pointer;
  transition:background var(--tdt-dur-fast) var(--tdt-ease);}
.dsh-tdt-cal-cell:hover{background:var(--tdt-hover);}
/* 补位格（相邻月）：淡化、**不放数据**、不可点 */
.dsh-tdt-cal-cell--out{background:var(--tdt-surface-2);cursor:default;}
.dsh-tdt-cal-cell--out:hover{background:var(--tdt-surface-2);}
.dsh-tdt-cal-cell--sel{box-shadow:inset 0 0 0 2px var(--tdt-accent);}
.dsh-tdt-cal-num{align-self:flex-start;min-width:20px;padding:0 4px;border-radius:999px;text-align:center;
  font-size:var(--tdt-font-sm);line-height:18px;color:var(--tdt-fg-2);}
.dsh-tdt-cal-num--today{background:var(--tdt-accent);color:var(--tdt-fg-inverse);font-weight:600;}
.dsh-tdt-cal-num--out{color:var(--tdt-fg-4);}
/* 条目（格内 / 清单内同一套皮肤） */
.dsh-tdt-cal-item{display:flex;align-items:center;gap:5px;min-width:0;
  font-size:var(--tdt-font-xs);line-height:var(--tdt-line-xs);color:var(--tdt-fg-2);}
.dsh-tdt-cal-name{overflow:hidden;text-overflow:ellipsis;white-space:nowrap;}
.dsh-tdt-cal-time{color:var(--tdt-fg-3);font-variant-numeric:tabular-nums;}
.dsh-tdt-cal-dot{flex:none;width:7px;height:7px;border-radius:50%;background:var(--cal-tone,var(--tdt-fg-4));}
/* 计划 = **虚线空心**（与「已发生」的实心点一眼分得开） */
.dsh-tdt-cal-dot--plan{background:transparent;border:1px dashed var(--tdt-fg-4);}
.dsh-tdt-cal-more{font-size:var(--tdt-font-xs);line-height:var(--tdt-line-xs);color:var(--tdt-fg-3);}
/* 语义色调 → 本域局部变量（token 只在 ui/tokens.ts 定义，这里只做映射） */
.dsh-tdt-cal-t--ok{--cal-tone:var(--tdt-success);--cal-soft:var(--tdt-success-soft);}
.dsh-tdt-cal-t--bad{--cal-tone:var(--tdt-danger);--cal-soft:var(--tdt-danger-soft);}
.dsh-tdt-cal-t--warn{--cal-tone:var(--tdt-warning);--cal-soft:var(--tdt-warning-soft);}
.dsh-tdt-cal-t--busy{--cal-tone:var(--tdt-business);--cal-soft:var(--tdt-business-soft);}
.dsh-tdt-cal-t--neutral{--cal-tone:var(--tdt-fg-4);--cal-soft:var(--tdt-chip-bg);}
/* 选中日清单 */
.dsh-tdt-cal-list{margin-top:var(--tdt-space-3);display:flex;flex-direction:column;gap:var(--tdt-space-1);}
.dsh-tdt-cal-row{display:flex;align-items:center;gap:var(--tdt-space-2);padding:7px 10px;
  border-radius:var(--tdt-radius-sm);font-size:var(--tdt-font-sm);line-height:var(--tdt-line-sm);
  background:var(--cal-soft,transparent);}
.dsh-tdt-cal-row--plan{background:transparent;border:1px dashed var(--tdt-border-strong);}
.dsh-tdt-cal-note{flex:1 1 100%;font-size:var(--tdt-font-xs);color:var(--tdt-fg-3);}
.dsh-tdt-cal-tag{flex:none;font-size:var(--tdt-font-xs);color:var(--tdt-fg-3);}
.dsh-tdt-cal-hint{margin-top:var(--tdt-space-2);font-size:var(--tdt-font-xs);color:var(--tdt-danger);}
.dsh-tdt-cal-empty{padding:28px 0;text-align:center;font-size:var(--tdt-font-md);color:var(--tdt-fg-3);}
`
const CALENDAR_DOMAIN = 'domain:calendar'

const filterRowStyle: CSSProperties = {
  display: 'flex', alignItems: 'center', gap: 'var(--tdt-space-2)', flexWrap: 'wrap', marginBottom: 'var(--tdt-space-3)',
}
const filterRightStyle: CSSProperties = {
  display: 'flex', alignItems: 'center', gap: 'var(--tdt-space-2)', marginLeft: 'auto', flexWrap: 'wrap',
}

/** 状态分段档（'' = 全部；其余走 `status-text.ts` 的桶单源，与执行记录页同一份）。 */
type StatusBucket = '' | 'succeeded' | 'failed' | 'running'

/** 格内 / 清单内的统一条目：已发生（真实行）与计划（现算）两种。 */
type CalItem =
  | { kind: 'done'; at: string; row: InstanceRow; name: string }
  | { kind: 'plan'; at: string; entry: CalendarPlanEntry }

/** `HH:mm`（格子与清单只到分钟：计划时刻本来就没有秒的意义）。 */
function hhmmOf(iso: string): string {
  const ms = Date.parse(iso)
  if (Number.isNaN(ms)) return NO_TIME
  const d = new Date(ms)
  return `${pad2(d.getHours())}:${pad2(d.getMinutes())}`
}

/** 月键 `YYYY-MM`（选中日是否还落在新月内，用它比）。 */
const monthKeyOf = (y: number, m: number): string => `${y}-${pad2(m)}`

/** 一条条目的画法（格子与清单共用 ⇒ 两态的观感只有一份定义）。 */
function itemNode(item: CalItem, t: Translate, onOpenSession?: (sessionId: string) => void): ReturnType<typeof h> {
  const time = hhmmOf(item.at)
  if (item.kind === 'plan') {
    return h('div', {
      key: `p:${item.entry.taskId}:${item.at}`,
      className: 'dsh-tdt-cal-item',
      title: `${t('calPlanHint')}（${time}）`,
    },
      h('i', { className: 'dsh-tdt-cal-dot dsh-tdt-cal-dot--plan' }),
      h('span', { className: 'dsh-tdt-cal-time' }, time),
      h('span', { className: 'dsh-tdt-cal-name' }, item.entry.title),
      h('span', { className: 'dsh-tdt-cal-tag' }, t('calPlanTag')),
    )
  }
  const tone = statusToneOf(item.row.status)
  const sid = item.row.session_id
  return h('div', { key: item.row.id, className: `dsh-tdt-cal-row dsh-tdt-cal-t--${tone}` },
    h('i', { className: 'dsh-tdt-cal-dot' }),
    h('span', { className: 'dsh-tdt-cal-time' }, time),
    h('span', { className: 'dsh-tdt-cal-name' }, item.name),
    h('span', { className: 'dsh-tdt-cal-tag' }, statusTextOf(item.row.status, t)),
    h('span', { style: { flex: '1 1 auto' } }),
    // 失败 / 跳过原因（服务端由 task_events 推导，轻量行同样带回）
    item.row.note ? h('span', { className: 'dsh-tdt-cal-note' }, item.row.note) : null,
    sid !== null && onOpenSession !== undefined
      ? h(Button, { variant: 'ghost', size: 'sm', className: 'dsh-tdt-btn--link', onClick: () => { onOpenSession(sid) } }, t('viewSession'))
      : null,
  )
}

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
}

/** 任务日程页（月历）。 */
export function TaskCalendarView(props: TaskCalendarProps): ReturnType<typeof h> {
  applyStyle(CALENDAR_DOMAIN, CALENDAR_CSS)
  const { t, rows, tasks, workspaces, onOpenSession } = props
  const tt = useMemo(() => interpolateTranslate(t), [t])
  const calLabels = useMemo(() => calendarLabelsOf(t), [t])

  const today = useMemo(() => logicalDateOf(new Date(), undefined), [])
  const [cursor, setCursor] = useState<{ y: number; m: number }>(() => {
    const now = new Date()
    return { y: now.getFullYear(), m: now.getMonth() + 1 }
  })
  const [selected, setSelected] = useState(today)
  const [workspace, setWorkspace] = useState('')
  const [bucket, setBucket] = useState<StatusBucket>('')
  const [taskId, setTaskId] = useState('')
  const [instances, setInstances] = useState<readonly InstanceRow[]>([])
  const [loading, setLoading] = useState(false)
  const [loaded, setLoaded] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [truncated, setTruncated] = useState(false)
  /** 「现在」的时刻（计划只算 >= now 的刻度）：每次取数成功后跟着刷新一次。 */
  const [now, setNow] = useState(() => Date.now())

  const seqRef = useRef(0)
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

  // 历史：整月一次取满（轻量行，不含 snapshot）⇒ 点某天不再发起请求。
  const load = useCallback((): void => {
    const seq = seqRef.current + 1
    seqRef.current = seq
    setLoading(true)
    setError(null)
    const q = monthRangeQuery(y, m)
    fetchInstancesLite({
      workspace: workspace === '' ? undefined : workspace,
      statuses: bucket === '' ? undefined : statusesOfBucket(bucket),
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
  }, [y, m, workspace, bucket, taskId])

  useEffect(() => { void load(); return () => { seqRef.current += 1 } }, [load])

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
    // 计划**没有状态**：一旦选了具体状态档就不并入（不把没状态的东西混进状态筛选结果里）。
    if (bucket === '') {
      for (const [day, entries] of planByDay) {
        const list = out.get(day) ?? []
        for (const entry of entries) list.push({ kind: 'plan', at: entry.scheduledAt, entry })
        out.set(day, list)
      }
    }
    for (const list of out.values()) list.sort((a, b) => (a.at < b.at ? -1 : a.at > b.at ? 1 : 0))
    return out
  }, [instances, planByDay, bucket, nameOf])

  const workspaceOptions = useMemo<EditorOption[]>(
    () => [{ value: '', label: t('listFilterWorkspaceAll') }, ...workspaces],
    [workspaces, t],
  )
  const statusItems = useMemo(() => ([
    { value: 'all' as const, label: t('filterAll') },
    { value: 'succeeded' as const, label: statusTextOf('succeeded', t) },
    { value: 'failed' as const, label: statusTextOf('failed', t) },
    { value: 'running' as const, label: t('filterRunning') },
  ]), [t])
  const dayFormatter = useMemo<Intl.DateTimeFormat | null>(
    () => (typeof Intl === 'undefined' ? null : new Intl.DateTimeFormat(t('localeTag'), { month: 'long', day: 'numeric', weekday: 'long' })),
    [t],
  )

  const stepMonth = useCallback((delta: number): void => {
    setCursor(cur => {
      const d = new Date(cur.y, cur.m - 1 + delta, 1)
      const next = { y: d.getFullYear(), m: d.getMonth() + 1 }
      // 选中日跟随：还在新月内就保持，否则落在新月 1 号。
      setSelected(sel => (sel.slice(0, 7) === monthKeyOf(next.y, next.m) ? sel : `${monthKeyOf(next.y, next.m)}-01`))
      return next
    })
  }, [])
  const goToday = useCallback((): void => {
    const now = new Date()
    setCursor({ y: now.getFullYear(), m: now.getMonth() + 1 })
    setSelected(today)
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
  const monthCount = useMemo(() => {
    let n = 0
    for (const list of byDay.values()) n += list.length
    return n
  }, [byDay])

  return h('div', { style: { width: '100%', display: 'flex', justifyContent: 'center' } },
    h('div', { id: PANEL_CONTENT_ID, style: PANEL_CONTENT_STYLE },
      // ── 过滤行（与执行记录页同款：左 = 状态四档；右 = 工作区 + 任务）──
      h('div', { style: filterRowStyle },
        h(Segmented<StatusBucket | 'all'>, {
          value: bucket === '' ? 'all' : bucket,
          size: 'md',
          label: t('colStatus'),
          items: statusItems,
          onChange: (next: StatusBucket | 'all') => { setBucket(next === 'all' ? '' : next) },
        }),
        h('div', { style: filterRightStyle },
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

      // ── 月份导航（日期维度只有这一处：上月 / 标题 / 下月 + 今天 + 两态图例）──
      h('div', { className: 'dsh-tdt-cal-nav' },
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
        h(Button, { variant: 'outline', size: 'sm', onClick: goToday }, calLabels.today),
        h('span', { className: 'dsh-tdt-cal-legend' },
          h('span', null,
            h('i', { className: 'dsh-tdt-cal-dot dsh-tdt-cal-t--ok' }),
            t('calLegendDone'),
          ),
          h('span', null,
            h('i', { className: 'dsh-tdt-cal-dot dsh-tdt-cal-dot--plan' }),
            t('calLegendPlan'),
          ),
          h('span', null, tt('recordsDayCount', { n: monthCount })),
        ),
      ),

      // 加载走页面右下角统一的那个 Loading（与执行记录页同一条规矩）。
      loading ? h(Loading, { label: t('calLoading') }) : null,
      error !== null
        ? h('div', { className: 'dsh-tdt-cal-hint' },
            `${t('calLoadFail')}：${error}`,
            h(Button, { variant: 'outline', size: 'sm', onClick: () => { void load() } }, t('calRetry')),
          )
        : null,
      truncated ? h('div', { className: 'dsh-tdt-cal-hint' }, t('calTruncated')) : null,

      // ── 月历网格 ──
      h('div', { className: 'dsh-tdt-cal-head' },
        calLabels.weekdays.map(name => h('div', { key: name }, name)),
      ),
      h('div', { className: 'dsh-tdt-cal-grid' },
        cells.map(cell => {
          // 补位格（相邻月）：淡化、不可点、**不放数据**（那不是本月的日程）。
          if (!cell.inMonth) {
            return h('div', { key: cell.iso, className: 'dsh-tdt-cal-cell dsh-tdt-cal-cell--out' },
              h('span', { className: 'dsh-tdt-cal-num dsh-tdt-cal-num--out' }, String(cell.day)),
            )
          }
          const items = byDay.get(cell.iso) ?? []
          const shown = items.slice(0, MAX_CELL_ITEMS)
          return h('button', {
            key: cell.iso,
            type: 'button',
            className: `dsh-tdt-cal-cell${cell.iso === selected ? ' dsh-tdt-cal-cell--sel' : ''}`,
            onClick: () => { setSelected(cell.iso) },
          },
            h('span', {
              className: `dsh-tdt-cal-num${cell.isToday ? ' dsh-tdt-cal-num--today' : ''}`,
            }, String(cell.day)),
            shown.map((item, index) => item.kind === 'done'
              ? h('div', {
                key: `${item.row.id}:${index}`,
                className: `dsh-tdt-cal-item dsh-tdt-cal-t--${statusToneOf(item.row.status)}`,
                title: `${hhmmOf(item.at)} ${item.name} · ${statusTextOf(item.row.status, t)}`,
              },
                h('i', { className: 'dsh-tdt-cal-dot' }),
                h('span', { className: 'dsh-tdt-cal-time' }, hhmmOf(item.at)),
                h('span', { className: 'dsh-tdt-cal-name' }, item.name),
              )
              : h('div', {
                key: `p:${item.entry.taskId}:${item.at}`,
                className: 'dsh-tdt-cal-item',
                title: `${t('calPlanHint')}（${hhmmOf(item.at)}）`,
              },
                h('i', { className: 'dsh-tdt-cal-dot dsh-tdt-cal-dot--plan' }),
                h('span', { className: 'dsh-tdt-cal-time' }, hhmmOf(item.at)),
                h('span', { className: 'dsh-tdt-cal-name' }, item.entry.title),
              )),
            items.length > shown.length ? h('span', { className: 'dsh-tdt-cal-more' }, `+${items.length - shown.length}`) : null,
          )
        }),
      ),

      // ── 选中日清单（本地过滤，不发起请求）──
      h('div', { className: 'dsh-tdt-cal-list' },
        h('div', { className: 'dsh-tdt-cal-title' },
          dayFormatter === null ? selected : dayFormatter.format(new Date(`${selected}T00:00:00`)),
        ),
        dayItems.length === 0
          ? h('div', { className: 'dsh-tdt-cal-empty' }, loaded ? t('calDayEmpty') : t('calEmpty'))
          : dayItems.map(item => itemNode(item, t, onOpenSession)),
      ),
    ),
  )
}
