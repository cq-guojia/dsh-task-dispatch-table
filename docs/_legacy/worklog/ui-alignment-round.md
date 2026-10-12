# 工作包：UI 基础层收口（尺寸对齐 + 圆角/字号归一 + 死代码清理）

> **状态**：✅ **完成封卷**（2026-10-01）
> **来源**：用户 2026-10-01 真机走查多轮反馈（承接 [size-unification.md](size-unification.md) 的「32 标准行」拍板）
> **配套**：[`design/ui-style-guide.md`](../design/ui-style-guide.md) §三 / §五 / §七 · [`design/ui-foundation.md`](../design/ui-foundation.md) §四 §5.1 §5.2

---

## 一、需求原话（用户，逐字保留）

> 新建任务里面，任务编号、任务名称要拉得跟下面的那个一样长好吗？长度不对。
> 「允许延迟」4 小时，为什么这么矮？是样式没选对吗？
> 每隔多少小时……左边那个加减的样式是可以的，但是为什么这么矮？……那个太长了，把它弄短一点，能显示 3 位数、4 位数就行了。你现在留了多长啊？
> 提示词里的那三个下拉框……如果我的模型名称特别长，一选它就给拉出去了；工作区名称特别长，一选也会给拉出去。所以工作区和模型都要设置最大显示长度，如果显示不下，选完之后就用「...」来显示。
> 还是那个 switch……底层用的都是同一个，只是在这个地方改了一下它的颜色吗？……如果是这样就没有问题，但如果是完完全全自己写的一套就不对了。
> 高级设置那个问号：该问号下面有一个底色……但就是那个底色有问题。其他地方的问号……全都是又小又有底色，而且鼠标移上去还不显示提示。
> 列表页那个搜索框和下拉框……好像搜索框的 input 比下拉框要高两个像素……
> 「执行记录」……分类的下拉框和时间范围的下拉框，高度完全不一样，这是为什么？
> input 和 select……里面的文字字号都不一样吗？……还有一个 input 和 select 的圆角尺寸都不一样吗？把 input 的圆角统一成 select 的。还有 button 的圆角也往 select 的统一。
> 主界面最右上角有一个新建任务。旁边有个……滑动选择条，那两个高度也不一样。

---

## 二、根因定位（每条带 `文件:行号`）

| # | 现象 | 根因 | 证据 |
|---|---|---|---|
| 1 | 任务编号/名称比下面那行短 | `PrefixedInput` 根是 `inline-flex`（收缩盒），宽度只由「前缀 + input 默认宽」定 | `ui/controls-css.ts` `.dsh-tdt-pfx`；`ui/Field.tsx:74-92` |
| 2 | 「允许延迟」比同排日期矮 | 它是 `SelectField` 且传了 `size:'sm'`(=24)，同排 `DateField` 是默认 `lg`(=32) | `task-editor.tsx:1762-1771`（改前） |
| 3 | 间隔数字框矮 / 太宽 | 同传 `size:'sm'`；数字区宽度规格写死 `44px`（够 6 位） | `task-editor.tsx:886-893`；`ui/controls-css.ts` `.dsh-tdt-num__input{width:44px}` |
| 4 | 模型下拉一选就撑破整行 | 模型 `SelectField` **无 `maxWidth`**；且官方 `Menu` 把锚点包进 shrink-to-fit 的 `span`，该 span 不允许收缩 ⇒ 封顶也顶破容器 | `task-editor.tsx:1542-1550`；`ui/Field.tsx` `SelectField` 锚点 `maxWidth` |
| 5 | 两处 switch 颜色不同 | 同一个官方 `Switch`；左上角那处**多挂了一个包装类** `.dsh-tdt-switch` 把选中态刷成 success 绿（合法变体覆盖，非两套实现） | `task-editor.tsx:2033`、`task-list.tsx:1234`；`ui/controls-css.ts` `.dsh-tdt-switch` |
| 6 | 问号「hover 不弹气泡」 | 非高级设置那几处把问号当 `IconButton`（函数组件）交给官方 `Tooltip`——**ref 挂不上 ⇒ 气泡静默失效**；高级设置那处用原生 `span` 所以正常 | `task-editor.tsx` `HelpButton` |
| 7 | 列表搜索框比下拉高 ~2px | 搜索框（官方 `Input`）只压了 `height:28`、**没给 `box-sizing`**，官方 0.5px 边框加在 28 之外；下拉是 `border-box`=28 | `task-list.tsx:96-98` vs `controlBoxStyle` |
| 8 | 执行记录里 分类下拉 vs 时间下拉 高度差 8px | 分类传 `size:'sm'`(24)、时间 `DateField` 默认 `lg`(32)；皮肤来源也不同（内联对象 vs class） | `task-list.tsx:929-950`；`ui/Field.tsx` / `ui/DateTime.tsx` |
| 9 | input 字比 select 小 / 圆角不一致 | 前缀框 `__input` **写死 `font-size: var(--tdt-font-sm)`**(12)，不理会尺寸档；圆角 input/btn 用 `radius-sm`(8)、下拉用 `radius-md`(12) | `ui/controls-css.ts` `.dsh-tdt-pfx__input` / `.dsh-tdt-btn` / `.dsh-tdt-input` |
| 10 | 主界面右上「新建任务」比旁边分段条矮 | 按钮 `size:'sm'`(24) vs `Segmented size:'md'`(28) | `index.ts:953-958` vs `:942-951` |

---

## 三、本轮改动（落码）

| 文件 | 动作 |
|---|---|
| `src/client/task-editor.tsx` | 编号/名称撑满整行（`style:{width:'100%'}`）；「允许延迟」「间隔数字框」去掉 `size:'sm'` 回默认 lg；模型下拉加 `maxWidth:200`；**重写 `HelpButton`**（非 `insideClickable` 分支改用原生 `button` 当 Tooltip 子节点） |
| `src/client/task-editor-css.ts` | `.dsh-tdt-ed-card-foot > *{min-width:0}`（三下拉可收缩省略）；`.dsh-tdt-ed-help` **去掉 hover 底色**、统一尺寸 |
| `src/client/ui/controls-css.ts` | 圆角归一：`.dsh-tdt-btn` / `.dsh-tdt-input` / `.dsh-tdt-pfx` / `.dsh-tdt-num` → `radius-md`；前缀框/数字框**字号跟档走**（md/lg → `--tdt-font-md`）；数字区宽度 `44px → 36px`（够 3~4 位） |
| `src/client/ui/Field.tsx` | `NumberInput` 增 `inputWidth` 档（不传取 CSS 规格 36） |
| `src/client/config-panel.tsx` | 秒数字段 `inputWidth:48`（例外放宽，值可能 5~6 位） |
| `src/client/task-list.tsx` | 搜索框补 `box-sizing:border-box`；执行记录/日志过滤行的分类下拉、关键词框、条数下拉去掉 `size:'sm'` → 与同排时间框同档 lg；卡片底栏「删除/编辑」`sm→md`；去掉空壳类 `dsh-tdt-tl-switchwrap`；**补回记录表头吸顶规则**（原注释声称有、实际迁移时丢了） |
| `src/client/index.ts` | 右上「＋ 新建任务」与左上「← 返回会话」按钮 `sm→md`，与头部三 tab 分段条同高 |

### 3.1 视觉差异（逐项可对照）

| 位置 | 之前 | 现在 |
|---|---|---|
| 任务编号 / 名称 | 收缩盒（约 200px） | 撑满整行，与下方卡片等宽 |
| 允许延迟 / 间隔数字框 | 24（比同排矮 8px） | 32，同排齐高 |
| 数字框宽度 | 数字区 44px（≈6 位） | 36px（够 3~4 位） |
| 模型下拉 | 无上限，长名撑破整行 | 封顶 200px + 省略号；窄卡内三下拉可收缩 |
| 问号 | 两套（24 vs 18）、有底色、部分不弹气泡 | 一套 18×18、无底色、全部弹气泡 |
| 列表搜索框 | 比下拉高 ~2px | 严格同高 |
| 记录/日志过滤行 | 下拉 24 vs 时间框 32 | 全部 32 |
| 卡片底栏 | 三滑块 28 vs 删除/编辑 24 | 全部 28 |
| input / 前缀框 / 数字框 / 按钮圆角 | `radius-sm`(8) | `radius-md`(12)，与下拉一致 |
| 前缀框 / 数字框字号 | 写死 12 | 跟档（lg=13），与下拉一致 |
| 主界面头部按钮 | 24 vs 分段条 28 | 全部 28 |

---

## 四、审计：该抽象未抽象 / 死代码（2026-10-01，子代理 very thorough 全仓盘点）

### 4.1 已清（本轮做掉，零风险）

- **死 CSS 15 条**（定义齐全、全仓 JSX 挂载 = 0）：
  - `task-editor-css.ts`：`.dsh-tdt-ed-close` / `.dsh-tdt-ed-ver-use` / `.dsh-tdt-ed-ver-del` / `.dsh-tdt-ed-input` / `.dsh-tdt-ed-pfx` 全家（均已被 `ui/` 基础层取代）；
  - `archive-session-css.ts`：`.dsh-tdt-sv-close` / `.dsh-tdt-sv-btn`(+`-icon`) / `.dsh-tdt-sv-official` / `.dsh-tdt-sv-process-body` / `.dsh-tdt-sv-branch` / `.dsh-tdt-sv-err-back`。
- 挂载与定义对不上 / 空壳类：`task-list.tsx` 的 `dsh-tdt-tl-switchwrap`（无 CSS，已删）；过时注释（指向已删类，已修）。
- 迁移时**丢失**的记录表头吸顶规则（`.dsh-tdt-rec-head th`）——已补回。
- 冒烟同步：3 条断言原来钉的是上面的死类名，已改为钉新实现（link 钮 + danger 图标钮 / `.dsh-tdt-pfx--error` / `.dsh-tdt-switch`）。

### 4.2 已登记未做（见 [`ui-style-guide.md`](../design/ui-style-guide.md) §三「待抽象」）

省略号三件套（19 处）· 会话域手搓图标钮 · 6px 拖拽条（两处同款）· 卡/浮层外壳（同构 7 处）· `index.ts` 手搓中性 Toast · 缺 `Textarea`/`Checkbox` 基础层件 · token 兜底字面量不统一 · 实面反白字写死 `#fff`。

---

## 五、验收

- `npm run build`（含 `dist/`）✅ · `npm run typecheck` ✅ · `npm run smoke` **390 项全过、0 失败**。
- **真机复验点**（装新 `dist/`）：同一行内 Input / 下拉 / 按钮 / 滑轨同档零误差；编号/名称满行；三下拉窄卡内出省略号不撑破；问号 hover 全弹气泡且无底色；记录表头滚动吸顶。

---

## 六、结论

- 「一类控件一个实现」已达标；本轮把**尺寸档 / 圆角 / 字号**三条刻度也统一了（见 style-guide §五）。
- 残留的是**同构重复的容器类**（卡/浮层/省略号/拖拽条）与**缺件**（Textarea/Checkbox），改动中等以上，已显式登记，不在本次收口内。
