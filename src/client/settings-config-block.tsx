/**
 * 设置页 Block 1 · 配置（配置编辑主入口）。
 *
 * - 进入即拉取当前全部可编辑配置回填表单（GET /config）。
 * - 保存走 POST /config（服务端白名单校验后 `scope.update` 落盘，运行态即时生效）。
 * - 下方附「当前生效配置」只读面板，便于核对保存结果。
 * 宿主插件详情页里的 `config-panel` 暂保留作兜底（用户 2026-10-08：先不管），此组件是配置编辑主场。
 */
import { createElement as h, useEffect, useState, type CSSProperties } from 'react'
import { Button, NumberInput, Input } from './ui'
import { fetchConfig, postConfig, type SettingsConfigValue } from './settings-data'
import type { LocaleKey, Translate } from './locales'

interface FieldDef {
  key: keyof SettingsConfigValue
  labelKey: LocaleKey
  hintKey?: LocaleKey
  group: 'basic' | 'advanced'
  kind: 'number' | 'string'
  unit?: string
  toDisplay?: (server: number) => number
  fromDisplay?: (display: number) => number
  min?: number
  max?: number
  step?: number
}

const SEC = 1000
const FIELDS: FieldDef[] = [
  { key: 'tickMs', labelKey: 'settingsLoopSec', hintKey: 'settingsLoopHint', group: 'basic', kind: 'number', unit: '秒', toDisplay: v => Math.round(v / SEC), fromDisplay: v => v * SEC, min: 1, max: 7 * 24 * 3600, step: 1 },
  { key: 'defaultProvider', labelKey: 'settingsProvider', group: 'basic', kind: 'string' },
  { key: 'defaultModel', labelKey: 'settingsModel', group: 'basic', kind: 'string' },
  { key: 'logRetentionDays', labelKey: 'settingsLogRetention', group: 'basic', kind: 'number', unit: '天', min: 1, max: 3650, step: 1 },
  { key: 'historyRetentionDays', labelKey: 'settingsHistoryRetention', group: 'basic', kind: 'number', unit: '天', min: 0, max: 3650, step: 1 },
  { key: 'attachmentTmpRetentionDays', labelKey: 'settingsAttachmentRetention', group: 'basic', kind: 'number', unit: '天', min: 1, max: 3650, step: 1 },
  { key: 'dispatchGraceMs', labelKey: 'settingsWaitSec', hintKey: 'settingsWaitHint', group: 'advanced', kind: 'number', unit: '秒', toDisplay: v => Math.round(v / SEC), fromDisplay: v => v * SEC, min: 1, max: 7 * 24 * 3600, step: 1 },
  { key: 'leaseMs', labelKey: 'settingsLeaseSec', hintKey: 'settingsLeaseHint', group: 'advanced', kind: 'number', unit: '秒', toDisplay: v => Math.round(v / SEC), fromDisplay: v => v * SEC, min: 1, max: 7 * 24 * 3600, step: 1 },
  { key: 'unknownGraceMs', labelKey: 'settingsUnknownSec', hintKey: 'settingsUnknownHint', group: 'advanced', kind: 'number', unit: '秒', toDisplay: v => Math.round(v / SEC), fromDisplay: v => v * SEC, min: 1, max: 7 * 24 * 3600, step: 1 },
  { key: 'statePath', labelKey: 'paramStatePath', group: 'advanced', kind: 'string' },
  { key: 'tasksDir', labelKey: 'paramTasksDir', group: 'advanced', kind: 'string' },
]

const linkStyle: CSSProperties = {
  background: 'none', border: 'none', color: 'var(--tdt-brand)', cursor: 'pointer',
  padding: '0', fontSize: 'var(--tdt-font-sm)',
}

export function SettingsConfigBlock({ t }: { t: Translate }): ReturnType<typeof h> {
  const [config, setConfig] = useState<SettingsConfigValue | null>(null)
  const [form, setForm] = useState<SettingsConfigValue | null>(null)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [saved, setSaved] = useState(false)
  const [showAdvanced, setShowAdvanced] = useState(false)

  useEffect(() => {
    let alive = true
    fetchConfig()
      .then(c => { if (alive) { setConfig(c); setForm(c) } })
      .catch(() => { if (alive) setError(t('settingsLoadFailed')) })
    return () => { alive = false }
  }, [t])

  const update = (key: keyof SettingsConfigValue, value: string | number): void => {
    setSaved(false)
    setForm(prev => (prev === null ? prev : { ...prev, [key]: value }))
  }

  const save = async (): Promise<void> => {
    if (form === null) return
    setSaving(true); setError(null)
    try {
      const patch: Record<string, string | number> = {}
      for (const f of FIELDS) {
        const raw = form[f.key]
        patch[f.key] = f.kind === 'number' && f.fromDisplay !== undefined ? f.fromDisplay(raw as number) : raw
      }
      const saved = await postConfig(patch as Partial<SettingsConfigValue>)
      setConfig(saved); setForm(saved)
      setSaved(true)
    } catch (e) {
      setError((e as Error).message || t('saveFailed'))
    } finally {
      setSaving(false)
    }
  }

  const renderField = (f: FieldDef): ReturnType<typeof h> => {
    const serverVal = form![f.key]
    const displayVal = f.kind === 'number'
      ? (f.toDisplay !== undefined ? f.toDisplay(serverVal as number) : serverVal as number)
      : serverVal as string
    return h('div', { key: f.key, style: { marginBottom: '14px' } },
      h('label', { style: { display: 'block', fontSize: 'var(--tdt-font-md)', fontWeight: 600, marginBottom: '4px' } }, t(f.labelKey)),
      f.hintKey !== undefined
        ? h('div', { style: { fontSize: 'var(--tdt-font-sm)', color: 'var(--tdt-fg-3)', marginBottom: '6px' } }, t(f.hintKey))
        : null,
      f.kind === 'number'
        ? h(NumberInput, {
            value: displayVal as number, min: f.min, max: f.max, step: f.step ?? 1, suffix: f.unit,
            label: t(f.labelKey), onChange: v => update(f.key, v),
          })
        : h(Input, { value: displayVal as string, onChange: v => update(f.key, v) }),
    )
  }

  if (config === null || form === null) {
    return h('div', { style: { color: 'var(--tdt-fg-3)', fontSize: 'var(--tdt-font-sm)' } }, t('loading'))
  }

  const basic = FIELDS.filter(f => f.group === 'basic')
  const advanced = FIELDS.filter(f => f.group === 'advanced')

  return h('div', null,
    h('h3', { style: { fontSize: 'var(--tdt-font-lg)', fontWeight: 700, margin: '0 0 12px' } }, t('settingsConfigTitle')),
    ...basic.map(renderField),
    h('button', { type: 'button', style: linkStyle, onClick: () => setShowAdvanced(v => !v) },
      `${t('editorAdvanced')}${showAdvanced ? ' ▲' : ' ▼'}`),
    showAdvanced
      ? h('div', null,
          h('div', { style: { fontSize: 'var(--tdt-font-sm)', color: 'var(--tdt-fg-3)', margin: '8px 0' } }, t('editorAdvancedHelp')),
          ...advanced.map(renderField),
        )
      : null,
    h('div', { style: { marginTop: '16px', display: 'flex', gap: '8px', alignItems: 'center', flexWrap: 'wrap' } },
      h(Button, { variant: 'primary', onClick: () => void save(), disabled: saving }, saving ? t('saving') : t('save')),
      saved ? h('span', { style: { color: 'var(--tdt-success, #2BA471)', fontSize: 'var(--tdt-font-sm)' } }, t('settingsSaveSuccess')) : null,
      error !== null ? h('span', { style: { color: 'var(--tdt-error)', fontSize: 'var(--tdt-font-sm)' } }, error) : null,
    ),
    h('div', { style: { marginTop: '24px', paddingTop: '16px', borderTop: '0.5px solid var(--tdt-border-light)' } },
      h('h4', { style: { fontSize: 'var(--tdt-font-md)', fontWeight: 600, margin: '0 0 8px' } }, t('settingsCurrentConfig')),
      h('dl', {
        style: { margin: 0, display: 'grid', gridTemplateColumns: 'max-content 1fr', gap: '4px 16px', fontSize: 'var(--tdt-font-sm)' },
      }, ...FIELDS.map(f => [
        h('dt', { key: `${f.key}-k`, style: { color: 'var(--tdt-fg-3)' } }, t(f.labelKey)),
        h('dd', { key: `${f.key}-v`, style: { margin: 0 } }, String(config[f.key])),
      ]).flat()),
    ),
  )
}
