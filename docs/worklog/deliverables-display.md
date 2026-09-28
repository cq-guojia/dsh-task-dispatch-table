# 交付登记与产出展现（U12 扩展 · 文件/文件夹统一卡片）

> 状态：🟢 已落码（2026-09-28，本地未提交，待真机复验）
> 跟踪起点：2026-09-28 用户要求「所有产出的文件或文件夹都用交付卡片展现」；经源码核实与多轮澄清，最终收敛为「插件作为唯一写入方，LLM 只通过回执 `outputs` 声明产出，禁止 LLM 调 `present`」。
> 关联：[`../design/artifact-opening.md §四-B`](../design/artifact-opening.md)（原 U12 B+C 设计，决策 40）、[`../design/decisions.md`](../design/decisions.md)、`src/receipt.ts`、`src/client/file-preview.tsx`、`src/client/mirror/Deliverables.tsx`。

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

## 七、关联决策

- 决策 40（U12 B+C）**已演进为 B-only + 禁止 present**：原 C 路线（LLM 兜底调 present）被取消，因插件直写已覆盖全部文件/目录场景，且 `present` 工具本身拒绝目录——保留 C 反而引入「目录调 present 必报错」与「两层重复」两个风险。本修订由用户 2026-09-28 拍板。
- 与 U11 同源：`openFile` 统一入口、`FilePreviewPanel` dock、官方 `MarkdownText`/`CodeBlock` 渲染链均复用。
