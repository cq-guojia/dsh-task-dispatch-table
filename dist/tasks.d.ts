import { z } from 'zod';
import type { HostLogger } from './host.js';
export declare const dependencySemantics: readonly ["same_period", "latest_success"];
export type DependencySemantics = (typeof dependencySemantics)[number];
/**
 * 任务定义输入 schema（决策 25/30）：身份三字段分离——
 * `id` = **机器身份**，录入瞬间由系统生成 UUID 并**写回这段 JSON**（inline 回写 settings、
 * 目录模式回写该文件），人不手写、不参与展示；`title` = 任务名称（人读、随时可改）；
 * `code` = 任务编号（**可选**、用户自编，仅便于查询与管理，**只做记录、不参与任何唯一性判断**
 * ——空格、重名、格式差异都不影响身份判定，因为判断只走 id + 计划刻度）。
 */
export declare const taskDefinitionSchema: z.ZodObject<{
    id: z.ZodOptional<z.ZodString>;
    title: z.ZodOptional<z.ZodString>;
    code: z.ZodOptional<z.ZodString>;
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
    depends_on: z.ZodOptional<z.ZodArray<z.ZodObject<{
        task: z.ZodString;
        semantics: z.ZodEnum<{
            same_period: "same_period";
            latest_success: "latest_success";
        }>;
    }, z.core.$strip>>>;
}, z.core.$strip>;
/** 用户书写形态：`id` 可缺省。 */
export type TaskDefinitionInput = z.infer<typeof taskDefinitionSchema>;
/**
 * 解析后的任务定义：`id` **必有**（用户未写时由 `withIdentity` 生成并回写 JSON）。
 * 全链路（scheduler / dispatch / reconcile）都按这个类型走，避免到处判空。
 */
export type TaskDefinition = Omit<TaskDefinitionInput, 'id'> & {
    id: string;
};
/** 展示名：优先 title，回退 id（决策 25：title 只是给人看的，永不参与身份）。 */
export declare function titleOf(task: TaskDefinition): string;
/** 任务 id 是否合法：必须是标准 UUID。手写 kebab-case / 旧内容指纹等一律不算。 */
export declare function isUuid(value: unknown): value is string;
/** 生成一个任务 id：标准 UUID（决策 30：机器身份与内容、名称彻底解耦，保存时生成并固化写入）。 */
export declare function newTaskId(): string;
/** 保存闸门的身份处理结果。 */
export interface EnsureIdsResult {
    json: string;
    changed: boolean;
    assigned: number;
    /** 非 null = **整批拒绝保存**：id 非 UUID，或 UUID 不在现有任务表中（决策 30 第三次拍板）。 */
    error: string | null;
}
/**
 * 从已保存的 tasksInline 文本里提取全部合法 UUID 集合（保存闸门「修改必须命中」的比对基准）。
 * 非法 JSON / 非数组 / 非 UUID id（老数据）一律不算 ⇒ 拿 UUID 去改老记录同样会被拒（老记录无 UUID 身份，想用就删 id 重录）。
 */
export declare function existingUuidIds(raw: string): ReadonlySet<string>;
/**
 * 保存闸门（决策 30 修订版 + 第三次拍板，用户 2026-09-25：**保存时固化，运行时只认，UUID 不能凭空引入**）。
 * ① 条目无 id ⇒ 生成随机 UUID 补上（= 新增任务，这一刻固化进 JSON）；
 * ② 有 id 且是 UUID ⇒ 必须在 `existingIds`（现有已保存任务表）中命中，命中即原样保留（= 修改既有任务）；
 *    不命中 ⇒ 报错拒绝——带 UUID 就是修改，修改目标必须存在，UUID 身份只能由本闸门生成，不允许凭空写入；
 * ③ 有 id 但不是 UUID ⇒ 报错，**整批拒绝保存**；
 * 非法 JSON / 非数组原样返回（error=null）——那是既有校验的职责，不是身份闸门的。
 * `existingIds` 缺省（undefined）时跳过 ② 的命中校验（仅单测直调用）。
 */
export declare function ensureIdsInInlineJson(raw: string, existingIds?: ReadonlySet<string>): EnsureIdsResult;
/**
 * 运行时身份校验（保存闸门的另一半，用户拍板：**运行时只认不修**）。
 * 有 id 且为 UUID ⇒ 归一返回（code trim、title 缺省回退 id）；
 * 无 id（老数据）或 id 非 UUID ⇒ 返回 null，调用方记一条 warn 后跳过，不做任何兜底。
 */
export declare function applyIdentity(def: TaskDefinitionInput): TaskDefinition | null;
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
 * 某日历日上的第一个刻度（面板展示「下次执行」/ 目录模式历史锚点用；
 * 决策 20 的 live 重排与 §7 backfill 已于决策 31 移除，不再依赖「天」粒度补跑）。
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
 * 解析内嵌任务表 JSON（tasksInline 配置）：须为数组，逐项校验，坏项告警跳过。
 * 身份走 `applyIdentity`（决策 30 修订：**运行时只认不修**）——无 id / 非 UUID 的条目
 * warn 跳过，绝不在这里生成或兜底 id；生成只发生在保存闸门 `ensureIdsInInlineJson`。
 */
export declare function parseInlineTasks(logger: HostLogger, raw: string): TaskDefinition[];
/**
 * 读任务表目录：逐文件 safeParse，坏文件告警跳过；返回 enabled 的定义。
 * 身份同样「运行时只认」（决策 30 修订）：缺 id / id 非 UUID 的文件 warn 跳过，**不再写回**。
 * 目录不存在（ENOENT）= 合法空态（用户没在用目录模式），静默返回，不刷告警。
 */
export declare function loadTasks(logger: HostLogger, tasksDir: string): TaskDefinition[];
