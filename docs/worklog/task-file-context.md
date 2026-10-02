# 任务文件上下文（会话里「接收 / 随附 / 产出」三面）

> **状态**：🔵 落码中
> **开工**：2026-10-03
> **版本基线**（回滚用）：`package.json` version **0.0.1**，git HEAD **`4ecd310`**（2026-10-03）；开工时工作区另有 6 个上一轮未提交文件（`dist/client.js` / `dist/client.js.map` / `scripts/smoke.mjs` / `src/client/locales.ts` / `src/client/task-list.tsx` / `src/client/ui/tokens.ts`）⇒ **要回滚就回到 `4ecd310`，但要连同这批改动一起回退**。

---

## 一、需求原话（用户 2026-10-02/03）

1. 看会话时要看清**三类文件**：① 上游任务给了什么文件；② 任务设置里加了哪些附加文件（要能点开看内容）；③ 任务最后产出了哪些文件。
2. **「不可能全是卡片」** —— 全是卡片就分不清哪些是产出的、哪些是接收的；接收的还要分得清是**哪个上游任务**给的。
3. **不要放在折叠的那一段话里** —— 现在「收到执行请求」折叠块里塞的文本很难找。
4. 输入文件可能很多（十几个），产出只有一两个 ⇒ **输入区要小**：「文件图标 + 文件名」一行一个即可，不要产出卡那种大卡。
5. 优先复用**官方原生**的展示方式；官方没有的才自绘。

## 二、用户的拍板（本轮按此执行）

| # | 拍板 | 出处 |
|---|---|---|
| 1 | **顶部 = 输入，底部 = 产出** | 用户 10-02 |
| 2 | **不管老数据**，用最好的办法做，读不到就读不到 | 用户 10-02 |
| 3 | **附加文件走 A**（官方附件库 / file 块），复制一份；上游产出**走 B**（文本 + 我们弹窗顶部区块） | 用户 10-03 |
| 4 | **磁盘清盘功能后置**，本轮不做（见 §六） | 用户 10-03 |
| 5 | 按推荐做：**随附不再单独画在顶部**（A 已在气泡里显示成官方附件卡，避免重复） | 采纳推荐 |

## 三、源码核实结论（2026-10-03，宿主 0.2.0-rc.2；已回写 capabilities）

- 用户消息 `content` 是**内容块数组**，原生支持 `text` / `image` / **`file`** / `tool-call` / `tool-addition` / `tool-removal`。
- 附件引用 `FileAttachmentRef { attachmentId, name, bytes }` —— **没有路径**（源码注释 `never a filesystem path`）⇒ 附件 = **字节副本**，不是快捷方式。
- 附件库存于 **harness home**，内容寻址、不可变、**永不自动删除**、fork / 恢复会话共享。
- **关键更正**：file 块发给模型前被 `projectFilesToText` 换成**一行文字**（文件名 / 字节数 / sha256 / 只读副本路径），源码注释 = *"the only representation a provider ever receives for a file"* ⇒ **走 A 不产生额外 token 成本**，模型仍是「拿到地址自己读」。
- `agent.inject(msg: UserMessage)` 是官方注入上下文的口子（用途列举：文件变更通知 / 子目录 AGENTS.md / skill / cron）。

⇒ **A 与 B 对模型等价**（都是给地址），差别只在**给人看的那一面**：A 显示成官方附件卡且 fork 带得走；B 只是文本。
⇒ A 的独有价值（本场景）：**工作区型附件（link）能被钉住版本** —— 现在 link 型只记路径，改了原件回看会话就是新版。

## 四、方案（落码口径）

```
弹窗顶部区块（自绘，仅我们可见）
  └ 接收 · 来自 N 个上游任务   ← 按上游任务分组，文件行（图标+文件名）
会话流（官方形态）
  ├ 用户气泡：[f] 附加文件卡（A 原生）+ 文本（上游依赖段，B）
  └ turn-tail：[产出卡片]（官方 Deliverables，不动）
```

- **数据真源**：实例快照 `resolvedDeps`（上游 task / instanceId / sessionId / workspacePath / outputs）+ `attachments`；产出 = 实例 `outputs`。**不改 DDL**。
- **不改提示词语序与内容**：A 只是在 `content` 里追加 file 块，文本段原样保留。
- **上游任务名**：客户端按 `task` id 反查任务定义；查不到显示 id 短号（不做回退兼容分支）。

## 五、落码记录

| # | 改动 | 坐标 |
|---|---|---|
| 1 | 宿主类型面：`UserMessage.content` 由「只 text」扩成**内容块联合**（`UserTextContent` / `UserFileContent`）；新增 `FileAttachmentRef`（id / name / bytes，**无路径**）与 `HostAttachments`（`ctx.attachments.saveFile`）；`HostContext.attachments` 作为**可选面**（缺 ⇒ 降级） | `src/host.ts` |
| 2 | `attachmentFileBlocks()`：随附文件 → 官方 file 块。**降级不阻塞**：无附件服务 / 目录 / 文件不在盘 / 超 8MB / saveFile 抛错 ⇒ 跳过该附件，只留文本路径。单文件上限 8MB、单次最多 20 个（防御，因附件库**永不自动删除**） | `src/dispatch.ts` |
| 3 | `buildMessage` 加 `fileBlocks` 参；消息结构 = **text 块在前 + file 块在后**（官方按 content 顺序渲染）；派发时落 `attachmentBlocks` 事件留痕 | `src/dispatch.ts` |
| 4 | 抽中立模块 `src/deps.ts`（零运行时依赖）：`ResolvedDependency` + `parseResolvedDeps` + 客户端便捷入口 `resolvedDepsOf(snapshotJson)`。服务端 `store.ts` 改为从它 import 并转出类型，**不复制第二份校验** | `src/deps.ts`、`src/store.ts` |
| 5 | 客户端 `InstanceRow` 声明 `snapshot`（服务端本就 `SELECT *`，只是前端没声明） | `src/client/query.ts` |
| 6 | 新组件 `UpstreamInputsPanel`（接收区）：按上游任务分组，组头 = 任务名 + 计划时刻 + «查看该会话»，组内一行一个小标签（图标 + 文件名），可点 → `openFile`；目录靠尾斜杠识别；上游无产出 ⇒ 如实显示「未声明产出」；整块在**会话流之外**渲染 | `src/client/upstream-panel.tsx`、`src/client/session-view.ts`（`dsh-tdt-sv-ctx` 容器） |
| 7 | 弹窗内用户消息**也渲染 file 块**：`contentFiles()` 提取 → `UserMessage` 新增 `files`，照官方 `attachmentRow / fileCard / fileIcon / fileName / fileMeta` 画小卡（图标 + 名字 + 大小）。⚠️ 引用里没有路径 ⇒ **不可点开**，不伪造打开行为 | `src/client/session-view.ts`、`src/client/mirror/MessageItem.tsx` |
| 8 | `formatBytes()` 上提 `format.ts`（单源）；样式全部走 token + 官方类名，新增 CSS 落在 `archive-session-css.ts` | `src/client/format.ts`、`src/client/archive-session-css.ts` |
| 9 | 文案双语 5 键（`svUpstreamTitle` / `svUpstreamSession` / `svUpstreamNoOutputs` / `svUpstreamFileAria` / `svUpstreamRelOnly`） | `src/client/locales.ts` |
| 10 | 冒烟 +6 项（file 块四类降级 + 消息结构两条）⇒ **440/0** | `scripts/smoke.mjs` |

**验证状态**：typecheck 绿 · build 绿 · 冒烟 440/0 · ⏳ **真机待验**。

**真机必看的两点**（决定本轮成败）：
1. 气泡里是否出现随附文件卡 —— 取决于宿主会话快照的 user 节点 **content 是否原样透传 file 块**（未透传 ⇒ 只有文本路径，附件卡不渲染；这是宿主侧事实，不是 bug）。
2. 顶部「接收」区是否按上游任务分组显示；上游工作区与当前会话不同 ⇒ 点文件打开可能失败，走既有错误态。

## 六、遗留（已登记进 PROGRESS 未决项）

- **附件库清盘**：官方 `Attachments are never deleted`，没有回收机制 ⇒ 长期跑会堆积。用户拍板后置，本轮不做。
