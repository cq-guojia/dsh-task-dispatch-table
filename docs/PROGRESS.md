# 进度

> **这是什么**：本仓库**唯一**的进度真源。
> **怎么用**：换设备 / 换会话后，agent 先读根目录 [`AGENTS.md`](../AGENTS.md)，再读本文件的**当前状态 → 未决项 → 下一步**即可接手。
> **怎么维护**：**就地更新本文件**——文件名和位置固定，不新建、不改名、不搬走；每次推进后同步「当前状态 / 未决项 / 下一步」，并追加「进展日志」。
> ⚠️ README / Issues / 聊天记录都不算真源。
>
> **本文件范围**：只记**开发项**（设计 → 数据模型 → 代码 → 发布）。
> 内容一旦**定型**就升格到 [`docs/design/`](design/) 下的专题文档，这里只留链接。
>
> **最后更新**：2026-09-21 · 状态机完整定义（design/state-machine.md）

---

## 一、背景（简述）

起因是四类周期性自动化需求（定时巡检、镜像升级汇报、GitHub 动态汇总、趋势项目评估）。
讨论后的关键转向：重点**不是**这四件事，而是**要有一套通用的任务调度体系**——能被拆解、有依赖、可复用、可无人值守，且**调度层零大模型介入**。

详见 [README.md](../README.md)。

---

## 二、当前状态

**设计阶段。** 架构与状态机已定型，**尚无一行实现代码**。

| 环节 | 状态 |
|---|---|
| 总体架构 | ✅ 定型 |
| 关键技术决策（15 条） | ✅ 定型 |
| 宿主 API 源码核实 | ✅ 未决项 1–4 全部关闭（结论沉淀为决策 15） |
| 状态机 / 依赖语义 | ✅ 完整定义（转移表 / 租约 / unknown / 窗口 / 补跑 / 串行） |
| 数据模型（JSON Schema + SQLite 表） | ✅ 定型 |
| 任务定义样例 | ✅ 定型（首个：镜像升级日报） |
| 调度器插件骨架 | ⬜ 方案已定，待落码 |

---

## 三、文档索引

| 文档 | 内容 |
|---|---|
| [`../AGENTS.md`](../AGENTS.md) | agent 操作守则、文档体系与维护规则 |
| [`design/architecture.md`](design/architecture.md) | 三层架构、职责边界、关键约束 |
| [`design/decisions.md`](design/decisions.md) | 15 条已定型决策 + 理由（勿重复讨论）、决策 12 展开、命名查重记录 |
| [`design/data-model.md`](design/data-model.md) | 任务定义字段表、状态库 DDL（两表）、关键设计与取舍 |
| [`examples/image-upgrade-daily.md`](examples/image-upgrade-daily.md) | 首个任务样例：任务定义 + 产物契约 + 任务手册 |
| [`design/state-machine.md`](design/state-machine.md) | 对账判定树、7 种状态、两种依赖语义、5 个必补机制 |

---

## 四、已核实的 DSH 能力（源码级，deepseek-harness 0.1.6-alpha.2）

| 能力 | 事实 |
|---|---|
| **会话派发** | `ctx.sessions.create()` 只建存储会话、**不驱动模型**；派发 = `ctx.agents.create({ sessionId, meta: { cwd: 工作区绝对路径 }, agentOptions: { provider, model } })` + `agent.send(msg, 'next-turn', true)`，`agent.whenIdle()` 等空闲 |
| 会话事件 | `ctx.on('session/event', (session, event))` 收**所有会话的所有事件**（同步发射）；`turn/end` 是 `event.type`；`session/created` / `session/disposed` 同步 emit |
| 会话改名 | 内置 `ctx.sessionTitle.rename` → 写持久 `session/title` 事件 |
| 归档 | `ctx.workspaceRegistry.archiveSession(id)` 程序化可用；只追加 `archivedSessionIds`、不动工作区 `sessionIds` 槽位、会话日志保留仍可查 |
| 定时器 | 官方 `@deepseek-ai/cordis-plugin-timer`：`inject: ['timer']` + `ctx.interval(fn, ms)`，插件卸载自动清理（决策 13 ✅） |
| 插件持久化 | 官方 API = `ctx.storageDomain.open(defineDomain({...}))`（zod schema + JSON 后端）；本插件按决策 7 自管 SQLite，路径 = 决策 14 |
| `storages/` 语义 | 根 = **宿主数据根**（`dshHomePath('storages')` → 配置路径 → `$DSH_HOME` → `~/.dsh`），**非工作区**——决策 14 已据此修订 |
| 第三方包接入 | **bundle 形态**：`package.json` 声明 `"dsh": { "bundle": { "patch": "./cordis.patch.yml" } }`，patch 内 `- insert: { id, name: <npm 包名> }`，用户 `pnpm add` 进 profile |
| 插件写法 | 具名导出 `name` / `inject` / `Config`（schemastery z schema）/ `apply(ctx, config)`；配置在 patch 行 `config:` 键声明 |
| 工作区 | `ctx.workspaceRegistry` 拿实体（`WorkspaceEntity.path` 为绝对路径）；`meta.cwd` 必须绝对路径 |

**会话列表治理策略（已定）**：派发时用 `ctx.sessionTitle.rename` 起规范名（如 `[TASK] 镜像升级日报 · 2026-09-20`），跑完 `archiveSession` 归档。
⚠️ **人在调度器派发的会话里插话会干扰任务** ⇒ 自动任务会话应视为机器专用。
**原则：会话列表不是任务日志，产物目录才是。**

---

## 五、未决项

**1–4 号未决项已全部关闭**（源码核实，见决策 15 与能力表）。剩实现期查证小项（写码时对照 `/private/tmp/dsh-source` 即可，不阻塞方案）：

| # | 待查 | 影响 |
|---|---|---|
| 1 | 工作区按 name 查 path 的 registry API 细节 | `target.workspace` 名 → `meta.cwd` |
| 2 | 宿主要求的 Node 版本 | 决定 SQLite 用 `node:sqlite`（≥22.5，零依赖）还是 `better-sqlite3`（需原生编译） |
| 3 | `agentOptions.provider` 缺省值与 `target.model` 的映射方式 | 派发参数 |

---

## 六、下一步（接手后从这里开始）

1. **按决策 15 写调度器插件骨架**（文件结构见进展日志 2026-09-21 方案条目），落码前在对话确认

---

## 七、本地联调前提（脱敏）

> ⚠️ **本机与私有部署细节（容器名、内网地址与端口、代理地址、compose 位置等）一律不入仓库**，只保留与实现相关的抽象结论。

| 项 | 抽象结论 |
|---|---|
| 宿主形态 | DSH 以容器运行，工作区是**挂载卷** ⇒ SQLite 状态文件必须落在挂载卷内，否则容器重建即丢 |
| 网络 | 宿主同时接内网与公网 ⇒ 可直连内网服务；注意代理 / `NO_PROXY` 配置 |
| 容器巡检数据入口 | Docker 引擎提供只读 HTTP API；容器内无 curl，用 node `fetch` |
| 配置生效 | 改工作区文件不等于改运行中的配置，实际生效以部署侧为准 |

---

## 八、进展日志（追加式，最新在最后）

| 时间 | 进展 |
|---|---|
| 2026-09-19 | 提出四类周期性自动化需求；调研外部工作流引擎 vs DSH 宿主插件 |
| 2026-09-19 | 确认 DSH 为执行引擎；排除外部编排层（挂不到工作区） |
| 2026-09-20 | 批准「自研 DSH host 插件做调度器 + 状态存 SQLite」 |
| 2026-09-20 | 核实 DSH 会话能力（`create` / `sessionTitle.rename` / `archiveSession`） |
| 2026-09-20 | 完成状态机与依赖语义设计；识别「会话存在 ≠ 在跑」的坑；列出 5 个待补机制 |
| 2026-09-20 | 建立本进度表（替代工作交接表） |
| 2026-09-20 | 完成插件命名查重（npm + GitHub 实测），记录见 [`design/decisions.md`](design/decisions.md) 附录 |
| 2026-09-20 | **插件名定为 `dsh-task-dispatch-table`** |
| 2026-09-21 | 仓库改为**公开开源**：进度文档迁至 `docs/PROGRESS.md`，已定型的设计拆到 `docs/design/`，补 `README.md` / `LICENSE`（MIT），移除本机部署细节 |
| 2026-09-21 | **npm 占位发布 `dsh-task-dispatch-table@0.0.0`**（抢注包名；正式版按决策改用 scoped 包名） |
| 2026-09-21 | **文档体系重组**：新建根目录 `AGENTS.md`（agent 守则与文档维护规则，原「维护规矩」迁入）；`task-manual-vs-skill.md` 并入 decisions.md（决策 12 展开）；进展日志移至文末 |
| 2026-09-21 | **拍板决策 14**：状态库默认落宿主 `storages/` 约定目录（`storages/dsh-task-dispatch-table/state.db`）+ `statePath` 配置覆盖；视角从「本机部署」改为「任何用户可安装」；「不被同步撕碎」降级为 README 文档化的已知风险 |
| 2026-09-21 | **数据模型定型**（[`design/data-model.md`](design/data-model.md)）：任务定义 13 字段 + 状态库两表（`task_instances` / `task_events`）；实例身份 = `task_id + logical_date`，重试行内递增，派发 CAS 领取；通知机制本期不做（用户拍板） |
| 2026-09-21 | **首个任务样例定型**（[`examples/image-upgrade-daily.md`](examples/image-upgrade-daily.md)）：镜像升级日报——任务定义 + 产物契约 + 手册骨架；仅文档示例，与插件代码零耦合 |
| 2026-09-21 | **状态机完整定义**（[`design/state-machine.md`](design/state-machine.md)）：完整转移表、租约 30min 心跳续租、`unknown` 只观察不重派、窗口只管开始、重试当场回 `pending`、同任务严格串行、补跑三层入口（自动实例保障 / `backfill.days` / SQL 手动重置）；数据模型随之增补第 14 个字段 `backfill.days` |
| 2026-09-21 | **宿主源码核实完成，未决项 1–4 全关**（克隆 deepseek-ai/deepseek-harness 至 /tmp 读源码，结论 = 决策 15）：派发走 `ctx.agents.create`（sessions.create 不驱动模型）；storages/ = 宿主数据根非工作区（决策 14 修订）；归档程序化可用；bundle 接入形态。**骨架方案**：`src/{index,config,tasks,scheduler,reconcile,store,dispatch}.ts` + `cordis.patch.yml`，TypeScript 构建，`inject: ['timer','agents','sessions','workspaceRegistry']` |
