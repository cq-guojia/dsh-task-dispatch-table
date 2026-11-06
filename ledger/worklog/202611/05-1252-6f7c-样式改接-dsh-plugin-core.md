# 20261105-1252-6f7c-样式改接-dsh-plugin-core: 样式改接 dsh-plugin-core

- **Tags**: 样式, 组件复用, 插件核心, DSH
- **Status**: doing · 2026-11-06 06:15:56 · @GuoJia-Agent · 8d557c6d-7c93-43ac-8c73-5d623e82e1c6
- **Created**: 2026-11-05 12:52:17 · @GuoJia-Agent · 8d557c6d-7c93-43ac-8c73-5d623e82e1c6

<!-- Header lines are maintained by the script, fixed order: Tags → Status → Created → Sealed.
     The `- **Tags**: …` line is inserted at the top by new --tags; omitted when there are no tags
     (category goes to the ledger and history only, never into this document).
     The `- **Sealed**: …` line is appended on close. -->

## Background

本仓库较早，UI 样式多为项目内自研。此后抽出了面向 DSH 的通用基础核心：

- 远端：https://github.com/cq-guojia/dsh-plugin-core
- 本地：`/code/dsh-plugins/dsh-plugin-core`（分支 `main`）

用户判断：现有样式（button、分块标签、提示框、移动端提示、绘画预览、文件预览等）估算 95% 以上已被核心覆盖。

用户原话（2026-11-05）：

> 现在我们要干的事情就是去看我们现在所有的样式：button、一块一块的标签、提示框、手机上的提示，所有所有的样式。几乎应该是 95% 以上都被这个核心的样式已经涵盖了。包括绘画预览呀，文件预览呀，全都涵盖了。所以说，我们要从这个项目里排除很多东西，用核心的这些东西来接。所有的样式只要是核心有的，我们一律不自己手搓。

## To Do

六条硬要求（1–3 为用户 2026-11-05 首轮给定；4–6 为同日追加）：

1. **核心有的统一走核心，绝不手搓。** 核心已覆盖的样式 / 组件，一律改为引用核心，删除本项目的手写实现。
2. **核心没有的，列清单交用户判断。** 每一项写清用途、本项目位置、核心现状，由用户决定：本项目自研，还是让核心去做。
3. **核心控件不满足需求 / 实现不规范，反馈 + 建议。** 逐条给出现状问题与建议，由用户决定：本项目定制化，还是核心改来支持。
4. **接完核心后，本项目样式应极少**（2026-11-05 追加）。核心覆盖的项全部替换后，手搓样式数量必须显著下降；若仍剩很多，说明有漏接或该上提到核心，要回头补。
5. **顺手重构不规范的样式**（2026-11-05 追加）。接入过程中遇到不符合规范的写法（字面量、重复实现、裸 z-index、私有 token 定义、绕过基础层的官方件 …），在同一任务内重构掉，不做「先留着」。
6. **每项完成即交专家复核**（2026-11-05 追加）。以「一类控件 / 一个页面 / 一块样式」为一项，一项做完立刻另起独立复核（subagent，不带本轮上下文），按规范逐条核（组件选型、唯一实现、token 使用、明暗、冒烟反断言）；有问题立即返工，复核结论写进 `Process`。

待办（执行顺序，做一步用户看一步）：

- [x] 盘清本项目全部样式的落点（组件、CSS、注入、宿主 UI 镜像相关部分）
- [x] 盘清 `dsh-plugin-core` 实际导出的能力与版本基线（不凭名字猜，读 `package.json` / `exports` / 源码）—— 基线 **`dsh-plugin-core@0.33.3`（npm latest，2026-11-05 核）**
- [x] 出一张逐项映射表：本项目样式 → 核心对应物 → 结论（可替换 / 核心缺失 / 核心不足）
- [x] 出「核心缺失」清单，交用户判断归属（本项目自研 or 核心新增）
- [x] 出「核心不足 / 不规范」清单（含问题、证据行号、建议），交用户判断归属
- [x] **用户逐条拍板**（2026-11-05 完成）：TaskPicker（核心扩 `limit` + `keywords`，「全部」作首项、核心零改）· TimeRange（核心扩 `presets` + `width`）· token 基线（跟核心、不覆盖）
- [x] **首批改接（2026-11-06）**：核心 `0.34.0` 交付 C1–C4 后，`ui/TaskPicker.tsx` → 核心 `Picker`、`ui/TimeRange.tsx` → 核心 `DateTimePicker`（均为薄包装），见「2026-11-06 · P1 首批改接」
- [ ] P1 基础控件替换：Button/IconButton、Checkbox、Segmented、Textarea、Input/PrefixedInput/NumberInput、LiveText、MarqueeText、SectionHead、Loading、BackToTop、DateTime、CodeViewer → 核心同名件
- [ ] P2 反馈层：自绘 toast → 核心 notify/Toast；Modal/Confirm/Alert → 核心 `skin`
- [ ] P3 文件浏览 / 预览：`file-browser.tsx` / `file-preview.tsx` → `dsh-plugin-core/adv/explorer`
- [x] **P4 会话预览（2026-11-06）**：核心 `0.35.0` 补齐插槽后，`session-view.ts` 改薄包装、`mirror/*` 只剩 `Deliverables.tsx`、`archive-session-css.ts` 只剩两组规则，见「2026-11-06 · P4 会话预览改接核心」
- [ ] P5 业务样式重构：`editor-css` / `info-css` / 内联字面量 / 自绘浮层 → 核心 token + 核心件
- [ ] P6 文档回写：`ui-style-guide.md` / `ui-foundation.md` / `external/session-view-ui-map.md` / `features.md`
- [ ] 收尾统计：替换前 / 后本项目自留样式行数与类名数量，确认「样式很少」；build + smoke + typecheck + 专家复核

## Next

P1 第二项：以 `src/client/ui/Button.tsx` + `controls-css.ts` 的 Button/IconButton 为下一项，改调 `dsh-plugin-core/ui` 的 `Button` / `IconButton`（先核对 variant/size 映射与 `controls-css` 的皮肤），完成后立即跑一次独立专家复核；后面按列表逐项推进。

## Process

### 决策方式（用户 2026-11-05 明确纠正）

- **不再使用弹框式提问**（AskUserQuestion）；待拍板项一**条一条放在对话框里**，说清现状 / 缺口 / 每个选项的代码代价，用户看完在对话里回。
- 每确认一项，立刻记进本节「已确认决定」；未确认项不自行拍板、不动代码。

### 已确认决定

| # | 事项 | 结论 | 日期 |
|---|---|---|---|
| — | 任务立项 | 建任务并认领；需求 1–6 条 + 待办顺序（见 Background / To Do） | 2026-11-05 |
| — | P0 地基范围 | 接核心依赖、token 移交核心、注入器薄壳化；已提交推送 `b7102ac` | 2026-11-05 |
| 1a | 核心 `Picker` 增加可选 `limit` 分页 | 不传 = 全量显示；传了 = 首屏 N 条 + 「显示更多」每点一次追加 N 条；**搜索结果同样按 limit 分页**（搜索不特殊对待，用户 2026-11-05 明确）。归**核心扩**（需改上游仓库，待用户下达执行指令） | 2026-11-05 |
| 1b | 核心 `Picker` 增加可选 `keywords` | `label` = 显示字段（已有，默认搜索字段）；`keywords?: string` = **单个字符串**（调用方自行拼，逗号/空格分隔均可），仅参与搜索、不显示；匹配 = 把 label 与 keywords 合起来做大小写不敏感子串匹配。归**核心扩** | 2026-11-05 |
| 1c | 「全部任务」= 列表第一项 | 传 `{ value: '', label: '全部任务' }` 到 options 首位；**不开 `clearable`**；选中态用核心 `--active` 底色（`--dshpc-open-bg` + 品牌色字），**不用勾**；**搜索时随关键词被过滤掉是期望行为**（用户 2026-11-05 明确：都搜索了就没必要再选「全部」）。核心零改动 | 2026-11-05 |
| 2 | TimeRange 快捷预设归属 | 走 **A**：核心扩 `DateTimePicker`（可选 `presets` + `width`），本仓删 `TimeRange`；控件形态随核心「一个整条 + 弹层 + 确定」 | 2026-11-05 |
| 3 | token 基线（hover / active / 暗色 `business`） | **跟着核心走**：接受核心基线（`hover/active` 略重、暗色 `business` 固定 `#4c6bd8`）；本仓**不做覆盖**，也**不推核心改** | 2026-11-05 |

### 交核心的改动清单（累积中；讨论结束后整篇发给核心）

> 基线 `dsh-plugin-core@0.33.3`（npm latest，2026-11-05 核）。全部是**可选参数**扩展：不传 = 现有行为完全不变。

| # | 控件 | 新增 | 语义 | 为什么 |
|---|---|---|---|---|
| C1 | `Picker` | `limit?: number` | 不传 = 全量显示；传了 = 首屏 `limit` 条，底部「显示更多」每次再追加 `limit` 条；**搜索结果同样按 limit 分页**（搜索不特殊对待） | 候选上百条时全量列出太长 |
| C2 | `Picker` | `keywords?: string` | **单个字符串**，调用方自己拼（逗号/空格分隔均可）；只参与搜索、不渲染；匹配 = 把 `label` 与 `keywords` 合起来做大小写不敏感子串匹配 | 任务 UUID 这类「能贴、不该显示」的搜索词 |
| C3 | `DateTimePicker` | `presets` | range 模式下可选预设档：选预设 ⇒ 填入起止；手改起止 ⇒ 自动落「自定义」（仅此时出现）；支持「全部/清空」档；不传 = 无预设入口（现状） | 执行记录 / 日志筛选要「今天 / 昨天 / 本周 / 上周 / 本月 / 上月」 |
| C4 | `DateTimePicker` | `width?: number \| string` | **触发器总宽**（单值与 range 模式都作用于整个触发器）：数字按 px、字符串按 CSS 长度原样；直接覆盖按 precision 的默认宽；**核心不做换算、不自行计算**；过窄时内容省略、不溢出 | 要与筛选行其他控件严格对齐（默认宽度按精度写死，无法精确指定） |

**不需要核心改**：`Picker` 的「全部」行（作为第一个普通选项传入，选中态用 `--active` 底色，搜索时随关键词过滤）；选项尾标（拼进 `label`）。

### 待用户确认

（无 —— 2026-11-05 全部讨论完毕，拍板结果见上表）

### 2026-11-05 · P0 样式地基改接（已完成）

- 依赖：`npm install dsh-plugin-core@^0.33.3`（npm latest 核实；`package.json:60` / `package-lock.json` 一致）。
- token：删除 `src/client/ui/tokens.ts`（236 行自建表）；全仓 `--tdt-*` → 核心 `--dshpc-*`，35 个源文件 + `scripts/smoke.mjs`，共 1333 处。
- 注入器：`src/client/ui/style.ts` 改薄壳 —— `createStyleKit({ id: 'dsh-task-dispatch-table-ui' })` + `setStyleKit(kit)` + **`getStyleKit()` 读回**（防摇树，且核心控件与本插件共用同一 `<style>`）；对外 API（`registerStyle/applyStyle/ensureUiStyles/ensureUiBase`）不变。
- 冒烟：恢复产物级断言（kit 真初始化、4 条 8% 状态浅底、明暗判据、6 条固定中性面回退），新增「产物消费的每个 `--dshpc-*` 必须在核心 token 白名单内且有定义」。
- 结果：`typecheck` 通过、`build` 成功、`smoke` **751 项 / 0 失败**；`dist/client.js` 含真实 `setStyleKit(createStyleKit(...))` 调用。

### 专家复核（两轮，结论已闭环）

- 第 1 轮：4 项返工 —— ① `setStyleKit` 被摇树（产物里只剩函数定义）；② `--dshpc-hover-solid` 核心无此 token（`archive-session-css.ts:73` 兜底变固定灰）；③ 6 篇设计文档仍以 `ui/tokens.ts` 为真源；④ 2 条冒烟断言被降级为「源码形状」断言。
- 第 2 轮：5 项返工 —— ① `hover/active/business` 取值与旧表不同却未记载（`ui-foundation.md` 映射表反向写错）；② `event-push.md:312` 给核心编了「已写 Chrome 111」的假事实；③ `ui-foundation.md:55/143/352` 把 P0 历史改成了核心（时间线矛盾）；④ `setStyleKit` 断言词面恒真（注释/定义即可满足）；⑤ token 守卫对注释里的假定义会假阳性。
- 全部已修：断言收紧为真实调用表达式 + 核心 token 白名单；文档按核心真值改写并登记观感漂移；P0 历史恢复本仓归属。

### 已核实的核心能力边界（`0.33.3`，读 `dist/*.d.ts`）

| 本项目 | 核心 | 结论 |
|---|---|---|
| `ui/Button.tsx`（15 套皮肤） | `Button` / `IconButton`（variant × size） | 可替换 |
| `ui/Field.tsx`（Input/PrefixedInput/NumberInput） | `Input` / `PrefixedInput` / `NumberInput` / `FieldHint` | 可替换 |
| `ui/Checkbox` / `Segmented` / `Textarea` / `LiveText` / `MarqueeText` / `SectionHead` / `Loading` / `BackToTop` / `DateTime` | 同名件 / `Loader` / `QuickToolbar` / `DateTimePicker` | 可替换 |
| `ui/CodeViewer.tsx`（12 个 CodeMirror 依赖） | `dsh-plugin-core/ui/code-viewer` | 可替换（可去依赖） |
| `ui/TaskPicker.tsx` | `Picker` + `limit` + `keywords`（**0.34.0 已交付 C1–C4**） | ✅ **已替换**（2026-11-06，薄包装）：作用域过滤 / `excludeIds` / 「全部任务」作首项 / 停用尾标留在本仓，浮层与 CSS 全删 |
| `ui/TimeRange.tsx`（预设 + 自定义区间） | `DateTimePicker mode="range"` + `presets`（+ `width` 备用） | ✅ **已替换**（2026-11-06，薄包装）：预设走核心 date-math，宽度按 precision 由核心定死；值语义与半开区间边界不变 |
| `file-browser.tsx` / `file-preview.tsx` | `adv/explorer`：`FileBrowser` / `FilePreview` / `openFilePreview` / `pickWorkspaceFile` / `connectFs` | 可替换 |
| `session-view.ts` + `mirror/*`（13 文件） | `adv/session`：`openSessionView` + `SessionViewModal` | 可替换；本仓只留业务接线 |
| `archive-session-css.ts` / `toast-css.ts` / `loading-css.ts` | 核心 feedback / explorer / session 自带样式 | 可删 |
| 任务表格 / 日历 / 时间线 / 设置分块 | — | **核心缺失**（业务专属，保留本仓） |

### 残留风险（待用户拍板）

- `hover/active`：核心固定 rgba（亮 10% / 18%，暗 14% / 24%）vs 旧表宿主 alias ≈6% ⇒ **hover 观感变重**。
- 暗色 `business`：核心固定 `#4c6bd8`，不跟随宿主品牌色。
- 以上均属核心基线取舍，本仓未做局部覆盖；如需回退，先拍板（本仓覆盖 or 推动核心改）。

### 2026-11-06 · P1 首批改接（TaskPicker / TimeRange，已完成，待提交）

**核心侧交付**：`dsh-plugin-core@0.34.0`（`npm install dsh-plugin-core@latest --save`）已实现 C1–C4 —— `Picker.limit`、`PickerOption.keywords`（单个字符串）、`DateTimePicker.presets`（`{label, expr}`，`expr:null` = 清空）、`DateTimePicker.width`。

**本仓改动**：

- `src/client/ui/TaskPicker.tsx` → 核心 `Picker` 薄包装（约 60 行逻辑）：作用域过滤（`scope` + 任务 `workspace`）、`excludeIds`、`allOption` 作首项、停用任务尾标拼进 `label`；`recentLimit` 映射 `limit`，任务 id 挂 `keywords`；作用域外当前值只看工作区才回插（不被 `excludeIds` 误伤）并挂 `icon:'!'`。**删除** `TASKPICKER_CSS`（15 条规则）/ `TASKPICKER_DOMAIN` / `ensureTaskPickerStyle`。
- `src/client/ui/TimeRange.tsx` → 核心 `DateTimePicker` 薄包装：`mode:'range'` + `presets`（today=`now/d`、yesterday=`now-1d/d`、thisWeek=`now/w`、lastWeek=`now-1w/w`、thisMonth=`now/M`、lastMonth=`now-1M/M`，「全部」用 `expr:null`）；不传 `width`（用核心按 precision 的默认）；值语义不变（`YYYY-MM-DD` / `YYYY-MM-DD HH:mm`，空串=不过滤）。
- `src/client/ui/time-range.ts`：删 `presetRange` 及 `ymd` / `ymdhm` / `startOfDay` / `startOfWeek` / `pad2`，只留 `ALL_TIME_PRESETS` / `rangeToQuery` / 类型。
- `src/client/ui/index.ts`：barrel 去 `presetRange`；`TaskPicker` 导出收紧为 `TaskPicker` + `TaskOption` + `TaskPickerProps`。
- 消费方：`task-list.tsx` 删 `calendarLabelsOf` / `timeLabelsOf` 与两个 memo、两处 `TimeRange` 去 `calendarLabels/timeLabels`；`records-timeline.tsx` / `task-calendar.tsx` 删 `collapseLabel`；`locales.ts` 删 `recordsCollapse` / `trCustom`（union + zh + en）。
- `scripts/smoke.mjs`：新增 `stripComments()`（去注释后再断言，防注释骗过）；重写 TaskPicker / TimeRange 断言为核心薄包装 + 反向断言（无 `dsh-tdt-tp-row` / `TASKPICKER_CSS` / 三框 / 写死宽度）；预设档断言改为 date-math 整档；token 白名单改为递归扫描核心 `dist` 下所有 `*css.generated.js`，并补核心 `MarqueeText` 内联的 `--dshpc-mq-*`。

**验证**：`npm run build` 成功；`npm run typecheck` 通过；`npm run smoke` **751 项 / 0 失败**；`koc-codelint` 32 条全为 B 类（biome 存量告警 + Markdown 存量表格格式，无 L0 语法 / L5 密钥），按 skill 记账交付。

**独立专家复核（6 项）**：

1. ✅ 已修：minute 精度下手选结束日不填时分 ⇒ 结束落 `00:00`、漏当天数据 ⇒ `toIso` 按端兜底 `end?'23:59':'00:00'`。
2. ✅ 已登记：核心 range **两端齐全才可提交**（不能再只设一端）—— 理论边界，值语义未变。
3. ✅ 已确认：`onChange` 单值返回 **string**（非数组），包装层做了 `Array.isArray` 兼容。
4. ✅ 已修：out-of-scope 判定误伤 `excludeIds`（被排除的当前值又被插回并打 `!`）⇒ 改为只看 `scope` / `workspace`。
5. ✅ 已修：文档仍描述旧实现 ⇒ ui-foundation §5.4、ui-style-guide（4 处）、execution-timeline（3 处）、dsh-capabilities「Menu 落地于 TaskPicker」均已回写。
6. ✅ 已修：`trCustom` 已无消费方 ⇒ 删 locale 键并改反向断言。

**已知限制（写进文档，不返工）**：搜索时「全部任务」会被关键词过滤（用户 2026-11-05 已认可）；核心「显示更多」没有「收起」（核心现状，非 bug）。

**文档回写坐标**：`docs/design/ui-foundation.md` §5.4 / §十「字段宽度」；`docs/design/ui-style-guide.md` §二 TaskPicker / TimeRange 行、已知例外表（删 `dsh-tdt-tp-list`）、§五日期框例外注记；`docs/design/features/execution-timeline.md` §三表格 / §3.2 / §六第 25 条。

**提交状态**：本轮改动（代码 + 文档 + 本 worklog）尚未 commit / push，等用户确认。

### 2026-11-06 · P1 全量收口 + P3 文件浏览/预览改接（代码完成，待拍板 P2/P4）

**P1 小控件（全部改接核心，本地实现删除）**

| 控件 | 现状 |
|---|---|
| Segmented / Button / IconButton | 核心 `dsh-plugin-core/ui`；周几多选挂核心 `dshpc-seg--weekday`；本地 `ui/Segmented.tsx`、`ui/Button.tsx` 已删 |
| Input / PrefixedInput / NumberInput | 核心（默认 `size='sm'`=24，4 个调用点显式补 `size`）；本地整段删 |
| Textarea / Checkbox / MarqueeText / SectionHead / LiveText | 核心；本地同名文件全删 |
| Loading / RunningBlocks | 核心（`anchorId` 显式 `'dsh-tdt-main'`）；本地 `ui/Loading.tsx` + `loading-css.ts` 删 |
| CodeViewer | 核心 `dsh-plugin-core/ui/code-viewer`（`t` 必传 `coreT`）；本地 `CodeViewer.tsx` / `cm-themes.ts` / `lang.ts` 删 |
| QuickToolbar | 核心（替代本地 `BackToTop.tsx` + `back-to-top-css.ts`，已删） |
| 拖拽调宽 | 核心 `startResizeLayoutWidth`（本地 `ui/resizer.ts` 已删） |
| 控件皮肤 | `controls-css.ts` 311 → 130 行：删分段/按钮/输入/跑马灯/日历整段；只留核心没有的产出物 chip、时分列、下拉锚点、过程文件块 |

**P3 文件浏览 / 文件预览（全量切核心 `dsh-plugin-core/adv/explorer`）**

- 新增 `src/fs-route.ts`（`FS_ROUTE = '/api/task-dispatch-table/fs'`）作为唯一路径真源。
- 宿主 `src/index.ts`：`serveFsRoute(ctx, { path: FS_ROUTE })`（核心 `dsh-plugin-core/host`，注册 `kind:'prefix'` 只读 fs 路由）。
- 客户端 `src/client/index.ts`：`connectFs({ path: FS_ROUTE })` + `connectHost(ctx)`（工作区快照源）。
- `src/client/file-browser.tsx` 重写为 ~100 行薄壳：只做「会话/工作区 → 绝对根路径」与 dock 外壳 + 拖拽，浏览/预览/面包屑/源码/HTML/Office 全部交核心 `FileBrowser`（`files: getFsFace()`、`onPick(picked)` 透传 `workspaceRel`）。
- **删除** `src/client/file-preview.tsx`（752 行）。
- **删除** `archive-session-css.ts` 中已死的预览/浏览规则 91 行（`sv-preview-head/body/titlebar/crumbbar/tree/cm-*` 等，逐类名核对无引用后删除），只留 dock 外壳三条。

**验证**：`npm run build` ✅ · `npm run typecheck` ✅ · `npm run smoke` **753 项 / 0 失败** · `koc-codelint` 仅剩 B 类（存量：`records-timeline.tsx` / `task-calendar.tsx` / `src/index.ts` / `format.ts` 的未用变量、Markdown 表格格式、`session-view.ts:402` 的 forEach 返回值告警），L0/L5 无 FAIL；本次改接新增的未用导入（`Field.tsx` / `DateTime.tsx` / `index.ts` / `task-editor.tsx` / `task-list.tsx`）已全部清掉。

**冒烟断言同步**：全部从本地实现改为核心等价物（`dshpc-cv__editor` / `dshpc-cv__copy` / `dshpc-fb__frame` / `dshpc-fb__banner` / `dshpc-fb__text` / `previewRenderFailed` / `SOURCE_MAX_BYTES` / `new Blob([full]).size >= props.maxBytes` / `languageForPath` / `PickedPath.workspaceRel`），并加反向断言「本地旧类已不存在」。

**两处核心缺口（阻塞，待用户拍板；本仓不静默删功能）**

1. **Toast**：核心 `notify/showToast` 是全局 Sonner 式，只有 `variant/durationMs/position/actions/onDismiss`；**无锚定（贴某控件上方）、无 sticky（常驻不自动消失）、无 closeButton（Toast.js:38 明确不开）、无 `dismiss` 导出（id 不返回）**。本仓 `FloatingToast` 现有 5+ 处依赖 `sticky`（JSON 校验常驻）/ `closable`（会话启动失败，用户手动关）语义，直接替换会退化。
   - 选项 A：接受行为变化，全部改核心全局提示（常驻类改成定时消失）；
   - 选项 B：让核心补 `notify` 的 `sticky` + 可编程 `dismiss(id)` + 可选 closeButton；
   - 选项 C：Toast 保留本地（唯一例外，登记进 ui-style-guide 已知例外）。
2. **会话预览**：核心 `adv/session` 的 `SessionViewModal` **明确不搬**本仓「接收/随附输入区、交付文件 / 过程文件、标题任务名入口、冷读探测、U11 页面级预览 dock」（源码注释第 5 条）。它也不导出可嵌入的 ChatView，无法做「核心会话体 + 本地业务块」组合；直接替换会丢功能。
   - 选项 A：接受功能丢失，会话预览整体换核心；
   - 选项 B：让核心加 `outputs` / `headerSlot` / `children` 之类插槽，本仓再换；
   - 选项 C：本仓保留业务外壳（会话体仍镜像官方），只把可替换的子件改核心。

**文档回写状态**：`ui-foundation` / `ui-style-guide` 的 P1 条目已在前序轮完成；本轮 P3（adv/explorer 改接、fs 路由、session/toast 缺口）尚待用户拍板后与结论一并回写 `docs/design/external/`。

### 2026-11-06 · P4 会话预览：用户拍板走 B（核心加插槽后再换，现在不动）

**决策（用户原话）**：「B：让核心加 outputs、headerSlot 这类插槽，加完我再换。这个你先记到 worklog 里面。我会让核心加，但是不是现在。」

⇒ 现在**不替换** `src/client/session-view.ts`，等 `dsh-plugin-core/adv/session` 提供插槽后再整体迁移。
下面把「要核心加什么、现在换会丢什么、届时可直接搬的代码」全部固化，核心支持后照单执行。

#### 1. 建议核心新增的 API（`dsh-plugin-core/adv/session`，全部可选、向后兼容）

适用版本基线：`dsh-plugin-core@0.34.0`（`SessionViewModal` 现有 props：`view` / `onContinue` / `openHostSession` / `onOpenFile` / `onOpenReview`）。

```ts
// 建议加在 SessionViewModalProps（或 openSessionView 的 options）
export interface SessionViewSlotProps {
  /** ① 标题插槽：渲染在「会话预览 · <标题>」之后、sessionId 之前。本仓用它挂「任务名可点 → 任务查看档」。 */
  headerSlot?: ReactNode
  /** ② 会话流体首插槽：ChatViewFrame 的 column 内、所有 keyed 节点之前（同一滚动容器）。本仓用它挂「接收 / 随附」。 */
  bodyLeadSlot?: ReactNode
  /** ③ 每轮 turn-tail 收尾插槽：官方 DeliverablesTail 同位（MessageIconActions 之前）。
   *  ctx.isLast = 本轮是否最后一轮 ⇒ 本仓只把交付卡 / 过程文件挂到最后一轮。 */
  turnTailSlot?: (ctx: { turn: number; isLast: boolean }) => ReactNode
  /** ④ 头部按钮插槽：渲染在关闭按钮之前（「继续对话」等自定义操作）。 */
  actionsSlot?: ReactNode
}
```

> 为什么是这四个：本仓与核心的差异全部落在「往官方会话骨架里塞业务块」这四处；会话体本身（keyed 节点分发、折叠、分支、常用条）核心已覆盖，不需要另开渲染入口。

#### 2. 现在直接换核心会丢失的功能（逐条对位）

| 功能 | 本仓位置 | 核心 `SessionViewModal` 现状 | 直接替换的后果 |
|---|---|---|---|
| 顶部「接收 / 随附」文件上下文 | [session-view.ts:1428-1441](file:///code/dsh-plugins/dsh-task-dispatch-table/src/client/session-view.ts#L1428-L1441)（`TaskFileContextPanel`，实现见 [task-file-context.tsx:301](file:///code/dsh-plugins/dsh-task-dispatch-table/src/client/task-file-context.tsx#L301)） | 无 bodyLead 插槽 | 看不到上游任务这次给了哪些文件、本任务随附了哪些文件 |
| 交付文件网格（实例 outputs + 快照 deliverables 去重） | [session-view.ts:738-763](file:///code/dsh-plugins/dsh-task-dispatch-table/src/client/session-view.ts#L738-L763)（`DeliverablesGridMirror`，见 [mirror/Deliverables.tsx](file:///code/dsh-plugins/dsh-task-dispatch-table/src/client/mirror/Deliverables.tsx)） | 不接收 `outputs`，无 turnTail 插槽 | 会话末尾的「交付文件」整块消失 |
| 过程文件桶（`process_outputs`，独立判存） | [session-view.ts:746-758](file:///code/dsh-plugins/dsh-task-dispatch-table/src/client/session-view.ts#L746-L758)（`ProcessFiles`，见 [process-files.tsx:22](file:///code/dsh-plugins/dsh-task-dispatch-table/src/client/process-files.tsx#L22)） | 同左 | 「只产过程文件、没有主文件」的任务完全看不到产出 |
| 标题里的任务名可点入口 | [session-view.ts:1376-1389](file:///code/dsh-plugins/dsh-task-dispatch-table/src/client/session-view.ts#L1376-L1389) | 无 headerSlot | 弹窗里点不到任务、回不到任务查看档 |
| 桌面不可用提示 `presented.unavailable` | [session-view.ts:144-179](file:///code/dsh-plugins/dsh-task-dispatch-table/src/client/session-view.ts#L144-L179)（`/api/present.host` 探测）+ [749-756](file:///code/dsh-plugins/dsh-task-dispatch-table/src/client/session-view.ts#L749-L756) | 无该提示位 | 交付文件在桌面端打不开时不给解释 |
| 随附文件同名让位（避免同屏两次） | [session-view.ts:724-725](file:///code/dsh-plugins/dsh-task-dispatch-table/src/client/session-view.ts#L724-L725) + [793-798](file:///code/dsh-plugins/dsh-task-dispatch-table/src/client/session-view.ts#L793-L798) | 无 attachedNames 口径 | 同一文件在顶部区和消息气泡里各出现一次 |
| 归档会话冷读（已归档会话仍可看） | [session-view.ts:229-510](file:///code/dsh-plugins/dsh-task-dispatch-table/src/client/session-view.ts#L229-L510) | 走官方 live 会话源，未含本仓冷读兜底 | 归档/失效会话可能整窗空白 |
| 任务标题拼接（`headingTask` + `headingRest`） | [session-view.ts:1203](file:///code/dsh-plugins/dsh-task-dispatch-table/src/client/session-view.ts#L1203)、[1382-1389](file:///code/dsh-plugins/dsh-task-dispatch-table/src/client/session-view.ts#L1382-L1389) | 只有 `view.heading` | 标题丢掉任务名那段 |

已由核心覆盖、**不需要搬**的：会话节点渲染、轮次折叠、消息分支、常用条、继续对话（fork + agent.send，`onContinue`）、文件打开（`onOpenFile`）、交付/审阅入口（`onOpenReview`）。

#### 3. 核心支持后可直接搬的代码（插槽内容，逐段可粘贴）

**③ 交付文件 + 过程文件（挂最后一轮 turn-tail）** —— 这是核心最该先支持的 `turnTailSlot`：

```tsx
// 来源：src/client/session-view.ts renderKeyedNode 'turn-tail' 分支（738-763）
const atLastTail = turn !== undefined && lastTailTurn !== undefined && turn === lastTailTurn
const showGrid = deliverFiles !== undefined && deliverFiles.length > 0 && atLastTail
const showProc = processFiles !== undefined && processFiles.length > 0 && atLastTail

const tailSlot = showGrid || showProc
  ? h(Fragment, null,
      // 桌面不可用提示（数据 = usePresentedHost 的 /api/present.host）
      showGrid && host !== undefined && host !== null && host !== 'error' && !host.available
        ? h('span', {
            className: ocOr('Deliverables', 'hostStatus', 'dsh-tdt-sv-host-status'),
            'data-host-unavailable': true,
          }, t('presented.unavailable'))
        : null,
      // 交付文件网格：数据 = task_instances.outputs ∪ 快照 deliveredByTurn（按路径去重）
      showGrid ? h(DeliverablesGridMirror, { files: deliverFiles, onOpen: fileOpen?.open, t }) : null,
      // 过程文件：task_instances.process_outputs，独立判存、默认展开
      showProc ? h(ProcessFiles, { paths: processFiles, onOpen: fileOpen?.open, defaultOpen: true, t }) : null)
  : null
```

```ts
// 数据来源（session-view.ts 1285-1304）
// 交付：实例 outputs（回执落库真值）+ 快照 deliveredByTurn，按 path 去重
const deliverFiles = useMemo<readonly DeliveredFileFace[]>(() => {
  const byPath = new Map<string, DeliveredFileFace>()
  const add = (file: DeliveredFileFace): void => {
    const key = file.path.replace(/\/+$/, '')
    if (!byPath.has(key)) byPath.set(key, file)
  }
  for (const path of (outputs ?? [])) add({ path })
  for (const file of deliveredByTurn.values()) for (const item of file) add(item)
  return [...byPath.values()]
}, [outputs, deliveredByTurn])

// 最后一轮的 turn 号：交付卡只挂这里
const lastTailTurn = useMemo(() => { /* 取 turns 中最后一个 turn-tail 节点 */ }, [turns])
```

**① 任务名可点（headerSlot）**：

```tsx
// 来源：session-view.ts 1380-1389
taskId !== undefined && onOpenTask !== undefined && headingTask !== undefined
  ? h('button', {
      type: 'button', className: 'dsh-tdt-info-dep', title: t('infoViewTask'),
      style: { fontSize: 'inherit' },
      onClick: () => { onOpenTask(taskId) },
    }, headingTask)
  : headingTask ?? heading
```

**② 接收 / 随附（bodyLeadSlot）**：

```tsx
// 来源：session-view.ts 1428-1441。核心只需要把它放进 ChatViewFrame 的 column 首个子项，
// 与会话节点同处一个滚动容器（用户 2026-10-03：不要单独滚动条）。
h(ChatViewFrame, {
  children: [
    h(TaskFileContextPanel, {
      upstream: upstream ?? [],
      attached: attached ?? [],
      workspacePath: workspacePath ?? null,
      onOpenFile,
      t: tt, // ⚠️ 必须传带占位符插值的 tt，官方 t 不替换 {count}
    }),
    ...(Array.isArray(body) ? body : [body]),
  ],
})
```

**要一起搬的本地组件**（不是纯插槽代码，核心可决定是否收编）：

| 组件 | 文件 | 说明 |
|---|---|---|
| `TaskFileContextPanel` | [task-file-context.tsx:301](file:///code/dsh-plugins/dsh-task-dispatch-table/src/client/task-file-context.tsx#L301) | 接收（前置任务产出）/ 随附（本任务附件）；数据来自实例快照 `resolvedDeps` + `attachments` |
| `ProcessFiles` | [process-files.tsx:22](file:///code/dsh-plugins/dsh-task-dispatch-table/src/client/process-files.tsx#L22) | `paths / onOpen / className / defaultOpen / t`，空数组返回 null |
| `DeliverablesGridMirror` | [mirror/Deliverables.tsx](file:///code/dsh-plugins/dsh-task-dispatch-table/src/client/mirror/Deliverables.tsx) | 官方 Deliverables 类名镜像 + 文件行；核心若自带交付网格可直接删 |

#### 4. 核心支持后的迁移步骤（照单执行）

1. 升级 `dsh-plugin-core`，读 `SessionViewModal.d.ts` 确认四个插槽的真实签名（以源码为准，不按本文猜）。
2. 在 `src/client/index.ts` 的 `openSessionView` 调用处，把 `outputs / processOutputs / upstream / attached / headingTask / taskId / onOpenTask / onOpenFile` 改走核心 props + 插槽；保留本地数据装配（交付去重、lastTailTurn、present.host）。
3. 删除 `src/client/session-view.ts`（1471 行，含镜像节点、冷读探测、本地弹窗外壳）；确认 `records-timeline.tsx` 只依赖 `sessionLinkStyle` 等导出时先摘出再删。
4. 保留 `task-file-context.tsx` / `process-files.tsx` / `mirror/Deliverables.tsx`（作为插槽内容），除非核心已收编同名能力。
5. 同步更新 `scripts/smoke.mjs` 的会话预览断言、`docs/design/external/dsh-capabilities.md`、`docs/design/features/` 与 `ui-style-guide` 已知例外表。

#### 5. 当前状态

- 代码**未动**：`session-view.ts` 原样保留，等核心。
- Toast（P2）仍待拍板，本仓 `FloatingToast` 暂留。

### 2026-11-06 · 本地安装首启失败：`process is not defined`（已修）

**现象**：本地 link 安装后 web boot 报 `dsh-task-dispatch-table: import failed: process is not defined`，client entry 未激活。

**根因**：改接核心后 `DateTimePicker` / `Picker` 把 `@floating-ui/react` 内联进 `dist/client.js`；该依赖带**模块级** `if (process.env.NODE_ENV !== "production") { … }`。浏览器没有 `process`，client 入口一 import 就抛错。与业务代码无关，是构建期没替换环境变量。

**修复**：`tsdown.client.config.ts` 增 `define: { 'process.env.NODE_ENV': '"production"' }`（浏览器产物固定生产分支）。重建后 `process.env.NODE_ENV` 归零；仅剩 lezer 的 `typeof process != "undefined"` 守卫（运行时安全）。
`scripts/smoke.mjs` 增回归断言：bundle 不得含未替换的 `process.env.NODE_ENV`，且构建配置必须保留该 define。

**验证**：`build` ✅ · `typecheck` ✅ · `smoke` 754 / 0 ✅。

**本地复测**：dist 已更新，重启 `dsh web` + 硬刷新即可；无需重新 `add`。

### 2026-11-06 · P4 会话预览改接核心（核心 0.35.0 补齐插槽）

**用户原话**：「先把修改的内容提交。然后获取一下核心控件的最新版本，它已经把这些槽位添加了，你好好看看，然后开始修改」

**核心新能力**（`dsh-plugin-core@0.35.0`，源码核实，契约已回写 [`docs/design/external/plugin-core-session.md`](../../../docs/design/external/plugin-core-session.md)）：
`SessionViewModal` 新增 `title` / `header` / `headerActions` / `bodyHeader` / `bodyFooter` 五个槽位；
`bodyHeader` 在滚动列最顶端、`bodyFooter` 在最后一条内容之后（有 turn-tail 时进它的 `tailSlot`）；
遮罩 `dshpc-overlay` 自动读 `--dshpc-page-inset-right` 让位右侧分栏；`openSessionView` 已是完整数据链
（retain / 首轮 inbox / 图片 loader）。

**本轮改动**：

| 文件 | 改了什么 |
|---|---|
| `src/client/session-view.ts` | 1471 行 → 约 190 行薄包装：`openSessionView` 转发核心（补 retain 来源名）；`SessionViewModal` 渲染核心弹窗，三块业务内容进槽位（`title` 任务名可点 / `bodyHeader` 接收·随附 / `bodyFooter` 交付补差 + 过程文件）。保留对外 props 形状 ⇒ `index.ts` 调用点不大改 |
| `src/client/mirror/*` | 删 14 个文件（ChatView / ChatNodeSeat / ChatGroupSeat / MessageItem / MessageIconActions / ReasoningRow / TurnProcessNodeView / TurnTriggerNodeView / TurnTailNodeView / TurnUsagePanel / GenericCommandCard / StatDialog / message-chrome / process-groups）；只留 `Deliverables.tsx`（交付补差网格），并裁掉不再使用的 PresentRow |
| `src/client/archive-session-css.ts` | 339 行 → 约 95 行：删外壳 / 滚动 / 消息行 / 树 / 拖拽 / 让位等全部镜像类，只留 `tfc*`（顶部区）与 `deliv*`（交付卡兜底） |
| `src/client/index.ts` | 删 `workspaceFiles` 整条链（TaskPage prop / `filesRef` / dotted `remote.workspaceFiles` 探测与诊断日志）——文件链接现在只看核心 `onOpenFile`；只改注释、不动其它逻辑 |
| `scripts/smoke.mjs` | 会话预览断言改到新实现：自绘回退类 → 核心 `dshpc-sv-*`；确认框 / 重试 / 拖拽 / 让位 → 核心等价物；`bodyHeader` / `bodyFooter` 接线断言；`present.host` / `workspaceFiles` 探测断言改为「已删」 |
| 文档 | 新增 `docs/design/external/plugin-core-session.md`（0.35.0 槽位契约）；更新 `features.md`、`archive-session-view.md`（现状覆盖 + 历史沿革）、`session-view-ui-map.md`（镜像已移交）、`ui-style-guide.md`（已知例外表清掉镜像类条目）、`docs/README.md`（外部事实索引） |

**交付文件「补差」怎么做**（只说这一处，别重复问）：核心按快照 turn 级 `deliverables.presented` 在最后画网格；
本仓 `task_instances.outputs` 是回执落库权威值，老任务快照里可能是空。`session-view.ts` 订阅快照算出已画路径集合，
`bodyFooter` 只渲染 `outputs` 里**不在集合内**的那些 ⇒ 同一文件不会同屏两次，老任务也看得见。

**已知取舍（核心当前契约没有的）**：

1. 顶部「随附」区已解析路径的文件，气泡里仍会出现官方附件卡（核心未暴露「附件卡让位」钩子）——信息重复，不是错误。
2. 弹窗遮罩只让位 `--dshpc-page-inset-right`（核心 dock）；页面左侧编辑抽屉与弹窗同屏时不再额外让位（自绘 overlay 已删）。
3. 归档会话「继续对话」按核心语义：未归档直接跳官方会话页，归档才走 fork 确认框（此前本仓一律 fork）。
4. `t` 不透传核心（两个字典键不同），核心文案走它自己的 i18n。

**验证**：`build` ✅ · `typecheck` ✅ · `smoke` 738 项通过 / 14 项失败（14 项均为**既有**失败：
断言里用单引号匹配源码双引号，`index.ts` / `task-editor.tsx` 在 HEAD 已是双引号，与本次改动无关）·
`koc-codelint` 无新增（剩余 12 条均为既有 B 类告警）。

### 2026-11-06 · P3 二次改接：文件浏览外壳也交给核心（用户「你这还是手搓的」）

**用户原话**：「包括文件浏览，你看你的文件浏览还是自己手搓的，核心已经提供了好吧。你好好把核心的文档读一下，看核心里面有什么。」

**上一刀漏在哪**（已核实）：上一轮只把**文件树 / 预览体**换成核心 `FileBrowser`，外壳仍是本地手搓的——`src/client/file-browser.tsx`（约 100 行）自建：

- `<aside class="dsh-tdt-sv-preview">` 右侧 dock、固定宽度、`position:sticky`
- `.dsh-tdt-sv-resizer` 拖拽条与 `startResize`（指针夹取、rAF、宽度持久化）
- `rootOfSession` / `rootOfWorkspace` / `resolvePath` 自己解析路径根
- 任务编辑器里的选择器浮层（portal + 自算 fixed 坐标 + 自实现 Esc / 点外关闭）

**核心其实两个命令式入口就全包了**（`docs/help/explorer.md` + `dist/adv/explorer/open.js` 源码核实）：

| 核心入口 | 接管了什么 |
|---|---|
| `openFilePreview({ mount, path, sessionId, ... })` | 右侧分栏整个外壳：把 mount 补成 flex 行、主区伸展、宽度持久化 / 夹取、拖拽条、Esc / ✕ 关闭还原；已有 dock 时就地重画（保留用户拖过的宽度） |
| `pickWorkspaceFile({ anchor, placement, filter, ... })` | 选择器浮层：锚定模态、八档方位（`left-end` = 旧浮层位置）、Esc / 点外关闭、▾ 切工作区，Promise 给 `{ path(绝对), isDir, workspaceRel?, workspace? }` |

另外核心在 `documentElement` 发布 `--dshpc-page-inset-right`（右侧核心 dock 总占宽），弹窗遮罩直接消费它，**本仓不再存预览宽度**。

**本轮改动**：

| 文件 | 改了什么 |
|---|---|
| `src/client/index.ts` | 删 `PREVIEW_WIDTH_KEY` / `readPreviewWidth` / `clampPreviewWidth` / `previewWidth` state / `startResize` / `lastWorkspaceSessionId`；预览改为 effect 调 `openFilePreview({ mount: '#dsh-tdt-root' })`；`canPreview` 改判 `getFsFace() !== undefined`（FS 路由与 remote.workspaceFiles 无关）；卸载时 `close()`；`--dsh-tdt-preview-w` 变量删除 |
| `src/client/file-browser.tsx` | **整文件删除** |
| `src/client/task-editor.tsx` | 选择器改 `pickWorkspaceFile`（锚点方按钮、`left-end`、`sessionId` 作相对基准、`rootName` 兜底）；删 `pickerWs` / `pickerPanelRef` / Esc / 点外两个 effect / `createPortal` 浮层 / `workspaceFiles` prop |
| `src/client/archive-session-css.ts` | 删预览 dock + resizer + resizing 隔离规则；遮罩 `right` 改 `calc(var(--dshpc-page-inset-right,0px) + var(--dsh-tdt-editor-w,0px))` |
| `src/client/task-editor-css.ts`、`ui/controls-css.ts` | 注释里对旧 dock / 旧 resizer 的引用改到核心 `dshpc-dock__panel` |
| `scripts/smoke.mjs` | 13 条预览 dock 断言改核心等价物（`openFilePreview` / `dshpc-dock__panel` / `dshpc-dock__resizer` / 让位变量 / 本地 dock 已删的反断言）；`coreOnly` 补 `--dshpc-dock-h`（核心运行期写入） |

**验证**：`build` ✅ · `typecheck` ✅ · `smoke` 753 / 0 ✅ · `koc-codelint` 无新增（剩余 14 条均为既有 B 类告警）。

**仍待用户拍板**：Toast（P2，建议 B：核心补 sticky + 关闭钮）；会话预览 P4（等核心插槽）。

## Execution Log

<!-- Maintained by the script: appended by new / claim / set / release / log / close. Do not edit.
     Backfill with: progress log --id 20261105-1252-6f7c-样式改接-dsh-plugin-core --note "...". -->
- 2026-11-05 12:52:17 · new · @GuoJia-Agent · 8d557c6d-7c93-43ac-8c73-5d623e82e1c6 · created and claimed
- 2026-11-05 12:52:51 · log · @GuoJia-Agent · 8d557c6d-7c93-43ac-8c73-5d623e82e1c6 · 建任务并认领；需求三条与待办步骤写入 worklog（Background 引原话，To Do 列 3 硬要求 + 6 步）；未开始代码改动
- 2026-11-05 13:22:50 · log · @GuoJia-Agent · 8d557c6d-7c93-43ac-8c73-5d623e82e1c6 · P0 地基完成：接入 dsh-plugin-core@0.33.3、删除 ui/tokens.ts、--tdt-→--dshpc-（35 文件 1333 处）、style.ts 改核心 kit 薄壳、冒烟 +token 白名单守卫；两轮专家复核 9 项返工全部闭环；typecheck/build/smoke 751/0
- 2026-11-05 14:25:17 · log · @GuoJia-Agent · 8d557c6d-7c93-43ac-8c73-5d623e82e1c6 · 讨论完毕并拍板：Picker 加 limit（搜索同样分页）+ keywords（单个字符串）；DateTimePicker 加 presets + width（触发器总宽）；「全部任务」作普通首项（核心零改）；token 基线跟随核心。交核心清单 C1–C4 定稿，worklog 提交推送 b9dae9e；TaskPicker/TimeRange 等核心新版发布后再接。
- 2026-11-05 23:29:55 · log · @GuoJia-Agent · 8d557c6d-7c93-43ac-8c73-5d623e82e1c6 · 核心 0.34.0 交付 C1–C4；TaskPicker/TimeRange 改接核心薄包装完成（src/client/ui/TaskPicker.tsx、ui/TimeRange.tsx），删自绘浮层与 15 条 CSS，typecheck/build/smoke 751/0；专家复核 6 项闭环、文档 4 篇已回写；改动待提交
- 2026-11-06 00:36:26 · log · @GuoJia-Agent · 8d557c6d-7c93-43ac-8c73-5d623e82e1c6 · P1 全量改接核心完成（本地控件/CSS 删除）；P3 文件浏览与预览整体切 dsh-plugin-core/adv/explorer（新增 fs 路由、file-preview.tsx 752 行删除、死 CSS 91 行删除），build/typecheck/smoke 753/0；P2 Toast 与 P4 会话预览因核心缺能力待拍板
- 2026-11-06 00:51:15 · log · @GuoJia-Agent · 8d557c6d-7c93-43ac-8c73-5d623e82e1c6 · P4 会话预览拍板走 B：worklog 固化核心插槽 API 建议（headerSlot/bodyLeadSlot/turnTailSlot/actionsSlot）、替换会丢的 8 项功能对位、可直接搬的插槽代码与迁移步骤；当前 session-view.ts 不动，等核心支持
- 2026-11-06 01:03:25 · log · @GuoJia-Agent · 8d557c6d-7c93-43ac-8c73-5d623e82e1c6 · 修复本地首启 import failed: process is not defined —— tsdown.client.config.ts 加 define process.env.NODE_ENV=production（floating-ui 模块级判断），smoke 加回归断言；build/typecheck/smoke 754/0
- 2026-11-06 06:15:56 · log · @GuoJia-Agent · 8d557c6d-7c93-43ac-8c73-5d623e82e1c6 · P4 会话预览改接核心完成：核心升至 dsh-plugin-core@0.35.0（title/header/headerActions/bodyHeader/bodyFooter 槽位），session-view.ts 1471→约190 行薄包装，删 mirror 14 文件只留 Deliverables.tsx，archive-session-css 339→约95 行；删 present.host 与 remote.workspaceFiles 探测；build/typecheck 通过，smoke 738/14（14 项均为既有单引号断言失配）
