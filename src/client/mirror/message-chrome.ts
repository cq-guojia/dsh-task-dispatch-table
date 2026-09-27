// 官方对照：packages/client/ui-chat/src/client/chat/message-chrome.ts（0.1.7-rc.2 lib/client.js:976-1100）
//   + token-format.ts（lib/client.js:6195-6225）。
// 原样照抄官方的时长 / 时钟 / token 文案格式化，保证弹窗里的字符与官方逐字一致：
//   用时 34秒（duration.seconds）/ 9月26日 01:35（clock.md + 时钟）/ 用量 91.5K tok。
import { useEffect, useState } from 'react'
import type { Translate } from '../locales'

/** 两位补零（官方 message-chrome pad2）。 */
export function pad2(n: number): string {
  return String(n).padStart(2, '0')
}

/** 本机当日零点（官方 startOfLocalDay）。 */
export function startOfLocalDay(ms: number): number {
  const d = new Date(ms)
  d.setHours(0, 0, 0, 0)
  return d.getTime()
}

/** 距下一个本机零点（官方 msUntilNextLocalMidnight）。 */
export function msUntilNextLocalMidnight(ms: number): number {
  const next = new Date(ms)
  next.setHours(24, 0, 0, 0)
  return Math.max(next.getTime() - ms, 1)
}

/**
 * 官方 formatRunDuration：整秒；≥1 分带零补秒；≥1 小时带零补分秒。
 */
export function formatRunDuration(ms: number, t: Translate): string {
  const total = Math.max(0, Math.floor(ms / 1e3))
  const hours = Math.floor(total / 3600)
  const minutes = Math.floor(total / 60) % 60
  const seconds = total % 60
  if (hours > 0) return t('durationHours', { hours, minutes: pad2(minutes), seconds: pad2(seconds) })
  return minutes > 0
    ? t('durationMinutes', { minutes, seconds: pad2(seconds) })
    : t('durationSeconds', { seconds })
}

/** 官方 formatLiveRunDuration：秒不补零、分钟自 60 秒起。 */
export function formatLiveRunDuration(ms: number, t: Translate): string {
  const totalSeconds = Math.max(0, Math.floor(ms / 1e3))
  const hours = Math.floor(totalSeconds / 3600)
  const minutes = Math.floor(totalSeconds / 60) % 60
  const seconds = String(totalSeconds % 60)
  if (hours > 0) return t('durationHours', { hours, minutes: pad2(minutes), seconds })
  return minutes > 0
    ? t('durationMinutes', { minutes, seconds })
    : t('durationSeconds', { seconds })
}

/**
 * 官方 formatMessageClock：同日 → `HH:mm`；同年 → `{m}月{d}日 HH:mm`；跨年 → `{y}年{m}月{d}日 HH:mm`。
 */
export function formatMessageClock(time: number, t: Translate, now: number = Date.now()): string {
  const d = new Date(time)
  const n = new Date(now)
  const clock = `${pad2(d.getHours())}:${pad2(d.getMinutes())}`
  if (d.getFullYear() === n.getFullYear() && d.getMonth() === n.getMonth() && d.getDate() === n.getDate()) return clock
  const params = { y: d.getFullYear(), m: d.getMonth() + 1, d: d.getDate() }
  const template = d.getFullYear() === n.getFullYear() ? t('clockDate', params) : t('clockDateYear', params)
  return `${template} ${clock}`
}

/** 官方 useCalendarDay：跨本机零点自动重渲染（时钟文案与「今天」判定跟着走）。 */
export function useCalendarDay(): number {
  const [day, setDay] = useState<number>(() => startOfLocalDay(Date.now()))
  useEffect(() => {
    let timer: ReturnType<typeof setTimeout> | undefined
    const arm = (): void => {
      const now = Date.now()
      setDay(startOfLocalDay(now))
      timer = setTimeout(arm, msUntilNextLocalMidnight(now))
    }
    timer = setTimeout(arm, msUntilNextLocalMidnight(Date.now()))
    return () => { if (timer !== undefined) clearTimeout(timer) }
  }, [])
  return day
}

/** 官方 formatTokens：517 / 12.2K / 517K / 1.2M。 */
export function formatTokens(value: number, t: Translate): string {
  const scaled = (candidate: number): string =>
    candidate >= 100 ? String(Math.round(candidate)) : String(Math.round(candidate * 10) / 10)
  if (value < 1e3) return String(value)
  if (value < 1e6) return t('numberThousand', { value: scaled(value / 1e3) })
  return t('numberMillion', { value: scaled(value / 1e6) })
}

/** 官方 formatCompactCount：紧凑 token 数 + 「 tok」。 */
export function formatCompactCount(value: number, t: Translate): string {
  return t('turnUsageCount', { count: formatTokens(value, t) })
}

/** 官方 formatExactTokens：按本地千分位分组（number.groupSeparator）。 */
export function formatExactTokens(value: number, t: Translate): string {
  const digits = String(value)
  const groups: string[] = []
  for (let end = digits.length; end > 0; end -= 3) groups.unshift(digits.slice(Math.max(0, end - 3), end))
  return groups.join(t('numberGroupSeparator'))
}

/** 官方 formatExactCount：精确计数 + 「 tok」。 */
export function formatExactCount(value: number, t: Translate): string {
  return t('turnUsageCount', { count: formatExactTokens(value, t) })
}

/** 官方 roundedPercentUnits（message-chrome.ts:1024）：按精确比例取整，正半数向上。 */
function roundedPercentUnits(cacheReadTokens: number, denominator: number, decimalPlaces: number): number {
  const scale = (decimalPlaces === 0 ? 1 : 10) * 100
  const doubledScale = scale * 2
  const denominatorQuotient = Math.floor(denominator / doubledScale)
  const denominatorRemainder = denominator % doubledScale
  let lower = 0
  let upper = scale
  while (lower < upper) {
    const candidate = Math.floor((lower + upper + 1) / 2)
    const factor = candidate * 2 - 1
    if (cacheReadTokens >= factor * denominatorQuotient + Math.ceil(factor * denominatorRemainder / doubledScale)) lower = candidate
    else upper = candidate - 1
  }
  return lower
}

/** 官方 displayPercentUnits。 */
function displayPercentUnits(units: number, decimalPlaces: number): string {
  if (decimalPlaces === 0) return String(units)
  const whole = Math.floor(units / 10)
  const tenths = units % 10
  return tenths === 0 ? String(whole) : `${whole}.${tenths}`
}

/**
 * 官方 formatCacheHitPercent：缓存命中率；部分命中不四舍五入成 100%（自动加精度）。
 * @returns 百分比文本；无输入时 null。
 */
export function formatCacheHitPercent(cacheReadTokens: number, promptTokens: number, decimalPlaces = 0): string | null {
  if (promptTokens === 0) return null
  const missedInputTokens = promptTokens - cacheReadTokens
  if (missedInputTokens === 0) return '100'
  const roundedUnits = roundedPercentUnits(cacheReadTokens, promptTokens, decimalPlaces)
  if (roundedUnits < (decimalPlaces === 0 ? 100 : 1e3)) return displayPercentUnits(roundedUnits, decimalPlaces)
  let distinguishingPlaces = 1
  let scaledDoubleGap = missedInputTokens * 200
  const denominatorTens = Math.floor(promptTokens / 10)
  while (scaledDoubleGap <= denominatorTens) {
    scaledDoubleGap *= 10
    distinguishingPlaces += 1
  }
  const denominatorOnes = promptTokens % 10
  let roundedLoss = 5
  for (let loss = 1; loss < 5; loss += 1) {
    const factor = loss * 2 + 1
    const threshold = factor * denominatorTens + Math.floor(factor * denominatorOnes / 10)
    if (scaledDoubleGap <= threshold) {
      roundedLoss = loss
      break
    }
  }
  return `99.${'9'.repeat(distinguishingPlaces - 1)}${10 - roundedLoss}`
}
