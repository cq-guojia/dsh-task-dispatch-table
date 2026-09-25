# 数据模型：任务定义与状态库

> **定型依据**：决策 6（定义存 JSON）/ 7（状态存 SQLite）/ 8（依赖下游声明）/ 9（两种依赖语义）/ 10（失败策略）/ 12（任务手册）/ 14（状态库路径）。
> **边界**：通知机制本期不设计——`failed` 的证据落在 `task_events`，通知渠道另立决策。
> ⚠️ **决策 31 修订**：调度**不再产生 `skipped` 行**（过期 / 被依赖卡 / 预条件失败一律不建 `task_instances` 记录），
> 这类「未推进到执行那一步」的诊断改记独立的 `task_log` 表（可定时清除）。`skipped` 状态仅作历史兼容保留。

## 一、任务定义（JSON 文件，人改、进 Git，不入库）

| 字段 | 类型 | 说明 | 依据 |
|---|---|---|---|
| `id` | string? | **机器身份，只认 UUID**。**保存闸门**（POST /tasks）：无 id ⇒ 系统生成随机 UUID 补上并固化写入（= 新增）；有 id 且为 UUID ⇒ **必须在现有已保存任务表中命中**才原样保留（= 修改——带 UUID 即修改，修改目标必须存在，UUID 身份只能由系统生成、不能凭空引入）；有 id 但非 UUID（数字 / kebab-case / 旧指纹），或 UUID 不在现有表中（含首次录入自带 UUID）⇒ **整批拒绝保存**（HTTP 422 带原因）。**运行时只认不修**：解析遇到无 id / 非 UUID 条目 warn 跳过、绝不生成兜底 id（tick 不再写回） | 决策 25 / 30 |
| `title` | string | 用户可读名称：**任意文本（中文亦可）、随时可改**，**不参与身份** ⇒ 改名不改 `id`，历史不断链。缺省回退 id | 决策 25 / 30 |
| `code` | string? | **任务编号（可选，人读）**：用户自编便于查询与管理，**只做记录、不参与任何唯一性判断**（空格 / 重名 / 格式差异都不影响身份——判断只走 `id` + 计划刻度）。存前 trim，空白视为未填。快照与面板任务表展示 | 决策 30 |
| `enabled` | bool | 停用任务不删定义 | — |
| `schedule.cron` | string? | 生成计划时刻；纯程序解析，零 token。**与 `once` 互斥**（周期任务用） | 架构约束 |
| `schedule.once` | string? | `YYYY-MM-DDTHH:mm`；按 `timezone` 墙上时间解释，仅该日派发一次，跑完自动停。**与 `cron` 互斥**（一次性任务用，决策 18） | 决策 18 |
| `schedule.timezone` | string? | 缺省用宿主时区；**logical date 的归属判定靠它** | 决策 9 |
| `schedule.window` | string | ISO 8601 时长（如 `PT4H`）；计划时刻 + 窗口 = 当日截止线，过窗 → `skipped` 并切次日 | 决策 10 |
| `target.workspace` | string | 派发到哪个**工作区**（按 registry 的 `title` 精确匹配、`id` 兜底；**不是工作目录**——cwd 由工作区实体的 `path` 派生）。匹配不到 ⇒ 实例判失败，不派发 | 决策 4 / 22 |
| `target.provider` | string? | 派发模型漏斗第①层的 provider；与 `target.model` **成对**，只填一个视为该层未配 | 决策 22 |
| `target.model` | string? | 派发模型漏斗第①层的 model。两层 `target.*` 都留空则依次漏到：插件配置 `defaultProvider/defaultModel` → 宿主 `agentDefaultModel`（= 用户配的 / 上次用的模型）→ `llm` 首个可用模型；四层全空 ⇒ 实例判失败。**派发时现算，不回写本字段** | 决策 22 |
| `target.manual` | string? | 任务手册 MD 路径（相对目标工作区），由调度器拼进派发消息 | 决策 12 |
| `target.prompt` | string | 短指令，调度器拼进派发消息 | 决策 12 |
| `contract.validStatuses` | string[]? | 回执 `status` 的合法值清单，默认 `["ok"]` | 决策 19 |
| `retry.maxAttempts` | int? | 默认 1；重试耗尽 → `failed`，下游跳过 | 决策 10 |
| `depends_on` | object[]? | `{ task, semantics }`，**由下游声明**；`semantics` = `same_period`（同 logical date）/ `latest_success`（上游最近一条必须 succeeded）。⚠️ `freshness` 字段已于**决策 33 删除** | 决策 8/9/33 |

**回执机制（决策 19 + 决策 24 改通道）**：agent 跑完调用插件注册的工具 `task_dispatch_table_receipt({ status, outputs?, note? })` 提交回执——该工具由插件在派发时经 `agentCtx.tools.register` 注册，**只对该任务会话可见**，`execute` 在**插件进程内**直写状态库 `task_events`（`kind='receipt'`，detail 形状 `{ status, outputs, note, session_id }`）。对账**只查库**：取派发时刻之后的最新 receipt，校验 `status ∈ contract.validStatuses` + `outputs` 逐一在目标工作区存在且 mtime 晚于本次派发（防旧产物冒充）。只记录不裁决，实例状态仍只由调度器写（决策 11）；重复提交无害（对账取最新）。⚠️ **为什么不再用命令行**：agent 的 bash 在 Landlock 沙箱 `workspace-write` 模式下**只能写工作区**，写不了宿主数据根下的 `state.db`（决策 24 真机证据）；`submit.js` 保留为手动 / 排查备用通道。

## 二、状态库（SQLite，路径见决策 14）

```sql
-- 状态库**两张执行表 + 一张元数据表**：任务定义（含 id）存在用户的 JSON 里（决策 6），库里不存定义，
-- 也不存任何「位置 → id」的对照表（决策 25 修订版：下标锚点会在「删第一条」时串号）。

-- 任务实例状态表：状态机 7 态的载体，一行 = **一次执行（一个计划刻度）**
CREATE TABLE task_instances (
  id            TEXT PRIMARY KEY,        -- ★ UUID 不透明主键（决策 25）。
                                         --   列名沿用 id（而非 run_id）：旧库无需重建表即可升级
  task_id       TEXT NOT NULL,           -- 任务定义 JSON 里的 id（用户写的，或系统生成并回写的）
  scheduled_at  TEXT NOT NULL,           -- ★ 计划时刻（cron 算出的**刻度**，ISO 8601 含时分秒 + 时区偏移）
                                         --   = 身份锚点 + 防重键。**不是实际执行时刻**
  logical_date  TEXT NOT NULL,           -- = scheduled_at 所在日历日；仅供 same_period 依赖判定与界面分组
  status        TEXT NOT NULL CHECK (status IN
                  ('pending','dispatched','running','succeeded','failed','skipped','unknown')),
  attempt       INTEGER NOT NULL DEFAULT 0,  -- 重试在行内递增，不换行（决策 10）
  session_id    TEXT,                    -- 派发会话 id（对账信源）
  lease_until   TEXT,                    -- running 租约到期时刻（机制 #2）
  dispatched_at TEXT,                    -- ★ 实际派发时刻（可能晚于 scheduled_at），**不进身份**
  finished_at   TEXT,
  outputs       TEXT,                    -- 决策 32：完成瞬间写回的产出（回执 outputs 的 JSON 文本，冗余）
  token_in      INTEGER,                 -- 决策 32（修订）：输入（prompt）token，宿主事件带 usage 才累计，否则 NULL
  token_out     INTEGER,                 -- 决策 32（修订）：输出（completion）token
  token_in_cache INTEGER,                -- 决策 32（修订）：命中上下文缓存的输入 token
  updated_at    TEXT NOT NULL
);
-- ★ 防重闸门（唯一索引而非表约束：旧库加索引即可升级，不必重建表）
CREATE UNIQUE INDEX idx_instances_slot ON task_instances(task_id, scheduled_at);
  -- 待确认（未拍板，见 PROGRESS 未决项 U5）：def_revision（跑的是哪版定义）/
  --   def_snapshot（当时的配置快照 JSON）/ run_type（scheduled | manual | retry）

-- 执行日志表：append-only，对账与排障的证据链（**真实实例**的生命周期证据）
CREATE TABLE task_events (
  seq         INTEGER PRIMARY KEY AUTOINCREMENT,
  instance_id TEXT NOT NULL,
  ts          TEXT NOT NULL,
  kind        TEXT NOT NULL,             -- state_change | dispatch | session_event | receipt | nudge | receipt_check | error
  detail      TEXT                       -- JSON 原文
);

CREATE INDEX idx_events_instance ON task_events(instance_id, seq);

-- 诊断日志表（决策 32）：只收「**未推进到执行那一步**」的诊断，与 task_instances / task_events 分离，
-- 可定时清除（logRetentionDays，默认 30 天）。任务没到推进那一步，就不写任务记录表（用户拍板）。
CREATE TABLE task_log (
  seq          INTEGER PRIMARY KEY AUTOINCREMENT,
  ts           TEXT NOT NULL,
  task_id      TEXT,                     -- 可能为空（如启动汇总）
  scheduled_at TEXT,                     -- 错过的刻度，可能为空
  level        TEXT NOT NULL,            -- info | warn | error
  kind         TEXT NOT NULL,            -- missed_slot | startup_missed | precondition | dep_blocked | stray_pending
  message      TEXT NOT NULL
);

CREATE INDEX idx_task_log_ts ON task_log(ts);

-- 元数据表：跨重启 / 重装必须存活的插件级键值。内嵌任务表 tasksInline 的**持久化主通道**
-- 在这里（entry config 会在插件重装时丢；state.db 在宿主数据根挂载卷上，不丢）。
-- 「无行 = 从未写过（回退 entry config 初始值）」与「value='' = 用户清空过」语义不同，勿合并。
CREATE TABLE meta (
  key   TEXT PRIMARY KEY,                -- 如 'tasksInline'
  value TEXT NOT NULL                    -- 原文（tasksInline 为 JSON 数组文本）
);
```

## 三、关键设计

1. **执行身份（决策 25）**：**不透明主键** `run_id`（UUID）+ **业务键** `(task_id, scheduled_at)` 唯一约束。锚点是 **cron 算出的刻度**（含时分秒、带时区偏移），**不是日期**：

   | 周期 | 刻度（`scheduled_at`） | 一天几条 |
   |---|---|---|
   | 每天 09:00 | `2026-09-24T09:00:00+08:00` | 1 |
   | 每 2 小时（`0 */2 * * *`） | `…T08:00` / `…T10:00` / `…T12:00` | 多条，天然不同 |
   | 每 15 分钟 | `…T09:00` / `…T09:15` / `…T09:30` | 多条 |
   | 每月 1 号 09:00 | `2026-09-01T09:00:00+08:00` | 1 |
   | `once` | 就是它那个时刻 | 1 |

   刻度**由 cron 决定**，不是「上一次 + 间隔」⇒ 迟到 / 重启 / 多跑几轮都不漂移（8:01 才跑，记的仍是 `08:00` 这个槽）。**防重 = 唯一约束**：到点那一刻才 INSERT 一条（懒建行，决策 31），撞 `UNIQUE(task_id, scheduled_at)` 即视为「该刻度已处理」⇒ 幂等。下游依赖判定仍是「一条 SELECT」：`same_period` 查同 `logical_date`，`latest_success` 查 `succeeded` 的最近 `logical_date`（`freshness` 比对 `scheduled_at`）。展示用可读串拼 `task_id:scheduled_at`，**但不作主键**。

   **不再有 `ensureInstances` 窗口回看**（决策 31）：原来是 `[now - max(窗口时长, 26h), now + 2×tick]` 逐个刻度补建（窗口内 `pending` / 过窗 `skipped`），会塞满任务记录表 ⇒ **已删除**。现在只取「当前该跑的那一下」，不回看、不补跑、不预建。
2. **重试不换行**：`attempt` 行内递增，状态流转 `dispatched → running → (failed → pending)* → 终态`（懒建行后 `pending` 只由重试回退产生）；下游只见最终态，半成品状态不外泄。
3. **懒建行 + 幂等**（决策 31）：到点且预条件通过时直接以 `dispatched` 落库（`INSERT OR IGNORE`），随后异步拉起会话；预条件不过则**不落库**。单进程插件的 tick 顺序执行，`casClaim`（`UPDATE ... WHERE status='pending'`）保留为重启恢复与未来多实例兜底。

## 四、已记录的取舍

| 取舍 | 结论 | 理由 |
|---|---|---|
| `logical_date` 存储格式 | ISO 字符串，不用 epoch | 可读、diff 友好、SQL 直接比较 |
| 执行主键形态 | **UUID（不透明）**，不用自增、也不用可读复合串当主键 | 自增在客户端 / 重装 / 多实例环境下不可靠；可读串作**唯一约束**即可（Airflow 同款：整数 `id` 主键 + `run_id` 可读串去重）。界面不必显示该串 |
| 锚点粒度 | **`scheduled_at` 刻度（含时分秒）**，不用日历日 | 日历日粒度会让每小时 / 每几分钟的 cron 一天只能出一条；刻度由 cron 决定 ⇒ 迟到不漂移、改周期类型不撞车 |
| 计划时刻 vs 实际时刻 | 分开存：`scheduled_at`（锚点）/ `dispatched_at`（实际派发）/ `finished_at` | 同 Airflow（`logical_date` vs `start_date`/`end_date`）与 k8s（`cronjob-scheduled-timestamp` annotation）。对账的「mtime 晚于派发」用 `dispatched_at` |
| 通知机制 | 本期不做 | 只留 `task_events` 证据；渠道选型另立决策，不塞进状态库 |
