# U11 · 产出物打开与展示方式（设计文档）

> **状态**：✅ 收口（真机验证通过）
> **来源**：决策 39；形态以 §四-C「页面级唯一 dock」为准
> **配套**：过程见 [`ledger/worklog/`](../../ledger/worklog/)
>
> 状态：**已拍板（2026-09-27，决策 39），落码完成（同日）**，待真机验证；冒烟 124 项全过，typecheck + build 过（dist 190.21 kB）。
> 场景 1（会话弹窗文件引用可点 + 预览）本稿覆盖；场景 2（任务产出物展示）暂缓，届时按 §二④ 官方事件链路另拍。

## 一、问题陈述

两个场景，同一个动词问题——「文件出现之后，用户怎么打开它」：

1. **会话弹窗内的文件引用**（本次落码）：归档会话弹窗里，工具卡（读 / 写 / 编辑）与对话内容中出现大量文件路径，当前是**纯文本不可点**。
2. **任务产出物的展示**（暂缓）：设置页 / 任务页展示每会话 / 每任务产出，点击打开与场景 1 走**同一个 `openFile` 入口**。

## 二、源码核实结果（2026-09-27，官方包 0.1.7-rc.2，实现本体）

> ⚠️ **2026-10-03 复核（官方 0.2.0-rc.2）**：§二① 的「预览层」结论**成立且加强**（借不到官方组件），但「PDF = 浏览器原生 iframe」这条**已更正** ⇒ 见本节末「§二-五 复核更正」。完整事实清单见 [已核实的 DSH 能力（源码级事实清单）](../dependencies/dsh-capabilities.md) §文件预览的官方渲染能力。

### ① 官方「打开文件」四层能力

| 层 | 包 | 事实 |
|---|---|---|
| 数据层 | `@deepseek-ai/dsh-api-workspace-files` | remote 命名空间 `workspaceFiles`：`read(sessionId, path, {offset,limit})` 文本按行分页（页上限 **5000 行 / 2MiB**）、`readBytes`（二进制 ≤**32MiB**，multipart → Uint8Array）、`stat`、`list`（目录 ≤2000 条，**限工作区内**）、`changes`（监听流）。文件读取**不限工作区**（跟随 `ctx.fs` 读权限，agent 沙箱只限写）；**cold/归档会话可读且不激活 agent**。client 消费 = `inject: ['resources','remote','remote.workspaceFiles']`（与我方 inject uiWorkspace 同构）。错误码：`workspace-file/not-found`、`outside-workspace`、`too-large`、`not-text`、`not-regular-file` 等 |
| 预览层 | `dsh-client-ui-sidebar-files` + `dsh-client-ui-sidebar-documentpreview` | 右栏文件树 tab（命令 `workspace.files`）+ 预览 tab：**Markdown / Shiki 代码 / 图片 / PDF / HTML / 纯文本**。打开动词 = `openResource('dsh-resource://file/session/<id>/`{path}`')` |
| 产出物层 | `dsh-tool-present` + `dsh-client-ui-deliverables` | `present` 工具（standard/ptc/cordis preset 内置）→ 事件 `deliverables/presented`（`files:[{path,description?}]`，不复制内容）；改动文件卡 = Host `workspace/changes` git 摘要；系统提示词段 `ui:deliverable-file-references` 指导模型引用文件。**产出物真源 = 这两条事件，非回执 outputs** |
| 原生层 | `session/openWorkspacePath` + `dsh-native-command` | 交给 **Host 桌面**原生应用 / reveal；`canOpenWorkspacePath()` 探测。容器部署无桌面 ⇒ **不可用**（官方无桌面时同样隐藏原生控件） |

### ② 官方右栏对本插件不可用（两条硬证据）

1. **seat 按会话挂载**（`dsh-client-ui-sidebar-right` `service.d.ts`）：右栏停靠面每会话一个，`openResource` 走「当前挂载 seat」，**「a command arriving with no seat mounted has no session to act on and fails loudly」**；`mounted` 在「global panel 激活或无会话选中」时为 undefined。我方整页面板/弹窗激活时会话区被顶替 ⇒ seat 不存在 ⇒ 调用即报错。
2. **预览组件本体绑 sidebar 槽位运行时**（`documentpreview` `index.d.ts`）：「The type reaches the Sidebar through its public path only… **Every import from another client plugin is a type**」——`TextPreview` 的 props 全是 slot 运行时合成（tab 记录 / 每-tab store / 渲染槽），离开 sidebar 座位无法组装。

另：右栏是布局层的一列，处于我方 z-1000 弹窗之下；**弹窗改整页也救不了**（整页同样顶替会话区）。⇒ 右栏路线对本插件**整体排除**，Q1「系统默认应用」随原生层一并排除。

### ②-五 2026-10-03 复核更正（官方 0.2.0-rc.2）

**结论：§二② 两条硬证据仍成立**（`documentpreview` 的 client 导出面复核后**仍全是 type**，借不到组件；seat 约束依旧）⇒ 右栏路线继续排除、页面级 dock 形态不动。但**「PDF = 浏览器原生 iframe」这条前提被官方事实推翻**：

| 项 | 原记（§三） | **复核后（0.2.0-rc.2 源码）** |
|---|---|---|
| PDF 渲染 | 浏览器原生 iframe（当作已定方案） | **官方自己不用 iframe**：PDF 走独立懒加载分包 `lib/client.pdf.js`（**7.1 MB**）里的 **pdf.js**，逐页渲染到 canvas + 文本层；`pdfjs-dist` 是该分包内部依赖、不在 `package.json` `dependencies` ⇒ **第三方无法合法复用** |
| SVG 渲染 | （未单列，随图片走） | 官方 `svg` 与位图**同一个 `<img>`** 渲染器（`IMAGE_EXTENSIONS` 含 `svg`，MIME `image/svg+xml`）⇒ **我方 `<img>` 手法与官方一致**，SVG 若不显示必是取数/尺寸侧问题，不是渲染器选型问题 |
| 官方预览组件能否借 | 未核实 | **不能**：`lib/types/client/index.d.ts` 仅 `export type` + `declare module`；`ctx.documentPreviews` 注册表注册的是绑右栏 slot 的 keyed 组件 |

⇒ 我方 PDF 的「浏览器原生 iframe」不等于「和官方一样能显示」：官方能显示是靠 pdf.js **不依赖浏览器 PDF viewer**。当前 iframe 在我方 webview 里预览不出 PDF/SVG，**根因待查**（见 台账 U26），并遵守用户 2026-10-03 定的取舍原则：**能用官方就用官方 → 官方做不到就抄官方样式但用浏览器底层能力 → 绝不引第三方包**（故 `pdfjs-dist` 不可引入，PDF 只能走「原生 iframe + 抄官方样式」或做官方同款降级）。

## 三、拍板结论（决策 39，用户逐轮收敛）

- **渲染底层以官方为主**（用户硬要求）：md 正文 = 官方 `MarkdownText`（弹窗在用，其内代码块仍走官方 Shiki `CodeBlock`）；图片 = `readBytes`→blob URL；PDF = 浏览器原生 iframe；文本 = `read` 分页；不可内嵌类型 = 官方同款空态行 + 复制路径。数据一律 `remote.workspaceFiles` 真实取数。⚠️ **例外**：「独立源码查看器」（file-preview 源码态的代码 / HTML 源 / 纯文本、任务编辑器「配置预览」的任务定义 JSON、工具卡 `code` 变体的工具代码）三处只读代码展示**统一为只读 CodeMirror 6（`CodeViewer`，见 [已核实的 DSH 能力（源码级事实清单）](../dependencies/dsh-capabilities.md) 决策）—— 根除官方 Shiki `CodeBlock` 整篇 tokenize 成 `<pre>`+每 token `<span>` 巨型 DOM 导致的 5000 行大文件首屏与拖拽卡死；markdown 正文渲染路径不变。
- **展示形式 = 分栏推压预览面**（用户提出，弃「弹窗摞弹窗」）。
  ⚠️ 下面两种早期形态**已被 §四-C 取代**：现为**页面级唯一 dock**（占布局的分栏，推压整页；弹窗靠 `right: var(--dsh-tdt-preview-w)` 让位，弹窗内不再自带分栏）。
  - ~~会话弹窗内：右侧分栏展开，对话往左压~~（已废）；
  - ~~任务列表整页：页面右侧滑出分栏~~（已废）。
- **Office（doc/docx/ppt/pptx）= 官方 `remote.officeToPdf` 转 PDF 后再走既有 PDF iframe**（2026-10-05 落码）：官方把 Office 在**主机侧**转成 PDF（`render(scopeId, path, 'foreground')`），转换产物字节在信封 payload 的 `data`，我方复用既有 PDF 渲染壳 ⇒ **零 npm 依赖**（服务面 `OfficeToPdfFace` 本地声明，dotted 注入 `remote.officeToPdf`）。⚠️ 官方 `OfficeExtension` **含 `xls`/`xlsx`**，但用户拍板「Excel 向后讨论」⇒ 本轮**不纳入**（见 台账 U33 / U34）。宿主未启用该服务时呈现「Office 预览不可用」（与官方提示逐字一致）。
- **统一入口**（用户硬要求）：所有文件链接只调 `openFile(path)` 一个方法，由它决定开哪个容器、怎么渲染；链接处零写死，改展示方式只改一处。未来任务产出物清单同走此入口。
- **预览引擎只建一份**，弹窗 / 整页两个容器共用。

## 四、落码清单（✅ 全部完成，2026-09-27）

1. ✅ **inject 接通**：package.json `dsh.client.inject` 补 `@deepseek-ai/dsh-api-workspace-files`；client 侧 `ctx.inject(['remote'])` 取 `remote.workspaceFiles`（真机 bundle 已挂载；探不到 = 功能整体降级不报错）。
2. ✅ **统一入口 + 预览引擎**：`openFile(path)`（session-view.ts，setPreview 单状态）+ `src/client/file-preview.tsx` `FilePreviewPanel`（头部 = 文件名 + 路径 + 关闭；体 = 按扩展名分派：md=MarkdownText / 代码=CodeViewer(只读 CodeMirror 6) / 图片·PDF=readBytes→blob / 文本=read 分页「加载更多」；错误态照官方 bareCode 四分支 + 复制路径）。（**2026-11-06 起该本地引擎整体删除，改由核心 `dsh-plugin-core/adv/explorer` 的 `openFilePreview` 承担**） |
3. ✅ **弹窗接线**：工具卡 diff 摘要路径 + 无 diff 工具 argsRaw `file_path`/`path`「文件」行（GenericCommandCard `onOpenFile`）+ markdown 正文 `fileMentions`（AssistantMarkdown → 官方 MarkdownText；词表 = collectFilePaths + makeFileMentions，归一化精确匹配优先、唯一 basename 兜底）→ `openFile`；统一走**页面级 dock**（见 §四-C）。
4. ✅ **整页留接口**：TaskPageHost 已收 `filesRef` 并透传弹窗，`openFile` 入口就位，不落 UI（场景 2 暂缓）。
5. ✅ **质量门**：冒烟 +10 断言（预览组件 / 分栏 / 单入口 / 词表 / 真实取数 / 错误码四分支 / 加载更多 / objectURL 生命周期 / inject 清单）共 **124 项全过**；typecheck + build 过（dist/client.js 190.21 kB 入库）。

## 四-C、预览面形态：**页面级唯一 dock**（2026-09-28 用户拍板，替代「弹窗内分栏」）

> 决策 39③ 原定的「弹窗内右侧分栏」已**废弃**：用户要求弹窗与整页**共用同一个预览面**，
> 且**弹窗不遮盖它**——预览从屏幕最右侧挤出，把整页（含弹窗）一起往左推。

| 项 | 结论 |
|---|---|
| 唯一预览面 | 页面级预览 = 核心 `openFilePreview`（`dsh-plugin-core/adv/explorer`）的右侧分栏，mount = `#dsh-tdt-root`；弹窗与整页**共用这一份**（核心负责 flex 行、主区伸展、关闭还原） |
| 推压方式 | 核心 PanelDock 把根容器补成横向 flex 行、主区伸展 ⇒ **整页被真正挤窄**（不是被盖住）；核心在 `documentElement` 发布 `--dshpc-page-inset-right`（**同页多个 dock 求和**），会话弹窗 overlay 的 `inset` 直接消费它 ⇒ 弹窗不遮盖任何分栏 |
| 生命周期 | 预览 state 在 `TaskPage` 上 ⇒ **关弹窗不影响预览**，预览可独立收回（头部关闭钮） |
| 与编辑分栏并存（U21，2026-10-01；2026-11-06 双 dock） | 新增 / 编辑任务也是**核心 PanelDock 的一条分栏** ⇒ 右侧可能同时有两条（预览 + 任务），互不干涉、不互斥；两条是独立 dock 实例，核心求和发布让位宽度，会话弹窗自动让位两条之和。本仓打开预览时按编辑 dock 的当前宽度算 `maxWidth`（避免把主区挤到最小宽以下） |
| 统一入口 | `openFile(sessionId, path)`：弹窗内（工具卡路径 / 正文 fileMentions / 交付卡）经 `onOpenFile(path)` 上提；整页（执行记录行的产出物）直调 ⇒ **两处同一个入口、同一份引擎**（决策 39 ③） |
| 宽度可调 | 归核心 PanelDock：左缘拖拽条 `dshpc-dock__resizer`，宽度由核心夹取并持久化（本仓不再存宽度 state / localStorage） |
| 崩溃隔离 | 核心 `FilePreview` 自带错误态（`previewRenderFailed`）；本仓不再包 `PreviewBoundary` |
| 数据契约防御 | 归核心 `FilePreview`：取值 / 解析失败一律走错误态，本仓不再按 wire schema 解析 |
| 目录浏览器 | 归核心 `FileBrowser`：list 成功即目录树、面包屑每段可回跳、▾ 下拉可切工作区；本仓只给路径与挂载点（2026-11-06 改接，详见 [dsh-plugin-core/adv/explorer —— 工作区文件浏览与选择](../dependencies/plugin-core-explorer.md)） |

---

## 四-B、交付登记路线（决策 40，已拍板·**待实施**）

> 用户 2026-09-28 定：**B（插件代写官方交付事件）+ C（提示词要求模型调 present 兜底）**；否决「插件 UI 自己画卡」。
> 前置（U11 文件预览 / 链接可点）已于 2026-09-28 真机走通；U12 交付登记的过程见 [`ledger/worklog/`](../../ledger/worklog/)。

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

1. `src/receipt.ts`：execute 改签 `(args, exec)`；成功后取 `exec.agent.session` + `exec.callId` + turn → `session.append('deliverables/presented', { turn, callId, files })`；**files = 已归一 / 安全闸过滤后的 outputs**（⚠️ mtime 新鲜度闸已于 2026-10-03 按用户拍板去掉，见 `docs/data/model.md` §一）。
2. turn 获取：注册时从 agentCtx 闭包注入 `sessionProjections`（present 包 inject 同名服务）；执行时 `stateOf(session,'turnBoundary')?.lastTurn`；**取不到即跳过**（不猜 turn —— 猜错会把卡挂到别的轮次或直接不显示）。
3. 兜底与可观测：整段 try/catch，失败只 `logger.warn`（原因 + 实例 id），**绝不抛给模型**（回执必须照常成功）；成功 log 一行「交付已登记 N 个文件」。
4. ~~C 兜底：补一句「请调用 present」~~ **已废止**：插件代写 `deliverables/presented`，派发提示词明确「不要调用 present，交付卡片由插件按主文件（outputs）统一生成」（`src/receipt.ts:receiptInstruction`）。此条是历史方案，与当前代码相反。
5. 质量门：typecheck + build + 冒烟新增断言（回执流式 append 事件 / 失败只记日志不影响回执结果 / files 取校验后的 outputs）；真机跑一轮任务验证：宿主会话视图出官方交付卡 + 我方弹窗出卡。

### 2026-11-09 更正：`files[].path` 必须是绝对路径

适用版本：宿主 `@deepseek-ai/dsh-client-ui-chat@0.2.0-rc.2`、核心 `dsh-plugin-core@0.34.0`（版本真源见 [`dsh-capabilities.md`](../dependencies/dsh-capabilities.md) / [`plugin-core-explorer.md`](../dependencies/plugin-core-explorer.md) 头部）；复核日期 2026-11-09；状态 ✅ 已落码；来源：本轮真机 ENOENT + 上述两包源码级事实清单。

| 项 | 结论 |
|---|---|
| 现象 | 交付卡点开报 `ENOENT`，路径被拼成 `<工作区>/_Manuals/…/task-outputs/…/report.md`，真实文件在 `<工作区>/task-outputs/…/report.md` |
| 根因 | `files[].path` 此前是**工作区相对路径**；官方 `fileAddressFor` 对非绝对路径「直接当相对路径、按会话 cwd 解析」，核心 `openFilePreview` 还要挑工作区锚点补前缀 ⇒ 锚点选错就多出一段 |
| 修法 | 只在两个边界绝对化，共用 `src/workspace-path.ts:absWorkspacePath`：① 回执写交付事件时，基准 = 派发冻结的 `workspacePath`；② 客户端 `query.ts:outputsOf` 读实例行时，基准 = 行快照 `workspacePath`。**库列与回执事件仍存相对**，零数据迁移；快照取不到基准 ⇒ 如实保留相对、不猜 |
| 配套 | 交付卡与弹窗补差卡的去重键共用 `canonicalPath`（两侧都按同一基准归一），避免「一绝对一相对」重复出卡 |

### 三条明确代价（用户已接受）

1. `callId` 是回执调用的 id ⇒ 卡片「用系统应用打开」按钮可能失效（容器无桌面本就不可用）；预览走路径，不受影响。
2. 拿不到 session / append 失败 ⇒ 静默跳过、只记日志，任务成败不受影响。
3. 文件清单取**归一 / 安全闸过滤后**的 outputs，不取模型原样填值 ⇒ 不会交付不存在或越界的文件。

---

## 五、复现核实的方法（换机器重跑）

解包源码目录在 /tmp（会丢），重取：`npm pack @deepseek-ai/<pkg>@0.1.7-rc.2` 解包读 `lib/types/**` 与 `README.zh.md`。本次核实过的包：`dsh-api-workspace-files`、`dsh-client-ui-sidebar-files`、`dsh-client-ui-sidebar-documentpreview`、`dsh-client-ui-sidebar-right`、`dsh-tool-present`、`dsh-client-ui-deliverables`、`dsh-api-session-controller`、`dsh-client-ui-conversation`（chat 包 = `dsh-client-ui-conversation`，其 README 描述 MarkdownDelegateProvider 与右栏打开链路）。

## 六、关联

- 会话弹窗现状：[session-view-ui-map.md](../dependencies/session-view-ui-map.md)（§十五 数据缺口表——fileMentions 在遗留清单里，与本专题合并做）
- 产出物数据源：决策 19（回执 outputs，场景 2 届时复核）、决策 22（工作区 = cwd 根）
- 弹窗渲染链：决策 36/37（mirror 组件树）、决策 38（U10，inject 边先例）

## 更新日志

- 2026-11-08 23:05:00：按 koc-code-docwriter 槽位规范从 design/ 迁入 features/（仅移动，正文未改）
