# 核心模型目录两段式接线（`serveModelCatalog` / `connectHost`）

> **状态**：✅ 定型
> **类型**：外部事实（`dsh-plugin-core/host` 与 `dsh-plugin-core/ui` 的模型目录数据面）
> **适用版本**：`dsh-plugin-core@0.35.17`（逐条另标，见正文）
> **用途**：记录宿主 / 客户端如何接上核心自带模型目录，宿主或核心升级后据此复核
> **版本真源**：`dsh-plugin-core` 的 `package.json` 与 npm `dist-tags`；本仓 `package.json` 声明 `^0.35.17`
> **复核日期**：2026-11-10
> **来源**：读 `dsh-plugin-core` 的 `src/host/index.ts`、`src/ui/infra/host-data.ts`、`src/ui/inputs/ModelPicker.ts`、`src/ui/inputs/picker.css`、`src/ui/inputs/picker-logic.ts` 与发布产物 `dist/**/*.d.ts`，非运行时试错
> **配套**：[核心控件事实清单](plugin-core-controls.md) · [UI 开发手册](../development/ui-style-guide.md) · [文档索引](../README.md)

## 一、两段式接线

适用版本：`0.35.13` 起，`0.35.17` 复核仍有效。

| 侧 | 调用 | 落点 |
|---|---|---|
| 宿主 `apply` | `serveModelCatalog(ctx, { path, authorize })` | `dsh-plugin-core/host` |
| 客户端 `apply` | `connectHost(ctx, { modelsPath: path })` | `dsh-plugin-core/ui` |

两侧必须用**同一个 path 常量**。⚠️ 不传 `modelsPath` 时 `dsh-plugin-core/src/ui/infra/host-data.ts` 直接 `return` ⇒ 目录恒为空；`ModelPicker` 不传 `groups` 时只读 `modelCatalog`，接不上就一直空态。

**更正旧结论**：`0.35.12` 及以前的 `README.md`、`docs/help/ui.doc.ts` 把 `connectHost(ctx)` 写成「即订阅宿主快照」，漏了 `modelsPath` 与 host 侧 `serveModelCatalog`；`docs/help/integration.md` 还教用通用 `Picker` 手搓 models 数组。`0.35.13` 的提交 `499c6ee7` 已把 README、integration、ui 帮助文档与 demo 全部改成两段式接线。照旧文档接会得到空目录。

## 二、宿主侧 `serveModelCatalog`

适用版本：`0.35.17`（括号内标注与更旧版本的差异）。

| 事实 | 说明 |
|---|---|
| 注入线 | 只声明 `inject(['webServer'])`；`llm` 改在每个请求里惰性现取，取不到回 503，`buildModelRoutes` 抛错回 500。（`0.35.12` 用 `inject(['llm','webServer'])`，缺 `llm` 时回调不触发、路由直接不注册。） |
| 请求面 | `HostHttpRequest` 含 `url` / `method` / `headers` / `socket`，`headers`、`socket` 可选。（`0.35.12` 的 handler 只声明 `{ url? }`，消费方接不上自己的同源守卫。） |
| 鉴权 | `ModelCatalogOptions.authorize?: (req) => boolean \| Promise<boolean>`，返回 false ⇒ 403，响应体 `{ error: 'forbidden' }`。宿主不做 server-wide 鉴权，闸门由路由方自持。 |
| 惰性取 `llm` | `0.35.14` 起核心的 `resolveLlm(ctx, options)` 自带 try/catch：先试 `options.getLlm?.()`，只有返回值不是 `undefined` 才采用，否则 `try { ctx.get?.('llm') } catch { return undefined }`（同时修掉旧版 `??` 短路仍会调到 `ctx.get` 的洞）。`getLlm` 仍是可选覆盖口，消费方**不再需要**传。（`0.35.13` 默认取值不带 try/catch，本仓曾传安全取值函数顶上。） |
| 目录生成 | `buildModelRoutes(llm)` 遍历 `llm.listProviders()`，用 **`provider.id`** 作 route 的 `provider`、`provider.name` 作 `displayName`，模型取 `listModels(provider.id)`；单个 provider 失败跳过，按 `displayName` 排序返回 `{ routes }`。 |
| 响应 | 200 `{ routes }`；403 / 503 / 500 各自 `writeHead` + `end`，不依赖宿主兜底。 |

## 三、客户端目录状态

适用版本：`0.35.17`（首拉重试 / 自动补拉为 `0.35.15` 起）。

- `connectHost(ctx, { modelsPath })` 记下 `boundModelsPath`，`bindVisibilityRevalidate()` 绑一次标签页可见事件，随即 `fetch(path, { cache: 'no-store' })` 喂进 `modelCatalog`。
- 首拉失败只对 **5xx / 429 / 网络错误**退避重试，延时档 `[1000, 2000, 4000]` 毫秒，三次后停在降级态、绝不无限重试；取到目录 `retryIndex` 归零。403 / 404 不重试。
- `revalidateModelCatalog()` 是事件驱动补拉（非轮询）：`visibilitychange` 可见时、以及 `ModelPicker` 每次打开下拉时调用；距上次尝试不足 30s、或已有 in-flight 请求则直接跳过。成功态也补，用于感知供应商 / 模型增减。
- `refreshModelCatalog(path?)` 仍导出并返回 Promise（不传 path 用接线时记下的那个，未接线则 reject），`retryOnFailure = false`；并发刷新由 `catalogInFlight` 合并成一次。本仓已不再手动调用。
- `ModelPicker` 不传 `groups` 时由 `modelCatalog` 现生成分组，值为 `${provider}/${model.id}`；不传 `degraded` 时按 catalog 状态自动判定。

## 四、`ModelPicker` 的能力轴

| 能力 | 适用版本 | 事实 |
|---|---|---|
| 三形态 `grouped` / `flat` / `cascade` | `0.35.11` 起 | `onChange` 一律发 `${provider}/${id}`；cascade 换供应商先发 `''` |
| `PickerSizing`：`width` / `minWidth` / `maxWidth` | `0.35.11` 起 | 字符串原样透传（`clamp(...)` 可用）；给了 `width` 就把三值全锁成它 |
| `searchSizing` / `providerSizing` / `modelSizing` | `0.35.11` 起 | 搜索框共用一套；cascade 两个框可分别覆盖 |
| `className` 归位 cascade 根 row | `0.35.13` | `0.35.12` 只落到第二个 `Picker`，第一个连 className 都没有 |
| `rowClassName` / `providerClassName` / `modelClassName` | `0.35.13` | 三条独立类名轴；cascade 根 row 的类名固定含 `dshpc-picker__row` |
| `retainSelectedValue(groups, value)` | `0.35.13` | 旧值不在目录时按 `provider/id` 前缀补一条保留项，label 用旧值原文（不编造模型名），并计入 `degraded` |
| `allowDefault` / `defaultLabel` / `placeholder` / `degraded` / `searchable` / `size` | `0.35.10` 已有 | 「默认模型」是核心内置首项，值为 `''` |
| `Picker` 的 `onOpenChange` | `0.35.15` | `ModelPicker` 用它触发 `revalidateModelCatalog()` |
| 下拉面板样式收进菜单作用域 | `0.35.17` | `.dshpc-picker__menu .dshpc-picker__row{display:flex;gap:8px}` 等规则收进 menu 祖先（0,2,0），避免同页旧版 core 的单类规则覆盖；cascade **外层** row 因此没有核心默认布局 |

⚠️ 核心**没有** cascade 外层 row 的布局参数（`rowStyle` / 布局档位）；两列等宽这类布局只能通过 `rowClassName` 挂消费方自己的规则。双类选择器既补上默认布局，也压过同页旧版 core 的单类规则。`0.35.12` 相对 `0.35.11` 只改了分页每页条数下拉的尺寸档，`ModelPicker.ts` 未动。

## 五、本仓实际接线（事实）

适用版本：本仓依赖 `dsh-plugin-core@0.35.17`。

- 两端共用 `src/model-catalog-route.ts` 的 `MODELS_ROUTE`；宿主 `src/index.ts` 注册路由并把 `isTrustedDispatchRequest` 交给 `authorize`，不传 `getLlm`（核心自行安全取 llm）。
- 客户端 `src/client/index.ts` 的 `apply` 调 `connectHost(ctx, { modelsPath: MODELS_ROUTE })`；首拉重试、切回页面与打开下拉的补拉全由核心负责，本仓不再手动 `refreshModelCatalog()`。
- `GET /options` 只下发 `workspaces` / `timezone` / `degraded.workspaces`，不再枚举 `llm`；工作区、附件等其它消费方仍走这条路由。
- `src/client/task-editor.tsx` 用 `variant:'grouped'` + `width` 轴；`src/client/settings-config-block.tsx` 用 `variant:'cascade'` + `rowClassName`。两处都不再传 `groups` / 自拼分组 / 自写触发器尺寸。
- 值口径 `${provider.id}/${model.id}` 与本仓派发侧 `src/dispatch.ts` 的 `lookupProvider` / `llm-first` 一致（`0.35.12` 时代本仓 `/options` 用的是 `LlmModelInfo.provider`；两者若不同，老值由 `retainSelectedValue` 如实保留，不静默丢失）。

## 更新日志

- 2026-11-10：新建。核实 `dsh-plugin-core@0.35.13` 修掉 `0.35.12` 的五处缺口（路由鉴权、注入时机、cascade 类名轴、旧值保真、目录刷新），本仓两处选模型改接核心自带目录与尺寸 / 类名轴。
- 2026-11-10：随 `0.35.17` 复核更正。`0.35.14` 核心 `resolveLlm` 自带 try/catch ⇒ 删本仓 `getLlm` 覆盖口；`0.35.15` 首拉退避重试 + 事件驱动补拉 ⇒ 删本仓设置页的手动 `refreshModelCatalog()`；`0.35.17` 下拉面板样式收进 menu 作用域，cascade 外层 row 无默认布局，本仓两列等宽规则改为「补布局 + 双类压旧版」并更正注释。
