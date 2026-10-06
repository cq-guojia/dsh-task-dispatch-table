// event-catalog.ts — 事件推送的**事件目录**（前后端共用）。
//
// 事件模型：`{ type: 固定常量, payload?: 任意业务对象 }`。
//  · `type` 只来自本文件（谁都不许随手造新码）；
//  · `payload` 由各业务自定义、**可为空**（如 FORCE_REFRESH）；
//  · 事件是「**失效信号**」——**不承载数据、不写库**，订阅方收到后自行重读真源（任务表 / 实例表）。
//
// ⚠️ 本文件必须**纯常量、无 Node 依赖**：它会被 tsdown 内联进单文件客户端产物 `dist/client.js`
//    （见 design/event-push.md 与 docs/design/external/host-webserver-streaming.md）。

/** 事件类型目录（前后端唯一真源；新增类型只在这里加）。 */
export const EventType = {
  /** 任务定义增删改（含开关 / 整批替换 / 版本删除 / 附件文件变更；这些写路径都汇聚到 onDefinitionsChanged）。 */
  TASKS_CHANGED: 'tasks.changed',
  /** 实例进入 dispatched / running（自动调度或「立即执行」）。 */
  TASK_RUN_STARTED: 'task.run.started',
  /** 实例成功终态。 */
  TASK_RUN_SUCCEEDED: 'task.run.succeeded',
  /** 实例失败终态（含判死 / 租约回收 / 回执缺失收敛）。 */
  TASK_RUN_FAILED: 'task.run.failed',
  /** 跳过 / 错过刻度 / 过期（「未执行」的原因类）。 */
  TASK_RUN_SKIPPED: 'task.run.skipped',
  /** 其余实例行变化（重试退回 / unknown 复活 / 转 running / redispatch / 删行 / 阻塞原因变化）。 */
  TASK_RUN_CHANGED: 'task.run.changed',
  /** 插件配置变更。 */
  CONFIG_CHANGED: 'config.changed',
  /** 无参：强制前端重读一次当前值（后端升级 / 索引重建等）。 */
  FORCE_REFRESH: 'force.refresh',
} as const

export type EventTypeValue = typeof EventType[keyof typeof EventType]

/** 「实例运行态」这一族事件（订阅方通常一并关心）。 */
export const RUN_EVENT_TYPES: readonly EventTypeValue[] = [
  EventType.TASK_RUN_STARTED,
  EventType.TASK_RUN_SUCCEEDED,
  EventType.TASK_RUN_FAILED,
  EventType.TASK_RUN_SKIPPED,
  EventType.TASK_RUN_CHANGED,
]

/**
 * 连接心跳的事件类型（**不属于业务事件目录**，故意不在 `EventType` 里）：
 * 服务端每 `SSE_HEARTBEAT_MS` 发一条，客户端只用它判断「这条连接还是活的」——这是「`readyState` 是
 * OPEN 但已经半死」唯一可观测的判据（反向代理静默丢流 / 无 FIN 的黑洞）。
 * ⚠️ 必须是**真实 data 帧**：SSE 注释帧（`: ping`）浏览器直接吞掉，前端 `onmessage` 根本看不到。
 * 前端 `byType` 里没有它的订阅者 ⇒ 收到后直接丢弃，不会当成业务事件（2026-10-06 审计）。
 */
export const HEARTBEAT_TYPE = 'sys.ping'

/** 与心跳相关的**非**业务类型集合（订阅方一律忽略；留一处便于将来扩充）。 */
export const NON_BUSINESS_TYPES: readonly string[] = [HEARTBEAT_TYPE]

/** 事件信封：type 固定；payload 任意（可为空）。 */
export interface PushEvent {
  type: EventTypeValue
  payload?: Record<string, unknown>
}

/**
 * 实例状态 → 事件类型（`RuntimeIndex.markTerminal` / `markDispatched` 的映射）。
 * 只按「类型」订阅的前端拿它区分成功 / 失败 / 跳过 / 其它；状态细节交给重读。
 */
export function runEventTypeOf(status: string): EventTypeValue {
  switch (status) {
    case 'succeeded': return EventType.TASK_RUN_SUCCEEDED
    case 'failed': return EventType.TASK_RUN_FAILED
    case 'skipped': return EventType.TASK_RUN_SKIPPED
    case 'dispatched':
    case 'running': return EventType.TASK_RUN_STARTED
    default: return EventType.TASK_RUN_CHANGED
  }
}
