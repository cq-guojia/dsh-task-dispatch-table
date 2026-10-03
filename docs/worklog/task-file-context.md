# 任务文件上下文（会话里「接收 / 随附 / 产出」三面）

> **状态**：🔵 落码完成（⏳ 真机验证待做）——2026-10-03 三轮评审 + 用户两轮点名定稿，冒烟 **459/0**
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

## 四点五、⚠️ 事后更正：所有入口只传会话 id（2026-10-03，用户抓出）

**现象**：同一个会话，从「任务列表卡片 → 执行记录 → 查看」进去**有**「接收」区；从老界面「执行记录 → 查看任务」进去**没有** —— 同一个会话两种渲染。

**根因（我的错）**：`openView` 把 `outputs` / `snapshot` / `heading` 做成**调用方传参**，而进弹窗的入口有三处，我只给新的那处传了快照：

| 入口 | 坐标 | 当时 |
|---|---|---|
| 任务列表卡片「查看」 | `task-list.tsx` → `index.ts` | ✅ 传了 snapshot |
| 老界面执行记录「查看任务」/ 会话 id 链接 | `index.ts`（LEGACY 区） | ❌ 没传 ⇒ 无接收区 |
| 接收区「查看该会话」 | `index.ts` | ❌ 没传 |

**更正**：`openView` 现在**只吃会话 id**，快照 / 产出 / 标题全部自己按 id 取：
- 新增按会话取数的通道：`store.InstanceQuery.sessionId`（`WHERE session_id = ?`）→ `GET /tasks/instances?sessionId=` → 客户端 `fetchInstanceBySession(sessionId)`（取首行，失败 ⇒ `null`，**照常开弹窗**，只少产出卡与接收区）。
- 三处调用点统一成 `openView(sessionId)`；标题也统一成「任务名 · YYYY-MM-DD HH:mm」（此前各入口各写一套）。
- **铁律**（已写进 `openView` 与 `task-list` 的 props 注释）：进弹窗**只传会话 id**，禁止再加 heading / outputs / snapshot 这类参数。

**顺带修的真 bug**：换会话（点「查看该会话」）与关弹窗时，旧 `retain` 引用**没有 release**（原 `onClose` 只 dispose 当前那个，替换路径完全不 dispose）⇒ 连点几个会话会攒住物化 scope。现在收敛到唯一出口 `applyViewing()`：设新值前先 `prev.view.dispose()`。

**冒烟**：+2 项（按 sessionId 精确命中 / 未知 sessionId 为空）⇒ **442/0**。

## 四点八、专家团两轮评审 + 修正（2026-10-03，用户要求「做到完整做完再汇报」）

用户点名的四个问题与对应处置：① 任务附件没显示 → **顶部补「随附」区**（快照 `attachments` 真源，不依赖宿主是否透传 file 块）；② 「查看该会话」没用 → **删掉**（点进去就回不来）；③ 间距左右上下都不对 → **按官方基线重排**；④ 长文件名/显示多长/一排几个没想过 → 补齐折叠与截断规则。

### 排版口径（定稿）

| 项 | 规则 |
|---|---|
| 左右 | `calc(var(--dsh-composer-side-clearance,16px) + 16px)` = **34px**，与官方 `ChatView.scroll` 同一条基线 |
| 上下 | 上 **34**（与「分隔线 → 会话正文首行」同距）/ 下 **18** |
| 高度 | `max-height:min(38vh,340px)` + **自己滚** ⇒ 20 个上游任务也压不没会话区（`.dsh-tdt-sv-chat{flex:1 1 auto;min-height:0}` 保底） |
| 文件行 | **一行一个**（用户口径，`flex-direction:column` + `align-items:flex-start` 防止被拉成整行） |
| 长名 | `max-width:min(280px,100%)` + 省略号 + 悬停全文；不可点的短标记走独立 span（不参与省略） |
| 折叠 | 文件 >4 折叠；上游任务 >3 折叠；任务折叠态每任务只露 3 个文件 + 「还有 N 个」 |
| 排序 | **有产出的上游排前面**（折叠态默认露 3 个，别全是空壳） |
| 目录 | 官方 `IconFolderCloseRegular`（`FileTypeIcon` 按扩展名分类，尾斜杠只会拿到通用文件图标） |
| 跨区目录 | **不可点**（工作区文件浏览以会话为锚、限该工作区 ⇒ 点了必报错），标「跨工作区」；**任一侧未知也按跨区处理** |
| 两组区分 | 组标题 12/600/次级色 + 组间 .5px 细线（**不用左缩进/色条**，会把文字推离 34px 基线） |

### 两轮评审抓出并已修的问题

| # | 问题 | 后果 | 修法 |
|---|---|---|---|
| 1 | 输入区无高度上限 | 20 任务/30 文件撑爆弹窗、**被裁掉且无滚动条** | `max-height` + `overflow-y:auto` + 会话区保底类 |
| 2 | 目录拿不到文件夹图标 | 显示成通用文件图标 | 目录分支走 `IconFolderCloseRegular` |
| 3 | 同一随附文件**同屏显示两次**（顶部 chips + 气泡官方卡） | 一眼重复 | 顶部那份解析出路径时，气泡官方卡对同名**让位**；顶部没解析出路径时仍由官方卡补位 |
| 4 | 服务端 link 型「`workspace` 非空却查不到工作区」回退到**本任务工作区** | 拼出**存在但指向别的文件**的假路径（编造） | 三分支：字段空才用快照 workspacePath；非空查不到 ⇒ `null`；`ref` 另过 `isSafeAttachmentRef` |
| 5 | `attachmentPaths` 按**序**配对 | 两端过滤规则不同 ⇒ 整体错位、点开错文件 | 改按 **ref** 配对下发 |
| 6 | 顶部面板传了宿主原始 `t` | **所有 `{count}` 占位符原样显示**（真 bug） | 改传 `tt`（`interpolateTranslate`） |
| 7 | 去重后「只有附件的一轮」判空用 `files.length` | 整条用户消息**消失** | `contentFiles` 额外返回 `hadFiles`，判空改用它 |
| 8 | 排序比较器不满足反对称 | 多个非空上游任务被 V8 二分插入排序**反序** | 只比较「是否为空」这一位 |
| 9 | 跨区判定裸 `startsWith` + 未知时反而可点 | `/ws` 与 `/ws-2` 误判；未知时点了必报错 | 归一尾斜杠后比前缀；任一侧未知即按跨区 |
| 10 | chip 固定 280px、column 容器默认 stretch | 热区变成整行 280px | `min(280px,100%)` + `align-items:flex-start` |
| 11 | 三个纯内部 helper 导出、`as string` 强转、React key 用自定义 prop 冒充 | 死代码 / 卫生问题 | 降私有 / 提局部 const / 给真 `key` |

### 已知遗留（第二轮评审时留的，第三轮已清掉一条）

1. ~~**官方类未命中时**会话区纵向差 18px~~ → ✅ **已修（见 §四点九·1）**：根因是 frame 元素同时挂两个写 padding 的类、body 在后覆盖；改成「scroll 钩子归零 + frame 钩子独占」单一真源，命中 / 未命中一致。
2. **经典滚动条平台右侧差一个滚动条槽**（官方 `scroll` 无 `scrollbar-gutter`）：用户 2026-10-03 明确「**暂时先不弄，我发现了再说**」⇒ 保留登记，不动。左边界永远对齐，只影响观感。

## 四点九、第三轮：用户两轮点名后的横向重排 + 术语统一（2026-10-03）

用户看完第一版产物后的原话与处置：

| # | 用户意见 | 处置 |
|---|---|---|
| 1 | 随附文件「为什么要竖着一溜列？横向有这么宽」「一排至少 3 个」 | **文件全部横向排**：`flex-wrap:wrap` 从左到右、排满换行 |
| 2 | 「跟着文件名来：短就短、长就长。**最少 8 字**、**最多 20 字**，多了出点点点、移上去显示该点内容」 | 宽度上下限落在 **label** 上：`min-width:8ch`（不足留空）/ `max-width:20ch` + `text-overflow:ellipsis` + `title` 全文；chip 本身 `flex:0 0 auto`（短名就短） |
| 3 | 「前置任务也类似」——一个任务名一行，下面产出物**也要这么排** | 任务块内产出物改用同一个横向 `.dsh-tdt-sv-tfc-files`（同一套 8～20 字宽规则） |
| 4 | 「任务前面加一条**竖线**，横跨『任务名』和『产出物』两行」；线宽 **3–4px**、**浅色半透明** | `.dsh-tdt-sv-tfc-task::before`：`width:3px` + `background:var(--tdt-border)` + `opacity:.55` + `top/bottom:2px`（绝对定位 ⇒ 自动等块高，跨两行） |
| 5 | 「考虑一下一排是不是可以放**两个**前置任务」 | `.dsh-tdt-sv-tfc-tasks` 改 `grid-template-columns:repeat(2,minmax(0,1fr))`；**降级判据用容器宽度**（`container-type:inline-size` + `@container (width<=620px)` 降一列）—— 弹窗会被预览 / 编辑分栏挤窄，只看视口会判错 |
| 6 | 「所有文案里的『上游任务』都叫『**前置任务**』」 | 界面文案全改（中英双语 + `scheduler.ts` 三条阻塞原因 + 注释）。⚠️ **内部术语不动**：`resolvedDeps` / `upstream-*` 的 BLOCK_KIND key / `UpstreamInputView` 等沿用决策 43 的既有叫法，只改**用户看到的字** |
| 7 | 卡片「创建于」那一行「新建它就会冒出来」很跳 | **删掉第三行**，改挂标题行尾部：`[2026-10-03 创建]`（与 `[编号]` 同一 `faintStyle` = 同一字号）；`dateOf`（`09 月 28 日`）随之删除，换 `formatYmd`（**四位年**，跨年不认错） |
| 8 | 「18px 那个是不是应该调整？如果写得不规范就该调整」 | **已修**，见下 §四点九·1 |

### 1. 18px 纵向跳变的根因与修法（用户判定"不规范"，从"不影响主路径"升级为"要改"）

**根因**（`mirror/ChatView.tsx` 的 frame 元素挂了**两个都会写 padding 的类**）：

```
className = `${ocOr('ChatView','frame','dsh-tdt-sv-body')} dsh-tdt-sv-frame dsh-tdt-sv-chat`
                                   ↑ 官方命中时挂官方类        ↑ 我们的补足 18px

· 官方命中：官方 frame + 我们的 .dsh-tdt-sv-frame{padding:18px 0} + 官方 scroll 的 16px ⇒ 上 34
· 官方未命中：.dsh-tdt-sv-body{padding:16px …} 与 .dsh-tdt-sv-frame{padding:18px 0} 挂**同一元素**，
  两者特异性都是 (0,1,0)，body 在 ARCHIVE_SESSION_CSS 里**排在后面** ⇒ 覆盖 ⇒ 上 16px ⇒ **差 18px**
```

**修法（纵向单一真源）**：

| 钩子 | 规则 | 作用 |
|---|---|---|
| `.dsh-tdt-sv-scroll`（新增，挂在官方 scroll 元素上） | `padding-top:0;padding-bottom:0` | 把官方 scroll 自带的纵向 16px **归零**，纵向全交 frame |
| `.dsh-tdt-sv-frame` | `padding-top:34px;padding-bottom:16px`（**长写**，不碰左右） | **独占**上下；命中时左右仍走官方 scroll 的 `16 + clearance` = 34 |
| `.dsh-tdt-sv-body` | 只写 `padding-left/right` | 不再抢纵向（这正是覆盖的元凶） |

两条钩子都用**双类名**（`.dsh-tdt-sv-frame.dsh-tdt-sv-frame`，特异性 0,2,0）压过官方 CSS module（0,1,0），**不再依赖注入顺序**。
⇒ 命中 / 未命中两条路径纵向完全一致（上 34 / 下 16），18px 跳变从根上消除。

### 2. 冒烟

新增 8 项（横向排 / 8～20 字宽 / 两列网格 + 容器降级 / 3px 竖线 / 不用视口媒体查询 / frame+scroll 单一真源 / body 不抢纵向 / 创建时间挂标题行 + 无 `dateOf` / 术语统一）⇒ **459/0**。

## 五、落码记录

| # | 改动 | 坐标 |
|---|---|---|
| 1 | 宿主类型面：`UserMessage.content` 由「只 text」扩成**内容块联合**（`UserTextContent` / `UserFileContent`）；新增 `FileAttachmentRef`（id / name / bytes，**无路径**）与 `HostAttachments`（`ctx.attachments.saveFile`）；`HostContext.attachments` 作为**可选面**（缺 ⇒ 降级） | `src/host.ts` |
| 2 | `attachmentFileBlocks()`：随附文件 → 官方 file 块。**降级不阻塞**：无附件服务 / 目录 / 文件不在盘 / 超 8MB / saveFile 抛错 ⇒ 跳过该附件，只留文本路径。单文件上限 8MB、单次最多 20 个（防御，因附件库**永不自动删除**） | `src/dispatch.ts` |
| 3 | `buildMessage` 加 `fileBlocks` 参；消息结构 = **text 块在前 + file 块在后**（官方按 content 顺序渲染）；派发时落 `attachmentBlocks` 事件留痕 | `src/dispatch.ts` |
| 4 | 抽中立模块 `src/deps.ts`（零运行时依赖）：`ResolvedDependency` + `parseResolvedDeps` + 客户端便捷入口 `resolvedDepsOf(snapshotJson)`。服务端 `store.ts` 改为从它 import 并转出类型，**不复制第二份校验** | `src/deps.ts`、`src/store.ts` |
| 5 | 客户端 `InstanceRow` 声明 `snapshot`（服务端本就 `SELECT *`，只是前端没声明） | `src/client/query.ts` |
| 6 | 顶部输入区组件（**接收 + 随附**）：按上游任务分组（任务名 + 计划时刻），一行一个文件（图标 + 文件名），可点 → `openFile`；目录走官方文件夹图标；跨区目录 / 路径未解析 ⇒ 不可点并标注；两级折叠 + 高度上限 + 自己滚 | `src/client/task-file-context.tsx`、`src/client/archive-session-css.ts`（`.dsh-tdt-sv-tfc*`） |
| 7 | 弹窗内用户消息**也渲染 file 块**：`contentFiles()` 提取 → `UserMessage` 新增 `files`，照官方 `attachmentRow / fileCard / fileIcon / fileName / fileMeta` 画小卡（图标 + 名字 + 大小）。⚠️ 引用里没有路径 ⇒ **不可点开**，不伪造打开行为 | `src/client/session-view.ts`、`src/client/mirror/MessageItem.tsx` |
| 8 | `formatBytes()` 上提 `format.ts`（单源）；样式全部走 token + 官方类名，新增 CSS 落在 `archive-session-css.ts` | `src/client/format.ts`、`src/client/archive-session-css.ts` |
| 9 | 文案双语 12 键（`tfc*`）；**术语统一「前置任务」**（顶部区 / 分区标题 / 延期原因 / 阻塞原因，中英双语） | `src/client/locales.ts` |
| 10 | 冒烟：file 块四类降级 + 消息结构 + 会话弹窗取数 + 顶部区产物指纹（padding / 高度上限 / 横向排 / 8～20 字宽 / 两列 / 3px 竖线 / 目录图标 / 不可点标记 / hadFiles / 18px 跳变已修 / 创建时间挂标题行 / 术语）⇒ **459/0** | `scripts/smoke.mjs` |
| 11 | **会话区纵向单一真源**（修 18px 跳变）：新增 `.dsh-tdt-sv-scroll` 钩子把官方纵向 16px 归零；`.dsh-tdt-sv-frame` 改双类名 + 长写独占上下（34/16）；`.dsh-tdt-sv-body` 只写左右 | `src/client/mirror/ChatView.tsx`、`src/client/archive-session-css.ts` |
| 12 | **文件横向排**（用户二次点名）：`.dsh-tdt-sv-tfc-files` → `flex-direction:row;flex-wrap:wrap`；chip `flex:0 0 auto`；label `min-width:8ch;max-width:20ch` + 省略号 + hover 全文；折叠按钮排进同一横向流末位 | `src/client/archive-session-css.ts`、`src/client/task-file-context.tsx` |
| 13 | **前置任务一排两个** + **3px 浅色半透明竖线跨两行**：`.dsh-tdt-sv-tfc-tasks` → 两列 grid（`@container (width<=620px)` 降一列）；`.dsh-tdt-sv-tfc-task` 前缀 `padding-left:10px` + `::before` 3px 竖线 `top/bottom:2px` `opacity:.55`；产出物改用同一横向流 | `src/client/archive-session-css.ts`、`src/client/task-file-context.tsx` |
| 14 | **卡片创建时间移到标题行尾部** `[YYYY-MM-DD 创建]`（与编号同一 `faintStyle`）；`dateOf` 删除、`formatYmd` 新增（四位年） | `src/client/task-list.tsx`、`src/client/format.ts` |
| 15 | 界面文案「上游任务」→「前置任务」中英双语 + `scheduler.ts` 三条阻塞原因；内部术语（`resolvedDeps` / `upstream-*` key）不动 | `src/client/locales.ts`、`src/scheduler.ts` |

**验证状态**：typecheck 绿 · build 绿 · 冒烟 459/0 · ⏳ **真机待验**。

**真机必看的六条**（决定本轮成败）：
1. 顶部输入区与下方会话正文**左右是否同一条基线**（都该是 34px）、上下节拍是否接得上（上 34 / 下 16）。
2. **随附区**（本任务设置的附件）是否出现 —— 数据源是实例快照，不依赖宿主透传 file 块。
3. 气泡下方是否还出现官方附件卡（顶部已显示同名文件时应**让位**，不重复显示）。
4. **文件是否横向排**（不该再竖着一溜）、一排至少 3 个、chip 宽跟文件名走（短名短 / 长名 20 字封顶 + 悬停全文）。
5. **前置任务一排两个**，块前竖线是否横跨「任务名 + 产出物」两行，浅色不抢眼。
6. 前置任务文件点击：同工作区应能打开；**跨工作区的目录应灰掉不可点**（标「跨工作区」）。


## 六、遗留

- **附件库清盘**：官方 `Attachments are never deleted`，没有回收机制 ⇒ 长期跑会堆积。用户 2026-10-03 拍板**后置**，本轮不做，且明确「**不用提醒，我自己会知道什么时候处理**」⇒ 已从 [`PROGRESS.md`](../PROGRESS.md) 未决项表**移除**，只留本节存档。将来要做时：按会话谱系 / 任务维度清理无人引用的附件对象；官方目前无任何清理 API（README.md:133 记「no decision is recorded yet」）⇒ 只能自管引用账 + 调宿主未公开面，或等宿主提供。
