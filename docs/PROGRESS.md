# 进度

> **这是什么**：本仓库**唯一**的进度真源。
> **怎么用**：换设备 / 换会话后，agent 先读根目录 [`AGENTS.md`](../AGENTS.md)，再读本文件的**当前状态 → 未决项 → 下一步**即可接手。
> **怎么维护**：**就地更新本文件**——文件名和位置固定，不新建、不改名、不搬走；每次推进后同步「当前状态 / 未决项 / 下一步」，并追加「进展日志」。
> ⚠️ README / Issues / 聊天记录都不算真源。
>
> **本文件范围**：只记**开发项**（设计 → 数据模型 → 代码 → 发布）。
> 内容一旦**定型**就升格到 [`docs/design/`](design/) 下的专题文档，这里只留链接。
>
> **最后更新**：2026-09-23 · 真机确认**决策 22 生效**（`{{model}}` 渲染成功、会话已归入 Temp 工作区），并新定位「agent 手里没有 fs/bash 工具、只剩 MCP 工具于是狂调 MCP」根因 = 会话**从没加入 agent preset**；拍板**决策 23**（按部署默认 preset 组装会话，与用户 UI 新建会话同一套）并落码，build 通过；待重装真机验证

---

## 一、背景（简述）

起因是四类周期性自动化需求（定时巡检、镜像升级汇报、GitHub 动态汇总、趋势项目评估）。
讨论后的关键转向：重点**不是**这四件事，而是**要有一套通用的任务调度体系**——能被拆解、有依赖、可复用、可无人值守，且**调度层零大模型介入**。

详见 [README.md](../README.md)。

---

## 二、当前状态

**联调阶段。** v0.0.1 已装进宿主（git 源），配置页真机验证通过；**回执机制（决策 19）**——agent 经插件自带 `dist/submit.js` 直写状态库 receipt 事件，契约文件方案废除——与**配置页临时调试面板（决策 16 例外）**均已落码、真机可见（host 把实例 / 事件 / 告警快照写进 settings 命名空间，配置页「调试日志」弹窗实时查看，替代容器里缺 sqlite3 的手工查库）。

**决策 22 真机已验证生效**（2026-09-23）：派发会话的系统提示里 `{{model}}` 渲染成功（"powered by … model"），会话也已归入 Temp 工作区分组 ⇒ 模型漏斗与 `attachSession` 归组两处修复都对；`dispatch` 事件带上 `provider` / `model` / `modelSource`。

**本轮定案（决策 23）**：真机新缺陷 = **agent 手里没有 fs/bash 工具**，只剩根作用域注册的 MCP 工具，于是满世界瞎调 MCP、连一个空文件都写不出来（**与提示词无关**——派发消息只有任务 prompt + 回执命令，轨迹里 agent 自述 `I don't have any built-in file write tools available`）。根因 = 会话**从没加入 agent preset**（`dsh-agent-presets` 告警原文：`published without joining an agent preset; its tools, prompt sections, and skill catalog resolve against the empty global layer`）。已按决策 23 落码：派发时挂**部署默认 preset**（与用户 UI 新建会话同一套——`resolve()` + `setup` 里 `mount`），工具 / prompt sections / skill 目录（含工作区 `AGENTS.md`）全部跟随系统，插件里不写死任何工具名；**不做 `target.preset`**。build 通过，待重装真机验证。

| 环节 | 状态 |
|---|---|
| 总体架构 | ✅ 定型 |
| 关键技术决策（23 条） | ✅ 定型 |
| 宿主 API 源码核实 | ✅ 未决项 1–4 全部关闭（结论沉淀为决策 15） |
| 状态机 / 依赖语义 | ✅ 完整定义（转移表 / 租约 / unknown / 窗口 / 补跑 / 串行 / 回执追问闭环） |
| 数据模型（JSON Schema + SQLite 表） | ✅ 定型（决策 19 后 contract 只剩 `validStatuses`，事件表新增 `receipt` / `nudge` 两种 kind） |
| 任务定义样例 | ✅ 定型（镜像升级日报 + 全字段注释模板 `task-template.jsonc`，已按决策 19 改写） |
| UI 方案 | ✅ 定型（决策 16：v1 零 UI 配置走 ctx.settings，监控面板 v1.1 弹窗形态） |
| 调度器插件骨架 | ✅ 落码（v0.0.1）且**已装进宿主**；**Web 配置页真机验证通过**（`settings.plugin.item` slot，决策 17 修订） |
| 一次性任务（决策 18） | ✅ 落码 + 冒烟通过（时区换算/互斥校验/自动停），已重装；首跑实例因崩溃窗口半截派发被标 unknown（将收敛 failed），待换新实例重验 |
| 回执机制（决策 19） | ✅ 落码，真机已见 `nudge` 追问事件；派发侧 `dispatch` 事件已出现（agent 确实收到消息）——待验证的是 agent 干完活并提交回执 |
| 派发前解析（决策 22） | ✅ **真机已验证**：模型四层漏斗命中 `host-default`（`{{model}}` 正常渲染）、会话已归入目标工作区分组 |
| 会话组装（决策 23） | ✅ 落码 + build 通过：挂**部署默认 agent preset**（工具 / prompt sections / skill 由系统给，含工作区 `AGENTS.md`），create 失败撤回占位 `session_id`；待重装真机验证 |
| 端到端联调 | 🟡 已跑通到「派发 → agent 收到消息 → 模型可用 → 会话归组」，卡在 agent 无工具可干活（根因已定并于决策 23 修复）⇒ 待重装后重跑全链路 |

---

## 三、文档索引

| 文档 | 内容 |
|---|---|
| [`../AGENTS.md`](../AGENTS.md) | agent 操作守则、文档体系与维护规则 |
| [`design/architecture.md`](design/architecture.md) | 三层架构、职责边界、关键约束 |
| [`design/decisions.md`](design/decisions.md) | 23 条已定型决策 + 理由（勿重复讨论）、决策 12 展开、命名查重记录 |
| [`design/data-model.md`](design/data-model.md) | 任务定义字段表、状态库 DDL（两表）、关键设计与取舍 |
| [`examples/image-upgrade-daily.md`](examples/image-upgrade-daily.md) | 首个任务样例：任务定义 + 回执机制 + 任务手册（已按决策 19 改写） |
| [`examples/task-template.jsonc`](examples/task-template.jsonc) | 全字段注释版任务定义模板（粘进 tasksInline 前须去掉注释） |
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
| Web 配置页 | **= 插件自带 client bundle**（manifest `"dsh": { "client": { "platform": "web" } }` + `exports['./client']` = lazy-CJS factory 产物），页面注册进 `settings.plugin.item` keyed slot（key = settings 命名空间），设置页「插件」标签页自动配对渲染（决策 17，已按真机作业修订；`plugins.bundle.config` 是组合包契约，勿再误用） |
| 工作区 | `ctx.workspaceRegistry` 拿实体（`WorkspaceEntity.path` 为绝对路径）；`meta.cwd` 必须绝对路径 |
| **agent preset**（决策 23） | 一个 agent 的**工具 / prompt sections / skill 目录**由它所挂的 preset 决定（preset = 一个目录 + `agent.cordis.yml` 插件行清单 + 可选元数据）；`ctx.get('agentPresets').resolve()` 取部署默认 preset、`mount(agentCtx, id)` 必须在 `agents.create` 的 **`setup`** 里调（发布前唯一时机），`meta.agentPreset` 记会话身份。**未加入 preset 的 agent 会落到「空的全局层」**——实测只剩根作用域注册的 MCP 工具，fs/bash 全无 |
| 工作区指令注入 | `@deepseek-ai/dsh-agent-instructions` 按会话 cwd 的 `root → cwd` 链发现 `AGENTS.md` / `CLAUDE.md`（含 `.local` 覆盖），外加用户全局 `~/.dsh/AGENTS.md`，作为 prompt section 注入（属 preset 行 ⇒ 挂了 preset 才有） |

**会话列表治理策略（已定）**：派发时用 `ctx.sessionTitle.rename` 起规范名（如 `[TASK] 镜像升级日报 · 2026-09-20`），跑完 `archiveSession` 归档。
⚠️ **人在调度器派发的会话里插话会干扰任务** ⇒ 自动任务会话应视为机器专用。
**原则：会话列表不是任务日志，产物目录才是。**

---

## 五、未决项

**源码核实项与实现期查证项已全部关闭**：

| 原待查 | 结论 |
|---|---|
| 工作区 name → path | registry **无按 name 查询 API**（仅 `get(id)` / `list()`，实体字段 = `id`/`path`/`title`）→ 实现按 `title` 精确匹配、`id` 兜底 |
| 会话如何归入工作区分组 | 只设 `meta.cwd` **不会**归组：必须在会话建成后调实体方法 `workspace.attachSession(sessionId)`（内部要求会话 header 的 cwd 归一后 === 工作区 `path`）；`bootstrap()` 只在 registry 首次初始化时按 cwd 归组历史会话 ⇒ 曾经「落到未分组」的原因即此。已按决策 22 落码 |
| 宿主 Node 版本 | engines `^22.19.0 \|\| >=24.0.0` → **SQLite 用内置 `node:sqlite`**，零原生依赖 |
| ~~provider / model 缺省走宿主默认路由~~ ❌ **原结论已推翻** | 二者**必须成对显式给**：agent-loop `prepareRequest` 对 provider+model 一并校验（`if (!provider \|\| !model) throw`），缺省**不会**填 deployment persona 里的 `{{model}}` ⇒ 报 `has no value ... (section "deployment:persona-prefix")`、本轮秒结束。默认值来源 = `ctx.get('agentDefaultModel').currentSelection()`（= 用户配的 / 上次用的），兜底 = `llm.listProviders()` / `listModels()`。**决策 15 相应更正，见决策 22** |
| agent 的工具与工作区指令从哪来 | 由 agent 所挂的 **agent preset** 决定：**不挂 = 空的全局层**（真机实测只剩根作用域 MCP 工具，fs/bash 全无 ⇒ agent 干不了活）。挂**部署默认 preset** 后，工具集 / prompt sections / skill 目录（含工作区 `AGENTS.md` 注入）全部跟随系统。已按决策 23 落码 |
| settings 注册 | `ctx.settings.register(ns, schema, { base })`，namespace 限 `^[a-z][a-z0-9-]*$`（`settings/src/index.ts:419-459`） |

---

## 六、下一步（接手后从这里开始）

1. **真机重装后重跑全链路（观测入口 = 配置页调试面板）**：先 `npm run build` 再重装插件，换新 id 造一条几分钟后到点的 `once` 任务。到点看面板走完：pending → dispatched → **`dispatch` 事件（应带 `provider` / `model` / `modelSource` / `agentPreset`）** → agent 产文件 + 跑 `node dist/submit.js` → `receipt` → `succeeded`；再故意不交回执验证追问×2 → failed。**本轮三个关键观测点**：① agent 手里**有 fs/bash 工具**（不再只剩 MCP），且**读到工作区的 `AGENTS.md`**；② 宿主日志里**不再出现** `was published without joining an agent preset` 告警；③ 会话仍在目标工作区分组下、`modelSource` 命中 `host-default`（落到 `llm-first` 说明宿主 `agentDefaultModel` 没取到值）。**once 改期语义（已拍板）**：实例身份 = task_id + once 日期 ⇒ **同日改时刻无效**（建行幂等跳过 scheduler.ts:68 + 重排只重算 pending attempt=0，unknown/终态冻结）；改到明日则 id 不变即可、到点自动补建；**今日验证须换新 id**。另：崩溃排查隔离的文件（宿主数据根 quarantine/ 下）待确认后清理
2. **端到端联调（周期任务全链路）**：cron 任务走一遍 实例生成 → 依赖判定 → 派发 → 回执三查 → 重试/窗口收敛 → 状态落库（`storages/dsh-task-dispatch-table/state.db` 两表）；API 形状偏差按决策 15 回写
3. 联调通过后 → 发 v0.1.0 + README 安装文档；完整 UI（监控面板 v1.1，决策 16）
4. **回执增强待办（已拍板暂缓）**：outputs 由逗号串升级 JSON（`--outputs-file receipt.json`，agent 先写文件再提交路径，绕开命令行引号转义）；每文件简介同理走文件不走上命令行。前置条件 = 回执链路真机跑稳 + v1.1 UI 真有展示需求；防呆优先原则不变（决策 19：agent 可靠性是链路最弱一环）

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
| 2026-09-21 | **拍板决策 16（UI 分期）**：v1 零自建 UI（配置走官方 `ctx.settings`，任务定义按决策 6 编辑 JSON）；实例监控面板放 v1.1，形态 = 大弹窗/drawer 不做全屏页（宿主惯例 popover + 信息密度低） |
| 2026-09-21 | **插件骨架落码（v0.0.1）**：`src/{index,config,store,tasks,scheduler,reconcile,dispatch,host}.ts` + `cordis.patch.yml`；tsc 零报错、npm pack 产物正确、mock 宿主冒烟全过。五个实现取舍（已同步回 state-machine.md）：① 启动扫描只置 `dispatched`/`running` 为 unknown（pending 无可丢事件）② 串行互斥集合 = dispatched/running/unknown（pending 排队不互锁）③ 上游失败下游保持 pending 随窗收敛 skipped（保住决策 10 的窗口内修复）④ 补「已到计划时刻」派发守卫 ⑤ `tasksDir` 相对基准 = 宿主 `process.cwd()`。SQLite 用内置 `node:sqlite`（宿主 Node ≥22.19） |
| 2026-09-21 | **git 源安装摩擦与拍板**：pnpm 对 git 包的 `prepare` 脚本强制 allowBuilds（key 锁 commit hash，每次更新都要重加）→ 放弃 prepare，**`dist/` 入库**对齐生态惯例（AGENTS 规矩 2：推送前必须 build 并提交 dist） |
| 2026-09-21 | **依赖全部升最新线**：cron-parser 4.9(deprecated)→5.10.1（ESM 命名导出，两处调用迁移）、zod 3.25→4.6.5、typescript→5.9.3（7.x 原生编译器新线不冒进）、@types/node→22.20.4；tsc 零报错 + 冒烟通过 |
| 2026-09-21 | **v0.0.1 真机安装成功**（`dsh plugin --profile web add git+...`，装完即用无需 allowBuilds）；用户反馈：Web「插件配置」页未出现本插件卡片，暂无 UI 入口 → 排查 patch→组合→配置页渲染链路；用户拍板临时方案：Config 加 textarea 字段直接编辑任务表 JSON，先跑通再做完整功能 |
| 2026-09-21 | **Web 配置页落码（client bundle）**：机制查明——配置页非 schema 自动渲染，须插件自带浏览器半侧（manifest `"dsh": { "client": { "platform": "web" } }` + `exports['./client']` = lazy-CJS factory 产物 `dist/client.js`），页面注册进 `plugins.bundle.config`（键 = 包名；`plugins.item` 为宿主平面页保留，与先前判断不同）→ **拍板决策 17**。新增 `src/client/{index,locales}.ts` + `scripts/build-client.mjs`（esbuild 复刻宿主 clientBundle 预设），dist 入库；页面 = tasksInline 大 textarea（草稿暂存 / 保存写入带 revision 设栅 / 非法 JSON 拦截）+ 其余 6 个运行参数只读折叠展示，文案 zh/en 走 locale 服务；mock 宿主冒烟 15 项全过（factory→apply→注册→渲染→保存→卸载），待真机验证 |
| 2026-09-21 | **配置页入口按真机作业改造（slot 结论修正）**：真机无入口，用户指路 dsh-session-title-pattern（已跑通同款入口）——注册面应为 **`settings.plugin.item` keyed slot**（key = settings 命名空间），前稿的 `plugins.bundle.config` 是 ui-plugin-manager 对组合包的契约，误用 → **决策 17 修订**。同步落实作业规矩：顶层禁止导出 `inject`（entry pending 会卡死整个 dsh 启动）、locale 词典经 `ctx.inject(['locale'])` 延迟注册、`t` 由渲染器按注册项 `locale:` 声明合成、组件 `useSyncExternalStore` 消费 scope 快照、保存走 `scope.set/unset`（空值 unset 回默认）、设置页自动配对无需自建 gating。构建从 esbuild 手搓切换 **tsdown**（`tsdown.client.config.ts`：产物三件套 + PLATFORM_MODULES externals + outDir dist/clean false），删 `scripts/build-client.mjs` 与 esbuild，devDeps 增 tsdown 0.23 / @types/react ~18.3.1，新增 `tsconfig.client.json`（client 侧 noEmit 类型检查）。tsc 双工程零报错 + 产物冒烟（banner 三件套齐全、externals 仅 react、locales 内联）通过，待重装验证 |
| 2026-09-21 | **配置页真机验证通过**；新增全字段注释版任务定义模板 `examples/task-template.jsonc`（14 字段逐一注释：实例身份/窗口语义/契约三查/依赖两种 semantics 的适用场景与时间线），文档索引同步 |
| 2026-09-21 | **拍板决策 18 + 落码：一次性任务 `schedule.once`**——cron 5 段无年份字段，日月写死模拟一次性会次年同日再触发；`once`（`YYYY-MM-DDTHH:mm`，按 `timezone` 墙上时间解释）与 `cron` 互斥（`checkedTask` 运行时强校验），仅对应日历日生成一条实例 ⇒ 跑到终态后自动停、次年不再触发。实现：`tasks.ts` 加 `onceScheduledAt`（`Intl.formatToParts` 迭代两次收敛 DST）+ 互斥/格式校验，`scheduler.ts` `planFor` 分流，ensureInstances/backfill 自动复用；任务定义 14 → 15 字段（data-model.md 同步）。冒烟：时区换算（上海墙上 14:30 = UTC 06:30）、互斥同填/都缺拦截、坏格式拦截、非对应日期 undefined 全过；template jsonc 补一次性样例 |
| 2026-09-23 | **拍板决策 19 + 落码：回执机制（推翻契约文件方案）**——契约文件散落工作区难管理、agent 写文件不可靠（可漏/可错/可伪造），废除 `contract.path`；改为 agent 执行插件自带 `dist/submit.js`（命令行由调度器在派发消息里拼好）直写 `task_events`（`kind='receipt'`），对账只查库：派发后最新 receipt + status ∈ validStatuses + outputs 存在且 mtime 晚于派发。硬约束 = 验证闸门：跑完信号后宽限无回执 → 对原会话追问（`handle.agent.send` 重发命令，写死 ≤2 次）→ 仍无按重试判定失败；追问不问「完成了吗」只重发命令（agent 会撒谎）。实现：新增 `src/submit.ts`（CLI，busy_timeout 5000 与调度器并发写）、`store.ts` 加 `latestEvent`/`countEvents`/`latestReceipt`、`reconcile.ts` 改查回执 + nudge/sweep 追问分支、`dispatch.ts` 抽 `submitCommand`/`userNotice`、`resolveStatePath` 移至 `config.ts`（避循环导入）；事件 kind 新增 receipt/nudge/receipt_check。冒烟 12 项全过（正常回执落库/重复提交无害/会话不匹配/实例不存在/终态/缺参数拦截）。设计文档五处同步（decisions/data-model/state-machine/architecture/两样例）；待真机核实：agent 能否跑 node + 访问 dist 路径 |
| 2026-09-23 | **修复：`contract` 缺省化**——决策 19 废除契约文件后 schema 漏设对象默认值，`contract` 仍按必填校验，无 contract 字段的任务全部拒载（调试面板可见 warn "expected object, received undefined"）；补 `.default({ validStatuses: ['ok'] })`（与 retry/backfill 同款），模板注明整段可省略。冒烟：无 contract 任务解析出默认 ["ok"]（9745d69） |
| 2026-09-23 | **真机观察：重装插件期间 manager 容器崩-自愈循环，与插件无关勿误判**——admin 变体（DSH 0.1.5-rc.2）的管理容器自带 http-proxy 反代（3080→3079），`dsh plugin add` 重启 DSH web 的窗口期里，在途代理请求拿 ECONNREFUSED / socket hang up，manager 未挂 proxy error handler，http-proxy 默认 throw 把管理容器带崩、随即自动重启（连续 3 个启动周期，DSH 均正常就绪）。判别要点：崩溃栈全在 `/app/manager/node_modules/http-proxy` + node 内部，**无任何插件帧**；插件崩是 `[manager] DSH 已退出 (code=…)` + `plugin tree failed to load`，manager 崩是 `ECONNREFUSED/RST` + `DSH 就绪` 照常打印 |
| 2026-09-23 | **首次完整链路观测 + 面板易用性三改进（882b4f3）**——面板显示 `work-report-once:2026-09-23` pending 零事件，经 docker mcp 查容器日志 + inspect（TZ=Asia/Shanghai）判定：**正常排队**，once=22:30 北京时间未到（scheduler.ts:109 未到点不派发），pending 不产生事件；插件启动链路全部正常。改进：① 弹窗加「刷新」按钮（记录手动刷新时刻，区分数据没变 vs 页面没刷）；② 面板所有时间 `toLocaleString` 按浏览器本机时区显示（原样是 UTC ISO）；③ 实例表加 scheduled 计划时刻列 + 宿主 5 分钟心跳强制推快照（时间戳不动 = 宿主无动静，动了 = 活着） |
| 2026-09-23 | **决策 20：计划时刻 live 重排落码**——真机确认改 `once` 后旧 pending 实例仍按旧时刻跑（建行时定死）→ `store.reschedule`（CAS `pending + attempt=0`）+ `reschedulePass`（tick 内 ensure 之后、dispatch 之前）：按当前配置重算 `planFor`，不一致则更新 + 落 `reschedule` 事件；`once` 改到别日 → 旧实例 `skipped(plan-removed)`、新日实例自然补建；执行开始（attempt≥1）即冻结。「计划时刻完全不落库」被否：窗口判定 / 回执对账 / 补跑幂等都需要落库时刻。决策 20 + state-machine §13 已同步 |
| 2026-09-23 | **修复：派发预建会话撞 'already exists'（真机首跑即现）**——决策 20 重排生效、派发链路首跑，但 dispatch 在 `agents.create` 前预建了 `ctx.sessions.create(sessionId)`（为拿 Session 对象改名）→ factory 内部 `sessions.prepare` 查 `store.has(id)` 抛 'already exists'（core/session/src/index.ts:1009），agent.send 未执行，会话成空壳、实例卡 running。修复：删预建（`agents.create` 自建会话并 announce `session/created`，AgentFactory 契约 core/agent/src/index.ts:171-176、session.spec.ts:1293），改名移到 `reconcile.onCreated`（handle 无 session 对象，session/created 监听器才有）；`DispatchInput` 去掉 logger。卡住实例：租约 30min → unknown → 5min → failed；建议配置加 `"retry": {"maxAttempts": 2}` 让其自动重跑 |
| 2026-09-23 | **临时调试面板落码 + ctx 包装三连坑（183b85c→aebf6d2→72dcbb7）**——面板通道：host 把快照（任务 ids / 实例 / 事件 / 告警环形缓冲）经自有 settings 命名空间 `scope.update` 写入，client 订阅自动刷新，去重 + 2s 节流。三次真机崩溃的教训（cordis 源码实锤 reflect.ts:172-196,221）：① ctx 是 Proxy，赋值任何属性都抛 `cannot set property without provide`；② `{...ctx}` 展开拿不到 `on`/`interval` 等 mixin 方法（不在自有属性上）；③ **结论：ctx 复制/包装/遮-shadow 全部不可行**，tee logger 只能作显式参数传入各模块。教训：mock 宿主是普通对象测不出 Proxy 语义，宿主 API 行为必须先查 cordis 源码 |
| 2026-09-23 | **真机排查「服务起不来」定案：凭据写锁残留，非插件运行期问题**——禁用插件后仍崩 → 排除插件代码；`docker logs` 抓到 DSH 自身退出错误 `atomic-write: timed out waiting for the writer lock at ~/.dsh/.credentials.yaml.lock`：此前崩溃窗口里 DSH 写凭据持锁被杀（容器重启 SIGKILL），锁文件残留于挂载卷，之后每次启动 client-connection 等锁超时 → DSH 退出 code=1 → manager 反复崩。挪走死锁文件即恢复。**定责**：插件两次启动崩溃（ctx 包装）是诱因链一环；manager 反代无 error handler 放大伤害属镜像侧（`/app/manager/index.js` 无 `proxy.on('error')`），插件侧不修。**流程教训**：① 排查必须先抓 DSH 自身错误日志再下结论，别被表象（manager 栈）带偏；② 任何删除/移动指令必须先 cat 验证路径存在（'#include' 猜路径事件）；③ 重启窗口期别跑插件安装 |
| 2026-09-23 | **插件重装完成、面板恢复；半截派发实例待收敛 + once 改期语义拍板**——重装后面板正常显示：`work-report-once:2026-09-23` unknown（16:00 崩溃窗口半截派发被启动扫描标记，16:24:27），事件仅 reschedule/cas-claim/assign-session/session/created 四条、**缺 `dispatch` = agent 从未收到消息**（非回执机制问题）；观察期已过，下个 tick sweep 判 failed。**once 改期语义（本轮问答拍板，决策 20 的应用澄清）**：实例身份 = task_id + once 日期部分 ⇒ 同日改时刻无效——ensureInstances 对已存在行幂等跳过（scheduler.ts:68）、reschedulePass 只重算 pending+attempt=0（unknown/终态冻结）；改到明日有效、id 不变（新 logical_date 自动补建）；今日验证全链路须换新 id（或补跑三层入口的 SQL 手动重置，容器无 sqlite3 可 docker exec 用 node:sqlite 改）。崩溃排查隔离文件待用户确认后清理 |
| 2026-09-23 | **拍板决策 22 + 落码：派发前解析（模型四层漏斗 + 会话必须挂到工作区）**——真机定位「agent 收到消息即秒结束」根因：派发没给 `agentOptions`、也没安装会话级 model selection ⇒ deployment persona 的 `{{model}}` 无值直接抛错（事件序 `dispatch` → 同一秒 `turn/end`），agent 从未干活；另一路缺陷 = 会话只设 `meta.cwd` 未 `attachSession` ⇒ 落「未分组」。宿主源码核实（npm 上 `@deepseek-ai/dsh-{workspace,agent-default-model,agent-loop,llm,api-session-controller}@0.1.6-alpha.2` 官方产物；本机 GitHub 不通但 npm registry 通）：① `agentDefaultModel` 服务 = 部署 composition 里配的 provider+model（二者 required），UI 换模型会 `saveSelection` 回写 ⇒ 即「用户配的 / 上次用的模型」；② agent-loop `prepareRequest` 要求 provider+model **成对**；③ 归组唯一途径 = 实体方法 `workspace.attachSession(sessionId)`；④ 宿主自己的 `session-controller.create` = 「workspaceId 与 cwd 互斥、cwd 取 `workspace.path`、工作区不存在抛 not-found、建完 attach 才归组」。落码：漏斗四层（target → 插件配置 `defaultProvider/defaultModel` → `agentDefaultModel` → `llm` 首个可用）+ 四层全空判失败；新增 `target.provider`；dispatch 后 attach 归组、attach 失败则 dispose 且不发送；`dispatch` 事件落 `provider`/`model`/`modelSource`；失败 reason 三种（workspace-not-found / no-model-route / workspace-attach-failed）。**只运行期现算、绝不回写任务定义或配置**（用户明确要求：配置期固化会让用户日后换模型时失去兜底）。冒烟 21 项全过；**决策 15 相应更正**；决策 21 补录（ctx 透传而非包装） |
| 2026-09-23 | **决策 22 真机验证通过 + 拍板决策 23（会话按「部署默认 agent preset」组装）**——真机重跑：模型漏斗生效（系统提示里 `{{model}}` 渲染出部署的模型名）、会话已归入 Temp 工作区分组；但暴露新缺陷：**agent 手里没有 fs/bash 工具**，只剩 `mcp__nas-docker__*` / `container_inspect` / `read_page` / `sidebar_open` 等根作用域工具，于是整轮瞎调 MCP、连一个空文件都写不出来（agent 自述 `I don't have any built-in file write tools available`），最终自然无回执。**定位**：提示词无问题（派发消息 = 任务 prompt + 回执命令两段），根因 = 会话**从没加入 agent preset**——`dsh-agent-presets` 自带告警原文 `agent "…" was published without joining an agent preset; its tools, prompt sections, and skill catalog resolve against the empty global layer`；宿主自己的 `api-session-controller.composeAgent` / `create` 就是规范姿势：`resolve(presetId)` → `meta.agentPreset` + `setup: (agentCtx) => presets.mount(agentCtx, resolvedId)`，而 `setup` 是**发布前唯一**能挂上模型可见层的时机。**落码**（`dispatch.ts` / `host.ts`）：新增 `resolveAgentComposition`（`ctx.get('agentPresets')` → `resolve()` 取部署默认 preset；服务缺失或解析失败按 rosterless 跳过 + 告警，**不判失败**）→ `agents.create` 带 `meta.agentPreset` + `setup` 里 `presets.mount`；create 失败撤回占位 `session_id` 并报 `agent-create-failed`；`dispatch` 事件增记 `agentPreset`。**明确不做 `target.preset`**（覆盖语义 = 整包换「工具 + prompt sections + skill」，粒度粗易误解；真要定制工具属于将来配置页「高级选项 → 勾选工具」的界面工作）。文档同步：decisions 决策 23、state-machine §15、architecture 约束与架构图（顺带修正图中过时的 `ctx.sessions.create`）、本文件状态 / 能力表 / 未决项 / 下一步。`npm run build` 通过，待重装真机验证 |
