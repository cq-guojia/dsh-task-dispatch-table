// 归档会话弹窗样式（决策 34）：类名稳定 + 官方 design token 驱动。
//
// 交付方式说明：客户端产物是 `window.__ModuleLoader__.load({ factory })` 的 CJS 闭包，
// `import './x.css'` 只会产出独立 .css 资源、内核不会加载它 ⇒ 改为**运行时注入 <style>**
// （design 定型为 archive-session.css 文件，此处仅交付方式变更，类名/变量机制不变）。
//
// 颜色一律引用宿主全局 `--dsw-alias-*`（宿主运行时注入，明/暗自动跟随，括号内为兜底值）；
// 布局 token 取聊天专属 `--dsh-chat-*`（0.1.7-RC.2 核实的真值，带兜底）。不引用任何宿主内部符号。

/** 弹窗根类名前缀（稳定，不随宿主哈希变化）。 */
export const SV_STYLE_ID = 'dsh-task-dispatch-table-archive-session'

/** 归档会话弹窗全部样式规则（一条 <style> 注入，见 ensureArchiveSessionStyle）。 */
export const ARCHIVE_SESSION_CSS = `
.dsh-tdt-sv-overlay{position:fixed;inset:0;z-index:1000;display:flex;align-items:center;justify-content:center;background:var(--dsw-alias-bg-mask-1,rgba(0,0,0,.45));}
/* 尺寸照抄宿主「左下角弹窗」卡片（dsh-context .lc-ov-card）：width min(1120px,100vw-32px)、height 100%-80px（遮罩满屏 ⇒ 等价 100vh-80px）、radius 12px、padding 16px 18px 18px。 */
/* 内间距定尺（用户拍板：不按官方内容列宽算）：官方 scroll = 16px + side-clearance ⇒ clearance 给 8px = 左右各 24px 定尺；内容列不设上限（100%）。 */
/* 面板底色 = 官方会话面 --dsw-alias-bg-base（官方 chat 页即此色）：
   官方 ReasoningRow 展开行是 sticky + background:var(--dsw-alias-bg-base)（ReasoningRow.module.css），
   若面板用 layer-1 会比行底色浅 ⇒ 展开思考时出现一条更黑的带（真机踩过）；统一 bg-base 即消失。 */
/* 内间距定尺（用户拍板：四边等距 34px）。纵向全在会话区上：官方 scroll 纵向固定 16px，
   面板不再吃纵向 padding（否则只会加在标题栏外侧，标题分割线与首条消息之间仍是 16px——真机踩过），
   由 .dsh-tdt-sv-frame 补 18px ⇒ 标题线下 16+18=34、底部 16+18=34；左右 = 16 + clearance(18px) = 34。 */
.dsh-tdt-sv-panel{--dsh-composer-side-clearance:18px;--dsh-chat-content-width:100%;--dsh-chat-flow-gap:16px;background:var(--dsw-alias-bg-base,#1a1a1a);color:var(--dsw-alias-label-primary,#1f2328);border:1px solid var(--dsw-alias-border-l2,rgba(128,128,128,.35));border-radius:12px;box-shadow:var(--dsw-shadow-lv3,0 12px 32px rgba(0,0,0,.4));width:min(1120px,calc(100vw - 32px));height:calc(100% - 80px);display:flex;flex-direction:column;box-sizing:border-box;overflow:hidden;}
.dsh-tdt-sv-header{display:flex;align-items:center;justify-content:space-between;gap:12px;padding:18px 34px 12px;border-bottom:1px solid var(--dsw-alias-border-l2,rgba(128,128,128,.35));flex-wrap:wrap;}
.dsh-tdt-sv-frame{padding:18px 0;}
/* 头部关闭钮规格照官方 primitives Modal.close（设置窗口关闭钮同源）：28×28、radius-sm、
   透明底，hover 才出 interactive-bg-hover（官方无色变、无阴影）。 */
.dsh-tdt-sv-close{appearance:none;background:0 0;border:none;flex:none;width:28px;height:28px;border-radius:var(--dsw-radius-sm,6px);cursor:pointer;color:var(--dsw-alias-label-secondary,rgba(128,128,128,.95));display:inline-flex;align-items:center;justify-content:center;transition:background var(--ds-transition-duration,.15s) var(--ds-ease-in-out,ease);}
.dsh-tdt-sv-close:hover{background:var(--dsw-alias-interactive-bg-hover,rgba(128,128,128,.16));}
.dsh-tdt-sv-heading{min-width:0;}
.dsh-tdt-sv-title{font-size:15px;font-weight:600;color:var(--dsw-alias-label-primary,#1f2328);}
.dsh-tdt-sv-sid{font-family:var(--ds-font-family-code,ui-monospace,SFMono-Regular,Menlo,Consolas,monospace);font-size:11px;color:var(--dsw-alias-label-tertiary,rgba(128,128,128,.8));word-break:break-all;}
.dsh-tdt-sv-actions{display:flex;align-items:center;gap:8px;}
.dsh-tdt-sv-btn{appearance:none;font:inherit;font-size:12px;line-height:18px;cursor:pointer;color:var(--dsw-alias-label-primary,#1f2328);background:var(--dsw-alias-bg-layer-2,rgba(128,128,128,.14));border:1px solid var(--dsw-alias-border-l2,rgba(128,128,128,.35));border-radius:8px;padding:4px 12px;transition:background var(--ds-transition-duration,.15s) var(--ds-ease-in-out,ease);}
.dsh-tdt-sv-btn:hover{background:var(--dsw-alias-interactive-bg-hover,rgba(128,128,128,.16));}
.dsh-tdt-sv-btn-icon{padding:4px 6px;display:inline-flex;align-items:center;justify-content:center;}
/* 会话区边距 = 官方 ChatView.scroll：16px + --dsh-composer-side-clearance(18px) ⇒ 左右各 34px；纵向由 frame 补足。 */
.dsh-tdt-sv-body{flex:1;min-height:0;overflow:auto;padding:16px calc(var(--dsh-composer-side-clearance,16px) + 16px) 16px;}
.dsh-tdt-sv-col{width:100%;max-width:var(--dsh-chat-content-width,920px);margin:0 auto;display:flex;flex-direction:column;gap:var(--dsh-chat-flow-gap,16px);}
/* 官方 ChatView.column 的兄弟间距（:not([hidden]) 才占位；折叠掉的过程节点不留空档）。 */
.dsh-tdt-sv-col>:not([hidden]):not(.dsh-tdt-sv-flowitem:empty)~:not([hidden]):not(.dsh-tdt-sv-flowitem:empty){margin-top:var(--dsh-chat-flow-gap,16px);}
.dsh-tdt-sv-visuallyhidden{position:absolute;width:1px;height:1px;margin:-1px;padding:0;overflow:hidden;clip:rect(0,0,0,0);white-space:nowrap;border:0;}
.dsh-tdt-sv-flowitem{min-width:0;}
.dsh-tdt-sv-official{flex:1;min-height:0;display:flex;flex-direction:column;overflow:hidden;}
.dsh-tdt-sv-older{display:flex;justify-content:center;}
.dsh-tdt-sv-older button{appearance:none;font:inherit;font-size:12px;line-height:18px;cursor:pointer;color:var(--dsw-alias-label-secondary,rgba(128,128,128,.9));background:var(--dsw-alias-interactive-bg-hover-solid,rgba(128,128,128,.2));border:none;border-radius:var(--dsw-radius-sm,6px);padding:4px 12px;}
.dsh-tdt-sv-older button:disabled{cursor:default;opacity:.6;}
.dsh-tdt-sv-process{box-sizing:border-box;width:100%;min-width:0;height:calc(33px + var(--dsh-content-font-delta,0px));border:none;border-bottom:.5px solid var(--dsw-alias-border-l2,rgba(128,128,128,.35));color:var(--dsw-alias-label-tertiary,rgba(128,128,128,.8));cursor:pointer;text-align:left;background:0 0;align-items:center;padding:0 0 8px;transition:color .1s;display:flex;}
.dsh-tdt-sv-process:hover{color:var(--dsw-alias-label-primary,#1f2328);}
.dsh-tdt-sv-process:not([data-open]){margin-bottom:8px;}
.dsh-tdt-sv-process-label{min-width:0;font-size:var(--dsh-content-font-size-secondary,13px);line-height:calc(24px + var(--dsh-content-font-delta,0px));text-overflow:ellipsis;white-space:nowrap;overflow:hidden;}
.dsh-tdt-sv-process-chevron{width:14px;height:14px;color:var(--dsw-alias-label-caption,rgba(128,128,128,.6));flex:none;margin-left:4px;transition:transform .1s;display:inline-flex;align-items:center;justify-content:center;}
.dsh-tdt-sv-process[data-open] .dsh-tdt-sv-process-chevron{transform:rotate(180deg);}
.dsh-tdt-sv-process-body{min-width:0;}
.dsh-tdt-sv-actions{height:calc(28px + var(--dsh-content-font-delta,0px));align-items:center;gap:8px;display:flex;margin-top:4px;}
.dsh-tdt-sv-action{display:inline-flex;align-items:center;justify-content:center;width:24px;height:24px;color:var(--dsw-alias-label-tertiary,rgba(128,128,128,.8));background:0 0;border:none;cursor:pointer;}
.dsh-tdt-sv-action:hover{color:var(--dsw-alias-label-primary,#1f2328);}
.dsh-tdt-sv-user{align-self:flex-start;max-width:100%;background:var(--dsw-alias-bg-layer-2,rgba(128,128,128,.14));border:1px solid var(--dsw-alias-border-l2,rgba(128,128,128,.28));border-radius:12px;padding:10px 14px;font-size:14px;line-height:1.6;word-break:break-word;}
.dsh-tdt-sv-assistant{align-self:stretch;font-size:14px;line-height:1.7;word-break:break-word;}
.dsh-tdt-sv-image{align-self:flex-start;font-size:12px;color:var(--dsw-alias-label-tertiary,rgba(128,128,128,.8));border:1px dashed var(--dsw-alias-border-l2,rgba(128,128,128,.35));border-radius:8px;padding:4px 10px;}
.dsh-tdt-sv-md>*:first-child{margin-top:0;}
.dsh-tdt-sv-md>*:last-child{margin-bottom:0;}
.dsh-tdt-sv-md p{margin:.5em 0;}
.dsh-tdt-sv-md h1,.dsh-tdt-sv-md h2,.dsh-tdt-sv-md h3,.dsh-tdt-sv-md h4,.dsh-tdt-sv-md h5,.dsh-tdt-sv-md h6{margin:.9em 0 .4em;font-weight:600;line-height:1.3;}
.dsh-tdt-sv-md h1{font-size:1.4em;}
.dsh-tdt-sv-md h2{font-size:1.25em;}
.dsh-tdt-sv-md h3{font-size:1.1em;}
.dsh-tdt-sv-md ul,.dsh-tdt-sv-md ol{margin:.5em 0;padding-left:1.4em;}
.dsh-tdt-sv-md li{margin:.2em 0;}
.dsh-tdt-sv-md code{font-family:var(--ds-font-family-code,ui-monospace,SFMono-Regular,Menlo,Consolas,monospace);font-size:.9em;background:var(--dsw-alias-bg-layer-2,rgba(128,128,128,.14));padding:.1em .35em;border-radius:4px;}
.dsh-tdt-sv-md pre{margin:.6em 0;background:var(--dsw-alias-bg-layer-2,rgba(128,128,128,.14));border:1px solid var(--dsw-alias-border-l2,rgba(128,128,128,.28));border-radius:8px;padding:10px 12px;overflow:auto;font-size:12px;line-height:1.5;}
.dsh-tdt-sv-md pre code{background:none;padding:0;font-size:inherit;}
.dsh-tdt-sv-md blockquote{margin:.5em 0;padding:.2em .9em;border-left:3px solid var(--dsw-alias-border-l2,rgba(128,128,128,.35));color:var(--dsw-alias-label-secondary,rgba(128,128,128,.95));}
.dsh-tdt-sv-md a{color:var(--dsw-alias-brand-primary,#2f6feb);text-decoration:none;}
.dsh-tdt-sv-md a:hover{text-decoration:underline;}
.dsh-tdt-sv-md table{border-collapse:collapse;font-size:12px;margin:.6em 0;display:block;overflow:auto;}
.dsh-tdt-sv-md th,.dsh-tdt-sv-md td{border:1px solid var(--dsw-alias-border-l2,rgba(128,128,128,.35));padding:4px 8px;text-align:left;}
.dsh-tdt-sv-md hr{border:none;border-top:1px solid var(--dsw-alias-border-l2,rgba(128,128,128,.35));margin:1em 0;}
.dsh-tdt-sv-md img{max-width:100%;}
/* 思考行（ReasoningRow.module.css 照抄：root[row]/leading/chevron/title/separator/summary/thinkBody）。 */
.dsh-tdt-sv-reasoning{flex-direction:column;display:flex;}
.dsh-tdt-sv-reasoning:not([data-expanded]){contain:size layout;height:calc(24px + var(--dsh-content-font-delta,0px));}
.dsh-tdt-sv-reasoning-row{position:relative;overflow:hidden;}
.dsh-tdt-sv-reasoning-leading{flex-shrink:0;}
.dsh-tdt-sv-reasoning-chevron{color:var(--dsw-alias-label-secondary,rgba(128,128,128,.95));}
.dsh-tdt-sv-reasoning-title{font-weight:400;}
.dsh-tdt-sv-reasoning-sep{background:var(--dsw-alias-label-caption,rgba(128,128,128,.7));border-radius:1px;flex:none;width:2px;height:2px;margin:0 8px;}
.dsh-tdt-sv-reasoning-preview{min-width:0;color:var(--dsw-alias-label-tertiary,rgba(128,128,128,.8));font-size:var(--dsh-content-font-size-secondary,13px);line-height:calc(20px + var(--dsh-content-font-delta-secondary,0px));white-space:nowrap;flex:auto;overflow:hidden;}
.dsh-tdt-sv-reasoning-preview-text{text-overflow:ellipsis;display:block;overflow:hidden;}
/* ── 工具卡（官方 ui-tool ToolRow.module.css 兜底镜像，官方类命中时 ocOr 走官方） ──
   官方行外观 = 无边框裸行（root 仅 flex column）；展开体分发链：
   TerminalBlock(∞) → DiffBlock(9) → ReadBlock(8) → ioCard 灰框（输入/分隔/输出）。 */
.dsh-tdt-sv-tool{flex-direction:column;display:flex;}
.dsh-tdt-sv-tool-row:hover .dsh-tdt-sv-tool-title,.dsh-tdt-sv-tool-row:hover .dsh-tdt-sv-tool-summary,.dsh-tdt-sv-tool-row:hover .dsh-tdt-sv-tool-suffix{color:var(--dsw-alias-label-primary,#1f2328);}
.dsh-tdt-sv-tool-title{font-weight:400;transition:color .1s;}
.dsh-tdt-sv-tool-chevron{color:var(--dsw-alias-label-secondary,rgba(128,128,128,.95));}
.dsh-tdt-sv-tool-sep{background:var(--dsw-alias-label-caption,rgba(128,128,128,.7));border-radius:1px;flex:none;width:2px;height:2px;margin:0 8px;}
.dsh-tdt-sv-tool-summary{text-overflow:ellipsis;white-space:nowrap;min-width:0;font-size:var(--dsh-content-font-size-secondary,13px);line-height:calc(24px + var(--dsh-content-font-delta,0px));color:var(--dsw-alias-label-tertiary,rgba(128,128,128,.8));flex:auto;transition:color .1s;overflow:hidden;}
.dsh-tdt-sv-tool-suffix{white-space:nowrap;font-size:var(--dsh-content-font-size-secondary,13px);line-height:calc(24px + var(--dsh-content-font-delta,0px));color:var(--dsw-alias-label-tertiary,rgba(128,128,128,.8));flex:none;margin-left:4px;transition:color .1s;}
.dsh-tdt-sv-tool-diffstat{font-family:var(--ds-font-family-code,ui-monospace,SFMono-Regular,Menlo,Consolas,monospace);font-size:calc(var(--dsh-content-font-size-secondary,13px) - 2px);color:var(--dsw-alias-label-caption,rgba(128,128,128,.7));margin-left:10px;transform:translateY(.5px);}
.dsh-tdt-sv-tool-filelink{text-overflow:ellipsis;white-space:nowrap;min-width:0;font:inherit;text-align:left;font-size:var(--dsh-content-font-size-secondary,13px);line-height:calc(24px + var(--dsh-content-font-delta,0px));color:var(--dsw-alias-label-secondary,rgba(128,128,128,.95));text-decoration:underline dotted;text-decoration-color:var(--dsw-alias-label-tertiary,rgba(128,128,128,.8));text-underline-offset:3px;cursor:pointer;background:0 0;border:none;flex:0 auto;margin:0;padding:0;text-decoration-thickness:1px;transition:color .1s;overflow:hidden;}
.dsh-tdt-sv-tool-filelink:hover{color:var(--dsw-alias-label-primary,#1f2328);text-decoration-color:currentColor;}
.dsh-tdt-sv-tool-errmark{color:var(--dsw-alias-state-error-primary,#e5484d);}
.dsh-tdt-sv-tool-stopmark{color:var(--dsw-alias-state-warn-label,#f5a623);}
.dsh-tdt-sv-tool-bodywrap{flex-direction:column;display:flex;}
.dsh-tdt-sv-io-card{border:.5px solid var(--dsw-alias-border-l1,rgba(128,128,128,.24));border-radius:var(--dsw-radius-lg,10px);background:var(--dsw-alias-markdown-code-block,rgba(128,128,128,.10));font:var(--dsw-font-markdown-code-block-small,12px/18px var(--ds-font-family-code,ui-monospace,SFMono-Regular,Menlo,Consolas,monospace));flex-direction:column;margin:4px 0 4px 4px;display:flex;}
.dsh-tdt-sv-io-section{grid-template-columns:max-content 1fr;align-items:baseline;column-gap:14px;max-height:150px;padding:12px 16px;display:grid;overflow-y:auto;}
.dsh-tdt-sv-io-label{color:var(--dsw-alias-label-caption,rgba(128,128,128,.7));align-self:start;position:sticky;top:0;}
.dsh-tdt-sv-io-divider{background:var(--dsw-alias-border-l2,rgba(128,128,128,.35));flex:none;height:.5px;}
.dsh-tdt-sv-io-text{white-space:pre-wrap;word-break:break-word;min-width:0;color:var(--dsw-alias-label-secondary,rgba(128,128,128,.95));}
.dsh-tdt-sv-io-text[data-error]{color:var(--dsw-alias-state-error-primary,#e5484d);}
.dsh-tdt-sv-tool-block{margin:4px 0 4px 4px;}
.dsh-tdt-sv-tool-terminal{--dsl-terminal-font:var(--dsw-font-markdown-code-block-small,12px/18px var(--ds-font-family-code,ui-monospace,SFMono-Regular,Menlo,Consolas,monospace));--dsl-terminal-line-height:18px;--dsl-terminal-output-max-height:224px;border:.5px solid var(--dsw-alias-border-l1,rgba(128,128,128,.24));margin:4px 0 4px 4px;}
.dsh-tdt-sv-reasoning:not([data-preview]) .dsh-tdt-sv-reasoning-sep,.dsh-tdt-sv-reasoning:not([data-preview]) .dsh-tdt-sv-reasoning-preview{display:none;}
.dsh-tdt-sv-reasoning-body{padding:4px 0 4px calc(22px + var(--dsh-content-font-delta,0px));min-width:0;}
.dsh-tdt-sv-notice{align-self:center;font-size:12px;color:var(--dsw-alias-label-tertiary,rgba(128,128,128,.8));padding:2px 8px;}
.dsh-tdt-sv-hint{font-size:12px;color:var(--dsw-alias-label-secondary,rgba(128,128,128,.95));text-align:center;padding:12px 0;}
/* ── 里程碑 15 新增：触发行 / 尾部操作行 / 用量 pill / 明细弹层（官方类缺失时的兜底） ── */
.dsh-tdt-sv-process:disabled{cursor:default;}
.dsh-tdt-sv-trigger{align-self:stretch;background:var(--dsw-alias-markdown-code-block,rgba(128,128,128,.10));border:.5px solid var(--dsw-alias-border-l1,rgba(128,128,128,.24));border-radius:var(--dsw-radius-xl,12px);transition:background .1s;}
.dsh-tdt-sv-trigger:hover{background:var(--dsw-alias-interactive-bg-hover,rgba(128,128,128,.16));}
.dsh-tdt-sv-trigger-header{display:flex;align-items:center;gap:10px;width:100%;padding:12px 16px;background:0 0;border:none;cursor:pointer;color:inherit;font:inherit;text-align:left;}
.dsh-tdt-sv-trigger-icon{display:inline-flex;align-items:center;color:var(--dsw-alias-label-tertiary,rgba(128,128,128,.8));flex:none;}
.dsh-tdt-sv-trigger-title{font-size:var(--dsw-font-xs-13,13px);color:var(--dsw-alias-label-primary,#1f2328);min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;}
.dsh-tdt-sv-trigger-time{margin-left:auto;font-size:var(--dsw-font-xxs-12,12px);color:var(--dsw-alias-label-caption,rgba(128,128,128,.7));white-space:nowrap;}
.dsh-tdt-sv-trigger-chevron{flex:none;color:var(--dsw-alias-label-caption,rgba(128,128,128,.7));transition:transform .1s;}
.dsh-tdt-sv-trigger-chevron-open{flex:none;color:var(--dsw-alias-label-caption,rgba(128,128,128,.7));transform:rotate(180deg);}
.dsh-tdt-sv-trigger-body{padding:0 16px 12px 40px;}
.dsh-tdt-sv-trigger-explanation{margin:8px 0 0;font-size:12px;color:var(--dsw-alias-label-tertiary,rgba(128,128,128,.8));}
.dsh-tdt-sv-trigger-content{margin-top:6px;font-size:13px;line-height:1.6;color:var(--dsw-alias-label-secondary,rgba(128,128,128,.95));white-space:pre-wrap;word-break:break-word;max-height:240px;overflow:auto;}
.dsh-tdt-sv-tail{display:flex;flex-direction:column;gap:16px;}
.dsh-tdt-sv-tail-actions{margin-top:4px;margin-left:-6px;}
.dsh-tdt-sv-clock{font-size:12px;color:var(--dsw-alias-label-tertiary,rgba(128,128,128,.8));white-space:nowrap;}
.dsh-tdt-sv-endinfo{display:inline-flex;align-items:center;gap:8px;margin-left:8px;}
.dsh-tdt-sv-usage{display:inline-flex;align-items:center;}
.dsh-tdt-sv-usage-trigger{display:inline-flex;align-items:center;gap:4px;appearance:none;background:0 0;border:none;cursor:pointer;padding:0 4px;font:inherit;font-size:12px;color:var(--dsw-alias-label-tertiary,rgba(128,128,128,.8));}
.dsh-tdt-sv-usage-trigger:hover{color:var(--dsw-alias-label-primary,#1f2328);}
.dsh-tdt-sv-stats{position:fixed;z-index:1200;min-width:200px;max-width:min(440px,calc(100vw - 24px));background:var(--dsw-alias-bg-layer-1,rgba(30,30,30,.98));border:1px solid var(--dsw-alias-border-l2,rgba(128,128,128,.35));border-radius:12px;box-shadow:var(--dsw-shadow-lv3,0 12px 32px rgba(0,0,0,.4));padding:12px;font-size:12px;color:var(--dsw-alias-label-primary,#1f2328);}
.dsh-tdt-sv-stats-title{display:flex;align-items:center;justify-content:space-between;gap:12px;}
.dsh-tdt-sv-stats-titlelabel{display:inline-flex;align-items:center;gap:6px;color:var(--dsw-alias-label-secondary,rgba(128,128,128,.95));}
.dsh-tdt-sv-stats-titlevalue{font-variant-numeric:tabular-nums;}
.dsh-tdt-sv-stats-rule{height:1px;background:var(--dsw-alias-border-l2,rgba(128,128,128,.35));margin:8px 0;}
.dsh-tdt-sv-stats-details{display:grid;grid-template-columns:auto 1fr;gap:4px 12px;margin:0;}
.dsh-tdt-sv-stats-details dt{color:var(--dsw-alias-label-tertiary,rgba(128,128,128,.8));}
.dsh-tdt-sv-stats-details dd{margin:0;text-align:right;font-variant-numeric:tabular-nums;}
.dsh-tdt-sv-stats-route{word-break:break-all;}
.dsh-tdt-sv-stats-reasoning{color:var(--dsw-alias-label-tertiary,rgba(128,128,128,.8));}
/* ── 过程分组（二级收折，ChatGroupSeat.module.css 照抄：root/title/leading/activityIcon/chevron/label/body/content/fade） ── */
.dsh-tdt-sv-group{min-width:0;}
.dsh-tdt-sv-group-title{max-width:100%;color:var(--dsw-alias-label-secondary,rgba(128,128,128,.95));font:inherit;font-size:var(--dsh-content-font-size,14px);text-align:left;cursor:pointer;background:0 0;border:0;align-items:center;gap:6px;padding:0;transition:color .1s;display:flex;}
.dsh-tdt-sv-group-title:hover{color:var(--dsw-alias-label-primary,#1f2328);}
.dsh-tdt-sv-group-leading{width:16px;height:16px;color:var(--dsw-alias-label-tertiary,rgba(128,128,128,.8));flex:none;justify-content:center;align-items:center;display:inline-flex;position:relative;}
.dsh-tdt-sv-group-icon,.dsh-tdt-sv-group-chevron{justify-content:center;align-items:center;transition:opacity .1s;display:inline-flex;position:absolute;inset:0;}
.dsh-tdt-sv-group-icon{opacity:1;}
.dsh-tdt-sv-group-chevron{opacity:0;}
.dsh-tdt-sv-group-title:hover .dsh-tdt-sv-group-icon,.dsh-tdt-sv-group-title:focus-visible .dsh-tdt-sv-group-icon{opacity:0;}
.dsh-tdt-sv-group-title:hover .dsh-tdt-sv-group-chevron,.dsh-tdt-sv-group-title:focus-visible .dsh-tdt-sv-group-chevron{opacity:1;}
.dsh-tdt-sv-group-title[aria-expanded=true] .dsh-tdt-sv-group-icon{opacity:0;}
.dsh-tdt-sv-group-title[aria-expanded=true] .dsh-tdt-sv-group-chevron{opacity:1;}
.dsh-tdt-sv-group-title[aria-expanded=true]{padding-bottom:16px;}
.dsh-tdt-sv-group-body{--dsh-chat-flow-gap:8px;overscroll-behavior-y:auto;scrollbar-gutter:stable;max-height:min(400px,50vh);overflow-y:auto;}
.dsh-tdt-sv-group-label{text-overflow:ellipsis;white-space:nowrap;min-width:0;overflow:hidden;}
.dsh-tdt-sv-group-fade-top{mask-image:linear-gradient(#0000 0,#000 24px 100%);}
.dsh-tdt-sv-group-fade-bottom{mask-image:linear-gradient(#000 0 calc(100% - 24px),#0000 100%);}
.dsh-tdt-sv-group-fade-top.dsh-tdt-sv-group-fade-bottom{mask-image:linear-gradient(#0000 0,#000 24px calc(100% - 24px),#0000 100%);}
.dsh-tdt-sv-group-content{flex-direction:column;display:flex;}
.dsh-tdt-sv-group-content>*{flex-shrink:0;}
.dsh-tdt-sv-group-content>:not([hidden]):not(:empty)~:not([hidden]):not(:empty){margin-top:var(--dsh-chat-flow-gap,8px);}
.dsh-tdt-sv-group-expanded{--dsh-chat-flow-gap:16px;scrollbar-gutter:auto;max-height:none;overflow:visible;}
/* U10 继续对话（开分支）：头部按钮组 + 确认框。确认框 = 官方 primitives Modal + Button
   （portal 到 body，与本弹窗同 z-index 层、后挂载居上），此处只留头部钮规格与 Modal 内错误行。 */
.dsh-tdt-sv-headerbtns{display:flex;align-items:center;gap:8px;flex:none;}
/* 分支钮对齐官方 outline 小钮（Button.module.css .sm：28 高、radius-sm、0.5px border-l3、12/18 字、padding 0 10px）。 */
.dsh-tdt-sv-branch{appearance:none;font:inherit;font-size:12px;line-height:18px;height:28px;cursor:pointer;display:inline-flex;align-items:center;gap:4px;color:var(--dsw-alias-label-primary,#1f2328);background:transparent;border:.5px solid var(--dsw-alias-border-l3,rgba(128,128,128,.4));border-radius:var(--dsw-radius-sm,6px);padding:0 10px;transition:background var(--ds-transition-duration,.15s) var(--ds-ease-in-out,ease);}
.dsh-tdt-sv-branch:hover{background:var(--dsw-alias-interactive-bg-hover,rgba(128,128,128,.16));}
.dsh-tdt-sv-branch:disabled{opacity:.4;cursor:not-allowed;}
/* 官方 Modal 卡片宽（RiskConfirmation 同款 min(440px,100%)；我方样式后注入，同特异性覆盖 .dialog 的 380px）。 */
.dsh-tdt-sv-forkmodal{width:min(440px,100%);}
/* Modal body 内错误行：官方 error 变量（明暗自适应）。 */
.dsh-tdt-sv-forkerr{margin:0;font-size:14px;line-height:22px;color:var(--dsw-alias-state-error-primary,#e5484d);word-break:break-word;}
/* ── 重试/轮次失败/限长三件套兜底（官方 MessageItem.module.css 逐值照抄，官方类缺失时生效） ── */
.dsh-tdt-sv-retry{color:var(--dsw-alias-label-tertiary,rgba(128,128,128,.8));font-size:var(--dsh-content-font-size-secondary,13px);line-height:calc(20px + var(--dsh-content-font-delta-secondary,0px));}
.dsh-tdt-sv-retry-summary{border-radius:var(--dsw-radius-sm,6px);width:fit-content;color:inherit;cursor:pointer;user-select:none;align-items:center;gap:7px;padding:2px 0;list-style:none;display:inline-flex;}
.dsh-tdt-sv-retry-summary::-webkit-details-marker{display:none;}
.dsh-tdt-sv-retry-summary:after{content:"";opacity:.8;border-bottom:1.5px solid;border-right:1.5px solid;width:6px;height:6px;transition:transform .12s;transform:rotate(-45deg);}
.dsh-tdt-sv-retry-summary:hover{color:var(--dsw-alias-label-secondary,rgba(128,128,128,.95));}
.dsh-tdt-sv-retry-summary:focus-visible{outline:1.5px solid var(--dsw-focus-ring-color,var(--dsw-alias-state-business-primary,#4c6bff));outline-offset:2px;}
.dsh-tdt-sv-retry-text{color:inherit;}
.dsh-tdt-sv-retry[data-active] .dsh-tdt-sv-retry-text{background:linear-gradient(90deg,var(--dsw-alias-label-tertiary,rgba(128,128,128,.8)) 0%,var(--dsw-alias-label-tertiary,rgba(128,128,128,.8)) 40%,var(--dsw-alias-label-secondary,rgba(128,128,128,.95)) 50%,var(--dsw-alias-label-tertiary,rgba(128,128,128,.8)) 60%,var(--dsw-alias-label-tertiary,rgba(128,128,128,.8)) 100%);color:#0000;background-position:100%;background-size:200% 100%;background-clip:text;animation:1.6s ease-in-out infinite dsh-tdt-retry-shimmer;}
@keyframes dsh-tdt-retry-shimmer{0%{background-position:100%}to{background-position:0}}
@media (prefers-reduced-motion:reduce){.dsh-tdt-sv-retry[data-active] .dsh-tdt-sv-retry-text{color:inherit;background:0 0;animation:none;}}
.dsh-tdt-sv-retry[open] .dsh-tdt-sv-retry-summary:after{transform:rotate(45deg);}
.dsh-tdt-sv-retry-details{overflow-wrap:anywhere;font-size:var(--dsh-content-font-size-secondary,13px);line-height:calc(18px + var(--dsh-content-font-delta-secondary,0px));gap:2px;margin-top:3px;padding-left:14px;display:grid;}
.dsh-tdt-sv-retry-label{color:var(--dsw-alias-label-secondary,rgba(128,128,128,.95));}
.dsh-tdt-sv-turnerr{font-size:var(--dsh-content-font-size-secondary,13px);line-height:calc(20px + var(--dsh-content-font-delta-secondary,0px));grid-template-columns:10px minmax(0,1fr) auto;align-items:start;gap:8px;padding:2px 0;display:grid;}
.dsh-tdt-sv-turnerr-dot{margin-top:5px;}
.dsh-tdt-sv-turnerr-copy{overflow-wrap:anywhere;min-width:0;}
.dsh-tdt-sv-turnerr-title{color:var(--dsw-alias-state-error-primary,#e5484d);margin-right:6px;font-weight:600;}
.dsh-tdt-sv-turnerr-msg{color:var(--dsw-alias-label-secondary,rgba(128,128,128,.95));}
.dsh-tdt-sv-turnerr-code{color:var(--dsw-alias-label-tertiary,rgba(128,128,128,.8));font:var(--dsw-font-markdown-code-block-small,12px/18px var(--ds-font-family-code,ui-monospace,SFMono-Regular,Menlo,Consolas,monospace));}
.dsh-tdt-sv-turnerr-warn{color:var(--dsw-alias-state-warn-primary,#f5a623);margin-right:6px;font-weight:600;}

/* ── U11 产出物预览：弹窗内右侧分栏（决策 39：分栏推压，弃「弹窗摞弹窗」） ── */
.dsh-tdt-sv-split{flex:1;min-height:0;display:flex;overflow:hidden;}
.dsh-tdt-sv-chatpane{flex:1;min-width:0;display:flex;flex-direction:column;overflow:hidden;}
.dsh-tdt-sv-chatpane>.dsh-tdt-sv-frame{flex:1;min-height:0;}
.dsh-tdt-sv-preview{flex:0 0 auto;width:min(520px,48%);min-width:280px;min-height:0;display:flex;flex-direction:column;border-left:1px solid var(--dsw-alias-border-l2,rgba(128,128,128,.35));background:var(--dsw-alias-bg-base,#1a1a1a);}
.dsh-tdt-sv-preview-head{flex:none;display:flex;align-items:center;gap:8px;padding:10px 14px;border-bottom:1px solid var(--dsw-alias-border-l2,rgba(128,128,128,.35));}
.dsh-tdt-sv-preview-label{flex:none;font-size:12px;color:var(--dsw-alias-label-tertiary,rgba(128,128,128,.8));}
.dsh-tdt-sv-preview-title{flex:1;min-width:0;font-family:var(--ds-font-family-code,ui-monospace,SFMono-Regular,Menlo,Consolas,monospace);font-size:12px;line-height:18px;color:var(--dsw-alias-label-primary,#1f2328);overflow:hidden;text-overflow:ellipsis;white-space:nowrap;}
.dsh-tdt-sv-preview-body{flex:1;min-height:0;overflow:auto;padding:12px 14px;}
.dsh-tdt-sv-preview-fill{display:flex;padding:0;overflow:hidden;}
.dsh-tdt-sv-preview-pdf{flex:1;border:none;}
.dsh-tdt-sv-preview-img{max-width:100%;display:block;margin:0 auto;}
.dsh-tdt-sv-preview-md{font-size:14px;line-height:1.7;word-break:break-word;}
.dsh-tdt-sv-preview-err{display:flex;flex-direction:column;align-items:flex-start;gap:10px;font-size:12px;line-height:1.6;color:var(--dsw-alias-label-secondary,rgba(128,128,128,.95));padding:8px 0;}
`

let injected = false

/**
 * 幂等注入样式（一次挂入 document.head）。SSR / 无 document 环境静默跳过。
 * 宿主升级换 token 名时，未命中的变量回退到兜底值（仍可读、不崩）。
 */
export function ensureArchiveSessionStyle(): void {
  if (injected) return
  injected = true
  if (typeof document === 'undefined') return
  if (document.getElementById(SV_STYLE_ID) !== null) return
  const el = document.createElement('style')
  el.id = SV_STYLE_ID
  el.textContent = ARCHIVE_SESSION_CSS
  document.head.appendChild(el)
}
