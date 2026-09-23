// SQLite 状态库：两表 DDL 照抄 data-model.md；状态机 7 态载体（state-machine.md）。
// Node >= 22.5 内置 node:sqlite（宿主 engines ^22.19.0 || >=24.0.0），零原生依赖。
import { DatabaseSync } from 'node:sqlite';
import { mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
export const TERMINAL_STATUSES = ['succeeded', 'failed', 'skipped'];
const NON_TERMINAL_STATUSES = ['pending', 'dispatched', 'running', 'unknown'];
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
`;
const nowIso = () => new Date().toISOString();
export class TaskStore {
    db;
    constructor(statePath) {
        mkdirSync(dirname(statePath), { recursive: true });
        this.db = new DatabaseSync(statePath);
        this.db.exec('PRAGMA journal_mode = WAL;');
        this.db.exec(DDL);
    }
    close() {
        this.db.close();
    }
    appendEvent(instanceId, kind, detail) {
        this.db
            .prepare('INSERT INTO task_events (instance_id, ts, kind, detail) VALUES (?, ?, ?, ?)')
            .run(instanceId, nowIso(), kind, detail === undefined ? null : JSON.stringify(detail));
    }
    /** 实例某类事件的最新一条（回执对账 / 追问判定用）。 */
    latestEvent(instanceId, kind) {
        return this.db
            .prepare('SELECT ts, detail FROM task_events WHERE instance_id = ? AND kind = ? ORDER BY seq DESC LIMIT 1')
            .get(instanceId, kind);
    }
    /** 实例某类事件计数（追问次数上限用）。 */
    countEvents(instanceId, kind) {
        const row = this.db
            .prepare('SELECT COUNT(*) AS n FROM task_events WHERE instance_id = ? AND kind = ?')
            .get(instanceId, kind);
        return Number(row.n);
    }
    /**
     * 调试面板快照（临时调试通道）：全部实例 + 最近 N 条事件。
     * 事件取 seq 倒序再反转 = 升序输出（旧→新，日志阅读顺序）；detail 截断 200 字符防快照膨胀。
     */
    snapshot(limitEvents = 40) {
        const instances = this.db
            .prepare('SELECT * FROM task_instances ORDER BY updated_at DESC')
            .all();
        const rows = this.db
            .prepare('SELECT seq, ts, kind, detail FROM task_events ORDER BY seq DESC LIMIT ?')
            .all(limitEvents);
        const events = rows
            .reverse()
            .map(row => ({
            ...row,
            detail: row.detail !== null && row.detail.length > 200 ? `${row.detail.slice(0, 200)}…` : row.detail,
        }));
        return { instances, events };
    }
    /** 晚于某时刻的最新回执事件（决策 19：回执对账按次取新，防止上一轮 attempt 的旧回执冒充）。 */
    latestReceipt(instanceId, afterIso) {
        return this.db
            .prepare(`SELECT ts, detail FROM task_events
                WHERE instance_id = ? AND kind = 'receipt' AND (? IS NULL OR ts > ?)
                ORDER BY seq DESC LIMIT 1`)
            .get(instanceId, afterIso ?? null, afterIso ?? null);
    }
    /** 启动扫描（state-machine §3 机制 #5）：已派发而未定态的实例置 unknown。 */
    startupScan() {
        const result = this.db
            .prepare(`UPDATE task_instances SET status = 'unknown', updated_at = ?
                WHERE status IN ('dispatched','running')`)
            .run(nowIso());
        return Number(result.changes);
    }
    /** 实例保障幂等补建（state-machine §7）：已存在则不动；建即为终态时留痕（data-model：skipped 证据落 task_events）。 */
    ensureInstance(taskId, logicalDate, scheduledAt, status) {
        const result = this.db
            .prepare(`INSERT INTO task_instances
                (id, task_id, logical_date, scheduled_at, status, attempt, updated_at)
                VALUES (?, ?, ?, ?, ?, 0, ?)
                ON CONFLICT(id) DO NOTHING`)
            .run(`${taskId}:${logicalDate}`, taskId, logicalDate, scheduledAt, status, nowIso());
        const created = Number(result.changes) > 0;
        if (created && status !== 'pending') {
            this.appendEvent(`${taskId}:${logicalDate}`, 'state_change', { to: status, reason: 'ensure-over-window' });
        }
        return created;
    }
    get(id) {
        return this.db.prepare('SELECT * FROM task_instances WHERE id = ?').get(id);
    }
    getBySession(sessionId) {
        return this.db
            .prepare('SELECT * FROM task_instances WHERE session_id = ? ORDER BY updated_at DESC')
            .get(sessionId);
    }
    /**
     * 计划重排（决策 20）：计划时刻在「从未执行」前跟随配置 live 更新——仅 status=pending
     * 且 attempt=0 可改，CAS 守卫防与派发竞态；执行一旦开始（attempt≥1）即冻结。
     */
    reschedule(id, scheduledAt) {
        const result = this.db
            .prepare(`UPDATE task_instances SET scheduled_at = ?, updated_at = ?
                WHERE id = ? AND status = 'pending' AND attempt = 0`)
            .run(scheduledAt, nowIso(), id);
        return Number(result.changes) > 0;
    }
    listByStatus(statuses) {
        const placeholders = statuses.map(() => '?').join(',');
        return this.db
            .prepare(`SELECT * FROM task_instances WHERE status IN (${placeholders}) ORDER BY scheduled_at`)
            .all(...statuses);
    }
    /** 同任务非终态实例（排除某实例自身），用于同任务串行判定（state-machine §8）。 */
    listNonTerminalOfTask(taskId, excludeId) {
        return this.db
            .prepare(`SELECT * FROM task_instances
                WHERE task_id = ? AND status IN (${NON_TERMINAL_STATUSES.map(() => '?').join(',')})
                  AND id != COALESCE(?, '')
                ORDER BY scheduled_at`)
            .all(taskId, ...NON_TERMINAL_STATUSES, excludeId ?? null);
    }
    /** CAS 领取（data-model 关键设计 3）：仅 pending 可领取，受影响行数判定成败。 */
    casClaim(id) {
        const now = nowIso();
        const result = this.db
            .prepare(`UPDATE task_instances
                SET status = 'dispatched', dispatched_at = ?, updated_at = ?
                WHERE id = ? AND status = 'pending'`)
            .run(now, now, id);
        if (Number(result.changes) > 0)
            this.appendEvent(id, 'state_change', { to: 'dispatched', reason: 'cas-claim' });
        return Number(result.changes) > 0;
    }
    /** 通用状态转移：无条件写（调用方按状态机自查前置态）并留 state_change 事件。 */
    transition(id, input) {
        const current = this.get(id);
        if (current === undefined)
            throw new Error(`实例不存在: ${id}`);
        const now = nowIso();
        this.db
            .prepare(`UPDATE task_instances
                SET status = ?, attempt = ?, session_id = ?, lease_until = ?,
                    dispatched_at = ?, finished_at = ?, updated_at = ?
                WHERE id = ?`)
            .run(input.status, input.attempt ?? current.attempt, input.session_id === undefined ? current.session_id : input.session_id, input.lease_until === undefined ? current.lease_until : input.lease_until, input.dispatched_at === undefined ? current.dispatched_at : input.dispatched_at, input.finished_at === undefined ? current.finished_at : input.finished_at, now, id);
        this.appendEvent(id, 'state_change', { from: current.status, to: input.status, reason: input.detail });
    }
    /** running 心跳续租（state-machine §4）：收到该会话任何事件即续租。 */
    renewLease(id, leaseMs) {
        this.db
            .prepare(`UPDATE task_instances SET lease_until = ?, updated_at = ? WHERE id = ?`)
            .run(new Date(Date.now() + leaseMs).toISOString(), nowIso(), id);
    }
    /** 依赖判定 same_period（state-machine §9）：同 logical_date 的上游实例。 */
    getSamePeriod(upstreamTaskId, logicalDate) {
        return this.db
            .prepare('SELECT * FROM task_instances WHERE task_id = ? AND logical_date = ?')
            .get(upstreamTaskId, logicalDate);
    }
    /** 依赖判定 latest_success（state-machine §9）：最近一次 succeeded；freshnessCutoff 为 ISO 时刻下限。 */
    getLatestSuccess(upstreamTaskId, freshnessCutoff) {
        const rows = this.db
            .prepare(`SELECT * FROM task_instances
                WHERE task_id = ? AND status = 'succeeded'
                ORDER BY logical_date DESC LIMIT 1`)
            .get(upstreamTaskId);
        if (rows === undefined || freshnessCutoff === undefined)
            return rows;
        return rows.scheduled_at >= freshnessCutoff ? rows : undefined;
    }
}
