/**
 * 设置页第 3 块 · 数据库表查询（`state.db` 全部 6 张表，不隐藏）。
 *
 * 布局（用户 2026-10-08 定死）：**标题在左，表切换（滑动标签）在右**；下面依次是「取前 N 条 + 查询」、
 * 通用筛选行、结果表。取数 = `WHERE <筛选> ORDER BY <该表最新字段> DESC LIMIT N`（排序在后端）。
 */
import { createElement as h, useEffect, useState, type CSSProperties } from 'react'
import { Button, NumberInput, Segmented, SectionHead } from './ui'
import { fetchTableQuery, SETTINGS_TABLES, TABLE_COLUMNS, type SettingsTableFilter, type SettingsTableQueryResult } from './settings-data'
import { DbTable } from './db-table'
import { TableFilterRow } from './table-filter'
import { IconDatabaseOutlineRegular } from '@deepseek-ai/dsh-client-ui-primitives'
import type { Translate } from './locales'

export function SettingsTableBlock({ t, style }: { t: Translate; style?: CSSProperties }): ReturnType<typeof h> {
  const [table, setTable] = useState<string>(SETTINGS_TABLES[0])
  const [n, setN] = useState(100)
  const [filters, setFilters] = useState<SettingsTableFilter[]>([])
  const [result, setResult] = useState<SettingsTableQueryResult | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const columns = TABLE_COLUMNS[table] ?? []

  const query = async (): Promise<void> => {
    setLoading(true); setError(null)
    try {
      setResult(await fetchTableQuery({ table, n, filters }))
    } catch (e) {
      setError((e as Error).message || t('settingsTableFail'))
    } finally {
      setLoading(false)
    }
  }

  // 切表：重置筛选并自动查询（列集合随表变化）。
  useEffect(() => {
    setFilters([])
    void query()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [table])

  const updateFilter = (i: number, next: SettingsTableFilter): void => {
    setFilters(prev => prev.map((f, idx) => (idx === i ? next : f)))
  }
  const removeFilter = (i: number): void => setFilters(prev => prev.filter((_, idx) => idx !== i))
  const addFilter = (): void => {
    if (columns.length === 0) return
    setFilters(prev => [...prev, { column: columns[0], op: '=', value: '' }])
  }

  return h('div', { style },
    h(SectionHead, {
      icon: h(IconDatabaseOutlineRegular, { size: 16 }),
      title: t('settingsBlockDataTitle'),
      right: h('div', { style: { overflowX: 'auto', maxWidth: '100%' } },
        h(Segmented<string>, {
          value: table, size: 'md', onChange: (value: string) => setTable(value),
          items: SETTINGS_TABLES.map(tbl => ({ value: tbl, label: tbl })),
        })),
    }),
    h('div', { style: { display: 'flex', alignItems: 'center', gap: 'var(--tdt-space-3)', marginBottom: 'var(--tdt-space-2)', flexWrap: 'wrap' } },
      h('label', { style: { display: 'inline-flex', alignItems: 'center', gap: 'var(--tdt-space-2)', fontSize: 'var(--tdt-font-sm)' } },
        `${t('settingsTopN')} `,
        h(NumberInput, { value: n, min: 1, max: 500, step: 50, size: 'sm', label: t('settingsTopN'), onChange: setN })),
      h(Button, { variant: 'outline', size: 'md', onClick: () => void query(), disabled: loading }, t('settingsQuery')),
      error !== null ? h('span', { style: { fontSize: 'var(--tdt-font-sm)', color: 'var(--tdt-danger)' } }, error) : null,
    ),
    h('div', { style: { marginBottom: 'var(--tdt-space-2)' } },
      filters.length === 0
        ? h('span', { style: { fontSize: 'var(--tdt-font-sm)', color: 'var(--tdt-fg-3)' } }, t('settingsNoFilters'))
        : null,
      ...filters.map((f, i) => h(TableFilterRow, {
        key: i, filter: f, columns, t,
        onChange: (next) => updateFilter(i, next), onRemove: () => removeFilter(i),
      })),
      h(Button, { variant: 'outline', size: 'sm', onClick: addFilter }, t('settingsAddFilter')),
    ),
    result === null || result.rows.length === 0
      ? h('p', { style: { color: 'var(--tdt-fg-3)', fontSize: 'var(--tdt-font-sm)', margin: 0 } }, t('settingsTableEmpty'))
      : h(DbTable, { table: result, t }),
  )
}
