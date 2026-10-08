/**
 * 设置页顶层：纵向三个模块（插件设置 / 整体日志 / 数据库表查询）。
 *
 * - **宽度与其它 tab 一致**：`PANEL_CONTENT_ID` + `PANEL_CONTENT_STYLE` 是主内容列的唯一真源
 *   （任务配置 / 执行记录 / 任务日程都用它）⇒ 设置页也必须用同一个 id 与同一套几何，
 *   否则切换 tab 时横向跳动，且基础层的 `Loading` / `BackToTop` 找不到锚点（2026-10-08 用户指正：
 *   「你这边的宽度要跟着我前面任务配置执行记录这段的宽度」）。
 * - **每块套一个浅灰「框」**（用户 2026-10-08）：参考「执行记录」的「前面粗一点色块 + 后面浅一点色块」
 *   两色手法，但只用一种极浅中性灰（左缘 4px 略深、框内 3% 前景色极淡），避开红黄绿蓝，主要作用是
 *   把三块清晰隔开。三块共用同一份框样式。
 */
import { createElement as h, type CSSProperties } from 'react'
import { PANEL_CONTENT_ID, PANEL_CONTENT_STYLE, applyStyle } from './ui'
import { SettingsConfigBlock } from './settings-config-block'
import { SettingsLogBlock } from './settings-log-block'
import { SettingsTableBlock } from './settings-table-block'
import type { Translate } from './locales'

/** 模块之间的纵向间距（唯一一份，三块共用）。 */
export const SECTION_GAP: CSSProperties = { marginTop: 'var(--tdt-space-4)' }

/**
 * 浅灰两色框（参考「执行记录」双色手法，仅用中性灰）。
 *
 * ⚠️ **不要圆角、不要描边**（用户 2026-10-08）——与执行记录条目块同形态：整块就是一个直角色块，
 * 视觉分隔靠「左缘 4px 略深色块 + 框内极淡底色」两拍，不加边框线。
 */
const SETTINGS_DOMAIN = 'domain:settings'
const SETTINGS_CSS = `
.dsh-tdt-settings-card{
  box-sizing:border-box;
  border:none;
  border-radius:0;
  border-left:4px solid color-mix(in srgb,var(--tdt-fg) 14%,transparent);
  background:color-mix(in srgb,var(--tdt-fg) 3%,transparent);
  padding:var(--tdt-space-4);
}
`
applyStyle(SETTINGS_DOMAIN, SETTINGS_CSS)

export function SettingsPage({ t }: { t: Translate }): ReturnType<typeof h> {
  return h('div', { style: { width: '100%', display: 'flex', justifyContent: 'center' } },
    h('div', { id: PANEL_CONTENT_ID, style: PANEL_CONTENT_STYLE },
      h('div', { className: 'dsh-tdt-settings-card' }, h(SettingsConfigBlock, { t })),
      h('div', { className: 'dsh-tdt-settings-card', style: SECTION_GAP }, h(SettingsLogBlock, { t })),
      h('div', { className: 'dsh-tdt-settings-card', style: SECTION_GAP }, h(SettingsTableBlock, { t })),
    ))
}
