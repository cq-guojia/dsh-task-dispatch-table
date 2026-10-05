// schedule-next.ts — **cron / once → 下次执行时刻**的纯计算核（服务端与客户端**同一份**，2026-10-05 抽出）。
//
// **为什么单独成文件**（本仓规矩：同一个东西被写第二遍就是违规）：
// 「下次执行」此前只有服务端能算（`src/tasks.ts`，但它 import 了 node:fs / zod，进不了客户端
// bundle）⇒ 右侧栏「查看档」要基于**当前草稿**实时推算「预计下次执行」时没有可用实现，
// 只能在客户端再抄一份 cron 解析 —— 这正是要杜绝的第二实现。
// ⇒ 把 tasks.ts 里与「算时刻」有关的纯函数原样迁到这里：**零 node 内建依赖**、唯一外部依赖
// `cron-parser`（已在 dependencies，client bundle 由 tsdown 内联；chrome99 的 `Intl.formatToParts`
// + 时区数据可用，`tzOffsetMs` 的前提成立）。`src/tasks.ts` 从这里 re-export，服务端调用面零改动。
//
// ⚠️ 与 [`deps.ts`](./deps.ts) 同一条设计约束：本模块不许 import `node:*`、宿主模块或 zod；
// 类型用本文件声明的**最小结构**（服务端 `TaskDefinition` 与客户端草稿组装物都天然形状兼容）。
import { CronExpressionParser } from 'cron-parser';
/** 取某时刻在指定时区的日历日（logical date 归属用计划时刻，state-machine §9）。 */
export function logicalDateOf(date, timeZone) {
    return new Intl.DateTimeFormat('en-CA', {
        timeZone: timeZone ?? undefined,
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
    }).format(date);
}
/**
 * 认「间隔型」cron：分钟档 = `*&#47;N * * * <dow>`；小时档 = `M *&#47;N * * <dow>`。
 * 认不出返回 null（走普通 cron 路径）。
 */
function intervalSpecOf(task) {
    const cron = task.schedule.cron;
    if (cron === undefined)
        return null;
    const parts = cron.trim().split(/\s+/);
    if (parts.length !== 5)
        return null;
    const [minute, hour, dom, mon, dow] = parts;
    if (dom !== '*' || mon !== '*')
        return null;
    const mStep = /^\*\/(\d+)$/.exec(minute);
    const hStep = /^\*\/(\d+)$/.exec(hour);
    let unit;
    let step;
    if (mStep !== null && hour === '*') {
        unit = 'minute';
        step = Number(mStep[1]);
    }
    else if (hStep !== null && /^\d+$/.test(minute)) {
        unit = 'hour';
        step = Number(hStep[1]);
    }
    else
        return null;
    if (!Number.isFinite(step) || step <= 0)
        return null;
    if (dow === '*')
        return { unit, step, dows: null };
    const dows = dow.split(',').map(Number)
        .filter(n => Number.isInteger(n) && n >= 0 && n <= 7)
        .map(n => (n === 0 ? 7 : n));
    return dows.length === 0 ? null : { unit, step, dows };
}
/** 某时刻在任务时区里的 ISO 星期（周一 = 1 … 周日 = 7）。 */
function isoWeekdayOf(date, timezone) {
    const day = logicalDateOf(date, timezone);
    const wd = new Date(`${day}T00:00:00Z`).getUTCDay();
    return wd === 0 ? 7 : wd;
}
/**
 * 间隔型刻度 = **锚点（任务开始时间）+ k×步长**（用户 2026-09-30 拍板）：
 * 「18:03 起每 10 分钟」就该是 18:03 / 18:13 / 18:23…，而不是 cron `*&#47;10` 的**整点对齐**（:00/:10/…）。
 * 锚点缺失（老数据 / 手写 JSON）⇒ 返回 null，退回 cron 行为（不猜）。
 */
function anchoredIntervalSlots(task, iv, from, to, cap) {
    const startIso = task.schedule.start;
    if (startIso === undefined || startIso === '')
        return null;
    const anchor = wallClockToAbsolute(startIso, task.schedule.timezone);
    if (anchor === null)
        return null;
    const stepMs = (iv.unit === 'minute' ? iv.step : iv.step * 60) * 60_000;
    const anchorMs = anchor.getTime();
    // 直接跳到「第一个 ≥ from 的刻度」（O(1)，不做线性扫描）；锚点之前不产刻度。
    let k = Math.max(0, Math.ceil((from.getTime() - anchorMs) / stepMs));
    const out = [];
    for (let i = 0; i < cap; i++, k++) {
        const t = anchorMs + k * stepMs;
        if (t >= to.getTime())
            break;
        const slot = new Date(t);
        if (iv.dows !== null && !iv.dows.includes(isoWeekdayOf(slot, task.schedule.timezone)))
            continue;
        out.push(slot);
    }
    return out;
}
/**
 * cron 在 `[from, to)` 区间内的**全部刻度**（决策 25 的核心改动）。
 *
 * 旧实现 `scheduledAtFor` 按「天」只取第一个匹配 ⇒ **每小时 / 每几分钟的 cron 一天只能出
 * 一条**，是功能缺陷。刻度**由 cron 表达式决定**，不是「上一次 + 间隔」⇒ 迟到 / 重启 /
 * 多跑几轮都不会漂移（8:01 才跑，记的仍是 `08:00` 这个槽）。
 *
 * @param cap 迭代上限（防御 cron 表达成极小间隔导致死循环）；超出即截断。
 */
export function scheduledSlotsFor(task, from, to, cap = 20_000) {
    const cron = task.schedule.cron;
    if (cron === undefined)
        return []; // once 任务不走 cron（互斥校验保证恰有其一）
    // 间隔型：按「锚点 + k×步长」生成（见 anchoredIntervalSlots）。锚点缺失才退回下面的 cron 对齐。
    const iv = intervalSpecOf(task);
    if (iv !== null) {
        const anchored = anchoredIntervalSlots(task, iv, from, to, cap);
        if (anchored !== null)
            return filterSlotsBySchedule(task, anchored);
    }
    const interval = CronExpressionParser.parse(cron, {
        // -1ms：保证恰好落在 from 上的刻度不会被漏掉（cron-parser 的 next() 是严格大于）。
        currentDate: new Date(from.getTime() - 1),
        tz: task.schedule.timezone,
    });
    const raw = [];
    for (let i = 0; i < cap; i++) {
        const next = interval.next().toDate();
        if (next.getTime() >= to.getTime())
            break;
        if (next.getTime() >= from.getTime())
            raw.push(next);
    }
    return filterSlotsBySchedule(task, raw);
}
/**
 * 周期任务的锚点 / 步长过滤（「开始时间」+「每 N 周」）：
 * - `start`：首跑下界（不早于此时）；也是「每 N 周」取模的参考周（start 所在周 = 第 0 周）。
 * - `everyNWeeks`：每周档的重复步长。cron 没有「第几周」位 ⇒ 用「刻度与 start 的整周差 % N」
 *   过滤，天然覆盖用户诉求：开始时间设下周一、每 2 周 ⇒ 下周一跑、下下周跳过、再下一周跑。
 */
export function filterSlotsBySchedule(task, slots) {
    const startIso = task.schedule.start;
    const startAbs = startIso === undefined ? undefined : wallClockToAbsolute(startIso, task.schedule.timezone);
    const start = startAbs === null ? undefined : startAbs;
    const nWeeks = task.schedule.everyNWeeks;
    if (start === undefined && (nWeeks === undefined || nWeeks === null || nWeeks <= 1))
        return slots;
    const ref = start ?? slots[0];
    if (ref === undefined)
        return slots;
    const WEEK = 7 * 24 * 3600 * 1000;
    return slots.filter(slot => {
        if (start !== undefined && slot.getTime() < start.getTime())
            return false;
        if (nWeeks !== undefined && nWeeks !== null && nWeeks > 1) {
            const weeks = Math.floor((slot.getTime() - ref.getTime()) / WEEK);
            if (((weeks % nWeeks) + nWeeks) % nWeeks !== 0)
                return false;
        }
        return true;
    });
}
/** "YYYY-MM-DDTHH:mm" 按某时区墙上时间 → 绝对时刻（与 once 同款解释；缺省 = 宿主本地时区）。 */
function wallClockToAbsolute(iso, tz) {
    const match = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})$/.exec(iso);
    if (match === null)
        return null;
    const [, y, mo, d, h, mi] = match;
    const wallAsUTC = Date.UTC(Number(y), Number(mo) - 1, Number(d), Number(h), Number(mi));
    if (tz === undefined)
        return new Date(`${iso}:00`);
    let t = new Date(wallAsUTC);
    t = new Date(wallAsUTC - tzOffsetMs(t, tz));
    t = new Date(wallAsUTC - tzOffsetMs(t, tz));
    return t;
}
/** 给定时刻之后的下一个刻度（面板展示「下次执行」用）。 */
export function nextSlotAfter(task, from) {
    if (task.schedule.once !== undefined)
        return onceScheduledAt(task, task.schedule.once.slice(0, 10));
    const slots = scheduledSlotsFor(task, from, new Date(from.getTime() + 366 * 24 * 3600_000), 2_000);
    return slots[0];
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
