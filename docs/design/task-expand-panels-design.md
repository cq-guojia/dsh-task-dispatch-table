# 任务展开三面板（基础资料 / 执行记录 / 日志）

> **状态**：🔵 **已落码**（2026-10-01，决策 55；typecheck + build 绿，冒烟 **364/0**）⏳ 真机验证待做
> **来源**：用户口述需求 + 2026-10-01 三轮确认
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

> 待定（用户明确「基础资料后面再改、放在最后」）：是否从「首段」升级为「全文」（点开看完整提示词）。容器形态**已定**：并入统一的三面板内容区（§3.1），不再沿用就地拉伸。

### 面板 2 · 执行记录
= 该任务的 `task_instances` 行，按 `scheduled_at DESC`：
字段（已核实 `src/store.ts` DDL）：`task_id` / `logical_date` / `scheduled_at` / `status`（`pending/dispatched/running/succeeded/failed/skipped/unknown`）/ `attempt` / `session_id` / `finished_at` / `outputs`（决策 32③ 真值，可点开）/ `token_in`·`token_out`·`token_in_cache`。
每行可下钻到该次执行的事件时间线（`task_events`，现有 `records` 标签已支持「点一行展开该次执行的事件时间线」）。
- **现有接口**：`records` 标签走全局 `debugSnapshot.instances`（host 周期写入），**非按任务过滤**；本面板需**按任务过滤**。
- **待补接口**：已定 `GET ${DISPATCH_API_PREFIX}/tasks/instances?taskId=…`，查询方法 `store.listInstancesByQuery`（过滤 + 游标分页，签名与语义见 §四）。

### 面板 3 · 日志
= 该任务的 `task_log` 行，按 `ts DESC`：
字段（已核实）：`ts` / `task_id` / `scheduled_at` / `level`（`error`/`warn`/`info`…）/ `kind` / `message`。
- **现有接口**：仅 `appendLog` 写入 + `GET /db` 调试快照全表 dump；**无按任务检索的接口/查询方法**。
- **待补接口**：已定 `GET ${DISPATCH_API_PREFIX}/tasks/log?taskId=…`，查询方法 `store.listLogsByQuery`（签名与语义见 §四）。

---

## 三、已拍板设计（2026-10-01 用户确认）

### 3.1 布局
- **左下角**：三个分段按钮「基础信息 / 执行记录 / 日志」，默认选中**基础信息**。
- **中间内容区**：三选一替换（选「执行记录」/「日志」时替换掉基础信息区）。
- **右下角**：按钮区 = 「编辑任务」 + 「删除」。
- **基础信息高度**：内容区统一为**最大高度滚动容器（约 360px）**——基础信息短就撑不满，执行记录 / 日志长则内部滚动；**切换 tab 卡片高度不抖**（用户拍板口径）。

### 3.2 执行记录面板
- 取该任务 `task_instances` 最新 **100 条**（`scheduled_at DESC`）；**不做翻页、不做「加载更多」**（小面板没有页码空间）。
- 轻量筛选：**状态** + **时间范围**；点一行下钻该次执行的**事件时间线**（复用 legacy `records` 能力）。
- ⚠️ 小面板**暂不加关键字**搜索（留给未来总页面）。

### 3.3 日志面板
- 取该任务 `task_log`，**默认 100 条**，提供 **50 / 100 / 200** 条数选择器（`ts DESC`）。
- 筛选：**关键字** + **日期范围**。
- 形态：跟随宿主主题色 + 等宽字体 + 可滚动文本框。

### 3.4 删除
- 右下角「删除」→ **确认对话框** → 复用现有 `DELETE ${DISPATCH_API_PREFIX}/tasks`（摘定义 + 删任务目录，实例 / 事件保留做审计）。
- 删除后由 overview 的 rev 自动刷新列表。

### 3.5 数据通道抽象（核心，未来总页面复用）
- 用户后续要做**总页面**（日志查询 + 任务执行记录查询），带更详细的搜索与分页：① 按任务筛选；② 按工作区筛选（查全部执行记录）；③ 按成功 / 失败状态筛选。
- 因此查询**统一抽象为一套「过滤 + 游标分页」模型**，本面板与未来总页面**共用同一实现**：本面板传 `limit`（取最新 N）；总页面再传 `cursor` 即翻页。

### 3.6 真实数据纪律
- 依 [`AGENTS.md`](../../AGENTS.md) 第五条：面板展示数据必须来自宿主 / 自有存储**真实值**，不得 mock。

---

## 四、数据接口（已定）

### 4.1 store（`src/store.ts`）
- `listInstancesByQuery({ taskId?, taskIds?, statuses?, fromTs?, toTs?, cursor?, limit? })` → `{ rows, nextCursor }`；排序 `scheduled_at DESC, id DESC`，cursor 编码末行 `(scheduled_at, id)`。
- `listLogsByQuery({ taskId?, taskIds?, levels?, keyword?, fromTs?, toTs?, cursor?, limit? })` → `{ rows, nextCursor }`；排序 `ts DESC, seq DESC`，cursor 编码末行 `(ts, seq)`。
- `listEventsByInstance(instanceId)` → 事件时间线（`seq ASC`）。

### 4.2 路由（`src/index.ts`）
- `GET ${DISPATCH_API_PREFIX}/tasks/instances?taskId=&workspace=&status=&from=&to=&cursor=&limit=`
- `GET ${DISPATCH_API_PREFIX}/tasks/log?taskId=&workspace=&level=&keyword=&from=&to=&cursor=&limit=`
- `GET ${DISPATCH_API_PREFIX}/tasks/events?instanceId=`
- **workspace 过滤**：`task_instances` / `task_log` 均无工作区列 ⇒ 由路由读 `tasksInline` 反查「该工作区的 task_id 列表」再 `WHERE task_id IN (...)`（不碰表结构）。

### 4.3 客户端（新建 `src/client/query.ts`）
- `fetchInstances(params)` / `fetchLogs(params)` / `fetchEvents(instanceId)`，面板与未来总页面共用。

---

## 五、与既有设计的关系

- 基础资料 = 现有 `TaskCard` 展开区四区块（`task-list.tsx`）**原样并入**三面板内容区（容器形态已定，见 §3.1）。
- 执行记录页此前被用户明示「属新功能、未明示不动」（见 [`PROGRESS.md`](../../PROGRESS.md) §二 历史条目）；本三面板是**首个落地入口**。
- 调度/状态语义（决策 8 同任务串行、决策 54 任务级错误 `skipped`、拍板 A once 过期）不变，面板只负责**展示**，不改调度。
