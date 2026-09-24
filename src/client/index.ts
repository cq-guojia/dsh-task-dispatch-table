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

import { createElement as h, Fragment, useCallback, useState, useSyncExternalStore } from 'react'
import { en, zh, type LocaleKey } from './locales'
import { openSessionView, SessionViewModal, type SessionViewTarget, type SessionsFace, type UiConversationFace } from './session-view'

/** 设置命名空间 = 宿主 apply() 里 ctx.settings.register 的注册名（src/index.ts:42）。 */
const SETTINGS_NS = 'dsh-task-dispatch-table'
/** 字典命名空间（locale 注册表独立于 settings 命名空间，取同名便于对应）。 */
const LOCALE_NS = SETTINGS_NS

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

/** 浏览器插件上下文：只声明本文件实际用到的服务面。 */
interface ClientContext {
  /** 延迟等待服务就位后执行回调（服务名 = cordis 声明名）。 */
  inject(deps: readonly string[], cb: (ctx: ClientContext) => void): void
  /** 组合内副作用：进入时 setup、离开时执行返回的清理函数。 */
  effect(setup: () => (() => void) | void): void
  locale: {
    register(ns: string, dictionaries: Record<string, Record<string, string>>): void
  }
  slots: {
    /** 延迟注册：slot 声明出现时才调用 factory，返回注销函数。 */
    inject(slot: string, factory: () => () => void): () => void
    /** 注册一个条目，返回注销函数。 */
    register(options: Record<string, unknown>, component: unknown): () => void
  }
  settingsScope: {
    bind(spec: { namespace: string }): SettingsScope
  }
}

/** 组件 props：渲染器合成的 t 席位 + 注册项 inject 工厂注入的 scope。 */
interface PageProps {
  t: Translate
  scope: SettingsScope
  /** 面板内只读会话视图工厂（决策 28，见 apply 内 sessions/uiConversation 注入）；服务不可用时为 null。 */
  viewSession: ((id: string) => SessionViewTarget | null) | null
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

// ── 面板（弹窗）样式 ──
const panelStyle: Record<string, string | number> = {
  background: C.layer1, color: C.text, borderRadius: '14px', width: '100%', maxWidth: '1100px',
  maxHeight: '86vh', overflow: 'auto', padding: '16px 18px', boxSizing: 'border-box',
  border: `1px solid ${C.border}`, boxShadow: C.shadow,
}
const overlayStyle: Record<string, string | number> = {
  position: 'fixed', inset: 0, zIndex: 1000, background: C.mask,
  display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '24px',
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
/** 侧栏底部动作按钮（sidebar.footer.action 入口）：整行、图标居中、悬停高亮，
 * 与 dsh-context 的 Overview 按钮同列堆叠。 */
const trayButtonStyle: Record<string, string | number> = {
  display: 'flex', alignItems: 'center', justifyContent: 'center',
  width: '100%', boxSizing: 'border-box', minHeight: '34px', padding: '7px 10px',
  margin: 0, border: 'none', borderRadius: '8px', color: C.textDim,
  cursor: 'pointer', transition,
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

/** 关闭图标（内联 SVG）。 */
function CloseIcon() {
  return h('svg', {
    width: 15, height: 15, viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor',
    strokeWidth: 2, strokeLinecap: 'round',
  },
    h('path', { d: 'M6 6l12 12M18 6L6 18' }),
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



/** 周期摘要：once 优先，其次 cron（带时区），都没有显示占位。 */
function scheduleSummary(row: DebugTaskRow): string {
  if (row.once !== null && row.once !== '') return `once ${row.once}`
  if (row.cron !== null && row.cron !== '') return `cron ${row.cron}${row.timezone === null ? '' : ` (${row.timezone})`}`
  return '—'
}

const STATUS_OPTIONS = ['pending', 'dispatched', 'running', 'succeeded', 'failed', 'skipped', 'unknown'] as const

/**
 * 调度表面板（双标签弹窗）：
 * - **任务配置**：内嵌任务表 JSON 输入框（暂存 + 保存）+ 已解析任务列表（id / 名称 / 周期 / 下次执行）；
 * - **执行记录**：全部执行记录，支持按状态 / 按任务过滤，点一行展开该次执行的事件时间线。
 *
 * 数据来自 settings 快照的 debugSnapshot 字段（host 周期写入），经 useSyncExternalStore
 * 订阅自动刷新，无需手动重开。
 */
function DispatcherModal(props: {
  t: Translate
  scope: SettingsScope
  data: DebugSnapshotData | undefined
  raw: string
  onClose: () => void
  /** 面板内只读会话视图工厂（决策 28：sessions.binding + uiConversation 组装，归档会话可读）。服务不可用时为 null。 */
  viewSession: ((id: string) => SessionViewTarget | null) | null
}) {
  const { t, scope, data, raw, onClose, viewSession } = props
  // 面板自己订阅 scope：保存后即时反映生效值，也拿到 writable 状态。
  const subscribe = useCallback((onChange: () => void) => scope.subscribe(onChange), [scope])
  const getSnapshot = useCallback(() => scope.getSnapshot(), [scope])
  const snapshot = useSyncExternalStore(subscribe, getSnapshot)

  const [tab, setTab] = useState<'config' | 'records'>('config')
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

  const section = (snapshot.value ?? {}) as Record<string, unknown>
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

  return h(Fragment, null,
    h('div', { style: overlayStyle, onClick: onClose },
    h('div', { style: panelStyle, onClick: (event: { stopPropagation(): void }) => { event.stopPropagation() } },
      // 抬头：标题在左；右上角从右往左依次是「关闭 · 分组标签 · 刷新」（与宿主其它面板同序）
      h('div', { style: panelHeaderStyle },
        h('div', null,
          h('div', { style: panelTitleStyle }, t('panelTitle')),
          data !== undefined
            ? h('div', { style: { ...hintStyle, margin: '2px 0 0' } }, formatTime(data.at))
            : null,
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
          ),
          h('button', {
            type: 'button',
            style: iconButtonStyle,
            title: t('debugClose'),
            'aria-label': t('debugClose'),
            onClick: onClose,
          }, h(CloseIcon, {})),
        ),
      ),
      h('p', { style: hintStyle }, t('debugAutoHint')),

      data === undefined
        ? h('div', null,
            h('p', { style: hintStyle }, hasRaw ? t('debugRaw') : t('debugEmpty')),
            hasRaw ? h('pre', { style: preStyle }, raw) : null,
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
  ),
    // 只读会话弹窗（决策 28）：叠在主面板遮罩之上（z-index 1010 > 1000）。挂在独立子树
    // （Fragment 兄弟节点），会话弹窗的遮罩点击不会冒泡进主面板遮罩、误关整个面板。
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
 * 面板开关 + 快照切片的共享钩子：设置卡片与侧栏底部入口共用，
 * 点开同一个 DispatcherModal。快照由 host 周期写入 debugSnapshot 字段，自动刷新。
 * @param scope - 本命名空间的设置作用域。
 */
function useTaskPanel(scope: SettingsScope) {
  const subscribe = useCallback((onChange: () => void) => scope.subscribe(onChange), [scope])
  // getSnapshot 必须返回稳定引用：作用域的实现在值不变时保证同一引用。
  const getSnapshot = useCallback(() => scope.getSnapshot(), [scope])
  const snapshot = useSyncExternalStore(subscribe, getSnapshot)
  const [panelOpen, setPanelOpen] = useState(false)
  const section = (snapshot.value ?? {}) as Record<string, unknown>
  const raw = typeof section.debugSnapshot === 'string' ? section.debugSnapshot : ''
  const data = parseDebugSnapshot(raw)
  return { ready: snapshot.status === 'ready', raw, data, scope, panelOpen, open: () => setPanelOpen(true), close: () => setPanelOpen(false) }
}

/**
 * 设置页卡片（决策 26 修订）：**只留一行「标题 + 描述 + 箭头」**，点一下打开调度面板。
 * 原来的内嵌 JSON 输入框与只读运行参数都挪进了面板的「任务配置」页——设置页保持干净。
 * @param props - t 席位与绑定的设置作用域。
 */
function TasksConfigPage(props: PageProps) {
  const { t, scope, viewSession } = props
  const subscribe = useCallback((onChange: () => void) => scope.subscribe(onChange), [scope])
  // getSnapshot 必须返回稳定引用：作用域的实现在值不变时保证同一引用。
  const getSnapshot = useCallback(() => scope.getSnapshot(), [scope])
  const snapshot = useSyncExternalStore(subscribe, getSnapshot)
  const [panelOpen, setPanelOpen] = useState(false)

  const section = (snapshot.value ?? {}) as Record<string, unknown>
  // 快照由 host 周期写入 debugSnapshot 字段，面板经订阅自动刷新。
  const debugRaw = typeof section.debugSnapshot === 'string' ? section.debugSnapshot : ''
  const debugData = parseDebugSnapshot(debugRaw)

  if (snapshot.status !== 'ready') return h('p', null, t('unavailable'))

  return h('div', null,
    h('div', {
      style: cardStyle,
      role: 'button',
      tabIndex: 0,
      onClick: () => { setPanelOpen(true) },
      onKeyDown: (event: { key?: string }) => {
        if (event.key === 'Enter' || event.key === ' ') { setPanelOpen(true) }
      },
    },
      h('div', null,
        h('div', { style: cardTitleStyle }, t('title')),
        h('div', { style: cardDescStyle }, t('description')),
      ),
      h('span', { style: chevronStyle }, '›'),
    ),
    panelOpen
      ? h(DispatcherModal, { t, scope, data: debugData, raw: debugRaw, viewSession, onClose: () => { setPanelOpen(false) } })
      : null,
  )
}

/**
 * 侧栏底部入口（slot = sidebar.footer.action，list 槽，任何屏常驻；
 * dsh-context 在同处放 Overview 按钮）：一个图标按钮，点开同一个调度面板。
 * @param props - t 席位、绑定的设置作用域、面板内只读会话视图工厂。
 */
function TaskTrayButton(props: { t: Translate; scope: SettingsScope; viewSession: ((id: string) => SessionViewTarget | null) | null; wide?: boolean }) {
  const { t, scope, viewSession, wide } = props
  const panel = useTaskPanel(scope)
  const [hover, setHover] = useState(false)
  if (!panel.ready) return null
  // 悬停高亮走内联态（无 CSS 文件）：背景取主题变量，缺省兜底透明。
  const btnStyle: Record<string, string | number> = { ...trayButtonStyle, background: hover ? C.hover : 'transparent' }
  return h(Fragment, null,
    h('button', {
      type: 'button',
      style: btnStyle,
      title: t('panelTitle'),
      'aria-label': t('panelTitle'),
      onClick: panel.open,
      onMouseEnter: () => { setHover(true) },
      onMouseLeave: () => { setHover(false) },
    },
      h(TaskIcon, { size: wide ? 16 : 18 }),
      wide ? h('span', { style: { marginLeft: '8px', fontSize: '13px', color: C.text } }, t('trayLabel')) : null,
    ),
    panel.panelOpen
      ? h(DispatcherModal, { t, scope, data: panel.data, raw: panel.raw, viewSession, onClose: panel.close })
      : null,
  )
}

// ─────────────────────────── 插件主体 ───────────────────────────

/**
 * 浏览器插件入口：注册文案字典；在 slots + settingsScope 就位后把配置页注册进
 * settings.plugin.item（keyed 槽位，key = 设置命名空间）。
 * @param ctx - 浏览器插件上下文。
 */
export function apply(ctx: ClientContext): void {
  // 词典注册要等 locale 服务；绝不能写进模块级注入声明（组合缺服务会 pending 卡死）。
  ctx.inject(['locale'], (localeCtx) => {
    ctx.effect(() => localeCtx.locale.register(LOCALE_NS, { zh, en }))
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
  ctx.inject(['slots', 'settingsScope'], (sub) => {
    const scope = sub.settingsScope.bind({ namespace: SETTINGS_NS })
    sub.slots.inject('settings.plugin.item', () =>
      sub.slots.register(
        {
          name: 'settings.plugin.item',
          // keyed 槽位用 key 声明本条贡献给哪个命名空间。
          key: SETTINGS_NS,
          locale: LOCALE_NS,
          inject: () => ({ scope, viewSession }),
        },
        TasksConfigPage,
      ),
    )
    // 侧栏底部常驻入口（list 槽 sidebar.footer.action，任何屏可见；dsh-context 的
    // Overview 按钮同处）。点开同一个调度面板，仅图标、tooltip 作无障碍标签。
    sub.slots.inject('sidebar.footer.action', () =>
      sub.slots.register(
        {
          name: 'sidebar.footer.action',
          id: SETTINGS_NS,
          order: 20,
          locale: LOCALE_NS,
          inject: () => ({ scope, viewSession }),
        },
        TaskTrayButton,
      ),
    )
  })
}
