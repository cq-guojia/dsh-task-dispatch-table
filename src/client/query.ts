// query.ts — 任务卡片三面板的数据通道（决策 55，design/features/task-expand-panels.md §四）。
//
// **为什么单独成文件**：卡片「执行记录 / 日志」面板与未来的**总查询页**（日志查询 + 执行记录查询）
// 共用同一套「过滤 + 游标分页」接口——小面板传 `limit` 取最新 N，总页面再传 `cursor` 即翻页，
// **一套实现两种用法**，绝不允许两处各写一份 fetch。与 `http.ts` 同为叶子模块，tsdown 会内联进单文件产物。
//
// 真实取数纪律（AGENTS.md 第五条）：本模块只做传输与形状校验，不造任何兜底假值——
// 接口失败就让调用方显示错误态，返回什么渲染什么。
import { fetchWithTimeout } from './http'

const PREFIX = 'api/task-dispatch-table'

/** 一条执行记录（task_instances 行的客户端投影；只声明 UI 用得到的字段）。 */
export interface InstanceRow {
  id: string
  task_id: string
  scheduled_at: string
  status: string
  attempt: number
  session_id: string | null
  dispatched_at: string | null
  finished_at: string | null
  /** 决策 32③：完成瞬间写回的产出清单 JSON 字符串（`["a.md","b/"]`），无产出为 null。 */
  outputs: string | null
  /**
   * 派发快照 JSON 字符串（决策 41）——服务端 `SELECT *` 已返回，此处只是**声明出来**。
   * 会话弹窗「接收」区用它取 `resolvedDeps`（上游依赖，决策 43）；**只解析、不改**。
   */
  snapshot?: string | null
  token_in: number | null
  token_out: number | null
  token_in_cache: number | null
  /** 备注：失败 / 跳过原因（服务端由 task_events 最新原因事件推导；无 ⇒ null）。 */
  note?: string | null
  updated_at: string
}

/** 一条诊断日志（task_log 行）。 */
export interface LogRow {
  seq: number
  ts: string
  task_id: string | null
  scheduled_at: string | null
  level: string
  kind: string
  message: string
}

/** 一条实例事件（task_events 行，执行记录下钻用；seq 升序 = 旧→新）。 */
export interface EventRow {
  seq: number
  ts: string
  kind: string
  detail: string | null
}

export interface InstancesParams {
  taskId?: string
  workspace?: string
  statuses?: readonly string[]
  from?: string
  to?: string
  cursor?: string
  limit?: number
}

export interface LogsParams {
  taskId?: string
  workspace?: string
  levels?: readonly string[]
  keyword?: string
  from?: string
  to?: string
  cursor?: string
  limit?: number
}

/** 查询参数 → query string（undefined / 空串跳过；数组逗号合并；cursor 走标准 URL 编码）。 */
function qsOf(params: Record<string, string | readonly string[] | number | undefined>): string {
  const search = new URLSearchParams()
  for (const [key, value] of Object.entries(params)) {
    if (value === undefined || value === '') continue
    if (Array.isArray(value)) {
      if (value.length > 0) search.set(key, value.join(','))
    } else {
      search.set(key, String(value))
    }
  }
  const text = search.toString()
  return text === '' ? '' : `?${text}`
}

/** 剥信封：`{ok:true,...}` 之外一律抛错（调用方显示错误态，不猜兜底值）。 */
async function unwrap<T>(res: Response, what: string): Promise<T> {
  if (!res.ok) throw new Error(`${what}: HTTP ${res.status}`)
  const body = (await res.json()) as { ok?: boolean } & T
  if (body.ok !== true) throw new Error(`${what}: ok=false`)
  return body
}

/** 按任务 / 工作区检索执行记录（服务端 `store.listInstancesByQuery`，排序 scheduled_at DESC）。 */
export async function fetchInstances(params: InstancesParams): Promise<{ rows: InstanceRow[]; nextCursor: string | null }> {
  // 线上参数名 = 单数 `status`（服务端 src/index.ts 契约）；本地字段叫 statuses ⇒ 出口处改名。
  // （2026-10-02 修 bug：此前直接把 `statuses` 发出去，服务端读的是 `status` ⇒ 状态过滤恒等于「全部」。）
  const { statuses, ...rest } = params
  const res = await fetchWithTimeout(`${PREFIX}/tasks/instances${qsOf({ ...rest, status: statuses })}`)
  const body = await unwrap<{ rows?: unknown; nextCursor?: unknown }>(res, '执行记录读取失败')
  if (!Array.isArray(body.rows)) throw new Error('执行记录读取失败：rows 形状不符')
  return { rows: body.rows as InstanceRow[], nextCursor: typeof body.nextCursor === 'string' ? body.nextCursor : null }
}

/** 按任务 / 工作区检索诊断日志（服务端 `store.listLogsByQuery`，排序 ts DESC）。 */
export async function fetchLogs(params: LogsParams): Promise<{ rows: LogRow[]; nextCursor: string | null }> {
  // 线上参数名 = 单数 `level`（服务端契约）；本地字段叫 levels ⇒ 出口处改名（同 instances 的 status 口径）。
  const { levels, ...rest } = params
  const res = await fetchWithTimeout(`${PREFIX}/tasks/log${qsOf({ ...rest, level: levels })}`)
  const body = await unwrap<{ rows?: unknown; nextCursor?: unknown }>(res, '日志读取失败')
  if (!Array.isArray(body.rows)) throw new Error('日志读取失败：rows 形状不符')
  return { rows: body.rows as LogRow[], nextCursor: typeof body.nextCursor === 'string' ? body.nextCursor : null }
}

/** 某次执行的事件时间线（服务端 `store.listEventsByInstance`，seq 升序 = 旧→新）。 */
export async function fetchEvents(instanceId: string): Promise<EventRow[]> {
  const res = await fetchWithTimeout(`${PREFIX}/tasks/events?instanceId=${encodeURIComponent(instanceId)}`)
  const body = await unwrap<{ events?: unknown }>(res, '事件读取失败')
  if (!Array.isArray(body.events)) throw new Error('事件读取失败：events 形状不符')
  return body.events as EventRow[]
}
