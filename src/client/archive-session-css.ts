// 归档会话弹窗样式（决策 34）：类名稳定 + 官方 design token 驱动。
//
// 交付方式说明：客户端产物是 `window.__ModuleLoader__.load({ factory })` 的 CJS 闭包，
// `import './x.css'` 只会产出独立 .css 资源、内核不会加载它 ⇒ 改为**运行时注入 <style>**
// （design 定型为 archive-session.css 文件，此处仅交付方式变更，类名/变量机制不变）。
//
// 颜色一律引用 `--tdt-*`（由 ui/tokens.ts 映射宿主变量，明/暗自动跟随，括号内为兜底值）；
// 布局 token 取聊天专属 `--dsh-chat-*`（0.1.7-RC.2 核实的真值，带兜底）。不引用任何宿主内部符号。

import { applyStyle } from './ui/style'

/** 弹窗根类名前缀（历史遗留；注入已统一走 ui/style.ts）。 */
export const SV_STYLE_ID = 'dsh-task-dispatch-table-archive-session'

/** 归档会话弹窗全部样式规则（一条 <style> 注入，见 ensureArchiveSessionStyle）。 */
export const ARCHIVE_SESSION_CSS = `
/* 弹窗让位右侧分栏：预览 dock（--dsh-tdt-preview-w）+ 编辑分栏（--dsh-tdt-editor-w，U21 起）
   两条都算进来 ⇒ 右侧留出的宽度 = 两者之和（缺省各 0），弹窗不遮盖任何一条分栏；
   两条同时开着时也是一个加法，无需特判（用户 2026-10-01 Q4）。
   与整页共用同一个预览面（用户 2026-09-28 拍板，docs/design/features/artifact-opening.md §四-C）。 */
.dsh-tdt-sv-overlay{position:fixed;top:0;left:0;bottom:0;right:calc(var(--dsh-tdt-preview-w,0px) + var(--dsh-tdt-editor-w,0px));z-index:1000;display:flex;align-items:center;justify-content:center;background:var(--tdt-mask,rgba(0,0,0,.45));transition:right .12s var(--tdt-ease,ease);}
/* 预览 dock：**占布局的分栏**（不是浮层）——它是根容器的 flex 成员，把整页真正挤窄，
   滚动条留在内容区内、不会被压住（真机 2026-09-28「弹出来后滚动条没了」的修复）；
   sticky + 100vh 让它在页面滚动时保持可见，仍占宽度。
   弹窗是全屏 fixed 层，靠上面 overlay 的 right 让位 ⇒ 弹窗不被预览面遮盖。 */
.dsh-tdt-sv-preview.dsh-tdt-sv-preview-dock{position:sticky;top:0;align-self:stretch;height:100vh;max-height:100vh;z-index:1030;width:var(--dsh-tdt-preview-w,460px);min-width:0;flex:0 0 auto;border-left:1px solid var(--tdt-border,rgba(128,128,128,.35));box-shadow:var(--tdt-shadow-2,0 12px 32px rgba(0,0,0,.4));}
/* 拖拽条（dock 左缘 6px 命中区）：光标变 col-resize，**不画任何线**（用户 2026-09-28）。
   高亮（用户 2026-09-29 改版）：与「新增任务」抽屉拖拽条（.dsh-tdt-ed-resizer，task-editor-css）
   **同一套样式与逻辑**——hover/按住时命中区自身浮出一条 6px 浅色半透明带
   （--tdt-hover），不再把 dock 的 border-left 变纯白线（旧版观感太重，已废）。 */
.dsh-tdt-sv-resizer{position:absolute;top:0;left:0;bottom:0;width:6px;cursor:col-resize;background:0 0;z-index:2;touch-action:none;user-select:none;}
.dsh-tdt-sv-resizer:hover{background:var(--tdt-hover,rgba(128,128,128,.16));}
.dsh-tdt-sv-resizer:active{background:var(--tdt-hover,rgba(128,128,128,.16));}
/* 尺寸照抄宿主「左下角弹窗」卡片（dsh-context .lc-ov-card）：width min(1120px,100vw-32px)、height 100%-80px（遮罩满屏 ⇒ 等价 100vh-80px）、radius 12px、padding 16px 18px 18px。 */
/* 面板底色 = 官方会话面 --tdt-surface-base（官方 chat 页即此色）：
   官方 ReasoningRow 展开行是 sticky + background:var(--tdt-surface-base)（ReasoningRow.module.css），
   若面板用 layer-1 会比行底色浅 ⇒ 展开思考时出现一条更黑的带（真机踩过）；统一 bg-base 即消失。 */
.dsh-tdt-sv-panel{--dsh-composer-side-clearance:18px;--dsh-chat-content-width:100%;--dsh-chat-flow-gap:16px;background:var(--tdt-surface-base,#1a1a1a);color:var(--tdt-fg,#1f2328);border:1px solid var(--tdt-border,rgba(128,128,128,.35));border-radius:var(--tdt-radius-md);box-shadow:var(--tdt-shadow-2,0 12px 32px rgba(0,0,0,.4));width:min(1120px,calc(100vw - 32px));height:calc(100% - 80px);display:flex;flex-direction:column;box-sizing:border-box;overflow:hidden;}
.dsh-tdt-sv-header{display:flex;align-items:center;justify-content:space-between;gap:12px;padding:18px 34px 12px;border-bottom:1px solid var(--tdt-border,rgba(128,128,128,.35));flex-wrap:wrap;}
/* 内间距定尺。**纵向单一真源 = .dsh-tdt-sv-frame**：
   官方 scroll 命中时自带纵向 16px，官方 frame 的纵向又不确定；不命中时官方 scroll 不存在，
   .dsh-tdt-sv-body 又会盖掉 frame 的补足（同元素、body 在后面）。⇒ 统一收口（2026-10-03）：
     · scroll 钩子把官方纵向 **归零**（双类名 0,2,0 压过 CSS module，不靠注入顺序）；
     · frame 钩子**独占**上下（用长写，不碰左右 ⇒ 命中时左右仍走官方 scroll 的 16+clearance）。
   ⇒ 命中 / 未命中两条路径纵向完全一致。
   **上 / 下 = 17px**（用户 2026-10-03：原来上下各 34 太顶，要求「最多留现在的一半」⇒ 34/2 = 17）；
   左右始终 34px，与下方会话正文**同一条左右基线**（顶部输入区不再自带左右 padding，避免双重缩进）。
   ⚠️ 上 / 下必须**相等**：否则滚动到顶 / 到底时一边空一大片、另一边一丢丢。 */
.dsh-tdt-sv-frame.dsh-tdt-sv-frame{padding-top:17px;padding-bottom:17px;}
/* 官方 scroll 命中时纵向 16px 归零，纵向交 frame 独占（见上）。左右不动。 */
.dsh-tdt-sv-scroll.dsh-tdt-sv-scroll{padding-top:0;padding-bottom:0;}
/* 会话区保底：不依赖官方类是否命中，顶部输入区再高也压不没它。
   ⚠️ 用 flex:1 1 auto 而不是 flex:1（后者 basis=0）：官方 ChatView.frame 是 flex:auto，
   本仓与官方注入顺序不定 ⇒ 取 auto 这个共同值，两边顺序颠倒也不会改变布局。 */
.dsh-tdt-sv-chat{flex:1 1 auto;min-height:0;}
.dsh-tdt-sv-heading{min-width:0;}
.dsh-tdt-sv-title{font-size:var(--tdt-font-lg);font-weight:600;color:var(--tdt-fg,#1f2328);}
.dsh-tdt-sv-sid{font-family:var(--tdt-font-mono,ui-monospace,SFMono-Regular,Menlo,Consolas,monospace);font-size:var(--tdt-font-xs);color:var(--tdt-fg-3,rgba(128,128,128,.8));word-break:break-all;}
.dsh-tdt-sv-actions{display:flex;align-items:center;gap:8px;}
/* 会话区左右边距 = 官方 ChatView.scroll：16px + --dsh-composer-side-clearance(18px) ⇒ 左右各 34px。
   **纵向不在这里**（官方类命中与否会打架，见上面 frame / scroll 两条钩子）⇒ 本类只写左右。 */
.dsh-tdt-sv-body{flex:1;min-height:0;overflow:auto;padding-left:calc(var(--dsh-composer-side-clearance,16px) + 16px);padding-right:calc(var(--dsh-composer-side-clearance,16px) + 16px);}
.dsh-tdt-sv-col{width:100%;max-width:var(--dsh-chat-content-width,920px);margin:0 auto;display:flex;flex-direction:column;gap:var(--dsh-chat-flow-gap,16px);}
/* 官方 ChatView.column 的兄弟间距（:not([hidden]) 才占位；折叠掉的过程节点不留空档）。 */
.dsh-tdt-sv-col>:not([hidden]):not(.dsh-tdt-sv-flowitem:empty)~:not([hidden]):not(.dsh-tdt-sv-flowitem:empty){margin-top:var(--dsh-chat-flow-gap,16px);}
.dsh-tdt-sv-visuallyhidden{position:absolute;width:1px;height:1px;margin:-1px;padding:0;overflow:hidden;clip:rect(0,0,0,0);white-space:nowrap;border:0;}
.dsh-tdt-sv-flowitem{min-width:0;}
.dsh-tdt-sv-older{display:flex;justify-content:center;}
.dsh-tdt-sv-older button{appearance:none;font:inherit;font-size:var(--tdt-font-sm);line-height:var(--tdt-line-sm);cursor:pointer;color:var(--tdt-fg-2,rgba(128,128,128,.9));background:var(--tdt-hover-solid,rgba(128,128,128,.2));border:none;border-radius:var(--tdt-radius-sm,6px);padding:4px 12px;}
.dsh-tdt-sv-older button:disabled{cursor:default;opacity:.6;}
.dsh-tdt-sv-process{box-sizing:border-box;width:100%;min-width:0;height:calc(33px + var(--dsh-content-font-delta,0px));border:none;border-bottom:.5px solid var(--tdt-border,rgba(128,128,128,.35));color:var(--tdt-fg-3,rgba(128,128,128,.8));cursor:pointer;text-align:left;background:0 0;align-items:center;padding:0 0 8px;transition:color .1s;display:flex;}
.dsh-tdt-sv-process:hover{color:var(--tdt-fg,#1f2328);}
.dsh-tdt-sv-process:not([data-open]){margin-bottom:8px;}
.dsh-tdt-sv-process-label{min-width:0;font-size:var(--dsh-content-font-size-secondary,13px);line-height:calc(24px + var(--dsh-content-font-delta,0px));text-overflow:ellipsis;white-space:nowrap;overflow:hidden;}
.dsh-tdt-sv-process-chevron{width:14px;height:14px;color:var(--tdt-fg-4,rgba(128,128,128,.6));flex:none;margin-left:4px;transition:transform .1s;display:inline-flex;align-items:center;justify-content:center;}
.dsh-tdt-sv-process[data-open] .dsh-tdt-sv-process-chevron{transform:rotate(180deg);}
.dsh-tdt-sv-actions{height:calc(28px + var(--dsh-content-font-delta,0px));align-items:center;gap:8px;display:flex;margin-top:4px;}
.dsh-tdt-sv-action{display:inline-flex;align-items:center;justify-content:center;width:var(--tdt-control-h-sm);height:var(--tdt-control-h-sm);color:var(--tdt-fg-3,rgba(128,128,128,.8));background:0 0;border:none;cursor:pointer;}
.dsh-tdt-sv-action:hover{color:var(--tdt-fg,#1f2328);}
.dsh-tdt-sv-user{align-self:flex-start;max-width:100%;background:var(--tdt-surface-2,rgba(128,128,128,.14));border:1px solid var(--tdt-border,rgba(128,128,128,.28));border-radius:var(--tdt-radius-md);padding:10px 14px;font-size:var(--tdt-font-lg);line-height:1.6;word-break:break-word;}
.dsh-tdt-sv-assistant{align-self:stretch;font-size:var(--tdt-font-lg);line-height:1.7;word-break:break-word;}
.dsh-tdt-sv-image{align-self:flex-start;font-size:var(--tdt-font-sm);color:var(--tdt-fg-3,rgba(128,128,128,.8));border:1px dashed var(--tdt-border,rgba(128,128,128,.35));border-radius:var(--tdt-radius-sm);padding:4px 10px;}
.dsh-tdt-sv-md>*:first-child{margin-top:0;}
.dsh-tdt-sv-md>*:last-child{margin-bottom:0;}
.dsh-tdt-sv-md p{margin:.5em 0;}
.dsh-tdt-sv-md h1,.dsh-tdt-sv-md h2,.dsh-tdt-sv-md h3,.dsh-tdt-sv-md h4,.dsh-tdt-sv-md h5,.dsh-tdt-sv-md h6{margin:.9em 0 .4em;font-weight:600;line-height:1.3;}
.dsh-tdt-sv-md h1{font-size:1.4em;}
.dsh-tdt-sv-md h2{font-size:1.25em;}
.dsh-tdt-sv-md h3{font-size:1.1em;}
.dsh-tdt-sv-md ul,.dsh-tdt-sv-md ol{margin:.5em 0;padding-left:1.4em;}
.dsh-tdt-sv-md li{margin:.2em 0;}
.dsh-tdt-sv-md code{font-family:var(--tdt-font-mono,ui-monospace,SFMono-Regular,Menlo,Consolas,monospace);font-size:.9em;background:var(--tdt-surface-2,rgba(128,128,128,.14));padding:.1em .35em;border-radius:var(--tdt-radius-xs);}
.dsh-tdt-sv-md pre{margin:.6em 0;background:var(--tdt-surface-2,rgba(128,128,128,.14));border:1px solid var(--tdt-border,rgba(128,128,128,.28));border-radius:var(--tdt-radius-sm);padding:10px 12px;overflow:auto;font-size:var(--tdt-font-sm);line-height:1.5;}
.dsh-tdt-sv-md pre code{background:none;padding:0;font-size:inherit;}
.dsh-tdt-sv-md blockquote{margin:.5em 0;padding:.2em .9em;border-left:3px solid var(--tdt-border,rgba(128,128,128,.35));color:var(--tdt-fg-2,rgba(128,128,128,.95));}
.dsh-tdt-sv-md a{color:var(--tdt-accent,#2f6feb);text-decoration:none;}
.dsh-tdt-sv-md a:hover{text-decoration:underline;}
.dsh-tdt-sv-md table{border-collapse:collapse;font-size:var(--tdt-font-sm);margin:.6em 0;display:block;overflow:auto;}
.dsh-tdt-sv-md th,.dsh-tdt-sv-md td{border:1px solid var(--tdt-border,rgba(128,128,128,.35));padding:4px 8px;text-align:left;}
.dsh-tdt-sv-md hr{border:none;border-top:1px solid var(--tdt-border,rgba(128,128,128,.35));margin:1em 0;}
.dsh-tdt-sv-md img{max-width:100%;}
/* 思考行（ReasoningRow.module.css 照抄：root[row]/leading/chevron/title/separator/summary/thinkBody）。 */
.dsh-tdt-sv-reasoning{flex-direction:column;display:flex;}
.dsh-tdt-sv-reasoning:not([data-expanded]){contain:size layout;height:calc(24px + var(--dsh-content-font-delta,0px));}
.dsh-tdt-sv-reasoning-row{position:relative;overflow:hidden;}
.dsh-tdt-sv-reasoning-leading{flex-shrink:0;}
.dsh-tdt-sv-reasoning-chevron{color:var(--tdt-fg-2,rgba(128,128,128,.95));}
.dsh-tdt-sv-reasoning-title{font-weight:400;}
.dsh-tdt-sv-reasoning-sep{background:var(--tdt-fg-4,rgba(128,128,128,.7));border-radius:1px;flex:none;width:2px;height:2px;margin:0 8px;}
.dsh-tdt-sv-reasoning-preview{min-width:0;color:var(--tdt-fg-3,rgba(128,128,128,.8));font-size:var(--dsh-content-font-size-secondary,13px);line-height:calc(20px + var(--dsh-content-font-delta-secondary,0px));white-space:nowrap;flex:auto;overflow:hidden;}
.dsh-tdt-sv-reasoning-preview-text{text-overflow:ellipsis;display:block;overflow:hidden;}
/* ── 工具卡（官方 ui-tool ToolRow.module.css 兜底镜像，官方类命中时 ocOr 走官方） ──
   官方行外观 = 无边框裸行（root 仅 flex column）；展开体分发链：
   TerminalBlock(∞) → DiffBlock(9) → ReadBlock(8) → ioCard 灰框（输入/分隔/输出）。 */
.dsh-tdt-sv-tool{flex-direction:column;display:flex;}
.dsh-tdt-sv-tool-row:hover .dsh-tdt-sv-tool-title,.dsh-tdt-sv-tool-row:hover .dsh-tdt-sv-tool-summary,.dsh-tdt-sv-tool-row:hover .dsh-tdt-sv-tool-suffix{color:var(--tdt-fg,#1f2328);}
.dsh-tdt-sv-tool-title{font-weight:400;transition:color .1s;}
.dsh-tdt-sv-tool-chevron{color:var(--tdt-fg-2,rgba(128,128,128,.95));}
.dsh-tdt-sv-tool-sep{background:var(--tdt-fg-4,rgba(128,128,128,.7));border-radius:1px;flex:none;width:2px;height:2px;margin:0 8px;}
.dsh-tdt-sv-tool-summary{text-overflow:ellipsis;white-space:nowrap;min-width:0;font-size:var(--dsh-content-font-size-secondary,13px);line-height:calc(24px + var(--dsh-content-font-delta,0px));color:var(--tdt-fg-3,rgba(128,128,128,.8));flex:auto;transition:color .1s;overflow:hidden;}
.dsh-tdt-sv-tool-suffix{white-space:nowrap;font-size:var(--dsh-content-font-size-secondary,13px);line-height:calc(24px + var(--dsh-content-font-delta,0px));color:var(--tdt-fg-3,rgba(128,128,128,.8));flex:none;margin-left:4px;transition:color .1s;}
.dsh-tdt-sv-tool-diffstat{font-family:var(--tdt-font-mono,ui-monospace,SFMono-Regular,Menlo,Consolas,monospace);font-size:calc(var(--dsh-content-font-size-secondary,13px) - 2px);color:var(--tdt-fg-4,rgba(128,128,128,.7));margin-left:10px;transform:translateY(.5px);}
.dsh-tdt-sv-tool-filelink{text-overflow:ellipsis;white-space:nowrap;min-width:0;font:inherit;text-align:left;font-size:var(--dsh-content-font-size-secondary,13px);line-height:calc(24px + var(--dsh-content-font-delta,0px));color:var(--tdt-fg-2,rgba(128,128,128,.95));text-decoration:underline dotted;text-decoration-color:var(--tdt-fg-3,rgba(128,128,128,.8));text-underline-offset:3px;cursor:pointer;background:0 0;border:none;flex:0 auto;margin:0;padding:0;text-decoration-thickness:1px;transition:color .1s;overflow:hidden;}
.dsh-tdt-sv-tool-filelink:hover{color:var(--tdt-fg,#1f2328);text-decoration-color:currentColor;}
.dsh-tdt-sv-tool-errmark{color:var(--tdt-danger,#e5484d);}
.dsh-tdt-sv-tool-stopmark{color:var(--tdt-warning-label,#f5a623);}
.dsh-tdt-sv-tool-bodywrap{flex-direction:column;display:flex;}
.dsh-tdt-sv-io-card{border:.5px solid var(--tdt-border-faint,rgba(128,128,128,.24));border-radius:var(--tdt-radius-lg,10px);background:var(--tdt-code-surface,rgba(128,128,128,.10));font:var(--tdt-code-font,12px/18px var(--tdt-font-mono,ui-monospace,SFMono-Regular,Menlo,Consolas,monospace));flex-direction:column;margin:4px 0 4px 4px;display:flex;}
.dsh-tdt-sv-io-section{grid-template-columns:max-content 1fr;align-items:baseline;column-gap:14px;max-height:150px;padding:12px 16px;display:grid;overflow-y:auto;}
.dsh-tdt-sv-io-label{color:var(--tdt-fg-4,rgba(128,128,128,.7));align-self:start;position:sticky;top:0;}
.dsh-tdt-sv-io-divider{background:var(--tdt-border,rgba(128,128,128,.35));flex:none;height:.5px;}
.dsh-tdt-sv-io-text{white-space:pre-wrap;word-break:break-word;min-width:0;color:var(--tdt-fg-2,rgba(128,128,128,.95));}
.dsh-tdt-sv-io-text[data-error]{color:var(--tdt-danger,#e5484d);}
.dsh-tdt-sv-tool-block{margin:4px 0 4px 4px;}
.dsh-tdt-sv-tool-terminal{--dsl-terminal-font:var(--tdt-code-font,12px/18px var(--tdt-font-mono,ui-monospace,SFMono-Regular,Menlo,Consolas,monospace));--dsl-terminal-line-height:var(--tdt-line-sm);--dsl-terminal-output-max-height:224px;border:.5px solid var(--tdt-border-faint,rgba(128,128,128,.24));margin:4px 0 4px 4px;}
.dsh-tdt-sv-reasoning:not([data-preview]) .dsh-tdt-sv-reasoning-sep,.dsh-tdt-sv-reasoning:not([data-preview]) .dsh-tdt-sv-reasoning-preview{display:none;}
.dsh-tdt-sv-reasoning-body{padding:4px 0 4px calc(22px + var(--dsh-content-font-delta,0px));min-width:0;}
.dsh-tdt-sv-notice{align-self:center;font-size:var(--tdt-font-sm);color:var(--tdt-fg-3,rgba(128,128,128,.8));padding:2px 8px;}
.dsh-tdt-sv-hint{font-size:var(--tdt-font-sm);color:var(--tdt-fg-2,rgba(128,128,128,.95));text-align:center;padding:12px 0;}
/* ── 里程碑 15 新增：触发行 / 尾部操作行 / 用量 pill / 明细弹层（官方类缺失时的兜底） ── */
.dsh-tdt-sv-process:disabled{cursor:default;}
.dsh-tdt-sv-trigger{align-self:stretch;background:var(--tdt-code-surface,rgba(128,128,128,.10));border:.5px solid var(--tdt-border-faint,rgba(128,128,128,.24));border-radius:var(--tdt-radius-xl,12px);transition:background .1s;}
.dsh-tdt-sv-trigger:hover{background:var(--tdt-hover,rgba(128,128,128,.16));}
.dsh-tdt-sv-trigger-header{display:flex;align-items:center;gap:10px;width:100%;padding:12px 16px;background:0 0;border:none;cursor:pointer;color:inherit;font:inherit;text-align:left;}
.dsh-tdt-sv-trigger-icon{display:inline-flex;align-items:center;color:var(--tdt-fg-3,rgba(128,128,128,.8));flex:none;}
.dsh-tdt-sv-trigger-title{font-size:var(--tdt-font-md,13px);color:var(--tdt-fg,#1f2328);min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;}
.dsh-tdt-sv-trigger-time{margin-left:auto;font-size:var(--tdt-font-sm,12px);color:var(--tdt-fg-4,rgba(128,128,128,.7));white-space:nowrap;}
.dsh-tdt-sv-trigger-chevron{flex:none;color:var(--tdt-fg-4,rgba(128,128,128,.7));transition:transform .1s;}
.dsh-tdt-sv-trigger-chevron-open{flex:none;color:var(--tdt-fg-4,rgba(128,128,128,.7));transform:rotate(180deg);}
.dsh-tdt-sv-trigger-body{padding:0 16px 12px 40px;}
.dsh-tdt-sv-trigger-explanation{margin:8px 0 0;font-size:var(--tdt-font-sm);color:var(--tdt-fg-3,rgba(128,128,128,.8));}
.dsh-tdt-sv-trigger-content{margin-top:6px;font-size:var(--tdt-font-md);line-height:1.6;color:var(--tdt-fg-2,rgba(128,128,128,.95));white-space:pre-wrap;word-break:break-word;max-height:240px;overflow:auto;}
.dsh-tdt-sv-tail{display:flex;flex-direction:column;gap:16px;}
.dsh-tdt-sv-tail-actions{margin-top:4px;margin-left:-6px;}
.dsh-tdt-sv-clock{font-size:var(--tdt-font-sm);color:var(--tdt-fg-3,rgba(128,128,128,.8));white-space:nowrap;}
.dsh-tdt-sv-endinfo{display:inline-flex;align-items:center;gap:8px;margin-left:8px;}
.dsh-tdt-sv-usage{display:inline-flex;align-items:center;}
.dsh-tdt-sv-usage-trigger{display:inline-flex;align-items:center;gap:4px;appearance:none;background:0 0;border:none;cursor:pointer;padding:0 4px;font:inherit;font-size:var(--tdt-font-sm);color:var(--tdt-fg-3,rgba(128,128,128,.8));}
.dsh-tdt-sv-usage-trigger:hover{color:var(--tdt-fg,#1f2328);}
.dsh-tdt-sv-stats{position:fixed;z-index:1200;min-width:200px;max-width:min(440px,calc(100vw - 24px));background:var(--tdt-surface-1,rgba(30,30,30,.98));border:1px solid var(--tdt-border,rgba(128,128,128,.35));border-radius:var(--tdt-radius-md);box-shadow:var(--tdt-shadow-2,0 12px 32px rgba(0,0,0,.4));padding:12px;font-size:var(--tdt-font-sm);color:var(--tdt-fg,#1f2328);}
.dsh-tdt-sv-stats-title{display:flex;align-items:center;justify-content:space-between;gap:12px;}
.dsh-tdt-sv-stats-titlelabel{display:inline-flex;align-items:center;gap:6px;color:var(--tdt-fg-2,rgba(128,128,128,.95));}
.dsh-tdt-sv-stats-titlevalue{font-variant-numeric:tabular-nums;}
.dsh-tdt-sv-stats-rule{height:1px;background:var(--tdt-border,rgba(128,128,128,.35));margin:8px 0;}
.dsh-tdt-sv-stats-details{display:grid;grid-template-columns:auto 1fr;gap:4px 12px;margin:0;}
.dsh-tdt-sv-stats-details dt{color:var(--tdt-fg-3,rgba(128,128,128,.8));}
.dsh-tdt-sv-stats-details dd{margin:0;text-align:right;font-variant-numeric:tabular-nums;}
.dsh-tdt-sv-stats-route{word-break:break-all;}
.dsh-tdt-sv-stats-reasoning{color:var(--tdt-fg-3,rgba(128,128,128,.8));}
/* ── 过程分组（二级收折，ChatGroupSeat.module.css 照抄：root/title/leading/activityIcon/chevron/label/body/content/fade） ── */
.dsh-tdt-sv-group{min-width:0;}
.dsh-tdt-sv-group-title{max-width:100%;color:var(--tdt-fg-2,rgba(128,128,128,.95));font:inherit;font-size:var(--dsh-content-font-size,14px);text-align:left;cursor:pointer;background:0 0;border:0;align-items:center;gap:6px;padding:0;transition:color .1s;display:flex;}
.dsh-tdt-sv-group-title:hover{color:var(--tdt-fg,#1f2328);}
.dsh-tdt-sv-group-leading{width:16px;height:16px;color:var(--tdt-fg-3,rgba(128,128,128,.8));flex:none;justify-content:center;align-items:center;display:inline-flex;position:relative;}
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
/* 官方 Modal 卡片宽（RiskConfirmation 同款 min(440px,100%)；我方样式后注入，同特异性覆盖 .dialog 的 380px）。 */
.dsh-tdt-sv-forkmodal{width:min(440px,100%);}
/* Modal body 内错误行：官方 error 变量（明暗自适应）。 */
.dsh-tdt-sv-forkerr{margin:0;font-size:var(--tdt-font-lg);line-height:var(--tdt-line-lg);color:var(--tdt-danger,#e5484d);word-break:break-word;}
/* ── 重试/轮次失败/限长三件套兜底（官方 MessageItem.module.css 逐值照抄，官方类缺失时生效） ── */
.dsh-tdt-sv-retry{color:var(--tdt-fg-3,rgba(128,128,128,.8));font-size:var(--dsh-content-font-size-secondary,13px);line-height:calc(20px + var(--dsh-content-font-delta-secondary,0px));}
.dsh-tdt-sv-retry-summary{border-radius:var(--tdt-radius-sm,6px);width:fit-content;color:inherit;cursor:pointer;user-select:none;align-items:center;gap:7px;padding:2px 0;list-style:none;display:inline-flex;}
.dsh-tdt-sv-retry-summary::-webkit-details-marker{display:none;}
.dsh-tdt-sv-retry-summary:after{content:"";opacity:.8;border-bottom:1.5px solid;border-right:1.5px solid;width:6px;height:6px;transition:transform .12s;transform:rotate(-45deg);}
.dsh-tdt-sv-retry-summary:hover{color:var(--tdt-fg-2,rgba(128,128,128,.95));}
.dsh-tdt-sv-retry-summary:focus-visible{outline:1.5px solid var(--tdt-focus);outline-offset:2px;}
.dsh-tdt-sv-retry-text{color:inherit;}
.dsh-tdt-sv-retry[data-active] .dsh-tdt-sv-retry-text{background:linear-gradient(90deg,var(--tdt-fg-3,rgba(128,128,128,.8)) 0%,var(--tdt-fg-3,rgba(128,128,128,.8)) 40%,var(--tdt-fg-2,rgba(128,128,128,.95)) 50%,var(--tdt-fg-3,rgba(128,128,128,.8)) 60%,var(--tdt-fg-3,rgba(128,128,128,.8)) 100%);color:#0000;background-position:100%;background-size:200% 100%;background-clip:text;animation:1.6s ease-in-out infinite dsh-tdt-retry-shimmer;}
@keyframes dsh-tdt-retry-shimmer{0%{background-position:100%}to{background-position:0}}
@media (prefers-reduced-motion:reduce){.dsh-tdt-sv-retry[data-active] .dsh-tdt-sv-retry-text{color:inherit;background:0 0;animation:none;}}
.dsh-tdt-sv-retry[open] .dsh-tdt-sv-retry-summary:after{transform:rotate(45deg);}
.dsh-tdt-sv-retry-details{overflow-wrap:anywhere;font-size:var(--dsh-content-font-size-secondary,13px);line-height:calc(18px + var(--dsh-content-font-delta-secondary,0px));gap:2px;margin-top:3px;padding-left:14px;display:grid;}
.dsh-tdt-sv-retry-label{color:var(--tdt-fg-2,rgba(128,128,128,.95));}
.dsh-tdt-sv-turnerr{font-size:var(--dsh-content-font-size-secondary,13px);line-height:calc(20px + var(--dsh-content-font-delta-secondary,0px));grid-template-columns:10px minmax(0,1fr) auto;align-items:start;gap:8px;padding:2px 0;display:grid;}
.dsh-tdt-sv-turnerr-dot{margin-top:5px;}
.dsh-tdt-sv-turnerr-copy{overflow-wrap:anywhere;min-width:0;}
.dsh-tdt-sv-turnerr-title{color:var(--tdt-danger,#e5484d);margin-right:6px;font-weight:600;}
.dsh-tdt-sv-turnerr-msg{color:var(--tdt-fg-2,rgba(128,128,128,.95));}
.dsh-tdt-sv-turnerr-code{color:var(--tdt-fg-3,rgba(128,128,128,.8));font:var(--tdt-code-font,12px/18px var(--tdt-font-mono,ui-monospace,SFMono-Regular,Menlo,Consolas,monospace));}
.dsh-tdt-sv-turnerr-warn{color:var(--tdt-warning,#f5a623);margin-right:6px;font-weight:600;}

/* ── U11 产出物预览（决策 39）：页面级 dock 预览面（弹窗与整页共用，见上方 dock 规则） ──
   旧「弹窗内右侧分栏」那两条规则已随第三轮上提删除（预览面唯一且页面级）。 */
/* 拖动调宽期间：预览体里的 <iframe>（PDF 预览）是独立文档，会吞掉父文档的 pointermove
   ⇒ 向右拖（缩小）时指针走进 PDF 就卡死（真机 2026-10-03）。拖动期间整片 iframe 让出指针事件。 */
.dsh-tdt-root.dsh-tdt-resizing iframe{pointer-events:none;}
.dsh-tdt-sv-preview{position:relative;flex:0 0 auto;width:min(520px,48%);min-width:280px;min-height:0;display:flex;flex-direction:column;border-left:1px solid var(--tdt-border,rgba(128,128,128,.35));background:var(--tdt-surface-base,#1a1a1a);}
.dsh-tdt-sv-preview-head{flex:none;display:flex;align-items:center;gap:8px;padding:10px 14px;border-bottom:1px solid var(--tdt-border,rgba(128,128,128,.35));}
.dsh-tdt-sv-preview-label{flex:none;font-size:var(--tdt-font-sm);color:var(--tdt-fg-3,rgba(128,128,128,.8));}
/* 路径 / 文件名：走全站唯一 MarqueeText（ui/MarqueeText.tsx），本类只提供**字体与字色皮肤**
   （挂在 MarqueeText 外层、内层继承）；外层裁剪与滚动由 .dsh-tdt-mq 负责。 */
.dsh-tdt-sv-preview-title-inner{font-family:var(--tdt-font-mono,ui-monospace,SFMono-Regular,Menlo,Consolas,monospace);font-size:var(--tdt-font-sm);line-height:var(--tdt-line-sm);color:var(--tdt-fg,#1f2328);white-space:nowrap;overflow:hidden;text-overflow:ellipsis;cursor:default;}
/* 顶栏右侧按钮组：md 切换段 + 复制 + 刷新 + 关闭（图标钮，无中文文字）。 */
.dsh-tdt-sv-head-actions{flex:none;display:flex;align-items:center;gap:4px;}
.dsh-tdt-sv-head-btn{appearance:none;background:0 0;border:none;width:var(--tdt-control-h-md);height:var(--tdt-control-h-md);border-radius:var(--tdt-radius-sm,6px);cursor:pointer;color:var(--tdt-fg-2,rgba(128,128,128,.95));display:inline-flex;align-items:center;justify-content:center;transition:background var(--tdt-dur,.15s) var(--tdt-ease,ease);}
.dsh-tdt-sv-head-btn:hover{background:var(--tdt-hover,rgba(128,128,128,.16));}
.dsh-tdt-sv-preview-body{flex:1;min-height:0;overflow-x:hidden;overflow-y:auto;padding:12px 14px;}
.dsh-tdt-sv-preview-fill{display:flex;padding:0;overflow:hidden;}
.dsh-tdt-sv-preview-pdf{flex:1;border:none;}
.dsh-tdt-sv-preview-img{max-width:100%;display:block;margin:0 auto;}
.dsh-tdt-sv-preview-md{font-size:var(--tdt-font-lg);line-height:1.7;word-break:break-word;}

/* 官方 CodeBody 外壳（renderer / code）缺失时的兜底：代码面按容器宽度布局。
   ⚠️ ocOr 语义 = 官方类命中时我方兜底类**不挂**（officialClass ?? fallback，两者只取其一）
   ⇒ 作用域一律用 [data-code-preview]：官方 CodeBody（client.js:5042）与我方兜底 div
   都带这个属性，两条路都命中——此前把规则写在 .dsh-tdt-sv-preview-coderender 下，
   官方类命中时全是死规则（2026-09-29 源码排障结论）。 */
.dsh-tdt-sv-preview-coderender{min-width:0;max-width:100%;}
.dsh-tdt-sv-preview-code{min-width:0;max-width:100%;}
/* 换行开关（源码事实，0.1.7-rc.2 三包对照，2026-09-29）：
   · primitives CodeBlock：换行钮只在 wrap === undefined 时渲染（lib/index.js:10689 的
     onWrap 分支 + :9285），点钮翻转 CodeBlock 根上的 data-code-wrap；
     但 primitives 自己**没有任何 CSS 消费 CodeBlock 的 data-code-wrap**（换行规则只在
     DiffBlock/ReadBlock 模块里）。
   · ui-sidebar-documentpreview CodeBody.module.css：对 .code pre **强制 white-space:pre
     （默认不折行）**，只有 .renderer[data-wrap=true] 才放开为 pre-wrap——而 data-wrap 是
     官方预览面板持有状态后下传的（register({wrap:true}) + CodeBody 的 data-wrap 属性），
     我方从不设 ⇒ 官方这条 pre 恒生效 ⇒ 点工具条换行钮永远不折行（两轮没修好的真根因）。
   ⇒ 修法 = 用 [data-code-preview] + CodeBlock 自身的 [data-code-wrap='true'] 复刻官方
     [data-wrap=true] 的同款放开规则；特异性 (0,3,·) 压过官方 (0,2,·)。换行关 = 官方默认
     （pre 不折行 + content overflow:auto ⇒ 横向滚动条；用户 2026-09-29 认可关态有滚动条）。 */
[data-code-preview] [data-code-wrap='true'] [data-code-block-content]{--dsl-code-block-line-white-space:pre-wrap;overflow-x:hidden;}
[data-code-preview] [data-code-wrap='true'] [data-code-block-content] pre{white-space:pre-wrap;overflow-wrap:anywhere;}
/* ── U11 目录浏览器（面包屑导航，2026-09-28）── */
/* 四验拍板：第一排 = 常驻图标组（下拉选层/上一层/返回）+ 面包屑区域；第二排 = 文件名 + 按钮。
   ⚠️ crumbbar 不能 overflow:hidden——下拉浮层挂在它下面，hidden 会把菜单裁没（四验真机 bug）。 */
.dsh-tdt-sv-crumbbar{position:relative;flex:none;display:flex;align-items:center;gap:2px;padding:4px 10px;border-bottom:1px solid var(--tdt-border,rgba(128,128,128,.35));white-space:nowrap;}
.dsh-tdt-sv-crumbs-menu-wrap{position:relative;flex:none;display:inline-flex;}
.dsh-tdt-sv-crumbs-region{position:relative;flex:1;min-width:0;display:flex;align-items:center;gap:2px;overflow:hidden;}
.dsh-tdt-sv-crumbs-measure{position:absolute;top:0;left:0;display:inline-flex;align-items:center;gap:2px;visibility:hidden;pointer-events:none;white-space:nowrap;}
.dsh-tdt-sv-crumb{appearance:none;background:0 0;border:none;padding:2px 4px;border-radius:var(--tdt-radius-sm,6px);font:inherit;font-size:var(--tdt-font-sm);line-height:var(--tdt-line-sm);color:var(--tdt-fg-2,rgba(128,128,128,.95));cursor:pointer;max-width:160px;overflow:hidden;text-overflow:ellipsis;}
.dsh-tdt-sv-crumb:hover{background:var(--tdt-hover,rgba(128,128,128,.16));color:var(--tdt-fg,#1f2328);}
.dsh-tdt-sv-crumb-current{cursor:default;color:var(--tdt-fg,#1f2328);font-weight:600;max-width:200px;}
.dsh-tdt-sv-crumb-current:hover{background:0 0;}
.dsh-tdt-sv-crumb-sep{flex:none;color:var(--tdt-fg-3,rgba(128,128,128,.7));}
/* 工作区之外的只读完整路径（用户 2026-10-03）：**不可点**（无导航），但过长仍走
   MarqueeText 跑马灯（用户验收点正：「啪-啪-灯」= 跑马灯）。本类只提供**字体与字色皮肤**，
   裁剪与滚动由 .dsh-tdt-mq 负责。 */
.dsh-tdt-sv-crumbbar-plain-inner{font-family:var(--tdt-font-mono,ui-monospace,SFMono-Regular,Menlo,Consolas,monospace);font-size:var(--tdt-font-sm);line-height:var(--tdt-line-sm);color:var(--tdt-fg-2,rgba(128,128,128,.95));white-space:nowrap;overflow:hidden;text-overflow:ellipsis;cursor:default;user-select:none;}
.dsh-tdt-sv-head-btn:disabled{opacity:.35;cursor:default;background:0 0;}
/* 下拉选层：浮层菜单列出全部层级；透明遮罩点击即收起。 */
.dsh-tdt-sv-crumbs-backdrop{position:fixed;inset:0;z-index:30;background:transparent;}
.dsh-tdt-sv-crumbs-menu{position:absolute;top:calc(100% + 4px);left:0;z-index:31;min-width:160px;max-height:240px;overflow:auto;background:var(--tdt-surface-1);border:1px solid var(--tdt-border);border-radius:var(--tdt-radius-sm);box-shadow:0 4px 16px rgba(0,0,0,.18);padding:4px;display:flex;flex-direction:column;}
.dsh-tdt-sv-crumbs-menu-item{appearance:none;background:0 0;border:none;text-align:left;font:inherit;font-size:var(--tdt-font-sm);line-height:var(--tdt-line-md);padding:4px 8px;border-radius:var(--tdt-radius-sm);color:var(--tdt-fg);cursor:pointer;max-width:280px;display:flex;align-items:center;gap:2px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;}
.dsh-tdt-sv-crumbs-menu-item:hover{background:var(--tdt-hover,rgba(128,128,128,.16));}
.dsh-tdt-sv-crumbs-menu-empty{font-size:var(--tdt-font-sm);line-height:var(--tdt-line-md);padding:4px 8px;color:var(--tdt-fg-3,rgba(128,128,128,.8));}
/* 报错页「返回」按钮（四验：停在报错页没有任何办法回去）。 */
.dsh-tdt-sv-err-actions{margin-top:12px;}
/* 第二排：文件名（跑马灯）+ 操作按钮。 */
.dsh-tdt-sv-titlebar{flex:none;display:flex;align-items:center;gap:8px;padding:8px 14px;border-bottom:1px solid var(--tdt-border,rgba(128,128,128,.35));}
/* 目录树：每行 = 图标 + 名称，整行可点（目录进入 / 文件预览）。 */
.dsh-tdt-sv-tree{flex:1;min-height:0;overflow:auto;padding:6px 8px;}
.dsh-tdt-sv-tree-row{display:flex;align-items:center;gap:8px;padding:6px 8px;border-radius:var(--tdt-radius-sm,6px);cursor:pointer;user-select:none;}
.dsh-tdt-sv-tree-row:hover{background:var(--tdt-hover,rgba(128,128,128,.16));}
.dsh-tdt-sv-tree-row:focus-visible{outline:2px solid var(--tdt-focus);outline-offset:-2px;}
.dsh-tdt-sv-tree-icon{flex:none;display:inline-flex;color:var(--tdt-fg-2,rgba(128,128,128,.95));}
.dsh-tdt-sv-tree-name{flex:1;min-width:0;font-size:var(--tdt-font-md);line-height:var(--tdt-line-md);color:var(--tdt-fg);overflow:hidden;text-overflow:ellipsis;white-space:nowrap;}
.dsh-tdt-sv-tree-truncated{flex:none;padding:8px 10px;font-size:var(--tdt-font-sm);color:var(--tdt-fg-3,rgba(128,128,128,.8));}
/* 下拉选层：每行只显示一个右箭头（画在原第 index 位），行首 (index-1) 个箭头位
   空出但占位（宽度与箭头一致），保持层级缩进（用户 2026-09-29）。 */
.dsh-tdt-sv-crumbs-chev{flex:none;color:var(--tdt-fg-3,rgba(128,128,128,.7));margin-right:1px;}
.dsh-tdt-sv-crumbs-chev-slot{flex:none;width:11px;height:11px;margin-right:1px;}
.dsh-tdt-sv-crumbs-menu-label{flex:1;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;}
/* 目录树：行内 ▸ 开关（内联展开/收起），点它只切展开、不导航。 */
.dsh-tdt-sv-tree-toggle{appearance:none;background:0 0;border:none;flex:none;width:20px;height:20px;padding:0;margin:0;border-radius:var(--tdt-radius-sm,6px);cursor:pointer;color:var(--tdt-fg-2,rgba(128,128,128,.95));display:inline-flex;align-items:center;justify-content:center;transition:transform var(--tdt-dur,.15s) var(--tdt-ease,ease),background var(--tdt-dur,.15s) var(--tdt-ease,ease);}
.dsh-tdt-sv-tree-toggle:hover{background:var(--tdt-hover,rgba(128,128,128,.16));}
.dsh-tdt-sv-tree-toggle-open{transform:rotate(90deg);}
/* 内联展开子层：左缩进 + 淡竖线引导层级。 */
.dsh-tdt-sv-tree-children{margin-left:9px;padding-left:7px;border-left:1px solid var(--tdt-border,rgba(128,128,128,.28));display:flex;flex-direction:column;}
.dsh-tdt-sv-tree-loading,.dsh-tdt-sv-tree-err{padding:4px 8px 4px 36px;font-size:var(--tdt-font-sm);color:var(--tdt-fg-3,rgba(128,128,128,.8));}
.dsh-tdt-sv-tree-err{color:var(--tdt-danger,#e5484d);}
.dsh-tdt-sv-preview-err{display:flex;flex-direction:column;align-items:flex-start;gap:10px;font-size:var(--tdt-font-sm);line-height:1.6;color:var(--tdt-fg-2,rgba(128,128,128,.95));padding:8px 0;}
/* ── U11 交付文件（官方 ui-deliverables PresentRow.module.css / Deliverables.module.css 逐值兜底镜像） ── */
/* 交付文件行摘要：状态词 + 路径列表（官方纯文本不可点，路径可点的是下方卡片）。 */
.dsh-tdt-sv-deliv-rowsummary{min-width:0;color:var(--tdt-fg-2,rgba(128,128,128,.95));align-items:center;gap:8px;margin-left:8px;font-size:var(--tdt-font-sm);display:flex;}
.dsh-tdt-sv-deliv-rowsummary>:first-child{flex-shrink:0;}
.dsh-tdt-sv-deliv-rowpaths{text-overflow:ellipsis;white-space:nowrap;overflow:hidden;}
.dsh-tdt-sv-deliv-rowoutput{border-radius:var(--tdt-radius-md);background:var(--tdt-surface-1);color:var(--tdt-fg-2);white-space:pre-wrap;overflow-wrap:anywhere;margin:8px 0;padding:12px;font-size:var(--tdt-font-sm);}
/* 交付文件卡网格（root 内含 container query：≤620px 单列）。 */
.dsh-tdt-sv-deliv{--deliverable-fill:var(--tdt-plate);--deliverable-hover:var(--tdt-plate-hover);flex-direction:column;gap:16px;min-width:0;margin-top:4px;display:flex;container-type:inline-size;}
.dsh-tdt-sv-deliv-grid{grid-template-columns:repeat(2,minmax(0,1fr));gap:10px;min-width:0;display:grid;}
.dsh-tdt-sv-deliv-grid[data-single=true]{grid-template-columns:minmax(0,1fr);}
@container (width<=620px){.dsh-tdt-sv-deliv-grid{grid-template-columns:minmax(0,1fr);}}
.dsh-tdt-sv-deliv-file{box-sizing:border-box;border:.5px solid var(--tdt-border-faint);border-radius:var(--tdt-radius-md);background:var(--deliverable-fill);min-width:0;height:60px;color:var(--tdt-fg);align-items:center;gap:10px;padding:8px 10px;transition:background-color .12s;display:flex;position:relative;overflow:hidden;}
.dsh-tdt-sv-deliv-file:hover{background:var(--deliverable-hover);}
.dsh-tdt-sv-deliv-cardpreview{z-index:1;border-radius:inherit;cursor:pointer;background:0 0;border:0;width:100%;padding:0;position:absolute;inset:0;}
.dsh-tdt-sv-deliv-cardpreview:focus-visible{box-shadow:inset 0 0 0 2px var(--tdt-focus);outline:none;}
.dsh-tdt-sv-deliv-icon{z-index:2;box-sizing:border-box;pointer-events:none;border:.5px solid var(--tdt-border-faint);border-radius:var(--tdt-radius-md);background:var(--tdt-icon-plate);width:40px;height:40px;color:var(--tdt-link);flex:none;place-items:center;display:grid;position:relative;overflow:hidden;}
.dsh-tdt-sv-deliv-body{z-index:2;pointer-events:none;flex:1;justify-content:space-between;align-items:center;gap:12px;min-width:0;display:flex;position:relative;}
.dsh-tdt-sv-deliv-details{flex-direction:column;flex:1;justify-content:center;gap:2px;min-width:0;display:flex;}
.dsh-tdt-sv-deliv-name{text-overflow:ellipsis;white-space:nowrap;font-size:var(--tdt-font-md);font-weight:500;line-height:var(--tdt-line-md);overflow:hidden;}
.dsh-tdt-sv-deliv-desc{color:var(--tdt-fg-3,rgba(128,128,128,.8));text-overflow:ellipsis;white-space:nowrap;font-size:var(--tdt-font-xs);font-weight:400;line-height:var(--tdt-line-sm);overflow:hidden;}
.dsh-tdt-sv-deliv-hint,.dsh-tdt-sv-deliv-file:hover .dsh-tdt-sv-deliv-desc .dsh-tdt-sv-deliv-secondary{display:none;}
.dsh-tdt-sv-deliv-file:hover .dsh-tdt-sv-deliv-desc .dsh-tdt-sv-deliv-hint{display:inline;}
.dsh-tdt-sv-deliv-toggle{border-radius:var(--tdt-radius-sm,6px);min-width:0;color:var(--tdt-fg-3,rgba(128,128,128,.8));cursor:pointer;font:inherit;background:0 0;border:0;align-self:center;align-items:center;gap:4px;padding:1px 11px;font-size:var(--tdt-font-sm);line-height:var(--tdt-line-sm);display:inline-flex;}
.dsh-tdt-sv-deliv-toggle:hover{background:var(--tdt-hover,rgba(128,128,128,.16));}
.dsh-tdt-sv-deliv-toggle svg{flex:none;width:14px;height:14px;}
/* ── 任务文件上下文（顶部输入区：接收 / 随附，2026-10-03） ──
   官方没有「前置任务产出 / 附加文件」这个概念 ⇒ 自绘，但零件（FileTypeIcon）与 token 全走官方。
   ① **左右 0（tfc 不自带）**：左 / 右留白**全交给外层 frame 的 34px**（frame 给的左右留白同时作用于
      顶部输入区与会话正文 ⇒ 两者天然同一条左右基线）。tfc 自己**不再写左右 padding**——否则会在
      frame 34 之上再叠 34，导致顶部「附件 / 前置任务」区比下面的会话正文往里缩一截
      （用户 2026-10-03 二次指出：「左右又缩进去了，要和下面宽度一致」正是此因）。
      **上 0 / 下 18**：顶部 / 底部留白同样交给 frame（frame 上下 17 对称，见上方 frame 规则）。
   ② **横向排 + 按内容宽**（用户三次点名定稿）：flex-wrap:wrap 从左到右、排满换行；
      chip flex:0 0 auto **跟内容走**（参照宿主「附加文件」列表的样子：每个文件名就那么宽、
      不拖一条空白），**不设最小宽度**（「a.txt」就只显示 a.txt），只给 label 一个
      max-width:40ch 上限 ⇒ 除非几百个字符，否则名字都完整显示。
   ③ **显示不全的文件名一律跑马灯**（用户「鼠标一上去都要跑马灯」）：走全站唯一实现
      MarqueeText（省略号 + hover 来回滚动），前置任务产出与随附文件**同一套**。
   ④ **前置任务一排两个**（grid-template-columns:repeat(2,minmax(0,1fr))，窄容器降一列）：
      每块 = 任务名一行 + 产出物**同样横向排**；任务名行**最前 = 序号徽标**
      （**宽高相等的正方形**小方块 + 9px 数字，按显示顺序 1、2、3…）——
      它已**顶替**原先那条 4px 竖线的作用（用户 2026-10-03：「序号前面的竖线不要了，
      直接把序号变成竖线的样子，高度和宽度差不多」）。
      ⚠️ 历史上先后试过两种竖线：① 块前横跨两行的 3px 浅灰线、② 任务名前 4px 短线，**均已去掉**。
   ④b **来源 / 状态标记改方括号前置**（用户 2026-10-03）：形状是 [链接]foo.md ——
      原来挂最右边、被 flex 撑开，越看越像按钮；现在紧贴文件名前面、无间距。
   ⑤ **不再自带滚动**（用户 2026-10-03：「上面那个还单独做了一个滚动条呀……整个右边就一个滚动条，
      跟着往下面走就行」）：顶部区已搬进 column 内、与会话内容**同一个滚动容器**，
      原 max-height:min(38vh,340px) + overflow-y:auto 全部去掉 ⇒ 全弹窗只有右侧一个滚动条。
   ⑥ 两组之间一条 .5px 细线分隔（不靠颜色、不靠左缩进 —— 左缩进会破坏左右基线）。 */
/* container-type:inline-size：两列网格的降级判据用**容器宽度**（弹窗会被预览 / 编辑分栏挤窄，不能只看视口）。 */
.dsh-tdt-sv-tfc{border-bottom:.5px solid var(--tdt-border-faint,#0000000a);padding:0 0 18px;flex-direction:column;gap:12px;min-width:0;display:flex;container-type:inline-size;}
/* 顶部输入区现在住在 column 里（与会话内容同一个滚动容器）⇒ column 的兄弟间距规则
   会给「紧跟它之后的第一条消息」再加一道 margin-top，而它自己已有 padding-bottom ⇒ 多出一截。
   这里把那一道抵消掉（写在 flow-item 间距规则之后，官方类命中与否都要生效）。 */
.dsh-tdt-sv-col>.dsh-tdt-sv-tfc~:not([hidden]):not(.dsh-tdt-sv-flowitem:empty){margin-top:0;}
.dsh-tdt-sv-tfc-group{flex-direction:column;gap:8px;min-width:0;display:flex;}
.dsh-tdt-sv-tfc-group+.dsh-tdt-sv-tfc-group{border-top:.5px solid var(--tdt-border-faint,#0000000a);padding-top:12px;}
.dsh-tdt-sv-tfc-head{align-items:baseline;gap:8px;min-width:0;display:flex;}
/* 组标题比内容**高一档**（12px/600/fg-2）⇒ 不靠颜色也分得出层级：标题 > 任务名 > 芯片 > 元信息。 */
.dsh-tdt-sv-tfc-title{color:var(--tdt-fg-2,rgba(128,128,128,.95));font-size:var(--tdt-font-sm);font-weight:600;line-height:var(--tdt-line-sm);white-space:nowrap;}
/* 前置任务块 —— 一排两个（窄容器降一列，见下方 @container）。 */
.dsh-tdt-sv-tfc-tasks{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:12px 18px;min-width:0;}
@container (width<=620px){.dsh-tdt-sv-tfc-tasks{grid-template-columns:minmax(0,1fr);}}
/* 任务块：块前那条横跨「任务名 + 产出物」两行的浅灰竖线、以及任务名前的 4px 短竖线
   **都已去掉**（用户 2026-10-03 逐轮否定 ⇒ 最终只留正方形序号徽标，见 .dsh-tdt-sv-tfc-seq）。
   随之去掉 padding-left：任务名直接回到面板 34px 左基线，不再多缩进 10px。 */
.dsh-tdt-sv-tfc-task{flex-direction:column;gap:4px;min-width:0;display:flex;}
.dsh-tdt-sv-tfc-taskrow{align-items:baseline;gap:8px;min-width:0;overflow:hidden;display:flex;}
/* 层级：组标题 12/600/fg-2 靠**字重**区分；任务名同 12px 但 500 + 主色 ⇒ 内容更实、标题更轻。 */
.dsh-tdt-sv-tfc-name{color:var(--tdt-fg,#1f2328);font-size:var(--tdt-font-sm);font-weight:500;line-height:var(--tdt-line-sm);text-overflow:ellipsis;white-space:nowrap;overflow:hidden;max-width:70%;}
.dsh-tdt-sv-tfc-meta{color:var(--tdt-fg-3,rgba(128,128,128,.8));font-size:var(--tdt-font-xs);line-height:var(--tdt-line-sm);white-space:nowrap;flex:0 1 auto;}
.dsh-tdt-sv-tfc-lines{flex-direction:column;gap:2px;min-width:0;display:flex;}
/* 文件**横向排**：从左到右、排满换行（用户 2026-10-03 第二次点名）。
   ⚠️ align-items:flex-start 必须留着：默认 stretch 会把 chip 拉成整行宽，悬停热区变成一条横带。 */
.dsh-tdt-sv-tfc-files{flex-direction:row;flex-wrap:wrap;align-items:flex-start;gap:2px 6px;min-width:0;display:flex;}
/* chip 宽度**跟内容走**（用户 2026-10-03 二次点名，参照宿主「附加文件」列表的样子：
   「4000_Essential_….pdf」就那么宽，不该每个后面都拖一条空白）。
   ⇒ flex:0 0 auto（不 grow、不平分）；**不设最小宽度**（一个叫 a.txt 的就只显示 a.txt）；
   唯一约束是 label 的 max-width（见下）：超长才出省略号。 */
.dsh-tdt-sv-tfc-file{border-radius:var(--tdt-radius-sm,6px);color:var(--tdt-fg-2,rgba(128,128,128,.95));cursor:default;font:inherit;background:0 0;border:0;align-items:center;gap:6px;min-width:0;max-width:100%;padding:2px 6px;font-size:var(--tdt-font-sm);line-height:var(--tdt-line-sm);flex:0 0 auto;display:flex;text-align:left;}
button.dsh-tdt-sv-tfc-file{cursor:pointer;}
button.dsh-tdt-sv-tfc-file:hover{background:var(--tdt-hover,rgba(128,128,128,.16));color:var(--tdt-fg);}
button.dsh-tdt-sv-tfc-file:focus-visible{box-shadow:inset 0 0 0 2px var(--tdt-focus,#3b5bdb);outline:none;}
/* 不可点（路径没解析出来 / 跨工作区目录）⇒ 淡一档 + 不给指针，别让人点了没反应。 */
.dsh-tdt-sv-tfc-file[data-noclick]{opacity:.6;}
.dsh-tdt-sv-tfc-icon{width:14px;height:14px;color:var(--tdt-fg-3,rgba(128,128,128,.8));flex:none;align-items:center;justify-content:center;display:inline-flex;}
/* 文件名：截断与跑马灯都交给全站唯一实现 MarqueeText（.dsh-tdt-mq 双层）。
   这里给它**唯一的长度约束**：**无最小宽度**（用户 2026-10-03：「只有一个字 a.txt 就只显示 a.txt」），
   **最大 40ch** —— 放宽到「只要不是几百个字符都让它显示」，超出才出省略号 + hover 来回滚动。
   与主界面「基础信息 · 附加文件」同名（task-list.tsx）**同一口径**。
   ⚠️ ch 按「0」的宽度算，中文文件名实际更宽一点，属可接受偏差。 */
.dsh-tdt-sv-tfc-label{min-width:0;max-width:40ch;flex:0 1 auto;}
/* 前置任务序号徽标（用户 2026-10-03 四次点名定稿）：**顶替原来那条 4px 竖线**，
   宽高**相等**的方块，字号**直接取 var(--tdt-font-sm)** —— 与主界面「基础信息」面板
   底部「前置任务」那一行的正文**同一个字号变量**（用户原话：「大小太小了，样式参考主界面
   任务列表展开的基础信息最下面那个前置任务，按那儿的样式大小就行」）。
   方块 16px 容纳 12px 数字 + 一点余量；底色 chip-bg（非纯白、比 plate 亮一档），字色 fg-2。
   align-self:center 让它在 baseline 行里垂直居中，不贴文字基线。 */
.dsh-tdt-sv-tfc-seq{flex:none;display:inline-flex;align-items:center;justify-content:center;align-self:center;box-sizing:border-box;width:16px;height:16px;padding:0;border-radius:4px;background:var(--tdt-chip-bg,rgba(128,128,128,.12));color:var(--tdt-fg-2,rgba(128,128,128,.95));font-size:var(--tdt-font-sm);line-height:1;font-variant-numeric:tabular-nums;}
/* 标记 + 文件名的无缝容器：标记紧贴文件名，右方括号与名字之间**不留间距**
   （用户给的形状就是 [链接]foo.md，中间没有空格）。 */
.dsh-tdt-sv-tfc-namewrap{display:flex;align-items:center;min-width:0;flex:1 1 auto;}
/* 来源 / 状态标记：方括号**放在文件名前面**（用户 2026-10-03：原来挂最右边、
   被 flex 撑开，越看越像按钮）。与文件名同字号，只靠颜色弱化。 */
.dsh-tdt-sv-tfc-note{color:var(--tdt-fg-3,rgba(128,128,128,.8));font-size:var(--tdt-font-sm);line-height:var(--tdt-line-sm);white-space:nowrap;flex:none;}
.dsh-tdt-sv-tfc-more{border-radius:var(--tdt-radius-sm,6px);min-width:0;color:var(--tdt-fg-3,rgba(128,128,128,.8));cursor:pointer;font:inherit;background:0 0;border:0;align-self:flex-start;align-items:center;gap:4px;padding:1px 6px;font-size:var(--tdt-font-xs);line-height:var(--tdt-line-sm);display:inline-flex;}
.dsh-tdt-sv-tfc-more:hover{background:var(--tdt-hover,rgba(128,128,128,.16));color:var(--tdt-fg-2);}
.dsh-tdt-sv-tfc-none{color:var(--tdt-fg-3,rgba(128,128,128,.8));font-size:var(--tdt-font-xs);line-height:var(--tdt-line-sm);}
/* 用户消息里的随附文件卡（官方 MessageItem attachmentRow / fileCard；2026-10-03）：
   气泡**下方**一行，小卡 = 图标 + 文件名 + 大小。引用里没有路径 ⇒ 不可点开，也不伪装成可点。 */
.dsh-tdt-sv-attrow{flex-wrap:wrap;gap:6px;min-width:0;justify-content:flex-end;display:flex;}
.dsh-tdt-sv-attcard{box-sizing:border-box;border:.5px solid var(--tdt-border-faint,#0000000a);border-radius:var(--tdt-radius-md);background:var(--tdt-plate,rgba(128,128,128,.08));max-width:100%;height:44px;align-items:center;gap:8px;padding:6px 10px;display:flex;}
.dsh-tdt-sv-attIcon{width:16px;height:16px;color:var(--tdt-link,#3b5bdb);flex:none;align-items:center;justify-content:center;display:inline-flex;}
.dsh-tdt-sv-attBody{flex-direction:column;gap:1px;min-width:0;display:flex;}
.dsh-tdt-sv-attName{color:var(--tdt-fg);text-overflow:ellipsis;white-space:nowrap;font-size:var(--tdt-font-sm);font-weight:500;line-height:var(--tdt-line-sm);overflow:hidden;}
.dsh-tdt-sv-attMeta{color:var(--tdt-fg-3,rgba(128,128,128,.8));font-size:var(--tdt-font-xs);line-height:var(--tdt-line-sm);}
`

/**
 * 幂等注入（走 ui/style.ts 单一 <style>）。SSR / 无 document 环境静默跳过。
 */
export function ensureArchiveSessionStyle(): void {
  applyStyle('domain:session-view', ARCHIVE_SESSION_CSS)
}
