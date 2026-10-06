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
 * 字节数 → 人话（`12 KB` / `3.4 MB`）。**单源**：官方附件卡的文件大小、以及任何要展示
 * 体积的地方都走这里（此前无此需求，故没有第二份实现可收敛）。
 * 0 与负数 ⇒ `—`（不显示「0 B」这种假精确）。
 */
export function formatBytes(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes <= 0) return '—'
  if (bytes < 1024) return `${bytes} B`
  const units = ['KB', 'MB', 'GB', 'TB']
  let value = bytes / 1024
  let unit = 0
  while (value >= 1024 && unit < units.length - 1) {
    value /= 1024
    unit++
  }
  return `${value >= 10 ? String(Math.round(value)) : value.toFixed(1)} ${units[unit]}`
}

/** 路径取末段（产出物行 / 文件名显示用）。**单源**：`/` 与 `\` 都认（M5）。 */
export function baseNameOf(path: string): string {
  const cut = Math.max(path.lastIndexOf('/'), path.lastIndexOf('\\'))
  return cut < 0 ? path : path.slice(cut + 1)
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

/**
 * 四位年日期（用户 2026-10-03：卡片标题后的创建时间标签 `[2026-10-03 创建]`）：`YYYY-MM-DD`。
 * 与 `formatShortStamp` 的差别就是**带年份**——创建时间要能跨年看，缺年份会认错。
 */
export function formatYmd(iso: string): string {
  const ms = Date.parse(iso)
  if (Number.isNaN(ms)) return '—'
  const d = new Date(ms)
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`
}

/** 计划执行列（用户 2026-10-02 改**四位年**：形如 `2026-09-30 15:10`）：`YYYY-MM-DD HH:mm`。 */
export function formatPlanStamp(iso: string): string {
  const ms = Date.parse(iso)
  if (Number.isNaN(ms)) return '-'
  const d = new Date(ms)
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())} ${pad2(d.getHours())}:${pad2(d.getMinutes())}`
}

/** 实际开始列：只到 `HH:mm:ss`；未派发（null）或解析失败 ⇒ `-`。 */
export function formatClock(iso: string | null): string {
  if (iso === null) return '-'
  const ms = Date.parse(iso)
  if (Number.isNaN(ms)) return '-'
  const d = new Date(ms)
  return `${pad2(d.getHours())}:${pad2(d.getMinutes())}:${pad2(d.getSeconds())}`
}

/**
 * 执行时长列（用户 2026-10-02 第四轮）：有小时 ⇒ `H:MM:SS`（如 `1:15:30`）；
 * 不足 1 小时 ⇒ `MM:SS`（**分、秒一律两位补零**，如 `05:30` / `00:30`）。NaN / 负 ⇒ `-`。
 */
export function formatDurationHms(ms: number): string {
  if (!Number.isFinite(ms) || ms < 0) return '-'
  const totalSec = Math.round(ms / 1000)
  const h = Math.floor(totalSec / 3600)
  const m = Math.floor((totalSec % 3600) / 60)
  const s = totalSec % 60
  return h > 0 ? `${h}:${pad2(m)}:${pad2(s)}` : `${pad2(m)}:${pad2(s)}`
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
 * token 明细：`输入 / 输出 / 缓存`（缺失档给 `—`）—— 挂在总量标签的 `title` 上，悬停看明细。
 *
 * ⚠️ 2026-10-04 从 `task-list.tsx` 上提到这里（改名 `formatTokenDetail`）：卡片「执行记录」面板与
 * **执行记录总查询页**共用一份，避免同一串格式两处各写。
 */
export function formatTokenDetail(row: { token_in: number | null; token_out: number | null; token_in_cache: number | null }): string {
  const part = (v: number | null): string => (v === null ? '—' : formatTokenCount(v))
  return `${part(row.token_in)} / ${part(row.token_out)} / ${part(row.token_in_cache)}`
}


