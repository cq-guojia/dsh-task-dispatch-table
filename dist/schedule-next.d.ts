/**
 * 这些函数实际只读 `task.schedule` 的这五个字段（服务端定义 / 客户端草稿组装物都可喂）。
 * ⚠️ 字段可选性照 `taskDefinitionSchema` 抄：`everyNWeeks` 可空。
 */
export interface ScheduleNextSchedule {
    cron?: string;
    timezone?: string;
    once?: string;
    start?: string;
    everyNWeeks?: number | null;
}
/** 最小任务形状：只要求带 `schedule`。 */
export interface ScheduleNextTask {
    schedule: ScheduleNextSchedule;
}
/** 取某时刻在指定时区的日历日（logical date 归属用计划时刻，state-machine §9）。 */
export declare function logicalDateOf(date: Date, timeZone: string | undefined): string;
/**
 * cron 在 `[from, to)` 区间内的**全部刻度**（决策 25 的核心改动）。
 *
 * 旧实现 `scheduledAtFor` 按「天」只取第一个匹配 ⇒ **每小时 / 每几分钟的 cron 一天只能出
 * 一条**，是功能缺陷。刻度**由 cron 表达式决定**，不是「上一次 + 间隔」⇒ 迟到 / 重启 /
 * 多跑几轮都不会漂移（8:01 才跑，记的仍是 `08:00` 这个槽）。
 *
 * @param cap 迭代上限（防御 cron 表达成极小间隔导致死循环）；超出即截断。
 */
export declare function scheduledSlotsFor(task: ScheduleNextTask, from: Date, to: Date, cap?: number): Date[];
/**
 * 周期任务的锚点 / 步长过滤（「开始时间」+「每 N 周」）：
 * - `start`：首跑下界（不早于此时）；也是「每 N 周」取模的参考周（start 所在周 = 第 0 周）。
 * - `everyNWeeks`：每周档的重复步长。cron 没有「第几周」位 ⇒ 用「刻度与 start 的整周差 % N」
 *   过滤，天然覆盖用户诉求：开始时间设下周一、每 2 周 ⇒ 下周一跑、下下周跳过、再下一周跑。
 */
export declare function filterSlotsBySchedule(task: ScheduleNextTask, slots: Date[]): Date[];
/** 给定时刻之后的下一个刻度（面板展示「下次执行」用）。 */
export declare function nextSlotAfter(task: ScheduleNextTask, from: Date): Date | undefined;
/**
 * 一次性任务的计划时刻（决策 18）：`once` = "YYYY-MM-DDTHH:mm"，
 * 按 schedule.timezone 的墙上时间解释（缺省 = 宿主时区）。
 * 仅当 once 的日期部分 == day 时返回该时刻，其余日期返回 undefined ——
 * 实例身份 = task_id + logical_date，once 只有一个日期 ⇒ 只生成一条实例，
 * 跑完（终态）后行已存在、日期已过 ⇒ 天然「跑完自动停」，次年不再触发。
 */
export declare function onceScheduledAt(task: ScheduleNextTask, day: string): Date | undefined;
