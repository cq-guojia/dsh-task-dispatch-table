/**
 * UI 基础层对外的**唯一出口**（L2/L1 → L3）。
 *
 * 规矩（docs/design/ui-style-guide.md）：业务文件（task-list / task-editor / index / config-panel / file-* …）
 * **只许 import 本文件导出的东西**，不许绕过它直接摸 `ui/` 里的具体文件 —— 否则「一类控件唯一实现」
 * 这条就守不住了。
 *
 * 分期进度：P0 = token 层 + 注入器 ✅；P1 = 分段控件（滑动块）✅；
 * P2 按钮/图标钮、P3 输入/下拉、P4 开关/日期时间/浮层 每搬一个就在本文件加一行导出，
 * 并在手册 §二「唯一实现表」里登记。
 */
export { UI_TOKENS_CSS } from './tokens'
export { UI_STYLE_ID, TOKENS_DOMAIN, registerStyle, applyStyle, ensureUiStyles, ensureUiBase } from './style'
export { CONTROLS_DOMAIN, SEGMENTED_CSS, ensureControlsStyle } from './controls-css'
export { Segmented, type SegmentedItem, type SegmentedProps } from './Segmented'
