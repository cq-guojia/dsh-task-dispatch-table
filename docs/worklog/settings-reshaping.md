# 工作包：顶部「调试」重组为「设置」页

> **状态**：📝 待拍板（规划中，未动代码）
> **来源**：用户 2026-10-08 口头规划（开新坑）
> **配套**：[功能总索引](../design/features.md) · [数据模型](../design/data-model.md) · [配置真源](../src/config.ts) · [调试页现状](../src/client/index.ts)
>
> ⚠️ 本文是规划/需求归集，**不是定稿**。所有未决项见 §五，定稿后把确定部分升格到 `design/features/settings.md`，本文件封卷只留链接。

---

## 一、背景与现状

当前顶部菜单是 `main` 槽内的 **Segmented 分段控件**，4 个 tab（`src/client/index.ts:1266`）：

| tab key | 现 label | 说明 |
|---|---|---|
| `config` | 任务配置 | 卡片式任务列表 + 右侧编辑分栏 |
| `records` | 执行记录 | 全部任务流水账（HTTP 游标分页） |
| `calendar` | 任务日程 | 月历视图 |
| `debug` | **调试** | **最右边**；GET /db 全表原始行 + 运行参数只读展示 |

**计划**：把最右边的 `debug` ⇒ 改名为「**设置**」，页面内重组为两大块（见 §二）。

> 现有「调试」页已具备的能力（必须保留并归位，不能丢）：
> - `GET /db` 取 `state.db` 各表原始行：`renderDbTable` 按建表顺序渲染、长值截断 + 悬停看全文（`src/client/index.ts:1200` 起）。
> - 运行参数只读展示：`<dl>` 列出 `statePath / tickMs / dispatchGraceMs / leaseMs / unknownGraceMs`（`src/client/index.ts:1466` 起）。

---

## 二、用户规划原话（需求归集）

> 把「调试」变成「设置」，里面主要包含两大类功能：

**1. 配置功能** —— 设置本插件用到的产品配置，例如「那两个大循环多长时间执行一次」。

**2. 日志与数据库查询**：
- **(a) 整体日志**：在里面查询整体日志（我们有几个日志表）。
- **(b) 数据库列表**：查询我们所有数据库的列表，但不用全部显示。
- **(c) 系统调试器**：最上面是「设置」，下面放一个「系统调试器」。里面可以做一个小切换，比如切到哪一个就查哪个表。
- **(d) 查询方式**：查询时是「直接取前 100 条自己过滤」，还是「用分页」—— 用户还没想好。

---

## 三、需要配置的东西（基于 `PluginConfig` 整理）

> 真源：`src/config.ts:8-38`（接口）+ `src/config.ts:40-51`（默认值）。
> 当前**已能写回**的配置只有 4 个计时字段（`src/index.ts:967` 的 `allowed` 列表）；其余字段目前没有前端写回通道。

### 3.1 调度节奏（核心：那两个大循环）

- **`tickMs`（默认 `60000` = 60s）**：宿主 tick 周期。**Loop A（派发，`scheduler.ts:1-9`）与 Loop B（对账收口，`reconcile.ts` sweep）都跑在这一个 tick 上**——所以「两个大循环多长时间执行一次」其实就是 `tickMs` **一个旋钮**。改它 → 两个循环一起变节奏。

### 3.2 状态机时序（4 个计时字段，其中 `tickMs` 已可写回）

| 字段 | 默认 | 含义 |
|---|---|---|
| `tickMs` | 60s | tick 周期（见上） |
| `dispatchGraceMs` | 60s | `dispatched` 等待 session/created 的宽限期 |
| `leaseMs` | 30min | `running` 租约时长 |
| `unknownGraceMs` | 5min | `unknown` 只观察不动作的宽限期 |

> 这 4 个是当前 `/config` 路由已开放写回的字段（`src/index.ts:967`），前端若做配置 UI，它们是「现成能落盘」的那批。

### 3.3 保留 / 清理（数据保留期）

| 字段 | 默认 | 含义 |
|---|---|---|
| `logRetentionDays` | 30 | `task_log` / `plugin_log` 保留天数，tick 内跨天清 |
| `historyRetentionDays` | **0 = 不清** | `task_instances` + `task_events` 保留天数（>0 才清） |
| `attachmentTmpRetentionDays` | 7 | 上传临时区保留天数 |

### 3.4 默认模型（产品配置，用户大概率常改）

- `defaultProvider` / `defaultModel`：派发漏斗第②层默认；留空则漏到宿主默认（见 `src/config.ts:25-28`、`data-model.md` §一 `target.*`）。

### 3.5 高级 / 路径（建议折叠，不默认展开）

- `statePath`：SQLite 状态库绝对路径（决策 14）。
- `tasksDir`：任务定义目录（相对 cwd 解析）。
- ⚠️ `tasksInline` / `debugSnapshot`：**运行时数据，非用户设置**，不进设置 UI（`src/config.ts:21-24` 注释已标注）。

### 3.6 我的建议：设置 UI 分组

- **常用组**：`tickMs`（两个大循环节奏）、`defaultProvider`/`defaultModel`、3 个保留期。
- **高级组（折叠）**：4 个状态机计时（`dispatchGraceMs`/`leaseMs`/`unknownGraceMs` + 顺带 `tickMs` 也可放这）、`statePath`、`tasksDir`。

> 注：`tickMs` 既是「核心节奏」又属「计时字段」，放常用组更合理；上面 3.2/3.6 都提到它，避免两处打架——**真源以 3.6 分组为准**。

---

## 四、日志与数据库查询（基于 `data-model.md` 整理的事实）

### 4.1 我们有几个「日志」表？

`data-model.md:141-153`：**本仓有 4 处能记日志**，维度不同，先判维度再落笔：

| 落点 | 回答什么 | 挂谁 | 保留 |
|---|---|---|---|
| `task_events` | 某一次执行内部发生什么（状态迁移/派发/回执/追问） | `instance_id` | 默认不清 |
| `task_log` | 某个任务为什么没推进到执行那一步（过期/上游过期/前置不满足…） | `task_id` | 30 天 |
| `plugin_log` | 插件进程怎么了（启动/停止/宿主能力缺失/推送连接/主线程被占/慢请求/tick 异常…） | **挂不上任何任务** | 30 天 |
| `task_audit` | 谁在什么时候改了哪个任务（人动作，非诊断） | `task_id`（可空） | 默认不清 |

→ **「整体日志」应覆盖这 4 个**。注意 `task_events` / `task_audit` 量大且默认不清，查询**必须带过滤或分页**，不能无脑全拉。

### 4.2 数据库列表（`state.db` 现有 6 张表）

`data-model.md:46-138` 建表：

| 表 | 角色 | 是否业务可见 |
|---|---|---|
| `task_instances` | 执行实例（状态机载体） | 是 |
| `task_events` | 执行事件/日志 | 是 |
| `task_log` | 诊断日志 | 是 |
| `task_audit` | 操作审计 | 是 |
| `plugin_log` | 进程日志 | 是 |
| `meta` | 键值（`tasksInline` 持久化主通道，内部） | **建议默认隐藏**（无业务行，属内部存储） |

→ **「数据库列表」= 这 6 张表的清单 + 行数**；**「不用全部显示」⇒ 默认隐藏 `meta`**，或默认只列 5 张业务表、`meta` 放高级区。

### 4.3 系统调试器（现有调试页能力归位）

现状 `debug` tab 已做：`GET /db` 取各表原始行 + 运行参数只读展示。归位为「系统调试器」，加一个**小切换控件**：选哪张表就查哪张表（复用/扩展现有 `GET /db`）。

---

## 五、待拍板 / 未决项

1. **(d) 查询方式**：前 100 条 + 前端过滤 ｜ 服务端分页 —— **未定**（直接影响 (a) 整体日志 与 (c) 系统调试器 的取数接口设计）。
2. **(c) 页面层级**：设置页内是「配置 / 整体日志 / 数据库列表 / 系统调试器」**四个平级子区**，还是「设置（配置）+ 系统调试器（内含 整体日志 / 数据库列表 / 表切换）」**两层**？用户原话把 (a)(b)(c) 并列提，层级需确认。
3. **（我补）顶部 tab 布局**：`debug` ⇒ `settings` 后，顶部仍是 4 个 tab（`config/records/calendar/settings`）？还是把 `records`/`calendar` 也收进「设置」？需确认。
4. **（我补）系统调试器取数**：直接复用现有 `GET /db`（一次全表 dump），还是**新增「按表查询」路由**（选哪张拉哪张，配合 (d) 分页）？
5. **（我补）整体日志视图形态**：4 个日志表**合并成一条统一时间线**，还是**分别查、分别看**？
6. **（我补）配置写回扩展**：现有 `/config` 只开放 4 个计时字段；要暴露 3.3/3.4/3.5 的更多配置，需扩展 `allowed` 列表（`src/index.ts:967`）+ 前端表单，且要考虑「非计时字段经 scope.update 落盘」是否可行（计时字段有专门重启 interval 的逻辑）。

---

## 六、改动面提示（动代码前再细化）

- **改名成本极低**：`src/client/index.ts:1266` 的 Segmented `value`/`'debug'` ⇒ `'settings'`，label 改「设置」即可，不动其它 tab。
- **配置写回通道已存在**：`src/index.ts` 的 `GET/POST /config`（读 4 计时字段 / 写回），扩展需改 `allowed` + 前端表单。
- **数据真源**：配置字段真源 = `PluginConfig`（`src/config.ts`）；表清单真源 = `state.db`（`GET /db`）。
- **现有调试页渲染**：`renderDbTable` + 运行参数 `<dl>` 在 `src/client/index.ts`，归位时整体迁移到「系统调试器」子区。

---

> 🧠 **From Hindsight memory** — 本次未调用（按要求只写本地文档，未入长期记录）；涉及的事实均取自本仓库源码与 `docs/design/data-model.md`，已在正文标出处。
