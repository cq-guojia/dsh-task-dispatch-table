# 进度（进行中）

> **这是什么**：本仓库**唯一**的在办事项真源 —— 现在做到哪、欠什么、下一步做什么。
> **已结案的**看 [`PROGRESS-HISTORY.md`](PROGRESS-HISTORY.md)（一行一条：时间 / 完成了什么 / 过程文档）。
> **文档规矩**看 [`README.md`](README.md)。
>
> 本文件**只装在办的事**；事项结案即从本文件移入 `PROGRESS-HISTORY.md`。
> ⚠️ README / issue / 聊天记录都不是真源。

---

## 一、当前状态

### 1.1 UI 基础层统一（样式专项）—— ✅ **完成封卷**（P0–P6 + 尺寸/圆角/字号归一 + 死代码清理）

> **已结案，详见 [PROGRESS-HISTORY.md](PROGRESS-HISTORY.md)**。规格 = [design/ui-foundation.md](design/ui-foundation.md)，手册 = [design/ui-style-guide.md](design/ui-style-guide.md)；过程 = [worklog/ui-foundation.md](worklog/ui-foundation.md)（P0–P6）、[worklog/size-unification.md](worklog/size-unification.md)（尺寸归一）、[worklog/ui-alignment-round.md](worklog/ui-alignment-round.md)（本轮收口 + 审计）。

2026-10-01 全专项完成：① 宿主源码核实（0.2.0-rc.2 五包）；② P0 token 层 + 统一样式入口；③ P1 分段控件全站归一（含编辑器官方覆写 / 星期多选 / 版本开关 / 预览两态）；④ P2 按钮 / 图标钮；⑤ P3 输入 / 前缀框 / 数字框（原生 number / select 清零）；⑥ P4 日期时间 / 开关；⑦ P5 明暗特判 7 → 0；⑧ P6 收尾（`C` 表 3 份删、宿主变量 255 → 0、自注入 0、字面量 token 化、高度三档）；⑨ **2026-10-01 收口**：尺寸归一（sm24/md28/lg32，默认 lg）、圆角统一 `radius-md`、字号跟档、死代码清理（详见 [worklog/ui-alignment-round.md](worklog/ui-alignment-round.md)）。

### 1.2 落码完成、⏳ 真机验证待做（用户装 `dist/` 实测）

| 事项 | 状态 | 真机验证清单 |
|---|---|---|
| 任务展开三面板（基本信息 / 执行记录 / 日志）真机验收通过 + 基础信息收尾 + token 口径修复 | ✅ **2026-10-03 真机验收通过，已结案归档**（见 [PROGRESS-HISTORY.md](PROGRESS-HISTORY.md) 2026-10-03） | 规格 [design/features/task-expand-panels.md](design/features/task-expand-panels.md) §3.1b · §3.1d · 过程 [worklog/expand-panels-round4.md](worklog/expand-panels-round4.md) |

> 已验项（用户 2026-10-01 复核）已移 [PROGRESS-HISTORY.md](PROGRESS-HISTORY.md)：主界面+运行态摘要、高级区第二轮+多 Agent 协作、表单弹窗观感第五轮+脏判定、附加文件选择+上传（U15①）、UI 基础层收口（冒烟 390）、新增/编辑任务（U16，用户简单验收、问题后续反馈）。

### 1.3 新增 / 编辑弹窗改「布局分栏」（U21）—— ✅ **完成封卷**（10-01 落码 + 10-02 微调 + 10-03 真机验收通过）

> **已结案，详见 [PROGRESS-HISTORY.md](PROGRESS-HISTORY.md)**。过程 = [worklog/editor-split-pane.md](worklog/editor-split-pane.md)；口径定型 = [design/features/creation-edit.md](design/features/creation-edit.md) §七-B。


### 1.4 任务文件上下文（会话里「接收 / 随附 / 产出」）—— ✅ **完成封卷**（2026-10-03 多轮定稿 + 真机实测通过）

> **已结案，详见 [PROGRESS-HISTORY.md](PROGRESS-HISTORY.md)**。过程 = [worklog/task-file-context.md](worklog/task-file-context.md)（含**版本基线**：v0.0.1 / HEAD `4ecd310`，回滚用）；宿主事实已回写 [`design/external/dsh-capabilities.md`](design/external/dsh-capabilities.md) §会话与派发。

2026-10-03 整包完成并真机验收：① 顶部输入区 = 接收 + 任务附件两组（数据源 = 实例快照 `resolvedDeps` / `attachments`，不依赖宿主透传）；② 文件全横向排 + 按内容宽（无最小宽、max 40ch）+ 跑马灯；③ 前置任务一排两个 + 正方形序号徽标（代替 4px 竖线）；④ 来源标记方括号前置 `[链接]foo.md`；⑤ 顶部区搬进同一滚动容器（全弹窗单滚动条）；⑥ 滚动留白收口（frame 上下 17/17、左右 34，tfc 不自带左右 / 上 padding）；⑦ 创建时间挂标题行尾部；⑧ 回执裁决口径修正（见 U24/U25）。冒烟 488/0。

### 1.5 立即执行（手动触发一次调度）—— 🔵 **落码完成**（2026-10-03），⏳ 真机验证待做

> 用户 2026-10-03 拍板新增。语义 = **提前触发一次调度**，与既有逻辑零冲突：卡片展开区右下按钮组、在「删除」与「编辑」**中间**插「立即执行」→ 确认框「你确定要立即执行此任务吗？」→ 走 `POST /tasks/run`。过程 = [worklog/manual-run.md](worklog/manual-run.md)。

- **前置未达标**：与正常调度**完全一致**（不建执行记录、只记 `task_log`）；区别只是额外把原因回给前端，用**统一 Toast** 告诉用户「没执行成功 + 为什么」（手动触发看不到后台日志）。
- **同任务在飞**（`dispatched` / `running`）⇒ 拒绝并提示「该任务正在执行中，暂时不能再次执行」，防双跑。
- **不看开关、不看上次失败**：按 id 从全量定义取（绕过 `enabled` 过滤）。
- 落库形态与 Loop A 一致：`dispatched` + 派发快照，**不打 `pending`**（`pending` 是重试回退专用、窗口外会被删行）；打 **`run_type='manual'`**（新列，2026-10-03 落地 U5 预留字段的一半；读路径 / UI 展示暂不消费，见 [data-model.md](design/data-model.md) §一）。
- 代码：`scheduler.runNow()` + `POST /tasks/run`（业务性拒绝回 200 + `ok:false`）；前端 `task-list.tsx` 按钮 / 确认框 / Toast + 13 个中英文案键。typecheck / build 绿、**冒烟 495/0**。

### 1.6 执行记录总查询页（流水账）+ 任务选择器 —— 🔵 **落码完成**（2026-10-04 三版定稿），⏳ 真机验证待做

> 用户 2026-10-03 发起：主界面顶部一级 tab「执行记录」原来是「最低版本、最最简化的测试验证界面」（两个原生 select + 原生表格），**已重写**为全部任务的执行流水账（日期小字行 + 一条条独立块；第三版起无外框、无竖轴）。
> 规格 = [`design/features/execution-timeline.md`](design/features/execution-timeline.md)；任务选择器 = [`design/ui-foundation.md`](design/ui-foundation.md) §5.4 + [`design/ui-style-guide.md`](design/ui-style-guide.md) §二 / §三「待抽象」第 9 项；过程 = [`worklog/execution-timeline.md`](worklog/execution-timeline.md) §八（第二版返工）/ §九（第三版定稿）。

**落码位置**：视图 = `src/client/records-timeline.tsx`（新）；共用控件 = `src/client/ui/TaskPicker.tsx`（新）；接线 = `src/client/index.ts` 的 `tab === 'records'` 分支（**排在最外层 `data === undefined` 门槛之前**，新页走 HTTP 不吃调试快照）。

**已定参数**：首屏 **50** 条；默认时间档最近 **3 天**；**硬上限 2000** 后提示缩小范围；在跑色条用**蓝 + 缓慢脉动**；天标签 **sticky 吸顶**；状态档 = 全部 / 成功 / 失败 / 未执行 / 运行中（`dispatched`+`running` 合并）。

**形态**：天级大标签在最上面（朋友圈式），天下列当天各次执行的块；块 = 一次执行，成功/失败**不用图标**，只用块左缘 4px 色条（绿 / 红 / 黄 / 蓝脉动）；整体倒序（服务端顺序，客户端不重排）；点块打开会话（只传 sessionId）。

**服务端零改动**：`GET /tasks/instances`（`src/index.ts:828`）当初即按「未来总查询页共用（决策 55）」设计，`store.listInstancesByQuery`（`src/store.ts:820`）**游标分页已实现**，客户端 `fetchInstances`（`src/client/query.ts:112`）已带回 `nextCursor`。

**已清死代码**：旧测试屏整段 + `statusFilter` / `taskFilter` / `expanded` / `titleOfTask` / `instances` 派生 / `basenameOf` / `Fragment` import + 15 个旧屏专用文案键 + 客户端调试快照的 `instances` / `events` 声明（宿主协议未动）。

**2026-10-04 专家组评审 + 自主修复**（三路只读评审：功能/抽象/硬伤）：修掉 8 处真硬伤 —— ① 满 2000 条后改过滤**白屏**（上限只拦续拉）；② 续拉失败**无提示 + 重试风暴**（补错误态 + 暂停自动续拉）；③ `IntersectionObserver` 每页重建（改只建一次）；④ 按「无任务的工作区」过滤**返回全表**（服务端空集合收口，instances/logs 两条路由同修）；⑤ 工作区 + 任务过滤**优先级打架**（服务端改 AND，客户端改工作区时清掉掉队任务）；⑥ 天分组 key 与排序 key **不同源**（改本地日历日，弃用 `logical_date`）；⑦ 空态文案恒判「有过滤」；⑧ 续拉失败错误态被吞。另修 15 处抽象/规则问题（锚点样式与 size 翻译共用 `Field.tsx` 一份、状态桶与色调语义上提 `status-text.ts` 单源、内容列锚点上提 `PANEL_CONTENT_ID`、落 `.dsh-tdt-ellipsis`、加 `--tdt-z-sticky`、复用 `Loading`/`Button`、插值走 `tt`、删 3 个孤儿文案键、行组件 `memo` 等），详细清单见 [worklog/execution-timeline.md](worklog/execution-timeline.md) §七。

typecheck / build（`dist/` 入库）/ 冒烟 **539/0** 全绿（断言方式改为**读源码钉行为**，替换原先「产物里有没有这个词」的弱断言）。

**2026-10-04 版式返工（用户当场否掉第一版）**：第一版「单行条目 + 当天一截竖线 + 状态下拉 + 白底」被评为「丑得可怕」⇒ 按用户逐条要求重做：① 过滤行**左 = 状态四档分段控件**（全部/成功/失败/进行中，与任务列表同款；状态下拉删除）＋**右 = 时间范围·工作区·任务**；② 主体改**灰底区块**（`--tdt-surface-sunken`，居中限宽）并**去掉条目的圆角卡片框**；③ 竖轴**从区块顶贯穿到底**（画在伪元素上 ⇒ 空态/加载/失败态也连着）；④ 天节点 = **10px 圆点** + 日期 + 当天条数（吸顶保留）；⑤ 每条**两行**：第 1 行 名称 + 状态 + 查看会话；第 2 行 工作区 · 计划 · 实际 · 时长 · Token ｜ **产出物 chip**（可点开预览，`onOpenFile` 本次接入）；失败 / 未执行有原因时补第 3 行备注 —— 卡片面板的八项元素全在。过程与踩坑见 [worklog/execution-timeline.md](worklog/execution-timeline.md) §八。

typecheck / build（`dist/` 入库）/ 冒烟 **549/0** 全绿（新增版式断言 6 条 + 反向断言 1 条）。
>
> **2026-10-04 第三版定稿（用户第三次返工：撤框去轴 + 块化 + 点击展开）**：① **撤掉**灰底外框与贯穿竖轴（含天节点圆点）——整页铺在宿主面板底上；② 日期改成**一行小字**（时钟图标 + `日期 · 星期 · N 条`），**不吸顶**；③ 每条 = **自带状态色浅底（8%）的独立块 + 左缘 5px 方角通高竖条**，块间 **4px**；④ 折叠态产出物**只给图标**（基础层 `.dsh-tdt-chip` 28×28 浅底板，最多 3 个 + `+N`）；⑤ **点块 = 就地展开**（手风琴单开）：全量产出物（图标 + 文件名，可点开预览）+ 该次执行的**事件流水**（`fetchEvents(instanceId)`，懒取 + 缓存 + 序号作废），**只有点「查看会话」才开会话**。顺带**修掉一处真 bug**：产出物 chip 此前在卡片面板与执行记录页各有一份**同名不同皮**的 `.dsh-tdt-rec-out`（同一页面互相污染）⇒ 收编为基础层唯一实现；4 个状态浅底 token 落在 `tokens.ts` 单点。typecheck / build 绿、**冒烟 556/0**。
>
> 过程与踩坑见 [worklog/execution-timeline.md](worklog/execution-timeline.md) §九。

### ~~1.7 工作区候选真源统一 + 顶部下拉收编~~ —— ✅ **2026-10-04 真机验收通过，已结案**（见 [PROGRESS-HISTORY.md](PROGRESS-HISTORY.md)）

> 过程 = [`worklog/workspace-options-unification.md`](worklog/workspace-options-unification.md)（已封卷）；口径真源 = [`design/ui-foundation.md`](design/ui-foundation.md) §5.4；使用规范 = [`design/ui-style-guide.md`](design/ui-style-guide.md) §二 / §三「待抽象」第 9 项。
> 结论要点（供后人不重复排查）：三处「选工作区」候选一律取 `GET /options`，取不到显示「暂无可选」**不回退反推**；任务列表顶部手搓下拉已收编为 `SelectField`；允许「选到没有任务的工作区」的空态。收编后选中态为打勾（与编辑器一致，属预期变化）。

---

## 二、未决项

> 📌 下表 U1–U6 / U9 为用户此前明确推迟的 backlog；**U18 已封卷**（移 [PROGRESS-HISTORY.md](PROGRESS-HISTORY.md)）；**U20** 为 2026-10-01 审计新立的「待抽象」专项。

| # | 问题 | 现状与影响 | 将来怎么解（方向，未定） |
|---|---|---|---|
| U1 | **中途重启的续跑 / 补跑能力缺失**（2026-09-23 真机暴露，用户拍板记为后续项，**本次不处理**） | 插件进程重启（含升级）会随进程失去既有 agent handle ⇒ 在跑实例被 `startupScan` 置 `unknown` ⇒ 静默观察 65 分钟判死 ⇒ 因默认 `retry.maxAttempts=1` 直接 `failed`。**注意：即便用户在 UI 手动「继续」会话，今天也仍然交不了回执**——`task_dispatch_table_receipt` 是在**派发的 `setup` 里按 agent 作用域注册**的，恢复/重建出来的会话里没有这张工具。**自动化任务必须扛得住服务重启**（宿主重启、机器重启同理）：要么接着跑，要么重头跑 | ① 启动时对未终态实例做**会话再采纳**（re-adopt：找回会话 + 重新注册回执工具 + 重新登记 handle），并补发一次追问 ⇒ 「手动继续」这条路才真正通；② 会话确实已死的，判死时给一次**因重启中断**的补跑，且该额度独立于用户配的 `retry.maxAttempts`（不与正常失败重试混算）；③ 补跑要处理**遗留副作用**（上次会话可能已产出半成品文件），需约定重跑前清理或给幂等语义 |
| U2 | **失败即归档**，排查时找不到现场（同上推迟） | `finishTerminal` 成败都 `archiveSession`，会话从列表消失（日志仍在磁盘）。真机已两次造成「想排查时会话不见了」 | 配置化 `archive.on`（`succeeded` 或 `always`），是否改默认待用户拍板 |
| ~~U3~~ | ~~产出只验「存在 + 新鲜」，不验内容~~ → ✅ **2026-10-03 用户拍板结案** | ~~`checkReceipt` 三道闸 = status 合法 / 文件存在 / `mtime > dispatched_at`~~ | **用户拍板（原话）**：「**只要他交出来的文件确实存在、格式是对的，就不用管**」「大模型是不是企图蒙混过关，你不用去管」⇒ ① **去掉 mtime 新鲜度闸**（那道闸会误伤「复用/检查已有文件」类任务：真机任务是判断 `uuid.txt` 是否存在、存在就不动它，agent 如实回执该文件，但文件没被改写 ⇒ 被判 `output-stale` 失败，用户看到「文件明明在」）；② **内容约束不做**（用户明确不要）。现行三道闸 = 回执存在 / status 合法 / outputs 存在 |
| U4 | **`logical_date` 是否显式注入尚未定** | 真机 `once8` 实例日期 `2026-09-23`，agent 产出却是 `work-report-2026-09-24.md`。待确认是任务提示词里写了明天日期，还是模型自己算的；后者说明**日期不该让模型猜** | 若属模型自算 ⇒ 把 `logical_date`（及期望日期格式）显式写进派发消息，与「回执不许模型传 session」同理：**凡不由模型决定的，一律由调度器注入** |
| U5 | **执行记录是否带「定义版本 + 配置快照 + 来源」**（`def_revision` / `def_snapshot` / `run_type`，**已设计、未拍板**；**2026-09-28 演进**：快照方向已随**决策 41** 拍板——def_snapshot 精简为执行所需字段、派发落库时固化，落码并入 U13） | 现在执行行只引用 `task_id`，**不记录当时那份配置** ⇒ 用户改完配置就回答不了「这次跑的是哪一版」；且分不清这次是**按点调度 / 用户手动重试 / 补跑**。直接影响「点开一条记录看当时的配置」与「失败点重试」按钮 | ① `def_snapshot` 存当时配置 JSON（Airflow 有 `rendered_task_instance_fields` 同款）；② `run_type` 区分 scheduled / manual / retry / backfill（Airflow 的 `run_id` 前缀就是 `scheduled__` / `manual__`）；③ **自动重试仍走行内 `attempt+1`（决策 10 不动），用户手动重试 = 新建一行 `run_type='manual'`** ⇒ 不吃自动重试预算、审计清楚；④ 唯一键若加 `def_revision`，连「月任务改成年任务后锚点撞车」也一并合法 |
| U6 | **面板收尾**：回收「数据通道诊断」临时行与 configForms/settingsScope 兜底块（暂缓，等链路稳定后一并做） | rc.1 上 HTTP 是唯一能出数据的通道，兜底块死代码 | 仅留 HTTP 一条真通道，删除诊断行与兜底块 |
| U7 | ~~依赖语义边界未拍板~~ → **已定型（决策 33，2026-09-26）** | `latest_success` 改判「上游最近一条必须 `succeeded`」（失败/在跑 ⇒ 阻塞）；删 `freshness`；**不做**水位线/`consumed_upstream` 列/`consumeOnce` 开关；上游「错过」时复用旧产出**只告警不拦**（已知风险，用户接受）；必修 `getLatestSuccess` 排序改 `scheduled_at` | ✅ 已定型 → 剩落码 + 真机验证（里程碑 12），见 [worklog/dependency-semantics.md](worklog/dependency-semantics.md) |
| U8 | ✅ **已真机验证通过**（列与写回路径已落地且生效） | `extractTokenUsage` 已做**多位置 × 多字段名**探测：位置（`usage` / `tokenUsage` / `tokens` / `data.usage` / `detail.usage` / `message.usage`）× 字段名（`total` / `totalTokens` / `total_tokens` / `prompt+completion` / `input+output` / 下划线命名）。首个事件会打印一次「会话事件字段：…」 | ✅ 真机验证：宿主事件已暴露结构化 `usage`，`token_in` / `token_out` / `token_in_cache` 三列正常取值写回；无结构化 usage 的事件三列留 `null` 不阻塞（已含在 172 项冒烟 + 真机核验内） |
| U9 | **依赖（前置任务）真机验证暂未做**（用户 2026-09-26 决定留口子） | 判定逻辑已由冒烟 [9] 八项覆盖；当前无真实多任务依赖场景，构造成本高 | 待**正式用到依赖功能**时按 worklog 第六节「复验清单」补验：放行 / 阻塞（依赖不存在 id）/ 复用告警三条 |
| U10 | **「继续对话（开分支）」按钮**——✅ **完成收口（2026-09-27 真机验证通过，决策 38 含 ⑦）** | 头部「继续对话」按钮（从最后一轮 = 全量分支）+ 每轮回复操作行官方分支 icon（`fork({atSeq: 该轮 seq})` 从该条消息截断开分支）；统一确认框 = 官方 Modal + Button（明暗自适应）；先关弹窗（release 源会话）→ `uiWorkspace.openSession(childId)` 官方跳转；fork 失败留框内提示。冒烟 108 项全过 | 无遗留 |
| U11 | **产出物打开与展示方式**（2026-09-27 发起；同日拍板 = 决策 39 并落码完成；09-28 第二轮补交付文件官方化、第五轮修「链接不可点」根因） | ✅ 真机验证通过：inject `remote.workspaceFiles`（**含 dotted 键**）+ `file-preview.tsx` 预览引擎 + 页面级唯一 dock 分栏推压 + 工具卡路径 / md 正文 fileMentions / 交付文件卡全走统一 `openFile`；错误态照官方错误码；冒烟 139 项全过 | 场景 2（任务产出物展示）转 U12；产出登记见 U12（B+C）。**2026-09-29 收尾打磨四项（代码换行开关 / 图标官方 Tooltip / 面包屑 / 下拉选层箭头）真机核验通过 ⇒ U11 整条线 ✅ 收口**；相对名目录（含空目录 / 只含子目录）经 workspace-root 缓存 + 有界 BFS 解析为宿主绝对路径（`204cfdf`），面包屑无遗留边界 |
| U12 | **交付登记（任务产出物怎么被看见）**——✅ **方案已拍板（2026-09-28，决策 40 演进为 B-only + 禁止 present）**：插件作**唯一写入方**，回执成功时直写 `deliverables/presented`（files=校验 outputs，放宽到目录，可多目录+多文件混合）；**提示词禁止 LLM 调 `present`**（工具拒目录且调目录会报错），LLM 只在回执 `outputs` 声明产出（目录不限于网页项目）。已否决「插件 UI 自己画卡」 | 🔵 落码已推送（`7293bfc`）→ 真机复验暴露**弹窗交付卡不渲染**两轮：① `turn.data` 是 Map、对象式访问必为 undefined → `turnDeliverablesPresented` 兼容 Map；② 推送后复验仍不渲染 ⇒ 根因是**会话快照里压根无 `deliverables.presented`**（插件 `append` 被 `session/callId/sessionProjections` 缺失分支跳过 / 宿主 timeline 未重放）→ **数据源改为实例 `outputs` 权威**（合并快照去重，老任务免重跑即渲染）→ ③ 位置/样式对齐官方：删顶部区块、网格挂**最后一轮 turn-tail**（官方 DeliverablesTail 同位）→ ④ 网格仍在操作行下方：改作为 `tailSlot` 放在 `MessageIconActions` 之前，并补齐 `/api/present.host` 桌面不可用提示；同轮修订回执提示词（outputs 粒度：本任务专用文件夹→报目录；既有/按规范目录→逐个报文件）；冒烟 164 过 ⇒ **✅ 真机验证通过，U12 整条线收口** |
| U13 | **两层循环彻底解耦 + 派发快照（决策 41/42，2026-09-28 拍板并同日落码 + 热修）** | 真机暴露：`enabled=false` ⇒ 任务被 `loadTasks` 过滤出 `taskMap` ⇒ 对账 `taskOf()` undefined ⇒ `settleByReceipt` 提前 return ⇒ **已交回执的实例永久卡 running**（agent 实际已完成）；且对账实时重读活任务 JSON（retry / window / workspace / validStatuses），中途改设置会反向改写在飞实例裁决。定型表述见 [design/features/state-machine.md §0](design/features/state-machine.md)、落码记录见 [worklog/loop-decoupling.md](worklog/loop-decoupling.md) | 🟢 已落码 + **真机回归热修**：落码后真机发现"老库一条卡 running 的历史实例 → `startupScan` 转 `unknown` → 串行互斥把同 cron 任务新刻度永久挡死 ⇒ 执行记录零写入"。修复 = 串行互斥只认真正在飞的 `dispatched`/`running`，`unknown`（重启孤儿）移出阻塞集 + 30s 短宽限收口 + `running` 长期无活动（漏 created 致 `lease_until` 为 null）也收口 + `snapOf` legacy 回退防御默认值；本地复现（老 schema + 旧运行实例）验证新行照常写出。冒烟 162 项全过 ⇒ **✅ 真机验证通过，U13 收口** |
| U14 | **依赖快照：判定结果冻结 + 产出下传（决策 43，2026-09-28 用户点破并拍板，单独工作包）** | 排查确认两缺口：① `judgeDependencies` 命中上游实例后只读 `.status` 即丢对象，派发快照无依赖字段 ⇒ Loop B 发动（可能晚数分钟）时不知道「按哪条上游实例放的行」，上游间隙再跑成功就会错拿新产出；② 上游回执已校验的 `outputs` 列无人读取、`buildMessage` 不注入 ⇒ 下游消费前置产出零通道。定型与改动点见 [design/features/dependency-snapshot.md](design/features/dependency-snapshot.md)、排查叙事见 [worklog/dependency-snapshot.md](worklog/dependency-snapshot.md) | `InstanceSnapshot` 加 `resolvedDeps`（task/semantics/instanceId/scheduledAt/sessionId/上游 workspacePath/outputs）→ `judgeDependencies` 返回 `resolved` → `snapshotOf` 固化 → `buildMessage` 注入「上游依赖（本次已锁定）」段（产出按上游工作区绝对化）；Loop B 只读不重判、重试沿用；不改 DDL / `depends_on` schema。🟢 **同日落码**：冒烟 +8 = **172 项全过**，typecheck + build 过 ⇒ **✅ 真机验证通过，U14 收口**（复验点见 design §六） |
| U15 | **附加文件链路收尾**（2026-09-29 落码，决策 46；选择 + 上传已推送 `680d23f`） | ① ✅ **真机验证通过（用户 2026-10-01 确认：选择浏览/选中/卡片、拖拽+点选上传、超限与类型拒绝报错）**；② 附件（尤其 upload 落盘文件）与任务定义的**持久化关联未做**——目前 `attachments` 只在草稿层；③ 执行期如何把附件注入给 agent 未定 | ② 可能并入 P2 保存链路（任务定义 JSON 已有 `attachments` 字段位）；③ 注入形态（消息里贴路径清单 / 内容内联）待拍板 |
| ~~U16~~ | ~~新增 / 编辑任务的功能设计~~ → ✅ **2026-10-03 真机验收通过结案** | 需求口径 [creation-edit.md](design/features/creation-edit.md) + 数据设计 [data-model.md](design/data-model.md) §五 §六 + 决策 51；过程 [worklog/creation-edit-implementation.md](worklog/creation-edit-implementation.md) | 无遗留 |
| U17 | **主界面「下次执行」与运行中显示**（2026-09-30 真机提出 → 同日落码） | 现象：任务在跑时，卡片「下次执行」仍跳「下一槽倒计时」（如 8 分多钟），与「已经在跑」矛盾。**核实结论（源码级）**：只补**窗口内最晚那一槽**（`scheduler.ts` 的 `dueSlot` 只取 max、该槽已有实例行即 `undefined`、不向更早回退）＋ 同任务串行互斥 ⇒ `15:20`/`15:10` 永不补；`window` 只决定那一槽能晚多久跑，**非窗口内全补**。 | 🟢 **已落码（用户 2026-09-30 拍板）**：**不判断补跑时间**——`NextPill` 见 `row.running` 即改显「三个小方块脉动」活动指示（像手机充电），跑完才回到下一槽倒计时。曾试「显示补跑 15:30」（Plan A）**已撤**，`dueSlotAt` / 文案键全删（不留死代码）。冒烟 299 全过。见 [worklog/main-panel.md §8.6](worklog/main-panel.md) |
| ~~U19~~ | ~~删除 `decisions.md` 后遗留的 9 处口径冲突~~ → ✅ **已全部回改**（2026-10-01，用户拍板「以现在实现的为准」，逐条到源码核实后回改） | ① `skipped` 进 `task_instances`（三类场景，见 data-model.md 头注）；② 上游无记录 ⇒ **阻塞**（`upstream-not-succeeded`）；③ 会话名 `[TASK] YYMMDD-HHmm · 标题`；④ 预览 = **页面级唯一 dock**；⑤ `sessions.retain` **存在且必须调用**；⑥ 数据源 = **keyed**；⑦ U10 分支 **已实现**；⑧ 保留期 **默认不清**；⑨ 刷新按钮 **已不存在** | 无遗留；过程记在 [worklog/docs-reorganization.md](worklog/docs-reorganization.md) §2.7 |
| U18 | **UI 基础层统一（样式专项）** —— ✅ **已完成封卷（2026-10-01）**（P0–P6 + 尺寸/圆角/字号归一 + 死代码清理；结案行见 [PROGRESS-HISTORY.md](PROGRESS-HISTORY.md)） | 同一个控件（滑动块 / 按钮 / 下拉 / 输入 / 开关 / 日期时间）各处各写一份：分段控件 **10 处**（4 官方 / 6 自绘）、段高 **5 种**、设计令牌 **3 份 `C` 表**、内联数值字面量 **~151 处**、`body[data-ds-dark-theme]` 特判 **7 处**、**4 条 `<style>` 注入 + 2 套 id**。方案 [design/ui-foundation.md](design/ui-foundation.md)（四层架构 + 两轴 size×variant + 两档高度 + 明暗差异单点）、手册 [design/ui-style-guide.md](design/ui-style-guide.md) | ✅ **4 项源码核实已完成（2026-10-01，宿主 0.2.0-rc.2 解包 `theme`/`primitives`/`conversation`/`chat`/`renderer` 五包）**，结论唯一真源 = [design/external/dsh-capabilities.md](design/external/dsh-capabilities.md) §主题与设计变量：alias / static / font 三族全表；明暗判据**唯一** `body[data-ds-dark-theme]`（`prefers-color-scheme` 归宿主内部）；官方 `SegmentedControl` 指示器算式**保留**（由组件 JS 内联变量驱动 ⇒ 仍按计划自绘统一体）；三处疑点裁决 = `state-warn-primary` **真** / `state-warning-primary` **死**、`focus-ring-color` 真但默认 **`transparent`** / `border-focus` **死**、宿主字号体系 **成立**（11/12/13/14/16/18/20/24 + strong）。**顺带揪出本仓 5 个不存在的变量名**（`interactive-bg`、`border-focus`、`state-warning-primary`、`dsh-elevation-prominent`、`dsh-radius-panel`，涉 **7 个使用点**，一直取硬编码兜底色、明暗不跟随 ⇒ 真 bug，P4/P5 一并修）。**②✅ P0 地基已落码（2026-10-01，冒烟 372/0、界面零变化）**：`ui/tokens.ts`（token 表，直绑宿主真变量，明暗差异只此一处）+ `ui/style.ts`（单 id 注入器、按域登记、`tokens` 恒最前）+ `ui/index.ts`（唯一出口 + `ensureUiBase()`），入口调一次。高度档位已按 sm 24 / md 28 落码。**③✅ P1a 分段控件三处自绘已落码（2026-10-01，冒烟 376/0）**：`ui/Segmented.tsx`（`size` × `variant` 两轴 + badge/block/label + aria-pressed/焦点环）+ `ui/controls-css.ts`（变体只覆盖两个颜色变量）；旧的 4 份就地样式对象（`segmentedStyle`/`segmentStyle`/`segTrackStyle`/`segStyle`/`tabStyle`/`countBadge`）已删。**P1b ✅**（全站分段控件已统一到 Segmented；仅版本开关按用户拍板保留单段 toggle），**下一步 = P2 按钮统一**（15+ 套内联样式收敛），之后 P3→P5 分期，每期 build + 冒烟正/反断言 + 明暗双主题真机走查 |
| ~~U21~~ | ~~新增 / 编辑弹窗改「布局分栏」~~ → ✅ **2026-10-03 真机验收通过结案** | 四条拍板（两栏并存不互斥 / 撤遮罩 / 留够最小宽 / 会话弹窗让位）+ 宽度定 520；过程 [worklog/editor-split-pane.md](worklog/editor-split-pane.md) §六 | 无遗留 |
| U20 | **UI 基础层「待抽象」残留**（2026-10-01 审计登记，**未做**） | 「一类控件一个实现」已达标；残留的是**同构重复 / 该上提未上提**：省略号三件套 19 处 · 会话域手搓图标钮 · 6px 拖拽条（两处同款）· 卡/浮层外壳 7 处 · `index.ts` 手搓中性 Toast · 缺 `Textarea` / `Checkbox` 基础层件 · token 兜底字面量不统一 · 实面反白字写死 `#fff` | 逐项见 [`design/ui-style-guide.md`](design/ui-style-guide.md) §三「待抽象」；属改动中等以上，待排期 |
| ~~U22~~ | **任务文件上下文（会话里三类文件怎么展示）**——✅ **完成封卷（2026-10-03 真机验证通过）** | 看会话时分不清三类文件：① 前置任务给了什么；② 任务设置里加了哪些附加文件；③ 产出了什么。现状 = 前置任务与附加文件都塞在「收到执行请求」折叠文本里，很难找。**源码核实（0.2.0-rc.2）**：官方 `UserMessage.content` 支持 **`file` 内容块**（配 `ctx.attachments` 附件库）⇒ 可原生渲染成附件卡且 fork 带得走；file 块发模型前被换成一行路径文字 ⇒ **零额外 token**；附件引用**无路径**（字节副本）⇒ **文件夹走不了** | **已拍板**：附加文件走 A（官方 file 块，复制一份）；前置任务产出走 B（文本 + 弹窗顶部自绘「接收 · 来自 N 个前置任务」）；产出卡不动（turn-tail 官方同位）。**不改 DDL、不改提示词语序**、不管老数据。过程 [`worklog/task-file-context.md`](worklog/task-file-context.md)。⚠️ **2026-10-03 三轮评审 + 用户两轮点名后定稿**：① 顶部输入区 = **接收 + 随附**两组；② 排版按官方基线（左右 34px，**上 34 下 16**，纵向收归稳定钩子类消除 18px 跳变）；③ **文件全部横向排**（chip 宽跟文件名：min 8 字 / max 20 字 + 省略 + hover 全文）；④ **前置任务一排两个**，每块 = 任务名 + 产出物（同样横排），任务名前 **4px 短竖线**做标记（原为 3px 跨两行的块前分隔线，用户 2026-10-03 看过效果后去掉了，两条重复）；⑤ 长名与折叠规矩齐全（>4 与 >3 两级折叠）。⑥ 术语统一叫**「前置任务」**（不叫「上游任务」）。⑦ 卡片**创建时间移到标题行尾部** `[2026-10-03 创建]`（不再单起第三行）。**进弹窗只传会话 id**，快照 / 产出 / 标题一律自取（三处入口已统一）。⚠️ **2026-10-03 第四轮真机返工**：任务块加官方任务图标、文件名改走全站唯一 `MarqueeText`（**所有显示不全的名字都 hover 跑马灯**）、chip 改 `flex:1 1 auto` **平分容器**（不再右边空一大块）、组标题「随附」→「**任务附件**」、来源「工作区」→「**链接**」、**创建时间人人有**（老定义缺 `createdAt` 显示占位，不编造）、筛选角标改**正圆**、前置任务名前改 **4px 短竖线**（换掉太大的分支图标）、**块前那条 3px 跨两行竖线去掉**、来源标记改**方括号前置**（[链接]foo.md）、前置任务加**序号徽标**（灰底圆角小方框 + 9px 数字，在竖线后）、文件 chip 改**按内容宽 + 40ch 上限**（原先平分宽度会拖空白）、基础信息附件名同样限 40ch、序号块改正方形+提亮、附件 10 个以上才折叠、**顶部区不再自带滚动条**（整个弹窗只一个滚动条）。冒烟 488/0 |
| ~~U24~~ | ~~回执裁决时机被动~~ → ✅ **2026-10-03 用户拍板并落码** | ~~收到 `turn/end` 就裁决~~ ⇒ 改为 **等 `agent.whenIdle()`（会话真正空闲）再裁决**。起因：`/goal` 会**自动续跑多轮**（宿主 `kick()` = `while (await this.turn())`），`turn/end` 只是**一轮**结束、会话仍在执行 ⇒ 轮次间隙验收＝「人家还在干活就去收卷」。**落码**：`turn/end` 只记信号（供 sweep 判追问）不再裁决；新增 `settleWhenIdle()`（防重入、无 handle 时交给 sweep）；sweep 里 `turn/end` 分支**去掉 `continue`**，让租约 / 失联兜底仍然生效（否则卡死实例会永久挂 running）。冒烟 +2 | ✅ 已结案 |
| ~~U25~~ | ~~回执「第几次生效」提示词与实现矛盾~~ → ✅ **2026-10-03 用户拍板并落码** | 回执工具描述写「只认第一次」，实现却是取最新一条（`seq DESC LIMIT 1`）= **认最后一次**。**用户拍板：以最后一次为准**，且提示词要说明「再次提交会**整体覆盖**，先前报过的产物必须**一并带上**（不回带＝放弃）」。**落码**：`receipt.ts` 工具描述 + 末段指令各加一处（追问重发的也是同一段 ⇒ 询问场景同口径）。冒烟 +1 | ✅ 已结案 |
| U26 | **产出物预览：PDF / SVG 预览不出**（2026-10-03 用户报；**已落码**、⏳ 真机复验待做） | 真机报错 `client api: workspaceFiles/readBytes expected 3 business argument(s) … got 2` ⇒ **根因 = 取数参数传错，请求根本没发出去，与渲染无关**。我方手写的 `WorkspaceFilesFace` 把 `readBytes` 第三参声明成可选（`file-preview.tsx:171-174`），调用处 `:307` 只传 2 参；官方签名该参**必传**（读全量 = 传 `{}`，非不传）。**PDF/SVG 恰是仅有的两个走 `readBytes` 的类型**（`read` 文本类碰巧传了 3 参故正常）⇒ 现象与类型严格对应。⚠️ 另查出我方 `range?: [number, number]` 元组形状**与官方不符**（官方 = `{offset?,length?}`）。**已作废的推断**：webview 无 PDF viewer / SVG 尺寸问题——皆非 | **改法（已定，待请示后落码）**：①`readBytes(sessionId,path)` → 加 `{}`；②`WorkspaceFilesFace` 第三参改必填 + range 形状改 `{offset?,length?}`（对齐官方防再踩）；③冒烟补「必须带第三参」正/反断言。**渲染层不动**（PDF 仍原生 iframe、SVG 仍 `<img>`，与官方手法一致；官方 PDF 走 pdf.js 属内部依赖、**不引**）。官方事实 [external/dsh-capabilities.md](design/external/dsh-capabilities.md) §文件预览的官方渲染能力 · §`workspaceFiles` 四个方法的业务参数个数。过程 [worklog/file-preview-pdf-svg.md](worklog/file-preview-pdf-svg.md) |
| U27 | **工作区之外的文件：第一排导航失效**（2026-10-03 用户报，**已落码**、⏳ 真机复验待做） | 附件落在宿主数据根（`~/.dsh/storages/...`，真机例 `attachments/`），**不属于任何工作区**。原先第一排照旧给全导航：▾ 选层下拉把 `root/.dsh/storings/.../attachments` 全列出来、面包屑逐段可点、← 返回 / ↑ 上一层齐全——**点任意一个必然报 `outside-workspace`**（官方 `list` 限工作区内），纯属给必然失败的入口。**已落码**：`list` 结果命中 `outside-workspace` / `not-found` / `lookup-not-found` ⇒ 第一排整条换成**只读完整路径**（`crumbbarPlain`）：▾ 选层、面包屑点选、← 返回、↑ 上一层**全部不渲染**，只留 ✕ 关闭；路径过长省略号截断 + **hover 跑马灯**（用户 2026-10-03 验收点正：「啪-啪-灯」= 跑马灯滚动声，我第一遍误读成"禁止交互"；复用 `marqueeOn/Off`，**不可点**）。判定依据 = list 的**真实错误码**，**不靠 `workspaceRoots` 猜**（根学不出来会误判成"在区内"） | ✅ 判定真源 = 官方错误码（`bareCode` 裸段）；typecheck 绿、**冒烟 501/0**、build 过。第二排的复制 / 刷新**保留**（刷新 = 重读文件内容，文件本身可读，与目录导航无关）。过程并入 [worklog/file-preview-pdf-svg.md](worklog/file-preview-pdf-svg.md) |
| U31 | **任务选择器替换「前置任务」下拉的时机与范围**（2026-10-03 随执行记录总查询页登记；2026-10-04 更新） | 用户要求带搜索的任务选择器**必须抽象成共用控件**（「很多地方都要用」）。✅ **其中「工作区候选真源统一」已于 2026-10-04 单独完成**（三处一律取 `/options`，任务列表顶部手搓下拉收编为 `SelectField`，见 §1.7）。**剩余**：① 执行记录 tab 的任务选择仍是原生 `<select>`；② 编辑器「前置任务」第②级（`task-editor.tsx:1936-1945`）作用域 `depWs` 仍是**内部** state；③ 任务选项文案两套（`title（id）` vs `[code] name`） | 建 `ui/TaskPicker.tsx`（规格 [`ui-foundation.md`](design/ui-foundation.md) §5.4）后替换 ①②，并把第①级工作区从内部 state 改**受控入参**；③ 统一取 `[code] name` |
| U32 | **执行记录时间轴 · 三处「实机才知」的观察项**（2026-10-04 评审登记，代码侧已尽力） | ① `TaskPicker` 浮层内的**方向键 / Tab 手感**（源码级已核实「字母键不拦、方向键在浮层内游走」，键位细节需真机确认）；② **2000 块 × `MarqueeText`**（每实例一个 `ResizeObserver`）的实机流畅度；③ 天标签**吸附会盖住当天首行约 34px** 高区域内的点击 | 真机若卡 / 若别扭：① 键位按实测调整（必要时拦方向键自己管）；② 上虚拟滚动或把跑马灯改成「hover 才挂 observer」；③ 天标签加 `pointer-events:none` + 或给块补 `scroll-margin` |
| U28 | **PDF 预览拖窄卡死 + 松手弹回最小宽度**（2026-10-03 用户报，**已落码**、⏳ 真机复验待做） | PDF 预览体是 `<iframe>`（**独立文档**），指针进去后**父文档的 `pointermove` 收不到**（监听挂在 `window`，`index.ts:588`）⇒ **向右拖（缩小，指针走进 dock 里的 PDF）就卡死**；此时点别处强行释放，`onUp` 拿到的 `clientX` 已偏右很多 ⇒ `clampPreviewWidth` 把宽度压到 `PREVIEW_MIN` ⇒ **弹回最小窗口**。向左拖（放大）正常，因为指针往左离开 dock、留在父文档 | **已落码**：拖动期间给 `#dsh-tdt-root` 挂 `dsh-tdt-resizing`，CSS 令 `iframe{pointer-events:none}`，松手撤销（`index.ts:579-594` + `archive-session-css.ts:28`）。typecheck 绿、**冒烟 504/0**、build 过。⚠️ 同类风险：任何内嵌 iframe（PDF 等）在**全局拖动**期间都会吞事件，以后加拖拽都要配这层屏蔽 |
| U29 | **跑马灯：滚出黑块 + 尾部永不显示**（2026-10-03 用户报，**已落码**） | 根因 = 手写的三处跑马灯（预览头路径 / 第二排文件名 / 只读完整路径）内层带 `overflow:hidden` ⇒ 按 flex 规矩子元素最小宽度为 0，盒子被压到容器宽、**超出部分被内层自己裁掉**；滚距却按完整文本算 ⇒ 滚的永远是「开头半截」，**尾部从未显示**，盒子整体滑出后右侧一片黑。**共用组件 `MarqueeText` 没这个病**（hover 时 `max-width:none; overflow:visible`，盒子放开到全文宽、滚距精确=溢出量） | **已落码**：① 三处手写全部收编到 `ui/MarqueeText`（删 `marqueeOn/Off`、`start/stopMarquee` 与 6 个 ref）；② 给 MarqueeText 加 `className` 参数承载调用方字体/字色皮肤；③ 全局跑法改 **播放 1 次 + `forwards`**（跑完停在尾字，不再 `infinite alternate` 来回弹），鼠标移开自动复位；④ 清两条失效外层 CSS（`.dsh-tdt-sv-preview-title` / `-crumbbar-plain`）。typecheck 绿、**冒烟 506/0**、build 过（产物已抽查规则完整） |
| U30 | **HTML 预览：现在只显示代码**（2026-10-04 用户报，**已落码**、⏳ 真机复验待做） | HTML/HTM 此前落到 `text` 分支 ⇒ 只能看代码。官方 HTML 走**静态预览**：`<iframe srcDoc sandbox="">`（`documentpreview:4065-4072`）+ DOMPurify 净化（`:3825-3842`）+ head 首位 CSP（`:3844-3846`） | **已落码（照官方逐条对齐，不多开不少关）**：① 官方三层全抄——禁用标签 `noscript/base/link/meta/iframe/frame/object/embed/set/animate*`、`href`+`xlink:href`、官方 CSP 原文、`sandbox=""`；② 官方 `loading:"bytes-complete"` ⇒ `readBytes` 取全量；③ 入口形态照 md：默认**预览**，点「源码」进文本态；④ 源码态**截前 256K**。⚠️ **真机返工（2026-10-04）**：初版把源码塞进官方 `CodeBlock`(Shiki) ⇒ ① 5000 行高亮**极卡**（官方上万行都流畅）；② CodeBlock 自带滚动容器 + 外层 `overflow:auto` ⇒ **两条滚动条**；③ 底部仍出「加载更多」且被挡一半。**二次返工（2026-10-04，用户贴官方截图）**：上一步改错方向——改纯文本无高亮是**误认了官方 `TextBody`**（那是**非代码文件**的兜底渲染器）；官方代码文件源码态走 `CodeBody`=`CodeBlock`，**有语法高亮 + 行号**（截图为证）。且「加载更多」仍在（我只改了截断分支，大文件首屏未达上限 ⇒ 走的是另一分支）。**按官方重做**：① 回到 `CodeBlock`（高亮+行号）；② 截断模式**静默自动翻页**到 256K/eof、**永不出「加载更多」**（官方一次给足 512K 同款）；③ 提示按官方放**顶部横幅**、警告色、措辞照官方「文件过大，仅显示前 512KB」；④ 源码态**单滚动容器**（body overflow:hidden）。typecheck 绿、**冒烟 517/0**、build 过（产物九项抽查全落位） |

---

## 三、下一步

> 文档体系整理已于 2026-10-01 结案（见 [`PROGRESS-HISTORY.md`](PROGRESS-HISTORY.md)）。以下为在办事项。

1. ~~**UI 基础层统一（样式专项）**~~ ✅ **已完成封卷（2026-10-01）** —— P0–P6 + 尺寸/圆角/字号归一 + 死代码清理，冒烟 390/0；结案行见 [PROGRESS-HISTORY.md](PROGRESS-HISTORY.md)，剩余「待抽象」登记为 **U20** 与 [`ui-style-guide.md`](design/ui-style-guide.md) §三。
2. **真机验证**（用户装 `dist/` 实测）：当前无待验项；已验见 [PROGRESS-HISTORY.md](PROGRESS-HISTORY.md)。
3. ✅ **代码侧小收尾（2026-10-01 完成）**：删 `manualAt` 死状态（全仓 `setManualAt` 从未调用）+ 同步 5 处过时「刷新」注释（实际坐标 `index.ts:174` / `index.ts:488-490` / `task-list.tsx:75` / `task-list.tsx:80` / `task-list.tsx:1353`；原记的 `index.ts:205` / `task-list.tsx:1406` 已漂移）。冒烟 390/0、build 绿。
4. ✅ **任务展开三面板 · 第四轮 UX 迭代已落码**（方案 = [design/features/task-expand-panels.md](design/features/task-expand-panels.md) §三）：① 三 tab 统一定高（基础信息纳入定高盒）；② 执行记录列重排（状态 / 计划执行 / 实际开始 / 时长 / 产出物 / **Token** / 会话）+ **时间范围筛选控件**抽象；③ 修 **状态过滤失效**（客户端 `statuses` vs 服务端 `status`）；④ 表头 / 过滤固定、内容滚动；⑤ 官方 `FileTypeIcon`。**第五轮观感返工 + TimeRange 下拉化 + 失败/跳过「原因」+ 预设档整档**亦已落码（见 1.2）。✅ **2026-10-03 真机验收通过**（三面板定高不闪、表格 7 列观感、时间范围下拉选档、失败行「原因」均验过），整包封卷（见 [PROGRESS-HISTORY.md](PROGRESS-HISTORY.md) 2026-10-03）。
5. **U26 · 产出物预览 PDF/SVG 预览不出**（2026-10-03 **已落码**，⏳ 真机复验待做）：根因 = `workspaceFiles.readBytes` 少传第三参（远端按位置参数个数校验 ⇒ 请求没发出去），**与渲染无关**。**已落码三步**：①`readBytes(sessionId,path)` 补 `{}`；②`WorkspaceFilesFace` 第三参收紧为必填 + `range` 形状由元组改 `{offset?,length?}`（对齐官方）；③冒烟补「必须带第三参」正/反断言。typecheck 绿、**冒烟 498/0**、build 过（`dist/client.js` 1.86 MB 入库）。**下一步 = 用户真机复验 PDF 与 SVG 是否恢复**（原定的真机对照实验与 SVG 尺寸核查全部作废）。过程 [worklog/file-preview-pdf-svg.md](worklog/file-preview-pdf-svg.md)。
6. **U27 · 工作区之外的文件第一排导航失效**（2026-10-03 **已落码**，⏳ 真机复验待做）：判定 = list 报 `outside-workspace` / `not-found`；命中则第一排换成只读完整路径（▾ 选层 / 面包屑点选 / ← 返回 / ↑ 上一层全不渲染，只留 ✕ 关闭，路径过长省略号截断且 hover 无任何交互）。typecheck 绿、冒烟 **502/0**、build 过。**下一步 = 用户真机复验**：点开一个 `~/.dsh/storages/...` 下的附件，确认第一排只剩路径 + ✕ 关闭，且路径过长时 hover 跑马灯。
7. **U28 · PDF 预览拖窄卡死**（2026-10-03 **已落码**，⏳ 真机复验待做）：根因 = PDF 的 `<iframe>` 吞掉父文档 `pointermove`。**下一步 = 用户真机复验**：拖住预览栏左缘，左右来回拖动应都跟手，松手停在松手处、不再弹回最小宽度。
8. **U29 · 跑马灯收编**（2026-10-03 **已落码**）：三处手写全部改用全站唯一 `MarqueeText`，全局跑法统一为「跑一遍停在尾字」。**下一步 = 真机复验**：悬停长路径/长文件名，应滚到最后一个字停住（右侧不留黑块、尾部完整可见），鼠标移开复位成省略号。
9. **U30 · HTML 预览**（2026-10-04 **已落码**，⏳ 真机复验待做）：HTML/HTM 现在默认渲染网页（官方同款 `srcDoc` + `sandbox=""` + CSP + 禁用清单），「源码」态截前 256K。**下一步 = 真机复验**：点开一个 .html 应直接看到渲染后的网页；点「源码」看前 256K，超限时滚到底部有一行提示。
10. ~~**U21**~~ ✅ **2026-10-03 真机验收通过，整包封卷**（详见 [PROGRESS-HISTORY.md](PROGRESS-HISTORY.md)）；~~**U16**~~ ✅ **2026-10-03 真机验收通过**。
7. ⏳ **立即执行（§1.5）真机验证**：重点「按钮位于删除与编辑中间」「确认框文案」「成功 Toast」「任务在跑时被拒并提示」「前置未达标时被拒并提示原因」「已停用任务仍可立即执行」。
8. ✅ **工作区候选真源统一（§1.7）**：2026-10-04 真机验收四项全过，已结案（见 [PROGRESS-HISTORY.md](PROGRESS-HISTORY.md)）。
9. ⏳ **执行记录总查询页（§1.6）真机验收**（已落码 + **第三版定稿**：撤框去轴、块化、点击就地展开；typecheck / build / 冒烟 556/0）。重点验：① 页面**没有外框、没有竖轴**，内容直接铺在面板底上；② 日期是**一行小字**（时钟图标 + 日期 · 星期 · N 条），滚动**不吸顶**；③ 每条是一块：左缘 **5px 方角通高**状态色竖条 + **同色系很浅的透明底**（成功绿 / 失败红），块之间约 **4px** 缝；④ 折叠态产出物**只有图标**（无文件名）、超出显示 `+N`；⑤ 点块**就地展开**且**同时只开一条**：上面产出物（图标 + 文件名，可点开预览）、下面该次执行的**事件流水**；⑥ **只有点「查看会话」才开会话**；⑦ 筛选（左四档状态 + 右时间 / 工作区 / 任务）改任一即重置并收起展开；⑧ 滚动到底仍自动续拉、不重不漏、跨页同一天不出现两个日期行；⑨ 深色主题下块底透出底色、竖条仍是状态色。



