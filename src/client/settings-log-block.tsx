/**
 * 设置页第 2 块 · 整体日志（`plugin_log`，插件进程日志，非任务日志）。
 *
 * 布局（用户 2026-10-08 定死）：**标题在左，自动刷新 + 刷新按钮在右**；下面一块日志内容区，
 * **限高、超出内部滚动**（否则 100 行日志把整页撑到几千像素，下面的表格区被顶出屏幕）。
 *
 * 刷新策略：固定 5s 轮询、开关控制；离开页面 / 关闭开关即停（`useEffect` cleanup）。不接 SSE。
 */
import { createElement as h, useEffect, useRef, useState, type CSSProperties } from 'react'
import { Button, Checkbox, SectionHead } from './ui'
import { fetchTableQuery, type SettingsTableQueryResult } from './settings-data'
import { DbTable } from './db-table'
import { IconCodeOutlineRegular } from '@deepseek-ai/dsh-client-ui-primitives'
import type { Translate } from './locales'

const REFRESH_MS = 5000
/** 日志区最大高度（px）：超出即内部滚动。与 `task-list.tsx` 的 360 同类（内容区限高）。 */
const LOG_MAX_HEIGHT_PX = 360

export function SettingsLogBlock({ t, style }: { t: Translate; style?: CSSProperties }): ReturnType<typeof h> {
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

  return h('div', { style },
    h(SectionHead, {
      icon: h(IconCodeOutlineRegular, { size: 16 }),
      title: t('settingsBlockLogTitle'),
      right: h('div', { style: { display: 'flex', alignItems: 'center', gap: 'var(--tdt-space-2)' } },
        h(Checkbox, { checked: auto, onChange: (next: boolean) => setAuto(next), label: t('settingsAutoRefresh') }),
        h(Button, { variant: 'outline', size: 'md', onClick: () => void load(), disabled: loading }, t('settingsRefresh')),
      ),
    }),
    error !== null
      ? h('div', { style: { fontSize: 'var(--tdt-font-sm)', color: 'var(--tdt-danger)', marginBottom: 'var(--tdt-space-2)' } }, error)
      : null,
    result === null || result.rows.length === 0
      ? h('p', { style: { color: 'var(--tdt-fg-3)', fontSize: 'var(--tdt-font-sm)', margin: 0 } }, t('settingsLogEmpty'))
      : h('div', { style: { maxHeight: `${LOG_MAX_HEIGHT_PX}px`, overflow: 'auto' } }, h(DbTable, { table: result, t })),
  )
}
