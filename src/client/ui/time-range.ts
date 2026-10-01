/**
 * 时间范围 —— **预设档计算 + 日期边界归一**（纯函数，单源）。
 *
 * 边界约定（design/features/task-expand-panels.md §3.11）：**半开区间 `[from, to)`**——
 * 含起点、不含终点；上界 = 所选结束日期的**次日 00:00**（day 粒度）或**下一分钟 :00**（minute 粒度）。
 * 页面与查询层**不得各自算边界**，一律走 `rangeToQuery`（禁止 BETWEEN / 裸 `<= 当天`）。
 *
 * ⚠️ 全部走**本机时区**（与 `format.ts` 一致）；不合法值按「不过滤」返回 undefined，不编造时间。
 */

/** 粒度：只到天 / 到分。 */
export type TimePrecision = 'day' | 'minute'

/** 预设档 id（调用方按需选子集显示）。 */
export type TimePresetId = 'today' | 'yesterday' | 'thisWeek' | 'lastWeek' | 'thisMonth' | 'lastMonth'

/** 控件受控值：`YYYY-MM-DD`（day）或 `YYYY-MM-DD HH:mm`（minute）；空串 = 不过滤。 */
export interface TimeRangeValue {
  from: string
  to: string
}

/** 查询用半开区间（ISO 串；undefined = 该端不过滤）。 */
export interface TimeQuery {
  fromTs?: string
  toTs?: string
}

/** 全部预设档（缺省显示顺序）。 */
export const ALL_TIME_PRESETS: readonly TimePresetId[] = ['today', 'yesterday', 'thisWeek', 'lastWeek', 'thisMonth', 'lastMonth']

function pad2(n: number): string {
  return String(n).padStart(2, '0')
}

function ymd(d: Date): string {
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`
}

function ymdhm(d: Date): string {
  return `${ymd(d)} ${pad2(d.getHours())}:${pad2(d.getMinutes())}`
}

/** 当天 00:00（本机时区）。 */
function startOfDay(d: Date): Date {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate())
}

/** 周一为一周之始的 00:00。 */
function startOfWeek(d: Date): Date {
  const s = startOfDay(d)
  const offset = (s.getDay() + 6) % 7
  s.setDate(s.getDate() - offset)
  return s
}

/** 值串 → 年月日时分；不合法返回 null。 */
function parseValue(value: string): { y: number; m: number; d: number; hh: number; mm: number } | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})(?:[ T](\d{2}):(\d{2}))?$/.exec(value)
  if (match === null) return null
  return {
    y: Number(match[1]), m: Number(match[2]), d: Number(match[3]),
    hh: match[4] === undefined ? 0 : Number(match[4]),
    mm: match[5] === undefined ? 0 : Number(match[5]),
  }
}

/** 预设档 → 起止（本机时区、真实当前时间，非占位）。 */
export function presetRange(id: TimePresetId, precision: TimePrecision, now: Date = new Date()): TimeRangeValue {
  const withTime = precision === 'minute'
  const fmt = (d: Date): string => (withTime ? ymdhm(d) : ymd(d))
  const endOfDay = (d: Date): string => `${ymd(d)} 23:59`
  const start = startOfDay(now)
  switch (id) {
    case 'today':
      return { from: fmt(start), to: withTime ? ymdhm(now) : ymd(now) }
    case 'yesterday': {
      const y = new Date(start)
      y.setDate(y.getDate() - 1)
      return { from: fmt(y), to: withTime ? endOfDay(y) : ymd(y) }
    }
    case 'thisWeek': {
      const mon = startOfWeek(now)
      return { from: fmt(mon), to: withTime ? ymdhm(now) : ymd(now) }
    }
    case 'lastWeek': {
      const mon = startOfWeek(now)
      mon.setDate(mon.getDate() - 7)
      const sun = new Date(mon)
      sun.setDate(sun.getDate() + 6)
      return { from: fmt(mon), to: withTime ? endOfDay(sun) : ymd(sun) }
    }
    case 'thisMonth': {
      const first = new Date(now.getFullYear(), now.getMonth(), 1)
      return { from: fmt(first), to: withTime ? ymdhm(now) : ymd(now) }
    }
    case 'lastMonth': {
      const first = new Date(now.getFullYear(), now.getMonth() - 1, 1)
      const last = new Date(now.getFullYear(), now.getMonth(), 0)
      return { from: fmt(first), to: withTime ? endOfDay(last) : ymd(last) }
    }
  }
}

/**
 * 受控值 → 查询用**半开区间** `[from, to)`：
 * - day：from = 当日 00:00，to = 结束日的**次日 00:00**；
 * - minute：from = 当时分 :00，to = 结束分的**下一分钟 :00**。
 * 空串 / 不合法 ⇒ 该端 undefined（不过滤）。
 */
export function rangeToQuery(value: TimeRangeValue, precision: TimePrecision): TimeQuery {
  const fromParsed = value.from === '' ? null : parseValue(value.from)
  const toParsed = value.to === '' ? null : parseValue(value.to)
  let fromTs: string | undefined
  if (fromParsed !== null) {
    const d = precision === 'minute'
      ? new Date(fromParsed.y, fromParsed.m - 1, fromParsed.d, fromParsed.hh, fromParsed.mm, 0, 0)
      : new Date(fromParsed.y, fromParsed.m - 1, fromParsed.d, 0, 0, 0, 0)
    fromTs = Number.isNaN(d.getTime()) ? undefined : d.toISOString()
  }
  let toTs: string | undefined
  if (toParsed !== null) {
    // 半开：次日 00:00（day）/ 下一分钟 :00（minute）——含尾但不用 .999 补丁。
    const d = precision === 'minute'
      ? new Date(toParsed.y, toParsed.m - 1, toParsed.d, toParsed.hh, toParsed.mm + 1, 0, 0)
      : new Date(toParsed.y, toParsed.m - 1, toParsed.d + 1, 0, 0, 0, 0)
    toTs = Number.isNaN(d.getTime()) ? undefined : d.toISOString()
  }
  return { fromTs, toTs }
}
