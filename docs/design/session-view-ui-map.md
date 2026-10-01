# 会话弹窗「官方样式对照表」（专属任务文档）

> **状态**：✅ 持续维护（官方升级后跑提取命令 diff，见 §〇）
> **来源**：`@deepseek-ai/dsh-client-ui-chat` / `-primitives` / `-conversation` @0.1.7-rc.2 源码原文摘录
> **配套**：[`dsh-capabilities.md`](dsh-capabilities.md)（宿主能力）· 插件自有控件样式走 [`ui-style-guide.md`](ui-style-guide.md)，本表只管**镜像官方**的部分
>
> **这是什么**：把官方会话页面的**每一个元素**——组件、CSS module、语义类、关键样式值（间距 / 字号 / 颜色变量）、所需数据——整理成一张**可长期维护的对照表**。
> **怎么用**：实现时**逐行对着表做**，一行做完勾一行；官方升级后跑一遍「提取命令」diff 出变化，再照表补。**不再凭观感瞎改。**
> **事实来源**：`@deepseek-ai/dsh-client-ui-chat@0.1.7-rc.2`、`@deepseek-ai/dsh-client-ui-primitives@0.1.7-rc.2`、`@deepseek-ai/dsh-client-ui-conversation@0.1.7-rc.2` 的 `lib/client.js`（内嵌 CSS module 原文）与 `lib/types/*.d.ts`。CSS 值均为**源码原文摘录**，非目测。
> 状态图例：✅ 已按官方实现 ｜ 🟡 部分（有差距）｜ ❌ 未做 ｜ ⛔ 官方契约不允许 —— **这是施工快照**，进度真源见 [`../PROGRESS.md`](../PROGRESS.md)，本表只管「官方长什么样」。

---

## 〇、维护流程：官方升级后怎么核对

```bash
# 1. 取与宿主一致的版本（dist-tags 里挑）
npm view @deepseek-ai/dsh-client-ui-chat dist-tags --json
# 2. 下载解包
cd /tmp && npm pack @deepseek-ai/dsh-client-ui-chat@<版本> && tar xzf *.tgz
# 3. 列出每个 CSS module 的语义类清单（类名 = <hash>_<语义名>，hash 可能以 _ 开头！）
node -e "
const fs=require('fs');const lines=fs.readFileSync('package/lib/client.js','utf8').split('\n');
for (let i=0;i<lines.length;i++){
  const m=lines[i].match(/const tagId\\\$[0-9]+ = \"@deepseek-ai\/dsh-client-ui-chat\/([A-Za-z]+)\.module\.css\";/);
  if(!m)continue;
  const css=(lines[i-1].match(/const css\\\$[0-9]+ = \"([\s\S]*)\";/)||[])[1]||'';
  console.log('### '+m[1]+' ('+css.length+' chars)'); console.log(css.slice(0,900));
}"
# 4. 与本文件 diff：新增 module？语义类改名？间距/字号/变量值变了？
```

> ⚠️ 官方 CSS module 的类名 = `<hash>_<语义名>`，**hash 可能以 `_` 开头**（如 `._5OnbHa_root`）——我们运行时解析器必须按**末位**下划线切分（已在 `official-classes.ts` 修正，冒烟有回归断言）。

---

## 一、页面骨架（`ChatView.module.css`，12 类）

语义类：`frame, root, scroll, column, flowItem, hint, older, callRow, openError, modalAction, toBottom, toBottomSlot`

| 元素 | 类 | 关键样式（原文摘录） | 我们 |
|---|---|---|---|
| 会话框 | `frame` | `flex-direction:column; flex:auto; min-height:0; display:flex; position:relative; container-type:inline-size` | ✅（ocOr 官方类，缺失回退 `.dsh-tdt-sv-body`） |
| 根容器 | `root` | `flex-direction:column; flex:auto; min-height:0; display:flex; position:relative; overflow:visible clip` | ✅ |
| 滚动区 | `scroll` | `min-height:0; padding:16px calc(var(--dsh-composer-side-clearance) + 16px); flex:auto; overflow-y:auto; container-type:inline-size` | ✅ |
| 内容列 | `column` | `max-width:var(--dsh-chat-content-width); flex-direction:column; width:100%; margin:0 auto; display:flex` | ✅ |
| **消息间距** | `column` 后代规则 | `.column>:not([hidden]):not(.flowItem:empty)~…{margin-top:var(--dsh-chat-flow-gap,16px)}` ← **块间距 = flow-gap，默认 16px，只对 `.flowItem` 兄弟生效** | ✅（我们每项都包了 flowItem） |
| 单条流式项 | `flowItem` | `min-width:0`；`[data-turn-process-answer]{--dsh-chat-flow-gap:8px}`（过程内收紧为 8px）；`:empty{height:0}` | ✅ |
| 加载提示 | `hint` | `color:var(--dsw-alias-label-tertiary); font-size:var(--dsh-content-font-size-secondary,13px); line-height:calc(18px + var(--dsh-content-font-delta-secondary,0px))` | ✅ |
| 加载更早按钮 | `older` | `justify-content:center;display:flex`；`button{border-radius:var(--dsw-radius-sm);color:label-secondary;background:interactive-bg-hover-solid;padding:4px 12px;font-size:12px}` | ✅（按钮样式未完全对齐）🟡 |
| 「到底部」悬浮 | `toBottomSlot` / `toBottom` | 悬浮在底部；`toBottom{width:34px;height:34px;border-radius:100px;background:button-floating-fill;box-shadow:elevation-panel}` | ❌ |
| 打开失败提示 | `openError` | `color:var(--dsw-alias-state-error-primary); font-size:secondary` | ❌（我们用 hint 文案代替） |
| 读文件调用行 | `callRow` | `border-radius:var(--dsw-radius-sm)` | ❌ |

**骨架依赖的变量**：`--dsh-chat-content-width`（默认 748px）、`--dsh-chat-flow-gap`（默认 16px）、`--dsh-composer-side-clearance`（16px）、`--dsh-content-font-size`（14px）/`-secondary`（13px）、`--dsh-content-font-delta`。

---

## 二、用户消息（`MessageItem.module.css`，32 类）

| 元素 | 类 | 关键样式 | 我们 |
|---|---|---|---|
| 用户行 | `userRow` | `flex-direction:column; align-items:flex-end; gap:6px; display:flex`（**右对齐**） | ✅ |
| 用户栈 | `userStack` | `max-width:min(calc(var(--dsh-chat-content-width,748px) * .702), 82%); gap:8px; align-items:flex-end` | ✅ |
| **气泡** | `bubble` | `background:var(--dsw-specific-bubble); border-radius:var(--dsw-radius-xl); font-size:var(--dsh-content-font-size,14px); line-height:calc(22px + delta); color:label-primary; white-space:pre-wrap; word-break:break-word; padding:10px 16px` | ✅ |
| 附件行 | `attachmentRow`/`fileCard`/`fileIcon`/`fileContent`/`fileName`/`fileMeta` | 附件/文件卡（task 会话基本没有） | ❌（无数据） |
| 引用摘要 | `referenceSummary` | 13px tertiary | ❌ |
| 上下文行 | `contextRow` | 上下文注入消息行 | ❌ |
| 轮次失败 | `turnErrorRow/turnErrorTitle/turnErrorDot/turnErrorCode/turnErrorMessage/turnErrorCopy` | 错误横幅组 | ✅（官方 `TurnErrorItem` 照抄：StateDot(error) + 红标题 + 灰原因 + 右侧 `<code>` 机器码） |
| 限长 | `maxTokensTitle` | — | ✅（官方 `TurnMaxTokensItem` 照抄：StateDot(warning) + 警示标题 + 提示语） |
| 重试 | `retryRow/retrySummary/retryText/retryDetails/retryDetailLabel` | — | ✅（官方 `ModelRetryItem` 照抄：`<details>` 折叠 + active 倒计时/shimmer） |
| 压缩 | `compactionRow/compactionTitle/compactionSummary/compactionBody/…` | 上下文压缩展示 | ❌（决策 28 过滤掉） |

> **注意**：`MessageItem` 里**没有 assistant 气泡类**——官方助手正文不走气泡，直接是 `AssistantMarkdown`（见下）。

---

## 三、助手正文（`AssistantMarkdown.module.css`，4 类）

| 元素 | 类 | 关键样式 | 我们 |
|---|---|---|---|
| 正文根 | `root` | `font-size:var(--dsh-content-font-size,14px); line-height:calc(24px + delta); color:label-primary; flex-direction:column; display:flex` | ✅ |
| **正文块间距** | `body` | `flex-direction:column; gap:16px; display:flex` ← **段落/代码块之间 16px** | ✅（类挂上了，但 MarkdownText 内部块间距由官方组件自带） |
| 宽表格 | `body .md-table-wide` | 用 `--dsh-table-spare/lead` 让表格越出内容列宽度 | ❌（MarkdownText 自带） |
| 停止徽标 | `stopped` | `border-radius:var(--dsw-radius-sm); background:interactive-bg-hover; color:label-tertiary` | ❌ |

**渲染器**：官方 `MarkdownText`（primitives，mdast + KaTeX + 代码块工具条；`labels = { code:{copyLabel,copiedLabel,toolbarLabels:{codeLabel,wrapLabel,unwrapLabel}}, footnotes }` 必填且需引用稳定）→ ✅ 已接入（共用常量 `src/client/md-labels.ts`）。

> ⚠ **`code.toolbarLabels` 是官方 `CodeBlock` 的分叉开关**（primitives：有它 ⇒ `CodeToolbar` 图标钮卡片；没它 ⇒ 老式 banner，右 = **文字**「复制」钮、无换行钮）。官方 Chat 的 `markdownLabels(t)` 必传这三条（`ui-chat lib/client.js:196-210`）。谁新起一处 `MarkdownText` 忘了传，症状就是「代码块右边一个中文复制」——2026-09-28 修过一次，详见 [`worklog/code-block-toolbar.md`](../worklog/code-block-toolbar.md)。

### 三-B、markdown 内容元素（表格 / 代码块 / 行内 code / emoji 标题）——全部由 `MarkdownText` 带出

| 元素 | 官方来源 | 关键样式 / 行为（源码原文） | 我们 |
|---|---|---|---|
| **代码块卡片**（左上 `bash`/`json` 语言名，右上「换行 + 复制」两钮） | `MarkdownText` 内部 = primitives **`CodeCard`**（`primitives/lib/CodeCard.module.css`） | `.card{margin:16px 0; background:var(--dsw-alias-markdown-code-block); border-radius:var(--dsw-radius-lg); font:var(--dsw-font-markdown-code-block)}`；`.header{padding:10px 18px 8px 22px; justify-content:space-between}`；`.language{color:label-tertiary; font-family:var(--ds-font-family-code)}`；`.actions{gap:4px}`（`.action` 24px 方钮：**换行切换 + 复制**） | ✅（用 MarkdownText 自动获得；**须传 `labels.code.toolbarLabels`**——缺它官方降级成文字「复制」老式 banner，2026-09-28 修） |
| **语法高亮**（json 彩色 token） | primitives `CODE_HIGHLIGHT_EXTENSIONS` / `languageForPath` / `useCodeHighlighter`（Lezer） | 由 MarkdownText 内部使用 | ✅ |
| **表格**（表头行 / 单元格 / 行内 code chip，**横向分隔线、无竖线**） | `MarkdownText` + `AssistantMarkdown.body .md-table-wide` + `MarkdownText.module.css` | 滚动容器：`.tableScroll{max-width:100%; overflow-x:auto}`；**宽表（`.md-table-wide`）平时隐藏横滚条、hover/focus 才出**（`overflow-x:hidden→scroll; padding-bottom:var(--dsh-scrollbar-width,5px)→0`）；`table{border-collapse:collapse; width:max-content; max-width:max-content}`；宽表越出内容列：`--dsh-table-spare/lead` | ✅ |
| **行内 code chip**（`web_search`、`AGENTS.md`） | `MarkdownText` 行内 code | 小圆角底色 chip | ✅ |
| **emoji 标题**（🔑 / 💡） | 就是 mdast heading 里的**文本内容**，无特殊组件 | — | ✅ |
| **列表圆点 / 加粗** | `MarkdownText` | — | ✅ |
| 文件 mention 下划线 | `MarkdownText` 的 `fileMentions` 参数 | 行内 code 解析为真实文件 → 下划线链接（`openFile`） | ✅（U11：collectFilePaths/makeFileMentions 会话级词表，与工具卡同走 `openFile` 分栏预览） |

> **说明**：primitives 包自带 **32 个可读 `.module.css`**（CodeCard / TerminalBlock / ReadBlock / DiffBlock / SearchBlock / WebBlock / DisclosureRow / user-text（mention chips）/ Button / Pill / Tag / Tooltip / Modal / Menu / JsonTree / StateDot / …），由 primitives 包**自行注入 document**。⇒ 我们用官方组件时**无需**自己发现这些类名（样式随组件走）；`official-classes.ts` 现扫 `@deepseek-ai/dsh-client-ui-chat/` + `@deepseek-ai/dsh-client-ui-tool/` 两个前缀（ui-tool 是工具行真身 `ToolRow` 所在包，2026-09-28 扩展），primitives 自绘兜底部分仍不扫。

---

## 四、工具调用 / 命令卡（chat 包 `GenericCommandCard.module.css`，8 类——command 节点兜底；**工具行真身 = `@deepseek-ai/dsh-client-ui-tool` 的 `ToolRow.module.css`（30 类）+ `GenericToolCard`**）

> **官方 ToolRow 展开（源码核实 2026-09-28，ui-tool lib/client.js）**：行 = `root(无边框裸行 flex column)` + DisclosureRow(`row/leading/title/separator/chevron/summary`) + 五态 `data-state=preparing|running|ok|error|stopped`（`data-tool`/`data-variant` 同挂 root）；**成功结算但终端退出码≠0/有信号 ⇒ 整行 error**（`terminalFailed`）。**展开体分发链**（ToolRow 内部）：`askQuestion` → `TerminalBlock(maxLines:∞)` → `DiffBlock(maxLines:9)` → `ReadBlock(maxLines:8)` → image → `SearchBlock(8)` → `WebBlock` → `ToolDetails` → 兜底 **ioCard 灰框**（`ioSection(输入)+ioDivider+ioSection(输出[data-error])`，`border:.5px border-l1; radius-lg; background:markdown-code-block`）。摘要：per-variant SUMMARY_KEYS（bash=description+command、read/write/edit=path、search=query）+ 专用标题表 TOOL_TITLE_KEYS（pwsh/read_image/grep/glob 等专属，web_search/web_fetch 落 variant 标题）；diff 卡摘要旁独立 `diffStat` span（`+N -M`，`diffTotals` 计算）；read/write/edit 摘要路径 = fileLink（下划线，点击 `openFile`）。镜像实现：mirror/GenericCommandCard.tsx（逐值照抄）。

| 元素 | 类 | 关键样式 | 我们 |
|---|---|---|---|
| 卡根 | `root` | `flex-direction:column; display:flex`（**无边框无底色**） | ✅ |
| 行 | `row` | 由官方 `DisclosureRow` 渲染（primitives，箭头/悬停/展开自带） | ✅ |
| 前导图标 | `leading` | `flex-shrink:0` | ✅ |
| 标题 | `title` | `font-weight:400; transition:color .1s`；`:hover` 时变 `label-primary` | ✅ |
| 分隔点 | `separator` | `width:2px;height:2px;border-radius:1px;margin:0 8px;background:label-caption` | ✅ |
| 摘要 | `summary` | `color:label-tertiary; font-size:secondary(13px); line-height:calc(24px+delta); text-overflow:ellipsis; white-space:nowrap; flex:auto`（**flex:auto 把箭头推到最右**） | ✅ |
| 箭头 | `chevron` | `color:label-secondary` | ✅（由 DisclosureRow 自带） |
| 正文 | — | ~~折叠展开后的 `<pre>`~~ → **官方展开体分发链**（见上注）：read=ReadBlock(8)、bash=TerminalBlock(∞)、write/edit=DiffBlock(9)、其余=ioCard 灰框 | ✅ |
| 状态 | `data-state` / `data-variant="others"` | 官方用 data 属性表达 running/error | ✅（五态 preparing/running/ok/error/stopped + data-tool/variant 全挂） |

**官方行为**：折叠时 = `row(leading+title)` + `separator` + `summary`；展开时 = 分发链组件（不再是 pre.body）。摘要官方取**人话**（命令/文件名），不是原始 JSON。→ 我们已改为 command/file_path 优先 ✅

---

## 五、思考过程（`ReasoningRow.module.css`）

语义类：`root, row, title, summary, summaryText, chevron, leading, separator, thinkBody`（另有一组 `lcKema_` 前缀的同名类，见源码）

| 元素 | 类 | 关键样式 | 我们 |
|---|---|---|---|
| 根 | `root` | `flex-direction:column;display:flex`；`:not([data-expanded]){contain:size layout; height:calc(24px + delta)}`（**折叠时固定一行高**） | 🟡（我们用 `<details>`，无固定行高/`data-expanded` 语义） |
| 行 | `row` | `position:relative; overflow:hidden`；`[data-state=running]` 有扫光动画 | ❌（无 running 态） |
| 正文 | `thinkBody` | 展开后的思考文本 | ✅（类已挂） |

---

## 六、turn 元信息与操作行（`MessageIconActions.module.css`，6 类）——**「用时 N 秒」就在这**

| 元素 | 类 | 关键样式 / 行为（源码核实） | 我们 |
|---|---|---|---|
| 操作行 | `actions` | `height:calc(28px + delta); align-items:center; gap:8px; display:flex`；**hover 才显示**（`[data-actions-reveal=hover]` + 「相邻两条 user 消息之间」的行也隐藏） | ❌ |
| 起始时间 | `timeStart` | `font-size:secondary(13px); line-height:24px+delta; color:label-tertiary; padding-right:12px`（用户消息行用） | ❌ |
| **结束时间（用时 N 秒 / 日期时间）** | `timeEnd` | `font-size:calc(secondary - 1px); line-height:24px+delta; color:inherit; white-space:nowrap`；文案由 `formatMessageClock(time, t, day)` 出 | ❌（**需要 turn 起止时间，legacy.nodes 没有**） |
| 结尾信息 | `endInfo` | `color:label-tertiary; gap:8px; margin-left:8px; inline-flex`（内挂用量面板 + 时间） | ❌ |
| 复制按钮 | `action` | `IconCopyOutlineRegular` → 复制成功后 `IconCheckOutlineRegular`（**1 秒后还原**）+ `Tooltip`「复制/已复制」 | ❌ |
| 分支按钮 | `action` | `IconBranchOutlineRegular`；`onBranch = forkAt(seq)`；**有后续节点则不可用**（`branchUnavailable / hasLaterChatNode`） | ❌ |
| 👍 👎 等扩展按钮 | — | **来自槽位 `conversation.chat.assistant-actions`**（`renderSlot(slot, { messageId })`，chat client.js:6523）——反馈类按钮是插件挂进来的，不在 chat 包内 | ❌（槽位在官方会话区里才能渲染；我们弹窗里可自绘等价按钮） |
| 用量小标 | `usageAction` | `data.tokenUsage` 存在且 `detailed`（presentation 模式）才渲染 `TurnUsagePanel` | ❌（**缺 usage 数据**） |
| 显隐时机 | `data-actions-reveal` | turn 尾：`endsWithResponse ? "always" : "hover"`（**有答复的 turn 恒显，否则悬停显**） | ❌ |

### 六-B、turn 过程行与过程内条目（按你的截图逐项核实）

| 元素 | 官方组件 / 类 | 行为与样式 | 我们 |
|---|---|---|---|
| **「用时 29 秒 ⌃」分隔条** | `TurnProcessNodeView.root` | 高 `33px+delta`、**border-bottom `.5px` `--dsw-alias-border-l2`**、`padding:0 0 8px`、`:not([data-open]){margin-bottom:8px}`；点击展开/收起本 turn 的过程条目；`chevron` 14px `[data-open]` 旋转 180° | 🟡（我们有「过程 · N」行但**没有这条分隔线样式**，label 也不是用时） |
| **重试行**「已重试模型请求 (3/5) · 2s ⌄」 | `MessageItem.retryRow/retrySummary/retryText/retryDetails/retryDetailLabel` | 折叠=摘要；展开=`重试延迟: 1868 毫秒` / `失败原因: 503 {…}`（文案键在 chat 包内，已核实存在） | ✅（mirror/MessageItem `ModelRetryItemMirror` 逐字照抄 lib/client.js:1235：`<details>` 折叠 + active 倒计时/shimmer；keyed kind=`model-retry` 取 `data.current`，legacy 取扁平节点） |
| **工具组行**「已写入文件 ⌃」 | `ChatGroupSeat`（title/leading/chevron/activityIcon） | 把同一工具的多次调用再收一层，hover 时图标↔箭头互换 | ❌ |
| **工具行（错误）**「写入 · Error: invalid arguments…」 | `GenericCommandCard`，`data-state=error`、`summary[data-error]` | 摘要红色（`_summary[data-error]` 规则） | ✅（错误摘要 = 输出首行，errmark/data-error 红色） |
| **工具行（成功）**「写入 · test.txt +1 -0」 | `GenericCommandCard`，`title` + `summary` | `title=工具名`、`summary=目标 + 差异统计`；`+N -N` 差异计数 = `diffTotals`（ui-tool ToolRow `diffStat` 独立 span，源码核实） | ✅（diffStat 独立 span 照抄） |
| **思考行**「思考 ⌃」 | `ReasoningRow`（`root:not([data-expanded])` 高 24px） | 折叠=固定一行；展开=`thinkBody` 预览（如 `Done. The file has been created.`） | 🟡 |
| **正文行内文件下划线**（`test.txt`） | `MarkdownText` 的 `fileMentions` | 行内 code 若解析为真实文件 → 下划线链接，点击走 `openFile` | ❌（`fileMentions` 未传） |
| **用户气泡里的文件 chips**（`▣ AGENTS.md`） | primitives `projectUserText` | 用户文本里的 `@文件` 渲染成带图标的 mention chip | ❌ |
| **markdown 列表圆点 / 加粗标题** | `MarkdownText`（mdast 渲染） | `•` 列表、`**加粗**`、行内 code chips 都是官方渲染器出的 | ✅（已用 MarkdownText） |

---

## 七、过程组（`ChatGroupSeat.module.css`，11 类）

| 元素 | 类 | 关键样式 | 我们 |
|---|---|---|---|
| 组根 | `root` | `min-width:0` | ✅ |
| 组标题 | `title` | `color:label-secondary; font-size:var(--dsh-content-font-size,14px); gap:6px; cursor:pointer; transition:color .1s`；hover 变 primary | ✅ |
| 前导图标位 | `leading` | `width:16px; height:16px; color:label-tertiary; flex:none` | ✅ |
| **图标↔箭头互换** | `activityIcon` / `chevron` | 两个绝对定位叠放：平时显图标，hover 显箭头；展开时显箭头 | ❌（我们的 DisclosureRow 只有箭头） |
| 内容 / 展开体 | `content` / `body` / `expandedBody` | 展开后的容器 | ✅（用 `body`） |
| 渐隐 | `fadeTop` / `fadeBottom` | 展开体上下渐隐遮罩 | ❌ |

---

## 八、turn 过程行（`TurnProcessNodeView.module.css`，3 类）——**「过程」那行分隔条的真身**

| 元素 | 类 | 关键样式 | 我们 |
|---|---|---|---|
| 行 | `root` | `height:calc(33px + delta); border-bottom:.5px solid var(--dsw-alias-border-l2); color:label-tertiary; cursor:pointer; padding:0 0 8px; transition:color .1s`；`:not([data-open]){margin-bottom:8px}` | 🟡（我们用 DisclosureRow 代替，无下边框分隔线） |
| 箭头 | `chevron` | `width:14px;height:14px;color:label-caption;margin-left:4px`；`[data-open]` 旋转 180° | ✅（DisclosureRow 自带） |
| 标签 | `label` | `font-size:secondary(13px); line-height:24px+delta; ellipsis; nowrap` | ✅ |

> 我们当前的「过程 · N」行 = `ChatGroupSeat` 标题 + `DisclosureRow`，与官方 `TurnProcessNodeView`（带下边框分隔线）**不完全一样** → 待对齐。

---

## 九、用量小标（`TurnUsagePanel.module.css`，3 类 ／ `StatsPills.module.css`，5 类）

| 元素 | 类 | 关键样式 | 我们 |
|---|---|---|---|
| 用量触发钮 | `trigger` | `height:28px+delta; border-radius:var(--dsw-radius-sm); font-size:calc(secondary-1px); font-variant-numeric:tabular-nums; gap:4px; padding:6px 8px` | ❌（**需要 usage 数据，legacy.nodes 没有**） |
| 用量标签 | `label` | ellipsis | ❌ |
| 统计药丸 | `pill` | `border-radius:999px; gap:6px; padding:1px 8px; color:label-tertiary; tabular-nums`；hover 显底色 | ❌ |

---

## 十、turn 尾（`TurnTailNodeView.module.css`，2 类）

`root{flex-direction:column;gap:16px;display:flex}`；`actions{margin-top:4px;margin-left:-6px}` —— turn 结束后的操作区（复制/分支/用量）。❌

---

## 十一、滚动导航 / 上下文 / 其他（未实现区，仅列类清单备查）

| 模块 | 语义类 | 状态 |
|---|---|---|
| `TurnNavigator`（14） | `frame, scroller, marks, mark, markActive, markBusy, markPreview, markUnloaded, preview, previewPrompt, previewResponse, slot, fadeTop, fadeBottom` | ❌ |

### 十一-B、系统提示与上下文注入行（截图第二组，已核实）

| 元素 | 官方实现 | 关键样式 / 行为 | 我们 |
|---|---|---|---|
| **「系统提示词 / 系统提示词更新」折叠行** | `SystemPromptRow`（chat client.js:6093）= 官方 `DisclosureRow` + `ContextInjectionRow.root/chevron/body` | icon=**`IconBrowseOutlineRegular size:14`**；`expandOnRowClick`；展开体挂 `data-system-prompt-body`，内容走 `OpaqueBody`（141px 代码滚动位，保留真实换行）；chat 节点 kind=`system-prompt`（**独立于 turn 过程**，见 `TURN_PROCESS_INDEPENDENT_KINDS`：system-prompt/user/steering/turn-trigger/turn-process/turn-error/turn-max-tokens/turn-tail） | ❌ |
| **上下文注入行**「`› retitle · 0913 │ 指令 │ …`」 | `ContextInjectionRow` | `root{min-width:0}` `[data-open]{padding-bottom:4px}`；`source{13px tertiary, flex:none, nowrap, ellipsis}` + `sep{2×2px, margin:0 8px}` + `summary{13px tertiary, flex:auto, ellipsis}`（**flex:auto 把后续内容推右**）；`chevron{color:label-secondary}`；`body{width:calc(100% - 22px - …)}` | ❌ |
| **注入展开体**（OpaqueBody / ContextBody） | `ContextBody` | `text{pre-wrap; overflow-wrap:anywhere; color:label-secondary}`；`fields{border-top:.5px; gap:2px; padding-top:8px}`；`fieldKey{min-width:96px; color:label-caption}` / `fieldValue{tertiary}`；`files{gap:4px 12px}` 列表（`filePath`/`fileAction`） | ❌ |
| 工具增删行 | `ContextInjectionRow.toolChanges` / 文案键 `message.toolAdded/toolRemoved/toolsAdded/toolsAddedCount/toolsChanged` | 「已写入文件」这类组行文案同源 | ❌ |
| `accessibility`（10） | `root, row, leading, title, summary, summaryText, chevron, separator, thinkBody, visuallyHidden` | ❌ |
| `MessageIconActions` 另有 `visuallyHidden` | — | ❌ |
| `PreferenceRow`（6）/ `stat-dialog` / `SearchBlock` | — | ❌ |
| `TurnTriggerNodeView`（10） | `root, header, icon, title, time, body, content, explanation, chevron, openChevron` | ❌ |

---

## 十二、官方 primitives 可复用件（都是公开导出）

**无需 labels（直接用）**：`DisclosureRow`（折叠行）、`StateDot`、`FoldToggle`、`Button`、`Pill`、`Tag`、`Tooltip`、`Modal`、`Menu`、`FileTypeIcon`、`PathLabel`、`JsonTree`、`TextShimmer`、全套 `IconXxxOutlineRegular` 图标。

**需要 labels（接一次文案就能用）**：

| 组件 | labels | 用途 |
|---|---|---|
| `MarkdownText` | `{code:{copyLabel,copiedLabel}, footnotes}` | ✅ 已用（正文） |
| `TerminalBlock` | `TerminalBlockLabels`（signal/exitCode/noExitCode/running/failed/done/copy/copied/noOutput/collapse/expand…） | bash/命令输出块 |
| `ReadBlock` | `ReadBlockLabels`（window/copy/copied/collapse/expand…）+ `lines[{number,text}]`/`totalLines` | read 文件块 |
| `DiffBlock` | `DiffBlockLabels`（copy/copied/collapse/expand…）+ `diffs` | write/edit 差异块 |
| `SearchBlock` | SearchBlockLabels | 搜索块 |

> **样式随组件走**：primitives 包自带 **32 个可读 `.module.css`**（`CodeCard` / `TerminalBlock` / `ReadBlock` / `DiffBlock` / `SearchBlock` / `WebBlock` / `DisclosureRow` / `user-text` / `Button` / `Pill` / `Tag` / `Tooltip` / `Modal` / `Menu` / `MenuSurface` / `JsonTree` / `StateDot` / `FoldToggle` / `TextShimmer` / `HoverCard` / `ImageLightbox` / `ImagePreview` / `Input` / `Checkbox` / `Switch` / `SegmentedControl` / `SegmentedTabs` / `ShortcutKeys` / `Toast` / `ConnectionIndicator` / `FileTypeIcon` / `PathLabel` / `RiskConfirmation`），由 primitives **自行注入 document** ⇒ 用官方组件时无需自己发现/挂这些类名。

> ⛔ **用不了的**：官方会话容器 `ChatView`（组件不导出）；`ctx.slots.renderSlot` 只接受 `key='root'`（`ui-renderer registry.d.ts:150-158`，运行时强制）；`retain(source:'mainView')` 会锁死宿主会话导航（已实测回退，见 AGENTS.md/决策记录）。

---

## 十三、我们当前状态汇总

| 区块 | 状态 | 说明 |
|---|---|---|
| 一、页面骨架 | ✅ | frame/root/scroll/column/flowItem/hint 全用官方类（mirror/ChatView + ChatNodeSeat 写 flowItem 属性） |
| 二、用户消息 | ✅ | userRow/userStack/bubble（右对齐气泡） |
| 三、助手正文 | ✅ | 官方 `MarkdownText` + `AssistantMarkdown.root` |
| 三-B、markdown 内容元素（代码块卡片/语法高亮/表格/行内 code/列表/emoji 标题） | ✅ | 随官方 `MarkdownText` 自带——primitives 自带 32 个 CSS module（CodeCard 等）由它自行注入，组件即样式 |
| 四、工具卡 | ✅（官方 ToolRow 对齐） | **展开体分发链照抄 ui-tool `GenericToolCard`+`ToolRow`**：read=官方 `ReadBlock`（maxLines 8，meta 收窄 + `<path>/<type>file</type>/<content>` envelope 校验，失败回退 ioCard）、bash/pwsh=官方 `TerminalBlock`（maxLines ∞，`parseExitStatus` 剥 `[exit code: N]`/`[killed by signal: S]`，退出码≠0/信号 ⇒ 整行 error；persistent/background/spill/error 回退 ioCard）、write/edit=`DiffBlock`(9)、其余=官方 ioCard 灰框（输入/分隔/输出[data-error]，code 变体前置 CodeBlock）；五态 `data-state` + `data-tool`/`data-variant`；摘要 = per-variant SUMMARY_KEYS + diffStat 独立 span + read/write/edit fileLink（openFile）；图标 = VARIANT_ICONS（ui-tool 专属表）；兜底 CSS = 官方 ToolRow.module.css 逐值镜像进 archive-session-css.ts；官方类发现扩展 ui-tool 包前缀 |
| 五、思考 | ✅（重写） | **官方 ReasoningRow 照抄**（lib/client.js:5718-5778）：`root[data-variant=think][data-state][data-expanded][data-preview]` + DisclosureRow（`IconThinkOutlineRegular` 14px + **`title = message.think = 「思考」`** + separator(2×2px) + 首行预览去 `**`）+ thinkBody（`MarkdownText compact`）；折叠固定行高 24px+delta；弃「思考过程」旧文案与有边框盒子 |
| assistant 块渲染 | ✅（修正） | 照官方块渲染器（lib/client.js:5818-5871）：步内 **tool-call 块一律跳过**（`case break`，由独立工具节点画，重复画 = ×2）、groupPart 'reasoning' 只画思考块 / 'response' 跳过思考块、整步只有工具块 ⇒ 整步 null；seat 必须把 groupPart 下发给节点视图（回归断言已加） |
| 六、turn 元信息（用时） | ✅（keyed） | **换 keyed 流后 turn 位置自带起止时间**（`node.location.turn.start/end`）⇒ 「用时 34 秒」/「深度求索中，用时…」/「已停止」逐字对齐官方（mirror/message-chrome.ts） |
| 七、过程折叠 | ✅（重写） | **官方 ChatNodeSeat 折叠判定整套照抄**（TURN_PROCESS_INDEPENDENT_KINDS / turnProcessAlwaysOpen / processWindowReady / processMember / processAnswer / ownsDisclosure / foldable / controllerInactive / compactAnswer / processHidden），见 mirror/ChatNodeSeat.tsx 顶部注释；legacy「过程 · N」组仅作 order 缺失时的兜底 |
| 七-B、过程分组（二级收折） | ✅（新） | **官方 `ChatGroupSeat` + `process-groups.js` 算法移植**（mirror/ChatGroupSeat.tsx + mirror/process-groups.ts）：分组规则（INDEPENDENT 独立 / turn-process 独立 / assistant-step reasoning 入组、reply 出组 / 其余入组，组键 `["process", 首成员, groupPart]`）+ `processActivity` 类别统计 + `processTitle` 汇总文案（2 类「A并B」去「已」前缀、≥3 类「，」连接、更多补「等」）；标题行 activity 图标↔箭头 hover/展开互换；body `max-height:min(400px,50vh)` + 上下 24px 渐隐 + 组内 gap 8px；组随一级「用时 N 秒」行收起而隐藏（outerHidden 同官方）。**自实现原因**：`views.grouped('chat')` 不在公开契约 `ConversationBinding` 上（挂在内部 assembler）⇒ 决策 34 ④ |
| 工具行标题 | ✅（改） | 接官方 `tool.title.*` 本地化字典（读取/写入/编辑/运行命令/搜索文件内容/查找文件/读取图片/网页搜索/网页获取/代码；未收录走「工具调用」，摘要补 `name ·` 前缀，对齐官方截图） |
| 八、过程行分隔线 | ✅ | mirror/TurnProcessNodeView：官方类（root/label/chevron）+ `data-open` 箭头旋转 + `.5px` 下边框 + `:not([data-open]) margin-bottom:8px` + `:disabled` |
| 触发行（turn-trigger） | ✅（新） | mirror/TurnTriggerNodeView：官方 root/header/icon/title/time/chevron + kind→图标映射（`turnTriggerDetails`），点开展开注入原文 |
| 尾部操作行（turn-tail） | ✅（新） | mirror/TurnTailNodeView + MessageIconActions：复制（Tooltip + 1s 复位 + `writeClipboard`）/ 分支（已接线 fork：消息行从该轮截断开分支）/ `data-actions-reveal`（最后一轮 always、历史轮 hover）/ 结束时钟（官方 `clock.md` 文案） |
| 用量小标 | ✅（新） | mirror/TurnUsagePanel + StatDialog：`用量 91.5K tok` pill + 明细弹层（本轮用量/提供方·模型/缓存命中/未缓存输入/缓存读取/缓存写入/输出（其中推理 N））；定位复用 primitives `useAnchoredPosition` |
| 弹窗尺寸 + 布局 | ✅（改） | panel `width:min(1120px,100vw-32px)`、`height:calc(100% - 80px)`、radius 12px（照宿主「左下角弹窗」卡片）；**内间距定尺（用户拍板，不算官方列宽）**：`--dsh-composer-side-clearance: 8px` ⇒ 会话区左右各 24px、`--dsh-chat-content-width: 100%` 不设列宽上限；标题下加 1px 横线；关闭钮 = 官方 `IconCloseOutlineRegular` 16px 裸图标 |
| 对话框占位 | ❌ 移除 | 归档会话 = 留档不可改，**弹窗内不做续聊**（决策 37）；「继续对话（开分支）」**已实现**：头部按钮 + 消息行分支 icon，均走确认框 → `sessions.fork` → 关弹窗 → `openHostSession` 跳转；服务未就位时按钮不渲染 |
| 分支 icon | ✅ 已实现 | 官方分支 = 复制对话在新会话继续；只读弹窗**已接 fork**（U10）：尾部操作行渲染分支 icon，点它从该轮 tail 截断开分支；头部按钮 = 全量分支 |
| 操作行 👍👎 | ❌ | 官方走 slots（feedback 插件），弹窗无该插槽 |
| 六-B、过程条目 | 🟡 | 重试行 ✅（官方 ModelRetryItem 照抄）、轮次失败行 ✅（官方 TurnErrorItem：StateDot(error)+红标题+灰原因+右侧 `<code>` 机器码，官方截图里的 SERVER 标签即 `turnErrorCode`）、限长行 ✅（官方 TurnMaxTokensItem：黄点+警示标题+提示语）、工具组行（已写入文件）❌、工具错误摘要红色 🟡、`+N -N` 差异统计 ❌（来源待核）、思考行 ✅ |
| 文件 mention | ❌ | 正文行内文件下划线 = `MarkdownText` 的 `fileMentions`；用户气泡 chips = `projectUserText`——两者都只需传入解析器即可 |
| 十一-B、系统提示词行 / 上下注入行 | ❌ | 结构已核实（DisclosureRow + ContextInjectionRow + OpaqueBody）；keyed kind=`system-prompt` / `context` 目前仍按决策 28 过滤 |
| 表格（含宽表 hover 横滚） | ✅ | `MarkdownText` 自带（`.tableScroll` + `.md-table-wide` hover 才出滚动条） |
| 十一、导航/上下文/其他 | ❌ | 未实现 |
| 图标 | ✅ | 官方 primitives 图标（IconCode / IconClose / IconCopy / IconCheck / IconBranch / IconDatabase / 触发行家族） |

---

## 十四、逐项实施清单（按性价比排序，做完一项勾一项）

1. ✅ 骨架：frame/root/scroll/column/flowItem（官方类）
2. ✅ 用户气泡：userRow/userStack/bubble
3. ✅ 正文：官方 MarkdownText
4. ✅ 工具行：官方 DisclosureRow + 人话摘要 + 默认折叠
5. ✅ ~~过程组：连续工具调用 → 「过程 · N」~~ → **被 27/33 取代（keyed 折叠 + ChatGroupSeat 二级收折）**
33. ✅ **过程分组（二级收折）**：mirror/process-groups.ts（官方算法移植：分组规则 / processActivity / processTitle）+ mirror/ChatGroupSeat.tsx（汇总行 + body 限高渐隐）；组内条目 = 三级各自展开
34. ✅ 工具行标题接官方 `tool.title.*` 字典（generic 走「工具调用 · name · 摘要」）
35. ✅ 弹窗内不做续聊：Composer 占位移除、分支 icon **已恢复**（决策 38 ⑦：消息行分支按钮从该轮 tail 截断开分支）
6. ✅ 工具卡补 `separator`（2×2px 分隔点，`margin:0 8px`）——mirror/GenericCommandCard collapsedContent
7. ✅ 「过程」行官方样式（`TurnProcessNodeView.root`：高 33px + `.5px` 下边框 + `padding:0 0 8px` + `:not([data-open]){margin-bottom:8px}`）——mirror/TurnProcessNodeView
8. ✅ 思考块改 `ReasoningRow` 结构（`data-expanded` + 折叠固定行高 24px，去掉 `<details>`）——mirror/ReasoningRow
9. ✅ 工具卡 `data-state` 五态（preparing/running/ok/error/stopped，`data-tool`/`data-variant` 同挂 root；keyed `phase: preparing/start` 已接）
10. ✅ 「加载更早」按钮对齐 `older` 样式（4px 12px / 12px 字号 / radius-sm）——mirror/ChatView.ChatOlderButton（移入列首，官方位置）
11. 🟡 错误提示：文案走官方 `hint` 类；官方另有 `openError`（错误色）未单独区分
26. ✅ ~~弹窗固定尺寸（`min(1180px,94vw)` × `92vh`）~~ → **改 28：`min(1120px,100vw-32px)` × `calc(100% - 80px)`（宿主弹窗惯例）+ 底部对话框占位（禁用输入）**
12. ✅ **数据源换轨 keyed 流（决策 36）**：`order + nodes`（ChatNodeStore）取代 `legacy.nodes` 成为渲染主路；legacy 仅兜底——turn 位置（起止时间）/ 过程行 / 触发行 / 尾部行全部由此获得
27. ✅ **官方折叠关系整套照抄**（mirror/ChatNodeSeat：TURN_PROCESS_INDEPENDENT_KINDS / turnProcessAlwaysOpen / processWindowReady / processMember / processAnswer / ownsDisclosure / foldable / controllerInactive / compactAnswer / processHidden + flowItem `hidden`）
28. ✅ 触发行（mirror/TurnTriggerNodeView：kind→图标/标题 + 注入原文展开）
29. ✅ 尾部操作行（mirror/TurnTailNodeView + MessageIconActions：复制 / 分支只读态 / `data-actions-reveal` / 结束时钟）
30. ✅ 用量小标（mirror/TurnUsagePanel + StatDialog：pill + 明细弹层，`formatTokens`/`formatCacheHitPercent` 逐字照抄）
31. ✅ 弹窗外壳改宿主弹窗惯例尺寸 + 会话区左右边距 = 官方 `scroll` 的 `16px + --dsh-composer-side-clearance`；关闭钮 = 官方 `IconCloseOutlineRegular` 裸图标
13. ✅ `TerminalBlock` / `ReadBlock` / `DiffBlock` 三件全接（2026-09-28，官方 ToolRow 分发链照抄——**read=ReadBlock(8)**：`readCardModel` 收窄（path/offset/lines 严格递增/totalLines）+ 结果 envelope 正则校验，失败回退 ioCard generic；**bash=TerminalBlock(∞)**：`shellCall` 校验 + `parseExitStatus` 剥尾部 `[exit code: N]`/`[killed by signal: S]`，terminalFailed ⇒ 整行 error，persistent/background/spill/error 回退；**write/edit=DiffBlock(9)** 同前）；兜底 ioCard 灰框 + 兜底 CSS 官方 ToolRow.module.css 逐值镜像；原「输入/输出」两行版即官方 ioCard 兜底形态，继续用于 generic 工具
15. ⬜ 「到底部」悬浮钮（toBottom/toBottomSlot）
16. ⬜ 上下文注入行（ContextBody/ContextInjectionRow）——keyed kind=`context` / `system-prompt` 目前仍过滤（决策 28），放行即接
17. ✅ 工具卡 `summary[data-error]` 红色变体（错误摘要 = 输出首行 errmark，stopped 摘要同理；摘要 span `data-error` 走官方红）
19. ✅ 重试行（已重试模型请求 (n/m) · 延迟/原因）——mirror/MessageItem `ModelRetryItemMirror` 照官方 ModelRetryItem（lib/client.js:1235-1290）逐字落码；同轮补齐轮次失败行（TurnErrorItem）与限长行（TurnMaxTokensItem）；旧自绘 `notice-err` / `sessionTurnError` 等键已删
20. ✅ 正文 `fileMentions`（行内文件下划线；U11 与 `openFile` 分栏打通）+ 用户气泡 `projectUserText`（mention chips）——chips 部分待接
22. ✅ `ChatGroupSeat`（grouped('chat') 分组项）——官方 grouped 读取器不在公开契约面 ⇒ `process-groups.js` 算法移植（决策 37）
23. ⬜ 用户消息的操作行（`MessageIconActions` clock='start'）——keyed user 节点已具备 time，待接
32. ⬜ 👍👎（官方走 feedback 插槽，弹窗无插槽；如必须显示需自绘并接宿主反馈服务）

## 十五、数据缺口（决定哪些永远做不了 / 要换数据源）

| 想做 | 缺什么 | 出路 |
|---|---|---|
| ~~用时 N 秒~~ | ~~turn 起止时间~~ | ✅ 已解：keyed 流 `node.location.turn.start/end` 自带（决策 36） |
| ~~用量小标~~ | ~~usage~~ | ✅ 已解：keyed `turn-tail` 节点 `data.tokenUsage` 自带 |
| 复制/分支按钮 | 分支 = `sessions.fork`（0.1.7-rc.2 存在）；复制 = 纯前端已做 | 复制已做；分支在只读弹窗里暂以官方 `data-unavailable` 态呈现 |

---

*最后更新：2026-09-28 · 基于 0.1.7-rc.2 源码逐项核实；工具行真身（ui-tool ToolRow）分发链已照抄进 mirror/GenericCommandCard；§三 补 `code.toolbarLabels` 必传（官方 CodeBlock 的分叉开关）。*
