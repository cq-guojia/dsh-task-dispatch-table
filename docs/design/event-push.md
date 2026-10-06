# 事件推送机制（SSE 事件总线）

> **状态**：🔵 落码（2026-10-06 起）
> **来源**：用户 2026-10-06 拍板「别老用轮询，要一套事件推送」；设计要求（事件模型 / 合并位置 / 断线语义）由用户逐条确认，见 [`../worklog/event-push.md`](../worklog/event-push.md)。
> **配套**：现状（轮询）见 [`client-refresh.md`](client-refresh.md)（**已被本篇取代**，保留作降级记录）；宿主流式能力见 [`external/host-webserver-streaming.md`](external/host-webserver-streaming.md)；客户端取数层见 [`code-conventions.md`](code-conventions.md)。

> **这是什么**：本插件前后端之间的**单向事件推送总线**——后端一发生任务相关变更就广播一个「失效信号」，已打开的前端页面订阅后按需刷新自己。
> **怎么用**：改后端变更点 → 在注入面 emit 一个事件；改前端页面 → `useEvent(type, handler)` 订阅、按「相关？在屏？」决定刷不刷。**不要把事件写进数据库**，也不要新增 npm 包。

---

## 一、事实前提（先读源码、勿猜）

1. **宿主（DSH）不把实例状态推给客户端**：服务端 `reconcile` 靠 `ctx.on('session/event', …)` 得知终态再写库（`src/index.ts:1300-1302`），这一步发生在服务端，浏览器感知不到 ⇒ **「后端 → 前端」这条通道必须我们自己建**。
2. **宿主没有通知中心 / 前端事件总线**：DSH 只给了服务端订阅（`ctx.on`）与客户端 `Toast` 组件（本地弹窗，非推送）。频道、事件类型、载荷全由我们定义。
3. **推送通道 = SSE**：`text/event-stream` 是普通 HTTP 响应（Node 原生支持写出），前端用浏览器原生 `EventSource` ⇒ **零新增 npm 依赖**。
4. **同源闸门已就位**：现有路由用 `isTrustedDispatchRequest`（`src/index.ts:84-94`，认 `Origin`/`Host` 同源，无 `Origin` 时放行回环）⇒ SSE 端点直接复用；`EventSource` 不能带自定义请求头，但该闸门不需要自定义头。

> ⚠️ 前提 3/4 的**宿主侧**（`dsh-host-webserver` 是否支持流式响应、是否缓冲、是否超时回收）必须**先读源码核实**再落码，见 [`external/host-webserver-streaming.md`](external/host-webserver-streaming.md) 与 §八。

> 📌 **引用口径（2026-10-07）**：本篇早前写的是**行号**引用，而实现随后被改过多轮，行号已整体漂移、**不可再当定位依据**。凡引用一律以「**文件名 + 函数名 / 关键词**」为准；本文档中残留的具体行号仅作「大致位置」参考，**冲突时以源码为准**（`AGENTS.md`）。**要守的事实请以 `scripts/smoke.mjs` 的 `[19]`/`[20]`/`[21]` 段为准**——那些是机器可执行、会红的契约。

---

## 二、事件模型

```
{ type: 固定常量, payload?: 任意业务对象 }
```

- **`type` 固定**：取值来自 §三的事件目录（共享常量，谁都不许随手造新码）。
- **`payload` 任意**：可为空、可为 ID、可为 JSON；由各业务自定义，前端按 `type` 自行解。
- **可无 payload**：如 `FORCE_REFRESH`（后端升级后强制前端重读）。
- **事件是「失效信号」，不承载数据、不写库**：数据本来就在 `task_definitions` / `task_instances` 里（变更时已落库），事件只负责说「某某变了，去重读」。
  - ⚠️ **不得把推送事件写进 `task_events`**：那张表是**日志**（审计/诊断），不是推送通道，两者无关。
  - ⚠️ **不得新增持久化**：本机制不做历史、不做已读未读（那是「站内信通知」，另一个需求）。

---

## 三、事件目录（`src/event-catalog.ts`，前后端共用）

纯常量、无 Node 依赖（要能被 tsdown 内联进单文件客户端产物 `dist/client.js`）。

```ts
export const EventType = {
  TASKS_CHANGED:    'tasks.changed',      // 任务定义增删改（含开关 / 整批 / 版本删除 / 附件文件变更）
  TASK_RUN_STARTED: 'task.run.started',   // 实例进入 dispatched/running（自动调度或「立即执行」）
  TASK_RUN_SUCCEEDED: 'task.run.succeeded',// 实例成功终态
  TASK_RUN_FAILED:  'task.run.failed',    // 实例失败终态（含判死 / 租约回收 / 回执缺失）
  TASK_RUN_SKIPPED: 'task.run.skipped',   // 跳过 / 错过刻度 / 过期 / 阻塞（未执行的原因类）
  TASK_RUN_CHANGED: 'task.run.changed',   // 其余实例行变化（重试退回、unknown、删除、附件缺失）
  CONFIG_CHANGED:   'config.changed',     // 插件配置变更
  FORCE_REFRESH:    'force.refresh',      // 无参：强制前端重读
} as const
export type EventTypeValue = typeof EventType[keyof typeof EventType]

export interface PushEvent { type: EventTypeValue; payload?: Record<string, unknown> }
```

**payload 约定**（2026-10-06 专家团审计后**与实现逐条校准**，此前文档比实现更「丰盛」）：

| type | payload | 说明 |
|---|---|---|
| `TASKS_CHANGED` | **无**（现实现不带） | 定义类变更**不区分粒度**，订阅方一律按「全量重读」处理。代价可忽略：`/tasks/overview?rev=` 自带增量协议，未变则回 `unchanged`。将来真需要精细化再加 `{ids, mode}` |
| `TASK_RUN_STARTED` / `SUCCEEDED` / `FAILED` / `SKIPPED` / `CHANGED` | `{ taskId }`（个别来源另带 `instanceId`） | **主路径只给 `taskId`**（`markDispatched` / `markTerminal` / `markBlocked` / `clearRunning` 都只有任务级身份）⇒ 各页**在屏判定按任务级做**。`instanceId` 仅 `reconcile` 的 `notifyRow` 会带，属补充信息、订阅方**不可依赖** |
| `CONFIG_CHANGED` | 无 | 目前无参 |
| `FORCE_REFRESH` | 无 | 需要强刷时用；**后端目前没有发送点**（预留码；启动/重建都跑在客户端连上之前，本来也没有订阅者） |
| `sys.ping`（`HEARTBEAT_TYPE`） | 无 | **不是业务事件**，只作连接保活，见 §五 |

> 事件只带「哪些 id 变了」，**不带变更后的值**——值由订阅方重读拿（真源唯一）。

---

## 四、后端：广播器（唯一出口 + 中间层合并）

**文件**：`src/event-bus.ts`（进程内，无持久化）。

```ts
export interface EventBus {
  emit(event: PushEvent): void                            // 变更点唯一调用口（不写库）
  subscribe(send: (event: PushEvent) => void): () => void // 每个 SSE 连接订阅；返回退订
}
export function createEventBus(opts?: { windowMs?: number; maxWaitMs?: number }): EventBus
```

**合并（debounce）放中间层**——只在广播器这一个出口做，**不在前端各页分散写**：

- **key = `type` + 身份**：身份按 `payload.taskId` → `instanceId` → `id` → `ids.join(',')` 的优先序取第一个命中的；都没有则只按 `type`。
  - ⚠️ **优先取 `taskId`**（2026-10-06 审计）：同一任务的不同实例在同一窗口内会被**合并成一条**、且只保留**最后一条**的 payload。因为主路径本来只带 `taskId`、各页也按任务级判定，这不影响正确性 —— 但**不要**在事件里塞「必须逐实例保真」的信息。
- 同 key 在窗口内来 N 次 → **只发最后 1 次**（事件不带数据，合并零信息损失）。
- **窗口** `windowMs` 是可调常量（默认 200ms；20ms/500ms 皆可，改一处全局生效）。
- **窗口语义 = 「从该 key 首个事件起算」的固定窗口**（**不是**「等静默才发」的 debounce）：定时器**不被后续事件重置** ⇒ 持续高频也会每 `windowMs` 必发一次，**本来就不存在「被无限推迟」的问题**。
- 因此 `maxWaitMs` 只在 `windowMs > maxWaitMs` 时才起封顶作用（默认 200 < 1000 ⇒ **实际不生效**）；保留它是为了将来把窗口调大时仍有一个上限。
- 无订阅者时：合并后直接丢弃（无人听，无需缓冲）。

**清理**：广播器的 flush 定时器与订阅集合在插件 `dispose` 时清理（复用现有 `sctx.on('dispose', …)`，`src/index.ts:1366`）。

---

## 五、后端：SSE 端点

在既有 `makeDispatchRoutes(...)` 内新增一条 `exact` 路由：`GET /api/task-dispatch-table/events`。

- **闸门**：复用 `isTrustedDispatchRequest`（`src/index.ts:84-94`）。
- **建连**：写响应头 `content-type: text/event-stream; charset=utf-8`、`cache-control: no-store`、`connection: keep-alive`、`x-accel-buffering: no`。
  - ⚠️ 实现**没有**显式调 `flushHeaders()`（2026-10-06 校准）：紧随其后的首个 `write`（`: connected`）就把头发了出去，没有实际影响。
- **订阅**：`res.write` 前 `bus.subscribe(send)`；**只在 `res` 的 `close` 上退订**（`cleanup` 幂等，可被 close / 写失败 / dispose 三路重入），并在 `cleanup` 里**主动 `res.end()`** 收尾——否则 dispose / 写失败路径只停了心跳、响应还挂着，全靠宿主 `closeAllConnections()` 兜底，宿主行为一变就留下一堆「心跳已停的哑连接」（2026-10-06 审计）。
- **连接登记表**：每打开一条连接，把一个幂等清理函数登记进 **apply 实例级**的 `streams`（`makeDispatchRoutes` 的末位参数），dispose 时统一关闭。
  - ⚠️ **绝不能放模块级**：模块级集合被同一模块的多个 apply 实例共享 ⇒ 任一实例 dispose 会把**另一个实例**刚建立的连接一起关掉（2026-10-06 审计）。
  - ⚠️ **绝不能同时挂 `req` 的 `close`**（2026-10-06 审计实证）：Node ≥16 下 `req` 的 `close` 语义是「请求消息读完」而不是「连接断开」——GET 无 body，**一旦有中间件消费过请求流（`req.resume()` / 读 body），它会在建连瞬间触发**，当场退订、客户端再也收不到任何事件（实证：该变体下 `CLEANUP via req.close` 立即打印、客户端连接被终止）。SSE 断连的唯一可靠信号是 `res` 的 `close`。
- **写出**：每条事件 `data: <JSON.stringify(event)>\n\n`。
- **心跳**：每 `SSE_HEARTBEAT_MS`（20s）写一条**真实 data 帧** `data: {"type":"sys.ping"}\n\n`，保活穿代理。
  - ⚠️ **不能用 SSE 注释帧（`: ping`）**：注释帧浏览器直接吞掉、前端 `onmessage` 根本看不到 ⇒ 客户端**无法判断「这条连接是否还活着」**，「`readyState` 是 OPEN 但已经半死」（反向代理静默丢流 / 无 FIN 的黑洞）永远发现不了、永不重建。
  - `sys.ping` 由 `HEARTBEAT_TYPE` 定义、**不在业务事件目录里** ⇒ 前端 `byType` 查不到、直接丢弃，不会被当成业务事件派发。
- **插件 dispose**：`closeAllEventStreams()` 主动清掉所有在开连接的心跳定时器（不只依赖宿主 `closeAllConnections()` 触发 `res` 的 `close`）。
- **响应契约扩展**：现有 `DispatchWebResponse`（`src/index.ts:64-68`）**只声明 `writeHead`/`end`**，SSE 需补 `write`（可选方法，先核实宿主真身支持分块，见 §八）。
- **注入时序**：路由注册（`webServer` inject）**早于** `settings inject`，但广播器 `eventBus` 是**纯进程内、无宿主依赖**的 ⇒ 在 apply 顶层**提前建好**、作为实参直接传进 `makeDispatchRoutes`（`src/index.ts` 建 `eventBus` / `activeStreams`，调用处一并传）。
  - ⚠️ 2026-10-06 校准：本文档早前写的「路由侧只传 `getBroadcaster` 惰性 getter、广播器在 settings inject 内创建」与实现**相反**，已改正。（`getScheduler` 那种惰性 getter 仍然需要——它依赖 settings 就绪。）

---

## 六、后端：变更点接入（全量盘点 → 事件映射）

**注入面（首选，不碰 `store` 数据层）**：

1. **`RuntimeIndex`（内存派生索引，`src/runtime-index.ts`）**——所有运行态变更必经其方法：`markDispatched` / `markTerminal` / `markBlocked` / `clearRunning` / `markDefinitionsChanged` / `rebuild`。在 `src/index.ts` 注入给 scheduler/reconciler 的 runtime 对象上**包一层 emit**，即可覆盖绝大多数运行态变化，且完全不侵入持久层。
2. **`onDefinitionsChanged`（`src/index.ts:269-273` 声明 / `:1143` 注入 / `:1355-1358` 实体）**——定义变更的唯一同步点（注释明写「新增写路径时只在这里加一处」）⇒ 在此 emit `TASKS_CHANGED`。
3. **路由内直发**——不经过上面两者的（如附件上传、历史版本删除）在各自 handler 内 emit。
4. **`scope.watch`（`src/index.ts:1322-1328`）**——配置变更（含外部改配置）⇒ emit `CONFIG_CHANGED`。

> ⚠️ **不在 `store` 内 emit**（`transition`/`transaction`）：会把广播器焊进数据层，且 `transaction` 内 emit 与回滚语义冲突（`src/store.ts:787` / `:429`）。

**全量映射表**（触发位置为核实落点）：

| 变更点 | 事件类型 | payload | 触发位置 |
|---|---|---|---|
| 任务删除 | `TASKS_CHANGED` | 无 ids（全刷） | 落库成功 → `onDefinitionsChanged` |
| 任务整批替换 | `TASKS_CHANGED` | 无 ids | 同上 |
| 任务新增/编辑保存 | `TASKS_CHANGED` | 无 ids | 同上 |
| 开关实时写回 | `TASKS_CHANGED` | 无 ids | 同上 |
| 版本 / 快照删除 | **不发** | — | 该路由只删**磁盘文件**、不动任务定义（`src/index.ts` `DELETE .../versions\|snapshots`）⇒ 页面数据不变。⚠️ 2026-10-06 审计校正：原文错误地写成会发 `TASKS_CHANGED` |
| 附件搬移/移除/整删 | `TASKS_CHANGED` | 无 ids | 随定义保存/删除一起发（同一条）；**单独上传不发**（文件还没被任何任务引用，没有页面需要刷） |
| 派发（自动）/ 立即执行 | `TASK_RUN_STARTED` | `{taskId}` | `src/scheduler.ts` `markDispatched`（经 RuntimeIndex 包裹层） |
| 成功终态 | `TASK_RUN_SUCCEEDED` | `{taskId}` | `src/reconcile.ts` `markTerminal('succeeded')` |
| 失败终态 / 判死 / 租约回收 | `TASK_RUN_FAILED` | `{taskId}` | `src/reconcile.ts` `markTerminal('failed')` |
| 跳过 / 错过刻度 / 过期 | `TASK_RUN_SKIPPED` | `{taskId}` | `src/scheduler.ts` `markTerminal('skipped')` |
| 依赖阻塞 / 放行、开关清原因 | `TASK_RUN_CHANGED` | `{taskId}` | `src/scheduler.ts` `markBlocked`（经 RuntimeIndex 包裹层） |
| 实例删除（窗口外 pending / 附件缺失） | `TASK_RUN_CHANGED` | `{taskId}` | `src/reconcile.ts` `syncRunningAfterDrop`：**该任务已无在飞** ⇒ `clearRunning`（边沿，真变了才发）；**仍有别的在飞** ⇒ 也**直发一条**（那一行确实从库里没了，记录页/日历要少一行）——2026-10-06 审计补 |
| 重试退回 pending | `TASK_RUN_CHANGED` | `{taskId,instanceId}` | `src/reconcile.ts` `retryOrFail` → `notifyRow` |
| unknown 复活 / 转 running / redispatch | `TASK_RUN_CHANGED` | `{taskId,instanceId}` | `src/reconcile.ts` `markActivity` / `noteRunSignal` / `onCreated` / `sweep` → `notifyRow` |
| 配置变更 | `CONFIG_CHANGED` | 无 | `src/index.ts` `scope.watch` —— **唯一发射点**（正常与降级作用域都走它：`fallbackScope` 的 `watch` 已如实实现）。**边沿触发**：整份配置比对后真变了才发（「点了保存但值没变」不算）。⚠️ 2026-10-06 二次校准：此前曾在 `/config` 路由补发一条，造成**一次改动发两次**、靠合并窗口吃掉多出来的那条 —— 那是拿下游兜上游的底，已撤掉 |
| 启动扫描 / 索引重建 / 启动诊断 | **不发** | — | 都跑在客户端连上之前（那时没有订阅者，发了也没人收）；要强刷时用 `FORCE_REFRESH` |
| 历史 / 日志清理（`store.purgeLog` / `purgeHistory`） | **不发** | — | ⚠️ **2026-10-07 校正**：它**不是**启动期一次，而是**每个 tick 都跑**（在 `src/scheduler.ts` 的 `tick()` 内，官方 interval）。不发事件是**有意取舍**：删的只是超过保留期的旧行（`logRetentionDays` 默认 30 天、`historyRetentionDays` 默认 0 = 不删），用户想看的那几条几乎不可能被删；为它发事件只会白刷。**若将来把保留期调短到会删「眼前正在看的行」，这里必须补事件**。本文档早前把这行写成「跑在客户端连接之前」，与实现相反。 |
| 归档 / 反归档会话 | **不发** | — | 只影响会话弹窗可读性，列表数据不变 |

**实际注入面（落码现状，共四处）**：

1. `RuntimeIndex` 包裹层（`src/index.ts`）—— `markDispatched` / `markTerminal` / `markBlocked` / `clearRunning` 外再 emit；覆盖主界面卡片要刷的全部运行态。
2. `resyncTaskMap`（定义变更唯一同步点）—— emit `TASKS_CHANGED`（定义类改动无 ids 粒度，订阅方按全量重读处理；`rev` 增量会挡掉未变的重传）。
3. `scope.watch` —— emit `CONFIG_CHANGED`。
4. `createReconciler` 的 `emit` 注入 + 局部 `notifyRow` —— 只覆盖**不经 RuntimeIndex** 的实例行变化（重试退回 / unknown 复活 / 转 running / redispatch）。

> **租约续租（`renewLease`，`src/store.ts:810`）不推送**：每 tick × 每 running 实例的高频心跳，推它只会刷屏，且界面不展示租约。
>
> **同一动作写多列不单独发事件**（2026-10-07 补记）：`finishTerminal` 除状态外还写 `outputs` 与 token 三拆列（`recordCompletion`）、旧实例会被补 `snapshot` 列（`setSnapshot`）—— 这些**都不单独发事件**，靠同实例上那条终态事件**顺带刷到**：订阅方收到的是「失效信号」，它会**重读**，读到就是最新列，所以不会漏。
> 同理 `store.transition` 是**数据层通用写**，刻意不焊广播器 —— 由调用方（scheduler / reconcile / dispatch）决定该不该发。

---

## 七、前端：订阅封装与页面消费模型

**封装文件**：`src/client/event-subscribe.ts`（单例，全页共享**一条** `EventSource`）。

```ts
// 对外
export function useEvents(types: readonly EventTypeValue[], handler: (e: PushEvent) => void): void
export function useResync(handler: () => void): void   // 重连成功时触发一次（各页补读当前值）
```

- **单例连接**：URL = `api/task-dispatch-table/events`（相对路径）。
  - ⚠️ 前缀真源是 **`src/client/query.ts` 的 `API_PREFIX`**（`event-subscribe.ts` 从它引）；**不要**从 `src/client/index.ts` 的 `DISPATCH_API_PREFIX` 引——`index.ts` 自己也是从 `query.ts` 引的，而且冒烟里有一条断言**禁止** `index.ts` 再持有该字面量（2026-10-06 M9 收编）。本文档早前写成「与 `index.ts` 同源口径」，照做会直接踩断言。
  - 模块级只建一条，多个 `useEvents` 只是注册回调。
- **重连自愈**：`EventSource` 断线由**浏览器自动重连**；`onopen` 回调里通知所有 `useResync` 订阅者 ⇒ 各页**重读一次当前值**（补的是「当前真相」，**不追历史事件**）。
- **退订**：`useEvents` 卸载时摘回调；无回调时不断开连接（连接随页面生命周期）。

**页面消费模型**（每个页面自己定「什么事件算相关、要不要刷」）：

```
收到事件 → ① 与本页相关吗？——不相关：丢弃
          ② 相关 → 该对象在屏吗？
             (a) 在屏  → 立即刷新 / 重读该条
             (b) 不在屏 → 什么都不做（用户下拉/翻到时正常读库即最新）
```

- **相关判定**由 type 决定（如执行记录页只关心 `TASK_RUN_*`（`RUN_EVENT_TYPES`），不看 `CONFIG_CHANGED`）。
- **在屏判定**复用各页已持有的 id 集合，**不要新写取数逻辑**；只复用各页已有的 `load()` / `refresh()`。
- **`/tasks/overview?rev=` 已有增量协议**（`src/index.ts`）：`TASKS_CHANGED` 后直接调 `refresh()` 即可，`rev` 相同会自动回 `unchanged`，无需前端自己比对。

**已接入的页面（落码现状）**：

| 页面 | 订阅 | 刷新动作 | 在屏判定 |
|---|---|---|---|
| 主列表（`src/client/index.ts` 的 `useTaskOverview`） | `TASKS_CHANGED` / `CONFIG_CHANGED` / `FORCE_REFRESH` + `RUN_EVENT_TYPES` + `useResync` | `overview.refresh()` | 运行态事件：`payload.taskId` 不在 `overview.rows` 里则忽略；全局类事件直接刷 |
| 执行记录页（`records-timeline.tsx`） | `RUN_EVENT_TYPES` + `useResync` | `load(null, true)`（静默首屏；**在途时记待办、本轮结束补跑**，不丢刷新） | ① 该实例 / 该任务的某行**已在已加载列表里** ⇒ 刷；② 否则该任务**落在当前筛选内**（`taskId` + `workspace`）⇒ 也刷（典型：某任务**这次是第一行**）；否则忽略。⚠️ 少了 ② 就是「新任务首跑永不出现」（2026-10-06 审计 🔴） |
| 任务日程页（`task-calendar.tsx`） | `RUN_EVENT_TYPES` + `useResync` | `load()`（当月） | ① 该实例已在**当月网格**里 ⇒ 刷；② 否则该任务**落在当前筛选内**（`taskId` + `workspace` 双重收窄）⇒ 刷（新派发实例还没进网格也得让它出现）；否则忽略。⚠️ 原来 ② 只判「任务存在」（全量任务表、未收窄）⇒ **判定恒真**，任何任务都触发整月重拉（2026-10-06 审计 🟡） |
| 卡片展开面板（`task-list.tsx`） | `RUN_EVENT_TYPES` + `useResync`（2026-10-07 补） | 三个 tab 各自在**自己打开时**重取 | `payload.taskId === 本卡片`；事件计数并入 `runSig` ⇒ **行级**变化（`dispatched→running` / 写 `session_id` / 阻塞放行）也能驱动。此前只看 `lastStatus\|lastFinishedAt\|running` ⇒ 会一直停在「已派发」、会话链接与早期日志看不到 |
| 查看档（`task-view.tsx`） | `RUN_EVENT_TYPES` + `useResync` | 重取「上次执行」 | `payload.taskId === 本档任务` |
| 设置页 / 调试页**主面板快照**（`src/client/index.ts` 的 `TaskPage`） | `CONFIG_CHANGED` / `FORCE_REFRESH` + `useResync` | `scope.refresh()` 立即重取快照 | 全局类事件直接刷。**刻意不订 `TASKS_CHANGED`**：本页任务表是可编辑文本域，任务变更若刷掉快照会**冲掉正在编辑的内容**（「拨片被旧快照拨回」同类事故）；任务表新鲜度靠它的 2s 兜底轮询 + 保存后主动刷 |
| 调试页**原始表转储**（`/db`） | `RUN_EVENT_TYPES` + `TASKS_CHANGED` / `CONFIG_CHANGED` / `FORCE_REFRESH` | 重取 `/db` 转储 | **只在真的停在该页时**才重取（其它 tab 不白刷；转储较重） |
| 设置页**插件配置表单**（`config-panel.tsx`，宿主设置页里的卡片） | `CONFIG_CHANGED` / `FORCE_REFRESH` | 重新 `GET /config` | **只在没有未保存修改时**才跟随（否则冲掉用户正在输入的数字） |

> **已知未覆盖（有意为之，不装样子）**：**会话弹窗的「实例行」摘要**（产出 / 交付物 / 状态）是**开窗时取一次**，不随事件更新。弹窗主体（会话正文）由宿主投影、本身实时；而那条实例行的状态是经 `applyViewing` 建的，**换会话必须 `dispose` 旧句柄**（引用契约）⇒ 就地更新要动那块精细区，收益不抵风险，故登记为已知限制。需要更实时时：关掉重开即取到最新。

**特殊情形**：`TASK_RUN_*` 在「右上角飘提示 / 通知」类场景下**不看在屏、一律响应**（那是「察觉」，不是「刷新某行」）——但该功能**本轮不做**（见 §九）。

---

## 八、实施步骤（一步一步）

**第 0 步（硬前提）· 核实宿主流式能力**：读 `@deepseek-ai/dsh-host-webserver`（版本线见 `external/dsh-capabilities.md` 表头）`lib/index.js`，确认响应对象是否即 Node `http.ServerResponse`（支持 `write` / `flushHeaders`）、是否对响应缓冲、是否设连接超时或主动回收。**结论回写 [`external/host-webserver-streaming.md`](external/host-webserver-streaming.md)**；若宿主不支持流式，本方案中止并回报（不得靠运行时试探）。

**第 1 步 · 事件目录**：新增 `src/event-catalog.ts`（§三）。

**第 2 步 · 广播器**：新增 `src/event-bus.ts`（§四）。

**第 3 步 · SSE 端点**：`src/index.ts` 扩展 `DispatchWebResponse` 增 `write`；加 `/events` 路由（闸门 / 心跳 / 订阅 / 退订）；创建广播器并注入。

**第 4 步 · 变更点接线**：按 §六 映射表，在 `RuntimeIndex` 包装层、`onDefinitionsChanged`、路由直发点、`scope.watch` 四处 emit。

**第 5 步 · 前端订阅封装**：新增 `src/client/event-subscribe.ts`（§七）。

**第 6 步 · 页面接入**：主列表（`index.ts` 的 `useTaskOverview`）、执行记录（`records-timeline.tsx`）、日程（`task-calendar.tsx`）订阅相关 type，按 §七模型处理；**卡片面板无需单独订阅**（主列表刷新经 `runSig` 自动驱动其重取）；**保留现有轮询不动**。

**第 7 步 · 构建与验收**：`npm run build`（产物入 `dist/`）→ `npm run smoke` → `npm run typecheck` → 提交（含 dist）。

---

## 九、能与不能（边界）

**能做**：
- 自定义事件类型目录；后端内存 emit（不写库）；SSE 单端点广播；前端全局订阅 + 按事件筛选 + 在屏判定；中间层合并（窗口 + 最大等待）；重连补读一次；全量变更点接入。

**不能做 / 不碰**：
- ❌ 不把推送事件写进 `task_events`（那是日志）。
- ❌ 不做历史 / 已读未读（站内信通知是另一回事）。
- ❌ 不在前端各页分散写 debounce（合并只在广播器出口）。
- ❌ 不新增 npm 依赖（Node 原生 + 浏览器原生 `EventSource`）。
- ℹ️ **轮询处置已另立项并已实施**（[`client-refresh-disposition.md`](client-refresh-disposition.md)）：本节原写「本轮不删除任何轮询」，那条只描述**本机制落地那一轮**的范围；随后 P1/P2/P3 已落地（实例 5s、overview 10s 已删；设置页 2s 收窄为「有订阅者才轮 + 配置类事件立即重取」）。2026-10-06 校准。
- ❌ 不改宿主接口；不靠运行时试探猜宿主 API（先读源码）。
- ⚠️ **部署侧注意**：反向代理（nginx 等）会缓冲 SSE ⇒ 需在代理关缓冲（如 `X-Accel-Buffering: no` / `proxy_buffering off`），否则前端收不到实时推送。

---

## 十、尾注：老轮询的处理（**已另立项并已实施**）

> ⚠️ 本节原写「本轮不做、决策前不删任何轮询」，那只是**本机制落地那一轮**的范围说明。随后已另立项并按 [`client-refresh-disposition.md`](client-refresh-disposition.md) 落地（2026-10-06 校准）：

- **已删**：实例 5s 共享 hook（`instances-poll.ts` 整个删除，执行记录页 / 日程页改事件驱动）、主列表 overview 10s 常开轮询。
- **已收窄**：设置页 / 调试页 `/snapshot` 的 2s 轮询 ⇒ **只在有订阅者（页面真的打开）时才轮**，最后一个订阅者走了就停；配置类变更另由 `CONFIG_CHANGED` **立即重取**（`scope.refresh()`）。
- **仍保留**：全站 1s 时钟（`ui/ticker.ts`，**非**数据轮询）、SSE 看门狗 5s 巡检、镜像层豁免项（`mirror/*`）。
- **设计取舍**：**不做**「SSE 不可用 / 断线时退回轮询」的兜底 —— 断线由统一重连 + 重连补读覆盖；`EventSource` 缺席的环境只取一次数据并**明确告警**（不静默）。
- **页面对齐**：会展示任务运行态的地方现均已被事件驱动覆盖 —— 主列表、执行记录页、日程页、卡片展开面板（经 `runSig`）、**查看档**（`task-view.tsx`，2026-10-06 补）、设置页 / 调试页快照（经 `CONFIG_CHANGED` + 2s 兜底）。

---

## 十一、rev 协议：`/tasks/overview` 的版本号是**复合**的（2026-10-07）

前端的刷新协议是「带上一次的 rev，未变即回 `unchanged`」。**rev 必须覆盖响应里所有会变的东西**，否则客户端会**永久静默过期**（不报错、不重试）。这里踩过一个坑：

> 🔴 **附件路径不进 rev ⇒ 附件永久不可点**：行的 `attachments[].path` / `anchorSessionId` 是**在 HTTP 层补的**（`attachmentsWithPaths`），**不进 `runtimeIndex` 的内容 rev**。所以「附件才刚变得可点」（插件刚加载、assets 尚未就绪，或工作区新增 / 关闭会话导致预览锚点换人）这类变化**没有 rev bump**，客户端收到 `unchanged` ⇒ 一直显示不可点的旧行。
>
> 修法：响应 rev 改为**复合版本** `` `${内容 rev}.${附件解析 rev}` ``，附件解析 rev 在 **`session/created` / `session/disposed`** 与 **assets 就绪**时自增。客户端把 rev 当**不透明字符串**原样带回 ⇒ **协议无需改**。

**同时**：`now` / `tickMs` 两个字段**不进 rev**（改巡检间隔不会 bump）⇒ `unchanged` 响应里**也必须带上它们**，客户端要在「早退之前」吃掉 `tickMs`（否则改了巡检间隔，卡片「延期」的判定阈值永远停在旧值）。

> ⚠️ **改动须知**：往 overview 响应里**新增任何会变的字段**时，问一句「它会不会在不 bump rev 的情况下变化？」会的话，要么并进 rev，要么走独立版本号（照附件解析的做法）。

---

## 十二、已知边界（有意为之 / 已评估，不装样子）

**性能与放大（2026-10-07 审计）**

- **调试页 `/db`**：单次转储 1–3MB（5 张表 × LIMIT 500，含 snapshot 列）。事件驱动后曾变成「停在该页时每个运行态事件都重拉一次」——那是相对原行为（切页才取一次）的**明确回退**，已修：重取走 **800ms 防抖**，且已有转储时不进 loading（不卸载、不弹滚动位置）。
- **日程页**：整月轻量查询（40–100KB）。同一批 flush 的 N 条事件会通知 N 次 ⇒ 已补**在途守卫 + 待办补跑**（否则并发 N 个整月请求、只留最后一个响应）；自动刷新也改走 `silent`（不再每次事件闪一次 Loading）。
- **执行记录页**：事件刷新会把**已续拉的多页塌回第一页**（`setRows(首屏)`）。这是**保留的行为**（刷新语义就是重取首屏），代价是滚动位置回弹、已展开的下钻行可能消失。**若将来要改**：只替换第一页并「按 id 去掉尾部重复行」，别整表替换。
- **设置页 `/snapshot`** 的 2s 兜底轮询**没有降下来**（它是收窄后的遗留；配置类变化另由 `CONFIG_CHANGED` 立即重取）。它拉的是含全量实例行的 `debugSnapshot`，是**持续成本的最大头**，与推送无关。
- **空闲期是真收益**：主列表 10s、记录页 / 日程页 5s 的常开轮询都归零；推送只在真变更时动。

**交互副作用（2026-10-07 审计）**——输入面**已独立核实安全**：编辑器不订阅任何事件；设置页任务表文本域是关闭的遗留视图且 `draft ?? effectiveInline` 兜底；`config-panel` 仅在**无未保存修改**时跟随。其余：卡片展开态 / 三 tab / 下钻行 / 日历选中日 / 下拉浮层 / Toast 均**不受**事件刷新影响（有 `filterChanged`、`key=业务 id` 等保护）。已修：查看档（原会闪空白）、调试页（原会卸载整块）。

**安全边界（2026-10-07 审计）**

- **闸门 = 唯一认证，回环即信任**（`isTrustedDispatchRequest`）：`Origin` 存在时只比 `Origin.host === Host`，**不要求 Host 是回环** ⇒ 理论上 DNS rebinding 可让未授权页面读到 `/db`（含提示词 / 会话 id / 路径）。本地单用户插件的既定模型，**登记为已知风险**；真要收紧需额外加 Host 白名单（会连坐反代场景，需一并设计）。
- **反向代理**下若代理改写 / 丢失 `Host`，闸门会**误拒所有端点**（含 `/events`）⇒ 属部署配置问题，已在 §九 提示。
- **`/events` 连接数**已加宽松上限 `32`（超限 503；客户端按统一重连稍后重试）——防本机循环建连打满句柄。
- **SSE 输出面不存在帧注入**：`data:` 行只由 `JSON.stringify` 产出（换行会被转义），payload 全是服务端生成的 id，无用户可控文本。
- **附件 / 历史文件无路径穿越**：`isSafeAttachmentRef` 是唯一白名单，覆盖上传 → 保存 → 搬移 → 删除 → 读取。
- **`/config` 不能越权改非计时字段**：白名单 + 类型 + 范围三重校验。

**数据一致性边界**

- **多标签页「整份覆盖」可能丢更新**（未修，登记）：① 编辑器保存是**全量定义覆盖**（`enabled` 不在保留清单里）⇒ A 标签页拨的开关会被 B 标签页较早打开的表单**静默覆盖**；② `POST /tasks {tasksInline}` 是整批文本覆盖（该 UI 目前是关闭的遗留视图，风险潜伏）。要修需引入乐观锁（保存时带上「我基于哪一版」）。
- **时钟**：服务端下发 `now` 供客户端做「以服务端为准」的判定，但**客户端目前未消费它**（全部用本地时钟）⇒ 两端时钟有差时，「下次执行」的相对显示可能与服务端判定不一致。登记为已知限制。
- **`renewLease` / 常规 `appendLog` / 每 tick 的 `purgeLog`+`purgeHistory`** 均**有意不发**事件（理由见 §六：界面不展示 / 只改日志 / 删的都是过期旧行）。
- **`tasksInline` 整批保存**：已补**形状闸门**（非法 JSON / 非数组 / 元素非对象一律 422）—— 它此前是**唯一会持久化丢数据的路径**（保存成功后整表无人能解析 ⇒ 任务全消失且每次启动复现）。逐字段合法性仍交给运行时逐条 warn 跳过（决策 30：运行时只认不修）。

**兼容性与产物（2026-10-07 审计）**

- **JS 语法/API**：全仓 client 未使用任何超出 **chrome99** 的 API（`Array.at` / `findLast` / `Object.hasOwn` / `structuredClone` / `AbortSignal.any` 均未用或刻意避开，后者有注释点名）。`tsconfig.client.json` 的类型层**不拦**新 API（唯一防线是注释 + review）—— 新增 API 前先查 chrome99 支持表。
- **CSS 未做降级**（样式是 TS 模板字符串、**不经过任何 CSS 工具链**）：`color-mix()`（Chrome 111）在 `ui/tokens.ts` 里是**直接定义且无回退** ⇒ 在 111 之前的浏览器上那些 token **静默失效**（底色/选中底变透明，不破布局）；`@container`（105）、`mask-image`（120）同理。**唯一正确范例在 `toast-css.ts`**（先写 `background: var(--tdt-surface-1, rgba(...))` 再写 `color-mix`）—— 要补降级就照它写。当前实际客户端为新版 Chrome，故登记不改。
- **版本偏移（重要）**：SSE 的两个新契约要求**两端同时升级**。
  - **新前端 + 旧后端**（旧后端只发注释帧 `: ping`）⇒ 客户端的静默超时看门狗会把**健康**连接判为「半死」、**每 75–80s 白重建一次**（每次还触发一次全页补读，含 `/db` 转储）。旧前端 + 新后端则无害（未知 `sys.ping` 被 `byType` 丢弃）。⇒ **升级时前后端一起换，别单端灰度。**
  - `dist/client.js` 与 `dist/client.js.map` 都入库（后者 4.87MB，无 `sourcesContent`）；产物**未 minify**、保留中文注释 ⇒ 「只改注释也会改产物」，别把它误判成没 build（有 `[21]` 产物一致性守卫兜底）。
- **`/options` 的 `degraded` 客户端从不读取**：服务端专门下发 `degraded: {workspaces, models}`（注释写着「UI 上不撒谎」），前端只取 `workspaces/models` ⇒ 模型/工作区下拉的「暂无可选」**无法区分**「宿主没接上 llm」与「宿主真的没配」。登记为未落地的承诺。

**i18n 与可观测性（2026-10-07 审计）**

- **可观测性已补**（本轮）：调试页现在印一行**推送通道自述** —— `SSE OPEN · last-frame -12s · reconnects 3`（连接状态 / 距最后一次收帧多久 / 重建过几次），并挂进「数据通道诊断」行；**订阅回调抛异常**与**SSE 写出失败 / 超限拒绝**都会留痕（此前整条推送链「不报错、不重试计数、不记日志」，用户说「页面不刷新」时基本无从下手）。**排查第一步：看调试页那一行。**
- **默认开着的调试日志已关**：`task-overview.ts` 的 `DEBUG_SORT` 原为 `true` ⇒ 真机 console 持续刷排序快照。需要时手动打开。
- **i18n 遗留（登记，非功能问题）**：① `task-list.tsx` 的 `StatusRail` 悬浮提示、调试页的「N 行」、`task-editor.tsx` 的 `validateTaskDraft` 校验文案是**硬编码中文**（英文界面仍是中文）；② `locales.ts` 有约 **30 个死键**（定义未引用）；③ `schedule-text.ts` 用 `` t(`editorMonthMode_${spec.monthMode}` as LocaleKey) `` 拼**动态 key**，而该值来自存储的 `schedule.ui.monthMode`、**未收窄** ⇒ 脏数据（如 `"foo"`）会在计划行渲染出 `editorMonthMode_foo` 字面量（编辑器那条路径已经收窄到三档，列表这条没有 —— **修法就是照编辑器收窄**）。
