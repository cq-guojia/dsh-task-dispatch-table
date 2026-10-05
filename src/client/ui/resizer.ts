/**
 * 拖拽调宽共享逻辑（U20 #3，2026-10-05）。
 *
 * 编辑分栏与预览 dock 两处原本各抄一份 pointer plumbing（preventDefault + body.user-select:none
 * + 清选区 + 监听生命周期 + 松手恢复）。现上提为本函数；调用方只给「clientX → 宽度（已 clamp）」
 * 与写入 / 提交回调，方向、clamp、写入目标（CSS 变量 / 元素 style）、iframe 处理等差异各自保留。
 */
export interface ResizeOptions {
  /** pointerdown 事件（含 clientX；可能带 preventDefault）。 */
  startEvent: { clientX: number; preventDefault?: () => void }
  /** clientX → 宽度（调用方已 clamp）。拖左变宽即 `startWidth + (startX - clientX)`。 */
  compute: (clientX: number) => number
  /** 拖动期每帧：把新宽度写到目标（CSS 变量 / 元素 style）。 */
  onMove: (width: number) => void
  /** 松手：提交最终宽度（落 state / 持久化）。 */
  onCommit: (width: number) => void
  /** 拖拽期间挂到 #dsh-tdt-root 的类（如预览 dock 的 `dsh-tdt-resizing` 令 iframe pointer-events:none）；松手移除。 */
  rootClass?: string
  /** rAF 节流（预览 dock 用，避免每帧整页重排）。 */
  rafThrottle?: boolean
}

/** 开始一次拖拽调宽（监听 window 的 pointermove / pointerup，松手自动清理）。 */
export function startResizeLayoutWidth(opts: ResizeOptions): void {
  opts.startEvent.preventDefault?.()
  const startX = opts.startEvent.clientX
  const body = document.body
  const prevUserSelect = body.style.userSelect
  body.style.userSelect = 'none'
  window.getSelection()?.removeAllRanges()
  const rootEl = document.getElementById('dsh-tdt-root')
  if (opts.rootClass !== undefined) rootEl?.classList.add(opts.rootClass)
  let frame = 0
  let pendingX = 0
  const emit = (clientX: number): number => {
    const w = opts.compute(clientX)
    opts.onMove(w)
    return w
  }
  const onMove = (event: PointerEvent): void => {
    if (opts.rafThrottle === true) {
      pendingX = event.clientX
      if (frame !== 0) return
      frame = requestAnimationFrame(() => { frame = 0; emit(pendingX) })
    } else {
      emit(event.clientX)
    }
  }
  const onUp = (event: PointerEvent): void => {
    window.removeEventListener('pointermove', onMove)
    window.removeEventListener('pointerup', onUp)
    if (frame !== 0) cancelAnimationFrame(frame)
    body.style.userSelect = prevUserSelect
    if (opts.rootClass !== undefined) rootEl?.classList.remove(opts.rootClass)
    opts.onCommit(opts.compute(event.clientX))
  }
  window.addEventListener('pointermove', onMove)
  window.addEventListener('pointerup', onUp)
}
