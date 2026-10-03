# 文件预览：PDF / SVG 预览不出（根因排查与方案）

> **状态**：🔵 **已落码**（2026-10-03 三项：U26 readBytes 参数、U27 工作区外只读路径+跑马灯、U28 拖拽禁 iframe 指针事件；typecheck 绿 / 冒烟 **504/0** / build 过），⏳ **真机复验待做**
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

**拍板（用户原话）**：「你在工作区以外，本来点了就没有用，那让他点干嘛呀？……直接列一个完整的目录，让他们看就行了。」并追加：**路径太长显示不下时要跑马灯**（用户原话「鼠标移上去就-啪-啪-灯-」）。

⚠️ **我第一遍误读成「禁止任何 hover 交互」**，用户 2026-10-03 验收时点正：「显示不下，移动上去要跑马灯呀。」**「啪-啪-灯」是跑马灯滚动的声音，不是"不许动"。** 教训：用户用拟声词描述动效时，默认理解为"要有这个动效"，别按字面否定理解。

**落码**（`src/client/file-browser.tsx` + `archive-session-css.ts`）：

| 改动 | 位置 | 要点 |
|---|---|---|
| `outside` 状态 + `noteOutside()` | 组件内 | **判定依据 = list 的真实错误码**（`outside-workspace` / `not-found` / `lookup-not-found`，走既有 `bareCode` 取裸段）⇒ **不靠 `workspaceRoots` 猜**（根学不出来会误判成"在区内"，是更隐蔽的错法） |
| 三处 list 结果接判定 | `fetchDir` / 初次进入 / 文件预览态的父树列举 | 成功 ⇒ `setOutside(false)`；失败 ⇒ 按错误码置位 |
| `crumbbarPlain` 常量 | 组件内 | 工作区之外时的第一排：只读完整路径 + ✕ 关闭。**▾ 选层、面包屑点选、← 返回、↑ 上一层全部不渲染** |
| 三元接入 | 第一排原 `h('nav', …)` 位置 | `outside ? crumbbarPlain : h('nav', …)`，原 nav 结构零改动 |
| 样式 `.dsh-tdt-sv-crumbbar-plain` + `-inner` | `archive-session-css.ts` | 外层 `flex:1+overflow:hidden`、内层 `white-space:nowrap` + `text-overflow:ellipsis`（同 `preview-title` 结构）；`cursor:default`、**无 `:hover` 规则**（跑马灯由 JS 驱动，不是 hover 样式）|
| 跑马灯 | `marqueeOn` / `marqueeOff`（**从原 `startMarquee`/`stopMarquee` 抽成共用**，两处调用，不另写一套） | 独立 `plainRef` / `plainInnerRef` 一套，不与文件名那套互相干扰；hover 向左滚到底、移出复位 |

**保留项（有意）**：第二排的**复制 / 刷新**照旧——刷新是重读**文件内容**，文件本身可读，与目录导航无关；`✕ 关闭` 必须留（关掉预览的出口）。

**踩坑（我自己的）**：在 `h('aside', …)` 的参数位里直接写三元时，`h('nav', {` 的 `(` 少一个闭合，报错却报在**后面十几行的 `let body`** 上（TS 解析器 cascading），排查绕了远路。**教训**：JSX 里给已有 `h()` 加分支，优先把分支提成独立常量（`crumbbarPlain`）再在参数位引用，别在参数列表里套嵌套三元。

**质量门**：typecheck 绿 · 冒烟 **501/0**（新增 3 条：分支存在 / 判定用错误码 / 样式无 hover）· build 过。

- `artifact-opening.md` §二① 与 `file-preview.tsx:12-15` 头部注释都写着「`readBytes(...)` → 全量 ≤32MiB」，**漏了「第三参必传」** ⇒ 照着写代码就会踩。本次已更正该契约到 `dsh-capabilities.md`，但**落码时必须同步收紧本仓消费面**（第 2 条），否则接口声明与官方不一致的坑还在。
- 顺带记录：官方封顶配置是 `maxFileBytes`（全量读）/ `maxBytes`（单页）/ `maxLines` / `maxEntries`（`Config`，`lib/types/index.d.ts:47-62`），**"32MiB" 是部署配的 `maxFileBytes` 值、不是协议常量** ⇒ 错误文案里的 limit 按实际配置显示，不要写死。

## 三-九 拖拽调宽被 PDF iframe 吞事件（U28，2026-10-03 同一工作包追加）

**现象（用户报）**：PDF 预览时**向左拖（放大）没问题**，**往回拖（缩小）就拖不动**；点别处强行释放 ⇒ **弹回最小的窗口**。

**根因**：PDF 预览体是 `<iframe>`，是**独立文档**。拖拽监听挂在 `window`（父文档，`index.ts:588`），
指针一旦进入 iframe，**父文档就收不到 `pointermove`/`pointerup`**。

- 向左拖（放大）：指针往左**离开 dock**、留在父文档 ⇒ 正常；
- 向右拖（缩小）：指针往右**走进 dock**——而 dock 里整个是那个 PDF iframe ⇒ **事件全丢，拖动卡死**；
- 点别处强行释放：`onUp` 拿到的 `clientX` 已偏右很多 ⇒ `startWidth - (clientX - startX)` 算出很小/负数 ⇒
  被 `clampPreviewWidth` 压到 `PREVIEW_MIN`（`index.ts:403`）⇒ **弹回最小宽度**。三个现象一条线全解释通。

**修法**：拖动期间给 `#dsh-tdt-root` 挂 `dsh-tdt-resizing`，CSS 令 `iframe{pointer-events:none}`，松手撤销
（`index.ts:579-594` + `archive-session-css.ts:28`）。**不用 `setPointerCapture`**——它只在同文档内重定向事件，
**跨不了 iframe 这份独立文档**。

⚠️ **同类风险（记下防复发）**：任何内嵌 iframe（PDF / HTML 预览等）在**全局拖动**期间都会吞事件。
以后再加拖拽（分割条 / 面板调宽 / 抽屉），都要配这层「拖动期间禁 iframe 指针事件」。

**质量门**：typecheck 绿 · 冒烟 **504/0**（+2 条：resizing 类存在 + 松手撤销）· build 过。

## 三-十 跑马灯：滚出黑块 + 尾部永不显示，三处手写收编（U29，2026-10-03）

**现象（用户报 + 截图）**：hover 跑马灯时右边跑出一大片黑；跑出来后**后面的内容没显示**。

**根因**：手写的三处跑马灯（`file-preview.tsx` 预览头路径、`file-browser.tsx` 第二排文件名与只读完整路径）
内层带 `overflow:hidden` ⇒ 按 flex 规矩 **`overflow:hidden` 的子元素最小宽度自动为 0** ⇒ 内层盒子被压到
和容器一样宽，**超出部分被内层自己裁掉**。而滚距是按「完整文本宽 − 容器宽」算的 ⇒
滚动时移动的是一个**只装着开头半截文本的盒子**：尾部从头到尾没进过画面，盒子整体滑出后右侧就是一片黑。
（截图的等宽字体可确认是只读路径那处。）

**共用组件 `MarqueeText` 没这个病**：hover 时 `max-width:none; overflow:visible` —— 盒子放开到全文宽，
滚距精确等于溢出量，滚到头时尾字正好贴右缘。

**处置（用户拍板：该抽象的抽象，统一解决；可加参数/重载，实在不行才在特有处覆盖）**：

| 改动 | 位置 | 要点 |
|---|---|---|
| 三处手写收编 | `file-preview.tsx`、`file-browser.tsx` | 全部换 `MarqueeText`；删 `marqueeOn/Off`、`start/stopMarquee` 与 6 个 ref |
| 加参数 | `ui/MarqueeText.tsx` | 新增 `className`（追加在外层，承载调用方字体/字色皮肤；内层继承） |
| 全局跑法 | `ui/controls-css.ts` | `infinite alternate` → **播放 1 次 + `forwards`**（跑完停在尾字，不来回弹、不无限跑）；移开鼠标自动复位 |
| 清死代码 | `archive-session-css.ts` | 删两条已无人引用的外层规则（`.dsh-tdt-sv-preview-title` / `.dsh-tdt-sv-crumbbar-plain`），`-inner` 保留作皮肤类 |

**踩坑（复发，务必记牢）**：CSS 写在 **模板字符串**里 ⇒ **注释里不能出现反引号**。
我在新注释里写了 `` `ui/MarqueeText.tsx` `` 和 `` `.dsh-tdt-mq` ``，直接把模板字符串提前闭合，
报错却报在**几十行之后**（`Unterminated template literal` / `Variable declaration expected`），
和 U28 那次「插进选择器中间」是同一类错。**规矩：往 CSS 模板里写注释只用中文引号或不用引号。**

**验证**：typecheck 绿 · 冒烟 **506/0**（+2 条：无手写残留 / 跑法为 1+forwards）· build 过；
**并按 U28 教训抽查产物** `dist/client.js`，确认六条相关 CSS 规则完整未被截断。

## 三-十一 HTML 预览：从「只显示代码」到官方同款静态预览（U30，2026-10-04）

**现象（用户报）**：我们自己构建的 HTML，点进去**全是代码**；官方点进去默认是**渲染后的网页**，
且官方「点源码」只显示前一部分（用户印象里是 512K）。

**核实结论（官方 `documentpreview@0.2.0-rc.2`）**：

| 项 | 官方事实 | 出处 |
|---|---|---|
| 渲染形态 | `BasicHtmlFrame` = `<iframe srcDoc={html} sandbox="" data-html-preview>` | `lib/client.js:4052-4073` |
| 净化（第一层） | DOMPurify 3.4.11（内联进包），`WHOLE_DOCUMENT:true`，禁标签 `noscript/base/link/meta/iframe/frame/object/embed/set/animate*`，禁属性 `href`/`xlink:href` | `:3825-3842`、版本 `:1707` |
| CSP（第二层） | head **第一项**：`default-src 'none'; script-src 'none'; style-src 'unsafe-inline'; img-src data:; font-src data:; media-src data:` | `:3844-3846` |
| 沙箱（第三层） | `sandbox=""`（全禁：脚本/表单/同源） | `:4069` |
| 取数 | 注册 `loading:'bytes-complete'` ⇒ 一次取全量字节 | `:4105` |

**两处更正（我此前的错误表述）**：

1. ❌「官方源码视图默认 512K」——**错**。全文搜无 `512*1024`/`524288`。源码态走官方 `read` **按行分页**，
   上限是**部署配置的 `maxBytes`**；512K 只是该部署的值，不是协议常量。
2. ❌「预览态有大小限制」——**错**（用户当场点破）。官方 `documentpreview` 的 Config **只有 Office 缓存与 Excel 上限**，
   HTML/PDF/MD/图片**无任何大小配置**。所谓限制是 `workspaceFiles.maxFileBytes`（全量读上限，部署值），
   且官方注释写明 *"larger files are refused, **never truncated**"* ⇒ **超限即报错，官方也不显示半截预览**。

**落码（用户拍板：跟官方一模一样，不多开一点、不少关一点）**：

| 改动 | 要点 |
|---|---|
| `previewKind` 增 `html`/`htm` | 扩展名与官方 `htmlBodyDefinition` 同款（`:4102`） |
| `buildStaticHtml()` | 官方三层逐条照抄：DOMParser 剔除官方那份禁用标签/属性（**不引 DOMPurify**，用浏览器原生做等价剔除）+ head 首位插官方 CSP 原文 |
| `HtmlPreview` | `readBytes` 取全量（官方 `bytes-complete`）→ `<iframe srcDoc sandbox="" data-html-preview>` |
| 入口形态照 md | 默认**预览**（HTML 渲染），点「源码」进文本态；`Segmented` 与 md 同一套，新增 `previewHtmlSwitchAria` |
| 源码态截前 256K | `SOURCE_MAX_BYTES = 256*1024`；`TextPreview` 加可选 `maxBytes`，累计字节达上限即停翻页；≤256K 不提示，>256K 在**底部**（滚到底、无「加载更多」时）给一行「因文件过大，仅显示前 256 KB 的内容」 |
| 超限行为 | 照官方：报 `previewTooLarge`，**不降级** |

**关于「不引第三方包」与「跟官方一模一样」的取舍**：官方用 DOMPurify 做第一层，本仓不引第三方包 ⇒
用浏览器原生 `DOMParser` 做**官方那份清单的等价剔除**（效力对齐官方清单，不多删也不少删）。
真正的兜底是官方第二、三层——`sandbox=""` 禁脚本执行 + CSP `default-src 'none'` 禁一切外链加载——**完整照抄**，
故即使清单边界有差异也执行不了脚本、发不出请求。

**验证**：typecheck 绿 · 冒烟 **511/0**（+5 条）· build 过；**抽查产物**确认 `sandbox=""`、srcDoc、
CSP 原文、禁用清单、256K 常量、截断提示键全部落位。

## 三-十二 HTML 源码态真机返工：卡顿 / 双滚动条 / 加载更多（U30 续，2026-10-04）

**用户真机反馈三条**（预览本身没问题，源码态问题大）：

1. 只加载约 5000 行就**特别卡**；官方加载约 1 万行仍很流畅；
2. 右边出现**两个滚动条**——一个很长基本不动，一个很细是正常的；
3. 到底部是「加载更多」，**不需要**、且**被挡住一半没显示完**。

**根因（三条同一个）**：我初版把源码塞进了官方 `CodeBlock`（Shiki 语法高亮）。
**官方源码态根本不用它**——`TextBody`（`documentpreview:526-548`）是**纯文本按行 `<div>`**：
`textDocument` → `<pre class=page>` → 每行一个 `<div class=line>`，等宽字体 + `white-space:pre`，
**零高亮**（CSS 也只有 `.textDocument/.page/.line`，`documentpreview:491`）。

- 卡顿：5000 行走 Shiki 高亮 ⇒ 极慢；官方纯文本 ⇒ 上万行无压力；
- 双滚动条：`CodeBlock` 自带滚动容器 + 外层 `.dsh-tdt-sv-preview-body{overflow:auto}` ⇒ 两层各一条；
- 「加载更多」：已截到 256K 就不该再翻页，按钮既无意义又遮挡提示。

**修复（照官方 `TextBody`）**：

| 改动 | 要点 |
|---|---|
| 源码态改纯文本按行渲染 | 有字节上限（HTML）时走 `data-textpreview-plain` + `<pre>` + 按行 `<div>`，**不做语法高亮** |
| 单一滚动容器 | 仅外层 body 滚动（`.dsh-tdt-sv-preview-plain{overflow:auto}`），内层不再自带滚动 ⇒ 不再两条 |
| 去掉「加载更多」 | 截到上限 ⇒ 直接末尾一行提示「因文件过大，仅显示前 256 KB 的内容」，不再渲染按钮 |

**保留**：md / 普通文本的源码态仍走 `CodeBlock`（那些文件小，高亮有价值，且是既有行为，不动）。

**验证**：typecheck 绿 · 冒烟 **514/0**（+3 条）· build 过；抽查产物确认纯文本容器、按行 div、
截断提示分支均已落位。

## 三-十三 源码态二次返工：恢复高亮 + 彻底去掉「加载更多」（U30 续，2026-10-04）

**用户贴官方截图，两条纠正**：

1. **「谁告诉你官方没有高亮了？」**——截图中官方源码态是**带语法高亮 + 行号**的（彩色 CSS 变量、斜体注释、行号列）。
2. **「加载更多，他妈还是有呢」**——仍在。

**我错在哪（两条都是我的错）**：

| 我的错误 | 真相 |
|---|---|
| 上一轮把源码态改成**纯文本无高亮**，理由是「官方 `TextBody` 是纯文本按行」 | **误认了渲染器**：`TextBody`（`documentpreview:526-548`）是给**非代码文件**用的**兜底**渲染器（注册 id `…/text`）。代码文件的源码态走 **`CodeBody` = 官方 `CodeBlock`**（`:5034`），**有高亮带行号** —— 我们**最初**的写法就是照它抄的，我上一轮把它改掉了 |
| 「加载更多」只在 `truncated` 时隐藏 | 大文件**首屏通常没到 256K** ⇒ `truncated=false` ⇒ 走的是「有 nextOffset 就出按钮」那个分支 ⇒ 按钮照旧出现。我的条件写错了，不是"没生效" |

**按官方重做（真机截图为准）**：

| 改动 | 要点 |
|---|---|
| 恢复高亮 | 源码态回到官方 `CodeBlock`（`lineNumbers: true` + `lang = languageForPath(path)` + 复制/换行工具条） |
| 彻底无「加载更多」 | 截断模式（HTML 源码态）改为**静默自动翻页**：从第一页起循环读，直到累计 ≥256K 或 `eof`；**全程无按钮**。官方「默认只显示前 512K」正是"一次给足、没有按钮" |
| 提示按官方 | 从"底部小字"改成**顶部横幅**（`flex:none`，在滚动区外）、警告色 `--tdt-warning`、措辞照官方：**「文件过大，仅显示前 256KB」** |
| 单滚动容器 | 源码态 body 加 `overflow:hidden` + flex 列（照官方 `.body:has([data-code-preview])` 规则）⇒ **只有 CodeBlock 内部一条滚动条**，这也是之前"极卡"的主因（双滚动容器每帧两次布局） |

**保留**：md / 普通文本仍走 `CodeBlock` 且仍有「加载更多」（无上限，属既有行为，官方同样按页取）。

**验证**：typecheck 绿 · 冒烟 **517/0** · build 过；**抽查产物九项**（高亮、单滚动、横幅类、横幅警告色、
无按钮条件、静默翻页、官方措辞、纯文本死类已清、data-code-preview）全部落位。

**又一次踩同一个坑**：CSS 注释里写了反引号（`.body:has(...)`）把模板字符串提前闭合 ——
这正是我上一轮刚写进本文档的规矩。**教训要落实，不能只写进文档。**
