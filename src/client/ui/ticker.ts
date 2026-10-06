// ticker.ts — 全站**唯一**的秒级心跳（`ui/` 基础层）；设计见 design/client-refresh-disposition.md §三 A1。
//
// **为什么单独成文件**：它本来是 `task-info.tsx`（一个面板文件）里的私货，却被多个页面用到
// ⇒ 「共享程序寄居页面」，别的页面只能从页面 import。归位到 `ui/` 后名副其实。
//
// ⚠️ 性能关键（用户 2026-09-30 反馈「延迟太严重」）：**不能**在列表顶层每秒 setState
// （那会整列表重渲染）。正确做法 = **全模块只有一个 interval**，需要动的文本各自订阅，
// 每秒只重渲染那一小块。**需要时间时一律用它，不许自己再写 setInterval(…, 1000)。**
import { useEffect, useState } from 'react'

const tickerListeners = new Set<() => void>()
let tickerTimer: number | null = null
/**
 * `visibilitychange` 处理器**只注册一次**（模块级）——2026-09-30 专家团复核：此前每次订阅起停
 * 都 `addEventListener` 且从不移除 ⇒ 反复重挂面板会累积 N 个监听、切回标签页时同一批订阅被调 N 次。
 * 这里注册一次、常驻（订阅集合空时遍历即空转，无副作用）。
 */
const onVisibilityChange = (): void => { for (const l of [...tickerListeners]) l() }
let visibilityBound = false

/** 订阅全局秒级心跳；返回退订。**第一个订阅者才起 interval，最后一个退订即停**。 */
export function subscribeTicker(cb: () => void): () => void {
  tickerListeners.add(cb)
  if (tickerTimer === null) {
    tickerTimer = window.setInterval(() => { for (const l of [...tickerListeners]) l() }, 1000)
    // 标签页被浏览器节流（后台 / 休眠）后回来 ⇒ 立刻对一次表，倒计时自动追上。
    if (!visibilityBound && typeof document !== 'undefined') {
      document.addEventListener('visibilitychange', onVisibilityChange)
      visibilityBound = true
    }
  }
  return () => {
    tickerListeners.delete(cb)
    if (tickerListeners.size === 0 && tickerTimer !== null) {
      window.clearInterval(tickerTimer)
      tickerTimer = null
    }
  }
}

/**
 * 每秒拿到「现在」（需要**时间值本身**时用，如悬浮文案）；与 `LiveText` 共用同一条心跳。
 * 不适合整列表用（每次 tick 会 setState 一次）——只在真正需要时间的小块里调。
 */
export function useNowMs(): number {
  const [nowMs, setNowMs] = useState(() => Date.now())
  useEffect(() => subscribeTicker(() => setNowMs(Date.now())), [])
  return nowMs
}
