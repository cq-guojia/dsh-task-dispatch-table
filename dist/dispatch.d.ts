import type { HostContext, HostLogger, HostWorkspace, UserFileContent, UserMessage } from './host.js';
import type { PluginConfig } from './config.js';
import type { InstanceSnapshot, TaskStore } from './store.js';
/**
 * 派发前置条件失败（决策 22 / 决策 23）：scheduler 按具体 reason 收敛实例，而非笼统 dispatch-error。
 * reason 取值：no-model-route / agent-create-failed / receipt-tool-unavailable / workspace-attach-failed。
 */
export declare class DispatchPreconditionError extends Error {
    readonly reason: string;
    constructor(reason: string, message: string);
}
/**
 * 工作区名 → 工作区实体（决策 22：target.workspace 语义是**工作区**，不是工作目录；
 * 目录由实体 path 派生）。registry 无按 name 查询 API，遍历 list() 比对：
 * title 精确匹配优先，id 兜底。匹配不到即抛错 ⇒ 任务判失败，绝不落到「未分组」或随便找个目录跑。
 * （Loop A 落库前的前置检查用；Loop B 发动走 resolveWorkspaceByPath——快照里存的是 path。）
 */
export declare function resolveWorkspace(ctx: HostContext, name: string): HostWorkspace;
/**
 * 工作区 path → 工作区实体（决策 41：Loop B 发动只读快照的 workspacePath）。
 * 快照里的 path 是落库时从实体原样取的，精确比对即可；找不到 = 工作区被删/重建，
 * 行保留走重试判定（失败原因落事件）。
 */
export declare function resolveWorkspaceByPath(ctx: HostContext, path: string): HostWorkspace;
/** 命中漏斗的层级（写进 dispatch 事件，便于排查本次用了哪一层）。 */
export type ModelSource = 'task' | 'plugin-config' | 'host-default' | 'llm-first';
export interface ModelResolution {
    provider: string;
    model: string;
    source: ModelSource;
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
export declare function resolveModelRoute(ctx: HostContext, logger: HostLogger, providerHint: string, modelHint: string, config: PluginConfig, hintLabel?: string): Promise<ModelResolution | undefined>;
/**
 * 插件→会话的用户消息（决策 19：追问层用，form=notice 走系统通知样式）。
 * source.kind 用**生产者自有 kind**（0.1.7 v4 格式要求，`kind: 'plugin'` 已废弃被拒）。
 */
export declare function userNotice(text: string, summary: string, files?: readonly UserFileContent[]): UserMessage;
/**
 * 派发消息拼装（决策 12 模板 + 决策 24 回执工具 + 决策 41 快照化 + 决策 43 依赖冻结段 +
 * 决策 49 团队段 + **随附文件段（决策 54）**）：短指令 prompt + 手册路径 + 上游依赖段 + **随附文件段** +
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
export declare function buildMessage(snapshot: InstanceSnapshot, workspacePath: string, logicalDate: string, teamMode?: boolean, attachments?: readonly DispatchAttachment[], fileBlocks?: readonly UserFileContent[]): UserMessage;
/**
 * 派发消息里的随附文件条目（2026-09-30）：ref 已在 Loop B 解析成**绝对路径**。
 * `path === null` = 来源工作区解析不出 ⇒ 如实标注「工作区相对路径」，**绝不猜**。
 */
export interface DispatchAttachment {
    name: string;
    kind: 'link' | 'upload';
    /** link 型的工作区相对路径原文（基准未知时如实展示）。 */
    ref: string;
    path: string | null;
}
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
export declare function attachmentFileBlocks(ctx: HostContext, attachments: readonly DispatchAttachment[], logger: HostLogger, instanceId: string): Promise<UserFileContent[]>;
export interface DispatchInput {
    ctx: HostContext;
    /** tee logger（显式传参——ctx 不可包装，见 host.ts HostLogger 注释）。 */
    logger: HostLogger;
    store: TaskStore;
    /** 已落库实例：UUID 主键，状态应为 dispatched（决策 41：Loop B 发动）。 */
    instanceId: string;
    logicalDate: string;
    scheduledAt: string;
    /** 派发快照（决策 41）：prompt / manual / workspacePath / 模型提示 / validStatuses 全在其中。 */
    snapshot: InstanceSnapshot;
    /** 已按快照 path 解析的工作区实体（决策 22）：cwd 由它的 path 派生，会话建成后 attach 归组。 */
    workspace: HostWorkspace;
    /**
     * 随附文件（2026-09-30）：ref 已由 Loop B 解析成**绝对路径**，随派发消息注入。
     * （2026-10-03 起两手都给：文本路径 + 官方 file 内容块，见 {@link attachmentFileBlocks}。）
     */
    attachments: readonly DispatchAttachment[];
    /** 插件配置（决策 22 漏斗第②层取 defaultProvider/defaultModel，发动时现算）。 */
    config: PluginConfig;
}
/** agent handle：ctx.agents.create 的返回（追问时用于再推一轮对话）。 */
export type AgentHandle = Awaited<ReturnType<HostContext['agents']['create']>>;
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
export declare function dispatchTask(input: DispatchInput): Promise<{
    sessionId: string;
    handle: AgentHandle;
}>;
