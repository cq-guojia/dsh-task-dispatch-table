import type { HostContext, HostLogger, HostSession } from './host.js';
import type { TaskDefinition } from './tasks.js';
import type { AgentHandle } from './dispatch.js';
import type { TaskStore, TaskInstance } from './store.js';
export interface ReconcileOptions {
    leaseMs: number;
    dispatchGraceMs: number;
    unknownGraceMs: number;
    /** 当前任务表（scheduler 每 tick 刷新）。 */
    tasks(): Map<string, TaskDefinition>;
}
export interface Reconciler {
    /** 派发成功后登记 agent handle（决策 19：超时追问用），终态/重试时自动遗忘。 */
    registerHandle(sessionId: string, handle: AgentHandle): void;
    onCreated(session: HostSession): void;
    onEvent(session: HostSession, event: {
        type: string;
    }): void;
    onDisposed(session: HostSession): void;
    /** 派发异常等场景的重试判定入口（§6）。 */
    retryOrFail(instance: TaskInstance, reason: string, detail?: unknown): void;
    sweep(): void;
}
export interface ReconcilerDeps {
    ctx: HostContext;
    /** tee logger（显式传参——ctx 不可包装，见 host.ts HostLogger 注释）。 */
    logger: HostLogger;
    store: TaskStore;
    options: ReconcileOptions;
}
/**
 * 回执裁决（决策 19，替代旧契约文件三查）：
 * receipt 事件存在 + status ∈ validStatuses + outputs 逐一存在且 mtime 晚于本次派发。
 * outputs 验证沿用「防旧产物冒充」语义；status 必须如实（agent 自报不可信，决策 11）。
 */
export declare function checkReceipt(task: TaskDefinition, workspacePath: string, dispatchedAtMs: number, receipt: {
    ts: string;
    detail: string | null;
} | undefined): {
    ok: boolean;
    reason?: string;
    detail?: unknown;
};
/** token 用量分量（决策 32 修订：不再记单一总数，按输入/输出/缓存拆分）。 */
export interface TokenUsage {
    /** 输入（prompt）token。 */
    in?: number;
    /** 输出（completion）token。 */
    out?: number;
    /** 命中上下文缓存的输入 token。 */
    cache?: number;
}
/**
 * 从会话事件里取 token 用量分量（决策 32 修订）。
 * 宿主各版本把用量挂的位置与字段名不一 ⇒ 多位置 × 多字段名探测；
 * 取不到（事件不带 usage，或只给总数无法归属）返回 undefined（三列留 null，不阻塞链路）。
 */
export declare function extractTokenUsage(event: unknown): TokenUsage | undefined;
export declare function createReconciler({ ctx, logger, store, options }: ReconcilerDeps): Reconciler;
