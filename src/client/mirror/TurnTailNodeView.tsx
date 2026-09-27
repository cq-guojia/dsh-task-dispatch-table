// 官方对照：packages/client/ui-chat/src/client/chat/TurnTailNodeView.tsx（0.1.7-rc.2 lib/client.js:6460-6546）
//   root（flex column，gap 16px）> actions（margin-top 4px / margin-left -6px）
//   data-turn-tail = turn；data-actions-reveal 官方 = always（最后一轮且有回复）| hover（历史轮，悬停才显）；
//   弹窗偏差（用户拍板 2026-09-27）：归档会话轮数少，恒 'always' 每轮操作行全部常显，不做 hover 显隐。
//   closing === null（本轮没有回复）⇒ 只留 turnTail 插槽；弹窗无插槽 ⇒ 整块不渲染。
// hasAssistantReplyContent（lib/client.js:6466）：reasoning / tool-call 不算回复，空文本不算。
import { createElement as h } from 'react'
import { ocOr } from '../official-classes'
import type { Translate } from '../locales'
import { MessageIconActionsMirror } from './MessageIconActions'
import { TurnUsagePanelMirror, type TurnTokenUsageFace } from './TurnUsagePanel'

/** 官方 AssistantContentBlock 的消费面（只用到 kind / text）。 */
interface ContentBlockFace {
  kind?: string
  text?: string
}

/** 官方 TurnTailChatData 的消费面（ui-chat contract/chat-nodes.d.ts:137）。 */
export interface TurnTailDataFace {
  turn: number
  seq: number
  closing: { time: number; blocks: ReadonlyArray<ContentBlockFace> } | null
  branchUnavailable?: boolean
  tokenUsage?: TurnTokenUsageFace
}

/** 官方 hasAssistantReplyContent。 */
export function hasAssistantReplyContent(blocks: ReadonlyArray<ContentBlockFace>): boolean {
  return blocks.some((block) => {
    if (block.kind === 'reasoning' || block.kind === 'tool-call') return false
    if (block.kind === 'text') return (block.text ?? '').trim() !== ''
    return true
  })
}

/** 官方 assistantText：只取 text 块。 */
function assistantText(blocks: ReadonlyArray<ContentBlockFace>): string {
  return blocks.flatMap(block => (block.kind === 'text' ? [block.text ?? ''] : [])).join('')
}

/** Turn 尾部操作行：复制 / 分支 / 用量 / 结束时钟。 */
export function TurnTailNodeViewMirror(props: {
  data: TurnTailDataFace
  /** 分支：以该轮 tail seq 截断开分支（undefined = 不渲染分支按钮）。 */
  onBranchAt?: (seq: number) => void
  t: Translate
}): ReturnType<typeof h> | null {
  const { data, onBranchAt, t } = props
  const closing = data.closing
  if (closing === null || closing === undefined) return null
  const text = assistantText(closing.blocks)
  return h('div', {
    className: ocOr('TurnTailNodeView', 'root', 'dsh-tdt-sv-tail'),
    'data-turn-tail': data.turn,
    'data-actions-reveal': 'always',
  },
    h(MessageIconActionsMirror, {
      text,
      time: closing.time,
      clock: 'end',
      // 分支恢复（用户拍板 2026-09-27，替代决策 37 的「不做」）：点分支 = 确认框 →
      // fork({ atSeq: 该轮 tail seq })——从这条消息位置截断开分支；头部按钮 = 省略 atSeq（最后一轮）。
      onBranch: onBranchAt === undefined ? undefined : () => { onBranchAt(data.seq) },
      className: ocOr('TurnTailNodeView', 'actions', 'dsh-tdt-sv-tail-actions'),
      usageAction: data.tokenUsage === undefined ? undefined : h(TurnUsagePanelMirror, { usage: data.tokenUsage, t }),
      t,
    }),
  )
}
