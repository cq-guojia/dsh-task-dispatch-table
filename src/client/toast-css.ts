// 浮层错误提示（Toast）样式：保存失败等错误从「占版面的 <p> / 行内 span」
// 改为**悬浮在保存操作行上方**的红条，2.8s 内淡入稳住 2.5s 再上飘淡出，不挤压下方内容。
//
// 交付方式与 task-editor-css.ts / archive-session-css.ts 同源：client 产物是内核消费的
// CJS 闭包，`import './x.css'` 不会被加载 ⇒ 运行时注入 <style>。

/** 样式标签 id（幂等注入用）。 */
export const TOAST_STYLE_ID = 'dsh-task-dispatch-table-toast'

export const TOAST_CSS = `
/* 悬浮提示 Toast（全站唯一实现）：绝对定位在锚点上方（父容器需 position:relative），不占版面。
   形态（用户 2026-09-30 定稿）：居中 + 最大宽 520px 超出折行；淡色底 + 同色系深一点的描边 +
   语义色圆点 + 深色正文字；统一 2.8s 时间线（0~8% 淡入归位 → ≈2.5s 稳定 → 上飘淡出）。 */
.dsh-tdt-toast{
  --tone:var(--tdt-danger,#e5484d);
  position:absolute;
  left:50%;
  bottom:calc(100% + 8px);
  transform:translate(-50%,10px);
  z-index:6;
  pointer-events:none;
  width:max-content;
  max-width:min(520px,calc(100% - 24px));
  box-sizing:border-box;
  margin:0;
  padding:8px 14px;
  border-radius:var(--tdt-radius-md,8px);
  border:1px solid var(--tone);
  /* 不透明淡色底（用户：怕后面的字挡着，不玩透明度）——color-mix 不可用时回退各档写死的淡色。 */
  background:var(--tdt-surface-1,rgba(128,128,128,.15));
  background:color-mix(in srgb,var(--tone) 10%,var(--tdt-surface-1,#fff));
  color:var(--tdt-fg,#1f2328);
  font-size:12px;
  line-height:1.6;
  display:flex;
  align-items:flex-start;
  text-align:left;
  box-shadow:0 4px 16px rgba(0,0,0,.18);
  opacity:0;
  animation:dsh-tdt-toast 2.8s ease forwards;
}
/* 圆点 = 独立 flex 元素，**左上对齐**（多行文字时不飘）；文字区 white-space:pre-line 支持 \n 换行。 */
.dsh-tdt-toast-dot{
  flex:none;
  width:7px;height:7px;border-radius:50%;
  background:var(--tone);
  margin:6px 8px 0 0;
}
.dsh-tdt-toast--neutral .dsh-tdt-toast-dot{background:var(--tdt-fg-inverse,#fff);opacity:.65;}
.dsh-tdt-toast-text{
  flex:1 1 auto;min-width:0;
  white-space:pre-line;
  text-align:left;
}
@keyframes dsh-tdt-toast{
  0%{opacity:0;transform:translate(-50%,10px);}
  8%{opacity:1;transform:translate(-50%,0);}
  82%{opacity:1;transform:translate(-50%,0);}
  100%{opacity:0;transform:translate(-50%,-16px);}
}
/* 四档语义色：错误红（默认）/ 成功绿 / 警告橙 / 中性 = 反色实面（深色主题浅白灰、浅色主题近黑灰）。 */
.dsh-tdt-toast--success{--tone:var(--tdt-success,#2f9e44);}
.dsh-tdt-toast--warning{--tone:var(--tdt-warning,#e6a23c);}
.dsh-tdt-toast--neutral{
  --tone:var(--tdt-fg-2,rgba(128,128,128,.95));
  background:var(--tdt-fg,#1f2328);
  color:var(--tdt-fg-inverse,#fff);
  border-color:transparent;
}
.dsh-tdt-toast--neutral::before{background:var(--tdt-fg-inverse,#fff);opacity:.65;}/* 常驻型（不自动消失）：用于持续态校验（如 JSON 不合法），同样浮在上方、不占版面，但不上飘淡出。 */
.dsh-tdt-toast--sticky{animation:none;opacity:1;transform:translate(-50%,0);}
/* 下方浮出型（编辑器头部「启用开关」写回结果用）：锚在 header 正下方，同一条 2.8s 动画时间线。 */
.dsh-tdt-toast--below{bottom:auto;top:calc(100% + 8px);}
`

let injected = false

/** 幂等注入（无 document 时静默跳过；宿主升级换 token 名时回退兜底值）。 */
export function ensureToastStyle(): void {
  if (injected) return
  injected = true
  if (typeof document === 'undefined') return
  if (document.getElementById(TOAST_STYLE_ID) !== null) return
  const el = document.createElement('style')
  el.id = TOAST_STYLE_ID
  el.textContent = TOAST_CSS
  document.head.appendChild(el)
}

// ─────────────────────── 共用浮层 Toast 组件（全站唯一实现，不许各处再手写） ───────────────────────

import { createElement as h } from 'react'
import type { ReactElement } from 'react'

/** 语义色四档（用户 2026-09-30 定稿）：成功绿 / 错误红 / 警告橙 / 中性反色面。 */
export type ToastTone = 'success' | 'error' | 'warning' | 'neutral'

export function FloatingToast(props: {
  /** 文案（已是完整人话，组件不再拼前缀）；支持 \n 换行（white-space:pre-line），多问题一行一条。 */
  text: string
  /** 语义色，缺省 = error（红）。 */
  tone?: ToastTone
  /** 每次触发换一个值 ⇒ React 重挂载重播动画（连点同句也能再弹一次）。 */
  seq: number | string
  /** 浮在锚点下方（编辑器头部启用开关用）；缺省浮在上方。 */
  below?: boolean
  /** 常驻不自动消失（持续态校验，如 JSON 不合法）；onDone 不会触发，由外部撤除。 */
  sticky?: boolean
  /** 动画结束自退（父级把状态清空）；sticky 恒不触发。 */
  onDone: () => void
}): ReactElement {
  const tone = props.tone ?? 'error'
  const cls = [
    'dsh-tdt-toast',
    props.below === true ? 'dsh-tdt-toast--below' : '',
    props.sticky === true ? 'dsh-tdt-toast--sticky' : '',
    tone === 'success' ? 'dsh-tdt-toast--success' : '',
    tone === 'warning' ? 'dsh-tdt-toast--warning' : '',
    tone === 'neutral' ? 'dsh-tdt-toast--neutral' : '',
  ].filter(Boolean).join(' ')
  return h('div', { key: props.seq, className: cls, onAnimationEnd: props.onDone },
    h('span', { className: 'dsh-tdt-toast-dot' }),
    h('span', { className: 'dsh-tdt-toast-text' }, props.text),
  )
}
