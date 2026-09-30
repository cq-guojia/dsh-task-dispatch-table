// task-sort.ts — 主界面卡片的排序（+ 派发延迟预算的唯一出处）。
//
// **为什么放 `src/` 而不是 `src/client/`**：这里既是客户端排序的**唯一实现**，又要能被冒烟
// （Node 脚本，直接引 dist 产物）**真断言**——放 client 侧只会被打进 client bundle、冒烟只能 grep 字符串。
// 与 `attachment-allowlist.ts` 同款：宿主侧 tsc 直编、客户端 alwaysBundle 内联，两边共用一份。
//
// **排序规则（用户 2026-09-30 口径）**：还要执行的排最前（按下次执行升序）→ 没有下次执行的排后 →
// 停用的（锁定）沉底；「正在跑」永远在最上。
//
// **⚠️ 历史：这里原来还有一套「到点钳位」**（客户端本地计时器：记住上一版 `nextSlotAt`，刚跨过刻度就
// 在组内钉到最前一段），用来掩盖「刻度懒前移 ⇒ 键变大 ⇒ 卡片掉下去，等 `running` 翻转又跳回来」的抖动。
// **决策 54 已把整套钳位删除**，因为那套**本地派生状态**在轮询卡住时永不解开（真机「卡片 5 分钟不动、
// 倒计时照跳」的根因）。抖动改由**服务端**根治：`runtime-index.overview` 给「刻度过期」的前移加了
// **「这一槽处理了吗」闸门** —— 未处理且仍在 `window` 内就**冻结不前移**，于是「到点还没跑」的行
// `nextSlotAt` 本身就是**过去时刻**，在本文件「按下次执行升序」里**自然排最前**，不需要任何哨兵。
// （详见 `docs/design/decisions.md` 决策 54、`docs/worklog/main-panel.md` §15。）
/** 分组：运行中 0 → 已启用 1 → 无刻度 2 → 已关闭 3。 */
export const groupOf = (row) => {
    if (row.running)
        return 0;
    if (!row.enabled)
        return 3;
    return row.nextSlotAt === null ? 2 : 1;
};
/**
 * 组 1 的组内键：**按下次执行升序**。
 * ⚠️ 决策 54：原来的「到点钳位哨兵 -1」（把刚跨过刻度的卡强插到组内最前）**已整删** ——
 * 服务端会**冻结**「已到点但还没处理」的刻度，于是这类行的 `nextSlotAt` 本身就是**过去时刻**，
 * 在这里**自然排最前**，不需要任何哨兵。
 */
export const sortKeyOf = (row) => {
    if (row.nextSlotAt === null)
        return Number.POSITIVE_INFINITY;
    return Date.parse(row.nextSlotAt);
};
/** 排序（时间轴：马上要跑的最上，关闭的沉底）。 */
export function sortRows(rows) {
    return [...rows].sort((a, b) => {
        const ga = groupOf(a);
        const gb = groupOf(b);
        if (ga !== gb)
            return ga - gb;
        if (ga === 1)
            return sortKeyOf(a) - sortKeyOf(b);
        const ta = Date.parse(a.lastScheduledAt ?? a.runningSince ?? '') || 0;
        const tb = Date.parse(b.lastScheduledAt ?? b.runningSince ?? '') || 0;
        return tb - ta;
    });
}
/**
 * **派发延迟预算**（毫秒）= 巡检间隔 + 2×轮询，夹在 30s ~ 10min。
 * 2026-09-30（决策 54）：它原本是「到点钳位」的时长；钳位已删，本函数保留为**同一口径的唯一出处** ——
 * 客户端「到点未派发」的 loading 上界（`client/task-list.tsx` 的 `dueLoadingMs`）与它同源，
 * 免得将来两处各写一个魔数悄悄漂移（执行后评审点过这一条）。
 */
export function pinMsFor(tickMs, pollMs) {
    const base = Number.isFinite(tickMs) && tickMs > 0 ? tickMs : 60_000;
    return Math.min(10 * 60_000, Math.max(30_000, base + 2 * pollMs));
}
