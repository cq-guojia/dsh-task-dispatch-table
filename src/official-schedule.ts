/**
 * 官方「自动化任务」入口的开关（宿主 0.2.2-rc.1 源码核实，结论见
 * `docs/dependencies/official-schedule-toggle.md`）。
 *
 * 为什么必须借道宿主的插件管理器：官方 slots 没有「隐藏他人条目」的接口，唯一的正路是把
 * `@deepseek-ai/dsh-client-ui-schedule` 这条组合行停用（写 profile 的 `disabled` 覆盖项）。
 * 停用后该行仍留在 loader 的 entry 表里（只是没有 fiber），所以插件清单看得到、也还能再启用。
 *
 * ⚠️ 不写进 inject：`pluginManager` 缺失时整块要能安静降级（决策 17：组合满足不了的依赖会让
 * entry 一直 pending）。
 */
import type { HostContext, HostLogger } from './host.js'

/** 官方自动化任务界面所在的包（组合行 id `ui-schedule`，声明在 `@deepseek-ai/dsh-web-app` 的 patch）。 */
export const OFFICIAL_SCHEDULE_PACKAGE = '@deepseek-ai/dsh-client-ui-schedule'

/** 插件清单行（`pluginManager.listPlugins()` 投影的子集）。 */
interface PluginRow {
  entryId: string
  moduleName: string
  enabled: boolean
  readOnlyReason?: string
}

/** `ctx.pluginManager` 用到的最小面（TypertRemoteService，宿主 0.2.2-rc.1 `lib/types/index.d.ts:187`）。 */
export interface PluginManagerFace {
  listPlugins(): Promise<PluginRow[]>
  setPluginEnabled(id: string, enabled: boolean): Promise<unknown>
}

/**
 * 取宿主插件管理器；缺失 / 面不齐 ⇒ null（调用方降级并只记一条日志）。
 * @param ctx - 宿主上下文。
 */
export function pluginManagerOf(ctx: HostContext): PluginManagerFace | null {
  const service = ctx.get('pluginManager')
  if (typeof service !== 'object' || service === null) return null
  const face = service as Partial<PluginManagerFace>
  if (typeof face.listPlugins !== 'function' || typeof face.setPluginEnabled !== 'function') return null
  return face as PluginManagerFace
}

/** 上次拿到的管理器面：dispose 之后 `ctx.get` 未必还可用，回滚要能用旧引用。 */
let cached: PluginManagerFace | null = null

/** 找到官方自动化那一行（找不到 = 宿主改版换了包名/行，只记 warn 不抛）。 */
async function scheduleRow(manager: PluginManagerFace): Promise<PluginRow | undefined> {
  return (await manager.listPlugins()).find((row) => row.moduleName === OFFICIAL_SCHEDULE_PACKAGE)
}

/**
 * 让官方自动化入口处在 `hidden` 说的状态（幂等：本来就对就一次写都不发）。
 * @param ctx - 宿主上下文（取 `pluginManager`）。
 * @param logger - 宿主 logger（降级/失败原因留痕，别静默）。
 * @param hidden - true = 屏蔽官方入口；false = 放出来。
 * @returns 是否已对齐；false 表示宿主不支持或该行不可寻址。
 */
export async function syncOfficialSchedule(ctx: HostContext, logger: HostLogger, hidden: boolean): Promise<boolean> {
  const manager = pluginManagerOf(ctx)
  if (manager === null) {
    logger.warn('[官方自动化] 宿主没有 pluginManager 服务，屏蔽开关不生效')
    return false
  }
  cached = manager
  const row = await scheduleRow(manager)
  if (row === undefined) {
    logger.warn(`[官方自动化] 插件清单里找不到 ${OFFICIAL_SCHEDULE_PACKAGE}，屏蔽开关不生效`)
    return false
  }
  if (row.readOnlyReason !== undefined) {
    logger.warn(`[官方自动化] 该行不可管理（${row.readOnlyReason}），屏蔽开关不生效`)
    return false
  }
  if (row.enabled === !hidden) return true
  await manager.setPluginEnabled(row.entryId, !hidden)
  logger.info(`[官方自动化] 已${hidden ? '屏蔽' : '放出'}官方自动化入口（重启或 HMR 后生效）`)
  return true
}

/**
 * 卸载前放回官方入口（只在我们自己设过「屏蔽」时调用）。
 *
 * ⚠️ 不能同步等：卸载正是插件管理器持着 profile 文件锁做 reload 时触发的，此处再调一次
 * `setPluginEnabled` 会去等同一把锁（120s）。故丢一个延后调用出去，等外层操作放锁后再跑。
 * 宿主进程紧接退出时这一枪可能没打出去 —— 兜底是用户在插件页手动把那行打开。
 * @param logger - 宿主 logger。
 */
export function releaseOfficialSchedule(logger: HostLogger): void {
  const manager = cached
  if (manager === null) return
  setTimeout(() => {
    void (async (): Promise<void> => {
      const row = await scheduleRow(manager)
      if (row === undefined || row.enabled || row.readOnlyReason !== undefined) return
      await manager.setPluginEnabled(row.entryId, true)
      logger.info('[官方自动化] 插件卸载，已放回官方自动化入口')
    })().catch((error: unknown) => {
      logger.warn(`[官方自动化] 卸载回滚失败：${error instanceof Error ? error.message : String(error)}`)
    })
  }, 0)
}
