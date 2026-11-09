# dsh-plugin-core/adv/explorer —— 工作区文件浏览与选择

- 状态：✅ 定型（2026-11-06 按源码核对，本仓已全量接入）
- 来源：用户 2026-11-06「文件浏览还是自己手搓的，核心已经提供了」；本轮改接
- 类型：核心包导出的宿主能力（不是 DSH 宿主接口）
- 适用版本：`dsh-plugin-core@0.34.0`
- 用途：记录该外部依赖在本项目里实际用到的行为与边界（宿主升级后据此复核）。
- 版本真源：包名与版本见上「适用版本」；每条结论的 `文件:行号` 就在正文各节。
- 复核日期：2026-11-08（迁移当日未重新核实，结论沿用各节标注的版本）
- 配套：[dsh-capabilities.md](dsh-capabilities.md)（宿主侧 FS 路由与 remote 能力）· [UI 开发手册（写插件界面时照这个做）](../development/ui-style-guide.md)（控件唯一实现表）

## 一、导出（4 个）

| 导出 | 形态 | 干什么 |
|---|---|---|
| `openFilePreview(opts)` | 命令式，返回 `FilePreviewHandle \| null` | 在**页面右侧分栏**打开文件 / 文件夹预览；外壳（占宽、拖拽、关闭、主区伸展）全由核心 `PanelDock` 管 |
| `pickWorkspaceFile(opts)` | `Promise<PickedPath \| null>` | 锚定在按钮旁的**模态选文件**；取消 / Esc / 点外解析 `null` |
| `FileBrowser` | React 组件 | 文件树本体（`openFilePreview` 内部也用它）；直接渲染需自备外壳 |
| `FilePreview` | React 组件 | 单文件预览体（面包屑 + 文本 / 源码 / 图片 / Office） |

来源：`node_modules/dsh-plugin-core/dist/adv/explorer/index.d.ts`、`docs/help/explorer.md`。

## 二、接线（宿主 + client 各一条，浏览不需要会话）

```ts
// 宿主 apply
serveFsRoute(ctx, { path: FS_ROUTE })        // dsh-plugin-core/host
// client apply
connectHost(ctx)                              // 工作区快照（照旧）
connectFs({ path: FS_ROUTE })                 // 同一个常量
```

- 本仓常量：[src/fs-route.ts](../../src/fs-route.ts)。
- `getFsFace()` 在 `connectFs` 之后**恒有值**（HTTP 实现），所以「能不能预览」不再看 `remote.workspaceFiles`；
  浏览 / 预览**不需要 sessionId**，只有两种情况要：① 相对路径的基准工作区；② Office 转 PDF。

## 三、`openFilePreview` 的硬契约（源码核实）

| 项 | 事实 |
|---|---|
| `mount` | **必须**是「包住主区」的那个元素或选择器（本仓 `#dsh-tdt-root`）。核心把它补成 flex 行、让主区伸展，关闭时还原；解析不到返回 `null`，**不回落 body** |
| `path` | 绝对路径或工作区相对路径；不传 `''` ⇒ 根节点（工作区清单 + 盘符）。⚠️ **本仓一律传绝对路径**（适用版本 `dsh-plugin-core@0.34.0`，复核日期 2026-11-09，状态 ✅ 已落码）：相对路径要由核心挑工作区锚点补前缀，锚点取自宿主工作区快照、未必是这条任务的目标工作区（真机 ENOENT）。本仓在 `query.ts:outputsOf` 按行快照基准绝对化，取不到基准才如实保留相对 |
| `content` | 与 `path` 二选一；同传忽略 `path` 并 warn |
| `closeButton` | 默认 `'none'`：文件模式用面包屑行尾那枚 ✕；`content` 模式由内容自己画；`'floating'` 才由壳画。Esc 始终有效 |
| 重复打开 | 已有 dock 时**就地重画**（`keepWidth` 保留用户拖过的宽度），不重建外壳 |
| 宽度 | `width`（默认 460）/ `minWidth`（320）/ `maxWidth` / `mainMinWidth`（默认 480）；宽度由核心持久化并夹取 |
| `--dshpc-page-inset-right` | **核心在 `documentElement` 上发布的「右侧已被核心 dock 占掉的宽度」**。本仓弹窗遮罩的 `right` 直接消费它（`PanelDock.js` 的 `publishInset`），不再自己存预览宽度 |
| 关闭 | ✕ / Esc / `handle.close()` 都会触发 `onClose`（取**首次打开**那次的回调） |

## 四、`pickWorkspaceFile` 的结果与方向

- 解析 `{ path（绝对）, isDir, workspaceRel?, workspace? }`；`workspaceRel` 是相对所属工作区的路径，可直接存附件。
- `filter.exts` 只限制可选文件（目录仍可展开）；`filter.dirs: true` 只选文件夹。
- `placement` 八档（`left-end` = 左侧展开、底边齐平，即本仓附件选择器旧浮层的位置）；`auto` = 下方优先、不够翻上方。
- `sessionId` + `path: ''` ⇒ 落在该工作区根（`FileBrowser` 的 `absOf('')`）；**无 sessionId + 空 path** ⇒ 根节点选择面（工作区清单 + 盘符）。
- `translate` 可注入调用方字典；本仓统一传核心字典 `t as coreT`（与旧 `FileBrowser` 包装一致）。

## 五、本仓用法（2026-11-06 定型）

| 场景 | 用法 |
|---|---|
| 整页 / 会话弹窗的产出物预览 | `openFilePreview({ mount: '#dsh-tdt-root', path, sessionId, ... })`，在 [index.ts](../../src/client/index.ts) 的 effect 里随 `preview` state 重画 |
| 任务编辑器「附加工作区文件」 | `pickWorkspaceFile({ anchor, placement: 'left-end', ... })`，见 [task-editor.tsx](../../src/client/task-editor.tsx) |

已删除：`src/client/file-browser.tsx`（自建 dock / 拖拽 / 根路径解析）、预览 dock 与 resizer 的本地 CSS、
`PREVIEW_WIDTH_KEY` / `clampPreviewWidth` / `startResize` 等本地宽度状态。

## 更新日志

- 2026-11-08 23:05:00：按 koc-code-docwriter 槽位规范从 design/ 迁入 dependencies/（仅移动，正文未改）
