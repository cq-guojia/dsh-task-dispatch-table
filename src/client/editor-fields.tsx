// 任务表单的控件层（2026-09-29 用户返工轮：「下拉按官方来、日期时间控件别这么丑」）。
//
// 原则：**能直接用官方组件的一律用官方**——
//   · 下拉 = 官方 `Menu`（选中项尾随对勾 = 官方默认 `selection: 'check'`，不是自绘）
//   · 文本 = 官方 `Input` · 开关 = 官方 `Switch` · 分段 = 官方 `SegmentedControl`
//   · 浮层定位/点外关闭 = 官方 hook `useAnchoredPosition` + `useDismissOnOutsidePointer`
//
// ⚠️ **官方没有日期 / 时间选择器**（读 @deepseek-ai/dsh-client-ui-primitives@0.1.7-rc.2 的
// `lib/types/**` 与 `lib/icons/**`，无 calendar / datepicker 任何痕迹）⇒ 日历与时分列自绘，
// 但几何与色值**逐条照官方**：
//   · 输入框锚点 = 官方 `Input.module.css`（高 32 / `0.5px var(--dsw-alias-border-l4)` / bg-layer-1 /
//     `var(--dsw-radius-md)` / 14px 字号 / 图标 16px 而 `--dsw-alias-label-tertiary`）
//   · 浮层卡片 = 官方菜单卡（`var(--dsw-specific-menu)` 底 + `var(--dsw-elevation-prominent)` 影）
//   · 行悬停 = `var(--dsw-alias-interactive-bg-hover)`（官方菜单行同款）
//
// 版本事实：`Menu` / `Switch` / `Input` / `SegmentedControl` / `Pill` 在 **0.1.7-rc.1 与 rc.2 都在**
// （`MenuSurface` 才只有 rc.2 有 ⇒ 本文件不用它，自绘浮层底）。

import { createElement as h, useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import type { CSSProperties, ReactElement, ReactNode } from 'react'
import {
  IconChevronDownOutlineRegular,
  IconChevronLeftOutlineRegular,
  IconChevronRightOutlineRegular,
  IconClockOutlineRegular,
  Menu,
  SegmentedControl,
  useAnchoredPosition,
  useDismissOnOutsidePointer,
  type MenuEntry,
  type SegmentedControlOption,
} from '@deepseek-ai/dsh-client-ui-primitives'

// ─────────────────────── token（全部取宿主主题变量，明暗自适应） ───────────────────────

export const C = {
  text: 'var(--dsw-alias-label-primary, #1f2328)',
  textDim: 'var(--dsw-alias-label-secondary, rgba(128,128,128,0.95))',
  textTertiary: 'var(--dsw-alias-label-tertiary, rgba(128,128,128,0.8))',
  dimmed: 'var(--dsw-alias-label-dimmed, rgba(128,128,128,0.6))',
  layer1: 'var(--dsw-alias-bg-layer-1, rgba(128,128,128,0.08))',
  layer2: 'var(--dsw-alias-bg-layer-2, rgba(128,128,128,0.14))',
  hover: 'var(--dsw-alias-interactive-bg-hover, rgba(128,128,128,0.16))',
  borderL2: 'var(--dsw-alias-border-l2, rgba(128,128,128,0.35))',
  borderL4: 'var(--dsw-alias-border-l4, rgba(128,128,128,0.25))',
  brand: 'var(--dsw-alias-brand-primary, #0f1115)',
  brandFg: 'var(--dsw-alias-label-primary-foreground, #ffffff)',
  business: 'var(--dsw-alias-state-business-primary, #4d6bfe)',
  // ⚠️ 不能用 `--dsw-specific-menu`：它在主题里 = `var(--dsw-menu-surface-fill)`
  // = `#f8f9fa94`（亮）/ `#43454a73`（暗），**是半透明的**——官方菜单卡自带毛玻璃底（backdrop-filter），
  // 我们没有那层，照抄就是「把后面的透出来了」。自绘浮层一律用不透明的 `--dsw-alias-bg-base`。
  menuFill: 'var(--dsw-alias-bg-base, #22252a)',
  elevation: 'var(--dsw-elevation-prominent, 0 8px 28px rgba(0,0,0,0.28))',
  radiusSm: 'var(--dsw-radius-sm, 6px)',
  radiusMd: 'var(--dsw-radius-md, 8px)',
} as const

const transition = 'background 120ms ease, color 120ms ease, border-color 120ms ease'

// ─────────────────────── 通用形状 ───────────────────────

/** 下拉 / 日期 / 时分的选项（value = 写进任务定义的真值）。 */
export interface EditorOption {
  value: string
  label: string
}

/** 锚点按钮：克隆官方 `Input` 的外观（下拉、日期、时分共用同一副壳）。 */
const fieldButtonStyle: CSSProperties = {
  display: 'inline-flex', alignItems: 'center', gap: '6px', height: '32px', boxSizing: 'border-box',
  minWidth: 0, maxWidth: '100%', padding: '0 8px',
  border: `0.5px solid ${C.borderL4}`, borderRadius: C.radiusMd, background: C.layer1,
  // 13px：与官方菜单行字号同档（官方 Input 是 14px，放在卡片底部一行里偏粗）。
  color: C.text, font: 'inherit', fontSize: '13px', lineHeight: '20px', cursor: 'pointer',
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
  background: C.menuFill, boxShadow: C.elevation, borderRadius: C.radiusMd,
  color: C.text, fontSize: '13px',
}

/** 前置/后置图标位（16px，颜色走 label-tertiary，与官方 Input 的 icon 位一致）。 */
function IconSeat(props: { children: ReactNode }): ReactElement {
  return h('span', { style: { display: 'inline-flex', width: '16px', height: '16px', alignItems: 'center', justifyContent: 'center', flex: 'none', color: C.textTertiary } }, props.children)
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
   * 整行下拉（参考图里的「频率」就是这种）：锚点撑满一行。
   * 官方 `Menu` 把锚点包在自己的 `display:inline-flex` span 里，只给按钮 `width:100%` 会被这个
   * span 的 shrink-to-fit 吃掉 ⇒ 得连包装 span 一起撑（见 `BlockWrap`）。
   */
  block?: boolean
}): ReactElement {
  const [open, setOpen] = useState(false)
  const [hover, setHover] = useState(false)
  const usable = props.options.length > 0 && props.disabled !== true
  const current = props.options.find(option => option.value === props.value)
  const items: MenuEntry[] = useMemo(
    () => props.options.map(option => ({ id: option.value, label: option.label })),
    [props.options],
  )

  const anchor = h('button', {
    type: 'button',
    className: 'dsh-tdt-ed-field',
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
      width: props.width ?? (props.block === true ? '100%' : undefined),
      background: hover && usable ? C.hover : C.layer1,
      cursor: usable ? 'pointer' : 'not-allowed',
      opacity: usable ? 1 : 0.6,
    },
  },
    props.icon === undefined ? null : h(IconSeat, null, props.icon),
    h('span', { style: { ...fieldLabelStyle, color: current === undefined ? C.dimmed : C.text } },
      current?.label ?? (usable ? props.placeholder : props.emptyLabel)),
    h(IconSeat, null, h(IconChevronDownOutlineRegular, { size: 16 })),
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

// ─────────────────────── 分段（官方 SegmentedControl 的薄封装） ───────────────────────

/** 官方分段控件（options ≥ 2 项）；不锁字面量类型，调用方自行窄化。 */
export function Segmented(props: {
  id: string
  value: string
  options: readonly EditorOption[]
  onChange: (next: string) => void
  label: string
  className?: string
}): ReactElement {
  const options: SegmentedControlOption<string>[] = props.options.map(option => ({ value: option.value, label: option.label }))
  return h(SegmentedControl, {
    id: props.id,
    value: props.value,
    options,
    onChange: props.onChange,
    label: props.label,
    className: props.className,
  }) as ReactElement
}

// ─────────────────────── 日期（自绘日历；官方无此件） ───────────────────────

export interface CalendarLabels {
  /** 「今天」按钮。 */
  today: string
  /** 上/下月、上/下年（无障碍名）。 */
  prevMonth: string
  nextMonth: string
  prevYear: string
  nextYear: string
  /** 月份标题（如 2026年9月），由调用方按语言拼。 */
  monthTitle: (year: number, month: number) => string
  /** 周标题，**周一起**共 7 项。 */
  weekdays: readonly string[]
}

function pad2(value: number): string {
  return String(value).padStart(2, '0')
}

/** `YYYY-MM-DD` → 年月日；不合法返回 null。 */
function parseIsoDate(value: string): { y: number; m: number; d: number } | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value)
  if (match === null) return null
  return { y: Number(match[1]), m: Number(match[2]), d: Number(match[3]) }
}

function toIsoDate(y: number, m: number, d: number): string {
  return `${y}-${pad2(m)}-${pad2(d)}`
}

/** 本地今天（真实时间，非占位）。 */
function todayIso(): string {
  const now = new Date()
  return toIsoDate(now.getFullYear(), now.getMonth() + 1, now.getDate())
}

/** 日历单元格（含相邻月的补位）。 */
interface CalendarCell {
  iso: string
  day: number
  inMonth: boolean
  isToday: boolean
}

function buildCells(y: number, m: number): CalendarCell[] {
  const first = new Date(y, m - 1, 1)
  // 周一起排：官方参考图与国际惯例都是「一二三四五六日」。
  const offset = (first.getDay() + 6) % 7
  const start = new Date(y, m - 1, 1 - offset)
  const today = todayIso()
  const cells: CalendarCell[] = []
  for (let i = 0; i < 42; i++) {
    const date = new Date(start.getFullYear(), start.getMonth(), start.getDate() + i)
    const iso = toIsoDate(date.getFullYear(), date.getMonth() + 1, date.getDate())
    cells.push({ iso, day: date.getDate(), inMonth: date.getMonth() + 1 === m && date.getFullYear() === y, isToday: iso === today })
  }
  return cells
}

/** 自绘日历弹层（锚点 = 官方 Input 外观的按钮）。 */
export function DateField(props: {
  value: string
  onChange: (next: string) => void
  placeholder: string
  ariaLabel: string
  labels: CalendarLabels
  disabled?: boolean
  title?: string
  width?: number | string
}): ReactElement {
  const [open, setOpen] = useState(false)
  const [hoverIso, setHoverIso] = useState<string | null>(null)
  const rootRef = useRef<HTMLButtonElement | null>(null)
  const panelRef = useRef<HTMLDivElement | null>(null)
  const parsed = parseIsoDate(props.value)
  const [cursor, setCursor] = useState<{ y: number; m: number }>(() => {
    if (parsed !== null) return { y: parsed.y, m: parsed.m }
    const now = new Date()
    return { y: now.getFullYear(), m: now.getMonth() + 1 }
  })

  const pos = useAnchoredPosition({ open, anchorRef: rootRef, panelRef, side: 'bottom', align: 'start', gap: 4, margin: 12 })
  useDismissOnOutsidePointer(rootRef, open, setOpen, panelRef)

  // Esc 先关浮层：官方 Menu 也是 preventDefault ⇒ 弹窗外层据此不再关自己。
  useEffect(() => {
    if (!open) return
    const onKeyDown = (event: KeyboardEvent): void => {
      if (event.key !== 'Escape') return
      event.preventDefault()
      setOpen(false)
    }
    document.addEventListener('keydown', onKeyDown)
    return () => { document.removeEventListener('keydown', onKeyDown) }
  }, [open])

  /** 打开时把视图对到已选月（或本月）。 */
  const openPanel = useCallback((): void => {
    const current = parseIsoDate(props.value)
    if (current !== null) setCursor({ y: current.y, m: current.m })
    setOpen(true)
  }, [props.value])

  const cells = useMemo(() => buildCells(cursor.y, cursor.m), [cursor])

  const step = (months: number): void => {
    const next = new Date(cursor.y, cursor.m - 1 + months, 1)
    setCursor({ y: next.getFullYear(), m: next.getMonth() + 1 })
  }

  const navButton = (label: string, months: number, icon: ReactElement): ReactElement => h('button', {
    type: 'button',
    'aria-label': label,
    title: label,
    onClick: () => { step(months) },
    style: {
      display: 'inline-flex', alignItems: 'center', justifyContent: 'center', width: '26px', height: '26px',
      padding: 0, border: 'none', borderRadius: C.radiusSm, background: 'transparent', color: C.textDim,
      cursor: 'pointer', font: 'inherit',
    },
  }, icon)

  const anchor = h('button', {
    type: 'button',
    className: 'dsh-tdt-ed-field',
    ref: rootRef,
    disabled: props.disabled,
    'aria-haspopup': 'dialog',
    'aria-expanded': open,
    'aria-label': props.ariaLabel,
    title: props.title,
    onClick: () => { if (open) setOpen(false); else openPanel() },
    style: { ...fieldButtonStyle, width: props.width, cursor: props.disabled === true ? 'not-allowed' : 'pointer', opacity: props.disabled === true ? 0.6 : 1 },
  },
    h('span', { style: { ...fieldLabelStyle, color: props.value === '' ? C.dimmed : C.text } }, props.value === '' ? props.placeholder : props.value),
    h(IconSeat, null, h(IconChevronDownOutlineRegular, { size: 16 })),
  )

  return h('span', { style: { display: 'inline-flex', position: 'relative', minWidth: 0 } },
    anchor,
    open
      ? createPortal(h('div', {
        ref: panelRef,
        role: 'dialog',
        'aria-label': props.ariaLabel,
        // 测量出来前先藏住，免得在原点闪一帧。
        style: { ...layerStyle, ...(pos ?? {}), padding: '8px', visibility: pos === undefined ? 'hidden' : 'visible' },
      },
        h('div', { style: { display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '4px', marginBottom: '4px' } },
          navButton(props.labels.prevYear, -12, h(IconChevronLeftOutlineRegular, { size: 16 })),
          navButton(props.labels.prevMonth, -1, h(IconChevronLeftOutlineRegular, { size: 16 })),
          h('span', { style: { flex: '1 1 auto', textAlign: 'center', fontSize: '13px', fontWeight: 600, color: C.text } },
            props.labels.monthTitle(cursor.y, cursor.m)),
          navButton(props.labels.nextMonth, 1, h(IconChevronRightOutlineRegular, { size: 16 })),
          navButton(props.labels.nextYear, 12, h(IconChevronRightOutlineRegular, { size: 16 })),
        ),
        h('div', { style: { display: 'grid', gridTemplateColumns: 'repeat(7, 32px)', gap: '2px' } },
          props.labels.weekdays.map(name => h('div', {
            key: name,
            style: { height: '24px', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '12px', color: C.textTertiary },
          }, name)),
          cells.map(cell => {
            const selected = cell.iso === props.value
            const hovered = cell.iso === hoverIso && !selected
            return h('button', {
              key: cell.iso,
              type: 'button',
              'aria-label': cell.iso,
              'aria-pressed': selected,
              onPointerEnter: () => { setHoverIso(cell.iso) },
              onPointerLeave: () => { setHoverIso(current => (current === cell.iso ? null : current)) },
              onClick: () => { props.onChange(cell.iso); setOpen(false) },
              style: {
                width: '32px', height: '32px', padding: 0, font: 'inherit', fontSize: '13px', cursor: 'pointer',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                border: cell.isToday && !selected ? `1px solid ${C.business}` : '1px solid transparent',
                borderRadius: C.radiusMd,
                background: selected ? C.brand : (hovered ? C.hover : 'transparent'),
                color: selected ? C.brandFg : (cell.inMonth ? C.text : C.dimmed),
                transition,
              },
            }, String(cell.day))
          }),
        ),
        h('div', { style: { marginTop: '6px', paddingTop: '6px', borderTop: `1px solid ${C.borderL2}` } },
          h('button', {
            type: 'button',
            onClick: () => { props.onChange(todayIso()); setOpen(false) },
            style: {
              width: '100%', padding: '6px 0', border: 'none', borderRadius: C.radiusSm, background: 'transparent',
              color: C.text, font: 'inherit', fontSize: '13px', cursor: 'pointer', transition,
            },
            onPointerEnter: (event: { currentTarget: { style: CSSProperties } }) => { event.currentTarget.style.background = C.hover },
            onPointerLeave: (event: { currentTarget: { style: CSSProperties } }) => { event.currentTarget.style.background = 'transparent' },
          }, props.labels.today),
        ),
      ), document.body)
      : null,
  )
}

// ─────────────────────── 时间（自绘时分列；官方无此件） ───────────────────────

export interface TimeLabels {
  /** 小时 / 分钟两列的列名（无障碍）。 */
  hour: string
  minute: string
  now: string
  confirm: string
}

const HOURS = Array.from({ length: 24 }, (_, i) => pad2(i))
const MINUTES = Array.from({ length: 60 }, (_, i) => pad2(i))

/** 时分列：`HH:mm`。 */
export function TimeField(props: {
  value: string
  onChange: (next: string) => void
  placeholder: string
  ariaLabel: string
  labels: TimeLabels
  disabled?: boolean
  title?: string
  width?: number | string
}): ReactElement {
  const [open, setOpen] = useState(false)
  const [hover, setHover] = useState(false)
  const [draft, setDraft] = useState(props.value)
  const selectedRef = useRef<HTMLButtonElement | null>(null)
  const rootRef = useRef<HTMLButtonElement | null>(null)
  const panelRef = useRef<HTMLDivElement | null>(null)

  const pos = useAnchoredPosition({ open, anchorRef: rootRef, panelRef, side: 'bottom', align: 'start', gap: 4, margin: 12 })
  useDismissOnOutsidePointer(rootRef, open, setOpen, panelRef)

  useEffect(() => {
    if (!open) return
    const onKeyDown = (event: KeyboardEvent): void => {
      if (event.key !== 'Escape') return
      event.preventDefault()
      setOpen(false)
    }
    document.addEventListener('keydown', onKeyDown)
    return () => { document.removeEventListener('keydown', onKeyDown) }
  }, [open])

  // 打开时把当前值滚进视野（列很长，60 分钟不滚等于要用户自己滑）。
  useEffect(() => {
    if (!open) return
    selectedRef.current?.scrollIntoView({ block: 'center' })
  }, [open])

  const parsed = /^(\d{2}):(\d{2})$/.exec(draft)
  const hour = parsed === null ? '' : parsed[1]
  const minute = parsed === null ? '' : parsed[2]

  const column = (values: string[], active: string, name: string, onPick: (next: string) => void, attachRef: boolean): ReactElement =>
    h('div', {
      role: 'listbox',
      'aria-label': name,
      style: { width: '56px', maxHeight: '196px', overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: '2px' },
    }, values.map(item => h('button', {
      key: item,
      type: 'button',
      role: 'option',
      'aria-selected': item === active,
      ref: attachRef && item === active ? selectedRef : undefined,
      onClick: () => { onPick(item) },
      style: {
        padding: '5px 0', border: 'none', borderRadius: C.radiusSm, font: 'inherit', fontSize: '13px',
        cursor: 'pointer', transition,
        background: item === active ? C.hover : 'transparent',
        color: item === active ? C.text : C.textDim,
        fontWeight: item === active ? 600 : 400,
      },
    }, item)))

  const anchor = h('button', {
    type: 'button',
    className: 'dsh-tdt-ed-field',
    ref: rootRef,
    disabled: props.disabled,
    'aria-haspopup': 'dialog',
    'aria-expanded': open,
    'aria-label': props.ariaLabel,
    title: props.title,
    onPointerEnter: () => { setHover(true) },
    onPointerLeave: () => { setHover(false) },
    onClick: () => {
      if (open) { setOpen(false); return }
      setDraft(props.value)
      setOpen(true)
    },
    style: {
      ...fieldButtonStyle,
      width: props.width,
      background: hover && props.disabled !== true ? C.hover : C.layer1,
      cursor: props.disabled === true ? 'not-allowed' : 'pointer',
      opacity: props.disabled === true ? 0.6 : 1,
    },
  },
    h(IconSeat, null, h(IconClockOutlineRegular, { size: 16 })),
    h('span', { style: { ...fieldLabelStyle, color: props.value === '' ? C.dimmed : C.text } }, props.value === '' ? props.placeholder : props.value),
  )

  return h('span', { style: { display: 'inline-flex', position: 'relative', minWidth: 0 } },
    anchor,
    open
      ? createPortal(h('div', {
        ref: panelRef,
        role: 'dialog',
        'aria-label': props.ariaLabel,
        style: { ...layerStyle, ...(pos ?? {}), padding: '8px', visibility: pos === undefined ? 'hidden' : 'visible' },
      },
        h('div', { style: { display: 'flex', gap: '4px' } },
          column(HOURS, hour, props.labels.hour, next => { setDraft(`${next}:${minute === '' ? '00' : minute}`) }, true),
          column(MINUTES, minute, props.labels.minute, next => { setDraft(`${hour === '' ? '00' : hour}:${next}`) }, false),
        ),
        h('div', { style: { display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '8px', marginTop: '6px', paddingTop: '6px', borderTop: `1px solid ${C.borderL2}` } },
          h('button', {
            type: 'button',
            onClick: () => {
              const now = new Date()
              setDraft(`${pad2(now.getHours())}:${pad2(now.getMinutes())}`)
            },
            style: { padding: '4px 8px', border: 'none', borderRadius: C.radiusSm, background: 'transparent', color: C.textDim, font: 'inherit', fontSize: '12px', cursor: 'pointer', transition },
          }, props.labels.now),
          h('button', {
            type: 'button',
            onClick: () => { props.onChange(draft); setOpen(false) },
            style: {
              padding: '5px 14px', border: 'none', borderRadius: C.radiusSm, font: 'inherit', fontSize: '12px',
              fontWeight: 600, cursor: 'pointer', transition,
              background: C.business, color: 'var(--dsw-alias-label-primary-foreground, #ffffff)',
            },
          }, props.labels.confirm),
        ),
      ), document.body)
      : null,
  )
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
 * 周几多选 = 一排**小方块**（28×28，点一下勾上/取消），值 = ISO 序号 1..7（周一 = 1）。
 *
 * 2026-09-29 用户返工：原来的实现是「官方 Pill chips + 尾随 ✕ + ＋ 菜单」，用户评价
 * 「特别难看」「太大了」⇒ 换成紧凑方块；一个都不选 = 每天（间隔档就是这个语义）。
 */
export function WeekdayPicker(props: {
  value: number[]
  onChange: (next: number[]) => void
  labels: WeekdayLabels
  disabled?: boolean
}): ReactElement {
  const [hover, setHover] = useState<number | null>(null)
  const selected = new Set(props.value)

  const toggle = (day: number): void => {
    const next = selected.has(day) ? props.value.filter(item => item !== day) : [...props.value, day]
    props.onChange(next.slice().sort((a, b) => a - b))
  }

  return h('div', { style: { display: 'flex', alignItems: 'center', flexWrap: 'wrap', gap: '6px' } },
    props.labels.shorts.map((short, index) => {
      const day = index + 1
      const on = selected.has(day)
      const name = props.labels.weekdays[index] ?? String(day)
      return h('button', {
        key: day,
        type: 'button',
        className: 'dsh-tdt-ed-field',
        disabled: props.disabled,
        'aria-pressed': on,
        'aria-label': name,
        title: name,
        onClick: () => { if (props.disabled !== true) toggle(day) },
        onPointerEnter: () => { setHover(day) },
        onPointerLeave: () => { setHover(current => (current === day ? null : current)) },
        style: {
          flex: 'none', width: '28px', height: '28px', padding: 0,
          display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
          border: `0.5px solid ${on ? C.business : C.borderL4}`, borderRadius: C.radiusSm,
          background: on ? C.business : (hover === day ? C.hover : C.layer1),
          color: on ? C.brandFg : C.textDim,
          font: 'inherit', fontSize: '12px', lineHeight: '18px',
          cursor: props.disabled === true ? 'not-allowed' : 'pointer', transition,
        },
      }, short)
    }),
    props.value.length === 0
      ? h('span', { style: { fontSize: '12px', color: C.dimmed } }, props.labels.empty)
      : null,
  )
}
