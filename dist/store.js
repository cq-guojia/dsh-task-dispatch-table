// SQLite 状态库：两表 DDL 照抄 data-model.md；状态机 7 态载体（state-machine.md）。
// Node >= 22.5 内置 node:sqlite（宿主 engines ^22.19.0 || >=24.0.0），零原生依赖。
import { DatabaseSync } from 'node:sqlite';
import { randomUUID } from 'node:crypto';
import { mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
export const TERMINAL_STATUSES = ['succeeded', 'failed', 'skipped'];
const NON_TERMINAL_STATUSES = ['pending', 'dispatched', 'running', 'unknown'];
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
`;
const nowIso = () => new Date().toISOString();
export class TaskStore {
    db;
    /**
     * 迁移时因「同任务同刻度重复」被合并掉的行数。
     * > 0 说明历史数据里存在重复（正常不该有），宿主会打告警——**绝不静默删数据**。
     */
    dupRowsRemoved = 0;
    constructor(statePath) {
        mkdirSync(dirname(statePath), { recursive: true });
        this.db = new DatabaseSync(statePath);
        this.db.exec('PRAGMA journal_mode = WAL;');
        this.db.exec(DDL);
        this.migrate();
    }
    /**
     * 旧库迁移（决策 25 + 决策 32）：
     * - 首次：去重（同一 task + 同一刻度只留 rowid 最小那条）后补建 `(task_id, scheduled_at)`
     *   唯一索引作为防重闸门；
     * - 已迁移过的库：仅补决策 32 冗余字段（outputs / tokens 列），不重复去重。
     */
    migrate() {
        const exists = this.db
            .prepare(`SELECT name FROM sqlite_master WHERE type = 'index' AND name = 'idx_instances_slot'`)
            .get();
        if (exists !== undefined) {
            this.ensureInstanceColumns();
            return;
        }
        // 先数一数真有重复没有：正常库应该是 0，非 0 说明历史数据脏，交给宿主告警。
        const dup = this.db
            .prepare(`SELECT COUNT(*) AS n FROM (
                  SELECT 1 FROM task_instances GROUP BY task_id, scheduled_at HAVING COUNT(*) > 1)`)
            .get();
        this.dupRowsRemoved = Number(dup.n);
        this.db.exec(`DELETE FROM task_instances WHERE rowid NOT IN
         (SELECT MIN(rowid) FROM task_instances GROUP BY task_id, scheduled_at)`);
        this.db.exec('CREATE UNIQUE INDEX idx_instances_slot ON task_instances(task_id, scheduled_at)');
        this.ensureInstanceColumns();
    }
    /** 决策 32（修订）：兼容旧库（无 outputs / token 三拆列）。 */
    ensureInstanceColumns() {
        const cols = new Set(this.db.prepare('PRAGMA table_info(task_instances)').all().map(c => c.name));
        if (!cols.has('outputs'))
            this.db.exec('ALTER TABLE task_instances ADD COLUMN outputs TEXT');
        // 旧版决策 32 曾用单个 tokens 列；拆成三列后卸下旧列（不支持 DROP COLUMN 的旧 SQLite 静默跳过）。
        if (cols.has('tokens')) {
            try {
                this.db.exec('ALTER TABLE task_instances DROP COLUMN tokens');
            }
            catch { /* 旧引擎不支持 DROP COLUMN，留作死列无害 */ }
        }
        if (!cols.has('token_in'))
            this.db.exec('ALTER TABLE task_instances ADD COLUMN token_in INTEGER');
        if (!cols.has('token_out'))
            this.db.exec('ALTER TABLE task_instances ADD COLUMN token_out INTEGER');
        if (!cols.has('token_in_cache'))
            this.db.exec('ALTER TABLE task_instances ADD COLUMN token_in_cache INTEGER');
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
     * 幂等建一条实例（决策 31：懒建行，调用方先生成 id 并判定预条件通过后才调用）。
     * **身份 = 任务 + 计划刻度**——去重走 `UNIQUE(task_id, scheduled_at)`，
     * 同一刻度重复 INSERT 一律 DO NOTHING ⇒ tick 幂等。状态由调用方给定（现仅 'dispatched'）。
     */
    ensureInstance(id, taskId, logicalDate, scheduledAt, status) {
        const result = this.db
            .prepare(`INSERT OR IGNORE INTO task_instances
                (id, task_id, logical_date, scheduled_at, status, attempt, updated_at)
                VALUES (?, ?, ?, ?, ?, 0, ?)`)
            .run(id, taskId, logicalDate, scheduledAt, status, nowIso());
        return Number(result.changes) > 0;
    }
    /** 删除一条实例（决策 31.6：窗口外残留 pending 直接删，视为未执行）。 */
    deleteInstance(id) {
        this.db.prepare('DELETE FROM task_instances WHERE id = ?').run(id);
    }
    /** 写入一条诊断日志（决策 31/32：未推进到执行那一步的诊断进 task_log，不污染 task_instances）。 */
    appendLog(entry) {
        this.db
            .prepare('INSERT INTO task_log (ts, task_id, scheduled_at, level, kind, message) VALUES (?, ?, ?, ?, ?, ?)')
            .run(nowIso(), entry.taskId ?? null, entry.scheduledAt ?? null, entry.level, entry.kind, entry.message);
    }
    /** 按保留期清除 task_log（决策 32：独立表，可定时清）。返回删除条数。 */
    purgeLog(retentionDays) {
        const cutoff = new Date(Date.now() - retentionDays * 86_400_000).toISOString();
        const result = this.db.prepare('DELETE FROM task_log WHERE ts < ?').run(cutoff);
        return Number(result.changes);
    }
    /** 完成瞬间写回产出与 token 三拆列（决策 32 修订：总表冗余，task_events 仍为真源）。 */
    recordCompletion(id, outputs, tokenIn, tokenOut, tokenInCache) {
        this.db
            .prepare('UPDATE task_instances SET outputs = ?, token_in = ?, token_out = ?, token_in_cache = ?, updated_at = ? WHERE id = ?')
            .run(outputs, tokenIn, tokenOut, tokenInCache, nowIso(), id);
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
    /** 读 meta 键值（无行返回 undefined——「从未写过」与「写过空串」借此区分）。 */
    getMeta(key) {
        const row = this.db.prepare('SELECT value FROM meta WHERE key = ?').get(key);
        return row?.value;
    }
    /** 写 meta 键值（upsert）。任务表 tasksInline 的持久化主通道走这里。 */
    setMeta(key, value) {
        this.db
            .prepare('INSERT INTO meta (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value')
            .run(key, value);
    }
    /** 调试导出允许的表名（SQLite 表名无法参数化，白名单防注入）。 */
    static DUMP_TABLES = ['task_instances', 'task_events', 'task_log', 'meta'];
    /**
     * 调试导出：整表原样读出（面板「调试」页用）。
     * @param name - 表名（必须命中白名单）。
     * @param limit - 最多返回行数；超出时保留「最新」的 limit 条（events 按 seq、instances 按 scheduled_at 倒序）。
     */
    dumpTable(name, limit) {
        if (!TaskStore.DUMP_TABLES.includes(name)) {
            throw new Error(`dumpTable: unknown table ${name}`);
        }
        const count = this.db.prepare(`SELECT COUNT(*) AS n FROM ${name}`).get().n;
        const order = name === 'task_events' ? 'seq DESC'
            : name === 'task_instances' ? 'scheduled_at DESC, id DESC'
                : name === 'task_log' ? 'ts DESC, seq DESC'
                    : 'key'; // meta：按 key 升序
        const rows = this.db.prepare(`SELECT * FROM ${name} ORDER BY ${order} LIMIT ?`).all(limit);
        const columns = this.db.prepare(`PRAGMA table_info(${name})`).all().map(col => col.name);
        return { name, count, columns, rows, truncated: count > rows.length };
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
    /** 依赖判定 same_period（state-machine §9）：同 logical_date 的上游实例；一天多刻度取最新一条（决策 33）。 */
    getSamePeriod(upstreamTaskId, logicalDate) {
        return this.db
            .prepare('SELECT * FROM task_instances WHERE task_id = ? AND logical_date = ? ORDER BY scheduled_at DESC LIMIT 1')
            .get(upstreamTaskId, logicalDate);
    }
    /**
     * 某任务的**最近一条**实例（不分状态，按 `scheduled_at` 倒序）——决策 33 判定用：
     * 上游最近一条必须**正好是 `succeeded`** 才放行；在跑 / 失败 / 无记录 ⇒ 阻塞。
     * ⚠️ 排序必须按 `scheduled_at`：原按 `logical_date` 只到「日」，同日多次取哪条不确定。
     */
    getLatestInstance(taskId) {
        return this.db
            .prepare('SELECT * FROM task_instances WHERE task_id = ? ORDER BY scheduled_at DESC LIMIT 1')
            .get(taskId);
    }
}
