// task-list.tsx — 主界面任务列表视图（2026-09-30，design/main-panel-design.md）。
//
// 形态：限宽居中的卡片列表。每张卡片 = 状态条 + 标题 + 执行方式 + 上次 / 下次 + 创建于 + 两个操作。
// 排序按「时间轴」：运行中 → 已启用按下次执行升序 → 已完结（无下次） → 已关闭沉底。
//
// **效率约定（用户 2026-09-30 明确要求）**：卡片数据全来自 `GET /tasks/overview`（服务端内存摘要，
// 不查库），10 秒轮询一次并带 `rev` 比对——未变只回 `{unchanged:true}`；「10 分钟后 → 9 分钟后」
// 这类相对时间由**本地计时器**渲染，不产生请求、也不触发重排。
//
// **即时性**：拨片（启用 / 停用）走「本地乐观更新 + 立刻重新拉一次」，不等下一轮轮询
// ——服务端在写库成功后会同步任务表快照，所以重新拉的这一次就能拿到新值。
//
// 官方组件：Switch / Menu / Input / 图标 一律取 primitives（本仓库惯例：能官方不手绘）；
// 卡片外壳官方没有列表件 ⇒ 自绘，颜色全走宿主主题变量。
import { createElement as h, useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import {
  IconAlarmClockOutlineRegular, IconChevronDownOutlineRegular, IconClockOutlineRegular, IconEditOutlineRegular,
  IconSearchOutlineRegular,
  Input, Menu, Switch, Tooltip,
} from '@deepseek-ai/dsh-client-ui-primitives'
import { interpolateTranslate, type Translate } from './locales'
import { scheduleSpecFromSchedule, scheduleText } from './schedule-text'
import { MarqueeText } from './editor-fields'
import { ensureTaskEditorStyle } from './task-editor-css'

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
    /** 结构化排期（新建 / 编辑双写）；老任务为 null ⇒ 文案模块退回从 cron 反解。 */
    ui: Record<string, unknown> | null
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
  layer3: 'var(--dsw-alias-bg-layer-3, rgba(128,128,128,0.20))',
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
/** 等宽字体：倒计时数字用它 + tabular-nums ⇒ 字宽固定，不会左右蹦。 */
const monoFont = 'var(--ds-font-family-code, ui-monospace, SFMono-Regular, Menlo, Consolas, monospace)'
/** 没有这个时刻时的占位（停用任务没有下次执行；从未执行过没有上次）——图标保留，只占位时间。 */
const NO_TIME = '--:--'
/** 顶部一排的统一高度：搜索框 / 工作区下拉 / 分组按钮 / 新建 / 刷新全部同高（用户 2026-09-30 要求）。 */
const CONTROL_H = 26
/** 工作区下拉的**定长**宽度（比搜索框略宽一点；切选项时宽度不变）。 */
const WS_WIDTH = 180
/**
 * 顶部控件的统一外壳（与官方 `Input` 同款观感）：工作区下拉与刷新按钮都用它，
 * 保证「搜索 / 工作区 / 刷新」三个是**一样的高、一样的样式**。
 */
const controlBoxStyle: Record<string, string | number> = {
  display: 'inline-flex', alignItems: 'center', gap: '6px', boxSizing: 'border-box',
  height: `${CONTROL_H}px`, padding: '0 10px', borderRadius: '6px',
  border: `1px solid ${C.border}`, background: C.layer1, color: C.text,
  fontFamily: 'inherit', fontSize: '12px', lineHeight: '18px', cursor: 'pointer',
  transition,
}

// ── 顶部一排的样式注入（官方 Input 默认 32px 高，需压到与按钮同高；工作区按钮定长 + 省略号）──
const ensureTaskListStyle = (): void => {
  if (typeof document === 'undefined') return
  const id = 'dsh-tdt-list-style'
  if (document.getElementById(id) !== null) return
  const tag = document.createElement('style')
  tag.id = id
  tag.textContent = [
    // 状态条运行中：整条明暗脉动（竖条不适合旋转，脉动更显眼）。
    '@keyframes dsh-tdt-rail-pulse { 0%, 100% { opacity: 1 } 50% { opacity: 0.35 } }',
    // 官方 Input 默认 32px 高、边框色 l4 ⇒ 压到与按钮同高、并统一成同一套观感。
    `.dsh-tdt-tl-input, .dsh-tdt-tl-input > * { height: ${CONTROL_H}px; border-radius: 6px; }`,
    `.dsh-tdt-tl-input { width: ${WS_WIDTH}px; }`,
    `.dsh-tdt-tl-input input { height: ${CONTROL_H}px; font-size: 12px; }`,
    // 工作区下拉：**定长**（切选项时宽度不动，不再左右晃），内容超长尾部省略号。
    // 展开后的列表项不受这条限制 ⇒ 可以显示完整长度。
    `.dsh-tdt-tl-ws { width: ${WS_WIDTH}px; }`,
    '.dsh-tdt-tl-ws-label { flex: 1 1 auto; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; text-align: left; }',
    // 启用开关选中色 = 官方 success 绿（与编辑器头部开关 `.dsh-tdt-ed-enable` **逐值一致**，
    // 用户 2026-09-30 要求两处统一）。选择器带包装类 + role ⇒ 特异性高于官方 `.switch[aria-checked=true]`。
    ".dsh-tdt-tl-switchwrap button[role='switch'][aria-checked='true']{background:var(--dsw-alias-state-success-primary,#22c55e);}",
  ].join('\n')
  document.head.appendChild(tag)
}

// ── 轮询 ──────────────────────────────────────────────────────────────
const POLL_MS = 10_000

/** 主界面数据：一次请求出全部卡片数据；rev 未变 ⇒ 服务端回 unchanged，本地状态不动。 */
export function useTaskOverview(): {
  rows: TaskOverviewRow[]
  ready: boolean
  refresh: () => void
  /** 就地补一条行（乐观更新，见 patchRow）。 */
  patchRow: (id: string, patch: Partial<TaskOverviewRow>) => void
} {
  const [rows, setRows] = useState<TaskOverviewRow[]>([])
  const [ready, setReady] = useState(false)
  const revRef = useRef('')
  const busyRef = useRef(false)
  /** 有刷新请求落在一轮在途期间 ⇒ 那轮结束后补跑一次（见 refresh）。 */
  const pendingRef = useRef(false)
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
        if (pendingRef.current) {
          pendingRef.current = false
          setTick(v => v + 1) // 补跑被在途那轮吞掉的刷新请求
        }
      }
    }
    void poll()
    const timer = window.setInterval(() => { void poll() }, POLL_MS)
    return () => { alive = false; window.clearInterval(timer) }
  }, [tick])

  /**
   * 手动刷新 / 操作后刷新：若此刻正有一轮在途（busy），**不能丢**——记下待办，
   * 那一轮结束立刻补一次（否则「保存后刷新」会被吞掉，又退回等 10 秒轮询）。
   */
  const refresh = useCallback((): void => {
    if (busyRef.current) { pendingRef.current = true; return }
    setTick(v => v + 1)
  }, [])

  /**
   * 就地补一条行（乐观更新，用户 2026-09-30）：保存成功后**立刻**把改动落在列表上，
   * 不等服务端那 ~1 秒的落盘 + 重拉（用户：「改完还要等一秒，烦」）。改动用客户端已知的真值
   * （刚提交的草稿）填充，不编造；紧接着的 `refresh()` 会拉回服务端真值整体替换它，
   * 所以这里只是「先显示出来」，不构成第二份真源。
   */
  const patchRow = useCallback((id: string, patch: Partial<TaskOverviewRow>): void => {
    setRows(list => list.map(row => (row.id === id ? { ...row, ...patch } : row)))
  }, [])

  return { rows, ready, refresh, patchRow }
}

// ── 文案与时间 ─────────────────────────────────────────────────────────
// ⚠️ 排期人话（卡片「执行方式」/ 编辑器「预计执行」）**不在这里写**——统一在
// [`./schedule-text.ts`](./schedule-text.ts)（用户 2026-09-30 拍板：同一个排期不许两处各写一份文案，
// 真机已出现「周一…每 10 分钟执行一次」vs「每天每 10 分钟执行一次」）。此处只把任务定义的
// `schedule` 交给它。

// ── 时间「社交化」表达（2026-09-30 用户要求；分级取 GitHub / Telegram 一类公认口径）──
// 过去：刚刚 → N 分钟前 → N 小时前 → N 天前 → N 周前 → N 个月前 → N 年前；
// 未来：即将执行 → N 分钟后 → 今天/明天 HH:mm → N 天后 → N 周后 → N 个月后 → N 年后。
// 具体时刻一律放进 hover Tooltip（listLastFullTitle / listNextFullTitle）。
function formatFull(iso: string): string {
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return '—'
  const p = (v: number): string => String(v).padStart(2, '0')
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}`
}

const sameCalendarDay = (a: Date, b: Date): boolean =>
  a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate()

function relativePast(iso: string, nowMs: number, tt: Translate): string {
  const diff = nowMs - Date.parse(iso)
  if (!(diff >= 0)) return tt('relNow')
  if (diff < 60_000) return tt('relJustNow')
  const minutes = Math.floor(diff / 60_000)
  if (minutes < 60) return tt('relMinutesAgo', { n: minutes })
  const hours = Math.floor(minutes / 60)
  if (hours < 24) return tt('relHoursAgo', { n: hours })
  const days = Math.floor(hours / 24)
  if (days < 7) return tt('relDaysAgo', { n: days })
  if (days < 30) return tt('relWeeksAgo', { n: Math.floor(days / 7) })
  const months = Math.floor(days / 30)
  if (months < 12) return tt('relMonthsAgo', { n: months })
  return tt('relYearsAgo', { n: Math.floor(days / 365) })
}

function relativeFuture(iso: string, nowMs: number, tt: Translate): string {
  const target = Date.parse(iso)
  const diff = target - nowMs
  if (diff <= 0) return tt('relPast')
  if (diff < 60_000) return tt('relNow')
  const minutes = Math.floor(diff / 60_000)
  if (minutes < 60) return tt('relMinutes', { n: minutes })
  const date = new Date(target)
  const now = new Date(nowMs)
  const tomorrow = new Date(now.getTime() + 24 * 3600_000)
  if (sameCalendarDay(date, now)) return tt('relToday', { time: clockOf(iso) })
  if (sameCalendarDay(date, tomorrow)) return tt('relTomorrow', { time: clockOf(iso) })
  const days = Math.ceil(diff / 86_400_000)
  if (days < 7) return tt('relDays', { n: days })
  if (days < 30) return tt('relWeeks', { n: Math.floor(days / 7) })
  const months = Math.floor(days / 30)
  if (months < 12) return tt('relMonths', { n: months })
  return tt('relYears', { n: Math.floor(days / 365) })
}

/**
 * 24 小时内的秒级倒计时（用户 2026-09-30 定的分级）：
 * - 小时为 0 ⇒ 不显示小时（几分几秒 显示 `5:09`）；
 * - 只剩秒 ⇒ 仍要显示分位（`0:09`）；
 * - 超过 24 小时由调用方走 `relativeFuture`（明天 / 三天后 / N 周后）。
 * 每次都用「目标 − 系统当前时间」现算，不做算术递减 ⇒ 永不漂移。
 */
function countdownText(iso: string, nowMs: number, tt: Translate): string {
  const diff = Date.parse(iso) - nowMs
  if (diff <= 0) return tt('relNow')
  const total = Math.floor(diff / 1000)
  const hours = Math.floor(total / 3600)
  const minutes = Math.floor((total % 3600) / 60)
  const seconds = total % 60
  const p = (v: number): string => String(v).padStart(2, '0')
  // 数字一律两位（用户 2026-09-30：「都把它补成两位」）⇒ `05:09` / `01:05:09`，位数恒定不跳。
  return hours > 0 ? `${p(hours)}:${p(minutes)}:${p(seconds)}` : `${p(minutes)}:${p(seconds)}`
}

// ── 全局秒级心跳（单 timer + 局部订阅）────────────────────────────────
// ⚠️ 性能关键（用户 2026-09-30 反馈「延迟太严重」）：**不能**在列表顶层每秒 setState
// （那会整列表重渲染）。正确做法 = 全模块只有一个 interval，需要动的文本（倒计时）
// 各自订阅，每秒只重渲染那一小块。
const tickerListeners = new Set<() => void>()
let tickerTimer: number | null = null
function subscribeTicker(cb: () => void): () => void {
  tickerListeners.add(cb)
  if (tickerTimer === null) {
    tickerTimer = window.setInterval(() => { for (const l of [...tickerListeners]) l() }, 1000)
    // 标签页被浏览器节流（后台 / 休眠）后回来 ⇒ 立刻对一次表，倒计时自动追上。
    document.addEventListener('visibilitychange', () => { for (const l of [...tickerListeners]) l() })
  }
  return () => {
    tickerListeners.delete(cb)
    if (tickerListeners.size === 0 && tickerTimer !== null) {
      window.clearInterval(tickerTimer)
      tickerTimer = null
    }
  }
}

/** 每秒自刷新的一小段文本：只有它自己重渲染（render 永远取最新闭包，ref 转发）。 */
function LiveText(props: { render: (nowMs: number) => string; style?: Record<string, string | number>; title?: string }) {
  const [, force] = useState(0)
  const renderRef = useRef(props.render)
  renderRef.current = props.render
  useEffect(() => subscribeTicker(() => force(v => v + 1)), [])
  return h('span', { style: props.style, title: props.title }, renderRef.current(Date.now()))
}

/** HH:mm（本机时区）。 */
function clockOf(iso: string): string {
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return '—'
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`
}

/** 「09 月 28 日」（本机时区；月 / 日补两位，用户 2026-09-30）。 */
function dateOf(iso: string): string {
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return '—'
  const p = (v: number): string => String(v).padStart(2, '0')
  return `${p(d.getMonth() + 1)} 月 ${p(d.getDate())} 日`
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

// ── 状态条（StatusRail）───────────────────────────────────────────────
// 命名：中文「**状态条**」，组件 `StatusRail`——它是贴在卡片左缘、与正文两行等高的竖向色条，
// 比原来的小圆点显眼得多（用户 2026-09-30：只给个点儿出颜色，看不清）。
const RAIL_W = 6
const RAIL_H = 36

/** 运行中：整条**绿色**明暗脉动（用户 2026-09-30：执行中是正常状态，不能灰/白闪）。 */
function RunningRail() {
  return h('span', {
    style: {
      display: 'inline-block', width: `${RAIL_W}px`, height: `${RAIL_H}px`, flex: 'none',
      borderRadius: '3px', background: C.success,
      animation: 'dsh-tdt-rail-pulse 900ms ease-in-out infinite',
    },
  })
}

function StatusRail(props: { row: TaskOverviewRow }) {
  const { row } = props
  if (row.running) return h(RunningRail, {})
  const color = !row.enabled ? C.textFaint : row.lastStatus === 'failed' ? C.danger : C.success
  const hint = !row.enabled ? '已关闭' : row.lastStatus === 'failed' ? '最近一次执行失败' : '计划运行中'
  return h('span', {
    title: hint,
    style: {
      display: 'inline-block', width: `${RAIL_W}px`, height: `${RAIL_H}px`, flex: 'none',
      borderRadius: '3px', background: color,
      transition: `background ${C.duration} ${C.ease}`,
    },
  })
}

/**
 * 「历史执行」与「下次执行」是**两个独立**小标签（2026-09-30 用户拍板：不要合成一格四段，
 * 拆成两块更清爽）。每个标签 = 语义底色的图标格 + 时间格，整体一个圆角细边框。
 * - 历史执行：成功绿 / 失败红 / 无状态灰，图标 = 历史时钟；时间格当天 HH:mm、跨天「3 小时前 / 1 天前」。
 * - 下次执行：图标 = 闹钟；时间格一天以内 = HH:mm:ss **秒级倒计时**（LiveText 自转），
 *   超过 24 小时 = 明天 / 三天后 / N 周后。
 *
 * ⚠️ 悬浮提示包在**整个标签**外层，且 Tooltip 的子元素必须是**真 DOM 元素**（`h('div', …)`）——
 * 官方 Tooltip 靠给子元素挂 ref 实现，子元素若是普通函数组件（如 `LiveText`）ref 挂不上 ⇒
 * 提示**静默失效**（用户 2026-09-30 真机反馈「移上去没提示」的根因，与 task-editor 里
 * 「图标要包真 `<button>`」是同一个坑）。
 */
const pillOuterStyle: Record<string, string | number> = {
  display: 'inline-flex', alignItems: 'stretch', flex: 'none', height: '20px',
  borderRadius: '7px', overflow: 'hidden', border: `1px solid ${C.border}`,
}
/** 图标格：语义底色 + 图标（成功绿 / 失败红 / 无状态灰 / 下次中性）。 */
const pillIconCell = (bg: string, fg: string): Record<string, string | number> => ({
  display: 'inline-flex', alignItems: 'center', padding: '0 6px', background: bg, color: fg, flex: 'none',
})
/** 时间格：**等宽数字**（tabular-nums + 代码字体）⇒ 倒计时每秒变化不会因字宽不同而左右蹦。 */
const pillTimeCell: Record<string, string | number> = {
  display: 'inline-flex', alignItems: 'center', padding: '0 8px', background: C.layer1, color: C.text,
  fontSize: '11px', lineHeight: '14px', whiteSpace: 'nowrap',
  fontVariantNumeric: 'tabular-nums', fontFamily: monoFont,
}

/** 历史执行标签（成功绿 / 失败红 / 无状态灰）。 */
function PastPill(props: { row: TaskOverviewRow; t: Translate; tt: Translate }) {
  const { row, t, tt } = props
  const has = row.lastStatus !== null && row.lastScheduledAt !== null
  const bg = !has ? C.layer3 : row.lastStatus === 'succeeded' ? C.success : C.danger
  const title = has ? tt('listLastFullTitle', { when: formatFull(row.lastScheduledAt ?? '') }) : t('listNever')
  return h(Tooltip, { label: title, side: 'bottom' },
    h('div', { style: pillOuterStyle },
      h('span', { style: pillIconCell(bg, has ? '#fff' : C.textDim) }, h(IconClockOutlineRegular, { size: 12 })),
      h(LiveText, {
        style: pillTimeCell,
        render: (nowMs: number): string => {
          if (!has) return NO_TIME
          const iso = row.lastScheduledAt ?? ''
          return sameCalendarDay(new Date(iso), new Date(nowMs)) ? clockOf(iso) : relativePast(iso, nowMs, tt)
        },
      }),
    ),
  )
}

/** 下次执行标签（一天以内 = 秒级倒计时；超过 24 小时 = 明天 / 三天后 / N 周后）。 */
function NextPill(props: { row: TaskOverviewRow; t: Translate; tt: Translate }) {
  const { row, t, tt } = props
  const title = row.nextSlotAt === null
    ? t('listNextNone')
    : tt('listNextFullTitle', { when: formatFull(row.nextSlotAt) })
  return h(Tooltip, { label: title, side: 'bottom' },
    h('div', { style: pillOuterStyle },
      h('span', { style: pillIconCell(C.layer3, C.text) }, h(IconAlarmClockOutlineRegular, { size: 12 })),
      h(LiveText, {
        style: pillTimeCell,
        render: (nowMs: number): string => {
          if (row.nextSlotAt === null) return NO_TIME
          const diff = Date.parse(row.nextSlotAt) - nowMs
          return diff < 24 * 3600_000
            ? countdownText(row.nextSlotAt, nowMs, tt)
            : relativeFuture(row.nextSlotAt, nowMs, tt)
        },
      }),
    ),
  )
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
const sectionLabelStyle: Record<string, string | number> = { fontSize: '11px', color: C.textFaint, marginTop: '10px', marginBottom: '2px' }
const sectionBodyStyle: Record<string, string | number> = { fontSize: '12px', color: C.text, lineHeight: '18px' }
/** 图标按钮：与顶部一排同高（26px）。 */
const iconBtnStyle: Record<string, string | number> = {
  display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: '4px',
  height: `${CONTROL_H}px`, minWidth: `${CONTROL_H}px`, padding: '0 6px', border: `1px solid ${C.border}`,
  borderRadius: '6px', background: 'transparent', color: C.textDim, cursor: 'pointer',
  fontFamily: 'inherit', fontSize: '12px', transition,
}

function TaskCard(props: {
  row: TaskOverviewRow
  t: Translate
  tt: Translate
  open: boolean
  onToggleOpen: () => void
  onEdit: (id: string) => void
  onToggleEnabled: (id: string, enabled: boolean) => void
  refOf: (el: HTMLElement | null) => void
}) {
  const { row, t, tt, open, onToggleOpen, onEdit, onToggleEnabled, refOf } = props
  // 排期人话与编辑器「预计执行」**同一份实现**（`schedule-text.ts`，优先吃结构化 ui）⇒ 两处必然一致。
  const scheduleLine = scheduleText(scheduleSpecFromSchedule(row.schedule), t)
  const modelText = row.model === null ? tt('listFieldModelDefault') : row.model

  return h('div', { ref: refOf, style: cardStyle },
    // 主行：**垂直居中**（用户 2026-09-30：右侧开关 / 展开箭头要与卡片边界居中对齐）
    h('div', { style: { display: 'flex', alignItems: 'center', gap: '12px' } },
      h(StatusRail, { row }),
      h('div', { style: { flex: '1 1 auto', minWidth: 0 } },
        // 标题 / 执行方式：**单行省略号 + hover 跑马灯**（窗口窄、文字长不再撑高卡片，用户 2026-09-30）。
        h('div', { style: { display: 'flex', alignItems: 'baseline', gap: '6px', minWidth: 0 } },
          h('div', { style: { ...titleStyle, flex: '0 1 auto', minWidth: 0 } }, h(MarqueeText, { text: row.title })),
          row.code !== null ? h('span', { style: { ...faintStyle, flex: 'none', display: 'inline' } }, `[${row.code}]`) : null,
          row.enabled ? null : h('span', { style: { ...faintStyle, flex: 'none', display: 'inline' } }, t('listDisabledTag')),
        ),
        // 执行方式是完整一句话（「每周一、周二，每 10 分钟执行一次」），放不下同样跑马灯。
        h('div', { style: { ...metaStyle, minWidth: 0 } }, h(MarqueeText, { text: scheduleLine })),
        row.createdAt === null ? null : h('div', { style: faintStyle }, `${t('listCreatedPrefix')} ${dateOf(row.createdAt)}`),
      ),
      // 右：历史执行 / 下次执行两个**独立**小标签 → 启用拨片 → 展开箭头。
      h('div', { style: { display: 'flex', alignItems: 'center', gap: '8px', flex: 'none' } },
        h(PastPill, { row, t, tt }),
        h(NextPill, { row, t, tt }),
        // 开关与编辑器头部开关**统一**：包一层类名壳，交给 CSS 把选中态刷成官方 success 绿。
        // （官方 Switch 默认选中色是 brand-primary：亮色主题下近乎黑、暗色近乎白 ⇒ 两处看着不一样。）
        h('span', { className: 'dsh-tdt-tl-switchwrap' },
          h(Switch, {
            checked: row.enabled,
            onChange: (next: boolean) => { onToggleEnabled(row.id, next) },
            label: row.enabled ? t('listFilterEnabled') : t('listFilterDisabled'),
            title: row.enabled ? t('listFilterEnabled') : t('listFilterDisabled'),
          }),
        ),
        h('button', {
          type: 'button', style: { ...iconBtnStyle, border: 'none', transform: open ? 'rotate(180deg)' : 'none' },
          title: t('expandHint'), onClick: onToggleOpen,
          'aria-expanded': open,
        }, h(IconChevronDownOutlineRegular, { size: 14 })),
      ),
    ),
    // ── 展开区：就地拉伸，上方原样，下方读任务设置（「详细说明」）──
    open ? h('div', { style: { marginTop: '10px', borderTop: `1px dashed ${C.border}`, paddingTop: '8px' } },
      h('div', { style: sectionLabelStyle }, t('listSectionSchedule')),
      h('div', { style: sectionBodyStyle },
        `${t('listFieldSchedule')}：${scheduleLine} · ${t('listFieldWorkspace')}：${row.workspace} · ${t('listFieldModel')}：${modelText} · ${t('listFieldRetry')}：${row.retryMax} · ${t('listFieldWindow')}：${row.schedule.window}`,
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
      // 详细说明下面再来一条虚线，右下角放「编辑」——不是每次都要编辑，不占主行的重要位置。
      h('div', { style: { marginTop: '10px', paddingTop: '8px', borderTop: `1px dashed ${C.border}`, display: 'flex', justifyContent: 'flex-end' } },
        h('button', {
          type: 'button',
          style: { ...iconBtnStyle, padding: '0 10px' },
          onClick: () => { onEdit(row.id) },
        }, h(IconEditOutlineRegular, { size: 14 }), t('editorEdit')),
      ),
    ) : null,
  )
}

// ── 视图 ───────────────────────────────────────────────────────────────
export function TaskListView(props: {
  t: Translate
  rows: readonly TaskOverviewRow[]
  ready: boolean
  onEdit: (id: string) => void
  /** 启用 / 停用：返回 null = 成功，否则返回人话错误（列表据此回滚乐观值）。 */
  onToggleEnabled: (id: string, enabled: boolean) => Promise<string | null>
}): ReturnType<typeof h> {
  const { t, rows, ready, onEdit, onToggleEnabled } = props
  const tt = useMemo(() => interpolateTranslate(t), [t])
  ensureTaskListStyle()
  // 跑马灯样式（.dsh-tdt-mq）在编辑器样式模块里注入；列表独立打开时也要有（幂等）。
  ensureTaskEditorStyle()
  const [filter, setFilter] = useState<'all' | 'enabled' | 'disabled' | 'abnormal'>('all')
  const [workspace, setWorkspace] = useState<string>('')
  const [menuOpen, setMenuOpen] = useState(false)
  const [query, setQuery] = useState('')
  const [openId, setOpenId] = useState<string | null>(null)
  /** 拨片的乐观值：点了立刻变，等服务端确认（它会马上同步任务表并重新拉一次）后清除。 */
  const [optimistic, setOptimistic] = useState<Record<string, boolean>>({})

  const rowsWithOptimistic = useMemo(() => {
    const keys = Object.keys(optimistic)
    if (keys.length === 0) return rows
    return rows.map(row => (row.id in optimistic ? { ...row, enabled: optimistic[row.id] } : row))
  }, [rows, optimistic])

  // 真实数据到位 ⇒ 清掉乐观值（避免长期覆盖服务端值）。
  useEffect(() => { setOptimistic({}) }, [rows])

  // ⚠️ 这里**不放**每秒 setState：倒计时的时间流走 LiveText 的全局心跳（局部重渲染），
  // 列表本体只在数据真变时才动——这正是「每秒刷新会不会卡」的答案。

  const workspaces = useMemo(() => [...new Set(rowsWithOptimistic.map(r => r.workspace))].sort(), [rowsWithOptimistic])
  /** 异常数 = 内存摘要里「最近一次执行失败」的任务数（全量统计，不受当前筛选影响）。 */
  const abnormalCount = useMemo(
    () => rowsWithOptimistic.filter(row => row.lastStatus === 'failed').length,
    [rowsWithOptimistic],
  )

  const visible = useMemo(() => {
    const q = query.trim().toLowerCase()
    const filtered = rowsWithOptimistic.filter(row => {
      if (filter === 'enabled' && !row.enabled) return false
      if (filter === 'disabled' && row.enabled) return false
      if (filter === 'abnormal' && row.lastStatus !== 'failed') return false
      if (workspace !== '' && row.workspace !== workspace) return false
      if (q === '') return true
      return row.title.toLowerCase().includes(q) || (row.code ?? '').toLowerCase().includes(q)
    })
    return sortRows(filtered)
    // 排序只依赖内容本身；nowMs 变化不参与 ⇒ 每秒 tick 不会引起重排与动画。
  }, [rowsWithOptimistic, filter, workspace, query])

  // FLIP 签名：只在「可见集合与顺序」变化时触发动画。
  const signature = visible.map(r => `${r.id}:${r.running ? 1 : 0}:${r.enabled ? 1 : 0}`).join('|')
  const refOf = useFlip(signature)

  const menuItems = useMemo(() => [
    { id: '', label: t('listFilterWorkspaceAll') },
    ...workspaces.map(name => ({ id: name, label: name })),
  ], [workspaces, t])

  const tabStyle = (active: boolean): Record<string, string | number> => ({
    display: 'inline-flex', alignItems: 'center', gap: '4px',
    height: `${CONTROL_H}px`, padding: '0 12px', border: 'none', cursor: 'pointer',
    fontSize: '12px', fontFamily: 'inherit', transition, borderRadius: '6px',
    background: active ? C.layer1 : 'transparent',
    color: active ? C.text : C.textDim,
    fontWeight: active ? 600 : 400,
  })
  /** 异常数的角标（0 不显示）。 */
  const countBadge = (n: number): ReturnType<typeof h> | null => (
    n > 0
      ? h('span', {
        style: {
          display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
          minWidth: '16px', height: '16px', padding: '0 4px', borderRadius: '8px',
          background: C.danger, color: '#fff', fontSize: '11px', lineHeight: '16px',
        },
      }, String(n))
      : null
  )

  return h('div', { style: { width: '100%', display: 'flex', justifyContent: 'center' } },
    h('div', { style: { width: '100%', maxWidth: '1120px', minWidth: '760px', boxSizing: 'border-box' } },
      // 顶部一排：左 = 分组按钮（全部 / 已开启 / 已关闭 / 异常）；右 = 搜索 → 工作区下拉 → 刷新。
      h('div', { style: { display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '12px', flexWrap: 'wrap' } },
        h('div', { style: { display: 'inline-flex', gap: '2px', padding: '2px', borderRadius: '8px', background: C.layer2, border: `1px solid ${C.border}` } },
          h('button', { type: 'button', style: tabStyle(filter === 'all'), onClick: () => { setFilter('all') } }, t('listFilterAll')),
          h('button', { type: 'button', style: tabStyle(filter === 'enabled'), onClick: () => { setFilter('enabled') } }, t('listFilterEnabled')),
          h('button', { type: 'button', style: tabStyle(filter === 'disabled'), onClick: () => { setFilter('disabled') } }, t('listFilterDisabled')),
          h('button', { type: 'button', style: tabStyle(filter === 'abnormal'), onClick: () => { setFilter('abnormal') } },
            t('listFilterAbnormal'), countBadge(abnormalCount)),
        ),
        h('span', { style: { flex: '1 1 auto' } }),
        h('div', { style: { display: 'flex', alignItems: 'center', gap: '8px', flex: 'none' } },
          h(Input, {
            className: 'dsh-tdt-tl-input',
            icon: h(IconSearchOutlineRegular, { size: 14 }),
            value: query,
            placeholder: t('listSearchPlaceholder'),
            onChange: (event: { target: { value: string } }) => { setQuery(event.target.value) },
          }),
          h(Menu, {
            open: menuOpen,
            // 与搜索框**同款同高**（controlBoxStyle），右侧带 chevron ⇒ 一眼看得出是下拉框。
            anchor: h('button', {
              type: 'button', className: 'dsh-tdt-tl-ws', style: controlBoxStyle,
              onClick: () => { setMenuOpen(v => !v) },
            },
              h('span', { className: 'dsh-tdt-tl-ws-label' }, workspace === '' ? t('listFilterWorkspaceAll') : workspace),
              h(IconChevronDownOutlineRegular, { size: 14 }),
            ),
            items: menuItems,
            selectedId: workspace,
            onSelect: (id: string) => { setWorkspace(id); setMenuOpen(false) },
            onClose: () => { setMenuOpen(false) },
          }),
        ),
      ),
      visible.length === 0
        ? h('p', { style: { ...metaStyle, marginTop: '8px' } },
          rows.length === 0 && !ready ? '' : rows.length === 0 ? t('listEmpty') : t('listEmptyFiltered'))
        : h('div', { style: { position: 'relative' } },
          visible.map(row => h(TaskCard, {
            key: row.id,
            row, t, tt,
            open: openId === row.id,
            onToggleOpen: () => { setOpenId(cur => (cur === row.id ? null : row.id)) },
            onEdit,
            onToggleEnabled: (id: string, enabled: boolean): void => {
              setOptimistic(cur => ({ ...cur, [id]: enabled })) // 点了立刻变，不等请求往返
              onToggleEnabled(id, enabled)
            },
            refOf: refOf(row.id),
          })),
        ),
    ),
  )
}
