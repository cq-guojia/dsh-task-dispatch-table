/**
 * 单表结果渲染（设置页 Block 2 / Block 3 共用）：横向滚动 + 长值截断 + 悬停看全文。
 * 与旧调试页 `renderDbTable` 同思路，但独立成组件、不依赖主界面私有样式。
 */
import { createElement as h, type CSSProperties } from 'react'
import type { SettingsTableQueryResult } from './settings-data'
import type { Translate } from './locales'

const wrapStyle: CSSProperties = {
  overflowX: 'auto',
  border: '0.5px solid var(--tdt-border-light)',
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
  position: 'sticky', top: 0, background: 'var(--tdt-surface-2)', textAlign: 'left',
  padding: '6px 10px', borderBottom: '0.5px solid var(--tdt-border-heavy)',
  whiteSpace: 'nowrap', color: 'var(--tdt-fg-2)', fontWeight: 600,
}
const tdStyle: CSSProperties = {
  padding: '5px 10px', borderBottom: '0.5px solid var(--tdt-border-light)',
  maxWidth: '280px', whiteSpace: 'pre-wrap', wordBreak: 'break-word', verticalAlign: 'top',
}

export function DbTable({ table, t }: { table: SettingsTableQueryResult; t: Translate }): ReturnType<typeof h> {
  return h('div', null,
    h('div', {
      style: { fontSize: 'var(--tdt-font-sm)', color: 'var(--tdt-fg-2)', marginBottom: '4px' },
    }, `${table.name} · ${table.count} ${t('debugRowsSuffix')}${table.truncated ? `（${t('settingsTableTruncated')}）` : ''}`),
    table.rows.length === 0
      ? h('p', { style: { color: 'var(--tdt-fg-3)', fontSize: 'var(--tdt-font-sm)' } }, t('settingsTableEmpty'))
      : h('div', { style: wrapStyle },
          h('table', { style: tableStyle },
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
