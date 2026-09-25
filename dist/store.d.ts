export declare const TERMINAL_STATUSES: readonly ["succeeded", "failed", "skipped"];
export type InstanceStatus = 'pending' | 'dispatched' | 'running' | 'succeeded' | 'failed' | 'skipped' | 'unknown';
export interface TaskInstance {
    id: string;
    task_id: string;
    logical_date: string;
    scheduled_at: string;
    status: InstanceStatus;
    attempt: number;
    session_id: string | null;
    lease_until: string | null;
    dispatched_at: string | null;
    finished_at: string | null;
    outputs: string | null;
    tokens: number | null;
    updated_at: string;
}
/** 调试快照事件行（detail 截断，临时调试面板用）。带 instance_id 供面板按实例过滤展开。 */
export interface SnapshotEvent {
    seq: number;
    instance_id: string;
    ts: string;
    kind: string;
    detail: string | null;
}
/** 单实例状态转移 + task_events 追加的参数包。 */
export interface TransitionInput {
    status: InstanceStatus;
    attempt?: number;
    session_id?: string | null;
    lease_until?: string | null;
    dispatched_at?: string | null;
    finished_at?: string | null;
    detail?: unknown;
}
/** 调试导出：一张表的原始行（面板「调试」页 / GET /db 的单元）。 */
export interface TableDump {
    name: string;
    /** 表内总行数（rows 可能只含最新一部分）。 */
    count: number;
    /** 列名，按建表顺序。 */
    columns: string[];
    /** 行原样（列 → TEXT/INTEGER/NULL 值）。 */
    rows: Record<string, unknown>[];
    /** true = 总行数超出 limit，rows 只含最新 limit 条。 */
    truncated: boolean;
}
export declare class TaskStore {
    private readonly db;
    /**
     * 迁移时因「同任务同刻度重复」被合并掉的行数。
     * > 0 说明历史数据里存在重复（正常不该有），宿主会打告警——**绝不静默删数据**。
     */
    dupRowsRemoved: number;
    constructor(statePath: string);
    /**
     * 旧库迁移（决策 25 + 决策 32）：
     * - 首次：去重（同一 task + 同一刻度只留 rowid 最小那条）后补建 `(task_id, scheduled_at)`
     *   唯一索引作为防重闸门；
     * - 已迁移过的库：仅补决策 32 冗余字段（outputs / tokens 列），不重复去重。
     */
    private migrate;
    /** 决策 32：兼容旧库（无 outputs / tokens 列）。 */
    private ensureInstanceColumns;
    close(): void;
    appendEvent(instanceId: string, kind: string, detail?: unknown): void;
    /** 实例某类事件的最新一条（回执对账 / 追问判定用）。 */
    latestEvent(instanceId: string, kind: string): {
        ts: string;
        detail: string | null;
    } | undefined;
    /** 实例某类事件计数（追问次数上限用）。 */
    countEvents(instanceId: string, kind: string): number;
    /**
     * 调试面板快照（临时调试通道）：全部实例 + 最近 N 条事件。
     * 事件取 seq 倒序再反转 = 升序输出（旧→新，日志阅读顺序）；detail 截断 200 字符防快照膨胀。
     */
    snapshot(limitEvents?: number): {
        instances: TaskInstance[];
        events: SnapshotEvent[];
    };
    /** 晚于某时刻的最新回执事件（决策 19：回执对账按次取新，防止上一轮 attempt 的旧回执冒充）。 */
    latestReceipt(instanceId: string, afterIso: string | undefined): {
        ts: string;
        detail: string | null;
    } | undefined;
    /** 启动扫描（state-machine §3 机制 #5）：已派发而未定态的实例置 unknown。 */
    startupScan(): number;
    /**
     * 幂等建一条实例（决策 31：懒建行，调用方先生成 id 并判定预条件通过后才调用）。
     * **身份 = 任务 + 计划刻度**——去重走 `UNIQUE(task_id, scheduled_at)`，
     * 同一刻度重复 INSERT 一律 DO NOTHING ⇒ tick 幂等。状态由调用方给定（现仅 'dispatched'）。
     */
    ensureInstance(id: string, taskId: string, logicalDate: string, scheduledAt: string, status: InstanceStatus): boolean;
    /** 删除一条实例（决策 31.6：窗口外残留 pending 直接删，视为未执行）。 */
    deleteInstance(id: string): void;
    /** 写入一条诊断日志（决策 31/32：未推进到执行那一步的诊断进 task_log，不污染 task_instances）。 */
    appendLog(entry: {
        taskId?: string | null;
        scheduledAt?: string | null;
        level: 'info' | 'warn' | 'error';
        kind: string;
        message: string;
    }): void;
    /** 按保留期清除 task_log（决策 32：独立表，可定时清）。返回删除条数。 */
    purgeLog(retentionDays: number): number;
    /** 完成瞬间写回产出与 token（决策 32：总表冗余，task_events 仍为真源）。 */
    recordCompletion(id: string, outputs: string | null, tokens: number | null): void;
    /** 按「任务 + 刻度」查实例（手动排查 / 备用回执通道用，不依赖 id 形态）。 */
    findBySlot(taskId: string, scheduledAt: string): TaskInstance | undefined;
    get(id: string): TaskInstance | undefined;
    /** 读 meta 键值（无行返回 undefined——「从未写过」与「写过空串」借此区分）。 */
    getMeta(key: string): string | undefined;
    /** 写 meta 键值（upsert）。任务表 tasksInline 的持久化主通道走这里。 */
    setMeta(key: string, value: string): void;
    /** 调试导出允许的表名（SQLite 表名无法参数化，白名单防注入）。 */
    static readonly DUMP_TABLES: readonly ["task_instances", "task_events", "task_log", "meta"];
    /**
     * 调试导出：整表原样读出（面板「调试」页用）。
     * @param name - 表名（必须命中白名单）。
     * @param limit - 最多返回行数；超出时保留「最新」的 limit 条（events 按 seq、instances 按 scheduled_at 倒序）。
     */
    dumpTable(name: (typeof TaskStore.DUMP_TABLES)[number], limit: number): TableDump;
    getBySession(sessionId: string): TaskInstance | undefined;
    /**
     * 计划重排（决策 20）：计划时刻在「从未执行」前跟随配置 live 更新——仅 status=pending
     * 且 attempt=0 可改，CAS 守卫防与派发竞态；执行一旦开始（attempt≥1）即冻结。
     */
    reschedule(id: string, scheduledAt: string): boolean;
    listByStatus(statuses: readonly InstanceStatus[]): TaskInstance[];
    /** 同任务非终态实例（排除某实例自身），用于同任务串行判定（state-machine §8）。 */
    listNonTerminalOfTask(taskId: string, excludeId?: string): TaskInstance[];
    /** CAS 领取（data-model 关键设计 3）：仅 pending 可领取，受影响行数判定成败。 */
    casClaim(id: string): boolean;
    /** 通用状态转移：无条件写（调用方按状态机自查前置态）并留 state_change 事件。 */
    transition(id: string, input: TransitionInput): void;
    /** running 心跳续租（state-machine §4）：收到该会话任何事件即续租。 */
    renewLease(id: string, leaseMs: number): void;
    /** 依赖判定 same_period（state-machine §9）：同 logical_date 的上游实例。 */
    getSamePeriod(upstreamTaskId: string, logicalDate: string): TaskInstance | undefined;
    /** 依赖判定 latest_success（state-machine §9）：最近一次 succeeded；freshnessCutoff 为 ISO 时刻下限。 */
    getLatestSuccess(upstreamTaskId: string, freshnessCutoff: string | undefined): TaskInstance | undefined;
}
