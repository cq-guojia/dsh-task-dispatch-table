# 执行记录「查看会话」三部曲（决策 27 → 28 → 29）

> 时间范围：2026-09-24 · **状态：✅ 完成封卷**（本文件是该工作包完成时的快照记录，不再更新）。
> 
> 决策 27（sessions.open 链接）真机证伪 → 28（面板内自绘只读弹窗，落码 53 项冒烟）→ 29（渲染层复用官方 ChatView，方案拍板暂不动工）。
>
> 定型结论见 [`design/decisions.md`](../design/decisions.md)；设计与事实清单见 [`design/`](../design/)。本文只保留过程叙事：踩坑、定位、修复与真机证据。

## 2026-09-24 — 决策 27：执行记录「查看会话」链接（打开归档会话）

——用户想从面板直接看某次执行的会话实况。经查 `@deepseek-ai/dsh-api-session-controller/client` 的 `ClientSessions.open(id)`（兄弟插件 dsh-session-title-pattern 同款注入：`ctx.inject(['sessions'], ...)` 拿服务）：`open(id)` 把该会话选为「当前」⇒ 宿主原生会话视图打开；**归档会话仍留在宿主会话列表**（`archiveSession` 只追加 `archivedSessionIds`、不动列表），一样能定位。**实现**：client 在 `apply` 里注入 `sessions` 服务、捕获 `open` 封成 `openSession` 透传给面板；执行记录页两处放链接——「会话」列（截断 id 做可点链接，点一下 `stopPropagation` 避免触发整行展开）+ 展开事件时间线标题右侧（「↗ 查看会话」），都调 `sessions.open(fullSessionId)`。服务不可用时链接不渲染、不报错、不阻断。构建通过、冒烟 47 项仍全过。两点边界（用户原问「能否继续对话 / 能否屏蔽技术规划」）：① **能否继续对话由宿主决定**——归档会话的 scope 在离开列表时冻结为只读视图，本插件只负责打开、不控制其内部读写；② **「技术规划」是 agent 自己生成的对话内容、由宿主会话视图渲染，插件无法从外部隐藏**——若要「只读 + 过滤技术规划」得另做嵌入式只读视图（会失去继续对话能力），留待用户拍板

## 2026-09-24 — 决策 27 真机反馈 + 拍板决策 28（本次只更新文档、不动代码）

——用户真机点「查看会话」：**点不开**，主页面切到会话后**掉回「新建会话」页**（用户怀疑 sessionId 或归档所致）。据此查官方产物源码，查清两件事：① **归档会话被宿主从显示面隐藏**——`dsh-workspace` 的 `archivedSessionIds` 原文「sessions hidden from every grouping surface」，且只有 `archiveSession`、**无 unarchive**（`lib/types/spec.d.ts:27-29`、`lib/types/index.d.ts:116,124`）⇒ `sessions.open(id)` 选了也显示不出来，**不是 id 错、也不是插件问题**；② **官方对话渲染分两半**——`dsh-client-ui-conversation` 导出组装/解析层（`ctx.uiConversation`、`ConversationNode` 节点族）但**不导出画 UI 的组件**，对话外壳挂在根级 `main.conversation`、只渲染「当前会话」⇒ 第三方**只能「官方解析 + 自绘画面」**。另发现我方 client `dsh.client.inject` **漏声明会话相关包**（兄弟插件有 `dsh-api-remotes` / `dsh-client-ui-conversation` / `dsh-client-ui-session`）⇒ 决策 27 的链接很可能**根本没渲染**（与「点不了」吻合）。**用户拍板**：接受「面板内只读弹窗 + 自绘简化渲染 + 只读不可续聊 + 有漂移但可控、有 fallback」，记为**决策 28**；**本次只更文档**，新会话接手落码（先补 client 依赖 + 真机验 `sessions.binding` 对归档会话是否可用，再定走官方组装还是冷读日志）。文档同步：decisions（27 标失效 + 新增 28）、本文件抬头 / 状态表（27 标失效、新增 28 行）/ 能力表（新增「会话历史冷读 / 归档语义 / 对话渲染分层」三行）/ 下一步（新增第 3 条为下一步重点）/ 日志

## 2026-09-24 — 决策 28 落码：面板内只读会话弹窗（P0，用户要求「认真读官方文档及源文件，不要凭经验瞎写」）

——逐环节核实 0.1.5-rc.2 产物 + 0.1.6 dsh-source，两处修正了原计划的想当然：① **inject 清单不能照抄兄弟插件**——查装配源码（`packages/client/modules/src/client/system.ts:207`：inject 包先于消费者 arrive；`manifest.ts:46-48`：「`inject` names package rows whose factories must arrive before this row materializes, while Cordis separately uses the same package edges to compose entries」），兄弟插件的 `api-remotes` / `ui-session` 是**它自己 remote.\*** 消费面；我们按**服务提供方**声明：`sessions` ← `@deepseek-ai/dsh-api-session-controller`（lib/client.js:3087 provide）、`uiConversation` ← `@deepseek-ai/dsh-client-ui-conversation`（lib/client.js:16522 起组装）。② **数据链核实**——`binding()` 只物化句柄不拉数据（manager.get() 物化时 eventSource 为空）⇒ 数据闸门 = 运行时探测调 `session.open()`（幂等拉尾页；不在 SessionFace 类型上）；渲染走 `target('chat')` 快照的 `legacy.nodes`（官方兼容投影）；「加载更早」走公开动词 `loadOlder()`。**实现**：新增 `src/client/session-view.ts`（本地结构化类型 + `openSessionView` 数据闸门 + `SessionViewModal`：user/steering/assistant 气泡、tool-result/command 卡、turn-error/turn-max-tokens/model-retry 提示行；过滤 reasoning/context/unknown/compaction；未知 kind fallback 折叠 JSON；点遮罩 / 关闭按钮关闭，z-index 1010 叠主面板之上、Fragment 兄弟子树防遮罩误关）；`index.ts` 决策 27 的 openSession 语义整体换成 viewSession（两处入口 + viewing 状态）；locales 补 10 键双语；smoke 新增 [8] client 产物检查组（tsdown 产物未混淆，按符号名断言 + inject 清单断言）。**构建通过、冒烟 53 项全过**，dist 已随构建更新。**待真机验证**：归档会话 binding 可用性 + 弹窗渲染；若 binding 不可用退冷读 `session/follow` + `session/page`（未启用）

## 2026-09-24 — 决策 29 拍板：会话弹窗渲染层复用官方 ChatView（本次只更新文档、不动代码）

——用户真机看决策 28 自绘弹窗：功能正常但界面与官方会话差距大（无 markdown、无深度思考收起、工具卡简陋），要求「完整套用官方样式、不手搓」，并追问「官方归档会话也没有展示界面吗？必须取消归档才能看？」。逐一查证：① **官方确实无归档会话查看界面**——归档设置页 `ArchivedSessionsSection.tsx` 每行只有「恢复」按钮；主视图导航器 `navigation.ts:287` `clearArchivedCurrent()` 在任何列表变化时主动清掉主视图里的归档会话引用（官方明确策略，非能力缺失）；② **修正决策 28 一处事实错误**：`@deepseek-ai/dsh-workspace` 并非「无 unarchive」——`api/workspace-controller/src/commands.ts:171` 有 `unarchiveSession`（host+remote 双通道，官方归档设置页就在用），但用户拍板**不走取消归档路线**；③ **深挖官方渲染引擎**（`ui-renderer/src/client/scoped-slots.tsx` 1325 行全文）找到正路：ChatView 等组件确实不导出，但引擎组装 entry 的积木全部公开（`useHost`/`useRootBinding`/`observableHook`/`ScopeBindingProvider` + host API `entriesOf`/`storeOf`/`scope('session')`/`locale` + `uiSession.adapter.bindingSource` + `sessions.retain` ISessions 契约方法）——**落码 = 复刻引擎 SessionEntry 装配逻辑 ~50 行胶水，在自家弹窗挂官方 ChatView 本体**，非拼内部 props 猜行为；已否决：手工拼 ChatViewSlotProps（内部契约碎）、unarchive+官方会话区（用户否）、继续自绘。**用户拍板「先记录方案、暂不动工」**，记为决策 29；文档同步：decisions（28 标注被修订 + 新增 29）、本文件状态表（28 行标注 + 新增 29 行）/ 能力表（归档语义、对话渲染分层两行修正）/ 下一步（新增 3.5）/ 日志

## 2026-09-26 — 「查看会话」点了没反应：根因定位与修复（走完十几轮弯路后的教训）

——**症状**：执行记录点「↗ 查看会话」毫无反应、无报错。**根因（读官方源码才定位）**：`@deepseek-ai/dsh-api-session-controller@0.1.7-rc.2` `lib/client.js:3406` —— `binding(id) { return this.scopes.get(id)?.binding }`，**只查已物化的 scope、从不创建**；归档 / 久未打开的会话没有 scope ⇒ 返回 `undefined` ⇒ `@deepseek-ai/dsh-client-ui-conversation` `lib/client.js:3083` 的 `if (this.sessions.binding(sessionId) !== owner) throw new Error('inactive session ...')` 直接抛出 ⇒ `openSessionView` 静默 `return null` ⇒ 界面无反应。**正解**：查看前 `sessions.retain(id, { source })` ⇒ `retainScope`（3409）→ `materializeScope`（3472）物化 scope，且内部触发 `manager.get(id).open()` 拉历史尾页；返回引用在使用结束（弹窗关闭）时 `release()`。**修复**：`session-view.ts` 在 `binding` 前 retain 并持有引用，`SessionViewTarget` 增 `dispose()`，`index.ts` 弹窗关闭时调用；原「反归档后查看」降级为兜底（且只有真反归档过才在关闭时归档回去）。真机验证：**弹窗弹出并显示对话内容**，冒烟 93 项全过，push `fcabf8b`。

**教训（已写入 AGENTS.md 第 4 条）**：本次在「猜 API」上耗掉十几轮——先后误判为「归档屏蔽」「`$stream` 冷读」「`projectionStores`」「反归档可恢复」，还两次埋大规模探针刷日志（其中一次因 `getSnapshot` 每次返回新对象触发 React #185 无限更新、面板黑屏）。**正确姿势只有一条：先查 `dsh-capabilities.md`，再 `npm pack @deepseek-ai/<包>@<宿主版本>` 把源码下下来读到实现本体**（方法签名 / 判空 / 抛错分支），报错栈的 `client.js:行号` 就是精确坐标。

**顺带证伪**：T1 曾判「决策 29 的 ChatView 挂载在 0.1.7-RC.2 不可行（`retain` / `bindingSource` 不存在）」——该结论是在**未 retain** 的前提下得出的；`retain` 经源码确认存在（`client.js:3194`），故决策 29 路线需按源码重评（→ 里程碑 15：外观对齐官方）。

## 2026-09-27 — 里程碑 16：官方 keyed 节点流 + 折叠关系照抄 + 弹窗外壳改宿主惯例（决策 36）

——用户拿两张官方截图逐项对照：① 官方「左下角弹窗」的关闭钮是**裸的黑叉**（无方框），弹窗宽度也没那么宽；② 官方会话区**左右有间距**（我们几乎为 0）；③ 要求**先抄官方的折叠关系**，再看折叠后露出来的样式，把两张图做成一模一样。全程先读源码再动手（AGENTS.md 第 4 条），本轮零真机试错。

**源码核实（0.1.7-rc.2）**：
- 官方 ChatView 真正渲染的是 **keyed 节点流**（快照 `order + nodes`，`ChatNodeStore.get/processSource`），不是我们一直用的 `legacy.nodes` 兼容投影——turn-trigger / turn-process / assistant-step / tool-call / turn-tail 都只在 keyed 流里，**turn 位置（`location.turn.start/end`）与用量（`turn-tail.data.tokenUsage`）也只在 keyed 流里有** ⇒ 此前「缺 turn 起止时间 / 缺 usage」两条数据缺口直接消解。
- 折叠判定本体 = `ChatNodeSeat.tsx`（`lib/client.js:1668-1771`）：`TURN_PROCESS_INDEPENDENT_KINDS`（1525）、`turnProcessAlwaysOpen`（1558：live / aborted / error 恒开）、`processWindowReady / processMember / processAnswer / ownsDisclosure / foldable / controllerInactive / compactAnswer / processHidden` 全套布尔；折叠 = flowItem 的 `hidden` 属性。
- 「用时 34 秒 ⌄」行 = `TurnProcessNodeView`（6129-6196）；触发行 = `TurnTriggerNodeView`（6538-6605 的 `turnTriggerDetails` kind→图标/标题映射）；尾部操作行 = `TurnTailNodeView`（6460-6546，`hasAssistantReplyContent` / `assistantText`）；用量 pill = `TurnUsagePanel`（6378-6452）+ `statDialog`（6278-6350，PANEL_MARGIN 12 / GAP 8，定位直接复用 primitives 的 `useAnchoredPosition` / `useDismissOnOutsidePointer`）；文案与格式化 = `message-chrome.ts`（`用时 {duration}` / `深度求索中，用时{duration}` / `9月26日 01:35` / `91.5K tok`，逐字照抄）+ `token-format.ts`（`formatTokens` / `formatCacheHitPercent` 的 `roundedPercentUnits` 取整算法照抄）。

**落码**（mirror 文件名与官方组件一一对应，官方改哪个 diff 哪个）：
- 新增 `mirror/ChatNodeSeat.tsx`（折叠判定 + flowItem 属性）、`mirror/TurnTriggerNodeView.tsx`、`mirror/TurnTailNodeView.tsx`、`mirror/TurnUsagePanel.tsx`、`mirror/StatDialog.tsx`、`mirror/message-chrome.ts`（时长/时钟/token 格式化 + `{占位符}` 替换，宿主 t 不做插值则自己替换）；
- 重写 `mirror/TurnProcessNodeView.tsx`（官方「用时 N 秒」行，label/chevron/disabled/`data-open`）、`mirror/MessageIconActions.tsx`（官方操作行：复制 Tooltip + 1s 复位 + `writeClipboard`、分支只读态 `data-unavailable`、`data-clock`、endInfo）；
- `mirror/ChatView.tsx` 补官方 `ChatNodeList`（order→seat，grouped 分组项未实现走官方 order 兜底分支）与 toBottom 组件；`session-view.ts` 渲染主路换 keyed 流（`renderKeyedNode` 按 kind 分发），legacy 流降级为 order 缺失时的兜底；
- 外壳：`width:min(1120px,100vw-32px)`、`height:calc(100% - 80px)`、radius 12px（照宿主「左下角弹窗」卡片 dsh-context `.lc-ov-card`），弃 `min(1180px,94vw)×92vh`；内容列 = 官方上限 920px；会话区左右边距 = 官方 `ChatView.scroll` 的 `16px + --dsh-composer-side-clearance(16px)`（面板上补定义这两个变量）；关闭钮 = 官方 `IconCloseOutlineRegular` 16px 裸图标（hover 才出底色）；
- `react-dom` 在 PLATFORM_MODULES 里可 require，但仓库无 `@types/react-dom` ⇒ 新增 `src/client/react-dom.d.ts` 声明最小 `createPortal` 面（零新增依赖）；`primitives.d.ts` 补 Tooltip / `writeClipboard` / `useAnchoredPosition` / `useDismissOnOutsidePointer` / 触发行图标家族。

**防降级**：宿主 `processSource` / `get` 形态变化时按「不折叠 / 跳过该节点」处理，不让弹窗白屏；keyed 流缺失自动回退 legacy 渲染。

**验证**：`npm run typecheck` 通过、`npm run build` 通过（dist 128.6 kB，`react-dom` 走宿主模块表 require）、冒烟 100 项全过。**待真机**：折叠关系 / 触发行 / 尾部操作行 / 用量 pill 与官方截图逐项比对。

## 2026-09-27（第二轮）— 三级收折照抄 + 弹窗去续聊 + 内间距定尺（决策 37）

——用户拿官方四级截图（折到一级 / 二级 / 三级）核对收折，并拍板三件事：① 标题下加横线；② 内间距不按官方内容列宽算，弹窗宽度固定就直接给定尺内边距；③ **弹窗内不做续聊**——官方「分支」= 复制当前对话在新会话继续，正合「会话留档不可改、要聊就开分支」的定位 ⇒ 底部对话框占位与分支 icon 都移除，将来做「继续对话（开分支）」按钮（记 PROGRESS U10：确认框 → 关弹窗 → 跳新分支会话，依赖 `sessions.fork`，落码前先读源码）。另追问 token 数据来源——已答：**弹窗用量取自官方 keyed 流 `turn-tail.data.tokenUsage`（官方会话数据本体，与官方界面同源）**，非插件记录、非模拟；与「执行记录」三列差异 = 后者从 session 事件流抽取（U8 待真机确认字段），两条链路口径不同。用户重申**正常功能禁止模拟数据** ⇒ 升格为 AGENTS.md 第 5 条。

**三级收折源码核实（0.1.7-rc.2）**：
- 分组算法 = chat 包 `conversation-nodes/process-groups.js`（10563-10772）：每 turn 内，INDEPENDENT kind（user/steering/turn-trigger/model-retry/turn-error/turn-max-tokens/turn-tail）先闭合当前组再独立成条目；turn-process 独立成条目（不闭合组）；assistant-step 有 reasoning 块 ⇒ 以 `groupPart:'reasoning'` 入组、有回复内容 ⇒ 先闭合组再以 `groupPart:'response'` 独立成条目；其余 kind（tool-call 等）入组。组键 = `["process", 首成员 key, groupPart]`。
- 汇总文案 = `processActivity`（10527：按 tool-call 的 `activity(name)` 分类统计，含 `subCalls` 递归 + callId 去重，按次数排序）+ `processTitle`（1820：前 3 类拼接，2 类走「{first}并{second}」且共享「已」前缀时去前缀，≥3 类用「，」连接、超 3 类补「等」）。
- 组容器 = `ChatGroupSeat`（2178-2385）：标题 button（activity 图标与箭头同位叠放，hover / 展开时 opacity 互换，展开补 `padding-bottom:16px`）+ body（`max-height:min(400px,50vh)` + 上下 24px 渐隐 mask + `--dsh-chat-flow-gap:8px`）+ 组内条目（ChatNodeSeat 逐个、三级各自展开）。组的外层可见性 = 官方同款 `outerHidden`（一级行收起 ⇒ 整组 hidden）；历史轮才收折（`stepGrouping === 'history' && turn 非 open`），live turn 走 `expandedBody` 不限高。
- **为什么移植而不是调 API**：官方 `views.grouped('chat')` 读取器挂在内部 assembler（`BoundConversation.viewStore`）上，公开契约 `ConversationBinding`（uic conversation/assembly.d.ts:15-35）只暴露 snapshot / openTurn / activate / target ⇒ 按决策 34 ④「不依赖宿主内部符号」，`mirror/process-groups.ts` 逐行移植，输入只用契约面数据（order + nodes + timeline.turns）。
- 工具行标题 = ui-conversation 的 `tool.title.*` 本地化字典（写入/读取/运行命令/搜索文件内容…），未收录走 generic「工具调用」且摘要补 `name ·` 前缀（对齐官方截图「工具调用 · task_dispatch_table_receipt · 已记录…」）。

**落码**：新增 `mirror/process-groups.ts`（算法移植）+ `mirror/ChatGroupSeat.tsx`（二级收折容器，body 渐隐边缘用 onScroll 自测）；`mirror/ChatView.ChatNodeListMirror` 增 entries/groups 路径（组条目 → ChatGroupSeatMirror，成员带 groupPart 渲染）；`renderKeyedNode` 支持 groupPart（'reasoning' 只渲染思考块、'response' 只渲染回复正文）；`GenericCommandCard` 接 `tool.title.*`；CSS 增 `.dsh-tdt-sv-group*`（照抄 ChatGroupSeat.module.css）、标题横线、内间距定尺（`--dsh-composer-side-clearance:8px` ⇒ 左右各 24px、`--dsh-chat-content-width:100%`），删除 composer 样式；`mirror/Composer.tsx` 删除。

**验证**：typecheck + build（dist 148.96 kB）+ 冒烟 100 项全过；产物抽查 `data-step-process` / `buildProcessGroups` 在 bundle。**待真机**：按用户四级截图逐级比对（一级用时行 → 二级汇总行 → 三级条目展开）。

## 2026-09-27（第三轮）— 真机反馈三连修：编辑/写入×2、「思考过程·」漏出、思考行文案（决策 37 补）

——用户四级截图反馈：① 我们把「编辑 / 写入」画了两遍；② 收起状态下漏出一行「思考过程·」（官方没有这行字）；③ 官方思考行标题是「思考」，不是「思考过程」；并确认理解：「修改了文件，已写入文件，已调用工具」= 整个思考+工具过程的汇总行，所有过程条目都应收在它里面（我们的分组语义没错，错在渲染漏了）。

**定位方式**：不猜。把分组算法（process-groups.ts）与整条渲染路径（ChatNodeListMirror + ChatNodeSeatMirror + ChatGroupSeatMirror）在本地用 react/react-dom + primitives 桩渲染成 HTML 复现（`tsc` 编 CJS + `NODE_PATH`），发现分组算法切分**正确**（每组条目不重复），问题全在渲染层：

1. **根因（重复 ×2）**：`ChatNodeSeatMirror` 调 `renderNode(node, turnProcess)` **漏传 `groupPart`** ⇒ 「回复正文」条目把整步块全画出来；而 assistant 步的 blocks 里带 `tool-call` 块 ⇒ `assistantBlocks` 又为它们各画一张工具卡 ⇒ 与独立 `tool-call` 节点**重复**。官方块渲染器（`lib/client.js:5864`）对步内工具块是 **`case "tool-call": break`（永不渲染）**——工具调用只由独立节点画。修：seat 下发 groupPart + `assistantBlocks` 跳过 tool-call 块 + 步渲染按官方 5818-5871 重写（`groupPart 'reasoning'` 只画思考块 / `'response'` 跳过思考块 / 整步只有工具块 ⇒ 整步 null）。
2. **根因（「思考过程·」漏出）**：同上——groupPart 漏传让思考块在回复条目里也画了。修后回复条目只有正文。
3. **思考行照官方重写**（`ReasoningRow.tsx`，官方 5718-5778）：`root[data-variant=think][data-state=running|ok][data-expanded][data-preview]` + DisclosureRow（`IconThinkOutlineRegular` 14px，**`title = t("message.think") = 「思考」`**，collapsedContent = separator(2×2px)+首行预览去 `**`，content = thinkBody 的 `MarkdownText compact`）；兜底 CSS 换官方真值（折叠固定行高 24px+delta、无边框行式，弃旧的有边框盒子）；顺手修掉旧实现「先 return 后 useState」的 hooks 违规。locale 新增 `thinkLabel`（思考/Think），删除已无使用方的 `sessionReasoning`。

**验证手段沉淀**：本地用 `tsc` 把 mirror 编成 CJS + `react-dom/server` 的 `renderToString` + primitives 桩，可在无宿主环境复现整条渲染结构（本轮用一次即中）；复现完删除脚手架不入库。冒烟新增 3 条回归断言（groupPart 下发 / tool-call 块跳过 / thinkLabel），**103 项全过**；typecheck + build（dist 149.70 kB）通过。

## 2026-09-27（第四轮）— 工具行图标 + 编辑/写入 diff 面 + 思考展开黑带 + 输入/输出（决策 37 补）

——用户四张对照图：① 工具行前面的 icon 各不相同（编辑/写入=铅笔、工具调用=另一种），我们全是 `#`（IconCode）；② 官方编辑/写入展开是 **diff 块**（红 - 绿 +）与「代码块」卡，我们是纯文本；③ 思考一点开出现一条更黑的带，官方没有；④ 工具调用官方展开是 **输入 / 输出** 两行。

**源码事实**：
- **diff 数据不在参数里，在结果 meta**：`@deepseek-ai/dsh-tool-fs@0.1.7-rc.2`（npm pack 下载读实现）——`computeHunkDiffs`（lib/index.js:408-452）把变更切成 `FileDiff{path, oldText: string|null, newText}[]` 写进**工具结果 `meta.diffs`**；`ToolResultNode.meta?: unknown`（uic records.d.ts:173）随 keyed 流透传 ⇒ 卡片从 `meta.diffs` 取，meta 形态异常按官方 `diffsFromMeta` 的防御收窄回退（不抛）。
- 渲染面 = primitives 导出的 `DiffBlock`（hunks + labels）与 `diffTotals`（摘要的 `+N -M`）；官方截图摘要「写入 · 路径 +1 -0」即 `diffTotals`。
- **黑带根因**：官方 `ReasoningRow.module.css` 展开行是 `position:sticky; background:var(--dsw-alias-bg-base)`——官方 chat 页底色就是 bg-base，行底色与页面同色故不可见；我们面板用了 `--dsw-alias-bg-layer-1`（比 bg-base 浅）⇒ 展开时露出一条更黑的带。修 = 面板底色改 `--dsw-alias-bg-base`（官方会话面）。
- 工具行图标同源 `PROCESS_ICONS`（按 activity：edit/write=IconEditOutlineRegular、tools=IconSparkleRegular、commands=IconApiOutlineRegular…），我们原来全用 IconCode。

**落码**：`GenericCommandCard` 重构——icon 按 activity 取 `PROCESS_ICONS`（ChatGroupSeat 导出共享）；`meta.diffs` 有效 ⇒ 展开 = `DiffBlock`（红 - 绿 +）、摘要 = 路径 + `+N -M`；否则展开 = **输入（参数）/ 输出（结果）** 两行（新增 `toolInputLabel/toolOutputLabel` 文案，替换旧「参数：」）；diff 面文案照官方词典（`diff.collapseAria` 收起差异 / `diff.expandAria` 展开其余 N 行差异 / codeLabel「代码块」）。`session-view.toolCallCard` 透传 `root.meta`；`primitives.d.ts` 补 `DiffBlock`/`diffTotals` 面。

**验证**：typecheck + build（dist 152.21 kB，`DiffBlock`/`diffTotals` 保留为宿主模块表 require）+ 冒烟 103 项全过。**待真机**：编辑/写入展开的 diff 形态、思考展开无黑带、工具行图标。

## 2026-09-27（第五轮）— 工具展开体格式修正（输入/输出行 + diff 通到左缘 + 预览省略号）

——用户三张对照图：① 官方「工具调用」展开 = **输入 / 输出** 两行（行间分隔线、参数 JSON 缩进两格），我们原来塞在一个 pre 里且 JSON 没美化；② 官方 diff 的红/绿色条**通到块最左缘**，我们缩进一截；③ 思考折叠预览截断要省略号，不能硬切。

**根因**：
- ② = 我们把 DiffBlock 套进了官方 `GenericCommandCard.body`（`._5OnbHa_body`：边框 + radius + `margin:4px 0 4px 4px` + `padding:12px 16px` 的 `<pre>` 代码块样式）——那个类是给「无 diff 工具的文本展开体」用的，官方 diff 面是**裸放**的 ⇒ 色条被 padding 顶进一截。修 = DiffBlock 不再套 body 类。
- ① = 无 diff 工具的展开体照官方重排：`输入`（参数，可解析则 `JSON.stringify(·, null, 2)` 缩进两格）/ `输出`（结果文本）两行，行间 `.5px` 分隔线（`.dsh-tdt-sv-io*` 兜底样式；官方卡片样式在 ui-conversation，取其结构）。
- ③ = 官方思考预览是 **summary > summaryText 两层**（外层 nowrap 截断、内层 `text-overflow:ellipsis`），我们把文本直接放外层 ⇒ 硬切无省略号。修 = 补内层 span（官方 `summaryText` 类 + 兜底同值）。

**写入的说明（用户确认理解一致）**：写入与编辑走同一 DiffBlock 路径——写入 = 新建文件（`computeHunkDiffs` 以 before='' 计算 ⇒ `oldText: null` 全绿 `+`），没有「输出」行；编辑 = 删一行 + 加一行的红绿对比。均由 `meta.diffs` 驱动。

**验证**：typecheck + build（dist 153.64 kB）+ 冒烟 103 项全过。**待真机**：输入/输出行、diff 左缘、预览省略号。

## 2026-09-27（第六轮）— 写入参数侧兜底 + 摘要下划线路径 + 输入/输出对齐字号

——用户两图：写入应与编辑同款（标题「路径 +N -M」+「代码块」卡全绿新增，没有红/删除）；「输入/输出」后面的内容要照官方对齐与字号。

**源码事实（tool-fs lib/index.js:572）**：write 的 `presentationMeta` = `diffs: value.before === null ? [] : computeHunkDiffs(...)` —— **无观察快照（before === null）时 meta.diffs 为空数组**，官方此况从参数侧呈现 ⇒ 我们的 `diffsFromMeta` 对空数组返回 undefined 后落到「输入/输出」文本，与官方形态不符。
**修**：新增 `diffsFromArgs`（真实数据兜底，非模拟）：`write` ⇒ `{path: file_path, oldText: null, newText: content}`（全绿 +）；`edit/apply_patch` ⇒ `{oldText: old_string, newText: new_string}`（红绿对比）；解析失败回 undefined 仍走输入/输出。`diffs = diffsFromMeta(meta) ?? diffsFromArgs(...)`。
**摘要**：diff 卡摘要照官方 = **下划线文件路径** + ` +N -M`（text-underline-offset 2px）。
**输入/输出对齐**：照官方截图调字号与基线——标签 13px tertiary、内容 12px 等宽、两者行高同拍 20px、`align-items:baseline`；内容 `white-space:pre` + 横向滚动（保住 JSON 缩进列不被折行打歪）。

**验证**：typecheck + build（dist 151.5 kB）+ 冒烟 103 项全过。**待真机**：写入代码块、摘要下划线、输入/输出列对齐。

## 2026-09-27（第七轮·收尾）— 弹窗内边距四边等距 34px；里程碑 16 告一段落

——用户拍板：内边距上下（16px）与左右（24px）不等，**四边统一 34px**。
**实现（含一次返工）**：第一版把纵向 padding 加在面板上——但面板 padding 只会加在**标题栏外侧**，标题分割线与第一条消息之间仍是官方 scroll 固定的 16px（用户复测「上下还是 16」）。改法：面板纵向 padding 归零，纵向间距全部落在会话区——`mirror/ChatView.ChatViewFrame` 加稳定钩子类 `.dsh-tdt-sv-frame{padding:18px 0}` ⇒ 标题线下 16+18=**34**、底部 16+18=**34**；左右 = scroll `16 + clearance(18px)` = **34**；标题栏 padding 18px 34px 12px（文字与内容列左缘对齐）。官方类缺失的兜底 `.dsh-tdt-sv-body` 纵向同步改 16px。
typecheck + build + 冒烟 103 项全过（产物抽查 `dsh-tdt-sv-frame` / `padding:18px 34px 12px`）。

**里程碑 16 收尾快照**（本大项告一段落，后续开新会话解决其他问题）：
- 已落地：keyed 流主路 + 三级收折（用时行/过程分组/条目展开）、触发行、尾部操作行（复制/时钟/用量弹层）、思考行（官方 ReasoningRow）、工具行图标与 diff 面（DiffBlock + meta.diffs/参数兜底）、输入/输出行、弹窗外壳（1120×宿主惯例 + 官方裸叉 + bg-base + 四边 34px）。
- 清单遗留（下次会话候选）：`ReadBlock`（读取展开）、`TerminalBlock`（命令展开）、上下文注入行、工具卡错误红、重试行官方样式、fileMentions、用户消息操作行、`ChatGroupSeat` 分组视图细节、👍👎（feedback 插槽）。
- 新功能排期：U10「继续对话（开分支）」按钮（先读 `sessions.fork` 源码）。

## 2026-09-27（第八轮）— U10「继续对话（开分支）」落码（决策 38）

——用户拍板先做 U10，并给出交互硬要求：**不能点一下就直接开分支，必须先出确认框**（误点会多出一个会话还得删、整个窗口还跳出去了，很麻烦）；确认后再开新分支，开完自动跳到新分支的那个会话里去。

**源码核实（先读后动，AGENTS.md 第 4 条；0.1.7-rc.2）**：
- `sessions.fork` 在**公开契约** `ISessions`（contract/sessions.d.ts:124）：`fork(opts: { sessionId; atSeq?; increaseTitle? }): Promise<SessionId>`，实现体 client.js:3343。
- `atSeq` 省略 = 「最新已完成 turn 前缀」（commands.d.ts:36-37）⇒ 对归档/完结会话即**全量对话**；`increaseTitle: true` ⇒ 子会话标题递增 ` (1)`（increasedForkTitle，client.js:3066-3072；官方 fork 按钮同款 client.js:837-842）；失败抛 `SessionForkError`（带 rpcError.code/message，client.js:3034-3047）。
- 归档会话的 fork 子会话 = **独立会话**，不受归档只读闸门限制（archived-session-gate.d.ts:23-24）。
- **跳转动词**：0.1.7-rc.2 的 `ISessions` 已无 `open(id)`（注释「navigation belongs to view owners」）——决策 27 旧路不可走。改用官方导航服务 `uiWorkspace.openSession(id)`（`@deepseek-ai/dsh-client-ui-workspace@0.1.7-rc.2`，cordis Service 名 `'uiWorkspace'`；client.js:819 → replaceMain:968-991：官方自己 `retain('mainView')` + `selection.set` 持久化 + `selectPanel(null)`）——我方**绝不自己 retain 保留值**（决策 35 同源真机事故教训）。

**落码清单**：
- `package.json`：inject 清单补 `@deepseek-ai/dsh-client-ui-workspace`。
- `locales.ts`：双语 7 键（continueBranch / forkConfirmTitle / forkConfirmText / forkConfirmAccept / forkCancel / forkWorking / forkFailed）。
- `archive-session-css.ts`：头部按钮组 `.dsh-tdt-sv-headerbtns`、分支按钮 `.dsh-tdt-sv-branch`（含 ：disabled）、确认框遮罩 `.dsh-tdt-sv-confirm`（z-index 1030 > 弹窗 1010）+ 440px 卡片 + 主按钮（brand-primary 底白字）。
- `session-view.ts`：头部「继续对话」按钮（`canFork` = fork 与 openSession 两个动词都就位才渲染，服务缺失自动降级不出现）→ 确认框（标题/正文/取消/「开分支并跳转」主按钮）→ fork 在途双按钮 disabled 防双击；成功 = **先 `onClose()` 再 `openHostSession(child)`**——先关弹窗让 TaskPage 卸载时 dispose/release 源会话 scope，再跳官方会话区（顺序反了 retain 引用泄漏）；失败 = 留在确认框内显示 `SessionForkError` 原因不关弹窗；**aliveRef 守卫**：fork 在途用户手动关弹窗 ⇒ 放弃跳转，组件已卸载不再 setState。
- `index.ts`：apply 内 `ctx.inject(['sessions','uiConversation'])` 里 duck-typing 取 `sessions.fork`（包一层 `{sessionId, increaseTitle:true}` 调用，保持类型面收窄）；新增 `ctx.inject(['uiWorkspace'])` 取 `openSession`；经 TaskPageHost/TaskPage props 链透传给 SessionViewModal。
- 冒烟 +3：uiWorkspace inject 声明、bundle 含 `increaseTitle`、bundle 含 `forkConfirmText`。

**验证**：typecheck + build（dist 163.07 kB）+ 冒烟 **106 项全过**（原 103 + 3）。

**待真机**：① 确认框交互（防误点）② fork 成功跳转到新分支会话（标题 `(1)`）③ 源会话保持归档只读 ④ fork 失败提示文案。

## 2026-09-27（第九轮）— 确认框换官方 Modal + Button；头部钮规格对齐官方设置窗口

——真机反馈（附官方设置窗口截图）：① 头部两钮带图标没问题，但 hover 背景/大小要与官方设置窗口一模一样；② 确认框先找官方现成的，「能用现成的不要自己写」；③ **暗色主题下确认框主按钮白底白字看不见**（自绘 `[data-primary]` 写死 `--dsw-alias-brand-primary` + `color:#fff` 的锅——该变量不可靠）。

**源码事实（@deepseek-ai/dsh-client-ui-primitives@0.1.7-rc.2，公开导出，本地 pack 读实现本体）**：
- `Modal`（lib/index.js:5010）：body portal + mask（`--dsw-alias-bg-mask-1` + `--dsw-mask-blur`）+ 居中卡片（默认 380px、`--dsw-alias-bg-layer-2`、`--dsw-elevation-prominent`、radius-panel）；标准头 = title + **28×28 关闭钮**（radius-sm、透明底、hover `--dsw-alias-interactive-bg-hover`、icon 14px——即设置窗口关闭钮同源规格）；footer 插槽右对齐（gap 8、padding 0 24）；Escape / 遮罩点击 / 头部叉统一走 onClose（`useModalLayer` 管 focus 与还原）；root z-index 1000。
- `Button`（:3179）：variant `primary` = `--dsw-alias-button-primary-fill` 底 + `--dsw-alias-label-primary-foreground` 字（token 族驱动，**明暗自适应**），`outline` = 0.5px `--dsw-alias-border-l3`；size `sm` = 28px 高、12px 字、padding 0 10px；disabled opacity .4。
- `RiskConfirmation`（:5073）= Modal + footer 双 Button（outline 取消 / primary 确认）的官方先例——本场景无勾选门槛，直接 Modal + footer 同构组合，弃 RiskConfirmation 的 checkbox。

**落码**：确认框整段换 `h(Modal, { open: confirming, onClose: forking 时拦截, title: forkConfirmTitle, closeLabel: debugClose, description: forkConfirmText, className: 'dsh-tdt-sv-forkmodal' }, forkErr 行)` + footer 双 `Button`（outline 取消 / primary 确认，forking 双 disabled、确认钮文案切 forkWorking）；错误行移入 Modal body（`--dsw-alias-state-error-primary`）。自绘 `.dsh-tdt-sv-confirm*` 九条规则全删；头部关闭钮照 Modal.close 重写（28×28 / radius-sm / 去 hover 色变、icon 16→14）；分支钮照官方 outline `.sm` 重写（28 高 / radius-sm / 0.5px border-l3 / padding 0 10px / gap 4 / disabled opacity .4 not-allowed）；弹窗 overlay z-index 1010→1000（与官方 Modal 同层，确认框 portal 到 body 末尾后挂载居上）；`.dsh-tdt-sv-forkmodal{width:min(440px,100%)}`（RiskConfirmation 同款，后注入同特异性覆盖 .dialog 的 380px）。primitives.d.ts 补 `Button` / `Modal` 最小类型面（照官方 d.ts 复述，含 headless/closeLabel 判别联合）。冒烟 +1：确认框挂官方 Modal 断言。

**验证**：typecheck + build（dist 161.89 kB，较自绘版 −1.2 kB）+ 冒烟 **107 项全过**。

**待真机**：① 暗色主题下确认框主按钮可读（官方 primary token）② 确认框形态与官方设置弹窗一致 ③ 头部两钮 hover 背景与设置窗口一致 ④ fork 跳转四点同第八轮。

**第九轮追加（同日）——尾部操作行恒常显（用户拍板）**：官方尾部操作行（复制/用量/结束时钟）= 历史轮 hover 才显、最后一轮常显（`data-actions-reveal='always'|'hover'`）；用户拍板弹窗改为**每轮模型回复的操作行全部常显**（归档会话轮数少，不必悬停翻找）。落码：`TurnTailNodeViewMirror` 的 `data-actions-reveal` 恒 `'always'`，`endsWithResponse` prop 及调用链（session-view 的 `lastTurn` / `turnOrder` / `EMPTY_TURN_ORDER`）全链删除；`hasAssistantReplyContent` 保留导出（官方同构）。build（dist 161.14 kB）+ 冒烟 107 项全过。

## 2026-09-27（第十轮）— 消息行分支 icon 恢复 + atSeq 截断开分支

——真机验证通过（确认框官方化 / 头部钮规格 / 恒常显都没问题）。用户拍板：**把每轮回复操作行上的官方分支 icon 放回来**（决策 37 当时移除），点它 = 调起同一个确认框，确认后**从那条消息的位置截断开分支**（与官方 fork 逻辑一模一样，只是多了确认框）；右上角头部按钮 = 从最后一轮开分支（现状语义不变）。

**源码事实**：官方契约 `atSeq`（commands.d.ts:36-37）= 从指定消息 seq 截断的前缀；省略 = 最新已完成 turn 前缀。api-session-controller fork 实现体（client.js:3347）把 `atSeq` 原样透传 RPC（`SessionSeq(opts.atSeq)`）。mirror 的 `MessageIconActionsMirror` 当初已完整实现官方分支按钮（`onBranch` prop + 官方 Tooltip「在新对话中分支」文案），只是调用侧没传 ⇒ 接上即可。

**落码**：
- `TurnTailNodeViewMirror`：props 加 `onBranchAt?: (seq: number) => void`，传给 `MessageIconActionsMirror.onBranch`（`data.seq` = 该轮 tail 消息 seq）；不传 `branchUnavailable`（归档会话全是已完成轮次，官方禁用条件天然不触发）。
- `session-view.ts`：`confirming: boolean` 升级为 `forkTarget: { atSeq?: number } | null`——头部按钮 `setForkTarget({})`（省略 atSeq = 最后一轮）、消息行分支 `onBranchAt(seq) → setForkTarget({ atSeq: seq })`；`onForkAccept` 调 `forkSession(sessionId, forkTarget?.atSeq)`；取消/Escape/遮罩/叉复位 `setForkTarget(null)`。`renderKeyedNode` 加 `onBranchAt` 参数透传（useCallback 依赖同步）。
- `index.ts`：forkSession 包装签名加 `atSeq?`——`{ sessionId, increaseTitle: true }` 或 `+ atSeq` 条件展开；TaskPage/TaskPageHost 类型链同步。
- 冒烟 +1：bundle 含 `atSeq`。

**验证**：typecheck + build（dist 162 kB）+ 冒烟 **108 项全过**。

**待真机**：① 每轮回复操作行出现官方分支 icon（hover 有「在新对话中分支」Tooltip）② 点它出确认框 → 确认后跳到新分支会话，且内容**截断到那条消息为止**（后面的轮次不在）③ 头部按钮仍是全量对话 ④ 中间轮次分支的新会话标题同样递增 `(1)`。

> **封板（2026-09-27）**：真机验证全部通过（确认框官方化 / 头部钮规格 / 尾部操作行恒常显 / 消息行分支截断）。U10 收口 → [PROGRESS.md](../PROGRESS.md) 未决项 U10 关闭、里程碑 17 ✅。本工作包后续增补（清单遗留照 [design/session-view-ui-map.md](../design/session-view-ui-map.md) 第十四节）另起会话再排。下一专题 = U11 产出物打开与展示方式（[design/artifact-opening.md](../design/artifact-opening.md)）。

> **增补（2026-09-27）**：用户在真机上指着截图要求优先补「重试 / 轮次失败 / 限长」三件套的官方样式（清单 19），本会话即排——下面第十一轮。

## 2026-09-27（第十一轮）— 重试/轮次失败/限长三件套照官方 MessageItem 落码（清单 19）

——真机截图对比（用户）：我方旧自绘只有一行红色「处理失败：轮次失败 503:…」整行红；官方是三段式——「已重试模型请求 (5/5) · 9s」**可折叠行**（点开才见「重试延迟：8364 毫秒 / 失败原因：503:…」）+「● 本轮运行失败 503:…」**红点 + 红标题 + 灰原因** + 最右侧灰色机器码标签（SERVER）。要求照官方样式改。

**源码事实（先读后动，AGENTS.md 第 4 条；`dsh-client-ui-chat@0.1.7-rc.2` lib/client.js:1235-1338）**：
- `ModelRetryItem`：`<details class=retryRow>` + `summary`（内 `retryText[role=status]`）+ `retryDetails` 两行（`retryDetailLabel`「重试延迟：」+ `durationMilliseconds`；「失败原因：」+ 人话原因）。active = `retryState === 'scheduled'`：文案切「正在重试模型请求」、秒数倒计时（`ceil(delayMs/1000)`，250ms tick）+ 渐隐 shimmer（`prefers-reduced-motion` 关闭）；取消态「模型请求重试已取消」；started「已重试模型请求」；scheduled 静默「等待重试模型请求」。模板 `'{label}（{retry}/{maximum}） · {seconds}s'`；maximum = mode `normal` 时取 `maxRetries`，否则 ∞。
- `TurnErrorItem`：`turnErrorRow`（grid `10px minmax(0,1fr) auto`）= `StateDot(error)` + `turnErrorCopy`（红标题「本轮运行失败」600 + 灰原因 label-secondary）+ 右侧 `<code class=turnErrorCode>` = `node.code`——**即截图右侧 SERVER 标签**（稳定机器路由码，来自 turn/end `reason.error` 的 `LlmFailure.code`）；`ACCOUNT_SIGNED_OUT` 时标题换「任务已停止」。失败原因人话映射：AUTH→「API 密钥无效」、QUOTA→「当前请求的额度已用尽」、ACCOUNT_*→登出/登录两条，否则原文 message。
- `TurnMaxTokensItem`：StateDot(warning) + 「已达到输出 token 上限」+ 提示「回答被截断，已有输出保留在对话中。发送“继续”可让模型接着输出。」
- keyed `model-retry` 节点 data = `{ attempts: ModelRetryNode[], current: ModelRetryNode }`，官方 RetryNodeView **只画 `data.current`**（lib/client.js:1493）——旧实现直接读 `dataOf(node).retryState` 永远 undefined ⇒ **恒显 scheduled，是个真缺陷，本轮顺带修掉**。
- `TURN_PROCESS_INDEPENDENT_KINDS`：turn-error / turn-max-tokens 独立于过程折叠（恒显）；model-retry 是过程成员（折叠时隐藏）——`mirror/ChatNodeSeat` 早已按此实现，无需改。
- `StateDot` 是 primitives 公开导出（pack 核实），`primitives.d.ts` 补最小声明面。

**落码**：
- `mirror/MessageItem.tsx`：新增 `ModelRetryItemMirror` / `TurnErrorItemMirror` / `TurnMaxTokensItemMirror`（JSX 逐字照官方，类名 `ocOr('MessageItem', …)` 官方哈希类优先、`dsh-tdt-sv-*` 兜底）+ `failureMessage` 人话映射。
- `locales.ts`：删旧键 `sessionTurnError` / `sessionMaxTokens` / `sessionRetry`；增 16 键 zh/en 逐字抄官方词典（retry 五态 + retryStatus 模板 + retryDelay/retryFailure/durationMilliseconds + turnErrorTitle/accountStopped + maxTokensTitle/maxTokensHint + failure 四键）。
- `session-view.ts`：keyed 路 `model-retry` 取 `data.current`（数据薄兜底 attempts 末项，与官方 buildViewNode 取法同构）、`turn-error` / `turn-max-tokens` 接新组件；legacy 路同步；`ConversationNodeLike` 补 mode/retry/maxRetries/delayMs/failure 字段。
- `archive-session-css.ts`：删无消费者的 `.dsh-tdt-sv-notice-err`；末尾新增兜底样式组（官方 MessageItem.module.css 逐值照抄：折叠行/箭头旋转/hover/focus-visible、shimmer keyframes、错误行 grid 与 `<code>` 等宽、警示行 warn 色）。
- `scripts/smoke.mjs`：+6 断言（retryRow 语义类在 bundle、retry 五态文案、延迟/失败原因、turnError 三键、maxTokens 两键、旧 `notice-err`/`sessionTurnError` 已删）。

**验证**：typecheck + build（dist 171.69 kB）+ 冒烟 **114 项全过**（原 108 + 6）。本轮纯照官方逐字落码（执行 ui-map 清单 19），无方案取舍，不新增决策。

**待真机**：① 重试行折叠摘要「已重试模型请求 (n/m) · Ns」+ 点开见「重试延迟 / 失败原因」② scheduled 在途时「正在重试…」倒计时 + shimmer ③ 轮次失败行：红点 + 红「本轮运行失败」+ 灰原因 + 右侧 SERVER 等机器码 `<code>` 标签 ④ 限长行黄点警示组 ⑤ 暗色主题配色。

## 2026-09-28（第十二轮）— 工具卡三块官方化：ReadBlock / TerminalBlock / ioCard 灰框（清单 9/13/17）

——用户三张官方截图要求拉齐：① 读取文件展开官方是**代码卡**（头部路径 + 换行/复制钮）+ 行号列 + **中间截断**（头 4 行 + 尾 4 行 + 「… 其余 72 行」），我方把全部行铺出来了且格式不对；② 运行命令展开官方是**深底终端卡**（命令行 + 复制钮 + 输出区），我方是「输入/输出」两行；③ 工具调用官方有个**灰色圆边框容器**（输入 + 分隔线 + 输出），我方内容对但缺这个框。

**源码事实（先读后动；工具行真身不在 chat 包，在 `@deepseek-ai/dsh-client-ui-tool@0.1.7-rc.2`）**：
- **ToolRow**（lib/client.js:1499-1745）= 无边框裸行 root（flex column）+ DisclosureRow + 五态 `data-state=preparing|running|ok|error|stopped`（`error.code==='interrupted'→stopped`）+ `data-tool`/`data-variant`；**成功结算但 terminalFailed（exitCode≠0 或有 signal）⇒ 整行 error**（GenericToolCard:1767）。展开体**分发链**：askQuestion → `TerminalBlock(maxLines:∞)` → `DiffBlock(maxLines:9)` → `ReadBlock(maxLines:8)` → image → SearchBlock(8) → WebBlock → ToolDetails → 兜底 **ioCard 灰框**（ioSection(输入)+ioDivider+ioSection(输出[data-error])；`border:.5px border-l1; radius-lg; background:markdown-code-block`）——截图三块正对应链上三站。
- **readCardModel**（421-435）：settled + 非 error + name==='read' + 参数合法 + `readMeta` 收窄（lines 严格递增 ≤totalLines）+ 结果 envelope 正则 `^<path>…</path>\n<type>file</type>\n<content>\n…\n</content>$`——不满足任一条回退 generic。
- **terminalCardModel**（929-968）：`shellCall` 校验（description 必填，无 = persistent → 结算走 generic）；background → null；`parseExitStatus`（903）剥尾部 `\n[exit code: N]` / `\n[killed by signal: S]`；spill 常量（Full formatted result stored at）命中也回退。
- **摘要体系**：SUMMARY_KEYS per-variant（bash=description+command、read/write/edit=path、search=query）；TOOL_TITLE_KEYS 专属标题（pwsh/read_image/grep/glob；web_search/web_fetch 落 variant 标题「搜索/读取」）；diff 卡摘要旁**独立 `diffStat` span**（`+N -M`，diffTotals）——此前「来源待核」就在这；read/write/edit 摘要路径 = **fileLink**（下划线，点击 openFile——U11 入口顺势挂上）。VARIANT_ICONS size 14。
- **ReadBlock / TerminalBlock 是 primitives 公开导出**（.d.ts 全文核实），labels 契约 + 官方 zh 词典逐键抄（「显示 {shown} / {total} 行」「退出码 {code}」「未正常退出」等 22 键）。
- **类发现坑**：ToolRow 的 CSS module 挂在 `@deepseek-ai/dsh-client-ui-tool/` 前缀的 style 标签上 ⇒ `official-classes.ts` 从单前缀扩成双前缀数组（`dsh-client-ui-chat/` 字面量保留，冒烟旧断言依赖）。

**落码**：
- `mirror/GenericCommandCard.tsx` 全文重写（~560 行）：官方模型函数集逐值镜像（TOOL_VARIANTS / TOOL_TITLE_KEYS / VARIANT_ICONS / SUMMARY_KEYS / intendedDiff / readMeta / shellCall / parseExitStatus / hasSpillNotice / terminalCardModel…）；展开体按分发链接官方 ReadBlock(8)/TerminalBlock(∞)/DiffBlock(9)/ioCard 灰框（code 变体前置 CodeBlock）；五态 + TextShimmer 摘要 + errmark/stopmark；settled/phase/interrupted 由 session-view 传入。
- `primitives.d.ts`：补 TextShimmer / ReadBlock / TerminalBlock 声明面。
- `locales.ts`：+22 键（read 窗口/收展、terminal 信号/退出码/运行态/无输出/收展/发送输入/终端会话等）zh 逐字官方 + en 修正（Bash/Grep/Glob/Search、IN 等）。
- `official-classes.ts`：CSS_PKG_PREFIXES 双前缀；`archive-session-css.ts`：删旧盒式工具卡与「输入/输出」三行死规则，换官方 ToolRow 兜底镜像（裸行/tool-row hover/io-card/io-section(sticky)/io-divider/io-text[data-error]/tool-terminal `--dsl-terminal-*`）。
- `session-view.ts`：toolCallCard 传 `settled`/`phase`/`interrupted`（keyed `error.code==='interrupted'`；legacy 同步）+ `ConversationNodeLike.meta` 类型。
- `scripts/smoke.mjs`：+6 断言（ReadBlock 8 行 + envelope、TerminalBlock ∞ + 退出码/信号标记、ioCard 四类名、ui-tool 前缀发现、zh 词典三串、data-state 五值）。

**验证**：typecheck + build（dist 210.42 kB）+ 冒烟 **130 项全过**（原 124 + 6）。踩坑一则：断言查产物 envelope 用 `includes('<type>file</type>')` 匹配不到——正则字面量入产物后斜杠成 `\/` 转义，改查 `'<type>file'` 前缀。本轮纯照官方逐字落码（ui-map 清单 9/13/17），无方案取舍，不新增决策。

**待真机**：① 读取文件展开 = 行号列 + 头尾各 4 行 + 中间「… 其余 N 行」，点行内「展开其余 N 行」放全 ② 运行命令展开 = 深底终端卡（命令 + 复制 + 输出），失败命令整行红色 + 右侧退出码/信号 ③ 其余工具展开 = 灰色圆边框容器（输入/输出）④ read/write/edit 摘要路径下划线可点（进 U11 分栏预览）⑤ diff 卡摘要旁 `+N -M`。

