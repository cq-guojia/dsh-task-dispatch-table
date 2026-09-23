import { Config, resolveStatePath } from './config.js';
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
/** 快照携带的最近事件条数。 */
const DEBUG_EVENT_LIMIT = 40;
export function apply(ctx, config) {
    const initial = Config(config);
    // v1 零自建 UI（决策 16）：配置走官方 ctx.settings 命名空间，patch config 作为 base 层，
    // 用户文档层 live 覆盖（packages/settings/settings/src/index.ts:49-59）。
    const scope = ctx.settings.register('dsh-task-dispatch-table', Config, { base: initial });
    // statePath 启动时定格，运行期改配置不迁移库。
    const store = new TaskStore(resolveStatePath(scope.get().statePath));
    // 临时调试通道：宿主侧把「告警 + 状态库快照」写进本命名空间的 debugSnapshot 字段
    // （scope.update 合并进用户层并提交 'settings/updated'，packages/settings/settings/src/index.ts:133,456,562），
    // 配置页订阅同一 scope 实时渲染。仅诊断用，全部异常自兜，不触碰调度主流程。
    const rawWarn = ctx.logger.warn.bind(ctx.logger);
    const rawError = ctx.logger.error.bind(ctx.logger);
    const debugWarns = [];
    const pushWarn = (level, message) => {
        debugWarns.push(`${new Date().toISOString()} [${level}] ${message}`);
        if (debugWarns.length > DEBUG_WARN_LIMIT)
            debugWarns.shift();
    };
    // 影子 ctx：原型链保持宿主成员原样（避免展开拷贝破坏方法 this 绑定），仅替换 logger，
    // 让 scheduler / reconciler / dispatch / tasks 的告警全部经 tee 进缓冲。
    const logCtx = Object.create(ctx);
    logCtx.logger = {
        info: message => ctx.logger.info(message),
        warn: message => { pushWarn('warn', message); rawWarn(message); },
        error: message => { pushWarn('error', message); rawError(message); },
    };
    let taskMap = new Map();
    // 快照写入：内容去重（数据未变不写）+ 2s 节流（尾随写入保证最终态必落）。
    let lastContent = '';
    let lastWriteAt = 0;
    let writePending = false;
    const writeSnapshot = () => {
        try {
            const snap = store.snapshot(DEBUG_EVENT_LIMIT);
            const body = {
                tasks: [...taskMap.keys()],
                instances: snap.instances,
                events: snap.events,
                warns: [...debugWarns],
            };
            const content = JSON.stringify(body);
            lastWriteAt = Date.now();
            if (content === lastContent)
                return;
            lastContent = content;
            scope.update({ debugSnapshot: JSON.stringify({ at: new Date().toISOString(), ...body }) })
                .catch(error => rawWarn(`调试快照写入失败: ${String(error)}`));
        }
        catch (error) {
            rawWarn(`调试快照组装失败: ${String(error)}`);
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
        // 决策 19：追问消息里重发回执命令需要状态库路径，getter 取 live 值。
        statePath: () => resolveStatePath(scope.get().statePath),
        tasks: () => taskMap,
    };
    const reconciler = createReconciler({ ctx: logCtx, store, options: reconcileOptions });
    const scheduler = createScheduler({
        ctx: logCtx, store, reconciler,
        config: () => scope.get(),
    });
    // 启动扫描（机制 #5）：重启期间 disposed 事件可能全部丢失，已派发未定态实例置 unknown，
    // 随后按 unknown 流程自然收敛（§3）。pending 从未派发、无可丢事件，保持原状。
    const scanned = store.startupScan();
    if (scanned > 0)
        logCtx.logger.info(`启动扫描：${scanned} 个已派发实例置 unknown`);
    logCtx.on('session/created', session => { reconciler.onCreated(session); updateSnapshot(); });
    logCtx.on('session/event', (session, event) => { reconciler.onEvent(session, event); updateSnapshot(); });
    logCtx.on('session/disposed', session => { reconciler.onDisposed(session); updateSnapshot(); });
    const safeTick = () => {
        try {
            scheduler.tick();
            taskMap = scheduler.getTasks();
        }
        catch (error) {
            pushWarn('error', `tick 异常: ${String(error)}`);
            rawError(`tick 异常: ${String(error)}`);
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
