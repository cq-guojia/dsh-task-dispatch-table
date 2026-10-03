# 已核实的 DSH 能力（源码级事实清单）

> **类型**：🌐 **外部事实** —— 记的是**宿主（DSH）**能给什么，不是本项目的设计
> **适用版本**：**0.1.6-alpha.2 / 0.1.7-rc.1 / 0.2.0-rc.1 / 0.2.0-rc.2**（逐条注明差异；最近一轮源码核对用的是 **0.2.0-rc.2**，并对 UI 五包 `ui-theme` / `ui-primitives` / `ui-conversation` / `ui-chat` / `ui-renderer` 做了设计变量级核实）；**宿主升级后按 §〇 复核**
> **状态**：✅ 持续维护
> **来源**：`@deepseek-ai/*` 各包源码（`lib/*.js` / `lib/types/*.d.ts`）逐条核实
> **配套**：[`session-view-ui-map.md`](./session-view-ui-map.md)（官方 UI 元素对照）· 实现新功能前先查本清单，查不到再翻源码
>
> **这是什么**：开发过程中对 DSH 宿主（deepseek-harness）源码逐条核实的能力事实，含结论出处。**只记事实，不记过程**——过程叙事见 [`../worklog/`](../worklog/)。
> **怎么用**：实现新功能前的 API 疑问先查本清单与决策表，查不到再翻宿主源码（决策 15：结论必须可溯源）。
> 事实对应宿主 **0.1.6-alpha.2 / 0.1.7-rc.1 / 0.2.0-rc.1** 三代（差异已逐条注明）；**0.2.0-rc.1 已逐包 .d.ts diff 复核（2026-09-29）**：本表所列消费接口（retain/binding/archiveSession/unarchiveSession、session/follow·page、uiConversation 渲染层、configForms/settingsSchema/describe、sidebar.panellist/main/selectPanel）跨 0.1.7-rc.1→0.2.0-rc.1 签名稳定——仅新增可选参数与 layout 服务内部构造参数（宿主侧，非我们调用），无破坏性变更；10 个注入包在 0.2.0-rc.1 均存在。宿主升级后按需复核。**2026-10-01 又对 UI 五包做了设计变量级核实（结果见下方「主题与设计变量」节，适用版本 0.2.0-rc.2）。**

## 会话与派发

| 能力 | 事实 |
|---|---|
| **/goal 持久目标（决策 48，2026-09-29 核实）** | Goal service 挂 **`ctx.goals`**（`@deepseek-ai/dsh-goal@0.2.0-rc.2` lib/types/index.d.ts:54 "Goal service (`ctx.goals`)"）；`CreateGoalRequest { objective: string; maxGoalRounds? }`（types.d.ts:24）；session 事件层有 *goal continuation round*（自动续跑多轮），`GoalPhase = active\|paused\|blocked\|complete`；插件侧 `HostGoals` face 可选，缺 ⇒ 派发降级单轮并告警。 |
| **Agent Teams 多 Agent（决策 49，2026-09-29 核实，推翻「无通道」旧结论）** | 实现在 **experimental 全家桶**（scope 搜索搜不到，须搜 `dsh-team`）：`@deepseek-ai/dsh-experimental-agent-team@0.2.0-rc.2`（`ctx.agentTeams` TeamService：roster/mailbox/task-board，`lib/types/index.d.ts:18`）、`-tool-agent-team`（模型工具 `spawn_teammate`/`send_message`/`list_agents`/`wait_agent`/`interrupt_agent`/`team_task_create/list/get/update`，`lib/index.js:242-445`）、`-agent-team-profile`（cordis.patch.yml：禁旧 subagent 四工具、插 agent-team + tool-agent-team + ui-agent-team，maxMembers 8/maxTasks 256）、`-client-ui-agent-team`（花名册/任务板 UI）。**启用 = 宿主 composition/profile 层，非会话参数**——`SessionCreateRequest` 只有 `workspaceId?/cwd?/sessionId?/agentPreset?`（api-session-controller 0.2.0-rc.2 types.d.ts:279）。profile 启用后 `tool-agent-team.apply` 给**每个根会话 agent** 装6工具（`tryMembership`：无 parentSession、无 subagent descriptor ⇒ 隐式 Team Lead，roster.js:64-95）⇒ 插件派发的会话天生是队长。插件侧 = 探测 `ctx.agentTeams` 存在性：缺 ⇒ 降级单 Agent（`agent-team-unavailable` 告警）；有 ⇒ 派发消息注入团队执行段（如实列官方工具名）。experimental 线无稳定性承诺。
| **会话派发** | `ctx.sessions.create()` 只建存储会话、**不驱动模型**；派发 = `ctx.agents.create({ sessionId, meta: { cwd: 工作区绝对路径 }, agentOptions: { provider, model } })` + `agent.send(msg, 'next-turn', true)`，`agent.whenIdle()` 等空闲 |
| **`agent.whenIdle()` 的确切语义 ——「会话没有在跑了」的权威信号**（2026-10-03 源码核实，**0.2.0-rc.2**，本仓 `reconcile.ts` 用它定裁决时机） | 语义原文（`@deepseek-ai/dsh-agent` `lib/types/runtime-types.d.ts:159-164`）：*"Resolve after the current **whole-agent activity** reaches quiescence… fulfillment after **no active driver or maintenance task remains**"*。实现（`@deepseek-ai/dsh-agent-loop` `lib/index.js:870`）：`do { await (activity = this.activityDone) } while (activity !== this.activityDone)` —— 等 `activityDone` 稳定、不再被替换。**关键推论**：`kick()`（同文件 `:886`）是 `while (await this.turn())`，**goal 续跑的全部轮次都跑在同一个 activity 内** ⇒ `whenIdle()` **不会在轮次间隙误返回**，只在所有轮次跑完、phase 转 `idle` 时 resolve。⚠️ 反例边界：agent **一次都没跑过**时 `activityDone` 可能已 resolve ⇒ **不要在建会话后立刻 await**（会秒回），应在首次 `turn/end` 之后再挂。 |
| **Agent 无「按任务下发权限」参数（决策 50，2026-09-29 核实）** | `AgentOptions`（`@deepseek-ai/dsh-agent@0.2.0-rc.2` `lib/types/runtime-types.d.ts:21-30`）**仅 `provider` / `model` / `reasoningEffort` / `maxTokens`**；`CreateAgentOptions` 的 `meta` / `setup` / `seed` 也无权限位；`dsh` / `dsh-agent` / `dsh-session` / `dsh-agent-loop` 全包 grep 无 permissionMode / acceptEdits / sandbox 之类枚举（只在 `dsh-client-ui-agent-preset` 文案里出现「实际可执行的操作仍由权限设置决定」）⇒ **权限 = 宿主新建会话 UI 的会话级设置，插件无法下发**。插件侧落 `target.permission`（会话默认 / 仅可查看 / 工作区内修改 / 完全权限）并以**派发消息约束指令**执行；宿主开放 per-task 参数后再改下发 |
| 会话事件 | `ctx.on('session/event', (session, event))` 收**所有会话的所有事件**（同步发射）；`turn/end` 是 `event.type`；`session/created` / `session/disposed` 同步 emit |
| **token 用量的权威来源与口径**（2026-10-03 源码核实，**0.2.0-rc.2**；本仓 `reconcile.extractTokenUsage` 据此） | 官方用量挂在 **`assistant/message` 事件的 `usage?: TokenUsage`** 上（`@deepseek-ai/dsh-session` `lib/types/types.d.ts:330-337`：*"Carries the step's `usage` … there is no separate usage record"*）⇒ **事件里带的就是官方算好的，不需要插件自己推**。类型（`@deepseek-ai/dsh-llm` `lib/types/types.d.ts:152-174`）：`inputTokens` / `outputTokens` / `totalTokens?` / `cacheReadTokens?` / `cacheWriteTokens?` / `reasoningTokens?`。⚠️ **计数互斥**（原文 *"Counts are DISJOINT"*）：`inputTokens` = **未缓存**输入，**计费输入 = inputTokens + cacheReadTokens + cacheWriteTokens**；DeepSeek 的 `prompt_tokens` 把缓存折进去、适配器已减掉。**只取 `inputTokens` 会漏掉缓存（大头）** ⇒ 面板 token 会远小于会话，这曾是对不上的根因（本仓按「未缓存 + cacheRead + cacheWrite」求和修正）。 |
| 会话改名 | 内置 `ctx.sessionTitle.rename` → 写持久 `session/title` 事件 |
| 归档 | `ctx.workspaceRegistry.archiveSession(id)` 程序化可用；只追加 `archivedSessionIds`、不动工作区 `sessionIds` 槽位、会话日志保留仍可查 |
| **会话 binding 必须先 retain**（2026-09-26 源码核实；**修正决策 28「归档会话照样可 binding」的说法**） | `sessions.binding(id)` 实现 = `this.scopes.get(id)?.binding`（`@deepseek-ai/dsh-api-session-controller@0.1.7-rc.2` `lib/client.js:3406`）：**只返回已物化 scope 的 binding，从不创建** ⇒ 归档 / 久未打开 / 本进程从未打开过的会话一律 `undefined`。`uiConversation.binding` 随即抛 `inactive session`（`@deepseek-ai/dsh-client-ui-conversation` `lib/client.js:3083`：`if (this.sessions.binding(sessionId) !== owner) throw`）。**正解**：查看前 `sessions.retain(id, { source })` ⇒ `retainScope`（3409）→ `materializeScope`（3472）物化 scope 并在内部触发 `manager.get(id).open()` 拉历史尾页，之后 `binding(id)` 即有值；返回引用须在使用结束后 `release()`。签名：`retain(target, options)`，`options = { source, signal? }`，`source` 是字符串键（记进 `retainedBy`）。**与归档正交**——`unarchiveSession` 只动显示隐藏名单，不能让 binding 可用 |
| **agent preset**（决策 23） | 一个 agent 的**工具 / prompt sections / skill 目录**由它所挂的 preset 决定（preset = 一个目录 + `agent.cordis.yml` 插件行清单 + 可选元数据）；`ctx.get('agentPresets').resolve()` 取部署默认 preset、`mount(agentCtx, id)` 必须在 `agents.create` 的 **`setup`** 里调（发布前唯一时机），`meta.agentPreset` 记会话身份。**未加入 preset 的 agent 会落到「空的全局层」**——实测只剩根作用域注册的 MCP 工具，fs/bash 全无 |
| 工作区指令注入 | `@deepseek-ai/dsh-agent-instructions` 按会话 cwd 的 `root → cwd` 链发现 `AGENTS.md` / `CLAUDE.md`（含 `.local` 覆盖），外加用户全局 `~/.dsh/AGENTS.md`，作为 prompt section 注入（属 preset 行 ⇒ 挂了 preset 才有） |
| **工具注册**（决策 24） | `@deepseek-ai/dsh-tools` 的 `ToolRuntime`（服务名 `tools`）：`ctx.tools.register(definition)` 按**调用它的 ctx** 分层——经 `agent.ctx` 注册即 **per-agent**（只对该会话可见、发布前生效）；`register` 只强校验 `output { schema, render }`，**裸 definition**（标准 JSON Schema 子集）即可，插件无需引宿主包 |
| **agent 沙箱约束**（决策 24） | agent 的 bash 跑在 Landlock 沙箱 **`workspace-write`** 模式：**读任意路径、只可写工作区内**；写宿主数据根 ⇒ SQLite `attempt to write a readonly database` / `[sandbox: file access denied under workspace-write mode]`（`chmod u+w` 无效；容器内无 `sqlite3` / `file`）⇒ 任何「让 agent 直接写宿主状态库」的方案都不成立 |
| **会话历史冷读**（决策 28 核实） | `session/follow`（opening snapshot：records + cursor + projections）与 `session/page`（`{ address, throughSeq, beforeSeq?, maxMessages? }`）**不激活 Agent 即可读历史**，按 durable address（`{ kind: 'session', sessionId }`）读；**归档会话日志仍在，照样可读**（`lib/types/history.d.ts:16-22`、`lib/typert.remote-client.d.ts:20,25`、`lib/types/types.d.ts:357-365,409-473`） |
| **归档语义**（决策 28 核实；**unarchive 部分经决策 29 修正**） | `workspaceRegistry.archiveSession(id)` 把会话加入 `archivedSessionIds` = **「sessions hidden from every grouping surface」**（只藏显示面、保留 `sessionIds` 槽位）；`session/list` **不过滤归档** ⇒ `open()` / `binding()` 仍能选中它，只是界面不显示。⇒ **归档会话「可读、不可从 UI 打开」**。**（修正 2026-09-24：原记「只有 archive、无 unarchive」有误**——`api/workspace-controller/src/commands.ts:171` 有 `unarchiveSession`（host `workspaceRegistry.unarchiveSession` + remote 双通道），官方「已归档会话」设置页（`ui-settings-unarchive-sessions`）就在用它恢复；但**官方对归档会话没有任何查看/预览界面**（设置页每行只有恢复按钮），且主视图导航器 `clearArchivedCurrent()`（`ui-workspace/src/client/navigation.ts:287`）会在列表变化时主动清掉主视图里的归档会话引用——归档会话进不了主视图是官方明确策略） |
| **对话渲染分层**（决策 28 核实；**结论经决策 29 修订**） | `@deepseek-ai/dsh-client-ui-conversation` **导出组装/解析层**（`ctx.uiConversation`、`ConversationNode` 节点族）；画 UI 的组件（ChatView 等）**不直接导出**，对话外壳是根级 `main.conversation`、只渲染「当前会话」。**（修订 2026-09-24：由此得出「第三方只能自绘」的结论不成立**——官方 slot 渲染引擎（`ui-renderer/src/client/scoped-slots.tsx`）组装 entry 的积木全部公开（`useHost`/`useRootBinding`/`observableHook`/`ScopeBindingProvider` + host API `entriesOf`/`storeOf`/`scope('session')`/`locale` + `uiSession.adapter.bindingSource` + `sessions.retain`），复刻引擎 `SessionEntry` 装配逻辑即可在自家弹窗里挂载官方 ChatView 原装渲染，见决策 29） |
| **用户消息内容是「内容块数组」，不止文本**（2026-10-03 核实 **0.2.0-rc.2**） | `UserMessage.content: readonly ContentBlock[]`；`ContentBlockMap` = **`text` / `image` / `file` / `tool-call` / `tool-addition` / `tool-removal`**（`dsh-llm@0.2.0-rc.2` `lib/types/types.d.ts:114-122`）。⇒ 插件派发**可以发结构化 `file` 块**，官方会话会把它渲染成用户消息里的文件附件卡（`fileCard/fileIcon/fileName/fileMeta`），**fork / 续聊都带得走**（它是会话内容，不是插件 UI 画的） |
| **官方附件库 `ctx.attachments`（AttachmentStore）**（同轮核实） | `saveFile({ data: Uint8Array, name? }) → FileAttachmentRef`，`saveFileStream`、`fileHostPath(ref)`（`dsh-attachment@0.2.0-rc.2` `lib/types/index.d.ts`）。**`FileAttachmentRef { attachmentId, name, bytes }` —— 没有路径**（`lib/types/types.d.ts:34-41` 注释：`never a filesystem path`）；`attachmentId` 是内容寻址摘要。⇒ 附件 = **字节副本**，不是链接；**文件夹 / 目录无法作为附件**。存储位置 = **harness home**（`README.md:40`），对象不可变（`:67`）、**永不自动删除（`:120`）**、恢复 / fork 会话共享同一份（`:133`）。实现插件 = `@deepseek-ai/dsh-attachment-local`，宿主默认已挂载 |
| **⚠️ 更正：file 块不会把文件内容喂给模型**（同轮核实，**推翻此前「有 token 成本」的误判**） | 发模型前 `projectFilesToText` 把每个 file 块**替换成一行文字**：`[File "x.md" (N bytes, sha256:xxxxxxxx): verbatim read-only copy saved at "路径". Read that path with your file tools…]`（`dsh-llm@0.2.0-rc.2` `lib/types/content.js:107-135`），注释原话 = *"the only representation a provider ever receives for a file"*。⇒ **走附件块对模型等价于「给路径」，零额外 token**；模型读的是**副本**而非工作区原件 |
| **注入上下文的官方口子 `agent.inject()`**（同轮核实） | `inject(message: UserMessage): void`（`dsh-agent@0.2.0-rc.2` `lib/types/runtime-types.d.ts:203-209`）：把上下文排进最近的 pre-step，**不唤醒 driver**（`followup` 唤醒、`steer` 在步边界生效）。官方注释列举的用途就是「文件变更通知 / 子目录 AGENTS.md / skill 内容 / cron 通知」——与本插件「告诉 agent 这些是输入文件」同类 |
| **消息来源的呈现形态由 `source.form` 决定**（同轮核实） | `ContextForm` = **`instructions` / `catalog` / `snapshot` / `notice` / `relay` / `recall`**（`dsh-llm@0.2.0-rc.2` `lib/types/message.d.ts:46-92`），配 `ContextFormed` 判别联合（`notice` 必带 `summary`、`snapshot` 必带 `sections`）。源码注释明确：**词表是语义的，不是视觉的**——*"Colors, icons, ordering, and collapse defaults are the consumer's business"* ⇒ **插件不要自定义「输入 / 输出」配色**，颜色图标归 UI 侧 |

## 文件预览的官方渲染能力（2026-10-03 源码核实，0.2.0-rc.2）

> 核实方式：`npm pack` **`@deepseek-ai/dsh-client-ui-chat` / `-conversation` / `-renderer` / `-sidebar` / `-sidebar-documentpreview` @0.2.0-rc.2** 解包到**仓库外**临时目录，读 `lib/client.js` + `lib/types/**`（`documentpreview` 不随包发 `src/`，只能读 `lib/`）。
> **本节只记官方事实**；我方取舍与未决项见 [`../features/artifact-opening.md`](../features/artifact-opening.md) 与 [`../../PROGRESS.md`](../../PROGRESS.md)。

| 能力 | 事实 | 出处 |
|---|---|---|
| **官方「打开文件」不自研渲染，转交宿主右栏** | `openFile` 实 = `const url = fileAddressFor(sessionId, cwd, path); ctx.sidebarRight.openResource(url)`（无行号时省略 `{ params: { line } }`）⇒ **预览由宿主右侧栏的资源查看器渲染** | `dsh-client-ui-chat@0.2.0-rc.2` `lib/client.js:12423-12429` |
| 文件资源地址格式 | `dsh-resource://file/session/<encodeSegment(sessionId)>/<encodePath(path)>`；`fileAddressFor` 先把**工作区绝对路径**按 `cwd` 归一为会话相对路径（剥掉 `cwd` 前缀），非绝对路径直接当相对路径 | 同上 `lib/client.js:56-61`（`sessionFileAddress`）、`:100-107`（`fileAddressFor`） |
| `sidebarRight` 是**全局 cordis 服务** | 官方 chat 包以 `inject: ['sidebarRight']` 依赖它（**不是**顶层 `inject`，符合本仓硬约束）⇒ 第三方插件同样可 `ctx.inject(['sidebarRight'])` 取得 | 同上 `lib/client.js:12258-12269` |
| ⚠️ **但右栏路线对本插件整体不可用（决策 39 已拍板排除）** | ① **seat 按会话挂载**：`openResource` 走「当前挂载 seat」，官方原文 *"a command arriving with no seat mounted has no session to act on and **fails loudly**"*，`mounted` 在「global panel 激活或无会话选中」时为 `undefined`（`dsh-client-ui-sidebar-right/lib/types/client/service.d.ts`）；我方整页面板/弹窗激活即顶替会话区 ⇒ 无 seat ⇒ 调用即报错。② 预览组件**绑 sidebar 槽位运行时**，离开座位组装不起来。③ 右栏在布局层，z 序低于我方 z-1000 弹窗 | 结论与证据另见 [`../features/artifact-opening.md`](../features/artifact-opening.md) §二② |
| **官方预览组件的 client 导出面「全是 type」** | `dsh-client-ui-sidebar-documentpreview` 的 `lib/types/client/index.d.ts` 只有 `export type`（`TextPreviewProps` / `DocumentContent` / `DocumentPreviewProps` / `DocumentPreviewDefinition` …）+ 一个 `declare module` 扩展；源码注释重申 *"Every import from another client plugin is a type."* ⇒ **借不到任何官方预览组件**，当年判断至今成立 | `dsh-client-ui-sidebar-documentpreview@0.2.0-rc.2` `lib/types/client/index.d.ts` |
| 官方按扩展名分派实现的方式 | `ctx.documentPreviews` 注册表（`DocumentPreviewRegistry.register`）注册的是**元数据 + keyed slot 组件**，slot 挂 `sidebar.right.pane.tab` 座位 ⇒ 仍是右栏路线。`loading` 档位 = `text-pages` / `bytes-complete` / `renderer` | 同上 `lib/types/client/document/registry.d.ts` |
| **图片类：官方就是 `<img>` + blob，SVG 同理** | `IMAGE_EXTENSIONS = [png,jpg,jpeg,gif,webp,bmp,ico,**svg**]`；`IMAGE_MEDIA_TYPES` 逐扩展名给 MIME（`svg: "image/svg+xml"`）⇒ **SVG 与位图走同一个 `<img>` 渲染器**。⚠️ `BINARY_IMAGE_EXTENSIONS` **不含 svg**（注释：SVG 的 XML 源码值得当文本读）。注册 id = `…/documentpreview/image` | 同上 `lib/client.js:4817-4867` |
| ⚠️ **更正：官方 SVG 不走沙箱 iframe** | 沙箱 iframe + 净化器（`USE_PROFILES.svg` / `ALLOWED_TAGS` / `SVG_NAMESPACE` / `svgDisallowed` 等）属于 **HTML 预览**（`extensions: ["html","htm"]`），**不是 SVG 预览** | 同上 `lib/client.js:4102`、`:4817-4845` |
| **PDF：官方用 pdf.js 渲染到 canvas，不是浏览器原生 iframe** | 独立懒加载分包 `lib/client.pdf.js`（**7.1 MB**，`react.lazy(require.async)`，`lib/client.js:4881-4899`）；实现是 **`pdfjs-dist`** 内联进该分包（`getDocument` / `PDFDocumentLoadingTask` / `GlobalWorkerOptions.workerSrc` / `canvasContext` / 逐页文本层），worker 以 blob URL 起：`new Worker(url, { type: "module", name: "dsh-pdf" })`。`pdfjs-dist` **是该分包的内部依赖、不在 `dependencies`**（`dependencies` 仅 `@deepseek-ai/schemastery`）⇒ 第三方无法合法复用 | `dsh-client-ui-sidebar-documentpreview@0.2.0-rc.2` `lib/client.js:4962-4992`、`lib/client.pdf.js`（`pdfjs-dist` 字样 4 处、`getDocument` 7 处）、`package.json` |
| 官方 PDF 面的样式（可抄） | `.body:has([data-pdf-preview]){background:var(--dsw-alias-bg-document-preview)}`；`[data-code-preview]` / `[data-pdf-preview]` 两个属性选择器即官方区分渲染器的标记 | 同上 `lib/client.js:491`（`TextPreview.module.css` 内嵌 CSS） |
| **HTML：官方静态预览 = `srcDoc` + `sandbox=""`，三层防护（2026-10-04 逐条核实）** | `BasicHtmlFrame`（`lib/client.js:4052-4073`）渲染为 ``<iframe name={dsh-sidebar-html-<tabId>} srcDoc={html} sandbox="" title=… data-html-preview />``。三层：① **净化** = DOMPurify 3.4.11（内联），`WHOLE_DOCUMENT:true`，`FORBID_TAGS: [noscript, base, link, meta, iframe, frame, object, embed, set, animate, animateMotion, animateTransform]`、`FORBID_ATTR: [href, xlink:href]`（`:3825-3842`）；② **CSP** 插 head 第一项 = `default-src 'none'; script-src 'none'; style-src 'unsafe-inline'; img-src data:; font-src data:; media-src data:`（`:3844-3846`）；③ **沙箱** `sandbox=""`（全禁） | 同上 `lib/client.js:3825-3846`、`:4052-4073`；DOMPurify 版本见 `:1707-1708` |
| HTML 取数档位 | 注册为 `loading: 'bytes-complete'`（`lib/client.js:4105`）+ `extensions: ['html','htm']`（`:4102`）⇒ **一次取全量字节**，不分页 | 同上 |
| ⚠️ **官方没有「预览态大小限制」，也没有 512K 常量** | `documentpreview` 的 Config **只有** Office 缓存与 Excel 上限（无 HTML/PDF/MD/图片大小配置）；全量读上限是 **`workspaceFiles` 的 `maxFileBytes`**（部署值，"larger files are refused, **never truncated**"）⇒ 超限即 `too-large` 报错、**官方也不显示半截预览**。源码态走 `read` 分页，上限是部署 `maxBytes`（**不是写死的 512K**） | `dsh-client-ui-sidebar-documentpreview` `lib/types/config.d.ts`；`dsh-api-workspace-files` `lib/types/index.d.ts:56-57` |
| 官方其余渲染器（备查） | 代码 = `CODE_HIGHLIGHT_EXTENSIONS` + 官方 CodeBlock（`lib/client.js:5086-5094`）；excel（`lib/client.excel.js` 7.1 MB）；office/pdf；均绑右栏 slot | 同上 |

### ⚠️ `workspaceFiles` 四个方法的**业务参数个数**（2026-10-03 真机踩坑，务必照抄）

远端客户端**按位置参数个数校验**（多传/少传即抛 `client api: workspaceFiles/<方法> expected N business argument(s) plus an optional AbortSignal, got M`）⇒ 第三参**必传**，哪怕是"读全量"也要传 `{}`。

| 方法 | 业务参数 | 备注 |
|---|---|---|
| `read` | **3**：`scope, path, range: WorkspaceFileRange` | 读全量也要传 `{}` |
| `readBytes` | **3**：`scope, path, options: WorkspaceByteReadOptions` | 读全量也要传 `{}`；`options.range` 才是不传时的全量语义 |
| `list` | **2**：`scope, path` | 无第三参 |
| `stat` | **2**：`scope, path` | 无第三参 |

类型原文：`read(workspaceFileScope, path, range: WorkspaceFileRange, signal)` / `readBytes(workspaceFileScope, path, options: WorkspaceByteReadOptions, signal)`（**`range` / `options` 均非可选**）。⚠️ 由此推出 **`WorkspaceByteRange` 不是元组**：官方是 `{ offset?: number; length?: number }`（两个都可选），**没有** `[start, end]` 这种形状。

出处：`@deepseek-ai/dsh-api-workspace-files@0.2.0-rc.2` `lib/types/index.d.ts:82`（`read`）、`:91`（`readBytes`）、`:99`（`stat`）、`:107`（`list`）；`lib/types/types.d.ts:56-66`（`WorkspaceByteRange` / `WorkspaceByteReadOptions`）。


## 平台与接入

| 能力 | 事实 |
|---|---|
| 定时器 | 官方 `@deepseek-ai/cordis-plugin-timer`：`inject: ['timer']` + `ctx.interval(fn, ms)`，插件卸载自动清理（决策 13 ✅） |
| 插件持久化 | 官方 API = `ctx.storageDomain.open(defineDomain({...}))`（zod schema + JSON 后端）；本插件按决策 7 自管 SQLite，路径 = 决策 14 |
| `storages/` 语义 | 根 = **宿主数据根**（`dshHomePath('storages')` → 配置路径 → `$DSH_HOME` → `~/.dsh`），**非工作区**——决策 14 已据此修订 |
| 第三方包接入 | **bundle 形态**：`package.json` 声明 `"dsh": { "bundle": { "patch": "./cordis.patch.yml" } }`，patch 内 `- insert: { id, name: <npm 包名> }`，用户 `pnpm add` 进 profile |
| 插件写法 | 具名导出 `name` / `inject` / `Config`（schemastery z schema）/ `apply(ctx, config)`；配置在 patch 行 `config:` 键声明 |
| Web 配置页 | **= 插件自带 client bundle**（manifest `"dsh": { "client": { "platform": "web" } }` + `exports['./client']` = lazy-CJS factory 产物），页面注册进 `settings.plugin.item` keyed slot（key = settings 命名空间），设置页「插件」标签页自动配对渲染（决策 17，已按真机作业修订；`plugins.bundle.config` 是组合包契约，勿再误用） |
| 工作区 | `ctx.workspaceRegistry` 拿实体（`WorkspaceEntity.path` 为绝对路径）；`meta.cwd` 必须绝对路径 |
| settings 注册（0.1.6） | `ctx.settings.register(ns, schema, { base })`，namespace 限 `^[a-z][a-z0-9-]*$`（`settings/src/index.ts:419-459`）。**0.1.7-rc.1 起无 register**（见下） |
| settings（0.1.7-rc.1） | `settings` = `SettingsForms`（方法 `configure/describe/schema/update/replace/mutate/write`，**无 register**）；运行时可写字段须在 Config schema 标 **volatile**，`describe()` 只投影 volatile 字段；**宿主 Loader 会把 volatile 字段默认值按 `{}` 提交进 profile** ⇒ 宿主插件配置字段标 volatile 有 entry 不激活风险（worklog/rc1-migration.md）；客户端服务名 = `configForms` / `settingsSchema`（旧 `settingsScope` 仅 0.1.6） |
| 主面板机制（0.1.7-rc.1） | 侧栏入口 = `sidebar.panellist`（list 槽，条目只画图标）+ `main`（keyed 槽，整页替换会话区）+ `ctx.layout.selectPanel(id / null)`（`@deepseek-ai/dsh-client-ui-layout`） |
| ⚠️ npm 版本线 | `@deepseek-ai/*` 的 npm `latest` tag 可能指向旧版（如 sidebar latest=`0.0.1-rc.1`），**必须按 dsh 版本线取包**（如 `0.1.7-rc.1`） |

## 已关闭的源码核实项（结论沉淀）

| 原待查 | 结论 |
|---|---|
| 工作区 name → path | registry **无按 name 查询 API**（仅 `get(id)` / `list()`，实体字段 = `id`/`path`/`title`）→ 实现按 `title` 精确匹配、`id` 兜底 |
| **workspaceFiles 浏览必须以会话为锚**（2026-09-29 核实 0.2.0-rc.1，与 rc.2 同） | `remote.workspaceFiles` 五个方法（list/read/stat/readBytes/changes）首参一律 `workspaceFileScopeId: SessionId`，scope = 会话 header 的 cwd（*header-derived*，解析不激活 agent，归档会话可用）；**目录列举限该会话所属工作区**（*directory listings remain workspace-scoped*），read/stat 虽允许工作区外绝对路径但只能读已知路径、不能枚举。**官方没有「按工作区路径列文件」的无会话接口** ⇒ 浏览某工作区必须有属于它的会话当锚点（我们用 entity.sessionIds 末位，options 路由下发 anchorSessionId）。⚠️ **待跟进**：宿主后续版本若提供按工作区路径直取的面，应撤掉会话锚点方案改直取（用户拍板记录，见 worklog/attachments-upload.md §七）。⚠️ **rc.1 行为变更（真机踩坑）**：0.2.0-rc.1 的 `list` **拒绝空路径**（空串 ⇒ `gateway/bad-request` "path is required"，`lib/index.js inspect()` 首行校验；rc.2 还允许空串列根）⇒ 列工作区根须传 `'.'`（相对 `cwd=工作区根` 归一为根本身）；响应里根的 `path` 仍回空串，客户端内部状态不受影响。我方收敛点 = `file-browser.tsx` 的 `listDir` 包装 |
| 会话如何归入工作区分组 | 只设 `meta.cwd` **不会**归组：必须在会话建成后调实体方法 `workspace.attachSession(sessionId)`（内部要求会话 header 的 cwd 归一后 === 工作区 `path`）；`bootstrap()` 只在 registry 首次初始化时按 cwd 归组历史会话 ⇒ 曾经「落到未分组」的原因即此。已按决策 22 落码 |
| 宿主 Node 版本 | engines `^22.19.0 \|\| >=24.0.0` → **SQLite 用内置 `node:sqlite`**，零原生依赖 |
| ~~provider / model 缺省走宿主默认路由~~ ❌ **原结论已推翻** | 二者**必须成对显式给**：agent-loop `prepareRequest` 对 provider+model 一并校验（`if (!provider \|\| !model) throw`），缺省**不会**填 deployment persona 里的 `{{model}}` ⇒ 报 `has no value ... (section "deployment:persona-prefix")`、本轮秒结束。默认值来源 = `ctx.get('agentDefaultModel').currentSelection()`（= 用户配的 / 上次用的），兜底 = `llm.listProviders()` / `listModels()`。**决策 15 相应更正，见决策 22** |
| agent 的工具与工作区指令从哪来 | 由 agent 所挂的 **agent preset** 决定：**不挂 = 空的全局层**（真机实测只剩根作用域 MCP 工具，fs/bash 全无 ⇒ agent 干不了活）。挂**部署默认 preset** 后，工具集 / prompt sections / skill 目录（含工作区 `AGENTS.md` 注入）全部跟随系统。已按决策 23 落码 |
| **官方 primitives 有哪些组件**（2026-09-29 核实，纠正此前「官方无表单件」的错记） | **有**：`Switch` / `Input` / `Checkbox` / `SegmentedControl` / `SegmentedTabs` / `Menu`（+ `MenuItem` / `MenuSeparator` / `MenuLabel` / `MenuItemButton`）/ `MenuSurface` / `Pill` / `Tag` / `Toast` / `Tooltip` / `ConfigField` / `SettingsForm`(`settings-form/`) / `Modal` / `Button` / `JsonTree` / `RiskConfirmation` / `HoverCard` / 279 个 `Icon*`。**没有日期 / 时间选择器**：`lib/types/**` 与 `lib/icons/**` 里无 calendar / datepicker / weekday 任何痕迹 ⇒ 日历与时分列只能自绘（照官方 token 与几何，见 `src/client/editor-fields.tsx`）。核实方式：`npm pack @deepseek-ai/dsh-client-ui-primitives@0.1.7-rc.2`，读 `lib/types/*.d.ts` + `lib/*.module.css` + `lib/index.js` |
| **primitives 版本差异**（同轮核实） | `MenuSurface` / `ShortcutKeys` / `useModalLayer` / `closeTopModal` / `isBehindModal` / `focusWithoutRing` / `observeComposition` / `GuideArtwork*` **仅 0.1.7-rc.2 有**；而 `Switch` / `Input` / `Menu` / `SegmentedControl` / `SegmentedTabs` / `Pill` 在 **0.1.5-rc.2 / 0.1.7-rc.1 / rc.2 都在** ⇒ 跨版本安全，可放心用；不确定的组件别用 rc.2 独有件 |
| **`--dsw-alias-brand-primary` 的实际色值**（同轮核实，解释「开关打开为什么是白的」） | 亮色主题 = `--dsw-static-neutral-bluish-1000`（`#0f1115`，近黑）；暗色主题 = `--dsw-static-neutral-bluish-50`（`#f9fafb`，近白）⇒ **官方 `Switch` 选中态在暗色下本来就是近白**，不是我方画错。要「打开=绿色」得局部覆盖成 `--dsw-alias-state-success-primary`（= `--dsw-static-green-500`）。出处：`@deepseek-ai/dsh-client-ui-theme@0.1.7-rc.2` |
| **官方组件签名要点**（同轮核实，踩坑面） | `Input`：`style` / `...rest` 落在**内层 `<input>`**、`className` 落在**外层 `.wrap`**（要控宽度得管外层）；`Menu`：`selection:'check'` 是**默认**（选中项尾随对勾），`portal:true` 才躲祖先滚动裁剪，Escape 会 `preventDefault` ⇒ 外层弹窗据 `defaultPrevented` 让位；`SegmentedControl`：约定面板 id = `<id>-<value>-panel`；`useAnchoredPosition` 只回 `{left, top}` —— `position: fixed` 与 `createPortal` 得调用方自己给 |
| **`Menu` 的 `children` 用法与键盘行为**（2026-10-04 源码核实，落地于 `ui/TaskPicker.tsx`） | 适用版本 `@deepseek-ai/dsh-client-ui-primitives@0.2.0-rc.2`，源码 `lib/index.js:3927` 起。① **`children` 渲染在 MenuSurface 的 viewport 内**（`:4246`：`viewport.children = [items.map(renderEntry), children]`）⇒ 可以在菜单里塞自定义面板（输入框 + 自绘行），**不必自绘浮层**；② 文档级 `keydown` 只处理 **Escape / Tab / ArrowDown / ArrowUp / Home / End**（`:4093-4114`），**字母键不拦** ⇒ 面板里的搜索框能正常打字；方向键在浮层内游走（`list.querySelectorAll('button:not(:disabled)')`）；③ **`autoFocus` 会把焦点抢到浮层第一个按钮**（`:4038-4044`）⇒ 需要「打开即聚焦自己的输入框」时**不要开 autoFocus**，打开后自己 `focus()`；④ 点外关闭挂在 `document.pointerdown`，命中 `rootRef` / `listRef` 之外才关（`:4055-4061`）⇒ 面板内操作不会误关；⑤ `footer` 是**菜单项数组**（`MenuEntry[]`），不是任意节点 |
| **有无 Table / 列表件 + 文件类型图标**（2026-10-01 核实，**0.2.0-rc.2**，补上条） | **官方没有任何 Table / DataTable / DataGrid / List / ListItem / Grid / Card 组件**（primitives 86 个 `.d.ts` / 36 个 `.module.css` 里无 `Table*`/`List*`/`DataGrid*`）。最接近的「行件」= **`DisclosureRow`**（官方工具行 / 思考行的真身：24px 单行 + icon + title + chevron，`lib/types/DisclosureRow.d.ts:3-35`，props 含 `icon/title/open/expandable/onToggle/running/expandOnRowClick/previewChevron…`）。**文件类型图标 = `FileTypeIcon`**（props `{ path }` 或 `{ kind, size, className }`，按路径自动分类着色；`FileType` 联合 = `code/excel/folder/html/image/markdown/other/pdf/ppt/video/word`，`FileTypeIcon.d.ts:5,42`；配套 `classifyFileType` / `fileExtension`）。**状态件 = `StateDot`**（`done/warning/ongoing/error/idle`，`appearance:'dot'\|'step'`）。常用图标：会话入口 `IconNewChatOutlineRegular`、分支 `IconBranchOutlineRegular`、转圈 `IconLoadingOutlineRegular`、勾 `IconCheckCircleFillRegular`、叉 `IconCloseCircleFillRegular`、警告 `IconWarningOutlineRegular`（`lib/types/icons/index.d.ts`，约 370 个导出，命名 `Icon<名><Outline\|Fill><Regular\|Medium>`）。**无表头 / 列宽 / 排序 / 分页 / 虚拟滚动件；无表格 CSS 变量族**（仅 markdown 宽表 `--dsh-table-spare` / `--dsh-table-lead`，`MarkdownText.module.css:208,213`）。⚠️ chat / conversation 的会话行组件（`ChatView`/`ChatGroupSeat`/`StatsPills`…）**不导出**（`ui-chat` client 入口只 `export { apply, inject }`）⇒ 只能镜像 CSS。⚠️ 本仓 `src/client/primitives.d.ts` 是**手写最小消费面**，上面这些（`FileTypeIcon`/`StateDot`/`DisclosureRow`/会话图标）**尚未声明**，要用得先补声明。核实方式：解包副本 **0.2.0-rc.2**（`npm pack` 五包到仓库外临时目录），读 `lib/types/index.d.ts` 与 `lib/types/icons/index.d.ts` |

## 主题与设计变量（`@deepseek-ai/dsh-client-ui-theme` / `-primitives`）

> 核实轮次：**2026-10-01**，宿主 **0.2.0-rc.2**。方式 = `npm pack @deepseek-ai/<包>@0.2.0-rc.2` 解包到**仓库外**临时目录，读 `lib/client.js`（内嵌 CSS 字符串）与 `lib/*.module.css` + `lib/index.js`（脚本按行号/分段取证），并用脚本把「本仓引用的宿主变量」与「宿主真源定义」做差集。过程见 [`../worklog/ui-foundation.md`](../worklog/ui-foundation.md) §七。

### 1. 变量真源与明暗判据

| 事实 | 结论 | 出处 |
|---|---|---|
| 设计变量定义在哪 | `@deepseek-ai/dsh-client-ui-theme` 的 **`lib/client.js` 内嵌 CSS 字符串**（本包**无独立 `.css`**，只有 `lib/styles/brand-font.css` 是字体声明）；去重后约 **400 个 `--dsw-*` 名**（`alias` 107 / `static` 77 / `font` 族 182，余为组件专用族）+ 5 个 `--ds-*` 名（`ds-transition-duration`(+`-fast/-slow`)、`ds-ease-in-out`、`ds-font-family-code`） | theme@0.2.0-rc.2 `lib/client.js`（606 处定义点，脚本实测） |
| **明暗判据只有一个** | `body[data-ds-dark-theme]`（8 个覆盖块，均在 theme `lib/client.js:1148` 起）。宿主启动脚本里写定：`document.body.toggleAttribute('data-ds-dark-theme', dark)`、`document.documentElement.dataset.dsThemeSource = preference`（`light` / `dark` / `system`）、`document.body.style.setProperty('--dsh-content-font-size', '<N>px')`（默认 14） | theme@0.2.0-rc.2 `lib/index.js`（`bootThemeBodyScript`，49–56 行区） |
| `prefers-color-scheme` 归谁用 | **只在宿主内部**，用于把 preference=`system` 解析成 dark（`lib/index.js:43,52`；`lib/client.js:1366` `ThemeRuntime` 持 media query，仅当 preference 为 `system` 时重发）⇒ **插件侧不得自己使用**：它跟的是操作系统、不是用户在宿主里的选择 | 同上 |
| 明暗差异落在哪 | 只有 alias 族、部分 static 族、gradient、shiki 语法色在暗色段被覆盖；**圆角 / 字号 / elevation / shadow 无暗色覆盖** | theme `lib/client.js` 分段解析 |

### 2. 字号体系（**成立** —— 插件应映射，不要自定 px 刻度）

`--dsw-font-<role>` = 简写（`[weight] size/line-height family`），并各有子 token `--dsw-font-<role>-font-size` / `-line-height` / `-font-weight` / `-font-family`：

| 简写 token | 值 | 同族变体 |
|---|---|---|
| `--dsw-font-xxxs-11` | 11px/14px | `--dsw-font-xxxs-strong-11` |
| `--dsw-font-xxs-12` | 12px/18px | `--dsw-font-xxs-strong-12` |
| `--dsw-font-xs-13` | 13px/20px | `--dsw-font-xs-strong-13`（500 字重） |
| `--dsw-font-s-14` | 14px/22px | `--dsw-font-s-strong-14` |
| `--dsw-font-base-16` | 16px/24px | `--dsw-font-base-strong-16` |
| `--dsw-font-m-18` | 500 16px/28px | — |
| `--dsw-font-l-20` | 500 20px/28px | — |
| `--dsw-font-xl-24` | 600 24px/32px | — |

另：`--dsw-font-family`（系统字体栈）、`--dsw-font-family-brand`（Montserrat 在前）、`--ds-font-family-code`（等宽栈）、markdown 族 `--dsw-font-markdown-*` 共 15 个。

### 3. 三处同义变量：裁决（已核实哪一方是死变量）

| 疑点 | 裁决 | 证据 |
|---|---|---|
| `state-warn-primary` vs `state-warning-primary` | **`--dsw-alias-state-warn-primary` 是真变量**（= `--dsw-static-amber-500`，明暗同值；同族还有 `-warn-secondary` / `-warn-tertiary` / `-warn-label`）。**`--dsw-alias-state-warning-primary` 在宿主五个包里 0 处定义** ⇒ 写它只会拿到自己的兜底色、不随主题。官方用法统计：`state-warn-primary` 7 处、`state-warning-primary` 0 处 | theme `lib/client.js:1151` 区；primitives + conversation 全量 grep |
| `focus-ring-color` vs `border-focus` | **`--dsw-focus-ring-color` 真**（配 `--dsw-focus-ring-width: 2px`），但 ⚠️ 其默认值是 **`transparent`**；官方组件写 `outline: var(--dsw-focus-ring-width) solid var(--dsw-focus-ring-color, var(--dsw-alias-state-business-primary))` —— 因为 `transparent` 是**有效值**，`var()` 的兜底根本不会生效 ⇒ **想要可见焦点环必须自己指定颜色**。**`--dsw-alias-border-focus` 宿主 0 处定义**（死） | theme `lib/client.js:1151`；primitives `lib/SegmentedControl.module.css` `.tab:focus-visible` |
| 宿主是否有字号体系 | **有**（见 §2）。此前镜像官方会话面时引用的 `--dsw-font-xxs-12` / `--dsw-font-xs-13` 都是真 token | theme `lib/client.js` |

### 4. 看着有、其实没有的变量（本仓已踩的 5 处）

| 我们写的 | 真实情况 | 正解 | 本仓出处 |
|---|---|---|---|
| `--dsw-alias-interactive-bg` | 宿主**没有**这个名（只有 `-hover` / `-active` / `-hover-solid` / `-hover-accent` / `-hover-danger`） | 轨道 / 下沉底用 `--dsw-alias-interactive-bg-hover`（官方 `SegmentedControl` 轨道即用它） | `archive-session-css.ts:237` |
| `--dsw-alias-border-focus` | 无定义 | `--dsw-focus-ring-width` + 自己给色的焦点环（或用 `--dsw-alias-state-business-primary`） | `archive-session-css.ts:295` |
| `--dsw-alias-state-warning-primary` | 无定义 | `--dsw-alias-state-warn-primary` | `task-editor.tsx:1034,1052`、`toast-css.ts:63` |
| `--dsh-elevation-prominent` | 前缀写错（`dsh-` ≠ `dsw-`） | `--dsw-elevation-prominent` | `task-editor.tsx:1030` |
| `--dsh-radius-panel` | 前缀写错 | `--dsw-radius-panel`（28px） | `task-editor.tsx:2230` |

⚠️ **两个真变量不能用「grep 定义」判定**（差集脚本会误判成死引用）：
- `--dsh-content-font-size`：宿主用 `style.setProperty()` 写在 **body 内联样式**上（theme `lib/index.js:55`），CSS 文件里搜不到定义 ⇒ 真变量（`archive-session-css.ts:165` 用法正确）；
- `--dsh-segment-count` / `--dsh-segment-index`：**由官方 `SegmentedControl` 组件内联写在 tablist 的 style 上**（primitives `lib/index.js`：`"--dsh-segment-count": String(options.length)`、`"--dsh-segment-index": String(selected)`）⇒ 只在官方件子树内有效，外部想借它算位置就得连 padding 一起改（脆弱，见 §6）。

### 5. 圆角 / 焦点 / 语义色真值（明色 | 暗色）

| token | 明色 | 暗色 |
|---|---|---|
| `--dsw-radius-xs/-sm/-md/-lg/-xl/-panel` | 4 / 8 / 12 / 16 / 20 / 28 px | 无暗色覆盖 |
| `--dsw-focus-ring-width` / `--dsw-focus-ring-color` | 2px / `transparent` | 同 |
| `--dsw-alias-bg-base` | `static-neutral-bluish-00` | `…-bluish-950` |
| `--dsw-alias-bg-layer-1/-2/-3` | bluish-00 / 00 / 00 | bluish-875 / 850 / 800 |
| `--dsw-alias-border-l1/-l2/-l3/-l4` | `#0000000a` / `1a` / `1f` / `29` | `#ffffff0f` / `1f` / `29` / `fff3` |
| `--dsw-alias-interactive-bg-hover` / `-active` | `#2631480f` / `#2631481a` | `#ffffff14` / `#ffffff24` |
| `--dsw-alias-label-primary/-secondary/-tertiary` | bluish-1000 / 700 / 600 | bluish-50 / 300 / 400 |
| `--dsw-alias-label-caption` / `-dimmed` | bluish-400 / 200 | bluish-600 / 750 |
| `--dsw-alias-label-primary-inverted` / `-foreground` | bluish-00 / bluish-00 | bluish-800 / bluish-1000 |
| **`--dsw-alias-brand-primary`** | **bluish-1000（近黑）** | **bluish-50（近白）** |
| `--dsw-alias-state-business-primary` | deepseek-500 | deepseek-400 |
| `--dsw-alias-state-success-primary` / `-warn-primary` | green-500 / amber-500 | 同值（不随主题变） |
| `--dsw-alias-state-error-primary` | red-600 | red-400 |
| `--dsw-alias-bg-mask-1` | `#0000003d` | `#00000080` |
| `--dsw-elevation-soft` / `-prominent` / `-panel` | `stroke` + 4px16px/3px8px/3px8px 阴影 | 无覆盖（仅 stroke 色变） |
| `--dsw-elevation-stroke-color` | `border-l4` | `border-l3` |
| `--dsw-shadow-lv1` / `-lv2` / `-lv3` | `0 2px 4px` / `0 4px 12px + 0 2px 8px` / `0 0 1px + 0 0 4px + 0 12px 32px` | 无覆盖 |
| `--dsw-alias-toast-bg` / `-label` | bluish-800 / bluish-00 | bluish-750 / bluish-00 |

⚠️ **`--dsw-alias-brand-primary` 不是蓝色**：明色近黑、暗色近白（官方 `Switch` 打开「变白」即此，见上文既有条目）。界面上的**蓝色强调 / 选中**应走 `--dsw-alias-state-business-primary`。

### 6. 官方 `SegmentedControl` 规格（0.2.0-rc.2，决定「覆写官方」还是「自绘统一体」）

出处：`@deepseek-ai/dsh-client-ui-primitives@0.2.0-rc.2` `lib/SegmentedControl.module.css` + `lib/index.js`。

- **轨道** `.control`：`inline-grid` + `grid-auto-flow:column` + `grid-auto-columns:1fr`、`gap:2px`、`padding:4px`、`border-radius:var(--dsw-radius-md)`、`background:var(--dsw-alias-interactive-bg-hover)`。
- **指示器** `.indicator`：`top/left:4px`、`width:calc((100% - 8px - 2px*(var(--dsh-segment-count) - 1))/var(--dsh-segment-count))`、`height:calc(100% - 8px)`、`border-radius:var(--dsw-radius-sm)`、`background:var(--dsw-alias-bg-layer-1)`、`box-shadow:var(--dsw-elevation-soft)`、`transform:translateX(calc(var(--dsh-segment-index)*(100% + 2px)))`、`transition:transform 160ms ease`。
- **段** `.tab`：`height:28px`、`padding:0 16px`、`border-radius:var(--dsw-radius-sm)`、`font-size:13px`、`line-height:20px`、`font-weight:500`、字色 `--dsw-alias-label-secondary` ⇒ hover / 选中 `--dsw-alias-label-primary`。
- **只支持单选**（`options.length` + selected index）⇒ **多选场景（星期）只能自绘**。
- ⚠️ 计数/索引靠 JS 内联变量（§4）⇒ **外部改 padding 必须同步改指示器 top/left/height/width 算式**；本仓 `task-editor-css.ts:104-106` 正是这么覆写的（padding 3 + 段高 22 + 字 12）。

## 会话列表治理策略（已定）

派发时用 `ctx.sessionTitle.rename` 起规范名（如 `[TASK] 260928-1600 · 镜像升级日报；attempt>0 追加「 · 第N次」，源码 tasks.ts sessionTitleOf），跑完 `archiveSession` 归档。
⚠️ **人在调度器派发的会话里插话会干扰任务** ⇒ 自动任务会话应视为机器专用。
**原则：会话列表不是任务日志，产物目录才是。**

## 宿主写法硬约束（自历史决策并入）

- **顶层禁止导出 `inject`**：声明组合满足不了的依赖会让 entry 一直 pending、**卡死整个 dsh 启动**；服务等待一律写在 `apply` 内的 `ctx.inject`。
- **`ctx` 只透传、不包装**：所有模块只收原始 `ctx`（给 ctx 赋属性会抛错、`{...ctx}` 拿不到 mixin）；替 logger 走显式参数。
