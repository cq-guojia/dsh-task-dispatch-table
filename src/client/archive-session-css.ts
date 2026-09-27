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
.dsh-tdt-sv-overlay{position:fixed;inset:0;z-index:1010;display:flex;align-items:center;justify-content:center;background:var(--dsw-alias-bg-mask-1,rgba(0,0,0,.45));}
/* 尺寸照抄宿主「左下角弹窗」卡片（dsh-context .lc-ov-card）：width min(1120px,100vw-32px)、height 100%-80px（遮罩满屏 ⇒ 等价 100vh-80px）、radius 12px、padding 16px 18px 18px。 */
/* 内间距定尺（用户拍板：不按官方内容列宽算）：官方 scroll = 16px + side-clearance ⇒ clearance 给 8px = 左右各 24px 定尺；内容列不设上限（100%）。 */
.dsh-tdt-sv-panel{--dsh-composer-side-clearance:8px;--dsh-chat-content-width:100%;--dsh-chat-flow-gap:16px;background:var(--dsw-alias-bg-layer-1,rgba(128,128,128,.10));color:var(--dsw-alias-label-primary,#1f2328);border:1px solid var(--dsw-alias-border-l2,rgba(128,128,128,.35));border-radius:12px;box-shadow:var(--dsw-shadow-lv3,0 12px 32px rgba(0,0,0,.4));width:min(1120px,calc(100vw - 32px));height:calc(100% - 80px);display:flex;flex-direction:column;box-sizing:border-box;padding:16px 0 18px;overflow:hidden;}
.dsh-tdt-sv-header{display:flex;align-items:center;justify-content:space-between;gap:12px;padding:0 18px 12px;border-bottom:1px solid var(--dsw-alias-border-l2,rgba(128,128,128,.35));flex-wrap:wrap;}
.dsh-tdt-sv-close{appearance:none;background:0 0;border:none;padding:2px 6px;border-radius:6px;cursor:pointer;color:var(--dsw-alias-label-secondary,rgba(128,128,128,.95));display:inline-flex;align-items:center;justify-content:center;transition:color .1s,background .1s;}
.dsh-tdt-sv-close:hover{color:var(--dsw-alias-label-primary,#1f2328);background:var(--dsw-alias-interactive-bg-hover,rgba(128,128,128,.16));}
.dsh-tdt-sv-heading{min-width:0;}
.dsh-tdt-sv-title{font-size:15px;font-weight:600;color:var(--dsw-alias-label-primary,#1f2328);}
.dsh-tdt-sv-sid{font-family:var(--ds-font-family-code,ui-monospace,SFMono-Regular,Menlo,Consolas,monospace);font-size:11px;color:var(--dsw-alias-label-tertiary,rgba(128,128,128,.8));word-break:break-all;}
.dsh-tdt-sv-actions{display:flex;align-items:center;gap:8px;}
.dsh-tdt-sv-btn{appearance:none;font:inherit;font-size:12px;line-height:18px;cursor:pointer;color:var(--dsw-alias-label-primary,#1f2328);background:var(--dsw-alias-bg-layer-2,rgba(128,128,128,.14));border:1px solid var(--dsw-alias-border-l2,rgba(128,128,128,.35));border-radius:8px;padding:4px 12px;transition:background var(--ds-transition-duration,.15s) var(--ds-ease-in-out,ease);}
.dsh-tdt-sv-btn:hover{background:var(--dsw-alias-interactive-bg-hover,rgba(128,128,128,.16));}
.dsh-tdt-sv-btn-icon{padding:4px 6px;display:inline-flex;align-items:center;justify-content:center;}
/* 会话区边距 = 官方 ChatView.scroll：16px + --dsh-composer-side-clearance(16px) ⇒ 左右各 32px。 */
.dsh-tdt-sv-body{flex:1;min-height:0;overflow:auto;padding:16px calc(var(--dsh-composer-side-clearance,16px) + 16px) 20px;}
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
.dsh-tdt-sv-reasoning-head{display:flex;align-items:center;gap:8px;width:100%;background:0 0;border:none;cursor:pointer;padding:6px 12px;font-size:12px;color:var(--dsw-alias-label-tertiary,rgba(128,128,128,.8));text-align:left;}
.dsh-tdt-sv-reasoning-preview{flex:1;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;}
.dsh-tdt-sv-reasoning-chevron{flex:none;}
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
.dsh-tdt-sv-reasoning{align-self:stretch;border:1px solid var(--dsw-alias-border-l2,rgba(128,128,128,.28));border-radius:10px;background:var(--dsw-alias-bg-layer-1,rgba(128,128,128,.10));}
.dsh-tdt-sv-reasoning>summary{cursor:pointer;list-style:none;display:flex;align-items:center;gap:6px;padding:6px 12px;font-size:12px;color:var(--dsw-alias-label-tertiary,rgba(128,128,128,.8));user-select:none;}
.dsh-tdt-sv-reasoning>summary::-webkit-details-marker{display:none;}
.dsh-tdt-sv-reasoning>summary::before{content:'▸';font-size:10px;}
.dsh-tdt-sv-reasoning[open]>summary::before{content:'▾';}
.dsh-tdt-sv-reasoning-body{padding:0 12px 10px;white-space:pre-wrap;word-break:break-word;font-size:13px;line-height:1.6;color:var(--dsw-alias-label-secondary,rgba(128,128,128,.95));}
.dsh-tdt-sv-tool{align-self:stretch;border:1px solid var(--dsw-alias-border-l2,rgba(128,128,128,.28));border-radius:10px;background:var(--dsw-alias-bg-layer-1,rgba(128,128,128,.10));overflow:hidden;}
.dsh-tdt-sv-tool-head{display:flex;align-items:center;gap:8px;padding:6px 10px;flex-wrap:wrap;font-size:12px;}
.dsh-tdt-sv-tool-name{font-family:var(--ds-font-family-code,ui-monospace,SFMono-Regular,Menlo,Consolas,monospace);font-weight:600;color:var(--dsw-alias-brand-primary,#2f6feb);}
.dsh-tdt-sv-tool-err{color:var(--dsw-alias-state-error-primary,#c0392b);font-weight:600;}
.dsh-tdt-sv-tool details{border-top:1px solid var(--dsw-alias-border-l2,rgba(128,128,128,.24));}
.dsh-tdt-sv-tool summary{cursor:pointer;list-style:none;padding:6px 10px;font-size:12px;display:flex;align-items:center;gap:8px;flex-wrap:wrap;}
.dsh-tdt-sv-tool summary::-webkit-details-marker{display:none;}
.dsh-tdt-sv-tool summary>span:last-child{margin-left:auto;color:var(--dsw-alias-label-secondary,rgba(128,128,128,.9));}
.dsh-tdt-sv-tool>details>summary{border-top:none;}
.dsh-tdt-sv-tool>details:not(:first-child)>summary{border-top:1px solid var(--dsw-alias-border-l2,rgba(128,128,128,.24));}
.dsh-tdt-sv-tool pre{margin:0;padding:8px 10px;font-family:var(--ds-font-family-code,ui-monospace,SFMono-Regular,Menlo,Consolas,monospace);font-size:11px;line-height:1.5;white-space:pre-wrap;word-break:break-all;max-height:14em;overflow:auto;background:var(--dsw-alias-bg-layer-2,rgba(128,128,128,.14));color:var(--dsw-alias-label-primary,#1f2328);}
.dsh-tdt-sv-outcome{display:block;margin-top:4px;font-family:var(--ds-font-family-code,ui-monospace,SFMono-Regular,Menlo,Consolas,monospace);font-size:11px;}
.dsh-tdt-sv-outcome-err{color:var(--dsw-alias-state-error-primary,#c0392b);}
.dsh-tdt-sv-outcome-ok{color:var(--dsw-alias-label-secondary,rgba(128,128,128,.95));}
.dsh-tdt-sv-notice{align-self:center;font-size:12px;color:var(--dsw-alias-label-tertiary,rgba(128,128,128,.8));padding:2px 8px;}
.dsh-tdt-sv-notice-err{align-self:center;font-size:12px;color:var(--dsw-alias-state-error-primary,#c0392b);padding:2px 8px;text-align:center;}
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
