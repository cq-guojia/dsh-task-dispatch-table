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
/* 弹窗让位预览 dock：右侧留出 --dsh-tdt-preview-w（缺省 0）⇒ 弹窗不被预览面遮盖，
   与整页共用同一个预览面（用户 2026-09-28 拍板，docs/design/artifact-opening.md §四-C）。 */
.dsh-tdt-sv-overlay{position:fixed;top:0;left:0;bottom:0;right:var(--dsh-tdt-preview-w,0px);z-index:1000;display:flex;align-items:center;justify-content:center;background:var(--dsw-alias-bg-mask-1,rgba(0,0,0,.45));transition:right .12s var(--ds-ease-in-out,ease);}
/* 预览 dock：**占布局的分栏**（不是浮层）——它是根容器的 flex 成员，把整页真正挤窄，
   滚动条留在内容区内、不会被压住（真机 2026-09-28「弹出来后滚动条没了」的修复）；
   sticky + 100vh 让它在页面滚动时保持可见，仍占宽度。
   弹窗是全屏 fixed 层，靠上面 overlay 的 right 让位 ⇒ 弹窗不被预览面遮盖。 */
.dsh-tdt-sv-preview.dsh-tdt-sv-preview-dock{position:sticky;top:0;align-self:stretch;height:100vh;max-height:100vh;z-index:1030;width:var(--dsh-tdt-preview-w,460px);min-width:0;flex:0 0 auto;border-left:1px solid var(--dsw-alias-border-l2,rgba(128,128,128,.35));box-shadow:var(--dsw-shadow-lv3,0 12px 32px rgba(0,0,0,.4));}
/* 拖拽条（dock 左缘 6px 命中区）：光标变 col-resize 即可，**不画任何线**（用户 2026-09-28）。
   高亮 = dock 自己那条常驻 border-left（最左缘，原本灰色半透明）在 hover/拖拽时按主题色变纯色——
   完全复用原线，不新增第二条。深色纯白、浅色纯黑。用 :has() 让子 resizer 的:hover/:active
   上溯改变父 dock 的 border-left 颜色（resizer 是 dock 子元素，无父选择器，只能靠 :has）。 */
.dsh-tdt-sv-resizer{position:absolute;top:0;left:0;bottom:0;width:6px;cursor:col-resize;background:0 0;z-index:2;touch-action:none;}
.dsh-tdt-sv-preview-dock:has(.dsh-tdt-sv-resizer:hover){border-left-color:rgba(0,0,0,1);}
.dsh-tdt-sv-preview-dock:has(.dsh-tdt-sv-resizer:active){border-left-color:rgba(0,0,0,1);}
body[data-ds-dark-theme] .dsh-tdt-sv-preview-dock:has(.dsh-tdt-sv-resizer:hover){border-left-color:rgba(255,255,255,1);}
body[data-ds-dark-theme] .dsh-tdt-sv-preview-dock:has(.dsh-tdt-sv-resizer:active){border-left-color:rgba(255,255,255,1);}
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

/* ── U11 产出物预览（决策 39）：页面级 dock 预览面（弹窗与整页共用，见上方 dock 规则） ──
   旧「弹窗内右侧分栏」那两条规则已随第三轮上提删除（预览面唯一且页面级）。 */
.dsh-tdt-sv-preview{position:relative;flex:0 0 auto;width:min(520px,48%);min-width:280px;min-height:0;display:flex;flex-direction:column;border-left:1px solid var(--dsw-alias-border-l2,rgba(128,128,128,.35));background:var(--dsw-alias-bg-base,#1a1a1a);}
.dsh-tdt-sv-preview-head{flex:none;display:flex;align-items:center;gap:8px;padding:10px 14px;border-bottom:1px solid var(--dsw-alias-border-l2,rgba(128,128,128,.35));}
.dsh-tdt-sv-preview-label{flex:none;font-size:12px;color:var(--dsw-alias-label-tertiary,rgba(128,128,128,.8));}
/* 路径：超长省略（CSS ellipsis），hover 时由 JS 改为向左跑马灯（见 file-preview.tsx startMarquee）。 */
.dsh-tdt-sv-preview-title{flex:1;min-width:0;display:flex;overflow:hidden;}
.dsh-tdt-sv-preview-title-inner{font-family:var(--ds-font-family-code,ui-monospace,SFMono-Regular,Menlo,Consolas,monospace);font-size:12px;line-height:18px;color:var(--dsw-alias-label-primary,#1f2328);white-space:nowrap;overflow:hidden;text-overflow:ellipsis;cursor:default;}
/* 顶栏右侧按钮组：md 切换段 + 复制 + 刷新 + 关闭（图标钮，无中文文字）。 */
.dsh-tdt-sv-head-actions{flex:none;display:flex;align-items:center;gap:4px;}
.dsh-tdt-sv-head-btn{appearance:none;background:0 0;border:none;width:28px;height:28px;border-radius:var(--dsw-radius-sm,6px);cursor:pointer;color:var(--dsw-alias-label-secondary,rgba(128,128,128,.95));display:inline-flex;align-items:center;justify-content:center;transition:background var(--ds-transition-duration,.15s) var(--ds-ease-in-out,ease);}
.dsh-tdt-sv-head-btn:hover{background:var(--dsw-alias-interactive-bg-hover,rgba(128,128,128,.16));}
.dsh-tdt-sv-preview-body{flex:1;min-height:0;overflow-x:hidden;overflow-y:auto;padding:12px 14px;}
.dsh-tdt-sv-preview-fill{display:flex;padding:0;overflow:hidden;}
.dsh-tdt-sv-preview-pdf{flex:1;border:none;}
.dsh-tdt-sv-preview-img{max-width:100%;display:block;margin:0 auto;}
.dsh-tdt-sv-preview-md{font-size:14px;line-height:1.7;word-break:break-word;}
/* md 两态切换（用户 2026-09-28 定样式，2026-09-28 二次定：放到顶栏按钮组里）：
   官方分段控件（预览|源码），灰底圆角容器 + 选中段对比胶囊；绝对定位已废弃（不再 overlay 内容区）。 */
.dsh-tdt-sv-seg{display:inline-flex;align-items:center;gap:2px;border-radius:8px;background:var(--dsw-alias-interactive-bg,rgba(128,128,128,.14));padding:2px;}
.dsh-tdt-sv-seg-btn{appearance:none;font:inherit;font-size:12px;line-height:18px;height:20px;padding:0 10px;border:0;border-radius:6px;background:transparent;color:var(--dsw-alias-label-secondary,rgba(128,128,128,.95));cursor:pointer;white-space:nowrap;}
.dsh-tdt-sv-seg-btn:hover{color:var(--dsw-alias-label-primary,#1f2328);}
.dsh-tdt-sv-seg-btn[aria-pressed=true]{background:var(--dsw-static-neutral-00,#fff);color:var(--dsw-alias-label-primary,#1f2328);font-weight:600;box-shadow:0 1px 2px rgba(0,0,0,.18);}
body[data-ds-dark-theme] .dsh-tdt-sv-seg-btn[aria-pressed=true]{background:var(--dsw-static-neutral-900,#111);color:var(--dsw-static-neutral-00,#fff);}
/* 官方 CodeBody 外壳（renderer / code）缺失时的兜底：代码面按容器宽度布局。 */
.dsh-tdt-sv-preview-coderender{min-width:0;max-width:100%;}
.dsh-tdt-sv-preview-code{min-width:0;max-width:100%;}
/* 换行开关 **完整交回官方 CodeBlock**（源码事实，primitives@0.1.7-rc.2）：
   · 不传 wrap ⇒ 工具栏渲染换行钮，内部 localWrapped 默认 true ⇒ **默认折行**；
   · 开 = 根[data-code-wrap=true] ⇒ pre 走 white-space:pre-wrap ⇒ 折行、不溢出；
   · 关 = 根[data-code-wrap=false] ⇒ pre 走 white-space:pre ⇒ 不折行，
     由 pre 自带 overflow-x:auto 出横向滚动条（滚动口就是 pre，.content 是 display:contents）。
   ⚠️ 我方曾传 wrap:true 导致官方 omit 掉换行钮、又用 CSS 覆盖官方换行规则 ⇒ 两次弄坏它。
   现在只补两条：① pre 宽度受容器约束（折行按容器宽度发生）；② 换行开时禁用横向滚动条。
   除此之外绝不覆盖官方任何 white-space / overflow 规则。 */
.dsh-tdt-sv-preview-coderender pre{max-width:100%;}
.dsh-tdt-sv-preview-coderender [data-code-wrap='true'] pre{overflow-x:hidden;}
/* ── U11 目录浏览器（面包屑导航，2026-09-28）── */
/* 四验拍板：第一排 = 常驻图标组（下拉选层/上一层/返回）+ 面包屑区域；第二排 = 文件名 + 按钮。
   ⚠️ crumbbar 不能 overflow:hidden——下拉浮层挂在它下面，hidden 会把菜单裁没（四验真机 bug）。 */
.dsh-tdt-sv-crumbbar{position:relative;flex:none;display:flex;align-items:center;gap:2px;padding:4px 10px;border-bottom:1px solid var(--dsw-alias-border-l2,rgba(128,128,128,.35));white-space:nowrap;}
.dsh-tdt-sv-crumbs-menu-wrap{position:relative;flex:none;display:inline-flex;}
.dsh-tdt-sv-crumbs-region{position:relative;flex:1;min-width:0;display:flex;align-items:center;gap:2px;overflow:hidden;}
.dsh-tdt-sv-crumbs-measure{position:absolute;top:0;left:0;display:inline-flex;align-items:center;gap:2px;visibility:hidden;pointer-events:none;white-space:nowrap;}
.dsh-tdt-sv-crumb{appearance:none;background:0 0;border:none;padding:2px 4px;border-radius:var(--dsw-radius-sm,6px);font:inherit;font-size:12px;line-height:18px;color:var(--dsw-alias-label-secondary,rgba(128,128,128,.95));cursor:pointer;max-width:160px;overflow:hidden;text-overflow:ellipsis;}
.dsh-tdt-sv-crumb:hover{background:var(--dsw-alias-interactive-bg-hover,rgba(128,128,128,.16));color:var(--dsw-alias-label-primary,#1f2328);}
.dsh-tdt-sv-crumb-current{cursor:default;color:var(--dsw-alias-label-primary,#1f2328);font-weight:600;max-width:200px;}
.dsh-tdt-sv-crumb-current:hover{background:0 0;}
.dsh-tdt-sv-crumb-sep{flex:none;color:var(--dsw-alias-label-tertiary,rgba(128,128,128,.7));}
.dsh-tdt-sv-head-btn:disabled{opacity:.35;cursor:default;background:0 0;}
/* 下拉选层：浮层菜单列出全部层级；透明遮罩点击即收起。 */
.dsh-tdt-sv-crumbs-backdrop{position:fixed;inset:0;z-index:30;background:transparent;}
.dsh-tdt-sv-crumbs-menu{position:absolute;top:calc(100% + 4px);left:0;z-index:31;min-width:160px;max-height:240px;overflow:auto;background:var(--dsw-static-neutral-00,#fff);border:1px solid var(--dsw-alias-border-l2,rgba(128,128,128,.35));border-radius:var(--dsw-radius-md,8px);box-shadow:0 4px 16px rgba(0,0,0,.18);padding:4px;display:flex;flex-direction:column;}
body[data-ds-dark-theme] .dsh-tdt-sv-crumbs-menu{background:var(--dsw-static-neutral-900,#111);}
.dsh-tdt-sv-crumbs-menu-item{appearance:none;background:0 0;border:none;text-align:left;font:inherit;font-size:12px;line-height:20px;padding:4px 8px;border-radius:var(--dsw-radius-sm,6px);color:var(--dsw-alias-label-primary,#1f2328);cursor:pointer;max-width:280px;display:flex;align-items:center;gap:2px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;}
body[data-ds-dark-theme] .dsh-tdt-sv-crumbs-menu-item{color:var(--dsw-static-neutral-00,#fff);}
.dsh-tdt-sv-crumbs-menu-item:hover{background:var(--dsw-alias-interactive-bg-hover,rgba(128,128,128,.16));}
.dsh-tdt-sv-crumbs-menu-empty{font-size:12px;line-height:20px;padding:4px 8px;color:var(--dsw-alias-label-tertiary,rgba(128,128,128,.8));}
/* 报错页「返回」按钮（四验：停在报错页没有任何办法回去）。 */
.dsh-tdt-sv-err-actions{margin-top:12px;}
.dsh-tdt-sv-err-back{appearance:none;border:1px solid var(--dsw-alias-border-l2,rgba(128,128,128,.35));background:0 0;border-radius:var(--dsw-radius-sm,6px);font:inherit;font-size:12px;line-height:20px;padding:4px 14px;color:var(--dsw-alias-label-primary,#1f2328);cursor:pointer;}
body[data-ds-dark-theme] .dsh-tdt-sv-err-back{color:var(--dsw-static-neutral-00,#fff);}
.dsh-tdt-sv-err-back:hover{background:var(--dsw-alias-interactive-bg-hover,rgba(128,128,128,.16));}
/* 第二排：文件名（跑马灯）+ 操作按钮。 */
.dsh-tdt-sv-titlebar{flex:none;display:flex;align-items:center;gap:8px;padding:8px 14px;border-bottom:1px solid var(--dsw-alias-border-l2,rgba(128,128,128,.35));}
/* 目录树：每行 = 图标 + 名称，整行可点（目录进入 / 文件预览）。 */
.dsh-tdt-sv-tree{flex:1;min-height:0;overflow:auto;padding:6px 8px;}
.dsh-tdt-sv-tree-row{display:flex;align-items:center;gap:8px;padding:6px 8px;border-radius:var(--dsw-radius-sm,6px);cursor:pointer;user-select:none;}
.dsh-tdt-sv-tree-row:hover{background:var(--dsw-alias-interactive-bg-hover,rgba(128,128,128,.16));}
.dsh-tdt-sv-tree-row:focus-visible{outline:2px solid var(--dsw-alias-border-focus,rgba(80,140,255,.7));outline-offset:-2px;}
.dsh-tdt-sv-tree-icon{flex:none;display:inline-flex;color:var(--dsw-alias-label-secondary,rgba(128,128,128,.95));}
.dsh-tdt-sv-tree-name{flex:1;min-width:0;font-size:13px;line-height:20px;color:var(--dsw-alias-label-primary,#1f2328);overflow:hidden;text-overflow:ellipsis;white-space:nowrap;}
body[data-ds-dark-theme] .dsh-tdt-sv-tree-name{color:var(--dsw-static-neutral-00,#fff);}
.dsh-tdt-sv-tree-truncated{flex:none;padding:8px 10px;font-size:12px;color:var(--dsw-alias-label-tertiary,rgba(128,128,128,.8));}
/* 下拉选层：每层前置官方右箭头图标（方案 A），替代 ASCII 树符。 */
.dsh-tdt-sv-crumbs-chev{flex:none;color:var(--dsw-alias-label-tertiary,rgba(128,128,128,.7));margin-right:1px;}
.dsh-tdt-sv-crumbs-menu-label{flex:1;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;}
/* 目录树：行内 ▸ 开关（内联展开/收起），点它只切展开、不导航。 */
.dsh-tdt-sv-tree-toggle{appearance:none;background:0 0;border:none;flex:none;width:20px;height:20px;padding:0;margin:0;border-radius:var(--dsw-radius-sm,6px);cursor:pointer;color:var(--dsw-alias-label-secondary,rgba(128,128,128,.95));display:inline-flex;align-items:center;justify-content:center;transition:transform var(--ds-transition-duration,.15s) var(--ds-ease-in-out,ease),background var(--ds-transition-duration,.15s) var(--ds-ease-in-out,ease);}
.dsh-tdt-sv-tree-toggle:hover{background:var(--dsw-alias-interactive-bg-hover,rgba(128,128,128,.16));}
.dsh-tdt-sv-tree-toggle-open{transform:rotate(90deg);}
/* 内联展开子层：左缩进 + 淡竖线引导层级。 */
.dsh-tdt-sv-tree-children{margin-left:9px;padding-left:7px;border-left:1px solid var(--dsw-alias-border-l2,rgba(128,128,128,.28));display:flex;flex-direction:column;}
.dsh-tdt-sv-tree-loading,.dsh-tdt-sv-tree-err{padding:4px 8px 4px 36px;font-size:12px;color:var(--dsw-alias-label-tertiary,rgba(128,128,128,.8));}
.dsh-tdt-sv-tree-err{color:var(--dsw-alias-state-error-primary,#e5484d);}
.dsh-tdt-sv-preview-err{display:flex;flex-direction:column;align-items:flex-start;gap:10px;font-size:12px;line-height:1.6;color:var(--dsw-alias-label-secondary,rgba(128,128,128,.95));padding:8px 0;}
/* ── U11 交付文件（官方 ui-deliverables PresentRow.module.css / Deliverables.module.css 逐值兜底镜像） ── */
/* 交付文件行摘要：状态词 + 路径列表（官方纯文本不可点，路径可点的是下方卡片）。 */
.dsh-tdt-sv-deliv-rowsummary{min-width:0;color:var(--dsw-alias-label-secondary,rgba(128,128,128,.95));align-items:center;gap:8px;margin-left:8px;font-size:12px;display:flex;}
.dsh-tdt-sv-deliv-rowsummary>:first-child{flex-shrink:0;}
.dsh-tdt-sv-deliv-rowpaths{text-overflow:ellipsis;white-space:nowrap;overflow:hidden;}
.dsh-tdt-sv-deliv-rowoutput{border-radius:var(--dsw-radius-lg,10px);background:var(--dsw-alias-bg-layer-1,rgba(128,128,128,.10));color:var(--dsw-alias-label-secondary,rgba(128,128,128,.95));white-space:pre-wrap;overflow-wrap:anywhere;margin:8px 0;padding:12px;font-size:12px;}
/* 交付文件卡网格（root 内含 container query：≤620px 单列）。 */
.dsh-tdt-sv-deliv{--deliverable-fill:var(--dsw-static-neutral-50,#f5f5f5);--deliverable-hover:var(--dsw-static-neutral-100,#ededed);flex-direction:column;gap:16px;min-width:0;margin-top:4px;display:flex;container-type:inline-size;}
body[data-ds-dark-theme] .dsh-tdt-sv-deliv{--deliverable-fill:var(--dsw-static-neutral-850,#2a2a2a);--deliverable-hover:var(--dsw-static-neutral-800,#333);}
.dsh-tdt-sv-deliv-grid{grid-template-columns:repeat(2,minmax(0,1fr));gap:10px;min-width:0;display:grid;}
.dsh-tdt-sv-deliv-grid[data-single=true]{grid-template-columns:minmax(0,1fr);}
@container (width<=620px){.dsh-tdt-sv-deliv-grid{grid-template-columns:minmax(0,1fr);}}
.dsh-tdt-sv-deliv-file{box-sizing:border-box;border:.5px solid var(--dsw-alias-border-l1,rgba(128,128,128,.24));border-radius:var(--dsw-radius-lg,10px);background:var(--deliverable-fill);min-width:0;height:60px;color:var(--dsw-alias-label-primary,#1f2328);align-items:center;gap:10px;padding:8px 10px;transition:background-color .12s;display:flex;position:relative;overflow:hidden;}
.dsh-tdt-sv-deliv-file:hover{background:var(--deliverable-hover);}
.dsh-tdt-sv-deliv-cardpreview{z-index:1;border-radius:inherit;cursor:pointer;background:0 0;border:0;width:100%;padding:0;position:absolute;inset:0;}
.dsh-tdt-sv-deliv-cardpreview:focus-visible{box-shadow:inset 0 0 0 2px var(--dsw-focus-ring-color,var(--dsw-alias-state-business-primary,#4c6bff));outline:none;}
.dsh-tdt-sv-deliv-icon{z-index:2;box-sizing:border-box;pointer-events:none;border:.5px solid var(--dsw-alias-border-l1,rgba(128,128,128,.24));border-radius:var(--dsw-radius-lg,10px);background:color-mix(in srgb,var(--dsw-static-neutral-00,#fff) 50%,transparent);width:40px;height:40px;color:var(--dsw-alias-link,#2f6feb);flex:none;place-items:center;display:grid;position:relative;overflow:hidden;}
body[data-ds-dark-theme] .dsh-tdt-sv-deliv-icon{background:color-mix(in srgb,var(--dsw-static-neutral-00,#fff) 5%,transparent);}
.dsh-tdt-sv-deliv-body{z-index:2;pointer-events:none;flex:1;justify-content:space-between;align-items:center;gap:12px;min-width:0;display:flex;position:relative;}
.dsh-tdt-sv-deliv-details{flex-direction:column;flex:1;justify-content:center;gap:2px;min-width:0;display:flex;}
.dsh-tdt-sv-deliv-name{text-overflow:ellipsis;white-space:nowrap;font-size:13px;font-weight:500;line-height:20px;overflow:hidden;}
.dsh-tdt-sv-deliv-desc{color:var(--dsw-alias-label-tertiary,rgba(128,128,128,.8));text-overflow:ellipsis;white-space:nowrap;font-size:10px;font-weight:400;line-height:16px;overflow:hidden;}
.dsh-tdt-sv-deliv-hint,.dsh-tdt-sv-deliv-file:hover .dsh-tdt-sv-deliv-desc .dsh-tdt-sv-deliv-secondary{display:none;}
.dsh-tdt-sv-deliv-file:hover .dsh-tdt-sv-deliv-desc .dsh-tdt-sv-deliv-hint{display:inline;}
.dsh-tdt-sv-deliv-toggle{border-radius:var(--dsw-radius-sm,6px);min-width:0;color:var(--dsw-alias-label-tertiary,rgba(128,128,128,.8));cursor:pointer;font:inherit;background:0 0;border:0;align-self:center;align-items:center;gap:4px;padding:1px 11px;font-size:12px;line-height:18px;display:inline-flex;}
.dsh-tdt-sv-deliv-toggle:hover{background:var(--dsw-alias-interactive-bg-hover,rgba(128,128,128,.16));}
.dsh-tdt-sv-deliv-toggle svg{flex:none;width:14px;height:14px;}
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
