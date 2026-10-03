/**
 * 跑马灯文本 —— **全站唯一实现**（L2，P6 从 editor-fields 迁入 ui）
 *
 * 默认超长省略号；hover 且确实放不下时，来回滚动展示全名。自实现原因：官方 primitives 无跑马灯组件。
 * 测宽用 ResizeObserver + 文本变化重测；滚动距离 0 时不启用 hover 动画（`.dsh-tdt-mq-run` 才有动画）。
 *
 * **双层结构**：外层 `.dsh-tdt-mq` 只负责裁剪（overflow:hidden），内层 `.dsh-tdt-mq-in` 才做
 * transform 滚动——文字永远在自己那一块里跑，不会压到相邻文字。皮肤在 `controls-css.ts`。
 */
import { createElement as h, useCallback, useEffect, useLayoutEffect, useRef, useState, type CSSProperties, type ReactElement } from 'react'

/** 跑马灯文本。 */
export function MarqueeText(props: {
  text: string
  style?: CSSProperties
  title?: string
  /**
   * 追加在外层上的类名（**在 `.dsh-tdt-mq` 之后**，用于调用方自带字体 / 字号 / 字色等皮肤）。
   * 皮肤写在调用方自己的样式域里，本组件只管滚动；字体类挂外层即可（内层继承）。
   */
  className?: string
}): ReactElement {
  const outerRef = useRef<HTMLSpanElement | null>(null)
  const innerRef = useRef<HTMLSpanElement | null>(null)
  const [dist, setDist] = useState(0)
  const measure = useCallback(() => {
    const outer = outerRef.current
    const inner = innerRef.current
    if (outer === null || inner === null) return
    setDist(Math.max(0, Math.ceil(inner.scrollWidth - outer.clientWidth)))
  }, [])
  useLayoutEffect(() => {
    const outer = outerRef.current
    if (outer === null) return
    measure()
    const ro = new ResizeObserver(measure) // 抽屉拖宽变窄 / 字体就绪都会改 clientWidth ⇒ 重测
    ro.observe(outer)
    return () => { ro.disconnect() }
  }, [measure])
  useEffect(() => { measure() }, [props.text, measure])
  const run = dist > 0
  return h('span', {
    ref: outerRef,
    className: (run ? 'dsh-tdt-mq dsh-tdt-mq-run' : 'dsh-tdt-mq') + (props.className === undefined ? '' : ` ${props.className}`),
    title: props.title,
    style: props.style,
  },
    h('span', {
      ref: innerRef,
      className: 'dsh-tdt-mq-in',
      style: {
        ...(run ? { '--dsh-tdt-mq-dist': `${-dist}px`, '--dsh-tdt-mq-dur': `${Math.max(3, Math.round(dist / 30))}s` } : null),
      },
    }, props.text),
  )
}
