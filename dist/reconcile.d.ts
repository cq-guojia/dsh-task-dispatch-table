import type { HostContext, HostLogger, HostSession } from './host.js';
import type { TaskDefinition } from './tasks.js';
import type { AgentHandle } from './dispatch.js';
import type { InstanceSnapshot, TaskInstance, TaskStore } from './store.js';
import type { RuntimeIndex } from './runtime-index.js';
import type { PluginConfig } from './config.js';
import { type AssetPaths } from './task-assets.js';
/**
 * 快照里的附加文件是否还在（Loop B 发动前兜底）：返回**缺失**的展示名。
 * upload 型按任务目录绝对路径（需 task_id），link 型按快照里冻结的工作区路径。
 * 拿不到基准 ⇒ 跳过不判，绝不猜。
 */
export declare function missingSnapshotAttachments(ctx: HostContext, taskId: string, snap: InstanceSnapshot, assets: AssetPaths | null): string[];
export interface ReconcileOptions {
    leaseMs: number;
    dispatchGraceMs: number;
    unknownGraceMs: number;
    /** 插件配置（决策 41：模型漏斗②③④层在发动时现算用；属插件级参数，非任务设置）。 */
    config(): PluginConfig;
    /**
     * 旧实例无快照时的一次性兼容（决策 41）：按任务定义当场合成快照并固化进实例行；
     * 返回 undefined = 无法兜底（任务已删 / 工作区没了）⇒ 该实例如实按失败收敛。
     */
    legacyTask?(taskId: string): TaskDefinition | undefined;
    /**
     * 任务文件资产根（2026-09-30）：发动前再次校验附加文件还在不在（Loop A 已查过一次，
     * 这里是落库后到发动之间的兜底）。未就绪 ⇒ 跳过 upload 型校验，不误拦。
     */
    assets?(): AssetPaths | null;
}
export interface Reconciler {
    /** 发动成功后登记 agent handle（决策 19：超时追问用），终态/重试时自动遗忘。 */
    registerHandle(sessionId: string, handle: AgentHandle): void;
    onCreated(session: HostSession): void;
    onEvent(session: HostSession, event: {
        type: string;
    }): void;
    onDisposed(session: HostSession): void;
    /** 发动异常等场景的重试判定入口（§6）。 */
    retryOrFail(instance: TaskInstance, reason: string, detail?: unknown): void;
    sweep(): void;
}
export interface ReconcilerDeps {
    ctx: HostContext;
    /** tee logger（显式传参——ctx 不可包装，见 host.ts HostLogger 注释）。 */
    logger: HostLogger;
    store: TaskStore;
    options: ReconcileOptions;
    /** 主界面运行态内存索引（2026-09-30）；未装配则跳过（不影响对账）。 */
    runtime?: RuntimeIndex;
}
/**
 * 回执裁决（决策 19，替代旧契约文件三查）：
 * receipt 事件存在 + status ∈ validStatuses + outputs 里的每个路径**确实存在**。
 *
 * ⚠️ **已去掉「mtime 新鲜度」闸**（用户 2026-10-03 拍板，原为「防旧产物冒充」）：
 * 那道闸会误伤「复用 / 检查已有文件」类任务 —— 真机案例：任务是判断 `uuid.txt`
 * 是否存在（存在就不动它），agent 如实回执 `outputs:["uuid.txt"]`，但文件本来就在、
 * 没被改写 ⇒ mtime 早于派发时刻 ⇒ 被判 `output-stale` 失败，用户看到的却是「文件明明在」。
 *
 * 用户口径（原话）：「**只要他交出来的文件确实存在、格式是对的，就不用管**」；
 * 「大模型是不是企图蒙混过关，你不用去管」——**任务做得怎么样是大模型的事，
 * 插件只确认它确实执行了**。故只保留「存在性」一道闸，不再替模型判断产出新鲜度。
 *
 * status 仍必须如实 ∈ validStatuses（agent 自报不可信，决策 11）。
 * 决策 41：workspacePath / validStatuses 来自派发快照，与任务设置无关。
 */
export declare function checkReceipt(workspacePath: string, validStatuses: readonly string[], receipt: {
    ts: string;
    detail: string | null;
} | undefined): {
    ok: boolean;
    reason?: string;
    detail?: unknown;
};
/** token 用量分量（决策 32 修订：不再记单一总数，按输入/输出/缓存拆分）。 */
export interface TokenUsage {
    /** 输入（prompt）token。 */
    in?: number;
    /** 输出（completion）token。 */
    out?: number;
    /** 命中上下文缓存的输入 token。 */
    cache?: number;
}
/**
 * 从会话事件里取 token 用量分量（决策 32 修订）。
 *
 * **权威来源已核实**（宿主 `@deepseek-ai/dsh-session` `lib/types/types.d.ts`）：官方用量挂在
 * `assistant/message` 事件的 `usage?: TokenUsage` 上（`@deepseek-ai/dsh-llm` `lib/types/types.d.ts:160`），
 * 一次模型调用一条。**不需要我们自己推**——事件里带的就是官方算好的。
 *
 * ⚠️ 官方 `TokenUsage` 的计数是**互斥的**（原文：*Counts are DISJOINT*）：
 *   - `inputTokens` = **未缓存**输入（不含缓存）；
 *   - 缓存单列 `cacheReadTokens` / `cacheWriteTokens`；
 *   - **计费输入 = inputTokens + cacheReadTokens + cacheWriteTokens**；
 *   - `totalTokens` = 这一次调用的完整总量（prompt + output）。
 * ⇒ 只取 `inputTokens` 会**漏掉缓存**（大头）⇒ 面板数远小于会话。这就是之前对不上的根因。
 *
 * 取不到（事件不带 usage）返回 undefined（三列留 null，不阻塞链路）。
 */
export declare function extractTokenUsage(event: unknown): TokenUsage | undefined;
export declare function createReconciler({ ctx, logger, store, options, runtime }: ReconcilerDeps): Reconciler;
