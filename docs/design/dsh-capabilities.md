# 已核实的 DSH 能力（源码级事实清单）

> **这是什么**：开发过程中对 DSH 宿主（deepseek-harness）源码逐条核实的能力事实，含结论出处。**只记事实，不记过程**——过程叙事见 [`../worklog/`](../worklog/)。
> **怎么用**：实现新功能前的 API 疑问先查本清单与决策表，查不到再翻宿主源码（决策 15：结论必须可溯源）。
> 事实对应宿主 **0.1.6-alpha.2 / 0.1.7-rc.1** 两代（差异已逐条注明）；宿主升级后按需复核。

## 会话与派发

| 能力 | 事实 |
|---|---|
| **会话派发** | `ctx.sessions.create()` 只建存储会话、**不驱动模型**；派发 = `ctx.agents.create({ sessionId, meta: { cwd: 工作区绝对路径 }, agentOptions: { provider, model } })` + `agent.send(msg, 'next-turn', true)`，`agent.whenIdle()` 等空闲 |
| 会话事件 | `ctx.on('session/event', (session, event))` 收**所有会话的所有事件**（同步发射）；`turn/end` 是 `event.type`；`session/created` / `session/disposed` 同步 emit |
| 会话改名 | 内置 `ctx.sessionTitle.rename` → 写持久 `session/title` 事件 |
| 归档 | `ctx.workspaceRegistry.archiveSession(id)` 程序化可用；只追加 `archivedSessionIds`、不动工作区 `sessionIds` 槽位、会话日志保留仍可查 |
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
| 会话如何归入工作区分组 | 只设 `meta.cwd` **不会**归组：必须在会话建成后调实体方法 `workspace.attachSession(sessionId)`（内部要求会话 header 的 cwd 归一后 === 工作区 `path`）；`bootstrap()` 只在 registry 首次初始化时按 cwd 归组历史会话 ⇒ 曾经「落到未分组」的原因即此。已按决策 22 落码 |
| 宿主 Node 版本 | engines `^22.19.0 \|\| >=24.0.0` → **SQLite 用内置 `node:sqlite`**，零原生依赖 |
| ~~provider / model 缺省走宿主默认路由~~ ❌ **原结论已推翻** | 二者**必须成对显式给**：agent-loop `prepareRequest` 对 provider+model 一并校验（`if (!provider \|\| !model) throw`），缺省**不会**填 deployment persona 里的 `{{model}}` ⇒ 报 `has no value ... (section "deployment:persona-prefix")`、本轮秒结束。默认值来源 = `ctx.get('agentDefaultModel').currentSelection()`（= 用户配的 / 上次用的），兜底 = `llm.listProviders()` / `listModels()`。**决策 15 相应更正，见决策 22** |
| agent 的工具与工作区指令从哪来 | 由 agent 所挂的 **agent preset** 决定：**不挂 = 空的全局层**（真机实测只剩根作用域 MCP 工具，fs/bash 全无 ⇒ agent 干不了活）。挂**部署默认 preset** 后，工具集 / prompt sections / skill 目录（含工作区 `AGENTS.md` 注入）全部跟随系统。已按决策 23 落码 |

## 会话列表治理策略（已定）

派发时用 `ctx.sessionTitle.rename` 起规范名（如 `[TASK] 镜像升级日报 · 2026-09-20`），跑完 `archiveSession` 归档。
⚠️ **人在调度器派发的会话里插话会干扰任务** ⇒ 自动任务会话应视为机器专用。
**原则：会话列表不是任务日志，产物目录才是。**
