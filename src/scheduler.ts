// tick 主循环（state-machine §1）：对账兜底 → 实例保障 → 逐任务判定（窗口 / 依赖 / 串行 / CAS 领取 / 派发）。
// 所有判定纯程序逻辑，零 token（§1）。
import type { HostContext, HostLogger } from './host.js'
import { resolveStatePath } from './config.js'
import type { PluginConfig } from './config.js'
import { durationMs, loadTasks, logicalDateOf, onceScheduledAt, parseInlineTasks, scheduledAtFor } from './tasks.js'
import type { TaskDefinition } from './tasks.js'
import type { TaskStore, TaskInstance } from './store.js'
import type { Reconciler } from './reconcile.js'
import { dispatchTask, resolveWorkspacePath } from './dispatch.js'

/** 在跑态：同任务串行判定（§8）的互斥集合——pending 只是排队，不阻塞后继派发。 */
const IN_FLIGHT_STATUSES = ['dispatched', 'running', 'unknown'] as const

export interface Scheduler {
  /** 启动补建（§7 backfill.days 层）。 */
  backfill(): void
  /** 每 tick 主循环。 */
  tick(): void
  /** 供对账器查任务定义。 */
  getTasks(): Map<string, TaskDefinition>
}

export interface SchedulerDeps {
  ctx: HostContext
  /** tee logger（显式传参——ctx 不可包装，见 host.ts HostLogger 注释）。 */
  logger: HostLogger
  store: TaskStore
  reconciler: Reconciler
  config: () => PluginConfig
}

/** 任务时区的「今天」（缺省 = 宿主时区，data-model schedule.timezone 语义）。 */
function todayOf(task: TaskDefinition): string {
  return logicalDateOf(new Date(), task.schedule.timezone)
}

function shiftDay(day: string, days: number): string {
  const date = new Date(`${day}T00:00:00`)
  date.setUTCDate(date.getUTCDate() + days)
  return date.toISOString().slice(0, 10)
}

/**
 * 任务在某日历日的计划时刻。cron 任务向前迭代 cron（searchFrom 取该日前 26h 起，
 * 上限 2000 次迭代覆盖分钟级 cron）；once 任务（决策 18）仅在 once 对应日历日
 * 返回其指定时刻 —— 实例唯一 ⇒ 跑完自动停，无需改 enabled。
 */
function planFor(task: TaskDefinition, day: string): Date | undefined {
  if (task.schedule.once !== undefined) return onceScheduledAt(task, day)
  return scheduledAtFor(task, day, new Date(Date.parse(`${day}T00:00:00`) - 26 * 3600_000))
}

function windowDeadline(task: TaskDefinition, instance: TaskInstance): number {
  return Date.parse(instance.scheduled_at) + durationMs(task.schedule.window)
}

export function createScheduler({ ctx, logger, store, reconciler, config }: SchedulerDeps): Scheduler {
  let tasks = new Map<string, TaskDefinition>()

  /** 窗口内 pending / 已过窗 skipped 留痕（§3 实例保障 / §7）。 */
  function ensureInstances(currentTasks: TaskDefinition[]): void {
    for (const task of currentTasks) {
      for (const day of [shiftDay(todayOf(task), -1), todayOf(task)]) {
        const scheduledAt = planFor(task, day)
        if (scheduledAt === undefined) continue
        const instanceId = `${task.id}:${day}`
        if (store.get(instanceId) !== undefined) continue
        const overWindow = Date.now() > scheduledAt.getTime() + durationMs(task.schedule.window)
        store.ensureInstance(task.id, day, scheduledAt.toISOString(), overWindow ? 'skipped' : 'pending')
      }
    }
  }

  /**
   * 计划重排（决策 20）：计划时刻不是建行时定死——「从未执行」的 pending（attempt=0）
   * 每 tick 按当前配置重算；配置已无该日计划（如 once 改到别日）→ skipped 留痕
   * （plan-removed），新日实例由 ensureInstances 自然补建。已派发 / 重试中（attempt≥1）
   * / 终态一律冻结，执行记录可追溯。
   */
  function reschedulePass(currentTasks: TaskDefinition[]): void {
    for (const task of currentTasks) {
      const pendings = store.listByStatus(['pending'])
        .filter(instance => instance.task_id === task.id && instance.attempt === 0)
      for (const instance of pendings) {
        const planned = planFor(task, instance.logical_date)
        if (planned === undefined) {
          store.transition(instance.id, {
            status: 'skipped', finished_at: new Date().toISOString(), detail: 'plan-removed',
          })
          continue
        }
        const plannedIso = planned.toISOString()
        if (plannedIso === instance.scheduled_at) continue
        if (store.reschedule(instance.id, plannedIso)) {
          store.appendEvent(instance.id, 'reschedule', { from: instance.scheduled_at, to: plannedIso })
        }
      }
    }
  }

  /**
   * 依赖判定（§9）。ready = 可派发；blocked = 不满足不分配（pending 继续等）。
   * 上游终态失败也返回 blocked 而非立即置 skipped：决策 10「当日窗口内修复则继续」，
   * 下游须保持可修复性，窗口过期时随窗口判定收敛 skipped（整条链作废）。
   */
  function judgeDependencies(task: TaskDefinition, instance: TaskInstance): 'ready' | 'blocked' {
    for (const dep of task.depends_on ?? []) {
      if (dep.semantics === 'same_period') {
        const upstream = store.getSamePeriod(dep.task, instance.logical_date)
        if (upstream === undefined || ['pending', 'dispatched', 'running', 'unknown'].includes(upstream.status)) {
          return 'blocked'
        }
        if (upstream.status !== 'succeeded') return 'blocked' // 上游 failed / skipped → 不分配（决策 10）
      } else {
        const freshnessMs = dep.freshness === undefined ? undefined : durationMs(dep.freshness)
        const cutoff = freshnessMs === undefined ? undefined : new Date(Date.now() - freshnessMs).toISOString()
        const upstream = store.getLatestSuccess(dep.task, cutoff)
        if (upstream === undefined) return 'blocked' // 无新鲜成功记录：等（过窗后由窗口判定收敛）
      }
    }
    return 'ready'
  }

  function dispatchPass(currentTasks: TaskDefinition[]): void {
    for (const task of currentTasks) {
      const pendings = store.listByStatus(['pending']).filter(instance => instance.task_id === task.id)
      for (const instance of pendings) {
        // 同任务串行（§8）：存在任一在跑实例则本任务不派发。
        if (store.listByStatus([...IN_FLIGHT_STATUSES]).some(other =>
          other.task_id === task.id && other.id !== instance.id,
        )) {
          continue
        }
        // 未到计划时刻不派发（§2 pending 语义「未到时间」；否则大窗口任务会被 tick 提前跑掉）。
        if (Date.now() < Date.parse(instance.scheduled_at)) continue
        // 窗口只管开始（§5）：pending 过窗 → skipped 终态；已派发的不受窗切断。
        if (Date.now() > windowDeadline(task, instance)) {
          store.transition(instance.id, { status: 'skipped', finished_at: new Date().toISOString(), detail: 'over-window' })
          continue
        }
        // 依赖不满足：pending 等（§2「前置未满足」），不转移不留终态。
        if (judgeDependencies(task, instance) !== 'ready') continue

        let workspacePath: string
        try {
          workspacePath = resolveWorkspacePath(ctx, task.target.workspace)
        } catch (error) {
          logger.warn(`任务 ${task.id} 派发中止: ${String(error)}`)
          continue
        }
        // CAS 领取（data-model 关键设计 3）→ dispatched → 派发。
        if (!store.casClaim(instance.id)) continue
        dispatchTask({
          ctx, store, task,
          instanceId: instance.id,
          logicalDate: instance.logical_date,
          workspacePath,
          statePath: resolveStatePath(config().statePath),
        })
          .then(({ sessionId, handle }) => reconciler.registerHandle(sessionId, handle))
          .catch((error: unknown) => {
            // 派发异常走重试判定（§6），等价于宽限期超时路径。
            logger.error(`派发失败 ${instance.id}: ${String(error)}`)
            const latest = store.get(instance.id)
            if (latest !== undefined && latest.status === 'dispatched') reconciler.retryOrFail(latest, 'dispatch-error')
          })
      }
    }
  }

  return {
    getTasks(): Map<string, TaskDefinition> {
      return tasks
    },

    backfill(): void {
      const currentTasks = [...tasks.values()]
      for (const task of currentTasks) {
        if (task.backfill.days <= 0) continue
        const today = todayOf(task)
        // 近 N 天缺失实例补建为 pending，照常走依赖与窗口判定（§7 历史层）。
        for (let offset = -task.backfill.days; offset <= -1; offset++) {
          const day = shiftDay(today, offset)
          const scheduledAt = planFor(task, day)
          if (scheduledAt === undefined) continue
          store.ensureInstance(task.id, day, scheduledAt.toISOString(), 'pending')
        }
      }
    },

    tick(): void {
      const cfg = config()
      // 任务来源：tasksInline（配置页 textarea，临时 UI）非空则优先，否则读 tasksDir 目录。
      const source = cfg.tasksInline.trim().length > 0
        ? parseInlineTasks(logger, cfg.tasksInline)
        : loadTasks(logger, cfg.tasksDir)
      tasks = new Map(source.map(task => [task.id, task]))
      const currentTasks = [...tasks.values()]
      reconciler.sweep()
      ensureInstances(currentTasks)
      reschedulePass(currentTasks)
      dispatchPass(currentTasks)
    },
  }
}
