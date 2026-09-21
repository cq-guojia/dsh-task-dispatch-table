import type { HostContext, UserMessage } from './host.js';
import type { TaskDefinition } from './tasks.js';
import type { TaskStore } from './store.js';
/**
 * 工作区名 → 绝对路径。registry 无按 name 查询 API
 * （packages/workspace/workspace/src/index.ts:157-305），遍历 list() 比对：
 * title 精确匹配优先，id 兜底（WorkspaceEntity title/path 见 entity.ts:79-91）。
 */
export declare function resolveWorkspacePath(ctx: HostContext, name: string): string;
/** 派发消息拼装（决策 12 模板：短指令 prompt + 手册路径 + 契约文件要求）。 */
export declare function buildMessage(task: TaskDefinition, workspacePath: string, logicalDate: string): UserMessage;
export interface DispatchInput {
    ctx: HostContext;
    store: TaskStore;
    task: TaskDefinition;
    /** 已领取实例：形如 "<task_id>:<logical_date>"，状态应为 dispatched。 */
    instanceId: string;
    logicalDate: string;
    workspacePath: string;
}
/**
 * 派发一个已 CAS 领取的实例。同步段（写 session_id → sessions.create）不 await，
 * 保证 session/created 同步 emit（core/session/src/index.ts:50）时实例已带 session_id，
 * 事件对账可立即转 running。
 */
export declare function dispatchTask(input: DispatchInput): Promise<void>;
