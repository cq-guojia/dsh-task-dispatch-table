// 浮层错误提示（Toast）样式：保存失败等错误从「占版面的 <p> / 行内 span」
// 改为**悬浮在保存操作行上方**的红条，2.8s 内淡入稳住 2.5s 再上飘淡出，不挤压下方内容。
//
// 交付方式与 task-editor-css.ts / archive-session-css.ts 同源：client 产物是内核消费的
// CJS 闭包，`import './x.css'` 不会被加载 ⇒ 运行时注入 <style>。

/** 样式标签 id（幂等注入用）。 */
export const TOAST_STYLE_ID = 'dsh-task-dispatch-table-toast'

export const TOAST_CSS = `
/* 悬浮错误提示：绝对定位在「保存操作行」上方（父容器需 position:relative），不占版面。
   2.8s 时间线：0~8% 淡入并上滑归位 → 8%~82% 稳定显示（≈2.5s）→ 82%~100% 上飘淡出。 */
.dsh-tdt-toast{
  position:absolute;
  left:50%;
  bottom:calc(100% + 8px);
  transform:translate(-50%,10px);
  z-index:6;
  pointer-events:none;
  max-width:calc(100% - 24px);
  box-sizing:border-box;
  margin:0;
  padding:8px 12px;
  border-radius:var(--dsw-radius-md,8px);
  background:var(--dsw-alias-state-error-primary,#e5484d);
  color:#fff;
  font-size:12px;
  line-height:1.5;
  text-align:center;
  box-shadow:0 6px 20px rgba(0,0,0,.25);
  opacity:0;
  animation:dsh-tdt-toast 2.8s ease forwards;
}
@keyframes dsh-tdt-toast{
  0%{opacity:0;transform:translate(-50%,10px);}
  8%{opacity:1;transform:translate(-50%,0);}
  82%{opacity:1;transform:translate(-50%,0);}
  100%{opacity:0;transform:translate(-50%,-16px);}
}
/* 常驻型（不自动消失）：用于持续态校验（如 JSON 不合法），同样浮在上方、不占版面，但不上飘淡出。 */
.dsh-tdt-toast--sticky{animation:none;opacity:1;transform:translate(-50%,0);}
/* 下方浮出型（编辑器头部「启用开关」写回结果用）：锚在 header 正下方，同一条 2.8s 动画时间线。 */
.dsh-tdt-toast--below{bottom:auto;top:calc(100% + 8px);}
/* 三档语义色（用户 2026-09-30：不许全红）——成功 = 绿（宿主 success token）、
   中性 = 反色面（深色主题浅白灰、浅色主题近黑灰，走 label-primary / inverted 对），错误 = 默认红。 */
.dsh-tdt-toast--success{background:var(--dsw-alias-state-success-primary,#2f9e44);}
.dsh-tdt-toast--neutral{background:var(--dsw-alias-label-primary,#1f2328);color:var(--dsw-alias-label-primary-inverted,#fff);}
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

/** 语义色三档（用户 2026-09-30：不许全红）——成功绿 / 错误红 / 中性反色面（深浅色自适应）。 */
export type ToastTone = 'success' | 'error' | 'neutral'

export function FloatingToast(props: {
  /** 文案（已是完整人话，组件不再拼前缀）。 */
  text: string
  /** 语义色，缺省 = error（红）。 */
  tone?: ToastTone
  /** 每次触发换一个值 ⇒ React 重挂载重播动画（连点同句也能再弹一次）。 */
  seq: number | string
  /** 浮在锚点下方（编辑器头部启用开关用）；缺省浮在上方。 */
  below?: boolean
  /** 动画结束自退（父级把状态清空）。 */
  onDone: () => void
}): ReactElement {
  const tone = props.tone ?? 'error'
  const cls = [
    'dsh-tdt-toast',
    props.below === true ? 'dsh-tdt-toast--below' : '',
    tone === 'success' ? 'dsh-tdt-toast--success' : '',
    tone === 'neutral' ? 'dsh-tdt-toast--neutral' : '',
  ].filter(Boolean).join(' ')
  return h('div', { key: props.seq, className: cls, onAnimationEnd: props.onDone }, props.text)
}
