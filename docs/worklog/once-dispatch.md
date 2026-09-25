# 一次性任务、回执机制与派发链路打通

> 时间范围：2026-09-21 ~ 2026-09-23 · **状态：✅ 完成封卷**（本文件是该工作包完成时的快照记录，不再更新）。
> 
> 决策 18（schedule.once）→ 19（回执机制，推翻契约文件）→ 20（计划时刻 live 重排）→ 21（ctx 透传）→ 22（模型漏斗）→ 23（agent preset）→ 24（per-agent 回执工具），🎉 2026-09-23 首次全链路真机跑绿（once7/8 两轮 succeeded）。
>
> 定型结论见 [`design/decisions.md`](../design/decisions.md)；设计与事实清单见 [`design/`](../design/)。本文只保留过程叙事：踩坑、定位、修复与真机证据。

## 2026-09-21 — 拍板决策 18 + 落码：一次性任务 `schedule.once`

——cron 5 段无年份字段，日月写死模拟一次性会次年同日再触发；`once`（`YYYY-MM-DDTHH:mm`，按 `timezone` 墙上时间解释）与 `cron` 互斥（`checkedTask` 运行时强校验），仅对应日历日生成一条实例 ⇒ 跑到终态后自动停、次年不再触发。实现：`tasks.ts` 加 `onceScheduledAt`（`Intl.formatToParts` 迭代两次收敛 DST）+ 互斥/格式校验，`scheduler.ts` `planFor` 分流，ensureInstances/backfill 自动复用；任务定义 14 → 15 字段（data-model.md 同步）。冒烟：时区换算（上海墙上 14:30 = UTC 06:30）、互斥同填/都缺拦截、坏格式拦截、非对应日期 undefined 全过；template jsonc 补一次性样例

## 2026-09-23 — 拍板决策 19 + 落码：回执机制（推翻契约文件方案）

——契约文件散落工作区难管理、agent 写文件不可靠（可漏/可错/可伪造），废除 `contract.path`；改为 agent 执行插件自带 `dist/submit.js`（命令行由调度器在派发消息里拼好）直写 `task_events`（`kind='receipt'`），对账只查库：派发后最新 receipt + status ∈ validStatuses + outputs 存在且 mtime 晚于派发。硬约束 = 验证闸门：跑完信号后宽限无回执 → 对原会话追问（`handle.agent.send` 重发命令，写死 ≤2 次）→ 仍无按重试判定失败；追问不问「完成了吗」只重发命令（agent 会撒谎）。实现：新增 `src/submit.ts`（CLI，busy_timeout 5000 与调度器并发写）、`store.ts` 加 `latestEvent`/`countEvents`/`latestReceipt`、`reconcile.ts` 改查回执 + nudge/sweep 追问分支、`dispatch.ts` 抽 `submitCommand`/`userNotice`、`resolveStatePath` 移至 `config.ts`（避循环导入）；事件 kind 新增 receipt/nudge/receipt_check。冒烟 12 项全过（正常回执落库/重复提交无害/会话不匹配/实例不存在/终态/缺参数拦截）。设计文档五处同步（decisions/data-model/state-machine/architecture/两样例）；待真机核实：agent 能否跑 node + 访问 dist 路径

## 2026-09-23 — 修复：`contract` 缺省化

——决策 19 废除契约文件后 schema 漏设对象默认值，`contract` 仍按必填校验，无 contract 字段的任务全部拒载（调试面板可见 warn "expected object, received undefined"）；补 `.default({ validStatuses: ['ok'] })`（与 retry/backfill 同款），模板注明整段可省略。冒烟：无 contract 任务解析出默认 ["ok"]（9745d69）

## 2026-09-23 — 真机观察：重装插件期间 manager 容器崩-自愈循环，与插件无关勿误判

——admin 变体（DSH 0.1.5-rc.2）的管理容器自带 http-proxy 反代（3080→3079），`dsh plugin add` 重启 DSH web 的窗口期里，在途代理请求拿 ECONNREFUSED / socket hang up，manager 未挂 proxy error handler，http-proxy 默认 throw 把管理容器带崩、随即自动重启（连续 3 个启动周期，DSH 均正常就绪）。判别要点：崩溃栈全在 `/app/manager/node_modules/http-proxy` + node 内部，**无任何插件帧**；插件崩是 `[manager] DSH 已退出 (code=…)` + `plugin tree failed to load`，manager 崩是 `ECONNREFUSED/RST` + `DSH 就绪` 照常打印

## 2026-09-23 — 首次完整链路观测 + 面板易用性三改进（882b4f3）

——面板显示 `work-report-once:2026-09-23` pending 零事件，经 docker mcp 查容器日志 + inspect（TZ=Asia/Shanghai）判定：**正常排队**，once=22:30 北京时间未到（scheduler.ts:109 未到点不派发），pending 不产生事件；插件启动链路全部正常。改进：① 弹窗加「刷新」按钮（记录手动刷新时刻，区分数据没变 vs 页面没刷）；② 面板所有时间 `toLocaleString` 按浏览器本机时区显示（原样是 UTC ISO）；③ 实例表加 scheduled 计划时刻列 + 宿主 5 分钟心跳强制推快照（时间戳不动 = 宿主无动静，动了 = 活着）

## 2026-09-23 — 决策 20：计划时刻 live 重排落码

——真机确认改 `once` 后旧 pending 实例仍按旧时刻跑（建行时定死）→ `store.reschedule`（CAS `pending + attempt=0`）+ `reschedulePass`（tick 内 ensure 之后、dispatch 之前）：按当前配置重算 `planFor`，不一致则更新 + 落 `reschedule` 事件；`once` 改到别日 → 旧实例 `skipped(plan-removed)`、新日实例自然补建；执行开始（attempt≥1）即冻结。「计划时刻完全不落库」被否：窗口判定 / 回执对账 / 补跑幂等都需要落库时刻。决策 20 + state-machine §13 已同步

## 2026-09-23 — 修复：派发预建会话撞 'already exists'（真机首跑即现）

——决策 20 重排生效、派发链路首跑，但 dispatch 在 `agents.create` 前预建了 `ctx.sessions.create(sessionId)`（为拿 Session 对象改名）→ factory 内部 `sessions.prepare` 查 `store.has(id)` 抛 'already exists'（core/session/src/index.ts:1009），agent.send 未执行，会话成空壳、实例卡 running。修复：删预建（`agents.create` 自建会话并 announce `session/created`，AgentFactory 契约 core/agent/src/index.ts:171-176、session.spec.ts:1293），改名移到 `reconcile.onCreated`（handle 无 session 对象，session/created 监听器才有）；`DispatchInput` 去掉 logger。卡住实例：租约 30min → unknown → 5min → failed；建议配置加 `"retry": {"maxAttempts": 2}` 让其自动重跑

## 2026-09-23 — 临时调试面板落码 + ctx 包装三连坑（183b85c→aebf6d2→72dcbb7）

——面板通道：host 把快照（任务 ids / 实例 / 事件 / 告警环形缓冲）经自有 settings 命名空间 `scope.update` 写入，client 订阅自动刷新，去重 + 2s 节流。三次真机崩溃的教训（cordis 源码实锤 reflect.ts:172-196,221）：① ctx 是 Proxy，赋值任何属性都抛 `cannot set property without provide`；② `{...ctx}` 展开拿不到 `on`/`interval` 等 mixin 方法（不在自有属性上）；③ **结论：ctx 复制/包装/遮-shadow 全部不可行**，tee logger 只能作显式参数传入各模块。教训：mock 宿主是普通对象测不出 Proxy 语义，宿主 API 行为必须先查 cordis 源码

## 2026-09-23 — 真机排查「服务起不来」定案：凭据写锁残留，非插件运行期问题

——禁用插件后仍崩 → 排除插件代码；`docker logs` 抓到 DSH 自身退出错误 `atomic-write: timed out waiting for the writer lock at ~/.dsh/.credentials.yaml.lock`：此前崩溃窗口里 DSH 写凭据持锁被杀（容器重启 SIGKILL），锁文件残留于挂载卷，之后每次启动 client-connection 等锁超时 → DSH 退出 code=1 → manager 反复崩。挪走死锁文件即恢复。**定责**：插件两次启动崩溃（ctx 包装）是诱因链一环；manager 反代无 error handler 放大伤害属镜像侧（`/app/manager/index.js` 无 `proxy.on('error')`），插件侧不修。**流程教训**：① 排查必须先抓 DSH 自身错误日志再下结论，别被表象（manager 栈）带偏；② 任何删除/移动指令必须先 cat 验证路径存在（'#include' 猜路径事件）；③ 重启窗口期别跑插件安装

## 2026-09-23 — 插件重装完成、面板恢复；半截派发实例待收敛 + once 改期语义拍板

——重装后面板正常显示：`work-report-once:2026-09-23` unknown（16:00 崩溃窗口半截派发被启动扫描标记，16:24:27），事件仅 reschedule/cas-claim/assign-session/session/created 四条、**缺 `dispatch` = agent 从未收到消息**（非回执机制问题）；观察期已过，下个 tick sweep 判 failed。**once 改期语义（本轮问答拍板，决策 20 的应用澄清）**：实例身份 = task_id + once 日期部分 ⇒ 同日改时刻无效——ensureInstances 对已存在行幂等跳过（scheduler.ts:68）、reschedulePass 只重算 pending+attempt=0（unknown/终态冻结）；改到明日有效、id 不变（新 logical_date 自动补建）；今日验证全链路须换新 id（或补跑三层入口的 SQL 手动重置，容器无 sqlite3 可 docker exec 用 node:sqlite 改）。崩溃排查隔离文件待用户确认后清理

## 2026-09-23 — 拍板决策 22 + 落码：派发前解析（模型四层漏斗 + 会话必须挂到工作区）

——真机定位「agent 收到消息即秒结束」根因：派发没给 `agentOptions`、也没安装会话级 model selection ⇒ deployment persona 的 `{{model}}` 无值直接抛错（事件序 `dispatch` → 同一秒 `turn/end`），agent 从未干活；另一路缺陷 = 会话只设 `meta.cwd` 未 `attachSession` ⇒ 落「未分组」。宿主源码核实（npm 上 `@deepseek-ai/dsh-{workspace,agent-default-model,agent-loop,llm,api-session-controller}@0.1.6-alpha.2` 官方产物；本机 GitHub 不通但 npm registry 通）：① `agentDefaultModel` 服务 = 部署 composition 里配的 provider+model（二者 required），UI 换模型会 `saveSelection` 回写 ⇒ 即「用户配的 / 上次用的模型」；② agent-loop `prepareRequest` 要求 provider+model **成对**；③ 归组唯一途径 = 实体方法 `workspace.attachSession(sessionId)`；④ 宿主自己的 `session-controller.create` = 「workspaceId 与 cwd 互斥、cwd 取 `workspace.path`、工作区不存在抛 not-found、建完 attach 才归组」。落码：漏斗四层（target → 插件配置 `defaultProvider/defaultModel` → `agentDefaultModel` → `llm` 首个可用）+ 四层全空判失败；新增 `target.provider`；dispatch 后 attach 归组、attach 失败则 dispose 且不发送；`dispatch` 事件落 `provider`/`model`/`modelSource`；失败 reason 三种（workspace-not-found / no-model-route / workspace-attach-failed）。**只运行期现算、绝不回写任务定义或配置**（用户明确要求：配置期固化会让用户日后换模型时失去兜底）。冒烟 21 项全过；**决策 15 相应更正**；决策 21 补录（ctx 透传而非包装）

## 2026-09-23 — 决策 22 真机验证通过 + 拍板决策 23（会话按「部署默认 agent preset」组装）

——真机重跑：模型漏斗生效（系统提示里 `{{model}}` 渲染出部署的模型名）、会话已归入 Temp 工作区分组；但暴露新缺陷：**agent 手里没有 fs/bash 工具**，只剩 `mcp__nas-docker__*` / `container_inspect` / `read_page` / `sidebar_open` 等根作用域工具，于是整轮瞎调 MCP、连一个空文件都写不出来（agent 自述 `I don't have any built-in file write tools available`），最终自然无回执。**定位**：提示词无问题（派发消息 = 任务 prompt + 回执命令两段），根因 = 会话**从没加入 agent preset**——`dsh-agent-presets` 自带告警原文 `agent "…" was published without joining an agent preset; its tools, prompt sections, and skill catalog resolve against the empty global layer`；宿主自己的 `api-session-controller.composeAgent` / `create` 就是规范姿势：`resolve(presetId)` → `meta.agentPreset` + `setup: (agentCtx) => presets.mount(agentCtx, resolvedId)`，而 `setup` 是**发布前唯一**能挂上模型可见层的时机。**落码**（`dispatch.ts` / `host.ts`）：新增 `resolveAgentComposition`（`ctx.get('agentPresets')` → `resolve()` 取部署默认 preset；服务缺失或解析失败按 rosterless 跳过 + 告警，**不判失败**）→ `agents.create` 带 `meta.agentPreset` + `setup` 里 `presets.mount`；create 失败撤回占位 `session_id` 并报 `agent-create-failed`；`dispatch` 事件增记 `agentPreset`。**明确不做 `target.preset`**（覆盖语义 = 整包换「工具 + prompt sections + skill」，粒度粗易误解；真要定制工具属于将来配置页「高级选项 → 勾选工具」的界面工作）。文档同步：decisions 决策 23、state-machine §15、architecture 约束与架构图（顺带修正图中过时的 `ctx.sessions.create`）、本文件状态 / 能力表 / 未决项 / 下一步。`npm run build` 通过，待重装真机验证

## 2026-09-23 — 决策 23 真机验证通过 + 拍板决策 24（回执通道改为 per-agent 工具 `task_dispatch_table_receipt`）

——重装后真机：agent 手里出现 Bash 工具、上下文注入里出现 `Temp/AGENTS.md` 与 `skill-catalog`、产物文件（0 字节）也建成 ⇒ 决策 23 生效。但提交回执失败：`submit.js` 要写宿主数据根下的 `state.db`，而 agent 的 bash 在 **Landlock 沙箱 `workspace-write`** 模式下**只能写工作区** ⇒ `attempt to write a readonly database`；`chmod u+w` 无效、`cp` 回写被 `[sandbox: file access denied under workspace-write mode]` 拒绝、容器内又无 `sqlite3`/`file`，agent 转而拷库绕道（最终判失败 `receipt-missing-after-nudge`）。**定位：路径谁传不是根因——在 agent 沙箱里写宿主状态库本身不成立。** **落码（决策 24）**：新增 `src/receipt.ts`——插件在 `agents.create` 的 `setup(agentCtx)` 里 `agentCtx.tools.register(...)` 注册**裸 definition**（零新增依赖）的工具 `task_dispatch_table_receipt`（per-agent、只对该会话可见、发布前生效），`execute` 在**插件进程内**用既有 TaskStore 连接写 `task_events(kind='receipt')`（形状与 `submit.js` 一致 ⇒ 对账逻辑零改动）；实例 id / 会话 id / status 合法值由**闭包注入**（模型拿不到也伪造不了）；派发与追问的提示词写死失败策略「等约 10 秒原样重试 ≤3 次 → 仍失败**立即停止**、禁止任何其他手段」；`submit.js` 降级为手动 / 排查备用通道；`DispatchInput.statePath` 与 `ReconcileOptions.statePath` 随之删除（追问不再拼命令行）。宿主机制核实：`@deepseek-ai/dsh-tools` 的 `register` 按**调用它的 ctx** 分层（冲突文案明示 `register through that agent's agent.ctx instead`），官方范例 `@deepseek-ai/dsh-tool-fs` 走 `defineTool`。文档同步：decisions 决策 24、state-machine §16、data-model 回执段、本文件状态 / 能力表 / 下一步。`npm run build` 通过，待重装真机验证

## 2026-09-23 — 🎉 决策 24 真机验证通过 —— 首次全链路跑绿（端到端验收通过）

重装新版（含 `dist/receipt.js`）后换新 id 重跑 **两轮全部 `succeeded`**。`once7`：`22:52:05` dispatch（`provider:"omniroute"` / `model:"custom.free"` / `modelSource:"host-default"` / `agentPreset:"standard"` 四项齐全）→ `22:52:09` **receipt**（派发后仅 **4 秒**）→ `22:52:11` `receipt-pass` → succeeded；`once8`：`22:54:05` 派发 → `22:54:31` 回执（`26 秒`）→ succeeded。**决策 24 三处承诺全部兑现**：① 派发消息里**再无命令行**——无 `--db`、无 `submit.js`，宿主侧也不再出现 `landlock-run` / `readonly database`；② **没有任何沙箱 / 权限动作**——不再 `chmod`、不再拷库绕道、不再请求 `danger-full-access`（对比 `once6` 那轮还在为此向用户申请提权）；③ **路径与会话身份都不由 agent 传**——全部由闭包注入，回执里的 `session_id` 与派发会话逐字一致。回执 payload 同时验证了归一化生效：`outputs` 归一为**数组**、`note` 可选参数被正确接收。**产出三查确认真的在拦人**：`once7` 声称的 md 文件此前已被历史轮次造过，但 mtime 早于本次 `dispatched_at` 会被 `output-stale` 拒 ⇒ 必须真重造才过，「复用旧产物冒充」不成立。**一并厘清的两件事**：① `unknown` 态的真实处理 = 不追问（没有可发消息的对象）/ 不重派（怕双跑）/ 静默观察 `unknownGraceMs(5min) + 2×leaseMs(2×30min)` = **65 分钟**（中间只要有动静就 `markActivity` 自动复活回 running）/ 到点 `retryOrFail('unknown-dead')`，因默认 `retry.maxAttempts=1` 通常直接 failed——`once6`（被重装打断的那轮）就是这样，`22:50` 失联、约 `23:55` 自行收敛；② **重启不会清状态**：SQLite 只有 `CREATE TABLE IF NOT EXISTS`、全仓无 `DROP TABLE`，行与事件都留着（面板还能看到最早 15:30 那条记录即为证），丢的只是**内存里的 agent handle**。`65 分钟`里那 60 分钟被 `leaseMs` 语义绑住，真要缩短须给 unknown 单独一个判死宽限（不再复用 `leaseMs`）。**用户明确推迟、本次不处理**，已记入「五、未决项」：**U1** 进程重启后的续跑 / 补跑（注意：即便用户手动「继续」会话，今天也交不了回执——回执工具是派发那次在 `setup` 里按 agent 作用域注册的，恢复出来的会话里没有它）；**U2** 失败即归档导致排查时找不到现场；**U3** 产出只验「存在 + 新鲜」不验内容（`touch` 空文件可骗过）；**U4** `logical_date` 是否显式注入（`once8` 产出文件名日期与实例日期不一致，待确认是提示词所写还是模型自算）。文档同步：本文件抬头状态 / 新增段落 / 能力表（`once` 端到端 ⬆️✅、决策 24 ⬆️✅真机已验证）/ 未决项 U1–U4 / 下一步第 1 条改为已完成并列出 3 点待补验

