# 20261105-1252-6f7c-样式改接-dsh-plugin-core: 样式改接 dsh-plugin-core

- **Tags**: 样式, 组件复用, 插件核心, DSH
- **Status**: doing · 2026-11-05 13:22:50 · @GuoJia-Agent · 8d557c6d-7c93-43ac-8c73-5d623e82e1c6
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
- [ ] **用户逐条拍板**（当前阻塞点）：① hover/active 观感变重是否接受；② 暗色 `business` 固定 `#4c6bd8` 是否本仓覆盖；③ TaskPicker 归本仓自研还是核心扩；④ TimeRange 预设归本仓组合还是核心扩
- [ ] P1 基础控件替换：Button/IconButton、Checkbox、Segmented、Textarea、Input/PrefixedInput/NumberInput、LiveText、MarqueeText、SectionHead、Loading、BackToTop、DateTime、CodeViewer → 核心同名件
- [ ] P2 反馈层：自绘 toast → 核心 notify/Toast；Modal/Confirm/Alert → 核心 `skin`
- [ ] P3 文件浏览 / 预览：`file-browser.tsx` / `file-preview.tsx` → `dsh-plugin-core/adv/explorer`
- [ ] P4 会话预览：`session-view.ts` + `mirror/*`（13 文件）+ `archive-session-css.ts` → `adv/session`（SessionViewModal + openSessionView）；本仓只留业务接线
- [ ] P5 业务样式重构：`editor-css` / `info-css` / 内联字面量 / 自绘浮层 → 核心 token + 核心件
- [ ] P6 文档回写：`ui-style-guide.md` / `ui-foundation.md` / `external/session-view-ui-map.md` / `features.md`
- [ ] 收尾统计：替换前 / 后本项目自留样式行数与类名数量，确认「样式很少」；build + smoke + typecheck + 专家复核

## Next

P1 起步：以 `src/client/ui/Button.tsx` + `controls-css.ts` 的 Button/IconButton 为第一项，改调 `dsh-plugin-core/ui` 的 `Button` / `IconButton`（先核对 variant/size 映射与 `controls-css` 的 15 套皮肤），完成后立即跑一次独立专家复核；后面按列表逐项推进。

## Process

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
| `ui/TaskPicker.tsx` | `Picker`（`PickerOption` 只有 value/label/icon/disabled） | **核心不足**：无副标题 / 停用标签 / 作用域外提示 / 「更多·收起」 |
| `ui/TimeRange.tsx`（预设 + 自定义区间） | `DateTimePicker mode="range"` | **核心不足**：无快捷预设；可由 `Picker` + `DateTimePicker` 本仓组合 |
| `file-browser.tsx` / `file-preview.tsx` | `adv/explorer`：`FileBrowser` / `FilePreview` / `openFilePreview` / `pickWorkspaceFile` / `connectFs` | 可替换 |
| `session-view.ts` + `mirror/*`（13 文件） | `adv/session`：`openSessionView` + `SessionViewModal` | 可替换；本仓只留业务接线 |
| `archive-session-css.ts` / `toast-css.ts` / `loading-css.ts` | 核心 feedback / explorer / session 自带样式 | 可删 |
| 任务表格 / 日历 / 时间线 / 设置分块 | — | **核心缺失**（业务专属，保留本仓） |

### 残留风险（待用户拍板）

- `hover/active`：核心固定 rgba（亮 10% / 18%，暗 14% / 24%）vs 旧表宿主 alias ≈6% ⇒ **hover 观感变重**。
- 暗色 `business`：核心固定 `#4c6bd8`，不跟随宿主品牌色。
- 以上均属核心基线取舍，本仓未做局部覆盖；如需回退，先拍板（本仓覆盖 or 推动核心改）。

## Execution Log

<!-- Maintained by the script: appended by new / claim / set / release / log / close. Do not edit.
     Backfill with: progress log --id 20261105-1252-6f7c-样式改接-dsh-plugin-core --note "...". -->
- 2026-11-05 12:52:17 · new · @GuoJia-Agent · 8d557c6d-7c93-43ac-8c73-5d623e82e1c6 · created and claimed
- 2026-11-05 12:52:51 · log · @GuoJia-Agent · 8d557c6d-7c93-43ac-8c73-5d623e82e1c6 · 建任务并认领；需求三条与待办步骤写入 worklog（Background 引原话，To Do 列 3 硬要求 + 6 步）；未开始代码改动
- 2026-11-05 13:22:50 · log · @GuoJia-Agent · 8d557c6d-7c93-43ac-8c73-5d623e82e1c6 · P0 地基完成：接入 dsh-plugin-core@0.33.3、删除 ui/tokens.ts、--tdt-→--dshpc-（35 文件 1333 处）、style.ts 改核心 kit 薄壳、冒烟 +token 白名单守卫；两轮专家复核 9 项返工全部闭环；typecheck/build/smoke 751/0
