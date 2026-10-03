// task-list.tsx — 主界面任务列表视图（2026-09-30，design/features/main-panel.md）。
//
// 形态：限宽居中的卡片列表。每张卡片 = 状态条 + 标题 + 执行方式 + 上次 / 下次 + 创建于 + 两个操作。
// 排序按「时间轴」：运行中 → 已启用按下次执行升序 → 已完结（无下次） → 已关闭沉底。
//
// **效率约定（用户 2026-09-30 明确要求）**：卡片数据全来自 `GET /tasks/overview`（服务端内存摘要，
// 不查库），10 秒轮询一次并带 `rev` 比对——未变只回 `{unchanged:true}`；「10 分钟后 → 9 分钟后」
// 这类相对时间由**本地计时器**渲染，不产生请求、也不触发重排。
//
// **即时性**：拨片（启用 / 停用）走「本地乐观更新 + 立刻重新拉一次」，不等下一轮轮询
// ——服务端在写库成功后会同步任务表快照，所以重新拉的这一次就能拿到新值。
//
// 官方组件：Switch / Menu / Input / 图标 一律取 primitives（本仓库惯例：能官方不手绘）；
// 卡片外壳官方没有列表件 ⇒ 自绘，颜色全走宿主主题变量。
import { createElement as h, useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { formatClock, formatDateTime, formatDurationHms, formatPlanStamp, formatTokenCount, formatYmd, pad2 } from './format'
import {
  FileTypeIcon, IconAlarmClockOutlineRegular, IconCheckCircleFillRegular, IconChevronDownOutlineRegular,
  IconClockOutlineRegular, IconCloseCircleFillRegular, IconEditOutlineRegular, IconLoadingOutlineRegular,
  IconSearchOutlineRegular,
  Input, Menu, Switch, Tooltip,
} from '@deepseek-ai/dsh-client-ui-primitives'
import { interpolateTranslate, type Translate } from './locales'
import { scheduleSpecFromSchedule, scheduleText } from './schedule-text'
// 三面板数据通道（决策 55）：执行记录 / 日志 / 事件时间线，与未来总查询页共用同一套 fetch。
import { fetchEvents, fetchInstances, fetchLogs, type EventRow, type InstanceRow, type LogRow } from './query'
// 状态通用短名单源（用户 2026-10-02：状态名别各处各写一份）。
import { INSTANCE_STATUSES, statusTextOf } from './status-text'
// `pinMsFor` 现在只用来算「到点未派发」的 loading 上界（`dueLoadingMs`）；`justCrossedSlot` 随
// 「到点钳位」整套删除（决策 54：抖动由**服务端**冻结未处理刻度解决，客户端不再有任何本地派生排序状态）。
import { pinMsFor, sortRows } from '../task-sort.js'
import { MarqueeText, SelectField, calendarLabelsOf, timeLabelsOf } from './editor-fields'
import { ensureTaskEditorStyle } from './task-editor-css'
// UI 基础层（P1/P2/P3）：分段控件 / 按钮 / 图标钮 / 输入唯一实现。
import { applyStyle, Button, IconButton, Input as TdtInput, Loading, RunningBlocks, Segmented, TimeRange, rangeToQuery, type TimeRangeLabels, type TimeRangeValue } from './ui'

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

// ── 主题变量（与 index.ts 的 C 同款：全走宿主变量 + 兜底）──
const transition = `background var(--tdt-dur) var(--tdt-ease), color var(--tdt-dur) var(--tdt-ease), border-color var(--tdt-dur) var(--tdt-ease)`
/** 等宽字体：倒计时数字用它 + tabular-nums ⇒ 字宽固定，不会左右蹦。 */
const monoFont = 'var(--tdt-font-mono, ui-monospace, SFMono-Regular, Menlo, Consolas, monospace)'
/** 没有这个时刻时的占位（停用任务没有下次执行；从未执行过没有上次）——图标保留，只占位时间。 */
const NO_TIME = '--'
/** 顶部一排的统一高度：搜索框 / 工作区下拉 / 分组按钮 / 新建全部同高（用户 2026-09-30 要求）。 */
const CONTROL_H = 'var(--tdt-control-h-md)'
/** 工作区下拉的**定长**宽度（比搜索框略宽一点；切选项时宽度不变）。 */
const WS_WIDTH = 180
/**
 * 顶部控件的统一外壳（与官方 `Input` 同款观感）：工作区下拉用它，
 * 保证「搜索 / 工作区」是**一样的高、一样的样式**。
 */
const controlBoxStyle: Record<string, string | number> = {
  display: 'inline-flex', alignItems: 'center', gap: '6px', boxSizing: 'border-box',
  height: CONTROL_H, padding: '0 10px', borderRadius: 'var(--tdt-radius-sm)',
  border: `1px solid var(--tdt-border)`, background: 'var(--tdt-surface-1)', color: 'var(--tdt-fg)',
  fontFamily: 'inherit', fontSize: 'var(--tdt-font-sm)', lineHeight: 'var(--tdt-line-sm)', cursor: 'pointer',
  transition,
}

// ── 顶部一排的样式注入（官方 Input 默认 32px 高，需压到与按钮同高；工作区按钮定长 + 省略号）──
const TASK_LIST_CSS = [
  // 状态条运行中：整条明暗脉动（竖条不适合旋转，脉动更显眼）。
  '@keyframes dsh-tdt-rail-pulse { 0%, 100% { opacity: 1 } 50% { opacity: 0.35 } }',
  // 官方 Input 默认 32px 高 + 0.5px 边框 ⇒ 压到与按钮同高，并统一成同一套观感。
  // ⚠️ 必须 box-sizing:border-box：官方那 0.5px 边框若加在 28 之外，搜索框外框会比「工作区下拉」高约 2px
  //    （用户 2026-10-01 点名「搜索框比下拉高两个像素」的根因）。下拉侧本就 border-box（见 controlBoxStyle）。
  `.dsh-tdt-tl-input, .dsh-tdt-tl-input > * { box-sizing: border-box; height: ${CONTROL_H}; border-radius: var(--tdt-radius-sm); }`,
  `.dsh-tdt-tl-input { width: ${WS_WIDTH}px; }`,
  `.dsh-tdt-tl-input input { box-sizing: border-box; height: ${CONTROL_H}; font-size: var(--tdt-font-sm); }`,
  // 工作区下拉：**定长**（切选项时宽度不动，不再左右晃），内容超长尾部省略号。
  // 展开后的列表项不受这条限制 ⇒ 可以显示完整长度。
  `.dsh-tdt-tl-ws { width: ${WS_WIDTH}px; }`,
  '.dsh-tdt-tl-ws-label { flex: 1 1 auto; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; text-align: left; }',
  // 记录表头吸顶（内容区定高滚动、表头不动）：原注释声称由 `.dsh-tdt-rec-head th` 接管，
  // 但迁移时这条规则丢了、表头实际不吸顶；这里补回，底色随卡片面（--tdt-surface-1）免得滚动时透内容。
  '.dsh-tdt-rec-head th { position: sticky; top: 0; z-index: 1; background: var(--tdt-head-bg); }',
  // 任务卡片：底色 + **hover 微高亮**（用户 2026-10-03）。
  // 底色必须写在这里而不是 inline style —— inline 会盖掉下面的 `:hover`。
  // 高亮用**淡蓝** `--tdt-card-hover`：灰色高亮在卡片底色上几乎看不出来。
  '.dsh-tdt-card { background: var(--tdt-surface-1); }',
  // hover 只作用在**主行**（`dsh-tdt-card-row`：标题 / 状态 / 开关 / 箭头那一溜基本信息）。
  // 展开区是兄弟节点、不在这个 div 里 ⇒ 即便展开了，下面的设置 / 记录 / 日志也**不会**跟着变蓝
  // （否则展开后整页发蓝，反而晃眼，用户 2026-10-03）。
  '.dsh-tdt-card-row:hover { background: var(--tdt-card-hover); }',
  // 行 hover 高亮（用户 2026-10-02：斑马纹之上再给一层鼠标反馈）。
  // 特异性 (0,2,0) > `.dsh-tdt-rec-alt` (0,1,0) ⇒ 能盖住斑马纹底色。
  '.dsh-tdt-rec-row:hover { background: var(--tdt-plate-hover); }',
  // 产出物图标小底板：圆角方形 + hover 变亮（表示可点）。
  // 底板**走 class**——inline background 会盖掉 :hover。
  // hover 走 `--tdt-chip-bg-hover`：**两端都是「更明显」**（浅色更深、暗色更亮），
  // 不能再用 plate-hover（暗色下反而更淡 ⇒ 鼠标移上去底板就消失了）。
  '.dsh-tdt-rec-out { background: var(--tdt-chip-bg); }',
  '.dsh-tdt-rec-out:hover { background: var(--tdt-chip-bg-hover); }',
  // 基础信息右栏「产出物」文件行：hover 给一层底色（用户 2026-10-03）。必须走 class——inline 会盖掉 :hover。
  '.dsh-tdt-info-out { background: transparent; transition: background var(--tdt-dur) var(--tdt-ease); }',
  '.dsh-tdt-info-out:hover { background: var(--tdt-chip-bg); }',
  // 基础信息右栏「任务会话」（用户 2026-10-03 二次修订）：**不要边框、不要底色**，做成超链接那种——
  // 虚线下划线 + hover 变色（蓝）。⚠️ color / border-bottom 必须写在 class 里，inline 会盖掉 :hover。
  '.dsh-tdt-info-session { background: transparent; color: var(--tdt-fg); border-bottom: 1px dashed var(--tdt-border-strong); transition: color var(--tdt-dur) var(--tdt-ease), border-color var(--tdt-dur) var(--tdt-ease); }',
  '.dsh-tdt-info-session:hover { color: var(--tdt-business); border-bottom-color: var(--tdt-business); }',
  // 执行记录表格（用户 2026-10-02）：**不用实线分隔**，改行**交错浅底**（斑马纹，很浅的灰 `--tdt-plate`）。
  '.dsh-tdt-rec-alt { background: var(--tdt-plate); }',
  // 状态图标配色（官方图标吃 currentColor）：圆勾绿 / 圆叉红 / 转圈主题色。
  '.dsh-tdt-rec-ic-ok { color: var(--tdt-success); }',
  '.dsh-tdt-rec-ic-bad { color: var(--tdt-danger); }',
  '.dsh-tdt-rec-ic-run { color: var(--tdt-accent); animation: dsh-tdt-rec-rotate .9s linear infinite; }',
  '@keyframes dsh-tdt-rec-rotate { to { transform: rotate(360deg) } }',
  '.dsh-tdt-rec-ic-idle { box-sizing: border-box; display: inline-block; width: 12px; height: 12px; border: 1.5px solid var(--tdt-border-strong); border-radius: 50%; }',
  '@media (prefers-reduced-motion: reduce) { .dsh-tdt-rec-ic-run { animation: none; } }',
].join('\n')

/** 幂等注入（走 ui/style.ts 单一 <style>）。 */
const ensureTaskListStyle = (): void => { applyStyle('domain:list', TASK_LIST_CSS) }

// ── 轮询 ──────────────────────────────────────────────────────────────
const POLL_MS = 10_000

/**
 * 服务端下发的巡检间隔（**显示用**；初始 = 默认值，每轮轮询回来后更新）。
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
const dueLoadingMs = (): number => pinMsFor(currentTickMs, POLL_MS)

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

/**
 * 主界面数据：一次请求出全部卡片数据；rev 未变 ⇒ 服务端回 unchanged，本地状态不动。
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
      // 后续轮询全早退、到期清理再也不跑。8s < 10s 轮询间隔，避免一轮拖过下一轮把间隔拉成 2 倍。
      //
      // ⚠️ **刻意不与 `./http` 的 `fetchWithTimeout` 合并**（2026-09-30 收敛时评审核实）：这条需要
      // **持有 controller 句柄**，换轮 / 卸载时把 `inflight` 里逐个 abort（见下方 cleanup）。而
      // `fetchWithTimeout` 只做「超时 abort」；合并两种需求要用 `AbortSignal.any`，产物 target 是
      // chrome99（没有它）⇒ 合并等于把「卸载 abort」弄丢（弹窗关掉后请求仍在飞、还可能把旧数据盖回来）。
      // 需要自建 controller 的路径一共**两处、都是刻意的**：这里的轮询（换轮 / 卸载要逐个 abort）、
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
      } catch { /* 通道短暂不可用 / 超时已 abort：保持上一次的数据，下轮再取 */ } finally {
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
    const timer = window.setInterval(() => { void poll() }, POLL_MS)
    return () => {
      alive = false
      window.clearInterval(timer)
      for (const c of inflight) c.abort()
      inflight.clear()
      // 换轮 / 卸载：把 busy 位交还给**下一轮** —— 否则新一轮会因「上一轮还在飞」而空转到看门狗超时（30s）。
      busyRef.current = false
      busySinceRef.current = 0
    }
  }, [tick])

  /**
   * 手动刷新 / 操作后刷新：若此刻正有一轮在途（busy），**不能丢**——记下待办，
   * 那一轮结束立刻补一次（否则「保存后刷新」会被吞掉，又退回等 10 秒轮询）。
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

// ── 文案与时间 ─────────────────────────────────────────────────────────
// ⚠️ 排期人话（卡片「执行方式」/ 编辑器「预计执行」）**不在这里写**——统一在
// [`./schedule-text.ts`](./schedule-text.ts)（用户 2026-09-30 拍板：同一个排期不许两处各写一份文案，
// 真机已出现「周一…每 10 分钟执行一次」vs「每天每 10 分钟执行一次」）。此处只把任务定义的
// `schedule` 交给它。

// ── 时间「社交化」表达（2026-09-30 用户要求；分级取 GitHub / Telegram 一类公认口径）──
// 过去：刚刚 → N 分钟前 → N 小时前 → N 天前 → N 周前 → N 个月前 → N 年前；
// 未来：即将执行 → N 分钟后 → 今天/明天 HH:mm → N 天后 → N 周后 → N 个月后 → N 年后。
// 具体时刻一律放进 hover Tooltip（listLastFullTitle / listNextFullTitle）。
/** 完整时刻（tooltip 用）：解析失败给占位符 `—`（不编造时间）。 */
const formatFull = (iso: string): string => formatDateTime(iso, { fallback: '—' })

const sameCalendarDay = (a: Date, b: Date): boolean =>
  a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate()

function relativePast(iso: string, nowMs: number, tt: Translate): string {
  const diff = nowMs - Date.parse(iso)
  if (!(diff >= 0)) return tt('relNow')
  if (diff < 60_000) return tt('relJustNow')
  const minutes = Math.floor(diff / 60_000)
  if (minutes < 60) return tt('relMinutesAgo', { n: minutes })
  const hours = Math.floor(minutes / 60)
  if (hours < 24) return tt('relHoursAgo', { n: hours })
  const days = Math.floor(hours / 24)
  if (days < 7) return tt('relDaysAgo', { n: days })
  if (days < 30) return tt('relWeeksAgo', { n: Math.floor(days / 7) })
  const months = Math.floor(days / 30)
  if (months < 12) return tt('relMonthsAgo', { n: months })
  return tt('relYearsAgo', { n: Math.floor(days / 365) })
}

function relativeFuture(iso: string, nowMs: number, tt: Translate): string {
  const target = Date.parse(iso)
  // 解析失败（畸形 ISO）⇒ 占位符，别渲染出「NaN 年后」（2026-09-30 专家团复核）。
  if (!Number.isFinite(target)) return NO_TIME
  const diff = target - nowMs
  if (diff <= 0) return tt('relPast')
  if (diff < 60_000) return tt('relNow')
  const minutes = Math.floor(diff / 60_000)
  if (minutes < 60) return tt('relMinutes', { n: minutes })
  const date = new Date(target)
  const now = new Date(nowMs)
  const tomorrow = new Date(now.getTime() + 24 * 3600_000)
  if (sameCalendarDay(date, now)) return tt('relToday', { time: clockOf(iso) })
  if (sameCalendarDay(date, tomorrow)) return tt('relTomorrow', { time: clockOf(iso) })
  const days = Math.ceil(diff / 86_400_000)
  if (days < 7) return tt('relDays', { n: days })
  if (days < 30) return tt('relWeeks', { n: Math.floor(days / 7) })
  const months = Math.floor(days / 30)
  if (months < 12) return tt('relMonths', { n: months })
  return tt('relYears', { n: Math.floor(days / 365) })
}

/**
 * 24 小时内的秒级倒计时（用户 2026-09-30 定的分级）：
 * - 小时为 0 ⇒ 不显示小时（几分几秒 显示 `5:09`）；
 * - 只剩秒 ⇒ 仍要显示分位（`0:09`）；
 * - 超过 24 小时由调用方走 `relativeFuture`（明天 / 三天后 / N 周后）。
 * 每次都用「目标 − 系统当前时间」现算，不做算术递减 ⇒ 永不漂移。
 */
function countdownText(iso: string, nowMs: number, tt: Translate): string {
  const diff = Date.parse(iso) - nowMs
  if (Number.isNaN(diff)) return NO_TIME // 畸形 ISO ⇒ 占位符，别渲染出 NaN:NaN
  if (diff <= 0) return tt('relNow')
  const total = Math.floor(diff / 1000)
  const hours = Math.floor(total / 3600)
  const minutes = Math.floor((total % 3600) / 60)
  const seconds = total % 60
  // 数字一律两位（用户 2026-09-30：「都把它补成两位」）⇒ `05:09` / `01:05:09`，位数恒定不跳。
  return hours > 0 ? `${pad2(hours)}:${pad2(minutes)}:${pad2(seconds)}` : `${pad2(minutes)}:${pad2(seconds)}`
}

// ── 全局秒级心跳（单 timer + 局部订阅）────────────────────────────────
// ⚠️ 性能关键（用户 2026-09-30 反馈「延迟太严重」）：**不能**在列表顶层每秒 setState
// （那会整列表重渲染）。正确做法 = 全模块只有一个 interval，需要动的文本（倒计时）
// 各自订阅，每秒只重渲染那一小块。
const tickerListeners = new Set<() => void>()
let tickerTimer: number | null = null
/**
 * `visibilitychange` 处理器**只注册一次**（模块级）——2026-09-30 专家团复核：此前每次订阅起停
 * 都 `addEventListener` 且从不移除 ⇒ 反复重挂面板会累积 N 个监听、切回标签页时同一批订阅被调 N 次。
 * 这里注册一次、常驻（订阅集合空时遍历即空转，无副作用）。
 */
const onVisibilityChange = (): void => { for (const l of [...tickerListeners]) l() }
let visibilityBound = false
function subscribeTicker(cb: () => void): () => void {
  tickerListeners.add(cb)
  if (tickerTimer === null) {
    tickerTimer = window.setInterval(() => { for (const l of [...tickerListeners]) l() }, 1000)
    // 标签页被浏览器节流（后台 / 休眠）后回来 ⇒ 立刻对一次表，倒计时自动追上。
    if (!visibilityBound && typeof document !== 'undefined') {
      document.addEventListener('visibilitychange', onVisibilityChange)
      visibilityBound = true
    }
  }
  return () => {
    tickerListeners.delete(cb)
    if (tickerListeners.size === 0 && tickerTimer !== null) {
      window.clearInterval(tickerTimer)
      tickerTimer = null
    }
  }
}

/**
 * 每秒自刷新的一小块内容：只有它自己重渲染（render 永远取最新闭包，ref 转发）。
 * 2026-09-30（决策 54）：`render` 由「只能返回字符串」放宽为**可返回节点** —— 「到点未派发」
 * 时要在这里就地换成三个方块的活动指示（文案换不出来，只能给节点）。
 */
function LiveText(props: { render: (nowMs: number) => ReactNode; style?: Record<string, string | number> }) {
  const [, force] = useState(0)
  const renderRef = useRef(props.render)
  renderRef.current = props.render
  useEffect(() => subscribeTicker(() => force(v => v + 1)), [])
  return h('span', { style: props.style }, renderRef.current(Date.now()))
}

/** HH:mm（本机时区）。 */
function clockOf(iso: string): string {
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return '—'
  return `${pad2(d.getHours())}:${pad2(d.getMinutes())}`
}


// ── 排序（时间轴：马上要跑的最上，关闭的沉底）──────────────────────────
// 实现在 [`../task-sort.ts`](../task-sort.ts)：放 `src/` 是为了让冒烟能**真断言**（client 侧只能 grep 产物）。
// 除分组排序外，那里还有「到点钳位」的判定与时长（排序抖动，2026-09-30）。

// ── FLIP 动画：卡片「下去 / 上来」平滑位移（自研，不引包）──────────────
function useFlip(signature: string): (id: string) => (el: HTMLElement | null) => void {
  const nodes = useRef(new Map<string, HTMLElement>())
  const prevTop = useRef(new Map<string, number>())

  useLayoutEffect(() => {
    const moved: Array<[HTMLElement, number]> = []
    for (const [id, el] of nodes.current) {
      const top = el.getBoundingClientRect().top
      const prev = prevTop.current.get(id)
      // 只动画「位置真变了」的卡片：几百条里通常只有 1–3 张在动。
      if (prev !== undefined && Math.abs(prev - top) > 0.5) moved.push([el, prev - top])
      prevTop.current.set(id, top)
    }
    if (moved.length === 0) return
    if (window.matchMedia?.('(prefers-reduced-motion: reduce)').matches === true) return
    for (const [el, delta] of moved) {
      el.style.transition = 'none'
      el.style.transform = `translateY(${delta}px)`
    }
    const frame = requestAnimationFrame(() => {
      for (const [el] of moved) {
        el.style.transition = `transform 260ms var(--tdt-ease)`
        el.style.transform = ''
      }
      window.setTimeout(() => { for (const [el] of moved) el.style.transition = '' }, 320)
    })
    return () => { cancelAnimationFrame(frame) }
  }, [signature])

  // ref 回调必须**跨渲染稳定**（否则每次渲染都会 detach/attach，白白触发测量）。
  const callbacks = useRef(new Map<string, (el: HTMLElement | null) => void>())
  return useCallback((id: string): ((el: HTMLElement | null) => void) => {
    const hit = callbacks.current.get(id)
    if (hit !== undefined) return hit
    const fn = (el: HTMLElement | null): void => {
      if (el === null) {
        nodes.current.delete(id)
        // 卸载时一并清掉「回调缓存」与「上次坐标」——否则长会话里随历史任务 id 无界增长，
        // 且 id 复用时用陈旧坐标做错误位移动画（2026-09-30 专家团复核）。
        callbacks.current.delete(id)
        prevTop.current.delete(id)
      } else {
        nodes.current.set(id, el)
      }
    }
    callbacks.current.set(id, fn)
    return fn
  }, [])
}

// ── 状态条（StatusRail）───────────────────────────────────────────────
// 命名：中文「**状态条**」，组件 `StatusRail`——它是贴在卡片左缘、与正文两行等高的竖向色条，
// 比原来的小圆点显眼得多（用户 2026-09-30：只给个点儿出颜色，看不清）。
const RAIL_W = 6
const RAIL_H = 36

/** 运行中：整条**绿色**明暗脉动（用户 2026-09-30：执行中是正常状态，不能灰/白闪）。 */
function RunningRail() {
  return h('span', {
    style: {
      display: 'inline-block', width: `${RAIL_W}px`, height: `${RAIL_H}px`, flex: 'none',
      borderRadius: 'var(--tdt-radius-xs)', background: 'var(--tdt-success)',
      animation: 'dsh-tdt-rail-pulse 900ms ease-in-out infinite',
    },
  })
}

function StatusRail(props: { row: TaskOverviewRow }) {
  const { row } = props
  if (row.running) return h(RunningRail, {})
  // `skipped` = 「未执行」（决策 54 补记的终态行：附件找不到 / 工作区不存在等任务级错误）——
  // 必须**和失败一样显眼**（用户：都是这个任务出错了），但提示要说清是「没执行」而不是「跑砸了」。
  const color = !row.enabled
    ? 'var(--tdt-fg-3)'
    : row.lastStatus === 'failed' || row.lastStatus === 'skipped' ? 'var(--tdt-danger)' : 'var(--tdt-success)'
  const hint = !row.enabled
    ? '已关闭'
    : row.lastStatus === 'failed'
      ? '最近一次执行失败'
      : row.lastStatus === 'skipped'
        ? '最近一次未执行（配置或前置不满足，详见执行记录）'
        : '计划运行中'
  return h('span', {
    title: hint,
    style: {
      display: 'inline-block', width: `${RAIL_W}px`, height: `${RAIL_H}px`, flex: 'none',
      borderRadius: 'var(--tdt-radius-xs)', background: color,
      transition: `background var(--tdt-dur) var(--tdt-ease)`,
    },
  })
}

/**
 * 「历史执行」与「下次执行」是**两个独立**小标签（2026-09-30 用户拍板：不要合成一格四段，
 * 拆成两块更清爽）。每个标签 = 语义底色的图标格 + 时间格，整体一个圆角细边框。
 * - 历史执行：成功绿 / 失败红 / 无状态灰，图标 = 历史时钟；时间格当天 HH:mm、跨天「3 小时前 / 1 天前」。
 * - 下次执行：图标 = 闹钟；时间格一天以内 = HH:mm:ss **秒级倒计时**（LiveText 自转），
 *   超过 24 小时 = 明天 / 三天后 / N 周后。
 *
 * ⚠️ 悬浮提示包在**整个标签**外层，且 Tooltip 的子元素必须是**真 DOM 元素**（`h('div', …)`）——
 * 官方 Tooltip 靠给子元素挂 ref 实现，子元素若是普通函数组件（如 `LiveText`）ref 挂不上 ⇒
 * 提示**静默失效**（用户 2026-09-30 真机反馈「移上去没提示」的根因，与 task-editor 里
 * 「图标要包真 `<button>`」是同一个坑）。
 */
const pillOuterStyle: Record<string, string | number> = {
  display: 'inline-flex', alignItems: 'stretch', flex: 'none', height: '20px',
  borderRadius: 'var(--tdt-radius-sm)', overflow: 'hidden', border: `1px solid var(--tdt-border)`,
}
/** 图标格：语义底色 + 图标（成功绿 / 失败红 / 无状态灰 / 下次中性）。 */
const pillIconCell = (bg: string, fg: string): Record<string, string | number> => ({
  display: 'inline-flex', alignItems: 'center', padding: '0 6px', background: bg, color: fg, flex: 'none',
})
/** 时间格：**等宽数字**（tabular-nums + 代码字体）⇒ 倒计时每秒变化不会因字宽不同而左右蹦。 */
const pillTimeCell: Record<string, string | number> = {
  display: 'inline-flex', alignItems: 'center', padding: '0 8px', background: 'var(--tdt-surface-1)', color: 'var(--tdt-fg)',
  fontSize: 'var(--tdt-font-xs)', lineHeight: 'var(--tdt-line-xs)', whiteSpace: 'nowrap',
  fontVariantNumeric: 'tabular-nums', fontFamily: monoFont,
}

/** 历史执行标签（成功绿 / 失败红 / 无状态灰）。 */
function PastPill(props: { row: TaskOverviewRow; t: Translate; tt: Translate }) {
  const { row, t, tt } = props
  const has = row.lastStatus !== null && row.lastScheduledAt !== null
  // 2026-09-30 用户拍板：`skipped` = **未执行**（附件找不到 / 工作区不存在 / 被吃掉的槽补记）——
  // 那是「这个任务坏了、且不会自己好」⇒ **必须显眼标红**。用户原话：不能让用户觉得天下太平、
  // 也不能「有的错误去翻日志、有的在记录里」，看不出门道。
  // `unknown`（重启收口）仍中性：它会被下一轮正常收掉。⇒ 只有 succeeded / unknown 不染红。
  const colored = has && row.lastStatus !== null && row.lastStatus !== 'unknown'
  const bg = !has || row.lastStatus === 'unknown'
    ? 'var(--tdt-surface-3)'
    : row.lastStatus === 'succeeded' ? 'var(--tdt-success)' : 'var(--tdt-danger)'
  const title = has ? tt('listLastFullTitle', { when: formatFull(row.lastScheduledAt ?? '') }) : t('listNever')
  return h(Tooltip, { label: title, side: 'bottom' },
    h('div', { style: pillOuterStyle },
      // ⚠️ 图标前景跟着底色走：白字只配「绿 / 红」实底；中性浅灰底（无状态 / skipped / unknown）
      // 必须用常态文字色，否则白图标压在浅灰上几乎看不见（2026-09-30 复核）。
      h('span', { style: pillIconCell(bg, colored ? '#fff' : 'var(--tdt-fg-2)') }, h(IconClockOutlineRegular, { size: 12 })),
      h(LiveText, {
        style: pillTimeCell,
        render: (nowMs: number): string => {
          if (!has) return NO_TIME
          const iso = row.lastScheduledAt ?? ''
          return sameCalendarDay(new Date(iso), new Date(nowMs)) ? clockOf(iso) : relativePast(iso, nowMs, tt)
        },
      }),
    ),
  )
}

/**
 * 下次执行标签。**三种状态**（用户 2026-09-30 拍板：不要去判断补跑时间）：
 * - **运行中** ⇒ 不显示倒计时（下一槽要等这趟跑完才算），改显「三个小方块脉动」的活动指示；
 * - 未运行 ⇒ 一天以内 = `HH:mm:ss` 秒级倒计时（`LiveText` 自转），超过 24 小时 = 明天 / 三天后 / N 周后；
 * - 无后续 ⇒ 占位符。
 *
 * ⚠️ 悬浮提示包在**整个标签**外层，且 Tooltip 的子元素必须是**真 DOM 元素**（`h('div', …)`）——
 * 官方 Tooltip 靠给子元素挂 ref 实现，子元素若是普通函数组件（如 `LiveText`）ref 挂不上 ⇒
 * 提示静默失效（用户 2026-09-30 真机反馈「移上去没提示」的根因）。
 */
function NextPill(props: { row: TaskOverviewRow; t: Translate; tt: Translate }) {
  const { row, t, tt } = props
  // ⚠️ 这一格**自走时钟（1 秒）**：下面那格的显示由 `LiveText` 的 1 秒心跳驱动，而**悬浮文案是在组件
  // 渲染那一刻算好的字符串** —— 两个时钟不同源时，"到点"那一秒会出现「方块已经切过来、文案却还写着
  // 『下次执行：<刚过去的时间>』」（用户 2026-09-30 真机撞上，最长约一个轮询周期 ≈10 秒）。
  // 旧注释说"本组件每秒自刷"并不成立（自转的只有 `LiveText`），这句一并纠正。
  const [nowMs, setNowMs] = useState(() => Date.now())
  useEffect(() => {
    const timer = window.setInterval(() => setNowMs(Date.now()), 1_000)
    return () => window.clearInterval(timer)
  }, [])
  if (row.running) {
    return h(Tooltip, { label: t('listRunning'), side: 'bottom' },
      h('div', { style: pillOuterStyle },
        h('span', { style: pillIconCell('var(--tdt-success)', '#fff') }, h(IconAlarmClockOutlineRegular, { size: 12 })),
        h('span', { style: { ...pillTimeCell, color: 'var(--tdt-success)' } }, h(RunningBlocks, {})),
      ),
    )
  }
  // 被挡住时（上游没完成 / 附件找不到 / 上一轮还在跑…）把**具体原因**并进这**一个**悬浮提示，
  // 放在通用说明前面（用户要求「鼠标移上去能看到说明」）。原因由服务端随行下发。
  //
  // ⚠️ 2026-09-30 评审 P1：延期徽标此前**又套了一层 Tooltip** ⇒ 悬停同时冒出**两个气泡**
  // （外层通用说明 + 内层原因）。现在全组件**只有这一层** Tooltip（子元素为真 DOM 节点，
  // 裸函数组件挂不上 ref ⇒ 提示会静默失效，2026-09-30 那次真机教训）。
  // 已到点（`nextSlotAt` 是**过去时刻**）⇒ 这一格现在是"三块脉动"或"延期"，
  // **不能再说「下次执行：<一个已经过去的时间>」**（用户 2026-09-30 真机点名）。三种档位：
  //   ① 还在 loading 上界内 ⇒ 「运行中」（与真在跑同一句，用户明确说不用区分）；
  //   ② 超上界 ⇒ 「延期」（有具体原因就带上）；
  //   ③ 未到点 ⇒ 原来的「下次执行：…」。
  const dueNow = row.nextSlotAt !== null && Date.parse(row.nextSlotAt) <= nowMs
  const deferredTitle = typeof row.blockedReason === 'string' && row.blockedReason !== ''
    ? `${row.blockedReason}｜${tt('listDeferredTitle')}`
    : tt('listDeferredTitle')
  const title = dueNow
    ? (nowMs - Date.parse(row.nextSlotAt ?? '') <= dueLoadingMs() ? t('listRunning') : deferredTitle)
    : (typeof row.blockedReason === 'string' && row.blockedReason !== ''
        ? deferredTitle
        : (row.nextSlotAt === null
            ? t('listNextNone')
            : tt('listNextFullTitle', { when: formatFull(row.nextSlotAt) })))
  return h(Tooltip, { label: title, side: 'bottom' },
    h('div', { style: pillOuterStyle },
      h('span', { style: pillIconCell('var(--tdt-surface-3)', 'var(--tdt-fg)') }, h(IconAlarmClockOutlineRegular, { size: 12 })),
      h(LiveText, {
        style: pillTimeCell,
        render: (nowMs: number): ReactNode => {
          if (row.nextSlotAt === null) return NO_TIME
          const diff = Date.parse(row.nextSlotAt) - nowMs
          // 已到点（`diff <= 0`）⇒ **不再显示「即将执行」**，直接显三个方块的活动指示（用户 2026-09-30 拍板）。
          // 服务端闸门生效后「到点」= `nextSlotAt` 是过去时刻且该槽还没被处理（`!row.running`）。
          if (diff <= 0) {
            // ① 上界内 ⇒ 三个方块（正在等派发，视觉上就是「在跑」）——**与「运行中」同色**。
            //    2026-09-30 评审 P1：此前这里继承正文色（黑），跟运行中的绿对不上，看着像两回事。
            if (-diff <= dueLoadingMs()) {
              return h('span', { style: { display: 'inline-flex', alignItems: 'center', color: 'var(--tdt-success)' } }, h(RunningBlocks, {}))
            }
            // ② 超上界仍未 `running` ⇒ **「延期」**：该槽已经过了但还没真正开始执行
            //    （上游没跑完 / 附件缺失 / 串行互斥）。**不能一直装成在跑**（决策 54 红线），
            //    也**不再显示「即将执行」**那句（用户 2026-09-30 点名去掉）。
            return h('span', { style: { cursor: 'default', opacity: 0.85 } }, tt('listDeferred'))
          }
          return diff < 24 * 3600_000
            ? countdownText(row.nextSlotAt, nowMs, tt)
            : relativeFuture(row.nextSlotAt, nowMs, tt)
        },
      }),
    ),
  )
}

// ── 卡片 ───────────────────────────────────────────────────────────────
const cardStyle: Record<string, string | number> = {
  display: 'block', width: '100%', boxSizing: 'border-box', textAlign: 'left',
  marginBottom: '10px', borderRadius: 'var(--tdt-radius-sm)',
  border: `1px solid var(--tdt-border)`, color: 'var(--tdt-fg)',
  transition: `border-color var(--tdt-dur) var(--tdt-ease), background var(--tdt-dur) var(--tdt-ease)`,
  // ⚠️ **background 不放这里**：inline 背景的优先级高于 CSS class，会盖掉 `.dsh-tdt-card-row:hover` 的高亮。
  // 底色走 CSS（`.dsh-tdt-card`）；hover 高亮走 `.dsh-tdt-card-row:hover`（只作用主行，展开区不跟着蓝）。
}
const titleStyle: Record<string, string | number> = { fontSize: 'var(--tdt-font-lg)', fontWeight: 600, color: 'var(--tdt-fg)', lineHeight: 'var(--tdt-line-md)' }
const metaStyle: Record<string, string | number> = { fontSize: 'var(--tdt-font-sm)', color: 'var(--tdt-fg-2)', lineHeight: 'var(--tdt-line-sm)', marginTop: '2px' }
const faintStyle: Record<string, string | number> = { fontSize: 'var(--tdt-font-xs)', color: 'var(--tdt-fg-3)', lineHeight: 'var(--tdt-line-sm)', marginTop: '2px' }
// 基础信息改版（用户 2026-10-03）：左「任务配置」+ 右「上次执行」两栏；纸表格风格，字段不再挤成一坨。
// 右栏**定宽**（用户：窗口拖动时让左边变、右边别跟着变）；右栏内容可能多（产出物）⇒ **只滚右栏**。
// `marginBottom: 10` 与面板顶部虚线下的 10px 间距对称 ⇒ 右栏滚动条上下离虚线一样远（用户 2026-10-03）。
const infoWrapStyle: Record<string, string | number> = { flex: '1 1 auto', minHeight: 0, display: 'flex', gap: '18px', marginBottom: '10px' }
const infoConfigStyle: Record<string, string | number> = { flex: '1 1 auto', minWidth: 0, overflowY: 'auto', paddingRight: '2px' }
const infoRecentStyle: Record<string, string | number> = {
  flex: 'none', width: '320px', overflowY: 'auto',
  borderLeft: '1px solid var(--tdt-border-faint)', paddingLeft: '16px',
}
const infoGroupTitleStyle: Record<string, string | number> = {
  fontSize: 'var(--tdt-font-xs)', color: 'var(--tdt-fg-3)', fontWeight: 600,
  marginBottom: '6px', letterSpacing: '0.02em',
}
const infoGridRowStyle: Record<string, string | number> = {
  display: 'grid', gridTemplateColumns: '78px 1fr', gap: '12px', alignItems: 'baseline',
  padding: '6px 0', borderBottom: '1px solid var(--tdt-border-faint)',
}
const infoGridLabelStyle: Record<string, string | number> = { fontSize: 'var(--tdt-font-sm)', color: 'var(--tdt-fg-2)', whiteSpace: 'nowrap' }
const infoGridValueStyle: Record<string, string | number> = { fontSize: 'var(--tdt-font-sm)', color: 'var(--tdt-fg)', minWidth: 0, wordBreak: 'break-word', lineHeight: 'var(--tdt-line-md)' }
/** 纸表格一行：左标签（定宽淡色）+ 右值（自适应换行）。 */
function InfoField(props: { label: string; children: ReactNode }): ReturnType<typeof h> {
  return h('div', { style: infoGridRowStyle },
    h('span', { style: infoGridLabelStyle }, props.label),
    h('div', { style: infoGridValueStyle }, props.children),
  )
}
/** 状态→颜色（与卡片状态条同口径：成功绿、失败/未执行红、其余中性）。 */
const infoStatusColorOf = (status: string | null): string =>
  status === 'succeeded' ? 'var(--tdt-success)'
    : status === 'failed' || status === 'skipped' ? 'var(--tdt-danger)'
      : 'var(--tdt-fg-2)'
/** 路径取末段（产出物 chip 显示用）。 */
const baseNameOf = (path: string): string => {
  const parts = path.split('/')
  return parts[parts.length - 1] || path
}
/** 一条实例的耗时毫秒（缺任一时刻返回 null，绝不硬凑）。 */
const durationMsOf = (row: InstanceRow): number | null => {
  if (row.dispatched_at === null || row.finished_at === null) return null
  const ms = new Date(row.finished_at).getTime() - new Date(row.dispatched_at).getTime()
  return Number.isFinite(ms) && ms >= 0 ? ms : null
}
// ── 展开区三面板（决策 55，design/features/task-expand-panels.md §三）──────────────────
/** 内容区**定高**（用户 2026-10-02：矮内容显矮、切 tab 高度蹦）——三个 tab 一律同高，内容多就内部滚。 */
const PANEL_H = 360
/** 定高盒：flex 列 —— 过滤行固定在外、滚动只发生在内容盒（P0 结构，三个 tab 共用）。
 *  `position: relative` 保留为内部绝对定位子元素的上下文。 */
const panelBoxStyle: Record<string, string | number> = {
  height: `${PANEL_H}px`, display: 'flex', flexDirection: 'column', minHeight: 0,
  position: 'relative',
}
/**
 * 延迟出现的忙碌标记（用户 2026-10-02）：请求 **超过 400ms 还没返回**才亮。
 * 本地 SQLite 大多数查询是毫秒级，零点几秒的 loading 用户根本看不见，还会闪一下 —— 所以先不显示。
 * 亮起后请求一返回就立刻消失（`BUSY_HOLD_MS = 0`，无保底停留）。
 */
const BUSY_DELAY_MS = 400
const BUSY_HOLD_MS = 0
function useDelayedBusy(active: boolean): boolean {
  const [shown, setShown] = useState(false)
  const shownAtRef = useRef(0)
  useEffect(() => {
    if (active) {
      if (shown) return
      const timer = setTimeout(() => { shownAtRef.current = Date.now(); setShown(true) }, BUSY_DELAY_MS)
      return () => { clearTimeout(timer) }
    }
    if (!shown) return
    // 已亮起 ⇒ 补足到保底时长再消失（保证肉眼看得见）。
    const wait = Math.max(0, BUSY_HOLD_MS - (Date.now() - shownAtRef.current))
    const timer = setTimeout(() => { setShown(false) }, wait)
    return () => { clearTimeout(timer) }
  }, [active, shown])
  return shown
}
/** 盒内可滚动区（撑满剩余高度；过滤行 / 表头不在此盒内 ⇒ 不随内容滚）。 */
const panelScrollFillStyle: Record<string, string | number> = {
  flex: '1 1 auto', minHeight: 0, overflowY: 'auto',
}
const panelWrapStyle: Record<string, string | number> = {
  // 卡片不再统一留白后，展开区自己补左右 / 下内边距，否则内容贴边。
  // 顶部间距交给主行的 12px 下内边距，这里不再留 marginTop（只留虚线 + 10px 上内边距）。
  borderTop: `1px dashed var(--tdt-border)`, paddingTop: '10px', paddingLeft: '14px', paddingRight: '14px', paddingBottom: '12px',
}
const panelBarStyle: Record<string, string | number> = {
  // 表底**贴着**虚线（用户 2026-10-02）：去掉上外边距，只留虚线上方的内边距。
  // 面板总高不变（`panelBoxStyle` 定高 + 内容区 flex:1 自动吃掉这 10px）。
  paddingTop: '10px', borderTop: `1px dashed var(--tdt-border)`,
  display: 'flex', alignItems: 'center', gap: '8px',
}
const miniTableStyle: Record<string, string | number> = { width: '100%', borderCollapse: 'collapse', fontSize: 'var(--tdt-font-sm)' }
const miniCellStyle: Record<string, string | number> = {
  // 行更松（用户 2026-10-02：「上下拉高一点、大气些」）；**不用实线分隔** ⇒ 去掉 borderBottom，
  // 改行交错浅底（`.dsh-tdt-rec-alt`）。
  padding: '9px 10px', textAlign: 'left',
  color: 'var(--tdt-fg)', whiteSpace: 'nowrap', fontSize: 'var(--tdt-font-sm)',
}
const miniCellWrapStyle: Record<string, string | number> = { ...miniCellStyle, whiteSpace: 'normal', wordBreak: 'break-word' }
/** 居中格（用户 2026-10-02：除**产出物 / 备注**两列外，各列内容一律居中）。 */
const miniCellCenterStyle: Record<string, string | number> = { ...miniCellStyle, textAlign: 'center' }
/**
 * 日志**整区**（用户 2026-10-03 取代原 `logBoxStyle` 黑框）：不再套一个框——
 * 上沿一条线（与执行记录表头上沿线同色 `--tdt-border`），从这条线到下方虚线**整块铺底色**，
 * 日志直接铺在里面。等宽字体跟环境风格走。
 */
const logAreaStyle: Record<string, string | number> = {
  ...panelScrollFillStyle,
  borderTop: `1px solid var(--tdt-border)`,
  background: 'var(--tdt-surface-1)',
  // 左右**不留 padding**（用户 2026-10-03）：让日志左边缘与上方过滤下拉框对齐。
  padding: '10px 0',
  fontFamily: monoFont, fontSize: 'var(--tdt-font-xs)', lineHeight: 'var(--tdt-line-sm)',
}
/** 日志行：行间距拉开一点（用户 2026-10-03）。 */
const logRowStyle: Record<string, string | number> = { marginBottom: '6px', wordBreak: 'break-all' }
const overlayStyle: Record<string, string | number> = {
  position: 'fixed', inset: 0, zIndex: 'var(--tdt-z-modal)', background: 'var(--tdt-mask)',
  display: 'flex', alignItems: 'center', justifyContent: 'center',
}
const dialogStyle: Record<string, string | number> = {
  width: '360px', maxWidth: 'calc(100vw - 48px)', boxSizing: 'border-box',
  background: 'var(--tdt-surface-base, #fff)', color: 'var(--tdt-fg)',
  border: `1px solid var(--tdt-border)`, borderRadius: 'var(--tdt-radius-md)', padding: '18px',
  boxShadow: 'var(--tdt-shadow-2, 0 12px 32px rgba(0,0,0,0.4))',
}

/** 执行记录 / 日志的时间戳：`YYYY-MM-DD HH:mm:ss`（与执行记录页同款两位补零）。 */
const formatStamp = (iso: string | null): string =>
  iso === null ? '—' : formatDateTime(iso, { seconds: true, fallback: '—' })

/** 回执产出清单（决策 32③ 真值 JSON）→ 字符串数组；形状不符返回空（不猜）。 */
const outputsOf = (raw: string | null): string[] => {
  if (raw === null || raw === '') return []
  try {
    const parsed: unknown = JSON.parse(raw)
    return Array.isArray(parsed) ? parsed.filter((item): item is string => typeof item === 'string') : []
  } catch {
    return []
  }
}

/** token 用量一格（展开详情用；K/M 大众格式，用户 2026-10-02）。 */
const tokensDetailOf = (row: { token_in: number | null; token_out: number | null; token_in_cache: number | null }): string =>
  `${row.token_in === null ? '—' : formatTokenCount(row.token_in)} / ${row.token_out === null ? '—' : formatTokenCount(row.token_out)} / ${row.token_in_cache === null ? '—' : formatTokenCount(row.token_in_cache)}`
/** 状态三档桶（用户 2026-10-02：过滤只给 执行中 / 失败 / 成功 三档，七态归桶；值传后端 statuses）。 */
const FILTER_BUCKETS: Readonly<Record<string, readonly string[]>> = {
  running: ['pending', 'dispatched', 'running', 'unknown'],
  failed: ['failed', 'skipped'],
  succeeded: ['succeeded'],
}
/** 产出物 / 会话列的裸图标按钮（无边框、无底色；用户 2026-10-02 第四轮：图标化）。 */
const plainIconBtnStyle: Record<string, string | number> = {
  appearance: 'none', display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
  width: '20px', height: '20px', padding: 0, border: 'none', background: 'transparent',
  color: 'var(--tdt-fg-2)', cursor: 'pointer', lineHeight: 0, fontFamily: 'inherit', transition,
}
/**
 * 产出物图标钮（用户 2026-10-02：图标加**浅色圆角方形底板**，hover 变亮 ⇒ 明示可点）。
 * ⚠️ **不写 background**：底板 / hover 走 `.dsh-tdt-rec-out`（inline 背景会盖掉 `:hover`）。
 */
const outputIconBtnStyle: Record<string, string | number> = {
  appearance: 'none', display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
  // 放大（用户 2026-10-02）：28×28 配 16px 图标 ⇒ 图标与底板边缘**每边留 6px**（原先 22×22 只有 3px，
  // 间距正好翻倍）。列高稍增无妨。
  width: '28px', height: '28px', padding: 0, border: 'none',
  color: 'var(--tdt-fg-2)', cursor: 'pointer', lineHeight: 0, fontFamily: 'inherit',
  borderRadius: 'var(--tdt-radius-sm)', transition,
}
/** 产出物图标格（最多 3 个 +「…」更多）。 */
const outputCellStyle: Record<string, string | number> = {
  display: 'inline-flex', alignItems: 'center', gap: '2px', flexWrap: 'nowrap',
}
/** 过滤行外壳（records / logs 共用；在滚动区**外**，不随内容滚）。 */
const filterRowStyle: Record<string, string | number> = {
  display: 'flex', alignItems: 'center', gap: '6px', flexWrap: 'wrap',
  // 下间距必须 == 上间距（用户 2026-10-03）：上间距是「面板外虚线 → 过滤行」= `panelWrapStyle.paddingTop` 10px，
  // 所以这里也用 10px —— 原来 6px，上下明显不一样。
  marginBottom: '10px',
}
/** 过滤行里的字段名（「状态：」等）。 */
const filterLabelStyle: Record<string, string | number> = {
  fontSize: 'var(--tdt-font-xs)', color: 'var(--tdt-fg-3)', flex: 'none',
}
/** 条数过滤（用户 2026-10-02）：**统一居右**，定式 `显示 <N> 条`。 */
const limitRowStyle: Record<string, string | number> = {
  display: 'inline-flex', alignItems: 'center', gap: '4px', marginLeft: 'auto',
  fontSize: 'var(--tdt-font-xs)', color: 'var(--tdt-fg-3)',
}
/** 记录表头样式（sticky 由 `.dsh-tdt-rec-head th` 接管）。 */
const recHeadStyle: Record<string, string | number> = {
  // 标题一律**居中**（用户 2026-10-02）。
  // 底色走 `--tdt-head-bg`：浅色主题**偏深**、暗色主题**偏亮**（两侧都与卡片面拉开层次，
  // 不再出现「浅色纯白 / 暗色纯黑」）。明暗差异单点落在 ui/tokens.ts。
  ...miniCellStyle,
  // 表头**加高**（用户 2026-10-02：太薄了）。
  padding: '11px 10px',
  textAlign: 'center', fontWeight: 600, color: 'var(--tdt-fg-2)',
  background: 'var(--tdt-head-bg)',
  // **上下各一条线，且亮度一致**；⚠️ 必须走 **box-shadow**：
  // `border-collapse: collapse` 下边框归**表格网格**所有 ⇒ sticky 表头滚动时边框会「滑走」
  // （用户 2026-10-02 揪出）。box-shadow 属于 th 自身 ⇒ 跟着表头不动。
  boxShadow: 'inset 0 1px 0 var(--tdt-border), inset 0 -1px 0 var(--tdt-border)',
}
/**
 * 状态图标（用户 2026-10-02 换新）：成功 = 官方**圆勾**（绿）/ 失败·跳过 = 官方**圆叉**（红）/
 * 运行·派发 = 官方 **loading 转圈**（主题色）/ 排队·未知 = 空心圈。
 */
function StatusIcon(props: { status: string }): ReturnType<typeof h> {
  const status = props.status
  if (status === 'succeeded') return h(IconCheckCircleFillRegular, { size: 15, className: 'dsh-tdt-rec-ic-ok' })
  if (status === 'failed' || status === 'skipped') return h(IconCloseCircleFillRegular, { size: 15, className: 'dsh-tdt-rec-ic-bad' })
  if (status === 'running' || status === 'dispatched') return h(IconLoadingOutlineRegular, { size: 15, className: 'dsh-tdt-rec-ic-run' })
  return h('span', { className: 'dsh-tdt-rec-ic-idle' })
}
/** 失败 / 未执行与执行记录页同款标红加粗（决策 54：错就得让他在记录里看见）。 */
const statusStyleOf = (status: string): Record<string, string | number> | undefined =>
  status === 'failed' || status === 'skipped' ? { color: 'var(--tdt-danger)', fontWeight: 600 } : undefined

/**
 * 任务卡片展开区三面板（决策 55）：左下三个分段按钮（基础信息 / 执行记录 / 日志，默认基础信息），
 * 中间内容区三选一替换（统一最大高度滚动容器），右下按钮区（编辑任务 + 删除）。
 * 数据全走 `client/query.ts` 真实取数（AGENTS.md 第五条，禁止 mock）。
 */
function TaskExpandPanel(props: {
  row: TaskOverviewRow
  t: Translate
  tt: Translate
  scheduleLine: string
  modelText: string
  onEdit: (id: string) => void
  onDelete: (id: string) => Promise<string | null>
  /** 产出文件点开（U11 预览面单一入口；undefined = 预览面不可用 ⇒ chips 降级不可点）。 */
  onOpenFile?: (sessionId: string, path: string) => void
  /**
   * 会话弹窗（undefined = 会话面不可用 ⇒ 不出链接）。
   * ⚠️ **只传会话 id**（2026-10-03 铁律）：快照 / 产出 / 标题一律由弹窗自己按会话 id 取，
   * 这样「从哪进」渲染都一样。禁止再加上 heading / outputs / snapshot 这类参数。
   */
  onOpenSession?: (sessionId: string) => void
}) {
  const { row, t, tt, scheduleLine, modelText, onEdit, onDelete, onOpenFile, onOpenSession } = props
  const [tab, setTab] = useState<'info' | 'records' | 'logs'>('info')
  // ── 基础信息面板（用户 2026-10-03 改版）──
  // 右栏只看「上次执行」一条 ⇒ 取最近一条终态实例（成功 / 失败 / 跳过 / 未知）。
  const [infoLast, setInfoLast] = useState<InstanceRow | null>(null)
  const [infoLoading, setInfoLoading] = useState(false)
  const [infoError, setInfoError] = useState<string | null>(null)
  const [infoLoaded, setInfoLoaded] = useState(false)
  // 日历 / 时分文案**单源**（与任务编辑器同一份：editor-fields.calendarLabelsOf / timeLabelsOf）。
  const calendarLabels = useMemo(() => calendarLabelsOf(t), [t])
  const timeLabels = useMemo(() => timeLabelsOf(t), [t])
  // 时间范围控件文案（records / logs 共用一份）。
  const timeRangeLabels: TimeRangeLabels = useMemo(() => ({
    all: t('trAll'), custom: t('trCustom'), from: t('cardFrom'), to: t('cardTo'),
    presets: {
      today: t('trToday'), yesterday: t('trYesterday'), thisWeek: t('trThisWeek'),
      lastWeek: t('trLastWeek'), thisMonth: t('trThisMonth'), lastMonth: t('trLastMonth'),
    },
  }), [t])

  // ── 执行记录面板 ──
  // 初始 **''（未选）** ⇒ 下拉显示灰色占位「状态」；「全部」与未选同义（都不过滤）。
  const [recStatus, setRecStatus] = useState('')
  const [recRange, setRecRange] = useState<TimeRangeValue>({ from: '', to: '' })
  // 条数（用户 2026-10-02：执行记录也要有条数过滤，默认 100，别一次铺几百条）。
  const [recLimit, setRecLimit] = useState(100)
  const [records, setRecords] = useState<InstanceRow[] | null>(null)
  const [recLoading, setRecLoading] = useState(false)
  const [recError, setRecError] = useState<string | null>(null)
  const [openInstance, setOpenInstance] = useState<string | null>(null)
  const [events, setEvents] = useState<EventRow[] | null>(null)
  // 注：原先这里还有个「加载中」状态，只用在展开区的加载提示上；
  // 展开区去掉标题后它**只写不读** ⇒ 按无死代码原则删除（错误态 `eventsError` 保留）。
  const [eventsError, setEventsError] = useState<string | null>(null)

  // ── 日志面板 ──
  const [logKeyword, setLogKeyword] = useState('')
  const [logRange, setLogRange] = useState<TimeRangeValue>({ from: '', to: '' })
  const [logLimit, setLogLimit] = useState(100)
  const [logs, setLogs] = useState<LogRow[] | null>(null)
  const [logLoading, setLogLoading] = useState(false)
  // 忙碌指示**延迟 400ms** 才亮（本地查询多为毫秒级，别为看不见的一瞬闪一下）。
  // ⚠️ hooks 必须在组件顶层调用（renderRecords / renderLogs 是条件渲染的函数，里面不能放 hooks）。
  const recBusy = useDelayedBusy(recLoading)
  const logBusy = useDelayedBusy(logLoading)
  const [logError, setLogError] = useState<string | null>(null)

  // ── 删除确认 ──
  const [confirmDelete, setConfirmDelete] = useState(false)
  const [deleting, setDeleting] = useState(false)

  // 切到基础信息 ⇒ 取「上次执行」一条（新→旧排序，limit 1 即最近的一条终态实例）。
  useEffect(() => {
    if (tab !== 'info') return
    let alive = true
    setInfoLoading(true)
    setInfoError(null)
    fetchInstances({ taskId: row.id, statuses: ['succeeded', 'failed', 'skipped', 'unknown'], limit: 1 })
      .then(({ rows }) => {
        if (!alive) return
        setInfoLast(rows[0] ?? null)
        setInfoLoaded(true)
      })
      .catch((error: unknown) => { if (alive) setInfoError(error instanceof Error ? error.message : String(error)) })
      .finally(() => { if (alive) setInfoLoading(false) })
    return () => { alive = false }
  }, [tab, row.id])

  // 切到执行记录 / 筛选变化 ⇒ 重拉（alive 守卫防旧轮响应覆盖新轮；筛选变了顺手收起下钻行）。
  useEffect(() => {
    if (tab !== 'records') return
    let alive = true
    setRecLoading(true)
    setRecError(null)
    // 边界归一（半开区间 [from, to)）只在 ui/time-range 一处算（用户 2026-10-02 第四轮）。
    const range = rangeToQuery(recRange, 'day')
    fetchInstances({
      taskId: row.id,
      // 三档桶（用户 2026-10-02）：执行中 = pending/dispatched/running/unknown；失败 = failed/skipped；成功 = succeeded。
      statuses: recStatus === '' || recStatus === 'all' ? undefined : FILTER_BUCKETS[recStatus],
      from: range.fromTs,
      to: range.toTs,
      limit: recLimit,
    })
      .then(({ rows }) => {
        if (!alive) return
        setRecords(rows)
        setOpenInstance(null)
        setEvents(null)
      })
      .catch((error: unknown) => { if (alive) setRecError(error instanceof Error ? error.message : String(error)) })
      .finally(() => { if (alive) setRecLoading(false) })
    return () => { alive = false }
  }, [tab, row.id, recStatus, recRange, recLimit])

  // 点一行 ⇒ 取该次执行的事件时间线（seq 升序 = 旧→新）。
  useEffect(() => {
    if (openInstance === null) return
    let alive = true
    setEventsError(null)
    setEvents(null)
    fetchEvents(openInstance)
      .then(rows => { if (alive) setEvents(rows) })
      .catch((error: unknown) => { if (alive) setEventsError(error instanceof Error ? error.message : String(error)) })
    return () => { alive = false }
  }, [openInstance])

  // 切到日志 / 关键字、日期、条数变化 ⇒ 重拉。
  useEffect(() => {
    if (tab !== 'logs') return
    let alive = true
    setLogLoading(true)
    setLogError(null)
    // 日志按**分钟级**粒度（用户 2026-10-02：要定位到哪一分钟出错），边界同样半开区间。
    const range = rangeToQuery(logRange, 'minute')
    fetchLogs({
      taskId: row.id,
      keyword: logKeyword.trim() === '' ? undefined : logKeyword.trim(),
      from: range.fromTs,
      to: range.toTs,
      limit: logLimit,
    })
      .then(({ rows }) => { if (alive) setLogs(rows) })
      .catch((error: unknown) => { if (alive) setLogError(error instanceof Error ? error.message : String(error)) })
      .finally(() => { if (alive) setLogLoading(false) })
    return () => { alive = false }
  }, [tab, row.id, logKeyword, logRange, logLimit])

  // 右栏「上次执行」：用与左栏同一套「标签—值」网格排布
  //（状态 / 计划执行 / 实际开始 / 结束时间 / 执行时长 / Token / 备注），
  // 下面再挂「查看会话」与产出物列表（产出物行 hover 有底色，走 CSS class）。
  const renderLastRun = (instance: InstanceRow | null): ReturnType<typeof h> => {
    if (instance === null) {
      return h('div', { style: { fontSize: 'var(--tdt-font-xs)', color: 'var(--tdt-fg-3)' } }, t('infoNoRun'))
    }
    const sid = instance.session_id
    const canOpenSession = sid !== null && onOpenSession !== undefined
    const canOpenFile = sid !== null && onOpenFile !== undefined
    const outputs = outputsOf(instance.outputs)
    const dur = durationMsOf(instance)
    const tokens = instance.token_in === null && instance.token_out === null
      ? null
      : formatTokenCount((instance.token_in ?? 0) + (instance.token_out ?? 0))
    const note = instance.note === null || instance.note === undefined ? '' : instance.note
    const timeOf = (iso: string | null): string => iso === null ? '—' : formatDateTime(iso, { seconds: true, fallback: '—' })
    // 「任务会话」（用户 2026-10-03 二次修订）：不要边框 / 底色，做成**超链接**——虚线下划线 + hover 变色。
    // 颜色 / 下划线都在 `.dsh-tdt-info-session` 里（inline 会盖掉 :hover）；这里只放布局。
    // 会话名由服务端按 `sessionTitleOf` 单源下发；缺名（旧行）退回会话 id，仍可点。
    const sessionName = instance.session_title ?? sid ?? ''
    const sessionIcon = h(IconSearchOutlineRegular, { size: 14 })
    const sessionLabel = h('span', { style: { flex: '1 1 auto', minWidth: 0 } }, h(MarqueeText, { text: sessionName }))
    const sessionLinkStyle: Record<string, string | number> = {
      display: 'inline-flex', alignItems: 'center', gap: '6px', maxWidth: '100%', boxSizing: 'border-box',
      padding: '1px 0', font: 'inherit', fontSize: 'var(--tdt-font-sm)', textAlign: 'left',
      cursor: canOpenSession ? 'pointer' : 'default',
    }
    const sessionChip = sid === null || sessionName === ''
      ? h('span', { style: { color: 'var(--tdt-fg-3)' } }, '—')
      : canOpenSession
        ? h('button', {
          type: 'button', className: 'dsh-tdt-info-session', title: sessionName, style: sessionLinkStyle,
          onClick: () => { onOpenSession(sid) },
        }, sessionIcon, sessionLabel)
        : h('span', {
          className: 'dsh-tdt-info-session', title: sessionName,
          style: { ...sessionLinkStyle, borderBottom: '1px dashed var(--tdt-border-strong)' },
        }, sessionIcon, sessionLabel)
    return h('div', null,
      InfoField({
        label: t('colStatus'),
        children: h('span', {
          style: { display: 'inline-flex', alignItems: 'center', gap: '6px', fontWeight: 500, color: infoStatusColorOf(instance.status) },
        },
          h(StatusIcon, { status: instance.status }),
          statusTextOf(instance.status, t),
        ),
      }),
      // 任务会话：紧跟在状态下面（用户 2026-10-03）。
      InfoField({ label: t('infoSession'), children: sessionChip }),
      // 时间四件套（用户 2026-10-03：空间够，计划 / 开始 / 结束 / 时长都放上）。
      InfoField({ label: t('colPlanned'), children: timeOf(instance.scheduled_at) }),
      InfoField({ label: t('colActualStart'), children: timeOf(instance.dispatched_at) }),
      InfoField({ label: t('infoFinishedAt'), children: timeOf(instance.finished_at) }),
      dur === null ? null : InfoField({ label: t('infoDuration'), children: formatDurationHms(dur) }),
      tokens === null ? null : InfoField({ label: t('colTokens'), children: h('span', { title: tokensDetailOf(instance) }, tokens) }),
      note === ''
        ? null
        : InfoField({ label: t('colNote'), children: h('span', { style: { color: 'var(--tdt-danger)' } }, note) }),
      outputs.length === 0
        ? null
        : h('div', { style: { marginTop: '14px' } },
          h('div', { style: { marginBottom: '6px', fontSize: 'var(--tdt-font-xs)', color: 'var(--tdt-fg-3)' } }, t('colOutputs')),
          h('div', { style: { display: 'flex', flexDirection: 'column' } },
            outputs.map(output => h('button', {
              key: output, type: 'button', title: output,
              className: 'dsh-tdt-info-out',
              style: {
                display: 'flex', alignItems: 'center', gap: '6px', width: '100%', boxSizing: 'border-box',
                padding: '4px 6px', border: 'none', color: 'var(--tdt-fg)', font: 'inherit',
                fontSize: 'var(--tdt-font-xs)', textAlign: 'left', borderRadius: 'var(--tdt-radius-xs)',
                cursor: canOpenFile ? 'pointer' : 'default',
              },
              onClick: canOpenFile && onOpenFile !== undefined && sid !== null ? () => { onOpenFile(sid, output) } : undefined,
            },
              h(FileTypeIcon, { path: output, size: 14 }),
              h('span', { style: { overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' } }, baseNameOf(output)),
            )),
          ),
        ),
    )
  }

  const renderInfo = (): ReturnType<typeof h> => h('div', { style: panelBoxStyle },
    // 两栏：左配置（约 58%）+ 右最近执行（约 42%，**独立滚动**）；整块仍在同一个定高盒内 ⇒ 切 tab 高度不蹦。
    h('div', { style: infoWrapStyle },
      // 左栏：任务配置（纸表格：标签 + 值，逐行留白；不再显示提示词）。
      h('div', { style: infoConfigStyle },
        h('div', { style: infoGroupTitleStyle }, t('infoSectionConfig')),
        InfoField({ label: t('listFieldSchedule'), children: scheduleLine }),
        InfoField({ label: t('listFieldWorkspace'), children: row.workspace }),
        InfoField({ label: t('listFieldModel'), children: modelText }),
        InfoField({ label: t('listFieldRetry'), children: String(row.retryMax) }),
        InfoField({ label: t('listFieldWindow'), children: row.schedule.window }),
        InfoField({
          label: t('listSectionAttachments'),
          children: row.attachments.length === 0
            ? h('span', { style: { color: 'var(--tdt-fg-3)' } }, t('listNone'))
            : h('div', { style: { display: 'flex', flexWrap: 'wrap', gap: '2px 10px' } },
              row.attachments.map(item => {
                // 服务端已给出绝对路径 + 预览锚点会话时，附件可点开预览（同一 openFile 入口）；
                // 缺任一个（老版本 / 拿不到锚点）⇒ 退回纯展示，绝不造假。
                const absPath = item.path
                const anchor = item.anchorSessionId
                const icon = h(FileTypeIcon, { path: item.name, size: 14 })
                const name = h('span', null, item.name)
                return absPath !== undefined && anchor !== undefined && onOpenFile !== undefined
                  ? h('button', {
                    key: `${item.kind}:${item.name}`, type: 'button', title: absPath, className: 'dsh-tdt-info-out',
                    style: {
                      display: 'inline-flex', alignItems: 'center', gap: '4px', padding: '2px 6px',
                      border: 'none', color: 'var(--tdt-fg)', font: 'inherit', fontSize: 'var(--tdt-font-sm)',
                      cursor: 'pointer', borderRadius: 'var(--tdt-radius-xs)', textAlign: 'left',
                    },
                    onClick: () => { onOpenFile(anchor, absPath) },
                  }, icon, name)
                  : h('span', { key: `${item.kind}:${item.name}`, style: { display: 'inline-flex', alignItems: 'center', gap: '4px' } }, icon, name)
              }),
            ),
        }),
        InfoField({
          label: t('listSectionDepends'),
          children: row.depends.length === 0
            ? h('span', { style: { color: 'var(--tdt-fg-3)' } }, t('listNone'))
            : h('div', { style: { display: 'flex', flexWrap: 'wrap', gap: '4px 12px' } },
              row.depends.map(dep => h('span', { key: dep.id }, `${dep.title}${dep.enabled ? '' : t('listDisabledTag')}`)),
            ),
        }),
      ),
      // 右栏：只看「上次执行」一条（用户 2026-10-03：别那么麻烦，成功显成功、失败显失败），内容多只滚这一栏。
      h('div', { style: infoRecentStyle },
        h('div', { style: infoGroupTitleStyle }, t('infoLastRun')),
        infoError !== null
          ? h('div', { style: { fontSize: 'var(--tdt-font-xs)', color: 'var(--tdt-danger)' } }, `${t('cardLoadFailed')}：${infoError}`)
          : infoLoading && !infoLoaded
            // 忙碌指示**统一走右下角那个共用 Loading**（用户铁律：全站只有一个 loading，不在这里另写文字）。
            ? h(Loading, { label: t('loading') })
            : renderLastRun(infoLast),
      ),
    ),
  )

  const renderRecords = (): ReturnType<typeof h> => h('div', { style: panelBoxStyle },
    // 浮动忙碌指示：fixed 到主内容盒右下角 ⇒ **不占布局空间**，不再把筛选行挤过去又挤回来。
    recBusy ? h(Loading, { label: t('loading') }) : null,
    // 过滤行固定在定高盒外（不随内容滚）：状态三档 + 时间范围控件（用户 2026-10-02 第四轮）。
    h('div', { style: filterRowStyle },
      // 不再单写「状态：」二字（用户 2026-10-02）：**未选时占位就是灰色的「状态」**，
      // 与选中「全部」同义（都不过滤）⇒ 靠 placeholder 自证身份。
      h(SelectField, {
        value: recStatus,
        options: [
          { value: 'all', label: tt('filterAll') },
          // 顺序 = 全部 / 成功 / 失败 / 运行中（用户 2026-10-02 点名）。
          // ⚠️ 下拉**不必**守表格的「两字」规矩（那是为表格对齐好看）⇒ 这里用「运行中」。
          { value: 'succeeded', label: statusTextOf('succeeded', t) },
          { value: 'failed', label: statusTextOf('failed', t) },
          { value: 'running', label: t('filterRunning') },
        ],
        onChange: (next: string) => { setRecStatus(next) },
        placeholder: t('colStatus'),
        emptyLabel: t('editorNoOptions'),
        ariaLabel: t('colStatus'),
        // 收窄一档（用户 2026-10-02 第四轮）：md(28)，与时间范围控件同档。
        size: 'md',
        width: 96,
      }),
      h(TimeRange, {
        value: recRange, onChange: setRecRange,
        labels: timeRangeLabels, calendarLabels, timeLabels,
        precision: 'day', size: 'md',
      }),
      // 条数过滤：**统一放最右边**，定式 `显示 <N> 条`（用户 2026-10-02）。
      h('label', { style: limitRowStyle },
        t('limitPrefix'),
        h(SelectField, {
          value: String(recLimit),
          options: [50, 100, 200].map(n => ({ value: String(n), label: String(n) })),
          onChange: (next: string) => { setRecLimit(Number(next)) },
          placeholder: String(recLimit),
          emptyLabel: t('editorNoOptions'),
          ariaLabel: t('cardLogLimit'),
          size: 'md',
          width: 70,
        }),
        t('limitSuffix'),
      ),
      recError !== null ? h('span', { style: { fontSize: 'var(--tdt-font-xs)', color: 'var(--tdt-danger)' } }, `${t('cardLoadFailed')}：${recError}`) : null,
    ),
    h('div', { style: panelScrollFillStyle },
      records === null
        ? null
        : records.length === 0
          // 空结果有两种成因：① 该任务确实从没执行过；② 有筛选（状态 / 时间范围）但没命中。
          // 后者不能说「还没有执行记录」（那会误导成「从没跑过」），改用中性「没有符合筛选条件的数据」。
          ? h('p', { style: faintStyle },
              ((recStatus !== '' && recStatus !== 'all') || recRange.from !== '' || recRange.to !== '')
                ? t('cardRecordsEmptyFiltered')
                : t('cardRecordsEmpty'))
          : h('table', { style: { ...miniTableStyle, tableLayout: 'fixed' } },
            h('thead', { className: 'dsh-tdt-rec-head' }, h('tr', null,
              // 除「备注」外**一律定长**（备注是唯一弹性列，拉伸 / 收缩只动它）。
              // 列序（用户 2026-10-02 二次调整）：**查看会话在最后、产出物在倒数第二**——
              // 「用眼睛看的」在前（含备注），「要点的」排在后面挨在一起。
              h('th', { style: { ...recHeadStyle, width: '76px' } }, t('colStatus')),
              // 计划执行：年改**四位**（`2026-09-30 15:10`）⇒ 列宽相应放宽；备注是弹性列会自动让位。
              h('th', { style: { ...recHeadStyle, width: '140px' } }, t('colPlanned')),
              h('th', { style: { ...recHeadStyle, width: '84px' } }, t('colActualStart')),
              h('th', { style: { ...recHeadStyle, width: '76px' } }, t('colDuration')),
              h('th', { style: { ...recHeadStyle, width: '72px' } }, t('colTokens')),
              h('th', { style: recHeadStyle }, t('colNote')),
              h('th', { style: { ...recHeadStyle, width: '96px' } }, t('colOutputs')),
              h('th', { style: { ...recHeadStyle, width: '68px' } }, t('colSession')),
            )),
            h('tbody', null,
              records.flatMap((instance, index) => {
                const open = openInstance === instance.id
                const outputs = outputsOf(instance.outputs)
                const sid = instance.session_id
                const openFile = onOpenFile
                const openSession = onOpenSession
                const canOpenFile = sid !== null && openFile !== undefined
                const canOpenSession = sid !== null && openSession !== undefined
                // 时长 = 结束 − **实际开始**（未派发回退计划时刻；在跑 / 未回执 ⇒ NaN ⇒ '-'）。
                const durMs = instance.finished_at === null
                  ? Number.NaN
                  : Date.parse(instance.finished_at) - Date.parse(instance.dispatched_at ?? instance.scheduled_at)
                const mainRow = h('tr', {
                  key: instance.id,
                  // 斑马纹：奇数行浅底（`.dsh-tdt-rec-alt`）；展开行盖成第二层面。
                  // 斑马纹 + hover 高亮（hover 由 `.dsh-tdt-rec-row:hover` 接管）。
                  className: ['dsh-tdt-rec-row', open || index % 2 === 0 ? '' : 'dsh-tdt-rec-alt'].join(' ').trim(),
                  // 展开态走**带透明度的蓝**（`--tdt-open-bg`）——不用灰色：灰跟斑马纹分不出来。
                  style: { cursor: 'pointer', ...(open ? { background: 'var(--tdt-open-bg)' } : {}) },
                  onClick: () => { setOpenInstance(open ? null : instance.id) },
                },
                  // ① 状态图标 + 通用短名（**居中**：状态已统一两字，按字宽算好间距）。
                  h('td', { style: miniCellCenterStyle },
                    h('span', { style: { display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: '6px' } },
                      h(StatusIcon, { status: instance.status }),
                      h('span', {
                        style: instance.status === 'succeeded' ? { color: 'var(--tdt-success)' } : statusStyleOf(instance.status),
                      }, statusTextOf(instance.status, t)),
                    ),
                  ),
                  // ② 计划执行：YY-MM-DD HH:mm（完整时刻进 hover）。
                  h('td', { style: miniCellCenterStyle },
                    h('span', { title: formatStamp(instance.scheduled_at) }, formatPlanStamp(instance.scheduled_at))),
                  // ③ 实际开始：HH:mm:ss（未派发 ⇒ '-'）。
                  h('td', { style: miniCellCenterStyle },
                    h('span', { title: instance.dispatched_at === null ? undefined : formatStamp(instance.dispatched_at) }, formatClock(instance.dispatched_at))),
                  // ④ 执行时长：H:MM:SS（有小时）/ MM:SS。
                  h('td', { style: miniCellCenterStyle }, formatDurationHms(durMs)),
                  // ⑤ 消耗 token（用户 2026-10-02 提上一级）：总量 K/M 格式，hover 看输入/输出/缓存明细。
                  h('td', { style: miniCellCenterStyle },
                    instance.token_in === null && instance.token_out === null
                      ? h('span', { style: { color: 'var(--tdt-fg-3)' } }, '-')
                      : h('span', { title: tokensDetailOf(instance) }, formatTokenCount((instance.token_in ?? 0) + (instance.token_out ?? 0)))),
                  // ⑥ 备注：**错误 / 未执行的原因**（服务端 `attachNotes` 从最新原因事件推导）。
                  // 全表**唯一弹性列**（不定长）：拉伸 / 收缩只动它；超长省略号，hover 看全文。
                  // ⚠️ **不要红色**（用户 2026-10-02：不是要提醒他去看备注）——走最浅的灰 `--tdt-fg-3`，
                  // 比正文更淡，深浅两主题都是「退后一层」的存在感。
                  h('td', { style: { ...miniCellStyle, maxWidth: 0 } },
                    instance.note === null || instance.note === undefined || instance.note === ''
                      ? null
                      : h('span', {
                        title: instance.note,
                        style: {
                          display: 'block', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                          color: 'var(--tdt-fg-3)',
                        },
                      }, instance.note),
                  ),
                  // ⑦ 产出物（**倒数第二列**，紧挨「查看会话」）：官方文件类型图标 ≤3 个；
                  // >3 收「…」（点开会话看完整）；无产出 ⇒ 该格空。**不居中**（图标从左到右排）。
                  h('td', { style: miniCellStyle },
                    outputs.length === 0
                      ? null
                      : h('span', { style: outputCellStyle },
                        outputs.slice(0, 3).map(output => h('button', {
                          key: output, type: 'button', title: output, className: 'dsh-tdt-rec-out',
                          style: { ...outputIconBtnStyle, cursor: canOpenFile ? 'pointer' : 'default' },
                          onClick: (event: { stopPropagation(): void }) => {
                            event.stopPropagation()
                            if (canOpenFile && openFile !== undefined && sid !== null) openFile(sid, output)
                          },
                        }, h(FileTypeIcon, { path: output, size: 16 }))),
                        outputs.length > 3
                          ? h('button', {
                            type: 'button', title: t('viewSession'), 'aria-label': t('viewSession'),
                            className: 'dsh-tdt-rec-out',
                            style: { ...outputIconBtnStyle, width: 'auto', padding: '0 6px', fontSize: 'var(--tdt-font-md)' },
                            onClick: (event: { stopPropagation(): void }) => {
                              event.stopPropagation()
                              if (canOpenSession && openSession !== undefined && sid !== null) openSession(sid)
                            },
                          }, '…')
                          : null,
                      ),
                  ),
                  // ⑧ 会话记录（**最后一列**）：小按钮「查看」（用户 2026-10-02：不要光秃秃一个图标）+ 定宽居中。
                  h('td', { style: miniCellCenterStyle },
                    canOpenSession && openSession !== undefined && sid !== null
                      ? h(Button, {
                        variant: 'outline', size: 'sm',
                        onClick: (event: { stopPropagation(): void }) => { event.stopPropagation(); openSession(sid) },
                      }, t('colView'))
                      : null,
                  ),
                )
                const detailRow = open
                  ? h('tr', { key: `${instance.id}-detail` },
                    // 展开内容区：**更淡一档的蓝**（`--tdt-open-bg-soft`）⇒ 与展开行本身区隔开，
                    // 且不是灰 / 不是纯黑纯白（用户 2026-10-02）。
                    // 展开区（用户 2026-10-02）：**外圈 padding 翻倍**（9/10 → 18/20），别再密密麻麻。
                    h('td', {
                      colSpan: 8,
                      style: { ...miniCellWrapStyle, padding: '18px 20px', background: 'var(--tdt-open-bg-soft)' },
                    },
                      // 展开区**直接铺执行日志**（用户 2026-10-02）：**不要标题、不要黑框**——
                      // 展开的日志本来就是给要看细节的人看的，套一层框 + 一个小标题纯属多余。
                      // 底色沿用 `--tdt-open-bg-soft`（淡蓝）就够了，用它把展开区区隔出来。
                      eventsError !== null
                        ? h('div', { style: { fontSize: 'var(--tdt-font-xs)', color: 'var(--tdt-danger)' } }, `${t('cardLoadFailed')}：${eventsError}`)
                        : events === null
                          ? null
                          : events.length === 0
                            ? h('div', { style: { fontSize: 'var(--tdt-font-xs)', color: 'var(--tdt-fg-3)' } }, t('cardEventsEmpty'))
                            // 行间距拉开；字色整体**压暗一档**（日志是慢慢翻的，不要跟正文一样刺眼）。
                            : events.map(event => h('div', {
                              key: event.seq, style: { marginBottom: '7px', lineHeight: 'var(--tdt-line-md)' },
                            },
                              h('span', { style: { color: 'var(--tdt-fg-3)' } }, `${formatStamp(event.ts)} `),
                              h('span', { style: { color: 'var(--tdt-fg-2)' } }, `${event.kind} `),
                              h('span', { style: { color: 'var(--tdt-fg-2)' } }, event.detail ?? ''),
                            )),
                    ),
                  )
                  : null
                return [mainRow, detailRow]
              }),
            ),
          ),
        ),
  )

  const renderLogs = (): ReturnType<typeof h> => h('div', { style: panelBoxStyle },
    // 同执行记录面板：浮动忙碌指示，fixed 到主内容盒右下角。
    logBusy ? h(Loading, { label: t('loading') }) : null,
    // 过滤行固定在定高盒外（与执行记录面板同口径）：关键字 + **分钟级**时间范围 + 条数。
    h('div', { style: filterRowStyle },
      h(TdtInput, {
        value: logKeyword,
        onChange: setLogKeyword,
        placeholder: t('cardKeyword'),
        size: 'md',
        style: { width: '140px' },
      }),
      h(TimeRange, {
        value: logRange, onChange: setLogRange,
        labels: timeRangeLabels, calendarLabels, timeLabels,
        precision: 'minute', size: 'md',
      }),
      // 条数过滤：**居右**，定式 `显示 <N> 条`（与执行记录面板同一件、同一位置）。
      h('label', { style: limitRowStyle },
        t('limitPrefix'),
        h(SelectField, {
          value: String(logLimit),
          options: [50, 100, 200].map(n => ({ value: String(n), label: String(n) })),
          onChange: (next: string) => { setLogLimit(Number(next)) },
          placeholder: String(logLimit),
          emptyLabel: t('editorNoOptions'),
          ariaLabel: t('cardLogLimit'),
          size: 'md',
          width: 70,
        }),
        t('limitSuffix'),
      ),

      logError !== null ? h('span', { style: { fontSize: 'var(--tdt-font-xs)', color: 'var(--tdt-danger)' } }, `${t('cardLoadFailed')}：${logError}`) : null,
    ),
    // 日志整区（用户 2026-10-03）：**不套框** —— 上面一条线（与执行记录表头上沿线同色 `--tdt-border`），
    // 从这条线一直到下方虚线，整块铺上日志原本的底色；日志直接铺在里面。
    h('div', { style: logAreaStyle },
      logs === null
        ? null
        : logs.length === 0
          ? h('p', { style: faintStyle }, t('cardLogsEmpty'))
          : logs.map(row => h('div', { key: row.seq, style: logRowStyle },
            h('span', { style: { color: 'var(--tdt-fg-3)' } }, `${formatStamp(row.ts)} `),
            h('span', {
              style: {
                color: row.level === 'error' ? 'var(--tdt-danger)' : row.level === 'warn' ? 'var(--tdt-accent)' : 'var(--tdt-fg-3)',
                fontWeight: row.level === 'error' ? 600 : 400,
              },
            }, `[${row.level}]`),
            ' ',
            // 事件类型与正文都压到 `--tdt-fg-2`：纯白在深底上太刺眼（用户 2026-10-03）。
            h('span', { style: { color: 'var(--tdt-fg-2)' } }, `${row.kind}: `),
            h('span', { style: { color: 'var(--tdt-fg-2)' } }, row.message),
          )),
    ),
  )

  /** 删除确认框（决策 55）：官方无嵌套 confirm 件可用 ⇒ 自绘 overlay + 主题变量（z 1070 盖过抽屉 1040 / 确认 1060）。 */
  const renderConfirm = (): ReturnType<typeof h> => h('div', {
    style: overlayStyle,
    onClick: () => { if (!deleting) setConfirmDelete(false) },
  },
    h('div', { style: dialogStyle, onClick: (event: { stopPropagation(): void }) => { event.stopPropagation() } },
      h('div', { style: { fontSize: 'var(--tdt-font-lg)', fontWeight: 600, marginBottom: '8px' } }, t('cardDeleteTitle')),
      h('div', { style: { fontSize: 'var(--tdt-font-sm)', color: 'var(--tdt-fg-2)', lineHeight: 'var(--tdt-line-sm)', marginBottom: '14px' } }, t('cardDeleteDesc')),
      h('div', { style: { display: 'flex', justifyContent: 'flex-end', gap: '8px' } },
        h(Button, {
          variant: 'outline', size: 'sm', disabled: deleting,
          onClick: () => { setConfirmDelete(false) },
        }, t('cardCancel')),
        h(Button, {
          variant: 'danger', size: 'sm', disabled: deleting,
          onClick: () => {
            setDeleting(true)
            void onDelete(row.id).finally(() => { setDeleting(false); setConfirmDelete(false) })
          },
        }, deleting ? t('loading') : t('cardDelete')),
      ),
    ),
  )

  return h('div', { style: panelWrapStyle },
    // 内容区：三选一替换；**滚动只发生在各 tab 自己的内容盒里**（过滤行 / 表头固定，用户 2026-10-02）。
    tab === 'info' ? renderInfo() : tab === 'records' ? renderRecords() : renderLogs(),
    // 底栏：左 = 三滑块；右 = 编辑任务 + 删除。
    h('div', { style: panelBarStyle },
      // 三面板滑块走 UI 基础层唯一实现：variant="inset" = 在卡片底色上（轨道下沉、选中抬到第三层面）
      h(Segmented<'info' | 'records' | 'logs'>, {
        value: tab,
        size: 'md',
        variant: 'inset',
        items: [
          { value: 'info', label: t('cardTabInfo') },
          { value: 'records', label: t('cardTabRecords') },
          { value: 'logs', label: t('cardTabLogs') },
        ],
        onChange: setTab,
      }),
      h('span', { style: { flex: '1 1 auto' } }),
      // 右下按钮区顺序（用户 2026-10-02）：删除在编辑**左边**。
      // 高度跟同排三滑块一样走 md(28)（用户 2026-10-01：此前 sm=24 比滑块矮 4px）。
      h(Button, {
        variant: 'outline', size: 'md', className: 'dsh-tdt-btn--danger-ink',
        onClick: () => { setConfirmDelete(true) },
      }, t('cardDelete')),
      h(Button, {
        variant: 'outline', size: 'md', icon: h(IconEditOutlineRegular, { size: 14 }),
        onClick: () => { onEdit(row.id) },
      }, t('editorEdit')),
    ),
    confirmDelete ? renderConfirm() : null,
  )
}

function TaskCard(props: {
  row: TaskOverviewRow
  t: Translate
  tt: Translate
  open: boolean
  onToggleOpen: () => void
  onEdit: (id: string) => void
  /** 删除任务（决策 55）：返回 null = 成功，否则返回人话错误（由父级 Toast 展示）。 */
  onDelete: (id: string) => Promise<string | null>
  onOpenFile?: (sessionId: string, path: string) => void
  /** 会话弹窗：**只传会话 id**（见 TaskExpandPanel 说明）。 */
  onOpenSession?: (sessionId: string) => void
  onToggleEnabled: (id: string, enabled: boolean) => void
  refOf: (el: HTMLElement | null) => void
}) {
  const { row, t, tt, open, onToggleOpen, onEdit, onDelete, onOpenFile, onOpenSession, onToggleEnabled, refOf } = props
  // 排期人话与编辑器「预计执行」**同一份实现**（`schedule-text.ts`，优先吃结构化 ui）⇒ 两处必然一致。
  const scheduleLine = scheduleText(scheduleSpecFromSchedule(row.schedule), t)
  const modelText = row.model === null ? tt('listFieldModelDefault') : row.model

  return h('div', { ref: refOf, className: 'dsh-tdt-card', style: cardStyle },
    // 主行：**垂直居中**（用户 2026-09-30：右侧开关 / 展开箭头要与卡片边界居中对齐）
    // **整行可点**展开 / 收起（用户 2026-10-03）：箭头保留，只是同一个动作的显式入口。
    // 主行自带卡片的 padding（卡片本身不再统一留白）⇒ hover 高亮能**边到边**铺满这一溜任务基本信息；
    // 展开区是它的兄弟节点、**不在**这个 div 里 ⇒ hover 蓝不会蔓延到下面的设置 / 记录 / 日志（用户 2026-10-03）。
    h('div', {
      className: 'dsh-tdt-card-row',
      style: { display: 'flex', alignItems: 'center', gap: '12px', cursor: 'pointer', padding: '12px 14px' },
      onClick: () => {
        // 拖选文字时**不要**误展开（选区非空 ⇒ 用户在复制，不是要点开卡片）。
        const sel = typeof window === 'undefined' ? null : window.getSelection()
        if (sel !== null && sel.toString() !== '') return
        onToggleOpen()
      },
    },
      h(StatusRail, { row }),
      h('div', { style: { flex: '1 1 auto', minWidth: 0 } },
        // 标题 / 执行方式：**单行省略号 + hover 跑马灯**（窗口窄、文字长不再撑高卡片，用户 2026-09-30）。
        // 编号与创建时间都挂在**标题行尾部**（同一 faintStyle = 同一字号），不再另起第三行 ——
        // 用户 2026-10-03：新建任务时第三行凭空冒出一个「创建于」行很跳，且白占一行高度。
        h('div', { style: { display: 'flex', alignItems: 'baseline', gap: '6px', minWidth: 0 } },
          h('div', { style: { ...titleStyle, flex: '0 1 auto', minWidth: 0 } }, h(MarqueeText, { text: row.title })),
          row.code !== null ? h('span', { style: { ...faintStyle, flex: 'none', display: 'inline' } }, `[${row.code}]`) : null,
          // 创建时间**长显**（用户拍板不隐藏）：`[2026-10-03 创建]`。
          // ⚠️ `createdAt` 只有**经 UI 表单保存**的任务才有（index.ts:425），老定义 / 手工写的 JSON 没有
          // ⇒ 旧写法整段不渲染，用户看到「有的有、有的没有」。用户 2026-10-03 要求**每个任务都要有这一行**，
          //    但铁律「不许编造数据」不许凭空补时间 ⇒ 缺值时显示明确的「创建时间未知」占位（不是空白、也不假时间）。
          h('span', { style: { ...faintStyle, flex: 'none', display: 'inline' } },
            row.createdAt === null
              ? `[${t('listCreatedUnknown')}]`
              : `[${t('listCreatedTag', { date: formatYmd(row.createdAt) })}]`),
          row.enabled ? null : h('span', { style: { ...faintStyle, flex: 'none', display: 'inline' } }, t('listDisabledTag')),
        ),
        // 执行方式是完整一句话（「每周一、周二，每 10 分钟执行一次」），放不下同样跑马灯。
        h('div', { style: { ...metaStyle, minWidth: 0 } }, h(MarqueeText, { text: scheduleLine })),
      ),
      // 右：历史执行 / 下次执行两个**独立**小标签 → 启用拨片 → 展开箭头。
      h('div', { style: { display: 'flex', alignItems: 'center', gap: '8px', flex: 'none' } },
        h(PastPill, { row, t, tt }),
        h(NextPill, { row, t, tt }),
        // 开关与编辑器头部开关**统一**：挂 `dsh-tdt-switch` 交给 CSS 把选中态刷成官方 success 绿。
        // （官方 Switch 默认选中色是 brand-primary：亮色主题下近乎黑、暗色近乎白 ⇒ 两处看着不一样。）
        // ⚠️ 开关**不许穿透**到「整卡展开」（用户 2026-10-03）：外层拦下冒泡，点它只切启用。
        h('span', {
          className: 'dsh-tdt-switch',
          onClick: (event: { stopPropagation(): void }) => { event.stopPropagation() },
        },
          h(Switch, {
            checked: row.enabled,
            onChange: (next: boolean) => { onToggleEnabled(row.id, next) },
            label: row.enabled ? t('listFilterEnabled') : t('listFilterDisabled'),
            title: row.enabled ? t('listFilterEnabled') : t('listFilterDisabled'),
          }),
        ),
        // 箭头同样要拦：否则点箭头会先触发自己的 onClick、再冒泡到主行触发第二次 ⇒ 展开后立刻又收起。
        h('span', { onClick: (event: { stopPropagation(): void }) => { event.stopPropagation() } },
          h(IconButton, {
            variant: 'plain', size: 'sm', icon: h(IconChevronDownOutlineRegular, { size: 14 }),
            // 这里**故意不挂 `title`**：此前复用了执行记录页的 `expandHint`（「点击任意一行展开该次执行的
            // 事件时间线」），语义完全对不上——卡片展开的是**本任务的设置**，不是某次执行的事件时间线，
            // 悬停冒出一句驴唇不对马嘴的提示（用户 2026-09-30 真机点名）。图标本身自明，只留无障碍名。
            label: t('listExpandHint'),
            onClick: onToggleOpen,
            'aria-expanded': open,
            style: { transform: open ? 'rotate(180deg)' : 'none' },
          }),
        ),
      ),
    ),
    // ── 展开区：三面板（决策 55，2026-10-01 拍板）——内容区三选一替换 + 左下三滑块 + 右下编辑/删除 ──
    open ? h(TaskExpandPanel, { row, t, tt, scheduleLine, modelText, onEdit, onDelete, onOpenFile, onOpenSession }) : null,
  )
}

// ── 视图 ───────────────────────────────────────────────────────────────
export function TaskListView(props: {
  t: Translate
  rows: readonly TaskOverviewRow[]
  ready: boolean
  onEdit: (id: string) => void
  /** 删除任务（决策 55）：返回 null = 成功，否则返回人话错误（父级 Toast 展示、列表靠 overview 刷新少一行）。 */
  onDelete: (id: string) => Promise<string | null>
  /** 产出文件点开（U11 预览面；undefined = 不可用 ⇒ 产出降级纯文本）。 */
  onOpenFile?: (sessionId: string, path: string) => void
  /** 会话弹窗（undefined = 不可用 ⇒ 不出链接）。**只传会话 id**（见 TaskExpandPanel 说明）。 */
  onOpenSession?: (sessionId: string) => void
  /** 启用 / 停用：返回 null = 成功，否则返回人话错误（列表据此回滚乐观值）。 */
  onToggleEnabled: (id: string, enabled: boolean) => Promise<string | null>
}): ReturnType<typeof h> {
  const { t, rows, ready, onEdit, onDelete, onOpenFile, onOpenSession, onToggleEnabled } = props
  const tt = useMemo(() => interpolateTranslate(t), [t])
  ensureTaskListStyle()
  // 跑马灯样式（.dsh-tdt-mq）在编辑器样式模块里注入；列表独立打开时也要有（幂等）。
  ensureTaskEditorStyle()
  const [filter, setFilter] = useState<'all' | 'enabled' | 'disabled' | 'abnormal'>('all')
  const [workspace, setWorkspace] = useState<string>('')
  const [menuOpen, setMenuOpen] = useState(false)
  const [query, setQuery] = useState('')
  const [openId, setOpenId] = useState<string | null>(null)
  /** 拨片的乐观值：点了立刻变，等服务端确认（它会马上同步任务表并重新拉一次）后清除。 */
  const [optimistic, setOptimistic] = useState<Record<string, boolean>>({})

  const rowsWithOptimistic = useMemo(() => {
    const keys = Object.keys(optimistic)
    if (keys.length === 0) return rows
    return rows.map(row => (row.id in optimistic ? { ...row, enabled: optimistic[row.id] } : row))
  }, [rows, optimistic])

  // 真实数据到位 ⇒ 清掉乐观值（避免长期覆盖服务端值）。已经空的时候返回**同一个引用**让 React bail out——
  // 此前每次全量响应都塞个新对象字面量 ⇒ `Object.is` 必不等 ⇒ 每轮多渲染一次（2026-09-30 复核）。
  useEffect(() => { setOptimistic(cur => (Object.keys(cur).length === 0 ? cur : {})) }, [rows])

  // ⚠️ 这里**不放**每秒 setState：倒计时的时间流走 LiveText 的全局心跳（局部重渲染），
  // 列表本体只在数据真变时才动——这正是「每秒刷新会不会卡」的答案。

  const workspaces = useMemo(() => [...new Set(rowsWithOptimistic.map(r => r.workspace))].sort(), [rowsWithOptimistic])
  /**
   * 异常数 = 「最近一次**失败**」或「最近一次**未执行**」的任务数（全量统计，不受当前筛选影响）。
   * ⚠️ 2026-09-30 评审 P0：状态条已把 `skipped`（未执行）与 `failed` 一起标红，这里（与下面的异常筛选）
   * 却只认 `failed` ⇒ 卡片红着却不在「异常」里，口径分叉。两处必须同口径。
   */
  const abnormalCount = useMemo(
    () => rowsWithOptimistic.filter(row => row.lastStatus === 'failed' || row.lastStatus === 'skipped').length,
    [rowsWithOptimistic],
  )

  const visible = useMemo(() => {
    const q = query.trim().toLowerCase()
    const filtered = rowsWithOptimistic.filter(row => {
      if (filter === 'enabled' && !row.enabled) return false
      if (filter === 'disabled' && row.enabled) return false
      if (filter === 'abnormal' && row.lastStatus !== 'failed' && row.lastStatus !== 'skipped') return false
      if (workspace !== '' && row.workspace !== workspace) return false
      if (q === '') return true
      return row.title.toLowerCase().includes(q) || (row.code ?? '').toLowerCase().includes(q)
    })
    const sorted = sortRows(filtered)
    // 排序调试（见文件顶部 `DEBUG_SORT`）：**面板顺序一变就打**，并带上决定顺序的键（在飞 + 下次执行）。
    // 你看到的"掉下去 / 又回来"就是这里连打两次顺序变化 —— 把 `[tdt-sort]` 开头的行复制给我即可定位。
    if (DEBUG_SORT) {
      const order = sorted.map(r => r.id.slice(0, 8)).join(' > ')
      if (order !== lastOrder) {
        console.log(
          `[tdt-sort] 面板顺序变化\n  before: ${lastOrder === '' ? '(空)' : lastOrder}\n  after:  ${order}\n`
          + `  键: ${sorted.map(r => `${r.id.slice(0, 8)}[run=${r.running ? 1 : 0} next=${r.nextSlotAt ?? '-'}]`).join(' ')}`,
        )
        lastOrder = order
      }
    }
    return sorted
    // 排序只依赖内容本身；nowMs 变化不参与 ⇒ 每秒 tick 不会引起重排与动画。
    // （原「到点钳位」会在钉住/松开时重排一次；钳位已删 ⇒ 排序键由**服务端**保证稳定，见决策 54。）
  }, [rowsWithOptimistic, filter, workspace, query])

  // FLIP 签名：只在「可见集合与顺序」变化时触发动画。
  const signature = visible.map(r => `${r.id}:${r.running ? 1 : 0}:${r.enabled ? 1 : 0}`).join('|')
  const refOf = useFlip(signature)

  const menuItems = useMemo(() => [
    { id: '', label: t('listFilterWorkspaceAll') },
    ...workspaces.map(name => ({ id: name, label: name })),
  ], [workspaces, t])

  return h('div', { style: { width: '100%', display: 'flex', justifyContent: 'center' } },
    // 主内容宽度锚点；浮动 loading 据此量右边缘，贴到「主窗口宽度」的右下角。
    h('div', { id: 'dsh-tdt-main', style: { width: '100%', maxWidth: '1120px', minWidth: '760px', boxSizing: 'border-box' } },
      // 顶部一排：左 = 分组按钮（全部 / 已开启 / 已关闭 / 异常）；右 = 搜索 → 工作区下拉。
      h('div', { style: { display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '12px', flexWrap: 'wrap' } },
        // 筛选 tabs 走 UI 基础层唯一实现（P1）：角标也由组件统一渲染（不再写死 #fff）
        h(Segmented<'all' | 'enabled' | 'disabled' | 'abnormal'>, {
          value: filter,
          size: 'md',
          items: [
            { value: 'all', label: t('listFilterAll') },
            { value: 'enabled', label: t('listFilterEnabled') },
            { value: 'disabled', label: t('listFilterDisabled') },
            { value: 'abnormal', label: t('listFilterAbnormal'), badge: abnormalCount },
          ],
          onChange: setFilter,
        }),
        h('span', { style: { flex: '1 1 auto' } }),
        h('div', { style: { display: 'flex', alignItems: 'center', gap: '8px', flex: 'none' } },
          h(Input, {
            className: 'dsh-tdt-tl-input',
            icon: h(IconSearchOutlineRegular, { size: 14 }),
            value: query,
            placeholder: t('listSearchPlaceholder'),
            onChange: (event: { target: { value: string } }) => { setQuery(event.target.value) },
          }),
          h(Menu, {
            open: menuOpen,
            // 与搜索框**同款同高**（controlBoxStyle），右侧带 chevron ⇒ 一眼看得出是下拉框。
            anchor: h('button', {
              type: 'button', className: 'dsh-tdt-tl-ws', style: controlBoxStyle,
              onClick: () => { setMenuOpen(v => !v) },
            },
              h('span', { className: 'dsh-tdt-tl-ws-label' }, workspace === '' ? t('listFilterWorkspaceAll') : workspace),
              h(IconChevronDownOutlineRegular, { size: 14 }),
            ),
            items: menuItems,
            selectedId: workspace,
            onSelect: (id: string) => { setWorkspace(id); setMenuOpen(false) },
            onClose: () => { setMenuOpen(false) },
          }),
        ),
      ),
      visible.length === 0
        ? h('p', { style: { ...metaStyle, marginTop: '8px' } },
          rows.length === 0 && !ready ? '' : rows.length === 0 ? t('listEmpty') : t('listEmptyFiltered'))
        : h('div', { style: { position: 'relative' } },
          visible.map(row => h(TaskCard, {
            key: row.id,
            row, t, tt,
            open: openId === row.id,
            onToggleOpen: () => { setOpenId(cur => (cur === row.id ? null : row.id)) },
            onEdit,
            onDelete,
            onOpenFile,
            onOpenSession,
            onToggleEnabled: (id: string, enabled: boolean): void => {
              setOptimistic(cur => ({ ...cur, [id]: enabled })) // 点了立刻变，不等请求往返
              // ⚠️ 失败必须**撤掉这条乐观值**（2026-09-30 专家团复核）：失败时服务端没变、也不会 bump rev
              // ⇒ 不清就永久停在和服务端相反的位置（要等别的任务改动静默自愈）。
              void onToggleEnabled(id, enabled).then(err => {
                if (err === null) return
                setOptimistic(cur => {
                  if (!(id in cur)) return cur
                  const next = { ...cur }
                  delete next[id]
                  return next
                })
              })
            },
            refOf: refOf(row.id),
          })),
        ),
    ),
  )
}
