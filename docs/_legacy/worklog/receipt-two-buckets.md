# 回执产出拆双桶：主文件 / 过程文件（2026-10-10）

> **状态**：🔵 **落码完成，待真机验收**（typecheck 绿、build 过、冒烟 **749/0**；未标封卷）。
> **定型文档**：[`../design/data-model.md`](../design/data-model.md) §一（回执机制 + 产出双桶表 + DDL）、[`../design/features.md`](../design/features.md)（回执 / 交付登记 / 过程文件展示三行）、[`../design/features/dependency-snapshot.md`](../design/features/dependency-snapshot.md) §三。
> **关联**：[`deliverables-display.md`](deliverables-display.md)（交付卡数据源与历史踩坑）、决策 19 / 24（回执通道）、决策 32（产出冗余列）、决策 43（依赖快照）。

## 一、需求与拍板（用户原话收敛）

任务跑完提交的回执里，产出**不再混成一堆**，而要模型自己分两块报：

1. **主文件**：任务最终交付物（任务报告、成果文件、成品目录）；
2. **过程文件**：执行中的日志、中间文件、临时/工作目录。

动机（用户原话）：*「我的下级任务不需要接收整个文件夹里的所有构成文件，它只需要那个最终生成的『主文件』」*；以及*「人在看的时候…我需要从中区分出一个核心文件出来」*。

四问拍板（2026-10-10）：

| 问 | 拍板 |
|---|---|
| 分桶 | **两桶**（主 / 过程），**每桶都能传多个文件和文件夹** |
| 显示 | **都显示、但分主次**：主文件照旧出交付卡；过程文件另起一块、**默认折叠**显示数量 |
| 下游注入 | **只注入主文件** |
| 数量 | **主文件 ≤10、过程文件 ≤10**；告诉模型自己判断，「该报文件夹就报文件夹，别散落重复，不然扔几百个回来」 |

## 二、源码事实（动手前核实的四处消费者）

`outputs` 这一桶同时喂四处，拆桶必须同时交代：

| # | 消费者 | 位置 | 拆桶后 |
|---|---|---|---|
| 1 | 对账存在性校验 | `checkReceipt`（`src/reconcile.ts`） | **两桶同一道闸**（都按「确实存在」判） |
| 2 | 冗余列 | `task_instances.outputs`（`recordCompletion`） | 新增 `process_outputs` 列 |
| 3 | 宿主交付事件 | `deliverables/presented`（`src/receipt.ts`） | **只写主桶** |
| 4 | 下游依赖注入 | `resolvedDeps[].outputs` → `buildMessage`（`scheduler.ts` / `dispatch.ts`） | 读的就是 `outputs` 列 ⇒ **天然只给主文件，零改动** |

展示面（读实例行）：会话弹窗交付卡（`session-view.ts` + `mirror/Deliverables.tsx`）、执行记录页（`records-timeline.tsx`）、查看档与卡片「上次执行」（`task-info.tsx`，两个调用点共用一份实现）、卡片内「执行记录」迷你表（`task-list.tsx`，主桶图标摘要，**不改**）。

## 三、方案取舍

1. **保留 `outputs` 作为主桶字段名**，新增 `processOutputs`。理由：`task_instances.outputs` 列、`ResolvedDependency.outputs`、`buildMessage`、四处 UI 读取全部零迁移；**旧实例只有 `outputs` ⇒ 天然等价于「只有主文件」**，不需要数据回填。
2. **上限 10 选「截断 + 如实告知」而不是「拒绝重报」**：无人值守链路里一次拒绝就多一轮对话（多烧一轮 token），还可能反复卡住不收敛；截断最多丢展示项，从不失败。工具返回文案会写明「有桶超过 10 项上限，只记录了前 10 项」。参数 schema 上的 `maxItems` 只是给模型的提示（宿主不据此硬拦参数——`normalizeStatus` 的宽松归一就是同一结论的证据）。
3. **过程文件也过存在性校验**（与主桶同一道闸）：防幽灵路径进界面与下游消息。已知代价：过程文件路径写错会让整次回执判失败并走重试 —— 与主桶今天的行为一致；若真机因此频繁误失败，降级为「只校验主桶」只需改 `checkReceipt` 一处（代码内已留注释标出）。
4. **同一路径两桶都报 ⇒ 以主桶为准**（从过程桶剔除），交付事件也只写主桶；同桶内重复路径去重（避免重复卡片）。
5. **过程文件不进轻量查询列**：`LITE_INSTANCE_COLUMNS` 不含 `process_outputs`（日历一次取满整月，不展示产出）⇒ `LiteTaskInstance` 类型同步 `Omit<..., 'snapshot' | 'process_outputs'>`，类型不撒谎。
6. **过程文件块做成三处共用的唯一展示件**（`client/process-files.tsx`）：会话弹窗、执行记录页、查看档都引它，`dsh-tdt-proc-*` 皮肤在 `ui/controls-css.ts`（与 `filechip` / `chip` 同域）。组件默认 `useState(false)` 收起、展开才渲染文件行。

## 四、落码清单

**宿主**：`src/receipt.ts`（双桶参数、归一 + 跨桶去重 + 截断、工具描述与 `receiptInstruction` 双桶裁决句、事件 payload、交付事件只写主桶）· `src/store.ts`（`process_outputs` 列 + `ensureInstanceColumns` 旧库迁移 + `recordCompletion` 双桶 + `LiteTaskInstance`）· `src/reconcile.ts`（`checkReceipt` 双桶校验、`finishTerminal` / `settleByReceipt` 双桶落库）· `src/scheduler.ts`（`resolvedOf` 加注释钉住「产出 = 主文件」，**代码零改动**）。

**客户端**：新增 `src/client/process-files.tsx`；改 `ui/controls-css.ts`（`PROCESS_FILES_CSS`）· `ui/index.ts` · `query.ts`（`InstanceRow.process_outputs?`，`outputsOf` 复用）· `index.ts`（`ViewingState.processOutputs` + 取数 + 下发）· `session-view.ts`（`processOutputs` prop → tailSlot 里排在交付卡网格之后，**独立判存**：只有过程文件的任务也看得到）· `records-timeline.tsx`（折叠态图标行仍只出主文件；展开区主文件排 + 过程块；`hasProcess` 计入展开判据）· `task-info.tsx`（产出清单下方过程块）· `locales.ts`（`procFilesTitle` 中英 + LocaleKey）。

**冒烟**：新增 12 条（`[5b-3]` 段 + 客户端段）——两桶校验通过 / 过程文件缺失判失败（detail 带 bucket）/ 旧回执兼容 / 工具参数 `maxItems`/ 落 event 的两桶形状与跨桶去重 / 返回文案分桶 / **交付事件只写主桶** / 超限截断 / 描述含分桶口径 / 回执段含双桶指令 / 下游注入不含 `process_outputs`（判据**先去注释**再比）/ 三处共用同一组件 + 默认收起 + `process_outputs` 复用同一解析器。

## 五、踩坑

1. **并发写同一文件会静默丢编辑**（本仓既定事实，这次真踩到）：同一批里对**同一个文件**发两条编辑，会有一条被覆盖 —— 三处编辑（`locales.ts` 的 zh 词条、`index.ts` 的 `ViewingState` 字段、`records-timeline.tsx` 的 import）就这样丢了，靠 typecheck 报错才暴露。**对策：同一个文件一次只改一处，改完回读核对**。（工作区规则里「核查实际内容后逐个重做编辑」说的就是这件事。）
2. **冒烟替身要照抄真实形状**：回执工具测试里 `appendEvent` 最初直接存对象，而真实 `TaskStore.appendEvent` 是**收对象、落库前 `JSON.stringify`**（`store.ts:519-523`）⇒ `JSON.parse` 当场炸。替身必须与真实现同形，否则测的是假形状。
3. **既有冒烟断言会被文案改写打掉**：「outputs 粒度判断规则」那条断言钉的是 `按规范建的目录` 原文，本次描述改写成「按日期规范的目录」⇒ 断言同步更新（断言应钉**规则存在**，而不是某一句原话）。
4. **`recordCompletion` 加形参是破坏性改动**：冒烟的依赖用例也调它，签名变更后同步补 `processOutputs` 实参 —— 顺手把过程文件也塞进去，于是那条「resolved 产出 = 两项」的断言**额外证明了过程文件不下传下游**。

## 六、交付卡「模型报了却没有卡」的核实结论（有界，未改代码）

**用户疑问**：*「对话框里没有交付卡…是他说了有交付文件，我们才去把它做成卡片，还是只要生成的文件都做成卡片？」*

**结论（读源码 + 既有 worklog 复核）**：

1. **卡片只来自回执声明，不扫描工作区**。当前逻辑正是用户期望的那一种：`deliverables/presented` 的 `files` = 回执 `outputs`（`receipt.ts`），弹窗再以 `task_instances.outputs` 为权威源合并快照去重（`session-view.ts` 的 `deliverFiles`）。**没有「生成什么就展示什么」这条路径**——`deliverables-display.md` §四 D1 早已收敛：「仅回执 outputs（agent 声明），不扫描工作区」。
2. 因此「没卡」只可能是两种情况之一：
   - **(a) 回执的 `outputs` 为空**（模型只在正文里「说了」交付文件、没在回执里报；或任务确实没产出）⇒ 按设计就是没卡。**`outputs: []` 是合法的完成申报**（`checkReceipt` 放行），所以任务照样成功。
   - **(b) 挂点不存在**：弹窗交付卡只挂**最后一轮 turn-tail**（官方 `DeliverablesTail` 同位），依赖 `keyed` 流里有 turn-tail 节点且 `data.closing` 非空（`session-view.ts` 的 `lastTailTurn` / `tail` 两道守卫）。会话流若以 legacy 形态渲染、或该轮 tail 未结算，挂点就没有。
3. **判定方法（无需改代码，真机自查）**：执行记录页展开该次执行 → ①「产出」图标行是否有内容（= 主桶落库值）；② 事件流水里的 `receipt` 事件 detail 的 `outputs` 是否为空。`outputs` 非空而仍无卡 ⇒ 才是 (b)，那时再谈渲染兜底。
4. **本次未改渲染路径**：用户此前明确要求交付卡保持在**会话末尾官方同位**（`deliverables-display.md` §七：顶部常驻区块被否决）。没有运行时证据就把它挪位置 = 回退已定稿的观感决策。本次只做了一件顺带的事：**过程文件块也挂在同一挂点上，但独立判存**（只有过程文件、没有主文件的任务同样看得到）。

## 七、验证与残余

- `npm run typecheck`（宿主 + client 两套）绿；`npm run build` 过（dist 随提交）；`npm run smoke` **749 项通过 / 0 失败**。
- ⏳ **待真机验收**（建议连同这次一起验）：
  1. 让任务报「一个报告文件 + 一个日志目录」⇒ 会话尾部出**交付卡（报告）** + 下方**「过程文件 · N 项」**折叠块，点开可见、点开文件能预览；
  2. 只报过程文件（无主文件）⇒ 只有过程文件块、没有交付卡；
  3. 配 A→B 依赖：B 的派发消息里只有 A 的报告路径，**没有** A 的日志目录；
  4. 旧实例（只有 `outputs` 列）：照旧只显示主文件，不出现空的过程文件块。
- 已知边界：过程文件桶**不进官方会话页**（那里只吃 `deliverables/presented`，我们刻意只写主桶）——过程文件只在插件自己的展示面（弹窗 / 执行记录 / 查看档）可见。

---

## 八、补记（2026-10-10 追加）：提示词两处口径

> 用户同日追加两条提示词要求，均属「给模型的指令面」，随本工作包落码（本包**尚未封卷**，仍在真机验收中）。

### 8.1 产出两桶的文件夹口径（含纳关系）

**用户原话**：*「如果是提交一个文件夹，里面是可以包含主要工作、场务的那种东西吧？不需要为了这种情况就单独分开去整理……你看能不能描述一下。简单，清晰明了。」*

**担心的问题**：提示词若把两桶写成**完全互斥**，模型遇到「一个文件夹里几十个文件、只有一个是核心」时，会被迫把核心文件单独报一个、再从几十个里挑几个凑过程文件 ⇒ 不对。

**落码**（`src/receipt.ts` 回执工具的 `description` 段）：

- 目录**直接报整个目录**，别把里面每个文件拆开列；
- 明写「目录里同时含有主要工作和场务 / 过程内容是正常的，**无需为此单独拆分、挪动文件再整理**」；
- 判据行补「（**含纳关系合法，不冲突**）」——即「某文件在 `outputs`、其父目录在 `processOutputs`」是允许的（跨桶去重仍以主桶为准）。

### 8.2 派发消息补「无人值守」约束

**用户原话**：*「强调这个任务是自动执行的，没有人值守：1. 不能申请额外的权限；2. 也不能提出问题等用户回答。」*

**核实结论**：改前 `buildMessage`（`src/dispatch.ts`）**没有**这条 —— 只有权限档位说明（`permissionInstruction`）与回执失败处理，没有「无人值守 / 不提问 / 不申请权限」的约束。

**落码**：`buildMessage` 在「任务实例」行后插一段 **【执行约束】**，明写任务定时自动派发、执行期间无人回复 ⇒ ① 不得向用户提问或等待答复（信息不足就基于现有上下文自行决策并继续，必要时写进回执 `note`）；② 不得申请 / 索取 / 等待任何额外权限或授权（严格在已授予范围内执行，超范围的操作跳过并在回执中说明，不要停下来要许可）。

> 位置刻意放在任务提示词之后、回执段之前；回执段仍保持「只出现一处、且放最末」的既有约定（不与它抢位置）。
