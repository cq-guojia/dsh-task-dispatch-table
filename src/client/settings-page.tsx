/**
 * 设置页顶层（替代旧「调试」页）：纵向组合三大块。
 * - Block 1 配置（`SettingsConfigBlock`）
 * - Block 2 整体日志（`SettingsLogBlock`）
 * - Block 3 数据库表查询（`SettingsTableBlock`）
 * 每块用卡片区隔，整体居中限宽，与插件其余页面（任务配置 / 执行记录 / 任务日程）视觉一致。
 */
import { createElement as h, type CSSProperties } from 'react'
import { SettingsConfigBlock } from './settings-config-block'
import { SettingsLogBlock } from './settings-log-block'
import { SettingsTableBlock } from './settings-table-block'
import type { Translate } from './locales'

const cardStyle: CSSProperties = {
  background: 'var(--tdt-surface-1)',
  borderRadius: 'var(--tdt-radius-lg)',
  padding: '20px 24px',
  marginBottom: '20px',
  border: '0.5px solid var(--tdt-border-light)',
}

export function SettingsPage({ t }: { t: Translate }): ReturnType<typeof h> {
  return h('div', { style: { maxWidth: '920px', margin: '0 auto', padding: '8px 0' } },
    h('div', { style: cardStyle }, h(SettingsConfigBlock, { t })),
    h('div', { style: cardStyle }, h(SettingsLogBlock, { t })),
    h('div', { style: cardStyle }, h(SettingsTableBlock, { t })),
  )
}
