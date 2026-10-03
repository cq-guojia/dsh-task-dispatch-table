/**
 * 任务选择器（带搜索） —— **全站唯一实现**（L2 组件皮肤）
 *
 * 什么时候用它：**候选多（几十上百）或需要按名字 / id 搜索**的任务选择。
 * 候选少（十几个以内）用 `SelectField` 就够，别用它（两者分工见 docs/design/ui-foundation.md §5.4）。
 *
 * 形态：锚点（与 `SelectField` 同款 —— 样式从 `Field.tsx` 导入**共用那一份**，不许再抄）点开浮层
 * ⇒ 顶部搜索框 + 候选列表 +「更多 / 收起」。底层 = 官方 `Menu`（定位 / portal / 点外关闭 / Esc）
 * + 基础层 `Input`，**不自绘浮层**。
 *
 * ⚠️ 两条硬规矩（用户 2026-10-03 拍板，见 docs/design/ui-foundation.md §5.4）：
 *  ① `scope` 是**受控入参**，不是内部 state —— 外部改工作区 ⇒ 候选实时重算；
 *  ② 已选项掉出作用域 ⇒ **显式提示**（`outOfScopeHint`），**不静默清空**（静默清空会让用户以为自己没选过）。
 *     ⚠️ 执行记录页在**改工作区时主动清空**掉队任务（那是筛选语义，两码事，见 records-timeline.tsx 注释）。
 *
 * 源码级依据（2026-10-04 解包核实，宿主 0.2.0-rc.2 `lib/index.js:3927` 的 `Menu`；已回写
 * docs/design/external/dsh-capabilities.md §官方组件签名要点）：
 *  - `children` 渲染进 MenuSurface 的 viewport（`:4246`），键盘只处理 Escape / Tab / 方向键（`:4093-4114`），
 *    字母键不拦 ⇒ 搜索框能正常打字；方向键在浮层内游走属预期（等同于下拉的键盘操作）。
 *  - `autoFocus` 会把焦点抢到浮层第一个按钮（`:4038-4044`）⇒ **不用它**，打开后自己聚焦搜索框。
 */
import { createElement as h, useCallback, useEffect, useMemo, useRef, useState, type RefObject } from 'react'
import { IconChevronDownOutlineRegular, IconSearchOutlineRegular, Menu } from '@deepseek-ai/dsh-client-ui-primitives'
import { Input, FIELD_ANCHOR_STYLE, FIELD_LABEL_STYLE, fieldMetricsOf, type FieldSize } from './Field'
import { applyStyle } from './style'
import { ensureControlsStyle } from './controls-css'
import { MarqueeText } from './MarqueeText'

/** 一条任务候选（与 L3 的 `EditorTaskOption` 同形 ⇒ 结构兼容；**刻意不反向 import 业务文件**）。 */
export interface TaskOption {
  /** 任务 UUID。 */
  id: string
  /** 展示名（统一口径 `[编号] 名称`）。 */
  label: string
  /** 所属工作区（title），供 `scope` 过滤。 */
  workspace: string
  /** 停用任务照常可选，只是尾部加 `disabledTag`。 */
  enabled: boolean
}

export interface TaskPickerProps {
  /** 当前选中的任务 id；'' = 未选。 */
  value: string
  /** 选中回调（传值，不传 event —— 与 `SelectField` 同契约）。 */
  onChange: (id: string) => void
  /** 候选全量（调用方负责按 `[code] name` 组装 label）。 */
  options: readonly TaskOption[]
  /** 外部受控的工作区作用域；'' 或 undefined = 不限。变化 ⇒ 候选实时重算。 */
  scope?: string
  /** 排除项（已选前置 / 当前任务自己）。 */
  excludeIds?: readonly string[]
  /** 未搜索时默认展示的条数（默认 10），其余走「更多」。 */
  recentLimit?: number
  placeholder: string
  /** 候选为空 / 搜不到时的文案。 */
  emptyLabel: string
  ariaLabel: string
  /** 浮层内搜索框的占位。 */
  searchPlaceholder: string
  /** 停用任务的尾缀（如「（已停用）」）。 */
  disabledTag?: string
  /** 已选项不在当前作用域时的悬浮说明（不传则不提示）。 */
  outOfScopeHint?: string
  /** 「更多」按钮文案（默认「更多」）。 */
  moreLabel?: string
  /** 「收起」按钮文案（默认「收起」）。 */
  collapseLabel?: string
  disabled?: boolean
  /** 高度档（sm 24 / md 28 / lg 32，默认 lg）。 */
  size?: FieldSize
  /** 锚点宽度（数字 = px）。 */
  width?: number | string
  align?: 'start' | 'end'
}

/** 任务选择器浮层的皮肤规则（只消费 `var(--tdt-*)`，间距走 `--tdt-space-*`）。 */
export const TASKPICKER_CSS = `
/* ── 任务选择器（带搜索）────────────────────────────────────────────────
   结构：搜索行 + 列表 +「更多 / 收起」。浮层外壳由官方 Menu 提供，这里只管内容。
   ⚠️ 官方 MenuSurface 自带内边距与圆角 ⇒ 本面板不再套第二层壳，避免双层底。 */
.dsh-tdt-tp{display:flex;flex-direction:column;gap:var(--tdt-space-1);min-width:220px;max-width:340px;}
.dsh-tdt-tp-search{display:flex;align-items:center;gap:var(--tdt-space-1);padding:0 var(--tdt-space-1);color:var(--tdt-fg-3);}
.dsh-tdt-tp-search > span{display:inline-flex;flex:none;}
/* 列表定高（内容区尺寸，属 ui-style-guide §三「已知例外」的内容区定高一类）。 */
.dsh-tdt-tp-list{display:flex;flex-direction:column;max-height:264px;overflow-y:auto;}
.dsh-tdt-tp-row{display:flex;align-items:center;gap:var(--tdt-space-2);width:100%;padding:6px var(--tdt-space-2);
  border:0;border-radius:var(--tdt-radius-sm);background:transparent;color:var(--tdt-fg);font:inherit;
  font-size:var(--tdt-font-md);line-height:var(--tdt-line-md);text-align:left;cursor:pointer;}
.dsh-tdt-tp-row:hover{background:var(--tdt-hover);}
/* 键盘可达性：与其它控件同款描边（不得只靠 hover 表达可交互）。 */
.dsh-tdt-tp-row:focus-visible,.dsh-tdt-tp-more:focus-visible{outline:2px solid var(--tdt-business);outline-offset:-2px;}
.dsh-tdt-tp-row--on{color:var(--tdt-business);}
.dsh-tdt-tp-name{flex:1 1 auto;min-width:0;}
.dsh-tdt-tp-check{flex:none;display:inline-flex;width:14px;align-items:center;justify-content:center;}
.dsh-tdt-tp-more{border:0;border-top:1px solid var(--tdt-border-faint);margin-top:2px;padding:6px var(--tdt-space-2);
  background:transparent;color:var(--tdt-business);font:inherit;font-size:var(--tdt-font-sm);text-align:left;cursor:pointer;}
.dsh-tdt-tp-more:hover{background:var(--tdt-hover);}
.dsh-tdt-tp-empty{padding:var(--tdt-space-2);color:var(--tdt-fg-3);font-size:var(--tdt-font-sm);text-align:center;}
`

/** 皮肤域固定名（注入顺序在 controls 之后）。 */
export const TASKPICKER_DOMAIN = 'domain:taskpicker'

/** 确保本控件皮肤已登记并注入（幂等）。 */
export function ensureTaskPickerStyle(): void {
  applyStyle(TASKPICKER_DOMAIN, TASKPICKER_CSS)
}

/** 带搜索的任务选择器。 */
export function TaskPicker(props: TaskPickerProps): ReturnType<typeof h> {
  ensureControlsStyle()
  ensureTaskPickerStyle()
  const size = props.size ?? 'lg'
  const metrics = fieldMetricsOf(size)

  const [open, setOpen] = useState(false)
  const [hover, setHover] = useState(false)
  const [keyword, setKeyword] = useState('')
  const [showAll, setShowAll] = useState(false)
  const searchRef = useRef<HTMLInputElement | null>(null) as RefObject<HTMLInputElement | null>
  const anchorRef = useRef<HTMLButtonElement | null>(null)

  // 候选 = 全量 → 过作用域 → 排除项。**作用域变化即重算**（受控入参，不是内部 state）。
  const candidates = useMemo(() => {
    const scope = props.scope ?? ''
    const excludes = props.excludeIds ?? []
    return props.options.filter(o => (scope === '' || o.workspace === scope) && !excludes.includes(o.id))
  }, [props.options, props.scope, props.excludeIds])

  // 搜索：按展示名 / 任务 id 实时过滤（id 命中是用户点名要的）；命中即不限条数。
  const kw = keyword.trim().toLowerCase()
  const searching = kw !== ''
  const matched = useMemo(
    () => (searching ? candidates.filter(o => o.label.toLowerCase().includes(kw) || o.id.toLowerCase().includes(kw)) : candidates),
    [candidates, searching, kw],
  )
  const limit = props.recentLimit ?? 10
  const visible = (searching || showAll) ? matched : matched.slice(0, limit)
  const restCount = matched.length - visible.length

  const current = props.options.find(o => o.id === props.value)
  // 已选中的任务不在候选里（多半是掉出了作用域）⇒ 照常显示它的名字 + 显式提示，不静默清空。
  const outOfScope = current !== undefined && props.value !== '' && !candidates.some(o => o.id === props.value)
  const shownLabel = current === undefined || props.value === '' ? props.placeholder : current.label

  // 打开 ⇒ 聚焦搜索框（官方 Menu 的 autoFocus 会抢到列表第一个按钮，故不用它）。
  useEffect(() => { if (open) searchRef.current?.focus() }, [open])
  // 关闭 ⇒ 复位（下次打开是干净的「最近 N 条」）。
  useEffect(() => { if (!open) { setKeyword(''); setShowAll(false) } }, [open])

  /** 选中一项：回调 + 关浮层 + **把焦点还给锚点**（否则焦点落在 body，键盘用户会掉队）。 */
  const pick = useCallback((id: string): void => {
    props.onChange(id)
    setOpen(false)
    anchorRef.current?.focus()
  }, [props])

  const anchor = h('button', {
    ref: anchorRef,
    type: 'button',
    className: 'dsh-tdt-ed-field',
    disabled: props.disabled === true,
    'aria-haspopup': 'menu',
    'aria-expanded': open,
    'aria-label': props.ariaLabel,
    title: outOfScope ? props.outOfScopeHint : undefined,
    onPointerEnter: () => { setHover(true) },
    onPointerLeave: () => { setHover(false) },
    onClick: () => { setOpen(v => !v) },
    style: {
      ...FIELD_ANCHOR_STYLE,
      height: metrics.height, gap: metrics.gap, fontSize: metrics.font, lineHeight: metrics.line,
      width: props.width,
      background: hover && props.disabled !== true ? 'var(--tdt-hover)' : 'var(--tdt-surface-1)',
      cursor: props.disabled === true ? 'not-allowed' : 'pointer',
      opacity: props.disabled === true ? 0.6 : 1,
    },
  },
    h(MarqueeText, {
      text: shownLabel,
      title: props.ariaLabel,
      className: 'dsh-tdt-ellipsis',
      style: { ...FIELD_LABEL_STYLE, color: current === undefined || props.value === '' ? 'var(--tdt-fg-dim)' : 'var(--tdt-fg)' },
    }),
    // 掉出作用域：给一个可见的告警记号（细节在 title / outOfScopeHint 里）。
    outOfScope ? h('span', { style: { flex: 'none', fontSize: 'var(--tdt-font-xs)', color: 'var(--tdt-warning)' } }, '!') : null,
    h('span', { style: { display: 'inline-flex', width: `${metrics.icon}px`, height: `${metrics.icon}px`, alignItems: 'center', justifyContent: 'center', flex: 'none', color: 'var(--tdt-fg-3)' } },
      h(IconChevronDownOutlineRegular, { size: metrics.icon })),
  )

  const panel = h('div', { className: 'dsh-tdt-tp' },
    h('div', { className: 'dsh-tdt-tp-search' },
      h('span', null, h(IconSearchOutlineRegular, { size: 14 })),
      h(Input, {
        value: keyword,
        onChange: setKeyword,
        placeholder: props.searchPlaceholder,
        size,
        'aria-label': props.searchPlaceholder,
        inputRef: searchRef,
        // 键盘友好：↓ 把焦点送进列表，Enter 直接选中「第一个匹配」（省一次 Tab/方向键 + 点击）。
        onKeyDown: (event: { key: string; preventDefault(): void }) => {
          if (event.key === 'Enter') {
            const first = visible[0]
            if (first === undefined) return
            event.preventDefault()
            pick(first.id)
            return
          }
          if (event.key !== 'ArrowDown') return
          event.preventDefault()
          // 浮层 portal 到 body，从搜索框往上找本面板，再聚焦第一行（官方 Menu 的方向键逻辑接管后续）。
          const row = searchRef.current?.closest('.dsh-tdt-tp')?.querySelector<HTMLButtonElement>('.dsh-tdt-tp-row')
          row?.focus()
        },
      }),
    ),
    h('div', { className: 'dsh-tdt-tp-list' },
      visible.length === 0
        ? h('div', { className: 'dsh-tdt-tp-empty' }, props.emptyLabel)
        : visible.map(o => h('button', {
          type: 'button',
          key: o.id,
          className: `dsh-tdt-tp-row${o.id === props.value ? ' dsh-tdt-tp-row--on' : ''}`,
          'aria-selected': o.id === props.value,
          onClick: () => { pick(o.id) },
        },
          h('span', { className: 'dsh-tdt-tp-name dsh-tdt-ellipsis' }, o.enabled === false ? `${o.label}${props.disabledTag ?? ''}` : o.label),
          o.id === props.value ? h('span', { className: 'dsh-tdt-tp-check', 'aria-hidden': true }, '✓') : null,
        )),
    ),
    !searching && (showAll || restCount > 0)
      ? h('button', {
        type: 'button',
        className: 'dsh-tdt-tp-more',
        onClick: () => { setShowAll(v => !v) },
      }, showAll ? (props.collapseLabel ?? '收起') : `${props.moreLabel ?? '更多'}（${matched.length}）`)
      : null,
  )

  if (props.disabled === true) return anchor
  return h(Menu, {
    open,
    anchor,
    children: panel,
    align: props.align ?? 'start',
    portal: true,
    // 列表走自绘行（不带 role=menuitem）⇒ 官方 onSelect 不会被触发，这里只做契约占位。
    onSelect: () => { /* no-op：选中由行自身 onClick / 搜索框 Enter 完成 */ },
    onClose: () => { setOpen(false) },
  })
}
