/**
 * 设置页（配置 / 日志 / 数据表）的数据通道与共享类型。
 *
 * - `fetchTableQuery`：打 `GET /db-query`（服务端 `store.queryTable`），按表 + 筛选 + 默认最新字段 DESC + LIMIT N。
 * - `fetchConfig` / `postConfig`：打 `GET / POST /config`（服务端白名单校验后 `scope.update` 落盘）。
 * 服务端路由经宿主 `isTrustedDispatchRequest` 把关，前端必须用 `fetchWithTimeout`（自动带信任头），不能裸 fetch。
 */
import { API_PREFIX } from './query'
import { fetchWithTimeout } from './http'
import type { EditorOption } from './ui'
import type { Translate } from './locales'

/** 模型候选：在基础 `EditorOption` 上多带一个 provider（选中时一并写回 `defaultProvider`）。 */
export interface ModelOption extends EditorOption {
  provider?: string
}

/** 单表查询支持的过滤运算符（与 `store.TABLE_FILTER_OPS` 同形，白名单防注入）。 */
export type TableFilterOp = '=' | '!=' | '<' | '>' | '<=' | '>=' | 'LIKE'
export const TABLE_FILTER_OPS: readonly TableFilterOp[] = ['=', '!=', '<', '>', '<=', '>=', 'LIKE']

/** 单表查询的一条过滤条件。 */
export interface SettingsTableFilter {
  column: string
  op: TableFilterOp
  value: string
}

/** `GET /db-query` 的返回（与 `store.TableQueryResult` 同形）。 */
export interface SettingsTableQueryResult {
  name: string
  count: number
  columns: string[]
  rows: Array<Record<string, unknown>>
  truncated: boolean
}

/**
 * 设置页 Block 1 可编辑的配置字段（与 `src/config.ts` `PluginConfig` 用户字段一一对应）。
 *
 * ⚠️ 目录类（statePath / tasksDir）与 `historyRetentionDays` **不在此列**：
 *  - 路径类由插件装到哪儿决定，不给用户填（用户 2026-10-08）；
 *  - 执行历史**永久保留、不允许清除**（用户 2026-10-08），该能力与字段一并删除。
 */
export interface SettingsConfigValue {
  tickMs: number
  dispatchGraceMs: number
  leaseMs: number
  unknownGraceMs: number
  defaultProvider: string
  defaultModel: string
  logRetentionDays: number
  attachmentTmpRetentionDays: number
}

/** `GET|POST /config` 的返回：`config` = 当前生效值，`defaults` = 系统默认值（都只含可编辑字段）。 */
export interface SettingsConfigPayload {
  config: SettingsConfigValue
  defaults: SettingsConfigValue
}

/** 统一 JSON 解析：成功返回 body；失败抛出**可诊断**的错误。 */
async function getJson<T>(url: string, init?: RequestInit): Promise<T> {
  const res = await fetchWithTimeout(url, init)
  const text = await res.text()
  let body: Record<string, unknown>
  try {
    body = JSON.parse(text) as Record<string, unknown>
  } catch {
    // 非 JSON 响应（路由没匹配上 ⇒ 落到宿主 SPA 兜底或网关；反代未放行也是这一种）。
    // ⚠️ 必须把状态码与响应片段带出去：否则界面上只有一句 `Unexpected token 'o', "not found" is not
    // valid JSON`，看不出是哪一层不给数据（2026-10-08 真机踩过，白排查一轮）。
    const snippet = text.trim().slice(0, 120)
    throw new Error(`HTTP ${res.status} · 返回的不是 JSON${snippet === '' ? '（空响应体）' : `：${snippet}`}`)
  }
  if (body.ok !== true) {
    const err = new Error(typeof body.error === 'string' ? body.error : `HTTP ${res.status}`)
    // 服务端给的补充细节（如「配置写回失败」的真实原因）挂在 detail 上 ⇒ 调用方决定怎么呈现。
    if (typeof body.detail === 'string' && body.detail !== '') (err as Error & { detail?: string }).detail = body.detail
    throw err
  }
  return body as unknown as T
}

/**
 * 模型候选目录（`GET /options`，**与任务编辑器同一份真源**）。
 *
 * 首项固定为「默认模型」（value `''`）＝ 用宿主给的那一个，与编辑器下拉同口径（`editorFollowHost`）；
 * 其后是宿主给的 `provider/id`。目录读不到 ⇒ 只留首项（下拉呈灰色不可选，**不编造**候选）。
 */
export async function fetchModelOptions(t: Translate): Promise<ModelOption[]> {
  const res = await fetchWithTimeout(`${API_PREFIX}/options`, { cache: 'no-store' })
  const body = await res.json() as { ok?: boolean; models?: Array<{ provider?: string; id?: string; name?: string }> }
  if (body.ok !== true) throw new Error('options failed')
  const out: ModelOption[] = [{ value: '', label: t('editorFollowHost') }]
  for (const m of body.models ?? []) {
    if (typeof m.provider !== 'string' || typeof m.id !== 'string') continue
    const name = typeof m.name === 'string' && m.name !== '' ? m.name : m.id
    out.push({ value: m.id, label: `${name}（${m.provider}）`, provider: m.provider })
  }
  return out
}

/** 单表查询（现在只有整体日志块在用）。 */
export async function fetchTableQuery(params: { table: string; n: number; filters: SettingsTableFilter[] }): Promise<SettingsTableQueryResult> {
  const url = `${API_PREFIX}/db-query?table=${encodeURIComponent(params.table)}&n=${params.n}&filter=${encodeURIComponent(JSON.stringify(params.filters))}`
  return getJson<SettingsTableQueryResult>(url)
}

/** 读取当前全部可编辑配置 + 系统默认值（设置页回填 / 「用户没设时显示什么」）。 */
export async function fetchConfig(): Promise<SettingsConfigPayload> {
  const body = await getJson<{ config: Partial<SettingsConfigValue>; defaults: Partial<SettingsConfigValue> }>(`${API_PREFIX}/config`)
  return {
    config: body.config as SettingsConfigValue,
    defaults: body.defaults as SettingsConfigValue,
  }
}

/** 写回配置（服务端白名单 + 范围校验；**与系统默认值相同的字段不落用户层**）。 */
export async function postConfig(patch: Partial<SettingsConfigValue>): Promise<SettingsConfigPayload> {
  const body = await getJson<{ config: SettingsConfigValue; defaults: SettingsConfigValue }>(`${API_PREFIX}/config`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(patch),
  })
  return { config: body.config, defaults: body.defaults }
}
