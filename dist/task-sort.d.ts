/** 排序只需要这几个字段（`TaskOverviewRow` 结构兼容）。 */
export interface SortableRow {
    id: string;
    enabled: boolean;
    running: boolean;
    nextSlotAt: string | null;
    lastScheduledAt: string | null;
    runningSince: string | null;
}
/** 分组：运行中 0 → 已启用 1 → 无刻度 2 → 已关闭 3。 */
export declare const groupOf: (row: SortableRow) => number;
/**
 * 组 1 的组内键：**按下次执行升序**。
 * ⚠️ 决策 54：原来的「到点钳位哨兵 -1」（把刚跨过刻度的卡强插到组内最前）**已整删** ——
 * 服务端会**冻结**「已到点但还没处理」的刻度，于是这类行的 `nextSlotAt` 本身就是**过去时刻**，
 * 在这里**自然排最前**，不需要任何哨兵。
 */
export declare const sortKeyOf: (row: SortableRow) => number;
/** 排序（时间轴：马上要跑的最上，关闭的沉底）。 */
export declare function sortRows<T extends SortableRow>(rows: readonly T[]): T[];
/**
 * **派发延迟预算**（毫秒）= 巡检间隔 + 2×轮询，夹在 30s ~ 10min。
 * 2026-09-30（决策 54）：它原本是「到点钳位」的时长；钳位已删，本函数保留为**同一口径的唯一出处** ——
 * 客户端「到点未派发」的 loading 上界（`client/task-list.tsx` 的 `dueLoadingMs`）与它同源，
 * 免得将来两处各写一个魔数悄悄漂移（执行后评审点过这一条）。
 */
export declare function pinMsFor(tickMs: number, pollMs: number): number;
