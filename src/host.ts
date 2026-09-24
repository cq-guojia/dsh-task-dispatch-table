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

/**
 * 模型 route：provider 与 model 成对（决策 22）。宿主 agent-loop 的 prepareRequest
 * 对二者一并校验：`if (!proposedConfig.provider || !proposedConfig.model) throw`——
 * 只给一个等于没给，故本插件一律成对传递。
 */
export interface ModelRoute {
  provider: string
  model: string
}

/** AgentOptions：core/agent/src/runtime-types.ts:26-35。⚠️ 缺省并非「走宿主默认路由」——必须显式给（决策 22）。 */
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
  /**
   * 会话创建元数据。agentPreset 是**持久化**的会话身份（决策 23）：写入后该会话即绑定此
   * preset，后续 adopt/resume 会做一致性校验（不匹配抛 preset conflict）。
   */
  readonly meta?: { readonly cwd?: string; readonly agentPreset?: string }
  readonly agentOptions?: AgentOptions
  /**
   * 发布前的 agent 作用域组装（决策 23）。工厂在 mint agentCtx 之后、announce
   * `session/created`/`agent/created` 之前 await 本回调；**工具、prompt sections、skill
   * 目录只在这里挂得上**（presets.mount），晚于发布就没有模型可见的层了。
   * 抛错 ⇒ 整个作用域回滚、会话与 agent 都不发布。
   */
  readonly setup?: AgentSetup
}

/**
 * 组装回调（CreateAgentOptions.setup / ResumeAgentOptions.setup 共用）。
 * agentCtx 是 agent 的**作用域 ctx**，正是 agentPresets.mount 需要的参数。
 */
export type AgentSetup = (agentCtx: unknown, agent: HostAgent) => void | Promise<void>

/** AgentRegistry.create：core/agent/src/index.ts:388-398。 */
export interface HostAgents {
  create(options: CreateAgentOptions): Promise<AgentHandle>
}

/**
 * agent preset 服务（@deepseek-ai/dsh-agent-presets 0.1.6-alpha.2，服务名 `agentPresets`）：
 * preset 决定一个 agent 的**工具、prompt sections、skill 目录**（决策 23）。
 * ⚠️ 未加入 preset 的 agent 落到「空的全局层」——实测只剩根作用域注册的东西
 * （MCP 工具在、fs/bash 全无），宿主自己的会话都经 setup 里 mount 加入。
 */
export interface HostAgentPresets {
  /** 解析 preset id；省略/undefined = 部署默认（settings 的 selectionPolicy().defaultId，热读）。 */
  resolve(id?: string): Promise<{ readonly id: string }>
  /** 把 agent 作用域绑定到该 preset 的 standing composition。agentCtx 必须是作用域 ctx。 */
  mount(agentCtx: unknown, id?: string): Promise<unknown>
}

/** SessionStore.create(id?)：core/session/src/index.ts:969，id 可由调用者供给。 */
export interface HostSessions {
  create(id?: SessionId): HostSession
}

/**
 * Workspace 实体最小面（@deepseek-ai/dsh-workspace 0.1.6-alpha.2 entity）：
 * id / path（fs.realpath 归一的绝对路径）/ title，外加归组用的 attachSession。
 */
export interface HostWorkspace {
  readonly id: string
  readonly path: string
  readonly title: string
  /**
   * 会话归组的唯一途径（决策 22）：把 sessionId 登记进本工作区记录的 sessionIds。
   * 前置校验 = 读会话 header 的 cwd → realpath 归一 → 必须 === 本工作区 path，
   * 否则抛错（所以 meta.cwd 必须直接用本实体的 path，不可自行拼写）。
   * ⚠️ 只设 meta.cwd **不会**自动归组；必须显式调用本方法。
   */
  attachSession(sessionId: SessionId): Promise<void>
}

/**
 * WorkspaceRegistry（@deepseek-ai/dsh-workspace 0.1.6-alpha.2）：无按 name 查询 API，
 * 只有 get(id)/list()/resolveByPath()/create()；按 name 匹配须遍历 list() 比对 title。
 * archiveSession(id)：程序化归档，只追加 registry 级 archivedSessionIds（不动工作区槽位）。
 */
export interface HostWorkspaceRegistry {
  list(): readonly HostWorkspace[]
  get(id: string): HostWorkspace | undefined
  archiveSession(id: SessionId): Promise<void>
}

/** 已注册 provider 的展示元数据（@deepseek-ai/dsh-llm types：LlmProviderInfo）。 */
export interface HostLlmProviderInfo {
  /** provider 路由键，即 AgentOptions.provider 的取值。 */
  readonly id: string
  readonly name: string
}

/** 适配器发现的模型条目（@deepseek-ai/dsh-llm types：LlmModelInfo；目录为 advisory）。 */
export interface HostLlmModelInfo {
  readonly provider: string
  /** 模型 id，即 AgentOptions.model 的取值。 */
  readonly id: string
  readonly name: string
}

/**
 * llm 服务最小面（@deepseek-ai/dsh-llm 0.1.6-alpha.2）：决策 22 漏斗第④层与
 * 「只给 model 反查 provider」用。两个查询均为只读；模型目录是 advisory——
 * 未列出不等于不可用（故反查失败时继续下漏而非直接判失败）。
 */
export interface HostLlm {
  /** 已注册 provider，按注册序（同步）。 */
  listProviders(): readonly HostLlmProviderInfo[]
  /** 某 provider 可发现的模型，按适配器偏好序（异步）。 */
  listModels(provider: string): Promise<readonly HostLlmModelInfo[]>
}

/**
 * 宿主默认模型服务（@deepseek-ai/dsh-agent-default-model 0.1.6-alpha.2，服务名 agentDefaultModel）：
 * 部署在 composition 里配 provider+model（二者 required），用户在 settings 命名空间
 * `agent-default-model` 的改动 live 生效；UI 换模型会 saveSelection 写回。
 * ⇒ currentSelection() 即「用户配的 / 最后一次用的」模型，是决策 22 漏斗第③层。
 */
export interface HostAgentDefaultModel {
  currentSelection(): ModelRoute
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
  /**
   * cordis 可选服务探测（决策 22 漏斗 / 决策 23 preset 挂载用）。**一律不写进 inject**：
   * 声明组合满足不了的依赖会让 entry 一直 pending、卡死整个 dsh 启动（决策 17 真机教训）。
   * 未挂载时返回 undefined。
   */
  get(name: 'llm'): HostLlm | undefined
  get(name: 'agentDefaultModel'): HostAgentDefaultModel | undefined
  get(name: 'agentPresets'): HostAgentPresets | undefined
  get(name: string): unknown
  /**
   * cordis 服务订阅（dsh-context installSettings 同款）：依赖就绪后才执行回调，惰性服务可守卫。
   * 用于 settings——其 register 面可能延迟挂上或干脆缺失，顶层 inject 写法会卡死/崩。
   */
  inject(deps: readonly string[], callback: (ctx: HostContext) => void): unknown
}

/**
 * 宿主 logger 最小面。⚠️ ctx 本体不可包装（cordis ctx 是 Proxy：set trap 拒绝赋值
 * vendor/cordis/src/reflect.ts:172-196；on/interval 等 mixin 方法不在自有属性上，
 * 展开拷贝拿不到 :221）——需要替换 logger 的模块一律经显式参数接收本类型。
 */
export type HostLogger = HostContext['logger']
