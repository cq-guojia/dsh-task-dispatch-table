# 已定型的决策

> 含理由，**勿重复讨论**。要推翻请在本文件里改，并同步更新 [`docs/PROGRESS.md`](../PROGRESS.md) 的进展日志。

| # | 决策 | 理由 |
|---|---|---|
| 1 | **不用外部工作流引擎（n8n 等）做主引擎** | 它们的价值在大量 SaaS 连接器 + 可视化编排，本场景一个都用不上，退化成「一个 cron + 一个 HTTP 客户端」却仍压着一套中间件；且没有「会话/工作区」概念，感知不到 agent 执行状态 |
| 2 | **调度器 = DSH host 层插件** | 进程内可直接调 `ctx.sessions` / `ctx.on('session/event')`，比跨进程少一层中间层，感知最准 |
| 3 | **不走 ACP** | ACP（stdio JSON-RPC）是给**外部进程**用的协议；插件已在进程内，没有理由绕远路讲协议 |
| 4 | **不用子 agent 派发** | DSH subagent `inheritsParentContext: false`，且工作目录继承父会话 ⇒ 结构上做不到「派到另一个工作区」 |
| 5 | **不用同类的现成任务类插件** | 自研更可控；现有同类插件的维护活跃度与成熟度不足以满足需求 |
| 6 | **任务定义存 JSON 文件** | 人改、低频、需 diff/review/git。**不进数据库** |
| 7 | **任务状态存 SQLite** | ① JSON 做不到**原子领取**（CAS）② 文件同步工具会生成冲突副本、撕碎状态文件 ③ 跨天查询要遍历多文件。Postgres 对这个规模太重 |
| 8 | **依赖由下游声明**（dependents declared by downstream） | 加下游不改上游：A 本来无下游，后来 B、D 都要用 A，只需在 B、D 上声明，A 一无所知。Airflow / K8s Job / GHA `needs` / Bazel 都是这个模型 |
| 9 | **依赖语义两种，任务自己声明** | `same_period`（找**同一 logical date** 的上游实例，缺则跳过）/ `latest_success`（找**最近一次成功** + 新鲜度上限）。只有前者的话，跨周期依赖（月榜→日报）会失效——详见 [state-machine.md](state-machine.md) |
| 10 | **失败策略** | 重试 N 次 → 仍失败则 `failed` → **下游跳过（不分配）**；当日窗口内修复则继续，**过窗口则整条链作废、切次日新实例** |
| 11 | **agent 不写任务状态** | 控制平面 / 数据平面分离：agent 只能写**产物文件**，状态**只由调度器写**。理由：大模型自报不可信 |
| 12 | **任务手册用工作区 MD 文件**（调度器把路径写进派发 prompt），**不做成 skill** | 分层加载方案见下方「[决策 12 展开](#决策-12-展开任务手册的分层加载)」 |
| 13 | **调度器的定时器用官方 `ctx.interval` / `inject: ['timer']`** | 模块作用域的裸 `setInterval` 永不被清理；官方机制在插件卸载时自动清理 |
| 14 | **状态库默认落宿主数据根 `storages/dsh-task-dispatch-table/state.db`（`dshHomePath('storages')` 下，与宿主自身 `workspace.json` 同级），暴露 `statePath` 配置覆盖** | ① 跟宿主自己的状态目录同源：任何用户装上即可用，宿主数据根本就是持久化位置 ② 「不被多设备文件同步撕碎」属用户环境问题——`statePath` 把选择权交给安装者，风险与建议在 README 文档化 ③ 开源插件不写死任何本机路径。✅ 已按源码核实修订（原稿误写为 `<工作区>/storages/`，见决策 15） |
| 15 | **源码核实修正（基于 deepseek-ai/deepseek-harness，`@deepseek-ai/dsh-root` 0.1.6-alpha.2）**：① 派发不走 `ctx.sessions.create()` 直驱——它只建存储会话不驱动模型；真正派发 = `ctx.agents.create({ sessionId, meta: { cwd: 工作区绝对路径 }, agentOptions: { provider, model } })` + `agent.send(msg, 'next-turn', true)`；② 第三方 npm 包以 **bundle** 形态接入：`package.json` 声明 `"dsh": { "bundle": { "patch": "./cordis.patch.yml" } }`，patch 内 `- insert: { id, name: <npm 包名> }`；③ 归档程序化可用：`ctx.workspaceRegistry.archiveSession(id)`，只追加 `archivedSessionIds`、不动工作区槽位、会话仍可查；④ 定时用 `inject: ['timer']` + `ctx.interval(fn, ms)`（卸载自动清理）；⑤ 对账事件 = `ctx.on('session/event', (session, event))`，`turn/end` 是 `event.type` | 官方源码：core/agent/src/index.ts:62-119、core/session/src/index.ts:50-96、boot/plugin-manager/src/index.ts:377-378、bundle/base/cordis.patch.yml:155-158、vendor/timer/src/index.ts:12-16。**结论必须可溯源（工作规矩 #2），后续 API 疑问直接查 `/private/tmp/dsh-source`** |
| 16 | **UI 分期与形态**：① v1 **零自建 UI**——插件配置走官方 `ctx.settings`（注册 namespace + schema，用户在 settings 文档改、live 生效）；任务定义按决策 6 就是人改的 JSON 文件；② 实例监控面板（7 态展示、失败原因、手动重置/补跑）放 v1.1，形态 = **大弹窗/drawer**（挂 session 侧栏入口），**不做全屏页** | ① 宿主 `settings/` 体系是官方配置路径，零 UI 开发；② 任务规模 = 个位数任务 × 每日几条实例，信息密度低，弹窗足够；宿主自身的任务类界面惯例也是 popover（client/ui-jobs），全屏页留到任务规模上来再做；③ 插件可经 client 侧 slots 注入面板（官方 ui-cordis 先例），v1.1 前需先核实第三方 client 模块的 bundle 接入形态 |
| 17 | **Web 配置页 = 插件自带 client bundle，注册进 `settings.plugin.item` keyed slot（key = settings 命名空间）——非 Config schema 自动渲染，也非 `plugins.bundle.config`** | 真机作业核实（dsh-session-title-pattern 已在宿主跑通同款入口；**推翻前稿的 `plugins.bundle.config` 结论**——那是 ui-plugin-manager 对「组合包 bundle」的契约，单插件配置页走设置页「插件」标签页）：① 每个插件自带浏览器半侧：manifest `"dsh": { "client": { "platform": "web", "inject": [...] } }` + `exports['./client']` 指向 lazy-CJS factory 产物，宿主 modules 节点半侧扫描 Loader 行发现、经 combo 路由 `/plugins/??<id>/client.js,…` 供出（packages/client/modules/src/index.ts:781-816、:217-219）；② 产物 = `window.__ModuleLoader__.load({ id, factory(require){ … return module.exports } })` 三件套（banner/intro/footer，packages/client/tsdown.client.ts:618-624），externals 走基座模块表 PLATFORM_MODULES（packages/client/web/src/platform.ts:8-14），构建复刻 = `tsdown.client.config.ts`（tsdown 0.23，esbuild 手搓脚本已废弃）；③ **顶层禁止导出 inject**——声明了组合满足不了的依赖会让 entry 一直 pending、卡死整个 dsh 启动，服务等待一律写在 apply 内 `ctx.inject([...], cb)`；④ 组件 props：`t` 由渲染器按注册项 `locale:` 声明合成，`scope` 由 `inject:` 工厂注入；组件经 `useSyncExternalStore` 消费 scope 快照（value = schema 默认兜底全量、user = 用户层稀疏覆盖、writable），保存走 `scope.set/unset`（写经 remote.settings.mutate 带 revision 设栅，并发脱节抛错）；⑤ 设置页遍历已服务命名空间并与 key 自动配对渲染，**无需自建 gating** |

---

## 决策 12 展开：任务手册的分层加载

官方 handbook（`sessions-vs-memory`）明确立场：

> "A fifth mechanism—**Skills or workspace instructions**—stores stable operating guidance.
> **Do not put policy into semantic memory** and hope retrieval happens.
> **If an Agent must always follow a rule, mount that rule deterministically.**"

分层方案（四层，非二选一）：

| 内容 | 放哪 | 加载方式 |
|---|---|---|
| 短指令 | 任务定义 JSON 的 `prompt` 字段 | 调度器拼进派发消息 |
| **任务专属长手册** | **工作区里的 MD 文件**，路径写进 prompt | agent 主动读 |
| 跨任务铁律 | 工作区 `AGENTS.md` | **确定性挂载**（官方指定） |
| 多任务 + 人机共享的流程 | skill | 元数据常驻 + 正文按需 |

**skill 的唯一适用场景**：某流程**既要被自动任务用、又要被人手动问时用**。
只服务一个任务的手册做成 skill 是绕远路——skill 的机制价值在「让模型自己发现」，而调度器**已经知道该用哪份**。

---

## 附录：插件命名与查重记录

**已定名**：`dsh-task-dispatch-table`。
构词与官方示例 `dsh-session-title-pattern` 同构：`<对象>-<动作>-<载体>` = task(对象) / dispatch(动作) / **table(载体)**。
用 "table" 是因为本设计最独特的一点——**表驱动**（其他插件是看板/管理器，不是「一张表 + 派发」）。

**同名设想（未采用）**：`dsh-task-reconciler`（对账器，最短）/ `dsh-task-dispatch-loop`（派发循环）/ `dsh-agent-task-dispatch`（强调派给 agent）/ `dsh-workspace-task-dispatch`（强调派到指定工作区）/ `dsh-dispatch-table`、`dsh-task-dispatch-engine`（备用）。

**生态现状**：`task` + 通用词（scheduler / runner / manager / engine / orchestrator / board / dag / flow / hub / center / relay）的组合基本已被占满，取新名必须带**差异化词素**。

查重方法（可复现）：

```bash
# npm：404=可用，200=已占
curl -sS -m 15 -o /dev/null -w "%{http_code}\n" https://registry.npmjs.org/<name>
# GitHub：输出为空=未占用（需 gh 已登录）
gh api -X GET search/repositories -f q='<name> in:name' --jq '.items[].name' | grep -cx '<name>'
```

备注：npm 上 DSH 插件多为 **scoped 包**，公开发布时用 scoped 包名防撞且归属清晰。
