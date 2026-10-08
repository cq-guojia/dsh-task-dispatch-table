/**
 * 单表结果渲染（设置页 Block 2 / Block 3 共用）：横向滚动 + 长值截断 + 悬停看全文。
 * 与旧调试页 `renderDbTable` 同思路，但独立成组件、不依赖主界面私有样式。
 *
 * 滚动 / 表头（用户 2026-10-08）：列表自带 `maxHeight`，超出即**内部滚动**（不顶高整页）；
 * 表头 `position: sticky` 固定，仅滚动内容区。斑马纹 + 悬停高亮（参考「执行记录」页观感，但用中性灰，
 * 不掺红绿黄蓝）。
 */
import { createElement as h, type CSSProperties } from 'react'
import { applyStyle } from './ui'
import type { SettingsTableQueryResult } from './settings-data'
import type { Translate } from './locales'

/** 斑马纹 / 悬停高亮（中性灰，明暗自适应）。 */
const DB_TABLE_DOMAIN = 'domain:db-table'
const DB_TABLE_CSS = `
.dsh-tdt-dbtable tbody tr:nth-child(even){background:color-mix(in srgb,var(--tdt-fg) 4%,transparent);}
.dsh-tdt-dbtable tbody tr:hover{background:var(--tdt-hover);}
`

const wrapStyle: CSSProperties = {
  overflow: 'auto',
  border: '0.5px solid var(--tdt-border-faint)',
  borderRadius: 'var(--tdt-radius-md)',
  marginTop: '8px',
}
const tableStyle: CSSProperties = {
  borderCollapse: 'collapse',
  font: 'var(--tdt-font-sm)',
  width: '100%',
  minWidth: 'max-content',
}
const thStyle: CSSProperties = {
  position: 'sticky', top: 0, zIndex: 1, background: 'var(--tdt-head-bg)', textAlign: 'left',
  padding: '7px 10px', borderBottom: '0.5px solid var(--tdt-border-heavy)',
  whiteSpace: 'nowrap', color: 'var(--tdt-fg-2)', fontWeight: 600,
}
const tdStyle: CSSProperties = {
  padding: '7px 10px', borderBottom: '0.5px solid var(--tdt-border-light)',
  maxWidth: '280px', whiteSpace: 'pre-wrap', wordBreak: 'break-word', verticalAlign: 'top',
}

export function DbTable({ table, t, maxHeight = 420 }: { table: SettingsTableQueryResult; t: Translate; maxHeight?: number }): ReturnType<typeof h> {
  applyStyle(DB_TABLE_DOMAIN, DB_TABLE_CSS)
  return h('div', null,
    h('div', {
      style: { fontSize: 'var(--tdt-font-sm)', color: 'var(--tdt-fg-2)', marginBottom: '4px' },
    }, `${table.name} · ${table.count} ${t('debugRowsSuffix')}${table.truncated ? `（${t('settingsTableTruncated')}）` : ''}`),
    table.rows.length === 0
      ? h('p', { style: { color: 'var(--tdt-fg-3)', fontSize: 'var(--tdt-font-sm)', margin: 0 } }, t('settingsTableEmpty'))
      : h('div', { style: { ...wrapStyle, maxHeight: `${maxHeight}px` } },
          h('table', { className: 'dsh-tdt-dbtable', style: tableStyle },
            h('thead', null, h('tr', null, table.columns.map(col => h('th', { key: col, style: thStyle }, col)))),
            h('tbody', null, table.rows.map((row, i) => h('tr', { key: i },
              table.columns.map(col => {
                const value = row[col]
                const text = value === null || value === undefined ? '—' : String(value)
                const clipped = text.length > 160 ? `${text.slice(0, 160)}…` : text
                const wide = col === 'detail' || col === 'value'
                return h('td', {
                  key: col,
                  style: wide ? { ...tdStyle, whiteSpace: 'pre-wrap', maxWidth: '420px' } : tdStyle,
                  title: text,
                }, clipped)
              }),
            ))),
          ),
        ),
  )
}
