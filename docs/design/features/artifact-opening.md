# U11 · 产出物打开与展示方式（设计文档）

> **状态**：✅ 收口（真机验证通过）
> **来源**：决策 39；形态以 §四-C「页面级唯一 dock」为准
> **配套**：过程见 [`worklog/artifact-opening.md`](../../worklog/artifact-opening.md)

> 状态：**已拍板（2026-09-27，决策 39），落码完成（同日）**，待真机验证；冒烟 124 项全过，typecheck + build 过（dist 190.21 kB）。
> 场景 1（会话弹窗文件引用可点 + 预览）本稿覆盖；场景 2（任务产出物展示）暂缓，届时按 §二④ 官方事件链路另拍。

## 一、问题陈述

两个场景，同一个动词问题——「文件出现之后，用户怎么打开它」：

1. **会话弹窗内的文件引用**（本次落码）：归档会话弹窗里，工具卡（读 / 写 / 编辑）与对话内容中出现大量文件路径，当前是**纯文本不可点**。
2. **任务产出物的展示**（暂缓）：设置页 / 任务页展示每会话 / 每任务产出，点击打开与场景 1 走**同一个 `openFile` 入口**。

## 二、源码核实结果（2026-09-27，官方包 0.1.7-rc.2，实现本体）

### ① 官方「打开文件」四层能力

| 层 | 包 | 事实 |
|---|---|---|
| 数据层 | `@deepseek-ai/dsh-api-workspace-files` | remote 命名空间 `workspaceFiles`：`read(sessionId, path, {offset,limit})` 文本按行分页（页上限 **5000 行 / 2MiB**）、`readBytes`（二进制 ≤**32MiB**，multipart → Uint8Array）、`stat`、`list`（目录 ≤2000 条，**限工作区内**）、`changes`（监听流）。文件读取**不限工作区**（跟随 `ctx.fs` 读权限，agent 沙箱只限写）；**cold/归档会话可读且不激活 agent**。client 消费 = `inject: ['resources','remote','remote.workspaceFiles']`（与我方 inject uiWorkspace 同构）。错误码：`workspace-file/not-found`、`outside-workspace`、`too-large`、`not-text`、`not-regular-file` 等 |
| 预览层 | `dsh-client-ui-sidebar-files` + `dsh-client-ui-sidebar-documentpreview` | 右栏文件树 tab（命令 `workspace.files`）+ 预览 tab：**Markdown / Shiki 代码 / 图片 / PDF / HTML / 纯文本**。打开动词 = `openResource('dsh-resource://file/session/<id>/<path>')` |
| 产出物层 | `dsh-tool-present` + `dsh-client-ui-deliverables` | `present` 工具（standard/ptc/cordis preset 内置）→ 事件 `deliverables/presented`（`files:[{path,description?}]`，不复制内容）；改动文件卡 = Host `workspace/changes` git 摘要；系统提示词段 `ui:deliverable-file-references` 指导模型引用文件。**产出物真源 = 这两条事件，非回执 outputs** |
| 原生层 | `session/openWorkspacePath` + `dsh-native-command` | 交给 **Host 桌面**原生应用 / reveal；`canOpenWorkspacePath()` 探测。容器部署无桌面 ⇒ **不可用**（官方无桌面时同样隐藏原生控件） |

### ② 官方右栏对本插件不可用（两条硬证据）

1. **seat 按会话挂载**（`dsh-client-ui-sidebar-right` `service.d.ts`）：右栏停靠面每会话一个，`openResource` 走「当前挂载 seat」，**「a command arriving with no seat mounted has no session to act on and fails loudly」**；`mounted` 在「global panel 激活或无会话选中」时为 undefined。我方整页面板/弹窗激活时会话区被顶替 ⇒ seat 不存在 ⇒ 调用即报错。
2. **预览组件本体绑 sidebar 槽位运行时**（`documentpreview` `index.d.ts`）：「The type reaches the Sidebar through its public path only… **Every import from another client plugin is a type**」——`TextPreview` 的 props 全是 slot 运行时合成（tab 记录 / 每-tab store / 渲染槽），离开 sidebar 座位无法组装。

另：右栏是布局层的一列，处于我方 z-1000 弹窗之下；**弹窗改整页也救不了**（整页同样顶替会话区）。⇒ 右栏路线对本插件**整体排除**，Q1「系统默认应用」随原生层一并排除。

## 三、拍板结论（决策 39，用户逐轮收敛）

- **渲染底层必须官方原生**（用户硬要求）：md = 官方 `MarkdownText`（弹窗在用）、代码高亮 = 官方 Shiki 积木（diff 面同款）、图片 = `readBytes`→blob URL、PDF = 浏览器原生 iframe、文本 = `read` 分页；不可内嵌类型 = 官方同款空态行 + 复制路径。数据一律 `remote.workspaceFiles` 真实取数。
- **展示形式 = 分栏推压预览面**（用户提出，弃「弹窗摞弹窗」）。
  ⚠️ 下面两种早期形态**已被 §四-C 取代**：现为**页面级唯一 dock**（占布局的分栏，推压整页；弹窗靠 `right: var(--dsh-tdt-preview-w)` 让位，弹窗内不再自带分栏）。
  - ~~会话弹窗内：右侧分栏展开，对话往左压~~（已废）；
  - ~~任务列表整页：页面右侧滑出分栏~~（已废）。
- **统一入口**（用户硬要求）：所有文件链接只调 `openFile(path)` 一个方法，由它决定开哪个容器、怎么渲染；链接处零写死，改展示方式只改一处。未来任务产出物清单同走此入口。
- **预览引擎只建一份**，弹窗 / 整页两个容器共用。

## 四、落码清单（✅ 全部完成，2026-09-27）

1. ✅ **inject 接通**：package.json `dsh.client.inject` 补 `@deepseek-ai/dsh-api-workspace-files`；client 侧 `ctx.inject(['remote'])` 取 `remote.workspaceFiles`（真机 bundle 已挂载；探不到 = 功能整体降级不报错）。
2. ✅ **统一入口 + 预览引擎**：`openFile(path)`（session-view.ts，setPreview 单状态）+ `src/client/file-preview.tsx` `FilePreviewPanel`（头部 = 文件名 + 路径 + 关闭；体 = 按扩展名分派：md=MarkdownText / 代码=CodeBlock(Shiki) / 图片·PDF=readBytes→blob / 文本=read 分页「加载更多」；错误态照官方 bareCode 四分支 + 复制路径）。
3. ✅ **弹窗接线**：工具卡 diff 摘要路径 + 无 diff 工具 argsRaw `file_path`/`path`「文件」行（GenericCommandCard `onOpenFile`）+ markdown 正文 `fileMentions`（AssistantMarkdown → 官方 MarkdownText；词表 = collectFilePaths + makeFileMentions，归一化精确匹配优先、唯一 basename 兜底）→ `openFile`；统一走**页面级 dock**（见 §四-C）。
4. ✅ **整页留接口**：TaskPageHost 已收 `filesRef` 并透传弹窗，`openFile` 入口就位，不落 UI（场景 2 暂缓）。
5. ✅ **质量门**：冒烟 +10 断言（预览组件 / 分栏 / 单入口 / 词表 / 真实取数 / 错误码四分支 / 加载更多 / objectURL 生命周期 / inject 清单）共 **124 项全过**；typecheck + build 过（dist/client.js 190.21 kB 入库）。

## 四-C、预览面形态：**页面级唯一 dock**（2026-09-28 用户拍板，替代「弹窗内分栏」）

> 决策 39③ 原定的「弹窗内右侧分栏」已**废弃**：用户要求弹窗与整页**共用同一个预览面**，
> 且**弹窗不遮盖它**——预览从屏幕最右侧挤出，把整页（含弹窗）一起往左推。

| 项 | 结论 |
|---|---|
| 唯一预览面 | `FilePreviewPanel`（dock 形态）渲染在 `TaskPage` 根（`#dsh-tdt-root`）下，是**布局成员**（`position:sticky; top:0; height:100vh`）而非浮层；弹窗与整页**共用这一份**（弹窗不再自带分栏） |
| 推压方式 | 根容器 = 横向 flex：内容区 `flex:1 1 auto; min-width:0`，dock 占 `width: var(--dsh-tdt-preview-w)` ⇒ **整页被真正挤窄**（不是被盖住），滚动条留在内容区内不会被压住（真机「弹出来后滚动条没了」的修复）；弹窗是全屏 fixed 层，靠 overlay `right: var(--dsh-tdt-preview-w,0px)` 让位 ⇒ 弹窗不被遮盖且自动居中于剩余区 |
| 生命周期 | 预览 state 在 `TaskPage` 上 ⇒ **关弹窗不影响预览**，预览可独立收回（头部关闭钮） |
| 统一入口 | `openFile(sessionId, path)`：弹窗内（工具卡路径 / 正文 fileMentions / 交付卡）经 `onOpenFile(path)` 上提；整页（执行记录行的产出物）直调 ⇒ **两处同一个入口、同一份引擎**（决策 39 ③） |
| 宽度可调 | dock 左缘 6px 拖拽条（pointerdown/move/up）：拖动期间只改 CSS 变量（不重渲染整页），松手落 state 并持久化 localStorage（`dsh-tdt-preview-width`）；区间 320px ~ 视口 70%，默认 460px |
| 崩溃隔离 | 预览体外包 `PreviewBoundary`（错误边界）：渲染异常只降级预览区，**不再拖垮整页**（真机 2026-09-28「点了直接黑屏」的直接修复） |
| 数据契约防御 | `read` / `readBytes` 结果按官方 wire schema 解析，取不到 `text` / `data` ⇒ 走错误态**绝不把 undefined 喂给官方渲染器**（真机「undefined undefined undefined」+ `endsWith` 崩溃的根因面），并打形状日志取证 |
| 目录浏览器（2026-09-28 同日追加，用户拍板面包屑方案） | dock 从单文件预览升级为 `FileBrowser`（file-browser.tsx）：`openFile(path)` 先 `list(path)` 判别目录/文件（官方 `stat` 不含 kind，`list` 试探是唯一可靠判别；报 `not-directory` ⇒ 文件预览、dir=父目录）。面包屑每段可点回跳；预览文件时面包屑保留（点父段即返回）；顶栏「上一级 / 回到根目录 / 刷新 / 复制 / 关闭」；树目录在前文件在后。渲染底层复用本文件预览体组件，数据全官方 `workspaceFiles.list`（≤2000 条，限工作区内） |

---

## 四-B、交付登记路线（决策 40，已拍板·**待实施**）

> 用户 2026-09-28 定：**B（插件代写官方交付事件）+ C（提示词要求模型调 present 兜底）**；否决「插件 UI 自己画卡」。
> 前置（U11 文件预览 / 链接可点）已于 2026-09-28 真机走通；U12 交付登记的过程见 [`worklog/deliverables-display.md`](../../worklog/deliverables-display.md)。

### 为什么 present 不能由插件代调（源码事实）

| 事实 | 坐标 |
|---|---|
| present 是 agent 侧 scoped 工具，只能模型发起；要求「有工作区 + 轮次未结束」 | `dsh-tool-present@0.1.7-rc.2 lib/index.js` execute：`turnBoundary.openTurnStartSeq === null` 抛错；README「工具要求 Agent Session 具有工作区和尚未结束的轮次」 |
| 交付事件由 present 实例自己写：`ctx.on('tools/result')` → `session.append('deliverables/presented', {turn, callId, files})`，pending WeakMap 只认自己执行的 exec | 同上（文件尾事件段）；README「每个插件实例只记录其实际执行的调用；同名作用域工具不能通过其他实例发布交付」 |

### B 路线可行性（三条公开契约）

| 依据 | 坐标 |
|---|---|
| `append<T>(type, data)` 是 Session 公开契约（`'deliverables/presented'` 不在 SurfaceEventType ⇒ 无需第三参 opts） | `dsh-session/lib/types/index.d.ts:246`；`dsh-session/lib/types/types.d.ts:442` |
| `'deliverables/presented'` 是正式注册事件：`{ turn; callId: ToolCallId; files: PresentedFile[] }` | `dsh-tool-present/lib/types/types.d.ts`（declare module `@deepseek-ai/dsh-session/types`） |
| 回执工具 execute 第二参 `exec` 带 `agent.session`（Session 本体）与 `callId` | `dsh-tools/lib/types/index.d.ts:217/229`；`dsh-agent/lib/types/runtime-types.d.ts:143` |
| turn 号 = `turnBoundary` 投影的 `lastTurn`（present 同款取法，agent 作用域 `sessionProjections`） | `dsh-agent-loop/lib/types/index.d.ts:23`；`dsh-tool-present/lib/index.js` execute |

### 实施清单（按顺序，逐项验证）

1. `src/receipt.ts`：execute 改签 `(args, exec)`；成功后取 `exec.agent.session` + `exec.callId` + turn → `session.append('deliverables/presented', { turn, callId, files })`；**files = 已校验过的 outputs**（存在 + mtime 新鲜，`reconcile.ts` 的 checkReceipt 同模）。
2. turn 获取：注册时从 agentCtx 闭包注入 `sessionProjections`（present 包 inject 同名服务）；执行时 `stateOf(session,'turnBoundary')?.lastTurn`；**取不到即跳过**（不猜 turn —— 猜错会把卡挂到别的轮次或直接不显示）。
3. 兜底与可观测：整段 try/catch，失败只 `logger.warn`（原因 + 实例 id），**绝不抛给模型**（回执必须照常成功）；成功 log 一行「交付已登记 N 个文件」。
4. C 兜底：`receiptInstruction` / 派发提示词补一句「若本次产出是独立文件，请调用 present 交付最关键的 1–2 个」；与 B 共存安全（官方按 path Map 后写覆盖）。
5. 质量门：typecheck + build + 冒烟新增断言（回执流式 append 事件 / 失败只记日志不影响回执结果 / files 取校验后的 outputs / present 提示词文案）；真机跑一轮任务验证：宿主会话视图出官方交付卡 + 我方弹窗出卡 → 说「提交」再 commit+push。

### 三条明确代价（用户已接受）

1. `callId` 是回执调用的 id ⇒ 卡片「用系统应用打开」按钮可能失效（容器无桌面本就不可用）；预览走路径，不受影响。
2. 拿不到 session / append 失败 ⇒ 静默跳过、只记日志，任务成败不受影响。
3. 文件清单取**校验后**的 outputs，不取模型原样填值 ⇒ 不会交付不存在的文件。

---

## 五、复现核实的方法（换机器重跑）

解包源码目录在 /tmp（会丢），重取：`npm pack @deepseek-ai/<pkg>@0.1.7-rc.2` 解包读 `lib/types/**` 与 `README.zh.md`。本次核实过的包：`dsh-api-workspace-files`、`dsh-client-ui-sidebar-files`、`dsh-client-ui-sidebar-documentpreview`、`dsh-client-ui-sidebar-right`、`dsh-tool-present`、`dsh-client-ui-deliverables`、`dsh-api-session-controller`、`dsh-client-ui-conversation`（chat 包 = `dsh-client-ui-conversation`，其 README 描述 MarkdownDelegateProvider 与右栏打开链路）。

## 六、关联

- 会话弹窗现状：[session-view-ui-map.md](../external/session-view-ui-map.md)（§十五 数据缺口表——fileMentions 在遗留清单里，与本专题合并做）
- 产出物数据源：决策 19（回执 outputs，场景 2 届时复核）、决策 22（工作区 = cwd 根）
- 弹窗渲染链：决策 36/37（mirror 组件树）、决策 38（U10，inject 边先例）
