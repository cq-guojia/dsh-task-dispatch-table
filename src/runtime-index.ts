// runtime-index.ts — 主界面「任务运行态」进程内索引（2026-09-30，design/features/main-panel.md §四）。
//
// **为什么有这个文件**：主界面卡片要显示「运行中 / 上次执行 / 下次执行」，但绝不能每 10 秒
// 对每个任务查一次库（100 个任务 × 每 10 秒 = 不可接受）。方案 = 进程内维护一份**派生摘要**：
//   - 启动 / 整批重建：**一条聚合 SQL**（store.lastRunByTask + store.inFlightByTask），不是 N 次；
//   - 运行中：Loop A 落库 dispatched ⇒ markDispatched；Loop B 实例进终态 ⇒ markTerminal（顺手更新，
//     这两处本来就在写那一行，不额外查库）；
//   - 定义变了（排期 / 启停）⇒ 只对那一条重算下一刻度（指纹比对，未变不算）；
//   - 刻度过期（now 越过它）⇒ 只在 overview 组装时就地重算，通常 0 条。
//
// ⚠️ 这是**派生缓存，不是真源**：丢了能从 task_instances 重建，故**不落数据库**（用户 2026-09-30
// 拍板：不引入 task_runtime 派生表）；任务定义本身也绝不迁进数据库（与决策 25 冲突）。
import type { InstanceStatus, TaskStore } from './store.js'
import { durationMs, nextSlotAfter, scheduledSlotsFor, titleOf, type TaskDefinition } from './tasks.js'

/** 一条任务的运行态（派生）。 */
export interface TaskRuntimeEntry {
  taskId: string
  running: boolean
  /** 本次运行开始（该实例的计划时刻）。 */
  runningSince: string | null
  lastStatus: InstanceStatus | null
  lastScheduledAt: string | null
  lastFinishedAt: string | null
  nextSlotAt: string | null
  /**
   * 「这一槽被什么挡住了」的人话原因（决策 54，P3b）：由 Loop A 判定阻塞时顺手写入
   * （`markBlocked`），只为展示；放行时清空。不进 `overviewKeyOf`（运行态，靠显式 rev 边沿）。
   */
  blockedReason?: string | null
  /** 展示指纹（`overviewKeyOf`）：变了 ⇒ rev 自增 ⇒ 客户端必拿到新数据。 */
  overviewKey?: string
  /** 排期指纹（`scheduleKeyOf`）：变了才重算 nextSlotAt。 */
  scheduleKey?: string
}

/** 主界面一行（定义投影 + 运行态），客户端拿它直接渲染卡片（含展开区）。 */
export interface TaskOverviewRow {
  id: string
  title: string
  code: string | null
  enabled: boolean
  workspace: string
  createdAt: string | null
  model: string | null
  retryMax: number
  /** 排期原值（卡片「执行方式」人话由客户端按它生成，服务端不做 i18n）。 */
  schedule: {
    cron: string | null
    once: string | null
    timezone: string | null
    start: string | null
    everyNWeeks: number | null
    window: string
    /**
     * 结构化排期（新建 / 编辑时双写的 `schedule.ui`，2026-09-30 用户拍板）：
     * 卡片的「执行方式」人话与编辑器「预计执行」**同源**（都走 `client/schedule-text.ts`），
     * 不再各处各写一份 ⇒ 老任务为 null，客户端退回从 cron 反解。
     */
    ui: Record<string, unknown> | null
  }
  /** 提示词首段（展开区展示用，服务端截断，不传全文）。 */
  promptHead: string
  /**
   * 附件展示行。`path` / `anchorSessionId` 由 HTTP 层（`attachmentsWithPaths`）补：
   * 绝对路径 + 预览锚点会话；拿不到就不带（前端保持不可点）。
   */
  attachments: Array<{ name: string; kind: 'link' | 'upload'; path?: string; anchorSessionId?: string }>
  depends: Array<{ id: string; title: string; enabled: boolean }>
  running: boolean
  runningSince: string | null
  lastStatus: InstanceStatus | null
  lastScheduledAt: string | null
  lastFinishedAt: string | null
  nextSlotAt: string | null
  /** 「这一槽被什么挡住了」的人话原因（决策 54 · P3b）：客户端在「延期」悬浮说明里补全。 */
  blockedReason?: string | null
}

export interface RuntimeIndex {
  /** 启动 / 定义整批变更后重建（一条聚合 SQL + 逐任务算下一刻度）；`nowMs` 供确定性测试。 */
  rebuild(tasks: readonly TaskDefinition[], store: TaskStore | null, nowMs?: number): void
  /** Loop A 落库 dispatched（scheduler.ts）。 */
  markDispatched(taskId: string, scheduledAt: string): void
  /** Loop B 实例进终态（reconcile.ts）。 */
  markTerminal(taskId: string, status: InstanceStatus, scheduledAt: string, finishedAt: string): void
  /**
   * 记录 / 清除「这一槽被什么挡住」（决策 54 · P3b：延期悬浮说明用；只展示，不参与调度）。
   * **返回「是否真的变了」**（边沿）——调用方据此决定要不要广播；若不给这个信号，事件层只能
   * 无条件发，每个 tick 每任务都会发一条无谓事件（2026-10-06 审计实证）。
   */
  markBlocked(taskId: string, reason: string | null): boolean
  /** 实例行被删（窗口外 pending / 附件缺失）⇒ 该任务不再算在飞。**返回「是否真的变了」**。 */
  clearRunning(taskId: string): boolean
  /**
   * **定义被改动的统一入口**（2026-09-30 抽象统一）：任何写路径改完任务定义后调它一次即可——
   * 重算展示指纹与下一刻度、按需 bump rev。调用方**不需要**再各自去碰内存条目。
   */
  markDefinitionsChanged(tasks: readonly TaskDefinition[]): void
  /** 组装主界面数据（就地重算过期刻度，剔除已删任务的残留）。 */
  overview(tasks: readonly TaskDefinition[], nowMs: number): { rev: number; rows: TaskOverviewRow[] }
  /** 内容版本：客户端带上一次的值做比对，未变即回 unchanged，省掉整份传输。 */
  revision(): number
}

/** 影响「下一刻度」的定义指纹（改了才重算；不动则每轮零成本）。 */
function scheduleKeyOf(task: TaskDefinition): string {
  const s = task.schedule
  return [
    task.enabled ? '1' : '0',
    s.cron ?? '',
    s.once ?? '',
    s.timezone ?? '',
    s.start ?? '',
    s.everyNWeeks === undefined ? '' : String(s.everyNWeeks),
    // ⚠️ `window`（允许延迟）**必须在这里**（2026-10-07 审计 🟡）：它是「该冻还是该前移」与候选槽
    // 搜索的核心输入，改了它 nextSlotAt 就得重算。原先漏了它 ⇒ `overviewKey` 会 bump（界面拿到新行）
    // 但 `nextSlotAt` 仍按**旧 window** 算出来 ⇒ 卡片「下次执行」与调度器实际判定分叉，直到刻度过期才自愈。
    s.window ?? '',
  ].join('|')
}

/**
 * **展示指纹**（2026-09-30 抽象统一）：主界面卡片上**看得见的任何字段**变了 ⇒ 指纹变 ⇒
 * `rev` 自增 ⇒ 客户端下一次轮询必定拿到新数据。
 *
 * ⚠️ 历史 bug：rev 过去只由排期 + 启停驱动（`scheduleKeyOf`），改标题 / 提示词 / 附件 / 工作区
 * 等一律不 bump ⇒ 服务端一直回 `unchanged` ⇒ 界面永远不刷新。现在两个指纹**分工**：
 * - `overviewKeyOf`（本函数）：管 rev —— 覆盖面 = 卡片全部展示字段；
 * - `scheduleKeyOf`：只管「要不要重算 nextSlotAt」—— 覆盖面 = 排期 + 启停（算刻度只依赖这些）。
 */
function overviewKeyOf(task: TaskDefinition): string {
  const s = task.schedule
  return JSON.stringify({
    title: task.title ?? '',
    code: task.code ?? '',
    enabled: task.enabled,
    createdAt: task.createdAt ?? '',
    workspace: task.target.workspace,
    provider: task.target.provider ?? '',
    model: task.target.model ?? '',
    prompt: task.target.prompt,
    schedule: { cron: s.cron ?? '', once: s.once ?? '', timezone: s.timezone ?? '', start: s.start ?? '', everyNWeeks: s.everyNWeeks ?? 0, window: s.window, ui: s.ui ?? null },
    retry: task.retry?.maxAttempts ?? 1,
    attachments: (task.attachments ?? []).map(a => `${a.name}:${a.kind}:${a.ref}`),
    depends: (task.depends_on ?? []).map(d => d.task),
  })
}

/** 提示词首段（按字符截断，中文不按字节切）。 */
const PROMPT_HEAD_CHARS = 120
const headOf = (text: string): string => (text.length <= PROMPT_HEAD_CHARS ? text : `${text.slice(0, PROMPT_HEAD_CHARS)}…`)

export function createRuntimeIndex(): RuntimeIndex {
  const entries = new Map<string, TaskRuntimeEntry>()
  let rev = 1

  const entryOf = (taskId: string): TaskRuntimeEntry => {
    const hit = entries.get(taskId)
    if (hit !== undefined) return hit
    const created: TaskRuntimeEntry = {
      taskId,
      running: false,
      runningSince: null,
      lastStatus: null,
      lastScheduledAt: null,
      lastFinishedAt: null,
      nextSlotAt: null,
    }
    entries.set(taskId, created)
    return created
  }

  /**
   * 单个任务的刻度计算异常（非法 cron 等）不能连累整份列表。
   * 停用任务**没有下次执行时刻** ⇒ 不给刻度（用户 2026-09-30：关掉了还在算几点跑是错的）。
   */
  const computeNext = (task: TaskDefinition, nowMs: number): string | null => {
    if (task.enabled === false) return null
    try {
      const next = nextSlotAfter(task, new Date(nowMs))
      return next === undefined ? null : next.toISOString()
    } catch {
      return null
    }
  }

  /**
   * 窗口内「最晚且已到点」的那一槽（**纯计算、不查库**）：重启 / 改任务之后用来找回「本该被冻住的刻度」。
   * 水位（`runningSince` / `lastScheduledAt`）已由 `rebuild` 的两条聚合 SQL 填好 ⇒ 这里只做 cron 数学。
   * 口径与 `scheduler.dueSlot` 一致（`[now - window, now]` 里取最晚一条）；没有候选（未来才到点 /
   * 停用 / 解析失败）⇒ `null`。
   */
  const latestDueSlotIso = (task: TaskDefinition, nowMs: number): string | null => {
    if (task.enabled === false) return null
    // `once`（决策 18）：那一刻不随窗口前移 ⇒ 直接问 `computeNext`（过去 / 未来都可能拿到）。
    if (task.schedule.once !== undefined) {
      const onceIso = computeNext(task, nowMs)
      if (onceIso === null) return null
      const onceMs = Date.parse(onceIso)
      return Number.isFinite(onceMs) && onceMs <= nowMs ? onceIso : null
    }
    // window 防御取值（对齐本文件「畸形定义也不能让它崩」的约定）：解析失败 ⇒ 0 ⇒ 视作无窗口。
    let windowMs = 0
    try { windowMs = durationMs(task.schedule.window) } catch { windowMs = 0 }
    try {
      let latest: Date | undefined
      for (const s of scheduledSlotsFor(task, new Date(nowMs - windowMs), new Date(nowMs + 1_000))) {
        if (s.getTime() > nowMs) continue
        latest = s
      }
      return latest === undefined ? null : latest.toISOString()
    } catch {
      return null
    }
  }

  /**
   * **「这一槽处理了吗」闸门抽成单点，三处复用**（2026-09-30 复核 P1）。
   *
   * 语义：`entry.nextSlotAt` 若**已到点、尚未处理、且仍在窗口内** ⇒ **冻结**（返回 `true`，刻度不动 ⇒
   * 卡片显示「到点未派发 / 延期」，且它是过去时刻 ⇒ 在该组「按 `nextSlotAt` 升序」里**自然排最前**，
   * 不再需要客户端那套本地「到点钳位」）；否则前移到下一个**未来**刻度（`once` ⇒ `null`），
   * 刻度真变了才 `rev++`（边沿触发，`unchanged` 优化不受影响）。
   *
   * 判定走**内存水位、不查库**：`runningSince`（在飞那一槽）/ `lastScheduledAt`（最近一条非在飞行的槽，
   * **含 pending / skipped / unknown**）任一 ≥ 该槽 ⇒ 已处理。
   *
   * 上界论证（为什么不会永久冻结）：冻结持续 ⟺ `¬handled ∧ now ≤ 槽 + window` ⇒ **最长一个 window**。
   * 少了这道闸门就是**排序抖动的根源**：读时无脑前移会让排序键从「刚过去的时刻」跳到「+一个间隔」
   * ⇒ 卡片在组内掉到后面，等 `running` 翻转又跳回最前（真机「先掉下去、再砰地跳回来」）。
   *
   * 三处调用点差别只在「进来之前 `entry.nextSlotAt` 是什么」：`rebuild` / `markDefinitionsChanged`
   * 先用 `latestDueSlotIso` 找回候选，`overview` 走现值的懒前移。
   */
  const freezeOrAdvance = (entry: ReturnType<typeof entryOf>, task: TaskDefinition, nowMs: number): boolean => {
    const slotIso = entry.nextSlotAt
    if (slotIso === null) return false
    const slotMs = Date.parse(slotIso)
    if (!Number.isFinite(slotMs) || slotMs > nowMs) return false // 还没到点（或刻度坏）⇒ 没有可冻的东西
    const watermarks = [entry.runningSince, entry.lastScheduledAt]
      .map(iso => (iso === null ? Number.NEGATIVE_INFINITY : Date.parse(iso)))
      .filter(ms => Number.isFinite(ms))
    const handled = watermarks.some(ms => ms >= slotMs)
    let windowMs = 0
    try { windowMs = durationMs(task.schedule.window) } catch { windowMs = 0 }
    if (!handled && nowMs <= slotMs + windowMs) return true // 冻结：未处理且仍在窗口内
    // 已处理 / 已出窗口 ⇒ 前移。`once` 且已收尾 ⇒ **没有下次了**（`nextSlotAfter` 对 once 恒返回那个
    // 过去时刻，不置 null 就会永远钉在组 1 最前、永远显示「即将执行」）。
    const next = task.schedule.once !== undefined ? null : computeNext(task, nowMs)
    if (next === entry.nextSlotAt) return false
    entry.nextSlotAt = next
    rev++
    return false
  }


  return {
    rebuild(tasks, store, nowMs = Date.now()) {
      entries.clear()
      if (store !== null) {
        for (const [taskId, last] of store.lastRunByTask()) {
          const entry = entryOf(taskId)
          entry.lastStatus = last.status
          entry.lastScheduledAt = last.scheduledAt
          entry.lastFinishedAt = last.finishedAt
        }
        // 启动时**用库里在飞行的行重建**：这些是重启后的真实孤儿（U1），一次扫描几十行；
        // 真卡死的由 unknown 宽限收口，届时 markTerminal 会把 running 清掉。
        for (const [taskId, since] of store.inFlightByTask()) {
          const entry = entryOf(taskId)
          entry.running = true
          entry.runningSince = since
        }
      }
      for (const task of tasks) {
        const entry = entryOf(task.id)
        entry.overviewKey = overviewKeyOf(task)
        entry.scheduleKey = scheduleKeyOf(task)
        // ⚠️ 2026-09-30 复核 P1：这里原先**无条件**取「下一个未来刻度」⇒ 重启后卡片上「到点未派发 /
        // 延期」会整段消失（与 Loop A 的实际派发不一致）。先纯计算找回「窗口内最晚且已到点」那一槽
        // （水位上面已填好，零新增查询），再交给同一道闸门判「该冻还是该前移」。
        entry.nextSlotAt = latestDueSlotIso(task, nowMs) ?? computeNext(task, nowMs)
        freezeOrAdvance(entry, task, nowMs)
      }
      rev++ // 整批重建一律 bump（闸门内部那次边沿 bump 不必区分）
    },

    markDispatched(taskId, scheduledAt) {
      const entry = entryOf(taskId)
      entry.running = true
      entry.runningSince = entry.runningSince ?? scheduledAt
      // ⚠️ **不覆盖「上次执行」**（用户 2026-09-30）：上次 = 最近一次**出了结果**的执行，
      // 该成功还是成功、该失败还是失败；正在跑的这一趟要等 finishTerminal 出结果后才覆盖。
      rev++
    },

    markTerminal(taskId, status, scheduledAt, finishedAt) {
      const entry = entryOf(taskId)
      entry.running = false
      entry.runningSince = null
      entry.lastStatus = status
      entry.lastScheduledAt = scheduledAt
      entry.lastFinishedAt = finishedAt
      // 终态 ⇒ **这一槽已收尾，不再「被挡住」**（2026-09-30 复核 P1 兜底）。调用顺序安全：
      // `recordTaskError` 内部先写行再 `markTerminal`，而 `markBlocked` 一律排在其后 ⇒ 原因不会被误清。
      entry.blockedReason = null
      rev++
    },

    clearRunning(taskId) {
      const entry = entries.get(taskId)
      if (entry === undefined || !entry.running) return false
      entry.running = false
      entry.runningSince = null
      rev++
      return true
    },

    /**
     * 记录 / 清除「这一槽被什么挡住」（决策 54 · P3b）：Loop A 判阻塞时写人话原因，放行时传 `null` 清。
     * **边沿触发** rev：值真变了才 bump（否则每 tick 都整份重发，`unchanged` 优化报废）。
     * 值变化随下一份完整 overview 送达客户端（`unchanged` 响应不带行）。
     */
    markBlocked(taskId, reason) {
      const entry = entryOf(taskId)
      const next = reason === null || reason === '' ? null : reason
      if ((entry.blockedReason ?? null) === next) return false
      entry.blockedReason = next
      rev++
      return true
    },


    markDefinitionsChanged(tasks) {
      const nowMs = Date.now()
      for (const task of tasks) {
        const entry = entryOf(task.id)
        const overviewKey = overviewKeyOf(task)
        const scheduleKey = scheduleKeyOf(task)
        if (entry.overviewKey !== overviewKey) {
          entry.overviewKey = overviewKey
          rev++
        }
        if (entry.scheduleKey !== scheduleKey) {
          entry.scheduleKey = scheduleKey
          // 改排期 / 启停之后同样先找回「窗口内最晚且已到点」的刻度（新启用的任务往往当场就有该跑的槽），
          // 再交给同一道闸门判「该冻还是该前移」（2026-09-30 复核 P1）。
          entry.nextSlotAt = latestDueSlotIso(task, nowMs) ?? computeNext(task, nowMs)
          freezeOrAdvance(entry, task, nowMs)
          rev++
        }
      }
    },

    overview(tasks, nowMs) {
      const byId = new Map(tasks.map(task => [task.id, task]))
      const rows: TaskOverviewRow[] = []
      for (const task of tasks) {
        const entry = entryOf(task.id)
        // ① 展示指纹变了（标题 / 提示词 / 附件 / 工作区 … 任何看得见的字段）⇒ 必须让客户端拿到新数据。
        const overviewKey = overviewKeyOf(task)
        if (entry.overviewKey !== overviewKey) {
          entry.overviewKey = overviewKey
          rev++
        }
        // ② 排期 / 启停变了 ⇒ 重算下一刻度（用户改完必须立刻看到新时间）。
        const scheduleKey = scheduleKeyOf(task)
        if (entry.scheduleKey !== scheduleKey) {
          entry.scheduleKey = scheduleKey
          entry.nextSlotAt = latestDueSlotIso(task, nowMs) ?? computeNext(task, nowMs)
          freezeOrAdvance(entry, task, nowMs)
          rev++
        } else if (entry.nextSlotAt !== null && Date.parse(entry.nextSlotAt) <= nowMs) {
          // 刻度已过（时间自然推进）⇒ 交给**统一闸门**：未处理且仍在窗口内 ⇒ 冻结不前移（键稳定 ⇒ 不抖，
          // 且它是过去时刻 ⇒ 组内自然排最前）；已处理 / 出窗口 ⇒ 前移（`once` ⇒ `null`）。
          // 判定细节、为什么不查库、以及「少了这道闸门就是排序抖动根源」的完整论证，
          // 全部收在 `freezeOrAdvance` 的文档注释里（三处共用同一份口径，别再就地复刻）。
          freezeOrAdvance(entry, task, nowMs)
        }
        rows.push({
          id: task.id,
          title: titleOf(task),
          code: task.code === undefined || task.code.trim() === '' ? null : task.code.trim(),
          enabled: task.enabled,
          workspace: task.target.workspace,
          createdAt: task.createdAt ?? null,
          model: task.target.model ?? null,
          // 防御取值：overview 是展示面，畸形定义也不能让它崩（zod 有默认值的字段仍按可选读）。
          retryMax: task.retry?.maxAttempts ?? 1,
          schedule: {
            cron: task.schedule.cron ?? null,
            once: task.schedule.once ?? null,
            timezone: task.schedule.timezone ?? null,
            start: task.schedule.start ?? null,
            everyNWeeks: task.schedule.everyNWeeks ?? null,
            // 防御取值：overview 是展示面，畸形定义也不能让它崩（zod 有默认值的字段仍按可选读）。
            window: task.schedule.window ?? 'PT0S',
            ui: task.schedule.ui ?? null,
          },
          promptHead: headOf(task.target.prompt),
          attachments: (task.attachments ?? []).map(item => ({ name: item.name, kind: item.kind })),
          depends: (task.depends_on ?? []).map(dep => {
            const upstream = byId.get(dep.task)
            return {
              id: dep.task,
              title: upstream === undefined ? dep.task : titleOf(upstream),
              enabled: upstream?.enabled ?? false,
            }
          }),
          running: entry.running,
          runningSince: entry.runningSince,
          lastStatus: entry.lastStatus,
          lastScheduledAt: entry.lastScheduledAt,
          lastFinishedAt: entry.lastFinishedAt,
          nextSlotAt: entry.nextSlotAt,
          // 「被什么挡住」（决策 54 · P3b）：客户端只在「延期」悬浮说明里用它补全原因。
          blockedReason: entry.blockedReason ?? null,
        })
      }
      // 已删任务的残留条目：任务表里没了就别再占着内存。
      if (entries.size > byId.size) {
        for (const taskId of [...entries.keys()]) {
          if (byId.has(taskId)) continue
          entries.delete(taskId)
          rev++
        }
      }
      return { rev, rows }
    },

    revision() {
      return rev
    },
  }
}
