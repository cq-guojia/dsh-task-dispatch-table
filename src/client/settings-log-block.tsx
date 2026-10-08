/**
 * 设置页 Block 2 · 整体日志。
 *
 * 专查 `plugin_log`（插件进程日志，非任务日志）。固定 5s 轮询，受开关控制；
 * 离开页面 / 关闭开关即停轮询（`useEffect` cleanup）。不接 SSE（用户 2026-10-08：轮询即可）。
 */
import { createElement as h, useEffect, useRef, useState } from 'react'
import { Button } from './ui'
import { fetchTableQuery, type SettingsTableQueryResult } from './settings-data'
import { DbTable } from './db-table'
import type { Translate } from './locales'

const REFRESH_MS = 5000

export function SettingsLogBlock({ t }: { t: Translate }): ReturnType<typeof h> {
  const [result, setResult] = useState<SettingsTableQueryResult | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [auto, setAuto] = useState(false)
  const timerRef = useRef<number | null>(null)

  const load = async (): Promise<void> => {
    setLoading(true); setError(null)
    try {
      setResult(await fetchTableQuery({ table: 'plugin_log', n: 100, filters: [] }))
    } catch (e) {
      setError((e as Error).message || t('settingsLogFail'))
    } finally {
      setLoading(false)
    }
  }

  // 进入页面先取一次。
  useEffect(() => {
    void load()
    return () => { if (timerRef.current !== null) window.clearInterval(timerRef.current) }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // 自动刷新开关：开 ⇒ 5s 轮询；关 / 卸载 ⇒ 清定时器。
  useEffect(() => {
    if (timerRef.current !== null) { window.clearInterval(timerRef.current); timerRef.current = null }
    if (auto) timerRef.current = window.setInterval(() => { void load() }, REFRESH_MS)
    return () => {
      if (timerRef.current !== null) { window.clearInterval(timerRef.current); timerRef.current = null }
    }
  }, [auto])

  return h('div', null,
    h('h3', { style: { fontSize: 'var(--tdt-font-lg)', fontWeight: 700, margin: '0 0 12px' } }, t('settingsBlockLogTitle')),
    h('div', { style: { display: 'flex', alignItems: 'center', gap: '16px', marginBottom: '12px', flexWrap: 'wrap' } },
      h('label', { style: { display: 'flex', alignItems: 'center', gap: '6px', fontSize: 'var(--tdt-font-sm)', cursor: 'pointer' } },
        h('input', {
          type: 'checkbox', checked: auto,
          onChange: (e: { target: { checked: boolean } }) => setAuto(e.target.checked),
        } as never),
        t('settingsAutoRefresh')),
      h(Button, { variant: 'primary', onClick: () => void load(), disabled: loading }, t('settingsRefresh')),
      loading ? h('span', { style: { fontSize: 'var(--tdt-font-sm)', color: 'var(--tdt-fg-3)' } }, t('loading')) : null,
      error !== null ? h('span', { style: { fontSize: 'var(--tdt-font-sm)', color: 'var(--tdt-error)' } }, error) : null,
    ),
    result === null
      ? null
      : result.rows.length === 0
        ? h('p', { style: { color: 'var(--tdt-fg-3)', fontSize: 'var(--tdt-font-sm)' } }, t('settingsLogEmpty'))
        : h(DbTable, { table: result, t }),
  )
}
