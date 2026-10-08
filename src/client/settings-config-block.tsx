/**
 * 设置页第 1 块 · 插件设置（配置编辑主入口）。
 *
 * 布局（用户 2026-10-08 定死）：
 * - 左栏 = 插件设置表单，**一行两个**；每项 = 标题（上）+ 输入框（中）+ 说明（下）；
 * - 右栏 = 「配置预览」只读面板，**定宽 180px**（原先 minmax(240px,1fr) 的四分之三）——
 *   它是固定块，窗口变窄时压的是**左边**表单，预览自己不縮；
 * - 「高级」折叠区照旧保留。
 *
 * 控件口径（用户 2026-10-08）：
 * - **秒 / 天这类数字直接填**，不要用「− / +」步进器（没意义）；
 * - 模型 / 供应商是**下拉**（目录来自 `GET /options`，与任务编辑器同一份真源），
 *   首项「默认模型」= 跟随宿主；**没选供应商时模型下拉是灰的、不可选**。
 *
 * ⚠️ **目录类配置不在此暴露编辑**（用户 2026-10-08）：`statePath` / `tasksDir` 是「插件装到哪儿」的问题，
 * 一个插件装哪儿就是哪儿，不该让用户填路径。
 * ⚠️ **执行历史保留已整条删除**（用户 2026-10-08）：执行历史应当永久保留、不允许清除。
 *
 * ⚠️ **表单状态一律存服务端值**（毫秒），显示时才换算（`toDisplay`）—— 早前把「显示单位（秒）」
 * 存进状态、显示时又换算一次，改一次时间字段就会被二次换算成 0.12 秒（2026-10-08 修）。
 */
import { createElement as h, useEffect, useState, type CSSProperties } from 'react'
import { Button, Input, SectionHead, SelectField } from './ui'
import { fetchConfig, postConfig, fetchModelOptions, type ModelOption, type SettingsConfigValue } from './settings-data'
import { IconCordisPluginOutlineRegular } from '@deepseek-ai/dsh-client-ui-primitives'
import type { LocaleKey, Translate } from './locales'

type FieldKind = 'number' | 'text' | 'provider' | 'model'

interface FieldDef {
  key: keyof SettingsConfigValue
  labelKey: LocaleKey
  hintKey?: LocaleKey
  group: 'basic' | 'advanced'
  kind: FieldKind
  unit?: string
  /** 服务端值 → 显示值（毫秒 → 秒）。 */
  toDisplay?: (server: number) => number
  /** 显示值 → 服务端值（秒 → 毫秒）；表单写入时用。 */
  fromDisplay?: (display: number) => number
  min?: number
  max?: number
}

const SEC = 1000
const FIELDS: FieldDef[] = [
  { key: 'tickMs', labelKey: 'settingsLoopSec', hintKey: 'settingsLoopHint', group: 'basic', kind: 'number', unit: '秒', toDisplay: v => Math.round(v / SEC), fromDisplay: v => v * SEC, min: 1, max: 7 * 24 * 3600 },
  { key: 'logRetentionDays', labelKey: 'settingsLogRetention', hintKey: 'settingsLogRetentionHint', group: 'basic', kind: 'number', unit: '天', min: 1, max: 3650 },
  { key: 'attachmentTmpRetentionDays', labelKey: 'settingsAttachmentRetention', hintKey: 'settingsAttachmentRetentionHint', group: 'basic', kind: 'number', unit: '天', min: 1, max: 3650 },
  { key: 'defaultProvider', labelKey: 'settingsProvider', group: 'basic', kind: 'provider' },
  { key: 'defaultModel', labelKey: 'settingsModel', group: 'basic', kind: 'model' },
  { key: 'dispatchGraceMs', labelKey: 'settingsWaitSec', hintKey: 'settingsWaitHint', group: 'advanced', kind: 'number', unit: '秒', toDisplay: v => Math.round(v / SEC), fromDisplay: v => v * SEC, min: 1, max: 7 * 24 * 3600 },
  { key: 'leaseMs', labelKey: 'settingsLeaseSec', hintKey: 'settingsLeaseHint', group: 'advanced', kind: 'number', unit: '秒', toDisplay: v => Math.round(v / SEC), fromDisplay: v => v * SEC, min: 1, max: 7 * 24 * 3600 },
  { key: 'unknownGraceMs', labelKey: 'settingsUnknownSec', hintKey: 'settingsUnknownHint', group: 'advanced', kind: 'number', unit: '秒', toDisplay: v => Math.round(v / SEC), fromDisplay: v => v * SEC, min: 1, max: 7 * 24 * 3600 },
]

const linkStyle: CSSProperties = {
  background: 'none', border: 'none', color: 'var(--tdt-link)', cursor: 'pointer',
  padding: '0', fontSize: 'var(--tdt-font-sm)',
}

/** 字段栅格：**一行两个**。 */
const gridStyle: CSSProperties = {
  display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0, 1fr))', gap: 'var(--tdt-space-4)',
}

export function SettingsConfigBlock({ t }: { t: Translate }): ReturnType<typeof h> {
  // form 恒存**服务端值**（毫秒 / 天 / 字符串）。
  const [form, setForm] = useState<SettingsConfigValue | null>(null)
  /** 最后一次「已落盘」的快照 ⇒ 与 form 比对得脏状态（改动了没保存要显示出来）。 */
  const [baseline, setBaseline] = useState<SettingsConfigValue | null>(null)
  const [defaults, setDefaults] = useState<SettingsConfigValue | null>(null)
  const [models, setModels] = useState<ModelOption[]>([])
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [saved, setSaved] = useState(false)
  const [showAdvanced, setShowAdvanced] = useState(false)
  /** 数字框的自由输入草稿（允许用户先清空 / 输一半，失焦再回弹），key = 字段名。 */
  const [draft, setDraft] = useState<Partial<Record<string, string>>>({})

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

  const dirty = form !== null && baseline !== null && JSON.stringify(form) !== JSON.stringify(baseline)

  /** 供应商候选：从模型目录去重（目录读不到 ⇒ 只有「默认」一项，下拉呈灰色）。 */
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

  /** 模型候选：首项「默认模型」；其余按当前供应商过滤（没选供应商 ⇒ 只剩首项 ⇒ 下拉不可选）。 */
  const modelOptions = (): ModelOption[] => {
    const provider = form?.defaultProvider ?? ''
    const head: ModelOption[] = [{ value: '', label: t('editorFollowHost') }]
    if (provider === '') return head
    return [...head, ...models.filter(m => m.provider === provider)]
  }

  const renderField = (f: FieldDef): ReturnType<typeof h> => {
    const serverVal = form![f.key]
    const hint = f.hintKey === undefined
      ? null
      : h('div', { style: { fontSize: 'var(--tdt-font-sm)', color: 'var(--tdt-fg-3)', marginTop: 'var(--tdt-space-2)', lineHeight: 'var(--tdt-line-sm)' } }, t(f.hintKey))
    const label = h('label', { style: { display: 'block', fontSize: 'var(--tdt-font-md)', fontWeight: 600, marginBottom: 'var(--tdt-space-2)' } }, t(f.labelKey))

    let control: ReturnType<typeof h>
    if (f.kind === 'number') {
      const displayVal = f.toDisplay !== undefined ? f.toDisplay(serverVal as number) : serverVal as number
      control = h(Input, {
        value: draft[f.key] ?? String(displayVal),
        // ⚠️ **不用原生 `type="number"`**（基础层守卫：原生数字框会带出各浏览器样式不一的 spinner）；
        // 这里就是「直接填数字」的文本框，非数字不提交、失焦回弹。
        style: { width: '100%' },
        onChange: (v: string) => { setDraft(prev => ({ ...prev, [f.key]: v })); commitNumber(f, v) },
        onBlur: () => { setDraft(prev => { const next = { ...prev }; delete next[f.key]; return next }) },
        'aria-label': t(f.labelKey),
      })
      control = h('div', { style: { display: 'flex', alignItems: 'center', gap: 'var(--tdt-space-1)' } },
        control,
        f.unit === undefined ? null : h('span', { style: { flex: 'none', fontSize: 'var(--tdt-font-sm)', color: 'var(--tdt-fg-3)' } }, f.unit),
      )
    } else if (f.kind === 'provider') {
      control = h(SelectField, {
        value: String(serverVal), options: providerOptions(), block: true, size: 'md',
        onChange: (v: string) => { update(f, v); update({ ...f, key: 'defaultModel' }, '') },
        placeholder: t('settingsDefaultOption'), emptyLabel: t('editorNoOptions'), ariaLabel: t(f.labelKey),
      })
    } else if (f.kind === 'model') {
      const opts = modelOptions()
      control = h(SelectField, {
        value: String(serverVal), options: opts, block: true, size: 'md',
        // 没选供应商 ⇒ 只剩「默认模型」一项 ⇒ 下拉灰掉、不可选（用户 2026-10-08）。
        disabled: opts.length <= 1,
        onChange: (v: string) => { update(f, v) },
        placeholder: t('editorFollowHost'), emptyLabel: t('editorNoOptions'), ariaLabel: t(f.labelKey),
      })
    } else {
      control = h(Input, { value: String(serverVal), onChange: v => update(f, v), style: { width: '100%' } })
    }

    return h('div', { key: f.key, style: { minWidth: 0 } }, label, control, hint)
  }

  if (form === null || defaults === null || baseline === null) {
    return h('div', { style: { color: 'var(--tdt-fg-3)', fontSize: 'var(--tdt-font-sm)' } }, t('loading'))
  }

  const basic = FIELDS.filter(f => f.group === 'basic')
  const advanced = FIELDS.filter(f => f.group === 'advanced')

  /** 只读面板按**显示单位**给值（毫秒换算成秒），并标出该字段是否用的系统默认值。 */
  const previewValue = (f: FieldDef): string => {
    const v = form[f.key]
    if (f.kind === 'text' || f.kind === 'provider' || f.kind === 'model') return v === '' ? '—' : String(v)
    const shown = f.toDisplay !== undefined ? f.toDisplay(v as number) : v as number
    const isDefault = defaults[f.key] === v
    return `${shown} ${f.unit ?? ''}`.trim() + (isDefault ? `（${t('settingsDefaultValue')}）` : '')
  }

  return h('div', null,
    h(SectionHead, { icon: h(IconCordisPluginOutlineRegular, { size: 16 }), title: t('settingsConfigTitle') }),
    // 右栏**定宽** ⇒ 空间不够时压缩的是左栏（用户 2026-10-08）。
    h('div', { style: { display: 'grid', gridTemplateColumns: 'minmax(0, 1fr) 180px', gap: 'var(--tdt-space-4)', alignItems: 'start' } },
      // ── 左：插件设置（可编辑表单）──
      h('div', { style: { minWidth: 0 } },
        h('div', { style: gridStyle }, ...basic.map(renderField)),
        h('button', { type: 'button', style: { ...linkStyle, marginTop: 'var(--tdt-space-3)' }, onClick: () => setShowAdvanced(v => !v) },
          `${t('editorAdvanced')}${showAdvanced ? ' ▲' : ' ▼'}`),
        showAdvanced
          ? h('div', null,
              h('div', { style: { fontSize: 'var(--tdt-font-sm)', color: 'var(--tdt-fg-3)', margin: 'var(--tdt-space-2) 0' } }, t('editorAdvancedHelp')),
              h('div', { style: gridStyle }, ...advanced.map(renderField)),
            )
          : null,
        h('div', { style: { marginTop: 'var(--tdt-space-3)', display: 'flex', gap: 'var(--tdt-space-2)', alignItems: 'center', flexWrap: 'wrap' } },
          h(Button, { variant: 'primary', size: 'lg', onClick: () => void save(), disabled: saving }, saving ? t('saving') : t('save')),
          // 改动了没保存 ⇒ 明确标出来（对标本插件「编辑的草稿（未保存）」那一档提示）。
          dirty
            ? h('span', { style: { fontSize: 'var(--tdt-font-sm)', color: 'var(--tdt-warning)' } }, t('settingsUnsaved'))
            : null,
          saved && !dirty ? h('span', { style: { color: 'var(--tdt-success)', fontSize: 'var(--tdt-font-sm)' } }, t('settingsSaveSuccess')) : null,
          error !== null ? h('span', { style: { color: 'var(--tdt-danger)', fontSize: 'var(--tdt-font-sm)' } }, error) : null,
        ),
      ),
      // ── 右：配置预览（只读，定宽 180px）──
      h('div', { style: { minWidth: 0 } },
        h('div', { style: { fontSize: 'var(--tdt-font-md)', fontWeight: 600, color: 'var(--tdt-fg-2)', marginBottom: 'var(--tdt-space-2)' } }, t('settingsCurrentConfig')),
        h('dl', {
          style: { margin: 0, display: 'grid', gridTemplateColumns: 'max-content 1fr', gap: 'var(--tdt-space-1) var(--tdt-space-2)', fontSize: 'var(--tdt-font-sm)' },
        }, ...FIELDS.map(f => [
          h('dt', { key: `${f.key}-k`, style: { color: 'var(--tdt-fg-3)' } }, t(f.labelKey)),
          h('dd', { key: `${f.key}-v`, style: { margin: 0, wordBreak: 'break-word' } }, previewValue(f)),
        ]).flat()),
      ),
    ),
  )
}
