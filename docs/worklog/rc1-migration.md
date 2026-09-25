# 宿主 0.1.7-rc.1 迁移与面板数据通道重构

> 时间范围：2026-09-24 ~ 2026-09-25 · **状态：✅ 完成封卷**（本文件是该工作包完成时的快照记录，不再更新）。
> 
> 侧栏入口迁移 sidebar.panellist + main 整页化；settings register 崩溃修复；数据通道五连败（volatile / configForms / remote）后定案 webServer HTTP 路由 + 同源 fetch，最终真机跑通。
>
> 定型结论见 [`design/decisions.md`](../design/decisions.md)；设计与事实清单见 [`design/`](../design/)。本文只保留过程叙事：踩坑、定位、修复与真机证据。

## 2026-09-24 — 主界面常驻入口落码（`sidebar.footer.action`）

用户要「任何屏都看得到」的主入口。首选工作区侧栏头部那排（放大镜 / 设置 / 新建工作区图标旁）经查是 `ui-workspace` 渲染的内置 chrome、**无扩展槽**；次选会话右上角 `conversation.session.header.actions` 是官方 list 槽但 `scope:'session'`、**仅会话内可见**（新建会话屏不出现，正是用户担忧）。落点 = 左栏底部 `sidebar.footer.action`（list 槽，任何屏常驻；兄弟插件 `dsh-context@0.55.0` 已在同处注册 `context-overview` 的 Overview 按钮）。**实现**：抽 `useTaskPanel` 钩子，`TasksConfigPage`（设置卡片）与新增 `TaskTrayButton`（侧栏图标按钮）共用、点开同一个 `DispatcherModal`；list 槽注册 `{name:'sidebar.footer.action', id: SETTINGS_NS, order:20, locale, inject}`；按钮**图标 + tooltip**（`title`/`aria-label` 用 `panelTitle`），宽栏（`props.wide === true`，与 dsh-context 同款读取）追加「任务调度」文字标签（`trayLabel` 键）。**不把 `ui-workspace` 列入 client 依赖**：参照 dsh-context 同款写法（`dsh.client.inject` 亦无 `ui-workspace`，靠 `slots.inject` 延迟注册即正常），标准组合里 `ui-workspace` 必然在场 ⇒ 槽必存在、按钮必显示。`npm run build` 通过、冒烟全过，dist 已随构建更新

## 2026-09-24 — 修复真机崩溃：ctx.settings.register 非函数（改 ctx.inject 守卫订阅）

——真机启动报 `TypeError: ctx.settings.register is not a function`（`dist/index.js:23`）。根因：settings 服务以「带 register 面」或「惰性形态」两种组合入场，`apply` 内无条件 `ctx.settings.register(...)` 在惰性形态下崩；参照 `dsh-context@0.55.0` 的 `installSettings`（`lib/index.js:3336` 守卫 `typeof service.register !== "function"`）。修法：照搬——把 `settings` 从顶层 `inject` 移出，`apply` 内改 `ctx.inject(["settings"], sctx => { if (typeof sctx.settings.register !== "function") return; ... })` 守卫订阅，仅 register 就绪才激活整个调度体，缺失则静默 inert 不崩；`src/host.ts` 补 `HostContext.inject` 类型。`npm run build` 通过、dist 已随构建更新。**待真机验证**：测试机 settings 服务若确无 register 面则插件仍 inert（需在提供 register 的 dsh 版本运行），有 register 则全功能恢复

## 2026-09-24 — 真机（dsh 0.1.7-rc.1）定位「侧栏入口不出现」根因 + 解耦修复

① 槽名/类型经核实**没错**——`@deepseek-ai/dsh-client-ui-sidebar@0.1.7-rc.1` 确有 `sidebar.footer.action`（kind=list, scope=root），dsh-context 的「上下文洞察」就在同处；② 真因 = **rc.1 改了 settings 两处 API**：宿主 `settings` 服务换成 `SettingsForms`（`super(ctx,"settings")`，方法仅 configure/describe/schema，**无 register** → 最初 `ctx.settings.register is not a function` 即此）；客户端服务名由 `settingsScope` 换成 `configForms`/`settingsSchema`（`dsh-client-ui-settings@0.1.7-rc.1` 只 provide 这两个）⇒ 我们 `ctx.inject(["slots","settingsScope"], ...)` **永不触发**，而侧栏入口恰好嵌在该块内 ⇒ 按钮无声消失；③ 修复：把侧栏入口注册**移出 settingsScope 块**、改为只依赖 `slots`（照 dsh-context 顶层注册），并拆「无 hooks 外壳 + 就绪态实体」，作用域缺席时渲染禁用占位；`settingsScope` 标为可选+守卫。构建/冒烟 53 项通过、dist 已更新。**待办**：设置卡片与面板数据通道需迁移到 rc.1 新契约（configForms/settingsSchema + 入口 Config 自动投影），旧的 `ctx.settings.register` 写入通道已失效

### 方案：入口迁到 `sidebar.panellist` + 面板整页化 + rc.1 settings 迁移（2026-09-24 拟定）

### 背景（真机实测结论，全部有 npm 包源码依据）

dsh 0.1.7-rc.1 换了三处契约，本插件（按 0.1.6 时代写的）全部踩空：

| 项 | 旧契约（本插件现状） | rc.1 新契约 | 证据 |

|---|---|---|---|

| 宿主 settings | `ctx.settings.register(ns, schema, {base})` | `settings` = `SettingsForms`，方法仅 `configure/describe/schema`，**无 register**；插件 Config schema 自动投影成表单 | `@deepseek-ai/dsh-settings@0.1.7-rc.1` `super(ctx,"settings")` |

| 客户端 settings | 服务名 `settingsScope` | `configForms` / `settingsSchema`，namespace 按 **profile entry id** 寻址 | `@deepseek-ai/dsh-client-ui-settings@0.1.7-rc.1` 只 provide 这两个 |

| 侧栏/主区 | `sidebar.footer.action`（底栏横排） | 原生「主面板」机制：`sidebar.panellist`(list) + `main`(keyed) + `ctx.layout.selectPanel(id)` | `@deepseek-ai/dsh-client-ui-sidebar@0.1.7-rc.1`、`@deepseek-ai/dsh-client-ui-layout@0.1.7-rc.1` |

⚠️ 注意：`@deepseek-ai/*` 的 npm `latest` tag 指向旧版（如 sidebar 的 latest=`0.0.1-rc.1`），**必须按 dsh 版本线取**（`0.1.7-rc.1`）。

### 原生整页机制（要抄的正路，优于参考插件的 DOM 注入）

参考插件 `@linxin666/dsh-client-ui-task-board` 走的是 **DOM 注入**（`sidebar-entry-core.ts` 往侧栏插 `<button>`、`panel-mount-core.ts` 往中栏 `[class*="centerCol"]` 挂 React root + `<html data-*>` 切换），它自己的注释称「外部插件无槽可用」——但实测 rc.1 **有原生槽**，故本插件走原生，不抄 DOM 注入：

- `main`（`kind:"keyed"`, root）：`renderSlot("main", {}, { entryKey: activePanelId ?? "conversation" })` ⇒ 注册 `{ name:"main", key:<PanelId>, locale }`，选中即整页替换会话区。

- `sidebar.panellist`（`kind:"list"`, root）：条目 `{ name:"sidebar.panellist", id:<PanelId>, order, label:()=>..., locale }`，**组件只画图标**（收到 `{ size, active }`）；行按钮由侧栏渲染，点击由侧栏调 `ctx.layout.selectPanel(id)`，**激活态由布局服务 `activePanelId` 自动管理**（`panelActive` class + `aria-current`）。

- 「返回会话」= `ctx.layout.selectPanel(null)`（`@deepseek-ai/dsh-client-ui-layout` 的 `layout` 服务）。

⇒ 得到的样式与「插件」完全一致（原生行、原生 hover/激活态），无需自绘、无需 MutationObserver 自愈。

### 实施步骤

1. **入口迁移**：删掉 `sidebar.footer.action` 注册；新增 `sidebar.panellist` 注册（`id` = 面板 id，`order` 取 30 避开「插件」，`label` 用 locale）。

2. **整页化**：新增 `main` keyed 注册承载页面；页面顶部放「返回会话」调用 `ctx.layout.selectPanel(null)`；把现有 `DispatcherModal` 的**内层布局原样**搬进页面（不弹窗、无遮罩）。界面细节待功能全通后再调（用户明确）。

3. **rc.1 settings 迁移**（入口/页面之后做）：

   - 宿主：去掉 `ctx.settings.register`，改由插件 Config schema 自动投影；`debugSnapshot` 写入通道改为 rc.1 等价面（待核 `configForms`/`describe` 写路径）。

   - 客户端：`settingsScope.bind({namespace})` → `configForms.get(<profile entry id>)`（entry id 需按 profile 实际行 id 解析，参考插件 `servedEntryId()` 的兜底策略）。

4. **依赖声明**：`package.json` 的 `dsh.client.inject` 需补 `@deepseek-ai/dsh-client-ui-layout`（`main`/`layout` 提供方）；并按 rc.1 版本线校正其余项。

### 验收

- 侧栏顶部出现「任务调度表」行（与「插件」同风格）；点击 → 激活态 + 中栏整页；点「返回会话」→ 激活态消失、回到会话。

- 页面内数据（任务 / 实例 / 事件）在 settings 迁移完成后恢复正常。

## 2026-09-24 — 入口迁到 `sidebar.panellist` + 面板整页化（不再弹窗）落码

按用户拍板（照 `@linxin666/dsh-client-ui-task-board` 的交互逻辑）改走 **rc.1 原生「主面板」机制**（优于参考插件的 DOM 注入）：① `sidebar.panellist`(list/root) 注册条目 `{id:PANEL_ID, order:30, label:()=>runtimeT("panelTitle")}`，组件 `TaskPanelIcon` **只画图标**——行按钮/点击（侧栏调 `ctx.layout.selectPanel(id)`）/激活态全由侧栏+布局服务托管，与「插件」行同款；② `main`(keyed/root) 注册 `{key:PANEL_ID}` 承载整页 `TaskPageHost`（作用域未就位给占位页），`守selectPanel(null)` = 返回会话；③ 删掉 `sidebar.footer.action` 注册与 `TaskTrayButton*`/`useTaskPanel`/`trayButtonStyle`/`CloseIcon`/`PageProps` 等旧件，`DispatcherModal`→`TaskPage`（去遮罩/关闭叉，页头加「← 返回会话」）；④ 设置卡片改为 `open:()=>selectPanel(PANEL_ID)`；⑤ `package.json` 补 `dsh-client-ui-layout`/`dsh-client-ui-sidebar` 依赖，冒烟扩到 55 项。`npm run build` + 冒烟 55 项全过、dist 已更新。**未做**：rc.1 settings 迁移（`configForms`/`settingsSchema` + 宿主 Config 自动投影）——整页目前只显示占位（scope 取不到），故页面内数据仍空

## 2026-09-25 — rc.1 settings 迁移第一步：宿主不再因缺 register 整体不启动

——关键发现：rc.1 的 `settings` 服务（`@deepseek-ai/dsh-settings@0.1.7-rc.1` 的 `SettingsForms`）**没有 register，但有 `update(ns,patch,rev)` / `replace` / `mutate` / `write`**（`lib/index.js:470/479/488/501`），即命名空间仍可写。**此前更严重的问题**：宿主 apply 在无 register 时整体 inert ⇒ **调度器根本没跑**（远重于页面空白）。修法 = 新增 `fallbackScope()`：无 register 时用启动配置合成同形作用域（get 返回启动配置、update 走 `settings.update`、watch 空实现），调度/派发/对账照常启动，并 warn 说明「运行期改配置需重启」。命名空间常量提为 `SETTINGS_NS`。构建 + 冒烟 55 项全过。**仍未完成**：客户端读取通道（`settingsScope` → `configForms.get(<profile entry id>)`），故整页仍是占位、无真数据

## 2026-09-25 — rc.1 settings 迁移完成（客户端读取通道）：整页有真数据

——客户端由 `settingsScope.bind({namespace})` 改为 rc.1 的 `ctx.configForms.get(<profile entry id>)`（`@deepseek-ai/dsh-client-ui-settings@0.1.7-rc.1` 的 `ConfigForm`：`getSnapshot/subscribe/mutate/set(field,value)/unset(field)`，快照含 `status/value/base/user/revision/writable`），新增 `configFormScope()` 适配器把它适配成本插件 `SettingsScope` 形状；entry id 按 `servedEntryId()` 从 `describe()` 已服务命名空间中挑候选（聚合行 id / 裸命名空间）。旧 `settingsScope` 保留为兜底，两套契约「先到先用」（`adoptScope` 不互相覆盖）+ 卡片只注册一条（`registerCard`）。**作用域改为可订阅**：新增 `subscribeScope/getScopeValue/adoptScope`，`TaskPageHost` 用 `useSyncExternalStore` 订阅，配置表单异步就位后**整页自动从占位切到真页面**。构建 + 冒烟 55 项全过、dist 已更新。**至此原功能应全部还原**：调度（宿主降级作用域）+ 整页任务配置 / 执行记录 / 查看会话

## 2026-09-25 — 修复真机白屏 + React #185 无限重渲染

整页（`main` 槽）点开一片黑并报 `Minified React error #185`（Maximum update depth exceeded）。根因 = 上一笔的 `configFormScope()` 里 `getSnapshot()` **每次调用都新建对象**，而 `useSyncExternalStore` 每次渲染都比对快照引用 ⇒ 判定「一直在变」⇒ 死循环（我们自己代码里本就写着「getSnapshot 必须返回稳定引用」）。修法：在适配器内按**底层 `form.getSnapshot()` 的引用**缓存映射结果，只在底层快照真变了才产出新对象（ConfigForm 文档明确「stable reference until the next change」）。构建 + 冒烟 55 项全过、dist 已更新

## 2026-09-25 — 修复整页「暂无快照」（空数据根因）：rc.1 运行时可写字段未标 volatile

——整页能渲染、作用域已就位，但 `debugSnapshot` 恒为空。真因：`@deepseek-ai/dsh-settings@0.1.7-rc.1` 的 `SettingsForms.write`（lib/index.js:501-507）要求字段在 Config schema 里是 **volatile**（运行时可写），否则抛 `Plugin entry has no volatile fields` 被我们的 `.catch` 静默吞掉 ⇒ 宿主 `settings.update(SETTINGS_NS,{debugSnapshot})` 永远写不进。① `src/config.ts`：把宿主会写的 `debugSnapshot`/`tasksInline` 与调度参数（tickMs 等）标 `.volatile()`（schemastery 3.18.2 无此方法，升到 `^3.18.4`，与 rc.1 线一致，参考插件即依赖 `^3.18.4`）；② volatile 字段解析结果是带 get() 的 `Volatile` 引用（非纯值），`apply` 改为用 `readConfigField` 解包得到真 `PluginConfig`（照参考插件 dsh-task-board）；老 `register` 路径 `Config` 做 `z_any<PluginConfig>` 转型；③ `package.json` 升 schemastery。`npm run build`（host/client）+ 冒烟 55 项全过、dist 已更新。**真机预期**：宿主每 tick 写 debugSnapshot 成功（容器日志出现「调试快照首次写入成功」），整页任务配置/执行记录有真数据

## 2026-09-25 (2) — 诊断推进：volatile 已通，但 entry 仍 unavailable——根因收敛到宿主 describe() 过滤

——修复 volatile 后客户端诊断变 `status=unavailable snapshotLen=0 keys=(value 未定义) writable=true`。读 st717/lib/client.js `ConfigFormController.derive()`(1227行)：当 `view.namespaces` 里找不到 `dsh-task-dispatch-table` 时即 `unavailable`；而 `view` 来自宿主 `remote.settings.describe()`（1469行）。读 set717/lib/index.js `describe()`(413-463)：entry 只在 `schema!==void0 && entry.fiber.state===2 && entry.fiber.runtime!==null` 时才进 `view`（417行）；`schema(entry)`=`entry.fiber.runtime.Config`（539行）。因 `Config` 已确认作为具名导出去了，`schema` 不应为 void0，故被过滤的元凶极可能是 **`fiber.state!==2` 或 `fiber.runtime===null`**——即 rc.1 的「宿主插件 config 是否经 settings.describe() 暴露给客户端」这一契约，疑似与参考插件 dsh-task-board（CLIENT 插件，其 Config 在 client bundle 故能被客户端 configForms 读）不同。已加**宿主侧真相诊断**：`writeSnapshot` 成功后打印 `ctx.settings.describe()` 暴露的命名空间清单与「含本插件」布尔。下一步：用户重装后看宿主容器日志 `[数据通道诊断-host]`，据此判定是「宿主未 expose（需重构数据通道，如改走 host 服务/RPC 或把 Config 移到 client entry）」还是「客户端 mirror 未加载」。构建 host/client 全过。

| 2026-09-25 (3) | **根因坐实 + 数据通道重构（宿主插件不能走 configForms）**——宿主日志报 `$.tickMs expected number but got [object Object]` + `1 entry did not activate`，证明 entry 根本没激活。读 set717/lib/index.js:417 与 types/index.js:368-380 确认：**configForms 的读写都要求字段 `volatile`（`isVolatilePath` 门槛），且 `describe()` 只投影 `volatileForm(schema)`（仅 volatile 字段才暴露给客户端）；但宿主 Loader 把 volatile 字段的默认按 `{}` 提交进 profile，重装后 `z.number()/z.string()` 校验失败 → entry 不激活**。即「宿主插件配置字段不能标 volatile」，而「非 volatile 字段客户端 configForms 看不到」——宿主运行时数据**完全不能走 configForms**。参考插件 `dsh-task-board` 是 **client 插件**，其 volatile 走 client loader（按 plain 提交、经 `ctx.get(

emote')` 调宿主服务），故能跑。修复：① `config.ts` 去掉全部 `.volatile()`，Config 全静态；② 宿主 `index.ts` 新增内存 store + `ctx.set('taskDispatchTable', {getSnapshot,getTasksInline,setTasksInline})` 暴露快照/任务表，`writeSnapshot` 写内存、`ensureInlineIds` 写内存并经 `configEditor.edit` 持久化任务表；③ 客户端 `index.ts` 新增 `remoteScope` 适配器（2s 轮询）+ `remote`/`taskDispatchTable` 双寻址注入，取代 `configForms.get(ns)`。两种寻址都试（直名 `taskDispatchTable` 与 `remote.taskDispatchTable`）以容错。构建 host/client 全过；客户端 `tsconfig.client.json` 加 DOM 库（setInterval）。待用户重装验证：宿主日志应见 `[数据通道] 宿主快照服务 taskDispatchTable 已注册`，客户端诊断应显示 `status=ready note=已绑定 taskDispatchTable...`，且快照随 tick 刷新。 |

## 2026-09-25 (3) — 修复客户端 remote 通道硬依赖 bug

——宿主日志证实 01:31 起插件已正常激活（无 ValidationError / did not activate），只剩画面 unavailable。根因：客户端 `ctx.inject(['slots', 'remote', 'taskDispatchTable'], ...)` 把 `taskDispatchTable` 列为硬依赖，而它是宿主经 remote 暴露的服务、客户端本地不存在该服务名，cordis 等不到注入导致回调永不触发，画面只剩 configForms 的 unavailable。修复：inject 只依赖 `['slots','remote']`，`remoteScope` 改收 `getService` 惰性获取（直名与 remote.taskDispatchTable 都试），2s 轮询直到服务就绪即接管；adoptScope 优先级保持 remote 覆盖 unavailable 的 configForms。构建全过。下一步：重装后看页面诊断是否变 `status=ready note=已绑定 taskDispatchTable`；若一直 loading，则需查宿主日志 `[数据通道]` 行确认 ctx.set 是否注册成功。

## 2026-09-25 (4) — 数据通道推倒重做：改走 webServer HTTP 路由（照抄参考插件已验证模式）

——重查参考插件 dsh-task-board 源码发现此前误判：它根本不用 remote 服务/ctx.set 注册自定义服务，其数据通道是 `inject: ['webServer']` + `ctx.webServer.register(route)` 注册 `GET /api/task-board/state`（host-routes.ts:152-158，WebRoute 形状 kind:"exact"+path+handler(req,res)），客户端同源 `fetch("api/task-board/state")` 轮询（client/host-api.ts:127）。据此：宿主加 `makeDispatchRoutes()`（GET /api/task-dispatch-table/snapshot 读快照、POST /api/task-dispatch-table/tasks 保存任务表，带同源/loopback 守卫与 1MB body 限制），runtime store 提升到 apply 作用域；客户端删掉 remote 通道，`httpScope()` 每 2s 同源 fetch 轮询、诊断行实时显示 HTTP 状态（403/404/fetch 失败都可见）。构建全过。下一步：重装后诊断应为 `status=ready note=HTTP api/task-dispatch-table/snapshot`；若 `HTTP 404` 查宿主日志 `[数据通道] webServer 路由已注册`；若 403 查同源守卫。

## 2026-09-25 (5) — 今日收尾（用户暂停，明日开新会话）

——01:49 重装宿主日志干净（无 ValidationError / `did not activate`）⇒ volatile 去除 + `{}` 剥离修复已真机生效，宿主 entry 正常激活。页面「数据通道诊断」行本次未贴出，HTTP 通道（`8f6a93a`：宿主 webServer 路由 + 客户端同源 fetch 轮询）真机表现**未验证**——这是明日第一件事，判读表见「六、下一步」第 0 条。今日排障方法论教训已沉淀：① 改通道前先重读参考插件源码确认其真实机制（本日「remote 代理可调宿主自定义服务」即为误判，实际参考插件走 webServer HTTP）；② 客户端 inject 硬依赖宿主侧服务名会让回调永不触发且无任何报错，诊断必须能区分「回调没触发」与「回调触发了但取不到值」；③ 涉及未决项/页面显示的每次重装都要带回诊断输出，否则一轮白装。

## 2026-09-25 (6) — HTTP 通道三方源码核对完成（用户要求：先找明确问题再动代码）——代码与产物无可证缺陷，问题定性收窄到运行时四段，四条取证命令已写进「六、下一步」第 0 条

核对对象：官方 `dsh-host-webserver@0.1.7-rc.1` / `dsh-settings@0.1.7-rc.1` / `dsh-app-boot@0.1.7-rc.1` / `dsh-client-ui-settings@0.1.7-rc.1`（npm 拉取）+ 参考插件 `@linxin666/dsh-client-ui-task-board@0.4.2` 全源码 + 本插件 src 与 dist。结论：① 路由形状 `{kind:'exact',path,handler}` 与官方 `register()`（webserver lib/index.js:177-184）及参考插件 host-routes.ts:150-158 逐字段一致，exact 按 `new URL(req.url).pathname` 精确匹配；② `webserver` 在 dsh-app-boot `requiredStartupEntryIds`（lib/index.js:3821）必启清单 ⇒ `ctx.inject(['webServer'])` 必触发、必留日志；③ **宿主 webserver 层无任何鉴权中间件**，403 只能来自本插件自己的 `isTrustedDispatchRequest`；④ 未挂载路由由组合层 fallback 应答（参考插件 client 注释：纯文本 "not found"）；⑤ `describe()` 对无 volatile 字段的 entry 整体剔除（dsh-settings lib/types/index.js:277-279）⇒ configForms 必然 `unavailable`、客户端 adoptScope 必然让位 httpScope——**昨夜担心的双作用域竞态静态排除**；⑥ `dist/`（01:47, `8f6a93a`）确认含 HTTP 通道符号。头号嫌疑当时定为非 loopback 浏览路径被同源守卫 403（同源 GET 不带 Origin），修法方向：守卫补收 `sec-fetch-site: same-origin`（属安全策略放宽，需用户拍板）——**已被 (7) 证伪，无需改码**。

## 2026-09-25 (7) — 取证 ③ 真机结果：403 嫌疑证伪，HTTP 通道全链路可达

用户 Mac 上 curl 经真实入口（https 入口，nginx 反代）打 `/api/task-dispatch-table/snapshot`，**无 Origin 裸 GET 也返回 `HTTP 200 + Content-Type: application/json`**（带 Origin 对照同样 200）⇒ ① 守卫未拦（socket 到 webserver 是 loopback，nginx 与 webserver 同网络命名空间）；② 路由已注册且被 exact 命中（未挂载路径由 fallback 应答纯文本 "not found"，不可能是 application/json）；③ Mac→入口→webserver→插件路由整条链路通畅。

## 2026-09-25 (8) — 根因定位并修复：客户端作用域采纳竞态（昨晚 n 版全败的真凶）。此前 (6) 的「竞态静态排除」结论有误，在此更正

取证闭环：① wire 数据完好——curl 全量 body：outer `{ok,snapshot,tasksInline}`、inner `{at, tasks[], instances[10], events[74], warns[20]}`，`parseDebugSnapshot` 要件（instances/events 均为数组）全齐；② 浏览器 DevTools Network 实证 snapshot fetch **200 / 24.9 kB / 发起方 index.ts:813（本插件 httpScope 轮询）** ⇒ 宿主、路由、网络、客户端轮询全通，「没读到数据」与「403 守卫」双双证伪，页面不显示纯属客户端绑定错通道。**根因**：客户端 apply 中 configForms 块（src/client/index.ts:954）先于 httpScope 块注册；真机上 slots 与 configForms 同时就绪 ⇒ 回调按注册序同步执行：configFormScope 先被 adopt，此刻 ConfigForm（host 持久化）**初始 status='loading'**（dsh-client-ui-settings lib/client.js:1118 `persistence==="host"?"loading":"unavailable"`），而 adoptScope 只在 current==='unavailable' 时让位 ⇒ 轮到 httpScope 时被**永久拒绝**。poll 是 scope 自带 setInterval，被拒也照跑 ⇒ 出现「Network 200/24.9kB + 诊断行 ready/24kB + 页面永远暂无快照」的撕裂。(6) 静态排除错在只看了 derive 终态（unavailable）、漏了初始态（loading）。**修复**：httpScope 块改**无条件接管**（`currentScope = httpScope(); afterAdopt()`，src/client/index.ts:979-983）；rc.1 上 HTTP 是唯一能出数据的通道（宿主无 volatile ⇒ configForms 必然 unavailable；settingsScope 仅 0.1.6 存在且宿主已不写 settings 数据），接管无副作用；adoptScope 注释同步更正。构建 + 冒烟 55 项全过。**方法论教训**：① 诊断行被未采纳的 poll 每 2s 覆盖，显示值与实际绑定通道脱钩——诊断必须反映「当前生效通道」；② 「Network 有请求」≠「请求方已被采纳」，验证作用域要盯渲染输入而非网络活动；③ 采纳/让位逻辑要看服务的**初始态**而非只有终态。

