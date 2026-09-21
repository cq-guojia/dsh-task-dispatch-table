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
| 关键技术决策（14 条） | ✅ 定型 |
| 状态机 / 依赖语义 | ✅ 完整定义（转移表 / 租约 / unknown / 窗口 / 补跑 / 串行） |
| 数据模型（JSON Schema + SQLite 表） | ✅ 定型 |
| 任务定义样例 | ✅ 定型（首个：镜像升级日报） |
| 调度器插件骨架 | ⬜ 未开始（等源码核实 storages/ 与会话 API） |

---

## 三、文档索引

| 文档 | 内容 |
|---|---|
| [`../AGENTS.md`](../AGENTS.md) | agent 操作守则、文档体系与维护规则 |
| [`design/architecture.md`](design/architecture.md) | 三层架构、职责边界、关键约束 |
| [`design/decisions.md`](design/decisions.md) | 14 条已定型决策 + 理由（勿重复讨论）、决策 12 展开、命名查重记录 |
| [`design/data-model.md`](design/data-model.md) | 任务定义字段表、状态库 DDL（两表）、关键设计与取舍 |
| [`examples/image-upgrade-daily.md`](examples/image-upgrade-daily.md) | 首个任务样例：任务定义 + 产物契约 + 任务手册 |
| [`design/state-machine.md`](design/state-machine.md) | 对账判定树、7 种状态、两种依赖语义、5 个必补机制 |

---

## 四、已核实的 DSH 能力（会话生命周期）

| 能力 | 事实 |
|---|---|
| 会话创建 | `ctx.sessions.create()`；另有 `ctx.sessions.fork(src, boundary?, childId?)` |
| **会话改名** | 内置 `ctx.sessionTitle.rename` → 写持久 `session/title` 事件 |
| 改名语义 | 手动改名后来源变 `user` 并 **pin**，自动生成标题从此停止调度（「改名是接管」） |
| 标题来源三态 | `fallback`（兜底）/ `provider`（LLM 生成）/ `user`（手动） |
| 原生归档 | `archiveSession` → 从工作区列表隐藏，日志保留；状态存在 `storages/workspace.json` 的 `archivedSessionIds` |
| ⚠️ 归档缺口 | 当前版本**无 unarchive 入口**（已知限制） |
| 生命周期 | `create()` → `session/created` → turn/start..turn/end → `session/flush` → `session/disposed` |

**会话列表治理策略（已定）**：派发时用 `ctx.sessionTitle.rename` 起规范名（如 `[TASK] 镜像升级日报 · 2026-09-20`），跑完归档。
⚠️ **人在调度器派发的会话里插话会干扰任务** ⇒ 自动任务会话应视为机器专用。
**原则：会话列表不是任务日志，产物目录才是。**

---

## 五、未决项（下一步必须拍板）

| # | 待定 | 卡在哪 |
|---|---|---|
| 1 | **宿主 `storages/` 目录的语义** | 决策 14 已定**方向**（默认 `<工作区>/storages/<插件名>/state.db` + `statePath` 覆盖）；剩：`storages/` 相对什么解析、是否对插件开放——与 #2/#3 同批读源码 |
| 2 | **原生 `archiveSession` 是否从插件 ctx 暴露** | 可能只是 Web UI 能力，需读源码确认。决定调度器能否程序化归档会话 |
| 3 | **`ctx.sessions.create()` 的确切参数形状** | 能力确定存在，参数名待读源码 |
| 4 | **进程内会话 vs headless 子进程** | 暂定**进程内**（能收事件流）；headless 作兜底（只有退出码 + 日志文件） |

---

## 六、下一步（接手后从这里开始）

1. **核实未决项 1–3**（`storages/` 语义、`archiveSession`、`sessions.create` 形状）后，开始实现调度器插件骨架

> 实现期间的产出**先在对话里给方案**，确认后再写码。

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
