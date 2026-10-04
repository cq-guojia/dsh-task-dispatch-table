# 功能总索引

> **状态**：📝 新立（2026-10-01）
> **来源**：按 [`../README.md`](../README.md) §二 第 5 类建立：一页看完「有哪些功能 / 干什么 / 对应哪个页面 / 详细文档在哪」
> **配套**：各功能单独文档在 [`features/`](features/) 下；表结构与字段见 [`data-model.md`](data-model.md)

---

## 一、界面功能

| 功能 | 干什么 | 对应页面 / 文件 | 状态 | 详细文档 |
|---|---|---|---|---|
| **任务列表主面板** | 卡片列表（状态条 / 标题 / 执行方式 / 上次·下次 / 创建于；右侧 开关·编辑·展开）+ 顶部筛选 tabs·工作区下拉·搜索 | `src/client/task-list.tsx`（main 槽整页） | 🔵 落码（冒烟 299，真机待验） | [features/main-panel.md](features/main-panel.md) |
| **任务展开三面板** | 卡片展开：基础信息 / 执行记录 / 日志；右下「编辑任务」「删除」 | `task-list.tsx` 展开区 + `query.ts` | 🔵 落码（冒烟 364/0，真机待验） | [features/task-expand-panels.md](features/task-expand-panels.md) |
| **执行记录总查询页（流水账）** | 顶部一级 tab「执行记录」整屏：**全部任务**的执行流水账，按天分组（日期小字行 + 一条条自带状态色浅底的独立块，倒序）、游标「加载更多」、时间 / 工作区 / 状态 / 任务四维过滤；**点块就地展开**（手风琴）产出物全量与事件流水，只有「查看会话」按钮才开会话 | `src/client/records-timeline.tsx`；`src/client/index.ts` 的 `records` 分支 | 🔵 **落码完成**（2026-10-04 三版定稿；冒烟 556/0），⏳ 真机验收待做 | [features/execution-timeline.md](features/execution-timeline.md)（⚠️ 与「任务展开三面板」里的**单任务**执行记录是两个功能，区别见该文 §一.2） |
| **新增 / 编辑任务** | 右侧**占布局的分栏**表单（2026-10-01 起，原为浮层抽屉）：基础 / 排期 / 提示词（含版本）/ 高级 / 附加文件 / 前置任务；保存 · 删除 · 启用开关（在头部右侧、关闭 ✕ 左边） | `task-editor.tsx` + `editor-fields.tsx` | 🔵 落码（冒烟 397，真机待验） | [features/creation-edit.md](features/creation-edit.md) §七-B |
| **插件配置页** | 宿主设置页里的插件配置（默认 provider / model 等） | `config-panel.tsx` | ✅ 落码 | — |
| **查看会话（归档会话弹窗）** | 执行记录点开会话内容；头部「继续对话（开分支）」 | `session-view.ts` + `mirror/` | ✅ 真机验证通过 | [features/archive-session-view.md](features/archive-session-view.md) |
| **产出物打开与预览** | 右侧预览分栏：md / 代码 / 图片 / PDF + 目录浏览（面包屑） | `file-preview.tsx` + `file-browser.tsx` | ✅ 真机验证通过 | [features/artifact-opening.md](features/artifact-opening.md) |
| **附加文件（选择 / 上传）** | link（工作区已有文件，只记路径）+ upload（本地文件落盘任务目录） | `task-assets.ts` + `POST /attachment` | 🔵 落码（真机待验） | [../../worklog/attachments-upload.md](../worklog/attachments-upload.md) |
| **依赖（前置任务）** | 上游判定 + 写库瞬间冻结「命中哪条上游实例 + 其产出」+ 下传给下游 | `depends_on` + `reconcile.ts` | ✅ 真机验证通过 | [features/dependency-snapshot.md](features/dependency-snapshot.md) |

## 二、非界面功能

| 功能 | 干什么 | 对应文件 | 状态 | 详细文档 |
|---|---|---|---|---|
| **调度** | cron 刻度计算、到点派发、补跑窗口 | `scheduler.ts` + `tasks.ts` | ✅ | [features/state-machine.md](features/state-machine.md) |
| **对账与收口** | 实例状态流转、租约、超时、重试、串行互斥 | `reconcile.ts` + `runtime-index.ts` | ✅ | [features/state-machine.md](features/state-machine.md) |
| **派发** | 模型漏斗解析、会话创建、消息组装、preset / goal / agentTeams 接线 | `dispatch.ts` | ✅ | [../../worklog/once-dispatch.md](../worklog/once-dispatch.md) |
| **回执** | per-agent 回执工具注册与校验（status / outputs） | `receipt.ts` | ✅ | [data-model.md](data-model.md) §一 回执机制 |
| **交付登记** | 回执成功时写 `deliverables/presented`，会话尾部出官方交付卡 | `receipt.ts` + `mirror/Deliverables.tsx` | ✅ 真机验证通过 | [../../worklog/deliverables-display.md](../worklog/deliverables-display.md) |
| **任务资产与持久化** | 版本留档 / 配置快照 / 附件搬移 / 临时区清理 / 整目录删 | `task-assets.ts` | ✅ | [data-model.md](data-model.md) §五 §六 |

---

## 三、维护规矩

- **新增功能**：在 `features/` 下建一个文件（文件名 = 功能名，kebab-case），并在本表加一行。
- **改功能**：先改 `features/<功能>.md`，再在本表同步状态。
- 本表只写「有什么 / 干什么 / 在哪」；**实现过程与踩坑一律进 `worklog/`**。
