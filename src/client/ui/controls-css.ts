/**
 * L2 组件皮肤：公用控件规则（一类控件**唯一实现**）
 *
 * 规矩（docs/design/ui-style-guide.md §三）：
 *  - **只消费 `var(--tdt-*)`**，一个颜色 / 尺寸 / 圆角 / 字号字面量都不许出现；
 *  - 结构、尺寸、交互规则只此一份；「外观差异」只允许靠**覆盖一两个变量**表达（本文件的 `--seg-*`）；
 *  - 高度只取 `--tdt-control-h-sm` / `-md` / `-lg` 三档（段高 = 控件总高 − 6px：上下 padding 2px×2 + 描边 1px×2；真不够用才在调用点本地覆盖 `--tdt-control-h-*`，属例外）。
 *
 * 分期：P1 只有分段控件（滑动块）；P2 按钮 / P3 输入下拉 / P4 开关日期时间会往本文件追加，
 * 追加时保持「一段一控件、段头写清哪一期」的写法。
 */
import { applyStyle } from './style'

/** 分段控件的皮肤规则（P1）。 */
export const SEGMENTED_CSS = `
/* ── 分段控件（滑动块）P1 ────────────────────────────────────────────────
   结构一套 + 两个受控轴：size(sm|md|lg) × variant(default|inset)。
   变体**只覆盖两个颜色变量**（--seg-track 轨道底 / --seg-thumb 选中块），
   这正是「同一份样式、只重载颜色」的落地形态。 */
/* 两套基础样式（2026-10-01 用户拍板：保留「纯黑面」与「灰底面」两套，不可合并）：
   - default = 纯黑面：轨道=第二层面 + 外描边，选中=亮片底；
   - inset = 灰底面：抄「版本」开关观感（轨道=交互灰 hover 底、无外描边、选中=亮片底），用户觉得比原灰底那套好看。
   ⚠️ 高度对齐规则（2026-10-01 用户拍板，同日修正 +2）：有边 / 无边总高必须 == 控件 token，边框在内部补回，不许额外撑高。
   几何 = 段高 = token − 6px（上下各 2px padding + 1px 边框）；default 真边框 1px + padding 2px，
   inset 无边框故 padding 收 3px 把缺的 1px 补回，两种外观总高都 == token（24/28/32），不再多 +2px。
   以后 Button / Input 的有边 / 无边同此规则。 */
.dsh-tdt-seg{display:inline-flex;align-items:center;gap:2px;padding:2px;border-radius:var(--tdt-radius-md);background:var(--seg-track);}
.dsh-tdt-seg--default{--seg-track:var(--tdt-surface-2);--seg-thumb:var(--tdt-surface-raised);border:1px solid var(--tdt-border);}
.dsh-tdt-seg--inset{--seg-track:var(--tdt-hover);--seg-thumb:var(--tdt-surface-raised);border:0;padding:3px;}

.dsh-tdt-seg__item{appearance:none;display:inline-flex;align-items:center;gap:4px;box-sizing:border-box;
  height:calc(var(--tdt-control-h-sm) - 6px);padding:0 12px;border:0;border-radius:var(--tdt-radius-sm);
  background:transparent;color:var(--tdt-fg-2);font-family:inherit;font-size:var(--tdt-font-sm);line-height:var(--tdt-line-sm);
  font-weight:400;white-space:nowrap;cursor:pointer;
  transition:color var(--tdt-dur-fast) var(--tdt-ease),background-color var(--tdt-dur-fast) var(--tdt-ease),box-shadow var(--tdt-dur-fast) var(--tdt-ease);}
.dsh-tdt-seg--md .dsh-tdt-seg__item{height:calc(var(--tdt-control-h-md) - 6px);}
.dsh-tdt-seg--lg .dsh-tdt-seg__item{height:calc(var(--tdt-control-h-lg) - 6px);}
.dsh-tdt-seg__item:hover:not([aria-pressed='true']):not(:disabled){color:var(--tdt-fg);}
.dsh-tdt-seg__item[aria-pressed='true']{background:var(--seg-thumb);box-shadow:var(--tdt-shadow-raised);color:var(--tdt-fg);font-weight:600;}
.dsh-tdt-seg__item:focus-visible{outline:2px solid var(--tdt-focus);outline-offset:-2px;}
.dsh-tdt-seg__item:disabled{cursor:default;opacity:.4;}

/* 段内角标（如「异常」的数量）：语义色实面 + 反白字，0 由组件侧不渲染。
   ⚠️ **必须是正圆**（用户 2026-10-03：「多位数给它撑开了，那不是圆的就没办法了」）：
   固定 16×16 + border-radius:50% + padding:0 + overflow:hidden ⇒ 一位数 / 两位数都是同一个圆，
   数字缩到 10px 塞得下；不再用 min-width + 左右 padding（那会让宽度随位数增长变椭圆）。 */
.dsh-tdt-seg__badge{display:inline-flex;align-items:center;justify-content:center;flex:none;
  width:16px;height:16px;padding:0;overflow:hidden;
  border-radius:50%;background:var(--tdt-danger);color:var(--tdt-on-signal);
  font-size:10px;line-height:16px;font-weight:500;font-variant-numeric:tabular-nums;}

/* block：撑满父宽（表单行用），各段等分 */
.dsh-tdt-seg--block{display:flex;width:100%;}
.dsh-tdt-seg--block .dsh-tdt-seg__item{flex:1 1 auto;justify-content:center;}

/* weekday：星期多选方块（任务新增 / 编辑页）。基础插件的特殊化定制（用户 2026-10-01 明确要求：
   原 WeekdayPicker 即「蓝底 + 近似方形」，统一到 Segmented 后由这一修饰类补回两处差异）：
   - 每格做成正方形（宽 = 段高）；
   - 选中态用品牌蓝（--tdt-business）、反白字，轨道用 hover 灰（与原自绘轨道一致）。
   皮肤集中在此、不内联；调用点只挂 .dsh-tdt-seg--weekday 一个修饰类，符合「皮肤只在 controls-css」的规矩。 */
.dsh-tdt-seg--weekday{--seg-track:var(--tdt-hover);}
.dsh-tdt-seg--weekday .dsh-tdt-seg__item{width:calc(var(--tdt-control-h-lg) - 6px);padding:0;justify-content:center;}
.dsh-tdt-seg--weekday .dsh-tdt-seg__item[aria-pressed='true']{background:var(--tdt-business);color:var(--tdt-fg-inverse);box-shadow:var(--tdt-shadow-raised);}

@media (prefers-reduced-motion: reduce){.dsh-tdt-seg__item{transition:none;}}
`

/** 按钮 / 图标钮的皮肤规则（P2）。 */
export const BUTTON_CSS = `
/* ── 按钮 / 图标钮 P2 ───────────────────────────────────────────────────
   与 Segmented 同一条高度纪律：--tdt-control-h-sm(24) / -md(28) / -lg(32)，
   有边框的 variant 用 1px 真边框 + 内部 padding 补回，**有边 / 无边同高**。
   variant 只换颜色，结构 / 尺寸 / 交互只此一份。 */
.dsh-tdt-btn{appearance:none;display:inline-flex;align-items:center;justify-content:center;gap:var(--tdt-space-1);
  box-sizing:border-box;border:1px solid transparent;border-radius:var(--tdt-radius-md);
  background:transparent;color:var(--tdt-fg);font-family:inherit;font-weight:500;white-space:nowrap;cursor:pointer;
  transition:background-color var(--tdt-dur-fast) var(--tdt-ease),border-color var(--tdt-dur-fast) var(--tdt-ease),color var(--tdt-dur-fast) var(--tdt-ease),opacity var(--tdt-dur-fast) var(--tdt-ease);}
.dsh-tdt-btn--sm{height:var(--tdt-control-h-sm);padding:0 10px;font-size:var(--tdt-font-sm);line-height:var(--tdt-line-sm);}
.dsh-tdt-btn--md{height:var(--tdt-control-h-md);padding:0 12px;font-size:var(--tdt-font-md);line-height:var(--tdt-line-md);}
.dsh-tdt-btn--lg{height:var(--tdt-control-h-lg);padding:0 14px;font-size:var(--tdt-font-md);line-height:var(--tdt-line-md);}
.dsh-tdt-btn__icon{display:inline-flex;align-items:center;flex:none;}

.dsh-tdt-btn--primary{background:var(--tdt-accent);color:var(--tdt-fg-inverse);}
.dsh-tdt-btn--primary:hover:not(:disabled){opacity:.9;}
.dsh-tdt-btn--outline{background:var(--tdt-surface-1);border-color:var(--tdt-border-strong);color:var(--tdt-fg);}
.dsh-tdt-btn--outline:hover:not(:disabled){background:var(--tdt-hover);}
.dsh-tdt-btn--ghost{color:var(--tdt-fg-2);}
.dsh-tdt-btn--ghost:hover:not(:disabled){background:var(--tdt-hover);color:var(--tdt-fg);}
.dsh-tdt-btn--danger{background:var(--tdt-danger);color:var(--tdt-on-signal);}
.dsh-tdt-btn--danger:hover:not(:disabled){opacity:.9;}
/* danger-ink：红字描边（破坏性次要操作，如卡片上的「删除」），挂与 outline 组合的修饰类 */
.dsh-tdt-btn--danger-ink{border-color:var(--tdt-danger);color:var(--tdt-danger);}
.dsh-tdt-btn--danger-ink:hover:not(:disabled){background:color-mix(in srgb,var(--tdt-danger) 10%,transparent);color:var(--tdt-danger);}
/* link：行内文字链接型（会话 / 产出文件名），无底无边、品牌蓝、hover 下划线 */
.dsh-tdt-btn--link{height:auto;padding:0;border:0;background:none;color:var(--tdt-link);font-weight:400;text-align:left;}
.dsh-tdt-btn--link:hover:not(:disabled){background:none;color:var(--tdt-link);text-decoration:underline;}
.dsh-tdt-btn:focus-visible{outline:2px solid var(--tdt-focus);outline-offset:2px;}
.dsh-tdt-btn:disabled{cursor:default;opacity:.5;}

.dsh-tdt-iconbtn{appearance:none;display:inline-flex;align-items:center;justify-content:center;box-sizing:border-box;
  border:1px solid transparent;border-radius:var(--tdt-radius-sm);background:transparent;color:var(--tdt-fg-2);
  font-family:inherit;cursor:pointer;flex:none;
  transition:background-color var(--tdt-dur-fast) var(--tdt-ease),border-color var(--tdt-dur-fast) var(--tdt-ease),color var(--tdt-dur-fast) var(--tdt-ease),opacity var(--tdt-dur-fast) var(--tdt-ease);}
.dsh-tdt-iconbtn--sm{width:var(--tdt-control-h-sm);height:var(--tdt-control-h-sm);font-size:var(--tdt-font-sm);}
.dsh-tdt-iconbtn--md{width:var(--tdt-control-h-md);height:var(--tdt-control-h-md);font-size:var(--tdt-font-md);}
.dsh-tdt-iconbtn--lg{width:var(--tdt-control-h-lg);height:var(--tdt-control-h-lg);font-size:var(--tdt-font-md);}
.dsh-tdt-iconbtn--plain{color:var(--tdt-fg-2);}
.dsh-tdt-iconbtn--outline{background:var(--tdt-surface-1);border-color:var(--tdt-border);color:var(--tdt-fg-2);}
.dsh-tdt-iconbtn--danger{color:var(--tdt-danger);}
.dsh-tdt-iconbtn:hover:not(:disabled){background:var(--tdt-hover);color:var(--tdt-fg);}
.dsh-tdt-iconbtn--danger:hover:not(:disabled){background:var(--tdt-hover);color:var(--tdt-danger);}
.dsh-tdt-iconbtn:focus-visible{outline:2px solid var(--tdt-focus);outline-offset:2px;}
.dsh-tdt-iconbtn:disabled{cursor:default;opacity:.4;}

/* ── 产出物「图标 chip」P2：28×28 方角小底板 + 官方文件类型图标 ──────────────
   用途：产出物列表里**只给图标**的小按钮（卡片「执行记录」面板、执行记录总查询页、展开区都挂它）。
   ⚠️ 底板**必须走 class**——inline background 会盖掉 :hover（用户 2026-10-03 踩过）。
   hover 用 「--tdt-chip-bg-hover」：浅色更深、暗色更亮（两端都是「更明显」）；不许拿
   「--tdt-plate-hover」 顶——暗色下反而更淡，鼠标移上去底板就消失了。
   ✅ **全站唯一实现**（2026-10-04 收编）：此前卡片面板与执行记录页各写一份**同名不同皮**的
   「.dsh-tdt-rec-out」，两份 CSS 都注入同一页面 ⇒ 谁后注册谁生效、互相污染；现已收成这一份。 */
.dsh-tdt-chip{appearance:none;-webkit-appearance:none;box-sizing:border-box;display:inline-flex;align-items:center;justify-content:center;
  width:var(--tdt-control-h-md);height:var(--tdt-control-h-md);padding:0;border:none;border-radius:var(--tdt-radius-sm);
  background:var(--tdt-chip-bg);color:var(--tdt-fg-2);font-family:inherit;line-height:0;cursor:pointer;
  transition:background-color var(--tdt-dur) var(--tdt-ease),color var(--tdt-dur) var(--tdt-ease);}
.dsh-tdt-chip:hover:not(:disabled){background:var(--tdt-chip-bg-hover);}
.dsh-tdt-chip:focus-visible{outline:2px solid var(--tdt-focus);outline-offset:1px;}
/* 不可点（没有会话 / 预览面未就位）：去掉底板与手指，别给假入口 */
.dsh-tdt-chip:disabled{cursor:default;background:transparent;color:var(--tdt-fg-3);}
/* 文字型 chip（「…」 / 「+N」）：不固定方宽，按内容撑开 */
.dsh-tdt-chip--label{width:auto;padding:0 6px;font-size:var(--tdt-font-md);line-height:var(--tdt-line-md);}

@media (prefers-reduced-motion: reduce){.dsh-tdt-btn,.dsh-tdt-iconbtn,.dsh-tdt-chip{transition:none;}}
`

/** 输入 / 前缀输入 / 数字步进的皮肤规则（P3）。 */
export const FIELD_CSS = `
/* ── 输入类 P3 ────────────────────────────────────────────────────────── */
.dsh-tdt-input{box-sizing:border-box;border:1px solid var(--tdt-border);border-radius:var(--tdt-radius-md);
  background:var(--tdt-surface-1);color:var(--tdt-fg);font-family:inherit;outline:none;
  transition:border-color var(--tdt-dur-fast) var(--tdt-ease),box-shadow var(--tdt-dur-fast) var(--tdt-ease);}
.dsh-tdt-input--sm{height:var(--tdt-control-h-sm);padding:0 8px;font-size:var(--tdt-font-sm);line-height:var(--tdt-line-sm);}
.dsh-tdt-input--md{height:var(--tdt-control-h-md);padding:0 10px;font-size:var(--tdt-font-md);line-height:var(--tdt-line-md);}
.dsh-tdt-input--lg{height:var(--tdt-control-h-lg);padding:0 12px;font-size:var(--tdt-font-md);line-height:var(--tdt-line-md);}
.dsh-tdt-input::placeholder{color:var(--tdt-fg-dim);}
.dsh-tdt-input:focus{border-color:var(--tdt-focus);box-shadow:0 0 0 1px var(--tdt-focus);}
.dsh-tdt-input--error{border-color:var(--tdt-danger);}
.dsh-tdt-input:disabled{cursor:default;opacity:.5;}

.dsh-tdt-pfx{display:inline-flex;align-items:center;box-sizing:border-box;overflow:hidden;
  border:1px solid var(--tdt-border);border-radius:var(--tdt-radius-md);background:var(--tdt-surface-1);color:var(--tdt-fg);}
.dsh-tdt-pfx--sm{height:var(--tdt-control-h-sm);}
.dsh-tdt-pfx--md{height:var(--tdt-control-h-md);}
.dsh-tdt-pfx--lg{height:var(--tdt-control-h-lg);}
/* md / lg 档字号跟档走（与同档下拉同字号）：此前写死 sm(12px)，同排下拉是 13px ⇒ 显得「input 字小」。 */
.dsh-tdt-pfx--md .dsh-tdt-pfx__label,.dsh-tdt-pfx--lg .dsh-tdt-pfx__label{font-size:var(--tdt-font-md);line-height:var(--tdt-line-md);}
.dsh-tdt-pfx--md .dsh-tdt-pfx__input,.dsh-tdt-pfx--lg .dsh-tdt-pfx__input{font-size:var(--tdt-font-md);line-height:var(--tdt-line-md);}
.dsh-tdt-pfx--error{border-color:var(--tdt-danger);}
.dsh-tdt-pfx:focus-within{border-color:var(--tdt-focus);box-shadow:0 0 0 1px var(--tdt-focus);}
.dsh-tdt-pfx__label{padding:0 8px;color:var(--tdt-fg-2);font-size:var(--tdt-font-sm);line-height:var(--tdt-line-sm);white-space:nowrap;border-right:1px solid var(--tdt-border);}
.dsh-tdt-pfx__input{flex:1 1 auto;min-width:0;height:100%;padding:0 8px;border:0;background:transparent;color:var(--tdt-fg);
  font-family:inherit;font-size:var(--tdt-font-sm);line-height:var(--tdt-line-sm);outline:none;}
.dsh-tdt-pfx__input::placeholder{color:var(--tdt-fg-dim);}

.dsh-tdt-num{display:inline-flex;align-items:center;box-sizing:border-box;overflow:hidden;
  border:1px solid var(--tdt-border);border-radius:var(--tdt-radius-md);background:var(--tdt-surface-1);color:var(--tdt-fg);}
.dsh-tdt-num--sm{height:var(--tdt-control-h-sm);}
.dsh-tdt-num--md{height:var(--tdt-control-h-md);}
.dsh-tdt-num--lg{height:var(--tdt-control-h-lg);}
.dsh-tdt-num--md .dsh-tdt-num__input,.dsh-tdt-num--lg .dsh-tdt-num__input{font-size:var(--tdt-font-md);line-height:var(--tdt-line-md);}
.dsh-tdt-num--md .dsh-tdt-num__suffix,.dsh-tdt-num--lg .dsh-tdt-num__suffix{font-size:var(--tdt-font-md);}
.dsh-tdt-num--disabled{opacity:.5;}
.dsh-tdt-num__input{width:36px;height:100%;padding:0 2px;border:0;background:transparent;color:var(--tdt-fg);
  font-family:inherit;font-size:var(--tdt-font-sm);line-height:var(--tdt-line-sm);text-align:center;outline:none;}
.dsh-tdt-num__suffix{padding:0 6px;color:var(--tdt-fg-2);font-size:var(--tdt-font-sm);white-space:nowrap;}
.dsh-tdt-num .dsh-tdt-iconbtn{border-radius:0;color:var(--tdt-fg-2);}

/* 官方 Switch 包装统一：选中 = success 绿。
   （合并原先 task-editor-css / task-list 两处就地覆盖；选择器带包装类 + role，特异性高于官方。） */
.dsh-tdt-switch button[role='switch'][aria-checked='true']{background:var(--tdt-success);}

@media (prefers-reduced-motion: reduce){.dsh-tdt-input,.dsh-tdt-pfx{transition:none;}}
`

/** 日期 / 时间的皮肤规则（P4）。 */
export const DATETIME_CSS = `
/* ── 日期 / 时间 P4 ───────────────────────────────────────────────────── */
.dsh-tdt-dtf-wrap{display:inline-flex;position:relative;min-width:0;}
/* ⚠️ 边框粗细 / 圆角必须与下拉锚点（dsh-tdt-ed-field 的 fieldButtonStyle）完全一致
   （用户 2026-10-02 点名：同排的日期框与下拉框看着不是一套）⇒ 这里也是 0.5px + radius-md。 */
.dsh-tdt-dtf{display:inline-flex;align-items:center;gap:6px;box-sizing:border-box;height:var(--tdt-control-h-lg);
  min-width:0;max-width:100%;padding:0 8px;border:0.5px solid var(--tdt-border-heavy);border-radius:var(--tdt-radius-md);
  background:var(--tdt-surface-1);color:var(--tdt-fg);font:inherit;font-size:var(--tdt-font-md);line-height:var(--tdt-line-md);
  cursor:pointer;transition:background-color var(--tdt-dur-fast) var(--tdt-ease),border-color var(--tdt-dur-fast) var(--tdt-ease);}
/* 日期 / 时间锚点：三档高度（默认 lg=32）。base 已含 lg 高度作兜底，下面三档按 size 覆盖。 */
.dsh-tdt-dtf--sm{height:var(--tdt-control-h-sm);padding:0 6px;font-size:var(--tdt-font-sm);line-height:var(--tdt-line-sm);}
.dsh-tdt-dtf--md{height:var(--tdt-control-h-md);padding:0 8px;font-size:var(--tdt-font-md);line-height:var(--tdt-line-md);}
.dsh-tdt-dtf--lg{height:var(--tdt-control-h-lg);padding:0 8px;font-size:var(--tdt-font-md);line-height:var(--tdt-line-md);}
.dsh-tdt-dtf:hover:not(:disabled){background:var(--tdt-hover);}
.dsh-tdt-dtf:focus-visible{outline:2px solid var(--tdt-focus);outline-offset:2px;}
.dsh-tdt-dtf:disabled{cursor:not-allowed;opacity:.6;}
.dsh-tdt-dtf__label{flex:1 1 auto;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;text-align:left;}
.dsh-tdt-dtf__label--ph{color:var(--tdt-fg-dim);}
.dsh-tdt-dtf__icon{display:inline-flex;width:16px;height:16px;align-items:center;justify-content:center;flex:none;color:var(--tdt-fg-3);}

.dsh-tdt-layer{position:fixed;z-index:var(--tdt-z-menu);box-sizing:border-box;padding:8px;background:var(--tdt-surface-1);
  box-shadow:var(--tdt-shadow-2);border-radius:var(--tdt-radius-md);color:var(--tdt-fg);font-size:var(--tdt-font-md);}

.dsh-tdt-cal__head{display:flex;align-items:center;justify-content:space-between;gap:4px;margin-bottom:4px;}
.dsh-tdt-cal__title{flex:1 1 auto;text-align:center;font-size:var(--tdt-font-md);font-weight:600;color:var(--tdt-fg);}
.dsh-tdt-cal__grid{display:grid;grid-template-columns:repeat(7,32px);gap:2px;}
.dsh-tdt-cal__weekday{height:24px;display:flex;align-items:center;justify-content:center;font-size:var(--tdt-font-sm);color:var(--tdt-fg-3);}
.dsh-tdt-cal__cell{width:32px;height:32px;padding:0;display:flex;align-items:center;justify-content:center;
  border:1px solid transparent;border-radius:var(--tdt-radius-md);background:transparent;color:var(--tdt-fg);
  font:inherit;font-size:var(--tdt-font-md);cursor:pointer;
  transition:background-color var(--tdt-dur-fast) var(--tdt-ease),color var(--tdt-dur-fast) var(--tdt-ease);}
.dsh-tdt-cal__cell--hover{background:var(--tdt-hover);}
.dsh-tdt-cal__cell--out{color:var(--tdt-fg-dim);}
.dsh-tdt-cal__cell--today{border-color:var(--tdt-business);}
.dsh-tdt-cal__cell[aria-pressed='true']{background:var(--tdt-accent);color:var(--tdt-fg-inverse);}
.dsh-tdt-cal__foot{margin-top:6px;padding-top:6px;border-top:1px solid var(--tdt-border);}

.dsh-tdt-time__cols{display:flex;gap:4px;}
.dsh-tdt-time__list{width:56px;max-height:196px;overflow-y:auto;display:flex;flex-direction:column;gap:2px;}
.dsh-tdt-time__opt{padding:5px 0;border:0;border-radius:var(--tdt-radius-sm);background:transparent;color:var(--tdt-fg-2);
  font:inherit;font-size:var(--tdt-font-md);cursor:pointer;transition:background-color var(--tdt-dur-fast) var(--tdt-ease),color var(--tdt-dur-fast) var(--tdt-ease);}
.dsh-tdt-time__opt[aria-selected='true']{background:var(--tdt-hover);color:var(--tdt-fg);font-weight:600;}
.dsh-tdt-time__foot{display:flex;align-items:center;justify-content:space-between;gap:8px;margin-top:6px;padding-top:6px;border-top:1px solid var(--tdt-border);}

@media (prefers-reduced-motion: reduce){.dsh-tdt-dtf,.dsh-tdt-cal__cell,.dsh-tdt-time__opt{transition:none;}}
`

/** 下拉锚点 / 跑马灯的皮肤规则（P6：原 editor-fields 内联 + task-editor-css 迁入基础层）。 */
export const SELECT_CSS = `
/* 下拉 / 日历 / 时分锚点：键盘可达性描边 + 校验描红（类名从业务层沿用，皮肤归位基础层） */
.dsh-tdt-ed-field:focus-visible{outline:2px solid var(--tdt-business);outline-offset:1px;}
.dsh-tdt-ed-field--error{border-color:var(--tdt-danger)!important;box-shadow:0 0 0 1px var(--tdt-danger);}
/* 整行下拉：官方 Menu 的包装 span 是 inline-flex（shrink-to-fit），要连它一起撑满 */
.dsh-tdt-ed-selectwrap{width:100%;}

/* 省略号三件套（ui-style-guide §三「待抽象 #1」的收敛点）：**新代码一律挂这个类**，不再各写一遍。
   ⚠️ 已有 19 处旧写法待逐步收编（2026-10-04 起新增的调用点不许再手写这三条属性）。 */
.dsh-tdt-ellipsis{overflow:hidden;text-overflow:ellipsis;white-space:nowrap;}

/* 跑马灯文本（MarqueeText）：双层——外层只裁剪，内层才 transform 滚动；非 hover 内层自带省略号 */
.dsh-tdt-mq{display:block;overflow:hidden;white-space:nowrap;}
.dsh-tdt-mq .dsh-tdt-mq-in{display:inline-block;white-space:nowrap;max-width:100%;overflow:hidden;text-overflow:ellipsis;vertical-align:top;}
/* ⚠️ 跑法（用户 2026-10-03 拍板）：**跑一遍、停在尾字**（播放 1 次 + forwards），不来回弹、不无限跑。
   滚距 = 精确溢出量 ⇒ 停下时最后一个字正好贴右缘，**不会跑进黑块**（黑块是旧手写版把
   内层盒子裁了、按「半截文本」平移导致的）。鼠标移开 ⇒ :hover 失效 ⇒ 自动复位回省略号态。 */
.dsh-tdt-mq-run:hover .dsh-tdt-mq-in{max-width:none;overflow:visible;animation:dsh-tdt-mq-scroll var(--dsh-tdt-mq-dur,6s) linear .4s 1 forwards;}
@keyframes dsh-tdt-mq-scroll{from{transform:translateX(0)}to{transform:translateX(var(--dsh-tdt-mq-dist,-40px))}}
`

/** 控件皮肤域的固定名（注入顺序在 tokens 之后）。 */
export const CONTROLS_DOMAIN = 'controls'

/**
 * 确保控件皮肤已登记并注入（幂等；组件渲染时调用一次即可）。
 */
export function ensureControlsStyle(): void {
  applyStyle(CONTROLS_DOMAIN, SEGMENTED_CSS + BUTTON_CSS + FIELD_CSS + DATETIME_CSS + SELECT_CSS)
}
