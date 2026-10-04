# UI 基础层（design token + 组件皮肤）—— 规范

> **状态**：📝 **待拍板**（2026-10-01 起草；未落码）
> **来源**：用户 2026-10-01 口述需求（滑动块 / 按钮 / 下拉 / 输入框 / 日期时间 / 开关一律统一，且必须考虑明暗主题）
> **配套**：[`ui-style-guide.md`](ui-style-guide.md)（开发手册，写界面时照做）· [`../worklog/ui-foundation.md`](../worklog/ui-foundation.md)（过程与调研证据）
> **本文是**：样式基础层的**规范**（几个层、有哪些 token、控件怎么用、每期怎么做）。
> **本文不是**：问题盘点、目标、待拍板项、实施进度 —— 那些是工作包内容，见 [`../worklog/ui-foundation.md`](../worklog/ui-foundation.md) 与 [`../PROGRESS.md`](../PROGRESS.md)。

---

## 三、架构：四层，只许上层调下层

```
┌─ L3 使用点 ────────────────────────────────────────────────────────────┐
│ task-list.tsx / task-editor.tsx / index.ts / config-panel.tsx / file-*  │
│ 只写：<TdtSegmented size="sm" variant="inset" …>  或  className="…"      │
│ 禁止：颜色、尺寸、圆角、字号字面量（含 inline style）                     │
└───────────────────────────┬────────────────────────────────────────────┘
                            │ 只依赖 L2 的公开出口
┌─ L2 组件皮肤层 src/client/ui/ ─────────────────────────────────────────┐
│ controls-css.ts / official-skins.ts / *.tsx                             │
│ 一类控件**唯一实现**；对外的两个受控轴 = size(高度档) × variant(颜色档)    │
└───────────────────────────┬────────────────────────────────────────────┘
                            │ 只引用 L1 的 CSS 变量
┌─ L1 语义 token 层 src/client/ui/tokens.ts ─────────────────────────────┐
│ 唯一一处把宿主变量映射成插件语义名 --tdt-*；**明暗差异只在这一层写**      │
└───────────────────────────┬────────────────────────────────────────────┘
                            │
┌─ L0 宿主主题（只读，不自造）────────────────────────────────────────────┐
│ --dsw-alias-* / --dsw-static-* / --dsw-radius-* / --ds-*                │
│ 宿主运行时注入；宿主切「明色 / 暗色 / 跟随系统」时这些值自己变 ⇒ 我们 90%  │
│ 的颜色不需要判断主题，直接引用即可（决策 26 修订已确立的路线，本方案沿用） │
└────────────────────────────────────────────────────────────────────────┘
```

**目录落位**（新建 `src/client/ui/`，其余目录不动）：

| 文件 | 职责 |
|---|---|
| `tokens.ts` | **L1**：`--tdt-*` 定义（默认段 + `body[data-ds-dark-theme]` 覆盖段），导出 `UI_TOKENS_CSS` |
| `style.ts` | **统一注入器**：单例、单一 `<style>` id、按域 `registerStyle(domain, css)`、`ensureUiStyles()` 一次到位；替换现有 4 条注入 |
| `controls-css.ts` | **L2**：分段 / 按钮 / 图标钮 / 输入 / 下拉 / 开关 / 日期时间的皮肤规则（只此一处） |
| `official-skins.ts` | **L2**：官方件（`Switch` / `Input` / `Menu` / `SegmentedControl`）的观感覆盖，集中一处（现在散在 `task-editor-css.ts:31` 与 `task-list.tsx:125` 等） |
| `Segmented.tsx` | 分段控件（支持单选 / 多选，官方件只支持单选 ⇒ 这里自绘统一体） |
| `Button.tsx` | `Button`（primary/outline/ghost/danger × sm/md）+ `IconButton` |
| `Field.tsx` | `Input` / `Select`（包装官方件）/ `PrefixedInput` |
| `SwitchToggle.tsx` | 官方 `Switch` 的统一包装（含「打开 = success 绿」这一处覆盖） |
| `DateTime.tsx` | `DateField` / `TimeField`（官方**没有**日期时间件 ⇒ 自绘，走同一套 token） |
| `index.ts` | 对 L3 的**唯一出口**：非本文件导出的东西，L3 不许 import |

> ✅ **P0 已落码（2026-10-01）**：`ui/tokens.ts`（token 表）、`ui/style.ts`（统一注入器）、`ui/index.ts`（唯一出口 + `ensureUiBase()`）已建；`client/index.ts` 在渲染入口调一次 `ensureUiBase()`（幂等）。
> ✅ **P1a 已落码（2026-10-01）**：`ui/Segmented.tsx` + `ui/controls-css.ts` 已建，分段控件三处自绘调用点（主面板 / 列表筛选 / 卡片三面板）已改调共用组件。**其余控件皮肤（表里 Button / Field / SwitchToggle / DateTime / official-skins）尚未建，P2 起逐个加。** 落码记录见 [`../worklog/ui-foundation.md`](../worklog/ui-foundation.md) §八 §九。

### 3.1 公用 CSS 放哪

**结论：公用 CSS 不建 `.css` 文件，放在 `src/client/ui/` 里的 `.ts` 字符串常量中，由一个统一注入器打进同一条 `<style>`。**

| 问 | 答 |
|---|---|
| 为什么不建 `src/client/ui/ui.css`？ | client 产物是**内核消费的 CJS 闭包**，`import './ui.css'` **不会被加载**（`task-editor-css.ts:3-4`、`archive-session-css.ts:3-5`、`toast-css.ts:4-5` 三条注释已结论）；`dist/` 里**没有任何 `.css`**（已核实 29 个产物）⇒ CSS 只能作为字符串在运行时注入。引入 CSS 构建插件收益小、回归面大，本方案不动构建链。 |
| 那它存在哪？ | **三个文件、三段职责**：`ui/tokens.ts`（变量定义）／`ui/controls-css.ts`（控件皮肤）／`ui/official-skins.ts`（官方件覆盖）。三者都是 `export const XXX_CSS = \`…\`` 的 TS 模板字符串。 |
| 怎么进页面？ | 只经 **`ui/style.ts`**：`registerStyle('tokens', UI_TOKENS_CSS)` … `ensureUiStyles()` ⇒ **一条 `<style id="dsh-task-dispatch-table-ui">`**，幂等。现状的 4 条注入 / 5 处调用 / 2 套 id 全部收编。 |
| 各页面私有的样式怎么办？ | **允许保留**，但必须：① 放自己的 `*-css.ts`（如 `task-editor-css.ts`）；② 通过 `ui/style.ts` 注册（不再自己 `createElement('style')`）；③ 只能消费 `--tdt-*`，不许再定义颜色/尺寸字面量。 |
| 类名会不会撞？ | 继续沿用既有前缀 `dsh-tdt-`（**不改名**，避免大范围回归）：控件级 = `dsh-tdt-seg*` / `dsh-tdt-btn*` / `dsh-tdt-input*`，域私有保持 `-ed-` / `-sv-` / `-tl-` 子域。 |

### 3.2 文件落位总表（一眼看完）

| 类别 | 落位 | 谁用 |
|---|---|---|
| **公用 token（CSS 变量定义）** | `src/client/ui/tokens.ts` | 全站；只允许被 `var(--tdt-*)` 消费 |
| **公用控件皮肤（CSS 规则）** | `src/client/ui/controls-css.ts` | 全站控件 |
| **Loading 皮肤（CSS 规则）** | `src/client/ui/loading-css.ts` | `<Loading />` / `<RunningBlocks />` |
| **官方件观感覆盖** | `src/client/ui/official-skins.ts` | 官方 `Switch`/`Input`/`Menu`/`SegmentedControl` |
| **样式注入入口（唯一）** | `src/client/ui/style.ts` | 所有 `*-css.ts` 在此注册 |
| **公用控件组件** | `src/client/ui/{Segmented,Button,Field,SwitchToggle,DateTime,Loading}.tsx` | L3 使用点 |
| **公用出口（唯一 import 面）** | `src/client/ui/index.ts` | L3 只 import 这个 |
| **域私有样式** | `src/client/task-editor-css.ts` / `archive-session-css.ts` / `toast-css.ts`（过渡期保留，最终并入 `ui/`） | 各自页面 |
| **技术方案（定型）** | `docs/design/ui-foundation.md`（本文） | 设计与评审 |
| **开发手册（定型）** | `docs/design/ui-style-guide.md` | **每天写界面时照它做** |
| **过程（叙事）** | `docs/worklog/ui-foundation.md` | 回溯踩坑 |
| **进度 / 未决** | `docs/PROGRESS.md`（U18、里程碑 31） | 换会话接手 |
| **拍板结论** | 归属文档：功能决策进 `features/<功能>.md`、样式决策进本文 | 拍板后直接写进归属文档，只留结论与理由；**不另建决策文件** |
| **agent 强制入口** | `AGENTS.md` 第二条（⏳ **拟加，待用户授权**） | 每个新会话自动遵守 |

---

## 四、Token 规格（L1）

### 4.1 命名与硬规则

- 前缀 `--tdt-`（task dispatch table）；**类名前缀继续用既有的 `dsh-tdt-*`**（不改历史类名，避免大范围回归）。
- **硬规则**：`--tdt-*` 只在 `tokens.ts` 里被**定义**；其它任何文件只能 `var(--tdt-*)` **消费**，不许再定义 `--tdt-*`，也不许直接用 `--dsw-*`。
- 每个 token 都带宿主变量缺失时的兜底值（沿用现有写法，宿主升级换名不炸）。

### 4.2 颜色 token（全部映射宿主 alias ⇒ 明暗自适应）

| token | 映射（宿主变量） | 语义 |
|---|---|---|
| `--tdt-fg` / `--tdt-fg-2` / `--tdt-fg-3` / `--tdt-fg-dim` | `--dsw-alias-label-primary / -secondary / -tertiary / -dimmed` | 正文 / 次要 / 更弱 / 占位符 |
| `--tdt-fg-inverse` | `--dsw-alias-label-primary-foreground` | 反色面上的字（角标、实心钮）。**不用 `-inverted`**：暗色下它只到 bluish-800，实心面（暗色近白）上该用 `-foreground`（暗色 bluish-1000） |
| `--tdt-fg-4` | `--dsw-alias-label-caption` | 最弱一级文字（时间戳 / 分隔点；官方会话面已用 8 处） |
| `--tdt-surface-1` / `-2` / `-3` | `--dsw-alias-bg-layer-1 / -2 / -3` | 三层面（暗色下即 bluish-875 / 850 / 800） |
| `--tdt-surface-raised` | `--dsw-alias-bg-layer-1` | 「选中亮片」底盘**色** |
| `--tdt-shadow-raised` | `--dsw-elevation-soft` | 亮片的浮起投影（亮片三件套 = 上面两条 + `--tdt-radius-sm`，官方 `SegmentedControl` 指示器同款） |
| `--tdt-surface-sunken` | `--dsw-alias-interactive-bg-hover` | 下沉轨道底（官方分段控件轨道即用此变量） |
| `--tdt-solid` / `--tdt-on-solid` | `--dsw-static-neutral-00` / `--dsw-alias-label-primary`（暗色段覆盖为 `-900` / `-00`） | 固定中性实面 + 面上的字（自绘浮层；深色下必须自己变的那几个） |
| `--tdt-plate` / `--tdt-plate-hover` | `--dsw-static-neutral-50 / -100`（暗色段覆盖为 `-850` / `-800`） | 「浅底盘 + hover 加深」两拍（交付文件卡） |
| `--tdt-icon-plate` | `color-mix(in srgb, --dsw-static-neutral-00 …)`（明 50% / 暗 5%） | 图标底 |
| `--tdt-border-faint` / `--tdt-border` / `-strong` / `-heavy` | `--dsw-alias-border-l1 / -l2 / -l3 / -l4` | 描边四档（宿主真值 4% / 10% / 12% / 16%；官方 `Input` 描边用 `-l4`） |
| `--tdt-accent` | `--dsw-alias-brand-primary` | 品牌**面**色。⚠️ 它的真值是**明色近黑 / 暗色近白**，不是蓝色 |
| `--tdt-business` | `--dsw-alias-state-business-primary` | **蓝色强调 / 选中态**（deepseek-500 / 400）——界面上所有「蓝」都走这条 |
| `--tdt-success` / `--tdt-danger` | `--dsw-alias-state-success/error-primary` | 语义色 |
| `--tdt-success-soft` / `-warning-soft` / `-danger-soft` / `-business-soft` | `color-mix(in srgb, var(--tdt-<tone>) 8%, transparent)`（**不是宿主变量，我们现算**） | **状态色浅底**（2026-10-04 新增）：执行记录页每条流水账的块底。用 `color-mix` 现算而不写死 rgba ⇒ 状态色跟随宿主 alias，**暗色主题下自动成立**（深色底透出来、上面仍是状态色），不必在暗色段再覆盖一遍 |
| `--tdt-warning` | `--dsw-alias-state-warn-primary` ✅ **已核实** | 警告色（amber-500，明暗同值）。**`state-warning-primary` 是死变量**，宿主无此定义 |
| `--tdt-hover` / `--tdt-active` | `--dsw-alias-interactive-bg-hover / -active` | 交互底 |
| `--tdt-mask` | `--dsw-alias-bg-mask-1` | 遮罩 |
| `--tdt-shadow-1` / `-2` | `--dsw-elevation-soft` / `--dsw-shadow-lv3` | 浮层投影 |
| `--tdt-focus` | `--dsw-alias-state-business-primary` | 键盘焦点环。⚠️ **不用 `--dsw-focus-ring-color`**：宿主已把它定义为 `transparent`，`var()` 兜底不会生效 ⇒ 焦点环会隐身 |

> ✅ **变量名已逐一核实**（2026-10-01，宿主 0.2.0-rc.2，解包 theme + primitives + conversation + chat + renderer 五包）：上表每个宿主变量都有真源定义，圆角 / 字号 / 语义色真值见 [`external/dsh-capabilities.md`](external/dsh-capabilities.md) §主题与设计变量。**外部事实只有一个真源在那份文档，本文只记「我们映射成什么」。**

### 4.3 几何 / 排版 / 动效 token

| token | 建议值 | 说明 |
|---|---|---|
| `--tdt-radius-xs` / `-sm` / `-md` / `-lg` / `-xl` | **直绑宿主**：4 / 8 / 12 / 16 / 20px（`--dsw-radius-xs/sm/md/lg/xl`；另有 `-panel`=28） | 收敛现有 4/6/7/8/10/12 六种。⚠️ 宿主真值与旧稿不同（旧稿按 4/6/8/10 写的，已按核实结果改） |
| `--tdt-font-xs` / `-sm` / `-md` / `-lg` / `-xl` | **直绑宿主字号族子 token**：`--dsw-font-xxxs-11-font-size`(11) / `-xxs-12-`(12) / `-xs-13-`(13) / `-s-14-`(14) / `-base-16-`(16)；加粗用宿主 `-strong-` 变体 | 收敛现有 10~16px 七档；**不自己定 px 刻度** |
| `--tdt-line-xs` / `-sm` / `-md` / `-lg` / `-xl` | 同族 `-line-height` 子 token：14 / 18 / 20 / 22 / 24 | 字号成对给行高（宿主就是这么配的），避免各处自己试行高 |
| `--tdt-font-mono` | `--ds-font-family-code` | 等宽栈（代码 / 路径） |
| `--tdt-control-h-sm` / `-md` / `-lg` | **24 / 28 / 32px**（`md` 与官方分段控件段高 28 一致；`lg=32` 为用户 2026-10-01 拍板的「32 标准行」，且为**全站默认档**） | 全站只此三档高度；任何控件的 `size` 都映射到这三档，不许各自翻译 |
| `--tdt-space-1` / `-2` / `-3` / `-4` | 4 / 8 / 12 / 16px | 间距四拍 |
| `--tdt-z-sticky` / `-dock` / `-drawer` / `-modal` / `-menu` / `-tip` | 10 / 1030 / 1040 / 1070 / 1100 / 1200 | 层级阶梯（业务文件不许写裸 `z-index`）。`--tdt-z-sticky`（2026-10-04 加）是**内容层内部**的吸附位（天标签 / 表头这类「跟着滚但压住同层内容」的元素），必须低于下面所有浮层档。现网散落值 2/6/10/20/30/31/1000/1020/1030/1040/1070/1100/1200 在分期迁移时逐点对齐到阶梯 |
| `--tdt-dur` / `-fast` / `--tdt-ease` | `--ds-transition-duration`(+`-fast`) / `--ds-ease-in-out` | 动效 |

### 4.4 明暗两段的写法

```css
/* ui/tokens.ts（P0 已落码的真实形态） */
body{
  --tdt-fg: var(--dsw-alias-label-primary,#1f2328);
  --tdt-surface-sunken: var(--dsw-alias-interactive-bg-hover,rgba(38,49,72,.06));
  /* …上表全部… */
  /* 只有 alias 表达不了的「固定中性面」才在这里写默认段 */
  --tdt-plate: var(--dsw-static-neutral-50,#fafafa);
}
body[data-ds-dark-theme]{
  --tdt-solid: var(--dsw-static-neutral-900,#0f0f0f);
  --tdt-plate: var(--dsw-static-neutral-850,#212123);
}
```

**挂载点选 `body`**（不是某个 `.dsh-tdt-scope` 类）：插件界面（含 portal 到 body 的弹窗）全在 body 内，
定义在 body 上零调用点成本；token 名统一带 `--tdt-` 前缀，不会和宿主变量打架。

两条硬规则：
1. **默认段优先**：能用 `--dsw-alias-*` 表达的，一律不要写覆盖段（alias 自己随主题变）。
2. **覆盖段只允许出现在 `tokens.ts`**，且只覆盖「固定中性面 / 反色面」这类语义（现有 7 处 `body[data-ds-dark-theme]` 全部收编到这里）。

### 4.5 宿主变量实测表（token 映射的依据）

抓取方式：`grep -rhoE '\-\-(dsw|ds)-[a-z0-9-]+' src | sort | uniq -c | sort -rn`，共约 **60 个**（去掉注释里的通配写法 `--dsw-alias-` / `--dsw-alias-button-`）。

| 族 | 变量（括号内 = 本仓引用次数） |
|---|---|
| 文字 | `label-primary`(44) `label-secondary`(39) `label-tertiary`(37) `label-caption`(8) `label-dimmed`(4) `label-primary-inverted`(5) `label-primary-foreground`(2) |
| 面 | `bg-layer-1`(15) `bg-base`(13) `bg-layer-2`(11) `bg-layer-3`(2) `bg-mask-1`(5) `interactive-bg`(1) `interactive-bg-hover`(30) `interactive-bg-active`(1) `interactive-bg-hover-solid`(1) |
| 描边 | `border-l1`(5) `border-l2`(31) `border-l3`(6) `border-l4`(5) `border-focus`(2) |
| 状态 / 品牌 | `state-error-primary`(19) `state-success-primary`(4) `state-business-primary`(7) `state-warning-primary`(3) `state-warn-primary`(2) `state-warn-label`(1) `brand-primary`(8) `link`(1) |
| 静态中性 | `static-neutral-00`(8) `-50`(1) `-100`(1) `-800`(1) `-850`(1) `-900`(2) |
| 圆角 / 阴影 / 焦点 | `radius-sm`(16) `radius-md`(10) `radius-lg`(5) `radius-xl`(1) `radius-panel`(2) `shadow-lv3`(7) `elevation-soft`(2) `elevation-prominent`(4) `focus-ring-color`(2) |
| 字体 | `ds-font-family-code`(9) `ds-transition-duration`(8) `ds-ease-in-out`(9) **`dsw-font-xxs-12`(1)** **`dsw-font-xs-13`(1)** `dsw-font-markdown-code-block-small`(3) `dsh-content-font-size-secondary`(2) |
| 专用面 | `dsw-specific-menu`(2) `dsw-specific-bubble`(1) `dsw-menu-surface-fill`(1) `dsw-alias-markdown-code-block`(2) `dsw-alias-button-primary-fill`(1，仅注释) |

**三处疑点：✅ 已裁决（2026-10-01，宿主 0.2.0-rc.2 解包核实，证据全表见 [`external/dsh-capabilities.md`](external/dsh-capabilities.md) §主题与设计变量 §3）**：

| # | 疑点 | 裁决（已核实） | 我们怎么做 |
|---|---|---|---|
| ① | `state-warn-primary` 与 `state-warning-primary` 并存 | **`state-warn-primary` 是真变量**（amber-500，明暗同值）；`state-warning-primary` 宿主 0 处定义 ⇒ 写它的 3 处（`task-editor.tsx:1034,1052`、`toast-css.ts:63`）一直取的是自己的兜底色 | token 层定 `--tdt-warning` = `state-warn-primary`；3 处调用点随 P4 一并改掉 |
| ② | `focus-ring-color` 与 `border-focus` 并存 | **`focus-ring-color` 存在但默认值是 `transparent`**（`var()` 兜底不生效）；`border-focus` **宿主 0 处定义**（`archive-session-css.ts:295` 也是死引用） | token 层定 `--tdt-focus` = `state-business-primary`（可见蓝），不再引用这两个名 |
| ③ | 宿主是否有**字号体系** | **有，且成族**：`--dsw-font-{xxxs-11,xxs-12,xs-13,s-14,base-16,m-18,l-20,xl-24}` + `-strong-` 变体 + 子 token | `--tdt-font-*` 直绑宿主字号 token（见 §4.3），不自定 px |

---

## 五、控件皮肤规格（L2）：两轴模型

用户说的「基础 + 覆盖某两个颜色」在工程上就是：**结构一套 + 两个受控轴（size / variant）**。

**派生总纲（全站统一逻辑）**：每个控件先有「一个基础实现」，所有样式差异（明暗、底色上下文、高度档位……）都从这一份基础之上**派生**得到——派生只覆盖变量、不另写结构。需要某个维度就派生那一维；若某控件在某维度上无需区分（例如不分明暗），就只留基础那一套，不强求每个控件都补齐所有维度。

### 5.1 分段控件

```css
/* 基础：结构 + 交互 + 三档高度，全部唯一（✅ P1 已落码，真实实现见 src/client/ui/controls-css.ts） */
.dsh-tdt-seg{display:inline-flex;align-items:center;gap:2px;padding:2px;
  border-radius:var(--tdt-radius-md);background:var(--seg-track);}
.dsh-tdt-seg__item{height:calc(var(--tdt-control-h-sm) - 6px);padding:0 12px;
  border:0;border-radius:var(--tdt-radius-sm);font-size:var(--tdt-font-sm);line-height:var(--tdt-line-sm);
  color:var(--tdt-fg-2);background:transparent;cursor:pointer;}
.dsh-tdt-seg__item[aria-pressed='true']{background:var(--seg-thumb);box-shadow:var(--tdt-shadow-raised);color:var(--tdt-fg);font-weight:600;}
.dsh-tdt-seg--md .dsh-tdt-seg__item{height:calc(var(--tdt-control-h-md) - 6px);}
.dsh-tdt-seg--lg .dsh-tdt-seg__item{height:calc(var(--tdt-control-h-lg) - 6px);}

/* 变体：**只覆盖两个颜色变量** —— 这正是用户说的「颜色重载」。
   2026-10-01 用户拍板：保留「纯黑面 / 灰底面」两套、不合并：
   - default（纯黑面）= 轨道第二层面 + 外描边；
   - inset（灰底面）= 抄「版本」开关观感（轨道交互灰 hover 底、无外描边），用户觉得比原灰底那套好看。
   ⚠️ 高度对齐（2026-10-01 拍板，同日修正 **+2**）：有边 / 无边外框必须**严格 == token**，边框在内部补回。
   统一几何 = 段高 token − 6px（上下各 **2px padding + 1px 边框**）——default 真边框 1px + padding **2px**；inset 无边框 padding 收 **3px** 补回缺的 1px。
   段高算式 − 6px 不用动，两种外观总高都 == 24/28/32；以后 Button / Input 的有边 / 无边同此规则。
   （早期「3px / 4px」写法会让外框比 token 多 +2px，已废。） */
.dsh-tdt-seg--default{--seg-track:var(--tdt-surface-2);--seg-thumb:var(--tdt-surface-raised);border:1px solid var(--tdt-border);}
.dsh-tdt-seg--inset{--seg-track:var(--tdt-hover);--seg-thumb:var(--tdt-surface-raised);border:0;padding:3px;}
```

对应到用户截图的三处（**同一份基础样式，只换 variant**）：

| 位置 | 现在 | 收敛后 |
|---|---|---|
| 主面板「任务配置 / 执行记录 / 调试」（截图 1） | `index.ts` 自绘 30px 高 | ✅ P1：`<Segmented size="md" variant="default">` |
| 任务列表「全部 / 已开启 / 已关闭 / 异常」（截图 2，带角标） | `task-list.tsx` 自绘 32px 高 | ✅ P1：`<Segmented size="md" variant="default" badge>` |
| 卡片展开「基础信息 / 执行记录 / 日志」（截图 3） | `task-list.tsx` 自绘 28px（底色却与上面不同） | ✅ P1：`<Segmented size="md" variant="inset">` |
| 编辑器「编辑 / 预览」「单次 / 周期 / 间隔」「基础信息 / 执行记录」 | 官方件 + `--seg` 覆写（指示器算式脆弱） | ✅ P1b：同一个 `Segmented`（不再覆写官方指示器） |
| 星期选择（多选，官方不支持） | `editor-fields.tsx` 自绘 | ✅ P1b：同一个 `Segmented multiple` |
| 版本开关（单段） | `task-editor-css.ts:54-57` 自绘 | ✅ 2026-10-01：并入统一 `Segmented`（multiple 单段做 on/off，id `dsh-tdt-ed-histtoggle`） |
| 预览「渲染 / 源码」 | `archive-session-css.ts` 自绘 + 深色特判 | ✅ P1b：同一个 `Segmented size="sm" variant="default"`（深色特判已删，由 token 自动跟随明暗） |

### 5.2 其它控件

| 控件 | variant 轴 | size 轴（全部映射 24/28/32） | 唯一实现位置 |
|---|---|---|---|
| 按钮 | `primary` / `outline` / `ghost` / `danger`（+ 修饰类 `--link` / `--danger-ink`）。**链接型文字钮 = `ghost` + `--link`**（无边框 / 链接色 / hover 下划线）—— 2026-10-04 起执行记录页前置格的「查看会话」在消费它（本轮**只消费、未新增资产**） | sm / md / lg（默认 lg） | `ui/Button.tsx` + `ui/controls-css.ts` ✅ |
| 图标钮 | `plain`（默认）/ `outline` / `danger` | sm / md / lg（默认 lg） | `ui/Button.tsx`（`IconButton`）✅ |
| 输入框 / 前缀框 / 数字框 | 输入框 `error`（描红）；数字框显式 ±、`inputWidth` 可调宽度 | sm / md / lg（默认 lg） | `ui/Field.tsx` ✅ |
| 下拉 | 只换锚点宽度 / 图标（`block` 整行、`maxWidth` 限宽、`marquee` 跑马灯） | sm / md / lg（默认 lg） | `ui/Field.tsx`（`SelectField`，包装官方 `Menu`）✅ |
| **任务选择器（带搜索）** | 见 §5.4：在 `SelectField` 之上加**搜索框 + 最近 N 条/更多 + 外部作用域** | sm / md / lg（默认 lg） | `ui/TaskPicker.tsx` ✅ **2026-10-04 落码**（执行记录总查询页在用；不许业务文件自己拼 Input + Menu） |
| **产出物图标 chip** | 见 §5.5：28×28 上的官方文件类型图标（**只给图标**，名字走 `title`），**底板平时透明、hover 才浮出** | —（固定 28，同 `sm` 行高观感） | `ui/controls-css.ts` 的 `.dsh-tdt-chip` ✅ **2026-10-04 收编**：卡片「执行记录」面板 + 执行记录总查询页共用；此前两页各写一份**同名不同皮**的 `.dsh-tdt-rec-out`，同一页面里谁后注册谁生效、互相污染 |
| **行式文件按钮** | 见 §5.6：一行一个文件 = 「官方文件类型图标（14px）+ 文件名（溢出省略号）」，**平时透明、hover 才出浅底** | `--block` / `--inline` | `ui/controls-css.ts` 的 `.dsh-tdt-filechip` ✅ **2026-10-04 收编**（原 `task-list.tsx` 的 `.dsh-tdt-info-out`）：卡片「上次执行」产出物清单 / 附件区 / 执行记录页展开区三处共用 |
| 开关 | 选中 = success 绿（唯一） | 官方尺寸（**不纳入 token 档**） | 官方 `Switch` + 包装类 `.dsh-tdt-switch`（`ui/controls-css.ts`）✅ |
| 日期 / 时间 | `calendar` / `time` | sm / md / lg（默认 lg） | `ui/DateTime.tsx`（官方无此件，自绘）✅ |
| Toast | 四档语义色（success / warning / neutral / error） | — | `toast-css.ts`（`FloatingToast`）✅ |
| Loading（浮动加载 pill） | — | — | `ui/Loading.tsx` + `ui/loading-css.ts` ✅ |
| 卡 / 浮层外壳 | — | — | ⏳ 未抽象（同构 7 处，见 [`ui-style-guide.md`](ui-style-guide.md) §三「待抽象」） |

### 5.3 官方件策略（**优先用官方的，但观感只覆盖一次**）

- **优先官方件**：`Switch` / `Input` / `Menu` / `Button` / `Tooltip` / `Modal` / `StateDot` —— 它们自带明暗自适应与可访问性，能用就用。**分段（单选 / 多选 / 单段）统一用自研 `Segmented`**，不优先官方 `SegmentedControl`（官方仅支持单选、且指示器算式脆弱，已被自研件取代）。
- **覆盖集中一处**：官方件的观感偏差（如「Switch 打开要绿」「Input 高度 32→26」）只在 `official-skins.ts` 写一次；选择器统一带 `role` / 标签提升特异性（现有两条注释已确立的做法：`task-editor-css.ts:30`、`task-list.tsx:124` —— 与注入顺序无关）。
- **已知覆盖限制**（写进手册，避免再踩）：
  - `SegmentedControl` 指示器靠 `--dsh-segment-count/index` 算位置（**已核实：两个变量由官方组件 JS 内联写在 tablist 上**，官方基线 = padding 4px / gap 2px / 段高 28 / 字 13，出处 `@deepseek-ai/dsh-client-ui-primitives@0.2.0-rc.2` `lib/SegmentedControl.module.css`）⇒ 外部改 padding 必须同步改算式（本仓 `task-editor-css.ts:104-106` 正是这么覆写的）⇒ **新体系不再覆写官方指示器，改自绘统一体**。
  - `Input`：`className` 落外层 `.wrap`、`style` 落内层 `<input>`（`primitives.d.ts:172`）。
  - `Modal`：`className` 只落 `.dialog`，抬不了整层 `.root`(z1000) ⇒ 编辑器故意不用官方 Modal（`task-editor.tsx:977-979`）。
  - 官方类名是 CSS-module 哈希，**不许写死**，只能按元素 + role 选（`official-classes.ts` 的 `ocOr` 二选一语义已有踩坑记录）。

### 5.4 任务选择器（2026-10-03 立规格，✅ 2026-10-04 落码）

**为什么必须抽（用户原话）**：「任务一旦稍微多点，有个三四十条你就很难选了……应该直接做成一个搜索框的样子：默认显示最近的 10 条，然后提供『更多』选项；上方带一个搜索框可以过滤，支持搜任务的名字、任务的 ID……这个功能明确是需要抽象出来统一的，因为很多地方都要用。」

它不是「又一个下拉」，而是**候选集会随外部作用域变化、且需要搜索**的一类选择控件；全仓目前**没有**任何 combobox / autocomplete / 命令面板（2026-10-03 全仓扫描结论；官方 primitives 也无）⇒ 新建，落在 `ui/TaskPicker.tsx`。

**与 `SelectField` 的分工**（不许彼此越界）：

| | `SelectField` | `TaskPicker` |
|---|---|---|
| 候选规模 | 少（十几个以内） | 多（几十上百，需要搜索） |
| 搜索 | 无 | 有（按 `label` / `id`） |
| 折叠 | 全列 | 默认最近 `recentLimit` 条 +「更多」展开全部 |
| 作用域 | 无 | **受控入参 `scope`**（外部改 ⇒ 候选实时重算） |
| 底层 | 官方 `Menu` | 官方 `Input` + 官方 `Menu`（复用，不自绘浮层） |

**最小必要接口**（从实际调用点反推，见 [`../worklog/execution-timeline.md`](../worklog/execution-timeline.md) §四）：

```ts
value: string                       // 选中的任务 id；'' = 未选
onChange(id: string): void          // 与 SelectField 同契约（传值，不传 event）
options: readonly TaskOption[]      // 候选全量（带 workspace / enabled）；[新] TaskOption 是 L2 的本地声明
                                    //（与 L3 的 EditorTaskOption 同形，**刻意不反向 import 业务文件**）
scope?: string                      // 外部受控工作区；'' | undefined = 不限；变化 ⇒ 候选重算
excludeIds?: readonly string[]      // 排除项（已选前置 + 当前任务自己）
recentLimit?: number                // 默认 10
placeholder / emptyLabel / ariaLabel / searchPlaceholder: string
disabled?: boolean; size?: 'sm' | 'md' | 'lg'; width?: number | string; align?: 'start' | 'end'
```

**两条硬规则**：

1. **`scope` 是受控入参，不是内部 state** —— 现有编辑器「前置任务」把工作区做成内部 `depWs`（`task-editor.tsx:1878`），导致外部（比如任务本身的工作区）改了它不知道；新控件必须由调用方持有作用域。
2. **已选项掉出新作用域 ⇒ 显式提示，不静默清空**（静默清空会让用户以为自己没选过）。

**✅ 已拍板的真源口径（2026-10-04，用户拍板「按最干净最规范的来」）**：

- **工作区候选的唯一真源 = `GET /options`**（`src/index.ts:641-643`）返回的宿主真实工作区，`value = title`。三处「选工作区」（编辑器底部 / 编辑器「前置任务」第①级 / 任务列表顶部）**共用面板级同一份**（`src/client/index.ts` 取一次、不轮询），**禁止再从任务表或卡片数据反推**——反推会让「暂时没有任务的工作区」凭空消失。
- **取不到（degraded ⇒ 空数组）不回退**：下拉显示「暂无可选」。回退反推就等于又造第二真源。
- **允许空态**：选到真源里有、但当前没有可选任务的工作区 ⇒ 下一级给空态文案（`editorDepTaskEmpty`），不隐藏该工作区。

> 过程与三处坐标见 [`../worklog/workspace-options-unification.md`](../worklog/workspace-options-unification.md)；使用点规范见 [`ui-style-guide.md`](ui-style-guide.md) §二。

**任务选项文案**（✅ 执行记录页已按下面口径落地；剩余替换点见未决项 **U31**）：统一取 `[code] name`（编辑器 `editorTasks` 的口径，注释明确「绝不把机器 id 当尾缀拖出来」）；执行记录页由 `overview.rows` 组装同一口径，**搜索按 id 命中**由 `TaskPicker` 负责（`label` 或 `id` 命中皆可）。

---

### 5.5 产出物图标 chip（2026-10-04 收编，**全站唯一实现**）

用户 2026-10-04 点名：「执行记录列表上不用把名字都显示出来，只显示一个带背景的图标就行 —— 参考『任务配置』里点开任务后『执行记录』面板里那种样式。」

| 项 | 口径 |
|---|---|
| 落点 | `src/client/ui/controls-css.ts` 的 `BUTTON_CSS` 段（L2 控件皮肤层；与 `.dsh-tdt-btn` / `.dsh-tdt-iconbtn` 同层） |
| 类名 | `.dsh-tdt-chip`（图标态）+ `.dsh-tdt-chip--label`（文字态：`…` / `+N`，按内容撑开） |
| 尺寸 | `width/height = --tdt-control-h-md`（28），图标 `FileTypeIcon size 16`；`border-radius: --tdt-radius-sm` |
| 底色 | **平时 `background: transparent`，`:hover` 才出 `--tdt-chip-bg-hover`**（2026-10-04 第四版按用户要求改：「那个带底色的框，鼠标移上去才有」）；`--tdt-chip-bg-hover` 比 `--tdt-chip-bg` 更明显，专给「只有图标、没有文字可读」的 chip 用；⚠️ **必须走 class**：inline `background` 会盖掉 `:hover`（2026-10-03 踩过） |
| 不可点 | `:disabled` 保持透明 + 灰色 + `cursor:default`（无会话 / 预览面未就位时不给假入口） |
| 收编原因 | 该皮肤原本在 `task-list.tsx`（`.dsh-tdt-rec-out`）与执行记录页（**同名不同皮**：一个带文件名 + `--tdt-plate`，一个 28×28 图标 + `--tdt-chip-bg`）各写一份，两份 CSS 都注入同一页面 ⇒ 后注册者覆盖前者、两页外观互相污染 |

### 5.6 行式文件按钮（图标 + 文件名，2026-10-04 收编，**全站唯一实现**）

用户 2026-10-04 点名：「这个产出物，你可以去参考那个……在任务配置里面点开一个任务，不是有附加文件吗？……本来它就有一个框，是鼠标移上去才显示的。」

| 项 | 口径 |
|---|---|
| 落点 | 同 §5.5（`ui/controls-css.ts` 的 `BUTTON_CSS` 段） |
| 类名 | `.dsh-tdt-filechip` + 形态修饰类 `--block`（撑满父宽、一项一行）/ `--inline`（内容宽、跟在文字后头） |
| 底色 | **平时透明、`:hover` 才出 `--tdt-chip-bg`**（原 `.dsh-tdt-info-out` 的观感，用户 2026-10-03 定的） |
| 尺寸 | 图标 `FileTypeIcon size 14`；`--block`：`gap 6px` / `padding 4px 6px` / `font-size --tdt-font-xs`；`--inline`：`gap 4px` / `padding 2px 6px` / `font-size --tdt-font-sm`；圆角 `--tdt-radius-xs` |
| 不可点 | `:disabled` 保持透明 + 灰色（不预览就不可点，不给假入口） |
| 收编原因 | 该皮肤原只写在 `task-list.tsx` 的 `TASK_LIST_CSS`（`.dsh-tdt-info-out`），执行记录页展开区要用同一种观感 ⇒ 上提基础层，避免再出现「各写一份外观」（同名不同皮的坑刚踩过） |
| 三处共用 | 卡片基础信息右栏「上次执行」产出物清单（`--block`）、附件区（`--inline`）、执行记录页展开区（`--block`） |

---

## 六、样式交付方式：沿用「运行时注入」，只统一入口

- **不改构建链**：client 产物是内核消费的 CJS 闭包，`import './x.css'` 不会被加载（`task-editor-css.ts:3-4` 等三处注释已结论），CSS 只能作为字符串运行时注入 `<style>`。引入 CSS 构建插件收益小、回归面大 ⇒ **维持现状**。
- **改的是入口**（消除现有 4 条注入 / 5 处调用 / 2 套 id）：
  - 单一 `style.ts`：`ensureUiStyles()` 幂等、单一 style 标签 id（`dsh-task-dispatch-table-ui`），按域注册（`tokens` / `controls` / `official` / `domain:editor` / `domain:session-view` / `domain:toast` / `domain:records` / `domain:taskpicker`）。
  - 删掉 `session-view.ts:553` 的**模块顶层**注入与 `task-list.tsx` 的局部注入/局部 id。
  - 过渡期允许老样式表暂时各留一条 `<style>`，但**统一由 `style.ts` 注册**，不再各处自己 `createElement`。

---

## 七、迁移分期

| 期 | 范围 | 产出 | 验收 |
|---|---|---|---|
| **P0 地基** ✅ | `ui/tokens.ts` + `ui/style.ts` + `ui/index.ts`；宿主 alias / 字号 / 圆角 / 焦点已核实完毕（见 [`external/dsh-capabilities.md`](external/dsh-capabilities.md)） | 一套 token + 一个注入器；**不迁任何调用点** ⇒ 界面零变化 | ✅ 已落码（2026-10-01，冒烟 372/0；「`--tdt-` 只在一处定义」等 6 项断言见 worklog §八） |
| **P1a 分段控件·三处自绘** ✅ | 3 处自绘 → 1 个 `Segmented` | 主面板三 tab / 列表筛选 tabs（带角标）/ 卡片三面板 | ✅ 已落码（2026-10-01，冒烟 376/0；4 项正/反断言见 worklog §九） |
| **P1b 分段控件·其余 4 类** ✅ | 编辑器官方覆写 ×3 + 星期多选 + 版本开关 + 预览两态 → 同一个 `Segmented` | `Segmented` 增补 `multiple`（星期）与「版本开关并入（multiple 单段）」；统一皮肤抄「版本」观感、去外描边 | ✅ 已落码（2026-10-01，冒烟通过）；反断言：旧类名 `dsh-tdt-ed-histtoggle-seg` / `dsh-tdt-sv-seg` 消失；明暗双主题一致 |
| **P2 按钮 + 图标钮** | 15+ 套 → 3 variant × 2 size | `Button` / `IconButton` | 各页面按钮外观归一 |
| **P3 输入 + 下拉** | 3 套 CSS + 3 处原生 + 官方 2 处 → 1 套 | `Field`（Input / Select / PrefixedInput） | 高度只剩两档 |
| **P4 开关 + 日期时间 + 浮层** | 开关 2 处重复覆盖合并；日期时间全内联转皮肤；卡/浮层/Toast 归一 | `SwitchToggle` / `DateTime` / 容器皮肤 | 明暗特判只剩 token 层 |
| **P5 收尾** | 删 3 份 `C` 表 → 0；内联数值字面量清零；注释与代码对齐（现状清单见 [`../worklog/ui-foundation.md`](../worklog/ui-foundation.md) §六） | 干净的基础层 | 冒烟反例断言全绿 + `npm run typecheck` |

**每期通用纪律**（照 [`ui-style-guide.md`](ui-style-guide.md) 执行）：`npm run build` → `npm run smoke` → `npm run typecheck` → 明暗双主题真机走查 → 回写 PROGRESS/worklog。

---

## 八、每期验收标准

1. **正向冒烟**（bundle 断言，现有冒烟已擅长）：`--tdt-control-h-sm`、`dsh-tdt-seg__item`、`TdtSegmented` 等唯一实现标识存在于 `dist/client.js`。
2. **反向冒烟**（防回归，关键）：旧的重复实现标识**消失**，例如：
   - `!clientJs.includes('dsh-tdt-ed-histtoggle-seg')`（版本开关旧自绘类消失；根 id `dsh-tdt-ed-histtoggle` 保留在统一 Segmented 上）
   - `!clientJs.includes('dsh-tdt-sv-seg')`（预览两态并入分段）
   - 业务文件里 `--dsw-alias-` / `body[data-ds-dark-theme]` 出现 **0 次**（用仓库搜索工具直接查，比断言更硬）。
3. **明暗双主题**：每个迁移期都必须在「明色」与「暗色」两种宿主主题下各走查一遍关键界面（用户当前主题偏暗，暗色下的对比度是重点）。
4. **两档高度硬约束**（§4.3）：段高只允许两档 —— 检查方式是 `search_content` 段高字面量（`height:2Npx` 之类）在业务文件里为 0。

---

## 九、不做的事（边界）

- **不引入 CSS 框架 / 样式库 / CSS-in-JS 运行时**（体积 + 与宿主 token 体系打架）。
- **不自造一套主题色**：颜色一律来自宿主 alias；插件的 `--tdt-*` 只是**语义命名层**，不是第二套调色板。
- **不改构建链**（§六）。
- **不重排现有界面结构 / 布局**：本专项只统一「同一控件的皮肤与尺寸」，谁在哪儿、多大间距不动。
- **不动会话弹窗里「镜像官方样式」的部分**：那部分继续照 [`session-view-ui-map.md`](external/session-view-ui-map.md) 做（边界说明见 [`../worklog/ui-foundation.md`](../worklog/ui-foundation.md) §六「与既有文档的边界」）。

---

---

## 十、通用细则（层级 / 焦点 / 图标 / 动效 / 溢出 / 滚动 / 间距 / 状态）

| 项 | 规则 |
|---|---|
| **层级 z-index** | 只在 token 层集中定义（`--tdt-z-*`），**业务文件不许写裸数字**。档位（自下而上）：内容层吸附（`--tdt-z-sticky`）→ 页面内容 → 页面级 dock → 抽屉遮罩 / 抽屉面板 → 弹窗 / 确认框 → 浮层菜单 → Toast。新增浮层先查是否已有档位，够用就不许新开 |
| **焦点** | 所有可交互元素必须可键盘聚焦且有可见焦点环（用 `--tdt-focus`，走 `:focus-visible`）；**不许 `outline:none` 而不给替代** |
| **图标** | 一律用官方 `Icon*` 组件；尺寸只取 **14 / 16 / 18 / 20** 四档；纯图标按钮**必须**有可读标签（官方 `Tooltip` + `aria-label`）—— ⚠️ Tooltip 的子元素必须是**真 DOM**（裸函数组件 ref 挂不上、提示静默失效）。**图标 / 徽标这类「只有形状没有文字」的元素，悬停提示用官方 `Tooltip`，不用原生 `title`**（原生提示延迟约 1 秒，用户 2026-10-04 明确「太慢」；执行记录页折叠态的圈码即按此从原生 `title` 改成官方 `Tooltip`）。⚠️ **一律用官方 `Tooltip`，不许用原生 `title`**（含被省略号截断的任务名 / 备注 / 完整时刻 —— 用户 2026-10-05：原生提示延迟约 1 秒，太慢） |
| **加载指示** | **全站只有页面右下角那一个**（基础层 `Loading`，锚在 `PANEL_CONTENT_ID`）：首屏 / 下拉续拉都走它；任何页面、子面板**不许另建**加载点，也**不许显示任何加载文案**（「加载中」「Loading」这类字都不要）—— 还在加载就让它**空着**（用户 2026-10-05 定为硬性规定）。「已加载完 / 到上限」这类**结果提示**不算加载点，可就地显示 |
| **字段宽度** | 调用点**不许写死** `width`：下拉 / 日期框 / 时分框都走基础层默认（`inline-flex` ⇒ **刚好把内容显示完**，「不要长也不要短」）；确需定长就在基础层一处定（用户 2026-10-04） |
| **文件显示（硬性规定）** | 任何**只显示图标、没显示文件名**的地方（附件 / 产出物 / 交付物 …），悬停**必须**把**文件名（含后缀）**显示出来，提示走官方 `Tooltip`；打不开时图标也不可点（不给假入口）（用户 2026-10-05 定为硬性规定） |
| **动效** | 时长 / 缓动走 `--tdt-dur` / `--tdt-ease`；**必须尊重 `prefers-reduced-motion: reduce`**（关掉位移 / 脉动类动画） |
| **文本溢出** | 单行溢出用 `text-overflow:ellipsis`（配 `min-width:0`）；确实需要看全的用跑马灯（`MarqueeText`，**只在自己盒子里滚，不许盖住同行图标**） |
| **滚动容器** | 内容长度会变的面板给**固定最大高度 + 内部滚动**（如卡片展开区 360px），避免切换 tab 时卡片高度跳动 |
| **间距** | 只取 `--tdt-space-1..4`（4 / 8 / 12 / 16px）；**不许出现 5 / 7 / 9px 这类** |
| **状态呈现** | 空态 / 加载中 / 错误三种都必须有明确呈现（不许白屏或留空白）；错误态用 `--tdt-danger` 文本 + 给出一个可操作的出口（重试 / 返回） |
