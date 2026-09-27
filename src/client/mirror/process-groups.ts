// 官方对照：packages/client/ui-chat/src/client/conversation-nodes/process-groups.js（0.1.7-rc.2 lib/client.js:10563-10772）
//   + processActivity（10527-10561）+ activity（10426-10449）+ processTitle（1820-1836）。
//
// 为什么自实现而不是调官方 `views.grouped('chat')`：公开契约 `ConversationBinding`
// （uic conversation/assembly.d.ts:15-35）只暴露 snapshot / openTurn / activate / target，
// grouped 读取器挂在内部 assembler（BoundConversation.viewStore）上、不在契约面 ⇒
// 按决策 34 ④「不依赖宿主内部符号」，这里按官方算法逐行移植（输入只用电面数据 order + nodes）。
//
// 官方分层（用户截图核对）：一级 = TurnProcessNodeView「用时 34 秒」；二级 = 本文件产出的
// 过程分组行（「已读取文件，执行了命令，已调用工具等」）；三级 = 组内条目各自展开
// （工具卡 / 思考行）。分组规则（TurnGroups.rebuild，10680-10756）：
//   INDEPENDENT kind（user/steering/turn-trigger/model-retry/turn-error/turn-max-tokens/turn-tail）
//     ⇒ 先闭合当前组，节点独立成条目；
//   turn-process ⇒ 独立条目（不闭合组）；
//   assistant-step ⇒ 有 reasoning 块 ⇒ 以 groupPart:'reasoning' 入组；有回复内容 ⇒
//     先闭合组、再以 groupPart:'response' 独立成条目；
//   其余 kind（tool-call 等）⇒ 入组。组键 = ["process", 首成员 key, groupPart]。
import type { ChatNodeFace } from './ChatNodeSeat'
import type { LocaleKey, Translate } from '../locales'

/** 官方 ProcessActivity（contract/process-groups.d.ts:2）。 */
export type ProcessActivity =
  | 'read' | 'readImage' | 'search' | 'write' | 'edit' | 'commands' | 'code'
  | 'webSearch' | 'webFetch' | 'subagents' | 'plan' | 'questions' | 'tools'

/** 官方 ProcessGroupData（contract/process-groups.d.ts:15；归档场景 running 恒空）。 */
export interface ProcessGroupDataFace {
  turn: number
  closed: boolean
  summary: { counts: ReadonlyArray<{ kind: ProcessActivity; count: number }> }
}

/** 官方 GroupSnapshot 的消费面。 */
export interface ProcessGroupSnapshot {
  key: string
  members: ReadonlyArray<{ key: string; groupPart?: 'response' | 'reasoning' }>
  data: ProcessGroupDataFace
}

/** 官方 RenderEntry：独立节点引用或过程分组引用。 */
export type ChatEntry =
  | { kind: 'node'; key: string; groupPart?: 'response' | 'reasoning' }
  | { kind: 'group'; key: string }

export interface GroupedView {
  entries: ChatEntry[]
  groups: ReadonlyMap<string, ProcessGroupSnapshot>
}

/** 官方 INDEPENDENT（process-groups.js:10565；注意与 ChatNodeSeat 的清单不同）。 */
const INDEPENDENT: ReadonlySet<string> = new Set([
  'user',
  'steering',
  'turn-trigger',
  'model-retry',
  'turn-error',
  'turn-max-tokens',
  'turn-tail',
])

/** 节点所属 turn（官方 turnOf，process-groups.js:10574）。 */
function turnOfNode(node: ChatNodeFace): number | undefined {
  const location = node.location
  return location?.kind === 'turn' || location?.kind === 'step' ? location.turn?.turn : undefined
}

/** 官方 reasoning（10578）：assistant-step 带非空思考块。 */
function hasReasoning(node: ChatNodeFace): boolean {
  if (node.kind !== 'assistant-step' || !Array.isArray(node.data?.blocks)) return false
  return (node.data?.blocks as Array<{ kind?: string; text?: string }>).some(
    block => block?.kind === 'reasoning' && (block.text ?? '').trim() !== '',
  )
}

/** 官方 reply（10581）：assistant-step 带回复内容（reasoning / tool-call 不算，空文本不算）。 */
function hasReply(node: ChatNodeFace): boolean {
  if (node.kind !== 'assistant-step' || !Array.isArray(node.data?.blocks)) return false
  return (node.data?.blocks as Array<{ kind?: string; text?: string }>).some((block) => {
    if (block === null || typeof block !== 'object') return false
    if (block.kind === 'reasoning' || block.kind === 'tool-call') return false
    if (block.kind === 'text') return (block.text ?? '').trim() !== ''
    return true
  })
}

/** 官方 activity（10426-10449）：工具名 → 活动类别。 */
export function toolActivity(name: string): ProcessActivity {
  if (name === 'read') return 'read'
  if (name === 'read_image') return 'readImage'
  if (name === 'grep' || name === 'glob' || name.endsWith('_inspect')) return 'search'
  if (name === 'write') return 'write'
  if (name === 'edit' || name === 'apply_patch') return 'edit'
  if (['bash', 'pwsh', 'exec_command', 'write_stdin'].includes(name) || name.startsWith('terminal_')) return 'commands'
  if (name === 'run_code') return 'code'
  if (name === 'web_search') return 'webSearch'
  if (name === 'web_fetch') return 'webFetch'
  if (name === 'subagent' || name.startsWith('subagent_')) return 'subagents'
  if (['todo_write', 'create_goal', 'update_goal', 'get_goal'].includes(name)) return 'plan'
  if (name === 'ask_user_question' || name === 'request_user_input') return 'questions'
  return 'tools'
}

interface ToolRootFace {
  kind?: string
  phase?: string
  callId?: string
  name?: string
  argsRaw?: string
  call?: { name?: string } | null
  subCalls?: ToolRootFace[]
}

/** ToolCallBlock → 本次调用的名字面（running 半截在根上，settled 在 call 里）。 */
function toolCallFace(root: ToolRootFace): { callId: string; name: string } | null {
  const callId = typeof root.callId === 'string' ? root.callId : ''
  if (root.kind === 'tool-result') {
    const name = typeof root.call?.name === 'string' ? root.call.name : ''
    return callId === '' || name === '' ? null : { callId, name }
  }
  const name = typeof root.name === 'string' ? root.name : ''
  return callId === '' || name === '' ? null : { callId, name }
}

/** 官方 processActivity（10527-10561）：按去重调用数排序的活动类别（含子调用递归）。 */
function processActivity(nodes: ReadonlyArray<ChatNodeFace>): Array<{ kind: ProcessActivity; count: number }> {
  const counts = new Map<ProcessActivity, number>()
  const seen = new Set<string>()
  const visit = (tool: ToolRootFace): void => {
    const face = toolCallFace(tool)
    if (face !== null && !seen.has(face.callId)) {
      seen.add(face.callId)
      const kind = toolActivity(face.name)
      counts.set(kind, (counts.get(kind) ?? 0) + 1)
    }
    for (const child of tool.subCalls ?? []) visit(child)
  }
  for (const node of nodes) {
    if (node.kind !== 'tool-call') continue
    const root = node.data?.root as ToolRootFace | undefined
    if (root !== undefined && root !== null) visit(root)
  }
  return [...counts]
    .map(([kind, count]) => ({ kind, count }))
    .sort((left, right) => right.count - left.count)
}

/**
 * 官方 TurnGroups.rebuild 的移植：把 keyed 流切成「独立条目 + 过程分组」。
 * @param order - 官方渲染顺序（node key 列表）。
 * @param readNode - keyed 节点读取。
 * @param isTurnClosed - turn 是否已闭合（官方 turns.get(turn).status === 'closed'）。
 */
export function buildProcessGroups(
  order: readonly string[],
  readNode: (key: string) => ChatNodeFace | undefined,
  isTurnClosed: (turn: number) => boolean,
): GroupedView {
  const entries: ChatEntry[] = []
  const groups = new Map<string, ProcessGroupSnapshot>()
  let pending: Array<{ key: string; groupPart?: 'response' | 'reasoning' }> = []
  let currentTurn: number | undefined
  const flush = (closed: boolean): void => {
    const first = pending[0]
    if (first === undefined) return
    const turn = currentTurn
    const ended = closed || (turn !== undefined && isTurnClosed(turn))
    const members = pending
    const nodes = members
      .map(member => readNode(member.key))
      .filter((node): node is ChatNodeFace => node !== undefined)
    // 官方组键 = ["process", 首成员 key, groupPart]（process-groups.js:10692-10696）。
    const groupKey = JSON.stringify(['process', first.key, first.groupPart ?? null])
    groups.set(groupKey, {
      key: groupKey,
      members,
      data: { turn: turn ?? -1, closed: ended, summary: { counts: processActivity(nodes) } },
    })
    entries.push({ kind: 'group', key: groupKey })
    pending = []
  }
  for (const key of order) {
    const node = readNode(key)
    if (node === undefined) continue
    const turn = turnOfNode(node)
    if (turn !== currentTurn) {
      flush(true)
      currentTurn = turn
    }
    if (INDEPENDENT.has(node.kind)) {
      flush(true)
      entries.push({ kind: 'node', key })
    } else if (node.kind === 'turn-process') {
      entries.push({ kind: 'node', key })
    } else if (node.kind === 'assistant-step') {
      if (hasReasoning(node)) pending.push({ key, groupPart: 'reasoning' })
      if (hasReply(node)) {
        flush(true)
        entries.push({ kind: 'node', key, groupPart: 'response' })
      }
    } else {
      pending.push({ key })
    }
  }
  // 归档只读视图：末组按 turn 状态闭合（live turn 的组官方也不封口）。
  flush(currentTurn === undefined ? true : isTurnClosed(currentTurn))
  return { entries, groups }
}

/** 官方 message.stepProcess.done.* 的键面（zh/en 文案见 locales.ts）。 */
const STEP_DONE_KEYS: Readonly<Record<ProcessActivity | 'thinking', LocaleKey>> = {
  thinking: 'stepProcessDoneThinking',
  read: 'stepProcessDoneRead',
  readImage: 'stepProcessDoneReadImage',
  write: 'stepProcessDoneWrite',
  search: 'stepProcessDoneSearch',
  edit: 'stepProcessDoneEdit',
  commands: 'stepProcessDoneCommands',
  code: 'stepProcessDoneCode',
  webSearch: 'stepProcessDoneWebSearch',
  webFetch: 'stepProcessDoneWebFetch',
  subagents: 'stepProcessDoneSubagents',
  plan: 'stepProcessDonePlan',
  questions: 'stepProcessDoneQuestions',
  tools: 'stepProcessDoneTools',
}

/**
 * 官方 processTitle（1820-1836）：closed 组标题 = 前 3 类活动拼接
 * （2 类用「A并B」且去「已」前缀；≥3 类用「，」连接、超 3 类补「等」）。
 */
export function processTitle(
  summary: { counts: ReadonlyArray<{ kind: ProcessActivity }> },
  t: Translate,
): string {
  const labels = summary.counts.slice(0, 3).map(({ kind }) => t(STEP_DONE_KEYS[kind]))
  const first = labels[0]
  if (first === undefined) return t('stepProcessDoneThinking')
  const continuation = (label: string): string => label.charAt(0).toLowerCase() + label.slice(1)
  const second = labels[1]
  if (second === undefined) return first
  if (labels.length === 2) {
    const prefix = t('stepProcessSharedPrefix')
    return t('stepProcessJoinTwo', {
      first,
      second: continuation(
        prefix !== '' && first.startsWith(prefix) && second.startsWith(prefix) ? second.slice(prefix.length) : second,
      ),
    })
  }
  const title = [first, ...labels.slice(1).map(continuation)].join(t('stepProcessComma'))
  return summary.counts.length > 3 ? t('stepProcessMore', { title }) : title
}
