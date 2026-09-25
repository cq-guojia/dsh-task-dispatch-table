# 立项、选型与设计定型（含 Web 配置页）

> 时间范围：2026-09-19 ~ 2026-09-21 · **状态：✅ 完成封卷**（本文件是该工作包完成时的快照记录，不再更新）。
> 
> 从四类自动化需求到「DSH host 插件 + SQLite 调度器」的选型定型，决策 1-18，v0.0.1 骨架落码并真机首装跑通，Web 配置页（client bundle）真机验证通过。
>
> 定型结论见 [`design/decisions.md`](../design/decisions.md)；设计与事实清单见 [`design/`](../design/)。本文只保留过程叙事：踩坑、定位、修复与真机证据。

## 2026-09-19 — 进度条目

提出四类周期性自动化需求；调研外部工作流引擎 vs DSH 宿主插件

## 2026-09-19 — 进度条目

确认 DSH 为执行引擎；排除外部编排层（挂不到工作区）

## 2026-09-20 — 进度条目

批准「自研 DSH host 插件做调度器 + 状态存 SQLite」

## 2026-09-20 — 进度条目

核实 DSH 会话能力（`create` / `sessionTitle.rename` / `archiveSession`）

## 2026-09-20 — 进度条目

完成状态机与依赖语义设计；识别「会话存在 ≠ 在跑」的坑；列出 5 个待补机制

## 2026-09-20 — 进度条目

建立本进度表（替代工作交接表）

## 2026-09-20 — 进度条目

完成插件命名查重（npm + GitHub 实测），记录见 [`design/decisions.md`](design/decisions.md) 附录

## 2026-09-20 — 插件名定为 `dsh-task-dispatch-table`



## 2026-09-21 — 进度条目

仓库改为**公开开源**：进度文档迁至 `docs/PROGRESS.md`，已定型的设计拆到 `docs/design/`，补 `README.md` / `LICENSE`（MIT），移除本机部署细节

## 2026-09-21 — npm 占位发布 `dsh-task-dispatch-table@0.0.0`

（抢注包名；正式版按决策改用 scoped 包名）

## 2026-09-21 — 文档体系重组

新建根目录 `AGENTS.md`（agent 守则与文档维护规则，原「维护规矩」迁入）；`task-manual-vs-skill.md` 并入 decisions.md（决策 12 展开）；进展日志移至文末

## 2026-09-21 — 拍板决策 14

状态库默认落宿主 `storages/` 约定目录（`storages/dsh-task-dispatch-table/state.db`）+ `statePath` 配置覆盖；视角从「本机部署」改为「任何用户可安装」；「不被同步撕碎」降级为 README 文档化的已知风险

## 2026-09-21 — 数据模型定型

（[`design/data-model.md`](design/data-model.md)）：任务定义 13 字段 + 状态库两表（`task_instances` / `task_events`）；实例身份 = `task_id + logical_date`，重试行内递增，派发 CAS 领取；通知机制本期不做（用户拍板）

## 2026-09-21 — 首个任务样例定型

（[`examples/image-upgrade-daily.md`](examples/image-upgrade-daily.md)）：镜像升级日报——任务定义 + 产物契约 + 手册骨架；仅文档示例，与插件代码零耦合

## 2026-09-21 — 状态机完整定义

（[`design/state-machine.md`](design/state-machine.md)）：完整转移表、租约 30min 心跳续租、`unknown` 只观察不重派、窗口只管开始、重试当场回 `pending`、同任务严格串行、补跑三层入口（自动实例保障 / `backfill.days` / SQL 手动重置）；数据模型随之增补第 14 个字段 `backfill.days`

## 2026-09-21 — 宿主源码核实完成，未决项 1–4 全关

（克隆 deepseek-ai/deepseek-harness 至 /tmp 读源码，结论 = 决策 15）：派发走 `ctx.agents.create`（sessions.create 不驱动模型）；storages/ = 宿主数据根非工作区（决策 14 修订）；归档程序化可用；bundle 接入形态。**骨架方案**：`src/{index,config,tasks,scheduler,reconcile,store,dispatch}.ts` + `cordis.patch.yml`，TypeScript 构建，`inject: ['timer','agents','sessions','workspaceRegistry']`

## 2026-09-21 — 拍板决策 16（UI 分期）

v1 零自建 UI（配置走官方 `ctx.settings`，任务定义按决策 6 编辑 JSON）；实例监控面板放 v1.1，形态 = 大弹窗/drawer 不做全屏页（宿主惯例 popover + 信息密度低）

## 2026-09-21 — 插件骨架落码（v0.0.1）

`src/{index,config,store,tasks,scheduler,reconcile,dispatch,host}.ts` + `cordis.patch.yml`；tsc 零报错、npm pack 产物正确、mock 宿主冒烟全过。五个实现取舍（已同步回 state-machine.md）：① 启动扫描只置 `dispatched`/`running` 为 unknown（pending 无可丢事件）② 串行互斥集合 = dispatched/running/unknown（pending 排队不互锁）③ 上游失败下游保持 pending 随窗收敛 skipped（保住决策 10 的窗口内修复）④ 补「已到计划时刻」派发守卫 ⑤ `tasksDir` 相对基准 = 宿主 `process.cwd()`。SQLite 用内置 `node:sqlite`（宿主 Node ≥22.19）

## 2026-09-21 — git 源安装摩擦与拍板

pnpm 对 git 包的 `prepare` 脚本强制 allowBuilds（key 锁 commit hash，每次更新都要重加）→ 放弃 prepare，**`dist/` 入库**对齐生态惯例（AGENTS 规矩 2：推送前必须 build 并提交 dist）

## 2026-09-21 — 依赖全部升最新线

cron-parser 4.9(deprecated)→5.10.1（ESM 命名导出，两处调用迁移）、zod 3.25→4.6.5、typescript→5.9.3（7.x 原生编译器新线不冒进）、@types/node→22.20.4；tsc 零报错 + 冒烟通过

## 2026-09-21 — v0.0.1 真机安装成功

（`dsh plugin --profile web add git+...`，装完即用无需 allowBuilds）；用户反馈：Web「插件配置」页未出现本插件卡片，暂无 UI 入口 → 排查 patch→组合→配置页渲染链路；用户拍板临时方案：Config 加 textarea 字段直接编辑任务表 JSON，先跑通再做完整功能

## 2026-09-21 — Web 配置页落码（client bundle）

机制查明——配置页非 schema 自动渲染，须插件自带浏览器半侧（manifest `"dsh": { "client": { "platform": "web" } }` + `exports['./client']` = lazy-CJS factory 产物 `dist/client.js`），页面注册进 `plugins.bundle.config`（键 = 包名；`plugins.item` 为宿主平面页保留，与先前判断不同）→ **拍板决策 17**。新增 `src/client/{index,locales}.ts` + `scripts/build-client.mjs`（esbuild 复刻宿主 clientBundle 预设），dist 入库；页面 = tasksInline 大 textarea（草稿暂存 / 保存写入带 revision 设栅 / 非法 JSON 拦截）+ 其余 6 个运行参数只读折叠展示，文案 zh/en 走 locale 服务；mock 宿主冒烟 15 项全过（factory→apply→注册→渲染→保存→卸载），待真机验证

## 2026-09-21 — 配置页入口按真机作业改造（slot 结论修正）

真机无入口，用户指路 dsh-session-title-pattern（已跑通同款入口）——注册面应为 **`settings.plugin.item` keyed slot**（key = settings 命名空间），前稿的 `plugins.bundle.config` 是 ui-plugin-manager 对组合包的契约，误用 → **决策 17 修订**。同步落实作业规矩：顶层禁止导出 `inject`（entry pending 会卡死整个 dsh 启动）、locale 词典经 `ctx.inject(['locale'])` 延迟注册、`t` 由渲染器按注册项 `locale:` 声明合成、组件 `useSyncExternalStore` 消费 scope 快照、保存走 `scope.set/unset`（空值 unset 回默认）、设置页自动配对无需自建 gating。构建从 esbuild 手搓切换 **tsdown**（`tsdown.client.config.ts`：产物三件套 + PLATFORM_MODULES externals + outDir dist/clean false），删 `scripts/build-client.mjs` 与 esbuild，devDeps 增 tsdown 0.23 / @types/react ~18.3.1，新增 `tsconfig.client.json`（client 侧 noEmit 类型检查）。tsc 双工程零报错 + 产物冒烟（banner 三件套齐全、externals 仅 react、locales 内联）通过，待重装验证

## 2026-09-21 — 配置页真机验证通过

；新增全字段注释版任务定义模板 `examples/task-template.jsonc`（14 字段逐一注释：实例身份/窗口语义/契约三查/依赖两种 semantics 的适用场景与时间线），文档索引同步

