// 插件配置：schemastery z schema 一份两用——patch Config 导出 + ctx.settings 命名空间。
// schemastery 与宿主 vendor 同版本（宿主 vendor/schemastery package.json = 3.18.2 = npm @deepseek-ai/schemastery）。
import z from '@deepseek-ai/schemastery'

export interface PluginConfig {
  /** SQLite 状态库绝对路径；空串 = 宿主数据根 storages/dsh-task-dispatch-table/state.db（决策 14）。 */
  statePath: string
  /** tick 周期（毫秒）。 */
  tickMs: number
  /** dispatched 等待 session/created 的宽限期（毫秒）（state-machine §4）。 */
  dispatchGraceMs: number
  /** running 租约时长（毫秒）（state-machine §4，默认 30min）。 */
  leaseMs: number
  /** unknown 只观察不动作的宽限期（毫秒）（state-machine §4，默认 5min）。 */
  unknownGraceMs: number
  /** 任务定义目录（*.json）。相对路径相对宿主进程 cwd 解析。 */
  tasksDir: string
}

export const ConfigDefaults: Omit<PluginConfig, 'statePath' | 'tasksDir'> = {
  tickMs: 60_000,
  dispatchGraceMs: 60_000,
  leaseMs: 30 * 60_000,
  unknownGraceMs: 5 * 60_000,
}

export const Config = z.object({
  statePath: z.string().default(''),
  tickMs: z.number().default(ConfigDefaults.tickMs),
  dispatchGraceMs: z.number().default(ConfigDefaults.dispatchGraceMs),
  leaseMs: z.number().default(ConfigDefaults.leaseMs),
  unknownGraceMs: z.number().default(ConfigDefaults.unknownGraceMs),
  tasksDir: z.string().default('tasks'),
})
