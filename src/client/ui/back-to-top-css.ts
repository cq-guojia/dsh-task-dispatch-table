/**
 * 「回到顶部」悬浮按钮皮肤（UI 基础层）。
 *
 * 覆盖范围：统一回顶部按钮 `<BackToTop />`。
 * 行为约定：fixed 定位在主内容列**右缘外侧**、页面靠下；滚动超过阈值才显形（`.is-visible`）。
 *
 * 消费 token：`--dshpc-*`（颜色 / 尺寸 / 圆角 / 字号 / 层级 / 动效全部来自核心 token 层 `dsh-plugin-core/design`）。
 */
import { applyStyle } from './style'

/** back-to-top 样式域（由 `<BackToTop />` 渲染时登记）。 */
export const BACK_TO_TOP_DOMAIN = 'back-to-top'

/** back-to-top 全部 CSS。 */
export const BACK_TO_TOP_CSS = `
/* 回到顶部悬浮钮：圆钮、实面、投影；默认隐身，滚过阈值加 .is-visible 才显形。
   横向 left 由组件按主内容列右缘实时算出（贴在其右侧外侧），不写死。 */
.dsh-tdt-backtotop{
  position:fixed;
  bottom:var(--dshpc-space-4);
  z-index:var(--dshpc-z-dock);
  width:44px;height:44px;
  display:inline-flex;align-items:center;justify-content:center;
  padding:0;margin:0;
  box-sizing:border-box;
  border:1px solid var(--dshpc-border);
  border-radius:50%;
  background:var(--dshpc-solid);
  color:var(--dshpc-on-solid);
  box-shadow:var(--dshpc-shadow-2);
  cursor:pointer;
  opacity:0;
  transform:translateY(8px) scale(.92);
  transition:opacity var(--dshpc-dur) var(--dshpc-ease),
             transform var(--dshpc-dur) var(--dshpc-ease),
             background-color var(--dshpc-dur-fast) var(--dshpc-ease);
  pointer-events:none;
}
.dsh-tdt-backtotop.is-visible{opacity:1;transform:translateY(0) scale(1);pointer-events:auto;}
.dsh-tdt-backtotop:hover{background:var(--dshpc-hover);}
.dsh-tdt-backtotop:active{background:var(--dshpc-active);}
.dsh-tdt-backtotop:focus-visible{outline:2px solid var(--dshpc-focus);outline-offset:2px;}
@media (prefers-reduced-motion: reduce){
  .dsh-tdt-backtotop{transition:opacity var(--dshpc-dur-fast) linear;transform:none;}
}
`

/**
 * 确保 back-to-top 样式已登记并注入（幂等；组件渲染时调用一次即可）。
 */
export function ensureBackToTopStyle(): void {
  applyStyle(BACK_TO_TOP_DOMAIN, BACK_TO_TOP_CSS)
}
