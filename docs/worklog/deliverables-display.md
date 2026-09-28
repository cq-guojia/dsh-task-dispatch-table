# 交付登记与产出展现（U12 扩展 · 文件/文件夹统一卡片）

> 状态：🔵 规划中（源码事实已核实，方案已收敛为「插件单写 + 禁止 LLM 调 present」，待用户拍板落码）
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

## 四、待拍板 / 未决

| # | 问题 | 影响 | 方向（未定） |
|---|---|---|---|
| D1 | 「所有产出」的边界 | **已收敛**：仅回执 `outputs`（agent 声明）。插件不主动扫描工作区（避免 node_modules 等噪声）。✅ 无需拍板 | — |
| D2 | `outputs` 校验放宽到目录时，目录「新鲜度」怎么算（存在性 / 子项 mtime 最大值） | 影响 B 路线是否把空目录也当交付 | 建议先用存在性；真机看是否需要子项时间 |
| D3 | 文件夹在**本插件预览 dock** 里的呈现：目前 `openFile` 按扩展名分派，点目录无预览 | 弹窗/整页点文件夹卡若走本插件预览面，需补「目录 → `workspaceFiles.list` 列文件树」分支；容器无桌面时宿主「打开所在文件夹」不可用 | 二选一或并存：dock 内列目录树 / 仅依赖宿主 reveal；待用户拍板 |
| D4 | 禁止 `present` 的实现强度：`present` 是 preset 内置工具，插件侧难卸载 | 仅靠提示词禁止，模型偶发仍可能调用（无害——只多一张卡或抛错） | 真机观察；若必禁则评估作用域禁用 `present` |

---

## 五、落地清单（拍板后，顺序）

1. `src/receipt.ts`：execute 改签 `(args, exec)` → 成功后 `session.append('deliverables/presented', …)`（files=校验 outputs，放宽到目录）；try/catch 仅 warn。
2. `checkReceipt`/`reconcile.ts`：outputs 校验支持目录存在性。
3. 提示词改两条：① `outputs` 按实际填「目录/文件/混合」；② **明确禁止调 `present`**（插件统一生成卡片）。
4. （D3）`src/client/file-preview.tsx`：补目录分支（如采用 dock 内列树）。
5. 冒烟补断言（回执流式 append / 失败只 warn 不影响回执 / files=校验 outputs 含目录 / 目录 path 可写 / 禁止 present 提示词文案）。
6. 真机一轮任务验证：宿主会话视图出官方交付卡 + 我方弹窗出卡（**目录 + 文件混合**一例即可验证）。

---

## 六、关联决策

- 决策 40（U12 B+C）**已演进为 B-only + 禁止 present**：原 C 路线（LLM 兜底调 present）被取消，因插件直写已覆盖全部文件/目录场景，且 `present` 工具本身拒绝目录——保留 C 反而引入「目录调 present 必报错」与「两层重复」两个风险。本修订由用户 2026-09-28 拍板。
- 与 U11 同源：`openFile` 统一入口、`FilePreviewPanel` dock、官方 `MarkdownText`/`CodeBlock` 渲染链均复用。
