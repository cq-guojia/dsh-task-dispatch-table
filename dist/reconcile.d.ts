import type { HostContext, HostLogger, HostSession } from './host.js';
import type { TaskDefinition } from './tasks.js';
import type { AgentHandle } from './dispatch.js';
import type { TaskStore, TaskInstance } from './store.js';
export interface ReconcileOptions {
    leaseMs: number;
    dispatchGraceMs: number;
    unknownGraceMs: number;
    /** 状态库绝对路径（决策 19：追问消息里重发回执命令用）。 */
    statePath(): string;
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
export declare function createReconciler({ ctx, logger, store, options }: ReconcilerDeps): Reconciler;
