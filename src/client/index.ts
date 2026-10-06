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
// 纯净度：本文件不 import 任何 Node 侧模块；跨插件协作走 cordis 服务注入
// （locale/slots/settingsScope），宿主能力的类型全部本地结构化声明。客户端 bundle 不打包
// src/config.ts（Node 侧），Config 语义在此以字段名复述。
// ⚠️ **唯一的宿主值导入是 `Toast`**（保存成功提示，2026-10-04 评审登记）：官方 Toast 自带明暗自适应
// 与淡入淡出，观感与本仓 `FloatingToast` 不同、且这里只需要「一次性轻提示」；已登记在
// docs/design/ui-style-guide.md §三「已知例外」，除它以外本文件不许再引宿主值。

import { createElement as h, useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore } from 'react'
import { formatDateTime, formatPlanStamp } from './format'
// 会话弹窗的唯一取数入口：按会话 id 取实例行（快照 / 产出）——**所有入口只传会话 id**。
import { fetchInstanceBySession } from './query'
// 带超时的 fetch：共用**叶子模块**（2026-09-30 收敛三份实现；session-view 也引它，故不能放在本文件里）。
import { fetchWithTimeout } from './http'
import { en, zh, type LocaleKey } from './locales'
import { openSessionView, SessionViewModal, type SessionViewTarget, type SessionsFace, type UiConversationFace } from './session-view'
import { FileBrowser } from './file-browser'
import { type OfficeToPdfFace, type WorkspaceFilesFace } from './file-preview'
import {
  clampEditorWidth, definitionToDraft, draftToDefinitionJson, emptyTaskDraft, PAGE_MIN_WIDTH,
  readEditorWidth, TaskEditorDrawer, writeEditorWidth,
  type EditorHistory, type EditorOption, type EditorTaskOption, type HistorySnapshot, type HistoryVersion,
  type TaskEditorDraft,
} from './task-editor'
import { ensureToastStyle, FloatingToast } from './toast-css'
import { Button, IconButton, Segmented, BackToTop, ensureUiBase, startResizeLayoutWidth, type TaskOption } from './ui'
import { RecordsTimelineView } from './records-timeline'
import { TaskCalendarView } from './task-calendar'
import { humanizeTaskError } from './task-editor'
import { TaskListView, useTaskOverview, type RunNowOutcome, type TaskOverviewRow } from './task-list'
// 任务文件上下文（顶部输入区，2026-10-03）：快照解析（deps.ts 零依赖，客户端可安全引）。
import { resolvedDepsOf } from '../deps.js'
import {
  attachmentsOf, workspacePathOf, type AttachedFileView, type UpstreamInputView,
} from './task-file-context'
// ⚠️ 本文件**不再引 `status-text`**（状态名 / 状态桶 / 在跑语义的唯一真源）：消费者只剩两个业务文件 ——
// `records-timeline.tsx`（执行记录流水账）与 `task-list.tsx`（卡片三面板）。旧测试版 records 屏
// （原生 select + 表格）已于 2026-10-04 被时间轴取代（见 worklog/execution-timeline.md）。
import { ConfigPanel } from './config-panel'
import { Toast } from '@deepseek-ai/dsh-client-ui-primitives'

/** 设置命名空间 = 宿主 apply() 里 ctx.settings.register 的注册名（src/index.ts:42）。 */
const SETTINGS_NS = 'dsh-task-dispatch-table'
/** 字典命名空间（locale 注册表独立于 settings 命名空间，取同名便于对应）。 */
const LOCALE_NS = SETTINGS_NS
/** 主面板 id：`main` 槽的 key 与 `sidebar.panellist` 条目的 id 必须一致，选中才对得上。 */
const PANEL_ID = SETTINGS_NS
/** 旧「任务配置」界面（JSON 逃生口 + 只读参数）开关：主界面重建后关闭，待面板收尾时连状态一起清。 */
const LEGACY_CONFIG_VIEW = false
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
// 所有颜色一律取统一 token 层 `--tdt-*`（映射自宿主主题变量
// 与 `--ds-*`）。宿主切「明色 / 暗色 / 跟随系统」时这些变量随之改变 ⇒ 插件自动跟着变，
// 我们不需要自己判断当前是什么主题，也不写死任何颜色。括号里是变量缺失时的兜底值。
const monoFont = 'var(--tdt-font-mono, ui-monospace, SFMono-Regular, Menlo, Consolas, monospace)'
const transition = `background var(--tdt-dur) var(--tdt-ease), color var(--tdt-dur) var(--tdt-ease), border-color var(--tdt-dur) var(--tdt-ease)`

const textareaStyle: Record<string, string | number> = {
  width: '100%', boxSizing: 'border-box', minHeight: '16em', resize: 'vertical',
  fontFamily: monoFont, fontSize: 'var(--tdt-font-sm)', lineHeight: 1.5, padding: '8px',
  color: 'var(--tdt-fg)', background: 'var(--tdt-surface-1)', border: `1px solid var(--tdt-border)`, borderRadius: 'var(--tdt-radius-sm)',
}
const hintStyle: Record<string, string | number> = { color: 'var(--tdt-fg-2)', fontSize: 'var(--tdt-font-sm)', margin: '4px 0 8px' }
const errorStyle: Record<string, string | number> = { color: 'var(--tdt-danger)', fontSize: 'var(--tdt-font-sm)', margin: '4px 0 0' }
const rowStyle: Record<string, string | number> = { display: 'flex', gap: '8px', margin: '8px 0' }
const dlStyle: Record<string, string | number> = { display: 'grid', gridTemplateColumns: 'auto 1fr', gap: '4px 16px', margin: '8px 0 0' }

// ── 设置页卡片：只留一行「标题 + 描述 + 箭头」，点一下开面板（与宿主其它插件卡片同形）──
const cardStyle: Record<string, string | number> = {
  display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '12px',
  padding: '12px 14px', border: `1px solid var(--tdt-border)`, borderRadius: 'var(--tdt-radius-sm)',
  cursor: 'pointer', width: '100%', boxSizing: 'border-box', background: 'transparent',
  textAlign: 'left', color: 'var(--tdt-fg)', transition,
}
const cardTitleStyle: Record<string, string | number> = { fontSize: 'var(--tdt-font-lg)', fontWeight: 600, color: 'var(--tdt-fg)' }
const cardDescStyle: Record<string, string | number> = { fontSize: 'var(--tdt-font-sm)', color: 'var(--tdt-fg-2)', marginTop: '2px' }
const chevronStyle: Record<string, string | number> = { color: 'var(--tdt-fg-3)', display: 'flex', alignItems: 'center' }

// ── 面板（main 槽整页）样式 ──
/** 主区整页容器：占满中栏、自己滚动（会话区被 main 槽整页替换，无需遮罩）。 */
const pageStyle: Record<string, string | number> = {
  height: '100%', width: '100%', boxSizing: 'border-box', overflow: 'auto',
  padding: '18px 22px', color: 'var(--tdt-fg)', background: 'transparent',
}
/** 抬头的三块：标题在左，右依次是「分组标签 · 关闭」。 */
const panelHeaderStyle: Record<string, string | number> = {
  display: 'flex', alignItems: 'center', justifyContent: 'space-between',
  gap: '12px', flexWrap: 'wrap',
  // 主标题与下面任务列表那排的间距（用户 2026-09-30 要求「至少是现在的两倍」，先给 40px 看效果）。
  marginBottom: '40px',
}
const headerRightStyle: Record<string, string | number> = { display: 'flex', alignItems: 'center', gap: '8px' }
const panelTitleStyle: Record<string, string | number> = { fontSize: 'var(--tdt-font-lg)', fontWeight: 600, color: 'var(--tdt-fg)' }
const sectionTitleStyle: Record<string, string | number> = { margin: '12px 0 4px', fontSize: 'var(--tdt-font-md)', color: 'var(--tdt-fg)' }
const preStyle: Record<string, string | number> = {
  fontFamily: monoFont, fontSize: 'var(--tdt-font-sm)', lineHeight: 1.5, margin: '4px 0',
  whiteSpace: 'pre-wrap', wordBreak: 'break-all', maxHeight: '12em', overflow: 'auto',
  background: 'var(--tdt-surface-2)', color: 'var(--tdt-fg)', padding: '8px', borderRadius: 'var(--tdt-radius-sm)',
}
const tableStyle: Record<string, string | number> = {
  borderCollapse: 'collapse', width: '100%', fontFamily: monoFont, fontSize: 'var(--tdt-font-sm)', margin: '4px 0',
}
const cellStyle: Record<string, string | number> = {
  border: `1px solid var(--tdt-border)`, padding: '2px 6px', textAlign: 'left', verticalAlign: 'top',
}
const detailCellStyle: Record<string, string | number> = {
  ...cellStyle, whiteSpace: 'pre-wrap', wordBreak: 'break-all', maxWidth: '480px',
}
// 带超时的 fetch 已抽到共用叶子模块 `./http`（2026-09-30 收敛：本文件与 session-view 共用一份；
// 两条**需要持有 controller 句柄**的路径——任务列表轮询、附件上传——仍各自内联，理由见 `http.ts` 顶部）。

/**
 * 侧栏 / 面板图标（用户 2026-09-30 指定）：`assets/icon-scheduler.svg` 的**内联等价物**——
 * 左右方括号（品牌蓝、40% 透明）+ 红方块拼出的「S」。
 *
 * ⚠️ 为什么内联而不是引文件：宿主只服务 client bundle，仓库里的 `assets/` 不会随 bundle 到浏览器；
 * 而该图标的唯一消费点就是这里（`TaskPanelIcon`），故按原图**逐值**内联，`viewBox 128` 等比缩放。
 * 颜色沿用原图（品牌蓝 + 红）而不走 `currentColor`——这是用户给的设计稿配色；
 * 若日后要跟随侧栏选中态变色，把两处 `stroke` 改成 `currentColor` 即可。
 */
function TaskIcon(props: { size?: number }) {
  const size = props.size ?? 18
  // 「S」= 3 列 × 5 行的 16px 方块（顶横 / 左上 / 中横 / 右下 / 底横），坐标照原图。
  const blocks: Array<[number, number]> = [
    [36, 16], [56, 16], [76, 16],
    [36, 36],
    [36, 56], [56, 56], [76, 56],
    [76, 76],
    [36, 96], [56, 96], [76, 96],
  ]
  return h('svg', {
    width: size, height: size, viewBox: '0 0 128 128', fill: 'none', 'aria-hidden': true,
  },
    h('path', {
      d: 'M19 16 H9 V112 H19',
      stroke: '#4D6BFE', strokeOpacity: 0.4, strokeWidth: 7,
      strokeLinecap: 'round', strokeLinejoin: 'round',
    }),
    h('path', {
      d: 'M109 16 H119 V112 H109',
      stroke: '#4D6BFE', strokeOpacity: 0.4, strokeWidth: 7,
      strokeLinecap: 'round', strokeLinejoin: 'round',
    }),
    h('g', { fill: '#E03E3E' },
      blocks.map(([x, y]) => h('rect', { key: `${x}-${y}`, x, y, width: 16, height: 16 }))),
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

/**
 * 调试快照的客户端投影。
 * ⚠️ 2026-10-04：`instances` / `events` 两个数组**已不再声明** —— 它们的唯一消费者是旧测试版「执行记录」屏
 * （原生 select + 原生表格），该屏已被 HTTP 时间轴取代；调试页走独立的 `GET /db`（`dbDump`），不吃这两个字段。
 * 宿主仍会在快照里下发它们（协议没动），客户端只当没看见。
 */
interface DebugSnapshotData {
  at: string
  tasks: DebugTaskRow[]
  warns: string[]
}

/**
 * ISO 时间串 → `YYYY-MM-DD HH:mm:ss`（本机时区，解析失败原样返回）。
 * ⚠️ 不用 `toLocaleString`：它的补零与分隔符随语言 / 运行环境变（用户 2026-09-30 反馈出现过
 * 个位数分钟）⇒ 自己拼，**月 / 日 / 时 / 分 / 秒一律两位**。
 * 现只有**调试页**在用（快照刷新时刻 / 下次执行时刻）；执行记录页改用按天分组的短时刻。
 */
const formatTime = (iso: string): string => formatDateTime(iso, { seconds: true })

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
    // 只要求「是个对象」：`tasks` / `warns` 缺失都按空处理（旧版快照 / 宿主裁剪字段都不该让整页进错误态）。
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

/**
 * 夹到允许区间（上限按当前视口算，故运行时求值）。
 * @param value - 目标宽度。
 * @param reserved - 右侧**另一条**分栏（编辑分栏）已占的宽度：两条分栏同时开着时也要给主面板
 *   留够最小宽度（用户 2026-10-01 Q3；不足时下限优先）。
 */
function clampPreviewWidth(value: number, reserved = 0): number {
  const avail = Math.min(Math.floor(window.innerWidth * PREVIEW_MAX_RATIO), window.innerWidth - PAGE_MIN_WIDTH - reserved)
  const max = Math.max(PREVIEW_MIN, Math.floor(avail))
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

/**
 * 从**刚提交的任务定义**里取卡片可见字段做一次乐观补丁（用户 2026-09-30：改完要**立刻**看到，
 * 不等服务端那 ~1 秒的落盘 + 重拉）。
 *
 * 只补「能由定义原样算出」的字段：标题 / 编号 / 启停 / 工作区 / 模型 / 重试 / 排期。
 * 提示词首段（服务端截断）、附件、前置任务标题、下次执行时刻（服务端按 cron 算）**不在其中**——
 * 那些交给紧接着的 `refresh()` 拉回服务端真值。排期直接搬 `schedule` 原值 ⇒ 卡片与编辑器的
 * 文案仍由同一个 `schedule-text.ts` 生成，不产生第二份口径。
 */
function rowPatchOf(definition: Record<string, unknown>): Partial<TaskOverviewRow> {
  const target = (definition.target ?? {}) as Record<string, unknown>
  const schedule = (definition.schedule ?? {}) as Record<string, unknown>
  const retry = (definition.retry ?? {}) as Record<string, unknown>
  const str = (value: unknown): string | null => (typeof value === 'string' && value !== '' ? value : null)
  const attempts = Number.parseInt(String(retry.maxAttempts ?? ''), 10)
  const patch: Partial<TaskOverviewRow> = {
    enabled: definition.enabled !== false,
    code: typeof definition.code === 'string' && definition.code.trim() !== '' ? definition.code.trim() : null,
    workspace: typeof target.workspace === 'string' ? target.workspace : '',
    model: str(target.model),
    retryMax: Number.isFinite(attempts) && attempts > 0 ? attempts : 1,
    schedule: {
      cron: str(schedule.cron),
      once: str(schedule.once),
      timezone: str(schedule.timezone),
      start: str(schedule.start),
      everyNWeeks: typeof schedule.everyNWeeks === 'number' ? schedule.everyNWeeks : null,
      window: typeof schedule.window === 'string' && schedule.window !== '' ? schedule.window : 'PT0S',
      ui: (schedule.ui ?? null) as Record<string, unknown> | null,
    },
  }
  // 标题清空时服务端回退成任务 id；本地没有 id 可显示 ⇒ 留原值（马上被重拉覆盖，不编造）。
  if (typeof definition.title === 'string' && definition.title.trim() !== '') patch.title = definition.title.trim()
  return patch
}

/**
 * 调度表整页（`main` 槽，**三标签**：任务配置 / 执行记录 / 调试，见顶部 Segmented）：
 * - **任务配置**：卡片式任务列表（`TaskListView`）+ 右侧占布局的新增/编辑分栏；
 * - **执行记录**：全部任务的流水账（`RecordsTimelineView`）—— 走 `GET /tasks/instances` 的
 *   **HTTP 游标分页**，**不吃调试快照**。版式为「左状态分段控件 + 右时间/工作区/任务」的过滤行，
 *   下面**没有外框、没有时间轴竖线**，只有一条条自带状态色浅底的独立块（左缘 5px 方角竖条表成败、
 *   块间 4px；**成败不再写状态文字**，状态名挂 5px 竖条的悬停提示），日期是一行小字（时钟图标 + 日期 · 星期 · N 条，不吸顶）。
 *   块内**左右两列**：左列 = 标题（后面跟**前置圈码** ①②③，悬停显示「前置任务 N：名」）+ 单行信息
 *   （工作区 · 计划 · 实际 · 时长 · Token，各带 12px 图标与「标签：完整值」的悬停提示、跨天时刻显式标注）
 *   + 有原因时的备注行；右列 = 一排控件（产出物图标 →「查看会话」按钮 → 展开箭头，箭头与任务配置卡片
 *   **共用基础层 `IconButton`**）。**三层结构照任务卡片**：容器不可点 → **头部可点**（含「有选中文字就不展开」
 *   的复制守卫）→ 展开区不可点（内容可直接拖选复制）。**点头部 = 就地展开**（手风琴单开）：第一排产出物
 *   （与卡片「附件区」同款：行内并排 + 40ch 跑马灯）→ 第二排前置任务（一排两个：圈码 + 任务名 /
 *   「执行于 <全量时刻>」+ 查看会话；取自实例快照的 `resolvedDeps`）→ 事件流水（带「执行日志」小标题）；
 *   **只有点「查看会话」才开会话弹窗**
 *   （2026-10-04 第六轮；此前的「原生 select + 表格 + 就地展开事件」测试屏已整段删除）；
 * - **调试**：`GET /db` 的原始表快照 + 运行参数（与下面的任务表快照无关）。
 *
 * ⚠️ 两条**不能混**的数据面：①「任务配置 / 调试」用的任务表来自 settings 快照的 `debugSnapshot`
 * 字段（host 周期写入），经 useSyncExternalStore 订阅自动刷新；② 任务列表卡片走 `/tasks/overview`、
 * 执行记录走 `/tasks/instances`、编辑器选项走 `/options` —— 都是 HTTP。整页由布局服务的 `main` 槽承载：
 * 选中侧栏条目即替换会话区。
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
  /** Office 预览：官方 remote.officeToPdf 服务（未就位为 null ⇒ Office 文件出「不可用」空态）。 */
  officeToPdf: OfficeToPdfFace | null
}) {
  const { t, scope, onBack, viewSession, forkSession, openHostSession, workspaceFiles, officeToPdf } = props
  // 面板自己订阅 scope：保存后即时反映生效值，也拿到 writable 状态。
  const subscribe = useCallback((onChange: () => void) => scope.subscribe(onChange), [scope])
  const getSnapshot = useCallback(() => scope.getSnapshot(), [scope])
  const snapshot = useSyncExternalStore(subscribe, getSnapshot)

  const [tab, setTab] = useState<'config' | 'records' | 'calendar' | 'debug'>('config')
  const [draft, setDraft] = useState<string | undefined>(undefined)
  const [saving, setSaving] = useState(false)
  const [failed, setFailed] = useState<string | null>(null)
  // 每次保存失败自增，用作 Toast 的 React key ⇒ 同一条错误连点也能重播淡入淡出动画。
  const [failedKey, setFailedKey] = useState(0)
  // 保存成功 Toast（用户 2026-09-30：保存成功不许静默，弹绿色「任务已保存」再自退）。
  const [savedToast, setSavedToast] = useState(0)
  const savedSeq = useRef(0)
  const notifySaved = (): void => { savedSeq.current += 1; setSavedToast(savedSeq.current) }
  // JSON 不合法：持续态校验，浮层常驻 Toast（不自动消失）浮在保存行上方，不占版面、不挤压下方。
  const [invalidToast, setInvalidToast] = useState<{ on: boolean; key: number }>({ on: false, key: 0 })
  const invalidSeq = useRef(0)
  // 新建 / 编辑任务分栏（U21：2026-10-01 起是「占布局的分栏」，不再是浮层弹窗）。
  // `id` = 编辑态的任务 UUID（新建为空串）；`history` = 服务端真历史（不在 draft 里，免得脏判定误判）。
  const [editor, setEditor] = useState<{
    mode: 'create' | 'edit'
    id: string
    draft: TaskEditorDraft
    history: EditorHistory | null
    /**
     * 打开时停在**哪一档**（用户 2026-10-05）：
     * 「＋ 新建任务」与卡片「编辑」= `'edit'`；从卡片「前置任务」行点任务名进来 = `'view'`（只读人话视图）。
     */
    view: 'view' | 'edit'
  } | null>(null)
  const [editorSaving, setEditorSaving] = useState(false)
  const [editorError, setEditorError] = useState<string | null>(null)
  /** 编辑分栏宽度（真源在这里：另一个 dock 与全屏会话弹窗都要拿它算可用宽度）。 */
  const [editorWidth, setEditorWidth] = useState<number>(() => readEditorWidth())

  // U11 页面级预览 dock（用户 2026-09-28 拍板）：**唯一一份**预览面，固定在屏幕最右侧并
  // 把整页（含会话弹窗）往左推；弹窗与整页共用它，关弹窗不影响它，它自己可完整收回。
  const [preview, setPreview] = useState<{ sessionId: string; path: string } | null>(null)
  const [previewWidth, setPreviewWidth] = useState<number>(() => readPreviewWidth())
  // 两条分栏各自当前占掉的宽度（0 = 收起）：**互为对方的预留**，用来给主面板留够最小宽度
  // （用户 2026-10-01 Q3：两条同时打开时也要保证主窗口，不只是单边）。
  const previewTaken = preview === null ? 0 : previewWidth
  const editorTaken = editor === null ? 0 : editorWidth
  /** 编辑分栏宽度变化回调（拖拽松手）：落 state + 持久化。 */
  const changeEditorWidth = useCallback((next: number): void => {
    setEditorWidth(next)
    writeEditorWidth(next)
  }, [])
  /**
   * 两条分栏同开（或视口变化）时重新夹一遍宽度 ⇒ 主面板始终拿得到最小宽度 760
   * （不足时按各自下限兜住，宁可主面板出横向滚动条也不许分栏被压塌）。
   */
  useEffect(() => {
    const reClamp = (): void => {
      setEditorWidth(cur => {
        const next = clampEditorWidth(cur, previewTaken)
        return next === cur ? cur : next
      })
      setPreviewWidth(cur => {
        const next = clampPreviewWidth(cur, editorTaken)
        return next === cur ? cur : next
      })
    }
    reClamp()
    window.addEventListener('resize', reClamp)
    return () => { window.removeEventListener('resize', reClamp) }
  }, [previewTaken, editorTaken])
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
  /**
   * 拖拽调宽：指针移动期间只在 dock 上改 CSS 变量值，松手才落 state（避免每帧重渲染整页）。
   *
   * 拖拽不再「顺手选中文字」（用户 2026-10-02，与编辑分栏同一处理）：pointerdown 的默认动作会
   * 开一次文本选区 ⇒ ① preventDefault 掐掉默认动作；② 拖动期间 `body.user-select:none`，
   * pointerup 恢复，并清掉已有选区。
   */
  const startResize = useCallback((start: { clientX: number; preventDefault?: () => void }): void => {
    const startX = start.clientX
    const startWidth = previewWidth
    startResizeLayoutWidth({
      startEvent: start,
      compute: (clientX) => clampPreviewWidth(startWidth - (clientX - startX), editorTaken),
      onMove: (w) => {
        // 宽度直接写 dock 的 style.width（不经根变量 ⇒ 只重排 dock，避免每帧整页重排，真机 2026-10-04）；
        // 退化情形（dock 取不到）才回退根变量。PDF 预览是 iframe，拖动期给根挂 `dsh-tdt-resizing`
        // 令 iframe pointer-events:none，否则指针进 iframe 父文档收不到 pointermove 会卡死（2026-10-03）。
        const rootEl = document.getElementById('dsh-tdt-root')
        const dockEl = rootEl?.querySelector('.dsh-tdt-sv-preview-dock') as HTMLElement | null
        if (dockEl !== null) dockEl.style.width = `${w}px`
        else rootEl?.style.setProperty('--dsh-tdt-preview-w', `${w}px`)
      },
      onCommit: (w) => {
        setPreviewWidth(w)
        try { window.localStorage.setItem(PREVIEW_WIDTH_KEY, String(w)) } catch { /* 隐私模式忽略 */ }
      },
      rootClass: 'dsh-tdt-resizing',
      rafThrottle: true,
    })
  }, [previewWidth, editorTaken])
  // 新建 / 编辑任务弹窗：保存 / 删除 / 历史版本全部接线（2026-09-30）。
  // `id` = 编辑态的任务 UUID（新建为空串）；`history` = 服务端真历史（不在 draft 里，免得脏判定误判）。
  // 主界面任务列表数据（2026-09-30）：一次请求出全部卡片数据，10 秒轮询 + rev 比对
  // ⇒ 服务端只读内存摘要、不查库（design/features/main-panel.md §四）。
  const overview = useTaskOverview()

  /** 拉取某任务的历史（版本 + 快照）。拉不到就保持空 ⇒ 面板显示「暂无版本」。 */
  const loadHistory = async (id: string): Promise<void> => {
    try {
      const res = await fetchWithTimeout(`${DISPATCH_API_PREFIX}/tasks/history?id=${encodeURIComponent(id)}`, { cache: 'no-store' })
      const body = await res.json() as { ok?: boolean; versions?: unknown; snapshots?: unknown }
      if (body.ok !== true) return
      const history: EditorHistory = {
        versions: Array.isArray(body.versions) ? body.versions as HistoryVersion[] : [],
        snapshots: Array.isArray(body.snapshots) ? body.snapshots as HistorySnapshot[] : [],
      }
      setEditor(cur => (cur === null || cur.id !== id ? cur : { ...cur, history }))
    } catch { /* 忽略：版本面板自有空态 */ }
  }

  /**
   * 从 `tasksInline`（宿主 scope 段）取某个任务的**完整定义**（不是 overview 摘要行）。
   * 未找到 / JSON 坏 ⇒ `null`（调用方给可见提示，**不编造空定义**）。
   * 编辑与查看两个入口共用这一份，不许各写一遍解析。
   */
  const findDefinition = (id: string): Record<string, unknown> | null => {
    try {
      const arr = JSON.parse(effectiveInline.trim() === '' ? '[]' : effectiveInline) as unknown
      if (!Array.isArray(arr)) return null
      return arr.find((item): item is Record<string, unknown> => (
        item !== null && typeof item === 'object' && (item as { id?: unknown }).id === id
      )) ?? null
    } catch { return null }
  }

  /** 打开「编辑任务」（默认停在**编辑档**）：完整定义反解成草稿。 */
  const openEditor = (id: string): void => {
    // 点的就是当前抽屉里这个任务 ⇒ **只切档**，不重建草稿（重建 = 静默丢弃用户改了一半的内容）。
    if (editor !== null && editor.id === id) {
      setEditor({ ...editor, view: 'edit' })
      return
    }
    // 正在编辑**另一个任务**且草稿有未保存修改 ⇒ 先弹确认（用户 2026-10-05 修正：此前会静默覆盖、编辑全废）。
    // 确认「直接覆盖」才丢弃并打开新任务；「取消 / 继续编辑」留在当前。
    if (editor !== null && editorDirtyRef.current) {
      setPendingEdit({ id })
      return
    }
    openEditorNow(id)
  }
  /** 真正打开编辑（不检查未保存冲突）：完整定义反解成草稿。 */
  const openEditorNow = (id: string): void => {
    const found = findDefinition(id)
    if (found === null) {
      setViewErr('找不到该任务的定义，无法编辑（任务表可能刚被改动，请刷新后重试）')
      return
    }
    setEditorError(null)
    setEditor({ mode: 'edit', id, draft: definitionToDraft(found), history: null, view: 'edit' })
    void loadHistory(id)
  }
  /** 打开「新建任务」（创建模式）：空草稿；复用 openCreate 的未保存拦截。 */
  const openCreateNow = (): void => {
    setEditorError(null)
    setEditor({ mode: 'create', id: '', draft: emptyTaskDraft(), history: null, view: 'edit' })
  }
  /** 打开「新建任务」：拦截标准不是入口、是「草稿脏」——正在编辑且没保存 ⇒ 先弹三选确认；否则直接开。 */
  const openCreate = (): void => {
    if (editor !== null && editorDirtyRef.current) {
      // '' 标记「新建目标」；confirmPendingEdit 据此走 openCreateNow，否则走 openEditorNow。
      setPendingEdit({ id: '' })
      return
    }
    openCreateNow()
  }

  // ── 查看档入口（用户 2026-10-05）─────────────────────────────────────────
  /** 待确认的「放弃未保存修改、改去查看另一个任务」。 */
  const [pendingView, setPendingView] = useState<{ id: string } | null>(null)
  /** 抽屉上报的脏状态（**只存不算**：脏判定真源在抽屉内的 `initialDraftRef` 比对）。 */
  const editorDirtyRef = useRef(false)
  /** 真正进查看档（不检查未保存冲突）。 */
  const openViewerNow = (id: string): void => {
    const found = findDefinition(id)
    if (found === null) {
      setViewErr('找不到该任务的定义，无法查看（任务表可能刚被改动，请刷新后重试）')
      return
    }
    setEditorError(null)
    setEditor({ mode: 'edit', id, draft: definitionToDraft(found), history: null, view: 'view' })
    // 版本历史与编辑入口一样先拉：查看档里切到编辑档后，版本面板不该谎报「无版本」。
    void loadHistory(id)
  }
  /**
   * 打开「查看档」：点任务卡片展开区「前置任务」行的任务名进来（本期唯一入口）。
   * ⚠️ 正在编辑**另一个任务**且草稿有未保存修改 ⇒ 先弹确认（用户 2026-10-05 拍板），
   * 确认后才切过去 —— **不静默丢弃**用户改了一半的内容。
   */
  const openViewer = (id: string): void => {
    if (editor !== null && editor.id !== id && editorDirtyRef.current) {
      setPendingView({ id })
      return
    }
    // 点的就是当前抽屉里这个任务 ⇒ **只切到查看档**，不重建草稿（保住未保存的修改）。
    if (editor !== null && editor.id === id) {
      setEditor({ ...editor, view: 'view' })
      return
    }
    openViewerNow(id)
  }
  /** 确认放弃修改、切去看目标任务。 */
  const confirmPendingView = (): void => {
    const target = pendingView
    setPendingView(null)
    if (target !== null) openViewerNow(target.id)
  }
  // ── 编辑态切去编辑**另一个任务**：未保存冲突确认（与 pendingView 同思路，给三选）──
  /** 待确认的「放弃未保存修改、改去编辑另一个任务」。 */
  const [pendingEdit, setPendingEdit] = useState<{ id: string } | null>(null)
  /** 确认放弃修改、切去编辑目标任务 / 新建任务（二者都先丢弃未保存草稿、再开）。 */
  const confirmPendingEdit = (): void => {
    const target = pendingEdit
    setPendingEdit(null)
    if (target === null) return
    // '' = 新建目标；其余为「切去编辑另一个任务」。
    if (target.id === '') openCreateNow()
    else openEditorNow(target.id)
  }

  /**
   * 启用开关实时写回（编辑态专用，用户 2026-09-30）：POST /tasks/enabled { id, enabled }。
   * 返回 null = 成功；否则返回人话错误文案。快照由 2s 轮询自动同步，无需手动刷。
   */
  const toggleTaskEnabled = async (id: string, enabled: boolean): Promise<string | null> => {
    try {
      const res = await fetchWithTimeout(`${DISPATCH_API_PREFIX}/tasks/enabled`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ id, enabled }),
      })
      const body = await res.json() as { ok?: boolean; error?: unknown }
      if (body.ok !== true) {
        return humanizeTaskError(typeof body.error === 'string' && body.error !== '' ? body.error : `HTTP ${res.status}`)
      }
      // 启停成功的**唯一**刷新点（2026-09-30 抽象统一）：列表拨片与编辑态开关共用这一条路径，
      // 调用方不必各自刷新。
      overview.refresh()
      return null
    } catch (error) {
      return error instanceof Error ? error.message : String(error)
    }
  }

  /**
   * 删除任务（决策 55，卡片右下角快捷删除）：DELETE /tasks { id }。
   * 服务端语义：摘定义 + 整删任务目录（附件 / 版本 / 快照），实例 / 事件保留做审计；
   * 成功后 overview.refresh() 让列表立刻少一行。失败走 viewErr 条（操作类失败留时间读）。
   */
  const deleteTask = async (id: string): Promise<string | null> => {
    try {
      const res = await fetchWithTimeout(`${DISPATCH_API_PREFIX}/tasks`, {
        method: 'DELETE',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ id }),
      })
      const body = await res.json() as { ok?: boolean; error?: unknown }
      if (body.ok !== true) {
        const message = humanizeTaskError(typeof body.error === 'string' && body.error !== '' ? body.error : `HTTP ${res.status}`)
        setViewErr(message)
        return message
      }
      overview.refresh()
      return null
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      setViewErr(message)
      return message
    }
  }

  /**
   * 立即执行（2026-10-03 用户拍板）：POST /tasks/run { id } ⇒ **提前触发一次调度**。
   * 返回 `{ ok:true }` 或业务性拒绝 `{ ok:false, error, detail }`——原因文案由卡片侧按 locale 拼
   * （用户要求：手动触发看不到后台日志，必须弹 Toast 告诉「没执行成功 + 为什么」）。
   * 成功即刷 overview，让卡片立刻进入「运行中」。
   */
  const runTaskNow = async (id: string): Promise<RunNowOutcome> => {
    try {
      const res = await fetchWithTimeout(`${DISPATCH_API_PREFIX}/tasks/run`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ id }),
      })
      const body = await res.json() as { ok?: boolean; error?: unknown; detail?: unknown }
      if (body.ok === true) {
        overview.refresh()
        return { ok: true }
      }
      return {
        ok: false,
        error: typeof body.error === 'string' && body.error !== '' ? body.error : `HTTP ${res.status}`,
        detail: typeof body.detail === 'string' ? body.detail : undefined,
      }
    } catch (error) {
      return { ok: false, error: 'network', detail: error instanceof Error ? error.message : String(error) }
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
      const res = await fetchWithTimeout(`${DISPATCH_API_PREFIX}/tasks`, {
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
      // 保存成功不许静默（用户 2026-09-30）：关窗同时弹绿色「任务已保存」。
      notifySaved()
      // ① 先乐观补该行 ⇒ 改标题 / 排期**立刻**可见（用户 2026-09-30：不等那一秒）。
      if (typeof body.id === 'string' && body.id !== '') overview.patchRow(body.id, rowPatchOf(definition))
      // ② 再立刻重拉一次，用服务端真值（含提示词首段 / 下次执行时刻）覆盖那份乐观值
      //    （改动已 bump rev；不 refresh 就要等 10 秒轮询）。
      overview.refresh()
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
      const res = await fetchWithTimeout(`${DISPATCH_API_PREFIX}/tasks`, {
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
      overview.refresh() // 删除后列表立即少一行
    } catch (error) {
      setEditorError(humanizeTaskError(error instanceof Error ? error.message : String(error)))
    }
  }

  /** 只找回提示词：取该版本内容 → 填进编辑器（其余设置不动）。 */
  const restoreVersion = async (file: string): Promise<void> => {
    if (editor === null) return
    try {
      const res = await fetchWithTimeout(
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
      await fetchWithTimeout(
        `${DISPATCH_API_PREFIX}/tasks/history/item?id=${encodeURIComponent(editor.id)}&kind=prompt&file=${encodeURIComponent(file)}`,
        { method: 'DELETE' },
      )
      await loadHistory(editor.id)
    } catch { /* 删不掉就保持原样，不打断编辑 */ }
  }
  // 表单下拉数据面（P1）：宿主真实工作区 + 真实模型目录，进面板取一次（不轮询，目录稳定）。
  //
  // ⚠️ **工作区候选的唯一真源**（2026-10-04 用户拍板，见 docs/worklog/workspace-options-unification.md）：
  // 三处「选工作区」（编辑器底部 / 编辑器「前置任务」第①级 / 任务列表顶部）**一律用这一份**，
  // 不许再从任务表或卡片数据反推 —— 反推会让「暂时没有任务的工作区」凭空消失（用户以为它不存在）。
  // 取不到（degraded）⇒ 空数组，下拉显示「暂无可选」，**不回退反推**（回退就是又造第二真源）。
  const [editorOptions, setEditorOptions] = useState<EditorOptions>(EMPTY_EDITOR_OPTIONS)
  useEffect(() => {
    let alive = true
    fetchWithTimeout(`${DISPATCH_API_PREFIX}/options`, { cache: 'no-store' })
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
  type ViewingState = {
    sessionId: string
    heading: string
    /** r12：标题里的任务名可点开查看档 ⇒ 任务名 / 余串 / 任务 id 拆开传（拿不到 = 纯文本降级）。 */
    headingTask?: string
    headingRest?: string
    taskId?: string
    view: SessionViewTarget
    didUnarchive?: boolean
    outputs?: string[]
    /** 接收区（2026-10-03）：实例快照 `resolvedDeps` + 任务名反查。 */
    upstream?: UpstreamInputView[]
    /** 随附区（2026-10-03）：快照 `attachments` + 服务端解析好的绝对路径。 */
    attached?: AttachedFileView[]
    /** 本任务工作区 path（判跨区目录可否点开）。 */
    workspacePath?: string | null
  }
  const [viewing, setViewing] = useState<ViewingState | null>(null)
  /** 当前 viewing 的镜像：换会话时要 release 旧引用（state 更新是异步的，拿不到即时旧值）。 */
  const viewingRef = useRef<ViewingState | null>(null)
  /**
   * 打开 / 换 / 关会话弹窗的**唯一出口**：retain 契约要求引用用完 `release()`
   * （`view.dispose()`），否则连点几个会话就会攒住一批物化 scope。
   */
  const applyViewing = (next: ViewingState | null): void => {
    const prev = viewingRef.current
    viewingRef.current = next
    setViewing(next)
    if (prev !== null && prev !== next) prev.view.dispose()
  }
  // 查看会话失败提示（决策 28 数据链静默失效时，给用户可见反馈，不再「点了没反应」）。
  const [viewErr, setViewErr] = useState<string | null>(null)
  // 调试页：state.db 三张表的原始行（GET /db，切到该页或手动刷新时取一次）。
  const [dbDump, setDbDump] = useState<{ at: string; tables: DbTableDump[] } | null>(null)
  const [dbState, setDbState] = useState<'idle' | 'loading' | 'ok' | 'fail'>('idle')

  useEffect(() => {
    if (tab !== 'debug') return
    let alive = true
    setDbState('loading')
    fetchWithTimeout(`${DISPATCH_API_PREFIX}/db`)
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
  }, [tab])

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
      notifySaved()
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
  /**
   * 执行记录总查询页的任务候选（2026-10-04）：走 **overview（HTTP）** 而不是调试快照 ——
   * 任务目录本来就有独立的 HTTP 真源，不跟着快照的可达性起伏。
   * 文案与 `editorTasks` 同口径（`[编号] 名称`），`TaskOption` 与 `EditorTaskOption` 同形。
   */
  const timelineTasks: TaskOption[] = useMemo(
    () => overview.rows.map(row => {
      const name = row.title === '' ? row.id : row.title
      return {
        id: row.id,
        label: row.code ? `[${row.code}] ${name}` : name,
        workspace: row.workspace,
        enabled: row.enabled !== false,
      }
    }),
    [overview.rows],
  )
  /**
   * 归档会话查看：sessions.binding 只查已物化的 scope ⇒ openSessionView 内会先
   * sessions.retain(id, { source }) 物化（官方源码 client.js:3410 / 3472），通常无需反归档。
   * 仅当 retain 仍失败时才兜底反归档重试，并在关闭时归档回去。
   */
  const rearchive = (sessionId: string): void => {
    void fetchWithTimeout(`${DISPATCH_API_PREFIX}/session/archive`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ sessionId }),
    }).catch(() => { /* 回归档失败不阻断交互；该会话会留在列表里，用户可自行归档 */ })
  }
  /** 打开只读会话弹窗：retain 物化 scope 直开；失败才兜底反归档重试；不再静默无反应。 */
  /**
   * 上游依赖 → 接收区视图模型（2026-10-03）：任务名按 id 从任务列表反查，
   * 查不到（任务已删）⇒ 显示**短 id**，绝不留空白、绝不编造名字。
   */
  const upstreamOf = (snapshot: string | null): UpstreamInputView[] => resolvedDepsOf(snapshot).map(dep => ({
    ...dep,
    taskTitle: overview.rows.find(row => row.id === dep.task)?.title || dep.task.slice(0, 8),
  }))

  /**
   * 打开只读会话弹窗（2026-10-03 起**只认会话 id**）。
   *
   * ⚠️ 铁律：进弹窗的入口有十几处，**一律只传会话 id** —— 快照 / 产出 / 标题全部在这里
   * 按会话 id 自取（`fetchInstanceBySession`）⇒ 从哪进都是同一个渲染。
   * 曾经的错法：由调用方把 `snapshot` / `outputs` 传进来，结果老界面的「查看任务」入口
   * 没传 ⇒ 同一个会话两处长得不一样（用户 2026-10-03 抓出）。**不许再回退成传参**。
   *
   * 参数**只有** sessionId（专家团评审：连 fallbackHeading 都删掉，不给「再传点别的」留门）。
   */
  const openView = async (sessionId: string): Promise<void> => {
    if (viewSession === null) {
      setViewErr('查看会话不可用：sessions / uiConversation 注入未就位（见控制台）')
      return
    }
    setViewErr(null)
    // ① 一律按会话 id 自取那一条实例行（取不到 ⇒ null，照常开弹窗，只少产出卡与接收区）。
    const row = await fetchInstanceBySession(sessionId)
    // ② 标题也在这里统一（任务名 · 计划时刻），不由调用方各写一套。
    // r12：任务名要能点开该任务的查看档 ⇒ 任务名与余串**分开传**（row 取不到 = 整串纯文本降级）。
    const headingRow = row === null ? undefined : overview.rows.find(item => item.id === row.task_id)
    const heading = row === null
      ? sessionId.slice(0, 8)
      : `${headingRow?.title || row.task_id.slice(0, 8)} · ${formatPlanStamp(row.scheduled_at)}`
    let target = viewSession(sessionId)
    let didUnarchive = false
    if (target === null) {
      try {
        const res = await fetchWithTimeout(`${DISPATCH_API_PREFIX}/session/unarchive`, {
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
    applyViewing({
      sessionId,
      heading,
      // r12：标题任务名可点（查看档）。
      taskId: row?.task_id,
      headingTask: row === null ? undefined : (headingRow?.title ?? row.task_id.slice(0, 8)),
      headingRest: row === null ? undefined : ` · ${formatPlanStamp(row.scheduled_at)}`,
      view: target,
      didUnarchive,
      outputs: row === null ? undefined : parseOutputs(row.outputs),
      upstream: upstreamOf(row?.snapshot ?? null),
      attached: row === null ? [] : attachmentsOf(row.snapshot ?? null, row.attachmentPaths),
      // 本任务工作区（判上游目录是否跨区 ⇒ 跨区目录列不出来，降级不可点）。
      workspacePath: workspacePathOf(row?.snapshot ?? null),
    })
  }
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
  // UI 基础层（P0）：登记 token 层（--tdt-* 变量表）并注入唯一样式入口。
  // 阶段说明：此刻还没有任何规则消费 --tdt-*，所以**界面零变化**；逐期（P1→）把调用点搬上来。
  ensureUiBase()
  // 根容器 = 横向分栏：内容区（整页 + 会话弹窗层）flex:1，右侧两条 dock 各占一份宽度
  // （预览 `--dsh-tdt-preview-w`、编辑 `--dsh-tdt-editor-w`，收起时各自为 0）。
  // dock 是布局成员而非浮层 ⇒ 整页被真正挤窄、滚动条不被遮盖（用户 2026-09-28 要求「分栏压过来，不是盖上去」；
  // 2026-10-01 U21 编辑弹窗也改成同一形态）。
  return h('div', {
    id: 'dsh-tdt-root',
    className: 'dsh-tdt-root',
    style: {
      ['--dsh-tdt-preview-w' as string]: `${previewW}px`,
      ['--dsh-tdt-editor-w' as string]: `${editorTaken}px`,
      display: 'flex',
      alignItems: 'flex-start',
      minHeight: '100%',
    },
  },
    h('div', { style: { ...pageStyle, flex: '1 1 auto', minWidth: 0 } },
      // 抬头：**与任务列表同宽居中**（用户 2026-09-30：主窗口标题也得收拢，不能全屏铺开）；
      // 标题下面不再写时间与提示（用户 2026-09-30：只留「← 返回会话」和标题）。
      h('div', { style: { display: 'flex', justifyContent: 'center' } },
        h('div', { style: { width: '100%', maxWidth: '1120px', minWidth: '760px', boxSizing: 'border-box' } },
          h('div', { style: panelHeaderStyle },
            h('div', { style: { display: 'flex', alignItems: 'center', gap: '10px', minWidth: 0 } },
              h(Button, {
                variant: 'outline',
                size: 'md',
                title: t('backToConversation'),
                onClick: onBack,
              }, `← ${t('backToConversation')}`),
              h('div', { style: panelTitleStyle }, t('panelTitle')),
            ),
            h('div', { style: headerRightStyle },
              // 分段控件走 UI 基础层唯一实现（P1）：以前这里是一份就地自绘的样式（已删）
              h(Segmented<'config' | 'records' | 'calendar' | 'debug'>, {
                value: tab,
                size: 'md',
                items: [
                  { value: 'config', label: t('tabConfig') },
                  { value: 'records', label: t('tabRecords') },
                  { value: 'calendar', label: t('tabCalendar') },
                  { value: 'debug', label: t('tabDebug') },
                ],
                onChange: setTab,
              }),
          // 右上角「＋ 新建任务」：拉起右侧贴边的任务编辑弹窗（P0 只做界面，不接保存）。
          // 高度跟旁边三 tab 分段条同走 md(28)（用户 2026-10-01：此前 sm=24 比滑块矮 4px）。
          h(Button, {
            variant: 'outline',
            size: 'md',
            title: t('editorNew'),
            onClick: () => { openCreate() },
          }, `＋ ${t('editorNew')}`),
            ),
          ),
        ),
      ),

      // ⚠️ 「执行记录」必须排在 `data === undefined` **之前**：新页走 `GET /tasks/instances`（HTTP + 游标分页），
      // 不吃调试快照 —— 放在门槛之后的话，快照缺失 / 解析失败会把新页一起挡掉（2026-10-04）。
      // 「任务日程」同理（它走 `/tasks/overview` + `/tasks/instances?light=1`，两条都是 HTTP）⇒ 一样排在门槛之前。
      tab === 'calendar'
        ? h(TaskCalendarView, {
          t,
          // 任务定义行（含排期）：未来计划由它在浏览器内现算，任务名也由它映射。
          rows: overview.rows,
          // 任务选择器候选 = `[编号] 名称`（与编辑器「前置任务」同一套文案口径），来源 = 面板 overview。
          tasks: timelineTasks,
          // 工作区候选 = 面板级唯一真源 `/options`（2026-10-04 拍板）。
          workspaces: editorOptions.workspaces,
          // 只给会话 id：弹窗自己按 id 取快照 / 产出（铁律见 openView 注释）。
          onOpenSession: viewSession !== null
            ? (sessionId: string) => { void openView(sessionId) }
            : undefined,
          // 拉开区里执行块的产出物 chip 点开 = 页面级预览 dock（与执行记录页同一入口）；
          // 预览面没就位 ⇒ 不传，chip 降级不可点。
          onOpenFile: canPreview ? openFile : undefined,
          // 拉开区里点任务名 ⇒ 右侧栏以查看档打开该任务（与执行记录页同款）。
          onViewTask: openViewer,
        })
        : tab === 'records'
        ? h(RecordsTimelineView, {
          t,
          // 任务候选 = `[编号] 名称`（与编辑器「前置任务」同一套文案口径），来源 = 面板 overview（HTTP）。
          tasks: timelineTasks,
          // 工作区候选 = 面板级唯一真源 `/options`（2026-10-04 拍板，见 worklog/workspace-options-unification.md）。
          workspaces: editorOptions.workspaces,
          // 只给会话 id：弹窗自己按 id 取快照 / 产出（铁律见 openView 注释）。
          onOpenSession: viewSession !== null
            ? (sessionId: string) => { void openView(sessionId) }
            : undefined,
          // 产出物 chip 点开 = 页面级预览 dock（与卡片面板同一入口）；预览面没就位 ⇒ 不传，chip 降级不可点。
          onOpenFile: canPreview ? openFile : undefined,
          // 任务名可点（r12）：点记录的任务名 / 前置任务名 ⇒ 右侧栏以查看档打开该任务。
          onViewTask: openViewer,
        })
        : data === undefined
        ? h('div', null,
            h('p', { style: hintStyle }, hasRaw ? t('debugRaw') : t('debugEmpty')),
            hasRaw ? h('pre', { style: preStyle }, raw) : null,
            // 临时诊断行：数据通道断在哪一段，一眼可见（通道稳定后移除）。
            h('pre', { style: { ...preStyle, color: 'var(--tdt-fg-3)' } }, describeDiag()),
          )
        : tab === 'config'
          // 任务列表视图（2026-09-30 主界面重建）：卡片式，限宽居中，数据走 /tasks/overview。
          ?           h(TaskListView, {
            t,
            rows: overview.rows,
            ready: overview.ready,
            refresh: overview.refresh,
            onEdit: openEditor,
            onDelete: deleteTask,
            // 产出 / 会话入口走 U11 单一入口：预览面或会话面不可用时 undefined ⇒ 面板降级纯文本 / 不出链接。
            onOpenFile: canPreview ? openFile : undefined,
            // 只给会话 id：弹窗自己按 id 取快照 / 产出（铁律见 openView 注释）。
            onOpenSession: viewSession !== null
              ? (sessionId: string) => { void openView(sessionId) }
              : undefined,
            // 拨片要**立刻生效**：卡片自己做乐观更新（点了即变）；成功由 toggleTaskEnabled
            // 内部统一刷新、失败由它返回错误文案（列表据此回滚乐观值）。
            onToggleEnabled: toggleTaskEnabled,
            // 立即执行（2026-10-03）：卡片确认框 → runTaskNow → 结果 Toast（成功绿 / 拒绝红）。
            onRunNow: runTaskNow,
            // 查看档入口（2026-10-05）：卡片展开区「前置任务」行点任务名 ⇒ 右侧栏以**查看档**打开该任务。
            onViewTask: openViewer,
            // 工作区筛选候选 = **面板级唯一真源**（`/options`），列表不再从卡片数据反推（2026-10-04）。
            workspaces: editorOptions.workspaces,
          })
          // ↓ 旧「任务配置」界面（JSON 逃生口 + 只读参数）：主界面重建后由常量关掉，暂不删——
          // 删了会牵出一串只服务于它的状态；等面板整体收尾（U6 调试债清理）时连状态一起清。
          : LEGACY_CONFIG_VIEW
            ? h('div', null,
              // 任务列表：每行「编辑」入口（修改与新增共用同一表单；JSON 文本域保留作逃生口）。
              h('div', { style: { marginBottom: '16px' } },
                h('div', { style: { fontWeight: 600, marginBottom: '6px' } }, t('editorTasksTitle')),
                taskRows.length === 0
                  ? h('p', { style: hintStyle }, t('editorTasksEmpty'))
                  : h('ul', { style: { listStyle: 'none', margin: 0, padding: 0 } },
                    taskRows.map(row => h('li', {
                      key: row.id,
                      style: { display: 'flex', alignItems: 'center', gap: '10px', padding: '7px 0', borderBottom: `1px solid var(--tdt-border)` },
                    },
                      h('span', { style: { fontSize: 'var(--tdt-font-md)', fontWeight: 500 } }, row.title === '' ? row.id : row.title),
                      h('span', { style: { fontSize: 'var(--tdt-font-xs)', color: 'var(--tdt-fg-3)' } }, row.code ?? row.id),
                      row.enabled === false
                        ? h('span', { style: { fontSize: 'var(--tdt-font-xs)', color: 'var(--tdt-fg-3)' } }, t('editorDisabledTag'))
                        : null,
                      h('span', { style: { flex: '1 1 auto' } }),
                      h(Button, {
                        variant: 'outline',
                        size: 'sm',
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
                  h(Button, {
                    variant: 'primary',
                    size: 'sm',
                    onClick: () => { void save() },
                    disabled: !writable || invalid || !dirty,
                  }, saving ? t('saving') : t('save')),
                  h(Button, {
                    variant: 'outline',
                    size: 'sm',
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
                savedToast !== 0
                  ? h(Toast, {
                    key: savedToast,
                    text: t('editorTaskSaved'),
                    tone: 'success',
                    holdMs: 2500,
                    onDone: () => { setSavedToast(0) },
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
          : null,
      // 统一的「回到顶部」悬浮钮：挂在 page 滚动容器里一次，覆盖全部 tab（config / records / calendar / debug）。
      h(BackToTop, null),
    ),
    // 只读会话弹窗（决策 28）：叠在整页之上（z-index 1010）。挂在与整页并列的独立子树，
    // 其遮罩点击不会冒泡出去、误关整页。
    viewing !== null
      ? h(SessionViewModal, {
        t,
        heading: viewing.heading,
        // r12：标题任务名可点 ⇒ 查看档（弹窗标题的任务名那一段变按钮）。
        taskId: viewing.taskId,
        headingTask: viewing.headingTask,
        headingRest: viewing.headingRest,
        onOpenTask: openViewer,
        sessionId: viewing.sessionId,
        view: viewing.view,
        // 交付文件（决策 41/42 派发快照同源）：以实例 outputs 权威渲染弹窗「交付文件」区块，
        // 与宿主 timeline 快照里的 deliverables 合并去重，保证老/新任务都能展现。
        outputs: viewing.outputs,
        // U10：fork + 官方跳转（服务未就位时为 null ⇒ 弹窗不渲染「继续对话」按钮）。
        forkSession: forkSession ?? undefined,
        openHostSession: openHostSession ?? undefined,
        // U11：产出物预览（remote.workspaceFiles 未就位时 undefined ⇒ 链接降级纯文本）。
        // （弹窗内的 Office 链接不在此渲染——点链接走 onOpenFile 开页面级预览面，Office 预览在那里生效。）
        workspaceFiles: workspaceFiles ?? undefined,
        // 弹窗内所有文件链接 → 页面级唯一预览面（预览与弹窗互不干扰）。
        onOpenFile: canPreview ? (path: string) => { openFile(viewing.sessionId, path) } : undefined,
        // 接收区（2026-10-03）：上游依赖清单；「查看该会话」→ 直接换成本弹窗打开上游那一次。
        upstream: viewing.upstream ?? [],
        attached: viewing.attached ?? [],
        workspacePath: viewing.workspacePath ?? null,
        onClose: () => {
          const closed = viewing.sessionId
          const needArchive = viewing.didUnarchive === true
          applyViewing(null)   // 释放 retain 引用（唯一出口）
          setViewErr(null)
          if (needArchive) rearchive(closed)
        },
      })
      : null,
    // 查看会话失败提示条（固定底部中央，可读可关）：收编为共用 FloatingToast 的中性可关闭档
    // （U20 #5，2026-10-05）——反色实面 + 圆点 + 关闭钮，不自动消失，给用户时间读。
    viewErr !== null
      ? h(FloatingToast, {
          seq: 'view-err',
          tone: 'neutral',
          closable: true,
          text: viewErr,
          closeLabel: t('debugClose'),
          onDone: () => { setViewErr(null) },
        })
      : null,
    // 新建 / 编辑任务分栏（右侧**占布局的一列**：主窗口被推窄、不被遮盖；与预览 dock 可同时存在）。
    // 工作区 / 模型 = `GET /options` 的真实目录（P1）；前置任务 = 现有任务表（真数据）。
    editor !== null
      ? h(TaskEditorDrawer, { key: editor.id,
        t,
        overview,
        mode: editor.mode,
        draft: editor.draft,
        width: editorWidth,
        onWidthChange: changeEditorWidth,
        reserved: previewTaken,
        onChange: (next: TaskEditorDraft) => { setEditor({ ...editor, draft: next }) },
        workspaces: editorOptions.workspaces,
        models: editorOptions.models,
        tasks: editorTasks,
        currentTaskId: editor.mode === 'edit' ? editor.id : undefined,
        // 左列表拨片 → 右抽屉联动（2026-10-05）：把本任务 id 交给抽屉，让它从共享 store 取 enabled 同步。
        syncTaskId: editor.id,
        onClose: () => { setEditor(null) },
        onSave: (draft: TaskEditorDraft) => { void saveEditor(draft) },
        onDelete: editor.mode === 'edit' ? () => { void deleteEditorTask() } : undefined,
        saveError: editorError,
        history: editor.history,
        onRestoreVersion: (file: string) => { void restoreVersion(file) },
        onDeleteVersion: (file: string) => { void deleteVersion(file) },
        onToggleEnabled: (enabled: boolean) => toggleTaskEnabled(editor.id, enabled),
        // ── 查看 / 编辑两档（用户 2026-10-05）──────────────────────────────
        // 打开时停哪一档由 state 决定（卡片「编辑」/「＋新建」= edit；前置任务名点进来 = view）。
        initialView: editor.view,
        // 脏状态由抽屉单向上报（真源在抽屉内），这里只存进 ref 供「未保存冲突」判定用。
        onDirtyChange: (next: boolean) => { editorDirtyRef.current = next },
        // 未保存时切看别的任务：抽屉内联确认层（绝不引官方 Modal）。
        pendingView,
        onConfirmPendingView: confirmPendingView,
        onCancelPendingView: () => { setPendingView(null) },
        // 未保存时切去编辑另一个任务：同一套抽屉内联确认层（三选）。
        pendingEdit,
        onConfirmPendingEdit: confirmPendingEdit,
        onCancelPendingEdit: () => { setPendingEdit(null) },
        // 查看档里「任务会话 / 产出物」可点：走 U11 单一入口，未就位时 undefined ⇒ 降级不可点。
        onOpenSession: viewSession !== null
          ? (sessionId: string) => { void openView(sessionId) }
          : undefined,
        onOpenFile: canPreview ? openFile : undefined,
        // 查看档里点前置任务名 ⇒ 打开那个任务的查看档（r12：与卡片展开区口径一致）。
        onViewTask: openViewer,
        // r13：附件可点 ⇒ 传该任务在 overview 里的服务端解析结果（绝对路径 + 锚点会话，按 kind+name 配对）。
        resolvedAttachments: editor.mode === 'edit'
          ? overview.rows.find(item => item.id === editor.id)?.attachments
          : undefined,
        workspaceFiles,
        officeToPdf,
        workspaceAnchors: editorOptions.workspaceAnchors,
      })
      : null,
    // U11 页面级预览 dock：固定在屏幕最右侧，把整页（含会话弹窗）往左推；
    // 与弹窗互不遮盖、互不干扰——关弹窗预览仍在，收预览整页回满宽。
    preview !== null && workspaceFiles !== null
      ? h(FileBrowser, {
          key: `${preview.sessionId}:${preview.path}`,
          workspaceFiles,
          officeToPdf,
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
      const res = await fetchWithTimeout(`${DISPATCH_API_PREFIX}/snapshot`, { cache: 'no-store' })
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
      const res = await fetchWithTimeout(`${DISPATCH_API_PREFIX}/tasks`, {
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
  /** Office 预览：remote.officeToPdf 服务未就位时为 null。 */
  officeRef: () => OfficeToPdfFace | null
  onBack: () => void
}) {
  const { t, viewRef, forkRef, openRef, filesRef, officeRef, onBack } = props
  const scope = useSyncExternalStore(subscribeScope, getScopeValue)
  if (scope === null) {
    return h('div', { style: pageStyle },
      h('div', { style: panelHeaderStyle },
        h(Button, {
          variant: 'outline',
          size: 'sm',
          title: t('backToConversation'),
          onClick: onBack,
        }, `← ${t('backToConversation')}`),
        h('div', { style: panelTitleStyle }, t('panelTitle')),
      ),
      h('p', { style: hintStyle }, t('unavailable')),
    )
  }
  return h(TaskPage, { t, scope, onBack, viewSession: viewRef(), forkSession: forkRef(), openHostSession: openRef(), workspaceFiles: filesRef(), officeToPdf: officeRef() })
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
  // Office 预览（doc/docx/ppt/pptx）：remote.officeToPdf —— 官方把 Office 转成 PDF，我方再走既有 PDF 渲染。
  // 与 workspaceFiles 同款 dotted 注入（'remote' + 'remote.officeToPdf'）：只注 'remote' 会在命名空间
  // 刚挂上时就触发，此刻 officeToPdf 还没挂 ⇒ 探测永久失败（2026-09-28 真机同款根因）。
  // ⚠️ 宿主没装文档预览服务（dsh-office-to-pdf）时该服务根本不存在 ⇒ 回调不触发 ⇒ 保持 null
  // ⇒ Office 文件呈现「Office 预览不可用」（与官方提示同款），**不会**崩、也不会误报成「二进制不支持」。
  let officeToPdf: OfficeToPdfFace | null = null
  ctx.inject(['remote', 'remote.officeToPdf'], (sub) => {
    const rec = sub as unknown as Record<string, unknown>
    const remote = rec.remote as Record<string, unknown> | undefined
    const otp = rec['remote.officeToPdf'] ?? remote?.officeToPdf
    if (otp !== null && otp !== undefined && typeof (otp as OfficeToPdfFace).render === 'function') {
      officeToPdf = otp as OfficeToPdfFace
      console.info('[task-dispatch:client] remote.officeToPdf 已就位：Office（doc/docx/ppt/pptx）预览启用')
    } else {
      console.info('[task-dispatch:client] remote.officeToPdf 未就位：Office 文件显示「预览不可用」（宿主未启用文档预览服务）')
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

  // 宿主「插件」管理详情页（dsh 0.1.7 原生 plugins.bundle.config 槽，参考 dsh-session-title-pattern）：
  // 左侧「插件」按钮 → 已安装插件列表 → 点进本插件，宿主在上方渲染图标/名称/简介，
  // 下方本配置区渲染运行参数表单。key 必须与包名逐字相同（宿主用 ledger.bundles.has(pkg.name)
  // 判定是否渲染本配置区）。表单走自有 HTTP 通道（config-panel.tsx + host /config 路由），
  // 不依赖 unavailable 的 configForms（本插件配置刻意非 volatile）。
  ctx.inject(['slots'], (sub) => {
    sub.slots.inject('plugins.bundle.config', () =>
      sub.slots.register(
        { name: 'plugins.bundle.config', key: SETTINGS_NS, locale: LOCALE_NS },
        ConfigPanel,
      ),
    )
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
          officeRef: () => officeToPdf,
          onBack: () => { selectPanel(null) },
        }),
      ),
    )
  })
}
