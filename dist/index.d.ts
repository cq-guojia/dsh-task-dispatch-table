import type { HostContext } from './host.js';
import { Config, resolveStatePath } from './config.js';
import type { PluginConfig } from './config.js';
export declare const name = "dsh-task-dispatch-table";
/** 宿主服务依赖：以源码实际服务名为准（决策 15 / PROGRESS「已核实的 DSH 能力」）。 */
export declare const inject: readonly ["timer", "agents", "sessions", "workspaceRegistry", "settings", "sessionTitle"];
export { Config, resolveStatePath };
export type { PluginConfig };
export declare function apply(ctx: HostContext, config: unknown): void;
