/**
 * 通用筛选行（设置页 Block 3）：列名下拉 + 运算符下拉 + 值输入 + 移除按钮。
 * 列集合随所选表动态变化（由调用方传入）。
 */
import { createElement as h } from 'react'
import { SelectField, Input, IconButton } from './ui'
import type { SettingsTableFilter, TableFilterOp } from './settings-data'
import type { Translate } from './locales'

const OPS: readonly TableFilterOp[] = ['=', '!=', '<', '>', '<=', '>=', 'LIKE']

export function TableFilterRow(props: {
  filter: SettingsTableFilter
  columns: readonly string[]
  t: Translate
  onChange: (next: SettingsTableFilter) => void
  onRemove: () => void
}): ReturnType<typeof h> {
  const { filter, columns, t, onChange, onRemove } = props
  return h('div', { style: { display: 'flex', gap: '8px', alignItems: 'center', marginBottom: '6px', flexWrap: 'wrap' } },
    h(SelectField, {
      value: filter.column, placeholder: t('settingsFilterColumn'), emptyLabel: t('settingsFilterColumn'),
      ariaLabel: t('settingsFilterColumn'), size: 'sm',
      options: columns.map(c => ({ value: c, label: c })),
      onChange: (column) => onChange({ ...filter, column }),
    }),
    h(SelectField, {
      value: filter.op, placeholder: t('settingsFilterOp'), emptyLabel: t('settingsFilterOp'),
      ariaLabel: t('settingsFilterOp'), size: 'sm', width: 96,
      options: OPS.map(o => ({ value: o, label: o })),
      onChange: (op) => onChange({ ...filter, op: op as TableFilterOp }),
    }),
    h(Input, {
      value: filter.value, placeholder: t('settingsFilterValue'), size: 'sm',
      onChange: (value) => onChange({ ...filter, value }),
      style: { flex: '1 1 auto', maxWidth: '260px' },
    }),
    h(IconButton, { variant: 'plain', size: 'sm', icon: '✕', label: t('settingsFilterRemove'), onClick: onRemove }),
  )
}
