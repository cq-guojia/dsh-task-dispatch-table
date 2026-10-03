# 立即执行（手动触发一次调度）

> **状态**：🔵 落码完成（2026-10-03），⏳ 真机验证待做
> **规格**：[`../PROGRESS.md`](../PROGRESS.md) §1.5 · [`../design/features/creation-edit.md`](../design/features/creation-edit.md) §十.5 · [`../design/data-model.md`](../design/data-model.md) §一（`run_type`）
> **适用版本**：本仓 0.0.1（宿主 0.2.0-rc.2）

## 一、需求（用户 2026-10-03）

1. **界面**：任务卡片的操作区，在「删除」与「编辑」两个按钮**中间**新增「立即执行」。
2. **触发**：点击弹确认框「你确定要立即执行此任务吗？」；确认后以**当前时间**触发；**不看该任务当前开启 / 关闭**，也**不看上次是否失败**。
3. **执行**：① 不是直接执行，而是写入一条「待执行」执行记录，等**第二个循环**（Loop B）去执行；② 前置任务判断照旧，失败按原流程。

## 二、拍板口径（用户四问四答，2026-10-03）

| 问题 | 用户拍板 |
|---|---|
| 前置未达标表现 | **与正常调度完全一致**（不建记录、只记 `task_log`）；但手动触发者看不到后台日志 ⇒ **额外把原因回给前端，用统一 Toast 提示**「没执行成功 + 为什么」 |
| 任务在跑时能否再点 | **拒绝**：判断同任务是否有在飞实例，提示「该任务正在执行中，暂时不能再次执行」（防双跑）。纯快捷操作，**不得与既有逻辑产生任何冲突 / 变化** |
| 是否引入 `run_type` | **引入**：自动调度不传（走默认）、手动传 `manual` 并落库；**读取处与前端展示先不改** |
| 触发延迟 | 「提前触发一次」即可 —— 写记录、等下一个调度循环处理，**不加额外机制** |

## 三、动工前核实的关键事实（源码级）

- **列表里没有下拉菜单**：全仓唯一的 `Menu` 是顶部「工作区筛选」。用户说的「删除 / 编辑」实为**卡片展开区右下角的两个 `Button`**（`src/client/task-list.tsx` 的 `panelBar`）。⇒ 落点就是这个按钮组。
- **两层循环已解耦**（决策 41）：Loop A（`scheduler.dispatchNewSlots`）只写执行记录；Loop B（`reconcile.sweep`）只读记录发动。**「写记录 → 等 Loop B」是现成机制**。
- **Loop A 的落库形态是 `dispatched`，不是 `pending`**；`pending` 只是「重试回退」态 —— Loop B 对 `pending` 行做窗口判定，**窗口外直接删行 + 记 `stray_pending`**，且不重判依赖。⇒ 手动行若写 `pending`，遇 `window` 很小 / 为 0 的任务会在下一 tick 被误删。**故手动行写 `dispatched`**（与 Loop A 同形态，Loop B 的「发动②：无会话的 dispatched 行」直接发动）。
- **唯一键** `UNIQUE(task_id, scheduled_at)` ⇒ `scheduled_at` 取**当前时刻**，天然避开与当前刻度行撞键。

## 四、实现坐标

| 层 | 文件 | 改动 |
|---|---|---|
| 存储 | `src/store.ts` | `task_instances` 加列 `run_type`（DDL + 旧库 `ALTER TABLE` 迁移 + `InstanceRunType` 类型 + `TaskInstance.run_type`）；`ensureInstance` 加 `runType` 形参（缺省 `'scheduled'`） |
| 调度 | `src/scheduler.ts` | `Scheduler.runNow(taskId)`：按 id 从**全量定义（含停用）**取（绕过 `enabled`）→ 串行互斥 → `judgeDependencies` → 工作区 → 附件 → 写 `dispatched` + 快照 + `run_type='manual'` → 记 `task_log`(`manual-run`) + `task_audit`(`task_run_now`) |
| 接口 | `src/index.ts` | 新增 `POST /tasks/run`（`{ id }`）；业务性拒绝一律 **200 + `ok:false` + `error`(机器码) + 可选 `detail`**；`schedulerRef` 惰性注入（webServer 注入早于 settings） |
| 前端 | `src/client/index.ts` | `runTaskNow(id)`：POST → 成功 `overview.refresh()`，失败回 `{ ok:false, error, detail }` |
| 前端 | `src/client/task-list.tsx` | 按钮组插「立即执行」（删除与编辑之间）+ 确认框 `renderRunConfirm`（复用删除确认的自绘 overlay 范式）+ 结果 `FloatingToast`（成功绿 / 拒绝红）；`RunNowOutcome` 类型；错误码 → 人话文案映射 |
| 文案 | `src/client/locales.ts` | 新增 13 键 × 中英（按钮 / 确认框 / 成功 / 各类拒绝原因） |

## 五、验证

- `npm run typecheck`（host + client）绿；`npm run build` 绿。
- **冒烟 495/0**（较此前 488 新增 7 条）：`run_type=manual` 落库 / 不传时缺省 `scheduled` / DDL 含列与迁移 / `runNow` 预条件与 `manual` / `POST /tasks/run` 路由 / 前端按钮与确认框与 Toast / 中英文案键。
- **真机验证清单**见 [`../PROGRESS.md`](../PROGRESS.md) §三.7（待用户装 `dist/` 实测）。

## 六、遗留

- `run_type` 目前**只写不读**（用户拍板：读取处与 UI 展示先不改）。
- **手动重试**（从失败点重跑）未做 —— 见 [`../design/features/creation-edit.md`](../design/features/creation-edit.md) §十.5。
- 真机验证待做。
