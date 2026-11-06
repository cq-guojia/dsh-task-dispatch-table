/**
 * 设置页第 1 块 · 插件设置（配置编辑主入口）。
 *
 * **交互全抄「新增 / 修改任务」那一套**（用户 2026-10-08）：
 *  - **校验**：点保存才判定，**一次把所有问题都查出来**——出问题的框描红（持续态，改好才退），
 *    同时弹**一次**核心提示（`notify`）把所有问题一行一条列出来（一次性，与描红解耦）；
 *  - **提示一律走统一 Toast**，不在表单里挂错误文字；服务端机读错误码（如 `update-failed`）
 *    翻成人话再弹，**不把 `update failed` 这种机读串甩给用户**；
 *  - **数字框只吃数字**：非数字字符直接过滤掉，输不进去（不让用户先输个 "AA" 再来报错）。
 *
 * 状态机照抄 `dsh-session-title-pattern` 插件（用户 2026-10-08）：
 *  - 每项**改过** ⇒ 标题右侧挂 **「自定义」** 徽章 + **「恢复默认」**（**没改过就整个不显示**）。
 *
 * ⚠️ **目录类配置不在此暴露编辑**（`statePath` / `tasksDir`）；**执行历史保留已整条删除**。
 * ⚠️ **表单状态一律存服务端值**（毫秒），显示时才换算（`toDisplay`）。
 */
import { createElement as h, useEffect, useMemo, useRef, useState, type CSSProperties } from 'react'
import { t as coreT } from 'dsh-plugin-core/utils'
import { Button, ensureControlsStyle, Input, ModelPicker, notify, SectionHead, type PickerGroup } from './ui'
import { fetchConfig, postConfig, fetchModelOptions, type ModelOption, type SettingsConfigValue } from './settings-data'
import { HelpButton } from './task-editor'
import { ensureTaskEditorStyle } from './task-editor-css'
import { IconCordisPluginOutlineRegular } from '@deepseek-ai/dsh-client-ui-primitives'
import { interpolateTranslate, type LocaleKey, type Translate } from './locales'

interface FieldDef {
  key: keyof SettingsConfigValue
  labelKey: LocaleKey
  /** 标题下一句**短说明**（一行写得下）。 */
  hintKey?: LocaleKey
  /** 「?」里的**详细说明**。 */
  helpKey?: LocaleKey
  kind: 'number' | 'pair'
  /** 服务端值 → 显示值（毫秒 → 秒）。 */
  toDisplay?: (server: number) => number
  /** 显示值 → 服务端值（秒 → 毫秒）。 */
  fromDisplay?: (display: number) => number
  min?: number
  max?: number
}

const SEC = 1000
const FIELDS: FieldDef[] = [
  { key: 'tickMs', labelKey: 'settingsLoopSec', hintKey: 'settingsLoopHint', helpKey: 'settingsLoopHelp', kind: 'number', toDisplay: v => Math.round(v / SEC), fromDisplay: v => v * SEC, min: 1, max: 7 * 24 * 3600 },
  { key: 'logRetentionDays', labelKey: 'settingsLogRetention', hintKey: 'settingsLogRetentionHint', helpKey: 'settingsLogRetentionHelp', kind: 'number', min: 1, max: 3650 },
  { key: 'attachmentTmpRetentionDays', labelKey: 'settingsAttachmentRetention', hintKey: 'settingsAttachmentRetentionHint', helpKey: 'settingsAttachmentRetentionHelp', kind: 'number', min: 1, max: 3650 },
  { key: 'defaultModel', labelKey: 'settingsModel', hintKey: 'settingsModelHint', helpKey: 'settingsModelHelp', kind: 'pair' },
  { key: 'dispatchGraceMs', labelKey: 'settingsWaitSec', hintKey: 'settingsWaitHint', helpKey: 'settingsWaitHelp', kind: 'number', toDisplay: v => Math.round(v / SEC), fromDisplay: v => v * SEC, min: 1, max: 7 * 24 * 3600 },
  { key: 'leaseMs', labelKey: 'settingsLeaseSec', hintKey: 'settingsLeaseHint', helpKey: 'settingsLeaseHelp', kind: 'number', toDisplay: v => Math.round(v / SEC), fromDisplay: v => v * SEC, min: 1, max: 7 * 24 * 3600 },
  { key: 'unknownGraceMs', labelKey: 'settingsUnknownSec', hintKey: 'settingsUnknownHint', helpKey: 'settingsUnknownHelp', kind: 'number', toDisplay: v => Math.round(v / SEC), fromDisplay: v => v * SEC, min: 1, max: 7 * 24 * 3600 },
]

/** 字段栅格：**一行两个**（供应商 + 模型那一格内部也是一行两个）。 */
const gridStyle: CSSProperties = {
  display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0, 1fr))', gap: 'var(--dshpc-space-4)',
}
const headStyle: CSSProperties = { display: 'flex', alignItems: 'center', gap: 'var(--dshpc-space-1)', marginBottom: 'var(--dshpc-space-2)' }
const labelStyle: CSSProperties = { fontSize: 'var(--dshpc-font-md)', fontWeight: 600, minWidth: 0 }
const badgesStyle: CSSProperties = { display: 'inline-flex', alignItems: 'center', gap: 'var(--dshpc-space-2)', marginLeft: 'auto', flex: 'none' }
const customStyle: CSSProperties = { fontSize: 'var(--dshpc-font-xs)', color: 'var(--dshpc-business)' }
const resetStyle: CSSProperties = {
  background: 'none', border: 'none', padding: 0, font: 'inherit',
  fontSize: 'var(--dshpc-font-xs)', color: 'var(--dshpc-fg-2)', cursor: 'pointer',
}

interface FieldProblem {
  /** 出错的字段名（描红定位用）。 */
  key: string
  /** 已翻译的完整一句话。 */
  message: string
}

export function SettingsConfigBlock({ t }: { t: Translate }): ReturnType<typeof h> {
  // form 恒存**服务端值**（毫秒 / 天 / 字符串）。
  const [form, setForm] = useState<SettingsConfigValue | null>(null)
  /** 最后一次「已落盘」的快照 ⇒ 与 form 比对得脏状态（没改动 ⇒ 保存灰着）。 */
  const [baseline, setBaseline] = useState<SettingsConfigValue | null>(null)
  const [defaults, setDefaults] = useState<SettingsConfigValue | null>(null)
  const [models, setModels] = useState<ModelOption[]>([])
  const [saving, setSaving] = useState(false)
  /** 数字框的自由输入草稿（允许先清空，失焦再回弹），key = 字段名。 */
  const [draft, setDraft] = useState<Partial<Record<string, string>>>({})
  // 点保存才判定（与「新增 / 修改任务」同款）；判定后问题随修正实时消退。
  const [showErrors, setShowErrors] = useState(false)
  // 提示统一走核心 notify（Sonner）；seq 自增 ⇒ 同一句连点也能重播。
  const [toast, setToast] = useState<{ text: string; tone: 'error' | 'success'; seq: number } | null>(null)
  const toastSeq = useRef(0)
  useEffect(() => {
    if (toast !== null) notify(toast.text, { variant: toast.tone, durationMs: 5000 })
  }, [toast])

  const tt = useMemo(() => interpolateTranslate(t), [t])

  useEffect(() => { ensureTaskEditorStyle(); ensureControlsStyle() }, [])

  useEffect(() => {
    let alive = true
    fetchConfig()
      .then(p => {
        if (!alive) return
        setForm(p.config); setDefaults(p.defaults); setBaseline(p.config)
      })
      .catch(() => { if (alive) { toastSeq.current += 1; setToast({ text: t('settingsLoadFailed'), tone: 'error', seq: toastSeq.current }) } })
    return () => { alive = false }
  }, [t])

  useEffect(() => {
    let alive = true
    fetchModelOptions(t)
      .then(list => { if (alive) setModels(list) })
      .catch(() => { if (alive) setModels([{ value: '', label: t('editorFollowHost') }]) })
    return () => { alive = false }
  }, [t])

  /** 显示值（秒 / 天 / 字符串）→ 存服务端值。 */
  const update = (f: FieldDef, value: string | number): void => {
    const server = f.kind === 'number' && f.fromDisplay !== undefined ? f.fromDisplay(value as number) : value
    setForm(prev => (prev === null ? prev : { ...prev, [f.key]: server as never }))
  }

  /** 数字框：空 / 非数字**不提交**（等失焦回弹），合法则 clamp 后提交。 */
  const commitNumber = (f: FieldDef, raw: string): void => {
    const text = raw.trim()
    if (text === '') return
    const n = Number(text)
    if (!Number.isFinite(n)) return
    update(f, Math.min(f.max ?? Infinity, Math.max(f.min ?? -Infinity, n)))
  }

  /** 「恢复默认」：把该字段（连栏项则两个一起）退回系统默认值。 */
  const resetField = (f: FieldDef): void => {
    if (form === null || defaults === null) return
    setDraft(prev => { const next = { ...prev }; delete next[f.key]; return next })
    setForm(prev => prev === null ? prev : f.kind === 'pair'
      ? { ...prev, defaultProvider: defaults.defaultProvider, defaultModel: defaults.defaultModel }
      : { ...prev, [f.key]: defaults[f.key] as never })
  }

  /**
   * 一次把**所有**问题查出来（用户 2026-10-08）：数字看范围、连栏看「两个要一起选」。
   * 渲染时按 `key` 描红；`message` 已翻译，直接进 Toast。
   */
  const validate = (): FieldProblem[] => {
    if (form === null) return []
    const out: FieldProblem[] = []
    for (const f of FIELDS) {
      if (f.kind === 'number') {
        const shown = f.toDisplay !== undefined ? f.toDisplay(form[f.key] as number) : form[f.key] as number
        if (!Number.isFinite(shown) || !Number.isInteger(shown) || shown < (f.min ?? 0) || shown > (f.max ?? Infinity)) {
          out.push({ key: f.key, message: `${t(f.labelKey)}：${tt('settingsErrRange', { min: String(f.min ?? 0), max: String(f.max ?? 0) })}` })
        }
      } else {
        // 连栏：选了一个就必须选另一个（都空 = 跟随宿主默认，合法）。
        const hasProvider = form.defaultProvider !== ''
        const hasModel = form.defaultModel !== ''
        if (hasProvider !== hasModel) out.push({ key: f.key, message: `${t(f.labelKey)}：${t('settingsErrPair')}` })
      }
    }
    return out
  }

  /** 服务端机读错误码 → 人话（**绝不把 `update-failed` 这种串甩给用户**）。 */
  const errTextOf = (code: string): string => {
    if (code === 'update-failed') return t('settingsErrUpdateFailed')
    if (code === 'empty-patch') return t('settingsErrEmpty')
    const range = /^too-(small|large)-(.+)$/.exec(code)
    if (range !== null) {
      const f = FIELDS.find(item => item.key === range[2])
      if (f !== undefined) return tt('settingsErrRangeField', { name: t(f.labelKey), min: String(f.min ?? 0), max: String(f.max ?? 0) })
    }
    const invalid = /^invalid-(.+)$/.exec(code)
    if (invalid !== null) {
      const f = FIELDS.find(item => item.key === invalid[1])
      if (f !== undefined) return tt('settingsErrInvalidField', { name: t(f.labelKey) })
    }
    return code
  }

  const save = async (): Promise<void> => {
    if (form === null) return
    // ① 先本地查一遍：有问题 ⇒ 描红 + 一次性 Toast 列全部问题，不发请求。
    const problems = validate()
    if (problems.length > 0) {
      setShowErrors(true)
      toastSeq.current += 1
      setToast({ text: problems.map(p => p.message).join('\n'), tone: 'error', seq: toastSeq.current })
      return
    }
    setShowErrors(false)
    // ② 真保存：失败 ⇒ 机读码翻人话后弹同一个 Toast。
    setSaving(true)
    try {
      const payload = await postConfig(form)
      setForm(payload.config); setDefaults(payload.defaults); setBaseline(payload.config)
      setDraft({})
      toastSeq.current += 1
      setToast({ text: t('settingsSaveSuccess'), tone: 'success', seq: toastSeq.current })
    } catch (e) {
      const err = e as Error & { detail?: string }
      const base = errTextOf(err.message || '')
      // 服务端带回的真实原因（若有）跟着一起弹——「写不进去」必须让人知道为什么。
      toastSeq.current += 1
      setToast({ text: err.detail === undefined ? base : `${base}\n${err.detail}`, tone: 'error', seq: toastSeq.current })
    } finally {
      setSaving(false)
    }
  }

  /** 改过 = 值 ≠ 系统默认值（与服务端「等于默认值就不落用户层」同一判据）。 */
  const isCustom = (f: FieldDef): boolean => {
    if (form === null || defaults === null) return false
    if (f.kind === 'pair') {
      return form.defaultProvider !== defaults.defaultProvider || form.defaultModel !== defaults.defaultModel
    }
    return form[f.key] !== defaults[f.key]
  }

  const dirty = form !== null && baseline !== null && JSON.stringify(form) !== JSON.stringify(baseline)

  /** 模型分组（一组 = 一个供应商），给核心 `ModelPicker` 联动备用；值口径 = `${provider}/${id}`。 */
  const modelGroups = (): PickerGroup[] => {
    const byProvider = new Map<string, PickerGroup>()
    for (const m of models) {
      if (m.provider === undefined || m.provider === '' || m.value === '') continue
      // 服务端 label 是 `名称（供应商）`；分组后组头已是供应商，去掉重复尾缀。
      const label = m.label.replace(`（${m.provider}）`, '')
      const group = byProvider.get(m.provider)
      if (group === undefined) {
        byProvider.set(m.provider, { value: m.provider, label: m.provider, options: [{ value: `${m.provider}/${m.value}`, label }] })
      } else {
        group.options.push({ value: `${m.provider}/${m.value}`, label })
      }
    }
    return [...byProvider.values()]
  }

  const renderField = (f: FieldDef): ReturnType<typeof h> => {
    const serverVal = form![f.key]
    const invalid = showErrors && validate().some(p => p.key === f.key)
    const custom = isCustom(f)
    let control: ReturnType<typeof h>
    if (f.kind === 'number') {
      const displayVal = f.toDisplay !== undefined ? f.toDisplay(serverVal as number) : serverVal as number
      control = h(Input, {
        // 核心默认 sm(24)，这里沿用原基础层默认 lg(32) 的表单行观感。
        size: 'lg',
        value: draft[f.key] ?? String(displayVal),
        // ⚠️ **不用原生 `type="number"`**（基础层守卫：原生数字框会带出各浏览器样式不一的 spinner）。
        // 数字框**只吃数字**：非数字字符在 onChange 里直接滤掉 ⇒ 用户根本输不进 "AA"。
        style: { width: '100%' },
        error: invalid,
        onChange: (v: string) => {
          const digits = v.replace(/[^0-9]/g, '')
          setDraft(prev => ({ ...prev, [f.key]: digits }))
          commitNumber(f, digits)
        },
        onBlur: () => { setDraft(prev => { const next = { ...prev }; delete next[f.key]; return next }) },
        'aria-label': t(f.labelKey),
      })
    } else {
      // 供应商 + 模型 = 核心 `ModelPicker` 联动态（两个下拉自动筛选；换供应商先清模型）。
      // 值口径与核心一致（`provider/id`），本仓只把两段拆回 `defaultProvider` / `defaultModel`。
      const groups = modelGroups()
      const pairValue = form!.defaultProvider !== '' && form!.defaultModel !== ''
        ? `${form!.defaultProvider}/${form!.defaultModel}`
        : ''
      control = h('div', { className: 'dsh-tdt-model-pair' },
        h(ModelPicker, {
          variant: 'cascade',
          value: pairValue,
          groups,
          // 核心控件内置文案（供应商 / 模型 / 默认）走核心字典；本仓只覆盖自己那几个标签。
          translate: coreT,
          // 目录读不到 ⇒ 如实降级（不伪装成完整目录）；「默认」选项由核心内置。
          degraded: groups.length === 0,
          defaultLabel: t('settingsDefaultOption'),
          placeholder: t('editorFollowHost'),
          // 与其他表单行统一档位（lg = 32），不许比其他框小一号（用户 2026-11-06）。
          size: 'lg',
          className: invalid ? 'dsh-tdt-picker--error' : undefined,
          onChange: (next: string) => {
            if (next === '') {
              update(f, '')
              setForm(prev => prev === null ? prev : { ...prev, defaultProvider: '', defaultModel: '' })
              return
            }
            const slash = next.indexOf('/')
            const provider = slash < 0 ? '' : next.slice(0, slash)
            const model = slash < 0 ? next : next.slice(slash + 1)
            setForm(prev => prev === null ? prev : { ...prev, defaultProvider: provider, defaultModel: model })
          },
        }),
      )
    }
    return h('div', { key: f.key, style: { minWidth: 0 } },
      h('div', { style: headStyle },
        h('label', { style: labelStyle }, t(f.labelKey)),
        f.helpKey === undefined ? null : h(HelpButton, { hint: t(f.helpKey), maxWidth: 320 }),
        // 「自定义」徽章 +「恢复默认」：**没改过就整个不出现**（用户 2026-10-08）。
        custom
          ? h('span', { style: badgesStyle },
              h('span', { style: customStyle }, t('settingsCustom')),
              h('button', { type: 'button', style: resetStyle, onClick: () => { resetField(f) } }, t('settingsResetDefault')),
            )
          : null,
      ),
      control,
      f.hintKey === undefined
        ? null
        : h('div', { style: { fontSize: 'var(--dshpc-font-sm)', color: 'var(--dshpc-fg-3)', marginTop: 'var(--dshpc-space-2)', lineHeight: 'var(--dshpc-line-sm)' } }, t(f.hintKey)),
    )
  }

  if (form === null || defaults === null || baseline === null) {
    return h('div', { style: { color: 'var(--dshpc-fg-3)', fontSize: 'var(--dshpc-font-sm)' } }, t('loading'))
  }

  return h('div', null,
    h(SectionHead, { icon: h(IconCordisPluginOutlineRegular, { size: 16 }), title: t('settingsConfigTitle') }),
    h('div', { style: gridStyle }, ...FIELDS.map(renderField)),
    h('div', { style: { marginTop: 'var(--dshpc-space-4)', display: 'flex', gap: 'var(--dshpc-space-2)', alignItems: 'center', flexWrap: 'wrap', position: 'relative' } },
      // 没有任何改动 ⇒ 保存灰着（照参考插件：没改就没什么可存的）。
      h(Button, { variant: 'primary', size: 'lg', onClick: () => void save(), disabled: saving || !dirty }, saving ? t('saving') : t('save')),
      dirty ? h('span', { style: { fontSize: 'var(--dshpc-font-sm)', color: 'var(--dshpc-warning)' } }, t('settingsUnsaved')) : null,
    ),
  )
}
