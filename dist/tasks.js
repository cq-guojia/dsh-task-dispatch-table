// 任务定义：从任务表目录读 *.json，zod 校验 14 字段（data-model.md 一节），enabled 过滤。
// 定义存 JSON 文件人改进 Git（决策 6），本模块只读不写。
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { resolve } from 'node:path';
import { z } from 'zod';
// cron-parser 5.x 为 ESM，命名导出 CronExpressionParser。
import { CronExpressionParser } from 'cron-parser';
/** ISO 8601 时长（如 PT4H），只支持 H/M/S 组合——窗口与新鲜度够用。 */
const isoDuration = z.string().regex(/^PT(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?$/, 'ISO 8601 时长，如 PT4H');
export const dependencySemantics = ['same_period', 'latest_success'];
/** 任务定义 15 字段：data-model.md「任务定义」表，字段名严格照抄。 */
export const taskDefinitionSchema = z.object({
    id: z.string().regex(/^[a-z0-9]+(-[a-z0-9]+)*$/, 'kebab-case'),
    enabled: z.boolean(),
    schedule: z.object({
        cron: z.string().min(1).optional(),
        timezone: z.string().optional(),
        window: isoDuration,
        once: z.string().optional(),
    }),
    target: z.object({
        workspace: z.string().min(1),
        model: z.string().optional(),
        manual: z.string().optional(),
        prompt: z.string().min(1),
    }),
    contract: z.object({
        path: z.string().min(1),
        validStatuses: z.array(z.string()).default(['ok']),
    }),
    retry: z.object({ maxAttempts: z.number().int().min(1).default(1) }).default({ maxAttempts: 1 }),
    backfill: z.object({ days: z.number().int().min(0).default(0) }).default({ days: 0 }),
    depends_on: z
        .array(z.object({
        task: z.string().min(1),
        semantics: z.enum(dependencySemantics),
        freshness: isoDuration.optional(),
    }))
        .optional(),
});
/** 把 ISO 8601 时长解析成毫秒。 */
export function durationMs(iso) {
    const match = /^PT(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?$/.exec(iso);
    if (match === null)
        throw new Error(`非法 ISO 8601 时长: ${iso}`);
    const [, h, m, s] = match;
    return (Number(h ?? 0) * 3600 + Number(m ?? 0) * 60 + Number(s ?? 0)) * 1000;
}
/** 用 Intl 验证 IANA 时区名（schedule.timezone 缺省 = 宿主时区）。 */
export function isValidTimeZone(tz) {
    try {
        new Intl.DateTimeFormat('en-CA', { timeZone: tz });
        return true;
    }
    catch {
        return false;
    }
}
/** 取某时刻在指定时区的日历日（logical date 归属用计划时刻，state-machine §9）。 */
export function logicalDateOf(date, timeZone) {
    return new Intl.DateTimeFormat('en-CA', {
        timeZone: timeZone ?? undefined,
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
    }).format(date);
}
/** 算 cron 任务在指定日历日的计划时刻；找不到（cron 与日历不产生该日）返回 undefined。 */
export function scheduledAtFor(task, day, searchFrom) {
    const cron = task.schedule.cron;
    if (cron === undefined)
        return undefined; // once 任务不走 cron（互斥校验保证恰有其一）
    const interval = CronExpressionParser.parse(cron, {
        currentDate: searchFrom,
        tz: task.schedule.timezone,
    });
    for (let i = 0; i < 62; i++) {
        const next = interval.next().toDate();
        const dayOf = logicalDateOf(next, task.schedule.timezone);
        if (dayOf === day)
            return next;
        if (dayOf > day)
            return undefined;
    }
    return undefined;
}
/** 某时区在给定绝对时刻的 UTC 偏移毫秒（DST 敏感）。 */
function tzOffsetMs(date, timeZone) {
    const parts = new Intl.DateTimeFormat('en-US', {
        timeZone, hour12: false,
        year: 'numeric', month: '2-digit', day: '2-digit',
        hour: '2-digit', minute: '2-digit', second: '2-digit',
    }).formatToParts(date);
    const value = {};
    for (const part of parts)
        value[part.type] = part.value;
    const asUTC = Date.UTC(Number(value.year), Number(value.month) - 1, Number(value.day), Number(value.hour === '24' ? '0' : value.hour), Number(value.minute), Number(value.second));
    return asUTC - date.getTime();
}
/**
 * 一次性任务的计划时刻（决策 18）：`once` = "YYYY-MM-DDTHH:mm"，
 * 按 schedule.timezone 的墙上时间解释（缺省 = 宿主时区）。
 * 仅当 once 的日期部分 == day 时返回该时刻，其余日期返回 undefined ——
 * 实例身份 = task_id + logical_date，once 只有一个日期 ⇒ 只生成一条实例，
 * 跑完（终态）后行已存在、日期已过 ⇒ 天然「跑完自动停」，次年不再触发。
 */
export function onceScheduledAt(task, day) {
    const once = task.schedule.once;
    if (once === undefined || once.slice(0, 10) !== day)
        return undefined;
    const match = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})$/.exec(once);
    if (match === null)
        return undefined; // checkedTask 已保证格式，防御兜底
    const [, y, mo, d, h, mi] = match;
    const tz = task.schedule.timezone;
    if (tz === undefined)
        return new Date(`${once}:00`); // 无时区串 = 按宿主本地时区解释
    // 目标 = 「tz 墙上时间等于 once」的绝对时刻：wall 当 UTC 减去 tz 偏移；
    // 偏移依赖结果本身（DST 边界），迭代两次即收敛。
    const wallAsUTC = Date.UTC(Number(y), Number(mo) - 1, Number(d), Number(h), Number(mi));
    let t = new Date(wallAsUTC);
    t = new Date(wallAsUTC - tzOffsetMs(t, tz));
    t = new Date(wallAsUTC - tzOffsetMs(t, tz));
    return t;
}
/** 单个任务定义的公共校验（schema + 互斥 + 时区 + cron/once），文件目录与内嵌两路共用。 */
function checkedTask(ctx, label, data) {
    const parsed = taskDefinitionSchema.safeParse(data);
    if (!parsed.success) {
        ctx.logger.warn(`任务定义校验失败 ${label}: ${parsed.error.message}`);
        return undefined;
    }
    const def = parsed.data;
    // cron 与 once 恰有其一：周期任务用 cron，一次性任务用 once（决策 18）。
    if ((def.schedule.cron === undefined) === (def.schedule.once === undefined)) {
        ctx.logger.warn(`任务定义校验失败 ${label}: schedule.cron 与 schedule.once 必须恰有其一`);
        return undefined;
    }
    if (def.schedule.timezone !== undefined && !isValidTimeZone(def.schedule.timezone)) {
        ctx.logger.warn(`任务定义时区非法 ${label}: ${def.schedule.timezone}`);
        return undefined;
    }
    if (def.schedule.cron !== undefined) {
        try {
            CronExpressionParser.parse(def.schedule.cron, { tz: def.schedule.timezone });
        }
        catch (error) {
            ctx.logger.warn(`任务定义 cron 非法 ${label}: ${String(error)}`);
            return undefined;
        }
    }
    else if (def.schedule.once !== undefined && !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(def.schedule.once)) {
        ctx.logger.warn(`任务定义 once 格式非法 ${label}: ${def.schedule.once}（应为 YYYY-MM-DDTHH:mm）`);
        return undefined;
    }
    return def;
}
/** 解析内嵌任务表 JSON（tasksInline 配置，临时 UI）：须为数组，逐项校验，坏项告警跳过。 */
export function parseInlineTasks(ctx, raw) {
    const text = raw.trim();
    if (text.length === 0)
        return [];
    let data;
    try {
        data = JSON.parse(text);
    }
    catch (error) {
        ctx.logger.warn(`内嵌任务表 JSON 非法: ${String(error)}`);
        return [];
    }
    if (!Array.isArray(data)) {
        ctx.logger.warn('内嵌任务表必须是 JSON 数组');
        return [];
    }
    const tasks = [];
    for (const [index, item] of data.entries()) {
        const def = checkedTask(ctx, `内嵌任务表[${index}]`, item);
        if (def?.enabled)
            tasks.push(def);
    }
    return tasks;
}
/** 读任务表目录：逐文件 safeParse，坏文件告警跳过；返回 enabled 的定义。 */
export function loadTasks(ctx, tasksDir) {
    const dir = resolve(tasksDir);
    let names;
    try {
        names = readdirSync(dir).filter(name => name.endsWith('.json')).sort();
    }
    catch (error) {
        ctx.logger.warn(`任务表目录不可读 ${dir}: ${String(error)}`);
        return [];
    }
    const tasks = [];
    for (const name of names) {
        const file = `${dir}/${name}`;
        try {
            if (!statSync(file).isFile())
                continue;
            const def = checkedTask(ctx, file, JSON.parse(readFileSync(file, 'utf8')));
            if (def?.enabled)
                tasks.push(def);
        }
        catch (error) {
            ctx.logger.warn(`任务定义读取失败 ${file}: ${String(error)}`);
        }
    }
    return tasks;
}
