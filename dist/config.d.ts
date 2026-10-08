import z from '@deepseek-ai/schemastery';
export interface PluginConfig {
    /** SQLite 状态库绝对路径；空串 = 宿主数据根 storages/dsh-task-dispatch-table/state.db（决策 14）。 */
    statePath: string;
    /** tick 周期（毫秒）。 */
    tickMs: number;
    /** dispatched 等待 session/created 的宽限期（毫秒）（state-machine §4）。 */
    dispatchGraceMs: number;
    /** running 租约时长（毫秒）（state-machine §4，默认 30min）。 */
    leaseMs: number;
    /** unknown 只观察不动作的宽限期（毫秒）（state-machine §4，默认 5min）。 */
    unknownGraceMs: number;
    /** 任务定义目录（*.json）。相对路径相对宿主进程 cwd 解析。 */
    tasksDir: string;
    /** 内嵌任务表 JSON 数组（临时 UI，决策 16 v1 补充）：非空时优先于 tasksDir。 */
    tasksInline: string;
    /** 调试快照 JSON（临时调试通道，决策 16 例外）：宿主写入、配置页只读展示，非用户设置。 */
    debugSnapshot: string;
    /** 插件级默认 provider（决策 22 漏斗第②层）：与 defaultModel 成对；留空则漏到宿主默认。 */
    defaultProvider: string;
    /** 插件级默认 model（决策 22 漏斗第②层）：与 defaultProvider 成对；留空则漏到宿主默认。 */
    defaultModel: string;
    /** task_log 保留期（天）：到期行由 tick 内 purgeLog 清除（决策 32）。 */
    logRetentionDays: number;
    /**
     * 执行记录（task_instances + task_events）保留期（天）：**0 = 不清**（默认）。
     * 容量不是约束（100 实例/天两年 ≈ 0.5GB），历史可查才是刚需 ⇒ 见 data-model §6.1。
     */
    historyRetentionDays: number;
    /** 上传临时区保留期（天）：到期文件由 tick 内清道夫删除（默认 7）。 */
    attachmentTmpRetentionDays: number;
}
/**
 * **系统默认值**（全量，含字符串路径类）—— `Config` schema 与设置页「用户没设时显示什么」的唯一真源。
 *
 * 2026-10-08：此前只有 `ConfigDefaults`（7 个计时/保留期字段），字符串字段的默认值只写在 schema 里
 * （`statePath:''` / `tasksDir:'tasks'` / 两个默认模型 `''`）⇒ 设置页要显示「系统默认值」时拿不到，
 * 只能在前端另抄一份（必然分叉）。故合并成一份全量对象，schema 的 `.default()` 全部引用它。
 */
export declare const CONFIG_DEFAULTS: PluginConfig;
export declare const Config: z<Schemastery.ObjectS<NoInfer<{
    statePath: z<string, string, "defined">;
    tickMs: z<number, number, "defined">;
    dispatchGraceMs: z<number, number, "defined">;
    leaseMs: z<number, number, "defined">;
    unknownGraceMs: z<number, number, "defined">;
    tasksDir: z<string, string, "defined">;
    tasksInline: z<string, string, "defined">;
    debugSnapshot: z<string, string, "defined">;
    defaultProvider: z<string, string, "defined">;
    defaultModel: z<string, string, "defined">;
    logRetentionDays: z<number, number, "defined">;
    historyRetentionDays: z<number, number, "defined">;
    attachmentTmpRetentionDays: z<number, number, "defined">;
}>>, Schemastery.ObjectT<NoInfer<{
    statePath: z<string, string, "defined">;
    tickMs: z<number, number, "defined">;
    dispatchGraceMs: z<number, number, "defined">;
    leaseMs: z<number, number, "defined">;
    unknownGraceMs: z<number, number, "defined">;
    tasksDir: z<string, string, "defined">;
    tasksInline: z<string, string, "defined">;
    debugSnapshot: z<string, string, "defined">;
    defaultProvider: z<string, string, "defined">;
    defaultModel: z<string, string, "defined">;
    logRetentionDays: z<number, number, "defined">;
    historyRetentionDays: z<number, number, "defined">;
    attachmentTmpRetentionDays: z<number, number, "defined">;
}>>, "plain">;
/**
 * rc.1 volatile 字段的解析结果是**带 get() 的引用**（非纯值）；读取时解包（与参考插件
 * dsh-task-board 的 readConfigField 同款）。非 volatile 字段原样返回；undefined/null 回落 fallback。
 * @param field - 配置字段（可能是 Volatile 引用或纯值）。
 * @param fallback - 字段缺失时的回落值。
 */
export declare function readConfigField<T>(field: unknown, fallback: T): T;
/**
 * 状态库路径（决策 14）：配置覆盖 > 宿主数据根 storages/dsh-task-dispatch-table/state.db。
 * 宿主数据根解析复刻 packages/util/home-paths/src/index.ts:87-100：配置路径 > $DSH_HOME > ~/.dsh。
 * 放 config.ts 而非 index.ts：scheduler/submit 也要用（避免 index 循环导入）。
 */
export declare function resolveStatePath(statePath: string): string;
