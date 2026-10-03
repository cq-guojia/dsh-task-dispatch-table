# 文件预览：PDF / SVG 预览不出（根因排查与方案）

> **状态**：🔵 **已落码**（2026-10-03 两项：U26 修 readBytes 参数、U27 工作区外只读路径；typecheck 绿 / 冒烟 **501/0** / build 过），⏳ **真机复验待做**
> **开工**：2026-10-03
> **来源**：用户 2026-10-03 报「附件里的 PDF 和 SVG 点开都预览不了，但官方能预览」；并定取舍原则：**能用官方就用官方 → 官方做不到就抄官方样式但用浏览器底层能力 → 绝不引第三方包**
> **配套**：结论真源 = [`../design/external/dsh-capabilities.md`](../design/external/dsh-capabilities.md) §文件预览的官方渲染能力；功能口径 = [`../design/features/artifact-opening.md`](../design/features/artifact-opening.md) §二-五；现场 = [`../PROGRESS.md`](../PROGRESS.md) U26

## 一、需求原话（用户）

> 「现在我们附件里的 PDF 和 SVG 点开都预览不了，但我看到官方其实是可以预览的，PDF 也是能渲染的。我装了一个侧边栏的插件，但我觉得这个功能应该不是插件提供的，而是官方的底层功能提供的。」
>
> 「不要去引用其他的包，自己去实现一个东西。」（能用官方就用官方；官方做不到就抄样式但用底层能力）

## 二、核查结论（本轮全部读到源码实现，非猜）

官方包 `@deepseek-ai/dsh-client-ui-chat` / `-conversation` / `-renderer` / `-sidebar` / `-sidebar-documentpreview` **@0.2.0-rc.2**，`npm pack` 解包到仓库外临时目录读 `lib/`。

1. **官方「打开文件」不自研渲染**：`openFile` = `ctx.sidebarRight.openResource(fileAddressFor(...))`（chat `lib/client.js:12423`），预览由**宿主右栏资源查看器**渲染。`fileAddressFor` 产出 `dsh-resource://file/session/<id>/<path>`。
2. **`sidebarRight` 是全局 cordis 服务**（chat 以 `inject:['sidebarRight']` 依赖）⇒ 第三方**能** `ctx.inject(['sidebarRight'])`。
3. **但右栏路线对本插件整体不可用**（决策 39 已拍板，复核仍成立）：seat 按会话挂载、无 seat 时 `openResource` *"fails loudly"*；我方整页/弹窗激活即顶替会话区 ⇒ 无 seat ⇒ 报错。**不因"能取到服务"而改变结论。**
4. **官方预览组件借不到**：`documentpreview` 的 client 导出面**只有 type** + `declare module`；`ctx.documentPreviews` 注册表注册的是绑右栏 slot 的 keyed 组件。
5. **图片/SVG**：官方 `svg` 与位图**同一个 `<img>`**（`IMAGE_EXTENSIONS` 含 svg、MIME `image/svg+xml`）⇒ 我方 `<img>` 手法与官方一致。
6. **PDF**：官方**不用浏览器 iframe**，走独立懒加载分包 `lib/client.pdf.js`（**7.1 MB**）里的 **pdf.js**（`getDocument` / `GlobalWorkerOptions.workerSrc` / `canvasContext` / 文本层，worker 以 blob URL `new Worker(url,{type:'module',name:'dsh-pdf'})`）。`pdfjs-dist` 是分包内部依赖、**不在 `dependencies`** ⇒ 第三方无法合法复用，且**用户明确禁止引第三方包**。

### 已更正的此前错误口头结论（勿再沿用）

- ❌「官方 SVG 走沙箱 iframe + 净化器」——**错**，那是 **HTML 预览**（`extensions:['html','htm']`）；SVG 走 `<img>`。
- ❌「官方 PDF 用浏览器原生 iframe」——**错**，官方用 pdf.js 渲染 canvas。

## 三、我方现状（代码位置）

- 预览引擎 `src/client/file-preview.tsx`：md/代码用官方 `MarkdownText`/`CodeBlock`；图片/PDF 走 `workspaceFiles.readBytes` → `Blob` → `objectURL`（`BytesPreview`）；PDF = `<iframe src=objectURL>`（`:328`），图片/SVG = `<img>`（`:332`）。
- 入口 `openFile(sessionId, path)`（`src/client/index.ts:554`）→ 页面级唯一 dock。
- ⚠️ 预览只处理**工作区文件路径**；会话附件（`attachmentId`）这条路未接（`ctx.uiConversation` 内联图片走的是 `readAttachment`）。

## 三-五 根因（2026-10-03 真机报错一击命中，无需真机对照实验）

**用户贴的真机报错**（PDF 与 SVG 完全一致）：

> `读取失败：client api: workspaceFiles/readBytes expected 3 business argument(s) plus an optional AbortSignal, got 2`

⇒ **根因 = 取数参数传错，请求根本没发出去；与渲染器、webview 无关。**

**我犯的错**：手写的消费面 `WorkspaceFilesFace`（`src/client/file-preview.tsx:171-174`）把第三参声明成 `opts?:`（可选），调用处 `file-preview.tsx:307` 就只传了 2 个：

```ts
workspaceFiles.readBytes(sessionId, path)   // ❌ 少传 options
```

官方签名（`dsh-api-workspace-files@0.2.0-rc.2` `lib/types/index.d.ts:91`）第三参 `options: WorkspaceByteReadOptions` **必传**；「不传 range 读全量」的语义是**传 `{}`**，不是**不传参数**。`dsh-capabilities.md` §二① 当时抄的契约「不传 range = 全量」措辞含混，直接导致我落错码。

**为何只有 PDF/SVG 坏**：图片与 PDF 是**仅有的两个走 `readBytes` 的类型**；`read`（md/代码/文本）我们碰巧传了 3 个（`:362`/`:382`）⇒ 文本类正常、图片类全挂。现象与「这两个类型」严格相关，而非「格式难渲染」。

**顺带查出一处潜在缺陷**：官方 `WorkspaceByteRange` 是 `{ offset?: number; length?: number }`，**不是**我方接口里写的元组 `[number, number]`（`file-preview.tsx:172`）⇒ 该形状在任何真实调用下都传不过类型，改动时须一并更正。

### 已作废的推断（勿再沿用）

- ❌「插件 webview 没启用 PDF viewer」——**错**，请求都没发出去。
- ❌「SVG 是取数/尺寸问题、与渲染器无关」——方向对（确实不是渲染器选型），但**错在没怀疑调用签名**。
- ❌ 官方 PDF=pdf.js / 官方 SVG=`<img>` 两条结论**仍成立**（本轮 `npm pack` 复核无误），只是**本 bug 与它们无关**，别再拿它们解释这个现象。

## 三-六 改法（已落码，2026-10-03）

1. **主修**：`readBytes(sessionId, path)` → `readBytes(sessionId, path, {})`（一处调用，原 `:307`）。
2. **接口对齐**（防再踩）：`WorkspaceFilesFace.readBytes` 第三参改**必填**，形状 = `{}` / `{ range?: { offset?, length? } }`。
   ⚠️ 原声明的元组 `range?: [number, number]`（`:172`）**与官方不符**，任何真实调用都传不过类型。
   ✅ `read` 的第三参我方已写对（`{ offset?, limit? }`，官方 `WorkspaceFileRange` 同名同义，`types.d.ts:35-40`）⇒ 只需把 `opts?` 收紧为必填。
3. 冒烟补正/反断言：`readBytes` 必须带第三参；禁止 2 参调用。
4. 不动渲染层：PDF 仍走浏览器原生 `<iframe>`、SVG 仍走 `<img>`，与官方手法一致（官方 PDF 走 pdf.js 属**不可复用**的内部依赖，本仓不引）。

**结果**：typecheck 绿、冒烟 498/0、build 过；用户 2026-10-03 验收「预览没问题了」。

## 三-七 本 bug 说明的既有文档缺陷（一并记，别忘）

## 三-八 工作区之外：第一排导航整条失效（U27，2026-10-03 同一工作包追加）

**起因**：用户验收 PDF/SVG 恢复后发现——点开 `~/.dsh/storings/.../attachments` 里的附件，第一排照旧给全导航（▾ 选层下拉把 `root/.dsh/storings/…/attachments` 全列出、面包屑逐段可点、← 返回 / ↑ 上一层齐全），但**点任意一个必然报 `outside-workspace`**（官方 `list` 限工作区内）⇒ 纯属给必然失败的入口。

**拍板（用户原话）**：「你在工作区以外，本来点了就没有用，那让他点干嘛呀？……直接列一个完整的目录，让他们看就行了。」并追加：**路径太长显示不下时，hover 完全无交互**（不跑马灯、不给 title、不可点、不做任何操作）。

**落码**（`src/client/file-browser.tsx`）：

| 改动 | 位置 | 要点 |
|---|---|---|
| `outside` 状态 + `noteOutside()` | 组件内 | **判定依据 = list 的真实错误码**（`outside-workspace` / `not-found` / `lookup-not-found`，走既有 `bareCode` 取裸段）⇒ **不靠 `workspaceRoots` 猜**（根学不出来会误判成"在区内"，是更隐蔽的错法） |
| 三处 list 结果接判定 | `fetchDir` / 初次进入 / 文件预览态的父树列举 | 成功 ⇒ `setOutside(false)`；失败 ⇒ 按错误码置位 |
| `crumbbarPlain` 常量 | 组件内 | 工作区之外时的第一排：只读完整路径 + ✕ 关闭。**▾ 选层、面包屑点选、← 返回、↑ 上一层全部不渲染** |
| 三元接入 | 第一排原 `h('nav', …)` 位置 | `outside ? crumbbarPlain : h('nav', …)`，原 nav 结构零改动 |
| 样式 `.dsh-tdt-sv-crumbbar-plain` | `archive-session-css.ts` | `overflow:hidden` + `text-overflow:ellipsis` + `cursor:default` + `user-select:none`，**无 `:hover` 规则** |

**保留项（有意）**：第二排的**复制 / 刷新**照旧——刷新是重读**文件内容**，文件本身可读，与目录导航无关；`✕ 关闭` 必须留（关掉预览的出口）。

**踩坑（我自己的）**：在 `h('aside', …)` 的参数位里直接写三元时，`h('nav', {` 的 `(` 少一个闭合，报错却报在**后面十几行的 `let body`** 上（TS 解析器 cascading），排查绕了远路。**教训**：JSX 里给已有 `h()` 加分支，优先把分支提成独立常量（`crumbbarPlain`）再在参数位引用，别在参数列表里套嵌套三元。

**质量门**：typecheck 绿 · 冒烟 **501/0**（新增 3 条：分支存在 / 判定用错误码 / 样式无 hover）· build 过。


- `artifact-opening.md` §二① 与 `file-preview.tsx:12-15` 头部注释都写着「`readBytes(...)` → 全量 ≤32MiB」，**漏了「第三参必传」** ⇒ 照着写代码就会踩。本次已更正该契约到 `dsh-capabilities.md`，但**落码时必须同步收紧本仓消费面**（第 2 条），否则接口声明与官方不一致的坑还在。
- 顺带记录：官方封顶配置是 `maxFileBytes`（全量读）/ `maxBytes`（单页）/ `maxLines` / `maxEntries`（`Config`，`lib/types/index.d.ts:47-62`），**"32MiB" 是部署配的 `maxFileBytes` 值、不是协议常量** ⇒ 错误文案里的 limit 按实际配置显示，不要写死。


