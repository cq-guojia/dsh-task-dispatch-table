# 工作包：U11 目录浏览器 UI 调优（2026-09-28 本轮四问）

> 归属：U11 产出物打开（决策 39）。预览 dock 内 `FileBrowser` 的面包屑/下拉树/文件名行的四轮反馈修复。
> 改动文件：`src/client/file-browser.tsx`（+ `archive-session-css.ts` 样式沿用）。

## 一、问题清单与处理

### 1. 目录态隐藏文件名行（用户 point1）
- **现象**：选了文件夹、没选文件时，下方「文件名 + 复制/刷新」一行空着没意义。
- **处理**：第二排（`dsh-tdt-sv-titlebar`）仅在 `viewing !== null`（文件预览态）渲染；目录态整排不渲染。
- **连带**：目录态失去刷新入口 ⇒ 在第一排导航钮里（`viewing === null` 时）补一个刷新钮，避免丢弃「刷新目录」能力。

### 2. 下拉选层菜单加层级缩进（用户 point2）
- **现象**：最左 `▾` 下拉只把文件夹自上而下平铺，看不出嵌套。
- **处理**：菜单项按层级 `paddingLeft: 8 + index*14` 缩进，并加树形连接符（根无前缀、`├ ` 中间项、`└ ` 当前项），直观表达「根 → … → 当前」。

### 3. 面包屑不超长时还原完整路径（用户 point3，疑似 bug）
- **现象**：路径超长折叠成「仅当前层名」后，跳到不超长的短文件夹仍只显示末段。
- **定位**：原隐藏测量条用裸 `<span>`（无 crumb 按钮的 `padding`/`max-width`），与可见态按钮宽度不一致，溢出判定不精确；且初始挂载若在 dock 宽度动画期（区域 0 宽）测得 `crumbsOverflow=true` 后无二次校正。
- **处理**：① 隐藏测量条改为渲染与可见态**同构的 crumb 按钮**，使 `scrollWidth` 与真实排版一致；② 溢出检测改用 `useLayoutEffect` 即时重算 + `ResizeObserver` 监听区域宽度变化（覆盖 dock 调宽 / 初次布局），不超长即还原完整路径。

### 4. json / sh 图标是否「瞎显示」（用户 point4，核实即可）
- **核实对象**：官方 `@deepseek-ai/dsh-client-ui-primitives@0.1.7-rc.2` 的 `FileTypeIcon`（`lib/index.js`）。
- **结论**：本插件**完全委托官方组件**（`h(FileTypeIcon, { path })`），自身不画任何文件图标。官方分类逻辑：
  - `json` ∈ `CODE_FILE_TYPE_SET` → `CodeFileIcon` 取 `CODE_FILE_ARTWORK["json"]`（圆角方块 + 官方 JSON 花括号字形 → 用户观感「圈儿」），**官方行为**。
  - `sh` → `EXTENSION_TYPES$1["sh"]="shell"` → `CodeFileIcon` 取 `CODE_FILE_ARTWORK["shell"]`（深色圆角方块 = 官方 Shell 标识 → 用户观感「方框」），**官方行为**。
  - 用户同时注意到官方自身不一致（部分层级是圈、部分 json 像 JS）——属官方素材问题，非我方。
- **处置**：**不动代码**。与用户「如果没问题就这么着」一致。MD 图标用户已确认无问题。

### 5. 代码预览「自动换行 / 取消换行」开关无效（用户 point5，本轮新增 bug）
- **现象**：右侧代码预览（CodeBlock）工具条上的「换行 ↔ 取消换行」图标钮点了完全没效果，代码始终不换行。
- **定位（读官方源码 `lib/index.js@0.1.7-rc.2`）**：`CodeBlock`（`lib/types/markdown/CodeBlock.js`）内部
  `const [localWrapped, setWrapped] = useState(true); const wrapped = wrap ?? localWrapped;`，并把
  `wrapped` 写到根节点的 `data-code-wrap` 属性上；当 `wrap === undefined`（代码文件我们正是这么传的）时，
  `onWrap` 绑定 `() => setWrapped(v => !v)`，所以**状态与属性翻转本身是对的**。问题在 CSS：控制换行的
  `[data-code-wrap='true'] .line { white-space: pre-wrap }` 规则**只存在于 `DiffBlock.module.css` /
  `ReadBlock.module.css` 模块**，而 markdown `CodeBlock` 自己的 CSS 模块（CodeCard）里 `data-code-wrap`
  计数为 **0**——即该属性挂上去了却没有任何 CSS 消费它 ⇒ 视觉上永远不换行、开关形同虚设。
- **处理**：不改官方包（不能改），改在我方预览外壳作用域内补一条跟随官方属性的 CSS。代码文件预览走
  `.dsh-tdt-sv-preview-coderender` 外壳，加：
  ```css
  .dsh-tdt-sv-preview-coderender [data-code-block-content]{overflow-x:auto;}
  .dsh-tdt-sv-preview-coderender [data-code-wrap='true'] [data-code-block-content],
  .dsh-tdt-sv-preview-coderender [data-code-wrap='true'] [data-code-block-content] pre,
  .dsh-tdt-sv-preview-coderender [data-code-wrap='true'] [data-code-block-content] code{white-space:pre-wrap;overflow-wrap:anywhere;}
  ```
  作用域限定在我方外壳，避免污染宿主其它 CodeBlock。默认 `localWrapped=true`（官方默认即换行），
  点开关 ⇒ `data-code-wrap` 在 `true/false` 间翻转 ⇒ 我方 CSS 跟随生效，换行 ↔ 横向滚动即时切换。
  md 源码态仍走 `wrap:true`（受控、隐藏工具条换行钮、按 prose 语义换行），不受影响。

## 二、验证
- `npm run typecheck` 通过；`npm run build` 通过（dist/client.js 266.49 kB → 本轮加换行 CSS 后 267.31 kB）；`npm run smoke` **172 项全过**。
- 真机复验点（2026-09-29 已核验通过）：① 目录态第二排消失、第一排有刷新；② `▾` 下拉层级缩进；③ 超长路径折叠、调窄 dock 或跳短路径即还原完整面包屑；④ 代码预览「换行」图标钮点了即时换行 ↔ 横向滚动切换。

## 三、提交状态
- 代码 + `dist/` 已就绪，**未推送**（用户本轮未说「提交」）。待用户确认真机后随 `提交` 一并 `commit + push`。
