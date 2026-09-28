# 两层循环彻底解耦（决策 41）

> 状态：🟢 已落码（2026-09-28，同日拍板；typecheck + build + 冒烟 162 项全过），**落码后真机二次回归已热修，待复验**。
> 定型表述见 [design/state-machine.md §0](../design/state-machine.md) 与 [design/decisions.md 决策 41/42](../design/decisions.md)；本文件记定位过程与落码清单 + 二次回归热修。

## 〇、落码后真机二次回归（2026-09-28，热修）

**现象**：用户重装新版本（`ad85d4a`）后，执行记录**完全零写入**；老库无报错日志。
**定位**（本地复现 `scripts/repro-olddb.mjs`：老 schema 无 snapshot 列 + 一条旧 `running` 实例）：
1. 老库迁移**没问题**——`ALTER TABLE ADD COLUMN snapshot` 正常，旧行 `snapshot=NULL`，不崩；所以不是迁移。
2. 真正根因：旧库一条卡 `running` 的历史实例（上次 `enabled=false` bug 遗留）经 `startupScan` 转成 `unknown`；而落码版 `IN_FLIGHT_STATUSES = ['dispatched','running','unknown']`，`dispatchNewSlots` 的串行互斥（决策 8）把它当"在飞"→ **同任务（cron `480f3ef1`）的新刻度被永久挡死** ⇒ 零写入。
   更糟：若宿主反复重启，每次 `startupScan` 把 `updated_at` 刷到 `now`，`unknown` 的 5+2 分钟宽限被不断重置 ⇒ 永远收不掉 ⇒ 永远挡死。
3. `snapOf` 的 legacy 回退路径直接读 `task.contract.validStatuses` / `task.retry.maxAttempts` / `task.schedule.window`，缺字段即崩 ⇒ sweep 每轮抛错（被 `safeTick` 接住记日志，用户未必注意到）；虽真机 `parseInlineTasks` 有默认值不会缺，但属隐患。

**热修**（4 处）：
- `scheduler.ts`：`IN_FLIGHT_STATUSES` 去掉 `'unknown'`——它只由重启扫描产生（会话句柄随进程消失、不定态），应在 sweep 快速收口，不该绑架同任务的串行互斥。
- `reconcile.ts`：`unknown` 分支给 30s 短宽限（够活会话经 `onEvent` 复活为 running）后判失败收口，不再等 5+2 分钟、不被重启重置。
- `reconcile.ts`：`running` 分支新增"`updated_at` 长期无活动（漏 `session/created` 致 `lease_until` 为 null、租约永不触发）也收口"，避免另一种卡死。
- `reconcile.ts`：`snapOf` legacy 回退加防御默认值（`contract`/`retry`/`schedule` 缺失即回退默认），杜绝 sweep 因畸形定义崩。

**验证**：`scripts/repro-olddb.mjs` 用老 schema + 旧运行实例，确认"老 unknown 实例旁，同任务当前槽照常写出带快照的新 `dispatched` 行"；冒烟 162 项全过。

## 一、背景与真机现象

测试任务 `480f3ef1`（once，计划 16:00）：agent 16:01:43 已完成（产物文件已写出、会话显示「任务完成」），执行记录却一直 `running` 不收口；U12 交付卡也没生成。用户中途把任务 `enabled` 改成 false（本意：只停后续分发）。用户提出质疑：执行记录一旦产生，重试 / 追结果 / 回执契约就应与任务设置解耦——执行中改了设置、或有重试时以哪个为准？

## 二、根因定位（源码证据）

1. `enabled=false` ⇒ `loadTasks` 把该任务过滤出任务表（`tasks.ts:351` 内嵌 / `:393` 目录，`if (!def.enabled) continue`）⇒ `tick` 每轮重建的 `taskMap` 里没有它。
2. 对账层经 `options.tasks().get(instance.task_id)` 取任务定义（`reconcile.ts:146-148`）⇒ 返回 `undefined`。
3. `settleByReceipt` 开头 `task === undefined` 即 return「暂不收敛」（`reconcile.ts:195-198`）⇒ **已交回执的实例永不收口**，永久卡 running——与现象完全吻合。
4. 反向路径：无回执实例走 sweep 追问 ⇒ `nudge` / `retryOrFail` 同样 `task === undefined` ⇒ `finishTerminal('failed')`（那会显示 failed 而非 running）。
5. 卡片没生成是同一根因的下游：`deliverables/presented` 事件只在回执成功路径写（receipt.ts），回执未收口 ⇒ 无卡。
6. 另发现同类耦合：对账各处**实时重读**活任务 JSON——`retry.maxAttempts`（重试判定）、`schedule.window`（超窗判定）、`target.workspace`（outputs 校验路径）、`contract.validStatuses`（回执合法性）。中途改任一项都会反向改写在飞实例的裁决；「第一次失败、第二次重试该以哪个为准」确无答案。

**用户排除项核实**：`enabled` 在调度循环里只挡「要不要建新行」（`scheduler.ts:205/248/313`），不进任何收口逻辑——所以会话照跑、文件照产出；坏的只是**收口环节**，机制是「任务从 taskMap 消失」而非直接读 `enabled`。

## 三、拍板方案（决策 41，只列要点）

- Loop A 落库即止，**不发动会话**；launch / 重试 / 追问 / 回收全部移交 Loop B。
- Loop B 只读执行记录 + 派发快照，不读任务表、不感知 `enabled`。
- 派发快照字段：prompt / manual / workspace path / 实测模型 route / `validStatuses` / `retry.maxAttempts` / window / title。
- 模型路由解析移为 Loop B 发动前置：失败走重试判定、**行保留**（原 Loop A 失败删行语义废止）。
- `enabled` 只挡新行；在飞实例照常收口。

## 四、落码记录（2026-09-28，全清单落地）

1. **store**：`task_instances` 加 `snapshot TEXT` 列（DDL + `ensureInstanceColumns` 迁移，旧行 NULL）；`InstanceSnapshot` 接口 + `parseInstanceSnapshot` 防御解析 + `ensureInstance(..., snapshot?)` / `setSnapshot()`。快照字段 = title（决策 42 display 名）/ prompt / manual / workspacePath / provider·model 提示 / validStatuses / maxAttempts / window。
2. **scheduler（Loop A）**：`dispatchNewSlots` 落库时组装快照，**落库即止**；`launchAsync` / `redispatchPending` 整体删除；本地 `resolveWorkspace` 去重改用 dispatch.js 导出。
3. **reconcile（Loop B）**：`taskOf` 移除，改 `snapOf`（快照解析 + legacy 一次性补快照兜底）；`checkReceipt` 改 `(workspacePath, validStatuses, …)`；`retryOrFail` / `windowDeadline` / `settleByReceipt` / `nudge` / `onCreated` 全走快照；新增 **发动**：sweep 对「无 session_id 的 dispatched 行」与「窗口内 pending 重试行」发动（`launching` Set 防并发重复发动），模型路由解析移到 `dispatchTask`（①层取快照提示，失败 `no-model-route` 走重试、**行保留**）；按 path 反查工作区（`resolveWorkspaceByPath`）。
4. **dispatch**：`DispatchInput` 改快照入参；`resolveModelRoute` 第①层 = 快照提示；`buildMessage` / 回执注册全取快照。
5. **receipt**：`ReceiptToolDeps` 去 `TaskDefinition`，改 `taskName + validStatuses`；`receiptInstruction(validStatuses)`。
6. **tick 顺序**：Loop A 先（落库）→ Loop B 后（发动本 tick 新行 + 收口）——新行当 tick 即被发动，时延不退化（冒烟测出先 B 后 A 会晚一拍）。
7. **冒烟 +8**：快照固化断言、命名三件套（短时刻 / 第N次 / display 回退链）、disabled 在飞实例照常发动 + 不产新行、legacy 补快照发动。**162 项全过**，typecheck + build 过。

**行为变化（决策 41 推论，已记决策 41 ⑤）**：模型路由失败从「删行」改「行保留 + 重试判定」；重试行不再复判依赖（首次落库已判过，重试是同一执行记录的再发动；上游失败传播由 `latest_success` 阻塞新槽承担）。

## 五、验证清单（真机）

- `enabled=false` 后已派发实例照常 succeeded；disabled 任务不再产生新行。
- 中途改 retry / window / workspace：在飞实例按**派发时**快照裁决。
- Loop B 发动：模型路由失败 ⇒ 行保留 + failed/retry 原因在事件时间线可见。
- 会话名 = `[TASK] <计划时刻> · <标题>`（attempt>0 追加「 · 第N次」；决策 42），改名只凭快照，不再读活任务表。
