# worklog：客户端刷新处置（轮询 → 事件驱动）

> **状态**：✅ 完成封卷（2026-10-06 开工并完成，仅剩用户真机验收）
> **定型产出**：[`../design/client-refresh-disposition.md`](../design/client-refresh-disposition.md)（处置清单 + 复核结论，**结论以它为准**）
> **关联**：推送机制规格 [`../design/event-push.md`](../design/event-push.md)；轮询现状 [`../design/client-refresh.md`](../design/client-refresh.md)。

---

## 一、需求原话（用户 2026-10-06）

- 「所有不该用轮询的地方，都替换成通知机制。」
- 「不需要给每个轮询单独做保底……可以做一个整体的保底机制，只要页面在，就一定有 SSE 断线重连机制。这个机制做成统一的，每个页面都引用，或者放在某个地方让页面自然而然就生效。」
- 「该监听就监听。至于网断了或者没连上，那是特殊情况……比如 SSE 断了 30 秒还没有连上，就去做一下重连这个动作……如果数据脏了，页面自己去刷新，不用去补。」
- 「你再找一找相关的，看看哪些服务还是在页面上的，没有抽象到程序文件里。」
- 后续拍板：**不为「不支持 SSE」加兜底轮询**（现代浏览器全支持）；真机验收用户最后一次性做。

---

## 二、落码分批（每批均 typecheck 绿 + 冒烟 649/0 + build 含 dist + 提交推送）

| 批次 | 提交 | 内容 |
|---|---|---|
| 一 | `482ffaa` | §一 统一重连（`event-subscribe.ts`：浏览器重连 + **30s 看门狗** + 连上即 resync 补读）；§二 **三条数据轮询退场** —— 实例 5s（`instances-poll.ts` 整删）、overview 10s、设置页快照 2s（收窄为「有订阅者才轮」） |
| 二(1/3) | `c3c2afd` | 新增 `ui/ticker.ts`（全站唯一 1s 心跳 + `useNowMs`）与 `ui/LiveText.tsx`，从 `task-info.tsx` 归位并进 barrel；`NextPill` 删自建 interval、并回全局心跳（M1） |
| 二(2/3) | `986fa0b` | 新增 `time-text.ts`，时间文案层从 `task-info.tsx` 迁出；四个引用方改路径 |
| 二(3/3) | `639d748` | 新增 `task-overview.ts`，`useTaskOverview` + 行类型 + 轮询常量 + `[tdt-sort]` 调试态从 `task-list.tsx` 迁出 |
| 三 | `6942102` | 新增 `error-text.ts`（`humanizeTaskError`）；删死代码 `markdown.ts` / `formatShortStamp` / `marked` 依赖 |
| 四 | `1b37b8d` | barrel 收尾：删 `editor-fields.tsx` 二次再导出；`ui/running.ts` + `ui/CodeViewer.tsx` 补登记，业务文件改走 barrel |
| 五 | `eac5f62` | 格式收编：`pad2` ×2、`formatBytes` ×2、`baseNameOf` ×2 → `format.ts` 单源 |
| 六 | `7af89ca` | API 前缀 4 份 → 1 份（`query.ts` 的 `API_PREFIX`） |

---

## 三、踩坑与判据

### 3.1 「剩余项不是寄居页面」——复核后判定不做

`W4/W5/M2/M6/M7/M8` 一开始被盘点成「该归位/该合并」，落码前复核发现**它们不是同一类问题**（详见定型文档 §八）：有的是页面私有（搬了零收益）、有的语义本就不同（合一等于改文案）、有的是跨模块重构（风险 > 收益）。**结论写进文档而不是硬搬**——这是本仓「结论可追溯、真源唯一」的要求。

### 3.2 冒烟断言要跟着搬家一起改（本轮踩了 3 次）

搬符号会**打断冒烟里读源码的断言**（`readFileSync('src/client/xxx.tsx')` + `includes('符号')`）。本轮因此挂了三次：

1. `instances-poll.ts` 整删 ⇒ 断言读不到文件直接抛；改为「文件不存在 + 两页不再引用 + 新断言 30s 看门狗」。
2. `NO_TIME` 迁到 `time-text.ts` ⇒ 断言改读新文件。
3. `NextPill` 去掉 `setNowMs` ⇒ 断言改为「用 `useNowMs`/`subscribeTicker` 且 task-list 里没有自建 `setNowMs`」。

**规律**：凡是「读源码找符号」的断言，**搬家必须同批改断言**；否则冒烟会以看似无关的名字失败。

### 3.3 大块代码搬迁用「读准范围 + 精确删行」

`task-info.tsx`（时间文案层 ~105 行）、`task-list.tsx`（取数层 ~165 行）、`task-editor.tsx`（`humanizeTaskError`）都是大块搬迁。做法：**先读准行范围 → `sed -i 'A,Bd'` 精确删 → 补一行指向注释**；比用 `replace_in_file` 贴上百行原文更不容易错。新文件用 `write_to_file` 一次写全。

> ⚠️ 沿用上一条工作包的教训：**同一文件不要并行发多个编辑**（会丢更新），一个一个改完再核。

---

## 四、验证与遗留

- **验证**：每批 `npm run typecheck` 绿、`npm run smoke` **649/0**、`npm run build` 过并把 `dist/` 一并提交（另清了已删源码对应的旧产物）。
- **遗留**：⏳ **真机验收**（用户做）——装 `dist/` 确认「任务跑完 / 改开关 ⇒ 开着那页即时更新」、断线 30s 重连行为。
- **部署侧**：反向代理需关缓冲（`x-accel-buffering: no` 已由服务端带上，代理侧仍需 `proxy_buffering off` 之类）。
