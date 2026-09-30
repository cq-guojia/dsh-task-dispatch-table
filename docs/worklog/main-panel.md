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

### 8.6 U17：运行中不跳倒计时（用户拍板，最终方案）

8.4 核实出「真正的缺陷是显示」：卡片按 `nextSlotAfter(now)` 显示下一槽（15:40），但循环会先补跑窗口内最晚、未跑过的那一槽（15:30）⇒ 显示与行为冲突。

- **第一版（Plan A，当日先行落码、随即撤）**：服务端 `runtime-index` 复刻 `dueSlot` 算出「待补跑槽」`dueSlotAt`，卡片显示「补跑 15:30」。用户真机看过之后否掉——「完全不需要判断补跑时间」。
- **最终方案（用户 2026-09-30 拍板）**：根本不用管补跑——**只要任务在跑，就不再跳倒计时**。`NextPill` 增加 `row.running` 分支：运行中改显「**三个小方块依次脉动**」的活动指示（用户描述：像手机充电那种感觉），跑完（`running` 翻转）才自动回到「下一槽倒计时」——下一槽本就该等这趟跑完再算。
- 撤销：Plan A 的 `dueSlotAt` / `computeDueSlotAt` / `listNextCatchupPrefix` / `listNextCatchupTitle` **全部删除**（不留死代码）。
- 冒烟：删 3 条（U17 待补槽）+ 加 1 条（运行中活动指示），**299 项全过**；typecheck + build 绿。

> ⚠️ 调度语义未动：仍只补窗口内最晚一槽（8.4 结论），8.6 只改「运行中怎么显示」。

## 九、专家团复核轮（2026-09-30）：真机 bug 修复 + 既有逻辑全量复核

用户要求：修完真机 bug 后，**组一个专家团把此前逻辑再核一遍**（① 逻辑该有的有没有 ② 有无硬伤 ③ 有无垃圾代码 ④ 该抽象的有没有抽象），提出问题就改、改完复核、直到没问题。

### 9.1 用户真机 bug（已修）

| 反馈 | 根因 | 处置 |
|---|---|---|
| 无执行计划时显示 `--:--` | 占位常量 | `TaskListView` 的 `NO_TIME` 改 `--`（停用 / 从未执行都对齐） |
| 「选工作区文件」报 `任务定义不合法（attachments.0: 附件 ref 非法…）` | 选择器把**绝对路径**当 link 附件 `ref` 存；而宿主 zod（`tasks.ts:96`）/ `data-model §一`/ `reconcile.ts:43` 三处都要求**工作区相对**路径 ⇒ 保存必被 422 拒 | `FileBrowser` 选择器 `onPick` 改为回传**工作区相对**路径（`relativizeToRoot`）；另加**客户端兜底校验**（`validateTaskDraft` 新增 `attachments` 字段、附件卡描红）+ `humanizeTaskError` 把该机器码翻人话 |
| 「报了错没有红框、文案看不懂」 | 该错误只在服务端 422 才出现，而客户端校验不覆盖附件 ⇒ 只有一条 Toast、无字段定位 | 同上（归属附件卡描红 + 人话） |

### 9.2 专家团复核发现并**已修**

三人组分工：① 主界面运行态（runtime-index + task-list）② 排期与附件链路 ③ 死代码与抽象。

**硬伤（按严重度）**
- **`scheduleCron` 的 interval 档忽略 `intervalUnit`** ⇒ 选「每 2 小时」实际按**每 2 分钟**跑（文案却写「每 2 小时」）。本轮最严重。
- 允许延迟下拉的 `P1D` **不符合宿主 `isoDuration`**（只认 `PT…H/M/S`）⇒ 选「1 天」保存 422 + 机器码文案。改 `PT24H`。
- **编辑保存抹掉「表单不管理」的字段**：`createdAt`（卡片「创建于」消失）、`schedule.timezone`（执行时刻整体偏移）、`target.manual`、自定义 cron 降级时的 `start`/`everyNWeeks`（每 N 周退化成每周）。修法：服务端更新时从原定义**保留**（新增 `readDefinitionOf`，在 `{...def}` 之后补齐）。
- **`schedule-text.ts` 反解三处说反话**：星期区间 `1-5` 被静默滤空 ⇒ 文案「还没选生效日」（实际周一到周五都跑）；月份位被忽略 ⇒ `0 9 * 6 *`（仅 6 月）误称「每天」；`* 9 * * *`（9 点内每分钟）误称「每分钟执行一次」。修：非「纯数字逗号列表」的星期位整体降级 custom；间隔 / 每天 / 每周档要求「日 + 月」都不限定；分钟间隔档要求「小时不限定」；`dow=*` 视为**每天**（不再是「没选生效日」）。
- **`scheduleFromCron` 的分钟间隔硬要 `dow === '*'`** ⇒ 编辑器新产出的带星期位 `*/N * * * 1,2,…`（没有 `ui` 的老定义）反解失败、降级成自定义 cron，与列表文案打架。修：支持星期位。
- **`PastPill` 把非 `succeeded` 一律染红**（含 `skipped`/`unknown`），与状态条把二者当正常的口径打架；改后**图标前景色错配**（白图标压浅灰几乎不可见）。均已修（只 `failed` 红；前景跟随底色）。
- **`relativeFuture`/`countdownText` 无 NaN 兜底** ⇒ 畸形 ISO 渲染出「NaN 年后」/`NaN:NaN`。已加兜底。
- **`subscribeTicker` 的 `visibilitychange` 监听每次订阅起停都注册且从不移除** ⇒ 反复重挂面板累积泄漏。改为只注册一次。
- **`useFlip` 的 `callbacks`/`prevTop` 两张 Map 卸载不清理** ⇒ 无界增长 + id 复用错位动画。已清。
- **列表拨片失败不撤乐观值** ⇒ 服务端没变也不 bump rev ⇒ 开关永久停在与服务端相反的位置。已撤。
- **`humanizeTaskError` 的 `title` 分支写成 `.title`**（宿主路径是 `title`）永不命中。已修，并补 `ISO 8601`/`schedule.cron` 兜底。
- **smoke 两条空转断言**（断的标识根本不存在 ⇒ 恒真）+ 一条依赖产物字面量。已清理。

**垃圾代码（本轮删）**：`task-editor.tsx` 的 `describeSchedule`（死函数，全仓无引用，产物里已被 tree-shake）+ 随之失效的 `scheduleText` 导入。

### 9.3 复核发现但**本轮未做**（待办，避免遗忘）

- **死 locale 键**（有定义无使用）：`listFilterWorkspace` `listLastPrefix` `listNextPrefix` `listStatusOk` `listStatusFailed` `listAgoOk` `listAgoFailed`；`editorSchedMonthly` `editorSchedNoDay` `editorStartTime` `editorSaved` `editorSaveFailedHint` `editorUnavailable` `editorSource` `editorSourceInline` `editorSourceManual` `editorSourceUpload` `editorManualPath` `editorManualHint` `editorPickFile` `editorUploadHint` `editorUploadWarn` `editorAttachmentAddHint` `editorRestore` `editorSnapshots`；`debugRefresh` `debugButton` `debugTitle` `debugAutoHint` `debugEventsEmpty`。
- **死 CSS 类**（`task-editor-css.ts`）：`.dsh-tdt-ed-tab`（含 hover/aria）、`.dsh-tdt-ed-tabs`（现只当 id 用）、`.dsh-tdt-ed-warn`、`.dsh-tdt-ed-ver-time`、`.dsh-tdt-ed-drop`、`.dsh-tdt-ed-mono`、`.dsh-tdt-ed-json`。
- **死字段 / 导出**：`TaskOverviewRow.provider`（两侧投影 + `rowPatchOf` 三处写，卡片从不渲染）；`runtime-index.revision()` / `forget()`（全仓无引用）；`LiveText.title` prop；`TaskRuntimeEntry` / `ED_STYLE_ID` / `TASK_EDITOR_CSS` 的 `export`；`schedule-text.ts` 一批内部类型 `export`。
- **抽象缺失（同逻辑多份）**：**cron → 结构化仍两份**（`schedule-text.ts specFromCron` vs `task-editor.tsx scheduleFromCron`，本轮各修各的、未合并）；主题 token `C` ×3 + `monoFont` ×2 + `transition` ×3；`pad2` ×8；`formatFull` / `formatTime` / `formatVersionTime` 三份；附件 ref 合法性三份（宿主 zod / 客户端 / `task-assets`）；「问号 Tooltip 按钮」JSX ×5；`<style>` 幂等注入样板 ×4。
- **`markTerminal` 无条件清 `running` + 覆盖 `last*`**：重启孤儿（`unknown` 收口）与新实例并存时，可能把**新实例**的 `running` 清掉、`last*` 倒退。应按 `scheduledAt` 比较后再写。
- **`rev` 无条件 `++`**：`markDispatched` / `markTerminal` 值没变也 ++（10s 轮询下影响小，但是「省流」设计的裂缝）。
- **乐观更新两套并存**：`TaskListView.optimistic`（map，含未用的回滚）vs `useTaskOverview.patchRow`（无回滚），语义重名。
- **写入路径 rev 兜底**：`resyncTaskMap` 未就绪时写路径不 bump rev（同型历史 bug 风险，`runtime-index.ts` 头注释记载过的那类）。

### 9.4 验证

- `npm run typecheck`（宿主 + 客户端）+ `npm run build`：全绿。
- `npm run smoke`：**300 项全过**（含本轮新增的附件 ref 修复 / 占位符断言；删掉 1 条空转断言）。
- 复核轮：专家团对着「本轮修复清单」逐条核对，确认第 1、4 条各有一处**残留**（已当场再修：`* 9 * * *` 仍误判 / 分钟间隔带星期位反解失败），第 5 条有一处**副作用**（图标前景色），三条均已修复并复跑绿。

## 十、任务展开区 UI 改版（2026-09-30，用户：「太丑了」）

- **症状**：展开区是一句 `·` 串联的长文本——`执行设置：「排期：xx · 工作区：xx · 模型：xx · 重试：1 · 延迟：PT4H」`，四个区块（执行设置 / 附加文件 / 前置任务 / 提示词）都是同样一坨；窗口一窄就折行，读不出字段边界与层次。
- **改法**（只改展示，不加功能）：执行设置改成**标签 / 值两栏**——新增 `InfoRow`（左 = 定宽 64px 淡色标签，右 = 自适应正文、`break-word` 换行），逐字段成行；区块之间靠小组标题 + 间距分层；提示词保持独立换行（`pre-wrap`）；右下「编辑」与上文隔一条虚线。
- **验证**：冒烟 +1（`InfoRow` + `infoLabelStyle`），**301 全过**；typecheck + build 绿。
- ⏳ 这是第一版；继续打磨方向（待用户真机看效果再定）：附加文件 / 前置任务改成逐条 chip、标签列宽随内容自适应、运行中状态在展开区给一句人话进度。

## 十一、9.3 落地：死码清理 + 抽象收敛（2026-09-30）

### 11.1 死码清理（全部删净）

| 类别 | 明细 | 核对方式 |
|---|---|---|
| 死 locale 键 | **30 个**（zh + en 共 60 行 + 联合类型 18 行）：列表遗留 7、编辑器遗留 16、调试面板 5、`editorSnapshots` | 脚本删 + **tsc 兜底**（删错会被 `t('key')` 类型检查抓住，实际零误删） |
| 死 CSS 类 | `.dsh-tdt-ed-tab`（含 hover/aria）、`.dsh-tdt-ed-tabs`（只剩当 id 用）、`.dsh-tdt-ed-warn`、`.dsh-tdt-ed-ver-time`、`.dsh-tdt-ed-drop`、`.dsh-tdt-ed-mono`、`.dsh-tdt-ed-json`，共 **11 行** | **先逐个 grep 确认零引用再删**（CSS 不受 tsc 保护） |
| 死字段 / 导出 | `TaskOverviewRow.provider`（两侧投影 + `rowPatchOf`）；`runtime-index.forget()`；`LiveText.title` prop | grep 确认 + tsc |
| 随迁 | `isoDow`（cron 0=周日⇒7 的换算，随旧解析器内聚进 `schedule-text`） | — |

⚠️ 9.3 记的 `runtime-index.revision()` **没删**——复核时发现 `smoke.mjs` 在用（上一轮评审漏了这一处），保留。

### 11.2 抽象收敛（4 组落到单一实现）

| 收敛项 | 此前 | 现在 |
|---|---|---|
| **cron → 结构化**（最关键） | `schedule-text.specFromCron`（列表文案）与 `task-editor.scheduleFromCron`（编辑器表单反解）**两份、严格度还不一致** —— 同一个 cron 两处说法不一样，修 bug 得两边分别修 | 唯一实现 = `scheduleSpecFromCron`（`schedule-text.ts`）；编辑器只剩 **spec → 表单字段映射**（`scheduleFromCron`），`isoDow` 随迁。此前「列表说 `1-5` 是每天、编辑器却降级自定义」那类打架从此不可能 |
| **附件 ref 合法性** | **4 份且各有出入**：宿主 zod（拒 `..`/绝对/反斜杠）、客户端保存前校验（多查开头 `\`）、真删防御（没查开头 `\`）、上传定位（连反斜杠都没查） | `attachment-allowlist.isSafeAttachmentRef` **唯一实现，4 处调用**。这正是「选工作区文件报 422」那类漂移 bug 的温床 |
| **补零 / 时间串** | `padStart(2,'0')` 散在 6 处；`YYYY-MM-DD HH:mm[:ss]` 手拼 3 份（有无秒、失败回退 `'—'` 还是原串，口径各差一点） | 新增 [`client/format.ts`](../../src/client/format.ts)：`pad2` + `formatDateTime(iso, { seconds?, fallback? })`，3 处时间串全部改走它 |
| **「?」说明钮** | 同一段 JSX 写了 5 份，每份还得配一段「图标必须包真 DOM」的注释提醒 | `HelpButton` 组件（含 `insideClickable` 处理可点行内的冒泡），**坑固化在一处** |

### 11.3 验证

- `npm run typecheck`（宿主 + 客户端）+ `npm run build`：全绿。
- `npm run smoke`：**301 项全过**（1 条断言原绑死旧局部变量名 `p(hours)`，改为断共用 `pad2`/`formatDateTime`）。
- 收敛核对：`pad2` / `formatDateTime` / `isSafeAttachmentRef` / cron 反解 各 **1 处定义**；`HelpButton` 1 定义 5 使用；残留 `padStart(2,'0')` 仅 2 处（`format.ts` 自身 + `mirror/message-chrome.ts`）。

### 11.4 本轮**未做**（记录理由，避免「以为做了」）

- **主题 token `C` ×3**（`editor-fields` / `task-list` / `index` 各一份，键名还不一致：`textFaint` vs `textTertiary`）：合并是纯视觉改动、**键名映射错一处就是一屏配色回归**，且我这边没有真机可验 ⇒ 留给真机验证后单独做。
- **`<style>` 幂等注入样板 ×4**：纯样板、收益小；等下次碰这几个文件时顺手收。
- **`mirror/message-chrome.ts` 的 `pad2`**：不在主 client 打包路径上，暂不动。

## 十二、真机反馈第二轮（2026-09-30，5 项：本轮做 4 项，第 5 项先出方案）

| # | 反馈 | 结论 | 处置 |
|---|---|---|---|
| 1 | 「创建于 X」出现后又消失 | **真 bug**：编辑保存丢 `createdAt`（`draftToDefinitionJson` 不产出、服务端旧逻辑只在新建时补） | 服务端早已在 §九 修（更新时从原定义保留）；本轮再加**客户端透传**做双保险——草稿带 `createdAt`（`definitionToDraft` 反解 → `draftToDefinitionJson` 写回） |
| 2 | 间隔任务按**整点**跑，不是从「开始时间」起算 | **确认属实**：`scheduledSlotsFor` 把 cron 交给 cron-parser ⇒ `*&#47;10` 天然是 :00/:10…；`start` 在 `filterSlotsBySchedule` 里**只当下界**、不作相位锚点 | 新增 `intervalSpecOf` + `anchoredIntervalSlots`：**间隔型刻度 = 锚点（任务开始时间）+ k×步长**；锚点缺失（老数据/手写）退回 cron 对齐（不猜）；星期位照旧过滤。⚠️ **比用户预期更早生效**：只要定义里有 `start`（编辑器保存的间隔任务都有），改完**立即**按锚点跑，不必逐个重存；真没有 `start` 的老任务重存一次即补上 |
| 3 | 间隔档文案「每天每 10 分钟执行一次」 | **文案问题，内容没错**（该任务就是 7 天全选） | 全选 7 天时**不写「每天」**（间隔本身含连续义）⇒「每 10 分钟执行一次」；限定星期（子集）仍写星期；未选仍提示「还没选生效日」 |
| 4 | 回执话术：首轮不回执，追问第二次才交 | **确认**：回执段排在消息**最后**（prompt→手册→依赖→团队→权限→回执），且 `receiptInstruction` 无任何「高于任务指令」的措辞 ⇒ 任务指令写着「不要做任何其他操作」时被一并跳过 | 回执段**置顶**（只放最前，不首尾各放）；加「最高优先级·必做」「**高于任务指令本身**」「即使没有产出也**必须**交回执」；举例用**通用说法**（「不要做任何其他操作」「只做某件事」「什么都不用做」），不写用户那句误输的任务指令 |
| 6 | 「重置」按钮一进编辑器就显示 | 确认（未接脏判定） | 复用**已有**的 `dirty`（= 关闭确认那份）：改过才渲染 ⇒ 重置后草稿回到初始、按钮自动消失，语义自洽 |
| 5 | 排序抖动（任务到点后先往后挪、再砰地跳回最前） | 机制确认（「刻度已到、尚未落库/标运行」的窗口里 `nextSlotAt` 已前移到下一槽 ⇒ 组内排序变后；`running` 翻转后跳回组 0） | **本轮不动**，先出方案（见下一轮 §十三） |

### 12.1 验证

- `npm run typecheck`（宿主 + 客户端）+ `npm run build`：全绿。
- `npm run smoke`：**307 项全过**（+6：间隔锚点 5 条——分钟档/小时档/下界/星期位/缺锚点回退；回执置顶与优先级措辞 1 条）。

## 十三、排序抖动：机制与方案（2026-09-30，用户拍板 → **已落码**）

### 13.1 机制（已核实，三方独立复核一致）

- 卡片排序只看服务端给的两个字段：`running` 与 `nextSlotAt`（`task-list.tsx` `sortRows`/`groupOf`：运行中 = 组 0 最上；已启用 = 组 1，按 `nextSlotAt` 升序）。
- `nextSlotAt` 是**懒更新**：只在客户端来拉列表时，服务端才发现「这个刻度过期了」并前移到下一槽（`runtime-index.ts` 的「刻度过期就地前移」，`Date.parse(nextSlotAt) <= now`)。
- `running` 要等**调度器下一轮巡检**把任务真的落库（Loop A `ensureInstance` + `markDispatched`）才翻 true（`scheduler.ts`）。巡检间隔 `tickMs` 默认 **60 秒**（`config.ts`），客户端轮询 **10 秒**（`task-list.tsx`）。
- ⇒ 中间必有一段缝：**时间已前移到未来、但还没标成运行中** ⇒ 该卡在组 1 里键变大、排到后面；等 `running` 翻转 ⇒ 跳回组 0。窗口最长 ≈ `tickMs + POLL_MS`；两次位移之间至少隔一个轮询周期（因为中间几轮拿到 `unchanged` 不重渲染）。
  - ⚠️ 待现场核对：用户描述「一两秒内」变两次，与「至少隔一个轮询周期」不符 —— 若真如此，说明中间还有一次**立即轮询**（挂载/`refresh()`，均为用户动作），不是同一条链。无论如何下面方案都能盖住。
- 附带两个相邻的既存小坑（**不混进本次改动**）：① `pending` 行会冒充「上次执行」（`store.lastRunByTask` 只排除 `dispatched`/`running`，而重试回退会写 `pending`）⇒ 卡片亮绿灯；② `overview` 的「过期即前移」**不是 bug**，是「下次执行」显示正确的前提，别当抖动根因去改。

### 13.2 方案（推荐：客户端「到点钳位」，仅动排序一处小逻辑）

记住每条任务**上一版的 `nextSlotAt`**；当新一轮数据里变成未来值、而上一版那个时刻已经过去 ⇒ 判定「它刚好到点」⇒ 把它在**组 1 内部**排到最前并**钉住**，直到 `running` 翻转（或超时兜底 `tickMs + 2×POLL_MS`，约 80–90s）。

三条红线（保证不引入新问题）：
1. **不新增状态 / 文案**：不做「启动中」新档、不复用绿色脉动 ⇒ 卡片外观零变化；
2. **不改「下次执行」时间显示** ⇒ 时间仍准确；
3. **不提进组 0** ⇒ 真正在跑的卡不会被顶下去。

配套两点：
- 接口回包加一个**只读的 `now`（服务端当前时间）**：判断「上一版时刻是否已过去」以服务端为准，避开客户端时钟与宿主的时差误判（改动极小）。
- 把「排序键计算」抽成**可导出的纯函数**并补冒烟断言 —— 现在排序零断言，只能 grep 产物字符串，太弱。

### 13.3 明确否掉的替代方案（及理由）

| 方案 | 为什么不做 |
|---|---|
| 服务端标「到期未落库」并让客户端当「运行中」（= 重做 §8.6 撤掉的 `dueSlotAt`） | ① 重蹈用户已否掉的「判断补跑时间」；② 判定「有没有实例行」要查库 ⇒ 砸掉「轮询不查库」基线；③ **上游停用 / 附件缺失 / 被串行互斥挡住**的任务永远不会派发，会被**永久**当成「在跑」，与真在跑的长得一样（最坏的一种骗人） |
| 只调快巡检 / 轮询（`tickMs` 60s→几秒） | 每轮重读任务表 + 每任务查一次库，开销涨几十倍；且**治不了根**（到点后总要等下一轮） |
| 冻结排序 | 会把「跑完沉下去、下一个顶上来」这个已认可的动画一起冻掉；新建任务不出现；被卡任务无解冻终点 |
| 改 `nextSlotAt` 语义（到期未派发不前移） | 用**错误的时间信息**换正确的位置：被卡任务会永久停在过期时刻并显示「即将执行」 |

### 13.4 影响面（答「会不会有什么影响」）

- 只影响「已启用」组内的先后；不碰筛选 / 搜索 / 启停 / 编辑重排 / 倒计时显示 / 状态灯。
- 需要一小段客户端状态（按 id 记上一版时间 + 钉住时限），释放条件：`running` 翻转 / 被停用 / 超时。风险点在于「客户端自维护状态」是本仓库踩过坑的地方（乐观更新那两处），故必须配纯函数 + 冒烟断言。
- **不根治的边界（如实说明）**：到点却**永远不会被派发**的任务，会停在「已到点、还没跑」的位置（本就是它该在的位置），**不会**变成假的「运行中」。

### 13.5 落码实现（用户 2026-09-30 确认「按这个调」）

- 新增 [`src/task-sort.ts`](../../src/task-sort.ts)（**共享模块，刻意放 `src/` 而非 `src/client/`**）：`groupOf` / `sortKeyOf` / `sortRows` / `justCrossedSlot` / `pinMsFor` —— 这样冒烟（Node 直引 `dist/`）能**真断言**排序与钳位，而不是只能 grep client 产物（此前排序零断言）。客户端 `task-list.tsx` 改为 import 它（本地实现删除）。
- **判定**：`justCrossedSlot(上一版 nextSlotAt, 这一版 nextSlotAt, 服务端 now)` ⇒ 「上一版已过去、这一版在未来」= 刚跨过自己的刻度 ⇒ 钉住。
- **时长**：`pinMsFor(tickMs, POLL_MS)` = **巡检间隔 + 2×轮询**（默认 60s ⇒ 80s），带 30s ~ 10min 上下限 —— **跟着巡检间隔走、不写死 60 秒**（用户确认的点①）。
- `GET /tasks/overview` 回包新增**只读** `now`（服务端当前时间：判定「上一版刻度是否已过去」以它为准，躲开客户端时钟与宿主的时差）与 `tickMs`（钳位时长依据）。二者都不参与调度。
- **释放条件齐备**：`running` 翻转 / 被停用 / 无刻度 ⇒ 立即解除；超时 ⇒ 下一轮轮询解除；任务被删 ⇒ 清残留。钳位集合**只在真变化时 setState**（避免无谓重排与 FLIP）。
- **三条红线守住**：不加状态 / 文案（缓冲期仍显示「下次执行」倒计时，卡片外观零变化）；不改时间显示；**不提进「运行中」组**（只在「已启用」组内排到最前）。

### 13.6 验证

- `npm run typecheck`（宿主 + 客户端）+ `npm run build`：全绿。
- `npm run smoke`：**315 项全过**（+8，集中在 `[1b]`）：分组四级；**不钳位时 A 排到 B 之后（复现抖动）→ 钳位后 A 钉在组内最前（抖动消失）**；钳位不越过「运行中」组；到点判定三种边界；钳位时长随 `tickMs` 变化 + 上下限；排序键哨兵。

## 十四、专家团复核第二轮（2026-09-30）：三人组分工 + 复核对账

### 14.1 分工

| 组 | 范围 |
|---|---|
| ① 主界面运行态与排序 | `runtime-index.ts`、`task-list.tsx`（轮询/乐观更新/到点钳位/排序/心跳）、`task-sort.ts`、overview 路由 |
| ② 排期 / 锚点 / 附件链路 | `tasks.ts`（含锚点三件套 + schema）、`scheduler.dueSlot`、`schedule-text.ts`、`task-editor` 反解与校验、`attachment-allowlist`、保存路由的字段保留 |
| ③ 跨文件死码与不实断言 | 全仓死导出 / 死函数 / 无引用 locale 键 / 无引用 CSS 类 / 重复实现 / **smoke 假绿**（逐条到 dist 产物核对字符串） |

### 14.2 本轮**已修**

| 问题 | 性质 | 处置 |
|---|---|---|
| **到点钳位在 `unchanged` 轮永不解开** | 硬伤（上一轮我引入） | 到期判定原写在 `unchanged` 提前 `return` **之后** ⇒ 「到点却永不被派发」的任务被**永久**钉在组 1 最前。改为**本地时钟期限** + **每轮（含 unchanged）都扫** |
| **间隔档反解用编造的 `09:00` 覆盖真实锚点** | 硬伤 | `definitionToDraft` 已从 `start` 取到 `18:03`，随后被 `spec.time` 覆盖 ⇒ 保存写回 `T09:00`，用户设的「18:03 起每 10 分钟」当场作废（等于上一轮的锚点功能白做）。改为只有 `periodic` 才套用 cron 时分 |
| `justCrossedSlot` 无时效上限 | 边界 | `once` 的过期槽（`nextSlotAfter` 对它恒返回那个过去时刻）被改成 cron 时会误钉一次 ⇒ 加 `maxAgeMs`（调用点传 `2×pinMs`） |
| 小时间隔反解与执行器**不同口径** | 文案说错 + 再保存静默改时刻 | `*/5 */2 * * *` 被说成「每 2 小时」（实际「偶数小时里每 5 分钟」）、`0-30 * * * *` 被说成「每小时执行一次」（实际每小时 30 次）。改为与 `tasks.intervalSpecOf` **同口径**（分钟位必须是具体数字；整点才等价「每隔 1 小时」） |
| 间隔档空星期**说反话** | 文案 | 空数组曾一律追加「还没选生效日」，而 `scheduleCron` 对空数组产出 `*` = **每天都跑** ⇒ 空 / 全选都不再追加那句 |
| `check('旧库打开不抛错…', true)` | **假绿** | 第二个参数是字面 `true`，恒真、什么都没证明 ⇒ 改为真跑一次构造 |
| `"full"` 零鉴别力合取项 | 弱断言 | 产物里 `full` 大量来自第三方代码 ⇒ 去掉该项（保留三个真键） |
| `RefreshIcon` 死函数 | 死码 | 全仓零引用 ⇒ 删 |
| `setOptimistic({})` 每轮塞新对象 | 无谓重渲染 | 空时返回**同一引用**让 React bail out |

### 14.3 ⚠️ 协作事故（必须记）：两处编辑被**静默丢弃**

- 本轮我把**同一文件的多处替换放进同一条消息**批量提交，后一处基于**旧快照**把前一处的改动**覆盖掉了**：`task-list.tsx` 的 `unchanged` 分支、`schedule-text.ts` 的小时守卫**都没落盘**，而工具回执显示"成功"。构建、冒烟、提交全部照常通过 —— 因为我当时把 `git add` 也一起做了。
- **是复核对账轮抓出来的**：它同时核了源码与 `dist`，指出「注释写着必须每轮都跑，代码里却仍在提前 return」的自相矛盾。这正是"改完必须复核"的价值。
- 处置：重新**逐条**应用 + 每次改完**立即 grep 取证**；并补两条产物断言钉住这两处（此前它们**没有任何断言覆盖**，丢了也没人知道）。
- **写进流程**：同一文件的多处改动一律**串行**、改完立刻核验，不并行批量；涉及客户端内部逻辑的改动，必须同时在冒烟里留一条断言。

### 14.4 已发现但**本轮未做**（待办，按优先级）

**P1（会影响行为 / 数据）**
- 整批 JSON 通道（`POST { tasksInline }`）**完全没走 zod 校验** ⇒ 坏定义可 200 进权威表；且该通道**永不写 `createdAt`**。
- 更新是**整行替换**（`{...definition, id}`）⇒ 非 schema 字段（用户自定义的）编辑一次即丢（与我刚修的 createdAt/timezone/manual 同型）。
- `everyNWeeks` 用**毫秒除法**算周序号，DST 下会整周跳刻度；且无 `start` 时参考点 `slots[0]` 随窗口滑动 ⇒ 相位抖动（时跑时不跑）。
- `once` 的时区解释两处不一致（`scheduler` 用宿主本地、`tasks.onceScheduledAt` 用 `schedule.timezone`）。
- `nextSlotAfter` 的 `cap = 2000` 对「每分钟 + 限定单星期」的锚点任务不够 ⇒ 卡片可能长期显示「无执行计划」。
- `markTerminal` 无条件清 `running` + 覆盖 `last*`（重启孤儿与新实例并存时可能倒退）——§9.3 已记，仍未做。

**P2（i18n / 清理）**
- 状态条 tooltip 硬编码中文（'已关闭' / '最近一次执行失败' / '计划运行中'）、`dateOf` 写死「月 / 日」⇒ 英文界面出中文。
- 15 个**无引用 locale 键** + 一批「只被不可达分支引用」的键；`LEGACY_CONFIG_VIEW = false` 导致整个旧「任务配置」页分支（~120 行）、`save()` 链路、`displayParam` / `scheduleSummary` 全是死码。
- `t(\`editorMonthMode_${spec.monthMode}\` as LocaleKey)` 无白名单 ⇒ 非法值拿到空文案。

**P3（抽象收敛）**
- 间隔档「正解 / 反解」仍是两套（`tasks.intervalSpecOf` vs `schedule-text`）——本轮只是把口径**对齐**，没抽成一张形态表。
- 主题 token `C` 六份、`pad2` 两份（`format.ts` + `mirror`）、cron 字段切分三处、`[编号] 名称` 两处 + 三个语义重复的「已停用」键。
- `runtime-index` 的「比指纹 → `rev++`」三处重复（`rebuild` / `markDefinitionsChanged` / `overview`），漏改一处就是历史上那个 rev 不刷新的老 bug 复发。
- 死字段 `TaskRuntimeEntry.taskId`（只写不读）；`revision()` 仓内仅冒烟用（建议在导出处标注）。

### 14.5 验证

- `npm run typecheck`（宿主 + 客户端）+ `npm run build`：全绿。
- `npm run smoke`：**317 → 319**（+2：钉住上面两处**曾被静默丢弃**的逻辑——`prunePins` 出现 ≥3 处、小时间隔守卫两个判定串）。

## 十五、未执行可见化：排查过程与 P1 落码（2026-09-30）

### 15.1 真机两条症状

1. **设定 18:44 的任务「完全不执行」，执行记录里一条都没有**（用户原话：「那条记录根本就没有写进去」）。
2. **到点后卡片位置不动**：明明」还有 9 分多钟到下一槽，却一直压在第一；用户实测**停了 5 分多钟**仍不动，而**倒计时一直在跳**。

### 15.2 查到的事实（每条都有代码证据）

| # | 事实 | 证据 |
|---|---|---|
| A | **附件路径「写」「读」不同基准**（症状 1 的根因）：写侧落盘 `<任务目录>/attachments/<名>` 并把 ref 记成 `attachments/<名>`；读侧 `attachmentAbsPath` 却把前缀剥掉 ⇒ 找 `<任务目录>/<名>`。同一文件里「已在任务目录」判断用的是**正确基准** ⇒ 自相矛盾 | `task-assets.ts:261/273/288` vs `:359-363` |
| B | 该函数被**两个调用点**共用（Loop A 建行前校验、Loop B 发动前兜底） ⇒ **任何带 upload 附件的任务恒判缺失**；Loop A 的 `continue` 发生在 `ensureInstance` **之前** ⇒ **连实例行都不建** | `scheduler.ts:231/315-328`、`reconcile.ts:38/372-392` |
| C | `dispatch.ts` **全文无附件注入** ⇒ 即使修好路径，模型也收不到附件 | `dispatch.ts`（grep 0 命中） |
| D | `fetch` **无超时** + `busyRef` 卡死 ⇒ 后续轮询全早退 ⇒ 客户端的到期清理再也不跑 ⇒ **钳位永不解开**（倒计时是独立 1 秒心跳，故照跳）；同款问题还有 2 秒通道与保存通道 | `task-list.tsx:188-193/189/227`、`client/index.ts:1514/1519` |
| E | 「9 分多钟却排第一」= 钳位时长 `min(10min, max(30s, tickMs + 2×轮询))`＝默认 **80 秒**（用户确认 `tickMs` 是默认） ⇒ 5 分钟不可能是它 ⇒ 只能是 D | `task-sort.ts:85-88`、`task-list.tsx:215` |
| F | `judgeDependencies` 的 `latest_success` 取上游**最近一条（不分状态）**，无行时会拿到**更早的旧成功**并放行 ⇒ 下游吃脏数据（用户直觉正确，且写记录反而修了它） | `scheduler.ts:145-149`、`store.ts:704-708` |
| G | 任务编辑器的「执行记录」是**占位**；面板执行记录页只有按钮 ⇒ 今天实例行只能在**调试页**看到 | `task-editor.tsx:1930-1931`、`client/index.ts:968-971` |
| H | `missed_slot` 在文档里被写成「已实现」，源码里**没有任何写入点** | `docs/design/data-model.md:84`、`state-machine.md:105` |

### 15.3 用户拍板口径

→ 见**决策 54**（三类状态分层 / 到点 loading / 延期徽标 / 排序删钳位 / 「被吃掉的槽」每阻塞段补记一条 `skipped` / 下游硬阻塞接受 / 附件两个 bug 必修 / 排期约束）。

### 15.4 本次落码（P1：附件两个 bug）

- `task-assets.ts`：`attachmentAbsPath` 改为**直接按任务目录拼接**（修「读」不修「写」⇒ **原任务无需重传附件**）；顺带删掉 `locateUploaded` 里那个基准错误的**永不命中假候选**。
- `dispatch.ts`：新增随附文件段（`DispatchAttachment` + `attachmentLines`），`buildMessage` 多一个可选参数；逐条注入**绝对路径** + 来源标注（上传 / 工作区），解析不出时如实标注「基准工作区未知」；**有附件且带权限指令时显式豁免「仅工作区内」**（只放开读）。
- `reconcile.ts`：发动前把快照里的附件 ref 解析成绝对路径（link 按来源工作区、upload 按任务目录，与存在性校验同款口径）并随派发注入；`DispatchInput` 增 `attachments`。
- **冒烟 +6**（319 → **325**）：① 附件**写 → 读往返**（`moveAttachmentsIn` 落定后 `attachmentAbsPath` 必须解析回真实路径且文件存在——**当时缺的正是这条断言**）；② 随附文件段注入绝对路径 + 来源标注；③ 基准未知时如实标注；④ 无附件不注入；⑤ 权限豁免文案。

### 15.5 本轮其它落码（P2a + P4 核心 + P4 显示）

- **P2a 轮询活性**（`15c0815`）：overview 请求加 `AbortController` + 8s 超时（< 10s 轮询间隔）、`finally` 清定时器、poll 开头加看门狗（超过 3×轮询强制放行）⇒ 「卡片 5 分钟不动而倒计时照跳」的根因（`busyRef` 卡死 ⇒ 到期清理再也不跑）已消除。
- **P4 核心 补记「未执行」**（`7b96ac1`）：`dueSlot` 顺带返回**紧邻的前一槽**（窗口内只有一条刻度时有界回溯一次）⇒ Loop A 在**新槽到来**时发现前一槽始终无实例行就补记**一条** `skipped`：主键用**被漏那槽自己的时刻**、只补紧邻一条、停机期间不补（`startedAtMs` 门禁）、once 不适用；原因复用 `BLOCK_KIND` 现成文案，进 `task_events` + `task_log`；顺手 `markTerminal` 让卡片即时更新。**断言三条**：写一条 `skipped`（`attempt=0`、无 session/lease/快照）／同刻度重复写不新增／**不在 Loop B 巡检范围内 ⇒ 永不重试**（用户明确要求「要确定」）。
- **P4 显示**（`3066f85`）：卡片状态条把 `skipped` 与 `failed` 一起标红，提示「最近一次未执行（配置或前置不满足，详见执行记录）」。

### 15.7 P2b-1 + P3a + 两轮评审（2026-09-30 当晚续做）

**P2b-1 服务端「已处理」闸门**（`498ef9c` + `abdff5c`）：`overview` 原来「刻度过期 ⇒ 无脑前移 `nextSlotAt`」是**排序抖动的根源**（`nextSlotAt` 是客户端排序键，读时前移 ⇒ 卡片掉下去、`running` 翻转再跳回）。改为**前移前先判「这一槽处理了吗」**（内存水位 `max(runningSince, lastScheduledAt) ≥ 该槽`，**不查库**）：未处理且在 `window` 内 ⇒ **冻结不前移**（键稳定 ⇒ 不抖；且它是过去时刻，在组内升序里**自然排最前**，不需要任何插队号）；出窗口 ⇒ 按已处理；`once` 已处理/已出窗口 ⇒ `nextSlotAt = null`（否则恒返回过去时刻 ⇒ 永远钉最前）。**冻结有上界**（最长一个 `window`）。

- 执行前评审要求 4 处必改（`once` 出口 / loading 时长分档 / rev 边沿解耦 / 既有断言改写）；执行后评审逐条核过 6 项，结论**方向正确、无新错误状态**，并指出 2 处小项（`window` 防御取值、注释失实）⇒ 已修（`abdff5c`）。
- 执行后评审另有一条**有用结论**：客户端那套「到点钳位」在闸门生效后**已是死代码**（触发需「新刻度在未来」，冻结后新旧都是同一个过去时刻）。

**P3a 到点即显 loading**（`24b3868`）：`LiveText.render` 类型由「只能返回字符串」放宽为**可返回节点**；`NextPill` 在 `diff <= 0`（= 该槽已到点且还没被处理）时直接显三块脉动，**去掉「即将执行」**；加时长分档上界（≈ 巡检间隔 + 2×轮询），超过仍未 `running` ⇒ 退回如实显示（不假装在跑，决策 54 的硬要求）。执行后评审核实：**服务端回 `unchanged` 时 pill 仍能自己切 loading**（`LiveText` 自带每秒 ticker，用行的旧值 + 新的本地时钟重算），类型放宽无涟漪，动画/上色无失效风险。

**P3a 评审留下的三项收尾（下一步先做）**：
1. loading 上界**改吃 live `tickMs`**（现为写死 90s；`tickMs` 被调大时会「正常派发之前就退出 loading」）——复用已有公式 `pinMsFor(tickMs, POLL_MS)`（默认 80s），并与钳位同口径。
2. 超上界后的兜底**不再退回「即将执行」**（正是用户点名要去掉的那句）⇒ 并进 P3b，换成「延期」徽标 + 原因。
3. 补一条**到点分支的产物断言**（现在只有「运行中」分支有断言；`:648-651` 那条教训就是防「改动被静默丢掉」）。

### 15.8 P3b-1（延期标识）+ 第 4 条（请求超时统一）（2026-09-30 当晚续做）

**P3b-1「延期」**（`bfee359` + 后续补悬浮说明）：`NextPill` 的 `diff <= 0` 分两档 —— 上界内（`dueLoadingMs` = 巡检间隔 + 2×轮询）显**三个方块**；超上界仍未 `running` ⇒ 显**「延期」**（该槽已过点却没真正开始跑：上游未完成 / 附件缺失 / 串行互斥）。**卡片上从此不再出现「即将执行」**（用户点名去掉；`relNow` 键仍被 `relativePast`/`relativeFuture` 合法复用，故不删键）。悬浮说明走官方 Tooltip + **真 DOM 子元素**（裸函数组件挂不上 ref ⇒ 提示静默失效，是 2026-09-30 那次真机教训）。

**第 4 条：请求超时统一**（`5469f7c`）：新增 `fetchWithTimeout`（`AbortController` + 超时，默认 8s），`client/index.ts` 的 **9 处 fetch 全部改走它** —— 含 2 秒快照通道（挂起会**永久停摆**且界面仍显示 ready 的假象）与 4 处保存/写回请求（挂起会让「保存中」永久、保存按钮永久禁用）。列表那条 10 秒轮询已在前一批单独修（带 signal + 看门狗）。

**已知缺口（未做）**：延期悬浮说明目前只讲事实（「已过计划时刻但还没开始执行 + 常见原因」），**具体是哪一个原因**要等调度器把阻塞结论透出到运行态（P3b 后半段，只加展示数据、不改调度语义）。

### 15.6 遗留与下一步

- **P2b** 删客户端钳位 + 服务端「阶段 / 稳定排序键」——**必须同批**，否则 `task-sort.ts` 头注释记录的排序抖动会回归（日常必现）。
- **P3** 到点显三个方块 loading（需给 `LiveText` 加一个「渲染节点」的变体——它现在只能返回字符串）+ **延期徽标与原因数据**（依赖服务端 phase）。
- 「用户能在执行记录里看到」需先补那个**占位页面**（本次未做）；在那之前 `skipped` 行只能在**调试页**看到。
- 同款的「请求无超时」仍存在于：面板 2 秒轮询通道、保存任务请求（评审列为同一类问题，本轮只修了 overview）。




