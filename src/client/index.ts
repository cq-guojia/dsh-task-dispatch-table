// 浏览器半侧：本插件的 Web 配置页（设置页「插件」标签页 → 本插件卡片）。
//
// 机制（真机作业核实：dsh-session-title-pattern 的同款入口已在宿主跑通）：
// 1. 注册面 = settings.plugin.item（keyed slot，key = settings 命名空间）。设置页
//    「插件」标签页遍历已服务命名空间并与 key 自动配对渲染，不需要自己 gating。
// 2. 顶层不得导出 inject：声明了组合满足不了的依赖会让 entry 一直 pending，
//    卡死整个 dsh 启动。服务等待一律写在 apply 内的 ctx.inject([...], cb)。
// 3. t 席位由渲染器按注册项的 locale: 声明合成进 props；scope 由 inject 工厂注入。
// 4. 组件经 useSyncExternalStore 消费 scope 快照（value = schema 默认兜底的完整值、
//    user = 用户层稀疏覆盖、writable）；保存走 scope.set/unset —— 写入走
//    remote.settings.mutate，以快照 revision 设栅，并发脱节时抛错。
//
// 纯净度：本文件不 import 任何 Node 侧模块，也不 import 宿主 @deepseek-ai/* 包的
// 值——跨插件协作走 cordis 服务注入（locale/slots/settingsScope），类型全部本地
// 结构化声明。客户端 bundle 不打包 src/config.ts（Node 侧），Config 语义在此以
// 字段名复述。

import { createElement as h, Fragment, useCallback, useEffect, useState, useSyncExternalStore } from 'react'
import { en, zh, type LocaleKey } from './locales'
import { openSessionView, SessionViewModal, type SessionViewTarget, type SessionsFace, type UiConversationFace } from './session-view'

/** 设置命名空间 = 宿主 apply() 里 ctx.settings.register 的注册名（src/index.ts:42）。 */
const SETTINGS_NS = 'dsh-task-dispatch-table'
/** 字典命名空间（locale 注册表独立于 settings 命名空间，取同名便于对应）。 */
const LOCALE_NS = SETTINGS_NS
/** 主面板 id：`main` 槽的 key 与 `sidebar.panellist` 条目的 id 必须一致，选中才对得上。 */
const PANEL_ID = SETTINGS_NS
/** 模块级 t 席位：`sidebar.panellist` 的 label 在渲染期由侧栏求值，拿不到组件 props 的 t。 */
let runtimeT: Translate = (key) => key

// ─────────────────────────── 本地结构类型（不 import 宿主包） ───────────────────────────

type Translate = (key: LocaleKey) => string

/** settingsScope 快照中本页消费的切片（SettingsScopeSnapshot 的结构子集）。 */
interface ScopeSnapshot {
  status: string
  value: Record<string, unknown> | undefined
  base: Record<string, unknown> | undefined
  user: Record<string, unknown> | undefined
  writable: boolean
}

/** 一个 settings 命名空间的作用域（SettingsScopeController 的结构子集）。 */
interface SettingsScope {
  getSnapshot(): ScopeSnapshot
  subscribe(listener: () => void): () => void
  set(field: string, value: unknown): Promise<void>
  unset(field: string): Promise<void>
}

// ── rc.1 的共享配置表单服务（configForms）结构子集 ──
/** 配置表单快照：与 ConfigFormSnapshot 同形（多了 revision / mode，本插件不用）。 */
interface ConfigFormSnapshot {
  status: string
  value: Record<string, unknown> | undefined
  base: unknown
  user: unknown
  writable: boolean
}
/** 一个 Host 注册项的配置表单（@deepseek-ai/dsh-client-ui-settings 的 ConfigForm 子集）。 */
interface ConfigForm {
  getSnapshot(): ConfigFormSnapshot
  subscribe(listener: () => void): () => void
  set(field: string, value: unknown): Promise<boolean>
  unset(field: string): Promise<boolean>
}
/** 共享配置表单服务：按 **profile entry id** 取表单（rc.1 起按 entry id 寻址）。 */
interface ConfigForms {
  get(entryId: string): ConfigForm
  /** 已服务的命名空间视图，用于探测本插件实际落在哪个 entry id 上。 */
  describe(): { getSnapshot(): { view?: { namespaces?: readonly { ns: string }[] } } }
}

/** 浏览器插件上下文：只声明本文件实际用到的服务面。 */
interface ClientContext {
  /** 延迟等待服务就位后执行回调（服务名 = cordis 声明名）。 */
  inject(deps: readonly string[], cb: (ctx: ClientContext) => void): void
  /** 组合内副作用：进入时 setup、离开时执行返回的清理函数。 */
  effect(setup: () => (() => void) | void): void
  locale: {
    register(ns: string, dictionaries: Record<string, Record<string, string>>): void
    /** 绑定命名空间得到 t 席位（供渲染期求值的 slot label 用，与注册项 locale: 同源）。 */
    bind(ns: string): Translate
  }
  /**
   * 布局服务（@deepseek-ai/dsh-client-ui-layout 的 `layout`）。`main` 槽的激活态由它托管：
   * `selectPanel(id)` 切到某主面板、`selectPanel(null)` 回到会话。
   */
  layout?: {
    selectPanel(panelId: string | null): void
  }
  slots: {
    /** 延迟注册：slot 声明出现时才调用 factory，返回注销函数。 */
    inject(slot: string, factory: () => () => void): () => void
    /** 注册一个条目，返回注销函数。 */
    register(options: Record<string, unknown>, component: unknown): () => void
  }
  /**
   * 设置命名空间作用域服务。⚠️ dsh 0.1.7-rc.1 客户端已把 `settingsScope` 换成
   * `configForms` / `settingsSchema`（见 @deepseek-ai/dsh-client-ui-settings@0.1.7-rc.1）；
   * 此处按旧名探测，缺席时不激活（不 throw、不阻塞侧栏入口）。
   */
  settingsScope?: {
    bind(spec: { namespace: string }): SettingsScope
  }
  /** rc.1 的共享配置表单服务（按 profile entry id 寻址）；与 settingsScope 二选一。 */
  configForms?: ConfigForms
}

// ─────────────────────────── 页面组件 ───────────────────────────

/** 只读参数展示值：undefined 显示占位符，statePath 空串 = 宿主数据根默认（决策 14）。 */
function displayParam(t: Translate, value: unknown): string {
  if (value === undefined) return '—'
  if (typeof value === 'string' && value.trim() === '') return t('paramDefault')
  return String(value)
}

// ── 主题适配（决策 26 修订）────────────────────────────────────────────
// 所有颜色一律取**宿主自己的主题变量**（`@deepseek-ai/dsh-client-ui-theme` 里的 `--dsw-alias-*`
// 与 `--ds-*`）。宿主切「明色 / 暗色 / 跟随系统」时这些变量随之改变 ⇒ 插件自动跟着变，
// 我们不需要自己判断当前是什么主题，也不写死任何颜色。括号里是变量缺失时的兜底值。
const C = {
  text: 'var(--dsw-alias-label-primary, #1f2328)',
  textDim: 'var(--dsw-alias-label-secondary, rgba(128,128,128,0.95))',
  textFaint: 'var(--dsw-alias-label-tertiary, rgba(128,128,128,0.8))',
  layer1: 'var(--dsw-alias-bg-layer-1, rgba(128,128,128,0.10))',
  layer2: 'var(--dsw-alias-bg-layer-2, rgba(128,128,128,0.14))',
  layer3: 'var(--dsw-alias-bg-layer-3, rgba(128,128,128,0.20))',
  mask: 'var(--dsw-alias-bg-mask-1, rgba(0,0,0,0.45))',
  border: 'var(--dsw-alias-border-l2, rgba(128,128,128,0.35))',
  borderStrong: 'var(--dsw-alias-border-l3, rgba(128,128,128,0.5))',
  brand: 'var(--dsw-alias-brand-primary, #2f6feb)',
  danger: 'var(--dsw-alias-state-error-primary, #c0392b)',
  hover: 'var(--dsw-alias-interactive-bg-hover, rgba(128,128,128,0.16))',
  activeRow: 'var(--dsw-alias-interactive-bg-active, rgba(128,128,128,0.20))',
  shadow: 'var(--dsw-shadow-lv3, 0 12px 40px rgba(0,0,0,0.32))',
  duration: 'var(--ds-transition-duration, 0.15s)',
  ease: 'var(--ds-ease-in-out, ease)',
}
const monoFont = 'var(--ds-font-family-code, ui-monospace, SFMono-Regular, Menlo, Consolas, monospace)'
const transition = `background ${C.duration} ${C.ease}, color ${C.duration} ${C.ease}, border-color ${C.duration} ${C.ease}`

const textareaStyle: Record<string, string | number> = {
  width: '100%', boxSizing: 'border-box', minHeight: '16em', resize: 'vertical',
  fontFamily: monoFont, fontSize: '12px', lineHeight: 1.5, padding: '8px',
  color: C.text, background: C.layer1, border: `1px solid ${C.border}`, borderRadius: '8px',
}
const hintStyle: Record<string, string | number> = { color: C.textDim, fontSize: '12px', margin: '4px 0 8px' }
const errorStyle: Record<string, string | number> = { color: C.danger, fontSize: '12px', margin: '4px 0 0' }
const rowStyle: Record<string, string | number> = { display: 'flex', gap: '8px', margin: '8px 0' }
const dlStyle: Record<string, string | number> = { display: 'grid', gridTemplateColumns: 'auto 1fr', gap: '4px 16px', margin: '8px 0 0' }

// ── 设置页卡片：只留一行「标题 + 描述 + 箭头」，点一下开面板（与宿主其它插件卡片同形）──
const cardStyle: Record<string, string | number> = {
  display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '12px',
  padding: '12px 14px', border: `1px solid ${C.border}`, borderRadius: '10px',
  cursor: 'pointer', width: '100%', boxSizing: 'border-box', background: 'transparent',
  textAlign: 'left', color: C.text, transition,
}
const cardTitleStyle: Record<string, string | number> = { fontSize: '14px', fontWeight: 600, color: C.text }
const cardDescStyle: Record<string, string | number> = { fontSize: '12px', color: C.textDim, marginTop: '2px' }
const chevronStyle: Record<string, string | number> = { color: C.textFaint, display: 'flex', alignItems: 'center' }

// ── 面板（main 槽整页）样式 ──
/** 主区整页容器：占满中栏、自己滚动（会话区被 main 槽整页替换，无需遮罩）。 */
const pageStyle: Record<string, string | number> = {
  height: '100%', width: '100%', boxSizing: 'border-box', overflow: 'auto',
  padding: '18px 22px', color: C.text, background: 'transparent',
}
/** 「返回会话」按钮：轻量文字按钮，退回会话区（selectPanel(null)）。 */
const backButtonStyle: Record<string, string | number> = {
  display: 'inline-flex', alignItems: 'center', gap: '6px', flex: 'none',
  padding: '5px 10px', borderRadius: '8px', border: `1px solid ${C.border}`,
  background: 'transparent', color: C.textDim, cursor: 'pointer',
  fontFamily: 'inherit', fontSize: '12px', lineHeight: '18px', transition,
}
/** 抬头的三块：标题在左，右依次是「刷新 · 分组标签 · 关闭」。 */
const panelHeaderStyle: Record<string, string | number> = {
  display: 'flex', alignItems: 'center', justifyContent: 'space-between',
  gap: '12px', marginBottom: '4px', flexWrap: 'wrap',
}
const headerRightStyle: Record<string, string | number> = { display: 'flex', alignItems: 'center', gap: '8px' }
const panelTitleStyle: Record<string, string | number> = { fontSize: '15px', fontWeight: 600, color: C.text }
/** 分组标签组（分段控件）：与宿主「近 24 小时 / 近 7 天 …」同形。 */
const segmentedStyle: Record<string, string | number> = {
  display: 'inline-flex', alignItems: 'center', gap: '2px', padding: '2px',
  borderRadius: '8px', background: C.layer2, border: `1px solid ${C.border}`,
}
function segmentStyle(active: boolean): Record<string, string | number> {
  return {
    padding: '3px 12px', borderRadius: '6px', border: 'none', cursor: 'pointer',
    fontSize: '12px', lineHeight: '18px', fontFamily: 'inherit', transition,
    background: active ? C.layer1 : 'transparent',
    color: active ? C.text : C.textDim,
    fontWeight: active ? 600 : 400,
    boxShadow: active ? C.shadow : 'none',
  }
}
/** 图标按钮（刷新 / 关闭）：方形、圆角、悬停高亮，尺寸与分段控件同高。 */
const iconButtonStyle: Record<string, string | number> = {
  display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
  width: '26px', height: '26px', padding: 0, border: 'none', borderRadius: '6px',
  background: 'transparent', color: C.textDim, cursor: 'pointer', transition,
}
const sectionTitleStyle: Record<string, string | number> = { margin: '12px 0 4px', fontSize: '13px', color: C.text }
const preStyle: Record<string, string | number> = {
  fontFamily: monoFont, fontSize: '12px', lineHeight: 1.5, margin: '4px 0',
  whiteSpace: 'pre-wrap', wordBreak: 'break-all', maxHeight: '12em', overflow: 'auto',
  background: C.layer2, color: C.text, padding: '8px', borderRadius: '6px',
}
const tableStyle: Record<string, string | number> = {
  borderCollapse: 'collapse', width: '100%', fontFamily: monoFont, fontSize: '12px', margin: '4px 0',
}
const cellStyle: Record<string, string | number> = {
  border: `1px solid ${C.border}`, padding: '2px 6px', textAlign: 'left', verticalAlign: 'top',
}
const detailCellStyle: Record<string, string | number> = {
  ...cellStyle, whiteSpace: 'pre-wrap', wordBreak: 'break-all', maxWidth: '480px',
}
/** 行内文字按钮（链接样式）：用于「查看会话」等轻量动作。 */
const linkStyle: Record<string, string | number> = {
  color: C.brand, cursor: 'pointer', background: 'none', border: 'none', padding: 0,
  font: 'inherit', fontSize: '12px', transition,
}

/** 刷新图标（内联 SVG：不引宿主包，颜色走 currentColor ⇒ 自动跟随主题）。 */
function RefreshIcon() {
  return h('svg', {
    width: 15, height: 15, viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor',
    strokeWidth: 2, strokeLinecap: 'round', strokeLinejoin: 'round',
  },
    h('path', { d: 'M21 12a9 9 0 1 1-2.64-6.36' }),
    h('path', { d: 'M21 3v6h-6' }),
  )
}

/** 任务表图标（内联 SVG：清单勾选，颜色走 currentColor ⇒ 自动跟随主题）。 */
function TaskIcon(props: { size?: number }) {
  const size = props.size ?? 18
  return h('svg', {
    width: size, height: size, viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor',
    strokeWidth: 2, strokeLinecap: 'round', strokeLinejoin: 'round',
  },
    h('rect', { x: 4, y: 4, width: 16, height: 16, rx: 3 }),
    h('path', { d: 'M8 9.5l2 2 3.5-3.5' }),
    h('path', { d: 'M8 15.5h8' }),
  )
}

/** 任务表草稿是否为宿主可解析的 JSON 数组（空白串视为清空，合法）。 */
function isValidTaskTable(text: string): boolean {
  if (text.trim() === '') return true
  try {
    return Array.isArray(JSON.parse(text))
  } catch {
    return false
  }
}

// ── 调试快照（host 侧 index.ts writeSnapshot 的序列化形状，本地结构化复述）──

/** 任务明细行：决策 25 后 id 由系统生成，title 只是给人看的。 */
interface DebugTaskRow {
  id: string
  title: string
  enabled: boolean
  cron: string | null
  once: string | null
  timezone: string | null
  window: string
  workspace: string
  next: string | null
}

interface DebugInstanceRow {
  id: string
  task_id: string
  logical_date: string
  scheduled_at: string
  status: string
  attempt: number
  session_id: string | null
  updated_at: string
}

interface DebugEventRow {
  seq: number
  instance_id: string
  ts: string
  kind: string
  detail: string | null
}

interface DebugSnapshotData {
  at: string
  tasks: DebugTaskRow[]
  instances: DebugInstanceRow[]
  events: DebugEventRow[]
  warns: string[]
}

/** 宿主写入的 ISO 时间串 → 浏览器本机时区可读格式（解析失败原样返回）。 */
function formatTime(iso: string): string {
  const ms = Date.parse(iso)
  if (Number.isNaN(ms)) return iso
  return new Date(ms).toLocaleString(undefined, { hour12: false })
}

/** 任务行归一：旧版快照的 tasks 是 string[]（只有 id），兼容成明细行。 */
function normalizeTaskRow(item: unknown): DebugTaskRow {
  if (typeof item === 'string') {
    return { id: item, title: item, enabled: true, cron: null, once: null, timezone: null, window: '', workspace: '', next: null }
  }
  const row = (item ?? {}) as Partial<DebugTaskRow>
  return {
    id: String(row.id ?? ''),
    title: String(row.title ?? row.id ?? ''),
    enabled: row.enabled !== false,
    cron: row.cron ?? null,
    once: row.once ?? null,
    timezone: row.timezone ?? null,
    window: String(row.window ?? ''),
    workspace: String(row.workspace ?? ''),
    next: row.next ?? null,
  }
}

/** 解析快照 JSON；为空或形状不符返回 undefined（原文由调用方兜底展示）。 */
function parseDebugSnapshot(raw: unknown): DebugSnapshotData | undefined {
  if (typeof raw !== 'string' || raw.trim() === '') return undefined
  try {
    const parsed: unknown = JSON.parse(raw)
    if (typeof parsed !== 'object' || parsed === null) return undefined
    const candidate = parsed as Partial<DebugSnapshotData>
    if (!Array.isArray(candidate.instances) || !Array.isArray(candidate.events)) return undefined
    const tasks = Array.isArray(candidate.tasks) ? candidate.tasks.map(normalizeTaskRow) : []
    return { ...(parsed as DebugSnapshotData), tasks }
  } catch {
    return undefined
  }
}

/** 调试页：GET /db 返回的一张表（与宿主 TableDump 同形，客户端结构化声明不引宿主类型）。 */
interface DbTableDump {
  name: string
  count: number
  columns: string[]
  rows: Record<string, unknown>[]
  truncated: boolean
}



/** 周期摘要：once 优先，其次 cron（带时区），都没有显示占位。 */
function scheduleSummary(row: DebugTaskRow): string {
  if (row.once !== null && row.once !== '') return `once ${row.once}`
  if (row.cron !== null && row.cron !== '') return `cron ${row.cron}${row.timezone === null ? '' : ` (${row.timezone})`}`
  return '—'
}

const STATUS_OPTIONS = ['pending', 'dispatched', 'running', 'succeeded', 'failed', 'skipped', 'unknown'] as const

/**
 * 调度表整页（`main` 槽，双标签）：
 * - **任务配置**：内嵌任务表 JSON 输入框（暂存 + 保存）+ 已解析任务列表（id / 名称 / 周期 / 下次执行）；
 * - **执行记录**：全部执行记录，支持按状态 / 按任务过滤，点一行展开该次执行的事件时间线。
 *
 * 数据来自 settings 快照的 debugSnapshot 字段（host 周期写入），经 useSyncExternalStore
 * 订阅自动刷新，无需手动重开。整页由布局服务的 `main` 槽承载：选中侧栏条目即替换会话区。
 */
function TaskPage(props: {
  t: Translate
  scope: SettingsScope
  /** 返回会话：调布局服务 selectPanel(null) 切回会话区。 */
  onBack: () => void
  /** 页内只读会话视图工厂（决策 28：sessions.binding + uiConversation 组装，归档会话可读）。服务不可用时为 null。 */
  viewSession: ((id: string) => SessionViewTarget | null) | null
}) {
  const { t, scope, onBack, viewSession } = props
  // 面板自己订阅 scope：保存后即时反映生效值，也拿到 writable 状态。
  const subscribe = useCallback((onChange: () => void) => scope.subscribe(onChange), [scope])
  const getSnapshot = useCallback(() => scope.getSnapshot(), [scope])
  const snapshot = useSyncExternalStore(subscribe, getSnapshot)

  const [tab, setTab] = useState<'config' | 'records' | 'debug'>('config')
  const [draft, setDraft] = useState<string | undefined>(undefined)
  const [saving, setSaving] = useState(false)
  const [failed, setFailed] = useState(false)
  // 手动刷新：settings 快照本身经订阅 live 更新，此按钮兜底重渲染并记录刷新时刻，
  // 让「时间戳不动」可区分是数据没变还是页面没刷。
  const [manualAt, setManualAt] = useState<number | undefined>(undefined)
  const [statusFilter, setStatusFilter] = useState<string>('all')
  const [taskFilter, setTaskFilter] = useState<string>('all')
  const [expanded, setExpanded] = useState<string | null>(null)
  // 面板内只读会话弹窗（决策 28）：数据源在点链接时经 viewSession 组装好再进状态。
  const [viewing, setViewing] = useState<{ sessionId: string; heading: string; view: SessionViewTarget } | null>(null)
  // 调试页：state.db 三张表的原始行（GET /db，切到该页或手动刷新时取一次）。
  const [dbDump, setDbDump] = useState<{ at: string; tables: DbTableDump[] } | null>(null)
  const [dbState, setDbState] = useState<'idle' | 'loading' | 'ok' | 'fail'>('idle')

  useEffect(() => {
    if (tab !== 'debug') return
    let alive = true
    setDbState('loading')
    fetch(`${DISPATCH_API_PREFIX}/db`)
      .then(res => res.json() as Promise<{ ok?: boolean; at?: string; tables?: DbTableDump[] }>)
      .then(body => {
        if (!alive) return
        if (body.ok === true && Array.isArray(body.tables)) {
          setDbDump({ at: typeof body.at === 'string' ? body.at : '', tables: body.tables })
          setDbState('ok')
        } else setDbState('fail')
      })
      .catch(() => { if (alive) setDbState('fail') })
    return () => { alive = false }
  }, [tab, manualAt])

  const section = (snapshot.value ?? {}) as Record<string, unknown>
  // 快照由 host 周期写入 debugSnapshot 字段；页订阅同一 scope 自动刷新。
  const raw = typeof section.debugSnapshot === 'string' ? section.debugSnapshot : ''
  const data = parseDebugSnapshot(raw)
  const effectiveInline = typeof section.tasksInline === 'string' ? section.tasksInline : ''
  const current = draft ?? effectiveInline
  const invalid = draft !== undefined && !isValidTaskTable(draft)
  const dirty = draft !== undefined && draft !== effectiveInline
  const writable = snapshot.status === 'ready' && snapshot.writable && !saving

  const save = async (): Promise<void> => {
    if (draft === undefined || invalid || !writable) return
    setSaving(true)
    setFailed(false)
    try {
      // 空白串 = 清空 = 回到默认（host 侧 tasksInline 默认空串），走 unset 不留覆盖。
      if (draft.trim() === '') await scope.unset('tasksInline')
      else await scope.set('tasksInline', draft)
      setDraft(undefined)
    } catch {
      setFailed(true) // 草稿保留，用户可以改完再存一次
    } finally {
      setSaving(false)
    }
  }

  const taskRows = data?.tasks ?? []
  const titleOfTask = (id: string): string => {
    const row = taskRows.find(item => item.id === id)
    return row === undefined ? id : `${row.title}（${row.id}）`
  }
  /** 打开只读会话弹窗：组装失败（服务缺失 / 会话不可解析）时静默不动。 */
  const openView = (sessionId: string, heading: string): void => {
    if (viewSession === null) return
    const target = viewSession(sessionId)
    if (target === null) return
    setViewing({ sessionId, heading, view: target })
  }
  const instances = (data?.instances ?? [])
    .filter(row => statusFilter === 'all' || row.status === statusFilter)
    .filter(row => taskFilter === 'all' || row.task_id === taskFilter)
    .slice()
    .sort((a, b) => (a.scheduled_at < b.scheduled_at ? 1 : a.scheduled_at > b.scheduled_at ? -1 : 0))

  const hasRaw = raw.trim() !== ''

  /** 调试页：一张表的原始行渲染（列按建表顺序；长值截断显示，悬停 title 看全文）。 */
  const renderDbTable = (dump: DbTableDump) => h('div', { key: dump.name, style: { marginBottom: '20px' } },
    h('h4', { style: sectionTitleStyle },
      `${dump.name} · ${dump.count} 行${dump.truncated ? `（${t('debugDbTruncated')}）` : ''}`),
    dump.rows.length === 0
      ? h('p', { style: hintStyle }, t('debugDbEmpty'))
      : h('div', { style: { overflowX: 'auto' } },
          h('table', { style: tableStyle },
            h('thead', null, h('tr', null,
              dump.columns.map(col => h('th', { key: col, style: cellStyle }, col)))),
            h('tbody', null, dump.rows.map((row, index) => h('tr', { key: index },
              dump.columns.map(col => {
                const value = row[col]
                const text = value === null || value === undefined ? '—' : String(value)
                const clipped = text.length > 160 ? `${text.slice(0, 160)}…` : text
                return h('td', {
                  key: col,
                  style: col === 'detail' || col === 'value' ? detailCellStyle : cellStyle,
                  title: text,
                }, clipped)
              }),
            ))),
          ),
        ),
  )

  return h(Fragment, null,
    h('div', { style: pageStyle },
      // 抬头：左「← 返回会话」+ 标题；右「刷新 · 分组标签」
      h('div', { style: panelHeaderStyle },
        h('div', { style: { display: 'flex', alignItems: 'center', gap: '10px', minWidth: 0 } },
          h('button', {
            type: 'button',
            style: backButtonStyle,
            title: t('backToConversation'),
            onClick: onBack,
          }, `← ${t('backToConversation')}`),
          h('div', { style: { minWidth: 0 } },
            h('div', { style: panelTitleStyle }, t('panelTitle')),
            data !== undefined
              ? h('div', { style: { ...hintStyle, margin: '2px 0 0' } }, formatTime(data.at))
              : null,
          ),
        ),
        h('div', { style: headerRightStyle },
          h('button', {
            type: 'button',
            style: iconButtonStyle,
            title: t('debugRefresh'),
            'aria-label': t('debugRefresh'),
            onClick: () => { setManualAt(Date.now()) },
          }, h(RefreshIcon, {})),
          h('div', { style: segmentedStyle },
            h('button', {
              type: 'button', style: segmentStyle(tab === 'config'),
              onClick: () => { setTab('config') },
            }, t('tabConfig')),
            h('button', {
              type: 'button', style: segmentStyle(tab === 'records'),
              onClick: () => { setTab('records') },
            }, t('tabRecords')),
            h('button', {
              type: 'button', style: segmentStyle(tab === 'debug'),
              onClick: () => { setTab('debug') },
            }, t('tabDebug')),
          ),
        ),
      ),
      h('p', { style: hintStyle }, t('debugAutoHint')),

      data === undefined
        ? h('div', null,
            h('p', { style: hintStyle }, hasRaw ? t('debugRaw') : t('debugEmpty')),
            hasRaw ? h('pre', { style: preStyle }, raw) : null,
            // 临时诊断行：数据通道断在哪一段，一眼可见（通道稳定后移除）。
            h('pre', { style: { ...preStyle, color: C.textFaint } }, describeDiag()),
          )
        : tab === 'config'
          ? h('div', null,
              h('label', { htmlFor: 'dsh-tdt-modal-inline', style: { fontWeight: 600 } }, t('tasksInlineLabel')),
              h('p', { style: hintStyle }, t('tasksInlineHint')),
              h('textarea', {
                id: 'dsh-tdt-modal-inline',
                value: current,
                disabled: !writable,
                onChange: (event: { target: { value: string } }) => { setDraft(event.target.value) },
                spellCheck: false,
                style: textareaStyle,
              }),
              invalid ? h('p', { style: errorStyle }, t('invalidJson')) : null,
              h('div', { style: rowStyle },
                h('button', {
                  type: 'button',
                  onClick: () => { void save() },
                  disabled: !writable || invalid || !dirty,
                }, saving ? t('saving') : t('save')),
                h('button', {
                  type: 'button',
                  onClick: () => { setDraft(undefined); setFailed(false) },
                  disabled: saving || !dirty,
                }, t('discard')),
              ),
              failed ? h('p', { style: errorStyle }, t('saveFailed')) : null,

              h('h4', { style: sectionTitleStyle }, t('tasksParsedTitle')),
              taskRows.length === 0
                ? h('p', { style: hintStyle }, t('tasksParsedEmpty'))
                : h('table', { style: tableStyle },
                    h('thead', null, h('tr', null,
                      [t('colTask'), t('colTitle'), t('colSchedule'), t('colNext')]
                        .map(name => h('th', { key: name, style: cellStyle }, name)))),
                    h('tbody', null, taskRows.map(row => h('tr', { key: row.id },
                      h('td', { style: cellStyle }, row.id),
                      h('td', { style: cellStyle }, row.title),
                      h('td', { style: cellStyle }, scheduleSummary(row)),
                      h('td', { style: cellStyle }, row.next === null ? '—' : formatTime(row.next)),
                    ))),
                  ),

              h('h4', { style: sectionTitleStyle }, t('debugWarns')),
              data.warns.length === 0
                ? h('p', { style: hintStyle }, t('debugNoWarns'))
                : h('pre', { style: preStyle }, data.warns.join('\n')),

              // 只读运行参数（原来在设置卡片上，卡片精简后挪进来，信息不丢）
              h('details', { style: { marginTop: '16px' } },
                h('summary', null, t('paramsTitle')),
                h('dl', { style: dlStyle },
                  h('dt', null, t('paramStatePath')), h('dd', { style: { margin: 0 } }, displayParam(t, section.statePath)),
                  h('dt', null, t('paramTickMs')), h('dd', { style: { margin: 0 } }, displayParam(t, section.tickMs)),
                  h('dt', null, t('paramDispatchGraceMs')), h('dd', { style: { margin: 0 } }, displayParam(t, section.dispatchGraceMs)),
                  h('dt', null, t('paramLeaseMs')), h('dd', { style: { margin: 0 } }, displayParam(t, section.leaseMs)),
                  h('dt', null, t('paramUnknownGraceMs')), h('dd', { style: { margin: 0 } }, displayParam(t, section.unknownGraceMs)),
                  h('dt', null, t('paramTasksDir')), h('dd', { style: { margin: 0 } }, displayParam(t, section.tasksDir)),
                  h('dt', null, t('paramDefaultProvider')), h('dd', { style: { margin: 0 } }, displayParam(t, section.defaultProvider)),
                  h('dt', null, t('paramDefaultModel')), h('dd', { style: { margin: 0 } }, displayParam(t, section.defaultModel)),
                ),
              ),
            )
          : tab === 'debug'
            ? h('div', null,
                h('p', { style: hintStyle }, t('debugDbHint')),
                dbState === 'loading' ? h('p', { style: hintStyle }, t('debugDbLoading')) : null,
                dbState === 'fail' ? h('p', { style: errorStyle }, t('debugDbFail')) : null,
                dbState === 'ok' && dbDump !== null
                  ? h('div', null,
                      h('p', { style: hintStyle }, `${t('debugRefreshedAt')} ${formatTime(dbDump.at)}`),
                      dbDump.tables.map(dump => renderDbTable(dump)),
                    )
                  : null,
              )
          : h('div', null,
              h('p', { style: hintStyle }, t('recordsHint')),
              h('div', { style: rowStyle },
                h('label', { style: { fontSize: '12px' } },
                  `${t('filterStatus')} `,
                  h('select', {
                    value: statusFilter,
                    onChange: (event: { target: { value: string } }) => { setStatusFilter(event.target.value) },
                  },
                    h('option', { value: 'all' }, t('filterAll')),
                    STATUS_OPTIONS.map(status => h('option', { key: status, value: status }, status)),
                  ),
                ),
                h('label', { style: { fontSize: '12px' } },
                  `${t('filterTask')} `,
                  h('select', {
                    value: taskFilter,
                    onChange: (event: { target: { value: string } }) => { setTaskFilter(event.target.value) },
                  },
                    h('option', { value: 'all' }, t('filterAll')),
                    taskRows.map(row => h('option', { key: row.id, value: row.id }, `${row.title}（${row.id}）`)),
                  ),
                ),
              ),
              h('p', { style: hintStyle }, t('expandHint')),
              instances.length === 0
                ? h('p', { style: hintStyle }, t('debugInstancesEmpty'))
                : h('table', { style: tableStyle },
                    h('thead', null, h('tr', null,
                      [t('colTask'), t('colSlot'), t('colStatus'), t('colAttempt'), t('colSession'), t('colUpdated')]
                        .map(name => h('th', { key: name, style: cellStyle }, name)))),
                    h('tbody', null, instances.map(row => {
                      const open = expanded === row.id
                      const events = open
                        ? (data.events ?? [])
                            .filter(event => event.instance_id === row.id)
                            .sort((a, b) => a.seq - b.seq)
                        : []
                      return h(Fragment, { key: row.id },
                        h('tr', {
                          style: { cursor: 'pointer', background: open ? C.activeRow : undefined },
                          onClick: () => { setExpanded(open ? null : row.id) },
                        },
                          h('td', { style: cellStyle }, titleOfTask(row.task_id)),
                          h('td', { style: cellStyle }, formatTime(row.scheduled_at)),
                          h('td', { style: cellStyle }, row.status),
                          h('td', { style: cellStyle }, String(row.attempt)),
                          h('td', { style: cellStyle },
                            row.session_id === null ? '—'
                              : viewSession !== null
                                ? h('button', {
                                  type: 'button',
                                  style: linkStyle,
                                  title: row.session_id,
                                  onClick: (event: { stopPropagation(): void }) => {
                                    event.stopPropagation()
                                    openView(row.session_id as string, titleOfTask(row.task_id))
                                  },
                                }, row.session_id.slice(0, 8))
                                : row.session_id.slice(0, 8),
                          ),
                          h('td', { style: cellStyle }, formatTime(row.updated_at)),
                        ),
                        open
                          ? h('tr', null,
                              h('td', { colSpan: 6, style: cellStyle },
                                h('div', {
                                  style: {
                                    fontSize: '12px', marginBottom: '4px',
                                    display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '8px',
                                  },
                                },
                                  h('span', null, t('eventsOf')),
                                  (viewSession !== null && row.session_id !== null)
                                    ? h('button', {
                                      type: 'button',
                                      style: linkStyle,
                                      onClick: () => { openView(row.session_id as string, titleOfTask(row.task_id)) },
                                    }, `↗ ${t('viewSession')}`)
                                    : null,
                                ),
                                events.length === 0
                                  ? h('p', { style: hintStyle }, t('eventsEmpty'))
                                  : h('table', { style: tableStyle },
                                      h('thead', null, h('tr', null,
                                        [t('colSeq'), t('colTs'), t('colKind'), t('colDetail')]
                                          .map(name => h('th', { key: name, style: cellStyle }, name)))),
                                      h('tbody', null, events.map(event => h('tr', { key: event.seq },
                                        h('td', { style: cellStyle }, String(event.seq)),
                                        h('td', { style: cellStyle }, formatTime(event.ts)),
                                        h('td', { style: cellStyle }, event.kind),
                                        h('td', { style: detailCellStyle }, event.detail ?? ''),
                                      ))),
                                    ),
                              ),
                            )
                          : null,
                      )
                    })),
                  ),
            ),
    ),
    // 只读会话弹窗（决策 28）：叠在整页之上（z-index 1010）。挂在独立子树
    // （Fragment 兄弟节点），其遮罩点击不会冒泡出去、误关整页。
    viewing !== null
      ? h(SessionViewModal, {
        t,
        heading: viewing.heading,
        sessionId: viewing.sessionId,
        view: viewing.view,
        onClose: () => { setViewing(null) },
      })
      : null,
  )
}

/**
 * 设置页卡片：**只留一行「标题 + 描述 + 箭头」**，点一下切到整页（布局服务 selectPanel）。
 * 内嵌 JSON 输入框与只读运行参数都在整页里——设置页保持干净。
 * @param props - t 席位 + 打开整页的回调。
 */
function TasksConfigPage(props: { t: Translate; open: () => void }) {
  const { t, open } = props
  return h('div', {
    style: cardStyle,
    role: 'button',
    tabIndex: 0,
    onClick: open,
    onKeyDown: (event: { key?: string }) => {
      if (event.key === 'Enter' || event.key === ' ') { open() }
    },
  },
    h('div', null,
      h('div', { style: cardTitleStyle }, t('title')),
      h('div', { style: cardDescStyle }, t('description')),
    ),
    h('span', { style: chevronStyle }, '›'),
  )
}

/**
 * 侧栏顶部面板图标（slot = sidebar.panellist，list 槽）：组件**只画图标**——
 * 行按钮由侧栏渲染，点击由侧栏调 `ctx.layout.selectPanel(id)`，激活态由布局服务托管
 * （与「插件」行同一套样式，无需自绘）。图标颜色走 currentColor，自动跟随行的选中态。
 * @param props - size：宽栏 16 / 折叠栏 18（侧栏传入）。
 */
function TaskPanelIcon(props: { size?: number }) {
  return h(TaskIcon, { size: props.size ?? 18 })
}

// ── 作用域的可用性：配置表单是异步就位的，整页需订阅它以便从占位自动切到真页面 ──
/** 当前作用域（null = 尚未就位）。 */
let currentScope: SettingsScope | null = null
const scopeListeners = new Set<() => void>()
const getScopeValue = (): SettingsScope | null => currentScope
const subscribeScope = (listener: () => void): (() => void) => {
  scopeListeners.add(listener)
  return () => { scopeListeners.delete(listener) }
}
/** 采纳一个作用域（先到先用，不互相覆盖），并通知已挂载的整页重渲染。 */
const adoptScope = (next: SettingsScope): void => {
  if (currentScope === null) { currentScope = next; afterAdopt(); return }
  // 已绑定的若不可用（如 configForms 因无 volatile 字段而不在 view 里 → status=unavailable），
  // 让更优通道覆盖。注意：只认 'unavailable'，'loading' 不让位（这正是 2026-09-25 采纳竞态
  // 根因——configForms 初始 loading 会挡住 httpScope，故 httpScope 块改为无条件接管）。
  if (currentScope.getSnapshot().status === 'unavailable') { currentScope = next; afterAdopt(); return }
}
/** 通知已挂载的整页重渲染（作用域切换后）。 */
const afterAdopt = (): void => {
  for (const listener of [...scopeListeners]) listener()
}

/**
 * 数据通道诊断（临时，通道稳定后移除）：把「绑定到了哪个 entry id / 快照状态 /
 * 拿到的字段 / 快照长度」直接显示在「暂无快照」处，真机一眼看出断在哪一段。
 */
interface ChannelDiag {
  entry: string
  status: string
  keys: string
  snapshotLen: number
  note: string
}
let channelDiag: ChannelDiag = { entry: '(未绑定)', status: '(无)', keys: '(无)', snapshotLen: 0, note: '作用域尚未就位' }
/** @returns 诊断信息的可读文本。 */
function describeDiag(): string {
  return `[数据通道诊断] entry=${channelDiag.entry} status=${channelDiag.status} `
    + `snapshotLen=${channelDiag.snapshotLen} keys=${channelDiag.keys} note=${channelDiag.note}`
}

/**
 * rc.1 起设置表单按 **profile entry id** 寻址，而本插件在不同部署下的行 id 可能是聚合行 id
 * 或裸命名空间——照参考插件的做法，从已服务命名空间里挑第一个命中的候选。
 */
const ENTRY_ID_CANDIDATES: readonly string[] = [
  'dsh-task-dispatch-table',
  'ui-task-dispatch-table',
  'web-ui-task-dispatch-table',
]
/** @param forms - 共享配置表单服务。 @returns 本插件应绑定的 entry id。 */
function servedEntryId(forms: ConfigForms): string {
  let served: readonly string[] | undefined
  try {
    served = forms.describe().getSnapshot().view?.namespaces?.map(item => item.ns)
  } catch {
    served = undefined
  }
  if (served === undefined) return SETTINGS_NS
  return ENTRY_ID_CANDIDATES.find(id => served.includes(id)) ?? SETTINGS_NS
}

/**
 * 把 rc.1 的 ConfigForm 适配为本插件的 SettingsScope 形状。
 *
 * ⚠️ `getSnapshot` **必须返回稳定引用**：useSyncExternalStore 每次渲染都会拿快照比对，
 * 若每次都新建对象会被判定为「一直在变」⇒ 无限重渲染（React #185 Maximum update depth
 * exceeded，真机实测）。故按底层快照的引用缓存映射结果，只在底层真变了才产出新对象。
 */
function configFormScope(form: ConfigForm): SettingsScope {
  let lastRaw: ConfigFormSnapshot | undefined
  let lastMapped: ScopeSnapshot | undefined
  return {
    getSnapshot: () => {
      const raw = form.getSnapshot()
      if (raw === lastRaw && lastMapped !== undefined) return lastMapped
      lastRaw = raw
      lastMapped = {
        status: raw.status,
        value: raw.value,
        base: raw.base as Record<string, unknown> | undefined,
        user: raw.user as Record<string, unknown> | undefined,
        writable: raw.writable,
      }
      // 诊断：只在快照真的变了时更新（否则会随每次渲染刷屏）。
      const debugSnapshot = typeof raw.value?.debugSnapshot === 'string' ? raw.value.debugSnapshot : ''
      channelDiag = {
        entry: channelDiag.entry,
        status: raw.status,
        keys: raw.value === undefined ? '(value 未定义)' : Object.keys(raw.value).join(','),
        snapshotLen: debugSnapshot.length,
        note: `writable=${String(raw.writable)}`,
      }
      return lastMapped
    },
    subscribe: (listener) => form.subscribe(listener),
    set: async (field, value) => { await form.set(field, value) },
    unset: async (field) => { await form.unset(field) },
  }
}

/**
 * rc.1 运行时数据通道：宿主经 `webServer.register` 暴露 HTTP 路由（照抄参考插件
 * dsh-task-board 的已验证通道），客户端同源 fetch 轮询，适配成 SettingsScope。
 * 宿主插件配置字段不能标 volatile，故快照 / 任务表不走 configForms。
 * 2s 轮询（宿主每 tick 写），保存任务表后即时刷新；诊断行实时反映 HTTP 状态。
 */
const DISPATCH_API_PREFIX = 'api/task-dispatch-table'

function httpScope(): SettingsScope {
  let lastDebug = ''
  let lastInline = ''
  let lastMapped: ScopeSnapshot | undefined
  const listeners = new Set<() => void>()
  let busy = false
  const poll = async (): Promise<void> => {
    if (busy) return
    busy = true
    try {
      const res = await fetch(`${DISPATCH_API_PREFIX}/snapshot`, { cache: 'no-store' })
      if (!res.ok) {
        channelDiag = { ...channelDiag, entry: SETTINGS_NS, status: 'loading', note: `HTTP ${res.status}（轮询中）` }
        return
      }
      const data = await res.json() as { snapshot?: string; tasksInline?: string }
      const debug = data.snapshot ?? ''
      const inline = data.tasksInline ?? ''
      if (debug === lastDebug && inline === lastInline && lastMapped !== undefined) return
      lastDebug = debug
      lastInline = inline
      lastMapped = {
        status: 'ready',
        value: { debugSnapshot: debug, tasksInline: inline },
        base: undefined,
        user: undefined,
        writable: true,
      }
      channelDiag = {
        entry: SETTINGS_NS,
        status: 'ready',
        keys: 'debugSnapshot,tasksInline',
        snapshotLen: debug.length,
        note: `HTTP ${DISPATCH_API_PREFIX}/snapshot`,
      }
      for (const l of [...listeners]) l()
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      channelDiag = { ...channelDiag, entry: SETTINGS_NS, status: 'loading', note: `fetch 失败：${message}` }
    } finally {
      busy = false
    }
  }
  void poll()
  const timer = setInterval(() => { void poll() }, 2000)
  return {
    getSnapshot: () =>
      lastMapped ?? { status: 'loading', value: undefined, base: undefined, user: undefined, writable: false },
    subscribe: (listener) => {
      listeners.add(listener)
      return () => { listeners.delete(listener) }
    },
    set: async (field, value) => {
      if (field !== 'tasksInline') return
      await fetch(`${DISPATCH_API_PREFIX}/tasks`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ tasksInline: String(value) }),
      })
      void poll()
    },
    unset: async () => {},
  }
}

/**
 * 整页外壳（`main` 槽）：订阅作用域可用性——配置表单异步就位后自动从占位切到真页面。
 * @param props - t 席位、会话视图工厂、返回会话回调。
 */
function TaskPageHost(props: {
  t: Translate
  viewRef: () => ((id: string) => SessionViewTarget | null) | null
  onBack: () => void
}) {
  const { t, viewRef, onBack } = props
  const scope = useSyncExternalStore(subscribeScope, getScopeValue)
  if (scope === null) {
    return h('div', { style: pageStyle },
      h('div', { style: panelHeaderStyle },
        h('button', {
          type: 'button',
          style: backButtonStyle,
          title: t('backToConversation'),
          onClick: onBack,
        }, `← ${t('backToConversation')}`),
        h('div', { style: panelTitleStyle }, t('panelTitle')),
      ),
      h('p', { style: hintStyle }, t('unavailable')),
    )
  }
  return h(TaskPage, { t, scope, onBack, viewSession: viewRef() })
}

// ─────────────────────────── 插件主体 ───────────────────────────

/**
 * 浏览器插件入口：注册文案字典；三处注册各自挂进「服务就位才触发」的 slots 注入——
 * 设置页卡片（settings.plugin.item）、侧栏顶部条目（sidebar.panellist）与主区整页（main）。
 * 侧栏条目与整页只依赖 slots，不因 settings 服务缺席/改名而消失。
 * @param ctx - 浏览器插件上下文。
 */
export function apply(ctx: ClientContext): void {
  // 词典注册要等 locale 服务；绝不能写进模块级注入声明（组合缺服务会 pending 卡死）。
  ctx.inject(['locale'], (localeCtx) => {
    ctx.effect(() => localeCtx.locale.register(LOCALE_NS, { zh, en }))
    // 模块级 t 席位（panellist 的 label 在渲染期求值）；bind 失败不影响 locale 注册。
    try { runtimeT = localeCtx.locale.bind(LOCALE_NS) } catch { /* 保持 key 兜底 */ }
  })

  // host 半侧用同一命名空间注册 settings section；设置页「插件」标签页遍历
  // 已服务命名空间并自动配对渲染，这里只需按命名空间贡献卡片。
  // 只读会话视图（决策 28）：sessions.binding(id) 物化句柄 + uiConversation.binding()
  // 组装 chat target，在面板内自绘只读弹窗（归档会话可读）。红线：不用 sessions.open()——
  // 那是切宿主主视图，归档会话无处显示（决策 27 已证伪）。服务未就位时 viewSession 为
  // null，记录里的「查看会话」入口不渲染。inject 清单（package.json dsh.client.inject）
  // 声明了两个服务提供方：sessions ← dsh-api-session-controller、uiConversation ←
  // dsh-client-ui-conversation（官方机制：inject 边决定这些包的 client 模块先于本插件组装）。
  let viewSession: ((id: string) => SessionViewTarget | null) | null = null
  ctx.inject(['sessions', 'uiConversation'], (sub) => {
    const sessions = (sub as { sessions?: SessionsFace }).sessions
    const uiConversation = (sub as { uiConversation?: UiConversationFace }).uiConversation
    if (sessions !== undefined && uiConversation !== undefined) {
      viewSession = (id: string): SessionViewTarget | null => openSessionView(sessions, uiConversation, id)
    }
  })
  // 布局服务（ctx.layout）：主面板切换——选中整页 / 返回会话。
  let selectPanel: (id: string | null) => void = () => {}
  ctx.inject(['layout'], (sub) => {
    const layout = sub.layout
    if (layout !== undefined) selectPanel = (id) => { layout.selectPanel(id) }
  })

  // 设置页卡片：两套契约各尝试一次，谁先就位谁生效（registerCard 保证只注册一条）。
  let cardRegistered = false
  const registerCard = (sub: ClientContext): void => {
    if (cardRegistered) return
    cardRegistered = true
    sub.slots.inject('settings.plugin.item', () =>
      sub.slots.register(
        {
          name: 'settings.plugin.item',
          // keyed 槽位用 key 声明本条贡献给哪个命名空间。
          key: SETTINGS_NS,
          locale: LOCALE_NS,
          inject: () => ({ open: () => { selectPanel(PANEL_ID) } }),
        },
        TasksConfigPage,
      ),
    )
  }
  // rc.1：共享配置表单服务（按 profile entry id 寻址）。
  ctx.inject(['slots', 'configForms'], (sub) => {
    const forms = sub.configForms
    if (forms === undefined) return
    const entryId = servedEntryId(forms)
    channelDiag = { ...channelDiag, entry: entryId, note: '已绑定 configForms' }
    adoptScope(configFormScope(forms.get(entryId)))
    registerCard(sub)
  })
  // 旧契约兜底（0.1.6 时代的 settingsScope）。
  ctx.inject(['slots', 'settingsScope'], (sub) => {
    const bound = sub.settingsScope?.bind({ namespace: SETTINGS_NS })
    if (bound === undefined) return
    channelDiag = { ...channelDiag, entry: SETTINGS_NS, note: '已绑定 settingsScope（旧契约）' }
    adoptScope(bound)
    registerCard(sub)
  })
  // rc.1 运行时数据通道：宿主经 webServer.register 暴露 HTTP 路由，客户端同源 fetch 轮询
  // （照抄参考插件 dsh-task-board 的已验证通道——remote 代理不暴露宿主 ctx.set 的自定义服务，
  // configForms 又要求 volatile 字段而宿主 volatile 会让 entry 不激活，故 HTTP 是唯一稳通道）。
  // 只依赖 slots 自成一块，宿主路由就绪前 httpScope 轮询等待，就绪即出数据。
  // ⚠️ 必须无条件接管，不能走 adoptScope：configForms 若先到，ConfigForm（host 持久化）初始
  // status 是 'loading'，而 adoptScope 只在 current==='unavailable' 时让位 → loading 挡住让位，
  // httpScope 被永久拒绝，页面绑死空的 configForms（2026-09-25 真机根因：轮询 200/24kB 而页面
  // 永远「暂无快照」）。rc.1 上 HTTP 是唯一能出数据的通道（宿主无 volatile ⇒ configForms 必然
  // unavailable；settingsScope 仅 0.1.6 存在且宿主已不再写 settings 数据），接管无副作用。
  ctx.inject(['slots'], (sub) => {
    currentScope = httpScope()
    afterAdopt()
    registerCard(sub)
  })

  // 侧栏顶部条目 + 主区整页（dsh 0.1.7-rc.1 原生「主面板」机制）：
  //  · `sidebar.panellist`（list）：条目 `id` = 主面板 key，组件只画图标；行按钮、点击
  //    （侧栏调 `ctx.layout.selectPanel(id)`）与激活态全由侧栏 / 布局服务托管（同「插件」行）。
  //  · `main`（keyed）：`key` = 同一 id，选中即整页替换会话区；返回会话 = `selectPanel(null)`。
  // ⚠️ 必须只依赖 `slots`、自成一块：一旦嵌进 settings 注入块，settings 服务改名/缺席
  // 就会让入口无声消失且不报错（2026-09-24 真机教训）。
  ctx.inject(['slots'], (sub) => {
    sub.slots.inject('sidebar.panellist', () =>
      sub.slots.register(
        {
          name: 'sidebar.panellist',
          id: PANEL_ID,
          order: 30,
          label: () => runtimeT('panelTitle'),
          locale: LOCALE_NS,
        },
        TaskPanelIcon,
      ),
    )
    sub.slots.inject('main', () =>
      sub.slots.register(
        { name: 'main', key: PANEL_ID, locale: LOCALE_NS },
        (props: { t: Translate }) => h(TaskPageHost, {
          t: props.t,
          viewRef: () => viewSession,
          onBack: () => { selectPanel(null) },
        }),
      ),
    )
  })
}
