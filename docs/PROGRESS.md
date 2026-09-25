# 进度

> **这是什么**：本仓库**唯一**的进度真源。
> **怎么用**：换设备 / 换会话后，agent 先读根目录 [`AGENTS.md`](../AGENTS.md)，再读本文件的**当前状态 → 未决项 → 下一步**即可接手；需要某个工作包的踩坑与决策细节时，按「里程碑索引」里的链接点开对应的 [`worklog/`](worklog/) 文件。
> **怎么维护**：**就地更新本文件**——每次推进后同步「当前状态 / 未决项 / 下一步」；**进展日志不再写进本文件**，工作包详情写入 `docs/worklog/<工作包名>.md`（做完封卷），这里只留里程碑索引表里的一行。
> ⚠️ README / Issues / 聊天记录都不算真源。
>
> **本文件范围**：只记**开发项**（设计 → 数据模型 → 代码 → 发布）。
> 内容一旦**定型**就升格到 [`docs/design/`](design/) 下的专题文档，这里只留链接。
>
> **最后更新**：2026-09-25 · 文档体系重构为「PROGRESS 现场 + worklog 封卷 + design 定型」三层。

---

## 一、背景（简述）

起因是四类周期性自动化需求（定时巡检、镜像升级汇报、GitHub 动态汇总、趋势项目评估）。
讨论后的关键转向：重点**不是**这四件事，而是**要有一套通用的任务调度体系**——能被拆解、有依赖、可复用、可无人值守，且**调度层零大模型介入**。

详见 [README.md](../README.md)。

---

## 二、当前状态

**联调阶段。** v0.0.1 全功能落码并真机跑通，**9 个工作包全部完成封卷**（见下表）；决策 1–30 已定型（[`design/decisions.md`](design/decisions.md)）；冒烟 71 项全过。

- **真机现状**：面板（侧栏「任务调度表」整页）三标签可用（任务配置 / 执行记录 / 调试）；任务表持久化主通道 = state.db meta 表（重装 / 容器重建不丢，真机验证通过）；once 全链路 `succeeded`（2026-09-25 21:35 / 22:20 两轮，任务身份 = 系统生成 UUID）。
- **任务身份闸门（决策 30）已生效**：保存时固化——无 id 补 UUID / 非 UUID 422 拒 / UUID 必须命中现有已保存表；运行时只认不修——无 id / 非 UUID 条目 warn 跳过。
- **最近一笔**：configEditor 次通道 try/catch 修复（`774af86` 已上远端）；remote 已切 SSH。

---

## 三、里程碑索引

| # | 工作包 | 状态 | 时间 | 一句话 | 详情 |
|---|---|---|---|---|---|
| 1 | 立项、选型与设计定型（含 Web 配置页） | ✅ | 09-19 ~ 09-21 | DSH host 插件 + SQLite 选型定型，决策 1–18，v0.0.1 骨架落码真机首装，配置页真机跑通 | [worklog/genesis.md](worklog/genesis.md) |
| 2 | 一次性任务、回执与派发链路 | ✅ | 09-21 ~ 09-23 | 决策 18–24（once / 回执 / live 重排 / ctx 透传 / 模型漏斗 / preset / per-agent 回执工具），🎉 首次全链路真机跑绿 | [worklog/once-dispatch.md](worklog/once-dispatch.md) |
| 3 | 刻度化调度与执行身份 | ✅ | 09-24 | 决策 25/26 落码：UUID 主键 + `UNIQUE(task_id, scheduled_at)`，小时/分钟级 cron 可跑；双标签面板 + `npm run smoke` | [worklog/ticks-identity.md](worklog/ticks-identity.md) |
| 4 | 执行记录「查看会话」 | ✅ 方案 | 09-24 | 决策 27 证伪 → 28 自绘只读弹窗落码 → 29 复用官方 ChatView（方案拍板，暂不动工） | [worklog/session-view.md](worklog/session-view.md) |
| 5 | 宿主 0.1.7-rc.1 迁移与数据通道 | ✅ | 09-24 ~ 09-25 | 侧栏入口 panellist + main 整页化；数据通道五连败后定案 webServer HTTP 路由 + 同源 fetch | [worklog/rc1-migration.md](worklog/rc1-migration.md) |
| 6 | 0.1.7 兼容性排障 | ✅ | 09-25 | ENOENT 误报静默；v4 会话消息格式 source.kind 修复（自有 producer kind） | [worklog/runtime-compat.md](worklog/runtime-compat.md) |
| 7 | 持久化主通道与调试页 | ✅ | 09-25 | tasksInline 改 state.db meta 表（重装不丢）；面板「调试」标签直读三表；once 真机重新跑绿 | [worklog/persistence.md](worklog/persistence.md) |
| 8 | 任务身份闸门（决策 30） | ✅ | 09-25 | 三字段模型（id/title/code）→「保存时固化，运行时只认」→ UUID 必须命中现有表；真机验证生效 | [worklog/identity-gate.md](worklog/identity-gate.md) |
| 9 | 周期任务（cron）全链路验证 | ⚪ 未开始 | — | 下一步重点，见「五、下一步」 | — |

---

## 四、未决项

### 已知待解决（用户明确推迟，不阻塞当前联调）

| # | 问题 | 现状与影响 | 将来怎么解（方向，未定） |
|---|---|---|---|
| U1 | **中途重启的续跑 / 补跑能力缺失**（2026-09-23 真机暴露，用户拍板记为后续项，**本次不处理**） | 插件进程重启（含升级）会随进程失去既有 agent handle ⇒ 在跑实例被 `startupScan` 置 `unknown` ⇒ 静默观察 65 分钟判死 ⇒ 因默认 `retry.maxAttempts=1` 直接 `failed`。**注意：即便用户在 UI 手动「继续」会话，今天也仍然交不了回执**——`task_dispatch_table_receipt` 是在**派发的 `setup` 里按 agent 作用域注册**的，恢复/重建出来的会话里没有这张工具。**自动化任务必须扛得住服务重启**（宿主重启、机器重启同理）：要么接着跑，要么重头跑 | ① 启动时对未终态实例做**会话再采纳**（re-adopt：找回会话 + 重新注册回执工具 + 重新登记 handle），并补发一次追问 ⇒ 「手动继续」这条路才真正通；② 会话确实已死的，判死时给一次**因重启中断**的补跑，且该额度独立于用户配的 `retry.maxAttempts`（不与正常失败重试混算）；③ 补跑要处理**遗留副作用**（上次会话可能已产出半成品文件），需约定重跑前清理或给幂等语义 |
| U2 | **失败即归档**，排查时找不到现场（同上推迟） | `finishTerminal` 成败都 `archiveSession`，会话从列表消失（日志仍在磁盘）。真机已两次造成「想排查时会话不见了」 | 配置化 `archive.on`（`succeeded` 或 `always`），是否改默认待用户拍板 |
| U3 | **产出只验「存在 + 新鲜」，不验内容** | `checkReceipt` 三道闸 = status 合法 / 文件存在 / `mtime > dispatched_at`。本测试任务（建空文件）够用；换真报告任务，agent `touch` 一个空文件即可通关 | 给 `contract` 增补内容约束（最小体积 / 非空 / 必含关键字 / outputs 必产清单），按任务声明校验 |
| U4 | **`logical_date` 是否显式注入尚未定** | 真机 `once8` 实例日期 `2026-09-23`，agent 产出却是 `work-report-2026-09-24.md`。待确认是任务提示词里写了明天日期，还是模型自己算的；后者说明**日期不该让模型猜** | 若属模型自算 ⇒ 把 `logical_date`（及期望日期格式）显式写进派发消息，与「回执不许模型传 session」同理：**凡不由模型决定的，一律由调度器注入** |
| U5 | **执行记录是否带「定义版本 + 配置快照 + 来源」**（`def_revision` / `def_snapshot` / `run_type`，**已设计、未拍板**） | 现在执行行只引用 `task_id`，**不记录当时那份配置** ⇒ 用户改完配置就回答不了「这次跑的是哪一版」；且分不清这次是**按点调度 / 用户手动重试 / 补跑**。直接影响「点开一条记录看当时的配置」与「失败点重试」按钮 | ① `def_snapshot` 存当时配置 JSON（Airflow 有 `rendered_task_instance_fields` 同款）；② `run_type` 区分 scheduled / manual / retry / backfill（Airflow 的 `run_id` 前缀就是 `scheduled__` / `manual__`）；③ **自动重试仍走行内 `attempt+1`（决策 10 不动），用户手动重试 = 新建一行 `run_type='manual'`** ⇒ 不吃自动重试预算、审计清楚；④ 唯一键若加 `def_revision`，连「月任务改成年任务后锚点撞车」也一并合法 |
| U6 | **面板收尾**：回收「数据通道诊断」临时行与 configForms/settingsScope 兜底块（暂缓，等链路稳定后一并做） | rc.1 上 HTTP 是唯一能出数据的通道，兜底块死代码 | 仅留 HTTP 一条真通道，删除诊断行与兜底块 |

---

## 五、下一步（接手后从这里开始）

1. **【最优先】周期任务（cron）全链路验证**：用户在面板「任务配置」贴一条 cron 任务（如每日 9:00，window 覆盖，workspace 填宿主真实工作区标题）→ 保存 → 观察 实例按刻度生成 → 派发 → 回执 → 终态；次日核对「同一任务多刻度各自成行、不重复执行」。前置已全部就位（刻度化调度 / 身份闸门 / meta 持久化 / v4 格式均已真机验证）。
2. **（📋 方案已拍板，暂不动工）会话弹窗渲染层复用官方 ChatView（决策 29）**：弹窗壳保留，内部复刻官方 slot 引擎 `SessionEntry` 装配逻辑（~50 行胶水）挂载官方 ChatView 本体。机制与落码要点见 [worklog/session-view.md](worklog/session-view.md) 与决策 29。
3. **联调通过后 → 发 v0.1.0 + README 安装文档**；完整 UI（监控面板 v1.1，决策 16）。
4. **回执增强待办（已拍板暂缓）**：outputs 由逗号串升级 JSON（agent 先写文件再提交路径，绕开命令行引号转义）；每文件简介同理走文件不走命令行。前置条件 = 回执链路真机跑稳 + v1.1 UI 真有展示需求；防呆优先原则不变（决策 19：agent 可靠性是链路最弱一环）。

---

## 六、本地联调前提（脱敏）

> ⚠️ **本机与私有部署细节（容器名、内网地址与端口、代理地址、compose 位置等）一律不入仓库**，只保留与实现相关的抽象结论。

| 项 | 抽象结论 |
|---|---|
| 宿主形态 | DSH 以容器运行，工作区是**挂载卷** ⇒ SQLite 状态文件必须落在挂载卷内，否则容器重建即丢 |
| 网络 | 宿主同时接内网与公网 ⇒ 可直连内网服务；注意代理 / `NO_PROXY` 配置 |
| 容器巡检数据入口 | Docker 引擎提供只读 HTTP API；容器内无 curl，用 node `fetch` |
| 配置生效 | 改工作区文件不等于改运行中的配置，实际生效以部署侧为准 |

---

## 七、文档索引

| 文档 | 内容 |
|---|---|
| [`../AGENTS.md`](../AGENTS.md) | agent 操作守则、文档体系与维护规则 |
| [`worklog/`](worklog/) | 工作包过程叙事（每个工作包一个文件，做完封卷）：踩坑、定位、修复与真机证据 |
| [`design/decisions.md`](design/decisions.md) | 30 条已定型决策 + 理由（勿重复讨论）、决策 12 展开、命名查重记录 |
| [`design/architecture.md`](design/architecture.md) | 三层架构、职责边界、关键约束 |
| [`design/data-model.md`](design/data-model.md) | 任务定义字段表、状态库 DDL、关键设计与取舍 |
| [`design/state-machine.md`](design/state-machine.md) | 对账判定树、7 种状态、两种依赖语义、5 个必补机制 |
| [`design/dsh-capabilities.md`](design/dsh-capabilities.md) | 已核实的 DSH 宿主能力事实清单（源码级，0.1.6 / 0.1.7-rc.1） |
| [`examples/image-upgrade-daily.md`](examples/image-upgrade-daily.md) | 首个任务样例：任务定义 + 回执机制 + 任务手册 |
| [`examples/task-template.jsonc`](examples/task-template.jsonc) | 全字段注释版任务定义模板（粘进 tasksInline 前须去掉注释） |
