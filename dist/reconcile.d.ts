import type { HostContext, HostSession } from './host.js';
import type { TaskDefinition } from './tasks.js';
import type { TaskStore, TaskInstance } from './store.js';
export interface ReconcileOptions {
    leaseMs: number;
    dispatchGraceMs: number;
    unknownGraceMs: number;
    /** 当前任务表（scheduler 每 tick 刷新）。 */
    tasks(): Map<string, TaskDefinition>;
}
export interface Reconciler {
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
    store: TaskStore;
    options: ReconcileOptions;
}
/** 产物契约三查（机制 #1）：存在 + status ∈ validStatuses + mtime 晚于本次派发。 */
export declare function checkContract(task: TaskDefinition, workspacePath: string, dispatchedAtMs: number): {
    ok: boolean;
    reason?: string;
    detail?: unknown;
};
export declare function createReconciler({ ctx, store, options }: ReconcilerDeps): Reconciler;
