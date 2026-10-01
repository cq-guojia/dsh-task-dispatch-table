/**
 * L2 组件皮肤：公用控件规则（一类控件**唯一实现**）
 *
 * 规矩（docs/design/ui-style-guide.md §三）：
 *  - **只消费 `var(--tdt-*)`**，一个颜色 / 尺寸 / 圆角 / 字号字面量都不许出现；
 *  - 结构、尺寸、交互规则只此一份；「外观差异」只允许靠**覆盖一两个变量**表达（本文件的 `--seg-*`）；
 *  - 高度只取 `--tdt-control-h-sm` / `-md` / `-lg` 三档（段高 = 控件总高 − 6px：上下 padding 2px×2 + 描边 1px×2；真不够用才在调用点本地覆盖 `--tdt-control-h-*`，属例外）。
 *
 * 分期：P1 只有分段控件（滑动块）；P2 按钮 / P3 输入下拉 / P4 开关日期时间会往本文件追加，
 * 追加时保持「一段一控件、段头写清哪一期」的写法。
 */
import { applyStyle } from './style'

/** 分段控件的皮肤规则（P1）。 */
export const SEGMENTED_CSS = `
/* ── 分段控件（滑动块）P1 ────────────────────────────────────────────────
   结构一套 + 两个受控轴：size(sm|md|lg) × variant(default|inset)。
   变体**只覆盖两个颜色变量**（--seg-track 轨道底 / --seg-thumb 选中块），
   这正是「同一份样式、只重载颜色」的落地形态。 */
.dsh-tdt-seg{display:inline-flex;align-items:center;gap:2px;padding:2px;border-radius:var(--tdt-radius-sm);border:1px solid var(--tdt-border);background:var(--seg-track);}

/* default：轨道=第二层面（官方分段控件轨道用的就是 interactive-bg-hover 那类下沉底），选中块=亮片底 */
.dsh-tdt-seg--default{--seg-track:var(--tdt-surface-2);--seg-thumb:var(--tdt-surface-raised);}
/* inset：用在「已经有一层底」的容器里（卡片展开区）⇒ 轨道下沉到第一层面、选中块抬到第三层面 */
.dsh-tdt-seg--inset{--seg-track:var(--tdt-surface-1);--seg-thumb:var(--tdt-surface-3);}

.dsh-tdt-seg__item{appearance:none;display:inline-flex;align-items:center;gap:4px;box-sizing:border-box;
  height:calc(var(--tdt-control-h-sm) - 6px);padding:0 12px;border:0;border-radius:var(--tdt-radius-sm);
  background:transparent;color:var(--tdt-fg-2);font-family:inherit;font-size:var(--tdt-font-sm);line-height:var(--tdt-line-sm);
  font-weight:400;white-space:nowrap;cursor:pointer;
  transition:color var(--tdt-dur-fast) var(--tdt-ease),background-color var(--tdt-dur-fast) var(--tdt-ease),box-shadow var(--tdt-dur-fast) var(--tdt-ease);}
.dsh-tdt-seg--md .dsh-tdt-seg__item{height:calc(var(--tdt-control-h-md) - 6px);}
.dsh-tdt-seg--lg .dsh-tdt-seg__item{height:calc(var(--tdt-control-h-lg) - 6px);}
.dsh-tdt-seg__item:hover:not([aria-pressed='true']):not(:disabled){color:var(--tdt-fg);}
.dsh-tdt-seg__item[aria-pressed='true']{background:var(--seg-thumb);box-shadow:var(--tdt-shadow-raised);color:var(--tdt-fg);font-weight:600;}
.dsh-tdt-seg__item:focus-visible{outline:2px solid var(--tdt-focus);outline-offset:-2px;}
.dsh-tdt-seg__item:disabled{cursor:default;opacity:.4;}

/* 段内角标（如「异常」的数量）：语义色实面 + 反白字，0 由组件侧不渲染 */
.dsh-tdt-seg__badge{display:inline-flex;align-items:center;justify-content:center;min-width:16px;height:16px;padding:0 4px;
  border-radius:var(--tdt-radius-sm);background:var(--tdt-danger);color:var(--tdt-on-signal);
  font-size:var(--tdt-font-xs);line-height:16px;font-weight:400;}

/* block：撑满父宽（表单行用），各段等分 */
.dsh-tdt-seg--block{display:flex;width:100%;}
.dsh-tdt-seg--block .dsh-tdt-seg__item{flex:1 1 auto;justify-content:center;}

/* weekday：星期多选方块（任务新增 / 编辑页）。基础插件的特殊化定制（用户 2026-10-01 明确要求：
   原 WeekdayPicker 即「蓝底 + 近似方形」，统一到 Segmented 后由这一修饰类补回两处差异）：
   - 每格做成正方形（宽 = 段高）；
   - 选中态用品牌蓝（--tdt-business）、反白字，轨道用 hover 灰（与原自绘轨道一致）。
   皮肤集中在此、不内联；调用点只挂 .dsh-tdt-seg--weekday 一个修饰类，符合「皮肤只在 controls-css」的规矩。 */
.dsh-tdt-seg--weekday{--seg-track:var(--tdt-hover);}
.dsh-tdt-seg--weekday .dsh-tdt-seg__item{width:calc(var(--tdt-control-h-md) - 6px);padding:0;justify-content:center;}
.dsh-tdt-seg--weekday .dsh-tdt-seg__item[aria-pressed='true']{background:var(--tdt-business);color:var(--tdt-fg-inverse);box-shadow:var(--tdt-shadow-raised);}

@media (prefers-reduced-motion: reduce){.dsh-tdt-seg__item{transition:none;}}
`

/** 控件皮肤域的固定名（注入顺序在 tokens 之后）。 */
export const CONTROLS_DOMAIN = 'controls'

/**
 * 确保控件皮肤已登记并注入（幂等；组件渲染时调用一次即可）。
 */
export function ensureControlsStyle(): void {
  applyStyle(CONTROLS_DOMAIN, SEGMENTED_CSS)
}
