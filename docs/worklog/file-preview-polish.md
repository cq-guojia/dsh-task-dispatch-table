# 文件预览打磨：代码换行开关交回官方 + 图标官方 Tooltip（2026-09-29）

> 工作包归类：U11 收尾打磨（非新功能）。图标 Tooltip 部分 commit `8c3d0dd`；
> 换行开关根因修复 = 本轮（第二次修正，见 §三）。冒烟 172 项全过，typecheck 过。

## 一、问题与两次修正

用户真机复验 U11 后反馈两点：

1. **代码显示**：横向滚动条一直在；「自动换行」按钮点了没效果，长行一直往右拉。
2. **图标无 hover 提示**：刷新、复制、复制路径等图标移上去没提示。

⚠️ **本项修了两次才对**（第一次是错的，留此存证，别再照第一次做）：
- 第一次（错误）：把 `wrap` 强制成 `true` + CSS 双层 `overflow-x:hidden` 禁滚动条。
  ⇒ 用户复验：**换行按钮直接消失了**。「你把有问题的按钮隐藏了，这不算解决」。
- 第二次（正确，本轮）：读官方 `CodeBlock` 源码定位，把换行开关**完整交回官方**。

## 二、根因（源码级，已核实）

包名 `@deepseek-ai/dsh-client-ui-primitives@0.1.7-rc.2`（与宿主版本线一致；该包是
宿主运行时提供，`package.json` 未声明故需 `npm pack` 取源码读）。

`lib/index.js` 的 `CodeBlock`（≈10651–10689）：

```js
const [localWrapped, setWrapped] = useState(true);   // 默认 true ⇒ 默认折行
const wrapped = wrap ?? localWrapped;
...
"data-code-wrap": toolbarLabels === void 0 ? void 0 : wrapped,
...
onWrap: wrap === void 0 ? () => { setWrapped((value) => !value); } : void 0
```

`lib/index.js:9285`（`CodeToolbar`）：`onWrap !== void 0 && jsx(Tooltip, {...})` ——
**换行按钮只在 `onWrap` 有值时才渲染**。

⇒ **传入 `wrap`（受控）⇒ `onWrap` 变 `undefined` ⇒ 官方 omit 掉换行钮**。
官方 `.d.ts` 亦明写：*"With toolbarLabels, use the owner's wrapping preference and
**omit the toolbar's local wrap action**"*。第一次修正传了 `wrap:true`，按钮就是这么没的。

换行态官方自己管（`lib/markdown/CodeBlock.module.css`）：
- 开（默认）：`white-space: var(--dsl-code-block-line-white-space, pre-wrap)`（:134）⇒ 折行。
- 关：`[data-code-wrap='false']` ⇒ `--dsl-code-block-line-white-space: pre`
  + `:where(pre){white-space:pre;overflow-wrap:normal}`（:113–118）⇒ 不折行。
- 滚动口 = **`pre`**（`.block :where(pre){overflow-x:auto}`，:78）。
  `.content`（即 `[data-code-block-content]`）是 `display:contents`（:74），**不是滚动口**——
  第一次修正把 `overflow-x:hidden` 加在它上面是无效的，也是概念错误。

## 三、修复（第二次，正确）

1. `src/client/file-preview.tsx`：**删掉 `wrap` 传参**（注释写明"绝不能传 wrap"及源码坐标）。
   ⇒ `onWrap` 恢复 ⇒ 换行钮回来；官方内部 `localWrapped` 默认 `true` ⇒ **默认折行**，
   点钮切不折行，全由官方管。
2. `src/client/archive-session-css.ts`：删掉覆盖官方换行/滚动的三条规则
   （`[data-code-block-content]{overflow-x:hidden}` 与 `[data-code-wrap='true']` 的
   `white-space/overflow-wrap/word-break` 强制），只留两条：
   - `.dsh-tdt-sv-preview-coderender pre{max-width:100%;}` —— 让折行按容器宽度发生；
   - `.dsh-tdt-sv-preview-coderender [data-code-wrap='true'] pre{overflow-x:hidden;}`
     —— **换行开 ⇒ 绝不出横向滚动条**；换行关 ⇒ 交回官方 `pre` 的 `overflow-x:auto`。

行为对照（用户拍板的语义）：

| 换行开关 | 折行 | 横向滚动条 |
|---|---|---|
| 开（默认） | 折行（`pre-wrap`） | **无**（本轮 CSS 兜死） |
| 关（点钮） | 不折行（`pre`） | 有（官方 `pre{overflow-x:auto}`，用户认） |

## 四、其余（同批，已随 `8c3d0dd` 上远端）

图标 hover 提示：确认官方 primitives 导出 `Tooltip`（`{label, side, children}`，与
`CodeBlock` 同包）⇒ 直接用，零自研。两文件各加 `tooled()` helper，包住
刷新/复制/复制路径/关闭/面包屑▾/返回/上一层/树▸；文案复用现有 `aria-label` 键（zh/en），
删除重复 `title` 防双提示。

## 五、验证

- `npm run build` 通过（dist/client.js 340.40 kB）；`npm run typecheck` 过。
- `npm run smoke`：172 项全过。
- dist 产物核对：无受控 `wrap`；新 CSS `data-code-wrap='true'] pre{overflow-x:hidden}` 已入包。

## 六、真机复验点

1. 打开代码文件 → 右上应**同时有「换行 + 复制」两个图标钮**（换行钮回来了）。
2. 默认（换行开）→ 长行折行，**无横向滚动条**。
3. 点换行钮关掉 → 长行不折行，代码卡内部出现横向滚动条（面板底部仍无）。
4. 图标悬停出官方气泡。
