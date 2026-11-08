# 核心分栏容器 `PanelDock`（源码级事实）
- 用途：记录该外部依赖在本项目里实际用到的行为与边界（宿主升级后据此复核）。
- 版本真源：包名与版本见上「适用版本」；每条结论的 `文件:行号` 就在正文各节。
- 复核日期：2026-11-08（迁移当日未重新核实，结论沿用各节标注的版本）

- 类型：外部事实（`dsh-plugin-core` 的 UI 分栏控件）
- 适用版本：`dsh-plugin-core@0.35.0`（`dist/ui/layout/PanelDock.js`、`panel-dock-logic.js`、`dist/ui/infra/side-panel-css.generated.js`、`docs/help/ui.md`）
- 状态：已核实（2026-11-06，读实现源码 + 官方 ui.md，非试错）
- 来源：`node_modules/dsh-plugin-core/…`
- 配套：[`plugin-core-explorer.md`](plugin-core-explorer.md)（`openFilePreview` 自带一条 dock）、[`plugin-core-session.md`](plugin-core-session.md)（会话弹窗让位变量）

## 一、导出面（`dsh-plugin-core/ui`）

| 符号 | 形态 | 用途 |
|---|---|---|
| `createPanelDock(options?)` | 工厂 | 造控制器；**状态在控制器上**，组件只订阅 |
| `PanelDock` | React 组件 | 分栏行本体；**必须由调用方放进自己的 flex 根容器**（它是布局成员，不是浮层） |
| `DockPanel` | React 组件（自身不渲染） | 声明一栏的结构 / 内容；**必须是 `PanelDock` 的直接子元素**（可条件渲染成 `null`） |

`createPanelDock` 的选项：`maxPanels`（默认 3）、`defaultWidth`（默认 460）、`minWidth`（默认 320）、`storageKey`（宽度记忆前缀，默认 `dshpc-dock`；传 `false` 关闭记忆）、`onOpen` / `onBeforeClose`（返回 `false` 可取消）/ `onClose` / `onResize` / `onLimitReached`。

`DockPanel` 的 props：`id`、`title` / `icon` / `extra`、`header`（`undefined` = 内置头、`null` = 不要头、其他 = 整块替换）、`closable`、`closeButton`（`auto` / `header` / `floating` / `none`）、`width` / `minWidth` / `maxWidth`、`ariaLabel`、`children`。

控制器：`open` / `close` / `toggle` / `isOpen` / `collapse` / `expand` / `isCollapsed` / `ids` / `setWidth` / `subscribe` / `getSnapshot` / `defaults`。

## 二、硬契约（会悄悄踩到的点）

| 点 | 事实 |
|---|---|
| 显隐 | **命令式**：`dock.open(id)` / `dock.close(id)`，只传 id 不传内容；重复 `open` 已存在的不重建（`emit` 同引用直接返回） |
| 布局 | `PanelDock` 是横向 flex 行里的成员，靠调用方的根容器把它放进去；不能挂 `document.body`（那样只能遮盖、挤不窄） |
| 同页多分栏 | **支持多个独立实例**（例如预览一条、任务一条），核心按实例把宽度**求和**写进 `documentElement` 的 `--dshpc-page-inset-right`（全部关掉即移除） |
| 主区保底 | `PanelDock` 的 `mainMinWidth`（默认 480）只作用于**本实例内**的拖拽夹宽；跨实例不互算 ⇒ 多实例并存时，谁先开、谁后开要自己按需给 `maxWidth` |
| 宽度记忆 | 按 `storageKey` + 栏 id 存 localStorage；重开时再夹一次（宽屏拖到 900，换窄窗口不会把主区挤没） |
| 收起 | `collapse` 后栏退出布局、变成右侧固定耳朵（宽度保留）；`expand` 还原；收起/展开**不触发** `onClose` |
| 关闭钮 | `closable=false` ⇒ 不出（也不会因 `header=null` 自动浮出 ✕）；`header=null` + `closable=true` ⇒ 右上角浮 ✕ |
| 皮肤 | 面板 = `dshpc-side-surface dshpc-dock__panel`（sticky、100vh、阴影、`side-in` 入场动画）；内容区 = `.dshpc-dock__body`（`flex:1 1 auto; min-height:0; overflow:auto`）。**内容自己滚时给根节点 `height:100%`**，别让 body 再滚一层 |
| 头部 | 内置头 = `.dshpc-dock__head`；传 `header={null}` 时**头由内容自己画**（收起耳朵仍由核心画在面板左缘外） |

## 三、本仓用法（`src/client/index.ts`）

- 控制器：`createPanelDock({ maxPanels: 1, defaultWidth: 520, minWidth: 520, storageKey: 'dsh-tdt-editor' })`，模块内 `useMemo` 一次。
- 结构：`h(PanelDock, { dock: editorDock, mainMinWidth: PAGE_MIN_WIDTH }, h(DockPanel, { id: 'task-editor', header: null, closable: false, closeButton: 'none', width: 520, minWidth: 520 }, editorContent))`，作为 `#dsh-tdt-root` 的 flex 成员。
- 显隐：`editor` state 有值 `open`、无值 `close`；收起后再点任务会自动重新展开（`open` 会摘掉 collapsed 标记）。
- 关闭路径仍走本仓内容里的 ✕ / Esc / 脏判定确认层（核心 ✕ 已关掉，避免两套确认）。
- 预览那条 dock 是 `openFilePreview` 自己造的（`maxPanels: 1`），与编辑 dock **不同实例**；打开预览时按编辑 dock 快照宽度（`getSnapshot().widths[id] ?? defaults.defaultWidth`）算 `maxWidth`，保住主区最小宽。

## 四、复核命令

```bash
sed -n '1,140p' node_modules/dsh-plugin-core/dist/ui/layout/PanelDock.d.ts
sed -n '190,260p' node_modules/dsh-plugin-core/dist/ui/layout/PanelDock.js   # 宽度夹取 / inset 求和
sed -n '340,389p' node_modules/dsh-plugin-core/dist/ui/layout/PanelDock.js   # 面板结构 / 收起耳朵 / body
```

## 更新日志

- 2026-11-08 23:05:00：按 koc-code-docwriter 槽位规范从 design/ 迁入 dependencies/（仅移动，正文未改）
