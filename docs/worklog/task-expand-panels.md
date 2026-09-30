# 任务展开三面板（基础资料 / 执行记录 / 日志）

> **状态**：📝 骨架（由上一会话为**下一会话**预建；本会话只封卷上一个工作包 [`main-panel.md`](main-panel.md) §十七）
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
- **现有接口缺口**：`records` 标签走全局 `debugSnapshot.instances`（非按任务过滤）；`task_log` 只有 `appendLog` + `GET /db` 全表 dump。**两个按任务检索的接口 + `store.ts` 两个查询方法均待新增**（见设计提纲 §二/§三）。
- **真实数据纪律**：展示数据必须来自真实存储，禁止 mock（[`AGENTS.md`](../../AGENTS.md) 第五条）。

## 四、待新会话拍板 / 实施清单

1. **UX 形态拍板**：「滑动块」究竟是 ① 右侧抽屉 ② 就地展开三段式 ③ 横向轮播三面板 —— 需用户确认（设计提纲 §三 #1）。
2. 三面板容器与现有展开区（`task-list.tsx` `TaskCard`）的关系：整体替换 or 嵌套。
3. 新增 `GET /tasks/instances?taskId=` + `GET /tasks/log?taskId=` + `store.listByTask` / `store.listLogsByTask`。
4. 执行记录下钻复用现有事件时间线能力。
5. 冒烟断言：三面板数据按任务正确隔离（不串任务）、真实取数、空态文案。
6. 实施完回写：本文件封卷 + `PROGRESS.md`（当前状态 / 未决项 / 下一步 / 里程碑索引）+ 设计提纲定稿。

## 五、依赖 / 关联

- 调度语义不变（决策 8 / 54 / 拍板 A），本包只做**展示层**。
- 上一个工作包 [`main-panel.md`](main-panel.md) §十七 已封卷（真机 350/0 通过），本包为后继新会话。
