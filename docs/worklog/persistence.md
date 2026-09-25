# 任务表持久化主通道（state.db meta 表）与调试页

> 时间范围：2026-09-25 · **状态：✅ 完成封卷**（本文件是该工作包完成时的快照记录，不再更新）。
> 
> 面板设置第二次清零的根治：tasksInline 持久化改 meta 表主通道；面板新增「调试」标签页直读 state.db 三表；once 全链路真机重新跑绿。
>
> 定型结论见 [`design/decisions.md`](../design/decisions.md)；设计与事实清单见 [`design/`](../design/)。本文只保留过程叙事：踩坑、定位、修复与真机证据。

## 2026-09-25 (11) — 任务表持久化主通道改 state.db meta 表（面板设置第二次清零的根治）+ 澄清改期语义（用户质询：once 改时间为什么不能用原 id）

① **设置丢失定性**：用户重装插件后再开面板，tasksInline 又空了（15:14 容器重启后快照）。面板保存链路 = POST /tasks → `runtime.tasksInline`（内存，立即生效）+ `persistTasksInline`（写 entry config）。后者有三条**静默 no-op 路径**（settings 未就绪 / 无 configEditor 面 / entry 找不到都直接 return），且 entry config 本身在**插件重装（重新添加）时会随 entry 重置**——两个原因任一都造成「保存时能跑、重装后清零」。数据根 `/root/.dsh` 是 bind 挂载（持久），state.db 两轮容器重建都幸存 ⇒ 持久化的正确归宿是 state.db。**修复**：store 增 `meta` 键值表（DDL 同步 data-model.md）；`persistTasksInline` 主通道 = `store.setMeta('tasksInline', json)`（未就绪改告警，不再静默），entry config 降为尽力写回；启动时 meta 有行 ⇒ 恢复进 runtime 并 info 留痕（「无行 = 从未写过」与「空串 = 用户清空」语义分开）。冒烟新增 [3.5] 重开库恢复组（59 项全过）。② **改期语义澄清（代码本就如此，无需改码）**：实例唯一键 = `(task_id, scheduled_at)` **全时刻**（store.ts ensureInstance / 决策 25），非「task_id+日期」——once 同 id 改时刻 ⇒ 新实例照跑；每日同 id 9 点改 12 点 ⇒ 今天 12 点照跑（临近刻度由 ensureInstances 补建）；仅「同 id + 完全相同计划时刻」幂等跳过。此前对话中「换新 id 重测」的指引过窄造成误解，已在下一步 0.5/1 条更正：**改配置永远不需要换 id**。

## 2026-09-25 (12) — once 全链路真机跑绿（v4 修复验证通过）+ 面板新增「调试」标签页（state.db 三表原始行直读）

① **link-test-once succeeded**：16:36:06 派发 → 16:36:43 回执 ok（37 秒，产出 `260925/163635-备忘-晴.txt`）→ receipt-pass → succeeded；(10) 的自有 kind 修复在 0.1.7-rc.1 真机生效，全链路重新打绿。② **调试页（用户诉求：机器上没有 sqlite CLI，不想每次问 agent 才能核对库）**：右上角标签组「任务配置 / 执行记录 / **调试**」；新路由 `GET /api/task-dispatch-table/db`（同源守卫同现有路由，store 未就绪 503）返回 `TaskStore.DUMP_TABLES.map(dumpTable(name, 500))`；`dumpTable`（store.ts）白名单三表（task_instances 按 scheduled_at 倒序、task_events 按 seq 倒序、meta 按 key），count + PRAGMA 列序 + 行原样，超 500 行保留最新并标 truncated（SQLite 表名不可参数化 ⇒ 白名单防注入）；客户端切到该页 / 点刷新时 fetch 一次，三表动态列表格（长值截 160 字符悬停看全文）。冒烟补 dumpTable 组（62 项全过）。**持久化主通道 meta 表 + 调试页 ⇒ 用户此后可自助核对「定义存没存上、实例为什么是这个状态」**。

