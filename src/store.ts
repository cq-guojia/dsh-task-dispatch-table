// SQLite 状态库：两表 DDL 照抄 data-model.md；状态机 7 态载体（state-machine.md）。
// Node >= 22.5 内置 node:sqlite（宿主 engines ^22.19.0 || >=24.0.0），零原生依赖。
import { DatabaseSync } from 'node:sqlite'
import { randomUUID } from 'node:crypto'
import { mkdirSync } from 'node:fs'
import { dirname } from 'node:path'

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

export interface TaskInstance {
  id: string
  task_id: string
  logical_date: string
  scheduled_at: string
  status: InstanceStatus
  attempt: number
  session_id: string | null
  lease_until: string | null
  dispatched_at: string | null
  finished_at: string | null
  outputs: string | null
  token_in: number | null
  token_out: number | null
  token_in_cache: number | null
  /** 派发快照（决策 41）：落库时固化的执行所需字段 JSON；旧行 / 异常为 null。 */
  snapshot: string | null
  updated_at: string
}

/** 一条已解析的上游依赖（决策 43）：Loop A 判定通过时固化，Loop B 只读不重判。 */
export interface ResolvedDependency {
  /** 上游任务 id（depends_on.task 原值）。 */
  task: string
  semantics: 'same_period' | 'latest_success'
  /** 判定通过那一刻命中的上游实例 id。 */
  instanceId: string
  /** 上游实例的计划时刻（ISO）。 */
  scheduledAt: string
  /** 上游实例的会话 id（无则 null）。 */
  sessionId: string | null
  /** 上游实例快照的工作区 path（产出相对路径的绝对化基准）；上游旧行无快照为 null。 */
  workspacePath: string | null
  /** 上游回执声明并校验过的产出（相对上游工作区；未声明为空数组）。 */
  outputs: string[]
}

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

/** 解析 resolvedDeps（决策 43）：字段缺失（旧行）⇒ undefined；任一条形状不对 ⇒ 整组丢弃。 */
function parseResolvedDeps(raw: unknown): ResolvedDependency[] | undefined {
  if (raw === undefined) return undefined
  if (!Array.isArray(raw)) return undefined
  const out: ResolvedDependency[] = []
  for (const item of raw) {
    if (typeof item !== 'object' || item === null) return undefined
    const d = item as Partial<ResolvedDependency>
    if (typeof d.task !== 'string' || typeof d.instanceId !== 'string' || typeof d.scheduledAt !== 'string'
      || (d.semantics !== 'same_period' && d.semantics !== 'latest_success')
      || (d.sessionId !== null && typeof d.sessionId !== 'string')
      || (d.workspacePath !== null && typeof d.workspacePath !== 'string')
      || !Array.isArray(d.outputs)) return undefined
    out.push({
      task: d.task,
      semantics: d.semantics,
      instanceId: d.instanceId,
      scheduledAt: d.scheduledAt,
      sessionId: d.sessionId ?? null,
      workspacePath: d.workspacePath ?? null,
      outputs: d.outputs.filter((x): x is string => typeof x === 'string'),
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
  session_id    TEXT,
  lease_until   TEXT,
  dispatched_at TEXT,
  finished_at   TEXT,
  outputs       TEXT,
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

export interface LogQuery {
  taskId?: string
  taskIds?: readonly string[]
  levels?: readonly string[]
  /** message 子串匹配（LIKE %kw%）。 */
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

  /** 决策 32（修订）：兼容旧库（无 outputs / token 三拆列）。 */
  private ensureInstanceColumns(): void {
    const cols = new Set(
      (this.db.prepare('PRAGMA table_info(task_instances)').all() as Array<{ name: string }>).map(c => c.name),
    )
    if (!cols.has('outputs')) this.db.exec('ALTER TABLE task_instances ADD COLUMN outputs TEXT')
    // 旧版决策 32 曾用单个 tokens 列；拆成三列后卸下旧列（不支持 DROP COLUMN 的旧 SQLite 静默跳过）。
    if (cols.has('tokens')) {
      try { this.db.exec('ALTER TABLE task_instances DROP COLUMN tokens') } catch { /* 旧引擎不支持 DROP COLUMN，留作死列无害 */ }
    }
    if (!cols.has('token_in')) this.db.exec('ALTER TABLE task_instances ADD COLUMN token_in INTEGER')
    if (!cols.has('token_out')) this.db.exec('ALTER TABLE task_instances ADD COLUMN token_out INTEGER')
    if (!cols.has('token_in_cache')) this.db.exec('ALTER TABLE task_instances ADD COLUMN token_in_cache INTEGER')
    // 决策 41：派发快照列。旧行为 NULL ⇒ 对账走 legacyTask 回退（读一次任务表当场补快照，不静默）。
    if (!cols.has('snapshot')) this.db.exec('ALTER TABLE task_instances ADD COLUMN snapshot TEXT')
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
  ): boolean {
    const result = this.db
      .prepare(`INSERT OR IGNORE INTO task_instances
                (id, task_id, logical_date, scheduled_at, status, attempt, snapshot, updated_at)
                VALUES (?, ?, ?, ?, ?, 0, ?, ?)`)
      .run(id, taskId, logicalDate, scheduledAt, status, snapshot === undefined ? null : JSON.stringify(snapshot), nowIso())
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
   * 按保留期清除执行记录（**默认不清**：`days <= 0` 直接返回 0）。
   * 清的时候**保护每个任务最近一条终态记录**（succeeded / failed）：否则月 / 季 / 年任务的历史
   * 被清干净后，下游 `latest_success` 永远查不到 ⇒ 静默阻塞（评审 P1）。
   * 删实例行时连带删它的事件，不留孤儿。
   */
  purgeHistory(days: number): { instances: number; events: number } {
    if (days <= 0) return { instances: 0, events: 0 }
    const cutoff = new Date(Date.now() - days * 86_400_000).toISOString()
    const doomed = this.db
      .prepare(`SELECT id FROM task_instances
                 WHERE updated_at < ?
                   AND status IN ('succeeded','failed','skipped','unknown')
                   AND id NOT IN (
                     SELECT i.id FROM task_instances i
                     WHERE i.status IN ('succeeded','failed')
                       AND i.updated_at = (SELECT MAX(j.updated_at) FROM task_instances j
                                           WHERE j.task_id = i.task_id AND j.status IN ('succeeded','failed'))
                   )`)
      .all(cutoff) as unknown as { id: string }[]
    let events = 0
    for (const row of doomed) {
      const result = this.db.prepare('DELETE FROM task_events WHERE instance_id = ?').run(row.id)
      events += Number(result.changes)
    }
    const result = this.db
      .prepare(`DELETE FROM task_instances WHERE id IN (SELECT id FROM task_instances
                 WHERE updated_at < ?
                   AND status IN ('succeeded','failed','skipped','unknown')
                   AND id NOT IN (
                     SELECT i.id FROM task_instances i
                     WHERE i.status IN ('succeeded','failed')
                       AND i.updated_at = (SELECT MAX(j.updated_at) FROM task_instances j
                                           WHERE j.task_id = i.task_id AND j.status IN ('succeeded','failed'))
                   ))`)
      .run(cutoff)
    return { instances: Number(result.changes), events }
  }

  /** 完成瞬间写回产出与 token 三拆列（决策 32 修订：总表冗余，task_events 仍为真源）。 */
  recordCompletion(
    id: string,
    outputs: string | null,
    tokenIn: number | null,
    tokenOut: number | null,
    tokenInCache: number | null,
  ): void {
    this.db
      .prepare('UPDATE task_instances SET outputs = ?, token_in = ?, token_out = ?, token_in_cache = ?, updated_at = ? WHERE id = ?')
      .run(outputs, tokenIn, tokenOut, tokenInCache, nowIso(), id)
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

  /** 调试导出允许的表名（SQLite 表名无法参数化，白名单防注入）。 */
  static readonly DUMP_TABLES = ['task_instances', 'task_events', 'task_log', 'task_audit', 'meta'] as const

  /**
   * 调试导出：整表原样读出（面板「调试」页用）。
   * @param name - 表名（必须命中白名单）。
   * @param limit - 最多返回行数；超出时保留「最新」的 limit 条（events 按 seq、instances 按 scheduled_at 倒序）。
   */
  dumpTable(name: (typeof TaskStore.DUMP_TABLES)[number], limit: number): TableDump {
    if (!(TaskStore.DUMP_TABLES as readonly string[]).includes(name)) {
      throw new Error(`dumpTable: unknown table ${name}`)
    }
    const count = (this.db.prepare(`SELECT COUNT(*) AS n FROM ${name}`).get() as { n: number }).n
    const order =
      name === 'task_events' ? 'seq DESC'
        : name === 'task_instances' ? 'scheduled_at DESC, id DESC'
          : name === 'task_log' ? 'ts DESC, seq DESC'
            : name === 'task_audit' ? 'seq DESC'
              : 'key' // meta：按 key 升序
    const rows = this.db.prepare(`SELECT * FROM ${name} ORDER BY ${order} LIMIT ?`).all(limit) as
      Record<string, unknown>[]
    const columns = (this.db.prepare(`PRAGMA table_info(${name})`).all() as { name: string }[]).map(col => col.name)
    return { name, count, columns, rows, truncated: count > rows.length }
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
    const limit = Math.max(1, Math.min(q.limit ?? 100, 500))
    const sql = `SELECT * FROM task_instances${where.length > 0 ? ` WHERE ${where.join(' AND ')}` : ''} ORDER BY scheduled_at DESC, id DESC LIMIT ?`
    const rows = this.db.prepare(sql).all(...params, limit + 1) as unknown as TaskInstance[]
    let nextCursor: string | null = null
    if (rows.length > limit) {
      rows.pop()
      const last = rows[rows.length - 1]
      nextCursor = encodeCursor([last.scheduled_at, last.id])
    }
    return { rows, nextCursor }
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
      where.push('message LIKE ?')
      params.push(`%${q.keyword.trim()}%`)
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
