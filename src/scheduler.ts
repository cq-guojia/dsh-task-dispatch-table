// tick 主循环（state-machine §1）：对账兜底 → 实例保障 → 逐任务判定（窗口 / 依赖 / 串行 / CAS 领取 / 派发）。
// 所有判定纯程序逻辑，零 token（§1）。
import type { HostContext, HostLogger, HostWorkspace } from './host.js'
import type { PluginConfig } from './config.js'
import {
  durationMs, firstSlotOnDay, loadTasks, logicalDateOf,
  onceScheduledAt, parseInlineTasks, scheduledSlotsFor,
} from './tasks.js'
import type { TaskDefinition } from './tasks.js'
import type { TaskStore, TaskInstance } from './store.js'
import type { Reconciler } from './reconcile.js'
import { DispatchPreconditionError, dispatchTask, resolveWorkspace } from './dispatch.js'

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

/** 单任务单次 ensureInstances 最多创建的实例数（防御分钟级 cron 在长窗口下爆量）。 */
const MAX_ENSURE_SLOTS = 200

/**
 * 任务在 `[from, to)` 内的**全部计划刻度**（决策 25）。
 * cron 任务按表达式逐个产出（支持小时级 / 分钟级）；once 任务（决策 18）只有它那一个刻度。
 */
function slotsOf(task: TaskDefinition, from: Date, to: Date): Date[] {
  if (task.schedule.once !== undefined) {
    const at = onceScheduledAt(task, task.schedule.once.slice(0, 10))
    if (at === undefined) return []
    return at.getTime() >= from.getTime() && at.getTime() < to.getTime() ? [at] : []
  }
  return scheduledSlotsFor(task, from, to)
}

/**
 * 任务在某日历日的计划时刻（历史补跑 / live 重排用，一天一个刻度即可）。
 * cron 用 `firstSlotOnDay`；once 任务（决策 18）仅在 once 对应日历日返回其指定时刻
 * —— 实例唯一 ⇒ 跑完自动停，无需改 enabled。
 */
function planFor(task: TaskDefinition, day: string): Date | undefined {
  return firstSlotOnDay(task, day)
}

function windowDeadline(task: TaskDefinition, instance: TaskInstance): number {
  return Date.parse(instance.scheduled_at) + durationMs(task.schedule.window)
}

export function createScheduler({ ctx, logger, store, reconciler, config }: SchedulerDeps): Scheduler {
  let tasks = new Map<string, TaskDefinition>()

  /**
   * 实例保障（决策 25 重写）：不再是「一天一条」，而是把窗口内 cron 的**每个刻度**都建一条
   * —— 这才是小时级 / 分钟级 cron 能真正跑起来的前提（旧实现一天只产一个时刻）。
   *
   * 窗口 = `[now - max(窗口时长, 26h), now + 2×tick]`：回看覆盖「刚过去、可能被漏掉」的刻度，
   * 前看覆盖「即将到点」的刻度。刻度按时间升序产出，数量超 `MAX_ENSURE_SLOTS` 时**只保留最近的**
   * ——近期刻度才是要跑的，更远的历史交给 `backfill.days`（§7）。
   * 幂等由 `UNIQUE(task_id, scheduled_at)` 保证：同一刻度重复 INSERT 一律 DO NOTHING。
   */
  function ensureInstances(currentTasks: TaskDefinition[], tickMs: number): void {
    const now = Date.now()
    for (const task of currentTasks) {
      const windowMs = durationMs(task.schedule.window)
      const from = new Date(now - Math.max(windowMs, 26 * 3600_000))
      const to = new Date(now + 2 * tickMs)
      let slots = slotsOf(task, from, to)
      if (slots.length > MAX_ENSURE_SLOTS) slots = slots.slice(-MAX_ENSURE_SLOTS)
      for (const slot of slots) {
        const day = logicalDateOf(slot, task.schedule.timezone)
        const overWindow = now > slot.getTime() + windowMs
        store.ensureInstance(task.id, day, slot.toISOString(), overWindow ? 'skipped' : 'pending')
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
      if (pendings.length === 0) continue
      // 决策 25：一天可能有多个刻度 ⇒ 先按「日」汇总当前配置产出的刻度，
      // 再逐条判断：自己的刻度还在 ⇒ 不动；被配置移除 ⇒ 迁移到当日还空着的刻度。
      const slotsByDay = new Map<string, string[]>()
      for (const day of new Set(pendings.map(instance => instance.logical_date))) {
        const anchor = Date.parse(`${day}T00:00:00`)
        const slots = slotsOf(task, new Date(anchor - 26 * 3600_000), new Date(anchor + 48 * 3600_000))
          .filter(slot => logicalDateOf(slot, task.schedule.timezone) === day)
          .map(slot => slot.toISOString())
        slotsByDay.set(day, slots)
      }
      const occupied = new Set(pendings.map(instance => instance.scheduled_at))
      for (const instance of pendings) {
        const slots = slotsByDay.get(instance.logical_date) ?? []
        if (slots.includes(instance.scheduled_at)) continue // 仍是有效刻度：无需重排
        // 该刻度被配置移除（改了 cron / 改了时刻）⇒ 迁到当日第一个还空着的刻度。
        const target = slots.find(slot => !occupied.has(slot))
        if (target === undefined) {
          store.transition(instance.id, {
            status: 'skipped', finished_at: new Date().toISOString(), detail: 'plan-removed',
          })
          continue
        }
        if (store.reschedule(instance.id, target)) {
          occupied.delete(instance.scheduled_at)
          occupied.add(target)
          store.appendEvent(instance.id, 'reschedule', { from: instance.scheduled_at, to: target })
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

        // 工作区解析（决策 22）：target.workspace 必须是已注册工作区，匹配不到即判失败——
        // 任务必须挂在工作区下，绝不落到「未分组」或随便找个目录跑。
        let workspace: HostWorkspace
        try {
          workspace = resolveWorkspace(ctx, task.target.workspace)
        } catch (error) {
          logger.warn(`任务 ${task.id} 工作区解析失败: ${String(error)}`)
          reconciler.retryOrFail(instance, 'workspace-not-found')
          continue
        }
        // CAS 领取（data-model 关键设计 3）→ dispatched → 派发。
        if (!store.casClaim(instance.id)) continue
        dispatchTask({
          ctx, logger, store, task,
          instanceId: instance.id,
          logicalDate: instance.logical_date,
          workspace,
          // 漏斗第②层需要插件配置；派发时现算，不用建行时的值。
          config: config(),
        })
          .then(({ sessionId, handle }) => reconciler.registerHandle(sessionId, handle))
          .catch((error: unknown) => {
            // 派发异常走重试判定（§6），等价于宽限期超时路径；
            // 前置条件失败带具体 reason（决策 22：no-model-route / workspace-attach-failed）。
            const reason = error instanceof DispatchPreconditionError ? error.reason : 'dispatch-error'
            logger.error(`派发失败 ${instance.id}（${reason}）: ${String(error)}`)
            const latest = store.get(instance.id)
            if (latest !== undefined && latest.status === 'dispatched') reconciler.retryOrFail(latest, reason)
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
      // 决策 25 修订版：id 由定义自己携带（缺失时由 parse/load 生成并写回 JSON），
      // 调度器直接采信，不做任何「位置 / 指纹」推断。
      const current = cfg.tasksInline.trim().length > 0
        ? parseInlineTasks(logger, cfg.tasksInline)
        : loadTasks(logger, cfg.tasksDir)
      tasks = new Map<string, TaskDefinition>()
      for (const task of current) {
        if (!tasks.has(task.id)) tasks.set(task.id, task)
      }
      const currentTasks = [...tasks.values()]
      reconciler.sweep()
      ensureInstances(currentTasks, cfg.tickMs)
      reschedulePass(currentTasks)
      dispatchPass(currentTasks)
    },
  }
}
