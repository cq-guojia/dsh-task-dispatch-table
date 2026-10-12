# 工作包：控件尺寸系统归一（sm24 / md28 / lg32，统一映射 + 修 +2）

> **状态**：✅ **完成封卷**（2026-10-01）
> **来源**：用户 2026-10-01 口述需求（「实际差 +2」对齐诉求 + 「所有输入走 32 标准」拍板）
> **配套**：[`design/ui-foundation.md`](../design/ui-foundation.md)（高度两档/三档抽象）· [`design/ui-style-guide.md`](../design/ui-style-guide.md)（控件唯一实现表）· 代码真源 `src/client/ui/controls-css.ts` / `tokens.ts`

---

## 一、需求原话（用户，逐字保留）

> 你那个滑篮的滑轨特别小呢……「实际差 +2」是什么意思啊？我要的是都对得齐的呀，为什么还有「实际差 +2」？
> 现在我想问你，所有 input 的大中小，也就是所谓的 MD、LG 这些东西，是不是要统一啊？input 的 MD 和 select 的 MD 是一样的呀，还是各自用各自的？
> 所有输入的地方走 32，走 32 标准。除了个别特殊的地方我会指定，比如这个地方太高了，要缩小，然后我们再去改小尺寸。
> 嗯，行，改吧。不用列个清单给我过目了，就直接改。改完了我们再去调，好吧。中间不要停下啊，直接改全，改好了再来给我汇报。

（过程中一度把用户说的「推」听成「退」，误 `git restore` 撤掉了改动；用户纠正后重做并 `commit + push`，commit `753bc96`。）

---

## 二、调研发现：为什么对不齐（每条有出处）

### 2.1 尺寸真源其实已经是对的

- `src/client/ui/tokens.ts:104-106` 早已定义三档：`--tdt-control-h-sm:24px` / `-md:28px` / `-lg:32px`。
- 所以「token 表」没问题，问题是**各控件没都吃这张表**，且有一处 CSS 写歪了。

### 2.2 滑轨（Segmented）的「+2 bug」（真源在 `controls-css.ts`）

- 段高公式按「上下各 2px padding + 1px 边框」减，即 `height:calc(var(--tdt-control-h-*) - 6px)`（`controls-css.ts` 段高三档）。
- 但容器当时写的是 `padding:3px`（default）+ `1px 边框`、inset `padding:4px`（无边框）：
  - default：`3+3 + 1+1 = 8px` → 外框比 token 多 **+2px**（如 `md` 渲染成 30 而非 28）；
  - inset：`4+4 = 8px` → 同样 **+2px**。
- 这是「实际差 +2」的唯一技术病根：滑轨标称 `md=28`，渲染却是 30，同排的 Input/Button（border-box 直接 28）就上下各冒 1px。

### 2.3 SelectField 的命名错位（真源在 `Field.tsx`）

- `SelectField` 的 `size` 与全局**错一位**：`size:'sm'` → `var(--tdt-control-h-md)=28`、`size:'md'`(默认) → `var(--tdt-control-h-lg)=32`、且**没有 24 这一档**（`Field.tsx` `SelectFieldProps.size` 与 `compact` 分支）。
- 全仓 14 处调用实测：11 处不传 size（=32）、3 处传 `size:'sm'`（=28：window / 列表记录状态 / 列表日志条数）、0 处是 24。
- 后果：想让某个下拉和 24px 输入框同排，在 SelectField 里做不到（它最小「sm」已是 28）。

### 2.4 Button / Input / 日期时间 缺 `lg` 档

- `ButtonSize` / `FieldSize` 当时只有 `sm | md`，无 `lg`；`IconButton` 同理；`DateField`/`TimeField` 锚点写死 `height:var(--tdt-control-h-lg)` 且无 `size` 轴（`controls-css.ts` `.dsh-tdt-dtf`）。

**结论**：除滑轨+2 与 SelectField 错位，其余控件（Input/Button/图标钮/数字框/滑轨内段）其实都守 `24/28/32`；缺的是统一的 `lg` 入口 + 把默认基线抬到 32。

---

## 三、拍板原则（用户 2026-10-01）

1. **一套尺寸表，全局唯一真源**：`sm=24 / md=28 / lg=32`，任何控件不得私自改映射；`Input.md` 必须等于 `Select.md`（=28）。
2. **默认走 `lg=32`（32 标准行）**：全站控件默认 `size` 落 `lg`，需要缩小由调用点显式传 `md`(28) / `sm`(24)；「个别太高」是例外覆盖，不是常态。
3. 滑轨「纯黑面 / 灰底面」两套保留、不合并（沿用 2026-10-01 早前拍板）。

---

## 四、本轮产出（落码）

| 文件 | 动作 |
|---|---|
| `src/client/ui/controls-css.ts` | 滑轨 `default` `padding:3px→2px`、`inset` `padding:4px→3px`（外框严格 == token）；新增 `.dsh-tdt-btn--lg` / `.dsh-tdt-iconbtn--lg` / `.dsh-tdt-input--lg` / `.dsh-tdt-pfx--lg` / `.dsh-tdt-num--lg`；新增 `.dsh-tdt-dtf--sm/md/lg` 三档 |
| `src/client/ui/Button.tsx` | `ButtonSize` 补 `'lg'`；`Button` / `IconButton` 默认 `size` 改 `'lg'` |
| `src/client/ui/Field.tsx` | `FieldSize` 补 `'lg'`、`sizeClass` 支持 lg；`Input` / `PrefixedInput` / `NumberInput` 默认 `size` 改 `'lg'`；`SelectField` 尺寸按统一表映射（`sm24/md28/lg32`，默认 `lg`），删 `compact` 分支 |
| `src/client/ui/Segmented.tsx` | 默认 `size` 改 `'lg'` |
| `src/client/ui/DateTime.tsx` | `DateField` / `TimeField` 加 `size` 轴（默认 `lg`），锚点挂 `--{size}` 修饰类 |
| `scripts/smoke.mjs` | `[16]` 节「有边/无边等高」断言同步为新几何（`padding:2px` / `padding:3px`，外框 == token） |

### 4.1 视觉差异（刻意收口，逐项可对照）

| 控件 | 之前 | 现在 | 差异 |
|---|---|---|---|
| 滑轨外框 | `sm26 / md30 / lg34`（多 +2） | `sm24 / md28 / lg32`（== token） | 各档矮 2px，同排 Input/Button 严丝合缝 |
| 下拉（11 处不传 size） | 32（但写成 `md`） | 32（写成 `lg`，语义转正） | 高度不变；命名归位统一表 |
| 下拉（3 处传 `sm`） | 28（错位映射） | **24**（统一表 `sm`） | 矮 4px —— 见 §五 未决 |
| Button / Input / 图标钮 / 数字框 / 日期时间 | 默认 24（sm） | 默认 32（lg） | 全站基线抬到 32；「太高」处由调用点传 `md`/`sm` 缩小 |

### 4.2 验收

- `npm run build`（含 `dist/`）✅ · `npm run typecheck` ✅ · `npm run smoke` **390 项全过、0 失败**（原 389 + 同步新几何那 1 项）。
- **真机复验点**（装新 `dist/` 实测）：同一行里混用 Input / Select / Button / 滑轨，同档（全 `lg`）高度零误差；滑轨外框不再上下冒 1px。

---

## 五、未决 / 留给用户「去调」

1. **3 个下拉传了 `size:'sm'`**（window、列表记录状态、列表日志条数）现在渲染 24（原错位时是 28）。想跟 32 标准行齐就去掉 `size`；想留 24 不动。
2. 默认全变 32 后整站基线更高；哪个地方用户觉得太高，直接传 `size:'md'`(28) 或 `'sm'`(24) 缩小——这是用户拍板的「个别指定」工作流，不在此包内预决。
3. `Switch`（官方原生开关）不在本套 token 管控内，高度由浏览器决定；若要和同行严格齐高需单独包一层锁高（本包未做，属另一议题）。

---

## 六、回写说明

- 本包改的是「调用默认值 + 一处 CSS 写歪 + 一处映射错位」，未引入新的尺寸语义；`24/28/32` 仍是 `tokens.ts` 那一处真源。
- 冒烟断言是回归防线，本次把「旧几何 3px/4px」的断言同步为「新几何 2px/3px」，否则会误报失败。
