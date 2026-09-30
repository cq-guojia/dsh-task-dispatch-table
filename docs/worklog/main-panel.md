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

## 五、同步机制大收敛（2026-09-30，用户报「保存后一直不刷新」）

用户要求「不要改一个东西要在 N 多地方改」。组织了专家团评审 + 观察团验证，结论与落码：

### 5.1 根因（专家团定位）

`rev` 过去只由 `scheduleKeyOf`（排期 + 启停）驱动 ⇒ **改标题 / 提示词 / 附件 / 工作区 / 模型 / 依赖都不 bump** ⇒ 服务端一直回 `{unchanged:true}` ⇒ 界面永不刷新；只有恰好发生派发 / 终态 / 刻度过期时才「顺带」刷一次。加上 `saveEditor` 成功后没有 `refresh()` ⇒ 最长要等 10 秒。

### 5.2 抽象（收敛为两个唯一入口）

| 层 | 唯一入口 | 说明 |
|---|---|---|
| 服务端 | `resyncTaskMap()` = `safeTick()` + `runtimeIndex.markDefinitionsChanged(tasks)` | 4 条写路径（整批 / 单条 / 删除 / 启停）都只调 `onDefinitionsChanged()` → 这一处 |
| 客户端 | `overview.refresh()` | 保存 / 删除 / 启停成功后统一调；在途则记待办补跑 |

指纹分工：`overviewKeyOf`（全展示字段）管 rev；`scheduleKeyOf` 只管是否重算刻度。

### 5.3 观察团抓到的两个漏网（已修）

1. **`saveEditor` 的 refresh 被我的并发编辑覆盖掉了**（同文件并发 `replace` 会互相覆盖，本仓库已第二次踩到）⇒ 补回。
2. **拨片失败时乐观值永久残留**：失败只弹错误不清乐观值 ⇒ 服务端没变、后续一直 unchanged ⇒ 拨片永久停在错状态。改为 `onToggleEnabled` 返回错误文案，列表据此回滚乐观值。

### 5.4 其他（观察团提示，已确认可接受）

- `resyncTaskMap` 会顺带跑一次 tick（可能触发到期刻度落库）——幂等，且符合「保存即生效」的直觉。
- `refresh()` 在轮询在途时曾被吞掉 ⇒ 加 `pendingRef` 补跑。
- `runtimeIndex.forget()` 是死代码（删除走 overview 剪枝）——保留不影响，后续清理时删。

## 六、验证

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

## 八、真机返工轮（2026-09-30，用户逐条 6 点）

用户在真机上逐条提了 6 点，全部落码（冒烟 275 → **295**）：

| # | 用户反馈 | 处置 |
|---|---|---|
| 1 | 上次 / 下次合并成一条太丑，改回**分开** | 一格四段的 `RunPills` 拆回 `PastPill` + `NextPill`（`bb45853` 曾分开、`49f3125` 合并，本轮恢复分开） |
| 2 | 鼠标移到「上次运行 / 下次即将运行」**没有提示** | 根因 = 官方 Tooltip 要给子元素挂 ref，原来子元素是**裸 `LiveText` 函数组件** ⇒ ref 挂不上、**静默失效**。改法：Tooltip 包**整个标签**、子元素是真 `<div>` |
| 3 | 改完任务要等一秒，能不能**通知式**立刻刷新 | 保存 / 拨片本就「改完即重拉」（不等 10 秒轮询），剩下一秒是服务端落盘。本轮加**乐观补行**：保存成功先 `patchRow` 用刚提交的定义补该行，紧接着 `refresh()` 用服务端真值覆盖 |
| 4 | 列表开关与编辑器开关**不一样** | 官方 Switch 选中色是 `brand-primary`（亮色近黑 / 暗色近白）；编辑器早已局部覆盖成 `state-success-primary` 绿。列表补同款覆盖（`.dsh-tdt-tl-switchwrap` 包一层） |
| 5 | 列表「周一…每 10 分钟执行一次」 vs 编辑器「每天每 10 分钟执行一次」 | 根因 = **两处各写了一份实现**（列表 `cronToHuman` 反解 cron / 编辑器 `describeSchedule` 读草稿）。抽象成单一实现 `schedule-text.ts`（见决策 53） |
| 6 | 既然一秒就刷新，右上角刷新按钮没用 | 删除按钮与 `onRefresh` 通道（连同只服务于它的 `manualAt` 状态） |

### 8.1 排期文案单源（本轮最大改动）

- 新增 `src/client/schedule-text.ts`，两步走：
  - **取结构化**：`scheduleSpecFromDraft`（表单草稿）/ `scheduleSpecFromSchedule`（任务定义 `schedule`，**优先吃结构化 `ui`**，老任务退回 cron 反解）⇒ 同一个 `ScheduleSpec`；
  - **出文字**：`scheduleSegments`（片段带 `emphasis` 标记）/ `scheduleText`（纯文本，跑马灯用）/ `renderSchedule`（**支持样式参数** `emphasisStyle`——编辑器「预计执行」的关键片段因此加粗提亮）。
- 删除列表的 `cronToHuman` 与列表自有文案键（`schedEveryMinute…schedOnce`，仅留 `schedCustom` 给认不出的 cron 原样显示）。
- `TaskOverviewRow.schedule` 增加 `ui`（结构化排期），并纳入 `overviewKeyOf` ⇒ 改排期表单必 bump rev、客户端必拿到新数据。
- 老任务（无 `ui`）由 `specFromCron` 反解（分钟 / 小时间隔、每天 / 每周 / 每月 / 单双月 / 每季度 / 每年），认不出的走 `custom`。
- 文案口径**统一采用编辑器「预计执行」的句式**（列表从此对齐，不再有第二套说法）。

### 8.2 验证

- `npm run typecheck`（宿主 + 客户端）+ `npm run build`：全绿。
- `npm run smoke`：**295 项全过**；[8] 客户端产物由 7 条扩到 14 条——两独立标签（且 `RunPills` 已不存在）、Tooltip 子元素是真 `<div>`（正则断言）、排期单源（`cronToHuman` 已不存在）、`ui` 反解、样式参数（`scheduleSegments` + `emphasis`）、开关同款（`switchwrap`）、刷新钮移除、乐观补行（`patchRow` + `rowPatchOf`）。

### 8.3 时间显示补零（同日追加）

用户：「日期和时间的显示，分不够用零补好吗？都把它补成两位。」⇒ 我方自拼的时间串一律两位：

| 位置 | 改前 | 改后 |
|---|---|---|
| 下次执行倒计时（pill） | `5:09`（分钟不补）/ `1:05:09`（小时不补） | `05:09` / `01:05:09` |
| 卡片「创建于」 | `9 月 30 日` | `09 月 30 日` |
| 执行记录时间戳 | `toLocaleString`（补零与分隔符随语言 / 环境变） | 显式拼接 `YYYY-MM-DD HH:mm:ss` |
| 日历标题月 | `2026年9月` / `9/2026` | `2026年09月` / `09/2026` |

冒烟新增 1 条断言（`p(hours)` + `p(d.getSeconds())` 存在、`toLocaleString(` 不存在），共 **296 项全过**。

### 8.4 补跑语义核实（用户提问，已核实**无需改码**）

用户观察：停用任务 15:34 启用时卡片显示「还有 5 分多钟」（15:40），但循环**立刻跑了**；怀疑「4 小时窗口内的刻度都被补跑」。

核实结论（源码级，见 `scheduler.ts` / `state-machine.md` §7）：

- `dueSlot`（`scheduler.ts:170-192`）在窗口内只取**最晚**一个满足 `scheduled_at <= now` 的刻度，且该槽**已有实例行就直接返回 `undefined`**——**不会向更早的刻度回退**；
- 叠加「同任务串行互斥」（`IN_FLIGHT_STATUSES`），任一时刻至多一条在飞 ⇒ **只会补最新那一槽，`15:20` / `15:10` 永远不会被补**；
- 窗口（`window`）的真实作用 = **那一槽可以晚多久才跑**，不是「窗口内全补」。当间隔 < 窗口（本例 10min < 4h）时，窗口实际上不产生任何额外执行。

⇒ 用户担心的「4 小时内全补」不成立；**真正的缺陷是显示**：卡片「下次执行」按 `nextSlotAfter(now)`（严格晚于此刻）算，不体现「马上要补跑的那一槽」，于是出现「显示 15:40、实际立刻跑 15:30」的冲突。已记入 [`PROGRESS.md`](../PROGRESS.md) 未决项 U17 待拍板显示方案。

### 8.5 展示名与图标（同日追加）

- 展示名统一为**「定时任务调度器」**（用户拍板）：`src/client/locales.ts` 的 `title` / `trayLabel` / `panelTitle`（zh 中文名，en `Scheduled task dispatcher`）。此前 UI 仍叫「任务调度表」，与 README / `package.json` description 不一致（用户已在 `3392b4d` 改了后者，本轮补齐 UI 侧）。
- 侧栏 / 面板图标换成用户给的 `assets/icon-scheduler.svg`（左右方括号 + 红方块拼的「S」）：**内联进 client bundle**（`src/client/index.ts` 的 `TaskIcon`）。⚠️ 必须内联——宿主只服务 client bundle，仓库 `assets/` 不会到浏览器；配色沿用原图（品牌蓝 40% + 红），**不走 `currentColor`**（用户给的设计稿配色，要随选中态变色再改）。

**新增 2 条冒烟断言**（展示名 + 图标内联），**298 项全过**。
