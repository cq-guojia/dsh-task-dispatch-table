// 任务表单弹窗的样式（类名前缀稳定 `dsh-tdt-ed-`，色值全部走宿主 `--dsw-alias-*`）。
//
// 交付方式与 archive-session-css.ts 同源：client 产物是内核消费的 CJS 闭包，
// `import './x.css'` 不会被加载 ⇒ 运行时注入 <style>。
//
// 用 CSS 而不是内联样式的只有两类：**伪类**（:hover / :focus-within / ::placeholder）
// 与整页外壳骨架；控件内部的度量仍在 editor-fields.tsx 里内联（照官方 Input 逐条抄）。

/** 样式标签 id（幂等注入用）。 */
export const ED_STYLE_ID = 'dsh-task-dispatch-table-task-editor'

export const TASK_EDITOR_CSS = `
/* 遮罩：盖在整页之上（含 U11 预览 dock —— dock 是 z 1030 的占布局分栏，此处 1040 压住它）。 */
.dsh-tdt-ed-overlay{position:fixed;inset:0;z-index:1040;display:flex;justify-content:flex-end;background:var(--dsw-alias-bg-mask-1,rgba(0,0,0,.45));}
/* 面板：右侧贴边、上下顶满、**浮层**（页面本身不动、不被推窄）。 */
.dsh-tdt-ed-panel{position:relative;display:flex;flex-direction:column;height:100%;box-sizing:border-box;background:var(--dsw-alias-bg-base,var(--dsw-alias-bg-layer-1,#fff));color:var(--dsw-alias-label-primary,#1f2328);border-left:1px solid var(--dsw-alias-border-l2,rgba(128,128,128,.35));box-shadow:var(--dsw-shadow-lv3,0 12px 40px rgba(0,0,0,.32));}
/* 左缘拖拽条（只改宽度，不画线；hover 时才给一点提示色）。 */
.dsh-tdt-ed-resizer{position:absolute;top:0;bottom:0;left:0;width:6px;cursor:col-resize;z-index:2;touch-action:none;background:0 0;}
.dsh-tdt-ed-resizer:hover{background:var(--dsw-alias-interactive-bg-hover,rgba(128,128,128,.16));}
.dsh-tdt-ed-header{flex:none;display:flex;align-items:center;justify-content:space-between;gap:12px;padding:12px 14px 12px 18px;border-bottom:1px solid var(--dsw-alias-border-l2,rgba(128,128,128,.35));}
.dsh-tdt-ed-title{font-size:15px;font-weight:600;}
.dsh-tdt-ed-headactions{display:flex;align-items:center;gap:10px;flex:none;}
/* 启用开关行：文字标签 + 官方 Switch（官方 Switch 只画胶囊，可见标签由这里给）。 */
.dsh-tdt-ed-enable{display:inline-flex;align-items:center;gap:8px;font-size:13px;color:var(--dsw-alias-label-primary,#1f2328);cursor:pointer;}
/* 选中色：官方 Switch 用 --dsw-alias-brand-primary（暗色主题下近白 #f9fafb / 亮色主题下近黑 #0f1115，
   所以「打开变白」是官方 token 的正常表现、不是画错）。用户 2026-09-29 要求「打开显示为绿色」
   ⇒ 局部改用官方**状态色** success（官方 Tag tone:'success' 的定义即「a healthy or enabled state」）。
   选择器带上标签与 role，特异性高于官方 .switch[aria-checked=true]，与注入先后无关。 */
.dsh-tdt-ed-enable button[role='switch'][aria-checked='true']{background:var(--dsw-alias-state-success-primary,#22c55e);}
/* 关闭钮：规格照官方 primitives Modal.close（28×28、radius-sm、hover 才出底）。 */
.dsh-tdt-ed-close{appearance:none;flex:none;display:inline-flex;align-items:center;justify-content:center;width:28px;height:28px;padding:0;border:none;border-radius:var(--dsw-radius-sm,6px);background:0 0;color:var(--dsw-alias-label-secondary,rgba(128,128,128,.95));cursor:pointer;transition:background .15s ease;}
.dsh-tdt-ed-close:hover{background:var(--dsw-alias-interactive-bg-hover,rgba(128,128,128,.16));}
.dsh-tdt-ed-tabs{flex:none;display:flex;gap:4px;padding:8px 18px 0;}
.dsh-tdt-ed-tab{appearance:none;font:inherit;font-size:13px;line-height:18px;padding:5px 12px;border:none;border-radius:var(--dsw-radius-sm,6px);background:0 0;color:var(--dsw-alias-label-secondary,rgba(128,128,128,.95));cursor:pointer;transition:background .15s ease,color .15s ease;}
.dsh-tdt-ed-tab:hover{background:var(--dsw-alias-interactive-bg-hover,rgba(128,128,128,.16));}
.dsh-tdt-ed-tab[aria-selected='true']{background:var(--dsw-alias-bg-layer-2,rgba(128,128,128,.14));color:var(--dsw-alias-label-primary,#1f2328);font-weight:600;}
.dsh-tdt-ed-body{flex:1 1 auto;min-height:0;overflow:auto;padding:14px 18px 22px;}
.dsh-tdt-ed-footer{flex:none;display:flex;align-items:center;justify-content:flex-end;gap:8px;padding:12px 18px;border-top:1px solid var(--dsw-alias-border-l2,rgba(128,128,128,.35));}
.dsh-tdt-ed-label{font-size:12px;font-weight:600;color:var(--dsw-alias-label-primary,#1f2328);}
.dsh-tdt-ed-hint{margin:4px 0 0;font-size:12px;line-height:1.5;color:var(--dsw-alias-label-secondary,rgba(128,128,128,.95));}
.dsh-tdt-ed-warn{margin:6px 0 0;font-size:12px;line-height:1.5;color:var(--dsw-alias-state-warn-primary,#f5a623);}
.dsh-tdt-ed-section{margin-bottom:16px;}
.dsh-tdt-ed-section:last-child{margin-bottom:0;}
/* 卡片（提示词 / 执行频率）：输入焦点在卡内即高亮描边（官方 Input 的 :focus-within 同款）。 */
.dsh-tdt-ed-card{box-sizing:border-box;padding:10px 12px;border:.5px solid var(--dsw-alias-border-l2,rgba(128,128,128,.35));border-radius:var(--dsw-radius-lg,10px);background:var(--dsw-alias-bg-layer-1,rgba(128,128,128,.08));transition:border-color .15s ease;}
.dsh-tdt-ed-card:focus-within{border-color:var(--dsw-alias-state-business-primary,#4d6bfe);}
.dsh-tdt-ed-card-head{display:flex;align-items:center;justify-content:space-between;gap:12px;margin-bottom:8px;}
.dsh-tdt-ed-card-foot{display:flex;align-items:center;justify-content:space-between;gap:8px;margin-top:8px;}
/* 提示词大输入框：卡内无边框（视觉重心在整张卡上），占位色走 dimmed。 */
.dsh-tdt-ed-prompt{display:block;width:100%;box-sizing:border-box;min-height:132px;padding:2px;border:none;outline:none;background:0 0;color:var(--dsw-alias-label-primary,#1f2328);font:inherit;font-size:14px;line-height:1.6;resize:vertical;}
.dsh-tdt-ed-prompt::placeholder{color:var(--dsw-alias-label-dimmed,rgba(128,128,128,.6));}
.dsh-tdt-ed-row{display:flex;align-items:center;gap:8px;flex-wrap:wrap;}
.dsh-tdt-ed-spacer{flex:1 1 auto;}
/* 上传投放区（P1 接真上传；此处只呈现形态 + 文案）。 */
.dsh-tdt-ed-drop{display:flex;align-items:center;justify-content:center;min-height:96px;box-sizing:border-box;padding:12px;border:1px dashed var(--dsw-alias-border-l3,rgba(128,128,128,.5));border-radius:var(--dsw-radius-md,8px);color:var(--dsw-alias-label-dimmed,rgba(128,128,128,.6));font-size:13px;}
.dsh-tdt-ed-summary{display:flex;align-items:center;justify-content:space-between;gap:8px;width:100%;box-sizing:border-box;padding:7px 10px;border:.5px solid var(--dsw-alias-border-l4,rgba(128,128,128,.25));border-radius:var(--dsw-radius-md,8px);background:0 0;color:var(--dsw-alias-label-primary,#1f2328);font:inherit;font-size:13px;cursor:pointer;text-align:left;}
/* 单行文本输入：逐条照官方 Input.module.css（.wrap + .input 合并成一枚裸 input），
   含官方的 focus 描边与占位色 —— 这两条必须走 CSS，内联样式压不过伪类。 */
.dsh-tdt-ed-input{box-sizing:border-box;height:32px;padding:0 8px;border:.5px solid var(--dsw-alias-border-l4,rgba(128,128,128,.25));border-radius:var(--dsw-radius-md,8px);background:var(--dsw-alias-bg-layer-1,rgba(128,128,128,.08));color:var(--dsw-alias-label-primary,#1f2328);font:inherit;font-size:14px;line-height:22px;outline:none;transition:border-color .15s ease;}
.dsh-tdt-ed-input:focus{border-color:var(--dsw-alias-state-business-primary,#4d6bfe);}
.dsh-tdt-ed-input::placeholder{color:var(--dsw-alias-label-dimmed,rgba(128,128,128,.6));}
/* 代码类值（手册路径 / 成功状态清单）：等宽、小一号，照本仓库既有 markdown-code 习惯。 */
.dsh-tdt-ed-mono{font-family:var(--ds-font-family-code,ui-monospace,SFMono-Regular,Menlo,Consolas,monospace);font-size:12px;}
/* 自绘控件锚点（下拉 / 日历 / 时分）：键盘可达性描边。 */
.dsh-tdt-ed-field:focus-visible{outline:2px solid var(--dsw-alias-state-business-primary,#4d6bfe);outline-offset:1px;}
/* 整行下拉：官方 Menu 的包装 span 是 inline-flex（shrink-to-fit），要连它一起撑满。 */
.dsh-tdt-ed-selectwrap{width:100%;}
/* 官方分段控件收小一号（官方 = 28px 高 / 13px 字）。官方类名是 CSS-module 哈希，
   只能按「元素 + role」选中；指示器位置由 --dsh-segment-count/index 算出来（不测量 DOM），
   所以容器 padding 一改，指示器的 top/left/height/width 算式必须同步改（gap 保持 2px，
   位移公式 index*(100% + 2px) 才仍然成立）。 */
.dsh-tdt-ed-seg{padding:3px;}
.dsh-tdt-ed-seg>span[aria-hidden='true']{top:3px;left:3px;height:calc(100% - 6px);width:calc((100% - 6px - 2px*(var(--dsh-segment-count) - 1))/var(--dsh-segment-count));}
.dsh-tdt-ed-seg>button[role='tab']{height:22px;padding:0 10px;font-size:12px;line-height:18px;}
/* 前置标签输入框：把「任务名称」这类短标签塞进框里（左半段带底 + 分隔线），
   省掉标签单独占的一行——弹窗竖向空间紧张。 */
.dsh-tdt-ed-pfx{display:flex;align-items:stretch;height:32px;box-sizing:border-box;border:.5px solid var(--dsw-alias-border-l4,rgba(128,128,128,.25));border-radius:var(--dsw-radius-md,8px);background:var(--dsw-alias-bg-layer-1,rgba(128,128,128,.08));overflow:hidden;transition:border-color .15s ease;}
.dsh-tdt-ed-pfx:focus-within{border-color:var(--dsw-alias-state-business-primary,#4d6bfe);}
.dsh-tdt-ed-pfx-label{flex:none;display:inline-flex;align-items:center;padding:0 10px;border-right:.5px solid var(--dsw-alias-border-l4,rgba(128,128,128,.25));background:var(--dsw-alias-interactive-bg-hover,rgba(128,128,128,.16));color:var(--dsw-alias-label-secondary,rgba(128,128,128,.95));font-size:13px;line-height:18px;white-space:nowrap;}
.dsh-tdt-ed-pfx-input{flex:1 1 auto;min-width:0;padding:0 10px;border:none;outline:none;background:0 0;color:var(--dsw-alias-label-primary,#1f2328);font:inherit;font-size:13px;}
.dsh-tdt-ed-pfx-input::placeholder{color:var(--dsw-alias-label-dimmed,rgba(128,128,128,.6));}
/* 排期卡底部：时区 / 有效期缩到小号并整体居右（重要性低，不占主视线）。 */
.dsh-tdt-ed-schedfoot{display:flex;align-items:center;justify-content:flex-end;gap:8px;margin-top:12px;padding-top:12px;border-top:1px solid var(--dsw-alias-border-l2,rgba(128,128,128,.35));}
/* 小问号：挂 Tooltip 的说明入口（不占正文版面）。 */
.dsh-tdt-ed-help{appearance:none;display:inline-flex;align-items:center;justify-content:center;width:18px;height:18px;padding:0;border:none;border-radius:50%;background:0 0;color:var(--dsw-alias-label-tertiary,rgba(128,128,128,.8));cursor:help;}
.dsh-tdt-ed-help:hover,.dsh-tdt-ed-help:focus-visible{color:var(--dsw-alias-label-primary,#1f2328);background:var(--dsw-alias-interactive-bg-hover,rgba(128,128,128,.16));}
.dsh-tdt-ed-summary:hover{background:var(--dsw-alias-interactive-bg-hover,rgba(128,128,128,.16));}
.dsh-tdt-ed-deprow{display:flex;align-items:center;gap:8px;margin-top:8px;}
.dsh-tdt-ed-json{display:block;width:100%;box-sizing:border-box;min-height:11em;margin-top:8px;padding:8px;border:.5px solid var(--dsw-alias-border-l4,rgba(128,128,128,.25));border-radius:var(--dsw-radius-md,8px);background:var(--dsw-alias-markdown-code-block,rgba(128,128,128,.10));color:var(--dsw-alias-label-secondary,rgba(128,128,128,.95));font-family:var(--ds-font-family-code,ui-monospace,SFMono-Regular,Menlo,Consolas,monospace);font-size:12px;line-height:1.5;resize:vertical;}
`

let injected = false

/** 幂等注入（无 document 时静默跳过；宿主升级换 token 名时回退兜底值）。 */
export function ensureTaskEditorStyle(): void {
  if (injected) return
  injected = true
  if (typeof document === 'undefined') return
  if (document.getElementById(ED_STYLE_ID) !== null) return
  const el = document.createElement('style')
  el.id = ED_STYLE_ID
  el.textContent = TASK_EDITOR_CSS
  document.head.appendChild(el)
}
