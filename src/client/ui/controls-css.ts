/**
 * L2 组件皮肤：公用控件规则（一类控件**唯一实现**）
 *
 * 规矩（docs/design/ui-style-guide.md §三）：
 *  - **只消费 `var(--dshpc-*)`**，一个颜色 / 尺寸 / 圆角 / 字号字面量都不许出现；
 *  - 结构、尺寸、交互规则只此一份；「外观差异」只允许靠**覆盖一两个变量**表达。
 *
 * 2026-11-06：分段 / 按钮 / 输入 / 数字步进 / 多行文本 / 跑马灯已全部改接核心 `dsh-plugin-core/ui`，
 * 对应本地皮肤（`.dsh-tdt-seg*` / `.dsh-tdt-btn*` / `.dsh-tdt-iconbtn*` / `.dsh-tdt-input*`
 * / `.dsh-tdt-pfx*` / `.dsh-tdt-num*` / `.dsh-tdt-textarea*` / `.dsh-tdt-mq*`）整段删除。
 * 本文件只剩**核心没有**的三类业务件：产出物 chip / 行式文件按钮、时分的弹层与列、下拉锚点与省略号，
 * 外加「过程文件」块。
 */
import { applyStyle } from "./style";

/** 产出物图标 chip / 行式文件按钮的皮肤规则。 */
export const BUTTON_CSS = `
/* ── 产出物「图标 chip」：28×28 方角小底板 + 官方文件类型图标 ──────────────
   用途：产出物列表里**只给图标**的小按钮（卡片「执行记录」面板、执行记录总查询页、展开区都挂它）。
   ⚠️ 底板**必须走 class**——inline background 会盖掉 :hover（用户 2026-10-03 踩过）。
   hover 用「--dshpc-chip-bg-hover」：浅色更深、暗色更亮（两端都是「更明显」）；不许拿
   「--dshpc-plate-hover」顶——暗色下反而更淡，鼠标移上去底板就消失了。 */
.dsh-tdt-chip{appearance:none;-webkit-appearance:none;box-sizing:border-box;display:inline-flex;align-items:center;justify-content:center;
  width:var(--dshpc-control-h-md);height:var(--dshpc-control-h-md);padding:0;border:none;border-radius:var(--dshpc-radius-sm);
  background:transparent;color:var(--dshpc-fg-2);font-family:inherit;line-height:0;cursor:pointer;
  transition:background-color var(--dshpc-dur) var(--dshpc-ease),color var(--dshpc-dur) var(--dshpc-ease);}
.dsh-tdt-chip:hover:not(:disabled){background:var(--dshpc-chip-bg-hover);}
.dsh-tdt-chip:focus-visible{outline:2px solid var(--dshpc-focus);outline-offset:1px;}
.dsh-tdt-chip:disabled{cursor:default;background:transparent;color:var(--dshpc-fg-3);}
.dsh-tdt-chip--label{width:auto;padding:0 6px;font-size:var(--dshpc-font-md);line-height:var(--dshpc-line-md);}

/* ── 行式文件按钮（图标 + 文件名）：**全站唯一实现** ───────────────────────
   用途：「产出物 / 附件」那种**一行一个文件**的清单项（基础信息右栏产出物清单、附件区、
   执行记录页的展开区）。平时透明、**鼠标移上去才出浅底**。
   两个形态修饰类：
     --block   撑满父宽（清单里一项一行）
     --inline  内容宽（跟在文字后头，如附件行） */
.dsh-tdt-filechip{appearance:none;-webkit-appearance:none;border:0;box-sizing:border-box;display:flex;align-items:center;gap:6px;
  min-width:0;padding:2px 0;background:transparent;color:var(--dshpc-fg);font-family:inherit;font-size:var(--dshpc-font-md);
  line-height:var(--dshpc-line-md);text-align:left;cursor:pointer;border-radius:var(--dshpc-radius-sm);
  transition:background-color var(--dshpc-dur) var(--dshpc-ease),color var(--dshpc-dur) var(--dshpc-ease);}
.dsh-tdt-filechip:hover:not(:disabled){background:var(--dshpc-chip-bg);}
.dsh-tdt-filechip:focus-visible{outline:2px solid var(--dshpc-focus);outline-offset:1px;}
.dsh-tdt-filechip:disabled{cursor:default;color:var(--dshpc-fg-3);}
.dsh-tdt-filechip--block{width:100%;}
.dsh-tdt-filechip--inline{display:inline-flex;padding:2px 6px;font-size:var(--dshpc-font-sm);}

@media (prefers-reduced-motion: reduce){.dsh-tdt-chip,.dsh-tdt-filechip{transition:none;}}
`;

/** 开关 / 拖拽分隔条的皮肤规则（核心没有的宿主件）。 */
export const FIELD_CSS = `
/* 官方 Switch 包装统一：选中 = success 绿。 */
.dsh-tdt-switch button[role='switch'][aria-checked='true']{background:var(--dshpc-success);}

/* 拖拽分隔条（本仓编辑分栏用；预览 dock 的拖拽条已归核心 PanelDock）：6px 命中区，col-resize，不画线，hover/按下浮出浅带。
   z-index 由 .dsh-tdt-ed-resizer 补。 */
.dsh-tdt-resizer{position:absolute;top:0;bottom:0;left:0;width:6px;cursor:col-resize;background:0 0;touch-action:none;user-select:none;}
.dsh-tdt-resizer:hover,.dsh-tdt-resizer:active{background:var(--dshpc-hover,rgba(38,49,72,.06));}
`;

/** 时分的弹层与列（本仓唯一实现：核心暂无「纯时分」档）。 */
export const DATETIME_CSS = `
/* ── 纯时分（核心缺口，本仓唯一实现）────────────────────────────────────── */
.dsh-tdt-dtf-wrap{display:inline-flex;position:relative;min-width:0;}
.dsh-tdt-dtf{display:inline-flex;align-items:center;gap:6px;box-sizing:border-box;height:var(--dshpc-control-h-lg);
  min-width:0;max-width:100%;padding:0 8px;border:0.5px solid var(--dshpc-border-heavy);border-radius:var(--dshpc-radius-md);
  background:var(--dshpc-surface-1);color:var(--dshpc-fg);font:inherit;font-size:var(--dshpc-font-md);line-height:var(--dshpc-line-md);
  cursor:pointer;transition:background-color var(--dshpc-dur-fast) var(--dshpc-ease),border-color var(--dshpc-dur-fast) var(--dshpc-ease);}
.dsh-tdt-dtf--sm{height:var(--dshpc-control-h-sm);padding:0 6px;font-size:var(--dshpc-font-sm);line-height:var(--dshpc-line-sm);}
.dsh-tdt-dtf--md{height:var(--dshpc-control-h-md);padding:0 8px;font-size:var(--dshpc-font-md);line-height:var(--dshpc-line-md);}
.dsh-tdt-dtf--lg{height:var(--dshpc-control-h-lg);padding:0 8px;font-size:var(--dshpc-font-md);line-height:var(--dshpc-line-md);}
.dsh-tdt-dtf:hover:not(:disabled){background:var(--dshpc-hover);}
.dsh-tdt-dtf:focus-visible{outline:2px solid var(--dshpc-focus);outline-offset:2px;}
.dsh-tdt-dtf:disabled{cursor:not-allowed;opacity:.6;}
.dsh-tdt-dtf__label{flex:1 1 auto;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;text-align:left;}
.dsh-tdt-dtf__label--ph{color:var(--dshpc-fg-dim);}
.dsh-tdt-dtf__icon{display:inline-flex;width:16px;height:16px;align-items:center;justify-content:center;flex:none;color:var(--dshpc-fg-3);}

.dsh-tdt-layer{position:fixed;z-index:var(--dshpc-z-menu);box-sizing:border-box;padding:8px;background:var(--dshpc-surface-1);
  box-shadow:var(--dshpc-shadow-2);border-radius:var(--dshpc-radius-md);color:var(--dshpc-fg);font-size:var(--dshpc-font-md);}

.dsh-tdt-time__cols{display:flex;gap:4px;}
.dsh-tdt-time__list{width:56px;max-height:196px;overflow-y:auto;display:flex;flex-direction:column;gap:2px;}
.dsh-tdt-time__opt{padding:5px 0;border:0;border-radius:var(--dshpc-radius-sm);background:transparent;color:var(--dshpc-fg-2);
  font:inherit;font-size:var(--dshpc-font-md);cursor:pointer;transition:background-color var(--dshpc-dur-fast) var(--dshpc-ease),color var(--dshpc-dur-fast) var(--dshpc-ease);}
.dsh-tdt-time__opt[aria-selected='true']{background:var(--dshpc-hover);color:var(--dshpc-fg);font-weight:600;}
.dsh-tdt-time__foot{display:flex;align-items:center;justify-content:space-between;gap:8px;margin-top:6px;padding-top:6px;border-top:1px solid var(--dshpc-border);}

@media (prefers-reduced-motion: reduce){.dsh-tdt-dtf,.dsh-tdt-time__opt{transition:none;}}
`;

/** 下拉锚点 / 省略号的皮肤规则（核心 `Picker` 暂缺 error/title，本仓 `SelectField` 保留）。 */
export const SELECT_CSS = `
/* 下拉 / 日历 / 时分锚点：键盘可达性描边 + 校验描红（类名从业务层沿用，皮肤归位基础层） */
.dsh-tdt-ed-field:focus-visible{outline:2px solid var(--dshpc-business);outline-offset:1px;}
.dsh-tdt-ed-field--error{border-color:var(--dshpc-danger)!important;box-shadow:0 0 0 1px var(--dshpc-danger);}
/* 整行下拉：官方 Menu 的包装 span 是 inline-flex（shrink-to-fit），要连它一起撑满 */
.dsh-tdt-ed-selectwrap{width:100%;}

/* 省略号三件套（ui-style-guide §三「待抽象 #1」的收敛点）：**新代码一律挂这个类**，不再各写一遍。 */
.dsh-tdt-ellipsis{overflow:hidden;text-overflow:ellipsis;white-space:nowrap;}
`;

/** 「过程文件」块的皮肤规则（2026-10-10：回执过程文件桶的次级展示件）。 */
export const PROCESS_FILES_CSS = `
/* ── 「过程文件」块：会话弹窗交付卡下方 / 执行记录展开区 / 查看档产出清单三处共用 ──────────
   （结构在 client/process-files.tsx）。观感纪律 = **次级**：小字浅灰标题 + 数量、默认收起，
   不许抢主文件（交付卡 / 产出物清单）的视线；展开后的文件行复用 .dsh-tdt-filechip--inline。 */
.dsh-tdt-proc{display:flex;flex-direction:column;gap:4px;margin-top:10px;min-width:0;}
.dsh-tdt-proc-head{appearance:none;-webkit-appearance:none;align-self:flex-start;display:inline-flex;align-items:center;
  gap:6px;padding:2px 6px;border:0;border-radius:var(--dshpc-radius-xs);background:transparent;color:var(--dshpc-fg-3);
  font:inherit;font-size:var(--dshpc-font-xs);line-height:var(--dshpc-line-sm);cursor:pointer;
  transition:background-color var(--dshpc-dur) var(--dshpc-ease),color var(--dshpc-dur) var(--dshpc-ease);}
.dsh-tdt-proc-head:hover{background:var(--dshpc-chip-bg);color:var(--dshpc-fg-2);}
.dsh-tdt-proc-head:focus-visible{outline:2px solid var(--dshpc-focus);outline-offset:1px;}
.dsh-tdt-proc-list{display:flex;flex-wrap:wrap;gap:2px 4px;min-width:0;}

@media (prefers-reduced-motion: reduce){.dsh-tdt-proc-head{transition:none;}}
`;

/** 控件皮肤域的固定名（注入顺序在 tokens 之后）。 */
export const CONTROLS_DOMAIN = "controls";

/**
 * 确保控件皮肤已登记并注入（幂等；组件渲染时调用一次即可）。
 */
export function ensureControlsStyle(): void {
	applyStyle(
		CONTROLS_DOMAIN,
		BUTTON_CSS + FIELD_CSS + DATETIME_CSS + SELECT_CSS + PROCESS_FILES_CSS,
	);
}
