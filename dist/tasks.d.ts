import { z } from 'zod';
import type { HostContext } from './host.js';
export declare const dependencySemantics: readonly ["same_period", "latest_success"];
export type DependencySemantics = (typeof dependencySemantics)[number];
/** 任务定义 14 字段：data-model.md「任务定义」表，字段名严格照抄。 */
export declare const taskDefinitionSchema: z.ZodObject<{
    id: z.ZodString;
    enabled: z.ZodBoolean;
    schedule: z.ZodObject<{
        cron: z.ZodString;
        timezone: z.ZodOptional<z.ZodString>;
        window: z.ZodString;
    }, "strip", z.ZodTypeAny, {
        cron: string;
        window: string;
        timezone?: string | undefined;
    }, {
        cron: string;
        window: string;
        timezone?: string | undefined;
    }>;
    target: z.ZodObject<{
        workspace: z.ZodString;
        model: z.ZodOptional<z.ZodString>;
        manual: z.ZodOptional<z.ZodString>;
        prompt: z.ZodString;
    }, "strip", z.ZodTypeAny, {
        workspace: string;
        prompt: string;
        model?: string | undefined;
        manual?: string | undefined;
    }, {
        workspace: string;
        prompt: string;
        model?: string | undefined;
        manual?: string | undefined;
    }>;
    contract: z.ZodObject<{
        path: z.ZodString;
        validStatuses: z.ZodDefault<z.ZodArray<z.ZodString, "many">>;
    }, "strip", z.ZodTypeAny, {
        path: string;
        validStatuses: string[];
    }, {
        path: string;
        validStatuses?: string[] | undefined;
    }>;
    retry: z.ZodDefault<z.ZodObject<{
        maxAttempts: z.ZodDefault<z.ZodNumber>;
    }, "strip", z.ZodTypeAny, {
        maxAttempts: number;
    }, {
        maxAttempts?: number | undefined;
    }>>;
    backfill: z.ZodDefault<z.ZodObject<{
        days: z.ZodDefault<z.ZodNumber>;
    }, "strip", z.ZodTypeAny, {
        days: number;
    }, {
        days?: number | undefined;
    }>>;
    depends_on: z.ZodOptional<z.ZodArray<z.ZodObject<{
        task: z.ZodString;
        semantics: z.ZodEnum<["same_period", "latest_success"]>;
        freshness: z.ZodOptional<z.ZodString>;
    }, "strip", z.ZodTypeAny, {
        task: string;
        semantics: "same_period" | "latest_success";
        freshness?: string | undefined;
    }, {
        task: string;
        semantics: "same_period" | "latest_success";
        freshness?: string | undefined;
    }>, "many">>;
}, "strip", z.ZodTypeAny, {
    id: string;
    enabled: boolean;
    schedule: {
        cron: string;
        window: string;
        timezone?: string | undefined;
    };
    target: {
        workspace: string;
        prompt: string;
        model?: string | undefined;
        manual?: string | undefined;
    };
    contract: {
        path: string;
        validStatuses: string[];
    };
    retry: {
        maxAttempts: number;
    };
    backfill: {
        days: number;
    };
    depends_on?: {
        task: string;
        semantics: "same_period" | "latest_success";
        freshness?: string | undefined;
    }[] | undefined;
}, {
    id: string;
    enabled: boolean;
    schedule: {
        cron: string;
        window: string;
        timezone?: string | undefined;
    };
    target: {
        workspace: string;
        prompt: string;
        model?: string | undefined;
        manual?: string | undefined;
    };
    contract: {
        path: string;
        validStatuses?: string[] | undefined;
    };
    retry?: {
        maxAttempts?: number | undefined;
    } | undefined;
    backfill?: {
        days?: number | undefined;
    } | undefined;
    depends_on?: {
        task: string;
        semantics: "same_period" | "latest_success";
        freshness?: string | undefined;
    }[] | undefined;
}>;
export type TaskDefinition = z.infer<typeof taskDefinitionSchema>;
/** 把 ISO 8601 时长解析成毫秒。 */
export declare function durationMs(iso: string): number;
/** 用 Intl 验证 IANA 时区名（schedule.timezone 缺省 = 宿主时区）。 */
export declare function isValidTimeZone(tz: string): boolean;
/** 取某时刻在指定时区的日历日（logical date 归属用计划时刻，state-machine §9）。 */
export declare function logicalDateOf(date: Date, timeZone: string | undefined): string;
/** 算任务在指定日历日的计划时刻；找不到（cron 与日历不产生该日）返回 undefined。 */
export declare function scheduledAtFor(task: TaskDefinition, day: string, searchFrom: Date): Date | undefined;
/** 读任务表目录：逐文件 safeParse，坏文件告警跳过；返回 enabled 的定义。 */
export declare function loadTasks(ctx: HostContext, tasksDir: string): TaskDefinition[];
