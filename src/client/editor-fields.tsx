// 任务表单的控件层（2026-09-29 用户返工轮：「下拉按官方来、日期时间控件别这么丑」）。
//
// 原则：**能直接用官方组件的一律用官方**——
//   · 下拉 = 官方 `Menu`（选中项尾随对勾 = 官方默认 `selection: 'check'`，不是自绘）
//   · 文本 = 官方 `Input` · 开关 = 官方 `Switch` · **分段 = 统一基础组件 `Segmented`（src/client/ui，全站唯一实现；本文件不再薄封装官方件）**
//   · 浮层定位/点外关闭 = 官方 hook `useAnchoredPosition` + `useDismissOnOutsidePointer`
//
// ⚠️ **官方没有日期 / 时间选择器**（读 @deepseek-ai/dsh-client-ui-primitives@0.1.7-rc.2 的
// `lib/types/**` 与 `lib/icons/**`，无 calendar / datepicker 任何痕迹）⇒ 日历与时分列自绘，
// 但几何与色值**逐条照官方**：
//   · 输入框锚点 = 官方 `Input.module.css`（高 32 / `0.5px var(--tdt-border-heavy)` / bg-layer-1 /
//     `var(--tdt-radius-md)` / 14px 字号 / 图标 16px 而 `--tdt-fg-3`）
//   · 浮层卡片 = 官方菜单卡材质（走 `--tdt-surface-menu` 不透明底 + `--tdt-shadow-2` 影；官方 specific-menu 是半透明，不用）
//   · 行悬停 = `var(--tdt-hover)`（官方菜单行同款）
//
// 版本事实：`Menu` / `Switch` / `Input` / `SegmentedControl` / `Pill` 在 **0.1.7-rc.1 与 rc.2 都在**
// （`MenuSurface` 才只有 rc.2 有 ⇒ 本文件不用它，自绘浮层底）。

import { createElement as h, useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { pad2 } from './format'
import { interpolateTranslate, type Translate } from './locales'
import { createPortal } from 'react-dom'
import type { CSSProperties, ReactElement, ReactNode } from 'react'
import {
  IconChevronDownOutlineRegular,
  IconChevronLeftOutlineRegular,
  IconChevronRightOutlineRegular,
  IconClockOutlineRegular,
  Menu,
  useAnchoredPosition,
  useDismissOnOutsidePointer,
  type MenuEntry,
} from '@deepseek-ai/dsh-client-ui-primitives'
import { Button, IconButton, Segmented, type CalendarLabels, type SegmentedItem } from './ui'

// ─────────────────────── token（全部取宿主主题变量，明暗自适应） ───────────────────────


const transition = 'background 120ms ease, color 120ms ease, border-color 120ms ease'

// ─────────────────────── 通用形状 ───────────────────────

/** 下拉 / 日期 / 时分的选项（value = 写进任务定义的真值）。 */
export interface EditorOption {
  value: string
  label: string
}

/** 锚点按钮：克隆官方 `Input` 的外观（下拉、日期、时分共用同一副壳）。 */
const fieldButtonStyle: CSSProperties = {
  display: 'inline-flex', alignItems: 'center', gap: '6px', height: 'var(--tdt-control-h-lg)', boxSizing: 'border-box',
  minWidth: 0, maxWidth: '100%', padding: '0 8px',
  border: `0.5px solid var(--tdt-border-heavy)`, borderRadius: 'var(--tdt-radius-md)', background: 'var(--tdt-surface-1)',
  // 13px：与官方菜单行字号同档（官方 Input 是 14px，放在卡片底部一行里偏粗）。
  color: 'var(--tdt-fg)', font: 'inherit', fontSize: 'var(--tdt-font-md)', lineHeight: 'var(--tdt-line-md)', cursor: 'pointer',
  transition,
}

const fieldLabelStyle: CSSProperties = {
  flex: '1 1 auto', minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
  textAlign: 'left',
}

/**
 * 浮层卡片：官方菜单卡同款材质（底 + 影 + 圆角）。
 * `position: fixed` 必须自带宽：`useAnchoredPosition` 只回 `{left, top}`（读官方实现确认），
 * 定位三件套 = 本样式 + `pos` + `createPortal` 到 body（既躲弹窗内部滚动裁剪，也不受祖先 transform 影响）。
 */
const layerStyle: CSSProperties = {
  position: 'fixed', zIndex: 1100, boxSizing: 'border-box', padding: '4px',
  background: 'var(--tdt-surface-menu)', boxShadow: 'var(--tdt-shadow-2)', borderRadius: 'var(--tdt-radius-md)',
  color: 'var(--tdt-fg)', fontSize: 'var(--tdt-font-md)',
}

/** 前置/后置图标位（16px，颜色走 label-tertiary，与官方 Input 的 icon 位一致）。 */
function IconSeat(props: { children: ReactNode }): ReactElement {
  return h('span', { style: { display: 'inline-flex', width: '16px', height: '16px', alignItems: 'center', justifyContent: 'center', flex: 'none', color: 'var(--tdt-fg-3)' } }, props.children)
}

/**
 * 下拉选择：**官方 `Menu`**（portal 到 body，避免被弹窗内部滚动裁掉；
 * 选中项自动带对勾）。空列表 ⇒ 禁用并显示空态文案（接不到真数据时不塞假值）。
 */
export function SelectField(props: {
  value: string
  options: EditorOption[]
  onChange: (value: string) => void
  /** 未选中时的占位。 */
  placeholder: string
  /** 列表为空时的文案（如「暂无可选（数据面待接）」）。 */
  emptyLabel: string
  ariaLabel: string
  icon?: ReactNode
  align?: 'start' | 'end'
  disabled?: boolean
  title?: string
  /** 锚点宽度（数字 = px；不传则随内容）。 */
  width?: number | string
  /**
   * 锚点**最大**宽度（数字 = px；不传则不限）。超长工作区名会把整行撑爆 ⇒ 由调用方定上限，
   * 配合 `marquee` 用：达到上限即省略号，hover 再跑马灯展示全名（用户 2026-09-29）。
   */
  maxWidth?: number | string
  /**
   * 文本超长时是否走 `MarqueeText`（默认省略号 + hover 来回滚动）。
   * 滚动只发生在**图标右侧自己的裁剪盒里**（双层结构），不会压到行首图标下面。
   */
  marquee?: boolean
  /**
   * 整行下拉（参考图里的「频率」就是这种）：锚点撑满一行。
   * 官方 `Menu` 把锚点包在自己的 `display:inline-flex` span 里，只给按钮 `width:100%` 会被这个
   * span 的 shrink-to-fit 吃掉 ⇒ 得连包装 span 一起撑（见 `BlockWrap`）。
   */
  block?: boolean
  /**
   * `sm` = 28px 高 / 12px 字：**和官方分段控件等高**。
   * 用户 2026-09-29：排期卡头部那个频率下拉比右边三档高，一切换就整页跳。
   */
  size?: 'md' | 'sm'
  /** 校验不通过：描红边（明暗自适应，走宿主 error token），与卡片级红框同源。 */
  error?: boolean
}): ReactElement {
  const [open, setOpen] = useState(false)
  const [hover, setHover] = useState(false)
  const compact = props.size === 'sm'
  const iconSize = compact ? 14 : 16
  const usable = props.options.length > 0 && props.disabled !== true
  const current = props.options.find(option => option.value === props.value)
  const items: MenuEntry[] = useMemo(
    () => props.options.map(option => ({ id: option.value, label: option.label })),
    [props.options],
  )

  const anchor = h('button', {
    type: 'button',
    className: `dsh-tdt-ed-field${props.error === true ? ' dsh-tdt-ed-field--error' : ''}`,
    disabled: !usable,
    'aria-haspopup': 'menu',
    'aria-expanded': open,
    'aria-label': props.ariaLabel,
    title: props.title,
    onPointerEnter: () => { setHover(true) },
    onPointerLeave: () => { setHover(false) },
    onClick: () => { setOpen(!open) },
    style: {
      ...fieldButtonStyle,
      ...(compact ? { height: 'var(--tdt-control-h-md)', gap: '4px', fontSize: 'var(--tdt-font-sm)', lineHeight: 'var(--tdt-line-sm)' } : null),
      width: props.width ?? (props.block === true ? '100%' : undefined),
      ...(props.maxWidth === undefined ? {} : { maxWidth: props.maxWidth }),
      background: hover && usable ? 'var(--tdt-hover)' : 'var(--tdt-surface-1)',
      cursor: usable ? 'pointer' : 'not-allowed',
      opacity: usable ? 1 : 0.6,
    },
  },
    props.icon === undefined ? null : h(IconSeat, null, props.icon),
    // 跑马灯模式：`MarqueeText` 自带「外层裁剪 + 内层滚动」的双层结构，且它是图标之后的
    // 独立 flex 项 ⇒ 滚动只发生在自己的盒子里，绝不会跑到行首文件夹图标下面。
    props.marquee === true
      ? h(MarqueeText, {
        text: current?.label ?? (usable ? props.placeholder : props.emptyLabel),
        title: props.title ?? props.ariaLabel,
        style: { ...fieldLabelStyle, color: current === undefined ? 'var(--tdt-fg-dim)' : 'var(--tdt-fg)' },
      })
      : h('span', { style: { ...fieldLabelStyle, color: current === undefined ? 'var(--tdt-fg-dim)' : 'var(--tdt-fg)' } },
        current?.label ?? (usable ? props.placeholder : props.emptyLabel)),
    h(IconSeat, null, h(IconChevronDownOutlineRegular, { size: iconSize })),
  )

  if (!usable) return anchor
  return h(Menu, {
    open,
    anchor,
    items,
    selectedId: props.value,
    selection: 'check',
    align: props.align ?? 'start',
    portal: true,
    className: props.block === true ? 'dsh-tdt-ed-selectwrap' : undefined,
    onSelect: (id: string) => { setOpen(false); props.onChange(id) },
    onClose: () => { setOpen(false) },
  })
}



// 日期 / 时间控件实现已迁到 src/client/ui/DateTime.tsx（P4）；本文件只留 calendarLabelsOf（文案单源）。
export { DateField, TimeField } from './ui'
export type { CalendarLabels, TimeLabels } from './ui'

/**
 * 日历文案**单源**（决策 55）：`DateField` 的所有调用方（任务编辑器 / 任务卡片三面板）共用这一份，
 * 不再各处各拼月标题与按钮文案——要做日历相关改动只改这里。
 */
export function calendarLabelsOf(t: Translate): CalendarLabels {
  const tt = interpolateTranslate(t)
  return {
    today: t('editorToday'),
    prevMonth: t('editorPrevMonth'),
    nextMonth: t('editorNextMonth'),
    prevYear: t('editorPrevYear'),
    nextYear: t('editorNextYear'),
    // 月补两位（用户 2026-09-30「日期和时间的显示都补成两位」）⇒ zh「2026年09月」/ en「09/2026」。
    monthTitle: (year: number, month: number) => tt('editorMonthTitle', { y: String(year), m: pad2(month) }),
    // 日历表头用单字（一…日 / Mo…Su），日历的通用写法。
    weekdays: t('editorWeekdayShorts').split('|'),
  }
}



// ─────────────────────── 周几多选（小方块勾选） ───────────────────────

export interface WeekdayLabels {
  /** 周一起 7 项（完整名，用于 title / 无障碍名）。 */
  weekdays: readonly string[]
  /** 周一起 7 项的**单字**（方块上显示，如 一…日 / Mo…Su）。 */
  shorts: readonly string[]
  /** 一个都不选时的说明（= 每天）。 */
  empty: string
}

/**
 * 周几多选 = 全站统一分段控件 `Segmented`（multiple 模式），不再自绘一套
 * （2026-10-01 P1b：统一基础样式，派生只覆盖轴、不另写结构）。
 * 唯二差异走「特殊化变体」`.dsh-tdt-seg--weekday`（用户 2026-10-01 明确要求，复刻原 WeekdayPicker 观感）：
 *   - 每格正方形（宽 = 段高）；
 *   - 选中态品牌蓝 + 反白字（原自绘即蓝底）。
 * 皮肤集中在 `controls-css.ts`、不内联，调用点只挂一个修饰类。一个都不选 = 每天（间隔档语义）。
 */
export function WeekdayPicker(props: {
  value: number[]
  onChange: (next: number[]) => void
  labels: WeekdayLabels
  /** 段左边的说明（「星期」），没有它就是七个光秃秃的字，用户看不懂（2026-09-29）。 */
  label?: string
  disabled?: boolean
}): ReactElement {
  const items = useMemo<SegmentedItem<string>[]>(
    () => props.labels.shorts.map((short, index) => ({ value: String(index + 1), label: short })),
    [props.labels.shorts],
  )
  return h('div', { style: { display: 'flex', alignItems: 'center', flexWrap: 'wrap', gap: '8px' } },
    props.label === undefined
      ? null
      : h('span', { style: { flex: 'none', fontSize: 'var(--tdt-font-md)', color: 'var(--tdt-fg)' } }, props.label),
    // 多选；放在间隔卡里 ⇒ variant="inset"；星期多选做成「正方形 + 蓝选中」的特殊化变体
    // （用户 2026-10-01：原 WeekdayPicker 即蓝底方块，统一到 Segmented 后由 .dsh-tdt-seg--weekday 补回）。
    h(Segmented, {
      multiple: true,
      value: props.value.map(String),
      items,
      size: 'lg',
      variant: 'inset',
      className: 'dsh-tdt-seg--weekday',
      label: props.label,
      disabled: props.disabled,
      onChange: (next: string[]) => { props.onChange(next.map(Number).sort((a, b) => a - b)) },
    }),
    props.value.length === 0
      ? h('span', { style: { fontSize: 'var(--tdt-font-sm)', color: 'var(--tdt-fg-dim)' } }, props.labels.empty)
      : null,
  )
}

/**
 * 跑马灯文本（用户 2026-09-29 要求）：默认超长省略号；hover 且确实放不下时，来回滚动展示全名。
 * 自实现原因：官方 primitives 无跑马灯组件。测宽用 ResizeObserver + 文本变化重测；
 * 滚动距离 0 时不启用 hover 动画（`.dsh-tdt-mq-run` 才有动画），动画时长与距离成正比。
 *
 * **双层结构（真机截图踩坑修正）**：第一版把 transform 直接加在带 overflow:hidden 的同一个
 * span 上 ⇒ 整盒位移跑出自己的裁剪框，压到行首图标/相邻文字。改为外层 span 只负责裁剪
 * （`.dsh-tdt-mq`），内层 `.dsh-tdt-mq-in` 才做 transform 滚动——文字永远在自己那一块里跑。
 */
export function MarqueeText(props: { text: string; style?: CSSProperties; title?: string }): ReactElement {
  const outerRef = useRef<HTMLSpanElement | null>(null)
  const innerRef = useRef<HTMLSpanElement | null>(null)
  const [dist, setDist] = useState(0)
  const measure = useCallback(() => {
    const outer = outerRef.current
    const inner = innerRef.current
    if (outer === null || inner === null) return
    setDist(Math.max(0, Math.ceil(inner.scrollWidth - outer.clientWidth)))
  }, [])
  useLayoutEffect(() => {
    const outer = outerRef.current
    if (outer === null) return
    measure()
    const ro = new ResizeObserver(measure) // 抽屉拖宽变窄 / 字体就绪都会改 clientWidth ⇒ 重测
    ro.observe(outer)
    return () => { ro.disconnect() }
  }, [measure])
  useEffect(() => { measure() }, [props.text, measure])
  const run = dist > 0
  return h('span', {
    ref: outerRef,
    className: run ? 'dsh-tdt-mq dsh-tdt-mq-run' : 'dsh-tdt-mq',
    title: props.title,
    style: props.style,
  },
    h('span', {
      ref: innerRef,
      className: 'dsh-tdt-mq-in',
      style: {
        ...(run ? { '--dsh-tdt-mq-dist': `${-dist}px`, '--dsh-tdt-mq-dur': `${Math.max(3, Math.round(dist / 30))}s` } : null),
      },
    }, props.text),
  )
}
