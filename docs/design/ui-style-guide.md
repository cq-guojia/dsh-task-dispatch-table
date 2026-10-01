# UI 开发手册（写插件界面时照这个做）

> **状态**：📝 随 [`ui-foundation.md`](ui-foundation.md) 一并待拍板（2026-10-01 起草）
> **这一份是**：「以后每次都照这个做」的操作手册。**技术方案与规格**看 [`ui-foundation.md`](ui-foundation.md)。
> **一句话**：**新界面只许用 `src/client/ui/` 的组件与 `--tdt-*` token；不许自己写颜色、尺寸、圆角、字号。**

---

## 一、动手前先做三个判断（决策树）

```
我要加的东西是什么？
├─ 已经存在的控件（按钮 / 分段 / 输入 / 下拉 / 开关 / 日期时间 / 卡 / 浮层 / Toast）
│    └─ ✅ 直接用 ui/index.ts 导出的组件；先读它的 props（size / variant），
│       你需要的外观差异，先问「是不是已有 variant 能满足」——不够用也**不许就地改样式**，
│       走 §五 流程（改基础层，一处改、全站生效）。
├─ 宿主官方有、我们还没有的控件
│    └─ ✅ 在 ui/ 里包一层（包装 + 集中在 official-skins.ts 覆盖），再拿出去用；
│       **不要在使用点直接 import 官方件**（官方件的覆写会散成 N 份）。
└─ 全新的东西（宿主没有、ui/ 里也没有）
     └─ ✅ 在 ui/ 里新建它的唯一实现（自绘），token 只能引用 --tdt-*；
        使用点只 import ui/index.ts 的导出。
```

---

## 二、唯一实现表（同一个控件只准有一个实现）

| 控件 | 唯一位置 | 怎么用（示例） | 现状重复数 |
|---|---|---|---|
| 分段控件（滑动块） | `ui/Segmented.tsx` | `h(Segmented<'a' \| 'b'>, { value: v, size: 'md', variant: 'inset', items: [{ value: 'a', label: '甲', badge: 3 }], onChange: setV })` | ✅ **P1a 已收敛 3 处**（主面板 / 列表筛选 / 卡片三面板）；余 7 处（编辑器官方覆写 ×3 / 星期 / 版本开关 / 预览两态）待 P1b |
| 按钮 | `ui/Button.tsx` | `<TdtButton variant="outline" size="sm">重置</TdtButton>` | 15+ |
| 图标钮 | `ui/Button.tsx`（`IconButton`） | `<TdtIconButton icon={IconCloseOutlineRegular} label="关闭"/>` | 5+ |
| 输入框 | `ui/Field.tsx` | `<TdtInput value={v} onChange={…} size="sm" error={bad}/>` | 3 套 + 3 原生 |
| 下拉 | `ui/Field.tsx`（包装官方 `Menu`） | `<TdtSelect options={…} value={v} onChange={…}/>` | 官方 2 + 自绘 1 + 原生 1 |
| 开关 | `ui/SwitchToggle.tsx` | `<TdtSwitch checked={on} onChange={…}/>` | 官方 4 + 覆写 2 处 |
| 日期 / 时间 | `ui/DateTime.tsx` | `<TdtDateField value={d} onChange={…}/>` | 各 1（全内联） |
| 卡 / 浮层 / Toast | `ui/controls-css.ts` + `ui/Toast.tsx` | `<TdtCard>` / `<FloatingToast tone="error" …/>` | 卡 2 套、Toast 已唯一 |

> 表外的控件一旦被写第二遍，就是本手册要拦住的事。

---

## 三、允许 / 禁止（带正反例）

### ✅ 允许

```tsx
// 用 ui/ 的组件 + 只调 props
<TdtSegmented size="sm" variant="default" items={tabs} value={tab} onChange={setTab}/>

// 布局用内联没问题，但数值必须来自 token（间距一律 --tdt-space-*）
<div style={{ display:'flex', gap:'var(--tdt-space-2)', marginTop:'var(--tdt-space-3)' }}>
```

### ❌ 禁止（逐条给出当前违规位置，便于对照修）

| 禁止 | 现状反例 |
|---|---|
| 在使用点写颜色 / 圆角 / 字号字面量 | P1a 已清掉主面板分段那处；仍存：`index.ts` 的 `iconButtonStyle` / `addButtonStyle`、`task-list.tsx` 的 `iconBtnStyle` / `panelBarStyle` 等内联字面量 |
| 在使用点写死高度 | `height:'26px'`（约 10 处）、段高 20/22/24/26/28 五种 |
| 直接引用宿主变量 | 业务文件里的 `var(--dsw-alias-…)`——必须改用 `var(--tdt-…)` |
| 自己写 `body[data-ds-dark-theme]` | `archive-session-css.ts:241,279,281,287,298,322,331`（7 处 ⇒ 收敛进 token 层） |
| 再抄一份 `C` 常量表 | 现存 3 份（`index.ts:143-160` / `task-list.tsx:68-83` / `editor-fields.tsx:39-59`） |
| 自己 `createElement('style')` 注入 | 现存 4 条注入、2 套 id 命名 ⇒ 统一走 `ui/style.ts` |
| 覆写官方件的观感（在使用点） | 「Switch 变绿」现在写了两遍（`task-editor-css.ts:31`、`task-list.tsx:125`）⇒ 归 `official-skins.ts` |
| 写死官方 CSS-module 类名 | 哈希会变；只能按元素 + role 选（`official-classes.ts`） |
| 硬编码 `#fff` / `rgba(0,0,0,.45)` | ✅ 段内角标已随 P1a 收敛（走 `--tdt-on-signal`）；仍存：保存钮 `config-panel.tsx:180`、遮罩 `task-list.tsx:755` |
| 混用**同义宿主变量** | `state-warn-primary`(2 处) 与 `state-warning-primary`(3 处) 并存 —— **已裁决：前者真、后者宿主无定义（死）**；`focus-ring-color`（真，但默认 `transparent`）与 `border-focus`（死）同理 ⇒ 一律由 token 层定一个名，见 [`external/dsh-capabilities.md`](external/dsh-capabilities.md) §3 |
| 注释与代码不一致 | `editor-fields.tsx:603-604` 写着 padding4/段高28，实际 padding6/段高24 ⇒ 改代码必须同步注释 |

---

## 四、主题（明暗）规则

1. **默认什么都不用做**：颜色引用 `--tdt-*`，而 `--tdt-*` 映射宿主 alias ⇒ 用户切「明色 / 暗色 / 跟随系统」时自动跟随（决策 26 修订确立的路线）。
2. **需要「反色面 / 固定中性色」时**：只在 `ui/tokens.ts` 加一条变量 + 一条 `body[data-ds-dark-theme]` 覆盖，**业务文件零改动**。
3. **不许用 `prefers-color-scheme`**（跟的是系统而不是用户在宿主里的选择——两者可以不一致）。
4. **对比度自检**：新控件必须在**暗色**下走查一遍（用户当前主题偏暗，暗色是主场景）。

---

## 五、要「多一档尺寸」或「多一个外观」怎么办

- **想要新的高度**：离散三档 `--tdt-control-h-sm`(24) / `-md`(28) / `-lg`(32)（lg=32 由用户 2026-10-01 拍板作为预估第三档）。
  需要再增一档 ⇒ 在 `tokens.ts` 加一条 `--tdt-control-h-xx`（一处，直绑宿主两主题变量），调用点用 `size="xx"` 选；**真不够用才允许在调用点本地覆盖 `--tdt-control-h-*` 这一个变量**，且须在本文档「已知例外」表记一条（组件 `style` 只许补布局、覆盖高度，不许另写结构）。
- **想要新的外观（variant）**：在 `controls-css.ts` 里加一个 variant 类，且**只允许覆盖 token 变量**（颜色），结构/尺寸/交互规则不许重写。
- **有边 / 无边必须等高**（2026-10-01 用户拍板）：带边框的 variant 必须在内部把 1px 边框吃掉（padding 相应减 1px，或改用 `box-sizing:border-box` + 固定 `height`），总高一律 = `--tdt-control-h-*`；边框不许额外撑高。`Segmented` 的 `default` 已按此把 padding 收到 2px，以后 `Button` / `Input` 的有边 / 无边同此规则。
- **想要新的控件**：按 §一 第三个分支，在 `ui/` 里建唯一实现，并在本手册 §二 表里加一行。
- **想要新的 token**（颜色 / 圆角 / 字号 / 间距 / 层级）：加进 `ui/tokens.ts` **一处**（命名 `--tdt-*`，映射宿主 alias 并留兜底值），同时在 [`ui-foundation.md`](ui-foundation.md) §四 的表里登记；**不许在使用点直接写 `var(--dsw-*)`**。

---

## 六、提交前自检（照抄执行）

1. `npm run build`（`dist/` 必须一起提交——本仓硬约定）。
2. `npm run typecheck` + `npm run smoke`（冒烟测的是 `dist/` 产物）。
3. 反例自查（比断言更硬，直接在仓库里搜）：
   - 业务文件（`task-list.tsx` / `task-editor.tsx` / `index.ts` / `config-panel.tsx` / `file-*.tsx`）里 `--dsw-alias-` 出现次数 = **0**；
   - 同上文件里 `body[data-ds-dark-theme]` = **0**；
   - 同上文件里 `borderRadius:` / `fontSize:` 字面量 = **0**（token 变量不算）。
4. 明色 + 暗色两个主题各走查一遍改动面。
5. 按 [`ui-foundation.md`](ui-foundation.md) §十「通用细则」核对：层级有没有写裸 z-index、可交互元素有没有可见焦点环、动画在 `prefers-reduced-motion` 下是否降级、纯图标按钮有没有标签、内容可变的面板有没有固定最大高度、空/载/错三态是否齐。
6. 回写 `PROGRESS.md`（现场）与 `worklog/<工作包>.md`（过程）。

---

## 七、已知坑（别说没提醒）

| 坑 | 事实 | 出处 |
|---|---|---|
| 官方件 className 覆盖面各不相同 | `Input`：`className` 落外层 `.wrap`、`style` 落内层 `<input>`；`Modal`：`className` 只落 `.dialog`，抬不了整层（编辑器因此故意不用官方 Modal） | `primitives.d.ts:172`、`task-editor.tsx:977-979` |
| 官方类名是哈希 | 不许写死，只能按元素 + `role` 选；`ocOr` 是「官方优先、缺失回退」二选一，容易写死规则 | `official-classes.ts:106-108,140-142`、`archive-session-css.ts:243-246` |
| 官方 `SegmentedControl` 指示器位置靠 CSS 变量算 | 外部改 padding 必须同步改 top/left/height/width 算式（脆弱）⇒ 新体系不覆写它，改自绘统一体 | `task-editor-css.ts:101-105` |
| 官方没有日期 / 时间选择器 | 只能自绘，但要走同一套 token 与皮肤命名 | `primitives.d.ts:158-159` |
| 样式注入顺序不保证 | 覆盖官方件时必须靠「元素 + role」提高特异性，不靠先后 | `task-editor-css.ts:30`、`task-list.tsx:124` |
| `import './x.css'` 在 client 产物里**不被加载** | client 是内核消费的 CJS 闭包 ⇒ CSS 只能运行时注入 `<style>`，不许改成 import | `task-editor-css.ts:3-4` |
| 同一个意思的宿主变量有两个名字 | `state-warning-primary` / `border-focus` **宿主根本无定义**（写它们只会拿兜底色、不随主题）；`focus-ring-color` 有定义但默认值是 `transparent`（`var()` 兜底不生效 ⇒ 焦点环会隐身） | [`external/dsh-capabilities.md`](external/dsh-capabilities.md) §3 §4 |
| 宿主自带字号体系 | **成立且成族**：`--dsw-font-{xxxs-11,xxs-12,xs-13,s-14,base-16,m-18,l-20,xl-24}` + `-strong-` 变体 + 子 token ⇒ **字号一律映射宿主 token，不要自己定 px 刻度** | theme `lib/client.js`（capabilities §2） |
| 「看着有、其实没有」的变量名 | 本仓已踩 5 处：`--dsw-alias-interactive-bg`、`--dsw-alias-border-focus`、`--dsw-alias-state-warning-primary`、`--dsh-elevation-prominent`、`--dsh-radius-panel` | [`external/dsh-capabilities.md`](external/dsh-capabilities.md) §4 |
| Tooltip 子元素必须是真 DOM | 裸函数组件 ref 挂不上 ⇒ 提示静默失效（踩过两次） | 决策 53 同轮口径 |

---

## 八、这份手册怎么维护

- **谁改基础层，谁改这份手册**（`ui/` 的公开面变了 ⇒ §二 表与 §三 清单同步更新）。
- 手册**不记进度**（进度看 [`../PROGRESS.md`](../PROGRESS.md)），也不记「为什么这么设计」（看 [`ui-foundation.md`](ui-foundation.md)）——避免两份副本。
- 每次真机踩到新的样式坑，加进 §七 表（一行：坑 / 事实 / 出处）。
