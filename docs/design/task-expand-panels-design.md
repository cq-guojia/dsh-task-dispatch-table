# 任务展开三面板（基础资料 / 执行记录 / 日志）

> **状态**：📝 提纲（由上一会话为下一会话预建，待新会话拍板 + 实施）
> **来源**：用户口述需求（2026-09-30 末轮后，新会话启动）
> **配套工作包**：[`worklog/task-expand-panels.md`](../worklog/task-expand-panels.md)

---

## 一、需求原话（用户，逐字保留）

> 点击每一条记录进行展开，里面包含三个滑动块：
> - 第一个滑动块：**基础资料**（就是现在这页的基础资料）。
> - 第二个滑动块：**执行记录**（展开该任务的执行记录）。
> - 第三个滑动块：**日志**（该任务的相关日志）。

---

## 二、三面板内容来源（已核实现有数据面）

### 面板 1 · 基础资料
= 当前卡片**展开区**已有的「标签 / 值两栏」内容（`src/client/task-list.tsx` 的 `TaskCard` 展开段，约 760–788 行），四区块：
- 执行设置：`schedule`（排期人话，与编辑器共用 `schedule-text.ts`）/ `workspace` / `model` / `retryMax` / `window`
- 附加文件：`attachments`（名称 + link/upload 标注）
- 前置任务：`depends`（标题 + 停用标注）
- 提示词：`promptHead`（首段 120 字）

> 待定：是否从「首段」升级为「全文」（点开看完整提示词）；基础资料面板是否沿用就地拉伸形态，还是并入统一的三面板容器。

### 面板 2 · 执行记录
= 该任务的 `task_instances` 行，按 `scheduled_at DESC`：
字段（已核实 `src/store.ts` DDL）：`task_id` / `logical_date` / `scheduled_at` / `status`（`pending/dispatched/running/succeeded/failed/skipped/unknown`）/ `attempt` / `session_id` / `finished_at` / `outputs`（决策 32③ 真值，可点开）/ `token_in`·`token_out`·`token_in_cache`。
每行可下钻到该次执行的事件时间线（`task_events`，现有 `records` 标签已支持「点一行展开该次执行的事件时间线」）。
- **现有接口**：`records` 标签走全局 `debugSnapshot.instances`（host 周期写入），**非按任务过滤**；本面板需**按任务过滤**。
- **待补接口**（建议）：`GET ${DISPATCH_API_PREFIX}/tasks/instances?taskId=<id>` ⇒ `task_instances WHERE task_id=? ORDER BY scheduled_at DESC`（分页可选）。`store.ts` 现无 `listByTask`，需新增查询方法。

### 面板 3 · 日志
= 该任务的 `task_log` 行，按 `ts DESC`：
字段（已核实）：`ts` / `task_id` / `scheduled_at` / `level`（`error`/`warn`/`info`…）/ `kind` / `message`。
- **现有接口**：仅 `appendLog` 写入 + `GET /db` 调试快照全表 dump；**无按任务检索的接口/查询方法**。
- **待补接口**（建议）：`GET ${DISPATCH_API_PREFIX}/tasks/log?taskId=<id>` ⇒ `task_log WHERE task_id=? ORDER BY ts DESC`。`store.ts` 需新增 `listLogsByTask`。

---

## 三、待新会话拍板 / 实施项

| # | 议题 | 现状与方向（未定，待用户拍板） |
|---|---|---|
| 1 | **「滑动块」的精确交互形态** | 用户用词「滑动块」未定义具体 UX，三种可能：① 右侧滑出抽屉（drawer），三块为抽屉内 tab/分段；② 卡片就地展开后的**三段式**（当前展开区已就地拉伸）；③ 可横向滑动切换的**轮播式**三面板。需用户确认。 |
| 2 | 三面板容器与现有展开区的关系 | 现有展开是「就地拉伸 + 虚线分隔四区块」；新需求是「三块」。是否**整体替换为三面板**（基础资料 = 原四区块合并）+ 复用 `Flip`/排序逻辑。 |
| 3 | 执行记录 / 日志的按任务接口 | 新增两个 `GET` 路由 + `store.ts` 两个查询方法（建议如上）；或复用全局 debug 快照客户端过滤（省接口但拉全量）。 |
| 4 | 执行记录下钻 | 复用现有「点一行展开该次执行事件时间线」能力（已在 legacy `records` 标签实现），移植到面板 2。 |
| 5 | 真实数据纪律 | 依 [`AGENTS.md`](../../AGENTS.md) 第五条：面板展示数据必须来自宿主/自有存储**真实值**，不得 mock。 |

---

## 四、与既有设计的关系

- 基础资料 = 现有 `TaskCard` 展开区（`task-list.tsx`），仅容器形态可能变。
- 执行记录页此前被用户明示「属新功能、未明示不动」（见 [`PROGRESS.md`](../../PROGRESS.md) §二 历史条目）；本三面板是**首个落地入口**。
- 调度/状态语义（决策 8 同任务串行、决策 54 任务级错误 `skipped`、拍板 A once 过期）不变，面板只负责**展示**，不改调度。
