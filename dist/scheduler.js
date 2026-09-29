// scheduler.ts — 派发循环（决策 31 懒建行 + 决策 41 两层循环彻底解耦）。
//
// Loop A（本文件 dispatchNewSlots）只管「写执行记录」：
//   每 tick 只判「现在这一刻该不该跑」——取满足 scheduled_at <= now <= scheduled_at + window
//   且无实例行的「最晚」刻度；依赖 / 工作区不过 ⇒ 只记 task_log、不建行；过了 ⇒ 把要执行的
//   任务连同**派发快照**（决策 41）以 dispatched 落库，**落库即止**——不发动会话、不解析模型。
//   `enabled` 只在这里起作用（挡新行）；已落库实例由 Loop B 收口，与本循环无关。
// Loop B（reconcile.ts sweep）：只读执行记录 + 快照——发动执行 / 失败重试 / 追问 /
//   契约回收 / 重试行重派（窗口内转 dispatched 并发动、窗口外删行记日志），全程不读任务表。
import { randomUUID } from 'node:crypto';
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { parseInlineTasks } from './tasks.js';
import { displayNameOf, durationMs, logicalDateOf, scheduledSlotsFor } from './tasks.js';
import { parseInstanceSnapshot } from './store.js';
import { resolveWorkspace } from './dispatch.js';
// 串行互斥只认**真正在飞**的状态（决策 8：同任务不并发）。
// 不含 'unknown'：unknown 只由重启扫描产生（会话句柄已随进程消失、不定态），它应在 sweep 里
// 被快速收口为终态；若还把它当「在飞」参与互斥，会在老库卡死的孤儿实例上把同任务永久挡死
// （本次真机 bug：老库一条卡 running 的历史实例 → 重启转 unknown → 同 cron 任务再也写不出新行）。
const IN_FLIGHT_STATUSES = ['dispatched', 'running'];
// ── 调度输入加载（inline JSON 或目录，按配置择一）──
function loadTasks(logger, config) {
    if (config.tasksInline.trim() !== '') {
        const parsed = parseInlineTasks(logger, config.tasksInline);
        return parsed;
    }
    return readTasksDir(logger, config.tasksDir);
}
/** 目录模式：读取 tasksDir 下的 .json / .jsonc 任务文件（每文件可含数组或 {tasks:[...]}）。 */
function readTasksDir(logger, dir) {
    if (!dir || !existsSync(dir))
        return [];
    const out = [];
    for (const file of readdirSync(dir)) {
        if (!file.endsWith('.json') && !file.endsWith('.jsonc'))
            continue;
        try {
            const text = readFileSync(join(dir, file), 'utf8');
            out.push(...parseInlineTasks(logger, stripJsoncComments(text)));
        }
        catch (e) {
            logger.warn(`读取任务文件失败 ${file}：${e instanceof Error ? e.message : String(e)}`);
        }
    }
    return out;
}
/** 去掉 JSONC 注释（// 与 /* *​/），便于目录模式直接吃 .jsonc。 */
function stripJsoncComments(text) {
    return text.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/.*$/gm, '$1');
}
/**
 * 上游实例 → 已解析依赖（决策 43）：固化 id / 计划时刻 / 会话 / 上游工作区 / 产出。
 * 产出取上游实例的 `outputs` 列（回执声明并经 checkReceipt 校验的 JSON 数组，决策 32 修订）；
 * 旧行 / 坏 JSON / 未声明 ⇒ 空数组（消息里如实写「未声明产出」）。
 */
function resolvedOf(dep, upstream) {
    let outputs = [];
    try {
        const parsed = upstream.outputs === null ? undefined : JSON.parse(upstream.outputs);
        if (Array.isArray(parsed))
            outputs = parsed.filter((x) => typeof x === 'string');
    }
    catch { /* 旧行 / 异常 ⇒ 视为未声明 */ }
    const upstreamSnap = parseInstanceSnapshot(upstream.snapshot);
    return {
        task: dep.task,
        semantics: dep.semantics,
        instanceId: upstream.id,
        scheduledAt: upstream.scheduled_at,
        sessionId: upstream.session_id,
        workspacePath: upstreamSnap?.workspacePath ?? null,
        outputs,
    };
}
// ── 依赖判定（决策 8/9）：同周期 / 最近成功。只查已存在的实例（无行即视为缺失）。──
export function judgeDependencies(store, task, logicalDate, scheduledAt) {
    const deps = task.depends_on;
    if (!deps || deps.length === 0)
        return { ready: true, staleNotes: [], resolved: [] };
    const staleNotes = [];
    const resolved = [];
    // 「复用旧产出」告警判据：下游上次执行时刻（首次运行无 ⇒ 不告警）。只提示，不拦。
    const lastRun = store.getLatestInstance(task.id);
    const lastRunMs = lastRun === undefined ? undefined : Date.parse(lastRun.scheduled_at);
    for (const dep of deps) {
        if (dep.semantics === 'same_period') {
            // 同周期：同 logical_date 取最新一条，必须 succeeded（决策 33 #2）
            const upstream = store.getSamePeriod(dep.task, logicalDate);
            if (upstream === undefined || upstream.status !== 'succeeded')
                return { ready: false, staleNotes, resolved: [] };
            // 决策 43：命中即固化——写库那一刻是哪条上游实例放的行，就此定死
            resolved.push(resolvedOf(dep, upstream));
            continue;
        }
        // latest_success（决策 33）：上游**最近一条**（不分状态）必须正好是 succeeded；
        // 在跑 / 失败 / 无记录 ⇒ 阻塞，绝不拿更早的旧成功放行。
        const latest = store.getLatestInstance(dep.task);
        if (latest === undefined || latest.status !== 'succeeded')
            return { ready: false, staleNotes, resolved: [] };
        const upstreamMs = Date.parse(latest.scheduled_at);
        // 上游这份成功不晚于下游上次执行 ⇒ 下游上次跑时它已存在 ⇒ 复用旧产出，告警
        if (lastRunMs !== undefined && upstreamMs <= lastRunMs) {
            staleNotes.push(`上游 ${dep.task} 无新产出，本次复用 ${latest.scheduled_at} 的旧产出`);
        }
        resolved.push(resolvedOf(dep, latest));
    }
    return { ready: true, staleNotes, resolved };
}
function isOnce(task) {
    return task.schedule.once !== undefined;
}
function onceDate(task) {
    if (task.schedule.once === undefined)
        return undefined;
    const d = new Date(task.schedule.once);
    return Number.isNaN(d.getTime()) ? undefined : d;
}
/** 取「当前该跑的那一下」：最晚满足 scheduled_at <= now <= scheduled_at+window 且无实例行的刻度。 */
function dueSlot(task, nowMs, store) {
    let chosen;
    if (isOnce(task)) {
        const od = onceDate(task);
        if (od !== undefined && od.getTime() <= nowMs)
            chosen = od;
    }
    else {
        const windowMs = durationMs(task.schedule.window);
        const from = new Date(nowMs - windowMs);
        const to = new Date(nowMs + 1000); // 容差 1s
        try {
            for (const s of scheduledSlotsFor(task, from, to)) {
                if (s.getTime() <= nowMs && (chosen === undefined || s.getTime() > chosen.getTime()))
                    chosen = s;
            }
        }
        catch {
            return undefined;
        }
    }
    if (chosen === undefined)
        return undefined;
    const iso = chosen.toISOString();
    if (store.findBySlot(task.id, iso) !== undefined)
        return undefined; // 已有实例（幂等/此前已处理）
    return { logicalDate: logicalDateOf(chosen, task.schedule.timezone), scheduledAtIso: iso };
}
/** 依赖卡顿日志限频（避免每 tick 刷屏），5 分钟内同任务只记一次。 */
function logDepBlocked(depLog, store, taskId, scheduledAt) {
    const now = Date.now();
    const last = depLog.get(taskId) ?? 0;
    if (now - last < 5 * 60_000)
        return;
    depLog.set(taskId, now);
    store.appendLog({ taskId, scheduledAt, level: 'info', kind: 'dep_blocked', message: '被依赖卡住，等待上游成功（下轮再判）' });
}
// 工作区解析用 dispatch.js 的 resolveWorkspace（Loop A 落库前的前置检查，决策 41：
// Loop B 发动走 resolveWorkspaceByPath——快照里存的是 path）。
/** 派发快照组装（决策 41 + 决策 43）：落库时把执行所需字段（含依赖解析）固化进实例行，此后与任务设置无关。 */
function snapshotOf(task, workspace, resolvedDeps) {
    return {
        title: displayNameOf(task),
        prompt: task.target.prompt,
        manual: task.target.manual ?? null,
        workspacePath: workspace.path,
        provider: task.target.provider ?? '',
        model: task.target.model ?? '',
        validStatuses: task.contract.validStatuses.length > 0 ? [...task.contract.validStatuses] : ['ok'],
        // 决策 48/49：goal / agentTeam 随快照固化（此前 goal 漏快照 = goal:false 不生效的缺陷，一并修）。
        goal: task.target.goal !== false,
        agentTeam: task.target.agentTeam === true,
        permission: task.target.permission ?? 'default',
        maxAttempts: task.retry.maxAttempts,
        window: task.schedule.window,
        resolvedDeps,
    };
}
function dispatchNewSlots(ctx, logger, store, tasks, depLog) {
    const nowMs = Date.now();
    for (const task of tasks) {
        if (task.enabled === false)
            continue;
        // 串行语义（§8）：同任务已有在飞实例则跳过本次新槽
        if (store.listByStatus(IN_FLIGHT_STATUSES).some((o) => o.task_id === task.id))
            continue;
        const slot = dueSlot(task, nowMs, store);
        if (slot === undefined)
            continue;
        // 同步预条件：依赖 + 工作区（不过 ⇒ 不建行、记日志）
        const depVerdict = judgeDependencies(store, task, slot.logicalDate, slot.scheduledAtIso);
        if (!depVerdict.ready) {
            logDepBlocked(depLog, store, task.id, slot.scheduledAtIso);
            continue;
        }
        // 复用旧产出：只告警，不拦（决策 33 已知风险）
        for (const note of depVerdict.staleNotes) {
            store.appendLog({ taskId: task.id, scheduledAt: slot.scheduledAtIso, level: 'warn', kind: 'stale-upstream', message: note });
        }
        let workspace;
        try {
            workspace = resolveWorkspace(ctx, task.target.workspace);
        }
        catch {
            store.appendLog({ taskId: task.id, scheduledAt: slot.scheduledAtIso, level: 'warn', kind: 'precondition', message: `工作区未找到：${task.target.workspace}` });
            continue;
        }
        // 懒建行（同步）：直接 dispatched + 派发快照，杜绝提前 pending / 未来预建。
        // 决策 41：**落库即止**——发动执行是 Loop B（reconciler.sweep）的事，本循环到此为止。
        const id = randomUUID();
        if (!store.ensureInstance(id, task.id, slot.logicalDate, slot.scheduledAtIso, 'dispatched', snapshotOf(task, workspace, depVerdict.resolved)))
            continue; // 撞唯一索引（极少）
        logger.info(`已落库执行记录 ${id}（任务 ${task.id} · ${slot.scheduledAtIso}），发动由执行循环接管（决策 41）`);
    }
}
export function createScheduler(opts) {
    const { ctx, logger, store, reconciler, config } = opts;
    const depLog = new Map();
    let taskMap = new Map();
    return {
        tick() {
            const cfg = config();
            const tasks = loadTasks(logger, cfg);
            taskMap = new Map(tasks.map((t) => [t.id, t]));
            // Loop A：先处理新刻度（懒建行 + 不回看 + 不补跑 + 落库即止，决策 41）
            dispatchNewSlots(ctx, logger, store, tasks, depLog);
            // Loop B：再收口全部执行记录（发动本 tick 新落库的行 + 追问 / 重试 / 租约——
            // 只读执行记录 + 快照，决策 41）。放在 Loop A 之后 = 新行当 tick 即被发动，时延不退化。
            reconciler.sweep();
            // 保留期清除（决策 32：task_log 可定时清）
            store.purgeLog(cfg.logRetentionDays ?? 30);
        },
        getTasks() {
            return taskMap;
        },
        startupDiagnostics() {
            const cfg = config();
            const tasks = loadTasks(logger, cfg);
            const nowMs = Date.now();
            for (const task of tasks) {
                if (task.enabled === false)
                    continue;
                const windowMs = isOnce(task) ? 0 : durationMs(task.schedule.window);
                const lookback = Math.max(windowMs, 2 * 3600_000);
                const from = new Date(nowMs - lookback);
                const to = new Date(nowMs - windowMs);
                let missed = 0;
                try {
                    const slots = isOnce(task)
                        ? (onceDate(task) !== undefined && onceDate(task).getTime() < nowMs - windowMs ? [onceDate(task)] : [])
                        : scheduledSlotsFor(task, from, to);
                    for (const s of slots) {
                        if (store.findBySlot(task.id, s.toISOString()) === undefined)
                            missed++;
                    }
                }
                catch {
                    continue;
                }
                if (missed > 0) {
                    store.appendLog({
                        taskId: task.id, level: 'info', kind: 'startup_missed',
                        message: `自 ${from.toISOString()} 起错过 ${missed} 个刻度（不补跑）`,
                    });
                }
            }
        },
    };
}
