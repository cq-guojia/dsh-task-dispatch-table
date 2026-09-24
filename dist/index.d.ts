import type { HostContext } from './host.js';
import { Config, resolveStatePath } from './config.js';
import type { PluginConfig } from './config.js';
export declare const name = "dsh-task-dispatch-table";
/** 宿主服务依赖：以源码实际服务名为准（决策 15 / PROGRESS「已核实的 DSH 能力」）。
 * ⚠️ settings 不在此列：settings 服务以「带 register 面」或「惰性形态」两种组合入场，
 * 缺失 register 时硬性依赖会令 entry 卡死/崩；改由 apply 内 ctx.inject(['settings'], ...)
 * 订阅并在 register 就绪才激活（参照 dsh-context installSettings，决策 17 真机教训）。 */
export declare const inject: readonly ["timer", "agents", "sessions", "workspaceRegistry", "sessionTitle"];
export { Config, resolveStatePath };
export type { PluginConfig };
export declare function apply(ctx: HostContext, config: unknown): void;
