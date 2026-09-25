# 0.1.7 真机兼容性排障（ENOENT 误报 / v4 消息格式）

> 时间范围：2026-09-25 · **状态：✅ 完成封卷**（本文件是该工作包完成时的快照记录，不再更新）。
> 
> loadTasks 对不存在任务目录的 ENOENT 静默 + 告警去重；v4 会话消息格式 source.kind 校验修复（自有 producer kind），0.1.7 派发链路恢复。
>
> 定型结论见 [`design/decisions.md`](../design/decisions.md)；设计与事实清单见 [`design/`](../design/)。本文只保留过程叙事：踩坑、定位、修复与真机证据。

## 2026-09-25 (9) — 面板真机跑通确认 + 任务定义丢失定性（用户拍板不捞旧数据）+ 修复 loadTasks 空态误报刷屏

① 用户确认面板已出数据、执行记录都在 ⇒ (8) 的修复真机生效；「数据通道诊断」行与兜底块的回收暂缓（下一步 0 条）。② 任务定义（once9 等）丢失定性：定义只存 tasksInline（profile）或 tasks/ 目录文件；旧容器 09-24 03:47 重建 ⇒ 旧容器层 /app/tasks 里的定义文件随之消失；新容器 tasksInline 从未有用户数据；state.db 在挂载卷故实例记录幸存——**非格式解析问题，是存储位置随容器消亡**，用户拍板不捞旧数据、直接新建。③ 修复告警刷屏：`loadTasks`（src/tasks.ts）对 `readdirSync` 失败不区分错误类型，目录不存在（ENOENT）也每 tick `任务表目录不可读` ⇒ 用户未启用目录模式时每 60s 刷一条。改法：**ENOENT = 合法空态静默返回**；其余不可读错误（权限等）按 dir 去重，同一错误只告警一次、恢复可读时 info 一次。构建 + 冒烟 55 项全过，待重装验证。

## 2026-09-25 (10) — 定位并修复 0.1.7 v4 会话格式不兼容（link-test-once1 派发后 agent 本轮运行失败）

现象：任务解析 / 实例生成 / 派发 / 会话创建全正常，agent 收到 `[TASK]` 消息后本轮即失败，报 `format v4 message requires a producer-owned source kind`（×2 UNKNOWN）。取证闭环：容器日志确认宿主 0.1.7-rc.1（容器 09-25 06:05 UTC 重建）→ npm 各 0.1.7 系列包无此错误串 → 克隆 deepseek-harness 源码定位 `session-format-v3-to-v4/src/message-sources.ts:10`：每条 durable message 的 `source.kind` 必须是非空字符串且 **`kind === 'plugin'` 被明确拒绝**（v3 retired 语法）；rc.1/rc.2 校验一致排除版本混搭。**根因**：本插件 `userNotice()`（src/dispatch.ts，派发 buildMessage 与 reconcile 追问共用）source 用 `kind:'plugin', plugin:'dsh-task-dispatch-table'` 老包装；09-23 once7/8 跑通是旧容器 0.1.5（v3 格式容忍），0.1.7 严格校验首次派发即拒。**修复**（参照宿主自带 schedule 插件 runtime.ts:119-121 的 producer-owned 模式）：source 改 `{ kind: 'task-dispatch-table', form: 'notice', summary }`——自有 kind 命名对齐包名去 `dsh-` 前缀惯例（同回执工具 `task_dispatch_table_receipt` 的命名规则，snake/kebab 各随其场景），删 `plugin` 字段；src/host.ts `UserMessage.source` 类型同步。reconcile.ts 追问路径走同一函数自动跟随。`agent.send(msg,'next-turn',true)` 通道本身正常（消息已送达会话，仅 source 校验被拒），不改 followup。构建 + 冒烟 55 项全过，待重装换新 id 重测。

