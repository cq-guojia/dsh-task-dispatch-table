// time-text.ts — 时间**文案层**（唯一实现）：相对时间 / 倒计时 / HH:mm / 「预计执行」整行。
//
// **为什么单独成文件**（design/client-refresh-disposition.md §三 A3）：这一层本来住在 `task-info.tsx`
// （一个面板文件）里，却被 4 个页面反向 import —— 属于「共享程序寄居页面」。与 `schedule-text.ts`
// / `status-text.ts` 同构：**同类文案只此一份，别处不许再写**。
import { createElement as h, type ReactNode } from 'react'
import { formatDateTime, pad2 } from './format'
import { LiveText } from './ui'
import type { Translate } from './locales'

/** 没有这个时刻时的占位（停用任务没有下次执行；从未执行过没有上次）——图标保留，只占位时间。 */
export const NO_TIME = '--'

export const sameCalendarDay = (a: Date, b: Date): boolean =>
  a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate()

export function relativePast(iso: string, nowMs: number, tt: Translate): string {
  const diff = nowMs - Date.parse(iso)
  if (!(diff >= 0)) return tt('relNow')
  if (diff < 60_000) return tt('relJustNow')
  const minutes = Math.floor(diff / 60_000)
  if (minutes < 60) return tt('relMinutesAgo', { n: minutes })
  const hours = Math.floor(minutes / 60)
  if (hours < 24) return tt('relHoursAgo', { n: hours })
  const days = Math.floor(hours / 24)
  if (days < 7) return tt('relDaysAgo', { n: days })
  if (days < 30) return tt('relWeeksAgo', { n: Math.floor(days / 7) })
  const months = Math.floor(days / 30)
  if (months < 12) return tt('relMonthsAgo', { n: months })
  return tt('relYearsAgo', { n: Math.floor(days / 365) })
}

export function relativeFuture(iso: string, nowMs: number, tt: Translate): string {
  const target = Date.parse(iso)
  // 解析失败（畸形 ISO）⇒ 占位符，别渲染出「NaN 年后」（2026-09-30 专家团复核）。
  if (!Number.isFinite(target)) return NO_TIME
  const diff = target - nowMs
  if (diff <= 0) return tt('relPast')
  if (diff < 60_000) return tt('relNow')
  const minutes = Math.floor(diff / 60_000)
  if (minutes < 60) return tt('relMinutes', { n: minutes })
  const date = new Date(target)
  const now = new Date(nowMs)
  const tomorrow = new Date(now.getTime() + 24 * 3600_000)
  if (sameCalendarDay(date, now)) return tt('relToday', { time: clockOf(iso) })
  if (sameCalendarDay(date, tomorrow)) return tt('relTomorrow', { time: clockOf(iso) })
  const days = Math.ceil(diff / 86_400_000)
  if (days < 7) return tt('relDays', { n: days })
  if (days < 30) return tt('relWeeks', { n: Math.floor(days / 7) })
  const months = Math.floor(days / 30)
  if (months < 12) return tt('relMonths', { n: months })
  return tt('relYears', { n: Math.floor(days / 365) })
}

/**
 * 24 小时内的秒级倒计时（用户 2026-09-30 定的分级，与任务列表「下次执行」同款）：
 * - 小时为 0 ⇒ 不显示小时（几分几秒 显示 `5:09`）；
 * - 只剩秒 ⇒ 仍要显示分位（`0:09`）；
 * - 超过 24 小时交给 `relativeFuture`（明天 / 三天后 / N 周后）。
 * 每次都用「目标 − 系统当前时间」现算，不做算术递减 ⇒ 永不漂移。
 */
export function countdownText(iso: string, nowMs: number, tt: Translate): string {
  const diff = Date.parse(iso) - nowMs
  if (Number.isNaN(diff)) return NO_TIME
  if (diff <= 0) return tt('relNow')
  const total = Math.floor(diff / 1000)
  const hours = Math.floor(total / 3600)
  const minutes = Math.floor((total % 3600) / 60)
  const seconds = total % 60
  // 数字一律两位（用户 2026-09-30：「都把它补成两位」）⇒ `05:09` / `01:05:09`，位数恒定不跳。
  return hours > 0 ? `${pad2(hours)}:${pad2(minutes)}:${pad2(seconds)}` : `${pad2(minutes)}:${pad2(seconds)}`
}

/**
 * 「预计执行 / 下次执行」的**统一文案**：把时间传进去，由本函数按「现在」算出该显示什么——
 * 已到点 ⇒ 「即将执行」；24 小时内 ⇒ 秒级倒计时（countdownText）；超过 24 小时 ⇒ 社交化相对时间（relativeFuture）。
 * 所有倒计时展示位（任务卡片「下次执行」、查看档「预计执行」、日历「计划」）都吃这一份，逻辑不再各处各写。
 */
export function nextExecLabel(iso: string, nowMs: number, t: Translate): string {
  const target = Date.parse(iso)
  if (!Number.isFinite(target)) return NO_TIME
  const diff = target - nowMs
  if (diff <= 0) return t('relNow')
  if (diff < 24 * 3600_000) return countdownText(iso, nowMs, t)
  return relativeFuture(iso, nowMs, t)
}

/** HH:mm（本机时区）。**全仓唯一**的 HH:mm 实现——别处不许再写一份（design/client-refresh-disposition.md §三 M2）。 */
export function clockOf(iso: string): string {
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return '—'
  return `${pad2(d.getHours())}:${pad2(d.getMinutes())}`
}

/**
 * 「预计执行」行的渲染：两部分——左社交化相对时间（30 分钟后 / 今天 HH:mm / 3 天后…，走
 * `relativeFuture`），右具体时刻（YYYY-MM-DD HH:mm:ss）；中间竖线分隔。相对时间用 LiveText 每秒自刷。
 * 无下次执行（停用 / 一次性已收尾）⇒ 显示「无」。先收窄 `next` 为 string 再喂给格式化函数。
 */
export function renderNextExec(next: string | null, t: Translate): ReactNode {
  if (next === null) return h('span', { style: { color: 'var(--tdt-fg-3)' } }, t('listNone'))
  return h('span', { style: { display: 'inline-flex', alignItems: 'center', gap: '8px', minWidth: 0 } },
    h(LiveText, { render: (nowMs: number) => nextExecLabel(next, nowMs, t) }),
    h('span', { style: { color: 'var(--tdt-fg-3)', flex: 'none' } }, '│'),
    h('span', { style: { fontVariantNumeric: 'tabular-nums' } }, formatDateTime(next, { seconds: true, fallback: NO_TIME })),
  )
}
