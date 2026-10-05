# UI 开发手册（写插件界面时照这个做）

> **状态**：✅ **生效**（2026-10-01 UI 基础层收口：三档高度 / 圆角 / 字号已归一，见 §五）
> **这一份是**：「以后每次都照这个做」的操作手册。**技术方案与规格**看 [`ui-foundation.md`](ui-foundation.md)。
> **一句话**：**新界面只许用 `src/client/ui/` 的组件与 `--tdt-*` token；不许自己写颜色、尺寸、圆角、字号。**

---

## 一、动手前先做三个判断（决策树）

```
我要加的东西是什么？
├─ 已经存在的控件（按钮 / 分段 / 输入 / 下拉 / 开关 / 日期时间 / 卡 / 浮层 / Toast）
│    └─ ✅ 直接用 ui/index.ts 导出的组件；先读它的 props（size / variant），
│       你需要的外观差异，先问「是不是已有 variant 能满足」——不够用也**不许就地改样式**，
│       走 §五 流程（改基础层，一处改、全站生效）。
├─ 宿主官方有、我们还没有的控件
│    └─ ✅ 在 ui/ 里包一层（包装 + 集中在 official-skins.ts 覆盖），再拿出去用；
│       **不要在使用点直接 import 官方件**（官方件的覆写会散成 N 份）。
└─ 全新的东西（宿主没有、ui/ 里也没有）
     └─ ✅ 在 ui/ 里新建它的唯一实现（自绘），token 只能引用 --tdt-*；
        使用点只 import ui/index.ts 的导出。
```

---

## 二、唯一实现表（同一个控件只准有一个实现）

| 控件 | 唯一位置 | 怎么用（示例） | 状态（2026-10-01 收口） |
|---|---|---|---|
| 分段控件（滑动块） | `ui/Segmented.tsx` | `h(Segmented<'a' \| 'b'>, { value: v, size: 'md', variant: 'inset', items: [{ value: 'a', label: '甲', badge: 3 }], onChange: setV })` | ✅ 全站唯一（主面板 / 列表筛选 / 卡片三面板 / 编辑器官方覆写 ×3 / 星期多选 / 版本开关 / 预览两态） |
| 按钮 / 图标钮 | `ui/Button.tsx`（`Button` / `IconButton`） | `h(Button, { variant: 'outline', size: 'md' }, '重置')` | ✅ 全站唯一。**⚠️ 圆角审计（r12，2026-10-05）**：官方 `Button`（宿主 primitives）与基础层 `Button` **并存两套、圆角天生不一致**——基础层走 `--tdt-radius-md`(12px)，官方的圆角由宿主注入 CSS 决定、插件侧不可控；同排并放一眼就能看出（右侧栏底栏即为实例，r12 已统一改基础层）。**新代码一律用基础层**；存量官方 Button 混用点（卡片按钮 / 记录页「查看会话」/ 弹窗关闭钮等）登记待逐步收编。按钮类元素**不许自写 border-radius**——要特殊观感走 §五 流程改基础层或加修饰类 |
| 输入框 / 前缀框 / 数字框 | `ui/Field.tsx`（`Input` / `PrefixedInput` / `NumberInput`） | `h(Input, { value: v, onChange, size: 'lg', error: bad })` | ✅ 全站唯一（原生 `<input type=number>` 已清零） |
| 下拉 | `ui/Field.tsx`（`SelectField`，包装官方 `Menu`） | `h(SelectField, { options, value: v, onChange, maxWidth: 200 })` | ✅ **全站唯一**（2026-10-04：任务列表顶部那个绕过基础层手搓的官方 `Menu` + 自绘锚点已收编，它是最后一处；过程 [`worklog/workspace-options-unification.md`](../../worklog/workspace-options-unification.md)）。⚠️ 例外仅剩**执行记录 tab 的两个原生 `<select>`**（最简测试界面，将随执行记录总查询页整体重写，见 [`features/execution-timeline.md`](features/execution-timeline.md)）。⚠️ **同一排多个下拉一律定宽**：窄的热点会让宽度随选项文字变化、换选项就跳；写法见 §五「同排下拉定宽」 |
| **任务选择器（带搜索）** | `ui/TaskPicker.tsx`（规格 [`ui-foundation.md`](ui-foundation.md) §5.4） | `h(TaskPicker, { options: tasks, value, onChange, scope: workspace, recentLimit: 10, placeholder, emptyLabel, ariaLabel, searchPlaceholder })` | ✅ **2026-10-04 落码**（执行记录总查询页在用）。**候选多（几十上百）或需要按名字 / id 搜索的任务选择一律用它，不许用 `SelectField`，更不许原生 `<select>`**；也不许在使用点手搓 Input + Menu。⚠️ `scope` 是**受控入参**，外部改工作区 ⇒ 候选实时重算 |
| **产出物图标 chip** | `ui/controls-css.ts` 的 `.dsh-tdt-chip`（规格 [`ui-foundation.md`](ui-foundation.md) §5.5） | `h('button', { className: 'dsh-tdt-chip', title: path, disabled: !canOpen, onClick }, h(FileTypeIcon, { path, size: 16 }))` | ✅ **全站唯一实现**（2026-10-04 收编：卡片「执行记录」面板 + 执行记录总查询页共用）。⚠️ **底板平时透明、`:hover` 才浮出**（2026-10-04 用户要求「鼠标移上去才有」）；**底色必须走 class**（inline `background` 会盖掉 `:hover`）；文字型（`…` / `+N`）加 `dsh-tdt-chip--label`；不可点用 `disabled` 而不是灰字糊弄 |
| **行式文件按钮** | `ui/controls-css.ts` 的 `.dsh-tdt-filechip`（规格 [`ui-foundation.md`](ui-foundation.md) §5.6） | `h('button', { className: 'dsh-tdt-filechip dsh-tdt-filechip--block', title: path, disabled: !canOpen, onClick }, h(FileTypeIcon, { path, size: 14 }), h('span', { className: 'dsh-tdt-ellipsis' }, name))` | ✅ **全站唯一实现**（2026-10-04 收编：卡片基础信息产出物清单 / 附件区 / 执行记录页展开区三处共用）。⚠️ **一行一个文件**用 `--block`（撑满父宽），**跟着文字后头**用 `--inline`；平时透明、`:hover` 才出 `--tdt-chip-bg`；不可点用 `disabled` |
| **任务信息展示（标签—值纸表格 + 上次执行）** | `task-info.tsx` + `task-info-css.ts`（样式域 `domain:task-info`；规格与职责见 [`code-conventions.md`](code-conventions.md) §二） | `h(InfoField, { label, children })`；视图模型 `taskInfoViewFromDraft(draft, ctx)`（右侧栏查看档）/ `taskInfoViewFromRow(row, ctx)`（卡片展开区） | ✅ **2026-10-05 落码**（卡片展开区「基础信息」+ 右侧栏**查看档**共用同一份渲染与样式）。**两处必须共用**：不许在页面里另写字段行、不许另写一份「上次执行」渲染 |
| 开关 | 官方 `Switch` + 包装类 `.dsh-tdt-switch`（皮肤在 `ui/controls-css.ts`） | `h('span', { className: 'dsh-tdt-switch' }, h(Switch, { checked, onChange }))` | ✅ 全站共用一个包装类（选中 success 绿只此一处） |
| 日期 / 时间 | `ui/DateTime.tsx`（`DateField` / `TimeField`） | `h(DateField, { value: d, onChange, size: 'lg' })` | ✅ 全站唯一（自绘日历 + 时分列） |
| 时间范围筛选 | `ui/TimeRange.tsx`（预设 + 起止一体） | `h(TimeRange, { value, onChange, labels, calendarLabels, timeLabels, precision: 'minute', size: 'md' })` | ✅ 全站唯一（执行记录 / 日志 / 未来总查询页共用；`size` **必传**、`precision` 选 `day`/`minute`；边界归一在 `ui/time-range.ts` 半开区间） |
| Toast | `toast-css.ts`（`FloatingToast`） | `h(FloatingToast, { tone: 'error', … })` | ✅ 唯一；⚠️ `index.ts` 仍有一处手搓中性 Toast（见 §三「待抽象」） |
| 卡 / 浮层外壳 | 暂无（散在各业务 CSS：`task-editor-css` 的 `.dsh-tdt-ed-card` / `.dsh-tdt-ed-panel`、`archive-session-css` 的 `.dsh-tdt-sv-panel`） | — | ⏳ **未抽象**（同构 7 处，见 §三「待抽象」） |

> 表外的控件一旦被写第二遍，就是本手册要拦住的事。

---

## 三、允许 / 禁止（带正反例）

### ✅ 允许

```tsx
// 用 ui/ 的组件 + 只调 props
<TdtSegmented size="sm" variant="default" items={tabs} value={tab} onChange={setTab}/>

// 布局用内联没问题，但数值必须来自 token（间距一律 --tdt-space-*）
<div style={{ display:'flex', gap:'var(--tdt-space-2)', marginTop:'var(--tdt-space-3)' }}>
```

### ❌ 禁止（逐条给出当前违规位置，便于对照修）

| 禁止 | 现状（2026-10-01 收口后） |
|---|---|
| 在使用点写颜色 / 圆角 / 字号字面量 | ✅ 已清零（业务文件 `borderRadius:` / `fontSize:` 字面量 = 0；仅剩本节「已知例外」登记项） |
| 在使用点写死控件高度 | ✅ 已清零（一律走 `size` 档 sm/md/lg，不再写 26px 之类） |
| 直接引用宿主变量 | ✅ 已清零（`--dsw-*` 只允许出现在 `ui/tokens.ts`；冒烟反断言钉住） |
| 自己写 `body[data-ds-dark-theme]` | ✅ 已清零（明暗差异只在 token 层一处） |
| 再抄一份 `C` 常量表 | ✅ 已删净（3 份 `C` 表全清，冒烟钉住） |
| 同类小图标一大一小 / 自绘既有控件 | ✅ 已收口（2026-10-04）：**同类字段小图标统一 12px**（`--tdt-font-sm`），别再各写 14/16；展开箭头这类「全站都有的一枚控件」一律用基础层既有件（`IconButton`），不许页面自己画 `span` |
| 内容区挂 `cursor:pointer` / `onClick` | ✅ 已收口（2026-10-04，执行记录页）：**可点区域只放头部**（容器与展开区不挂点击、不给手指），否则展开出来的日志 / 备注没法拖选复制；带点击的头部还要加「有选中文字就不展开」的守卫 |
| 自己 `createElement('style')` 注入 | ✅ 已清零（统一走 `ui/style.ts` 的 `applyStyle`） |
| 覆写官方件的观感（在使用点） | ✅ 「Switch 变绿」已合并到 `ui/controls-css.ts` 一处（`.dsh-tdt-switch`） |
| 写死官方 CSS-module 类名 | 哈希会变；只能按元素 + role 选（`official-classes.ts`） |
| 硬编码 `#fff` / `rgba(…)` | 🟡 语义色**实面上的反白字**下游仍有几处直接写 `#fff`（见「待抽象」），应统一走 `--tdt-on-signal` |
| 混用**同义宿主变量** | 已裁决：`state-warn-primary` 真 / `state-warning-primary` 死；`focus-ring-color` 真但默认 `transparent` / `border-focus` 死 ⇒ 一律由 token 层定一个名，见 [`external/dsh-capabilities.md`](external/dsh-capabilities.md) §3 |
| 注释与代码不一致 | 🟡 仍偶有（改代码必须同步注释；2026-10-01 修掉一批指向已删类的旧注释） |
| **只给文件图标、不显示文件名** | ✅ 已收口（2026-10-05，用户点名的**硬性规定**）：全站任何显示文件的位置（附件 / 产出物），只要**没把文件名显示出来**，就必须挂**官方 `Tooltip`** 在悬停时显示**文件名（含后缀）**；已覆盖执行记录页头部 chiprow、展开区产出、任务列表产出格 |
| **自己新建 / 改造 `Loading`** | ❌ **禁止**（2026-10-05 用户点名的**硬性规定**，第十轮的教训）：**没有用户明确点名，就不许碰 Loading** —— 不许新增 `<Loading>` 实例、不许改它的**文案 / 样式 / 位置**。用户原话：「我原来的 loading 是怎么样就是怎么样，不要给我加任何字，也不要给我改任何样式，也不要给我改任何位置」「我没有说在其他地方加 loading，也没有说要去重载或者去改这个 loading」。⇒ 还在加载的区域**直接空着**（空容器或 `null`），**不写任何加载文案**。第十轮曾把 6 处内联加载文案换成新建的 `<Loading>` 实例（等于动了右下角那一个），已**全部还原** |

### 已知例外（P6 登记，2026-10-01）

以下内联字面量经评审保留，**不纳入「数值必须来自 token」的硬约束**；每次新增同类须回本表加一条。

| 类别 | 位置样例 | 理由 |
|---|---|---|
| 图标尺寸 | `task-list.tsx` 18/16、`editor-fields.tsx` 16、`task-editor.tsx` 14、`archive-session-css.ts` 14/16/6/11/40/14、`index.ts` 16 | 图标 / 图标底板与控件总高无绑定 |
| 圆点 / 装饰点 | `task-list.tsx` 5、`task-editor.tsx` 5、`index.ts` 7、`toast-css.ts` 7、`archive-session-css.ts` 2 | 装饰元素，无三档语义 |
| 分隔线 / 1px 圆角 | `archive-session-css.ts` 1px / 1×1 | 线宽语义 |
| 圆形 `border-radius:50%` | `task-editor.tsx` 圆点、`task-list.tsx` 圆点 | 圆点必须圆 |
| 内容区定高 / 限高 | `task-list.tsx` 360（刻意定高）、`task-editor-css.ts` 132、`archive-session-css.ts` 150/224/240/60、`index.ts` 16em/12em | 内容区尺寸，与控件档无关 |
| 紧凑树开关 20×20 | `archive-session-css.ts` `.dsh-tdt-sv-tree-toggle` | 树行密度专用第四档 |
| 随字号缩放行高 | `archive-session-css.ts` `calc(Npx + var(--dsh-content-font-delta))` | 承担字号自适应，换 token 会丢掉缩放能力 |
| 会话镜像官方样式 | `archive-session-css.ts` 的 `--dsh-content-*` / `--dsh-chat-*` | `ui-foundation.md` §九 边界（复刻官方会话面） |
| 折叠头 / 菜单项 / 面包屑 / chip / 投放区壳 / 浮层触发壳 | `task-editor.tsx` 高级折叠头 / 投放区；`file-browser.tsx` 菜单项 / 面包屑 / 树 toggle；`task-list.tsx` chip；`mirror/*` 折叠头 | 语义非普通按钮，走各自专用类与计算属性 |
| 任务选择器浮层的列表定高 | `ui/TaskPicker.tsx` `.dsh-tdt-tp-list{max-height:264px}`（内容区定高，与 `task-list.tsx:360` 同类） | 内容区尺寸，与控件档无关 |
| **宿主值导入例外：官方 `Toast`** | `index.ts` 的保存成功提示（`import { Toast } from '@deepseek-ai/dsh-client-ui-primitives'`） | 2026-10-04 评审登记：官件自带明暗自适应 + 淡入淡出，这里只要「一次性轻提示」，且与 `FloatingToast`（操作结果提示）分工不同。**除它之外业务文件不许再引宿主值**；若将来要收编，走 §三「待抽象 #5」同批做 |

### 待抽象（2026-10-01 审计登记，**未做**——显式记账，别当没看见）

审计确认「一类控件一个实现」这条已**达标**；下列是**同构重复 / 该上提而未上提**的残留，属改动中等以上，登记待办（不在本次收口范围）：

| # | 事项 | 现状 | 建议 |
|---|---|---|---|
| 1 | 省略号三件套 | `overflow:hidden;text-overflow:ellipsis;white-space:nowrap` 全仓约 19 处（会话 CSS 约 14 处） | ✅ **2026-10-04 已落 `.dsh-tdt-ellipsis`**（`ui/controls-css.ts`）；**新调用点必须用它**，旧的 19 处待逐步收编 |
| 2 | 手搓图标钮 | `archive-session-css.ts` 的 `head-btn`(28×28) / `tree-toggle`(20×20) 仍自绘 | 收编 `ui/IconButton` |
| 3 | 6px 拖拽条 | `task-editor-css.ts` 与 `archive-session-css.ts` 各写一遍（后者注释自称「同一套」）；**连 CSS 带逻辑两份**：两个 `startResize`（`task-editor.tsx` / `index.ts`）都各自实现了「拖动调宽」与「拖动禁选」（后者 2026-10-02 加） | 上提 `.dsh-tdt-resizer` + 一个 `startResizeLayoutWidth()`（含 preventDefault / `body.user-select` 恢复） |
| 4 | 卡 / 浮层外壳 | 同构 **7 处**（`ed-card` / `ed-panel` / `sv-panel` / `sv-stats` / `layer` …） | 基础层加 Panel / Card 壳 |
| 5 | 手搓中性 Toast | `index.ts` 自绘一个（关钮 + 圆点），与 `FloatingToast` 中性档重复 | `FloatingToast` 加 `closable` 变体后删自绘 |
| 6 | 缺基础层件 | 无 `Textarea`（提示词框皮肤写在业务 CSS）、无 `Checkbox`（编辑器用裸 `<input type=checkbox>`） | 补进 `ui/` 后删业务皮肤 |
| 7 | token 兜底字面量不统一 | `--tdt-fg` 兜底 `#1a1a1a` / `#1f2328` 两派；`--tdt-hover` 兜底 `rgba(128,128,128,.16)` / `rgba(127,127,127,.14)` | 兜底只在 `tokens.ts` 一处，调用点写 `var(--tdt-x)` 不带兜底 |
| 8 | 实面反白字 | 下游仍有几处写死 `#fff` | 统一 `--tdt-on-signal` |
| **9** | **任务选择器（带搜索）** —— 控件已建；剩余只有「编辑器前置任务」那两级 | ✅ 已建 `ui/TaskPicker.tsx`（2026-10-04，执行记录总查询页在用，见上表）；✅ 工作区候选真源与任务列表顶部下拉收编已完成（[`worklog/workspace-options-unification.md`](../../worklog/workspace-options-unification.md)）；✅ 旧测试屏的原生 `<select>` 已随执行记录时间轴重写一并删除。**剩余**：编辑器「前置任务」第②级仍是 `SelectField`（`task-editor.tsx`），作用域 `depWs` 仍是**内部** state | 用 `TaskPicker` 替换第②级、并把第①级工作区改成**受控入参**（未决项 **U31**，另行进行）。任务选项文案统一取 `[code] name`（执行记录页已这么组装） |

---

## 四、主题（明暗）规则

1. **默认什么都不用做**：颜色引用 `--tdt-*`，而 `--tdt-*` 映射宿主 alias ⇒ 用户切「明色 / 暗色 / 跟随系统」时自动跟随（决策 26 修订确立的路线）。
2. **需要「反色面 / 固定中性色」时**：只在 `ui/tokens.ts` 加一条变量 + 一条 `body[data-ds-dark-theme]` 覆盖，**业务文件零改动**。
3. **不许用 `prefers-color-scheme`**（跟的是系统而不是用户在宿主里的选择——两者可以不一致）。
4. **对比度自检**：新控件必须在**暗色**下走查一遍（用户当前主题偏暗，暗色是主场景）。

---

## 五、要「多一档尺寸」或「多一个外观」怎么办

- **尺寸以三档为唯一刻度**（`sm=24 / md=28 / lg=32`，真源 `tokens.ts` 的 `--tdt-control-h-*`）：任何控件说 `size="md"` 就**等于 28**，不许各自翻译。**全站默认走 `lg=32`**（用户 2026-10-01 拍板：「所有输入走 32 标准」，个别太高才显式降 `md`/`sm`）。
  - **字号跟档走**：`sm` 用 `--tdt-font-sm`(12)、`md`/`lg` 用 `--tdt-font-md`(13)（前缀框 / 数字框已按此修正，此前写死 12 ⇒ 看着「input 字比 select 小」）。
  - **圆角统一 `--tdt-radius-md`(12)**：输入框 / 前缀框 / 数字框 / 按钮与下拉同圆角（2026-10-01 拍板；`radius-sm` 不再用于控件本体）。
  - 需要再增一档 ⇒ 在 `tokens.ts` 加一条 `--tdt-control-h-xx`（一处，直绑宿主两主题变量），调用点用 `size="xx"` 选；**真不够用才允许在调用点本地覆盖 `--tdt-control-h-*` 这一个变量**，且须在本文档「已知例外」表记一条（组件 `style` 只许补布局、覆盖高度，不许另写结构）。
- **想要新的外观（variant）**：在 `controls-css.ts` 里加一个 variant 类，且**只允许覆盖 token 变量**（颜色），结构/尺寸/交互规则不许重写。
- **有边 / 无边必须等高**（2026-10-01 拍板，同日修正 **+2**）：边框必须在内部补回，外框**严格 == token**。统一几何 = 段高 `token − 6px`（上下各 **2px padding + 1px 边框**）——有边框的 variant 用真边框 + padding **2px**；无边框的 variant padding 收 **3px** 补回缺的 1px。`Segmented` 已按此落地（`default` 真边框 + 2px；`inset` 无边框 + 3px，外框严格 24/28/32），`Button` / `Input` 的有边 / 无边同此规则。⚠️ 早期文档写的「3px / 4px」**已废**：那会让外框比 token 多 **+2px**（就是「滑轨比同排输入框高两像素」的根因）。
- **想要新的控件**：按 §一 第三个分支，在 `ui/` 里建唯一实现，并在本手册 §二 表里加一行。
- **想要新的 token**（颜色 / 圆角 / 字号 / 间距 / 层级）：加进 `ui/tokens.ts` **一处**（命名 `--tdt-*`，映射宿主 alias 并留兜底值），同时在 [`ui-foundation.md`](ui-foundation.md) §四 的表里登记；**不许在使用点直接写 `var(--dsw-*)`**。
- **同排下拉定宽**（2026-10-02 拍板，来自「提示词下三下拉」）：一排里出现多个 `SelectField` 时**一律给 `width` 定宽**，以其中最短语义的那一个为基准、其余取倍数（如权限 120 ⇒ 工作区 / 模型 180 = 1.5×）。
  理由：`SelectField` 不传宽度时按内容撑（`maxWidth` 只封顶）⇒ **换一个选项宽度就变一下**（先各自撑到上限、三个都长才开始互相挤），视觉一直在跳。
  显示不下的部分走省略号（需要可读全名时用 `marquee: true`，hover 才跑马灯）；**空间确实不够时整体等比收缩**（CSS 收缩与选项长短无关，不会重新引入跳动）。
- **窄栏里的一行：宁可换行，也不折标签 / 不切框内字**（2026-10-02，来自排期底部行在最小宽 530 下的实际表现）：
  - 同一行里的**文字标签一律 `flex:'none' + whiteSpace:'nowrap'`** —— 否则空间一紧，先被牺牲的就是它（中文会折成两行，例如「任务开始时／间」）。
  - 行内的**控件包一层 `flex:'none'` 的 span**（`SelectField` / `DateField` / `TimeField` 的根都带 `min-width:0`，默认**可被压缩到出省略号**）。
  - ⚠️ **日期 / 时刻这类「内容必须完整可读」的框不给定宽**（2026-10-02 返工：定 108 / 78 后直接显示成 `2026-09-3…`、时间被三个点吃掉）。正确做法是**内容宽 + `flex:none`**：框宽恰好等于内容，天然切不掉，还比定宽更省。
  - **只有下拉才定宽**，且按**最宽那一档选项**取值（如「30 分钟」≈ 46 + 内边距/箭头 38 ⇒ 定 96），不按当前值算 —— 否则换选项时宽度会跳。
  - 实在放不下才给行容器 `flexWrap:'wrap'`（右组整组落第二行），**绝不靠切字或折标签来凑**。

---

## 六、提交前自检（照抄执行）

1. `npm run build`（`dist/` 必须一起提交——本仓硬约定）。
2. `npm run typecheck` + `npm run smoke`（冒烟测的是 `dist/` 产物）。
3. 反例自查（比断言更硬，直接在仓库里搜）：
   - 业务文件（`task-list.tsx` / `task-editor.tsx` / `index.ts` / `config-panel.tsx` / `file-*.tsx`）里 `--dsw-alias-` 出现次数 = **0**；
   - 同上文件里 `body[data-ds-dark-theme]` = **0**；
   - 同上文件里 `borderRadius:` / `fontSize:` 字面量 = **0**（token 变量不算）。
4. 明色 + 暗色两个主题各走查一遍改动面。
5. 按 [`ui-foundation.md`](ui-foundation.md) §十「通用细则」核对：层级有没有写裸 z-index、可交互元素有没有可见焦点环、动画在 `prefers-reduced-motion` 下是否降级、纯图标按钮有没有标签、内容可变的面板有没有固定最大高度、空/载/错三态是否齐。
6. 回写 `PROGRESS.md`（现场）与 `worklog/<工作包>.md`（过程）。

---

## 七、已知坑（别说没提醒）

| 坑 | 事实 | 出处 |
|---|---|---|
| 官方件 className 覆盖面各不相同 | `Input`：`className` 落外层 `.wrap`、`style` 落内层 `<input>`；`Modal`：`className` 只落 `.dialog`，抬不了整层（编辑器因此故意不用官方 Modal） | `primitives.d.ts:172`、`task-editor.tsx:977-979` |
| 官方类名是哈希 | 不许写死，只能按元素 + `role` 选；`ocOr` 是「官方优先、缺失回退」二选一，容易写死规则 | `official-classes.ts:106-108,140-142`、`archive-session-css.ts:243-246` |
| 官方 `SegmentedControl` 指示器位置靠 CSS 变量算 | 外部改 padding 必须同步改 top/left/height/width 算式（脆弱）⇒ 新体系不覆写它，改自绘统一体 | `task-editor-css.ts:101-105` |
| 官方没有日期 / 时间选择器 | 只能自绘，但要走同一套 token 与皮肤命名 | `primitives.d.ts:158-159` |
| 样式注入顺序不保证 | 覆盖官方件时必须靠「元素 + role」提高特异性，不靠先后 | `task-editor-css.ts:30`、`task-list.tsx:124` |
| `import './x.css'` 在 client 产物里**不被加载** | client 是内核消费的 CJS 闭包 ⇒ CSS 只能运行时注入 `<style>`，不许改成 import | `task-editor-css.ts:3-4` |
| 同一个意思的宿主变量有两个名字 | `state-warning-primary` / `border-focus` **宿主根本无定义**（写它们只会拿兜底色、不随主题）；`focus-ring-color` 有定义但默认值是 `transparent`（`var()` 兜底不生效 ⇒ 焦点环会隐身） | [`external/dsh-capabilities.md`](external/dsh-capabilities.md) §3 §4 |
| 宿主自带字号体系 | **成立且成族**：`--dsw-font-{xxxs-11,xxs-12,xs-13,s-14,base-16,m-18,l-20,xl-24}` + `-strong-` 变体 + 子 token ⇒ **字号一律映射宿主 token，不要自己定 px 刻度** | theme `lib/client.js`（capabilities §2） |
| 「看着有、其实没有」的变量名 | 本仓已踩 5 处：`--dsw-alias-interactive-bg`、`--dsw-alias-border-focus`、`--dsw-alias-state-warning-primary`、`--dsh-elevation-prominent`、`--dsh-radius-panel` | [`external/dsh-capabilities.md`](external/dsh-capabilities.md) §4 |
| Tooltip 子元素必须是真 DOM | 裸函数组件（含 `IconButton`）ref 挂不上 ⇒ 提示静默失效（踩过两次）；故问号统一用原生 `span`/`button` 当 Tooltip 子节点 | 决策 53 同轮口径；`task-editor.tsx` `HelpButton` |
| 用结构伪类收敛「末行」时，边框**必须走 class** | 内联样式优先级高于任何不含 `!important` 的 CSS ⇒ 写在 inline 的 `border-bottom` 会盖掉 `.x:last-child{border-bottom:0}`，表现为「改了没生效」（与 `.dsh-tdt-card` 底色同一个坑） | `task-list.tsx:157`；过程 [`worklog/info-panel-line-alignment.md`](../worklog/info-panel-line-alignment.md) §二 轮 1 |
| 多列 grid（`align-items: stretch`）**两列行盒必须等高** | 格子高度由行内最高的那格决定 ⇒ 一列漏写 `line-height`（只继承宿主值）、与另一列的 `var(--tdt-line-md)` 不等高时，矮的那格内容被**顶对齐**，看着「字贴上边线」。统一行高后：单行 = 上下居中；值多行时标签与值**第一行齐平** | `task-list.tsx:152` / `:157`；过程同上 §2.1 |
| 「去掉最后一行 / 第 N 行」的判据**不许写死容器** | 按容器 `:last-child` 判「末行」= 隐式写死了那一行：一旦末尾被插入别的块（如产出物区），被去掉的仍是旧末行。判据要抬到**整个栏**层级 | `task-list.tsx:162` / `:1218`；过程同上 §二 轮 2 |
| 下拉超长会撑破整行 | `SelectField` 锚点**必须给 `maxWidth`**；且官方 `Menu` 把锚点包进一层 shrink-to-fit 的 `span`，要让**这层也能收缩**（父容器加 `> *{min-width:0}`）才会压宽度出省略号——否则封了顶照样顶破容器 | `ui/Field.tsx`；`task-editor-css.ts` 的 `.dsh-tdt-ed-card-foot > *` |

---

## 八、这份手册怎么维护

- **谁改基础层，谁改这份手册**（`ui/` 的公开面变了 ⇒ §二 表与 §三 清单同步更新）。
- 手册**不记进度**（进度看 [`../PROGRESS.md`](../PROGRESS.md)），也不记「为什么这么设计」（看 [`ui-foundation.md`](ui-foundation.md)）——避免两份副本。
- 每次真机踩到新的样式坑，加进 §七 表（一行：坑 / 事实 / 出处）。
