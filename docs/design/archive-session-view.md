# 归档会话弹窗显示（ChatView 复用，决策 29 落码）

> **里程碑**：14 · **状态**：🔵 进行中（设计定型 + 落码） · **定型依据**：[`decisions.md`](decisions.md) 决策 29
> **关联文档**：[`../worklog/session-view.md`](../worklog/session-view.md)（决策 27→28→29 全过程叙事）、[`dsh-capabilities.md`](dsh-capabilities.md)（归档语义 / 对话渲染分层，源码级事实）
>
> ⚠️ 本文件是**实施级**设计（决策 29 已拍板方案，此处落码前的定型与任务分解）。变更请以本文件为准，过程叙事回 worklog。

---

## 一、目标

在执行记录页点一条执行的「查看会话」，在**面板内弹窗**里用**官方 ChatView 原样渲染**该次执行的会话全过程——markdown、深度思考收起、工具卡等官方样式全部一致；**只读、不可续聊**（任务已结束、也不该续聊）；未知节点有 fallback 不白屏。

对象会话是**归档会话**（任务跑完即 `archiveSession`，见决策 11/31 链路）。这是难点所在：官方对归档会话**没有任何查看/预览界面**，且主视图会在列表变化时主动清掉归档会话引用（`ui-workspace/src/client/navigation.ts:287` `clearArchivedCurrent()`）。我们要在**自家弹窗**里绕开主视图、直接挂官方渲染。

## 二、为什么不是继续自绘（决策 28 → 29 的动因）

决策 28 已自绘弹窗落码（[`src/client/session-view.ts`](../../src/client/session-view.ts)，冒烟 53 项）。真机反馈：功能正常但界面与官方会话**差距大**——无 markdown、无深度思考收起、工具卡简陋。用户要求「完整套用官方样式、不手搓」。

深挖官方渲染引擎（`ui-renderer/src/client/scoped-slots.tsx`）后确认：ChatView 等**画 UI 的组件虽不直接导出**，但引擎组装 entry 的**积木全部公开**（`useHost` / `useRootBinding` / `observableHook` / `ScopeBindingProvider` + host API `entriesOf` / `storeOf` / `scope('session')` / `locale` + `uiSession.adapter.bindingSource` + `sessions.retain`）。**结论**：落码 = 复刻引擎 `SessionEntry` 装配逻辑约 50 行胶水，在自家弹窗里挂载官方 ChatView 本体——这是「重放引擎装配过程」，不是拼内部 props 猜行为，比决策 28 自绘稳一层。

> ✅ 已否决备选：① 手工拼 `ChatViewSlotProps`（内部契约，宿主升级必碎）；② unarchive + 官方会话区打开（用户否：不取消归档）；③ 继续自绘渐进靠齐（永远达不到一致且持续投入）。

## 三、方案（决策 29 定型）

在保留弹窗壳（Fragment 兄弟子树、z-index 1010 叠主面板之上、遮罩 / 关闭按钮、`viewing` 状态、`viewSession` 入口、locales）的前提下，**内部渲染整体替换为官方 ChatView 挂载胶水**：

1. **拿 entry**：`entriesOf('conversation.view')` 取 `ui-chat` 注册的 entry——其 `entry.component` = ChatView 本体，`entry.inject(sessionId)` = 官方写好的 `ChatViewInjected` 全套（`loadOlder` / `openFile` / `chatScroll` / `forkAt`）。
2. **拿 store / scope**：`storeOf(entry, scopeBinding)` 取 chatStore 实例；`scope('session')` 取 session adapter；`locale` 取文案。
3. **渲染树接入**：我们面板本身就在官方渲染树内 ⇒ `useHost()` / `useRootBinding()` 有值；用 `ScopeBindingProvider` 包住，调 `entry.inject(sessionId)(entry.component)` 渲染官方 ChatView。
4. **数据源**：`uiSession.adapter.bindingSource(retain 产物)`（`ui-session/src/client/index.ts:314-345` 每会话标准 sources 合成，含 chat transcript）+ `sessions.retain(target, options)`（`api/session-controller/src/client/contract/sessions.ts:58` 的 **ISessions 正式契约方法**，与已验证可用的 `binding()` 同层）。

> 关键事实（均已源码核实，见 `dsh-capabilities.md`）：归档会话**可读、不可从 UI 打开**——`session/list` 不过滤归档，故 `binding()` / `retain()` 仍能定位它，只是主视图不显示。我们正是利用这点，在自家弹窗里绕过主视图。

## 四、当前代码状态与落码改造点

- **现态**：[`src/client/session-view.ts`](../../src/client/session-view.ts) 是决策 28 自绘实现（`SessionViewModal` + 节点 kind → 样式映射 + `openSessionView` 数据闸门 + `loadOlder`）。
- **改造**：保留**弹窗壳 + `viewSession` 入口 + `viewing` 状态 + locales + `openSessionView` 探测 `binding()`/`retain()` 逻辑**；**删除**自绘渲染部分，替换为第三节的 ChatView 挂载胶水组件（新文件或同文件重构）。
- **inject 清单**：沿用决策 28 已核实的按服务提供方声明：`sessions` ← `@deepseek-ai/dsh-api-session-controller`、`uiConversation` ← `@deepseek-ai/dsh-client-ui-conversation`；**新增** `ui-renderer`（`entriesOf`/`storeOf` 来源）、`ui-chat`（`conversation.view` entry 提供方）的提供方声明，按服务方而非兄弟插件照抄。

## 五、风险与未决（U-notes）

| # | 风险 | 影响 | 应对 |
|---|---|---|---|
| R1 | `sessions.retain()` 对**归档**会话行为未真机验证（`binding()` 已知可用，retain 待验） | 归档会话拉不到完整 transcript ⇒ 弹窗空 | 若 retain 受限，退 `binding()` + 冷读 `session/follow` + `session/page`（决策 28 已核实归档会话日志可读、不激活 Agent） |
| R2 | ChatView 个别动作（`openFile` 开侧栏、`forkAt`）在弹窗语境无宿主外壳支撑 | 点工具卡可能崩 | `ownerProps` 空实现降级（forkAt 在弹窗语境本就无意义，禁用即可） |
| R3 | 消费 `entry.component/inject/options`（StoredEntry 数据面）+ host API 属渲染引擎契约，仍 0.1.x | 宿主升级需跟调 | smoke 加符号 / 契约断言兜底（同决策 28 的 [8] 组思路） |
| R4 | 深度思考（reasoning）收起 / 展开策略 | 自绘时期的「过滤 reasoning」在 ChatView 路线下由官方控制 | 沿用官方默认，不自绘过滤；未知节点 kind 仍 fallback 折叠不白屏 |

## 六、真机验证清单

1. 归档会话经 `retain()` 拉到完整 transcript（对照 R1）；
2. 弹窗里 markdown / 深度思考收起 / 工具卡与官方会话**一致**；
3. 点工具卡 `openFile` / `forkAt` 不崩（对照 R2）；
4. 未知节点 fallback 不白屏（对照 R4）；
5. 关闭 / 遮罩关闭正常，z-index 不挡主面板交互。

## 七、落码子任务分解

1. **T1 核实导出形态**：grep 宿主当前产物，确认 `entriesOf('conversation.view')` / `storeOf` / `scope('session')` / `sessions.retain` 的确切签名与返回面（决策 29 已定位源码行，落码前再对一遍当前版本）。
2. **T2 写 ChatView 挂载胶水组件**：替换 `session-view.ts` 自绘渲染部分，复刻 `SessionEntry` 装配 ~50 行。
3. **T3 inject 清单核对**：补 `ui-renderer` / `ui-chat` 提供方声明，重新跑冒烟 [8] 组。
4. **T4 smoke 加契约断言**：针对 `entry.component/inject/options` 与宿主 API 加符号断言。
5. **T5 真机验证**：按第六节清单逐条验（R1–R4）。

## 八、与决策 28 自绘实现的取舍对照

| 维度 | 决策 28 自绘 | 决策 29 ChatView 复用 |
|---|---|---|
| 样式保真 | 低（无 md / 无思考收起 / 工具卡简陋） | 高（官方原样） |
| 维护成本 | 每次官方升级要维护「节点 kind → 样式」映射 | 只维护 ~50 行装配胶水，漂移更小 |
| 稳定性 | 自己画，风险在我们 | 消费渲染引擎契约（0.1.x，需 smoke 兜底） |
| 依赖 | 仅 `sessions` / `uiConversation` | 额外 `ui-renderer` / `ui-chat` |
