# dsh-plugin-core 会话弹窗（`adv/session`）槽位契约

> **类型**：🌐 **外部事实** —— 记的是**核心包**（`dsh-plugin-core`）对外暴露的行为，不是本项目的设计
> **适用版本**：`dsh-plugin-core@0.35.0`（与 `package.json` 的依赖声明一致；核心升级后按 §八 复核）
> **状态**：✅ 已核实（源码级，2026-11-06）
> **来源**：`node_modules/dsh-plugin-core/dist/adv/session/` 下
> `index.d.ts` / `SessionViewModal.d.ts` / `SessionViewModal.js` / `open-session-view.d.ts` /
> `session-css.generated.js`，以及 `dist/ui/infra/overlay-css.generated.js`
> **配套**：[`archive-session-view.md`](../features/archive-session-view.md)（本仓用法）·
> [`session-view-ui-map.md`](./session-view-ui-map.md)（官方 UI 元素对照，镜像已移交核心）

---

## 〇、一句话

核心提供一整个「只读会话弹窗」：`openSessionView`（数据链）+ `SessionViewModal`（渲染）。
0.35.0 起额外开了 5 个注入槽位，调用方**只往槽里塞自己的业务内容**，不再自绘会话。

## 一、导出面（`dsh-plugin-core/adv/session`）

| 导出 | 类型 | 用途 |
|---|---|---|
| `openSessionView(sessions, uiConversation, id, retainSource?)` | 函数 | 物化 binding → 建 chat target；不可解析返回 `null` |
| `SessionViewModal(props)` | 组件 | 只读会话弹窗（核心 Modal + 官方 1:1 镜像） |
| `SessionViewTarget` | 类型 | `target` / `loadOlder()` / `session` / `inbox` / `loadImage?` / `dispose()` |
| `DEFAULT_RETAIN_SOURCE` | 常量 | `'dsh-plugin-core'` |
| `ALIGNED_HOST_VERSION` / `ChangedFileDiff` / `openSessionReview` | — | 官方对齐版本、变更文件审阅 |

`openSessionView` 的 `retainSource` 写进宿主 `retainedBy`（弹窗关闭必须 `dispose()`）；本仓传自己的插件名，
排障时能在 `retainedBy` 里分清是谁没释放。

## 二、槽位表（0.35.0 新增，`SessionViewModalProps`）

| 槽位 | 渲染位置 | 与既有标题的关系 | 备注 |
|---|---|---|---|
| `title?: ReactNode` | 标题**行**（第一级） | 替换标题文字；下方 `sessionId` 副标题行与归档徽标**不受影响** | 缺省 = `heading`，再缺省 =「会话预览」 |
| `heading?: string` | 同上 | **已 deprecated**（0.34 旧名，只收字符串） | 两者都给时以 `title` 为准 |
| `header?: ReactNode` | **整块左侧标题区**（标题行 + `sessionId` 行 + 归档徽标） | 传了则 `title` / `heading` 失效；归档徽标改挂右侧动作区最前 | 右侧「继续对话」与 ✕ 不受影响 |
| `headerActions?: ReactNode` | 头部右侧 | 排在核心「继续对话」**之后**、✕ **之前** | 归档徽标（自定义标题时）还会再排它前面 |
| `bodyHeader?: ReactNode` | 会话内容**最顶端** | — | 在滚动容器内、所有节点与「加载更早」之前，**随会话一起滚** |
| `bodyFooter?: ReactNode` | 会话内容**最底端** | — | 在最后一条内容与运行中行之后，**随会话一起滚**（不是贴底固定条） |

实现位置（`SessionViewModal.js`）：`bodyHeader` 包一层 `div.dshpc-sv-body-header`（`margin-bottom:var(--dshpc-space-3)`）；
`bodyFooter` 包一层 `div.dshpc-sv-body-footer`（`min-width:0`）。两行都在 `ChatViewFrame` 的 column 内，
即**在官方 scroll 容器里**，左右留白与会话正文同一条基线（调用方不需要自己补左右 padding）。

`bodyFooter` 的挂载点还有一条细节：最后一轮存在 `turn-tail` 时，它被放进该 tail 的 `tailSlot`（在核心自己的
交付网格之后、尾部动作行之前）；否则追加在全部内容之后。两种位置都保证「最后一条内容之后」。

## 三、其余关键入参

| 入参 | 行为 |
|---|---|
| `sessionId` / `view` / `onClose` | 必传 |
| `forkSession(sessionId, atSeq?)` | 归档会话的「继续对话」→ 确认框 → fork 出子会话 |
| `openHostSession(sessionId)` | **决定按钮是否出现**（`showContinue = openHostSession !== undefined`）；未归档时点击 = 关弹窗 + 跳官方会话页；归档时走 fork 确认框 |
| `onContinue(message)` | 缺省不渲染底部暂存输入框（预览不受影响） |
| `onOpenFile(path, sessionId, options?)` | 工具卡 / md 行内 mention / 交付卡的唯一出口；**缺省 = 链接降级纯文本**。`sessionId` 由核心自动透传 |
| `onOpenReview(locator)` | 变更文件卡点击出口；缺省 = 整卡不可点 |
| `t?: Translate` | **核心自己的字典**。本仓 `t` 的键与核心不同，**不透传**（否则核心文案会变成原始 key） |

## 四、外壳与样式归属

- 外壳 = 核心 `Modal`（`size: 'lg'`，`min(1120px,100vw-32px)` × `calc(100%-80px)`）。
- 遮罩 `div.dshpc-overlay`：`position:fixed; inset:0 var(--dshpc-page-inset-right,0px) 0 0`
  ⇒ **自动让位页面级分栏**（`PanelDock` 发布的 `--dshpc-page-inset-right`），调用方不需要再写 overlay 偏移。
- 会话中间部分 = 核心 `mirror/` 官方 1:1 复刻（官方类优先，缺失回退 `dshpc-sv-*`）。
  ⇒ 调用方**不要再维护一套 `dsh-tdt-sv-*` 会话类**；样式只剩自己槽位里的内容。

## 五、已知限制（核心当前契约没有的）

1. **没有遮罩 / 尺寸入参**：`--dshpc-page-inset-right` 之外（例如页面左侧的编辑抽屉）不会给弹窗让位。
2. **没有「用户气泡附件卡让位」钩子**：自绘实现里那种「顶部面板已展示的文件，气泡附件卡不再重复画」的做法，
   核心未暴露 exclude 参数 ⇒ 同一文件可能在顶部面板与气泡里各出现一次（信息重复，不是错误）。
3. **`bodyHeader` / `bodyFooter` 无自带滚动**：它们在会话滚动容器内，内容过长会跟着整条会话一起变长。

## 六、本仓怎么用（`src/client/session-view.ts`）

| 槽位 | 本仓塞什么 |
|---|---|
| `title` | 「会话预览 · ␣任务名（可点开查看档）␣ · ␣计划时刻」 |
| `bodyHeader` | 顶部「接收 / 随附」文件区（`TaskFileContextPanel`） |
| `bodyFooter` | 交付文件**补差**（`task_instances.outputs` 中快照 `deliverables.presented` 没覆盖的）+ 过程文件桶（`ProcessFiles`） |

交付文件为什么补差：核心按快照 turn 级 `deliverables.presented` 在最后一轮画官方网格；本仓 `outputs` 是回执落库的
权威值，老任务 / 投影未重放的会话在快照里是空的。补差 = 两边取并集且不重复。

## 七、核心并不消费的旧接口（本仓已删）

- `/api/present.host`（桌面可用性）：只服务自绘交付卡的「桌面不可用」空态；核心弹窗不读它。
- `remote.workspaceFiles` 探测：文件链接只看 `onOpenFile` 是否就位；文件面本身走核心 `connectFs` / `getFsFace`。

## 八、复核命令（核心升级后）

```bash
npm view dsh-plugin-core dist-tags
npm pack dsh-plugin-core@<版本> -C /tmp/ 2>/dev/null || (cd /tmp && npm pack dsh-plugin-core@<版本>)
# 看槽位是否变：直接读 dist/adv/session/SessionViewModal.d.ts 的 SessionViewModalProps
grep -n "bodyHeader\|bodyFooter\|headerActions\|title?:" dist/adv/session/SessionViewModal.d.ts
# 看外壳让位规则是否变
grep -n "page-inset-right" dist/ui/infra/overlay-css.generated.js
```

不一致时以**源码现状**为准并回写本文件（含适用版本变更）。
