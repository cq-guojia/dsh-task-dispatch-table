// dsh-task-dispatch-table：定时任务调度器宿主插件（可编译骨架）。
// 读任务定义 JSON → 按 cron/窗口/依赖判定 → 在指定工作区派发 agent 会话 → 监听会话事件对账 → SQLite 记状态。
// 调度层零大模型介入（PROGRESS 背景）；插件零业务逻辑——任务定义见 docs/examples。
import type {
  HostContext, HostLlm, HostLogger, HostSettings, HostWorkspaceRegistry, SettingsScope, z_any,
} from './host.js'
import { Config, ConfigDefaults, readConfigField, resolveStatePath } from './config.js'
import { isSafeAttachmentRef } from './attachment-allowlist.js'
import type { PluginConfig } from './config.js'
import type { TaskDefinition, TaskDefinitionInput } from './tasks.js'
import {
  ensureIdsInInlineJson, existingUuidIds, isUuid, newTaskId, nextSlotAfter, removeDefinitionInline, sessionTitleOf, setEnabledDefinitionInline, taskDefinitionSchema, titleOf,
  upsertDefinitionInline, validateDefinitionForSave,
} from './tasks.js'
import { parseInstanceSnapshot, TaskStore, type InstanceStatus, type PluginLogKind } from './store.js'
import {
  assetPaths, attachmentAbsPath, deleteSnapshot, deleteTaskAssets, deleteVersion, listSnapshots, listVersions,
  moveAttachmentsIn, purgeTmp, readSnapshot, readVersion, removeAttachmentFiles, saveSnapshot, saveVersion,
  type AssetPaths, type AttachmentRef,
} from './task-assets.js'
import * as fs from 'fs'
import path from 'path'
import { randomBytes } from 'crypto'
import { createReconciler } from './reconcile.js'
import type { ReconcileOptions } from './reconcile.js'
import { createScheduler } from './scheduler.js'
import type { Scheduler } from './scheduler.js'
import { createRuntimeIndex } from './runtime-index.js'
import type { RuntimeIndex, TaskOverviewRow } from './runtime-index.js'
import { createEventBus } from './event-bus.js'
import type { EventBus } from './event-bus.js'
import { EventType, HEARTBEAT_TYPE, runEventTypeOf } from './event-catalog.js'

export const name = 'dsh-task-dispatch-table'

/** 宿主服务依赖：以源码实际服务名为准（决策 15 / PROGRESS「已核实的 DSH 能力」）。
 * ⚠️ settings 不在此列：settings 服务以「带 register 面」或「惰性形态」两种组合入场，
 * 缺失 register 时硬性依赖会令 entry 卡死/崩；改由 apply 内 ctx.inject(['settings'], ...)
 * 订阅并在 register 就绪才激活（参照 dsh-context installSettings，决策 17 真机教训）。 */
export const inject = ['timer', 'agents', 'sessions', 'workspaceRegistry', 'sessionTitle', 'sessionProjections'] as const

export { Config, resolveStatePath }
export type { PluginConfig }

// ── 临时调试通道参数（决策 16 例外：完善 UI 后随面板一起回收）──
/** 告警环形缓冲上限（条）。 */
const DEBUG_WARN_LIMIT = 20
/** 快照最小写入间隔（毫秒）：会话事件逐条续租改 updated_at，不节流会写放大。 */
const DEBUG_WRITE_MIN_INTERVAL_MS = 2_000

/** 超过这个耗时就记一条 `[慢请求]`（2026-10-07 事故定位用）。 */
const SLOW_REQUEST_MS = 1_000
/**
 * 主线程阻塞检测的心跳间隔（ms）。
 * ⚠️ 2026-10-07 事故：日程 / 执行记录 / snapshot **同时** 8s 超时，客户端只看到「signal is aborted
 * without reason」（= 前端自己掐断的超时），**看不出是谁把进程占住**。Node 是单线程 ⇒ 任何一段
 * 同步重活（快照序列化 + SQLite 同步写 / 大范围查库 / cron 批量解析）都会让**所有** HTTP 请求排队。
 * 判据就是**定时器漂移**：本该 1s 一次的回调若 3s 才来 ⇒ 主线程被占了约 2s。
 */
const BLOCK_BEAT_MS = 1_000
/** 漂移超过它就记一条 `[主线程阻塞]`。 */
const BLOCK_REPORT_MS = 500
/** 当前在处理的 HTTP 请求数（配合 `[慢请求]` 看是不是「排队」而不是「慢」）。 */
let inflightRequests = 0
/** 观测条目上限（防止长时间运行把内存撑爆）。 */
const SERVER_NOTICE_LIMIT = 30
/**
 * **服务端观测缓冲**（2026-10-07 事故）：`[主线程阻塞]` / `[慢请求]` / `[路由异常]` 都进这里。
 *
 * ⚠️ 必须**同时**留在这条缓冲里，不能只写宿主日志：宿主的日志落盘在哪**我们不确定**，真机上
 * 出问题时用户根本不知道去哪儿抓。这条缓冲会并入 `/snapshot` 的 `warns` 字段 ⇒ **直接显示在插件
 * 调试页**（前端 `client/index.ts` 已有渲染），用户打开就能看到、能复制，不依赖找日志文件。
 * 模块级是为了让 **webServer** 与 **settings** 两个 inject 作用域都能写（它们互不可见）。
 */
let serverNotices: string[] = []
/**
 * 落库用的 store 取值器（apply 时注册；模块级函数拿不到 apply 内的 `storeRef`）。
 * ⚠️ **必须落库**：`serverNotices` 只是内存缓冲 —— 插件重载 / 宿主重启**立刻清空**，且只有 30 条、
 * 会被后续条目挤掉。真机出问题时用户往往隔一会儿才来看 ⇒ 必须落库 `plugin_log`（SQLite，**保留
 * 30 天**，且调试页会转储这张表）。
 * ⚠️ 是 `plugin_log` 而非 `task_log`：后者只收「未推进到执行那一步」的任务诊断（data-model.md §二）。
 */
let noticeStore: (() => TaskStore | null) | null = null
/** 一条待落库的观测（store 尚未就绪时先攒在这里）。 */
interface PendingNotice { level: 'info' | 'warn' | 'error'; kind: PluginLogKind; message: string }
/**
 * **尚未落库的观测**（2026-10-07 审计 🔴）：`fallbackScope` 的降级告警发生在 `new TaskStore` **之前**，
 * 那时 `noticeStore` 还是 null —— 原实现直接 return ⇒ 这条**最重要的**降级日志**永远进不了库**。
 * 现在先攒着，store 一就绪就回放。
 */
let pendingNotices: PendingNotice[] = []
function setNoticeStore(fn: () => TaskStore | null): void {
  noticeStore = fn
  // 回放启动早期攒下的（那时库还没打开）。
  const store = fn()
  if (store === null) return
  const queued = pendingNotices
  pendingNotices = []
  for (const item of queued) writePluginLog(store, item.level, item.kind, item.message)
}
/** dispose 时清空模块级观测状态：否则插件重载后旧条目会串进新实例。 */
function resetNotices(): void {
  serverNotices = []
  pendingNotices = []
  noticeStore = null
  lastNoticeAt = 0
  lastNoticeText = ''
}
/** 去重窗口：同一句话 5 秒内只记一次（防止「全体请求都慢」时把库写爆、也防止刷屏）。 */
const NOTICE_DEDUPE_MS = 5_000
let lastNoticeAt = 0
let lastNoticeText = ''
/** 真正落一行（走 store 的语义方法 ⇒ 自带异常隔离，见 `TaskStore.logInfo` 注释）。 */
function writePluginLog(
  store: TaskStore, level: 'info' | 'warn' | 'error', kind: PluginLogKind, message: string,
): void {
  if (level === 'error') store.logError(kind, message)
  else if (level === 'warn') store.logWarn(kind, message)
  else store.logInfo(kind, message)
}
/**
 * 「拿不到 store 引用」时（模块级函数 / inject 作用域之外）的**统一落库口子**。
 * @param kind - 见 `PluginLogKind`（store.ts）。
 * @param level - 缺省 `warn`；真出错的（tick 异常 / 路由异常）请显式传 `'error'`。
 */
function pushNotice(
  kind: PluginLogKind, message: string, level: 'info' | 'warn' | 'error' = 'warn',
): void {
  const line = `${new Date().toISOString()} ${message}`
  serverNotices.push(line)
  if (serverNotices.length > SERVER_NOTICE_LIMIT) serverNotices.shift()
  const store = noticeStore?.() ?? null
  if (store === null) {
    // 库还没就绪 ⇒ 攒着（见 pendingNotices 注释），不丢。
    if (pendingNotices.length < SERVER_NOTICE_LIMIT) pendingNotices.push({ level, kind, message })
    return
  }
  const now = Date.now()
  // ⚠️ 去重键带上 kind：两条不同 kind 的文案若碰巧相同，不该互相吞掉。
  const dedupeKey = `${kind} ${message}`
  if (dedupeKey === lastNoticeText && now - lastNoticeAt < NOTICE_DEDUPE_MS) return
  lastNoticeText = dedupeKey
  lastNoticeAt = now
  // ⚠️ **进 `plugin_log`，不是 `task_log`**（2026-10-07 订正）：这是进程级观测、不挂任何任务，
  // 而 `task_log` 只收「未推进到执行那一步」的任务诊断（design/data-model.md §二）。
  writePluginLog(store, level, kind, message)
}
/** 无变化时的强制心跳间隔：让面板时间戳持续刷新，证明宿主存活。 */
const DEBUG_FORCE_INTERVAL_MS = 5 * 60_000

/** SSE 心跳间隔（毫秒）：保活穿代理 + 及时发现对端已断。 */
const SSE_HEARTBEAT_MS = 20_000

/**
 * 单实例最多同时挂多少条推送连接。
 * 长连接**没有上限**时，本机任意进程（或任意能过闸门的页面）都能靠循环建连打满句柄 / 内存
 * （2026-10-07 安全审计 🟡）。这里给一个宽松上限兜底：正常使用（几个浏览器标签页）远够不着，
 * 超了直接 503 —— 客户端会按统一重连策略稍后重试，不会把页面打死。
 */
const SSE_MAX_CONNECTIONS = 32

/**
 * 推送连接的登记表：每打开一条 SSE 连接登记一个幂等清理函数。
 *
 * ⚠️ **必须是 apply 实例作用域，不能放模块级**（2026-10-06 审计）：模块级集合会被同一模块的多个
 * apply 实例共享 ⇒ 任一实例 dispose 时会把**另一个实例**刚建立的连接一起关掉（心跳被停、连接变哑）。
 */
type StreamRegistry = Set<() => void>

/**
 * 关掉登记表里的所有推送连接（插件 dispose 时调用）。
 * 宿主 dispose 会 `closeAllConnections()` 从而触发各 `res` 的 `close` ⇒ 通常自清；这里仍**显式兜一层**，
 * 免得宿主行为一变就悬挂心跳定时器（宿主文档亦建议主动清理）。
 */
function closeAllEventStreams(streams: StreamRegistry): void {
  for (const cleanup of [...streams]) {
    try { cleanup() } catch { /* 单条清理出错不影响其余 */ }
  }
  streams.clear()
}

/** settings 命名空间（与浏览器半侧的 SETTINGS_NS 同名，两侧按它配对）。 */
const SETTINGS_NS = 'dsh-task-dispatch-table'

// ── webServer 数据通道路由（照抄参考插件 dsh-task-board 的 host-routes 模式）──

/** 极简请求面（只取本插件用到的字段，避免依赖 @types/node）。 */
interface DispatchWebRequest {
  method?: string
  /** 原始 URL（宿主传入的是 Node IncomingMessage，带它；取查询参数用）。 */
  url?: string
  headers: Record<string, unknown>
  socket: { remoteAddress?: string }
  [Symbol.asyncIterator](): AsyncIterator<unknown>
}
/** 极简响应面。 */
interface DispatchWebResponse {
  writeHead: (code: number, headers: Record<string, string>) => unknown
  end: (data?: string) => unknown
  /**
   * 分块写出（SSE 流式用）。宿主 `WebRoute.handler` 收的是**原始 `http.ServerResponse`**
   * （`@deepseek-ai/dsh-host-webserver@0.2.0-rc.2` `lib/types/index.d.ts:37-38` 明写「may hold
   * the response open, e.g. SSE」）⇒ 运行时一定存在；此处声明为可选、运行时再判。
   */
  write?: (chunk: string) => unknown
}
/** WebRoute 最小形状（dsh-host-webserver 的 exact 路由，结构化兼容即可注册）。 */
interface DispatchWebRoute {
  kind: 'exact'
  path: string
  handler: (req: DispatchWebRequest, res: DispatchWebResponse) => void | Promise<void>
}

const DISPATCH_API_PREFIX = '/api/task-dispatch-table'
const DISPATCH_BODY_LIMIT = 1024 * 1024

const writeJson = (res: DispatchWebResponse, code: number, body: unknown): void => {
  res.writeHead(code, { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' })
  res.end(JSON.stringify(body))
}

/** 同源 / loopback 守卫：浏览器 fetch 必带与 Host 同源的 Origin；无 Origin 的只放行本机回环。 */
const isTrustedDispatchRequest = (req: DispatchWebRequest): boolean => {
  const origin = typeof req.headers.origin === 'string' ? req.headers.origin : undefined
  const host = typeof req.headers.host === 'string' ? req.headers.host : undefined
  if (origin === undefined) {
    const addr = req.socket.remoteAddress
    return addr === '127.0.0.1' || addr === '::1' || addr === '::ffff:127.0.0.1'
  }
  if (host === undefined) return false
  try { return new URL(origin).host === host } catch { return false }
}

const readDispatchBody = async (req: DispatchWebRequest): Promise<string> => {
  const chunks: unknown[] = []
  let size = 0
  for await (const chunk of req) {
    const buffer = chunk as Buffer
    size += buffer.length
    if (size > DISPATCH_BODY_LIMIT) throw new Error('body-too-large')
    chunks.push(buffer)
  }
  return Buffer.concat(chunks as Buffer[]).toString('utf8')
}

/** 同 readDispatchBody，但原样返回二进制 Buffer（上传附件用）。 */
const readDispatchBodyBuffer = async (req: DispatchWebRequest, limit: number): Promise<Buffer> => {
  const chunks: Buffer[] = []
  let size = 0
  for await (const chunk of req) {
    const buffer = chunk as Buffer
    size += buffer.length
    if (size > limit) throw new Error('body-too-large')
    chunks.push(buffer)
  }
  return Buffer.concat(chunks)
}

/** 附件约束（白名单/上限/扩展名解析）与浏览器端预检**共用同一份**，防两处漂移。 */
export { ATTACHMENT_MAX_BYTES, ALLOWED_ATTACHMENT_EXT, extOf } from './attachment-allowlist.js'
import { ATTACHMENT_MAX_BYTES, ALLOWED_ATTACHMENT_EXT, extOf } from './attachment-allowlist.js'

/** 文件名去路径 + 仅留安全字符，截断到 60，避免落盘文件名注入。 */
const sanitizeBase = (name: string): string => {
  const base = name.slice(Math.max(name.lastIndexOf('/'), name.lastIndexOf('\\')) + 1)
  const dot = base.lastIndexOf('.')
  const noExt = dot <= 0 ? base : base.slice(0, dot)
  const cleaned = noExt.replace(/[^a-zA-Z0-9._-]/g, '_').slice(0, 60)
  return cleaned === '' ? 'file' : cleaned
}

const safeDecode = (value: string): string => {
  try { return decodeURIComponent(value) } catch { return value }
}

/** 取查询参数（GET 路由用；宿主传入的 req 带 url）。 */
const queryOf = (req: DispatchWebRequest, key: string): string => {
  const url = req.url ?? ''
  const mark = url.indexOf('?')
  if (mark < 0) return ''
  return new URLSearchParams(url.slice(mark + 1)).get(key) ?? ''
}

/**
 * 从 tasksInline 反查「某工作区下的全部任务 id」（决策 55：workspace 过滤）。
 * `task_instances` / `task_log` 均无工作区列 ⇒ 由任务定义反查 task_id 集合再 `WHERE task_id IN`（不碰表结构）。
 * 只读展示面：解析失败 / 形状不符一律返回空数组（调用方据此返回空结果，不猜）。
 */
function workspaceTaskIdsOf(raw: string, workspace: string): string[] {
  try {
    const data: unknown = JSON.parse(raw.trim())
    if (!Array.isArray(data)) return []
    const out: string[] = []
    for (const item of data) {
      if (typeof item !== 'object' || item === null) continue
      const task = item as { id?: unknown; target?: unknown }
      const target = task.target
      if (typeof target !== 'object' || target === null) continue
      if (typeof task.id !== 'string') continue
      const ws = (target as { workspace?: unknown }).workspace
      if (typeof ws === 'string' && ws === workspace) out.push(task.id)
    }
    return out
  } catch {
    return []
  }
}

/** 从现有任务表里读出某任务的附件清单（附件搬移的「上一次」基准）。 */
function readAttachmentsOf(raw: string, id: string): AttachmentRef[] {
  try {
    const data = JSON.parse(raw.trim() === '' ? '[]' : raw) as unknown
    if (!Array.isArray(data)) return []
    const hit = data.find((item): item is Record<string, unknown> => (
      item !== null && typeof item === 'object' && (item as { id?: unknown }).id === id
    ))
    return hit !== undefined && Array.isArray(hit.attachments) ? hit.attachments as AttachmentRef[] : []
  } catch {
    return []
  }
}

/** 从现有任务表里读出某任务的**整份定义**（更新时保留「表单不管理的字段」用）。 */
function readDefinitionOf(raw: string, id: string): Record<string, unknown> | undefined {
  try {
    const data = JSON.parse(raw.trim() === '' ? '[]' : raw) as unknown
    if (!Array.isArray(data)) return undefined
    return data.find((item): item is Record<string, unknown> => (
      item !== null && typeof item === 'object' && (item as { id?: unknown }).id === id
    ))
  } catch {
    return undefined
  }
}

/**
 * 给「任务列表总览」里的附件补**绝对路径 + 预览锚点会话**（2026-10-03）。
 *
 * 背景：附件展示行本身只有 `{name, kind}`，前端点开预览需要绝对路径；而宿主
 * `remote.workspaceFiles.read` 允许读**工作区外的绝对路径**（只要给一个有效会话当锚点，
 * **不需要该会话属于目标文件所在工作区**）。故这里统一算出：
 *   - upload 型 = `attachmentAbsPath(assets, taskId, ref)`（落在插件数据根，工作区之外）；
 *   - link 型   = `<附件来源工作区 path>/<ref>`。
 * 锚点 = 附件来源工作区的最近会话，兜底「任一有会话的工作区的最近会话」。
 * 拿不到路径或锚点 ⇒ 该条只回 `{name, kind}`，前端保持不可点（绝不造假会话）。
 */
function attachmentsWithPaths(
  rows: readonly TaskOverviewRow[],
  tasks: readonly TaskDefinition[],
  assets: AssetPaths | null,
  registry: HostWorkspaceRegistry | null,
): TaskOverviewRow[] {
  if (registry === null) return [...rows]
  const byId = new Map(tasks.map(task => [task.id, task]))
  const workspaces = registry.list()
  const byTitle = new Map(workspaces.map(workspace => [workspace.title, workspace]))
  const anchorOf = (workspace: (typeof workspaces)[number] | undefined): string | undefined => {
    const sessions = workspace?.sessionIds
    return sessions !== undefined && sessions.length > 0 ? sessions[sessions.length - 1] : undefined
  }
  // 兜底锚点：只要**有任意一个会话**就能读已知绝对路径，不要求会话与文件同工作区。
  const anyAnchor = workspaces.map(anchorOf).find(anchor => anchor !== undefined)
  return rows.map(row => {
    const task = byId.get(row.id)
    const items = task?.attachments ?? []
    if (task === undefined || items.length === 0) return row
    const attachments = items.map(item => {
      const source = item.kind === 'link' ? byTitle.get(item.workspace ?? '') : byTitle.get(task.target.workspace)
      const anchorSessionId = anchorOf(source) ?? anyAnchor
      const absPath = item.kind === 'upload'
        ? (assets === null ? null : attachmentAbsPath(assets, task.id, item.ref))
        : (source === undefined ? null : path.join(source.path, item.ref))
      return anchorSessionId === undefined || absPath === null
        ? { name: item.name, kind: item.kind }
        : { name: item.name, kind: item.kind, path: absPath, anchorSessionId }
    })
    return { ...row, attachments }
  })
}

/**
 * 构造本插件的 webServer 路由（快照读 + 任务表写）。
 * @param runtimeRef - 宿主运行时数据 store（apply 内共用同一份）。
 * @param persistTasksInline - 任务表保存回调（写回 config profile）。
 */
/**
 * 整批 `tasksInline` 的**最小结构校验**：必须是「对象数组」（空串 = 清空，允许）。
 *
 * ⚠️ 2026-10-07 审计：身份闸门 `ensureIdsInInlineJson` 注释写着「非法 JSON / 非数组原样返回
 * （error=null）—— 那是既有校验的职责」，**但整批这条保存路径上并没有那道既有校验** ⇒ 非法 JSON /
 * 非数组 / 元素不是对象时会被**直接落盘成权威任务表**，运行时 `parseInlineTasks` 逐项解析失败
 * ⇒ **任务表整批消失，而且已持久化，每次启动都复现**（唯一会持久化丢数据的路径）。
 * 这里只补**形状**校验；逐字段合法性仍交给运行时逐条 warn 跳过（决策 30：运行时只认不修）。
 */
function checkTasksInlineShape(raw: string): string | null {
  const text = raw.trim()
  if (text === '') return null
  let data: unknown
  try { data = JSON.parse(text) } catch { return 'invalid-json' }
  if (!Array.isArray(data)) return 'not-an-array'
  for (const item of data) {
    if (typeof item !== 'object' || item === null || Array.isArray(item)) return 'item-not-an-object'
  }
  return null
}

const makeDispatchRoutes = (
  runtimeRef: { tasksInline: string; debugSnapshot: string },
  persistTasksInline: (json: string) => Promise<void>,
  /** 取状态库（settings inject 就绪后非空）；未就绪时 /db 返回 503。 */
  getStore: () => TaskStore | null,
  /** 取 workspaceRegistry（归档会话的临时反归档 / 回归档；任务表单的工作区下拉）。 */
  getRegistry: () => HostWorkspaceRegistry | null,
  /** 取 llm 服务（任务表单的模型下拉）；未挂载时返回 undefined。 */
  getLlm: () => HostLlm | undefined,
  /** 宿主日志（取证：反归档到底有没有跑、宿主有没有该面）。 */
  log: (msg: string) => void,
  /** 取附件落盘目录（settings inject 就绪后才有值：statePath 在那里定格）；未就绪时上传返回 503。 */
  getAttachmentsDir: () => string | null,
  /** 取任务文件资产根（state.db 同目录）；未就绪时版本 / 快照相关路由返回 503。 */
  getAssets: () => AssetPaths | null,
  /** 取插件配置（清道夫天数等）。 */
  getConfig: () => PluginConfig | null,
  /** 主界面运行态内存索引（2026-09-30：卡片「运行中 / 上次 / 下次」的读源，不查库）。 */
  runtimeIndex: RuntimeIndex,
  /** 当前任务定义（含停用）—— overview 组装用。 */
  getTasks: () => Map<string, TaskDefinition>,
  /**
   * 任务定义被改动后立刻同步快照（2026-09-30）：主界面「点了开关要立即生效」——
   * 否则要等下一个 tick 才把新定义同步给 overview，用户看到的就是「点了没反应」。
   */
  onDefinitionsChanged: () => void,
  /**
   * 取插件配置（运行期 live 合并值：base + 用户层）。设置页 GET 当前值用。
   * 注：本插件配置刻意非 volatile（rc.1 约束），官方 configForms 不可用，
   * 故设置页走本项目自有的 HTTP 通道读写，而非 configForms。
   */
  getScopeConfig: () => PluginConfig,
  /**
   * 写回插件配置（仅限计时类字段）。经 settings scope.update 合并进用户层并持久化，
   * scope.watch 即时生效（tickMs 重启 interval，其余字段 reconcile/scheduler 实时读 scope.get()）。
   */
  updateScopeConfig: (patch: Partial<PluginConfig>) => Promise<boolean>,
  /** 取调度器（「立即执行」用 runNow）；settings 未就绪时为 null ⇒ 路由回 503。 */
  getScheduler: () => Scheduler | null,
  /** 事件广播器（SSE 端点 `/events` 的订阅源）。 */
  bus: EventBus,
  /** 打开的推送连接登记表（**apply 实例作用域**：路由登记、dispose 统一关闭）。 */
  streams: StreamRegistry,
  /**
   * 取「附件解析版本」（惰性 getter）：并进 overview 响应的 rev，让「附件刚开始可点」这种
   * **不进内容 rev** 的变化也能被客户端看到（见 apply 内 `attachRev` 的注释）。
   */
  getAttachRev: () => number,
): DispatchWebRoute[] => [
  {
    // 附件上传（选择/上传交互：拖拽或本地文件 → 宿主落盘到插件数据目录，按原始名+随机尾缀、不覆盖累加）。
    // 原始文件名经 x-filename 头（URL 编码）传入，避免二进制体里夹带名字；扩展名走白名单。
    kind: 'exact',
    path: `${DISPATCH_API_PREFIX}/attachment`,
    handler: async (req, res) => {
      if (req.method !== 'POST') return writeJson(res, 405, { ok: false, error: 'method-not-allowed' })
      if (!isTrustedDispatchRequest(req)) return writeJson(res, 403, { ok: false, error: 'forbidden' })
      const dir = getAttachmentsDir()
      if (dir === null) return writeJson(res, 503, { ok: false, error: 'attachments-dir-not-ready' })
      const rawName = typeof req.headers['x-filename'] === 'string' ? (req.headers['x-filename'] as string) : ''
      const originalName = safeDecode(rawName)
      if (originalName === '') return writeJson(res, 400, { ok: false, error: 'filename-required' })
      const ext = extOf(originalName)
      if (!ALLOWED_ATTACHMENT_EXT.has(ext)) return writeJson(res, 415, { ok: false, error: 'file-type-not-allowed', ext })
      let buffer: Buffer
      try {
        buffer = await readDispatchBodyBuffer(req, ATTACHMENT_MAX_BYTES)
      } catch {
        return writeJson(res, 413, { ok: false, error: 'payload-too-large' })
      }
      if (buffer.length === 0) return writeJson(res, 400, { ok: false, error: 'empty-file' })
      const stored = `${sanitizeBase(originalName)}-${randomBytes(3).toString('hex')}${ext === '' ? '' : '.' + ext}`
      try {
        // 同步式落盘：本仓库 @types/node 的 fs 命名空间只有回调式重载（promise 版在 fs/promises），
        // 附件上传是低频操作，mkdirSync/writeFileSync 足够。
        fs.mkdirSync(dir, { recursive: true })
        fs.writeFileSync(path.join(dir, stored), buffer)
      } catch (error) {
        return writeJson(res, 500, { ok: false, error: 'write-failed', message: error instanceof Error ? error.message : String(error) })
      }
      writeJson(res, 200, { ok: true, ref: stored, name: originalName })
    },
  },
  {
    kind: 'exact',
    path: `${DISPATCH_API_PREFIX}/snapshot`,
    handler: (req, res) => {
      if (req.method !== 'GET') return writeJson(res, 405, { ok: false, error: 'method-not-allowed' })
      if (!isTrustedDispatchRequest(req)) return writeJson(res, 403, { ok: false, error: 'forbidden' })
      writeJson(res, 200, { ok: true, snapshot: runtimeRef.debugSnapshot, tasksInline: runtimeRef.tasksInline })
    },
  },
  {
    // 调试页数据通道：三张表原样导出（用户机器上没有 sqlite CLI，面板里直接看库）。
    kind: 'exact',
    path: `${DISPATCH_API_PREFIX}/db`,
    handler: (req, res) => {
      if (req.method !== 'GET') return writeJson(res, 405, { ok: false, error: 'method-not-allowed' })
      if (!isTrustedDispatchRequest(req)) return writeJson(res, 403, { ok: false, error: 'forbidden' })
      const store = getStore()
      if (store === null) return writeJson(res, 503, { ok: false, error: 'store-not-ready' })
      writeJson(res, 200, {
        ok: true,
        at: new Date().toISOString(),
        tables: TaskStore.DUMP_TABLES.map(name => store.dumpTable(name, 500)),
      })
    },
  },
  {
    // 任务保存 / 删除（2026-09-30）：
    //   POST   { tasksInline } = 整批（配置页 JSON 编辑，走身份闸门）
    //   POST   { task }        = 单条（新增 / 编辑表单：校验 → 附件落定 → 落库 → 版本 / 快照 → 审计）
    //   DELETE { id }          = 删除任务（定义摘掉 + 任务目录整删，实例 / 事件保留做审计）
    kind: 'exact',
    path: `${DISPATCH_API_PREFIX}/tasks`,
    handler: async (req, res) => {
      if (req.method !== 'POST' && req.method !== 'DELETE') return writeJson(res, 405, { ok: false, error: 'method-not-allowed' })
      if (!isTrustedDispatchRequest(req)) return writeJson(res, 403, { ok: false, error: 'forbidden' })
      try {
        const body = await readDispatchBody(req)
        const parsed = JSON.parse(body) as { tasksInline?: unknown; task?: unknown; id?: unknown }

        // ── 删除任务：**先落库、后删目录**（评审 P1#3：落库失败时不能已把文件删了）──
        if (req.method === 'DELETE') {
          const id = typeof parsed.id === 'string' ? parsed.id : ''
          if (!isUuid(id)) return writeJson(res, 400, { ok: false, error: 'id-required' })
          const rm = removeDefinitionInline(runtimeRef.tasksInline, id)
          if (rm.error !== null) return writeJson(res, 400, { ok: false, error: rm.error })
          const prevInline = runtimeRef.tasksInline
          runtimeRef.tasksInline = rm.json
          try {
            await persistTasksInline(rm.json)
          } catch (error) {
            runtimeRef.tasksInline = prevInline // 回滚内存，定义还在
            return writeJson(res, 500, { ok: false, error: 'persist-failed', message: error instanceof Error ? error.message : String(error) })
          }
          const paths = getAssets()
          if (paths !== null) deleteTaskAssets(paths, id)
          getStore()?.appendAudit({ taskId: id, action: 'task_deleted' })
          log(`任务 ${id} 已删除（定义已摘除，任务目录整删；执行记录保留）`)
          onDefinitionsChanged()
          return writeJson(res, 200, { ok: true, removed: rm.removed })
        }

        // ── 整批（配置页 JSON 编辑，身份闸门不变）──
        if (typeof parsed.tasksInline === 'string') {
          // ⚠️ 先过**形状**闸门（见 checkTasksInlineShape）：非法 JSON / 非数组 / 元素非对象一律 422 拒收。
          // 它们此前会「保存成功」并落盘 ⇒ 运行时整表解析失败 ⇒ 任务表消失且**已持久化**（2026-10-07 审计）。
          const shape = checkTasksInlineShape(parsed.tasksInline)
          if (shape !== null) return writeJson(res, 422, { ok: false, error: shape })
          const { json, changed, assigned, error } = ensureIdsInInlineJson(parsed.tasksInline, existingUuidIds(runtimeRef.tasksInline))
          if (error !== null) return writeJson(res, 422, { ok: false, error })
          runtimeRef.tasksInline = json
          await persistTasksInline(json)
          // 整批替换是最重的改动，审计不能缺（评审 P2#13）。
          getStore()?.appendAudit({ action: 'tasks_replaced', detail: { bytes: json.length, assigned: changed ? assigned : 0 } })
          onDefinitionsChanged()
          return writeJson(res, 200, { ok: true, assigned: changed ? assigned : 0 })
        }

        // ── 单条（新增 / 编辑表单）──
        if (parsed.task === null || typeof parsed.task !== 'object' || Array.isArray(parsed.task)) {
          return writeJson(res, 400, { ok: false, error: 'task-or-tasksInline-required' })
        }
        const store = getStore()
        const paths = getAssets()
        if (store === null || paths === null) return writeJson(res, 503, { ok: false, error: 'store-or-assets-not-ready' })

        // ① zod 全量校验（评审 P1#2：坏定义不能 200 假成功进权威表，之后运行时静默跳过）
        const checked = taskDefinitionSchema.safeParse(parsed.task)
        if (!checked.success) {
          const first = checked.error.issues[0]
          const where = first === undefined ? '' : `${first.path.join('.')}: `
          return writeJson(res, 422, { ok: false, error: `任务定义不合法（${where}${first?.message ?? '未知原因'}）` })
        }
        const def = checked.data as TaskDefinitionInput
        const existing = existingUuidIds(runtimeRef.tasksInline)
        const validation = validateDefinitionForSave(def, existing)
        if (validation.ok !== true) return writeJson(res, 422, { ok: false, error: validation.error })

        // ② 身份：带 UUID 且命中现有表 ⇒ 修改；否则**一律服务端生成新 id**——
        //    客户端给的 id 不采纳，闸门「UUID 不能凭空引入」不被表单通道旁路（评审 P2#10）。
        const incomingId = isUuid(def.id) ? def.id : null
        const isUpdate = incomingId !== null && existing.has(incomingId)
        const id = isUpdate ? incomingId : newTaskId()

        // ③ 附件搬移：**只搬不删**（评审 P1#3：真删延后到落库成功之后，否则落库失败时文件已没了）
        const prevAttachments = readAttachmentsOf(runtimeRef.tasksInline, id)
        const moved = moveAttachmentsIn(paths, id, def.attachments ?? [], prevAttachments)
        const finalDef: Record<string, unknown> = { ...def, id }
        // 创建时间（主界面卡片「创建于 X」）：**首次保存时写一次**，此后不改——
        // 改标题 / 改排期都不算重建；老定义没有它 ⇒ 卡片不显示这一行（不编造时间）。
        if (!isUpdate && def.createdAt === undefined) finalDef.createdAt = new Date().toISOString()
        if ((def.attachments ?? []).length > 0) finalDef.attachments = moved.attachments
        // ⑤ 表单不管理的字段：更新时从原定义**保留**（2026-09-30 专家团复核发现的「编辑即丢」）。
        //    这些字段执行 / 展示要用，但编辑表单没有入口 ⇒ 表单 JSON 天然不带，不保留就被抹掉：
        //    ① createdAt（卡片「创建于」消失）；② schedule.timezone（显式时区任务被改成宿主机本地时区，
        //    执行时刻整体偏移）；③ target.manual（任务手册引用被删，派发手册段随之消失）；
        //    ④ 自定义 cron 降级保存时表单只写 cron ⇒ 保留原 start / everyNWeeks（每 N 周的取模基准）。
        if (isUpdate) {
          const prev = readDefinitionOf(runtimeRef.tasksInline, id)
          if (prev !== undefined) {
            if (finalDef.createdAt === undefined && prev.createdAt !== undefined) finalDef.createdAt = prev.createdAt
            const finalTarget = (finalDef.target ?? {}) as Record<string, unknown>
            const prevTarget = (prev.target ?? {}) as Record<string, unknown>
            if (finalTarget.manual === undefined && prevTarget.manual !== undefined) finalTarget.manual = prevTarget.manual
            const finalSchedule = (finalDef.schedule ?? {}) as Record<string, unknown>
            const prevSchedule = (prev.schedule ?? {}) as Record<string, unknown>
            if (finalSchedule.timezone === undefined && prevSchedule.timezone !== undefined) finalSchedule.timezone = prevSchedule.timezone
            // 降级态（有 cron、没有结构化 ui）⇒ 表单没产出 start / everyNWeeks，从原定义保留。
            if (finalSchedule.cron !== undefined && finalSchedule.ui === undefined) {
              if (finalSchedule.start === undefined && prevSchedule.start !== undefined) finalSchedule.start = prevSchedule.start
              if (finalSchedule.everyNWeeks === undefined && prevSchedule.everyNWeeks !== undefined) finalSchedule.everyNWeeks = prevSchedule.everyNWeeks
            }
          }
        }

        // ④ 落库（定义先落：它是唯一权威）
        const up = upsertDefinitionInline(runtimeRef.tasksInline, finalDef as TaskDefinitionInput, { allowNew: true })
        if (up.error !== null) return writeJson(res, 422, { ok: false, error: up.error })
        runtimeRef.tasksInline = up.json
        await persistTasksInline(up.json)

        // ⑤ 落库成功 ⇒ 才真删被移除的附件文件
        const removeFailed = removeAttachmentFiles(paths, id, moved.removed)

        // ⑥ 版本 / 快照（变了才留；失败只告警，不回滚定义）
        let versionCreated = false
        let snapshotCreated = false
        const promptText = typeof finalDef.target === 'object' && finalDef.target !== null
          ? (finalDef.target as { prompt?: unknown }).prompt
          : undefined
        try { versionCreated = saveVersion(paths, id, typeof promptText === 'string' ? promptText : '', '').created } catch (error) {
          log(`任务 ${id} 提示词版本留档失败（不阻塞保存）：${error instanceof Error ? error.message : String(error)}`)
        }
        try { snapshotCreated = saveSnapshot(paths, id, finalDef).created } catch (error) {
          log(`任务 ${id} 配置快照留档失败（不阻塞保存）：${error instanceof Error ? error.message : String(error)}`)
        }

        // ⑦ 审计
        store.appendAudit({
          taskId: id,
          action: up.mode === 'create' ? 'task_created' : 'task_updated',
          detail: { versionCreated, snapshotCreated, attachments: moved.attachments.length },
        })
        if (versionCreated) store.appendAudit({ taskId: id, action: 'version_created' })
        for (const ref of moved.removed) store.appendAudit({ taskId: id, action: 'attachment_removed', detail: { ref } })
        for (const name of moved.missing) store.appendAudit({ taskId: id, action: 'attachment_missing', detail: { name } })

        const removedNames = moved.removed.map(ref => prevAttachments.find(item => item.ref === ref)?.name ?? ref)
        onDefinitionsChanged()
        writeJson(res, 200, {
          ok: true,
          mode: up.mode,
          id,
          versionCreated,
          snapshotCreated,
          missingAttachments: moved.missing,
          removedAttachments: removedNames,
          assetErrors: [...moved.errors, ...removeFailed],
      })
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error)
        writeJson(res, message === 'body-too-large' ? 413 : 400, { ok: false, error: message })
      }
    },
  },
  {
    // 启用开关实时写回（用户 2026-09-30：编辑态头部开关点了立即生效，不走整个保存链路）：
    //   POST { id, enabled } ⇒ 只改该任务定义的 enabled 字段并落库（定义不存在 = task-not-found）。
    kind: 'exact',
    path: `${DISPATCH_API_PREFIX}/tasks/enabled`,
    handler: async (req, res) => {
      if (req.method !== 'POST') return writeJson(res, 405, { ok: false, error: 'method-not-allowed' })
      if (!isTrustedDispatchRequest(req)) return writeJson(res, 403, { ok: false, error: 'forbidden' })
      try {
        const body = await readDispatchBody(req)
        const parsed = JSON.parse(body) as { id?: unknown; enabled?: unknown }
        const id = typeof parsed.id === 'string' ? parsed.id : ''
        if (!isUuid(id)) return writeJson(res, 400, { ok: false, error: 'id-required' })
        if (typeof parsed.enabled !== 'boolean') return writeJson(res, 400, { ok: false, error: 'enabled-required' })
        const r = setEnabledDefinitionInline(runtimeRef.tasksInline, id, parsed.enabled)
        if (r.error !== null) return writeJson(res, r.error === 'task-not-found' ? 404 : 400, { ok: false, error: r.error })
        if (r.changed) {
          const prevInline = runtimeRef.tasksInline
          runtimeRef.tasksInline = r.json
          try {
            await persistTasksInline(r.json)
          } catch (error) {
            runtimeRef.tasksInline = prevInline // 回滚内存，开关维持原值
            return writeJson(res, 500, { ok: false, error: 'persist-failed', message: error instanceof Error ? error.message : String(error) })
          }
          getStore()?.appendAudit({ taskId: id, action: 'task_updated', detail: { enabled: parsed.enabled } })
          log(`任务 ${id} 启用开关已实时写回：${parsed.enabled ? 'enabled' : 'disabled'}`)
          // 立即同步任务表快照 ⇒ 客户端紧接着拉的那一次 overview 就能拿到新值。
          onDefinitionsChanged()
        }
        writeJson(res, 200, { ok: true, id, enabled: parsed.enabled })
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error)
        writeJson(res, message === 'body-too-large' ? 413 : 400, { ok: false, error: message })
      }
    },
  },
  {
    // 立即执行（2026-10-03 用户拍板）：POST { id } ⇒ **提前触发一次调度**。
    // 语义与正常调度一致：串行 / 前置 / 工作区 / 附件任一不过 ⇒ **不建执行记录**，
    // 只把原因回给前端（手动触发者看不到后台日志，必须让它知道「没执行成功 + 为什么」）。
    // 全通过则写一条 dispatched + run_type='manual' 的记录，由下一轮 Loop B 发动。
    kind: 'exact',
    path: `${DISPATCH_API_PREFIX}/tasks/run`,
    handler: async (req, res) => {
      if (req.method !== 'POST') return writeJson(res, 405, { ok: false, error: 'method-not-allowed' })
      if (!isTrustedDispatchRequest(req)) return writeJson(res, 403, { ok: false, error: 'forbidden' })
      const scheduler = getScheduler()
      if (scheduler === null) return writeJson(res, 503, { ok: false, error: 'not-ready' })
      try {
        const body = await readDispatchBody(req)
        const parsed = JSON.parse(body) as { id?: unknown }
        const id = typeof parsed.id === 'string' ? parsed.id : ''
        if (!isUuid(id)) return writeJson(res, 400, { ok: false, error: 'id-required' })
        const result = scheduler.runNow(id)
        // 业务性拒绝（前置未达标 / 正在执行 / 工作区缺失…）**不是 HTTP 错误** ⇒ 一律 200 + ok:false，
        // 前端按 error 码拼人话 Toast（用户拍板：要让手动触发者看到「没执行成功 + 原因」）。
        if (!result.ok) return writeJson(res, 200, { ok: false, error: result.error, detail: result.detail })
        return writeJson(res, 200, { ok: true, instanceId: result.instanceId })
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error)
        return writeJson(res, message === 'body-too-large' ? 413 : 400, { ok: false, error: message })
      }
    },
  },
  {
    // 主界面任务列表数据（2026-09-30，design/features/main-panel.md §四）：
    // **一次请求出全部卡片数据** = 任务定义投影 + 内存运行态（运行中 / 上次执行 / 下次执行）。
    // **不查库**：运行态全在内存摘要里（启动一条聚合 SQL 建索引 + Loop A/B 事件增量维护），
    // 定义指纹变了才重算刻度、刻度过期才就地前移 ⇒ 10 秒轮询的成本是一次内存遍历。
    // `?rev=` 带上一次的版本号：未变即回 unchanged（几十字节）。
    // ⚠️ 该参数只是省流量，**功能不依赖它**——宿主若不透传 query（`req.url` 是否带 query
    // 评审后仍无法离线核实，见 worklog/creation-edit-implementation.md），则 rev 取不到 ⇒
    // 照常返回全量，行为完全一致。
    kind: 'exact',
    path: `${DISPATCH_API_PREFIX}/tasks/overview`,
    handler: (req, res) => {
      if (req.method !== 'GET') return writeJson(res, 405, { ok: false, error: 'method-not-allowed' })
      if (!isTrustedDispatchRequest(req)) return writeJson(res, 403, { ok: false, error: 'forbidden' })
      const nowMs = Date.now()
      const tasks = [...getTasks().values()]
      const { rev, rows } = runtimeIndex.overview(tasks, nowMs)
      const tickMs = getConfig()?.tickMs ?? 60_000
      const asked = queryOf(req, 'rev')
      // ⚠️ 响应的 `rev` 是**复合版本** `<内容 rev>.<附件解析 rev>`（2026-10-07 审计 🔴）：
      // 附件行的 `path` / 锚点是 HTTP 层补的、不进内容 rev ⇒ 只用内容 rev 会漏掉「附件刚开始可点」
      // 这类变化，客户端永远收到 unchanged。客户端把 rev 当**不透明字符串**原样带回，故协议无需改。
      const version = `${rev}.${getAttachRev()}`
      // `unchanged` 里**也回** `now` / `tickMs`（2026-10-07 审计 🟡）：这两个字段不进 rev
      // （改巡检间隔不会 bump），若早退时不回，客户端就永远拿不到新值。
      if (asked !== '' && asked === version) {
        return writeJson(res, 200, { ok: true, unchanged: true, rev: version, now: nowMs, tickMs })
      }
      // `now` / `tickMs` 供客户端做「到点钳位」（排序抖动，2026-09-30）：`now` = 服务端当前时间
      // （客户端时钟可能与宿主有时差，判定「上一版刻度是否已过去」以它为准）；`tickMs` = 巡检间隔
      // （钳位时长跟着它走，不写死）。两者都是**只读**展示/排序辅助，不参与调度。
      // 附件补绝对路径 + 预览锚点（2026-10-03）：见 `attachmentsWithPaths`，让基础信息左栏的附件可点开。
      writeJson(res, 200, {
        ok: true, rev: version, tasks: attachmentsWithPaths(rows, tasks, getAssets(), getRegistry()),
        now: nowMs, tickMs,
      })
    },
  },
  {
    // 版本 / 快照列表（编辑态「历史版本」面板）：GET /tasks/history?id=<uuid>
    kind: 'exact',
    path: `${DISPATCH_API_PREFIX}/tasks/history`,
    handler: (req, res) => {
      if (req.method !== 'GET') return writeJson(res, 405, { ok: false, error: 'method-not-allowed' })
      if (!isTrustedDispatchRequest(req)) return writeJson(res, 403, { ok: false, error: 'forbidden' })
      const paths = getAssets()
      if (paths === null) return writeJson(res, 503, { ok: false, error: 'assets-not-ready' })
      const id = queryOf(req, 'id')
      if (!isUuid(id)) return writeJson(res, 400, { ok: false, error: 'id-required' })
      writeJson(res, 200, {
        ok: true,
        versions: listVersions(paths, id),
        snapshots: listSnapshots(paths, id),
      })
    },
  },
  {
    // 版本 / 快照内容与删除：
    //   GET    /tasks/history/item?id=&kind=prompt|snapshot&file=   ⇒ 内容（找回时用它回填表单）
    //   DELETE /tasks/history/item?id=&kind=&file=                  ⇒ 用户自己删（系统从不自动删）
    kind: 'exact',
    path: `${DISPATCH_API_PREFIX}/tasks/history/item`,
    handler: (req, res) => {
      if (req.method !== 'GET' && req.method !== 'DELETE') return writeJson(res, 405, { ok: false, error: 'method-not-allowed' })
      if (!isTrustedDispatchRequest(req)) return writeJson(res, 403, { ok: false, error: 'forbidden' })
      const paths = getAssets()
      if (paths === null) return writeJson(res, 503, { ok: false, error: 'assets-not-ready' })
      const id = queryOf(req, 'id')
      const kind = queryOf(req, 'kind')
      const file = queryOf(req, 'file')
      if (!isUuid(id) || file === '') return writeJson(res, 400, { ok: false, error: 'id-and-file-required' })
      if (req.method === 'DELETE') {
        const gone = kind === 'snapshot' ? deleteSnapshot(paths, id, file) : deleteVersion(paths, id, file)
        if (gone) getStore()?.appendAudit({ taskId: id, action: kind === 'snapshot' ? 'snapshot_deleted' : 'version_deleted', detail: { file } })
        return writeJson(res, 200, { ok: true, deleted: gone })
      }
      const content = kind === 'snapshot' ? readSnapshot(paths, id, file) : readVersion(paths, id, file)
      if (content === null) return writeJson(res, 404, { ok: false, error: 'not-found' })
      return writeJson(res, 200, { ok: true, content })
    },
  },
  {
    // 任务表单的下拉数据面（P1）：真实工作区 + 真实模型目录，只读、不写任何东西。
    // ⚠️ 只给「宿主真实存在的」——拿不到就是拿不到（返回空数组 + degraded 标记），不塞兜底假值。
    kind: 'exact',
    path: `${DISPATCH_API_PREFIX}/options`,
    handler: async (req, res) => {
      if (req.method !== 'GET') return writeJson(res, 405, { ok: false, error: 'method-not-allowed' })
      if (!isTrustedDispatchRequest(req)) return writeJson(res, 403, { ok: false, error: 'forbidden' })
      const registry = getRegistry()
      const llm = getLlm()
      const workspaces = registry === null
        ? []
        // value 用 **title**：`resolveWorkspace`（src/dispatch.ts:33-35）就是按 title 精确匹配、id 兜底。
        // anchorSessionId = 该工作区最近一个会话（entity.sessionIds 末位，官方 0.2.0-rc.1 已核实；
        // 含归档会话槽位 ⇒ scope 解析无需激活 agent）——客户端「选择工作区文件」的浏览锚点。
        // 没有会话的工作区不下发该字段（客户端显示「无历史会话」空态，不造假会话）。
        : registry.list().map(workspace => {
          const sessions = workspace.sessionIds
          const anchorSessionId = sessions !== undefined && sessions.length > 0 ? sessions[sessions.length - 1] : undefined
          return { title: workspace.title, path: workspace.path, anchorSessionId }
        })
      const models: { provider: string; id: string; name: string }[] = []
      try {
        for (const provider of llm?.listProviders() ?? []) {
          try {
            // 模型目录是 advisory（host.ts:157-163）：单个 provider 失败不影响其他。
            for (const model of await llm!.listModels(provider.id)) {
              models.push({ provider: model.provider, id: model.id, name: model.name })
            }
          } catch (error) {
            log(`[表单下拉] provider ${provider.id} 取模型目录失败：${error instanceof Error ? error.message : String(error)}`)
          }
        }
      } catch (error) {
        log(`[表单下拉] 枚举 provider 失败：${error instanceof Error ? error.message : String(error)}`)
      }
      if (registry === null) log('[表单下拉] workspaceRegistry 未就绪 ⇒ 工作区下拉为空')
      if (llm === undefined) log('[表单下拉] 宿主无 llm 服务 ⇒ 模型下拉为空（不填模型仍走决策 22 漏斗）')
      // 宿主真实时区（Intl 解出来）。UI 按用户 2026-09-29 的决定**不再让选时区**（一律跟随宿主），
      // 这里保留下发：排期判定本来就走宿主时区，将来若要显式指定时区，直接接上即可。
      let timezone = ''
      try {
        timezone = Intl.DateTimeFormat().resolvedOptions().timeZone ?? ''
      } catch (error) {
        log(`[表单下拉] 解不出宿主时区：${error instanceof Error ? error.message : String(error)}`)
      }
      writeJson(res, 200, {
        ok: true,
        workspaces,
        models,
        timezone,
        /** 客户端据此区分「真的没有」与「面没接上」，UI 上不撒谎。 */
        degraded: { workspaces: registry === null, models: llm === undefined },
      })
    },
  },
  {
    // 归档会话查看：当前宿主把归档会话标为 inactive（sessions.binding 返回空、
    // uiConversation.binding 抛 inactive session）⇒ 查看前先反归档让它恢复可读。
    kind: 'exact',
    path: `${DISPATCH_API_PREFIX}/session/unarchive`,
    handler: async (req, res) => {
      if (req.method !== 'POST') return writeJson(res, 405, { ok: false, error: 'method-not-allowed' })
      if (!isTrustedDispatchRequest(req)) return writeJson(res, 403, { ok: false, error: 'forbidden' })
      try {
        const parsed = JSON.parse(await readDispatchBody(req)) as { sessionId?: unknown }
        if (typeof parsed.sessionId !== 'string' || parsed.sessionId === '') {
          return writeJson(res, 400, { ok: false, error: 'sessionId-required' })
        }
        const registry = getRegistry()
        if (registry === null) {
          log(`[查看会话] 反归档 ${parsed.sessionId}：registry 未就绪`)
          return writeJson(res, 503, { ok: false, error: 'registry-not-ready' })
        }
        if (typeof registry.unarchiveSession !== 'function') {
          log(`[查看会话] 反归档 ${parsed.sessionId}：宿主无 unarchiveSession 面（B 方案不可用）`)
          return writeJson(res, 501, { ok: false, error: 'unarchiveSession-unavailable：当前宿主版本无该面' })
        }
        await registry.unarchiveSession(parsed.sessionId)
        log(`[查看会话] 反归档 ${parsed.sessionId} 成功`)
        writeJson(res, 200, { ok: true })
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error)
        writeJson(res, message === 'body-too-large' ? 413 : 400, { ok: false, error: message })
      }
    },
  },
  {
    // 关闭弹窗后把会话归档回去，平时列表依旧干净。
    kind: 'exact',
    path: `${DISPATCH_API_PREFIX}/session/archive`,
    handler: async (req, res) => {
      if (req.method !== 'POST') return writeJson(res, 405, { ok: false, error: 'method-not-allowed' })
      if (!isTrustedDispatchRequest(req)) return writeJson(res, 403, { ok: false, error: 'forbidden' })
      try {
        const parsed = JSON.parse(await readDispatchBody(req)) as { sessionId?: unknown }
        if (typeof parsed.sessionId !== 'string' || parsed.sessionId === '') {
          return writeJson(res, 400, { ok: false, error: 'sessionId-required' })
        }
        const registry = getRegistry()
        if (registry === null) {
          log(`[查看会话] 回归档 ${parsed.sessionId}：registry 未就绪`)
          return writeJson(res, 503, { ok: false, error: 'registry-not-ready' })
        }
        await registry.archiveSession(parsed.sessionId)
        log(`[查看会话] 回归档 ${parsed.sessionId} 成功`)
        writeJson(res, 200, { ok: true })
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error)
        writeJson(res, message === 'body-too-large' ? 413 : 400, { ok: false, error: message })
      }
    },
  },
  // —— 插件设置页（基础信息 + 计时参数）HTTP 通道 ——
  // 本插件配置刻意非 volatile，官方 configForms 不可用，故设置表单走自有 HTTP 通道读写。
  // ⚠️ **GET / POST 必须合在一条路由里**：宿主 webServer 对重复 (kind, path) 注册**直接 throw**
  // （@deepseek-ai/dsh-host-webserver@0.2.0-rc.2 `lib/index.js` register：`duplicate exact route`），
  // 拆两条会在第二条抛错、把注册循环打断 ⇒ 其后的路由全部注册不上（2026-10-02 真机三面板 404 根因）。
  {
    kind: 'exact',
    path: `${DISPATCH_API_PREFIX}/config`,
    handler: async (req, res) => {
      if (req.method !== 'GET' && req.method !== 'POST') {
        writeJson(res, 405, { ok: false, error: 'method-not-allowed' })
        return
      }
      if (!isTrustedDispatchRequest(req)) {
        writeJson(res, 403, { ok: false, error: 'forbidden' })
        return
      }
      // GET = 读当前计时参数（设置页回填）。
      if (req.method === 'GET') {
        const config = getScopeConfig()
        writeJson(res, 200, {
          ok: true,
          config: {
            tickMs: config.tickMs,
            dispatchGraceMs: config.dispatchGraceMs,
            leaseMs: config.leaseMs,
            unknownGraceMs: config.unknownGraceMs,
          },
        })
        return
      }
      // POST = 写回（仅限计时字段，范围校验后经 scope.update 落盘并即时生效）。
      try {
        const body = JSON.parse(await readDispatchBody(req)) as Record<string, unknown>
        const allowed = ['tickMs', 'dispatchGraceMs', 'leaseMs', 'unknownGraceMs'] as const
        const patch: Record<string, number> = {}
        for (const key of allowed) {
          const raw = body[key]
          if (raw === undefined) continue
          if (typeof raw !== 'number' || !Number.isFinite(raw)) {
            writeJson(res, 400, { ok: false, error: `invalid-${key}` })
            return
          }
          // 下限 1s、上限 7 天，避免误填把调度器打挂。
          if (raw < 1000 || raw > 7 * 24 * 3600 * 1000) {
            writeJson(res, 400, { ok: false, error: `out-of-range-${key}` })
            return
          }
          patch[key] = raw
        }
        if (Object.keys(patch).length === 0) {
          writeJson(res, 400, { ok: false, error: 'empty-patch' })
          return
        }
        const ok = await updateScopeConfig(patch)
        if (!ok) {
          writeJson(res, 503, { ok: false, error: 'update-failed' })
          return
        }
        // ⚠️ **这里不广播**：`CONFIG_CHANGED` 的唯一发射点是 `scope.watch`（降级作用域的 `watch`
        // 也已如实实现）⇒ 一次成功写回**恰好一条**事件，不靠广播器的合并窗口去吃掉重复。
        // （2026-10-06 改正：此前这里补发一条，正常路径会「一次改动发两次」。）
        const config = getScopeConfig()
        writeJson(res, 200, {
          ok: true,
          config: {
            tickMs: config.tickMs,
            dispatchGraceMs: config.dispatchGraceMs,
            leaseMs: config.leaseMs,
            unknownGraceMs: config.unknownGraceMs,
          },
        })
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error)
        writeJson(res, message === 'body-too-large' ? 413 : 400, { ok: false, error: message })
      }
    },
  },
  {
    // 按任务 / 工作区检索执行记录（任务卡片「执行记录」面板 + 未来总查询页共用，决策 55）：
    //   GET /tasks/instances?taskId=&workspace=&status=a,b&from=&to=&cursor=&limit=&light=1
    //   `light=1` = 轻量模式（任务日程日历页用）：行不含 `snapshot`、不做会话名富化、不分页、
    //   上限 3000，触及上限回 `truncated: true`（页面据此提示收窄过滤）。
    // workspace 过滤：`task_instances` 无工作区列 ⇒ 由 tasksInline 反查 task_id 集合（不碰表结构）。
    // ⚠️ taskId 与 workspace **同时给时两者叠加（AND）**，2026-10-04 评审修正：此前是「taskId 优先」，
    // 结果在总查询页里会出现「工作区筛了 B、返回的却是 A 工作区那条任务」的记录（静默失效）。
    // 该工作区下**没有任何任务**时 `taskIds` 为空数组 ⇒ 必须显式判成「查不到」（否则退化成不过滤，返回全表）。
    kind: 'exact',
    path: `${DISPATCH_API_PREFIX}/tasks/instances`,
    handler: (req, res) => {
      if (req.method !== 'GET') return writeJson(res, 405, { ok: false, error: 'method-not-allowed' })
      if (!isTrustedDispatchRequest(req)) return writeJson(res, 403, { ok: false, error: 'forbidden' })
      const store = getStore()
      if (store === null) return writeJson(res, 503, { ok: false, error: 'store-not-ready' })
      const taskId = queryOf(req, 'taskId') || undefined
      // 按会话 id 取（2026-10-03）：会话弹窗只拿得到会话 id ⇒ 自取实例行（快照 / 产出），
      // 保证「从哪进都同一个渲染」；一个会话最多一条实例行。
      const sessionId = queryOf(req, 'sessionId') || undefined
      const workspace = queryOf(req, 'workspace') || undefined
      const statusRaw = queryOf(req, 'status')
      // 逗号分隔多状态；非法值不拦——IN 子句参数化，查不到即为空，无注入面。
      const statuses = statusRaw === '' ? undefined : (statusRaw.split(',').filter(s => s !== '') as InstanceStatus[])
      const limitRaw = queryOf(req, 'limit')
      const limit = limitRaw === '' || !Number.isFinite(Number(limitRaw)) ? undefined : Number(limitRaw)
      // 给了 workspace 就必须按它过滤：命中 0 个任务 ⇒ 用恒假条件收口（空数组不能被当成「不过滤」）。
      const workspaceIds = workspace === undefined
        ? undefined
        : workspaceTaskIdsOf(runtimeRef.tasksInline, workspace)
      const taskIds = workspaceIds === undefined || workspaceIds.length > 0 ? workspaceIds : ['__none__']
      // 轻量模式（「任务日程」日历页按月取数用，2026-10-05）：**同一套过滤条件**，只换掉行的内容与上限。
      //   ① 行不含 `snapshot`（派发快照，单行 1.5–4 KB；日历一次取满整月，带上它是数 MB 的白给开销）；
      //   ② 不做 `session_title` 富化（那要逐行 JSON.parse(snapshot)，几千行即几千次 parse；
      //      日历上的任务名由客户端从任务定义本地映射）；
      //   ③ 上限放宽到 3000、不分页，触及上限回 `truncated: true` ⇒ 页面提示收窄过滤，不静默丢。
      if (queryOf(req, 'light') === '1') {
        const lite = store.listInstancesLite({
          taskId, sessionId, taskIds, statuses,
          fromTs: queryOf(req, 'from') || undefined,
          toTs: queryOf(req, 'to') || undefined,
          limit,
        })
        return writeJson(res, 200, { ok: true, rows: lite.rows, truncated: lite.truncated })
      }
      const page = store.listInstancesByQuery({
        taskId,
        sessionId,
        taskIds,
        statuses,
        fromTs: queryOf(req, 'from') || undefined,
        toTs: queryOf(req, 'to') || undefined,
        cursor: queryOf(req, 'cursor') || undefined,
        limit,
      })
      // 会话弹窗场景（带 sessionId）：顺带把**附加文件的绝对路径**解析出来一起给（2026-10-03）。
      // 为什么必须服务端给：upload 型落在插件数据目录（客户端根本不知道 statePath），
      // link 型的基准是**工作区 title**（客户端没有 title → path 映射）⇒ 不给就点不开。
      //
      // 三条硬规矩（专家团评审 2026-10-03）：
      // ① **不猜路径**：`workspace` 非空却查不到该工作区 ⇒ null（**绝不**回退成任务工作区去拼，
      //    那会拼出一个「存在但指向别的文件」的假路径）；`workspace` 为空才走快照 workspacePath。
      // ② `ref` 必须过安全校验（同 schduler / reconcile / dispatch 三处口径）。
      // ③ **按 ref 配对下发**（不是按序）：两端过滤规则不同时按序会整体错位、点开错文件。
      const taskTitleById = new Map([...getTasks().values()].map(task => [task.id, titleOf(task)]))
      const rows = page.rows.map(row => {
        const snap = parseInstanceSnapshot(row.snapshot ?? null)
        // 会话名（决策 42）：与派发时 `sessionTitle.rename` 用同一份 `sessionTitleOf`（单源），
        // 标题取派发快照（当时那份）；旧行无快照回退当前任务标题。
        const name = snap?.title ?? taskTitleById.get(row.task_id) ?? ''
        const enriched = {
          ...row,
          session_title: name === '' ? null : sessionTitleOf(row.scheduled_at, name, row.attempt),
        }
        if (sessionId === undefined) return enriched
        const assets = getAssets()
        const registry = getRegistry()
        const workspaces = registry === null ? [] : registry.list()
        return {
          ...enriched,
          attachmentPaths: (snap?.attachments ?? []).map(item => {
            if (!isSafeAttachmentRef(item.ref)) return { ref: item.ref, path: null }
            if (item.kind === 'upload') {
              return { ref: item.ref, path: assets === null ? null : attachmentAbsPath(assets, row.task_id, item.ref) }
            }
            // link 型：基准 = 附件**来源**工作区（title 优先、id 兜底，与 dispatch.resolveWorkspace 同口径）
            const source = item.workspace
            const base = source === undefined || source === ''
              ? snap?.workspacePath ?? null
              : workspaces.find(workspace => workspace.title === source)?.path
                ?? workspaces.find(workspace => workspace.id === source)?.path
                ?? null
            return { ref: item.ref, path: base === null ? null : path.join(base, item.ref) }
          }),
        }
      })
      writeJson(res, 200, { ok: true, rows, nextCursor: page.nextCursor })
    },
  },
  {
    // 按任务 / 工作区检索诊断日志（任务卡片「日志」面板 + 未来总查询页共用，决策 55）：
    //   GET /tasks/log?taskId=&workspace=&level=error,warn&keyword=&from=&to=&cursor=&limit=
    // keyword = message 子串（LIKE %kw%，参数化）；`task_id` 为 NULL 的启动汇总行不命中按任务 / 工作区过滤（符合直觉）。
    kind: 'exact',
    path: `${DISPATCH_API_PREFIX}/tasks/log`,
    handler: (req, res) => {
      if (req.method !== 'GET') return writeJson(res, 405, { ok: false, error: 'method-not-allowed' })
      if (!isTrustedDispatchRequest(req)) return writeJson(res, 403, { ok: false, error: 'forbidden' })
      const store = getStore()
      if (store === null) return writeJson(res, 503, { ok: false, error: 'store-not-ready' })
      const taskId = queryOf(req, 'taskId') || undefined
      const workspace = queryOf(req, 'workspace') || undefined
      const levelRaw = queryOf(req, 'level')
      const levels = levelRaw === '' ? undefined : levelRaw.split(',').filter(s => s !== '')
      const limitRaw = queryOf(req, 'limit')
      const limit = limitRaw === '' || !Number.isFinite(Number(limitRaw)) ? undefined : Number(limitRaw)
      // 给了 workspace 就必须按它过滤：命中 0 个任务 ⇒ 用恒假条件收口（空数组不能被当成「不过滤」）。
      const workspaceIds = workspace === undefined
        ? undefined
        : workspaceTaskIdsOf(runtimeRef.tasksInline, workspace)
      const taskIds = workspaceIds === undefined || workspaceIds.length > 0 ? workspaceIds : ['__none__']
      const page = store.listLogsByQuery({
        taskId,
        taskIds,
        levels,
        keyword: queryOf(req, 'keyword') || undefined,
        fromTs: queryOf(req, 'from') || undefined,
        toTs: queryOf(req, 'to') || undefined,
        cursor: queryOf(req, 'cursor') || undefined,
        limit,
      })
      writeJson(res, 200, { ok: true, rows: page.rows, nextCursor: page.nextCursor })
    },
  },
  {
    // 某次执行的事件时间线（执行记录下钻，决策 55）：GET /tasks/events?instanceId=<uuid>
    // legacy `records` 标签从全局 debugSnapshot（最近 200 条）里捞 ⇒ 按任务面板改走按实例精确取。
    kind: 'exact',
    path: `${DISPATCH_API_PREFIX}/tasks/events`,
    handler: (req, res) => {
      if (req.method !== 'GET') return writeJson(res, 405, { ok: false, error: 'method-not-allowed' })
      if (!isTrustedDispatchRequest(req)) return writeJson(res, 403, { ok: false, error: 'forbidden' })
      const store = getStore()
      if (store === null) return writeJson(res, 503, { ok: false, error: 'store-not-ready' })
      const instanceId = queryOf(req, 'instanceId')
      if (instanceId === '') return writeJson(res, 400, { ok: false, error: 'instanceId-required' })
      writeJson(res, 200, { ok: true, events: store.listEventsByInstance(instanceId) })
    },
  },
  {
    // 事件推送（SSE）：后端变更即时广播、前端 EventSource 订阅（design/event-push.md）。
    // 宿主 handler 持有响应生命周期（dsh-host-webserver@0.2.0-rc.2 明支持 SSE，gzip 中间件亦跳过
    // text/event-stream）；同源闸门与其它路由一致——EventSource 不能带自定义头，但本闸门不需要。
    kind: 'exact',
    path: `${DISPATCH_API_PREFIX}/events`,
    handler: (req, res) => {
      if (req.method !== 'GET') return writeJson(res, 405, { ok: false, error: 'method-not-allowed' })
      if (!isTrustedDispatchRequest(req)) return writeJson(res, 403, { ok: false, error: 'forbidden' })
      // 连接数兜底（见 SSE_MAX_CONNECTIONS）：超限直接 503，客户端会按统一重连策略稍后重试。
      if (streams.size >= SSE_MAX_CONNECTIONS) {
        // 留痕（2026-10-07 可观测性审计：SSE 整条生命周期原先一处日志都没有）。
        log(`[事件推送] 连接数已达上限 ${SSE_MAX_CONNECTIONS}，拒绝新连接`)
        pushNotice('stream_limit', `[事件推送] 连接数已达上限 ${SSE_MAX_CONNECTIONS}，拒绝新连接`)
        return writeJson(res, 503, { ok: false, error: 'too-many-streams' })
      }
      const write = res.write
      if (typeof write !== 'function') return writeJson(res, 501, { ok: false, error: 'streaming-unsupported' })
      res.writeHead(200, {
        'content-type': 'text/event-stream; charset=utf-8',
        'cache-control': 'no-store',
        connection: 'keep-alive',
        // 穿反向代理（nginx 等）时禁缓冲；对不认它的代理无副作用。
        'x-accel-buffering': 'no',
      })
      const unsubscribe = bus.subscribe((event) => {
        try { write.call(res, `data: ${JSON.stringify(event)}\n\n`) } catch { onWriteFailed() }
      })
      // ⚠️ 心跳必须是**真实 data 帧**，不能是 SSE 注释（`: ping`）：注释帧浏览器直接吞掉、前端
      // `onmessage` 根本看不到，于是「`readyState` 是 OPEN 但其实已经半死」永远发现不了
      // （2026-10-06 审计 🟡）。类型用 `HEARTBEAT_TYPE`（不在事件目录里）⇒ 前端 `byType` 查不到、
      // 直接丢弃，不会当成业务事件。
      const heartbeat = setInterval(() => {
        try { write.call(res, `data: ${JSON.stringify({ type: HEARTBEAT_TYPE })}\n\n`) } catch { onWriteFailed() }
      }, SSE_HEARTBEAT_MS)
      /** 幂等清理（`cleanup` 可被 close / 写失败 / dispose 三路重入）。 */
      let cleaned = false
      function cleanup(): void {
        if (cleaned) return
        cleaned = true
        clearInterval(heartbeat)
        unsubscribe()
        streams.delete(cleanup)
        // 主动收尾响应：让 socket 该关就关（2026-10-06 审计）。
        // 否则 dispose / 写失败路径只停了心跳、**响应还挂着**，全靠宿主的 `closeAllConnections()` 兜底
        // —— 宿主行为一变就留下一堆「心跳已停的哑连接」。
        try { (res as { end?: () => unknown }).end?.() } catch { /* 已断开时 end 会抛，忽略 */ }
      }
      /**
       * 写出失败专用清理：**多留一条痕**（2026-10-07 可观测性审计 —— SSE 整条生命周期原先零日志，
       * 「页面悄悄不刷新」时开发者手里没有任何信号）。对端正常断开走 `cleanup`，不打日志（那是应有之义）。
       */
      function onWriteFailed(): void {
        const already = cleaned
        cleanup()
        if (!already) {
          const text = `[事件推送] 写出失败，已回收该连接（当前 ${streams.size} 条）`
          log(text)
          pushNotice('stream_write_failed', text)
        }
      }
      streams.add(cleanup)
      // 连接建立记一条 info（生命周期起点）：进 plugin_log、**不进调试页 warns**（正常连接不算异常，
      // 不该在「诊断/告警」区刷屏）；事后能从库里看出「多少客户端在订阅推送」「建立的节奏」。
      // 异常路径已由 stream_limit（拒绝新连接）/ stream_write_failed（写出失败）覆盖；正常断开走 cleanup 不记。
      noticeStore?.()?.logInfo('stream_open', `[事件推送] 新连接已建立（当前 ${streams.size} 条）`)
      // ⚠️ **只绑 `res` 的 `close`**（2026-10-06 审计实证）：Node ≥16 下 `req` 的 `close` 语义是
      // 「请求消息读完」而不是「连接断开」——GET 无 body，**一旦有中间件消费过请求流
      // （`req.resume()` / 读 body），它会在建连瞬间触发** ⇒ 当场退订，客户端再也收不到任何事件。
      // 实证：`req.resume()` 变体下 `CLEANUP via req.close` 立即打印、客户端连接被终止。
      // SSE 断连的唯一可靠信号是 `res` 的 `close`。
      const on = (res as { on?: (event: string, handler: () => void) => unknown }).on
      if (typeof on === 'function') on.call(res, 'close', cleanup)
      try { write.call(res, ': connected\n\n') } catch { onWriteFailed() }
    },
  },
]

/**
 * 无 `register` 面时的等价作用域（dsh 0.1.7-rc.1 起把注册改成「注册项 Config 自动投影」）。
 *
 * ⚠️ 这里**不能让插件整体 inert**：那样调度器根本不启动，比「页面没数据」严重得多。
 * 退化为「用启动配置运行」——调度 / 派发 / 对账照常；快照与任务 id 回写走 rc.1 的
 * `settings.update(ns, patch)`（该组合若无 update 则放弃回写，仅告警一次）。
 * @param sctx - 已就位 settings 服务的上下文（用于告警日志）。
 * @param settings - settings 服务实例。
 * @param initial - 启动期定格的插件配置。
 * @returns 与 register 产物同形的作用域。
 */
function fallbackScope(
  sctx: HostContext,
  settings: HostSettings,
  initial: PluginConfig,
): SettingsScope<PluginConfig> {
  const updater = (settings as unknown as {
    update?: (ns: string, patch: Record<string, unknown>) => Promise<unknown>
  }).update
  sctx.logger.warn(
    'dsh-task-dispatch-table: 当前 dsh 的 settings 服务未提供 register 面（0.1.7-rc.1 起改为注册项'
    + ' Config 自动投影），已退化为「启动配置运行」：调度照常执行，但运行期改配置需重启才生效'
    + (typeof updater === 'function' ? '。' : '；且该组合也没有 settings.update，页面快照无法回写。'),
  )
  // 降级是**重要**的状态信息：事后排查「为什么改了配置不生效」全靠它。
  // ⚠️ 此处 store 可能尚未就绪 ⇒ pushNotice 会只进内存缓冲，而缓冲会并入快照的 warns ⇒ 前端仍看得到。
  pushNotice(
    'degraded',
    'settings 服务无 register 面，已退化为「启动配置运行」：调度照常，运行期改配置需重启才生效'
      + (typeof updater === 'function' ? '' : '；且无 settings.update，页面快照无法回写'),
  )
  /**
   * 降级作用域也**如实**支持 `watch`（官方契约见 `src/host.ts` 的 `SettingsScope`）：
   * 「值变了就回调」在降级环境下必须同样成立，否则「配置变了」这件事**无人知晓**——既不会广播
   * `CONFIG_CHANGED`，`tickMs` 也不会重启 interval。
   *
   * ⚠️ 2026-10-06 改正：原来这里是空实现 `() => () => {}`，逼得 `/config` 路由自己补发一条事件，
   * 于是**正常路径变成「一次改动发两次」**、靠广播器的合并窗口把多出来的那条吃掉——那是拿下游
   * 兜上游的底。现在把 `watch` 补实，`scope.watch` 恢复为 `CONFIG_CHANGED` 的**唯一发射点**。
   */
  const watchers = new Set<(next: PluginConfig, prev: PluginConfig) => void>()
  let current = initial
  return {
    get: () => current,
    update: async (patch: Partial<PluginConfig>): Promise<void> => {
      if (typeof updater !== 'function') return
      await updater.call(settings, SETTINGS_NS, patch as Record<string, unknown>)
      // 降级链路下 `settings.update` **不会**回调我们的 watch（那是 register 面的能力）⇒ 自己派发一次。
      const prev = current
      current = { ...current, ...patch }
      // **逐个隔离**：某个 watcher 抛异常不得打断其余 watcher，更不能让 `update()` reject ——
      // 否则会出现「配置其实已落盘（上面的 await 已成功）却把这次写回报成失败」的假失败
      // （`updateScopeConfig` 会 catch 成 false ⇒ 路由回 503；2026-10-06 审计）。
      for (const fn of [...watchers]) {
        try { fn(current, prev) } catch (error) {
          sctx.logger.warn(`配置 watcher 抛异常（已隔离，不影响其它订阅者）：${String(error)}`)
        }
      }
    },
    watch: (fn) => {
      watchers.add(fn)
      return () => { watchers.delete(fn) }
    },
  }
}
/** 快照携带的最近事件条数（面板按实例过滤展开用，故比单页展示量多留一些）。 */
const DEBUG_EVENT_LIMIT = 200

export function apply(ctx: HostContext, config: unknown): void {
  // rc.1 兼容：本插件早前版本把 volatile 字段经 settings.update 提交，Loader 把 volatile 默认按
  // `{}` 写进了 profile；重装后 z.number()/z.string() 校验 `{}` 会失败导致 entry 不激活。本插件
  // 配置全是 number/string，不可能有合法的空对象，故把入参里残留的 `{}` 剥掉，让默认值生效。
  const cleanConfig = ((): unknown => {
    if (typeof config !== 'object' || config === null || Array.isArray(config)) return config
    const out: Record<string, unknown> = {}
    for (const [k, v] of Object.entries(config as Record<string, unknown>)) {
      if (typeof v === 'object' && v !== null && !Array.isArray(v) && Object.keys(v as object).length === 0) continue
      out[k] = v
    }
    return out
  })()
  // Config 解析（非 volatile 字段是纯值；readConfigField 对纯值原样返回，对残留 Volatile 引用解包）。
  const raw = (Config as unknown as (value: unknown) => Record<string, unknown>)(cleanConfig)
  const initial: PluginConfig = {
    statePath: typeof raw.statePath === 'string' ? raw.statePath : '',
    tickMs: readConfigField(raw.tickMs, ConfigDefaults.tickMs),
    dispatchGraceMs: readConfigField(raw.dispatchGraceMs, ConfigDefaults.dispatchGraceMs),
    leaseMs: readConfigField(raw.leaseMs, ConfigDefaults.leaseMs),
    unknownGraceMs: readConfigField(raw.unknownGraceMs, ConfigDefaults.unknownGraceMs),
    tasksDir: typeof raw.tasksDir === 'string' ? raw.tasksDir : 'tasks',
    tasksInline: readConfigField(raw.tasksInline, ''),
    debugSnapshot: readConfigField(raw.debugSnapshot, ''),
    defaultProvider: typeof raw.defaultProvider === 'string' ? raw.defaultProvider : '',
    defaultModel: typeof raw.defaultModel === 'string' ? raw.defaultModel : '',
    logRetentionDays: readConfigField(raw.logRetentionDays, ConfigDefaults.logRetentionDays),
    historyRetentionDays: readConfigField(raw.historyRetentionDays, ConfigDefaults.historyRetentionDays),
    attachmentTmpRetentionDays: readConfigField(raw.attachmentTmpRetentionDays, ConfigDefaults.attachmentTmpRetentionDays),
  }
  // v1 零自建 UI（决策 16）：配置走官方 ctx.settings 命名空间，patch config 作为 base 层，
  // 用户文档层 live 覆盖（packages/settings/settings/src/index.ts:49-59）。
  // ⚠️ settings 服务以「带 register 面」或「无 register 面」两种组合入场（参照 dsh-context
  // installSettings）：用 ctx.inject 订阅；缺失 register 时**不再 inert**，而是降级为启动配置
  // 作用域（fallbackScope）——否则调度器根本不启动。顶层 inject 写法会在 register 尚未挂上
  // 时误激活并崩（TypeError: ctx.settings.register is not a function），故不进顶层 inject 列表。
  // ── 运行时数据 store（提升到 apply 作用域，webServer 路由与 settings inject 共用）。
  const runtime: { tasksInline: string; debugSnapshot: string } = {
    tasksInline: initial.tasksInline,
    debugSnapshot: '',
  }
  /**
   * 主界面运行态内存索引（2026-09-30，design/features/main-panel.md §四）：
   * 卡片「运行中 / 上次执行 / 下次执行」的读源。**派生态、不入数据库**——
   * 状态库就绪后建一次索引（一条聚合 SQL），之后由 Loop A 落库 / Loop B 收口事件增量维护。
   */
  /**
   * 事件广播器（唯一出口 + 中间层合并）：各变更点 emit 失效信号，SSE 端点订阅广播。
   * 纯进程内、无宿主依赖 ⇒ 提前创建，路由与各变更点共用同一份。
   */
  const eventBus = createEventBus()
  /**
   * 打开的推送连接登记表（**本 apply 实例**作用域）。
   * ⚠️ 与 `eventBus` 同生命周期：放模块级会让两个 apply 实例互相关掉对方的连接（2026-10-06 审计）。
   */
  const activeStreams: StreamRegistry = new Set()
  /**
   * 「附件解析版本」：overview 行里的附件 `path` / `anchorSessionId` 是**在 HTTP 层补的**
   * （`attachmentsWithPaths`），**不进 `runtimeIndex` 的内容 rev** ⇒ 它一变（工作区新增 / 关闭会话导致
   * 预览锚点变化、或 assets / registry 刚就绪）就会出现「行内容变了、rev 没变」⇒ 客户端**永远**收到
   * `unchanged` ⇒ **附件永久不可点**（2026-10-07 审计 🔴；插件刚加载那一瞬最易命中）。
   * 故给它独立计数，并**并进响应 rev** —— 客户端把 rev 当不透明字符串原样带回，协议无需改。
   */
  let attachRev = 0
  const bumpAttachRev = (): void => { attachRev += 1 }
  const innerRuntimeIndex = createRuntimeIndex()
  /**
   * 运行态内存索引外面**包一层事件发射**（design/event-push.md §六「首选注入面」）：
   * 派发 / 终态 / 阻塞 / 清在飞 都必经这几个方法 ⇒ 一处包裹即覆盖主界面卡片要刷的全部运行态变化。
   * 定义类变更走 `resyncTaskMap`（见下）、配置走 `scope.watch`，不在此重复发。
   */
  const runtimeIndex: RuntimeIndex = {
    ...innerRuntimeIndex,
    markDispatched(taskId, scheduledAt) {
      innerRuntimeIndex.markDispatched(taskId, scheduledAt)
      eventBus.emit({ type: EventType.TASK_RUN_STARTED, payload: { taskId } })
    },
    markTerminal(taskId, status, scheduledAt, finishedAt) {
      innerRuntimeIndex.markTerminal(taskId, status, scheduledAt, finishedAt)
      eventBus.emit({ type: runEventTypeOf(status), payload: { taskId } })
    },
    markBlocked(taskId, reason) {
      // ⚠️ 内层是**边沿触发**（值没变就早退）⇒ **只有真变了才广播**。若无条件发，Scheduler 每个 tick
      // 对每个任务都调它 ⇒ 每 tick 每任务一条无谓事件（2026-10-06 审计实证，等于把轮询倒过来）。
      const changed = innerRuntimeIndex.markBlocked(taskId, reason)
      if (changed) eventBus.emit({ type: EventType.TASK_RUN_CHANGED, payload: { taskId } })
      return changed
    },
    clearRunning(taskId) {
      const changed = innerRuntimeIndex.clearRunning(taskId)
      if (changed) eventBus.emit({ type: EventType.TASK_RUN_CHANGED, payload: { taskId } })
      return changed
    },
  }
  /** 当前任务定义（含停用）：overview 路由组装卡片用；随 tick 同步。 */
  let panelTaskMap: Map<string, TaskDefinition> = new Map()
  /**
   * 「任务定义改了」的同步钩子：settings inject 内赋值为 safeTick（重跑一次 tick 即可刷新
   * panelTaskMap）。webServer 注入早于 settings ⇒ 只能先声明、后赋值。
   */
  let resyncTaskMap: (() => void) | null = null
  /** settings inject 就绪后的宿主上下文（persistTasksInline 经它找 configEditor）。 */
  let settingsCtxRef: HostContext | null = null
  /** settings inject 就绪后的状态库：任务表持久化**主通道**（entry config 在插件重装时会丢）。 */
  let storeRef: TaskStore | null = null
  // 观测条目落库（plugin_log）的取值器：模块级 pushNotice 拿不到这里的 storeRef，故注册一个取值器。
  setNoticeStore(() => storeRef)
  /** settings inject 就绪后的附件落盘目录（插件数据根下 task-attachments/，随 statePath 定格）。 */
  let attachmentsDirRef: string | null = null
  /** settings inject 就绪后的任务文件资产根（tasks/ 与临时区都在 state.db 同目录）。 */
  let assetsRef: AssetPaths | null = null
  /**
   * settings inject 就绪后的调度器（「立即执行」路由要调 runNow）。
   * webServer 注入早于 settings ⇒ 与 storeRef 同法：先声明、后赋值，路由闭包按请求时惰性取。
   */
  let schedulerRef: Scheduler | null = null
  /** settings inject 就绪后的插件配置（清道夫天数等；无 register 面时沿用启动配置）。 */
  let configRef: PluginConfig = initial
  /** settings inject 就绪后捕获的官方/降级作用域，供设置页经 scope.update 写回配置。 */
  let scopeRef: SettingsScope<PluginConfig> | null = null
  /** 设置页写回插件配置（仅计时字段经 route 校验后调用）；作用域未就绪时返回 false。 */
  const updateScopeConfig = async (patch: Partial<PluginConfig>): Promise<boolean> => {
    if (!scopeRef) return false
    try {
      await scopeRef.update(patch as Record<string, unknown>)
      return true
    } catch {
      return false
    }
  }
  const persistTasksInline = async (json: string): Promise<void> => {
    // 主通道：写状态库 meta 表（state.db 在宿主数据根 = 挂载卷，容器重建 / 插件重装都不丢）。
    // 未就绪只告警不静默——用户必须知道这次保存没落盘。
    const store = storeRef
    if (store === null) {
      settingsCtxRef?.logger.warn('任务表保存：状态库未就绪，本次只在内存生效、未持久化，请稍后重新保存')
    } else {
      store.setMeta('tasksInline', json)
    }
    // 次通道：尽力写回插件 entry config（官方配置面可见）；rc.1 缺 configEditor / entry 属预期。
    // ⚠️ cordis ctx 是 Proxy：属性访问未提供的get trap 直接 throw（cannot get property ... without
    // inject，真机 2026-09-25 实证；决策 21 同源教训），「访问后判 undefined」的探测形同虚设
    // ⇒ 整块 try/catch：任何异常只告警，绝不连累主通道（meta 表已落盘、内存已生效）。
    const sctx = settingsCtxRef
    if (sctx === null) return
    try {
      const configEditor = (sctx as unknown as {
        configEditor?: {
          entries: () => Array<{ options?: { id?: string } }>
          edit: (entry: unknown, mutate: (raw: Record<string, unknown>) => Record<string, unknown>) => Promise<void>
        }
      }).configEditor
      if (configEditor === undefined) return
      const entry = configEditor.entries().find((e) => e.options?.id === SETTINGS_NS)
      if (entry === undefined) return
      await configEditor.edit(entry, (raw: Record<string, unknown>) => ({ ...raw, tasksInline: json }))
    } catch (error) {
      sctx.logger.warn(`任务表次通道写回 entry config 失败（不影响保存：主通道 meta 表已落盘）: ${error instanceof Error ? error.message : String(error)}`)
    }
  }
  // ── rc.1 数据通道：webServer HTTP 路由（照抄参考插件 dsh-task-board 的已验证通道：
  // 宿主 ctx.webServer.register(route)，客户端同源 fetch 轮询）。
  ctx.inject(['webServer'], (wctx: HostContext) => {
    const webServer = (wctx as unknown as { webServer?: { register?: (route: DispatchWebRoute) => unknown } }).webServer
    if (webServer === undefined || typeof webServer.register !== 'function') {
      wctx.logger.warn('[数据通道] 宿主上下文无 webServer.register 面，HTTP 路由未注册；客户端画面将无数据')
      pushNotice('degraded', '宿主无 webServer.register 面：HTTP 路由未注册，客户端画面将无数据')
      return
    }
    for (const route of makeDispatchRoutes(
      runtime, persistTasksInline,
      () => storeRef, () => ctx.workspaceRegistry, () => ctx.get('llm'),
      (msg) => { ctx.logger.info(msg) },
      // 惰性取附件目录：settings inject 在 webServer 之后就绪，届时才定得出 statePath。
      () => attachmentsDirRef,
      () => assetsRef,
      () => configRef,
      runtimeIndex,
      () => panelTaskMap,
      () => { resyncTaskMap?.() },
      () => configRef,
      updateScopeConfig,
      () => schedulerRef,
      eventBus,
      activeStreams,
      () => attachRev,
    )) {
      // 逐条容错：宿主对重复 (kind, path) 注册会 throw（dsh-host-webserver register），
      // 一条坏路由绝不能把后面的路由全部拖死（2026-10-02 真机「部分接口 404」的放大器）。
      try {
        // ⚠️ **每个路由都套一层耗时与并发计数**（2026-10-07 事故定位用）。
        // 事故现象：日程 / 执行记录 / snapshot **同时** 8s 超时 ⇒ 不是某个接口坏了，而是**请求排队**；
        // 而这是插件进程里唯一能直接看到「排队」这件事的地方（客户端只看到超时，看不出是谁卡住）。
        const inner = route.handler
        webServer.register({ ...route, handler: (req, res) => {
          const startedAt = Date.now()
          inflightRequests += 1
          const done = (): void => {
            inflightRequests -= 1
            const cost = Date.now() - startedAt
            if (cost >= SLOW_REQUEST_MS) {
              const line = `[慢请求] ${route.path} 耗时 ${cost}ms（并发 ${inflightRequests}）`
              wctx.logger.info(line)
              pushNotice('slow_request', line)
            }
          }
          // 同步 handler（不返回 Promise）也要算到，故用 res 的 finish/close 兜底收尾。
          try {
            const out = inner(req, res) as unknown
            if (out !== undefined && typeof (out as { then?: unknown }).then === 'function') {
              void (out as Promise<unknown>).then(done, done)
              return
            }
          } catch (error) {
            const line = `[路由异常] ${route.path}：${error instanceof Error ? error.message : String(error)}`
            wctx.logger.info(line)
            pushNotice('route_error', line, 'error')
          }
          done()
        } })
      } catch (error) {
        wctx.logger.warn(`[数据通道] 路由注册失败 ${route.path}：${error instanceof Error ? error.message : String(error)}`)
      }
    }
    wctx.logger.info('[数据通道] webServer 路由已注册：GET /api/task-dispatch-table/snapshot、GET /api/task-dispatch-table/db、GET /api/task-dispatch-table/options、GET/POST /api/task-dispatch-table/config、GET /api/task-dispatch-table/tasks/instances、GET /api/task-dispatch-table/tasks/log、GET /api/task-dispatch-table/tasks/events、POST /api/task-dispatch-table/session/unarchive、POST /api/task-dispatch-table/session/archive、POST /api/task-dispatch-table/tasks/enabled、POST /api/task-dispatch-table/tasks/run')
  })
  ctx.inject(['settings'], (sctx: HostContext) => {
    const settings = sctx.settings
    // 有 register 面 → 官方命名空间作用域（配置 live 生效）；无（0.1.7-rc.1）→ 降级为
    // 启动配置作用域，调度照跑（见 fallbackScope：不能因为缺 register 就整体不启动）。
    const scope = typeof settings.register === 'function'
      ? settings.register<PluginConfig>(SETTINGS_NS, Config as unknown as z_any<PluginConfig>, { base: initial })
      : fallbackScope(sctx, settings, initial)
    scopeRef = scope
    // ── rc.1 运行时数据通道：宿主插件不能走 configForms（volatile 会让 entry 不激活），
    // 改走 webServer HTTP 路由（照抄参考插件 dsh-task-board 的已验证通道：宿主注册
    // GET /api/<name>/snapshot，客户端同源 fetch 轮询）。runtime 提升到 apply 作用域供路由闭包读。
    settingsCtxRef = sctx
    // statePath 启动时定格，运行期改配置不迁移库。
    const store = new TaskStore(resolveStatePath(scope.get().statePath))
    storeRef = store
    // 附件上传落盘目录 = 上传**临时区**（task-attachments-tmp/，2026-09-30）：
    // 新上传先进临时区，保存时才搬进 tasks/<id>/attachments/（原始名）。旧平铺目录
    // task-attachments/ 只作老数据迁移源，不再有新文件写入。
    attachmentsDirRef = path.join(path.dirname(resolveStatePath(scope.get().statePath)), 'task-attachments-tmp')
    // 任务文件资产根（tasks/<uuid>/ + 上传临时区）随 statePath 定格。
    assetsRef = assetPaths(resolveStatePath(scope.get().statePath))
    // assets 就绪这一瞬也要 bump：此前 overview 请求拿到的是「附件无绝对路径」的行（附件不可点），
    // 而这件事不进内容 rev ⇒ 不 bump 的话客户端会永远停在不可点的旧行（2026-10-07 审计 🔴）。
    bumpAttachRev()
    // 任务表恢复（主通道 = 状态库 meta）：state.db 在宿主数据根（挂载卷），容器重建 /
    // 插件重装都不丢。meta 无行（从未保存过）⇒ 沿用 entry config 初始值（兼容旧部署）。
    const savedInline = store.getMeta('tasksInline')
    if (savedInline !== undefined) {
      runtime.tasksInline = savedInline
      sctx.logger.info(`任务表已从状态库恢复（${savedInline.length} 字节）`)
    }
    // 迁移若真的合并掉了重复行（正常应为 0），必须让用户看见——绝不静默删数据。
    if (store.dupRowsRemoved > 0) {
      sctx.logger.warn(
        `状态库迁移：发现并合并了 ${store.dupRowsRemoved} 组「同任务同刻度」的重复实例行`
        + `（保留每组最早的一条）。这通常不该发生，请检查是否有手工改动过状态库。`,
      )
    }

    // 临时调试通道：宿主侧把「告警 + 状态库快照」写进本命名空间的 debugSnapshot 字段
    // （scope.update 合并进用户层并提交 'settings/updated'，packages/settings/settings/src/index.ts:133,456,562），
    // 配置页订阅同一 scope 实时渲染。仅诊断用，全部异常自兜，不触碰调度主流程。
    //
    // ⚠️ ctx 不可包装（cordis ctx 是 Proxy：set trap 拒绝赋值 vendor/cordis/src/reflect.ts:172-196，
    // on/interval 等 mixin 方法不在自有属性上，展开拷贝拿不到 :221）——tee logger 作为
    // 显式参数传给各模块（见 host.ts HostLogger 注释），sctx 原样传递。
    const debugWarns: string[] = []
    const pushWarn = (level: 'warn' | 'error', message: string): void => {
      debugWarns.push(`${new Date().toISOString()} [${level}] ${message}`)
      if (debugWarns.length > DEBUG_WARN_LIMIT) debugWarns.shift()
    }
    const teeLogger: HostLogger = {
      info: (message: string) => sctx.logger.info(message),
      warn: (message: string) => { pushWarn('warn', message); sctx.logger.warn(message) },
      error: (message: string) => { pushWarn('error', message); sctx.logger.error(message) },
    }

    let taskMap = new Map<string, TaskDefinition>()

    // 快照写入：内容去重（数据未变不写）+ 2s 节流（尾随写入保证最终态必落）+ 5min 心跳。
    let lastContent = ''
    let lastWriteAt = 0
    let lastPushAt = 0
    let writePending = false
    /** 快照首次写入成功只记一次日志，避免每 tick 刷屏。 */
    let snapshotWriteLogged = false
    const writeSnapshot = (): void => {
      try {
        const snap = store.snapshot(DEBUG_EVENT_LIMIT)
        const now = new Date()
        // 任务明细（决策 25：id 系统生成 + title 给人看；带下次执行刻度便于核对配置是否生效）。
        const tasks = [...taskMap.values()].map(task => {
          let next: string | null = null
          try {
            next = nextSlotAfter(task, now)?.toISOString() ?? null
          } catch {
            next = null // 单个任务的刻度计算异常不影响整份快照
          }
          return {
            id: task.id,
            title: titleOf(task),
            code: task.code ?? null,
            enabled: task.enabled,
            cron: task.schedule.cron ?? null,
            once: task.schedule.once ?? null,
            timezone: task.schedule.timezone ?? null,
            window: task.schedule.window,
            workspace: task.target.workspace,
            next,
          }
        })
        // ⚠️ `warns` **并入服务端观测缓冲**（见 pushNotice 注释）：`[主线程阻塞]` / `[慢请求]` 因此
        // 会直接出现在插件调试页 —— 真机出问题时不必去找宿主的日志文件。
        const body = { tasks, instances: snap.instances, events: snap.events, warns: [...debugWarns, ...serverNotices] }
        const content = JSON.stringify(body)
        lastWriteAt = Date.now()
        if (content === lastContent && Date.now() - lastPushAt < DEBUG_FORCE_INTERVAL_MS) return
        lastContent = content
        lastPushAt = Date.now()
        // rc.1：宿主运行时数据不走 settings.update（要求 volatile，会让 entry 不激活）；
        // 改为写进内存 store，经 taskDispatchTable 宿主服务暴露给客户端。
        runtime.debugSnapshot = JSON.stringify({ at: new Date().toISOString(), ...body })
        // 只记一次：证明写通道真的通了（否则日志会被每 tick 刷屏）。
        if (snapshotWriteLogged) return
        snapshotWriteLogged = true
        sctx.logger.info(
          `调试快照首次写入成功（${body.tasks.length} 个任务 / ${snap.instances.length} 条实例`
          + ` / ${snap.events.length} 条事件，${JSON.stringify(body).length} 字节；客户端经 remote.taskDispatchTable 读取）`,
        )
      } catch (error) {
        sctx.logger.warn(`调试快照组装失败: ${String(error)}`)
      }
    }
    const updateSnapshot = (): void => {
      if (writePending) return
      const wait = lastWriteAt + DEBUG_WRITE_MIN_INTERVAL_MS - Date.now()
      if (wait <= 0) { writeSnapshot(); return }
      writePending = true
      setTimeout(() => { writePending = false; writeSnapshot() }, wait)
    }

    const pluginConfig = (): PluginConfig => ({ ...scope.get(), tasksInline: runtime.tasksInline })
    const reconcileOptions: ReconcileOptions = {
      get leaseMs() { return scope.get().leaseMs },
      get dispatchGraceMs() { return scope.get().dispatchGraceMs },
      get unknownGraceMs() { return scope.get().unknownGraceMs },
      config: pluginConfig,
      // 决策 41 一次性兼容：旧库实例无快照时按当前任务定义当场补快照（只此一处对账读任务表）。
      legacyTask: (taskId) => taskMap.get(taskId),
      // 附加文件兜底校验（Loop B 发动前）：资产根随 statePath 定格。
      assets: () => assetsRef,
    }
    const reconciler = createReconciler({
      ctx: sctx, logger: teeLogger, store, options: reconcileOptions, runtime: runtimeIndex,
      // 实例行在 DB 层的变化（不经 RuntimeIndex 的那些：重试退回 / unknown 复活 / 转 running / redispatch）
      // 也要广播给前端（design/event-push.md §六）。
      emit: (event) => eventBus.emit(event),
    })
    const scheduler: Scheduler = createScheduler({
      ctx: sctx, logger: teeLogger, store, reconciler, runtime: runtimeIndex,
      // tasksInline 以 runtime 内存值为准（用户经 remote 服务改后即时生效，无需等 settings 落盘）。
      config: pluginConfig,
      // 附加文件存在性校验（Loop A）：资产根随 statePath 定格，未就绪 ⇒ 跳过 upload 型校验。
      assets: () => assetsRef,
    })
    schedulerRef = scheduler

    // 启动扫描（机制 #5）：重启期间 disposed 事件可能全部丢失，已派发未定态实例置 unknown，
    // 随后按 unknown 流程自然收敛（§3）。pending 从未派发、无可丢事件，保持原状。
    const scanned = store.startupScan()
    if (scanned > 0) teeLogger.info(`启动扫描：${scanned} 个已派发实例置 unknown`)

    // ⚠️ created / disposed 还要 `bumpAttachRev()`：工作区的会话列表变了 ⇒ 附件预览锚点
    //    （`anchorOf` 取该工作区**最后一个**会话）可能换人 ⇒ 行内容变了但内容 rev 不变（2026-10-07 审计 🔴）。
    sctx.on('session/created', session => { reconciler.onCreated(session); bumpAttachRev(); updateSnapshot() })
    sctx.on('session/event', (session, event) => { reconciler.onEvent(session, event); updateSnapshot() })
    sctx.on('session/disposed', session => { reconciler.onDisposed(session); bumpAttachRev(); updateSnapshot() })

    // 决策 30 修订（用户 2026-09-25 拍板「运行时只认不修」）：tick 不再补写任务 id——
    // id 只在保存闸门（POST /tasks → ensureIdsInInlineJson）生成并固化；运行时遇到
    // 无 id / 非 UUID 的条目由 parseInlineTasks warn 跳过，不做任何兜底或写回。
    const safeTick = (): void => {
      try {
        scheduler.tick()
        taskMap = scheduler.getTasks()
        panelTaskMap = taskMap
      } catch (error) {
        pushWarn('error', `tick 异常: ${String(error)}`)
        sctx.logger.error(`tick 异常: ${String(error)}`)
        pushNotice('tick_error', `调度 tick 抛异常：${error instanceof Error ? error.message : String(error)}`, 'error')
      }
      updateSnapshot()
    }

    // 官方定时器（决策 13）：ctx.interval 卸载自动清理（vendor/timer/src/index.ts:47-62）。
    // tickMs live 变更时重启 interval。
    /** dispose 后置真：配置 watcher 立刻退出（见下），避免对已释放的广播器发事件、或重种定时器。 */
    let disposed = false
    let stopInterval = sctx.interval(safeTick, scope.get().tickMs)
    const unwatchScope = scope.watch((next, prev) => {
      // dispose 之后宿主若还回调（作用域的生命周期不完全由我们掌控）⇒ 立刻退出：
      // 否则会向**已经 dispose 的广播器**发事件、并用 `sctx.interval` **重新种下一个没人清理的定时器**
      // （2026-10-06 第四轮审计 🟡）。
      if (disposed) return
      // 配置 live 变更 ⇒ 同步给路由层（清道夫天数等）。
      configRef = { ...next, tasksInline: runtime.tasksInline }
      // 配置变了 ⇒ 通知前端重读（设置页 / 依赖计时参数展示的页面）。
      // ⚠️ **`CONFIG_CHANGED` 的唯一发射点**（正常与降级作用域都走这里——`fallbackScope` 的 `watch`
      // 已如实实现）⇒ 一次成功写回**恰好一条**事件，不需要下游的合并窗口兜底。
      // **边沿触发**：`watch` 在「点了保存但值其实没变」时同样会回调，那不叫变更 ⇒ 比对后再决定。
      // 用**整份比对**而不是硬编码字段清单：将来加新的页面可见字段时不必记得回来补清单（宁可多发一条空的）。
      if (JSON.stringify(next) !== JSON.stringify(prev)) {
        eventBus.emit({ type: EventType.CONFIG_CHANGED })
      }
      if (next.tickMs === prev.tickMs) return
      stopInterval()
      stopInterval = sctx.interval(safeTick, next.tickMs)
    })

    // 上传临时区清道夫：每 6 小时看一次，**跨天**才真干活 ⇒ 平时一轮只多一次日期比较，
    // 无持续负载。删掉 N 天前没被保存带走的临时文件（data-model §六）。
    let lastSweepDay = ''
    const stopSweeper = sctx.interval(() => {
      const paths = assetsRef
      if (paths === null) return
      const day = new Date().toISOString().slice(0, 10)
      if (day === lastSweepDay) return
      lastSweepDay = day
      try {
        const removed = purgeTmp(paths, configRef.attachmentTmpRetentionDays)
        if (removed > 0) {
          sctx.logger.info(`附件临时区清理：删除 ${removed} 个超过 ${configRef.attachmentTmpRetentionDays} 天的未保存文件`)
        }
      } catch (error) {
        sctx.logger.warn(`附件临时区清理失败（不影响调度）：${error instanceof Error ? error.message : String(error)}`)
      }
    }, 6 * 3600_000)

    /**
     * 定义被改动的**唯一同步点**（2026-09-30 抽象统一）：保存 / 删除 / 启停等任何写路径改完
     * 都只调这一个 ⇒ ① 重解析任务表（刷新 panelTaskMap）② 让运行态索引重算展示指纹与下一
     * 刻度并按需 bump rev（客户端下一次轮询必定拿到新数据）。
     * ⚠️ 新增写路径时**只在这里加一处**，不要在各自 handler 里散着改内存。
     */
    resyncTaskMap = () => {
      safeTick()
      runtimeIndex.markDefinitionsChanged([...taskMap.values()])
      // 定义变更的唯一同步点 ⇒ 在此广播（所有写路径都汇聚到这里，见上方注释）。
      eventBus.emit({ type: EventType.TASKS_CHANGED })
    }
    safeTick()
    // 主界面运行态**启动初始化一次**：一条聚合 SQL 取每任务最近执行 + 在飞行扫描 + 逐任务算下一刻度。
    // 之后全靠事件增量维护（Loop A 落库 / Loop B 收口），轮询不再查库。
    runtimeIndex.rebuild([...taskMap.values()], store)
    scheduler.startupDiagnostics()
    updateSnapshot() // 启动诊断可能写 task_log，立即落一版快照
    // 插件整体日志：**启动**这一条是时间线的锚点（2026-10-07）——事后排查「那次故障前后插件
    // 有没有重启过」，全靠它。写 `plugin_log`（进程级），不写 `task_log`（任务级，见该表建表注释）。
    storeRef?.logInfo('startup', '插件已启动，调度与数据通道就绪')

    // ── 主线程阻塞检测（2026-10-07 事故定位用，原理见 BLOCK_BEAT_MS 的注释）──────
    // 本该每 1s 触发一次；若被同步重活推迟 ⇒ 漂移量就是「主线程被占住的时长」。
    let lastBeat = Date.now()
    const blockBeat = setInterval(() => {
      const now = Date.now()
      const drift = now - lastBeat - BLOCK_BEAT_MS
      lastBeat = now
      if (drift >= BLOCK_REPORT_MS) {
        const line = `[主线程阻塞] 心跳漂移 ${drift}ms（并发请求 ${inflightRequests}）⇒ 这期间所有 HTTP 请求都在排队`
        sctx.logger.info(line)
        pushNotice('block', line)
      }
    }, BLOCK_BEAT_MS)
    const stopBlockBeat = (): void => { clearInterval(blockBeat) }

    sctx.on('dispose', () => {
      disposed = true
      // 停止也记一条：与 `startup` 配对 ⇒ 事后能数出「重启过几次、每次活了多久」。
      storeRef?.logInfo('shutdown', '插件已停止（dispose）')
      // 主动摘掉配置 watcher（此前只把退订函数丢掉 ⇒ 宿主若晚一步才释放作用域，
      // 回调会打到已 dispose 的广播器上、并重种一个没人清理的 interval）。2026-10-06 第四轮审计 🟡。
      unwatchScope()
      stopInterval()
      stopSweeper()
      stopBlockBeat()
      closeAllEventStreams(activeStreams)
      eventBus.dispose()
      store.close()
      // 清空模块级观测状态：否则插件重载后旧条目会串进新实例（2026-10-07 审计 🟡）。
      resetNotices()
    })
  })
}
