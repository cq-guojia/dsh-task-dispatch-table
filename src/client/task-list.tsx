// task-list.tsx — 主界面任务列表视图（2026-09-30，design/main-panel-design.md）。
//
// 形态：限宽居中的卡片列表。每张卡片 = 状态点 + 标题 + 执行方式 + 上次 / 下次 + 创建于 + 三个操作。
// 排序按「时间轴」：运行中 → 已启用按下次执行升序 → 已完结（无下次） → 已关闭沉底。
//
// **效率约定（用户 2026-09-30 明确要求）**：卡片数据全来自 `GET /tasks/overview`（服务端内存摘要，
// 不查库），10 秒轮询一次并带 `rev` 比对——未变只回 `{unchanged:true}`；「10 分钟后 → 9 分钟后」
// 这类相对时间由**本地计时器**渲染，不产生请求、也不触发重排。
//
// 官方组件：Switch / Menu / Input / 图标 一律取 primitives（本仓库惯例：能官方不手绘）；
// 卡片外壳官方没有列表件 ⇒ 自绘，颜色全走宿主主题变量。
import { createElement as h, useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import {
  IconChevronDownOutlineRegular, IconEditOutlineRegular, IconRefreshOutlineRegular, IconSearchOutlineRegular,
  Input, Menu, Switch,
} from '@deepseek-ai/dsh-client-ui-primitives'
import { interpolateTranslate, type LocaleKey, type Translate } from './locales'

/** 与服务端 `runtime-index.ts` 的 TaskOverviewRow 同形（客户端本地声明，不跨半侧引类型）。 */
export interface TaskOverviewRow {
  id: string
  title: string
  code: string | null
  enabled: boolean
  workspace: string
  createdAt: string | null
  provider: string | null
  model: string | null
  retryMax: number
  schedule: {
    cron: string | null
    once: string | null
    timezone: string | null
    start: string | null
    everyNWeeks: number | null
    window: string
  }
  promptHead: string
  attachments: Array<{ name: string; kind: 'link' | 'upload' }>
  depends: Array<{ id: string; title: string; enabled: boolean }>
  running: boolean
  runningSince: string | null
  lastStatus: string | null
  lastScheduledAt: string | null
  lastFinishedAt: string | null
  nextSlotAt: string | null
}

// ── 主题变量（与 index.ts 的 C 同款：全走宿主变量 + 兜底）──
const C = {
  text: 'var(--dsw-alias-label-primary, #1f2328)',
  textDim: 'var(--dsw-alias-label-secondary, rgba(128,128,128,0.95))',
  textFaint: 'var(--dsw-alias-label-tertiary, rgba(128,128,128,0.8))',
  layer1: 'var(--dsw-alias-bg-layer-1, rgba(128,128,128,0.10))',
  layer2: 'var(--dsw-alias-bg-layer-2, rgba(128,128,128,0.14))',
  border: 'var(--dsw-alias-border-l2, rgba(128,128,128,0.35))',
  borderStrong: 'var(--dsw-alias-border-l3, rgba(128,128,128,0.5))',
  brand: 'var(--dsw-alias-brand-primary, #2f6feb)',
  danger: 'var(--dsw-alias-state-error-primary, #c0392b)',
  success: 'var(--dsw-alias-state-success-primary, #2da44e)',
  hover: 'var(--dsw-alias-interactive-bg-hover, rgba(128,128,128,0.16))',
  duration: 'var(--ds-transition-duration, 0.15s)',
  ease: 'var(--ds-ease-in-out, ease)',
}
const transition = `background ${C.duration} ${C.ease}, color ${C.duration} ${C.ease}, border-color ${C.duration} ${C.ease}`

// ── 轮询 ──────────────────────────────────────────────────────────────
const POLL_MS = 10_000

/** 主界面数据：一次请求出全部卡片数据；rev 未变 ⇒ 服务端回 unchanged，本地状态不动。 */
export function useTaskOverview(): {
  rows: TaskOverviewRow[]
  ready: boolean
  refresh: () => void
} {
  const [rows, setRows] = useState<TaskOverviewRow[]>([])
  const [ready, setReady] = useState(false)
  const revRef = useRef('')
  const busyRef = useRef(false)
  const [tick, setTick] = useState(0)

  useEffect(() => {
    let alive = true
    const poll = async (): Promise<void> => {
      if (busyRef.current) return
      busyRef.current = true
      try {
        const query = revRef.current === '' ? '' : `?rev=${encodeURIComponent(revRef.current)}`
        const res = await fetch(`api/task-dispatch-table/tasks/overview${query}`, { cache: 'no-store' })
        if (!res.ok) return
        const body = await res.json() as { ok?: boolean; unchanged?: boolean; rev?: number; tasks?: unknown }
        if (!alive || body.ok !== true) return
        if (body.unchanged === true) return // 内容没变：不重渲染、不重排、不播动画
        revRef.current = String(body.rev ?? '')
        setRows(Array.isArray(body.tasks) ? body.tasks as TaskOverviewRow[] : [])
        setReady(true)
      } catch { /* 通道短暂不可用：保持上一次的数据，下轮再取 */ } finally {
        busyRef.current = false
      }
    }
    void poll()
    const timer = window.setInterval(() => { void poll() }, POLL_MS)
    return () => { alive = false; window.clearInterval(timer) }
  }, [tick])

  const refresh = useCallback((): void => { setTick(v => v + 1) }, [])
  return { rows, ready, refresh }
}

// ── 文案与时间 ─────────────────────────────────────────────────────────
const WEEKDAY_NAMES = ['日', '一', '二', '三', '四', '五', '六'] as const

/** cron（5 段）→ 人话；认不出的形态原样显示 cron（真实值，不编造）。 */
export function cronToHuman(
  cron: string | null,
  once: string | null,
  everyNWeeks: number | null,
  tt: Translate,
): string {
  if (once !== null && once !== '') {
    return tt('schedOnce', { date: once.slice(0, 10), time: once.slice(11, 16) })
  }
  if (cron === null || cron === '') return '—'
  const parts = cron.trim().split(/\s+/)
  if (parts.length !== 5) return tt('schedCustom', { cron })
  const [minute, hour, dom, , dow] = parts
  const pad = (v: string): string => (v.length === 1 && /^\d$/.test(v) ? `0${v}` : v)
  const minuteStep = /^\*\/(\d+)$/.exec(minute)
  const hourStep = /^\*\/(\d+)$/.exec(hour)
  let text: string
  if (minute === '*' || minuteStep?.[1] === '1') {
    text = tt('schedEveryMinute')
  } else if (minuteStep !== null) {
    text = tt('schedEveryNMinutes', { n: minuteStep[1] })
  } else if (hour === '*' || hourStep !== null) {
    text = tt('schedHourly', { minute: pad(minute) })
  } else if (dom === '*' && dow === '*') {
    text = tt('schedDaily', { time: `${pad(hour)}:${pad(minute)}` })
  } else if (dom === '*' && dow !== '*') {
    const names = dow.split(',').map(d => WEEKDAY_NAMES[Number(d)] ?? d).join('、')
    text = tt('schedWeekly', { weekdays: names, time: `${pad(hour)}:${pad(minute)}` })
  } else if (dom !== '*' && dow === '*') {
    text = tt('schedMonthly', { day: dom, time: `${pad(hour)}:${pad(minute)}` })
  } else {
    return tt('schedCustom', { cron })
  }
  // 「每 N 周」是 cron 表达不出来的维度（靠锚点 + 取模过滤）⇒ 补在句首。
  if (everyNWeeks !== null && everyNWeeks > 1) return `每 ${everyNWeeks} 周 · ${text}`
  return text
}

/** 下次执行的相对说法（客户端本地算，不靠请求）。 */
function relativeText(iso: string | null, nowMs: number, tt: Translate): string {
  if (iso === null) return tt('listNextNone')
  const diff = Date.parse(iso) - nowMs
  if (diff <= 0) return tt('relPast')
  const minutes = Math.floor(diff / 60_000)
  if (minutes < 1) return tt('relNow')
  if (minutes < 60) return tt('relMinutes', { n: minutes })
  const hours = Math.floor(minutes / 60)
  if (hours < 24) return tt('relHours', { n: hours })
  return tt('relDays', { n: Math.floor(hours / 24) })
}

/** HH:mm（本机时区）。 */
function clockOf(iso: string): string {
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return '—'
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`
}

/** 「9 月 28 日」（本机时区）。 */
function dateOf(iso: string): string {
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return '—'
  return `${d.getMonth() + 1} 月 ${d.getDate()} 日`
}

/** 上次执行的一句话（真实值：没有就是没跑过，不编造）。 */
function lastRunText(row: TaskOverviewRow, tt: Translate): string {
  if (row.lastStatus === null || row.lastScheduledAt === null) return tt('listNever')
  const ok = row.lastStatus === 'succeeded'
  return `${clockOf(row.lastScheduledAt)} ${ok ? tt('listStatusOk') : tt('listStatusFailed')}`
}

// ── 排序（时间轴：马上要跑的最上，关闭的沉底）──────────────────────────
function sortRows(rows: readonly TaskOverviewRow[]): TaskOverviewRow[] {
  const groupOf = (row: TaskOverviewRow): number => {
    if (row.running) return 0
    if (!row.enabled) return 3
    return row.nextSlotAt === null ? 2 : 1
  }
  return [...rows].sort((a, b) => {
    const ga = groupOf(a)
    const gb = groupOf(b)
    if (ga !== gb) return ga - gb
    if (ga === 1) return Date.parse(a.nextSlotAt ?? '') - Date.parse(b.nextSlotAt ?? '')
    const ta = Date.parse(a.lastScheduledAt ?? a.runningSince ?? '') || 0
    const tb = Date.parse(b.lastScheduledAt ?? b.runningSince ?? '') || 0
    return tb - ta
  })
}

// ── FLIP 动画：卡片「下去 / 上来」平滑位移（自研，不引包）──────────────
function useFlip(signature: string): (id: string) => (el: HTMLElement | null) => void {
  const nodes = useRef(new Map<string, HTMLElement>())
  const prevTop = useRef(new Map<string, number>())

  useLayoutEffect(() => {
    const moved: Array<[HTMLElement, number]> = []
    for (const [id, el] of nodes.current) {
      const top = el.getBoundingClientRect().top
      const prev = prevTop.current.get(id)
      // 只动画「位置真变了」的卡片：几百条里通常只有 1–3 张在动。
      if (prev !== undefined && Math.abs(prev - top) > 0.5) moved.push([el, prev - top])
      prevTop.current.set(id, top)
    }
    if (moved.length === 0) return
    if (window.matchMedia?.('(prefers-reduced-motion: reduce)').matches === true) return
    for (const [el, delta] of moved) {
      el.style.transition = 'none'
      el.style.transform = `translateY(${delta}px)`
    }
    const frame = requestAnimationFrame(() => {
      for (const [el] of moved) {
        el.style.transition = `transform 260ms ${C.ease}`
        el.style.transform = ''
      }
      window.setTimeout(() => { for (const [el] of moved) el.style.transition = '' }, 320)
    })
    return () => { cancelAnimationFrame(frame) }
  }, [signature])

  // ref 回调必须**跨渲染稳定**（否则每次渲染都会 detach/attach，白白触发测量）。
  const callbacks = useRef(new Map<string, (el: HTMLElement | null) => void>())
  return useCallback((id: string): ((el: HTMLElement | null) => void) => {
    const hit = callbacks.current.get(id)
    if (hit !== undefined) return hit
    const fn = (el: HTMLElement | null): void => {
      if (el === null) nodes.current.delete(id)
      else nodes.current.set(id, el)
    }
    callbacks.current.set(id, fn)
    return fn
  }, [])
}

/** 转圈动画（@keyframes 无法写进内联 style）⇒ 注入一次，幂等。 */
function ensureSpinKeyframes(): void {
  if (typeof document === 'undefined') return
  const id = 'dsh-tdt-spin-keyframes'
  if (document.getElementById(id) !== null) return
  const tag = document.createElement('style')
  tag.id = id
  tag.textContent = '@keyframes dsh-tdt-spin { to { transform: rotate(360deg) } }'
  document.head.appendChild(tag)
}

// ── 状态点 ─────────────────────────────────────────────────────────────
/** 转圈（运行中）：纯 CSS 动画，零请求。 */
function Spinner() {
  return h('span', {
    style: {
      display: 'inline-block', width: '10px', height: '10px', borderRadius: '50%',
      border: `1.5px solid ${C.brand}`, borderTopColor: 'transparent',
      animation: 'dsh-tdt-spin 800ms linear infinite',
    },
  })
}

function StatusDot(props: { row: TaskOverviewRow }) {
  const { row } = props
  if (row.running) return h(Spinner, {})
  const color = !row.enabled ? C.textFaint : row.lastStatus === 'failed' ? C.danger : C.success
  return h('span', {
    title: !row.enabled ? '已关闭' : row.lastStatus === 'failed' ? '最近一次执行失败' : '计划运行中',
    style: {
      display: 'inline-block', width: '8px', height: '8px', borderRadius: '50%',
      background: color, flex: 'none', transition: `background ${C.duration} ${C.ease}`,
    },
  })
}

// ── 卡片 ───────────────────────────────────────────────────────────────
const cardStyle: Record<string, string | number> = {
  display: 'block', width: '100%', boxSizing: 'border-box', textAlign: 'left',
  padding: '12px 14px', marginBottom: '10px', borderRadius: '10px',
  border: `1px solid ${C.border}`, background: C.layer1, color: C.text,
  transition: `border-color ${C.duration} ${C.ease}, background ${C.duration} ${C.ease}`,
}
const titleStyle: Record<string, string | number> = { fontSize: '14px', fontWeight: 600, color: C.text, lineHeight: '20px' }
const metaStyle: Record<string, string | number> = { fontSize: '12px', color: C.textDim, lineHeight: '18px', marginTop: '2px' }
const faintStyle: Record<string, string | number> = { fontSize: '11px', color: C.textFaint, lineHeight: '16px', marginTop: '2px' }
const iconBtnStyle: Record<string, string | number> = {
  display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: '4px',
  height: '26px', minWidth: '26px', padding: '0 6px', border: `1px solid ${C.border}`,
  borderRadius: '6px', background: 'transparent', color: C.textDim, cursor: 'pointer',
  fontFamily: 'inherit', fontSize: '12px', transition,
}
const sectionLabelStyle: Record<string, string | number> = { fontSize: '11px', color: C.textFaint, marginTop: '10px', marginBottom: '2px' }
const sectionBodyStyle: Record<string, string | number> = { fontSize: '12px', color: C.text, lineHeight: '18px' }

function TaskCard(props: {
  row: TaskOverviewRow
  t: Translate
  tt: Translate
  nowMs: number
  open: boolean
  onToggleOpen: () => void
  onEdit: (id: string) => void
  onToggleEnabled: (id: string, enabled: boolean) => void
  refOf: (el: HTMLElement | null) => void
}) {
  const { row, t, tt, nowMs, open, onToggleOpen, onEdit, onToggleEnabled, refOf } = props
  const scheduleText = cronToHuman(row.schedule.cron, row.schedule.once, row.schedule.everyNWeeks, tt)
  const modelText = row.model === null ? tt('listFieldModelDefault') : row.model

  return h('div', { ref: refOf, style: cardStyle },
    h('div', { style: { display: 'flex', alignItems: 'flex-start', gap: '10px' } },
      h('div', { style: { paddingTop: '5px', flex: 'none' } }, h(StatusDot, { row })),
      h('div', { style: { flex: '1 1 auto', minWidth: 0 } },
        h('div', { style: titleStyle },
          row.title,
          row.code !== null ? h('span', { style: { ...faintStyle, marginLeft: '6px', display: 'inline' } }, `[${row.code}]`) : null,
          row.enabled ? null : h('span', { style: { ...faintStyle, marginLeft: '6px', display: 'inline' } }, t('listDisabledTag')),
        ),
        h('div', { style: metaStyle },
          row.running
            ? `${t('listRunning')} · ${scheduleText}`
            : `${scheduleText} · ${t('listLastPrefix')} ${lastRunText(row, tt)} · ${t('listNextPrefix')} ${row.nextSlotAt === null ? t('listNextNone') : `${clockOf(row.nextSlotAt)}（${relativeText(row.nextSlotAt, nowMs, tt)}）`}`,
        ),
        row.createdAt === null ? null : h('div', { style: faintStyle }, `${t('listCreatedPrefix')} ${dateOf(row.createdAt)}`),
      ),
      h('div', { style: { display: 'flex', alignItems: 'center', gap: '6px', flex: 'none' } },
        h(Switch, {
          checked: row.enabled,
          onChange: (next: boolean) => { onToggleEnabled(row.id, next) },
          label: row.enabled ? t('listFilterEnabled') : t('listFilterDisabled'),
        }),
        h('button', {
          type: 'button', style: iconBtnStyle, title: t('editorEdit'),
          onClick: () => { onEdit(row.id) },
        }, h(IconEditOutlineRegular, { size: 14 })),
        h('button', {
          type: 'button', style: { ...iconBtnStyle, border: 'none', transform: open ? 'rotate(180deg)' : 'none' },
          title: t('expandHint'), onClick: onToggleOpen,
          'aria-expanded': open,
        }, h(IconChevronDownOutlineRegular, { size: 14 })),
      ),
    ),
    // ── 展开区：就地拉伸，上方原样，下方读任务设置（不进编辑页）──
    open ? h('div', { style: { marginTop: '10px', borderTop: `1px dashed ${C.border}`, paddingTop: '8px' } },
      h('div', { style: sectionLabelStyle }, t('listSectionSchedule')),
      h('div', { style: sectionBodyStyle },
        `${t('listFieldSchedule')}：${scheduleText} · ${t('listFieldWorkspace')}：${row.workspace} · ${t('listFieldModel')}：${modelText} · ${t('listFieldRetry')}：${row.retryMax} · ${t('listFieldWindow')}：${row.schedule.window}`,
      ),
      h('div', { style: sectionLabelStyle }, t('listSectionAttachments')),
      h('div', { style: sectionBodyStyle },
        row.attachments.length === 0
          ? t('listNone')
          : row.attachments.map(item => `${item.name}${item.kind === 'link' ? '（工作区）' : ''}`).join('、'),
      ),
      h('div', { style: sectionLabelStyle }, t('listSectionDepends')),
      h('div', { style: sectionBodyStyle },
        row.depends.length === 0
          ? t('listNone')
          : row.depends.map(dep => `${dep.title}${dep.enabled ? '' : t('listDisabledTag')}`).join('、'),
      ),
      h('div', { style: sectionLabelStyle }, t('listSectionPrompt')),
      h('div', { style: { ...sectionBodyStyle, color: C.textDim, whiteSpace: 'pre-wrap', wordBreak: 'break-word' } }, row.promptHead),
    ) : null,
  )
}

// ── 视图 ───────────────────────────────────────────────────────────────
export function TaskListView(props: {
  t: Translate
  rows: readonly TaskOverviewRow[]
  ready: boolean
  onRefresh: () => void
  onNew: () => void
  onEdit: (id: string) => void
  onToggleEnabled: (id: string, enabled: boolean) => void
}): ReturnType<typeof h> {
  const { t, rows, ready, onRefresh, onNew, onEdit, onToggleEnabled } = props
  const tt = useMemo(() => interpolateTranslate(t), [t])
  ensureSpinKeyframes()
  const [filter, setFilter] = useState<'all' | 'enabled' | 'disabled'>('all')
  const [workspace, setWorkspace] = useState<string>('')
  const [menuOpen, setMenuOpen] = useState(false)
  const [query, setQuery] = useState('')
  const [openId, setOpenId] = useState<string | null>(null)
  // 相对时间（「10 分钟后」）本地每秒推进：**不产生请求、也不触发重排**（重排只发生在数据真变时）。
  const [nowMs, setNowMs] = useState(() => Date.now())
  useEffect(() => {
    const timer = window.setInterval(() => { setNowMs(Date.now()) }, 1_000)
    return () => { window.clearInterval(timer) }
  }, [])

  const workspaces = useMemo(() => [...new Set(rows.map(r => r.workspace))].sort(), [rows])
  const visible = useMemo(() => {
    const q = query.trim().toLowerCase()
    const filtered = rows.filter(row => {
      if (filter === 'enabled' && !row.enabled) return false
      if (filter === 'disabled' && row.enabled) return false
      if (workspace !== '' && row.workspace !== workspace) return false
      if (q === '') return true
      return row.title.toLowerCase().includes(q) || (row.code ?? '').toLowerCase().includes(q)
    })
    return sortRows(filtered)
    // 排序只依赖内容本身；nowMs 变化不参与 ⇒ 每秒 tick 不会引起重排与动画。
  }, [rows, filter, workspace, query])

  // FLIP 签名：只在「可见集合与顺序」变化时触发动画。
  const signature = visible.map(r => `${r.id}:${r.running ? 1 : 0}:${r.enabled ? 1 : 0}`).join('|')
  const refOf = useFlip(signature)

  const menuItems = useMemo(() => [
    { id: '', label: t('listFilterWorkspaceAll') },
    ...workspaces.map(name => ({ id: name, label: name })),
  ], [workspaces, t])

  const tabStyle = (active: boolean): Record<string, string | number> => ({
    padding: '3px 12px', borderRadius: '6px', border: 'none', cursor: 'pointer',
    fontSize: '12px', lineHeight: '18px', fontFamily: 'inherit', transition,
    background: active ? C.layer1 : 'transparent',
    color: active ? C.text : C.textDim,
    fontWeight: active ? 600 : 400,
  })

  return h('div', { style: { width: '100%', display: 'flex', justifyContent: 'center' } },
    h('div', { style: { width: '100%', maxWidth: '1120px', minWidth: '760px', boxSizing: 'border-box' } },
      // 顶部：筛选 + 搜索 + 新建
      h('div', { style: { display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '12px', flexWrap: 'wrap' } },
        h('div', { style: { display: 'inline-flex', gap: '2px', padding: '2px', borderRadius: '8px', background: C.layer2, border: `1px solid ${C.border}` } },
          h('button', { type: 'button', style: tabStyle(filter === 'all'), onClick: () => { setFilter('all') } }, t('listFilterAll')),
          h('button', { type: 'button', style: tabStyle(filter === 'enabled'), onClick: () => { setFilter('enabled') } }, t('listFilterEnabled')),
          h('button', { type: 'button', style: tabStyle(filter === 'disabled'), onClick: () => { setFilter('disabled') } }, t('listFilterDisabled')),
        ),
        h(Menu, {
          open: menuOpen,
          anchor: h('button', {
            type: 'button', style: { ...iconBtnStyle, height: '26px', padding: '0 10px' },
            onClick: () => { setMenuOpen(v => !v) },
          }, `${t('listFilterWorkspace')}：${workspace === '' ? t('listFilterWorkspaceAll') : workspace}`),
          items: menuItems,
          selectedId: workspace,
          onSelect: (id: string) => { setWorkspace(id); setMenuOpen(false) },
          onClose: () => { setMenuOpen(false) },
        }),
        h('div', { style: { position: 'relative', flex: '1 1 160px', minWidth: '140px' } },
          h(Input, {
            icon: h(IconSearchOutlineRegular, { size: 14 }),
            value: query,
            placeholder: t('listSearchPlaceholder'),
            onChange: (event: { target: { value: string } }) => { setQuery(event.target.value) },
          }),
        ),
        h('button', {
          type: 'button', style: { ...iconBtnStyle, height: '26px' }, title: t('debugRefresh'),
          onClick: onRefresh,
        }, h(IconRefreshOutlineRegular, { size: 14 })),
        h('button', {
          type: 'button',
          style: {
            display: 'inline-flex', alignItems: 'center', gap: '4px', flex: 'none', height: '26px',
            padding: '0 10px', borderRadius: '6px', border: `1px solid ${C.borderStrong}`,
            background: C.layer1, color: C.text, cursor: 'pointer',
            fontFamily: 'inherit', fontSize: '12px', fontWeight: 600, transition,
          },
          onClick: onNew,
        }, `＋ ${t('editorNew')}`),
      ),
      visible.length === 0
        ? h('p', { style: { ...metaStyle, marginTop: '8px' } }, rows.length === 0 && !ready ? '' : rows.length === 0 ? t('listEmpty') : t('listEmptyFiltered'))
        : h('div', { style: { position: 'relative' } },
          visible.map(row => h(TaskCard, {
            key: row.id,
            row, t, tt, nowMs,
            open: openId === row.id,
            onToggleOpen: () => { setOpenId(cur => (cur === row.id ? null : row.id)) },
            onEdit,
            onToggleEnabled,
            refOf: refOf(row.id),
          })),
        ),
    ),
  )
}
