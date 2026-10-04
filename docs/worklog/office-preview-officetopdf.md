# Office 预览接入官方 `remote.officeToPdf`（doc/docx/ppt/pptx）

> **状态**：🔵 **落码完成**（2026-10-05；typecheck 绿 / 冒烟 **598/0** / build 过），⏳ **真机验证待做**（取决于宿主是否启用文档预览服务）
> 日期：2026-10-05 ｜ 关联：`design/external/dsh-capabilities.md`「Office 预览：官方 remote.officeToPdf」｜ 归档索引：`PROGRESS-HISTORY.md`

## 一、背景：用户报的是什么

用户在**本插件预览面**打开 `.xlsx` / `.ppt` 都看到：

> 二进制文件，暂不支持预览。可复制路径后在工作区中打开。

而用**原生工作区**打开时：PPT 报「读取失败：Office 预览不可用。请在运行 DeepSeek Harness 的主机上启用文档预览服务。」，**Excel 却能正常渲染**。

用户诉求：先搞清楚「到底原生就支持还是要插件、怎么做」，先不动代码；随后拍板 **Excel 向后讨论、先做 PPT（Office 预览）**。

## 二、调研结论（源码核实，逐条带出处）

1. **两条完全不同的路线**，这是最容易被混为一谈的地方：
   - **Excel 表格 = 纯前端**：官方 `documentpreview` 的懒加载分包 `lib/client.excel.js`（7.06 MB）用 `@fortune-sheet/react` + SheetJS，Worker(`name:"dsh-excel"`) 解析成只读表格表示。
   - **Office（doc/docx/ppt/pptx）= 主机侧转换**：官方 `ctx.inject(['remote','remote.officeToPdf','remote.workspaceFiles'])`，调 `remote.officeToPdf.render(...)` 把 Office 转成 **PDF** 后再渲染。
2. **借不到官方 Excel 引擎**（三死路）：client 导出面全是 `type`；引擎在官方私有分包；唯一挂载面是右栏 seat（决策 39 已排除）。且每插件独立打包 ⇒ 官方引的 `fortune-sheet` 不会与我们共享，要同款必须自己 `npm install`（增体量 ~1~2 MB，破本仓「绝不引第三方包」原则）。
3. **Office 路线反而零 npm 依赖**：`@deepseek-ai/dsh-office-to-pdf` 的 `./remote` 只是 `declare module` 扩展（构建期类型），`documentpreview` 也只把它放 **devDependencies** ⇒ **运行时服务由宿主提供**。本仓惯例（见 `src/client/index.ts` 顶部「宿主能力的类型全部本地结构化声明」）⇒ 我们**本地声明服务面 + dotted inject** 即可，不用装任何包。
   - ⚠️ 这一点纠正了过程中「必须引官方包才能拿到类型」的早期说法：**引包只是为了拿类型，本地声明同样成立**。
4. **关键契约**（`@deepseek-ai/dsh-office-to-pdf@0.2.0-rc.2`）：
   - 服务名 `remote.officeToPdf`；`render(scopeId, path, priority, signal?) => Promise<RemoteResult<RenderedDocumentBytes>>`；
   - `priority = 'foreground' | 'background'`（前台预览取 `foreground`）；
   - `RenderedDocumentBytes extends WorkspaceFileBytes` ⇒ PDF 字节在信封 payload 的 **`data: Uint8Array`**（与 `readBytes` 同字段名 ⇒ 可复用既有 `bytesOf`）；
   - ⚠️ `OfficeExtension` **含 `xls` / `xlsx`** ⇒ 表格也能经此转 PDF 预览，但用户拍板「Excel 向后讨论」⇒ **本轮不纳入**，避免与「可编辑表格引擎」路线混谈。
5. **host 侧风险（非前端能解）**：引擎 `@deepseek-ai/libreoffice-kit` 的 `optionalDependencies` **没有 linux-x64 原生包**（仅 wasm / win32-x64 / win32-arm64 / darwin-x64 / darwin-arm64）⇒ 宿主启用服务 ≠ Linux 主机一定能转。

## 三、实现（改了什么）

- `src/client/file-preview.tsx`
  - 新增 `OFFICE_KINDS = ['doc','docx','ppt','pptx']`；`previewKind` 返回类型加 `'office'`，命中即 `mime: 'application/pdf'`。
  - 新增 `OfficeToPdfFace`（本地结构化声明，零 npm 依赖），注释里逐字写清契约出处。
  - 新增 `OfficePreview`：`render(sessionId, path, 'foreground')` → `bytesOf` 取 `data` → `Blob` → `objectURL` → **复用既有 PDF 的 `iframe` 渲染**（同 `dsh-tdt-sv-preview-pdf` class）；卸载 revoke。
  - `errView` 加两分支：`invocation-unavailable` / `service-unavailable` →「Office 预览不可用」；`failed` + `details.reason === 'unavailable'` 同样，其余 →「转换失败」。
- `src/client/locales.ts`：新增 `previewOfficeUnavailable` / `previewOfficeFailed`（中英齐备），不可用文案与官方逐字一致。
- `src/client/index.ts`：新增 `ctx.inject(['remote','remote.officeToPdf'])`（**dotted** 注入，与 `workspaceFiles` 同款；只注 `remote` 会永久探测失败——2026-09-28 同款根因），经 `officeRef` → `TaskPage` → `FileBrowser` / `TaskEditorDrawer` 下传。
- `src/client/file-browser.tsx` / `task-editor.tsx`：props 链加 `officeToPdf`（可空），文件体分发加 `office` 分支。
- `scripts/smoke.mjs`：6 条断言钉住（扩展名分派 / 本地声明 / 复用 PDF 渲染 / 未就位提示 / dotted 注入 / 双语文案）。

## 四、真机验收清单（待做）

> 前提：宿主须启用 `dsh-office-to-pdf` provider（否则**预期**就是「Office 预览不可用」，与官方一致，不算 bug）。

1. 打开 `.pptx` / `.ppt` / `.docx` / `.doc` ⇒ 看到**渲染后的 PDF 内容**（不是源码、不是「二进制不支持」）。
2. 打开 `.xlsx` ⇒ **仍**是「二进制文件，暂不支持预览」（本轮刻意不纳入，勿误判为回归）。
3. 宿主未启用服务时打开 Office 文件 ⇒ 提示「读取失败：Office 预览不可用。请在运行 DeepSeek Harness 的主机上启用文档预览服务。」（与官方逐字一致）。
4. 控制台出现 `[task-dispatch:client] remote.officeToPdf 已就位…`；未启用时是 `未就位…` 且**不报错**。
5. 顶栏「刷新」能触发重新转换；切换文件后旧 objectURL 已 revoke（无内存泄漏迹象）。

## 五、未决 / 遗留

- **Excel 路线待用户定**：走 officeToPdf 转 PDF（零依赖、不可编辑）还是自引 `@fortune-sheet`（可编辑、破「不引第三方包」原则）。本轮按拍板未动。
- **linux-x64 原生包缺口**：属宿主侧，前端无解；若真机 Linux 上报「不可用」，先查宿主是否就位，再查 `libreoffice-kit` 的 linux 原生包。
