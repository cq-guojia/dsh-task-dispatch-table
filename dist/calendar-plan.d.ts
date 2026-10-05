/** 日历只认任务的这几个字段（服务端 `TaskDefinition` 与客户端 overview 行都天然形状兼容）。 */
export interface CalendarTask {
    id: string;
    title: string;
    enabled: boolean;
    schedule: {
        cron: string | null;
        once: string | null;
        timezone: string | null;
        start: string | null;
        everyNWeeks: number | null;
    };
}
/** 一条**未来计划**（尚未产生执行记录）。 */
export interface CalendarPlanEntry {
    taskId: string;
    title: string;
    /** 绝对时刻（ISO）—— 与历史行的 `scheduled_at` 同一口径。 */
    scheduledAt: string;
    /** 分桶键 = 该时刻的**浏览器本地日**（`YYYY-MM-DD`；与执行记录页同一抉择，不用 `logical_date`）。 */
    day: string;
}
/**
 * 某自然月的区间，**半开** `[月首 00:00, 次月首 00:00)`，均为本地时区。
 * 上界取次月首（`day` 精度）而不是「月末 23:59:59.999」——与执行记录页同一条半开区间规矩
 * （`client/ui/time-range.ts` 的 `rangeToQuery` + `store.ts` 的 `scheduled_at < toTs`）。
 *
 * @param month 0-based（0 = 一月，与 `Date` 同口径）。
 */
export declare function monthRangeOf(year: number, month: number): {
    from: Date;
    to: Date;
};
/** 月区间 → 服务端查询串（ISO；与 `rangeToQuery` 同口径的 `.toISOString()`）。 */
export declare function monthRangeQuery(year: number, month: number): {
    fromTs: string;
    toTs: string;
};
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
export declare function planEntriesByDay(tasks: readonly CalendarTask[], from: Date, to: Date, now: Date): Map<string, CalendarPlanEntry[]>;
