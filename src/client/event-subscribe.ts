// event-subscribe.ts — 前端**单例**事件订阅封装（design/event-push.md §七）；
// 同时也是全站**唯一**的重连保底（design/client-refresh-disposition.md §一 / 规矩 R2）。
//
// 全站只有这一条连接、也只有这里做重连：
//   ① 浏览器 `EventSource` 自带重连（基础层）；
//   ② **看门狗**：连续 >30s 仍未 OPEN（含「一直重试连不上」与「假死没触发 error」）⇒ 主动 close + 重建；
//   ③ 每次（重）连成功 ⇒ 通知所有 resync 订阅者 ⇒ 各页**重读一次当前值**
//      （规矩 R3：数据脏了页面自己刷，**不回补、不追历史**）。
//
// ⚠️ 页面只负责「订阅 + 收到后刷什么」——**不许**自己写重连 / 退避 / 兜底（那就违反 R2）。
import { useEffect, useRef } from 'react'
import type { EventTypeValue, PushEvent } from '../event-catalog.js'
import { API_PREFIX } from './query'

/** 事件流地址：前缀取自唯一真源 `query.ts`（M9；不 import index 以免成环）。 */
const EVENTS_URL = `${API_PREFIX}/events`
/** 看门狗巡检间隔。 */
const WATCHDOG_MS = 5_000
/** 连续未连上的容忍上限：超过它主动重建连接。 */
const RECONNECT_AFTER_MS = 30_000

type EventHandler = (event: PushEvent) => void
type ResyncHandler = () => void

const byType = new Map<EventTypeValue, Set<EventHandler>>()
const resyncHandlers = new Set<ResyncHandler>()
let source: EventSource | null = null
let watchdog: number | null = null
/** 本轮「未连上」的起始时刻（0 = 当前处于 OPEN）。 */
let unhealthySince = 0

/** 广播「（重）连成功」——各页据此重读一次当前值。 */
function dispatchResync(): void {
  for (const handler of [...resyncHandlers]) {
    try { handler() } catch { /* 单个订阅者出错不影响其它 */ }
  }
}

function openSource(): void {
  const es = new EventSource(EVENTS_URL)
  es.onmessage = (msg: MessageEvent) => {
    let event: PushEvent
    try { event = JSON.parse(msg.data as string) as PushEvent } catch { return }
    const handlers = byType.get(event.type)
    if (handlers === undefined) return
    for (const handler of [...handlers]) {
      try { handler(event) } catch { /* 单个订阅者出错不影响其它 */ }
    }
  }
  es.onopen = () => { unhealthySince = 0; dispatchResync() }
  // onerror 刻意不处理：浏览器自己会重试；「重试卡死」的兜底交给看门狗（见 startWatchdog）。
  source = es
}

/** 看门狗：连不上超过阈值 ⇒ 主动重建（浏览器一直重试却连不上时的唯一出路）。 */
function startWatchdog(): void {
  if (watchdog !== null) return
  watchdog = window.setInterval(() => {
    if (source !== null && source.readyState === EventSource.OPEN) { unhealthySince = 0; return }
    if (unhealthySince === 0) { unhealthySince = Date.now(); return }
    if (Date.now() - unhealthySince < RECONNECT_AFTER_MS) return
    source?.close()
    openSource()
    unhealthySince = 0
  }, WATCHDOG_MS)
}

/** 懒建单例连接（首个订阅者出现时才连；**建了就不主动关**——「只要页面在，就有重连机制」）。 */
function ensureSource(): void {
  if (typeof EventSource === 'undefined') return
  startWatchdog()
  if (source !== null) return
  unhealthySince = 0
  openSource()
}

/** 订阅一组事件类型；`handler` 每次渲染都换也不会反复重建订阅（内部走 ref）。 */
export function useEvents(types: readonly EventTypeValue[], handler: EventHandler): void {
  const ref = useRef(handler)
  ref.current = handler
  // 依赖用 `types.join()`：调用方一般传常量数组，等价于按内容比。
  const key = types.join(',')
  useEffect(() => {
    ensureSource()
    const stable: EventHandler = (event) => ref.current(event)
    const sets: Array<Set<EventHandler>> = []
    for (const type of types) {
      let set = byType.get(type)
      if (set === undefined) { set = new Set(); byType.set(type, set) }
      set.add(stable)
      sets.push(set)
    }
    return () => {
      for (const set of sets) set.delete(stable)
      // 空的 Set 留给 GC 自理（Map 键少、不值得为它多一层引用计数）。
    }
    // 依赖用 key（types 的内容指纹）而非 types 引用：调用方每次传新数组也不会重建订阅。
  }, [key])
}

/** 订阅「（重）连成功」——各页据此补读一次当前值（断线期间可能漏过事件）。 */
export function useResync(handler: ResyncHandler): void {
  const ref = useRef(handler)
  ref.current = handler
  useEffect(() => {
    ensureSource()
    const stable: ResyncHandler = () => ref.current()
    resyncHandlers.add(stable)
    return () => { resyncHandlers.delete(stable) }
  }, [])
}
