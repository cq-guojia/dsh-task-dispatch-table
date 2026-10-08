/**
 * 设置页第 1 块 · 插件设置（配置编辑主入口）。
 *
 * 布局（用户 2026-10-08）：**一排两个** —— 每个设置 = 标题（上）+ 输入框（中）+ 说明（下），
 * 与 `dsh-session-title-pattern` 插件的设置槽位同款格式；保存逻辑沿用 `POST /config`。
 *
 * 取值与写回：
 * - 进入拉 `GET /config`（返回**生效值** + **系统默认值**）⇒ 用户没设的字段直接显示系统默认值；
 * - 保存走 `POST /config`，提交全量白名单字段；**与系统默认值相同的字段服务端不落用户层**
 *   （改回默认值 = 撤销这条用户设置，用户层保持干净）。
 *
 * 插件只有一个、路径固定 ⇒ 状态库路径 / 任务目录不在此暴露编辑（用户 2026-10-08：这俩不需要设置）。
 *
 * ⚠️ **表单状态一律存服务端值**（毫秒），显示时才换算（`toDisplay`）—— 早前把「显示单位（秒）」
 * 存进状态、显示时又换算一次，改一次时间字段就会被二次换算成 0.12 秒（2026-10-08 修）。
 */
import { createElement as h, useEffect, useState, type CSSProperties } from 'react'
import { Button, NumberInput, Input, SectionHead } from './ui'
import { fetchConfig, postConfig, type SettingsConfigValue } from './settings-data'
import { IconCordisPluginOutlineRegular } from '@deepseek-ai/dsh-client-ui-primitives'
import type { LocaleKey, Translate } from './locales'

interface FieldDef {
  key: keyof SettingsConfigValue
  labelKey: LocaleKey
  hintKey?: LocaleKey
  kind: 'number' | 'string'
  unit?: string
  /** 服务端值 → 显示值（毫秒 → 秒）。 */
  toDisplay?: (server: number) => number
  /** 显示值 → 服务端值（秒 → 毫秒）；表单写入时用。 */
  fromDisplay?: (display: number) => number
  min?: number
  max?: number
  step?: number
}

const SEC = 1000
/** 暴露给用户的设置：仅两项最核心的插件级开关（见文件头注）。 */
const FORM_FIELDS: FieldDef[] = [
  { key: 'tickMs', labelKey: 'settingsLoopSec', hintKey: 'settingsLoopHint', kind: 'number', unit: '秒', toDisplay: v => Math.round(v / SEC), fromDisplay: v => v * SEC, min: 1, max: 7 * 24 * 3600, step: 1 },
  { key: 'logRetentionDays', labelKey: 'settingsLogRetention', kind: 'number', unit: '天', min: 1, max: 3650, step: 1 },
]

/** 字段栅格：一排两个。 */
const gridStyle: CSSProperties = {
  display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0, 1fr))', gap: 'var(--tdt-space-4)',
}

export function SettingsConfigBlock({ t }: { t: Translate }): ReturnType<typeof h> {
  // form 恒存**服务端值**（毫秒 / 天 / 字符串）。
  const [form, setForm] = useState<SettingsConfigValue | null>(null)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [saved, setSaved] = useState(false)

  useEffect(() => {
    let alive = true
    fetchConfig()
      .then(p => { if (alive) setForm(p.config) })
      .catch((e: Error) => { if (alive) setError(e.message || t('settingsLoadFailed')) })
    return () => { alive = false }
  }, [t])

  /** 显示值（秒 / 天 / 字符串）→ 存服务端值。 */
  const update = (f: FieldDef, value: string | number): void => {
    setSaved(false)
    const server = f.kind === 'number' && f.fromDisplay !== undefined ? f.fromDisplay(value as number) : value
    setForm(prev => (prev === null ? prev : { ...prev, [f.key]: server as never }))
  }

  const save = async (): Promise<void> => {
    if (form === null) return
    setSaving(true); setError(null)
    try {
      const payload = await postConfig(form)
      setForm(payload.config)
      setSaved(true)
    } catch (e) {
      setError((e as Error).message || t('saveFailed'))
    } finally {
      setSaving(false)
    }
  }

  /** 每个设置：标题（上）→ 输入框（中）→ 说明（下）。 */
  const renderField = (f: FieldDef): ReturnType<typeof h> => {
    const serverVal = form![f.key]
    const displayVal = f.kind === 'number'
      ? (f.toDisplay !== undefined ? f.toDisplay(serverVal as number) : serverVal as number)
      : serverVal as string
    return h('div', { key: f.key, style: { minWidth: 0 } },
      h('label', { style: { display: 'block', fontSize: 'var(--tdt-font-md)', fontWeight: 600, marginBottom: 'var(--tdt-space-2)' } }, t(f.labelKey)),
      f.kind === 'number'
        ? h(NumberInput, {
            value: displayVal as number, min: f.min, max: f.max, step: f.step ?? 1, suffix: f.unit,
            label: t(f.labelKey), style: { width: '100%' }, onChange: v => update(f, v),
          })
        : h(Input, { value: displayVal as string, onChange: v => update(f, v), style: { width: '100%' } }),
      f.hintKey !== undefined
        ? h('div', { style: { fontSize: 'var(--tdt-font-sm)', color: 'var(--tdt-fg-3)', marginTop: 'var(--tdt-space-2)', lineHeight: 'var(--tdt-line-sm)' } }, t(f.hintKey))
        : null,
    )
  }

  if (form === null) {
    return h('div', { style: { color: 'var(--tdt-fg-3)', fontSize: 'var(--tdt-font-sm)' } }, t('loading'))
  }

  return h('div', null,
    h(SectionHead, { icon: h(IconCordisPluginOutlineRegular, { size: 16 }), title: t('settingsConfigTitle') }),
    h('div', { style: gridStyle }, ...FORM_FIELDS.map(renderField)),
    h('div', { style: { marginTop: 'var(--tdt-space-4)', display: 'flex', gap: 'var(--tdt-space-2)', alignItems: 'center', flexWrap: 'wrap' } },
      h(Button, { variant: 'primary', size: 'lg', onClick: () => void save(), disabled: saving }, saving ? t('saving') : t('save')),
      saved ? h('span', { style: { color: 'var(--tdt-success)', fontSize: 'var(--tdt-font-sm)' } }, t('settingsSaveSuccess')) : null,
      error !== null ? h('span', { style: { color: 'var(--tdt-danger)', fontSize: 'var(--tdt-font-sm)' } }, error) : null,
    ),
  )
}
