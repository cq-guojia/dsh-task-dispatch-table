// scheduler.ts — 调度循环（决策 31 重设计：懒建行 + 不回看 + 不补跑 + skipped 只进日志）。
//
// 两条主循环：
//   Loop A（dispatchNewSlots）：每 tick 只判「现在这一刻该不该跑」——取满足
//     scheduled_at <= now <= scheduled_at + window 且无实例行的「最晚」刻度；依赖 / 工作区
//     不过 ⇒ 只记 task_log、不建 task_instances 行；过了 ⇒ 直接以 dispatched 落库（同步），
//     再异步拉起会话（模型路由为唯一异步预条件，失败则删掉刚建的新行，仍不留行）。
//     绝不预建未来 pending、绝不回看补建 skipped。
//   Loop B（reconciler.sweep + redispatchPending）：只处理已存在的行——追问 / 重试 /
//     租约 / 崩溃残留 pending（窗口内重派、窗口外删行记日志）。
import { randomUUID } from 'node:crypto'
import { existsSync, readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import type { HostContext, HostLogger, HostWorkspace } from './host.js'
import { parseInlineTasks, type TaskDefinition } from './tasks.js'
import { durationMs, logicalDateOf, scheduledSlotsFor } from './tasks.js'
import type { TaskInstance, TaskStore, InstanceStatus } from './store.js'
import type { Reconciler } from './reconcile.js'
import { dispatchTask, resolveModelRoute, DispatchPreconditionError } from './dispatch.js'
import type { PluginConfig } from './config.js'

export interface Scheduler {
  tick: () => void
  getTasks: () => Map<string, TaskDefinition>
  /** 启动诊断（决策 31）：报告自上次起到现在的「错过刻度」计数（不补跑、只记日志）。 */
  startupDiagnostics: () => void
}

export type Judgement = 'ready' | 'blocked'

const IN_FLIGHT_STATUSES: InstanceStatus[] = ['dispatched', 'running', 'unknown']

// ── 调度输入加载（inline JSON 或目录，按配置择一）──
function loadTasks(logger: HostLogger, config: PluginConfig): TaskDefinition[] {
  if (config.tasksInline.trim() !== '') {
    const parsed = parseInlineTasks(logger, config.tasksInline)
    return parsed
  }
  return readTasksDir(logger, config.tasksDir)
}

/** 目录模式：读取 tasksDir 下的 .json / .jsonc 任务文件（每文件可含数组或 {tasks:[...]}）。 */
function readTasksDir(logger: HostLogger, dir: string): TaskDefinition[] {
  if (!dir || !existsSync(dir)) return []
  const out: TaskDefinition[] = []
  for (const file of readdirSync(dir)) {
    if (!file.endsWith('.json') && !file.endsWith('.jsonc')) continue
    try {
      const text = readFileSync(join(dir, file), 'utf8')
      out.push(...parseInlineTasks(logger, stripJsoncComments(text)))
    } catch (e) {
      logger.warn(`读取任务文件失败 ${file}：${e instanceof Error ? e.message : String(e)}`)
    }
  }
  return out
}

/** 去掉 JSONC 注释（// 与 /* *​/），便于目录模式直接吃 .jsonc。 */
function stripJsoncComments(text: string): string {
  return text.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/.*$/gm, '$1')
}

// ── 依赖判定（决策 8/9）：同周期 / 最近成功。只查已存在的实例（无行即视为缺失）。──
export function judgeDependencies(
  store: TaskStore,
  task: TaskDefinition,
  logicalDate: string,
  scheduledAt: string,
): Judgement {
  const deps = task.depends_on
  if (!deps || deps.length === 0) return 'ready'
  for (const dep of deps) {
    if (dep.semantics === 'same_period') {
      const upstream = store.getSamePeriod(dep.task, logicalDate)
      if (upstream === undefined || upstream.status !== 'succeeded') return 'blocked'
    } else {
      const upstream = store.getLatestSuccess(dep.task, freshnessCutoff(dep.freshness, scheduledAt))
      if (upstream === undefined) return 'blocked'
    }
  }
  return 'ready'
}

/** freshness 截止：相对本刻度窗口起点的便宜量（决策 9：latest_success 的新鲜度基准 = scheduled_at）。 */
function freshnessCutoff(freshness: string | undefined, scheduledAt: string): string | undefined {
  if (freshness === undefined) return undefined // 未配 ⇒ 任意历史成功（决策 9 现状，待 U7 拍板）
  return new Date(Date.parse(scheduledAt) - durationMs(freshness)).toISOString()
}

function isOnce(task: TaskDefinition): boolean {
  return task.schedule.once !== undefined
}
function onceDate(task: TaskDefinition): Date | undefined {
  if (task.schedule.once === undefined) return undefined
  const d = new Date(task.schedule.once)
  return Number.isNaN(d.getTime()) ? undefined : d
}

/** 取「当前该跑的那一下」：最晚满足 scheduled_at <= now <= scheduled_at+window 且无实例行的刻度。 */
function dueSlot(task: TaskDefinition, nowMs: number, store: TaskStore): { logicalDate: string; scheduledAtIso: string } | undefined {
  let chosen: Date | undefined
  if (isOnce(task)) {
    const od = onceDate(task)
    if (od !== undefined && od.getTime() <= nowMs) chosen = od
  } else {
    const windowMs = durationMs(task.schedule.window)
    const from = new Date(nowMs - windowMs)
    const to = new Date(nowMs + 1000) // 容差 1s
    try {
      for (const s of scheduledSlotsFor(task, from, to)) {
        if (s.getTime() <= nowMs && (chosen === undefined || s.getTime() > chosen.getTime())) chosen = s
      }
    } catch {
      return undefined
    }
  }
  if (chosen === undefined) return undefined
  const iso = chosen.toISOString()
  if (store.findBySlot(task.id, iso) !== undefined) return undefined // 已有实例（幂等/此前已处理）
  return { logicalDate: logicalDateOf(chosen, task.schedule.timezone), scheduledAtIso: iso }
}

/** 依赖卡顿日志限频（避免每 tick 刷屏），5 分钟内同任务只记一次。 */
function logDepBlocked(depLog: Map<string, number>, store: TaskStore, taskId: string, scheduledAt: string): void {
  const now = Date.now()
  const last = depLog.get(taskId) ?? 0
  if (now - last < 5 * 60_000) return
  depLog.set(taskId, now)
  store.appendLog({ taskId, scheduledAt, level: 'info', kind: 'dep_blocked', message: '被依赖卡住，等待上游成功（下轮再判）' })
}

/** 工作区解析（配置错 ⇒ 抛错，由调用方捕获并记日志、不建行）。 */
function resolveWorkspace(ctx: HostContext, workspace: string): HostWorkspace {
  const handle = ctx.workspaceRegistry.list().find((w) => w.title === workspace)
  if (handle === undefined) throw new Error(`workspace-not-found:${workspace}`)
  return handle
}

/**
 * 异步拉起（fire-and-forget）：模型路由为唯一异步预条件；失败 ⇒ 删掉刚建的新行（不留行）或
 * 保留既有 pending 行（重试路径）。拉起失败的行由 sweep 走 dispatch-grace/lease 重试收敛。
 */
async function launchAsync(
  ctx: HostContext,
  logger: HostLogger,
  store: TaskStore,
  reconciler: Reconciler,
  task: TaskDefinition,
  instanceId: string,
  slot: { logicalDate: string; scheduledAtIso: string },
  workspace: HostWorkspace,
  config: PluginConfig,
  deleteOnPrecondition: boolean,
): Promise<void> {
  let route: Awaited<ReturnType<typeof resolveModelRoute>> | undefined
  try {
    route = await resolveModelRoute(ctx, logger, task, config)
  } catch {
    route = undefined
  }
  if (route === undefined) {
    store.appendLog({
      taskId: task.id, scheduledAt: slot.scheduledAtIso, level: 'warn', kind: 'precondition',
      message: `无可用的模型路由（provider=${task.target.provider ?? ''} model=${task.target.model ?? ''}）`,
    })
    if (deleteOnPrecondition) store.deleteInstance(instanceId)
    return
  }
  try {
    const { sessionId, handle } = await dispatchTask({ ctx, logger, store, task, instanceId, logicalDate: slot.logicalDate, workspace, config })
    reconciler.registerHandle(sessionId, handle)
  } catch (error) {
    if (error instanceof DispatchPreconditionError) {
      store.appendLog({ taskId: task.id, scheduledAt: slot.scheduledAtIso, level: 'warn', kind: 'precondition', message: `派发前置失败：${error.message}` })
      if (deleteOnPrecondition) store.deleteInstance(instanceId)
      return
    }
    logger.error(`任务派发异常（实例 ${instanceId}）：${error instanceof Error ? error.message : String(error)}`)
  }
}

function dispatchNewSlots(
  ctx: HostContext,
  logger: HostLogger,
  store: TaskStore,
  reconciler: Reconciler,
  tasks: TaskDefinition[],
  config: PluginConfig,
  depLog: Map<string, number>,
): void {
  const nowMs = Date.now()
  for (const task of tasks) {
    if (task.enabled === false) continue
    // 串行语义（§8）：同任务已有在飞实例则跳过本次新槽
    if (store.listByStatus(IN_FLIGHT_STATUSES).some((o) => o.task_id === task.id)) continue
    const slot = dueSlot(task, nowMs, store)
    if (slot === undefined) continue
    // 同步预条件：依赖 + 工作区（不过 ⇒ 不建行、记日志）
    if (judgeDependencies(store, task, slot.logicalDate, slot.scheduledAtIso) !== 'ready') {
      logDepBlocked(depLog, store, task.id, slot.scheduledAtIso)
      continue
    }
    let workspace: HostWorkspace
    try {
      workspace = resolveWorkspace(ctx, task.target.workspace)
    } catch {
      store.appendLog({ taskId: task.id, scheduledAt: slot.scheduledAtIso, level: 'warn', kind: 'precondition', message: `工作区未找到：${task.target.workspace}` })
      continue
    }
    // 懒建行（同步）：直接 dispatched，杜绝提前 pending / 未来预建
    const id = randomUUID()
    if (!store.ensureInstance(id, task.id, slot.logicalDate, slot.scheduledAtIso, 'dispatched')) continue // 撞唯一索引（极少）
    // 异步拉起（fire-and-forget）：必须 catch，避免插件关闭 / 库已关时的异步余波变成未捕获 rejection
    void launchAsync(ctx, logger, store, reconciler, task, id, slot, workspace, config, true)
      .catch((error) => logger.warn(`派发异步收尾异常（实例 ${id}）：${error instanceof Error ? error.message : String(error)}`))
  }
}

/** 重派已有 pending 行（决策 10 重试 / 崩溃残留）：窗口内重派，窗口外删行记日志。 */
function redispatchPending(
  ctx: HostContext,
  logger: HostLogger,
  store: TaskStore,
  reconciler: Reconciler,
  tasks: TaskDefinition[],
  config: PluginConfig,
  depLog: Map<string, number>,
): void {
  const nowMs = Date.now()
  for (const task of tasks) {
    if (task.enabled === false) continue
    if (store.listByStatus(IN_FLIGHT_STATUSES).some((o) => o.task_id === task.id)) continue
    const pendings = store.listByStatus(['pending']).filter((o: TaskInstance) => o.task_id === task.id)
    for (const row of pendings) {
      const deadline = Date.parse(row.scheduled_at) + durationMs(task.schedule.window)
      if (nowMs > deadline) {
        store.deleteInstance(row.id) // 窗口外残留 pending（崩溃残留 / 超窗）：删行 + 记日志（决策 31.6）
        store.appendLog({ taskId: task.id, scheduledAt: row.scheduled_at, level: 'warn', kind: 'stray_pending', message: '窗口外残留 pending，已删除（视为未执行）' })
        continue
      }
      if (judgeDependencies(store, task, row.logical_date, row.scheduled_at) !== 'ready') {
        logDepBlocked(depLog, store, task.id, row.scheduled_at)
        continue
      }
      let workspace: HostWorkspace
      try {
        workspace = resolveWorkspace(ctx, task.target.workspace)
      } catch {
        // 既有 pending 行：工作区缺失只跳过本轮（下轮重试），不删行
        continue
      }
      void launchAsync(ctx, logger, store, reconciler, task, row.id, { logicalDate: row.logical_date, scheduledAtIso: row.scheduled_at }, workspace, config, false)
        .catch((error) => logger.warn(`重派异步收尾异常（实例 ${row.id}）：${error instanceof Error ? error.message : String(error)}`))
    }
  }
}

export function createScheduler(opts: {
  ctx: HostContext
  logger: HostLogger
  store: TaskStore
  reconciler: Reconciler
  config: () => PluginConfig
}): Scheduler {
  const { ctx, logger, store, reconciler, config } = opts
  const depLog = new Map<string, number>()
  let taskMap = new Map<string, TaskDefinition>()

  return {
    tick() {
      const cfg = config()
      const tasks = loadTasks(logger, cfg)
      taskMap = new Map(tasks.map((t) => [t.id, t]))
      // Loop B：先处理已存在行（追问 / 重试 / 租约 / 残留 pending）
      reconciler.sweep()
      // Loop A：再处理新刻度（懒建行 + 不回看 + 不补跑）
      dispatchNewSlots(ctx, logger, store, reconciler, tasks, cfg, depLog)
      redispatchPending(ctx, logger, store, reconciler, tasks, cfg, depLog)
      // 保留期清除（决策 32：task_log 可定时清）
      store.purgeLog(cfg.logRetentionDays ?? 30)
    },

    getTasks() {
      return taskMap
    },

    startupDiagnostics() {
      const cfg = config()
      const tasks = loadTasks(logger, cfg)
      const nowMs = Date.now()
      for (const task of tasks) {
        if (task.enabled === false) continue
        const windowMs = isOnce(task) ? 0 : durationMs(task.schedule.window)
        const lookback = Math.max(windowMs, 2 * 3600_000)
        const from = new Date(nowMs - lookback)
        const to = new Date(nowMs - windowMs)
        let missed = 0
        try {
          const slots = isOnce(task)
            ? (onceDate(task) !== undefined && onceDate(task)!.getTime() < nowMs - windowMs ? [onceDate(task)!] : [])
            : scheduledSlotsFor(task, from, to)
          for (const s of slots) {
            if (store.findBySlot(task.id, s.toISOString()) === undefined) missed++
          }
        } catch {
          continue
        }
        if (missed > 0) {
          store.appendLog({
            taskId: task.id, level: 'info', kind: 'startup_missed',
            message: `自 ${from.toISOString()} 起错过 ${missed} 个刻度（不补跑）`,
          })
        }
      }
    },
  }
}
