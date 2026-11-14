/**
 * 样式注入器（薄壳）：实现全部交给 `dsh-plugin-core` 的 style kit。
 *
 * 保留本文件只为两件事：
 *  ① 固定本插件的 `<style>` id（多插件同页互不覆盖）；
 *  ② 给历史调用点（`ensureXxxStyle()` / `applyStyle`）一个过渡入口。
 * 注入机制、域排序、token 表都不再在本仓实现 —— 真源是
 * `dsh-plugin-core/design`（`createStyleKit` + `tokens.css`）。
 *
 * 规矩：全站仍然只有**一处**注入器（kit 的标签），业务文件不许自己
 * `document.createElement('style')`，也不许再定义 `--dshpc-*`。
 */

import { createStyleKit, type StyleKit } from 'dsh-plugin-core/design'
import { getStyleKit, setStyleKit } from 'dsh-plugin-core/ui/styles'

/** 本插件的样式标签 id（改名 = 大范围回归，不要动）。 */
export const UI_STYLE_ID = 'dsh-task-dispatch-table-ui'

/** token 域固定名（kit 内 `tokens` 恒排最前）。 */
export const TOKENS_DOMAIN = 'tokens'

const kit: StyleKit = createStyleKit({ id: UI_STYLE_ID })

// 控件首次渲染时自取这套 kit（核心 `setStyleKit` 契约）。
setStyleKit(kit)

// 读回当前生效的 kit：既保证 `setStyleKit` 不被当成死代码摇掉，
// 也让之后渲染的核心控件与本插件共用同一个 `<style>` 标签。
const active: StyleKit = getStyleKit()

/** 登记一个域的样式（同名重复登记 = 覆盖）。 */
export function registerStyle(domain: string, css: string): void {
  active.registerStyle(domain, css)
}

/** 确保标签已挂载且内容最新（幂等）。 */
export function ensureUiStyles(): void {
  active.ensureStyles()
}

/** 登记 + 立刻确保挂载。 */
export function applyStyle(domain: string, css: string): void {
  active.applyStyle(domain, css)
}

/** 登记核心 token 层并确保样式已注入（幂等）。 */
export function ensureUiBase(): void {
  registerStyle(TOKENS_DOMAIN, active.tokensCss)
  ensureUiStyles()
}
