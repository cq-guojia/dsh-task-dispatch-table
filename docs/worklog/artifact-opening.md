# U11 · 产出物打开（artifact-opening）工作包

> ✅ **完成封卷**：U11 整条线真机验证通过（2026-09-28）。此后不再修改，新发现另开文件。

> 2026-09-27；决策 39；设计文档 [design/features/artifact-opening.md](../design/features/artifact-opening.md)。
> 本包当前进度：**落码完成 + 第二轮「交付文件官方化」落码（2026-09-28）**，待真机验证；冒烟 138 项全过，typecheck + build 过（dist 227.05 kB）。

## 一、过程叙事

### 第一轮：源码核实（先于一切讨论，仓库硬规则）

本地 node_modules 无官方包，改用此前工作包遗留的 /tmp 解包源码（0.1.7-rc.2，与宿主版本线一致）。核实动作与结论：

1. **chat 包（dsh-client-ui-conversation）**：README + `contract/slots.d.ts` 发现 `openFile(path, options?)` 契约与 `MarkdownDelegateProvider`（消息内文件链接 → 右栏打开，`#L24` 行锚）。
2. **api-session-controller**：`typert.remote-client.d.ts` 见 `session/openWorkspacePath` / `canOpenWorkspacePath` / `workspacePathApplications` 一族（原生桌面打开器）；`fileReferences` 仅服务 composer @-引用，与打开无关。
3. **npm registry 全清单**（`registry.npmjs.org/-/v1/search?text=@deepseek-ai&size=250`）命中四个关键包：`dsh-api-workspace-files`、`dsh-client-ui-sidebar-files`、`dsh-client-ui-deliverables`、`dsh-tool-present`，另 `dsh-client-ui-sidebar-documentpreview`。全部 `npm pack @0.1.7-rc.2` 解包读 README + 类型。
4. **关键结论**：官方有完整「文件预览」能力链（数据/预览/产出物/原生四层，见设计稿 §二①）；但**右栏预览对本插件不可用**——seat 按会话挂载（`dsh-client-ui-sidebar-right/service.d.ts`「no seat mounted … fails loudly」）+ 预览组件绑 sidebar 槽位（`documentpreview/index.d.ts`「Every import from another client plugin is a type」）。弹窗/整页激活时会话区被顶替 ⇒ 无 seat；整页化也救不了。
5. `session/openWorkspacePath` 原生层需 Host 桌面，容器部署排除「系统默认应用」方向。

### 第二轮起：与用户逐条拍板（四次收敛）

1. 用户先问「能不能全用官方原生」→ 汇报四层能力 + 右栏不可用的两条硬证据。
2. 用户质疑右栏结论 → 给出源码原文证据；用户转而问**任务列表页**能不能拉右栏 → 同一根因（整页面板顶替会话区，无 seat），答复不能；「弹窗改整页兼容右栏」的备选随之排除。
3. 用户确认「自画壳 + 官方底层」路线后，质疑「弹窗里再摞弹窗」→ 用户自己提出**分栏推压**形态（弹窗内右侧分栏 / 整页右滑分栏），判定可行且优于叠层。
4. 用户两条架构硬要求入决策：**统一 `openFile(path)` 入口**（链接处零写死，未来任务产出物同走此入口）+ **渲染底层全官方**。附交互样式稿（PureShowWidget 演示：点路径 → 弹窗内右侧分栏展开，md/代码/图片/PDF 四种形态可切换），用户看完拍板「按这个方案开始」。

### 第三轮：落码（2026-09-27，同日）

1. **读源码核契约再动手（仓库硬规则）**：`npm pack @deepseek-ai/dsh-api-workspace-files@0.1.7-rc.2` 读 `lib/*.js` 实现本体——`read(sessionId, path, {offset, limit})` 单页 2MiB / 5000 行、页文本以 `\n` 连接且末行不带终止符、翻页 offset = 页 offset + lines；`readBytes` 全量 ≤32MiB（multipart → Uint8Array）；错误抛出 bareCode 化（`workspace-file/not-found`、`gateway/lookup-not-found`、`too-large`（details.limit）、`not-text`、`not-regular-file`（details.kind））。
2. **落码顺序**：inject（package.json + index.ts `ctx.inject(['remote'])` 探 `remote.workspaceFiles`，探不到整体降级）→ 预览引擎 `file-preview.tsx`（`previewKind` 按扩展名分派 md/text/image/pdf；文本 read 分页 +「加载更多」；图片/PDF readBytes→Blob→objectURL 卸载 revoke）→ locales 11 键（zh/en）→ primitives.d.ts 补 `CodeBlock` / `fileMentions` 类型 → `GenericCommandCard`（diff 摘要路径 + argsRaw file_path/path「文件」行可点）→ `MessageItem.AssistantMarkdown`（MarkdownText 传 fileMentions）→ `session-view.ts`（openFile 状态 + `dsh-tdt-sv-split` 分栏推压 + collectFilePaths 词表收集 + makeFileMentions 归一化精确匹配优先 / 唯一 basename 兜底）→ archive-session-css.ts 样式 → smoke +10 断言。
3. **已知偏差（决策 39 认可范围内）**：官方 chatFileMentions provider 不可用 ⇒ 自建**会话级**词表（官方为 per-turn）；fileMentions resolve 不出保持惰性 code（renderer never guesses，官方同款行为）。
4. **工具链故障与绕行**：本会话 Edit 工具后半段持续把 old_string 序列化成带 `: ` 前缀（not found）、Write 工具对 ts/tsx 持续 IDE Command timeout ⇒ 全部文件改动改用 Shell + `node <<'PATCH_EOF'` heredoc 锚点校验式补丁（每处替换前 `src.includes(oldStr)` 校验唯一性）。
5. **TS 5.9 Blob 泛型**：`new Blob([page.data])` 报 Uint8Array<ArrayBufferLike> 不能赋 BlobPart ⇒ `page.data as unknown as BlobPart`。
6. **质量门**：typecheck 全过；build dist/client.js 190.21 kB；冒烟 **124 项全过**（原 114 + 新增 10：预览组件在 bundle / 分栏类名 / onOpenFile+fileMentions 单一入口 / 词表函数 / workspaceFiles+readBytes 真实取数 / 错误码四分支 / 加载更多+eof / objectURL 生命周期 / md+CodeBlock / inject 清单含 dsh-api-workspace-files）。

### 第四轮：交付文件官方化 + 入口补全（2026-09-28，真机反馈「没有入口」后）

1. **真机反馈**：预览分栏已落码但「文件都没连过去」——点写入文件的路径只是展开明细；官方会话里能点的地方我们不可点。另问：官方会话尾部那张文件卡（带简介）是什么、为什么只有一个会话有。
2. **读官方源码再动手（仓库硬规则）**：解包 `dsh-client-ui-deliverables@0.1.7-rc.2` 读实现本体，官方「交付文件」全貌核实：
   - **交付文件行**：`present` 工具调用经 `tool.call.toolview` 槽位（key='present'）挂官方 `PresentRow`——标题「交付文件」+ `IconDeliverDocRegular`，折叠摘要 = 状态词（准备交付/正在交付/已交付/交付失败/已中断，`row.*` 词典）+ `argsRaw.files[].path` 逗号连接（**官方纯文本不可点**），展开体 = 工具结果原文。
   - **交付文件卡**：`conversation.chat.turnTail` 槽位挂官方 `DeliverablesTail` → `PresentedFileCard` 网格（FileTypeIcon + basename + 简介，简介空则回退扩展名大写；整卡可点 → openFile 右栏预览；>4 张折叠 +「全部 N 个文件」）。数据真源 = `deliverables/presented` 事件（present 工具触发的宿主事件）。
   - **回答用户疑问**：那张卡 = 模型调用了 `present`（交付文件）工具才有的宿主事件渲染，**「只有一个对话有」是因为只有那个任务的模型调了 present**；卡上方灰字「此主机没有可用的桌面…」= 官方 `presented.unavailable`（容器部署无桌面，原生打开不可用，文件仍可侧栏预览）。
   - **官方「哪些能点」的规律**：① 工具行摘要路径（read/write/edit，error/stopped 态不可点）；② 交付文件卡整卡；③ 回答正文里的行内 code 文件引用 = `chatFileMentions`（**仅当该轮 produced（write/edit 成功）或 presented（present 交付）过该路径**，精确路径或唯一 basename 命中，其余保持惰性 code 不可点）。
3. **数据可达性**：`deliverables/presented` 事件不在我们消费的 keyed 节点流里 ⇒ 从 `present` 工具调用参数 `files[]`（path + description）**同源推导**（`collectDeliveredFiles`：settled 且成功、按 turn 归组、按路径去重后者覆盖——与官方 `presentedForClosing` 的 map 语义一致）。改动文件卡（ChangedFiles）依赖 Host git 摘要 HTTP 路由，本弹窗无该通道 ⇒ 不渲染（与官方「summary 未就绪不画」同态）。
4. **落码清单**：`mirror/Deliverables.tsx` 新建（PresentRowMirror + DeliverablesGridMirror/DeliveredFileCard，逐值照抄）；session-view.ts：tool-call/legacy tool-result 分流 present → PresentRowMirror、turn-tail 分支接卡网格（closing 为 null 也渲染，照官方 turnTail 插槽语义）、collectFilePaths 收录 present 交付路径（正文 fileMentions 命中率对齐官方）；official-classes.ts 扩 `dsh-client-ui-deliverables/` 前缀（PresentRow / Deliverables 模块）；locales 13 键（`row.*`/`presented.*` 逐字，预览字样按弹窗分栏语境改写——官方是「在侧边栏预览」）；archive-session-css.ts 兜底样式（PresentRow 3 类 + Deliverables 卡网格逐值含暗色与 container query）；index.ts 补 workspaceFiles 未就位诊断日志（真机排障锚点：链接全降级纯文本时先看这行）。
5. **真机「没有入口」根因确认并修复（2026-09-28 第五轮）**：用户真机截图——读取/写入行路径全部不可点。根因 = **注入键缺 dotted `remote.workspaceFiles`**：官方 client 模块 `inject = ['resources','remote','remote.workspaceFiles']`，dotted 键的语义是「等命名空间挂上 remote 才启动」（官方 apply 体访问的正是 `ctx.remote.workspaceFiles`）；我方只注 `['remote']` ⇒ 回调在 remote 服务就位瞬间触发、此刻 workspaceFiles 尚未挂上、回调不重触发 ⇒ 探测永久失败 ⇒ `fileOpen` 全程 undefined ⇒ 一切 fileLink 降级纯文本。修复 = inject 补 dotted 键 + 取值双保险（`sub['remote.workspaceFiles'] ?? remote.workspaceFiles`）+ 启动时「等待…」/「已就位 / 未就位」三条日志。typecheck + build（dist 227.21 kB）+ 冒烟 +1 = **139 项全过**。
6. **质量门**：typecheck 全过；build dist/client.js 227.05 kB；冒烟 +8 = **138 项全过**（PresentRow 镜像 / 卡网格 / 折叠上限 / 词典齐备 / present 路径词表 / deliverables 类前缀 / 兜底样式 / 诊断日志）。

### 第六轮：页面级唯一 dock + 拖拽 + 崩溃隔离 + 记录行产出链接（2026-09-28，自主拍板）

1. **真机三条反馈**：① 点文件路径有的直接黑屏（面板整个挂掉）；② 有的分栏出来了但正文是「undefined undefined undefined」+ 加载更多；③ 分栏不能左右拉宽。另提出形态诉求：**弹窗与整页共用同一个预览面**，预览从屏幕最右挤出、把整页（含弹窗）往左推，弹窗不遮盖它、可关弹窗也可独立收回预览。
2. **黑屏根因（栈 + 源码双向定位）**：错误栈 `at g8 … endsWith` 起点在 `file-preview.tsx:206 Promise.then` ⇒ `page.text` 为 undefined ⇒ 该值被喂给官方 `MarkdownText` / `CodeBlock`，内部 `endsWith` 抛错 ⇒ React 卸载整页（宿主日志 `slot entry crashed in 'main'`）。官方 wire 契约核对：`dsh-api-workspace-files/lib/typert.remote-client.js` 的 `read_result` schema = `{offset, text, lines, eof, absolutePath, version, bytes?}`、host 实现 `lib/index.js:425` 也返回 `text` ⇒ **契约侧没问题，是运行期取值面有偏差**；故按「先止血 + 留取证」处理，不猜字段。
3. **三处修复**：① `PreviewBoundary` 错误边界包住预览体 ⇒ 渲染异常只降级预览区，不再拖垮整页；② `textPageOf` / `bytesOf` 按契约防御解析（兼容 `{value}` 包一层），取不到 text/data 走错误态并 `console.warn` 打印真实形状（下轮据此定位）；③ 仅在拿到字符串 / Uint8Array 时才渲染官方组件。
4. **形态改造（决策记录 = 设计稿 §四-C）**：预览 state 上提到 `TaskPage`，`FilePreviewPanel` 增 `dock` 形态（fixed 屏幕最右、z-index 1030）+ `onResizeStart`；根容器 `#dsh-tdt-root` 挂 `--dsh-tdt-preview-w`，整页 `marginRight` 与弹窗 overlay `right` 同时让位 ⇒ 弹窗自动居中于剩余区、不被遮盖；弹窗内分栏（`.dsh-tdt-sv-split` / `.dsh-tdt-sv-chatpane`）删除，`SessionViewModal` 改收 `onOpenFile` 上提；**关弹窗不动预览状态**（dock 独立于 viewing）。
5. **拖拽调宽**：dock 左缘 6px 拖拽条（pointerdown/move/up）；拖动期间只 `style.setProperty('--dsh-tdt-preview-w')` 不重渲染整页，松手落 state + localStorage（`dsh-tdt-preview-width`）；区间 320px ~ 视口 70%，默认 460px。
6. **执行记录行「产出」列**：`task_instances.outputs`（决策 32③ 完成瞬间写回，真值）经 `parseOutputs`（JSON 数组 / 逗号串兼容）渲染成链接，点之走同一个 `openFile(sessionId, path)` ⇒ 整页也能开预览（无预览能力时降级为文件名文本）。
7. **质量门**：typecheck 全过；build dist/client.js 237.20 kB；冒烟 +7 = **146 项全过**（dock 与让位变量 / overlay 让位 / 拖拽+持久化 / 错误边界 / 防御解析 / 记录行产出链接 / 弹窗不再自带分栏）。

### 第七轮：真机三反馈（信封错误 / 滚动条 / 文本渲染对齐官方）（2026-09-28）

1. **信封真相（用户贴日志）**：`read 返回形状不符契约（无 text 字段）：{ok,error}` ⇒ **typert 远端面失败时 resolve `{ok:false, error}` 而不是 reject**。成功路径原本就能取到（`{value}` 包一层已在防御解析内）⇒「好多文件正常、个别报错」= 个别文件读取失败（如不在工作区 / 已删除），此前被当成空内容。修：`unwrapEnvelope` 先剥信封，`ok:false` 时把 `error` 交给官方 `errView`（bareCode 分支出正确文案）。
2. **滚动条**：dock 原是 fixed 浮层，盖住宿主内容区右缘的滚动条 ⇒ 改成**占布局的分栏**：根容器 `#dsh-tdt-root` 横向 flex（内容区 `flex:1 1 auto; min-width:0`，dock `position:sticky; top:0; height:100vh; width:var(--dsh-tdt-preview-w)`）——整页被真正挤窄、滚动条归内容区，关掉预览即回满宽；弹窗 overlay 仍用 `right` 变量让位。用户要求「分栏压过来，不是盖上去」即此。
3. **文本渲染对齐官方**（读 `dsh-client-ui-sidebar-documentpreview` 实现本体）：
   - 官方 code/CodeBody（`lib/client.js:5033`）：`CodeBlock{ code, lang: languageForPath(path), lineNumbers: true, wrap, copyLabel/copiedLabel, toolbarLabels{codeLabel,wrapLabel,unwrapLabel} }`，外壳 `.renderer[data-code-preview]` + `.code` 两个类（CodeBody.module.css）。
   - 官方 markdown/MarkdownBody（`:1586`）：`MarkdownText{ text, streaming:!eof, labels, pathImages }`——**预览层没有「编辑」**（编辑是编辑器 tab，不在预览契约）。
   - 落码：所有文本（json/js/ts/css/txt…）统一走 CodeBody 同款 CodeBlock（行号 + languageForPath + 官方 toolbar）；md 默认渲染视图 + 右上角「源码」钮切 CodeBlock（lang=markdown，经 languageForPath）；官方类发现扩 `ui-sidebar-documentpreview` 前缀（CodeBody: renderer/code），缺失时走自绘兜底。
4. **质量门**：typecheck 全过；build（dist ≈240 kB）；冒烟 +4 = **150 项全过**。

### 第八轮：真机两反馈（拖拽条高亮 / md 切换样式）（2026-09-28）

1. **拖拽条**：去掉块状高亮（用户明令），只保留 `col-resize` 光标；hover/拖拽时左缘画 **1px 细线**（深色主题纯白、浅色纯黑，55% 透明，`body[data-ds-dark-theme]` 分支）。
2. **md 两态切换改官方分段控件**：用户贴官方「预览|编辑」分段样式图，要求切换钮放进 CodeBlock 工具条红框位（语言标签右侧、图标左侧），**不加行、不套框**。核实 `CodeBlock`（`lib/types/markdown/CodeBlock.d.ts`）**无自定义插槽 prop**（toolbar 是内部组件）⇒ 用绝对定位 overlay：源码态 `top:3px;right:76px` 叠进工具条，渲染态 `top:8px;right:8px` 浮于渲染视图右上角；样式 = 官方分段（灰底圆角容器 + 选中段对比底胶囊，深浅主题分支）。顺带修「短 md 也有横向滚动条」：md 源码态传 `wrap:true`（官方语义 = 采用调用方换行偏好并隐藏工具条换行钮，md 是 prose 换行合理；代码文件不传 = 保留官方换行钮）。删掉上一轮的 `mdbar` 外加行（正是顶出滚动条的来源）。
3. **质量门**：typecheck + build（dist ≈241 kB）+ 冒烟 151 项全过（+2 −1：分段控件与无外加行 / resizer 细线）。

### 第九轮：顶栏按钮组 + 拖拽条边线 + 刷新重读（2026-09-28）

1. **顶栏按钮组（替代飘在内容区的切换）**：用户要求 md 的「预览|源码」切换、以及复制/刷新/关闭统一放到顶栏最右（关闭按钮那一行），不飘进内容。
   - 顺序（左→右）：`[.md 时] 预览|源码 分段` · `复制路径(IconCopyOutlineRegular)` · `刷新(IconRefreshOutlineRegular)` · `关闭(IconCloseOutlineRegular)`；三个动作钮全用 dsh 自带 icon、无中文文字（aria-label 仍用文案键）。
   - **刷新 icon 核实**：手搓 `primitives.d.ts` 原只抄了部分图标，列表里没有刷新；实测 dsh `@0.1.7-rc.2` 确有 `IconRefreshOutlineRegular`（npm pack 解包确认），已补进类型与 import。
   - md 两态 `sourceView` 从 `TextPreview` 内部 **提升** 到 `FilePreviewPanel` 顶层持有并下传（切换控件只在顶栏），内容体按 `showSource` 渲染，不再 overlay 任何控件。
   - **刷新重读**：`FilePreviewPanel` 持 `reloadNonce`，刷新钮自增；`TextPreview` 与 `BytesPreview` 的 read 依赖加上它，触发重读（文本重读第一页 / 图片 PDF 重读字节）。
   - **路径跑马灯**：顶栏路径超长 `text-overflow:ellipsis` 省略；hover 时 JS 把内层改 `maxWidth:none` 并 `translateX` 向左平移 3s 露出完整路径（仅溢出时滚动，`onMouseLeave` 复位）。
   - **底部复制路径按钮删除**：错误/空态 `ErrBox` 不再渲染复制路径（顶栏已有，用户明确"下面不需要"）；`ErrBox` 精简为仅文案。
2. **拖拽条高亮修正（续）**：上一轮把高亮放在 resizer 的 `border-right`（x=6，与内容交界），但 dock 自身 `border-left`（x=0，原线）仍常驻灰显，于是 hover 时仍呈现"两条"。用户明确：**不要画任何新线，就让原来那条高亮**。最终方案——彻底不在 resizer 上画边框，改用 CSS `:has()` 让 dock 在 resizer `:hover`/`:active` 时把自身常驻的 `border-left` 变色（深纯白 `rgba(255,255,255,1)` / 浅纯黑 `rgba(0,0,0,1)`）。零新线、只亮原线。注意 resizer 是 dock 子元素，CSS 无父选择器，故必须靠 `:has()` 上溯（宿主 Chromium 支持）。
3. **质量门**：typecheck + build（dist ≈246 kB）+ 冒烟 153 项全过（+2 断言：顶栏按钮组 / 拖拽条右缘边线；md 切换不再 overlay）。

## 二、证据与坐标

- `dsh-api-workspace-files/README.zh.md`：read/readBytes/stat/list/changes 全形状 + 错误码 + inject 清单 `['resources','remote','remote.workspaceFiles']`。
- `dsh-client-ui-sidebar-right/lib/types/client/service.d.ts`：ISidebarRight 全文（seat 生命周期、openResource/openResourceIn/float/closeTab、mounted undefined 条款）。
- `dsh-client-ui-sidebar-documentpreview/lib/types/client/index.d.ts` + `TextPreview.d.ts`：PropsRuntime<'sidebar.right.pane.tab'> 槽位绑定、「跨插件只许 import 类型」条款。
- 解包目录（易失）：/tmp/dshsrc/*、/tmp/dshfiles、/tmp/dshsbfiles、/tmp/dshdocprev、/tmp/dshsbr；重取方法见设计稿 §五。
- **交付登记（2026-09-28 核对，供 U12 实施复用；包取法同上）**：`dsh-tool-present/lib/index.js` execute + `ctx.on('tools/result')` 事件写入段、`lib/types/types.d.ts` 事件 declare-merge、`README.zh.md`「限制与延期工作」；`dsh-session/lib/types/index.d.ts:246` `append` 签名与 `types.d.ts:442` SurfaceEventType 集合；`dsh-tools/lib/types/index.d.ts:217/229`（callId / agent）、`:305` ToolRunContext；`dsh-agent/lib/types/runtime-types.d.ts:143` Agent.session；`dsh-agent-loop/lib/types/index.d.ts:23` turnBoundary.lastTurn；`dsh-api-workspace-files/lib/client.js` inject 声明（**含 dotted `remote.workspaceFiles`**——2026-09-28 注入根因）与 `apply(ctx)` 里的 `ctx.remote.workspaceFiles` 访问。

## 三、遗留与下一步

- **待真机验证**（通过后用户说「提交」再 commit+push）：① 分栏推压形态（点路径右侧展开、对话左压、关闭恢复）；② 工具卡路径点击（diff 摘要路径 + 无 diff 工具「文件」行 + **写入/读取/编辑行摘要路径**）；③ md 正文文件链接可点（含 present 交付路径），未收录路径保持惰性 code；④ 四类预览（md 渲染 / 代码高亮 / 图片 / PDF）；⑤ 文本「加载更多」翻页；⑥ 错误态四分支（不存在 / 过大 / 二进制 / 目录·symlink）+ 复制路径；⑦ **交付文件行**（present 调用 = 「交付文件 已交付 …」行，展开见结果原文）；⑧ **交付文件卡**（turn 尾部网格，整卡点击开预览，>4 张折叠）；⑨ 控制台确认 `remote.workspaceFiles 已就位` 日志（未就位 = 注入问题，另查）。
- 场景 2 暂缓；届时产出真源 = `deliverables/presented` + `workspace/changes`（决策 39⑤），openFile 入口已就位。
- ~~与 ui-map 遗留清单的 fileMentions 合并做~~ → 已随本轮落码完成（正文文件引用可点 = fileMentions 词表）。
