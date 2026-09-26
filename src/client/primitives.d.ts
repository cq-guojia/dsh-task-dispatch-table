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

  /** 官方图标（1px 线宽）。 */
  export const IconCodeOutlineRegular: ComponentType<{ size?: number; className?: string }>
  export const IconChevronRightOutlineRegular: ComponentType<{ size?: number; className?: string }>
}
