# 刻度化调度与执行身份落码（决策 25/26）

> 时间范围：2026-09-24 · **状态：✅ 完成封卷**（本文件是该工作包完成时的快照记录，不再更新）。
> 
> 决策 25 落码：主键 UUID + UNIQUE(task_id, scheduled_at) 刻度化调度（小时/分钟级 cron 可跑）；决策 26：双标签面板 + npm run smoke；task_defs 登记表废弃（id 直写 JSON）；旧库兼容实测。
>
> 定型结论见 [`design/decisions.md`](../design/decisions.md)；设计与事实清单见 [`design/`](../design/)。本文只保留过程叙事：踩坑、定位、修复与真机证据。

## 2026-09-24 — 决策 25（只落文档、代码未动）：执行身份重设计 = 三层分离 + 锚点用「计划时刻」+ 主键用 UUID

——用户提出「配置 / 执行记录 / 事件」三层应彻底分离、且用户不该手写 id。经讨论后**查官方文档逐条核实**（非转述）：Airflow 的 DagRun **主键是整数 `id`**，`run_id` 才是可读串 `scheduled__2026-09-24T01:00:00+00:00`（`RUN_ID_REGEX`，由 `generate_run_id(run_type, logical_date, run_after)` 生成，去重走 `find_duplicate(dag_id, run_id)`），并另存 `logical_date` / `start_date` / `end_date` / `queued_at` 把**计划与实际分开**；k8s CronJob 的 Job 名 = CronJob 名 + 11 位时刻后缀，v1.32 起另加 annotation `batch.kubernetes.io/cronjob-scheduled-timestamp`（RFC3339，原文「originally scheduled creation time」），且**改 CronJob 只影响新 Job、已跑起来的照原样跑完**；Temporal = WorkflowId（用户业务 id）+ RunId（平台生成、全局唯一）；Prefect 的 flow run id 是 **UUID**。⇒ **主键不透明 + 可读串作业务键 / 去重键**是主流，可读串不必给用户看。**定案七条**：① 定义侧 `id` 由系统生成（UUID）、不可变，另设 `title` 自由文本（中文亦可、随时可改）**不参与身份** ⇒ 改名不断链；② 执行侧主键 **UUID**（用户拍板不用自增——客户端环境下不可靠）；③ **身份锚点 = `scheduled_at` 计划时刻**（cron 算出的**刻度**，含时分秒 + 时区偏移），**不是日期、也不是实际执行时刻**；④ 去重靠 `UNIQUE(task_id, scheduled_at)` ⇒ tick 幂等，同一刻度插不进第二条；⑤ 实际时刻另存 `dispatched_at` / `finished_at`，**不进 id**；⑥ `logical_date` 保留为「刻度所在日历日」，仅供 `same_period` 依赖判定与界面分组，避免改坏既有依赖语义；⑦ 未执行前锚点仍可随配置重排（决策 20），执行开始即冻结。**顺带定位到一个既有真缺陷**：旧锚点只有年月日（`logicalDateOf` 用 `en-CA` 只取年月日 + `scheduledAtFor` 按天只返回第一个匹配）⇒ **每小时 / 每几分钟的 cron 一天只能出一条**，压根跑不出来——不是样式问题是功能缺陷。文档同步：`decisions.md` 决策 25（含证据与来源链接）、`data-model.md`（定义表 `id`/`title`、新 DDL 含唯一约束、关键设计 §1 刻度对照表、取舍新增三条）、本文件未决项 U5、下一步第 2 条加「刻度改造」前置。**代码按要求本次不动**，落码待办：`tasks.ts`（按窗口列出 cron 的所有刻度）+ `store.ts`（主键换 UUID + 唯一约束，兼容旧库迁移）

## 2026-09-24 — 决策 25 落码 + 决策 26 面板改造（用户要求一次性做完、自主决策、中途不中断）

① **刻度化调度**——`tasks.ts` 新增 `scheduledSlotsFor`（列出窗口内 cron 的**全部**刻度）/ `firstSlotOnDay` / `nextSlotAfter`，取代按天只取一个时刻的旧 `scheduledAtFor`；`scheduler.ensureInstances` 改为逐个刻度建实例（窗口 `[now - max(窗口, 26h), now + 2×tick]`，超 200 个刻度只留最近的）⇒ **小时级 / 分钟级 cron 从此能真正跑起来**（旧实现一天只能出一条）。② **执行身份**——实例 id 改 **UUID**（列名沿用 `id` ⇒ 旧库加索引即升级，不重建表），新增 `task_defs(id, source_key UNIQUE, title)`：用户不写 id 时按**来源**（inline 下标 / 文件路径）生成并记住，跨重启稳定；`ensureInstance` 去重改走 `UNIQUE(task_id, scheduled_at)`（tick 幂等）；`reschedule` 加占用守卫。③ **定义层**——`id` 改**可选**（不再强制 kebab-case），新增 `title` 自由文本（中文亦可、随便改、不参与身份）；类型拆成 `TaskDefinitionInput`（用户书写）/ `TaskDefinition`（解析后 id 必有）。④ **面板（决策 26）**——单页调试快照改**双标签弹窗**：配置页（JSON 输入框 + 已解析任务列表带 id / 名称 / 周期 / 下次执行）、执行记录页（按状态 / 任务过滤 + 点行展开该次执行的事件时间线）；快照补 `instance_id` 列、事件条数 40 → 200。⑤ **新增 `npm run smoke`**（`scripts/smoke.mjs`，零新增依赖、直接测 dist 产物）5 组 **28 项全过**——**当场测出并修掉一个真 bug**：`reschedulePass` 用「当日第一个刻度」重排，多条 pending 被指到同一刻度 ⇒ UPDATE 撞 `UNIQUE(task_id, scheduled_at)` 把 tick 打挂；修法 = 按刻度集合判断（自己的刻度还在就不动，被移除才迁到当日空着的刻度）+ `reschedule` 占用守卫。⑥ 顺带修 `submit.js`（手动备用通道）按「任务 + 日期」定位实例，不再依赖 `task:date` 拼串。**自主决策记录**（未与用户商议，已写入文档）：主键列名沿用 `id` 而非 `run_id`（省掉重建表）；`task_defs` 的 source_key 用「来源位置」而非内容指纹（改内容不丢 id；代价是 inline 模式下调整数组顺序会换 id，显式写 id 可规避）；ensure 窗口与 200 条上限属防御性取值；手动重试 / 配置快照 / `run_type` 仍未做（未决项 U5）。文档同步：decisions 25 落地补充 + 新增 26、data-model（DDL / 定义表 / 窗口约定）、state-machine 手动补跑 SQL、本文件能力表 / 下一步 / 日志。**待真机重装验证**（本次只落码 + 本地冒烟）

## 2026-09-24 — 面板主题适配 + 抬头布局对齐宿主（决策 26 修订）

用户要求「用户选明色就是明色、暗色就是暗色、跟随系统就跟随系统」，且分组标签 / 关闭按钮按参考插件 dsh-context 的样子放右上角。**做法**：拉了 `@deepseek-ai/dsh-client-ui-theme@0.0.1-rc.1` 与 `dsh-context@0.55.0` 的产物源码，从前者拿到宿主全部主题变量名、从后者确认真实插件实际用的是 `--dsw-alias-*` 一族；于是**面板里所有颜色改成读宿主变量**（label-primary / label-secondary / label-tertiary / bg-layer-1|2|3 / bg-mask-1 / border-l2 / brand-primary / state-error-primary / interactive-bg-hover+active / shadow-lv3 / font-family-code / transition-duration / ease-in-out，全部带兜底值）⇒ 宿主换主题插件自动跟随，**插件侧不再有任何主题判断，也不再写死颜色**。抬头重排为与宿主同序：标题在左，右上角从右往左 = **关闭（图标）· 分组标签（分段控件）· 刷新（同款图标按钮）**，三者尺寸统一；图标用内联 SVG（`currentColor` 自动跟随主题）。**刻意的取舍**：参考插件 dsh-context 的 client 里 `require("@deepseek-ai/dsh-client-ui-primitives")`（官方 Modal / Button / 图标组件），但我们的 client bundle 未声明该外部模块，**引了有运行时解析风险**（且本次 `npm pack @deepseek-ai/dsh-client-web` 想核对平台模块表时命令等待审批超时）⇒ 本次先自绘、不引宿主包，等确证模块表里有 primitives 再换官方组件。构建通过（`dist/client.js` 27.4 → 27.5 kB）、类型检查通过、冒烟 47 项仍全过

## 2026-09-24 — 设置页卡片精简（决策 26 修订）

用户要求「把界面上的输入框都拿掉，只留一行、点一下开弹窗」——设置页现在**只有一个卡片行**（标题 + 一句话描述 + 右箭头，与宿主其它插件卡片同形），点击打开调度面板；原来的内嵌 JSON 输入框、保存/放弃按钮、只读运行参数**全部移入面板的「任务配置」页**（参数折叠在页面底部）。渲染从「整块表单」变成 `div[role=button]`，未改动任何数据逻辑。构建通过、冒烟 47 项仍全过

## 2026-09-24 — 决策 25 二次修订：废弃 `task_defs` 登记表，id 直接写进任务定义 JSON

（用户否决下标方案）——用户指出「用数组下标对应 id，删掉第一条后面全串位，逻辑不对」，拍板：**不要这张表，直接把 uuid 写进 json**：用户保存的 JSON 里没有 id 就生成一个放进去；有就直接用；格式不对（空串 / 非字符串）视为没有，生成并覆盖。用户同时确认：改错或改新 id 就当成一个新任务，**因为配置与执行状态本就解耦，不影响**。**实现**：`tasks.ts` 新增 `ensureIdsInInlineJson`（给内嵌数组逐项补 id，返回新 JSON 与变更标记）+ `withIdentity`（解析兜底：无 id 时按定义内容取 sha256 指纹，保证回写失败也不漂）；`loadTasks` 目录模式下缺 id 直接**写回该文件**；`index.ts` 每 tick 调 `ensureIdsInInlineJson`，仅在真补了 id 时 `scope.update({ tasksInline })`（**幂等，不会每 tick 重写**）；`store.ts` 删除 `task_defs` 表与 `resolveTaskId`，调度器改为直接采信定义里的 id。**冒烟新增回归**：删第一条后剩下任务 id 不变、调顺序后 id 各自跟着任务走、id 格式不对重新生成、已有 id 原样保留、二次调用幂等 —— 47 项全过。文档同步：data-model（删 task_defs、定义表 id 语义）、decisions 25 修订说明、本文件日志

## 2026-09-24 — 针对「旧数据格式会不会跟新格式冲突」的加固 + 实测

（用户提问驱动）：把迁移从「悄悄做」改成**可观测**——`store.dupRowsRemoved` 记录合并掉的重复行数量，`index.ts` 在 > 0 时打宿主告警（**绝不静默删数据**）。冒烟新增两组：**[6] 真机形态旧库兼容**——按旧版 schema 建库、塞入与面板一致的老 id 行（`work-report-once8:2026-09-23` 等，含 succeeded / failed / unknown / skipped / pending / dispatched 各态）以及一条**落在 ensureInstances 窗口内**的 pending 行，验证：打开不抛错、重复合并数为 0、历史行 7 条一条不少、启动扫描把旧 dispatched 置 unknown、tick 不抛错、**同一刻度不会被建出第二条**、老 id 行原样可读；**[7] 最坏情况**——旧库真有「同任务同刻度」重复行时，插件仍能起来、合并数如实上报、重复组只留一条、去重后仍可按刻度定位。冒烟 28 → **39 项全过**。结论：**新旧格式不会打架**，旧库加索引即升级、不重建表；唯一需要留意的是「没写 id 的任务」会得到新 id（现有任务都显式写了 id，不受影响）

