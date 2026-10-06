// task-overview.ts — 任务列表（主界面）的**数据层**：一次请求出全部卡片数据 + `rev` 增量 + 看门狗 + 乐观 patch。
//
// **为什么单独成文件**（design/client-refresh-disposition.md §四 W2）：它本来住在 `task-list.tsx`
// （任务列表**页**）里，却被宿主页 `index.ts` 反向 import ⇒ 「别的页面 import 一个页面」。
// 页面只该有视图；取数层属于程序文件（与 `query.ts` / `schedule-text.ts` 并列）。
//
// 刷新时机：挂载 + `refresh()`（由**事件推送**驱动，见 event-subscribe.ts）——**没有定时轮询**
// （原 10s 常开轮询已删，design/client-refresh-disposition.md §二 P2）。
import { useCallback, useEffect, useRef, useState } from 'react'
import { pinMsFor } from '../task-sort.js'

/**
 * 「立即执行」结果（与服务端 `scheduler.ts` 的 RunNowResult 对齐）：业务性拒绝走
 * `ok:false` + 机器码 + 可选参数（工作区名 / 附件名），由卡片侧按 locale 拼人话 Toast
 * （用户 2026-10-03：手动触发看不到后台日志，必须给出「没成功 + 为什么」）。
 */
export type RunNowOutcome =
  | { ok: true }
  | { ok: false; error: string; detail?: string }

/** 与服务端 `runtime-index.ts` 的 TaskOverviewRow 同形（客户端本地声明，不跨半侧引类型）。 */
export interface TaskOverviewRow {
  id: string
  title: string
  code: string | null
  enabled: boolean
  workspace: string
  createdAt: string | null
  model: string | null
  retryMax: number
  schedule: {
    cron: string | null
    once: string | null
    timezone: string | null
    start: string | null
    everyNWeeks: number | null
    window: string
    /** 结构化排期（新建 / 编辑双写）；老任务为 null ⇒ 文案模块退回从 cron 反解。 */
    ui: Record<string, unknown> | null
  }
  promptHead: string
  /** `path` / `anchorSessionId` 由服务端 overview 补（见 src/index.ts `attachmentsWithPaths`）；缺 ⇒ 不可点。 */
  attachments: Array<{ name: string; kind: 'link' | 'upload'; path?: string; anchorSessionId?: string }>
  depends: Array<{ id: string; title: string; enabled: boolean }>
  running: boolean
  runningSince: string | null
  lastStatus: string | null
  lastScheduledAt: string | null
  lastFinishedAt: string | null
  nextSlotAt: string | null
  /** 「这一槽被什么挡住了」的人话原因（决策 54 · P3b）：只在延期时用来补全悬浮说明。 */
  blockedReason?: string | null
}

/**
 * 原轮询间隔（**已不再轮询**，只作为「派发延迟」公式的输入保留）。
 * 见 `dueLoadingMs`：`pinMsFor` 的公式要用它算「到点未派发」的 loading 上界。
 */
const POLL_MS = 10_000

/**
 * 服务端下发的巡检间隔（**显示用**；初始 = 默认值，每次取数回来后更新）。
 * ⚠️ 只用于算「到点未派发」的 loading 上界，**不参与任何调度判定**。
 */
let currentTickMs = 60_000

/**
 * 「到点未派发」的 loading 上界（决策 54「时长分档」，执行后评审要求）：与**派发延迟同口径**——
 * 复用 `pinMsFor` 的公式（巡检间隔 + 2×轮询；默认 60s + 20s = 80s，夹在 30s~10min），
 * 而不是另写一个魔数（此前写死 90s，与那套公式并存 ⇒ 迟早漂移；且运维调大巡检间隔时会在
 * 正常派发之前就退出 loading）。
 * 超过它还没有 `running` ⇒ 大概率是被挡住（上游没跑完 / 附件缺失 / 串行互斥）⇒ **不能一直装成在跑**。
 */
export const dueLoadingMs = (): number => pinMsFor(currentTickMs, POLL_MS)

/**
 * **排序调试日志**（用户 2026-09-30：不要截图 —— 把"一切会影响排序的状态变化"打到浏览器 console，
 * 复制 `[tdt-sort]` 开头的行给我即可）。只打**变化**，不打每次心跳；不用了把 `DEBUG_SORT` 改成 false。
 */
const DEBUG_SORT = true
/** 一行概括"影响排序/显示的那几个字段"，用于 diff 出「谁因为什么变了」。 */
const sortFactsOf = (rows: readonly TaskOverviewRow[]): string => rows
  .map(r => `${r.id.slice(0, 8)} run=${r.running ? 1 : 0} en=${r.enabled ? 1 : 0} next=${r.nextSlotAt ?? '-'} last=${r.lastStatus ?? '-'}@${r.lastScheduledAt ?? '-'}`)
  .join(' | ')
/** 上一次打印过的快照 / 面板顺序（模块级即可：调试用，面板单实例）。 */
let lastFacts = ''
let lastOrder = ''

/** 面板顺序一变就打印（组件算出 `visible` 后调它）。调试状态**收在这里**，不散在页面里。 */
export function debugLogOrder(rows: readonly TaskOverviewRow[]): void {
  if (!DEBUG_SORT) return
  const order = rows.map(r => r.id.slice(0, 8)).join(' > ')
  if (order === lastOrder) return
  console.log(
    `[tdt-sort] 面板顺序变化\n  before: ${lastOrder === '' ? '(空)' : lastOrder}\n  after:  ${order}\n`
    + `  键: ${rows.map(r => `${r.id.slice(0, 8)}[run=${r.running ? 1 : 0} next=${r.nextSlotAt ?? '-'}]`).join(' ')}`,
  )
  lastOrder = order
}

/**
 * 主界面数据：一次请求出全部卡片数据；`rev` 未变 ⇒ 服务端回 `unchanged`，本地状态不动。
 *
 * ⚠️ 2026-09-30（决策 54）：原来的「到点钳位」**整套已删**（那套客户端本地派生排序状态一旦轮询卡住
 * 就永不解开，正是真机「卡片 5 分钟不动」的根源）。排序抖动改由**服务端**解决 ——
 * `runtime-index.overview` 冻结「已到点但还没处理」的刻度 ⇒ 排序键不随读变化。
 */
export function useTaskOverview(): {
  rows: TaskOverviewRow[]
  ready: boolean
  refresh: () => void
  /** 就地补一条行（乐观更新，见 patchRow）。 */
  patchRow: (id: string, patch: Partial<TaskOverviewRow>) => void
} {
  const [rows, setRows] = useState<TaskOverviewRow[]>([])
  const [ready, setReady] = useState(false)
  const revRef = useRef('')
  const busyRef = useRef(false)
  /** 本轮请求的开始时刻（看门狗用；0 = 空闲）。 */
  const busySinceRef = useRef(0)
  /** 有刷新请求落在一轮在途期间 ⇒ 那轮结束后补跑一次（见 refresh）。 */
  const pendingRef = useRef(false)
  /**
   * 轮次令牌（2026-09-30 评审 P1）：看门狗会**强制放行**并把新一轮发出去，而**旧那轮仍在飞**；
   * 旧轮稍后 settle 时的 `finally` 若不加判别，就会把**新一轮**的 busy 位清掉 ⇒ 第三轮趁虚而入、
   * 后台被节流时请求层层叠加。所有「收口动作」（清 busy / 补跑）只在**令牌仍是自己的**时候做。
   */
  const genRef = useRef(0)
  const [tick, setTick] = useState(0)

  useEffect(() => {
    let alive = true
    /** 本 effect 内**在飞**的请求（换轮 / 卸载时统一 abort，不留悬空连接）。 */
    const inflight = new Set<AbortController>()
    const poll = async (): Promise<void> => {
      // 看门狗（决策 54）：abort 定时器本身也可能被后台节流 ⇒ 超过 3×轮询仍未收口就**强制放行**，
      // 否则一次挂起会把这条通道永久堵死（真机「卡片 5 分钟不动、倒计时照跳」的根因）。
      if (busyRef.current) {
        if (busySinceRef.current !== 0 && Date.now() - busySinceRef.current < 3 * POLL_MS) return
        busyRef.current = false
      }
      const myGen = ++genRef.current
      busyRef.current = true
      busySinceRef.current = Date.now()
      // 超时兜底（决策 54）：此前**没有 signal** ⇒ 请求永不 settle 时 busyRef 永远 true、
      // 后续刷新全早退、到期清理再也不跑。
      //
      // ⚠️ **刻意不与 `./http` 的 `fetchWithTimeout` 合并**（2026-09-30 收敛时评审核实）：这条需要
      // **持有 controller 句柄**，换轮 / 卸载时把 `inflight` 里逐个 abort（见下方 cleanup）。而
      // `fetchWithTimeout` 只做「超时 abort」；合并两种需求要用 `AbortSignal.any`，产物 target 是
      // chrome99（没有它）⇒ 合并等于把「卸载 abort」弄丢（弹窗关掉后请求仍在飞、还可能把旧数据盖回来）。
      // 需要自建 controller 的路径一共**两处、都是刻意的**：这里的取数（换轮 / 卸载要逐个 abort）、
      // 以及 `task-editor.tsx` 的**附件上传**（90s，按文件逐个 abort）。其余请求一律走 `./http`。
      const controller = new AbortController()
      inflight.add(controller)
      const abortTimer = window.setTimeout(() => controller.abort(), 8_000)
      try {
        const query = revRef.current === '' ? '' : `?rev=${encodeURIComponent(revRef.current)}`
        const res = await fetch(`api/task-dispatch-table/tasks/overview${query}`, { cache: 'no-store', signal: controller.signal })
        if (!res.ok) return
        const body = await res.json() as {
          ok?: boolean; unchanged?: boolean; rev?: number; tasks?: unknown; now?: unknown; tickMs?: unknown
        }
        // ⚠️ 令牌判别（2026-09-30 复核 P1）：看门狗放行后**旧轮仍在飞**，abort 只能缩小窗口——
        // 旧轮若在 abort 生效前拿到响应，会把**旧数据**盖到新一轮上（短暂回退）。⇒ 认领数据也要验令牌。
        if (!alive || genRef.current !== myGen || body.ok !== true) return
        // 内容没变：不重渲染、不重排、不播动画（`rev` 相同 ⇒ 行数据与上一份逐字节相同）。
        if (body.unchanged === true) return
        revRef.current = String(body.rev ?? '')
        const nextRows = Array.isArray(body.tasks) ? body.tasks as TaskOverviewRow[] : []
        // 只取「巡检间隔」用于「到点未派发」的 loading 上界（见 `dueLoadingMs`）。
        // ⚠️ 到点排序抖动现在由**服务端闸门**解决（冻结未处理刻度 ⇒ 排序键不随读变化），
        // 客户端**不再有任何本地派生排序状态**（原「到点钳位」整套已删，决策 54）。
        if (typeof body.tickMs === 'number' && Number.isFinite(body.tickMs) && body.tickMs > 0) currentTickMs = body.tickMs
        setRows(nextRows)
        // 排序调试（见文件顶部 `DEBUG_SORT`）：服务端下发的**快照变化**全打出来 ——
        // 影响排序/显示的字段都在 `sortFactsOf` 里，谁变了、变成什么，一眼可见。
        if (DEBUG_SORT) {
          const facts = sortFactsOf(nextRows)
          if (facts !== lastFacts) {
            console.log(`[tdt-sort] 快照变化 rev=${String(body.rev ?? '')}\n  before: ${lastFacts === '' ? '(空)' : lastFacts}\n  after:  ${facts}`)
            lastFacts = facts
          }
        }
        setReady(true)
      } catch { /* 通道短暂不可用 / 超时已 abort：保持上一次的数据，下次再取 */ } finally {
        window.clearTimeout(abortTimer)
        inflight.delete(controller)
        // ⚠️ 只有**最新那一轮**才有资格收口（看门狗放行过 ⇒ 旧轮令牌已过期）。
        if (genRef.current === myGen) {
          busyRef.current = false
          busySinceRef.current = 0
          if (pendingRef.current) {
            pendingRef.current = false
            if (alive) setTick(v => v + 1) // 补跑被在途那轮吞掉的刷新请求（卸载后不再 setState）
          }
        }
      }
    }
    void poll()
    // ⚠️ 这里**原来是 10s 常开轮询**（design/client-refresh-disposition.md §二 P2）——已删除：
    // 刷新改由事件推送驱动（`TASKS_CHANGED` / `TASK_RUN_*` ⇒ `refresh()`）；本 effect 只在挂载与
    // `refresh()` 时各跑一次 `poll()`。断线兜底见 event-subscribe.ts 的统一重连（R2）。
    return () => {
      alive = false
      for (const c of inflight) c.abort()
      inflight.clear()
      // 换轮 / 卸载：把 busy 位交还给**下一轮** —— 否则新一轮会因「上一轮还在飞」而空转到看门狗超时。
      busyRef.current = false
      busySinceRef.current = 0
    }
  }, [tick])

  /**
   * 手动刷新 / 操作后刷新：若此刻正有一轮在途（busy），**不能丢**——记下待办，
   * 那一轮结束立刻补一次（否则「保存后刷新」会被吞掉）。
   */
  const refresh = useCallback((): void => {
    if (busyRef.current) { pendingRef.current = true; return }
    setTick(v => v + 1)
  }, [])

  /**
   * 就地补一条行（乐观更新，用户 2026-09-30）：保存成功后**立刻**把改动落在列表上，
   * 不等服务端那 ~1 秒的落盘 + 重拉（用户：「改完还要等一秒，烦」）。改动用客户端已知的真值
   * （刚提交的草稿）填充，不编造；紧接着的 `refresh()` 会拉回服务端真值整体替换它，
   * 所以这里只是「先显示出来」，不构成第二份真源。
   */
  const patchRow = useCallback((id: string, patch: Partial<TaskOverviewRow>): void => {
    setRows(list => list.map(row => (row.id === id ? { ...row, ...patch } : row)))
  }, [])

  return { rows, ready, refresh, patchRow }
}
