import { z } from 'zod';
import type { HostLogger } from './host.js';
export declare const dependencySemantics: readonly ["same_period", "latest_success"];
export type DependencySemantics = (typeof dependencySemantics)[number];
/**
 * 任务定义输入 schema（决策 25）：`id` **可选**——用户不写，由系统在首次加载时生成并
 * 记进状态库 `task_defs` 表（跨重启稳定）；`title` 是给人看的名字，任意文本（中文亦可），
 * 随时可改、**不参与身份**。
 */
export declare const taskDefinitionSchema: z.ZodObject<{
    id: z.ZodOptional<z.ZodString>;
    title: z.ZodOptional<z.ZodString>;
    enabled: z.ZodBoolean;
    schedule: z.ZodObject<{
        cron: z.ZodOptional<z.ZodString>;
        timezone: z.ZodOptional<z.ZodString>;
        window: z.ZodString;
        once: z.ZodOptional<z.ZodString>;
    }, z.core.$strip>;
    target: z.ZodObject<{
        workspace: z.ZodString;
        provider: z.ZodOptional<z.ZodString>;
        model: z.ZodOptional<z.ZodString>;
        manual: z.ZodOptional<z.ZodString>;
        prompt: z.ZodString;
    }, z.core.$strip>;
    contract: z.ZodDefault<z.ZodObject<{
        validStatuses: z.ZodDefault<z.ZodArray<z.ZodString>>;
    }, z.core.$strip>>;
    retry: z.ZodDefault<z.ZodObject<{
        maxAttempts: z.ZodDefault<z.ZodNumber>;
    }, z.core.$strip>>;
    backfill: z.ZodDefault<z.ZodObject<{
        days: z.ZodDefault<z.ZodNumber>;
    }, z.core.$strip>>;
    depends_on: z.ZodOptional<z.ZodArray<z.ZodObject<{
        task: z.ZodString;
        semantics: z.ZodEnum<{
            same_period: "same_period";
            latest_success: "latest_success";
        }>;
        freshness: z.ZodOptional<z.ZodString>;
    }, z.core.$strip>>>;
}, z.core.$strip>;
/** 用户书写形态：`id` 可缺省。 */
export type TaskDefinitionInput = z.infer<typeof taskDefinitionSchema>;
/**
 * 解析后的任务定义：`id` **必有**（未写时由调度器经 `store.resolveTaskId` 生成并回填）。
 * 全链路（scheduler / dispatch / reconcile）都按这个类型走，避免到处判空。
 */
export type TaskDefinition = Omit<TaskDefinitionInput, 'id'> & {
    id: string;
};
/** 展示名：优先 title，回退 id（决策 25：title 只是给人看的，永不参与身份）。 */
export declare function titleOf(task: TaskDefinition): string;
/** 任务来源标识（系统生成 id 的稳定锚点：inline 用下标，目录模式用文件路径）。 */
export interface TaskSource {
    /** 同一定位在多次加载间保持稳定 ⇒ 生成的 id 不会漂。 */
    sourceKey: string;
    def: TaskDefinitionInput;
}
/** 把 ISO 8601 时长解析成毫秒。 */
export declare function durationMs(iso: string): number;
/** 用 Intl 验证 IANA 时区名（schedule.timezone 缺省 = 宿主时区）。 */
export declare function isValidTimeZone(tz: string): boolean;
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
export declare function scheduledSlotsFor(task: TaskDefinition | TaskDefinitionInput, from: Date, to: Date, cap?: number): Date[];
/**
 * 某日历日上的第一个刻度（重排与历史补跑用：决策 20 的 live 重排、§7 backfill
 * 都以「天」为粒度，保留一个刻度/天 的语义即可）。
 */
export declare function firstSlotOnDay(task: TaskDefinition, day: string): Date | undefined;
/** 给定时刻之后的下一个刻度（面板展示「下次执行」用）。 */
export declare function nextSlotAfter(task: TaskDefinition, from: Date): Date | undefined;
/**
 * 一次性任务的计划时刻（决策 18）：`once` = "YYYY-MM-DDTHH:mm"，
 * 按 schedule.timezone 的墙上时间解释（缺省 = 宿主时区）。
 * 仅当 once 的日期部分 == day 时返回该时刻，其余日期返回 undefined ——
 * 实例身份 = task_id + logical_date，once 只有一个日期 ⇒ 只生成一条实例，
 * 跑完（终态）后行已存在、日期已过 ⇒ 天然「跑完自动停」，次年不再触发。
 */
export declare function onceScheduledAt(task: TaskDefinition, day: string): Date | undefined;
/**
 * 解析内嵌任务表 JSON（tasksInline 配置，临时 UI）：须为数组，逐项校验，坏项告警跳过。
 * 返回 **来源对**：`sourceKey` 用下标定位，供系统生成 / 复用的稳定 id 锚定（决策 25）。
 */
export declare function parseInlineTasks(logger: HostLogger, raw: string): TaskSource[];
/**
 * 读任务表目录：逐文件 safeParse，坏文件告警跳过；返回 enabled 的定义。
 * `sourceKey` 用**文件绝对路径**（一文件一任务）⇒ 改文件内容、改 title 都不会丢 id。
 */
export declare function loadTasks(logger: HostLogger, tasksDir: string): TaskSource[];
