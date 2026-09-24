import { Config, resolveStatePath } from './config.js';
import { ensureIdsInInlineJson, nextSlotAfter, titleOf } from './tasks.js';
import { TaskStore } from './store.js';
import { createReconciler } from './reconcile.js';
import { createScheduler } from './scheduler.js';
export const name = 'dsh-task-dispatch-table';
/** 宿主服务依赖：以源码实际服务名为准（决策 15 / PROGRESS「已核实的 DSH 能力」）。
 * ⚠️ settings 不在此列：settings 服务以「带 register 面」或「惰性形态」两种组合入场，
 * 缺失 register 时硬性依赖会令 entry 卡死/崩；改由 apply 内 ctx.inject(['settings'], ...)
 * 订阅并在 register 就绪才激活（参照 dsh-context installSettings，决策 17 真机教训）。 */
export const inject = ['timer', 'agents', 'sessions', 'workspaceRegistry', 'sessionTitle'];
export { Config, resolveStatePath };
// ── 临时调试通道参数（决策 16 例外：完善 UI 后随面板一起回收）──
/** 告警环形缓冲上限（条）。 */
const DEBUG_WARN_LIMIT = 20;
/** 快照最小写入间隔（毫秒）：会话事件逐条续租改 updated_at，不节流会写放大。 */
const DEBUG_WRITE_MIN_INTERVAL_MS = 2_000;
/** 无变化时的强制心跳间隔：让面板时间戳持续刷新，证明宿主存活。 */
const DEBUG_FORCE_INTERVAL_MS = 5 * 60_000;
/** settings 命名空间（与浏览器半侧的 SETTINGS_NS 同名，两侧按它配对）。 */
const SETTINGS_NS = 'dsh-task-dispatch-table';
/**
 * 无 `register` 面时的等价作用域（dsh 0.1.7-rc.1 起把注册改成「注册项 Config 自动投影」）。
 *
 * ⚠️ 这里**不能让插件整体 inert**：那样调度器根本不启动，比「页面没数据」严重得多。
 * 退化为「用启动配置运行」——调度 / 派发 / 对账照常；快照与任务 id 回写走 rc.1 的
 * `settings.update(ns, patch)`（该组合若无 update 则放弃回写，仅告警一次）。
 * @param sctx - 已就位 settings 服务的上下文（用于告警日志）。
 * @param settings - settings 服务实例。
 * @param initial - 启动期定格的插件配置。
 * @returns 与 register 产物同形的作用域。
 */
function fallbackScope(sctx, settings, initial) {
    const updater = settings.update;
    sctx.logger.warn('dsh-task-dispatch-table: 当前 dsh 的 settings 服务未提供 register 面（0.1.7-rc.1 起改为注册项'
        + ' Config 自动投影），已退化为「启动配置运行」：调度照常执行，但运行期改配置需重启才生效'
        + (typeof updater === 'function' ? '。' : '；且该组合也没有 settings.update，页面快照无法回写。'));
    return {
        get: () => initial,
        update: async (patch) => {
            if (typeof updater !== 'function')
                return;
            await updater.call(settings, SETTINGS_NS, patch);
        },
        watch: () => () => { },
    };
}
/** 快照携带的最近事件条数（面板按实例过滤展开用，故比单页展示量多留一些）。 */
const DEBUG_EVENT_LIMIT = 200;
export function apply(ctx, config) {
    const initial = Config(config);
    // v1 零自建 UI（决策 16）：配置走官方 ctx.settings 命名空间，patch config 作为 base 层，
    // 用户文档层 live 覆盖（packages/settings/settings/src/index.ts:49-59）。
    // ⚠️ settings 服务以「带 register 面」或「无 register 面」两种组合入场（参照 dsh-context
    // installSettings）：用 ctx.inject 订阅；缺失 register 时**不再 inert**，而是降级为启动配置
    // 作用域（fallbackScope）——否则调度器根本不启动。顶层 inject 写法会在 register 尚未挂上
    // 时误激活并崩（TypeError: ctx.settings.register is not a function），故不进顶层 inject 列表。
    ctx.inject(['settings'], (sctx) => {
        const settings = sctx.settings;
        // 有 register 面 → 官方命名空间作用域（配置 live 生效）；无（0.1.7-rc.1）→ 降级为
        // 启动配置作用域，调度照跑（见 fallbackScope：不能因为缺 register 就整体不启动）。
        const scope = typeof settings.register === 'function'
            ? settings.register(SETTINGS_NS, Config, { base: initial })
            : fallbackScope(sctx, settings, initial);
        // statePath 启动时定格，运行期改配置不迁移库。
        const store = new TaskStore(resolveStatePath(scope.get().statePath));
        // 迁移若真的合并掉了重复行（正常应为 0），必须让用户看见——绝不静默删数据。
        if (store.dupRowsRemoved > 0) {
            sctx.logger.warn(`状态库迁移：发现并合并了 ${store.dupRowsRemoved} 组「同任务同刻度」的重复实例行`
                + `（保留每组最早的一条）。这通常不该发生，请检查是否有手工改动过状态库。`);
        }
        // 临时调试通道：宿主侧把「告警 + 状态库快照」写进本命名空间的 debugSnapshot 字段
        // （scope.update 合并进用户层并提交 'settings/updated'，packages/settings/settings/src/index.ts:133,456,562），
        // 配置页订阅同一 scope 实时渲染。仅诊断用，全部异常自兜，不触碰调度主流程。
        //
        // ⚠️ ctx 不可包装（cordis ctx 是 Proxy：set trap 拒绝赋值 vendor/cordis/src/reflect.ts:172-196，
        // on/interval 等 mixin 方法不在自有属性上，展开拷贝拿不到 :221）——tee logger 作为
        // 显式参数传给各模块（见 host.ts HostLogger 注释），sctx 原样传递。
        const debugWarns = [];
        const pushWarn = (level, message) => {
            debugWarns.push(`${new Date().toISOString()} [${level}] ${message}`);
            if (debugWarns.length > DEBUG_WARN_LIMIT)
                debugWarns.shift();
        };
        const teeLogger = {
            info: (message) => sctx.logger.info(message),
            warn: (message) => { pushWarn('warn', message); sctx.logger.warn(message); },
            error: (message) => { pushWarn('error', message); sctx.logger.error(message); },
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
                    .catch((error) => sctx.logger.warn(`调试快照写入失败: ${String(error)}`));
            }
            catch (error) {
                sctx.logger.warn(`调试快照组装失败: ${String(error)}`);
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
        const reconciler = createReconciler({ ctx: sctx, logger: teeLogger, store, options: reconcileOptions });
        const scheduler = createScheduler({
            ctx: sctx, logger: teeLogger, store, reconciler,
            config: () => scope.get(),
        });
        // 启动扫描（机制 #5）：重启期间 disposed 事件可能全部丢失，已派发未定态实例置 unknown，
        // 随后按 unknown 流程自然收敛（§3）。pending 从未派发、无可丢事件，保持原状。
        const scanned = store.startupScan();
        if (scanned > 0)
            teeLogger.info(`启动扫描：${scanned} 个已派发实例置 unknown`);
        sctx.on('session/created', session => { reconciler.onCreated(session); updateSnapshot(); });
        sctx.on('session/event', (session, event) => { reconciler.onEvent(session, event); updateSnapshot(); });
        sctx.on('session/disposed', session => { reconciler.onDisposed(session); updateSnapshot(); });
        /**
         * 内嵌任务表缺 id 时**把生成的 id 写回配置**（决策 25 修订版）。
         * 只在真的补了 id 时才写 ⇒ 不会每 tick 都写；写回后配置里就有 id 了，下次直接采信。
         * 写失败（并发栅栏 / 只读）不致命：解析侧还有「按内容指纹兜底」的 id，不会漂。
         */
        const ensureInlineIds = () => {
            try {
                const raw = scope.get().tasksInline;
                const { json, changed, assigned } = ensureIdsInInlineJson(raw);
                if (!changed)
                    return;
                scope.update({ tasksInline: json })
                    .then(() => teeLogger.info(`已为 ${assigned} 条任务定义生成 id 并写回配置`))
                    .catch((error) => teeLogger.warn(`任务 id 写回配置失败（将在下次 tick 重试）: ${String(error)}`));
            }
            catch (error) {
                teeLogger.warn(`任务 id 补写异常: ${String(error)}`);
            }
        };
        const safeTick = () => {
            try {
                ensureInlineIds();
                scheduler.tick();
                taskMap = scheduler.getTasks();
            }
            catch (error) {
                pushWarn('error', `tick 异常: ${String(error)}`);
                sctx.logger.error(`tick 异常: ${String(error)}`);
            }
            updateSnapshot();
        };
        // 官方定时器（决策 13）：ctx.interval 卸载自动清理（vendor/timer/src/index.ts:47-62）。
        // tickMs live 变更时重启 interval。
        let stopInterval = sctx.interval(safeTick, scope.get().tickMs);
        scope.watch((next, prev) => {
            if (next.tickMs === prev.tickMs)
                return;
            stopInterval();
            stopInterval = sctx.interval(safeTick, next.tickMs);
        });
        safeTick();
        scheduler.backfill();
        updateSnapshot(); // backfill 可能补建实例，立即落一版快照
        sctx.on('dispose', () => {
            stopInterval();
            store.close();
        });
    });
}
