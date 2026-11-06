/**
 * 日期 / 时间控件 —— 基础层。
 *
 * 2026-11-06：`DateField` 改接核心 `DateTimePicker`（`mode:'single'`, `precision:'day'`），
 * 本仓只留值格式转换；核心暂无「纯时分」档 ⇒ `TimeField` 仍为本地唯一实现（待核心补齐）。
 * 日历网格 / 浮层定位 / 明暗全部归核心，本仓不再自绘。
 */
import { createElement as h, useEffect, useRef, useState, type CSSProperties, type ReactElement } from 'react'
import { createPortal } from 'react-dom'
import { pad2 } from '../format'
import {
  IconClockOutlineRegular,
  useAnchoredPosition,
  useDismissOnOutsidePointer,
} from '@deepseek-ai/dsh-client-ui-primitives'
import { Button, DateTimePicker, type DateTimeOutput } from 'dsh-plugin-core/ui'
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

/** 估算「定死」的字段宽度（用户 2026-10-05：宽度按最宽内容定死，不随值跳动）。 */
export function fieldWidthOf(text: string, size: 'sm' | 'md' | 'lg'): number {
  const fontPx = size === 'sm' ? 12 : 13
  const extra = size === 'sm' ? 34 : 38
  let w = 0
  for (const ch of text) w += /[⺀-鿿＀-￯]/.test(ch) ? fontPx : fontPx * 0.56
  return Math.ceil(w + extra)
}

/** 时分框定宽 = 刚好放下 `00:00` + 左右留白。 */
export const timeWidthOf = (size: 'sm' | 'md' | 'lg'): number => fieldWidthOf('00:00', size) + 7

/** 日期框：核心 `DateTimePicker` 单值 / 日精度薄包装（本仓值语义 `YYYY-MM-DD`）。 */
export function DateField(props: {
  value: string
  onChange: (next: string) => void
  placeholder: string
  ariaLabel: string
  /** 核心按自身语言环境排版，这组文案不再消费（保留入参以兼容调用点）。 */
  labels?: CalendarLabels
  disabled?: boolean
  title?: string
  width?: number | string
  size?: 'sm' | 'md' | 'lg'
}): ReactElement {
  const coreValue = props.value === '' ? null : `${props.value}T00:00:00.000`
  const picker = h(DateTimePicker, {
    mode: 'single',
    precision: 'day',
    value: coreValue,
    onChange: (next: DateTimeOutput) => {
      const iso = typeof next === 'string' ? next : ''
      props.onChange(iso === '' ? '' : iso.slice(0, 10))
    },
    placeholder: props.placeholder,
    ariaLabel: props.ariaLabel,
    disabled: props.disabled,
    size: props.size ?? 'lg',
    width: props.width,
  })
  return props.title === undefined
    ? picker
    : h('span', { title: props.title, style: { display: 'inline-flex' } }, picker)
}

// ─────────────────────── 时间（本仓唯一实现，核心暂无纯时分档） ───────────────────────

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
