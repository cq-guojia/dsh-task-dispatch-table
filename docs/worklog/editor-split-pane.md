# 工作包：新增 / 编辑弹窗改「布局分栏」（删执行记录 tab + 启用开关回右）

> **状态**：🔵 **进行中**（2026-10-01 立项 + 现状核实，落码未开始）
> **来源**：用户 2026-10-01 口述需求（两处改动，见 §一）
> **配套**：需求口径 [`design/features/creation-edit.md`](../design/features/creation-edit.md) · 分栏形态参照 [`design/features/artifact-opening.md`](../design/features/artifact-opening.md) §四-C（页面级唯一 dock）· 样式手册 [`design/ui-style-guide.md`](../design/ui-style-guide.md) · 代码真源 `src/client/task-editor.tsx` / `task-editor-css.ts` / `index.ts`

---

## 一、需求原话（用户，逐字保留）

> 我们要把现在新增、编辑任务的弹窗，从右边浮出来。
>
> 第一把，新增和修改任务的弹窗右上角有一个切换，那个切换是。这个界面是编辑界面，明白吗？具体修改如下：
> 1. 「基本信息和执行记录」：把「切换」删掉，这个页面里就不给他展示「执行记录」了。
> 2. 左上角的开关（开启和关闭）：把它放回右边，放在「关闭」的小叉叉按钮左边。
>
> 这是第一个改动。
>
> 第二个改动：把右边浮出来的弹窗改成完整的分栏（跟文件预览的分栏一样）。
> 1. 宽度要求：保持现在的弹窗宽度作为最小宽度。
> 2. 修改原因：
>    (a) 之前不做分栏，是担心会和文件预览的分栏重合，导致从这个窗口点开文件预览就没法看了。但现在考虑，这个页面是编辑状态，不会去打开文件预览的分栏，所以不会重合。
>    (b) 目前在主窗口旁边点「编辑」或「新建」，弹窗会把主窗口盖住，特别不方便。

**拆成两条待办**：① 去掉「基本信息 / 执行记录」切换（编辑态不再展示执行记录）＋ 启用开关从头部左侧挪回右侧、紧贴关闭 ✕ 左边；② 抽屉由「浮层」改为「占布局的分栏」，最小宽度 = 现弹窗宽度。

---

## 二、现状核实（每条带出处，源码为准）

### 2.1 抽屉外壳：现在是浮层（不是分栏）

| 事实 | 出处 |
|---|---|
| 遮罩层 `.dsh-tdt-ed-overlay` = `position:fixed;inset:0;z-index:1040;...;background:var(--tdt-mask,...)`，**把主窗口整页压暗、从右侧挤出面板** | `src/client/task-editor-css.ts:16` |
| 面板 `.dsh-tdt-ed-panel` = `position:relative;height:100%`，右贴边、**浮在页面上不推压任何东西** | `src/client/task-editor-css.ts:18` |
| 渲染结构 = 遮罩 div（含点遮罩关闭 `requestClose`）→ panel（`width:${width}px`、role=dialog、**aria-modal=true**）→ 左缘拖拽条 + 内容 | `src/client/task-editor.tsx:2212-2225` |
| 关闭路径三条：✕ 钮 / Esc / 点遮罩空白；改过内容时都先过 `ConfirmDiscard` 确认 | `src/client/task-editor.tsx:2082-2088`、`:1419-1426`、`:2287-2293` |

### 2.2 宽度与拖拽（现状即「最小宽度」的基准）

| 事实 | 出处 |
|---|---|
| `WIDTH_DEFAULT = 560`、`WIDTH_MIN = 560`，上限 `视口 × 0.9` ⇒ **560 就是今天弹窗的实际宽度**，用户说「保持现在的弹窗宽度作为最小宽度」= 下限维持 560 | `src/client/task-editor.tsx:927-934` |
| 宽度持久化 localStorage `dsh-tdt-editor-width` | `src/client/task-editor.tsx:927`、`:1438` |
| 左缘 6px 拖拽条，拖动改 state、松手落盘；拖拽条皮肤与预览 dock 同源（hover 才浮出浅色带） | `src/client/task-editor.tsx:1429-1442`、`:2219-2223`；`task-editor-css.ts:20-21` |

### 2.3 待删的「基本信息 / 执行记录」切换

| 事实 | 出处 |
|---|---|
| `tab` state = `'basic' | 'records'`，新建态也建（无意义） | `src/client/task-editor.tsx:1284` |
| 头部 `Segmented`（id = `dsh-tdt-ed-tabs`）**仅编辑态渲染**，两项 = `editorTabBasic` / `editorTabRecords` | `src/client/task-editor.tsx:2068-2081` |
| tab = `records` 时正文只有一句占位 `editorRecordsPending`（「执行记录待接（P2）」）⇒ **删掉不丢真实数据** | `src/client/task-editor.tsx:1980-1981` |
| 文案三键 × 双语：`editorTabBasic` / `editorTabRecords` / `editorRecordsPending` | `src/client/locales.ts:94`、`:451-453`（zh）、`:1003-1005`（en） |
| ⚠ 冒烟有**正向断言**要求 id 在产物里：`includes('dsh-tdt-ed-tabs')` ⇒ 删 tab 必须同步改断言 | `scripts/smoke.mjs:1645-1646` |

### 2.4 启用开关的位置沿革（这次是「挪回去」）

| 时间 | 位置 | 出处 |
|---|---|---|
| 2026-09-29 | 不再单占一行 ⇒ 移到**头部右侧**、关闭钮左边 | `task-editor.tsx:5` 头注 |
| 2026-09-30 | 又移到**标题左边**（今天的样子：`.dsh-tdt-ed-headleft` 内 = 开关 + 说明文字 + 标题） | `task-editor.tsx:2042-2056`；`task-editor-css.ts:24-29` |
| 2026-10-01（本次） | 用户要求放回右边、紧贴关闭 ✕ 左边 ⇒ **回到 09-29 的位置** | 本文件 §一 |

- 开关本身 = 官方 `Switch` + 包装类 `.dsh-tdt-switch`（成功绿，两处共用同一份皮肤）；旁边一行状态文字 `editorEnabledStateOn/Off` | `task-editor.tsx:2045-2054`；`ui/controls-css.ts` `.dsh-tdt-switch`
- 点击行为不变（用户 2026-09-30 拍板）：**独立写回**，编辑态即写库 + Toast，成功同步脏判定基线；写回失败开关回弹 | `task-editor.tsx:1321-1335`
- 引用关键点：写回 Toast（`FloatingToast below`）挂在 **headactions 容器**里（`:2059-2067`）；开关挪过去后两者同处右侧，注意 Toast 定位别被开关/关闭钮压住。

### 2.5 分栏要参照的现成样板（U11 预览 dock）

| 事实 | 出处 |
|---|---|
| 根容器 `#dsh-tdt-root` = 横向 flex，内容列 `flex:1 1 auto; min-width:0`，dock 是**布局成员**而非浮层 ⇒ 整页被真正挤窄、滚动条留在内容区不被压住 | `src/client/index.ts:912-921`、`:922` |
| 预览 dock 皮肤：`position:sticky;top:0;align-self:stretch;height:100vh;z-index:1030;width:var(--dsh-tdt-preview-w);flex:0 0 auto` | `src/client/archive-session-css.ts:24` |
| 宽度走 CSS 变量 `--dsh-tdt-preview-w`（关闭时 0px），拖拽期间只改变量、松手落 state | `src/client/index.ts:916`、`:506-523` |
| 全屏会话弹窗靠 `right: var(--dsh-tdt-preview-w,0px)` **给 dock 让位** | `src/client/archive-session-css.ts:19` |
| 编辑器抽屉与预览 dock、会话弹窗**已经是同级兄弟**（都在根 flex 下）⇒ 改成布局成员无需搬挂载点 | `src/client/index.ts:1254`（内容列闭合）、`:1313-1334`（抽屉）、`:1337-1356`（预览 dock） |

---

## 三、改动一：删切换 + 开关挪位

1. 删 `tab` state（`task-editor.tsx:1284`）、删 `records` 分支正文（`:1980-1981`）、删头部 `Segmented`（`:2068-2081`）⇒ 编辑/新建正文恒为表单。
2. 删文案三键 × zh/en（`locales.ts:94`、`:451-453`、`:1003-1005`）；同步改冒烟断言（`scripts/smoke.mjs:1645-1646`，把 `dsh-tdt-ed-tabs` 从正向断言里移除，改断言「产物里已无 ed-tabs」）。
3. 启用开关整组（`.dsh-tdt-ed-enable` + 状态文字）从 `.dsh-tdt-ed-headleft` 移入 `.dsh-tdt-ed-headactions`，**排在关闭 ✕ 之前（左邻）**；标题行左侧只留标题。
   - 位置沿革补进 `task-editor.tsx` 头注，避免以后再被来回搬。
   - 注意：`headactions` 里的 `enabledToast` 是绝对定位浮层（`below: true`），挪位后确认它不被右侧控件压住。
4. CSS：`.dsh-tdt-ed-headleft` 只吃标题后不需要变；若右块变长，检查标题过长时的收缩/省略（`min-width:0` 已有）。

---

## 四、改动二：抽屉 → 占布局的分栏

目标形态 = §2.5 预览 dock 同款：**dock 是根 flex 成员，页面被推窄而非被盖住**。

1. **撤遮罩**：`.dsh-tdt-ed-overlay` 整层取消（不再压暗主窗口）⇒ 连带取消「点遮罩关闭」（关闭路径剩 ✕ / Esc / 取消钮，仍走脏判定确认）。
   - `ConfirmDiscard` 原依赖遮罩做定位容器 ⇒ 改挂到 panel（panel 已是 `position:relative`），或在 panel 外层套一个只负责定位的 wrapper。
2. **面板变布局成员**：`position:sticky; top:0; align-self:stretch; height:100vh; flex:0 0 auto; z-index:1040`，保留 `border-left` + `box-shadow`；宽度仍走内层 state（`width:${width}px`）。
3. **无障碍语义**：改非模态（`aria-modal` 摘掉 / `aria-label` 保留）——主窗口此时仍可见可点，不该声称模态。
4. **宽度**：`WIDTH_MIN/WIDTH_DEFAULT 560` 不动（用户口径 = 现宽度当下限）；上限维持「视口 90%」还是给主界面留最小宽度 ⇒ 见 §五 Q3。
5. **拖拽条**：保留左缘 6px + `startResize`（`:1429-1442`），注释同步改成「分栏宽」语义。
6. **会话弹窗让位**：`.dsh-tdt-sv-overlay` 的 `right` 需并入编辑器宽度（`calc(var(--dsh-tdt-preview-w,0px) + var(--dsh-tdt-editor-w,0px))`），否则「主面板 → 查看会话」弹窗会盖住编辑分栏（改动二后主窗口仍可点，这条路径才存在）⇒ 见 §五 Q4。
7. **Esc 处理**：现为 window 级监听 ⇒ 保留（不再有遮罩可拦）。
8. 内嵌两面板（全屏提示词编辑器 `PromptEditorModal` / 配置预览 `ConfigPreviewPanel`）**不动**：它们是抽屉内二选一换挂载，不参与外部分栏（`:2021-2040`）。

---

## 五、待拍板（已登记进 [`PROGRESS.md`](../PROGRESS.md) 未决项）

| # | 问题 | 为什么现在要定 |
|---|---|---|
| Q1 | 编辑分栏与**预览 dock 同开**怎么办：并排（页面被夹中间）/ 开编辑时收起预览 / 编辑态禁开预览 | 用户给的理由是「编辑态不会去开文件预览」（§一 2a）；但改成分栏后**主窗口仍可点**，理论上仍能从主面板记录行点开预览 |
| Q2 | 是否保留**遮罩**（当前倾向：不保留） | 分栏的诉求是「别盖住主窗口」；留遮罩会压暗主窗口，与诉求冲突，但会少一条「点空白处关闭」的路径 |
| Q3 | 编辑分栏**宽度上限**是否要给主面板留最小宽度（主界面卡片列 `min-width:760px`，`index.ts:926`） | 560 分栏 + 760 主列 在小屏（<1320px）会挤出横向滚动条；是否改按可用宽度夹上限 |
| Q4 | 会话弹窗（查看会话）是否也让位编辑分栏 | 见 §四.6 |

---

## 五-B、落码记录（2026-10-01）

**改动一（删切换 + 开关挪位）**

- `task-editor.tsx`：`tab` state 删净；正文分支去掉（`records` 只有占位文案那一路）；头部 `Segmented`（`dsh-tdt-ed-tabs`）整块删除；启用开关整组（`Switch` + 状态文字）从 `.dsh-tdt-ed-headleft` 移进 `.dsh-tdt-ed-headactions`，排在关闭 `IconButton` **之前**；头注补「09-29 右侧 → 09-30 左 → 10-01 回右侧」的位置沿革，防止再被来回搬。
- `locales.ts`：删 `editorTabBasic` / `editorTabRecords` / `editorRecordsPending`（类型 union + zh + en 三处）。
- `smoke.mjs:1645-1646`：正向断言改成只看「编辑预览 / 排期」两处 id。

**改动二（浮层 → 占布局的分栏）**

- `task-editor-css.ts`：删 `.dsh-tdt-ed-overlay`；`.dsh-tdt-ed-panel` 换成 dock 皮肤（`position:sticky;top:0;align-self:stretch;height:100vh;flex:0 0 auto;z-index:1040;width:var(--dsh-tdt-editor-w,560px)`），与 `archive-session-css.ts` 的预览 dock 逐条同款。
- `task-editor.tsx`：根节点 `Fragment`（panel + picker portal），不再渲染遮罩 div ⇒ **取消点遮罩关闭**；`role=dialog` 保留但 **摘掉 `aria-modal`**（主窗口此时仍可点，声称模态不成立）；`ConfirmDiscard` 从遮罩改挂 panel 本体（面板 `position:relative`，覆盖整条分栏）；拖拽期间只改根容器的 `--dsh-tdt-editor-w`（不重渲染整页），松手回调父级。
- 宽度真源**上提**到 `TaskPage`（`index.ts`）：`editorWidth` state + `changeEditorWidth`，组件改为受控（`width` / `onWidthChange` / `reserved`）；`task-editor.tsx` 只留这三个纯函数并导出（`readEditorWidth` / `clampEditorWidth` / `writeEditorWidth`）。
- Q3「保主面板最小宽 760」：`clampEditorWidth(value, reserved)` 上限 = `视口 − 760 − 另一条分栏宽`；`clampPreviewWidth(value, reserved)` 对称接入；两条分栏同开/关、视口 resize 都触发一次重新夹取（`useEffect`）。
- Q4 会话弹窗让位：`archive-session-css.ts` 的 `.dsh-tdt-sv-overlay` `right` 改成 `calc(var(--dsh-tdt-preview-w,0px) + var(--dsh-tdt-editor-w,0px))`。

**踩坑**

1. CSS 注释里手滑写了反引号 —— 这两份样式是 **JS 模板字符串**，注释里的 `` ` `` 会提前闭合字符串，症状是 `task-editor-css.ts:16` 一串 `TS1005`（看起来像 CSS 语法错，其实是字符串被截断）。写样式注释别带反引号。
2. `ConfirmDiscard` 原本靠全屏遮罩当定位容器；遮罩一撤，它就漂到最近的定位祖先（页面根）⇒ 必须改挂 panel。

### 定型去向

- 形态与四条 Q 的口径 ⇒ [`design/features/creation-edit.md`](../design/features/creation-edit.md) §七-B（新增）。
- 两条 dock 并存规则 ⇒ [`design/features/artifact-opening.md`](../design/features/artifact-opening.md) §四-C（补一行）。
- 功能索引里的形态描述 ⇒ [`design/features.md`](../design/features.md) 更新。

---

## 五-C、第二轮微调（2026-10-02，用户首轮验收后）

1. **窄一点**：`EDITOR_WIDTH_MIN` / `EDITOR_WIDTH_DEFAULT` 560 → **500**（CSS 兜底值同步）→ 同日复看后又定 **530**（用户：560 偏宽、500 看过再收 530）。旧口径「= 浮层时代弹窗宽度」退成历史由头。
1-B. **英文提示词精简**（同日）：附加文件投放区两行英文各砍一截（`locales.ts` 的 `editorDropZoneHint` / `editorDropZoneFormats`，只动 en，zh 不变）——原「Click or drop files here to upload — multiple or single files supported」/「Common text/code, image and document formats are supported, up to 20MB each」；现「Click or drop files to upload — single or multiple」/「Text/code, image and document formats, up to 20MB each」，信息量不变（可点击 / 可拖入、单个或多个、格式、单文件 20MB 上限）。
2. **提示词下三下拉改定宽**（用户：「还挺跳……把它固定住宽」）
   - 原逻辑：`工作区` / `模型` 传 `maxWidth: 200` 让它们**按内容自适应**（只有超长才封顶），`权限` 才是定宽 120 ⇒ 换一个选项宽度就变一下，三个都长才开始互相挤 —— 观感一直在跳。
   - 现在：以权限为基准 **120**，工作区 / 模型 = **1.5 倍 = 180**，全部 `width` 定宽（`PROMPT_SELECT_BASE` / `PROMPT_SELECT_WIDE` 两个常量）；显示不下就省略号，工作区保留 hover 跑马灯；位置不够时整体等比收缩（CSS 收缩与选项长短无关，不会把跳动带回来）。
   - 口径写进 [`ui-style-guide.md`](../design/ui-style-guide.md) §五「同排下拉定宽」。
3. **拖拽不再顺手选中文字**（用户：「经常会发现有些文字被我给选中了」）
   - 根因：`pointerdown` 的默认动作会开一次**文本选区**，指针随后扫过主窗口的文字 ⇒ 选区跟着扩，看着像在拖选。这是**真实的浏览器选区**，不是视觉错觉。
   - 修法两道闸（两条 dock 的 `startResize` 都一样）：① `pointerdown` 里 `preventDefault()` 掐掉默认动作（连带后面的兼容 `mousedown`）；② 拖动期间把 `document.body.style.userSelect = 'none'`，`window pointerup` 时恢复原值，并 `window.getSelection()?.removeAllRanges()` 清掉遗留选区。拖拽条自身再补 `user-select:none`。
   - 能解决：两道闸都是标准行为，第二道（`user-select:none`）在浏览器行为有差异时也兜得住。

## 六、做完后怎么验收

1. `npm run build`（含 dist 入库）+ `npm run typecheck` + `npm run smoke`（改 tab 断言，见 §三.2）。
2. 真机清单：
   - 新建 / 编辑两态：头部右侧 = 启用开关 → ✕（顺序正确、无 tab）；开关点击行为与 Toast 位置正常；
   - 打开编辑后**主窗口完整可见、不被盖住**（不压暗），宽度可拖、最小 560，重开记住宽度；
   - Esc / ✕ / 取消三条关闭路径 + 脏判定确认都在（点空白不再是关闭路径）；
   - 明暗双主题走一遍边框 / 阴影 / 背景。
