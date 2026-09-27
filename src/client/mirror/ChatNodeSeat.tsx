// 官方对照：packages/client/ui-chat/src/client/chat/ChatNodeSeat.tsx（0.1.7-rc.2 lib/client.js:1668-1771）
//   + 同文件里的 ChatNodeList（lib/client.js:5004-5038，order → seat 列表）。
//
// 这是「官方把一个 turn 折成一行」的全部判定，逐行照抄（源码行号见 ui-map §十七）：
//   liveProcess        = presentation && !turnClosed
//   alwaysOpen         = liveProcess || hasInterleavedInput || turnProcessAlwaysOpen(node)
//   processOpen        = alwaysOpen || stored.answerStep === spec.answerStep
//   processWindowReady = spec && presentation && foldCompleted && presentation.turn === spec.turn && (turnStarted || turnClosed)
//   processMember      = !TURN_PROCESS_INDEPENDENT_KINDS.has(kind) && anchorSeq >= spec.processStartSeq
//                        && (liveProcess || spec.answerAnchorSeq === null || anchorSeq < spec.answerAnchorSeq
//                            || groupPart === 'reasoning' && kind === 'assistant-step' && data.step === spec.answerStep)
//   processAnswer      = !liveProcess && groupPart !== 'reasoning' && kind === 'assistant-step' && data.step === spec.answerStep
//   ownsDisclosure     = kind === 'turn-process' || processAnswer
//   foldable           = processWindowReady && (liveProcess || processMember || ownsDisclosure)
//   controllerInactive = kind === 'turn-process' && foldCompleted && !foldable
//   compactAnswer      = processAnswer && foldable && presentation.compactAnswer && !processOpen
//   processHidden      = controllerInactive || (foldable && processMember && !processOpen)
// 折叠 = 给 flowItem 写 hidden 属性（官方由 useSearchableHidden 响应式置位，这里声明式写）。
// ⚠ 与官方的两点已知偏差（只读历史场景等价，写在此处便于日后 diff）：
//   1. 官方每个 seat 各自订阅 nodeStore/processSource；我们按「外层快照变化 ⇒ 整体重算」读取。
//   2. 官方 grouped('chat') 的分组项（ChatGroupSeat）未实现 ⇒ 走官方 order 兜底路径（node per key）。

import { createElement as h } from 'react'
import type { ReactNode } from 'react'
import { ocOr } from '../official-classes'

/**
 * 官方 TURN_PROCESS_INDEPENDENT_KINDS（lib/client.js:1525）：这些 kind 永远不进过程折叠区。
 */
export const TURN_PROCESS_INDEPENDENT_KINDS: ReadonlySet<string> = new Set([
  'system-prompt',
  'user',
  'steering',
  'turn-trigger',
  'turn-process',
  'turn-error',
  'turn-max-tokens',
  'turn-tail',
])

/** Turn 位置（官方 TurnLocation 的消费面，uic contract/conversation.d.ts）。 */
export interface TurnLocationFace {
  turn: number
  status?: 'open' | 'closed'
  start?: { time: number }
  end?: { time: number; data?: { reason?: { kind?: string } } }
}

/** 节点位置（官方 ConversationLocation 的消费面）。 */
export interface NodeLocationFace {
  kind?: string
  turn?: TurnLocationFace
}

/** keyed ChatNode（官方 ChatConversationViewNode + ChatNodeDataMap[kind] 的消费面）。 */
export interface ChatNodeFace {
  key: string
  kind: string
  anchorSeq: number
  data?: Record<string, unknown>
  location?: NodeLocationFace
}

/** 官方 TurnProcessChatData（ui-chat contract/chat-nodes.d.ts:83）。 */
export interface TurnProcessSpecFace {
  turn: number
  controlAnchorSeq: number
  processStartSeq: number
  answerAnchorSeq: number | null
  answerStep: number | null
  inlineReasoning: boolean
  messageCount: number
  toolCallCount: number
  subagentCount: number
}

/** 官方 ChatTurnProcessPresentation 的消费面（processSource(key) 的快照）。 */
export interface TurnProcessPresentationFace {
  turn: number
  spec?: TurnProcessSpecFace | null
  turnStarted?: boolean
  turnClosed?: boolean
  hasExternalProcess?: boolean
  hasInterleavedInput?: boolean
  compactAnswer?: boolean
}

/** keyed 节点仓库（官方 ChatNodeStore 的消费面：get + processSource）。 */
export interface ChatNodeStoreFace {
  get(key: string): ChatNodeFace | undefined
  processSource(key: string): { getSnapshot(): TurnProcessPresentationFace | undefined }
}

/**
 * 读过程席位快照。宿主 API 形态变了也只降级成「不折叠」，不让整个弹窗白屏。
 */
export function readPresentation(store: ChatNodeStoreFace | undefined, key: string): TurnProcessPresentationFace | undefined {
  if (store === undefined) return undefined
  try {
    const source = (store as Partial<ChatNodeStoreFace>).processSource
    if (typeof source !== 'function') return undefined
    return source.call(store, key)?.getSnapshot()
  } catch {
    return undefined
  }
}

/** 交给节点视图的 Turn 过程席位（官方 owner.turnProcess，ChatNodeSeat.tsx:1693-1706）。 */
export interface TurnProcessHandle {
  spec?: TurnProcessSpecFace
  foldable: boolean
  hasContent: boolean
  open: boolean
  /** 官方 turnProcessAlwaysOpen(node)：live / 已停止 / 失败的 turn 不允许折叠。 */
  alwaysOpen: boolean
  setOpen(open: boolean): void
}

/** 节点视图渲染函数（官方 slot "conversation.chat.node" 的等价物）。 */
export type NodeRenderer = (
  node: ChatNodeFace,
  turnProcess: TurnProcessHandle | undefined,
  /** 官方 groupPart：'reasoning' 只渲染思考块（组内），'response' 只渲染回复正文（组外）。 */
  groupPart?: 'response' | 'reasoning',
) => ReactNode

/** 取节点所属 turn（官方 turnOf，ChatNodeSeat.tsx:1660）。 */
export function turnOf(node: ChatNodeFace | undefined): number | undefined {
  const location = node?.location
  return location?.kind === 'turn' || location?.kind === 'step' ? location.turn?.turn : undefined
}

/** 官方 turnProcessAlwaysOpen（lib/client.js:1558）：live / 已停止 / 失败的 turn 不折叠。 */
export function turnProcessAlwaysOpen(node: ChatNodeFace | undefined): boolean {
  const location = node?.location
  if (location?.kind !== 'turn' && location?.kind !== 'step') return false
  const reason = location.turn?.end?.data?.reason?.kind
  return location.turn?.status === 'open' || reason === 'aborted' || reason === 'error'
}

/** 一个 keyed 节点 → 一个 flowItem（官方 ChatNodeSeat 的 JSX 等价物）。 */
export function ChatNodeSeatMirror(props: {
  node: ChatNodeFace
  groupPart?: 'response' | 'reasoning'
  store?: ChatNodeStoreFace
  /** turn → 已展开的 answerStep（官方 store 的 storedTurnProcessEntry）。 */
  openState: ReadonlyMap<number, number>
  onSetOpen(turn: number, answerStep: number, open: boolean): void
  /** 官方 usePresentation(policy => policy.foldCompletedTurns)；历史只读视图恒 true。 */
  foldCompleted: boolean
  renderNode: NodeRenderer
}): ReturnType<typeof h> | null {
  const { node, groupPart, store, openState, onSetOpen, foldCompleted, renderNode } = props
  const turn = turnOf(node)
  const presentation = readPresentation(store, node.key)
  // 官方 spec 来自 presentation；弹窗读归档会话时投影可能更薄 ⇒ turn-process 自身 data 兜底。
  const spec = (presentation?.spec ?? undefined)
    ?? (node.kind === 'turn-process' ? (node.data as unknown as TurnProcessSpecFace | undefined) : undefined)
  const liveProcess = presentation !== undefined && presentation.turnClosed !== true
  const interleavedInput = presentation?.hasInterleavedInput === true
  const alwaysOpen = liveProcess || interleavedInput || turnProcessAlwaysOpen(node)
  const storedAnswerStep = turn === undefined ? undefined : openState.get(turn)
  const processOpen = alwaysOpen || (spec !== undefined && storedAnswerStep === (spec.answerStep ?? 0))
  const setOpen = (open: boolean): void => {
    if (spec !== undefined && !alwaysOpen && turn !== undefined) onSetOpen(turn, spec.answerStep ?? 0, open)
  }
  const processWindowReady = spec !== undefined && presentation !== undefined && foldCompleted
    && presentation.turn === spec.turn
    && (presentation.turnStarted === true || presentation.turnClosed === true)
  const dataStep = typeof node.data?.step === 'number' ? node.data.step : undefined
  const processMember = processWindowReady && spec !== undefined
    && !TURN_PROCESS_INDEPENDENT_KINDS.has(node.kind)
    && node.anchorSeq >= spec.processStartSeq
    && (liveProcess
      || spec.answerAnchorSeq === null
      || node.anchorSeq < spec.answerAnchorSeq
      || (groupPart === 'reasoning' && node.kind === 'assistant-step' && dataStep === spec.answerStep))
  const processAnswer = processWindowReady && spec !== undefined && !liveProcess
    && groupPart !== 'reasoning'
    && node.kind === 'assistant-step'
    && dataStep === spec.answerStep
  const ownsDisclosure = node.kind === 'turn-process' || processAnswer
  const foldable = processWindowReady && (liveProcess || processMember || ownsDisclosure)
  const turnProcess: TurnProcessHandle | undefined = spec === undefined ? undefined : {
    spec,
    foldable,
    hasContent: !interleavedInput && (presentation?.hasExternalProcess === true || spec.inlineReasoning),
    open: processOpen,
    alwaysOpen,
    setOpen,
  }
  const controllerInactive = node.kind === 'turn-process' && foldCompleted && !foldable
  const compactAnswer = processAnswer && foldable && presentation?.compactAnswer === true && !processOpen
  const processHidden = controllerInactive || (foldable && processMember && !processOpen)

  // ⚠ groupPart 必须传给节点视图：'reasoning' 只渲染思考块、'response' 只渲染回复正文
  // （官方块渲染器 lib/client.js:5824-5825）。漏传会把整步（思考+文本+工具块）全画出来——
  // 步内工具块再画一张 = 与独立工具节点重复（真机踩过，2026-09-27）。
  const inner = renderNode(node, turnProcess, groupPart)
  if (inner === null || inner === undefined) return null
  const flowKey = groupPart === undefined || groupPart === 'response' ? node.key : JSON.stringify([node.key, groupPart])
  return h('div', {
    className: ocOr('ChatView', 'flowItem', 'dsh-tdt-sv-flowitem'),
    'data-chat-anchor-key': flowKey,
    'data-chat-flow-key': flowKey,
    'data-chat-paging-anchor': node.kind !== 'turn-process' || undefined,
    'data-chat-node-key': node.key,
    'data-chat-group-part': groupPart,
    'data-chat-flow-kind': node.kind,
    'data-chat-turn': turn,
    'data-turn-process-member': processMember || undefined,
    'data-turn-process-hidden': processHidden || undefined,
    'data-turn-process-answer': compactAnswer || undefined,
    hidden: processHidden || undefined,
  }, inner)
}

