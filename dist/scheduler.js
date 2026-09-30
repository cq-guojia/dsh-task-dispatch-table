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
import { attachmentAbsPath } from './task-assets.js';
import { parseInlineTasks } from './tasks.js';
import { displayNameOf, durationMs, logicalDateOf, scheduledSlotsFor } from './tasks.js';
import { parseInstanceSnapshot } from './store.js';
import { resolveWorkspace } from './dispatch.js';
/** 阻塞原因 → task_log 的 kind 与文案（用户一眼能分清「没跑成」和「永远不会跑」）。 */
const BLOCK_KIND = {
    'upstream-not-succeeded': { kind: 'dep_blocked', message: '被依赖卡住，等待上游成功（下轮再判）' },
    'upstream-disabled': { kind: 'dep_disabled', message: '上游任务已停用，永远不会放行（除非启用上游或移除该前置）' },
    'upstream-missing': { kind: 'dep_missing', message: '上游任务已不存在（被删除），永远不会放行（除非移除该前置）' },
};
// 串行互斥只认**真正在飞**的状态（决策 8：同任务不并发）。
// 不含 'unknown'：unknown 只由重启扫描产生（会话句柄已随进程消失、不定态），它应在 sweep 里
// 被快速收口为终态；若还把它当「在飞」参与互斥，会在老库卡死的孤儿实例上把同任务永久挡死
// （本次真机 bug：老库一条卡 running 的历史实例 → 重启转 unknown → 同 cron 任务再也写不出新行）。
const IN_FLIGHT_STATUSES = ['dispatched', 'running'];
// ── 调度输入加载（inline JSON 或目录，按配置择一）──
function loadTasks(logger, config, includeDisabled = false) {
    if (config.tasksInline.trim() !== '') {
        const parsed = parseInlineTasks(logger, config.tasksInline, { includeDisabled });
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
export function judgeDependencies(store, task, logicalDate, scheduledAt, 
/**
 * 上游任务定义表（可选）：给了就能区分「上游还没成功 / 上游停用 / 上游已删除」三种阻塞，
 * 日志里不再混成一句 dep_blocked（2026-09-30 评审 P4）。
 */
upstreams) {
    const deps = task.depends_on;
    if (!deps || deps.length === 0)
        return { ready: true, staleNotes: [], resolved: [] };
    const staleNotes = [];
    const resolved = [];
    // 「复用旧产出」告警判据：下游上次执行时刻（首次运行无 ⇒ 不告警）。只提示，不拦。
    const lastRun = store.getLatestInstance(task.id);
    const lastRunMs = lastRun === undefined ? undefined : Date.parse(lastRun.scheduled_at);
    for (const dep of deps) {
        // 阻塞原因先按「上游定义还在不在 / 开没开」定性，再看实例状态。
        if (upstreams !== undefined) {
            const upstreamDef = upstreams.get(dep.task);
            if (upstreamDef === undefined)
                return { ready: false, staleNotes, resolved: [], reason: 'upstream-missing' };
            if (upstreamDef.enabled === false)
                return { ready: false, staleNotes, resolved: [], reason: 'upstream-disabled' };
        }
        if (dep.semantics === 'same_period') {
            // 同周期：同 logical_date 取最新一条，必须 succeeded（决策 33 #2）
            const upstream = store.getSamePeriod(dep.task, logicalDate);
            if (upstream === undefined || upstream.status !== 'succeeded') {
                return { ready: false, staleNotes, resolved: [], reason: 'upstream-not-succeeded' };
            }
            // 决策 43：命中即固化——写库那一刻是哪条上游实例放的行，就此定死
            resolved.push(resolvedOf(dep, upstream));
            continue;
        }
        // latest_success（决策 33）：上游**最近一条**（不分状态）必须正好是 succeeded；
        // 在跑 / 失败 / 无记录 ⇒ 阻塞，绝不拿更早的旧成功放行。
        const latest = store.getLatestInstance(dep.task);
        if (latest === undefined || latest.status !== 'succeeded') {
            return { ready: false, staleNotes, resolved: [], reason: 'upstream-not-succeeded' };
        }
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
    let previous;
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
            // 升序遍历：每次选中更晚的刻度时，被顶掉的那一个就是「前一槽」。
            for (const s of scheduledSlotsFor(task, from, to)) {
                if (s.getTime() > nowMs)
                    continue;
                if (chosen === undefined || s.getTime() > chosen.getTime()) {
                    previous = chosen;
                    chosen = s;
                }
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
    // 窗口里只有一条刻度（间隔 > 窗口，如日更 + PT4H）⇒ 前一槽在窗口之外，单独**有界回溯**一次。
    // 只在「窗口内 ≤1 条」时才走这条路 ⇒ 稀疏任务才付这个成本，分钟级任务不会。
    if (previous === undefined && !isOnce(task)) {
        const lookbackMs = Math.max(durationMs(task.schedule.window) * 2, 8 * 86_400_000);
        try {
            const earlier = scheduledSlotsFor(task, new Date(chosen.getTime() - lookbackMs), new Date(chosen.getTime() + 1000));
            const last = earlier[earlier.length - 1];
            if (last !== undefined && last.getTime() < chosen.getTime())
                previous = last;
        }
        catch { /* 回溯失败 ⇒ 当作没有前一槽，不补记（绝不猜） */ }
    }
    return { logicalDate: logicalDateOf(chosen, task.schedule.timezone), scheduledAtIso: iso, previous };
}
/**
 * 阻塞日志（2026-09-30 改为**结论变化才记**）：同一任务 + 同一结论只记一次，
 * 一直卡着不再重复写（旧行为 5 分钟一条 ⇒ 一天 288 条，会把日志淹掉）。
 * 放行时调用方 `delete` 掉该任务的签名 ⇒ 下次再卡住能重新记一条。
 */
function logBlocked(verdictLog, store, taskId, scheduledAt, reason) {
    const fallback = { kind: 'dep_blocked', message: '被依赖卡住，等待上游成功（下轮再判）' };
    const mapped = reason === undefined ? fallback : (BLOCK_KIND[reason] ?? fallback);
    if (verdictLog.get(taskId) === mapped.kind)
        return;
    verdictLog.set(taskId, mapped.kind);
    store.appendLog({ taskId, scheduledAt, level: 'info', kind: mapped.kind, message: mapped.message });
}
/**
 * 附加文件存在性校验（2026-09-30）：返回**缺失**的展示名。
 * upload 型按任务目录绝对路径；link 型按**附件来源工作区**（item.workspace）解析——
 * 附件可以选自任意工作区，拿任务目标工作区的 path 去判会误报（评审 P1#8）。
 * 拿不到基准（资产根未就绪 / 来源工作区不存在）⇒ 跳过不判，**绝不猜**。
 */
export function missingAttachments(ctx, task, workspacePath, assets) {
    const list = task.attachments;
    if (list === undefined || list.length === 0)
        return [];
    const out = [];
    for (const item of list) {
        let abs = null;
        if (item.kind === 'upload') {
            abs = assets === null ? null : attachmentAbsPath(assets, task.id, item.ref);
        }
        else {
            const source = item.workspace !== undefined && item.workspace.trim() !== '' ? item.workspace : task.target.workspace;
            try {
                abs = join(resolveWorkspace(ctx, source).path, item.ref);
            }
            catch {
                abs = null; // 来源工作区不存在 ⇒ 不判（由工作区解析那道预条件另行报错）
            }
        }
        if (abs === null || abs.includes('..'))
            continue;
        if (!existsSync(abs))
            out.push(item.name);
    }
    return out;
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
        // 2026-09-30：附件清单随快照冻结 ⇒ Loop B 校验「附件还在不在」不必回头读任务定义
        // （决策 41：Loop B 只读快照）。
        attachments: (task.attachments ?? []).map(item => ({
            name: item.name,
            kind: item.kind,
            ref: item.ref,
            ...(item.workspace === undefined ? {} : { workspace: item.workspace }),
        })),
    };
}
function dispatchNewSlots(ctx, logger, store, tasks, verdictLog, upstreams, assets, 
/** 主界面运行态内存索引（2026-09-30）：落库即顺手标记「运行中」，不额外查库。 */
runtime, 
/** 本进程启动时刻（决策 54）：补记「未执行」只补**启动之后**的槽 ⇒ 停机期间漏的不补。 */
startedAtMs) {
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
        // 补记「未执行」（决策 54，用户拍板）：**等到下一个该执行的时刻**才判——紧邻的前一槽若始终没有
        // 实例行，说明它彻底没戏了（窗口里已经出现更晚的刻度 ⇒ 调度器再也不会选它），补记**一条** `skipped`。
        // 规则：只补紧邻那一条（中间漏掉的 N 条不补）；停机期间不补（`startedAtMs` 门禁）；once 不适用。
        // ⚠️ 主键必须用**被漏那一槽自己的时刻**：用当前槽会撞当前槽真实执行行的唯一键，
        // `INSERT OR IGNORE` 静默丢弃 ⇒ 任务永久不再执行。
        if (slot.previous !== undefined && !isOnce(task) && slot.previous.getTime() >= startedAtMs) {
            const prevIso = slot.previous.toISOString();
            if (store.findBySlot(task.id, prevIso) === undefined) {
                const missedId = randomUUID();
                const prevLogical = logicalDateOf(slot.previous, task.schedule.timezone);
                if (store.ensureSkipped(missedId, task.id, prevLogical, prevIso)) {
                    // 原因取「本轮该任务上一次记录的阻塞结论」（签名表）——现成文案复用 BLOCK_KIND，认不出就如实说。
                    const signature = verdictLog.get(task.id);
                    const detail = signature === undefined
                        ? '上一刻度未执行（该轮未记录到原因）'
                        : (BLOCK_KIND[signature]?.message ?? `上一刻度未执行（${signature}）`);
                    store.appendEvent(missedId, 'missed-slot', { scheduledAt: prevIso, reason: detail });
                    store.appendLog({
                        taskId: task.id,
                        scheduledAt: prevIso,
                        level: 'error',
                        kind: 'missed-slot',
                        message: `上一刻度未执行，已补记一条记录：${detail}`,
                    });
                    // 内存运行态顺手更新（否则卡片要等重启 rebuild 才显示这条）。
                    runtime?.markTerminal(task.id, 'skipped', prevIso, new Date().toISOString());
                }
            }
        }
        // 同步预条件：依赖 + 工作区（不过 ⇒ 不建行、记日志）
        const depVerdict = judgeDependencies(store, task, slot.logicalDate, slot.scheduledAtIso, upstreams);
        if (!depVerdict.ready) {
            logBlocked(verdictLog, store, task.id, slot.scheduledAtIso, depVerdict.reason);
            // 顺手把「被什么挡住」透给运行态（决策 54 · P3b：延期悬浮说明要能说出**具体原因**）。
            // 只加展示数据、**不改调度语义**；放行时（下面 verdictLog.delete 处）清空。
            runtime?.markBlocked(task.id, depVerdict.reason === undefined
                ? '被前置任务挡住'
                : (BLOCK_KIND[depVerdict.reason]?.message ?? '被前置任务挡住'));
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
        // 附加文件校验（2026-09-30）：缺失 ⇒ **不建行、不执行**，只记 error。
        // 与「预条件不过不建行」同源；且不判 failed——重试也不会自己长出来，白耗重试额度。
        // 日志走「结论变化才记」的同一张签名表，缺着不修就不会每 tick 刷一条。
        const missing = missingAttachments(ctx, task, workspace.path, assets);
        if (missing.length > 0) {
            if (verdictLog.get(task.id) !== 'attachment-missing') {
                verdictLog.set(task.id, 'attachment-missing');
                store.appendLog({
                    taskId: task.id,
                    scheduledAt: slot.scheduledAtIso,
                    level: 'error',
                    kind: 'attachment-missing',
                    message: `附加文件不存在，本次不执行：${missing.join('、')}（请重新上传或移除该附件）`,
                });
            }
            // 透出原因（决策 54 · P3b）：附件找不到属**任务级错误**，用户必须知道是哪一个文件。
            runtime?.markBlocked(task.id, `附加文件不存在：${missing.join('、')}`);
            continue;
        }
        // 全部预条件通过 ⇒ 清掉阻塞 / 缺附件签名，下次再卡住能重新记一条；顺带清掉展示用的阻塞原因。
        verdictLog.delete(task.id);
        runtime?.markBlocked(task.id, null);
        // 懒建行（同步）：直接 dispatched + 派发快照，杜绝提前 pending / 未来预建。
        // 决策 41：**落库即止**——发动执行是 Loop B（reconciler.sweep）的事，本循环到此为止。
        const id = randomUUID();
        if (!store.ensureInstance(id, task.id, slot.logicalDate, slot.scheduledAtIso, 'dispatched', snapshotOf(task, workspace, depVerdict.resolved)))
            continue; // 撞唯一索引（极少）
        // 主界面运行态（内存，非真源）：刚落库 ⇒ 该任务在飞。Loop B 收口时会由 markTerminal 清除。
        runtime?.markDispatched(task.id, slot.scheduledAtIso);
        logger.info(`已落库执行记录 ${id}（任务 ${task.id} · ${slot.scheduledAtIso}），发动由执行循环接管（决策 41）`);
    }
}
export function createScheduler(opts) {
    const { ctx, logger, store, reconciler, config, assets, runtime } = opts;
    const verdictLog = new Map();
    let taskMap = new Map();
    /** 进程启动时刻（决策 54）：补记「未执行」的门禁 —— 停机期间漏掉的槽**不补**。 */
    const startedAtMs = Date.now();
    return {
        tick() {
            const cfg = config();
            // 全量（含停用）解析一份 ⇒ 依赖判定才能分清「上游停用」和「上游已删除」
            // （enabled 的 taskMap 里根本没有停用任务，误把停用报成"已删除"，评审 P1#4）。
            const allTasks = loadTasks(logger, cfg, true);
            const tasks = allTasks.filter((t) => t.enabled);
            const upstreams = new Map(allTasks.map((t) => [t.id, t]));
            // 快照（getTasks）必须含停用任务：停用只是「暂不开跑」，仍是合法前置候选
            // （设计约定：设前置不受启停影响）。派发只用 `tasks`（已按 enabled 过滤），
            // 故这里把全量写进 taskMap，让前端前置列表能选到停用任务。
            taskMap = new Map(allTasks.map((t) => [t.id, t]));
            // Loop A：先处理新刻度（懒建行 + 不回看 + 不补跑 + 落库即止，决策 41）
            dispatchNewSlots(ctx, logger, store, tasks, verdictLog, upstreams, assets === undefined ? null : assets(), runtime ?? null, startedAtMs);
            // Loop B：再收口全部执行记录（发动本 tick 新落库的行 + 追问 / 重试 / 租约——
            // 只读执行记录 + 快照，决策 41）。放在 Loop A 之后 = 新行当 tick 即被发动，时延不退化。
            reconciler.sweep();
            // 保留期清除：诊断日志 30 天；执行记录**默认不清**（cfg.historyRetentionDays = 0 ⇒ 直接返回）
            store.purgeLog(cfg.logRetentionDays ?? 30);
            store.purgeHistory(cfg.historyRetentionDays ?? 0);
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
