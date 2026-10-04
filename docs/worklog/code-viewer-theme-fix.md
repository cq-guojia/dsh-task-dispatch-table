# 代码渲染配色两处修复（选区对比度 + 明暗判据）

> **状态**：✅ **完成封卷**（2026-10-05 落码）
> 日期：2026-10-05 ｜ 关联：`design/external/dsh-capabilities.md` §主题与设计变量 ｜ 归档索引：`PROGRESS-HISTORY.md`
> 前序工作包：[source-viewer-codemirror.md](source-viewer-codemirror.md)（已封卷，本包不改它）

## 一、需求原话（用户 2026-10-05）

> 现在所有代码渲染的框，包括 MD、JSON、HTML，我们不是都用了一个第三方插件去做的嘛。好像你渲染的颜色我不知道怎么回事，是有问题吗？
> 首先，深色那个我看起来倒没什么问题，但是鼠标一选，选中的是白色，就特别刺眼。还有，因为渲染本身就是白色，一选择，很多白色字根本就看不见啊。
> 还有，因为浅色的背景是白色，好多字也是白色，那白色字根本就显示不出来……你不是克隆了右边栏，人家右边栏文件编辑那些东西就很好，一点问题都没有。你好好看看人家那个是怎么做的。当然他那个和我们的是有区别的，他是允许编辑的，我们是禁用编辑的。

用户先要求「先不要改，先告诉我是为什么」，判断确认后才落码。

## 二、定位：两处根因，都在我们自己配的主题上

### 根因 A：选区色是半透明白，且 CodeMirror 不会给选中文字重新上色

`src/client/ui/cm-themes.ts` 原实现：

```ts
// 旧（错）
'.cm-selectionBackground, .cm-focused .cm-selectionBackground, ::selection': {
  backgroundColor: dark ? 'rgba(255,255,255,0.22)' : 'rgba(0,0,0,0.12)',
}
```

关键机制：**CodeMirror 把选区画成「文字底下的一层背景」，选区只改背景、不改文字颜色**（`drawSelection` 扩展在 `.cm-selectionLayer` 里画 `.cm-selectionBackground`）。所以选区色必须自己保证与语法色有对比度。

暗色下选区是 `rgba(255,255,255,.22)`（发白），而 one-dark 的语法色大量是浅/白色（`variableName` 当时是纯白 `#ffffff`，`cm-themes.ts:78`）⇒ **白字压在发白的选区上直接隐身**，且选区本身刺眼。

对照官方 `@codemirror/theme-one-dark`（`node_modules/@codemirror/theme-one-dark/dist/index.js:7`）：选区是 **`#3E4451` —— 比底色更深的不透明实色**，浅字压上去照样清晰。我们移植 better-sidebar 时把这一处换成了半透明白，是偏移点①。

### 根因 B：明暗判定读的是操作系统，不是宿主

`src/client/ui/CodeViewer.tsx` 原实现读 `window.matchMedia('(prefers-color-scheme: dark)')`（旧 `:29-32`、`:49-55`）——这违反本仓硬规矩。真源写得很清楚：

- `docs/design/ui-style-guide.md:120`：「**不许用 `prefers-color-scheme`**（跟的是系统而不是用户在宿主里的选择——两者可以不一致）」；
- `docs/design/external/dsh-capabilities.md:142-143`：明暗判据**只有一个** = `body[data-ds-dark-theme]`（宿主启动脚本 `toggleAttribute` 写入）；`prefers-color-scheme` 只在宿主内部解析 `system`，**插件侧不得自己使用**。

后果：宿主设为浅色（白面板）而系统偏好深色时 ⇒ `dark=true` ⇒ 套 `ONE_DARK`（浅/白字）叠在宿主白色面板上 ⇒ **白字白底隐形**。这就是用户说的「浅色的背景是白色，好多字也是白色」。偏移点②。

### 关于「右边栏可编辑、我们只读」的澄清

**与编辑/只读无关**——CodeMirror 的选区渲染在 `readOnly` 与 `editable` 两种模式下是同一套（我们用的是 `EditorState.readOnly`，`editable` 仍为 true，见前序工作包 §三.2）。右边栏（宿主自带编辑器）没事，是因为它：① 走宿主主题（判据 = `body[data-ds-dark-theme]`，永远跟实际面板背景一致）；② 选区用实色。我们克隆时把这两处都改偏了。

## 三、改法

| # | 位置 | 改动 |
|---|---|---|
| 1 | `src/client/ui/CodeViewer.tsx` | 删掉 `matchMedia('(prefers-color-scheme: dark)')`，改为 `hostDark()` 读 `document.body.hasAttribute('data-ds-dark-theme')`；用 `MutationObserver`（`attributeFilter: ['data-ds-dark-theme']`）跟随宿主切主题，挂载时先 `sync()` 一次（插件可能早于宿主写好该属性） |
| 2 | `src/client/ui/cm-themes.ts` | 选区改**不透明实色**：暗 `#3E4451`（官方 one-dark 原值）/ 浅 `#c8d3f0`（one-light 同族）；选择器照抄官方 one-dark `dist/index.js:41`（聚焦态 `.cm-selectionLayer` + 未聚焦 `.cm-selectionBackground` + 原生 `.cm-content ::selection` 三条都盖住） |
| 3 | `src/client/ui/cm-themes.ts` | 暗色 `tags.variableName` 从纯白 `#ffffff` 改回官方 one-dark 正文色 `ivory #abb2bf`（`ONE_DARK.gray`）——纯白在深底上过曝、压在选区上对比度更差 |

不透明是硬要求：半透明会让选区色随宿主面板深浅漂移，对比度不可控。

未动：`--tdt-*` token 层（本来就随宿主 alias 自动跟随）、`cmSurfaceTheme`（透明底 + `var(--tdt-fg)`，正确）、`lang.ts`、markdown 官方渲染路径。

## 四、验收

- `npm run build` 通过（`dist/` 一并入库）。
- `npm run smoke` **601 项通过，0 项失败**。
- 产物抽查：`#3E4451` / `#c8d3f0` / `data-ds-dark-theme` 均已落位；残留的 3 处 `prefers-color-scheme` 字样经取上下文确认，**全是注释**（tokens.ts CSS 注释、CodeViewer 说明注释）与某个依赖的媒体特性名常量表，无实际判定逻辑。
- ⚠️ 真机复验待用户：分别用「宿主浅色 + 系统深色」「宿主深色 + 系统浅色」两种错配组合打开一个代码文件，确认字色不再隐形、框选后文字仍可读。
