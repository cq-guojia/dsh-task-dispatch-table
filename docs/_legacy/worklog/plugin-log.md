# 建立 plugin_log 整体插件日志（进程级观测独立于 task_log）

> 工作包：把「插件这个进程怎么了」的观测，从任务级日志里抽出来，单独落一张维度为「插件进程」的表。

## 为什么做

- 原先所有进程级观测（宿主能力缺失 `degraded` / 主线程阻塞 `block` / 慢请求 `slow_request` / 路由异常 `route_error` / 调度异常 `tick_error` / SSE 连接生命周期 `stream_limit`·`stream_write_failed`）被临时塞进 `task_log`（`kind='diag'`），**维度错乱**：这些事挂不上任何任务，却进了「任务诊断表」，和任务级诊断混在一张表里，难以区分「插件进程怎么了」与「某个任务怎么了」。
- 用户拍板（2026-10-07）：新建一张维度为「插件进程」的表 `plugin_log`，进程级观测整体抽离。

## 决策 / 落点（与 data-model.md 对齐）

- 第 6 张表 `plugin_log`，五列 `seq/ts/level/kind/message`，**无 `task_id`**（维度就是「插件进程」）。
- `PluginLogKind` 枚举：`startup`/`shutdown`/`degraded`/`block`/`slow_request`/`route_error`/`tick_error`/`stream_open`/`stream_close`/`stream_limit`/`stream_write_failed`/`snapshot`/`config`/`dispatch`/`error`（兜底）。判定准则：**挂得上某任务 → `task_log`；挂不上 → `plugin_log`**。
- 语义方法 `logInfo`/`logWarn`/`logError`（钉死 level，统一走 `safelyAppend` 自带 try/catch，记日志绝不影响主流程）；模块级统一落库口 `pushNotice`（→ `writePluginLog`）。
- 落点：`startup`/`shutdown`/`degraded`/`block`/`slow_request`/`route_error`/`tick_error`/`stream_limit`/`stream_write_failed` 经 `pushNotice`；`stream_open` 经 `noticeStore?.()?.logInfo`（**只落库、不进调试页 warns**——正常连接不算异常，不该刷屏告警区）。
- 保留策略同 `task_log`：`logRetentionDays` 默认 **30 天**，`scheduler.ts` tick 内跨天清（`purgePluginLog` 与 `purgeLog` 并列）。
- `plugin_log` 已进调试页 `/db` 转储白名单，排序 `ts DESC, seq DESC`（最新在前）。

## 抽离（关键正确性）

- `src/index.ts` 全部进程级观测改走 `pushNotice`→`writePluginLog`，**无一处**再用 `store.appendLog` 写进 `task_log`。
- 校验：`scheduler.ts` / `reconcile.ts` 里的 `appendLog` 调用全部带 `taskId + scheduledAt`、kind 均为任务级（`precondition` / `missed-slot` / `stale-upstream` / `expired-once` / `startup_missed` / `manual-run` / `stray_pending` / `attachment-missing`），留在 `task_log` 是正确的，未误报。**全仓无 `kind:'diag'` 写 `task_log`**。

## 踩坑 / 订正（下次别重蹈）

1. `writePluginLog` 初版直接 `store.appendPluginLog({ level, kind, message })` 样板，后重构为走语义方法 `logWarn`/`logError`/`logInfo`（避免重复 level 样板、且语义方法自带异常隔离）。冒烟断言【日志归属】的期望值停在了旧写法 ⇒ 误报失败，已同步改为检查 `store.logWarn/logError/logInfo(kind, message)`。
2. `storeRef` 是 `apply` **局部**变量；`makeDispatchRoutes`（模块级）拿不到。stream_open 必须用**模块级** `noticeStore` 取值器（`setNoticeStore(() => storeRef)` 注册的闭包），否则引用 `undefined`。
3. SSE 连接生命周期：`stream_limit`/`stream_write_failed` 记异常；正常断开走 `cleanup` **不记**（重连会刷屏，且违反「别写爆库」）。`stream_close` 是预留枚举，当前无触发点（注释已说明「正常断开不记」）。

## 验证

- `npm run build`（含 `dist`）、`npm run typecheck` 绿；`npm run smoke` **724/0**（含【日志归属】等守卫）。
- 代码专家团（code-explorer very thorough）复查：实现完整正确，无遗漏 / 误写 `task_log`；四处临时 UI 数据源均真实、无 mock。

## 相关

- 定型：`docs/design/data-model.md` §二（表定义）/ §2.1（三表选择）/ §六（清理策略）。
- 提交：`b66e9ea`（建立插件整体日志 plugin_log（进程级观测独立于 task_log，接入 30 天清理））。
