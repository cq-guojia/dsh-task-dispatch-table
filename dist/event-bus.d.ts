import type { PushEvent } from './event-catalog.js';
export interface EventBusOptions {
    /** 合并窗口（毫秒）：同 key 在该窗口内的重复事件合并成一条。默认 200ms。 */
    windowMs?: number;
    /** 最大等待（毫秒）：兜底上界，窗口配置得比它还大时按它发。默认 1000ms。 */
    maxWaitMs?: number;
}
export interface EventBus {
    /** 变更点**唯一调用口**（不写库、不抛错）。 */
    emit(event: PushEvent): void;
    /** 每个订阅者（一条 SSE 连接）注册一次；返回退订函数。 */
    subscribe(send: (event: PushEvent) => void): () => void;
    /** 清掉待发缓冲 / 定时器 / 订阅集合（插件 dispose 用）。 */
    dispose(): void;
}
export declare function createEventBus(opts?: EventBusOptions): EventBus;
