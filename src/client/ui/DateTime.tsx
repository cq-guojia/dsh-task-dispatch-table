/**
 * 日期 / 时间控件 —— **全站唯一实现**（L2 组件皮肤，P4）
 *
 * 官方 primitives 没有日期 / 时间选择器 ⇒ 自绘日历弹层与时分列；结构、皮肤、交互只此一份，
 * 颜色 / 尺寸 / 圆角 / 影全走 `--tdt-*`（`controls-css.ts` 的 DATETIME_CSS），明暗自适应。
 * 浮层定位 / 点外关闭走官方 `useAnchoredPosition` + `useDismissOnOutsidePointer`。
 */
import { createElement as h, useCallback, useEffect, useMemo, useRef, useState, type CSSProperties, type ReactElement } from 'react'
import { createPortal } from 'react-dom'
import {
  IconChevronDownOutlineRegular,
  IconChevronLeftOutlineRegular,
  IconChevronRightOutlineRegular,
  IconClockOutlineRegular,
  useAnchoredPosition,
  useDismissOnOutsidePointer,
} from '@deepseek-ai/dsh-client-ui-primitives'
import { Button, IconButton } from './Button'
import { ensureControlsStyle } from './controls-css'

/** 日历文案（由调用方按语言组装；`calendarLabelsOf` 在 editor-fields 里给单源实现）。 */
export interface CalendarLabels {
  /** 「今天」按钮。 */
  today: string
  /** 上/下月、上/下年（无障碍名）。 */
  prevMonth: string
  nextMonth: string
  prevYear: string
  nextYear: string
  /** 月份标题（如 2026年09月），由调用方按语言拼。 */
  monthTitle: (year: number, month: number) => string
  /** 周标题，**周一起**共 7 项。 */
  weekdays: readonly string[]
}

/** 时分文案。 */
export interface TimeLabels {
  /** 小时 / 分钟两列的列名（无障碍）。 */
  hour: string
  minute: string
  now: string
  confirm: string
}

function pad2(n: number): string {
  return String(n).padStart(2, '0')
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
export interface CalendarCell {
  /** `YYYY-MM-DD`（本地日）。 */
  iso: string
  /** 月内日号（补位格也给真实号，供显示）。 */
  day: number
  /** 是否属于当前显示月（补位格 false ⇒ 调用方淡化且不填数据）。 */
  inMonth: boolean
  isToday: boolean
}

/**
 * 月历网格的**唯一实现**（2026-10-05 提为导出：日期框的自绘日历与「任务日程」页共用同一份，
 * 不许两处各写一套网格算法）。
 * 固定 6 行 × 7 列（42 格）：行数据月不同在 5/6 行之间跳动会让下方内容上下抖。
 * @param m 1-based（与 `Date.getMonth()` 差一，与展示口径一致）。
 */
export function buildMonthCells(y: number, m: number): CalendarCell[] {
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

/**
 * 「定死」的字段宽度（用户 2026-10-05：宽度按**最宽的内容**定死，不随值跳动）。
 * 估算：CJK / 全角按 1 字 = 1em，其余按 0.56em；再加控件固定留白（内边距 + 图标 + gap）。
 * ⇒ 大多数调用点直接用默认即可；确需加宽 / 收窄的，自己在调用点传 `width` 覆盖。
 */
export function fieldWidthOf(text: string, size: 'sm' | 'md' | 'lg'): number {
  const fontPx = size === 'sm' ? 12 : 13
  const extra = size === 'sm' ? 34 : 38
  let w = 0
  for (const ch of text) w += /[⺀-鿿＀-￯]/.test(ch) ? fontPx : fontPx * 0.56
  return Math.ceil(w + extra)
}

/** 日期框定宽 = 刚好放下 `0000-00-00`（0 / 9 是最宽的数字）+ 左右留白（用户 2026-10-05：md 下 118）。 */
export const dateWidthOf = (size: 'sm' | 'md' | 'lg'): number => fieldWidthOf('0000-00-00', size) + 7
/** 时分框定宽 = 刚好放下 `00:00` + 左右留白（用户 2026-10-05：md 下 82）。 */
export const timeWidthOf = (size: 'sm' | 'md' | 'lg'): number => fieldWidthOf('00:00', size) + 7

/** 自绘日历弹层（锚点 = 统一字段壳按钮）。 */
export function DateField(props: {
  value: string
  onChange: (next: string) => void
  placeholder: string
  ariaLabel: string
  labels: CalendarLabels
  disabled?: boolean
  title?: string
  /** 自定义锚点展示文案（默认直接显示 `value`）；例如只显示「年-月」而不显示具体日。 */
  labelFormatter?: (value: string) => string
  width?: number | string
  /** 高度档（sm 24 / md 28 / lg 32，默认 lg = 32 标准行）。 */
  size?: 'sm' | 'md' | 'lg'
}): ReactElement {
  ensureControlsStyle()
  const size = props.size ?? 'lg'
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

  const cells = useMemo(() => buildMonthCells(cursor.y, cursor.m), [cursor])

  const step = (months: number): void => {
    const next = new Date(cursor.y, cursor.m - 1 + months, 1)
    setCursor({ y: next.getFullYear(), m: next.getMonth() + 1 })
  }

  const navButton = (label: string, months: number, icon: ReactElement): ReactElement => h(IconButton, {
    variant: 'plain', size: 'md', icon, label, title: label, onClick: () => { step(months) },
  })

  const anchor = h('button', {
    type: 'button',
    className: `dsh-tdt-dtf dsh-tdt-dtf--${size}`,
    ref: rootRef,
    disabled: props.disabled,
    'aria-haspopup': 'dialog',
    'aria-expanded': open,
    'aria-label': props.ariaLabel,
    title: props.title,
    onClick: () => { if (open) setOpen(false); else openPanel() },
    style: { width: props.width ?? dateWidthOf(size) },
  },
    h('span', { className: `dsh-tdt-dtf__label${props.value === '' ? ' dsh-tdt-dtf__label--ph' : ''}` },
      props.value === '' ? props.placeholder : (props.labelFormatter !== undefined ? props.labelFormatter(props.value) : props.value)),
    h('span', { className: 'dsh-tdt-dtf__icon' }, h(IconChevronDownOutlineRegular, { size: 16 })),
  )

  return h('span', { className: 'dsh-tdt-dtf-wrap' },
    anchor,
    open
      ? createPortal(h('div', {
        ref: panelRef,
        role: 'dialog',
        'aria-label': props.ariaLabel,
        className: 'dsh-tdt-layer',
        // 测量出来前先藏住，免得在原点闪一帧。
        style: { ...(pos ?? {}), visibility: pos === undefined ? 'hidden' : 'visible' },
      },
        h('div', { className: 'dsh-tdt-cal__head' },
          navButton(props.labels.prevYear, -12, h(IconChevronLeftOutlineRegular, { size: 16 })),
          navButton(props.labels.prevMonth, -1, h(IconChevronLeftOutlineRegular, { size: 16 })),
          h('span', { className: 'dsh-tdt-cal__title' }, props.labels.monthTitle(cursor.y, cursor.m)),
          navButton(props.labels.nextMonth, 1, h(IconChevronRightOutlineRegular, { size: 16 })),
          navButton(props.labels.nextYear, 12, h(IconChevronRightOutlineRegular, { size: 16 })),
        ),
        h('div', { className: 'dsh-tdt-cal__grid' },
          props.labels.weekdays.map(name => h('div', { key: name, className: 'dsh-tdt-cal__weekday' }, name)),
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
              className: `dsh-tdt-cal__cell${cell.inMonth ? '' : ' dsh-tdt-cal__cell--out'}${cell.isToday && !selected ? ' dsh-tdt-cal__cell--today' : ''}${hovered ? ' dsh-tdt-cal__cell--hover' : ''}`,
            }, String(cell.day))
          }),
        ),
        h('div', { className: 'dsh-tdt-cal__foot' },
          h(Button, {
            variant: 'ghost', size: 'sm', style: { width: '100%' },
            onClick: () => { props.onChange(todayIso()); setOpen(false) },
          }, props.labels.today),
        ),
      ), document.body)
      : null,
  )
}

// ─────────────────────── 时间（自绘时分列） ───────────────────────

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
  /** 高度档（sm 24 / md 28 / lg 32，默认 lg = 32 标准行）。 */
  size?: 'sm' | 'md' | 'lg'
}): ReactElement {
  ensureControlsStyle()
  const size = props.size ?? 'lg'
  const [open, setOpen] = useState(false)
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
    h('div', { role: 'listbox', 'aria-label': name, className: 'dsh-tdt-time__list' },
      values.map(item => h('button', {
        key: item,
        type: 'button',
        role: 'option',
        'aria-selected': item === active,
        ref: attachRef && item === active ? selectedRef : undefined,
        className: 'dsh-tdt-time__opt',
        onClick: () => { onPick(item) },
      }, item)))

  const anchor = h('button', {
    type: 'button',
    className: `dsh-tdt-dtf dsh-tdt-dtf--${size}`,
    ref: rootRef,
    disabled: props.disabled,
    'aria-haspopup': 'dialog',
    'aria-expanded': open,
    'aria-label': props.ariaLabel,
    title: props.title,
    onClick: () => {
      if (open) { setOpen(false); return }
      setDraft(props.value)
      setOpen(true)
    },
    style: { width: props.width ?? timeWidthOf(size) } as CSSProperties,
  },
    h('span', { className: 'dsh-tdt-dtf__icon' }, h(IconClockOutlineRegular, { size: 16 })),
    h('span', { className: `dsh-tdt-dtf__label${props.value === '' ? ' dsh-tdt-dtf__label--ph' : ''}` },
      props.value === '' ? props.placeholder : props.value),
  )

  return h('span', { className: 'dsh-tdt-dtf-wrap' },
    anchor,
    open
      ? createPortal(h('div', {
        ref: panelRef,
        role: 'dialog',
        'aria-label': props.ariaLabel,
        className: 'dsh-tdt-layer',
        style: { ...(pos ?? {}), visibility: pos === undefined ? 'hidden' : 'visible' },
      },
        h('div', { className: 'dsh-tdt-time__cols' },
          column(HOURS, hour, props.labels.hour, next => { setDraft(`${next}:${minute === '' ? '00' : minute}`) }, true),
          column(MINUTES, minute, props.labels.minute, next => { setDraft(`${hour === '' ? '00' : hour}:${next}`) }, false),
        ),
        h('div', { className: 'dsh-tdt-time__foot' },
          h(Button, {
            variant: 'ghost', size: 'sm',
            onClick: () => {
              const now = new Date()
              setDraft(`${pad2(now.getHours())}:${pad2(now.getMinutes())}`)
            },
          }, props.labels.now),
          h(Button, {
            variant: 'primary', size: 'sm',
            onClick: () => { props.onChange(draft); setOpen(false) },
          }, props.labels.confirm),
        ),
      ), document.body)
      : null,
  )
}
