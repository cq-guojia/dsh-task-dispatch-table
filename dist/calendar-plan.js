// calendar-plan.ts — 「任务日程」日历页的纯计算核（服务端与浏览器**同一份**，2026-10-05）。
//
// 为什么单独成文件：日历是两种数据的合流 —— **已发生**（查 `task_instances` 的真实行）与
// **按当前任务定义现算的未来计划**。后者的「一个月的刻度怎么算、怎么按天分桶、哪些不该出现」
// 全是纯逻辑：既要能被 `scripts/smoke.mjs` 直接断言（不许只靠肉眼验收），
// 又必须让浏览器端复用（客户端不许另写一份 cron 解析 —— 本仓硬规矩：一类东西一个实现）。
//
// ⚠️ 与 [`schedule-next.ts`](./schedule-next.ts) / `deps.ts` 同一条约束：
// 不许 import `node:*` / 宿主模块 / React；类型用本文件声明的最小结构。
import { logicalDateOf, onceScheduledAt, scheduledSlotsFor } from './schedule-next.js';
/**
 * 单次调用 `scheduledSlotsFor` 的迭代上限。
 * 刻度最密的 cron 是「每分钟」⇒ 一周最多 10080 个刻度，取 11000 留一档余量。
 * ⚠️ 别退回「整月一次算」：整月最多 44640 个刻度，会撞上 `scheduledSlotsFor` 的 cap 被**静默截断**
 *    （表现为「月底那几天的任务凭空消失」）。
 */
const SLOTS_CAP_PER_SHARD = 11_000;
/** 分片步长 = 一周（配合上面的 cap，保证再密的 cron 也不会被截断）。 */
const SHARD_MS = 7 * 24 * 3600_000;
/** 排期字段 → 纯核要的形状（`null` 归一为 `undefined`；不新造转换层）。 */
function toScheduleNext(task) {
    return {
        schedule: {
            cron: task.schedule.cron ?? undefined,
            once: task.schedule.once ?? undefined,
            timezone: task.schedule.timezone ?? undefined,
            start: task.schedule.start ?? undefined,
            everyNWeeks: task.schedule.everyNWeeks,
        },
    };
}
/**
 * 某自然月的区间，**半开** `[月首 00:00, 次月首 00:00)`，均为本地时区。
 * 上界取次月首（`day` 精度）而不是「月末 23:59:59.999」——与执行记录页同一条半开区间规矩
 * （`client/ui/time-range.ts` 的 `rangeToQuery` + `store.ts` 的 `scheduled_at < toTs`）。
 *
 * @param month **1-based（1 = 一月）** —— 与 `buildMonthCells` / `monthTitle` 同口径，
 *   与 `Date` 的 0-based 差一。⚠️ 2026-10-05 真机 bug：此处原按 0-based 写，而调用方（日历页
 *   `cursor.m`）是 1-based ⇒ 显示 10 月却查了 11 月的区间，整页一条记录都读不出来。
 *   **日历里所有「月份」参数一律 1-based**，别再混。
 */
export function monthRangeOf(year, month) {
    return { from: new Date(year, month - 1, 1, 0, 0, 0, 0), to: new Date(year, month, 1, 0, 0, 0, 0) };
}
/** 月区间 → 服务端查询串（ISO；与 `rangeToQuery` 同口径的 `.toISOString()`）。 */
export function monthRangeQuery(year, month) {
    const { from, to } = monthRangeOf(year, month);
    return { fromTs: from.toISOString(), toTs: to.toISOString() };
}
/**
 * 某月的**未来计划刻度**，按本地日分桶。
 *
 * 三条硬规矩（都是真值约束，不是显示偏好）：
 *   ① **只算启用的任务**（用户 2026-10-05 拍板）：停用任务不会跑，给它出格子就是撒谎；
 *   ② **只列 >= now 的刻度**：过去「该跑没跑」的日子，日历上只能显示真实记录（没有就是没有），
 *      拿**现在的定义**去回填过去，会造出从未发生过的执行；
 *   ③ `once` 出窗口即作废（决策 18 / 拍板 A）⇒ 过期的 `once` 不算计划（同 ②，只认 >= now）。
 *
 * ⚠️ 未来**没有实例行**（决策 31 懒建行：到点才 INSERT，不预建、不回看）⇒ 这里算出的是
 *    「按当前定义推算的计划」，任务改定义 / 停用后会随之变化 —— 是真实计算、不是模拟数据，
 *    UI 必须把它与「已发生」如实区分（AGENTS.md 第五条：正常功能一律真实取数，禁止模拟）。
 */
export function planEntriesByDay(tasks, from, to, now) {
    const out = new Map();
    const push = (task, at) => {
        if (at.getTime() < now.getTime())
            return;
        const day = logicalDateOf(at, undefined);
        const entry = { taskId: task.id, title: task.title, scheduledAt: at.toISOString(), day };
        const list = out.get(day);
        if (list === undefined)
            out.set(day, [entry]);
        else
            list.push(entry);
    };
    for (const task of tasks) {
        if (task.enabled === false)
            continue;
        const next = toScheduleNext(task);
        const once = task.schedule.once;
        if (once !== null && once !== '') {
            // 一次性任务：整月只有它那一个时刻（`onceScheduledAt` 按日期部分判定，不在该日返回 undefined）。
            const at = onceScheduledAt(next, once.slice(0, 10));
            if (at !== undefined)
                push(task, at);
            continue;
        }
        const cron = task.schedule.cron;
        if (cron === null || cron === '')
            continue;
        // 按周分片：分片是半开区间 `[start, end)`，下一片从 end 起 ⇒ 落在该点上的刻度只会被取到一次，
        // 不重不漏（与 `store.ts` 的半开区间同一口径）。
        for (let start = from.getTime(); start < to.getTime(); start += SHARD_MS) {
            const end = Math.min(start + SHARD_MS, to.getTime());
            for (const slot of scheduledSlotsFor(next, new Date(start), new Date(end), SLOTS_CAP_PER_SHARD)) {
                push(task, slot);
            }
        }
    }
    // ISO 串（`...Z`）字典序 = 时间序 ⇒ 直接比串即可，不必回解析成 Date。
    for (const list of out.values())
        list.sort((a, b) => (a.scheduledAt < b.scheduledAt ? -1 : a.scheduledAt > b.scheduledAt ? 1 : 0));
    return out;
}
