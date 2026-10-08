// task-list.tsx — 主界面任务列表视图（2026-09-30，design/features/main-panel.md）。
//
// 形态：限宽居中的卡片列表。每张卡片 = 状态条 + 标题 + 执行方式 + 上次 / 下次 + 创建于 + 两个操作。
// 排序按「时间轴」：运行中 → 已启用按下次执行升序 → 已完结（无下次） → 已关闭沉底。
//
// **效率约定（用户 2026-09-30 明确要求）**：卡片数据全来自 `GET /tasks/overview`（服务端内存摘要，
// 不查库），**由事件推送触发重读**并带 `rev` 比对——未变只回 `{unchanged:true}`（原 10 秒轮询已删，
// 见 design/client-refresh-disposition.md §二 P2）；「10 分钟后 → 9 分钟后」这类相对时间由
// **本地计时器**渲染，不产生请求、也不触发重排。
//
// **即时性**：拨片（启用 / 停用）走「本地乐观更新 + 立刻重新拉一次」，不等任何周期
// ——服务端在写库成功后会同步任务表快照，所以重新拉的这一次就能拿到新值。
//
// 官方组件：Switch / Menu / Input / 图标 一律取 primitives（本仓库惯例：能官方不手绘）；
// 卡片外壳官方没有列表件 ⇒ 自绘，颜色全走宿主主题变量。
import { createElement as h, Fragment, useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { baseNameOf, formatClock, formatDateTime, formatDurationHms, formatPlanStamp, formatTokenCount, formatTokenDetail, formatYmd, pad2 } from './format'
import {
  FileTypeIcon, IconAlarmClockOutlineRegular, IconChevronDownOutlineRegular,
  IconClockOutlineRegular, IconEditOutlineRegular,
  IconPlayOutlineRegular, IconSearchOutlineRegular,
  Input, Menu, Switch, Tooltip,
} from '@deepseek-ai/dsh-client-ui-primitives'
// 任务信息展示层（2026-10-05 上提为共享件）：基础信息纸表格 / 上次执行明细 / 状态图标 / 人话转换。
// ⚠️ **与右侧栏「查看档」共用同一份实现** —— 要改字段怎么翻译、怎么渲染，去 `task-info.tsx`，不许在本文件再抄一份。
import {
  infoConfigStyle, infoGroupTitleStyle, infoRecentStyle, infoWrapStyle,
  LAST_RUN_STATUSES, lastRunFields, StatusIcon, taskInfoBaseFields, type TaskInfoBaseView,
} from './task-info'
// 时间文案层（2026-10-06 从 task-info.tsx 归位到独立模块；唯一实现，别处不许再写一份）。
import { clockOf, NO_TIME, nextExecLabel, relativePast, renderNextExec, sameCalendarDay } from './time-text'
import { ensureTaskInfoStyle } from './task-info-css'
// 事件推送（2026-10-07 补缺口）：卡片展开面板的 `runSig` 覆盖不到行级运行态变化，见下方 `pushNonce`。
import { useEvents, useResync } from './event-subscribe'
import { RUN_EVENT_TYPES } from '../event-catalog.js'
import { interpolateTranslate, type Translate } from './locales'
import { scheduleSpecFromSchedule, scheduleText } from './schedule-text'
// 三面板数据通道（决策 55）：执行记录 / 日志 / 事件时间线，与未来总查询页共用同一套 fetch。
import { fetchEvents, fetchInstances, fetchLogs, outputsOf, type EventRow, type InstanceRow, type LogRow } from './query'
// 状态通用短名单源（用户 2026-10-02：状态名别各处各写一份）。
import { INSTANCE_STATUSES, statusesOfBucket, statusTextOf, statusToneOf } from './status-text'
// 排序键（`sortRows`）；`justCrossedSlot` 随「到点钳位」整套删除（决策 54：抖动由**服务端**冻结
// 未处理刻度解决，客户端不再有任何本地派生排序状态）。
import { sortRows } from '../task-sort.js'
// 取数层（2026-10-06 从本页面文件归位：页面只该有视图，design/client-refresh-disposition.md §四 W2）。
import { debugLogOrder, dueLoadingMs, useTaskOverview, type RunNowOutcome, type TaskOverviewRow } from './task-overview'
import { calendarLabelsOf, timeLabelsOf } from './editor-fields'
import { ensureTaskEditorStyle } from './task-editor-css'
// 浮层结果提示（立即执行成功 / 被拒）：全站唯一实现，不许各处手写。
import { FloatingToast, ensureToastStyle } from './toast-css'
// UI 基础层（P1/P2/P3）：分段控件 / 按钮 / 图标钮 / 输入唯一实现。
import { applyStyle, Button, ensureRunningStyle, IconButton, Input as TdtInput, LiveText, Loading, MarqueeText, PANEL_CONTENT_ID, PANEL_CONTENT_STYLE, RUN_PULSE_CLASS, RUNNING_TONE, RunningBlocks, Segmented, SelectField, TimeRange, rangeToQuery, useNowMs, type EditorOption, type TimeRangeLabels, type TimeRangeValue } from './ui'


// ── 主题变量（与 index.ts 的 C 同款：全走宿主变量 + 兜底）──
const transition = `background var(--tdt-dur) var(--tdt-ease), color var(--tdt-dur) var(--tdt-ease), border-color var(--tdt-dur) var(--tdt-ease)`
/** 等宽字体：倒计时数字用它 + tabular-nums ⇒ 字宽固定，不会左右蹦。 */
const monoFont = 'var(--tdt-font-mono, ui-monospace, SFMono-Regular, Menlo, Consolas, monospace)'
// `NO_TIME` 占位与「时间社交化表达 / 秒级心跳 / LiveText / renderNextExec」已于 2026-10-05
// 上提共享层 ⇒ `task-info.tsx`（卡片与右侧栏查看档共用同一份）。
/** 顶部一排的统一高度：搜索框 / 工作区下拉 / 分组按钮 / 新建全部同高（用户 2026-09-30 要求）。
 *  工作区下拉的高由基础层 `SelectField` 的 `size:'md'` 保证（= 同一档 28），不再自绘外壳。 */
const CONTROL_H = 'var(--tdt-control-h-md)'
/** 工作区下拉的**定长**宽度（比搜索框略宽一点；切选项时宽度不变）。 */
const WS_WIDTH = 180

// ── 顶部一排的样式注入（官方 Input 默认 32px 高，需压到与按钮同高）──
const TASK_LIST_CSS = [
  // 状态条运行中脉动改走统一 keyframe（ui/running.ts 的 dsh-tdt-run-pulse），此处不再各定义一份。

  // 官方 Input 默认 32px 高 + 0.5px 边框 ⇒ 压到与按钮同高，并统一成同一套观感。
  // ⚠️ 必须 box-sizing:border-box：官方那 0.5px 边框若加在 28 之外，搜索框外框会比「工作区下拉」高约 2px
  //    （用户 2026-10-01 点名「搜索框比下拉高两个像素」的根因）。下拉侧由基础层 `SelectField size="md"` 同高。
  // ⚠️ **圆角不在这里写**：搜索框只挂宿主基类 `Input` + 前导放大镜（`icon`  prop），圆角随基类走，
  //    与旁边的 `SelectField` 天然一致；此前手写的 `border-radius:radius-sm` 是覆盖基类、导致圆角与众不同的根因，已删。
  `.dsh-tdt-tl-input, .dsh-tdt-tl-input > * { box-sizing: border-box; height: ${CONTROL_H}; }`,
  `.dsh-tdt-tl-input { width: ${WS_WIDTH}px; }`,
  `.dsh-tdt-tl-input input { box-sizing: border-box; height: ${CONTROL_H}; font-size: var(--tdt-font-sm); }`,
  // 记录表头吸顶（内容区定高滚动、表头不动）：原注释声称由 `.dsh-tdt-rec-head th` 接管，
  // 但迁移时这条规则丢了、表头实际不吸顶；这里补回，底色随卡片面（--tdt-surface-1）免得滚动时透内容。
  '.dsh-tdt-rec-head th { position: sticky; top: 0; z-index: 1; background: var(--tdt-head-bg); }',
  // 任务卡片：底色 + **hover 微高亮**（用户 2026-10-03）。
  // 底色必须写在这里而不是 inline style —— inline 会盖掉下面的 `:hover`。
  // 高亮用**淡蓝** `--tdt-card-hover`：灰色高亮在卡片底色上几乎看不出来。
  '.dsh-tdt-card { background: var(--tdt-surface-1); }',
  // hover 只作用在**主行**（`dsh-tdt-card-row`：标题 / 状态 / 开关 / 箭头那一溜基本信息）。
  // 展开区是兄弟节点、不在这个 div 里 ⇒ 即便展开了，下面的设置 / 记录 / 日志也**不会**跟着变蓝
  // （否则展开后整页发蓝，反而晃眼，用户 2026-10-03）。
  '.dsh-tdt-card-row:hover { background: var(--tdt-card-hover); }',
  // 行 hover 高亮（用户 2026-10-02：斑马纹之上再给一层鼠标反馈）。
  // 特异性 (0,2,0) > `.dsh-tdt-rec-alt` (0,1,0) ⇒ 能盖住斑马纹底色。
  '.dsh-tdt-rec-row:hover { background: var(--tdt-plate-hover); }',
  // ⚠️ 产出物图标底板**已上提基础层**（2026-10-04）：改用 `.dsh-tdt-chip`（`ui/controls-css.ts`）。
  // 原先这里与执行记录页各写一份**同名不同皮**的 `.dsh-tdt-rec-out`，两份 CSS 都注入同一页面
  // ⇒ 谁后注册谁生效、两页外观互相污染；现在是全站唯一实现。
  // 基础信息右栏「产出物」文件行 / 附件行：hover 给一层底色（用户 2026-10-03）。
  // ⚠️ 2026-10-04 **已上提基础层**为 `.dsh-tdt-filechip`（`ui/controls-css.ts`，带 --block / --inline 两个形态类）
  // —— 执行记录页展开区要用同一种观感，这里不再各写一份。
  // ⚠️ 基础信息「标签—值」纸表格 / 「任务会话」/ 前置任务可点 / 状态图标配色 = **2026-10-05 已上提共享层**：
  // 卡片展开区与右侧栏**查看档**共用同一份 ⇒ 规则迁至 `task-info-css.ts`（域 `domain:task-info`，
  // 两处渲染前各调一次 `ensureTaskInfoStyle()`）。这里只留执行记录表格自己那一条。
  // 执行记录表格（用户 2026-10-02）：**不用实线分隔**，改行**交错浅底**（斑马纹，很浅的灰 `--tdt-plate`）。
  '.dsh-tdt-rec-alt { background: var(--tdt-plate); }',
].join('\n')

/** 幂等注入（走 ui/style.ts 单一 <style>）。 */
const ensureTaskListStyle = (): void => { applyStyle('domain:list', TASK_LIST_CSS) }


// ── 文案与时间 ─────────────────────────────────────────────────────────
// ⚠️ 排期人话（卡片「执行方式」/ 编辑器「预计执行」）**不在这里写**——统一在
// [`./schedule-text.ts`](./schedule-text.ts)（用户 2026-09-30 拍板：同一个排期不许两处各写一份文案，
// 真机已出现「周一…每 10 分钟执行一次」vs「每天每 10 分钟执行一次」）。此处只把任务定义的
// `schedule` 交给它。

// ── 时间「社交化」表达（2026-09-30 用户要求；分级取 GitHub / Telegram 一类公认口径）──
// 过去：刚刚 → N 分钟前 → N 小时前 → N 天前 → N 周前 → N 个月前 → N 年前；
// 未来：即将执行 → N 分钟后 → 今天/明天 HH:mm → N 天后 → N 周后 → N 个月后 → N 年后。
// 具体时刻一律放进 hover Tooltip（listLastFullTitle / listNextFullTitle）。
/** 完整时刻（tooltip 用）：解析失败给占位符 `—`（不编造时间）。 */
const formatFull = (iso: string): string => formatDateTime(iso, { fallback: '—' })

// `sameCalendarDay` / `relativePast` / `relativeFuture` 已上提共享层 ⇒ `task-info.tsx`。



// 全局秒级心跳（subscribeTicker）/ `LiveText` / `clockOf` 已上提共享层 ⇒ `task-info.tsx`。


// ── 排序（时间轴：马上要跑的最上，关闭的沉底）──────────────────────────
// 实现在 [`../task-sort.ts`](../task-sort.ts)：放 `src/` 是为了让冒烟能**真断言**（client 侧只能 grep 产物）。
// 除分组排序外，那里还有「到点钳位」的判定与时长（排序抖动，2026-09-30）。

// ── FLIP 动画：卡片「下去 / 上来」平滑位移（自研，不引包）──────────────
function useFlip(signature: string): (id: string) => (el: HTMLElement | null) => void {
  const nodes = useRef(new Map<string, HTMLElement>())
  const prevTop = useRef(new Map<string, number>())

  useLayoutEffect(() => {
    const moved: Array<[HTMLElement, number]> = []
    for (const [id, el] of nodes.current) {
      const top = el.getBoundingClientRect().top
      const prev = prevTop.current.get(id)
      // 只动画「位置真变了」的卡片：几百条里通常只有 1–3 张在动。
      if (prev !== undefined && Math.abs(prev - top) > 0.5) moved.push([el, prev - top])
      prevTop.current.set(id, top)
    }
    if (moved.length === 0) return
    if (window.matchMedia?.('(prefers-reduced-motion: reduce)').matches === true) return
    for (const [el, delta] of moved) {
      el.style.transition = 'none'
      el.style.transform = `translateY(${delta}px)`
    }
    const frame = requestAnimationFrame(() => {
      for (const [el] of moved) {
        el.style.transition = `transform 260ms var(--tdt-ease)`
        el.style.transform = ''
      }
      window.setTimeout(() => { for (const [el] of moved) el.style.transition = '' }, 320)
    })
    return () => { cancelAnimationFrame(frame) }
  }, [signature])

  // ref 回调必须**跨渲染稳定**（否则每次渲染都会 detach/attach，白白触发测量）。
  const callbacks = useRef(new Map<string, (el: HTMLElement | null) => void>())
  return useCallback((id: string): ((el: HTMLElement | null) => void) => {
    const hit = callbacks.current.get(id)
    if (hit !== undefined) return hit
    const fn = (el: HTMLElement | null): void => {
      if (el === null) {
        nodes.current.delete(id)
        // 卸载时一并清掉「回调缓存」与「上次坐标」——否则长会话里随历史任务 id 无界增长，
        // 且 id 复用时用陈旧坐标做错误位移动画（2026-09-30 专家团复核）。
        callbacks.current.delete(id)
        prevTop.current.delete(id)
      } else {
        nodes.current.set(id, el)
      }
    }
    callbacks.current.set(id, fn)
    return fn
  }, [])
}

// ── 状态条（StatusRail）───────────────────────────────────────────────
// 命名：中文「**状态条**」，组件 `StatusRail`——它是贴在卡片左缘、与正文两行等高的竖向色条，
// 比原来的小圆点显眼得多（用户 2026-09-30：只给个点儿出颜色，看不清）。
const RAIL_W = 6
const RAIL_H = 36

/** 运行中：整条**蓝色**明暗脉动（颜色 / 脉动形状全在 `ui/running.ts` 一处定，前后两端统一）。 */
function RunningRail() {
  ensureRunningStyle()
  return h('span', {
    className: `${RUN_PULSE_CLASS} dsh-tdt-rail`,
    style: {
      display: 'inline-block', width: `${RAIL_W}px`, height: `${RAIL_H}px`, flex: 'none',
      borderRadius: 'var(--tdt-radius-xs)', background: RUNNING_TONE,
    },
  })
}

function StatusRail(props: { row: TaskOverviewRow; t: Translate }) {
  const { row, t } = props
  if (row.running) return h(RunningRail, {})
  // `skipped` = 「未执行」（决策 54 补记的终态行：附件找不到 / 工作区不存在等任务级错误）——
  // 必须**和失败一样显眼**（用户：都是这个任务出错了），但提示要说清是「没执行」而不是「跑砸了」。
  const color = !row.enabled
    ? 'var(--tdt-fg-3)'
    : row.lastStatus === 'failed' || row.lastStatus === 'skipped' ? 'var(--tdt-danger)' : 'var(--tdt-success)'
  const hint = !row.enabled
    ? t('statusRailOff')
    : row.lastStatus === 'failed'
      ? t('statusRailLastFailed')
      : row.lastStatus === 'skipped'
        ? t('statusRailLastSkipped')
        : t('statusRailRunning')
  return h('span', {
    title: hint,
    style: {
      display: 'inline-block', width: `${RAIL_W}px`, height: `${RAIL_H}px`, flex: 'none',
      borderRadius: 'var(--tdt-radius-xs)', background: color,
      transition: `background var(--tdt-dur) var(--tdt-ease)`,
    },
  })
}

/**
 * 「历史执行」与「下次执行」是**两个独立**小标签（2026-09-30 用户拍板：不要合成一格四段，
 * 拆成两块更清爽）。每个标签 = 语义底色的图标格 + 时间格，整体一个圆角细边框。
 * - 历史执行：成功绿 / 失败红 / 无状态灰，图标 = 历史时钟；时间格当天 HH:mm、跨天「3 小时前 / 1 天前」。
 * - 下次执行：图标 = 闹钟；时间格一天以内 = HH:mm:ss **秒级倒计时**（LiveText 自转），
 *   超过 24 小时 = 明天 / 三天后 / N 周后。
 *
 * ⚠️ 悬浮提示包在**整个标签**外层，且 Tooltip 的子元素必须是**真 DOM 元素**（`h('div', …)`）——
 * 官方 Tooltip 靠给子元素挂 ref 实现，子元素若是普通函数组件（如 `LiveText`）ref 挂不上 ⇒
 * 提示**静默失效**（用户 2026-09-30 真机反馈「移上去没提示」的根因，与 task-editor 里
 * 「图标要包真 `<button>`」是同一个坑）。
 */
const pillOuterStyle: Record<string, string | number> = {
  display: 'inline-flex', alignItems: 'stretch', flex: 'none', height: '20px',
  borderRadius: 'var(--tdt-radius-sm)', overflow: 'hidden', border: `1px solid var(--tdt-border)`,
}
/** 图标格：语义底色 + 图标（成功绿 / 失败红 / 无状态灰 / 下次中性）。 */
const pillIconCell = (bg: string, fg: string): Record<string, string | number> => ({
  display: 'inline-flex', alignItems: 'center', padding: '0 6px', background: bg, color: fg, flex: 'none',
})
/** 时间格：**等宽数字**（tabular-nums + 代码字体）⇒ 倒计时每秒变化不会因字宽不同而左右蹦。 */
const pillTimeCell: Record<string, string | number> = {
  display: 'inline-flex', alignItems: 'center', padding: '0 8px', background: 'var(--tdt-surface-1)', color: 'var(--tdt-fg)',
  fontSize: 'var(--tdt-font-xs)', lineHeight: 'var(--tdt-line-xs)', whiteSpace: 'nowrap',
  fontVariantNumeric: 'tabular-nums', fontFamily: monoFont,
}

/** 历史执行标签（成功绿 / 失败红 / 无状态灰）。 */
function PastPill(props: { row: TaskOverviewRow; t: Translate; tt: Translate }) {
  const { row, t, tt } = props
  const has = row.lastStatus !== null && row.lastScheduledAt !== null
  // 2026-09-30 用户拍板：`skipped` = **未执行**（附件找不到 / 工作区不存在 / 被吃掉的槽补记）——
  // 那是「这个任务坏了、且不会自己好」⇒ **必须显眼标红**。用户原话：不能让用户觉得天下太平、
  // 也不能「有的错误去翻日志、有的在记录里」，看不出门道。
  // `unknown`（重启收口）仍中性：它会被下一轮正常收掉。⇒ 只有 succeeded / unknown 不染红。
  const colored = has && row.lastStatus !== null && row.lastStatus !== 'unknown'
  const bg = !has || row.lastStatus === 'unknown'
    ? 'var(--tdt-surface-3)'
    : row.lastStatus === 'succeeded' ? 'var(--tdt-success)' : 'var(--tdt-danger)'
  const title = has ? tt('listLastFullTitle', { when: formatFull(row.lastScheduledAt ?? '') }) : t('listNever')
  return h(Tooltip, { label: title, side: 'bottom' },
    h('div', { style: pillOuterStyle },
      // ⚠️ 图标前景跟着底色走：白字只配「绿 / 红」实底；中性浅灰底（无状态 / skipped / unknown）
      // 必须用常态文字色，否则白图标压在浅灰上几乎看不见（2026-09-30 复核）。
      h('span', { style: pillIconCell(bg, colored ? 'var(--tdt-on-signal)' : 'var(--tdt-fg-2)') }, h(IconClockOutlineRegular, { size: 12 })),
      h(LiveText, {
        style: pillTimeCell,
        render: (nowMs: number): string => {
          if (!has) return NO_TIME
          const iso = row.lastScheduledAt ?? ''
          return sameCalendarDay(new Date(iso), new Date(nowMs)) ? clockOf(iso) : relativePast(iso, nowMs, tt)
        },
      }),
    ),
  )
}

/**
 * 下次执行标签。**三种状态**（用户 2026-09-30 拍板：不要去判断补跑时间）：
 * - **运行中** ⇒ 不显示倒计时（下一槽要等这趟跑完才算），改显「三个小方块脉动」的活动指示；
 * - 未运行 ⇒ 一天以内 = `HH:mm:ss` 秒级倒计时（`LiveText` 自转），超过 24 小时 = 明天 / 三天后 / N 周后；
 * - 无后续 ⇒ 占位符。
 *
 * ⚠️ 悬浮提示包在**整个标签**外层，且 Tooltip 的子元素必须是**真 DOM 元素**（`h('div', …)`）——
 * 官方 Tooltip 靠给子元素挂 ref 实现，子元素若是普通函数组件（如 `LiveText`）ref 挂不上 ⇒
 * 提示静默失效（用户 2026-09-30 真机反馈「移上去没提示」的根因）。
 */
function NextPill(props: { row: TaskOverviewRow; t: Translate; tt: Translate }) {
  const { row, t, tt } = props
  // ⚠️ 悬浮文案必须与下面那格（`LiveText`）在**"到点"那一秒**同步 —— 用户 2026-09-30 真机撞上过
  // 「方块已切过来、文案却还写着『下次执行：<刚过去的时间>』」。2026-10-06 已**并入全局心跳**
  // （`useNowMs`，同一条 timer）⇒ 本组件不再自建第二个 1s interval
  // （design/client-refresh-disposition.md §三 M1）。
  const nowMs = useNowMs()
  if (row.running) {
    return h(Tooltip, { label: t('listRunning'), side: 'bottom' },
      h('div', { style: pillOuterStyle },
        h('span', { style: pillIconCell(RUNNING_TONE, 'var(--tdt-on-signal)') }, h(IconAlarmClockOutlineRegular, { size: 12 })),
        h('span', { style: { ...pillTimeCell, color: RUNNING_TONE } }, h(RunningBlocks, {})),
      ),
    )
  }
  // 被挡住时（上游没完成 / 附件找不到 / 上一轮还在跑…）把**具体原因**并进这**一个**悬浮提示，
  // 放在通用说明前面（用户要求「鼠标移上去能看到说明」）。原因由服务端随行下发。
  //
  // ⚠️ 2026-09-30 评审 P1：延期徽标此前**又套了一层 Tooltip** ⇒ 悬停同时冒出**两个气泡**
  // （外层通用说明 + 内层原因）。现在全组件**只有这一层** Tooltip（子元素为真 DOM 节点，
  // 裸函数组件挂不上 ref ⇒ 提示会静默失效，2026-09-30 那次真机教训）。
  // 已到点（`nextSlotAt` 是**过去时刻**）⇒ 这一格现在是"三块脉动"或"延期"，
  // **不能再说「下次执行：<一个已经过去的时间>」**（用户 2026-09-30 真机点名）。三种档位：
  //   ① 还在 loading 上界内 ⇒ 「运行中」（与真在跑同一句，用户明确说不用区分）；
  //   ② 超上界 ⇒ 「延期」（有具体原因就带上）；
  //   ③ 未到点 ⇒ 原来的「下次执行：…」。
  const dueNow = row.nextSlotAt !== null && Date.parse(row.nextSlotAt) <= nowMs
  const deferredTitle = typeof row.blockedReason === 'string' && row.blockedReason !== ''
    ? `${row.blockedReason}｜${tt('listDeferredTitle')}`
    : tt('listDeferredTitle')
  const title = dueNow
    ? (nowMs - Date.parse(row.nextSlotAt ?? '') <= dueLoadingMs() ? t('listRunning') : deferredTitle)
    : (typeof row.blockedReason === 'string' && row.blockedReason !== ''
        ? deferredTitle
        : (row.nextSlotAt === null
            ? t('listNextNone')
            : tt('listNextFullTitle', { when: formatFull(row.nextSlotAt) })))
  return h(Tooltip, { label: title, side: 'bottom' },
    h('div', { style: pillOuterStyle },
      h('span', { style: pillIconCell('var(--tdt-surface-3)', 'var(--tdt-fg)') }, h(IconAlarmClockOutlineRegular, { size: 12 })),
      h(LiveText, {
        style: pillTimeCell,
        render: (nowMs: number): ReactNode => {
          if (row.nextSlotAt === null) return NO_TIME
          const diff = Date.parse(row.nextSlotAt) - nowMs
          // 已到点（`diff <= 0`）⇒ **不再显示「即将执行」**，直接显三个方块的活动指示（用户 2026-09-30 拍板）。
          // 服务端闸门生效后「到点」= `nextSlotAt` 是过去时刻且该槽还没被处理（`!row.running`）。
          if (diff <= 0) {
            // ① 上界内 ⇒ 三个方块（正在等派发，视觉上就是「在跑」）——**与「运行中」同色（蓝）**。
            //    2026-09-30 评审 P1：此前这里继承正文色（黑），跟运行中的蓝对不上，看着像两回事。
            if (-diff <= dueLoadingMs()) {
              return h('span', { style: { display: 'inline-flex', alignItems: 'center', color: RUNNING_TONE } }, h(RunningBlocks, {}))
            }
            // ② 超上界仍未 `running` ⇒ **「延期」**：该槽已经过了但还没真正开始执行
            //    （上游没跑完 / 附件缺失 / 串行互斥）。**不能一直装成在跑**（决策 54 红线），
            //    也**不再显示「即将执行」**那句（用户 2026-09-30 点名去掉）。
            return h('span', { style: { cursor: 'default', opacity: 0.85 } }, tt('listDeferred'))
          }
          return nextExecLabel(row.nextSlotAt, nowMs, tt)
        },
      }),
    ),
  )
}

// ── 卡片 ───────────────────────────────────────────────────────────────
const cardStyle: Record<string, string | number> = {
  display: 'block', width: '100%', boxSizing: 'border-box', textAlign: 'left',
  marginBottom: '10px', borderRadius: 'var(--tdt-radius-sm)',
  border: `1px solid var(--tdt-border)`, color: 'var(--tdt-fg)',
  transition: `border-color var(--tdt-dur) var(--tdt-ease), background var(--tdt-dur) var(--tdt-ease)`,
  // ⚠️ **background 不放这里**：inline 背景的优先级高于 CSS class，会盖掉 `.dsh-tdt-card-row:hover` 的高亮。
  // 底色走 CSS（`.dsh-tdt-card`）；hover 高亮走 `.dsh-tdt-card-row:hover`（只作用主行，展开区不跟着蓝）。
}
// ⚠️ 不带 `color`（r13 修）：标题可点后走 `.dsh-tdt-info-dep` 的 hover 变蓝——inline color 会把 :hover 压死
//（鼠标移上去不变色的根因）；纯文本分支继承根色（--tdt-fg），观感不变。
const titleStyle: Record<string, string | number> = { fontSize: 'var(--tdt-font-lg)', fontWeight: 600, lineHeight: 'var(--tdt-line-md)' }
const metaStyle: Record<string, string | number> = { fontSize: 'var(--tdt-font-sm)', color: 'var(--tdt-fg-2)', lineHeight: 'var(--tdt-line-sm)', marginTop: '2px' }
const faintStyle: Record<string, string | number> = { fontSize: 'var(--tdt-font-xs)', color: 'var(--tdt-fg-3)', lineHeight: 'var(--tdt-line-sm)', marginTop: '2px' }
// 基础信息的布局常量（`infoWrapStyle` / `infoConfigStyle` / `infoRecentStyle` / `infoGroupTitleStyle`）
// 与纸表格一行（`InfoField`）、状态→色（`infoStatusColorOf`）、`baseNameOf` / `durationMsOf`
// 已于 2026-10-05 **上提共享层** ⇒ `task-info.tsx`（卡片展开区与右侧栏「查看档」共用同一份）。
// ── 展开区三面板（决策 55，design/features/task-expand-panels.md §三）──────────────────
/** 内容区**定高**（用户 2026-10-02：矮内容显矮、切 tab 高度蹦）——三个 tab 一律同高，内容多就内部滚。 */
const PANEL_H = 360
/** 定高盒：flex 列 —— 过滤行固定在外、滚动只发生在内容盒（P0 结构，三个 tab 共用）。
 *  `position: relative` 保留为内部绝对定位子元素的上下文。 */
const panelBoxStyle: Record<string, string | number> = {
  height: `${PANEL_H}px`, display: 'flex', flexDirection: 'column', minHeight: 0,
  position: 'relative',
}
/**
 * 延迟出现的忙碌标记（用户 2026-10-02）：请求 **超过 400ms 还没返回**才亮。
 * 本地 SQLite 大多数查询是毫秒级，零点几秒的 loading 用户根本看不见，还会闪一下 —— 所以先不显示。
 * 亮起后请求一返回就立刻消失（`BUSY_HOLD_MS = 0`，无保底停留）。
 */
const BUSY_DELAY_MS = 400
const BUSY_HOLD_MS = 0
function useDelayedBusy(active: boolean): boolean {
  const [shown, setShown] = useState(false)
  const shownAtRef = useRef(0)
  useEffect(() => {
    if (active) {
      if (shown) return
      const timer = setTimeout(() => { shownAtRef.current = Date.now(); setShown(true) }, BUSY_DELAY_MS)
      return () => { clearTimeout(timer) }
    }
    if (!shown) return
    // 已亮起 ⇒ 补足到保底时长再消失（保证肉眼看得见）。
    const wait = Math.max(0, BUSY_HOLD_MS - (Date.now() - shownAtRef.current))
    const timer = setTimeout(() => { setShown(false) }, wait)
    return () => { clearTimeout(timer) }
  }, [active, shown])
  return shown
}
/** 盒内可滚动区（撑满剩余高度；过滤行 / 表头不在此盒内 ⇒ 不随内容滚）。 */
const panelScrollFillStyle: Record<string, string | number> = {
  flex: '1 1 auto', minHeight: 0, overflowY: 'auto',
}
const panelWrapStyle: Record<string, string | number> = {
  // 卡片不再统一留白后，展开区自己补左右 / 下内边距，否则内容贴边。
  // 顶部间距交给主行的 12px 下内边距，这里不再留 marginTop（只留虚线 + 10px 上内边距）。
  borderTop: `1px dashed var(--tdt-border)`, paddingTop: '10px', paddingLeft: '14px', paddingRight: '14px', paddingBottom: '12px',
}
const panelBarStyle: Record<string, string | number> = {
  // 表底**贴着**虚线（用户 2026-10-02）：去掉上外边距，只留虚线上方的内边距。
  // 面板总高不变（`panelBoxStyle` 定高 + 内容区 flex:1 自动吃掉这 10px）。
  paddingTop: '10px', borderTop: `1px dashed var(--tdt-border)`,
  display: 'flex', alignItems: 'center', gap: '8px',
}
const miniTableStyle: Record<string, string | number> = { width: '100%', borderCollapse: 'collapse', fontSize: 'var(--tdt-font-sm)' }
const miniCellStyle: Record<string, string | number> = {
  // 行更松（用户 2026-10-02：「上下拉高一点、大气些」）；**不用实线分隔** ⇒ 去掉 borderBottom，
  // 改行交错浅底（`.dsh-tdt-rec-alt`）。
  padding: '9px 10px', textAlign: 'left',
  color: 'var(--tdt-fg)', whiteSpace: 'nowrap', fontSize: 'var(--tdt-font-sm)',
}
const miniCellWrapStyle: Record<string, string | number> = { ...miniCellStyle, whiteSpace: 'normal', wordBreak: 'break-word' }
/** 居中格（用户 2026-10-02：除**产出物 / 备注**两列外，各列内容一律居中）。 */
const miniCellCenterStyle: Record<string, string | number> = { ...miniCellStyle, textAlign: 'center' }
/**
 * 日志**整区**（用户 2026-10-03 取代原 `logBoxStyle` 黑框）：不再套一个框——
 * 上沿一条线（与执行记录表头上沿线同色 `--tdt-border`），从这条线到下方虚线**整块铺底色**，
 * 日志直接铺在里面。等宽字体跟环境风格走。
 */
const logAreaStyle: Record<string, string | number> = {
  ...panelScrollFillStyle,
  borderTop: `1px solid var(--tdt-border)`,
  background: 'var(--tdt-surface-1)',
  // 左右**不留 padding**（用户 2026-10-03）：让日志左边缘与上方过滤下拉框对齐。
  padding: '10px 0',
  fontFamily: monoFont, fontSize: 'var(--tdt-font-xs)', lineHeight: 'var(--tdt-line-sm)',
}
/** 日志行：行间距拉开一点（用户 2026-10-03）。 */
const logRowStyle: Record<string, string | number> = { marginBottom: '6px', wordBreak: 'break-all' }
const overlayStyle: Record<string, string | number> = {
  position: 'fixed', inset: 0, zIndex: 'var(--tdt-z-modal)', background: 'var(--tdt-mask)',
  display: 'flex', alignItems: 'center', justifyContent: 'center',
}
const dialogStyle: Record<string, string | number> = {
  width: '360px', maxWidth: 'calc(100vw - 48px)', boxSizing: 'border-box',
  background: 'var(--tdt-surface-base, #fff)', color: 'var(--tdt-fg)',
  border: `1px solid var(--tdt-border)`, borderRadius: 'var(--tdt-radius-md)', padding: '18px',
  boxShadow: 'var(--tdt-shadow-2, 0 12px 32px rgba(0,0,0,0.4))',
}

/** 执行记录 / 日志的时间戳：`YYYY-MM-DD HH:mm:ss`（与执行记录页同款两位补零）。 */
const formatStamp = (iso: string | null): string =>
  iso === null ? '—' : formatDateTime(iso, { seconds: true, fallback: '—' })

// ⚠️ 2026-10-04：`outputsOf`（回执产出清单解析）与 token 明细串**已上提**——
// 前者到 `query.ts`（`outputsOf`，与实例行同处）、后者到 `format.ts`（`formatTokenDetail`），
// 因为执行记录总查询页要用同一份口径，两处各写一份就是违规（本仓：一类东西一个实现）。
// 状态三档桶（用户 2026-10-02：过滤只给 执行中 / 失败 / 成功 三档，七态归桶；值传后端 statuses）。
// ⚠️ 2026-10-04 评审：桶定义**上提到 `status-text.ts` 单源**（`statusesOfBucket`）—— 此前本页与
// 执行记录总查询页各写一份，且 running 的成员还不一样（一个含 pending/unknown，一个不含）⇒ 同一个
// 档位两页筛出不同结果。这里改成薄封装，只保留「值传后端」这一层。
/** 产出物 / 会话列的裸图标按钮（无边框、无底色；用户 2026-10-02 第四轮：图标化）。 */
const plainIconBtnStyle: Record<string, string | number> = {
  appearance: 'none', display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
  width: '20px', height: '20px', padding: 0, border: 'none', background: 'transparent',
  color: 'var(--tdt-fg-2)', cursor: 'pointer', lineHeight: 0, fontFamily: 'inherit', transition,
}
/** 产出物图标格（最多 3 个 +「…」更多）。 */
const outputCellStyle: Record<string, string | number> = {
  display: 'inline-flex', alignItems: 'center', gap: '2px', flexWrap: 'nowrap',
}
/** 过滤行外壳（records / logs 共用；在滚动区**外**，不随内容滚）。 */
const filterRowStyle: Record<string, string | number> = {
  display: 'flex', alignItems: 'center', gap: '6px', flexWrap: 'wrap',
  // 下间距必须 == 上间距（用户 2026-10-03）：上间距是「面板外虚线 → 过滤行」= `panelWrapStyle.paddingTop` 10px，
  // 所以这里也用 10px —— 原来 6px，上下明显不一样。
  marginBottom: '10px',
}
/** 过滤行里的字段名（「状态：」等）。 */
const filterLabelStyle: Record<string, string | number> = {
  fontSize: 'var(--tdt-font-xs)', color: 'var(--tdt-fg-3)', flex: 'none',
}
/** 条数过滤（用户 2026-10-02）：**统一居右**，定式 `显示 <N> 条`。 */
const limitRowStyle: Record<string, string | number> = {
  display: 'inline-flex', alignItems: 'center', gap: '4px', marginLeft: 'auto',
  fontSize: 'var(--tdt-font-xs)', color: 'var(--tdt-fg-3)',
}
/** 记录表头样式（sticky 由 `.dsh-tdt-rec-head th` 接管）。 */
const recHeadStyle: Record<string, string | number> = {
  // 标题一律**居中**（用户 2026-10-02）。
  // 底色走 `--tdt-head-bg`：浅色主题**偏深**、暗色主题**偏亮**（两侧都与卡片面拉开层次，
  // 不再出现「浅色纯白 / 暗色纯黑」）。明暗差异单点落在 ui/tokens.ts。
  ...miniCellStyle,
  // 表头**加高**（用户 2026-10-02：太薄了）。
  padding: '11px 10px',
  textAlign: 'center', fontWeight: 600, color: 'var(--tdt-fg-2)',
  background: 'var(--tdt-head-bg)',
  // **上下各一条线，且亮度一致**；⚠️ 必须走 **box-shadow**：
  // `border-collapse: collapse` 下边框归**表格网格**所有 ⇒ sticky 表头滚动时边框会「滑走」
  // （用户 2026-10-02 揪出）。box-shadow 属于 th 自身 ⇒ 跟着表头不动。
  boxShadow: 'inset 0 1px 0 var(--tdt-border), inset 0 -1px 0 var(--tdt-border)',
}
/** 失败 / 未执行与执行记录页同款标红加粗（决策 54：错就得让他在记录里看见）。 */
const statusStyleOf = (status: string): Record<string, string | number> | undefined =>
  status === 'failed' || status === 'skipped' ? { color: 'var(--tdt-danger)', fontWeight: 600 } : undefined

// `windowLabel`（「允许延迟」ISO → 人话）已于 2026-10-05 上提 `task-info.tsx`（查看档也要用同一份）。

// `renderNextExec`（「预计执行」行：相对时间自刷 + 具体时刻）已上提共享层 ⇒ `task-info.tsx`。

/**
 * 任务卡片展开区三面板（决策 55）：左下三个分段按钮（基础信息 / 执行记录 / 日志，默认基础信息），
 * 中间内容区三选一替换（统一最大高度滚动容器），右下按钮区（编辑任务 + 删除）。
 * 数据全走 `client/query.ts` 真实取数（AGENTS.md 第五条，禁止 mock）。
 */
function TaskExpandPanel(props: {
  row: TaskOverviewRow
  t: Translate
  tt: Translate
  scheduleLine: string
  modelText: string
  onEdit: (id: string) => void
  onDelete: (id: string) => Promise<string | null>
  /** 立即执行（2026-10-03）：返回业务结果，卡片据此弹成功 / 拒绝 Toast。 */
  onRunNow: (id: string) => Promise<RunNowOutcome>
  /** 产出文件点开（U11 预览面单一入口；undefined = 预览面不可用 ⇒ chips 降级不可点）。 */
  onOpenFile?: (sessionId: string, path: string) => void
  /**
   * 会话弹窗（undefined = 会话面不可用 ⇒ 不出链接）。
   * ⚠️ **只传会话 id**（2026-10-03 铁律）：快照 / 产出 / 标题一律由弹窗自己按会话 id 取，
   * 这样「从哪进」渲染都一样。禁止再加上 heading / outputs / snapshot 这类参数。
   */
  onOpenSession?: (sessionId: string) => void
  /** 点「前置任务」行的任务名 ⇒ 打开该任务的**查看档**（2026-10-05）；不给则名字是纯文本。 */
  onViewTask?: (id: string) => void
  /** 即时拉一次 overview（来自顶层 `useTaskOverview`）：任务跑完时让左栏「下次预计执行」同步刷新。 */
  refresh: () => void
}) {
  const { row, t, tt, scheduleLine, modelText, onEdit, onDelete, onRunNow, onOpenFile, onOpenSession, onViewTask, refresh } = props
  const [tab, setTab] = useState<'info' | 'records' | 'logs'>('info')
  /**
   * 事件推送计数（2026-10-07 补缺口）：`row` 的运行态字段只覆盖「终态 / 在飞翻转」，
   * **覆盖不到**派发后写 `session_id`、`dispatched → running`、阻塞 / 放行这类**行级**变化
   * （它们不改 `lastStatus` / `lastFinishedAt` / `running`）⇒ 面板会一直停在「已派发」，会话链接与
   * 早期日志都看不到，直到这次执行出终态。故订阅本任务的运行态事件来驱动三个 tab 重取。
   * 只认 `payload.taskId === 本卡片`（在屏判定）；面板只在展开时才挂载 ⇒ 订阅也只在展开期间存在。
   */
  const [pushNonce, setPushNonce] = useState(0)
  useEvents(RUN_EVENT_TYPES, (event) => {
    if (event.payload?.taskId !== row.id) return
    setPushNonce(n => n + 1)
  })
  useResync(() => { setPushNonce(n => n + 1) })
  // 运行态签名（用户 2026-10-03）：**页面开着、任务跑完了 ⇒ 打开着的面板要自动重读**，
  // 否则用户看到的一直是上一次执行留下的状态。签名取「会变的运行态字段」+ 相关事件计数
  // ⇒ 没有变化、也没有相关事件时不会触发重取；且三个 tab 各自只在**自己打开时**才取数
  // ⇒ 「刷新只刷打开的那部分」。
  const runSig = `${row.lastStatus ?? ''}|${row.lastFinishedAt ?? ''}|${row.running ? 1 : 0}|${pushNonce}`
  // 任务跑完 / 状态翻转（runSig 变）⇒ 立即拉一次 overview，让**左栏「下次预计执行」(row.nextSlotAt)**
  // 与卡片 NextPill/PastPill 同步即时刷新（不再等 10s 轮询）。右栏「上次执行」已有自己独立的 runSig 重拉，
  // 此处专门补全左侧（用户 2026-10-03：任务执行完左侧也要跟着刷）。跳过挂载首跑，避免每次展开都白拉一次。
  const firstRun = useRef(true)
  useEffect(() => {
    if (firstRun.current) { firstRun.current = false; return }
    refresh()
  }, [runSig, refresh])
  // ── 基础信息面板（用户 2026-10-03 改版）──
  // 右栏只看「上次执行」一条 ⇒ 取最近一条终态实例（成功 / 失败 / 跳过 / 未知）。
  const [infoLast, setInfoLast] = useState<InstanceRow | null>(null)
  const [infoLoading, setInfoLoading] = useState(false)
  const [infoError, setInfoError] = useState<string | null>(null)
  const [infoLoaded, setInfoLoaded] = useState(false)
  // 日历 / 时分文案**单源**（与任务编辑器同一份：editor-fields.calendarLabelsOf / timeLabelsOf）。
  const calendarLabels = useMemo(() => calendarLabelsOf(t), [t])
  const timeLabels = useMemo(() => timeLabelsOf(t), [t])
  // 时间范围控件文案（records / logs 共用一份）。
  const timeRangeLabels: TimeRangeLabels = useMemo(() => ({
    all: t('trAll'), custom: t('trCustom'), from: t('cardFrom'), to: t('cardTo'),
    presets: {
      today: t('trToday'), yesterday: t('trYesterday'), thisWeek: t('trThisWeek'),
      lastWeek: t('trLastWeek'), thisMonth: t('trThisMonth'), lastMonth: t('trLastMonth'),
    },
  }), [t])

  // ── 执行记录面板 ──
  // 初始 **''（未选）** ⇒ 下拉显示灰色占位「状态」；「全部」与未选同义（都不过滤）。
  const [recStatus, setRecStatus] = useState('')
  const [recRange, setRecRange] = useState<TimeRangeValue>({ from: '', to: '' })
  // 条数（用户 2026-10-02：执行记录也要有条数过滤，默认 100，别一次铺几百条）。
  const [recLimit, setRecLimit] = useState(100)
  const [records, setRecords] = useState<InstanceRow[] | null>(null)
  const [recLoading, setRecLoading] = useState(false)
  const [recError, setRecError] = useState<string | null>(null)
  const [openInstance, setOpenInstance] = useState<string | null>(null)
  const [events, setEvents] = useState<EventRow[] | null>(null)
  // 注：原先这里还有个「加载中」状态，只用在展开区的加载提示上；
  // 展开区去掉标题后它**只写不读** ⇒ 按无死代码原则删除（错误态 `eventsError` 保留）。
  const [eventsError, setEventsError] = useState<string | null>(null)

  // ── 日志面板 ──
  const [logKeyword, setLogKeyword] = useState('')
  const [logRange, setLogRange] = useState<TimeRangeValue>({ from: '', to: '' })
  const [logLimit, setLogLimit] = useState(100)
  const [logs, setLogs] = useState<LogRow[] | null>(null)
  const [logLoading, setLogLoading] = useState(false)
  // 忙碌指示**延迟 400ms** 才亮（本地查询多为毫秒级，别为看不见的一瞬闪一下）。
  // ⚠️ hooks 必须在组件顶层调用（renderRecords / renderLogs 是条件渲染的函数，里面不能放 hooks）。
  const recBusy = useDelayedBusy(recLoading)
  const logBusy = useDelayedBusy(logLoading)
  const [logError, setLogError] = useState<string | null>(null)

  // ── 删除确认 ──
  const [confirmDelete, setConfirmDelete] = useState(false)
  const [deleting, setDeleting] = useState(false)

  // ── 立即执行（2026-10-03）：确认框 + 结果 Toast ──
  const [confirmRun, setConfirmRun] = useState(false)
  const [runBusy, setRunBusy] = useState(false)
  /**
   * 立即执行成功后的「立刻重拉执行记录」信号（用户 2026-10-03 真机反馈：点了马上写记录，
   * 但面板要等下一次轮询才显示 ⇒ 等它显示时任务都已经在跑了）。计数 +1 即触发下面那个 effect。
   */
  const [runNonce, setRunNonce] = useState(0)
  const [runToast, setRunToast] = useState<{ text: string; tone: 'success' | 'error'; seq: number } | null>(null)
  const runSeq = useRef(0)
  /** 业务结果 → 人话 Toast 文案（机器码在服务端、文案在客户端 locale 单源）。 */
  const runNowToast = (outcome: RunNowOutcome): { text: string; tone: 'success' | 'error' } => {
    if (outcome.ok) return { text: t('cardRunNowOk'), tone: 'success' }
    switch (outcome.error) {
      case 'already-running': return { text: t('cardRunNowAlready'), tone: 'error' }
      case 'upstream-not-succeeded': return { text: t('cardRunNowBlocked'), tone: 'error' }
      case 'upstream-missing': return { text: t('cardRunNowMissingDep'), tone: 'error' }
      case 'workspace-missing': return { text: tt('cardRunNowWorkspace', { name: outcome.detail ?? '' }), tone: 'error' }
      case 'attachment-missing': return { text: tt('cardRunNowAttachment', { name: outcome.detail ?? '' }), tone: 'error' }
      case 'task-not-found': return { text: t('cardRunNowNotFound'), tone: 'error' }
      case 'not-ready': return { text: t('cardRunNowNotReady'), tone: 'error' }
      default: return { text: tt('cardRunNowFailed', { reason: outcome.detail ?? outcome.error }), tone: 'error' }
    }
  }
  const doRunNow = (): void => {
    setRunBusy(true)
    void onRunNow(row.id).then(outcome => {
      const { text, tone } = runNowToast(outcome)
      runSeq.current += 1
      setRunToast({ text, tone, seq: runSeq.current })
      // 成功 ⇒ 立刻重拉「执行记录」（不等轮询）：用户点了就要马上看见那条记录。
      if (outcome.ok) setRunNonce(n => n + 1)
    }).finally(() => { setRunBusy(false); setConfirmRun(false) })
  }

  // 切到基础信息 ⇒ 取「上次执行」一条（新→旧排序，limit 1 即最近的一条终态实例）。
  useEffect(() => {
    if (tab !== 'info') return
    let alive = true
    setInfoLoading(true)
    setInfoError(null)
    fetchInstances({ taskId: row.id, statuses: LAST_RUN_STATUSES, limit: 1 })
      .then(({ rows }) => {
        if (!alive) return
        setInfoLast(rows[0] ?? null)
        setInfoLoaded(true)
      })
      .catch((error: unknown) => { if (alive) setInfoError(error instanceof Error ? error.message : String(error)) })
      .finally(() => { if (alive) setInfoLoading(false) })
    return () => { alive = false }
  }, [tab, row.id, runSig])

  // 筛选条件签名：用它判定「这次重拉是不是因为用户改了筛选」——只有这个才收起下钻行。
  const filterSig = `${recStatus}|${recRange.from}|${recRange.to}|${recLimit}`
  const prevFilterSig = useRef(filterSig)
  // 切到执行记录 / 筛选变化 ⇒ 重拉。
  // 早期实现「不论为何重拉都顺手把展开的下钻行清零」⇒ 自动重读（runSig 变，即任务跑完 / 状态翻转）时
  // 也会把用户正展开看的下钻行合上，属无谓打扰（用户 2026-10-03 拍板：自动重读只刷新数据、别收起）。
  // ⇒ **只在筛选条件真变了**时才收起下钻行；runSig 触发的自动重读只刷新列表、保留展开态。
  useEffect(() => {
    const filterChanged = prevFilterSig.current !== filterSig
    prevFilterSig.current = filterSig
    if (tab !== 'records') return
    let alive = true
    setRecLoading(true)
    setRecError(null)
    // 边界归一（半开区间 [from, to)）只在 ui/time-range 一处算（用户 2026-10-02 第四轮）。
    const range = rangeToQuery(recRange, 'day')
    fetchInstances({
      taskId: row.id,
      // 三档桶（用户 2026-10-02）：执行中 = pending/dispatched/running/unknown；失败 = failed/skipped；成功 = succeeded。
      statuses: recStatus === '' || recStatus === 'all' ? undefined : statusesOfBucket(recStatus),
      from: range.fromTs,
      to: range.toTs,
      limit: recLimit,
    })
      .then(({ rows }) => {
        if (!alive) return
        setRecords(rows)
        if (filterChanged) {
          setOpenInstance(null)
          setEvents(null)
        }
      })
      .catch((error: unknown) => { if (alive) setRecError(error instanceof Error ? error.message : String(error)) })
      .finally(() => { if (alive) setRecLoading(false) })
    return () => { alive = false }
  }, [tab, row.id, recStatus, recRange, recLimit, runSig, runNonce, filterSig])

  // 点一行 ⇒ 取该次执行的事件时间线（seq 升序 = 旧→新）。
  useEffect(() => {
    if (openInstance === null) return
    let alive = true
    setEventsError(null)
    setEvents(null)
    fetchEvents(openInstance)
      .then(rows => { if (alive) setEvents(rows) })
      .catch((error: unknown) => { if (alive) setEventsError(error instanceof Error ? error.message : String(error)) })
    return () => { alive = false }
  }, [openInstance])

  // 切到日志 / 关键字、日期、条数变化 ⇒ 重拉。
  useEffect(() => {
    if (tab !== 'logs') return
    let alive = true
    setLogLoading(true)
    setLogError(null)
    // 日志按**分钟级**粒度（用户 2026-10-02：要定位到哪一分钟出错），边界同样半开区间。
    const range = rangeToQuery(logRange, 'minute')
    fetchLogs({
      taskId: row.id,
      keyword: logKeyword.trim() === '' ? undefined : logKeyword.trim(),
      from: range.fromTs,
      to: range.toTs,
      limit: logLimit,
    })
      .then(({ rows }) => { if (alive) setLogs(rows) })
      .catch((error: unknown) => { if (alive) setLogError(error instanceof Error ? error.message : String(error)) })
      .finally(() => { if (alive) setLogLoading(false) })
    return () => { alive = false }
  }, [tab, row.id, logKeyword, logRange, logLimit, runSig])

  // 右栏「上次执行」的明细（状态 / 计划执行 / 实际开始 / 结束时间 / 执行时长 / Token / 备注 + 产出物）
  // 已于 2026-10-05 **上提共享层** ⇒ `task-info.tsx` 的 `lastRunFields()`（与右侧栏「查看档」共用同一份）。
  // 空态 / 加载 / 失败三种外壳留在调用处（下面 `renderInfo`）。

  const renderInfo = (): ReturnType<typeof h> => {
    // 基础信息块的**视图模型**（2026-10-05）：把 overview 摘要行翻译成共享展示层认识的形状，
    // 字段怎么翻译、怎么渲染全交给 `task-info.tsx`（与右侧栏「查看档」同一份实现，不许在本文件另铺一遍）。
    const view: TaskInfoBaseView = {
      scheduleLine,
      // 预计执行：社交化相对时间（LiveText 每秒自刷）+ 具体时刻，见 `renderNextExec`。
      nextSlot: renderNextExec(row.nextSlotAt, t),
      workspace: row.workspace,
      model: modelText,
      retry: String(row.retryMax),
      window: row.schedule.window,
      attachments: row.attachments.map(item => ({
        name: item.name,
        // key 带来源前缀：同一文件名分属 link / upload 时也要能区分。
        key: `${item.kind}:${item.name}`,
        path: item.path ?? null,
        anchorSessionId: item.anchorSessionId ?? null,
      })),
      depends: row.depends.map(dep => ({ id: dep.id, title: dep.title, enabled: dep.enabled })),
    }
    return h('div', { style: panelBoxStyle },
      // 两栏：左配置（约 58%）+ 右最近执行（约 42%，**独立滚动**）；整块仍在同一个定高盒内 ⇒ 切 tab 高度不蹦。
      h('div', { style: infoWrapStyle },
        // 左栏：任务配置（纸表格：标签 + 值，逐行留白；不再显示提示词）。
        h('div', { className: 'dsh-tdt-info-cfg', style: infoConfigStyle },
          h('div', { style: infoGroupTitleStyle }, t('infoSectionConfig')),
          // 前置任务名可点（2026-10-05）⇒ 右侧栏以查看档打开它（`onViewTask`，暂未接时为纯文本）。
          taskInfoBaseFields({ t, view, onOpenFile, onViewTask }),
        ),
        // 右栏：只看「上次执行」一条（用户 2026-10-03：别那么麻烦，成功显成功、失败显失败），内容多只滚这一栏。
        h('div', { style: infoRecentStyle },
          h('div', { style: infoGroupTitleStyle }, t('infoLastRun')),
          infoError !== null
            ? h('div', { style: { fontSize: 'var(--tdt-font-xs)', color: 'var(--tdt-danger)' } }, `${t('cardLoadFailed')}：${infoError}`)
            : infoLoading && !infoLoaded
              // 忙碌指示**统一走右下角那个共用 Loading**（用户铁律：全站只有一个 loading，不在这里另写文字）。
              ? h(Loading, {})
              : infoLast === null
                ? h('div', { style: { fontSize: 'var(--tdt-font-xs)', color: 'var(--tdt-fg-3)' } }, t('infoNoRun'))
                : lastRunFields({ t, instance: infoLast, onOpenSession, onOpenFile }),
        ),
      ),
    )
  }

  const renderRecords = (): ReturnType<typeof h> => h('div', { style: panelBoxStyle },
    // 浮动忙碌指示：fixed 到主内容盒右下角 ⇒ **不占布局空间**，不再把筛选行挤过去又挤回来。
    recBusy ? h(Loading, {}) : null,
    // 过滤行固定在定高盒外（不随内容滚）：状态三档 + 工作区。
    h('div', { style: filterRowStyle },
      // 不再单写「状态：」二字（用户 2026-10-02）：**未选时占位就是灰色的「状态」**，
      // 与选中「全部」同义（都不过滤）⇒ 靠 placeholder 自证身份。
      h(SelectField, {
        value: recStatus,
        options: [
          { value: 'all', label: tt('filterAll') },
          // 顺序 = 全部 / 成功 / 失败 / 运行中（用户 2026-10-02 点名）。
          // ⚠️ 下拉**不必**守表格的「两字」规矩（那是为表格对齐好看）⇒ 这里用「运行中」。
          { value: 'succeeded', label: statusTextOf('succeeded', t) },
          { value: 'failed', label: statusTextOf('failed', t) },
          { value: 'running', label: t('filterRunning') },
        ],
        onChange: (next: string) => { setRecStatus(next) },
        placeholder: t('colStatus'),
        emptyLabel: t('editorNoOptions'),
        ariaLabel: t('colStatus'),
        // 收窄一档（用户 2026-10-02 第四轮）：md(28)，与时间范围控件同档。
        size: 'md',
        width: 96,
      }),
      h(TimeRange, {
        value: recRange, onChange: setRecRange,
        labels: timeRangeLabels, calendarLabels, timeLabels,
        precision: 'day', size: 'md',
      }),
      // 条数过滤：**统一放最右边**，定式 `显示 <N> 条`（用户 2026-10-02）。
      h('label', { style: limitRowStyle },
        t('limitPrefix'),
        h(SelectField, {
          value: String(recLimit),
          options: [50, 100, 200].map(n => ({ value: String(n), label: String(n) })),
          onChange: (next: string) => { setRecLimit(Number(next)) },
          placeholder: String(recLimit),
          emptyLabel: t('editorNoOptions'),
          ariaLabel: t('cardLogLimit'),
          size: 'md',
          width: 70,
        }),
        t('limitSuffix'),
      ),
      recError !== null ? h('span', { style: { fontSize: 'var(--tdt-font-xs)', color: 'var(--tdt-danger)' } }, `${t('cardLoadFailed')}：${recError}`) : null,
    ),
    h('div', { style: panelScrollFillStyle },
      records === null
        ? null
        : records.length === 0
          // 空结果有两种成因：① 该任务确实从没执行过；② 有筛选（状态 / 时间范围）但没命中。
          // 后者不能说「还没有执行记录」（那会误导成「从没跑过」），改用中性「没有符合筛选条件的数据」。
          ? h('p', { style: faintStyle },
              ((recStatus !== '' && recStatus !== 'all') || recRange.from !== '' || recRange.to !== '')
                ? t('cardRecordsEmptyFiltered')
                : t('cardRecordsEmpty'))
          : h('table', { style: { ...miniTableStyle, tableLayout: 'fixed' } },
            h('thead', { className: 'dsh-tdt-rec-head' }, h('tr', null,
              // 除「备注」外**一律定长**（备注是唯一弹性列，拉伸 / 收缩只动它）。
              // 列序（用户 2026-10-02 二次调整）：**查看会话在最后、产出物在倒数第二**——
              // 「用眼睛看的」在前（含备注），「要点的」排在后面挨在一起。
              h('th', { style: { ...recHeadStyle, width: '76px' } }, t('colStatus')),
              // 计划执行：年改**四位**（`2026-09-30 15:10`）⇒ 列宽相应放宽；备注是弹性列会自动让位。
              h('th', { style: { ...recHeadStyle, width: '140px' } }, t('colPlanned')),
              h('th', { style: { ...recHeadStyle, width: '84px' } }, t('colActualStart')),
              h('th', { style: { ...recHeadStyle, width: '76px' } }, t('colDuration')),
              h('th', { style: { ...recHeadStyle, width: '72px' } }, t('colTokens')),
              h('th', { style: recHeadStyle }, t('colNote')),
              h('th', { style: { ...recHeadStyle, width: '96px' } }, t('colOutputs')),
              h('th', { style: { ...recHeadStyle, width: '68px' } }, t('colSession')),
            )),
            h('tbody', null,
              records.flatMap((instance, index) => {
                const open = openInstance === instance.id
                const outputs = outputsOf(instance.outputs)
                const sid = instance.session_id
                const openFile = onOpenFile
                const openSession = onOpenSession
                const canOpenFile = sid !== null && openFile !== undefined
                const canOpenSession = sid !== null && openSession !== undefined
                // 时长 = 结束 − **实际开始**（未派发回退计划时刻；在跑 / 未回执 ⇒ NaN ⇒ '-'）。
                const durMs = instance.finished_at === null
                  ? Number.NaN
                  : Date.parse(instance.finished_at) - Date.parse(instance.dispatched_at ?? instance.scheduled_at)
                const mainRow = h('tr', {
                  key: instance.id,
                  // 斑马纹：奇数行浅底（`.dsh-tdt-rec-alt`）；展开行盖成第二层面。
                  // 斑马纹 + hover 高亮（hover 由 `.dsh-tdt-rec-row:hover` 接管）。
                  className: ['dsh-tdt-rec-row', open || index % 2 === 0 ? '' : 'dsh-tdt-rec-alt'].join(' ').trim(),
                  // 展开态走**带透明度的蓝**（`--tdt-open-bg`）——不用灰色：灰跟斑马纹分不出来。
                  style: { cursor: 'pointer', ...(open ? { background: 'var(--tdt-open-bg)' } : {}) },
                  onClick: () => { setOpenInstance(open ? null : instance.id) },
                },
                  // ① 状态图标 + 通用短名（**居中**：状态已统一两字，按字宽算好间距）。
                  h('td', { style: miniCellCenterStyle },
                    h('span', { style: { display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: '6px' } },
                      h(StatusIcon, { status: instance.status }),
                      h('span', {
                        style: instance.status === 'succeeded' ? { color: 'var(--tdt-success)' } : statusStyleOf(instance.status),
                      }, statusTextOf(instance.status, t)),
                    ),
                  ),
                  // ② 计划执行：YY-MM-DD HH:mm（完整时刻进 hover）。
                  h('td', { style: miniCellCenterStyle },
                    h('span', { title: formatStamp(instance.scheduled_at) }, formatPlanStamp(instance.scheduled_at))),
                  // ③ 实际开始：HH:mm:ss（未派发 ⇒ '-'）。
                  h('td', { style: miniCellCenterStyle },
                    h('span', { title: instance.dispatched_at === null ? undefined : formatStamp(instance.dispatched_at) }, formatClock(instance.dispatched_at))),
                  // ④ 执行时长：H:MM:SS（有小时）/ MM:SS。
                  h('td', { style: miniCellCenterStyle }, formatDurationHms(durMs)),
                  // ⑤ 消耗 token（用户 2026-10-02 提上一级）：总量 K/M 格式，hover 看输入/输出/缓存明细。
                  h('td', { style: miniCellCenterStyle },
                    instance.token_in === null && instance.token_out === null
                      ? h('span', { style: { color: 'var(--tdt-fg-3)' } }, '-')
                      : h('span', { title: formatTokenDetail(instance) }, formatTokenCount((instance.token_in ?? 0) + (instance.token_out ?? 0)))),
                  // ⑥ 备注：**错误 / 未执行的原因**（服务端 `attachNotes` 从最新原因事件推导）。
                  // 全表**唯一弹性列**（不定长）：拉伸 / 收缩只动它；超长省略号，hover 看全文。
                  // ⚠️ **不要红色**（用户 2026-10-02：不是要提醒他去看备注）——走最浅的灰 `--tdt-fg-3`，
                  // 比正文更淡，深浅两主题都是「退后一层」的存在感。
                  h('td', { style: { ...miniCellStyle, maxWidth: 0 } },
                    instance.note === null || instance.note === undefined || instance.note === ''
                      ? null
                      :                       h('span', {
                        title: instance.note,
                        className: 'dsh-tdt-ellipsis',
                        style: { display: 'block', color: 'var(--tdt-fg-3)' },
                      }, instance.note),
                  ),
                  // ⑦ 产出物（**倒数第二列**，紧挨「查看会话」）：官方文件类型图标 ≤3 个；
                  // >3 收「…」（点开会话看完整）；无产出 ⇒ 该格空。**不居中**（图标从左到右排）。
                  // 图标底板 = 基础层 `.dsh-tdt-chip`（**全站唯一实现**，2026-10-04 收编；执行记录总查询页共用同一份）。
                  h('td', { style: miniCellStyle },
                    outputs.length === 0
                      ? null
                      : h('span', { style: outputCellStyle },
                        // 硬性规定：只给图标、没有文件名 ⇒ 悬停**必须**显示文件名（含后缀），走官方 Tooltip。
                        outputs.slice(0, 3).map(output => h(Tooltip, {
                          key: output,
                          label: baseNameOf(output),
                          side: 'top',
                        }, h('button', {
                          type: 'button', className: 'dsh-tdt-chip',
                          style: { cursor: canOpenFile ? 'pointer' : 'default' },
                          onClick: (event: { stopPropagation(): void }) => {
                            event.stopPropagation()
                            if (canOpenFile && openFile !== undefined && sid !== null) openFile(sid, output)
                          },
                        }, h(FileTypeIcon, { path: output, size: 16 })))),
                        outputs.length > 3
                          ? h('button', {
                            type: 'button', 'aria-label': t('viewSession'),
                            className: 'dsh-tdt-chip dsh-tdt-chip--label',
                            onClick: (event: { stopPropagation(): void }) => {
                              event.stopPropagation()
                              if (canOpenSession && openSession !== undefined && sid !== null) openSession(sid)
                            },
                          }, '…')
                          : null,
                      ),
                  ),
                  // ⑧ 会话记录（**最后一列**）：小按钮「查看」（用户 2026-10-02：不要光秃秃一个图标）+ 定宽居中。
                  h('td', { style: miniCellCenterStyle },
                    canOpenSession && openSession !== undefined && sid !== null
                      ? h(Button, {
                        variant: 'outline', size: 'sm',
                        onClick: (event: { stopPropagation(): void }) => { event.stopPropagation(); openSession(sid) },
                      }, t('colView'))
                      : null,
                  ),
                )
                const detailRow = open
                  ? h('tr', { key: `${instance.id}-detail` },
                    // 展开内容区：**更淡一档的蓝**（`--tdt-open-bg-soft`）⇒ 与展开行本身区隔开，
                    // 且不是灰 / 不是纯黑纯白（用户 2026-10-02）。
                    // 展开区（用户 2026-10-02）：**外圈 padding 翻倍**（9/10 → 18/20），别再密密麻麻。
                    h('td', {
                      colSpan: 8,
                      style: { ...miniCellWrapStyle, padding: '18px 20px', background: 'var(--tdt-open-bg-soft)' },
                    },
                      // 展开区**直接铺执行日志**（用户 2026-10-02）：**不要标题、不要黑框**——
                      // 展开的日志本来就是给要看细节的人看的，套一层框 + 一个小标题纯属多余。
                      // 底色沿用 `--tdt-open-bg-soft`（淡蓝）就够了，用它把展开区区隔出来。
                      eventsError !== null
                        ? h('div', { style: { fontSize: 'var(--tdt-font-xs)', color: 'var(--tdt-danger)' } }, `${t('cardLoadFailed')}：${eventsError}`)
                        : events === null
                          ? null
                          : events.length === 0
                            ? h('div', { style: { fontSize: 'var(--tdt-font-xs)', color: 'var(--tdt-fg-3)' } }, t('cardEventsEmpty'))
                            // 行间距拉开；字色整体**压暗一档**（日志是慢慢翻的，不要跟正文一样刺眼）。
                            : events.map(event => h('div', {
                              key: event.seq, style: { marginBottom: '7px', lineHeight: 'var(--tdt-line-md)' },
                            },
                              h('span', { style: { color: 'var(--tdt-fg-3)' } }, `${formatStamp(event.ts)} `),
                              h('span', { style: { color: 'var(--tdt-fg-2)' } }, `${event.kind} `),
                              h('span', { style: { color: 'var(--tdt-fg-2)' } }, event.detail ?? ''),
                            )),
                    ),
                  )
                  : null
                return [mainRow, detailRow]
              }),
            ),
          ),
        ),
  )

  const renderLogs = (): ReturnType<typeof h> => h('div', { style: panelBoxStyle },
    // 同执行记录面板：浮动忙碌指示，fixed 到主内容盒右下角。
    logBusy ? h(Loading, {}) : null,
    // 过滤行固定在定高盒外（与执行记录面板同口径）：关键字 + 条数。
    h('div', { style: filterRowStyle },
      h(TdtInput, {
        value: logKeyword,
        onChange: setLogKeyword,
        placeholder: t('cardKeyword'),
        size: 'md',
        style: { width: '140px' },
      }),
      h(TimeRange, {
        value: logRange, onChange: setLogRange,
        labels: timeRangeLabels, calendarLabels, timeLabels,
        precision: 'minute', size: 'md',
      }),
      // 条数过滤：**居右**，定式 `显示 <N> 条`（与执行记录面板同一件、同一位置）。
      h('label', { style: limitRowStyle },
        t('limitPrefix'),
        h(SelectField, {
          value: String(logLimit),
          options: [50, 100, 200].map(n => ({ value: String(n), label: String(n) })),
          onChange: (next: string) => { setLogLimit(Number(next)) },
          placeholder: String(logLimit),
          emptyLabel: t('editorNoOptions'),
          ariaLabel: t('cardLogLimit'),
          size: 'md',
          width: 70,
        }),
        t('limitSuffix'),
      ),

      logError !== null ? h('span', { style: { fontSize: 'var(--tdt-font-xs)', color: 'var(--tdt-danger)' } }, `${t('cardLoadFailed')}：${logError}`) : null,
    ),
    // 日志整区（用户 2026-10-03）：**不套框** —— 上面一条线（与执行记录表头上沿线同色 `--tdt-border`），
    // 从这条线一直到下方虚线，整块铺上日志原本的底色；日志直接铺在里面。
    h('div', { style: logAreaStyle },
      logs === null
        ? null
        : logs.length === 0
          ? h('p', { style: faintStyle }, t('cardLogsEmpty'))
          : logs.map(row => h('div', { key: row.seq, style: logRowStyle },
            h('span', { style: { color: 'var(--tdt-fg-3)' } }, `${formatStamp(row.ts)} `),
            h('span', {
              style: {
                color: row.level === 'error' ? 'var(--tdt-danger)' : row.level === 'warn' ? 'var(--tdt-accent)' : 'var(--tdt-fg-3)',
                fontWeight: row.level === 'error' ? 600 : 400,
              },
            }, `[${row.level}]`),
            ' ',
            // 事件类型与正文都压到 `--tdt-fg-2`：纯白在深底上太刺眼（用户 2026-10-03）。
            h('span', { style: { color: 'var(--tdt-fg-2)' } }, `${row.kind}: `),
            h('span', { style: { color: 'var(--tdt-fg-2)' } }, row.message),
          )),
    ),
  )

  /** 删除确认框（决策 55）：官方无嵌套 confirm 件可用 ⇒ 自绘 overlay + 主题变量（z 1070 盖过抽屉 1040 / 确认 1060）。 */
  const renderConfirm = (): ReturnType<typeof h> => h('div', {
    style: overlayStyle,
    onClick: () => { if (!deleting) setConfirmDelete(false) },
  },
    h('div', { style: dialogStyle, onClick: (event: { stopPropagation(): void }) => { event.stopPropagation() } },
      h('div', { style: { fontSize: 'var(--tdt-font-lg)', fontWeight: 600, marginBottom: '8px' } }, t('cardDeleteTitle')),
      h('div', { style: { fontSize: 'var(--tdt-font-sm)', color: 'var(--tdt-fg-2)', lineHeight: 'var(--tdt-line-sm)', marginBottom: '14px' } }, t('cardDeleteDesc')),
      h('div', { style: { display: 'flex', justifyContent: 'flex-end', gap: '8px' } },
        h(Button, {
          variant: 'outline', size: 'sm', disabled: deleting,
          onClick: () => { setConfirmDelete(false) },
        }, t('cardCancel')),
        h(Button, {
          variant: 'danger', size: 'sm', disabled: deleting,
          onClick: () => {
            setDeleting(true)
            void onDelete(row.id).finally(() => { setDeleting(false); setConfirmDelete(false) })
          },
        }, deleting ? t('loading') : t('cardDelete')),
      ),
    ),
  )

  /** 立即执行确认框（2026-10-03）：与删除确认同款自绘 overlay，文案「你确定要立即执行此任务吗？」。 */
  const renderRunConfirm = (): ReturnType<typeof h> => h('div', {
    style: overlayStyle,
    onClick: () => { if (!runBusy) setConfirmRun(false) },
  },
    h('div', { style: dialogStyle, onClick: (event: { stopPropagation(): void }) => { event.stopPropagation() } },
      h('div', { style: { fontSize: 'var(--tdt-font-lg)', fontWeight: 600, marginBottom: '8px' } }, t('cardRunNowTitle')),
      h('div', { style: { fontSize: 'var(--tdt-font-sm)', color: 'var(--tdt-fg-2)', lineHeight: 'var(--tdt-line-sm)', marginBottom: '14px' } }, t('cardRunNowDesc')),
      h('div', { style: { display: 'flex', justifyContent: 'flex-end', gap: '8px' } },
        h(Button, {
          variant: 'outline', size: 'sm', disabled: runBusy,
          onClick: () => { setConfirmRun(false) },
        }, t('cardCancel')),
        h(Button, {
          variant: 'primary', size: 'sm', disabled: runBusy,
          onClick: () => { doRunNow() },
        }, runBusy ? t('loading') : t('cardRunNow')),
      ),
    ),
  )

  return h('div', { style: panelWrapStyle },
    // 内容区：三选一替换；**滚动只发生在各 tab 自己的内容盒里**（过滤行 / 表头固定，用户 2026-10-02）。
    tab === 'info' ? renderInfo() : tab === 'records' ? renderRecords() : renderLogs(),
    // 底栏外包一层 position:relative ⇒ 立即执行的结果 Toast 浮在底栏上方（成功绿 / 拒绝红），2.8s 自退。
    // 按钮顺序（用户 2026-10-03）：删除 → **立即执行** → 编辑。
    h('div', { style: { position: 'relative' } },
      runToast !== null
        ? h(FloatingToast, {
          seq: runToast.seq, tone: runToast.tone,
          onDone: () => { setRunToast(null) },
          text: runToast.text,
        })
        : null,
      h('div', { style: panelBarStyle },
        // 三面板滑块走 UI 基础层唯一实现：variant="inset" = 在卡片底色上（轨道下沉、选中抬到第三层面）
        h(Segmented<'info' | 'records' | 'logs'>, {
          value: tab,
          size: 'md',
          variant: 'inset',
          items: [
            { value: 'info', label: t('cardTabInfo') },
            { value: 'records', label: t('cardTabRecords') },
            { value: 'logs', label: t('cardTabLogs') },
          ],
          onChange: setTab,
        }),
        h('span', { style: { flex: '1 1 auto' } }),
        // 高度跟同排三滑块一样走 md(28)（用户 2026-10-01：此前 sm=24 比滑块矮 4px）。
        h(Button, {
          variant: 'outline', size: 'md', className: 'dsh-tdt-btn--danger-ink',
          onClick: () => { setConfirmDelete(true) },
        }, t('cardDelete')),
        // 立即执行（用户 2026-10-03）：插在删除与编辑**中间**；点了弹确认框，确认后提前触发一次调度。
        // 图标用官方「播放三角」（IconPlayOutlineRegular）——用户点名闹钟不对（2026-10-03）。
        h(Button, {
          variant: 'outline', size: 'md', icon: h(IconPlayOutlineRegular, { size: 14 }),
          onClick: () => { setConfirmRun(true) },
        }, t('cardRunNow')),
        h(Button, {
          variant: 'outline', size: 'md', icon: h(IconEditOutlineRegular, { size: 14 }),
          onClick: () => { onEdit(row.id) },
        }, t('editorEdit')),
      ),
    ),
    confirmDelete ? renderConfirm() : null,
    confirmRun ? renderRunConfirm() : null,
  )
}

function TaskCard(props: {
  row: TaskOverviewRow
  t: Translate
  tt: Translate
  open: boolean
  onToggleOpen: () => void
  onEdit: (id: string) => void
  /** 删除任务（决策 55）：返回 null = 成功，否则返回人话错误（由父级 Toast 展示）。 */
  onDelete: (id: string) => Promise<string | null>
  /** 立即执行（2026-10-03）：透传给展开区按钮。 */
  onRunNow: (id: string) => Promise<RunNowOutcome>
  onOpenFile?: (sessionId: string, path: string) => void
  /** 会话弹窗：**只传会话 id**（见 TaskExpandPanel 说明）。 */
  onOpenSession?: (sessionId: string) => void
  /** 查看档入口（2026-10-05）：展开区「前置任务」行点任务名 ⇒ 右侧栏以查看档打开该任务。 */
  onViewTask?: (id: string) => void
  onToggleEnabled: (id: string, enabled: boolean) => void
  refOf: (el: HTMLElement | null) => void
  /** 即时拉 overview：任务跑完时左栏「下次预计执行」同步刷新（见 TaskExpandPanel）。 */
  refresh: () => void
}) {
  const { row, t, tt, open, onToggleOpen, onEdit, onDelete, onRunNow, onOpenFile, onOpenSession, onViewTask, onToggleEnabled, refOf, refresh } = props
  // 排期人话与编辑器「预计执行」**同一份实现**（`schedule-text.ts`，优先吃结构化 ui）⇒ 两处必然一致。
  const scheduleLine = scheduleText(scheduleSpecFromSchedule(row.schedule), t)
  const modelText = row.model === null ? tt('listFieldModelDefault') : row.model

  return h('div', { ref: refOf, className: 'dsh-tdt-card', style: cardStyle },
    // 主行：**垂直居中**（用户 2026-09-30：右侧开关 / 展开箭头要与卡片边界居中对齐）
    // **整行可点**展开 / 收起（用户 2026-10-03）：箭头保留，只是同一个动作的显式入口。
    // 主行自带卡片的 padding（卡片本身不再统一留白）⇒ hover 高亮能**边到边**铺满这一溜任务基本信息；
    // 展开区是它的兄弟节点、**不在**这个 div 里 ⇒ hover 蓝不会蔓延到下面的设置 / 记录 / 日志（用户 2026-10-03）。
    h('div', {
      className: 'dsh-tdt-card-row',
      style: { display: 'flex', alignItems: 'center', gap: '12px', cursor: 'pointer', padding: '12px 14px' },
      onClick: () => {
        // 拖选文字时**不要**误展开（选区非空 ⇒ 用户在复制，不是要点开卡片）。
        const sel = typeof window === 'undefined' ? null : window.getSelection()
        if (sel !== null && sel.toString() !== '') return
        onToggleOpen()
      },
    },
      h(StatusRail, { row, t }),
      h('div', { style: { flex: '1 1 auto', minWidth: 0 } },
        // 标题 / 执行方式：**单行省略号 + hover 跑马灯**（窗口窄、文字长不再撑高卡片，用户 2026-09-30）。
        // 编号与创建时间都挂在**标题行尾部**（同一 faintStyle = 同一字号），不再另起第三行 ——
        // 用户 2026-10-03：新建任务时第三行凭空冒出一个「创建于」行很跳，且白占一行高度。
        h('div', { style: { display: 'flex', alignItems: 'baseline', gap: '6px', minWidth: 0 } },
          // 任务名可点（r12 用户：全站任务名都连到查看档）——整行点击=展开卡片的既有行为不变，
          // 点名字时掐掉冒泡、改为打开该任务的查看档；未接 onViewTask 时保持纯文本（不装可点）。
          onViewTask === undefined
            ? h('div', { style: { ...titleStyle, flex: '0 1 auto', minWidth: 0 } }, h(MarqueeText, { text: row.title }))
            : h('button', {
              type: 'button',
              className: 'dsh-tdt-info-dep',
              title: t('infoViewTask'),
              style: { ...titleStyle, flex: '0 1 auto', minWidth: 0, textAlign: 'left' },
              onClick: (event: { stopPropagation: () => void }) => {
                event.stopPropagation()
                onViewTask(row.id)
              },
            }, h(MarqueeText, { text: row.title })),
          row.code !== null ? h('span', { style: { ...faintStyle, flex: 'none', display: 'inline' } }, `[${row.code}]`) : null,
          // 创建时间**长显**（用户拍板不隐藏）：`[2026-10-03 创建]`。
          // ⚠️ `createdAt` 只有**经 UI 表单保存**的任务才有（index.ts:425），老定义 / 手工写的 JSON 没有
          // ⇒ 旧写法整段不渲染，用户看到「有的有、有的没有」。用户 2026-10-03 要求**每个任务都要有这一行**，
          //    但铁律「不许编造数据」不许凭空补时间 ⇒ 缺值时显示明确的「创建时间未知」占位（不是空白、也不假时间）。
          h('span', { style: { ...faintStyle, flex: 'none', display: 'inline' } },
            row.createdAt === null
              ? `[${t('listCreatedUnknown')}]`
              : `[${t('listCreatedTag', { date: formatYmd(row.createdAt) })}]`),
          row.enabled ? null : h('span', { style: { ...faintStyle, flex: 'none', display: 'inline' } }, t('listDisabledTag')),
        ),
        // 执行方式是完整一句话（「每周一、周二，每 10 分钟执行一次」），放不下同样跑马灯。
        h('div', { style: { ...metaStyle, minWidth: 0 } }, h(MarqueeText, { text: scheduleLine })),
      ),
      // 右：历史执行 / 下次执行两个**独立**小标签 → 启用拨片 → 展开箭头。
      h('div', { style: { display: 'flex', alignItems: 'center', gap: '8px', flex: 'none' } },
        h(PastPill, { row, t, tt }),
        h(NextPill, { row, t, tt }),
        // 开关与编辑器头部开关**统一**：挂 `dsh-tdt-switch` 交给 CSS 把选中态刷成官方 success 绿。
        // （官方 Switch 默认选中色是 brand-primary：亮色主题下近乎黑、暗色近乎白 ⇒ 两处看着不一样。）
        // ⚠️ 开关**不许穿透**到「整卡展开」（用户 2026-10-03）：外层拦下冒泡，点它只切启用。
        h('span', {
          className: 'dsh-tdt-switch',
          onClick: (event: { stopPropagation(): void }) => { event.stopPropagation() },
        },
          h(Switch, {
            checked: row.enabled,
            onChange: (next: boolean) => { onToggleEnabled(row.id, next) },
            label: row.enabled ? t('listFilterEnabled') : t('listFilterDisabled'),
            title: row.enabled ? t('listFilterEnabled') : t('listFilterDisabled'),
          }),
        ),
        // 箭头同样要拦：否则点箭头会先触发自己的 onClick、再冒泡到主行触发第二次 ⇒ 展开后立刻又收起。
        h('span', { onClick: (event: { stopPropagation(): void }) => { event.stopPropagation() } },
          h(IconButton, {
            variant: 'plain', size: 'sm', icon: h(IconChevronDownOutlineRegular, { size: 14 }),
            // 这里**故意不挂 `title`**：此前复用了执行记录页的 `expandHint`（「点击任意一行展开该次执行的
            // 事件时间线」），语义完全对不上——卡片展开的是**本任务的设置**，不是某次执行的事件时间线，
            // 悬停冒出一句驴唇不对马嘴的提示（用户 2026-09-30 真机点名）。图标本身自明，只留无障碍名。
            label: t('listExpandHint'),
            onClick: onToggleOpen,
            'aria-expanded': open,
            style: { transform: open ? 'rotate(180deg)' : 'none' },
          }),
        ),
      ),
    ),
    // ── 展开区：三面板（决策 55，2026-10-01 拍板）——内容区三选一替换 + 左下三滑块 + 右下编辑/删除 ──
    open ? h(TaskExpandPanel, { row, t, tt, scheduleLine, modelText, onEdit, onDelete, onRunNow, onOpenFile, onOpenSession, onViewTask, refresh }) : null,
  )
}

// ── 视图 ───────────────────────────────────────────────────────────────
export function TaskListView(props: {
  t: Translate
  rows: readonly TaskOverviewRow[]
  ready: boolean
  onEdit: (id: string) => void
  /** 查看档入口（2026-10-05）：展开区「前置任务」行点任务名 ⇒ 右侧栏以查看档打开该任务。 */
  onViewTask?: (id: string) => void
  /** 删除任务（决策 55）：返回 null = 成功，否则返回人话错误（父级 Toast 展示、列表靠 overview 刷新少一行）。 */
  onDelete: (id: string) => Promise<string | null>
  /** 立即执行（2026-10-03）：POST /tasks/run，结果由卡片弹 Toast。 */
  onRunNow: (id: string) => Promise<RunNowOutcome>
  /** 产出文件点开（U11 预览面；undefined = 不可用 ⇒ 产出降级纯文本）。 */
  onOpenFile?: (sessionId: string, path: string) => void
  /** 会话弹窗（undefined = 不可用 ⇒ 不出链接）。**只传会话 id**（见 TaskExpandPanel 说明）。 */
  onOpenSession?: (sessionId: string) => void
  /** 启用 / 停用：返回 null = 成功，否则返回人话错误（列表据此回滚乐观值）。 */
  onToggleEnabled: (id: string, enabled: boolean) => Promise<string | null>
  /** 即时拉 overview：任务跑完时左栏「下次预计执行」同步刷新（见 TaskExpandPanel）。 */
  refresh: () => void
  /**
   * 工作区筛选的**候选真源**（2026-10-04）：面板级唯一一份，来自 `GET /options`（宿主真实工作区），
   * 由父级传入 —— **不许再从卡片数据反推**（反推会让「暂时没任务的工作区」凭空消失）。
   * 空数组 = 取不到（degraded）⇒ 下拉显示「暂无可选」，不回退、不编造。
   * `value` = 工作区 title（与宿主 `resolveWorkspace` 匹配口径一致）。
   */
  workspaces: readonly EditorOption[]
}): ReturnType<typeof h> {
  const { t, rows, ready, onEdit, onViewTask, onDelete, onRunNow, onOpenFile, onOpenSession, onToggleEnabled, refresh, workspaces } = props
  const tt = useMemo(() => interpolateTranslate(t), [t])
  ensureTaskListStyle()
  // 任务信息展示皮肤（域 'domain:task-info'）：基础信息纸表格 / 上次执行明细 / 状态图标配色
  // —— 2026-10-05 上提共享层后，与右侧栏「查看档」共用同一份（两处都要注入）。
  ensureTaskInfoStyle()
  // 跑马灯样式（.dsh-tdt-mq）在编辑器样式模块里注入；列表独立打开时也要有（幂等）。
  ensureTaskEditorStyle()
  // 立即执行结果 Toast 样式（域 'domain:toast'，全站唯一实现；幂等）。
  ensureToastStyle()
  const [filter, setFilter] = useState<'all' | 'enabled' | 'disabled' | 'abnormal'>('all')
  const [workspace, setWorkspace] = useState<string>('')
  const [query, setQuery] = useState('')
  const [openId, setOpenId] = useState<string | null>(null)
  /** 拨片的乐观值：点了立刻变，等服务端确认（它会马上同步任务表并重新拉一次）后清除。 */
  const [optimistic, setOptimistic] = useState<Record<string, boolean>>({})

  const rowsWithOptimistic = useMemo(() => {
    const keys = Object.keys(optimistic)
    if (keys.length === 0) return rows
    return rows.map(row => (row.id in optimistic ? { ...row, enabled: optimistic[row.id] } : row))
  }, [rows, optimistic])

  // 真实数据到位 ⇒ 清掉乐观值（避免长期覆盖服务端值）。已经空的时候返回**同一个引用**让 React bail out——
  // 此前每次全量响应都塞个新对象字面量 ⇒ `Object.is` 必不等 ⇒ 每轮多渲染一次（2026-09-30 复核）。
  useEffect(() => { setOptimistic(cur => (Object.keys(cur).length === 0 ? cur : {})) }, [rows])

  // ⚠️ 这里**不放**每秒 setState：倒计时的时间流走 LiveText 的全局心跳（局部重渲染），
  // 列表本体只在数据真变时才动——这正是「每秒刷新会不会卡」的答案。

  // ⚠️ 工作区候选**不再**从卡片数据反推（2026-10-04）：改用父级传入的真源 `props.workspaces`
  // （`GET /options`，宿主真实工作区）⇒ 「暂时没有任务的工作区」也能选、也能筛。
  /**
   * 异常数 = 「最近一次**失败**」或「最近一次**未执行**」的任务数（全量统计，不受当前筛选影响）。
   * ⚠️ 2026-09-30 评审 P0：状态条已把 `skipped`（未执行）与 `failed` 一起标红，这里（与下面的异常筛选）
   * 却只认 `failed` ⇒ 卡片红着却不在「异常」里，口径分叉。两处必须同口径。
   */
  const abnormalCount = useMemo(
    () => rowsWithOptimistic.filter(row => row.lastStatus === 'failed' || row.lastStatus === 'skipped').length,
    [rowsWithOptimistic],
  )

  const visible = useMemo(() => {
    const q = query.trim().toLowerCase()
    const filtered = rowsWithOptimistic.filter(row => {
      if (filter === 'enabled' && !row.enabled) return false
      if (filter === 'disabled' && row.enabled) return false
      if (filter === 'abnormal' && row.lastStatus !== 'failed' && row.lastStatus !== 'skipped') return false
      if (workspace !== '' && row.workspace !== workspace) return false
      if (q === '') return true
      return row.title.toLowerCase().includes(q) || (row.code ?? '').toLowerCase().includes(q)
    })
    const sorted = sortRows(filtered)
    // 排序调试（`[tdt-sort]` 日志）**单源在取数层**（`task-overview.ts`）：面板顺序一变就打，
    // 并带上决定顺序的键（在飞 + 下次执行）。把 `[tdt-sort]` 开头的行复制给我即可定位。
    debugLogOrder(sorted)
    return sorted
    // 排序只依赖内容本身；nowMs 变化不参与 ⇒ 每秒 tick 不会引起重排与动画。
    // （原「到点钳位」会在钉住/松开时重排一次；钳位已删 ⇒ 排序键由**服务端**保证稳定，见决策 54。）
  }, [rowsWithOptimistic, filter, workspace, query])

  // FLIP 签名：只在「可见集合与顺序」变化时触发动画。
  const signature = visible.map(r => `${r.id}:${r.running ? 1 : 0}:${r.enabled ? 1 : 0}`).join('|')
  const refOf = useFlip(signature)

  // 工作区筛选候选：置顶「全部工作区」（`value: ''` = 不过滤）+ 真源里的每一个工作区。
  // ⚠️ 真源由父级传入（`GET /options`），**不从卡片数据反推** ⇒ 暂时没任务的工作区也在列表里。
  const workspaceOptions = useMemo<EditorOption[]>(
    () => [{ value: '', label: t('listFilterWorkspaceAll') }, ...workspaces],
    [workspaces, t],
  )

  return h('div', { style: { width: '100%', display: 'flex', justifyContent: 'center' } },
    // 主内容宽度锚点；浮动 loading 据此量右边缘，贴到「主窗口宽度」的右下角。
    h('div', { id: PANEL_CONTENT_ID, style: PANEL_CONTENT_STYLE },
      // 顶部一排：左 = 分组按钮（全部 / 已开启 / 已关闭 / 异常）；右 = 搜索 → 工作区下拉。
      h('div', { style: { display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '12px', flexWrap: 'wrap' } },
        // 筛选 tabs 走 UI 基础层唯一实现（P1）：角标也由组件统一渲染（不再写死 #fff）
        h(Segmented<'all' | 'enabled' | 'disabled' | 'abnormal'>, {
          value: filter,
          size: 'md',
          items: [
            { value: 'all', label: t('listFilterAll') },
            { value: 'enabled', label: t('listFilterEnabled') },
            { value: 'disabled', label: t('listFilterDisabled') },
            { value: 'abnormal', label: t('listFilterAbnormal'), badge: abnormalCount },
          ],
          onChange: setFilter,
        }),
        h('span', { style: { flex: '1 1 auto' } }),
        h('div', { style: { display: 'flex', alignItems: 'center', gap: '8px', flex: 'none' } },
          h(Input, {
            className: 'dsh-tdt-tl-input',
            icon: h(IconSearchOutlineRegular, { size: 14 }),
            value: query,
            placeholder: t('listSearchPlaceholder'),
            onChange: (event: { target: { value: string } }) => { setQuery(event.target.value) },
          }),
          // 工作区下拉走 UI 基础层唯一实现（2026-10-04 收编）：此前这里是全站最后一个绕过基础层
          // 手搓的官方 `Menu` + 自绘锚点（自管 `menuOpen`、自带 `.dsh-tdt-tl-ws` 样式）⇒ 已删。
          // ⚠️ 观感有一处预期变化：选中态由「高亮」变「打勾」（`SelectField` 用 `selection:'check'`），
          //    与编辑器两处「工作区」下拉完全一致。`size:'md'` = 28，与左侧搜索框同高；定宽 `WS_WIDTH` 不变。
          h(SelectField, {
            value: workspace,
            options: workspaceOptions,
            onChange: setWorkspace,
            placeholder: t('listFilterWorkspaceAll'),
            emptyLabel: t('editorNoOptions'),
            ariaLabel: t('listFilterWorkspaceAll'),
            size: 'md',
            width: WS_WIDTH,
            marquee: true,
          }),
        ),
      ),
      visible.length === 0
        ? h('p', { style: { ...metaStyle, marginTop: '8px' } },
          rows.length === 0 && !ready ? '' : rows.length === 0 ? t('listEmpty') : t('listEmptyFiltered'))
        : h('div', { style: { position: 'relative' } },
          visible.map(row => h(TaskCard, {
            key: row.id,
            row, t, tt,
            open: openId === row.id,
            onToggleOpen: () => { setOpenId(cur => (cur === row.id ? null : row.id)) },
            onEdit,
            onViewTask,
            onDelete,
            onRunNow,
            onOpenFile,
            onOpenSession,
            refresh,
            onToggleEnabled: (id: string, enabled: boolean): void => {
              setOptimistic(cur => ({ ...cur, [id]: enabled })) // 点了立刻变，不等请求往返
              // ⚠️ 失败必须**撤掉这条乐观值**（2026-09-30 专家团复核）：失败时服务端没变、也不会 bump rev
              // ⇒ 不清就永久停在和服务端相反的位置（要等别的任务改动静默自愈）。
              void onToggleEnabled(id, enabled).then(err => {
                if (err === null) return
                setOptimistic(cur => {
                  if (!(id in cur)) return cur
                  const next = { ...cur }
                  delete next[id]
                  return next
                })
              })
            },
            refOf: refOf(row.id),
          })),
        ),
    ),
  )
}
