# 文件预览：PDF / SVG 预览不出（根因排查与方案）

> **状态**：🔵 **已落码**（2026-10-03，typecheck 绿 / 冒烟 **498/0** / build 过），⏳ **真机复验待做**（只需点开一个 PDF + 一个 SVG 看是否恢复；原定对照实验作废）
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

## 三-六 改法（待请示，未动代码）

1. **主修**：`readBytes(sessionId, path)` → `readBytes(sessionId, path, {})`（一处调用，`file-preview.tsx:307`）⇒ PDF/SVG 立即恢复。
2. **接口对齐**（防再踩）：`WorkspaceFilesFace.readBytes` 第三参改**必填**，形状 = `{}` / `{ range?: { offset?: number; length?: number } }`。
   ⚠️ 现声明的元组 `range?: [number, number]`（`:172`）**与官方不符**，任何真实调用都传不过类型。
   ✅ `read` 的第三参我方已写对（`{ offset?, limit? }`，官方 `WorkspaceFileRange` 同名同义，`types.d.ts:35-40`）⇒ 只需把 `opts?` 收紧为必填。
3. 冒烟补一条正向断言：`readBytes` 必须带第三参（把「2 参调用」打成反例），防回归。
4. 不动渲染层：PDF 仍走浏览器原生 `<iframe>`、SVG 仍走 `<img>`，与官方手法一致（官方 PDF 走 pdf.js 属**不可复用**的内部依赖，本仓不引）。

## 三-七 本 bug 说明的既有文档缺陷（一并记，别忘）

- `artifact-opening.md` §二① 与 `file-preview.tsx:12-15` 头部注释都写着「`readBytes(...)` → 全量 ≤32MiB」，**漏了「第三参必传」** ⇒ 照着写代码就会踩。本次已更正该契约到 `dsh-capabilities.md`，但**落码时必须同步收紧本仓消费面**（第 2 条），否则接口声明与官方不一致的坑还在。
- 顺带记录：官方封顶配置是 `maxFileBytes`（全量读）/ `maxBytes`（单页）/ `maxLines` / `maxEntries`（`Config`，`lib/types/index.d.ts:47-62`），**"32MiB" 是部署配的 `maxFileBytes` 值、不是协议常量** ⇒ 错误文案里的 limit 按实际配置显示，不要写死。


## 四、方案（三步，本轮只做第 1、2 步）

**第 1 步 · PDF 根因（真机对照实验，只读不改码）**
同一 PDF 在 dock 内跑四种情况，判定是"环境无 PDF viewer"还是数据/样式问题：
1. `<iframe src=blobURL>`（现状复现）；2. 同 blob 在宿主主窗口开（能显示 ⇒ 确诊插件 webview 禁用 viewer）；3. `<embed>`/`<object>` 替代；4. 直接新标签开 blobURL（排除 CSP/blob 限制）。

**第 2 步 · SVG 根因（只读）**
官方同走 `<img>`，故优先查**取数与尺寸**，非渲染器：① `readBytes` 对 `.svg` 的实际返回（是否被判 `not-text`/超限）；② `.dsh-tdt-sv-preview-img` 与 dock 容器 CSS 尺寸（非 0 才显示）。

**第 3 步 · 按结论改（才动代码）**
- PDF：若确诊"无 viewer" ⇒ 保留原生 iframe（浏览器底层能力）+ **抄官方 PDF 面的样式**（`[data-pdf-preview]` 标记 + `--dsw-alias-bg-document-preview` 底色，见外部事实文档），并给官方同款"用系统应用打开/下载"降级；**不引 `pdfjs-dist`**。
- SVG：修实际断点（取数 or 尺寸）。
- 两条结论回写 `dsh-capabilities.md`；决策 39 的渲染层事实已在 `artifact-opening.md` §二-五 更正。

## 五、待用户确认

- 第 1 步对照实验需用户在真机 dock 里点开一次 PDF 预览配合；其余可独立只读完成。
