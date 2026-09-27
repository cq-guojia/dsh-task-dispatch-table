# U11 · 产出物打开（artifact-opening）工作包

> 2026-09-27；决策 39；设计文档 [design/artifact-opening.md](../design/artifact-opening.md)。
> 本包当前进度：**落码完成 + 第二轮「交付文件官方化」落码（2026-09-28）**，待真机验证；冒烟 138 项全过，typecheck + build 过（dist 227.05 kB）。

## 一、过程叙事

### 第一轮：源码核实（先于一切讨论，AGENTS.md 第 4 条）

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

1. **读源码核契约再动手（AGENTS.md 第 4 条）**：`npm pack @deepseek-ai/dsh-api-workspace-files@0.1.7-rc.2` 读 `lib/*.js` 实现本体——`read(sessionId, path, {offset, limit})` 单页 2MiB / 5000 行、页文本以 `\n` 连接且末行不带终止符、翻页 offset = 页 offset + lines；`readBytes` 全量 ≤32MiB（multipart → Uint8Array）；错误抛出 bareCode 化（`workspace-file/not-found`、`gateway/lookup-not-found`、`too-large`（details.limit）、`not-text`、`not-regular-file`（details.kind））。
2. **落码顺序**：inject（package.json + index.ts `ctx.inject(['remote'])` 探 `remote.workspaceFiles`，探不到整体降级）→ 预览引擎 `file-preview.tsx`（`previewKind` 按扩展名分派 md/text/image/pdf；文本 read 分页 +「加载更多」；图片/PDF readBytes→Blob→objectURL 卸载 revoke）→ locales 11 键（zh/en）→ primitives.d.ts 补 `CodeBlock` / `fileMentions` 类型 → `GenericCommandCard`（diff 摘要路径 + argsRaw file_path/path「文件」行可点）→ `MessageItem.AssistantMarkdown`（MarkdownText 传 fileMentions）→ `session-view.ts`（openFile 状态 + `dsh-tdt-sv-split` 分栏推压 + collectFilePaths 词表收集 + makeFileMentions 归一化精确匹配优先 / 唯一 basename 兜底）→ archive-session-css.ts 样式 → smoke +10 断言。
3. **已知偏差（决策 39 认可范围内）**：官方 chatFileMentions provider 不可用 ⇒ 自建**会话级**词表（官方为 per-turn）；fileMentions resolve 不出保持惰性 code（renderer never guesses，官方同款行为）。
4. **工具链故障与绕行**：本会话 Edit 工具后半段持续把 old_string 序列化成带 `: ` 前缀（not found）、Write 工具对 ts/tsx 持续 IDE Command timeout ⇒ 全部文件改动改用 Shell + `node <<'PATCH_EOF'` heredoc 锚点校验式补丁（每处替换前 `src.includes(oldStr)` 校验唯一性）。
5. **TS 5.9 Blob 泛型**：`new Blob([page.data])` 报 Uint8Array<ArrayBufferLike> 不能赋 BlobPart ⇒ `page.data as unknown as BlobPart`。
6. **质量门**：typecheck 全过；build dist/client.js 190.21 kB；冒烟 **124 项全过**（原 114 + 新增 10：预览组件在 bundle / 分栏类名 / onOpenFile+fileMentions 单一入口 / 词表函数 / workspaceFiles+readBytes 真实取数 / 错误码四分支 / 加载更多+eof / objectURL 生命周期 / md+CodeBlock / inject 清单含 dsh-api-workspace-files）。

### 第四轮：交付文件官方化 + 入口补全（2026-09-28，真机反馈「没有入口」后）

1. **真机反馈**：预览分栏已落码但「文件都没连过去」——点写入文件的路径只是展开明细；官方会话里能点的地方我们不可点。另问：官方会话尾部那张文件卡（带简介）是什么、为什么只有一个会话有。
2. **读官方源码再动手（AGENTS.md 第 4 条）**：解包 `dsh-client-ui-deliverables@0.1.7-rc.2` 读实现本体，官方「交付文件」全貌核实：
   - **交付文件行**：`present` 工具调用经 `tool.call.toolview` 槽位（key='present'）挂官方 `PresentRow`——标题「交付文件」+ `IconDeliverDocRegular`，折叠摘要 = 状态词（准备交付/正在交付/已交付/交付失败/已中断，`row.*` 词典）+ `argsRaw.files[].path` 逗号连接（**官方纯文本不可点**），展开体 = 工具结果原文。
   - **交付文件卡**：`conversation.chat.turnTail` 槽位挂官方 `DeliverablesTail` → `PresentedFileCard` 网格（FileTypeIcon + basename + 简介，简介空则回退扩展名大写；整卡可点 → openFile 右栏预览；>4 张折叠 +「全部 N 个文件」）。数据真源 = `deliverables/presented` 事件（present 工具触发的宿主事件）。
   - **回答用户疑问**：那张卡 = 模型调用了 `present`（交付文件）工具才有的宿主事件渲染，**「只有一个对话有」是因为只有那个任务的模型调了 present**；卡上方灰字「此主机没有可用的桌面…」= 官方 `presented.unavailable`（容器部署无桌面，原生打开不可用，文件仍可侧栏预览）。
   - **官方「哪些能点」的规律**：① 工具行摘要路径（read/write/edit，error/stopped 态不可点）；② 交付文件卡整卡；③ 回答正文里的行内 code 文件引用 = `chatFileMentions`（**仅当该轮 produced（write/edit 成功）或 presented（present 交付）过该路径**，精确路径或唯一 basename 命中，其余保持惰性 code 不可点）。
3. **数据可达性**：`deliverables/presented` 事件不在我们消费的 keyed 节点流里 ⇒ 从 `present` 工具调用参数 `files[]`（path + description）**同源推导**（`collectDeliveredFiles`：settled 且成功、按 turn 归组、按路径去重后者覆盖——与官方 `presentedForClosing` 的 map 语义一致）。改动文件卡（ChangedFiles）依赖 Host git 摘要 HTTP 路由，本弹窗无该通道 ⇒ 不渲染（与官方「summary 未就绪不画」同态）。
4. **落码清单**：`mirror/Deliverables.tsx` 新建（PresentRowMirror + DeliverablesGridMirror/DeliveredFileCard，逐值照抄）；session-view.ts：tool-call/legacy tool-result 分流 present → PresentRowMirror、turn-tail 分支接卡网格（closing 为 null 也渲染，照官方 turnTail 插槽语义）、collectFilePaths 收录 present 交付路径（正文 fileMentions 命中率对齐官方）；official-classes.ts 扩 `dsh-client-ui-deliverables/` 前缀（PresentRow / Deliverables 模块）；locales 13 键（`row.*`/`presented.*` 逐字，预览字样按弹窗分栏语境改写——官方是「在侧边栏预览」）；archive-session-css.ts 兜底样式（PresentRow 3 类 + Deliverables 卡网格逐值含暗色与 container query）；index.ts 补 workspaceFiles 未就位诊断日志（真机排障锚点：链接全降级纯文本时先看这行）。
5. **真机「没有入口」根因确认并修复（2026-09-28 第五轮）**：用户真机截图——读取/写入行路径全部不可点。根因 = **注入键缺 dotted `remote.workspaceFiles`**：官方 client 模块 `inject = ['resources','remote','remote.workspaceFiles']`，dotted 键的语义是「等命名空间挂上 remote 才启动」（官方 apply 体访问的正是 `ctx.remote.workspaceFiles`）；我方只注 `['remote']` ⇒ 回调在 remote 服务就位瞬间触发、此刻 workspaceFiles 尚未挂上、回调不重触发 ⇒ 探测永久失败 ⇒ `fileOpen` 全程 undefined ⇒ 一切 fileLink 降级纯文本。修复 = inject 补 dotted 键 + 取值双保险（`sub['remote.workspaceFiles'] ?? remote.workspaceFiles`）+ 启动时「等待…」/「已就位 / 未就位」三条日志。typecheck + build（dist 227.21 kB）+ 冒烟 +1 = **139 项全过**。
6. **质量门**：typecheck 全过；build dist/client.js 227.05 kB；冒烟 +8 = **138 项全过**（PresentRow 镜像 / 卡网格 / 折叠上限 / 词典齐备 / present 路径词表 / deliverables 类前缀 / 兜底样式 / 诊断日志）。

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
