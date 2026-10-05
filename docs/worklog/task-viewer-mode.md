# 右侧栏「查看 / 编辑」两档切换（工作包：task-viewer-mode）

> **状态**：🔵 **已落码**（2026-10-05 当日开工 + 当日落码；冒烟 **611 项 / 0 失败**，⏳ 待真机验收）
> **来源**：用户 2026-10-05 口述需求 + 同日三轮问答澄清
> **定型落点**：[`../design/features/creation-edit.md`](../design/features/creation-edit.md) §七-C（查看档口径）

---

## 一、需求原话（用户，逐字保留）

> 来，我们开一个新坑。
>
> 因为我现在有很多前置任务，什么地方都需要显示任务的名称。但是当用户看到任务执行的情况时，没有办法点击该任务去查看它的详细信息。
>
> 目前，查看任务信息有两个地方：
> 1. 任务列表：可以将其展开查看任务信息。那里的信息除了提示词没有，应该都在里面了。
> 2. 编辑窗口：点击"编辑"，弹出右侧栏，然后去修改任务等内容。
>
> 我现在遇到的问题是：在任务执行列表中，我看到某个任务有一个前置任务，但目前可能只显示了它的名字。这时，我肯定希望去看这个前置任务到底是什么。
>
> 如果我不做修改，目前其实有两种办法：
> 第一种方式：点开右侧的修改弹窗，去修改这个任务。
> 第二种方式：点击任务列表窗口，把任务的 ID 或名字带进去进行查询，甚至可以默认给它展开。
>
> 说实话，我觉得这两种方式都不好。为什么呢？
> 弹开右侧侧边栏，对用户体验来说是好的，因为我没有跳出界面，还在继续做我的事，只是有个东西可以让我去看这个任务的情况。但是，我不希望编辑它。因为编辑是一个相对繁琐且比较抽象的事情，其实我只是想能很方便地看到这个任务应该怎么执行。
>
> 打开任务列表去把它展开。我觉得这可能是因为用户查到这个任务时，突然忘了这个任务是什么情况，想要去看一下里面传入了什么附件，以及上次是什么情况。
>
> 我觉得这是一个相对比较合理的内容，但问题在于它打断了用户的操作。他要跳一个页面去看，我操，如果我看了之后，还要操作现在这个东西，就还得回来。而且回来还很麻烦，我还得去找它才能回来。
>
> 所以，这两个方式都不合理。
>
> 我现在的想法是，在右侧栏（也就是目前新增和编辑的地方），左下角增加两个滑动切换选项：一个是"预览"，一个是"编辑"（或叫"修改"）。
>
> 具体的操作逻辑如下：
> 1. 正常添加任务：如果我正常点击"添加"，肯定直接进入"编辑"界面。编辑了一部分后，我可以切换到"预览"。此时的预览其实就是实时翻译我当前编辑的结果，展示我现在编辑了什么、什么时候执行、有哪些附件等。
> 2. 从其他地方查看任务：如果我是通过其他地方点击查看进入的，可以通过传参让右侧栏展开，并且默认停留在"预览"界面，这样我就能很方便地看到这个任务的情况。如果我想编辑，再切换到"编辑"界面去修改。
> 3. 从任务列表编辑：如果我是从任务列表中点击"编辑"进入的，右侧栏展开时默认就停留在"编辑"滑块界面。
>
> 那这样的话，预览那个地方要做些什么呢？其实我觉得跟现在任务列表展开下面的"基础信息"内容差不多，主要是把"提示词"补进去。如果提示词很长的话，加一块区域让它可以下拉滑动查看，不用占用那么长的页面空间。
>
> 具体来说，我觉得类似于这样的结构：
> 1. 基础信息：把基础信息都翻译好，展示它上游的前置任务是什么、需要传入哪些文件、附加哪些文件，以及下次执行的计划等。
> 2. 跟进信息：在下面加上"跟进"内容，并用一个框把它框出来。
> 3. 上次执行状态：把现在任务配置展开后右侧的"上次执行"信息，放到基础信息结束后的某个位置。这里加一个带色块的标识：如果是"失败"的，色块就是红色；如果是"成功"的，色块就是绿色。把"上次执行"的相关信息展示出来。
>
> ……好吧，我们先沟通几轮，等都聊好了、弄好了文档，我们再来做。

---

## 二、澄清结论（三轮问答，用户亲口拍板）

| # | 问 | 用户定的 |
|---|---|---|
| 1 | 「跟进」是什么 | **不存在**。用户最终原话：「不是，就是上次执行，没有所谓的跟进块」。此前两轮里用户一度把它解释为「上次执行的备注 / 过程摘要」、又解释为「上次执行的那些记录（什么时间执行、执行了多长时间、产出了什么）」⇒ 收敛为**只有三块**：基础信息 / 提示词 / 上次执行 |
| 2 | 入口范围 | **本期只做一处**：任务卡片展开区「前置任务」那几行。用户原话：「你暂时不要动，我们先加一个地方来看」「现在我们先在『任务配置』的展开里面，那个『前置任务』一条条的地方，加一个来试」⇒ 执行记录页前置任务名、记录任务名、全站任务名**一律不动** |
| 3 | 入口形态 | **名字直接可点**（任务名整体可点、hover 变蓝，与卡片里「任务会话」那行的做法一致） |
| 4 | 未保存冲突 | **弹确认后切过去**：提示「A 有未保存的修改，放弃并查看 B？」，确认才切 |
| 5 | 查看档底栏 | **只看不存**：切换控件放最左；查看档隐藏 删除 / 重置 / 取消 / 保存，只留关闭（要改就切到编辑档） |
| 6 | 版面 | **纵向单栏流**：基础信息 → 提示词（框 + 限高滚动）→ 上次执行（带状态色块） |
| 7 | 提示词形态 | **Markdown 渲染** + 限高滚动（与编辑器里现有「提示词预览」同款） |
| 8 | 会话 / 产出可点性 | **保持可点**：任务会话可点开会话、产出物可点开文件预览（与卡片基础信息一致） |

> ⚠️ 命名：用户原话叫「预览 / 编辑」，但右侧栏里**已有一个叫「预览」的旧功能**（配置预览 = 任务定义 JSON 只读面板，`ConfigPreviewPanel`，文案 `editorPreview`）⇒ 新档定名**「查看 / 编辑」**，旧 JSON 面板文案与位置**不动**（两者不再同名）。

---

## 三、现状定位（开工时的代码事实，`文件:行号`）

| 事 | 位置 |
|---|---|
| 右侧栏 = 占布局的分栏 | `src/client/task-editor.tsx` 的 `TaskEditorDrawer`（声明 1263–1310，渲染 2262–2286） |
| 头部（标题 / 启用开关 / ✕） | 同文件 2104–2138 |
| 底栏（删除 / 重置 / 取消 / 保存） | 同文件 2143–2221，`.dsh-tdt-ed-footer` 是 `justify-content: flex-end` |
| 脏判定（唯一真源） | 同文件 1412 `dirty`（基线 `initialDraftRef` 1411） |
| 关闭确认 | 同文件 `ConfirmDiscard` 1018 / `VersionConfirm` 1045（**绝对定位挂在面板内**——此前踩过「官方 Modal 被遮罩压住点不了」） |
| 已有的「配置预览」（JSON） | 同文件 `ConfigPreviewPanel` 1247–1258、`openPreviewPanel` 1423–1426、触发按钮 2031 |
| 打开编辑器的唯一两个入口 | `src/client/index.ts` 1137（＋ 新建任务）、`openEditor(id)` 633–650（从 `effectiveInline` 找定义 → `definitionToDraft`） |
| 卡片展开面板 | `src/client/task-list.tsx` `TaskExpandPanel` 932–953；基础信息 `renderInfo` 1219–1301；「上次执行」`renderLastRun` 1142–1217；**「前置任务」行 1266–1288（当时是纯文本 span，无点击）** |
| 卡片基础信息字段 | 排期 / 预计执行 / 工作区 / 模型 / 失败重试 / 允许延迟 / 附加文件 / 前置任务；**注释 1222 明确「不再显示提示词」**（`row.promptHead` 全文件零引用） |
| 上次执行取数 | `task-list.tsx` 1053–1067：`fetchInstances({ taskId, statuses: ['succeeded','failed','skipped','unknown'], limit: 1 })` |
| 分段控件 | `src/client/ui/Segmented.tsx`（`items` / `value` / `onChange` / `size` / `variant`） |
| 样式注入唯一入口 | `src/client/ui/style.ts` 的 `applyStyle(domain, css)`（域按登记序拼接，`tokens` 恒最前） |

---

## 四、方案要点（详细口径见 `design/features/creation-edit.md` §七-C）

1. **档位模型**：`index.ts` 的 `editor` state 加 `initialView: 'edit' | 'view'`（打开时的默认档）；**当前档位**由抽屉内部 state 管理（与 `PromptEditorModal` 内「编辑 / 预览」同款做法）。
2. **共享展示层**（本次最大回归面）：新建 `src/client/task-info.tsx` + `task-info-css.ts`（域 `domain:task-info`），把 `InfoField` / 纸表格样式常量 / `windowLabel` / `renderNextExec` / 排期行 / 上次执行渲染从 `task-list.tsx` **原样迁出**，卡片与查看档**共用同一实现**——否则必然重演「同一个排期两处文案不一样」。
3. **查看档正文**：新建 `src/client/task-view.tsx`，纵向单栏流三块；自持「上次执行」取数（沿用 `query.ts`）；会话 / 产出可点。
4. **底栏**：最左插 `Segmented`（查看 / 编辑），编辑档其余按钮原样保留（现有 `flex:1 1 auto` 占位继续把它们推到右侧，**无需改 footer CSS**）；查看档只渲染 `[Segmented, 占位]`。
5. **入口链路**：卡片前置任务行 `span` → `button`（hover 变蓝），新 prop `onViewTask` 逐层透传；`index.ts` 抽 `findDefinition(id)` 供 `openEditor` / 新的 `openViewer` 共用；未保存冲突走 `pendingView` + 面板内确认层。
6. **显式不做**：查看档不含「预计执行」具体时刻（草稿推不出服务端派生值）+ 附加文件不可点（草稿只有 `ref`，无绝对路径与锚点）——两条都按「拿不到就不装成可点 / 不编造」处理；不改现有 JSON「配置预览」文案与位置；执行记录页与全站任务名不动。

---

## 五、过程记录（2026-10-05 当日完成）

### 5.1 落码顺序与产出

| # | 做了什么 | 落点 |
|---|---|---|
| 1 | 抽**共享展示层**：`InfoField` / 纸表格样式常量 / `windowLabel` / `infoStatusColorOf` / `StatusIcon` / `durationMsOf` / `baseNameOf` / 基础信息字段渲染 / 上次执行明细，从 `task-list.tsx` 原样迁出 | 新建 `src/client/task-info.tsx` + `src/client/task-info-css.ts`（域 `domain:task-info`） |
| 2 | 卡片展开区改为**消费**共享层（删掉本地那一份），`.dsh-tdt-info-*` 与 `.dsh-tdt-rec-ic-*` 规则移出 `TASK_LIST_CSS` | `task-list.tsx`（`renderInfo` / `TASK_LIST_CSS` / `ensureTaskInfoStyle()`） |
| 3 | 新建**查看档正文**：纵向单栏三块（基础信息 → 提示词 Markdown 限高滚动 → 上次执行带状态色块），自持上次执行取数 | 新建 `src/client/task-view.tsx` |
| 4 | 抽屉加**两档切换**（底栏最左 `Segmented`，id `dsh-tdt-ed-viewtab`）、头部任务名 + 来源标记、查看档隐藏启用开关与底栏按钮、`onDirtyChange` 上报、`pendingView` 内联确认框 | `task-editor.tsx` + `task-editor-css.ts` |
| 5 | 打通入口与冲突流：`findDefinition` 抽出共用、`openEditor`/`openViewerNow`/`openViewer`/`confirmPendingView`、`editor.view` 默认档、卡片「前置任务」行 `onViewTask` 逐层透传 | `index.ts` + `task-list.tsx` |
| 6 | 文案中英双份（档名 / 来源标记 / 提示词块 / 未填 / 切换确认）+ 冒烟 **+8 断言** | `locales.ts`、`scripts/smoke.mjs` §22 |

冒烟：**603 → 611 项全过**（新增 8 条：两档切换 / 查看档只读收缩 / 三块齐全 / 提示词取自草稿且不碰 `row.promptHead` / 上次执行真实取数且新建态不发请求 / 冲突确认走内联层 / 默认档映射与同任务只切档 / 前置任务名可点 + 双语键进产物）。

### 5.2 踩坑与处置（都是真事，别重复踩）

| # | 坑 | 处置 |
|---|---|---|
| 1 | **同一文件并行两次编辑 ⇒ 后写基于旧快照，先写的改动被静默覆盖**：改冒烟断言时把「新增 `const ti = …`」与「把断言换成 `ti.includes(...)`」分成两个并行调用 ⇒ 断言换了、声明没了，冒烟直接 `ReferenceError: ti is not defined` | 同一文件**一律顺序**编辑；事后用 `grep` 复核声明是否真在文件里 |
| 2 | `task-editor-css.ts` 的 `TASK_EDITOR_CSS` 是**模板字符串**，我在 CSS 注释里写了反引号（`` `domain:task-info` ``）⇒ 字符串被提前终止，TS1005 三连 | CSS 注释里**不许出现反引号**；已改回无反引号写法 |
| 3 | 计划里写的「查看档加载中走全站唯一 `Loading`」与 `ui-style-guide.md` §三 的**硬性规定**冲突（2026-10-05 用户点名：没点名就不许新增 `<Loading>` 实例、不许改文案 / 样式 / 位置，还在加载的区域直接空着） | **按手册执行**：查看档上次执行加载中**渲染 `null`**（不新增任何加载文案）；计划那条作废 |
| 4 | 「失败重试」两个来源形状不同：卡片是 `retryMax`（number）、草稿是 `maxAttempts`（string） | `TaskInfoBaseView.retry` 定为**节点**：卡片给数字、草稿没填给「未填」占位（**不编 0**） |
| 5 | 发现既有隐患：点**当前正在编辑的同一个任务**的「编辑」会重建草稿 ⇒ **静默丢弃**用户改了一半的内容 | 本次顺手收紧：`openEditor` / `openViewer` 遇到「同任务」只**切档**（`setEditor({ ...editor, view })`），不重建草稿 |
| 6 | 档位 effect 的两种情形要分开：换任务 → 回默认档；同任务 → 只在**外部明确要求换档**时跟随（否则会把用户手动切的档弹回去） | `openedTaskRef` 比 id + `initialView` 依赖分离（`task-editor.tsx` 档位 effect） |

### 5.3 当时定下但**没做**的（边界，别当漏了）

- **查看档不含「预计执行」的具体时刻**：那是服务端派生值（卡片取 `row.nextSlotAt`），草稿态推不出来；「排期」一行已表达下次计划 ⇒ 记入 `PROGRESS.md` 未决 / 验收清单，待真机确认是否要补。
- **查看档里附加文件不可点**：草稿只有 `name` / `ref`，没有服务端解析的绝对路径与锚点会话 ⇒ 按「拿不到就不装成可点」处理（产出物来自实例真路径，仍可点）。
- **查看档里的前置任务名不可点**：本期唯一入口在卡片展开区（用户明确「先加一个地方来看」）；查看档自身不做二次跳转，避免递归套娃。
- 执行记录页的前置任务名 / 记录任务名、全站任务名**一律未动**。

### 5.4 证据（`文件:行号`）

- 两档切换控件：`src/client/task-editor.tsx` 底栏 `id: 'dsh-tdt-ed-viewtab'`（`Segmented`，查看档时只渲染它 + 弹性占位）。
- 查看档正文：`src/client/task-view.tsx`（`taskInfoBaseFields` / `MarkdownText` / `lastRunFields({ …, hideStatus: true })`）。
- 共享展示层：`src/client/task-info.tsx`（`InfoField` / `taskInfoBaseFields` / `lastRunFields` / `LAST_RUN_STATUSES`）+ `task-info-css.ts`（域 `domain:task-info`）。
- 入口与冲突流：`src/client/index.ts` 的 `findDefinition` / `openEditor` / `openViewerNow` / `openViewer` / `confirmPendingView` / `pendingView` / `editorDirtyRef`。
- 前置任务行可点：`src/client/task-info.tsx` 的 `.dsh-tdt-info-dep` 按钮 + `src/client/task-info-css.ts` 的 `:hover` 变蓝。

## 六、r12 真机反馈修正（2026-10-05 同日，冒烟 611 → 613）

用户真机看完第一版给出 6 条修正，全部落码：

| # | 反馈 | 处置 |
|---|---|---|
| 1 | 底栏「删除 / 取消 / 保存」圆角与切换控件不一致，「肯定有人没按规则自己写」 | **排查结论：没人自写**——四钮是官方 `Button`（圆角来自宿主注入 CSS，插件侧查不到值），与基础层 `.dsh-tdt-seg`/`.dsh-tdt-btn`（radius-md=12px）**两套体系并存**才是根因。修法 = footer 四钮换基础层 `TdtButton`（`.dsh-tdt-ed-danger` 红字红边覆盖保留）；全站 borderRadius 审计结论登记 `ui-style-guide.md` §二（存量官方 Button 混用点登记待收编） |
| 2 | 草稿未保存标记别放任务名旁（名字可能很长），挂「任务配置」标题旁，文案精简正式 | 头部 viewtag 移除；chip 挂查看档「任务配置」标题旁；文案改「编辑的草稿未保存 / 新建，尚未保存」（en: Draft edits not saved / New, not saved） |
| 3 | 排期下面要有「预计下次执行」，跟原来逻辑一样 | 见下面「纯核抽取」 |
| 4 | 三块重排：任务配置 → 上次执行 → 提示词（最下）；标题前加小图标 | `task-view.tsx` 重排 + 三枚官方图标（Plan / Clock / Think）+ `.dsh-tdt-ed-view-head/-ic/-title` |
| 5 | 提示词默认几行不框 +「全屏查看」= 只读 MD 全屏（源码 / 预览） | 默认 max-height 120px 不框；`PromptEditorModal` 加 `readonly` 参数（默认预览态、CodeMirror `editable:false`、隐藏版本开关 / 版本面板 / 确认框） |
| 6 | 全站任务名都连到查看档 | 卡片标题、执行记录标题、记录前置名、编辑器已选前置行、会话弹窗标题任务名段（掐冒泡保既有交互）+ 查看档内前置名补链；**下拉候选不连**（点击=选中，冲突，登记待用户定） |

### 纯核抽取（本轮最大的一处动土）

「预计下次执行」要**实时反映草稿**，而 cron→next 此前只有服务端能算（`tasks.ts` 带 node:fs/zod）。抽出 `src/schedule-next.ts`（零 node 依赖，唯一外部依赖 cron-parser，client bundle 由 tsdown 内联；chrome99 的 Intl 时区可用）：`logicalDateOf` / `intervalSpecOf` / `anchoredIntervalSlots` / `scheduledSlotsFor` / `filterSlotsBySchedule` / `wallClockToAbsolute` / `nextSlotAfter` / `onceScheduledAt` / `tzOffsetMs` 原样迁出，`tasks.ts` import + re-export ⇒ `runtime-index` / `scheduler` / `index` 调用面**零改动**，服务端冒烟全绿。配套搬迁：`scheduleCron`（草稿→cron）从 `task-editor.tsx` 迁 `schedule-text.ts`（**消除 task-view ↔ task-editor 运行时循环**）；`renderNextExec` / `LiveText` / 秒级心跳 / 相对时间表达从 `task-list.tsx` 上提 `task-info.tsx`（卡片与查看档共用）。

### r12 踩坑

| # | 坑 | 处置 |
|---|---|---|
| 1 | `ScheduleCronDraft.scheduleKind` 写成 `'interval' \| 'period'`，实际编辑器是 `'periodic'` | typecheck 抓到，照编辑器 `ScheduleKind` 改 `'interval' \| 'periodic'` |
| 2 | 想让 task-view 直接 import task-editor 的 `scheduleCron` ⇒ 组件互相引用构成**运行时循环** | 纯函数迁去 `schedule-text.ts`（无环归宿），编辑器与查看档都从那里取 |
| 3 | cron-parser 内联进 client bundle 后自带 `toLocaleString(` ⇒ 冒烟「不再用 toLocaleString」的 **bundle 级反断言**误伤 | 反断言改读**我们自己的源文件**（format.ts / task-info.tsx），bundle 级不再适用 |
| 4 | `everyNWeeks` schema 可空 ⇒ 纯核的最小类型写 `number \| null` 并判空，不能照抄旧代码的 `=== undefined` 单判 | `schedule-next.ts` 的 `filterSlotsBySchedule` 同时判 null / undefined |
