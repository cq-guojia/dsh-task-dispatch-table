import { type AssetPaths } from './task-assets.js';
import type { HostContext, HostLogger } from './host.js';
import { type TaskDefinition } from './tasks.js';
import type { ResolvedDependency, TaskStore } from './store.js';
import type { Reconciler } from './reconcile.js';
import type { RuntimeIndex } from './runtime-index.js';
import type { PluginConfig } from './config.js';
/**
 * 「立即执行」（手动触发一次调度，2026-10-03 用户拍板）结果。
 * `ok: false` 时：`error` = 机器码（前端翻人话），`detail` = 可选参数（工作区名 / 附件名等）。
 * 语义与正常调度**完全一致**——前置未达标 / 工作区缺失 / 附件缺失都**不建执行记录**，
 * 只是额外把原因回给前端（用户手动触发看不到后台日志）。
 */
export type RunNowResult = {
    ok: true;
    instanceId: string;
} | {
    ok: false;
    error: string;
    detail?: string;
};
export interface Scheduler {
    tick: () => void;
    getTasks: () => Map<string, TaskDefinition>;
    /**
     * 立即执行（2026-10-03）：按 id 取定义（**绕过 enabled**——用户拍板「不看开关」）、
     * 逐项复用 Loop A 的预条件判定（串行互斥 → 前置 → 工作区 → 附件），全通过则写一条
     * `dispatched` + `run_type='manual'` 的执行记录，等下一轮 Loop B 发动（＝提前触发一次）。
     */
    runNow: (taskId: string) => RunNowResult;
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
 * **一次性任务的「过期未执行」记录**（用户 2026-09-30 拍板 A 的配套）。
 *
 * 一次性任务加了窗口闸门（`dueSlot`）之后「出窗口就再也不跑」；若那一槽从来没跑过（典型：那一刻它
 * 被上游堵着 / 附件缺失，一直拖到窗口过完），它会**无声无息地消失** —— 面板显示「没有下次了」、
 * 执行记录里一条都没有。这里补一条终态 `skipped`（`attempt=0` ⇒ 天然不重试），把「该跑没跑、而且
 * 再也不会跑」**留在用户看得见的地方**：卡片标红 + 执行记录一条 + 原因挂在该行事件上。
 *
 * 门禁与「补记前一个槽」**完全一致**（`gateMs` = 本进程启动 / 任务创建 的较晚者）：**停机期间**跨过
 * 那一刻的不补（用户口径：服务没跑的那段时间不用管），否则用户新建一个「上一刻已过期」的一次性任务
 * 会被凭空标红。返回「本槽是否按过期处理」（调用方据此决定要不要清掉悬浮原因）。
 */
export declare function recordExpiredOnce(store: TaskStore, runtime: RuntimeIndex | null, task: TaskDefinition, nowMs: number, gateMs: number): boolean;
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
    /** 主界面运行态内存索引（2026-09-30）；未装配则跳过（不影响调度）。 */
    runtime?: RuntimeIndex;
}): Scheduler;
