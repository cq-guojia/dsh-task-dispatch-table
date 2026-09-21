// dsh-task-dispatch-table：定时任务调度器宿主插件（可编译骨架）。
// 读任务定义 JSON → 按 cron/窗口/依赖判定 → 在指定工作区派发 agent 会话 → 监听会话事件对账 → SQLite 记状态。
// 调度层零大模型介入（PROGRESS 背景）；插件零业务逻辑——任务定义见 docs/examples。
import { homedir } from 'node:os'
import { join, resolve } from 'node:path'
import type { HostContext } from './host.js'
import { Config } from './config.js'
import type { PluginConfig } from './config.js'
import type { TaskDefinition } from './tasks.js'
import { TaskStore } from './store.js'
import { createReconciler } from './reconcile.js'
import type { ReconcileOptions } from './reconcile.js'
import { createScheduler } from './scheduler.js'
import type { Scheduler } from './scheduler.js'

export const name = 'dsh-task-dispatch-table'

/** 宿主服务依赖：以源码实际服务名为准（决策 15 / PROGRESS「已核实的 DSH 能力」）。 */
export const inject = ['timer', 'agents', 'sessions', 'workspaceRegistry', 'settings', 'sessionTitle'] as const

export { Config }
export type { PluginConfig }

/**
 * 状态库路径（决策 14）：配置覆盖 > 宿主数据根 storages/dsh-task-dispatch-table/state.db。
 * 宿主数据根解析复刻 packages/util/home-paths/src/index.ts:87-100：配置路径 > $DSH_HOME > ~/.dsh。
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

export function apply(ctx: HostContext, config: unknown): void {
  const initial = (Config as (value: unknown) => PluginConfig)(config)
  // v1 零自建 UI（决策 16）：配置走官方 ctx.settings 命名空间，patch config 作为 base 层，
  // 用户文档层 live 覆盖（packages/settings/settings/src/index.ts:49-59）。
  const scope = ctx.settings.register<PluginConfig>('dsh-task-dispatch-table', Config, { base: initial })
  // statePath 启动时定格，运行期改配置不迁移库。
  const store = new TaskStore(resolveStatePath(scope.get().statePath))

  let taskMap = new Map<string, TaskDefinition>()
  const reconcileOptions: ReconcileOptions = {
    get leaseMs() { return scope.get().leaseMs },
    get dispatchGraceMs() { return scope.get().dispatchGraceMs },
    get unknownGraceMs() { return scope.get().unknownGraceMs },
    tasks: () => taskMap,
  }
  const reconciler = createReconciler({ ctx, store, options: reconcileOptions })
  const scheduler: Scheduler = createScheduler({
    ctx, store, reconciler,
    config: () => scope.get(),
  })

  // 启动扫描（机制 #5）：重启期间 disposed 事件可能全部丢失，已派发未定态实例置 unknown，
  // 随后按 unknown 流程自然收敛（§3）。pending 从未派发、无可丢事件，保持原状。
  const scanned = store.startupScan()
  if (scanned > 0) ctx.logger.info(`启动扫描：${scanned} 个已派发实例置 unknown`)

  ctx.on('session/created', session => reconciler.onCreated(session))
  ctx.on('session/event', (session, event) => reconciler.onEvent(session, event))
  ctx.on('session/disposed', session => reconciler.onDisposed(session))

  const safeTick = (): void => {
    try {
      scheduler.tick()
      taskMap = scheduler.getTasks()
    } catch (error) {
      ctx.logger.error(`tick 异常: ${String(error)}`)
    }
  }

  // 官方定时器（决策 13）：ctx.interval 卸载自动清理（vendor/timer/src/index.ts:47-62）。
  // tickMs live 变更时重启 interval。
  let stopInterval = ctx.interval(safeTick, scope.get().tickMs)
  scope.watch((next, prev) => {
    if (next.tickMs === prev.tickMs) return
    stopInterval()
    stopInterval = ctx.interval(safeTick, next.tickMs)
  })

  safeTick()
  scheduler.backfill()

  ctx.on('dispose', () => {
    stopInterval()
    store.close()
  })
}
