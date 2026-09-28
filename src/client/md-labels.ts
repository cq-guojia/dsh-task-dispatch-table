// 官方对照：@deepseek-ai/dsh-client-ui-chat@0.1.7-rc.2 `lib/client.js:196-210` 的 markdownLabels(t)。
//
// 官方 Chat 传给 MarkdownText 的 labels **必带** `code.toolbarLabels`——三条工具条文案是
// 官方 CodeBlock 的**分叉开关**（primitives `lib/index.js:10679-10710`）：
//   · 有 toolbarLabels ⇒ `CodeToolbar`（`lib/index.js:9262-9318`）= 代码块卡片
//     左 = 语言（语言不被高亮支持时回落 codeLabel「代码块」）、右 = 换行 + 复制 两个**图标**钮（带 tooltip）；
//   · 缺 toolbarLabels ⇒ 老式 banner（左 = fence 语言、右 = **文字**「复制」钮、无换行钮）。
// 我们原先没传 ⇒ 弹窗/预览里的代码块落进了老式 banner，右边一个中文「复制」——与官方会话里的
// 代码块卡片不一致（2026-09-28 用户截图反馈）。
//
// 引用稳定：MarkdownText 的 labels 换身份会丢掉流式渲染缓存（官方 MarkdownText.d.ts 明示
// "pass a reference-stable object"），故这里用模块级常量，不在渲染期新建对象。
import { zh } from './locales'

/** markdown 文档外壳文案（代码块工具条 + 复制 + 脚注）。 */
export const MD_LABELS = {
  code: {
    copyLabel: zh.copyLabel,
    copiedLabel: zh.copiedLabel,
    toolbarLabels: {
      codeLabel: zh.codeBlockLabel,
      wrapLabel: zh.diffWrapLabel,
      unwrapLabel: zh.diffUnwrapLabel,
    },
  },
  footnotes: '脚注',
}
