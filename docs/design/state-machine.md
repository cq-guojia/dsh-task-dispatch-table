# 状态机与依赖语义

> 完整定义。覆盖任务实例的全部生命周期：状态转移、运行时参数、窗口语义、重试、串行、补跑入口、依赖判定。
> 字段与 DDL 见 [data-model.md](data-model.md)；取舍理由见 [decisions.md](decisions.md)。

## 1. 总览：对账判定树

```
每个 tick 对账（对象：dispatched / running / unknown）
        │
        ├─ 会话还在跑（有活动/租约未到）──→ 继续等；租约超时则回收为 failed 并重试
        │
        └─ 会话已结束 ──→ 查「回执」（task_events kind=receipt，取派发后的最新一条，决策 19）
                            ├─ 回执存在 + status 合法 + outputs 新鲜 ──→ succeeded
                            ├─ 回执存在但不合法 / outputs 缺失或过期 ──→ failed（走重试判定）
                            └─ 无回执 ──→ 宽限期后追问（对原会话重发回执命令，≤2 次）
                                            └─ 仍无回执 ──→ failed（走重试判定）
```

**所有对账判定都是纯程序逻辑，零 token。**

## 2. 状态取值

| 状态 | 含义 | 下游怎么对待 |
|---|---|---|
| `pending` | 未到时间 / 前置未满足 | 等 |
| `dispatched` | 已派发，等会话确认建立 | 宽限期内等 |
| `running` | 会话在跑（带租约） | 等 |
| `succeeded` | 回执校验通过 | 依赖满足 |
| `failed` | 重试耗尽 / 回执校验失败 | 依赖不满足，**必须通知** |
| `skipped` | 当日窗口过期 / 上游失败 | **必须通知**（跳过 ≠ 正常） |
| `unknown` | 无法确认（防双跑） | 只观察不动作，直到收敛 |

## 3. 完整状态转移表

| 当前态 | 触发 | 次态 | 说明 |
|---|---|---|---|
| （无实例） | tick 实例保障 | `pending` 或 `skipped` | 窗口内 → `pending`；已过窗 → `skipped` 留痕（幂等补建，见 §7） |
| `pending` | 已到计划时刻 + 依赖满足 + 未超窗 + 同任务无互斥实例 | `dispatched` | CAS 领取（`WHERE status='pending'`）；互斥集合 = 该任务存在 `dispatched`/`running`/`unknown` 实例（`pending` 是排队语义，不互锁） |
| `pending` | `now > scheduled_at + window` | `skipped` | 终态 |
| `dispatched` | 收到 `session/created` | `running` | 记 `session_id`，起租约 |
| `dispatched` | 宽限期（60s）内无 `session/created` | `failed` | 走重试判定（§6） |
| `running` | 会话结束 + 回执校验通过 | `succeeded` | 终态 |
| `running` | 会话结束 + 回执校验失败 / 追问×2 后仍无回执 | `failed` | 走重试判定（§6） |
| `running` | 会话结束 + 宽限期无回执 | `running`（追问） | 对原会话重发回执命令（≤2 次，事件落 `nudge`）；追问通道不可用（handle 丢失/发送失败）直接进重试判定 |
| `running` | 租约到期且无会话活动 | `failed` | 回收，走重试判定（§6） |
| `unknown` | 确认有会话活动 | `running` | 续租 |
| `unknown` | 确认已死（无信号且超 2×租约） | `failed` | 走重试判定（§6） |
| `succeeded` / `failed` / `skipped` | — | — | 终态，只能被手动补跑（§7）重置 |

**启动扫描**（机制 #5）：插件启动时把 `dispatched` / `running` 实例置 `unknown`——重启期间 `disposed` 事件可能全部丢失，旧状态不可信；随后按 `unknown` 流程自然收敛。`pending` 从未派发、无可丢事件，保持原状。

**`unknown` 语义**（机制 #3）：进入后**绝不重派**（防双跑），只观察会话事件：有活动 → `running`；宽限期（5min）后仍无任何信号且超过 2× 租约时长 → `failed`。

## 4. 运行时参数（不进任务定义字段）

| 参数 | 默认 | 语义 |
|---|---|---|
| 派发宽限期 | 60s | `dispatched` 等待 `session/created` 的上限 |
| 租约时长 | 30min | `running` 的 `lease_until = now + 租约`；收到该会话**任何事件即续租**（心跳语义） |
| `unknown` 宽限期 | 5min | 只观察不动作的时长 |

## 5. 窗口语义（拍板 A）

**窗口只管「能不能开始」，不管「必须结束」。**

- `pending` 过窗（`now > scheduled_at + window`）→ `skipped`；
- 已 `dispatched` / `running` 的**不受窗切断**——跑完按回执判定。理由：切掉已开工的任务会浪费已消耗的 token，且产物可能即将产出。

## 6. 重试（拍板 B）

回收为 `failed` 时判定：

- `attempt < retry.maxAttempts` **且未超窗** → 当场回 `pending`（`attempt+1`），下个 tick 重派；
- 已超窗 → 终态 `failed`，不再重试（避免跨窗悬挂）。

重试在行内递增（不换行），下游只见最终态。

## 7. 补跑入口（拍板 C，三层）

| 层 | 机制 | 覆盖场景 |
|---|---|---|
| 自动 | **实例保障**：每 tick 为每个 `enabled` 任务幂等补建缺失实例——窗口内建 `pending`，已过窗建 `skipped` 留痕 | 重启自愈、漏跑自愈、次日实例生成 |
| 历史 | 任务定义可选字段 `backfill.days`（默认 0）：启动扫描时补建近 N 天缺失实例（`pending`），照常走依赖与窗口判定 | 追补历史 |
| 手动 | 标准 SQL 重置 | 单实例补跑 |

手动重置标准语句：

```sql
UPDATE task_instances
SET status = 'pending', attempt = 0, lease_until = NULL,
    dispatched_at = NULL, finished_at = NULL, updated_at = <now>
WHERE id = '<task_id>:<logical_date>';
```

## 8. 同任务串行（拍板 D）

同一 `task_id` 存在任一 `dispatched` / `running` / `unknown` 实例时，该任务的其他实例（含补跑的历史实例）**一律不派发**；`pending` 是排队语义，不参与互斥（否则多个 pending 会互相等待永不派发）。理由：日报类任务天然按日串行；该规则使「补跑昨天」与「今天在跑」天然不打架，且不引入按任务的并发配置。

## 9. 依赖语义（两种，由下游声明）

| 语义 | 判定 | 缺了怎么办 | 适用 |
|---|---|---|---|
| `same_period` | 找**同一 logical date** 的上游实例 | 上游缺失/未成功 → 下游**保持 `pending`**（窗口内上游修复仍可衔接，决策 10），随自身窗口过期收敛 `skipped` | 日榜 → 日报 |
| `latest_success` | 找**最近一次成功** + 新鲜度上限（`freshness`，如 ≤ 8 天） | 无成功记录 → `pending` 等待；**超上限才**随窗口过期收敛 `skipped` | 月榜 → 报告 |

⚠️ **归属用「计划时刻 `scheduled_at`」，不是「实际开始时间」**——任务 9:00 计划、因等前置 11:00 才跑，它仍属**今天**。这与「过窗切次日」（§5、§7 实例保障）天然咬合。

## 10. 必须避开的坑

> **「查会话是否存在」不能判断它是否在跑。**

DSH 会话是**持久化**的（日志落盘），`session/disposed` 只是把它从**内存 store** 移除。
所以「跑完了」和「从没建起来」**磁盘上都在**——用存在性判断会把跑完的误判成派发失败，**重复派发**。

**修法**：拆成两个独立信号

- 收到过 **`session/created`** → 派发成功
- 收到过 **`session/disposed`** / `turn/end` → 已结束
- 插件在进程内，`ctx.on('session/event')` 能收到**所有会话的所有事件** ⇒ **不用轮询**，轮询只作重启后兜底

## 11. 五个健壮性机制的落点

| # | 机制 | 落点 |
|---|---|---|
| 1 | 回执三查（回执事件存在 + `status` 合法 + `outputs` 存在且 mtime 晚于本次派发）+ 追问闭环（宽限 → 追问×2 → 失败） | §1 判定树；机制见 data-model「回执机制」（决策 19） |
| 2 | 租约（running 超时回收） | §4 运行时参数 + §3 转移表 |
| 3 | `unknown` 态 | §3 启动扫描与 `unknown` 语义 |
| 4 | 重发幂等（防双跑） | §3 CAS 领取 + `unknown` 期间不重派 |
| 5 | 启动扫描对账 | §3 启动扫描 + §7 实例保障 |

## 12. 已弃用的方案

| 弃用 | 原因 |
|---|---|
| 让调度器**发消息问会话**「完成了吗？回 Y/N」 | ① 又唤起一次 agent，白烧 token ② **agent 会撒谎** ③ 会话若已 disposed 未必收得到。（决策 19 的追问 ≠ 此方案：不问「完成了吗」，只重发回执提交命令，成败仍由程序查库裁决） |
| **事件驱动**（前置完成时主动唤醒下游） | 「拉」比「推」可复用——加下游不改上游，见 [decisions.md](decisions.md) 决策 8 |

## 13. 计划时刻的 live 重排（决策 20）

- `scheduled_at` 落库，但**「从未执行」前跟随配置**：pending 且 attempt=0 的实例每 tick 按当前任务定义重算 `planFor`，与落库值不一致则 CAS 更新并追加 `reschedule` 事件（from / to）。
- 配置已无该日计划（如 `once` 改到别日、cron 改掉该日）→ 该 pending 实例置 `skipped`（事件 `plan-removed`），新日实例由 `ensureInstances` 自然补建。
- **执行一开始即冻结**：attempt≥1（重试中）、dispatched、终态一律不改 `scheduled_at`，执行记录可追溯；重试中的 pending 不重排，避免打乱重试节奏。
