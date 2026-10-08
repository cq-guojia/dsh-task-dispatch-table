import type { HostContext } from './host.js';
import { Config, resolveStatePath } from './config.js';
import type { PluginConfig } from './config.js';
export declare const name = "dsh-task-dispatch-table";
/** 宿主服务依赖：以源码实际服务名为准（决策 15 / PROGRESS「已核实的 DSH 能力」）。
 * ⚠️ settings 不在此列：settings 服务以「带 register 面」或「惰性形态」两种组合入场，
 * 缺失 register 时硬性依赖会令 entry 卡死/崩；改由 apply 内 ctx.inject(['settings'], ...)
 * 订阅并在 register 就绪才激活（参照 dsh-context installSettings，决策 17 真机教训）。 */
export declare const inject: readonly ["timer", "agents", "sessions", "workspaceRegistry", "sessionTitle", "sessionProjections"];
export { Config, resolveStatePath };
export type { PluginConfig };
/**
 * 设置页 GET/POST 的统一响应体：**当前生效值** + **系统默认值**（都只投影可编辑白名单）。
 *
 * - `config` = 生效值（用户层已合并；用户没设的字段就是系统默认值 ⇒ 前端直接显示即可）。
 * - `defaults` = `CONFIG_DEFAULTS` 的白名单子集。⚠️ **必须投影**：`CONFIG_DEFAULTS` 还含
 *   `tasksInline`（整份任务表 JSON）与 `debugSnapshot`（宿主调试数据），不能整份吐给浏览器。
 */
export declare function configView(config: PluginConfig): {
    config: Record<string, string | number>;
    defaults: Record<string, string | number>;
};
/** 附件约束（白名单/上限/扩展名解析）与浏览器端预检**共用同一份**，防两处漂移。 */
export { ATTACHMENT_MAX_BYTES, ALLOWED_ATTACHMENT_EXT, extOf } from './attachment-allowlist.js';
export declare function apply(ctx: HostContext, config: unknown): void;
