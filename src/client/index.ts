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

import { createElement as h, Fragment, useCallback, useEffect, useRef, useState, useSyncExternalStore } from 'react'
import { en, zh, type LocaleKey } from './locales'
import { openSessionView, SessionViewModal, type SessionViewTarget, type SessionsFace, type UiConversationFace } from './session-view'
import { FileBrowser } from './file-browser'
import { type WorkspaceFilesFace } from './file-preview'
import {
  definitionToDraft, draftToDefinitionJson, emptyTaskDraft, TaskEditorDrawer,
  type EditorHistory, type EditorOption, type EditorTaskOption, type HistorySnapshot, type HistoryVersion,
  type TaskEditorDraft,
} from './task-editor'
import { ensureToastStyle, FloatingToast } from './toast-css'
import { humanizeTaskError } from './task-editor'

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
/** 「＋ 新建任务」按钮：整页右上角，拉起右侧任务编辑弹窗（P0 只做界面）。 */
const addButtonStyle: Record<string, string | number> = {
  display: 'inline-flex', alignItems: 'center', gap: '4px', flex: 'none',
  padding: '5px 10px', borderRadius: '8px', border: `1px solid ${C.borderStrong}`,
  background: C.layer1, color: C.text, cursor: 'pointer',
  fontFamily: 'inherit', fontSize: '12px', lineHeight: '18px', fontWeight: 600, transition,
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

/** 任务明细行：决策 25/30 后 id 由系统生成（机器身份），title 名称、code 编号（可选，仅记录）。 */
interface DebugTaskRow {
  id: string
  title: string
  code: string | null
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
    return { id: item, title: item, code: null, enabled: true, cron: null, once: null, timezone: null, window: '', workspace: '', next: null }
  }
  const row = (item ?? {}) as Partial<DebugTaskRow>
  return {
    id: String(row.id ?? ''),
    title: String(row.title ?? row.id ?? ''),
    code: row.code === null || row.code === undefined ? null : String(row.code),
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

/** 表单下拉的取值状态：P1 起由 `GET /options` 真取（工作区 / 模型都是宿主的真目录）。 */
interface EditorOptions {
  workspaces: EditorOption[]
  models: EditorOption[]
  /** 工作区 title → 浏览锚点会话 id（该工作区最近一个会话；没有会话的工作区无键）。 */
  workspaceAnchors: Record<string, string>
}

const EMPTY_EDITOR_OPTIONS: EditorOptions = { workspaces: [], models: [], workspaceAnchors: {} }

/** 模型 option 的 value 形如 `provider/id`（写回时拆成成对的 provider + model，决策 22）。 */
const encodeModelValue = (provider: string, id: string): string => `${provider}/${id}`

// ── U11 页面级预览 dock（弹窗与整页共用同一个预览面） ──

/** 预览宽度持久化键（宽度是纯本地偏好，落 localStorage；读写都容错，隐私模式也不崩）。 */
const PREVIEW_WIDTH_KEY = 'dsh-tdt-preview-width'
/** 宽度区间：下限保住可读性，上限给内容留地方（不超过视口 70%）。 */
const PREVIEW_MIN = 320
const PREVIEW_MAX_RATIO = 0.7
const PREVIEW_DEFAULT = 460

/** 读上次宽度（无效 / 越界一律回默认）。 */
function readPreviewWidth(): number {
  try {
    const raw = window.localStorage.getItem(PREVIEW_WIDTH_KEY)
    const value = raw === null ? Number.NaN : Number(raw)
    if (!Number.isFinite(value)) return PREVIEW_DEFAULT
    return clampPreviewWidth(value)
  } catch {
    return PREVIEW_DEFAULT
  }
}

/** 夹到允许区间（上限按当前视口算，故运行时求值）。 */
function clampPreviewWidth(value: number): number {
  const max = Math.max(PREVIEW_MIN, Math.floor(window.innerWidth * PREVIEW_MAX_RATIO))
  return Math.min(Math.max(Math.round(value), PREVIEW_MIN), max)
}

/** 实例行的产出物（决策 32③写回的 outputs 列：JSON 数组，兼容逗号串）。 */
function parseOutputs(raw: unknown): string[] {
  if (typeof raw === 'string' && raw.trim() !== '') {
    try {
      const parsed: unknown = JSON.parse(raw)
      if (Array.isArray(parsed)) return parsed.filter((item): item is string => typeof item === 'string' && item.trim() !== '')
    } catch { /* 非 JSON ⇒ 按逗号串兜底 */ }
    return raw.split(',').map(part => part.trim()).filter(part => part !== '')
  }
  if (Array.isArray(raw)) return raw.filter((item): item is string => typeof item === 'string' && item.trim() !== '')
  return []
}

/** 路径末段（表格里只显示文件名，完整路径进 title）。 */
function basenameOf(path: string): string {
  const cut = Math.max(path.lastIndexOf('/'), path.lastIndexOf('\\'))
  return cut < 0 ? path : path.slice(cut + 1)
}

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
  /** U10：fork 源会话（官方 ISessions.fork；未就位为 null ⇒ 弹窗不渲染「继续对话」）。 */
  forkSession: ((id: string, atSeq?: number) => Promise<string>) | null
  /** U10：官方导航跳转（uiWorkspace.openSession；未就位为 null）。 */
  openHostSession: ((id: string) => void) | null
  /** U11 产出物预览：remote.workspaceFiles 服务（未就位为 null ⇒ 不渲染预览面、链接降级纯文本）。 */
  workspaceFiles: WorkspaceFilesFace | null
}) {
  const { t, scope, onBack, viewSession, forkSession, openHostSession, workspaceFiles } = props
  // 面板自己订阅 scope：保存后即时反映生效值，也拿到 writable 状态。
  const subscribe = useCallback((onChange: () => void) => scope.subscribe(onChange), [scope])
  const getSnapshot = useCallback(() => scope.getSnapshot(), [scope])
  const snapshot = useSyncExternalStore(subscribe, getSnapshot)

  const [tab, setTab] = useState<'config' | 'records' | 'debug'>('config')
  const [draft, setDraft] = useState<string | undefined>(undefined)
  const [saving, setSaving] = useState(false)
  const [failed, setFailed] = useState<string | null>(null)
  // 每次保存失败自增，用作 Toast 的 React key ⇒ 同一条错误连点也能重播淡入淡出动画。
  const [failedKey, setFailedKey] = useState(0)
  // JSON 不合法：持续态校验，浮层常驻 Toast（不自动消失）浮在保存行上方，不占版面、不挤压下方。
  const [invalidToast, setInvalidToast] = useState<{ on: boolean; key: number }>({ on: false, key: 0 })
  const invalidSeq = useRef(0)
  // 手动刷新：settings 快照本身经订阅 live 更新，此按钮兜底重渲染并记录刷新时刻，
  // 让「时间戳不动」可区分是数据没变还是页面没刷。
  const [manualAt, setManualAt] = useState<number | undefined>(undefined)
  const [statusFilter, setStatusFilter] = useState<string>('all')
  const [taskFilter, setTaskFilter] = useState<string>('all')
  const [expanded, setExpanded] = useState<string | null>(null)
  // U11 页面级预览 dock（用户 2026-09-28 拍板）：**唯一一份**预览面，固定在屏幕最右侧并
  // 把整页（含会话弹窗）往左推；弹窗与整页共用它，关弹窗不影响它，它自己可完整收回。
  const [preview, setPreview] = useState<{ sessionId: string; path: string } | null>(null)
  const [previewWidth, setPreviewWidth] = useState<number>(() => readPreviewWidth())
  // 选择器工作区上下文：remote.workspaceFiles 是会话作用域的，需最近浏览过的会话 id 反查工作区（详见 task-editor）。
  const lastWorkspaceSessionId = useRef<string | null>(null)
  // U11 单一入口：整页（记录行产出物）与弹窗（文件链接 / 交付卡）全走它 ⇒ 预览面只有一份。
  const canPreview = workspaceFiles !== null
  const openFile = useCallback((sessionId: string, path: string): void => {
    if (!canPreview) return
    lastWorkspaceSessionId.current = sessionId
    setPreview({ sessionId, path })
  }, [canPreview])
  const closePreview = useCallback((): void => { setPreview(null) }, [])
  /** 拖拽调宽：指针移动期间只在 dock 上改 CSS 变量值，松手才落 state（避免每帧重渲染整页）。 */
  const startResize = useCallback((start: { clientX: number }): void => {
    const startX = start.clientX
    const startWidth = previewWidth
    const onMove = (event: PointerEvent): void => {
      const next = clampPreviewWidth(startWidth - (event.clientX - startX))
      const root = document.getElementById('dsh-tdt-root')
      if (root !== null) root.style.setProperty('--dsh-tdt-preview-w', `${next}px`)
    }
    const onUp = (event: PointerEvent): void => {
      window.removeEventListener('pointermove', onMove)
      window.removeEventListener('pointerup', onUp)
      const next = clampPreviewWidth(startWidth - (event.clientX - startX))
      setPreviewWidth(next)
      try { window.localStorage.setItem(PREVIEW_WIDTH_KEY, String(next)) } catch { /* 隐私模式忽略 */ }
    }
    window.addEventListener('pointermove', onMove)
    window.addEventListener('pointerup', onUp)
  }, [previewWidth])
  // 新建 / 编辑任务弹窗：保存 / 删除 / 历史版本全部接线（2026-09-30）。
  // `id` = 编辑态的任务 UUID（新建为空串）；`history` = 服务端真历史（不在 draft 里，免得脏判定误判）。
  const [editor, setEditor] = useState<{
    mode: 'create' | 'edit'
    id: string
    draft: TaskEditorDraft
    history: EditorHistory | null
  } | null>(null)
  const [editorSaving, setEditorSaving] = useState(false)
  const [editorError, setEditorError] = useState<string | null>(null)

  /** 拉取某任务的历史（版本 + 快照）。拉不到就保持空 ⇒ 面板显示「暂无版本」。 */
  const loadHistory = async (id: string): Promise<void> => {
    try {
      const res = await fetch(`${DISPATCH_API_PREFIX}/tasks/history?id=${encodeURIComponent(id)}`, { cache: 'no-store' })
      const body = await res.json() as { ok?: boolean; versions?: unknown; snapshots?: unknown }
      if (body.ok !== true) return
      const history: EditorHistory = {
        versions: Array.isArray(body.versions) ? body.versions as HistoryVersion[] : [],
        snapshots: Array.isArray(body.snapshots) ? body.snapshots as HistorySnapshot[] : [],
      }
      setEditor(cur => (cur === null || cur.id !== id ? cur : { ...cur, history }))
    } catch { /* 忽略：版本面板自有空态 */ }
  }

  /** 打开「编辑任务」：从 tasksInline 取**完整定义**反解成草稿（不是摘要行）。 */
  const openEditor = (id: string): void => {
    let found: Record<string, unknown> | null = null
    try {
      const arr = JSON.parse(effectiveInline.trim() === '' ? '[]' : effectiveInline) as unknown
      if (Array.isArray(arr)) {
        found = arr.find((item): item is Record<string, unknown> => (
          item !== null && typeof item === 'object' && (item as { id?: unknown }).id === id
        )) ?? null
      }
    } catch { found = null }
    if (found === null) {
      setViewErr('找不到该任务的定义，无法编辑（任务表可能刚被改动，请刷新后重试）')
      return
    }
    setEditorError(null)
    setEditor({ mode: 'edit', id, draft: definitionToDraft(found), history: null })
    void loadHistory(id)
  }

  /**
   * 启用开关实时写回（编辑态专用，用户 2026-09-30）：POST /tasks/enabled { id, enabled }。
   * 返回 null = 成功；否则返回人话错误文案。快照由 2s 轮询自动同步，无需手动刷。
   */
  const toggleTaskEnabled = async (id: string, enabled: boolean): Promise<string | null> => {
    try {
      const res = await fetch(`${DISPATCH_API_PREFIX}/tasks/enabled`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ id, enabled }),
      })
      const body = await res.json() as { ok?: boolean; error?: unknown }
      if (body.ok !== true) {
        return humanizeTaskError(typeof body.error === 'string' && body.error !== '' ? body.error : `HTTP ${res.status}`)
      }
      return null
    } catch (error) {
      return error instanceof Error ? error.message : String(error)
    }
  }

  /** 保存（新增 / 修改同一条链路）：POST /tasks { task }。 */
  const saveEditor = async (draft: TaskEditorDraft): Promise<void> => {
    if (editor === null) return
    setEditorSaving(true)
    setEditorError(null)
    try {
      const definition = JSON.parse(draftToDefinitionJson(draft)) as Record<string, unknown>
      if (editor.mode === 'edit') definition.id = editor.id
      const res = await fetch(`${DISPATCH_API_PREFIX}/tasks`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ task: definition }),
      })
      const body = await res.json() as {
        ok?: boolean; error?: unknown; id?: unknown; missingAttachments?: unknown
      }
      if (body.ok !== true) {
        // 服务端机器码错误（如必填项）翻人话，再由编辑器浮层 Toast 呈现（用户 2026-09-30）。
        setEditorError(humanizeTaskError(typeof body.error === 'string' && body.error !== '' ? body.error : `HTTP ${res.status}`))
        return
      }
      const missing = Array.isArray(body.missingAttachments)
        ? body.missingAttachments.filter((item): item is string => typeof item === 'string')
        : []
      setEditor(null)
      // 附件失效要说出来（文件被清道夫清掉 / 手删了），否则用户不知道自己存的是个空引用。
      if (missing.length > 0) setViewErr(`已保存，但以下附加文件已不在盘上，请重新上传：${missing.join('、')}`)
    } catch (error) {
      setEditorError(error instanceof Error ? error.message : String(error))
    } finally {
      setEditorSaving(false)
    }
  }

  /** 删除任务（定义摘掉 + 任务目录整删；执行记录保留）。 */
  const deleteEditorTask = async (): Promise<void> => {
    if (editor === null || editor.mode !== 'edit') return
    try {
      const res = await fetch(`${DISPATCH_API_PREFIX}/tasks`, {
        method: 'DELETE',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ id: editor.id }),
      })
      const body = await res.json() as { ok?: boolean; error?: unknown }
      if (body.ok !== true) {
        setEditorError(humanizeTaskError(typeof body.error === 'string' && body.error !== '' ? body.error : `HTTP ${res.status}`))
        return
      }
      setEditor(null)
    } catch (error) {
      setEditorError(humanizeTaskError(error instanceof Error ? error.message : String(error)))
    }
  }

  /** 只找回提示词：取该版本内容 → 填进编辑器（其余设置不动）。 */
  const restoreVersion = async (file: string): Promise<void> => {
    if (editor === null) return
    try {
      const res = await fetch(
        `${DISPATCH_API_PREFIX}/tasks/history/item?id=${encodeURIComponent(editor.id)}&kind=prompt&file=${encodeURIComponent(file)}`,
        { cache: 'no-store' },
      )
      const body = await res.json() as { ok?: boolean; content?: unknown }
      if (body.ok !== true || typeof body.content !== 'string') {
        setEditorError('该版本内容读不出来，可能已被删除')
        return
      }
      setEditor(cur => (cur === null ? cur : { ...cur, draft: { ...cur.draft, prompt: body.content as string } }))
    } catch (error) {
      setEditorError(error instanceof Error ? error.message : String(error))
    }
  }

  /** 删除某个历史版本（用户自己删；系统从不自动删）。 */
  const deleteVersion = async (file: string): Promise<void> => {
    if (editor === null) return
    try {
      await fetch(
        `${DISPATCH_API_PREFIX}/tasks/history/item?id=${encodeURIComponent(editor.id)}&kind=prompt&file=${encodeURIComponent(file)}`,
        { method: 'DELETE' },
      )
      await loadHistory(editor.id)
    } catch { /* 删不掉就保持原样，不打断编辑 */ }
  }
  // 表单下拉数据面（P1）：宿主真实工作区 + 真实模型目录，进面板取一次（不轮询，目录稳定）。
  const [editorOptions, setEditorOptions] = useState<EditorOptions>(EMPTY_EDITOR_OPTIONS)
  useEffect(() => {
    let alive = true
    fetch(`${DISPATCH_API_PREFIX}/options`, { cache: 'no-store' })
      .then(res => res.json() as Promise<{
        ok?: boolean
        workspaces?: { title?: string; anchorSessionId?: string }[]
        models?: { provider?: string; id?: string; name?: string }[]
      }>)
      .then(body => {
        if (!alive || body.ok !== true) return
        const workspaceAnchors: Record<string, string> = {}
        const workspaces: EditorOption[] = (body.workspaces ?? [])
          // value 用 title：宿主侧 `resolveWorkspace` 就是按 title 精确匹配（src/dispatch.ts:33-35）。
          .filter(item => typeof item.title === 'string' && item.title !== '')
          .map(item => {
            if (typeof item.anchorSessionId === 'string' && item.anchorSessionId !== '') {
              workspaceAnchors[item.title as string] = item.anchorSessionId
            }
            return { value: item.title as string, label: item.title as string }
          })
        const models: EditorOption[] = [{ value: '', label: t('editorFollowHost') }]
        for (const model of body.models ?? []) {
          if (typeof model.provider !== 'string' || typeof model.id !== 'string') continue
          const name = typeof model.name === 'string' && model.name !== '' ? model.name : model.id
          models.push({ value: encodeModelValue(model.provider, model.id), label: `${name}（${model.provider}）` })
        }
        setEditorOptions({ workspaces, models, workspaceAnchors })
      })
      .catch(() => { /* 取不到就保持空态：下拉显示「暂无可选」，不编造 */ })
    return () => { alive = false }
  }, [t])
  // 面板内只读会话弹窗（决策 28）：数据源在点链接时经 viewSession 组装好再进状态。
  const [viewing, setViewing] = useState<{ sessionId: string; heading: string; view: SessionViewTarget; didUnarchive?: boolean; outputs?: string[] } | null>(null)
  // 查看会话失败提示（决策 28 数据链静默失效时，给用户可见反馈，不再「点了没反应」）。
  const [viewErr, setViewErr] = useState<string | null>(null)
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
  // JSON 不合法 → 常驻 Toast 浮在保存行上方（invalid 变 true 时自增 key 重播出现；变 false 时撤掉）。
  useEffect(() => {
    if (!invalid) { setInvalidToast(v => (v.on ? { on: false, key: v.key } : v)); return }
    invalidSeq.current += 1
    setInvalidToast({ on: true, key: invalidSeq.current })
  }, [invalid])
  const writable = snapshot.status === 'ready' && snapshot.writable && !saving

  const save = async (): Promise<void> => {
    if (draft === undefined || invalid || !writable) return
    setSaving(true)
    setFailed(null)
    try {
      // 空白串 = 清空 = 回到默认（host 侧 tasksInline 默认空串），走 unset 不留覆盖。
      if (draft.trim() === '') await scope.unset('tasksInline')
      else await scope.set('tasksInline', draft)
      setDraft(undefined)
    } catch (error) {
      // 保存失败（含保存闸门 422 的 id 校验文案）：机器码翻人话后浮层 Toast 自退，草稿保留可改完再存。
      const msg = error instanceof Error ? error.message : String(error)
      setFailed(humanizeTaskError(msg))
      setFailedKey(prev => prev + 1)
    } finally {
      setSaving(false)
    }
  }

  const taskRows = data?.tasks ?? []
  /** 可选的前置任务 = 现有任务表（真数据，带所属工作区 ⇒ 表单里先选工作区再选任务）。 */
  const editorTasks: EditorTaskOption[] = taskRows.map(row => {
    const name = row.title === '' ? row.id : row.title
    // 前置选项文案（决策：用户用编号管理 ⇒ 有编号时 `[编号] 名称`，无编号只显示名称，
    // 绝不把机器 id 当尾缀拖出来）。
    const label = row.code ? `[${row.code}] ${name}` : name
    return {
      id: row.id,
      label,
      workspace: row.workspace,
      enabled: row.enabled !== false,
    }
  })
  const titleOfTask = (id: string): string => {
    const row = taskRows.find(item => item.id === id)
    return row === undefined ? id : `${row.title}（${row.id}）`
  }
  /**
   * 归档会话查看：sessions.binding 只查已物化的 scope ⇒ openSessionView 内会先
   * sessions.retain(id, { source }) 物化（官方源码 client.js:3410 / 3472），通常无需反归档。
   * 仅当 retain 仍失败时才兜底反归档重试，并在关闭时归档回去。
   */
  const rearchive = (sessionId: string): void => {
    void fetch(`${DISPATCH_API_PREFIX}/session/archive`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ sessionId }),
    }).catch(() => { /* 回归档失败不阻断交互；该会话会留在列表里，用户可自行归档 */ })
  }
  /** 打开只读会话弹窗：retain 物化 scope 直开；失败才兜底反归档重试；不再静默无反应。 */
  const openView = async (sessionId: string, heading: string, outputs?: string[]): Promise<void> => {
    if (viewSession === null) {
      setViewErr('查看会话不可用：sessions / uiConversation 注入未就位（见控制台）')
      return
    }
    setViewErr(null)
    let target = viewSession(sessionId)
    let didUnarchive = false
    if (target === null) {
      try {
        const res = await fetch(`${DISPATCH_API_PREFIX}/session/unarchive`, {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ sessionId }),
        })
        const body = await res.json() as { ok?: boolean; error?: string }
        if (res.ok && body.ok === true) {
          didUnarchive = true
          target = viewSession(sessionId)
        }
      } catch { /* 兜底失败走下面统一提示 */ }
    }
    if (target === null) {
      setViewErr('会话无法打开：retain / 物化 scope 失败（原因见控制台 [task-dispatch:session-view] 日志）')
      return
    }
    setViewing({ sessionId, heading, view: target, didUnarchive, outputs })
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

  // 预览 dock 占位宽度（0 = 收回）：整页与弹窗都按这个变量让位 ⇒「弹窗不遮盖预览面」。
  const previewW = preview === null ? 0 : previewWidth
  // 浮层 Toast 样式注入（保存失败提示用，幂等）。
  ensureToastStyle()
  // 根容器 = 横向分栏：内容区（整页 + 弹窗层）flex:1，预览 dock 占 --dsh-tdt-preview-w。
  // dock 是布局成员而非浮层 ⇒ 整页被真正挤窄、滚动条不被遮盖（用户 2026-09-28 要求「分栏压过来，不是盖上去」）。
  return h('div', {
    id: 'dsh-tdt-root',
    className: 'dsh-tdt-root',
    style: {
      ['--dsh-tdt-preview-w' as string]: `${previewW}px`,
      display: 'flex',
      alignItems: 'flex-start',
      minHeight: '100%',
    },
  },
    h('div', { style: { ...pageStyle, flex: '1 1 auto', minWidth: 0 } },
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
          // 右上角「＋ 新建任务」：拉起右侧贴边的任务编辑弹窗（P0 只做界面，不接保存）。
          h('button', {
            type: 'button',
            style: addButtonStyle,
            title: t('editorNew'),
            onClick: () => { setEditorError(null); setEditor({ mode: 'create', id: '', draft: emptyTaskDraft(), history: null }) },
          }, `＋ ${t('editorNew')}`),
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
              // 任务列表：每行「编辑」入口（修改与新增共用同一表单；JSON 文本域保留作逃生口）。
              h('div', { style: { marginBottom: '16px' } },
                h('div', { style: { fontWeight: 600, marginBottom: '6px' } }, t('editorTasksTitle')),
                taskRows.length === 0
                  ? h('p', { style: hintStyle }, t('editorTasksEmpty'))
                  : h('ul', { style: { listStyle: 'none', margin: 0, padding: 0 } },
                    taskRows.map(row => h('li', {
                      key: row.id,
                      style: { display: 'flex', alignItems: 'center', gap: '10px', padding: '7px 0', borderBottom: `1px solid ${C.border}` },
                    },
                      h('span', { style: { fontSize: '13px', fontWeight: 500 } }, row.title === '' ? row.id : row.title),
                      h('span', { style: { fontSize: '11px', color: C.textFaint } }, row.code ?? row.id),
                      row.enabled === false
                        ? h('span', { style: { fontSize: '11px', color: C.textFaint } }, t('editorDisabledTag'))
                        : null,
                      h('span', { style: { flex: '1 1 auto' } }),
                      h('button', {
                        type: 'button',
                        style: { ...addButtonStyle, padding: '3px 10px' },
                        onClick: () => { openEditor(row.id) },
                      }, t('editorEdit')),
                    )),
                  ),
              ),
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
              // 保存 / 放弃行：外层 position:relative，让所有错误 Toast 悬浮在本行正上方，
              // 不挤占下方「已解析的任务」等版面（用户 2026-09-30：长显占位 / 散落红字统一改为浮层）。
              // - failed：保存失败（动画 2.5s 自退）
              // - invalidToast：JSON 不合法（常驻，直到改对）
              h('div', { style: { position: 'relative' } },
                h('div', { style: rowStyle },
                  h('button', {
                    type: 'button',
                    onClick: () => { void save() },
                    disabled: !writable || invalid || !dirty,
                  }, saving ? t('saving') : t('save')),
                  h('button', {
                    type: 'button',
                    onClick: () => { setDraft(undefined); setFailed(null) },
                    disabled: saving || !dirty,
                  }, t('discard')),
                ),
                failed !== null
                  ? h(FloatingToast, {
                    seq: failedKey,
                    tone: 'error',
                    onDone: () => { setFailed(null) },
                    text: failed,
                  })
                  : null,
                invalidToast.on
                  ? h(FloatingToast, {
                    seq: `inv-${invalidToast.key}`,
                    tone: 'error',
                    sticky: true,
                    onDone: () => { /* sticky：不自动消失，改对 JSON 后由 effect 撤除 */ },
                    text: t('invalidJson'),
                  })
                  : null,
              ),

              h('h4', { style: sectionTitleStyle }, t('tasksParsedTitle')),
              taskRows.length === 0
                ? h('p', { style: hintStyle }, t('tasksParsedEmpty'))
                : h('table', { style: tableStyle },
                    h('thead', null, h('tr', null,
                      [t('colId'), t('colTitle'), t('colCode'), t('colSchedule'), t('colNext')]
                        .map(name => h('th', { key: name, style: cellStyle }, name)))),
                    h('tbody', null, taskRows.map(row => h('tr', { key: row.id },
                      h('td', { style: cellStyle }, row.id),
                      h('td', { style: cellStyle }, row.title),
                      h('td', { style: cellStyle }, row.code ?? '—'),
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
                      [t('colTask'), t('colSlot'), t('colStatus'), t('colAttempt'), t('colSession'), t('colOutputs'), t('colUpdated')]
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
                                    openView(row.session_id as string, titleOfTask(row.task_id), parseOutputs((row as unknown as { outputs?: unknown }).outputs))
                                  },
                                }, row.session_id.slice(0, 8))
                                : row.session_id.slice(0, 8),
                          ),
                          h('td', { style: cellStyle },
                            (() => {
                              // 产出物（决策 32③：完成瞬间写回 task_instances.outputs，真值非模拟）。
                              const outputs = parseOutputs((row as unknown as { outputs?: unknown }).outputs)
                              if (outputs.length === 0) return '—'
                              const sid = row.session_id
                              if (sid === null || !canPreview) {
                                return h('span', { title: outputs.join('\n') },
                                  outputs.map(basenameOf).join('、'))
                              }
                              return h('span', { style: { display: 'inline-flex', flexWrap: 'wrap', gap: '6px' } },
                                outputs.map(output => h('button', {
                                  key: output,
                                  type: 'button',
                                  style: linkStyle,
                                  title: output,
                                  onClick: (event: { stopPropagation(): void }) => {
                                    event.stopPropagation()
                                    openFile(sid, output)
                                  },
                                }, basenameOf(output))))
                            })(),
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
                                      onClick: () => { openView(row.session_id as string, titleOfTask(row.task_id), parseOutputs((row as unknown as { outputs?: unknown }).outputs)) },
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
        // 交付文件（决策 41/42 派发快照同源）：以实例 outputs 权威渲染弹窗「交付文件」区块，
        // 与宿主 timeline 快照里的 deliverables 合并去重，保证老/新任务都能展现。
        outputs: viewing.outputs,
        // U10：fork + 官方跳转（服务未就位时为 null ⇒ 弹窗不渲染「继续对话」按钮）。
        forkSession: forkSession ?? undefined,
        openHostSession: openHostSession ?? undefined,
        // U11：产出物预览（remote.workspaceFiles 未就位时 undefined ⇒ 链接降级纯文本）。
        workspaceFiles: workspaceFiles ?? undefined,
        // 弹窗内所有文件链接 → 页面级唯一预览面（预览与弹窗互不干扰）。
        onOpenFile: canPreview ? (path: string) => { openFile(viewing.sessionId, path) } : undefined,
        onClose: () => {
          const closed = viewing.sessionId
          const needArchive = viewing.didUnarchive === true
          viewing.view.dispose()
          setViewing(null)
          setViewErr(null)
          if (needArchive) rearchive(closed)
        },
      })
      : null,
    // 查看会话失败提示条（固定底部中央，可读可关）。外观与共用 Toast 的中性档统一
    // （反色实面 + 圆点）；保留手动关闭——操作类失败要给用户时间读，不自动消失。
    viewErr !== null
      ? h('div', {
        style: {
          position: 'fixed', left: '50%', bottom: '18px', transform: 'translateX(-50%)',
          zIndex: 1020, maxWidth: '90%', boxSizing: 'border-box',
          background: 'var(--dsw-alias-label-primary, rgba(40,40,40,.92))',
          color: 'var(--dsw-alias-label-primary-inverted, #fff)',
          border: 'none',
          borderRadius: 'var(--dsw-radius-md, 8px)', padding: '8px 14px', fontSize: '12px', lineHeight: '1.6',
          display: 'flex', alignItems: 'center', gap: '8px',
          boxShadow: 'var(--dsw-shadow-lv3, 0 8px 28px rgba(0,0,0,.3))',
        },
        onClick: (event: { stopPropagation(): void }) => { event.stopPropagation() },
      },
        h('span', { style: { flex: 'none', width: '7px', height: '7px', borderRadius: '50%', background: 'var(--dsw-alias-label-primary-inverted, #fff)', opacity: .65 } }),
        h('span', null, viewErr),
        h('button', {
          type: 'button',
          style: { appearance: 'none', font: 'inherit', fontSize: '12px', cursor: 'pointer', color: 'inherit', background: 'none', border: 'none', padding: '0 2px' },
          'aria-label': t('debugClose'),
          onClick: () => { setViewErr(null) },
        }, '✕'),
      )
      : null,
    // 新建 / 编辑任务弹窗（右侧贴边的**浮层**，盖住整页与预览面，不推压页面）。
    // 工作区 / 模型 = `GET /options` 的真实目录（P1）；前置任务 = 现有任务表（真数据）。
    editor !== null
      ? h(TaskEditorDrawer, {
        t,
        mode: editor.mode,
        draft: editor.draft,
        onChange: (next: TaskEditorDraft) => { setEditor({ ...editor, draft: next }) },
        workspaces: editorOptions.workspaces,
        models: editorOptions.models,
        tasks: editorTasks,
        currentTaskId: editor.mode === 'edit' ? editor.id : undefined,
        onClose: () => { setEditor(null) },
        onSave: (draft: TaskEditorDraft) => { void saveEditor(draft) },
        onDelete: editor.mode === 'edit' ? () => { void deleteEditorTask() } : undefined,
        saveError: editorError,
        history: editor.history,
        onRestoreVersion: (file: string) => { void restoreVersion(file) },
        onDeleteVersion: (file: string) => { void deleteVersion(file) },
        onToggleEnabled: (enabled: boolean) => toggleTaskEnabled(editor.id, enabled),
        workspaceFiles,
        workspaceAnchors: editorOptions.workspaceAnchors,
      })
      : null,
    // U11 页面级预览 dock：固定在屏幕最右侧，把整页（含会话弹窗）往左推；
    // 与弹窗互不遮盖、互不干扰——关弹窗预览仍在，收预览整页回满宽。
    preview !== null && workspaceFiles !== null
      ? h(FileBrowser, {
          key: `${preview.sessionId}:${preview.path}`,
          workspaceFiles,
          sessionId: preview.sessionId,
          path: preview.path,
          t,
          dock: true,
          onResizeStart: startResize,
          onClose: closePreview,
          // 工作区选择与选择器**同一段下拉代码**（crumbsMenuEntries）：当前工作区（锚点会话
          // 命中者）排第一、其下路径紧跟；切换 = 把 dock 浏览切到目标工作区的锚点会话。
          rootName: editorOptions.workspaces.find(w => editorOptions.workspaceAnchors[w.value] === preview.sessionId)?.value,
          workspaces: editorOptions.workspaces.map(w => w.value),
          onSelectWorkspace: (name: string) => {
            const anchor = editorOptions.workspaceAnchors[name]
            if (anchor !== undefined && anchor !== preview.sessionId) setPreview({ sessionId: anchor, path: '' })
          },
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
      const res = await fetch(`${DISPATCH_API_PREFIX}/tasks`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ tasksInline: String(value) }),
      })
      // 保存闸门拒绝（422：id 非 UUID 等）⇒ 把服务端文案抛给表单层展示，不让保存静默失败。
      if (!res.ok) {
        let message = `HTTP ${res.status}`
        try {
          const body = (await res.json()) as { error?: unknown }
          if (typeof body.error === 'string' && body.error.trim() !== '') message = body.error
        } catch { /* 保底用状态码 */ }
        throw new Error(message)
      }
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
  /** U10：fork 源会话（sessions.fork 服务未就位时为 null ⇒ 弹窗不渲染按钮）。 */
  forkRef: () => ((id: string, atSeq?: number) => Promise<string>) | null
  /** U10：官方导航跳转（uiWorkspace 服务未就位时为 null ⇒ 弹窗不渲染按钮）。 */
  openRef: () => ((id: string) => void) | null
  /** U11：remote.workspaceFiles 服务未就位时为 null。 */
  filesRef: () => WorkspaceFilesFace | null
  onBack: () => void
}) {
  const { t, viewRef, forkRef, openRef, filesRef, onBack } = props
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
  return h(TaskPage, { t, scope, onBack, viewSession: viewRef(), forkSession: forkRef(), openHostSession: openRef(), workspaceFiles: filesRef() })
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
  // U10「继续对话（开分支）」：fork = 官方 ISessions 契约方法（0.1.7-rc.2 contract/sessions.d.ts:124，
  // 实现体 client.js:3343）——不带 atSeq = 最新已完成 turn 前缀（归档/完结会话即全量对话），
  // increaseTitle = true 让子会话标题递增 (1)（官方 fork 按钮同款 client.js:837-842）。
  let forkSession: ((id: string, atSeq?: number) => Promise<string>) | null = null
  ctx.inject(['sessions', 'uiConversation'], (sub) => {
    const sessions = (sub as { sessions?: SessionsFace }).sessions
    const uiConversation = (sub as { uiConversation?: UiConversationFace }).uiConversation
    if (sessions !== undefined && uiConversation !== undefined) {
      viewSession = (id: string): SessionViewTarget | null => openSessionView(sessions, uiConversation, id)
    }
    const forkFn = (sessions as unknown as Record<string, unknown> | undefined)?.fork
    if (typeof forkFn === 'function') {
      // atSeq = 从指定消息 seq 截断开分支（官方契约 commands.d.ts:36-37）；省略 = 最新已完成 turn 前缀。
      forkSession = (id: string, atSeq?: number): Promise<string> =>
        (forkFn as (opts: { sessionId: string; increaseTitle: boolean; atSeq?: number }) => Promise<string>)
          .call(sessions, atSeq === undefined
            ? { sessionId: id, increaseTitle: true }
            : { sessionId: id, increaseTitle: true, atSeq })
    }
  })
  // U10 跳转：官方导航服务 uiWorkspace（@deepseek-ai/dsh-client-ui-workspace，cordis Service
  // 名 'uiWorkspace'）——openSession(id) 由官方自己 retain('mainView') + selection.set +
  // selectPanel(null)。红线：我方绝不自己 retain 'mainView'（宿主保留值，会锁死导航，真机事故）。
  let openHostSession: ((id: string) => void) | null = null
  ctx.inject(['uiWorkspace'], (sub) => {
    const ws = (sub as { uiWorkspace?: { openSession?(id: string): void } }).uiWorkspace
    if (ws !== undefined && typeof ws.openSession === 'function') {
      openHostSession = (id: string): void => { ws.openSession!(id) }
    }
  })
  // U11 产出物预览：remote.workspaceFiles（@deepseek-ai/dsh-api-workspace-files 的挂载点）。
  // ⚠️ 注入键必须带 dotted 'remote.workspaceFiles'（真机根因 2026-09-28）：官方 client 模块
  // inject = ['resources','remote','remote.workspaceFiles']——dotted 键 = 「等命名空间挂上 remote
  // 才启动」；只注 'remote' 的话回调在 remote 服务就位瞬间即触发，此刻 workspaceFiles 尚未挂上
  // ⇒ 探测永久失败 ⇒ 一切文件链接降级纯文本（真机「没有一个能点」的根因）。
  // 访问双保险：dotted 注入值优先，退回 remote 属性（官方 apply 体即 ctx.remote.workspaceFiles）。
  let workspaceFiles: WorkspaceFilesFace | null = null
  console.info('[task-dispatch:client] 等待 remote.workspaceFiles 就位…')
  ctx.inject(['remote', 'remote.workspaceFiles'], (sub) => {
    const rec = sub as unknown as Record<string, unknown>
    const remote = rec.remote as Record<string, unknown> | undefined
    const wf = rec['remote.workspaceFiles'] ?? remote?.workspaceFiles
    if (wf !== null && wf !== undefined && typeof (wf as WorkspaceFilesFace).read === 'function') {
      workspaceFiles = wf as WorkspaceFilesFace
      console.info('[task-dispatch:client] remote.workspaceFiles 已就位：文件预览与文件链接启用')
    } else {
      // 真机排障锚点：链接全部降级纯文本时先看这行（连同 remote 自身的键清单）。
      console.warn(`[task-dispatch:client] remote.workspaceFiles 未就位：文件预览降级（remote 键=[${remote === undefined ? 'remote 服务缺席' : Object.keys(remote).join(',')}]）`)
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
          forkRef: () => forkSession,
          openRef: () => openHostSession,
          filesRef: () => workspaceFiles,
          onBack: () => { selectPanel(null) },
        }),
      ),
    )
  })
}
