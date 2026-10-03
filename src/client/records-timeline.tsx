// records-timeline.tsx — 执行记录总查询页（时间轴）
//
// 形态：查**全部任务**的执行流水账（`task_instances` 全表），按天分组的时间轴，整体倒序。
// 规格 = docs/design/features/execution-timeline.md；过程 = docs/worklog/execution-timeline.md。
//
// ⚠️ 与「卡片展开区的单任务执行记录面板」是两个功能（表格 vs 时间轴、全量 vs 单任务），别混。
//
// 取数：**只走 `GET /tasks/instances`**（`fetchInstances`），不再吃调试快照 —— 游标分页 + 服务端排序
// （`scheduled_at DESC, id DESC`），客户端**不二次排序**（规格 §四）。
import { createElement as h, useCallback, useEffect, useMemo, useRef, useState, type CSSProperties } from 'react'
import { formatDurationHms, pad2 } from './format'
import { fetchInstances, type InstanceRow } from './query'
import { statusTextOf } from './status-text'
import { MarqueeText, SelectField, TaskPicker, TimeRange, applyStyle, rangeToQuery } from './ui'
import type { EditorOption, TaskOption, TimeRangeLabels, TimeRangeValue } from './ui'
import { calendarLabelsOf, timeLabelsOf } from './editor-fields'
import type { Translate } from './locales'

/** 每页条数（用户拍板「20 或 50，具体再看」⇒ 取 50）。 */
const PAGE_SIZE = 50
/** 硬上限：到此停止自动续拉并提示缩小范围（用户拍板「保底 2000 条」）。 */
const HARD_LIMIT = 2000
/** 默认时间档：最近 3 天（含今天）。 */
const DEFAULT_DAYS = 3

// ── 样式（走基础层注入器，不自建 <style>；只消费 var(--tdt-*)）──
const RECORDS_CSS = `
/* ── 执行记录时间轴 ──────────────────────────────────────────────────────
   节奏靠「天标签 + 竖轴 + 左缘色条」建立；块本身不带底色，只有 hover 才泛蓝，
   免得一屏几十条时满屏色块发噪。 */
.dsh-tdt-rec-tl{display:flex;flex-direction:column;}
/* 天标签吸顶：长列表里始终知道自己在哪一天（用户 2026-10-04 同意）。 */
.dsh-tdt-rec-day{position:sticky;top:0;z-index:1;padding:10px 0 6px;background:var(--tdt-surface-base);}
.dsh-tdt-rec-daylabel{font-size:var(--tdt-font-lg);font-weight:600;color:var(--tdt-fg);line-height:var(--tdt-line-md);}
.dsh-tdt-rec-daycount{margin-left:8px;font-size:var(--tdt-font-xs);color:var(--tdt-fg-3);}
/* 竖轴：贯穿当天所有块（极浅描边，只起「串起来」的作用）。 */
.dsh-tdt-rec-axis{margin-left:6px;padding-left:16px;border-left:1px solid var(--tdt-border-faint);}
.dsh-tdt-rec-block{position:relative;display:flex;align-items:baseline;gap:10px;width:100%;margin:0 0 4px;padding:7px 10px;
  border:0;border-radius:var(--tdt-radius-sm);background:transparent;color:var(--tdt-fg);font:inherit;text-align:left;
  animation:dsh-tdt-rec-in 160ms ease;}
.dsh-tdt-rec-block--on{cursor:pointer;}
.dsh-tdt-rec-block--on:hover{background:var(--tdt-card-hover);}
/* 成败只靠这条色条表达（用户点名：不用图标）。 */
.dsh-tdt-rec-bar{position:absolute;left:0;top:6px;bottom:6px;width:4px;border-radius:2px;background:var(--tdt-fg-3);}
.dsh-tdt-rec-bar--run{animation:dsh-tdt-rec-pulse 1.4s ease-in-out infinite;}
@keyframes dsh-tdt-rec-pulse{0%,100%{opacity:1}50%{opacity:.35}}
@keyframes dsh-tdt-rec-in{from{opacity:0;transform:translateY(-2px)}to{opacity:1;transform:none}}
@media (prefers-reduced-motion: reduce){.dsh-tdt-rec-bar--run{animation:none}.dsh-tdt-rec-block{animation:none}}
/* 时刻：等宽数字 ⇒ 一列对齐、不因字宽不同而左右蹦。 */
.dsh-tdt-rec-time{flex:none;font-family:var(--tdt-font-mono,ui-monospace,monospace);font-variant-numeric:tabular-nums;
  font-size:var(--tdt-font-md);color:var(--tdt-fg-2);}
.dsh-tdt-rec-title{flex:1 1 auto;min-width:0;font-size:var(--tdt-font-md);}
.dsh-tdt-rec-meta{flex:none;font-size:var(--tdt-font-xs);color:var(--tdt-fg-3);}
.dsh-tdt-rec-foot{padding:12px 0 4px;text-align:center;font-size:var(--tdt-font-xs);color:var(--tdt-fg-3);}
`
const RECORDS_DOMAIN = 'domain:records'

const filterRowStyle: CSSProperties = {
  display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap', marginBottom: '10px',
}
const centerStyle: CSSProperties = { width: '100%', display: 'flex', justifyContent: 'center' }
const mainStyle: CSSProperties = { width: '100%', maxWidth: '1120px', minWidth: '760px', boxSizing: 'border-box' }
const emptyStyle: CSSProperties = { padding: '32px 0', textAlign: 'center', fontSize: 'var(--tdt-font-md)', color: 'var(--tdt-fg-3)' }

/** `YYYY-MM-DD`（本地日历日，只用于拼默认时间档）。 */
function ymdOf(d: Date): string {
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`
}

/** 默认时间档：最近 N 天（含今天）。 */
function defaultRange(): TimeRangeValue {
  const now = new Date()
  const from = new Date(now)
  from.setDate(from.getDate() - (DEFAULT_DAYS - 1))
  return { from: ymdOf(from), to: ymdOf(now) }
}

/** `HH:mm`（计划时刻本来就没有秒，与服务端刻度口径一致）。 */
function hmOf(iso: string): string {
  const ms = Date.parse(iso)
  if (Number.isNaN(ms)) return '--'
  const d = new Date(ms)
  return `${pad2(d.getHours())}:${pad2(d.getMinutes())}`
}

/** 天标签：`2026 年 4 月 30 日` / `April 30, 2026`（按当前语言，走 `Intl`）。 */
function dayLabelOf(key: string, t: Translate): string {
  const parts = key.split('-')
  const y = Number(parts[0])
  const m = Number(parts[1])
  const d = Number(parts[2])
  if (!Number.isFinite(y) || !Number.isFinite(m) || !Number.isFinite(d)) return key
  if (typeof Intl === 'undefined') return `${y} 年 ${m} 月 ${d} 日`
  return new Intl.DateTimeFormat(t('localeTag'), { year: 'numeric', month: 'long', day: 'numeric' })
    .format(new Date(y, m - 1, d))
}

/** 状态 → 色条颜色（**只消费 token**；不用图标，见规格 §五）。 */
function barColorOf(status: string): string {
  if (status === 'succeeded') return 'var(--tdt-success)'
  if (status === 'failed') return 'var(--tdt-danger)'
  if (status === 'skipped') return 'var(--tdt-warning)'
  if (status === 'dispatched' || status === 'running') return 'var(--tdt-business)'
  return 'var(--tdt-fg-3)'
}
const isRunning = (status: string): boolean => status === 'dispatched' || status === 'running'

/** 次信息：时长（`dispatched_at → finished_at`）；在跑则显示「运行中」。 */
function metaOf(row: InstanceRow, t: Translate): string {
  const statusText = statusTextOf(row.status, t)
  if (isRunning(row.status)) return statusText
  if (row.dispatched_at === null || row.finished_at === null) return statusText
  const ms = Date.parse(row.finished_at) - Date.parse(row.dispatched_at)
  if (!Number.isFinite(ms) || ms < 0) return statusText
  return `${statusText} · ${formatDurationHms(ms)}`
}

/** 一行记录所属的天（服务端 `logical_date` 优先；旧行没有就退回 `scheduled_at` 的日期段）。 */
function dayKeyOf(row: InstanceRow): string {
  const logical = row.logical_date
  if (typeof logical === 'string' && logical.length >= 10) return logical.slice(0, 10)
  return row.scheduled_at.slice(0, 10)
}

export interface RecordsTimelineProps {
  t: Translate
  /** 任务候选（`[编号] 名称` 口径，由父级用 overview 组装）——不只给选择器用，还要按 id 反查标题。 */
  tasks: readonly TaskOption[]
  /** 工作区候选真源（面板级唯一，来自 `GET /options`）；空数组 = 取不到 ⇒ 下拉「暂无可选」。 */
  workspaces: readonly EditorOption[]
  /** 打开归档会话弹窗：**只传会话 id**（快照 / 产出由弹窗自取）。 */
  onOpenSession?: (sessionId: string) => void
}

/** 执行记录总查询页（时间轴）。 */
export function RecordsTimelineView(props: RecordsTimelineProps): ReturnType<typeof h> {
  applyStyle(RECORDS_DOMAIN, RECORDS_CSS)
  const { t, tasks, workspaces, onOpenSession } = props

  const [range, setRange] = useState<TimeRangeValue>(defaultRange)
  const [workspace, setWorkspace] = useState('')
  const [status, setStatus] = useState('')
  const [taskId, setTaskId] = useState('')
  const [rows, setRows] = useState<readonly InstanceRow[]>([])
  const [cursor, setCursor] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const [loaded, setLoaded] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [done, setDone] = useState(false)

  // 请求序号：过滤条件一变就作废旧响应（否则慢的旧请求会盖掉新结果）。
  const seqRef = useRef(0)
  const inFlightRef = useRef(false)

  const calendarLabels = useMemo(() => calendarLabelsOf(t), [t])
  const timeLabels = useMemo(() => timeLabelsOf(t), [t])
  const rangeLabels = useMemo<TimeRangeLabels>(() => ({
    all: t('trAll'), custom: t('trCustom'), from: t('cardFrom'), to: t('cardTo'),
    presets: {
      today: t('trToday'), yesterday: t('trYesterday'), thisWeek: t('trThisWeek'),
      lastWeek: t('trLastWeek'), thisMonth: t('trThisMonth'), lastMonth: t('trLastMonth'),
    },
  }), [t])

  const workspaceOptions = useMemo<EditorOption[]>(
    () => [{ value: '', label: t('listFilterWorkspaceAll') }, ...workspaces],
    [workspaces, t],
  )
  // 状态档：全量七态太长，只给「有判断价值」的四档 + 全部；「运行中」覆盖 `dispatched` / `running` 两态
  // （在跑是一个语义：已派发未跑完都算），与卡片面板「运行中」同义。
  const statusOptions = useMemo<EditorOption[]>(() => ([
    { value: '', label: t('filterAll') },
    { value: 'succeeded', label: statusTextOf('succeeded', t) },
    { value: 'failed', label: statusTextOf('failed', t) },
    { value: 'skipped', label: statusTextOf('skipped', t) },
    { value: 'running', label: statusTextOf('running', t) },
  ]), [t])

  const titleById = useMemo(() => new Map(tasks.map(o => [o.id, o.label])), [tasks])
  /** 过滤签名：变一次就重取第一页（不保留旧结果拼接）。 */
  const filterSig = `${range.from}|${range.to}|${workspace}|${status}|${taskId}`

  const load = useCallback(async (nextCursor: string | null): Promise<void> => {
    if (inFlightRef.current) return
    if (nextCursor === null && rows.length >= HARD_LIMIT) return
    inFlightRef.current = true
    const seq = seqRef.current
    setLoading(true)
    setError(null)
    const q = rangeToQuery(range, 'day')
    const statuses = status === ''
      ? undefined
      : status === 'running' ? ['dispatched', 'running'] : [status]
    try {
      const page = await fetchInstances({
        workspace: workspace === '' ? undefined : workspace,
        statuses,
        taskId: taskId === '' ? undefined : taskId,
        from: q.fromTs,
        to: q.toTs,
        limit: PAGE_SIZE,
        cursor: nextCursor ?? undefined,
      })
      if (seq !== seqRef.current) return
      setRows(prev => (nextCursor === null ? page.rows : [...prev, ...page.rows]))
      setCursor(page.nextCursor)
      setDone(page.nextCursor === null)
    } catch (e) {
      if (seq !== seqRef.current) return
      // 失败**不清空已有列表**（用户已有的流水账不该因为一次失败消失），只给错误态 + 重试。
      setError(e instanceof Error ? e.message : String(e))
    } finally {
      if (seq === seqRef.current) {
        setLoading(false)
        setLoaded(true)
      }
      inFlightRef.current = false
    }
  }, [range, workspace, status, taskId, rows.length])

  // 过滤条件变化 ⇒ 作废在途请求 + 重置列表 + 取第一页。
  useEffect(() => {
    seqRef.current += 1
    inFlightRef.current = false
    setRows([])
    setCursor(null)
    setDone(false)
    setLoaded(false)
    void load(null)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filterSig])

  const loadMore = useCallback((): void => {
    if (loading || done || cursor === null) return
    if (rows.length >= HARD_LIMIT) return
    void load(cursor)
  }, [loading, done, cursor, rows.length, load])

  // 滚到底自动续拉（哨兵元素；在途去重由 `inFlightRef` 兜住，不会重复请求）。
  const sentinelRef = useRef<HTMLDivElement | null>(null)
  useEffect(() => {
    const el = sentinelRef.current
    if (el === null || typeof IntersectionObserver === 'undefined') return
    const io = new IntersectionObserver(entries => {
      if (entries[0]?.isIntersecting === true) loadMore()
    }, { rootMargin: '240px' })
    io.observe(el)
    return () => { io.disconnect() }
  }, [loadMore])

  // 天分组：按取回顺序就地合并（同一天只会有一个天标签，跨页追加亦然）。
  const days = useMemo(() => {
    const out: Array<{ key: string; items: InstanceRow[] }> = []
    for (const row of rows) {
      const key = dayKeyOf(row)
      const last = out[out.length - 1]
      if (last !== undefined && last.key === key) last.items.push(row)
      else out.push({ key, items: [row] })
    }
    return out
  }, [rows])

  const atLimit = rows.length >= HARD_LIMIT
  const hasFilter = range.from !== '' || range.to !== '' || workspace !== '' || status !== '' || taskId !== ''

  return h('div', { style: centerStyle },
    h('div', { id: 'dsh-tdt-records', style: mainStyle },
      // ── 过滤行（控件同高 md 28；改任一条件即重置结果）──
      h('div', { style: filterRowStyle },
        h(TimeRange, {
          value: range, onChange: setRange,
          labels: rangeLabels, calendarLabels, timeLabels,
          precision: 'day', size: 'md',
        }),
        h(SelectField, {
          value: workspace,
          options: workspaceOptions,
          onChange: setWorkspace,
          placeholder: t('listFilterWorkspaceAll'),
          emptyLabel: t('editorNoOptions'),
          ariaLabel: t('listFilterWorkspaceAll'),
          size: 'md',
          width: 180,
        }),
        h(SelectField, {
          value: status,
          options: statusOptions,
          onChange: setStatus,
          placeholder: t('recordsStatusPh'),
          emptyLabel: t('editorNoOptions'),
          ariaLabel: t('recordsStatusPh'),
          size: 'md',
          width: 96,
        }),
        h(TaskPicker, {
          value: taskId,
          onChange: setTaskId,
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
          width: 200,
        }),
      ),

      error !== null && rows.length === 0
        ? h('div', { style: emptyStyle },
            `${t('recordsLoadFail')}：${error}`,
            h('button', {
              type: 'button',
              style: { marginLeft: '8px', color: 'var(--tdt-business)', background: 'transparent', border: 0, cursor: 'pointer', font: 'inherit' },
              onClick: () => { void load(cursor) },
            }, t('recordsRetry')),
          )
        : loaded && rows.length === 0
          ? h('div', { style: emptyStyle }, hasFilter ? t('recordsEmptyFiltered') : t('recordsEmpty'))
          : h('div', { className: 'dsh-tdt-rec-tl' },
              days.map(day => h('div', { key: day.key },
                h('div', { className: 'dsh-tdt-rec-day' },
                  h('span', { className: 'dsh-tdt-rec-daylabel' }, dayLabelOf(day.key, t)),
                  h('span', { className: 'dsh-tdt-rec-daycount' }, t('recordsDayCount').replace('{n}', String(day.items.length))),
                ),
                h('div', { className: 'dsh-tdt-rec-axis' },
                  day.items.map(row => {
                    const clickable = onOpenSession !== undefined && row.session_id !== null && row.session_id !== ''
                    const planned = hmOf(row.scheduled_at)
                    const actual = row.dispatched_at === null ? null : hmOf(row.dispatched_at)
                    // 迟到补跑（实际晚于计划）⇒ 补一句计划时刻，避免用户以为「记错了」。
                    const late = actual !== null && actual !== planned ? t('recordsPlannedAt').replace('{time}', planned) : ''
                    return h(clickable ? 'button' : 'div', {
                      key: row.id,
                      type: clickable ? 'button' : undefined,
                      className: `dsh-tdt-rec-block${clickable ? ' dsh-tdt-rec-block--on' : ''}`,
                      onClick: clickable ? () => { onOpenSession?.(row.session_id as string) } : undefined,
                    },
                      h('span', {
                        className: `dsh-tdt-rec-bar${isRunning(row.status) ? ' dsh-tdt-rec-bar--run' : ''}`,
                        style: { background: barColorOf(row.status) },
                      }),
                      h('span', { className: 'dsh-tdt-rec-time' }, actual ?? planned),
                      h(MarqueeText, {
                        text: titleById.get(row.task_id) ?? row.task_id,
                        title: titleById.get(row.task_id) ?? row.task_id,
                        style: { flex: '1 1 auto', minWidth: 0, fontSize: 'var(--tdt-font-md)' },
                      }),
                      h('span', { className: 'dsh-tdt-rec-meta' }, late === '' ? metaOf(row, t) : `${metaOf(row, t)} · ${late}`),
                    )
                  }),
                ),
              )),
              // ── 加载区：哨兵触发续拉；到底 / 到上限给文案 ──
              h('div', { ref: sentinelRef, style: { height: '1px' } }),
              h('div', { className: 'dsh-tdt-rec-foot' },
                loading
                  ? t('recordsLoading')
                  : atLimit
                    ? t('recordsLimitHint')
                    : done && rows.length > 0
                      ? t('recordsNoMore')
                      : ''),
            ),
    ),
  )
}
