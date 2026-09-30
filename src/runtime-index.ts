// runtime-index.ts — 主界面「任务运行态」进程内索引（2026-09-30，design/main-panel-design.md §四）。
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
import { durationMs, nextSlotAfter, titleOf, type TaskDefinition } from './tasks.js'

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
  attachments: Array<{ name: string; kind: 'link' | 'upload' }>
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
  /** 记录 / 清除「这一槽被什么挡住」（决策 54 · P3b：延期悬浮说明用；只展示，不参与调度）。 */
  markBlocked(taskId: string, reason: string | null): void
  /** 实例行被删（窗口外 pending / 附件缺失）⇒ 该任务不再算在飞。 */
  clearRunning(taskId: string): void
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
        entry.nextSlotAt = computeNext(task, nowMs)
      }
      rev++
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
      rev++
    },

    clearRunning(taskId) {
      const entry = entries.get(taskId)
      if (entry === undefined || !entry.running) return
      entry.running = false
      entry.runningSince = null
      rev++
    },

    /**
     * 记录 / 清除「这一槽被什么挡住」（决策 54 · P3b）：Loop A 判阻塞时写人话原因，放行时传 `null` 清。
     * **边沿触发** rev：值真变了才 bump（否则每 tick 都整份重发，`unchanged` 优化报废）。
     * 值变化随下一份完整 overview 送达客户端（`unchanged` 响应不带行）。
     */
    markBlocked(taskId, reason) {
      const entry = entryOf(taskId)
      const next = reason === null || reason === '' ? null : reason
      if ((entry.blockedReason ?? null) === next) return
      entry.blockedReason = next
      rev++
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
          entry.nextSlotAt = computeNext(task, nowMs)
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
          entry.nextSlotAt = computeNext(task, nowMs)
          rev++
        } else if (entry.nextSlotAt !== null && Date.parse(entry.nextSlotAt) <= nowMs) {
          // 刻度已过（时间自然推进）⇒ 就地前移到下一个 —— **但先问一句「这一槽处理了吗」**。
          //
          // 2026-09-30（决策 54）：**少了这道闸门就是排序抖动的根源**——`nextSlotAt` 是客户端的排序键，
          // 读时无脑前移会让它从「刚过去的时刻」直接跳到「+一个间隔」⇒ 卡片在「已启用」组里**掉到后面**；
          // 等 `running` 翻转又**跳回最前**（真机「先掉下去、再砰地跳回来」）。旧办法是客户端本地计时器
          // 「到点钳位」——那套派生状态在轮询卡住时永不解开（真机「5 分钟不动」），**本批只上这道服务端
          // 闸门；客户端那套钳位留待本批后段整删**（闸门生效后它已基本不触发：`justCrossedSlot` 要求
          // 「新刻度在未来」，而冻结后新旧都是同一个过去时刻 ⇒ 判 false）。
          //
          // 判定走**内存水位、不查库**：`runningSince`（在飞那一槽）/ `lastScheduledAt`（最近一条非在飞
          // 行的槽）任一 ≥ 该槽 ⇒ 已处理。**未处理且仍在窗口内 ⇒ 冻结不前移**：键稳定 ⇒ 不抖；且它是
          // **过去时刻**，在该组「按 nextSlotAt 升序」里**自然排最前**（「到点还没跑」本来就该在最前）。
          // 出窗口（`now > 槽 + window`）⇒ 调度器再也不会选它 ⇒ 按已处理对待。
          // 上界论证：冻结持续 ⟺ `¬handled ∧ now ≤ 槽 + window` ⇒ **最长一个 window**，不会永久停滞。
          const slotMs = Date.parse(entry.nextSlotAt)
          const watermarks = [entry.runningSince, entry.lastScheduledAt]
            .map(iso => (iso === null ? Number.NEGATIVE_INFINITY : Date.parse(iso)))
            .filter(ms => Number.isFinite(ms))
          const handled = watermarks.some(ms => ms >= slotMs)
          // window 防御取值（对齐本文件 overview「畸形定义也不能让它崩」的约定）：解析失败 ⇒ 0
          // ⇒ 视作「无窗口」⇒ 闸门必然放行（退回旧的「过期即前移」行为，绝不永久冻结）。
          // 注：schema 允许 `PT` / `PT0S`（正则各组可选）⇒ 0 是**可达**的合法输入。
          let windowMs = 0
          try { windowMs = durationMs(task.schedule.window) } catch { windowMs = 0 }
          if (handled || nowMs > slotMs + windowMs) {
            // once 且已处理 / 已出窗口 ⇒ **没有下次了**：`nextSlotAfter` 对 once 恒返回那个过去时刻，
            // 不前移成 null 就会永远钉在组 1 最前、永远显示「即将执行」。
            const next = task.schedule.once !== undefined ? null : computeNext(task, nowMs)
            if (next !== entry.nextSlotAt) {
              entry.nextSlotAt = next
              rev++
            }
          }
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
