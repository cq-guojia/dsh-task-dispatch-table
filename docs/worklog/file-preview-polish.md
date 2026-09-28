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

## 六、真机复验点（第二轮修法）

1. 打开代码文件 → 右上应**同时有「换行 + 复制」两个图标钮**（换行钮回来了）。
2. 默认（换行开）→ 长行折行，**无横向滚动条**。
3. 点换行钮关掉 → 长行不折行，代码卡内部出现横向滚动条（面板底部仍无）。
4. 图标悬停出官方气泡。

---

## 七、第三轮（真正的根因，commit `dceb221`）——第二轮修法真机仍不折行

用户真机复验（两张截图）：换行开关在、点了也在切，但**两个状态下长行都不折行、横向滚动条都在**。
同批还报了目录浏览器两点：点目录时面包屑只剩该目录一层（点文件却是全路径）；下拉选层每行 N 个箭头太丑。

### 7.1 换行：真根因在 CodeBody.module.css + ocOr 死规则

- **`ocOr` 陷阱**（`official-classes.ts:140`）：`officialClass(...) ?? fallback` 两者只取其一——
  官方 `CodeBody.renderer/code` 类命中时，我方兜底类 `.dsh-tdt-sv-preview-coderender` 根本**不挂**到元素上
  ⇒ 第二轮写的 `.dsh-tdt-sv-preview-coderender …` 两条规则全是**死规则**（官方类命中场景下从未生效）。
- **官方强制不折行**（`dsh-client-ui-sidebar-documentpreview@0.1.7-rc.2 lib/client.js:5019` 内联的
  `CodeBody.module.css`）：`.renderer .code{--dsl-code-block-line-white-space:pre}` +
  `.renderer .code pre{white-space:pre;word-break:normal;overflow-wrap:normal;min-width:100%;overflow:visible}`；
  只有 `.renderer[data-wrap=true]` 才放开为 pre-wrap。`data-wrap` 由官方预览面板持有状态下传
  （`register({wrap:true})` → `CodeBody({wrap})` 同时传给 CodeBlock 受控 + 设 `data-wrap`），
  我方自渲染从不设 `data-wrap` ⇒ 官方这条 pre 恒生效 ⇒ 点工具条换行钮永远不折行。
  另官方预览面板的换行开关**不在 CodeBlock 工具条上**（受控 wrap ⇒ 工具条换行钮被 omit），
  是面板级控件——我方保留了工具条钮（不传 wrap），属有意偏差。
- **修法**：规则改挂 `[data-code-preview]`（官方 CodeBody `client.js:5042` 与我方兜底 div 都带此属性，
  两条路都命中）+ CodeBlock 自身的 `[data-code-wrap='true']`，复刻官方 `[data-wrap=true]` 同款放开规则：
  ```css
  [data-code-preview] [data-code-wrap='true'] [data-code-block-content]{--dsl-code-block-line-white-space:pre-wrap;overflow-x:hidden;}
  [data-code-preview] [data-code-wrap='true'] [data-code-block-content] pre{white-space:pre-wrap;overflow-wrap:anywhere;}
  ```
  特异性 (0,3,·) 压过官方 (0,2,·)；换行关 = 官方默认（pre 不折行 + content `overflow:auto` ⇒ 横向滚动条）。
  ⚠️ 注意模板字符串注释里不能写反引号（本轮踩过：`` ` `` 直接终止字符串 ⇒ TS1005）。

### 7.2 面包屑：⚠️「改用服务端规范路径」是错的，已回退（第四轮）

**本轮先写错了方向，真机被打回**：为修「点目录只剩一层」，我把 `dir` 改成服务端 `list` 返回的
`path`。实测把面包屑改得更坏——点**任何文件**都只剩最近一层（`Temp`，原本是 `workspace > Temp`）。

- 根因（源码事实，`dsh-api-workspace-files@0.1.7-rc.2 lib/index.js:494`）：
  ```js
  path: workspacePathOf(this.ctx.fs.fileUrl(root), this.ctx.fs.fileUrl(target))
  ```
  这个 `path` 是**工作区相对**形式——工作区根为 `/workspace` 时，`/workspace/Temp` 的规范路径就是
  `Temp`。用它当面包屑 ⇒ 丢掉根以下的所有前导段，只剩最近一层。
  ⇒ 用户要的是「**从工作区根目录往下列**」= **入参路径**（宿主绝对形态）逐段展开，
  即**原来的逻辑**。三处 `setDir(parsed.path/pl.path)` 全部**回退**为入参路径（`targetDir` / `path` / 父目录）。
- 已在 `crumbsOf(dir)` 处加防再犯注释（写明服务端 path 是相对形式、本轮踩过）。
- 保留（本轮新加、与回退不冲突）：工作区根目录态（crumbs 空）补「（工作区根目录）」占位 crumb
  （可见态 + 溢出测量条同构）——原本根目录态面包屑是完全空白的。
- **「点目录只剩一层」已解决（第四轮续，commit `74907fa`）**：用户确认场景 = 从**回契产出**
  （交付卡 / 执行记录「产出」列）点文件夹（如 `20260928`）——入口把 agent 声明的工作区相对名
  **原样**传入 `openFile`，面包屑天然没有前导段。官方没有「目录的绝对路径」接口（stat 只认
  regular file，locateFile 对目录抛 not-regular-file，`lib/index.js:594`）⇒ `FileBrowser` 入口统一解析：
  - **目录**：取目录里任一「文件」子项 `stat`，`absolutePath = 工作区根 + '/' + 目录 + '/' + 文件名`，
    掐掉文件名即得目录的宿主绝对路径（空目录 / 只有子目录 / stat 缺失 ⇒ 退回入参，不阻塞浏览）；
  - **文件**：`stat` 自身取 `absolutePath` 再取父目录（stat 恰好只认文件，此处可用）；
  - `file-preview.tsx`：`WorkspaceFilesFace` 加**可选** `stat` 面 + `absolutePathOf` 防御解析
    （信封剥壳同款）；解析不出一律退回入参路径，功能不受影响。
  已知边界：**空目录或只含子目录的相对名目录**解析不出（没有文件子项可 stat），面包屑退化为
  相对形式；真遇到再说。

### 7.3 下拉选层箭头：一行一个

- 每行只画**一个**右箭头（固定在原第 index 位），行首 (index-1) 个箭头位用
  `.dsh-tdt-sv-crumbs-chev-slot`（11px + 1px margin，与箭头同宽）**空出但占位**，保持层级缩进；首行无箭头。

### 7.4 验证与复验点

- build（dist 343.04 kB）+ 冒烟 172 项全过 + typecheck 过；dist 产物核对含新 CSS 与 `crumbs-chev-slot`。
- 真机复验：① 换行**开** → 长行折行、无横向滚动条；② 换行**关** → 不折行、代码卡内出横向滚动条；
  ③ 从交付卡/产出列点目录 → 面包屑从工作区列全；④ 下拉选层每行一个箭头、缩进不变；⑤ 根目录态面包屑有占位。

---

## 八、真机核验结果（2026-09-29）——✅ 通过，本工作包封卷

用户逐项复验，四项全部通过，U11 整条线收口：

| 项 | 结果 |
|---|---|
| 代码换行开关（开 = 折行无横向滚动条；关 = 不折行有滚动条） | ✅ |
| 图标悬停官方 Tooltip（刷新 / 复制 / 复制路径 / 关闭 / 面包屑▾ / 返回 / 上一层 / 树▸） | ✅ |
| 面包屑：点文件 / 点文件夹均从工作区根往下列（含交付卡相对名目录的 `stat` 反推） | ✅ |
| 下拉选层箭头：每行一个、行首空位保持缩进 | ✅ |

**封卷教训（本项反复踩的三条，写在此处防再犯）**：
1. **`ocOr` 语义 = 官方类命中时我方兜底类不挂**（`official-classes.ts:140`）——写在兜底类作用域下的
   规则在真机上可能是**死规则**。跨官方/兜底两路生效的规则必须挂在双方共有属性上（如 `[data-code-preview]`）。
2. **宿主组件一律先 `npm pack` 读实现本体与 CSS 模块，不靠运行时猜**——本项三轮才修对，每一轮
   「看起来对的修法」都被下一轮真机证伪；最终根因（CodeBody 强制 `pre` + `data-wrap`）只有读源码才看得到。
3. 服务端 `list` 返回的 `path` 是**工作区相对**形式（`workspacePathOf(root,target)`），不能直接当面包屑
   路径用（会把 `/workspace/Temp` 压成 `Temp`）；相对名目录要靠 `stat` 反推宿主绝对路径。
