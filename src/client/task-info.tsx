// task-info.tsx — **任务信息展示层**（唯一实现，2026-10-05 立）。
//
// **为什么单独成文件**（本仓规矩：同一个东西被写第二遍就是违规）：
// 「基础信息」（标签—值纸表格）+「上次执行」现在有**两个**展示位——
//   ① 任务卡片展开区的 `TaskExpandPanel`（吃 `GET /tasks/overview` 的摘要行 `TaskOverviewRow`）；
//   ② 右侧栏的**查看档**（吃编辑草稿 `TaskEditorDraft`）。
// 两处数据源不同、要看的字段却基本同一批：若各写一份，同一个字段必然两处口径不一
// （本仓踩过的同款事故：列表与编辑器各写一份排期反解 ⇒ 同一 cron 两处文案不一样，见 `schedule-text.ts` 头注）。
// ⇒ 把「字段怎么翻译、怎么渲染」收在这里，调用方只负责把**自己的数据**塞进视图模型。
//
// **本模块是叶子**：不得 import `task-list.tsx` / `task-editor.tsx`。
// 两个视图模型构造函数需要的行类型由调用方在**自己的文件里**组装（避免反向依赖），
// 视图模型只声明它真正要用的最小字段。
import { createElement as h, Fragment, useEffect, useRef, useState, type ReactNode } from 'react'
import { formatDateTime, formatDurationHms, formatTokenCount, formatTokenDetail, pad2 } from './format'
import {
  FileTypeIcon, IconCheckCircleFillRegular, IconCloseCircleFillRegular,
  IconLoadingOutlineRegular, IconSearchOutlineRegular,
} from '@deepseek-ai/dsh-client-ui-primitives'
import type { Translate } from './locales'
import { MarqueeText } from './editor-fields'
import { outputsOf, type InstanceRow } from './query'
import { statusTextOf } from './status-text'

/** 「上次执行」只看最近一条**终态**实例；名单与卡片基础信息**完全一致**（单源，不许各处自创）。 */
export const LAST_RUN_STATUSES = ['succeeded', 'failed', 'skipped', 'unknown'] as const

// ── 纸表格（标签—值两格）的样式常量 ────────────────────────────────────────
// 列宽**不在这里定**：由整栏共用的 grid 决定（CSS 域 `domain:task-info`）。
// ⚠️ 底边缝与内边距一律走 class（`:nth-last-child` 收敛末行那条线的前提是「边框来自 CSS」，内联会盖掉它）。

/** 两栏容器（左「任务配置」+ 右「上次执行」）：右栏可能内容多 ⇒ 只滚右栏。 */
export const infoWrapStyle: Record<string, string | number> = { flex: '1 1 auto', minHeight: 0, display: 'flex', gap: '18px', marginBottom: '10px' }
/** 左栏（配置）：撑满剩余宽度、自己滚。 */
export const infoConfigStyle: Record<string, string | number> = { flex: '1 1 auto', minWidth: 0, overflowY: 'auto', paddingRight: '2px' }
/** 右栏（上次执行）：**定宽**（用户 2026-10-03：窗口拖动时让左边变、右边别跟着变）。 */
export const infoRecentStyle: Record<string, string | number> = {
  flex: 'none', width: '320px', overflowY: 'auto',
  borderLeft: '1px solid var(--tdt-border-faint)', paddingLeft: '16px',
}
/** 栏内小标题（「任务配置」/「上次执行」）；左栏标题在共用 grid 里 ⇒ 横跨标签 / 值两列。 */
export const infoGroupTitleStyle: Record<string, string | number> = {
  fontSize: 'var(--tdt-font-xs)', color: 'var(--tdt-fg-3)', fontWeight: 600,
  marginBottom: '6px', letterSpacing: '0.02em',
  gridColumn: '1 / -1',
}
const infoGridLabelStyle: Record<string, string | number> = { fontSize: 'var(--tdt-font-sm)', color: 'var(--tdt-fg-2)', whiteSpace: 'nowrap' }
const infoGridValueStyle: Record<string, string | number> = { fontSize: 'var(--tdt-font-sm)', color: 'var(--tdt-fg)', minWidth: 0, wordBreak: 'break-word', lineHeight: 'var(--tdt-line-md)' }

/** 纸表格一行 = 两个格子（标签 + 值）；返回 Fragment ⇒ 二者直接成为所在 grid 的子格，列宽由整栏共享。 */
export function InfoField(props: { label: string; children: ReactNode }): ReturnType<typeof h> {
  return h(Fragment, null,
    h('span', { className: 'dsh-tdt-info-label', style: infoGridLabelStyle }, props.label),
    h('div', { className: 'dsh-tdt-info-value', style: infoGridValueStyle }, props.children),
  )
}

/** 状态→颜色（与卡片状态条同口径：成功绿、失败/未执行红、其余中性）。 */
export const infoStatusColorOf = (status: string | null): string =>
  status === 'succeeded' ? 'var(--tdt-success)'
    : status === 'failed' || status === 'skipped' ? 'var(--tdt-danger)'
      : 'var(--tdt-fg-2)'

/** 路径取末段（产出物行显示用）。执行记录 tab 的产出物图标 tooltip 也用它（同一份，不许再抄）。 */
export const baseNameOf = (path: string): string => {
  const parts = path.split('/')
  return parts[parts.length - 1] || path
}

/** 一条实例的耗时毫秒（缺任一时刻返回 null，绝不硬凑）。 */
export const durationMsOf = (row: InstanceRow): number | null => {
  if (row.dispatched_at === null || row.finished_at === null) return null
  const ms = new Date(row.finished_at).getTime() - new Date(row.dispatched_at).getTime()
  return Number.isFinite(ms) && ms >= 0 ? ms : null
}

/**
 * 状态图标（用户 2026-10-02 换新）：成功 = 官方**圆勾**（绿）/ 失败·跳过 = 官方**圆叉**（红）/
 * 运行·派发 = 官方 **loading 转圈**（主题色）/ 排队·未知 = 空心圈。
 * 卡片展开区、执行记录 tab、右侧栏查看档三处共用（配色走 CSS 域 `domain:task-info`）。
 */
export function StatusIcon(props: { status: string }): ReturnType<typeof h> {
  const status = props.status
  if (status === 'succeeded') return h(IconCheckCircleFillRegular, { size: 15, className: 'dsh-tdt-rec-ic-ok' })
  if (status === 'failed' || status === 'skipped') return h(IconCloseCircleFillRegular, { size: 15, className: 'dsh-tdt-rec-ic-bad' })
  if (status === 'running' || status === 'dispatched') return h(IconLoadingOutlineRegular, { size: 15, className: 'dsh-tdt-rec-ic-run' })
  return h('span', { className: 'dsh-tdt-rec-ic-idle' })
}

/**
 * 「允许延迟」：ISO 8601 时长（如 `PT4H`）→ 人话（如 `4 小时`）。
 * 编辑器下拉本来就用这套人话（4 小时 / 30 分钟 / 1 天），基础信息面板此前却把裸 `PT4H` 亮给用户看，
 * 用户看不懂（用户 2026-10-03 拍板：不能用看不懂的符号表示）。
 * 解析不出（畸形值）⇒ 原样返回，不编造。
 */
export function windowLabel(iso: string, t: Translate): string {
  const m = /^PT(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?$/.exec(iso.trim())
  if (m === null) return iso
  const hh = Number(m[1] ?? 0)
  const min = Number(m[2] ?? 0)
  const sec = Number(m[3] ?? 0)
  if (hh === 0 && min === 0 && sec === 0) return `0 ${t('unitMinutes')}`
  // 24 小时整 ⇒ 规整为「1 天」（与编辑器下拉同口径）。
  if (hh > 0 && min === 0 && sec === 0 && hh % 24 === 0) return `${hh / 24} ${t('unitDays')}`
  if (hh === 0 && min > 0 && sec === 0) return `${min} ${t('unitMinutes')}`
  if (hh > 0 && min === 0 && sec === 0) return `${hh} ${t('unitHours')}`
  return iso
}

// ── 基础信息：视图模型（卡片 / 查看档各自翻译成它）──────────────────────────

/** 附加文件：`path` + `anchorSessionId` 齐备才可点开预览（缺任一个 ⇒ 只展示，**不造假入口**）。 */
export interface TaskInfoAttachmentView {
  /** 展示名（上传原名 / 链接文件名）。 */
  name: string
  /** 列表 key 用（同名不同来源要能区分）；缺省退 `name`。 */
  key?: string
  /** 服务端解析出的绝对路径；缺 ⇒ 不可点。 */
  path?: string | null
  /** 预览锚点会话；缺 ⇒ 不可点。 */
  anchorSessionId?: string | null
}

/** 前置任务（只声明展示需要的三个字段）。 */
export interface TaskInfoDependView {
  /** 任务 id（React key + 查看入口的入参）。 */
  id: string
  /** 任务名（查不到时调用方给 8 位短 id，**绝不编造**）。 */
  title: string
  /** 未启用 ⇒ 名字后补「（已停用）」标记。 */
  enabled: boolean
}

/**
 * 基础信息块要展示的东西（两处数据源的**交集**）。
 * 「预计执行」只给节点不给值：它依赖服务端派生的 `nextSlotAt`（草稿态推不出来）⇒ 不传就不渲染该行。
 */
export interface TaskInfoBaseView {
  /** 启用状态：**查看档给**（只读视图靠一行文字表达）；卡片不给（卡片外壳自有拨片与停用标记）。 */
  enabled?: boolean
  /** 排期人话（唯一来源 `schedule-text.ts`，由调用方生成）。 */
  scheduleLine: ReactNode
  /** 「预计执行」整行内容；缺 ⇒ 不渲染该行。 */
  nextSlot?: ReactNode
  workspace: string
  model: string
  /** 失败重试次数（给**节点**：卡片有数字值、草稿态没填就给「未填」占位，**绝不编 0**）。 */
  retry: ReactNode
  /** 「允许延迟」ISO 8601 时长（`PT4H`），由本层转人话。 */
  window: string
  attachments: TaskInfoAttachmentView[]
  depends: TaskInfoDependView[]
}

/** 基础信息块的全部字段行（不含栏标题与 grid 容器——那两样由调用方给）。 */
export function taskInfoBaseFields(props: {
  t: Translate
  view: TaskInfoBaseView
  /** 附件可点开预览（走全站唯一 `openFile` 入口）；不给 ⇒ 附件只展示。 */
  onOpenFile?: ((sessionId: string, path: string) => void) | undefined
  /** 前置任务名可点 ⇒ 打开该任务的查看档；不给 ⇒ 名字是纯文本。 */
  onViewTask?: ((id: string) => void) | undefined
}): ReactNode {
  const { t, view, onOpenFile, onViewTask } = props
  return h(Fragment, null,
    // 状态（仅查看档）：只读视图里没有可写的启用开关 ⇒ 用「色点 + 文字」表达
    //（r13 用户拍板：要有标签的提示作用，形式与「上次执行」的状态色块同款 —— 绿点=正常）。
    view.enabled === undefined
      ? null
      : InfoField({
        label: t('colStatus'),
        children: h('span', { style: { display: 'inline-flex', alignItems: 'center', gap: '6px', fontWeight: 500 } },
          h('span', {
            style: {
              flex: 'none', width: '8px', height: '8px', borderRadius: '2px',
              background: view.enabled ? 'var(--tdt-success)' : 'var(--tdt-fg-3)',
            },
          }),
          view.enabled ? t('infoStateEnabled') : t('infoStateDisabled')),
      }),
    InfoField({ label: t('listFieldSchedule'), children: view.scheduleLine }),
    view.nextSlot === undefined ? null : InfoField({ label: t('infoNextExec'), children: view.nextSlot }),
    InfoField({ label: t('listFieldWorkspace'), children: view.workspace }),
    InfoField({ label: t('listFieldModel'), children: view.model }),
    InfoField({ label: t('listFieldRetry'), children: view.retry }),
    InfoField({ label: t('listFieldWindow'), children: windowLabel(view.window, t) }),
    InfoField({
      label: t('listSectionAttachments'),
      children: view.attachments.length === 0
        ? h('span', { style: { color: 'var(--tdt-fg-3)' } }, t('listNone'))
        : h('div', { style: { display: 'flex', flexWrap: 'wrap', gap: '2px 10px' } },
          view.attachments.map(item => {
            const absPath = item.path
            const anchor = item.anchorSessionId
            const key = item.key ?? item.name
            const icon = h(FileTypeIcon, { path: item.name, size: 14 })
            // 文件名**限宽**（用户 2026-10-03：这里原先**完全不限宽**，超长会把整行撑爆）。
            // 只给上限、不设下限（短名就短着）；默认超长出省略号，hover 时跑马灯滚动看全名。
            // 用 MarqueeText：文字只在我自己的裁剪盒里跑，图标是隔壁 flex 项，跑马灯永远不会压到图标。
            const name = h(MarqueeText, {
              text: item.name,
              title: item.name,
              style: { maxWidth: '40ch', minWidth: 0 },
            })
            // 服务端已给出绝对路径 + 预览锚点会话时，附件可点开预览（同一 openFile 入口）；
            // 缺任一个（老版本 / 拿不到锚点）⇒ 退回纯展示，绝不造假。
            return absPath !== undefined && absPath !== null && anchor !== undefined && anchor !== null && onOpenFile !== undefined
              ? h('button', {
                // 行式文件按钮 = 基础层唯一实现（2026-10-04 收编；--inline = 内容宽、跟在文字后头）
                key, type: 'button', title: absPath,
                className: 'dsh-tdt-filechip dsh-tdt-filechip--inline',
                onClick: () => { onOpenFile(anchor, absPath) },
              }, icon, name)
              : h('span', { key, style: { display: 'inline-flex', alignItems: 'center', gap: '4px' } }, icon, name)
          }),
        ),
    }),
    InfoField({
      label: t('listSectionDepends'),
      children: view.depends.length === 0
        ? h('span', { style: { color: 'var(--tdt-fg-3)' } }, t('listNone'))
        // 每个前置任务前面带 **1、2、3 序号**（用户 2026-10-03：不然像两段莫名其妙的话摆在这儿）。
        // 名字可点（用户 2026-10-05）⇒ 右侧栏以**查看档**打开它（入口见 `onViewTask`）。
        : h('div', { style: { display: 'flex', flexDirection: 'column', gap: '4px' } },
          view.depends.map((dep, index) => {
            const seq = h('span', {
              style: {
                display: 'inline-flex', alignItems: 'center', justifyContent: 'center', flex: 'none',
                minWidth: '18px', height: '18px', padding: '0 4px', boxSizing: 'border-box',
                borderRadius: 'var(--tdt-radius-xs)', background: 'var(--tdt-chip-bg)',
                color: 'var(--tdt-fg-2)', fontSize: 'var(--tdt-font-xs)',
                fontVariantNumeric: 'tabular-nums',
              },
            }, String(index + 1))
            const label = `${dep.title}${dep.enabled ? '' : t('listDisabledTag')}`
            // 可点：整体是按钮、hover 变蓝（`.dsh-tdt-info-dep`，与「任务会话」那行同款做法）。
            return onViewTask === undefined
              ? h('span', {
                key: dep.id, style: { display: 'inline-flex', alignItems: 'center', gap: '6px', minWidth: 0 },
              }, seq, h('span', { className: 'dsh-tdt-ellipsis', title: dep.title }, label))
              : h('button', {
                key: dep.id, type: 'button', className: 'dsh-tdt-info-dep', title: t('infoViewTask'),
                onClick: () => { onViewTask(dep.id) },
              }, seq, h('span', { className: 'dsh-tdt-ellipsis' }, label))
          }),
        ),
    }),
  )
}

// ── 上次执行：明细区（空态 / 加载 / 失败由调用方套外壳）──────────────────────

/**
 * 「上次执行」一条实例的**明细**：字段区（状态 / 任务会话 / 计划执行 / 实际开始 / 结束时间 / 执行时长 /
 * Token / 备注）+ 产出物清单。返回的根节点是 `.dsh-tdt-info-rec-body`
 * （末行去缝的判据挂在它身上：有产出物时字段区末行的线要保留）。
 */
export function lastRunFields(props: {
  t: Translate
  instance: InstanceRow
  onOpenSession?: ((sessionId: string) => void) | undefined
  onOpenFile?: ((sessionId: string, path: string) => void) | undefined
  /** 查看档：状态已由块标题的色块表达 ⇒ 明细里不再重复一行（同一份实现加参数，不另写一份）。 */
  hideStatus?: boolean
}): ReactNode {
  const { t, instance, onOpenSession, onOpenFile, hideStatus = false } = props
  const sid = instance.session_id
  const canOpenSession = sid !== null && onOpenSession !== undefined
  const canOpenFile = sid !== null && onOpenFile !== undefined
  const outputs = outputsOf(instance.outputs)
  const dur = durationMsOf(instance)
  const tokens = instance.token_in === null && instance.token_out === null
    ? null
    : formatTokenCount((instance.token_in ?? 0) + (instance.token_out ?? 0))
  const note = instance.note === null || instance.note === undefined ? '' : instance.note
  const timeOf = (iso: string | null): string => iso === null ? '—' : formatDateTime(iso, { seconds: true, fallback: '—' })
  // 「任务会话」：**无虚线、无边框**——小放大镜图标包一个**灰色小标签框**（提示可查看）+ 会话名，hover 整体变蓝。
  // 颜色 / 图标框都在 class 里（inline 会盖掉 :hover）。会话名由服务端按 `sessionTitleOf` 单源下发；
  // 缺名（旧行）退回会话 id，仍可点。
  const sessionName = instance.session_title ?? sid ?? ''
  const sessionIcon = h('span', { className: 'dsh-tdt-info-session-icon' }, h(IconSearchOutlineRegular, { size: 10 }))
  const sessionLabel = h('span', { style: { flex: '1 1 auto', minWidth: 0 } }, h(MarqueeText, { text: sessionName }))
  const sessionLinkStyle: Record<string, string | number> = {
    display: 'inline-flex', alignItems: 'center', gap: '6px', maxWidth: '100%', boxSizing: 'border-box',
    padding: 0, font: 'inherit', fontSize: 'var(--tdt-font-sm)', textAlign: 'left',
    cursor: canOpenSession ? 'pointer' : 'default',
  }
  const sessionChip = sid === null || sessionName === ''
    ? h('span', { style: { color: 'var(--tdt-fg-3)' } }, '—')
    : canOpenSession
      ? h('button', {
        type: 'button', className: 'dsh-tdt-info-session', title: sessionName, style: sessionLinkStyle,
        onClick: () => { onOpenSession(sid) },
      }, sessionIcon, sessionLabel)
      : h('span', { style: sessionLinkStyle, title: sessionName }, sessionIcon, sessionLabel)
  // 根容器包住「字段区 + 产出物区」两块 ⇒ CSS 才能按**整栏实际最后一块**判末行。
  return h('div', { className: 'dsh-tdt-info-rec-body' },
    h('div', { className: 'dsh-tdt-info-rec-fields' },
      hideStatus
        ? null
        : InfoField({
          label: t('colStatus'),
          children: h('span', {
            style: { display: 'inline-flex', alignItems: 'center', gap: '6px', fontWeight: 500, color: infoStatusColorOf(instance.status) },
          },
            h(StatusIcon, { status: instance.status }),
            statusTextOf(instance.status, t),
          ),
        }),
      // 任务会话：紧跟在状态下面（用户 2026-10-03）。
      InfoField({ label: t('infoSession'), children: sessionChip }),
      // 时间四件套（用户 2026-10-03：空间够，计划 / 开始 / 结束 / 时长都放上）。
      InfoField({ label: t('colPlanned'), children: timeOf(instance.scheduled_at) }),
      InfoField({ label: t('colActualStart'), children: timeOf(instance.dispatched_at) }),
      InfoField({ label: t('infoFinishedAt'), children: timeOf(instance.finished_at) }),
      dur === null ? null : InfoField({ label: t('infoDuration'), children: formatDurationHms(dur) }),
      tokens === null ? null : InfoField({ label: t('colTokens'), children: h('span', { title: formatTokenDetail(instance) }, tokens) }),
      note === ''
        ? null
        : InfoField({ label: t('colNote'), children: h('span', { style: { color: 'var(--tdt-danger)' } }, note) }),
    ),
    outputs.length === 0
      ? null
      : h('div', { style: { marginTop: '14px' } },
        h('div', { style: { marginBottom: '6px', fontSize: 'var(--tdt-font-xs)', color: 'var(--tdt-fg-3)' } }, t('colOutputs')),
        h('div', { style: { display: 'flex', flexDirection: 'column' } },
          outputs.map(output => h('button', {
            key: output, type: 'button', title: output,
            // 行式文件按钮 = 基础层唯一实现（2026-10-04 收编；--block = 撑满父宽、一项一行）
            className: 'dsh-tdt-filechip dsh-tdt-filechip--block',
            disabled: !canOpenFile,
            onClick: () => { if (canOpenFile && onOpenFile !== undefined && sid !== null) onOpenFile(sid, output) },
          },
            h(FileTypeIcon, { path: output, size: 14 }),
            h('span', { className: 'dsh-tdt-ellipsis' }, baseNameOf(output)),
          )),
        ),
      ),
  )
}

// ── 时间「社交化」表达 + 全局秒级心跳 +「预计执行」行（2026-10-05 从 task-list.tsx 上提）──
// 卡片「下次执行 / 上次执行」与右侧栏「查看档」的「预计执行」共用同一份实现（不许两处各写一份）。
// 过去：刚刚 → N 分钟前 → N 小时前 → N 天前 → N 周前 → N 个月前 → N 年前；
// 未来：即将执行 → N 分钟后 → 今天/明天 HH:mm → N 天后 → N 周后 → N 个月后 → N 年后。

/** 没有这个时刻时的占位（停用任务没有下次执行；从未执行过没有上次）——图标保留，只占位时间。 */
export const NO_TIME = '--'

export const sameCalendarDay = (a: Date, b: Date): boolean =>
  a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate()

export function relativePast(iso: string, nowMs: number, tt: Translate): string {
  const diff = nowMs - Date.parse(iso)
  if (!(diff >= 0)) return tt('relNow')
  if (diff < 60_000) return tt('relJustNow')
  const minutes = Math.floor(diff / 60_000)
  if (minutes < 60) return tt('relMinutesAgo', { n: minutes })
  const hours = Math.floor(minutes / 60)
  if (hours < 24) return tt('relHoursAgo', { n: hours })
  const days = Math.floor(hours / 24)
  if (days < 7) return tt('relDaysAgo', { n: days })
  if (days < 30) return tt('relWeeksAgo', { n: Math.floor(days / 7) })
  const months = Math.floor(days / 30)
  if (months < 12) return tt('relMonthsAgo', { n: months })
  return tt('relYearsAgo', { n: Math.floor(days / 365) })
}

export function relativeFuture(iso: string, nowMs: number, tt: Translate): string {
  const target = Date.parse(iso)
  // 解析失败（畸形 ISO）⇒ 占位符，别渲染出「NaN 年后」（2026-09-30 专家团复核）。
  if (!Number.isFinite(target)) return NO_TIME
  const diff = target - nowMs
  if (diff <= 0) return tt('relPast')
  if (diff < 60_000) return tt('relNow')
  const minutes = Math.floor(diff / 60_000)
  if (minutes < 60) return tt('relMinutes', { n: minutes })
  const date = new Date(target)
  const now = new Date(nowMs)
  const tomorrow = new Date(now.getTime() + 24 * 3600_000)
  if (sameCalendarDay(date, now)) return tt('relToday', { time: clockOf(iso) })
  if (sameCalendarDay(date, tomorrow)) return tt('relTomorrow', { time: clockOf(iso) })
  const days = Math.ceil(diff / 86_400_000)
  if (days < 7) return tt('relDays', { n: days })
  if (days < 30) return tt('relWeeks', { n: Math.floor(days / 7) })
  const months = Math.floor(days / 30)
  if (months < 12) return tt('relMonths', { n: months })
  return tt('relYears', { n: Math.floor(days / 365) })
}

/** HH:mm（本机时区）。 */
export function clockOf(iso: string): string {
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return '—'
  return `${pad2(d.getHours())}:${pad2(d.getMinutes())}`
}

// ── 全局秒级心跳（单 timer + 局部订阅）────────────────────────────────
// ⚠️ 性能关键（用户 2026-09-30 反馈「延迟太严重」）：**不能**在列表顶层每秒 setState
// （那会整列表重渲染）。正确做法 = 全模块只有一个 interval，需要动的文本（倒计时）
// 各自订阅，每秒只重渲染那一小块。
const tickerListeners = new Set<() => void>()
let tickerTimer: number | null = null
/**
 * `visibilitychange` 处理器**只注册一次**（模块级）——2026-09-30 专家团复核：此前每次订阅起停
 * 都 `addEventListener` 且从不移除 ⇒ 反复重挂面板会累积 N 个监听、切回标签页时同一批订阅被调 N 次。
 * 这里注册一次、常驻（订阅集合空时遍历即空转，无副作用）。
 */
const onVisibilityChange = (): void => { for (const l of [...tickerListeners]) l() }
let visibilityBound = false
function subscribeTicker(cb: () => void): () => void {
  tickerListeners.add(cb)
  if (tickerTimer === null) {
    tickerTimer = window.setInterval(() => { for (const l of [...tickerListeners]) l() }, 1000)
    // 标签页被浏览器节流（后台 / 休眠）后回来 ⇒ 立刻对一次表，倒计时自动追上。
    if (!visibilityBound && typeof document !== 'undefined') {
      document.addEventListener('visibilitychange', onVisibilityChange)
      visibilityBound = true
    }
  }
  return () => {
    tickerListeners.delete(cb)
    if (tickerListeners.size === 0 && tickerTimer !== null) {
      window.clearInterval(tickerTimer)
      tickerTimer = null
    }
  }
}

/**
 * 每秒自刷新的一小块内容：只有它自己重渲染（render 永远取最新闭包，ref 转发）。
 * 2026-09-30（决策 54）：`render` 由「只能返回字符串」放宽为**可返回节点** —— 「到点未派发」
 * 时要在这里就地换成三个方块的活动指示（文案换不出来，只能给节点）。
 */
export function LiveText(props: { render: (nowMs: number) => ReactNode; style?: Record<string, string | number> }) {
  const [, force] = useState(0)
  const renderRef = useRef(props.render)
  renderRef.current = props.render
  useEffect(() => subscribeTicker(() => force(v => v + 1)), [])
  return h('span', { style: props.style }, renderRef.current(Date.now()))
}

/**
 * 「预计执行」行的渲染：两部分——左社交化相对时间（30 分钟后 / 今天 HH:mm / 3 天后…，走
 * `relativeFuture`），右具体时刻（YYYY-MM-DD HH:mm:ss）；中间竖线分隔。相对时间用 LiveText 每秒自刷。
 * 无下次执行（停用 / 一次性已收尾）⇒ 显示「无」。先收窄 `next` 为 string 再喂给格式化函数。
 */
export function renderNextExec(next: string | null, t: Translate): ReactNode {
  if (next === null) return h('span', { style: { color: 'var(--tdt-fg-3)' } }, t('listNone'))
  return h('span', { style: { display: 'inline-flex', alignItems: 'center', gap: '8px', minWidth: 0 } },
    h(LiveText, { render: (nowMs: number) => relativeFuture(next, nowMs, t) }),
    h('span', { style: { color: 'var(--tdt-fg-3)', flex: 'none' } }, '│'),
    h('span', { style: { fontVariantNumeric: 'tabular-nums' } }, formatDateTime(next, { seconds: true, fallback: NO_TIME })),
  )
}
