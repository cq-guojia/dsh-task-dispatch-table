// scheduler.ts — 派发循环（决策 31 懒建行 + 决策 41 两层循环彻底解耦）。
//
// Loop A（本文件 dispatchNewSlots）只管「写执行记录」：
//   每 tick 只判「现在这一刻该不该跑」——取满足 scheduled_at <= now <= scheduled_at + window
//   且无实例行的「最晚」刻度；依赖 / 工作区不过 ⇒ 只记 task_log、不建行；过了 ⇒ 把要执行的
//   任务连同**派发快照**（决策 41）以 dispatched 落库，**落库即止**——不发动会话、不解析模型。
//   `enabled` 只在这里起作用（挡新行）；已落库实例由 Loop B 收口，与本循环无关。
// Loop B（reconcile.ts sweep）：只读执行记录 + 快照——发动执行 / 失败重试 / 追问 /
//   契约回收 / 重试行重派（窗口内转 dispatched 并发动、窗口外删行记日志），全程不读任务表。
import { randomUUID } from 'node:crypto'
import { existsSync, readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { attachmentAbsPath, type AssetPaths } from './task-assets.js'
import type { HostContext, HostLogger, HostWorkspace } from './host.js'
import { parseInlineTasks, type TaskDefinition } from './tasks.js'
import { displayNameOf, durationMs, logicalDateOf, onceScheduledAt, scheduledSlotsFor } from './tasks.js'
import type { InstanceSnapshot, ResolvedDependency, TaskInstance, TaskStore, InstanceStatus } from './store.js'
import { parseInstanceSnapshot } from './store.js'
import type { Reconciler } from './reconcile.js'
import type { RuntimeIndex } from './runtime-index.js'
import { resolveWorkspace } from './dispatch.js'
import type { PluginConfig } from './config.js'

export interface Scheduler {
  tick: () => void
  getTasks: () => Map<string, TaskDefinition>
  /** 启动诊断（决策 31）：报告自上次起到现在的「错过刻度」计数（不补跑、只记日志）。 */
  startupDiagnostics: () => void
}

export type Judgement = 'ready' | 'blocked'

/** 依赖判定结果（决策 33）：`staleNotes` = 复用旧产出的告警，只提示不拦；
 *  `resolved` = 放行时固化的上游实例解析（决策 43），阻塞为空数组。 */
export interface DependencyVerdict {
  ready: boolean
  staleNotes: string[]
  resolved: ResolvedDependency[]
  /** 阻塞原因（2026-09-30）：放行时无；用于把日志分成 dep_blocked / dep_disabled / dep_missing。 */
  reason?: 'upstream-not-succeeded' | 'upstream-disabled' | 'upstream-missing'
}

/** 阻塞原因 → task_log 的 kind 与文案（用户一眼能分清「没跑成」和「永远不会跑」）。 */
const BLOCK_KIND: Record<string, { kind: string; message: string }> = {
  'upstream-not-succeeded': { kind: 'dep_blocked', message: '被依赖卡住，等待上游成功（下轮再判）' },
  'upstream-disabled': { kind: 'dep_disabled', message: '上游任务已停用，永远不会放行（除非启用上游或移除该前置）' },
  'upstream-missing': { kind: 'dep_missing', message: '上游任务已不存在（被删除），永远不会放行（除非移除该前置）' },
}

// 串行互斥只认**真正在飞**的状态（决策 8：同任务不并发）。
// 不含 'unknown'：unknown 只由重启扫描产生（会话句柄已随进程消失、不定态），它应在 sweep 里
// 被快速收口为终态；若还把它当「在飞」参与互斥，会在老库卡死的孤儿实例上把同任务永久挡死
// （本次真机 bug：老库一条卡 running 的历史实例 → 重启转 unknown → 同 cron 任务再也写不出新行）。
const IN_FLIGHT_STATUSES: InstanceStatus[] = ['dispatched', 'running']

// ── 调度输入加载（inline JSON 或目录，按配置择一）──
function loadTasks(logger: HostLogger, config: PluginConfig, includeDisabled = false): TaskDefinition[] {
  if (config.tasksInline.trim() !== '') {
    const parsed = parseInlineTasks(logger, config.tasksInline, { includeDisabled })
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

/**
 * 上游实例 → 已解析依赖（决策 43）：固化 id / 计划时刻 / 会话 / 上游工作区 / 产出。
 * 产出取上游实例的 `outputs` 列（回执声明并经 checkReceipt 校验的 JSON 数组，决策 32 修订）；
 * 旧行 / 坏 JSON / 未声明 ⇒ 空数组（消息里如实写「未声明产出」）。
 */
function resolvedOf(dep: { task: string; semantics: 'same_period' | 'latest_success' }, upstream: TaskInstance): ResolvedDependency {
  let outputs: string[] = []
  try {
    const parsed: unknown = upstream.outputs === null ? undefined : JSON.parse(upstream.outputs)
    if (Array.isArray(parsed)) outputs = parsed.filter((x): x is string => typeof x === 'string')
  } catch { /* 旧行 / 异常 ⇒ 视为未声明 */ }
  const upstreamSnap = parseInstanceSnapshot(upstream.snapshot)
  return {
    task: dep.task,
    semantics: dep.semantics,
    instanceId: upstream.id,
    scheduledAt: upstream.scheduled_at,
    sessionId: upstream.session_id,
    workspacePath: upstreamSnap?.workspacePath ?? null,
    outputs,
  }
}

// ── 依赖判定（决策 8/9）：同周期 / 最近成功。只查已存在的实例（无行即视为缺失）。──
export function judgeDependencies(
  store: TaskStore,
  task: TaskDefinition,
  logicalDate: string,
  scheduledAt: string,
  /**
   * 上游任务定义表（可选）：给了就能区分「上游还没成功 / 上游停用 / 上游已删除」三种阻塞，
   * 日志里不再混成一句 dep_blocked（2026-09-30 评审 P4）。
   */
  upstreams?: ReadonlyMap<string, TaskDefinition>,
): DependencyVerdict {
  const deps = task.depends_on
  if (!deps || deps.length === 0) return { ready: true, staleNotes: [], resolved: [] }
  const staleNotes: string[] = []
  const resolved: ResolvedDependency[] = []
  // 「复用旧产出」告警判据：下游上次执行时刻（首次运行无 ⇒ 不告警）。只提示，不拦。
  const lastRun = store.getLatestInstance(task.id)
  const lastRunMs = lastRun === undefined ? undefined : Date.parse(lastRun.scheduled_at)
  for (const dep of deps) {
    // 阻塞原因先按「上游定义还在不在 / 开没开」定性，再看实例状态。
    if (upstreams !== undefined) {
      const upstreamDef = upstreams.get(dep.task)
      if (upstreamDef === undefined) return { ready: false, staleNotes, resolved: [], reason: 'upstream-missing' }
      if (upstreamDef.enabled === false) return { ready: false, staleNotes, resolved: [], reason: 'upstream-disabled' }
    }
    if (dep.semantics === 'same_period') {
      // 同周期：同 logical_date 取最新一条，必须 succeeded（决策 33 #2）
      const upstream = store.getSamePeriod(dep.task, logicalDate)
      if (upstream === undefined || upstream.status !== 'succeeded') {
        return { ready: false, staleNotes, resolved: [], reason: 'upstream-not-succeeded' }
      }
      // 决策 43：命中即固化——写库那一刻是哪条上游实例放的行，就此定死
      resolved.push(resolvedOf(dep, upstream))
      continue
    }
    // latest_success（决策 33）：上游**最近一条**（不分状态）必须正好是 succeeded；
    // 在跑 / 失败 / 无记录 ⇒ 阻塞，绝不拿更早的旧成功放行。
    const latest = store.getLatestInstance(dep.task)
    if (latest === undefined || latest.status !== 'succeeded') {
      return { ready: false, staleNotes, resolved: [], reason: 'upstream-not-succeeded' }
    }
    const upstreamMs = Date.parse(latest.scheduled_at)
    // 上游这份成功不晚于下游上次执行 ⇒ 下游上次跑时它已存在 ⇒ 复用旧产出，告警
    if (lastRunMs !== undefined && upstreamMs <= lastRunMs) {
      staleNotes.push(`上游 ${dep.task} 无新产出，本次复用 ${latest.scheduled_at} 的旧产出`)
    }
    resolved.push(resolvedOf(dep, latest))
  }
  return { ready: true, staleNotes, resolved }
}

function isOnce(task: TaskDefinition): boolean {
  return task.schedule.once !== undefined
}
// 原先这里有个本地口径的 `onceDate`（`new Date(task.schedule.once)` = **宿主本地时区**），
// 2026-09-30 二轮评审确认它三处都会与「按任务 timezone」的 `onceScheduledAt` 分歧 ⇒ **整删**，
// 一次性时刻一律走 `onceScheduledAt`（派发 / 面板 / 过期记录 / 启动诊断同口径）。

/** 取「当前该跑的那一下」：最晚满足 scheduled_at <= now <= scheduled_at+window 且无实例行的刻度。 */
function dueSlot(task: TaskDefinition, nowMs: number, store: TaskStore): {
  logicalDate: string
  scheduledAtIso: string
  /**
   * 紧邻的**前一槽**（决策 54 补记「未执行」用）= 窗口内第二晚的刻度。
   * 判据意义：窗口里已经出现**更晚**的刻度 ⇒ 调度器再也不会选前一个 ⇒ 它彻底没戏了。
   */
  previous?: Date
} | undefined {
  let chosen: Date | undefined
  let previous: Date | undefined
  if (isOnce(task)) {
    // 一次性任务**同样受窗口约束**（用户 2026-09-30 拍板 A）：`到期时刻 + window` 之内还算数（迟到也补跑），
    // 出了窗口就当**过期不跑**。此前这里完全不看窗口 ⇒ 面板已经显示「没有下次了」，调度器却仍会派发
    // （两侧口径分裂）。window 解析失败 ⇒ 0 ⇒ 只有「正好那一刻」算数，绝不无限期补跑。
    // ⚠️ 必须用 `onceScheduledAt`（**按 `schedule.timezone` 的墙上时间**解释，2026-09-30 修）：此前用
    // 本地 `onceDate` 解读 ⇒ 任务时区与宿主本地不一致时（宿主 UTC+8、任务写 UTC 之类）「到点 / 过期」
    // 整体偏掉一个时差，而面板走的是时区正确那条路 ⇒ 两侧对同一任务给出不同结论。
    const onceStr = task.schedule.once ?? ''
    const od = onceScheduledAt(task, onceStr.slice(0, 10))
    if (od !== undefined && od.getTime() <= nowMs) {
      let windowMs = 0
      try { windowMs = durationMs(task.schedule.window) } catch { windowMs = 0 }
      if (nowMs <= od.getTime() + windowMs) chosen = od
    }
  } else {
    const windowMs = durationMs(task.schedule.window)
    const from = new Date(nowMs - windowMs)
    const to = new Date(nowMs + 1000) // 容差 1s
    try {
      // 升序遍历：每次选中更晚的刻度时，被顶掉的那一个就是「前一槽」。
      for (const s of scheduledSlotsFor(task, from, to)) {
        if (s.getTime() > nowMs) continue
        if (chosen === undefined || s.getTime() > chosen.getTime()) { previous = chosen; chosen = s }
      }
    } catch {
      return undefined
    }
  }
  if (chosen === undefined) return undefined
  const iso = chosen.toISOString()
  if (store.findBySlot(task.id, iso) !== undefined) return undefined // 已有实例（幂等/此前已处理）
  // 窗口里只有一条刻度（间隔 > 窗口，如日更 + PT4H）⇒ 前一槽在窗口之外，单独**有界回溯**一次。
  // 只在「窗口内 ≤1 条」时才走这条路 ⇒ 稀疏任务才付这个成本，分钟级任务不会。
  if (previous === undefined && !isOnce(task)) {
    const lookbackMs = Math.max(durationMs(task.schedule.window) * 2, 8 * 86_400_000)
    try {
      const earlier = scheduledSlotsFor(task, new Date(chosen.getTime() - lookbackMs), new Date(chosen.getTime() + 1000))
      const last = earlier[earlier.length - 1]
      if (last !== undefined && last.getTime() < chosen.getTime()) previous = last
    } catch { /* 回溯失败 ⇒ 当作没有前一槽，不补记（绝不猜） */ }
  }
  return { logicalDate: logicalDateOf(chosen, task.schedule.timezone), scheduledAtIso: iso, previous }
}

/**
 * 阻塞日志（2026-09-30 改为**结论变化才记**）：同一任务 + 同一结论只记一次，
 * 一直卡着不再重复写（旧行为 5 分钟一条 ⇒ 一天 288 条，会把日志淹掉）。
 * 放行时调用方 `delete` 掉该任务的签名 ⇒ 下次再卡住能重新记一条。
 */
function logBlocked(
  verdictLog: Map<string, string>,
  store: TaskStore,
  taskId: string,
  scheduledAt: string,
  reason: string | undefined,
): void {
  const fallback = { kind: 'dep_blocked', message: '被依赖卡住，等待上游成功（下轮再判）' }
  const mapped = reason === undefined ? fallback : (BLOCK_KIND[reason] ?? fallback)
  if (verdictLog.get(taskId) === mapped.kind) return
  verdictLog.set(taskId, mapped.kind)
  store.appendLog({ taskId, scheduledAt, level: 'info', kind: mapped.kind, message: mapped.message })
}

/**
 * **任务级错误 ⇒ 当场写一条执行记录**（用户 2026-09-30 拍板，纠正我此前「等下一刻度再补记」的说法）。
 *
 * 用户的分层口径（与「延期」严格分开，按**谁的责任**分）：
 * - **前置没跑完 / 上一轮还在跑 / 服务停机** ⇒ **延期**：等得起、会自愈 ⇒ **不写行**（只上徽标 + 日志）；
 * - **附件找不到 / 工作区不存在** ⇒ **任务级错误**：不修就永远跑不了 ⇒ **当场写行**（卡片立刻红）。
 *
 * 判定的先后正是用户说的顺序：**先判前置**（被挡住 ⇒ 延期，根本走不到这里），
 * **前置过了才判工作区 / 附件**（错 ⇒ 写行）—— 与 `dispatchNewSlots` 里的分支顺序一致。
 *
 * 写法：复用终态 `skipped` + `attempt=0`。**不需要另加「不必重试」字段** —— `skipped` 是终态，
 * 第二个循环只巡检 pending/dispatched/running/unknown（`NON_TERMINAL_STATUSES`）⇒ **天然不重试**。
 * 主键用**本槽自己的时刻**；同一槽被多轮 tick 看到由 `UNIQUE(task_id, scheduled_at)` + `OR IGNORE` 幂等。
 * 原因挂在该行的事件上（实例行没有文案列）⇒ 执行记录展开即可看到「为什么没跑」。
 */
function recordTaskError(
  store: TaskStore,
  runtime: RuntimeIndex | null,
  task: TaskDefinition,
  slot: { logicalDate: string; scheduledAtIso: string },
  detail: string,
): void {
  const instanceId = randomUUID()
  // **原子**（2026-09-30 复核 P2）：行 + 原因事件**要么都在、要么都不在** —— 此前是两步独立写库，
  // 中途被杀会留下「执行记录里有这条 skipped、展开却看不到为什么」的半截记录。
  const written = store.transaction(() => {
    if (!store.ensureSkipped(instanceId, task.id, slot.logicalDate, slot.scheduledAtIso)) return false
    store.appendEvent(instanceId, 'task-error', { scheduledAt: slot.scheduledAtIso, reason: detail })
    return true
  })
  // ⚠️ 内存运行态**放在事务外**：事务里改了内存而库又回滚 ⇒ 两边不一致；放外面语义也更清楚
  //（库提交成功了才认这条记录）。
  if (written) runtime?.markTerminal(task.id, 'skipped', slot.scheduledAtIso, new Date().toISOString())
}

/**
 * **一次性任务的「过期未执行」记录**（用户 2026-09-30 拍板 A 的配套）。
 *
 * 一次性任务加了窗口闸门（`dueSlot`）之后「出窗口就再也不跑」；若那一槽从来没跑过（典型：那一刻它
 * 被上游堵着 / 附件缺失，一直拖到窗口过完），它会**无声无息地消失** —— 面板显示「没有下次了」、
 * 执行记录里一条都没有。这里补一条终态 `skipped`（`attempt=0` ⇒ 天然不重试），把「该跑没跑、而且
 * 再也不会跑」**留在用户看得见的地方**：卡片标红 + 执行记录一条 + 原因挂在该行事件上。
 *
 * 门禁与「补记前一个槽」**完全一致**（`gateMs` = 本进程启动 / 任务创建 的较晚者）：**停机期间**跨过
 * 那一刻的不补（用户口径：服务没跑的那段时间不用管），否则用户新建一个「上一刻已过期」的一次性任务
 * 会被凭空标红。返回「本槽是否按过期处理」（调用方据此决定要不要清掉悬浮原因）。
 */
export function recordExpiredOnce(
  store: TaskStore,
  runtime: RuntimeIndex | null,
  task: TaskDefinition,
  nowMs: number,
  gateMs: number,
): boolean {
  const onceStr = task.schedule.once
  if (onceStr === undefined) return false
  const once = onceScheduledAt(task, onceStr.slice(0, 10)) // 与 `dueSlot` / 面板同口径（按任务时区）
  if (once === undefined) return false
  const onceMs = once.getTime()
  let windowMs = 0
  try { windowMs = durationMs(task.schedule.window) } catch { windowMs = 0 }
  // 门禁（2026-09-30 二轮评审修正）：只跳过「**整个窗口都在本进程启动之前**」的槽 —— 那就是停机期间
  // 错过的（用户口径：服务没跑的那段时间不用管）。若本进程**在窗口内接管过**它、却一直没跑成
  //（被上游堵 / 附件缺失），出窗时必须留痕，所以判据是 `once + window < gateMs`，**不是** `once < gateMs`
  //（后者会把「窗口内重启后被堵到出窗」这种**能跑没跑成**的情况静默漏记）。
  if (onceMs > nowMs || onceMs + windowMs < gateMs) return false
  if (nowMs <= onceMs + windowMs) return false // 还在窗口内 ⇒ 下一步会派发，不算「过期」
  const iso = once.toISOString()
  const detail = '一次性任务已过期未执行（超过补跑窗口）'
  const existing = store.findBySlot(task.id, iso)
  if (existing !== undefined) {
    // 已经有行：是本函数写的那条 ⇒ 继续保留悬浮原因（移上去能看见为什么）；真跑过 ⇒ 不打扰。
    if (existing.status === 'skipped') { runtime?.markBlocked(task.id, detail); return true }
    return false
  }
  const instanceId = randomUUID()
  const recorded = store.transaction(() => {
    if (!store.ensureSkipped(instanceId, task.id, logicalDateOf(once, task.schedule.timezone), iso)) return false
    store.appendEvent(instanceId, 'expired-once', { scheduledAt: iso, reason: detail })
    store.appendLog({ taskId: task.id, scheduledAt: iso, level: 'error', kind: 'expired-once', message: detail })
    return true
  })
  if (!recorded) return false
  runtime?.markTerminal(task.id, 'skipped', iso, new Date().toISOString())
  runtime?.markBlocked(task.id, detail) // 悬浮看得见原因（卡片已红 + 执行记录里有一条）
  return true
}

/**
 * 附加文件存在性校验（2026-09-30）：返回**缺失**的展示名。
 * upload 型按任务目录绝对路径；link 型按**附件来源工作区**（item.workspace）解析——
 * 附件可以选自任意工作区，拿任务目标工作区的 path 去判会误报（评审 P1#8）。
 * 拿不到基准（资产根未就绪 / 来源工作区不存在）⇒ 跳过不判，**绝不猜**。
 */
export function missingAttachments(
  ctx: HostContext,
  task: TaskDefinition,
  workspacePath: string,
  assets: AssetPaths | null,
): string[] {
  const list = task.attachments
  if (list === undefined || list.length === 0) return []
  const out: string[] = []
  for (const item of list) {
    let abs: string | null = null
    if (item.kind === 'upload') {
      abs = assets === null ? null : attachmentAbsPath(assets, task.id, item.ref)
    } else {
      const source = item.workspace !== undefined && item.workspace.trim() !== '' ? item.workspace : task.target.workspace
      try {
        abs = join(resolveWorkspace(ctx, source).path, item.ref)
      } catch {
        abs = null // 来源工作区不存在 ⇒ 不判（由工作区解析那道预条件另行报错）
      }
    }
    if (abs === null || abs.includes('..')) continue
    if (!existsSync(abs)) out.push(item.name)
  }
  return out
}

// 工作区解析用 dispatch.js 的 resolveWorkspace（Loop A 落库前的前置检查，决策 41：
// Loop B 发动走 resolveWorkspaceByPath——快照里存的是 path）。

/** 派发快照组装（决策 41 + 决策 43）：落库时把执行所需字段（含依赖解析）固化进实例行，此后与任务设置无关。 */
function snapshotOf(task: TaskDefinition, workspace: HostWorkspace, resolvedDeps: ResolvedDependency[]): InstanceSnapshot {
  return {
    title: displayNameOf(task),
    prompt: task.target.prompt,
    manual: task.target.manual ?? null,
    workspacePath: workspace.path,
    provider: task.target.provider ?? '',
    model: task.target.model ?? '',
    validStatuses: task.contract.validStatuses.length > 0 ? [...task.contract.validStatuses] : ['ok'],
    // 决策 48/49：goal / agentTeam 随快照固化（此前 goal 漏快照 = goal:false 不生效的缺陷，一并修）。
    goal: task.target.goal !== false,
    agentTeam: task.target.agentTeam === true,
    permission: task.target.permission ?? 'default',
    maxAttempts: task.retry.maxAttempts,
    window: task.schedule.window,
    resolvedDeps,
    // 2026-09-30：附件清单随快照冻结 ⇒ Loop B 校验「附件还在不在」不必回头读任务定义
    // （决策 41：Loop B 只读快照）。
    attachments: (task.attachments ?? []).map(item => ({
      name: item.name,
      kind: item.kind,
      ref: item.ref,
      ...(item.workspace === undefined ? {} : { workspace: item.workspace }),
    })),
  }
}

function dispatchNewSlots(
  ctx: HostContext,
  logger: HostLogger,
  store: TaskStore,
  tasks: TaskDefinition[],
  verdictLog: Map<string, string>,
  upstreams: ReadonlyMap<string, TaskDefinition>,
  assets: AssetPaths | null,
  /** 主界面运行态内存索引（2026-09-30）：落库即顺手标记「运行中」，不额外查库。 */
  runtime: RuntimeIndex | null,
  /** 本进程启动时刻（决策 54）：补记「未执行」只补**启动之后**的槽 ⇒ 停机期间漏的不补。 */
  startedAtMs: number,
): void {
  const nowMs = Date.now()
  for (const task of tasks) {
    // 停用 ⇒ **顺手清掉「被挡住」的原因**（2026-09-30 复核 P1）：否则一张**已关掉**的卡片悬停时
    // 还在喊「工作区未找到…｜已过计划时刻但还没开始执行」—— 它根本没在等。
    if (task.enabled === false) { runtime?.markBlocked(task.id, null); continue }
    // 串行语义（§8）：同任务已有在飞实例则跳过本次新槽
    if (store.listByStatus(IN_FLIGHT_STATUSES).some((o) => o.task_id === task.id)) continue
    // 门禁（2026-09-30 评审 P0）：不补「本进程启动之前」**以及「任务创建之前」**的槽；一次性任务的
    // 「过期未执行」记录**共用同一道门禁**。少了后半句就会：宿主已跑了一天，用户 10:03 新建一个每 10
    // 分钟的任务（默认 window PT4H）⇒ 第一个 tick 就把 09:50 补成「未执行」，卡片立刻标红（假记录）。
    // ⚠️ 提到 `dueSlot` 之前：下面「无到期槽」那个分支也要用它（一次性任务的过期记录）。
    const createdMs = task.createdAt === undefined ? Number.NEGATIVE_INFINITY : Date.parse(task.createdAt)
    const gateMs = Math.max(startedAtMs, Number.isFinite(createdMs) ? createdMs : Number.NEGATIVE_INFINITY)
    const slot = dueSlot(task, nowMs, store)
    // 本 tick 无到期槽（没到点 / 已处理 / **窗口已过**）⇒ 清掉「被挡住」的原因：出窗后卡片会转成
    // 「下一次执行」的倒计时，留着旧原因就变成「倒计时 + 延期说明」自相矛盾（2026-09-30 复核 P1）。
    // **例外**：一次性任务过期是「再也不会跑」⇒ 补一条「过期未执行」的记录（用户拍板 A 的配套，
    // 否则它会无声无息地消失），并保留悬浮原因。
    if (slot === undefined) {
      if (!recordExpiredOnce(store, runtime, task, nowMs, gateMs)) runtime?.markBlocked(task.id, null)
      continue
    }
    // 补记「未执行」（决策 54，用户拍板）：**等到下一个该执行的时刻**才判——紧邻的前一槽若始终没有
    // 实例行，说明它彻底没戏了（窗口里已经出现更晚的刻度 ⇒ 调度器再也不会选它），补记**一条** `skipped`。
    // 规则：只补紧邻那一条（中间漏掉的 N 条不补）；停机期间不补（`startedAtMs` 门禁）；once 不适用。
    // ⚠️ 主键必须用**被漏那一槽自己的时刻**：用当前槽会撞当前槽真实执行行的唯一键，
    // `INSERT OR IGNORE` 静默丢弃 ⇒ 任务永久不再执行。
    if (slot.previous !== undefined && !isOnce(task) && slot.previous.getTime() >= gateMs) {
      const prevIso = slot.previous.toISOString()
      if (store.findBySlot(task.id, prevIso) === undefined) {
        const missedId = randomUUID()
        const prevLogical = logicalDateOf(slot.previous, task.schedule.timezone)
        // 原因取「本轮该任务上一次记录的阻塞结论」（签名表）——现成文案复用 BLOCK_KIND，认不出就如实说。
        const signature = verdictLog.get(task.id)
        const detail = signature === undefined
          ? '上一刻度未执行（该轮未记录到原因）'
          : (BLOCK_KIND[signature]?.message ?? `上一刻度未执行（${signature}）`)
        // **原子**（2026-09-30 复核 P2）：行 + 事件 + 诊断日志**一次提交**，中途被杀不会只剩半截。
        const recorded = store.transaction(() => {
          if (!store.ensureSkipped(missedId, task.id, prevLogical, prevIso)) return false
          store.appendEvent(missedId, 'missed-slot', { scheduledAt: prevIso, reason: detail })
          store.appendLog({
            taskId: task.id,
            scheduledAt: prevIso,
            level: 'error',
            kind: 'missed-slot',
            message: `上一刻度未执行，已补记一条记录：${detail}`,
          })
          return true
        })
        // 内存运行态顺手更新（否则卡片要等重启 rebuild 才显示这条）——**放事务外**，提交成功才认。
        if (recorded) runtime?.markTerminal(task.id, 'skipped', prevIso, new Date().toISOString())
      }
    }
    // 同步预条件：依赖 + 工作区（不过 ⇒ 不建行、记日志）
    const depVerdict = judgeDependencies(store, task, slot.logicalDate, slot.scheduledAtIso, upstreams)
    if (!depVerdict.ready) {
      logBlocked(verdictLog, store, task.id, slot.scheduledAtIso, depVerdict.reason)
      // 顺手把「被什么挡住」透给运行态（决策 54 · P3b：延期悬浮说明要能说出**具体原因**）。
      // 只加展示数据、**不改调度语义**；放行时（下面 verdictLog.delete 处）清空。
      runtime?.markBlocked(task.id, depVerdict.reason === undefined
        ? '被前置任务挡住'
        : (BLOCK_KIND[depVerdict.reason]?.message ?? '被前置任务挡住'))
      continue
    }
    // 复用旧产出：只告警，不拦（决策 33 已知风险）
    for (const note of depVerdict.staleNotes) {
      store.appendLog({ taskId: task.id, scheduledAt: slot.scheduledAtIso, level: 'warn', kind: 'stale-upstream', message: note })
    }
    let workspace: HostWorkspace
    try {
      workspace = resolveWorkspace(ctx, task.target.workspace)
    } catch {
      const workspaceMissing = `工作区未找到：${task.target.workspace}`
      // 任务级错误 ⇒ **当场写一条执行记录**（同附件分支）。日志也收进「结论变化才记」——
      // 2026-09-30 评审 P0：本分支此前**每 tick 一条**、且漏了 markBlocked。
      if (verdictLog.get(task.id) !== 'workspace-missing') {
        verdictLog.set(task.id, 'workspace-missing')
        recordTaskError(store, runtime, task, slot, workspaceMissing)
        store.appendLog({ taskId: task.id, scheduledAt: slot.scheduledAtIso, level: 'error', kind: 'precondition', message: workspaceMissing })
      }
      // 透出原因（决策 54 · P3b）：工作区找不到也是**任务级错误**，用户必须知道是哪一个工作区。
      runtime?.markBlocked(task.id, workspaceMissing)
      continue
    }
    // 附加文件校验（2026-09-30）：缺失 ⇒ **不建行、不执行**，只记 error。
    // 与「预条件不过不建行」同源；且不判 failed——重试也不会自己长出来，白耗重试额度。
    // 日志走「结论变化才记」的同一张签名表，缺着不修就不会每 tick 刷一条。
    const missing = missingAttachments(ctx, task, workspace.path, assets)
    if (missing.length > 0) {
      const detail = `附加文件不存在：${missing.join('、')}`
      if (verdictLog.get(task.id) !== 'attachment-missing') {
        verdictLog.set(task.id, 'attachment-missing')
        // 任务级错误 ⇒ **当场写一条执行记录**（用户 2026-09-30 拍板）。放在「结论变化才记」里，
        // 同一阻塞段只写一次；同一槽被多轮 tick 看到也由唯一键幂等。
        recordTaskError(store, runtime, task, slot, detail)
        store.appendLog({
          taskId: task.id,
          scheduledAt: slot.scheduledAtIso,
          level: 'error',
          kind: 'attachment-missing',
          message: `${detail}（请重新上传或移除该附件）`,
        })
      }
      // 透出原因（决策 54 · P3b）：附件找不到属**任务级错误**，用户必须知道是哪一个文件。
      runtime?.markBlocked(task.id, detail)
      continue
    }
    // 全部预条件通过 ⇒ 清掉阻塞 / 缺附件签名，下次再卡住能重新记一条；顺带清掉展示用的阻塞原因。
    verdictLog.delete(task.id)
    runtime?.markBlocked(task.id, null)
    // 懒建行（同步）：直接 dispatched + 派发快照，杜绝提前 pending / 未来预建。
    // 决策 41：**落库即止**——发动执行是 Loop B（reconciler.sweep）的事，本循环到此为止。
    const id = randomUUID()
    if (!store.ensureInstance(id, task.id, slot.logicalDate, slot.scheduledAtIso, 'dispatched', snapshotOf(task, workspace, depVerdict.resolved))) continue // 撞唯一索引（极少）
    // 主界面运行态（内存，非真源）：刚落库 ⇒ 该任务在飞。Loop B 收口时会由 markTerminal 清除。
    runtime?.markDispatched(task.id, slot.scheduledAtIso)
    logger.info(`已落库执行记录 ${id}（任务 ${task.id} · ${slot.scheduledAtIso}），发动由执行循环接管（决策 41）`)
  }
}

export function createScheduler(opts: {
  ctx: HostContext
  logger: HostLogger
  store: TaskStore
  reconciler: Reconciler
  config: () => PluginConfig
  /** 任务文件资产根（附加文件存在性校验用）；未就绪传 null ⇒ 跳过 upload 型校验。 */
  assets?: () => AssetPaths | null
  /** 主界面运行态内存索引（2026-09-30）；未装配则跳过（不影响调度）。 */
  runtime?: RuntimeIndex
}): Scheduler {
  const { ctx, logger, store, reconciler, config, assets, runtime } = opts
  const verdictLog = new Map<string, string>()
  let taskMap = new Map<string, TaskDefinition>()
  /** 进程启动时刻（决策 54）：补记「未执行」的门禁 —— 停机期间漏掉的槽**不补**。 */
  const startedAtMs = Date.now()

  return {
    tick() {
      const cfg = config()
      // 全量（含停用）解析一份 ⇒ 依赖判定才能分清「上游停用」和「上游已删除」
      // （enabled 的 taskMap 里根本没有停用任务，误把停用报成"已删除"，评审 P1#4）。
      const allTasks = loadTasks(logger, cfg, true)
      const tasks = allTasks.filter((t) => t.enabled)
      const upstreams = new Map(allTasks.map((t) => [t.id, t]))
      // 快照（getTasks）必须含停用任务：停用只是「暂不开跑」，仍是合法前置候选
      // （设计约定：设前置不受启停影响）。派发只用 `tasks`（已按 enabled 过滤），
      // 故这里把全量写进 taskMap，让前端前置列表能选到停用任务。
      taskMap = new Map(allTasks.map((t) => [t.id, t]))
      // Loop A：先处理新刻度（懒建行 + 不回看 + 不补跑 + 落库即止，决策 41）
      dispatchNewSlots(ctx, logger, store, tasks, verdictLog, upstreams, assets === undefined ? null : assets(), runtime ?? null, startedAtMs)
      // Loop B：再收口全部执行记录（发动本 tick 新落库的行 + 追问 / 重试 / 租约——
      // 只读执行记录 + 快照，决策 41）。放在 Loop A 之后 = 新行当 tick 即被发动，时延不退化。
      reconciler.sweep()
      // 保留期清除：诊断日志 30 天；执行记录**默认不清**（cfg.historyRetentionDays = 0 ⇒ 直接返回）
      store.purgeLog(cfg.logRetentionDays ?? 30)
      store.purgeHistory(cfg.historyRetentionDays ?? 0)
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
        // 一次性任务**也读它自己的窗口**（2026-09-30 验收评审）：原先这里写死 0 ⇒「窗口内、还没轮到
        // 第一次 tick」的一次性任务会被误报成「错过 1 个刻度（不补跑）」。与 `dueSlot` 同口径：**出窗**才算错过。
        let windowMs = 0
        try { windowMs = durationMs(task.schedule.window) } catch { windowMs = 0 }
        const lookback = Math.max(windowMs, 2 * 3600_000)
        const from = new Date(nowMs - lookback)
        const to = new Date(nowMs - windowMs)
        let missed = 0
        try {
          const slots = isOnce(task)
            // 2026-09-30 二轮评审：这里原先用**宿主本地**的 `onceDate` ⇒ 任务时区与宿主不同时，
            // 启动诊断会把「六小时后才该跑」的一次性任务误报成「错过 1 个刻度」。改用与派发/面板同口径。
            ? ((onceScheduledAt(task, (task.schedule.once ?? '').slice(0, 10))?.getTime() ?? Number.POSITIVE_INFINITY) < nowMs - windowMs
                ? [onceScheduledAt(task, (task.schedule.once ?? '').slice(0, 10))!]
                : [])
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
