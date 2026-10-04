// records-timeline.tsx — 执行记录总查询页（时间轴）
//
// 形态：查**全部任务**的执行流水账（`task_instances` 全表），按天分组的时间轴，整体倒序。
// 规格 = docs/design/features/execution-timeline.md；过程 = docs/worklog/execution-timeline.md。
//
// ⚠️ 与「卡片展开区的单任务执行记录面板」是两个功能（时间轴 vs 表格、全量 vs 单任务），别混。
//
// 版式（2026-10-04 用户返工后定稿，「丑得可怕」那版已废）：
//   ① 过滤行照任务列表：**左侧分段控件**四档（全部 / 成功 / 失败 / 进行中），右侧时间范围 + 工作区 + 任务；
//   ② 主体 = **灰底区块**（`--tdt-surface-sunken`，居中限宽）——**不用圆角卡片把每条框起来**；
//   ③ 灰底里一条**竖轴从上贯穿到底**（画在区块伪元素上 ⇒ 空态 / 加载 / 失败态也在，永不断）；
//   ④ 天 = 竖轴上一个**稍大的圆点** + 「2026 年 10 月 30 日」+ 当天条数（吸顶）；
//   ⑤ 每条流水账**两行**：第 1 行 名称 + 状态 + 查看会话；第 2 行 工作区 · 计划 · 实际 · 时长 · Token | 产出物；
//      失败 / 未执行有原因时补第 3 行备注。
//
// 取数：**只走 `GET /tasks/instances`**（`fetchInstances`），游标分页 + 服务端排序
// （`scheduled_at DESC, id DESC`），客户端不二次排序。
// 分页状态机的四条硬规矩（上一轮评审修的，重写版式时逐条保留）：
//   ① 2000 上限**只拦续拉**（首屏永远允许取）⇒ 满额后改过滤不会白屏；
//   ② 续拉失败给提示 + 重试，并**暂停自动续拉**（否则哨兵把失败刷成重试风暴）；
//   ③ `IntersectionObserver` **只建一次**（最新逻辑走 ref）；
//   ④ 请求序号作废旧响应 + 失败不清空已有列表。
import { createElement as h, memo, useCallback, useEffect, useMemo, useRef, useState, type CSSProperties } from 'react'
import { FileTypeIcon } from '@deepseek-ai/dsh-client-ui-primitives'
import { formatClock, formatDurationHms, formatPlanStamp, formatTokenCount, formatTokenDetail, pad2 } from './format'
import { fetchInstances, outputsOf, type InstanceRow } from './query'
import { isRunningStatus, statusesOfBucket, statusTextOf, statusToneOf } from './status-text'
import {
  Button, Loading, MarqueeText, PANEL_CONTENT_ID, PANEL_CONTENT_STYLE, Segmented, SelectField, TaskPicker, TimeRange,
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
if (HARD_LIMIT % PAGE_SIZE !== 0) console.warn('[tdt] HARD_LIMIT 必须是 PAGE_SIZE 的整数倍')

/** 状态分段控件四档（'' = 全部；其余走 `statusesOfBucket` 单源）。 */
type StatusBucket = '' | 'succeeded' | 'failed' | 'running'

// ── 样式（走基础层注入器，不自建 <style>；只消费 var(--tdt-*)，间距/时长/z 全走 token）──
const RECORDS_CSS = `
/* ── 执行记录时间轴 ──────────────────────────────────────────────────────
   层级：过滤行（页面底） → 灰底区块（sunken，把内容居中收拢） → 竖轴 + 天节点 → 两行条目。 */
.dsh-tdt-rec-band{position:relative;background:var(--tdt-surface-sunken);border-radius:var(--tdt-radius-lg);
  padding:var(--tdt-space-3) var(--tdt-space-4) var(--tdt-space-4) var(--tdt-space-4);min-height:220px;}
/* **贯穿竖轴**：画在区块上而不是「当天那一截」⇒ 与数据无关，空态 / 加载 / 失败态照样连着（用户点名要求）。
   left:5px = 圆点圆心（圆点 10px 宽，从 0 起）。 */
.dsh-tdt-rec-band::before{content:'';position:absolute;left:5px;top:0;bottom:0;width:1px;background:var(--tdt-border-faint);}
/* 天节点：吸顶；底色与灰底同源 ⇒ 吸附时不留异色横带。 */
.dsh-tdt-rec-day{position:sticky;top:0;z-index:var(--tdt-z-sticky);display:flex;align-items:center;
  gap:var(--tdt-space-2);padding:var(--tdt-space-2) 0 var(--tdt-space-1);background:var(--tdt-surface-sunken);}
/* 稍大的圆点，压在竖轴上（相对行内容盒 -16px = 区块左内边距）。 */
.dsh-tdt-rec-dot{position:absolute;left:calc(-1 * var(--tdt-space-4));top:50%;transform:translateY(-50%);
  width:10px;height:10px;border-radius:50%;background:var(--tdt-business);}
.dsh-tdt-rec-daylabel{font-size:var(--tdt-font-lg);font-weight:600;color:var(--tdt-fg);line-height:var(--tdt-line-md);}
.dsh-tdt-rec-daycount{font-size:var(--tdt-font-xs);color:var(--tdt-fg-3);}
/* 条目：**无圆角卡片框**（用户点名不要）；靠 hover 泛底 + 极浅分隔线分隔。 */
.dsh-tdt-rec-item{position:relative;display:flex;flex-direction:column;gap:var(--tdt-space-1);
  padding:var(--tdt-space-2) var(--tdt-space-2) var(--tdt-space-2) var(--tdt-space-3);
  border-bottom:1px solid var(--tdt-border-faint);border-radius:var(--tdt-radius-sm);background:transparent;
  color:var(--tdt-fg);font:inherit;text-align:left;animation:dsh-tdt-rec-in var(--tdt-dur-fast) var(--tdt-ease);}
.dsh-tdt-rec-item--on{cursor:pointer;}
.dsh-tdt-rec-item--on:hover{background:var(--tdt-hover);}
.dsh-tdt-rec-item--last{border-bottom:0;}
/* 成败色条（用户点名：不用图标）：3px，颜色由内联 style 给 token 值。 */
.dsh-tdt-rec-bar{position:absolute;left:0;top:var(--tdt-space-1);bottom:var(--tdt-space-1);width:3px;border-radius:2px;}
.dsh-tdt-rec-bar--run,.dsh-tdt-rec-statedot--run{animation:dsh-tdt-rec-pulse var(--tdt-dur) var(--tdt-ease) infinite;}
@keyframes dsh-tdt-rec-pulse{0%,100%{opacity:1}50%{opacity:.35}}
@keyframes dsh-tdt-rec-in{from{opacity:0;transform:translateY(-2px)}to{opacity:1;transform:none}}
@media (prefers-reduced-motion: reduce){.dsh-tdt-rec-bar--run,.dsh-tdt-rec-statedot--run{animation:none}.dsh-tdt-rec-item{animation:none}}
/* 第 1 行：名称在左，状态与入口在右。 */
.dsh-tdt-rec-r1{display:flex;align-items:center;gap:var(--tdt-space-2);min-width:0;}
.dsh-tdt-rec-title{font-size:var(--tdt-font-lg);font-weight:600;line-height:var(--tdt-line-md);}
.dsh-tdt-rec-state{flex:none;display:inline-flex;align-items:center;gap:6px;font-size:var(--tdt-font-sm);color:var(--tdt-fg-2);}
.dsh-tdt-rec-statedot{width:8px;height:8px;border-radius:50%;flex:none;}
/* 第 2 行：meta 在左（可换行），产出物 / Token 在右。 */
.dsh-tdt-rec-r2{display:flex;align-items:center;gap:var(--tdt-space-2);flex-wrap:wrap;font-size:var(--tdt-font-sm);color:var(--tdt-fg-3);}
.dsh-tdt-rec-meta{display:inline-flex;align-items:center;gap:6px;flex-wrap:wrap;min-width:0;}
.dsh-tdt-rec-sep{color:var(--tdt-border-heavy);}
.dsh-tdt-rec-spacer{flex:1 1 auto;}
.dsh-tdt-rec-num{font-variant-numeric:tabular-nums;font-family:var(--tdt-font-mono);}
/* 产出物：官方文件类型图标 + 文件名的小 chip（可点开预览；无会话 / 预览不可用时不可点）。 */
.dsh-tdt-rec-outs{display:inline-flex;align-items:center;gap:6px;flex-wrap:wrap;}
.dsh-tdt-rec-out{display:inline-flex;align-items:center;gap:4px;max-width:160px;padding:2px var(--tdt-space-1);
  border:0;border-radius:var(--tdt-radius-sm);background:var(--tdt-plate);color:var(--tdt-fg-2);font:inherit;
  font-size:var(--tdt-font-sm);cursor:pointer;}
.dsh-tdt-rec-out:disabled{cursor:default;color:var(--tdt-fg-3);}
.dsh-tdt-rec-out:hover:not(:disabled){background:var(--tdt-plate-hover);}
.dsh-tdt-rec-outname{min-width:0;}
/* 第 3 行：失败 / 未执行的原因（灰、单行省略，hover 看全文）。 */
.dsh-tdt-rec-note{font-size:var(--tdt-font-sm);color:var(--tdt-fg-3);}
.dsh-tdt-rec-foot{display:flex;align-items:center;justify-content:center;gap:var(--tdt-space-2);
  padding:var(--tdt-space-3) 0 var(--tdt-space-1);font-size:var(--tdt-font-xs);color:var(--tdt-fg-3);}
.dsh-tdt-rec-err{color:var(--tdt-danger);}
`
const RECORDS_DOMAIN = 'domain:records'

const filterRowStyle: CSSProperties = {
  display: 'flex', alignItems: 'center', gap: 'var(--tdt-space-2)', flexWrap: 'wrap', marginBottom: 'var(--tdt-space-3)',
}
const filterRightStyle: CSSProperties = {
  display: 'flex', alignItems: 'center', gap: 'var(--tdt-space-2)', marginLeft: 'auto', flexWrap: 'wrap',
}
const emptyStyle: CSSProperties = {
  padding: '40px 0', textAlign: 'center', fontSize: 'var(--tdt-font-md)', color: 'var(--tdt-fg-3)',
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

/** `HH:mm`（非法值给占位）。 */
function hmOf(iso: string | null): string {
  if (iso === null) return '--'
  const ms = Date.parse(iso)
  if (Number.isNaN(ms)) return '--'
  const d = new Date(ms)
  return `${pad2(d.getHours())}:${pad2(d.getMinutes())}`
}

/** 路径末段（产出物 chip 上只显示文件名）。 */
function baseNameOf(path: string): string {
  const cut = Math.max(path.lastIndexOf('/'), path.lastIndexOf('\\'))
  return cut < 0 ? path : path.slice(cut + 1)
}

/**
 * 一行记录所属的「天」= `scheduled_at` 的**本地日历日**。
 *
 * ⚠️ 不用服务端 `logical_date`（那是**任务时区**的日历日）：排序键与时间范围过滤都是 `scheduled_at`，
 * 分组键与之同源才不会把同一天劈成两个同名天标签。
 */
function dayKeyOf(row: InstanceRow): string {
  const ms = Date.parse(typeof row.scheduled_at === 'string' ? row.scheduled_at : '')
  if (Number.isNaN(ms)) return 'unknown'
  const d = new Date(ms)
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`
}

/** 天标签文案（`Intl` 按当前语言排版；认不出的 key 原样显示，不硬编码某种语言）。 */
function dayLabelOf(key: string, formatter: Intl.DateTimeFormat | null): string {
  const parts = key.split('-')
  const y = Number(parts[0])
  const m = Number(parts[1])
  const day = Number(parts[2])
  if (!Number.isFinite(y) || !Number.isFinite(m) || !Number.isFinite(day)) return key
  if (formatter === null) return key
  return formatter.format(new Date(y, m - 1, day))
}

/** 语义色调 → 色条 / 状态点颜色（**只消费 token**；哪些状态算哪一档由 `status-text.ts` 判）。 */
function toneColorOf(tone: ReturnType<typeof statusToneOf>): string {
  if (tone === 'ok') return 'var(--tdt-success)'
  if (tone === 'bad') return 'var(--tdt-danger)'
  if (tone === 'warn') return 'var(--tdt-warning)'
  if (tone === 'busy') return 'var(--tdt-business)'
  return 'var(--tdt-fg-3)'
}

/** 执行时长（与卡片面板同口径：`dispatched_at ?? scheduled_at` → `finished_at`）。 */
function durationOf(row: InstanceRow): string {
  if (row.finished_at === null) return '-'
  const from = Date.parse(row.dispatched_at ?? row.scheduled_at)
  const to = Date.parse(row.finished_at)
  if (!Number.isFinite(from) || !Number.isFinite(to)) return '-'
  return formatDurationHms(to - from)
}

/** 一个执行条目（**memo**：续拉时只有新增行需要 render，已挂的块不重算）。 */
const RecordItem = memo(function RecordItem(props: {
  row: InstanceRow
  label: string
  workspace: string
  t: Translate
  last: boolean
  openSession: (sessionId: string) => void
  openFile?: (sessionId: string, path: string) => void
}): ReturnType<typeof h> {
  const { row, label, workspace, t, last, openSession, openFile } = props
  const tone = statusToneOf(row.status)
  const running = isRunningStatus(row.status)
  const color = toneColorOf(tone)
  const outputs = outputsOf(row.outputs)
  const sid = row.session_id
  const canOpenSession = sid !== null && sid !== ''
  const canOpenFile = canOpenSession && openFile !== undefined
  const tokens = (row.token_in ?? 0) + (row.token_out ?? 0)
  const note = row.note ?? ''
  const planned = hmOf(row.scheduled_at)

  /** meta 里的一段（`标签 值`），值为空则整段不出。 */
  const meta = (label: string, value: string, title?: string): ReturnType<typeof h> | null =>
    value === '' || value === '-' ? null : h('span', { title }, `${label} ${value}`)

  return h('div', {
    className: `dsh-tdt-rec-item${canOpenSession ? ' dsh-tdt-rec-item--on' : ''}${last ? ' dsh-tdt-rec-item--last' : ''}`,
    onClick: canOpenSession ? () => { openSession(sid as string) } : undefined,
  },
    h('span', { className: `dsh-tdt-rec-bar${running ? ' dsh-tdt-rec-bar--run' : ''}`, style: { background: color } }),
    // ── 第 1 行：名称 | 状态 + 查看会话 ──
    h('div', { className: 'dsh-tdt-rec-r1' },
      h(MarqueeText, { text: label, title: label, className: 'dsh-tdt-rec-title dsh-tdt-ellipsis', style: { flex: '1 1 auto', minWidth: 0 } }),
      h('span', { className: 'dsh-tdt-rec-state' },
        h('span', { className: `dsh-tdt-rec-statedot${running ? ' dsh-tdt-rec-statedot--run' : ''}`, style: { background: color } }),
        statusTextOf(row.status, t),
      ),
      canOpenSession
        ? h(Button, {
          variant: 'ghost',
          size: 'sm',
          className: 'dsh-tdt-btn--link',
          title: t('viewSession'),
          onClick: (event: { stopPropagation(): void }) => { event.stopPropagation(); openSession(sid as string) },
        }, `↗ ${t('viewSession')}`)
        : null,
    ),
    // ── 第 2 行：工作区 · 计划 · 实际 · 时长 · Token ｜ 产出物 ──
    h('div', { className: 'dsh-tdt-rec-r2' },
      h('span', { className: 'dsh-tdt-rec-meta' },
        // 所属工作区：任务表反查（任务已删则退回派发快照的 workspacePath 末段；都没有则整段不显示）。
        workspace === '' ? null : h('span', null, workspace),
        workspace === '' ? null : h('span', { className: 'dsh-tdt-rec-sep' }, '·'),
        meta(t('recPlan'), planned, formatPlanStamp(row.scheduled_at)),
        h('span', { className: 'dsh-tdt-rec-sep' }, '·'),
        meta(t('recActual'), row.dispatched_at === null ? '' : hmOf(row.dispatched_at), row.dispatched_at === null ? undefined : formatPlanStamp(row.dispatched_at)),
        h('span', { className: 'dsh-tdt-rec-sep' }, '·'),
        meta(t('colDuration'), durationOf(row)),
      ),
      h('span', { className: 'dsh-tdt-rec-spacer' }),
      tokens > 0
        ? h('span', { className: 'dsh-tdt-rec-num', title: formatTokenDetail(row) }, formatTokenCount(tokens))
        : null,
      outputs.length === 0
        ? null
        : h('span', { className: 'dsh-tdt-rec-outs', title: t('colOutputs') },
          outputs.slice(0, 3).map(path => h('button', {
            key: path,
            type: 'button',
            className: 'dsh-tdt-rec-out',
            title: path,
            disabled: !canOpenFile,
            onClick: (event: { stopPropagation(): void }) => {
              event.stopPropagation()
              if (canOpenFile) openFile?.(sid as string, path)
            },
          },
            h(FileTypeIcon, { path, size: 16 }),
            h('span', { className: 'dsh-tdt-rec-outname dsh-tdt-ellipsis' }, baseNameOf(path)),
          )),
          outputs.length > 3
            ? h('button', {
              type: 'button',
              className: 'dsh-tdt-rec-out',
              title: t('viewSession'),
              disabled: !canOpenSession,
              onClick: (event: { stopPropagation(): void }) => {
                event.stopPropagation()
                if (canOpenSession) openSession(sid as string)
              },
            }, `+${outputs.length - 3}`)
            : null,
        ),
    ),
    // ── 第 3 行：失败 / 未执行的原因（有才出） ──
    note === ''
      ? null
      : h('div', { className: 'dsh-tdt-rec-note dsh-tdt-ellipsis', title: note }, `${t('colNote')}：${note}`),
  )
})

export interface RecordsTimelineProps {
  t: Translate
  /** 任务候选（`[编号] 名称` 口径 + 所属工作区，由父级用 overview 组装）。 */
  tasks: readonly TaskOption[]
  /** 工作区候选真源（面板级唯一，来自 `GET /options`）；空数组 = 取不到 ⇒ 下拉「暂无可选」。 */
  workspaces: readonly EditorOption[]
  /** 打开归档会话弹窗：**只传会话 id**（快照 / 产出由弹窗自取）。 */
  onOpenSession?: (sessionId: string) => void
  /** 打开产出物预览（`POST` 前先切文件面板）；不可用时不传 ⇒ 产出物 chip 降级为不可点。 */
  onOpenFile?: (sessionId: string, path: string) => void
}

/** 执行记录总查询页（时间轴）。 */
export function RecordsTimelineView(props: RecordsTimelineProps): ReturnType<typeof h> {
  applyStyle(RECORDS_DOMAIN, RECORDS_CSS)
  const { t, tasks, workspaces, onOpenSession, onOpenFile } = props
  const tt = useMemo(() => interpolateTranslate(t), [t])

  const [range, setRange] = useState<TimeRangeValue>(defaultRange)
  const [workspace, setWorkspace] = useState('')
  const [bucket, setBucket] = useState<StatusBucket>('')
  const [taskId, setTaskId] = useState('')
  const [rows, setRows] = useState<readonly InstanceRow[]>([])
  const [cursor, setCursor] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const [loaded, setLoaded] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [done, setDone] = useState(false)

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
  // 天标签的日期格式器按语言记忆化（此前每次渲染、每天都新建一个 Intl 实例）。
  const dayFormatter = useMemo<Intl.DateTimeFormat | null>(
    () => (typeof Intl === 'undefined' ? null : new Intl.DateTimeFormat(t('localeTag'), { year: 'numeric', month: 'long', day: 'numeric' })),
    [t],
  )

  const workspaceOptions = useMemo<EditorOption[]>(
    () => [{ value: '', label: t('listFilterWorkspaceAll') }, ...workspaces],
    [workspaces, t],
  )
  // 状态四档（与任务列表顶部那排同款分段控件；成员由 `status-text.ts` 单源决定 —— 与卡片面板同一个桶）。
  const statusItems = useMemo(() => ([
    { value: 'all' as const, label: t('filterAll') },
    { value: 'succeeded' as const, label: statusTextOf('succeeded', t) },
    { value: 'failed' as const, label: statusTextOf('failed', t) },
    { value: 'running' as const, label: t('filterRunning') },
  ]), [t])

  const titleById = useMemo(() => new Map(tasks.map(o => [o.id, o.label])), [tasks])
  /** 工作区反查：优先任务表（当前归属），任务已删退回派发快照的 `workspacePath` 末段（当次执行当时的值）。 */
  const workspaceById = useMemo(() => new Map(tasks.map(o => [o.id, o.workspace])), [tasks])
  const filterSig = `${range.from}|${range.to}|${workspace}|${bucket}|${taskId}`

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
        statuses: bucket === '' ? undefined : statusesOfBucket(bucket),
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
  }, [range, workspace, bucket, taskId])

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
    return () => { seqRef.current += 1 }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filterSig])

  const loadMore = useCallback((): void => {
    if (loading || done || cursor === null) return
    if (error !== null) return          // 失败后暂停自动续拉：等用户点「重试」，避免哨兵反复触发
    if (rowsCountRef.current >= HARD_LIMIT) return
    void load(cursor)
  }, [loading, done, cursor, error, load])

  // 滚到底自动续拉：观察者**只建一次**（最新逻辑走 ref），不随分页状态重建。
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
  const touched = rangeChanged || workspace !== '' || bucket !== '' || taskId !== ''

  const changeWorkspace = useCallback((next: string): void => {
    setWorkspace(next)
    // 服务端在同时给 taskId 与 workspace 时两者叠加（AND）；这里再补一道：任务掉出新工作区就清掉，
    // 免得出现「工作区筛了 B、任务却还是 A 的那条」这种自相矛盾的组合。
    if (next === '' || taskId === '') return
    const current = tasks.find(o => o.id === taskId)
    if (current !== undefined && current.workspace !== next) setTaskId('')
  }, [taskId, tasks])

  /** 反查这一行属于哪个工作区（任务表 → 派发快照路径末段 → ''）。 */
  const workspaceOf = useCallback((row: InstanceRow): string => {
    const fromTasks = workspaceById.get(row.task_id)
    if (fromTasks !== undefined && fromTasks !== '') return fromTasks
    const snapshot = row.snapshot
    if (typeof snapshot !== 'string' || snapshot === '') return ''
    const hit = /"workspacePath"\s*:\s*"([^"]+)"/.exec(snapshot)
    return hit === null ? '' : baseNameOf(hit[1].replace(/\\"/g, '"'))
  }, [workspaceById])

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
    h('div', { id: PANEL_CONTENT_ID, style: PANEL_CONTENT_STYLE },
      // ── 过滤行：左 = 状态四档分段控件；右 = 时间范围 · 工作区 · 任务 ──
      h('div', { style: filterRowStyle },
        h(Segmented<StatusBucket | 'all'>, {
          value: bucket === '' ? 'all' : bucket,
          size: 'md',
          variant: 'inset',
          label: t('colStatus'),
          items: statusItems,
          onChange: (next: StatusBucket | 'all') => { setBucket(next === 'all' ? '' : next) },
        }),
        h('div', { style: filterRightStyle },
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
      ),

      // 首屏取数：复用基础层 Loading（唯一实现；页面右下角浮动指示，锚在 PANEL_CONTENT_ID 上）。
      loading && !loaded ? h(Loading, { label: t('recordsLoading') }) : null,

      // ── 灰底区块：贯穿竖轴画在这块上；空态 / 加载 / 失败态都在里面（轴永不断）──
      h('div', { className: 'dsh-tdt-rec-band' },
        rows.length === 0
          ? (error !== null
              ? h('div', { style: emptyStyle },
                  h('span', { className: 'dsh-tdt-rec-err' }, `${t('recordsLoadFail')}：${error}`),
                  h(Button, {
                    variant: 'outline', size: 'sm',
                    onClick: () => { void load(cursor) },
                  }, t('recordsRetry')),
                )
              : loaded
                ? h('div', { style: emptyStyle }, touched ? t('recordsEmptyFiltered') : t('recordsEmpty'))
                : null)
          : h('div', null,
              days.map((day, dayIndex) => h('div', { key: `${day.key}#${dayIndex}` },
                // 天节点：稍大的圆点压在竖轴上，点后跟日期 + 当天条数。
                h('div', { className: 'dsh-tdt-rec-day' },
                  h('span', { className: 'dsh-tdt-rec-dot' }),
                  h('span', { className: 'dsh-tdt-rec-daylabel' }, dayLabelOf(day.key, dayFormatter)),
                  h('span', { className: 'dsh-tdt-rec-daycount' }, tt('recordsDayCount', { n: day.items.length })),
                ),
                day.items.map((row, rowIndex) => h(RecordItem, {
                  key: row.id,
                  row,
                  label: titleById.get(row.task_id) ?? row.task_id,
                  workspace: workspaceOf(row),
                  t,
                  last: dayIndex === days.length - 1 && rowIndex === day.items.length - 1,
                  openSession,
                  openFile: onOpenFile,
                })),
              )),
              // ── 加载区：哨兵触发续拉；失败给提示 + 重试；到下给文案；还有下一页给手动兜底 ──
              h('div', { ref: observeSentinel, style: { height: '1px' } }),
              h('div', { className: 'dsh-tdt-rec-foot' },
                error !== null ? h('span', { className: 'dsh-tdt-rec-err' }, `${t('recordsLoadFail')}：${error}`) : null,
                error !== null
                  ? h(Button, { variant: 'outline', size: 'sm', onClick: () => { void load(cursor) } }, t('recordsRetry'))
                  : footerHint !== null
                    ? h('span', null, footerHint)
                    : h(Button, { variant: 'outline', size: 'sm', onClick: loadMore }, t('recordsLoadMore')),
              ),
            ),
      ),
    ),
  )
}
