# 会话弹窗「官方样式对照表」（专属任务文档）

> **这是什么**：把官方会话页面的**每一个元素**——组件、CSS module、语义类、关键样式值（间距 / 字号 / 颜色变量）、所需数据——整理成一张**可长期维护的对照表**。
> **怎么用**：实现时**逐行对着表做**，一行做完勾一行；官方升级后跑一遍「提取命令」diff 出变化，再照表补。**不再凭观感瞎改。**
> **事实来源**：`@deepseek-ai/dsh-client-ui-chat@0.1.7-rc.2`、`@deepseek-ai/dsh-client-ui-primitives@0.1.7-rc.2`、`@deepseek-ai/dsh-client-ui-conversation@0.1.7-rc.2` 的 `lib/client.js`（内嵌 CSS module 原文）与 `lib/types/*.d.ts`。CSS 值均为**源码原文摘录**，非目测。
> 状态图例：✅ 已按官方实现 ｜ 🟡 部分（有差距）｜ ❌ 未做 ｜ ⛔ 官方契约不允许

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
| 轮次失败 | `turnErrorRow/turnErrorTitle/turnErrorDot/turnErrorCode/turnErrorMessage/turnErrorCopy` | 错误横幅组 | 🟡（我们自己画的 `.dsh-tdt-sv-notice-err`） |
| 限长 | `maxTokensTitle` | — | 🟡 |
| 重试 | `retryRow/retrySummary/retryText/retryDetails/retryDetailLabel` | — | 🟡 |
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

**渲染器**：官方 `MarkdownText`（primitives，mdast + KaTeX + 代码块工具条；`labels = { code:{copyLabel,copiedLabel}, footnotes }` 必填且需引用稳定）→ ✅ 已接入。

---

## 四、工具调用 / 命令卡（`GenericCommandCard.module.css`，8 类）

| 元素 | 类 | 关键样式 | 我们 |
|---|---|---|---|
| 卡根 | `root` | `flex-direction:column; display:flex`（**无边框无底色**） | ✅ |
| 行 | `row` | 由官方 `DisclosureRow` 渲染（primitives，箭头/悬停/展开自带） | ✅ |
| 前导图标 | `leading` | `flex-shrink:0` | ✅ |
| 标题 | `title` | `font-weight:400; transition:color .1s`；`:hover` 时变 `label-primary` | ✅ |
| 分隔点 | `separator` | `width:2px;height:2px;border-radius:1px;margin:0 8px;background:label-caption` | ❌（未加） |
| 摘要 | `summary` | `color:label-tertiary; font-size:secondary(13px); line-height:calc(24px+delta); text-overflow:ellipsis; white-space:nowrap; flex:auto`（**flex:auto 把箭头推到最右**） | ✅ |
| 箭头 | `chevron` | `color:label-secondary` | ✅（由 DisclosureRow 自带） |
| 正文 | `body` | 折叠展开后的 `<pre>`（`data-error` 变体） | ✅ |
| 状态 | `data-state` / `data-variant="others"` | 官方用 data 属性表达 running/error | 🟡（我们只写了 error/success） |

**官方行为**：折叠时 = `row(leading+title)` + `separator` + `summary`；展开时 = `pre.body`。摘要官方取**人话**（命令/文件名），不是原始 JSON。→ 我们已改为 command/file_path 优先 ✅

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

| 元素 | 类 | 关键样式 | 我们 |
|---|---|---|---|
| 操作行 | `actions` | `height:calc(28px + delta); align-items:center; gap:8px; display:flex`；**hover 才显示**（`[data-actions-reveal=hover]` + 相邻 user 消息规则） | ❌ |
| 起始时间 | `timeStart` | `font-size:secondary(13px); line-height:24px+delta; color:label-tertiary; white-space:nowrap; padding-right:12px` | ❌ |
| **结束时间（用时）** | `timeEnd` | `font-size:calc(secondary - 1px); line-height:24px+delta; color:inherit; white-space:nowrap` | ❌（**需要 turn 起止时间，legacy.nodes 没有**） |
| 结尾信息 | `endInfo` | `color:label-tertiary; gap:8px; margin-left:8px; inline-flex`（内挂用量面板） | ❌ |
| 复制按钮 | `action` | 官方图标 `IconCopyOutlineRegular` / `IconCheckOutlineRegular` + `Tooltip` | ❌ |
| 分支按钮 | `action` | `IconBranchOutlineRegular`（分叉会话） | ❌ |

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
| `ContextBody`（23） | `root, entries, entry, entryName, entryDescription, fields, field, fieldKey, fieldValue, files, file, filePath, fileAction, recalls, recall, recallLabel, recallCounts, relaySender, sections, sectionName, sectionText, section, text, catalogNotice` | ❌ |
| `ContextInjectionRow`（7） | `root, body, chevron, sep, source, summary, toolChanges` | ❌ |
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

> ⛔ **用不了的**：官方会话容器 `ChatView`（组件不导出）；`ctx.slots.renderSlot` 只接受 `key='root'`（`ui-renderer registry.d.ts:150-158`，运行时强制）；`retain(source:'mainView')` 会锁死宿主会话导航（已实测回退，见 AGENTS.md/决策记录）。

---

## 十三、我们当前状态汇总

| 区块 | 状态 | 说明 |
|---|---|---|
| 一、页面骨架 | ✅ | frame/root/scroll/column/flowItem/hint 全用官方类 |
| 二、用户消息 | ✅ | userRow/userStack/bubble（右对齐气泡） |
| 三、助手正文 | ✅ | 官方 `MarkdownText` + `AssistantMarkdown.root` |
| 四、工具卡 | ✅ | 官方 `DisclosureRow` + `GenericCommandCard` 类 + 人话摘要 + 默认折叠 |
| 五、思考 | 🟡 | `ReasoningRow` 类已挂，但仍是 `<details>`（无固定行高 / data-expanded / running 扫光） |
| 六、turn 元信息（用时） | ❌ | **缺数据**：turn 起止时间（需从事件流推导，legacy.nodes 没有） |
| 七、过程组 | ✅ | 连续工具调用 → 「过程 · N」折叠组（`ChatGroupSeat` 类） |
| 八、过程行分隔线 | 🟡 | 无官方那条 `.5px` 下边框分隔线（TurnProcessNodeView 样式） |
| 九、用量小标 | ❌ | **缺数据**：usage |
| 十、turn 尾操作区 | ❌ | 复制/分支按钮 |
| 十一、导航/上下文/其他 | ❌ | 未实现 |
| 图标 | ✅ | 官方 `IconCodeOutlineRegular`（不再用 `⚙` 字符） |

---

## 十四、逐项实施清单（按性价比排序，做完一项勾一项）

1. ✅ 骨架：frame/root/scroll/column/flowItem（官方类）
2. ✅ 用户气泡：userRow/userStack/bubble
3. ✅ 正文：官方 MarkdownText
4. ✅ 工具行：官方 DisclosureRow + 人话摘要 + 默认折叠
5. ✅ 过程组：连续工具调用 → 「过程 · N」
6. ⬜ 工具卡补 `separator`（2×2px 分隔点，`margin:0 8px`）——一行样式的事
7. ⬜ 「过程」行补官方样式（`TurnProcessNodeView.root`：高 33px + `.5px` 下边框 + `padding:0 0 8px` + `:not([data-open]){margin-bottom:8px}`）
8. ⬜ 思考块改 `ReasoningRow` 结构（`data-expanded` + 折叠固定行高 24px，去掉 `<details>`）
9. ⬜ 工具卡 `data-state` 补 `running` 变体（对齐官方 data 属性语义）
10. ⬜ 「加载更早」按钮对齐 `older` 样式（4px 12px / 12px 字号 / radius-sm）
11. ⬜ 错误提示对齐 `openError`（错误色 13px）
12. ⬜ 用户消息的 turn 元信息行（`MessageIconActions`）——**前置**：先从事件流推导 turn 起止时间
13. ⬜ `TerminalBlock` / `ReadBlock` / `DiffBlock`（按工具名映射，需接 labels）——让 bash/read/write 的**展开内容**也用官方块
14. ⬜ 用量小标（TurnUsagePanel/StatsPills）——**前置**：usage 数据
15. ⬜ 「到底部」悬浮钮（toBottom/toBottomSlot）
16. ⬜ 上下文注入行（ContextBody/ContextInjectionRow）——看归档会话里有没有这类节点再定

## 十五、数据缺口（决定哪些永远做不了 / 要换数据源）

| 想做 | 缺什么 | 出路 |
|---|---|---|
| 用时 N 秒 | turn 起止时间 | 从会话事件流按 turn 边界推导（参考 dsh-better-sidebar 的服务端读法：`ctx.get('sessionPersistence').open(id,'read')` → `handle.read()`） |
| 用量小标 | usage | 同上（事件里有 usage 的会话才有） |
| 复制/分支按钮 | 分支 = `sessions.fork`（0.1.7-rc.2 存在）；复制 = 纯前端可做 | 复制随时可做；分支需评估 |

---

*最后更新：2026-09-27 · 基于 0.1.7-rc.2 源码逐项核实。*
