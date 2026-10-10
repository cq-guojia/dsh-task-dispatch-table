// SQLite 状态库：两表 DDL 照抄 data-model.md；状态机 7 态载体（state-machine.md）。
// Node >= 22.5 内置 node:sqlite（宿主 engines ^22.19.0 || >=24.0.0），零原生依赖。
import { DatabaseSync } from 'node:sqlite'
import { randomUUID } from 'node:crypto'
import { mkdirSync } from 'node:fs'
import { dirname } from 'node:path'
import type { ResolvedDependency } from './deps.js'
import { parseResolvedDeps } from './deps.js'

/** 单表查询支持的过滤运算符（白名单防注入）。 */
export type TableFilterOp = '=' | '!=' | '<' | '>' | '<=' | '>=' | 'LIKE'
export const TABLE_FILTER_OPS: readonly TableFilterOp[] = ['=', '!=', '<', '>', '<=', '>=', 'LIKE']
/** 单表查询的过滤条件（列名 / 运算符 / 值，全部经白名单 + 占位绑定）。 */
export interface TableFilter {
  column: string
  op: TableFilterOp
  value: string
}
/** 单表查询结果（设置页 Block 3 / Block 2 共用）。 */
export interface TableQueryResult {
  name: string
  count: number
  columns: string[]
  rows: Record<string, unknown>[]
  truncated: boolean
}

/**
 * Agent 权限档位（决策 50）：`default` = 会话默认（沿用宿主新建会话的权限设置，不加约束）。
 * ⚠️ 与 src/client/task-editor.tsx 的同名类型**两处各写一份**（client bundle 不引 host 模块），
 * 改枚举务必两边同步。
 */
export type PermissionMode = 'default' | 'readOnly' | 'workspace' | 'full'
export const PERMISSION_MODES: readonly PermissionMode[] = ['default', 'readOnly', 'workspace', 'full']

export const TERMINAL_STATUSES = ['succeeded', 'failed', 'skipped'] as const
const NON_TERMINAL_STATUSES = ['pending', 'dispatched', 'running', 'unknown'] as const
export type InstanceStatus =
  | 'pending' | 'dispatched' | 'running'
  | 'succeeded' | 'failed' | 'skipped' | 'unknown'

/**
 * 执行记录的**触发来源**（2026-10-03 用户拍板新增，落地 U5 预留字段）：
 * - `scheduled` = 按排期自动调度（Loop A 建行，缺省值）；
 * - `manual` = 用户在卡片上点「立即执行」手动触发一次。
 * 只落库记录，当前**没有任何读路径 / UI 展示消费它**（用户：读取的地方不用读、前端展示先不改）。
 */
export type InstanceRunType = 'scheduled' | 'manual'

export interface TaskInstance {
  id: string
  task_id: string
  logical_date: string
  scheduled_at: string
  status: InstanceStatus
  attempt: number
  /** 触发来源（2026-10-03）：'scheduled' 自动调度 / 'manual' 手动立即执行；旧行为 null。 */
  run_type: InstanceRunType | null
  session_id: string | null
  lease_until: string | null
  dispatched_at: string | null
  finished_at: string | null
  /**
   * 回执声明的产出 JSON 数组，**主文件桶**（2026-10-10 语义收窄：核心交付物）。
   * 旧行只有这一列 ⇒ 天然等价于「只有主文件」。
   */
  outputs: string | null
  /** 回执声明的**过程文件桶**（2026-10-10 新增）：日志 / 中间产物 / 工作目录的 JSON 数组；旧行为 null。 */
  process_outputs: string | null
  token_in: number | null
  token_out: number | null
  token_in_cache: number | null
  /** 派发快照（决策 41）：落库时固化的执行所需字段 JSON；旧行 / 异常为 null。 */
  snapshot: string | null
  updated_at: string
  /** 备注（非表列）：失败 / 跳过原因，由 task_events 最新原因事件推导（listInstancesByQuery 填充）。 */
  note?: string | null
}

/**
 * 一条已解析的上游依赖（决策 43）：Loop A 判定通过时固化，Loop B 只读不重判。
 * 真源已上提到 `deps.ts`（零运行时依赖，客户端「接收」区共用同一份解析），此处只做转出。
 */
export type { ResolvedDependency } from './deps.js'

/**
 * 派发快照（决策 41）：Loop A 落库时固化，Loop B（发动 / 重试 / 追问 / 回执裁决）**只读快照**，
 * 与任务设置彻底解耦——中途改任务定义对已落库实例零影响。
 */
export interface InstanceSnapshot {
  /** /goal 多轮续跑（决策 48）：undefined 视为 true（用户拍板「默认都是多轮会话」）。 */
  goal?: boolean
  /** 多 Agent 协作（决策 49）：undefined 视为 false；派发时探测宿主 ctx.agentTeams，缺则降级单轮。 */
  agentTeam?: boolean
  /** Agent 权限档位（决策 50）：undefined 视为 'default'（会话默认，不额外约束）。 */
  permission?: PermissionMode
  /** 会话显示名（决策 42）：title 回退 code，再回退短 id。 */
  title: string
  prompt: string
  manual: string | null
  /** 解析后的工作区实体 path（cwd / attachSession / 回执 outputs 校验都用它）。 */
  workspacePath: string
  /** 模型漏斗第①层提示（任务 target.provider/model；②③④层在发动时按插件配置 / 宿主现算）。 */
  provider: string
  model: string
  validStatuses: string[]
  maxAttempts: number
  /** ISO 时长串（超窗判定用，决策 41：快照管「已开工的」窗口边界）。 */
  window: string
  /** 依赖快照（决策 43）：判定通过那一刻命中的上游实例与产出；决策 41 旧行无此字段。 */
  resolvedDeps?: ResolvedDependency[]
  /**
   * 附加文件清单（2026-09-30）：Loop B 发动前要校验「附件还在不在」⇒ 必须随快照冻结，
   * 否则 Loop B 只能回头读任务定义，违反决策 41「只读快照」。旧行无此字段 = 无附件。
   */
  attachments?: SnapshotAttachment[]
}

/** 快照里的附件引用（只记引用，不存内容）。 */
export interface SnapshotAttachment {
  name: string
  kind: 'link' | 'upload'
  ref: string
  /** link 型：来源工作区 title（派发注入 / 校验时按它把 ref 绝对化）。 */
  workspace?: string
}

/** 解析快照里的附件清单：形状不对的条目丢弃（不猜）。 */
function parseSnapshotAttachments(raw: unknown): SnapshotAttachment[] | undefined {
  if (!Array.isArray(raw)) return undefined
  const out: SnapshotAttachment[] = []
  for (const item of raw) {
    if (typeof item !== 'object' || item === null) continue
    const a = item as Partial<SnapshotAttachment>
    if (typeof a.name !== 'string' || typeof a.ref !== 'string') continue
    if (a.kind !== 'link' && a.kind !== 'upload') continue
    out.push({
      name: a.name,
      kind: a.kind,
      ref: a.ref,
      ...(typeof a.workspace === 'string' ? { workspace: a.workspace } : {}),
    })
  }
  return out
}

/** 解析实例行的快照 JSON；空 / 坏 JSON / 形状不对返回 undefined（调用方走兜底）。 */
export function parseInstanceSnapshot(raw: string | null): InstanceSnapshot | undefined {
  if (raw === null || raw === '') return undefined
  try {
    const value: unknown = JSON.parse(raw)
    if (typeof value !== 'object' || value === null) return undefined
    const s = value as Partial<InstanceSnapshot>
    if (typeof s.title !== 'string' || typeof s.prompt !== 'string' || typeof s.workspacePath !== 'string') return undefined
    if (!Array.isArray(s.validStatuses)) return undefined
    const resolvedDeps = parseResolvedDeps(s.resolvedDeps)
    // 附件解析一次；`[]` 也保留字段——「附件从有到无」的快照仍带空清单，Loop B 才能如实校验（评审 P2#14）。
    const parsedAttachments = parseSnapshotAttachments(s.attachments)
    return {
      title: s.title,
      prompt: s.prompt,
      manual: typeof s.manual === 'string' ? s.manual : null,
      workspacePath: s.workspacePath,
      provider: typeof s.provider === 'string' ? s.provider : '',
      model: typeof s.model === 'string' ? s.model : '',
      validStatuses: s.validStatuses.filter((x): x is string => typeof x === 'string'),
      maxAttempts: typeof s.maxAttempts === 'number' && Number.isInteger(s.maxAttempts) && s.maxAttempts >= 1 ? s.maxAttempts : 1,
      window: typeof s.window === 'string' ? s.window : 'PT0S',
      // goal / agentTeam / permission（决策 48 / 49 / 50）：JSON 里没有 ⇒ undefined = 各自缺省
      // （goal 开 / team 关 / permission 会话默认）；非法档位一律丢回缺省，不猜。
      ...(typeof s.goal === 'boolean' ? { goal: s.goal } : {}),
      ...(typeof s.agentTeam === 'boolean' ? { agentTeam: s.agentTeam } : {}),
      ...(PERMISSION_MODES.includes(s.permission as PermissionMode) ? { permission: s.permission as PermissionMode } : {}),
      ...(resolvedDeps === undefined ? {} : { resolvedDeps }),
      ...(parsedAttachments === undefined ? {} : { attachments: parsedAttachments }),
    }
  } catch {
    return undefined
  }
}

/** 调试快照事件行（detail 截断，临时调试面板用）。带 instance_id 供面板按实例过滤展开。 */
export interface SnapshotEvent {
  seq: number
  instance_id: string
  ts: string
  kind: string
  detail: string | null
}

/** 单实例状态转移 + task_events 追加的参数包。 */
export interface TransitionInput {
  status: InstanceStatus
  attempt?: number
  session_id?: string | null
  lease_until?: string | null
  dispatched_at?: string | null
  finished_at?: string | null
  detail?: unknown
}

/** 调试导出：一张表的原始行（面板「调试」页 / GET /db 的单元）。 */
export interface TableDump {
  name: string
  /** 表内总行数（rows 可能只含最新一部分）。 */
  count: number
  /** 列名，按建表顺序。 */
  columns: string[]
  /** 行原样（列 → TEXT/INTEGER/NULL 值）。 */
  rows: Record<string, unknown>[]
  /** true = 总行数超出 limit，rows 只含最新 limit 条。 */
  truncated: boolean
}

const DDL = `
-- 执行记录表：一行 = **一次执行（一个计划刻度）**。
-- （决策 25 修订版：任务 id 直接写在用户的任务定义 JSON 里，**不再有 task_defs 登记表**——
--   按位置或内容指纹去对应，都会在「删第一条 / 调顺序」时串号；id 跟着那条定义走才是对的。）
-- id = UUID 不透明主键（决策 25：自增在客户端 / 重装环境下不可靠）；
-- (task_id, scheduled_at) 唯一 = 防重闸门 ⇒ tick 幂等，同一刻度插不进第二条。
CREATE TABLE IF NOT EXISTS task_instances (
  id            TEXT PRIMARY KEY,
  task_id       TEXT NOT NULL,
  logical_date  TEXT NOT NULL,
  scheduled_at  TEXT NOT NULL,
  status        TEXT NOT NULL CHECK (status IN
                  ('pending','dispatched','running','succeeded','failed','skipped','unknown')),
  attempt       INTEGER NOT NULL DEFAULT 0,
  -- 触发来源（2026-10-03）：'scheduled' 自动调度 / 'manual' 手动立即执行；旧库补列为 NULL。
  run_type      TEXT,
  session_id    TEXT,
  lease_until   TEXT,
  dispatched_at TEXT,
  finished_at   TEXT,
  -- 2026-10-10：outputs = 主文件（核心交付物）；process_outputs = 过程文件。旧库补列（ensureInstanceColumns）。
  outputs       TEXT,
  process_outputs TEXT,
  token_in      INTEGER,
  token_out     INTEGER,
  token_in_cache INTEGER,
  snapshot      TEXT,
  updated_at    TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS task_events (
  seq         INTEGER PRIMARY KEY AUTOINCREMENT,
  instance_id TEXT NOT NULL,
  ts          TEXT NOT NULL,
  kind        TEXT NOT NULL,
  detail      TEXT
);
CREATE INDEX IF NOT EXISTS idx_events_instance ON task_events(instance_id, seq);
-- 诊断日志表（决策 31/32）：只收「未推进到执行那一步」的诊断——错过刻度 / 启动汇总 /
-- 预条件失败 / 依赖卡顿 / 崩溃残留 pending。与 task_instances 分离，可定时清除。
CREATE TABLE IF NOT EXISTS task_log (
  seq          INTEGER PRIMARY KEY AUTOINCREMENT,
  ts           TEXT NOT NULL,
  task_id      TEXT,
  scheduled_at TEXT,
  level        TEXT NOT NULL,
  kind         TEXT NOT NULL,
  message      TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_task_log_ts ON task_log(ts);
-- 元数据表：跨重启 / 重装必须存活的插件级键值（内嵌任务表 tasksInline 等）。
-- state.db 在宿主数据根（挂载卷）⇒ 容器重建、插件重装都不丢；entry config 做不到这点。
CREATE TABLE IF NOT EXISTS meta (
  key   TEXT PRIMARY KEY,
  value TEXT NOT NULL
);
-- 操作审计表（2026-09-30）：新增 / 修改 / 删除任务、版本留档、版本找回、附件增删
-- 全部留痕 ⇒ 事后能回答「这个任务什么时候被改成什么样」。
-- 与 task_log（诊断，30 天清）分开：**默认不清**（design/data-model.md §六）。
CREATE TABLE IF NOT EXISTS task_audit (
  seq      INTEGER PRIMARY KEY AUTOINCREMENT,
  ts       TEXT NOT NULL,
  task_id  TEXT,
  action   TEXT NOT NULL,
  detail   TEXT
);
CREATE INDEX IF NOT EXISTS idx_audit_task ON task_audit(task_id, seq);

-- ⚠️ **插件整体日志表**（2026-10-07）：与上面所有 task_* 表**维度不同** ——
--   - task_* 回答「某个任务 / 某次执行怎么了」，都挂 task_id / instance_id；
--   - 本表回答「插件这个进程怎么了」：启动 / 停止、宿主能力缺失、HTTP 通道异常、
--     推送连接生命周期、主线程被同步重活占住、慢请求……**这些不挂任何任务**。
--   此前曾把这些塞进 task_log（kind='diag'），属**用错表**：task_log 的契约是
--   「只收未推进到执行那一步的任务诊断」，kind 是一组明确枚举（design/data-model.md §二）。
--   塞进去既越界、又成为「按任务看日志」视图里的孤儿行。**独立成表**（design/data-model.md §六）。
-- 保留策略同 task_log：logRetentionDays（默认 30 天），tick 内跨天清。
-- ⚠️ 本段在 TS 模板字符串内 ⇒ 注释里**不许出现反引号**（会提前终止字符串）。
CREATE TABLE IF NOT EXISTS plugin_log (
  seq     INTEGER PRIMARY KEY AUTOINCREMENT,
  ts      TEXT NOT NULL,
  level   TEXT NOT NULL,             -- info | warn | error
  kind    TEXT NOT NULL,             -- startup | shutdown | degraded | block | slow_request | route_error | stream_*
  message TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_plugin_log_ts ON plugin_log(ts);
`

const nowIso = (): string => new Date().toISOString()

// ── 按任务 / 工作区过滤 + 游标分页（任务卡片三面板 + 未来总查询页共用，design/features/task-expand-panels.md §四）──
// cursor 用 base64(JSON) 编码「排序键末行」：小面板只传 limit 取最新 N；未来总页面带 cursor 即翻页。一套实现两种用法。
function encodeCursor(values: readonly (string | number)[]): string {
  return Buffer.from(JSON.stringify(values)).toString('base64')
}
function decodeCursor(raw: string): (string | number)[] | null {
  try {
    const value: unknown = JSON.parse(Buffer.from(raw, 'base64').toString('utf8'))
    return Array.isArray(value) ? (value as (string | number)[]) : null
  } catch {
    return null
  }
}

export interface InstanceQuery {
  taskId?: string
  /**
   * 按会话 id 精确取（2026-10-03）：会话弹窗**只拿得到会话 id**（不再靠调用方传快照 / 产出）⇒
   * 所有入口渲染必然一致。一个会话最多对应一条实例行，故配合 `limit: 1` 用。
   */
  sessionId?: string
  /** 已解析的工作区任务集合（workspace 过滤由调用方解析，store 不持有任务定义）。 */
  taskIds?: readonly string[]
  statuses?: readonly InstanceStatus[]
  /** scheduled_at 区间（含端点，ISO 字符串）。 */
  fromTs?: string
  toTs?: string
  /** 编码末行 `(scheduled_at, id)`。 */
  cursor?: string
  limit?: number
}
export interface InstancePage {
  rows: TaskInstance[]
  /** 还有下一页时为末行游标，否则 null。 */
  nextCursor: string | null
}

/**
 * 轻量执行记录行（「任务日程」日历页按月取数用，2026-10-05）= 实例行**剔除 `snapshot` 列**。
 *
 * 为什么剔除：snapshot 是派发快照（提示词 / 附件 / 依赖的 JSON，单行 1.5–4 KB），
 * 日历要一次取满整月（几百到上千行），带着它就是数 MB 的白给开销；日历只要状态 / 时刻 / 产出 / 原因。
 * 2026-10-10 起同时剔除 `process_outputs`（过程文件只有记录页 / 查看档 / 会话弹窗展示，日历不展示它）。
 */
export type LiteTaskInstance = Omit<TaskInstance, 'snapshot' | 'process_outputs'>

export interface LiteInstancePage {
  rows: LiteTaskInstance[]
  /** 触及上限被截断（调用方必须提示用户收窄过滤，**不静默丢**）。 */
  truncated: boolean
}

export interface LogQuery {
  taskId?: string
  taskIds?: readonly string[]
  levels?: readonly string[]
  /** **message 与 kind 都做**子串匹配（LIKE %kw%）；见 `listLogs` 处的说明。 */
  keyword?: string
  fromTs?: string
  toTs?: string
  /** 编码末行 `(ts, seq)`。 */
  cursor?: string
  limit?: number
}
export interface LogRow {
  seq: number
  ts: string
  task_id: string | null
  scheduled_at: string | null
  level: string
  kind: string
  message: string
}
export interface LogPage {
  rows: LogRow[]
  nextCursor: string | null
}

/** 某实例的事件时间线（执行记录下钻用），按 seq 升序（旧→新）。 */
export interface InstanceEventRow {
  seq: number
  ts: string
  kind: string
  detail: string | null
}

/**
 * **插件整体日志的语义枚举**（`plugin_log.kind`）—— 2026-10-07。
 *
 * ⚠️ **新增 / 改名必须同步** `docs/design/data-model.md` §二 的表注释，否则文档与代码不一致
 * （本仓已发生过：文档 §二 漏掉 `task_audit`，直到本次排查才发现）。
 *
 * 选用哪一类，按「**这件事挂不挂得上某个任务**」判断：
 *  - 挂得上 ⇒ 回 `task_log` / `task_events`，**不要扔这里**；
 *  - 挂不上（是插件进程自己的事）⇒ 才用本表。
 */
export type PluginLogKind =
  | 'startup'             // 插件启动完成（时间线锚点：事后能看出故障前后有没有重启过）
  | 'shutdown'            // 插件停止 / dispose
  | 'degraded'            // 宿主能力缺失 ⇒ 功能降级（无 webServer.register / 无 llm / 无 workspaceRegistry …）
  | 'block'               // 主线程被同步重活占住（1s 心跳的定时器漂移）
  | 'slow_request'        // HTTP 请求慢（超过阈值），带并发数
  | 'route_error'         // 路由 handler 抛异常
  | 'stream_open'         // SSE 推送连接建立
  | 'stream_close'        // SSE 推送连接关闭（正常）
  | 'stream_limit'        // SSE 连接数达上限，拒绝新连接
  | 'stream_write_failed' // SSE 写出失败 ⇒ 回收该连接
  | 'snapshot'            // 调试快照写 / 读异常
  | 'config'              // 插件配置写回失败
  | 'tick_error'          // 调度 tick 抛异常
  | 'dispatch'            // 派发链路的降级 / 失败（宿主侧服务缺失等）
  | 'error'               // 其它未分类异常（尽量归到上面某一类，实在没有才用这个）

export class TaskStore {
  private readonly db: DatabaseSync
  /** 事务嵌套深度（`transaction` 用）：> 0 = 已在事务里 ⇒ 内层并入外层，不再 BEGIN。 */
  private txDepth = 0

  /**
   * 迁移时因「同任务同刻度重复」被合并掉的行数。
   * > 0 说明历史数据里存在重复（正常不该有），宿主会打告警——**绝不静默删数据**。
   */
  dupRowsRemoved = 0

  constructor(statePath: string) {
    mkdirSync(dirname(statePath), { recursive: true })
    this.db = new DatabaseSync(statePath)
    this.db.exec('PRAGMA journal_mode = WAL;')
    // 等锁 5s 再抛（2026-09-30）：`transaction()` 用 `BEGIN IMMEDIATE` 立刻取写锁，而 CLI 回执通道
    // （submit.ts 的 busy_timeout）可能同时在写同一库 ⇒ 没有这道兜底会偶发 SQLITE_BUSY 打断整个 tick。
    this.db.exec('PRAGMA busy_timeout = 5000;')
    this.db.exec(DDL)
    this.migrate()
  }

  /**
   * 旧库迁移（决策 25 + 决策 32）：
   * - 首次：去重（同一 task + 同一刻度只留 rowid 最小那条）后补建 `(task_id, scheduled_at)`
   *   唯一索引作为防重闸门；
   * - 已迁移过的库：仅补决策 32 冗余字段（outputs / tokens 列），不重复去重。
   */
  private migrate(): void {
    const exists = this.db
      .prepare(`SELECT name FROM sqlite_master WHERE type = 'index' AND name = 'idx_instances_slot'`)
      .get() as { name: string } | undefined
    if (exists !== undefined) {
      this.ensureInstanceColumns()
      return
    }
    // 先数一数真有重复没有：正常库应该是 0，非 0 说明历史数据脏，交给宿主告警。
    const dup = this.db
      .prepare(`SELECT COUNT(*) AS n FROM (
                  SELECT 1 FROM task_instances GROUP BY task_id, scheduled_at HAVING COUNT(*) > 1)`)
      .get() as { n: number }
    this.dupRowsRemoved = Number(dup.n)
    this.db.exec(
      `DELETE FROM task_instances WHERE rowid NOT IN
         (SELECT MIN(rowid) FROM task_instances GROUP BY task_id, scheduled_at)`,
    )
    this.db.exec('CREATE UNIQUE INDEX idx_instances_slot ON task_instances(task_id, scheduled_at)')
    this.ensureInstanceColumns()
  }

  /** 决策 32（修订）+ 2026-10-10：兼容旧库（无 outputs / process_outputs / token 三拆列）。 */
  private ensureInstanceColumns(): void {
    const cols = new Set(
      (this.db.prepare('PRAGMA table_info(task_instances)').all() as Array<{ name: string }>).map(c => c.name),
    )
    if (!cols.has('outputs')) this.db.exec('ALTER TABLE task_instances ADD COLUMN outputs TEXT')
    // 过程文件桶（2026-10-10）：旧库补列后为 NULL = 无过程文件 ⇒ 界面照旧只显示主文件。
    if (!cols.has('process_outputs')) this.db.exec('ALTER TABLE task_instances ADD COLUMN process_outputs TEXT')
    // 旧版决策 32 曾用单个 tokens 列；拆成三列后卸下旧列（不支持 DROP COLUMN 的旧 SQLite 静默跳过）。
    if (cols.has('tokens')) {
      try { this.db.exec('ALTER TABLE task_instances DROP COLUMN tokens') } catch { /* 旧引擎不支持 DROP COLUMN，留作死列无害 */ }
    }
    if (!cols.has('token_in')) this.db.exec('ALTER TABLE task_instances ADD COLUMN token_in INTEGER')
    if (!cols.has('token_out')) this.db.exec('ALTER TABLE task_instances ADD COLUMN token_out INTEGER')
    if (!cols.has('token_in_cache')) this.db.exec('ALTER TABLE task_instances ADD COLUMN token_in_cache INTEGER')
    // 决策 41：派发快照列。旧行为 NULL ⇒ 对账走 legacyTask 回退（读一次任务表当场补快照，不静默）。
    if (!cols.has('snapshot')) this.db.exec('ALTER TABLE task_instances ADD COLUMN snapshot TEXT')
    // 2026-10-03：触发来源列（自动调度 / 手动「立即执行」）。旧库补列；旧行留 NULL（不回填、不猜）。
    if (!cols.has('run_type')) this.db.exec('ALTER TABLE task_instances ADD COLUMN run_type TEXT')
  }

  close(): void {
    this.db.close()
  }

  /**
   * 把多次写库合成一个**原子单元**（2026-09-30 复核 P2）：`ensureSkipped` → `appendEvent`（→ `appendLog`）
   * 原先是两/三步独立写，中途被杀会留下**「执行记录里有这条未执行、展开却看不到为什么」**的半截记录。
   *
   * - `node:sqlite` 的 `DatabaseSync` 没有事务包装，但 `exec('BEGIN'/'COMMIT'/'ROLLBACK')` 与
   *   `prepare(...).run()` 走**同一条连接** ⇒ 天然同事务。用 `BEGIN IMMEDIATE` 立刻取写锁，
   *   避免「先读后写」在事务中途升级锁失败（配合构造里的 `busy_timeout = 5000`）。
   * - **嵌套守卫**：SQLite 不支持嵌套 BEGIN（会抛 `cannot start a transaction within a transaction`）
   *   ⇒ `txDepth > 0` 时内层直接并入外层，原子性由**最外层**统一提交 / 回滚。
   * - 异常一律 `ROLLBACK` 后**原样抛出**；`fn` 内返回 `false` 也算**正常结束** ⇒ 走 COMMIT，
   *   否则连接会留在事务里、后续写被隐式吞进这个永远不提交的事务。
   */
  transaction<T>(fn: () => T): T {
    if (this.txDepth > 0) return fn() // 已在外层事务里 ⇒ 并入，不再 BEGIN
    this.db.exec('BEGIN IMMEDIATE')
    this.txDepth++
    try {
      const result = fn()
      this.db.exec('COMMIT')
      return result
    } catch (error) {
      try { this.db.exec('ROLLBACK') } catch { /* 已自动回滚 / 连接已坏：保留原始错误 */ }
      throw error
    } finally {
      this.txDepth--
    }
  }

  appendEvent(instanceId: string, kind: string, detail?: unknown): void {
    this.db
      .prepare('INSERT INTO task_events (instance_id, ts, kind, detail) VALUES (?, ?, ?, ?)')
      .run(instanceId, nowIso(), kind, detail === undefined ? null : JSON.stringify(detail))
  }

  /** 实例某类事件的最新一条（回执对账 / 追问判定用）。 */
  latestEvent(instanceId: string, kind: string): { ts: string; detail: string | null } | undefined {
    return this.db
      .prepare('SELECT ts, detail FROM task_events WHERE instance_id = ? AND kind = ? ORDER BY seq DESC LIMIT 1')
      .get(instanceId, kind) as { ts: string; detail: string | null } | undefined
  }

  /** 实例某类事件计数（追问次数上限用）。 */
  countEvents(instanceId: string, kind: string): number {
    const row = this.db
      .prepare('SELECT COUNT(*) AS n FROM task_events WHERE instance_id = ? AND kind = ?')
      .get(instanceId, kind) as { n: number }
    return Number(row.n)
  }

  /**
   * 调试面板快照（临时调试通道）：全部实例 + 最近 N 条事件。
   * 事件取 seq 倒序再反转 = 升序输出（旧→新，日志阅读顺序）；detail 截断 200 字符防快照膨胀。
   */
  snapshot(limitEvents = 40): { instances: TaskInstance[]; events: SnapshotEvent[] } {
    const instances = this.db
      .prepare('SELECT * FROM task_instances ORDER BY updated_at DESC')
      .all() as unknown as TaskInstance[]
    const rows = this.db
      .prepare('SELECT seq, instance_id, ts, kind, detail FROM task_events ORDER BY seq DESC LIMIT ?')
      .all(limitEvents) as unknown as SnapshotEvent[]
    const events = rows
      .reverse()
      .map(row => ({
        ...row,
        detail: row.detail !== null && row.detail.length > 200 ? `${row.detail.slice(0, 200)}…` : row.detail,
      }))
    return { instances, events }
  }

  /**
   * 主界面运行态初始化（2026-09-30）：**一条聚合 SQL** 取每任务最近一条**终态**实例。
   * 只认终态（succeeded/failed/skipped/unknown）——「上次执行」= 最近一次**出了结果**的执行，
   * 刚落库还在跑的不算（用户 2026-09-30：运行中不得覆盖上次执行）。
   * SQLite 文档化行为：查询含 min/max 聚合时，其余裸列取**该聚合所在行**的值。
   * 走 `idx_instances_slot(task_id, scheduled_at)`，绝不做「每任务一次查询」。
   */
  lastRunByTask(): Map<string, { status: InstanceStatus; scheduledAt: string; finishedAt: string | null }> {
    const rows = this.db
      .prepare(`SELECT task_id, MAX(scheduled_at) AS scheduled_at, status, finished_at
                FROM task_instances
                WHERE status NOT IN ('dispatched','running')
                GROUP BY task_id`)
      .all() as Array<{ task_id: string; scheduled_at: string; status: InstanceStatus; finished_at: string | null }>
    const out = new Map<string, { status: InstanceStatus; scheduledAt: string; finishedAt: string | null }>()
    for (const row of rows) {
      out.set(row.task_id, { status: row.status, scheduledAt: row.scheduled_at, finishedAt: row.finished_at })
    }
    return out
  }

  /** 在飞行（dispatched / running）的实例 ⇒ 主界面「运行中」。同样一条聚合 SQL。 */
  inFlightByTask(): Map<string, string> {
    const rows = this.db
      .prepare(`SELECT task_id, MIN(scheduled_at) AS scheduled_at FROM task_instances
                WHERE status IN ('dispatched','running') GROUP BY task_id`)
      .all() as Array<{ task_id: string; scheduled_at: string }>
    const out = new Map<string, string>()
    for (const row of rows) out.set(row.task_id, row.scheduled_at)
    return out
  }

  /** 晚于某时刻的最新回执事件（决策 19：回执对账按次取新，防止上一轮 attempt 的旧回执冒充）。 */
  latestReceipt(instanceId: string, afterIso: string | undefined): { ts: string; detail: string | null } | undefined {
    return this.db
      .prepare(`SELECT ts, detail FROM task_events
                WHERE instance_id = ? AND kind = 'receipt' AND (? IS NULL OR ts > ?)
                ORDER BY seq DESC LIMIT 1`)
      .get(instanceId, afterIso ?? null, afterIso ?? null) as { ts: string; detail: string | null } | undefined
  }

  /** 启动扫描（state-machine §3 机制 #5）：已派发而未定态的实例置 unknown。 */
  startupScan(): number {
    const result = this.db
      .prepare(`UPDATE task_instances SET status = 'unknown', updated_at = ?
                WHERE status IN ('dispatched','running')`)
      .run(nowIso())
    return Number(result.changes)
  }

  /**
   * 幂等建一条实例（决策 31：懒建行，调用方先生成 id 并判定预条件通过后才调用）。
   * **身份 = 任务 + 计划刻度**——去重走 `UNIQUE(task_id, scheduled_at)`，
   * 同一刻度重复 INSERT 一律 DO NOTHING ⇒ tick 幂等。状态由调用方给定（现仅 'dispatched'）。
   * `snapshot`（决策 41）：派发快照，Loop A 落库时一并固化；缺省（旧测试 / 手动 SQL）为 NULL。
   */
  ensureInstance(
    id: string, taskId: string, logicalDate: string, scheduledAt: string, status: InstanceStatus,
    snapshot?: InstanceSnapshot,
    /** 触发来源（2026-10-03）：缺省 'scheduled'（自动调度不传）；手动「立即执行」传 'manual'。 */
    runType: InstanceRunType = 'scheduled',
  ): boolean {
    const result = this.db
      .prepare(`INSERT OR IGNORE INTO task_instances
                (id, task_id, logical_date, scheduled_at, status, attempt, snapshot, run_type, updated_at)
                VALUES (?, ?, ?, ?, ?, 0, ?, ?, ?)`)
      .run(id, taskId, logicalDate, scheduledAt, status, snapshot === undefined ? null : JSON.stringify(snapshot), runType, nowIso())
    return Number(result.changes) > 0
  }

  /**
   * 补记一条「未执行」记录（决策 54）：某个该跑的刻度**最终没跑**时，用它留一条痕迹
   * （用户：不能只在日志里，执行记录里必须看得见）。
   *
   * 身份同样是「任务 + 计划刻度」（唯一索引保证同一槽只写一条、天然幂等），但状态固定 `skipped`：
   * - `skipped` 属**终态** ⇒ Loop B `sweep` 只遍历 pending/dispatched/running/unknown，**永不重试**；
   *   `startupScan` 只改 dispatched/running，也碰不到它。
   * - **绝不能用 `unknown`/`pending`**：那会被重试逻辑真的拉起来执行，或悄悄变成 failed。
   *
   * ⚠️ `scheduledAt` 必须是被漏掉那一槽的**真实时刻**：若用「当前槽」会撞当前槽真实执行行的唯一键，
   * `INSERT OR IGNORE` 静默丢弃 ⇒ **任务永久不再执行**。
   * 原因（为什么没跑）走 `appendEvent` / `appendLog`——本表没有 message 列。
   */
  ensureSkipped(id: string, taskId: string, logicalDate: string, scheduledAt: string): boolean {
    const now = nowIso()
    const result = this.db
      .prepare(`INSERT OR IGNORE INTO task_instances
                (id, task_id, logical_date, scheduled_at, status, attempt, finished_at, updated_at)
                VALUES (?, ?, ?, ?, 'skipped', 0, ?, ?)`)
      .run(id, taskId, logicalDate, scheduledAt, now, now)
    return Number(result.changes) > 0
  }

  /** 旧实例补快照（决策 41 legacy 回退：首次被 Loop B 触到时按任务定义当场合成并固化）。 */
  setSnapshot(id: string, snapshot: InstanceSnapshot): void {
    this.db
      .prepare('UPDATE task_instances SET snapshot = ?, updated_at = ? WHERE id = ?')
      .run(JSON.stringify(snapshot), nowIso(), id)
  }

  /** 删除一条实例（决策 31.6：窗口外残留 pending 直接删，视为未执行）。 */
  deleteInstance(id: string): void {
    this.db.prepare('DELETE FROM task_instances WHERE id = ?').run(id)
  }

  /** 写入一条诊断日志（决策 31/32：未推进到执行那一步的诊断进 task_log，不污染 task_instances）。 */
  appendLog(entry: {
    taskId?: string | null
    scheduledAt?: string | null
    level: 'info' | 'warn' | 'error'
    kind: string
    message: string
  }): void {
    this.db
      .prepare('INSERT INTO task_log (ts, task_id, scheduled_at, level, kind, message) VALUES (?, ?, ?, ?, ?, ?)')
      .run(nowIso(), entry.taskId ?? null, entry.scheduledAt ?? null, entry.level, entry.kind, entry.message)
  }

  /**
   * **插件整体日志**（2026-10-07）：进程级的运行 / 异常 / 性能观测进 `plugin_log`，
   * **不进 `task_log`**（那张表的契约是「未推进到执行那一步的任务诊断」，见建表注释与
   * design/data-model.md §二）。用途：事后回答「插件这个进程当时到底怎么了」。
   *
   * ⚠️ 下游**不要直接调这个方法**——请用下面三个语义化的 `logInfo` / `logWarn` / `logError`，
   * 它们把 `level` 钉在方法名里，调用点只剩 `kind` 与文案，不会各处重复样板、也不会写错 level。
   */
  appendPluginLog(entry: {
    level: 'info' | 'warn' | 'error'
    kind: PluginLogKind
    message: string
  }): void {
    this.db
      .prepare('INSERT INTO plugin_log (ts, level, kind, message) VALUES (?, ?, ?, ?)')
      .run(nowIso(), entry.level, entry.kind, entry.message)
  }

  /**
   * ⚠️ **记日志绝不能影响主流程**（2026-10-07 审计 🔴）：这三个方法是**唯一推荐给下游**的入口，
   * 必须自带异常隔离。否则：
   *  - `startup` 写入抛错 ⇒ 插件半初始化（定时器已种、dispose 未注册）；
   *  - `shutdown` 写入抛错 ⇒ **后面的清理动作（退订 / 停定时器 / 关连接 / close 库）全都不执行**。
   * 一条日志没记上，远比整个插件生命周期被卡住划算。
   */
  logInfo(kind: PluginLogKind, message: string): void {
    this.safelyAppend('info', kind, message)
  }
  /** 记一条 warn 级插件日志（降级 / 观测告警：功能还在，但不如预期）。 */
  logWarn(kind: PluginLogKind, message: string): void {
    this.safelyAppend('warn', kind, message)
  }
  /** 记一条 error 级插件日志（真的出错了）。 */
  logError(kind: PluginLogKind, message: string): void {
    this.safelyAppend('error', kind, message)
  }

  /** 落库并吞掉一切异常（见 `logInfo` 的注释）。 */
  private safelyAppend(level: 'info' | 'warn' | 'error', kind: PluginLogKind, message: string): void {
    try {
      this.appendPluginLog({ level, kind, message })
    } catch {
      // 库不可写时**只能**放弃这条日志：还有宿主 logger 那条路，且主流程必须继续。
    }
  }

  /** 按保留期清除 `plugin_log`（与 `task_log` 同策略，默认 30 天）。返回删除条数。 */
  purgePluginLog(retentionDays: number): number {
    const cutoff = new Date(Date.now() - retentionDays * 86_400_000).toISOString()
    const result = this.db.prepare('DELETE FROM plugin_log WHERE ts < ?').run(cutoff)
    return Number(result.changes)
  }

  /** 按保留期清除 task_log（决策 32：独立表，可定时清）。返回删除条数。 */
  purgeLog(retentionDays: number): number {
    const cutoff = new Date(Date.now() - retentionDays * 86_400_000).toISOString()
    const result = this.db.prepare('DELETE FROM task_log WHERE ts < ?').run(cutoff)
    return Number(result.changes)
  }

  /**
   * 操作审计留痕（2026-09-30）：新增 / 修改 / 删除任务、版本留档 / 找回、附件增删都记一笔。
   * 与 `task_log`（诊断）分开：审计**默认不清**，要能回答「这任务什么时候被改成什么样」。
   */
  appendAudit(entry: { taskId?: string | null; action: string; detail?: unknown }): void {
    this.db
      .prepare('INSERT INTO task_audit (ts, task_id, action, detail) VALUES (?, ?, ?, ?)')
      .run(nowIso(), entry.taskId ?? null, entry.action, entry.detail === undefined ? null : JSON.stringify(entry.detail))
  }

  /** 审计流水（某任务的最近 N 条，新的在前）。 */
  listAudit(taskId: string, limit = 100): { ts: string; action: string; detail: string | null }[] {
    return this.db
      .prepare('SELECT ts, action, detail FROM task_audit WHERE task_id = ? ORDER BY seq DESC LIMIT ?')
      .all(taskId, limit) as unknown as { ts: string; action: string; detail: string | null }[]
  }

  /**
   * ⚠️ **执行记录永久保留，没有清除方法**（用户 2026-10-08 拍板）：历史是用来查的、不该被清，
   * 原 `purgeHistory` 与 `historyRetentionDays` 配置一并删除。
   */

  /** 完成瞬间写回两桶产出与 token 三拆列（决策 32 修订：总表冗余，task_events 仍为真源）。 */
  recordCompletion(
    id: string,
    outputs: string | null,
    processOutputs: string | null,
    tokenIn: number | null,
    tokenOut: number | null,
    tokenInCache: number | null,
  ): void {
    this.db
      .prepare('UPDATE task_instances SET outputs = ?, process_outputs = ?, token_in = ?, token_out = ?, token_in_cache = ?, updated_at = ? WHERE id = ?')
      .run(outputs, processOutputs, tokenIn, tokenOut, tokenInCache, nowIso(), id)
  }

  /** 按「任务 + 刻度」查实例（手动排查 / 备用回执通道用，不依赖 id 形态）。 */
  findBySlot(taskId: string, scheduledAt: string): TaskInstance | undefined {
    return this.db
      .prepare('SELECT * FROM task_instances WHERE task_id = ? AND scheduled_at = ?')
      .get(taskId, scheduledAt) as unknown as TaskInstance | undefined
  }

  get(id: string): TaskInstance | undefined {
    return this.db.prepare('SELECT * FROM task_instances WHERE id = ?').get(id) as unknown as TaskInstance | undefined
  }

  /** 读 meta 键值（无行返回 undefined——「从未写过」与「写过空串」借此区分）。 */
  getMeta(key: string): string | undefined {
    const row = this.db.prepare('SELECT value FROM meta WHERE key = ?').get(key) as
      | { value: string }
      | undefined
    return row?.value
  }

  /** 写 meta 键值（upsert）。任务表 tasksInline 的持久化主通道走这里。 */
  setMeta(key: string, value: string): void {
    this.db
      .prepare('INSERT INTO meta (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value')
      .run(key, value)
  }

  /** 调试 / 设置页查询允许的表名（SQLite 表名无法参数化，白名单防注入）。 */
  static readonly DUMP_TABLES = ['task_instances', 'task_events', 'task_log', 'task_audit', 'plugin_log', 'meta'] as const

  /** 各表的「最新在前」默认排序列（设置页 Block 3 从简：每表按各自最新字段 DESC，不做排序选择器）。 */
  private static defaultOrder(name: (typeof TaskStore.DUMP_TABLES)[number]): string {
    switch (name) {
      case 'task_events': return 'seq DESC'
      case 'task_instances': return 'scheduled_at DESC, id DESC'
      case 'task_log': return 'ts DESC, seq DESC'
      case 'task_audit': return 'seq DESC'
      case 'plugin_log': return 'ts DESC, seq DESC'
      default: return 'key' // meta：按 key 升序（DESC 无意义，保持原行为）
    }
  }

  /** 表列缓存（白名单校验过滤列名，避免每请求打 PRAGMA）。 */
  private columnCache = new Map<string, string[]>()

  /** 取表列（建表顺序），带缓存。 */
  private columnsOf(name: string): string[] {
    let cols = this.columnCache.get(name)
    if (cols === undefined) {
      cols = (this.db.prepare(`PRAGMA table_info(${name})`).all() as Array<{ name: string }>).map(c => c.name)
      this.columnCache.set(name, cols)
    }
    return cols
  }

  /**
   * 单表通用查询（设置页 Block 3 / Block 2 共用）：按白名单表 + 占位绑定过滤 + 默认最新字段 DESC + LIMIT。
   * 不做服务端分页（用户 2026-10-08：top-N 自过滤、客户端自行筛选）。表名 / 列名 / 运算符全白名单，无注入面。
   * @param name 表名（必须命中 `DUMP_TABLES`）。
   * @param filters 过滤条件（列名须为该表真实列，运算符须为 `TABLE_FILTER_OPS`）。
   * @param limit 最多返回行数（钳制 1..500）。
   */
  queryTable(name: (typeof TaskStore.DUMP_TABLES)[number], filters: TableFilter[], limit: number): TableQueryResult {
    if (!(TaskStore.DUMP_TABLES as readonly string[]).includes(name)) throw new Error(`queryTable: unknown table ${name}`)
    const columns = this.columnsOf(name)
    const colSet = new Set(columns)
    const where: string[] = []
    const params: Array<string | number> = []
    for (const f of filters) {
      if (!colSet.has(f.column)) throw new Error(`queryTable: unknown column ${f.column}`)
      if (!(TABLE_FILTER_OPS as readonly string[]).includes(f.op)) throw new Error(`queryTable: bad op ${f.op}`)
      where.push(`${f.column} ${f.op} ?`)
      params.push(f.value)
    }
    const whereSql = where.length > 0 ? ` WHERE ${where.join(' AND ')}` : ''
    const count = (this.db.prepare(`SELECT COUNT(*) AS n FROM ${name}${whereSql}`).get(...params) as { n: number }).n
    const lim = Math.max(1, Math.min(limit, 500))
    const rows = this.db.prepare(`SELECT * FROM ${name}${whereSql} ORDER BY ${TaskStore.defaultOrder(name)} LIMIT ?`).all(...params, lim) as Record<string, unknown>[]
    return { name, count, columns, rows, truncated: count > rows.length }
  }

  /**
   * 调试导出：整表原样读出（旧调试页用，保留兼容）。
   * @param name - 表名（必须命中白名单）。
   * @param limit - 最多返回行数；超出时保留「最新」的 limit 条。
   */
  dumpTable(name: (typeof TaskStore.DUMP_TABLES)[number], limit: number): TableDump {
    if (!(TaskStore.DUMP_TABLES as readonly string[]).includes(name)) {
      throw new Error(`dumpTable: unknown table ${name}`)
    }
    const columns = this.columnsOf(name)
    const rows = this.db.prepare(`SELECT * FROM ${name} ORDER BY ${TaskStore.defaultOrder(name)} LIMIT ?`).all(limit) as
      Record<string, unknown>[]
    return { name, count: (this.db.prepare(`SELECT COUNT(*) AS n FROM ${name}`).get() as { n: number }).n, columns, rows, truncated: false }
  }

  getBySession(sessionId: string): TaskInstance | undefined {
    return this.db
      .prepare('SELECT * FROM task_instances WHERE session_id = ? ORDER BY updated_at DESC')
      .get(sessionId) as unknown as TaskInstance | undefined
  }

  /**
   * 计划重排（决策 20）：计划时刻在「从未执行」前跟随配置 live 更新——仅 status=pending
   * 且 attempt=0 可改，CAS 守卫防与派发竞态；执行一旦开始（attempt≥1）即冻结。
   */
  reschedule(id: string, scheduledAt: string): boolean {
    // 目标刻度已被同任务的另一条实例占用（决策 25：一天可能多个刻度）⇒ 不再重排，返回 false。
    // 没有这道判断，UPDATE 会直接撞 UNIQUE(task_id, scheduled_at) 把 tick 打挂。
    const taken = this.db
      .prepare(`SELECT 1 AS x FROM task_instances
                WHERE scheduled_at = ? AND id != ?
                  AND task_id = (SELECT task_id FROM task_instances WHERE id = ?)`)
      .get(scheduledAt, id, id)
    if (taken !== undefined) return false
    const result = this.db
      .prepare(`UPDATE task_instances SET scheduled_at = ?, updated_at = ?
                WHERE id = ? AND status = 'pending' AND attempt = 0`)
      .run(scheduledAt, nowIso(), id)
    return Number(result.changes) > 0
  }

  listByStatus(statuses: readonly InstanceStatus[]): TaskInstance[] {
    const placeholders = statuses.map(() => '?').join(',')
    return this.db
      .prepare(`SELECT * FROM task_instances WHERE status IN (${placeholders}) ORDER BY scheduled_at`)
      .all(...statuses) as unknown as TaskInstance[]
  }

  /** 同任务非终态实例（排除某实例自身），用于同任务串行判定（state-machine §8）。 */
  listNonTerminalOfTask(taskId: string, excludeId?: string): TaskInstance[] {
    return this.db
      .prepare(`SELECT * FROM task_instances
                WHERE task_id = ? AND status IN (${NON_TERMINAL_STATUSES.map(() => '?').join(',')})
                  AND id != COALESCE(?, '')
                ORDER BY scheduled_at`)
      .all(taskId, ...NON_TERMINAL_STATUSES, excludeId ?? null) as unknown as TaskInstance[]
  }

  /** CAS 领取（data-model 关键设计 3）：仅 pending 可领取，受影响行数判定成败。 */
  casClaim(id: string): boolean {
    const now = nowIso()
    const result = this.db
      .prepare(`UPDATE task_instances
                SET status = 'dispatched', dispatched_at = ?, updated_at = ?
                WHERE id = ? AND status = 'pending'`)
      .run(now, now, id)
    if (Number(result.changes) > 0) this.appendEvent(id, 'state_change', { to: 'dispatched', reason: 'cas-claim' })
    return Number(result.changes) > 0
  }

  /** 通用状态转移：无条件写（调用方按状态机自查前置态）并留 state_change 事件。 */
  transition(id: string, input: TransitionInput): void {
    const current = this.get(id)
    if (current === undefined) throw new Error(`实例不存在: ${id}`)
    const now = nowIso()
    this.db
      .prepare(`UPDATE task_instances
                SET status = ?, attempt = ?, session_id = ?, lease_until = ?,
                    dispatched_at = ?, finished_at = ?, updated_at = ?
                WHERE id = ?`)
      .run(
        input.status,
        input.attempt ?? current.attempt,
        input.session_id === undefined ? current.session_id : input.session_id,
        input.lease_until === undefined ? current.lease_until : input.lease_until,
        input.dispatched_at === undefined ? current.dispatched_at : input.dispatched_at,
        input.finished_at === undefined ? current.finished_at : input.finished_at,
        now,
        id,
      )
    this.appendEvent(id, 'state_change', { from: current.status, to: input.status, reason: input.detail })
  }

  /** running 心跳续租（state-machine §4）：收到该会话任何事件即续租。 */
  renewLease(id: string, leaseMs: number): void {
    this.db
      .prepare(`UPDATE task_instances SET lease_until = ?, updated_at = ? WHERE id = ?`)
      .run(new Date(Date.now() + leaseMs).toISOString(), nowIso(), id)
  }

  /** 依赖判定 same_period（state-machine §9）：同 logical_date 的上游实例；一天多刻度取最新一条（决策 33）。 */
  getSamePeriod(upstreamTaskId: string, logicalDate: string): TaskInstance | undefined {
    return this.db
      .prepare('SELECT * FROM task_instances WHERE task_id = ? AND logical_date = ? ORDER BY scheduled_at DESC LIMIT 1')
      .get(upstreamTaskId, logicalDate) as TaskInstance | undefined
  }

  /**
   * 某任务的**最近一条**实例（不分状态，按 `scheduled_at` 倒序）——决策 33 判定用：
   * 上游最近一条必须**正好是 `succeeded`** 才放行；在跑 / 失败 / 无记录 ⇒ 阻塞。
   * ⚠️ 排序必须按 `scheduled_at`：原按 `logical_date` 只到「日」，同日多次取哪条不确定。
   */
  getLatestInstance(taskId: string): TaskInstance | undefined {
    return this.db
      .prepare('SELECT * FROM task_instances WHERE task_id = ? ORDER BY scheduled_at DESC LIMIT 1')
      .get(taskId) as TaskInstance | undefined
  }

  /**
   * 按任务 / 工作区 + 状态 / 时间过滤的执行记录（任务卡片「执行记录」面板 + 未来总查询页共用）。
   * 排序 `scheduled_at DESC, id DESC`；`cursor` 编码末行 `(scheduled_at, id)`，`LIMIT limit+1` 判定是否还有下一页
   * （limit+1 弹出一行 ⇒ 有剩余才给 cursor，恰好取尽时不会多翻一页）。全部条件走占位绑定，无注入面。
   */
  listInstancesByQuery(q: InstanceQuery): InstancePage {
    const { where, params } = this.instanceWhere(q)
    const limit = Math.max(1, Math.min(q.limit ?? 100, 500))
    const sql = `SELECT * FROM task_instances${where === '' ? '' : ` WHERE ${where}`} ORDER BY scheduled_at DESC, id DESC LIMIT ?`
    const rows = this.db.prepare(sql).all(...params, limit + 1) as unknown as TaskInstance[]
    let nextCursor: string | null = null
    if (rows.length > limit) {
      rows.pop()
      const last = rows[rows.length - 1]
      nextCursor = encodeCursor([last.scheduled_at, last.id])
    }
    // 备注（用户 2026-10-02 第五轮）：失败 / 跳过的原因写在 task_events（本表无 message 列）——
    // 对本页 failed/skipped 行各取「最新一条原因类事件」，从 detail JSON 里提 reason / note。
    this.attachNotes(rows)
    return { rows, nextCursor }
  }

  /**
   * 轻量版执行记录（「任务日程」日历页按月取数用，2026-10-05）。
   *
   * 与 `listInstancesByQuery` **同一套过滤条件**（都走 `instanceWhere`），区别只有两点：
   *   ① 列清单剔除 `snapshot`（见 `LiteTaskInstance`）—— 日历一次取满整月，不带几 KB 的大列；
   *   ② **不分页**，上限 3000，触及即 `truncated: true`（由页面提示收窄过滤，**不静默丢**）。
   * ⚠️ 既有 `listInstancesByQuery` 的 500 上限与游标语义**一个字都没改**（记录页游标分页依赖它）。
   */
  listInstancesLite(q: InstanceQuery): LiteInstancePage {
    const { where, params } = this.instanceWhere(q)
    const limit = Math.max(1, Math.min(q.limit ?? TaskStore.LITE_INSTANCE_LIMIT, TaskStore.LITE_INSTANCE_LIMIT))
    const sql = `SELECT ${TaskStore.LITE_INSTANCE_COLUMNS} FROM task_instances${where === '' ? '' : ` WHERE ${where}`} ORDER BY scheduled_at DESC, id DESC LIMIT ?`
    const rows = this.db.prepare(sql).all(...params, limit + 1) as unknown as LiteTaskInstance[]
    let truncated = false
    if (rows.length > limit) {
      rows.pop()
      truncated = true
    }
    this.attachNotes(rows)
    return { rows, truncated }
  }

  /**
   * 执行记录过滤条件的**唯一构造**（全量查询与轻量查询共用 ⇒ SQL 条件不写第二遍）。
   * 全部条件走占位绑定，无注入面。
   */
  private instanceWhere(q: InstanceQuery): { where: string; params: Array<string | number> } {
    const where: string[] = []
    const params: Array<string | number> = []
    if (q.taskId !== undefined) {
      where.push('task_id = ?')
      params.push(q.taskId)
    }
    if (q.sessionId !== undefined) {
      where.push('session_id = ?')
      params.push(q.sessionId)
    }
    if (q.taskIds !== undefined && q.taskIds.length > 0) {
      where.push(`task_id IN (${q.taskIds.map(() => '?').join(',')})`)
      params.push(...q.taskIds)
    }
    if (q.statuses !== undefined && q.statuses.length > 0) {
      where.push(`status IN (${q.statuses.map(() => '?').join(',')})`)
      params.push(...q.statuses)
    }
    if (q.fromTs !== undefined) {
      where.push('scheduled_at >= ?')
      params.push(q.fromTs)
    }
    if (q.toTs !== undefined) {
      // 半开区间：`< to`（to = 结束日的**次日 00:00**，由客户端 ui/time-range.rangeToQuery 归一）。
      // 不用 `<=` + 23:59:59.999 的补丁式含尾（见 design/features/task-expand-panels.md §3.11）。
      where.push('scheduled_at < ?')
      params.push(q.toTs)
    }
    const cursor = q.cursor === undefined ? null : decodeCursor(q.cursor)
    if (cursor !== null && cursor.length === 2) {
      // row-value 比较：DESC 序里「排在游标之后」= 键更小（决策 25 身份键做 tiebreaker，同刻度不重不漏）。
      where.push('(scheduled_at, id) < (?, ?)')
      params.push(String(cursor[0]), String(cursor[1]))
    }
    return { where: where.join(' AND '), params }
  }

  /** 轻量查询的**显式列清单**：与 `SELECT *` 的唯一差别是剔除 `snapshot`（见 `LiteTaskInstance`）。 */
  private static readonly LITE_INSTANCE_COLUMNS =
    'id, task_id, logical_date, scheduled_at, status, attempt, run_type, session_id, lease_until,'
    + ' dispatched_at, finished_at, outputs, token_in, token_out, token_in_cache, updated_at'
  /** 轻量查询上限：比全量查询的 500 宽（轻量行约 200 B），够日历一次取满一个月的正常量级。 */
  private static readonly LITE_INSTANCE_LIMIT = 3000

  /** 「原因类」事件 kind 白名单（写原因的只有这几类；receipt.note / *.reason）。 */
  private static readonly NOTE_EVENT_KINDS = ['task-error', 'expired-once', 'missed-slot', 'receipt', 'no-receipt'] as const

  /** detail JSON → 人话原因：receipt 取 note，其余取 reason；取不到回退原文。 */
  private static noteOfEvent(kind: string, detail: string | null): string | null {
    if (detail === null || detail === '') return null
    try {
      const parsed = JSON.parse(detail) as { reason?: unknown; note?: unknown }
      const text = kind === 'receipt' ? parsed.note : parsed.reason
      return typeof text === 'string' && text !== '' ? text : detail
    } catch {
      return detail
    }
  }

  /**
   * 给分页行就地填 note（只查 failed / skipped 行，一次 IN 查询取每实例最新原因事件）。
   * 入参放宽成最小结构 ⇒ 全量行与轻量行（`LiteTaskInstance`，无 snapshot）都能走这一份实现。
   */
  private attachNotes(rows: Array<{ id: string; status: InstanceStatus; note?: string | null }>): void {
    const wanted = rows.filter(row => row.status === 'failed' || row.status === 'skipped').map(row => row.id)
    if (wanted.length === 0) return
    const marks = wanted.map(() => '?').join(',')
    const events = this.db
      .prepare(`SELECT instance_id, kind, detail, MAX(seq) AS seq FROM task_events
                WHERE kind IN ('task-error','expired-once','missed-slot','receipt','no-receipt') AND instance_id IN (${marks})
                GROUP BY instance_id`)
      .all(...wanted) as unknown as Array<{ instance_id: string; kind: string; detail: string | null }>
    const byId = new Map(events.map(event => [event.instance_id, TaskStore.noteOfEvent(event.kind, event.detail)]))
    for (const row of rows) {
      if (row.status === 'failed' || row.status === 'skipped') row.note = byId.get(row.id) ?? null
    }
  }

  /**
   * 按任务 / 工作区 + 级别 / 关键字 / 时间过滤的诊断日志（任务卡片「日志」面板 + 未来总查询页共用）。
   * 排序 `ts DESC, seq DESC`；`cursor` 编码末行 `(ts, seq)`。`keyword` 走 `LIKE %kw%`（参数化，不拼 SQL）。
   */
  listLogsByQuery(q: LogQuery): LogPage {
    const where: string[] = []
    const params: Array<string | number> = []
    if (q.taskId !== undefined) {
      where.push('task_id = ?')
      params.push(q.taskId)
    }
    if (q.taskIds !== undefined && q.taskIds.length > 0) {
      where.push(`task_id IN (${q.taskIds.map(() => '?').join(',')})`)
      params.push(...q.taskIds)
    }
    if (q.levels !== undefined && q.levels.length > 0) {
      where.push(`level IN (${q.levels.map(() => '?').join(',')})`)
      params.push(...q.levels)
    }
    if (q.keyword !== undefined && q.keyword.trim() !== '') {
      // ⚠️ 必须**同时匹配 kind**（用户 2026-10-03 揪出）：日志行显示成 `missed-slot: 上一刻度未执行…`，
      // 前半的 `missed-slot` 是 **kind**、后半中文才是 message。只匹配 message 的话，
      // 搜「上一刻」能搜到、搜「missed」却搜不到 —— 用户看到的就是「明明有这条却过滤不出来」。
      where.push('(message LIKE ? OR kind LIKE ?)')
      const kw = `%${q.keyword.trim()}%`
      params.push(kw, kw)
    }
    if (q.fromTs !== undefined) {
      where.push('ts >= ?')
      params.push(q.fromTs)
    }
    if (q.toTs !== undefined) {
      // 半开区间：`< to`（与执行记录同口径，见 ui/time-range.rangeToQuery）。
      where.push('ts < ?')
      params.push(q.toTs)
    }
    const cursor = q.cursor === undefined ? null : decodeCursor(q.cursor)
    if (cursor !== null && cursor.length === 2) {
      where.push('(ts, seq) < (?, ?)')
      params.push(String(cursor[0]), Number(cursor[1]))
    }
    const limit = Math.max(1, Math.min(q.limit ?? 100, 500))
    const sql = `SELECT seq, ts, task_id, scheduled_at, level, kind, message FROM task_log${where.length > 0 ? ` WHERE ${where.join(' AND ')}` : ''} ORDER BY ts DESC, seq DESC LIMIT ?`
    const rows = this.db.prepare(sql).all(...params, limit + 1) as unknown as LogRow[]
    let nextCursor: string | null = null
    if (rows.length > limit) {
      rows.pop()
      const last = rows[rows.length - 1]
      nextCursor = encodeCursor([last.ts, last.seq])
    }
    return { rows, nextCursor }
  }

  /** 某实例的事件时间线（执行记录下钻用）：seq 升序 = 旧→新，日志阅读顺序。 */
  listEventsByInstance(instanceId: string): InstanceEventRow[] {
    return this.db
      .prepare('SELECT seq, ts, kind, detail FROM task_events WHERE instance_id = ? ORDER BY seq ASC')
      .all(instanceId) as unknown as InstanceEventRow[]
  }

  /* 手动补跑标准 SQL（state-machine §7）——插件不提供 UI，按需手工执行。
     决策 25 后身份 = 任务 + 计划刻度，按刻度定位（不再依赖 id 字符串形态）：
  UPDATE task_instances
  SET status = 'pending', attempt = 0, lease_until = NULL,
      dispatched_at = NULL, finished_at = NULL, updated_at = <now>
  WHERE task_id = '<task_id>' AND scheduled_at = '<计划时刻 ISO>';
  */
}
