/**
 * 单表结果渲染（设置页 Block 2 / Block 3 共用）。
 *
 * 观感**直接复用「任务配置 → 展开 → 执行记录」表格**：同一批 `.dsh-tdt-rec-*` 类（表头吸顶 / 斑马纹 /
 * hover），同一套格子度量（表头 `11px 10px`、格 `9px 10px`、字号 `--tdt-font-sm`）——不另抄一份，
 * 免得两处漂移。类定义在 `task-list.tsx` 的 `domain:list`，故这里渲染前调 `ensureTaskListStyle()`。
 *
 * ⚠️ **字号必须写 `fontSize`，不能写 `font` 简写**：`font: 12px` 是**无效声明**（简写要求字号 + 字族），
 * 整条被浏览器丢弃 ⇒ 表格退回宿主默认字号，看着就跟执行记录不一样（用户 2026-10-08 揪出）。
 *
 * 高度（用户 2026-10-08）：**固定 `height`**（不是 maxHeight），有数据 / 没数据都一样高 ⇒ 页面不跳。
 */
import { createElement as h, type CSSProperties } from 'react'
import { ensureTaskListStyle } from './task-list'
import type { SettingsTableQueryResult } from './settings-data'
import type { Translate } from './locales'

/** 结果区固定高度（px）：有数据 / 没数据都一样高。 */
const TABLE_HEIGHT_PX = 420

const boxStyle: CSSProperties = {
  // ⚠️ 底盘必须是 surface-1（白）：斑马纹 `--tdt-plate` 只比它深一档，底盘若再带灰就跟斑马纹分不出来。
  height: `${TABLE_HEIGHT_PX}px`, overflow: 'auto', background: 'var(--tdt-surface-1)',
}
const tableStyle: CSSProperties = {
  width: '100%', minWidth: 'max-content', borderCollapse: 'collapse', fontSize: 'var(--tdt-font-sm)',
}
/** 表头：与执行记录 `recHeadStyle` 同度量；上下线走 **box-shadow**（`border-collapse` 下边框归表格网格 ⇒
 *  sticky 表头滚动时边框会「滑走」）。吸顶本身由 `.dsh-tdt-rec-head th` 接管。 */
const thStyle: CSSProperties = {
  padding: '11px 10px', textAlign: 'left', fontWeight: 600, color: 'var(--tdt-fg-2)',
  background: 'var(--tdt-head-bg)', whiteSpace: 'nowrap',
  boxShadow: 'inset 0 1px 0 var(--tdt-border), inset 0 -1px 0 var(--tdt-border)',
}
/** 数据格：与执行记录 `miniCellStyle` 同度量；**不用实线分隔**，行与行靠斑马纹区分。 */
const tdStyle: CSSProperties = {
  padding: '9px 10px', textAlign: 'left', color: 'var(--tdt-fg)', fontSize: 'var(--tdt-font-sm)',
  maxWidth: '280px', wordBreak: 'break-word', verticalAlign: 'top',
}

export function DbTable({ table, t, emptyText }: { table: SettingsTableQueryResult | null; t: Translate; emptyText: string }): ReturnType<typeof h> {
  ensureTaskListStyle()
  const rows = table?.rows ?? []
  const columns = table?.columns ?? []
  return h('div', null,
    // 标题行常驻（没数据时留空行）⇒ 这一行的高度也不随数据有无变化。
    h('div', { style: { fontSize: 'var(--tdt-font-sm)', color: 'var(--tdt-fg-2)', marginBottom: '4px', minHeight: 'var(--tdt-line-sm)' } },
      table === null ? '' : `${table.name} · ${table.count} ${t('debugRowsSuffix')}${table.truncated ? `（${t('settingsTableTruncated')}）` : ''}`),
    h('div', { style: boxStyle },
      rows.length === 0
        ? h('p', { style: { color: 'var(--tdt-fg-3)', fontSize: 'var(--tdt-font-sm)', margin: '10px' } }, emptyText)
        : h('table', { style: tableStyle },
            h('thead', { className: 'dsh-tdt-rec-head' }, h('tr', null,
              columns.map(col => h('th', { key: col, style: thStyle }, col)))),
            h('tbody', null,
              rows.map((row, i) => h('tr', {
                key: i,
                // 斑马纹与执行记录同款：`.dsh-tdt-rec-alt` 给奇数行浅底，`.dsh-tdt-rec-row` 管 hover。
                className: i % 2 === 1 ? 'dsh-tdt-rec-row dsh-tdt-rec-alt' : 'dsh-tdt-rec-row',
              },
                columns.map(col => {
                  const value = row[col]
                  const text = value === null || value === undefined ? '—' : String(value)
                  const clipped = text.length > 160 ? `${text.slice(0, 160)}…` : text
                  const wide = col === 'detail' || col === 'value'
                  return h('td', {
                    key: col,
                    style: wide ? { ...tdStyle, maxWidth: '420px' } : tdStyle,
                    title: text,
                  }, clipped)
                }),
              ))),
          ),
    ),
  )
}
