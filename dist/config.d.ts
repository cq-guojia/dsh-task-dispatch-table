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
}
export declare const ConfigDefaults: Omit<PluginConfig, 'statePath' | 'tasksDir' | 'tasksInline'>;
export declare const Config: z<Schemastery.ObjectS<{
    statePath: z<string, string>;
    tickMs: z<number, number>;
    dispatchGraceMs: z<number, number>;
    leaseMs: z<number, number>;
    unknownGraceMs: z<number, number>;
    tasksDir: z<string, string>;
    tasksInline: z<string, string>;
}>, Schemastery.ObjectT<{
    statePath: z<string, string>;
    tickMs: z<number, number>;
    dispatchGraceMs: z<number, number>;
    leaseMs: z<number, number>;
    unknownGraceMs: z<number, number>;
    tasksDir: z<string, string>;
    tasksInline: z<string, string>;
}>>;
/**
 * 状态库路径（决策 14）：配置覆盖 > 宿主数据根 storages/dsh-task-dispatch-table/state.db。
 * 宿主数据根解析复刻 packages/util/home-paths/src/index.ts:87-100：配置路径 > $DSH_HOME > ~/.dsh。
 * 放 config.ts 而非 index.ts：scheduler/submit 也要用（避免 index 循环导入）。
 */
export declare function resolveStatePath(statePath: string): string;
