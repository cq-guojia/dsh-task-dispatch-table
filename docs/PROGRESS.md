# 进度

> **这是什么**：本仓库**唯一**的进度真源。
> **怎么用**：换设备 / 换会话后，agent 先读根目录 [`AGENTS.md`](../AGENTS.md)，再读本文件的**当前状态 → 未决项 → 下一步**即可接手。
> **怎么维护**：**就地更新本文件**——文件名和位置固定，不新建、不改名、不搬走；每次推进后同步「当前状态 / 未决项 / 下一步」，并追加「进展日志」。
> ⚠️ README / Issues / 聊天记录都不算真源。
>
> **本文件范围**：只记**开发项**（设计 → 数据模型 → 代码 → 发布）。
> 内容一旦**定型**就升格到 [`docs/design/`](design/) 下的专题文档，这里只留链接。
>
> **最后更新**：2026-09-23 · v0.0.1 已装进宿主；**回执机制（决策 19）+ 配置页临时调试面板已落码推送**，待重装验证

---

## 一、背景（简述）

起因是四类周期性自动化需求（定时巡检、镜像升级汇报、GitHub 动态汇总、趋势项目评估）。
讨论后的关键转向：重点**不是**这四件事，而是**要有一套通用的任务调度体系**——能被拆解、有依赖、可复用、可无人值守，且**调度层零大模型介入**。

详见 [README.md](../README.md)。

---

## 二、当前状态

**联调阶段。** v0.0.1 已装进宿主（git 源），配置页真机验证通过；`schedule.once` 已推送待重装；**回执机制（决策 19）已落码推送**——agent 经插件自带 `dist/submit.js` 直写状态库 receipt 事件，契约文件方案废除；**配置页临时调试面板已落码**（决策 16 例外）：host 把实例 / 事件 / 告警快照写进 settings 命名空间，配置页「调试日志」弹窗实时查看，替代容器里缺 sqlite3 的手工查库。

| 环节 | 状态 |
|---|---|
| 总体架构 | ✅ 定型 |
| 关键技术决策（19 条） | ✅ 定型 |
| 宿主 API 源码核实 | ✅ 未决项 1–4 全部关闭（结论沉淀为决策 15） |
| 状态机 / 依赖语义 | ✅ 完整定义（转移表 / 租约 / unknown / 窗口 / 补跑 / 串行 / 回执追问闭环） |
| 数据模型（JSON Schema + SQLite 表） | ✅ 定型（决策 19 后 contract 只剩 `validStatuses`，事件表新增 `receipt` / `nudge` 两种 kind） |
| 任务定义样例 | ✅ 定型（镜像升级日报 + 全字段注释模板 `task-template.jsonc`，已按决策 19 改写） |
| UI 方案 | ✅ 定型（决策 16：v1 零 UI 配置走 ctx.settings，监控面板 v1.1 弹窗形态） |
| 调度器插件骨架 | ✅ 落码（v0.0.1）且**已装进宿主**；**Web 配置页真机验证通过**（`settings.plugin.item` slot，决策 17 修订） |
| 一次性任务（决策 18） | ✅ 落码 + 冒烟通过（时区换算/互斥校验/自动停），**待重装真机验证** |
| 回执机制（决策 19） | ✅ 落码 + 冒烟通过（submit 正反路径 12 项），**待重装真机验证**——agent 能否跑 node 命令 + 访问 dist 路径需真机核实 |
| 端到端联调 | ⬜ 未开始（造真实任务 → 实例生成 → 派发 → 回执 → 状态落库） |

---

## 三、文档索引

| 文档 | 内容 |
|---|---|
| [`../AGENTS.md`](../AGENTS.md) | agent 操作守则、文档体系与维护规则 |
| [`design/architecture.md`](design/architecture.md) | 三层架构、职责边界、关键约束 |
| [`design/decisions.md`](design/decisions.md) | 19 条已定型决策 + 理由（勿重复讨论）、决策 12 展开、命名查重记录 |
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

**会话列表治理策略（已定）**：派发时用 `ctx.sessionTitle.rename` 起规范名（如 `[TASK] 镜像升级日报 · 2026-09-20`），跑完 `archiveSession` 归档。
⚠️ **人在调度器派发的会话里插话会干扰任务** ⇒ 自动任务会话应视为机器专用。
**原则：会话列表不是任务日志，产物目录才是。**

---

## 五、未决项

**源码核实项与实现期查证项已全部关闭**：

| 原待查 | 结论 |
|---|---|
| 工作区 name → path | registry **无按 name 查询 API**（仅 `get(id)` / `list()`，实体字段 = `id`/`path`/`title`，`workspace/src/index.ts:170,180`）→ 实现按 `title` 精确匹配、`id` 兜底 |
| 宿主 Node 版本 | engines `^22.19.0 \|\| >=24.0.0` → **SQLite 用内置 `node:sqlite`**，零原生依赖 |
| provider / model 缺省 | `AgentOptions.provider/model` 均可选，缺省走宿主默认路由（`core/agent/src/runtime-types.ts:26-35`）→ `target.model` 有值才透传，provider 不传 |
| settings 注册 | `ctx.settings.register(ns, schema, { base })`，namespace 限 `^[a-z][a-z0-9-]*$`（`settings/src/index.ts:419-459`） |

---

## 六、下一步（接手后从这里开始）

1. **重装 + 真机验证**：`dsh plugin --profile web add git+https://github.com/cq-guojia/dsh-task-dispatch-table.git` 更新；验证三条线——① 一次性任务：配置页造 `once` 任务（参考 `examples/task-template.jsonc` 末尾样例，设成几分钟后），到点派发 → 回执 → `succeeded`，次日不再生成实例（自动停）；② **回执机制（决策 19）**：agent 是否照派发消息执行 `node dist/submit.js` 提交回执、receipt 落库 → 对账收敛；故意不交回执验证追问×2 → failed；③ **临时调试面板**：配置页「调试日志」弹窗能看到任务 ids / 实例 / 事件 / 告警且自动刷新（容器内无 sqlite3，面板即观测入口）
2. **端到端联调（周期任务全链路）**：cron 任务走一遍 实例生成 → 依赖判定 → 派发 → 回执三查 → 重试/窗口收敛 → 状态落库（`storages/dsh-task-dispatch-table/state.db` 两表）；API 形状偏差按决策 15 回写
3. 联调通过后 → 发 v0.1.0 + README 安装文档；完整 UI（监控面板 v1.1，决策 16）

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
| 2026-09-23 | **配置页临时调试面板落码（决策 16 例外）**：真机调试时容器内无 sqlite3、界面零反馈（旧版插件把 `contract.path` 必填的任务静默拒载是「没反应」根因）→ 配置页加「调试日志」弹窗。通道：host 侧 logger tee（warn/error 滚存 ≤20 条）+ `TaskStore.snapshot()`（全部实例 + 最近 40 条事件，detail 截 200 字符），组装 JSON 内容去重 + 2s 节流（会话事件逐条续租会写放大），经 owner `scope.update` 写本命名空间 `debugSnapshot` 字段（`packages/settings/.../index.ts:133,456,562`）→ 'settings/updated' 提交 → client `useSyncExternalStore` 订阅自动刷新；影子 ctx 用 `Object.create(ctx)` 仅替换 logger（避免展开拷贝破坏宿主方法 this 绑定）。tsc 双工程零报错 + snapshot SQL 冒烟通过 |
