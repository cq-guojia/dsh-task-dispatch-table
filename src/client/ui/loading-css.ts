/**
 * Loading 指示器皮肤（UI 基础层 · P1）。
 *
 * 覆盖范围：
 * - 浮动 Loading pill（`<Loading />`）
 * - 运行中 / loading 三个脉动小方块（`.dsh-tdt-run-blocks`）
 *
 * 消费 token：`--tdt-*`（颜色 / 尺寸 / 层级全部来自 tokens.ts）。
 */
import { applyStyle } from './style'

/** loading 样式域（由 `<Loading />` 渲染时登记）。 */
export const LOADING_DOMAIN = 'loading'

/** loading 相关全部 CSS。 */
export const LOADING_CSS = `
/* 运行中 / loading 的活动指示：三个小方块依次脉动。 */
@keyframes dsh-tdt-run-block { 0%, 80%, 100% { opacity: 0.25; transform: scale(0.8) } 40% { opacity: 1; transform: scale(1) } }
.dsh-tdt-run-blocks { display: inline-flex; align-items: center; gap: 3px; }
.dsh-tdt-run-blocks > i { width: 5px; height: 5px; border-radius: 1px; background: currentColor; animation: dsh-tdt-run-block 1.2s ease-in-out infinite; }
.dsh-tdt-run-blocks > i:nth-child(2) { animation-delay: 0.15s; }
.dsh-tdt-run-blocks > i:nth-child(3) { animation-delay: 0.3s; }
@media (prefers-reduced-motion: reduce) { .dsh-tdt-run-blocks > i { animation: none; opacity: 1; } }
`

/**
 * 确保 loading 样式已登记并注入（幂等；组件渲染时调用一次即可）。
 */
export function ensureLoadingStyle(): void {
  applyStyle(LOADING_DOMAIN, LOADING_CSS)
}
