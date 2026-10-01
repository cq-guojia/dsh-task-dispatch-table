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
| **官方件观感覆盖** | `src/client/ui/official-skins.ts` | 官方 `Switch`/`Input`/`Menu`/`SegmentedControl` |
| **样式注入入口（唯一）** | `src/client/ui/style.ts` | 所有 `*-css.ts` 在此注册 |
| **公用控件组件** | `src/client/ui/{Segmented,Button,Field,SwitchToggle,DateTime}.tsx` | L3 使用点 |
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
| `--tdt-fg-inverse` | `--dsw-alias-label-primary-inverted` | 反色面上的字（角标、实心钮） |
| `--tdt-fg-4` | `--dsw-alias-label-caption` | 最弱一级文字（时间戳 / 分隔点；官方会话面已用 8 处） |
| `--tdt-surface-1` / `-2` / `-3` | `--dsw-alias-bg-layer-1 / -2 / -3` | 三层面 |
| `--tdt-surface-raised` | `--dsw-alias-bg-layer-1` + `--dsw-elevation-soft` | 「选中亮片」底盘 |
| `--tdt-surface-sunken` | `--dsw-alias-interactive-bg` | 下沉轨道底 |
| `--tdt-border` / `-strong` / `-faint` | `--dsw-alias-border-l2 / -l3 / -l1` | 描边三级 |
| `--tdt-accent` | `--dsw-alias-brand-primary` | 品牌强调 |
| `--tdt-success` / `--tdt-danger` | `--dsw-alias-state-success/error-primary` | 语义色 |
| `--tdt-warning` | `--dsw-alias-state-warning-primary` ⚠️ **命名未核实** | 警告色（同义变量 `state-warn-primary` 并存，见 §4.5 疑点 ①） |
| `--tdt-hover` / `--tdt-active` | `--dsw-alias-interactive-bg-hover / -active` | 交互底 |
| `--tdt-mask` | `--dsw-alias-bg-mask-1` | 遮罩 |
| `--tdt-shadow-1` / `-2` | `--dsw-elevation-soft` / `--dsw-shadow-lv3` | 浮层投影 |
| `--tdt-focus` | `--dsw-focus-ring-color` ⚠️ **命名未核实** | 键盘焦点环（同义变量 `--dsw-alias-border-focus` 并存，见 §4.5 疑点 ②） |

> ⚠️ **未核实**：宿主题包 `@deepseek-ai/dsh-client-ui-theme` 的 alias **全表**尚未在本仓留下记录（本地 `node_modules/@deepseek-ai/` 只有 `cosmokit`/`schemastery`，宿主 UI 包不在本地）⇒ 需 `npm pack @deepseek-ai/dsh-client-ui-theme@<宿主版本>` 读一遍，补齐上表并确认拼写。**开工前必须先补**（前置项见 [`../PROGRESS.md`](../PROGRESS.md) 未决项 U18）。
> 在此之前，§4.5 给出的是**本仓实测正在用的变量全表**（可自证，能覆盖 90% 的 token 设计需求）。

### 4.3 几何 / 排版 / 动效 token

| token | 建议值 | 说明 |
|---|---|---|
| `--tdt-radius-xs` / `-sm` / `-md` / `-lg` | 4 / 6 / 8 / 10px（绑 `--dsw-radius-sm/md/lg`） | 收敛现有 4/6/7/8/10/12 六种 |
| `--tdt-font-1` / `-2` / `-3` / `-4` | **优先映射宿主排版 token**：`--dsw-font-xxs-12` / `--dsw-font-xs-13` / `--dsh-content-font-size-secondary` / `--dsw-font-markdown-code-block-small`（px 只作兜底） | 收敛现有 10~16px 七档；**宿主自带字号体系 ⇒ 不自己定 px 刻度**（见 §4.5） |
| `--tdt-control-h-sm` / `-md` | **未定**（暂按 24 / 28px） | 全站只此两档高度 |
| `--tdt-space-1` / `-2` / `-3` / `-4` | 4 / 8 / 12 / 16px | 间距四拍 |
| `--tdt-dur` / `--tdt-ease` | `--ds-transition-duration` / `--ds-ease-in-out` | 动效 |

### 4.4 明暗两段的写法

```css
/* tokens.ts（示意） */
.dsh-tdt-scope{
  --tdt-fg: var(--dsw-alias-label-primary,#1f2328);
  --tdt-surface-sunken: var(--dsw-alias-interactive-bg,rgba(128,128,128,.14));
  /* …上表全部… */
  /* 只有 alias 表达不了的「固定中性面」才在这里写默认段 */
  --tdt-neutral-card: var(--dsw-static-neutral-50,#f5f5f5);
}
body[data-ds-dark-theme] .dsh-tdt-scope{
  --tdt-neutral-card: var(--dsw-static-neutral-850,#2a2a2a);
}
```

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

**三处疑点（P0 必须查清，否则 token 层会继承错误）**：

| # | 疑点 | 证据 | 影响 |
|---|---|---|---|
| ① | `state-warn-primary` 与 `state-warning-primary` **并存**，兜底值还不同（`#f5a623` vs `#e6a23c`） | `archive-session-css.ts:216` / `session-view.ts:1281`（warn，抄官方会话面）vs `toast-css.ts:63` / `task-editor.tsx:1034`（warning，插件自有） | 必有一个是**死变量**（取兜底值、不随主题变）⇒ 警告色在明暗主题下可能不跟随 |
| ② | `focus-ring-color` 与 `border-focus` 并存 | `archive-session-css.ts:295` / `task-editor-css.ts:97(用 business)` vs `official-classes` 等 | 焦点环在两处可能不同色 |
| ③ | 宿主疑似有**字号体系**（`--dsw-font-xxs-12` / `--dsw-font-xs-13` / `--dsh-content-font-size-secondary`） | `archive-session-css.ts:139,140,115`、`mirror/TurnTriggerNodeView.tsx:5` 注释 | 若成立 ⇒ `--tdt-font-*` 应**映射宿主字号 token**，不该自己定 px（见 §4.3） |

---

## 五、控件皮肤规格（L2）：两轴模型

用户说的「基础 + 覆盖某两个颜色」在工程上就是：**结构一套 + 两个受控轴（size / variant）**。

### 5.1 分段控件

```css
/* 基础：结构 + 交互 + 两档高度，全部唯一 */
.dsh-tdt-seg{display:inline-flex;align-items:center;gap:2px;padding:2px;
  border-radius:var(--tdt-radius-md);background:var(--seg-track);border:1px solid var(--tdt-border);}
.dsh-tdt-seg__item{height:calc(var(--tdt-control-h-sm) - 6px);padding:0 10px;
  border:0;border-radius:var(--tdt-radius-sm);font-size:var(--tdt-font-2);
  color:var(--tdt-fg-2);background:transparent;cursor:pointer;}
.dsh-tdt-seg__item[aria-pressed='true']{background:var(--seg-thumb);color:var(--tdt-fg);font-weight:600;}
.dsh-tdt-seg--md .dsh-tdt-seg__item{height:calc(var(--tdt-control-h-md) - 6px);}

/* 变体：**只覆盖两个颜色变量** —— 这正是用户说的「颜色重载」 */
.dsh-tdt-seg{--seg-track:var(--tdt-surface-2);--seg-thumb:var(--tdt-surface-raised);}
.dsh-tdt-seg--inset{--seg-track:var(--tdt-surface-1);--seg-thumb:var(--tdt-surface-3);}
```

对应到用户截图的三处（**同一份基础样式，只换 variant**）：

| 位置 | 现在 | 收敛后 |
|---|---|---|
| 主面板「任务配置 / 执行记录 / 调试」（截图 1） | `index.ts:215-228` 自绘 | `<TdtSegmented size="sm" variant="default">` |
| 任务列表「全部 / 已开启 / 已关闭 / 异常」（截图 2，带角标） | `task-list.tsx:1252-1271` 自绘 | `<TdtSegmented size="sm" variant="default" badge>` |
| 卡片展开「基础信息 / 执行记录 / 日志」（截图 3） | `task-list.tsx:722-732` 自绘（底色却与上面不同） | `<TdtSegmented size="sm" variant="inset">` |
| 编辑器「编辑 / 预览」「单次 / 周期 / 间隔」「基础信息 / 执行记录」 | 官方件 + `--seg` 覆写（指示器算式脆弱） | 同一个 `TdtSegmented`（不再覆写官方指示器） |
| 星期选择（多选，官方不支持） | `editor-fields.tsx:606-658` 自绘 | `TdtSegmented multiple` |
| 版本开关（单段） | `task-editor-css.ts:54-57` 自绘 | `TdtSegmented variant="raised"`（或 `TdtToggle`） |
| 预览「渲染 / 源码」 | `archive-session-css.ts:237-241` 自绘 + 深色特判 | `TdtSegmented size="sm" variant="default"`（不再需要深色特判） |

### 5.2 其它控件

| 控件 | variant 轴 | size 轴 | 唯一实现位置 |
|---|---|---|---|
| 按钮 | `primary` / `outline` / `ghost` / `danger` | sm / md | `Button.tsx` + `controls-css.ts`（现 15+ 套） |
| 图标钮 | `plain`（默认）/ `danger`（hover 变红） | 26 / 28（绑 `--tdt-control-h-*`） | 同上（现 5+ 套） |
| 输入框 | `default` / `error`（描红） | md（32）/ sm（26） | `Field.tsx`（现 3 套 CSS + 3 处原生） |
| 下拉 | `default` / `form`（表单行）/ `filter`（筛选行） | 同上 | `Field.tsx`（包装官方 `Menu`；现官方 2 处 + 自绘浮层 1 套 + 原生 select 1 处） |
| 开关 | `success`（唯一，选中 = success 绿） | 官方尺寸 | `SwitchToggle.tsx`（现两处重复覆盖：`task-editor-css.ts:31` / `task-list.tsx:125`） |
| 日期 / 时间 | `calendar` / `time` | 32 | `DateTime.tsx`（官方无此件，自绘；现 `editor-fields.tsx:304-443`、`459+` 全内联） |
| 浮层容器（卡 / 弹层 / Toast） | `card` / `popover` / `toast`（四档语义色沿用现有 `FloatingToast`） | — | `controls-css.ts` + 现有 `toast-css.ts` 并入 |

### 5.3 官方件策略（**优先用官方的，但观感只覆盖一次**）

- **优先官方件**：`Switch` / `Input` / `Menu` / `SegmentedControl` / `Button` / `Tooltip` / `Modal` / `StateDot` —— 它们自带明暗自适应与可访问性，能用就用（官方 `SegmentedControl` 只支持单选 ⇒ 多选场景自绘）。
- **覆盖集中一处**：官方件的观感偏差（如「Switch 打开要绿」「Input 高度 32→26」）只在 `official-skins.ts` 写一次；选择器统一带 `role` / 标签提升特异性（现有两条注释已确立的做法：`task-editor-css.ts:30`、`task-list.tsx:124` —— 与注入顺序无关）。
- **已知覆盖限制**（写进手册，避免再踩）：
  - `SegmentedControl` 指示器靠 `--dsh-segment-count/index` 算位置 ⇒ 外部改 padding 必须同步改算式（`task-editor-css.ts:101-105` 注释已自认脆弱）⇒ **新体系不再覆写官方指示器，改自绘统一体**。
  - `Input`：`className` 落外层 `.wrap`、`style` 落内层 `<input>`（`primitives.d.ts:172`）。
  - `Modal`：`className` 只落 `.dialog`，抬不了整层 `.root`(z1000) ⇒ 编辑器故意不用官方 Modal（`task-editor.tsx:977-979`）。
  - 官方类名是 CSS-module 哈希，**不许写死**，只能按元素 + role 选（`official-classes.ts` 的 `ocOr` 二选一语义已有踩坑记录）。

---

## 六、样式交付方式：沿用「运行时注入」，只统一入口

- **不改构建链**：client 产物是内核消费的 CJS 闭包，`import './x.css'` 不会被加载（`task-editor-css.ts:3-4` 等三处注释已结论），CSS 只能作为字符串运行时注入 `<style>`。引入 CSS 构建插件收益小、回归面大 ⇒ **维持现状**。
- **改的是入口**（消除现有 4 条注入 / 5 处调用 / 2 套 id）：
  - 单一 `style.ts`：`ensureUiStyles()` 幂等、单一 style 标签 id（`dsh-task-dispatch-table-ui`），按域注册（`tokens` / `controls` / `official` / `domain:editor` / `domain:session-view` / `domain:toast`）。
  - 删掉 `session-view.ts:553` 的**模块顶层**注入与 `task-list.tsx` 的局部注入/局部 id。
  - 过渡期允许老样式表暂时各留一条 `<style>`，但**统一由 `style.ts` 注册**，不再各处自己 `createElement`。

---

## 七、迁移分期

| 期 | 范围 | 产出 | 验收 |
|---|---|---|---|
| **P0 地基** | `ui/tokens.ts` + `ui/style.ts`；核实宿主 alias 全表（§十一） | 一套 token + 一个注入器；**不迁任何调用点** | `npm run build` 后 bundle 里 `--tdt-` 只在一处定义 |
| **P1 分段控件**（第一优先） | 10 处 → 1 个 `TdtSegmented` | 三张截图那三处 + 编辑器四档 + 星期 + 版本开关 + 预览两态 | 截图三处在明暗两主题下与现状一致；冒烟有正/反断言 |
| **P2 按钮 + 图标钮** | 15+ 套 → 3 variant × 2 size | `Button` / `IconButton` | 各页面按钮外观归一 |
| **P3 输入 + 下拉** | 3 套 CSS + 3 处原生 + 官方 2 处 → 1 套 | `Field`（Input / Select / PrefixedInput） | 高度只剩两档 |
| **P4 开关 + 日期时间 + 浮层** | 开关 2 处重复覆盖合并；日期时间全内联转皮肤；卡/浮层/Toast 归一 | `SwitchToggle` / `DateTime` / 容器皮肤 | 明暗特判只剩 token 层 |
| **P5 收尾** | 删 3 份 `C` 表 → 0；内联数值字面量清零；注释与代码对齐（§一 第 9 条） | 干净的基础层 | 冒烟反例断言全绿 + `npm run typecheck` |

**每期通用纪律**（照 [`ui-style-guide.md`](ui-style-guide.md) 执行）：`npm run build` → `npm run smoke` → `npm run typecheck` → 明暗双主题真机走查 → 回写 PROGRESS/worklog。

---

## 八、每期验收标准

1. **正向冒烟**（bundle 断言，现有冒烟已擅长）：`--tdt-control-h-sm`、`dsh-tdt-seg__item`、`TdtSegmented` 等唯一实现标识存在于 `dist/client.js`。
2. **反向冒烟**（防回归，关键）：旧的重复实现标识**消失**，例如：
   - `!clientJs.includes('dsh-tdt-ed-histtoggle')`（版本开关并入分段）
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
- **不动会话弹窗里「镜像官方样式」的部分**：那部分继续照 [`session-view-ui-map.md`](external/session-view-ui-map.md) 做（边界见 §十二）。

---

---

## 十、通用细则（层级 / 焦点 / 图标 / 动效 / 溢出 / 滚动 / 间距 / 状态）

| 项 | 规则 |
|---|---|
| **层级 z-index** | 只在 token 层集中定义（`--tdt-z-*`），**业务文件不许写裸数字**。档位（自下而上）：页面内容 → 页面级 dock → 抽屉遮罩 / 抽屉面板 → 弹窗 / 确认框 → 浮层菜单 → Toast。新增浮层先查是否已有档位，够用就不许新开 |
| **焦点** | 所有可交互元素必须可键盘聚焦且有可见焦点环（用 `--tdt-focus`，走 `:focus-visible`）；**不许 `outline:none` 而不给替代** |
| **图标** | 一律用官方 `Icon*` 组件；尺寸只取 **14 / 16 / 18 / 20** 四档；纯图标按钮**必须**有可读标签（官方 `Tooltip` + `aria-label`）—— ⚠️ Tooltip 的子元素必须是**真 DOM**（裸函数组件 ref 挂不上、提示静默失效） |
| **动效** | 时长 / 缓动走 `--tdt-dur` / `--tdt-ease`；**必须尊重 `prefers-reduced-motion: reduce`**（关掉位移 / 脉动类动画） |
| **文本溢出** | 单行溢出用 `text-overflow:ellipsis`（配 `min-width:0`）；确实需要看全的用跑马灯（`MarqueeText`，**只在自己盒子里滚，不许盖住同行图标**） |
| **滚动容器** | 内容长度会变的面板给**固定最大高度 + 内部滚动**（如卡片展开区 360px），避免切换 tab 时卡片高度跳动 |
| **间距** | 只取 `--tdt-space-1..4`（4 / 8 / 12 / 16px）；**不许出现 5 / 7 / 9px 这类** |
| **状态呈现** | 空态 / 加载中 / 错误三种都必须有明确呈现（不许白屏或留空白）；错误态用 `--tdt-danger` 文本 + 给出一个可操作的出口（重试 / 返回） |
