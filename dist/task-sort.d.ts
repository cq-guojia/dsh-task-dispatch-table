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
/** 组 1 的组内键：被钳位的排最前（哨兵 -1），其余按下次执行升序。 */
export declare const sortKeyOf: (row: SortableRow, pinned: boolean) => number;
/**
 * 排序（时间轴：马上要跑的最上，关闭的沉底）。
 * @param pinnedIds 处于「到点钳位」的任务（判定见 `justCrossedSlot`，时长见 `pinMsFor`）。
 */
export declare function sortRows<T extends SortableRow>(rows: readonly T[], pinnedIds?: ReadonlySet<string>): T[];
/**
 * 「刚跨过自己的刻度」判定：上一版的 `nextSlotAt` **已过去**（不大于服务端当前时间），
 * 而这一版在未来。以**服务端时间**为准（客户端时钟可能与宿主有时差）。
 */
export declare function justCrossedSlot(prevNext: string | null, nextNext: string | null, serverNowMs: number): boolean;
/** 钳位时长：**跟着巡检间隔走**（默认 `tickMs` 60s ⇒ 约 80s），带上下限兜底（30s ~ 10min）。 */
export declare function pinMsFor(tickMs: number, pollMs: number): number;
