/**
 * 全局浮动 Loading 指示器（UI 基础层 · P1）。
 *
 * 用法：
 *   <Loading label={t('loading')} />
 *
 * 行为：
 * - fixed 定位在主内容容器右下角，**不占布局空间**；
 * - 右侧贴齐主内容容器右边缘（`anchorId` 默认 `dsh-tdt-main`），底部留 16px；
 * - 左侧三个小方块依次脉动，右侧显示文案；
 * - 监听窗口 resize / scroll / 内容盒 resize，自动跟住内容宽度。
 *
 * 配套 also 导出 `<RunningBlocks />`：同样的三个脉动方块（无文案），
 * 用于表格单元格里的「运行中」状态指示。
 *
 * 文档登记：docs/design/ui-foundation.md §二「唯一实现表」。
 */
import { createElement as h, useEffect, useState } from 'react'
import { ensureUiBase } from './style'
import { ensureLoadingStyle } from './loading-css'

const pillStyle: Record<string, string | number> = {
  position: 'fixed',
  bottom: '16px',
  zIndex: 'var(--tdt-z-dock)',
  display: 'inline-flex', alignItems: 'center', gap: '6px',
  padding: '5px 10px', borderRadius: 'var(--tdt-radius-md)',
  background: 'var(--tdt-surface-1)', border: '1px solid var(--tdt-border)',
  boxShadow: 'var(--tdt-shadow-1, 0 2px 8px rgba(0,0,0,.12))',
  color: 'var(--tdt-fg-2)', fontSize: 'var(--tdt-font-xs)', lineHeight: 'var(--tdt-line-sm)',
  // 纯提示，不吃鼠标事件（别挡住底下的内容）。
  pointerEvents: 'none',
}

const RIGHT_MARGIN_PX = 0

function useContentRight(anchorId: string): string {
  const [right, setRight] = useState(`${RIGHT_MARGIN_PX}px`)
  useEffect(() => {
    const update = (): void => {
      const el = document.getElementById(anchorId)
      if (!el) return
      const rect = el.getBoundingClientRect()
      const viewportW = document.documentElement.clientWidth
      setRight(`${Math.max(0, viewportW - rect.right + RIGHT_MARGIN_PX)}px`)
    }
    update()
    window.addEventListener('resize', update)
    window.addEventListener('scroll', update, true)
    const ro = new ResizeObserver(update)
    const el = document.getElementById(anchorId)
    if (el) ro.observe(el)
    return () => {
      window.removeEventListener('resize', update)
      window.removeEventListener('scroll', update, true)
      ro.disconnect()
    }
  }, [anchorId])
  return right
}

export interface LoadingProps {
  /** 右侧文案（如 "加载中"）。 */
  label: string
  /** 主内容容器 id，loading 贴到它的右下角；默认 `dsh-tdt-main`。 */
  anchorId?: string
}

/** 浮动 Loading pill：三个脉动方块 + 文案。 */
export function Loading(props: LoadingProps): ReturnType<typeof h> {
  ensureUiBase()
  ensureLoadingStyle()
  const right = useContentRight(props.anchorId ?? 'dsh-tdt-main')
  return h('div', { style: { ...pillStyle, right }, role: 'status', 'aria-live': 'polite' },
    h('span', { className: 'dsh-tdt-run-blocks' }, h('i', null), h('i', null), h('i', null)),
    h('span', null, props.label),
  )
}

/** 运行中状态用的三个脉动方块（无文案），颜色跟随 `currentColor`。 */
export function RunningBlocks(): ReturnType<typeof h> {
  ensureLoadingStyle()
  return h('span', { className: 'dsh-tdt-run-blocks' }, h('i', null), h('i', null), h('i', null))
}
