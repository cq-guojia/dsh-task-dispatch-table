# 代码块工具条对齐官方（弹窗正文 / 思考 / 预览 md）

> ✅ 完成封卷（2026-09-28）。此后不再修改；遗留项见文末「遗留」与 `docs/PROGRESS.md`。

## 一、真机反馈（用户截图）

官方会话/文件预览里的代码块长这样：卡片左上「代码块」（有语言且可高亮时显示语言名），右上**两个图标钮**
（换行 / 复制，带 tooltip）。我们的弹窗里同一位置是**右边一个中文「复制」文字钮**，且没有换行钮 ⇒ 要求对齐官方。

## 二、根因（源码级，非目测）

官方 `MarkdownText` 渲染 fence 时把 `labels.code.toolbarLabels` 原样交给 `CodeBlock`
（`@deepseek-ai/dsh-client-ui-primitives@0.1.7-rc.2` `lib/index.js:11160-11164` renderCode）；
而 `CodeBlock` 拿它当**分叉开关**（同包 `lib/index.js:10679-10710`）：

| 条件 | 渲染 |
|---|---|
| `toolbarLabels !== undefined` | `CodeToolbar`（`lib/index.js:9262-9318`）：左 = `supportsHighlighting(lang) ? lang : labels.codeLabel`；右 = 换行钮（`onWrap` 存在时）+ 复制钮，**两个都是 24px 图标钮**（`IconWrapFillRegular` / `IconCopyOutlineRegular`，带 `Tooltip`），根加 `CodeCard` 的 `.card` 类（`CodeCard.module.css`） |
| `toolbarLabels === undefined` | 老式 banner：左 = fence 语言原文、右 = **文字**钮 `copied ? copiedLabel : copyLabel`，无换行钮、无卡片内边距 |

官方 Chat 自己怎么传？`@deepseek-ai/dsh-client-ui-chat@0.1.7-rc.2` `lib/client.js:196-210` 的
`markdownLabels(t)` —— **必带** `toolbarLabels: { codeLabel: t('codeBlock.title'), wrapLabel: t('codeBlock.wrap'), unwrapLabel: t('codeBlock.unwrap') }`。

我们三处 `MarkdownText` 调用点（`mirror/MessageItem` 正文、`mirror/ReasoningRow` 思考体、`file-preview` md 渲染态）
原先各自持有一份 `MD_LABELS = { code: { copyLabel, copiedLabel }, footnotes }`——**只有复制文案、没有 toolbarLabels**，
于是全体落进老式 banner：正文/思考里一个文字「复制」、没有换行钮。预览面板的 CodeBlock（源码态）本来就传了
`toolbarLabels`，所以它没问题——差异只在 MarkdownText 这条链上。

## 三、修法

- 新增 `src/client/md-labels.ts`：导出模块级常量 `MD_LABELS`（官方 `markdownLabels` 的逐字段对应），
  三条工具条文案取自 `locales.ts` 的 zh 词典（`codeBlockLabel` / `diffWrapLabel` / `diffUnwrapLabel`），
  不再三处各写一份字面量（消掉副本，避免将来单点漏改）。
- 三处调用点改成 `import { MD_LABELS } from ...`，删除各自本地常量。
- `src/client/primitives.d.ts`：`MarkdownCodeLabels` 补 `toolbarLabels?`（新增 `MarkdownCodeToolbarLabels`），
  与官方 `lib/types/markdown/render.d.ts:23-30` 一致。
- 引用稳定性不变（官方 MarkdownText.d.ts 明示 labels 需 reference-stable，换身份会丢流式渲染缓存）：
  常量仍是模块级、不在渲染期新建。

## 四、验证

- `npm run typecheck` ✅、`npm run build` ✅（`dist/client.js` 241.68 kB）。
- `npm run smoke` ✅ **152 项**（+1：`代码块走官方卡片工具条（MarkdownText labels 带 code.toolbarLabels）`，
  断言 `code: { … toolbarLabels:` 形状 + 换行/取消换行文案在产物里）。
- 产物核对：`dist/client.js:2143-2155` 的 `MD_LABELS` 已带 `toolbarLabels` 三段。
- **待真机**：弹窗正文 fenced 代码块、思考展开体、预览 md 渲染态三处，右上应为**换行 + 复制两个图标钮**
  （tooltip 出「复制」），鼠标悬停有 hover 底；复制成功图标变勾、1 秒后复位。

## 五、遗留

- `MD_LABELS` 的字面量走 zh 词典 ⇒ **en 界面下这三条 tooltip 仍是中文**（与改动前的 `copyLabel` / 脚注同款既有偏差；
  要修需把 labels 从 `t` 构造并保证引用稳定，属独立小项，未在本轮扩散）。
- 老式 banner 分支我们已不再使用，但**官方产物里仍在**——若哪天有人新起一处 `MarkdownText` 忘了传 labels，
  症状会重现（冒烟这条断言即为此设的护栏）。
