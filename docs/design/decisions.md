# 已定型的决策

> 含理由，**勿重复讨论**。要推翻请**就地改本文件**，并把过程叙事写进对应的 [`docs/worklog/`](../worklog/) 工作包文件（遗留问题回 [`docs/PROGRESS.md`](../PROGRESS.md) 的未决项）。

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
| 16 | **UI 分期与形态**：① v1 **零自建 UI**——插件配置走官方 `ctx.settings`（注册 namespace + schema，用户在 settings 文档改、live 生效）；任务定义按决策 6 就是人改的 JSON 文件；② 实例监控面板（7 态展示、失败原因、手动重置/补跑）放 v1.1，形态 = **大弹窗/drawer**（挂 session 侧栏入口），**不做全屏页** | ① 宿主 `settings/` 体系是官方配置路径，零 UI 开发；② 任务规模 = 个位数任务 × 每日几条实例，信息密度低，弹窗足够；宿主自身的任务类界面惯例也是 popover（client/ui-jobs），全屏页留到任务规模上来再做；③ 插件可经 client 侧 slots 注入面板（官方 ui-cordis 先例），v1.1 前需先核实第三方 client 模块的 bundle 接入形态。**v1 例外（2026-09-23）**：真机联调缺观测手段，配置页加临时「调试日志」弹窗（host 经 owner `scope.update` 写本命名空间 `debugSnapshot` 字段 → client 订阅渲染，内容去重 + 2s 节流）；属临时调试通道而非正式 UI，监控面板仍归 v1.1 |
| 17 | **Web 配置页 = 插件自带 client bundle，注册进 `settings.plugin.item` keyed slot（key = settings 命名空间）——非 Config schema 自动渲染，也非 `plugins.bundle.config`** | 真机作业核实（dsh-session-title-pattern 已在宿主跑通同款入口；**推翻前稿的 `plugins.bundle.config` 结论**——那是 ui-plugin-manager 对「组合包 bundle」的契约，单插件配置页走设置页「插件」标签页）：① 每个插件自带浏览器半侧：manifest `"dsh": { "client": { "platform": "web", "inject": [...] } }` + `exports['./client']` 指向 lazy-CJS factory 产物，宿主 modules 节点半侧扫描 Loader 行发现、经 combo 路由 `/plugins/??<id>/client.js,…` 供出（packages/client/modules/src/index.ts:781-816、:217-219）；② 产物 = `window.__ModuleLoader__.load({ id, factory(require){ … return module.exports } })` 三件套（banner/intro/footer，packages/client/tsdown.client.ts:618-624），externals 走基座模块表 PLATFORM_MODULES（packages/client/web/src/platform.ts:8-14），构建复刻 = `tsdown.client.config.ts`（tsdown 0.23，esbuild 手搓脚本已废弃）；③ **顶层禁止导出 inject**——声明了组合满足不了的依赖会让 entry 一直 pending、卡死整个 dsh 启动，服务等待一律写在 apply 内 `ctx.inject([...], cb)`；④ 组件 props：`t` 由渲染器按注册项 `locale:` 声明合成，`scope` 由 `inject:` 工厂注入；组件经 `useSyncExternalStore` 消费 scope 快照（value = schema 默认兜底全量、user = 用户层稀疏覆盖、writable），保存走 `scope.set/unset`（写经 remote.settings.mutate 带 revision 设栅，并发脱节抛错）；⑤ 设置页遍历已服务命名空间并与 key 自动配对渲染，**无需自建 gating** |
| 18 | **一次性任务用 `schedule.once`（`YYYY-MM-DDTHH:mm`），与 `cron` 互斥；跑到终态后自动停，无需改 `enabled`** | cron 5 段无年份字段，把日/月写死来模拟一次性任务会**次年同日再触发**——埋一年后引爆的定时炸弹。`once` 字段语义：按 `timezone` 墙上时间解释（缺省 = 宿主时区）；实例身份 = `id + 该日期`，只有一个日期 ⇒ 只生成一条实例；跑到终态后该行已存在 ⇒ 懒建行时 `dueSlot` 发现该刻度已有实例即跳过（`ensureInstances` 已于决策 31 删除），天然「跑完自动停」。互斥由 `checkedTask` 运行时强校验（schema 两字段皆 optional，运行时层 `(cron === undefined) === (once === undefined)` 判等拦截），同填/都缺都告警跳过。时区换算用 `Intl.DateTimeFormat.formatToParts` 迭代两次收敛 DST 偏移 |
| 19 | **回执机制（推翻契约文件方案）**：① agent 跑完执行插件自带的 `dist/submit.js` CLI（命令行由调度器在派发消息里拼好，agent 只补 `--status` / `--outputs`），直写状态库 `task_events`（`kind='receipt'`，含 status / outputs / note / session_id）；② 对账**只查库不读文件**——取派发时刻之后的最新 receipt，校验 `status ∈ contract.validStatuses` + `outputs` 逐一存在且 mtime 晚于本次派发；③ 硬约束靠验证闸门：跑完信号后宽限期内无回执 → 对原会话追问（重发回执命令，写死 ≤2 次）→ 仍无按失败走重试判定；④ `contract.path` 从 schema 删除，`contract.validStatuses` 保留 | ① 契约文件废除理由：文件散落用户工作区难管理（多任务多日期的小文件洪流）、agent「写文件」这一步本身不可靠（可漏、可错、可伪造路径）；② 提交通道选型（用户拍板）：**调用插件的程序直写 SQLite > MCP > shell**——MCP 全局可见对单任务会话没用；「能插件干的都插件代码去干，实在不行再用 LLM，LLM 不稳定」；③ agent 的提交永远是软约束，闭环靠「不交=失败」的验证闸门：追问不问「完成了吗」（agent 会撒谎、白烧 token），只重发现成命令；④ 决策 11 不破：submit 只追加执行日志事件，实例状态仍只由调度器写；重复提交无害（对账取最新） |
| 20 | **计划时刻 live 重排**：`scheduled_at` 在「从未执行」前跟随配置——pending 且 attempt=0 的实例每 tick 按当前配置重算 `planFor`，变了就 CAS 更新并落 `reschedule` 事件；配置已无该日计划（如 once 改到别日）→ skipped 留痕（plan-removed），新日实例由 ensureInstances 自然补建。执行一旦开始（attempt≥1 / dispatched / 终态）即冻结。**⚠️ 决策 31.7 已废除本决策**（懒建行后不再预建未来 `pending` 行，无从漂移；且到点前改配置本就生效），`reschedulePass` / `planFor` 逻辑整体删除，见决策 31 | ① 用户模型：「下次执行时间每次循环算出来，改配置就生效，只有执行开始才落执行记录」——建行时定死会让改 `once` 后旧实例仍按旧时刻跑；② 完全不存不可行：窗口判定 / 回执对账 / 补跑幂等都需要落库的计划时刻（执行记录可追溯）；折中 = 存但 live 跟随，执行开始冻结；③ CAS 守卫（`WHERE status='pending' AND attempt=0`）防与 dispatchPass 竞态；重试中的 pending（attempt≥1）不重排，避免打乱重试节奏 |
| 21 | **ctx 透传而非包装**：所有模块（scheduler / reconciler / dispatch / tasks）一律接收**原始 `ctx`** 不变；需要替换 logger 的模块把 tee logger 作为**显式参数**接收 | cordis 的 `ctx` 是 Proxy（`vendor/cordis/src/reflect.ts:172-196` 的 set trap 拒绝赋值；`on` / `interval` 等 mixin 方法不在自有属性上 :221）⇒ 三连坑实测：① 给 ctx 赋属性抛 `cannot set property without provide`；② `{...ctx}` 展开拿不到 mixin 方法；③ 结论是复制 / 包装 / shadow 全部不可行。教训：mock 宿主是普通对象，测不出 Proxy 语义，宿主行为必须先查 cordis 源码（真机 2026-09-23） |
| 22 | **派发前解析：模型漏斗（四层，运行期现算）+ 会话必须挂到工作区**：① 模型漏斗逐层下漏 —— `target.provider/model` → 插件配置 `defaultProvider/defaultModel` → 宿主 `ctx.get('agentDefaultModel').currentSelection()`（= 用户配的 / 上次用的模型）→ `llm.listProviders()` 首个能列出模型的 provider + 其首个模型；四层全空则实例判失败，不建会话不派发。② `target.workspace` 语义 = **工作区**（非工作目录），匹配不到即判失败；cwd 由工作区实体的 `path` 派生；会话建成后**必须 `workspace.attachSession(sessionId)`** 才归组。③ **解析只在派发时现算，绝不回写任务定义或配置**；本次实测 route 与命中层级只落 `dispatch` 事件 | ① 真机事故：插件没给 `agentOptions`、也没安装会话级 model selection ⇒ deployment persona 里的 `{{model}}` 取不到值，报 `prompt variable "{{model}}" has no value for this assembly (section "deployment:persona-prefix")`，agent 本轮秒结束、任务从未执行（事件序 `dispatch` → 立刻 `turn/end`）。宿主 agent-loop `prepareRequest` 对二者一并校验：`if (!provider \|\| !model) throw` ⇒ **必须成对给**，不存在「缺省走宿主默认路由」。**决策 15 相应更正**：`AgentOptions.provider/model` 缺省 ≠ 走宿主默认路由。② 归组机制：`attachSession` 读会话 header 的 cwd → realpath 归一 → 必须 === `record.path` 才登记进 `sessionIds`；只设 `meta.cwd` **不会**自动归组（`bootstrap()` 只在 registry 首次初始化时按 cwd 归组历史会话）⇒ 这正是「会话落到未分组」的原因；宿主自己的 `session-controller.create` 也是「工作区与 cwd 互斥、cwd 取 `workspace.path`、工作区不存在抛 `workspace/not-found`、建完 attach 才归组」。③ 用户明确要求「不在配置期求解、不给用户列模型让他选」——配置期固化会让用户日后换模型时失去兜底；配置项保持空值 = 未配，每次派发按漏斗现算（证据：npm 上 `@deepseek-ai/dsh-{workspace,agent-default-model,agent-loop,llm,api-session-controller}@0.1.6-alpha.2` 产物源码） |
| 23 | **派发会话按「部署默认 agent preset」组装**（= 与用户 UI 新建会话同一套）：`ctx.get('agentPresets')` → `resolve()` 取部署默认 preset（settings 的 `selectionPolicy().defaultId`，热读）→ 在 `agents.create` 的 **`setup`** 回调里 `await presets.mount(agentCtx, presetId)`，并把 id 写进 `meta.agentPreset`；服务缺失 / 解析失败 ⇒ 按 rosterless 处理（跳过 + 告警，**不判失败**）。⚠️ **不做 `target.preset`**（不加任务级覆盖） | ① 真机事故：派发出的 agent 手里**没有 fs/bash 工具**，只剩根作用域注册的 MCP 工具，于是满世界瞎调 MCP、写不出文件。根因 = 会话从没加入 preset——agent-presets 的告警原文：`agent "…" was published without joining an agent preset; its tools, prompt sections, and skill catalog resolve against the empty global layer`。② preset = 一个目录（目录名即 id）+ `agent.cordis.yml`（该会话要挂的插件行清单：**工具 / prompt sections / skill 目录**）+ 可选元数据 + trust ⇒ **工具与系统提示词是同一张清单一起给的**，「跟系统走」= 挂同一个 preset，插件里一个工具名都不写死：部署往 preset 加工具，派发下一轮自动就有。③ 工作区 `AGENTS.md` 由 `@deepseek-ai/dsh-agent-instructions` 按会话 cwd 的 `root → cwd` 链发现并注入，属 preset 的 prompt-section 行 ⇒ 挂上即有（cwd 已由决策 22 取自工作区实体 `path`）。④ 宿主规范姿势（`api-session-controller.composeAgent` + `create`）逐字如此：`resolve(presetId)` → `meta.agentPreset` + `setup: (agentCtx) => presets.mount(agentCtx, resolvedId)`；`setup` 是**唯一**能挂上模型可见层的时机（mint agentCtx 之后、announce 之前），抛错则作用域回滚、会话与 agent 都不发布（故 create 失败时撤回占位 `session_id`）。⑤ 用户拍板不做 `target.preset`：覆盖语义是**整包换**（工具 + 提示词 sections + skill 一起换），粒度粗、易误解；真要定制工具属于将来「配置页高级选项 → 勾选工具」的界面工作，与派发链路无关。（证据：npm 上 `@deepseek-ai/dsh-{agent-presets,agent-loop,api-session-controller,agent-instructions}@0.1.6-alpha.2` 产物源码） |
| 24 | **回执通道改为插件自带的 per-agent 工具 `task_dispatch_table_receipt`**（修订决策 19 ③ 的 shell 通道）：派发时在 `agents.create` 的 `setup(agentCtx)` 里 `agentCtx.tools.register(...)`，工具**只对该任务会话可见**；`execute` 在**插件进程内**用既有 TaskStore 连接写 `task_events(kind='receipt')`（形状与 `submit.js` 完全一致 ⇒ 对账逻辑零改动）。绑定信息（实例 id / 会话 id / status 合法值）由**闭包注入**，不经过模型（模型拿不到、也伪造不了 `session_id`）。回执说明里写死失败策略：失败等约 10 秒**原样重试 ≤3 次**，仍失败**立即停止、不许尝试任何其他手段**。`submit.js` 降级为手动/排查备用通道，不再出现在派发与追问消息里 | ① 真机事故：决策 23 生效后 agent 已有 fs/bash 工具、产物文件也真建出来了，但回执提交失败——agent 的 bash 跑在 **Landlock 沙箱的 `workspace-write` 模式**（只能写工作区内），而 `submit.js` 要写宿主数据根下的 `state.db` ⇒ SQLite 报 `attempt to write a readonly database`；`chmod u+w` 无效（拦的是沙箱不是权限位），`cp` 回写被 `[sandbox: file access denied under workspace-write mode]` 点名拒绝，容器内又没有 `sqlite3`/`file`，agent 只好去拷贝数据库绕道。**路径谁传不是根因：在 agent 沙箱里写宿主状态库本身不成立。** ② 用户拍板：工具由插件自带、只注入任务会话（不污染用户自己的会话）；且**不该让 agent 传库路径、也不该让它传 sessionId**（可伪造面）。③ 机制核实（`@deepseek-ai/dsh-tools@0.1.6-alpha.2`）：`tools.register()` 按**调用它的 ctx** 分层（原文 `Register globally or in the calling agent scope`；冲突文案 `for a per-agent variant, register through that agent's agent.ctx instead`）⇒ 经 `agentCtx` 注册即 per-agent、发布前生效；`register` 只强校验 `output { schema, render }`，**可手写裸 definition**（标准 JSON Schema 子集）⇒ 插件零新增依赖（`defineTool` 那套要引宿主包，刻意不用）。④ 提示词侧教训：真机上 agent 会自行"想办法"（拷库 / `chmod` / 换 `sqlite3`），全是无效动作且白烧 token ⇒ 必须在提示词里写死「重试上限 + 立即停手、禁止其他手段」。⑤ **命名与入参归一**：工具名取**包名去掉 `dsh-` 前缀 + `_receipt`**（= `task_dispatch_table_receipt`）——宿主对重名的处理是「**同层抛错 / 跨层 scoped 遮蔽 global**」（`NamedEntries` 冲突直接 throw；类注释 `Scoped registrations shadow globals`），带插件名空间把撞名压到可忽略（宿主对工具名无格式/长度校验，纯防撞）；注册失败（同名冲突 / 无 `tools` 服务）⇒ **判失败 `receipt-tool-unavailable`**，不派发。`status` 走**宽松接受、存声明值**：大小写不敏感 + 去首尾空白与零宽字符（`U+200B..U+200D` / `U+FEFF`），命中后存回任务声明的那个值（对账 `includes` 恒成立，也不因 agent 写 `OK` / `ok ` 而白烧一轮）；`outputs` 逐项去空白、反斜杠归一成 `/`、去 `./` 前缀。（证据：`@deepseek-ai/dsh-tools`、`@deepseek-ai/dsh-tool-fs` 官方产物源码 + 真机 stderr） |
| 25 | **执行身份重设计：三层分离 + 锚点用「计划时刻」+ 主键用 UUID**（修订原「实例身份 = `task_id` + `logical_date`（日期）」的旧约定）：① **三层**——任务定义（可变，人改）/ 执行记录（不可变，一次执行一行）/ 事件（append-only）；② 定义侧 `id` **由系统生成**，用户不填、生成后不可变，另设 `title` 自由文本不参与身份 ⇒ 改名不断链；③ 执行侧主键 **UUID**（**不用自增**：客户端 / 重装 / 多实例环境下自增不可靠，用户拍板）；④ **身份锚点 = `scheduled_at` 计划时刻**（cron 算出的**刻度**，含时分秒 + 时区偏移），**既不是日期、也不是实际执行时刻**；⑤ 去重靠 **`UNIQUE(task_id, scheduled_at)`** ⇒ tick 幂等；⑥ 实际时刻另存 `dispatched_at` / `finished_at`，**不进 id**；⑦ `logical_date` 保留为「该刻度所在日历日」，仅供 `same_period` 依赖判定与界面分组。**未执行前锚点仍可随配置重排（决策 20），执行开始即冻结** | ① **旧锚点只有年月日是真缺陷**：`scheduledAtFor` 按天只返回第一个匹配 ⇒ 每小时 / 每几分钟的 cron 一天只能出一条。② **刻度由 cron 决定，与「上一次 + 间隔」无关** ⇒ 迟到 / 重启 / 多跑几轮都不漂移；用户改配置不影响既有执行行，真正要防的只有「同一任务同一刻度」，正是唯一约束。③ **业界核实（2026-09-24 查官方文档，非转述）**：Airflow DagRun 主键是整数 `id`，`run_id` 才是可读串 `scheduled__2026-09-24T01:00:00+00:00`，另存 `logical_date` / `start_date` 等把计划与实际分开；k8s CronJob 的 Job 名 = CronJob 名 + 11 位时刻后缀（v1.32 起另加 `batch.kubernetes.io/cronjob-scheduled-timestamp` annotation），且改 CronJob 只影响新 Job；Temporal = WorkflowId + RunId；Prefect flow run id 是 UUID。⇒ **主键不透明 + 可读串作业务键 / 去重键**是主流。**落地补充（2026-09-24）**：① 主键列名沿用 `id` ⇒ **旧库加索引即升级，不必重建表**；② id **直接写进用户的任务定义 JSON**（`task_defs` 登记表方案已废弃——「位置锚点」（inline 下标 / 文件路径）在删首条时会让后面全部串位，把 A 的 id 和历史错配给 B）；③ `ensureInstances` 窗口 = `[now - max(窗口, 26h), now + 2×tick]`，刻度超 200 个只留最近的（更远历史归 `backfill.days`）；④ `reschedule` 加占用守卫：目标刻度已被同任务另一实例占用则返回 false——没有它 UPDATE 会直接撞唯一约束把 tick 打挂（冒烟当场测出）；⑤ 旧库迁移**可观测、不静默删数据**：建唯一索引前发现「同任务同刻度」重复行只合并并如实上报数量。落码过程与旧库兼容实证见 [worklog/ticks-identity.md](../worklog/ticks-identity.md) |
| 26 | **面板升级为双标签弹窗（任务配置 / 执行记录）+ 新增 `npm run smoke` 冒烟脚本** | ① 原调试快照是单页「按表结构罗列」的排障视图（决策 16 临时例外），看不出「配置 → 执行」的关系；改为：**配置页** = 内嵌任务表 JSON 输入框（暂存 + 保存）+ 已解析任务列表（id / 名称 / 周期 / 下次执行）；**执行记录页** = 全部记录 + 按状态 / 按任务过滤 + **点一行展开该次执行的事件时间线**。② 用户拍板：先只搭框架，交互从简（不做行内编辑 / 手动重试按钮，那属于 v1.1 产品化）。③ 事件按 `instance_id` 从快照过滤 ⇒ 快照补了 `instance_id` 列、事件条数 40 → 200。④ **（2026-09-24 修订：主题适配 + 抬头布局）** 面板**不再写死任何颜色**——一律取宿主自己的主题变量（`@deepseek-ai/dsh-client-ui-theme@0.0.1-rc.1` 的 `--dsw-alias-label-primary` / `bg-layer-1|2|3` / `border-l2` / `brand-primary` / `state-error-primary` / `interactive-bg-hover` / `bg-mask-1` / `shadow-lv3` / `--ds-font-family-code` / `--ds-transition-duration` / `--ds-ease-in-out`，均带兜底值），宿主切「明色 / 暗色 / 跟随系统」时插件自动跟随，**插件侧零主题判断**。抬头改为与宿主面板同序：**标题在左；右上角从右往左 = 关闭（图标）· 分组标签（分段控件）· 刷新（同款图标按钮）**，三个控件尺寸统一（26px / 12px 字号）。图标用**内联 SVG**（`currentColor` 跟随主题），刻意不引 `@deepseek-ai/dsh-client-ui-primitives`（参考插件 dsh-context 引了它，但我们的 bundle 未声明该外部模块，引了有运行时解析风险——等确证平台模块表里有它再换官方组件）。⑤ **（设置页卡片精简）** 设置页**只留一行「标题 + 描述 + 箭头」**（与宿主其它插件卡片同形），点一下打开面板；原来卡片上的内嵌 JSON 输入框与只读运行参数**全部挪进面板的「任务配置」页**——设置页不再是一整块表单。⑤ **冒烟脚本零新增依赖、直接测 `dist` 产物**（测的是真要发布的代码），覆盖刻度计算 / 定义身份 / 执行防重 / 旧库迁移 / 调度器刻度化 5 组 28 项——**它当场测出 `reschedulePass` 把多条 pending 重排到同一刻度、撞唯一约束的真 bug**，没有它这个缺陷会一路带到真机 |
| 27 | **执行记录「查看会话」链接（打开归档会话）** | ① 用户想从面板直接看某次执行的会话实况。经查 `@deepseek-ai/dsh-api-session-controller/client` 的 `ClientSessions.open(id)`（兄弟插件 dsh-session-title-pattern 同款注入方式：`ctx.inject(['sessions'], ...)` 拿服务）：`open(id)` 把该会话选为「当前」⇒ 宿主原生会话视图打开；**归档会话仍留在宿主会话列表**（archiveSession 只追加 archivedSessionIds、不动列表），一样能定位。② **实现**：client 在 `apply` 里注入 `sessions` 服务、捕获 `open` 封成 `openSession` 透传给面板；执行记录页两处放链接——「会话」列（截断 id 做可点链接，点一下 `stopPropagation` 避免触发整行展开）+ 展开事件时间线标题右侧（「↗ 查看会话」），都调 `sessions.open(fullSessionId)`。服务不可用时（`sessions` 未注入）链接不渲染、不报错、不阻断启动（与兄弟插件一致：服务缺失只让该能力失效）。③ **两点边界（用户原问「能否继续对话 / 能否屏蔽技术规划」）**：**能否继续对话由宿主决定**——归档会话的 scope 在离开列表时冻结为只读视图，本插件只负责打开、不控制其内部读写；**「技术规划」是 agent 自己生成的对话内容、由宿主会话视图渲染，插件无法从外部隐藏或过滤**——若要「只读 + 过滤技术规划」得另做嵌入式只读视图（会失去继续对话能力），留待用户拍板是否要。**（2026-09-24 修订 → 失效：`sessions.open` 对归档会话无显示面，且 client 依赖漏声明致链接很可能根本没渲染；改用决策 28。）** |
| 28 | **「查看会话」改为面板内只读弹窗（官方解析 + 自绘简化渲染）——修订决策 27**（用户 2026-09-24 已拍板；**同日落码，待真机验证**；⚠️ **渲染层方案已被决策 29 修订：自绘画面 → 复用官方 ChatView，弹窗形态与数据闸门保留**） | ① **决策 27 为何失效**：`sessions.open(id)` → `manager.select(id)`（`dsh-api-session-controller/lib/client.js:3093`），而归档会话被宿主**从显示面隐藏**——`@deepseek-ai/dsh-workspace` 的 `archivedSessionIds` 原文「sessions hidden from every grouping surface」，且**只暴露 `archiveSession`、无 unarchive**（`lib/types/spec.d.ts:27-29`、`lib/types/index.d.ts:116,124`）⇒ `open()` 只是把它选成 current、界面无处显示 ⇒ 掉回「新建会话」空态（真机 2026-09-24 用户所见）。次因：我方 client `dsh.client.inject` 漏声明会话相关包（兄弟插件写了 `@deepseek-ai/dsh-api-remotes` / `dsh-client-ui-conversation` / `dsh-client-ui-session`；我们只有 locale / ui-renderer / ui-settings / ui-settings-plugins）⇒ `sessions` 服务很可能没到位、链接压根没渲染（与「点不了」吻合）。② **官方渲染分两半、只有一半能调**：`@deepseek-ai/dsh-client-ui-conversation` 导出的是**组装/解析层**（`ctx.uiConversation`、`UiConversation.binding()` → `ConversationBinding{ snapshot, target() }`，`lib/types/client/conversation/assembly.d.ts:14-49`）与**节点类型族**（`ConversationNode` = user / assistant / steering / context / model-retry / turn-error / turn-max-tokens / tool-result / command / compaction / unknown，`lib/types/client/contract/records.d.ts:249`；`AssistantBlock.kind = text｜reasoning｜image｜tool-call｜other`，`:27-41`）；但**把节点画成界面的 React 组件由具体目标（Chat）私有、不对外导出**，对话外壳挂在根级 `main.conversation`、**只渲染「当前会话」**、不接受任意会话 id（README「shell」）。⇒ 「整调用官方渲染」**做不到**，最终画面只能自绘。③ **采纳方案**：面板内**只读弹窗**——**(a) 结构用官方**：`sessions.binding(id)` → `uiConversation.binding(...)`（必要时 `.target('chat')`）；归档会话优先走这条（宿主 `session/list` **不过滤归档**，`dsh-api-session-controller/lib/index.js:1829-1846`，故 `binding` 理论上仍成立——**待真机验证**）；若不成立，退到**冷读日志** `session/follow` + `session/page`（官方明确「不激活 Agent 也能读历史」，`lib/types/history.d.ts:16-22`、`lib/typert.remote-client.d.ts:20,25`）。**(b) 画面自绘**：把上面导出的节点 kind 逐个映射成简单样式（十来个）+ 一个弹窗容器。**(c) 过滤**：默认**不渲染 `reasoning`**（思考块 = 用户说的「技术规划」）、`context` / `unknown` / `compaction` 等噪音 kind；**未知 kind 一律 fallback**（折叠/原文），升级不白屏。④ **边界（用户已明确接受）**：**只读、不能续聊**（任务本已结束、也不该续聊）；界面是**简化版、与官方不一致**；官方升级时**只维护「节点 kind → 样式」这一处映射**（解析那半由官方承担），漂移可控。⑤ **零漂移逃生门（未采纳，仅备选）**：把「跑完即归档」改成可配置（`archive.on`）⇒ 会话留在正常列表、官方视图完整渲染 + 可续聊，但**不是弹窗**且列表变长（即未决项 U2）。**⑥（落码修订 2026-09-24）inject 清单按服务提供方声明、不照抄兄弟插件**：查装配源码（`packages/client/modules/src/client/system.ts:207` inject 包先于消费者 arrive；`manifest.ts:46-48`「`inject` names package rows whose factories must arrive before this row materializes, while Cordis separately uses the same package edges to compose entries」）确认清单语义后，声明 `sessions` ← `@deepseek-ai/dsh-api-session-controller`（其 lib/client.js:3087 `provide("sessions")`）+ `uiConversation` ← `@deepseek-ai/dsh-client-ui-conversation`（lib/client.js:16522 起组装）；兄弟插件的 `dsh-api-remotes` / `dsh-client-ui-session` 是它自己 `remote.*` 消费面，与我们无关。**⑦ 数据链落实**：`binding()` 只物化句柄不拉数据（manager.get() 物化时 eventSource 为空）⇒ 数据闸门 = 运行时**探测调** `session.open()`（幂等拉尾页；不在 SessionFace 类型上）；渲染消费 `target('chat')` 快照的 `legacy.nodes`（官方兼容投影，StatsPills 同款）；「加载更早记录」走公开动词 `loadOlder()`。**⑧ 实现**：`src/client/session-view.ts`（类型全本地结构化声明，零新增 npm 依赖）+ `index.ts` 集成（openSession → viewSession，弹窗挂 Fragment 兄弟子树防遮罩误关）+ locales 10 键双语 + smoke [8] 组（产物符号 + inject 清单断言）；冒烟 53 项全过 |
| 29 | ⚠️ **已撤销（不可行）**：原方案「复刻 slot 渲染引擎挂官方 ChatView 渲染归档会话」——T1 核实（2026-09-26，宿主 0.1.7-RC.2 实际产物）推翻关键前提：`sessions.retain` 与 `uiSession.adapter.bindingSource` 在 shipped 包里**不存在**（决策 29 ④ 所列「ISessions 正式契约方法」在 0.1.7-RC.2 不实），ChatView 仍只渲染「当前会话」、不接受任意归档 id ⇒ 挂载路径断。渲染层改走**决策 34（借官方设计变量 + 自渲染）**，弹窗壳与数据闸门（决策 28）保留 | ① 动因（决策 28 自绘落差大）仍成立；② **T1 推翻关键前提**：决策 29 ④ 依赖的 `entriesOf('conversation.view')` / `storeOf` / `scope('session')` / `sessions.retain` / `bindingSource` 在 0.1.7-RC.2 实际产物中：`retain` 与 `bindingSource` 不存在，ChatView 仅服务当前会话、喂不进任意归档 id；③ 用户拍板改走「借样式」路线（决策 34）——不碰任何宿主内部符号、稳；④ 原决策 29 ⑤ 的「0.1.x 跟调」风险升级为「该路线根本不通」；⑤ 已核实替代事实：聊天界面样式由 **CSS 变量设计体系**驱动（类名是 CSS-module 哈希、CSS 规则由宿主构建注入、不以文件落地），故「抄类名」也行不通，只能借变量值 |
| 30 | **任务身份三字段模型：id（机器身份，系统生成随机 UUID）/ title（名称）/ code（编号，可选、仅记录）** ＋ **身份闸门「保存时固化，运行时只认」**（同日三次拍板定型；修订决策 25 ②的「`t-`+32hex」格式与指纹兜底） | **三字段分工**：唯一性判断不能用用户录入的东西——录「ABC」与「ABC␣」（尾空格）自认为同一任务，程序却判成两个 ⇒ **身份必须由系统在录入瞬间生成**，用户不碰、无入口改（手改 JSON 后果自负）；title 给人看、随时改、不参与身份；code 用户自编、只做记录与查询、**不参与任何判断**。**闸门规则（现行）**：① **保存闸门**（POST /tasks）——无 id ⇒ 生成 UUID 固化写入（= 新增）；有 id 且为 UUID 且**命中现有已保存任务表** ⇒ 保留（= 修改，身份连历史）；有 id 非 UUID（数字 / kebab-case / 旧指纹）**或** UUID 不在现有表 ⇒ **整批拒绝保存**（HTTP 422 指明第几条与原因，面板直接显示文案）；② **运行时只认不修**——解析遇无 id / 非 UUID 条目 warn 跳过、绝不生成兜底（`withIdentity` / 内容指纹兜底废除）。**推论**：首次录入（现有表为空）不能自带 UUID，身份只能由系统生成；拿 UUID 去「改」老 kebab-case 记录同样被拒（老记录无 UUID 身份，想用就删 id 重录）；**改配置永远不需要换 id**（改期语义见决策 25：唯一键 = `(task_id, scheduled_at)` 全时刻）。防重只走 `UNIQUE(task_id, scheduled_at)`，code / title 一概不进判断。三拍过程、冒烟实证与真机验证见 [worklog/identity-gate.md](../worklog/identity-gate.md) |
| 31 | **调度循环重设计：懒建行 + 不回看 + 不补跑 + skipped 只进日志**（用户 2026-09-26 拍板） | ① **不回看、不补跑**：Loop A 只判「现在这一刻该不该跑」——取满足 `scheduled_at <= now <= scheduled_at + window` 且 `(task_id, scheduled_at)` 无实例行的**最晚**刻度；窗口内更早未处理刻度记 `missed_slot`（不补跑、不建行）。② **不预建未来 pending**：未来刻度不建行，落到自己那一轮 `now` 进窗口才建。③ **懒建行直接 `dispatched`**：`ensureInstance(..., 'dispatched')` 直接落库，不走 pending→dispatched 两跳，从根上消灭崩溃残留 pending。④ **skipped 不进 `task_instances`**：过期 / 被依赖卡 / 预条件失败一律不建 `task_instances` 行，只进独立 `task_log` 表（可定时清）。⑤ **预条件失败**（工作区/模型找不到）：记 `task_log`、不建行、下轮同槽再判；窗口内配好即跑，超窗记 `missed_slot` 丢弃。⑥ **崩溃残留 pending**：Loop B 扫到无会话 pending → 窗口内重派、窗口外删行 + 记 `stray_pending`。⑦ **删除项**：`ensureInstances` 远回看 + skipped 预建（原 26h 回看）、`reschedulePass`（决策 20，无预建未来行可漂故废除）、`backfill.days` 字段 + `backfill()`（与「不补跑」矛盾，删除）。⑧ 幂等不变：`UNIQUE(task_id, scheduled_at)` 仍兜底，同槽第二次 tick 撞唯一索引不双派。**推翻决策 20 的 live 重排**（无预建未来行可漂）。落码实证见 worklog（里程碑 11） |
| 32 | **执行记录冗余字段 + 独立日志表 `task_log`**（用户 2026-09-26 拍板） | ① **独立 `task_log` 表**（ts / task_id / scheduled_at / level / kind / message），与 `task_instances` / `task_events` 分离，可定时清除（retention 默认 30 天 `DELETE WHERE ts < now - retention`）；专收「未推进到执行那一步」的诊断（missed_slot / startup_missed / precondition / dep_blocked / stray_pending），不污染任务记录表（用户拍板：任务没到推进那一步就不写任务记录表，诊断进日志且可清）。② **`task_instances` 加 `outputs TEXT` 与 token 三拆列 `token_in INTEGER` / `token_out INTEGER` / `token_in_cache INTEGER`**（推翻本决策原「单个 `tokens` 总数」——用户 2026-09-26 改拍板拆分）。③ **产出写回**：完成瞬间（`finishTerminal` 成功/失败都写）把回执 receipt 的 `outputs` 写回 `task_instances` 做冗余（`task_events` 仍为真源，总表可直接展示，不必再 join 日志表）。④ **token 三拆**：从会话 `turn/end` 事件取用量，分别写回 `token_in`（prompt）/ `token_out`（completion）/ `token_in_cache`（命中上下文缓存的输入 token）；多位置（`usage` / `tokenUsage` / `tokens` / `data.usage` / `detail.usage` / `message.usage`）× 多字段名（`promptTokens`/`inputTokens`/`prompt_tokens` 等 + `cachedTokens`/`promptTokensDetails.cachedTokens`）探测。**只认结构化分量、不再记单一总数**——事件仅给总数（如 `totalTokens`）无法归属 ⇒ 三列留 null（不伪造）；宿主事件压根不带 usage ⇒ 三列留 null，不阻塞链路。宿主事件 usage 字段形状接时确认（U8） |
| 33 | **依赖判定简化：`latest_success` 改为「上游最近一条必须是 `succeeded`」；删除 `freshness`；不做水位线；复用旧产出只告警不拦**（用户 2026-09-26 拍板） | **起因**：上游「错过/失败/在跑」时 `latest_success` 会跳过非成功行、拿更早的成功放行 ⇒ **下游用旧产出跑**。**新判定**：取上游最近一条实例（`scheduled_at` DESC，**不分状态**）——`succeeded` ⇒ 放行；`dispatched`/`running`/`unknown` ⇒ 阻塞等（记 `dep_blocked`）；`failed` ⇒ 阻塞（失败向下游传播，决策 10）；无记录 ⇒ 阻塞。**已知风险（用户接受）**：上游「错过/跳过」（无记录）时仍复用上一次成功产出 ⇒ **不拦**，记 `task_log` **warn**「上游无新产出，本次复用 <时刻> 的旧产出」，判据 = 上游成功时刻 ≤ 下游上次执行时刻（**不新增字段**）。**不做**：水位线 / `consumed_upstream` 列 / `consumeOnce` 开关 / `freshness` 字段（已从 `tasks.ts` schema 删除）——水位线与「周报→日报」快照复用诉求冲突（会把每天跑的下游挡成每周跑一次），故整体废弃。**必修 bug**：`getLatestSuccess` 排序由 `logical_date DESC`（只到日、同日多次成功取哪条不确定）改 `scheduled_at DESC`。落码与真机验证见 [worklog/dependency-semantics.md](../worklog/dependency-semantics.md)（里程碑 12） |

| 34 | **会话弹窗渲染层 = 借官方设计变量 + 自渲染（推翻决策 29 的 ChatView 挂载）**（用户 2026-09-26 拍板） | ① **动因**：决策 28 自绘落差大（无 markdown / 无思考折叠 / 工具卡简陋），决策 29 的 ChatView 挂载经 T1 证实在 0.1.7-RC.2 不可行（`retain` / `bindingSource` 不存在）；② **可借的是「样式」不是「组件」**：宿主聊天界面样式由一套 **CSS 变量设计体系**驱动——全局配色 `--dsw-alias-*`（label / bg / border / brand / state / shadow 等，宿主运行时注入 `:root` 或根容器，插件同文档可直接 `var()` 引用、自动跟随明/暗）+ 布局 token `--dsh-chat-content-width`(748px) / `--dsh-chat-flow-gap`(8px) / `--dsh-composer-side-clearance`(16px) 等（已从 0.1.7-RC.2 包核实真实定义）；**类名是 CSS-module 哈希、CSS 规则由宿主构建注入、不以文件落地 ⇒ 不能抄类名，只能借变量值**；③ **实现**：插件自渲染消息 / 思考 / 工具卡 DOM，套用官方设计变量（带兜底值，决策 26 同款）+ 抄来的布局值，外观对齐官方、深浅色自动跟随；markdown 用自带轻量渲染器（零/低依赖）；④ **不依赖任何宿主内部符号**（无 `retain` / `scope` / `entriesOf`），宿主升级零风险；⑤ 保留决策 28 的弹窗壳、数据闸门（`sessions.binding` → `uiConversation.binding(...).target('chat')` → `legacy.nodes`）、`loadOlder`、只读不续聊、噪音 kind 过滤（`context` / `compaction` / `unknown`）、推理块默认折叠 |
| 35 | **查看会话前必须 `sessions.retain(id, { source })` 物化 scope**（2026-09-26 源码核实 + 真机验证；**同时修正决策 28「归档会话照样可 binding」与决策 34「`retain` 不存在」两处事实错误**） | ① **根因（源码）**：`@deepseek-ai/dsh-api-session-controller@0.1.7-rc.2` `lib/client.js:3406` —— `binding(id) { return this.scopes.get(id)?.binding }`，**只查已物化的 scope、从不创建**；归档 / 久未打开的会话没有 scope ⇒ 返回 `undefined` ⇒ `@deepseek-ai/dsh-client-ui-conversation` `lib/client.js:3083` `if (this.sessions.binding(sessionId) !== owner) throw new Error('inactive session')` ⇒ 弹窗静默打不开（点了没反应）；② **修法**：`retain(target, options)`（`client.js:3194`，`options = { source, signal? }`，`source` 为字符串键）⇒ `retainScope`（3409）→ `materializeScope`（3472）物化 scope，并在内部触发 `manager.get(id).open()` 拉历史尾页 ⇒ 之后 `binding(id)` 即有值；**返回引用必须在使用结束（弹窗关闭）时 `release()`**（`SessionViewTarget.dispose()`）；③ **`inactive` 与归档正交**：`unarchiveSession` 只动 `archivedSessionIds`（显示隐藏名单），无法让 binding 可用 ⇒ 「反归档后查看」方案作废，降级为兜底分支；④ **决策 34 的「`retain` 不存在」是错的**——那是未 retain 时的观察结论，`retain` 确实存在且可用 ⇒ 决策 29 的 ChatView 挂载路线须按源码重评（→ 里程碑 15）；⑤ 本次教训已升格为强制约定，见 AGENTS.md 第 4 条「先读宿主源码与文档，禁止靠运行时试探猜 API」 |
| 36 | **弹窗改走官方 keyed 节点流 + 照抄官方折叠关系（`mirror/ChatNodeSeat`），外壳尺寸照抄宿主弹窗惯例；mirror 文件名与官方组件一一对应**（2026-09-27，用户逐图验收驱动；当日修订：④ 内间距改定尺、去掉 920px 列宽） | ① **数据源换轨**：chat 快照同时带 `order + nodes`（keyed ChatNodeStore）与 `legacy.nodes`（兼容投影）——官方 ChatView 真正渲染的是 keyed 流（turn-trigger / turn-process / assistant-step / tool-call / turn-tail 都在这条流里），legacy 流**没有**触发行与过程行 ⇒ 折叠关系无从谈起；keyed 流缺失时仍回退 legacy 兜底渲染；② **折叠判定逐行照抄**官方 `ChatNodeSeat.tsx`（0.1.7-rc.2 `lib/client.js:1668-1771`）：`TURN_PROCESS_INDEPENDENT_KINDS`（1525）+ `turnProcessAlwaysOpen`（1558：live / 已停止 / 失败的 turn 恒开）+ `processWindowReady / processMember / processAnswer / ownsDisclosure / foldable / controllerInactive / compactAnswer / processHidden` 全套布尔，折叠 = flowItem 的 `hidden` 属性；「用时 34 秒 ⌄」行 = 官方 `TurnProcessNodeView`（6129-6196），label 文案与时长格式化逐字照抄（`message-chrome.ts`：`用时 {duration}` / `深度求索中，用时{duration}` / `已停止` / `处理失败` / `已完成工作`）；③ **已知偏差（写在 mirror 文件头，便于日后 diff）**：官方按节点订阅 `processSource`、弹窗按外层快照整体重算（只读历史等价）；官方 grouped('chat') 分组项原走 order 兜底 ⇒ **已由决策 37 补齐**；`foldCompletedTurns` 恒 true（照用户截图的官方折叠形态）；④ **外壳**：`width:min(1120px,100vw-32px)`、`height:calc(100% - 80px)`、radius 12px 照抄宿主「左下角弹窗」卡片惯例（dsh-context `.lc-ov-card`），不再用 `min(1180px,94vw)×92vh`；**内间距定尺（用户拍板：弹窗宽度固定，不按官方内容列宽算）**——`--dsh-composer-side-clearance: 8px` ⇒ 会话区左右各 24px（官方 scroll = 16px + clearance），`--dsh-chat-content-width: 100%` 内容列撑满不居中；⑤ **关闭钮** = 官方 `IconCloseOutlineRegular` 16px 裸图标（无边框无底色，hover 才出底），弃用自绘方框叉；⑥ **尾部操作行** = 官方 `TurnTailNodeView` + `MessageIconActions`（复制 Tooltip / 1s 复位 / `writeClipboard`；用量 pill = `TurnUsagePanel` + `statDialog` 弹层，定位直接复用 primitives 的 `useAnchoredPosition`/`useDismissOnOutsidePointer`；**分支 icon 不渲染**，见决策 37）；⑦ **触发行** = 官方 `TurnTriggerNodeView`（`turnTriggerDetails` 的 kind→图标/标题映射照抄，注入原文可展开）；⑧ **`react-dom` 在宿主模块表里**（PLATFORM_MODULES）可 require，但仓库没装 `@types/react-dom` ⇒ 用 `src/client/react-dom.d.ts` 声明最小面（`primitives.d.ts` 同款做法，零新增依赖） |
| 37 | **三级收折照抄官方（用时行 → 过程分组汇总行 → 条目各自展开）；归档会话不做续聊，将来以「开分支继续对话」按钮替代**（2026-09-27 用户拍板） | ① **官方分层（用户截图逐级核对）**：一级 = `TurnProcessNodeView`「用时 34 秒 ⌄」；二级 = `ChatGroupSeat` 过程分组行（activity 图标 ↔ 箭头 hover 互换 + `processTitle` 汇总文案「已读取文件，执行了命令，已调用工具等」）；三级 = 组内条目（工具卡 / 思考行）各自展开看详情。分组算法照抄官方 `process-groups.js`（`TurnGroups.rebuild`：INDEPENDENT kind 独立成条目、turn-process 独立、assistant-step 的 reasoning 入组 / reply 出组、组键 `["process", 首成员, groupPart]`；`processActivity` 按 tool-call（含 subCalls 递归、callId 去重）统计类别并按次数排序；`processTitle` 前 3 类拼接：2 类「A并B」去「已」前缀、≥3 类「，」连接、更多补「等」）；**自实现而非调官方 `views.grouped('chat')`**：公开契约 `ConversationBinding` 只暴露 snapshot/openTurn/activate/target，grouped 读取器在内部 assembler 上 ⇒ 决策 34 ④「不依赖宿主内部符号」，`mirror/process-groups.ts` 逐行移植（输入只用 order + nodes）；组体样式照抄 `ChatGroupSeat.module.css`（body `max-height:min(400px,50vh)` + 上下 24px 渐隐遮罩 + 组内 gap 8px；`expandedBody` 仅 live turn）。工具行标题接官方 `tool.title.*` 本地化字典（写入/读取/运行命令…，未收录走「工具调用 · name · 摘要」）；② **续聊/分支拍板**：归档会话 = 留档不可改 ⇒ 底部对话框占位整体移除（mirror/Composer.tsx 删除）；官方「分支」= 复制当前对话在新会话继续，正合「留档不改、要聊开分支」的需求 ⇒ 尾部操作行不渲染分支 icon；**后续新功能（已记 PROGRESS U10）**：弹窗加「继续对话（开分支）」按钮 → 确认框「是否需要基于此会话开一个新分支继续对话？」→ 确认后关弹窗、跳转新分支会话（依赖 `sessions.fork`，0.1.7-rc.2 已存在，落码前先读源码）；③ **数据真实性**：弹窗内所有展示数据（含用量 pill）一律取自官方 keyed 流真实字段，禁止模拟（已升格为 AGENTS.md 第 5 条） |
| 38 | **U10「继续对话（开分支）」= 弹窗头部按钮 → 确认框 → `sessions.fork({ increaseTitle: true })` → 先关弹窗再 `uiWorkspace.openSession(childId)` 跳转**（2026-09-27 拍板落码，交互防误点为用户明确要求） | ① **源码事实（0.1.7-rc.2，实现本体）**：`fork` 在公开契约 `ISessions`（contract/sessions.d.ts:124）→ 实现体 client.js:3343；`atSeq` 省略 = 「最新已完成 turn 前缀」（commands.d.ts:36-37，归档/完结会话即全量对话）；`increaseTitle: true` ⇒ 子会话标题递增 ` (1)`（client.js:3066-3072 `increasedForkTitle`，官方 fork 按钮同款 client.js:837-842）；失败抛 `SessionForkError`（name 可识别，client.js:3034）；**归档会话的 fork 子会话 = 独立会话**，不受归档只读闸门限制（archived-session-gate.d.ts:23-24）；② **跳转动词 = 官方导航服务 `uiWorkspace.openSession(id)`**（dsh-client-ui-workspace，cordis Service 名 `'uiWorkspace'`；client.js:819 → `replaceMain`：官方自己 `retain('mainView')` + `selection.set` + `selectPanel(null)`）——我方只调服务、**绝不自己 retain `'mainView'`**（宿主保留值，会锁死导航，决策 35 同源教训）；③ **顺序**：fork 成功 ⇒ 先 `onClose()`（dispose ⇒ release 源会话 scope）⇒ 再 `openSession(childId)`；fork 在途时用户关掉弹窗 ⇒ aliveRef 拦截，不跳转不 setState；fork 失败 ⇒ 确认框内显示 `code: message`，会话弹窗不关；④ **inject 边**：`dsh.client.inject` 补 `@deepseek-ai/dsh-client-ui-workspace`（uiWorkspace Service 随包注册）；fork 服务 / uiWorkspace 任一未就位 ⇒ 按钮不渲染（功能降级不报错）；⑤ **确认框 = 官方 primitives `Modal` + `Button`**（2026-09-27 真机反馈修订，原自绘版废弃——暗色主题下主按钮白底白字：自绘 `[data-primary]` 写死 `--dsw-alias-brand-primary` + `color:#fff` 不可靠；官方 `RiskConfirmation` 即 Modal+footer 双 Button 同源组合，primary 底 = `--dsw-alias-button-primary-fill`、字 = `--dsw-alias-label-primary-foreground`，明暗自适应；Escape/遮罩/头部叉关闭由官方接管）：用户明确要求「不能直接开分支，必须弹窗确认」（误点即多出会话还得删）+「能用现成的不要自己写」；⑥ **头部钮规格官方化**：关闭钮照官方 `Modal.close`（28×28 / radius-sm / 透明底 / hover `--dsw-alias-interactive-bg-hover` / icon 14），分支钮照官方 outline `.sm`（28 高 / 0.5px `--dsw-alias-border-l3` / 12px 字 / padding 0 10px）；弹窗 overlay z-index 1010→1000（与官方 Modal 同层，确认框 portal 后挂载居上），自绘 `.dsh-tdt-sv-confirm*` 九条规则删除；⑦ **消息行分支 icon 恢复**（2026-09-27 用户拍板，部分推翻决策 37 的「分支 icon 移除」）：每轮回复操作行的官方分支按钮 = 同一确认框 → `fork({ atSeq: 该轮 tail seq })`（从该条消息位置截断开分支，官方契约 commands.d.ts:36-37）；头部「继续对话」按钮 = 省略 atSeq（从最后一轮开分支）；两者确认后同链路（关弹窗 → openSession 跳转） |
| 39 | **U11 文件打开拍板：统一 `openFile(path)` 入口 + 分栏推压预览面（壳自画、渲染与数据全官方）；官方右栏路线源码证伪**（2026-09-27） | ① **官方能力四层核实（0.1.7-rc.2，实现本体）**：数据层 `dsh-api-workspace-files`——remote 命名空间 `workspaceFiles`：`read`（文本按行分页，页上限 5000 行 / 2MiB）、`readBytes`（二进制 ≤32MiB，multipart Uint8Array）、`stat`、`list`（目录 ≤2000 条，限工作区内）、`changes`（监听流）；文件读取**不限工作区**（跟随 ctx.fs 读权限，沙箱只限写）；**cold/归档会话可读且不激活 agent**；client 消费 = `inject:['resources','remote','remote.workspaceFiles']`（与我方 inject uiWorkspace 同构）。预览层 `dsh-client-ui-sidebar-files` + `dsh-client-ui-sidebar-documentpreview`（右栏文件树 + 预览 tab：Markdown / Shiki / 图片 / PDF / HTML / 纯文本；打开动词 = `openResource('dsh-resource://file/session/<id>/<path>')`）。产出物层 `dsh-tool-present` + `dsh-client-ui-deliverables`（present 工具 → `deliverables/presented` 事件；改动文件卡 = `workspace/changes` git 摘要；`ui:deliverable-file-references` 提示词段指导模型引用文件）。原生层 `session/openWorkspacePath`（**Host 桌面专属**，容器部署无桌面 ⇒ 系统默认应用方向排除）。② **官方右栏对本插件不可用（两条硬证据，源码）**：`dsh-client-ui-sidebar-right` seat **按会话挂载**（service.d.ts：「a command arriving with no seat mounted has no session to act on and **fails loudly**」；`mounted` 在 global panel 激活或无会话时为 undefined）——我方整页面板/弹窗激活时会话区被顶替，seat 不存在；预览组件本体**绑 sidebar 槽位运行时**（documentpreview index.d.ts：「Every import from another client plugin **is a type**」），搬不进我方容器；且右栏画在布局层、处于我方 z-1000 弹窗之下。**弹窗改整页同样救不了**（整页一样顶替会话区）——右栏路线对本插件整体排除。③ **拍板形态（用户逐轮收敛）**：点文件路径 → **分栏推压预览面**：会话弹窗内右侧分栏（对话左压，样式稿已验形态）、任务列表整页右侧滑出分栏（界面左压）；**两处同一个 `openFile(path)` 统一入口 + 同一份预览引擎**（用户硬要求：链接处零写死，改展示方式只改 openFile 一处；未来任务产出物清单同走此入口）。④ **渲染与数据全官方零自研**：md = 官方 `MarkdownText`（弹窗在用）、代码高亮 = 官方 Shiki 积木（diff 面同款）、图片 = `readBytes`→blob、PDF = 浏览器原生 iframe、文本 = `read` 分页；不可内嵌类型 = 官方同款空态 + 复制路径；数据一律 `remote.workspaceFiles` 真实取数（AGENTS.md 第 5 条；讨论用样式稿为演示假数据，落码即换真）。⑤ **场景 2（任务产出物展示）暂缓**；届时产出真源 = 官方 `deliverables/presented` 事件 + `workspace/changes` 摘要（非回执 outputs，决策 19 不动），另拍。⑥ 落码前核实两点：package.json `dsh.client.inject` 补 `@deepseek-ai/dsh-api-workspace-files` 后 client 侧 inject 可用性；弹窗 markdown 内文件引用的可点化路径（mirror 渲染链）。⑦ **落码记录（2026-09-27 同日完成）**：inject = package.json + client 侧 `ctx.inject(['remote'])` 取 `remote.workspaceFiles`（探不到 = 功能整体降级不报错）；预览引擎 `src/client/file-preview.tsx` 按扩展名分派——md = 官方 `MarkdownText`、其余文本 = 官方 primitives `CodeBlock`（Shiki 积木，lang = 扩展名）+ `read` 分页（「加载更多」nextOffset = 页 offset + lines）、图片/PDF = `readBytes`→Blob→objectURL（卸载 revoke；PDF = iframe）；错误态照官方 bareCode 分支：not-found / gateway/lookup-not-found → 不存在、too-large → 上限{limit}、not-text → 二进制空态、not-regular-file（directory → 目录否则 symlink）、其余 → 读取失败{code}，空态带官方 `writeClipboard` 复制路径；**fileMentions 词表自建会话级**（官方 chatFileMentions provider 不可用：collectFilePaths 遍历 keyed 工具流 argsRaw file_path/path + meta.diffs[].path，makeFileMentions 归一化精确匹配优先、唯一 basename 兜底，resolve 不出保持惰性 code 永不猜）——偏差 = 会话级 vs 官方 per-turn，③ 已认可；分栏 = `dsh-tdt-sv-split`（对话 flex:1 左压 + 预览面 width:min(520px,48%)），预览以 `${sessionId}:${preview}` 为 key 换文件重挂载；冒烟 +10 = 124 项全过，typecheck + build 过（dist 190.21 kB） |
| 40 | **交付登记（产出物为什么看得见）走「B 插件代写官方交付事件」+「C 提示词要求模型调 present」双路，不做「插件 UI 自己画卡」**（2026-09-28 用户拍板定方案，**待实施**；场景 = U12） | ① **为什么不能由插件直接调 `present`（源码证伪，0.1.7-rc.2 实现本体）**：present 是 **agent 侧工具**（preset 挂载），只能模型发起；要求「有工作区 + 轮次未结束」（`dsh-tool-present/lib/index.js` execute：`turnBoundary.openTurnStartSeq === null` 即抛）；交付事件由**它自己**在 `ctx.on('tools/result', …)` 里写 `session.append('deliverables/presented', { turn, callId, files })`，中间过一张只有本实例能填的 `pending` WeakMap ⇒ README 明确「**同名作用域工具不能通过其他实例发布交付**」。② **B 路线可行（三条源码事实）**：`append<T>(type, data)` 是 `@deepseek-ai/dsh-session` 的**公开契约方法**（`lib/types/index.d.ts:246`）；`'deliverables/presented'` 是 present 包 declare-merged 进 `SessionEventMap` 的**正式事件类型**（`turn: number; callId: ToolCallId; files: PresentedFile[]`），且**不在** `SurfaceEventType` 集合（types.d.ts:442）⇒ append 无需第三参 opts；回执工具执行时能拿到 `exec.agent.session`（`dsh-agent/lib/types/runtime-types.d.ts:143` Agent.session: Session）与 `exec.callId`（`dsh-tools/lib/types/index.d.ts:217/229`）——present 取 session 就是这条路。⇒ **在回执回调里 append 一条与 present 同格式的事件，由官方 UI 自己画卡**（宿主会话视图 + 我方弹窗都显示）。③ **turn 取值**：present 用 `ctx.sessionProjections.stateOf(session,'turnBoundary').lastTurn`；投影定义 = `{ openTurnStartSeq, lastStepStartSeq, lastStepBoundary, lastTurn }`（`dsh-agent-loop/lib/types/index.d.ts:23`），该服务在 agent 作用域 inject（present 包 inject = `['tools','fs','sessionProjections']`）⇒ 实施时从注册回执工具的 agentCtx 闭包注入，取不到即降级不写事件。④ **文件清单用回执里已校验过的 outputs**（`checkReceipt` 已验存在 + mtime 新鲜），不是模型原样填值 ⇒ 不会交付不存在的文件。⑤ **三条明确代价（用户已接受）**：(a) `callId` 只能是回执调用 id（非 present 调用 id）——只影响卡片「用系统应用打开」按钮，容器无桌面本就不可用；预览走 path 不受影响；(b) 拿不到 session / append 失败 ⇒ **静默跳过只记日志**，回执与任务成败完全不受影响（这正是稳于 C 之处：模型调失败 = 没交付，我们写失败 = 只少一张卡）；(c) 时序红利 —— 回执发生在轮次内，事件 seq 早于本轮收尾消息，满足官方显示条件 `presentedForClosing`（`file.seq < owner.seq`）⇒ 卡位置与模型自调一致。⑥ **C 留兜底**：派发提示词要求模型调 present（与 B 不冲突——官方 `presentedForClosing` 按 path 建 Map、后写覆盖 ⇒ 不会出双卡）。⑦ **不做的方案**：「插件 UI 按 outputs 自己画卡」已否决——官方已有完整卡片/预览/打开链路，重复自绘是多余劳动（用户明示） |
| 41 | **两层循环彻底解耦 + 派发快照：调度循环只管「写执行记录」，执行循环只读执行记录**（2026-09-28 用户拍板，待落码） | ① **动因（真机 bug）**：用户中途把任务 `enabled` 改 false（本意只停分发）⇒ `loadTasks` 把该任务过滤出 `taskMap`（tasks.ts:351/393）⇒ 对账 `taskOf()` 返回 undefined ⇒ `settleByReceipt` 提前 return（reconcile.ts:195-198）⇒ **已交回执的实例永久卡 running**（agent 实际已完成、文件已产出）；U12 交付卡也因此没生成（事件只在回执成功路径写）。用户点破本质：「只要分发了，重试、追结果、回执就应该和任务设置解耦——否则执行中改了设置、重试第 2 次该以哪个为准？」② **Loop A 职责收窄**：判定该不该跑（enabled / 刻度 / 依赖 / 工作区前置，不过不建行）+ 把要执行的任务写进执行记录（落库即止）；**不立即发动会话**（launch 移交 Loop B）。③ **Loop B 只读执行记录**：发动执行、失败重试、追问、契约回收全程只凭实例行 + 快照，不读任务表，不感知 `enabled`。④ **派发快照**：落库时固化 prompt / manual / workspace path / 实测模型 route / `validStatuses` / `retry.maxAttempts` / window / title 进实例行；插件级运行时参数（租约 / 宽限 / 追问上限）来自插件配置非任务设置，保持 live。中途改设置对已落库实例零影响，「这次跑的是哪一版」由快照回答 ⇒ **U5 的 `def_snapshot` 方向就此拍板**（精简为执行所需字段）。⑤ **预条件归属调整**：模型路由解析从 Loop A 前置（失败删行）移为 Loop B 发动前置（失败走重试判定、**行保留**、原因落事件）——行存在即执行记录，失败必须可追溯；依赖 / 工作区仍属 Loop A（不过不建行，决策 31 不变）。⑥ 决策 22「现算、绝不回写」不变：route 每次落库现算只进快照，下轮执行自然跟上新配置 |
| 42 | **派发会话命名格式 = `[TASK] <260928-1600> · <标题>（· 第N次）`**（2026-09-28 用户拍板；取代现行 `[TASK] <task_id UUID> · <logical_date>`） | ① **时间在前、短格式 `YYMMDD-HHmm`**（用户拍板「短一点」；取计划时刻 `scheduled_at` 按本地时区显示，与执行记录「计划时刻」列一致；重试不变）——会话列表按时间天然对齐易扫读；② **标题 = 任务 `title`**，缺失回退 `code`，再回退短 id（前 8 位）——用户写的标题一眼识别任务，UUID 对人无意义；③ **attempt>0（第 2 次起）追加「 · 第N次」**——一眼看出是重试，且同刻度重试的会话不重名；④ 改名只凭派发快照的 title / scheduled_at / attempt（决策 41），`onCreated` 不再读活任务表 |
| 43 | **依赖快照：Loop A 判定通过瞬间把命中的上游实例（ID + 产出）冻结进派发快照，Loop B 只消费冻结值**（2026-09-28 用户点破并拍板，排查见 [worklog/dependency-snapshot.md](../worklog/dependency-snapshot.md)、定型见 [dependency-snapshot.md](dependency-snapshot.md)） | ① **问题一（判定结果未冻结）**：`judgeDependencies` 命中时手里已有上游实例对象（`getSamePeriod`/`getLatestInstance` 返回完整 `TaskInstance`），但只读 `.status`/`.scheduled_at` 即丢弃，快照也无依赖字段 ⇒ Loop B 数分钟后发动时，下游对「按哪条上游实例放的行」一无所知，上游间隙再跑成功一轮就会错拿新产出；② **问题二（产出无下传通道）**：`depends_on` 只有 `{task,semantics}`，上游已校验的 `outputs` 列（决策 32 修订）无人读、`buildMessage` 不注入 ⇒ 下游无确定通道消费前置产出；③ **拍板**：`InstanceSnapshot` 加 `resolvedDeps: ResolvedDependency[]`（task/semantics/instanceId/scheduledAt/sessionId/上游 workspacePath/outputs），Loop A 落库时固化、Loop B 只读不重判，重试沿用同一冻结值；`buildMessage` 注入「上游依赖（本次已锁定）」段，产出按**上游**工作区绝对化；④ 不改 DDL（快照 JSON 列承载）、不改 `depends_on` schema、不做产出内容校验（沿决策 33 只告警立场）；旧行无字段 ⇒ 解析为 undefined、消息不含该段（行为不变） |

| 44 | **任务表单（新建 / 编辑任务）= 右侧贴边**浮层**弹窗 + 官方表单件优先 + 排期「周期 / 间隔」两档**（2026-09-28 口述、2026-09-29 返工定稿） | ① **形态**：右侧贴边、上下顶满、左缘可拖拽、**盖在整页之上（不推压页面）**——与 U11 预览 dock「占布局分栏、把整页推窄」是两回事；遮罩 + Esc + 裸叉关闭，底部「取消 / 保存」固定不动；官方 `Modal` 是居中的，贴边外壳自绘（按钮仍用官方）。② **入口**：整页右上角「＋ 新建任务」。③ **提示词区**（主视觉）：大输入框 + **左下角选工作区 / 右下角选模型**（像聊天输入框，不是「一框=工作区、一框=模型」的程序型排布）；右上角三档来源 = **手输 / 选择 / 上传**（占原「版本历史」位）。④ **来源语义**：`选择` = 工作区里的任务手册，**只记路径**，执行那一刻 agent 自己读、随时改随时生效、**我们不做它的版本管理**；`手输` / `上传` = 内容在我们手里，做版本管理（文件版、**不进数据库**，方案归 P3）。⑤ **排期**：「周期 / 间隔」两档——周期含 单次 / 每天 / 每周 / 双周 / 每月 / 每年（周几多选、月 / 日选择、时区、有效期）；间隔 = 每隔 N 分钟 / 小时执行一次 + 周几筛选。⑥ **控件归属**：能直接用官方组件的一律用官方（下拉 = 官方 `Menu`、开关 = 官方 `Switch`、分段 = 官方 `SegmentedControl`、chip = 官方 `Pill`、文本 = 官方 `Input` 度量），**官方没有日期 / 时间选择器** ⇒ 自绘但逐条照官方 token 与几何；原生 `<select>` / `<input type="datetime-local">` 一律不用。⑦ **开关选中色**：官方 `Switch` 用 `--dsw-alias-brand-primary`（暗色下近白），用户要求「打开显示绿色」⇒ 局部改用官方状态色 success，只影响本弹窗。⑧ **分期**：P0 界面与前端交互 → P1 工作区 / 模型数据面 → P2 保存写回 + 排期映射 cron → P3 版本管理。**本轮未决**：双周在 cron 无对应位、间隔的「天 / 周」单位映射，都留 P2；JSON 逃生口（含任务 id）保留在高级区、只读预览 + 挂牌提示。落码与踩坑见 [worklog/task-editor-ui.md](../worklog/task-editor-ui.md) |
| 45 | **编辑弹窗脏判定 + 关闭确认**（2026-09-29 用户提出） | ① **判定口径 = 与「打开那一刻的原始快照」按键序稳定序列化后全等比较**——「1 改成 2 再改回 1」不算改过，只有与初始值不同才算脏；弹窗关闭即卸载、重开即重挂 ⇒ 快照天然随打开重置。② **四个关闭路径（✕ / 遮罩空白 / Esc / 底部取消）统一走 `requestClose`**：脏 ⇒ 先确认，不脏 ⇒ 直接关；「保存」不受影响。③ **确认框 = 官方 `Modal`**（标题 + 说明 + footer 双按钮「继续编辑 / 放弃更改」），不用 `RiskConfirmation`（它强制勾选确认，过重）；官方 Modal 是 body 传送门且 `.root` 固定 z 1000，会被抽屉遮罩（z 1040）压住 ⇒ 通过 `className` 只给本实例抬到 z 1060（`task-editor-css.ts` `.dsh-tdt-ed-confirm`，本样式表后注入、同特异性下覆盖）。④ 确认框开着时 Esc 归 Modal（关确认框），抽屉的 window Esc 监听让路，否则确认框永远关不掉 |
| 46 | **附加文件：选择工作区文件 = 只记路径（link）；上传本地文件 = 宿主落盘不覆盖累加（upload）**（2026-09-29 用户拍板：选择+上传一起做、放开常见类型、20MB 上限） | ① **不引包**：官方 primitives 无 Upload/Dropzone/FilePicker（清单核实），拖拽区+隐藏 input 自研约 30–50 行，贴合官方 token、不添依赖；② **link**：官方 Modal 内嵌工作区文件选择器（逻辑抽自 file-browser，只 list 不预览），选中挂 Attachment{kind:'link'}，只记路径、agent 执行时自读；③ **upload**：POST /api/task-dispatch-table/attachment，原始名走 x-filename 头（URL 编码），扩展名白名单 + 20MB 上限，落盘插件数据根 task-attachments/<原始名>-<随机尾缀>（不覆盖累加），返回 ref 挂 Attachment{kind:'upload'}；④ 附件目录在 settings inject 就绪时随 statePath 定格、webServer 路由惰性读取（scope 时序差，见 worklog）；⑤ 附件与任务的持久化关联、执行期注入未做，待拍板（或并入 P2 保存链路）；⑥ **附件落点规则（2026-09-29 拍板，同日放开）**：~~link 型附件必须位于任务所选工作区之内，越界拒存~~ → **用户同日放开**：选择器可浏览**任意有历史会话的工作区**（每工作区各用自己最近的会话当锚点，`/options` 逐工作区下发 `anchorSessionId`），不必先选任务工作区；`Attachment` 增 `workspace` 字段记**来源工作区 title**（同一路径在不同工作区指向不同文件），agent 沙箱本就**读任意路径** ⇒ 跨工作区读无权限问题；P2 派发注入时按 `workspace` 把 ref **按来源工作区绝对化**；upload 型落插件数据根 `task-attachments/`，不受限 |
| 47 | **前置任务 UI 交互定稿：灰框卡 + 工作区→任务两级选择 + 语义写死 latest_success**（2026-09-29 用户口述拍板，落码见 [worklog/task-editor-ui.md](../worklog/task-editor-ui.md) §十九） | ① **灰框卡**（同附加文件卡 `.dsh-tdt-ed-card`），标题「添加前置任务」+「?」Tooltip 三件事：含义（此任务必须等前置任务完成后再开始执行）/ 判定方式（所有前置任务**上一次执行必须成功**——中间被跳过、只要没失败都算成功）/ 执行机制（放行时系统自动把前置产出的相关文件移交给本次任务，即决策 43 的产出下传）。② **两级选择**：先工作区后任务（任务多时按工作区收窄）；工作区列表由任务表真数据推导、只列有可选任务的工作区；任务按工作区过滤，未选工作区禁用。③ **添加/移除**：点「添加」固定成行「前置任务：标题（编号）+ 工作区小字」，行内「移除」删除；**同一任务不能加两次**（选项排除已加 + 按钮拦截）；**支持跨工作区**；加完工作区保留任务清空，便于连加。④ **语义下拉删除**（用户：「同一天的」没有意义）：新增依赖固定写 `latest_success`（= 判定方式的直接表达），**存量依赖 semantics 原样保留**（无损往返）；调度器侧判定语义不变（决策 33） |

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

## 决策 48：高级区重做 + /goal 多轮续跑接线（2026-09-29）

**背景**：用户逐项拍板「高级选项」的形态与内容。

**UI 定稿**：
- 默认收起；展开 = 与前四卡同款灰框（`.dsh-tdt-ed-card`，不再用黑色 JSON 区）；每项「控件一行 + 说明一段」，排版宽松。
- **重试次数**：四档选择（一次/两次/三次/五次），不再手输——「次数多了没意义」。
- **成功状态清单砍掉**：无用户意义；`contract.validStatuses` 字段保留 round-trip（JSON 预览照带，存量无损）。
- **配置预览**（原「JSON」按钮）：点击从右侧展开与「编辑提示词」一样大的只读面板，官方 `CodeBlock`（Shiki：行号 + 语法着色 + 自带复制）；按钮只有「关闭」（复制在 CodeBlock 工具条），不允许修改。

**/goal 多轮续跑（有真实通道，已接线）**：
- 通道核实（npm pack `@deepseek-ai/dsh-goal@0.2.0-rc.2`）：Goal service 挂 **`ctx.goals`**，`CreateGoalRequest { objective: string; maxGoalRounds?: number }`；session 事件层有 *goal continuation round*（自动续跑多轮），`GoalPhase = active|paused|blocked|complete`（agent 标记 complete 收束、看板届时结算）。
- 行为：**默认开启**（用户拍板「默认都是多轮会话」）——任务定义 `target.goal` 缺省 true（`tasks.ts` zod），快照 `InstanceSnapshot.goal`（`reconcile.ts` `task.target.goal !== false`），派发侧（`dispatch.ts`）`snapshot.goal !== false` 时 `ctx.goals.create(handle.agent, { objective: 标题：prompt })`，宿主 face `HostGoals`（`host.ts`，可选）。
- 降级：宿主 ctx 未暴露 `goals` 或创建失败**不阻塞派发**（本轮照常单轮执行），落 `goal-unavailable` / `goal-create-failed` 警告留痕——不做假成功。
- 存量任务定义无 `goal` 字段 ⇒ 下次派发起同样按「多轮」执行（缺省开，与用户口径一致）。

**Agent Team（决策 48 当时的结论已推翻，见决策 49）**：当时只 grep 了 `dsh-agent / dsh-agent-loop / dsh-session / dsh-tools / dsh@0.2.0-rc.2`——这些包里确实只有事件类型；真实实现在 **`@deepseek-ai/dsh-experimental-agent-team` 全家桶**（当时没搜到，2026-09-29 决策 49 补查），见下条。

## 决策 49：高级区第二轮 + 多 Agent 协作接线（2026-09-29）

**背景**：用户看过真机后对高级区再提一轮返工，并点名「0.2.0 之后 DSH 有多 Agent 任务，开会话接口应该有这个参数」。

**多 Agent 源码核实（推翻决策 48 的「无通道」）**：
- `sessions.create`（`dsh-api-session-controller@0.2.0-rc.2` `types.d.ts:279`）**没有 team 参数**——`SessionCreateRequest = { workspaceId?, cwd?, sessionId?, agentPreset? }`。
- 真实实现 = **experimental 全家桶**（npm search `dsh-team` 才现身，scope 搜索搜不到）：`dsh-experimental-agent-team`（`ctx.agentTeams` TeamService：roster/mailbox/task-board，README「把一个会话变成小团队」）、`dsh-experimental-tool-agent-team`（模型工具 `spawn_teammate`/`send_message`/`list_agents`/`wait_agent`/`interrupt_agent`/`team_task_*`，`lib/index.js:242-445`）、`-agent-team-profile`（cordis.patch.yml：禁用四个旧 subagent 工具、插入 agent-team + tool-agent-team + ui-agent-team，`maxMembers: 8` 等）、`-client-ui-agent-team`（花名册/任务板 UI）。
- **启用方式 = 宿主 composition/profile 层**，不是会话参数：profile 启用后 `tool-agent-team` 的 `apply` 对**每个根会话 agent**（`tryMembership`：无 parentSession、无 subagent descriptor ⇒ 隐式 Team Lead，`roster.js:64-95`）自动安装全部团队工具 ⇒ **我们派发的会话天生就是队长**。
- 插件侧做法（与决策 48 /goal 同款语义）：任务定义 `target.agentTeam` 缺省 false → 快照 `InstanceSnapshot.agentTeam` 固化 → 派发时探测 `ctx.agentTeams`：**缺 ⇒ 降级单 Agent**（`agent-team-unavailable` 告警，不阻塞）；**有 ⇒ 派发消息注入团队执行段**（如实列出官方工具名，引导按 spawn/task-board/send 分工；收束仍由主会话交回执）——绝不注入装不出来的假指令。

**顺手修决策 48 落码缺陷**：`snapshotOf`（scheduler.ts）与 `parseInstanceSnapshot`（store.ts）此前**丢 `goal` 字段**——`goal: false` 的任务快照里没有该键 ⇒ 派发侧 `snapshot.goal !== false` 恒真，开关形同虚设。本轮补上解析与固化，并加 round-trip 冒烟回归。

**高级区 UI 第二轮（用户逐条拍板）**：
- 撤掉内层带边框的收折钮（黑框）——收起态就是**一条灰卡**：整行可点，「高级设置」+「?」说明气泡（「此区域为高级配置区域，修改前请仔细阅读各项说明。常规任务建议使用默认值。」）+ 官方 `IconChevronDownOutlineRegular` 12px（展开 rotate 180°，照 `TurnTriggerNodeView` 官方展开图标；官方没有别的展开图标约定）。
- 展开体 = 每项**控件一行 + 说明一行**两拍，项与项之间**虚线分隔**（用户：别全挤成文字）。
- **重置次数**：弃下拉，改官方 `Segmented` 长条四档（一次/两次/三次/五次），标题与控件同一排（同星期块观感）。
- **配置预览**：不设标题行，按钮直接叫「配置预览」，其余（只读面板、行号着色、仅关闭/复制）不变。
- **多 Agent 协作**开关（默认关，见上）加入高级区，说明写明「需宿主启用 Agent Teams，未启用自动降级单 Agent」。
- **滚动位置 bug**：全屏提示词编辑 / 配置预览共用拉栏容器二选一渲染，面板打开 = 表单整体换挂载 ⇒ 关闭重挂后 scrollTop 归零。修法 = 打开前存 `.dsh-tdt-ed-body` 的 scrollTop（`savedScrollRef`），回到表单后 effect 恢复。

## 决策 50：Agent 权限档位选择器 + 文案收口（2026-09-29）

**背景**：用户看过真机后要求——提示词框底部「工作区」右侧加一个**权限下拉**（照宿主新建会话的权限三档）；同时收口三处文案措辞。

**权限档位（四档）**：`default` 会话默认（**初始值**） / `readOnly` 仅可查看 / `workspace` 工作区内修改 / `full` 完全权限。

**宿主通道核实（源码级，先查后做）**：`AgentOptions`（`@deepseek-ai/dsh-agent@0.2.0-rc.2` `lib/types/runtime-types.d.ts:21-30`）**只有 `provider` / `model` / `reasoningEffort` / `maxTokens` 四个字段，没有任何权限参数**；`agents.create` 的其余字段（meta / setup / seed）也无权限位；官方 preset UI 包文案印证「实际可执行的操作仍由权限设置决定」——权限是**宿主新建会话 UI 的会话级设置**，不是插件可下发的参数。

**因此（不造假开关）**：
- 字段真实落库（`target.permission` → 快照 `InstanceSnapshot.permission` → 派发事件 `permission`），UI 如实可选。
- 执行语义 = **派发消息中的约束指令**（`permissionInstruction`）：默认档不发任何指令；仅可查看档禁止写入/修改/删除与有副作用的命令；工作区内修改档限定改动范围为目标工作区（真实绝对路径注入，文案不写死路径）；完全权限档不加限制。**这是我们能真执行的语义**，不做「系统级拦截」的假承诺；宿主一旦开放 per-task 权限参数，改为随派发下发（`dispatch.ts` 已留注释与单点实现）。
- UI 说明（`editorPermissionHint`）如实写明「宿主暂未提供按任务下发权限的接口，所选档位以派发消息中的约束指令执行」。

**文案收口（用户逐条）**：
- 「重置次数」是笔误，回正为「**重试次数**」；说明改书面短句「任务执行失败后，自动重试的次数。」（删掉「这一轮才算失败」「次数多了没意义」这类会产生歧义/说教的表述）。
- 配置预览说明简化为「查看本任务的配置原文件。」（不再描述面板形态）。
- 模型下拉默认文案「跟随宿主默认」→「**默认模型**」。

**UI 暂时封档（用户 2026-09-29 拍板）**：任务表单弹窗这一轮（决策 44–50）到此封卷，转入「新增任务 / 编辑任务」的功能设计（见 [`design/creation-edit-design.md`](creation-edit-design.md)），下一轮新会话按该提纲推进。
## 决策 51：新增 / 编辑任务功能面落码（2026-09-30）

**背景**：需求口径（`creation-edit-requirements.md`）与数据设计（`data-model.md` §五 §六）拍板后，用户授权整条「新增 / 修改」功能线由 agent 主导落码，次日起真机验证。

**存储结论**：任务定义**不拆表**（整份 `tasksInline` + meta 主通道）；**不建**附件表 / 版本表 / 快照表（清单在定义 JSON、内容在文件系统，建表只会多一份会对不上的副本）。文件资产走 `tasks/<uuid>/{prompt-versions,snapshots,attachments}` + `task-attachments-tmp/`（临时区）。

**排期双写（§5.4）**：JSON 并存 `schedule.ui`（表单结构化留档）与 `cron`/`once`；**执行只读 cron、表单反解只读 ui、保存以表单为准重写 cron**。编辑态反解优先级 = `schedule.ui` > cron 尽力反解 > **自定义 cron 降级**（`draft.customCron` 保留原串，保存时原样写回、不生成 ui——否则二次保存会把手写 cron 悄悄覆盖掉）。

**保存链路（单任务通道，POST /tasks {task}）**：zod 全量校验（坏定义不能 200 假成功）→ 保存校验清单（提示词 / 工作区 / cron 与 once 恰有其一且可解析 / 前置任务必须存在（停用可以）/ 时区可识别 / 前置不能是自己）→ 身份（带 UUID 命中现有表 = 修改；否则**一律服务端生成新 id**，客户端 id 不采纳 ⇒ 闸门「UUID 不能凭空引入」不被表单通道旁路）→ **附件只搬不删** → 落库 → **落库成功后才真删**被移除的附件文件（时序反了会两头空）→ 版本 / 快照留档（变了才留；失败只告警不回滚定义）→ `task_audit` 审计。

**间隔档必须产出 cron（P0 缺陷修复）**：`draftToDefinitionJson` 此前间隔档只写 `schedule.start` 不写 cron ⇒ 任务保存后永不执行。已修：`*/N * * * *` / `0 */N * * <dow>`。**每季度 off-by-one**：「每季度第 N 月」= N, N+3, N+6, N+9（起月要跑），旧写法漏起月。

**两循环补齐（非重写，决策 41/42/43 架构不动）**：Loop A 附件存在性校验（缺失 ⇒ **不建行不执行**，只记 `attachment-missing` error；不判 failed 不吃重试额度）+ 依赖阻塞三分类 `dep_blocked` / `dep_disabled`（上游停用）/ `dep_missing`（上游已删除——依赖判定改吃**含停用的全量任务表**，否则停用上游被误报成"已删除"）+ 日志改「**结论变化才记**」（取代 5 分钟一条）。Loop B 发动前凭快照再校验一次（缺 ⇒ 不发动；**超窗删行**，否则 dispatched 行永久占住串行互斥）。派发快照补 `attachments`（Loop B 只读快照即可校验，不必回头读任务定义）。link 型附件按**来源工作区**（`item.workspace`）校验，不拿任务目标工作区误判。

**执行记录保留**：`historyRetentionDays` **默认 0 = 不清**（容量复核：100 实例/天两年 ≈ 0.5GB，SQLite 上限 281TB；历史可查是刚需）；设了天数才清，且**保护每任务最近一条终态记录**（否则 `latest_success` 依赖判定静默阻塞）。临时区默认 7 天。

**版本找回**：两档（只恢复提示词 / **整份找回** = 提示词 + 排期 + 工作区 + 模型 + 权限 + 重试 + 前置 + 附件清单），均带严厉确认（「确定找回会用历史版本覆盖现有修改的所有数据」）；附件已不在 ⇒ 照常保存 + 明示「需重新上传」。删除任务：保存旁红色按钮 + 严厉确认（「确定所有的移除都是找不回来的，不可逆的」）+ 整目录删；实例 / 事件保留做审计。

**安全（评审修正）**：附件 ref 白名单（禁 `..` / 绝对路径 / 反斜杠）进 schema、搬移定位与**真删循环**三处对称设防——否则存在「提交穿越 ref 再保存一次 ⇒ rmSync 删数据根外任意文件」的完整利用链。文件名清洗保留中文 / 空格 / 点，只清控制字符与 `\ / : * ? " < > |`。

**审计**：新表 `task_audit`（ts / task_id / action / detail），**默认不清**；action = task_created / task_updated / task_deleted / tasks_replaced / version_created / version_deleted / attachment_removed / attachment_missing。版本 / 快照管理入口本轮不做 UI（已封档），先只落盘 + `tasks/history` 路由已备。

## 决策 52：编辑器 UX 第二轮——错误提示人话化 / 统一浮层 / 「预计执行」说明 / 版本历史拆分（2026-09-30）

**背景**：真机试用集中反馈四点——保存失败提示是机器码（`target.workspace: Too small…`）看不懂；错误提示散落多处、红字挤占版面；排期设置完不知道「实际什么时候执行」；提示词版本历史与配置快照混在一个面板里。

**错误提示（逐项判定 + 框描红 + 一次性列全）**：
- 客户端先行校验 `validateTaskDraft`：必填对齐宿主 zod（`target.workspace` / `target.prompt` 均 `.min(1)`）+ 排期冲突（每周没勾星期 / 间隔步长非法 = 产不出 cron ⇒ 任务永不执行）；`title` schema 可选（空回退 id）不强制。
- **点保存才判定**；判定后问题**逐项列出**（持久错误总览，不自动消失——用户原话：2.5 秒记不住、没法对照着改）+ **问题框描红**（卡片 / `SelectField` / 提示词 textarea 三种 `--error` 变体，颜色走 `--dsw-alias-state-error-primary` 明暗自适应），随修正实时消退，全部处理完才真正提交。
- 服务端机器码兜底 `humanizeTaskError`：`Too small` 片段翻人话（「工作区不能为空，请先选择工作区」等）；面板保存失败、编辑器保存 / 删除失败三路都先翻译再显示。
- 呈现统一为**自研浮层 Toast**（`src/client/toast-css.ts` 运行时注入 `.dsh-tdt-toast`）：保存失败（面板 + 编辑器 footer 正上方）、附件上传失败（附件卡正上方）共用同一动画时间线 2.8s（稳定 ≈2.5s 后上飘淡出，`onAnimationEnd` 自退）；「JSON 不合法」是持续态 ⇒ `--sticky` 常驻变体（不占版面、改对才撤）。

**「预计执行」实时说明**：通用方法 `describeSchedule(draft, t)`——排期结构 → 一句人话（如「预计每周一到周日每天 9 点执行」「每 5 分钟执行一次」），设计为可复用（后续任务列表可直接调用）；渲染在执行频率卡「任务开始时间」上方两条分隔线之间，随编辑实时刷新；文案全走 locale（zh / en）。

**版本历史拆分**：提示词编辑器右侧面板**只管提示词版本**（条目 = 时钟图标 + 时间 + 备注，hover 时右侧浮出「使用版本 / 删除」、行高不变）；**配置快照移到主编辑器**（前置任务卡下方独立区块 + 说明，找回沿用严厉确认）。「历史版本」开关按钮弃 outline Button，改自绘 toggle（官方时钟图标 + 「版本」两字；选中 = business 高亮、未选中灰盒，明暗一致，与「预览/编辑」分段同拍）。

**顺手修**：附件卡容器此前丢 `.dsh-tdt-ed-section` 导致与「执行频率」卡 16px 间距消失（回归）——已修。冒烟 237 项全过；**真机验证待做**。

**修订（同日真机试用后，用户逐条）**：
- **配置快照 UI 整体撤除**（用户：「任何界面的改动不准给我添加」）——主编辑器的快照区块、`onRestoreSnapshot` 通道、`restoreSnapshot` 客户端函数全删；服务端保存链路里的快照留档**保留**（无界面纯落盘，将来单独做按钮时直接用）。
- 「预计执行」两条分隔线改**虚线**；「任务开始时间」上间距对齐上边线离「星期」的间距 = 14px（原 CSS margin12+padding12=24 是两倍）。
- 间隔档（小时）句式参照周期档：**生效日在前、不加括号**——「周一、周三、周五每小时执行一次」。
- **任务名称必填**（用户明确要求，虽 schema 可选）：空 ⇒ 校验不过 + 框描红。
- 「版本」开关与「编辑/预览」分段**一模一样**（轨道 interactive-bg-hover + padding4 + 选中白亮片 bg-layer-1 + elevation-soft），弃 business 蓝底（用户主题下显绿）。
- 版本条目：弃时钟图标改**小尖括号**、弃分隔线改**卡片行**（对齐附加文件列表）、主文本超长 hover 跑马灯（MarqueeText，只在自己盒子里跑不盖图标）、hover 右侧 = 「使用」小药丸 + 「移除」小字（11px，行高恒定）。
- **启用开关独立操作**：编辑态点击即 `POST /tasks/enabled` 实时写回（只改 enabled 字段 + 审计，不走保存链路；值没变不落库），成功 Toast「任务已启用/已关闭」、失败开关回弹并报错；开关旁联动文字「已启用/已关闭」；写回成功同步脏判定基线（关弹窗不误问「放弃更改」）；新建态只改草稿统一保存。

**修订二（同日第三轮真机反馈）**：
- 每周档叠词修掉：N>1 ⇒「每 4 周周一、周二 09:00 执行」；恰好每周 ⇒「每周一、每周二 …」。
- **间隔分钟档 cron 改带星期位** `*/N * * * <dow>`（原 `*/N * * * *` 无视生效日），文案同步。
- **Toast 抽象共用 `FloatingToast`**（toast-css.ts：text/tone/seq/below/onDone），四处手写全替换；**三档语义色** success 绿（`state-success-primary`）/ error 红 / neutral 反色面（`label-primary` 底 + `label-primary-inverted` 字，深浅自适应）。
- 「版本」开关尺寸与「编辑/预览」分段逐值对齐（padding3/段高22/字12）。
- 版本条目：全宽虚线分隔（拉通整栏）、右侧固定槽（104×18，时间/按钮同槽换显 ⇒ hover 不撑高）、双日期修掉（主文本=备注，无备注只显一处时间）、主文本 11px、面板 280→232px。
- **派发 launch-error 根因**：宿主 ctx 命名空间属性是 getter、模块未 inject 时读取直接 throw ⇒ `readCtxProp` 护栏读（throw 归一 undefined），agentTeams / goals 探测按既有语义降级，不再炸派发。

**修订三（同日第四轮，Toast 定稿）**：
- **错误总览持久块撤销** ⇒ 提示与判断逻辑解耦：字段描红是持续态，文字提示是一次性 Toast（点保存弹一次、全部问题「；」连一句、统一 2.8s 自退）。
- footer 行内提示（重置完成 / 预览态不可保存）全部收编 FloatingToast 中性档；resetHint 定时器删除，自退统一走动画 onDone。
- Toast 形态定稿：居中 + 最大宽 520px 折行 + **不透明淡色底**（`color-mix(tone 10%, bg-layer-1)`）+ 同色系深描边 + 语义色圆点 + 深色正文；**四档色** error / success / warning / neutral（反色实面）。
- viewErr（页面级会话失败条，需手动关闭）外观对齐中性档，保留不自动消失。

**修订四（同日第六轮）**：FloatingToast 加 `sticky` 档收编最后一处手写（面板 JSON 不合法）⇒ **全站 Toast 唯一实现**（差异全是传参）；圆点改独立 flex 元素左上对齐；文字区 `pre-line` 支持 `\n` 换行；多问题校验提示一行一条、句号统一。

**修订五（同日第七轮，用户新需求）**：选「完全权限」保存前强制高危确认——VersionConfirm 扩展 `warning` 标题染橙 + `checkbox` 勾选门槛（勾后确认钮解禁、每次重勾）+ desc 换行；确认钮沿用「保存」不改名，确认即提交。

**修订七（同日结案轮）**：① 删「执行期间请勿关闭电脑」提醒——调度跑在宿主进程（Docker 常驻），不依赖网页打开（已向用户答疑）；② 确认弹窗排版层级化（标题 15/600 → 说明 13 → 结构化圆点清单浅底块 → 勾选 → 按钮，宽 400）；③ 保存成功提示改**官方 primitives Toast**（顶部居中、绿勾、holdMs 2500）——分工定案：页面级反馈用官方 Toast，锚定上下文的反馈用自制 FloatingToast。本工作包（编辑器 UX 第二轮）结案。

**修订六（同日第八轮）**：① 保存成功不再静默——编辑器/面板保存成功均弹共用 Toast 绿色「任务已保存」（方案 2，统一 Toast）；② 版本找回 = 内容覆盖到左侧编辑器、**不关全屏编辑器**（用户接着改）。

---

## 决策 53：排期文案必须单源 + 主界面真机返工口径（2026-09-30）

**背景**：主界面真机试用暴露**同一个排期两处文案不一致**——列表写「周一…每 10 分钟执行一次」，编辑器「预计执行」写「每天每 10 分钟执行一次」。根因不是文案笔误，而是**两处各写了一份实现**（列表 `cronToHuman` 从 cron 字符串反解、编辑器 `describeSchedule` 从表单草稿生成）。用户拍板：必须抽象成一个，不许一个功能两处各写一套。

**定型（排期「结构化 → 人话」唯一实现 = [`src/client/schedule-text.ts`](../../src/client/schedule-text.ts)）**：

1. **取结构化**（两个来源收敛到同一个 `ScheduleSpec`）：
   - `scheduleSpecFromDraft(draft)` —— 编辑器有表单草稿；
   - `scheduleSpecFromSchedule(schedule)` —— 列表只有任务定义，**优先吃结构化 `ui`**（新建 / 编辑双写的 `schedule.ui`），老任务没有 `ui` 才退回 `specFromCron` 反解。
2. **出文字**（吃 spec、吐文案，方法本身支持样式参数）：
   - `scheduleSegments(spec, t)` —— 片段数组，关键片段带 `emphasis` 标记（唯一文案生成处）；
   - `scheduleText(spec, t)` —— 纯文本（跑马灯等只收字符串的地方）；
   - `renderSchedule(spec, t, opts?)` —— React 节点，传 `emphasisStyle` 即把关键片段包一层（加粗 / 换色 / 加间距都从这里出）。

**配套**：`cronToHuman` 与列表自有文案键删除；`TaskOverviewRow.schedule` 增加 `ui` 并纳入展示指纹 `overviewKeyOf`（改排期表单必 bump rev）；文案口径统一采用编辑器「预计执行」的句式。

**同轮真机口径（原样记，避免以后重犯）**：

- 上次 / 下次恢复成**两个独立小标签**（曾短暂合并成一条 `RunPills`，用户嫌丑 ⇒ 拆回 `PastPill` + `NextPill`）。
- **官方 `Tooltip` 的子元素必须是真 DOM 元素**：裸函数组件（`LiveText`、官方 `Icon*` 等）ref 挂不上 ⇒ 提示**静默失效**。此坑第二次踩到（`task-editor` 里「图标要包真 `<button>`」已记过一次）。
- 启用开关两处**必须同款**：官方 Switch 选中色是 `brand-primary`（亮色近黑 / 暗色近白），故要让列表与编辑器一致就得两处都局部覆盖成官方状态色 success 绿（`state-success-primary`）。
- **右上角刷新按钮移除**（保存 / 拨片已即时刷新）；保存成功后先做**乐观补行**（`patchRow` + `rowPatchOf`，只补能由定义原样算出的字段）让改动立刻可见，紧接着重拉服务端真值覆盖它。
- 日期 / 时间显示一律**两位补零**（用户 2026-09-30「都把它补成两位」）：倒计时 `05:09` / `01:05:09`、卡片创建于 `09 月 30 日`、执行记录时间戳**自己拼** `YYYY-MM-DD HH:mm:ss`（替代 `toLocaleString`——它的补零与分隔符随语言 / 环境变，真机出现过个位数分钟）、日历标题月 `09`（zh `2026年09月` / en `09/2026`）。
- **补跑语义（已核实，不改码）**：停用后重新启用时，只会跑**窗口内最晚那一槽**（`dueSlot` 只取 max，且该槽已有实例行即返回 `undefined`，不向更早回退）＋ 同任务串行互斥 ⇒ 任何时刻至多补一次，`window` 只决定「那一槽可以晚多久跑」，**不是窗口内全补**。遗留缺陷是**显示**（卡片按 `nextSlotAfter(now)` 显示，不体现马上要补跑的那一槽）⇒ 记入 PROGRESS 未决项 U17。

## 决策 54：任务「没执行」必须可见 —— 到点显 loading / 延期徽标 / 每阻塞段补记一条 `skipped`（2026-09-30）

**动因（真机两条）**：① 带上传附件的任务**永不执行**，且执行记录里**一条都没有**；② 到点后卡片仍在跳「下一槽倒计时」、位置被客户端钳位钉住不落位，而任务其实压根没派发。

### 1. 三类状态严格分开（用户拍板）

| 类 | 触发 | 落库 | 重试 | 卡片 |
|---|---|---|---|---|
| ① **执行失败** | agent 跑砸 / 回执失败 | `failed`（现状不变） | 按 `retry.maxAttempts` | 红 |
| ② **任务级错误** | 附件找不到 / 工作区不存在 | **写一条终态 `skipped` 实例行** + 原因 | **永不重试** | 红 + 悬浮原因 |
| ③ **延期** | 上游没跑完 / 上一轮还在跑 / 服务抖动 | 内存派生（`runtime-index`）+ `task_log`（**不写实例行**） | — | 延期徽标 + 悬浮原因 |

- **到点就显三个方块 loading**（删掉「即将执行」那句）；**延期只显徽标、不显 loading**（不假装在跑）。
- **排序** = 「还要执行的排最前（最近的在前）→ 永远不执行的排后 → 停用的沉底」；**删掉客户端「到点钳位」整套**（本地派生状态 + 哨兵 `-1` 插队号）。
- 用户明确：**失败就该盖掉上次成功**（不能给人「天下太平」的错觉）。

### 2. 「被吃掉的槽」补记规则（用户 2026-09-30 定稿）

- **不要在被堵那一刻写**：窗口内还可能补跑（被依赖卡住的槽，依赖 10 分钟后好了会**真的补跑**，提前写就是错的）。
- **等下一个该执行的时刻到了**（判定条件：存在更晚的、已进窗口的槽 且 前一槽无实例行）⇒ 只补记**紧邻的前一槽**。
- **不补**中间漏掉的 N 条、**停机期间不补**（重启后第一轮只能看到最近一个窗口 ⇒ 需 `startedAtMs` 门禁）。
- 主键**必须用被漏那一槽自己的时刻**：用当前槽的时刻会撞当前槽真实执行行的 `UNIQUE(task_id, scheduled_at)`，`INSERT OR IGNORE` 静默丢弃 ⇒ **任务永久不再执行**。
- 状态 `skipped`、`attempt = 0`、不写 `dispatched_at/session_id/lease_until`；原因进 `task_events` + `task_log`（实例行无 message 列）。
- **每阻塞段一条**（复用「结论变化才记」签名表），否则 8 小时阻塞退化成 48 条。
- `once` 任务：改时间 = **新刻度** ⇒ 正常执行（旧槽被占不影响）；用户已确认这个模型正确。

### 3. `skipped` 为什么「永不重试」（要可验证，不靠口头）

Loop B `sweep` 只遍历 `pending / dispatched / running / unknown`；`skipped` 属终态进不去；`startupScan` 只改 `dispatched/running`；串行互斥集只含 `dispatched/running`（不挡后续刻度）。⇒ **用冒烟断言钉死**：写一条 `skipped` → 跑 `sweep()` → 行不变。**绝不能用 `unknown`**（会被重试逻辑拉起来真跑，或悄悄变 `failed`）。

### 4. 下游语义变化（用户明确接受）

`latest_success` 从「上游无行 ⇒ 取更早旧成功 + 告警放行」变为「上游最近一条不是 `succeeded` ⇒ **硬阻塞**」。更正确（不让下游拿脏数据），代价是上游漏一槽即整链停住、直到上游下次成功（**有界**，非永久）。

### 5. 附件两个 bug（必修）

1. **`task-assets.ts` 的 `attachmentAbsPath` 读侧少一层**：把 `attachments/` 前缀剥掉再拼 ⇒ 解析成 `<任务目录>/<文件名>`，而写侧是 `<任务目录>/attachments/<文件名>`（同一个文件里的 `moveAttachmentsIn` 用的是正确基准）⇒ **带上传附件的任务恒判「附件不存在」**：Loop A 不建实例行、Loop B 不发动 ⇒ 执行记录里一条都没有。**修的是「读」，不是「记」⇒ 原任务无需重传附件。**
2. **`dispatch.ts` 全文无附件注入** ⇒ 模型永远收不到附件。改为派发消息注入「本次随附文件」段：逐条给**绝对路径**（upload 按任务目录 / link 按来源工作区 / 解析不出如实标注相对路径、绝不猜），并**显式豁免**权限指令的「仅工作区内」（只放开读，不放开写）。**真 file part 做不到**：宿主 `UserMessage.content` 目前只声明 text 内容块。

### 6. 轮询活性（真机「5 分钟不动、倒计时照跳」的根因）

`GET /tasks/overview` 的 `fetch` **无超时** ⇒ 一旦请求挂住，`busy` 永远 `true` ⇒ 后续轮询全部早退 ⇒ 客户端的到期清理**再也不跑** ⇒ 钳位永不解开（倒计时是**另一个 1 秒心跳**，所以照跳）。改法：链式调度（上一轮结束再排下一轮）+ 超时 + 看门狗 + 切回前台补拉。**同款问题**还存在：面板 2 秒轮询通道、保存任务的请求。

### 7. 排期约束与分期

- **删钳位必须与服务端「阶段 / 稳定排序键」同一批上**，否则 `task-sort.ts` 头注释记录的「到点先掉下去、再跳回来」抖动会**日常必现地回归**。
- 分期与进度（**1/2/4 已全部收口**）：**P1 附件两 bug** ✅（冒烟 319 → 325）→ **P2a 轮询活性** ✅（8s 超时 + 看门狗）→ **P4 补记 `skipped`** ✅（+ 卡片标红）→ **P2b-1 服务端「已处理」闸门** ✅（刻度过期不再无脑前移 ⇒ 排序键不随读变化；`once` 出口）→ **P3a 到点即显 loading** ✅（`LiveText` 支持渲染节点、删掉「即将执行」）→ **P3a 收尾** ✅（上界改吃 live `tickMs`、复用 `pinMsFor` 同口径）→ **P3b 延期徽标 + 悬浮说明** ✅ → **P3b-2 具体原因透出** ✅（`markBlocked` 边沿触发，调度器写人话原因）→ **第 4 条 请求超时统一** ✅（`fetchWithTimeout`，面板 9 处）→ **P2b-2 删客户端钳位** ✅（分四阶段，冒烟 331 全过）。
  - **不在本轮范围**：**执行记录页**（用户明示「属新功能，未经明示不动」）；**任务展开区 UI 重做**（用户早前提出，被本线工作挤出，待排）。
  - 已知小尾巴：`historyRetentionDays > 0` 时补记的 `skipped` 行不在 purge 保护名单内（默认 0 = 不清，暂不影响）。
- **已知缺口**：任务编辑器的「执行记录」标签页目前是**占位**（标着「P2 待接」），面板执行记录页只有按钮没有列表 ⇒ 「用户能在执行记录里看到」还需先补那个页面；在那之前实例行只能在**调试页**看到。
