/**
 * 设置页第 1 块 · 插件设置（配置编辑主入口）。
 *
 * 状态机**照抄 `dsh-session-title-pattern` 插件**（用户 2026-10-08「全抄，按它来」）：
 *  - 每项**改过**（值 ≠ 系统默认值）⇒ 标题右侧挂 **「自定义」** 徽章，并放开 **「恢复默认」** 按钮；
 *  - 没改过 ⇒ 没有徽章、「恢复默认」灰着不可点；
 *  - **没有任何改动时「保存」是灰的**（`disabled` = 没有脏字段）。
 *
 * 其余口径（用户 2026-10-08）：
 * - 没有「配置预览」只读栏（已删）、没有「高级」折叠（全部直接铺开）；
 * - **默认模型供应商 + 默认模型是一行连栏**（先挑哪家、再挑哪个模型，两者一起算一项）；
 * - 秒 / 天这类数字**直接填**（不用步进器），单位只写在标题里，不再缀在输入框后面；
 * - 每项下面一句**短说明**（默认宽度一行写得下），详细解释收进标题右边的 **「?」** 悬停提示。
 *
 * ⚠️ **目录类配置不在此暴露编辑**：`statePath` / `tasksDir` 是「插件装到哪儿」的问题，不该让用户填路径。
 * ⚠️ **执行历史保留已整条删除**：执行历史永久保留、不允许清除。
 * ⚠️ **表单状态一律存服务端值**（毫秒），显示时才换算（`toDisplay`）。
 */
import { createElement as h, useEffect, useState, type CSSProperties } from 'react'
import { Button, Input, SectionHead, SelectField } from './ui'
import { fetchConfig, postConfig, fetchModelOptions, type ModelOption, type SettingsConfigValue } from './settings-data'
import { HelpButton } from './task-editor'
import { ensureTaskEditorStyle } from './task-editor-css'
import { IconCordisPluginOutlineRegular } from '@deepseek-ai/dsh-client-ui-primitives'
import type { LocaleKey, Translate } from './locales'

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
  display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0, 1fr))', gap: 'var(--tdt-space-4)',
}
/** 每项标题行：标题 + 「?」 + 右侧「自定义 / 恢复默认」（照参考插件 `stp-pairHead` 的排法）。 */
const headStyle: CSSProperties = { display: 'flex', alignItems: 'center', gap: 'var(--tdt-space-1)', marginBottom: 'var(--tdt-space-2)' }
const labelStyle: CSSProperties = { fontSize: 'var(--tdt-font-md)', fontWeight: 600, minWidth: 0 }
const badgesStyle: CSSProperties = { display: 'inline-flex', alignItems: 'center', gap: 'var(--tdt-space-2)', marginLeft: 'auto', flex: 'none' }
const customStyle: CSSProperties = { fontSize: 'var(--tdt-font-xs)', color: 'var(--tdt-business)' }
const resetStyle: CSSProperties = {
  background: 'none', border: 'none', padding: 0, font: 'inherit',
  fontSize: 'var(--tdt-font-xs)', color: 'var(--tdt-fg-2)', cursor: 'pointer',
}

export function SettingsConfigBlock({ t }: { t: Translate }): ReturnType<typeof h> {
  // form 恒存**服务端值**（毫秒 / 天 / 字符串）。
  const [form, setForm] = useState<SettingsConfigValue | null>(null)
  /** 最后一次「已落盘」的快照 ⇒ 与 form 比对得脏状态（没改动 ⇒ 保存灰着）。 */
  const [baseline, setBaseline] = useState<SettingsConfigValue | null>(null)
  const [defaults, setDefaults] = useState<SettingsConfigValue | null>(null)
  const [models, setModels] = useState<ModelOption[]>([])
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [saved, setSaved] = useState(false)
  /** 数字框的自由输入草稿（允许先清空 / 输一半，失焦再回弹），key = 字段名。 */
  const [draft, setDraft] = useState<Partial<Record<string, string>>>({})

  useEffect(() => { ensureTaskEditorStyle() }, [])

  useEffect(() => {
    let alive = true
    fetchConfig()
      .then(p => {
        if (!alive) return
        setForm(p.config); setDefaults(p.defaults); setBaseline(p.config)
      })
      .catch((e: Error) => { if (alive) setError(e.message || t('settingsLoadFailed')) })
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
    setSaved(false)
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
    setSaved(false)
    setDraft(prev => { const next = { ...prev }; delete next[f.key]; return next })
    setForm(prev => prev === null ? prev : f.kind === 'pair'
      ? { ...prev, defaultProvider: defaults.defaultProvider, defaultModel: defaults.defaultModel }
      : { ...prev, [f.key]: defaults[f.key] as never })
  }

  const save = async (): Promise<void> => {
    if (form === null) return
    setSaving(true); setError(null)
    try {
      const payload = await postConfig(form)
      setForm(payload.config); setDefaults(payload.defaults); setBaseline(payload.config)
      setDraft({})
      setSaved(true)
    } catch (e) {
      setError((e as Error).message || t('saveFailed'))
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

  /** 供应商候选：从模型目录去重（目录读不到 ⇒ 只有「默认」一项）。 */
  const providerOptions = (): Array<{ value: string; label: string }> => {
    const seen = new Set<string>()
    const out: Array<{ value: string; label: string }> = [{ value: '', label: t('settingsDefaultOption') }]
    for (const m of models) {
      if (m.provider === undefined || m.provider === '' || seen.has(m.provider)) continue
      seen.add(m.provider)
      out.push({ value: m.provider, label: m.provider })
    }
    return out
  }

  /** 模型候选：没选供应商 ⇒ 只剩「默认模型」一项 ⇒ 下拉灰掉、不可选。 */
  const modelOptions = (): ModelOption[] => {
    const provider = form?.defaultProvider ?? ''
    const head: ModelOption[] = [{ value: '', label: t('editorFollowHost') }]
    if (provider === '') return head
    return [...head, ...models.filter(m => m.provider === provider)]
  }

  /** 每项标题行：标题 + 「?」 + 「自定义」徽章 + 「恢复默认」。 */
  const renderHead = (f: FieldDef): ReturnType<typeof h> => {
    const custom = isCustom(f)
    return h('div', { style: headStyle },
      h('label', { style: labelStyle }, t(f.labelKey)),
      f.helpKey === undefined ? null : h(HelpButton, { hint: t(f.helpKey), maxWidth: 320 }),
      h('span', { style: badgesStyle },
        custom ? h('span', { style: customStyle }, t('settingsCustom')) : null,
        h('button', {
          type: 'button', style: { ...resetStyle, ...(custom ? {} : { color: 'var(--tdt-fg-dim)', cursor: 'default' }) },
          disabled: !custom, onClick: () => { resetField(f) },
        }, t('settingsResetDefault')),
      ),
    )
  }

  const renderField = (f: FieldDef): ReturnType<typeof h> => {
    const serverVal = form![f.key]
    let control: ReturnType<typeof h>
    if (f.kind === 'number') {
      const displayVal = f.toDisplay !== undefined ? f.toDisplay(serverVal as number) : serverVal as number
      control = h(Input, {
        value: draft[f.key] ?? String(displayVal),
        // ⚠️ **不用原生 `type="number"`**（基础层守卫：原生数字框会带出各浏览器样式不一的 spinner）。
        style: { width: '100%' },
        onChange: (v: string) => { setDraft(prev => ({ ...prev, [f.key]: v })); commitNumber(f, v) },
        onBlur: () => { setDraft(prev => { const next = { ...prev }; delete next[f.key]; return next }) },
        'aria-label': t(f.labelKey),
      })
    } else {
      const opts = modelOptions()
      control = h('div', { style: { display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0, 1fr))', gap: 'var(--tdt-space-2)' } },
        h(SelectField, {
          value: String(form!.defaultProvider), options: providerOptions(), block: true, size: 'md',
          onChange: (v: string) => {
            update(f, '')
            setForm(prev => prev === null ? prev : { ...prev, defaultProvider: v })
          },
          placeholder: t('settingsDefaultOption'), emptyLabel: t('editorNoOptions'), ariaLabel: t('settingsProvider'),
        }),
        h(SelectField, {
          value: String(serverVal), options: opts, block: true, size: 'md',
          disabled: opts.length <= 1,
          onChange: (v: string) => { update(f, v) },
          placeholder: t('editorFollowHost'), emptyLabel: t('editorNoOptions'), ariaLabel: t('settingsModel'),
        }),
      )
    }
    return h('div', { key: f.key, style: { minWidth: 0 } },
      renderHead(f),
      control,
      f.hintKey === undefined
        ? null
        : h('div', { style: { fontSize: 'var(--tdt-font-sm)', color: 'var(--tdt-fg-3)', marginTop: 'var(--tdt-space-2)', lineHeight: 'var(--tdt-line-sm)' } }, t(f.hintKey)),
    )
  }

  if (form === null || defaults === null || baseline === null) {
    return h('div', { style: { color: 'var(--tdt-fg-3)', fontSize: 'var(--tdt-font-sm)' } }, t('loading'))
  }

  return h('div', null,
    h(SectionHead, { icon: h(IconCordisPluginOutlineRegular, { size: 16 }), title: t('settingsConfigTitle') }),
    h('div', { style: gridStyle }, ...FIELDS.map(renderField)),
    h('div', { style: { marginTop: 'var(--tdt-space-4)', display: 'flex', gap: 'var(--tdt-space-2)', alignItems: 'center', flexWrap: 'wrap' } },
      // 没有任何改动 ⇒ 保存灰着（照参考插件：没改就没什么可存的）。
      h(Button, { variant: 'primary', size: 'lg', onClick: () => void save(), disabled: saving || !dirty }, saving ? t('saving') : t('save')),
      dirty ? h('span', { style: { fontSize: 'var(--tdt-font-sm)', color: 'var(--tdt-warning)' } }, t('settingsUnsaved')) : null,
      saved && !dirty ? h('span', { style: { color: 'var(--tdt-success)', fontSize: 'var(--tdt-font-sm)' } }, t('settingsSaveSuccess')) : null,
      error !== null ? h('span', { style: { color: 'var(--tdt-danger)', fontSize: 'var(--tdt-font-sm)' } }, error) : null,
    ),
  )
}
