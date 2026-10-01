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
.dsh-tdt-ed-header{flex:none;display:flex;align-items:center;justify-content:space-between;gap:12px;padding:12px 14px 12px 18px;border-bottom:1px solid var(--dsw-alias-border-l2,rgba(128,128,128,.35));position:relative;}
.dsh-tdt-ed-title{font-size:15px;font-weight:600;}
/* 头部左侧：启用开关 + 标题 一组（用户 2026-09-30：开关移到标题左边）。 */
.dsh-tdt-ed-headleft{display:flex;align-items:center;gap:12px;min-width:0;}
.dsh-tdt-ed-headactions{display:flex;align-items:center;gap:10px;flex:none;}
/* 启用开关行：文字标签 + 官方 Switch（官方 Switch 只画胶囊，可见标签由这里给）。 */
.dsh-tdt-ed-enable{display:inline-flex;align-items:center;gap:8px;font-size:13px;color:var(--dsw-alias-label-primary,#1f2328);cursor:pointer;}
/* 选中色（success 绿）已上提到 ui/controls-css.ts 的 .dsh-tdt-switch（编辑器 / 列表两处合并，2026-10-01）。 */
/* 关闭钮：规格照官方 primitives Modal.close（28×28、radius-sm、hover 才出底）。 */
.dsh-tdt-ed-close{appearance:none;flex:none;display:inline-flex;align-items:center;justify-content:center;width:28px;height:28px;padding:0;border:none;border-radius:var(--dsw-radius-sm,6px);background:0 0;color:var(--dsw-alias-label-secondary,rgba(128,128,128,.95));cursor:pointer;transition:background .15s ease;}
.dsh-tdt-ed-close:hover{background:var(--dsw-alias-interactive-bg-hover,rgba(128,128,128,.16));}
.dsh-tdt-ed-body{flex:1 1 auto;min-height:0;overflow:auto;padding:14px 18px 22px;}
.dsh-tdt-ed-footer{flex:none;display:flex;align-items:center;justify-content:flex-end;gap:8px;padding:12px 18px;border-top:1px solid var(--dsw-alias-border-l2,rgba(128,128,128,.35));position:relative;}
.dsh-tdt-ed-label{font-size:12px;font-weight:600;color:var(--dsw-alias-label-primary,#1f2328);}
.dsh-tdt-ed-hint{margin:4px 0 0;font-size:12px;line-height:1.5;color:var(--dsw-alias-label-secondary,rgba(128,128,128,.95));}
/* 删除任务：红色危险钮（用户 2026-09-30：放在「保存」旁，醒目但仍是描边形态）。 */
.dsh-tdt-ed-danger{color:var(--dsw-alias-state-error-primary,#e5484d)!important;border-color:var(--dsw-alias-state-error-primary,#e5484d)!important;}
.dsh-tdt-ed-danger:hover{background:var(--dsw-alias-interactive-bg-hover,rgba(128,128,128,.16))!important;}
.dsh-tdt-ed-section{margin-bottom:16px;}
.dsh-tdt-ed-section:last-child{margin-bottom:0;}
/* 卡片（提示词 / 执行频率）：输入焦点在卡内即高亮描边（官方 Input 的 :focus-within 同款）。 */
.dsh-tdt-ed-card{box-sizing:border-box;padding:10px 12px;border:.5px solid var(--dsw-alias-border-l2,rgba(128,128,128,.35));border-radius:var(--dsw-radius-lg,10px);background:var(--dsw-alias-bg-layer-1,rgba(128,128,128,.08));transition:border-color .15s ease;}
.dsh-tdt-ed-card:focus-within{border-color:var(--dsw-alias-state-business-primary,#4d6bfe);}
/* 校验不通过的红框（用户 2026-09-30：出问题的地方把框描红，明暗自适应，走宿主 error token）。 */
.dsh-tdt-ed-card--error{border-color:var(--dsw-alias-state-error-primary,#e5484d);background:var(--dsw-alias-state-error-primary,rgba(229,72,77,.08));}
.dsh-tdt-ed-field--error{border-color:var(--dsw-alias-state-error-primary,#e5484d)!important;box-shadow:0 0 0 1px var(--dsw-alias-state-error-primary,#e5484d);}
/* 历史版本开关（2026-10-01：已并入统一分段控件 Segmented，根 id=dsh-tdt-ed-histtoggle、multiple 单段做 on/off；
   样式完全走 controls-css.ts 的 .dsh-tdt-seg，这里不再留任何皮肤——旧 .dsh-tdt-ed-histtoggle* 规则已删。 */
/* 版本条目（用户 2026-09-30 第二轮）：弃卡片背景，改**全宽虚线**分隔（一条虚线拉通整栏、不断在中间）；
   右侧 = 固定宽高槽：常态时间小字、hover 换「使用（药丸）/ 移除（小字）」——槽位尺寸恒定，
   hover 出按钮**绝不撑高行高**（此前按钮把行撑大上下蹦，用户点名）。 */
.dsh-tdt-ed-ver{display:flex;align-items:center;gap:8px;padding:9px 12px;border-bottom:1px dashed var(--dsw-alias-border-l3,rgba(128,128,128,.35));}
.dsh-tdt-ed-ver:last-child{border-bottom:none;}
.dsh-tdt-ed-ver-ic{flex:none;display:inline-flex;color:var(--dsw-alias-label-tertiary,rgba(128,128,128,.8));}
.dsh-tdt-ed-ver-main{flex:1 1 auto;min-width:0;font-size:11px;color:var(--dsw-alias-label-primary,#1f2328);}
.dsh-tdt-ed-ver-note{display:block;font-size:10px;color:var(--dsw-alias-label-secondary,rgba(128,128,128,.95));overflow:hidden;text-overflow:ellipsis;white-space:nowrap;}
.dsh-tdt-ed-ver-right{flex:none;width:52px;height:18px;display:flex;align-items:center;justify-content:flex-end;}
.dsh-tdt-ed-ver-actions{display:flex;align-items:center;gap:8px;}
/* 「使用」= 纯文字钮（用户：药丸太长），hover 才垫一个小背景；「×」= 官方叉图标，hover 变红。 */
.dsh-tdt-ed-ver-use{appearance:none;border:none;background:none;padding:1px 4px;border-radius:var(--dsw-radius-sm,4px);color:var(--dsw-alias-label-primary,#1f2328);font:inherit;font-size:11px;line-height:16px;cursor:pointer;white-space:nowrap;transition:background .12s ease,color .12s ease;}
.dsh-tdt-ed-ver-use:hover{background:var(--dsw-alias-interactive-bg-hover,rgba(128,128,128,.2));}
.dsh-tdt-ed-ver-del{appearance:none;border:none;background:none;padding:2px;border-radius:var(--dsw-radius-sm,4px);display:inline-flex;align-items:center;color:var(--dsw-alias-label-secondary,rgba(128,128,128,.95));cursor:pointer;transition:background .12s ease,color .12s ease;}
.dsh-tdt-ed-ver-del:hover{color:var(--dsw-alias-state-error-primary,#e5484d);background:var(--dsw-alias-interactive-bg-hover,rgba(128,128,128,.2));}
.dsh-tdt-ed-card-head{display:flex;align-items:center;justify-content:space-between;gap:12px;margin-bottom:8px;}
.dsh-tdt-ed-card-foot{display:flex;align-items:center;justify-content:space-between;gap:8px;margin-top:8px;}
/* 提示词大输入框：卡内无边框（视觉重心在整张卡上），占位色走 dimmed。 */
.dsh-tdt-ed-prompt{display:block;width:100%;box-sizing:border-box;min-height:132px;padding:2px;border:none;outline:none;background:0 0;color:var(--dsw-alias-label-primary,#1f2328);font:inherit;font-size:14px;line-height:1.6;resize:vertical;}
.dsh-tdt-ed-prompt::placeholder{color:var(--dsw-alias-label-dimmed,rgba(128,128,128,.6));}
.dsh-tdt-ed-prompt--error{border-color:var(--dsw-alias-state-error-primary,#e5484d)!important;box-shadow:0 0 0 1px var(--dsw-alias-state-error-primary,#e5484d);}
.dsh-tdt-ed-row{display:flex;align-items:center;gap:8px;flex-wrap:wrap;}
.dsh-tdt-ed-spacer{flex:1 1 auto;}
/* 高级设置卡收折头（用户 2026-09-29：撤掉内层黑框，整卡就是一条灰、整行可点）。 */
.dsh-tdt-ed-advhead{display:flex;align-items:center;justify-content:space-between;gap:8px;width:100%;box-sizing:border-box;padding:7px 10px;border:none;border-radius:var(--dsw-radius-md,8px);background:0 0;color:var(--dsw-alias-label-primary,#1f2328);font:inherit;font-size:13px;cursor:pointer;text-align:left;}
/* 展开指示：官方 chevron-down（TurnTriggerNodeView 同款），展开 rotate 180°。 */
.dsh-tdt-ed-advchevron{flex:none;color:var(--dsw-alias-label-secondary,rgba(128,128,128,.95));transition:transform .15s ease;}
.dsh-tdt-ed-advchevron-open{transform:rotate(180deg);}
/* 展开体：每项「控件行 + 说明行」两拍，项与项之间虚线分隔（用户 2026-09-29：别全挤成文字）。 */
.dsh-tdt-ed-advbody{display:flex;flex-direction:column;gap:12px;margin-top:10px;}
.dsh-tdt-ed-advitem{padding-top:12px;}
.dsh-tdt-ed-advitem:first-child{padding-top:0;}
.dsh-tdt-ed-advitem+.dsh-tdt-ed-advitem{border-top:1px dashed var(--dsw-alias-border-l3,rgba(128,128,128,.5));}
/* 单行文本输入：逐条照官方 Input.module.css（.wrap + .input 合并成一枚裸 input），
   含官方的 focus 描边与占位色 —— 这两条必须走 CSS，内联样式压不过伪类。 */
.dsh-tdt-ed-input{box-sizing:border-box;height:32px;padding:0 8px;border:.5px solid var(--dsw-alias-border-l4,rgba(128,128,128,.25));border-radius:var(--dsw-radius-md,8px);background:var(--dsw-alias-bg-layer-1,rgba(128,128,128,.08));color:var(--dsw-alias-label-primary,#1f2328);font:inherit;font-size:14px;line-height:22px;outline:none;transition:border-color .15s ease;}
.dsh-tdt-ed-input:focus{border-color:var(--dsw-alias-state-business-primary,#4d6bfe);}
.dsh-tdt-ed-input::placeholder{color:var(--dsw-alias-label-dimmed,rgba(128,128,128,.6));}
/* 自绘控件锚点（下拉 / 日历 / 时分）：键盘可达性描边。 */
.dsh-tdt-ed-field:focus-visible{outline:2px solid var(--dsw-alias-state-business-primary,#4d6bfe);outline-offset:1px;}
/* 整行下拉：官方 Menu 的包装 span 是 inline-flex（shrink-to-fit），要连它一起撑满。 */
.dsh-tdt-ed-selectwrap{width:100%;}
/* 前置标签输入框：把「任务名称」这类短标签塞进框里（左半段带底 + 分隔线），
   省掉标签单独占的一行——弹窗竖向空间紧张。 */
.dsh-tdt-ed-pfx{display:flex;align-items:stretch;height:32px;box-sizing:border-box;border:.5px solid var(--dsw-alias-border-l4,rgba(128,128,128,.25));border-radius:var(--dsw-radius-md,8px);background:var(--dsw-alias-bg-layer-1,rgba(128,128,128,.08));overflow:hidden;transition:border-color .15s ease;}
.dsh-tdt-ed-pfx:focus-within{border-color:var(--dsw-alias-state-business-primary,#4d6bfe);}
.dsh-tdt-ed-pfx-label{flex:none;display:inline-flex;align-items:center;padding:0 10px;border-right:.5px solid var(--dsw-alias-border-l4,rgba(128,128,128,.25));background:var(--dsw-alias-interactive-bg-hover,rgba(128,128,128,.16));color:var(--dsw-alias-label-secondary,rgba(128,128,128,.95));font-size:13px;line-height:18px;white-space:nowrap;}
.dsh-tdt-ed-pfx-input{flex:1 1 auto;min-width:0;padding:0 10px;border:none;outline:none;background:0 0;color:var(--dsw-alias-label-primary,#1f2328);font:inherit;font-size:13px;}
.dsh-tdt-ed-pfx-input::placeholder{color:var(--dsw-alias-label-dimmed,rgba(128,128,128,.6));}
.dsh-tdt-ed-pfx--error{border-color:var(--dsw-alias-state-error-primary,#e5484d)!important;box-shadow:0 0 0 1px var(--dsw-alias-state-error-primary,#e5484d);}
/* 排期卡底部：时区 / 有效期缩到小号并整体居右（重要性低，不占主视线）。 */
.dsh-tdt-ed-schedfoot{display:flex;align-items:center;justify-content:flex-end;gap:8px;margin-top:12px;padding-top:12px;border-top:1px solid var(--dsw-alias-border-l2,rgba(128,128,128,.35));}
/* 小问号：挂 Tooltip 的说明入口（不占正文版面）。 */
.dsh-tdt-ed-help{appearance:none;display:inline-flex;align-items:center;justify-content:center;width:18px;height:18px;padding:0;border:none;border-radius:50%;background:0 0;color:var(--dsw-alias-label-tertiary,rgba(128,128,128,.8));cursor:help;}
.dsh-tdt-ed-help:hover,.dsh-tdt-ed-help:focus-visible{color:var(--dsw-alias-label-primary,#1f2328);background:var(--dsw-alias-interactive-bg-hover,rgba(128,128,128,.16));}
/* 前置任务卡两级选择行（用户 2026-09-29 定稿三段式）：
   左「工作区」定宽（约 5~6 个字，134px）居左；右「添加」定宽（72px，用户 2026-09-29 收窄）居右；
   中间「任务」flex 吃掉剩余宽度（随抽拉分栏宽窄同步伸缩）。
   官方 Menu 会把锚点包进自己的 shrink-to-fit inline-flex span ⇒ 必须用子选择器把
   这层 span 一并撑满，否则有选项时整个下拉缩成内容宽（真机截图踩过的坑）。 */
.dsh-tdt-ed-depitem{display:flex;align-items:center;gap:8px;padding:6px 10px;border-radius:6px;background:var(--dsw-alias-interactive-bg-hover,rgba(127,127,127,.14));}
.dsh-tdt-ed-deppick{display:flex;align-items:center;gap:8px;}
.dsh-tdt-ed-deppick-ws{flex:0 0 134px;min-width:0;display:flex;}
.dsh-tdt-ed-deppick-task{flex:1 1 auto;min-width:0;display:flex;}
.dsh-tdt-ed-deppick-ws > span,.dsh-tdt-ed-deppick-task > span{flex:1 1 auto;min-width:0;width:100%;}
/* 跑马灯文本（MarqueeText，editor-fields.tsx）：**双层**——外层 .dsh-tdt-mq 只负责裁剪
   （overflow:hidden），内层 .dsh-tdt-mq-in 才做 transform 滚动；第一版动画挂外层 ⇒ 整盒
   位移跑出裁剪框压到行首图标（真机截图踩坑）。非 hover 内层自带省略号；确实放不下才挂
   .dsh-tdt-mq-run，hover 0.4s 后内层来回滚动，时长与距离成正比（CSS 变量由组件内联写入）。 */
.dsh-tdt-mq{display:block;overflow:hidden;white-space:nowrap;}
.dsh-tdt-mq .dsh-tdt-mq-in{display:inline-block;white-space:nowrap;max-width:100%;overflow:hidden;text-overflow:ellipsis;vertical-align:top;}
.dsh-tdt-mq-run:hover .dsh-tdt-mq-in{max-width:none;overflow:visible;animation:dsh-tdt-mq-scroll var(--dsh-tdt-mq-dur,6s) linear .4s infinite alternate;}
@keyframes dsh-tdt-mq-scroll{from{transform:translateX(0)}to{transform:translateX(var(--dsh-tdt-mq-dist,-40px))}}
/* 关闭确认已改为拉栏内联层（见 task-editor ConfirmDiscard），不再用官方 Modal，故无需抬层规则。 */
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
