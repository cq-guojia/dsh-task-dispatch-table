# 源码态查看器改用只读 CodeMirror 6（全局收口）

> 日期：2026-10-04 ｜ 关联：`design/external/dsh-capabilities.md` 决策表「源码态查看器渲染引擎」｜ 归档索引：`PROGRESS-HISTORY.md`

## 一、背景：为什么换掉官方 Shiki CodeBlock

文件预览的源码态（代码 / HTML 源 / 纯文本）原来用官方 `CodeBlock`（primitives 的 Shiki 积木，与 diff 面同源）。它把整篇 tokenize 成 `<pre>` + 每 token 一个 `<span>` 的巨型 DOM：

- 5000 行 / 256K 文件**首屏**与**拖拽改宽**都触发整棵子树重排 ⇒ 卡死；
- 自带滚动容器 + 外层 `overflow:auto` ⇒ **两条滚动条**；
- 底部偶发「加载更多」且被挡一半。

better-sidebar 等插件用 CodeMirror 6 一拖就换行、不卡，用户要求我们也做到。

## 二、决策：只读 CodeMirror 6（`CodeViewer`，落地 `src/client/ui/CodeViewer.tsx`）

复用仓库已声明的 `@uiw/react-codemirror`（非新引包）。行级视图 + Lezer 增量高亮，宽度变化只重排可视区，天然不为整篇买单。

## 三、四个行为修复（用户逐条验收）

1. **整片白底**：`@uiw/react-codemirror` 默认 `theme="light"` 强灌白色背景 ⇒ 关掉它（`theme="none"`），`cmSurfaceTheme` 透明底叠在宿主深色面板上，暗底恢复。
2. **不能框选复制**：原来多加了 `EditorView.editable=false`，它会把内容设为不可编辑、连带禁用鼠标选区 ⇒ 去掉，只用 `<CodeMirror readOnly>`（= `EditorState.readOnly`）挡输入；**只读但能选、能复制某一句**，且无脏点/保存。
3. **默认全换行**：用户明确「进来就全部换行，不要换行/不换行切换」⇒ 移除换行钮，`EditorView.lineWrapping` 默认开。
4. **复制钮**：右上角浮层，随区域 hover 浮现；仅官方图标（无中文「复制」二字），点击复制全文，复制后短暂切勾选图标 + 「已复制」提示（title/aria-label 承载本地化文案），对齐官方 CodeBlock 复制钮交互。

主题：`theme="none"` 透明底 + 移植 better-sidebar 的 one-dark / one-light + 13px；行号保留。

## 四、三处只读代码展示统一收口

| 位置 | 改造前 | 改造后 |
|---|---|---|
| `file-preview.tsx` 源码态（代码 / HTML 源 / 纯文本） | 官方 `CodeBlock`(Shiki) | `CodeViewer`（本轮早前已完成） |
| `task-editor.tsx` 配置预览面板的任务定义 JSON | 官方 `CodeBlock`(Shiki, `lang:'json'`) | `CodeViewer`（`path:'task-definition.json'`），移除 `CodeBlock` import |
| `mirror/GenericCommandCard.tsx` 工具卡 `code` 变体 | 官方 `CodeBlock`(Shiki, `lang:'typescript'`) | `CodeViewer`（`path:'tool-code.ts'`、`height:'auto'` 随内容撑高），移除 `CodeBlock` import |

配套改动：`CodeViewer` 增加可选 `className` / `style` / `height` 透传（默认 `"100%"` 填满父容器；工具卡传 `"auto"` 随内容撑高，因工具卡代码块无确定高度上下文）。未动 markdown 官方路径（`md-labels.ts` / `official-classes.ts` / `primitives.d.ts` 里的 `CodeBlock` 引用属 `MarkdownText` 正文渲染，仍合法）。

## 五、文档同步

- `design/external/dsh-capabilities.md` 决策表：纠偏（原误写 `editable=false`、保留换行开关），补「三处统一使用 `CodeViewer`」。
- `design/features/artifact-opening.md`：渲染层细分「markdown 正文仍官方 Shiki；独立源码查看器改用只读 CodeMirror 6」；预览引擎分派描述 `代码=CodeViewer`。
- `PROGRESS.md` §二 U30 末尾补注：HTML 源码态最终统一为 CodeMirror。
- 清理 `file-preview.tsx` / `archive-session-css.ts` 残留的 Shiki / CodeBlock 旧注释。
- 本条目结案移入 `PROGRESS-HISTORY.md`。

## 六、验收

- `npm run build` 通过（`dist/` 入库）。
- `npm run smoke` 绿。⚠️ 唯一历史未过项 `Tooltip/PastPill·NextPill` 属并发同事正在改的 `task-editor` 区域，与本次源码态改造无关，未触碰。
