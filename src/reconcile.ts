// 事件驱动对账（state-machine §1 判定树 + §3 转移表）：session/created → running+租约；
// turn/end 与 session/disposed → 产物三查收敛；tick 兜底扫描由 sweep() 提供。
// 所有路径写 task_events（data-model：对账与排障的证据链）。
import { existsSync, statSync, readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import type { HostContext, HostSession } from './host.js'
import type { TaskDefinition } from './tasks.js'
import { durationMs } from './tasks.js'
import { resolveWorkspacePath } from './dispatch.js'
import type { TaskStore, TaskInstance } from './store.js'

export interface ReconcileOptions {
  leaseMs: number
  dispatchGraceMs: number
  unknownGraceMs: number
  /** 当前任务表（scheduler 每 tick 刷新）。 */
  tasks(): Map<string, TaskDefinition>
}

export interface Reconciler {
  onCreated(session: HostSession): void
  onEvent(session: HostSession, event: { type: string }): void
  onDisposed(session: HostSession): void
  /** 派发异常等场景的重试判定入口（§6）。 */
  retryOrFail(instance: TaskInstance, reason: string, detail?: unknown): void
  sweep(): void
}

export interface ReconcilerDeps {
  ctx: HostContext
  store: TaskStore
  options: ReconcileOptions
}

/** 产物契约三查（机制 #1）：存在 + status ∈ validStatuses + mtime 晚于本次派发。 */
export function checkContract(
  task: TaskDefinition,
  workspacePath: string,
  dispatchedAtMs: number,
): { ok: boolean; reason?: string; detail?: unknown } {
  const contractPath = resolve(workspacePath, task.contract.path)
  if (!existsSync(contractPath)) return { ok: false, reason: 'contract-missing', detail: contractPath }
  const stat = statSync(contractPath)
  if (stat.mtimeMs <= dispatchedAtMs) {
    return { ok: false, reason: 'contract-stale', detail: { mtimeMs: stat.mtimeMs, dispatchedAtMs } }
  }
  let parsed: unknown
  try {
    parsed = JSON.parse(readFileSync(contractPath, 'utf8'))
  } catch (error) {
    return { ok: false, reason: 'contract-unreadable', detail: String(error) }
  }
  const status = (parsed as { status?: unknown } | null)?.status
  if (typeof status !== 'string' || !task.contract.validStatuses.includes(status)) {
    return { ok: false, reason: 'contract-status-invalid', detail: { status, validStatuses: task.contract.validStatuses } }
  }
  return { ok: true, detail: parsed }
}

export function createReconciler({ ctx, store, options }: ReconcilerDeps): Reconciler {
  const windowDeadline = (instance: TaskInstance): number =>
    Date.parse(instance.scheduled_at) + durationMs(taskOf(instance)?.schedule.window ?? 'PT0S')

  function taskOf(instance: TaskInstance): TaskDefinition | undefined {
    return options.tasks().get(instance.task_id)
  }

  function finishTerminal(instance: TaskInstance, status: 'succeeded' | 'failed', reason: string, detail?: unknown): void {
    store.transition(instance.id, { status, finished_at: new Date().toISOString(), detail: reason })
    if (detail !== undefined) store.appendEvent(instance.id, 'contract_check', { reason, detail })
    // 会话已结束（turn/end / disposed 触发的收敛）→ 归档；租约误判的回收不归档。
    if (instance.session_id !== null) void ctx.workspaceRegistry.archiveSession(instance.session_id).catch((error: unknown) => {
      ctx.logger.warn(`归档失败 ${instance.session_id}: ${String(error)}`)
    })
  }

  /** 重试判定（state-machine §6）：attempt+1 < maxAttempts 且未超窗 → 当场回 pending；否则终态 failed。 */
  function retryOrFail(instance: TaskInstance, reason: string, detail?: unknown): void {
    const task = taskOf(instance)
    const overWindow = Date.now() > windowDeadline(instance)
    if (task !== undefined && !overWindow && instance.attempt + 1 < task.retry.maxAttempts) {
      store.transition(instance.id, {
        status: 'pending',
        attempt: instance.attempt + 1,
        session_id: null,
        lease_until: null,
        dispatched_at: null,
        finished_at: null,
        detail: `retry:${reason}`,
      })
      return
    }
    finishTerminal(instance, 'failed', overWindow ? `${reason}:over-window` : reason, detail)
  }

  /** 三查收敛（state-machine §1 判定树）。 */
  function settleByContract(instance: TaskInstance): void {
    const task = taskOf(instance)
    if (task === undefined) {
      ctx.logger.warn(`实例 ${instance.id} 的任务定义不在当前任务表，暂不收敛`)
      return
    }
    const taskWorkspace = resolveWorkspacePathSafe(task)
    if (taskWorkspace === undefined) return
    const dispatchedAtMs = Date.parse(instance.dispatched_at ?? instance.updated_at)
    const verdict = checkContract(task, taskWorkspace, dispatchedAtMs)
    if (verdict.ok) {
      finishTerminal(instance, 'succeeded', 'contract-pass', verdict.detail)
    } else {
      store.appendEvent(instance.id, 'contract_check', { reason: verdict.reason, detail: verdict.detail })
      retryOrFail(instance, verdict.reason ?? 'contract-failed', verdict.detail)
    }
  }

  /** 会话活动信号：unknown → running（续租，防双跑不重派），其余续心跳。 */
  function markActivity(instance: TaskInstance): void {
    if (instance.status === 'unknown') {
      store.transition(instance.id, { status: 'running', lease_until: leaseUntil(), detail: 'unknown-revived' })
      return
    }
    if (instance.status === 'running') store.renewLease(instance.id, options.leaseMs)
  }

  function leaseUntil(): string {
    return new Date(Date.now() + options.leaseMs).toISOString()
  }

  function resolveWorkspacePathSafe(task: TaskDefinition): string | undefined {
    try {
      return resolveWorkspacePath(ctx, task.target.workspace)
    } catch (error) {
      ctx.logger.warn(`任务 ${task.id} 工作区解析失败: ${String(error)}`)
      return undefined
    }
  }

  /** 跑完信号（turn/end 或 disposed）→ 三查判定；仅 dispatch/running/unknown 实例参与。 */
  function settleBySessionId(sessionId: string, signal: string): void {
    const instance = store.getBySession(sessionId)
    if (instance === undefined) return
    if (instance.status === 'dispatched') {
      // session/created 事件同步于 sessions.create 内发出，能进 dispatched 又收到跑完信号
      // 说明 created 对账被跳过（如插件重启恢复），先补 running 语义再判定。
      store.transition(instance.id, { status: 'running', lease_until: leaseUntil(), detail: signal })
      settleByContract(store.get(instance.id) ?? instance)
      return
    }
    if (instance.status === 'running' || instance.status === 'unknown') {
      store.appendEvent(instance.id, 'session_event', { type: signal })
      settleByContract(instance)
    }
  }

  return {
    retryOrFail,

    /** dispatched → running + 起租约（state-machine §3）。 */
    onCreated(session: HostSession): void {
      const instance = store.getBySession(session.id)
      if (instance === undefined || instance.status !== 'dispatched') return
      store.transition(instance.id, { status: 'running', lease_until: leaseUntil(), detail: 'session/created' })
    },

    onEvent(session: HostSession, event: { type: string }): void {
      const instance = store.getBySession(session.id)
      if (instance === undefined) return
      if (event.type === 'turn/end') {
        settleBySessionId(session.id, 'turn/end')
        return
      }
      // 心跳语义（§4）：该会话任何事件即续租。
      markActivity(instance)
    },

    /** 会话结束 → 三查判定（§10：disposed 只是移出内存 store，日志仍在）。 */
    onDisposed(session: HostSession): void {
      settleBySessionId(session.id, 'session/disposed')
    },

    /** tick 兜底（重启后事件可能丢失，轮询只作兜底，§10）：宽限 / 租约 / unknown 超时。 */
    sweep(): void {
      const now = Date.now()
      for (const instance of store.listByStatus(['dispatched'])) {
        const dispatchedAtMs = Date.parse(instance.dispatched_at ?? instance.updated_at)
        if (now > dispatchedAtMs + options.dispatchGraceMs) {
          retryOrFail(instance, 'dispatch-grace-exceeded')
        }
      }
      for (const instance of store.listByStatus(['running'])) {
        if (instance.lease_until !== null && now > Date.parse(instance.lease_until)) {
          // 租约超时回收（§3）：会话可能仍在跑，不归档；走重试判定。
          store.appendEvent(instance.id, 'session_event', { type: 'lease-expired' })
          retryOrFail(instance, 'lease-expired')
        }
      }
      for (const instance of store.listByStatus(['unknown'])) {
        const deadAt = Date.parse(instance.updated_at) + options.unknownGraceMs + 2 * options.leaseMs
        if (now > deadAt) retryOrFail(instance, 'unknown-dead')
      }
    },
  }
}
