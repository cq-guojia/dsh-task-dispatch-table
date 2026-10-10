# 目录树交互与图标统一（2026-10-10）

> **状态**：✅ **完成封卷**（2026-10-10 用户逐轮真机反馈并拍板；已移入 [`../PROGRESS-HISTORY.md`](../PROGRESS-HISTORY.md)）。此文件此后不再改动，新事情另开文件。
> 工作包：`FileBrowser`（`src/client/file-browser.tsx`）目录树三件事 —— ① 目录被显示成「白文件」图标；② 选择器里「点行=选中、只有小尖号能展开」反人类；③ 面包屑下拉里当前工作区点不动、回不了根。
> 定型文档：[`../design/features/creation-edit.md`](../design/features/creation-edit.md) §五·7（目录附件的选中入口）、[`../design/features/artifact-opening.md`](../design/features/artifact-opening.md) §三（目录浏览器交互）。
> 前置工作包：[`attachments-folder.md`](attachments-folder.md)（整个目录当附件，2026-10-09 已封卷）、[`file-browser-ui-tuning.md`](file-browser-ui-tuning.md)（U11 目录浏览器 UI 调优，已封卷）。

---

## 一、需求与拍板（用户原话收敛）

| # | 用户原话（收敛） | 拍板 |
|---|---|---|
| 1 | 「文件夹的 icon 为啥都是一个白文件呢？官方 icon 库里没有文件夹的图标吗？」 | 目录**显式用官方文件夹图标**，不再喂给 `FileTypeIcon` |
| 2 | 「点左边小尖尖是展开，点整个这一条却是直接选择文件夹，太反人类了」 | 行本身**只负责就地展开/收起**；选中挪到**行尾悬停「选择」按钮** |
| 3 | 「两个选文件夹的地方是一套代码吗？……不要都改成统一的，全都是默认点展开，在右边点那个按钮」 | 选择器与浏览**两形态统一**：点行一律展开，行尾按钮承担该形态的主动作（选择器=选择 / 浏览=进入） |
| 4 | 「当前工作区那条加粗的，点它应该回到工作区根目录，现在根本点不了」 | 下拉里**当前工作区可点**＝回到其根目录 |
| 5 | 「目录行已经有小尖号了，前面不用再显示文件夹图标」 | 目录树**目录行不渲染文件夹图标**（文件仍用 `FileTypeIcon` 区分类型） |
| 6 | 「老附件（修复前加的）认不出目录」——讨论后用户拍板 | **不管**：只保证新加的正确，**不做旧数据迁移、不做显示时 stat** |
| 7 | 「小尖号 hover 效果 / 展开收起的提示」 | 两个**都去掉**（保留 `aria-label`，读屏无障碍不变） |

---

## 二、源码事实（动手前核实的判定链）

| 事实 | 出处 |
|---|---|
| `FileTypeIcon` **按扩展名**分类，**没有目录概念** ⇒ 目录（无扩展名 / 尾斜杠）被兜底成通用「白文件」 | 结论此前已记于 `src/client/task-file-context.tsx:146-147` 注释 |
| 官方库**有**文件夹图标：`IconFolderCloseRegular` / `IconFolderOpenOutlineRegular` | `@deepseek-ai/dsh-client-ui-primitives`，`src/client/file-browser.tsx` 已在用 |
| 目录判定只有两个信号：附件的 `isDir` 布尔、产出路径的尾斜杠 | `src/client/task-editor.tsx:2514`（选择器添加时写入）、`src/client/process-files.tsx:19` |
| 产出侧**只存路径**、**显示时**才判目录（尾斜杠）⇒ 老数据也认得出 | `src/client/process-files.tsx:19` + `:53` |
| 附件侧**存布尔** `isDir` ⇒ 修复前存的老 JSON 没有该字段 ⇒ 认不出，渲染回退白文件 | `src/client/task-editor.tsx:591-592`（加载时按布尔还原） |
| 两个选文件夹入口**是同一套代码**：都是 `FileBrowser` 的 `picker=true` 形态，共用同一个 `renderTree` | `src/client/file-browser.tsx` 的 `renderTree` |

> ⚠️ **两处口径不一致是历史遗留，本次未统一**（用户拍板「老文件不用管」）：产出侧 = 显示时判定（自解释），附件侧 = 添加时存布尔（不自解释）。
> 将来若要救老数据，只有两条路：① 让附件 `ref` 对目录带尾斜杠、显示时纯字符串判（轻量，但老 `ref` 需归一化）；② 渲染时对每个附件跑一次 `stat`（新老通吃，代价是 N 次异步调用）。

---

## 三、落码清单

| 提交 | 改动 |
|---|---|
| `bfa0b77` | 目录在产出 / 附件列表**显示文件夹图标**（`isDir` / 尾斜杠 ⇒ `IconFolderCloseRegular`，否则才 `FileTypeIcon`） |
| `3c5df65` | ① 目录树**目录行去掉文件夹图标**，只留行首小尖号；② 面包屑 ▾ 下拉里**当前工作区可点**＝ `loadDir('')` 回到根（`wsEntry`） |
| `16324c6` | 选择器目录行：点行 = 就地展开/收起；行尾新增悬停「选择」按钮（`stopPropagation`）；去掉小尖号 hover 灰底与展开/收起 tooltip |
| `c486b86` | 两形态统一：点行一律 `toggleDir`；行尾按钮按形态取动作与文案（选择器=「选择」→ `onPick`；浏览=「进入」→ `loadDir`） |

- 新增样式 `.dsh-tdt-sv-tree-act`（`src/client/archive-session-css.ts`）：平时 `opacity:0 / pointer-events:none`，`.dsh-tdt-sv-tree-row:hover` 或自身 `focus-visible` 才显形；**常占尺寸、出现时不顶动布局**；纯 CSS 控制显隐，不引入 React 重渲染。
- 新增文案 `editorPickerSelect`（中「选择」/ 英「Select」）与 `explorerEnter`（中「进入」/ 英「Open」），中英齐备。
- 小尖号保留 `aria-label`（展开 / 收起），只去掉视觉 tooltip ⇒ 读屏不受影响。

---

## 四、踩坑与认知校正

1. **「图标从没被记过」**：图标永远是**显示时**算出来的，不存在「存了某个图标」。真正的分歧是「是不是目录」这个事实放在哪 —— 产出侧存在**路径里**（尾斜杠，自解释），附件侧存在**路径外的布尔里**（不自解释）。用户一路追问的正是这一点。
2. **不能按后缀判目录**：`.codebuddy` / `20260928` / `my.project.v2` 这类目录名，按后缀要么判不出、要么误判 ⇒ 目录必须走 `isDir` / 尾斜杠信号，**甩开 `FileTypeIcon`**（那套后缀逻辑只对文件负责）。
3. **`stopPropagation` 是必需**：行尾按钮点选 / 进入时若不掐掉冒泡，会连带触发整行展开 ⇒ 一次点击做两件事。
4. **目录行图标先加后撤**：`bfa0b77` 给目录行补了文件夹图标，`3c5df65` 又撤掉 —— 因为目录行**已有小尖号**，再摆一个文件夹图标是重复（用户 2026-10-10 明确要求）。文件行不受影响。
5. **旧数据认不出**：修复前存的附件没有 `isDir` ⇒ 界面仍显示白文件。用户拍板「老文件不用管，新的有就行」⇒ **未做迁移、未做显示时 stat**。

---

## 五、验证

- `npm run typecheck` 绿、`npm run build` 过、`npm run smoke` **749/0**（dist 随提交）。
- 用户逐轮真机反馈并拍板：白文件图标（截图）、面包屑当前工作区点不动（截图）、目录行交互反人类（截图）三项均有真机证据；最终两形态统一的交互按用户指定实现。
- 未改动的既有行为：文件行点行即选中 / 预览；面包屑段点击、▾ 选层、目录层级缩进；键盘 Enter/Space（现同步为展开）。
