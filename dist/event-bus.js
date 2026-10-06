const DEFAULT_WINDOW_MS = 200;
const DEFAULT_MAX_WAIT_MS = 1_000;
/** 合并 key = `type` + payload 里的身份（taskId / instanceId / id / ids），无身份则只按 type。 */
function keyOf(event) {
    const p = event.payload;
    if (p === undefined)
        return event.type;
    const id = p.taskId ?? p.instanceId ?? p.id;
    if (typeof id === 'string' && id !== '')
        return `${event.type}:${id}`;
    const ids = p.ids;
    if (Array.isArray(ids) && ids.length > 0)
        return `${event.type}:${ids.join(',')}`;
    return event.type;
}
export function createEventBus(opts = {}) {
    const windowMs = opts.windowMs ?? DEFAULT_WINDOW_MS;
    const maxWaitMs = opts.maxWaitMs ?? DEFAULT_MAX_WAIT_MS;
    const subscribers = new Set();
    /** 待发缓冲：key → 最新事件（同 key 只留最后一条）+ 首个到达时刻。 */
    const pending = new Map();
    let timer = null;
    const flush = () => {
        timer = null;
        if (pending.size === 0)
            return;
        const batch = [...pending.values()].map(item => item.event);
        pending.clear();
        for (const send of subscribers) {
            for (const event of batch) {
                // 单个订阅者（连接）出错不连累其它订阅者，也不影响广播器。
                try {
                    send(event);
                }
                catch { /* 忽略：连接已被对端关闭等 */ }
            }
        }
    };
    return {
        emit(event) {
            if (subscribers.size === 0)
                return; // 无人听 ⇒ 不缓冲（也避免空转定时器）
            const now = Date.now();
            const key = keyOf(event);
            const prev = pending.get(key);
            const firstAt = prev === undefined ? now : prev.firstAt;
            pending.set(key, { event, firstAt });
            // ponytail: 合并按「首个事件起算的固定窗口」而非「尾随 debounce」——200ms 差异不可感，
            // 且免掉逐事件重置计时器带来的「持续高频把别的 key 一起推迟」问题。窗口不合适改常量即可。
            if (timer !== null)
                return;
            timer = setTimeout(flush, Math.min(windowMs, Math.max(0, maxWaitMs - (now - firstAt))));
        },
        subscribe(send) {
            subscribers.add(send);
            return () => { subscribers.delete(send); };
        },
        dispose() {
            if (timer !== null) {
                clearTimeout(timer);
                timer = null;
            }
            pending.clear();
            subscribers.clear();
        },
    };
}
