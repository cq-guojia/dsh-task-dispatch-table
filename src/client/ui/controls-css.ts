/**
 * L2 组件皮肤：公用控件规则（一类控件**唯一实现**）
 *
 * 规矩（docs/design/ui-style-guide.md §三）：
 *  - **只消费 `var(--dshpc-*)`**，一个颜色 / 尺寸 / 圆角 / 字号字面量都不许出现；
 *  - 结构、尺寸、交互规则只此一份；「外观差异」只允许靠**覆盖一两个变量**表达。
 *
 * 2026-11-06：分段 / 按钮 / 输入 / 数字步进 / 多行文本 / 跑马灯 / 下拉 / 日期时间 / 小问号
 * 已全部改接核心 `dsh-plugin-core/ui`，对应本地皮肤整段删除。
 * 本文件只剩**核心没有**的业务件：产出物 chip、开关选色，「过程文件」块。
 */
import { applyStyle } from "./style";

/** 产出物图标 chip 的皮肤规则。 */
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

/* 行式文件按钮（图标 + 文件名）已改接核心 .dshpc-filechip（2026-11-06）：
   核心 P2 已提供同名同皮的**全站唯一实现**（--block / --inline 两个形态类，自带 hover 与左右内边距），
   本仓不再保留第二份，使用点直接挂核心类名。 */

@media (prefers-reduced-motion: reduce){.dsh-tdt-chip{transition:none;}}
`;

/** 开关 / 拖拽分隔条的皮肤规则（核心没有的宿主件）。 */
export const FIELD_CSS = `
/* 官方 Switch 包装统一：选中 = success 绿。 */
.dsh-tdt-switch button[role='switch'][aria-checked='true']{background:var(--dshpc-success);}

/* 拖拽分隔条已随两条分栏一起归核心 PanelDock（2026-11-06），本仓不再自绘命中条。 */
`;

/** 下拉的皮肤规则（核心 `Picker` 暂缺 `error` 档，这里只补一条描红）。 */
export const SELECT_CSS = `
/* 核心 Picker 的校验描红（className 挂在 .dshpc-picker 根上）。 */
.dsh-tdt-picker--error .dshpc-picker__trigger{border-color:var(--dshpc-danger);box-shadow:0 0 0 1px var(--dshpc-danger);}
/* 整行下拉：核心 Picker 根是 inline-block，要显式撑满父宽。 */
.dsh-tdt-picker--block{display:block;width:100%;}

/* 省略号三件套（ui-style-guide §三「待抽象 #1」的收敛点）：**新代码一律挂这个类**，不再各写一遍。 */
.dsh-tdt-ellipsis{overflow:hidden;text-overflow:ellipsis;white-space:nowrap;}
`;

/** 「过程文件」块的皮肤规则（2026-10-10：回执过程文件桶的次级展示件）。 */
export const PROCESS_FILES_CSS = `
/* ── 「过程文件」块：会话弹窗交付卡下方 / 执行记录展开区 / 查看档产出清单三处共用 ──────────
   （结构在 client/process-files.tsx）。观感纪律 = **次级**：小字浅灰标题 + 数量、默认收起，
   不许抢主文件（交付卡 / 产出物清单）的视线；展开后的文件行复用核心 .dshpc-filechip--inline。 */
.dsh-tdt-proc{display:flex;flex-direction:column;gap:4px;margin-top:10px;min-width:0;}
.dsh-tdt-proc-list{display:flex;flex-wrap:wrap;gap:2px 4px;min-width:0;}

`;

/** 1 像素滚动条（用户 2026-11-06：所有区域滚动条统一细线）。 */
export const SCROLL_CSS = `
/* ── 1 像素滚动条：本插件界面内**所有**滚动区统一 ───────────────────────────
   主面板 / 卡片展开区 / 编辑分栏 / 预览分栏全在 .dsh-tdt-root 之内 ⇒ 一条后代选择器全覆盖，
   使用点不必各自挂类。下拉菜单经 FloatingPortal 挂到 body、不在 root 内；核心 Picker 的列表
   已自带 .dshpc-scroll-thin（同为 1px），无需重复实现。
   ⚠️ 只写 ::-webkit-scrollbar：一旦同时写 scrollbar-width，Chrome 会切到规范化滚动条
   并忽略这里的 1px（核心 panel.css 同款结论）。 */
.dsh-tdt-root::-webkit-scrollbar, .dsh-tdt-root *::-webkit-scrollbar{width:1px;height:1px;}
.dsh-tdt-root::-webkit-scrollbar-thumb, .dsh-tdt-root *::-webkit-scrollbar-thumb{background:var(--dshpc-border-heavy);}
.dsh-tdt-root::-webkit-scrollbar-track, .dsh-tdt-root *::-webkit-scrollbar-track{background:transparent;}
`;

/** 控件皮肤域的固定名（注入顺序在 tokens 之后）。 */
export const CONTROLS_DOMAIN = "controls";

/**
 * 确保控件皮肤已登记并注入（幂等；组件渲染时调用一次即可）。
 */
export function ensureControlsStyle(): void {
	applyStyle(
		CONTROLS_DOMAIN,
		BUTTON_CSS + FIELD_CSS + SELECT_CSS + PROCESS_FILES_CSS + SCROLL_CSS,
	);
}
