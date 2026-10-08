/**
 * 单表结果渲染（现在只有「插件日志」在用）。
 *
 * 观感**直接复用「任务配置 → 展开 → 执行记录」表格**的斑马纹与 hover（同一批 `.dsh-tdt-rec-*` 类，
 * 定义在 `task-list.tsx` 的 `domain:list`，故渲染前调 `ensureTaskListStyle()`）。
 *
 * ⚠️ **表头不吸顶**（用户 2026-10-08）：这里是**页面滚动**，吸顶会让表头浮在上下文之外、
 * 上面还会漏出内容 ⇒ 表头跟着内容一起滚走，不再用 `.dsh-tdt-rec-head`。
 *
 * 列宽（用户 2026-10-08）：`ts` 缩短成「MM-DD HH:mm:ss」并**定宽**，省下来的宽度全给 `message`
 * （日志正文可能很长，其余列都是定长短字段）。
 * `level` 按语义着色：**warn 黄 / error 红**（`plugin_log.level` 的枚举是 info | warn | error）。
 *
 * ⚠️ **字号必须写 `fontSize`，不能写 `font` 简写**：`font: 12px` 是**无效声明**（简写要求字号 + 字族），
 * 整条被浏览器丢弃 ⇒ 表格退回宿主默认字号（用户 2026-10-08 揪出）。
 * ⚠️ **不能给 `min-width: max-content`**（那会把页面撑出横向滚动条）⇒ 列宽交给 `table-layout: fixed`。
 */
import { createElement as h, type CSSProperties } from 'react'
import { ensureTaskListStyle } from './task-list'
import type { SettingsTableQueryResult } from './settings-data'
import type { Translate } from './locales'

/** 定长列：`message` 不列在这里 ⇒ 吃掉剩下全部宽度。 */
const COL_WIDTH: Record<string, string> = { seq: '56px', ts: '116px', level: '56px', kind: '150px' }

/** 时间戳缩短成「MM-DD HH:mm:ss」（原值是完整 ISO，占得太多）。 */
const shortTs = (iso: string): string => {
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return iso
  const p = (n: number): string => String(n).padStart(2, '0')
  return `${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}:${p(d.getSeconds())}`
}

/** 等级配色：error 红 / warn 黄 / info 不着色。 */
const levelStyleOf = (level: string): CSSProperties | undefined =>
  level === 'error' ? { color: 'var(--tdt-danger)', fontWeight: 600 }
    : level === 'warn' ? { color: 'var(--tdt-warning)', fontWeight: 600 }
      : undefined

const tableStyle: CSSProperties = {
  width: '100%', tableLayout: 'fixed', borderCollapse: 'collapse', fontSize: 'var(--tdt-font-sm)',
}
const thStyle: CSSProperties = {
  padding: '11px 10px', textAlign: 'left', fontWeight: 600, color: 'var(--tdt-fg-2)',
  background: 'var(--tdt-head-bg)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
}
/** 数据格：与执行记录 `miniCellStyle` 同度量；**不用实线分隔**，行与行靠斑马纹区分。 */
const tdStyle: CSSProperties = {
  padding: '9px 10px', textAlign: 'left', color: 'var(--tdt-fg)', fontSize: 'var(--tdt-font-sm)',
  wordBreak: 'break-word', verticalAlign: 'top', overflow: 'hidden',
}

export function DbTable({ table, t, emptyText }: { table: SettingsTableQueryResult | null; t: Translate; emptyText: string }): ReturnType<typeof h> {
  ensureTaskListStyle()
  const rows = table?.rows ?? []
  const columns = table?.columns ?? []
  if (rows.length === 0) {
    return h('p', { style: { color: 'var(--tdt-fg-3)', fontSize: 'var(--tdt-font-sm)', margin: 0 } }, emptyText)
  }
  const widthOf = (col: string): CSSProperties => (COL_WIDTH[col] === undefined ? {} : { width: COL_WIDTH[col] })
  return h('table', { style: tableStyle },
    h('thead', null, h('tr', null,
      columns.map(col => h('th', { key: col, style: { ...thStyle, ...widthOf(col) } }, col)))),
    h('tbody', null,
      rows.map((row, i) => h('tr', {
        key: i,
        // 斑马纹与执行记录同款：`.dsh-tdt-rec-alt` 给奇数行浅底，`.dsh-tdt-rec-row` 管 hover。
        className: i % 2 === 1 ? 'dsh-tdt-rec-row dsh-tdt-rec-alt' : 'dsh-tdt-rec-row',
      },
        columns.map(col => {
          const value = row[col]
          const raw = value === null || value === undefined ? '—' : String(value)
          // 时间列显示缩短值（悬停仍给完整 ISO）；其余定长列超长截断；message 不截断、整段换行。
          const text = col === 'ts' ? shortTs(raw) : (col === 'message' ? raw : (raw.length > 160 ? `${raw.slice(0, 160)}…` : raw))
          return h('td', {
            key: col,
            style: { ...tdStyle, ...widthOf(col), ...(col === 'level' ? levelStyleOf(raw) : {}) },
            title: raw,
          }, text)
        }),
      ))),
  )
}
