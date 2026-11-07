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
import { createElement as h, Fragment, memo, useCallback, useEffect, useMemo, useRef, useState, type CSSProperties } from 'react'
import {
  FileTypeIcon, IconAlarmClockOutlineRegular, IconChevronDownOutlineRegular, IconClockOutlineRegular,
  IconFolderCloseRegular, IconQueueOutlineRegular, Tooltip,
} from '@deepseek-ai/dsh-client-ui-primitives'
import { baseNameOf, formatDateTime, formatDurationHms, formatPlanStamp, formatTokenCount, pad2 } from './format'
import { resolvedDepsOf, type ResolvedDependency } from '../deps.js'
import { fetchEvents, fetchInstances, outputsOf, type EventRow, type InstanceRow } from './query'
import { ProcessFiles } from './process-files'
// 工作区标识口径（id ↔ 标题）唯一实现（用户 2026-11-06 存 id + 向下兼容）。
import { workspaceLabelOf } from './workspace-options'
import { isRunningStatus, statusesOfBucket, statusTextOf, statusToneOf } from './status-text'
import {
  Button, Chip, ensureRunningStyle, IconButton, ListRow, Loading, MarqueeText, PANEL_CONTENT_ID, PANEL_CONTENT_STYLE, Segmented, SelectField, StripCard, TaskPicker, type CardAccent,
  applyStyle,
} from './ui'
import type { EditorOption, TaskOption } from './ui'
import { useEvents, useResync } from './event-subscribe'
import { RUN_EVENT_TYPES } from '../event-catalog.js'
import { interpolateTranslate, type Translate } from './locales'
// 任务名可点（r12）走核心 Button `link` 档。
import { ensureTaskInfoStyle } from './task-info-css'
import { renderNextExec } from './time-text'

/** 每页条数（用户拍板「20 或 50，具体再看」⇒ 取 50）。 */
const PAGE_SIZE = 50
/** 硬上限：到此停止自动续拉并提示缩小范围（用户拍板「保底 2000 条」）。 */
const HARD_LIMIT = 2000
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
 * **自绘圆徽标**：元素里只放普通阿拉伯数字，圆交给 CSS（`.dsh-tdt-rec-depmark`）——
 * 固定 **20×20**（`min-width`/`min-height`/`aspect-ratio` 三道兜底，谁也别想把它拉扁）+ `border-radius:50%`
 * + 浅色实心 + 无描边 ⇒ **几位都是正圆**（2026-10-04 第八轮定稿；放大到 20 是用户要求：
 * 「还是椭圆，圆不圆一眼能看出」，实测 20px 圆配 11px 两位数字尚余 5px）。
 * ⚠️ 第七轮那版用 `min-width` + 横向 padding + `999px` 圆角，两位数字会被**撑成胶囊**，已废弃。
 * ⇒ 常量表与 `circledOf` 一并删除。
 */
const MAX_DEPMARKS = 20

/**
 * 展开区前置格里**产出物图标**的上限（用户 2026-10-04：「任务执行列表里产出基本上最多还是 5 个左右，
 * 你看一下这儿最多能排到多少个，排出来我看一眼」）⇒ 定 **5** 个 + 超出收 `+N`（点 `+N` 进那次上游的会话看全量）。
 */
const DEP_OUT_MAX = 5

// ── 样式（走基础层注入器，不自建 <style>；只消费 var(--dshpc-*)，间距/时长全走 token）──
const RECORDS_CSS = `
/* ── 执行记录流水账（**无容器**）───────────────────────────────────────────
   没有外框、没有贯穿竖轴：整页铺在宿主面板底上，节奏靠「日期小字行 + 一条条自带底色的独立块」建立。 */
.dsh-tdt-rec-group{margin-top:var(--dshpc-space-2);}
/* 日期小字行：时钟图标 + 日期 · 星期 · N 条（**不吸顶**——撤掉外框后底是透明的，
   吸顶必须给不透明底色，怕与宿主底色差出一条横带）。 */
.dsh-tdt-rec-dayrow{display:flex;align-items:center;gap:6px;flex:none;
  padding:var(--dshpc-space-3) 0 var(--dshpc-space-2);
  font-size:var(--dshpc-font-md);line-height:var(--dshpc-line-md);color:var(--dshpc-fg-3);}
.dsh-tdt-rec-dayrow>svg{flex:none;color:var(--dshpc-fg-3);}
.dsh-tdt-rec-daylabel{font-weight:500;color:var(--dshpc-fg-2);}
.dsh-tdt-rec-daycount{font-size:var(--dshpc-font-sm);color:var(--dshpc-fg-3);}
/* 块之间 **4px**（用户指定；--dshpc-space-1 正好 = 4px） */
.dsh-tdt-rec-items{display:flex;flex-direction:column;gap:var(--dshpc-space-1);}
/* 条目块 = **容器**（自带状态色浅底；底色由色调类给的局部变量驱动，见下）。
   ⚠️ 三层结构照任务卡片（用户 2026-10-04：「参考前面配置任务的展开」）：
     容器（**不可点**）→ 头部「.dsh-tdt-rec-head」（可点）→ 展开区（不可点，内容可复制）。
   容器**无 padding、无 cursor**：留白落在头部（这样 hover 高亮正好顶到块边，与卡片主行同观感）。 */
/* ⚠️ gap 必须是 0：展开时头部的高亮区要**紧贴**下面那条分隔线（用户 2026-10-05：中间别留距离）。 */
/* 左缘竖条与块底浅底色已归核心 StripCard（2026-11-06）⇒ 本仓不再自算色条宽度、也不维护色调变量。 */
/* 块底 / 左缘色条 / 浅底色 = 核心 StripCard（2026-11-06 改接，色调走 accent）⇒ 本仓只留块级动画。
   「预计执行」= 预期、未落实：在核心条带外再套一圈虚线（outline 不会被核心的 border 规则盖掉）。 */
.dsh-tdt-rec-item{position:relative;box-sizing:border-box;color:var(--dshpc-fg);font:inherit;text-align:left;
  animation:dsh-tdt-rec-in var(--dshpc-dur-fast) var(--dshpc-ease);}
.dsh-tdt-rec-item--planned{outline:1px dashed color-mix(in srgb,var(--dshpc-business) 50%,transparent);outline-offset:-1px;}
/* 运行中脉动：色条由核心渲染，本域只把统一 keyframe（ui/running.ts 的 dsh-tdt-run-pulse）挂到它上面。 */
.dsh-tdt-rec-item--running .dshpc-card__bar{animation:dsh-tdt-run-pulse var(--dshpc-dur-run) var(--dshpc-ease) infinite;}
@keyframes dsh-tdt-rec-in{from{opacity:0;transform:translateY(-2px)}to{opacity:1;transform:none}}
@media (prefers-reduced-motion: reduce){
  .dsh-tdt-rec-item{animation:none;}
}
/* ── 头部 = 块内两列（左列：标题 + 信息 + 备注 ／ 右列：一排控件）且是**唯一可点区域** ──
   留白放大（用户 2026-10-04：「左边的间距、上面、下面、右边都大点」）：上/下/右 12、左 16；
   **只有鼠标悬停**才叠一层中性半透明（不盖掉块底的状态色浅底）。
   ⚠️ 2026-10-04 第七轮：删掉「展开态常亮」——用户原话「如果我鼠标不移到这一块，它是不变色的，
   还是没展开时的颜色呀。只是鼠标移到这一块，它才换一个颜色」；展开与否**不再影响**头部底色。 */
/* 内距由核心 StripCard 统一给（12 / 12 / 12 / 20，色条已含在内）⇒ 头部不再自己加 padding。 */
.dsh-tdt-rec-main{display:flex;align-items:center;gap:var(--dshpc-space-3);min-width:0;padding:0;}
/* 2026-11-07：整卡 hover 变色改走核心 StripCard 的 hoverable，本仓不再自写 :hover。 */
.dsh-tdt-rec-head{cursor:pointer;}
.dsh-tdt-rec-left{display:flex;flex-direction:column;gap:var(--dshpc-space-1);flex:1 1 auto;min-width:0;}
.dsh-tdt-rec-right{display:flex;align-items:center;gap:var(--dshpc-space-2);flex:none;}
/* 状态标签（**仅非成功态**出）：**状态色实底 + 反色字**（用户 2026-10-05：「背景应该是相应的红/黄/蓝/灰，
   字是一个反色」）⇒ 底色按语义直接吃实面色，字走实面反色 --dshpc-on-signal，一眼就是个带色的牌子。
   ⚠️ 高度 / 圆角**跟着右列「查看会话」按钮走同一档令牌**，但**总高度比按钮矮 2px**（用户 2026-10-05 续：
     不要和按钮一模一样，总高 -2 ⇒ 24-2=22px，用固定的 height 减 2，padding / 圆角 / 字号**其他不变**）——
     高度 height:calc(var(--dshpc-control-h-sm) - 2px)（border-box ⇒ 含边框在内 22）、
     圆角 border-radius:var(--dshpc-radius-md)（按钮是 --md，不是 --sm）。
   ⚠️ 宽度仍**自适应**（不写 min-width，字多就长、字少就短）：padding 上下 3px / 左右 8px。 */
.dsh-tdt-rec-tag{box-sizing:border-box;display:inline-flex;align-items:center;justify-content:center;flex:none;
  height:calc(var(--dshpc-control-h-sm) - 2px);padding:3px 8px;border-radius:var(--dshpc-radius-md);
  background:var(--dshpc-fg-3);color:var(--dshpc-on-signal);
  font-size:var(--dshpc-font-xs);line-height:var(--dshpc-line-sm);white-space:nowrap;}
/* 标签底色按语义取实面色（块底的浅底已归核心 StripCard，这里只服务这枚小牌子）。 */
/* 「预计执行」标签：虚线描边、透明底（与「实底反色」的成败标签一眼区分；同色系蓝 = 预期）。 */
.dsh-tdt-rec-tag--planned{background:transparent;color:var(--dshpc-business);border:1px dashed color-mix(in srgb,var(--dshpc-business) 50%,transparent);}
.dsh-tdt-rec-r1{display:flex;align-items:center;gap:var(--dshpc-space-2);min-width:0;}
.dsh-tdt-rec-title{font-size:var(--dshpc-font-lg);font-weight:600;line-height:var(--dshpc-line-md);}
/* 信息行：**固定单行 + 溢出省略**（用户 2026-10-04：「多出的部分显示成 ...」）——
   最窄也要能放下「工作区 · 计划 · 实际 · 时长 · Token」的一部分，永不换行、永不横向滚动。 */
.dsh-tdt-rec-r2{display:block;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;
  font-size:var(--dshpc-font-sm);line-height:var(--dshpc-line-sm);color:var(--dshpc-fg-3);min-width:0;}
/* 信息行里的一段（「图标 + 标签 + 值」）；段与段之间的「·」由 ::before 自动补，不用手写分隔节点。 */
.dsh-tdt-rec-field{display:inline-flex;align-items:center;gap:4px;vertical-align:middle;}
.dsh-tdt-rec-field+.dsh-tdt-rec-field::before{content:'·';margin:0 var(--dshpc-space-1);color:var(--dshpc-border-heavy);}
/* 字段小图标**统一 12px**（= --dshpc-font-sm；用户 2026-10-04：几个图标一大一小、都缩小一号）
   —— 这里再兜一道：将来漏传 size 也不会又变大。 */
.dsh-tdt-rec-field>svg{flex:none;width:var(--dshpc-font-sm);height:var(--dshpc-font-sm);color:var(--dshpc-fg-3);}
.dsh-tdt-rec-sep{color:var(--dshpc-border-heavy);}
.dsh-tdt-rec-num{font-variant-numeric:tabular-nums;font-family:var(--dshpc-font-mono);}
.dsh-tdt-rec-chiprow{display:inline-flex;align-items:center;gap:2px;flex-wrap:nowrap;}
/* 展开箭头**不再自绘**：用基础层 IconButton（与任务配置卡片的箭头同一份实现，
   hover 底色 / 尺寸 / 翻转都一致）—— 2026-10-04 第五轮收编。 */
/* 折叠态：名字后面的**前置圈码**（有几个 = 本次执行实际用到了几个上游） */
.dsh-tdt-rec-depmarks{display:inline-flex;align-items:center;gap:var(--dshpc-space-1);flex:none;}
/* 前置圈码 = **自绘正圆徽标**（2026-10-04 第八轮定稿：浅色实心、无描边、**固定正圆**）。
   ⚠️ 复盘：上一版写成 min-width:18px + padding:0 3px + border-radius:999px ⇒ 一位数恰好是圆，
      两位数字会把圆**撑成胶囊**（用户 2026-10-04：「一定要是个圆的」「你要确定两位能显示成圆的」
      「现在这个太丑了」）。现在固定 width 与 height 相等 + border-radius:50% ⇒ 几位都是正圆。
   📏 尺寸依据（**实测**，非估计）：用容器里最宽的常见 UI 字体 DejaVu Sans 渲染，11px 下两位数字
      宽 15px，**20px 圆尚余 5px**；宿主界面字体（本插件**未引入任何外部字体**，文字继承宿主）比它更窄。
      另加 min-width / min-height / aspect-ratio 三道兜底 ⇒ 不论父级怎么排，它都是正圆。
   🎨 底色走 --dshpc-chip-bg（暗色主题自动换成白色 8%，与产出物 chip 同源）；悬停**只加深底色**、
      不再动描边（用户明确「不要描边，就要浅色实心圆」）。提示走官方 Tooltip（见折叠态渲染处）。 */
.dsh-tdt-rec-depmark{box-sizing:border-box;display:inline-flex;align-items:center;justify-content:center;flex:none;
  width:20px;height:20px;min-width:20px;min-height:20px;aspect-ratio:1/1;padding:0;border:none;border-radius:50%;
  background:var(--dshpc-chip-bg);
  color:var(--dshpc-fg-2);font-size:var(--dshpc-font-xs);line-height:1;font-weight:500;font-variant-numeric:tabular-nums;
  transition:background-color var(--dshpc-dur) var(--dshpc-ease),color var(--dshpc-dur) var(--dshpc-ease);}
.dsh-tdt-rec-depmark:hover{background:var(--dshpc-chip-bg-hover);color:var(--dshpc-fg);}
/* 折叠态前置圈码可点（开任务查看档）：清掉按钮默认外壳 + 手指（用户 2026-10-05）。
   ⚠️ 只继承 font-family、**不要 font:inherit**：font:inherit 会把数字字号拉成父级头部字号，
   使折叠态圈码比展开态（同款 class、固定 11px）数字大一圈——用户 2026-10-05 指出两处「1、2」大小不一致。 */
.dsh-tdt-rec-depmark--btn{appearance:none;-webkit-appearance:none;cursor:pointer;font-family:inherit;}
/* 2026-11-08：整格可点的手指 + hover 提亮已由核心 ListRow 接管（--click 那套自绘 hover 删除）。 */
/* 溢出项「+N」表达的是**还有几个**而不是第几个 ⇒ 3 个字符塞不进圆，单独一档保持胶囊（形状不参与「正圆」约定）。 */
/* 溢出项：把正圆的兜底解除（它是标签不是序号 ⇒ 内容多长就多长）。 */
.dsh-tdt-rec-depmark--more{width:auto;min-width:0;aspect-ratio:auto;padding:0 6px;border-radius:999px;}
/* 第 3 行：失败 / 未执行的原因（灰、单行省略，hover 看全文）—— 跨整块宽度 */
.dsh-tdt-rec-note{font-size:var(--dshpc-font-sm);color:var(--dshpc-fg-3);}
/* ── 展开区（点头部就地展开；手风琴，同时只开一条）───────────────────────
   ⚠️ **不可点、无 cursor**：展开出来的内容（产出物 / 前置 / 日志）要能直接拖选复制
      （用户 2026-10-04：整块可点的时代下面那块也是手指，内容不好复制）。 */
/* 展开区同样从竖条右缘起算 ⇒ 展开后的内容与头部标题**左对齐**（条子是通高的，也压在展开区上）。 */
/* 左右 / 底部内距同样由核心 StripCard 给，这里只留「与头部之间那 8px + 分隔线」。 */
/* 2026-11-07：分隔线上下各留 8px（原来只有线下有 padding，线贴着头部最后一行文字）。 */
.dsh-tdt-rec-exp{display:flex;flex-direction:column;gap:var(--dshpc-space-2);
  margin-top:var(--dshpc-space-2);padding:var(--dshpc-space-2) 0 0;
  border-top:1px solid var(--dshpc-border-faint);}
/* 产出物：**与「任务配置 → 附件区」一模一样的排布**（用户 2026-10-04：不占整行、限宽跑马灯）
   —— wrap 行内并排，底色 / 形状走基础层「行式文件按钮」的 --inline 形态。 */
.dsh-tdt-rec-expouts{display:flex;flex-wrap:wrap;gap:2px 10px;min-width:0;}
/* 事件流水：小标题 + 等宽小字逐行铺（与卡片「执行记录」下钻同口径：时间 / 事件 / 明细）。 */
.dsh-tdt-rec-evtitle{margin-bottom:6px;font-size:var(--dshpc-font-xs);font-weight:500;color:var(--dshpc-fg-3);}
/* 前置任务（展开区**第二排**）：**一排两个**（用户 2026-10-04），每格「左列两行 + 右列按钮」——
   左列：圈码 + 任务名 ／「执行于 2026-10-03 23:50:12」；右列：「查看会话」链接型小按钮（靠右 + 上下居中）。
   格子本身不可点（只有里面那个按钮可点）。
   ⚠️ 2026-10-04 第七轮三处返工：① 时间改**书面表达 + 全量长格式**（用户否掉「本次取自…」那种说法）；
   ② 按钮从信息行里挪出来落右列（无边框链接型）——顺带治好「两行中间被 24px 按钮撑高」的挤；
   ③ 留白与圆角整体放大到约 1.5~2 倍（用户：「看着就是贴边，很挤」「完全看不出来圆角」）。 */
.dsh-tdt-rec-depsec{display:flex;flex-direction:column;gap:var(--dshpc-space-2);min-width:0;}
.dsh-tdt-rec-depgrid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:var(--dshpc-space-2) var(--dshpc-space-3);}
/* 2026-11-08 用户点名：前置任务那个「带底色的框」改核心 ListRow（常态带底、hover 提亮、
   整行可点）。本仓**只留布局**：底色 / 圆角 / 内距 / hover 全交给核心，不再自绘第二套皮肤。 */
.dsh-tdt-rec-dep{min-width:0;}
.dsh-tdt-rec-depmid{display:flex;flex-direction:column;gap:var(--dshpc-space-1);min-width:0;overflow:hidden;}
/* 前置格**右列**：产出物图标 → 查看会话。**整列不折行**（用户 2026-10-04：页面拉伸时不要把内容
   压成折行）⇒ 挤的时候先让左列的名字 / 时间省略，右列控件始终完整可见。 */
.dsh-tdt-rec-depright{display:flex;align-items:center;gap:var(--dshpc-space-2);flex:none;white-space:nowrap;}
.dsh-tdt-rec-depname{display:flex;align-items:center;gap:var(--dshpc-space-2);min-width:0;
  font-size:var(--dshpc-font-sm);color:var(--dshpc-fg-2);}
.dsh-tdt-rec-depmeta{display:flex;align-items:center;gap:var(--dshpc-space-2);min-width:0;
  font-size:var(--dshpc-font-xs);color:var(--dshpc-fg-3);}
.dsh-tdt-rec-ev{font-family:var(--dshpc-font-mono);font-size:var(--dshpc-font-xs);
  line-height:var(--dshpc-line-md);color:var(--dshpc-fg-2);}
.dsh-tdt-rec-evrow{margin-bottom:6px;word-break:break-all;}
.dsh-tdt-rec-evempty{font-size:var(--dshpc-font-xs);color:var(--dshpc-fg-3);}
.dsh-tdt-rec-foot{display:flex;align-items:center;justify-content:center;gap:var(--dshpc-space-2);
  padding:var(--dshpc-space-3) 0 var(--dshpc-space-1);font-size:var(--dshpc-font-xs);color:var(--dshpc-fg-3);}
.dsh-tdt-rec-err{color:var(--dshpc-danger);}
`
const RECORDS_DOMAIN = 'domain:records'

const filterRowStyle: CSSProperties = {
  display: 'flex', alignItems: 'center', gap: 'var(--dshpc-space-2)', flexWrap: 'wrap', marginBottom: 'var(--dshpc-space-3)',
}
const filterRightStyle: CSSProperties = {
  display: 'flex', alignItems: 'center', gap: 'var(--dshpc-space-2)', marginLeft: 'auto', flexWrap: 'wrap',
}
const emptyStyle: CSSProperties = {
  padding: '40px 0', textAlign: 'center', fontSize: 'var(--dshpc-font-md)', color: 'var(--dshpc-fg-3)',
}

/** 本地日历日的 key（`YYYY-MM-DD`）。 */
function ymdOfDate(d: Date): string {
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`
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

// 路径末段 `baseNameOf` 已收编到 `format.ts`（唯一实现，M5）。

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
 * 语义色调 → 块的色调类名（色值本身全在 CSS 里读 --dshpc-* / --dshpc-*-soft，
 * 业务侧只做「哪一档」的映射；档位由 `status-text.ts` 的 `statusToneOf` 单源决定）。
 */
function toneAccentOf(tone: 'ok' | 'bad' | 'warn' | 'busy' | 'neutral' | 'planned'): CardAccent {
  if (tone === 'ok') return 'success'
  if (tone === 'bad') return 'danger'
  if (tone === 'warn') return 'warning'
  if (tone === 'busy' || tone === 'planned') return 'business'
  return 'neutral'
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

/**
 * 执行记录**条目块的唯一实现**（2026-10-06 提为导出：「任务日程」日历页拉开某天时用的就是它）。
 *
 * ⚠️ 别在别处再写一份执行条目的渲染 —— 状态色调 / 状态短名 / 产出物 / 前置圈码 / 事件流水
 * 这套东西只有这里一份。用它的页面**必须先调 `ensureRecordsStyle()`** 注入本域样式
 * （`.dsh-tdt-rec-*`，幂等），否则块没有皮肤。
 */
export interface RecordItemProps {
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
  /** 点任务名 ⇒ 右侧栏以**查看档**打开该任务（r12：全站任务名可点；不给 ⇒ 名字纯文本）。 */
  onViewTask?: (taskId: string) => void
  /**
   * 是否为「预计执行」（按当前任务配置推算、尚未产生实例）。与已发生**共用同一块渲染**（不另写一份块），
   * 仅在此模式下：虚线皮肤 + 状态标签写「预计执行」；实际执行 / 时长 / Token 没有真值 ⇒ 占位（未执行 / -- / --）；
   * 前置取 `plannedDeps`（任务定义的 depends_on），不读快照。
   */
  planned?: boolean
  /** 预计执行模式下的前置清单（来自任务定义 depends_on，已映射成 ResolvedDependency）。非预计模式忽略。 */
  plannedDeps?: ResolvedDependency[]
}

/** 一个执行块（**memo**：续拉时只有新增行需要 render，已挂的块不重算）。 */
export const RecordItem = memo(function RecordItem(props: RecordItemProps): ReturnType<typeof h> {
  const { row, label, workspace, t, tt, snapshot, depTitleOf, open, onToggle, openSession, openFile, events, eventsBusy, eventsError, crossFmt, onViewTask, planned, plannedDeps } = props
  const isPlanned = planned === true
  // 「预计执行」是独立语义档（不在 status 七态里）⇒ 直接定档，不走 statusToneOf / isRunningStatus。
  const tone: 'ok' | 'bad' | 'warn' | 'busy' | 'neutral' | 'planned' = isPlanned ? 'planned' : statusToneOf(row.status)
  const running = !isPlanned && isRunningStatus(row.status)
  ensureRunningStyle()
  /**
   * 状态标签（**仅非成功态**才出：绿 = 正常，大家都知道 ⇒ 不标签，用户 2026-10-05）。
   * ⚠️ 文案**直接用通用两字短名**（`statusTextOf` 单源：排队 / 派发 / 运行 / 成功 / 失败 / 跳过 / 未知）——
   *    用户 2026-10-05 纠正：不要另起一套长名（执行失败 / 未执行 / 执行中 / 未知状态），全站就认这一套短名。
   *    只有**色调**按这里分档（红 / 黄 / 蓝 / 灰），名字本身不再分叉。
   */
  const statusTag: { text: string; tone: 'bad' | 'warn' | 'busy' | 'neutral' | 'planned' } | null =
    isPlanned
      ? null
      : (row.status === 'succeeded'
        ? null
        : {
          text: statusTextOf(row.status, t),
          tone: row.status === 'failed' ? 'bad' : row.status === 'skipped' ? 'warn' : running ? 'busy' : 'neutral',
        })

  // 「预计执行」→「计划：」+ 倒计时：复用任务配置列表「下次预计执行时间」同一套（relativeFuture 每秒自刷 + 具体时刻），icon 同款。
  const plannedTagNode = isPlanned
    ? h('span', { className: 'dsh-tdt-rec-tag dsh-tdt-rec-tag--planned' },
      h('span', { style: { display: 'inline-flex', alignItems: 'center', gap: '4px', minWidth: 0 } },
        h(IconAlarmClockOutlineRegular, { size: 12 }),
        renderNextExec(row.scheduled_at, t),
      ))
    : null
  // 两桶产出（2026-10-10）：主文件照旧（折叠态图标行 / 展开区第一排），过程文件是次级折叠块。
  const outputs = outputsOf(row.outputs)
  const processOutputs = outputsOf(row.process_outputs)
  const sid = row.session_id
  const canOpenSession = sid !== null && sid !== ''
  const canOpenFile = canOpenSession && openFile !== undefined
  const tokens = (row.token_in ?? 0) + (row.token_out ?? 0)
  const note = row.note ?? ''
  const dayKey = dayKeyOf(row)
  // 时刻：默认只到分钟；跨天时由 `clockLabelOf` 显式标注（早一天 / 晚一天 / 具体日期）。
  const plannedText = clockLabelOf(row.scheduled_at, dayKey, crossFmt, t('recPrevDay'), t('recNextDay'))
  /** 时长的悬停提示：带起止时刻（有终态才给区间），比只显示「时长 03:00」有用得多。 */
  const durationHint = row.finished_at === null
    ? `${t('colDuration')}：${durationOf(row)}`
    : `${t('colDuration')}：${durationOf(row)}（${stampOf(row.dispatched_at ?? row.scheduled_at)} → ${stampOf(row.finished_at)}）`
  const actual = clockLabelOf(row.dispatched_at, dayKey, crossFmt, t('recPrevDay'), t('recNextDay'))
  // 本次执行**实际用到的**前置（快照里的 resolvedDeps；空 / 坏 JSON / 旧行 ⇒ []，不猜、更不读任务配置）。
  // 预计执行模式：前置来自任务定义的 depends_on（plannedDeps），不读快照。
  const deps = isPlanned ? (plannedDeps ?? []) : resolvedDepsOf(snapshot)
  const hasOutputs = outputs.length > 0
  // 过程文件也算「有内容」（2026-10-10）：只有过程文件的实例，展开箭头与展开区都必须照常出。
  const hasProcess = processOutputs.length > 0
  const hasDeps = deps.length > 0
  // 是否值得显示「展开」箭头：已执行块总能拉日志 ⇒ 永远可展开；预计执行块**只有「有前置」才值得**展开
  // （无产出、无前置、无实例 ⇒ 展开后什么都没有，不画空框、也不让箭头空转 —— 用户 2026-10-06）。
  const hasExpand = hasOutputs || hasProcess || hasDeps || !isPlanned
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
  /** 信息行里一段的**内层**（图标 + 文字；外层留给分隔符用）。 */
  const fieldInnerStyle: CSSProperties = { display: 'inline-flex', alignItems: 'center', gap: '4px', minWidth: 0 }

  /**
   * 信息行里的一段（可带图标）；值空则整段不出。
   * 悬停提示走**官方 Tooltip**（用户 2026-10-05：原生 title 太慢，一律改用官方件）——
   * 这里的 `span` 是真 DOM，Tooltip 挂得上 ref。
   */
  const field = (icon: ReturnType<typeof h> | null, text: string, title?: string): ReturnType<typeof h> | null => {
    if (text === '') return null
    // ⚠️ 外层 span 必须保持**相邻兄弟**——段间的「·」走 `.dsh-tdt-rec-field + .dsh-tdt-rec-field::before`；
    //    官方 Tooltip 会插一层包装元素，若套在外层就会把「·」挤掉、整行宽度来回跳（用户 2026-10-05 反馈）。
    //    ⇒ Tooltip 只能套在**里面**，外层 span 原样留着。
    const inner = h('span', { style: fieldInnerStyle }, icon, text)
    return h('span', { className: 'dsh-tdt-rec-field' },
      title === undefined ? inner : h(Tooltip, { label: title, side: 'top' }, inner))
  }

  // 「预计执行」模式：实际执行 / 时长 / Token 没有真值 ⇒ 占位（未执行 / -- / --），其余字段照常。
  const actualText = isPlanned ? `${t('recActual')} ${t('calNotExecuted')}` : (actual === '' ? '' : `${t('recActual')} ${actual}`)
  const actualIcon = isPlanned ? null : (actual === '' ? null : h(IconClockOutlineRegular, { size: 12 }))
  const actualTitle = isPlanned ? undefined : (row.dispatched_at === null ? undefined : `${t('colActualStart')}：${stampOf(row.dispatched_at)}`)
  const durationText = isPlanned ? `${t('colDuration')} --` : `${t('colDuration')} ${durationOf(row)}`
  const tokenNode = isPlanned
    ? null
    : (tokens > 0
      ? h('span', { className: 'dsh-tdt-rec-field dsh-tdt-rec-num' },
        h(Tooltip, {
          label: `${t('recTokenHint')}：${formatTokenCount(tokens)}\n${tt('recTokenDetail', {
            input: tokenPart(row.token_in), output: tokenPart(row.token_out), cache: tokenPart(row.token_in_cache),
          })}`,
          side: 'top',
        }, h('span', { style: fieldInnerStyle }, formatTokenCount(tokens))))
      : null)

  // 2026-11-08 核心 0.35.6：`hoverScope: 'head'` 只让头部变色，展开内容必须放进 `panel`
  // （放 children 会被塞进 __body ⇒ 点开后整块跟着变，用户点名的刺眼效果）。
  // 头部与展开区先各自算好，最后一次性交给 StripCard；容器仍不挂任何交互。
  const cardProps = {
    // 色条 + 浅底 = 核心 `StripCard`（成败色调走 accent，运行中由下方类名给核心色条挂统一脉动）。
    accent: toneAccentOf(tone),
    className: `dsh-tdt-rec-item${running ? ' dsh-tdt-rec-item--running' : ''}${tone === 'planned' ? ' dsh-tdt-rec-item--planned' : ''}`,
    hoverable: true,
    hoverScope: 'head' as const,
    expanded: open,
  }
  // ── 头部（**唯一可点区域**）：标题 + 信息 + 备注 + 右列控件（左缘竖条已由核心 StripCard 提供）──
  const head = h('div', { className: 'dsh-tdt-rec-main dsh-tdt-rec-head', onClick: onHeadClick },
      // ── 左列：标题 + 下面那排信息 ──
      h('div', { className: 'dsh-tdt-rec-left' },
        h('div', { className: 'dsh-tdt-rec-r1' },
          // 标题**不撑满**（`0 1 auto`）：后面的前置圈码要紧跟名字，而不是被推到行尾。
          // 任务名可点（r12 用户：全站任务名都连到查看档）——头部点击=就地展开的既有行为不变，
          // 点名字掐掉冒泡改开查看档；未接 onViewTask 时保持纯文本。
          onViewTask === undefined
            ? h(Tooltip, { label, side: 'top' },
              h('span', { style: { flex: '0 1 auto', minWidth: 0, display: 'flex' } },
                h(MarqueeText, {
                  text: label,
                  className: 'dsh-tdt-rec-title dsh-tdt-ellipsis',
                })))
            : h(Tooltip, { label, side: 'top' },
              h('span', { style: { flex: '0 1 auto', minWidth: 0, display: 'flex' } },
                h(Button, {
                  variant: 'link', size: 'sm',
                  // 整行点击已是反馈，名字再变蓝是多余（用户 2026-10-05）：色随文，只留可点。
                  style: { minWidth: 0, color: 'inherit', fontSize: 'inherit' },
                  onClick: (event: { stopPropagation: () => void }) => {
                    event.stopPropagation()
                    onViewTask(row.task_id)
                  },
                },
                  h(MarqueeText, {
                    text: label,
                    className: 'dsh-tdt-rec-title dsh-tdt-ellipsis',
                  })))),
          // 前置圈码（用户 2026-10-04）：**本次执行实际用到的**上游有几个就画几个，一个都没有就什么都不画；
          // 提示走**官方 Tooltip**（2026-10-04 第八轮换掉原生 title —— 用户嫌原生提示慢）。
          //   ⚠️ 官方 Tooltip 的 children 必须是**真 DOM**（它给子元素挂 ref，裸组件会静默失效）——
          //      这里的 span 正好合适。`side: 'top'`：气泡往标题行上方弹，不压住下一行。
          deps.length === 0
            ? null
            : h('span', { className: 'dsh-tdt-rec-depmarks' },
              deps.slice(0, MAX_DEPMARKS).map((dep, index) => {
                // 折叠态前置圈码也直接可点（与展开态同一口径：除「查看会话」外整块开任务查看档）。
                const mark = onViewTask === undefined
                  ? h('span', { className: 'dsh-tdt-rec-depmark' }, String(index + 1))
                  : h('button', {
                    type: 'button',
                    className: 'dsh-tdt-rec-depmark dsh-tdt-rec-depmark--btn',
                    onClick: (event: { stopPropagation: () => void }) => {
                      event.stopPropagation()
                      onViewTask(dep.task)
                    },
                  }, String(index + 1))
                return h(Tooltip, {
                  key: `${dep.task}#${dep.instanceId}`,
                  label: tt('recordsDepTip', { n: String(index + 1), task: depTitleOf(dep.task) }),
                  side: 'top',
                }, mark)
              }),
              deps.length > MAX_DEPMARKS
                ? h(Tooltip, { label: t('listSectionDepends'), side: 'top' },
                  h('span', { className: 'dsh-tdt-rec-depmark dsh-tdt-rec-depmark--more' },
                    `+${deps.length - MAX_DEPMARKS}`))
                : null,
            ),
        ),
        // 信息行：工作区 · 🕰计划 · 🕐实际 · ⟳时长 · Token（单行、溢出省略；Token 从右下角迁到这里）
        // ⚠️ 每段都挂**带标签的完整值**的悬停提示（用户 2026-10-04：光看「32K」「15:10」不知道是什么）。
        h('div', { className: 'dsh-tdt-rec-r2' },
          field(null, workspace, workspace === '' ? undefined : `${t('listFieldWorkspace')}：${workspace}`),
          field(h(IconAlarmClockOutlineRegular, { size: 12 }), plannedText === '' ? '' : `${t('recPlan')} ${plannedText}`,
            `${t('colPlanned')}：${formatPlanStamp(row.scheduled_at)}`),
          field(actualIcon, actualText, actualTitle),
          field(h(IconQueueOutlineRegular, { size: 12 }), durationText, durationHint),
          tokenNode,
        ),
        // ── 第 3 行：失败 / 未执行的原因（用户：执行错了就是要看备注）──
        // ⚠️ 放在**左列**里（不是块下）：右列控件相对「标题 + 信息 + 备注」整体居中，
        //    否则一出现第三行，右列那排按钮就会看着偏上（用户 2026-10-04 点名）。
        // ⚠️ **不挂气泡**（用户 2026-10-05）：备注本身就显示出来了，悬停再弹一份是重复。
        note === ''
          ? null
          : h('div', { className: 'dsh-tdt-rec-note dsh-tdt-ellipsis' }, `${t('colNote')}：${note}`),
      ),
      // ── 右列：一排控件（产出物图标 → 查看会话按钮 → 展开箭头）──
      h('div', { className: 'dsh-tdt-rec-right' },
        outputs.length === 0
          ? null
          : h('span', { className: 'dsh-tdt-rec-chiprow' },
            // 硬性规定：只给图标、没有文件名的位置 ⇒ 悬停**必须**显示文件名（含后缀），走官方 Tooltip。
            outputs.slice(0, 3).map(path => h(Tooltip, {
              key: path,
              label: baseNameOf(path),
              side: 'top',
            }, h(IconButton, {
              variant: 'plain',
              size: 'md',
              icon: path.endsWith('/') ? h(IconFolderCloseRegular, { size: 16 }) : h(FileTypeIcon, { path, size: 16 }),
              label: baseNameOf(path),
              // 气泡交给上面的核心 Tooltip；压掉 IconButton 默认的原生 title。
              title: '',
              disabled: !canOpenFile,
              onClick: (event) => {
                event.stopPropagation()
                if (canOpenFile) openFile?.(sid as string, path)
              },
            }))),
            outputs.length > 3
              // Chip 的 onClick 不收事件 ⇒ 外层 span 只负责 stopPropagation（别把整行展开）。
              ? h('span', { onClick: (event: { stopPropagation(): void }) => { event.stopPropagation() } },
                h(Chip, { size: 'xs', onClick: () => { onToggle(row.id) } }, `+${outputs.length - 3}`))
              : null,
          ),
        // 只有这个按钮开会话（没有会话就不出现 —— 不给假入口；块本身仍可展开）。
        // 状态标签：红 / 黄 / 蓝 / 灰才出，排在「查看会话」**前面**。
        // ⚠️ **不挂备注气泡**（用户 2026-10-05）：有备注的那些，备注已经显示在下面那行 ⇒ 悬停再弹纯属重复。
        plannedTagNode,
        statusTag === null
          ? null
          : h(Chip, {
            size: 'xs',
            tone: statusTag.tone === 'bad' ? 'danger' : statusTag.tone === 'warn' ? 'warning' : statusTag.tone === 'busy' ? 'business' : 'neutral',
          }, statusTag.text),
        canOpenSession
          ? h(Button, {
            variant: 'outline',
            size: 'sm',
            onClick: (event: { stopPropagation(): void }) => { event.stopPropagation(); openSession(sid as string) },
          }, t('viewSession'))
          : null,
        // 展开箭头 = **与任务卡片头部逐字一致**的写法（用户 2026-10-04：抄任务配置那套，
        // 连鼠标移上去都要一样）：基础层 IconButton（plain + sm = 24×24，hover 走 --dshpc-hover）
        // + chevron + aria-expanded + 展开翻转。外面包一层 span 拦冒泡（否则会先触发自己的 onClick
        // 再冒泡到整块 ⇒ 展开后立刻又收起）。故意**不挂 title**：图标自明，只留无障碍名（与卡片同理）。
        // ⚠️ 预计执行且无前置（也没有产出/日志）⇒ **不画箭头**（展开后是空框、毫无意义 —— 用户 2026-10-06）。
        hasExpand
          ? h('span', { onClick: (event: { stopPropagation(): void }) => { event.stopPropagation() } },
            h(IconButton, {
              variant: 'plain',
              size: 'sm',
              icon: h(IconChevronDownOutlineRegular, { size: 14 }),
              label: t('listExpandHint'),
              // 气泡不是必要信息（箭头自明）⇒ 连同 IconButton 默认的原生 title 一起压掉（2026-11-06）。
              title: '',
              onClick: () => { onToggle(row.id) },
              'aria-expanded': open,
              style: { transform: open ? 'rotate(180deg)' : 'none' },
            }),
          )
          : null,
      ),
    )
  // ── 展开区（**不可点、无 cursor**：内容要能直接拖选复制）：第一排产出物 → 第二排前置任务 →
  //    再往下是该次执行的事件流水。父级已不可点 ⇒ 不再需要拦冒泡。 ──
  // ⚠️ 只有当**确有内容**（有产出 / 有前置 / 日志非空 / 拉取出错）时才渲染展开区本身——
  //    否则连那条分隔线 + 内边距都不要画，免得空点一下只露一个空框（用户 2026-10-06）。
  const expandedPanel = (open && (hasOutputs || hasProcess || hasDeps || eventsError !== null || (events !== null && events.length > 0)))
    ? h('div', { className: 'dsh-tdt-rec-exp' },
        outputs.length === 0
          ? null
          : h(Fragment, null,
            // 2026-11-07：补回主文件排的小标题，与「其他产出」「前置任务」「执行日志」同级。
            // 历史核查：本展开区从未有过这个标题；会话弹窗顶部的「交付文件」区块是 2026-09-28
            // 因官方交付卡无区块标题被用户否决删除的，与此无关。这里按「产出 / 其他产出」成对补回。
            h('div', { className: 'dsh-tdt-rec-evtitle' }, t('colOutputs')),
            h('div', { className: 'dsh-tdt-rec-expouts' },
              outputs.map(path => h(Button, {
                key: path,
                // 文件行 = 核心 Button 的 ghost 档（图标 + 文字；2026-11-06 全站收口，不再用行式文件按钮类）。
                variant: 'ghost', size: 'sm',
                icon: path.endsWith('/') ? h(IconFolderCloseRegular, { size: 14 }) : h(FileTypeIcon, { path, size: 14 }),
                disabled: !canOpenFile,
                onClick: () => { if (canOpenFile) openFile?.(sid as string, path) },
                style: { flex: '0 0 auto', maxWidth: '100%' },
                // 文件名**限宽 40ch + 超长跑马灯**（与卡片附件区同一口径；用户：设个最大宽度，超过了就跑马灯）
              }, h(MarqueeText, { text: baseNameOf(path), style: { maxWidth: '40ch', minWidth: 0 } }))),
            ),
          ),
        // 过程文件（次级）：跟在主文件那排之后，同样可点开预览。
        h(ProcessFiles, {
          paths: processOutputs,
          defaultOpen: true,
          onOpen: canOpenFile ? (path: string): void => { openFile?.(sid as string, path) } : undefined,
          t,
        }),
        // ── 第二排：前置任务（用户 2026-10-04：**一排显示两个**；每格两行，能点开那次上游的会话）──
        deps.length === 0
          ? null
          : h('div', { className: 'dsh-tdt-rec-depsec' },
            h('div', { className: 'dsh-tdt-rec-evtitle' }, t('listSectionDepends')),
            h('div', { className: 'dsh-tdt-rec-depgrid' },
              deps.map((dep, index) => {
                // 上游那次的**产出物**：图标排在「查看会话」**左边**，一点就打开预览
                // （用户 2026-10-04：「产出物的图标要排在方便查看的位置，最好是能一点就打开」）。
                // 上限 `DEP_OUT_MAX`（参考「任务列表里产出通常 5 个左右」）；超出收 `+N`（点它进会话看全量）。
                // ⚠️ 快照解析器给的就是**数组**（不是 JSON 串），别再走 outputsOf 解析一遍。
                const depOuts = Array.isArray(dep.outputs) ? dep.outputs : []
                const depSid = dep.sessionId
                const depHasSid = depSid !== null && depSid !== ''
                const depCanOpen = openFile !== undefined && depHasSid
                // 2026-11-08 用户点名：这个「带底色的框」改核心 `ListRow`（常态带底 + hover
                // 提亮 + 整行可点），本仓只管左右两槽里装什么，不再自己画底 / 圆角 / 内距。
                return h(ListRow, {
                  key: `${dep.task}#${dep.instanceId}`,
                  className: 'dsh-tdt-rec-dep',
                  hoverable: true,
                  // 整行可点开该前置任务的查看档（用户 2026-10-05）；核心 `actions` 槽外层自带
                  // stopPropagation ⇒ 右列按钮不会连带触发整行。
                  onClick: onViewTask === undefined ? undefined : () => { onViewTask(dep.task) },
                  // ── 右列（**整列不折行**，用户 2026-10-04：拉伸时别把内容压成折行）──
                  //    顺序：产出物图标 → 查看会话。
                  actions: h('div', { className: 'dsh-tdt-rec-depright' },
                    depOuts.length === 0
                      ? null
                      : h('span', { className: 'dsh-tdt-rec-chiprow' },
                        // ≤上限全显；**超出就少显示一个、末位换成「…」**（用户 2026-10-05：点它进那次上游的会话看全量）。
                        depOuts.slice(0, depOuts.length > DEP_OUT_MAX ? DEP_OUT_MAX - 1 : DEP_OUT_MAX).map(path => h(Tooltip, {
                          key: path,
                          label: baseNameOf(path),
                          side: 'top',
                        }, h(IconButton, {
                          variant: 'plain',
                          size: 'md',
                          icon: path.endsWith('/') ? h(IconFolderCloseRegular, { size: 16 }) : h(FileTypeIcon, { path, size: 16 }),
                          label: baseNameOf(path),
                          // 气泡交给上面的核心 Tooltip；压掉 IconButton 默认的原生 title。
                          title: '',
                          disabled: !depCanOpen,
                          onClick: (event) => {
                            event.stopPropagation()
                            if (depCanOpen) openFile?.(depSid as string, path)
                          },
                        }))),
                        depOuts.length > DEP_OUT_MAX
                          ? h('button', {
                            type: 'button',
                            className: 'dsh-tdt-chip dsh-tdt-chip--label',
                            'aria-label': t('viewSession'),
                            disabled: !depHasSid,
                            onClick: (event: { stopPropagation(): void }) => {
                              event.stopPropagation()
                              if (depHasSid) openSession(depSid as string)
                            },
                          }, '…')
                          : null,
                      ),
                    // 上游那次没有会话 ⇒ **不出按钮**（不给假入口）。有会话才落右列。
                    // 2026-11-08 用户点名：不要纯文字链接，改核心 `secondary` 档 = 灰底、无描边。
                    depHasSid
                      ? h(Button, {
                        size: 'sm',
                        variant: 'secondary',
                        onClick: (event: { stopPropagation: () => void }) => {
                          event.stopPropagation()
                          openSession(depSid as string)
                        },
                      }, t('viewSession'))
                      : null,
                  ),
                },
                  h('div', { className: 'dsh-tdt-rec-depmid' },
                    h('div', { className: 'dsh-tdt-rec-depname' },
                      h('span', { className: 'dsh-tdt-rec-depmark' }, String(index + 1)),
                      // 任务名可点（r12）⇒ 右侧栏以查看档打开这个前置任务；未接回调时保持纯文本。
                      onViewTask === undefined
                        ? h(Tooltip, { label: depTitleOf(dep.task), side: 'top' },
                          h('span', { className: 'dsh-tdt-ellipsis' }, depTitleOf(dep.task)))
                        : h(Tooltip, { label: depTitleOf(dep.task), side: 'top' },
                          h(Button, {
                            variant: 'link', size: 'sm',
                            style: { minWidth: 0, fontSize: 'inherit' },
                            onClick: (event: { stopPropagation(): void }) => {
                              event.stopPropagation()
                              onViewTask(dep.task)
                            },
                          }, h('span', { className: 'dsh-tdt-ellipsis' }, depTitleOf(dep.task)))),
                    ),
                    !isPlanned && h('div', { className: 'dsh-tdt-rec-depmeta' },
                      // 「执行于 <完整时刻>」—— 书面表达 + **全量长格式**（用户 2026-10-04 第七轮：否掉
                      // 「本次取自前一天…」那种口语说法，「哪一天、几点几分几秒，全都给显示出来」）。
                      // 单行省略、悬停看全量；stampOf = formatDateTime(iso, { seconds: true })。
                      h(Tooltip, { label: stampOf(dep.scheduledAt), side: 'top' },
                        h('span', { className: 'dsh-tdt-ellipsis' },
                          tt('recordsDepFrom', { time: stampOf(dep.scheduledAt) }))),
                    ),
                  ),
                )
              }),
            ),
          ),
        eventsError !== null
          ? h('div', { className: 'dsh-tdt-rec-evempty dsh-tdt-rec-err' }, `${t('cardLoadFailed')}：${eventsError}`)
          : eventsBusy
            // 硬性规定：**不新建 / 不改造 Loading**，也**不写「加载中」文案** ⇒ 还在拉就**空着**（用户 2026-10-05）。
            ? null
            : events === null
              ? null
              // 日志为空 ⇒ 不画空框（用户 2026-10-06：点了展开下面什么都没有，就不要露一个空框）。
              : events.length === 0
                ? null
                // 有事件才出小标题（空态不占标题行）；行间距拉开、字色压暗一档（与卡片下钻同口径）。
                : h('div', { className: 'dsh-tdt-rec-ev' },
                  h('div', { className: 'dsh-tdt-rec-evtitle' }, t('recEventsTitle')),
                  events.map(event => h('div', { key: event.seq, className: 'dsh-tdt-rec-evrow' },
                    h('span', { style: { color: 'var(--dshpc-fg-3)' } }, `${stampOf(event.ts)} `),
                    h('span', { style: { color: 'var(--dshpc-fg-2)' } }, `${event.kind} `),
                    h('span', { style: { color: 'var(--dshpc-fg-2)' } }, event.detail ?? ''),
                  )),
                ),
      )
    : null
  return h(StripCard, { ...cardProps, panel: expandedPanel }, head)
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
  /** 点任务名 ⇒ 右侧栏以查看档打开该任务（r12：全站任务名可点）；不给 ⇒ 名字纯文本。 */
  onViewTask?: (taskId: string) => void
}

/**
 * 执行记录条目块的样式注入（**幂等**，2026-10-06）：本域 `.dsh-tdt-rec-*` + 条目块依赖的共享域
 * `task-info`（任务名可点的皮肤）。复用 `RecordItem` 的页面**调这一个就够**，不要自己再拼一遍。
 */
export function ensureRecordsStyle(): void {
  applyStyle(RECORDS_DOMAIN, RECORDS_CSS)
  ensureTaskInfoStyle()
}

/** 执行记录总查询页（流水账）。 */
export function RecordsTimelineView(props: RecordsTimelineProps): ReturnType<typeof h> {
  ensureRecordsStyle()
  const { t, tasks, workspaces, onOpenSession, onOpenFile, onViewTask } = props
  const tt = useMemo(() => interpolateTranslate(t), [t])

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
  /** 在途期间到达的「静默重载首屏」请求（事件 / 重连补读）：本轮结束立刻补跑一次，**不能丢**。 */
  const pendingReloadRef = useRef(false)
  const rowsCountRef = useRef(0)
  rowsCountRef.current = rows.length
  /** 事件请求序号：快速切块时作废旧响应，别把 A 的事件贴到 B 上。 */
  const eventsSeqRef = useRef(0)

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
  const filterSig = `${workspace}|${bucket}|${taskId}`

  const load = useCallback(async (nextCursor: string | null, silent = false): Promise<void> => {
    if (inFlightRef.current) {
      // ⚠️ 在途时**不能静默丢弃**刷新请求（2026-10-06 审计 🔴）：事件恰好撞上一次在途请求
      // （用户下拉续拉 / 首屏未回）时，那一行就永远停在旧状态 —— 本页的 5s 轮询已删，没有自愈路径。
      // 记下待办，等本轮结束立刻补跑一次（与主列表 `pendingRef` 同一套思路）。
      if (silent && nextCursor === null) pendingReloadRef.current = true
      return
    }
    inFlightRef.current = true
    const seq = seqRef.current + 1
    seqRef.current = seq
    if (!silent) setLoading(true)
    setError(null)
    try {
      const page = await fetchInstances({
        workspace: workspace === '' ? undefined : workspace,
        statuses: bucket === '' ? undefined : statusesOfBucket(bucket),
        taskId: taskId === '' ? undefined : taskId,
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
        // 补跑被在途那轮吞掉的「静默重载首屏」（事件 / 重连补读）。
        if (pendingReloadRef.current) {
          pendingReloadRef.current = false
          void load(null, true)
        }
      }
    }
  }, [workspace, bucket, taskId])

  // 过滤条件变化（含首次挂载）⇒ 作废在途请求 + 重置列表 + 取第一页 + 收起已展开的块。
  // ⚠️ 上限只拦「续拉」（见 loadMore）：首屏永远允许取 ⇒ 满 2000 条后改过滤不会白屏。
  useEffect(() => {
    seqRef.current += 1
    inFlightRef.current = false
    pendingReloadRef.current = false // 换筛选后本 effect 自己取首页 ⇒ 旧的补跑待办作废
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

  /**
   * 刷新由**事件推送**驱动（design/client-refresh-disposition.md §二 P1）：原来的「有在跑才 5s 轮询」
   * 已删除。订阅运行态事件，**在屏判定**——该实例（或该任务）在当前列表里才静默重载首屏，离屏忽略。
   * （断线兜底见 event-subscribe.ts 的统一重连：连不上 >30s 自动重建，连上即补读一次。）
   */
  useEvents(RUN_EVENT_TYPES, (event) => {
    const evInstanceId = event.payload?.instanceId
    const evTaskId = event.payload?.taskId
    // ① 该实例（或该任务的某一行）**已在列表里** ⇒ 静默重载首屏（状态 / 产出 / 时长可能都变了）。
    const onLoadedRow = rows.some(r =>
      (typeof evInstanceId === 'string' && r.id === evInstanceId)
      || (typeof evTaskId === 'string' && r.task_id === evTaskId))
    // ② 还没进列表的（典型：某任务**这次是第一行**）⇒ 只要它能落在**当前筛选内**就刷。
    // ⚠️ 2026-10-06 审计 🔴：少了这一条，新任务首跑 / 当前已加载页里没有该任务行时，事件全被忽略，
    // 而 5s 轮询已删 ⇒ 页面开着也永远看不到这次执行（日历页有 overview 兜底，本页原来没有）。
    const mayAppear = typeof evTaskId === 'string'
      && (taskId === '' || taskId === evTaskId)
      && (workspace === '' || workspaceById.get(evTaskId) === workspace)
    if (onLoadedRow || mayAppear) void load(null, true)
  })
  useResync(() => { void load(null, true) })

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
  /** 用户是否真的动过过滤器（决定空态文案：没动过 = 本来就没有记录）。 */
  const touched = workspace !== '' || bucket !== '' || taskId !== ''

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
        : null

  return h('div', { style: { width: '100%', display: 'flex', justifyContent: 'center' } },
    h('div', { id: PANEL_CONTENT_ID, style: PANEL_CONTENT_STYLE },
      // ── 过滤行：左 = 状态四档分段控件；右 = 时间范围 · 工作区 · 任务 ──
      h('div', { style: filterRowStyle },
        // ⚠️ 无描边 + 选中片统一 business 色（用户 2026-11-06：全站滑轨都这档）。
        h(Segmented<StatusBucket | 'all'>, {
          value: bucket === '' ? 'all' : bucket,
          size: 'md',
          bordered: false,
          tone: 'business',
          label: t('colStatus'),
          items: statusItems,
          onChange: (next: StatusBucket | 'all') => { setBucket(next === 'all' ? '' : next) },
        }),
        h('div', { style: filterRightStyle },
          h(SelectField, {
            value: workspace,
            options: workspaceOptions,
            onChange: changeWorkspace,
            placeholder: t('listFilterWorkspaceAll'),
            emptyLabel: t('editorNoOptions'),
            ariaLabel: t('listFilterWorkspaceAll'),
            size: 'md',
            width: 120,
            // 工作区候选可能很多：下拉必须带搜索框（核心 Picker 自带，全站统一口径）。
            searchable: true,
          }),
          h(TaskPicker, {
            value: taskId,
            onChange: setTaskId,
            allOption: { value: '', label: t('listFilterTaskAll') },
            options: tasks,
            scope: workspace,
            placeholder: t('recordsTaskPh'),
            emptyLabel: t('editorNoOptions'),
            ariaLabel: t('recordsTaskPh'),
            searchPlaceholder: t('recordsTaskSearch'),
            moreLabel: t('recordsMore'),
            outOfScopeHint: t('recordsOutOfScope'),
            size: 'md',
            width: 150,
          }),
        ),
      ),

      // 加载（**首屏 + 下拉续拉**）一律走**页面右下角统一的那一个** Loading
      // （用户 2026-10-04：没有我的特殊认可，不许在任何其他地方再建 Loading 点）
      // ⇒ 页脚不再自己显示「加载中」；「已加载完 / 到上限」这类**结果提示**照旧在页脚显示。
      loading ? h(Loading, { anchorId: 'dsh-tdt-main' }) : null,

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
                  // 展示当前标题（定义里存 id）；查不到的工作区（历史执行）原样显示路径末段。
                  workspace: workspaceLabelOf(workspaces, workspaceOf(row)),
                  t,
                  tt,
                  // 前置清单来自实例快照（JSON 字符串）；原样传，条目内用 resolvedDepsOf 解析（零请求）。
                  snapshot: row.snapshot ?? null,
                  depTitleOf,
                  open: openId === row.id,
                  onToggle: toggleRow,
                  openSession,
                  openFile: onOpenFile,
                  onViewTask,
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
