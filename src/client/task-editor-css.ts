// 任务表单弹窗的样式（类名前缀稳定 `dsh-tdt-ed-`，色值全部走统一下发 token `--dshpc-*`）。
//
// 交付方式与 archive-session-css.ts 同源：client 产物是内核消费的 CJS 闭包，
// `import './x.css'` 不会被加载 ⇒ 运行时注入 <style>。
//
// 用 CSS 而不是内联样式的只有两类：**伪类**（:hover / :focus-within / ::placeholder）
// 与整页外壳骨架；控件内部的度量仍在 editor-fields.tsx 里内联（照官方 Input 逐条抄）。

import { applyStyle } from "./ui";

/** 样式标签 id（历史遗留；注入已统一走 ui/style.ts）。 */
export const ED_STYLE_ID = "dsh-task-dispatch-table-task-editor";

export const TASK_EDITOR_CSS = `
/* 分栏外壳（面板 / 拖拽条 / 宽度 / sticky）已全部归核心 PanelDock（2026-11-06）：
   .dshpc-dock__panel 就是原来那条 sticky 一列，宽度由核心按 storageKey 记忆，
   --dshpc-page-inset-right 由核心维护 —— 本仓不再自管分栏宽度与拖拽条。
   这里只剩**内容本体**：填满核心给的 body 高度，内部自己滚（核心 body 的 overflow 不参与）。 */
.dsh-tdt-ed-content{position:relative;display:flex;flex-direction:column;height:100%;min-height:0;}
.dsh-tdt-ed-header{flex:none;display:flex;align-items:center;justify-content:space-between;gap:12px;padding:12px 14px 12px 18px;border-bottom:1px solid var(--dshpc-border,rgba(128,128,128,.35));position:relative;}
.dsh-tdt-ed-title{font-size:var(--dshpc-font-lg);font-weight:600;}
/* 头部左侧只剩标题；右侧一组 = 启用开关 + 关闭 ✕（用户 2026-10-01：开关回到右侧、紧贴 ✕ 左边）。 */
.dsh-tdt-ed-headleft{display:flex;align-items:center;gap:12px;min-width:0;}
.dsh-tdt-ed-headactions{display:flex;align-items:center;gap:10px;flex:none;}
/* 启用开关行：文字标签 + 官方 Switch（官方 Switch 只画胶囊，可见标签由这里给）。 */
.dsh-tdt-ed-enable{display:inline-flex;align-items:center;gap:8px;font-size:var(--dshpc-font-md);color:var(--dshpc-fg,#1f2328);cursor:pointer;}
/* 选中色（success 绿）已上提到 ui/controls-css.ts 的 .dsh-tdt-switch（编辑器 / 列表两处合并，2026-10-01）。 */
.dsh-tdt-ed-body{flex:1 1 auto;min-height:0;overflow:auto;padding:14px 18px 22px;}
.dsh-tdt-ed-footer{flex:none;display:flex;align-items:center;justify-content:flex-end;gap:8px;padding:12px 18px;border-top:1px solid var(--dshpc-border,rgba(128,128,128,.35));position:relative;}
.dsh-tdt-ed-hint{margin:4px 0 0;font-size:var(--dshpc-font-sm);line-height:1.5;color:var(--dshpc-fg-2,rgba(128,128,128,.95));}
/* 删除任务：红色危险钮（用户 2026-09-30：放在「保存」旁，醒目但仍是描边形态）。 */
.dsh-tdt-ed-danger{color:var(--dshpc-danger,#e5484d)!important;border-color:var(--dshpc-danger,#e5484d)!important;}
.dsh-tdt-ed-danger:hover{background:var(--dshpc-hover,rgba(128,128,128,.16))!important;}
.dsh-tdt-ed-section{margin-bottom:16px;}
.dsh-tdt-ed-section:last-child{margin-bottom:0;}
/* 卡片（提示词 / 执行频率）：输入焦点在卡内即高亮描边（官方 Input 的 :focus-within 同款）。 */
/* 卡片皮肤（底 / 边 / 圆角 / 内距）全归核心 Surface；本类只留语义态（用户 2026-11-06）。 */
.dsh-tdt-ed-card{box-sizing:border-box;transition:border-color .15s ease;}
.dsh-tdt-ed-card:focus-within{border-color:var(--dshpc-business,#4d6bfe);}
/* 校验不通过的红框（用户 2026-09-30：出问题的地方把框描红，明暗自适应，走宿主 error token）。 */
.dsh-tdt-ed-card--error{border-color:var(--dshpc-danger,#e5484d);background:var(--dshpc-danger,rgba(229,72,77,.08));}
/* 历史版本开关（2026-10-01：已并入统一分段控件 Segmented，根 id=dsh-tdt-ed-histtoggle、multiple 单段做 on/off；
   样式完全走 controls-css.ts 的 .dsh-tdt-seg，这里不再留任何皮肤——旧 .dsh-tdt-ed-histtoggle* 规则已删。 */
/* 版本条目（用户 2026-09-30 第二轮）：弃卡片背景，改**全宽虚线**分隔（一条虚线拉通整栏、不断在中间）；
   右侧 = 固定宽高槽：常态时间小字、hover 换「使用（药丸）/ 移除（小字）」——槽位尺寸恒定，
   hover 出按钮**绝不撑高行高**（此前按钮把行撑大上下蹦，用户点名）。 */
.dsh-tdt-ed-ver{display:flex;align-items:center;gap:8px;padding:9px 12px;border-bottom:1px dashed var(--dshpc-border-strong,rgba(128,128,128,.35));}
.dsh-tdt-ed-ver:last-child{border-bottom:none;}
.dsh-tdt-ed-ver-ic{flex:none;display:inline-flex;color:var(--dshpc-fg-3,rgba(128,128,128,.8));}
.dsh-tdt-ed-ver-main{flex:1 1 auto;min-width:0;font-size:var(--dshpc-font-xs);color:var(--dshpc-fg,#1f2328);}
.dsh-tdt-ed-ver-note{display:block;font-size:var(--dshpc-font-xs);color:var(--dshpc-fg-2,rgba(128,128,128,.95));overflow:hidden;text-overflow:ellipsis;white-space:nowrap;}
.dsh-tdt-ed-ver-right{flex:none;width:52px;height:18px;display:flex;align-items:center;justify-content:flex-end;}
.dsh-tdt-ed-ver-actions{display:flex;align-items:center;gap:8px;}
.dsh-tdt-ed-card-foot{display:flex;align-items:center;justify-content:space-between;gap:8px;margin-top:8px;}
/* 三个下拉（工作区 / 权限 / 模型）在窄卡里必须能收缩并省略，不能把卡撑爆：
   核心 Picker 的根是 inline-block（max-width:100%），这里给行内子项放行收缩（min-width:0），
   配合锚点上的 maxWidth，空间不够时先压宽度、标签走省略号（用户 2026-10-01）。 */
.dsh-tdt-ed-card-foot > *{min-width:0;}
/* 选模型（核心 ModelPicker 分组态）：比工作区小一档，最小宽度下先让出空间（用户 2026-11-06 真机反馈）。
   触发器必须填满定宽根，否则值短时触发器缩到 min-width(120)、右缘留白 ⇒ 看着没靠右；
   margin-left:auto 兜底，让它在任何排布下都贴右缘（用户 2026-11-06）。 */
.dsh-tdt-ed-model{width:140px;margin-left:auto;}
.dsh-tdt-ed-model .dshpc-picker__trigger{width:100%;}
/* 设置页「供应商 + 模型」联动态：两个下拉**等宽定住**（核心 __row 默认 flex，按内容自适应会跳宽）。 */
.dsh-tdt-model-pair .dshpc-picker__row{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:var(--dshpc-space-2);}
.dsh-tdt-model-pair .dshpc-picker__row > .dshpc-picker{width:100%;min-width:0;}
.dsh-tdt-model-pair .dshpc-picker__row .dshpc-picker__trigger{width:100%;}
/* 提示词大输入框已改接核心 Textarea（dsh-plugin-core/ui，2026-11-06）；本地皮肤整段删除，此处不再自写。 */
.dsh-tdt-ed-row{display:flex;align-items:center;gap:8px;flex-wrap:wrap;}
.dsh-tdt-ed-spacer{flex:1 1 auto;}
/* 高级设置卡收折头（用户 2026-09-29：撤掉内层黑框，整卡就是一条灰、整行可点）。 */
/* 展开指示：官方 chevron-down（TurnTriggerNodeView 同款），展开 rotate 180°。 */
.dsh-tdt-ed-advchevron{flex:none;color:var(--dshpc-fg-2,rgba(128,128,128,.95));transition:transform .15s ease;}
.dsh-tdt-ed-advchevron-open{transform:rotate(180deg);}
/* 展开体：每项「控件行 + 说明行」两拍，项与项之间虚线分隔（用户 2026-09-29：别全挤成文字）。 */
.dsh-tdt-ed-advbody{display:flex;flex-direction:column;gap:12px;margin-top:10px;}
.dsh-tdt-ed-advitem{padding-top:12px;}
.dsh-tdt-ed-advitem:first-child{padding-top:0;}
.dsh-tdt-ed-advitem+.dsh-tdt-ed-advitem{border-top:1px dashed var(--dshpc-border-strong,rgba(128,128,128,.5));}
/* 排期卡底部：时区 / 有效期缩到小号并整体居右（重要性低，不占主视线）。 */
.dsh-tdt-ed-schedfoot{display:flex;align-items:center;justify-content:flex-end;gap:8px;margin-top:12px;padding-top:12px;border-top:1px solid var(--dshpc-border,rgba(128,128,128,.35));}
/* 小问号已改接核心 FieldHint（2026-11-06）：图标 / 气泡 / 焦点全部归核心，本地皮肤已删。 */
/* 前置任务卡两级选择行（用户 2026-09-29 定稿三段式）：
   左「工作区」定宽（约 5~6 个字，134px）居左；右「添加」定宽（72px，用户 2026-09-29 收窄）居中
   吃掉剩余宽度（随抽拉分栏宽窄同步伸缩）。
   核心 Picker 的根是 inline-block flex 子项 ⇒ 必须给 min-width:0 才能收缩，否则整行被撑爆。 */
.dsh-tdt-ed-depitem{display:flex;align-items:center;gap:8px;padding:6px 10px;border-radius:var(--dshpc-radius-sm);background:var(--dshpc-hover,rgba(38,49,72,.06));}
/* 附件行（2026-11-06 改接核心，与查看档附件同款）：只有排布，不画皮肤 ——
   文件名 / 来源标签 / 移除钮分别由核心 Chip、Chip(xs)、IconButton(danger) 承载。 */
.dsh-tdt-ed-attline{display:flex;align-items:center;gap:6px;min-width:0;}
.dsh-tdt-ed-deppick{display:flex;align-items:center;gap:8px;}
.dsh-tdt-ed-deppick-ws{flex:0 0 134px;min-width:0;display:flex;}
.dsh-tdt-ed-deppick-task{flex:1 1 auto;min-width:0;display:flex;}
.dsh-tdt-ed-deppick-ws > *,.dsh-tdt-ed-deppick-task > *{flex:1 1 auto;min-width:0;width:100%;}
/* 关闭确认已改为分栏内联层（见 task-editor ConfirmDiscard），不再用官方 Modal，故无需抬层规则。 */
/* ── 查看档（右侧栏「查看 / 编辑」两档的只读面，用户 2026-10-05）──────────────────
   纵向单栏流三块：基础信息 → 提示词 → 上次执行；块与块之间留呼吸间距。
   字段行 / 「上次执行」明细的皮肤**不在这里** —— 那是域 domain:task-info（与卡片展开区共用同一份）。 */
.dsh-tdt-ed-view{display:flex;flex-direction:column;gap:18px;}
/* 块标题行：默认左对齐（标签 + 内联状态/标记都在左），只有提示词的操作组靠右（margin-left:auto）。 */
/* 块标题 = **标签**（图标 + 文字）；竖线已承担视觉分隔，这里去掉灰底只留文字。 */
/* 标题前的短竖线标（品牌色，方角）：只修饰 icon，不包整块（用户 2026-10-05 修正：整块长线太丑）。 */
.dsh-tdt-ed-view-block{display:flex;flex-direction:column;min-width:0;}
.dsh-tdt-ed-view-badge{flex:none;width:8px;height:8px;border-radius:2px;}
/* 草稿标记 chip（r13：灰色不明显 ⇒ **警告色**——红太强，用 warning 橙：橙字 + 极浅橙底）。 */
/* 提示词操作组（源码 / 预览 + 展开 / 收起）：整组靠右、不折行（仅此一组 margin-left:auto，
   其余块的标题 / 状态 / 「修改没保存」保持居左，2026-10-05 修正 space-between 把它们挤到最右）。 */
/* 展开 / 收起 小箭头：复用 chevron-down，收起态翻转 180°（与高级设置收折头同款）。 */
.dsh-tdt-ed-view-expchevron{flex:none;color:var(--dshpc-fg-3,rgba(128,128,128,.8));transition:transform .15s ease;}
.dsh-tdt-ed-view-expchevron-open{transform:rotate(180deg);}
/* 提示词文档区：极淡底（明暗自适应，约 3% 前景色混合）、无左 / 右框、无圆角，包住整段文档。 */
/* 提示词默认**约 5 行**截断（用户 2026-10-05）；展开（--open）后不限高，靠右侧栏自己的滚动条往下拉。 */
.dsh-tdt-ed-view-prompt{min-width:0;max-height:100px;overflow:hidden;}
.dsh-tdt-ed-view-prompt--open{max-height:none;}
.dsh-tdt-ed-view-empty{font-size:var(--dshpc-font-sm);color:var(--dshpc-fg-3,rgba(128,128,128,.8));}
`;

/** 幂等注入（走 ui/style.ts 单一 <style>）。 */
export function ensureTaskEditorStyle(): void {
	applyStyle("domain:editor", TASK_EDITOR_CSS);
}
