import type { HostContext, HostLogger, HostWorkspace, UserMessage } from './host.js';
import type { PluginConfig } from './config.js';
import type { TaskDefinition } from './tasks.js';
import type { TaskStore } from './store.js';
/** 回执提交程序（决策 19）：与本文件同在 dist/，运行期按自身位置定位（包 type=module，.js 即 ESM）。 */
export declare const SUBMIT_JS: string;
/**
 * 派发前置条件失败（决策 22 / 决策 23）：scheduler 按具体 reason 收敛实例，而非笼统 dispatch-error。
 * reason 取值：no-model-route / agent-create-failed / workspace-attach-failed。
 */
export declare class DispatchPreconditionError extends Error {
    readonly reason: string;
    constructor(reason: string, message: string);
}
/**
 * 工作区名 → 工作区实体（决策 22：target.workspace 语义是**工作区**，不是工作目录；
 * 目录由实体 path 派生）。registry 无按 name 查询 API，遍历 list() 比对：
 * title 精确匹配优先，id 兜底。匹配不到即抛错 ⇒ 任务判失败，绝不落到「未分组」或随便找个目录跑。
 */
export declare function resolveWorkspace(ctx: HostContext, name: string): HostWorkspace;
/** 命中漏斗的层级（写进 dispatch 事件，便于排查本次用了哪一层）。 */
export type ModelSource = 'task' | 'plugin-config' | 'host-default' | 'llm-first';
export interface ModelResolution {
    provider: string;
    model: string;
    source: ModelSource;
}
/**
 * 模型解析漏斗（决策 22）：逐层下漏，四层全空返回 undefined（调用方判任务失败，不派发）。
 *
 * ① 任务定义 target.provider/target.model
 * ② 插件配置 defaultProvider/defaultModel
 * ③ 宿主默认 ctx.get('agentDefaultModel').currentSelection()（= 用户配的 / 上次用的模型）
 * ④ llm 首个可用：listProviders() 首个能列出模型的 provider + 其首个模型
 *
 * ⚠️ 只在派发时现算，**绝不回写**任务定义或配置：用户日后换模型要能自动跟上，
 * 在配置期固化等于自己废掉兜底。
 */
export declare function resolveModelRoute(ctx: HostContext, logger: HostLogger, task: TaskDefinition, config: PluginConfig): Promise<ModelResolution | undefined>;
/**
 * 回执提交命令行（决策 19）：--db/--task/--date/--session 由调度器填好，
 * agent 只补 --status 与 --outputs。派发消息与追问消息共用同一拼装。
 */
export declare function submitCommand(task: TaskDefinition, logicalDate: string, sessionId: string, statePath: string): string;
/** 插件→会话的用户消息（决策 19：追问层用，form=notice 走系统通知样式）。 */
export declare function userNotice(text: string, summary: string): UserMessage;
/**
 * 派发消息拼装（决策 12 模板 + 决策 19 回执命令）：短指令 prompt + 手册路径
 * + 现成的回执提交命令行（submitCommand 拼装，agent 只补 --status 与 --outputs）。
 */
export declare function buildMessage(task: TaskDefinition, workspacePath: string, logicalDate: string, sessionId: string, statePath: string): UserMessage;
export interface DispatchInput {
    ctx: HostContext;
    /** tee logger（显式传参——ctx 不可包装，见 host.ts HostLogger 注释）。 */
    logger: HostLogger;
    store: TaskStore;
    task: TaskDefinition;
    /** 已领取实例：形如 "<task_id>:<logical_date>"，状态应为 dispatched。 */
    instanceId: string;
    logicalDate: string;
    /** 已解析的工作区实体（决策 22）：cwd 由它的 path 派生，会话建成后 attach 到它归组。 */
    workspace: HostWorkspace;
    /** 状态库绝对路径（决策 19）：拼进回执命令行，agent 侧零环境猜测。 */
    statePath: string;
    /** 插件配置（决策 22 漏斗第②层取 defaultProvider/defaultModel，派发时现算）。 */
    config: PluginConfig;
}
/** agent handle：ctx.agents.create 的返回（追问时用于再推一轮对话）。 */
export type AgentHandle = Awaited<ReturnType<HostContext['agents']['create']>>;
/**
 * 派发一个已 CAS 领取的实例（决策 22 顺序 + 决策 23 preset 组装）：
 * 解析模型漏斗 → **解析部署默认 preset** → 落 session_id → agents.create（自建会话并
 * announce session/created，晚于 assign-session，对账收到时实例必已带 session_id；preset 在
 * create 的 setup 里 mount，工具/prompt sections/skill 由此挂上）→ **工作区 attachSession 归组**
 * → 落 dispatch 事件（含本次实测 route、命中层级与 preset）→ send。
 * 会话改名在 reconciler.onCreated 做——此处拿不到 Session 对象（handle 只有 agent）。
 * @returns sessionId 与 agent handle——handle 供对账层超时追问（决策 19 第二层）。
 * @throws DispatchPreconditionError 模型解析不出、会话建不起来（含 preset 挂载失败）、
 *   或会话建好后无法归组工作区。
 */
export declare function dispatchTask(input: DispatchInput): Promise<{
    sessionId: string;
    handle: AgentHandle;
}>;
