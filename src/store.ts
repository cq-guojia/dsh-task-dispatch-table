// SQLite 状态库：两表 DDL 照抄 data-model.md；状态机 7 态载体（state-machine.md）。
// Node >= 22.5 内置 node:sqlite（宿主 engines ^22.19.0 || >=24.0.0），零原生依赖。
import { DatabaseSync } from 'node:sqlite'
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
  updated_at: string
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

const DDL = `
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
`

const nowIso = (): string => new Date().toISOString()

export class TaskStore {
  private readonly db: DatabaseSync

  constructor(statePath: string) {
    mkdirSync(dirname(statePath), { recursive: true })
    this.db = new DatabaseSync(statePath)
    this.db.exec('PRAGMA journal_mode = WAL;')
    this.db.exec(DDL)
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

  /** 实例保障幂等补建（state-machine §7）：已存在则不动；建即为终态时留痕（data-model：skipped 证据落 task_events）。 */
  ensureInstance(taskId: string, logicalDate: string, scheduledAt: string, status: InstanceStatus): boolean {
    const result = this.db
      .prepare(`INSERT INTO task_instances
                (id, task_id, logical_date, scheduled_at, status, attempt, updated_at)
                VALUES (?, ?, ?, ?, ?, 0, ?)
                ON CONFLICT(id) DO NOTHING`)
      .run(`${taskId}:${logicalDate}`, taskId, logicalDate, scheduledAt, status, nowIso())
    const created = Number(result.changes) > 0
    if (created && status !== 'pending') {
      this.appendEvent(`${taskId}:${logicalDate}`, 'state_change', { to: status, reason: 'ensure-over-window' })
    }
    return created
  }

  get(id: string): TaskInstance | undefined {
    return this.db.prepare('SELECT * FROM task_instances WHERE id = ?').get(id) as unknown as TaskInstance | undefined
  }

  getBySession(sessionId: string): TaskInstance | undefined {
    return this.db
      .prepare('SELECT * FROM task_instances WHERE session_id = ? ORDER BY updated_at DESC')
      .get(sessionId) as unknown as TaskInstance | undefined
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

  /* 手动补跑标准 SQL（state-machine §7）——插件不提供 UI，按需手工执行：
  UPDATE task_instances
  SET status = 'pending', attempt = 0, lease_until = NULL,
      dispatched_at = NULL, finished_at = NULL, updated_at = <now>
  WHERE id = '<task_id>:<logical_date>';
  */
}
