# 核心控件 `Picker` / `DateTimePicker` / `FieldHint` / `notify`（源码级事实）

- **类型**：外部事实（`dsh-plugin-core` 的 UI 基础控件）
- **适用版本**：`dsh-plugin-core@0.35.0`（`dist/ui/inputs/Picker.js`、`DateTimePicker.js`、`ModelPicker.js`、`WorkspacePicker.js`、`InputGroup.js`、`picker-css.generated.js`、`dist/ui/display/FieldHint.js`、`Card.js`、`StripCard.js`、`dist/ui/feedback/Toast.js`；均为 `dist/ui/index.d.ts` 的导出面）
- **状态**：已核实（2026-11-06，读实现源码，非试错）
- **来源**：`node_modules/dsh-plugin-core/dist/ui/…`
- **配套**：[`plugin-core-dock.md`](plugin-core-dock.md)、[`plugin-core-session.md`](plugin-core-session.md)、[`../../design/ui-style-guide.md`](../ui-style-guide.md) §二「唯一实现表」

## 一、导出面（`dsh-plugin-core/ui`）

| 符号 | 形态 | 本仓用途 |
|---|---|---|
| `Picker` | React 组件 | 所有下拉（`SelectField` 与 `TaskPicker` 都是它的薄包装） |
| `PickerGroup` / `PickerOption` | 类型 | 分组 / 扁平选项 |
| `DateTimePicker` | React 组件 | 任务表单「日期 + 时刻」组合、筛选时间范围 |
| `DateTimeOutput` | 类型 | `string \| [string, string] \| null` |
| `FieldHint` | React 组件 | 所有「?」说明钮（`HelpButton` 薄包装） |
| `notify` | 函数 | 一次性提示（推荐） |
| `showToast` | 函数 | 一次性提示（可带 `onDismiss`） |
| `LoadingToast` / `showLoading` | 组件 / 函数 | 进行中提示 |
| `Segmented` | React 组件 | 分段控件（用户口语里的「滑块」） |
| `ModelPicker` | React 组件 | 选模型（`grouped` 分组下拉 / `cascade` 供应商↔模型联动） |
| `WorkspacePicker` | React 组件 | 选工作区（数据自动来自宿主工作区快照；**本仓未用**，原因见 §八） |
| `InputGroup` | React 组件 | 「名字 + 输入框」同格组合（`label` 灰底标题格；任务名称 / 编号用） |
| `Card` / `StripCard` | React 组件 | 卡片外框：框式（Surface 底 + 边框 + 圆角 12） / 浅底条带式（左缘 4px 通高方角条） |
| `CardAccent` / `CardBarOptions` / `CardSharedProps` | 类型 | 外框色调档 / 色条几何 / 共用 props |

**核心没有的东西**（不要找、也不要自造等价物后再声称是核心）：

- **没有 `Slider` / range 滑块控件** —— 需要「滑动块」用 `Segmented`。
- **没有纯时分（time-only）选择器** —— `DateTimePicker` 的 `minute` 精度**必须带日期**（没选日期就不产出值）。

## 二、`Picker` 硬契约（会踩到的点）

| 点 | 事实 |
|---|---|
| 纯零件 | 选项由调用方传入；组件不取数（跨 host↔client 的数据通道是插件私有的） |
| 受控 | 给了 `value` 即受控；`value` 不在选项里时触发器回退到 `placeholder`（不是显示旧值） |
| `className` | 加在**根** `.dshpc-picker`（`inline-block` 的 div，`max-width:100%`），不是触发器；父容器要 `> *{min-width:0}` 才允许收缩 |
| 宽度 | `width` 给了就忽略 `minWidth/maxWidth`；触发器固定此宽，超长省略 + hover 跑马灯（**始终启用**，本仓旧 `marquee` 参数已删） |
| 对齐 | 只有 `align:'left' \| 'center'`；**没有 `align:'end'`**（菜单从触发器左缘展开，靠近视口边缘由核心自动 flip 方向） |
| 空态 | 空列表由核心自己出文案；本仓做法是 `options=[] + disabled + placeholder=业务空态文案` |
| 校验红框 | **没有 `error` 档**；本仓用根 className `.dsh-tdt-picker--error` + 一条皮肤规则打到 `.dshpc-picker__trigger` |
| `hint` | 给了就在触发器**同一行**后挂核心 `FieldHint`（问号 + 气泡），调用方不用手拼 |
| `degraded` | 候选可能不完整时如实标记（不要塞假数据） |

## 三、`DateTimePicker` 硬契约

| 点 | 事实 |
|---|---|
| mode | `single`（单值） / `range`（起止两值） |
| precision | `day` / `hour` / `minute` / `second`；**minute 必须带日期** |
| 值格式 | `string`（`YYYY-MM-DDTHH:mm:ss.SSS`） / `[from, to]` / `null`；`null` = 未选 |
| range 提交 | **两端齐全才产出值**；只有一端时核心不提交 |
| 宽度 | 核心按 `precision` 写死触发器宽度（`minute` ≈ 153px），选中前后不变；本仓不要传 `width` |
| presets | `{ label, expr }`，`expr` 走核心 date-math（`now/d`、`now-1d/d`、`now/w`、`now/M` 等）；`null` = 清空 |
| `hint` | 同 `Picker`，可在触发器后挂 `FieldHint` |

**纯时分的替代方案**：本仓把「时刻」与「日期」合并成**一个 `DateTimePicker`**（`task-editor.tsx` 的 `MomentField` 只做 `date + time ⇄ ISO` 换算）。核心若将来补 `TimePicker`，再拆开。

## 四、`FieldHint`

`text`（气泡文字 / aria-label，`\n` 真换行）、`side`（`top` / `bottom` / `right`）、`align`（`center` / `end`）、`maxWidth`、`className`、`style`。渲染为可 focus 的 `span` + 官方 `Tooltip`；挂进可点行时要自己吞点击冒泡（本仓 `HelpButton` 的 `insideClickable` 分支）。

## 五、`notify` / `showToast`

| 点 | 事实 |
|---|---|
| Toaster | 核心**懒创建并复用同一个宿主级 Toaster**（跨插件共享，无需调用方挂载） |
| `notify` 选项 | `variant: info \| success \| error \| warning`、`description`、`durationMs`（默认 2600）、`position`、`actions: { text, variant?, onClick }[]` |
| `notify` **没有** `onDismiss` | 需要「关闭时回写状态」用 `showToast`（它有 `onDismiss`），或把状态清理放在 action 的 `onClick` 里 |
| 关闭钮 | 核心不启用 Sonner 的 `closeButton` ⇒ 常驻提示要自己给一个 `actions` 关闭项；`durationMs: Infinity` 慎用（无法程序化 dismiss） |
| 常驻态 | 核心提示**不支持常驻后由状态撤除**（本仓 JSON 非法这类持续态改为「进入非法时弹一次长停留提示」） |
| 外观 | info 为中性灰卡、success 绿、error 红、warning 橙；都带图标，位置默认屏幕底部居中（**不再浮在业务底栏上方**） |

## 六、`ModelPicker` 硬契约

| 点 | 事实 |
|---|---|
| variant | `grouped`（默认）：**一个下拉**，供应商做组头、模型列在下面，不与别物联动；`cascade`：**两个下拉**，先选供应商、模型跟着筛 |
| 值口径 | `onChange` 一律发最终模型值 `${provider}/${id}`；`''` = 默认模型（没选），调用方自己处理 |
| cascade 换供应商 | 先发 `''`（旧模型不属于新供应商）；内部 `pickedProvider` 保留用户所选供应商 |
| 数据来源 | **不传 `groups` 就读宿主真实模型目录**（`connectHost` 的 `modelsPath`）⇒ 本仓为了复用自有 `HostLlmModelInfo` 数据而**显式传 `groups`** |
| searchable | **默认开**（关掉要显式 `searchable:false`） |
| `translate` | 类型是 `dsh-plugin-core/utils` 的 `Translate`；本仓 `t` 键集更大、类型不兼容 ⇒ `import { t as coreT } from 'dsh-plugin-core/utils'` |
| 宽度 | 核心不提供定宽档；按使用点给根 `className`（本仓编辑器 `.dsh-tdt-ed-model{width:140px}`）。**注意最小宽度**：`cascade` 是两个触发器并排，父容器需给 `min-width:0` 与网格分栏 |

本仓两处用法：编辑器提示词区 = `grouped`（`task-editor.tsx`，`modelGroupsOf` 把自有模型列表转 `PickerGroup[]`）；设置页默认模型 = `cascade`（`settings-config-block.tsx`，`''` 时清空 `defaultProvider` / `defaultModel` 两段）。

## 七、`Card` / `StripCard` 硬契约

| 点 | 事实 |
|---|---|
| 两种外观 | `Card` = 「框式」：`Surface` 底 + 1px 边框 + 圆角 12，色条默认左侧 6px **短条**（高度随内容）；`StripCard` = 「浅底式」：同色系浅底 + 1px 不可见占位边框 + **方角** + 左缘 4px **通高**方角条（贴左缘） |
| 共用 props | `accent`（`business/success/warning/danger/neutral/...` 档位，或任意 CSS 色）、`bar`（`{side,size,inset,gap,length}`）、`expanded`、`onToggle`、`action`、`children`、`panel`、`className`、`style`、`translate` |
| `children` 落点 | 落在 `__main`（在 `__head` 内、`flex:1;min-width:0` 的块容器）⇒ 多个子节点**自然上下堆叠**；本仓把展开区作为 children 兄弟节点，不走 `panel`（`panel` 自带 `border-top`，会与既有分隔线重复） |
| 隐藏色条 | `Card` 的色条宽 = `var(--card-bar-size)` ⇒ `bar:{size:0,inset:0,gap:0}` 即不可见；`style:{padding:0}` 覆盖 `--bordered` 的 14px 内距 |
| `StripCard` 的 `bar.side` | 固定贴左，忽略此项 |
| 色调 | 本仓执行记录：ok→success、bad→danger、warn→warning、busy / planned→business、其余→neutral（`toneAccentOf`）；设置页两块用 `neutral` |

## 八、`WorkspacePicker`（核心提供，但本仓未采用）

| 点 | 事实 |
|---|---|
| 数据 | **自动来自宿主工作区快照**，调用方不传候选 |
| 值口径 | `workspaceId`（单选 `string`；`mode:'multiple'` 时 `string[]`） |
| `allowDefault` | 默认提供「所有工作区」项（只在单选出现）；选中发 `''` |
| `searchable` | **默认关**（要就显式 `true`） |
| 未采用原因 | 本仓任务定义里存的是**工作区标题**（`target.workspace`），不是 workspaceId；换成该控件要改写值语义与数据面。本轮改为给核心 `Picker` 开 `searchable:true`，保持值语义不变。**若将来任务定义改存 workspaceId，应改接它** |

## 九、`InputGroup` / `PrefixedInput`（两种「名字 + 输入框」形态的区别）

| 点 | `InputGroup`（核心推荐） | `PrefixedInput`（本仓曾用） |
|---|---|---|
| 外观 | `label` 与输入框**同格**、灰底标题格，整组一体 | 前缀是**灰字**（非灰底）+ 右侧 1px 分隔线 |
| 用户口径 | 2026-11-06「前面一个名字，后面一个输入框」= 这个 | 不是这个 |
| 额外能力 | `actions`（后置按钮组）、`undoable`（撤销）、`onSubmit`（Enter） | 无 |
| 宽度 | 根 `inline-flex` ⇒ 撑满整行要自己 `style.width` | 同 |
| 校验 | `error` 描红整组（核心负责） | `error` 描红框 |

本仓 `task-editor.tsx` 的 `PrefixedInput` 包装已改底为 `InputGroup`（任务名称 / 编号两处）。

## 十、复核命令（升级核心后照跑）

```bash
node -p "require('./node_modules/dsh-plugin-core/package.json').version"
grep -n "interface PickerProps" -A 40 node_modules/dsh-plugin-core/dist/ui/inputs/Picker.d.ts
grep -n "interface DateTimePickerProps" -A 30 node_modules/dsh-plugin-core/dist/ui/inputs/DateTimePicker.d.ts
grep -n "NotifyOptions" -A 20 node_modules/dsh-plugin-core/dist/ui/feedback/Toast.d.ts
grep -n "interface ModelPickerProps" -A 35 node_modules/dsh-plugin-core/dist/ui/inputs/ModelPicker.d.ts
grep -n "interface WorkspacePickerProps" -A 30 node_modules/dsh-plugin-core/dist/ui/inputs/WorkspacePicker.d.ts
grep -n "interface InputGroupProps" -A 35 node_modules/dsh-plugin-core/dist/ui/inputs/InputGroup.d.ts
grep -n "interface CardSharedProps" -A 30 node_modules/dsh-plugin-core/dist/ui/display/Card.d.ts
```
