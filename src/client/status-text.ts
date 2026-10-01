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
