# 进度

> **这是什么**：本仓库**唯一**的进度真源。
> **怎么用**：换设备 / 换会话后，agent 先读根目录 [`AGENTS.md`](../AGENTS.md)，再读本文件的**当前状态 → 未决项 → 下一步**即可接手；需要某个工作包的踩坑与决策细节时，按「里程碑索引」里的链接点开对应的 [`worklog/`](worklog/) 文件。
> **怎么维护**：**就地更新本文件**——每次推进后同步「当前状态 / 未决项 / 下一步」；**进展日志不再写进本文件**，工作包详情写入 `docs/worklog/<工作包名>.md`（做完封卷），这里只留里程碑索引表里的一行。
> ⚠️ README / Issues / 聊天记录都不算真源。
>
> **本文件范围**：只记**开发项**（设计 → 数据模型 → 代码 → 发布）。
> 内容一旦**定型**就升格到 [`docs/design/`](design/) 下的专题文档，这里只留链接。
>
> **最后更新**：2026-09-29（二）· 任务表单弹窗观感第五轮 + **脏判定/关闭确认**（决策 45）落码推送（`bcce8cc0e`…`c56f605`，冒烟 176 全过）：Tooltip 折行（官方 `maxWidth`）、底部排收紧、弹窗宽 560、星期块改分段控件同款（灰底轨道+蓝底白字选中、与上方输入框对齐）；✕/遮罩/Esc/取消四路关闭统一「改过先确认」（官方 `Modal` 抬 z 1060）；**全屏编辑器需求已定仅调研未动工**（官方有 `MarkdownText` 渲染无编辑器，备选 textarea+官方预览 / CodeMirror 6，见 worklog §十八）· 此前：排期重构（每N周+开始时间落cron引擎）/ 附加文件壳 / 全屏编辑器+版本UI 已落码；版本持久化与附件上传待做 · **U11 目录浏览器（面包屑导航）落码**：预览 dock 从单文件预览升级为
> `FileBrowser`——`openFile(path)` 先 `list` 判别目录/文件；面包屑每段可点回跳，文件预览时面包屑保留
> （点父段即返回），顶栏「上一级 / 回到根目录 / 刷新 / 复制 / 关闭」；数据全官方
> `workspaceFiles.list`。冒烟 172 项全过 ⇒ **真机核验通过（2026-09-29 结项）**。
> **本轮调优**（见 [worklog/file-browser-ui-tuning.md](worklog/file-browser-ui-tuning.md)）：① 目录态隐藏文件名行（刷新改放第一排）；② `▾` 下拉选层加层级缩进 + 树形连接符；③ 面包屑溢出判定改用同构测量条 + `ResizeObserver`，不超长即还原完整路径；④ 核实 json/sh 图标为官方 `FileTypeIcon` 行为（不动代码）；⑤ **修代码预览「自动换行」开关无效**——官方 markdown `CodeBlock` 的 `data-code-wrap` 属性在其自身 CSS 模块缺对应换行规则（仅在 DiffBlock/ReadBlock 模块里有），在我方预览外壳作用域内补一条跟随官方属性的 CSS，换行 ↔ 横向滚动即时切换。
> **本轮（二）**（同一 worklog）：① 下拉选层**改方案 A**——每层前置 N 个官方右箭头图标表示深度，弃用 ASCII 树符 `├/└`；② **目录树内联展开**——文件夹行内 `▸` 开关点开即在原地嵌套展示子项（再点收起），点文件夹**名字**才真正进入该层；展开态随顶层目录切换清空；③ 修「返回绕回自己」——点到的目录与当前目录相同一律当刷新本层、不压历史栈；④ 撤掉第一排目录态刷新钮，刷新只留文件第二排。冒烟 172 项全过 ⇒ 真机核验通过（2026-09-29 结项）。
> U14 依赖快照（决策 43）方案已落码并真机验证通过；U13 / U12 状态见未决项。
> **U11 收尾打磨（2026-09-29）✅ 真机核验通过，U11 整条线收口**：四项全过——① 代码换行开关
> （真根因 = 官方 `CodeBody.module.css` 强制 `white-space:pre` + `ocOr` 官方类命中时我方兜底类不挂
> ⇒ 规则改挂 `[data-code-preview][data-code-wrap='true']`）；② 图标统一官方 `Tooltip`；③ 面包屑
> （回退为入参路径 + 交付卡/产出列的相对名目录经 `stat` 反推成宿主绝对路径）；④ 下拉选层箭头
> 一行一个。见 [worklog/file-preview-polish.md](worklog/file-preview-polish.md)。
> **任务表单弹窗（决策 44）**：形态 = 右侧贴边浮层弹窗；P0（界面 + 前端交互）2026-09-28 落码推送，
> **P0.5 观感返工 2026-09-29 落码推送**（启用开关移头部并改绿、次要说明进 placeholder、提示词区照参考图重排
> = 左下工作区 / 右下模型 / 右上三档来源、执行频率改「周期 / 间隔」两档、原生 select 与 datetime-local
> 换成官方 `Menu` + 自绘日历 / 时分）。**重要纠正**：官方 primitives **有**整表单件（`Switch`/`Input`/`Menu`/
> `SegmentedControl`/`Pill`…），此前「官方无表单件」的记载已推翻——真正没有的只有日期 / 时间选择器。
> 见 [worklog/task-editor-ui.md](worklog/task-editor-ui.md) §十三（观感）/ §十四（P1 数据面）/ §十五（排版第二轮）、§十六（排期区：日期+时间同排、周几改小方块、频率下拉挪到三档左侧且单次时不显示、时区读真值、有效期说人话）、§十七（频率下拉与三档等高不再跳、上面恒定一行/星期恒定在下、月日不再留英文宽度、星期加说明、时区+有效期缩号居右、有效期改问号气泡）：间距统一、新增「单次」档、分段控件收小、浮层改不透明、排期区标签列对齐、任务名称/编号合进一个框）。
> **🎉 2026-09-29 暂时结项（用户拍板）**：所有进行中工作包——U11 收尾打磨（代码换行开关 / 图标官方 Tooltip / 面包屑 / 下拉选层箭头）、U12 交付登记、U13 两层循环解耦、U14 依赖快照、里程碑 15 会话弹窗外观对齐官方、决策 44 任务表单弹窗——均已落码并通过**真机验证**，本仓库进入**暂时结项**状态。U1–U6（用户此前明确推迟）、U9（依赖真机验证）作为**重新开启时的待办 backlog** 保留，不在本次结项范围内。冒烟 172 项全过、typecheck/build 绿。

> **2026-09-29（二）· 新会话（用户新一轮需求，已落码推送 `e2bea3a` 及前序 `0e1b193`/`303a4aa`/`d3b1241`）**：在结项基础上开工，五处改动：① **排期重构**——新增「每 N 周（1–4）」与统一的「开始时间」（周期锚点：首跑下界 + 每 N 周取模；cron 无隔周位 ⇒ 引擎用锚点过滤，决策 25 修订）；`草稿→cron` 真正落库（此前 P2 占位），`tasks.ts` 加 `start` / `everyNWeeks` 并 `scheduledSlotsFor` 加锚点 + 取模过滤，冒烟新增 3 条（176 项全过）。② **提示词改纯手输**——删「手输 / 选择 / 上传」三档来源（选择 / 上传挪到独立「附加文件」框）。③ **间隔档文案纠错**——"执行一次"→"执行"（原措辞易被误读成只跑一次；间隔逻辑本身正确，保留）。④ **附加文件卡壳**（展示 + 删除已做；上传 / 选择文件交互按用户要求暂缓）。⑤ **提示词版本管理 + 全屏编辑器**（自绘行号 + .md 编辑器、版本"保存 / 回滚" UI 已做；官方无代码 / Markdown 编辑器组件——dsh-capabilities 已核实——故自绘；版本落文件系统持久化待做，P3 决策不变）。另：月份口径首选项"每月"→"全部月份"（避免与频率名撞字）。

> **2026-09-29（二）· 编辑器折行修复 + 附加文件选择/上传全链路（`ef3ce3a` / `680d23f`）**：① 全屏编辑器接 CodeMirror 软折行并锁宽 100%——此前无 `lineWrapping` 且主题未锁宽，长行不折、内容宽度失控撑爆 flex，把右侧 280px「历史版本」面板裁出可视区（「面板不出来」与「文字不折行」两个 bug 同源）；② **附加文件「选择工作区文件 + 上传本地文件」两入口全链路落码**（决策 46）：link = 官方 Modal 工作区选择器（复用 `workspaceFiles.list`，只记路径）；upload = 拖拽投放区 + 隐藏 file input（多选）→ `POST /api/task-dispatch-table/attachment`（原始名走 `x-filename` 头、扩展名白名单、20MB 上限）→ 宿主落盘插件数据根 `task-attachments/`（原始名+随机尾缀，不覆盖累加）；不引包（官方 primitives 无上传/拖拽件，范围小自研）。踩坑三条（scope 时序差 / @types/node fs 仅回调式重载 / 插值文案走 `tt`）见 [worklog/attachments-upload.md](worklog/attachments-upload.md)；冒烟 176 项全过，**真机验证待做**。

> **下一步（即时）**：① 附加文件选择/上传**真机验证**（清单见 worklog §四）；② 版本管理落文件系统持久化（新增 host 路由 + 数据根目录下 `versions/<taskId>` 文件，P3 决策：不进库不用 git）；③ 附件与任务的持久化关联 / 执行期如何注入给 agent，待用户拍板（或并入 P2 保存链路）。

> **2026-09-29（二）· 排期布局微调（`70ae6a3`）**：按用户反馈重排执行频率区——频率 / 月·日 / 每 N 周 / 时间 同排说完（每周的「每 1 周」与「每周」同排、时间直接跟在后面，如「每月 > 全部月份 > 1 日 > 09:00」）；移除频率区里那行易混的「开始时间」，统一改为卡片底部左上的「任务开始时间」锚点（周期只选日期、间隔选日期+时刻，带「?」Tooltip 说明），右下保留「允许延迟」。引擎锚点语义不变（`start` = 周期=date+频率时刻、间隔=date+time），「每 N 周」取模仍以锚点为起算周。

> **2026-09-29（二）· 观感第五轮 + 脏判定/关闭确认（`bcce8cc0e`→`c56f605` 等，见 [worklog/task-editor-ui.md](worklog/task-editor-ui.md) §十八）**：① Tooltip 折行（官方 `maxWidth` 300/320）；② 底部排收紧（日期 126 / 时刻 92 / 标签 11px / nowrap）；③ 弹窗默认与最小宽 560；④ 星期块三轮迭代定稿 = 分段控件同款灰底轨道 + 段 26×24/字 12 + **business 蓝底白字选中**，「星期」13px 与「每隔」同大、轨道与上方输入框对齐；⑤ 两处提示文案去括号、改正式；⑥ **脏判定 + 关闭确认（决策 45）**——与打开时快照稳定序列化全等比较（改回原值=没改），✕/遮罩/Esc/取消统一 `requestClose`，脏则官方 `Modal` 确认（className 抬 z 1060 盖过抽屉 1040）。⑦ **全屏提示词编辑器：需求已定、仅调研、未动工**（用户明确先不动）——形态=右侧栏盖满展开（非居中弹窗）、顶部编辑/预览切换、底部保存/取消；调研=官方有 `markdown/MarkdownText` 渲染器（预览现成）但**无任何多行编辑器**，备选 ① 自绘 textarea + 官方预览（推荐起步）② CodeMirror 6（增强）；用户所见「能编辑的侧边栏插件」为插件自做。

---

## 一、背景（简述）

起因是四类周期性自动化需求（定时巡检、镜像升级汇报、GitHub 动态汇总、趋势项目评估）。
讨论后的关键转向：重点**不是**这四件事，而是**要有一套通用的任务调度体系**——能被拆解、有依赖、可复用、可无人值守，且**调度层零大模型介入**。

详见 [README.md](../README.md)。

---

## 二、当前状态

> 🎉 **本仓库已于 2026-09-29 暂时结项（用户拍板）**：所有进行中的开发工作包——U11 收尾打磨（代码换行开关 / 图标官方 Tooltip / 面包屑从工作区根列全 / 下拉选层箭头一行一个）、U12 交付登记、U13 两层循环解耦、U14 依赖快照、里程碑 15 会话弹窗外观对齐官方、决策 44 任务表单弹窗——均已落码并通过**真机验证**，无遗留边界。U1–U6（用户此前明确推迟的后续项）、U9（依赖功能真机验证）作为**重新开启时的待办 backlog** 保留在 §四，不在本次结项范围内。冒烟 172 项全过、typecheck/build 绿。

**联调阶段已收口（2026-09-29 暂时结项）。** v0.0.1 全功能落码并真机跑通，**所有进行中工作包均已落码并通过真机验证、全部完成封卷**（见下表）；决策 1–44 已定型（[`design/decisions.md`](design/decisions.md)）；冒烟 172 项全过。

- **真机现状**：面板（侧栏「任务调度表」整页）三标签可用（任务配置 / 执行记录 / 调试）；任务表持久化主通道 = state.db meta 表（重装 / 容器重建不丢，真机验证通过）；once 全链路 `succeeded`（2026-09-25 21:35 / 22:20 两轮，任务身份 = 系统生成 UUID）。
- **任务身份闸门（决策 30）已生效**：保存时固化——无 id 补 UUID / 非 UUID 422 拒 / UUID 必须命中现有已保存表；运行时只认不修——无 id / 非 UUID 条目 warn 跳过。
- **最近一笔**：文档体系三层化 + 跨项目公用规则外提 `RULES.md`（里程碑 9）；configEditor 次通道 try/catch 修复（`774af86` 已上远端）；remote 已切 SSH。
- **里程碑 11 完成（含真机验证）**：调度循环重设计（决策 31）+ 独立 `task_log` 表与执行记录冗余字段（决策 32）——懒建行 / 不回看 / 不补跑 / skipped 只进日志；**真机 `cron-5min-探针2` 连续两轮 `succeeded`（01:35 / 01:40），无 skipped 洪水、每 5 分钟恰好一行**；构建 + typecheck + 冒烟 76 项全过。
- **里程碑 13 完成（2026-09-26）**：token 字段由单个 `tokens` 总数**拆为三列** `token_in` / `token_out` / `token_in_cache`（决策 32 修订）——`extractTokenUsage` 改返回结构化分量（含 `cachedTokens` / OpenAI 风格 `prompt_tokens_details.cached_tokens` 探测），按实例跨重试累计后写回；只认结构化分量、事件仅给总数或不含 usage 则三列留 `null`、不阻塞链路。构建 + 冒烟 93 项全过，已 push（`adbd2e7`）。**U8 仍需真机确认宿主事件是否带结构化 `usage`**。
- **里程碑 14「查看会话」真机打通（2026-09-26）**：根因 = `sessions.binding(id)` **只查已物化的 scope、从不创建**（`@deepseek-ai/dsh-api-session-controller@0.1.7-rc.2` `lib/client.js:3406`），归档 / 久未打开的会话没有 scope ⇒ 返回 `undefined` ⇒ `uiConversation.binding` 抛 `inactive session`（`@deepseek-ai/dsh-client-ui-conversation` `lib/client.js:3083` 判 `sessions.binding(sessionId) !== owner`）。**正解 = 查看前先 `sessions.retain(id, { source })` 物化 scope**（`retainScope` → `materializeScope`，`client.js:3409/3472`，内部还会触发 `manager.get(id).open()` 拉历史尾页），用完 `release()`；**与归档无关，无需反归档**。弹窗真机已显示对话内容，已 push（`fcabf8b`），冒烟 93 项全过。**外观与官方不一致 → 转里程碑 15**。
- **里程碑 16 落码（2026-09-27，决策 36/37）**：弹窗渲染主路**换官方 keyed 节点流**（`order + nodes`，legacy 降为兜底）。**三级收折照官方**：一级「用时 34 秒」行 → 二级过程分组汇总行（`mirror/ChatGroupSeat`：activity 图标↔箭头互换 + 「已读取文件，执行了命令，已调用工具等」`processTitle` 拼接 + body `max-height min(400px,50vh)` + 渐隐遮罩）→ 三级条目各自展开；分组算法按官方 `process-groups.js` 逐行移植（grouped 读取器不在公开契约面）。触发行 / 尾部操作行（复制/结束时钟）/ 用量 pill + 明细弹层照抄；工具行标题接官方 `tool.title.*` 字典。**弹窗内不做续聊**：底部对话框占位与分支 icon 移除，后续做「继续对话（开分支）」按钮（U10）。内间距定尺：左右各 24px（不再算官方列宽 920px），标题下加横线。
- **真机反馈三连修（2026-09-27 当日）**：① 「编辑/写入×2」根因 = seat 漏把 `groupPart` 下发给节点视图 + `assistantBlocks` 为步内 tool-call 块又画卡片——官方对步内工具块是 `case break` 永不渲染（lib/client.js:5864）；② 收起态漏出「思考过程·」同根因；③ 思考行照官方 ReasoningRow 重写（标题 = `message.think`「思考」，DisclosureRow + thinkBody，弃「思考过程」与盒子样式）。本地用 `tsc` 编 CJS + `renderToString` + primitives 桩复现整条渲染链定位（复现完删脚手架）；冒烟新增 3 条回归断言，**103 项全过**。**待真机复验**：收起/展开两态 + 三级逐项。
- **工具卡对齐第二轮（2026-09-27 当日）**：① 工具行图标按 activity 取官方 `PROCESS_ICONS`（edit/write=铅笔、generic=sparkle），弃全量 IconCode；② **编辑/写入展开 = 官方 `DiffBlock`**——数据源 = 工具结果 `meta.diffs`（tool-fs `computeHunkDiffs` 写入 `FileDiff{path,oldText,newText}[]`，经 `ToolResultNode.meta` 透传，源码核实），摘要 = `diffTotals` 的「路径 +N -M」；③ 无 diff 工具展开改官方「输入 / 输出」两行；④ 思考展开黑带根因 = 官方 ReasoningRow 展开行 `background: bg-base` 而面板底色是 layer-1 ⇒ 面板底色改 `--dsw-alias-bg-base`（官方会话面）。typecheck + build + 冒烟 103 项全过。**✅ 真机验证通过**：diff 形态 / 图标 / 黑带。
- **工具展开体格式修正（2026-09-27 当日，第五/六轮）**：① DiffBlock 不再套官方 `GenericCommandCard.body`（带边框+padding 的 pre）——官方 diff 面裸放，色条通到块最左缘；② 无 diff 工具展开 = 「输入 / 输出」两行（行间分隔线，参数 JSON 缩进两格美化，12px 等宽与标签同拍对齐）；③ 思考折叠预览照官方 summary > summaryText 两层补省略号；④ **写入参数侧 diff 兜底**（tool-fs `before===null` 时 `meta.diffs=[]` ⇒ 由参数组 hunk：write 全绿新增 / edit 红绿对比，真实数据非模拟）+ diff 卡摘要 = 下划线路径 + `diffTotals`。typecheck + build + 冒烟 103 项全过。
- **里程碑 16 收尾（2026-09-27，第七轮）**：弹窗内边距四边等距 **34px**（左右 = 16+clearance 18px；上下 = 面板 18px + scroll 16px）。本大项告一段落——已落地：keyed 流主路 + 三级收折、触发行、尾部操作行、思考行、工具行图标与 diff 面、输入/输出行、弹窗外壳（官方裸叉 + bg-base + 34px 内边距）。**清单遗留见 worklog 收尾快照**（ReadBlock/TerminalBlock/上下文注入行/错误红/重试行/fileMentions 等）；下一大项 = U10「继续对话（开分支）」按钮（先读 `sessions.fork` 源码）。
- **U10 落码（2026-09-27，决策 38）**：弹窗头部「继续对话」按钮 → **确认框（用户要求防误点）** → `sessions.fork({sessionId, increaseTitle:true})`（官方 ISessions 契约，无 atSeq = 全量已完成对话；子会话标题递增 (1)；归档会话的 fork 子会话 = 独立会话不受闸门限制）→ 先关弹窗（release 源会话）→ **`uiWorkspace.openSession(childId)` 官方导航跳转**（dsh-client-ui-workspace Service，官方自己 retain('mainView')，我方不碰保留值）。fork 失败留在确认框内显示原因；fork 在途关弹窗则放弃跳转。inject 补 `@deepseek-ai/dsh-client-ui-workspace`；冒烟 +3 条（uiWorkspace inject / increaseTitle / forkConfirmText）106 项全过，typecheck + build 过。
- **U10 确认框官方化（2026-09-27 第九轮，决策 38 修订）**：真机反馈——① 暗色主题下确认框主按钮白底白字（自绘写死 `--dsw-alias-brand-primary` + `color:#fff` 的锅）；② 确认框要用官方现成组件（「能用现成的不要自己写」）；③ 头部两钮 hover 背景/大小对齐官方设置窗口。源码核实官方 primitives **公开导出 `Modal` + `Button`**（`RiskConfirmation` 即两者组合的官方先例）：确认框整段换 `h(Modal,…)` + footer 双 `Button`（primary 走 `--dsw-alias-button-primary-fill`，明暗自适应；Escape/遮罩/头部叉关闭官方接管）；关闭钮照官方 `Modal.close` 重写（28×28 / radius-sm / hover interactive-bg-hover / icon 14）；分支钮照官方 outline `.sm`（28 高 / 0.5px border-l3 / padding 0 10px）；弹窗 overlay z-index 1010→1000（与官方 Modal 同层，确认框 portal 后挂载居上）；自绘 confirm 样式九条全删。build（dist 161.89 kB，较自绘版 −1.2 kB）+ 冒烟 **107 项全过**（+1：确认框挂官方 Modal 断言）。**✅ 真机验证通过**：暗色主题主按钮可读、确认框形态与官方弹窗一致、头部两钮 hover 与设置窗口一致、fork 跳转四点（确认框交互 / 跳转 `(1)` / 源会话归档 / 失败提示）。**另（同日用户拍板）**：尾部操作行每轮模型回复**全部常显**（官方历史轮 hover 才显，弹窗偏差——轮数少不必悬停；`data-actions-reveal` 恒 always，lastTurn 链已删，dist 161.14 kB，冒烟 107 全过）。
- **U10 消息行分支恢复（2026-09-27 第十轮，决策 38 ⑦）**：真机验证通过后用户拍板——每轮回复操作行的**官方分支 icon 放回来**（部分推翻决策 37 的移除），点它 = 同一确认框 → `fork({ atSeq: 该轮 tail seq })` 从**那条消息位置**截断开分支（官方契约）；头部按钮 = 省略 atSeq（最后一轮 = 全量）。`MessageIconActionsMirror` 本就完整实现官方分支按钮，接上 `onBranchAt` 透传链即可；`confirming` 升级为 `forkTarget: {atSeq?}`。冒烟 +1 **108 项全过**。**✅ 真机验证通过**：消息行分支 icon + Tooltip、截断开分支（新会话只到该条消息）、头部按钮仍全量。
- **U11 收尾打磨（2026-09-29，换了三轮才修对）**：图标（刷新/复制/复制路径/关闭/面包屑▾/返回/上一层/树▸）统一包官方 `Tooltip`（`8c3d0dd`）。**代码换行开关三轮根因**——① 传受控 `wrap` ⇒ 官方 omit 换行钮（`primitives lib/index.js:10689/:9285`）；② `ocOr` 官方类命中时我方兜底类**不挂** ⇒ 写在 `.dsh-tdt-sv-preview-coderender` 作用域下的规则全是死规则（`official-classes.ts:140`）；③ **真根因** = `dsh-client-ui-sidebar-documentpreview` 的 `CodeBody.module.css` 对 `.code pre` **强制 `white-space:pre`（默认不折行）**，只有 `.renderer[data-wrap=true]` 才放开，而 `data-wrap` 由官方预览面板下传、我方从不设。正解（`dceb221`）= 规则改挂 `[data-code-preview]`（官方 CodeBody 与我方兜底 div 都带）+ `[data-code-wrap='true']` 复刻官方放开规则（含 `--dsl-code-block-line-white-space` 行变量），特异性 (0,3,·) 压过 (0,2,·)。**面包屑**：为修「点目录只剩一层」本轮一度把 `dir` 改成服务端 `list` 的 `path` ⇒ **改坏**（该 path 是 `workspacePathOf(root,target)` 的**工作区相对**形式，工作区根为 `/workspace` 时 `/workspace/Temp` 会被压成 `Temp`，点任何文件都只剩最近一层）⇒ **已回退为入参路径**（用户要的就是「从工作区根往下列」= 原有逻辑），并在 `crumbsOf` 处加防再犯注释；保留根目录态「（工作区根目录）」占位 crumb。「点目录只剩一层」已解决（`74907fa`）：场景 = 从回契产出（交付卡/产出列）点文件夹，入口把 agent 声明的工作区相对名原样传入 `openFile`。官方没有目录级绝对路径接口（stat 只认 regular file）⇒ `FileBrowser` 入口统一解析：目录取任一「文件」子项 `stat` 的 `absolutePath` 掐掉文件名反推；文件 `stat` 自身取父目录；解析不出退回入参。已知边界：空目录/只含子目录解析不出（无文件子项可 stat），面包屑退化为相对形式。**下拉选层箭头**：每行只画一个右箭头、行首空位占位保持缩进。build（dist 343.04 kB）+ 冒烟 172 项全过 + typecheck 过，见 [worklog/file-preview-polish.md](worklog/file-preview-polish.md) §七。**✅ 2026-09-29 真机核验通过（四项全过）⇒ U11 整条线收口，本工作包封卷。**
- **重试/轮次失败/限长三件套官方化（2026-09-27 第十一轮，ui-map 清单 19）**：真机截图对比——我方旧自绘整行红「处理失败」vs 官方三段式。照官方 MessageItem 落码：① 重试行 = 官方 `ModelRetryItem`（`<details>` 折叠，摘要「已重试模型请求 (n/m) · Ns」，scheduled 在途时倒计时 + shimmer，展开见「重试延迟 / 失败原因」；keyed 数据取 `attempts.current`，**顺带修掉旧实现恒显 scheduled 的缺陷**）；② 轮次失败行 = 官方 `TurnErrorItem`（StateDot(error) 红点 + 红「本轮运行失败」标题 + 灰原因 + **右侧 `<code>` 机器码标签**如 SERVER）；③ 限长行 = 官方 `TurnMaxTokensItem`（StateDot(warning) 警示组）。文案 zh/en 16 键逐字抄官方词典，兜底 CSS 逐值照抄；旧 `sessionTurnError` 等键删除。冒烟 +6 = **114 项全过**（build 171.69 kB）。**✅ 真机验证通过**：折叠摘要/展开两态、右侧机器码标签、暗色配色。
- **U11 拍板（2026-09-27，决策 39）**：源码核实官方四层能力——数据层 `workspaceFiles` remote（read 分页/readBytes/stat/list/changes，归档会话可读不激活 agent）、预览层右栏（Markdown/Shiki/图片/PDF/HTML）、产出物层 `present`+`workspace/changes`、原生层 `openWorkspacePath`（Host 桌面专属不可用）；**官方右栏对本插件证伪**（seat 按会话挂载 + 预览组件绑 sidebar 槽位，整页化也救不了）。拍板 = **统一 `openFile(path)` 入口 + 分栏推压预览面**（弹窗内右侧分栏 / 整页右滑分栏），渲染数据全官方（MarkdownText / Shiki / 浏览器原生 / workspaceFiles 真实取数），链接处零写死。落码清单见 [design/artifact-opening.md](design/artifact-opening.md) §四。
- **U11 落码（2026-09-27，同日）**：设计稿 §四五条全落——① inject 补 `@deepseek-ai/dsh-api-workspace-files`，client 侧 `ctx.inject(['remote'])` 探 `remote.workspaceFiles`（探不到 = 功能整体降级不报错）；② 预览引擎 `src/client/file-preview.tsx` 按扩展名分派：md = 官方 `MarkdownText`、其余文本 = 官方 primitives `CodeBlock`（Shiki 积木，lang = 扩展名）+ `read` 分页（「加载更多」nextOffset = 页 offset + lines）、图片/PDF = `readBytes`→Blob→objectURL（pdf=iframe / img=图片，卸载 revoke）；③ 错误态照官方 bareCode 分支：not-found / lookup-not-found → 「文件不存在」、too-large → 「超出预览上限（{limit}）」、not-text → 二进制空态、not-regular-file → 目录/symlink 文案、其余 → 「读取失败：{code}」，空态带「复制路径」（官方 `writeClipboard`）；④ 统一入口：工具卡 diff 摘要路径 + 无 diff 工具 argsRaw `file_path`/`path`「文件」行 + markdown 正文 `fileMentions`（自建会话级词表：collectFilePaths 遍历 keyed 工具流收集路径，makeFileMentions 归一化精确匹配优先、唯一 basename 兜底，resolve 不出保持惰性 code 永不猜）全走同一 `openFile(path)` → 弹窗内右侧分栏推压（对话左压，预览面 `width:min(520px,48%)`，换文件按 key 重挂载）；⑤ 整页只留接口不落 UI。冒烟 +10 = **124 项全过**，typecheck + build 过（dist 190.21 kB）。**✅ 真机验证通过**：分栏推压形态 / 工具卡路径点击 / md 行内链接 / 四类预览 / 错误态 / 加载更多。
- **工具卡三块官方化（2026-09-28 第十二轮，ui-map 清单 9/13/17）**：用户三张官方截图要求拉齐——① 读取文件展开 = 官方 **`ReadBlock`**（行号列 + 头 4 行 + 尾 4 行 + 中间「… 其余 N 行」截断；`readCardModel` 收窄 meta + `<path>/<type>file</type>/<content>` envelope 校验，不合法回退 ioCard）；② 运行命令展开 = 官方 **`TerminalBlock`**（深底终端卡：命令行 + 复制钮 + 输出区，maxLines ∞；`parseExitStatus` 剥尾部 `[exit code: N]`/`[killed by signal: S]`，退出码≠0/信号 ⇒ 整行 error；persistent/background/spill/错误回退）；③ 其余工具展开 = 官方 **ioCard 灰框**（灰色圆边容器：输入 JSON + 分隔线 + 输出[data-error]）。工具行真身核实 = `@deepseek-ai/dsh-client-ui-tool` 的 `GenericToolCard`+`ToolRow`（非 chat 包 GenericCommandCard），镜像重写 mirror/GenericCommandCard.tsx：五态 `data-state`（preparing/running/ok/error/stopped）+ `data-tool`/`data-variant`、per-variant 摘要（SUMMARY_KEYS/TOOL_TITLE_KEYS/VARIANT_ICONS 逐值照抄）、diffStat 独立 span、read/write/edit 摘要路径 = fileLink（openFile）。官方类发现扩展 ui-tool 包前缀；兜底 CSS = 官方 ToolRow.module.css 逐值镜像。typecheck + build（dist 210.42 kB）+ 冒烟 +6 = **130 项全过**。**✅ 真机验证通过**：读取文件中间截断 / 运行命令终端卡 / 工具调用灰框三块形态。
- **U11 第二轮：交付文件官方化 + 入口补全（2026-09-28）**：真机反馈「预览分栏没有入口」（点写入路径只展开明细）。读 `dsh-client-ui-deliverables@0.1.7-rc.2` 源码核实官方「交付文件」两层：① `present` 工具调用 = `tool.call.toolview` 槽位 key='present' 挂官方 `PresentRow`（标题「交付文件」+ IconDeliverDocRegular + 状态词 + 路径列表纯文本不可点 + 展开结果原文）；② turn 尾部 = `turnTail` 槽位挂 `DeliverablesTail` → `PresentedFileCard` 网格（FileTypeIcon + 名称 + 简介，**整卡可点 → 预览**，>4 张折叠），数据真源 = `deliverables/presented` 事件（= 模型调了 present 才有——「只有一个对话有」的答案）。落码：mirror/Deliverables.tsx 新建（PresentRowMirror + DeliverablesGridMirror 逐值照抄）、tool-call/legacy 分流 present、turn-tail 接卡网格（closing null 也渲染）、collectFilePaths 收录 present 交付路径、official-classes 扩 deliverables 前缀、locales 13 键、兜底 CSS。冒烟 138 项全过。
- **U11 第三轮：预览面上提为页面级唯一 dock + 拖拽 + 崩溃隔离（2026-09-28）**：用户拍板「弹窗与整页共用同一个预览面、弹窗不遮盖它」⇒ 预览从屏幕最右挤出、把整页（含弹窗）往左推（`--dsh-tdt-preview-w` 变量驱动弹窗 overlay 的 right；第三轮时整页用 marginRight，第四轮改 flex 分栏）；弹窗内分栏形态废弃；**关弹窗不影响预览、预览可独立收回**；左缘 6px 拖拽条调宽（拖时只改变量、松手落 state + localStorage，320px ~ 视口 70%）。同时修两个真机 bug：① 预览体包 `PreviewBoundary` ⇒ 渲染异常不再拖垮整页（「点了直接黑屏」）；② `read`/`readBytes` 结果按官方 wire schema 防御解析，取不到 text/data 走错误态并打形状日志（「undefined undefined undefined」+ `endsWith` 崩溃）。另：**执行记录行新增「产出」列**——回执 outputs（决策 32③ 真值）逐个渲成链接，走同一个 `openFile` 入口。typecheck + build（dist 237.20 kB）+ 冒烟 +7 = **146 项全过**。
- **U11 第四轮：真机三反馈修复（2026-09-28）**：① 控制台 `read 返回形状不符契约（无 text 字段）：{ok,error}` ⇒ 真相 = **typert 远端面失败时 resolve `{ok:false,error}` 而非 reject** ⇒ 新增 `unwrapEnvelope` 剥信封，失败按官方 bareCode 走错误态文案（原来被当成空内容渲染）；② 「预览弹出后整页滚动条没了」⇒ dock 原是 fixed 浮层压住滚动条 ⇒ 改为**占布局的分栏**（根容器横向 flex：内容区 flex:1，dock sticky 占 `--dsh-tdt-preview-w`）——整页被真正挤窄、滚动条留在内容区，与用户「分栏压过来，不是盖上去」的要求一致；③ 文本渲染对齐官方 `sidebar-documentpreview` 的 CodeBody（`lib/client.js:5033`）：所有文本统一 `CodeBlock + lineNumbers:true + lang=languageForPath(path)` + 官方 toolbar（复制/换行）；md 默认 MarkdownText 渲染视图，右上角「源码」切到同一块 CodeBlock（官方预览层无「编辑」——那是编辑器 tab，不在预览契约 ⇒ 只做渲染⇄源码两态，用户已认）。官方类发现扩 `ui-sidebar-documentpreview` 前缀（CodeBody: renderer/code）。typecheck + build + 冒烟 +4 = **150 项全过**。
- **U11 真机「链接不可点」根因修复（2026-09-28 第五轮）**：真机截图确认读取/写入行路径全部不可点 ⇒ 根因 = 注入键缺 **dotted `remote.workspaceFiles`**（官方 client 模块同款 inject 语义 = 等命名空间挂上 remote 才启动；只注 `['remote']` 回调先于挂载触发且不重试 ⇒ 探测永久失败 ⇒ `fileOpen` 全程 undefined ⇒ fileLink 全降级纯文本）。修复 = inject 补 dotted 键 + 取值双保险（dotted 注入值优先，退回 remote 属性）+ 等待/就位/未就位三条日志。typecheck + build（dist 227.21 kB）+ 冒烟 +1 = **139 项全过**。**✅ 真机验证通过**：重装后控制台应出现「remote.workspaceFiles 已就位」，然后读取/写入行路径、交付文件卡、正文文件链接均可点开右侧预览分栏。
- **代码块工具条对齐官方（2026-09-28 第九轮）**：真机反馈「官方代码块右上两个图标钮，我们弹窗里是中文『复制』文字钮」。根因（源码级）= 官方 `CodeBlock` 拿 `labels.code.toolbarLabels` 当**分叉开关**（有 ⇒ `CodeToolbar` 图标钮卡片；无 ⇒ 老式 banner，右 = 文字复制钮、无换行钮），而官方 Chat 的 `markdownLabels(t)` **必传**这三条（`ui-chat lib/client.js:196-210`）——我们三处 `MarkdownText` 调用点（正文 / 思考体 / 预览 md 渲染态）都没传。修法 = 新建共用常量 `src/client/md-labels.ts`（单一份，取值接 `locales.ts` zh 词典）+ 三处改用 + `primitives.d.ts` 补 `toolbarLabels?` 类型；预览面板源码态的 CodeBlock 本就传了 `toolbarLabels`，不受影响。typecheck + build（dist 241.68 kB）+ 冒烟 +1 = **152 项全过**。**✅ 真机验证通过**：弹窗正文 / 思考展开体 / 预览 md 三处的代码块右上应为「换行 + 复制」两个图标钮（hover 有底、tooltip 出「复制」、复制成功变勾 1 秒复位）。遗留（en 界面下这三条 tooltip 仍中文）见 [worklog/code-block-toolbar.md](worklog/code-block-toolbar.md)。

---

## 三、里程碑索引

| # | 工作包 | 状态 | 时间 | 一句话 | 详情 |
|---|---|---|---|---|---|
| 1 | 立项、选型与设计定型（含 Web 配置页） | ✅ | 09-19 ~ 09-21 | DSH host 插件 + SQLite 选型定型，决策 1–18，v0.0.1 骨架落码真机首装，配置页真机跑通 | [worklog/genesis.md](worklog/genesis.md) |
| 2 | 一次性任务、回执与派发链路 | ✅ | 09-21 ~ 09-23 | 决策 18–24（once / 回执 / live 重排 / ctx 透传 / 模型漏斗 / preset / per-agent 回执工具），🎉 首次全链路真机跑绿 | [worklog/once-dispatch.md](worklog/once-dispatch.md) |
| 3 | 刻度化调度与执行身份 | ✅ | 09-24 | 决策 25/26 落码：UUID 主键 + `UNIQUE(task_id, scheduled_at)`，小时/分钟级 cron 可跑；双标签面板 + `npm run smoke` | [worklog/ticks-identity.md](worklog/ticks-identity.md) |
| 4 | 执行记录「查看会话」 | ✅ 方案 | 09-24 | 决策 27 证伪 → 28 自绘只读弹窗落码 → 29 复用官方 ChatView（方案拍板，暂不动工） | [worklog/session-view.md](worklog/session-view.md) |
| 5 | 宿主 0.1.7-rc.1 迁移与数据通道 | ✅ | 09-24 ~ 09-25 | 侧栏入口 panellist + main 整页化；数据通道五连败后定案 webServer HTTP 路由 + 同源 fetch | [worklog/rc1-migration.md](worklog/rc1-migration.md) |
| 6 | 0.1.7 兼容性排障 | ✅ | 09-25 | ENOENT 误报静默；v4 会话消息格式 source.kind 修复（自有 producer kind） | [worklog/runtime-compat.md](worklog/runtime-compat.md) |
| 7 | 持久化主通道与调试页 | ✅ | 09-25 | tasksInline 改 state.db meta 表（重装不丢）；面板「调试」标签直读三表；once 真机重新跑绿 | [worklog/persistence.md](worklog/persistence.md) |
| 8 | 任务身份闸门（决策 30） | ✅ | 09-25 | 三字段模型（id/title/code）→「保存时固化，运行时只认」→ UUID 必须命中现有表；真机验证生效 | [worklog/identity-gate.md](worklog/identity-gate.md) |
| 9 | 文档体系三层化 + 公用规则真源外提 | ✅ | 09-25 | PROGRESS 109KB→11.5KB 拆三层（现场/叙事/定型）；跨项目公用规则外提为根目录 `RULES.md`，AGENTS.md 瘦身为薄壳 | [worklog/docs-system.md](worklog/docs-system.md) |
| 10 | 周期任务（cron）全链路验证 | ✅ | 09-26 | 每 5 分钟 cron 真机跑通、跨天成功；暴露 `skipped` 洪水与提前 pending 两缺陷 → 触发里程碑 11 | — |
| 11 | 调度循环重设计 + 日志表 + 冗余字段 | ✅ | 09-26 | 决策 31/32：懒建行/不回看/不补跑/skipped 只进日志 + 独立 `task_log` 表 + 执行记录加 outputs/tokens 列；真机复测发现并修掉 `dispatched_at` 回归（`output-stale`，a3b9899）；**真机 `cron-5min-探针2` 连续 succeeded（01:35/01:40），无 skipped 洪水**；冒烟 76 项全过 | [worklog/scheduler-redesign.md](worklog/scheduler-redesign.md) |
| 12 | 依赖（前置任务）语义定型 | ✅ 落码完成 | 09-26 | 决策 33 已定型 + 落码（U7 八条逐条结论）：`latest_success` 改判「上游最近一条必须 succeeded」、删 `freshness`、不做水位线、复用旧产出只告警；**一度拍板的水位线方案已废弃**（与周报→日报快照复用冲突）；冒烟 84 项。**真机验证暂缓**，见 U9 | [worklog/dependency-semantics.md](worklog/dependency-semantics.md) |
| 13 | token 字段三拆列（决策 32 修订） | ✅ | 09-26 | 单个 `tokens` 总数拆为 `token_in` / `token_out` / `token_in_cache`；`extractTokenUsage` 结构化分量探测 + 按实例累计写回；事件无结构化 usage 则三列留 null 不阻塞 | — |
| 14 | 归档会话弹窗显示（数据链打通，决策 34 自渲染） | ✅ 数据链 | 09-26 | 决策 29（ChatView 挂载）经 T1 证实在 0.1.7-RC.2 不可行 → 决策 34 自渲染；**真机已弹出并显示对话内容**：根因 = 查看前须 `sessions.retain(id,{source})` 物化 scope（源码级定位，见决策 35），与归档无关；自渲染消息/思考/工具卡 + markdown + 官方 `--dsw-alias-*` 变量。**外观与官方差距大 → 转里程碑 15** | [design/archive-session-view.md](design/archive-session-view.md) · [worklog/session-view.md](worklog/session-view.md) |
| 15 | 会话弹窗外观对齐官方（决策 29 路线复评） | ✅ 完成（真机验证通过） | 09-26~09-29 | 决策 34 自渲染外观用户反馈「与官方完全不一样」。T1 曾判 ChatView 挂载不可行，但**该结论是在未 retain 的前提下得出的**——`retain` 现已证实存在且可用 ⇒ 按源码重评 scoped-slots 引擎装配（`useHost` / `useRootBinding` / `observableHook` / `ScopeBindingProvider` + `entriesOf` / `storeOf` / `scope('session')` + `uiSession.adapter.bindingSource` + `sessions.retain`），在自家弹窗挂官方 ChatView 本体；外观对齐全部元素（含上下文注入行、用户消息操作行、👍👎、「到底部」钮）照 [`design/session-view-ui-map.md`](design/session-view-ui-map.md) 补齐，真机核验通过 | [worklog/session-view.md](worklog/session-view.md) |
| 16 | 官方 keyed 流 + 三级收折照抄 + 弹窗外壳改宿主惯例（决策 36/37） | ✅ 落码 | 09-27 | 渲染主路换 `order + nodes`（keyed ChatNodeStore）；官方 ChatNodeSeat 折叠判定 / TurnProcessNodeView 用时行 / **ChatGroupSeat 过程分组（process-groups 算法移植，二级收折）** / TurnTriggerNodeView 触发行 / TurnTailNodeView+MessageIconActions 操作行 / TurnUsagePanel+StatDialog 用量弹层逐字照抄进 `mirror/`；工具行标题接 `tool.title.*` 字典；弹窗不做续聊（Composer 占位与分支 icon 移除 → U10「开分支继续对话」）；外壳 `min(1120px,100vw-32px)`×`calc(100% - 80px)` + 裸叉关闭钮 + 标题横线 + 内间距定尺 24px。**待真机逐级比对折叠形态** | [worklog/session-view.md](worklog/session-view.md) · [design/session-view-ui-map.md](design/session-view-ui-map.md) |
| 17 | U10「继续对话（开分支）」（决策 38 含 ⑦） | ✅ 完成（真机验证通过） | 09-27 | 弹窗头部「继续对话」按钮 + 每轮回复操作行官方分支 icon：统一确认框（官方 Modal + Button，防误点）→ `sessions.fork`（increaseTitle 递增 `(1)`；头部 = 全量，消息行 = `atSeq` 截断到该条消息）→ 先关弹窗（release 源会话）→ `uiWorkspace.openSession` 官方导航跳转；尾部操作行恒常显（弹窗偏差，用户拍板）；inject 补 dsh-client-ui-workspace。冒烟 108 项全过 | [worklog/session-view.md](worklog/session-view.md) · [design/decisions.md](design/decisions.md) |
| 18 | U11 产出物打开（决策 39） | ✅ 真机验证通过 | 09-27~09-28 | 官方四层能力核实；右栏对本插件证伪；统一 `openFile` 入口 + 弹窗内右侧分栏推压预览面（md=MarkdownText / 代码=CodeBlock Shiki / 图片·PDF=readBytes→blob / 文本=read 分页；错误态照官方错误码；fileMentions 会话级词表）；第二轮补交付文件官方化（present 行 + 交付文件卡网格）+ workspaceFiles 诊断日志；冒烟 138 项全过 | [design/artifact-opening.md](design/artifact-opening.md) · [worklog/artifact-opening.md](worklog/artifact-opening.md) |
| 19 | 代码块工具条对齐官方 CodeCard（`code.toolbarLabels`） | ✅ 真机验证通过 | 09-28 | 官方 `CodeBlock` 以 `labels.code.toolbarLabels` 为分叉开关（缺 ⇒ 文字「复制」老式 banner）；三处 `MarkdownText` 调用点补传并收敛到共用 `src/client/md-labels.ts`；冒烟 152 项全过 | [worklog/code-block-toolbar.md](worklog/code-block-toolbar.md) · [design/session-view-ui-map.md](design/session-view-ui-map.md) |
| 20 | 依赖快照：判定结果冻结 + 产出下传（决策 43） | ✅ 真机验证通过 | 09-28~09-29 | 用户点破两个缺口：`judgeDependencies` 命中的上游实例对象用完即丢（快照无依赖字段 ⇒ 发动时不知道按哪条上游放的行）；上游 `outputs` 列无下传通道（`buildMessage` 不注入）。拍板 = `InstanceSnapshot.resolvedDeps` 冻结 task/instanceId/sessionId/上游 workspacePath/outputs，Loop B 只读不重判，重试沿用；同日落码，真机验证通过（上游在落库与发动之间再跑成功一轮 ⇒ 下游仍指向落库时那条），冒烟 172 项全过 | [design/dependency-snapshot.md](design/dependency-snapshot.md) · [worklog/dependency-snapshot.md](worklog/dependency-snapshot.md) |
| 21 | 附加文件：选择工作区文件 + 上传本地文件（决策 46） | 🔵 落码（真机待验） | 09-29 | 不引包自研（官方 primitives 无上传/拖拽件）：link = 官方 Modal 内嵌工作区选择器、只记路径；upload = 拖拽/点选 → `POST /attachment` 落盘 `task-attachments/`（扩展名白名单 + 20MB、原始名+随机尾缀不覆盖累加）；附件目录 settings inject 就绪时定格、webServer 路由惰性读取（scope 时序差）；冒烟 176 项全过 | [worklog/attachments-upload.md](worklog/attachments-upload.md) · [design/decisions.md](design/decisions.md) 决策 46 |

---

## 四、未决项

### 已知待解决（用户明确推迟，不阻塞当前联调）

> 📌 本仓库已于 2026-09-29 **暂时结项**；下表 U1–U6 / U9 为**重新开启时的待办 backlog**，不在本次结项范围。U8 / U10–U14 已随结项真机验证通过，标记为 ✅。

| # | 问题 | 现状与影响 | 将来怎么解（方向，未定） |
|---|---|---|---|
| U1 | **中途重启的续跑 / 补跑能力缺失**（2026-09-23 真机暴露，用户拍板记为后续项，**本次不处理**） | 插件进程重启（含升级）会随进程失去既有 agent handle ⇒ 在跑实例被 `startupScan` 置 `unknown` ⇒ 静默观察 65 分钟判死 ⇒ 因默认 `retry.maxAttempts=1` 直接 `failed`。**注意：即便用户在 UI 手动「继续」会话，今天也仍然交不了回执**——`task_dispatch_table_receipt` 是在**派发的 `setup` 里按 agent 作用域注册**的，恢复/重建出来的会话里没有这张工具。**自动化任务必须扛得住服务重启**（宿主重启、机器重启同理）：要么接着跑，要么重头跑 | ① 启动时对未终态实例做**会话再采纳**（re-adopt：找回会话 + 重新注册回执工具 + 重新登记 handle），并补发一次追问 ⇒ 「手动继续」这条路才真正通；② 会话确实已死的，判死时给一次**因重启中断**的补跑，且该额度独立于用户配的 `retry.maxAttempts`（不与正常失败重试混算）；③ 补跑要处理**遗留副作用**（上次会话可能已产出半成品文件），需约定重跑前清理或给幂等语义 |
| U2 | **失败即归档**，排查时找不到现场（同上推迟） | `finishTerminal` 成败都 `archiveSession`，会话从列表消失（日志仍在磁盘）。真机已两次造成「想排查时会话不见了」 | 配置化 `archive.on`（`succeeded` 或 `always`），是否改默认待用户拍板 |
| U3 | **产出只验「存在 + 新鲜」，不验内容** | `checkReceipt` 三道闸 = status 合法 / 文件存在 / `mtime > dispatched_at`。本测试任务（建空文件）够用；换真报告任务，agent `touch` 一个空文件即可通关 | 给 `contract` 增补内容约束（最小体积 / 非空 / 必含关键字 / outputs 必产清单），按任务声明校验 |
| U4 | **`logical_date` 是否显式注入尚未定** | 真机 `once8` 实例日期 `2026-09-23`，agent 产出却是 `work-report-2026-09-24.md`。待确认是任务提示词里写了明天日期，还是模型自己算的；后者说明**日期不该让模型猜** | 若属模型自算 ⇒ 把 `logical_date`（及期望日期格式）显式写进派发消息，与「回执不许模型传 session」同理：**凡不由模型决定的，一律由调度器注入** |
| U5 | **执行记录是否带「定义版本 + 配置快照 + 来源」**（`def_revision` / `def_snapshot` / `run_type`，**已设计、未拍板**；**2026-09-28 演进**：快照方向已随**决策 41** 拍板——def_snapshot 精简为执行所需字段、派发落库时固化，落码并入 U13） | 现在执行行只引用 `task_id`，**不记录当时那份配置** ⇒ 用户改完配置就回答不了「这次跑的是哪一版」；且分不清这次是**按点调度 / 用户手动重试 / 补跑**。直接影响「点开一条记录看当时的配置」与「失败点重试」按钮 | ① `def_snapshot` 存当时配置 JSON（Airflow 有 `rendered_task_instance_fields` 同款）；② `run_type` 区分 scheduled / manual / retry / backfill（Airflow 的 `run_id` 前缀就是 `scheduled__` / `manual__`）；③ **自动重试仍走行内 `attempt+1`（决策 10 不动），用户手动重试 = 新建一行 `run_type='manual'`** ⇒ 不吃自动重试预算、审计清楚；④ 唯一键若加 `def_revision`，连「月任务改成年任务后锚点撞车」也一并合法 |
| U6 | **面板收尾**：回收「数据通道诊断」临时行与 configForms/settingsScope 兜底块（暂缓，等链路稳定后一并做） | rc.1 上 HTTP 是唯一能出数据的通道，兜底块死代码 | 仅留 HTTP 一条真通道，删除诊断行与兜底块 |
| U7 | ~~依赖语义边界未拍板~~ → **已定型（决策 33，2026-09-26）** | `latest_success` 改判「上游最近一条必须 `succeeded`」（失败/在跑 ⇒ 阻塞）；删 `freshness`；**不做**水位线/`consumed_upstream` 列/`consumeOnce` 开关；上游「错过」时复用旧产出**只告警不拦**（已知风险，用户接受）；必修 `getLatestSuccess` 排序改 `scheduled_at` | ✅ 已定型 → 剩落码 + 真机验证（里程碑 12），见 [worklog/dependency-semantics.md](worklog/dependency-semantics.md) |
| U8 | ✅ **已真机验证通过**（列与写回路径已落地且生效） | `extractTokenUsage` 已做**多位置 × 多字段名**探测：位置（`usage` / `tokenUsage` / `tokens` / `data.usage` / `detail.usage` / `message.usage`）× 字段名（`total` / `totalTokens` / `total_tokens` / `prompt+completion` / `input+output` / 下划线命名）。首个事件会打印一次「会话事件字段：…」 | ✅ 真机验证：宿主事件已暴露结构化 `usage`，`token_in` / `token_out` / `token_in_cache` 三列正常取值写回；无结构化 usage 的事件三列留 `null` 不阻塞（已含在 172 项冒烟 + 真机核验内） |
| U9 | **依赖（前置任务）真机验证暂未做**（用户 2026-09-26 决定留口子） | 判定逻辑已由冒烟 [9] 八项覆盖；当前无真实多任务依赖场景，构造成本高 | 待**正式用到依赖功能**时按 worklog 第六节「复验清单」补验：放行 / 阻塞（依赖不存在 id）/ 复用告警三条 |
| U10 | **「继续对话（开分支）」按钮**——✅ **完成收口（2026-09-27 真机验证通过，决策 38 含 ⑦）** | 头部「继续对话」按钮（从最后一轮 = 全量分支）+ 每轮回复操作行官方分支 icon（`fork({atSeq: 该轮 seq})` 从该条消息截断开分支）；统一确认框 = 官方 Modal + Button（明暗自适应）；先关弹窗（release 源会话）→ `uiWorkspace.openSession(childId)` 官方跳转；fork 失败留框内提示。冒烟 108 项全过 | 无遗留 |
| U11 | **产出物打开与展示方式**（2026-09-27 发起；同日拍板 = 决策 39 并落码完成；09-28 第二轮补交付文件官方化、第五轮修「链接不可点」根因） | ✅ 真机验证通过：inject `remote.workspaceFiles`（**含 dotted 键**）+ `file-preview.tsx` 预览引擎 + 页面级唯一 dock 分栏推压 + 工具卡路径 / md 正文 fileMentions / 交付文件卡全走统一 `openFile`；错误态照官方错误码；冒烟 139 项全过 | 场景 2（任务产出物展示）转 U12；产出登记见 U12（B+C）。**2026-09-29 收尾打磨四项（代码换行开关 / 图标官方 Tooltip / 面包屑 / 下拉选层箭头）真机核验通过 ⇒ U11 整条线 ✅ 收口**；相对名目录（含空目录 / 只含子目录）经 workspace-root 缓存 + 有界 BFS 解析为宿主绝对路径（`204cfdf`），面包屑无遗留边界 |
| U12 | **交付登记（任务产出物怎么被看见）**——✅ **方案已拍板（2026-09-28，决策 40 演进为 B-only + 禁止 present）**：插件作**唯一写入方**，回执成功时直写 `deliverables/presented`（files=校验 outputs，放宽到目录，可多目录+多文件混合）；**提示词禁止 LLM 调 `present`**（工具拒目录且调目录会报错），LLM 只在回执 `outputs` 声明产出（目录不限于网页项目）。已否决「插件 UI 自己画卡」 | 🔵 落码已推送（`7293bfc`）→ 真机复验暴露**弹窗交付卡不渲染**两轮：① `turn.data` 是 Map、对象式访问必为 undefined → `turnDeliverablesPresented` 兼容 Map；② 推送后复验仍不渲染 ⇒ 根因是**会话快照里压根无 `deliverables.presented`**（插件 `append` 被 `session/callId/sessionProjections` 缺失分支跳过 / 宿主 timeline 未重放）→ **数据源改为实例 `outputs` 权威**（合并快照去重，老任务免重跑即渲染）→ ③ 位置/样式对齐官方：删顶部区块、网格挂**最后一轮 turn-tail**（官方 DeliverablesTail 同位）→ ④ 网格仍在操作行下方：改作为 `tailSlot` 放在 `MessageIconActions` 之前，并补齐 `/api/present.host` 桌面不可用提示；同轮修订回执提示词（outputs 粒度：本任务专用文件夹→报目录；既有/按规范目录→逐个报文件）；冒烟 164 过 ⇒ **✅ 真机验证通过，U12 整条线收口** |
| U13 | **两层循环彻底解耦 + 派发快照（决策 41/42，2026-09-28 拍板并同日落码 + 热修）** | 真机暴露：`enabled=false` ⇒ 任务被 `loadTasks` 过滤出 `taskMap` ⇒ 对账 `taskOf()` undefined ⇒ `settleByReceipt` 提前 return ⇒ **已交回执的实例永久卡 running**（agent 实际已完成）；且对账实时重读活任务 JSON（retry / window / workspace / validStatuses），中途改设置会反向改写在飞实例裁决。定型表述见 [design/state-machine.md §0](design/state-machine.md)、落码记录见 [worklog/loop-decoupling.md](worklog/loop-decoupling.md) | 🟢 已落码 + **真机回归热修**：落码后真机发现"老库一条卡 running 的历史实例 → `startupScan` 转 `unknown` → 串行互斥把同 cron 任务新刻度永久挡死 ⇒ 执行记录零写入"。修复 = 串行互斥只认真正在飞的 `dispatched`/`running`，`unknown`（重启孤儿）移出阻塞集 + 30s 短宽限收口 + `running` 长期无活动（漏 created 致 `lease_until` 为 null）也收口 + `snapOf` legacy 回退防御默认值；本地复现（老 schema + 旧运行实例）验证新行照常写出。冒烟 162 项全过 ⇒ **✅ 真机验证通过，U13 收口** |
| U14 | **依赖快照：判定结果冻结 + 产出下传（决策 43，2026-09-28 用户点破并拍板，单独工作包）** | 排查确认两缺口：① `judgeDependencies` 命中上游实例后只读 `.status` 即丢对象，派发快照无依赖字段 ⇒ Loop B 发动（可能晚数分钟）时不知道「按哪条上游实例放的行」，上游间隙再跑成功就会错拿新产出；② 上游回执已校验的 `outputs` 列无人读取、`buildMessage` 不注入 ⇒ 下游消费前置产出零通道。定型与改动点见 [design/dependency-snapshot.md](design/dependency-snapshot.md)、排查叙事见 [worklog/dependency-snapshot.md](worklog/dependency-snapshot.md) | `InstanceSnapshot` 加 `resolvedDeps`（task/semantics/instanceId/scheduledAt/sessionId/上游 workspacePath/outputs）→ `judgeDependencies` 返回 `resolved` → `snapshotOf` 固化 → `buildMessage` 注入「上游依赖（本次已锁定）」段（产出按上游工作区绝对化）；Loop B 只读不重判、重试沿用；不改 DDL / `depends_on` schema。🟢 **同日落码**：冒烟 +8 = **172 项全过**，typecheck + build 过 ⇒ **✅ 真机验证通过，U14 收口**（复验点见 design §六） |
| U15 | **附加文件链路收尾**（2026-09-29 落码，决策 46；选择 + 上传已推送 `680d23f`） | ① 真机验证未做（选择浏览/选中/卡片、拖拽+点选上传、超限与类型拒绝报错，清单见 [worklog/attachments-upload.md](worklog/attachments-upload.md) §四）；② 附件（尤其 upload 落盘文件）与任务定义的**持久化关联未做**——目前 `attachments` 只在草稿层；③ 执行期如何把附件注入给 agent 未定 | ① 用户真机测，问题回改；② 可能并入 P2 保存链路（任务定义 JSON 已有 `attachments` 字段位）；③ 注入形态（消息里贴路径清单 / 内容内联）待拍板 |

---

## 五、结项说明（2026-09-29 暂时结项）

> 🎉 本仓库于 2026-09-29 **暂时结项（用户拍板）**：所有进行中的开发工作包均已落码并通过**真机验证**，无遗留边界；冒烟 172 项全过、typecheck/build 绿。§5.1 为收尾确认，§5.2 为重新开启时的待办 backlog（不在本次结项范围）。

### 5.1 已完成封卷（含真机验证）

- **里程碑 15 · 会话弹窗外观对齐官方** ✅：keyed 流主路 + 三级收折 + 触发行 + 尾部操作行 + 思考行 + 工具行（图标/diff 面/官方 ToolRow 三块展开体）+ 外壳（裸叉/bg-base/34px）；清单遗留元素（上下文注入行、用户消息操作行、👍👎、「到底部」钮）照 [`design/session-view-ui-map.md`](design/session-view-ui-map.md) 补齐，真机核验通过。
- **U10 · 继续对话（开分支）** ✅（2026-09-27 真机验证通过，决策 38 含 ⑦：头部按钮全量分支 + 消息行分支 icon 按 `atSeq` 截断）。
- **U11 · 产出物打开与展示** ✅（含 2026-09-29 收尾打磨四项：代码换行开关 / 图标官方 Tooltip / 面包屑从工作区根列全 / 下拉选层箭头一行一个，真机核验通过，无遗留边界）。
- **U12 · 交付登记** ✅（真机验证通过，整条线收口；需求扩展为所有产出文件/文件夹统一官方交付卡，插件单写 `deliverables/presented`，LLM 禁调 `present`，见 [worklog/deliverables-display.md](worklog/deliverables-display.md)）。
- **U13 · 两层循环解耦（决策 41/42）** ✅（真机验证通过，收口：Loop A 只写执行记录，Loop B 只读+发动/重试/追问/回收；模型失败行保留走重试；会话名 `[TASK] <…> · <标题>`）。
- **U14 · 依赖快照（决策 43）** ✅（真机验证通过，收口：`resolvedDeps` 冻结上游实例+产出，Loop B 只读不重判，重试沿用；`buildMessage` 注入上游依赖段）。
- **U8 · token 用量取值** ✅（真机验证：宿主事件暴露结构化 `usage`，`token_in`/`token_out`/`token_in_cache` 三列正常写回）。
- **决策 44 · 任务表单弹窗** ✅（P0 + P0.5 + P1 + 只读 `options` 路由均已落码并真机验证通过；形态 = 右侧贴边浮层弹窗，控件全用官方 `Menu`/`Switch`/`SegmentedControl`/`Pill` + 自绘日历/时分）。
- **代码块工具条对齐官方** ✅（三处代码块右上均为「换行 + 复制」图标钮；en 界面 tooltip 中文为已知小瑕疵，见 [worklog/code-block-toolbar.md](worklog/code-block-toolbar.md)，不影响结项）。

### 5.2 重新开启时待办（backlog，不在本次结项范围）

- **U1** 中途重启续跑/补跑；**U2** 失败即归档；**U3** 产出只验存在不验内容；**U4** `logical_date` 是否注入；**U5** 执行记录带定义版本+配置快照+来源；**U6** 面板收尾（诊断行/兜底块清理）——均为用户此前明确推迟的后续项（详见 §四）。
- **U9** 依赖（前置任务）真机验证（判定逻辑冒烟已覆盖，待正式用到依赖功能时补验：放行 / 阻塞 / 复用告警）。
- **决策 44 · P2** 间隔的「天 / 周」单位映射、排期→cron 完整映射（每季度 / 单双数月的 cron 位已能写）；P2 保存写回 → P3 版本管理（文件版，不进数据库）。
- **发布**：联调稳定后发 v0.1.0 + README 安装文档；完整 UI（监控面板 v1.1，决策 16）。
- **回执增强（决策 19 暂缓）**：outputs 由逗号串升级 JSON；每文件简介走文件不走命令行。

---

## 六、本地联调前提（脱敏）

> ⚠️ **本机与私有部署细节（容器名、内网地址与端口、代理地址、compose 位置等）一律不入仓库**，只保留与实现相关的抽象结论。

| 项 | 抽象结论 |
|---|---|
| 宿主形态 | DSH 以容器运行，工作区是**挂载卷** ⇒ SQLite 状态文件必须落在挂载卷内，否则容器重建即丢 |
| 网络 | 宿主同时接内网与公网 ⇒ 可直连内网服务；注意代理 / `NO_PROXY` 配置 |
| 容器巡检数据入口 | Docker 引擎提供只读 HTTP API；容器内无 curl，用 node `fetch` |
| 配置生效 | 改工作区文件不等于改运行中的配置，实际生效以部署侧为准 |

---

## 七、文档索引

| 文档 | 内容 |
|---|---|
| [`../RULES.md`](../RULES.md) | 公用规则真源（跨工作区，用户独占维护、随时会改，随仓库入 Git） |
| [`../AGENTS.md`](../AGENTS.md) | agent 操作守则（只写本仓库独有内容） |
| [`worklog/`](worklog/) | 工作包过程叙事（每个工作包一个文件，做完封卷）：踩坑、定位、修复与真机证据 |
| [`design/decisions.md`](design/decisions.md) | 30 条已定型决策 + 理由（勿重复讨论）、决策 12 展开、命名查重记录 |
| [`design/architecture.md`](design/architecture.md) | 三层架构、职责边界、关键约束 |
| [`design/data-model.md`](design/data-model.md) | 任务定义字段表、状态库 DDL、关键设计与取舍 |
| [`design/state-machine.md`](design/state-machine.md) | 对账判定树、7 种状态、两种依赖语义、5 个必补机制 |
| [`design/archive-session-view.md`](design/archive-session-view.md) | 归档会话弹窗显示（ChatView 复用落码，决策 29 实施）：方案、风险 R1–R4、真机验证清单、落码子任务 |
| [`design/session-view-ui-map.md`](design/session-view-ui-map.md) | **会话弹窗「官方样式对照表」**：官方会话页每个元素（组件/CSS module/语义类/关键样式值/所需数据）逐项成表 + 维护流程（官方升级后如何 diff）+ 逐项实施清单。**弹窗样式一律照表做，不凭观感改** |
| [`design/dsh-capabilities.md`](design/dsh-capabilities.md) | 已核实的 DSH 宿主能力事实清单（源码级，0.1.6 / 0.1.7-rc.1） |
| [`examples/image-upgrade-daily.md`](examples/image-upgrade-daily.md) | 首个任务样例：任务定义 + 回执机制 + 任务手册 |
| [`examples/task-template.jsonc`](examples/task-template.jsonc) | 全字段注释版任务定义模板（粘进 tasksInline 前须去掉注释） |
