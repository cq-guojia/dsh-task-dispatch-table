# 客户端刷新处置：轮询 → 事件驱动（替换 / 合并 / 归位 / 保留清单）

> **状态**：📝 待拍板（2026-10-06 起草）。**R1–R3 三条规矩已由用户拍板**；下方「替换 / 合并 / 归位 / 保留」四张清单待拍板后落码。
> **来源**：用户 2026-10-06 原话（「所有不该用轮询的地方都替换成通知」「做一个整体的保底机制」「该监听就监听，数据脏了页面自己刷」）+ 全仓轮询盘点 + 共享逻辑寄居/重复实现调研。
> **配套**：推送机制规格 = [`event-push.md`](event-push.md)；轮询现状（降级记录）= [`client-refresh.md`](client-refresh.md)；UI 分层规矩 = [`ui-style-guide.md`](ui-style-guide.md)；宿主流式能力 = [`external/host-webserver-streaming.md`](external/host-webserver-streaming.md)。

> **这是什么**：把「客户端刷新」从**轮询为主**改成**事件驱动为主**的**处置清单** —— 哪些轮询换成事件、哪些该合并该抽象、哪些东西位置放错了、最后留下什么。
> **怎么用**：落码时**逐条勾**；清单改本条即改。

---

## 〇、三条规矩（R1–R3，用户拍板）

| # | 规矩 | 含义 |
|---|---|---|
| **R1** | **该用通知的地方，全换成通知** | 凡是「后端变了、前端该更新」的**数据轮询**，一律改由事件推送驱动，不再定时去拉。 |
| **R2** | **重连保底统一做一份** | **不给每条轮询各做一套保底**。全站**只有一个**统一的 SSE 断线重连机制；只要页面在，它自然生效（页面无需知道、无需配置）。 |
| **R3** | **监听职责清晰** | 各页**只负责「该监听什么、收到后刷什么」**。网断 / 连不上属**特殊情况**，由 R2 的统一机制处理（**断超过 30 秒仍未连上 ⇒ 执行重连动作**）；**数据脏了页面自己重读一次即可，不做回补、不追历史**。 |

---

## 一、统一重连保底机制（R2 的落地形态）

**位置**：`src/client/event-subscribe.ts`（单例，全站唯一一条连接）——**唯一实现，别处不许再写**。

**行为**：

1. **浏览器自带重连**：`EventSource` 断开后自己会重试（这是第一层，不用我们写）。
2. **看门狗（补足「卡死型断线」）**：每 **5s** 检查一次；若**连续超过 30s** `readyState !== OPEN`（覆盖「浏览器一直在重试但连不上」与「假死但没触发 error」两种情况）⇒ **主动 `close()` + 重建**一个新连接。
3. **连上就补读**：每次 `onopen`（首连或重连成功）⇒ 通知所有 `useResync` 订阅者 ⇒ 各页**重读一次当前值**。
4. **谁都不用管**：页面只做 §四 的「订阅 + 收到后刷」，**不写任何重连、退避、兜底**。

**明确不做**：不做「轮询兜底」（R3：数据脏了页面自己刷，够了）；不做事件历史/回补（断线期间的事件可丢，设计如此）。

> ⚠️ **一个已知边界（记为未决项）**：若运行环境**根本不支持 SSE**（老浏览器，或反向代理未关缓冲），推送永远连不上 ⇒ 页面只有**首次加载**的数据、不再自动更新。是否为此加「单条长周期兜底轮询」（如 60s）**待拍板**；R3 的立场是先不加。

---

## 二、该替换成通知的（数据轮询 → 事件）

**判定标准**：这条定时器**是去问后端「变了没」**、且变化的**真源在后端** ⇒ 换成事件。共 **3 条**：

| # | 现实现 | 位置 | 现状问题 | 换成什么事件 |
|---|---|---|---|---|
| **P1** | `useInstancesRunningPoll`（5s，有在跑才启、跑完即停） | `src/client/instances-poll.ts:18-26`；消费方 `records-timeline.tsx`、`task-calendar.tsx` | 本就是为「任务跑完页面不更新」而生 —— 正是推送要解决的问题 | **`TASK_RUN_STARTED` / `SUCCEEDED` / `FAILED` / `SKIPPED` / `CHANGED`**（前端两页已在接；接齐后**删除该 hook 与两处调用**） |
| **P2** | overview 轮询（**10s 常开**，`rev` 比对） | `src/client/task-list.tsx:274`（`POLL_MS=10_000` :144，取数 hook `useTaskOverview` :181） | 无条件常开；且它是「页面自建取数通道」（`query.ts` 之外自己拼 URL + 自建 AbortController） | **`TASKS_CHANGED` + `TASK_RUN_*`**（主列表已在接；接齐后**删掉 10s 定时器**，保留 `refresh()` 作为「事件驱动的重读」入口） |
| **P3** | 设置页 / 调试快照轮询（**2s，且从不 `clearInterval`**） | `src/client/index.ts:1764`（`httpScope()` :1720-1792） | **全页常驻、从不清理**；只为设置页/调试通道服务，却让所有页面都在轮 | **`CONFIG_CHANGED`**；并把 `httpScope` 的启动**收窄到「设置页/调试页可见时」**（无该页时不启轮询） |

**附带必须修的**：`instances-poll.ts` 与 `task-list.tsx` 的 `POLL_MS` 两套「间隔」各自硬编码、`index.ts:1764` 那套**根本没有清理路径** —— 替换后这些口径问题一并消失。

---

## 三、该合并 / 该抽象的

### 3.1 合并（同一件事写了多份）

| # | 重复项 | 各写在哪 | 合并成 |
|---|---|---|---|
| **M1** | **1 秒定时器**（同一页面两条时钟） | 全局心跳 `task-info.tsx:444-461` ↔ `NextPill` 自建 `task-list.tsx:499-503` | **只留全局心跳**：抽到 `ui/ticker.ts` 并**新增 `useNowMs()`** 供 `NextPill` 用（它要 `nowMs` 值算悬浮文案，现在因此自建一条）；`NextPill` 删掉自己的 interval |
| **M2** | **「HH:mm」格式化了 4 份** | `task-info.tsx:425 clockOf` / `task-calendar.tsx:180 hhmmOf` / `records-timeline.tsx:268 hmOf`（+ :284/:369 内联） / `ui/time-range.ts:37` 内联 | 收进 **`src/client/time-text.ts`** 一处 |
| **M3** | `pad2` 2 份 | `ui/time-range.ts:32` / `ui/DateTime.tsx:45`（权威在 `format.ts:11`） | 引 `format.ts` |
| **M4** | `formatBytes` 2 份 | `file-preview.tsx:347`（无 0/负/TB、格式还不同） ↔ `format.ts:20` | 收进 `format.ts` |
| **M5** | `baseNameOf` 2 份 | `task-info.tsx:65`（导出）↔ `records-timeline.tsx:307`（同一文件已 import 另一个，却没引这个） | 收进 `format.ts` |
| **M6** | 执行时长 2 份（语义还不同） | `task-info.tsx:71 durationMsOf`（缺任一即 null）↔ `records-timeline.tsx:360 durationOf`（回退 `scheduled_at`、出字符串） | 收进 `format.ts`，**统一语义** |
| **M7** | 「复制成功 → N ms 复位」4 份（**时长还不一致**） | `file-preview.tsx:725`(1500) / `file-browser.tsx:383,559`(1500) / `ui/CodeViewer.tsx:78`(1500) / `mirror/MessageIconActions.tsx:21`(**1000**) | 一个 util（含时长常量） |
| **M8** | **取数通道：页面自己拼 URL 裸 `fetch`** | `task-list.tsx:232`（overview）/ `task-editor.tsx:1709`（attachment，且**多了个前导 `/`**）/ `config-panel.tsx:83,116` / `index.ts:1730,1774` | 全收进 **`query.ts`**（唯一取数出口） |
| **M9** | **URL 前缀常量 4 份**（前两个字面量完全相同） | `query.ts:11` / `index.ts:1718` / `event-subscribe.ts:10` / `config-panel.tsx:39` | 一份，`query.ts` 导出 |
| **M10** | 样式注入器从业务文件导出 | `records-timeline.tsx:839 ensureRecordsStyle` / `task-list.tsx:141 ensureTaskListStyle` | 各自独立 `*-css.ts`（与 `task-info-css.ts` 同构） |

### 3.2 抽象（通用能力收成一个程序）

| # | 收什么 | 收成 |
|---|---|---|
| **A1** | 全局秒级心跳（`subscribeTicker` + `visibilitychange` 补帧） | **`src/client/ui/ticker.ts`**（导出 `subscribeTicker` + 新增 `useNowMs()`） |
| **A2** | 每秒局部重渲染的文本壳 `LiveText` | **`src/client/ui/LiveText.tsx`** |
| **A3** | 时间文案整层（`NO_TIME` / `sameCalendarDay` / `relativePast` / `relativeFuture` / `countdownText` / `nextExecLabel` / `clockOf` / `renderNextExec`） | **`src/client/time-text.ts`**（与 `schedule-text.ts` / `status-text.ts` 同构的 `*-text.ts`） |
| **A4** | overview 取数 hook（含 rev 比对 / 看门狗 / 乐观 patch）+ 行类型 + 轮询常量 | **`src/client/task-overview.ts`**（`useTaskOverview` / `TaskOverviewRow` / `RunNowOutcome` / `POLL_MS`） |
| **A5** | 通用动画/交互 hook：`useFlip`(FLIP)、`useDelayedBusy` | **`src/client/ui/use-flip.ts`** / **`src/client/hooks.ts`** |
| **A6** | 错误码 → 人话 `humanizeTaskError` | **`src/client/error-text.ts`** |
| **A7** | 草稿模型（`TaskEditorDraft` / `emptyTaskDraft` / `definitionToDraft` / `draftToDefinitionJson` / `validateTaskDraft`） | **`src/client/task-draft.ts`** |
| **A8** | 设置页作用域通道（`httpScope` / `adoptScope` / `channelDiag`） | **`src/client/scope-http.ts`** |

---

## 四、位置放错的（归位）

> 判定：**共享的东西寄居在「页面/面板」文件里**，导致别的页面要 import 一个页面。共 4 处主犯。

| # | 谁 | 问题 | 归位 |
|---|---|---|---|
| **W1** | **`task-info.tsx`**（本是「卡片基础信息面板」） | **21 个导出被 3 个页面反向 import** —— 它同时是「面板」+「时间文案层」+「全站心跳」+「通用图标/工具」 | 拆：心跳与 `LiveText` → `ui/ticker.ts` + `ui/LiveText.tsx`（A1/A2）；时间文案 → `time-text.ts`（A3）；`baseNameOf`/`durationMsOf` → `format.ts`（M5/M6）；`StatusIcon`/`InfoField`/`info*Style` → `ui/` 与 `task-info-css.ts`；**面板本体留 `task-info.tsx`**，名字自此名副其实 |
| **W2** | **`task-list.tsx`**（任务列表**页**） | 导出了取数 hook（`useTaskOverview`）、共享行类型、轮询常量、通用动画 hook | 取数层 → `task-overview.ts`（A4）；类型 → 随 A4；`useFlip`/`useDelayedBusy` → A5；页面只留「列表视图」 |
| **W3** | **`task-editor.tsx`**（编辑器**页**，138 KB） | 纯文案工具 `humanizeTaskError` 与**草稿模型**住在页里，被宿主页 `index.ts` 与 `task-view.tsx` 反向 import；且与 `task-view.tsx` **双向互引** | `humanizeTaskError` → `error-text.ts`（A6）；草稿模型 → `task-draft.ts`（A7）⇒ 双向互引随之解开 |
| **W4** | **`records-timeline.tsx`**（执行记录**页**） | 从页面导出共享件：`RecordItem`（日历拉开区复用）+ `ensureRecordsStyle` | 样式注入器 → `records-css.ts`（M10）；`RecordItem` 留在原文件**但明确登记为共享件**（或后续上提 `ui/`），引用方 `task-calendar.tsx` 改为从登记处引 |
| **W5** | **`index.ts`**（宿主页，110 KB） | 设置页作用域通道（`httpScope` :1720-1792）+ 局部时间格式化 `formatTime`(:298) | → `scope-http.ts`（A8）+ `format.ts` |
| **W6** | **`editor-fields.tsx`** 的**二次 barrel** | 它把 `ui/` 的 4 个件再导出一遍（:18-21）⇒ 同一控件有**两条 import 路径** | 删掉再导出，一律走 `ui/index.ts` |
| **W7** | **`ui/index.ts` 的约定被绕过** | `ui/running.ts` / `ui/CodeViewer.tsx` / `ui/style.ts` 有业务文件**直连具体文件**（违反 `ui/index.ts:4-6` 的明文规矩） | 三者在 `ui/index.ts` **补登记**；业务文件改走 barrel |
| **W8** | **死代码** | `src/client/markdown.ts`（整模块零引用，`marked` 依赖只为它存在）；`format.ts:49 formatShortStamp` 零引用 | **删除**（并评估移除 `marked` 依赖） |

> **豁免**：`src/client/mirror/*`（官方会话面 **1:1 镜像**）按 [`ui-style-guide.md`](ui-style-guide.md) §七 边界**不纳入归位**——它自建的 1s/250ms 时钟与文案格式函数**刻意**与官方一致，不算违规。**但 `NextPill` 属业务层、不属镜像，必须按 M1 合并。**

---

## 五、最终清单：留下什么、去掉什么

### 5.1 保留（**这些不是「数据轮询」，别误删**）

| 保留项 | 位置 | 为什么保留 |
|---|---|---|
| **全局 1s 心跳**（倒计时/相对时间） | 归位后 = `ui/ticker.ts` | **时间在走**，推送解决不了；全站**只有这一条**，按需启停、局部重渲染 |
| 模型重试读秒（250ms） | `mirror/MessageItem.tsx:140` | 对齐官方 UI 节奏；条件启停 + 自停（镜像层豁免） |
| 跨零点递归 `setTimeout` | `mirror/message-chrome.ts:76` | **精准定时**，比「每秒看有没有跨天」省 86399 次 |
| FLIP 动画 / 拖拽节流（rAF） | `task-list.tsx`(→`ui/use-flip.ts`) / `ui/resizer.ts` | **一次性**排期，不是轮询 |
| **服务端调度 tick（60s）** | `src/index.ts:1406` | **任务调度的唯一驱动**——一次 tick 内跑 **Loop A**（`dispatchNewSlots`：判到点/前置/工作区/附件 → 落 `dispatched`）+ **Loop B**（`reconciler.sweep`：发动/追问/重试/租约）。**它不是为了刷页面**，不能换 |
| 服务端清道夫（6h，跨天才干活） | `src/index.ts:1420` | 清理上传临时区 |
| **SSE 心跳（20s）** | `src/index.ts:1011` | **保活**：防代理/NAT 掐掉空闲长连接（每条连接一条） |
| 事件合并窗口（200ms，一次性） | `src/event-bus.ts:69` | 攒 200ms 合并同 `type+key`，有事件才存在 |

### 5.2 去掉 / 替换（**数据轮询全部退场**）

| 去掉 | 原位置 | 由谁接管 |
|---|---|---|
| 实例运行轮询 5s | `instances-poll.ts:18` + 两处调用 | `TASK_RUN_*` 事件（P1） |
| overview 轮询 10s | `task-list.tsx:274` | `TASKS_CHANGED` + `TASK_RUN_*`（P2） |
| 设置页快照轮询 2s | `index.ts:1764` | `CONFIG_CHANGED` + 「仅该页可见时」按需（P3） |

### 5.3 最终形态（一句话）

**数据同步 = 事件推送 + 统一重连补读**（§一）；**时间显示 = 全站一条 1s 心跳**；**服务端 = 调度 tick + 清道夫 + 保活 + 合并窗口**。**业务层不再有任何「定时去问后端变了没」的轮询。**

---

## 六、实施顺序（建议批次）

1. **地基**：`event-subscribe.ts` 落 R2 的统一重连（浏览器重连 + 30s 看门狗 + 连上即 resync）。
2. **补齐页面监听**：把三页的「在屏判定 + 重读」接全（`records-timeline` / `task-calendar` / 主列表）。
3. **删 P1**（5s）→ **删 P2**（10s）→ **收窄/删 P3**（2s）。
4. **归位与合并**（可与 1–3 并行推进，互不阻塞）：W1–W8、M1–M10、A1–A8。
5. **删死代码**（W8）与依赖评估（`marked`）。
6. 每批：`typecheck` + 冒烟 + build（含 `dist/`）→ 提交。

---

## 七、边界（明确不做）

- ❌ **不做**「每条轮询各自兜底」——只有 §一 那**一套**统一机制。
- ❌ **不做**事件历史 / 回补 / 站内信（那是另一个需求）。
- ❌ **不改**宿主接口；SSE 流式能力已核实支持（见 `external/host-webserver-streaming.md`）。
- ❌ **不动** `mirror/*` 镜像层（§七 边界豁免）。
- ⚠️ **未决**：是否给「环境不支持 SSE」加单条长周期兜底轮询（§一 已记）。
