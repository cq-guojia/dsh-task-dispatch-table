# 工作包：顶部「调试」重组为「设置」页

> **状态**：🔵 结构已拍板，细节待定（未动代码）
> **来源**：用户 2026-10-08 口头规划（开新坑）+ 2026-10-08 第二轮拍板
> **配套**：[功能总索引](../design/features.md) · [数据模型](../design/data-model.md) · [配置真源](../src/config.ts) · [调试页现状](../src/client/index.ts)
>
> ⚠️ 本文是规划/需求归集，**不是定稿**。已拍板部分见 §二/§四，剩余细节见 §五；定稿后把确定部分升格到 `design/features/settings.md`，本文件封卷只留链接。

---

## 一、背景与现状

当前顶部菜单是 `main` 槽内的 **Segmented 分段控件**，4 个 tab（`src/client/index.ts:1266`）：

| tab key | 现 label | 说明 |
|---|---|---|
| `config` | 任务配置 | 卡片式任务列表 + 右侧编辑分栏 |
| `records` | 执行记录 | 全部任务流水账（HTTP 游标分页） |
| `calendar` | 任务日程 | 月历视图 |
| `debug` | **调试** | **最右边**；GET /db 全表原始行 + 运行参数只读展示 |

**计划**：把最右边的 `debug` ⇒ 改名为「**设置**」，进入「设置」页后分**三大块**（见 §二）。`records` / `calendar` 仍为独立顶部 tab，不收进设置。

> 现有「调试」页已具备的能力（必须保留并归位，不能丢）：
> - `GET /db` 取 `state.db` 各表原始行：`renderDbTable` 按建表顺序渲染、长值截断 + 悬停看全文（`src/client/index.ts:1200` 起）。
> - 运行参数只读展示：`<dl>` 列出 `statePath / tickMs / dispatchGraceMs / leaseMs / unknownGraceMs`（`src/client/index.ts:1466` 起）→ **归位到 Block 1 作为「当前配置」只读面板**。

---

## 二、已拍板的结构（三大块）

> 用户 2026-10-08 第二轮拍板：顶部 `debug`→`settings`；点进「设置」页分三块。

### Block 1 · 基础设置（最上面）
- 产品配置表单，配完**保存**落盘（配置清单见 §三）。
- 顺带一个**「当前配置」只读面板**（复用原调试页运行参数 `<dl>`），展示当前生效值。

### Block 2 · 整体日志查询（中间）
- **专门查 `plugin_log`**——**是插件的进程日志，不是任务日志**（见 §4.1 维度区分）。用途：看哪里出错、何时启动等。
- **定时刷新**：一个「自动刷新」开关（勾上就定时拉）+ 一个「手动刷新」按钮。
- **不做 SSE 订阅 / 通知推送**（太重，不停发日志消耗大、接收也麻烦）。

### Block 3 · 原始数据查询（最下面）
- 查 `state.db` **全部 6 张表**，**不隐藏任何表**（开源自用，用户想看更多就让他自己查）。
- **选表**：滑动标签 = **单选**（一次看一张表；若以后要并排对比再考虑多选）。
- **条数 N（共享控件）**：一个「取前 N 条」数字框（默认 100，可选 100/200/500），**全局共享**——改一次，切到任何表都生效（用户意见 2026-10-08）。
- **筛选**：每表有**各自的筛选条件**（列不同）；用**一个通用筛选组件**（列名下拉 + 运算符 + 值）按所选表的列动态生成，不写多套表单。
- **展示**：筛选 + 查询后把结果**全部列出**；页面放不下 → 下面加**横向滚动条**。

---

## 三、Block 1 需要配置的东西（基于 `PluginConfig` 整理）

> 真源：`src/config.ts:8-38`（接口）+ `src/config.ts:40-51`（默认值）。
> 当前**已能写回**的配置只有 4 个计时字段（`src/index.ts:967` 的 `allowed` 列表）；其余字段目前没有前端写回通道。

### 3.1 调度节奏（核心：那两个大循环）
- **`tickMs`（默认 `60000` = 60s）**：宿主 tick 周期。**Loop A（派发，`scheduler.ts:1-9`）与 Loop B（对账收口，`reconcile.ts` sweep）都跑在这一个 tick 上**——「两个大循环多长时间执行一次」= `tickMs` 一个旋钮。

### 3.2 状态机时序（4 个计时字段，均已可写回）
| 字段 | 默认 | 含义 |
|---|---|---|
| `tickMs` | 60s | tick 周期（见上） |
| `dispatchGraceMs` | 60s | `dispatched` 等待 session/created 的宽限期 |
| `leaseMs` | 30min | `running` 租约时长 |
| `unknownGraceMs` | 5min | `unknown` 只观察不动作的宽限期 |

> 这 4 个是 `/config` 路由已开放写回的字段（`src/index.ts:967`），前端做配置 UI 时「现成能落盘」。

### 3.3 保留 / 清理（数据保留期）
| 字段 | 默认 | 含义 |
|---|---|---|
| `logRetentionDays` | 30 | `task_log` / `plugin_log` 保留天数，tick 内跨天清 |
| `historyRetentionDays` | **0 = 不清** | `task_instances` + `task_events` 保留天数（>0 才清） |
| `attachmentTmpRetentionDays` | 7 | 上传临时区保留天数 |

### 3.4 默认模型（产品配置，用户常改）
- `defaultProvider` / `defaultModel`：派发漏斗第②层默认；留空漏到宿主默认（见 `src/config.ts:25-28`、`data-model.md` §一 `target.*`）。

### 3.5 高级 / 路径（建议折叠，不默认展开）
- `statePath`：SQLite 状态库绝对路径（决策 14）。
- `tasksDir`：任务定义目录（相对 cwd 解析）。
- ⚠️ `tasksInline` / `debugSnapshot`：**运行时数据，非用户设置**，不进设置 UI（`src/config.ts:21-24`）。

### 3.6 Block 1 分组建议
- **常用组**：`tickMs`（两个大循环节奏）、`defaultProvider`/`defaultModel`、3 个保留期。
- **高级组（折叠）**：4 个状态机计时 + `statePath` / `tasksDir`。

---

## 四、日志与数据库查询（基于 `data-model.md` 整理的事实）

### 4.1 Block 2 整体日志 = `plugin_log`（进程级，非任务日志）
`data-model.md:126-138` 建表。`plugin_log` 回答「**插件这个进程**怎么了」：启动/停止、宿主能力缺失⇒降级、推送连接生命周期、主线程被占、慢请求、tick 异常等——**挂不上任何任务**。

> ⚠️ **维度区分（关键，避免再犯）**：本仓有 4 处能记"日志"（`data-model.md:141-153`）：
> | 落点 | 回答什么 | 挂谁 |
> |---|---|---|
> | `task_events` | 某次执行内部发生什么 | `instance_id` |
> | `task_log` | 某个任务为何没推进到执行 | `task_id` |
> | **`plugin_log`** | **插件进程怎么了（Block 2 要的）** | **挂不上任何任务** |
> | `task_audit` | 谁改了哪个任务（审计） | `task_id`（可空） |
>
> Block 2 **只取 `plugin_log`**；其余 3 个表仍可在 Block 3 原始查询里看，不在此块重复。

### 4.2 Block 3 原始数据查询 = `state.db` 全部 6 张表（全部显示，不隐藏）
`data-model.md:46-138` 建表。**只有这一个 SQLite 文件（state.db）**，"查询所有数据库"= 查它的 6 张表：

| 表 | 角色 |
|---|---|
| `task_instances` | 执行实例（状态机载体） |
| `task_events` | 执行事件/日志 |
| `task_log` | 诊断日志（任务级） |
| `task_audit` | 操作审计 |
| `plugin_log` | 进程日志 |
| `meta` | 键值（`tasksInline` 持久化主通道；存整份任务定义 JSON，**可能很大，显示即可让其滚动**） |

### 4.3 取数接口（(d) 已拍板：top-N 自过滤，无分页）
- **不做服务端分页**。对「当前所选的那一张表」取「前 N 条」（`N` 为 §二 Block 3 的**共享控件**，默认 100，可选 100/200/500），**由用户在客户端自行筛选**。
- ⚠️ **必须 `ORDER BY` 最新在前**（`seq`/`ts` DESC），否则 SQLite 的 `LIMIT N` 是 rowid 任意行，"前 N 条"无意义。
- 现有 `GET /db` 是「一次全表 dump」；Block 3 需改为**按所选表 + 共享 N + 筛选条件 + 排序**取数（见 §五）。
- **查询形态** = `SELECT * FROM <表> WHERE <筛选> ORDER BY <排序列> DESC LIMIT <N>`。

---

## 五、待拍板 / 未决项（细节）

1. **自动刷新间隔（Block 2）**：✅ **已拍板：固定 5s，不给选项、不可调**（用户 2026-10-08）。开关勾上即每 5s 拉一次；另配「手动刷新」按钮。
2. **top-N 的排序**：`SELECT * LIMIT N` 不写 `ORDER BY` 是**任意行**（SQLite 按 rowid），"前 100 条"会无意义 ⇒ **必须 `ORDER BY seq/ts DESC`（最新在前）**。默认排序列（优先 `seq`，无 seq 的表用 `ts`）待定。
3. **选表单选 + 共享 N（Block 3）**：✅ **已拍板：滑动标签单选（一次一张表）**；N 为**全局共享控件**（默认 100，可选 100/200/500），改一次切表仍生效（用户 2026-10-08）。→ 原"多表各取前 N vs 总计 N"的口径问题**作废**（单选下 N 即该表 `LIMIT N`）。
4. **Block 3 筛选形态**：每表各自筛选（列不同），用**一个通用筛选组件**按所选表列动态生成（见 §七.2）。
5. **配置写回（Block 1）——澄清**：配置**不是写死、也不在我们 SQLite `state.db` 里**。`PluginConfig` 的**默认值**在 `src/config.ts:40-51`（`ConfigDefaults`）；用户实际值由**宿主(DSH)经 `scope.update` 落盘**持久化（`config-panel.tsx:5-6`）。我们 `state.db` 只存运行时数据（实例/日志），不存配置——符合用户"没必要去数据库"的判断。要 Block 1 编辑更多字段，需两处同步：① 放宽 `/config` 路由的 `allowed` 写回白名单（`src/index.ts:967`，现仅 4 个计时字段）；② 在配置表单（现 `config-panel.tsx`，仅 4 字段）加对应字段。**设计决策待定**：Block 1 是扩展现有 `config-panel.tsx`，还是在「设置」页内另写表单（都走同一 `/config` 路由）。
6. **定稿后**：升格到 `design/features/settings.md`，本文件封卷。

---

## 六、改动面提示（动代码前再细化）

- **改名成本极低**：`src/client/index.ts:1266` 的 Segmented `'debug'` ⇒ `'settings'`，label 改「设置」。
- **Block 2 取数**：复刻现有 `GET /db` 思路，但改为按 `plugin_log` + `ORDER BY seq DESC LIMIT N`；用 `setInterval` 轮询（受开关控制），**不复用现有事件订阅**（现有调试页的事件订阅见 `src/client/index.ts:1029` 起，Block 2 不沿用）。
- **Block 3 取数**：新增「按表 + 共享 N + 筛选 + 排序」查询路由（或在 `GET /db` 上加参数）。
- **数据真源**：配置 = `PluginConfig`（`src/config.ts`，**默认值在代码、实际值由宿主落盘**）；表清单 = `state.db`（`GET /db`）。
- **配置写回通道**：现有 `config-panel.tsx`（宿主插件详情页内）经 `GET/POST /config` 读写，后端 `allowed` 白名单（`src/index.ts:967`）仅放行 4 个计时字段；Block 1 要扩字段即改这两处。
- **现有调试页渲染**：`renderDbTable` + 运行参数 `<dl>` 迁移到 Block 3 / Block 1。

---

## 七、设计评审意见（agent，2026-10-08）

1. **(d) 同意 top-N 自过滤、不做分页**——更简单、够用。但补一条：**必须显式 `ORDER BY` 最新在前**，否则"前 N 条"是数据库任意行，客户端的"筛选"也筛不到想要的近期数据。给个 N 选择器（默认 100）即可。
2. **Block 3 别给 6 张表各写一套筛选表单**。`state.db` 各表 schema 不同，但筛选器形态一致（列 + 运算符 + 值）。做一个**通用筛选组件**，按所选表的列动态出下拉，一份代码覆盖全部表——既满足"每表筛选条件不一样"（列不同），又不多写 5 份表单。
3. **Block 2 用定时器轮询、不接 SSE**：与现有调试页"靠事件订阅重拉"的写法相反，但更简单、且用户明确不想被持续推送打扰，方向正确。注意轮询要在「开关关 / 离开页面」时停掉（现有 2s 轮询的 stopPolling 思路可复用，`src/client/index.ts:1822` 起）。
4. **`meta` 表不隐藏、但可能巨**：它存整份 `tasksInline`（全部任务定义 JSON）。显示在原始查询里没问题，但单行可能很长——靠横向滚动 + 长值截断（现有 `renderDbTable` 已做）兜住即可。
5. **"数据库"措辞统一**：实际是「一个 SQLite 文件里的 6 张表」，文档与 UI 里叫"表/原始数据"比"数据库"更准，避免用户以为有多库。

---

> 🧠 **From Hindsight memory** — 本次未调用（按要求只写本地文档，未入长期记录）；涉及事实均取自本仓库源码与 `docs/design/data-model.md`，已在正文标出处。
