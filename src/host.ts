// 宿主最小类型面：形状依据 /tmp/dsh-source（deepseek-ai/deepseek-harness 0.1.6-alpha.2）。
// 刻意不依赖 @deepseek-ai/* 运行时包——插件运行在宿主进程内，ctx 由宿主注入。
import type z from '@deepseek-ai/schemastery'

export type z_any<T> = z<T>

/** 会话 id：宿主侧为 brand string（core/session/src/types.ts），本插件按字符串处理。 */
export type SessionId = string

/**
 * 会话最小面。形状依据 core/session/src/index.ts:442-510（Session 存储会话，
 * header 含 id/createdAt/cwd）。
 */
export interface HostSession {
  readonly id: SessionId
}

/**
 * 消息面。形状依据 packages/llm/llm/src/message.ts:80-93（ContextFormed.notice =
 * { form: 'notice', summary }）、:101-104（plugin source）、:131-145（Message/UserMessage）、
 * text block = { type: 'text', text }（core/agent/src/model-selection.ts:45-47 先例）。
 */
export interface UserMessage {
  readonly id: string
  readonly role: 'user'
  readonly content: readonly { type: 'text'; text: string }[]
  readonly source: { kind: 'plugin'; plugin: string; form: 'notice'; summary: string }
}

/**
 * Agent 最小面。形状依据 core/agent/src/runtime-types.ts:163-242：
 * send(message, target: 'next-turn' | 'next-step', wakeup)、whenIdle()。
 */
export interface HostAgent {
  readonly id: SessionId
  send(message: UserMessage, target: 'next-turn' | 'next-step', wakeup: boolean): void
  whenIdle(): Promise<void>
}

/** AgentHandle：core/agent/src/index.ts:160-163。 */
export interface AgentHandle {
  readonly agent: HostAgent
  dispose(): Promise<void>
}

/** AgentOptions：core/agent/src/runtime-types.ts:26-35，provider/model 均可选，缺省走宿主默认路由。 */
export interface AgentOptions {
  provider?: string
  model?: string
}

/**
 * CreateAgentOptions：core/agent/src/index.ts:62-119。sessionId 必填（调用者供给，
 * 与 session 日志共享同一身份）；meta.cwd 必须绝对路径（session header 校验，
 * core/session/src/index.ts:111-115）。
 */
export interface CreateAgentOptions {
  readonly sessionId: SessionId
  readonly meta?: { readonly cwd?: string }
  readonly agentOptions?: AgentOptions
}

/** AgentRegistry.create：core/agent/src/index.ts:388-398。 */
export interface HostAgents {
  create(options: CreateAgentOptions): Promise<AgentHandle>
}

/** SessionStore.create(id?)：core/session/src/index.ts:969，id 可由调用者供给。 */
export interface HostSessions {
  create(id?: SessionId): HostSession
}

/**
 * Workspace 最小面。形状依据 packages/workspace/workspace/src/entity.ts:69-103：
 * id / path（fs.realpath 归一的绝对路径）/ title。
 */
export interface HostWorkspace {
  readonly id: string
  readonly path: string
  readonly title: string
}

/**
 * WorkspaceRegistry：无按 name 查询 API（packages/workspace/workspace/src/index.ts:157-305），
 * 只有 get(id)/list()/resolveByPath()/create()；按 name 匹配须遍历 list() 比对 title。
 * archiveSession(id)：index.ts:243-254，程序化归档，只追加 archivedSessionIds。
 */
export interface HostWorkspaceRegistry {
  list(): readonly HostWorkspace[]
  get(id: string): HostWorkspace | undefined
  archiveSession(id: SessionId): Promise<void>
}

/** SettingsScope：packages/settings/settings/src/index.ts:115-141（update 见 :133，owner scope 专用）。 */
export interface SettingsScope<T> {
  get(): T
  /** 运行期合并写入用户层并提交（:456 owner scope 暴露；read-only provider 抛错，:636）。 */
  update(patch: Partial<T>): Promise<void>
  watch(callback: (next: T, prev: T) => void | Promise<void>): () => void
}

/** SettingsProvider.register：packages/settings/settings/src/index.ts:419-459，schema 为 schemastery z。 */
export interface HostSettings {
  register<T>(ns: string, schema: z_any<T>, options?: { base?: Partial<T> }): SettingsScope<T>
}

/** SessionTitleService.rename：packages/session/session-title/src/index.ts:395-401，参数是 Session 对象。 */
export interface HostSessionTitle {
  rename(session: HostSession, title: string): unknown
}

/** 会话事件最小面：本插件只消费 event.type（'turn/end' 等，core/session/src/known-event-types.ts）。 */
export interface HostSessionEvent {
  readonly type: string
}

/** cordis ctx 最小面（本插件用到的成员）。 */
export interface HostContext {
  logger: {
    info(message: string): void
    warn(message: string): void
    error(message: string): void
  }
  /** 官方定时器：vendor/timer/src/index.ts:47-62，ctx.interval(fn, ms) 返回 dispose，卸载自动清理。 */
  interval(callback: () => void, delay: number): () => void
  /** cordis 事件监听；会话三事件见 core/session/src/index.ts:50-72。'dispose' 为 cordis 内置事件。 */
  on(event: 'session/created', listener: (session: HostSession) => void): () => void
  on(event: 'session/event', listener: (session: HostSession, event: HostSessionEvent) => void): () => void
  on(event: 'session/disposed', listener: (session: HostSession) => void): () => void
  on(event: 'dispose', listener: () => void): () => void
  agents: HostAgents
  sessions: HostSessions
  workspaceRegistry: HostWorkspaceRegistry
  settings: HostSettings
  sessionTitle: HostSessionTitle
}

/**
 * 宿主 logger 最小面。⚠️ ctx 本体不可包装（cordis ctx 是 Proxy：set trap 拒绝赋值
 * vendor/cordis/src/reflect.ts:172-196；on/interval 等 mixin 方法不在自有属性上，
 * 展开拷贝拿不到 :221）——需要替换 logger 的模块一律经显式参数接收本类型。
 */
export type HostLogger = HostContext['logger']
