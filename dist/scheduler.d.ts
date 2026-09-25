import type { HostContext, HostLogger } from './host.js';
import { type TaskDefinition } from './tasks.js';
import type { TaskStore } from './store.js';
import type { Reconciler } from './reconcile.js';
import type { PluginConfig } from './config.js';
export interface Scheduler {
    tick: () => void;
    getTasks: () => Map<string, TaskDefinition>;
    /** 启动诊断（决策 31）：报告自上次起到现在的「错过刻度」计数（不补跑、只记日志）。 */
    startupDiagnostics: () => void;
}
export type Judgement = 'ready' | 'blocked';
/** 依赖判定结果（决策 33）：`staleNotes` = 复用旧产出的告警，只提示不拦。 */
export interface DependencyVerdict {
    ready: boolean;
    staleNotes: string[];
}
export declare function judgeDependencies(store: TaskStore, task: TaskDefinition, logicalDate: string, scheduledAt: string): DependencyVerdict;
export declare function createScheduler(opts: {
    ctx: HostContext;
    logger: HostLogger;
    store: TaskStore;
    reconciler: Reconciler;
    config: () => PluginConfig;
}): Scheduler;
