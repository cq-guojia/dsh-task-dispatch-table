import { z } from 'zod';
import type { HostContext } from './host.js';
export declare const dependencySemantics: readonly ["same_period", "latest_success"];
export type DependencySemantics = (typeof dependencySemantics)[number];
/** 任务定义 15 字段：data-model.md「任务定义」表，字段名严格照抄。 */
export declare const taskDefinitionSchema: z.ZodObject<{
    id: z.ZodString;
    enabled: z.ZodBoolean;
    schedule: z.ZodObject<{
        cron: z.ZodOptional<z.ZodString>;
        timezone: z.ZodOptional<z.ZodString>;
        window: z.ZodString;
        once: z.ZodOptional<z.ZodString>;
    }, z.core.$strip>;
    target: z.ZodObject<{
        workspace: z.ZodString;
        model: z.ZodOptional<z.ZodString>;
        manual: z.ZodOptional<z.ZodString>;
        prompt: z.ZodString;
    }, z.core.$strip>;
    contract: z.ZodObject<{
        path: z.ZodString;
        validStatuses: z.ZodDefault<z.ZodArray<z.ZodString>>;
    }, z.core.$strip>;
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
export type TaskDefinition = z.infer<typeof taskDefinitionSchema>;
/** 把 ISO 8601 时长解析成毫秒。 */
export declare function durationMs(iso: string): number;
/** 用 Intl 验证 IANA 时区名（schedule.timezone 缺省 = 宿主时区）。 */
export declare function isValidTimeZone(tz: string): boolean;
/** 取某时刻在指定时区的日历日（logical date 归属用计划时刻，state-machine §9）。 */
export declare function logicalDateOf(date: Date, timeZone: string | undefined): string;
/** 算 cron 任务在指定日历日的计划时刻；找不到（cron 与日历不产生该日）返回 undefined。 */
export declare function scheduledAtFor(task: TaskDefinition, day: string, searchFrom: Date): Date | undefined;
/**
 * 一次性任务的计划时刻（决策 18）：`once` = "YYYY-MM-DDTHH:mm"，
 * 按 schedule.timezone 的墙上时间解释（缺省 = 宿主时区）。
 * 仅当 once 的日期部分 == day 时返回该时刻，其余日期返回 undefined ——
 * 实例身份 = task_id + logical_date，once 只有一个日期 ⇒ 只生成一条实例，
 * 跑完（终态）后行已存在、日期已过 ⇒ 天然「跑完自动停」，次年不再触发。
 */
export declare function onceScheduledAt(task: TaskDefinition, day: string): Date | undefined;
/** 解析内嵌任务表 JSON（tasksInline 配置，临时 UI）：须为数组，逐项校验，坏项告警跳过。 */
export declare function parseInlineTasks(ctx: HostContext, raw: string): TaskDefinition[];
/** 读任务表目录：逐文件 safeParse，坏文件告警跳过；返回 enabled 的定义。 */
export declare function loadTasks(ctx: HostContext, tasksDir: string): TaskDefinition[];
