# 插件主界面重建：任务列表视图

> **状态**：🔵 落码完成（2026-09-30），⏳ **真机验证待做**
> **设计提纲**：[`design/main-panel-design.md`](../design/main-panel-design.md)（口径以此为准）
> **范围**：本轮只做任务列表视图。执行记录视图、审计消费面、调试债清理归后续工作包。

---

## 一、背景与拍板

编辑器 UX 第二轮（决策 52）结案后，用户拍板下一个工作包 = **插件主界面**。原主界面是联调期的测试界面
（`src/client/index.ts` 的 `TaskPage`：230 行三元渲染链，自绘 `ul/li` + JSON textarea 逃生口 + 原生 select）。
2026-09-30 两轮讨论定下形态：限宽居中的卡片列表，每张卡片是「鲜活」的一行——状态灯、执行方式、上次、下次、创建于，
右侧三个操作（启用拨片 / 编辑 / 展开），展开就地拉伸显示设置。

**用户最关心的一件事是效率**：「100 条任务每 10 秒各读一次库，这合适吗？」——本包的设计重心因此落在数据方案上。

## 二、效率方案（本包核心）

### 2.1 用户提的两个方案与取舍

| 用户方案 | 结论 |
|---|---|
| 「运行中」放内存，执行完清掉，启动时清空 | ✅ 采纳方向，但**启动时改为用库里 `dispatched/running` 的行重建**——重启后的在飞行是真实孤儿（U1 那个坑），一次扫描几十行；真卡死的由 unknown 宽限收口后自动清除 |
| 把任务配置直接入库，派发时标记状态 | ❌ 不采纳：与决策 25 冲突（`task_defs` 登记表已删），且会把运行态混进用户资产（与「运行态不写回定义 JSON」是同一个问题的反方向） |

### 2.2 最终：三层数据分层，轮询不查库

| 数据 | 变化频率 | 策略 |
|---|---|---|
| 任务定义 | 只有用户保存时变 | 客户端缓存 + `rev` 比对 |
| 运行中 | 高频、易失 | 服务端内存 Map |
| 上次执行时刻 / 成败 | 一天几次 | 内存摘要 + 事件驱动增量更新 |

真正的 SQLite 读只在两处：**启动一次聚合**（`lastRunByTask` + `inFlightByTask`，各一条 SQL）、
**实例终态时 Loop B 顺手更新**（它本来就在写那一行）。

**派生缓存不落库**（用户 2026-09-30 拍板）：丢了从 `task_instances` 重建即可。

## 三、落码清单

| 文件 | 改动 |
|---|---|
| `src/runtime-index.ts`（新） | 进程内运行态索引：`rebuild`（聚合建索引）/ `markDispatched`（Loop A）/ `markTerminal`（Loop B）/ `clearRunning` / `forget` / `overview`（组装 + 过期刻度就地前移 + rev） |
| `src/store.ts` | `lastRunByTask()`、`inFlightByTask()` —— 各一条聚合 SQL，走已有 `idx_instances_slot(task_id, scheduled_at)` |
| `src/scheduler.ts` | `createScheduler` 加可选 `runtime`；`ensureInstance` 成功后 `markDispatched` |
| `src/reconcile.ts` | `ReconcilerDeps` 加可选 `runtime`；`finishTerminal` 里 `markTerminal`；两处 `deleteInstance` 后 `syncRunningAfterDrop`（该任务无在飞行才清） |
| `src/tasks.ts` | 任务定义加 `createdAt?`（首次保存写入，卡片「创建于 X」） |
| `src/index.ts` | 装配 `runtimeIndex`；新增 `GET /tasks/overview`；单条新增时写 `createdAt` |
| `src/client/task-list.tsx`（新） | `useTaskOverview`（10s 轮询 + rev 比对）、`TaskListView`（限宽外壳 / 顶部筛选 / 排序 / FLIP）、`TaskCard`（状态点 / 内容 / 三操作 / 展开四区块）、`cronToHuman` |
| `src/client/index.ts` | config 标签换 `TaskListView`；旧配置界面用 `LEGACY_CONFIG_VIEW` 常量关掉（暂不删） |
| `src/client/locales.ts` | 新增主界面文案键（zh / en 各一组） |

### 接口

`GET /api/task-dispatch-table/tasks/overview?rev=<n>`

- `rev` 未变 ⇒ `{ ok: true, unchanged: true }`（几十字节）。
- 变了 ⇒ `{ ok: true, rev, tasks: [定义投影 + 运行态] }`（含排期原值、附件名、前置任务、提示词首段 120 字）。
- ⚠️ `rev` 只是省流量，**功能不依赖它**：宿主若不透传 query（`req.url` 是否带 query 至今无法离线核实），取不到 rev 就照常返回全量。

## 四、踩坑

1. **并发改同一文件会互相覆盖**：并行对 `src/client/index.ts` 发两次 `replace_in_file`，后一次基于旧快照写入，把前一次的 import 抹掉（scheduler.ts 的 import 同样丢过一次）。⇒ 同一文件多处编辑必须串行。
2. **`: false ? …` 死分支会让 TS 丢掉 narrowing**：旧配置界面块被挪进 `false ?` 后，`data` 收窄失效报 `possibly undefined`、`failed` 报 `string | null`。改成常量 `LEGACY_CONFIG_VIEW`（非字面量条件）后恢复——也顺带避免删块牵出一串只服务于它的状态。
3. **`rebuild` 原来内部取 `Date.now()`** ⇒ 冒烟里「下一刻度」断言拿到的是真机当天日期，测不准。给 `rebuild` 加了可选 `nowMs` 参数（默认 `Date.now()`）让它可以确定性测试。
4. **裸定义没有 zod 默认值**：冒烟的 `def()` 是无 `retry` 的裸对象，`overview` 里 `task.retry.maxAttempts` 直接崩。改为防御取值 `task.retry?.maxAttempts ?? 1`——展示面不能因畸形定义崩。
5. **官方没有列表/卡片件**：P1 核实（primitives 组件清单）确认只有 `Switch` / `Input` / `Menu` / `Pill` / `SegmentedControl` / `Button` / `Tooltip` / `StateDot` / `Modal` / `Toast` 等控件 ⇒ 卡片外壳自绘，控件用官方件。

## 五、验证

- `npx tsc --noEmit`（宿主）+ `npx tsc --noEmit -p tsconfig.client.json`（客户端）：全绿。
- `npm run build`：`dist/` 已重新生成（client 1.69 MB）。
- `npm run smoke`：**275 项全过**，其中新增：
  - [14] `runtime-index` 17 条（聚合取最近一条、在飞行、rev 不变/变化、刻度过期前移、排期变更即时重算、事件维护、投影字段、残留剔除）；
  - [8] 客户端产物 7 条（视图打进 bundle、走 overview 端点、rev 比对、限宽 760/1120、FLIP + 减弱动效、转圈 keyframes、展开区四区块）。

## 六、真机验证清单（待做）

1. 面板打开即出卡片列表：限宽居中（长屏不铺满）、顶部筛选 / 工作区下拉 / 搜索 / 新建。
2. 卡片内容：状态点颜色（绿 / 红 / 灰 / 运行中转圈）、执行方式人话、上次执行（时刻 + 成败）、下次执行（时刻 + 「N 分钟后」且每秒自然递减）、创建于。
3. 排序：运行中在最上；已启用按下次执行升序；已关闭沉底。
4. 生命周期动画：某任务跑完 ⇒ 它沉下去、下一个顶上来（FLIP 位移，不是硬跳）；跑起来时该卡片转圈。
5. 三个操作：拨片即时生效（刷新后仍是新值）、编辑拉起抽屉、展开就地拉伸显示四区块。
6. 效率：控制台看 10 秒一次 `/tasks/overview`，内容未变时响应为 `unchanged`（体积极小）。
7. 新建任务后列表出现新卡片（≤10 秒），并带「创建于 今天」。

## 七、遗留

- 任务简介自动生成（LLM）：本轮**不做**，也未加 `summary` 字段（避免死代码）。接上时务必让它不参与脏判定 / 快照留档 / 提示词版本比较。
- 旧「任务配置」界面（JSON 逃生口 + 只读参数）由 `LEGACY_CONFIG_VIEW = false` 关闭，代码与配套状态待面板收尾（U6）时一并清。
- 执行记录视图、审计消费面：后续工作包。
