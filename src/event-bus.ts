// event-bus.ts — 进程内事件广播器：**唯一出口 + 中间层合并**（design/event-push.md §四）。
//
// 为什么合并放这里：事件是「失效信号」，同一 key 短时间多次变更合并成一条**零信息损失**（值靠重读）；
// 放中间层 ⇒ 消费者无感，窗口是**单处常量**，不必在前端各页分散写 debounce。
import type { PushEvent } from './event-catalog.js'

export interface EventBusOptions {
  /** 合并窗口（毫秒）：同 key 在该窗口内的重复事件合并成一条。默认 200ms。 */
  windowMs?: number
  /** 最大等待（毫秒）：兜底上界，窗口配置得比它还大时按它发。默认 1000ms。 */
  maxWaitMs?: number
}

export interface EventBus {
  /** 变更点**唯一调用口**（不写库、不抛错）。 */
  emit(event: PushEvent): void
  /** 每个订阅者（一条 SSE 连接）注册一次；返回退订函数。 */
  subscribe(send: (event: PushEvent) => void): () => void
  /** 清掉待发缓冲 / 定时器 / 订阅集合（插件 dispose 用）。 */
  dispose(): void
}

const DEFAULT_WINDOW_MS = 200
const DEFAULT_MAX_WAIT_MS = 1_000

/** 合并 key = `type` + payload 里的身份（taskId / instanceId / id / ids），无身份则只按 type。 */
function keyOf(event: PushEvent): string {
  const p = event.payload
  if (p === undefined) return event.type
  const id = p.taskId ?? p.instanceId ?? p.id
  if (typeof id === 'string' && id !== '') return `${event.type}:${id}`
  const ids = p.ids
  if (Array.isArray(ids) && ids.length > 0) return `${event.type}:${ids.join(',')}`
  return event.type
}

export function createEventBus(opts: EventBusOptions = {}): EventBus {
  const windowMs = opts.windowMs ?? DEFAULT_WINDOW_MS
  const maxWaitMs = opts.maxWaitMs ?? DEFAULT_MAX_WAIT_MS
  const subscribers = new Set<(event: PushEvent) => void>()
  /** 待发缓冲：key → 最新事件（同 key 只留最后一条）+ 首个到达时刻。 */
  const pending = new Map<string, { event: PushEvent; firstAt: number }>()
  let timer: ReturnType<typeof setTimeout> | null = null

  const flush = (): void => {
    timer = null
    if (pending.size === 0) return
    const batch = [...pending.values()].map(item => item.event)
    pending.clear()
    for (const send of subscribers) {
      for (const event of batch) {
        // 单个订阅者（连接）出错不连累其它订阅者，也不影响广播器。
        try { send(event) } catch { /* 忽略：连接已被对端关闭等 */ }
      }
    }
  }

  return {
    emit(event) {
      if (subscribers.size === 0) return // 无人听 ⇒ 不缓冲（也避免空转定时器）
      const now = Date.now()
      const key = keyOf(event)
      const prev = pending.get(key)
      const firstAt = prev === undefined ? now : prev.firstAt
      pending.set(key, { event, firstAt })
      // ponytail: 合并按「首个事件起算的固定窗口」而非「尾随 debounce」——200ms 差异不可感，
      // 且免掉逐事件重置计时器带来的「持续高频把别的 key 一起推迟」问题。窗口不合适改常量即可。
      if (timer !== null) return
      timer = setTimeout(flush, Math.min(windowMs, Math.max(0, maxWaitMs - (now - firstAt))))
    },
    subscribe(send) {
      subscribers.add(send)
      return () => { subscribers.delete(send) }
    },
    dispose() {
      if (timer !== null) { clearTimeout(timer); timer = null }
      pending.clear()
      subscribers.clear()
    },
  }
}
