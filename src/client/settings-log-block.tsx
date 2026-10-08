/**
 * 设置页第 2 块 · 整体日志（`plugin_log`，插件进程日志，非任务日志）。
 *
 * 控件排布（用户 2026-10-08，**全插件统一**）：`自动刷新`（**默认勾选**）→ `刷新` → `显示 N 条`（**最右**）。
 * 「显示 N 条」与「任务配置 → 展开 → 执行记录」那一条**同一个口径**：`显示 <下拉> 条`，
 * 走 `limitPrefix` / `limitSuffix` 文案 + `SelectField size="md" width={70}`，靠 `marginLeft:auto` 顶到最右。
 *
 * 不再有内部滚动槽：整段日志直接铺在页面上，靠**页面**往下滚（用户 2026-10-08）。
 *
 * 刷新策略：固定 5s 轮询、开关控制；离开页面 / 关闭开关即停（`useEffect` cleanup）。不接 SSE。
 */
import { createElement as h, useEffect, useRef, useState, type CSSProperties } from 'react'
import { Button, Checkbox, SectionHead, SelectField } from './ui'
import { fetchTableQuery, type SettingsTableQueryResult } from './settings-data'
import { DbTable } from './db-table'
import { IconCodeOutlineRegular } from '@deepseek-ai/dsh-client-ui-primitives'
import type { Translate } from './locales'

const REFRESH_MS = 5000
/** 与「执行记录」面板同一组档位。 */
const PAGE_SIZES = [50, 100, 200]

/** 条数过滤的外壳：与任务配置 `limitRowStyle` 同款（`marginLeft:auto` ⇒ 整组里它最右）。 */
const limitRowStyle: CSSProperties = {
  display: 'inline-flex', alignItems: 'center', gap: '4px', marginLeft: 'auto',
  fontSize: 'var(--tdt-font-xs)', color: 'var(--tdt-fg-3)',
}

export function SettingsLogBlock({ t, style }: { t: Translate; style?: CSSProperties }): ReturnType<typeof h> {
  const [result, setResult] = useState<SettingsTableQueryResult | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  // 自动刷新**默认开**（用户 2026-10-08 全插件统一）。
  const [auto, setAuto] = useState(true)
  const [n, setN] = useState(100)
  const timerRef = useRef<number | null>(null)

  const load = async (): Promise<void> => {
    setLoading(true); setError(null)
    try {
      setResult(await fetchTableQuery({ table: 'plugin_log', n, filters: [] }))
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
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [auto, n])

  return h('div', { style },
    h(SectionHead, {
      icon: h(IconCodeOutlineRegular, { size: 16 }),
      title: t('settingsBlockLogTitle'),
      right: h('div', { style: { display: 'flex', alignItems: 'center', gap: 'var(--tdt-space-2)', flexWrap: 'wrap' } },
        h(Checkbox, { checked: auto, onChange: (next: boolean) => setAuto(next), label: t('settingsAutoRefresh') }),
        h(Button, { variant: 'outline', size: 'md', onClick: () => void load(), disabled: loading }, t('settingsRefresh')),
        h('label', { style: limitRowStyle },
          t('limitPrefix'),
          h(SelectField, {
            value: String(n),
            options: PAGE_SIZES.map(v => ({ value: String(v), label: String(v) })),
            onChange: (next: string) => { setN(Number(next)) },
            placeholder: String(n),
            emptyLabel: t('editorNoOptions'),
            ariaLabel: t('cardLogLimit'),
            size: 'md',
            width: 70,
          }),
          t('limitSuffix'),
        ),
      ),
    }),
    error !== null
      ? h('div', { style: { fontSize: 'var(--tdt-font-sm)', color: 'var(--tdt-danger)', marginBottom: 'var(--tdt-space-2)' } }, error)
      : null,
    h(DbTable, { table: result, t, emptyText: t('settingsLogEmpty') }),
  )
}
