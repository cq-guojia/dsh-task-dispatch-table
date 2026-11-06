// 会话弹窗里**本仓自己画**的两块内容样式（外壳 / 滚动 / 消息行已归核心 dsh-plugin-core/adv/session）：
//   ① 顶部「接收 / 随附」文件区（`.dsh-tdt-sv-tfc*`，核心 bodyHeader 槽位）
//   ② 交付文件卡（快照没覆盖到的 DB outputs 补差，核心 bodyFooter 槽位）
//
// 交付方式：客户端产物是 `window.__ModuleLoader__.load({ factory })` 的 CJS 闭包，
// `import './x.css'` 只会产出独立 .css 资源、内核不会加载它 ⇒ 运行时注入 <style>（见 ensureArchiveSessionStyle）。
//
// 颜色一律引用 `--dshpc-*`（明/暗自动跟随，括号内为兜底值）；布局 token 取聊天专属
// `--dsh-chat-*`（官方真值，带兜底）。不引用任何宿主内部符号。
import { applyStyle } from "./ui";

/** 样式注入 id（历史沿用；注入已统一走 ui/style.ts 的单一 <style>）。 */
export const SV_STYLE_ID = "dsh-task-dispatch-table-archive-session";

/** 会话弹窗业务内容样式（一条 <style> 注入，见 ensureArchiveSessionStyle）。 */
export const ARCHIVE_SESSION_CSS = `
/* ── 交付文件卡（官方 ui-deliverables Deliverables.module.css 逐值兜底镜像；官方类命中时 ocOr 走官方） ── */
/* 交付文件卡网格（root 内含 container query：≤620px 单列）。 */
.dsh-tdt-sv-deliv{--deliverable-fill:var(--dshpc-plate);--deliverable-hover:var(--dshpc-plate-hover);flex-direction:column;gap:16px;min-width:0;margin-top:4px;display:flex;container-type:inline-size;}
.dsh-tdt-sv-deliv-grid{grid-template-columns:repeat(2,minmax(0,1fr));gap:10px;min-width:0;display:grid;}
.dsh-tdt-sv-deliv-grid[data-single=true]{grid-template-columns:minmax(0,1fr);}
@container (width<=620px){.dsh-tdt-sv-deliv-grid{grid-template-columns:minmax(0,1fr);}}
.dsh-tdt-sv-deliv-file{box-sizing:border-box;border:.5px solid var(--dshpc-border-faint);border-radius:var(--dshpc-radius-md);background:var(--deliverable-fill);min-width:0;height:60px;color:var(--dshpc-fg);align-items:center;gap:10px;padding:8px 10px;transition:background-color .12s;display:flex;position:relative;overflow:hidden;}
.dsh-tdt-sv-deliv-file:hover{background:var(--deliverable-hover);}
.dsh-tdt-sv-deliv-cardpreview{z-index:1;border-radius:inherit;cursor:pointer;background:0 0;border:0;width:100%;padding:0;position:absolute;inset:0;}
.dsh-tdt-sv-deliv-cardpreview:focus-visible{box-shadow:inset 0 0 0 2px var(--dshpc-focus);outline:none;}
.dsh-tdt-sv-deliv-icon{z-index:2;box-sizing:border-box;pointer-events:none;border:.5px solid var(--dshpc-border-faint);border-radius:var(--dshpc-radius-md);background:var(--dshpc-icon-plate);width:40px;height:40px;color:var(--dshpc-link);flex:none;place-items:center;display:grid;position:relative;overflow:hidden;}
.dsh-tdt-sv-deliv-body{z-index:2;pointer-events:none;flex:1;justify-content:space-between;align-items:center;gap:12px;min-width:0;display:flex;position:relative;}
.dsh-tdt-sv-deliv-details{flex-direction:column;flex:1;justify-content:center;gap:2px;min-width:0;display:flex;}
.dsh-tdt-sv-deliv-name{text-overflow:ellipsis;white-space:nowrap;font-size:var(--dshpc-font-md);font-weight:500;line-height:var(--dshpc-line-md);overflow:hidden;}
.dsh-tdt-sv-deliv-desc{color:var(--dshpc-fg-3,rgba(128,128,128,.8));text-overflow:ellipsis;white-space:nowrap;font-size:var(--dshpc-font-xs);font-weight:400;line-height:var(--dshpc-line-sm);overflow:hidden;}
.dsh-tdt-sv-deliv-hint,.dsh-tdt-sv-deliv-file:hover .dsh-tdt-sv-deliv-desc .dsh-tdt-sv-deliv-secondary{display:none;}
.dsh-tdt-sv-deliv-file:hover .dsh-tdt-sv-deliv-desc .dsh-tdt-sv-deliv-hint{display:inline;}
.dsh-tdt-sv-deliv-toggle{border-radius:var(--dshpc-radius-sm,6px);min-width:0;color:var(--dshpc-fg-3,rgba(128,128,128,.8));cursor:pointer;font:inherit;background:0 0;border:0;align-self:center;align-items:center;gap:4px;padding:1px 11px;font-size:var(--dshpc-font-sm);line-height:var(--dshpc-line-sm);display:inline-flex;}
.dsh-tdt-sv-deliv-toggle:hover{background:var(--dshpc-hover,rgba(38,49,72,.06));}
.dsh-tdt-sv-deliv-toggle svg{flex:none;width:14px;height:14px;}

/* ── 任务文件上下文（顶部输入区：接收 / 随附，2026-10-03） ──
   官方没有「前置任务产出 / 附加文件」这个概念 ⇒ 自绘，但零件（FileTypeIcon）与 token 全走官方。
   ① **左右 0（tfc 不自带）**：左右留白全交给核心会话列的左右内边距（与会话正文同一条基线）。
      上 0 / 下 18 —— 顶部靠核心 bodyHeader 的既定间距补齐（本仓不再叠一层）。
   ② **横向排 + 按内容宽**（用户三次点名定稿）：flex-wrap:wrap 从左到右、排满换行；
      chip flex:0 0 auto **跟内容走**，**不设最小宽度**（「a.txt」就只显示 a.txt），
      只给 label 一个 max-width:40ch 上限。
   ③ **显示不全的文件名一律跑马灯**（用户「鼠标一上去都要跑马灯」）：走全站唯一实现 MarqueeText。
   ④ **前置任务一排两个**（窄容器降一列）：每块 = 任务名一行 + 产出物横向排；任务名行最前 =
      序号徽标（宽高相等的正方形小方块）。历史上先后试过两种竖线（块前 3px 长线 / 任务名前 4px
      短线），**均已去掉**（用户 2026-10-03）。
   ④b **来源 / 状态标记改方括号前置**（[链接]foo.md），不再挂右侧像按钮。
   ⑤ **不自带滚动**：与会话内容同一个滚动容器（核心 bodyHeader 槽位在 scroll 内）。
   ⑥ 两组之间一条 .5px 细线分隔。 */
/* container-type:inline-size：两列网格的降级判据用**容器宽度**（弹窗会被预览 / 编辑分栏挤窄）。 */
.dsh-tdt-sv-tfc{border-bottom:.5px solid var(--dshpc-border-faint,#0000000a);padding:0 0 18px;flex-direction:column;gap:12px;min-width:0;display:flex;container-type:inline-size;}
.dsh-tdt-sv-tfc-group{flex-direction:column;gap:8px;min-width:0;display:flex;}
.dsh-tdt-sv-tfc-group+.dsh-tdt-sv-tfc-group{border-top:.5px solid var(--dshpc-border-faint,#0000000a);padding-top:12px;}
.dsh-tdt-sv-tfc-head{align-items:baseline;gap:8px;min-width:0;display:flex;}
/* 组标题比内容**高一档**（12px/600/fg-2）⇒ 不靠颜色也分得出层级：标题 > 任务名 > 芯片 > 元信息。 */
.dsh-tdt-sv-tfc-title{color:var(--dshpc-fg-2,rgba(128,128,128,.95));font-size:var(--dshpc-font-sm);font-weight:600;line-height:var(--dshpc-line-sm);white-space:nowrap;}
/* 前置任务块 —— 一排两个（窄容器降一列，见下方 @container）。 */
.dsh-tdt-sv-tfc-tasks{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:12px 18px;min-width:0;}
@container (width<=620px){.dsh-tdt-sv-tfc-tasks{grid-template-columns:minmax(0,1fr);}}
/* 任务块：块前竖线与任务名前短线都已去掉（用户 2026-10-03 逐轮否定 ⇒ 最终只留正方形序号徽标）。 */
.dsh-tdt-sv-tfc-task{flex-direction:column;gap:4px;min-width:0;display:flex;}
.dsh-tdt-sv-tfc-taskrow{align-items:baseline;gap:8px;min-width:0;overflow:hidden;display:flex;}
/* 层级：组标题 12/600/fg-2 靠**字重**区分；任务名同 12px 但 500 + 主色 ⇒ 内容更实、标题更轻。 */
.dsh-tdt-sv-tfc-name{color:var(--dshpc-fg,#1f2328);font-size:var(--dshpc-font-sm);font-weight:500;line-height:var(--dshpc-line-sm);text-overflow:ellipsis;white-space:nowrap;overflow:hidden;max-width:70%;}
.dsh-tdt-sv-tfc-meta{color:var(--dshpc-fg-3,rgba(128,128,128,.8));font-size:var(--dshpc-font-xs);line-height:var(--dshpc-line-sm);white-space:nowrap;flex:0 1 auto;}
.dsh-tdt-sv-tfc-lines{flex-direction:column;gap:2px;min-width:0;display:flex;}
/* 文件**横向排**：从左到右、排满换行。
   ⚠️ align-items:flex-start 必须留着：默认 stretch 会把 chip 拉成整行宽，悬停热区变成一条横带。 */
.dsh-tdt-sv-tfc-files{flex-direction:row;flex-wrap:wrap;align-items:flex-start;gap:2px 6px;min-width:0;display:flex;}
/* chip 宽度**跟内容走**：flex:0 0 auto（不 grow、不平分）；**不设最小宽度**。
   唯一约束是 label 的 max-width：超长才出省略号 + 跑马灯。 */
.dsh-tdt-sv-tfc-file{border-radius:var(--dshpc-radius-sm,6px);color:var(--dshpc-fg-2,rgba(128,128,128,.95));cursor:default;font:inherit;background:0 0;border:0;align-items:center;gap:6px;min-width:0;max-width:100%;padding:2px 6px;font-size:var(--dshpc-font-sm);line-height:var(--dshpc-line-sm);flex:0 0 auto;display:flex;text-align:left;}
button.dsh-tdt-sv-tfc-file{cursor:pointer;}
button.dsh-tdt-sv-tfc-file:hover{background:var(--dshpc-hover,rgba(38,49,72,.06));color:var(--dshpc-fg);}
button.dsh-tdt-sv-tfc-file:focus-visible{box-shadow:inset 0 0 0 2px var(--dshpc-focus,#3b5bdb);outline:none;}
/* 不可点（路径没解析出来 / 跨工作区目录）⇒ 淡一档 + 不给指针，别让人点了没反应。 */
.dsh-tdt-sv-tfc-file[data-noclick]{opacity:.6;}
.dsh-tdt-sv-tfc-icon{width:14px;height:14px;color:var(--dshpc-fg-3,rgba(128,128,128,.8));flex:none;align-items:center;justify-content:center;display:inline-flex;}
/* 文件名：截断与跑马灯都交给全站唯一实现 MarqueeText（.dsh-tdt-mq 双层）。
   唯一长度约束：**无最小宽度**（「只有一个字 a.txt 就只显示 a.txt」），**最大 40ch**。
   ⚠️ ch 按「0」的宽度算，中文文件名实际更宽一点，属可接受偏差。 */
.dsh-tdt-sv-tfc-label{min-width:0;max-width:40ch;flex:0 1 auto;}
/* 前置任务序号徽标（用户 2026-10-03 四次点名定稿）：**顶替原来那条 4px 竖线**，
   宽高**相等**的方块，字号取 var(--dshpc-font-sm) —— 与主界面「前置任务」正文同一字号变量。
   方块 16px 容纳 12px 数字 + 一点余量；底色 chip-bg（比 plate 亮一档），字色 fg-2。 */
.dsh-tdt-sv-tfc-seq{flex:none;display:inline-flex;align-items:center;justify-content:center;align-self:center;box-sizing:border-box;width:16px;height:16px;padding:0;border-radius:4px;background:var(--dshpc-chip-bg,rgba(128,128,128,.12));color:var(--dshpc-fg-2,rgba(128,128,128,.95));font-size:var(--dshpc-font-sm);line-height:1;font-variant-numeric:tabular-nums;}
/* 标记 + 文件名的无缝容器：标记紧贴文件名，右方括号与名字之间**不留间距**。 */
.dsh-tdt-sv-tfc-namewrap{display:flex;align-items:center;min-width:0;flex:1 1 auto;}
/* 来源 / 状态标记：方括号**放在文件名前面**。与文件名同字号，只靠颜色弱化。 */
.dsh-tdt-sv-tfc-note{color:var(--dshpc-fg-3,rgba(128,128,128,.8));font-size:var(--dshpc-font-sm);line-height:var(--dshpc-line-sm);white-space:nowrap;flex:none;}
.dsh-tdt-sv-tfc-more{border-radius:var(--dshpc-radius-sm,6px);min-width:0;color:var(--dshpc-fg-3,rgba(128,128,128,.8));cursor:pointer;font:inherit;background:0 0;border:0;align-self:flex-start;align-items:center;gap:4px;padding:1px 6px;font-size:var(--dshpc-font-xs);line-height:var(--dshpc-line-sm);display:inline-flex;}
.dsh-tdt-sv-tfc-more:hover{background:var(--dshpc-hover,rgba(38,49,72,.06));color:var(--dshpc-fg-2);}
.dsh-tdt-sv-tfc-none{color:var(--dshpc-fg-3,rgba(128,128,128,.8));font-size:var(--dshpc-font-xs);line-height:var(--dshpc-line-sm);}
`;

/**
 * 幂等注入（走 ui/style.ts 单一 <style>）。SSR / 无 document 环境静默跳过。
 */
export function ensureArchiveSessionStyle(): void {
	applyStyle("domain:session-view", ARCHIVE_SESSION_CSS);
}
