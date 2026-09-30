# 编辑器 UX 第二轮（决策 52）——错误提示人话化 / 统一浮层 / 预计执行说明 / 版本历史拆分

> 2026-09-30（三）· 真机试用反馈驱动的集中返工轮。全程本地落码（无真机探针），冒烟 237 项全过。

## 一、用户反馈原点（四点 + 两个回归）

1. 保存失败提示是机器码：「任务定义不合法（target.workspace: Too small: expected string to have >=1 characters）」——用户原话「你得说人话」「该检查的检查」。
2. 错误提示散落多处（附件卡内联红字 / 面板 `<p>` / 编辑器 footer 行内 span），且占版面挤下方内容；要求统一成浮层 Toast。
3. 「附加文件」与「执行频率」两卡间距消失（上一轮把附件卡外层容器从 `.dsh-tdt-ed-section` 换成纯 relative 容器时丢掉了 16px margin——回归，顺手修）。
4. 排期设置完看不懂「实际什么时候执行」——要求在「任务开始时间」上方两条线之间实时显示一句人话。
5. 错误提示不能 2.5 秒一条刷走（记不住、没法对照改）：逐项判断、问题框描红、一次性列全。
6. 提示词版本历史面板混着「配置快照」——该面板只管提示词历史，快照另找地方。
7. 「历史版本」开关按钮没有选中/未选中态，要求与时钟图标 + 「版本」两字、对齐「预览/编辑」分段样式。

## 二、落码清单

### 错误提示（`task-editor.tsx` / `editor-fields.tsx` / `task-editor-css.ts` / `toast-css.ts`）

- `validateTaskDraft` 改返回结构化 `FieldProblem[]`（field + message）：必填对齐宿主 zod（workspace / prompt `.min(1)`），排期冲突对齐 `scheduleCron`（每周零勾选 / 间隔步长非法 = 产不出 cron）；`title` schema 可选，不强制。
- 点保存才判定（`showErrors`）；判定后 `fieldProblems` 实时重算：总览列表（`.dsh-tdt-ed-errors`，持久不自动消失）+ 三种描红变体（卡片 `--card--error`、`SelectField` 新增 `error` prop、textarea `--prompt--error`），修正后逐项实时消退，全清才真正提交。
- `humanizeTaskError`：`Too small` 片段 → 人话；面板 `save()` catch、`saveEditor` / `deleteEditorTask` 的 `{ok:false,error}` 三路都先翻译。
- 浮层统一：`toast-css.ts` 注入 `.dsh-tdt-toast`（2.8s：淡入归位 → 稳定 ≈2.5s → 上飘淡出，`onAnimationEnd` 自退）；附件上传失败从卡内 `<p>` 改挂附件卡上方；编辑器 `saveError` 从 footer 行内 span 改挂 footer 上方；面板 JSON 不合法为持续态用 `--sticky` 常驻变体。

### 「预计执行」（`task-editor.tsx` / `locales.ts`）

- 通用方法 `describeSchedule(draft, t)`：interval（每 N 分钟/小时 + 生效日括注）、once（日期时刻执行一次）、daily / weekly（含每 N 周 + 星期清单，全勾 = 「每天」）/ monthly（每月/单双数月 + N 日）/ quarterly（每季度第 N 月）/ yearly；`editorSched*` 16 个新 locale key（zh/en）。
- 渲染：执行频率卡「任务开始时间」上方两条 `border-top` 分隔线之间，`margin-top:14px / padding-top:10px`，随编辑实时刷新；`schedfoot` 的 CSS border-top 同步去掉避免双线。

### 版本历史拆分（`task-editor.tsx`）

- `PromptEditorModal` 删快照块与 `confirmSnapshotFile` / `onRestoreSnapshot`（props 类型同步收窄）。
- 主编辑器 `TaskEditorDrawer` 新增「配置快照（整份找回）」区块（前置任务卡下方，`.dsh-tdt-ed-card` + hint + `dsh-tdt-ed-ver` 条目 + 「找回全部」），确认走既有 `VersionConfirm`（`editorRestoreAll*` 文案复用）。
- 版本条目重构：`.dsh-tdt-ed-ver` flex 行 = 时钟图标（官方 `IconClockOutlineRegular`）+ 时间 + 备注（左），hover 时 `.dsh-tdt-ed-ver-actions` 右侧淡入「使用版本 / 删除」（opacity 过渡，**行高恒定**，不再在下方顶出两颗按钮）。
- 开关按钮：弃 `Button variant:outline`，自绘 `.dsh-tdt-ed-histtoggle`（时钟图标 + 「版本」两字；默认灰盒、hover 加深、选中 `--on` = business 蓝底白字，明暗一致，与「预览/编辑」分段同拍），`aria-pressed` 同步。

## 三、踩坑

- **间距回归根因**：上一轮为挂 Toast 把附件卡外层从 `h('div', { className: 'dsh-tdt-ed-section' }, …)` 改成 `h('div', { style: { position: 'relative' } }, …)`，`.dsh-tdt-ed-section` 的 `margin-bottom:16px` 随之丢失。修法 = 两者并存（className + style），并留注释防再犯。
- `PromptEditorModal` props 类型里 `onRestoreSnapshot` 是必填 ⇒ 从类型删除（而非改可选），避免留下幽灵契约。
- Toast 动画自退（`onAnimationEnd`）与此前 uploadError 的 2.5s `useEffect` 定时器双通道会打架（定时器先到会把上飘淡出砍半截）⇒ 删定时器，统一动画结束自退。

## 四、真机验证清单（待做）

1. 空工作区 / 空提示词 / 每周零勾选 / 间隔步长清空 → 点保存：总览逐项列出 + 对应框描红；逐项修正后红框与总览实时消退；全清后可保存。
2. 面板 tasksInline 贴一条 `workspace:""` 的 JSON → 保存：Toast 显示「工作区不能为空，请先选择工作区」。
3. 执行频率卡：任选一档排期，两条线之间的「预计执行」句子实时跟随（每周全勾 / 每 2 周 / 每 N 分钟 / 单次 / 每季度）。
4. 「附加文件」与「执行频率」间距恢复 16px。
5. 提示词编辑器：右侧版本列表条目 hover 右侧出「使用版本 / 删除」且行高不变；「版本」开关按钮选中高亮 / 未选中灰盒；面板内不再出现配置快照。
6. 主编辑器前置任务卡下方出现「配置快照」区块，找回走严厉确认。

## 五、同日第二轮返工（真机试用逐条反馈）

> 用户批评点：**未经允许在主界面加了配置快照 UI**——记为流程红线：**界面改动只做点名要求的，不自主加**。

1. **配置快照 UI 全撤**：主编辑器快照区块 / `confirmSnapshotFile` / `onRestoreSnapshot` prop / `restoreSnapshot` 客户端函数 / `editorSnapshotsHint`·`editorNoSnapshots` 文案全删；服务端 `saveSnapshot` 留档保留（无界面纯落盘，将来单独做按钮时直接用）。
2. 「预计执行」两条线改虚线；「任务开始时间」上间距 = 14px 对齐上边线离「星期」的间距（`.dsh-tdt-ed-schedfoot` 原 margin12+padding12=24 修为 margin14+padding0）。
3. 间隔小时档句式：生效日在前无括号「周一、周三、周五每小时执行一次」（新 key `editorSchedHourlyOnce` / `editorSchedNoDaySuffix`，未勾日改「，但还没选生效日」后缀）。
4. 任务名称必填：`ErrorField` 加 `title`、`PrefixedInput` 加 `error` prop（`.dsh-tdt-ed-pfx--error`）。
5. 「版本」开关照官方 `SegmentedControl.module.css` 逐值重写（轨道 `interactive-bg-hover`+padding4、选中段 `bg-layer-1`+`elevation-soft` 白亮片）——此前 business 蓝底在用户主题下显绿被点名。
6. 版本条目：小尖括号（`IconChevronDownOutlineRegular` rotate −90°）、卡片行无分隔线、主文本 `MarqueeText`（省略号+hover 盒内跑马灯不盖图标）、hover 右侧「使用」药丸 +「移除」小字（常态显示时间小字，行高恒定）。
7. **启用开关独立操作**：服务端新端点 `POST /tasks/enabled`（`setEnabledDefinitionInline` 只改 enabled、值没变不落库、404=task-not-found、审计 task_updated）；客户端 `toggleTaskEnabled`；drawer `onToggleEnabled` 成功 Toast「任务已启用/已关闭」（`--below` 变体浮在 header 下）、失败开关回弹；成功同步 `initialDraftRef` 保持脏判定干净；开关旁联动「已启用/已关闭」。

冒烟 **247 项全过**（+10：enabled 四条 + 产物六条）；typecheck/build 绿；真机验证待做（§四清单 5/6 已过时——快照 UI 已撤，以本节为准）。
