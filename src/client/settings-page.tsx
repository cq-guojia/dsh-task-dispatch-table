/**
 * 设置页顶层：纵向三个模块（插件设置 / 整体日志 / 数据库表查询）。
 *
 * - **宽度与其它 tab 一致**：`PANEL_CONTENT_ID` + `PANEL_CONTENT_STYLE` 是主内容列的唯一真源
 *   （任务配置 / 执行记录 / 任务日程都用它）⇒ 设置页也必须用同一个 id 与同一套几何，
 *   否则切换 tab 时横向跳动，且基础层的 `Loading` / `BackToTop` 找不到锚点（2026-10-08 用户指正：
 *   「你这边的宽度要跟着我前面任务配置执行记录这段的宽度」）。
 * - **不套卡片外壳**：每块 = 「icon + 标题（右侧可放控件）」+ 一块内容（用户 2026-10-08：
 *   三个大黑框跟本插件其它页面不匹配）。标题行用基础层 `SectionHead`，三块共用一份。
 */
import { createElement as h, type CSSProperties } from 'react'
import { PANEL_CONTENT_ID, PANEL_CONTENT_STYLE } from './ui'
import { SettingsConfigBlock } from './settings-config-block'
import { SettingsLogBlock } from './settings-log-block'
import { SettingsTableBlock } from './settings-table-block'
import type { Translate } from './locales'

/** 模块之间的纵向间距（唯一一份，三块共用）。 */
export const SECTION_GAP: CSSProperties = { marginTop: 'var(--tdt-space-4)' }

export function SettingsPage({ t }: { t: Translate }): ReturnType<typeof h> {
  return h('div', { style: { width: '100%', display: 'flex', justifyContent: 'center' } },
    h('div', { id: PANEL_CONTENT_ID, style: PANEL_CONTENT_STYLE },
      h(SettingsConfigBlock, { t }),
      h(SettingsLogBlock, { t, style: SECTION_GAP }),
      h(SettingsTableBlock, { t, style: SECTION_GAP }),
    ))
}
