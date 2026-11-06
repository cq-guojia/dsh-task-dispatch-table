/**
 * 单表结果渲染（现在只有「设置 → 日志」在用）。
 *
 * 2026-11-06：表格皮肤改接核心 `Table`（Plain 档：无线框、竖向浅分隔线、行悬浮淡蓝）。
 * 列宽口径不变（`ts` 缩短成「MM-DD HH:mm:ss」并定宽，省下的宽度全给 `message`），
 * `level` 仍按语义着色（warn 黄 / error 红）。
 */
import { createElement as h, type CSSProperties } from 'react'
import type { SettingsTableQueryResult } from './settings-data'
import { Table, type TableColumn, type TableRow } from './ui'

/** 定长列（px）：`message` 不列在这里 ⇒ 吃掉剩下全部宽度。 */
const COL_WIDTH: Record<string, number> = { seq: 56, ts: 116, level: 56, kind: 150 }

/** 时间戳缩短成「MM-DD HH:mm:ss」（原值是完整 ISO，占得太多）。 */
const shortTs = (iso: string): string => {
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return iso
  const p = (n: number): string => String(n).padStart(2, '0')
  return `${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}:${p(d.getSeconds())}`
}

/** 等级配色：error 红 / warn 黄 / info 不着色。 */
const levelStyleOf = (level: string): CSSProperties | undefined =>
  level === 'error' ? { color: 'var(--dshpc-danger)', fontWeight: 600 }
    : level === 'warn' ? { color: 'var(--dshpc-warning)', fontWeight: 600 }
      : undefined

export function DbTable({ table, emptyText }: { table: SettingsTableQueryResult | null; emptyText: string }): ReturnType<typeof h> {
  const rows = table?.rows ?? []
  const columns = table?.columns ?? []
  if (rows.length === 0) {
    return h('p', { style: { color: 'var(--dshpc-fg-3)', fontSize: 'var(--dshpc-font-sm)', margin: 0 } }, emptyText)
  }
  const tableColumns: TableColumn[] = columns.map(col => ({
    key: col,
    title: col,
    ...(COL_WIDTH[col] === undefined ? {} : { width: COL_WIDTH[col] }),
  }))
  const tableRows: TableRow[] = rows.map((row, i) => ({
    key: i,
    // cells 是「列 key → 单元格」的映射（不是数组）；每列都给显式 content。
    cells: columns.reduce<Record<string, ReturnType<typeof h>>>((acc, col) => {
      const value = row[col]
      const raw = value === null || value === undefined ? '—' : String(value)
      // 时间列显示缩短值（悬停仍给完整 ISO）；其余定长列超长截断；message 整段换行。
      const text = col === 'ts' ? shortTs(raw) : (col === 'message' ? raw : (raw.length > 160 ? `${raw.slice(0, 160)}…` : raw))
      acc[col] = h('span', { style: col === 'level' ? levelStyleOf(raw) : undefined, title: raw }, text)
      return acc
    }, {}),
  }))
  return h(Table, {
    ariaLabel: emptyText,
    columns: tableColumns,
    rows: tableRows,
    density: 'compact',
  })
}
