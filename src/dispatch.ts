// 派发（决策 22 + 23 + 24）：模型漏斗解析 + 部署默认 preset 解析 → assign-session 落库
// → ctx.agents.create 驱动模型（内部自建会话：sessions.prepare + enter + announce；setup 里
//   mount preset（工具/提示词/skill 跟随系统）+ 注册本任务专属的回执工具（receipt.ts））
// → 工作区 attachSession 归组 → agent.send 拼装消息。
// 不要预建 ctx.sessions.create——会撞 store 的 'session "…" already exists'（真机教训 2026-09-23）。
import { randomUUID } from 'node:crypto'
import { readFile, stat } from 'node:fs/promises'
import { basename, resolve } from 'node:path'
import type {
  HostAgentDefaultModel, HostAgentPresets, HostAttachments, HostContext, HostLogger, HostLlm,
  HostWorkspace, UserFileContent, UserMessage,
} from './host.js'
import type { PluginConfig } from './config.js'
import { receiptInstruction, registerReceiptTool } from './receipt.js'
import type { InstanceSnapshot, PermissionMode, TaskStore } from './store.js'

/**
 * 派发前置条件失败（决策 22 / 决策 23）：scheduler 按具体 reason 收敛实例，而非笼统 dispatch-error。
 * reason 取值：no-model-route / agent-create-failed / receipt-tool-unavailable / workspace-attach-failed。
 */
export class DispatchPreconditionError extends Error {
  constructor(readonly reason: string, message: string) {
    super(message)
    this.name = 'DispatchPreconditionError'
  }
}

/**
 * 工作区名 → 工作区实体（决策 22：target.workspace 语义是**工作区**，不是工作目录；
 * 目录由实体 path 派生）。registry 无按 name 查询 API，遍历 list() 比对：
 * title 精确匹配优先，id 兜底。匹配不到即抛错 ⇒ 任务判失败，绝不落到「未分组」或随便找个目录跑。
 * （Loop A 落库前的前置检查用；Loop B 发动走 resolveWorkspaceByPath——快照里存的是 path。）
 */
export function resolveWorkspace(ctx: HostContext, name: string): HostWorkspace {
  const workspaces = ctx.workspaceRegistry.list()
  const hit = workspaces.find(workspace => workspace.title === name)
    ?? workspaces.find(workspace => workspace.id === name)
  if (hit === undefined) {
    throw new Error(`找不到工作区 "${name}"（任务必须挂在一个已注册工作区下；已注册: ${
      workspaces.map(workspace => workspace.title).join(', ') || '(无)'}）`)
  }
  return hit
}

/**
 * 工作区 path → 工作区实体（决策 41：Loop B 发动只读快照的 workspacePath）。
 * 快照里的 path 是落库时从实体原样取的，精确比对即可；找不到 = 工作区被删/重建，
 * 行保留走重试判定（失败原因落事件）。
 */
export function resolveWorkspaceByPath(ctx: HostContext, path: string): HostWorkspace {
  const hit = ctx.workspaceRegistry.list().find(workspace => workspace.path === path)
  if (hit === undefined) {
    throw new Error(`找不到 path 为 "${path}" 的工作区（派发时存在、发动时消失；请在工作区注册表里恢复后等重试）`)
  }
  return hit
}

/** 命中漏斗的层级（写进 dispatch 事件，便于排查本次用了哪一层）。 */
export type ModelSource = 'task' | 'plugin-config' | 'host-default' | 'llm-first'

export interface ModelResolution {
  provider: string
  model: string
  source: ModelSource
}

/** 一层候选：空串 = 该层未配。provider 与 model 须成对（宿主 prepareRequest 一并校验）。 */
interface ModelCandidate {
  provider: string
  model: string
}

/**
 * provider 反查：在已注册 provider 里找第一个能发现该 model 的。
 * 宿主明示模型目录是 advisory（未列出不等于不可用），故本函数只用于「补全」，
 * 查不到时由调用方继续下漏，而不是把这一层判成非法。
 */
async function lookupProvider(
  llm: HostLlm, model: string, logger: HostLogger, label: string,
): Promise<string | undefined> {
  for (const provider of llm.listProviders()) {
    try {
      const models = await llm.listModels(provider.id)
      if (models.some(item => item.id === model)) return provider.id
    } catch (error) {
      logger.warn(`${label} 反查 provider 时读取 ${provider.id} 模型目录失败: ${String(error)}`)
    }
  }
  return undefined
}

/** 解析漏斗的一层：成对直接用；只给 model 则反查 provider；只给 provider 或反查失败 → 跳过该层。 */
async function resolveLayer(
  ctx: HostContext, logger: HostLogger, source: ModelSource, label: string, candidate: ModelCandidate,
): Promise<ModelResolution | undefined> {
  const provider = candidate.provider.trim()
  const model = candidate.model.trim()
  if (provider.length === 0 && model.length === 0) return undefined
  if (model.length === 0) {
    logger.warn(`${label} 配了 provider 但没有 model（须成对）→ 跳过该层`)
    return undefined
  }
  if (provider.length > 0) return { provider, model, source }
  const llm = ctx.get('llm')
  if (llm === undefined) {
    logger.warn(`${label} 只给了 model "${model}"，但宿主未挂载 llm 服务、无法反查 provider → 跳过该层`)
    return undefined
  }
  const found = await lookupProvider(llm, model, logger, label)
  if (found === undefined) {
    logger.warn(`${label} 只给了 model "${model}"，已注册 provider 中未反查到（模型目录为 advisory）→ 跳过该层`)
    return undefined
  }
  return { provider: found, model, source }
}

/**
 * 模型解析漏斗（决策 22，决策 41 修订第①层来源）：逐层下漏，四层全空返回 undefined
 * （调用方判失败，走重试判定、行保留）。
 *
 * ① 派发快照的 provider/model 提示（= 落库时的任务 target，决策 41：Loop B 不读任务表）
 * ② 插件配置 defaultProvider/defaultModel
 * ③ 宿主默认 ctx.get('agentDefaultModel').currentSelection()（= 用户配的 / 上次用的模型）
 * ④ llm 首个可用：listProviders() 首个能列出模型的 provider + 其首个模型
 *
 * ⚠️ 只在落库 / 发动时现算，**绝不回写**任务定义或配置：用户日后换模型要能自动跟上，
 * 在配置期固化等于自己废掉兜底。
 */
export async function resolveModelRoute(
  ctx: HostContext, logger: HostLogger, providerHint: string, modelHint: string, config: PluginConfig,
  hintLabel = '派发快照的 target',
): Promise<ModelResolution | undefined> {
  const fromTask = await resolveLayer(ctx, logger, 'task', hintLabel, {
    provider: providerHint,
    model: modelHint,
  })
  if (fromTask !== undefined) return fromTask

  const fromConfig = await resolveLayer(ctx, logger, 'plugin-config', '插件配置 defaultProvider/defaultModel', {
    provider: config.defaultProvider,
    model: config.defaultModel,
  })
  if (fromConfig !== undefined) return fromConfig

  const hostDefault: HostAgentDefaultModel | undefined = ctx.get('agentDefaultModel')
  if (hostDefault !== undefined) {
    try {
      const route = hostDefault.currentSelection()
      if (typeof route?.provider === 'string' && route.provider.length > 0
        && typeof route.model === 'string' && route.model.length > 0) {
        return { provider: route.provider, model: route.model, source: 'host-default' }
      }
      logger.warn('宿主 agentDefaultModel 未给出可用的 provider/model → 继续下漏')
    } catch (error) {
      logger.warn(`读取宿主默认模型失败: ${String(error)}`)
    }
  }

  const llm = ctx.get('llm')
  if (llm !== undefined) {
    for (const provider of llm.listProviders()) {
      try {
        const first = (await llm.listModels(provider.id))[0]
        if (first !== undefined) return { provider: provider.id, model: first.id, source: 'llm-first' }
      } catch (error) {
        logger.warn(`llm 首个可用模型探测失败 ${provider.id}: ${String(error)}`)
      }
    }
  }

  logger.warn('模型漏斗四层全部落空（决策 22）：请在 target 或插件配置里指定 provider+model')
  return undefined
}

/** 已解析的 preset 组装方式（决策 23）：presets 服务 + 要挂的 preset id。 */
interface AgentComposition {
  presets: HostAgentPresets
  presetId: string
}

/**
 * 解析「与用户新建会话相同」的 agent 组装方式（决策 23）：取**部署默认** preset
 * （`resolve()` 省略 id = settings 的 selectionPolicy().defaultId，热读）。
 *
 * preset 决定 agent 的**工具、prompt sections、skill 目录**（含工作区 AGENTS.md 注入）。
 * 不挂 preset 的 agent 落到「空的全局层」——真机实测只剩下根作用域的 MCP 工具，fs/bash 全无。
 * 这里没有任何硬编码工具清单：部署往 preset 的 composition 里加什么，派发的会话就有什么。
 *
 * @returns 组装方式；presets 服务未挂载、或部署无可用 preset（rosterless）时返回 undefined
 * ——那种部署下这些行住在宿主 composition 的全局层，不挂也看得见，故**跳过而非判失败**。
 */
async function resolveAgentComposition(
  ctx: HostContext, logger: HostLogger, instanceId: string,
): Promise<AgentComposition | undefined> {
  const presets: HostAgentPresets | undefined = ctx.get('agentPresets')
  if (presets === undefined) {
    logger.warn(`实例 ${instanceId}: 宿主未挂载 agentPresets 服务，按 rosterless 处理（工具/提示词取全局层）`)
    return undefined
  }
  try {
    const { id } = await presets.resolve()
    return { presets, presetId: id }
  } catch (error) {
    logger.warn(`实例 ${instanceId}: 解析部署默认 preset 失败，按 rosterless 处理: ${String(error)}`)
    return undefined
  }
}

/**
 * 插件→会话的用户消息（决策 19：追问层用，form=notice 走系统通知样式）。
 * source.kind 用**生产者自有 kind**（0.1.7 v4 格式要求，`kind: 'plugin'` 已废弃被拒）。
 */
export function userNotice(text: string, summary: string, files: readonly UserFileContent[] = []): UserMessage {
  return {
    id: randomUUID(),
    role: 'user',
    // 文本块在前、文件块在后：官方按 content 顺序渲染（气泡正文 + 下方附件卡）。
    content: [{ type: 'text', text }, ...files],
    source: {
      kind: 'task-dispatch-table',
      form: 'notice',
      summary,
    },
  }
}

/**
 * 宿主 ctx 命名空间属性的安全读取：ctx 的属性是 getter，**对应模块未 inject 时读取直接 throw**
 * （真机实证：`cannot get property "agentTeams" without inject` ⇒ 派发 launch-error）。
 * 探测语义 = 「有就用、没有就降级」，所以这里把 throw 归一成 undefined，绝不让它炸掉派发。
 */
function readCtxProp(ctx: unknown, key: string): unknown {
  try {
    return (ctx as Record<string, unknown>)[key]
  } catch {
    return undefined
  }
}

/**
 * 上游依赖段（决策 43）：把快照里冻结的 resolvedDeps 渲染给下游 agent——
 * 产出路径按**上游**工作区绝对化（基准不是下游工作区）；上游旧行无快照 ⇒ 基准未知，原样给相对路径。
 */
function dependencyLines(snapshot: InstanceSnapshot): string[] {
  const deps = snapshot.resolvedDeps
  if (deps === undefined || deps.length === 0) return []
  const lines = ['', '上游依赖（落库时已锁定，勿自行查找最新产出）：']
  for (const dep of deps) {
    const head = `- 任务 ${dep.task}（${dep.semantics === 'same_period' ? '同周期' : '最近成功'}）：`
      + `实例 ${dep.instanceId.slice(0, 8)} · 计划时刻 ${dep.scheduledAt}`
    if (dep.outputs.length === 0) {
      lines.push(`${head} · 未声明产出`)
      continue
    }
    lines.push(`${head}，产出：`)
    for (const output of dep.outputs) {
      lines.push(`  - ${dep.workspacePath === null ? `${output}（基准工作区未知，相对路径）` : resolve(dep.workspacePath, output)}`)
    }
  }
  return lines
}

/**
 * 权限约束指令（决策 50）：宿主 0.2.0-rc.2 的 `AgentOptions` 只有 provider / model /
 * reasoningEffort / maxTokens，**没有按任务下发权限的参数**（权限是宿主新建会话 UI 的会话级设置），
 * 故所选档位以派发消息中的约束指令执行——这是我们能真执行的语义，不做系统级拦截的假承诺；
 * 宿主一旦开放 per-task 权限参数，此处改为随派发下发。默认档不加任何指令。
 */
function permissionInstruction(mode: PermissionMode): string | null {
  if (mode === 'readOnly') return '权限：本次仅可查看。只读工作区内容，禁止写入、修改或删除任何文件，禁止执行会产生副作用的命令。'
  if (mode === 'workspace') return `权限：仅可在目标工作区（${WORKSPACE_PLACEHOLDER}）内修改文件，禁止改动工作区之外的任何内容。`
  if (mode === 'full') return '权限：完全权限，按任务需要执行（工作目录仍为目标工作区）。'
  return null
}
/** 权限指令里的工作区占位符：拼装时替换成真实工作区绝对路径（文案不写死路径）。 */
const WORKSPACE_PLACEHOLDER = '{{workspace}}'

/**
 * 派发消息拼装（决策 12 模板 + 决策 24 回执工具 + 决策 41 快照化 + 决策 43 依赖冻结段 +
 * 决策 49 团队段 + **随附文件段（决策 54）** + **执行时间段（U4，2026-10-05）**）：短指令 prompt +
 * 手册路径 + 执行时间（原定 / 实际派发，给了 times 才注入）+ 上游依赖段 + **随附文件段** +
 * 团队执行段（仅 agentTeam 且宿主具备时）+ 回执调用说明。
 * prompt / manual / validStatuses / resolvedDeps / attachments 全部来自派发快照，与任务设置无关。
 *
 * 随附文件**两手都给**（2026-10-03 拍板）：
 * ① **文本路径**——把**绝对路径**逐条写清（「从哪一层开始」就是它），并显式声明「允许读取」，否则
 *    会与下面的权限指令（「仅工作区」）打架——upload 型附件落在**任务目录**（工作区之外），
 *    不开口子模型就等于看不见；
 * ② **官方 file 内容块**——把文件注册进宿主附件库（`ctx.attachments`），模型侧由宿主换成一句
 *    「只读副本路径」（`projectFilesToText`），**不额外吃 token**；人的那一面则由官方渲染成
 *    **附件卡**（图标 + 文件名 + 大小，可点开），且 fork 续聊带得走、当时那一份内容被钉住。
 */
export function buildMessage(
  snapshot: InstanceSnapshot,
  workspacePath: string,
  logicalDate: string,
  teamMode = false,
  attachments: readonly DispatchAttachment[] = [],
  fileBlocks: readonly UserFileContent[] = [],
  /** 执行时间两条（用户 2026-10-05 拍板，U4 收口）：不给 ⇒ 不注入该段（旧调用 / 冒烟旧行为不变）。 */
  times?: { scheduledAt: string; dispatchedAt: string },
): UserMessage {
  // 回执说明**只放一处、且放最末**（用户 2026-09-30 拍板，推翻先前的"放最前 + 首尾双写"）：
  // 真机证据 —— 模型**跳过了第 1 段**的回执要求（回了句问候就收工），而插件那条**只含回执要求**的
  // 追问它**立刻照做** ⇒ 越靠后、越"只讲这一件事"的段落遵守率越高；同一条指令出现两处，反而被当成
  // 背景噪音（注释此前写着"只放最前"，代码却首尾各放一次 ⇒ 一处口径、一处行为，本次一并纠正）。
  // 任务提示词排在最前，靠**末段那句显式优先级裁决**压住「不要做其他事情」这类说法。
  const lines = [
    snapshot.prompt,
    '',
    `任务实例：${snapshot.title} · ${logicalDate}（目标工作区：${workspacePath}）`,
  ]
  // 执行时间两条（用户 2026-10-05 拍板，U4 收口）：模型对「现在几点」未必可靠（真机 once8 产出
  // 文件日期差过一天）⇒ 把**原定时刻**与**实际派发时刻**原样下发（ISO 8601 / UTC，精确到秒），
  // 模型要处理自己处理。只给**事实**：日期的业务语义（如「日报算调度那天还是自然天」）仍由任务
  // 提示词自定，插件不越权（用户 2026-10-05：这个插件解决不了）。
  if (times !== undefined) {
    lines.push(`执行时间：原定 ${times.scheduledAt} · 实际派发 ${times.dispatchedAt}（ISO 8601，UTC；你的当前时间以实际派发为准）`)
  }
  if (snapshot.manual !== null && snapshot.manual.trim() !== '') {
    lines.push(`任务手册：先读工作区内 ${snapshot.manual}，再按手册执行。`)
  }
  lines.push(...dependencyLines(snapshot))
  lines.push(...attachmentLines(attachments))
  if (teamMode) {
    // 决策 49 多 Agent 协作段：官方 experimental profile（tool-agent-team）已给根会话 agent
    // 装好 spawn_teammate / send_message / list_agents / wait_agent / interrupt_agent /
    // team_task_* 工具（lib/index.js:242-445 源码核实），这里只负责把「按团队方式执行」讲清楚；
    // 工具名如实列出，不做任何模拟通道。
    lines.push(
      '执行方式：本次启用多 Agent 协作。你作为团队队长（lead），请按需把可并行的子工作拆给队友：'
      + '用 spawn_teammate 创建命名队友（写清职责），用 team_task_create 在共享任务板上登记分工与依赖，'
      + '用 send_message 向队友下发具体指引，并用 wait_agent 等待其完成；'
      + '队友与你在同一工作区工作。所有工作收束后由你统一汇总，并按下方要求交回执行结果。',
    )
  }
  const permissionLine = permissionInstruction(snapshot.permission ?? 'default')
  if (permissionLine !== null) {
    lines.push(permissionLine.replace(WORKSPACE_PLACEHOLDER, workspacePath))
    // 权限口子：随附文件可能是「工作区之外」的只读输入 ⇒ 必须显式豁免，且只放开读、不放开写。
    if (attachments.length > 0) {
      lines.push(
        '说明：上方「本次随附文件」列出的路径是本次派发随附的只读输入，允许读取；'
        + '它们不受本条权限指令里「仅在目标工作区内」的限制（同样不得修改、删除）。',
      )
    }
  }
  lines.push(receiptInstruction(snapshot.validStatuses))
  return userNotice(lines.join('\n'), `[TASK] ${snapshot.title} · ${logicalDate}`, fileBlocks)
}

/**
 * 派发消息里的随附文件条目（2026-09-30）：ref 已在 Loop B 解析成**绝对路径**。
 * `path === null` = 来源工作区解析不出 ⇒ 如实标注「工作区相对路径」，**绝不猜**。
 */
export interface DispatchAttachment {
  name: string
  kind: 'link' | 'upload'
  /** link 型的工作区相对路径原文（基准未知时如实展示）。 */
  ref: string
  path: string | null
}

/** 随附文件段（用户 2026-09-30：必须让模型明确知道文件在哪一层、在什么地方）。 */
function attachmentLines(list: readonly DispatchAttachment[]): string[] {
  if (list.length === 0) return []
  const lines = ['', '本次随附文件（只读输入，请勿修改；以下均为可直接读取的绝对路径）：']
  for (const item of list) {
    const tag = item.kind === 'upload' ? '上传' : '工作区'
    lines.push(item.path === null
      ? `  - ${item.name}（${tag}）：${item.ref}（基准工作区未知，为工作区相对路径）`
      : `  - ${item.name}（${tag}）：${item.path}`)
  }
  return lines
}

/** 单个附件进宿主附件库的字节上限（防御：误挂大文件不至于把附件库撑爆；库**永不自动删除**）。 */
const ATTACHMENT_BLOCK_MAX_BYTES = 8 * 1024 * 1024
/** 一次派发最多注册多少个附件块（同上，防御性上限）。 */
const ATTACHMENT_BLOCK_MAX_COUNT = 20

/**
 * 随附文件 → 官方 `file` 内容块（2026-10-03 拍板「附加文件走 A」）。
 *
 * 逐个把文件字节交给宿主附件服务 `ctx.attachments.saveFile`（内容寻址、不可变、
 * **永不自动删除**），拿回持久引用后拼成 file 块随派发消息发出 ⇒ 官方界面渲染成
 * **附件卡**（图标 + 文件名 + 大小，可点开）、fork 续聊带得走、当时那份内容被钉住。
 *
 * **降级不阻塞**：宿主没挂 `dsh-attachment-local`、文件不在盘上、是目录、超过上限、
 * 或 saveFile 抛错 ⇒ 该附件**只留文本路径**（2026-10-03 前的行为），派发照常。
 *
 * ⚠️ 目录**不能**作为附件：官方附件 = 一段字节，`FileAttachmentRef` 里没有路径
 * （`dsh-attachment` `lib/types/types.d.ts:34-41`）。
 */
export async function attachmentFileBlocks(
  ctx: HostContext,
  attachments: readonly DispatchAttachment[],
  logger: HostLogger,
  instanceId: string,
): Promise<UserFileContent[]> {
  const store = readCtxProp(ctx, 'attachments') as HostAttachments | undefined
  if (store === undefined) {
    logger.warn(`[dispatch] attachment-store-unavailable 实例 ${instanceId}：宿主未暴露 ctx.attachments（需 dsh-attachment-local），随附文件本次只给路径`)
    return []
  }
  const blocks: UserFileContent[] = []
  for (const item of attachments.slice(0, ATTACHMENT_BLOCK_MAX_COUNT)) {
    if (item.path === null) continue
    try {
      const info = await stat(item.path)
      if (!info.isFile()) continue
      if (info.size > ATTACHMENT_BLOCK_MAX_BYTES) {
        logger.warn(`[dispatch] attachment-too-large 实例 ${instanceId}：${item.name} 超过 ${ATTACHMENT_BLOCK_MAX_BYTES} 字节，本次只给路径`)
        continue
      }
      const data = await readFile(item.path)
      const ref = await store.saveFile({ data, name: item.name.trim() === '' ? basename(item.path) : item.name })
      blocks.push({ type: 'file', attachment: ref })
    } catch (error) {
      logger.warn(`[dispatch] attachment-block-failed 实例 ${instanceId}：${item.name} 未注册进宿主附件库（${String(error)}），本次只给路径`)
    }
  }
  return blocks
}

export interface DispatchInput {
  ctx: HostContext
  /** tee logger（显式传参——ctx 不可包装，见 host.ts HostLogger 注释）。 */
  logger: HostLogger
  store: TaskStore
  /** 已落库实例：UUID 主键，状态应为 dispatched（决策 41：Loop B 发动）。 */
  instanceId: string
  logicalDate: string
  scheduledAt: string
  /** 派发快照（决策 41）：prompt / manual / workspacePath / 模型提示 / validStatuses 全在其中。 */
  snapshot: InstanceSnapshot
  /** 已按快照 path 解析的工作区实体（决策 22）：cwd 由它的 path 派生，会话建成后 attach 归组。 */
  workspace: HostWorkspace
  /**
   * 随附文件（2026-09-30）：ref 已由 Loop B 解析成**绝对路径**，随派发消息注入。
   * （2026-10-03 起两手都给：文本路径 + 官方 file 内容块，见 {@link attachmentFileBlocks}。）
   */
  attachments: readonly DispatchAttachment[]
  /** 插件配置（决策 22 漏斗第②层取 defaultProvider/defaultModel，发动时现算）。 */
  config: PluginConfig
}

/** agent handle：ctx.agents.create 的返回（追问时用于再推一轮对话）。 */
export type AgentHandle = Awaited<ReturnType<HostContext['agents']['create']>>

/**
 * 发动一个已落库实例（决策 41：Loop B 发动；决策 22 顺序 + 决策 23 preset 组装）：
 * 解析模型漏斗（第①层取快照提示）→ **解析部署默认 preset** → 落 session_id → agents.create
 * （自建会话并 announce session/created，对账收到时实例必已带 session_id；preset 在 create 的
 * setup 里 mount，工具/prompt sections/skill 由此挂上）→ **工作区 attachSession 归组**
 * → 落 dispatch 事件（含本次实测 route、命中层级与 preset）→ send。
 * 会话改名在 reconciler.onCreated 做——此处拿不到 Session 对象（handle 只有 agent）。
 * @returns sessionId 与 agent handle——handle 供对账层超时追问（决策 19 第二层）。
 * @throws DispatchPreconditionError 模型解析不出、会话建不起来（含 preset 挂载失败）、
 *   或会话建好后无法归组工作区——调用方（Loop B）按重试判定收敛、**行保留**。
 */
export async function dispatchTask(input: DispatchInput): Promise<{ sessionId: string; handle: AgentHandle }> {
  const { ctx, logger, store, instanceId, logicalDate, snapshot, workspace, config } = input

  const route = await resolveModelRoute(ctx, logger, snapshot.provider, snapshot.model, config)
  if (route === undefined) {
    // 前置条件不足：不建会话、不发动（先于 session_id 落库，实例行不留假 session）。
    throw new DispatchPreconditionError(
      'no-model-route',
      `实例 ${instanceId} 无法解析出 provider+model，不发动（决策 22 漏斗四层全空）`,
    )
  }

  // 组装方式（决策 23）：部署默认 preset——与用户在 UI 新建会话同一套。
  const composition = await resolveAgentComposition(ctx, logger, instanceId)

  const sessionId = randomUUID()
  // 领取后先把会话身份落到实例行，再建 agent——session/created（factory announce）
  // 到达时实例必已带 session_id，对账可立即转 running。
  // ⚠️ dispatched_at 必须在此写入（原由 store.casClaim 负责，决策 31 懒建行后已不走 CAS）：
  // ① sweep 用它算「等 session/created」的派发宽限；② `latestReceipt` 用它做 afterIso，
  // 防上一轮 attempt 的旧回执冒充本轮。缺失会退到 updated_at（最后一次状态变更，晚于回执）
  // ⇒ 旧回执会被当成新回执。
  // （2026-10-03：回执校验已不再用 mtime 比它判新鲜 —— 见 reconcile.ts checkReceipt。）
  store.transition(instanceId, {
    status: 'dispatched',
    session_id: sessionId,
    dispatched_at: new Date().toISOString(),
    detail: 'assign-session',
  })

  // provider/model 必须成对显式传（决策 22）：宿主缺省不填 {{model}}，deployment persona
  // 里的 {{model}} 取不到值会直接抛错、本轮秒结束。会话由本调用自建，禁止预建（见文件头）。
  // setup（决策 23）是**唯一**能挂上模型可见层（工具 / prompt sections / skill）的时机：
  // 在 mint agentCtx 之后、发布之前。抛错则工厂回滚作用域、会话与 agent 都不发布，故这里
  // 撤回占位 session_id——实例行不留一个从未发布过的会话身份。
  let handle: AgentHandle
  try {
    handle = await ctx.agents.create({
      sessionId,
      meta: {
        cwd: workspace.path,
        ...(composition === undefined ? {} : { agentPreset: composition.presetId }),
      },
      agentOptions: { provider: route.provider, model: route.model },
      // setup 是发布前唯一能组装 agent 作用域的时机（决策 23 / 24）：
      // ① 挂 preset（工具 / prompt sections / skill 跟随系统）；② 注册本实例专属的回执工具
      // （per-agent，只对该会话可见；execute 在插件进程内写库，绕开 agent 沙箱——决策 24）。
      setup: async (agentCtx: unknown): Promise<void> => {
        if (composition !== undefined) await composition.presets.mount(agentCtx, composition.presetId)
        // 回执工具注册不上 ⇒ 这个会话没有任何回执通道，跑完必然白跑（决策 24）：当作前置条件
        // 失败直接抛，工厂会回滚作用域、不发布会话；Loop B 按 receipt-tool-unavailable 收敛。
        if (!registerReceiptTool(agentCtx, {
          store,
          taskName: snapshot.title,
          instanceId,
          sessionId,
          validStatuses: snapshot.validStatuses,
          logger,
          sessionProjections: (ctx as { sessionProjections?: unknown }).sessionProjections,
        })) {
          throw new DispatchPreconditionError(
            'receipt-tool-unavailable',
            `实例 ${instanceId} 的回执工具未注册成功（同名冲突或宿主未暴露 tools 服务），不发动`,
          )
        }
      },
    })
  } catch (error) {
    store.transition(instanceId, { status: 'dispatched', session_id: null, detail: 'create-failed' })
    // setup 里抛的前置条件失败（如 receipt-tool-unavailable）原样上抛，保住具体 reason。
    if (error instanceof DispatchPreconditionError) throw error
    throw new DispatchPreconditionError(
      'agent-create-failed',
      `实例 ${instanceId} 会话 ${sessionId} 未能建立（preset=${composition?.presetId ?? '(rosterless)'}）: ${String(error)}`,
    )
  }

  // 归组（决策 22）：只设 meta.cwd 不会进工作区 sessionIds，必须显式 attach；
  // attach 内部要求 session header 的 cwd 归一后 === workspace.path，故 cwd 只能取自本实体。
  try {
    await workspace.attachSession(sessionId)
  } catch (error) {
    void handle.dispose().catch(() => {})
    throw new DispatchPreconditionError(
      'workspace-attach-failed',
      `会话 ${sessionId} 已建立但无法归入工作区 "${workspace.title}"（${workspace.path}）: ${String(error)}`,
    )
  }

  // 多 Agent 协作探测（决策 49）：快照开启且宿主暴露 ctx.agentTeams（experimental Agent Teams
  // profile）才注入团队执行指令；profile 未启用 ⇒ 降级单 Agent + 告警留痕，不阻塞派发
  // （与决策 48 goal-unavailable 同款语义；正常功能一律真实——绝不注入装不出来的假指令）。
  // ⚠️ 宿主 ctx 的命名空间属性是 getter：**对应模块未 inject 时读取会直接 throw**（真机实证：
  // `cannot get property "agentTeams" without inject` ⇒ 整次派发 launch-error），必须护栏读。
  const teamAvailable = readCtxProp(ctx, 'agentTeams') !== undefined
  const teamMode = snapshot.agentTeam === true && teamAvailable
  if (snapshot.agentTeam === true && !teamAvailable) {
    logger.warn(`[dispatch] agent-team-unavailable 实例 ${instanceId}：宿主未启用 Agent Teams（ctx.agentTeams 缺失），按单 Agent 执行`)
  }

  // route/source/preset 落事件：只记本次实测用了什么，不回写任务定义或配置。
  store.appendEvent(instanceId, 'dispatch', {
    sessionId,
    workspacePath: workspace.path,
    provider: route.provider,
    model: route.model,
    modelSource: route.source,
    ...(composition === undefined ? {} : { agentPreset: composition.presetId }),
    goal: snapshot.goal !== false,
    agentTeam: snapshot.agentTeam === true,
    permission: snapshot.permission ?? 'default',
    teamMode,
  })

  // /goal 多轮续跑（决策 48，用户 2026-09-29「默认都是多轮会话」）：目标开启时把任务目标交给
  // dsh 内置 /goal（ctx.goals，@deepseek-ai/dsh-goal 0.2.0-rc.2：CreateGoalRequest { objective }；
  // goal continuation round 自动续跑、agent 标记 complete 收束，看板届时才结算）。宿主未暴露
  // goals 服务或创建失败都不阻塞派发（本轮照常执行），只落警告留痕——行为与开关语义一致。
  if (snapshot.goal !== false) {
    const goals = readCtxProp(ctx, 'goals') as { create(agent: unknown, request: { objective: string; maxGoalRounds?: number }): Promise<unknown> } | undefined
    if (goals === undefined) {
      logger.warn(`[dispatch] goal-unavailable 实例 ${instanceId}：宿主 ctx 未暴露 goals 服务，本轮按单轮执行`)
    } else {
      try {
        // ⚠️ goal 是**另一个指令入口**（宿主持久目标 + 自动续跑轮）：真机"首轮只回一句问候、不交回执"
        // 与它高度吻合（那一轮模型可能只看到 objective，而它原先**不含任何回执要求**）。补一句指针做
        // 零风险对冲 —— 完整说明仍在派发消息最末段。
        await goals.create(handle.agent, {
          objective: `${snapshot.title}：${snapshot.prompt}\n\n`
            + '【回执】本轮回复结束前必须按派发消息里的说明提交回执（不提交等于失败；没有产出也要交）。',
        })
      } catch (error) {
        logger.warn(`[dispatch] goal-create-failed 实例 ${instanceId}：${String(error)}`)
      }
    }
  }
  // 会话列表治理：规范名在 reconciler.onCreated 改（决策 42 格式），跑完归档在 succeeded 对账后。
  // 随附文件 → 官方 file 块（2026-10-03 拍板「附加文件走 A」）：注册不成功/宿主无附件服务
  // 都不阻塞派发，退化成只给路径。放在 send 前——注册的是**当时那份字节**，会话里钉住版本。
  const fileBlocks = input.attachments.length === 0
    ? []
    : await attachmentFileBlocks(ctx, input.attachments, logger, instanceId)
  if (fileBlocks.length > 0) {
    store.appendEvent(instanceId, 'dispatch', { attachmentBlocks: fileBlocks.length })
  }
  handle.agent.send(
    buildMessage(snapshot, workspace.path, logicalDate, teamMode, input.attachments, fileBlocks, {
      scheduledAt: input.scheduledAt,
      dispatchedAt: new Date().toISOString(),
    }),
    'next-turn',
    true,
  )
  return { sessionId, handle }
}
