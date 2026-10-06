// task-view.tsx — 右侧栏「查看档」正文（2026-10-05，口径见 docs/design/features/creation-edit.md §七-C）。
//
// **它解决什么**：用户在任务执行列表 / 卡片前置任务里看到一个任务名，只想「看清它到底会怎么跑、上次跑成什么样」，
// 不想进编辑态、也不想跳去任务列表把卡片展开（跳过去就打断手头的事，回来还得找）。⇒ 同一支右侧分栏里
// 给一档**只读人话视图**，纵向单栏三块（r12 用户拍板的顺序）：**任务配置 → 上次执行 → 提示词（最下）**。
//
// **数据一律真实**（AGENTS.md 第五条）：
//   · 基础信息 / 提示词取自**当前草稿** —— 编辑到一半切过来，看到的就是「这次编辑的结果」；
//   · 「预计执行」用与服务端**同一份**纯核（`../schedule-next.ts`）基于当前草稿实时推算（改排期立刻反映）；
//   · 上次执行按任务 id 拉最近一条**终态**实例（名单与卡片基础信息同源 `LAST_RUN_STATUSES`）；
//   · 新建态（任务还不存在）**不发请求**，直接给空态文案，不编造。
//
// ⚠️ 字段怎么翻译、怎么渲染**不在这里** —— 全在 `task-info.tsx`（卡片展开区「基础信息」与这里共用同一份）。
// 本文件只负责：查数据、组装视图模型、排版面。
import { createElement as h, useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import {
  IconChevronDownOutlineRegular, IconClockOutlineRegular, IconPlanOutlineRegular, IconThinkOutlineRegular, MarkdownText,
} from '@deepseek-ai/dsh-client-ui-primitives'
import type { Translate } from './locales'
import { MD_LABELS } from './md-labels'
import { renderNextExec } from './time-text'
import { nextSlotForDraft, renderSchedule, scheduleSpecFromDraft } from './schedule-text'
import { fetchInstances, type InstanceRow } from './query'
import { statusTextOf } from './status-text'
import {
  infoStatusColorOf, LAST_RUN_STATUSES, lastRunFields, taskInfoBaseFields,
  type TaskInfoBaseView,
} from './task-info'
import { ensureTaskInfoStyle } from './task-info-css'
import { Button, CodeViewer, Segmented } from './ui'
// 事件推送（2026-10-06 补缺口）：查看档的「上次执行」原来只在挂载/换任务时取一次 ⇒ 页面开着时
// 该任务跑完是看不见的（它上面没有会带它重取的父级，父级 `runSig` 那条只覆盖卡片里的 info/records/logs）。
import { useEvents, useResync } from './event-subscribe'
import { RUN_EVENT_TYPES } from '../event-catalog.js'
// ⚠️ 只引**类型**（`import type` 会被编译擦除）：本文件与 `task-editor.tsx` 是「组件互相引用 + 类型单向依赖」，
// 类型导入不构成运行时循环。草稿形状的真源仍在 task-editor.tsx，不在这里复制一份。
import type { EditorMode, EditorTaskOption, TaskEditorDraft } from './task-editor'

/**
 * 查看档正文：只读、无输入控件、无保存动作（要改就切到编辑档）。
 * 块标题带小图标（r12 用户反馈：不然一片全是文字）。
 */
export function TaskViewPanel(props: {
  t: Translate
  /** 当前草稿（新建态 = `emptyTaskDraft()`）。 */
  draft: TaskEditorDraft
  /** 抽屉档位语义：'create' = 新建还没存过；'edit' = 已存在任务。影响草稿标记与上次执行取数。 */
  mode: EditorMode
  /** 草稿是否有未保存修改（抽屉单向上报，这里只用来决定要不要挂「编辑的草稿未保存」标记）。 */
  dirty: boolean
  /** 编辑态的任务 id；新建态为空串 ⇒ **不发上次执行请求**（这个任务还不存在）。 */
  taskId: string
  /** 任务表（真数据）：把前置任务的 id 反查成人读名字。 */
  tasks: EditorTaskOption[]
  /** 点「任务会话」打开归档会话（不给 ⇒ 该行不可点）。 */
  onOpenSession?: ((sessionId: string) => void) | undefined
  /** 点产出物打开文件预览（不给 ⇒ 该行不可点）。 */
  onOpenFile?: ((sessionId: string, path: string) => void) | undefined
  /** 点前置任务名 → 右侧栏以查看档打开那个任务（r12：查看档内也保持这个口径）。 */
  onViewTask?: ((id: string) => void) | undefined
  /**
   * 该任务在 overview 里的**附件解析结果**（服务端补好的绝对路径 + 预览锚点会话）。
   * 按 kind+name 与草稿附件配对 ⇒ 查看档里附件可点开预览（r13）；配不上（新建 / 编辑中新增）保持纯展示。
   */
  resolvedAttachments?: readonly { name: string; kind: 'link' | 'upload'; path?: string; anchorSessionId?: string }[]
}): ReactNode {
  const { t, draft, mode, dirty, taskId, tasks, resolvedAttachments, onOpenSession, onOpenFile, onViewTask } = props
  ensureTaskInfoStyle()

  // ── 上次执行（真实取数：最近一条终态实例）──────────────────────────────
  const [last, setLast] = useState<InstanceRow | null>(null)
  const [loaded, setLoaded] = useState(false)
  const [error, setError] = useState<string | null>(null)
  /**
   * 事件推送：**该任务**的运行态事件（含重连补读）到达 ⇒ 重取一次「上次执行」。
   * 只认 `payload.taskId === 本档任务`（在屏判定），别的任务跑不动这一档。
   */
  const [reloadNonce, setReloadNonce] = useState(0)
  /** 当前展示的「上次执行」属于哪个任务：**换任务**才清空，事件刷新保留旧值（见下方 effect）。 */
  const shownTaskRef = useRef<string | null>(null)
  useEvents(RUN_EVENT_TYPES, (event) => {
    if (event.payload?.taskId !== taskId) return
    setReloadNonce(n => n + 1)
  })
  useResync(() => { setReloadNonce(n => n + 1) })
  useEffect(() => {
    // 新建态 / 没有 id ⇒ 不请求：任务还不存在，没有执行记录可查。
    if (taskId === '') {
      setLast(null)
      setError(null)
      setLoaded(true)
      return
    }
    let alive = true
    // ⚠️ 只有**换了任务**才清空（2026-10-07 审计 🟡）：事件驱动的重取如果也清空，用户正在读的
    // 「上次执行」会**先闪成空白再出现**（与「全站只有一个 loading」的口径也冲突）。
    // 保留旧值直到新值回来；失败时给错误提示（不保留可能已经过时的旧值）。
    if (shownTaskRef.current !== taskId) {
      shownTaskRef.current = taskId
      setLoaded(false)
      setLast(null)
    }
    setError(null)
    fetchInstances({ taskId, statuses: LAST_RUN_STATUSES, limit: 1 })
      .then(({ rows }) => {
        if (!alive) return
        setLast(rows[0] ?? null)
        setLoaded(true)
      })
      .catch((err: unknown) => {
        if (!alive) return
        setError(err instanceof Error ? err.message : String(err))
        setLoaded(true)
      })
    return () => { alive = false }
  }, [taskId, reloadNonce])

  // ── 预计执行（r13 **统一入口** `nextSlotForDraft`：停用⇒无、once/cron 分流、推不出⇒null
  // 全在 schedule-text 那一份，与卡片「预计执行」同口径 —— 用户点名这类判断不许各处各写）。
  const nextExecIso = useMemo(() => nextSlotForDraft(draft), [draft])

  // ── 基础信息视图模型（草稿 → 共享展示层认识的形状）──────────────────────
  // 前置任务名：任务表反查，查不到退 **8 位短 id**（与执行记录页 `depTitleOf` 同口径，绝不编造）。
  const taskById = useMemo(() => new Map(tasks.map(item => [item.id, item])), [tasks])
  // 附件解析结果按 kind+name 配对（r13：已存在任务的服务端绝对路径 + 锚点 ⇒ 附件可点开预览）。
  const resolvedByKey = useMemo(
    () => new Map((resolvedAttachments ?? []).map(item => [`${item.kind}:${item.name}`, item])),
    [resolvedAttachments],
  )
  const view: TaskInfoBaseView = {
    // 查看档没有可写的启用开关 ⇒ 用基础信息里的「状态」一行表达（切换前的卡片则不给这个字段）。
    enabled: draft.enabled,
    // 排期人话：与编辑器底部「排期预览」**同一份实现**（`schedule-text.ts` 单源）。
    scheduleLine: renderSchedule(scheduleSpecFromDraft(draft), t, { emphasisStyle: { color: 'var(--tdt-fg)' } }),
    // 预计执行：社交化相对时间（LiveText 每秒自刷）+ 具体时刻，与卡片同款（`renderNextExec`）。
    nextSlot: renderNextExec(nextExecIso, t),
    // 空字段一律给「未填」占位，不留白、也不编造。
    workspace: draft.workspace.trim() === '' ? t('editorViewNotFilled') : draft.workspace,
    model: draft.model.trim() === '' ? t('listFieldModelDefault') : draft.model,
    retry: draft.maxAttempts.trim() === '' ? t('editorViewNotFilled') : draft.maxAttempts,
    window: draft.window,
    // 附加文件（r13 改为可点）：已存在任务的服务端解析（绝对路径 + 锚点会话）按 kind+name 配上
    // ⇒ 可点开预览；配不上（新建 / 编辑中新增，服务端还没解析）⇒ 纯展示，**不装可点**。
    attachments: draft.attachments.map(item => {
      const resolved = resolvedByKey.get(`${item.kind}:${item.name}`)
      return {
        name: item.name,
        key: item.id,
        path: resolved?.path ?? null,
        anchorSessionId: resolved?.anchorSessionId ?? null,
      }
    }),
    depends: draft.deps.map(dep => {
      const option = taskById.get(dep.task)
      return {
        id: dep.task,
        title: option === undefined ? dep.task.slice(0, 8) : option.label,
        // 查不到任务 ⇒ 不标「已停用」（不知道就不说）。
        enabled: option === undefined ? true : option.enabled,
      }
    }),
  }

  // ── 提示词区（r13 用户拍板：源码 / 预览 + 展开 / 收起，全部就地生效，不做全屏）──
  // 源码态重用只读 CodeViewer、预览态重用 MarkdownText。
  const [promptMode, setPromptMode] = useState<'preview' | 'source'>('preview')
  const [promptOpen, setPromptOpen] = useState(false)
  const hasPrompt = draft.prompt.trim() !== ''
  // 短提示（≤ 阈值字）直接整段显示、不截断、也不给展开钮（用户 2026-10-05：短到不用展开）。
  const PROMPT_SHORT_MAX = 100
  const isShort = hasPrompt && draft.prompt.length <= PROMPT_SHORT_MAX
  // 草稿标记（r12 用户拍板：不放头部任务名旁——名字可能很长；挂「任务配置」标题旁，文案精简正式）。
  const draftChip = mode === 'create' || dirty
    ? h('span', { className: 'dsh-tdt-ed-view-chip' }, mode === 'create' ? t('editorViewNewTag') : t('editorViewDraftTag'))
    : null

  return h('div', { className: 'dsh-tdt-ed-view' },
    // ① 任务配置（标签—值纸表格；与卡片展开区同一份渲染）
    h('section', { className: 'dsh-tdt-ed-view-block' },
      h('div', { className: 'dsh-tdt-ed-view-head' },
        // 块标题 = **标签**（浅底 chip：图标 + 文字；r13 用户：纯文字没提示作用）。
        h('span', { className: 'dsh-tdt-ed-view-tag' },
          h(IconPlanOutlineRegular, { size: 12 }), t('infoSectionConfig')),
        draftChip,
      ),
      h('div', { className: 'dsh-tdt-info-cfg' }, taskInfoBaseFields({ t, view, onOpenFile, onViewTask })),
    ),
    // ② 上次执行（状态色块 + 状态文字 ⇒ 一眼看出成败；明细复用共享层的 `lastRunFields`）
    h('section', { className: 'dsh-tdt-ed-view-block' },
      h('div', { className: 'dsh-tdt-ed-view-head' },
        h('span', { className: 'dsh-tdt-ed-view-tag' },
          h(IconClockOutlineRegular, { size: 12 }), t('infoLastRun')),
        last === null ? null : h('span', { className: 'dsh-tdt-ed-view-badge', style: { background: infoStatusColorOf(last.status) } }),
        last === null ? null : h('span', {
          style: { fontSize: 'var(--tdt-font-sm)', fontWeight: 600, color: infoStatusColorOf(last.status) },
        }, statusTextOf(last.status, t)),
      ),
      error !== null
        ? h('div', { style: { fontSize: 'var(--tdt-font-xs)', color: 'var(--tdt-danger)' } }, `${t('cardLoadFailed')}：${error}`)
        : !loaded
          // 加载中**空着**（用户铁律：全站只有一个 loading，不许在这里新增实例、文案或样式）。
          ? null
          : taskId === ''
            ? h('div', { className: 'dsh-tdt-ed-view-empty' }, t('editorViewNoRunDraft'))
            : last === null
              ? h('div', { className: 'dsh-tdt-ed-view-empty' }, t('infoNoRun'))
              // 状态已由上面的色块表达 ⇒ 明细里不再重复一行（同一实现加参数）。
              : lastRunFields({ t, instance: last, onOpenSession, onOpenFile, hideStatus: true }),
    ),
    // ③ 提示词（最下；约 5 行截断；右侧操作组 = 源码/预览 + 展开/收起，全部**就地生效**，不做全屏）。
    //   短提示（≤ PROMPT_SHORT_MAX 字）直接整段显示、不截断、也不给展开钮（用户 2026-10-05：短到不用展开）。
    h('section', { className: 'dsh-tdt-ed-view-block' },
      h('div', { className: 'dsh-tdt-ed-view-head' },
        h('span', { className: 'dsh-tdt-ed-view-tag' },
          h(IconThinkOutlineRegular, { size: 12 }), t('editorViewPrompt')),
        hasPrompt
          ? h('span', { className: 'dsh-tdt-ed-view-head-actions' },
            // 源码 / 预览（重用基础层 `Segmented`；源码 = 只读代码视图，不可编辑）。
            h(Segmented, {
              id: 'dsh-tdt-ed-view-promptmode',
              value: promptMode,
              size: 'sm',
              items: [
                { value: 'source', label: t('editorViewSourceCode') },
                { value: 'preview', label: t('editorModePreview') },
              ],
              onChange: (next: string) => { setPromptMode(next as 'preview' | 'source') },
              label: t('editorViewPrompt'),
            }),
            // 展开 / 收起：文字钮 + 小箭头（箭头方向即展开/收起指向，与高级设置收折头同款）；短提示不显示。
            isShort ? null : h(Button, {
              variant: 'outline', size: 'sm',
              onClick: () => { setPromptOpen(v => !v) },
            }, h('span', { style: { display: 'inline-flex', alignItems: 'center', gap: '4px' } },
              promptOpen ? t('editorViewCollapse') : t('editorViewExpand'),
              h(IconChevronDownOutlineRegular, {
                size: 12,
                className: promptOpen ? 'dsh-tdt-ed-view-expchevron dsh-tdt-ed-view-expchevron-open' : 'dsh-tdt-ed-view-expchevron',
              }),
            )),
          )
          : null,
      ),
      // 文档区：极淡底包住整段（源码 / 预览 都是一份文档 / 代码），与上方标签拉开距离（r13 续）。
      hasPrompt
        ? h('div', { className: 'dsh-tdt-ed-view-promptbox' },
          h('div', { className: `dsh-tdt-ed-view-prompt${promptOpen || isShort ? ' dsh-tdt-ed-view-prompt--open' : ''}` },
            promptMode === 'source'
              ? h(CodeViewer, { text: draft.prompt, path: 'prompt.md', t })
              : h(MarkdownText, { text: draft.prompt, labels: MD_LABELS })))
        : h('div', { className: 'dsh-tdt-ed-view-empty' }, t('editorViewPromptEmpty')),
    ),
  )
}
