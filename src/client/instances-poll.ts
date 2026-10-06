// instances-poll.ts — 实例视图「运行中就轮询刷新」的**单一实现**（用户 2026-10-06：别再各视图各写一遍轮询）。
//
// 为什么是轮询而不是推送：宿主（DSH）不会把「实例状态变化」推给客户端——客户端只靠轮询 HTTP 拿数据
// （服务端 `reconcile` 借 `session/event` 得知终态再写库，客户端感知不到）。所以「任务跑完、开着的那一页
// 状态不更新」这类问题，统一用「还有在跑的实例时静默轮询、跑完即停」解决，且抽成这一个 hook，
// 日程 / 执行记录等所有实例视图共用，避免到处各写一段 setInterval。
import { useEffect, useRef } from 'react'

/**
 * 只要 `hasRunning` 为真（列表里还有在跑的实例），就每 `ms` 毫秒静默调一次 `reload`；全部跑完即停。
 * 各视图把「自己的 reload」传进来即可（执行记录刷首屏、日程刷当月）。
 *
 * `reload` 存进 ref：即便调用方每次渲染都给新函数，轮询 interval 也不会反复重建，
 * 否则在频繁重渲的页面上计时器会不断被重置、永远不触发。
 *
 * @param reload 静默刷新回调（不应切 Loading、不应惊扰已展开的内容）。
 */
export function useInstancesRunningPoll(hasRunning: boolean, reload: () => void, ms = 5_000): void {
  const reloadRef = useRef(reload)
  reloadRef.current = reload
  useEffect(() => {
    if (!hasRunning) return
    const id = window.setInterval(() => reloadRef.current(), ms)
    return () => window.clearInterval(id)
  }, [hasRunning, ms])
}
