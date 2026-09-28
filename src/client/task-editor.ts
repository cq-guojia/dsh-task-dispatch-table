// 浏览器侧：新建 / 编辑任务的**右侧贴边弹窗**（用户 2026-09-28 拍板：盖在页面上的浮层，
// 不是把页面往左推的分栏——分栏是 U11 预览 dock 的行为，两者不是一回事）。
//
// P0 边界（本工作包分期，见 docs/worklog/task-editor-ui.md §九）：
//   · 只做界面与前端交互：输入、下拉展开/选中/回填、频率展开折叠、依赖增删、tab 切换、
//     左缘拖拽调宽、遮罩/Esc/叉关闭。
//   · **不接保存逻辑**（P2）、**不接工作区/模型数据面**（P1，未接时下拉显示空态，不塞假数据）、
//     **不做版本历史**（P3）。
//
// 颜色一律取宿主主题变量（--dsw-alias-*），明暗主题自适应，不写死任何颜色。

import { createElement as h, useCallback, useEffect, useState, type ReactElement, type ReactNode } from 'react'
import type { LocaleKey } from './locales'

/** 与 index.ts 同形的 t 席位（本仓库 client 半侧惯例：无参 t）。 */
type T = (key: LocaleKey) => string

const C = {
  text: 'var(--dsw-alias-label-primary, #1f2328)',
  textDim: 'var(--dsw-alias-label-secondary, rgba(128,128,128,0.95))',
  layer1: 'var(--dsw-alias-bg-layer-1, rgba(128,128,128,0.10))',
  layer2: 'var(--dsw-alias-bg-layer-2, rgba(128,128,128,0.14))',
  layer3: 'var(--dsw-alias-bg-layer-3, rgba(128,128,128,0.20))',
  mask: 'var(--dsw-alias-bg-mask-1, rgba(0,0,0,0.45))',
  border: 'var(--dsw-alias-border-l2, rgba(128,128,128,0.35))',
  borderStrong: 'var(--dsw-alias-border-l3, rgba(128,128,128,0.5))',
  brand: 'var(--dsw-alias-brand-primary, #2f6feb)',
  hover: 'var(--dsw-alias-interactive-bg-hover, rgba(128,128,128,0.16))',
  shadow: 'var(--dsw-shadow-lv3, 0 12px 40px rgba(0,0,0,0.32))',
  bgBase: 'var(--dsw-alias-bg-base, var(--dsw-alias-bg-layer-1, #ffffff))',
}
const monoFont = 'var(--ds-font-family-code, ui-monospace, SFMono-Regular, Menlo, Consolas, monospace)'
const transition = 'background 0.15s ease, color 0.15s ease, border-color 0.15s ease'

// ─────────────────────── 数据形状（前端镜像，不引宿主类型） ───────────────────────

export type EditorMode = 'create' | 'edit'

/** 提示词来源：手敲（我们管版本）/ 任务手册（只记路径，agent 自己读）/ 上传 MD（我们管版本）。 */
export type PromptSource = 'inline' | 'manual' | 'upload'

/** 依赖语义：与宿主 schema 一致（决策 33 后只有这两种，freshness 已删除）。 */
export type DepSemantics = 'same_period' | 'latest_success'

export interface EditorDependency {
  task: string
  semantics: DepSemantics
}

/** 表单草稿：字段与 taskDefinitionSchema（src/tasks.ts:24-63）一一对应，`id` 不在表单里。 */
export interface TaskEditorDraft {
  title: string
  code: string
  enabled: boolean
  prompt: string
  promptSource: PromptSource
  /** 来源 = 任务手册时的路径（工作区内相对路径）。 */
  manualPath: string
  workspace: string
  /** 选中项的 id；`HostLlmModelInfo` 自带 provider ⇒ 一个下拉同时填 provider + model。 */
  model: string
  scheduleKind: 'cron' | 'once'
  cronPreset: string
  cronCustom: string
  onceAt: string
  timezone: string
  window: string
  maxAttempts: string
  validStatuses: string
  deps: EditorDependency[]
}

/** 下拉选项：value = 写进定义的真值（工作区 title / 模型 id / 任务 id）。 */
export interface EditorOption {
  value: string
  label: string
}

/** 新建任务的初始草稿（与 task-template.jsonc 的推荐默认值同拍）。 */
export function emptyTaskDraft(): TaskEditorDraft {
  return {
    title: '',
    code: '',
    enabled: true,
    prompt: '',
    promptSource: 'inline',
    manualPath: '',
    workspace: '',
    model: '',
    scheduleKind: 'cron',
    cronPreset: 'daily-9',
    cronCustom: '0 9 * * *',
    onceAt: '',
    timezone: '',
    window: 'PT4H',
    maxAttempts: '1',
    validStatuses: 'ok',
    deps: [],
  }
}

// ─────────────────────── 预设（选项里反显 cron 原文，图 1 同款） ───────────────────────

const CRON_PRESETS: { id: string; cron: string; labelKey: LocaleKey }[] = [
  { id: 'daily-9', cron: '0 9 * * *', labelKey: 'cronDaily9' },
  { id: 'hourly', cron: '0 * * * *', labelKey: 'cronHourly' },
  { id: 'every15', cron: '*/15 * * * *', labelKey: 'cronEvery15' },
  { id: 'weekly-mon-9', cron: '0 9 * * 1', labelKey: 'cronWeeklyMon' },
  { id: 'monthly-1-9', cron: '0 9 1 * *', labelKey: 'cronMonthly' },
]

const WINDOW_PRESETS = ['PT30M', 'PT1H', 'PT2H', 'PT4H', 'PT8H', 'P1D'] as const

/** ISO 8601 时长 → 人读（PT4H → `4 小时`；不支持的形态原样返回）。 */
function formatIsoDuration(value: string, t: T): string {
  const match = /^PT(?:(\d+)H)?(?:(\d+)M)?$/.exec(value)
  if (match === null) return value
  if (match[1] !== undefined) return `${match[1]} ${t('unitHours')}`
  if (match[2] !== undefined) return `${match[2]} ${t('unitMinutes')}`
  return value
}

/** 草稿 → 任务定义 JSON（仅供高级区「JSON」逃生口只读展示，不参与保存：保存走 P2）。 */
export function draftToDefinitionJson(draft: TaskEditorDraft): string {
  const cron = draft.cronPreset === 'custom' ? draft.cronCustom : (CRON_PRESETS.find(p => p.id === draft.cronPreset)?.cron ?? '')
  const schedule: Record<string, unknown> = { window: draft.window }
  if (draft.scheduleKind === 'once') schedule.once = draft.onceAt
  else schedule.cron = cron
  if (draft.timezone.trim() !== '') schedule.timezone = draft.timezone.trim()

  const target: Record<string, unknown> = { workspace: draft.workspace }
  if (draft.model.trim() !== '') {
    // 模型下拉的 value 形如 `provider/model`，写回时拆成成对的 provider + model（决策 22）。
    const slash = draft.model.indexOf('/')
    if (slash > 0) {
      target.provider = draft.model.slice(0, slash)
      target.model = draft.model.slice(slash + 1)
    } else target.model = draft.model
  }
  if (draft.promptSource === 'manual') {
    if (draft.manualPath.trim() !== '') target.manual = draft.manualPath.trim()
    target.prompt = draft.prompt.trim() === '' ? '按任务手册执行。' : draft.prompt
  } else target.prompt = draft.prompt

  const definition: Record<string, unknown> = {
    enabled: draft.enabled,
    schedule,
    target,
    contract: { validStatuses: draft.validStatuses.split(',').map(s => s.trim()).filter(s => s !== '') },
    retry: { maxAttempts: Number.parseInt(draft.maxAttempts, 10) > 0 ? Number.parseInt(draft.maxAttempts, 10) : 1 },
  }
  if (draft.title.trim() !== '') definition.title = draft.title.trim()
  if (draft.code.trim() !== '') definition.code = draft.code.trim()
  if (draft.deps.length > 0) definition.depends_on = draft.deps.filter(d => d.task !== '')
  return JSON.stringify(definition, null, 2)
}

// ─────────────────────── 样式 ───────────────────────

const overlayStyle: Record<string, string | number> = {
  position: 'fixed', inset: 0, zIndex: 1030, display: 'flex', justifyContent: 'flex-end',
  background: C.mask, backdropFilter: 'blur(2px)',
}
const panelBase: Record<string, string | number> = {
  position: 'relative', height: '100%', boxSizing: 'border-box', display: 'flex', flexDirection: 'column',
  background: C.bgBase, borderLeft: `1px solid ${C.border}`, boxShadow: C.shadow, color: C.text,
}
const resizeHandleStyle: Record<string, string | number> = {
  position: 'absolute', top: 0, bottom: 0, left: 0, width: '6px', cursor: 'col-resize', zIndex: 1,
}
const headerStyle: Record<string, string | number> = {
  display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '12px',
  padding: '14px 18px', borderBottom: `1px solid ${C.border}`, flex: 'none',
}
const iconButtonStyle: Record<string, string | number> = {
  display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
  width: '26px', height: '26px', padding: 0, border: 'none', borderRadius: '6px',
  background: 'transparent', color: C.textDim, cursor: 'pointer', font: 'inherit', fontSize: '14px',
}
const bodyStyle: Record<string, string | number> = {
  flex: '1 1 auto', overflow: 'auto', padding: '16px 18px 20px', minHeight: 0,
}
const footerStyle: Record<string, string | number> = {
  display: 'flex', alignItems: 'center', justifyContent: 'flex-end', gap: '8px',
  padding: '12px 18px', borderTop: `1px solid ${C.border}`, flex: 'none',
}
const labelStyle: Record<string, string | number> = { fontSize: '12px', fontWeight: 600, color: C.text, marginBottom: '4px' }
const hintStyle: Record<string, string | number> = { fontSize: '12px', color: C.textDim, margin: '4px 0 0', lineHeight: 1.5 }
const inputStyle: Record<string, string | number> = {
  width: '100%', boxSizing: 'border-box', padding: '7px 9px', fontSize: '13px', lineHeight: '18px',
  color: C.text, background: C.layer1, border: `1px solid ${C.border}`, borderRadius: '8px', fontFamily: 'inherit',
}
const textareaStyle: Record<string, string | number> = {
  ...inputStyle, minHeight: '140px', resize: 'vertical', lineHeight: 1.6,
}
const blockStyle: Record<string, string | number> = {
  border: `1px solid ${C.border}`, borderRadius: '10px', padding: '12px', background: C.layer1,
}
const chipRowStyle: Record<string, string | number> = { display: 'flex', flexWrap: 'wrap', gap: '8px', marginTop: '10px' }
const smallButtonStyle: Record<string, string | number> = {
  appearance: 'none', font: 'inherit', fontSize: '12px', lineHeight: '18px', cursor: 'pointer',
  padding: '4px 10px', borderRadius: '7px', border: `1px solid ${C.border}`, background: 'transparent',
  color: C.text, transition,
}
const primaryButtonStyle: Record<string, string | number> = {
  ...smallButtonStyle, padding: '6px 14px', fontSize: '13px', fontWeight: 600,
  border: '1px solid transparent', background: 'var(--dsw-alias-button-primary-fill, #2f6feb)',
  color: 'var(--dsw-alias-button-primary-label, #ffffff)',
}
const summaryRowStyle: Record<string, string | number> = {
  display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '8px', width: '100%',
  padding: '8px 10px', borderRadius: '8px', border: `1px solid ${C.border}`, background: C.layer1,
  cursor: 'pointer', font: 'inherit', fontSize: '12px', color: C.text, textAlign: 'left',
}
const depRowStyle: Record<string, string | number> = { display: 'flex', gap: '8px', alignItems: 'center', marginTop: '8px' }

/** 宽度持久化（纯本地偏好，读写容错；隐私模式也不崩）。 */
const WIDTH_KEY = 'dsh-tdt-editor-width'
const WIDTH_DEFAULT = 540
const WIDTH_MIN = 380

function clampWidth(value: number): number {
  const max = Math.max(WIDTH_MIN, Math.floor(window.innerWidth * 0.9))
  return Math.min(Math.max(Math.round(value), WIDTH_MIN), max)
}

function readWidth(): number {
  try {
    const raw = window.localStorage.getItem(WIDTH_KEY)
    const value = raw === null ? Number.NaN : Number(raw)
    return Number.isFinite(value) ? clampWidth(value) : WIDTH_DEFAULT
  } catch {
    return WIDTH_DEFAULT
  }
}

// ─────────────────────── 小控件（官方无表单件，自绘照官方观感） ───────────────────────

function Field(props: { label: string; hint?: string; children?: ReactNode }): ReactElement {
  return h('div', { style: { marginBottom: '14px' } },
    h('div', { style: labelStyle }, props.label),
    props.hint === undefined ? null : h('p', { style: hintStyle }, props.hint),
    props.children ?? null,
  )
}

function Select(props: {
  value: string
  options: EditorOption[]
  onChange: (value: string) => void
  /** 空列表时的占位（未接数据面 ⇒ 显示它并禁用，绝不塞假数据）。 */
  emptyLabel: string
  /** 置顶的空白项文案（如「跟随宿主默认」）；不传则不置顶。 */
  blankLabel?: string
  disabled?: boolean
  ariaLabel?: string
}): ReactElement {
  const usable = props.options.length > 0 && props.disabled !== true
  // 未选且没有明示的空白项时补一个「—」，避免「视觉选中第一项、状态仍是空」的错位。
  const items: EditorOption[] = usable
    ? (props.blankLabel !== undefined
        ? [{ value: '', label: props.blankLabel }, ...props.options]
        : props.value === '' ? [{ value: '', label: '—' }, ...props.options] : props.options)
    : [{ value: '', label: props.emptyLabel }]
  return h('select', {
    value: usable ? props.value : '',
    disabled: !usable,
    'aria-label': props.ariaLabel,
    onChange: (event: { target: { value: string } }) => { props.onChange(event.target.value) },
    style: { ...inputStyle, width: 'auto', minWidth: '140px', flex: '0 1 auto', cursor: usable ? 'pointer' : 'not-allowed' },
  }, items.map(item => h('option', { key: item.value, value: item.value }, item.label)))
}

function Toggle(props: { on: boolean; label: string; onToggle: () => void }): ReactElement {
  return h('button', {
    type: 'button',
    role: 'switch',
    'aria-checked': props.on,
    onClick: props.onToggle,
    style: {
      display: 'inline-flex', alignItems: 'center', gap: '8px', padding: 0, border: 'none',
      background: 'none', cursor: 'pointer', font: 'inherit', fontSize: '12px', color: C.text,
    },
  },
    h('span', {
      style: {
        width: '34px', height: '20px', borderRadius: '10px', position: 'relative', flex: 'none',
        background: props.on ? C.brand : C.layer3, transition: `background ${transition}`,
      },
    },
      h('span', {
        style: {
          position: 'absolute', top: '2px', left: props.on ? '16px' : '2px',
          width: '16px', height: '16px', borderRadius: '50%', background: '#ffffff',
          transition: 'left 0.15s ease',
        },
      }),
    ),
    h('span', null, props.label),
  )
}

// ─────────────────────── 弹窗本体 ───────────────────────

/**
 * 新建 / 编辑任务弹窗：右侧贴边、上下顶满、左缘可拖拽、**浮层盖在页面上**（不推压页面）。
 * 与 U11 预览 dock（占布局的分栏）不冲突：弹窗在 overlay 层，dock 在其下、关弹窗后仍在原位。
 */
export function TaskEditorDrawer(props: {
  t: T
  mode: EditorMode
  draft: TaskEditorDraft
  onChange: (next: TaskEditorDraft) => void
  /** 工作区列表（P1 接真数据；空 ⇒ 下拉显示空态）。 */
  workspaces: EditorOption[]
  /** 模型列表（P1 接真数据；空 ⇒ 下拉显示空态）。 */
  models: EditorOption[]
  /** 可选的前置任务（= 现有任务表，真数据）。 */
  tasks: EditorOption[]
  onClose: () => void
  /** 保存回调；**P0 不传** ⇒ 点「保存」只提示待接，不做任何写入。 */
  onSave?: ((draft: TaskEditorDraft) => void) | undefined
}): ReactElement {
  const { t, mode, draft, onChange, workspaces, models, tasks, onClose, onSave } = props
  const [width, setWidth] = useState<number>(readWidth)
  const [tab, setTab] = useState<'basic' | 'records'>('basic')
  const [scheduleOpen, setScheduleOpen] = useState(false)
  const [advancedOpen, setAdvancedOpen] = useState(false)
  const [jsonOpen, setJsonOpen] = useState(false)
  const [pendingHint, setPendingHint] = useState(false)

  const patch = useCallback((part: Partial<TaskEditorDraft>): void => {
    onChange({ ...draft, ...part })
  }, [draft, onChange])

  // Esc 关闭（与官方弹窗同惯例）。
  useEffect(() => {
    const onKey = (event: KeyboardEvent): void => {
      if (event.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKey)
    return () => { window.removeEventListener('keydown', onKey) }
  }, [onClose])

  /** 左缘拖拽调宽：拖动期间只改本地 state（面板窄，逐帧重渲染代价可接受），松手落 localStorage。 */
  const startResize = useCallback((start: { clientX: number }): void => {
    const startX = start.clientX
    const startWidth = width
    const onMove = (event: PointerEvent): void => { setWidth(clampWidth(startWidth + (startX - event.clientX))) }
    const onUp = (event: PointerEvent): void => {
      window.removeEventListener('pointermove', onMove)
      window.removeEventListener('pointerup', onUp)
      const next = clampWidth(startWidth + (startX - event.clientX))
      setWidth(next)
      try { window.localStorage.setItem(WIDTH_KEY, String(next)) } catch { /* 隐私模式忽略 */ }
    }
    window.addEventListener('pointermove', onMove)
    window.addEventListener('pointerup', onUp)
  }, [width])

  const cronValue = draft.cronPreset === 'custom'
    ? draft.cronCustom
    : (CRON_PRESETS.find(item => item.id === draft.cronPreset)?.cron ?? '')
  const cronLabel = draft.cronPreset === 'custom'
    ? t('editorCronCustom')
    : t(CRON_PRESETS.find(item => item.id === draft.cronPreset)?.labelKey ?? 'editorCronCustom')
  const scheduleSummary = draft.scheduleKind === 'once'
    ? `${t('editorScheduleOnce')} · ${draft.onceAt === '' ? '—' : draft.onceAt}`
    : `${cronLabel} · ${cronValue}`

  const sourceOptions: EditorOption[] = [
    { value: 'inline', label: t('editorSourceInline') },
    { value: 'manual', label: t('editorSourceManual') },
    { value: 'upload', label: t('editorSourceUpload') },
  ]

  const taskOptions: EditorOption[] = tasks.map(item => ({ value: item.value, label: item.label }))

  const body = tab === 'records'
    ? h('p', { style: hintStyle }, t('editorRecordsPending'))
    : h('div', null,
        // ① 启用 + 名称 + 编号
        h('div', { style: { marginBottom: '14px' } },
          h(Toggle, { on: draft.enabled, label: t('editorEnabled'), onToggle: () => { patch({ enabled: !draft.enabled }) } }),
        ),
        h(Field, { label: t('editorTitle') },
          h('input', {
            value: draft.title,
            placeholder: t('editorTitlePh'),
            onChange: (event: { target: { value: string } }) => { patch({ title: event.target.value }) },
            style: inputStyle,
          }),
        ),
        h(Field, { label: t('editorCode'), hint: t('editorCodePh') },
          h('input', {
            value: draft.code,
            onChange: (event: { target: { value: string } }) => { patch({ code: event.target.value }) },
            style: inputStyle,
          }),
        ),

        // ② 提示词（主视觉）：大输入框 + 来源行 + 工作区/模型 chip 行
        h('div', { style: blockStyle },
          h('div', { style: { display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '8px' } },
            h('div', { style: labelStyle }, t('editorPrompt')),
            h('button', {
              type: 'button',
              // 版本历史归 P3；选「任务手册」时本就不做版本管理（R13），两态都不提供。
              style: { ...smallButtonStyle, opacity: 0.5 },
              disabled: true,
              title: draft.promptSource === 'manual'
                ? t('editorSourceManualHint')
                : `${t('editorVersions')}（P3）`,
            }, t('editorVersions')),
          ),
          h('textarea', {
            value: draft.prompt,
            placeholder: t('editorPromptPh'),
            spellCheck: false,
            onChange: (event: { target: { value: string } }) => { patch({ prompt: event.target.value }) },
            style: textareaStyle,
          }),
          h('div', { style: chipRowStyle },
            h(Select, {
              value: draft.promptSource,
              options: sourceOptions,
              onChange: value => { patch({ promptSource: value as PromptSource }) },
              emptyLabel: t('editorNoOptions'),
              ariaLabel: t('editorSource'),
            }),
            draft.promptSource === 'manual'
              ? h('button', {
                type: 'button',
                style: { ...smallButtonStyle, opacity: 0.5 },
                disabled: true,
                title: t('editorUnavailable'),
              }, t('editorPickFile'))
              : null,
            draft.promptSource === 'upload'
              ? h('button', {
                type: 'button',
                style: { ...smallButtonStyle, opacity: 0.5 },
                disabled: true,
                title: t('editorUnavailable'),
              }, t('editorUpload'))
              : null,
          ),
          draft.promptSource === 'manual'
            ? h('div', { style: { marginTop: '10px' } },
                h('div', { style: labelStyle }, t('editorManualPath')),
                h('input', {
                  value: draft.manualPath,
                  placeholder: t('editorManualPathPh'),
                  onChange: (event: { target: { value: string } }) => { patch({ manualPath: event.target.value }) },
                  style: { ...inputStyle, fontFamily: monoFont, fontSize: '12px' },
                }),
                h('p', { style: hintStyle }, t('editorSourceManualHint')),
              )
            : null,
          h('div', { style: chipRowStyle },
            h(Select, {
              value: draft.workspace,
              options: workspaces,
              onChange: value => { patch({ workspace: value }) },
              emptyLabel: t('editorNoOptions'),
              ariaLabel: t('editorWorkspace'),
            }),
            h(Select, {
              value: draft.model,
              options: models,
              onChange: value => { patch({ model: value }) },
              emptyLabel: t('editorNoOptions'),
              blankLabel: t('editorFollowHost'),
              ariaLabel: t('editorModel'),
            }),
          ),
        ),

        // ③ 频率：摘要行 + 点开才展开
        h('div', { style: { marginTop: '14px' } },
          h('div', { style: labelStyle }, t('editorSchedule')),
          h('button', {
            type: 'button',
            style: summaryRowStyle,
            onClick: () => { setScheduleOpen(!scheduleOpen) },
          },
            h('span', null, `${scheduleSummary} · ${t('editorWindow')} ${formatIsoDuration(draft.window, t)}`),
            h('span', { style: { color: C.textDim } }, scheduleOpen ? '▴' : '▾'),
          ),
          scheduleOpen
            ? h('div', { style: { ...blockStyle, marginTop: '8px' } },
                h('div', { style: { display: 'flex', gap: '6px', marginBottom: '10px' } },
                  h('button', {
                    type: 'button',
                    style: { ...smallButtonStyle, background: draft.scheduleKind === 'cron' ? C.layer2 : 'transparent', fontWeight: draft.scheduleKind === 'cron' ? 600 : 400 },
                    onClick: () => { patch({ scheduleKind: 'cron' }) },
                  }, t('editorScheduleCron')),
                  h('button', {
                    type: 'button',
                    style: { ...smallButtonStyle, background: draft.scheduleKind === 'once' ? C.layer2 : 'transparent', fontWeight: draft.scheduleKind === 'once' ? 600 : 400 },
                    onClick: () => { patch({ scheduleKind: 'once' }) },
                  }, t('editorScheduleOnce')),
                ),
                draft.scheduleKind === 'cron'
                  ? h('div', null,
                      h(Select, {
                        value: draft.cronPreset,
                        options: [
                          ...CRON_PRESETS.map(item => ({ value: item.id, label: `${t(item.labelKey)} (${item.cron})` })),
                          { value: 'custom', label: t('editorCronCustom') },
                        ],
                        onChange: value => { patch({ cronPreset: value }) },
                        emptyLabel: t('editorNoOptions'),
                        ariaLabel: t('editorCron'),
                      }),
                      draft.cronPreset === 'custom'
                        ? h('input', {
                          value: draft.cronCustom,
                          placeholder: '0 9 * * *',
                          onChange: (event: { target: { value: string } }) => { patch({ cronCustom: event.target.value }) },
                          style: { ...inputStyle, marginTop: '8px', fontFamily: monoFont, fontSize: '12px' },
                        })
                        : null,
                    )
                  : h('input', {
                    type: 'datetime-local',
                    value: draft.onceAt,
                    onChange: (event: { target: { value: string } }) => { patch({ onceAt: event.target.value }) },
                    style: inputStyle,
                    'aria-label': t('editorOnceAt'),
                  }),
                h('div', { style: { ...chipRowStyle, alignItems: 'center' } },
                  h('span', { style: { fontSize: '12px', color: C.textDim } }, t('editorTimezone')),
                  h(Select, {
                    value: draft.timezone,
                    options: [{ value: 'Asia/Shanghai', label: 'Asia/Shanghai' }, { value: 'UTC', label: 'UTC' }],
                    onChange: value => { patch({ timezone: value }) },
                    emptyLabel: t('editorNoOptions'),
                    blankLabel: t('editorFollowHost'),
                    ariaLabel: t('editorTimezone'),
                  }),
                  h('span', { style: { fontSize: '12px', color: C.textDim } }, t('editorWindow')),
                  h(Select, {
                    value: draft.window,
                    options: WINDOW_PRESETS.map(value => ({ value, label: formatIsoDuration(value, t) })),
                    onChange: value => { patch({ window: value }) },
                    emptyLabel: t('editorNoOptions'),
                    ariaLabel: t('editorWindow'),
                  }),
                ),
                h('p', { style: hintStyle }, t('editorWindowHint')),
              )
            : null,
        ),

        // ④ 前置任务（只做界面；怎么校验归另一个任务）
        h('div', { style: { marginTop: '16px' } },
          h('div', { style: { display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '8px' } },
            h('div', { style: labelStyle }, t('editorDeps')),
            h('button', {
              type: 'button',
              style: smallButtonStyle,
              disabled: taskOptions.length === 0,
              onClick: () => {
                patch({ deps: [...draft.deps, { task: taskOptions[0]?.value ?? '', semantics: 'same_period' }] })
              },
            }, `＋ ${t('editorDepAdd')}`),
          ),
          draft.deps.length === 0
            ? h('p', { style: hintStyle }, t('editorDepEmpty'))
            : draft.deps.map((dep, index) => h('div', { key: index, style: depRowStyle },
                h(Select, {
                  value: dep.task,
                  options: taskOptions,
                  onChange: value => {
                    const next = draft.deps.slice()
                    next[index] = { ...dep, task: value }
                    patch({ deps: next })
                  },
                  emptyLabel: t('editorNoOptions'),
                  ariaLabel: t('editorDepTask'),
                }),
                h(Select, {
                  value: dep.semantics,
                  options: [
                    { value: 'same_period', label: t('editorDepSamePeriod') },
                    { value: 'latest_success', label: t('editorDepLatestSuccess') },
                  ],
                  onChange: value => {
                    const next = draft.deps.slice()
                    next[index] = { ...dep, semantics: value as DepSemantics }
                    patch({ deps: next })
                  },
                  emptyLabel: t('editorNoOptions'),
                  ariaLabel: t('editorDepSemantics'),
                }),
                h('button', {
                  type: 'button',
                  style: { ...smallButtonStyle, color: C.textDim },
                  onClick: () => { patch({ deps: draft.deps.filter((_, i) => i !== index) }) },
                }, t('editorDepRemove')),
              )),
        ),

        // ⑤ 高级：重试次数 / 成功状态清单 / JSON 逃生口
        h('div', { style: { marginTop: '16px' } },
          h('button', {
            type: 'button',
            style: { ...summaryRowStyle, background: 'transparent' },
            onClick: () => { setAdvancedOpen(!advancedOpen) },
          },
            h('span', null, t('editorAdvanced')),
            h('span', { style: { color: C.textDim } }, advancedOpen ? '▴' : '▾'),
          ),
          advancedOpen
            ? h('div', { style: { ...blockStyle, marginTop: '8px' } },
                h(Field, { label: t('editorRetry') },
                  h('input', {
                    type: 'number',
                    min: 1,
                    value: draft.maxAttempts,
                    onChange: (event: { target: { value: string } }) => { patch({ maxAttempts: event.target.value }) },
                    style: { ...inputStyle, width: '90px' },
                  }),
                ),
                h(Field, { label: t('editorValidStatuses') },
                  h('input', {
                    value: draft.validStatuses,
                    placeholder: 'ok',
                    onChange: (event: { target: { value: string } }) => { patch({ validStatuses: event.target.value }) },
                    style: { ...inputStyle, fontFamily: monoFont, fontSize: '12px' },
                  }),
                ),
                h('button', {
                  type: 'button',
                  style: smallButtonStyle,
                  onClick: () => { setJsonOpen(!jsonOpen) },
                }, `⚙ ${t('editorJson')}`),
                jsonOpen
                  ? h('div', { style: { marginTop: '8px' } },
                      h('textarea', {
                        readOnly: true,
                        spellCheck: false,
                        value: draftToDefinitionJson(draft),
                        style: { ...textareaStyle, minHeight: '12em', fontFamily: monoFont, fontSize: '12px' },
                      }),
                      h('p', { style: hintStyle }, t('editorJsonHint')),
                    )
                  : null,
              )
            : null,
        ),
      )

  return h('div', {
    style: overlayStyle,
    onPointerDown: (event: { target: unknown; currentTarget: unknown }) => {
      if (event.target === event.currentTarget) onClose()
    },
  },
    h('div', { style: { ...panelBase, width: `${width}px` }, role: 'dialog', 'aria-modal': true },
      h('div', {
        style: resizeHandleStyle,
        title: t('previewResize'),
        onPointerDown: (event: { clientX: number }) => { startResize({ clientX: event.clientX }) },
      }),
      h('div', { style: headerStyle },
        h('div', { style: { fontSize: '15px', fontWeight: 600, color: C.text } },
          mode === 'create' ? t('editorNew') : t('editorEdit')),
        h('button', {
          type: 'button',
          style: iconButtonStyle,
          title: t('editorClose'),
          'aria-label': t('editorClose'),
          onClick: onClose,
        }, '✕'),
      ),
      // 编辑态两 tab（R6）：创建态只有基本信息。
      mode === 'edit'
        ? h('div', { style: { display: 'flex', gap: '4px', padding: '8px 18px', borderBottom: `1px solid ${C.border}`, flex: 'none' } },
            h('button', {
              type: 'button',
              style: { ...smallButtonStyle, background: tab === 'basic' ? C.layer2 : 'transparent', fontWeight: tab === 'basic' ? 600 : 400 },
              onClick: () => { setTab('basic') },
            }, t('editorTabBasic')),
            h('button', {
              type: 'button',
              style: { ...smallButtonStyle, background: tab === 'records' ? C.layer2 : 'transparent', fontWeight: tab === 'records' ? 600 : 400 },
              onClick: () => { setTab('records') },
            }, t('editorTabRecords')),
          )
        : null,
      h('div', { style: bodyStyle }, body),
      h('div', { style: footerStyle },
        pendingHint ? h('span', { style: { ...hintStyle, margin: '0 8px 0 0' } }, t('editorSavePending')) : null,
        h('button', { type: 'button', style: smallButtonStyle, onClick: onClose }, t('editorCancel')),
        h('button', {
          type: 'button',
          style: primaryButtonStyle,
          onClick: () => {
            if (onSave === undefined) setPendingHint(true)
            else onSave(draft)
          },
        }, t('editorSave')),
      ),
    ),
  )
}
