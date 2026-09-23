import { Config, resolveStatePath } from './config.js';
import { nextSlotAfter, titleOf } from './tasks.js';
import { TaskStore } from './store.js';
import { createReconciler } from './reconcile.js';
import { createScheduler } from './scheduler.js';
export const name = 'dsh-task-dispatch-table';
/** 宿主服务依赖：以源码实际服务名为准（决策 15 / PROGRESS「已核实的 DSH 能力」）。 */
export const inject = ['timer', 'agents', 'sessions', 'workspaceRegistry', 'settings', 'sessionTitle'];
export { Config, resolveStatePath };
// ── 临时调试通道参数（决策 16 例外：完善 UI 后随面板一起回收）──
/** 告警环形缓冲上限（条）。 */
const DEBUG_WARN_LIMIT = 20;
/** 快照最小写入间隔（毫秒）：会话事件逐条续租改 updated_at，不节流会写放大。 */
const DEBUG_WRITE_MIN_INTERVAL_MS = 2_000;
/** 无变化时的强制心跳间隔：让面板时间戳持续刷新，证明宿主存活。 */
const DEBUG_FORCE_INTERVAL_MS = 5 * 60_000;
/** 快照携带的最近事件条数（面板按实例过滤展开用，故比单页展示量多留一些）。 */
const DEBUG_EVENT_LIMIT = 200;
export function apply(ctx, config) {
    const initial = Config(config);
    // v1 零自建 UI（决策 16）：配置走官方 ctx.settings 命名空间，patch config 作为 base 层，
    // 用户文档层 live 覆盖（packages/settings/settings/src/index.ts:49-59）。
    const scope = ctx.settings.register('dsh-task-dispatch-table', Config, { base: initial });
    // statePath 启动时定格，运行期改配置不迁移库。
    const store = new TaskStore(resolveStatePath(scope.get().statePath));
    // 迁移若真的合并掉了重复行（正常应为 0），必须让用户看见——绝不静默删数据。
    if (store.dupRowsRemoved > 0) {
        ctx.logger.warn(`状态库迁移：发现并合并了 ${store.dupRowsRemoved} 组「同任务同刻度」的重复实例行`
            + `（保留每组最早的一条）。这通常不该发生，请检查是否有手工改动过状态库。`);
    }
    // 临时调试通道：宿主侧把「告警 + 状态库快照」写进本命名空间的 debugSnapshot 字段
    // （scope.update 合并进用户层并提交 'settings/updated'，packages/settings/settings/src/index.ts:133,456,562），
    // 配置页订阅同一 scope 实时渲染。仅诊断用，全部异常自兜，不触碰调度主流程。
    //
    // ⚠️ ctx 不可包装（cordis ctx 是 Proxy：set trap 拒绝赋值 vendor/cordis/src/reflect.ts:172-196，
    // on/interval 等 mixin 方法不在自有属性上，展开拷贝拿不到 :221）——tee logger 作为
    // 显式参数传给各模块（见 host.ts HostLogger 注释），ctx 原样传递。
    const debugWarns = [];
    const pushWarn = (level, message) => {
        debugWarns.push(`${new Date().toISOString()} [${level}] ${message}`);
        if (debugWarns.length > DEBUG_WARN_LIMIT)
            debugWarns.shift();
    };
    const teeLogger = {
        info: (message) => ctx.logger.info(message),
        warn: (message) => { pushWarn('warn', message); ctx.logger.warn(message); },
        error: (message) => { pushWarn('error', message); ctx.logger.error(message); },
    };
    let taskMap = new Map();
    // 快照写入：内容去重（数据未变不写）+ 2s 节流（尾随写入保证最终态必落）+ 5min 心跳。
    let lastContent = '';
    let lastWriteAt = 0;
    let lastPushAt = 0;
    let writePending = false;
    const writeSnapshot = () => {
        try {
            const snap = store.snapshot(DEBUG_EVENT_LIMIT);
            const now = new Date();
            // 任务明细（决策 25：id 系统生成 + title 给人看；带下次执行刻度便于核对配置是否生效）。
            const tasks = [...taskMap.values()].map(task => {
                let next = null;
                try {
                    next = nextSlotAfter(task, now)?.toISOString() ?? null;
                }
                catch {
                    next = null; // 单个任务的刻度计算异常不影响整份快照
                }
                return {
                    id: task.id,
                    title: titleOf(task),
                    enabled: task.enabled,
                    cron: task.schedule.cron ?? null,
                    once: task.schedule.once ?? null,
                    timezone: task.schedule.timezone ?? null,
                    window: task.schedule.window,
                    workspace: task.target.workspace,
                    next,
                };
            });
            const body = { tasks, instances: snap.instances, events: snap.events, warns: [...debugWarns] };
            const content = JSON.stringify(body);
            lastWriteAt = Date.now();
            if (content === lastContent && Date.now() - lastPushAt < DEBUG_FORCE_INTERVAL_MS)
                return;
            lastContent = content;
            lastPushAt = Date.now();
            scope.update({ debugSnapshot: JSON.stringify({ at: new Date().toISOString(), ...body }) })
                .catch((error) => ctx.logger.warn(`调试快照写入失败: ${String(error)}`));
        }
        catch (error) {
            ctx.logger.warn(`调试快照组装失败: ${String(error)}`);
        }
    };
    const updateSnapshot = () => {
        if (writePending)
            return;
        const wait = lastWriteAt + DEBUG_WRITE_MIN_INTERVAL_MS - Date.now();
        if (wait <= 0) {
            writeSnapshot();
            return;
        }
        writePending = true;
        setTimeout(() => { writePending = false; writeSnapshot(); }, wait);
    };
    const reconcileOptions = {
        get leaseMs() { return scope.get().leaseMs; },
        get dispatchGraceMs() { return scope.get().dispatchGraceMs; },
        get unknownGraceMs() { return scope.get().unknownGraceMs; },
        tasks: () => taskMap,
    };
    const reconciler = createReconciler({ ctx, logger: teeLogger, store, options: reconcileOptions });
    const scheduler = createScheduler({
        ctx, logger: teeLogger, store, reconciler,
        config: () => scope.get(),
    });
    // 启动扫描（机制 #5）：重启期间 disposed 事件可能全部丢失，已派发未定态实例置 unknown，
    // 随后按 unknown 流程自然收敛（§3）。pending 从未派发、无可丢事件，保持原状。
    const scanned = store.startupScan();
    if (scanned > 0)
        teeLogger.info(`启动扫描：${scanned} 个已派发实例置 unknown`);
    ctx.on('session/created', session => { reconciler.onCreated(session); updateSnapshot(); });
    ctx.on('session/event', (session, event) => { reconciler.onEvent(session, event); updateSnapshot(); });
    ctx.on('session/disposed', session => { reconciler.onDisposed(session); updateSnapshot(); });
    const safeTick = () => {
        try {
            scheduler.tick();
            taskMap = scheduler.getTasks();
        }
        catch (error) {
            pushWarn('error', `tick 异常: ${String(error)}`);
            ctx.logger.error(`tick 异常: ${String(error)}`);
        }
        updateSnapshot();
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
    updateSnapshot(); // backfill 可能补建实例，立即落一版快照
    ctx.on('dispose', () => {
        stopInterval();
        store.close();
    });
}
