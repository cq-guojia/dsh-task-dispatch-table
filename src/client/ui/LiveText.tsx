// LiveText.tsx — 每秒自刷新的一小块内容（全局心跳的渲染壳）；心跳本体见 `./ticker`。
//
// 从 `task-info.tsx` 归位到 `ui/`（design/client-refresh-disposition.md §三 A2）：它是**基础层组件**，
// 不该住在某个面板文件里被别的页面反向 import。
import { createElement as h, useEffect, useRef, useState, type ReactNode } from 'react'
import { subscribeTicker } from './ticker'

/**
 * 每秒自刷新的一小块：只有它自己重渲染（`render` 永远取最新闭包，ref 转发）。
 * 2026-09-30（决策 54）：`render` 由「只能返回字符串」放宽为**可返回节点** —— 「到点未派发」
 * 时要在这里就地换成三个方块的活动指示（文案换不出来，只能给节点）。
 */
export function LiveText(props: { render: (nowMs: number) => ReactNode; style?: Record<string, string | number> }) {
  const [, force] = useState(0)
  const renderRef = useRef(props.render)
  renderRef.current = props.render
  useEffect(() => subscribeTicker(() => force(v => v + 1)), [])
  return h('span', { style: props.style }, renderRef.current(Date.now()))
}
