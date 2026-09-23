import { resolveStatePath } from './config.js';
import { durationMs, loadTasks, logicalDateOf, onceScheduledAt, parseInlineTasks, scheduledAtFor } from './tasks.js';
import { dispatchTask, resolveWorkspacePath } from './dispatch.js';
/** 在跑态：同任务串行判定（§8）的互斥集合——pending 只是排队，不阻塞后继派发。 */
const IN_FLIGHT_STATUSES = ['dispatched', 'running', 'unknown'];
/** 任务时区的「今天」（缺省 = 宿主时区，data-model schedule.timezone 语义）。 */
function todayOf(task) {
    return logicalDateOf(new Date(), task.schedule.timezone);
}
function shiftDay(day, days) {
    const date = new Date(`${day}T00:00:00`);
    date.setUTCDate(date.getUTCDate() + days);
    return date.toISOString().slice(0, 10);
}
/**
 * 任务在某日历日的计划时刻。cron 任务向前迭代 cron（searchFrom 取该日前 26h 起，
 * 上限 2000 次迭代覆盖分钟级 cron）；once 任务（决策 18）仅在 once 对应日历日
 * 返回其指定时刻 —— 实例唯一 ⇒ 跑完自动停，无需改 enabled。
 */
function planFor(task, day) {
    if (task.schedule.once !== undefined)
        return onceScheduledAt(task, day);
    return scheduledAtFor(task, day, new Date(Date.parse(`${day}T00:00:00`) - 26 * 3600_000));
}
function windowDeadline(task, instance) {
    return Date.parse(instance.scheduled_at) + durationMs(task.schedule.window);
}
export function createScheduler({ ctx, store, reconciler, config }) {
    let tasks = new Map();
    /** 窗口内 pending / 已过窗 skipped 留痕（§3 实例保障 / §7）。 */
    function ensureInstances(currentTasks) {
        for (const task of currentTasks) {
            for (const day of [shiftDay(todayOf(task), -1), todayOf(task)]) {
                const scheduledAt = planFor(task, day);
                if (scheduledAt === undefined)
                    continue;
                const instanceId = `${task.id}:${day}`;
                if (store.get(instanceId) !== undefined)
                    continue;
                const overWindow = Date.now() > scheduledAt.getTime() + durationMs(task.schedule.window);
                store.ensureInstance(task.id, day, scheduledAt.toISOString(), overWindow ? 'skipped' : 'pending');
            }
        }
    }
    /**
     * 依赖判定（§9）。ready = 可派发；blocked = 不满足不分配（pending 继续等）。
     * 上游终态失败也返回 blocked 而非立即置 skipped：决策 10「当日窗口内修复则继续」，
     * 下游须保持可修复性，窗口过期时随窗口判定收敛 skipped（整条链作废）。
     */
    function judgeDependencies(task, instance) {
        for (const dep of task.depends_on ?? []) {
            if (dep.semantics === 'same_period') {
                const upstream = store.getSamePeriod(dep.task, instance.logical_date);
                if (upstream === undefined || ['pending', 'dispatched', 'running', 'unknown'].includes(upstream.status)) {
                    return 'blocked';
                }
                if (upstream.status !== 'succeeded')
                    return 'blocked'; // 上游 failed / skipped → 不分配（决策 10）
            }
            else {
                const freshnessMs = dep.freshness === undefined ? undefined : durationMs(dep.freshness);
                const cutoff = freshnessMs === undefined ? undefined : new Date(Date.now() - freshnessMs).toISOString();
                const upstream = store.getLatestSuccess(dep.task, cutoff);
                if (upstream === undefined)
                    return 'blocked'; // 无新鲜成功记录：等（过窗后由窗口判定收敛）
            }
        }
        return 'ready';
    }
    function dispatchPass(currentTasks) {
        for (const task of currentTasks) {
            const pendings = store.listByStatus(['pending']).filter(instance => instance.task_id === task.id);
            for (const instance of pendings) {
                // 同任务串行（§8）：存在任一在跑实例则本任务不派发。
                if (store.listByStatus([...IN_FLIGHT_STATUSES]).some(other => other.task_id === task.id && other.id !== instance.id)) {
                    continue;
                }
                // 未到计划时刻不派发（§2 pending 语义「未到时间」；否则大窗口任务会被 tick 提前跑掉）。
                if (Date.now() < Date.parse(instance.scheduled_at))
                    continue;
                // 窗口只管开始（§5）：pending 过窗 → skipped 终态；已派发的不受窗切断。
                if (Date.now() > windowDeadline(task, instance)) {
                    store.transition(instance.id, { status: 'skipped', finished_at: new Date().toISOString(), detail: 'over-window' });
                    continue;
                }
                // 依赖不满足：pending 等（§2「前置未满足」），不转移不留终态。
                if (judgeDependencies(task, instance) !== 'ready')
                    continue;
                let workspacePath;
                try {
                    workspacePath = resolveWorkspacePath(ctx, task.target.workspace);
                }
                catch (error) {
                    ctx.logger.warn(`任务 ${task.id} 派发中止: ${String(error)}`);
                    continue;
                }
                // CAS 领取（data-model 关键设计 3）→ dispatched → 派发。
                if (!store.casClaim(instance.id))
                    continue;
                dispatchTask({
                    ctx, store, task,
                    instanceId: instance.id,
                    logicalDate: instance.logical_date,
                    workspacePath,
                    statePath: resolveStatePath(config().statePath),
                })
                    .then(({ sessionId, handle }) => reconciler.registerHandle(sessionId, handle))
                    .catch((error) => {
                    // 派发异常走重试判定（§6），等价于宽限期超时路径。
                    ctx.logger.error(`派发失败 ${instance.id}: ${String(error)}`);
                    const latest = store.get(instance.id);
                    if (latest !== undefined && latest.status === 'dispatched')
                        reconciler.retryOrFail(latest, 'dispatch-error');
                });
            }
        }
    }
    return {
        getTasks() {
            return tasks;
        },
        backfill() {
            const currentTasks = [...tasks.values()];
            for (const task of currentTasks) {
                if (task.backfill.days <= 0)
                    continue;
                const today = todayOf(task);
                // 近 N 天缺失实例补建为 pending，照常走依赖与窗口判定（§7 历史层）。
                for (let offset = -task.backfill.days; offset <= -1; offset++) {
                    const day = shiftDay(today, offset);
                    const scheduledAt = planFor(task, day);
                    if (scheduledAt === undefined)
                        continue;
                    store.ensureInstance(task.id, day, scheduledAt.toISOString(), 'pending');
                }
            }
        },
        tick() {
            const cfg = config();
            // 任务来源：tasksInline（配置页 textarea，临时 UI）非空则优先，否则读 tasksDir 目录。
            const source = cfg.tasksInline.trim().length > 0
                ? parseInlineTasks(ctx, cfg.tasksInline)
                : loadTasks(ctx, cfg.tasksDir);
            tasks = new Map(source.map(task => [task.id, task]));
            reconciler.sweep();
            ensureInstances([...tasks.values()]);
            dispatchPass([...tasks.values()]);
        },
    };
}
