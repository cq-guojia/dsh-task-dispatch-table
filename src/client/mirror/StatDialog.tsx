// 官方对照：packages/client/ui-chat/src/client/chat/stat-dialog.js（0.1.7-rc.2 lib/client.js:6278-6350）
//   PANEL_MARGIN = 12 / PANEL_GAP = 8（lib/client.js:6281-6283）
//   useStatDialog = 受控开关 + useAnchoredPosition(side:'top') + useDismissOnOutsidePointer + Escape 关闭。
// 官方用的是 primitives 的同名 hook，这里直接复用同一份实现（不是自绘定位）。
import { useEffect, useRef, useState } from 'react'
import type { CSSProperties, RefObject } from 'react'
import { useAnchoredPosition, useDismissOnOutsidePointer } from '@deepseek-ai/dsh-client-ui-primitives'

const PANEL_MARGIN = 12
const PANEL_GAP = 8

export interface StatDialogSeat {
  open: boolean
  setOpen(open: boolean): void
  rootRef: RefObject<HTMLSpanElement | null>
  panelRef: RefObject<HTMLDivElement | null>
  pos: CSSProperties | undefined
}

/** 官方 useStatDialog：把弹层挂在触发器上方（side: 'top'），点外 / Esc 关闭。 */
export function useStatDialog(controlled?: { open?: boolean; setOpen?(open: boolean): void }): StatDialogSeat {
  const [ownOpen, setOwnOpen] = useState<boolean>(false)
  const open = controlled?.open ?? ownOpen
  const setOpen = controlled?.setOpen ?? setOwnOpen
  const rootRef = useRef<HTMLSpanElement | null>(null)
  const panelRef = useRef<HTMLDivElement | null>(null)
  const pos = useAnchoredPosition({ open, anchorRef: rootRef, panelRef, side: 'top', gap: PANEL_GAP, margin: PANEL_MARGIN })
  useDismissOnOutsidePointer(rootRef, open, setOpen, panelRef)
  useEffect(() => {
    if (!open) return
    const onKeyDown = (event: KeyboardEvent): void => {
      if (event.key === 'Escape') setOpen(false)
    }
    document.addEventListener('keydown', onKeyDown)
    return () => { document.removeEventListener('keydown', onKeyDown) }
  }, [open, setOpen])
  return { open, setOpen, rootRef, panelRef, pos }
}
