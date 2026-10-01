# 已核实的 DSH 能力（源码级事实清单）

> **状态**：✅ 持续维护（**宿主升级后按 §〇 复核**）
> **来源**：`@deepseek-ai/*` 各包源码（`lib/*.js` / `lib/types/*.d.ts`）逐条核实
> **配套**：[`session-view-ui-map.md`](session-view-ui-map.md)（官方 UI 元素对照）· 实现新功能前先查本清单，查不到再翻源码
>
> **这是什么**：开发过程中对 DSH 宿主（deepseek-harness）源码逐条核实的能力事实，含结论出处。**只记事实，不记过程**——过程叙事见 [`../worklog/`](../worklog/)。
> **怎么用**：实现新功能前的 API 疑问先查本清单与决策表，查不到再翻宿主源码（决策 15：结论必须可溯源）。
> 事实对应宿主 **0.1.6-alpha.2 / 0.1.7-rc.1 / 0.2.0-rc.1** 三代（差异已逐条注明）；**0.2.0-rc.1 已逐包 .d.ts diff 复核（2026-09-29）**：本表所列消费接口（retain/binding/archiveSession/unarchiveSession、session/follow·page、uiConversation 渲染层、configForms/settingsSchema/describe、sidebar.panellist/main/selectPanel）跨 0.1.7-rc.1→0.2.0-rc.1 签名稳定——仅新增可选参数与 layout 服务内部构造参数（宿主侧，非我们调用），无破坏性变更；10 个注入包在 0.2.0-rc.1 均存在。宿主升级后按需复核。

## 会话与派发

| 能力 | 事实 |
|---|---|
| **/goal 持久目标（决策 48，2026-09-29 核实）** | Goal service 挂 **`ctx.goals`**（`@deepseek-ai/dsh-goal@0.2.0-rc.2` lib/types/index.d.ts:54 "Goal service (`ctx.goals`)"）；`CreateGoalRequest { objective: string; maxGoalRounds? }`（types.d.ts:24）；session 事件层有 *goal continuation round*（自动续跑多轮），`GoalPhase = active\|paused\|blocked\|complete`；插件侧 `HostGoals` face 可选，缺 ⇒ 派发降级单轮并告警。 |
| **Agent Teams 多 Agent（决策 49，2026-09-29 核实，推翻「无通道」旧结论）** | 实现在 **experimental 全家桶**（scope 搜索搜不到，须搜 `dsh-team`）：`@deepseek-ai/dsh-experimental-agent-team@0.2.0-rc.2`（`ctx.agentTeams` TeamService：roster/mailbox/task-board，`lib/types/index.d.ts:18`）、`-tool-agent-team`（模型工具 `spawn_teammate`/`send_message`/`list_agents`/`wait_agent`/`interrupt_agent`/`team_task_create/list/get/update`，`lib/index.js:242-445`）、`-agent-team-profile`（cordis.patch.yml：禁旧 subagent 四工具、插 agent-team + tool-agent-team + ui-agent-team，maxMembers 8/maxTasks 256）、`-client-ui-agent-team`（花名册/任务板 UI）。**启用 = 宿主 composition/profile 层，非会话参数**——`SessionCreateRequest` 只有 `workspaceId?/cwd?/sessionId?/agentPreset?`（api-session-controller 0.2.0-rc.2 types.d.ts:279）。profile 启用后 `tool-agent-team.apply` 给**每个根会话 agent** 装6工具（`tryMembership`：无 parentSession、无 subagent descriptor ⇒ 隐式 Team Lead，roster.js:64-95）⇒ 插件派发的会话天生是队长。插件侧 = 探测 `ctx.agentTeams` 存在性：缺 ⇒ 降级单 Agent（`agent-team-unavailable` 告警）；有 ⇒ 派发消息注入团队执行段（如实列官方工具名）。experimental 线无稳定性承诺。
| **会话派发** | `ctx.sessions.create()` 只建存储会话、**不驱动模型**；派发 = `ctx.agents.create({ sessionId, meta: { cwd: 工作区绝对路径 }, agentOptions: { provider, model } })` + `agent.send(msg, 'next-turn', true)`，`agent.whenIdle()` 等空闲 |
| **Agent 无「按任务下发权限」参数（决策 50，2026-09-29 核实）** | `AgentOptions`（`@deepseek-ai/dsh-agent@0.2.0-rc.2` `lib/types/runtime-types.d.ts:21-30`）**仅 `provider` / `model` / `reasoningEffort` / `maxTokens`**；`CreateAgentOptions` 的 `meta` / `setup` / `seed` 也无权限位；`dsh` / `dsh-agent` / `dsh-session` / `dsh-agent-loop` 全包 grep 无 permissionMode / acceptEdits / sandbox 之类枚举（只在 `dsh-client-ui-agent-preset` 文案里出现「实际可执行的操作仍由权限设置决定」）⇒ **权限 = 宿主新建会话 UI 的会话级设置，插件无法下发**。插件侧落 `target.permission`（会话默认 / 仅可查看 / 工作区内修改 / 完全权限）并以**派发消息约束指令**执行；宿主开放 per-task 参数后再改下发 |
| 会话事件 | `ctx.on('session/event', (session, event))` 收**所有会话的所有事件**（同步发射）；`turn/end` 是 `event.type`；`session/created` / `session/disposed` 同步 emit |
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

## 会话列表治理策略（已定）

派发时用 `ctx.sessionTitle.rename` 起规范名（如 `[TASK] 260928-1600 · 镜像升级日报；attempt>0 追加「 · 第N次」，源码 tasks.ts sessionTitleOf），跑完 `archiveSession` 归档。
⚠️ **人在调度器派发的会话里插话会干扰任务** ⇒ 自动任务会话应视为机器专用。
**原则：会话列表不是任务日志，产物目录才是。**

## 宿主写法硬约束（自历史决策并入）

- **顶层禁止导出 `inject`**：声明组合满足不了的依赖会让 entry 一直 pending、**卡死整个 dsh 启动**；服务等待一律写在 `apply` 内的 `ctx.inject`。
- **`ctx` 只透传、不包装**：所有模块只收原始 `ctx`（给 ctx 赋属性会抛错、`{...ctx}` 拿不到 mixin）；替 logger 走显式参数。
