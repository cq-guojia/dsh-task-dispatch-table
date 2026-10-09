// query.ts — 任务卡片三面板的数据通道（决策 55，design/features/task-expand-panels.md §四）。
//
// **为什么单独成文件**：卡片「执行记录 / 日志」面板与未来的**总查询页**（日志查询 + 执行记录查询）
// 共用同一套「过滤 + 游标分页」接口——小面板传 `limit` 取最新 N，总页面再传 `cursor` 即翻页，
// **一套实现两种用法**，绝不允许两处各写一份 fetch。与 `http.ts` 同为叶子模块，tsdown 会内联进单文件产物。
//
// 真实取数纪律（仓库硬规则）：本模块只做传输与形状校验，不造任何兜底假值——
// 接口失败就让调用方显示错误态，返回什么渲染什么。
import { fetchWithTimeout } from './http'

/**
 * 本插件 webServer 路由的 API 前缀（**全仓唯一**：本文件 / 宿主页 / 事件流 / 设置页都从这里引，
 * 不再各处再写一遍字面量——2026-10-06 M9，此前有 4 份、其中一处还多了前导 `/`）。
 */
export const API_PREFIX = 'api/task-dispatch-table'

/** 一条执行记录（task_instances 行的客户端投影；只声明 UI 用得到的字段）。 */
export interface InstanceRow {
  id: string
  task_id: string
  scheduled_at: string
  /**
   * 计划时刻所在的日历日（服务端 `task_instances.logical_date`，`SELECT *` 已带回）——
   * ⚠️ **注意它是「任务时区」的日历日**（服务端按任务 `timezone` 推），而列表的排序键与时间范围过滤
   * 都是 `scheduled_at`（绝对时刻 / 浏览器本地日）⇒ **执行记录时间轴不拿它分组**（拿它会出现同名天标签），
   * 这里只作声明备查。旧行没有这列 ⇒ 可能 undefined。
   */
  logical_date?: string
  status: string
  attempt: number
  session_id: string | null
  dispatched_at: string | null
  finished_at: string | null
  /** 决策 32③：完成瞬间写回的产出清单 JSON 字符串（`["a.md","b/"]`），无产出为 null。 */
  outputs: string | null
  /**
   * 派发快照 JSON 字符串（决策 41）——服务端 `SELECT *` 已返回，此处只是**声明出来**。
   * 会话弹窗顶部输入区用它取 `resolvedDeps`（上游依赖，决策 43）与 `attachments`；**只解析、不改**。
   */
  snapshot?: string | null
  /**
   * 附加文件的绝对路径，**按 ref 配对**（不是按序——两端过滤规则不同会整体错位）。
   * 只在「按会话 id 取实例」时由服务端下发：upload 型落在插件数据目录、link 型的基准是
   * 工作区 title ⇒ 客户端两样都算不出来，必须服务端给。解析不出 ⇒ path 为 null（绝不猜）。
   */
  attachmentPaths?: readonly { ref: string; path: string | null }[] | null
  token_in: number | null
  token_out: number | null
  token_in_cache: number | null
  /** 备注：失败 / 跳过原因（服务端由 task_events 最新原因事件推导；无 ⇒ null）。 */
  note?: string | null
  /** 派发会话名（服务端按 `sessionTitleOf` 单源重建；旧行 / 无标题 ⇒ null）。展示用。 */
  session_title?: string | null
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

/**
 * 解析实例的产出清单（`task_instances.outputs` 是 JSON 字符串数组，决策 32③）。
 * 形状不对的条目丢弃、解析失败返回空数组 —— **不猜兜底值**。
 *
 * ⚠️ 2026-10-04 从 `task-list.tsx` 上提到这里：卡片「执行记录」面板与**执行记录总查询页**都要用，
 * 同一解析写两遍就是违规（本仓规矩：一类东西一个实现）。
 */
export function outputsOf(raw: string | null | undefined): string[] {
  if (raw === null || raw === undefined || raw === '') return []
  try {
    const parsed: unknown = JSON.parse(raw)
    return Array.isArray(parsed) ? parsed.filter((item): item is string => typeof item === 'string') : []
  } catch {
    return []
  }
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
  /** 按会话 id 取（会话弹窗用：进弹窗只带会话 id，快照 / 产出自己取）。 */
  sessionId?: string
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
  const res = await fetchWithTimeout(`${API_PREFIX}/tasks/instances${qsOf({ ...rest, status: statuses })}`)
  const body = await unwrap<{ rows?: unknown; nextCursor?: unknown }>(res, '执行记录读取失败')
  if (!Array.isArray(body.rows)) throw new Error('执行记录读取失败：rows 形状不符')
  return { rows: body.rows as InstanceRow[], nextCursor: typeof body.nextCursor === 'string' ? body.nextCursor : null }
}

/**
 * 按月取**整月**执行记录（「任务日程」日历页用，2026-10-05）。
 *
 * 与 `fetchInstances` 走**同一条路由**，只多带 `light=1`：行不含 `snapshot` 大列（派发快照，
 * 单行 1.5–4 KB；日历要一次拿满一个月，带上它是数 MB 的白给开销），上限放宽到 3000 且**不分页**
 * ⇒ 一次请求出整月，点某天不再发起请求。任务名由日历从任务定义本地映射，不走会话名富化。
 *
 * `truncated: true` = 触及上限被截断，调用方必须提示用户收窄过滤（**不静默丢**）。
 */
export async function fetchInstancesLite(
  params: Omit<InstancesParams, 'cursor' | 'sessionId'>,
): Promise<{ rows: InstanceRow[]; truncated: boolean }> {
  const { statuses, ...rest } = params
  const res = await fetchWithTimeout(`${API_PREFIX}/tasks/instances${qsOf({ ...rest, status: statuses, light: '1' })}`)
  const body = await unwrap<{ rows?: unknown; truncated?: unknown }>(res, '日程记录读取失败')
  if (!Array.isArray(body.rows)) throw new Error('日程记录读取失败：rows 形状不符')
  return { rows: body.rows as InstanceRow[], truncated: body.truncated === true }
}

/**
 * 按会话 id 取那一条实例行（2026-10-03）：**会话弹窗唯一的取数入口**。
 * 一个会话最多一条实例行 ⇒ 取首行；查不到（非本插件派发的会话 / 行已清）/ 请求失败
 * ⇒ `null`，调用方**照常打开弹窗**，只是少了产出卡与接收区（绝不因此挡住看会话）。
 */
export async function fetchInstanceBySession(sessionId: string): Promise<InstanceRow | null> {
  try {
    const { rows } = await fetchInstances({ sessionId, limit: 1 })
    return rows[0] ?? null
  } catch {
    return null
  }
}

/** 按任务 / 工作区检索诊断日志（服务端 `store.listLogsByQuery`，排序 ts DESC）。 */
export async function fetchLogs(params: LogsParams): Promise<{ rows: LogRow[]; nextCursor: string | null }> {
  // 线上参数名 = 单数 `level`（服务端契约）；本地字段叫 levels ⇒ 出口处改名（同 instances 的 status 口径）。
  const { levels, ...rest } = params
  const res = await fetchWithTimeout(`${API_PREFIX}/tasks/log${qsOf({ ...rest, level: levels })}`)
  const body = await unwrap<{ rows?: unknown; nextCursor?: unknown }>(res, '日志读取失败')
  if (!Array.isArray(body.rows)) throw new Error('日志读取失败：rows 形状不符')
  return { rows: body.rows as LogRow[], nextCursor: typeof body.nextCursor === 'string' ? body.nextCursor : null }
}

/** 某次执行的事件时间线（服务端 `store.listEventsByInstance`，seq 升序 = 旧→新）。 */
export async function fetchEvents(instanceId: string): Promise<EventRow[]> {
  const res = await fetchWithTimeout(`${API_PREFIX}/tasks/events?instanceId=${encodeURIComponent(instanceId)}`)
  const body = await unwrap<{ events?: unknown }>(res, '事件读取失败')
  if (!Array.isArray(body.events)) throw new Error('事件读取失败：events 形状不符')
  return body.events as EventRow[]
}
