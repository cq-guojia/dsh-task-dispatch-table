// 面板内只读会话弹窗：**渲染与数据链全部交给核心** `dsh-plugin-core/adv/session`
// （0.35.0 起核心提供 SessionViewModal + 可注入槽位），本仓只补三块业务内容：
//
//   title       ← 标题行：任务名可点（查看档）+「 · 计划时刻」
//   bodyHeader  ← 会话顶端：接收 / 随附文件区（前置任务产出、本任务附件）
//   bodyFooter  ← 会话底端：交付文件（回执 outputs 中**快照没覆盖到**的那些）+ 过程文件桶
//
// 为什么交付文件要「去重后补」：核心按快照 turn 级 `deliverables.presented` 在最后一轮
// turn-tail 处画官方网格；本仓 `task_instances.outputs` 是回执落库的权威值，老任务/投影未重放的
// 会话在快照里是空的 ⇒ 这里只补差集，既不让同一文件同屏两次，也不让老任务没得看。
//
// ⚠️ 已知取舍：核心不暴露「用户气泡里附件卡让位」的钩子（旧自绘实现有 attachedNames 去重），
// 所以顶部「随附」区已解析路径的文件，在气泡下方仍会出现官方附件卡（信息重复，非错误）。
//
// 样式：弹窗外壳 / 滚动 / 消息行全部由核心注入（dshpc-sv-*）；本仓只剩 tfc（顶部区）
// 与 deliv（交付卡兜底）两组规则，见 ./archive-session-css.ts。

import { createElement as h, Fragment, useMemo, useSyncExternalStore } from 'react'
import {
  openSessionView as coreOpenSessionView,
  SessionViewModal as CoreSessionViewModal,
  type ChatViewFace,
  type SessionViewTarget,
  type SessionsFace,
  type UiConversationFace,
} from 'dsh-plugin-core/adv/session'
import { ensureArchiveSessionStyle } from './archive-session-css'
// 标题任务名可点（r12）走核心 Button `link` 档。
import { ensureTaskInfoStyle } from './task-info-css'
import { Button } from './ui'
import { DeliverablesGridMirror, type DeliveredFileFace } from './mirror/Deliverables'
import { ProcessFiles } from './process-files'
import { interpolateTranslate, type Translate } from './locales'
// 任务文件上下文（顶部输入区：接收 / 随附，2026-10-03）。
import { TaskFileContextPanel, type AttachedFileView, type UpstreamInputView } from './task-file-context'
import { absWorkspacePath } from '../workspace-path.js'

export type { SessionsFace, SessionViewTarget, UiConversationFace }

/** 本插件在宿主 `retainedBy` 里登记的保留来源（弹窗关闭即 release）。 */
const RETAIN_SOURCE = 'dsh-task-dispatch-table'

/**
 * 打开只读视图：物化 binding → 探测拉尾页 → 建 chat target。会话不可解析时返回 null。
 * 实现在核心（含归档会话 retain / 首轮 inbox / 图片 loader），本仓只补 retain 来源名。
 */
export function openSessionView(
  sessions: SessionsFace,
  uiConversation: UiConversationFace,
  id: string,
): SessionViewTarget | null {
  return coreOpenSessionView(sessions, uiConversation, id, RETAIN_SOURCE)
}

/** 路径归一：去 './' 前缀（与快照 deliverables 的写法对齐，去重才准）。 */
function normalizePath(p: string): string {
  let s = p.trim()
  while (s.startsWith('./')) s = s.slice(2)
  return s
}

/**
 * 去重键：两侧都按**本实例工作区基准**归一成绝对路径再比。
 * 2026-11-09 收口：交付事件（`deliverables/presented`）此前存相对路径、新写的改绝对，
 * 而补差卡的 outputs 走 `query.ts:outputsOf` 也是绝对 ⇒ 若各按各的字符串比，历史快照与新
 * 输出会重复出卡。同一函数两侧共用：绝对值幂等、历史相对值按快照基准补前缀、无基准如实降级。
 */
function canonicalPath(p: string, workspacePath: string | null): string {
  const rel = normalizePath(p)
  return absWorkspacePath(workspacePath, rel) ?? rel
}

/**
 * 快照里已经画过的交付文件路径集合（会话 turn 级 `deliverables.presented`）。
 * ⚠️ 官方 `turn.data` 是 **Map**（不是普通对象）——对象式访问必为 undefined；两种形态都兼容。
 */
function presentedPathsOf(turns: unknown, workspacePath: string | null): ReadonlySet<string> {
  const out = new Set<string>()
  if (turns === null || turns === undefined) return out
  const map = turns as ReadonlyMap<unknown, unknown>
  if (typeof (map as { forEach?: unknown }).forEach !== 'function') return out
  map.forEach((face) => {
    const data = (face as { data?: unknown } | null)?.data
    const delivered = data instanceof Map
      ? (data as ReadonlyMap<unknown, unknown>).get('deliverables')
      : (data as { deliverables?: unknown } | null)?.deliverables
    const presented = (delivered as { presented?: unknown } | null)?.presented
    if (!Array.isArray(presented)) return
    for (const file of presented) {
      const path = (file as { path?: unknown } | null)?.path
      if (typeof path === 'string' && path.trim() !== '') out.add(canonicalPath(path, workspacePath))
    }
  })
  return out
}

/**
 * 面板内只读会话弹窗：核心 `SessionViewModal` + 三块业务槽位。
 * 开分支 / 继续对话 / 消息行分支 / 向前翻页全部由核心实现（`forkSession` + `openHostSession` 就位即渲染）。
 */
export function SessionViewModal(props: {
  t: Translate
  /** 弹窗标题（执行记录里该行的任务名 · 刻度）；拆段渲染时只作兜底。 */
  heading: string
  /** 任务名（heading 的第一段）；与 `taskId` / `onOpenTask` 同给 ⇒ 标题里任务名可点开查看档（r12）。 */
  headingTask?: string
  /** heading 里任务名之后的余串（「 · 计划时刻」）。 */
  headingRest?: string
  /** 标题任务名对应的任务 id（查看档入口用）。 */
  taskId?: string
  /** 点标题里的任务名 ⇒ 右侧栏以查看档打开该任务。 */
  onOpenTask?: (taskId: string) => void
  sessionId: string
  view: SessionViewTarget
  onClose: () => void
  /**
   * 本实例的交付物路径（task_instances.outputs，回执落库的真值，非模拟）。
   * 核心只画快照里有的那些；这里把**快照没覆盖的**补在会话底端，保证老任务也能看到交付物。
   */
  outputs?: readonly string[]
  /** 本实例的**过程文件**路径（`task_instances.process_outputs`，2026-10-10；次级观感、默认展开）。 */
  processOutputs?: readonly string[]
  /** fork 源会话：`sessions.fork({ sessionId, increaseTitle: true })`，解析为子会话 id。 */
  forkSession?: (sessionId: string, atSeq?: number) => Promise<string>
  /** 官方导航跳转：`uiWorkspace.openSession(id)`（会话区打开目标会话）。 */
  openHostSession?: (sessionId: string) => void
  /**
   * U11 统一入口（页面级）：点任意文件链接 → 由外层（整页）渲染**唯一那份**预览 dock。
   * 未传 = 预览能力未就位 ⇒ 链接降级纯文本。
   */
  onOpenFile?: (path: string) => void
  /** 接收区（2026-10-03）：前置任务这次给了哪些文件（实例快照 `resolvedDeps`）。 */
  upstream?: readonly UpstreamInputView[]
  /** 随附区（2026-10-03）：本任务设置里加的文件（快照 `attachments` + 服务端解析的路径）。 */
  attached?: readonly AttachedFileView[]
  /** 本实例的工作区 path（判上游目录是否跨区 ⇒ 跨区目录列不出来，降级不可点）。 */
  workspacePath?: string | null
}): ReturnType<typeof h> {
  const {
    t, heading, sessionId, view, onClose, forkSession, openHostSession,
    onOpenFile, outputs, processOutputs, upstream, attached, workspacePath, headingTask, headingRest, taskId, onOpenTask,
  } = props
  ensureArchiveSessionStyle()
  ensureTaskInfoStyle()
  // 宿主 t 可能不做 {占位符} 替换 ⇒ 业务文案统一包一层（官方模板一律 {name}）。
  const tt = useMemo(() => interpolateTranslate(t), [t])

  // 只订阅快照，用于把 `outputs` 与「核心已画过的交付文件」去重。
  const subscribe = useMemo(() => (onChange: () => void): (() => void) => view.target.subscribe(onChange), [view])
  const getSnapshot = useMemo(() => (): ChatViewFace | undefined => view.target.getSnapshot(), [view])
  const chat = useSyncExternalStore(subscribe, getSnapshot)
  const base = workspacePath ?? null
  const snapshotPaths = useMemo(
    () => presentedPathsOf(chat?.timeline?.turns, base),
    [chat, base],
  )
  const extraOutputs = useMemo<readonly DeliveredFileFace[]>(() => {
    const seen = new Set<string>()
    const out: DeliveredFileFace[] = []
    for (const path of (outputs ?? [])) {
      const key = canonicalPath(path, base)
      if (key === '' || snapshotPaths.has(key) || seen.has(key)) continue
      seen.add(key)
      out.push({ path })
    }
    return out
  }, [outputs, snapshotPaths, base])

  // 标题行：任务名可点（r12 用户：全站任务名都连查看档）——拆开渲染 ⇒ 只有任务名那一段是按钮
  //（hover 变蓝），时刻仍是纯文本；降级（拿不到任务 / 回调未就位）= 整串纯文本。
  const title = h(Fragment, null,
    tt('sessionViewerTitle'),
    ' · ',
    taskId !== undefined && onOpenTask !== undefined && headingTask !== undefined
      ? h(Button, {
        variant: 'link', size: 'sm',
        style: { fontSize: 'inherit' },
        onClick: () => { onOpenTask(taskId) },
      }, headingTask)
      : headingTask ?? heading,
    headingTask !== undefined ? headingRest : '',
  )

  // 会话顶端：接收 / 随附（组件自带空态短路，无内容时返回 null）。
  const bodyHeader = h(TaskFileContextPanel, {
    upstream: upstream ?? [],
    attached: attached ?? [],
    workspacePath: workspacePath ?? null,
    onOpenFile,
    // ⚠️ 必须传 `tt`（带占位符插值的那个）：宿主 `t` 不做 {count} 替换。
    t: tt,
  })

  // 会话底端：先补交付文件差集，再挂过程文件桶（两者都自带空态短路）。
  const bodyFooter = h(Fragment, null,
    h(DeliverablesGridMirror, { files: extraOutputs, onOpen: onOpenFile, t: tt }),
    h(ProcessFiles, { paths: processOutputs, onOpen: onOpenFile, defaultOpen: true, t: tt }),
  )

  // 不透传 `t`：核心的继续对话 / 开分支确认框用自己的字典，本仓 t 的键与核心不同。
  return h(CoreSessionViewModal, {
    sessionId,
    view,
    onClose,
    title,
    bodyHeader,
    bodyFooter,
    forkSession,
    openHostSession,
    onOpenFile,
  })
}
