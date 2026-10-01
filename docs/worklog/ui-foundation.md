# 工作包：UI 基础层统一（design token + 组件皮肤）

> **状态**：🚧 **进行中**（2026-10-01 起）· 当前阶段 = **方案文档已起草、待用户拍板**；**未改任何源码**（用户明确「你先不要动」）
> **来源**：用户 2026-10-01 口述需求（三张分段控件截图 + 口述「滑动块 / button / 下拉 / input / 日期时间 / switch 全是这样」）
> **产出文档**：[`design/ui-foundation.md`](../design/ui-foundation.md)（技术方案）· [`design/ui-style-guide.md`](../design/ui-style-guide.md)（开发手册）

---

## 一、需求原话（用户，逐字保留）

> 现在这个项目的样子简直乱得可怕。你看我这个图片，一个滑动块、一个 button、一个下拉框，每个地方都在写自己的样式。
> 我的计划是先来把样式统一了。以滑动块为例，我们有的滑动块是在纯黑背景下，有的是在偏灰的背景下。我认为这两个滑动块的样式应该是完全一样的，只是颜色可以重载一下，因为它们下面的颜色稍微有点不一样。
> 1. 定义一个最基础的滑动块样式。2. 再抽象出一个样式（比如浅一点的滑动块），去覆盖其中的某两个颜色。3. 以后前端在所有需要用的地方，都直接使用这两个定义就可以了。
> 关于高度问题……(a) 基础样式只定义一个高度，用到的时候再单独去定义。(b) 把高度也统一起来，在基础样式里直接定义出两个或三个高度……其实高度也应该只有一到两个规格。
> 我觉得 button 和下拉框也应该是一模一样的逻辑。然后包括什么 input 呀，输入框什么的。还有什么选日期选时间的。还有那个开关，switch。这些全是这样。
> 包括我在技术定义的时候，要考虑到用户选的风格，是深色的还是浅色的。
> 你先不要动，我们把这个做成一个专项去做，先给我补充一下做这个事情的文档。
> 我需要的是：1. 技术方案怎么设计：以后这个到底怎么抽象、放在哪。2. 形成开发文档：这个东西以后要形成一个开发的文档，文档怎么放。别以后我每次都来反复地说。

用户截图三处（均为分段控件）：① 主面板「任务配置 / 执行记录 / 调试」；② 任务列表「全部 / 已开启 / 已关闭 / 异常」；③ 卡片展开「基础信息 / 执行记录 / 日志」。

---

## 二、调研发现（2026-10-01，全仓只读盘点；每条都有出处）

### 2.1 样式交付方式的现状

- 全仓 **零 `.css` 文件**；CSS 全部以 TS 字符串产出，运行时注入 `<style>`（原因：client 产物是内核消费的 CJS 闭包，`import './x.css'` 不被加载 —— `task-editor-css.ts:3-4`、`archive-session-css.ts:3-5`、`toast-css.ts:4-5`）。
- **4 个 CSS 产出点 → 4 条 `<style>` 注入 → 5 处调用**：`task-editor-css.ts:144-153`、`archive-session-css.ts:349-358`、`toast-css.ts:79-88`、`task-list.tsx:106-137`；调用点 `task-editor.tsx:1391`、`index.ts:967`、`config-panel.tsx:76`、`task-list.tsx:1180-1182`、**`session-view.ts:553`（模块顶层立即执行）**。
- **style 标签 id 两套命名**：`dsh-task-dispatch-table-*`（3 个）vs 内联字面量 `dsh-tdt-list-style`（`task-list.tsx:108`）。
- 幂等实现三处有 `injected` 标志、`task-list.tsx` 那处只有一个 `getElementById` 判断。
- 注入顺序无保证 ⇒ 项目一贯靠「带元素 + role 提高特异性」对冲（`task-editor-css.ts:30`、`task-list.tsx:124`）。

### 2.2 类名与变量

- 类名前缀事实上统一为 `dsh-tdt-`，但**没有前缀常量**，全是字面量（`task-editor.tsx` 94 处、`archive-session-css.ts` 256 处、`file-browser.tsx` 55 处）；子域：`-ed-` / `-sv-` / `-tl-` / `-toast` / `-mq` / `-run-blocks`。
- 已定义的插件级自定义属性仅 5 组：`--dsh-tdt-preview-w`（`index.ts:974` / `:573` 写入）、`--dsh-tdt-mq-dist|dur`（`editor-fields.tsx:700` 写入）、`--tone`（`toast-css.ts:15`）、`--deliverable-fill|hover`（`archive-session-css.ts:321-322`）。**没有 token 层**。

### 2.3 主题（明暗）

- 颜色一律引用宿主 `--dsw-alias-*` / `--dsw-static-*` / `--dsw-radius-*` / `--ds-*`，宿主运行时注入、明暗自适应（`index.ts:139-142` 决策 26 修订的注释已结论）。
- **唯一显式明暗分支** = `body[data-ds-dark-theme]`，共 **7 处、全在一个文件**：`archive-session-css.ts:241,279,281,287,298,322,331`。
- 明确没有：`prefers-color-scheme`、`data-theme`、`.dark`、JS 读主题、插件自己的 `:root` 声明块。
- 设计令牌被抄成 **3 份 `C` 表**且兜底值不一致：`index.ts:143-160`(17 项)、`task-list.tsx:68-83`(14 项)、`editor-fields.tsx:39-59`(16 项，被 `file-browser.tsx:32` 复用)；例：`layer1` 兜底 `.10` vs `.08`，`danger` 兜底 `#c0392b` vs `#e5484d`。

### 2.4 「滑动块」（分段控件）10 处清单

| # | 位置 | 用途 | 实现 | 段高 / 选中底 |
|---|---|---|---|---|
| 1 | `index.ts:215-228` + `:996-1009` | 任务配置 / 执行记录 / 调试（截图 1） | 自绘 inline | 段 `padding 3px 12px`；轨道 layer2，选中 layer1 |
| 2 | `task-list.tsx:1252-1271` + `:1277-1283` | 全部 / 已开启 / 已关闭 / 异常（截图 2，带角标） | 自绘 inline | 段 `26px`；轨道 layer2，选中 layer1 |
| 3 | `task-list.tsx:722-732` + `:1084-1088` | 基础信息 / 执行记录 / 日志（截图 3） | 自绘 inline | 段 `padding 2px 10px`；轨道 **layer1**，选中 **layer3**（与 #2 不同，注释却自称「同一套观感」） |
| 4 | `task-editor.tsx:1097-1107` | 编辑 / 预览 | **官方** + `--seg` 覆写 | 覆写 `padding3` + 指示器算式 + 段 `22px` |
| 5 | `task-editor.tsx:1680-1704` | 单次 / 周期 / 间隔 | 官方 + 同上 | 同上 |
| 6 | `task-editor.tsx:1916-1922` | 重试次数四档 | **官方，未覆写** | 官方默认（28 高 / 13 字） |
| 7 | `task-editor.tsx:2053-2063` | 基础信息 / 执行记录 | 官方 + `--seg` | 同 #4 |
| 8 | `editor-fields.tsx:606-658` | 星期多选 | 自绘（官方只支持单选） | 段 `24px`；选中 `business` 蓝（用户主题下显绿） |
| 9 | `task-editor-css.ts:54-57` | 版本开关（单段） | 自绘 CSS 类 | 段 `22px`；轨道 hover 底，选中 layer1 |
| 10 | `archive-session-css.ts:237-241` | 预览 渲染 / 源码 | 自绘 CSS 类 | 段 `20px`；选中 `static-neutral-00` + 深色特判 neutral-900 |

**结论**：4 处官方 / 6 处自绘；段高 **5 种**（20/22/24/26/28）；选中底 **5 种**。

### 2.5 其它控件重复面

- **按钮 15+ 套**自绘（`index.ts:192-204,230-234`、`task-list.tsx:97-103,699-704`、`task-editor-css.ts:33,54,69,71,82,118`、`archive-session-css.ts:228,238,270,280,286`、`config-panel.tsx:174-183` …），官方 `Button` 只在编辑器里 12 处。
- **输入**：官方 `Input` 1 处（靠注入 CSS 从 32 压到 26）、CSS 自绘 3 套（`task-editor-css.ts:93,109,76`）、原生 3 处（`task-list.tsx:1010`、`config-panel.tsx:151`、`index.ts:164`）。
- **下拉**：官方 `Menu` 2 处、自绘浮层菜单 1 套（`archive-session-css.ts:277-283`）、原生 `<select>` 1 处（`task-list.tsx:932,1024`）。
- **开关**：官方 `Switch` 4 处调用，「选中 = success 绿」的覆盖写了**两遍**（`task-editor-css.ts:31`、`task-list.tsx:125`）。
- **日期 / 时间**：官方无此件（`primitives.d.ts:158-159`）⇒ 自绘且**全部内联**（`editor-fields.tsx:304-443`、`459+`）。
- **内联数值字面量约 151 处**（高度/宽度/圆角/字号），分布 `task-list.tsx` 48 / `task-editor.tsx` 38 / `index.ts` 32 / `editor-fields.tsx` 18 / `config-panel.tsx` 14 / `session-view.ts` 1；高度 `26px` 约 10 处；字号散落 **7 档**（10~16px）。
- **硬编码颜色**：角标 `#fff`（`task-list.tsx:1267`）、保存钮 `#fff`（`config-panel.tsx:180`）、遮罩 `rgba(0,0,0,.45)`（`task-list.tsx:755`，全站其它遮罩走 `--dsw-alias-bg-mask-1`）。
- **注释与代码不一致**：`editor-fields.tsx:603-604`（说 padding4/gap2/段高28/字13；实为 6/3/24/12）。

### 2.6 构建与产物

- `npm run build` = `tsc`（宿主）+ `tsc --noEmit -p tsconfig.client.json && tsdown --config tsdown.client.config.ts`（客户端，单入口 → `dist/client.js`，CJS 闭包，`deps.neverBundle` = 9 个平台包）。
- `dist/client.js` 当前 **1.68 MB**、`dist/` 下**无任何 `.css`**。
- 冒烟 `scripts/smoke.mjs` 对 `dist/client.js` 做字符串断言（**可正可反** ⇒ 本专项的回归防线直接用它：`check('…', clientJs.includes('…'))` 与 `!includes`）。

### 2.7 宿主变量实测全表（2026-10-01 抓取，自证）

`grep -rhoE '\-\-(dsw|ds)-[a-z0-9-]+' src | sort | uniq -c | sort -rn` ⇒ 本仓实际引用 **约 60 个**宿主变量。高频：`label-primary`(44)、`label-secondary`(39)、`label-tertiary`(37)、`border-l2`(31)、`interactive-bg-hover`(30)、`state-error-primary`(19)、`radius-sm`(16)、`bg-layer-1`(15)、`bg-base`(13)。完整分组表见 [`design/ui-foundation.md`](../design/ui-foundation.md) §4.5。

抓取过程中**新发现三处疑点**（此前无人记录，且直接影响 token 层正确性）：

| # | 疑点 | 证据 |
|---|---|---|
| ① | `state-warn-primary`(2) 与 `state-warning-primary`(3) **并存且兜底值不同**（`#f5a623` vs `#e6a23c`） | `archive-session-css.ts:216`、`session-view.ts:1281`（warn，抄官方会话面）vs `toast-css.ts:63`、`task-editor.tsx:1034`（warning，插件自有）⇒ **必有一个是死变量**，警告色可能不随主题变 |
| ② | `focus-ring-color`(2) 与 `border-focus`(2) 并存 | `archive-session-css.ts:295` 等 |
| ③ | 宿主疑似有字号体系 | `--dsw-font-xxs-12`(1)、`--dsw-font-xs-13`(1)、`--dsh-content-font-size-secondary`(2)、`--dsw-font-markdown-code-block-small`(3) ⇒ 若成立，`--tdt-font-*` 应映射宿主而非自定 px |

方案据此做了一处**修正**：`--tdt-font-*` 由「自定 11/12/13/14px」改为「优先映射宿主排版 token，px 仅兜底」（foundation §4.3）。

---

## 三、本轮产出（只补文档，未改代码）

| 文档 | 层 | 内容 |
|---|---|---|
| [`design/ui-foundation.md`](../design/ui-foundation.md) | 定型 | 问题量化、四层架构、token 规格、控件皮肤两轴模型（size × variant）、官方件策略、注入方式、P0–P5 迁移分期、验收标准、明确不做的事、**待拍板 3 项**、**开工前必须先核实的 3 项源码事实**、文档体系落位 |
| [`design/ui-style-guide.md`](../design/ui-style-guide.md) | 定型 | 开发手册：决策树、唯一实现表、允许/禁止清单（逐条对应现状反例）、明暗规则、加档位/加变体流程、提交前自检、已知坑表 |
| 本文 | 叙事 | 需求原话 + 调研证据（上 §二） |

**未做**：未改任何源码、未改 `AGENTS.md`、未写 `decisions.md`（等拍板）、未下载宿主主题包（需授权）。

---

## 四、待用户拍板（阻塞 P0 开工）

用户在本轮对话中**未逐项勾选**（答复「继续」）⇒ 以下 A–C **按建议栏暂定执行**（已同步 foundation §十），D 未获授权、仍阻塞。

| # | 事项 | 暂定 |
|---|---|---|
| A | 高度方案 (a) / (b) | **(b) 收窄版**：token 两档 + `size` prop，调用点不许自定义高度 |
| B | 两档取值 | **sm 24 / md 28**（`md` 与官方分段一致，覆写最少） |
| C | P1 先动哪处 | **截图那三处**（主面板三 tab / 列表筛选 tabs / 卡片展开三面板，均自绘、风险最低） |
| D | 授权下载宿主主题包做源码核实 | ❌ **未授权**（`npm pack @deepseek-ai/dsh-client-ui-theme@<宿主版本>`，只解包读、不进仓库） |

## 五、开工前必须先核实（P0 前置，源码级）

1. 宿主主题包 `@deepseek-ai/dsh-client-ui-theme` 的 alias **全表**（本地 `node_modules/@deepseek-ai/` 只有 `cosmokit` / `schemastery`，UI 包不在本地）⇒ 需 `npm pack @deepseek-ai/dsh-client-ui-theme@<宿主版本>` 解包读 —— **下载写盘，需用户授权**。
2. 「明暗判据是否只有 `body[data-ds-dark-theme]`」—— 同上解包后溯源（现有 7 处特判从未溯源核实过）。
3. 官方 `SegmentedControl` 的指示器覆写算式是否保留 —— 决定「覆写官方」还是「自绘统一体」（方案倾向自绘，理由见 foundation §5.3）。
4. §2.7 三处疑点：`state-warn`/`state-warning` 哪个是真的、`focus-ring-color` / `border-focus` 哪个是真的、宿主是否真有字号体系 —— 前两项必有一个是死变量，token 层不能继承错误命名。

> 第 1/2/4 项同源于主题包的一次解包，**一次授权即可做完三项**；第 3 项需另解 primitives 包（同一次授权可一并做）。

---

## 六、从 `design/ui-foundation.md` 移出的过程内容（2026-10-01）

> 用户指出：设计文档里不该有"要解决的问题 / 目标 / 待拍板 / 待核实 / 下一步"——那些是工作包内容。以下原样保留（原文的 `design/ui-foundation.md` §一 §二 §十 §十一 §十二 §十三）。

## 一、要解决的问题（现状量化，全部有证据）

现在的界面不是「乱」，是**同一个控件被写了十几遍**：

| # | 问题 | 量化 | 证据 |
|---|---|---|---|
| 1 | **分段控件（用户说的「滑动块」）重复实现** | **10 处**：4 处用官方 `SegmentedControl`、**6 处自绘** | `index.ts:215-228`、`task-list.tsx:722-732`、`task-list.tsx:1252-1271`、`editor-fields.tsx:606-658`、`task-editor-css.ts:54-57`、`archive-session-css.ts:237-241` 等 |
| 2 | 同样的控件、**5 种段高** | 20 / 22 / 24 / 26 / 28px | 同上清单逐处实测 |
| 3 | 「选中底色」**5 种取值** | `layer1` / `layer2→layer1` / `layer1→layer3` / `business` / 白+深色特判 | 同上 |
| 4 | **设计令牌被抄成 3 份** `C` 表，同名键兜底值还不一致 | `index.ts:143-160`(17) / `task-list.tsx:68-83`(14) / `editor-fields.tsx:39-59`(16)；例：`layer1` 兜底 `rgba(128,128,128,.10)` vs `.08`，`danger` 兜底 `#c0392b` vs `#e5484d` | 三个文件对照 |
| 5 | **样式注入 4 条 `<style>`、5 处调用、2 套 id 命名**，无统一入口 | `task-editor-css.ts` / `archive-session-css.ts` / `toast-css.ts` / `task-list.tsx:106-137`；id 一套 `dsh-task-dispatch-table-*`、一套 `dsh-tdt-list-style` | 各文件 `ensure*Style()` |
| 6 | **内联数值字面量约 151 处**，字号散落 7 档 | 高度 `26px` 一处一处写（约 10 处）；字号 10/11/12/13/14/15/16px | `task-list.tsx` 48 / `task-editor.tsx` 38 / `index.ts` 32 / `editor-fields.tsx` 18 / `config-panel.tsx` 14 |
| 7 | **按钮皮肤 15+ 套**、输入框 3 套 + 原生 3 处、下拉 3 套 | 见 §五 唯一实现表 | 调研明细见 worklog §二 |
| 8 | **明暗主题特判散在业务文件里** | `body[data-ds-dark-theme]` **7 处**，全在 `archive-session-css.ts:241,279,281,287,298,322,331`；同为「自绘浮层要白/黑底」，另一批却走 `--dsw-alias-bg-base`（两套解法并存） | 同左 |
| 9 | 注释与代码不一致，**后来人照着注释改必错** | `editor-fields.tsx:603-604` 写「padding 4 / gap 2 / 段高 28 / 字 13」，代码是 `padding 6 / gap 3 / 段高 24 / 字 12` | 同左 |
| 10 | 硬编码白色/黑色绕过 token | 角标 `color:'#fff'`（`task-list.tsx:1267`）、保存钮 `color:'#fff'`（`config-panel.tsx:180`）、遮罩 `rgba(0,0,0,.45)` 硬编码（`task-list.tsx:755`） | 同左 |

**根因**（一句话）：**没有「控件」这一层**——每次要做界面，就在使用点直接写一套样式。所以加一处界面 = 多一份实现，改一次观感 = 找齐 N 处改 N 次。

---

## 二、目标（用户原话 → 可验收目标）

用户原话（2026-10-01，逐字保留）：

> 我认为这两个滑动块的样式应该是完全一样的，只是颜色可以重载一下，因为它们下面的颜色稍微有点不一样。
> 我的想法是：1. 定义一个最基础的滑动块样式。2. 再抽象出一个样式（比如浅一点的滑动块），去覆盖其中的某两个颜色。3. 以后前端在所有需要用的地方，都直接使用这两个定义就可以了。
> 关于高度问题……(a) 基础样式只定义一个高度，用到的时候再单独去定义。(b) 把高度也统一起来，在基础样式里直接定义出两个或三个高度……其实高度也应该只有一到两个规格。
> 我觉得 button 和下拉框也应该是一模一样的逻辑。然后包括什么 input 呀，输入框什么的。还有什么选日期选时间的。还有那个开关，switch。这些全是这样。
> 包括我在技术定义的时候，要考虑到用户选的风格，是深色的还是浅色的。

| 目标 | 可验收标准 |
|---|---|
| **G1 一类控件只有一个实现** | 全仓「分段控件」的实现点 = 1（其余 9 处改为调用它），按钮 / 输入 / 下拉 / 开关 / 日期时间同理 |
| **G2 差异走「两个颜色」而不是复制样式** | 变体只覆盖 1–3 个 token 变量，结构/尺寸/交互规则零重复 |
| **G3 高度收敛为 1–2 档** | 段高只剩 `sm` / `md` 两档；新增第三档必须改基础层并评审（见 ui-style-guide §五） |
| **G4 明暗自适应、且明暗差异只写一次** | 业务文件（`task-list.tsx` / `task-editor.tsx` / `index.ts` / `config-panel.tsx` / `file-*.tsx`）里 `--dsw-*` 与 `body[data-ds-dark-theme]` 出现次数 = **0**，全部经 token 层 |

---

## 十、待用户拍板（3 项）

> ⚠️ 用户在本轮对话中**尚未逐项勾选**（答复为「继续」）。为使后续调研不空转，下文按「建议」栏**暂定执行**，并在 `worklog/ui-foundation.md` 记为「暂定」；**用户拍板后转正并更新本节**。

| # | 事项 | 选项 | 建议 | 暂定 |
|---|---|---|---|
| **A** | 用户提的高度方案 (a) 还是 (b) | (a) 基础只定一个高度、各处单独定 ／ (b) 基础里直接定 2–3 档高度 | **取 (b) 的收窄版**：token 定两档 `sm/md`，组件用 `size` prop 选；**任何调用点不许自定义高度**（纯 (a) 会立刻退化成今天这样；纯 (b) 又不给你「这一个地方要矮一点」的表达） | **(b) 收窄版** |
| **B** | 收敛后的两档高度取值 | ① `sm=24 / md=28`（`md` 与官方 `SegmentedControl` 一致，覆写最少） ② `sm=26 / md=32`（贴现有列表 26 / 官方 Input 32） | ① —— 与官方对齐的档位越多，需要覆写的官方样式越少 | **24 / 28** |
| **C** | P1 先动哪一处 | ① 先动三张截图那三处分段控件 ② 先动编辑器里的官方件覆写 | ① —— 正是用户点名的地方，且都是自绘、风险最低 | **截图那三处** |
| **D** | 是否授权下载宿主主题包做源码核实 | ① 授权（`npm pack @deepseek-ai/dsh-client-ui-theme@<宿主版本>`，只解包读、不进仓库） ② 暂不授权 | ① —— §十一 四项核实全部依赖它，不核实就写 token 等于猜 | ❌ **未授权**，仍阻塞 |

---

## 十一、动手前必须先核实的事实（P0 前置）

| # | 待核实 | 怎么核实 | 为什么必须先做 |
|---|---|---|---|
| 1 | 宿主主题包 alias **全表**（`--dsw-alias-*` / `--dsw-static-*` / `--dsw-radius-*` / `--dsw-elevation-*` 名称与语义） | 本地 `node_modules/@deepseek-ai/` **没有** UI 包 ⇒ 需 `npm pack @deepseek-ai/dsh-client-ui-theme@<宿主版本>` 解包读 `lib/*.css` / `lib/*.js`（**下载写入磁盘，需用户授权**） | token 表要照它写，猜错名字 = 全站颜色失效 |
| 2 | 「明暗判据」是否只有 `body[data-ds-dark-theme]` | 上一步解包后全局搜该属性在官方主题包里的定义 | 现有 7 处特判都依赖它，但从未溯源核实过 |
| 3 | 官方 `SegmentedControl` 覆写算式（`--dsh-segment-count/index`）是否值得保留 | 读 primitives 包 `SegmentedControl.module.css` | 决定「覆写官方」还是「自绘统一体」（本方案倾向自绘，见 §5.3） |
| 4 | **§4.5 三处疑点**：`state-warn-primary` vs `state-warning-primary`、`focus-ring-color` vs `border-focus`、宿主是否真有字号体系（`--dsw-font-xxs-12` / `--dsw-font-xs-13`） | 同第 1 项解包后全局搜；字号体系另查 `--dsw-font-*` 全族 | ①② 必有一个是死变量（不随主题变）⇒ token 层不能继承错误命名；③ 决定 `--tdt-font-*` 是映射宿主还是自定 px |

> 依 [`AGENTS.md`](../../AGENTS.md) 第二条：涉及宿主接口**先读源码再动手**，禁止靠真机试探猜 API。上表第 1–4 项即本专项的「先读源码」动作，**必须在 P0 开工前完成**。
> 第 1/2/4 项同源于一次解包 ⇒ **一次授权即可做完三项**；第 3 项需另解 primitives 包（同一次授权可一并做）。

---

## 十二、文档体系落位（用户第二问）

| 内容 | 落哪 | 说明 |
|---|---|---|
| **技术方案与规格**（本文） | `docs/design/ui-foundation.md` | 定型层；长命 |
| **开发手册**（写界面时照做） | [`docs/design/ui-style-guide.md`](../design/ui-style-guide.md) | 定型层；**「以后每次都照这个做」的那一份** |
| 过程与调研证据 | [`docs/worklog/ui-foundation.md`](../worklog/ui-foundation.md) | 叙事层；做完封卷、不再修改 |
| 进度与未决 | [`docs/PROGRESS.md`](../PROGRESS.md) | 现场层；未决项编号 **U18** |
| 拍板结论 | **归属文档**（功能 / 样式各自的文档） | **待用户拍板后**直接写进归属文档，只留结论与理由；不另建决策文件 |
| agent 强制入口 | `AGENTS.md` 第二条（本仓库独有约定）加一条「新增 UI 一律走 `src/client/ui/` 基础层」 | ⚠️ **改 AGENTS.md 需用户单独授权**，本轮未改 |

**与既有文档的边界**（防止两份副本）：

- [`session-view-ui-map.md`](../design/external/session-view-ui-map.md) 管的是「**会话弹窗里镜像官方 UI**」——那是照抄宿主元素，属另一件事，继续照它做。
- 本文管的是「**插件自有 UI**」——自有控件的皮肤、尺寸、token。两者在预览面板一处会碰面（预览顶栏分段控件）：结构归本文，镜像官方的行为细节归 ui-map。

---

## 十三、下一步（待拍板后）

1. 用户拍板 §十 的 A / B / C。
2. 完成 §十一 的三项源码核实（需授权下载宿主主题包）。
3. 立 P0：写 `ui/tokens.ts` + `ui/style.ts`（不改任何调用点，build 绿即可）。
4. 按 P1 开工分段控件，走一遍完整验收（冒烟正反断言 + 明暗双主题真机）。
