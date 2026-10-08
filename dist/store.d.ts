import type { ResolvedDependency } from './deps.js';
/** 单表查询支持的过滤运算符（白名单防注入）。 */
export type TableFilterOp = '=' | '!=' | '<' | '>' | '<=' | '>=' | 'LIKE';
export declare const TABLE_FILTER_OPS: readonly TableFilterOp[];
/** 单表查询的过滤条件（列名 / 运算符 / 值，全部经白名单 + 占位绑定）。 */
export interface TableFilter {
    column: string;
    op: TableFilterOp;
    value: string;
}
/** 单表查询结果（设置页 Block 3 / Block 2 共用）。 */
export interface TableQueryResult {
    name: string;
    count: number;
    columns: string[];
    rows: Record<string, unknown>[];
    truncated: boolean;
}
/**
 * Agent 权限档位（决策 50）：`default` = 会话默认（沿用宿主新建会话的权限设置，不加约束）。
 * ⚠️ 与 src/client/task-editor.tsx 的同名类型**两处各写一份**（client bundle 不引 host 模块），
 * 改枚举务必两边同步。
 */
export type PermissionMode = 'default' | 'readOnly' | 'workspace' | 'full';
export declare const PERMISSION_MODES: readonly PermissionMode[];
export declare const TERMINAL_STATUSES: readonly ["succeeded", "failed", "skipped"];
export type InstanceStatus = 'pending' | 'dispatched' | 'running' | 'succeeded' | 'failed' | 'skipped' | 'unknown';
/**
 * 执行记录的**触发来源**（2026-10-03 用户拍板新增，落地 U5 预留字段）：
 * - `scheduled` = 按排期自动调度（Loop A 建行，缺省值）；
 * - `manual` = 用户在卡片上点「立即执行」手动触发一次。
 * 只落库记录，当前**没有任何读路径 / UI 展示消费它**（用户：读取的地方不用读、前端展示先不改）。
 */
export type InstanceRunType = 'scheduled' | 'manual';
export interface TaskInstance {
    id: string;
    task_id: string;
    logical_date: string;
    scheduled_at: string;
    status: InstanceStatus;
    attempt: number;
    /** 触发来源（2026-10-03）：'scheduled' 自动调度 / 'manual' 手动立即执行；旧行为 null。 */
    run_type: InstanceRunType | null;
    session_id: string | null;
    lease_until: string | null;
    dispatched_at: string | null;
    finished_at: string | null;
    outputs: string | null;
    token_in: number | null;
    token_out: number | null;
    token_in_cache: number | null;
    /** 派发快照（决策 41）：落库时固化的执行所需字段 JSON；旧行 / 异常为 null。 */
    snapshot: string | null;
    updated_at: string;
    /** 备注（非表列）：失败 / 跳过原因，由 task_events 最新原因事件推导（listInstancesByQuery 填充）。 */
    note?: string | null;
}
/**
 * 一条已解析的上游依赖（决策 43）：Loop A 判定通过时固化，Loop B 只读不重判。
 * 真源已上提到 `deps.ts`（零运行时依赖，客户端「接收」区共用同一份解析），此处只做转出。
 */
export type { ResolvedDependency } from './deps.js';
/**
 * 派发快照（决策 41）：Loop A 落库时固化，Loop B（发动 / 重试 / 追问 / 回执裁决）**只读快照**，
 * 与任务设置彻底解耦——中途改任务定义对已落库实例零影响。
 */
export interface InstanceSnapshot {
    /** /goal 多轮续跑（决策 48）：undefined 视为 true（用户拍板「默认都是多轮会话」）。 */
    goal?: boolean;
    /** 多 Agent 协作（决策 49）：undefined 视为 false；派发时探测宿主 ctx.agentTeams，缺则降级单轮。 */
    agentTeam?: boolean;
    /** Agent 权限档位（决策 50）：undefined 视为 'default'（会话默认，不额外约束）。 */
    permission?: PermissionMode;
    /** 会话显示名（决策 42）：title 回退 code，再回退短 id。 */
    title: string;
    prompt: string;
    manual: string | null;
    /** 解析后的工作区实体 path（cwd / attachSession / 回执 outputs 校验都用它）。 */
    workspacePath: string;
    /** 模型漏斗第①层提示（任务 target.provider/model；②③④层在发动时按插件配置 / 宿主现算）。 */
    provider: string;
    model: string;
    validStatuses: string[];
    maxAttempts: number;
    /** ISO 时长串（超窗判定用，决策 41：快照管「已开工的」窗口边界）。 */
    window: string;
    /** 依赖快照（决策 43）：判定通过那一刻命中的上游实例与产出；决策 41 旧行无此字段。 */
    resolvedDeps?: ResolvedDependency[];
    /**
     * 附加文件清单（2026-09-30）：Loop B 发动前要校验「附件还在不在」⇒ 必须随快照冻结，
     * 否则 Loop B 只能回头读任务定义，违反决策 41「只读快照」。旧行无此字段 = 无附件。
     */
    attachments?: SnapshotAttachment[];
}
/** 快照里的附件引用（只记引用，不存内容）。 */
export interface SnapshotAttachment {
    name: string;
    kind: 'link' | 'upload';
    ref: string;
    /** link 型：来源工作区 title（派发注入 / 校验时按它把 ref 绝对化）。 */
    workspace?: string;
}
/** 解析实例行的快照 JSON；空 / 坏 JSON / 形状不对返回 undefined（调用方走兜底）。 */
export declare function parseInstanceSnapshot(raw: string | null): InstanceSnapshot | undefined;
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
export interface InstanceQuery {
    taskId?: string;
    /**
     * 按会话 id 精确取（2026-10-03）：会话弹窗**只拿得到会话 id**（不再靠调用方传快照 / 产出）⇒
     * 所有入口渲染必然一致。一个会话最多对应一条实例行，故配合 `limit: 1` 用。
     */
    sessionId?: string;
    /** 已解析的工作区任务集合（workspace 过滤由调用方解析，store 不持有任务定义）。 */
    taskIds?: readonly string[];
    statuses?: readonly InstanceStatus[];
    /** scheduled_at 区间（含端点，ISO 字符串）。 */
    fromTs?: string;
    toTs?: string;
    /** 编码末行 `(scheduled_at, id)`。 */
    cursor?: string;
    limit?: number;
}
export interface InstancePage {
    rows: TaskInstance[];
    /** 还有下一页时为末行游标，否则 null。 */
    nextCursor: string | null;
}
/**
 * 轻量执行记录行（「任务日程」日历页按月取数用，2026-10-05）= 实例行**剔除 `snapshot` 列**。
 *
 * 为什么剔除：snapshot 是派发快照（提示词 / 附件 / 依赖的 JSON，单行 1.5–4 KB），
 * 日历要一次取满整月（几百到上千行），带着它就是数 MB 的白给开销；日历只要状态 / 时刻 / 产出 / 原因。
 */
export type LiteTaskInstance = Omit<TaskInstance, 'snapshot'>;
export interface LiteInstancePage {
    rows: LiteTaskInstance[];
    /** 触及上限被截断（调用方必须提示用户收窄过滤，**不静默丢**）。 */
    truncated: boolean;
}
export interface LogQuery {
    taskId?: string;
    taskIds?: readonly string[];
    levels?: readonly string[];
    /** **message 与 kind 都做**子串匹配（LIKE %kw%）；见 `listLogs` 处的说明。 */
    keyword?: string;
    fromTs?: string;
    toTs?: string;
    /** 编码末行 `(ts, seq)`。 */
    cursor?: string;
    limit?: number;
}
export interface LogRow {
    seq: number;
    ts: string;
    task_id: string | null;
    scheduled_at: string | null;
    level: string;
    kind: string;
    message: string;
}
export interface LogPage {
    rows: LogRow[];
    nextCursor: string | null;
}
/** 某实例的事件时间线（执行记录下钻用），按 seq 升序（旧→新）。 */
export interface InstanceEventRow {
    seq: number;
    ts: string;
    kind: string;
    detail: string | null;
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
export type PluginLogKind = 'startup' | 'shutdown' | 'degraded' | 'block' | 'slow_request' | 'route_error' | 'stream_open' | 'stream_close' | 'stream_limit' | 'stream_write_failed' | 'snapshot' | 'config' | 'tick_error' | 'dispatch' | 'error';
export declare class TaskStore {
    private readonly db;
    /** 事务嵌套深度（`transaction` 用）：> 0 = 已在事务里 ⇒ 内层并入外层，不再 BEGIN。 */
    private txDepth;
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
    /** 决策 32（修订）：兼容旧库（无 outputs / token 三拆列）。 */
    private ensureInstanceColumns;
    close(): void;
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
    transaction<T>(fn: () => T): T;
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
    /**
     * 主界面运行态初始化（2026-09-30）：**一条聚合 SQL** 取每任务最近一条**终态**实例。
     * 只认终态（succeeded/failed/skipped/unknown）——「上次执行」= 最近一次**出了结果**的执行，
     * 刚落库还在跑的不算（用户 2026-09-30：运行中不得覆盖上次执行）。
     * SQLite 文档化行为：查询含 min/max 聚合时，其余裸列取**该聚合所在行**的值。
     * 走 `idx_instances_slot(task_id, scheduled_at)`，绝不做「每任务一次查询」。
     */
    lastRunByTask(): Map<string, {
        status: InstanceStatus;
        scheduledAt: string;
        finishedAt: string | null;
    }>;
    /** 在飞行（dispatched / running）的实例 ⇒ 主界面「运行中」。同样一条聚合 SQL。 */
    inFlightByTask(): Map<string, string>;
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
     * `snapshot`（决策 41）：派发快照，Loop A 落库时一并固化；缺省（旧测试 / 手动 SQL）为 NULL。
     */
    ensureInstance(id: string, taskId: string, logicalDate: string, scheduledAt: string, status: InstanceStatus, snapshot?: InstanceSnapshot, 
    /** 触发来源（2026-10-03）：缺省 'scheduled'（自动调度不传）；手动「立即执行」传 'manual'。 */
    runType?: InstanceRunType): boolean;
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
    ensureSkipped(id: string, taskId: string, logicalDate: string, scheduledAt: string): boolean;
    /** 旧实例补快照（决策 41 legacy 回退：首次被 Loop B 触到时按任务定义当场合成并固化）。 */
    setSnapshot(id: string, snapshot: InstanceSnapshot): void;
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
    /**
     * **插件整体日志**（2026-10-07）：进程级的运行 / 异常 / 性能观测进 `plugin_log`，
     * **不进 `task_log`**（那张表的契约是「未推进到执行那一步的任务诊断」，见建表注释与
     * design/data-model.md §二）。用途：事后回答「插件这个进程当时到底怎么了」。
     *
     * ⚠️ 下游**不要直接调这个方法**——请用下面三个语义化的 `logInfo` / `logWarn` / `logError`，
     * 它们把 `level` 钉在方法名里，调用点只剩 `kind` 与文案，不会各处重复样板、也不会写错 level。
     */
    appendPluginLog(entry: {
        level: 'info' | 'warn' | 'error';
        kind: PluginLogKind;
        message: string;
    }): void;
    /**
     * ⚠️ **记日志绝不能影响主流程**（2026-10-07 审计 🔴）：这三个方法是**唯一推荐给下游**的入口，
     * 必须自带异常隔离。否则：
     *  - `startup` 写入抛错 ⇒ 插件半初始化（定时器已种、dispose 未注册）；
     *  - `shutdown` 写入抛错 ⇒ **后面的清理动作（退订 / 停定时器 / 关连接 / close 库）全都不执行**。
     * 一条日志没记上，远比整个插件生命周期被卡住划算。
     */
    logInfo(kind: PluginLogKind, message: string): void;
    /** 记一条 warn 级插件日志（降级 / 观测告警：功能还在，但不如预期）。 */
    logWarn(kind: PluginLogKind, message: string): void;
    /** 记一条 error 级插件日志（真的出错了）。 */
    logError(kind: PluginLogKind, message: string): void;
    /** 落库并吞掉一切异常（见 `logInfo` 的注释）。 */
    private safelyAppend;
    /** 按保留期清除 `plugin_log`（与 `task_log` 同策略，默认 30 天）。返回删除条数。 */
    purgePluginLog(retentionDays: number): number;
    /** 按保留期清除 task_log（决策 32：独立表，可定时清）。返回删除条数。 */
    purgeLog(retentionDays: number): number;
    /**
     * 操作审计留痕（2026-09-30）：新增 / 修改 / 删除任务、版本留档 / 找回、附件增删都记一笔。
     * 与 `task_log`（诊断）分开：审计**默认不清**，要能回答「这任务什么时候被改成什么样」。
     */
    appendAudit(entry: {
        taskId?: string | null;
        action: string;
        detail?: unknown;
    }): void;
    /** 审计流水（某任务的最近 N 条，新的在前）。 */
    listAudit(taskId: string, limit?: number): {
        ts: string;
        action: string;
        detail: string | null;
    }[];
    /**
     * 按保留期清除执行记录（**默认不清**：`days <= 0` 直接返回 0）。
     * 清的时候**保护每个任务最近一条终态记录**（succeeded / failed）：否则月 / 季 / 年任务的历史
     * 被清干净后，下游 `latest_success` 永远查不到 ⇒ 静默阻塞（评审 P1）。
     * 删实例行时连带删它的事件，不留孤儿。
     */
    purgeHistory(days: number): {
        instances: number;
        events: number;
    };
    /** 完成瞬间写回产出与 token 三拆列（决策 32 修订：总表冗余，task_events 仍为真源）。 */
    recordCompletion(id: string, outputs: string | null, tokenIn: number | null, tokenOut: number | null, tokenInCache: number | null): void;
    /** 按「任务 + 刻度」查实例（手动排查 / 备用回执通道用，不依赖 id 形态）。 */
    findBySlot(taskId: string, scheduledAt: string): TaskInstance | undefined;
    get(id: string): TaskInstance | undefined;
    /** 读 meta 键值（无行返回 undefined——「从未写过」与「写过空串」借此区分）。 */
    getMeta(key: string): string | undefined;
    /** 写 meta 键值（upsert）。任务表 tasksInline 的持久化主通道走这里。 */
    setMeta(key: string, value: string): void;
    /** 调试 / 设置页查询允许的表名（SQLite 表名无法参数化，白名单防注入）。 */
    static readonly DUMP_TABLES: readonly ["task_instances", "task_events", "task_log", "task_audit", "plugin_log", "meta"];
    /** 各表的「最新在前」默认排序列（设置页 Block 3 从简：每表按各自最新字段 DESC，不做排序选择器）。 */
    private static defaultOrder;
    /** 表列缓存（白名单校验过滤列名，避免每请求打 PRAGMA）。 */
    private columnCache;
    /** 取表列（建表顺序），带缓存。 */
    private columnsOf;
    /**
     * 单表通用查询（设置页 Block 3 / Block 2 共用）：按白名单表 + 占位绑定过滤 + 默认最新字段 DESC + LIMIT。
     * 不做服务端分页（用户 2026-10-08：top-N 自过滤、客户端自行筛选）。表名 / 列名 / 运算符全白名单，无注入面。
     * @param name 表名（必须命中 `DUMP_TABLES`）。
     * @param filters 过滤条件（列名须为该表真实列，运算符须为 `TABLE_FILTER_OPS`）。
     * @param limit 最多返回行数（钳制 1..500）。
     */
    queryTable(name: (typeof TaskStore.DUMP_TABLES)[number], filters: TableFilter[], limit: number): TableQueryResult;
    /**
     * 调试导出：整表原样读出（旧调试页用，保留兼容）。
     * @param name - 表名（必须命中白名单）。
     * @param limit - 最多返回行数；超出时保留「最新」的 limit 条。
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
    /** 依赖判定 same_period（state-machine §9）：同 logical_date 的上游实例；一天多刻度取最新一条（决策 33）。 */
    getSamePeriod(upstreamTaskId: string, logicalDate: string): TaskInstance | undefined;
    /**
     * 某任务的**最近一条**实例（不分状态，按 `scheduled_at` 倒序）——决策 33 判定用：
     * 上游最近一条必须**正好是 `succeeded`** 才放行；在跑 / 失败 / 无记录 ⇒ 阻塞。
     * ⚠️ 排序必须按 `scheduled_at`：原按 `logical_date` 只到「日」，同日多次取哪条不确定。
     */
    getLatestInstance(taskId: string): TaskInstance | undefined;
    /**
     * 按任务 / 工作区 + 状态 / 时间过滤的执行记录（任务卡片「执行记录」面板 + 未来总查询页共用）。
     * 排序 `scheduled_at DESC, id DESC`；`cursor` 编码末行 `(scheduled_at, id)`，`LIMIT limit+1` 判定是否还有下一页
     * （limit+1 弹出一行 ⇒ 有剩余才给 cursor，恰好取尽时不会多翻一页）。全部条件走占位绑定，无注入面。
     */
    listInstancesByQuery(q: InstanceQuery): InstancePage;
    /**
     * 轻量版执行记录（「任务日程」日历页按月取数用，2026-10-05）。
     *
     * 与 `listInstancesByQuery` **同一套过滤条件**（都走 `instanceWhere`），区别只有两点：
     *   ① 列清单剔除 `snapshot`（见 `LiteTaskInstance`）—— 日历一次取满整月，不带几 KB 的大列；
     *   ② **不分页**，上限 3000，触及即 `truncated: true`（由页面提示收窄过滤，**不静默丢**）。
     * ⚠️ 既有 `listInstancesByQuery` 的 500 上限与游标语义**一个字都没改**（记录页游标分页依赖它）。
     */
    listInstancesLite(q: InstanceQuery): LiteInstancePage;
    /**
     * 执行记录过滤条件的**唯一构造**（全量查询与轻量查询共用 ⇒ SQL 条件不写第二遍）。
     * 全部条件走占位绑定，无注入面。
     */
    private instanceWhere;
    /** 轻量查询的**显式列清单**：与 `SELECT *` 的唯一差别是剔除 `snapshot`（见 `LiteTaskInstance`）。 */
    private static readonly LITE_INSTANCE_COLUMNS;
    /** 轻量查询上限：比全量查询的 500 宽（轻量行约 200 B），够日历一次取满一个月的正常量级。 */
    private static readonly LITE_INSTANCE_LIMIT;
    /** 「原因类」事件 kind 白名单（写原因的只有这几类；receipt.note / *.reason）。 */
    private static readonly NOTE_EVENT_KINDS;
    /** detail JSON → 人话原因：receipt 取 note，其余取 reason；取不到回退原文。 */
    private static noteOfEvent;
    /**
     * 给分页行就地填 note（只查 failed / skipped 行，一次 IN 查询取每实例最新原因事件）。
     * 入参放宽成最小结构 ⇒ 全量行与轻量行（`LiteTaskInstance`，无 snapshot）都能走这一份实现。
     */
    private attachNotes;
    /**
     * 按任务 / 工作区 + 级别 / 关键字 / 时间过滤的诊断日志（任务卡片「日志」面板 + 未来总查询页共用）。
     * 排序 `ts DESC, seq DESC`；`cursor` 编码末行 `(ts, seq)`。`keyword` 走 `LIKE %kw%`（参数化，不拼 SQL）。
     */
    listLogsByQuery(q: LogQuery): LogPage;
    /** 某实例的事件时间线（执行记录下钻用）：seq 升序 = 旧→新，日志阅读顺序。 */
    listEventsByInstance(instanceId: string): InstanceEventRow[];
}
