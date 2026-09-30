import type { InstanceStatus, TaskStore } from './store.js';
import { type TaskDefinition } from './tasks.js';
/** 一条任务的运行态（派生）。 */
export interface TaskRuntimeEntry {
    taskId: string;
    running: boolean;
    /** 本次运行开始（该实例的计划时刻）。 */
    runningSince: string | null;
    lastStatus: InstanceStatus | null;
    lastScheduledAt: string | null;
    lastFinishedAt: string | null;
    nextSlotAt: string | null;
    /**
     * 「这一槽被什么挡住了」的人话原因（决策 54，P3b）：由 Loop A 判定阻塞时顺手写入
     * （`markBlocked`），只为展示；放行时清空。不进 `overviewKeyOf`（运行态，靠显式 rev 边沿）。
     */
    blockedReason?: string | null;
    /** 展示指纹（`overviewKeyOf`）：变了 ⇒ rev 自增 ⇒ 客户端必拿到新数据。 */
    overviewKey?: string;
    /** 排期指纹（`scheduleKeyOf`）：变了才重算 nextSlotAt。 */
    scheduleKey?: string;
}
/** 主界面一行（定义投影 + 运行态），客户端拿它直接渲染卡片（含展开区）。 */
export interface TaskOverviewRow {
    id: string;
    title: string;
    code: string | null;
    enabled: boolean;
    workspace: string;
    createdAt: string | null;
    model: string | null;
    retryMax: number;
    /** 排期原值（卡片「执行方式」人话由客户端按它生成，服务端不做 i18n）。 */
    schedule: {
        cron: string | null;
        once: string | null;
        timezone: string | null;
        start: string | null;
        everyNWeeks: number | null;
        window: string;
        /**
         * 结构化排期（新建 / 编辑时双写的 `schedule.ui`，2026-09-30 用户拍板）：
         * 卡片的「执行方式」人话与编辑器「预计执行」**同源**（都走 `client/schedule-text.ts`），
         * 不再各处各写一份 ⇒ 老任务为 null，客户端退回从 cron 反解。
         */
        ui: Record<string, unknown> | null;
    };
    /** 提示词首段（展开区展示用，服务端截断，不传全文）。 */
    promptHead: string;
    attachments: Array<{
        name: string;
        kind: 'link' | 'upload';
    }>;
    depends: Array<{
        id: string;
        title: string;
        enabled: boolean;
    }>;
    running: boolean;
    runningSince: string | null;
    lastStatus: InstanceStatus | null;
    lastScheduledAt: string | null;
    lastFinishedAt: string | null;
    nextSlotAt: string | null;
    /** 「这一槽被什么挡住了」的人话原因（决策 54 · P3b）：客户端在「延期」悬浮说明里补全。 */
    blockedReason?: string | null;
}
export interface RuntimeIndex {
    /** 启动 / 定义整批变更后重建（一条聚合 SQL + 逐任务算下一刻度）；`nowMs` 供确定性测试。 */
    rebuild(tasks: readonly TaskDefinition[], store: TaskStore | null, nowMs?: number): void;
    /** Loop A 落库 dispatched（scheduler.ts）。 */
    markDispatched(taskId: string, scheduledAt: string): void;
    /** Loop B 实例进终态（reconcile.ts）。 */
    markTerminal(taskId: string, status: InstanceStatus, scheduledAt: string, finishedAt: string): void;
    /** 记录 / 清除「这一槽被什么挡住」（决策 54 · P3b：延期悬浮说明用；只展示，不参与调度）。 */
    markBlocked(taskId: string, reason: string | null): void;
    /** 实例行被删（窗口外 pending / 附件缺失）⇒ 该任务不再算在飞。 */
    clearRunning(taskId: string): void;
    /**
     * **定义被改动的统一入口**（2026-09-30 抽象统一）：任何写路径改完任务定义后调它一次即可——
     * 重算展示指纹与下一刻度、按需 bump rev。调用方**不需要**再各自去碰内存条目。
     */
    markDefinitionsChanged(tasks: readonly TaskDefinition[]): void;
    /** 组装主界面数据（就地重算过期刻度，剔除已删任务的残留）。 */
    overview(tasks: readonly TaskDefinition[], nowMs: number): {
        rev: number;
        rows: TaskOverviewRow[];
    };
    /** 内容版本：客户端带上一次的值做比对，未变即回 unchanged，省掉整份传输。 */
    revision(): number;
}
export declare function createRuntimeIndex(): RuntimeIndex;
