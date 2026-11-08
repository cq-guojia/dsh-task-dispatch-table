# 文档索引

> 本文件是 `docs/` 的唯一索引：槽位划分、命名与生命周期由 koc-code-docwriter 的规范定义，本仓库自己的写作约定见 [文档写作约定](development/doc-conventions.md)。
> 仓库其他约定（验证命令、远端、提交前检查）见根目录 [`AGENTS.md`](../AGENTS.md)。

## 目录

- architecture/
  - [客户端刷新处置：轮询 → 事件驱动（替换 / 合并 / 归位 / 保留清单）](architecture/client-refresh-disposition.md) — 旧轮询通道的替换、合并与归位清单
  - [客户端刷新机制（轮询，非推送）](architecture/client-refresh.md) — 客户端轮询取数现状（已被事件推送取代，保留作降级记录）
  - [架构总览](architecture/overview.md) — 三层结构、模块依赖与一次派发的请求链路
  - [UI 基础层（design token + 组件皮肤）—— 规范](architecture/ui-foundation.md) — UI 基础层为什么这样抽象（token、皮肤边界、明暗判据）
- features/
  - [归档会话弹窗显示（借官方设计变量 + 自渲染，决策 34 落码）](features/archive-session-view.md) — 归档会话弹窗怎么摆、借了官方哪些样式变量
  - [U11 · 产出物打开与展示方式（设计文档）](features/artifact-opening.md) — 产出物怎么打开、交给哪个预览面
  - [新增 / 编辑任务：需求口径](features/creation-edit.md) — 新增/编辑任务的需求口径、校验与保存链路（含示例任务）
  - [依赖快照（决策 43）：写库瞬间冻结「命中了哪条上游实例 + 其产出」](features/dependency-snapshot.md) — 依赖快照在写库瞬间冻结了哪些内容
  - [执行记录总查询页（流水账）](features/execution-timeline.md) — 执行记录总查询页：筛选、分页、就地展开
  - [插件主界面：任务列表视图（设计提纲）](features/main-panel.md) — 主面板任务列表：卡片、筛选与操作入口
  - [功能总索引](features/overview.md) — 功能总索引：有哪些功能、各落在哪个页面
  - [功能：设置页（顶部一级 tab「设置」）](features/settings.md) — 设置页各分区的行为与保存口径
  - [状态机与依赖语义](features/state-machine.md) — 实例状态机、依赖语义与判定条件
  - [任务日程（月历视图）](features/task-calendar.md) — 月历视图：已发生实例与按定义推算的计划
  - [任务展开三面板（基础资料 / 执行记录 / 日志）](features/task-expand-panels.md) — 卡片展开的三面板：基础资料 / 执行记录 / 日志
- api/
  - [事件推送机制（SSE 事件总线）](api/event-push.md) — SSE 事件总线契约：事件类型、负载与断线语义
- data/
  - [数据模型：任务定义与状态库](data/model.md) — 表结构、字段语义、约束、索引与保留策略
- development/
  - [方法规范：通用能力分几类、必须复用哪些、不满足怎么办](development/code-conventions.md) — 通用能力分几类、哪些必须复用、不满足怎么办
  - [文档写作约定](development/doc-conventions.md) — 本仓文档的头部、命名、槽位边界与链接纪律
  - [UI 开发手册（写插件界面时照这个做）](development/ui-style-guide.md) — 写插件界面时照做的样式与控件手册
- dependencies/
  - [已核实的 DSH 能力（源码级事实清单）](dependencies/dsh-capabilities.md) — 已核实的宿主能力清单（源码级事实）
  - [工作区（Workspace）身份：`id` / `title` / `path`](dependencies/dsh-workspace-identity.md) — 工作区 id / title / path 三种标识的区别与坑
  - [宿主 webServer 的流式响应（SSE）能力](dependencies/host-webserver-streaming.md) — 宿主 webServer 是否支持 SSE 流式响应
  - [屏蔽官方「自动化任务」入口：可用的接口与边界](dependencies/official-schedule-toggle.md) — 停用官方「自动化任务」入口的接口与边界
  - [核心控件 `Picker` / `DateTimePicker` / `FieldHint` / `notify`（源码级事实）](dependencies/plugin-core-controls.md) — 核心 Picker / DateTimePicker / FieldHint / notify 的事实
  - [核心分栏容器 `PanelDock`（源码级事实）](dependencies/plugin-core-dock.md) — 核心分栏容器 PanelDock 的接口事实
  - [dsh-plugin-core/adv/explorer —— 工作区文件浏览与选择](dependencies/plugin-core-explorer.md) — 核心文件浏览与选择器的接口、返回值与坑
  - [dsh-plugin-core 会话弹窗（`adv/session`）槽位契约](dependencies/plugin-core-session.md) — 核心会话弹窗的槽位契约
  - [会话弹窗「官方样式对照表」（专属任务文档）](dependencies/session-view-ui-map.md) — 官方会话界面元素与本仓镜像的对照表
