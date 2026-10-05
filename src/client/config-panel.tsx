// 插件设置页表单（plugins.bundle.config 详情页）。
//
// ⚠️ 本插件配置刻意非 volatile（rc.1 约束：volatile 会让 entry 不激活），官方 configForms
// 因此 `unavailable`、官方 SettingsFormModel 不可用。故这里走本项目自有的 HTTP 通道
// （GET/POST /api/task-dispatch-table/config）读写计时参数，与宿主侧 settings scope.update 对接，
// 经 scope.watch 实时生效（tickMs 重启 interval，其余字段 reconcile/scheduler 实时读 scope.get()）。
//
// 宿主插件管理详情页已在上方渲染了图标 / 名称 / 简介（取自 package.json），本组件只负责
// 「基础信息（只读展示）」+「运行参数（可编辑，实时生效）」两块。
import { createElement as h, useEffect, useRef, useState } from 'react'
import { FloatingToast, ensureToastStyle } from './toast-css'
import type { Translate } from './locales'
import { Button, NumberInput } from './ui'

interface ScopeConfig {
  tickMs: number
  dispatchGraceMs: number
  leaseMs: number
  unknownGraceMs: number
}

type FieldKey = keyof ScopeConfig

interface FieldDef {
  key: FieldKey
  labelKey: 'settingsLoopSec' | 'settingsWaitSec' | 'settingsLeaseSec' | 'settingsUnknownSec'
  hintKey: 'settingsLoopHint' | 'settingsWaitHint' | 'settingsLeaseHint' | 'settingsUnknownHint'
  minSec: number
}

// 计时参数（用户原话的「循环 / 等待 / 分配循环 / 观察」四类），单位在界面上显示为「秒」，落库为毫秒。
const FIELDS: FieldDef[] = [
  { key: 'tickMs', labelKey: 'settingsLoopSec', hintKey: 'settingsLoopHint', minSec: 1 },
  { key: 'dispatchGraceMs', labelKey: 'settingsWaitSec', hintKey: 'settingsWaitHint', minSec: 1 },
  { key: 'leaseMs', labelKey: 'settingsLeaseSec', hintKey: 'settingsLeaseHint', minSec: 1 },
  { key: 'unknownGraceMs', labelKey: 'settingsUnknownSec', hintKey: 'settingsUnknownHint', minSec: 1 },
]

const API = 'api/task-dispatch-table/config'

const toSecs = (c: ScopeConfig): Record<FieldKey, number> => ({
  tickMs: Math.round(c.tickMs / 1000),
  dispatchGraceMs: Math.round(c.dispatchGraceMs / 1000),
  leaseMs: Math.round(c.leaseMs / 1000),
  unknownGraceMs: Math.round(c.unknownGraceMs / 1000),
})

const toMs = (s: Record<FieldKey, number>): ScopeConfig => ({
  tickMs: s.tickMs * 1000,
  dispatchGraceMs: s.dispatchGraceMs * 1000,
  leaseMs: s.leaseMs * 1000,
  unknownGraceMs: s.unknownGraceMs * 1000,
})

export interface ConfigPanelProps {
  t: Translate
  view?: 'summary' | 'page'
}

export function ConfigPanel(props: ConfigPanelProps) {
  const { t, view } = props
  // 列表摘要态不渲染整张表单（避免详情页摘要区过胖，与官方 SettingsForm 行为一致）。
  if (view !== undefined && view !== 'page') return null

  const [draft, setDraft] = useState<Record<FieldKey, number> | null>(null)
  const [saved, setSaved] = useState<Record<FieldKey, number> | null>(null)
  const [saving, setSaving] = useState(false)
  const [loadFailed, setLoadFailed] = useState(false)
  const [toast, setToast] = useState<{ text: string; tone: 'success' | 'error'; seq: number } | null>(null)
  const toastSeq = useRef(0)

  const flash = (text: string, tone: 'success' | 'error') => {
    toastSeq.current += 1
    setToast({ text, tone, seq: toastSeq.current })
  }

  useEffect(() => { ensureToastStyle() }, [])

  useEffect(() => {
    let alive = true
    void (async () => {
      try {
        const res = await fetch(API, { cache: 'no-store' })
        if (!res.ok) { if (alive) setLoadFailed(true); return }
        const body = await res.json() as { ok?: boolean; config?: ScopeConfig }
        if (!body.ok || !body.config) { if (alive) setLoadFailed(true); return }
        const secs = toSecs(body.config)
        if (alive) { setDraft(secs); setSaved(secs); setLoadFailed(false) }
      } catch {
        if (alive) setLoadFailed(true)
      }
    })()
    return () => { alive = false }
  }, [])

  if (draft === null || saved === null) {
    return h('div', { style: { padding: '4px 2px' } },
      h('p', { style: { color: 'var(--tdt-fg-2,#888)', fontSize: 'var(--tdt-font-md)', margin: 0 } },
        loadFailed ? t('settingsLoadFailed') : t('loading')),
    )
  }

  const dirty = FIELDS.some((f) => draft[f.key] !== saved[f.key])

  const onSave = async () => {
    for (const f of FIELDS) {
      const v = draft[f.key]
      if (!Number.isInteger(v) || v < f.minSec) {
        flash(t('invalidNumber'), 'error')
        return
      }
    }
    setSaving(true)
    try {
      const patch = toMs(draft)
      const res = await fetch(API, {
        method: 'POST',
        cache: 'no-store',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(patch),
      })
      const body = await res.json() as { ok?: boolean; config?: ScopeConfig }
      if (!res.ok || !body.ok || !body.config) {
        flash(t('saveFailed'), 'error')
        return
      }
      const secs = toSecs(body.config)
      setDraft(secs)
      setSaved(secs)
      flash(t('settingsSaveSuccess'), 'success')
    } catch {
      flash(t('saveFailed'), 'error')
    } finally {
      setSaving(false)
    }
  }

  return h('div', { style: { display: 'flex', flexDirection: 'column', gap: '22px', padding: '4px 2px', maxWidth: '640px' } },
    // —— 基础信息（只读展示；宿主已在上方渲染图标/名称/简介，这里补「标题写法 / 语言」说明）——
    h('section', { style: { display: 'flex', flexDirection: 'column', gap: '10px' } },
      h('h3', { style: { fontSize: 'var(--tdt-font-md)', fontWeight: 700, color: 'var(--tdt-fg,#1f2328)', margin: '0', letterSpacing: '.02em' } }, t('settingsBasic')),
      infoRow(t('settingsTitleFormat'), t('title')),
      infoRow(t('settingsDesc'), t('description')),
      infoRow(t('settingsLang'), t('settingsLangValue')),
    ),
    // —— 运行参数（可编辑，实时生效）——
    h('section', { style: { display: 'flex', flexDirection: 'column', gap: '16px' } },
      h('h3', { style: { fontSize: 'var(--tdt-font-md)', fontWeight: 700, color: 'var(--tdt-fg,#1f2328)', margin: '0', letterSpacing: '.02em' } }, t('settingsParams')),
      ...FIELDS.map((f) => h('div', { style: { display: 'flex', flexDirection: 'column', gap: '6px' } },
        h('label', { style: { fontSize: 'var(--tdt-font-md)', fontWeight: 600, color: 'var(--tdt-fg,#1f2328)' } }, t(f.labelKey)),
        h('div', { style: { display: 'flex', alignItems: 'center', gap: '8px' } },
          h(NumberInput, {
            value: draft[f.key],
            min: f.minSec,
            step: 1,
            size: 'sm',
            // 秒数可能是 5~6 位（如 86400）⇒ 这里例外放宽数字区宽度，不套用 36px 的默认规格。
            inputWidth: 48,
            suffix: t('settingsUnitSec'),
            label: t(f.labelKey),
            disabled: saving,
            onChange: (n: number) => { setDraft((prev: Record<FieldKey, number> | null) => (prev === null ? prev : { ...prev, [f.key]: n })) },
          }),
        ),
        h('p', { style: { fontSize: 'var(--tdt-font-sm)', color: 'var(--tdt-fg-2,#888)', lineHeight: 1.5, margin: 0 } }, t(f.hintKey)),
      )),
      h(Button, {
        variant: 'primary',
        size: 'sm',
        disabled: !dirty || saving,
        style: { alignSelf: 'flex-start', marginTop: '2px' },
        onClick: () => void onSave(),
      }, saving ? t('saving') : t('save')),
    ),
    toast !== null
      ? h(FloatingToast, { seq: toast.seq, tone: toast.tone, onDone: () => { setToast(null) }, text: toast.text })
      : null,
  )
}

function infoRow(label: string, value: string) {
  return h('div', {
    style: {
      display: 'flex', flexDirection: 'column', gap: '4px', padding: '10px 12px', borderRadius: 'var(--tdt-radius-sm)',
      background: 'var(--tdt-surface-2,#f5f5f5)', border: '1px solid var(--tdt-border,rgba(0,0,0,.08))',
    },
  },
    h('span', { style: { fontSize: 'var(--tdt-font-sm)', color: 'var(--tdt-fg-2,#888)', fontWeight: 600 } }, label),
    h('span', { style: { fontSize: 'var(--tdt-font-md)', color: 'var(--tdt-fg,#1f2328)', lineHeight: 1.5, whiteSpace: 'pre-wrap' } }, value),
  )
}
