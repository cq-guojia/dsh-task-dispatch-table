import { type AssetPaths } from './task-assets.js';
import type { HostContext, HostLogger } from './host.js';
import { type TaskDefinition } from './tasks.js';
import type { ResolvedDependency, TaskStore } from './store.js';
import type { Reconciler } from './reconcile.js';
import type { PluginConfig } from './config.js';
export interface Scheduler {
    tick: () => void;
    getTasks: () => Map<string, TaskDefinition>;
    /** 启动诊断（决策 31）：报告自上次起到现在的「错过刻度」计数（不补跑、只记日志）。 */
    startupDiagnostics: () => void;
}
export type Judgement = 'ready' | 'blocked';
/** 依赖判定结果（决策 33）：`staleNotes` = 复用旧产出的告警，只提示不拦；
 *  `resolved` = 放行时固化的上游实例解析（决策 43），阻塞为空数组。 */
export interface DependencyVerdict {
    ready: boolean;
    staleNotes: string[];
    resolved: ResolvedDependency[];
    /** 阻塞原因（2026-09-30）：放行时无；用于把日志分成 dep_blocked / dep_disabled / dep_missing。 */
    reason?: 'upstream-not-succeeded' | 'upstream-disabled' | 'upstream-missing';
}
export declare function judgeDependencies(store: TaskStore, task: TaskDefinition, logicalDate: string, scheduledAt: string, 
/**
 * 上游任务定义表（可选）：给了就能区分「上游还没成功 / 上游停用 / 上游已删除」三种阻塞，
 * 日志里不再混成一句 dep_blocked（2026-09-30 评审 P4）。
 */
upstreams?: ReadonlyMap<string, TaskDefinition>): DependencyVerdict;
/**
 * 附加文件存在性校验（2026-09-30）：返回**缺失**的展示名。
 * upload 型按任务目录绝对路径；link 型按**附件来源工作区**（item.workspace）解析——
 * 附件可以选自任意工作区，拿任务目标工作区的 path 去判会误报（评审 P1#8）。
 * 拿不到基准（资产根未就绪 / 来源工作区不存在）⇒ 跳过不判，**绝不猜**。
 */
export declare function missingAttachments(ctx: HostContext, task: TaskDefinition, workspacePath: string, assets: AssetPaths | null): string[];
export declare function createScheduler(opts: {
    ctx: HostContext;
    logger: HostLogger;
    store: TaskStore;
    reconciler: Reconciler;
    config: () => PluginConfig;
    /** 任务文件资产根（附加文件存在性校验用）；未就绪传 null ⇒ 跳过 upload 型校验。 */
    assets?: () => AssetPaths | null;
}): Scheduler;
