import type { HostContext } from './host.js';
import { Config } from './config.js';
import type { PluginConfig } from './config.js';
export declare const name = "dsh-task-dispatch-table";
/** 宿主服务依赖：以源码实际服务名为准（决策 15 / PROGRESS「已核实的 DSH 能力」）。 */
export declare const inject: readonly ["timer", "agents", "sessions", "workspaceRegistry", "settings", "sessionTitle"];
export { Config };
export type { PluginConfig };
/**
 * 状态库路径（决策 14）：配置覆盖 > 宿主数据根 storages/dsh-task-dispatch-table/state.db。
 * 宿主数据根解析复刻 packages/util/home-paths/src/index.ts:87-100：配置路径 > $DSH_HOME > ~/.dsh。
 */
export declare function resolveStatePath(statePath: string): string;
export declare function apply(ctx: HostContext, config: unknown): void;
