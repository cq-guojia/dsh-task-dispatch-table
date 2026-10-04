// records-timeline.tsx — 执行记录总查询页（流水账）
//
// 形态：查**全部任务**的执行流水账（`task_instances` 全表），按天分组、整体倒序。
// 规格 = docs/design/features/execution-timeline.md；过程 = docs/worklog/execution-timeline.md。
//
// ⚠️ 与「卡片展开区的单任务执行记录面板」是两个功能（流水账 vs 表格、全量 vs 单任务），别混。
//
// 版式（2026-10-04 第四版打磨，逐条按用户原话）：
//   ① 过滤行照任务列表：**左侧分段控件**四档（全部 / 成功 / 失败 / 运行中），右侧时间范围 + 工作区 + 任务；
//   ② **没有外框**、**没有竖轴**：整页铺在宿主面板底上，靠一条条自带底色的**独立块**建立节奏（块间 4px）；
//   ③ 日期 = 一行**小字**：时钟图标 + 「2026 年 10 月 30 日」· 星期几 ·「8 条」（不吸顶）；
//   ④ 块 = 左缘 **5px 方角状态色竖条**（通高、贴左缘）+ **同色系很浅的透明底**，留白放宽
//      （上/下/右 12、左 16，落在**头部**上）；**三层结构照任务卡片**：容器不可点 →
//      **头部可点**（hover 变色 + 手指 + 「有选中文字就不展开」的复制守卫）→ 展开区不可点（内容可复制）；
//      **块内左右两列**：左列标题（紧跟前置圈码）+ 下面那排信息，右列一排控件；
//   ⑤ 左列：第 1 行名称；第 2 行信息**单行 + 溢出省略**：工作区 · 🕰计划 · 🕐实际 · ⟳时长 · Token
//      （三个字段各带小图标；时间只到分钟，**跨天的时刻显式标注**前一天 / 次日 / M 月 D 日）；
//      失败 / 未执行有原因时补一行备注（跨整块）；
//   ⑥ 右列（用户 2026-10-04：「右边不要放两行，就几个按钮」）＝ 产出物图标（**只给图标**，≤3 + `+N`）
//      → 「查看会话」按钮 → 展开箭头（**基础层 IconButton**，与任务配置卡片的箭头同一份实现）；
//      **成败不用图标也再无状态文字**：底色 + 竖条即表达，状态名挂在竖条的悬停提示上；
//      前置 = 名字后的**圈码**（本次执行实际用到的上游，悬停显示「前置任务 N：名」）+ 展开区**第二排**清单
//      （一排两个：圈码 + 任务名 /「执行于 <全量时刻>」+ 查看会话）；
//   ⑦ 点头部 = **就地展开**（手风琴单开）：产出物清单**与「任务配置 → 附件区」同款**（行内并排、
//      限宽 40ch、超长跑马灯，可点开预览；无产出则不占行）
//      + 该次执行的**事件流水**（`fetchEvents(instanceId)`，左上角小标题「执行日志」）；
//      **只有点「查看会话」才开会话**。
//
// 取数：主列表只走 `GET /tasks/instances`（`fetchInstances`），游标分页 + 服务端排序
// （`scheduled_at DESC, id DESC`），客户端不二次排序；展开区另走 `GET /tasks/events?instanceId=`。
// 分页状态机的四条硬规矩（评审定的，改版式时逐条保留）：
//   ① 2000 上限**只拦续拉**（首屏永远允许取）⇒ 满额后改过滤不会白屏；
//   ② 续拉失败给提示 + 重试，并**暂停自动续拉**（否则哨兵把失败刷成重试风暴）；
//   ③ `IntersectionObserver` **只建一次**（最新逻辑走 ref）；
//   ④ 请求序号作废旧响应 + 失败不清空已有列表。
import { createElement as h, memo, useCallback, useEffect, useMemo, useRef, useState, type CSSProperties } from 'react'
import {
  FileTypeIcon, IconAlarmClockOutlineRegular, IconChevronDownOutlineRegular, IconClockOutlineRegular,
  IconQueueOutlineRegular,
} from '@deepseek-ai/dsh-client-ui-primitives'
import { formatDateTime, formatDurationHms, formatPlanStamp, formatTokenCount, formatTokenDetail, pad2 } from './format'
import { resolvedDepsOf } from '../deps.js'
import { fetchEvents, fetchInstances, outputsOf, type EventRow, type InstanceRow } from './query'
import { isRunningStatus, statusesOfBucket, statusTextOf, statusToneOf } from './status-text'
import {
  Button, IconButton, Loading, MarqueeText, PANEL_CONTENT_ID, PANEL_CONTENT_STYLE, Segmented, SelectField, TaskPicker, TimeRange,
  applyStyle, rangeToQuery,
} from './ui'
import type { EditorOption, TaskOption, TimeRangeLabels, TimeRangeValue } from './ui'
import { calendarLabelsOf, timeLabelsOf } from './editor-fields'
import { interpolateTranslate, type Translate } from './locales'

/** 每页条数（用户拍板「20 或 50，具体再看」⇒ 取 50）。 */
const PAGE_SIZE = 50
/** 硬上限：到此停止自动续拉并提示缩小范围（用户拍板「保底 2000 条」）。 */
const HARD_LIMIT = 2000
/** 默认时间档：最近 3 天（含今天）。 */
const DEFAULT_DAYS = 3
// 不变量自检：上限必须是页大小的整数倍，否则「续拉会越过上限」或「永远到不了上限」。
if (HARD_LIMIT % PAGE_SIZE !== 0) console.warn('[tdt] HARD_LIMIT 必须是 PAGE_SIZE 的整数倍')

/** 状态分段控件四档（'' = 全部；其余走 `statusesOfBucket` 单源）。 */
type StatusBucket = '' | 'succeeded' | 'failed' | 'running'

/**
 * 折叠态前置标记的**上限**：最多画 20 枚，超出的收成 `+N`（前置多到这个程度是配置问题，
 * 不值得为它加宽版面）。
 *
 * ⚠️ 2026-10-04 返工：此前用的是 Unicode 圈码字符表 `CIRCLED`（①-⑳），用户当场否掉
 * ——「不要用文字形式的圈数字，我不知道你用的是什么文字」。字符圈码的外形由**字体**决定
 * （不同平台的大小 / 基线 / 粗细都不一样，且本质是「文字」而不是「图形」），所以改成
 * **自绘描边圆徽标**：元素里只放普通阿拉伯数字，圆交给 CSS（`.dsh-tdt-rec-depmark`）——
 * 一位数是正圆、两位数自动撑成胶囊，尺寸完全可控。⇒ 常量表与 `circledOf` 一并删除。
 */
const MAX_DEPMARKS = 20

// ── 样式（走基础层注入器，不自建 <style>；只消费 var(--tdt-*)，间距/时长全走 token）──
const RECORDS_CSS = `
/* ── 执行记录流水账（**无容器**）───────────────────────────────────────────
   没有外框、没有贯穿竖轴：整页铺在宿主面板底上，节奏靠「日期小字行 + 一条条自带底色的独立块」建立。 */
.dsh-tdt-rec-group{margin-top:var(--tdt-space-2);}
/* 日期小字行：时钟图标 + 日期 · 星期 · N 条（**不吸顶**——撤掉外框后底是透明的，
   吸顶必须给不透明底色，怕与宿主底色差出一条横带）。 */
.dsh-tdt-rec-dayrow{display:flex;align-items:center;gap:6px;flex:none;
  padding:var(--tdt-space-3) 0 var(--tdt-space-2);
  font-size:var(--tdt-font-md);line-height:var(--tdt-line-md);color:var(--tdt-fg-3);}
.dsh-tdt-rec-dayrow>svg{flex:none;color:var(--tdt-fg-3);}
.dsh-tdt-rec-daylabel{font-weight:500;color:var(--tdt-fg-2);}
.dsh-tdt-rec-daycount{font-size:var(--tdt-font-sm);color:var(--tdt-fg-3);}
/* 块之间 **4px**（用户指定；--tdt-space-1 正好 = 4px） */
.dsh-tdt-rec-items{display:flex;flex-direction:column;gap:var(--tdt-space-1);}
/* 条目块 = **容器**（自带状态色浅底；底色由色调类给的局部变量驱动，见下）。
   ⚠️ 三层结构照任务卡片（用户 2026-10-04：「参考前面配置任务的展开」）：
     容器（**不可点**）→ 头部「.dsh-tdt-rec-head」（可点）→ 展开区（不可点，内容可复制）。
   容器**无 padding、无 cursor**：留白落在头部（这样 hover 高亮正好顶到块边，与卡片主行同观感）。 */
.dsh-tdt-rec-item{position:relative;display:flex;flex-direction:column;gap:var(--tdt-space-1);
  background:var(--rec-tone-soft,transparent);color:var(--tdt-fg);font:inherit;text-align:left;
  animation:dsh-tdt-rec-in var(--tdt-dur-fast) var(--tdt-ease);}
/* 语义色调 → 本域局部变量（「--rec-tone*」是 CSS 局部变量，**不是** --tdt-* token ——
   token 只在 tokens.ts 定义；块底那条「状态色浅底」的 token 就在那里）。 */
.dsh-tdt-rec-tone--ok{--rec-tone:var(--tdt-success);--rec-tone-soft:var(--tdt-success-soft);}
.dsh-tdt-rec-tone--bad{--rec-tone:var(--tdt-danger);--rec-tone-soft:var(--tdt-danger-soft);}
.dsh-tdt-rec-tone--warn{--rec-tone:var(--tdt-warning);--rec-tone-soft:var(--tdt-warning-soft);}
.dsh-tdt-rec-tone--busy{--rec-tone:var(--tdt-business);--rec-tone-soft:var(--tdt-business-soft);}
/* 未知 / 重启孤儿：中性色（复用 chip 底，明暗都成立） */
.dsh-tdt-rec-tone--mute{--rec-tone:var(--tdt-fg-3);--rec-tone-soft:var(--tdt-chip-bg);}
/* 成败竖条（**不用图标、也不再写状态文字**）：5px 通高、**纯方角**、贴齐块左缘；
   状态名挂在它的 title 上（鼠标停上去才显示，不占版面）。 */
.dsh-tdt-rec-bar{position:absolute;left:0;top:0;bottom:0;width:5px;background:var(--rec-tone,var(--tdt-fg-3));}
.dsh-tdt-rec-bar--run{animation:dsh-tdt-rec-pulse var(--tdt-dur) var(--tdt-ease) infinite;}
@keyframes dsh-tdt-rec-pulse{0%,100%{opacity:1}50%{opacity:.35}}
@keyframes dsh-tdt-rec-in{from{opacity:0;transform:translateY(-2px)}to{opacity:1;transform:none}}
@media (prefers-reduced-motion: reduce){
  .dsh-tdt-rec-bar--run{animation:none;}
  .dsh-tdt-rec-item{animation:none;}
}
/* ── 头部 = 块内两列（左列：标题 + 信息 + 备注 ／ 右列：一排控件）且是**唯一可点区域** ──
   留白放大（用户 2026-10-04：「左边的间距、上面、下面、右边都大点」）：上/下/右 12、左 16；
   **只有鼠标悬停**才叠一层中性半透明（不盖掉块底的状态色浅底）。
   ⚠️ 2026-10-04 第七轮：删掉「展开态常亮」——用户原话「如果我鼠标不移到这一块，它是不变色的，
   还是没展开时的颜色呀。只是鼠标移到这一块，它才换一个颜色」；展开与否**不再影响**头部底色。 */
.dsh-tdt-rec-main{display:flex;align-items:center;gap:var(--tdt-space-3);min-width:0;
  padding:var(--tdt-space-3) var(--tdt-space-3) var(--tdt-space-3) var(--tdt-space-4);}
.dsh-tdt-rec-head{cursor:pointer;}
.dsh-tdt-rec-head:hover{background-image:linear-gradient(var(--tdt-hover),var(--tdt-hover));}
.dsh-tdt-rec-left{display:flex;flex-direction:column;gap:var(--tdt-space-1);flex:1 1 auto;min-width:0;}
.dsh-tdt-rec-right{display:flex;align-items:center;gap:var(--tdt-space-2);flex:none;}
.dsh-tdt-rec-r1{display:flex;align-items:center;gap:var(--tdt-space-2);min-width:0;}
.dsh-tdt-rec-title{font-size:var(--tdt-font-lg);font-weight:600;line-height:var(--tdt-line-md);}
/* 信息行：**固定单行 + 溢出省略**（用户 2026-10-04：「多出的部分显示成 ...」）——
   最窄也要能放下「工作区 · 计划 · 实际 · 时长 · Token」的一部分，永不换行、永不横向滚动。 */
.dsh-tdt-rec-r2{display:block;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;
  font-size:var(--tdt-font-sm);line-height:var(--tdt-line-sm);color:var(--tdt-fg-3);min-width:0;}
/* 信息行里的一段（「图标 + 标签 + 值」）；段与段之间的「·」由 ::before 自动补，不用手写分隔节点。 */
.dsh-tdt-rec-field{display:inline-flex;align-items:center;gap:4px;vertical-align:middle;}
.dsh-tdt-rec-field+.dsh-tdt-rec-field::before{content:'·';margin:0 var(--tdt-space-1);color:var(--tdt-border-heavy);}
/* 字段小图标**统一 12px**（= --tdt-font-sm；用户 2026-10-04：几个图标一大一小、都缩小一号）
   —— 这里再兜一道：将来漏传 size 也不会又变大。 */
.dsh-tdt-rec-field>svg{flex:none;width:var(--tdt-font-sm);height:var(--tdt-font-sm);color:var(--tdt-fg-3);}
.dsh-tdt-rec-sep{color:var(--tdt-border-heavy);}
.dsh-tdt-rec-num{font-variant-numeric:tabular-nums;font-family:var(--tdt-font-mono);}
.dsh-tdt-rec-chiprow{display:inline-flex;align-items:center;gap:2px;flex-wrap:nowrap;}
/* 展开箭头**不再自绘**：用基础层 IconButton（与任务配置卡片的箭头同一份实现，
   hover 底色 / 尺寸 / 翻转都一致）—— 2026-10-04 第五轮收编。 */
/* 折叠态：名字后面的**前置圈码**（有几个 = 本次执行实际用到了几个上游） */
.dsh-tdt-rec-depmarks{display:inline-flex;align-items:center;gap:var(--tdt-space-1);flex:none;}
/* 前置圈码 = **自绘描边圆徽标**（2026-10-04 返工，替代 Unicode ①②③ 字符）：
   圆与尺寸全由样式给（不靠字体）——一位数是正圆、两位数自动撑成胶囊；
   悬停浮出浅底 + 边框加深（用户：「鼠标移上去不用点，它要变个色」）；
   内容提示仍是**原生 title**（上一轮定的「绝不自绘浮层」不动）。 */
.dsh-tdt-rec-depmark{display:inline-flex;align-items:center;justify-content:center;flex:none;
  min-width:18px;height:18px;padding:0 3px;border-radius:999px;border:1px solid var(--tdt-border);
  color:var(--tdt-fg-3);font-size:var(--tdt-font-xs);line-height:1;font-variant-numeric:tabular-nums;
  transition:background-color var(--tdt-dur) var(--tdt-ease),border-color var(--tdt-dur) var(--tdt-ease),color var(--tdt-dur) var(--tdt-ease);}
.dsh-tdt-rec-depmark:hover{background:var(--tdt-chip-bg-hover);border-color:var(--tdt-border-heavy);color:var(--tdt-fg-2);}
/* 第 3 行：失败 / 未执行的原因（灰、单行省略，hover 看全文）—— 跨整块宽度 */
.dsh-tdt-rec-note{font-size:var(--tdt-font-sm);color:var(--tdt-fg-3);}
/* ── 展开区（点头部就地展开；手风琴，同时只开一条）───────────────────────
   ⚠️ **不可点、无 cursor**：展开出来的内容（产出物 / 前置 / 日志）要能直接拖选复制
      （用户 2026-10-04：整块可点的时代下面那块也是手指，内容不好复制）。 */
.dsh-tdt-rec-exp{display:flex;flex-direction:column;gap:var(--tdt-space-2);
  padding:var(--tdt-space-2) var(--tdt-space-3) var(--tdt-space-3) var(--tdt-space-4);
  border-top:1px solid var(--tdt-border-faint);}
/* 产出物：**与「任务配置 → 附件区」一模一样的排布**（用户 2026-10-04：不占整行、限宽跑马灯）
   —— wrap 行内并排，底色 / 形状走基础层「行式文件按钮」的 --inline 形态。 */
.dsh-tdt-rec-expouts{display:flex;flex-wrap:wrap;gap:2px 10px;min-width:0;}
/* 事件流水：小标题 + 等宽小字逐行铺（与卡片「执行记录」下钻同口径：时间 / 事件 / 明细）。 */
.dsh-tdt-rec-evtitle{margin-bottom:6px;font-size:var(--tdt-font-xs);font-weight:500;color:var(--tdt-fg-3);}
/* 前置任务（展开区**第二排**）：**一排两个**（用户 2026-10-04），每格「左列两行 + 右列按钮」——
   左列：圈码 + 任务名 ／「执行于 2026-10-03 23:50:12」；右列：「查看会话」链接型小按钮（靠右 + 上下居中）。
   格子本身不可点（只有里面那个按钮可点）。
   ⚠️ 2026-10-04 第七轮三处返工：① 时间改**书面表达 + 全量长格式**（用户否掉「本次取自…」那种说法）；
   ② 按钮从信息行里挪出来落右列（无边框链接型）——顺带治好「两行中间被 24px 按钮撑高」的挤；
   ③ 留白与圆角整体放大到约 1.5~2 倍（用户：「看着就是贴边，很挤」「完全看不出来圆角」）。 */
.dsh-tdt-rec-depsec{display:flex;flex-direction:column;gap:var(--tdt-space-2);min-width:0;}
.dsh-tdt-rec-depgrid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:var(--tdt-space-2) var(--tdt-space-3);}
.dsh-tdt-rec-dep{display:grid;grid-template-columns:minmax(0,1fr) auto;align-items:center;
  column-gap:var(--tdt-space-3);min-width:0;
  padding:var(--tdt-space-2) var(--tdt-space-3);border-radius:var(--tdt-radius-sm);background:var(--tdt-chip-bg);}
.dsh-tdt-rec-depmid{display:flex;flex-direction:column;gap:var(--tdt-space-1);min-width:0;}
.dsh-tdt-rec-depname{display:flex;align-items:center;gap:var(--tdt-space-2);min-width:0;
  font-size:var(--tdt-font-sm);color:var(--tdt-fg-2);}
.dsh-tdt-rec-depmeta{display:flex;align-items:center;gap:var(--tdt-space-2);min-width:0;
  font-size:var(--tdt-font-xs);color:var(--tdt-fg-3);}
.dsh-tdt-rec-ev{font-family:var(--tdt-font-mono);font-size:var(--tdt-font-xs);
  line-height:var(--tdt-line-md);color:var(--tdt-fg-2);}
.dsh-tdt-rec-evrow{margin-bottom:6px;word-break:break-all;}
.dsh-tdt-rec-evempty{font-size:var(--tdt-font-xs);color:var(--tdt-fg-3);}
.dsh-tdt-rec-foot{display:flex;align-items:center;justify-content:center;gap:var(--tdt-space-2);
  padding:var(--tdt-space-3) 0 var(--tdt-space-1);font-size:var(--tdt-font-xs);color:var(--tdt-fg-3);}
.dsh-tdt-rec-err{color:var(--tdt-danger);}
`
const RECORDS_DOMAIN = 'domain:records'

const filterRowStyle: CSSProperties = {
  display: 'flex', alignItems: 'center', gap: 'var(--tdt-space-2)', flexWrap: 'wrap', marginBottom: 'var(--tdt-space-3)',
}
const filterRightStyle: CSSProperties = {
  display: 'flex', alignItems: 'center', gap: 'var(--tdt-space-2)', marginLeft: 'auto', flexWrap: 'wrap',
}
const emptyStyle: CSSProperties = {
  padding: '40px 0', textAlign: 'center', fontSize: 'var(--tdt-font-md)', color: 'var(--tdt-fg-3)',
}

/** `YYYY-MM-DD`（本地日历日，只用于拼默认时间档）。 */
function ymdOf(d: Date): string {
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`
}

/** 默认时间档：最近 N 天（含今天）。 */
function defaultRange(): TimeRangeValue {
  const now = new Date()
  const from = new Date(now)
  from.setDate(from.getDate() - (DEFAULT_DAYS - 1))
  return { from: ymdOf(from), to: ymdOf(now) }
}

/** 本地日历日的 key（`YYYY-MM-DD`）。 */
function ymdOfDate(d: Date): string {
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`
}

/** `HH:mm`（非法值给占位）。 */
function hmOf(iso: string | null): string {
  if (iso === null) return '--'
  const ms = Date.parse(iso)
  if (Number.isNaN(ms)) return '--'
  const d = new Date(ms)
  return `${pad2(d.getHours())}:${pad2(d.getMinutes())}`
}

/**
 * 信息行里的「时刻」文案（用户 2026-10-04）。
 *
 * 列表已按天分组 ⇒ 时刻**默认只到分钟**（`HH:mm`，不重复年月日）。
 * ⚠️ 但**跨天的时刻必须显式标注**，否则会被看成当天的时刻：
 *   比本条所属的「天」早一天 ⇒ `前一天 23:50`；晚一天 ⇒ `次日 00:05`；
 *   差 ≥2 天 ⇒ `10 月 28 日 23:50`（`Intl` 按当前语言排版，不硬编码）。
 */
function clockLabelOf(
  iso: string | null,
  dayKey: string,
  crossFormatter: Intl.DateTimeFormat | null,
  prevDayLabel: string,
  nextDayLabel: string,
): string {
  if (iso === null || iso === '') return ''
  const ms = Date.parse(iso)
  if (Number.isNaN(ms)) return '--'
  const d = new Date(ms)
  const sameDay = ymdOfDate(d)
  const hhmm = `${pad2(d.getHours())}:${pad2(d.getMinutes())}`
  if (sameDay === dayKey || dayKey === 'unknown') return hhmm
  const base = dateOfDayKey(dayKey)
  if (base === null) return hhmm
  const diffDays = Math.round((base.getTime() - new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime()) / 86_400_000)
  if (diffDays === 1) return `${prevDayLabel} ${hhmm}`
  if (diffDays === -1) return `${nextDayLabel} ${hhmm}`
  return crossFormatter === null ? hhmm : crossFormatter.format(d)
}

/** 路径末段（产出物清单上只显示文件名）。 */
function baseNameOf(path: string): string {
  const cut = Math.max(path.lastIndexOf('/'), path.lastIndexOf('\\'))
  return cut < 0 ? path : path.slice(cut + 1)
}

/**
 * 一行记录所属的「天」= `scheduled_at` 的**本地日历日**。
 *
 * ⚠️ 不用服务端 `logical_date`（那是**任务时区**的日历日）：排序键与时间范围过滤都是 `scheduled_at`，
 * 分组键与之同源才不会把同一天劈成两个同名日期行。
 */
function dayKeyOf(row: InstanceRow): string {
  const ms = Date.parse(typeof row.scheduled_at === 'string' ? row.scheduled_at : '')
  if (Number.isNaN(ms)) return 'unknown'
  return ymdOfDate(new Date(ms))
}

/** 天 key（`YYYY-MM-DD`）→ 本地 `Date`；认不出给 null（不猜）。 */
function dateOfDayKey(key: string): Date | null {
  const parts = key.split('-')
  const y = Number(parts[0])
  const m = Number(parts[1])
  const d = Number(parts[2])
  if (!Number.isFinite(y) || !Number.isFinite(m) || !Number.isFinite(d)) return null
  return new Date(y, m - 1, d)
}

/** 日期文案（`Intl` 按当前语言排版；认不出的 key 原样显示，不硬编码某种语言）。 */
function dayLabelOf(key: string, formatter: Intl.DateTimeFormat | null): string {
  const date = dateOfDayKey(key)
  return date === null || formatter === null ? key : formatter.format(date)
}

/** 星期文案（同日期的 key；取不到给空串 ⇒ 整段不显示）。 */
function weekdayOf(key: string, formatter: Intl.DateTimeFormat | null): string {
  const date = dateOfDayKey(key)
  return date === null || formatter === null ? '' : formatter.format(date)
}

/**
 * 语义色调 → 块的色调类名（色值本身全在 CSS 里读 --tdt-* / --tdt-*-soft，
 * 业务侧只做「哪一档」的映射；档位由 `status-text.ts` 的 `statusToneOf` 单源决定）。
 */
function toneClassOf(tone: ReturnType<typeof statusToneOf>): string {
  if (tone === 'ok') return 'dsh-tdt-rec-tone--ok'
  if (tone === 'bad') return 'dsh-tdt-rec-tone--bad'
  if (tone === 'warn') return 'dsh-tdt-rec-tone--warn'
  if (tone === 'busy') return 'dsh-tdt-rec-tone--busy'
  return 'dsh-tdt-rec-tone--mute'
}

/** 执行时长（与卡片面板同口径：`dispatched_at ?? scheduled_at` → `finished_at`）。 */
function durationOf(row: InstanceRow): string {
  if (row.finished_at === null) return '-'
  const from = Date.parse(row.dispatched_at ?? row.scheduled_at)
  const to = Date.parse(row.finished_at)
  if (!Number.isFinite(from) || !Number.isFinite(to)) return '-'
  return formatDurationHms(to - from)
}

/** 时间戳（`YYYY-MM-DD HH:mm:ss`，事件流水与悬停提示用）。 */
const stampOf = (iso: string | null): string =>
  iso === null ? '—' : formatDateTime(iso, { seconds: true, fallback: '—' })

/** 一个执行块（**memo**：续拉时只有新增行需要 render，已挂的块不重算）。 */
const RecordItem = memo(function RecordItem(props: {
  row: InstanceRow
  label: string
  workspace: string
  t: Translate
  /** 是否展开（手风琴：由父级按 `openId` 算好传进来）—— 决定箭头朝向。 */
  open: boolean
  onToggle: (id: string) => void
  openSession: (sessionId: string) => void
  openFile?: (sessionId: string, path: string) => void
  /** 展开区的事件流水（未展开 / 未取到 ⇒ null）。 */
  events: readonly EventRow[] | null
  eventsBusy: boolean
  eventsError: string | null
  /** 跨天时刻的「M 月 D 日 HH:mm」格式器（按语言记忆化，父级传入）。 */
  crossFmt: Intl.DateTimeFormat | null
  /** 带插值的文案（前置圈码 / 前置取自 / token 明细用；父级 `interpolateTranslate` 得到）。 */
  tt: ReturnType<typeof interpolateTranslate>
  /** 实例快照（JSON 字符串）：本次执行**实际用到的前置**就从这里解析（`resolvedDeps`），零额外请求。 */
  snapshot: string | null
  /** 任务 id → 任务名（查不到退短 id；父级用 overview 建的反查，与别处同口径）。 */
  depTitleOf: (taskId: string) => string
}): ReturnType<typeof h> {
  const { row, label, workspace, t, tt, snapshot, depTitleOf, open, onToggle, openSession, openFile, events, eventsBusy, eventsError, crossFmt } = props
  const tone = statusToneOf(row.status)
  const running = isRunningStatus(row.status)
  const statusLabel = statusTextOf(row.status, t)
  const outputs = outputsOf(row.outputs)
  const sid = row.session_id
  const canOpenSession = sid !== null && sid !== ''
  const canOpenFile = canOpenSession && openFile !== undefined
  const tokens = (row.token_in ?? 0) + (row.token_out ?? 0)
  const note = row.note ?? ''
  const dayKey = dayKeyOf(row)
  // 时刻：默认只到分钟；跨天时由 `clockLabelOf` 显式标注（早一天 / 晚一天 / 具体日期）。
  const planned = clockLabelOf(row.scheduled_at, dayKey, crossFmt, t('recPrevDay'), t('recNextDay'))
  /** 时长的悬停提示：带起止时刻（有终态才给区间），比只显示「时长 03:00」有用得多。 */
  const durationHint = row.finished_at === null
    ? `${t('colDuration')}：${durationOf(row)}`
    : `${t('colDuration')}：${durationOf(row)}（${stampOf(row.dispatched_at ?? row.scheduled_at)} → ${stampOf(row.finished_at)}）`
  const actual = clockLabelOf(row.dispatched_at, dayKey, crossFmt, t('recPrevDay'), t('recNextDay'))
  // 本次执行**实际用到的**前置（快照里的 resolvedDeps；空 / 坏 JSON / 旧行 ⇒ []，不猜、更不读任务配置）。
  const deps = resolvedDepsOf(snapshot)
  /** token 三段之一：null 给占位（不编造 0）。 */
  const tokenPart = (v: number | null): string => (v === null ? '—' : formatTokenCount(v))
  /**
   * 头部点击 = 切展开。
   * ⚠️ 照抄任务卡片那条守卫：**有选中文字就不展开**（用户正在拖选复制，不是要点开）。
   */
  const onHeadClick = (): void => {
    const sel = typeof window === 'undefined' ? null : window.getSelection()
    if (sel !== null && sel.toString() !== '') return
    onToggle(row.id)
  }

  /** 信息行里的一段（可带图标）；值空则整段不出（不占位）。 */
  const field = (icon: ReturnType<typeof h> | null, text: string, title?: string): ReturnType<typeof h> | null =>
    text === '' ? null : h('span', { className: 'dsh-tdt-rec-field', title }, icon, text)

  return h('div', {
    // ⚠️ **容器不挂任何交互**（照任务卡片：容器不挂 onClick → 头部挂 → 展开区是兄弟节点）：
    //    光标 / 点击 / 键盘都只在下面的「头部」上 ⇒ 展开出来的内容既不是手指、也不会误触展开，可安心拖选复制。
    //    展开与否只驱动「展开区是否渲染」与箭头上的 aria-expanded，**不再改块的外观**（第七轮去掉常亮）。
    className: `dsh-tdt-rec-item ${toneClassOf(tone)}`,
  },
    // ── 头部（**唯一可点区域**）：左缘竖条 + 标题 + 信息 + 备注 + 右列控件 ──
    h('div', { className: 'dsh-tdt-rec-main dsh-tdt-rec-head', onClick: onHeadClick },
      // 5px 方角通高竖条：成败的**唯一**图形表达；状态名放在它的悬停提示里（不再写可见文字）。
      // 收进头部 ⇒ 这条 5px 也能点开（绝对定位仍相对块根，位置不变）——与卡片把状态条放进主行同理。
      h('span', {
        className: `dsh-tdt-rec-bar${running ? ' dsh-tdt-rec-bar--run' : ''}`,
        title: statusLabel,
        'aria-hidden': true,
      }),
      // ── 左列：标题 + 下面那排信息 ──
      h('div', { className: 'dsh-tdt-rec-left' },
        h('div', { className: 'dsh-tdt-rec-r1' },
          // 标题**不撑满**（`0 1 auto`）：后面的前置圈码要紧跟名字，而不是被推到行尾。
          h(MarqueeText, {
            text: label, title: label,
            className: 'dsh-tdt-rec-title dsh-tdt-ellipsis',
            style: { flex: '0 1 auto', minWidth: 0 },
          }),
          // 前置圈码（用户 2026-10-04）：**本次执行实际用到的**上游有几个就画几个，一个都没有就什么都不画；
          // 悬停用**原生 title**（不许自绘浮层）说明是第几个、叫什么。
          deps.length === 0
            ? null
            : h('span', { className: 'dsh-tdt-rec-depmarks' },
              deps.slice(0, MAX_DEPMARKS).map((dep, index) => h('span', {
                key: `${dep.task}#${dep.instanceId}`,
                className: 'dsh-tdt-rec-depmark',
                title: tt('recordsDepTip', { n: String(index + 1), task: depTitleOf(dep.task) }),
              }, String(index + 1))),
              deps.length > MAX_DEPMARKS
                ? h('span', { className: 'dsh-tdt-rec-depmark', title: t('listSectionDepends') },
                  `+${deps.length - MAX_DEPMARKS}`)
                : null,
            ),
        ),
        // 信息行：工作区 · 🕰计划 · 🕐实际 · ⟳时长 · Token（单行、溢出省略；Token 从右下角迁到这里）
        // ⚠️ 每段都挂**带标签的完整值**的悬停提示（用户 2026-10-04：光看「32K」「15:10」不知道是什么）。
        h('div', { className: 'dsh-tdt-rec-r2' },
          field(null, workspace, workspace === '' ? undefined : `${t('listFieldWorkspace')}：${workspace}`),
          field(h(IconAlarmClockOutlineRegular, { size: 12 }), planned === '' ? '' : `${t('recPlan')} ${planned}`,
            `${t('colPlanned')}：${formatPlanStamp(row.scheduled_at)}`),
          field(actual === '' ? null : h(IconClockOutlineRegular, { size: 12 }), actual === '' ? '' : `${t('recActual')} ${actual}`,
            row.dispatched_at === null ? undefined : `${t('colActualStart')}：${stampOf(row.dispatched_at)}`),
          field(h(IconQueueOutlineRegular, { size: 12 }), `${t('colDuration')} ${durationOf(row)}`, durationHint),
          // 悬停写详细（用户 2026-10-04：「这 3 个栏谁知道分别是什么呢？你也要有个标题」）：
          // 总数 + **带标签**的三段明细（输入 / 输出 / 缓存），仍走**原生 title**（多行）。
          tokens > 0
            ? h('span', {
              className: 'dsh-tdt-rec-field dsh-tdt-rec-num',
              title: `${t('recTokenHint')}：${formatTokenCount(tokens)}\n${tt('recTokenDetail', {
                input: tokenPart(row.token_in), output: tokenPart(row.token_out), cache: tokenPart(row.token_in_cache),
              })}`,
            }, formatTokenCount(tokens))
            : null,
        ),
        // ── 第 3 行：失败 / 未执行的原因（用户：执行错了就是要看备注）──
        // ⚠️ 放在**左列**里（不是块下）：右列控件相对「标题 + 信息 + 备注」整体居中，
        //    否则一出现第三行，右列那排按钮就会看着偏上（用户 2026-10-04 点名）。
        note === ''
          ? null
          : h('div', { className: 'dsh-tdt-rec-note dsh-tdt-ellipsis', title: note }, `${t('colNote')}：${note}`),
      ),
      // ── 右列：一排控件（产出物图标 → 查看会话按钮 → 展开箭头）──
      h('div', { className: 'dsh-tdt-rec-right' },
        outputs.length === 0
          ? null
          : h('span', { className: 'dsh-tdt-rec-chiprow', title: t('colOutputs') },
            outputs.slice(0, 3).map(path => h('button', {
              key: path,
              type: 'button',
              className: 'dsh-tdt-chip',
              title: path,
              disabled: !canOpenFile,
              onClick: (event: { stopPropagation(): void }) => {
                event.stopPropagation()
                if (canOpenFile) openFile?.(sid as string, path)
              },
            }, h(FileTypeIcon, { path, size: 16 }))),
            outputs.length > 3
              ? h('button', {
                type: 'button',
                className: 'dsh-tdt-chip dsh-tdt-chip--label',
                title: t('colOutputs'),
                onClick: (event: { stopPropagation(): void }) => { event.stopPropagation(); onToggle(row.id) },
              }, `+${outputs.length - 3}`)
              : null,
          ),
        // 只有这个按钮开会话（没有会话就不出现 —— 不给假入口；块本身仍可展开）。
        canOpenSession
          ? h(Button, {
            variant: 'outline',
            size: 'sm',
            title: t('viewSession'),
            onClick: (event: { stopPropagation(): void }) => { event.stopPropagation(); openSession(sid as string) },
          }, t('viewSession'))
          : null,
        // 展开箭头 = **与任务卡片头部逐字一致**的写法（用户 2026-10-04：抄任务配置那套，
        // 连鼠标移上去都要一样）：基础层 IconButton（plain + sm = 24×24，hover 走 --tdt-hover）
        // + chevron + aria-expanded + 展开翻转。外面包一层 span 拦冒泡（否则会先触发自己的 onClick
        // 再冒泡到整块 ⇒ 展开后立刻又收起）。故意**不挂 title**：图标自明，只留无障碍名（与卡片同理）。
        h('span', { onClick: (event: { stopPropagation(): void }) => { event.stopPropagation() } },
          h(IconButton, {
            variant: 'plain',
            size: 'sm',
            icon: h(IconChevronDownOutlineRegular, { size: 14 }),
            label: t('listExpandHint'),
            onClick: () => { onToggle(row.id) },
            'aria-expanded': open,
            style: { transform: open ? 'rotate(180deg)' : 'none' },
          }),
        ),
      ),
    ),
    // ── 展开区（**不可点、无 cursor**：内容要能直接拖选复制）：第一排产出物 → 第二排前置任务 →
    //    再往下是该次执行的事件流水。父级已不可点 ⇒ 不再需要拦冒泡。 ──
    open
      ? h('div', { className: 'dsh-tdt-rec-exp' },
        outputs.length === 0
          ? null
          : h('div', { className: 'dsh-tdt-rec-expouts' },
            outputs.map(path => h('button', {
              key: path,
              type: 'button',
              title: path,
              // 与附件区同款：行内（--inline，不占整行）+ 行式文件按钮基础层唯一实现
              className: 'dsh-tdt-filechip dsh-tdt-filechip--inline',
              disabled: !canOpenFile,
              onClick: () => { if (canOpenFile) openFile?.(sid as string, path) },
            },
              h(FileTypeIcon, { path, size: 14 }),
              // 文件名**限宽 40ch + 超长跑马灯**（与卡片附件区同一口径；用户：设个最大宽度，超过了就跑马灯）
              h(MarqueeText, { text: baseNameOf(path), title: path, style: { maxWidth: '40ch', minWidth: 0 } }),
            )),
          ),
        // ── 第二排：前置任务（用户 2026-10-04：**一排显示两个**；每格两行，能点开那次上游的会话）──
        deps.length === 0
          ? null
          : h('div', { className: 'dsh-tdt-rec-depsec' },
            h('div', { className: 'dsh-tdt-rec-evtitle' }, t('listSectionDepends')),
            h('div', { className: 'dsh-tdt-rec-depgrid' },
              deps.map((dep, index) => h('div', {
                key: `${dep.task}#${dep.instanceId}`,
                className: 'dsh-tdt-rec-dep',
              },
                h('div', { className: 'dsh-tdt-rec-depmid' },
                  h('div', { className: 'dsh-tdt-rec-depname' },
                    h('span', { className: 'dsh-tdt-rec-depmark' }, String(index + 1)),
                    h('span', { className: 'dsh-tdt-ellipsis', title: depTitleOf(dep.task) }, depTitleOf(dep.task)),
                  ),
                  h('div', { className: 'dsh-tdt-rec-depmeta' },
                    // 「执行于 <完整时刻>」—— 书面表达 + **全量长格式**（用户 2026-10-04 第七轮：否掉
                    // 「本次取自前一天…」那种口语说法，「哪一天、几点几分几秒，全都给显示出来」）。
                    // 单行省略、悬停看全量；stampOf = formatDateTime(iso, { seconds: true })。
                    h('span', { className: 'dsh-tdt-ellipsis', title: stampOf(dep.scheduledAt) },
                      tt('recordsDepFrom', { time: stampOf(dep.scheduledAt) })),
                  ),
                ),
                // 上游那次没有会话 ⇒ **不出按钮**（不给假入口）。有会话才落右列：
                // 靠右 + 上下居中，且不再把左列那两行撑高。
                // 外观走基础层官方配方「链接型文字钮」（ghost + dsh-tdt-btn--link：无边框、链接色、
                // hover 下划线）—— 用户 2026-10-04：「不要边框，不要黑、不要灰」。
                dep.sessionId === null || dep.sessionId === ''
                  ? null
                  : h(Button, {
                    variant: 'ghost',
                    size: 'sm',
                    className: 'dsh-tdt-btn--link',
                    title: t('viewSession'),
                    onClick: () => { openSession(dep.sessionId as string) },
                  }, t('viewSession')),
              )),
            ),
          ),
        eventsError !== null
          ? h('div', { className: 'dsh-tdt-rec-evempty dsh-tdt-rec-err' }, `${t('cardLoadFailed')}：${eventsError}`)
          : eventsBusy
            ? h('div', { className: 'dsh-tdt-rec-evempty' }, t('recordsLoading'))
            : events === null
              ? null
              : events.length === 0
                ? h('div', { className: 'dsh-tdt-rec-evempty' }, t('cardEventsEmpty'))
                // 有事件才出小标题（空态不占标题行）；行间距拉开、字色压暗一档（与卡片下钻同口径）。
                : h('div', { className: 'dsh-tdt-rec-ev' },
                  h('div', { className: 'dsh-tdt-rec-evtitle' }, t('recEventsTitle')),
                  events.map(event => h('div', { key: event.seq, className: 'dsh-tdt-rec-evrow' },
                    h('span', { style: { color: 'var(--tdt-fg-3)' } }, `${stampOf(event.ts)} `),
                    h('span', { style: { color: 'var(--tdt-fg-2)' } }, `${event.kind} `),
                    h('span', { style: { color: 'var(--tdt-fg-2)' } }, event.detail ?? ''),
                  )),
                ),
      )
      : null,
  )
})

export interface RecordsTimelineProps {
  t: Translate
  /** 任务候选（`[编号] 名称` 口径 + 所属工作区，由父级用 overview 组装）。 */
  tasks: readonly TaskOption[]
  /** 工作区候选真源（面板级唯一，来自 `GET /options`）；空数组 = 取不到 ⇒ 下拉「暂无可选」。 */
  workspaces: readonly EditorOption[]
  /** 打开归档会话弹窗：**只传会话 id**（快照 / 产出由弹窗自取）。 */
  onOpenSession?: (sessionId: string) => void
  /** 打开产出物预览（`POST` 前先切文件面板）；不可用时不传 ⇒ 产出物降级为不可点。 */
  onOpenFile?: (sessionId: string, path: string) => void
}

/** 执行记录总查询页（流水账）。 */
export function RecordsTimelineView(props: RecordsTimelineProps): ReturnType<typeof h> {
  applyStyle(RECORDS_DOMAIN, RECORDS_CSS)
  const { t, tasks, workspaces, onOpenSession, onOpenFile } = props
  const tt = useMemo(() => interpolateTranslate(t), [t])

  const [range, setRange] = useState<TimeRangeValue>(defaultRange)
  const [workspace, setWorkspace] = useState('')
  const [bucket, setBucket] = useState<StatusBucket>('')
  const [taskId, setTaskId] = useState('')
  const [rows, setRows] = useState<readonly InstanceRow[]>([])
  const [cursor, setCursor] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const [loaded, setLoaded] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [done, setDone] = useState(false)
  /** 手风琴：同时只展开一条（用户 2026-10-04 拍板）。 */
  const [openId, setOpenId] = useState<string | null>(null)
  /** 事件流水：按实例 id 缓存（反复开合不重复请求；实例的事件一次取完，不分页）。 */
  const [eventsCache, setEventsCache] = useState<ReadonlyMap<string, readonly EventRow[]>>(() => new Map())
  const [eventsBusy, setEventsBusy] = useState(false)
  const [eventsError, setEventsError] = useState<string | null>(null)

  const seqRef = useRef(0)
  const inFlightRef = useRef(false)
  const rowsCountRef = useRef(0)
  rowsCountRef.current = rows.length
  /** 事件请求序号：快速切块时作废旧响应，别把 A 的事件贴到 B 上。 */
  const eventsSeqRef = useRef(0)
  /** 首次进入时的默认档（用来判「用户是否真的动过过滤器」⇒ 决定空态文案）。 */
  const initialRangeRef = useRef<TimeRangeValue>(range)

  const calendarLabels = useMemo(() => calendarLabelsOf(t), [t])
  const timeLabels = useMemo(() => timeLabelsOf(t), [t])
  const rangeLabels = useMemo<TimeRangeLabels>(() => ({
    all: t('trAll'), custom: t('trCustom'), from: t('cardFrom'), to: t('cardTo'),
    presets: {
      today: t('trToday'), yesterday: t('trYesterday'), thisWeek: t('trThisWeek'),
      lastWeek: t('trLastWeek'), thisMonth: t('trThisMonth'), lastMonth: t('trLastMonth'),
    },
  }), [t])
  // 日期行两个格式化器按语言记忆化（此前每次渲染、每天都新建 Intl 实例）。
  const dayFormatter = useMemo<Intl.DateTimeFormat | null>(
    () => (typeof Intl === 'undefined' ? null : new Intl.DateTimeFormat(t('localeTag'), { year: 'numeric', month: 'long', day: 'numeric' })),
    [t],
  )
  const weekdayFormatter = useMemo<Intl.DateTimeFormat | null>(
    () => (typeof Intl === 'undefined' ? null : new Intl.DateTimeFormat(t('localeTag'), { weekday: 'long' })),
    [t],
  )
  /** 跨天时刻的格式（差 ≥2 天时用：「10 月 28 日 23:50」，按语言排版）。 */
  const crossDayFormatter = useMemo<Intl.DateTimeFormat | null>(
    () => (typeof Intl === 'undefined' ? null
      : new Intl.DateTimeFormat(t('localeTag'), { month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit' })),
    [t],
  )

  const workspaceOptions = useMemo<EditorOption[]>(
    () => [{ value: '', label: t('listFilterWorkspaceAll') }, ...workspaces],
    [workspaces, t],
  )
  // 状态四档（与任务列表顶部那排同款分段控件；成员由 `status-text.ts` 单源决定 —— 与卡片面板同一个桶）。
  const statusItems = useMemo(() => ([
    { value: 'all' as const, label: t('filterAll') },
    { value: 'succeeded' as const, label: statusTextOf('succeeded', t) },
    { value: 'failed' as const, label: statusTextOf('failed', t) },
    { value: 'running' as const, label: t('filterRunning') },
  ]), [t])

  const titleById = useMemo(() => new Map(tasks.map(o => [o.id, o.label])), [tasks])
  /**
   * 任务 id → 任务名（查不到退短 id 8 位，**绝不编造**）—— 前置圈码与前置清单用。
   * 与父级 `upstreamOf`（index.ts）同口径；`useCallback` 保证 memo 条目不被无谓重渲。
   */
  const depTitleOf = useCallback((taskId: string): string => titleById.get(taskId) ?? taskId.slice(0, 8), [titleById])
  /** 工作区反查：优先任务表（当前归属），任务已删退回派发快照的 `workspacePath` 末段（当次执行当时的值）。 */
  const workspaceById = useMemo(() => new Map(tasks.map(o => [o.id, o.workspace])), [tasks])
  const filterSig = `${range.from}|${range.to}|${workspace}|${bucket}|${taskId}`

  const load = useCallback(async (nextCursor: string | null): Promise<void> => {
    if (inFlightRef.current) return
    inFlightRef.current = true
    const seq = seqRef.current + 1
    seqRef.current = seq
    setLoading(true)
    setError(null)
    const q = rangeToQuery(range, 'day')
    try {
      const page = await fetchInstances({
        workspace: workspace === '' ? undefined : workspace,
        statuses: bucket === '' ? undefined : statusesOfBucket(bucket),
        taskId: taskId === '' ? undefined : taskId,
        from: q.fromTs,
        to: q.toTs,
        limit: PAGE_SIZE,
        cursor: nextCursor ?? undefined,
      })
      if (seq !== seqRef.current) return
      setRows(prev => (nextCursor === null ? page.rows : [...prev, ...page.rows]))
      setCursor(page.nextCursor)
      setDone(page.nextCursor === null)
    } catch (e) {
      if (seq !== seqRef.current) return
      // 失败**不清空已有列表**（用户已看到的流水账不该因为一次失败消失），只给错误态 + 重试。
      setError(e instanceof Error ? e.message : String(e))
    } finally {
      if (seq === seqRef.current) {
        setLoading(false)
        setLoaded(true)
        inFlightRef.current = false
      }
    }
  }, [range, workspace, bucket, taskId])

  // 过滤条件变化（含首次挂载）⇒ 作废在途请求 + 重置列表 + 取第一页 + 收起已展开的块。
  // ⚠️ 上限只拦「续拉」（见 loadMore）：首屏永远允许取 ⇒ 满 2000 条后改过滤不会白屏。
  useEffect(() => {
    seqRef.current += 1
    inFlightRef.current = false
    setRows([])
    setCursor(null)
    setDone(false)
    setError(null)
    setLoaded(false)
    setOpenId(null)
    setEventsError(null)
    void load(null)
    return () => { seqRef.current += 1 }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filterSig])

  // 展开的块 ⇒ 取该次执行的事件流水（**懒取** + 缓存命中不请求 + 序号作废旧响应）。
  useEffect(() => {
    if (openId === null || eventsCache.has(openId)) return
    const id = openId
    const seq = eventsSeqRef.current + 1
    eventsSeqRef.current = seq
    setEventsBusy(true)
    setEventsError(null)
    fetchEvents(id)
      .then(list => {
        if (seq !== eventsSeqRef.current) return
        setEventsCache(prev => new Map(prev).set(id, list))
      })
      .catch((error: unknown) => {
        if (seq !== eventsSeqRef.current) return
        setEventsError(error instanceof Error ? error.message : String(error))
      })
      .finally(() => { if (seq === eventsSeqRef.current) setEventsBusy(false) })
  }, [openId, eventsCache])

  const loadMore = useCallback((): void => {
    if (loading || done || cursor === null) return
    if (error !== null) return          // 失败后暂停自动续拉：等用户点「重试」，避免哨兵反复触发
    if (rowsCountRef.current >= HARD_LIMIT) return
    void load(cursor)
  }, [loading, done, cursor, error, load])

  // 滚到底自动续拉：观察者**只建一次**（最新逻辑走 ref），不随分页状态重建。
  const loadMoreRef = useRef(loadMore)
  loadMoreRef.current = loadMore
  const ioRef = useRef<IntersectionObserver | null>(null)
  const observeSentinel = useCallback((el: HTMLDivElement | null) => {
    ioRef.current?.disconnect()
    if (el === null || typeof IntersectionObserver === 'undefined') return
    const io = new IntersectionObserver(entries => {
      if (entries[0]?.isIntersecting === true) loadMoreRef.current()
    })
    io.observe(el)
    ioRef.current = io
  }, [])
  useEffect(() => () => { ioRef.current?.disconnect() }, [])

  // 天分组：按取回顺序就地合并（同一天只有一个日期行，跨页追加亦然）。
  const days = useMemo(() => {
    const out: Array<{ key: string; items: InstanceRow[] }> = []
    for (const row of rows) {
      const key = dayKeyOf(row)
      const last = out[out.length - 1]
      if (last !== undefined && last.key === key) last.items.push(row)
      else out.push({ key, items: [row] })
    }
    return out
  }, [rows])

  const openSession = useCallback((sessionId: string): void => { onOpenSession?.(sessionId) }, [onOpenSession])
  /** 点块 = 切展开（手风琴：点另一条时上一条自动收起）。 */
  const toggleRow = useCallback((id: string): void => {
    setOpenId(cur => (cur === id ? null : id))
    setEventsError(null)
  }, [])
  const atLimit = rows.length >= HARD_LIMIT
  const rangeChanged = range.from !== initialRangeRef.current.from || range.to !== initialRangeRef.current.to
  /** 用户是否真的动过过滤器（决定空态文案：没动过 = 这段时间本来就没记录）。 */
  const touched = rangeChanged || workspace !== '' || bucket !== '' || taskId !== ''

  const changeWorkspace = useCallback((next: string): void => {
    setWorkspace(next)
    // 服务端在同时给 taskId 与 workspace 时两者叠加（AND）；这里再补一道：任务掉出新工作区就清掉，
    // 免得出现「工作区筛了 B、任务却还是 A 的那条」这种自相矛盾的组合。
    if (next === '' || taskId === '') return
    const current = tasks.find(o => o.id === taskId)
    if (current !== undefined && current.workspace !== next) setTaskId('')
  }, [taskId, tasks])

  /** 反查这一行属于哪个工作区（任务表 → 派发快照路径末段 → ''）。 */
  const workspaceOf = useCallback((row: InstanceRow): string => {
    const fromTasks = workspaceById.get(row.task_id)
    if (fromTasks !== undefined && fromTasks !== '') return fromTasks
    const snapshot = row.snapshot
    if (typeof snapshot !== 'string' || snapshot === '') return ''
    const hit = /"workspacePath"\s*:\s*"([^"]+)"/.exec(snapshot)
    return hit === null ? '' : baseNameOf(hit[1].replace(/\\"/g, '"'))
  }, [workspaceById])

  const footerHint = error !== null
    ? null
    : atLimit && !done
      ? t('recordsLimitHint')
      : done && rows.length > 0
        ? t('recordsNoMore')
        : loading
          ? t('recordsLoading')
          : null

  return h('div', { style: { width: '100%', display: 'flex', justifyContent: 'center' } },
    h('div', { id: PANEL_CONTENT_ID, style: PANEL_CONTENT_STYLE },
      // ── 过滤行：左 = 状态四档分段控件；右 = 时间范围 · 工作区 · 任务 ──
      h('div', { style: filterRowStyle },
        h(Segmented<StatusBucket | 'all'>, {
          value: bucket === '' ? 'all' : bucket,
          size: 'md',
          variant: 'inset',
          label: t('colStatus'),
          items: statusItems,
          onChange: (next: StatusBucket | 'all') => { setBucket(next === 'all' ? '' : next) },
        }),
        h('div', { style: filterRightStyle },
          h(TimeRange, {
            value: range, onChange: setRange,
            labels: rangeLabels, calendarLabels, timeLabels,
            precision: 'day', size: 'md',
          }),
          h(SelectField, {
            value: workspace,
            options: workspaceOptions,
            onChange: changeWorkspace,
            placeholder: t('listFilterWorkspaceAll'),
            emptyLabel: t('editorNoOptions'),
            ariaLabel: t('listFilterWorkspaceAll'),
            size: 'md',
            width: 180,
          }),
          h(TaskPicker, {
            value: taskId,
            onChange: setTaskId,
            options: tasks,
            scope: workspace,
            placeholder: t('recordsTaskPh'),
            emptyLabel: t('editorNoOptions'),
            ariaLabel: t('recordsTaskPh'),
            searchPlaceholder: t('recordsTaskSearch'),
            moreLabel: t('recordsMore'),
            collapseLabel: t('recordsCollapse'),
            outOfScopeHint: t('recordsOutOfScope'),
            size: 'md',
            width: 200,
          }),
        ),
      ),

      // 首屏取数：复用基础层 Loading（唯一实现；页面右下角浮动指示，锚在 PANEL_CONTENT_ID 上）。
      loading && !loaded ? h(Loading, { label: t('recordsLoading') }) : null,

      // ── 流水账：**没有外框**，内容直接铺在页面底上（空态 / 加载 / 失败态同样不带框）──
      rows.length === 0
        ? (error !== null
            ? h('div', { style: emptyStyle },
                h('span', { className: 'dsh-tdt-rec-err' }, `${t('recordsLoadFail')}：${error}`),
                h(Button, {
                  variant: 'outline', size: 'sm',
                  onClick: () => { void load(cursor) },
                }, t('recordsRetry')),
              )
            : loaded
              ? h('div', { style: emptyStyle }, touched ? t('recordsEmptyFiltered') : t('recordsEmpty'))
              : null)
        : h('div', null,
            days.map(day => h('div', { key: day.key, className: 'dsh-tdt-rec-group' },
              // 日期小字行：时钟图标 + 日期 · 星期 · N 条（不吸顶）。
              h('div', { className: 'dsh-tdt-rec-dayrow' },
                h(IconClockOutlineRegular, { size: 12 }),
                h('span', { className: 'dsh-tdt-rec-daylabel' }, dayLabelOf(day.key, dayFormatter)),
                h('span', { className: 'dsh-tdt-rec-sep' }, '·'),
                h('span', { className: 'dsh-tdt-rec-daylabel' }, weekdayOf(day.key, weekdayFormatter)),
                h('span', { className: 'dsh-tdt-rec-sep' }, '·'),
                h('span', { className: 'dsh-tdt-rec-daycount' }, tt('recordsDayCount', { n: day.items.length })),
              ),
              // 块与块之间 4px（`.dsh-tdt-rec-items` 的 gap）。
              h('div', { className: 'dsh-tdt-rec-items' },
                day.items.map(row => h(RecordItem, {
                  key: row.id,
                  row,
                  label: titleById.get(row.task_id) ?? row.task_id,
                  workspace: workspaceOf(row),
                  t,
                  tt,
                  // 前置清单来自实例快照（JSON 字符串）；原样传，条目内用 resolvedDepsOf 解析（零请求）。
                  snapshot: row.snapshot ?? null,
                  depTitleOf,
                  open: openId === row.id,
                  onToggle: toggleRow,
                  openSession,
                  openFile: onOpenFile,
                  events: openId === row.id ? eventsCache.get(row.id) ?? null : null,
                  eventsBusy: openId === row.id && eventsBusy,
                  eventsError: openId === row.id ? eventsError : null,
                  crossFmt: crossDayFormatter,
                })),
              ),
            )),
            // ── 加载区：哨兵触发续拉；失败给提示 + 重试；到下给文案；还有下一页给手动兜底 ──
            h('div', { ref: observeSentinel, style: { height: '1px' } }),
            h('div', { className: 'dsh-tdt-rec-foot' },
              error !== null ? h('span', { className: 'dsh-tdt-rec-err' }, `${t('recordsLoadFail')}：${error}`) : null,
              error !== null
                ? h(Button, { variant: 'outline', size: 'sm', onClick: () => { void load(cursor) } }, t('recordsRetry'))
                : footerHint !== null
                  ? h('span', null, footerHint)
                  : h(Button, { variant: 'outline', size: 'sm', onClick: loadMore }, t('recordsLoadMore')),
            ),
          ),
    ),
  )
}
