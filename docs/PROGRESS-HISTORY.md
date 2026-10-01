# 进度历史（已结案）

> **这是什么**：已结案事项的**一行索引** —— 什么时候、完成了什么、过程文档在哪。
> **过程 / 踩坑 / 注意事项一律不写在这**，要看去 `worklog/`。
> **在办的事**看 [`PROGRESS.md`](PROGRESS.md)。
> **规矩**：事项结案即从 `PROGRESS.md` 移入本文件（追加一行），见 [`README.md`](README.md)。

| 时间 | 工作包 | 完成了什么 | 过程文档 |
|---|---|---|---|
| 09-19~09-21 | 立项、选型与设计定型 | DSH 插件 + SQLite 选型定型，决策 1–18，v0.0.1 骨架落码真机首装，配置页真机跑通 | [worklog/genesis.md](worklog/genesis.md) |
| 09-21~09-23 | 一次性任务、回执与派发链路 | 决策 18–24（once / 回执 / 模型漏斗 / preset / per-agent 回执工具），首次全链路真机跑绿 | [worklog/once-dispatch.md](worklog/once-dispatch.md) |
| 09-24 | 刻度化调度与执行身份 | UUID 主键 + `UNIQUE(task_id, scheduled_at)`，小时 / 分钟级 cron 可跑 | [worklog/ticks-identity.md](worklog/ticks-identity.md) |
| 09-24 | 执行记录「查看会话」 | 决策 27 证伪 → 28 自绘只读弹窗 → 29 复用官方 ChatView（方案拍板） | [worklog/session-view.md](worklog/session-view.md) |
| 09-24~09-25 | 宿主 0.1.7-rc.1 迁移与数据通道 | 侧栏入口 + main 整页化；数据通道定案 webServer HTTP 路由 + 同源 fetch | [worklog/rc1-migration.md](worklog/rc1-migration.md) |
| 09-25 | 0.1.7 兼容性排障 | ENOENT 误报静默修复；v4 会话消息格式修复 | [worklog/runtime-compat.md](worklog/runtime-compat.md) |
| 09-25 | 持久化主通道与调试页 | tasksInline 改 state.db meta 表（重装不丢），once 真机重跑绿 | [worklog/persistence.md](worklog/persistence.md) |
| 09-25 | 任务身份闸门（决策 30） | 「保存时固化、运行时只认」，UUID 必须命中现有表 | [worklog/identity-gate.md](worklog/identity-gate.md) |
| 09-25 | 文档体系三层化 + 公用规则外提 | PROGRESS 拆三层（现场 / 叙事 / 定型）；公用规则外提为 `RULES.md` | [worklog/docs-system.md](worklog/docs-system.md) |
| 09-26 | 周期任务（cron）全链路验证 | 每 5 分钟 cron 真机跑通、跨天成功 | — |
| 09-26 | 调度循环重设计 + 日志表 + 冗余字段 | 决策 31/32（懒建行 / 不回看 / 不补跑），真机连续 succeeded、无 skipped 洪水 | [worklog/scheduler-redesign.md](worklog/scheduler-redesign.md) |
| 09-26 | 依赖（前置任务）语义定型 | 决策 33 定型 + 落码 | [worklog/dependency-semantics.md](worklog/dependency-semantics.md) |
| 09-26 | token 字段三拆列 | 单个 `tokens` 拆为 `token_in` / `token_out` / `token_in_cache` | — |
| 09-26 | 归档会话弹窗显示（数据链打通） | 查看前 `sessions.retain` 物化 scope（源码级定位，与归档无关） | [worklog/session-view.md](worklog/session-view.md) |
| 09-26~09-29 | 会话弹窗外观对齐官方 | 自家弹窗挂官方 ChatView + 逐项照 ui-map 对齐，真机核验通过 | [worklog/session-view.md](worklog/session-view.md) |
| 09-27 | 官方 keyed 流 + 三级收折 + 弹窗外壳 | 决策 36/37 落码 | [worklog/session-view.md](worklog/session-view.md) |
| 09-27 | U10「继续对话（开分支）」 | 决策 38 含 ⑦，真机验证通过 | [worklog/session-view.md](worklog/session-view.md) |
| 09-27~09-28 | U11 产出物打开 | 决策 39，统一 `openFile` + 页面级预览 dock，真机验证通过 | [worklog/artifact-opening.md](worklog/artifact-opening.md) |
| 09-28 | 代码块工具条对齐官方 | `code.toolbarLabels` 三处补传，收敛到 `md-labels.ts` | [worklog/code-block-toolbar.md](worklog/code-block-toolbar.md) |
| 09-28~09-29 | 依赖快照（决策 43） | `resolvedDeps` 冻结上游实例 + 产出下传，真机验证通过 | [worklog/dependency-snapshot.md](worklog/dependency-snapshot.md) |
| 09-29 | 前置任务卡交互（决策 47） | 工作区→任务两级选择，五轮真机迭代定稿 | [worklog/task-editor-ui.md](worklog/task-editor-ui.md) §十九 |
| 09-29 | UI 收口 + Agent 权限选择器（决策 50） | 文案收口 + 权限下拉四档，新增 UI 封档 | [worklog/task-editor-ui.md](worklog/task-editor-ui.md) §二十二 |
| 09-29 | 仓库暂时结项 | 所有进行中工作包落码 + 真机验证通过 | — |
| 09-30 | 编辑器 UX 第二轮（决策 52） | 错误人话化 / 统一浮层 / 预计执行 / 版本历史拆分，八轮真机反馈后结案 | [worklog/editor-ux-round2.md](worklog/editor-ux-round2.md) |
| 10-01 | 文档体系整理 | 立文档规范 `docs/README.md`；现场层拆 `PROGRESS.md`（进行中）+ `PROGRESS-HISTORY.md`（已结案一行一条）；`design/` 按七类落位（新增方法规范、功能总索引，8 个功能文档入 `features/`）；删除 `decisions.md`（内容先回补进专题文档）并回改 9 处口径冲突；两份 agent 规则文件重写为零交叉 | [worklog/docs-reorganization.md](worklog/docs-reorganization.md) |
| 10-01 | 文档微调（外部事实归置 + 样式文档去过程化） | 新建 `design/external/` 专放宿主 / 官方侧事实，两份外部文档统一头部并写明**适用版本**；`ui-foundation.md` 移出六节过程内容（361→285 行）只留规范；补「通用细则」八条规则（层级 / 焦点 / 图标 / 动效 / 溢出 / 滚动 / 间距 / 三态） | [worklog/docs-refine.md](worklog/docs-refine.md) |
