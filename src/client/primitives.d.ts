// 官方 UI primitives 的本地最小类型声明（本仓库 client 惯例：官方包不在我们的依赖里，
// 不做跨版本引类型，只复述我们要用的消费面）。
//
// 事实来源：@deepseek-ai/dsh-client-ui-primitives@0.1.7-rc.2 的 lib/types/*.d.ts。
// 该包是 dsh 浏览器内核的**平台模块**（见 tsdown.client.config.ts 的 PLATFORM_MODULES），
// 运行时由内核模块表 require() 解析，故**无需**写进 dsh.client.inject（兄弟插件同样只 import）。
declare module '@deepseek-ai/dsh-client-ui-primitives' {
  import type { ComponentType, ReactNode } from 'react'

  /** markdown 代码块控件的本地化文案。 */
  export interface MarkdownCodeLabels {
    copyLabel: string
    copiedLabel: string
  }
  /** markdown 文档的本地化外壳文案。 */
  export interface MarkdownLabels {
    code: MarkdownCodeLabels
    footnotes: string
  }

  /** 官方 markdown 渲染器（mdast 管线 + KaTeX；labels 需引用稳定）。 */
  export const MarkdownText: ComponentType<{
    text: string
    labels: MarkdownLabels
    streaming?: boolean
    variant?: 'body' | 'compact'
  }>

  /** 官方紧凑折叠行（图标 + 标题 + 箭头，箭头与展开行为自带）。 */
  export const DisclosureRow: ComponentType<{
    icon: ReactNode
    title: string
    open: boolean
    expandable: boolean
    onToggle: () => void
    running?: boolean
    expandOnRowClick?: boolean
    previewChevron?: boolean
    keepContentWhenOpen?: boolean
    collapsedContent?: ReactNode
    children?: ReactNode
    className?: string
    rowClassName?: string
    leadingClassName?: string
    chevronClassName?: string
    titleClassName?: string
  }>

  /** 官方按钮（variant 各由 --dsw-alias-button-* token 族驱动，明暗主题自适应）。 */
  export const Button: import('react').ForwardRefExoticComponent<{
    variant?: 'primary' | 'ghost' | 'outline' | 'toolbar'
    size?: 'md' | 'sm'
    icon?: ReactNode
    className?: string
    children?: ReactNode
  } & import('react').ButtonHTMLAttributes<HTMLButtonElement> & import('react').RefAttributes<HTMLButtonElement>>

  /** 官方居中模态弹窗（body portal + mask/blur + 标准头部/正文/footer；Escape 与遮罩点击触发 onClose）。 */
  export function Modal(props: {
    open: boolean
    onClose: () => void
    title: string
    description?: string
    children?: ReactNode
    footer?: ReactNode
    className?: string
    contentClassName?: string
    shortcutModal?: string
    onKeyDownCapture?: import('react').KeyboardEventHandler<HTMLDivElement>
    backdropBlur?: boolean
  } & (
    | { headless: true; closeLabel?: never }
    | { headless?: false; closeLabel: string }
  )): import('react').ReactPortal | null

  /** 官方图标（1px 线宽）。 */
  export const IconCodeOutlineRegular: ComponentType<{ size?: number; className?: string }>
  export const IconChevronRightOutlineRegular: ComponentType<{ size?: number; className?: string }>
  export const IconChevronDownOutlineRegular: ComponentType<{ size?: number; className?: string }>
  export const IconCopyOutlineRegular: ComponentType<{ size?: number; className?: string }>
  export const IconCheckOutlineRegular: ComponentType<{ size?: number; className?: string }>
  export const IconCloseOutlineRegular: ComponentType<{ size?: number; className?: string }>
  export const IconBranchOutlineRegular: ComponentType<{ size?: number; className?: string }>
  export const IconDatabaseOutlineRegular: ComponentType<{ size?: number; className?: string }>
  export const IconContextInjectionOutlineRegular: ComponentType<{ size?: number; className?: string }>
  export const IconGoalOutlineRegular: ComponentType<{ size?: number; className?: string }>
  export const IconPaperPlaneOutlineRegular: ComponentType<{ size?: number; className?: string }>
  export const IconAgentPresetOutlineRegular: ComponentType<{ size?: number; className?: string }>
  export const IconGlobeOutlineRegular: ComponentType<{ size?: number; className?: string }>
  export const IconAlarmClockOutlineRegular: ComponentType<{ size?: number; className?: string }>
  export const IconQueueOutlineRegular: ComponentType<{ size?: number; className?: string }>
  export const IconCordisPluginOutlineRegular: ComponentType<{ size?: number; className?: string }>
  export const IconThinkOutlineRegular: ComponentType<{ size?: number; className?: string }>
  export const IconBrowseOutlineRegular: ComponentType<{ size?: number; className?: string }>
  export const IconSearchOutlineRegular: ComponentType<{ size?: number; className?: string }>
  export const IconEditOutlineRegular: ComponentType<{ size?: number; className?: string }>
  export const IconApiOutlineRegular: ComponentType<{ size?: number; className?: string }>
  export const IconPlanOutlineRegular: ComponentType<{ size?: number; className?: string }>
  export const IconQuestionOutlineRegular: ComponentType<{ size?: number; className?: string }>
  export const IconSparkleRegular: ComponentType<{ size?: number; className?: string }>
  export const IconChevronUpOutlineRegular: ComponentType<{ size?: number; className?: string }>

  /** 官方气泡提示：label + side；children 为唯一锚点元素，ref/事件会被接管。 */
  export const Tooltip: ComponentType<{
    label: string
    side?: 'right' | 'bottom' | 'top'
    align?: 'start' | 'end' | 'center'
    gap?: number
    maxWidth?: number
    disabled?: boolean
    children?: ReactNode
  }>

  /** 官方剪贴板写入：返回是否成功。 */
  export function writeClipboard(text: string): Promise<boolean>

  /** 官方「固定定位浮层贴住锚点」：滚动 / 尺寸变化时自动重算并夹在视口内。 */
  export function useAnchoredPosition(options: {
    open: boolean
    anchorRef: { current: HTMLElement | null }
    panelRef: { current: HTMLElement | null }
    side?: 'top' | 'bottom'
    align?: 'start' | 'end'
    gap: number
    margin: number
  }): import('react').CSSProperties | undefined

  /** 官方「点外关闭」：锚点与面板之外按下指针时关闭。 */
  export function useDismissOnOutsidePointer(
    rootRef: { current: HTMLElement | null },
    open: boolean,
    setOpen: (open: boolean) => void,
    panelRef?: { current: HTMLElement | null },
  ): void

  /** 官方文件变更内联 diff 面（编辑/写入工具卡展开体）。 */
  export function DiffBlock(props: {
    diffs: ReadonlyArray<{ path: string; oldText: string | null; newText: string }>
    labels: {
      codeLabel: string
      wrapLabel: string
      unwrapLabel: string
      copy: string
      copied: string
      collapseAria: string
      expandAria: (hidden: number) => string
      collapse: string
      expand: (hidden: number) => string
    }
    maxLines?: number
    className?: string
  }): ReactNode | null

  /** 官方 diff 统计（+新增 / -删除）。 */
  export function diffTotals(diffs: ReadonlyArray<{ oldText: string | null; newText: string }>): { added: number; removed: number }
}
