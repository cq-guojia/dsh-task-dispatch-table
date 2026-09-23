// SQLite 状态库：两表 DDL 照抄 data-model.md；状态机 7 态载体（state-machine.md）。
// Node >= 22.5 内置 node:sqlite（宿主 engines ^22.19.0 || >=24.0.0），零原生依赖。
import { DatabaseSync } from 'node:sqlite';
import { randomUUID } from 'node:crypto';
import { mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
export const TERMINAL_STATUSES = ['succeeded', 'failed', 'skipped'];
const NON_TERMINAL_STATUSES = ['pending', 'dispatched', 'running', 'unknown'];
const DDL = `
-- 任务定义身份登记表（决策 25）：用户不写 id ⇒ 系统生成一次并记住，跨重启稳定。
-- source_key = 定义来源定位（inline 下标 / 目录文件路径），保证「同一条配置」始终同一 id。
CREATE TABLE IF NOT EXISTS task_defs (
  id         TEXT PRIMARY KEY,
  source_key TEXT NOT NULL UNIQUE,
  title      TEXT,
  updated_at TEXT NOT NULL
);

-- 执行记录表：一行 = **一次执行（一个计划刻度）**。
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
        this.migrate();
    }
    /**
     * 旧库迁移（决策 25）：补建 `(task_id, scheduled_at)` 唯一索引作为防重闸门。
     * 建索引前先去重（同一 task + 同一刻度只留 rowid 最小那条），否则历史脏数据会让
     * CREATE UNIQUE INDEX 直接失败、插件起不来。
     */
    migrate() {
        const exists = this.db
            .prepare(`SELECT name FROM sqlite_master WHERE type = 'index' AND name = 'idx_instances_slot'`)
            .get();
        if (exists !== undefined)
            return;
        this.db.exec(`DELETE FROM task_instances WHERE rowid NOT IN
         (SELECT MIN(rowid) FROM task_instances GROUP BY task_id, scheduled_at)`);
        this.db.exec('CREATE UNIQUE INDEX idx_instances_slot ON task_instances(task_id, scheduled_at)');
    }
    /**
     * 解析任务定义的**稳定 id**（决策 25）：
     * - 用户显式写了 `id` ⇒ 以用户写的为准（兼容既有定义，也允许人工指定以便 `depends_on` 引用）；
     * - 未写 ⇒ 按 `source_key` 在 `task_defs` 里查，查到就复用（跨重启稳定），查不到才生成 UUID 并登记。
     * @param sourceKey 定义来源定位（inline 下标 / 文件路径）——改 title、改周期都不会变。
     */
    resolveTaskId(sourceKey, title, explicitId) {
        if (explicitId !== undefined && explicitId.trim() !== '') {
            const id = explicitId.trim();
            try {
                this.db
                    .prepare(`INSERT INTO task_defs (id, source_key, title, updated_at) VALUES (?, ?, ?, ?)
                    ON CONFLICT(id) DO UPDATE SET
                      source_key = excluded.source_key, title = excluded.title, updated_at = excluded.updated_at`)
                    .run(id, sourceKey, title, nowIso());
            }
            catch {
                // source_key 已被另一个 id 占用（定义被替换）：保留既有归属，不抢。
            }
            return id;
        }
        const existing = this.db
            .prepare('SELECT id FROM task_defs WHERE source_key = ?')
            .get(sourceKey);
        if (existing !== undefined) {
            this.db.prepare('UPDATE task_defs SET title = ?, updated_at = ? WHERE id = ?')
                .run(title, nowIso(), existing.id);
            return existing.id;
        }
        const id = `t-${randomUUID()}`;
        this.db.prepare('INSERT INTO task_defs (id, source_key, title, updated_at) VALUES (?, ?, ?, ?)')
            .run(id, sourceKey, title, nowIso());
        return id;
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
            .prepare('SELECT seq, instance_id, ts, kind, detail FROM task_events ORDER BY seq DESC LIMIT ?')
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
    /**
     * 实例保障幂等补建（决策 25 + state-machine §7）：
     * **身份 = 任务 + 计划刻度**——`id` 是不透明 UUID，去重走 `UNIQUE(task_id, scheduled_at)`，
     * 所以同一刻度重复 INSERT 一律 DO NOTHING ⇒ tick 幂等（迟到 / 重启 / 多跑几轮都不会多出第二条）。
     * 建即为终态（过窗）时留痕（data-model：skipped 证据落 task_events）。
     */
    ensureInstance(taskId, logicalDate, scheduledAt, status) {
        const id = randomUUID();
        const result = this.db
            .prepare(`INSERT INTO task_instances
                (id, task_id, logical_date, scheduled_at, status, attempt, updated_at)
                VALUES (?, ?, ?, ?, ?, 0, ?)
                ON CONFLICT(task_id, scheduled_at) DO NOTHING`)
            .run(id, taskId, logicalDate, scheduledAt, status, nowIso());
        const created = Number(result.changes) > 0;
        if (created && status !== 'pending') {
            this.appendEvent(id, 'state_change', { to: status, reason: 'ensure-over-window' });
        }
        return created;
    }
    /** 按「任务 + 刻度」查实例（手动排查 / 备用回执通道用，不依赖 id 形态）。 */
    findBySlot(taskId, scheduledAt) {
        return this.db
            .prepare('SELECT * FROM task_instances WHERE task_id = ? AND scheduled_at = ?')
            .get(taskId, scheduledAt);
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
        // 目标刻度已被同任务的另一条实例占用（决策 25：一天可能多个刻度）⇒ 不再重排，返回 false。
        // 没有这道判断，UPDATE 会直接撞 UNIQUE(task_id, scheduled_at) 把 tick 打挂。
        const taken = this.db
            .prepare(`SELECT 1 AS x FROM task_instances
                WHERE scheduled_at = ? AND id != ?
                  AND task_id = (SELECT task_id FROM task_instances WHERE id = ?)`)
            .get(scheduledAt, id, id);
        if (taken !== undefined)
            return false;
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
