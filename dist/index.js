import { Config, resolveStatePath } from './config.js';
import { TaskStore } from './store.js';
import { createReconciler } from './reconcile.js';
import { createScheduler } from './scheduler.js';
export const name = 'dsh-task-dispatch-table';
/** 宿主服务依赖：以源码实际服务名为准（决策 15 / PROGRESS「已核实的 DSH 能力」）。 */
export const inject = ['timer', 'agents', 'sessions', 'workspaceRegistry', 'settings', 'sessionTitle'];
export { Config, resolveStatePath };
export function apply(ctx, config) {
    const initial = Config(config);
    // v1 零自建 UI（决策 16）：配置走官方 ctx.settings 命名空间，patch config 作为 base 层，
    // 用户文档层 live 覆盖（packages/settings/settings/src/index.ts:49-59）。
    const scope = ctx.settings.register('dsh-task-dispatch-table', Config, { base: initial });
    // statePath 启动时定格，运行期改配置不迁移库。
    const store = new TaskStore(resolveStatePath(scope.get().statePath));
    let taskMap = new Map();
    const reconcileOptions = {
        get leaseMs() { return scope.get().leaseMs; },
        get dispatchGraceMs() { return scope.get().dispatchGraceMs; },
        get unknownGraceMs() { return scope.get().unknownGraceMs; },
        // 决策 19：追问消息里重发回执命令需要状态库路径，getter 取 live 值。
        statePath: () => resolveStatePath(scope.get().statePath),
        tasks: () => taskMap,
    };
    const reconciler = createReconciler({ ctx, store, options: reconcileOptions });
    const scheduler = createScheduler({
        ctx, store, reconciler,
        config: () => scope.get(),
    });
    // 启动扫描（机制 #5）：重启期间 disposed 事件可能全部丢失，已派发未定态实例置 unknown，
    // 随后按 unknown 流程自然收敛（§3）。pending 从未派发、无可丢事件，保持原状。
    const scanned = store.startupScan();
    if (scanned > 0)
        ctx.logger.info(`启动扫描：${scanned} 个已派发实例置 unknown`);
    ctx.on('session/created', session => reconciler.onCreated(session));
    ctx.on('session/event', (session, event) => reconciler.onEvent(session, event));
    ctx.on('session/disposed', session => reconciler.onDisposed(session));
    const safeTick = () => {
        try {
            scheduler.tick();
            taskMap = scheduler.getTasks();
        }
        catch (error) {
            ctx.logger.error(`tick 异常: ${String(error)}`);
        }
    };
    // 官方定时器（决策 13）：ctx.interval 卸载自动清理（vendor/timer/src/index.ts:47-62）。
    // tickMs live 变更时重启 interval。
    let stopInterval = ctx.interval(safeTick, scope.get().tickMs);
    scope.watch((next, prev) => {
        if (next.tickMs === prev.tickMs)
            return;
        stopInterval();
        stopInterval = ctx.interval(safeTick, next.tickMs);
    });
    safeTick();
    scheduler.backfill();
    ctx.on('dispose', () => {
        stopInterval();
        store.close();
    });
}
