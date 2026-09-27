# U11 · 产出物打开（artifact-opening）工作包

> 2026-09-27；决策 39；设计文档 [design/artifact-opening.md](../design/artifact-opening.md)。
> 本包当前进度：**落码完成（2026-09-27，同日）**，待真机验证；冒烟 124 项全过，typecheck + build 过（dist 190.21 kB）。

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

## 二、证据与坐标

- `dsh-api-workspace-files/README.zh.md`：read/readBytes/stat/list/changes 全形状 + 错误码 + inject 清单 `['resources','remote','remote.workspaceFiles']`。
- `dsh-client-ui-sidebar-right/lib/types/client/service.d.ts`：ISidebarRight 全文（seat 生命周期、openResource/openResourceIn/float/closeTab、mounted undefined 条款）。
- `dsh-client-ui-sidebar-documentpreview/lib/types/client/index.d.ts` + `TextPreview.d.ts`：PropsRuntime<'sidebar.right.pane.tab'> 槽位绑定、「跨插件只许 import 类型」条款。
- 解包目录（易失）：/tmp/dshsrc/*、/tmp/dshfiles、/tmp/dshsbfiles、/tmp/dshdocprev、/tmp/dshsbr；重取方法见设计稿 §五。

## 三、遗留与下一步

- **待真机验证**（通过后用户说「提交」再 commit+push）：① 分栏推压形态（点路径右侧展开、对话左压、关闭恢复）；② 工具卡路径点击（diff 摘要路径 + 无 diff 工具「文件」行）；③ md 正文文件链接可点，未收录路径保持惰性 code；④ 四类预览（md 渲染 / 代码高亮 / 图片 / PDF）；⑤ 文本「加载更多」翻页；⑥ 错误态四分支（不存在 / 过大 / 二进制 / 目录·symlink）+ 复制路径。
- 场景 2 暂缓；届时产出真源 = `deliverables/presented` + `workspace/changes`（决策 39⑤），openFile 入口已就位。
- ~~与 ui-map 遗留清单的 fileMentions 合并做~~ → 已随本轮落码完成（正文文件引用可点 = fileMentions 词表）。
