/**
 * UI 基础层对外的**唯一出口**（L2/L1 → L3）。
 *
 * 规矩（docs/design/ui-style-guide.md）：业务文件（task-list / task-editor / index / config-panel / file-* …）
 * **只许 import 本文件导出的东西**，不许绕过它直接摸 `ui/` 里的具体文件 —— 否则「一类控件唯一实现」
 * 这条就守不住了。
 *
 * 当前导出（2026-10-05）：token 表 + 注入器 + 分段控件 + 按钮/图标钮 + 输入类（Input / 前缀框 / 数字框
 * / 多行文本 Textarea / 勾选框 Checkbox）+ 下拉（SelectField）+ 任务选择器（TaskPicker）+ 开关皮肤 + 日期/时间 + 时间范围 + 跑马灯 + Loading。
 * 每加一个控件就在这里加一行导出，并在手册 §二「唯一实现表」里登记。
 */
import type { CSSProperties } from 'react'

/**
 * 主面板**内容列**的统一宽度锚点（任务配置 / 执行记录 两个 tab 必须一模一样，切换时不横向跳动）。
 * 同时它是基础层 `Loading` 的锚点契约（`Loading` 默认 `anchorId = PANEL_CONTENT_ID`）——
 * 所以**新页面也必须用同一个 id**，否则浮动 loading 找不到锚点、贴不到内容右缘。
 */
export const PANEL_CONTENT_ID = 'dsh-tdt-main'
/** 内容列几何（居中限宽 760 / 1120）。 */
export const PANEL_CONTENT_STYLE: CSSProperties = {
  width: '100%', maxWidth: '1120px', minWidth: '760px', boxSizing: 'border-box',
}

export { UI_STYLE_ID, TOKENS_DOMAIN, registerStyle, applyStyle, ensureUiStyles, ensureUiBase } from './style'
export { CONTROLS_DOMAIN, BUTTON_CSS, FIELD_CSS, DATETIME_CSS, SELECT_CSS, PROCESS_FILES_CSS, ensureControlsStyle } from './controls-css'
export {
  Segmented,
  Button,
  IconButton,
  Input,
  PrefixedInput,
  NumberInput,
  MarqueeText,
  SectionHead,
  LiveText,
  Textarea,
  Checkbox,
  Loading,
  RunningBlocks,
  FIELD_ANCHOR_STYLE,
  FIELD_LABEL_STYLE,
  fieldMetricsOf,
  buildMonthCells,
  type SegmentedProps,
  type SegmentedTone,
  type ButtonProps,
  type ButtonVariant,
  type ButtonSize,
  type IconButtonProps,
  type InputProps,
  type PrefixedInputProps,
  type NumberInputProps,
  type EditorOption,
  type FieldSize,
  type LoadingProps,
  type TextareaProps,
  type CheckboxProps,
  type SectionHeadProps,
  type DayCell,
} from 'dsh-plugin-core/ui'
export type { DayCell as CalendarCell } from 'dsh-plugin-core/ui'
export { CodeViewer } from 'dsh-plugin-core/ui/code-viewer'
import type { SegmentedProps } from 'dsh-plugin-core/ui'
/** 段定义单项（核心 `Segmented` 的 items 元素；核心未单独导出该类型）。 */
export type SegmentedItem<T extends string = string> = SegmentedProps<T>['items'][number]
export { SelectField, type SelectFieldProps } from './Field'
export { TaskPicker, type TaskOption, type TaskPickerProps } from './TaskPicker'
export {
  DateField,
  TimeField,
  type CalendarLabels,
  type TimeLabels,
} from './DateTime'
export { TimeRange, type TimeRangeProps, type TimeRangeLabels, type TimePresetLabels } from './TimeRange'
export {
  rangeToQuery,
  ALL_TIME_PRESETS,
  type TimePrecision,
  type TimePresetId,
  type TimeRangeValue,
  type TimeQuery,
} from './time-range'
export { QuickToolbar } from 'dsh-plugin-core/ui'
export { startResizeLayoutWidth, type ResizeOptions } from 'dsh-plugin-core/ui'
// 全局秒级心跳 + 每秒自刷新文本（2026-10-06 从 task-info.tsx 归位；见 design/client-refresh-disposition.md §三 A1/A2）。
export { subscribeTicker, useNowMs } from './ticker'
// 运行态视觉（色/类名/注入器）。
export { RUNNING_TONE, RUN_PULSE_CLASS, ensureRunningStyle } from './running'
