# 任务展开三面板（基础资料 / 执行记录 / 日志）

> **状态**：🔵 **已落码**（2026-10-01，决策 55；typecheck + build 绿，冒烟 **364/0**），⏳ **真机验证待做**（清单见 §六）
> **设计提纲**：[`design/task-expand-panels-design.md`](../design/task-expand-panels-design.md)
> **范围**：点击任务列表的每条记录展开为三个面板（基础资料 / 执行记录 / 日志）。本工作包**新会话实施**。

---

## 一、背景

主界面重建（[`main-panel.md`](main-panel.md)）已交付卡片列表 + 就地展开「基础资料」。用户下一步要求把「展开」升级为**三面板**：基础资料（沿用）＋ 执行记录（该任务的 `task_instances`）＋ 日志（该任务的 `task_log`）。执行记录/日志此前一直是占位，本工作包是它们的首个落地入口。

## 二、用户需求原话（逐字）

> 点击每一条记录进行展开，里面包含三个滑动块：
> - 第一个滑动块：基础资料（就是现在这页的基础资料）。
> - 第二个滑动块：执行记录（展开该任务的执行记录）。
> - 第三个滑动块：日志（该任务的相关日志）。

## 三、已知事实（已核实，供新会话直接复用）

- **基础资料**：`src/client/task-list.tsx` `TaskCard` 展开段（约 760–788 行），四区块 = 执行设置 / 附加文件 / 前置任务 / 提示词首段；排期人话与编辑器共用 `client/schedule-text.ts`。
- **执行记录数据**：`task_instances`。字段 = `task_id`/`logical_date`/`scheduled_at`/`status`/`attempt`/`session_id`/`finished_at`/`outputs`/`token_in`·`token_out`·`token_in_cache`。下钻事件时间线在 `task_events`（legacy `records` 标签已实现「点一行展开该次执行事件时间线」）。
- **日志数据**：`task_log`。字段 = `ts`/`task_id`/`scheduled_at`/`level`/`kind`/`message`。
- **现有接口缺口**：`records` 标签走全局 `debugSnapshot.instances`（非按任务过滤）；`task_log` 只有 `appendLog` + `GET /db` 全表 dump。**两个按任务检索的路由 + `store.ts` 三个查询方法均待新增**（名称与签名已定，见设计提纲 §四）。
- **真实数据纪律**：展示数据必须来自真实存储，禁止 mock（[`AGENTS.md`](../../AGENTS.md) 第五条）。

## 四、已拍板（2026-10-01）/ 实施清单

**UX 与加载方式（用户 2026-10-01 拍板，详见设计提纲 §三）**：

1. 布局 = 左下三个分段按钮（基础信息 / 执行记录 / 日志，默认基础信息）+ 中间内容区三选一替换 + 右下按钮区（编辑任务 + 删除）；内容区统一**最大高度滚动容器（约 360px）**，切 tab 卡片不抖。
2. 执行记录 = 最新 **100 条** + **状态 / 时间**筛选，**无翻页无「加载更多」**，点行下钻事件时间线（小面板暂不加关键字）。
3. 日志 = 默认 **100 条** + **50 / 100 / 200** 选择器 + **关键字 / 日期**筛选，主题色等宽可滚动文本框。
4. 删除 = 右下角按钮 → 确认框 → 复用 `DELETE /tasks`。

**数据通道（核心，未来总页面复用，详见设计提纲 §四）**：

5. `store.listInstancesByQuery` / `listLogsByQuery` / `listEventsByInstance`（过滤 + 游标分页）。
6. 路由 `GET /tasks/instances` / `GET /tasks/log` / `GET /tasks/events`；workspace 过滤由 `tasksInline` 反查 task_id。
7. 新建 `src/client/query.ts`（`fetchInstances` / `fetchLogs` / `fetchEvents`），面板与未来总页面共用。

**实施与验收**：

8. 改 `task-list.tsx` `TaskCard` 展开区为三面板；`TaskListView` 新增 `onDelete`。
9. 冒烟断言：三面板数据按任务正确隔离（不串任务）、真实取数、空态文案。
10. 实施完回写：本文件封卷 + `PROGRESS.md`（当前状态 / 未决项 / 下一步 / 里程碑索引）+ 设计提纲定稿。

## 五、依赖 / 关联

- 调度语义不变（决策 8 / 54 / 拍板 A），本包只做**展示层**。
- 上一个工作包 [`main-panel.md`](main-panel.md) §十七 已封卷（真机 350/0 通过），本包为后继新会话。

## 六、落码记录（2026-10-01，决策 55）

§四清单 1–8 全部落地：

| 层 | 文件 | 内容 |
|---|---|---|
| store | `src/store.ts` | `listInstancesByQuery` / `listLogsByQuery`（过滤 + 游标分页，`LIMIT limit+1` 弹一行判定末页）+ `listEventsByInstance` + cursor 编解码（base64 末行排序键） |
| 路由 | `src/index.ts` | `GET /tasks/instances`、`GET /tasks/log`（taskId / workspace / status·level / keyword / from / to / cursor / limit）、`GET /tasks/events?instanceId=`；`workspaceTaskIdsOf` 由 tasksInline 反查 task_id（不碰表结构） |
| 客户端 | `src/client/query.ts`（新） | `fetchInstances` / `fetchLogs` / `fetchEvents`（叶子模块静态 import，信封校验，不造假值） |
| 客户端 | `src/client/task-list.tsx` | `TaskExpandPanel`：左下三滑块（默认基础信息）+ 内容区 360px 滚动容器 + 右下编辑/删除；执行记录表（failed/skipped 标红、点行下钻事件时间线）、日志主题色等宽文本框（级别染色）、删除确认框（z 1070） |
| 客户端 | `src/client/index.ts` | `deleteTask(id)`（DELETE /tasks：成功 `overview.refresh()`、失败 viewErr 条）接 `TaskListView.onDelete` |
| 文案 | `src/client/locales.ts` | `card*` 16 键 + `colTokens`（zh/en） |

**验证**：typecheck（host + client）✅ · build（dist 入库）✅ · 冒烟 **364/0**（+14 条：按任务隔离 / DESC 排序 / limit+cursor 翻页不重不漏·末页无游标 / 状态与时间过滤 / 空态 / workspace 走 taskIds / 日志隔离·关键字·级别 / 事件按实例精确取且 seq 升序 / 路由·方法·文案键产物证据）。

**⏳ 真机验证清单（待用户，2026-10-02 嵌入验收）**：

1. 点三角展开 → 默认「基础信息」四区块与原内容一致；切「执行记录 / 日志」**卡片高度不抖**。
2. 执行记录：最新 100 条正确显示、状态 / 时间筛选生效、点一行展开该次执行的事件时间线、`failed` / `skipped` 标红加粗。
3. 日志：默认 100 条、50/100/200 切换、关键字与日期过滤、**明暗两种主题**下配色可读。
4. 删除：确认框弹出 → 确认后卡片消失（列表即时少一行）、取消不删；对有前置依赖的任务删除后下游日志出 `dep_missing`。
5. 与同日另一工作包（官方设置页 HTTP 通道）共存无冲突（互不覆盖入口）。
