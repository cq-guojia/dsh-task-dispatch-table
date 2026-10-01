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

1. **高度方案**：用户提的 (a) / (b) —— 建议取 (b) 的收窄版（token 定两档 + 组件 `size` prop，调用点不许自定义高度）。
2. **两档取值**：`sm=24 / md=28`（建议，`md` 与官方分段一致）还是 `sm=26 / md=32`。
3. **P1 先动哪处**：建议先动用户截图那三处分段控件（自绘、风险最低）。

## 五、开工前必须先核实（P0 前置，源码级）

1. 宿主主题包 `@deepseek-ai/dsh-client-ui-theme` 的 alias **全表**（本地 `node_modules/@deepseek-ai/` 只有 `cosmokit` / `schemastery`，UI 包不在本地）⇒ 需 `npm pack @deepseek-ai/dsh-client-ui-theme@<宿主版本>` 解包读 —— **下载写盘，需用户授权**。
2. 「明暗判据是否只有 `body[data-ds-dark-theme]`」—— 同上解包后溯源（现有 7 处特判从未溯源核实过）。
3. 官方 `SegmentedControl` 的指示器覆写算式是否保留 —— 决定「覆写官方」还是「自绘统一体」（方案倾向自绘，理由见 foundation §5.3）。
