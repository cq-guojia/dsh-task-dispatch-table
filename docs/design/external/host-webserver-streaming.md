# 宿主 webServer 的流式响应（SSE）能力

> **类型**：🌐 **外部事实** —— 记的是**宿主（DSH）**能给什么，不是本项目的设计
> **适用版本**：`@deepseek-ai/dsh-host-webserver@0.2.0-rc.2`（宿主版本线；升级后按下方「复核方式」重跑）
> **状态**：✅ 已核实（2026-10-06）
> **来源**：`@deepseek-ai/dsh-host-webserver@0.2.0-rc.2` 解包产物 `lib/index.js` + `lib/types/index.d.ts` + `README.md` 逐条原文核实（`npm pack` 解包到仓库外）
> **配套**：[`dsh-capabilities.md`](./dsh-capabilities.md)（宿主能力总清单）· 用途见 [`../event-push.md`](../event-push.md)

> **这是什么**：核实宿主 webServer 能否承载**长连接流式响应（SSE）**——即路由 handler 能否自己 `write` 分块、宿主是否缓冲 / 超时回收。
> **结论**：**完全支持**。宿主明确把「持有响应不结束」列为合法用法，且 gzip 中间件**显式跳过** `text/event-stream`。

---

## 一、结论（先看这条）

**SSE 可用**：本插件在自有 exact 路由里拿到的是**原始 Node `http.ServerResponse`**，可 `writeHead` + `write` 分块、持有连接不 `end`；宿主**不缓冲**、**不设响应超时**、**不主动回收**这类响应。无需任何新增依赖或宿主接口。

## 二、逐条事实与出处

| 事实 | 原文 / 证据 | 出处 |
|---|---|---|
| **路由 handler = 原始 Node req/res** | `WebRoute.handler: (req: IncomingMessage, res: ServerResponse) => void \| Promise<void>` | `lib/types/index.d.ts:33-38` |
| **宿主显式允许「持有响应不结束（如 SSE）」** | 类型注释原文：*"Owns the full response lifecycle (**may hold the response open, e.g. SSE**)."* | `lib/types/index.d.ts:37-38` |
| 底层就是 `node:http` | `import { createServer } from "node:http"`；`this.server = createServer((req,res)=>…)` | `lib/index.js:1`、`:246` |
| 派发是**逐请求**调用 handler（互不影响） | `const handle = async (req,res)=>{ … await route.handler(req,res); return; … }` | `lib/index.js:229-245` |
| **gzip 显式跳过 SSE**（不会被压缩缓冲） | `if (contentType.toLowerCase().startsWith("text/event-stream")) return false;` | `lib/index.js:110-116` |
| 压缩默认关闭 | `const DEFAULT_COMPRESSION = "none"` | `lib/index.js:103`、`:144` |
| 官方 README 亦称 SSE 不受压缩影响 | *"Existing encodings, `Cache-Control: no-transform`, range responses, **SSE**, ZIP … remain unchanged."* | `README.md:41` |
| **无响应超时 / 不主动回收普通响应** | 全文件无 `server.timeout` / `setTimeout` / 对已建立响应的回收逻辑（grep 仅见升级 socket 与 dispose 的 `destroy`） | `lib/index.js`（全文） |
| 唯一「主动断」的两种情况 | ① handler 抛错且**已发头** ⇒ `res.destroy()`；② 插件 dispose ⇒ `server.close()` + `closeAllConnections()` | `lib/index.js:248-256`、`:306-319`；`README.md` §Matching and lifecycle |
| 宿主不做 TLS / 鉴权 / 同源策略 | *"No server-wide TLS, authentication, or origin policy — route owners … enforce their own request policy."* ⇒ 同源闸门由**路由方**自持（本仓 = `isTrustedDispatchRequest`） | `README.md:113` |
| 重复 `(kind,path)` 注册直接 throw | `if (table.has(route.path)) throw new Error(...)` | `lib/index.js:177-184` |

## 三、对本插件的落地含义

1. **`DispatchWebResponse` 需补 `write`**（当前 `src/index.ts:64-68` 只声明 `writeHead`/`end`）——补成可选 `write?: (chunk: string) => unknown` 即可，运行时真身就是 `ServerResponse`。
2. **handler 应「建好流后立即返回」**：宿主 `await route.handler(...)`，只要返回的 Promise 及时 resolve（不要 await 一个永不结束的流），派发正常。
3. **发头后再抛错 = 连接被 destroy**：SSE handler 内**不要**在 `writeHead` 之后抛异常；出错自行 `res.end()` / 清理订阅。
4. **dispose 时宿主会 `closeAllConnections()`**：本插件的 SSE 连接连同关闭，无需特殊处理，但订阅集合与心跳定时器仍应挂 `ctx.on('dispose')` 主动清理（避免悬挂引用）。
5. **同源闸门行为与现有 GET 完全一致**：`EventSource` 不能带自定义头，但本仓闸门只认 `Origin`/`Host` 或回环地址，无需自定义头；无 `Origin` 的同源 GET 与现有 `fetch` 同口径（回环放行），行为不新增风险。

## 四、复核方式（宿主升级后）

```bash
npm view @deepseek-ai/dsh-host-webserver dist-tags --json      # 取与宿主一致版本
cd /tmp && npm pack @deepseek-ai/dsh-host-webserver@<版本> && tar xzf *.tgz
# 看三处：WebRoute.handler 是否仍收原始 req/res（lib/types/index.d.ts）
#         gzip filter 是否仍跳过 text/event-stream（lib/index.js）
#         是否新增响应超时 / 回收逻辑（lib/index.js 全文）
```
