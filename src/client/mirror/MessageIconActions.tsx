// 官方对照：packages/client/ui-chat/src/client/chat/MessageIconActions.tsx（0.1.7-rc.2 lib/client.js:1098-1163）
// data-clock=start|end；start 时时钟在行首，end 时「用量 + 时钟」一起放进 endInfo（右对齐）
//   > 复制（Tooltip「复制 / 已复制」，成功 1 秒后复位，用官方 writeClipboard）
//   > extraActions（官方留给 👍👎 之类的插槽，弹窗没有 ⇒ 不传）
//   > 分支（Tooltip「在新对话中分支 / 仅可从已完成轮次的最后一条消息分支」，unavailable 时 aria-disabled）
//   > endInfo：usageAction + time（官方 formatMessageClock）
import { createElement as h, useEffect, useRef, useState } from 'react'
import type { ReactNode } from 'react'
import {
  IconBranchOutlineRegular,
  IconCheckOutlineRegular,
  IconCopyOutlineRegular,
  Tooltip,
  writeClipboard,
} from '@deepseek-ai/dsh-client-ui-primitives'
import { ocOr } from '../official-classes'
import type { Translate } from '../locales'
import { formatMessageClock } from './message-chrome'

/** 官方「已复制」复位时间。 */
const COPIED_RESET_MS = 1_000

/** 消息操作行（复制 / 分支 / 用量 / 时钟）。 */
export function MessageIconActionsMirror(props: {
  text: string
  time?: number
  clock: 'start' | 'end'
  onBranch?: (() => void) | undefined
  branchUnavailable?: boolean
  className?: string
  extraActions?: ReactNode
  usageAction?: ReactNode
  t: Translate
}): ReturnType<typeof h> {
  const { text, time, clock, onBranch, branchUnavailable = false, className, extraActions, usageAction, t } = props
  const [copied, setCopied] = useState<boolean>(false)
  const [pending, setPending] = useState<boolean>(false)
  const timerRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined)
  useEffect(() => () => { if (timerRef.current !== undefined) clearTimeout(timerRef.current) }, [])
  const copyLabel = copied ? t('copiedLabel') : t('copyLabel')
  const onCopy = (): void => {
    if (copied || pending) return
    setPending(true)
    void writeClipboard(text).then((ok: boolean) => {
      setPending(false)
      if (!ok) return
      setCopied(true)
      timerRef.current = setTimeout(() => { setCopied(false) }, COPIED_RESET_MS)
    })
  }
  const clockEl = time === undefined ? null : h('time', {
    className: ocOr('MessageIconActions', 'clock', 'dsh-tdt-sv-clock'),
    dateTime: new Date(time).toISOString(),
  }, formatMessageClock(time, t))
  const reasonId = 'dsh-tdt-branch-unavailable'
  return h('div', {
    className: `${ocOr('MessageIconActions', 'actions', 'dsh-tdt-sv-actions')}${className === undefined ? '' : ` ${className}`}`,
    'data-clock': clock,
  },
    clock === 'start' ? clockEl : null,
    h(Tooltip, { label: copyLabel, side: 'bottom' },
      h('button', {
        type: 'button',
        className: ocOr('MessageIconActions', 'action', 'dsh-tdt-sv-action'),
        'aria-label': copyLabel,
        onClick: onCopy,
      }, copied
        ? h(IconCheckOutlineRegular, null)
        : h(IconCopyOutlineRegular, null)),
    ),
    extraActions,
    onBranch === undefined
      ? null
      : h(Tooltip, { label: branchUnavailable ? t('branchUnavailableLabel') : t('branchLabel'), side: 'bottom' },
          h('button', {
            type: 'button',
            className: ocOr('MessageIconActions', 'action', 'dsh-tdt-sv-action'),
            'aria-label': t('branchLabel'),
            'aria-disabled': branchUnavailable || undefined,
            'aria-describedby': branchUnavailable ? reasonId : undefined,
            'data-unavailable': branchUnavailable || undefined,
            onClick: branchUnavailable ? undefined : onBranch,
          }, h(IconBranchOutlineRegular, null)),
        ),
    onBranch === undefined || !branchUnavailable
      ? null
      : h('span', { id: reasonId, className: ocOr('accessibility', 'visuallyHidden', 'dsh-tdt-sv-visuallyhidden') },
          t('branchUnavailableLabel')),
    clock === 'end'
      ? h('span', { className: ocOr('MessageIconActions', 'endInfo', 'dsh-tdt-sv-endinfo') }, usageAction, clockEl)
      : usageAction,
  )
}
