/**
 * 设置页 Block 3 · 原始数据查询。
 *
 * 查询 `state.db` 全部 6 张表（不隐藏）。滑动标签单选一张表；共享「取前 N 条」（默认 100，可选 100/200/500）；
 * 通用筛选组件按所选表列动态生成（列名下拉 + 运算符 + 值）；结果横向滚动展示。
 * 不做服务端分页（用户 2026-10-08：top-N 自过滤、客户端自行筛选）。每表按各自最新字段 DESC 取数（在后端）。
 */
import { createElement as h, useEffect, useState } from 'react'
import { Button, NumberInput, Segmented } from './ui'
import { fetchTableQuery, SETTINGS_TABLES, TABLE_COLUMNS, type SettingsTableFilter, type SettingsTableQueryResult } from './settings-data'
import { DbTable } from './db-table'
import { TableFilterRow } from './table-filter'
import type { Translate } from './locales'

export function SettingsTableBlock({ t }: { t: Translate }): ReturnType<typeof h> {
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

  return h('div', null,
    h('h3', { style: { fontSize: 'var(--tdt-font-lg)', fontWeight: 700, margin: '0 0 12px' } }, t('settingsBlockDataTitle')),
    h('div', { style: { marginBottom: '12px', overflowX: 'auto' } },
      h(Segmented<string>, {
        value: table, onChange: (value: string) => setTable(value),
        items: SETTINGS_TABLES.map(tbl => ({ value: tbl, label: tbl })),
      }),
    ),
    h('div', { style: { display: 'flex', alignItems: 'center', gap: '16px', marginBottom: '12px', flexWrap: 'wrap' } },
      h('label', { style: { display: 'inline-flex', alignItems: 'center', gap: '6px', fontSize: 'var(--tdt-font-sm)' } },
        `${t('settingsTopN')} `,
        h(NumberInput, { value: n, min: 1, max: 500, step: 50, label: t('settingsTopN'), onChange: setN })),
      h(Button, { variant: 'primary', onClick: () => void query(), disabled: loading }, t('settingsQuery')),
      loading ? h('span', { style: { fontSize: 'var(--tdt-font-sm)', color: 'var(--tdt-fg-3)' } }, t('loading')) : null,
      error !== null ? h('span', { style: { fontSize: 'var(--tdt-font-sm)', color: 'var(--tdt-error)' } }, error) : null,
    ),
    h('div', { style: { marginBottom: '12px' } },
      filters.length === 0
        ? h('span', { style: { fontSize: 'var(--tdt-font-sm)', color: 'var(--tdt-fg-3)' } }, t('settingsNoFilters'))
        : null,
      ...filters.map((f, i) => h(TableFilterRow, {
        key: i, filter: f, columns, t,
        onChange: (next) => updateFilter(i, next), onRemove: () => removeFilter(i),
      })),
      h(Button, { variant: 'outline', onClick: addFilter }, t('settingsAddFilter')),
    ),
    result === null
      ? null
      : result.rows.length === 0
        ? h('p', { style: { color: 'var(--tdt-fg-3)', fontSize: 'var(--tdt-font-sm)' } }, t('settingsTableEmpty'))
        : h(DbTable, { table: result, t }),
  )
}
