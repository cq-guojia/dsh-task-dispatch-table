// status-text.ts — 实例状态的**通用短名映射单源**（用户 2026-10-02：状态名别各处各写一份，
// 统一成几个字的通用名字，一处改处处生效）。
//
// 用 `t()` 走 locales（zh / en 各一份），而不是写死中文——面板语言跟随宿主。
// 展示状态名的所有位置（卡片三面板 / 执行记录页 / 未来总查询页）一律经 `statusTextOf` 取名，
// **禁止**再就地打印原始 status 串或另写映射。
import type { LocaleKey, Translate } from './locales'

/** 七态全集（与 `src/store.ts` 的 `InstanceStatus` 同形；客户端不跨半侧引类型，此处本地声明）。 */
export const INSTANCE_STATUSES = [
  'pending', 'dispatched', 'running', 'succeeded', 'failed', 'skipped', 'unknown',
] as const

export type InstanceStatusName = (typeof INSTANCE_STATUSES)[number]

/** 状态 → 文案键（唯一映射表）。 */
const STATUS_LABEL_KEYS: Record<InstanceStatusName, LocaleKey> = {
  pending: 'statusPending',
  dispatched: 'statusDispatched',
  running: 'statusRunning',
  succeeded: 'statusSucceeded',
  failed: 'statusFailed',
  skipped: 'statusSkipped',
  unknown: 'statusUnknown',
}

/** 状态 → 通用短名（zh 统一**两字**：排队 / 派发 / 运行 / 成功 / 失败 / 跳过 / 未知，用户 2026-10-02）。 */
export function statusTextOf(status: string, t: Translate): string {
  const key = (STATUS_LABEL_KEYS as Record<string, LocaleKey>)[status]
  // 认不出的状态（未来新增 / 脏数据）⇒ 原样显示真值，不编造名字。
  return key === undefined ? status : t(key)
}

/**
 * **过滤桶**：界面上的「运行中 / 失败 / 成功」各对应哪些真实状态 —— 全站唯一一份。
 *
 * 为什么要单源（2026-10-04 评审）：卡片执行记录面板与执行记录总查询页各写了一份，
 * 且**语义还不一样**（一个 `running` 含 pending/unknown，另一个只含 dispatched/running）⇒
 * 同一个下拉档位在两页筛出不同结果。这里是唯一真源，两页都从这里取。
 */
export const INSTANCE_STATUS_BUCKETS: Readonly<Record<'running' | 'failed' | 'succeeded', readonly string[]>> = {
  running: ['pending', 'dispatched', 'running', 'unknown'],
  failed: ['failed', 'skipped'],
  succeeded: ['succeeded'],
}

/** 桶 → 传给后端的 `status` 值（逗号分隔由调用方拼）；不认识的桶返回 undefined（不过滤，不猜）。 */
export function statusesOfBucket(bucket: string): readonly string[] | undefined {
  return (INSTANCE_STATUS_BUCKETS as Record<string, readonly string[]>)[bucket]
}

/** 是否「在跑」（已派发未定终态）—— 语义查询单源：色条脉动 / 图标 / 文案都用它，不许各写一份。 */
export function isRunningStatus(status: string): boolean {
  return status === 'dispatched' || status === 'running'
}

/**
 * 状态 → 语义色调（**表现层只做「色调 → 自己的画法」**：时间轴映射成色条、卡片映射成图标）。
 * 语义维（哪些状态算失败 / 算在跑）只在这里判一次。
 */
export function statusToneOf(status: string): 'ok' | 'bad' | 'warn' | 'busy' | 'neutral' {
  if (status === 'succeeded') return 'ok'
  if (status === 'failed') return 'bad'
  if (status === 'skipped') return 'warn'
  if (isRunningStatus(status)) return 'busy'
  return 'neutral'
}
