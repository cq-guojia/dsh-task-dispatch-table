// format.ts — 客户端共用的「补零 / 时间串」格式化（2026-09-30 抽象收敛）。
//
// **为什么有这个文件**：`padStart(2,'0')` 此前散在 6 处、`YYYY-MM-DD HH:mm[:ss]` 手拼了 3 份
// （`task-list.formatFull` / `index.formatTime` / `task-editor.formatVersionTime`，口径各差一点：
// 有无秒、解析失败回退 `'—'` 还是原串）。收敛到这一处，改口径只改这里。
//
// ⚠️ 全部走**本机时区**（与原三处一致）；解析失败不抛错、按调用方给的兜底返回。

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
