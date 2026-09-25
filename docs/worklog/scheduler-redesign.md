# 工作包：调度循环重设计 + 日志表 + 冗余字段（里程碑 11）

日期：2026-09-26　决策：31 / 32　状态：✅ 落码完成，待真机复测

---

## 一、起因：周期任务真机跑通后暴露的两个缺陷（里程碑 10）

每 5 分钟 cron（`cron-5min-探针`）真机验证**成功**：按刻度出实例、跨天成功、终态 `succeeded`。
但用户盯着执行记录，指出两个「逻辑不对」的地方：

1. **`skipped` 洪水**：保存一次就按 `[now - max(window, 26h), now + 2*tick)` 回看，把历史上
   **每一个** cron 刻度都建成 `skipped` 行（5 分钟 cron ⇒ 一次几十行；若用户配「每分钟」则更夸张）。
   用户原话：*「我现在是 2026 年了，你每分钟都要补一条吗？根本没意义。」*
2. **提前写 `pending`**：未来刻度（到 `now + 2*tick`）被预建成 `pending`（实测 23:58:52 就写了
   00:00 的行），到了 0 点才真正派发。用户质疑：*「我在这一两分钟里改了配置呢？」*

两条都指向同一件事：**当前的 `ensureInstances` 过度「全留痕」——预建未来 + 回看补建过去**。

---

## 二、拍板（用户明确）

- **不回看、不补跑**：只判「现在这一刻该不该跑」。过了就是过了，`backfill` 是过度设计。
- **不预建未来 `pending`**：落到自己那一轮才建行。
- **`skipped` 不进 `task_instances`**：过期 / 被依赖卡 / 预条件失败一律不建任务记录行。
- **诊断进日志、不进任务表**：错过几个刻度、为什么卡，记日志（可定时清）；否则上游一卡，
  下游全部 `skipped` 刷屏。用户拍板**单独建一张表**（「一句 SQL 就删了，好清」）。
- **执行记录补冗余字段**：`outputs`（产出）、`tokens`（token 消耗）；产出原本只存在于
  `task_events` 的回执里，用户要求**完成瞬间写回总表**做冗余（查总表直接可见，不必 join）。
- **崩溃残留 `pending`**：交给 agent 拿主意，第一版容灾不做重。

---

## 三、落码改动

| 文件 | 改动 |
|---|---|
| `src/scheduler.ts` | **整体重写**。删 `ensureInstances` / `reschedulePass` / `dispatchPass` / `backfill` / `planFor` / `slotsOf` / `windowDeadline` / `MAX_ENSURE_SLOTS` / `todayOf` / `shiftDay`。新增 `dueSlot`（取最晚满足 `scheduled_at <= now <= scheduled_at+window` 且无实例行的刻度）、`dispatchNewSlots`（懒建行）、`redispatchPending`（重派/清残留）、`launchAsync`（异步拉起）、`startupDiagnostics`（错过刻度汇总，只记日志）。**`tick()` 保持同步**。 |
| `src/store.ts` | `task_instances` 加 `outputs TEXT` / `tokens INTEGER` 两列（DDL + 旧库 ALTER 迁移）；新增 `task_log` 表 + 索引；`ensureInstance` 改**显式传 id**、去自动事件；新增 `appendLog` / `purgeLog` / `recordCompletion` / `deleteInstance`；`DUMP_TABLES` 加 `task_log`；`dumpTable` 补 `task_log` 排序字段。 |
| `src/reconcile.ts` | 新增 `tokenTotals`（按 `instance.id` 累计，跨重试归同一实例）；`onEvent` 防御性读 `event.usage` 累加；`finishTerminal` 增 `outputs` 参数并 `recordCompletion` 写回产出 + token。 |
| `src/tasks.ts` | 删 `backfill` 字段（与「不补跑」矛盾）；更新 `firstSlotOnDay` 过时注释。 |
| `src/config.ts` | 新增 `logRetentionDays`（默认 30）。 |
| `src/index.ts` | `scheduler.backfill()` → `scheduler.startupDiagnostics()`；`initial` 补 `logRetentionDays`。 |
| `scripts/smoke.mjs` | `[3]`/`[4]` 适配 `ensureInstance` 新签名；`[5]` 整体重写为测「懒建行/不预建/不补跑/预条件只记日志」。 |

### 关键设计点

- **幂等不变**：`UNIQUE(task_id, scheduled_at)` 仍在，`INSERT OR IGNORE` 兜底（同时覆盖主键与唯一索引冲突）。
- **预条件必须在建行之前判**：依赖 / 工作区 / 模型路由三者任一不过 ⇒ `continue`，**不建行**。
  模型路由是唯一异步预条件，故行先同步建为 `dispatched`，异步判定失败时删掉新行（`deleteOnPrecondition`）。
- **`tick()` 必须同步**：否则调用方（`index.ts` / 冒烟）在 `tick()` 后立刻断言会看不到行。
  异步部分只做「拉起会话」，用 fire-and-forget。
- **崩溃残留 `pending`**：窗口内重派，窗口外删行 + 记 `stray_pending`。

---

## 四、踩坑记录（按出错顺序）

1. **`ensureInstance` 改签名后冒烟仍用旧 4 参** ⇒ `status` 变 `undefined` ⇒ SQLite
   「cannot be bound to parameter 5」。旧测试复用同一个 `idA` 当实例 id，新签名下主键冲突 ⇒
   改为每次 `randomUUID()`。**教训：改函数签名必须把所有调用点一次改完（含测试）。**
2. **`z.number().int()` 不存在**（本仓库 zod 版本无 `.int()`）⇒ 改 `.min(1)`。
3. **`readTasksDir` 不是 `tasks.ts` 导出**，是调度器本地函数（我重写时误当 import）⇒ 改为本地实现
   （含 JSONC 注释剥离）。
4. **`HostWorkspaceHandle` 条件类型推导成 `never`** ⇒ 直接 `import type { HostWorkspace } from './host.js'`。
5. **`ConfigDefaults` 的 `Omit` 列表多加 `logRetentionDays`** ⇒ 反而变成「对象字面量多余属性」报错；
   应把它**留在**默认值里（不排除）。
6. **`dumpTable('task_log')` 报 `no such column: key`** ⇒ 排序字段映射只覆盖两表，兜底 `'key'`；补 `task_log`。
7. **`dumpTable` 返回 `{rows,...}` 且需传 `limit`** ⇒ 冒烟里 `dumpTable('task_log')` 少传 limit 且当数组用 ⇒ 改 `(…, 500).rows`。
8. **`getTasks()` 在 `tick()` 前取是空的** ⇒ `taskMap` 只在 tick 内填充，断言顺序要改。
9. **冒烟 [5b] 任务没带 `id`** ⇒ 按决策 30 运行时跳过，根本走不到预条件分支 ⇒ 补 id。
10. **fire-and-forget 未 catch**：测试 `store.close()` 后异步余波调用 `appendLog` ⇒
    「database is not open」未捕获 rejection 崩进程。生产环境插件关闭同理 ⇒ 两处补 `.catch`。

---

## 五、验证

- `npm run build` ✅（host + client）
- `npm run typecheck` ✅（`tsc --noEmit` × 2，无错）
- `npm run smoke` ✅ **75 项通过 / 0 失败**（原 71 项 + 新增 4 项：懒建行、不预建、不补建、预条件只记日志）

---

## 六、遗留（不阻塞）

- **U7 依赖语义边界**未拍板（`latest_success` 无 `freshness` 默认 / 同周期上游多刻度 / 上游失败是否立即断链 / OR 语义 / UI 选上游 / 新鲜度基准）。已进 PROGRESS 未决项。
- **token 用量来源待确认**：`HostSessionEvent` 现仅暴露 `type`，代码对 `event.usage` 做**防御性读取**，
  宿主若不带则 `tokens` 留 `null`（按用户「确认不了先留 null 不阻塞」）。真机抓一次会话事件确认字段后再收紧。
- **真机复测**：本次仅落码 + 冒烟；待用户真机跑 cron 确认「无 `skipped` 洪水、每 5 分钟出一行的确成立」。
