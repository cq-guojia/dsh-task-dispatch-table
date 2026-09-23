import type { HostContext, HostLogger, UserMessage } from './host.js';
import type { TaskDefinition } from './tasks.js';
import type { TaskStore } from './store.js';
/** 回执提交程序（决策 19）：与本文件同在 dist/，运行期按自身位置定位（包 type=module，.js 即 ESM）。 */
export declare const SUBMIT_JS: string;
/**
 * 工作区名 → 绝对路径。registry 无按 name 查询 API
 * （packages/workspace/workspace/src/index.ts:157-305），遍历 list() 比对：
 * title 精确匹配优先，id 兜底（WorkspaceEntity title/path 见 entity.ts:79-91）。
 */
export declare function resolveWorkspacePath(ctx: HostContext, name: string): string;
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
    workspacePath: string;
    /** 状态库绝对路径（决策 19）：拼进回执命令行，agent 侧零环境猜测。 */
    statePath: string;
}
/** agent handle：ctx.agents.create 的返回（追问时用于再推一轮对话）。 */
export type AgentHandle = Awaited<ReturnType<HostContext['agents']['create']>>;
/**
 * 派发一个已 CAS 领取的实例。同步段（写 session_id → sessions.create）不 await，
 * 保证 session/created 同步 emit（core/session/src/index.ts:50）时实例已带 session_id，
 * 事件对账可立即转 running。
 * @returns sessionId 与 agent handle——handle 供对账层超时追问（决策 19 第二层）。
 */
export declare function dispatchTask(input: DispatchInput): Promise<{
    sessionId: string;
    handle: AgentHandle;
}>;
