// 插件配置：schemastery z schema 一份两用——patch Config 导出 + ctx.settings 命名空间。
// ⚠️ 升到 @deepseek-ai/schemastery ^3.18.4：rc.1 设置系统（SettingsForms）要求运行时可写字段
// 标 .volatile()（3.18.2 无此方法）；该版本与 dsh 0.1.7-rc.1 线一致（参考插件即依赖 ^3.18.4）。
import { homedir } from 'node:os'
import { join, resolve } from 'node:path'
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
  /** 内嵌任务表 JSON 数组（临时 UI，决策 16 v1 补充）：非空时优先于 tasksDir。 */
  tasksInline: string
  /** 调试快照 JSON（临时调试通道，决策 16 例外）：宿主写入、配置页只读展示，非用户设置。 */
  debugSnapshot: string
  /** 插件级默认 provider（决策 22 漏斗第②层）：与 defaultModel 成对；留空则漏到宿主默认。 */
  defaultProvider: string
  /** 插件级默认 model（决策 22 漏斗第②层）：与 defaultProvider 成对；留空则漏到宿主默认。 */
  defaultModel: string
  /** task_log 保留期（天）：到期行由 tick 内 purgeLog 清除（决策 32）。 */
  logRetentionDays: number
}

export const ConfigDefaults: Omit<
  PluginConfig,
  'statePath' | 'tasksDir' | 'tasksInline' | 'debugSnapshot' | 'defaultProvider' | 'defaultModel'
> = {
  tickMs: 60_000,
  dispatchGraceMs: 60_000,
  leaseMs: 30 * 60_000,
  unknownGraceMs: 5 * 60_000,
  logRetentionDays: 30,
}

// ⚠️ rc.1（0.1.7-rc.1）约束：宿主插件配置字段**不能标 .volatile()**。
// 实测根因（set717/lib/index.js:417 + types/index.js:368-380）：configForms 的读写都要求字段
// volatile，且 describe() 只投影 volatileForm(schema)（即只有 volatile 字段才暴露给客户端）；
// 但宿主 Loader 会把 volatile 字段的默认按 `{}` 提交进 profile，重装后 z.number()/z.string()
// 校验失败 → entry 不激活（日志 `$.tickMs expected number but got [object Object]`）。
// 故宿主插件配置一律为静态字段；运行时数据（快照 / 任务表回写）改走宿主服务
// `ctx.set('taskDispatchTable', ...)`，客户端经 `ctx.get('remote').taskDispatchTable` 取
// （参考插件即靠 `ctx.get('remote')` 调宿主服务，不走 configForms）。
export const Config = z.object({
  statePath: z.string().default(''),
  tickMs: z.number().default(ConfigDefaults.tickMs),
  dispatchGraceMs: z.number().default(ConfigDefaults.dispatchGraceMs),
  leaseMs: z.number().default(ConfigDefaults.leaseMs),
  unknownGraceMs: z.number().default(ConfigDefaults.unknownGraceMs),
  tasksDir: z.string().default('tasks'),
  tasksInline: z.string().role('textarea').default(''),
  // 调试快照：运行时数据，不进 Config；宿主经 taskDispatchTable.getSnapshot() 暴露给客户端。
  debugSnapshot: z.string().default(''),
  // 决策 22 漏斗第②层：留空 = 未配，派发时漏到下一层。解析结果只用于本次派发，不回写本字段。
  defaultProvider: z.string().default(''),
  defaultModel: z.string().default(''),
  logRetentionDays: z.number().min(1).default(30),
})

/**
 * rc.1 volatile 字段的解析结果是**带 get() 的引用**（非纯值）；读取时解包（与参考插件
 * dsh-task-board 的 readConfigField 同款）。非 volatile 字段原样返回；undefined/null 回落 fallback。
 * @param field - 配置字段（可能是 Volatile 引用或纯值）。
 * @param fallback - 字段缺失时的回落值。
 */
export function readConfigField<T>(field: unknown, fallback: T): T {
  if (field === undefined || field === null) return fallback
  if (typeof field === 'object' && typeof (field as { get?: unknown }).get === 'function') {
    return (field as { get(): T }).get()
  }
  return field as T
}

/**
 * 状态库路径（决策 14）：配置覆盖 > 宿主数据根 storages/dsh-task-dispatch-table/state.db。
 * 宿主数据根解析复刻 packages/util/home-paths/src/index.ts:87-100：配置路径 > $DSH_HOME > ~/.dsh。
 * 放 config.ts 而非 index.ts：scheduler/submit 也要用（避免 index 循环导入）。
 */
export function resolveStatePath(statePath: string): string {
  if (statePath.trim().length > 0) return resolve(statePath)
  const raw = process.env['DSH_HOME']
  const selected = raw !== undefined && raw.trim().length > 0 ? raw : join(homedir(), '.dsh')
  const home = selected === '~' || selected.startsWith('~/')
    ? join(homedir(), selected.slice(selected.length === 1 ? 1 : 2))
    : selected
  return join(resolve(home), 'storages', 'dsh-task-dispatch-table', 'state.db')
}
