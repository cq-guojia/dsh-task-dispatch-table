# 归档会话弹窗显示（借官方设计变量 + 自渲染，决策 34 落码）

> **里程碑**：14 · **状态**：🔵 进行中（设计定型 + 落码） · **定型依据**：[`decisions.md`](decisions.md) 决策 34（推翻决策 29）
> **关联文档**：[`../worklog/session-view.md`](../worklog/session-view.md)（决策 27→28→29→34 全过程叙事）、[`dsh-capabilities.md`](dsh-capabilities.md)（归档语义 / 对话渲染分层，源码级事实）
>
> ⚠️ 本文件是**实施级**设计（决策 34 已拍板方案，此处落码前的定型与任务分解）。变更请以本文件为准，过程叙事回 worklog。

---

## 一、目标

在执行记录页点一条执行的「查看会话」，在**面板内弹窗**里**自渲染**该次执行会话的全过程——**markdown 正文、可折叠思考块（reasoning）、官方风工具卡**，外观对齐官方会话；**只读、不可续聊**；未知节点有 fallback 不白屏。

对象会话是**归档会话**（任务跑完即 `archiveSession`，见决策 11/31 链路）。难点：官方对归档会话**没有任何查看/预览界面**，且主视图会在列表变化时主动清掉归档会话引用（`ui-workspace/src/client/navigation.ts:287` `clearArchivedCurrent()`）。我们在**自家弹窗**里绕开主视图、直接用官方数据源渲染。

## 二、为什么不是挂官方 ChatView（决策 29 → 34 的动因）

决策 29 设想「复刻 slot 渲染引擎挂官方 ChatView」，T1 核实（2026-09-26，宿主 0.1.7-RC.2 实际产物）推翻关键前提：

- `sessions.retain` 与 `uiSession.adapter.bindingSource` 在 shipped 包里**不存在**；
- `entriesOf('conversation.view')` / `storeOf` / `scope('session')` 即使存在，ChatView 也**只渲染「当前会话」**、不接受任意归档 id；
- ⇒ 挂载路径断，决策 29 不可行（见 `decisions.md` 决策 29 撤销说明）。

用户提出的「复用它的样式」是对路——但**不能靠抄类名**：宿主聊天界面样式由 **CSS 变量设计体系**驱动，**类名是 CSS-module 哈希、CSS 规则由宿主构建注入、不以文件落地**，插件侧无法静态引用。可借的是**设计变量值**：

- 全局配色 `--dsw-alias-*`（label / bg / border / brand / state / shadow 等），宿主运行时注入 `:root` 或根容器，插件同文档可直接 `var()` 引用、**自动跟随明/暗**；
- 布局 token：已从 0.1.7-RC.2 包核实真实定义——`--dsh-chat-content-width`(748px) / `--dsh-chat-flow-gap`(8px) / `--dsh-composer-side-clearance`(16px) 等。

> ✅ 已否决备选：① 手工拼 `ChatViewSlotProps`（内部契约，宿主升级必碎）；② unarchive + 官方会话区打开（用户否：不取消归档）；③ 继续自绘渐进靠齐（永远达不到一致且持续投入）；④ **抄官方类名**（哈希 + 不落地，不可行）。

## 三、方案（决策 34 定型）

保留弹窗壳与数据闸门（决策 28），**内部自渲染消息/思考/工具卡 DOM，套用官方设计变量 + 抄来的布局值**：

1. **数据链（决策 28 已验证，沿用）**：`sessions.binding(id)` → `uiConversation.binding(...).target('chat')` → 消费 `legacy.nodes`；`open()` 拉尾页 + `loadOlder()` 向前翻；只读、不续聊。
2. **样式靠官方变量**：新建 `src/client/archive-session.css`——在弹窗根容器重声明少量聊天专属布局 token（用 0.1.7-RC.2 核实的真值，带兜底），其余全部 `var(--dsw-alias-*)` 引用宿主全局配色（同决策 26 面板做法）。**不引入任何宿主内部符号**。
3. **自渲染增强**（相对决策 28 的落差）：
   - **markdown 正文**：用自带轻量 markdown 渲染器（零/低依赖）把 assistant/user 文本渲染成富文本；
   - **可折叠思考块**：`reasoning` kind 默认折叠（`<details>`），展开显示 AI 思考过程（用户说的「技术规划」默认不刷屏）；
   - **官方风工具卡**：`tool-call` / `tool-result` 渲染成带图标、参数/输出可展开的卡片；
   - **镜像官方布局**：居中聊天列、内容宽 748px、消息间距 8px、气泡圆角与配色走宿主 token。
4. **噪音过滤（沿用决策 28）**：`context` / `compaction` / `unknown` 不渲染；未知 kind 一律 fallback 折叠不白屏。

## 四、当前代码状态与落码改造点

- **现态**：[`src/client/session-view.ts`](../../src/client/session-view.ts) 是决策 28 自绘实现（`SessionViewModal` + 节点 kind → 内联样式映射 + `openSessionView` 数据闸门 + `loadOlder`），已用 `--dsw-alias-*` 变量（说明全局 token 运行时可用）。
- **改造**：保留**弹窗壳 + `viewSession` 入口 + `viewing` 状态 + locales + `openSessionView` 探测逻辑**；把内联样式映射改为**引用 `archive-session.css` 类名**；`renderNode` 增加 markdown 渲染、`reasoning` 折叠、工具卡美化；引入 markdown 库并接入构建。
- **inject 清单**：沿用决策 28 已核实的按服务提供方声明：`sessions` ← `@deepseek-ai/dsh-api-session-controller`、`uiConversation` ← `@deepseek-ai/dsh-client-ui-conversation`。**不新增** `ui-renderer` / `ui-chat` 注入（决策 29 那条路已否）。
- **构建**：`tsdown.client.config.ts` 需支持 `.css` 产物（tsdown 原生支持 TS 内 `import './archive-session.css'`），确认 CSS 被打包进 client bundle。

## 五、风险与未决（U-notes）

| # | 风险 | 影响 | 应对 |
|---|---|---|---|
| R1 | 宿主升级改设计 token 名称 | 个别配色回退到兜底值（仍可读，不崩） | 兜底值取中性灰；升级时比照 `decisions.md` 决策 26 的做法复核 token 名 |
| R2 | markdown 渲染器对复杂语法支持不全 | 个别富文本显示朴素 | 选成熟轻量库（如 `marked`），仅做渲染不联网 |
| R3 | 内容安全（脚本注入） | 归档会话为本机自家 agent 产出，风险低 | markdown 渲染限定在本插件弹窗；如后续接外部内容再上 DOMPurify |
| R4 | 思考块 / 工具卡在极老会话缺字段 | 缺字段降级为原文折叠 | 沿用决策 28 的 fallback（折叠原文） |

## 六、真机验证清单

1. 弹窗外观（配色 / 气泡 / 间距 / 圆角）与官方会话**一致**，且明/暗切换自动跟随；
2. assistant 正文 **markdown 正常**（标题 / 列表 / 代码块 / 行内码）；
3. 思考块（reasoning）**默认折叠**、展开可见；
4. 工具卡显示**名称 + 参数/输出可展开**，错误态有标识；
5. 未知节点 fallback 不白屏；关闭 / 遮罩关闭正常，z-index 不挡主面板交互；
6. `npm run typecheck` + `npm run smoke` 全过。

## 七、落码子任务分解

1. **T1 核实导出形态**（已完成）：确认 `retain`/`bindingSource` 在 0.1.7-RC.2 不存在 ⇒ 决策 29 不可行；抽取宿主设计 token 真实值与类名机制（CSS-module 哈希、规则不落地）。
2. **T2 写 `archive-session.css`**：弹窗根重声明布局 token（带兜底）+ 消息/思考/工具卡视觉规则，全部走 `--dsw-alias-*` 全局变量。
3. **T3 引入 markdown 库**：加入客户端依赖，构建接入，封装 `renderMarkdown(text) -> html`。
4. **T4 重构 `session-view.ts`**：`renderNode` 改用类名 + markdown + reasoning 折叠 + 工具卡美化；弹窗壳与数据闸门不变。
5. **T5 构建/类型/冒烟**：`tsdown` 出 CSS、`typecheck`、`smoke` 全过。
6. **T6 真机验证**：按第六节清单逐条验（R1–R4）。

## 八、与历史方案的取舍对照

| 维度 | 决策 28 自绘 | 决策 29 ChatView 挂载 | 决策 34 借变量自渲染 |
|---|---|---|---|
| 样式保真 | 低（无 md / 无思考收起 / 工具卡简陋） | 高（官方原样）但不可行 | 中高（对齐官方设计 token，自渲布局） |
| 稳定性 | 自己画，风险在我们 | 消费渲染引擎契约（0.1.x，**不可行**） | 仅用全局 CSS 变量，**宿主升级零内部依赖** |
| 维护成本 | 维护「节点 kind → 样式」映射 | ~50 行装配胶水（已否） | 维护一份 `archive-session.css`（token 驱动） |
| 依赖 | 仅 `sessions` / `uiConversation` | 额外 `ui-renderer` / `ui-chat` | 仅 `sessions` / `uiConversation` + 轻量 markdown 库 |
