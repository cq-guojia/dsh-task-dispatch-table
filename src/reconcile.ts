// 事件驱动对账（state-machine §1 判定树 + §3 转移表）：session/created → running+租约；
// turn/end 与 session/disposed → 查回执收敛；tick 兜底扫描由 sweep() 提供。
// 回执机制（决策 19 + 24）：agent 经插件注册的工具（见 receipt.ts 的 RECEIPT_TOOL_NAME）写 task_events 的 receipt 事件，
// 对账只查库不读文件；跑完信号后无回执 → 宽限 → 追问×2 → 按失败收敛。
import { existsSync, statSync } from 'node:fs'
import { randomUUID } from 'node:crypto'
import { resolve } from 'node:path'
import type { HostContext, HostLogger, HostSession } from './host.js'
import type { TaskDefinition } from './tasks.js'
import { durationMs } from './tasks.js'
import { resolveWorkspace, userNotice } from './dispatch.js'
import type { AgentHandle } from './dispatch.js'
import { receiptInstruction } from './receipt.js'
import type { TaskStore, TaskInstance } from './store.js'

export interface ReconcileOptions {
  leaseMs: number
  dispatchGraceMs: number
  unknownGraceMs: number
  /** 当前任务表（scheduler 每 tick 刷新）。 */
  tasks(): Map<string, TaskDefinition>
}

/** 跑完信号后允许补交回执的追问上限（写死不加配置，事件表可查次数）。 */
const NUDGE_LIMIT = 2

export interface Reconciler {
  /** 派发成功后登记 agent handle（决策 19：超时追问用），终态/重试时自动遗忘。 */
  registerHandle(sessionId: string, handle: AgentHandle): void
  onCreated(session: HostSession): void
  onEvent(session: HostSession, event: { type: string }): void
  onDisposed(session: HostSession): void
  /** 派发异常等场景的重试判定入口（§6）。 */
  retryOrFail(instance: TaskInstance, reason: string, detail?: unknown): void
  sweep(): void
}

export interface ReconcilerDeps {
  ctx: HostContext
  /** tee logger（显式传参——ctx 不可包装，见 host.ts HostLogger 注释）。 */
  logger: HostLogger
  store: TaskStore
  options: ReconcileOptions
}

interface ReceiptPayload {
  status?: unknown
  outputs?: unknown
  note?: unknown
  session_id?: unknown
}

/**
 * 回执裁决（决策 19，替代旧契约文件三查）：
 * receipt 事件存在 + status ∈ validStatuses + outputs 逐一存在且 mtime 晚于本次派发。
 * outputs 验证沿用「防旧产物冒充」语义；status 必须如实（agent 自报不可信，决策 11）。
 */
export function checkReceipt(
  task: TaskDefinition,
  workspacePath: string,
  dispatchedAtMs: number,
  receipt: { ts: string; detail: string | null } | undefined,
): { ok: boolean; reason?: string; detail?: unknown } {
  if (receipt === undefined) return { ok: false, reason: 'receipt-missing' }
  let payload: ReceiptPayload
  try {
    payload = JSON.parse(receipt.detail ?? '{}') as ReceiptPayload
  } catch (error) {
    return { ok: false, reason: 'receipt-unreadable', detail: String(error) }
  }
  if (typeof payload.status !== 'string' || !task.contract.validStatuses.includes(payload.status)) {
    return {
      ok: false,
      reason: 'receipt-status-invalid',
      detail: { status: payload.status, validStatuses: task.contract.validStatuses },
    }
  }
  const outputs = Array.isArray(payload.outputs) ? payload.outputs.filter((item): item is string => typeof item === 'string') : []
  for (const output of outputs) {
    const outputPath = resolve(workspacePath, output)
    if (!existsSync(outputPath)) return { ok: false, reason: 'output-missing', detail: { output } }
    if (statSync(outputPath).mtimeMs <= dispatchedAtMs) {
      return { ok: false, reason: 'output-stale', detail: { output, dispatchedAtMs } }
    }
  }
  return { ok: true, detail: payload }
}

export function createReconciler({ ctx, logger, store, options }: ReconcilerDeps): Reconciler {
  const handles = new Map<string, AgentHandle>()

  const windowDeadline = (instance: TaskInstance): number =>
    Date.parse(instance.scheduled_at) + durationMs(taskOf(instance)?.schedule.window ?? 'PT0S')

  function taskOf(instance: TaskInstance): TaskDefinition | undefined {
    return options.tasks().get(instance.task_id)
  }

  function registerHandle(sessionId: string, handle: AgentHandle): void {
    handles.set(sessionId, handle)
  }

  function forgetHandle(sessionId: string | null): void {
    if (sessionId !== null) handles.delete(sessionId)
  }

  function finishTerminal(instance: TaskInstance, status: 'succeeded' | 'failed', reason: string, detail?: unknown): void {
    store.transition(instance.id, { status, finished_at: new Date().toISOString(), detail: reason })
    if (detail !== undefined) store.appendEvent(instance.id, 'receipt_check', { reason, detail })
    forgetHandle(instance.session_id)
    // 会话已结束（turn/end / disposed 触发的收敛）→ 归档；租约误判的回收不归档。
    if (instance.session_id !== null) void ctx.workspaceRegistry.archiveSession(instance.session_id).catch((error: unknown) => {
      logger.warn(`归档失败 ${instance.session_id}: ${String(error)}`)
    })
  }

  /** 重试判定（state-machine §6）：attempt+1 < maxAttempts 且未超窗 → 当场回 pending；否则终态 failed。 */
  function retryOrFail(instance: TaskInstance, reason: string, detail?: unknown): void {
    const task = taskOf(instance)
    const overWindow = Date.now() > windowDeadline(instance)
    if (task !== undefined && !overWindow && instance.attempt + 1 < task.retry.maxAttempts) {
      forgetHandle(instance.session_id)
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

  /** 回执收敛（state-machine §1 判定树，决策 19 版）。 */
  function settleByReceipt(instance: TaskInstance): void {
    const task = taskOf(instance)
    if (task === undefined) {
      logger.warn(`实例 ${instance.id} 的任务定义不在当前任务表，暂不收敛`)
      return
    }
    const taskWorkspace = resolveWorkspacePathSafe(task)
    if (taskWorkspace === undefined) return
    const dispatchedAtMs = Date.parse(instance.dispatched_at ?? instance.updated_at)
    const receipt = store.latestReceipt(instance.id, instance.dispatched_at ?? undefined)
    const verdict = checkReceipt(task, taskWorkspace, dispatchedAtMs, receipt)
    if (verdict.ok) {
      finishTerminal(instance, 'succeeded', 'receipt-pass', verdict.detail)
    } else {
      store.appendEvent(instance.id, 'receipt_check', { reason: verdict.reason, detail: verdict.detail })
      retryOrFail(instance, verdict.reason ?? 'receipt-failed', verdict.detail)
    }
  }

  /** 追问（决策 19 第二层）：跑完信号后无回执，对原会话再推一轮、重发回执命令。 */
  function nudge(instance: TaskInstance): void {
    const task = taskOf(instance)
    const handle = instance.session_id !== null ? handles.get(instance.session_id) : undefined
    store.appendEvent(instance.id, 'nudge', { at: new Date().toISOString() })
    if (task === undefined || handle === undefined) {
      // 追问通道不可用（如插件重启后 handle 丢失）→ 直接按失败收敛。
      retryOrFail(instance, 'receipt-missing-no-handle')
      return
    }
    try {
      handle.agent.send(
        userNotice(
          `任务实例 ${instance.id} 已结束但尚未收到回执。请立即按下面说明调用工具提交回执：\n`
          + receiptInstruction(task),
          `[TASK] 回执追问 ${task.id} · ${instance.logical_date}`,
        ),
        'next-turn',
        true,
      )
    } catch (error) {
      logger.warn(`追问发送失败 ${instance.id}: ${String(error)}`)
      retryOrFail(instance, 'nudge-send-failed')
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
      return resolveWorkspace(ctx, task.target.workspace).path
    } catch (error) {
      logger.warn(`任务 ${task.id} 工作区解析失败: ${String(error)}`)
      return undefined
    }
  }

  /** 跑完信号（turn/end 或 disposed）→ 查回执；有则立即裁决，无则等宽限期后由 sweep 追问（§决策 19）。 */
  function settleBySessionId(sessionId: string, signal: string): void {
    const instance = store.getBySession(sessionId)
    if (instance === undefined) return
    if (instance.status === 'dispatched') {
      // session/created 事件同步于 sessions.create 内发出，能进 dispatched 又收到跑完信号
      // 说明 created 对账被跳过（如插件重启恢复），先补 running 语义再判定。
      store.transition(instance.id, { status: 'running', lease_until: leaseUntil(), detail: signal })
    }
    const current = store.get(instance.id)
    if (current === undefined || (current.status !== 'running' && current.status !== 'unknown')) return
    store.appendEvent(current.id, 'session_event', { type: signal })
    if (store.latestReceipt(current.id, current.dispatched_at ?? undefined) !== undefined) {
      settleByReceipt(current)
    }
    // 无回执：不立即判失败——agent 可能只是还没执行提交命令，等 sweep 按宽限期追问。
  }

  return {
    registerHandle,
    retryOrFail,

    /** dispatched → running + 起租约（state-machine §3）。 */
    onCreated(session: HostSession): void {
      const instance = store.getBySession(session.id)
      if (instance === undefined || instance.status !== 'dispatched') return
      store.transition(instance.id, { status: 'running', lease_until: leaseUntil(), detail: 'session/created' })
      // 会话改名（会话列表治理）：Session 对象只能在这里拿——agents.create 自建会话后
      // announce（见 dispatch.ts 文件头），handle 上没有 session。改名失败只告警不影响对账。
      const task = options.tasks().get(instance.task_id)
      if (task !== undefined) {
        try {
          ctx.sessionTitle.rename(session, `[TASK] ${task.id} · ${instance.logical_date}`)
        } catch (error) {
          logger.warn(`会话改名失败 ${session.id}: ${String(error)}`)
        }
      }
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

    /** 会话结束 → 查回执收敛（§10：disposed 只是移出内存 store，日志仍在）。 */
    onDisposed(session: HostSession): void {
      settleBySessionId(session.id, 'session/disposed')
      forgetHandle(session.id)
    },

    /** tick 兜底（重启后事件可能丢失，轮询只作兜底，§10）：宽限 / 回执追问 / 租约 / unknown 超时。 */
    sweep(): void {
      const now = Date.now()
      for (const instance of store.listByStatus(['dispatched'])) {
        const dispatchedAtMs = Date.parse(instance.dispatched_at ?? instance.updated_at)
        if (now > dispatchedAtMs + options.dispatchGraceMs) {
          retryOrFail(instance, 'dispatch-grace-exceeded')
        }
      }
      for (const instance of store.listByStatus(['running'])) {
        const leaseExpired = instance.lease_until !== null && now > Date.parse(instance.lease_until)
        // 决策 19：已收到跑完信号但无回执 → 宽限期后追问，追问 NUDGE_LIMIT 次仍无 → 失败收敛。
        const signalType = parseEventType(store.latestEvent(instance.id, 'session_event')?.detail)
        if (signalType === 'turn/end' || signalType === 'session/disposed') {
          const signalAtMs = Date.parse(store.latestEvent(instance.id, 'session_event')?.ts ?? instance.updated_at)
          if (now > signalAtMs + options.dispatchGraceMs
            && store.latestReceipt(instance.id, instance.dispatched_at ?? undefined) === undefined) {
            if (store.countEvents(instance.id, 'nudge') < NUDGE_LIMIT) {
              nudge(instance)
            } else {
              retryOrFail(instance, 'receipt-missing-after-nudge')
            }
          }
          continue // 会话已跑完，租约不再适用
        }
        if (leaseExpired) {
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

/** 从 session_event 事件的 detail JSON 里取 type（sweep 判定跑完信号用）。 */
function parseEventType(detail: string | null | undefined): string | undefined {
  if (detail === null || detail === undefined) return undefined
  try {
    const parsed: unknown = JSON.parse(detail)
    return typeof (parsed as { type?: unknown })?.type === 'string' ? (parsed as { type: string }).type : undefined
  } catch {
    return undefined
  }
}
