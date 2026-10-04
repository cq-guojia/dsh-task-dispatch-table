// task-view.tsx — 右侧栏「查看档」正文（2026-10-05，口径见 docs/design/features/creation-edit.md §七-C）。
//
// **它解决什么**：用户在任务执行列表 / 卡片前置任务里看到一个任务名，只想「看清它到底会怎么跑、上次跑成什么样」，
// 不想进编辑态、也不想跳去任务列表把卡片展开（跳过去就打断手头的事，回来还得找）。⇒ 同一支右侧分栏里
// 给一档**只读人话视图**，纵向单栏流三块：基础信息 → 提示词 → 上次执行。
//
// **数据一律真实**（AGENTS.md 第五条）：
//   · 基础信息 / 提示词取自**当前草稿** —— 编辑到一半切过来，看到的就是「这次编辑的结果」；
//   · 上次执行按任务 id 拉最近一条**终态**实例（名单与卡片基础信息同源 `LAST_RUN_STATUSES`）；
//   · 新建态（任务还不存在）**不发请求**，直接给空态文案，不编造。
//
// ⚠️ 字段怎么翻译、怎么渲染**不在这里** —— 全在 `task-info.tsx`（卡片展开区「基础信息」与这里共用同一份）。
// 本文件只负责：查数据、组装视图模型、排版面。
import { createElement as h, useEffect, useMemo, useState, type ReactNode } from 'react'
import { MarkdownText } from '@deepseek-ai/dsh-client-ui-primitives'
import type { Translate } from './locales'
import { MD_LABELS } from './md-labels'
import { renderSchedule, scheduleSpecFromDraft } from './schedule-text'
import { fetchInstances, type InstanceRow } from './query'
import { statusTextOf } from './status-text'
import {
  infoGroupTitleStyle, infoStatusColorOf, LAST_RUN_STATUSES, lastRunFields, taskInfoBaseFields,
  type TaskInfoBaseView,
} from './task-info'
import { ensureTaskInfoStyle } from './task-info-css'
// ⚠️ 只引**类型**（`import type` 会被编译擦除）：本文件与 `task-editor.tsx` 是「组件互相引用 + 类型单向依赖」，
// 类型导入不构成运行时循环。草稿形状的真源仍在 task-editor.tsx，不在这里复制一份。
import type { EditorTaskOption, TaskEditorDraft } from './task-editor'

/** 查看档正文：只读、无输入控件、无保存动作（要改就切到编辑档）。 */
export function TaskViewPanel(props: {
  t: Translate
  /** 当前草稿（新建态 = `emptyTaskDraft()`）。 */
  draft: TaskEditorDraft
  /** 编辑态的任务 id；新建态为空串 ⇒ **不发上次执行请求**（这个任务还不存在）。 */
  taskId: string
  /** 任务表（真数据）：把前置任务的 id 反查成人读名字。 */
  tasks: EditorTaskOption[]
  /** 点「任务会话」打开归档会话（不给 ⇒ 该行不可点）。 */
  onOpenSession?: ((sessionId: string) => void) | undefined
  /** 点产出物打开文件预览（不给 ⇒ 该行不可点）。 */
  onOpenFile?: ((sessionId: string, path: string) => void) | undefined
}): ReactNode {
  const { t, draft, taskId, tasks, onOpenSession, onOpenFile } = props
  ensureTaskInfoStyle()

  // ── 上次执行（真实取数：最近一条终态实例）──────────────────────────────
  const [last, setLast] = useState<InstanceRow | null>(null)
  const [loaded, setLoaded] = useState(false)
  const [error, setError] = useState<string | null>(null)
  useEffect(() => {
    // 新建态 / 没有 id ⇒ 不请求：任务还不存在，没有执行记录可查。
    if (taskId === '') {
      setLast(null)
      setError(null)
      setLoaded(true)
      return
    }
    let alive = true
    setLoaded(false)
    setError(null)
    setLast(null)
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
  }, [taskId])

  // ── 基础信息视图模型（草稿 → 共享展示层认识的形状）──────────────────────
  // 前置任务名：任务表反查，查不到退 **8 位短 id**（与执行记录页 `depTitleOf` 同口径，绝不编造）。
  const taskById = useMemo(() => new Map(tasks.map(item => [item.id, item])), [tasks])
  const view: TaskInfoBaseView = {
    // 查看档没有可写的启用开关 ⇒ 用基础信息里的「状态」一行表达（切换前的卡片则不给这个字段）。
    enabled: draft.enabled,
    // 排期人话：与编辑器底部「排期预览」**同一份实现**（`schedule-text.ts` 单源）。
    scheduleLine: renderSchedule(scheduleSpecFromDraft(draft), t, { emphasisStyle: { color: 'var(--tdt-fg)' } }),
    // 空字段一律给「未填」占位，不留白、也不编造。
    workspace: draft.workspace.trim() === '' ? t('editorViewNotFilled') : draft.workspace,
    model: draft.model.trim() === '' ? t('listFieldModelDefault') : draft.model,
    retry: draft.maxAttempts.trim() === '' ? t('editorViewNotFilled') : draft.maxAttempts,
    window: draft.window,
    // 附加文件：草稿里只有 `name` / `ref`，没有服务端解析的绝对路径与锚点会话
    // ⇒ 一律**纯展示、不可点**（拿不到就别装成可点；产出物那边有真路径，仍可点）。
    attachments: draft.attachments.map(item => ({ name: item.name, key: item.id })),
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

  return h('div', { className: 'dsh-tdt-ed-view' },
    // ① 基础信息（标签—值纸表格；与卡片展开区同一份渲染）
    h('section', { className: 'dsh-tdt-ed-view-block' },
      h('div', { style: infoGroupTitleStyle }, t('infoSectionConfig')),
      h('div', { className: 'dsh-tdt-info-cfg' }, taskInfoBaseFields({ t, view, onOpenFile })),
    ),
    // ② 提示词（Markdown 渲染 + 块内限高滚动：长提示词不撑长整页）
    h('section', { className: 'dsh-tdt-ed-view-block' },
      h('div', { style: infoGroupTitleStyle }, t('editorViewPrompt')),
      draft.prompt.trim() === ''
        ? h('div', { className: 'dsh-tdt-ed-view-prompt dsh-tdt-ed-view-empty' }, t('editorViewPromptEmpty'))
        : h('div', { className: 'dsh-tdt-ed-view-prompt' }, h(MarkdownText, { text: draft.prompt, labels: MD_LABELS })),
    ),
    // ③ 上次执行（块标题 = 状态色块 + 状态文字 ⇒ 一眼看出成败；明细复用共享层的 `lastRunFields`）
    h('section', { className: 'dsh-tdt-ed-view-block' },
      h('div', { className: 'dsh-tdt-ed-view-head' },
        h('span', { style: { ...infoGroupTitleStyle, marginBottom: 0 } }, t('infoLastRun')),
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
  )
}
