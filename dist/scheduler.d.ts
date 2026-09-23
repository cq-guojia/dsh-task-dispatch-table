import type { HostContext, HostLogger } from './host.js';
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
    /** tee logger（显式传参——ctx 不可包装，见 host.ts HostLogger 注释）。 */
    logger: HostLogger;
    store: TaskStore;
    reconciler: Reconciler;
    config: () => PluginConfig;
}
export declare function createScheduler({ ctx, logger, store, reconciler, config }: SchedulerDeps): Scheduler;
