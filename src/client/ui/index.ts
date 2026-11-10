/**
 * UI 基础层对外的**唯一出口**（L2/L1 → L3）。
 *
 * 规矩（docs/development/ui-style-guide.md）：业务文件（task-list / task-editor / index / config-panel / file-* …）
 * **只许 import 本文件导出的东西**，不许绕过它直接摸 `ui/` 里的具体文件 —— 否则「一类控件唯一实现」
 * 这条就守不住了。
 *
 * 当前导出（2026-11-06）：token 表 + 注入器 + 分段控件 + 按钮/图标钮 + 输入类（Input / 前缀框 / 数字框
 * / 多行文本 Textarea / 勾选框 Checkbox）+ 下拉（SelectField）+ 任务选择器（TaskPicker）+ 开关皮肤
 * + 日期时间 / 时间范围（核心 DateTimePicker）+ 小问号提示（核心 FieldHint）+ 跑马灯 + Loading。
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
export { CONTROLS_DOMAIN, BUTTON_CSS, FIELD_CSS, SELECT_CSS, PROCESS_FILES_CSS, ensureControlsStyle } from './controls-css'
export {
  Segmented,
  Button,
  IconButton,
  Chip,
  Surface,
  surfaceClass,
  Input,
  PrefixedInput,
  NumberInput,
  MarqueeText,
  SectionHead,
  LiveText,
  Textarea,
  Loading,
  Loader,
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
  type FieldSize,
  type LoadingProps,
  type TextareaProps,
  type SectionHeadProps,
  type ChipProps,
  type SurfaceProps,
  type DayCell,
} from 'dsh-plugin-core/ui'
/** 本仓扩展：核心 EditorOption 只有 value/label；工作区另需历史别名席位（见 workspace-options.ts）。 */
export type { EditorOption } from './Field'
export type { DayCell as CalendarCell } from 'dsh-plugin-core/ui'
export { CodeViewer } from 'dsh-plugin-core/ui/code-viewer'
import type { SegmentedProps } from 'dsh-plugin-core/ui'
/** 段定义单项（核心 `Segmented` 的 items 元素；核心未单独导出该类型）。 */
export type SegmentedItem<T extends string = string> = SegmentedProps<T>['items'][number]
export { FieldHint, type FieldHintProps } from 'dsh-plugin-core/ui'
// 核心提示气泡的注入位：插件启动时把官方 `Tooltip` 交给 core（不注入 ⇒ 问号只有图标、悬停无气泡）。
export { setTooltipRenderer, type TooltipRenderProps } from 'dsh-plugin-core/ui'
// 弹窗 / 确认框：**全站唯一实现**（核心命令式 `confirmModal` / `alertModal`，自带惰性 mount）。
export {
  confirmModal, alertModal, Modal, Checkbox,
  type ConfirmOptions, type AlertOptions, type ModalProps, type ConfirmTone, type CheckboxProps,
} from 'dsh-plugin-core/ui'
// 表格：核心 `Table`（Plain 档：无横线、竖浅分隔线、行悬浮淡蓝）。
export {
  Table,
  type TableProps, type TableColumn, type TableRow, type TableCell, type TableCellSpec,
  type TableAlign, type TableDensity, type TableBorders,
} from 'dsh-plugin-core/ui'
export { DateTimePicker, type DateTimeOutput } from 'dsh-plugin-core/ui'
// 「名字 + 输入框」同格组合：核心 InputGroup（label 与输入框同格灰底）。
export { InputGroup, type InputGroupProps, type InputGroupAction } from 'dsh-plugin-core/ui'
export { notify } from 'dsh-plugin-core/ui'
// 选模型（分组 / 联动 / 平铺三态）与卡片框（框式 / 条带式）：核心唯一的模型选择与卡片外观实现。
export {
  ModelPicker, Card, StripCard, ListRow,
  type ModelPickerProps, type ModelPickerVariant,
  type CardAccent, type CardBarOptions, type CardSharedProps,
  type ListRowProps,
  type PickerGroup, type PickerOption,
} from 'dsh-plugin-core/ui'
export { SelectField, type SelectFieldProps } from './Field'
export { TaskPicker, type TaskOption, type TaskPickerProps } from './TaskPicker'
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
// 分栏控件（2026-11-06：编辑分栏与预览 dock 都用核心 PanelDock，同页可开双分栏）。
export {
  createPanelDock, DockPanel, PanelDock,
  type DockCloseReason, type DockPanelProps, type PanelDockController, type PanelDockOptions,
} from 'dsh-plugin-core/ui'
// 全局秒级心跳 + 每秒自刷新文本（2026-10-06 从 task-info.tsx 归位；见 design/client-refresh-disposition.md §三 A1/A2）。
export { subscribeTicker, useNowMs } from './ticker'
// 运行态视觉（色/类名/注入器）。
export { RUNNING_TONE, RUN_PULSE_CLASS, ensureRunningStyle } from './running'
