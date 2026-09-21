import type { HostContext } from './host.js';
import type { PluginConfig } from './config.js';
import type { TaskDefinition } from './tasks.js';
import type { TaskStore } from './store.js';
import type { Reconciler } from './reconcile.js';
export interface Scheduler {
    /** 启动补建（§7 backfill.days 层）。 */
    backfill(): void;
    /** 每 tick 主循环。 */
    tick(): void;
    /** 供对账器查任务定义。 */
    getTasks(): Map<string, TaskDefinition>;
}
export interface SchedulerDeps {
    ctx: HostContext;
    store: TaskStore;
    reconciler: Reconciler;
    config: () => PluginConfig;
}
export declare function createScheduler({ ctx, store, reconciler, config }: SchedulerDeps): Scheduler;
