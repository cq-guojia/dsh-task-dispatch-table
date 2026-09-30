// task-sort.ts — 主界面卡片的排序 + 「到点钳位」（2026-09-30，用户拍板）。
//
// **为什么放 `src/` 而不是 `src/client/`**：这里既是客户端排序的**唯一实现**，又要能被冒烟
// （Node 脚本，直接引 dist 产物）**真断言**——放 client 侧只会被打进 client bundle、冒烟只能 grep 字符串。
// 与 `attachment-allowlist.ts` 同款：宿主侧 tsc 直编、客户端 alwaysBundle 内联，两边共用一份。
//
// **背景（排序抖动的机制，三方复核一致）**：`nextSlotAt` 是服务端**懒更新**的——每次轮询被问到、
// 发现刻度已过期，才前移到下一槽；而 `running` 要等调度器**下一轮巡检**（`tickMs`，默认 60s）
// 真的把任务落库（Loop A `markDispatched`）才翻 true。于是中间必有一段缝：
// 「时间已经变成未来、但还没标运行」⇒ 卡片在「已启用」组里键变大、**掉到后面**；等 `running`
// 翻转 ⇒ 又**跳回最前**。用户看到的就是「先往后挪、再砰地跳回」。
//
// **本办法（客户端到点钳位）**：记住每条任务**上一版的 `nextSlotAt`**；当它「上一版已过去、
// 这一版在未来」= 刚跨过自己的刻度 ⇒ 在**「已启用」组内部钉到最前**一段（时长跟着巡检间隔走）。
// 期间：`running` 翻转 ⇒ 解除（正常上浮到运行中组）；超时 ⇒ 解除（回到按下次执行正常排队）。
//
// **三条红线**（用户 2026-09-30 确认）：① 不新增状态 / 文案（卡片外观零变化）；
// ② 不改「下次执行」时间显示（时间仍准确）；③ **不提进「运行中」组**（真正在跑的卡不会被顶下去）。
// 到点却永远不会被派发的任务（上游停用 / 附件缺失 / 被串行互斥挡住）因此只停在「已到点、还没跑」
// 的位置，**不会**装成「在跑」——这是刻意不做的部分（§8.6 的教训：不判断补跑、不假装运行）。
/** 分组：运行中 0 → 已启用 1 → 无刻度 2 → 已关闭 3。 */
export const groupOf = (row) => {
    if (row.running)
        return 0;
    if (!row.enabled)
        return 3;
    return row.nextSlotAt === null ? 2 : 1;
};
/** 组 1 的组内键：被钳位的排最前（哨兵 -1），其余按下次执行升序。 */
export const sortKeyOf = (row, pinned) => {
    if (row.nextSlotAt === null)
        return Number.POSITIVE_INFINITY;
    return pinned ? -1 : Date.parse(row.nextSlotAt);
};
/**
 * 排序（时间轴：马上要跑的最上，关闭的沉底）。
 * @param pinnedIds 处于「到点钳位」的任务（判定见 `justCrossedSlot`，时长见 `pinMsFor`）。
 */
export function sortRows(rows, pinnedIds = new Set()) {
    return [...rows].sort((a, b) => {
        const ga = groupOf(a);
        const gb = groupOf(b);
        if (ga !== gb)
            return ga - gb;
        if (ga === 1)
            return sortKeyOf(a, pinnedIds.has(a.id)) - sortKeyOf(b, pinnedIds.has(b.id));
        const ta = Date.parse(a.lastScheduledAt ?? a.runningSince ?? '') || 0;
        const tb = Date.parse(b.lastScheduledAt ?? b.runningSince ?? '') || 0;
        return tb - ta;
    });
}
/**
 * 「刚跨过自己的刻度」判定：上一版的 `nextSlotAt` **已过去**（不大于服务端当前时间），
 * 而这一版在未来。以**服务端时间**为准（客户端时钟可能与宿主有时差）。
 */
export function justCrossedSlot(prevNext, nextNext, serverNowMs, 
/**
 * 旧刻度允许「已经过去多久」仍算刚跨过（缺省不限）。传 `2 × pinMs` 可挡掉把**很久以前**的刻度
 * 误判成「刚跨过」——典型：`once` 任务的过期槽（`nextSlotAfter` 对它恒返回那个过去时刻），
 * 用户随后把它改成 cron ⇒ 新刻度在未来、旧刻度在很久以前 ⇒ 白钉一次。
 */
maxAgeMs = Number.POSITIVE_INFINITY) {
    if (prevNext === null || nextNext === null)
        return false;
    const p = Date.parse(prevNext);
    const n = Date.parse(nextNext);
    if (!Number.isFinite(p) || !Number.isFinite(n))
        return false;
    if (!(p <= serverNowMs && n > serverNowMs))
        return false;
    return serverNowMs - p <= maxAgeMs;
}
/** 钳位时长：**跟着巡检间隔走**（默认 `tickMs` 60s ⇒ 约 80s），带上下限兜底（30s ~ 10min）。 */
export function pinMsFor(tickMs, pollMs) {
    const base = Number.isFinite(tickMs) && tickMs > 0 ? tickMs : 60_000;
    return Math.min(10 * 60_000, Math.max(30_000, base + 2 * pollMs));
}
