# 数据模型：任务定义与状态库

> **定型依据**：决策 6（定义存 JSON）/ 7（状态存 SQLite）/ 8（依赖下游声明）/ 9（两种依赖语义）/ 10（失败策略）/ 12（任务手册）/ 14（状态库路径）。
> **边界**：通知机制本期不设计——`failed` / `skipped` 的证据先落在 `task_events`，通知渠道另立决策。

## 一、任务定义（JSON 文件，人改、进 Git，不入库）

| 字段 | 类型 | 说明 | 依据 |
|---|---|---|---|
| `id` | string | 任务唯一标识，kebab-case，实例派生自它 | — |
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
| `backfill.days` | int? | 默认 0；> 0 时插件启动补建近 N 天缺失实例（`pending`），照常走依赖与窗口判定 | 状态机 §7 补跑入口 |
| `depends_on` | object[]? | `{ task, semantics, freshness? }`，**由下游声明**；`freshness`（ISO 8601 时长）仅 `latest_success` 使用 | 决策 8/9 |

**回执机制（决策 19 + 决策 24 改通道）**：agent 跑完调用插件注册的工具 `task_dispatch_table_receipt({ status, outputs?, note? })` 提交回执——该工具由插件在派发时经 `agentCtx.tools.register` 注册，**只对该任务会话可见**，`execute` 在**插件进程内**直写状态库 `task_events`（`kind='receipt'`，detail 形状 `{ status, outputs, note, session_id }`）。对账**只查库**：取派发时刻之后的最新 receipt，校验 `status ∈ contract.validStatuses` + `outputs` 逐一在目标工作区存在且 mtime 晚于本次派发（防旧产物冒充）。只记录不裁决，实例状态仍只由调度器写（决策 11）；重复提交无害（对账取最新）。⚠️ **为什么不再用命令行**：agent 的 bash 在 Landlock 沙箱 `workspace-write` 模式下**只能写工作区**，写不了宿主数据根下的 `state.db`（决策 24 真机证据）；`submit.js` 保留为手动 / 排查备用通道。

## 二、状态库（SQLite，路径见决策 14）

```sql
-- 任务实例状态表：状态机 7 态的载体，一行 = 一个任务的一个 logical date
CREATE TABLE task_instances (
  id            TEXT PRIMARY KEY,        -- "<task_id>:<logical_date>"，如 image-upgrade-daily:2026-09-21
  task_id       TEXT NOT NULL,
  logical_date  TEXT NOT NULL,           -- ISO 日期，按计划时刻归属（决策 9），非实际开始日
  scheduled_at  TEXT NOT NULL,           -- 计划时刻 ISO 8601（含时区偏移）
  status        TEXT NOT NULL CHECK (status IN
                  ('pending','dispatched','running','succeeded','failed','skipped','unknown')),
  attempt       INTEGER NOT NULL DEFAULT 0,  -- 重试在行内递增，不换行（决策 10）
  session_id    TEXT,                    -- 派发会话 id（对账信源）
  lease_until   TEXT,                    -- running 租约到期时刻（机制 #2）
  dispatched_at TEXT,
  finished_at   TEXT,
  updated_at    TEXT NOT NULL
);

-- 执行日志表：append-only，对账与排障的证据链
CREATE TABLE task_events (
  seq         INTEGER PRIMARY KEY AUTOINCREMENT,
  instance_id TEXT NOT NULL,
  ts          TEXT NOT NULL,
  kind        TEXT NOT NULL,             -- state_change | dispatch | session_event | receipt | nudge | receipt_check | error
  detail      TEXT                       -- JSON 原文
);

CREATE INDEX idx_events_instance ON task_events(instance_id, seq);
```

## 三、关键设计

1. **实例身份**：`task_id + logical_date` 唯一定位一次任务日，主键直接可读；下游依赖判定 = 一条 SELECT——`same_period` 查同 `logical_date`，`latest_success` 查 `succeeded` 的最近 `logical_date`（`freshness` 在 SQL 里比对 `scheduled_at`）。
2. **重试不换行**：`attempt` 行内递增，状态流转 `pending → dispatched → running → (failed → pending)* → 终态`；下游只见最终态，半成品状态不外泄。
3. **原子领取**：派发时 `UPDATE ... SET status='dispatched' WHERE id=? AND status='pending'`，以受影响行数判定领取成功。单进程插件的 tick 本就顺序执行，CAS 为重启恢复与未来多实例兜底，不改变决策 7 的任何理由。

## 四、已记录的取舍

| 取舍 | 结论 | 理由 |
|---|---|---|
| `logical_date` 存储格式 | ISO 字符串，不用 epoch | 可读、diff 友好、SQL 直接比较 |
| 通知机制 | 本期不做 | 只留 `task_events` 证据；渠道选型另立决策，不塞进状态库 |
