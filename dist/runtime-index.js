import { nextSlotAfter, titleOf } from './tasks.js';
/** 影响「下一刻度」的定义指纹（改了才重算；不动则每轮零成本）。 */
function scheduleKeyOf(task) {
    const s = task.schedule;
    return [
        task.enabled ? '1' : '0',
        s.cron ?? '',
        s.once ?? '',
        s.timezone ?? '',
        s.start ?? '',
        s.everyNWeeks === undefined ? '' : String(s.everyNWeeks),
    ].join('|');
}
/** 提示词首段（按字符截断，中文不按字节切）。 */
const PROMPT_HEAD_CHARS = 120;
const headOf = (text) => (text.length <= PROMPT_HEAD_CHARS ? text : `${text.slice(0, PROMPT_HEAD_CHARS)}…`);
export function createRuntimeIndex() {
    const entries = new Map();
    let rev = 1;
    const entryOf = (taskId) => {
        const hit = entries.get(taskId);
        if (hit !== undefined)
            return hit;
        const created = {
            taskId,
            running: false,
            runningSince: null,
            lastStatus: null,
            lastScheduledAt: null,
            lastFinishedAt: null,
            nextSlotAt: null,
        };
        entries.set(taskId, created);
        return created;
    };
    /** 单个任务的刻度计算异常（非法 cron 等）不能连累整份列表。 */
    const computeNext = (task, nowMs) => {
        try {
            const next = nextSlotAfter(task, new Date(nowMs));
            return next === undefined ? null : next.toISOString();
        }
        catch {
            return null;
        }
    };
    return {
        rebuild(tasks, store, nowMs = Date.now()) {
            entries.clear();
            if (store !== null) {
                for (const [taskId, last] of store.lastRunByTask()) {
                    const entry = entryOf(taskId);
                    entry.lastStatus = last.status;
                    entry.lastScheduledAt = last.scheduledAt;
                    entry.lastFinishedAt = last.finishedAt;
                }
                // 启动时**用库里在飞行的行重建**：这些是重启后的真实孤儿（U1），一次扫描几十行；
                // 真卡死的由 unknown 宽限收口，届时 markTerminal 会把 running 清掉。
                for (const [taskId, since] of store.inFlightByTask()) {
                    const entry = entryOf(taskId);
                    entry.running = true;
                    entry.runningSince = since;
                }
            }
            for (const task of tasks) {
                const entry = entryOf(task.id);
                entry.defKey = scheduleKeyOf(task);
                entry.nextSlotAt = computeNext(task, nowMs);
            }
            rev++;
        },
        markDispatched(taskId, scheduledAt) {
            const entry = entryOf(taskId);
            entry.running = true;
            entry.runningSince = entry.runningSince ?? scheduledAt;
            entry.lastScheduledAt = scheduledAt;
            entry.lastStatus = 'dispatched';
            rev++;
        },
        markTerminal(taskId, status, scheduledAt, finishedAt) {
            const entry = entryOf(taskId);
            entry.running = false;
            entry.runningSince = null;
            entry.lastStatus = status;
            entry.lastScheduledAt = scheduledAt;
            entry.lastFinishedAt = finishedAt;
            rev++;
        },
        clearRunning(taskId) {
            const entry = entries.get(taskId);
            if (entry === undefined || !entry.running)
                return;
            entry.running = false;
            entry.runningSince = null;
            rev++;
        },
        forget(taskId) {
            if (entries.delete(taskId))
                rev++;
        },
        overview(tasks, nowMs) {
            const byId = new Map(tasks.map(task => [task.id, task]));
            const rows = [];
            for (const task of tasks) {
                const entry = entryOf(task.id);
                const key = scheduleKeyOf(task);
                if (entry.defKey !== key) {
                    // 排期 / 启停变了 ⇒ 重算下一刻度（用户改完必须立刻看到新时间）。
                    entry.defKey = key;
                    entry.nextSlotAt = computeNext(task, nowMs);
                    rev++;
                }
                else if (entry.nextSlotAt !== null && Date.parse(entry.nextSlotAt) <= nowMs) {
                    // 刻度已过（时间自然推进）⇒ 就地前移到下一个。
                    const next = computeNext(task, nowMs);
                    if (next !== entry.nextSlotAt) {
                        entry.nextSlotAt = next;
                        rev++;
                    }
                }
                rows.push({
                    id: task.id,
                    title: titleOf(task),
                    code: task.code === undefined || task.code.trim() === '' ? null : task.code.trim(),
                    enabled: task.enabled,
                    workspace: task.target.workspace,
                    createdAt: task.createdAt ?? null,
                    provider: task.target.provider ?? null,
                    model: task.target.model ?? null,
                    // 防御取值：overview 是展示面，畸形定义也不能让它崩（zod 有默认值的字段仍按可选读）。
                    retryMax: task.retry?.maxAttempts ?? 1,
                    schedule: {
                        cron: task.schedule.cron ?? null,
                        once: task.schedule.once ?? null,
                        timezone: task.schedule.timezone ?? null,
                        start: task.schedule.start ?? null,
                        everyNWeeks: task.schedule.everyNWeeks ?? null,
                        // 防御取值：overview 是展示面，畸形定义也不能让它崩（zod 有默认值的字段仍按可选读）。
                        window: task.schedule.window ?? 'PT0S',
                    },
                    promptHead: headOf(task.target.prompt),
                    attachments: (task.attachments ?? []).map(item => ({ name: item.name, kind: item.kind })),
                    depends: (task.depends_on ?? []).map(dep => {
                        const upstream = byId.get(dep.task);
                        return {
                            id: dep.task,
                            title: upstream === undefined ? dep.task : titleOf(upstream),
                            enabled: upstream?.enabled ?? false,
                        };
                    }),
                    running: entry.running,
                    runningSince: entry.runningSince,
                    lastStatus: entry.lastStatus,
                    lastScheduledAt: entry.lastScheduledAt,
                    lastFinishedAt: entry.lastFinishedAt,
                    nextSlotAt: entry.nextSlotAt,
                });
            }
            // 已删任务的残留条目：任务表里没了就别再占着内存。
            if (entries.size > byId.size) {
                for (const taskId of [...entries.keys()]) {
                    if (byId.has(taskId))
                        continue;
                    entries.delete(taskId);
                    rev++;
                }
            }
            return { rev, rows };
        },
        revision() {
            return rev;
        },
    };
}
