# 工作包：文档体系整理（按 `docs/README.md` 落位）

> **状态**：🚧 进行中（2026-10-01 起）
> **来源**：用户 2026-10-01 拍板 —— 「先把文档整理完，再按文档要求做样式统一」
> **依据**：[`docs/README.md`](../README.md)（文档规范：目录三层 / 七类落位 / 命名 / 生命周期 / 硬规则）
> **已完成的**：① 立规范 `docs/README.md`；② 现场层拆为 `PROGRESS.md`（进行中）+ `PROGRESS-HISTORY.md`（已结案，一行一条）；③ `PROGRESS.md` 从 96 KB 降到 20 KB。

---

## 一、迁入计划（按规范 §二 七类落位）

| 现状文件 | 规范归类 | 迁入后 | 动作 |
|---|---|---|---|
| `design/features/main-panel.md` | 5 功能 | `design/features/main-panel.md` | 移动 + 更新引用 |
| `design/features/task-expand-panels.md` | 5 功能 | `design/features/task-expand-panels.md` | 移动 + 更新引用 |
| `design/features/creation-edit.md` | 5 功能 | `design/features/creation-edit.md` | 移动 + 更新引用 |
| `design/features/creation-edit.md` | 5 功能 | 同上（需求口径并入该功能文档） | 待合并 |
| `design/features/archive-session-view.md` | 5 功能 | `design/features/archive-session-view.md` | 移动 + 更新引用 |
| `design/features/artifact-opening.md` | 5 功能 | `design/features/artifact-opening.md` | 移动 + 更新引用 |
| `design/features/dependency-snapshot.md` | 5 功能 | `design/features/dependency-snapshot.md` | 移动 + 更新引用 |
| `design/features/state-machine.md` | 5 功能（调度） | `design/features/state-machine.md` | 移动 + 更新引用 |
| `design/architecture.md` | 4 方法（架构） | 保持 | — |
| `design/data-model.md` | 2 数据库 | 保持；「读写方法」部分将来归方法文档 | — |
| `design/dsh-capabilities.md` | 6 外部事实 | 保持 | — |
| `design/session-view-ui-map.md` | 6 外部事实 | 保持 | — |
| `design/ui-foundation.md` / `ui-style-guide.md` | 3 样式 | 保持 | — |
| `design/decisions.md`（108 KB） | 历史堆积，规范已不列此类 | 待用户定 | — |

**纪律**：移动一个文件 = 同步改掉全部引用（否则全是死链）。每迁一个先 `grep` 出引用点，改完再迁下一个。
**校验方式**：脚本扫全仓 md 的相对链接（`]` + `(` + 目标 md + `)`），逐个 `fs.existsSync` 判定，目标 **0 断链**。

---

## 二、过程

### 2.1 现场层拆分（已完成）

- 立 `docs/README.md`：文档规范（目录三层 / 七类落位 / 命名 / 每类必须写与不得写 / 生命周期 / 硬规则）。
- 立 `docs/PROGRESS-HISTORY.md`：已结案事项一行一条（时间 / 完成了什么 / 过程文档），24 条。
- 重写 `docs/PROGRESS.md`：只留三块（当前状态 / 未决项 / 下一步），96 KB → 20 KB。
- 原「结项说明」进历史一行；原「文档索引」删除（规范由 `docs/README.md` 唯一维护）；原「本地联调前提」暂挂 `PROGRESS.md` 末尾，待用户定落位。

### 2.2 文档迁入（已完成）

**移动 8 个功能 / 业务规则类文档进 `design/features/`**：

| 原路径 | 新路径 |
|---|---|
| `design/main-panel-design.md` | `design/features/main-panel.md` |
| `design/task-expand-panels-design.md` | `design/features/task-expand-panels.md` |
| `design/creation-edit.md` | `design/features/creation-edit.md` |
| `design/creation-edit.md` | `design/features/creation-edit.md` |
| `design/archive-session-view.md` | `design/features/archive-session-view.md` |
| `design/artifact-opening.md` | `design/features/artifact-opening.md` |
| `design/dependency-snapshot.md` | `design/features/dependency-snapshot.md` |
| `design/state-machine.md` | `design/features/state-machine.md` |

**引用同步**：8 组旧路径 → 新路径，范围 = `docs/` + `src/`（含源码注释）+ `AGENTS.md` + `README.md`；共更新 **58 处**，旧路径残留 **0**。

**断链校验**：脚本扫描全仓 md 的相对链接（`](\*.md)`），发现 **26 处**并修完 ——
- 移动造成的相对路径失效（`features/` 下引 `../data-model.md` / `../../worklog/…` / `../../../AGENTS.md` 等）；
- 历史遗留断链（`design/decisions.md` 指向被移动的 4 个文件、`data-model.md` 指向 creation-edit-requirements、`worklog/genesis.md` 里 4 条少了 `../`）。
- 复检：**0 断链**。

**保持原位**：`architecture.md`（方法·架构）、`data-model.md`（数据库）、`dsh-capabilities.md` + `session-view-ui-map.md`（外部事实）、`ui-foundation.md` + `ui-style-guide.md`（样式）。

---

### 2.3 按规范七类逐类整理（1→6）

| 类 | 动作 | 结果 |
|---|---|---|
| **1 进度** | 现场层拆 `PROGRESS.md` + `PROGRESS-HISTORY.md`；worklog 一个工作包一文件 | ✅ 96 KB → 20 KB；历史 24 条 |
| **2 数据库** | `data-model.md` 补规范头（状态 / 来源 / 配套）；把混进去的「§七 设计评审」**移入** `worklog/creation-edit-implementation.md` §六，原处只留一行指向 | ✅ 已做 |
| **3 样式** | `ui-foundation.md`（抽象清单）+ `ui-style-guide.md`（使用规范） | ✅ 文档已就绪；**落码按用户要求挂起** |
| **4 方法** | **新建** `design/code-conventions.md`：通用能力分 9 类（客户端）+ 8 类（宿主侧）、每类"为什么单抽"（取自各模块头部注释）、硬约束表（什么场景必须走哪个方法、禁止什么）、已知例外表、不满足时的处理流程 (a) 重载 / (b) 单写并登记、新增通用能力的规矩 | ✅ 已建 |
| **5 功能** | 8 个功能 / 业务规则文档迁入 `design/features/`；**新建** `design/features.md` 总索引（界面功能 8 项 + 非界面功能 6 项：干什么 / 对应页面与文件 / 状态 / 详细文档） | ✅ 已做 |
| **6 外部事实** | `dsh-capabilities.md`、`session-view-ui-map.md` 补规范头，并划清「镜像官方」与「插件自有样式」的边界 | ✅ 已做 |

**收尾校验**：全仓 md 相对链接扫描 **0 断链**。

### 2.4 删除 `design/decisions.md`（108 KB 历史决策堆积）

**核对结论**：55 条里 ≈80% 已被现有专题文档继承（含 6 条已过时/被推翻：决策 16/20/26/27/29 及附录）。

**先补进专题文档，再删**（否则会丢约束力）：

| 补进哪 | 内容 |
|---|---|
| `data-model.md` §七 | **附件 `ref` 白名单 + 真删三处对称设防**（否则存在穿越 ref 删数据根外任意文件的利用链）；审计表 `task_audit`（第 5 张表，默认不清） |
| `architecture.md` 关键约束 | 不引外部工作流引擎 / 不走 ACP / 不用 subagent 派发 / 不用同类插件 / 手册四层分层（skill 唯一适用场景） |
| `dsh-capabilities.md` | **顶层禁止导出 inject**（会卡死 dsh 启动）；`ctx` 只透传不包装（cordis Proxy 三连坑） |
| `features/state-machine.md` | 补记 `skipped` 的粒度（每漏一刻度一条 + 主键用该槽时刻）；补跑只补最晚一槽；上游判定现行口径（无记录即阻塞） |
| `features/main-panel.md` | 到点显 loading / 超上界显「延期」+ 悬浮原因；延期不假装在跑 |
| `features/creation-edit.md` | 附件注入派发消息 + 权限豁免；保留期默认不清（推翻 90 天） |

**引用清理**：24 处指向它的链接改为「决策记录（已并入各专题文档）」；`ui-foundation.md` / `ui-style-guide.md` 里「拍板结论追加 decisions.md」改为「写进归属文档」；`README.md` 文档表同步。

**遗留**：9 处口径冲突已判定「以哪个为准」但**未回改** ⇒ 记入 **PROGRESS 未决项 U19**。

### 2.5 合并两个 `creation-edit-*`

- `creation-edit-requirements.md`（需求口径真源，结论）→ 改名 `features/creation-edit.md`；
- `creation-edit-design.md`（讨论提纲，"只列问题不写结论"，结论已并入上者）→ **删除**，其 §五 补充议题 8 条以「历史提纲提出的补充议题（未逐项拍板，留作后续）」形式附录进新文件；
- `features.md` 索引由两行改一行；全仓旧文件名引用同步。

### 2.6 「环境前提（脱敏）」归位

从 `PROGRESS.md` 末尾移到**根 `README.md`** 新增「环境前提（脱敏）」一节（宿主容器形态 / 网络 / 容器巡检入口 / 配置生效）—— 这是部署与使用需要知道的环境事实，不是进度。

### 2.7 回改 9 处口径冲突（用户拍板：「以现在实现的为准」）

逐条到源码核实现状后回改文档（证据见各条括号内）：

| # | 冲突 | 源码现状（= 回改依据） | 改了哪些文档 |
|---|---|---|---|
| ① | `skipped` 进不进 `task_instances` | **进**。三类场景建行（均 `attempt=0` 永不重试）：任务级错误 / once 出窗（`expired-once`）/ 补记漏刻度（`missed-slot`，只补紧邻前一条）；`store.ts:16` `TERMINAL_STATUSES`、`store.ts:567` `ensureSkipped`、`scheduler.ts:258-276 / 290-329 / 440-468` | `data-model.md` 头注、`features/state-machine.md` §2 |
| ② | 上游无记录放行还是阻塞 | **阻塞**（`latest === undefined` ⇒ `upstream-not-succeeded`）；`stale-upstream` 只是**放行后**的 warn，从不阻塞 —— `scheduler.ts:145-156, 482-484` | `features/state-machine.md` 依赖语义表 |
| ③ | 派发会话命名格式 | `[TASK] YYMMDD-HHmm · <标题>`，`attempt>0` 追加「 · 第N次」—— `tasks.ts:142-145` `sessionTitleOf`、`reconcile.ts:478` | `architecture.md`、`dsh-capabilities.md` 的示例 |
| ④ | 预览容器形态 | **页面级唯一 dock**（flex 布局成员、推压整页），弹窗靠 `right: var(--dsh-tdt-preview-w)` 让位 —— `index.ts:970-978, 1388-1399`、`archive-session-css.ts:17,22` | `features/artifact-opening.md` §二、§四（早期形态标"已废"） |
| ⑤ | `sessions.retain` 是否存在 | **存在且必须调用**，在 `binding` 之前 —— `session-view.ts:250-261` | `features/archive-session-view.md` §二、§八 |
| ⑥ | 弹窗数据源 | **keyed 流**（`order` + `nodes`），`legacy.nodes` 仅兜底 —— `session-view.ts:1171-1174` | 同上 §三 |
| ⑦ | U10 分支是否实现 | **已实现**：头部按钮 + 消息行分支 icon，均走确认框 → `sessions.fork` → `openHostSession`；服务缺失则不渲染 —— `session-view.ts:1136-1165, 1286-1294` | `session-view-ui-map.md` 4 处 |
| ⑧ | 执行记录保留期 | **默认不清**（`historyRetentionDays = 0`；`purgeHistory` 里 `days<=0` 直接返回；`logRetentionDays` 默认 30 才清）—— `config.ts:31-35,49`、`store.ts:632-634` | `features/creation-edit.md` §七 |
| ⑨ | 主界面刷新按钮 | **已不存在**：抬头只有「← 返回会话 + 标题」/ 右侧分段控件 + 「＋ 新建任务」；列表顶部右侧只有搜索 + 工作区下拉。更新靠 10s 轮询 + `rev`；`manualAt` 是死代码 —— `index.ts:985-1017, 546`、`task-list.tsx:1415-1439` | `features/main-panel.md` §4.4 |

**顺带发现的「注释与代码不符」**（未改代码，只记此处）：`src/client/index.ts:205` 注释写抬头含「刷新 · 关闭」（实际无）；`src/client/task-list.tsx:1406` 注释写右侧含「刷新」（实际无）。

### 2.8 规范头 / 封卷 / 残留过程内容（收尾）

| 动作 | 明细 |
|---|---|
| **补规范头**（7 个） | `architecture.md`、`features/` 下 6 个（archive-session-view / artifact-opening / creation-edit / dependency-snapshot / main-panel / state-machine）补 `状态 / 来源 / 配套` 三行；此后定型层文档一律带这三行 |
| **补封卷标记**（8 个） | `worklog/` 下 `artifact-opening` / `deliverables-display` / `dependency-snapshot` / `file-preview-polish` / `file-browser-ui-tuning` / `loop-decoupling` / `editor-ux-round2` / `scheduler-redesign` 加「✅ 完成封卷」；**未完成的仍不封**（main-panel / task-editor-ui / task-expand-panels / attachments-upload / ui-foundation / docs-reorganization） |
| **清过程内容** | `features/archive-session-view.md` §六「真机验证清单」→ 改为「验收」一行指向 worklog（定型层不记验证清单）；`features/artifact-opening.md`「动工前置条件（见 PROGRESS U11）」→ 改为完成态陈述；`features/creation-edit.md` §八标题「待确认」→「已拍定结论」 |

**判定依据**：`docs/README.md` §三（每类必须写 / 不得写）+ §五（收尾即封卷）。

## 三、待用户拍板

1. `design/decisions.md`（108 KB 历史堆积）怎么处理（规范已不列「决策」这一类）。
2. `creation-edit.md` + `creation-edit.md` 是否合并为一个功能文档。
3. `PROGRESS.md` 末尾「环境前提」归到定型层的哪个文件。
