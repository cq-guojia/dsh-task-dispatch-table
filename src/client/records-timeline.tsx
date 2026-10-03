// records-timeline.tsx — 执行记录总查询页（时间轴）
//
// 形态：查**全部任务**的执行流水账（`task_instances` 全表），按天分组的时间轴，整体倒序。
// 规格 = docs/design/features/execution-timeline.md；过程 = docs/worklog/execution-timeline.md。
//
// ⚠️ 与「卡片展开区的单任务执行记录面板」是两个功能（表格 vs 时间轴、单任务 vs 全量），别混。
//
// 取数：**只走 `GET /tasks/instances`**（`fetchInstances`），不吃调试快照 —— 游标分页 + 服务端排序
// （`scheduled_at DESC, id DESC`），客户端**不二次排序**（规格 §四）。
//
// 2026-10-04 评审后修正（三处硬伤，详见 worklog §七）：
//  ① 首屏不再被 2000 上限挡住（上限只拦「续拉」）⇒ 满 2000 后改过滤不会白屏；
//  ② 续拉失败**有提示 + 重试**，且失败即暂停自动续拉（避免哨兵反复触发重试风暴）；
//  ③ `IntersectionObserver` **只建一次**（最新逻辑走 ref）⇒ 不再每页重建、不再「重建即续拉」。
import { createElement as h, memo, useCallback, useEffect, useMemo, useRef, useState, type CSSProperties } from 'react'
import { formatDurationHms, formatTokenCount, pad2 } from './format'
import { fetchInstances, type InstanceRow } from './query'
import { isRunningStatus, statusesOfBucket, statusTextOf, statusToneOf } from './status-text'
import {
  Button, Loading, MarqueeText, PANEL_CONTENT_ID, PANEL_CONTENT_STYLE, SelectField, TaskPicker, TimeRange,
  applyStyle, rangeToQuery,
} from './ui'
import type { EditorOption, TaskOption, TimeRangeLabels, TimeRangeValue } from './ui'
import { calendarLabelsOf, timeLabelsOf } from './editor-fields'
import { interpolateTranslate, type Translate } from './locales'

/** 每页条数（用户拍板「20 或 50，具体再看」⇒ 取 50）。 */
const PAGE_SIZE = 50
/** 硬上限：到此停止自动续拉并提示缩小范围（用户拍板「保底 2000 条」）。 */
const HARD_LIMIT = 2000
/** 默认时间档：最近 3 天（含今天）。 */
const DEFAULT_DAYS = 3
// 不变量自检：上限必须是页大小的整数倍，否则「续拉会越过上限」或「永远到不了上限」。
// 写出来是为了让人改上面两个数字时立刻看见（冒烟也钉这条，见 scripts/smoke.mjs）。
if (HARD_LIMIT % PAGE_SIZE !== 0) console.warn('[tdt] HARD_LIMIT 必须是 PAGE_SIZE 的整数倍')

// ── 样式（走基础层注入器，不自建 <style>；只消费 var(--tdt-*)，间距/时长/z 全走 token）──
const RECORDS_CSS = `
/* ── 执行记录时间轴 ──────────────────────────────────────────────────────
   节奏靠「天标签 + 竖轴 + 左缘色条」建立；块本身不带底色，只有 hover 才泛蓝，
   免得一屏几十条时满屏色块发噪。 */
.dsh-tdt-rec-tl{display:flex;flex-direction:column;}
/* 天标签吸顶：长列表里始终知道自己在哪一天（用户 2026-10-04 同意）。
   ⚠️ 底色必须与宿主页面底色同源（content 容器背景是 transparent）⇒ 吸附时不留异色横带。 */
.dsh-tdt-rec-day{position:sticky;top:0;z-index:var(--tdt-z-sticky);padding:var(--tdt-space-2) 0 var(--tdt-space-1);
  background:var(--tdt-surface-base);}
.dsh-tdt-rec-daylabel{font-size:var(--tdt-font-lg);font-weight:600;color:var(--tdt-fg);line-height:var(--tdt-line-md);}
.dsh-tdt-rec-daycount{margin-left:var(--tdt-space-2);font-size:var(--tdt-font-xs);color:var(--tdt-fg-3);}
/* 竖轴：贯穿当天所有块（极浅描边，只起「串起来」的作用）。 */
.dsh-tdt-rec-axis{margin-left:6px;padding-left:var(--tdt-space-4);border-left:1px solid var(--tdt-border-faint);}
.dsh-tdt-rec-block{position:relative;display:flex;align-items:baseline;gap:var(--tdt-space-2);width:100%;
  margin:0 0 var(--tdt-space-1);padding:6px var(--tdt-space-2) 6px var(--tdt-space-3);
  border:0;border-radius:var(--tdt-radius-sm);background:transparent;color:var(--tdt-fg);font:inherit;text-align:left;
  animation:dsh-tdt-rec-in var(--tdt-dur-fast) var(--tdt-ease);}
.dsh-tdt-rec-block--on{cursor:pointer;}
.dsh-tdt-rec-block--on:hover{background:var(--tdt-card-hover);}
/* 成败只靠这条色条表达（用户点名：不用图标）。 */
.dsh-tdt-rec-bar{position:absolute;left:0;top:6px;bottom:6px;width:4px;border-radius:2px;background:var(--tdt-fg-3);}
.dsh-tdt-rec-bar--run{animation:dsh-tdt-rec-pulse var(--tdt-dur) var(--tdt-ease) infinite;}
@keyframes dsh-tdt-rec-pulse{0%,100%{opacity:1}50%{opacity:.35}}
@keyframes dsh-tdt-rec-in{from{opacity:0;transform:translateY(-2px)}to{opacity:1;transform:none}}
@media (prefers-reduced-motion: reduce){.dsh-tdt-rec-bar--run{animation:none}.dsh-tdt-rec-block{animation:none}}
/* 时刻：等宽数字 ⇒ 一列对齐、不因字宽不同而左右蹦。 */
.dsh-tdt-rec-time{flex:none;font-family:var(--tdt-font-mono);font-variant-numeric:tabular-nums;
  font-size:var(--tdt-font-md);color:var(--tdt-fg-2);}
.dsh-tdt-rec-title{font-size:var(--tdt-font-md);}
.dsh-tdt-rec-meta{flex:none;font-size:var(--tdt-font-xs);color:var(--tdt-fg-3);}
.dsh-tdt-rec-foot{padding:var(--tdt-space-3) 0 var(--tdt-space-1);display:flex;align-items:center;
  justify-content:center;gap:var(--tdt-space-2);font-size:var(--tdt-font-xs);color:var(--tdt-fg-3);}
.dsh-tdt-rec-err{color:var(--tdt-danger);}
`
const RECORDS_DOMAIN = 'domain:records'

const filterRowStyle: CSSProperties = {
  display: 'flex', alignItems: 'center', gap: 'var(--tdt-space-2)', flexWrap: 'wrap', marginBottom: 'var(--tdt-space-3)',
}
const emptyStyle: CSSProperties = {
  padding: '32px 0', textAlign: 'center', fontSize: 'var(--tdt-font-md)', color: 'var(--tdt-fg-3)',
}

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

/** `HH:mm`（计划时刻本来就没有秒，与服务端刻度口径一致）；非法值给占位。 */
function hmOf(iso: string | null): string {
  if (iso === null) return '--'
  const ms = Date.parse(iso)
  if (Number.isNaN(ms)) return '--'
  const d = new Date(ms)
  return `${pad2(d.getHours())}:${pad2(d.getMinutes())}`
}

/**
 * 一行记录所属的「天」= `scheduled_at` 的**本地日历日**。
 *
 * ⚠️ 为什么不用服务端 `logical_date`（2026-10-04 评审）：那个是**任务时区**的日历日，而排序键与
 * 时间范围过滤都是 `scheduled_at`（绝对时刻 / 本地日）⇒ 多时区任务混排时会出现
 * 「04-30 / 05-01 / 04-30」这种非单调序列，把同一天劈成两个同名天标签。分组键与排序键同源才稳。
 */
function dayKeyOf(row: InstanceRow): string {
  const ms = Date.parse(typeof row.scheduled_at === 'string' ? row.scheduled_at : '')
  if (Number.isNaN(ms)) return 'unknown'
  const d = new Date(ms)
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`
}

/** 天标签文案：`2026 年 4 月 30 日` / `April 30, 2026`（按当前语言，走 Intl）。 */
function dayLabelOf(key: string, t: Translate): string {
  const parts = key.split('-')
  const y = Number(parts[0])
  const m = Number(parts[1])
  const day = Number(parts[2])
  // 认不出的 key 原样显示真值（不编造、也不硬编码某种语言的日期格式）。
  if (!Number.isFinite(y) || !Number.isFinite(m) || !Number.isFinite(day)) return key
  if (typeof Intl === 'undefined') return key
  return new Intl.DateTimeFormat(t('localeTag'), { year: 'numeric', month: 'long', day: 'numeric' })
    .format(new Date(y, m - 1, day))
}

/** 语义色调 → 色条颜色（**只消费 token**；哪些状态算哪一档由 `status-text.ts` 判，这里只挑颜色）。 */
function barColorOf(tone: ReturnType<typeof statusToneOf>): string {
  if (tone === 'ok') return 'var(--tdt-success)'
  if (tone === 'bad') return 'var(--tdt-danger)'
  if (tone === 'warn') return 'var(--tdt-warning)'
  if (tone === 'busy') return 'var(--tdt-business)'
  return 'var(--tdt-fg-3)'
}

/** 次信息：状态 · 时长（`dispatched_at → finished_at`）· token（有才显示）。 */
function metaOf(row: InstanceRow, t: Translate): string {
  const parts: string[] = [statusTextOf(row.status, t)]
  if (!isRunningStatus(row.status) && row.dispatched_at !== null && row.finished_at !== null) {
    const ms = Date.parse(row.finished_at) - Date.parse(row.dispatched_at)
    if (Number.isFinite(ms) && ms >= 0) parts.push(formatDurationHms(ms))
  }
  const tokens = (row.token_in ?? 0) + (row.token_out ?? 0)
  if (tokens > 0) parts.push(formatTokenCount(tokens))
  return parts.join(' · ')
}

/** 一个执行块（**memo**：续拉时只有新增行需要 render，已挂的 2000 块不重算）。 */
const RecordBlock = memo(function RecordBlock(props: {
  row: InstanceRow
  label: string
  t: Translate
  tt: Translate
  openSession: (sessionId: string) => void
}): ReturnType<typeof h> {
  const { row, label, t, tt, openSession } = props
  const tone = statusToneOf(row.status)
  const planned = hmOf(row.scheduled_at)
  const actual = hmOf(row.dispatched_at)
  // 迟到补跑（实际派发时刻 ≠ 计划时刻）⇒ 补一句计划时刻，避免用户以为「记错了」。
  const late = row.dispatched_at !== null && row.dispatched_at !== row.scheduled_at
    ? tt('recordsPlannedAt', { time: planned })
    : ''
  const clickable = row.session_id !== null && row.session_id !== ''
  const meta = late === '' ? metaOf(row, t) : `${metaOf(row, t)} · ${late}`
  return h(clickable ? 'button' : 'div', {
    ...(clickable ? { type: 'button' } : {}),
    className: `dsh-tdt-rec-block${clickable ? ' dsh-tdt-rec-block--on' : ''}`,
    onClick: clickable ? () => { openSession(row.session_id as string) } : undefined,
  },
    h('span', {
      className: `dsh-tdt-rec-bar${isRunningStatus(row.status) ? ' dsh-tdt-rec-bar--run' : ''}`,
      style: { background: barColorOf(tone) },
    }),
    h('span', { className: 'dsh-tdt-rec-time' }, row.dispatched_at === null ? planned : actual),
    h(MarqueeText, { text: label, title: label, className: 'dsh-tdt-rec-title', style: { flex: '1 1 auto', minWidth: 0 } }),
    h('span', { className: 'dsh-tdt-rec-meta' }, meta),
  )
})

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
  const tt = useMemo(() => interpolateTranslate(t), [t])

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
  const rowsCountRef = useRef(0)
  rowsCountRef.current = rows.length
  /** 首次进入时的默认档（用来判「用户是否真的动过过滤器」⇒ 决定空态文案）。 */
  const initialRangeRef = useRef<TimeRangeValue>(range)

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
  // 状态档：全量七态太长，只给「有判断价值」的四档 + 全部；「运行中」的成员由 `status-text.ts` 单源决定
  //（与卡片执行记录面板同一个桶，2026-10-04 评审前两页各写一份且语义不同）。
  const statusOptions = useMemo<EditorOption[]>(() => ([
    { value: '', label: t('filterAll') },
    { value: 'succeeded', label: statusTextOf('succeeded', t) },
    { value: 'failed', label: statusTextOf('failed', t) },
    { value: 'running', label: statusTextOf('running', t) },
  ]), [t])

  const titleById = useMemo(() => new Map(tasks.map(o => [o.id, o.label])), [tasks])
  /** 过滤签名：变一次就重取第一页（不保留旧结果拼接）。 */
  const filterSig = `${range.from}|${range.to}|${workspace}|${status}|${taskId}`

  const load = useCallback(async (nextCursor: string | null): Promise<void> => {
    if (inFlightRef.current) return
    inFlightRef.current = true
    const seq = seqRef.current + 1
    seqRef.current = seq
    setLoading(true)
    setError(null)
    const q = rangeToQuery(range, 'day')
    try {
      const page = await fetchInstances({
        workspace: workspace === '' ? undefined : workspace,
        statuses: status === '' ? undefined : statusesOfBucket(status),
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
      // 失败**不清空已有列表**（用户已看到的流水账不该因为一次失败消失），只给错误态 + 重试。
      setError(e instanceof Error ? e.message : String(e))
    } finally {
      if (seq === seqRef.current) {
        setLoading(false)
        setLoaded(true)
        inFlightRef.current = false
      }
    }
  }, [range, workspace, status, taskId])

  // 过滤条件变化（含首次挂载）⇒ 作废在途请求 + 重置列表 + 取第一页。
  // ⚠️ 上限只拦「续拉」（见 loadMore）：首屏永远允许取 ⇒ 满 2000 条后改过滤不会白屏。
  useEffect(() => {
    seqRef.current += 1
    inFlightRef.current = false
    setRows([])
    setCursor(null)
    setDone(false)
    setError(null)
    setLoaded(false)
    void load(null)
    // 卸载 / 重挂时作废在途响应（不留「已卸载还 setState」的尾巴）。
    return () => { seqRef.current += 1 }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filterSig])

  const loadMore = useCallback((): void => {
    if (loading || done || cursor === null) return
    if (error !== null) return          // 失败后暂停自动续拉：等用户点「重试」，避免哨兵反复触发
    if (rowsCountRef.current >= HARD_LIMIT) return
    void load(cursor)
  }, [loading, done, cursor, error, load])

  // 滚到底自动续拉：观察者**只建一次**（最新逻辑走 ref）——
  // 2026-10-04 评审：此前依赖数组含分页状态 ⇒ 每页重建 3~4 次，新建即触发一次 entry（重建即续拉）。
  const sentinelRef = useRef<HTMLDivElement | null>(null)
  const loadMoreRef = useRef(loadMore)
  loadMoreRef.current = loadMore
  const ioRef = useRef<IntersectionObserver | null>(null)
  const observeSentinel = useCallback((el: HTMLDivElement | null) => {
    ioRef.current?.disconnect()
    if (el === null || typeof IntersectionObserver === 'undefined') return
    const io = new IntersectionObserver(entries => {
      if (entries[0]?.isIntersecting === true) loadMoreRef.current()
    })
    io.observe(el)
    ioRef.current = io
  }, [])
  useEffect(() => () => { ioRef.current?.disconnect() }, [])

  // 天分组：按取回顺序就地合并（同一天只有一个天标签，跨页追加亦然）。
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

  const openSession = useCallback((sessionId: string): void => { onOpenSession?.(sessionId) }, [onOpenSession])
  const atLimit = rows.length >= HARD_LIMIT
  const rangeChanged = range.from !== initialRangeRef.current.from || range.to !== initialRangeRef.current.to
  /** 用户是否真的动过过滤器（决定空态文案：没动过 = 这段时间本来就没记录）。 */
  const touched = rangeChanged || workspace !== '' || status !== '' || taskId !== ''

  const changeWorkspace = useCallback((next: string): void => {
    setWorkspace(next)
    // ⚠️ 2026-10-04 评审：服务端在同时给 taskId 与 workspace 时**以 taskId 为准**（见 `src/index.ts` 路由注释），
    // 若不在这里清掉「掉出新作用域」的任务，会出现「工作区筛了 B、结果却是 A 的记录」。
    if (next === '' || taskId === '') return
    const current = tasks.find(o => o.id === taskId)
    if (current !== undefined && current.workspace !== next) setTaskId('')
  }, [taskId, tasks])

  const footerHint = error !== null
    ? null
    : atLimit && !done
      ? t('recordsLimitHint')
      : done && rows.length > 0
        ? t('recordsNoMore')
        : loading
          ? t('recordsLoading')
          : null

  return h('div', { style: { width: '100%', display: 'flex', justifyContent: 'center' } },
    // 宽度锚点与任务配置页**同一个**（`PANEL_CONTENT_ID` 也是基础层 `Loading` 的锚点契约）。
    h('div', { id: PANEL_CONTENT_ID, style: PANEL_CONTENT_STYLE },
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
          onChange: changeWorkspace,
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

      // 首屏取数：复用基础层 Loading（唯一实现；它是页面右下角浮动指示，锚在 PANEL_CONTENT_ID 上）。
      loading && !loaded ? h(Loading, { label: t('recordsLoading') }) : null,

      rows.length === 0
        ? (loaded && error === null
            ? h('div', { style: emptyStyle }, touched ? t('recordsEmptyFiltered') : t('recordsEmpty'))
            : null)
        : h('div', { className: 'dsh-tdt-rec-tl' },
            days.map((day, dayIndex) => h('div', { key: `${day.key}#${dayIndex}` },
              h('div', { className: 'dsh-tdt-rec-day' },
                h('span', { className: 'dsh-tdt-rec-daylabel' }, dayLabelOf(day.key, t)),
                h('span', { className: 'dsh-tdt-rec-daycount' }, tt('recordsDayCount', { n: day.items.length })),
              ),
              h('div', { className: 'dsh-tdt-rec-axis' },
                day.items.map(row => h(RecordBlock, {
                  key: row.id,
                  row,
                  label: titleById.get(row.task_id) ?? row.task_id,
                  t,
                  tt,
                  openSession,
                })),
              ),
            )),
            // ── 加载区：哨兵触发续拉；失败给提示 + 重试；到下给文案；还有下一页给手动兜底 ──
            h('div', { ref: observeSentinel, style: { height: '1px' } }),
            h('div', { className: 'dsh-tdt-rec-foot' },
              error !== null
                ? h('span', { className: 'dsh-tdt-rec-err' }, `${t('recordsLoadFail')}：${error}`)
                : null,
              error !== null
                ? h(Button, { variant: 'outline', size: 'sm', onClick: () => { void load(cursor) } }, t('recordsRetry'))
                : footerHint !== null
                  ? h('span', null, footerHint)
                  : h(Button, { variant: 'outline', size: 'sm', onClick: loadMore }, t('recordsLoadMore')),
            ),
          ),
    ),
  )
}
