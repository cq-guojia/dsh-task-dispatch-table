# 数据模型：任务定义与状态库

> **定型依据**：决策 6（定义存 JSON）/ 7（状态存 SQLite）/ 8（依赖下游声明）/ 9（两种依赖语义）/ 10（失败策略）/ 12（任务手册）/ 14（状态库路径）。
> **边界**：通知机制本期不设计——`failed` / `skipped` 的证据先落在 `task_events`，通知渠道另立决策。

## 一、任务定义（JSON 文件，人改、进 Git，不入库）

| 字段 | 类型 | 说明 | 依据 |
|---|---|---|---|
| `id` | string? | **用户不填**：首次加载时系统生成并**写回这段 JSON**（inline 回写 settings、目录模式回写该文件）；写了就以用户写的为准。**任意非空字符串都算合法**（兼容既有 kebab-case）。空串 / 非字符串 = 视为没有，重新生成并覆盖 | 决策 25 |
| `title` | string | 用户可读名称：**任意文本（中文亦可）、随时可改**，**不参与身份** ⇒ 改名不改 `id`，历史不断链 | 决策 25 |
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
  updated_at    TEXT NOT NULL
);
-- ★ 防重闸门（唯一索引而非表约束：旧库加索引即可升级，不必重建表）
CREATE UNIQUE INDEX idx_instances_slot ON task_instances(task_id, scheduled_at);
  -- 待确认（未拍板，见 PROGRESS 未决项 U5）：def_revision（跑的是哪版定义）/
  --   def_snapshot（当时的配置快照 JSON）/ run_type（scheduled | manual | retry | backfill）

-- 执行日志表：append-only，对账与排障的证据链
CREATE TABLE task_events (
  seq         INTEGER PRIMARY KEY AUTOINCREMENT,
  instance_id TEXT NOT NULL,
  ts          TEXT NOT NULL,
  kind        TEXT NOT NULL,             -- state_change | dispatch | session_event | receipt | nudge | receipt_check | error
  detail      TEXT                       -- JSON 原文
);

CREATE INDEX idx_events_instance ON task_events(instance_id, seq);

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

   刻度**由 cron 决定**，不是「上一次 + 间隔」⇒ 迟到 / 重启 / 多跑几轮都不漂移（8:01 才跑，记的仍是 `08:00` 这个槽）。**防重 = 唯一约束**：每 tick 列出窗口内的刻度逐个 INSERT，插过就插不进去 ⇒ 一天 288 轮 tick 也只有一条。下游依赖判定仍是「一条 SELECT」：`same_period` 查同 `logical_date`，`latest_success` 查 `succeeded` 的最近 `logical_date`（`freshness` 比对 `scheduled_at`）。展示用可读串拼 `task_id:scheduled_at`，**但不作主键**。

   **ensureInstances 的窗口**（实现约定，不是决策）：`[now - max(窗口时长, 26h), now + 2×tick]`，刻度超限（`MAX_ENSURE_SLOTS = 200`）时**只保留最近的**——近期刻度才是要跑的，更远的历史交给 `backfill.days`。
2. **重试不换行**：`attempt` 行内递增，状态流转 `pending → dispatched → running → (failed → pending)* → 终态`；下游只见最终态，半成品状态不外泄。
3. **原子领取**：派发时 `UPDATE ... SET status='dispatched' WHERE id=? AND status='pending'`，以受影响行数判定领取成功。单进程插件的 tick 本就顺序执行，CAS 为重启恢复与未来多实例兜底，不改变决策 7 的任何理由。

## 四、已记录的取舍

| 取舍 | 结论 | 理由 |
|---|---|---|
| `logical_date` 存储格式 | ISO 字符串，不用 epoch | 可读、diff 友好、SQL 直接比较 |
| 执行主键形态 | **UUID（不透明）**，不用自增、也不用可读复合串当主键 | 自增在客户端 / 重装 / 多实例环境下不可靠；可读串作**唯一约束**即可（Airflow 同款：整数 `id` 主键 + `run_id` 可读串去重）。界面不必显示该串 |
| 锚点粒度 | **`scheduled_at` 刻度（含时分秒）**，不用日历日 | 日历日粒度会让每小时 / 每几分钟的 cron 一天只能出一条；刻度由 cron 决定 ⇒ 迟到不漂移、改周期类型不撞车 |
| 计划时刻 vs 实际时刻 | 分开存：`scheduled_at`（锚点）/ `dispatched_at`（实际派发）/ `finished_at` | 同 Airflow（`logical_date` vs `start_date`/`end_date`）与 k8s（`cronjob-scheduled-timestamp` annotation）。对账的「mtime 晚于派发」用 `dispatched_at` |
| 通知机制 | 本期不做 | 只留 `task_events` 证据；渠道选型另立决策，不塞进状态库 |
