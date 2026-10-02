# 任务展开三面板（基础资料 / 执行记录 / 日志）

> **状态**：🔵 **已落码**（2026-10-01，决策 55；typecheck + build 绿，冒烟 **364/0**）⏳ 真机验证待做
> **来源**：用户口述需求 + 2026-10-01 三轮确认
> **配套工作包**：[`worklog/task-expand-panels.md`](../../worklog/task-expand-panels.md)

---

## 一、需求原话（用户，逐字保留）

> 点击每一条记录进行展开，里面包含三个滑动块：
> - 第一个滑动块：**基础资料**（就是现在这页的基础资料）。
> - 第二个滑动块：**执行记录**（展开该任务的执行记录）。
> - 第三个滑动块：**日志**（该任务的相关日志）。

---

## 二、三面板内容来源（已核实现有数据面）

### 面板 1 · 基础资料
= 当前卡片**展开区**已有的「标签 / 值两栏」内容（`src/client/task-list.tsx` 的 `TaskCard` 展开段，约 760–788 行），四区块：
- 执行设置：`schedule`（排期人话，与编辑器共用 `schedule-text.ts`）/ `workspace` / `model` / `retryMax` / `window`
- 附加文件：`attachments`（名称 + link/upload 标注）
- 前置任务：`depends`（标题 + 停用标注）
- 提示词：`promptHead`（首段 120 字）

> 待定（用户明确「基础资料后面再改、放在最后」）：是否从「首段」升级为「全文」（点开看完整提示词）。容器形态**已定**：并入统一的三面板内容区（§3.1），不再沿用就地拉伸。

### 面板 2 · 执行记录
= 该任务的 `task_instances` 行，按 `scheduled_at DESC`：
字段（已核实 `src/store.ts` DDL）：`task_id` / `logical_date` / `scheduled_at` / `status`（`pending/dispatched/running/succeeded/failed/skipped/unknown`）/ `attempt` / `session_id` / `finished_at` / `outputs`（决策 32③ 真值，可点开）/ `token_in`·`token_out`·`token_in_cache`。
每行可下钻到该次执行的事件时间线（`task_events`，现有 `records` 标签已支持「点一行展开该次执行的事件时间线」）。
- **现有接口**：`records` 标签走全局 `debugSnapshot.instances`（host 周期写入），**非按任务过滤**；本面板需**按任务过滤**。
- **待补接口**：已定 `GET ${DISPATCH_API_PREFIX}/tasks/instances?taskId=…`，查询方法 `store.listInstancesByQuery`（过滤 + 游标分页，签名与语义见 §四）。

### 面板 3 · 日志
= 该任务的 `task_log` 行，按 `ts DESC`：
字段（已核实）：`ts` / `task_id` / `scheduled_at` / `level`（`error`/`warn`/`info`…）/ `kind` / `message`。
- **现有接口**：仅 `appendLog` 写入 + `GET /db` 调试快照全表 dump；**无按任务检索的接口/查询方法**。
- **待补接口**：已定 `GET ${DISPATCH_API_PREFIX}/tasks/log?taskId=…`，查询方法 `store.listLogsByQuery`（签名与语义见 §四）。

---

## 三、设计（2026-10-01 定稿；**第四轮 UX 修订 2026-10-01**）

### 3.1 布局与「三 tab 统一定高」（第四轮重点）
- **左下**：三滑块「基础信息 / 执行记录 / 日志」，默认基础信息；**右下**：按钮区「删除 · 编辑任务」。
- **内容区三 tab 必须统一固定高度**（现为 `PANEL_MAX_H = 360px`）：无论哪个 tab、哪个任务、有没有数据，展开高度**完全一致**。
- **要求（用户原话）**：不统一定高就会**不停闪** ⇒ 这是硬性口径。
- **实现口径**：内容区 = **一个定高 flex 列** —— 过滤行（若有）固定在外不滚，**滚动只发生在列表/内容盒**；**基础信息 tab 也必须纳入这个定高盒内滚动**。
- ⚠️ **现状缺陷（第四轮随做，见 §3.9）**：基础信息 tab 目前**没有**纳入定高盒（直接铺内容）⇒ 切 tab 时整体高度会变 ⇒ 正是用户看到的「闪」。

### 3.2 执行记录面板
- 数据 = 该任务 `task_instances`，`scheduled_at DESC`，最新 **100 条**；**无翻页、无「加载更多」**。
- 点一行下钻该次执行的**事件时间线**（复用 legacy `records` 能力）。
- 过滤行：**状态三档**（执行中 / 失败 / 成功，单源见 §3.6）+ **时间范围**（见 §3.4 控件）；**控件走小档**（不再 lg/32，收窄减高）。
- **列定义（用户 2026-10-01 第四轮拍板；下表顺序 = 从左到右）**：

| # | 列 | 内容 / 格式 | 要点 |
|---|---|---|---|
| 1 | **状态图标** | 官方风状态 icon（✓绿=成功 / ✕红=失败·未执行 / 转圈=执行中·已派发 / 空心=待执行·未知）+ 状态短名 | 短名走 `status-text.ts` 单源 |
| 2 | **计划执行** | `YYMMDD HH:mm` | 计划无「秒」；完整时刻进 hover |
| 3 | **实际开始** | `HH:mm:ss` | 取 `dispatched_at`；未派发 ⇒ `—` |
| 4 | **执行时长** | `MM:ss`，**小时全部折进分钟**（1 时 15 分 30 秒 ⇒ `75:30`） | 结束−实际开始；需新增/调整格式 helper |
| 5 | **产出物** | 每个产出文件一个**文件类型图标**（走官方 `FileTypeIcon`，按路径自动分类着色），按数量依次显示 **1 / 2 / 3** 个；**无产出 ⇒ 不放图标、该格压缩** | 见 §3.5 |
| 6 | **会话记录** | 一个**会话图标**（`IconNewChatOutlineRegular` 类），点击打开会话 | 不再在产出格塞 ↗；无 session ⇒ 空 |

### 3.3 日志面板
- 取该任务 `task_log`，默认 **100 条**（`ts DESC`），提供 **50 / 100 / 200** 条数选择器。
- 筛选：**关键字** + **时间范围**（同 §3.4 控件）；控件走小档。
- 形态：跟随宿主主题色 + 等宽字体 + 可滚动文本框。

### 3.4 时间范围筛选控件（**新增，跨页面复用的通用件**）
- **目标（用户原话）**：「抽象得越简单越好，其他地方直接一调，什么都出来了」——执行记录 / 日志 / 未来的总查询页都直接调同一件。
- **能力**：
  1. **开始时间 ~ 结束时间** 筛选（主要往前选），内置**预设档**：今天 / 本周 / 上周 / 上个月…；
  2. **调用方可配置显示哪些档**（含「N−1 天」「N−1 月」这类参数化档）；
  3. 选择后**回吐起止时间**，直接赋给两个时间框；
  4. 「开始框 / 结束框」可作为参数交给控件，由控件统一渲染（预设 + 两框一体）。
  5. **预设档一律是「整档」**（用户 2026-10-02 拍板：「今天就是整个今天」）：今天 = `00:00` ~ `23:59`；本周 = 周一 ~ 周日 `23:59`；本月 = 1 号 ~ 月末 `23:59`。**上界不取「此刻」**——取「此刻」会随当前时间漂，跨分钟后控件认不出档、把档名回显成「自定义」。
  6. **用户手改任一框 ⇒ 即「自定义」**：档名回显只靠「当前值是否等于某预设档区间」判断，不等即自定义（无其他判据）。
- **落位**：预设区间计算 = **纯函数**（可单测，放共享模块）；控件 = **UI 基础层新件**（`src/client/ui/`，登记进手册「唯一实现表」）；业务处只 import 该控件。
- **API 目标**：传「配置（要哪些档）+ 受控 from/to + onChange」即可渲染整行过滤控件。
- 复用底座：`ui/DateTime.tsx` 的 `DateField`（自绘，支持 `size`: sm/md/lg）。

### 3.5 产出物图标与表格观感（官方选型）
- **官方无 Table / List / DataGrid / Card 组件**（源码级结论，见 [`external/dsh-capabilities.md`](../external/dsh-capabilities.md)）⇒ 表格壳（表头 + 列对齐）**自绘**。
- 可复用的官方件：`FileTypeIcon`（产出物文件类型图标）、`DisclosureRow`（官方行件）、`StateDot`、图标族（会话 / 分支 / 勾 / 叉 / 转圈 / 警告…）。
- **纪律**：行内元素尽量用官方件（产出物 = `FileTypeIcon`，状态 / 会话 = 官方图标），不自造文件类型图标。
- **产出物上限与「更多」**：最多 3 个图标；超过则在第 4 位放 `…`（点击**打开会话**，完整产出在会话里）。
- 观感目标：对齐用户提供的**明亮风格参考图**（弱分隔、图标化、列对齐）。

### 3.6 状态短名与过滤三档单源
- 状态短名唯一入口 = `src/client/status-text.ts`（`statusTextOf`）；过滤三档 = 执行中（`pending/dispatched/running/unknown`）/ 失败（`failed/skipped`）/ 成功（`succeeded`），查询层归桶后传后端。

### 3.7 删除
- 右下角「删除」→ **确认对话框** → 复用现有 `DELETE ${DISPATCH_API_PREFIX}/tasks`（摘定义 + 删任务目录，实例 / 事件保留做审计）。
- 删除后由 overview 的 rev 自动刷新列表。

### 3.8 数据通道抽象（核心，未来总页面复用）
- 用户后续要做**总页面**（日志查询 + 任务执行记录查询），带更详细的搜索与分页：① 按任务筛选；② 按工作区筛选（查全部执行记录）；③ 按成功 / 失败状态筛选。
- 因此查询**统一抽象为一套「过滤 + 游标分页」模型**，本面板与未来总页面**共用同一实现**：本面板传 `limit`（取最新 N）；总页面再传 `cursor` 即翻页。

### 3.9 第四轮待修缺陷（随本轮一并做）
| # | 缺陷 | 现状 / 根因 | 处置方向 |
|---|---|---|---|
| D1 | **状态过滤完全无效**（用户真机：「完全没有效果」） | 客户端发查询参数名 **`statuses`（复数）**，服务端路由读 **`status`（单数）** ⇒ 参数对不上，过滤恒等于「全部」。证据：`client/query.ts` `qsOf({...params})` 发 `statuses`；`src/index.ts` `queryOf(req,'status')` | 参数名对齐（客户端或服务端二选一改），并加冒烟断言钉住「按状态过滤生效」 |
| D2 | **基础信息 tab 未纳入定高盒** ⇒ 切 tab 高度变（「闪」） | `renderInfo()` 直接铺内容，未走 `panelScrollStyle` 定高盒 | 三 tab 统一进定高 flex 列（§3.1） |
| D3 | **候选**：过滤行控件过高 | 当前走 lg(32) | 走小档（§3.2 / §3.3） |

### 3.10 真实数据纪律
- 依 [`AGENTS.md`](../../../AGENTS.md) 第五条：面板展示数据必须来自宿主 / 自有存储**真实值**，不得 mock。

### 3.11 时间范围与**日期边界约定**（重要，跨页面统一）

> 用户 2026-10-02 点名：选「1 月 1 日 ~ 1 月 10 日」时，若直接拿 `20260110` 当上界（= 1/10 的 `00:00`），**1/10 当天数据会被漏掉**；用户要的是**含 1/10 当天**。

- **约定：统一用半开区间 `[from, to)`**（含起点、不含终点）——SQL / Elasticsearch / 各类 API 的通行口径（「inclusive start and exclusive end to match a whole date range without missing rows that include times」）。
  - 上界 `to` = **所选结束日期的次日 `00:00`**（day 粒度）；或 **所选结束分的下一分钟 `:00`**（minute 粒度）。
  - 比较：`ts >= from AND ts < to`；时间戳是 ISO 串（字典序即时间序），`<` 干净可靠，**无需 `.999` 之类补丁**。
- **单一真源**：边界归一**只有一处**（时间范围模块纯函数），页面与查询层**不得各自算**——禁止 `BETWEEN`、禁止裸 `<= 当天`。
- **现状对照**：当前 `task-list.tsx` 的 `dayEndIso` 用 `T23:59:59.999`（含尾）+ 服务端 `scheduled_at <= ?`——**结果正确但属「补丁式」**；本轮随控件**统一到半开区间**（服务端 `<=` → `<`，客户端上界改次日 `00:00`）。
- **不采用**：`BETWEEN a AND b`（两端含，落在时间戳上等于只含 b 的 `00:00`）；对列套 `date()` 再比较（丢索引）。

---

## 四、数据接口（已定）

### 4.1 store（`src/store.ts`）
- `listInstancesByQuery({ taskId?, taskIds?, statuses?, fromTs?, toTs?, cursor?, limit? })` → `{ rows, nextCursor }`；排序 `scheduled_at DESC, id DESC`，cursor 编码末行 `(scheduled_at, id)`。
- `listLogsByQuery({ taskId?, taskIds?, levels?, keyword?, fromTs?, toTs?, cursor?, limit? })` → `{ rows, nextCursor }`；排序 `ts DESC, seq DESC`，cursor 编码末行 `(ts, seq)`。
- `listEventsByInstance(instanceId)` → 事件时间线（`seq ASC`）。

### 4.2 路由（`src/index.ts`）
- `GET ${DISPATCH_API_PREFIX}/tasks/instances?taskId=&workspace=&status=&from=&to=&cursor=&limit=`
- `GET ${DISPATCH_API_PREFIX}/tasks/log?taskId=&workspace=&level=&keyword=&from=&to=&cursor=&limit=`
- `GET ${DISPATCH_API_PREFIX}/tasks/events?instanceId=`
- **workspace 过滤**：`task_instances` / `task_log` 均无工作区列 ⇒ 由路由读 `tasksInline` 反查「该工作区的 task_id 列表」再 `WHERE task_id IN (...)`（不碰表结构）。

### 4.3 客户端（新建 `src/client/query.ts`）
- `fetchInstances(params)` / `fetchLogs(params)` / `fetchEvents(instanceId)`，面板与未来总页面共用。

---

## 五、与既有设计的关系

- 基础资料 = 现有 `TaskCard` 展开区四区块（`task-list.tsx`）**原样并入**三面板内容区（容器形态已定，见 §3.1）。
- 执行记录页此前被用户明示「属新功能、未明示不动」（见 [`PROGRESS.md`](../../PROGRESS.md) §二 历史条目）；本三面板是**首个落地入口**。
- 调度/状态语义（决策 8 同任务串行、决策 54 任务级错误 `skipped`、拍板 A once 过期）不变，面板只负责**展示**，不改调度。
