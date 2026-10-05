# 进度（进行中）

> **这是什么**：本仓库**唯一**的在办事项真源 —— 现在做到哪、欠什么、下一步做什么。
> **已结案的**看 [`PROGRESS-HISTORY.md`](PROGRESS-HISTORY.md)（一行一条：时间 / 完成了什么 / 过程文档）。
> **文档规矩**看 [`README.md`](README.md)。
>
> 本文件**只装在办的事**；事项结案即从本文件移入 `PROGRESS-HISTORY.md`。
> ⚠️ README / issue / 聊天记录都不是真源。

---

## 一、当前状态

### 1.0 侧边栏压住宿主「系统设置」弹窗（2026-10-05）—— ✅ **2026-10-05 真机验收通过，已结案**

> 两条侧边栏（预览 dock / 编辑抽屉）是占布局的分栏，移除浮层时代遗留的显式 `z-index`（1030 / 1040）回到 `auto`，交 DOM 顺序裁决、让宿主 portal 弹窗回到上层（官方 Modal `portal` 到 body、「后挂载居上」只在同层成立）。`--tdt-z-*` 阶梯与其它局部层级一律未动。冒烟 603/0（+2 反向断言）。
> 过程 = [worklog/sidebar-overlap-host-modal.md](worklog/sidebar-overlap-host-modal.md)；规矩入 `ui-foundation.md` §十「层级 z-index」。

### 1.1 UI 基础层统一（样式专项）—— ✅ **完成封卷**（P0–P6 + 尺寸/圆角/字号归一 + 死代码清理）

> **已结案，详见 [PROGRESS-HISTORY.md](PROGRESS-HISTORY.md)**。规格 = [design/ui-foundation.md](design/ui-foundation.md)，手册 = [design/ui-style-guide.md](design/ui-style-guide.md)；过程 = [worklog/ui-foundation.md](worklog/ui-foundation.md)（P0–P6）、[worklog/size-unification.md](worklog/size-unification.md)（尺寸归一）、[worklog/ui-alignment-round.md](worklog/ui-alignment-round.md)（本轮收口 + 审计）。


### 1.2 真机验收批次（用户装 `dist/` 实测）—— ⏳ **待验 1 项：U33 Office 预览**

> 2026-10-04 用户真机实测：本轮在办事项（立即执行 §1.5 / 执行记录总查询页 §1.6 / 文件预览 U26–U30 / U32 观察项）**全部验收通过并已结案**。
> ⏳ **当前待验**：U33 Office 预览（doc/docx/ppt/pptx 转 PDF）—— 取决于宿主是否启用文档预览服务；宿主未启用时**预期就是**「Office 预览不可用」（与官方一致，非 bug）。验收清单见 [worklog/office-preview-officetopdf.md](worklog/office-preview-officetopdf.md) §四。

> 已验项（用户 2026-10-01 / 10-03 / 10-04 分批复核）已移 [PROGRESS-HISTORY.md](PROGRESS-HISTORY.md)：主界面+运行态摘要、高级区第二轮+多 Agent 协作、表单弹窗观感第五轮+脏判定、附加文件选择+上传（U15①）、UI 基础层收口（冒烟 390）、新增/编辑任务（U16）、任务展开三面板（规格 [design/features/task-expand-panels.md](design/features/task-expand-panels.md) §3.1b · §3.1d · 过程 [worklog/expand-panels-round4.md](worklog/expand-panels-round4.md)）、工作区候选真源统一、立即执行、执行记录总查询页、文件预览五项。

### 1.3 新增 / 编辑弹窗改「布局分栏」（U21）—— ✅ **完成封卷**（10-01 落码 + 10-02 微调 + 10-03 真机验收通过）

> **已结案，详见 [PROGRESS-HISTORY.md](PROGRESS-HISTORY.md)**。过程 = [worklog/editor-split-pane.md](worklog/editor-split-pane.md)；口径定型 = [design/features/creation-edit.md](design/features/creation-edit.md) §七-B。


### 1.4 任务文件上下文（会话里「接收 / 随附 / 产出」）—— ✅ **完成封卷**（2026-10-03 多轮定稿 + 真机实测通过）

> **已结案，详见 [PROGRESS-HISTORY.md](PROGRESS-HISTORY.md)**。过程 = [worklog/task-file-context.md](worklog/task-file-context.md)（含**版本基线**：v0.0.1 / HEAD `4ecd310`，回滚用）；宿主事实已回写 [`design/external/dsh-capabilities.md`](design/external/dsh-capabilities.md) §会话与派发。


### 1.5 立即执行（手动触发一次调度）—— ✅ **完成封卷**（2026-10-03 落码 + 2026-10-04 真机验收通过）

> ✅ **2026-10-04 真机验收通过**（按钮位于删除与编辑中间 / 确认框文案 / 成功 Toast / 任务在跑时被拒 / 前置未达标被拒并给原因 / 已停用任务仍可立即执行 —— 六项全过），**已结案移 [PROGRESS-HISTORY.md](PROGRESS-HISTORY.md)**。过程 = [worklog/manual-run.md](worklog/manual-run.md)（已封卷）。


### 1.6 执行记录总查询页（流水账）+ 任务选择器 —— ✅ **完成封卷**（2026-10-04 三版定稿 + 第四~十一轮细磨 + 真机验收全部通过）

> ✅ **2026-10-04 真机验收通过**（交互分层「只头部可点、展开区可拖选复制」/ 自绘浅色实心正圆前置圈码 + 悬停官方气泡 / 展开态头部不常亮 / 第一排产出物·第二排前置两列 + 无边框「查看会话」/ Token 悬停三段明细 / 5px 方角竖条与状态浅底 —— 全部验过），**已结案移 [PROGRESS-HISTORY.md](PROGRESS-HISTORY.md)**。过程 = [`worklog/execution-timeline.md`](worklog/execution-timeline.md)（已封卷）。

### 1.8 右侧栏「查看 / 编辑」两档 + 卡片前置任务名可点（2026-10-05 拍板 + 当日落码）—— 🔵 **已落码，⏳ 待真机验收**（冒烟 611/0）

> **动机**（用户原话）：在任务执行列表里看到某个任务有前置任务，**只显示了名字**，想看清它到底是什么；而现有两条路都不好——进编辑档太繁琐抽象、跳去任务列表展开又**打断操作**且回来还得找。
> **口径**：右侧分栏底栏**最左**加「查看 / 编辑」两档分段切换；查看档 = **只读人话视图**（纵向单栏流：基础信息 → 提示词 Markdown 限高滚动 → 上次执行带状态色块），底栏只留切换与 ✕（删除 / 重置 / 取消 / 保存全隐藏）。默认档：「＋ 新建」与卡片「编辑」→ **编辑**；**卡片展开区「前置任务」行点任务名 → 查看**（本期唯一入口，执行记录页与全站任务名不动）。编辑 A 未保存时切看任务 B ⇒ 先弹确认「放弃并查看 B？」。查看档里任务会话可点开会话、产出物可点开预览；**没有「跟进」块**（讨论期一度提出，用户最终否掉，就是「上次执行」一块）。
> **规格** = [design/features/creation-edit.md](design/features/creation-edit.md) §七-C；入口 = [design/features/task-expand-panels.md](design/features/task-expand-panels.md) §3.1b；共享展示层 = [design/code-conventions.md](design/code-conventions.md) §二；过程 = [worklog/task-viewer-mode.md](worklog/task-viewer-mode.md)。

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
| U17 | **主界面「下次执行」与运行中显示**（2026-09-30 真机提出 → 同日落码） | 现象：任务在跑时，卡片「下次执行」仍跳「下一槽倒计时」（如 8 分多钟），与「已经在跑」矛盾。**核实结论（源码级）**：只补**窗口内最晚那一槽**（`scheduler.ts` 的 `dueSlot` 只取 max、该槽已有实例行即 `undefined`、不向更早回退）＋ 同任务串行互斥 ⇒ `15:20`/`15:10` 永不补；`window` 只决定那一槽能晚多久跑，**非窗口内全补**。 | 🟢 **已落码（用户 2026-09-30 拍板）**：**不判断补跑时间**——`NextPill` 见 `row.running` 即改显「三个小方块脉动」活动指示（像手机充电），跑完才回到下一槽倒计时。曾试「显示补跑 15:30」（Plan A）**已撤**，`dueSlotAt` / 文案键全删（不留死代码）。冒烟 299 全过。见 [worklog/main-panel.md §8.6](worklog/main-panel.md) |
| U20 | **UI 基础层「待抽象」残留**（2026-10-01 审计登记，**未做**） | 「一类控件一个实现」已达标；残留的是**同构重复 / 该上提未上提**：省略号三件套 19 处 · 会话域手搓图标钮 · 6px 拖拽条（两处同款）· 卡/浮层外壳 7 处 · `index.ts` 手搓中性 Toast · 缺 `Textarea` / `Checkbox` 基础层件 · token 兜底字面量不统一 · 实面反白字写死 `#fff` | 逐项见 [`design/ui-style-guide.md`](design/ui-style-guide.md) §三「待抽象」；属改动中等以上，待排期 |
| U31 | **任务选择器替换「前置任务」下拉的时机与范围**（2026-10-03 随执行记录总查询页登记；2026-10-04 更新） | 用户要求带搜索的任务选择器**必须抽象成共用控件**（「很多地方都要用」）。✅ **其中「工作区候选真源统一」已于 2026-10-04 单独完成**（三处一律取 `/options`，任务列表顶部手搓下拉收编为 `SelectField`，见 §1.7）。✅ **① 已完成（2026-10-04）**：执行记录过滤行的任务选择已换 `TaskPicker`（`records-timeline.tsx:863`），原生 `<select>` 不再用。**剩余**：② 编辑器「前置任务」第②级（`task-editor.tsx:1929-1937`）仍是 `SelectField`、作用域 `depWs`（`:1865`）仍是**内部** state；③ 任务选项文案两套（`title（id）` vs `[code] name`） | ② 换 `TaskPicker` 并把第①级工作区从内部 state 改**受控入参**；③ 统一取 `[code] name` |
| U33 | **Office 预览（doc/docx/ppt/pptx）接入官方 `remote.officeToPdf`**（2026-10-05 用户报 + 已落码；⏳ **真机验收待做**，取决于宿主是否启用文档预览服务） | 用户报：本插件预览面里 `.xlsx` / `.ppt` 都显示「二进制文件，暂不支持预览…」，而原生工作区里 PPT 报「Office 预览不可用…」、Excel 却能渲染。**核实结论（两条完全不同的路）**：Office = **主机侧转换**（官方 `ctx.inject(['remote','remote.officeToPdf',…])` → `render()` 转 PDF 再渲染）；Excel = **纯前端**（官方私有分包 `client.excel.js` 的 `@fortune-sheet` + SheetJS，**借不到**：导出面全 type / 引擎在私有分包 / 只绑右栏 seat，且每插件独立打包不共享）。**Office 路线反而零 npm 依赖**（`dsh-office-to-pdf` 的 `./remote` 只做 `declare module` 类型扩展，`documentpreview` 也只放 devDependencies ⇒ 运行时服务由宿主提供）⇒ 按本仓惯例**本地声明服务面 + dotted inject** 即可 | **已落码**：① `previewKind` 加 `office` 分支（`OFFICE_KINDS = doc/docx/ppt/pptx`，**刻意不含 xls/xlsx**——Excel 待用户定）；② `OfficeToPdfFace` 本地声明（零 npm 依赖，契约出处写进注释）；③ `OfficePreview`：`render(sessionId,path,'foreground')` → `bytesOf` 取 `data` → Blob → objectURL → **复用既有 PDF 的 iframe**；④ `ctx.inject(['remote','remote.officeToPdf'])`（**dotted**，只注 `remote` 会永久探测失败——2026-09-28 同款根因）经 `officeRef` 下发；⑤ `errView` 加 `invocation-unavailable`/`service-unavailable`/`failed+reason==='unavailable'` → 「Office 预览不可用」（与官方逐字一致）；⑥ 中英文案齐备。typecheck 绿、**冒烟 598/0**（+6 断言）、build 过。过程 [worklog/office-preview-officetopdf.md](worklog/office-preview-officetopdf.md)。⏳ **真机**：宿主未启用服务时**预期就是**「Office 预览不可用」（与官方一致，非 bug），启用后应看到渲染后的 PDF；验收清单见该 worklog §四 |
| U34 | **Excel 预览路线待用户定**（2026-10-05 用户拍板「向后讨论」，本轮未动） | 官方 `OfficeExtension` **含 `xls` / `xlsx`** ⇒ 表格**也能**经 `officeToPdf` 转 PDF 预览。故 Excel 有两条路：① **转 PDF**（零 npm 依赖、复用 U33 同一条链路，但**不可编辑**、只是页面图像）；② **可编辑表格**（自引 `@fortune-sheet` + `xlsx`，增体量 ~1~2 MB，**破本仓「绝不引第三方包」原则**，且官方那份在私有分包里借不到） | 待用户定路线后落码。⚠️ 另记一处**宿主侧**风险（前端无解）：引擎 `@deepseek-ai/libreoffice-kit` 的 `optionalDependencies` **没有 linux-x64 原生包**（仅 wasm / win32-x64 / win32-arm64 / darwin-x64 / darwin-arm64）⇒ 宿主启用服务 ≠ Linux 主机一定能转；真机若在 Linux 上报「不可用」，先查宿主服务再查该原生包 |

---

## 三、下一步

> 文档体系整理已于 2026-10-01 结案（见 [`PROGRESS-HISTORY.md`](PROGRESS-HISTORY.md)）。以下为**在办事项**（已完成的 1–13 项已随各工作包结案移出）。

1. **U33 Office 预览真机验收**：宿主启用文档预览服务后，确认 doc/docx/ppt/pptx 能渲染出 PDF。
2. **U34 Excel 预览路线**：待用户拍板「转 PDF」还是「可编辑表格」，拍板后落码。
3. **U31 剩余 ②③**：编辑器「前置任务」第②级换 `TaskPicker` + 第①级工作区改受控入参；任务选项文案统一取 `[code] name`。
4. **U20「待抽象」残留**：省略号三件套 / 6px 拖拽条 / 卡与浮层外壳 / `Textarea`·`Checkbox` 基础层件等，属中等以上改动，待排期。
5. **§1.8 查看档真机验收**（已落码，冒烟 611/0）：① 底栏最左两档切换的观感与位置；② 查看档三块（基础信息标签—值 / 提示词 Markdown 限高滚动 / 上次执行的状态色块 + 明细）；③ 切档不丢草稿（编辑一半切查看再切回）；④ 卡片展开区「前置任务」行点任务名即进查看档；⑤ 编辑 A 未保存时点 B 的前置任务名 ⇒ 弹确认；⑥ 查看档里「任务会话 / 产出物」可点。**另需确认一项**：「预计执行」的具体时刻是否要进查看档（当前草稿态推不出服务端派生值，未放）。




