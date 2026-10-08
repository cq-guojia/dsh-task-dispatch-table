# 工作包：顶部「调试」重组为「设置」页

> **状态**：🔵 落码完成（commit `b096443`，2026-10-08），⏳ 真机验收待做（尚未封卷）
> **来源**：用户 2026-10-08 口头规划（开新坑）+ 2026-10-08 第二轮拍板
> **配套**：[功能总索引](../design/features.md) · [数据模型](../design/data-model.md) · [配置真源](../src/config.ts) · [调试页现状](../src/client/index.ts)
>
> ⚠️ 本文原是规划/需求归集；**2026-10-08 已落码（commit `b096443`）**，确定部分已升格见下方 §八 实现记录。落码细节与待办见 §八 / §九；定稿升格文档 `design/features/settings.md` 待补（见 §九）。

---

## 一、背景与现状

当前顶部菜单是 `main` 槽内的 **Segmented 分段控件**，4 个 tab（`src/client/index.ts:1266`）：

| tab key | 现 label | 说明 |
|---|---|---|
| `config` | 任务配置 | 卡片式任务列表 + 右侧编辑分栏 |
| `records` | 执行记录 | 全部任务流水账（HTTP 游标分页） |
| `calendar` | 任务日程 | 月历视图 |
| `settings` | **设置** | **最右边**（2026-10-08 由 `debug` 改名）；三大块见 §二，旧调试页（已删除）整段移除 |

**已落地**：最右边的 `debug` ⇒ 已改名为「**设置**」（`src/client/index.ts:1196` 的 Segmented `value:'settings'`、`label: t('tabSettings')`；`:1276-1277` 渲染 `SettingsPage`）。进入「设置」页后分**三大块**（见 §二）。`records` / `calendar` 仍为独立顶部 tab，不收进设置。

> **旧「调试」页处置（用户 2026-10-08 拍板：全推倒、按新逻辑重写；2026-10-08 已删除）**：
> - 旧调试页（已删除） = client 的 `debug` tab（`src/client/index.ts` 的 Segmented + `renderDebug`/`renderDbTable` + 运行参数 `<dl>`）+ server 的 `GET /db` 数据通道（`src/index.ts:500`，"三张表原样导出"）。
> - **整体废弃、不迁移旧布局**，新「设置」页按三大块从零重建。底层纯函数（如 `renderDbTable` 通用表格渲染）若仍适用可复用，但页面结构与取数通道按新逻辑重写。
> - server 的 `GET /db`（一次性全表 dump、无排序/筛选/分页）**已由新的 `GET /db-query` 路由取代**（见 §4.3 / §六 / §八）。

---

## 二、已拍板的结构（三大块）

> 用户 2026-10-08 第二轮拍板：顶部 `debug`→`settings`；点进「设置」页分三块。

### Block 1 · 设置（最上面）— 配置编辑的**主入口**
- **配置编辑表单**搬到这里（用户 2026-10-08 拍板）：产品配置都在这改、配完**保存**落盘（配置清单见 §三）。
- 顺带一个**「当前配置」只读面板**（新建，展示当前生效值，便于核对保存结果）。
- ⚠️ 宿主插件详情页里的 `config-panel`（运行参数表单）**暂不动（"先不管"）**，但它是**旧入口 / 兜底**；配置编辑的**正式主场是这里**。详见 §五.5。

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
- ⚠️ **必须 `ORDER BY` 最新在前**，否则 SQLite 的 `LIMIT N` 是 rowid 任意行，"前 N 条"无意义。
- **排序（用户 2026-10-08 拍板：从简，后续再说）**：每表直接按**各自最新的字段 `DESC`** 即可，**不做排序选择器、不做复杂排序 UI**；后续真有需求再补。默认排序列见 §五.2。
- 现有 `GET /db` 是「一次全表 dump」；Block 3 需改为**按所选表 + 共享 N + 筛选条件 + 默认最新字段 `DESC`** 取数（见 §五）。
- **查询形态** = `SELECT * FROM <表> WHERE <筛选> ORDER BY <该表最新字段> DESC LIMIT <N>`。

---

## 五、待拍板 / 未决项（细节）

1. **自动刷新间隔（Block 2）**：✅ **已拍板：固定 5s，不给选项、不可调**（用户 2026-10-08）。开关勾上即每 5s 拉一次；另配「手动刷新」按钮。
2. **top-N 的排序（用户 2026-10-08 拍板：从简，后续再说）**：`SELECT * LIMIT N` 不写 `ORDER BY` 是**任意行**（SQLite 按 rowid），"前 N 条"会无意义 ⇒ **必须 `ORDER BY <该表最新字段> DESC`（最新在前）**。具体每表用哪个字段：优先 `seq`，无 `seq` 的表（如 `meta`/`task_audit`）用 `ts`/`updated_at`（动代码时按 `data-model.md` 建表逐一确认）。**不做排序选择器 / 复杂排序 UI**，以后大家真有需求再补。
3. **选表单选 + 共享 N（Block 3）**：✅ **已拍板：滑动标签单选（一次一张表）**；N 为**全局共享控件**（默认 100，可选 100/200/500），改一次切表仍生效（用户 2026-10-08）。→ 原"多表各取前 N vs 总计 N"的口径问题**作废**（单选下 N 即该表 `LIMIT N`）。
4. **Block 3 筛选形态**：每表各自筛选（列不同），用**一个通用筛选组件**按所选表列动态生成（见 §七.2）。
5. **配置入口归属（用户 2026-10-08 拍板）**：
   - **配置编辑主场 = 设置页 Block 1**。宿主插件详情页里的 `config-panel`（运行参数表单，`src/client/index.ts:2055-2067` 注册进 `plugins.bundle.config` 槽）**暂不动（"先不管"）**，但它定位为**旧入口 / 兜底**——只给"在别处没有界面的字段"留设置位；等 Block 1 覆盖全部配置后，它可整体退役。
   - 配置**不是写死、也不在我们 SQLite `state.db` 里**：`PluginConfig` 默认值在 `src/config.ts:40-51`，用户实际值由**宿主经 `scope.update` 落盘**（`config-panel.tsx:5-6`）。`config-panel.tsx` 走我们自己的 `/config` HTTP 路由（`src/index.ts:938-1005`），Block 1 直接复用同一个路由写回即可——**设置页能设配置，不受"仅宿主可改"限制**。
   - **落地动作（动代码时）**：① 放宽 `/config` 路由 `allowed` 白名单（`src/index.ts:967`，现仅 4 个计时字段）到全部 `PluginConfig` 用户字段；② Block 1 的表单组件覆盖保留期 / 默认模型 / 路径等（可复用 / 扩展 `config-panel.tsx`，它本就是自包含表单，顶部「设置」页里 `<ConfigPanel view="page" />` 即可渲染一份）。
   - ⚠️ **过渡期有两份配置 UI**（宿主详情页 `config-panel` + 新 Block 1），但都走同一 `/config` 路由、无数据冲突，仅视觉冗余；用户已接受"先不管"宿主页，待 Block 1 成熟再退役前者。
6. **定稿后**：升格到 `design/features/settings.md`，本文件封卷。

---

## 六、改动面提示（动代码前再细化）

- **改名成本极低**：`src/client/index.ts:1266` 的 Segmented `'debug'` ⇒ `'settings'`，label 改「设置」。
- **Block 2 取数**：复刻现有 `GET /db` 思路，但改为按 `plugin_log` + `ORDER BY seq DESC LIMIT N`；用 `setInterval` 轮询（受开关控制），**不复用现有事件订阅**（现有调试页的事件订阅见 `src/client/index.ts:1029` 起，Block 2 不沿用）。
- **Block 3 取数**：新增「按表 + 共享 N + 筛选 + 排序」查询路由（或在 `GET /db` 上加参数）。
- **数据真源**：配置 = `PluginConfig`（`src/config.ts`，**默认值在代码、实际值由宿主落盘**）；表清单 = `state.db`（`GET /db`）。
- **配置写回通道**：本插件非 volatile ⇒ 宿主官方 `configForms` 不可用，配置 UI 走我们自己的 `/config` 路由（`src/index.ts:938-1005`）。**配置编辑主场迁到设置页 Block 1**；宿主详情页 `config-panel` 暂保留作旧入口/兜底（"先不管"）。落地需：放宽 `allowed`（`src/index.ts:967`，现仅 4 计时字段）→ 全 `PluginConfig` 用户字段；Block 1 表单覆盖保留期/默认模型/路径（可复用 `config-panel.tsx`）。
- **旧调试页（已删除）整体删除**：client 的 `debug` tab 整段移除（`renderDebug`/`renderDbTable`/运行参数 `<dl>`/事件订阅），server 的 `GET /db` 路由废弃；两者按新三块从零重建。底层 `renderDbTable` 纯函数可复用，但页面结构与取数通道重写。

---

## 七、设计评审意见（agent，2026-10-08）

1. **(d) 同意 top-N 自过滤、不做分页**——更简单、够用。但补一条：**必须显式 `ORDER BY` 最新在前**，否则"前 N 条"是数据库任意行，客户端的"筛选"也筛不到想要的近期数据。给个 N 选择器（默认 100）即可。
2. **Block 3 别给 6 张表各写一套筛选表单**。`state.db` 各表 schema 不同，但筛选器形态一致（列 + 运算符 + 值）。做一个**通用筛选组件**，按所选表的列动态出下拉，一份代码覆盖全部表——既满足"每表筛选条件不一样"（列不同），又不多写 5 份表单。
3. **Block 2 用定时器轮询、不接 SSE**：与旧调试页（已删除）"靠事件订阅重拉"的写法相反，但更简单、且用户明确不想被持续推送打扰，方向正确。注意轮询要在「开关关 / 离开页面」时停掉（旧 2s 轮询的 stopPolling 思路可复用，`src/client/index.ts:1822` 起）。
4. **`meta` 表不隐藏、但可能巨**：它存整份 `tasksInline`（全部任务定义 JSON）。显示在原始查询里没问题，但单行可能很长——靠横向滚动 + 长值截断（现有 `renderDbTable` 已做）兜住即可。
5. **"数据库"措辞统一**：实际是「一个 SQLite 文件里的 6 张表」，文档与 UI 里叫"表/原始数据"比"数据库"更准，避免用户以为有多库。

---

## 八、实现记录（落码情况，2026-10-08）

> commit `b096443`（main）：typecheck + build 通过，dist 已随提交入库。
> 缩写：`DISPATCH_API_PREFIX = /api/task-dispatch-table`。

### 8.1 后端
- `src/store.ts`：新增 `queryTable(name, filters, limit)`（`DUMP_TABLES` 白名单 + 列名/运算符白名单 + 占位绑定 + `ORDER BY defaultOrder(name) DESC LIMIT ?`，LIMIT 钳制 1..500）；`defaultOrder(name)`（各表最新字段 DESC）；`columnsOf(name)`（带 `columnCache`）。`dumpTable` 复用二者。
- `src/index.ts`：
  - `CONFIG_EDITABLE_FIELDS`（`src/index.ts:219`）：全 `PluginConfig` 用户字段白名单（含 `type`/`min`/`max` 校验），取代原仅 4 计时字段的 `allowed`。
  - `GET ${DISPATCH_API_PREFIX}/db-query`（`src/index.ts:519`）：读 `table`/`n`/`filter`，调 `store.queryTable`；设置页 Block 3 取数通道。
  - `GET|POST ${DISPATCH_API_PREFIX}/config`（`src/index.ts:987`）：按 `CONFIG_EDITABLE_FIELDS` 白名单读写全字段，类型+范围校验后经 `updateScopeConfig` → `scope.update` 落盘并即时生效（运行态 `settings/updated`）。GET 回填用 `config as unknown as Record<string, unknown>`。

### 8.2 前端（7 个新模块，`src/client/`）
- `settings-page.tsx`：`SettingsPage` 用 `cardStyle` 纵向组合三块（maxWidth 920 居中）。
- `settings-config-block.tsx`（Block 1）：`FIELDS` 数组（常用/高级分组，number 字段秒↔毫秒 `toDisplay`/`fromDisplay`）；进入拉 `GET /config` 回填、保存 `POST /config`；下方 `<dl>` 只读「当前配置」面板；`saved` state 提示成功（未用 `Toast`）。
- `settings-log-block.tsx`（Block 2）：固定 5s `setInterval` 轮询 `plugin_log`，`auto` 开关 + 手动刷新；卸载/关开关清定时器。
- `settings-table-block.tsx`（Block 3）：`Segmented` 六表单选、共享 N（`NumberInput`，默认 100/可选 200/500）、动态筛选增删、`DbTable` 展示。
- `db-table.tsx`：`DbTable` 横向滚动表格（长值截断 + `title`）。
- `table-filter.tsx`：`TableFilterRow`（列名下拉 + 运算符 + 值 + 移除），用 `SelectField`/`Input`/`IconButton`。
- `settings-data.ts`：复用 `API_PREFIX`/`fetchWithTimeout` + 类型 `SettingsConfigValue`/`SettingsTableFilter`/`SettingsTableQueryResult`/`SETTINGS_TABLES`/`TABLE_COLUMNS` + `fetchConfig()`/`postConfig()`/`fetchTableQuery()`。

### 8.3 装配
- `src/client/index.ts`：`debug` tab ⇒ `settings`（`:505` `useState`、`:1189` `Segmented`、`:1276-1277` 渲染 `SettingsPage`）；删除旧调试页渲染链（`DbTableDump` 接口、`dbDump`/`dbState`/`dbNonce`/`dbLoadedForRef`/`useEvents` 调试订阅、`renderDbTable`）；`locales.ts` 增补约 30 个 key（中文 + 英文）。
- 宿主 `config-panel.tsx` 注册**保留不动**（兜底，暂不复用进 Block 1）。

---

## 九、当前状态与待办（2026-10-08 落码后）

- ✅ **已落码并 push**：三大块 + 后端查询/配置路由 + 装配，typecheck/build 绿，dist 入库（b096443）。
- ⏳ **真机验收待做**：装 `dist/` 后确认三块交互（配置保存生效 / 日志 5s 轮询 / 六表查询 + 筛选 + 横向滚动）正常。
- ⏳ **待升格**：定稿后把确定部分从本文升格到 `design/features/settings.md`（新增「设置页」功能条目），并在 `design/features.md` 总索引补一行。
- ⚠️ **过渡期冗余**：宿主插件详情页 `config-panel` 仍保留作兜底；待 Block 1 覆盖全量配置后退役（用户拍板"先不管"）。
- ⚠️ **已知边界**：`/db-query` 不做服务端分页（客户端自筛选，`LIMIT N` 仅取前 N）；Block 2 用轮询**不接 SSE**（用户明确选择，非遗漏）。

---

## 十、第二轮：真机反馈重构（2026-10-08 用户逐条反馈，已落码）

> 首轮 `b096443` 真机看完后用户给了整页级的反馈，本轮全部落码；冒烟 **728/0**（`[25]` 新增 7 条守卫 + 旧调试页 7 条断言迁移）。

### 10.1 布局与风格（用户拍板）
- **去三个卡片黑框**：每块 = 「icon + 标题（右侧可放控件）」+ 内容（`ui/SectionHead.tsx` 新建，三块共用，登记进 `ui/index.ts` barrel）。
- **宽度单源**：设置页容器改用 `PANEL_CONTENT_ID` + `PANEL_CONTENT_STYLE`（1120/760，任务配置 / 执行记录同款）——原 920 自定宽被用户点名「宽度要跟着任务配置执行记录这段」。
- **Block 1 两栏**：左 = 插件设置表单（字段 `repeat(auto-fill, minmax(200px,1fr))` 栅格，一行 2~4 个），右 = 「配置预览」只读（`minmax(240px,1fr)` ≈ 1/3）。原「当前生效配置」不再垫底。
- **Block 2**：标题居左，自动刷新 + 刷新钮居右；日志区 `max-height: 360px` 内部滚动。
- **Block 3**：标题居左，六表 Segmented 居右。
- 文案：`产品配置 → 插件设置`、`当前生效配置（只读） → 配置预览（只读）`（中英）。

### 10.2 默认值语义（用户拍板「一层一层往下挖」）
- **显示默认值**：`GET /config` 返回 `{ config, defaults }`；`config` 本就是生效值（用户没设 = 系统默认），`defaults` 供预览面板标注「（默认）」。`src/config.ts` 新增**全量** `CONFIG_DEFAULTS`（补齐 `statePath`/`tasksDir`/`defaultProvider`/`defaultModel`），schema `.default()` 全部引用它 —— 默认值从此单源。
- **避免重复存储**：`updateScopeConfig` 重写 —— 值**等于系统默认**的字段不写用户层，并新增 `dropUserLayerConfig`（走 `configEditor.edit` 删用户层键）。改回默认值 = 撤销这条用户设置。
  - 通道选型（读宿主源码定案）：`settings.mutate` 会校验 `isVolatilePath` ⇒ 本仓配置不能标 volatile ⇒ **必炸**；`scope.update` 是 merge 语义删不了键 ⇒ 只有 `configEditor.edit` 能删（与 `persistTasksInline` 同款已验证通道）。
  - `defaults` 响应**只投影可编辑白名单**（`configView()`），不把 `tasksInline` / `debugSnapshot` 吐给浏览器。

### 10.3 Bug 修复
- **表单单位换算**：表单状态原先存显示单位（秒）、渲染又 `toDisplay` 一次 ⇒ 改时间字段显示成 0.12 秒。改为**状态恒存服务端值**（毫秒），写入时 `fromDisplay`、显示时 `toDisplay`。
- **NumberInput 删空被 clamp**：`Number('') === 0` ⇒ 按 Delete 删空失焦后值变 min（用户报「按 Delete 不管用」）。`ui/Field.tsx` 的 `commit` 空串按无效输入回弹原值。
- **错误可诊断**：`settings-data.ts` 的 `getJson` 先读 text 再解析；非 JSON 响应抛 `HTTP <码> · 返回的不是 JSON：<前 120 字符>` —— 真机 `Unexpected token 'o', "not found"` 之谜的兜底（该响应体来自 SPA 兜底 / 网关层，说明 `/db-query` 未被路由命中；新文案一次定位）。

### 10.4 冒烟断言迁移与新增
- **迁移 7 条**：旧调试页删除（b096443）时守卫断言没跟着迁，基线一直 714/7。逐条迁到新落点：日志轮询开关守卫、失败保留上次结果、`describeEventChannel` 导出（上屏落点随页删除，收窄为导出守卫）、量词 `t()` 指向 `db-table.tsx`、plugin_log 白名单三处齐（DUMP_TABLES + defaultOrder switch + SETTINGS_TABLES）、产物一致性改锚 `db-query`/`SectionHead`、页面覆盖的设置页订阅改指 `index.ts` 的 `scope.refresh`。
- **新增 `[25]` 7 条**：默认值单源 / 不重复存储 / 响应投影 / 表单换算 / 数字框删空回弹 / 可诊断错误 / 宽度单源。

### 10.5 未决
- ⏳ `/db-query` 404 根因待真机确认（服务端需重装/重启加载新 dist；若仍复现，新错误文案直接给状态码与响应片段）。
- ⏳ 真机验收清单 = §九 的三项 + 本轮布局（两栏 / 限高滚动 / 表切换居右）与默认值标注。

---

> 🧠 **From Hindsight memory** — 本次未调用（按用户要求只写本地文档，未入长期记录）；事实均取自本仓库源码（`src/store.ts`/`src/index.ts`/`src/client/*`）与 `docs/design/data-model.md`，已在正文标出处。
