# 进度（进行中）

> **这是什么**：本仓库**唯一**的在办事项真源 —— 现在做到哪、欠什么、下一步做什么。
> **已结案的**看 [`PROGRESS-HISTORY.md`](PROGRESS-HISTORY.md)（一行一条：时间 / 完成了什么 / 过程文档）。
> **文档规矩**看 [`README.md`](README.md)。
>
> 本文件**只装在办的事**；事项结案即从本文件移入 `PROGRESS-HISTORY.md`。
> ⚠️ README / issue / 聊天记录都不是真源。

---

## 一、当前状态

### 1.1 文档体系整理（🏗 进行中，2026-10-01）

用户拍板：**先把文档整理好，再按文档要求做样式统一**。落地动作：

- 立 [`docs/README.md`](README.md)（文档规范：目录三层 / 七类落位 / 命名 / 每类怎么写 / 生命周期 / 硬规则）。
- 现场层拆为 `PROGRESS.md`（进行中）+ `PROGRESS-HISTORY.md`（已结案，一行一条）。
- **按规范七类逐类整理已完成一轮**（1 进度 / 2 数据库 / 3 样式 / 4 方法 / 5 功能 / 6 外部事实），详见 [worklog/docs-reorganization.md](worklog/docs-reorganization.md) §2.3；全仓引用同步 58 处、断链校验 **0**。
- 新增定型文档：**方法规范** [`design/code-conventions.md`](design/code-conventions.md)、**功能总索引** [`design/features.md`](design/features.md)；8 个功能文档迁入 `design/features/`。
- `design/decisions.md`（108 KB 历史堆积）**已删除**：有价值的约束力内容先补进 `data-model.md` / `architecture.md` / `dsh-capabilities.md` / `features/state-machine.md` / `features/main-panel.md` / `features/creation-edit.md`，引用全部清理（详见 [worklog/docs-reorganization.md](worklog/docs-reorganization.md) §2.4）。**遗留 9 处口径冲突待修**，见未决项 **U19**。
- 两个 `creation-edit-*` **已合并**为 `design/features/creation-edit.md`（需求口径真源 + 历史提纲的补充议题附录），`features.md` 索引已更新。
- 「环境前提（脱敏）」**已归根 `README.md`**（部署 / 使用需要知道的环境事实）。
- **规范头与封卷补齐**：7 个定型文档缺的 `状态 / 来源 / 配套` 三行头已补；8 个**已完成**工作包补「✅ 完成封卷」标记（未完成的仍不封，如主界面 / 三面板 / 新增编辑）；定型层残留的过程内容（会话弹窗「真机验证清单」、「动工前置条件」、"待确认"标题）已清理。
- **两份 agent 规则文件重写（2026-10-01）**：`RULES.md`（跨项目）砍成骨架 —— 保留写操作闸门 / git / 协作规矩，**新增「接手入口」节**（三个固定文件：根 `README.md` → `docs/PROGRESS.md` → `docs/README.md`）+ 「文档槽位」（样式规范 / 方法规范 / 功能索引 / 数据库说明 / 外部事实）+ 分层骨架与标准动作；`AGENTS.md`（本项目）重写为「文档落点表 + 本项目约定 + 本项目文档体系」三段，**删掉过期的里程碑索引 / 决策记录指向**，新增「与文档冲突时以源码现状为准」。两份文件**零交叉**（AGENTS 只在程序注入块内出现公用规则文件名）。

### 1.2 UI 基础层统一（样式专项）—— ⏸ **挂起**

用户 2026-10-01 拍板：先放一放，作为**单独一个进行中的事项**，文档整理完再按文档要求开工。

- 已起草（未拍板、未落码）：方案 [`design/ui-foundation.md`](design/ui-foundation.md)、手册 [`design/ui-style-guide.md`](design/ui-style-guide.md)。
- 开工前 4 项源码核实见未决项 **U18**。

### 1.3 落码完成、⏳ 真机验证待做（用户装 `dist/` 实测）

| 事项 | 状态 | 真机验证清单 |
|---|---|---|
| 任务展开三面板 + 快捷删除 + 统一查询抽象 | 🔵 落码（冒烟 364/0） | [worklog/task-expand-panels.md](worklog/task-expand-panels.md) §六 |
| 插件主界面：任务列表视图 + 运行态摘要 | 🔵 落码（冒烟 299） | [worklog/main-panel.md](worklog/main-panel.md) |
| 新增 / 编辑任务（保存链路 / 版本 / 删除 / 审计） | 🔵 落码（冒烟 236） | [worklog/creation-edit-implementation.md](worklog/creation-edit-implementation.md) §四 |
| 高级区第二轮 + 多 Agent 协作接线 | 🔵 落码 | [worklog/task-editor-ui.md](worklog/task-editor-ui.md) §二十一 |
| 附加文件：选择工作区文件 + 上传本地文件 | 🔵 落码 | [worklog/attachments-upload.md](worklog/attachments-upload.md) §四 |
| 表单弹窗观感第五轮 + 脏判定 / 关闭确认 | 🔵 落码 | [worklog/task-editor-ui.md](worklog/task-editor-ui.md) §十八 |
| UI 收口 + Agent 权限选择器 | ✅ 封卷（随主界面复验） | [worklog/task-editor-ui.md](worklog/task-editor-ui.md) §二十二 |
| 编辑器 UX 第二轮 | ✅ 结案（随主界面复验） | [worklog/editor-ux-round2.md](worklog/editor-ux-round2.md) |

---

## 二、未决项

> 📌 下表 U1–U6 / U9 为用户此前明确推迟的 backlog；U18 为本轮新立且**已挂起**的专项。

| # | 问题 | 现状与影响 | 将来怎么解（方向，未定） |
|---|---|---|---|
| U1 | **中途重启的续跑 / 补跑能力缺失**（2026-09-23 真机暴露，用户拍板记为后续项，**本次不处理**） | 插件进程重启（含升级）会随进程失去既有 agent handle ⇒ 在跑实例被 `startupScan` 置 `unknown` ⇒ 静默观察 65 分钟判死 ⇒ 因默认 `retry.maxAttempts=1` 直接 `failed`。**注意：即便用户在 UI 手动「继续」会话，今天也仍然交不了回执**——`task_dispatch_table_receipt` 是在**派发的 `setup` 里按 agent 作用域注册**的，恢复/重建出来的会话里没有这张工具。**自动化任务必须扛得住服务重启**（宿主重启、机器重启同理）：要么接着跑，要么重头跑 | ① 启动时对未终态实例做**会话再采纳**（re-adopt：找回会话 + 重新注册回执工具 + 重新登记 handle），并补发一次追问 ⇒ 「手动继续」这条路才真正通；② 会话确实已死的，判死时给一次**因重启中断**的补跑，且该额度独立于用户配的 `retry.maxAttempts`（不与正常失败重试混算）；③ 补跑要处理**遗留副作用**（上次会话可能已产出半成品文件），需约定重跑前清理或给幂等语义 |
| U2 | **失败即归档**，排查时找不到现场（同上推迟） | `finishTerminal` 成败都 `archiveSession`，会话从列表消失（日志仍在磁盘）。真机已两次造成「想排查时会话不见了」 | 配置化 `archive.on`（`succeeded` 或 `always`），是否改默认待用户拍板 |
| U3 | **产出只验「存在 + 新鲜」，不验内容** | `checkReceipt` 三道闸 = status 合法 / 文件存在 / `mtime > dispatched_at`。本测试任务（建空文件）够用；换真报告任务，agent `touch` 一个空文件即可通关 | 给 `contract` 增补内容约束（最小体积 / 非空 / 必含关键字 / outputs 必产清单），按任务声明校验 |
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
| U15 | **附加文件链路收尾**（2026-09-29 落码，决策 46；选择 + 上传已推送 `680d23f`） | ① 真机验证未做（选择浏览/选中/卡片、拖拽+点选上传、超限与类型拒绝报错，清单见 [worklog/attachments-upload.md](worklog/attachments-upload.md) §四）；② 附件（尤其 upload 落盘文件）与任务定义的**持久化关联未做**——目前 `attachments` 只在草稿层；③ 执行期如何把附件注入给 agent 未定 | ① 用户真机测，问题回改；② 可能并入 P2 保存链路（任务定义 JSON 已有 `attachments` 字段位）；③ 注入形态（消息里贴路径清单 / 内容内联）待拍板 |
| U16 | **新增 / 编辑任务的功能设计**（2026-09-29 UI 封档后立项） | ✅ **2026-09-30 全线完成（落码 + 评审 + 冒烟 236 全过），⏳ 真机验证待做**：需求口径 [`design/features/creation-edit.md`](design/features/creation-edit.md) + 数据设计 [`design/data-model.md`](design/data-model.md) §五 §六 + 决策 51 + 落码叙事 [worklog/creation-edit-implementation.md](worklog/creation-edit-implementation.md)。遗留小项：保存时版本备注未接（UI 备注字段已在版本面板）；审计 UI 消费面等面板整体重建；GET /tasks/history 的 query 透传存疑（真机优先核实） | 真机验证清单见 worklog §四 |
| U17 | **主界面「下次执行」与运行中显示**（2026-09-30 真机提出 → 同日落码） | 现象：任务在跑时，卡片「下次执行」仍跳「下一槽倒计时」（如 8 分多钟），与「已经在跑」矛盾。**核实结论（源码级）**：只补**窗口内最晚那一槽**（`scheduler.ts` 的 `dueSlot` 只取 max、该槽已有实例行即 `undefined`、不向更早回退）＋ 同任务串行互斥 ⇒ `15:20`/`15:10` 永不补；`window` 只决定那一槽能晚多久跑，**非窗口内全补**。 | 🟢 **已落码（用户 2026-09-30 拍板）**：**不判断补跑时间**——`NextPill` 见 `row.running` 即改显「三个小方块脉动」活动指示（像手机充电），跑完才回到下一槽倒计时。曾试「显示补跑 15:30」（Plan A）**已撤**，`dueSlotAt` / 文案键全删（不留死代码）。冒烟 299 全过。见 [worklog/main-panel.md §8.6](worklog/main-panel.md) |
| ~~U19~~ | ~~删除 `decisions.md` 后遗留的 9 处口径冲突~~ → ✅ **已全部回改**（2026-10-01，用户拍板「以现在实现的为准」，逐条到源码核实后回改） | ① `skipped` 进 `task_instances`（三类场景，见 data-model.md 头注）；② 上游无记录 ⇒ **阻塞**（`upstream-not-succeeded`）；③ 会话名 `[TASK] YYMMDD-HHmm · 标题`；④ 预览 = **页面级唯一 dock**；⑤ `sessions.retain` **存在且必须调用**；⑥ 数据源 = **keyed**；⑦ U10 分支 **已实现**；⑧ 保留期 **默认不清**；⑨ 刷新按钮 **已不存在** | 无遗留；过程记在 [worklog/docs-reorganization.md](worklog/docs-reorganization.md) §2.7 |
| U18 | **UI 基础层统一（样式专项）** —— ⏸ **挂起**（用户 2026-10-01 拍板：先整理文档体系，之后按文档要求开工） | 同一个控件（滑动块 / 按钮 / 下拉 / 输入 / 开关 / 日期时间）各处各写一份：分段控件 **10 处**（4 官方 / 6 自绘）、段高 **5 种**、设计令牌 **3 份 `C` 表**、内联数值字面量 **~151 处**、`body[data-ds-dark-theme]` 特判 **7 处**、**4 条 `<style>` 注入 + 2 套 id**。方案 [design/ui-foundation.md](design/ui-foundation.md)（四层架构 + 两轴 size×variant + 两档高度 + 明暗差异单点）、手册 [design/ui-style-guide.md](design/ui-style-guide.md) | ① 文档整理完后开工；② **开工前 4 项源码核实**：`npm pack @deepseek-ai/dsh-client-ui-theme@<宿主版本>` 取 alias 全表（**需授权下载写盘**）、明暗判据是否只有 `body[data-ds-dark-theme]`、官方 `SegmentedControl` 指示器算式是否保留、**三处同义变量疑点**（`state-warn` vs `state-warning`、`focus-ring-color` vs `border-focus`、宿主字号体系是否成立 —— 前两项必有一个是死变量，见 foundation §4.5）；③ 之后按 P0→P5 分期落码，每期 build + 冒烟正/反断言 + 明暗双主题真机走查 |

---

## 三、下一步

1. **文档体系整理**（进行中）：建方法文档 `design/code-conventions.md`（先盘现有通用模块，再定"哪些必须复用 / 不满足怎么提"）；建功能文档 `design/features.md` + `design/features/`（先盘出功能清单：有哪些功能、干什么、对应哪个页面）。
2. 定 `design/decisions.md`（108 KB 历史堆积）的处理方式。
3. 文档整理完后，按文档要求开工 **UI 基础层统一（U18）**：先做完 4 项源码核实，再 P0 建地基。
4. **真机验证**（用户装 `dist/` 实测）：三面板 / 主界面 / 新增编辑 三条，清单见 §1.3 表。


