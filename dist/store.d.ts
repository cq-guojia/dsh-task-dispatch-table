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
export declare class TaskStore {
    private readonly db;
    constructor(statePath: string);
    /**
     * 旧库迁移（决策 25）：补建 `(task_id, scheduled_at)` 唯一索引作为防重闸门。
     * 建索引前先去重（同一 task + 同一刻度只留 rowid 最小那条），否则历史脏数据会让
     * CREATE UNIQUE INDEX 直接失败、插件起不来。
     */
    private migrate;
    /**
     * 解析任务定义的**稳定 id**（决策 25）：
     * - 用户显式写了 `id` ⇒ 以用户写的为准（兼容既有定义，也允许人工指定以便 `depends_on` 引用）；
     * - 未写 ⇒ 按 `source_key` 在 `task_defs` 里查，查到就复用（跨重启稳定），查不到才生成 UUID 并登记。
     * @param sourceKey 定义来源定位（inline 下标 / 文件路径）——改 title、改周期都不会变。
     */
    resolveTaskId(sourceKey: string, title: string, explicitId?: string): string;
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
     * 实例保障幂等补建（决策 25 + state-machine §7）：
     * **身份 = 任务 + 计划刻度**——`id` 是不透明 UUID，去重走 `UNIQUE(task_id, scheduled_at)`，
     * 所以同一刻度重复 INSERT 一律 DO NOTHING ⇒ tick 幂等（迟到 / 重启 / 多跑几轮都不会多出第二条）。
     * 建即为终态（过窗）时留痕（data-model：skipped 证据落 task_events）。
     */
    ensureInstance(taskId: string, logicalDate: string, scheduledAt: string, status: InstanceStatus): boolean;
    /** 按「任务 + 刻度」查实例（手动排查 / 备用回执通道用，不依赖 id 形态）。 */
    findBySlot(taskId: string, scheduledAt: string): TaskInstance | undefined;
    get(id: string): TaskInstance | undefined;
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
