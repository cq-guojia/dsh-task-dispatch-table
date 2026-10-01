// format.ts — 客户端共用的「补零 / 时间串」格式化（2026-09-30 抽象收敛）。
//
// **为什么有这个文件**：`padStart(2,'0')` 此前散在 6 处、`YYYY-MM-DD HH:mm[:ss]` 手拼了 3 份
// （`task-list.formatFull` / `index.formatTime` / `task-editor.formatVersionTime`，口径各差一点：
// 有无秒、解析失败回退 `'—'` 还是原串）。收敛到这一处，改口径只改这里。
//
// ⚠️ 全部走**本机时区**（与原三处一致）；解析失败不抛错、按调用方给的兜底返回。
import type { LocaleKey } from './locales'

/** 两位补零：`9` → `09`（数字 / 纯数字字符串都收）。 */
export function pad2(value: number | string): string {
  return String(value).padStart(2, '0')
}

/**
 * ISO → `YYYY-MM-DD HH:mm`（`seconds: true` 时补 `:ss`）。
 * 解析失败 ⇒ `fallback`（缺省返回**原串**，不编造时间；要占位符就显式传，如 `fallback: '—'`）。
 */
export function formatDateTime(
  iso: string,
  opts?: { seconds?: boolean; fallback?: string },
): string {
  const ms = Date.parse(iso)
  if (Number.isNaN(ms)) return opts?.fallback ?? iso
  const d = new Date(ms)
  const base = `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())} ${pad2(d.getHours())}:${pad2(d.getMinutes())}`
  return opts?.seconds === true ? `${base}:${pad2(d.getSeconds())}` : base
}

/** 短时刻（用户 2026-10-02：计划时刻本来就没有「秒」，月日时分各两位即可）：`MM-DD HH:mm`。 */
export function formatShortStamp(iso: string): string {
  const ms = Date.parse(iso)
  if (Number.isNaN(ms)) return '—'
  const d = new Date(ms)
  return `${pad2(d.getMonth() + 1)}-${pad2(d.getDate())} ${pad2(d.getHours())}:${pad2(d.getMinutes())}`
}

/** token / 计数的大众格式（用户 2026-10-02：别写上千的数字）：≥1K 用 K、≥1M 用 M（1234→1.2K、12345→12.3K、123456→123K）。 */
export function formatTokenCount(n: number): string {
  if (!Number.isFinite(n)) return '—'
  const trim = (v: number): string => (Math.abs(v) >= 100 ? String(Math.round(v)) : v.toFixed(1).replace(/\.0$/, ''))
  if (Math.abs(n) >= 1_000_000) return `${trim(n / 1_000_000)}M`
  if (Math.abs(n) >= 1_000) return `${trim(n / 1_000)}K`
  return String(n)
}

/**
 * 时长人话（用户 2026-10-02 示意「12 分钟 36 秒」）：秒 → 分秒 → 时分 → 天时。
 * `tt` 走 locales（zh / en 各一套句式）；负数 / NaN ⇒ '—'（未回执没有时长）。
 */
export function formatDuration(
  ms: number,
  tt: (key: LocaleKey, params?: Record<string, string>) => string,
): string {
  if (!Number.isFinite(ms) || ms < 0) return '—'
  const totalSec = Math.round(ms / 1000)
  if (totalSec < 60) return tt('durSec', { n: String(totalSec) })
  const totalMin = Math.floor(totalSec / 60)
  if (totalMin < 60) return tt('durMinSec', { m: String(totalMin), s: String(totalSec % 60) })
  const totalHour = Math.floor(totalMin / 60)
  if (totalHour < 24) return tt('durHourMin', { h: String(totalHour), m: String(totalMin % 60) })
  return tt('durDayHour', { d: String(Math.floor(totalHour / 24)), h: String(totalHour % 24) })
}
