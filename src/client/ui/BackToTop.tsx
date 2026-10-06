/**
 * 统一的「回到顶部」悬浮按钮（UI 基础层）。
 *
 * 用法：
 *   <BackToTop />
 *
 * 行为：
 * - 渲染在主面板滚动容器（page 容器，overflow:auto）内；fixed 定位，**不占布局空间**；
 * - 横向贴在主内容列（`PANEL_CONTENT_ID` = `dsh-tdt-main`，限宽 1120）**右缘外侧**、页面靠下，
 *   与主内容同进退（窗口 resize / 分栏 dock 开合都会跟住）；
 * - 滚动超过阈值（默认 320px）才显形，否则隐身（`.is-visible` 切换）；
 * - 点击把滚动容器平滑滚回顶部（prefers-reduced-motion 下改用瞬时）。
 *
 * 因为主面板的三个 tab（任务配置 / 执行记录 / 任务日程 …）共用同一个滚动容器，
 * 在 `index.ts` 的 page 容器里渲染**一次**即覆盖所有页面，无需每个页面各放一份。
 *
 * 横向锚定逻辑与 `<Loading />` 同源（后者贴右缘内侧），本件放在右缘**外侧**并留 16px 间隙。
 */
import { createElement as h, useEffect, useRef, useState } from 'react'
import { IconChevronUpOutlineRegular } from '@deepseek-ai/dsh-client-ui-primitives'
import { ensureUiBase } from './style'
import { ensureBackToTopStyle } from './back-to-top-css'

// 主内容列 id 与 `<Loading />` 同源：必须 == ui/index.ts 的 `PANEL_CONTENT_ID`（`dsh-tdt-main`），
// 这里用字面量避免与 ui/index 形成循环依赖（Loading 同样如此）。
const DEFAULT_ANCHOR_ID = 'dsh-tdt-main'

/** 滚动超过这个距离（px）才显形。 */
const SHOW_THRESHOLD_PX = 320
/** 按钮左缘与主内容列右缘的间隙（px）。 */
const GAP_PX = 16
/** 视口右缘至少留白（px），按钮越界时回退到贴近视口右缘。 */
const VIEWPORT_PADDING_PX = 8

/** 向上找最近的「可纵向滚动」祖先（本件就挂在 page 滚动容器里，一路找到它）。 */
function findScrollContainer(node: HTMLElement | null): HTMLElement | null {
  let el: HTMLElement | null = node?.parentElement ?? null
  while (el !== null) {
    const oy = getComputedStyle(el).overflowY
    if (oy === 'auto' || oy === 'scroll') return el
    el = el.parentElement
  }
  return null
}

export interface BackToTopProps {
  /** 主内容容器 id，按钮贴到它的右缘外侧；默认 `dsh-tdt-main`。 */
  anchorId?: string
}

/** 统一的回到顶部悬浮按钮。 */
export function BackToTop(props: BackToTopProps): ReturnType<typeof h> {
  ensureUiBase()
  ensureBackToTopStyle()
  const ref = useRef<HTMLButtonElement>(null)
  const [visible, setVisible] = useState(false)
  const [left, setLeft] = useState<string>('auto')

  useEffect(() => {
    const btn = ref.current
    if (btn === null) return
    const anchorId = props.anchorId ?? DEFAULT_ANCHOR_ID
    const sc = findScrollContainer(btn)
    let observed: Element | null = null

    const reposition = (): void => {
      const el = document.getElementById(anchorId)
      if (el === null) return
      if (observed !== el) {
        if (observed !== null) ro.unobserve(observed)
        ro.observe(el)
        observed = el
      }
      const rect = el.getBoundingClientRect()
      const vw = document.documentElement.clientWidth
      const bw = btn.offsetWidth
      let x = rect.right + GAP_PX
      if (x + bw > vw - VIEWPORT_PADDING_PX) x = Math.max(VIEWPORT_PADDING_PX, vw - bw - VIEWPORT_PADDING_PX)
      setLeft(`${x}px`)
    }

    const onScroll = (): void => {
      const top = sc !== null ? sc.scrollTop : document.documentElement.scrollTop
      setVisible(top > SHOW_THRESHOLD_PX)
    }

    const ro = new ResizeObserver(reposition)
    reposition()
    onScroll()
    window.addEventListener('resize', reposition)
    if (sc !== null) sc.addEventListener('scroll', onScroll)
    return () => {
      window.removeEventListener('resize', reposition)
      if (sc !== null) sc.removeEventListener('scroll', onScroll)
      ro.disconnect()
    }
  }, [props.anchorId])

  const onClick = (): void => {
    const sc = findScrollContainer(ref.current)
    const reduce = typeof window.matchMedia === 'function'
      && window.matchMedia('(prefers-reduced-motion: reduce)').matches
    const behavior: ScrollBehavior = reduce ? 'auto' : 'smooth'
    if (sc !== null) sc.scrollTo({ top: 0, behavior })
    else window.scrollTo({ top: 0, behavior })
  }

  return h('button', {
    ref,
    type: 'button',
    className: `dsh-tdt-backtotop${visible ? ' is-visible' : ''}`,
    style: { left },
    'aria-label': '回到顶部',
    title: '回到顶部',
    onClick,
  }, h(IconChevronUpOutlineRegular, { size: 20 }))
}
