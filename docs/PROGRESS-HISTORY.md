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
| 09-27~09-28 | U11 产出物打开 | 决策 39，统一 `openFile` + 页面级预览 dock，真机验证通过；收尾打磨（代码换行开关 / 面包屑 / 图标 Tooltip）见 [worklog/file-preview-polish.md](worklog/file-preview-polish.md) · 目录浏览器两轮调优见 [worklog/file-browser-ui-tuning.md](worklog/file-browser-ui-tuning.md) | [worklog/artifact-opening.md](worklog/artifact-opening.md) |
| 09-28 | 代码块工具条对齐官方 | `code.toolbarLabels` 三处补传，收敛到 `md-labels.ts` | [worklog/code-block-toolbar.md](worklog/code-block-toolbar.md) |
| 09-28~09-29 | 依赖快照（决策 43） | `resolvedDeps` 冻结上游实例 + 产出下传，真机验证通过 | [worklog/dependency-snapshot.md](worklog/dependency-snapshot.md) |
| 09-28 | 交付登记：产出物怎么被看见（U12） | 用户拍板 **B-only + 禁止 LLM 调 `present`**：插件作唯一写入方，回执成功时直写 `deliverables/presented`；数据源最终改为**实例 `outputs` 权威**（会话快照里无 `deliverables.presented` ⇒ 老任务免重跑即渲染）；交付网格挂在最后一轮 turn-tail（官方 DeliverablesTail 同位），作为 `tailSlot` 放在 `MessageIconActions` 之前 | [worklog/deliverables-display.md](worklog/deliverables-display.md) |
| 09-28 | 两层循环彻底解耦 + 派发快照（U13，决策 41/42） | 修「`enabled=false` ⇒ 已交回执的实例永久卡 `running`」与「对账实时重读活任务 JSON ⇒ 中途改设置会反向改写在飞实例的裁决」：对账不再依赖 `taskMap`、派发时固化快照。另真机热修「老库孤儿 `unknown` 实例把同 cron 新刻度永久挡死」（串行互斥只认真正在飞的 `dispatched`/`running` + 30s 宽限收口） | [worklog/loop-decoupling.md](worklog/loop-decoupling.md) |
| 09-29 | 前置任务卡交互（决策 47） | 工作区→任务两级选择，五轮真机迭代定稿 | [worklog/task-editor-ui.md](worklog/task-editor-ui.md) §十九 |
| 09-29 | UI 收口 + Agent 权限选择器（决策 50） | 文案收口 + 权限下拉四档，新增 UI 封档 | [worklog/task-editor-ui.md](worklog/task-editor-ui.md) §二十二 |
| 09-29 | 仓库暂时结项 | 所有进行中工作包落码 + 真机验证通过 | — |
| 09-30 | 编辑器 UX 第二轮（决策 52） | 错误人话化 / 统一浮层 / 预计执行 / 版本历史拆分，八轮真机反馈后结案 | [worklog/editor-ux-round2.md](worklog/editor-ux-round2.md) |
| 10-01 | 文档体系整理 | 立文档规范 `docs/README.md`；现场层拆 `PROGRESS.md`（进行中）+ `PROGRESS-HISTORY.md`（已结案一行一条）；`design/` 按七类落位（新增方法规范、功能总索引，8 个功能文档入 `features/`）；删除 `decisions.md`（内容先回补进专题文档）并回改 9 处口径冲突；两份 agent 规则文件重写为零交叉 | [worklog/docs-reorganization.md](worklog/docs-reorganization.md) |
| 10-01 | 文档微调（外部事实归置 + 样式文档去过程化） | 新建 `design/external/` 专放宿主 / 官方侧事实，两份外部文档统一头部并写明**适用版本**；`ui-foundation.md` 移出六节过程内容（361→285 行）只留规范；补「通用细则」八条规则（层级 / 焦点 / 图标 / 动效 / 溢出 / 滚动 / 间距 / 三态）；定型层残留过程措辞清理 + 体检；AGENTS 补「调研结论必须回写 + 每条标适用版本」两条规矩 | [worklog/docs-refine.md](worklog/docs-refine.md) |
| 10-01 | 控件尺寸系统归一 | 统一 `sm24/md28/lg32` 全局唯一真源；修滑轨 +2（padding 3/4→2/3px，外框严格==token）、SelectField 命名错位（sm24/md28/lg32）；Button/Input/日期时间补齐 `lg` 档，全站默认走 32 标准行；冒烟同步新几何 | [worklog/size-unification.md](worklog/size-unification.md) |
| 10-01 | UI 基础层统一（样式专项，U18） | 专项封卷：L1 token 层 + L2 控件唯一实现（`ui/`，分段/按钮/输入/下拉/开关/日期时间）+ 明暗单点；`C` 表 3 份删、宿主变量 255→0、明暗特判 7→0、自注入 0、字面量 token 化、控件高度三档；`SelectField`/`MarqueeText` 搬 `ui/` | [worklog/ui-foundation.md](worklog/ui-foundation.md) |
| 10-01 | UI 基础层收口（对齐 + 死代码清理） | 编号/名称满行、允许延迟与间隔回标准高、三下拉限宽+可收缩省略、问号统一去底色且可弹气泡、列表搜索框补 `box-sizing` 修 2px、过滤行/卡片底栏/头部控件同档对齐；input/前缀框/数字框/按钮圆角统一 `radius-md`、字号跟档；清死 CSS 15 条并补回记录表头吸顶 | [worklog/ui-alignment-round.md](worklog/ui-alignment-round.md) |
| 10-01 | 真机验证批次（主界面 / 高级区 / 表单弹窗 / 附加文件选择+上传 / UI 基础层收口） | 用户 10-01 复核五项真机验收通过，PROGRESS §1.2 待验项结清；验收清单见各 worklog | [worklog/main-panel.md](worklog/main-panel.md) §六/§8 · [worklog/task-editor-ui.md](worklog/task-editor-ui.md) §十八/§二十一 · [worklog/attachments-upload.md](worklog/attachments-upload.md) §四 · [worklog/ui-alignment-round.md](worklog/ui-alignment-round.md) §五 |
| 10-01 | 代码侧小收尾 | 删 `manualAt` 死状态（全仓未调用）+ 同步 5 处过时「刷新」注释（index.ts:174/488-490、task-list.tsx:75/80/1353）；冒烟 390/0、build 绿 | 本文件 §三 |
| 10-01 | 新增/编辑任务（U16）真机验收 | 用户装 dist/ 简单验收通过（保存链路/版本/删除/审计/附件）；问题后续反馈再回改 | [worklog/creation-edit-implementation.md](worklog/creation-edit-implementation.md) §四 |
| 10-03 | 任务展开三面板（基本信息/执行记录/日志）真机验收通过 + 基础信息收尾 + token 口径修复 | 三面板 UI 真机验收通过（定高/表格列/时间范围/状态过滤/滚动）；基础信息改版（左配置+右上次执行两栏、附件可点预览、任务会话 chip）；浮动 Loading 抽出共用组件；token 口径按官方 `usage` 互斥计数修正；基础信息收尾四处：允许延迟人话（`windowLabel` 把 `PT4H` 转中文）、附件文件名 hover 跑马灯（`MarqueeText`）、预计执行行（`relativeFuture` 相对时间 + `YYYY-MM-DD HH:mm:ss` 具体时刻，竖线分隔）、任务跑完左栏下次预计执行同步刷新（`overview.refresh` 透传进面板 on `runSig`） | [worklog/expand-panels-round4.md](worklog/expand-panels-round4.md) |
| 10-03 | 任务文件上下文（会话里三类文件展示，U22）真机验收通过 + 滚动留白收口 | 顶部输入区 = 接收 + 任务附件两组（实例快照 `resolvedDeps` / `attachments` 真源，不依赖宿主透传）；文件横向排 + 按内容宽（无最小宽、max 40ch）+ 跑马灯；前置任务一排两个 + 正方形序号徽标；来源方括号前置 `[链接]foo.md`；顶部区并入同一滚动容器（全弹窗单滚动条）；滚动留白收口：frame 上下 17/17、左右 34，tfc 不自带左右 / 上 padding；创建时间挂标题行尾部 `[YYYY-MM-DD 创建]`（老任务 `[创建时间未知]`）；界面术语统一「前置任务」；回执裁决口径修正同步落码。冒烟 488/0 | [worklog/task-file-context.md](worklog/task-file-context.md) |
| 10-03 | 回执产出校验去掉「mtime 新鲜度」闸（U3） | 用户拍板「只要他交出来的文件确实存在、格式是对的，就不用管」⇒ 三道闸改为 回执存在 / status 合法 / outputs 存在；**去掉 mtime 闸**（会误伤「复用 / 检查已有文件」类任务：文件在但未被改写 ⇒ 被判 `output-stale` 失败，用户看到「文件明明在」）；内容约束不做 | [worklog/receipt-verdict.md](worklog/receipt-verdict.md) |
| 10-03 | 回执裁决时机被动（U24） | 收到 `turn/end` 不再裁决，改为等 `agent.whenIdle()`（会话真正空闲）再裁决；`turn/end` 只记信号供 sweep 判追问；sweep 的 `turn/end` 分支去掉 `continue`，让租约 / 失联兜底仍生效，防卡死实例永久挂 running | [worklog/receipt-verdict.md](worklog/receipt-verdict.md) |
| 10-03 | 回执「第几次生效」提示词与实现矛盾（U25） | 回执工具描述写「只认第一次」但实现取最新一条（`seq DESC LIMIT 1`）= 认最后一次；用户拍板以最后一次为准，提示词说明再次提交须整体覆盖并带上先前产出（不回带＝放弃）；工具描述 + 末段指令各加一处 | [worklog/receipt-verdict.md](worklog/receipt-verdict.md) |
| 10-03 | 新增 / 编辑任务（U16）真机验收通过 | 用户装 `dist/` 实测通过（保存链路 / 版本 / 删除 / 审计 / 附件）；此前遗留小项（版本备注、审计 UI 消费面、`GET /tasks/history` query 透传）一并确认无问题 | [worklog/creation-edit-implementation.md](worklog/creation-edit-implementation.md) |
| 10-03 | 新增 / 编辑弹窗改「布局分栏」（U21）真机验收通过 | 用户装 `dist/` 实测通过：主窗被推窄而非被盖、宽度默认/下限 520 可拖可记、拖拽不选中文字、提示词下三下拉不随选项跳动、关闭只剩 ✕/Esc/取消、两条分栏同开仍保住主窗口；口径见 [creation-edit.md](../design/features/creation-edit.md) §七-B | [worklog/editor-split-pane.md](worklog/editor-split-pane.md) |
| 10-03 | 基础信息面板：末行线与行高对齐 | 左右两栏各自去掉最底下那条线（判据按整栏实际最后一块、**不写死行**：有产出物时字段区末行 Token 的线保留）；标签与值两格行高统一 ⇒ 单行上下居中、值多行时标签与值第一行齐平。冒烟 504/0，用户真机验收通过 | [worklog/info-panel-line-alignment.md](worklog/info-panel-line-alignment.md) |
| 10-04 | 工作区候选真源统一 + 任务列表顶部下拉收编 | 三处「选工作区」（编辑器底部 / 编辑器「前置任务」第①级 / 任务列表顶部）候选一律取 `GET /options` 真源，不再从任务表或卡片数据反推；取不到显示「暂无可选」且不回退反推；任务列表顶部绕过基础层手搓的官方 Menu + 自绘锚点收编为 `SelectField`（删 `menuOpen` / `.dsh-tdt-tl-ws*` / `controlBoxStyle`）；允许「选到没有任务的工作区」的空态（新增 `editorDepTaskEmpty`）；文档回改 `ui-style-guide` 下拉唯一实现表述、`ui-foundation` §5.4 真源口径、`execution-timeline` §三.1；typecheck 绿、冒烟 514/0、真机验收四项全过 | [worklog/workspace-options-unification.md](worklog/workspace-options-unification.md) |
| 10-04 | 源码态查看器改用只读 CodeMirror 6（全局收口） | file-preview 源码态 / 任务定义 JSON / 工具代码 三处只读代码展示统一为 `CodeViewer`（CodeMirror 6）：修整片白底（theme="none" 关掉 @uiw 默认 light 主题）、恢复鼠标选区（去掉 `EditorView.editable=false`，只读仍靠 `EditorState.readOnly` 拦输入）、默认全换行（EditorView.lineWrapping，去掉换行/不换行切换）、复制钮改右上角官方图标 hover 浮现；`@uiw/react-codemirror` 仓库已声明、非新引包；smoke 绿 | [worklog/source-viewer-codemirror.md](worklog/source-viewer-codemirror.md) |
| 10-04 | 立即执行（手动触发一次调度）真机验收通过 | 卡片展开区右下「删除 / 立即执行 / 编辑」三钮顺序、确认框文案、成功 Toast、任务在跑时被拒、前置未达标被拒并给原因、已停用任务仍可执行 —— 六项全过 | [worklog/manual-run.md](worklog/manual-run.md) |
| 10-04 | 执行记录总查询页（流水账）+ 任务选择器 真机验收通过 | 落码后经三版定稿与第四~八轮细磨，用户装 `dist/` 实测七项验收点全过（只头部可点展开 / 自绘正圆前置圈码 + 悬停气泡 / 展开态不常亮 / 两排产出物·前置清单 / Token 三段悬停明细 / 状态浅底与 5px 竖条观感）；冒烟 579/0 | [worklog/execution-timeline.md](worklog/execution-timeline.md) |
| 10-04 | 文件预览四项真机复验通过（U26 / U27 / U28 / U29 / U30） | U26 PDF·SVG 恢复渲染（`readBytes` 补第三参 `{}`，与渲染无关）；U27 工作区外文件第一排退化为只读完整路径 + ✕，长路径 hover 跑马灯；U28 PDF 拖动双向跟手、松手不弹回最小宽；U29 三处手写跑马灯收编 `MarqueeText`，滚到尾字停住；U30 HTML 默认渲染网页（官方同款 `srcDoc`+`sandbox=""`+CSP），源码态为 `CodeViewer` 截前 256K | [worklog/file-preview-pdf-svg.md](worklog/file-preview-pdf-svg.md) · [worklog/source-viewer-codemirror.md](worklog/source-viewer-codemirror.md) |
| 10-04 | U32 三条真机观察项确认无问题 + U31① 完成 | `TaskPicker` 浮层键位手感可用、2000 块 × `MarqueeText` 实机无明显卡顿（不上虚拟滚动）；天标签遮挡一项**作废**（第三版起日期行不吸顶）；执行记录过滤行的任务选择已换 `TaskPicker`（原生 `<select>` 不再用） | [worklog/execution-timeline.md](worklog/execution-timeline.md) |
| 10-05 | 执行记录总查询页（流水账）+ 任务选择器 真机验收全部通过（第十~十一轮定稿，整包封卷） | 三框定宽 118/82/88（md，不随填入值跳动）；状态标签两字短名 + 状态色实底反色字 + 矮 2px(22) + 自适应、备注不挂气泡；Loading 全复用右下角统一实例（第十轮误建的实例已还原，规矩入 ui-style-guide：**没点名就不许碰 Loading**）；过滤行分段控件与「任务配置」页同皮肤（变体回默认档有外描边）；条目左内边距从竖条右缘起算（`--rec-bar-w:5px`）；冒烟 601/0 | [worklog/execution-timeline.md](worklog/execution-timeline.md) |
| 10-05 | 代码渲染配色两处修复（选区对比度 + 明暗判据归宿主） | `CodeViewer` / `cm-themes` 两处：① 明暗判定从 `prefers-color-scheme`（跟系统）改回唯一判据 `body[data-ds-dark-theme]` + `MutationObserver`（修「宿主浅色面板上套暗色白字 ⇒ 白字隐形」）；② 选区从半透明白改**不透明实色**（暗 `#3E4451` / 浅 `#c8d3f0`，官方 one-dark 原值），修「框选后白字隐身」；③ 暗色 `variableName` 纯白回官方 ivory `#abb2bf`；build 过 · 冒烟 601/0 | [worklog/code-viewer-theme-fix.md](worklog/code-viewer-theme-fix.md) |
| 10-05 | 侧边栏压住宿主「系统设置」弹窗修复（Z 序归位） | 两条侧边栏（预览 dock / 编辑抽屉）是**占布局的分栏**、非浮层，移除浮层时代遗留的显式 `z-index`（dock `1030` / 抽屉 `1040`）回到 `auto`，交 DOM 顺序裁决、让宿主 `portal` 到 body 的弹窗（「系统设置」）回到上层（官方 Modal「后挂载居上」只在同层成立）；`--tdt-z-*` 阶梯与其它局部层级一律未动；build 过 · 冒烟 603/0（+2 反向断言） | [worklog/sidebar-overlap-host-modal.md](worklog/sidebar-overlap-host-modal.md) |
| 10-05 | 右侧栏「查看 / 编辑」两档 + 卡片前置任务名可点（§1.8）真机验收通过 | 查看档只读人话视图（任务配置→上次执行→提示词三块、块标题小图标、草稿标记警告色、预计执行实时推算、提示词约 5 行截断 + 展开/收起方向箭头）；底栏最左档位切换 + ✕；卡片前置任务名可点开查看档；未保存拦截统一为「草稿脏即拦」——编辑切查看 / 切编辑另一任务 / 点「＋ 新建任务」三处都弹三选确认（取消 / 继续编辑 / 直接覆盖），新建以空串标记目标、confirmPendingEdit 据 id 分流 openCreateNow；抽屉按 editor.id 重挂重置脏基线；r13 修关闭误弹未保存、附件可点预览、块标题改短竖线标（去整块长线）、标题/状态/修改没保存居左；展开前置框 hover 给背景反馈、任务名不变色。冒烟 621/0，build/typecheck 绿 | [worklog/task-viewer-mode.md](worklog/task-viewer-mode.md) |
