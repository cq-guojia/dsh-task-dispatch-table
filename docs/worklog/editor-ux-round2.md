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

## 六、同日第三次返工（真机逐条）

1. **每周档句式**：「每 4 周每周周一…」叠词修掉——N>1 ⇒「每 4 周周一、周二 09:00 执行」；恰好每周 ⇒「每周一、每周二 …」（前缀 key `editorSchedWeeklyDayPrefix`，en = 'every Mon'）。
2. **间隔分钟档**：cron `*/N * * * *` 原本不带星期位 ⇒ 选了生效日也不生效；改为 `*/N * * * <dow>`，文案同步「周一、周三每 N 分钟执行一次」。
3. **Toast 抽象共用（不许各处再手写）**：`toast-css.ts` 新增 `FloatingToast` 组件（text / tone / seq / below / onDone），四处手写（面板 failed、编辑器 saveErr、启用开关、附件失败）全部替换。
4. **三档语义色**：success = `--dsw-alias-state-success-primary`（绿）、error = 默认红、neutral = `--dsw-alias-label-primary` 底 + `label-primary-inverted` 字（深色主题浅白灰 / 浅色主题近黑灰，正是用户要的反色面）。
5. **「版本」开关高度**：与「编辑/预览」分段（`.dsh-tdt-ed-seg` padding3/段高22/字12）逐值对齐，不再忽高忽低。
6. **版本条目**：弃卡片背景改**全宽虚线**（一条虚线拉通整栏、`li:last-child` 不画）；右侧改**固定槽** `.dsh-tdt-ed-ver-right`（104×18，时间与按钮同槽换显）⇒ hover 出按钮**绝不撑高行高**（此前上下蹦，用户点名）；双日期修掉——主文本只显示备注、无备注右侧显示唯一时间；主文本字号 11px 与右侧日期一致；面板 280 → **232px**。
7. **派发失败 bug（`launch-error: cannot get property "agentTeams" without inject`）**：宿主 ctx 命名空间属性是 getter，**模块未 inject 时读取直接 throw** ⇒ `dispatch.ts` 无条件读 `ctx.agentTeams` 把整次派发炸掉（`ctx.goals` 同款隐患）。修复 = `readCtxProp` 护栏读（throw 归一为 undefined）⇒ agentTeam / goal 按既有语义降级单 Agent 单轮 + 告警留痕，不再阻塞派发。

冒烟 **249 项全过**（+2）；typecheck/build 绿；真机验证待做。

## 七、同日第四次返工（Toast 定稿）

1. **错误总览块（截图那个大红块）撤销** ⇒ 与判断逻辑**解耦**：字段描红保持持续态（改好才退），文字提示改为一次性 Toast——点保存弹一次、全部问题「；」连成一句、统一 2.8s 自退（用户原话：「它就是一个提示，提示完就没了，跟你的判断逻辑没有关系」）。`.dsh-tdt-ed-errors*` CSS 与 `editorErrorsTitle` key 删除。
2. **footer 行内提示全部收编**：重置完成（`editorResetDone`）与「预览态不可保存」（`editorSavePending`）两个行内 span 改共用 FloatingToast 中性档；resetHint / pendingHint 改 seq 型状态，删除 resetHint 的 2.5s 定时器（自退交给动画 onDone，全站统一时间线）。
3. **Toast 样式定稿**（对照用户两张示意图）：居中 + `width:max-content` + `max-width:min(520px, 100%-24px)` 超出折行；**不透明淡色底**（`color-mix(tone 10%, bg-layer-1)`，不支持时回退写死色）+ **同色系深一点描边** + 语义色圆点（`::before`）+ 深色正文——不再是大红实面白字。
4. **四档语义色**：error 红（默认）/ success 绿（`state-success-primary`）/ **warning 橙**（新增，`state-warning-primary`）/ neutral 反色实面（深色浅白灰、浅色近黑灰，`label-primary` + `label-primary-inverted`）。
5. **viewErr（页面级「查看会话失败」条）外观对齐** Toast 中性档（反色面 + 圆点 + 同圆角）；保留手动关闭——操作类失败要留时间读，不自动消失。
6. 间距问题（大红块上方的空格）随总览块撤销自然消失（Toast 绝对定位不占版面）。

冒烟 249 项全过；typecheck/build 绿；真机验证待做。

## 八、同日第五轮返工（版本条目定稿）

1. **左日期右按钮**（用户点名「左边显示正常的版本日期，右边鼠标移上去显示按钮」）：主文本恢复为版本日期（MarqueeText 超长跑马灯），有备注补一行 10px 小字；右侧固定槽（52×18）常态空、hover 才出按钮——双日期与右侧时间都撤。
2. 「使用」弃药丸改**纯文字钮**（hover 垫小背景 interactive-bg-hover）；「移除」弃字母 X 改**官方叉图标** `IconCloseOutlineRegular`（12px，hover 变红 + 小背景），带 title/aria-label。
3. 删除版本确认文案照用户原文：`你确定要删除此版本的记录吗？删除后不可撤销，请谨慎操作。`（en 同步）。

冒烟 249 项全过；typecheck/build 绿；真机验证待做。

## 九、同日第六轮（Toast 收口确认）

1. **唯一实现确认 + 最后一处收编**：全站检索 `dsh-tdt-toast`，仅剩面板「JSON 不合法」常驻提示是手写 div ⇒ FloatingToast 加 `sticky` 档后收编。至此**所有 Toast 调用 = 同一个组件方法**（FloatingToast：text / tone / seq / below / sticky / onDone），差异全部是传参，没有第二份实现。
2. **圆点独立元素**：`::before` 内联点改 flex 子元素 `.dsh-tdt-toast-dot`（左上对齐，多行不飘）；文字区 `.dsh-tdt-toast-text` `white-space:pre-line` 支持 `\n` 换行、左对齐。
3. **多问题逐行展示**：校验 Toast 拼接由「；」改 `\n`——一行一条、每条句号收尾（标点统一，不混分号）。

冒烟 249 项全过；typecheck/build 绿；真机验证待做。
