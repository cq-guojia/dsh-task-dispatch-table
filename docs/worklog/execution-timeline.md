# 执行记录总查询页（时间轴）

> **状态**：🔵 进行中（2026-10-03 开工；本轮只建文档，未落码）
> **来源**：用户 2026-10-03 口述需求 + 同日四项拍板
> **配套**：定型规格 [`design/features/execution-timeline.md`](../design/features/execution-timeline.md)；任务选择器抽象 [`design/ui-foundation.md`](../design/ui-foundation.md) + [`design/ui-style-guide.md`](../design/ui-style-guide.md)
>
> 本文件记**过程**（需求原话、怎么定的、为什么、证据坐标）；结论与规矩一律升到定型层，不在这里留第二份。

---

## 一、需求原话（用户 2026-10-03）

> 「总体的第二个标签栏：第一个标签栏不是任务配置吗？第二个标签栏不是执行记录吗？
> 我现在要做的是第二个标签的执行记录。说白了，就是查所有任务的执行记录流水账，按时间倒序排列。
> 我希望它是用时间轴的形式来表示：
> 1. 页面宽度：它的宽跟主界面的宽是一样的。
> 2. 过滤功能：上面肯定还是要有过滤，该有时间过滤的用时间过滤，该有任务区过滤的用任务区域过滤。
> 3. 分页加载：每页显示多少条我还没想好，但它应该是需要分页的。关于分页方式，是用页码（1、2、3、4、5）去点，还是拉到下面去加载更多，一直加载下去，你给我个意见。我当然是希望拉到下面去加载更多，但我不知道如果一直拉，拉到 1000 条、2000 条，整个页面能不能承载得住，这是我觉得要考虑的。
>
> 关于形式，我肯定是希望时间轴是这样的：
> 1. 应该以天为单位，有一个稍微大点的标签（比如：2026 年 4 月 30 日）。
> 2. 在当天的标签下面，列出具体执行的时间点（比如：3:05 执行的、3:08 执行的、3:10 执行的）。
> 3. 整体按倒序排列，越近的显示越前面。
>
> 关于样式……我希望有一个轴，类似于这样的情况：
> 1. 整体布局：右边不一定单独占一列。我觉得「天」应该在最上面，有点像微信朋友圈的样式：某一天作为一个标签，下面接着是具体的时间段，一个一个的块儿代表在几点到几点做的一个任务。
> 2. 成功失败的表示：这里不要用单独的图标来表现成功或失败，应该用底色，或者在前面用一条很明显（比如几像素宽）的线去表示任务到底执行是成功还是失败。
>
> 老规矩，先不要动啊，先不要去改代码。先把该有的文档建起来，把我的东西消化一下，然后输出一下，我看你理解得对不对。接着把方案先补起来，我们基于方案讨论清楚，没问题了再动手。」

⚠️ 用户附了一张样式参考图，本机模型读不到图内容 ⇒ 形态以**文字描述**为准（天标签在最上面、朋友圈式、块代表一次执行、不用图标），图仅作观感参考；落码前若对形态有分歧，以用户口头复核为准。

### 1.1 入口澄清（用户原话）

> 「就是改现在主界面右上角的那个，上面不是有 4 个按钮吗？其中 3 个滑动按钮分别是：任务配置、执行记录和调试。右边是一个新建任务。现在我们要做的就是执行记录的那个界面。**那个界面原来有一个，是我们做最低版本、最最简化的测试验证用的。现在就是要改那个界面**，明白不？」

⇒ 不是新加一级 tab，是**重写既有 `records` 分支**（见 §二 第 2 行）。

---

## 二、现状核实（源码级，非印象）

| # | 事实 | 坐标 |
|---|---|---|
| 1 | 一级切换已存在：`useState` 三档 config / records / debug；顶部 `Segmented` 三项 + 右侧「＋ 新建任务」 | `src/client/index.ts:489`、`src/client/index.ts:1095-1112` |
| 2 | **`records` 分支 = 三元最后一个 else**（`src/client/index.ts:1279` 起）：提示文案 + 两个**原生 select**（状态 / 任务）+ 原生表格七列，点行就地展开该实例 events；数据来自**调试快照** `data.instances`（`index.ts:1022-1026` 客户端排序），**不走 HTTP 端点、不分页** | `src/client/index.ts:1279-1330+`；state `index.ts:502-504`；`titleOfTask` `index.ts:942-945` |
| 3 | 宽度锚点：任务配置视图限宽居中 `maxWidth 1120 / minWidth 760` | `src/client/task-list.tsx:1901-1903` |
| 4 | 服务端端点 `GET /tasks/instances` 当初即按「**未来总查询页共用**（决策 55）」设计：参数 `taskId / sessionId / workspace / status / from / to / cursor / limit`；workspace 由 tasksInline 反查 task_id 集合（该表无工作区列，不动表结构） | `src/index.ts:828` 起；反查 `workspaceTaskIdsOf` `src/index.ts:151` |
| 5 | `listInstancesByQuery`：**游标分页已实现** —— 排序 `scheduled_at DESC, id DESC`，cursor 编码末行 `(scheduled_at, id)`，`LIMIT limit+1` 判有无下一页；`from` 用 `>=`、`to` 用 `<`（半开区间） | `src/store.ts:820` 起 |
| 6 | 客户端 `fetchInstances` 已带回 `nextCursor`（线上参数名单数 `status`） | `src/client/query.ts:112-120` |
| 7 | UI 基础层现有：Button / Segmented / Field(SelectField) / TimeRange / DateTime / MarqueeText / Loading / tokens / style。**无搜索型选择器** | `src/client/ui/` |
| 8 | 全仓**没有**任何 combobox / autocomplete / 命令面板类控件；官方 primitives 也无（只 Input / Menu / Pill / Segmented / Switch / Tooltip），`Menu` 支持 `MenuLabel` / `MenuSeparator` 分组 | 2026-10-03 全仓扫描结论 |

⇒ **结论：服务端与取数链路基本零改动**，本工作包主要是客户端视图 + 一个共用新控件。

---

## 三、四项拍板（2026-10-03）

| # | 问题 | 用户拍板（原话要点） |
|---|---|---|
| 1 | 一级入口形态 | 不改现有顶部三 tab，直接重写「执行记录」那一屏（§一.1） |
| 2 | 点一条执行记录干什么 | **打开会话** —— 复用现有归档会话弹窗，与卡片「执行记录」面板行为一致 |
| 3 | 过滤维度 | **状态要加、工作区要加**；**任务不能是普通下拉**，要做成**带搜索框的选择器**：默认最近 10 条 +「更多」，搜索框按**任务名 / 任务 ID** 实时过滤。且**必须抽象成共用控件**（新建任务选「前置任务」是同一问题；外部改工作区，内部候选要实时跟着变） |
| 4 | 默认时间档与承载 | 「最近三四天」；首屏 20 或 50 条（具体再看）；之后自动续拉；**保底 2000 条**，到 2000 条提示用户缩小范围 |

### 3.1 分页选型（我给的意见，用户采纳）

**结论：游标式「拉到底加载更多」，不做页码。** 三条理由：

| 对比项 | 页码 1/2/3 | 加载更多（游标） |
|---|---|---|
| 服务端 | 需总数统计 + 偏移分页，要新增能力 | **游标已实现**（§二.5），零改动 |
| 数据在动 | 看第 2 页时新一条执行进来了 ⇒ 页码整体错位，重复行 / 漏行 | 游标锚定末行 `(scheduled_at, id)`，不受影响 |
| 时间轴形态 | 翻页会把「某一天」从中间劈开 | 按天往下续，结构天然连续 |

**承载问题**（用户点名担忧）：2000 个轻量节点（一行文字 + 一条色线）现代浏览器可承载，真正卡的是几万节点叠复杂样式与动画。仍加两道保险：

- **默认时间档** 最近 3~4 天，把数据量兜在合理区间；
- **硬上限 2000**：到上限改显「已加载 2000 条，请缩小时间范围」，不再自动续拉。

---

## 四、任务选择器：现有下拉调用点调研（2026-10-03 全仓扫描）

用户要求「这个功能明确是需要抽象出来统一的，因为很多地方都要用」⇒ 动手前先把调用点摸全，避免抽象漏点或凭空造接口。结论摘要（完整清单进定型层文档）：

| 类 | 点 | 坐标 | 现状 |
|---|---|---|---|
| **A 目标**（任务选择，要换成 TaskPicker） | 执行记录 tab 的任务 select | `src/client/index.ts:1294-1300` | **原生 select**，全量任务、无工作区作用域 |
| A | 编辑器「前置任务」的第②级（任务） | `src/client/task-editor.tsx:1939-1948` | `SelectField`（官方 Menu），受**内部** `depWs` 作用域 |
| **B 作用域**（工作区下拉，统一形态但不接 TaskPicker 数据源） | 编辑器「前置任务」的第①级 | `src/client/task-editor.tsx:1927-1936` | `SelectField`，候选从 `props.tasks` 反推 |
| B | 编辑器底部「工作区」 | `src/client/task-editor.tsx:1586-1597` | `SelectField`，候选来自 `GET {prefix}/options`（`src/index.ts:639-693`） |
| B | 任务列表顶部「工作区」 | `src/client/task-list.tsx:1927-1941` | **直接用官方 Menu**（自绘锚点），候选从卡片数据去重 —— **第三份下拉实现** |
| **C 同类**（状态过滤，形态跟随） | 执行记录 tab 的状态 select | `src/client/index.ts:1284-1290` | 原生 select，`INSTANCE_STATUSES` |
| C | 卡片执行记录面板状态下拉 | `src/client/task-list.tsx:1359-1376` | `SelectField` |
| D | 其余（条数档 / 频率档 / 模型 / 权限 / 窗口 / 时间预设…） | `task-editor.tsx` 与 `ui/TimeRange.tsx` 多处 | 纯枚举，保持 `SelectField`，不动 |

**两个必须一并解决的口径冲突**（落码时会咬人，先记）：

1. **工作区候选三个来源**：编辑器底部走 `/options`（宿主真实工作区）、前置任务第①级与任务列表顶部都从**任务表反推** ⇒ 同一份概念三份真源，观感也不一致。TaskPicker 的 `scope` 只做**受控入参**，不参与「工作区列表从哪来」的裁决（另立条目）。
2. **任务选项文案两套**：执行记录 tab 是 `title（id）`（`index.ts:942-945`），编辑器 `editorTasks` 是 `[code] name`（`index.ts:930-941`，注释明确「绝不把机器 id 当尾缀拖出来」）⇒ 统一控件必须定一套（倾向后者），搜索仍要能按 id 命中。

**最小必要接口**（从实际调用点反推，非凭空设计）：`value` / `onChange(id)` / `options`（复用现有 `EditorTaskOption`，带 `workspace`、`enabled`）/ `scope`（外部受控工作区，'' 或 undefined = 不限）/ `excludeIds` / 文案三件套 + `searchPlaceholder` / 布局三件套（`disabled` `size` `width` `align`）+ 可选 `recentLimit`（默认 10）与 `disabledTag`。

---

## 五、本轮产出（文档）与下一步

**本轮只建文档，不动代码**（用户明确）。产出：

| 文件 | 层 | 内容 |
|---|---|---|
| `docs/worklog/execution-timeline.md` | 叙事 | 本文件 |
| `docs/design/features/execution-timeline.md` | 定型 | 执行记录总查询页规格 |
| `docs/design/ui-foundation.md` / `ui-style-guide.md` | 定型 | 任务选择器抽象（清单 + 使用规范） |
| `docs/design/features.md` | 定型 | 索引加一行 |
| `docs/PROGRESS.md` | 现场 | 新增在办事项 + 未决项 |

**下一步（待用户确认方案后）**：按规格落码 —— 时间轴视图组件 + 游标分页 + TaskPicker，跑 typecheck / build / smoke 后再请真机验收。

---

## 六、落码记录（2026-10-04）

**新建**：

| 文件 | 内容 |
|---|---|
| `src/client/records-timeline.tsx` | 时间轴视图：过滤行（TimeRange / 工作区 / 状态 / TaskPicker）+ 天分组 + 4px 色条块 + 游标「加载更多」+ 空态 / 错误重试 / 上限提示 |
| `src/client/ui/TaskPicker.tsx` | 带搜索的任务选择器（搜索框 + 最近 10 条 +「更多」；`scope` 受控；已选项掉出作用域显式提示） |

**改动**：`src/client/index.ts`（`records` 分支换成新视图 + 删旧测试屏与死代码）、`src/client/query.ts`（`InstanceRow` 加 `logical_date`）、`src/client/locales.ts`（+17 键 / −15 个旧屏专用键）、`src/client/ui/Field.tsx`（`Input` 加 `inputRef`）、`src/client/ui/index.ts`（导出 TaskPicker）、`scripts/smoke.mjs`（+6 项断言，含反向断言）。

### 6.1 关键实现决定

1. **`records` 分支提到 `data === undefined` 门槛之前**：新页走 HTTP，若留在门槛之后，调试快照缺失 / 解析失败会把新页一起挡掉（这是审查里发现的隐患，已按此实现）。
2. **旧分支整段删除**（原生 select + 原生表格 + 就地展开 events）；随之删掉 `statusFilter` / `taskFilter` / `expanded` / `titleOfTask` / 派生 `instances` / `basenameOf` / `Fragment` import，以及客户端调试快照类型里的 `instances` / `events` 声明（**宿主协议未动**，只是客户端不再消费）。
3. **任务候选来源改用 `overview.rows`（HTTP）**，不用调试快照的 `data.tasks` —— 任务目录本就有独立 HTTP 真源，不该跟着快照可达性起伏；文案与编辑器同一套 `[编号] 名称`。
4. **天分组优先用服务端 `logical_date`**（`SELECT *` 已带回），旧行退回 `scheduled_at.slice(0,10)`；跨页追加时同一天并入已有天块（不另起同名天标签）。
5. **天标签文案走 `Intl.DateTimeFormat(t('localeTag'))`** ⇒ 中文「2026年4月30日」/ 英文「April 30, 2026」，不写死语言。
6. **官方 `Menu` 的 `children` 用法已读源码核实**（宿主 0.2.0-rc.2 `lib/index.js:3927` 起）：children 渲染进 MenuSurface 的 viewport；键盘只处理 Escape / Tab / 方向键，**字母键不拦** ⇒ 搜索框能正常打字；`autoFocus` 会抢焦点到列表第一个按钮 ⇒ **不用它**，打开后自己 `inputRef.focus()`。
7. **在途去重用 ref**（`inFlightRef`）+ **请求序号作废旧响应**（`seqRef`）；过滤条件变化即 `seqRef++` 并重置列表，避免慢响应盖掉新结果。
8. **失败不清空已有列表**（只给错误态 + 重试），符合「不猜兜底、不抹掉用户已看到的数据」。

### 6.2 踩坑

| 坑 | 现象 | 处置 |
|---|---|---|
| 并发写同一工作区 | 另一路 agent 同时改 `src/client/index.ts`，并一次覆写把刚建好的 `ui/TaskPicker.tsx` 与 `ui/index.ts` 导出**整个抹掉**；我按**行号**删旧 records 分支时行号已被它改过 ⇒ 删错位置、文件括号失衡（`TS1005 ',' expected` 报在函数收尾） | 改为：① 文件被覆写后**重建**（TaskPicker / 导出 / locales / query / Field 全部重做）；② 删除**不再按行号**，改用「括号配平定位」脚本（算到基线深度的那一行才是分支结尾）；③ 每次编辑后立刻 typecheck |
| 冒烟断言跟着旧键走 | 旧断言要求 bundle 含 `basenameOf`（旧屏专用），删掉后必失败 | 改成「`parseOutputs` 在 + `basenameOf` 不在」，并补 6 项新断言（时间轴 / 游标分页 / 天分组 / 色条 token / TaskPicker / 旧屏已摘除） |
| 四色 token 断言写法 | 首次写成 `"\'var(--tdt-success)\'"`（带引号）⇒ 产物里是双引号，断言失败 | 改成不含引号的子串匹配 |

### 6.3 验证

`npm run typecheck` 绿 → `npm run build`（`dist/` 入库）→ `npm run smoke` **530 项通过 / 0 失败**。

---

## 七、专家组评审与自主修复（2026-10-04，用户要求「改完请专家组评审，问题自己决策修掉」）

三路只读评审（功能与数据正确性 / 抽象与规则合规 / 硬伤与边界），逐条核实后修复：

### 7.1 真硬伤（必修，已修）

| # | 问题（评审原话要点） | 根因 | 修法 |
|---|---|---|---|
| 1 | **满 2000 条后改任一过滤条件 ⇒ 白屏且不自恢复**（用户照提示操作即踩） | `load` 里有一条读**旧闭包** `rows.length` 的上限守卫 `nextCursor === null && rows.length >= HARD_LIMIT` ⇒ 重置后的首屏请求被自己的上限挡掉，既不取数也不置 loading/loaded | 上限**只拦续拉**（挪到 `loadMore`，用 `rowsCountRef` 读最新条数）；`load` 里彻底删掉该守卫 ⇒ 首屏永远允许取 |
| 2 | **续拉失败无提示、无重试，且会形成自动重试风暴** | 错误 UI 只在 `rows.length === 0` 分支渲染；失败后 `cursor/done` 不变 ⇒ 观察者每次重建都对同一 cursor 重发 | 底部加独立错误态（红字 + `recordsRetry` 按钮）；`loadMore` 里 `error !== null` 即**暂停自动续拉**，等用户点重试 |
| 3 | `IntersectionObserver` **每页重建 3~4 次**，且「新建即投递一次 entry」⇒ 小结果集连续自动拉多页 | `loadMore` 的 `useCallback` 依赖含分页状态 ⇒ 每次状态变更换引用 ⇒ effect 重建 IO | IO **只建一次**（callback ref + `loadMoreRef` 存最新逻辑），依赖 `[]`；去掉 `rootMargin`（规格：不做预取） |
| 4 | **按「无任务的工作区」过滤会返回全表**（工作区筛选静默失效） | 服务端 `workspaceTaskIdsOf` 无命中返回 `[]`，store 把「空数组」当「不过滤」 | 服务端：命中 0 个任务时用恒假条件收口（`['__none__']`）；**instances 与 logs 两条路由同修** |
| 5 | **工作区 + 任务同时给时以 taskId 为准** ⇒ 「工作区筛了 B、结果却是 A 的记录」 | 路由里 `taskId === undefined && workspace !== undefined` 才算工作区 | 服务端改**两者叠加（AND）**；客户端再补一道：改工作区时若已选任务不在新作用域 ⇒ **主动清空**（筛选语义，与 TaskPicker「掉出作用域显式提示」不冲突） |
| 6 | **天分组 key 与排序 key 不同源** ⇒ 多时区任务混排出现同名天标签 / React 重复 key | 分组用服务端 `logical_date`（**任务时区**日），排序与时间范围用 `scheduled_at`（绝对时刻 / 本地日） | 分组改**本地日历日**（`dayKeyOf` 从 `scheduled_at` 推）⇒ 与排序、过滤、块内 `HH:mm` 全部同源；`InstanceRow` 不再声明 `logical_date`；天块 key 加序号 |
| 7 | **空态文案恒为「当前过滤条件下没有」**（「该时间范围内没有」不可达） | `hasFilter` 把默认时间档也算作「有过滤」 | 改为「用户是否真动过过滤器」（时间档是否偏离默认档 / 工作区 / 状态 / 任务），两档文案各归其位 |
| 8 | **续拉失败的错误态被吞**（与 #2 同源，独立记一条以便追溯） | 同上 | 同上 |

### 7.2 抽象与规则（已修）

| # | 问题 | 修法 |
|---|---|---|
| 9 | `TaskPicker` 锚点样式 / 标签样式 / size→高度翻译**各抄一份**（`SelectField` 同款逻辑出现第三份）⇒ 观感必然漂移（TaskPicker 少了 hover 泛底与 lineHeight） | `Field.tsx` 导出 `FIELD_ANCHOR_STYLE` / `FIELD_LABEL_STYLE` / `fieldMetricsOf(size)`，`SelectField` 与 `TaskPicker` **共用同一份**；TaskPicker 补 hover 泛底 |
| 10 | TaskPicker 内层搜索框写死 `size:'md'`，`size="lg"` 时锚点 32 / 搜索框 28 | 传 `size`（档位只有一个翻译点） |
| 11 | **状态桶两套定义且语义不同**（卡片面板 `running` 含 pending/unknown，时间轴只含 dispatched/running）⇒ 同一档位两页筛出不同结果 | 桶上提 `status-text.ts`（`INSTANCE_STATUS_BUCKETS` / `statusesOfBucket`），时间轴与卡片面板共用；`StatusIcon` 改走 `statusToneOf` |
| 12 | 状态→色调语义散落（在跑判定出现 3 份） | 新增 `statusToneOf()` / `isRunningStatus()`，表现层只做「色调 → 自己的画法」（色条 / 图标） |
| 13 | 内容列锚点 **id + 几何两份**（两 tab 各写一遍；`Loading` 的 `anchorId` 契约依赖它） | 上提 `PANEL_CONTENT_ID` / `PANEL_CONTENT_STYLE`（`ui/index.ts` 导出）⇒ 两个 tab 共用，`Loading` 锚点天然对齐 |
| 14 | 手搓 `<button>`（错误重试） | 改基础层 `Button` |
| 15 | 首屏加载只有一行文字，没复用基础层 `Loading` | 复用 `Loading`（右下角浮动指示）—— 规格原文「居中」按基础层唯一实现回改 |
| 16 | 新增两份「省略号三件套」 | 落 `.dsh-tdt-ellipsis`（`ui/controls-css.ts`）并改用；待抽象 #1 同步更新为「收敛点已建，新点必须用它」 |
| 17 | 裸 `z-index` / 间距 / 动效时长字面量 | 加 `--tdt-z-sticky`（内容层吸附档）并改用；间距全走 `--tdt-space-*`；动效走 `--tdt-dur*` / `--tdt-ease` |
| 18 | `Intl` 不可用时硬编码中文日期 | 兜底返回 key 原串（`2026-04-30`），不硬编码任何语言 |
| 19 | 文案插值用 `.replace('{n}', …)` 绕过单源 | 改走 `interpolateTranslate` 的 `tt(key, { n })` |
| 20 | `recordsLoadMore` 成死键（无消费点） | 底部补「加载更多」按钮（同时是 IO 不可用的兜底），键被真实消费 |
| 21 | `debugTasks` / `debugInstances` / `debugEvents` 三个孤儿文案键（旧屏删除后的遗漏） | 三处（`LocaleKey` + zh + en）一并删除 |
| 22 | TP.名字用了两份内联省略号；`.dsh-tdt-rec-title` 死 CSS | 名字走 `.dsh-tdt-ellipsis`；标题类实际挂到 `MarqueeText` 的 `className` |
| 23 | 行没 `memo` ⇒ 每次续拉把已挂的 1950 块全部重渲染 | 抽出 `RecordBlock`（`memo`）+ `titleById` / `openSession` 稳定引用 |

### 7.3 冒烟断言重写（评审：原 6 条基本是「产物里有没有这个词」，两条早被本功能之外的代码满足 = 零覆盖）

改成**读源码钉行为**：页大小/上限（含整除自检）、`setCursor(page.nextCursor)`、**上限只拦续拉**（正反两组）、失败暂停 + 重试、IO 只建一次、分组键同源（含反断言 `!row.logical_date`）、吸顶走 `--tdt-z-sticky`、色条走 `statusToneOf`（且源码内无状态图标）、records 分支先于 `data === undefined`、无轮询、复用基础层六件、状态桶单源（两个业务文件都引 `statusesOfBucket`）、旧测试屏文案键不再进包。共 **539 项 / 0 失败**。

### 7.4 文档回写

`ui-foundation`（§5.4 接口、§5.2 TaskPicker 行、§4.3 层级档位、§六 域清单）、`ui-style-guide`（§二 TaskPicker 行标落码、§三 待抽象 #1 与 #9、已知例外补两条）、`design/features/execution-timeline.md`（§4.1 分组口径、§4.2 次信息、§七 分页/失败、§九 空态、§十一 参数）、`design/external/dsh-capabilities.md`（**新回写**：`Menu` 的 `children` 渲染位置 / 键盘只处理 Escape·Tab·方向键 / `autoFocus` 抢焦点 / 点外关闭判定 / `footer` 类型，适用版本 0.2.0-rc.2）。

### 7.5 已知未修（记入未决项，不在本包）

- `TaskPicker` 浮层内**方向键 / Tab 的实机手感**（源码级已核实字母键不拦，键位游走行为需真机确认）。
- 2000 块 × `MarqueeText`（每实例一个 `ResizeObserver`）的实机流畅度；真机若卡再考虑虚拟滚动。
- 天标签吸附会盖住当天首行约 34px 高度内的点击（当前实现如此，真机看是否影响操作）。
