// SQLite 状态库：两表 DDL 照抄 data-model.md；状态机 7 态载体（state-machine.md）。
// Node >= 22.5 内置 node:sqlite（宿主 engines ^22.19.0 || >=24.0.0），零原生依赖。
import { DatabaseSync } from 'node:sqlite'
import { randomUUID } from 'node:crypto'
import { mkdirSync } from 'node:fs'
import { dirname } from 'node:path'

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
  tokens: number | null
  updated_at: string
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
  tokens        INTEGER,
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
`

const nowIso = (): string => new Date().toISOString()

export class TaskStore {
  private readonly db: DatabaseSync

  /**
   * 迁移时因「同任务同刻度重复」被合并掉的行数。
   * > 0 说明历史数据里存在重复（正常不该有），宿主会打告警——**绝不静默删数据**。
   */
  dupRowsRemoved = 0

  constructor(statePath: string) {
    mkdirSync(dirname(statePath), { recursive: true })
    this.db = new DatabaseSync(statePath)
    this.db.exec('PRAGMA journal_mode = WAL;')
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

  /** 决策 32：兼容旧库（无 outputs / tokens 列）。 */
  private ensureInstanceColumns(): void {
    const cols = new Set(
      (this.db.prepare('PRAGMA table_info(task_instances)').all() as Array<{ name: string }>).map(c => c.name),
    )
    if (!cols.has('outputs')) this.db.exec('ALTER TABLE task_instances ADD COLUMN outputs TEXT')
    if (!cols.has('tokens')) this.db.exec('ALTER TABLE task_instances ADD COLUMN tokens INTEGER')
  }

  close(): void {
    this.db.close()
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
   */
  ensureInstance(id: string, taskId: string, logicalDate: string, scheduledAt: string, status: InstanceStatus): boolean {
    const result = this.db
      .prepare(`INSERT OR IGNORE INTO task_instances
                (id, task_id, logical_date, scheduled_at, status, attempt, updated_at)
                VALUES (?, ?, ?, ?, ?, 0, ?)`)
      .run(id, taskId, logicalDate, scheduledAt, status, nowIso())
    return Number(result.changes) > 0
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

  /** 完成瞬间写回产出与 token（决策 32：总表冗余，task_events 仍为真源）。 */
  recordCompletion(id: string, outputs: string | null, tokens: number | null): void {
    this.db
      .prepare('UPDATE task_instances SET outputs = ?, tokens = ?, updated_at = ? WHERE id = ?')
      .run(outputs, tokens, nowIso(), id)
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
  static readonly DUMP_TABLES = ['task_instances', 'task_events', 'task_log', 'meta'] as const

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

  /** 依赖判定 same_period（state-machine §9）：同 logical_date 的上游实例。 */
  getSamePeriod(upstreamTaskId: string, logicalDate: string): TaskInstance | undefined {
    return this.db
      .prepare('SELECT * FROM task_instances WHERE task_id = ? AND logical_date = ?')
      .get(upstreamTaskId, logicalDate) as TaskInstance | undefined
  }

  /** 依赖判定 latest_success（state-machine §9）：最近一次 succeeded；freshnessCutoff 为 ISO 时刻下限。 */
  getLatestSuccess(upstreamTaskId: string, freshnessCutoff: string | undefined): TaskInstance | undefined {
    const rows = this.db
      .prepare(`SELECT * FROM task_instances
                WHERE task_id = ? AND status = 'succeeded'
                ORDER BY logical_date DESC LIMIT 1`)
      .get(upstreamTaskId) as TaskInstance | undefined
    if (rows === undefined || freshnessCutoff === undefined) return rows
    return rows.scheduled_at >= freshnessCutoff ? rows : undefined
  }

  /* 手动补跑标准 SQL（state-machine §7）——插件不提供 UI，按需手工执行。
     决策 25 后身份 = 任务 + 计划刻度，按刻度定位（不再依赖 id 字符串形态）：
  UPDATE task_instances
  SET status = 'pending', attempt = 0, lease_until = NULL,
      dispatched_at = NULL, finished_at = NULL, updated_at = <now>
  WHERE task_id = '<task_id>' AND scheduled_at = '<计划时刻 ISO>';
  */
}
