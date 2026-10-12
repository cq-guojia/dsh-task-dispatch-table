# 交付登记与产出展现（U12 扩展 · 文件/文件夹统一卡片）

> ✅ **完成封卷**：U12 整条线收口、真机验证通过（2026-09-28）。此后不再修改，新发现另开文件。

> 状态：✅ **已落码并真机验证通过（2026-09-29 结项）**
> 跟踪起点：2026-09-28 用户要求「所有产出的文件或文件夹都用交付卡片展现」；经源码核实与多轮澄清，最终收敛为「插件作为唯一写入方，LLM 只通过回执 `outputs` 声明产出，禁止 LLM 调 `present`」。
> 关联：[`../design/features/artifact-opening.md §四-B`](../design/features/artifact-opening.md)（原 U12 B+C 设计，决策 40）、决策记录（已并入各专题文档）、`src/receipt.ts`、`src/client/file-preview.tsx`、`src/client/mirror/Deliverables.tsx`。

---

## 一、需求要点（用户原话收敛）

1. **统一展现**：任务产出的**文件或文件夹**都要用官方「交付文件」卡片（`deliverables/presented`）展现；不要只在回执里存路径。
   - **目录不限于网页项目**：任何任务（报告、数据集、构建产物、代码库……）的产出都可能是「一整个目录」，也可能是「若干文件」，或**多个目录 + 多个文件混合**。
2. **插件是唯一写入方**：既然插件能直接写交付事件，**就只由插件写**（B 路线）；**提示词里禁止 LLM 调 `present`** 去写卡片——LLM 的唯一职责是在回执 `outputs` 里**正确声明**产出（是目录就填目录 path，是文件就填文件列表，可混合）。
3. **不重复是「结构性消除」而非「去重算法」**：因为只有一个写入方（插件），天然不会出重复卡片；LLM 被禁止调 `present`，也就不存在 C 路线与 B 路线打架。

---

## 二、源码事实核实（2026-09-28，官方包 0.1.7-rc.2，实现本体）

> 本地无包，已从 npm 拉取 `@deepseek-ai/dsh-tool-present@0.1.7-rc.2` + `@deepseek-ai/dsh-client-ui-deliverables@0.1.7-rc.2` 读 `lib/`。

| 事实 | 坐标 | 对方案的影响 |
|---|---|---|
| agent 侧 `present` 工具**只接受 regular file**：每条 path `lstat`/`stat` 后 `if (info.type !== 'file') throw 'not a regular file'` | `dsh-tool-present/lib/types/index.js:76-84`（execute 内） | **模型调 `present` 永远无法呈现目录**，且调目录会直接抛错 ⇒ 必须禁止 LLM 调 `present`，目录只能由插件直写 |
| 宿主打开处理器支持目录：「a directory is verified by the Host filesystem mapping alone」 | `dsh-tool-present/lib/index.js:128`（`openVerified` 注释） | 插件直写的目录 path 在宿主侧能正确打开/揭示 |
| 卡片有目录专属状态词 `directoryOpening/directoryOpened/directoryError` 与 `FileTypeIcon` 按 path 出图标 | `dsh-client-ui-deliverables/lib/client.js:1544,1558-1560,2107-2110` | 目录卡片能渲染（图标 + 「打开所在文件夹」动作） |
| `deliverables/presented` 事件结构 `{turn, callId, files:[{path, description?}]}`；`path` 是纯字符串、无 isDir 标记 | `presented.d.ts` / `dsh-tool-present/lib/types/index.js:98` | 文件夹与文件在事件层无差别，都是 path 字符串；插件直写可放任意 path |
| `present` 工具结果经 `tools/result` 钩子才 `session.append`；`maxFiles` 默认 8 | `dsh-tool-present/lib/types/index.js:7,92-101` | 我方 B 路线复刻同一 `append` 语义，但 files 由插件全权决定（含目录、数量不受 maxFiles 限） |

### 「文件 vs 目录」判定结论

- **判定职责在 LLM 填写回执契约 `outputs` 时完成**，插件**不另做判定、只是透传**：LLM 声明目录 path ⇒ 插件写目录 ⇒ 文件夹卡；声明文件 path ⇒ 插件写文件 ⇒ 文件卡；可同时声明多个目录 + 多个文件。
- 官方 `deliverables/presented` 是扁平 path 列表，无文件夹折叠算法——**列什么 path 就是什么卡**。
- 目录不限于网页项目；任何任务产出都按实际填 `outputs`。

---

## 三、方案（插件单写，禁止 LLM 调 present）

### B 路线 · 插件自动写（唯一写入方，覆盖文件 + 文件夹）
- `src/receipt.ts`：execute 改签 `(args, exec)`；回执成功时取 `exec.agent.session` + `exec.callId` + `turn`（`sessionProjections.stateOf(session,'turnBoundary')?.lastTurn`，取不到即跳过）→ `session.append('deliverables/presented', { turn, callId, files })`。
- `files` = **校验过的 `outputs`**，**放宽到允许目录**（目前 `checkReceipt` 验「文件存在 + mtime 新鲜」，目录也要支持存在性校验）。`outputs` 可含任意组合的目录 path 与文件 path。
- 整段 try/catch，失败只 `logger.warn`（原因 + 实例 id），**绝不抛给模型**，回执照常成功。
- 这是**唯一**写入方 ⇒ 文件夹（网页/数据集/构建产物…）与文件都在此处写出，无第二写入方。

### 提示词 · 两条指令（替换原 C 路线）
1. **声明产出**：回执 `outputs` 按实际产出填写——整目录就填目录 path；若干文件就填文件列表；允许「多个目录 + 多个文件」混合。
2. **禁止调 `present`**：明确告知模型「交付卡片由插件统一生成，**不要调用 `present` 工具**；所有交付物通过回执 `outputs` 声明即可」。（`present` 由 standard/ptc/cordis preset 内置，无法在插件侧简单卸载 ⇒ 以提示词禁止为主；若真机发现模型仍调用，再评估作用域禁用。）

### 不重复 = 结构性消除
- 仅插件一个写入方；LLM 被禁止调 `present` ⇒ 不存在两层写入，自然无重复卡片。（原「官方按 path 去重 + 提示词约束」双保险不再需要，但保留无害。）

---

## 四、待拍板 / 未决（落码后状态）

| # | 问题 | 落码后状态 |
|---|---|---|
| D1 | 「所有产出」的边界 | ✅ 已收敛：仅回执 `outputs`（agent 声明），不扫描工作区。 |
| D2 | `outputs` 校验放宽目录「新鲜度」 | ➖ **无需改**：`normalizeOutputs` 只归一字符串，从不按文件/目录区分，目录 path 天然可写；无存在性校验故无新鲜度问题。 |
| D3 | 文件夹在**本插件预览 dock** 里的呈现 | 🔵 暂缓：宿主侧「打开所在文件夹」可用（容器无桌面时不可用）；dock 内 `workspaceFiles.list` 列目录树作为增强，待真机看是否需要。本次未实现（不阻塞主链路）。 |
| D4 | 禁止 `present` 的强度 | ✅ 提示词禁止已落码；`present` 是 preset 内置，未做作用域禁用。真机观察模型是否仍调；若必禁再评估。 |

---

## 五、落地清单（2026-09-28 已落码）

| # | 项 | 状态 |
|---|---|---|
| 1 | `src/receipt.ts`：execute 改签 `(args, exec)` → 回执成功后 `session.append('deliverables/presented', {turn, callId, files})`（files=归一 outputs，含目录）；独立 try/catch 仅 `logger.warn`，绝不拖垮回执 | ✅ 已落码（typecheck/build/smoke 153 全过） |
| 2 | `checkReceipt`/`reconcile.ts` outputs 校验放宽目录 | ➖ 无需改（见 D2） |
| 3 | 提示词两条：① outputs 按实际填「目录/文件/混合」；② **明确禁止调 `present`** | ✅ 已落码（`receiptInstruction` + 工具 outputs 描述） |
| 4 | `src/index.ts` 注入 `sessionProjections` + `src/dispatch.ts` 透传（取 `turnBoundary.lastTurn`） | ✅ 已落码 |
| 5 | **弹窗回归修复**：交付卡网格与词表改读会话 turn 级 `deliverables.presented`（`collectPresentedByTurn`），同源覆盖 present 工具与插件代写，消除「禁止 present 后弹窗空网格」回归 | ✅ 已落码 |
| 6 | 冒烟断言更新 | ✅ 已落码 |
| 7 | 真机一轮任务验证（目录 + 文件混合一例） | 🔵 待你重装 dist 复验 |

### 实施要点（2026-09-28）
- **B 路线直写事件**：`receipt.ts` 在回执成功、写库之后，取 `exec.agent.session` + `exec.callId` + `sessionProjections.stateOf(session,'turnBoundary').lastTurn`，直写 `deliverables/presented`。绕过 `present` 工具的「拒目录」限制 ⇒ 文件夹也能交付。失败只 `logger.warn`。
- **禁止 present**：模型提示词明确「不要调用 present，交付卡片由插件统一生成；调 present 遇目录会报错」。单一写入方 ⇒ 结构性无重复卡片。
- **弹窗同源**：交付卡网格不再从 present 工具调用块推导，改读会话 turn 级 `deliverables.presented`（官方 DeliverablesTail 同源数据，由 `deliverables/presented` 事件经引擎填充）。无论事件来自 present 工具还是本插件代写，弹窗都出卡。

---

## 六、热修：弹窗交付卡永不渲染（2026-09-28，真机复验暴露）

**现象**：任务跑成功、执行记录「产出」列也出了链接（回执 `outputs` 正常落库），但点开「会话查看」弹窗，**末尾交付文件卡网格（DeliverablesGrid）整片不出现**。

**根因（读官方源码定位）**：官方 `DeliverablesTail` 取数是 `owner.turn.data.get("deliverables")`
（`@deepseek-ai/dsh-client-ui-deliverables@0.1.7-rc.2 lib/client.js:1149`，`turn.data` 是 **Map**）。
而本插件 `collectPresentedByTurn` / `collectFilePaths` 用对象式 `face.data?.deliverables?.presented`
（`.data` 当普通对象访问）——对 Map 必为 `undefined` ⇒ 每轮交付清单恒空 ⇒ 弹窗里交付卡永远不出来。
冒烟只校验 bundle 字符串、没用真实 Map 形态的 `turns` 跑渲染，故漏测。

**修复**（`src/client/session-view.ts`）：新增 `turnDeliverablesPresented(face)` 取值 helper，对
`data instanceof Map` 走 `data.get('deliverables')`、否则退化为对象式访问（兼容两种形态）；
`collectPresentedByTurn` 与 `collectFilePaths` 均改走该 helper。冒烟加 bundle 级防线
（`turnDeliverablesPresented` + `instanceof Map` + `get('deliverables')`）。typecheck + build + 冒烟 162 项全过。

> 🧠 记忆纠偏：本文件 §三/§五原写「读会话 turn 级 `deliverables.presented`」——数据位置对，
> 但漏了「`turn.data` 是 Map、须 `.get()`」这一形态事实；本次补正。

---

## 七、弹窗交付卡数据源改为「实例 outputs」权威（2026-09-28 二次复验仍不渲染）

**现象**：§六 的 Map 修复推送后，用户重装 dist 复验——**老任务弹窗仍不出现交付卡**。说明根因不在读取 shape，
而在**这些会话的快照里压根没有 `deliverables.presented`**：要么插件 `append('deliverables/presented')`
那段被 `session/callId/sessionProjections` 任一缺失的分支跳过（仅 `logger.warn`），要么宿主 `target('chat')`
的 timeline 快照没把 `deliverables` 重放进 `turn.data`。依赖「宿主 timeline 带 deliverables」不可靠。

**决策（用户复验暴露后拍板）**：弹窗「交付文件」区块改以**本插件自己的 `task_instances.outputs` 为权威源**
（回执落库真值、非模拟；执行记录「产出」列能显示即证明它存在），与快照 `deliveredByTurn` **合并去重**——
`outputs` 覆盖 100%（老任务快照无数据但有 outputs），快照覆盖直接调 `present` 的任务（outputs 可能空），两者互补不重复。

**改动**（`src/client/session-view.ts` + `src/client/index.ts`）：
- `SessionViewModal` 增 `outputs?: string[]` prop；弹窗顶部常驻「交付文件」区块（`deliverRowTitle` 标题 +
  `DeliverablesGridMirror`，`onOpen → openFile` 预览），数据 = `outputs` 与 `deliveredByTurn` 按路径去重合并。
- turn-tail 节点**不再**渲染快照交付卡网格（改由顶部区块统一承载），避免重复。
- `index.ts`：打开弹窗处（执行记录两处入口）把实例 `outputs` 经 `parseOutputs(row.outputs)` 透传进弹窗状态
  （`viewing.outputs` → `SessionViewModal`）。
- 冒烟加断言：`dsh-tdt-sv-deliver-section` + `deliverRowTitle`。typecheck + build + 冒烟 163 项全过。

> 结论：交付卡「数据源」从「宿主 timeline 投影」**迁移到「自有状态库」**——更稳，且老任务免重跑即能渲染。

**同日复验修正（位置/样式对齐官方）**：顶部常驻区块被用户否决——官方 `DeliverablesTail` 挂在
**turnTail 槽位**（每轮收尾消息之后、会话底部），且无区块标题、就是卡片网格本身。已改回：
- 顶部「交付文件」区块删除（`dsh-tdt-sv-deliver-section` 不复存在）；
- 网格挂**最后一轮 turn-tail**（`lastTailTurn`：倒序扫 keyed `order` 找末个 turn-tail 节点取 turn 号），
  数据仍走 §七 的 outputs+快照合并去重源（`deliverFiles`），卡片类名本就走官方 `Deliverables` 前缀；
- 回执提示词同步修订（`receipt.ts` 两处：工具 outputs 参数说明 + `receiptInstruction`）：
  outputs 粒度由模型判断——装产物的文件夹**是为本任务专门建的**（如网页/项目专属文件夹）→ 报文件夹路径；
  文件只是写进**既有或按规范建的目录**（如按日期的日常目录）→ 逐个报文件。起因：cron 探针任务
  「建文件夹写两个文件」模型报了两个散文件而未报文件夹。

**同日二次复验修正（位置再对齐 + 桌面不可用提示）**：用户截图指出网格仍偏下——它跑到了
`MessageIconActions`（复制/分支/用量/时钟那一行）**下面**。读官方 `TurnTailNodeView` 源码确认：
官方 root 是 flex column gap 16px，children = `[tailSlot, MessageIconActions]`，即交付卡/提示**必须在
操作行之前**。我们之前把 `DeliverablesGridMirror` 放在 `TurnTailNodeViewMirror` 返回之后，自然跑到操作行下面。
已改成：
- `TurnTailNodeViewMirror` 新增 `tailSlot?: ReactNode` prop，渲染在 `MessageIconActions` 之前；
- `renderKeyedNode` 在最后一轮 turn-tail 内构建 tailSlot = `[桌面提示, DeliverablesGridMirror]`，
  传给 `TurnTailNodeViewMirror`，于是顺序 = 收尾文字 → 桌面提示 → 交付卡网格 → 操作栏，和官方一致；
- 新增桌面不可用提示：调用官方同源接口 `/api/present.host`（`usePresentedHost`），当返回
  `available=false` 时显示 `presented.unavailable` 文案（"此主机没有可用的桌面……"），文案与官方字典键一致；
- 该提示官方只在没有可用桌面时出现；本插件弹窗里走同一接口，能判断。冒烟 164 项全过。

**同日三次迭代（U11 目录浏览器 + 面包屑导航）**：用户提出「点了交付卡里的文件，怎么返回目录树？」。
拍板**面包屑方案**（不做多文件浏览/分栏）：预览 dock 从「单文件预览」升级为「目录浏览器」
`FileBrowser`（`src/client/file-browser.tsx`，替换 dock 里的 `FilePreviewPanel`）：
- **目录/文件自动判别**：入口仍是 `openFile(path)`，组件先 `list(path)`——成功 ⇒ 目录树；
  报 `not-directory` ⇒ 当文件预览（dir = 父目录）。官方 `stat` 不含 kind，`list` 试探是唯一可靠判别。
  `WorkspaceFilesFace` 补 `list`（官方 wire：`{path, entries:[{name,type:'file'|'directory'|'other',size?}], truncated}`）。
- **面包屑**：当前目录切成可点段，点任意段回跳；预览文件时末段显示文件名（不可点，点父段即返回）。
- **顶栏按钮**：「上一级」（上箭头，回父目录）、「回到根目录」（文字钮，回最初打开的位置）、
  「刷新」（预览态重读 / 目录态重列）、「复制路径」、「关闭」；md 文件保留「渲染⇄源码」分段。
- **树**：目录在前文件在后、名称升序；目录行进入，文件行在父树内预览（面包屑保留 ⇒ 随时返回）；
  `truncated` 提示截断。空目录/列举错误各有态。
- 复用 `file-preview.tsx` 的官方预览体（导出 `BytesPreview`/`TextPreview`/`previewKind`/`errView`/
  `listingOf`/`ErrBox`），渲染底层仍全官方。
- ⚠️ 构建用的 primitives **没有** `IconChevronLeftOutlineRegular`/`IconFolderOpenOutlineRegular`
  （/tmp 解包的另一版本有，别照抄）——上一级用 `IconChevronUpOutlineRegular`、目录行用
  `IconChevronRightOutlineRegular`、根目录用文字钮。冒烟 172 项全过。

**同日四次迭代（浏览器复验收敛）**：用户反馈三点，全部照办——
- 去掉「上一级」「回到根目录」按钮（面包屑第一段即回根；浏览范围以点开的目录为起点，不设限但也无需按钮）；
- 头部改**两行**：第一行只留操作按钮（md 切段 / 复制 / 刷新 / 关闭），第二行整行给面包屑（dock 窄，单行挤不下）；
- 面包屑**超宽折叠**：横向滚动 + 自动滚到末端（当前层始终可见），左侧出省略号按钮，点开换行展开全部层级供点选
  （`useLayoutEffect` 测 scrollWidth>clientWidth；展开态导航后自动收回折叠）。
- ⚠️ CSS 在模板字符串里，注释**不能含反引号**（会终止字符串，TS1127）——省略号用文字描述。冒烟 172 项全过。

**同日五次迭代（三验：两排布局 + 下拉选层 + outside-workspace 人话）**：用户否掉「换行展开」方案，拍板：
- **两排布局**：第一排 = 面包屑独占（目录路径，无文件名）；第二排 = 文件名（跑马灯，hover 左移露出全名）
  + 操作按钮（md 切段 / 复制 / 刷新 / 关闭）。
- **面包屑超宽折叠为下拉**：隐藏测量条永远渲染完整面包屑（折叠态渲染的是收缩内容不能直接量，
  `useLayoutEffect` 比较测量条与容器宽）；超宽 ⇒ 行首出下拉图标 + 当前层名，点开浮层菜单列出全部层级
  供选层回跳，透明遮罩点击收起。未超宽照旧内联可点。
- **`workspace-file/outside-workspace` 翻成人话**：官方 `list` 限定工作区内路径（wire 契约原文
  「The directory listing or watch path resolves outside the Session's workspace root」），`workspace`
  条目多半是指向外部的符号链接，官方同样拒绝——非我方 bug。  errView 新增该分支 +
  `previewOutsideWorkspace` 双语文案，不再显示裸错误码。

**同日六次迭代（四验：下拉被裁修复 + 常驻图标组 + 报错页返回）**：用户截图指出两点：
- **下拉菜单被挡住**：根因 = `.dsh-tdt-sv-crumbbar` 设了 `overflow:hidden`，绝对定位的浮层菜单被裁没
  （不是 z-index）。修复 = crumbbar 溢出可见；裁剪职责移交给内部 `.dsh-tdt-sv-crumbs-region`
  （菜单挂图标组下，不在 region 里）。⚠️ 测量也随之下移：测量条对比 region 宽而非 bar 宽。
- **报错页困死**：点 `workspace`（outside-workspace）报错后停在错误页没有任何办法回去。
  修复 = 导航历史栈（loadDir 压栈 / goBack 弹栈），报错文案下加「返回」按钮（栈空时不显示）。
- **常驻图标组**（用户拍板：下拉图标不应只在超宽时出现）：第一排行首三个图标常驻——
  ① 下拉选层（chevron-down，点开浮层菜单列出全部层级，任何时候都能选）；
  ② 返回上一层（chevron-up，工作区根禁用）；
  ③ 返回（历史栈弹栈；包内无左箭头图标，右箭头旋转 180 度代用）。
  面包屑超宽时只显示当前层名，不超宽照旧内联可点。

**同日七次迭代（五验：第一排重排 + 关闭上提）**：用户拍板顺序
`[▾ 选层] [面包屑…] [← 返回] [↑ 上一层] [✕ 关闭]`——返回/上一层/关闭挪到面包屑**右侧**，
关闭从文件名排上提到第一排右上角（第二排只剩文件名 + md 切段/复制/刷新）。
图标：返回 = 官方 `IconChevronLeftOutlineRegular`（包里没有"拐弯箭头"图标，左尖号即用户画的 `<`；
此前用右箭头旋转 180° 属误用，已删）。⚠️ 踩坑复盘：此前「包里没有 ChevronLeft」的判断是错的——
类型来自本仓库 shim `src/client/primitives.d.ts`（只声明我们要用的子集），真实 0.1.7-rc.2 包
lib/types/icons/index.d.ts 里**有** ChevronLeft/FolderOpen 等；以后要新图标先查 shim，缺了就补声明
（运行时是平台模块完整图标表，shim 声明即可用）。

---

## 八、关联决策

- 决策 40（U12 B+C）**已演进为 B-only + 禁止 present**：原 C 路线（LLM 兜底调 present）被取消，因插件直写已覆盖全部文件/目录场景，且 `present` 工具本身拒绝目录——保留 C 反而引入「目录调 present 必报错」与「两层重复」两个风险。本修订由用户 2026-09-28 拍板。
- 与 U11 同源：`openFile` 统一入口、`FilePreviewPanel` dock、官方 `MarkdownText`/`CodeBlock` 渲染链均复用。
