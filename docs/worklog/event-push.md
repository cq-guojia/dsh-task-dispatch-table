# worklog：事件推送机制（SSE 事件总线）

> **状态**：🔵 进行中（2026-10-06 开工，未封卷）
> **定型产出**：[`../design/event-push.md`](../design/event-push.md)（结论以它为准，本文件只记过程）
> **工作包**：事件推送机制 —— 后端变更即时广播、前端订阅按需刷新，取代对轮询同步的依赖。

---

## 一、需求原话（用户 2026-10-06）

1. 「我发现很多地方，特别是任务的状态，存在不同步的问题……任务在『执行中』，执行完后，我修改了任务的开关……好多地方是不是都用的轮询去解决的？我觉得是不是应该有一个统一的通知中心？」
2. 「DSH 有没有这种通知中心，或者接收这种通知的机制？……只要是这个页面打开，就能收到通知。」
3. 「我要的是一个事件推送。很多 Vue 之类的框架，里面都有事件框架……就是后端服务推送一个事件，每个前端页面去订阅这个事件。」
4. 追问四点：DSH 具不具备这种基建能力？我们是否做了一部分？是在现有基建上做还是要引包？客户端必须支持 SSE 吗、不支持怎么办？
5. 「你先不要改任何代码，先告诉我。」→ 调研结论汇报后，用户认可事件模型，要求整理成文档 + 执行计划。
6. 「以后所有的方案，不要写到那个 hindsight 里面。那里面是长期记忆，不要把方案给我扔进去。我们所有的文档方案，你读本地 docs 里面的 README 该怎么记。」⇒ **所有方案落本地 `docs/`，不进 Hindsight。**

---

## 二、调研结论（动笔前读源码得到）

- **服务端本来就是事件驱动**：`src/index.ts:1300-1302` 用 `ctx.on('session/created' / 'session/event' / 'session/disposed')` 感知会话事件，reconcile 据此写终态。轮询只存在于**客户端**。
- **客户端才是轮询**：任务配置 10s（`task-list.tsx:274`）、执行记录 / 日程「有在跑才 5s」共享 hook（`src/client/instances-poll.ts:18`）。原因是**宿主不把实例状态推给客户端**。
- **DSH 无「后端 → 前端」推送、无通知中心**：只给了服务端订阅 + 客户端 `Toast` 组件。客户端 `EventSource` 是浏览器原生能力 ⇒ **SSE 零新依赖**。
- **`task_events` 是日志，不是推送通道**（用户明确纠正把事件塞进该表的想法）。

---

## 三、用户拍板的模型

- 事件 = `{ type: 固定常量, payload?: 任意 }`；type 固定、可无参（如 FORCE_REFRESH 强制刷新）；payload 随意。
- **只发失效信号、不写库**；前端收到后自行重读真源。
- 消费模型：相关？→ 在屏？(a) 在屏则刷新 / (b) 离屏则忽略。
- 只做实时、不做历史；断线重连只补读一次「当前值」。
- **抖动合并放中间层**（广播器唯一出口），按 `type + 身份` 做 key，窗口可调 + 最大等待。
- 页面同步 ≠ 站内信通知（后者要历史/已读，不做）。

**范围三点拍板**：
1. 文档：**新建** `docs/design/event-push.md` + `client-refresh.md` 顶部指向。
2. 轮询：**本轮不动、不细化**，仅尾注「老轮询的处理」。
3. 事件目录：**全量变更点盘点**。

---

## 四、变更点盘点（code-explorer，2026-10-06）

全量清单已并入定型文档 [`../design/event-push.md`](../design/event-push.md) §六「全量映射表」。关键定位：

- **最佳注入面 = `RuntimeIndex` 的内存方法**（`src/runtime-index.ts:80-100`）：`markDispatched` / `markTerminal` / `markBlocked` / `clearRunning` / `markDefinitionsChanged` / `rebuild`——运行态变更全部必经，包一层即覆盖，且不侵入 `store`。
- **定义类唯一同步点 = `onDefinitionsChanged`**（`src/index.ts:269-273` / `:1143` / `:1355-1358`）。
- 其余走路由直发（附件上传 `src/index.ts:319`、历史删除 `:630-631`）与 `scope.watch`（`:1322-1328`）。
- ⚠️ **不在 `store` 内 emit**（`transition` / `transaction` 会把广播器焊进数据层、且与回滚冲突）。
- **注入时序**：`webServer` 注册早于 `settings inject`（`src/index.ts:1064-1067`）⇒ 路由只传 `getBroadcaster` getter，实体在 inject 内建。
- 前端已有可复用 `load` / `refresh`：主列表 `useTaskOverview().refresh`（`task-list.tsx:290`）、记录页 `load`（`records-timeline.tsx:909`）、日历 `load`（`task-calendar.tsx:268`）；`/tasks/overview?rev=` 已有增量协议（`src/index.ts:584-585`）。

---

## 五、过程记录

### 2026-10-06 · 开工 + 落文档
- 新建 [`../design/event-push.md`](../design/event-push.md)（事件模型 / 目录 / 广播器 / SSE / 变更点映射 / 前端消费 / 实施步骤 / 能与不能）。
- [`../design/client-refresh.md`](../design/client-refresh.md) 顶部加「已被 event-push 取代」指向。
- 下一步：核实 `dsh-host-webserver` 流式能力（`docs/design/external/host-webserver-streaming.md`）→ 实现目录 / 广播器 / SSE 端点 → 接线 → 前端订阅 → 页面接入 → build/smoke/typecheck。

### 2026-10-06 · 基建落码（后端 + 前端）

- **宿主流式能力已核实**（`@deepseek-ai/dsh-host-webserver@0.2.0-rc.2`）：`WebRoute.handler` 收的是**原始 `http.ServerResponse`**，类型注释明写支持 SSE（"may hold the response open, e.g. SSE"）；gzip 中间件显式跳过 `text/event-stream`；无响应超时 / 不主动回收。结论落 [`../design/external/host-webserver-streaming.md`](../design/external/host-webserver-streaming.md)。
- 新增 `src/event-catalog.ts`（事件目录：纯常量、无 Node 依赖，前后端共用）+ `src/event-bus.ts`（唯一出口 + 按 `type+身份` 窗口合并 + 最大等待 + `dispose` 清理）。
- `src/index.ts`：`DispatchWebResponse` 补 `write`；新增 SSE 路由 `GET /api/task-dispatch-table/events`（复用同源闸门、20s 心跳、断开退订）；创建广播器并按**四处**注入（`RuntimeIndex` 包裹层 / `resyncTaskMap` / `scope.watch` / `createReconciler` 的 `emit`）。
- `src/reconcile.ts`：注入 `emit` + 局部 `notifyRow`，补上**不经 RuntimeIndex** 的实例行变化（重试退回 / unknown 复活 / 转 running / redispatch）。
- 新增 `src/client/event-subscribe.ts`（单例 `EventSource` + `useEvents` + `useResync`）。
- 页面接入：主列表（`src/client/index.ts`）、执行记录（`records-timeline.tsx`）、日程（`task-calendar.tsx`）；卡片面板经 `runSig` 自动驱动，**未改**。
- 冒烟新增 [19] 段（目录映射 3 条 + 广播器合并 4 条）⇒ **648/0**；`typecheck` 绿；`build` 过（`dist/` 已更新）。
- ⏳ 待办：真机验收（装 `dist/` 确认「任务跑完 / 改开关 ⇒ 开着的那页即时更新」）；反代场景关 SSE 缓冲；轮询处置另立项。

### ⚠️ 踩坑：本工作区并行批量编辑会丢更新（2026-10-06 实证）

同一文件**一次性并行发多个 `replace_in_file`** 时，**每批各丢 1 处**（本轮丢了：接口 `write` 声明、`eventBus` 声明、`event-catalog` import、2 处 `notifyRow`、`emit` 解构），直到 `typecheck` 才暴露。

**对策（照做）**：同一文件**逐个改**，改完 `grep -c` 核对改动是否落盘，**再跑类型检查**。AGENTS.md 早已警示「同一文件并发写入会导致批量编辑丢失」，本次是实证。
