// event-subscribe.ts — 前端**单例**事件订阅封装（design/event-push.md §七）。
//
// 全页共享**一条** `EventSource`：多次 `useEvents` 只是注册回调，**不各建连接**。
// 断线由浏览器 `EventSource` **自动重连**；`onopen`（首次连上或重连成功）触发一次 resync
// ⇒ 各页重读一次**当前值**（补的是「当前真相」，**不追历史事件**——断线期间的事件可丢，设计如此）。
import { useEffect, useRef } from 'react'
import type { EventTypeValue, PushEvent } from '../event-catalog.js'

/** 与 `src/client/index.ts` 的 `DISPATCH_API_PREFIX` 同口径（相对路径；不 import index 以免成环）。 */
const EVENTS_URL = 'api/task-dispatch-table/events'

type EventHandler = (event: PushEvent) => void
type ResyncHandler = () => void

const byType = new Map<EventTypeValue, Set<EventHandler>>()
const resyncHandlers = new Set<ResyncHandler>()
let source: EventSource | null = null

/** 懒建单例连接（首个订阅者出现时才连；无订阅者时不连、不空转）。 */
function ensureSource(): void {
  if (source !== null || typeof EventSource === 'undefined') return
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
  // 建连成功（含浏览器自动重连成功）⇒ 通知各页重读一次当前值。
  es.onopen = () => {
    for (const handler of [...resyncHandlers]) {
      try { handler() } catch { /* 忽略 */ }
    }
  }
  // onerror 不处理：EventSource 自带重连（重连成功会再触发 onopen）。
  source = es
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

/** 订阅「重连成功」——各页据此补读一次当前值（断线期间可能漏过事件）。 */
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
