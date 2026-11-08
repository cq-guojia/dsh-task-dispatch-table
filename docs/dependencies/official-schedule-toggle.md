# 屏蔽官方「自动化任务」入口：可用的接口与边界

- 类型：🌐 **外部事实** —— 记的是**宿主（DSH）**允许怎么停用官方插件条目，不是本项目的设计
- 适用版本：**0.2.2-rc.1**（`@deepseek-ai/dsh-plugin-manager` / `dsh-app-boot` / `dsh-host-plugin-inventory` / `dsh-official-bundles` / `dsh-web-app` / `dsh-client-ui-schedule` / `dsh-client-ui-renderer` 均按此版本核对；`@deepseek-ai/cordis-plugin-loader` 宿主声明 `~1.1.0`，按 1.1.0 核对）。**宿主升级后按本节条目复核。**
- 用途：记录该外部依赖在本项目里实际用到的行为与边界（宿主升级后据此复核）。
- 版本真源：包名与版本见上「适用版本」；每条结论的 `文件:行号` 就在正文各节。
- 复核日期：2026-11-08（迁移当日未重新核实，结论沿用各节标注的版本）
- 状态：✅ 已核实（2026-11-08）
- 来源：上述各包 `lib/*.js` / `lib/types/*.d.ts` / `cordis.patch.yml` 逐条核实
- 配套：实现见 `src/official-schedule.ts`；过程叙事见 [`ledger/worklog/`](../../ledger/worklog/)

## 一、官方「自动化任务」是谁

| 事实 | 证据 |
|---|---|
| 官方自动化任务界面 = `@deepseek-ai/dsh-client-ui-schedule`，组合行 `id: ui-schedule` | `@deepseek-ai/dsh-web-app@0.2.2-rc.1` `cordis.patch.yml:403-404` |
| 它的侧栏入口注册进 `sidebar.panellist`（`id: schedules`、`order: 10`） | `dsh-client-ui-schedule@0.2.2-rc.1` `lib/client.js`（`PANEL_ID = "schedules"` + `ctx.slots.register({name:"sidebar.panellist", …})`） |
| 该包**不在**受保护名单里，可停用 | `dsh-official-bundles@0.2.2-rc.1` `lib/index.js:64-82`（`PROTECTED_PLUGINS`） |
| 官方 slots **没有**隐藏他人条目的接口：侧栏行来自 `ctx.slots.entriesOfSlot("sidebar.panellist")`，列表渲染只有 `opts.only` 过滤，无 hidden/visible | `dsh-client-ui-renderer@0.2.2-rc.1` `lib/client.js`（list 槽渲染分支） |

⇒ 想「看不见」只有两条路：停用整个 UI 包（正路），或 CSS/DOM 藏行（依赖本地化文案，脆，未采用）。

## 二、停用 / 放开的唯一正路

- 接口：`ctx.pluginManager.setPluginEnabled(entryId, enabled)`；`listPlugins()` 给出行（`entryId` / `moduleName` / `enabled` / `readOnlyReason`）。
  证据：`dsh-plugin-manager@0.2.2-rc.1` `lib/index.js:2669-2676`（`setPluginEnabled` 实现）、`lib/types/index.d.ts:187`（签名）。
- 落盘：往 **profile** 的 `cordis.patch.yml` 追加/改一条 `{id, disabled}` 覆盖项；与已有层等价的冗余覆盖项会被删掉（`implied()`）。
  证据：同包 `lib/index.js:1139-1186`（`writePluginEnabled`）。
- 层序：各 bundle 层（按 `dsh.profile.bundles` 顺序）→ profile → home → CLI；后者覆盖前者。
  证据：`dsh-app-boot@0.2.2-rc.1` `lib/index.js:1908-1917`（`readProfilePatches`）、`:1796-1815`（按 bundles 顺序压层）。
- 无 HMR 时 `setPluginEnabled` 只重算组合、不真重载，返回 `restart-required`/`no-hmr` ⇒ 重启后生效。
  证据：同包 `lib/index.js:3129-3134`（`reload`）。

## 三、停用之后还能再启用（关键，决定方案可行性）

| 事实 | 证据 |
|---|---|
| loader 为配置里**每一行**都建 Entry，`disabled` 只是不挂 fiber，Entry 留在 store 里 | `cordis-plugin-loader@1.1.0` `lib/index.js:217`（`entries()` 枚举 store）、`:463`（`get disabled()`） |
| 插件清单遍历 `ctx.loader.entries()`，`enabled: !entry.disabled` ⇒ **被禁用条目照样出现在清单里** | `dsh-host-plugin-inventory@0.2.2-rc.1` `lib/index.js:124,139` |
| `readOnlyReason: 'unaddressable'` 的四个触发条件都不看 `disabled`/`fiber` | `dsh-plugin-manager@0.2.2-rc.1` `lib/index.js:2108-2111` |

**可寻址的三个前提**（不满足就 `unaddressable`，官方 API 管不了它）：

1. 目标行是根 `include` 的**直属**行（把行塞进 `group` 里就废）；
2. 组合后的行带 `name`，且与 `entry.moduleName` 逐字一致；
3. `entryId` 用 `listPlugins()` 给的值（带前缀，形如 `include:<row id>`），不要自己拼行 id。

## 四、本插件据此定的做法（项目侧，非外部事实）

- 屏蔽 / 放开都走 `setPluginEnabled`（`src/official-schedule.ts`）；**默认不写任何东西 = 不屏蔽**，天然成立。
- 启动时对账一次（幂等），配置翻转时同步一次。
- 卸载回滚：`dispose` 里延后调一次「放开」——不能同步等，因为每次写操作都包在 `withFileLock(profile/package.json, waitMs=120s)`（`dsh-plugin-manager@0.2.2-rc.1` `lib/index.js:3187`），而卸载正是外层那次操作持锁 reload 时触发的。
  **已知边界**：宿主进程在延后调用跑起来前退出，则官方入口停在被屏蔽状态；兜底是用户在插件页手动把那行打开（被禁用行在清单里可见可点）。

## 五、复核触发条件

- 宿主升级：先看 `dsh-web-app/cordis.patch.yml` 里 `ui-schedule` 这一行还在不在（行 id 或包名变了 ⇒ 本插件的屏蔽开关会静默失效，日志里只有一条「插件清单里找不到 …」）。
- 顺带确认 `dsh-plugin-manager` 仍暴露 `pluginManager.setPluginEnabled`、`dsh-host-plugin-inventory` 仍把 disabled 条目列进快照。

## 更新日志

- 2026-11-08 23:05:00：按 koc-code-docwriter 槽位规范从 design/ 迁入 dependencies/（仅移动，正文未改）
