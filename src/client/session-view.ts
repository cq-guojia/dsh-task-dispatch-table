// 面板内只读会话弹窗（决策 28）：官方解析 + 自绘简化渲染。
//
// 数据链（全部经源码核实，0.1.5-rc.2 产物 + 0.1.6 dsh-source 对照）：
// 1. `sessions.binding(id)`（api-session-controller/client，lib/client.js:3299）：
//    resolve(id)?.binding —— eligible 只看 host list 是否包含该 id；client 侧 list
//    不过滤归档（client.js 全文无 archive 字样），host `session/list` 也不过滤
//    （决策 28 已核实）⇒ 归档会话照样可 binding。**注意 ≠ sessions.open(id)**：
//    那个是把会话选成「当前」并切主视图（决策 27 已证伪，归档会话无处显示）。
// 2. `binding.session.open()`（Session 实例方法，幂等拉历史尾页；实现内部方法、
//    不在 SessionFace 类型上 ⇒ 运行时探测调用，缺失只影响加载、不致崩）。
//    binding() 只物化句柄、不拉数据 —— manager.get() 物化时 eventSource 为空。
// 3. `uiConversation.binding(binding)`（client-ui-conversation 的 assembly.ts:221）：
//    BoundConversation 订阅 eventSource —— open() 后的 pageHistory replace 会推送。
// 4. `.target('chat')`（ui-chat 的 apply.ts:63 同款）：订阅即激活 target，快照 =
//    ChatSnapshot。渲染走 `legacy.nodes`（ChatSnapshot.ts:98，官方维护的兼容投影、
//    按 anchorSeq 有序的 finalized ConversationNode 流，StatsPills 同款消费），
//    不碰 keyed 的 ChatNodeStore —— 那层的 data 形状随注册模块漂移。
//
// 类型全部本地结构化声明（本仓库 client 惯例）：官方包不在我们的产物依赖里，
// ChatSnapshot 所在的 ui-chat 包 npm 版本线（0.1.2-alpha.2）与运行时（0.1.5-rc.2）
// 不同步，跨版本引类型比本地复述更危险。官方升级时只需对齐本文件的类型复述。

import { createElement as h, useMemo, useSyncExternalStore } from 'react'
import type { LocaleKey } from './locales'

type Translate = (key: LocaleKey) => string

// ─────────────────────────── 本地结构化类型 ───────────────────────────

/** 最小可观察快照（官方 ObservableSnapshot 的同构面，dsh-client-store contract.d.ts:3）。 */
interface SnapshotFace<T> {
  getSnapshot(): T
  subscribe(fn: () => void): () => void
}

/** 会话生命周期快照（官方 SessionSnapshot 的消费面子集，contract/snapshot.d.ts:71-86）。 */
interface SessionSnapshotFace {
  openState?: 'cold' | 'loading' | 'open' | 'error'
  hasMore?: boolean
  loadingOlder?: boolean
}

/**
 * 会话绑定（官方 SessionBinding 的消费面子集，sessions/service.ts:103-110）。
 * open/loadOlder 是实现内部方法或公开动词：open 负责拉尾页（幂等），loadOlder
 * 向前翻页（公开，但要求已 open）。均运行时探测调用。
 */
interface SessionBindingFace {
  readonly sessionId: string
  readonly session: SnapshotFace<SessionSnapshotFace> & {
    open?(): Promise<void>
    loadOlder?(): Promise<void>
  }
}

/** sessions 服务（官方 ISessions 的消费面子集，contract/sessions.d.ts:19-123）。 */
export interface SessionsFace {
  binding(id: string): SessionBindingFace | undefined
}

/** chat target 快照（官方 ChatSnapshot 的消费面子集，ui-chat contract/snapshot.ts:92-99）。 */
interface ChatViewFace {
  readonly legacy?: {
    readonly nodes?: readonly ConversationNodeLike[]
  }
}

/** uiConversation 服务（官方 UiConversation.binding 的消费面，assembly.ts:49 + BoundConversation.target）。 */
export interface UiConversationFace {
  binding(source: SessionBindingFace): {
    target(target: 'chat'): SnapshotFace<ChatViewFace | undefined>
  }
}

// ── ConversationNode 联合（官方 records.d.ts:249 的渲染字段复述）──

/** 内容块（官方 ContentBlock 是 merge-extensible map，这里只复述 text 消费面）。 */
interface ContentBlockLike {
  type: string
  text?: string
}

/** assistant 内容块（官方 AssistantBlock，records.d.ts:26-43）。 */
type AssistantBlockLike =
  | { kind: 'text'; text: string }
  | { kind: 'reasoning'; text: string }
  | { kind: 'image'; attachment: unknown }
  | { kind: 'tool-call'; callId: string; name: string; argsRaw: string }
  | { kind: 'other'; block: unknown }

/** 渲染需要的节点公共字段。 */
interface NodeBaseLike {
  kind: string
  seq: number
  time: number
}

/** 官方 ConversationNode 联合的渲染字段复述；kind 收窄靠 switch + fallback。 */
type ConversationNodeLike = NodeBaseLike & {
  // user / steering / context（records.d.ts:45-110）
  content?: readonly ContentBlockLike[]
  // assistant（records.d.ts:63-84）
  blocks?: readonly AssistantBlockLike[]
  // tool-result（records.d.ts:151-175）
  call?: { name: string; argsRaw: string } | null
  isError?: boolean
  error?: { name: string; code: string }
  // command（records.d.ts:225-247）
  name?: string | null
  args?: string | null
  outcome?: { kind: 'success' | 'error'; text?: string } | null
  // turn-error（records.d.ts:127-139）
  message?: string
  code?: string
  turn?: number
  // model-retry（records.d.ts:112-122）
  retryState?: 'scheduled' | 'started' | 'cancelled'
  // compaction（records.d.ts:183-198）
  summary?: string | null
  // unknown（records.d.ts:208-215）
  type?: string
  data?: unknown
}

// ─────────────────────────── 数据闸门 ───────────────────────────

/** 弹窗数据源：已解析的 target 与向前翻页句柄；解析失败给 reason。 */
export interface SessionViewTarget {
  readonly target: SnapshotFace<ChatViewFace | undefined>
  /** 向前翻一页更早的历史（官方 loadOlder；未 open / 翻尽时官方自行空转）。 */
  loadOlder(): void
  readonly session: SnapshotFace<SessionSnapshotFace>
}

/** 打开只读视图：物化 binding → 探测拉尾页 → 建 chat target。会话不可解析时返回 null。 */
export function openSessionView(
  sessions: SessionsFace,
  uiConversation: UiConversationFace,
  id: string,
): SessionViewTarget | null {
  let binding: SessionBindingFace
  try {
    const found: SessionBindingFace | undefined = sessions.binding(id)
    if (found === undefined || found === null) return null
    binding = found
  } catch {
    return null
  }
  const session = binding.session
  // 数据闸门：官方 Session.open() 幂等拉历史尾页（session.ts:378-388）。类型未公开 ⇒
  // 探测调用；失败软着陆（界面显示空态与重试提示，不崩面板）。
  try {
    const opened = (session as { open?: () => Promise<void> }).open?.()
    if (opened !== undefined && typeof opened.catch === 'function') opened.catch(() => {})
  } catch { /* 加载失败不阻断渲染 */ }
  let conversation: ReturnType<UiConversationFace['binding']>
  try {
    conversation = uiConversation.binding(binding)
  } catch {
    return null
  }
  const target = conversation.target('chat')
  return {
    target,
    session,
    loadOlder(): void {
      try {
        const page = (session as { loadOlder?: () => Promise<void> }).loadOlder?.()
        if (page !== undefined && typeof page.catch === 'function') page.catch(() => {})
      } catch { /* 同上 */ }
    },
  }
}

// ─────────────────────────── 渲染 ───────────────────────────

const C = {
  text: 'var(--dsw-alias-label-primary, #1f2328)',
  textDim: 'var(--dsw-alias-label-secondary, rgba(128,128,128,0.95))',
  textFaint: 'var(--dsw-alias-label-tertiary, rgba(128,128,128,0.8))',
  layer1: 'var(--dsw-alias-bg-layer-1, rgba(128,128,128,0.10))',
  layer2: 'var(--dsw-alias-bg-layer-2, rgba(128,128,128,0.14))',
  border: 'var(--dsw-alias-border-l2, rgba(128,128,128,0.35))',
  brand: 'var(--dsw-alias-brand-primary, #2f6feb)',
  danger: 'var(--dsw-alias-state-error-primary, #c0392b)',
  hover: 'var(--dsw-alias-interactive-bg-hover, rgba(128,128,128,0.16))',
  shadow: 'var(--dsw-shadow-lv3, 0 12px 40px rgba(0,0,0,0.32))',
}
const monoFont = 'var(--ds-font-family-code, ui-monospace, SFMono-Regular, Menlo, Consolas, monospace)'

const sessionOverlayStyle: Record<string, string | number> = {
  position: 'fixed', inset: 0, zIndex: 1010, background: C.layer2,
  display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '24px',
}
const sessionPanelStyle: Record<string, string | number> = {
  background: C.layer1, color: C.text, borderRadius: '14px', width: '100%', maxWidth: '860px',
  maxHeight: '86vh', display: 'flex', flexDirection: 'column', boxSizing: 'border-box',
  border: `1px solid ${C.border}`, boxShadow: C.shadow,
}
const sessionHeaderStyle: Record<string, string | number> = {
  display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '12px',
  padding: '14px 18px 10px', borderBottom: `1px solid ${C.border}`, flexWrap: 'wrap',
}
const sessionTitleStyle: Record<string, string | number> = { fontSize: '15px', fontWeight: 600, color: C.text }
const sessionBodyStyle: Record<string, string | number> = {
  overflow: 'auto', padding: '12px 18px 18px', display: 'flex', flexDirection: 'column', gap: '10px',
}
const sessionIdStyle: Record<string, string | number> = {
  fontFamily: monoFont, fontSize: '11px', color: C.textFaint, wordBreak: 'break-all',
}
const bubbleStyle: Record<string, string | number> = {
  alignSelf: 'flex-start', maxWidth: '92%', background: C.layer2, borderRadius: '10px',
  padding: '8px 12px', whiteSpace: 'pre-wrap', wordBreak: 'break-word', fontSize: '13px', lineHeight: 1.55,
}
const assistantStyle: Record<string, string | number> = {
  alignSelf: 'flex-end', maxWidth: '92%', background: C.layer1, border: `1px solid ${C.border}`,
  borderRadius: '10px', padding: '8px 12px', whiteSpace: 'pre-wrap', wordBreak: 'break-word',
  fontSize: '13px', lineHeight: 1.55,
}
const toolCardStyle: Record<string, string | number> = {
  alignSelf: 'stretch', border: `1px solid ${C.border}`, borderRadius: '8px', padding: '6px 10px',
  fontSize: '12px', background: C.layer1,
}
const toolTitleStyle: Record<string, string | number> = {
  fontFamily: monoFont, fontSize: '12px', fontWeight: 600, color: C.brand,
}
const toolErrorStyle: Record<string, string | number> = { color: C.danger, fontWeight: 600 }
const noticeRowStyle: Record<string, string | number> = {
  alignSelf: 'center', fontSize: '12px', color: C.textFaint, padding: '2px 8px',
}
const noticeErrorStyle: Record<string, string | number> = {
  alignSelf: 'center', fontSize: '12px', color: C.danger, padding: '2px 8px', textAlign: 'center',
}
const hintRowStyle: Record<string, string | number> = { fontSize: '12px', color: C.textDim, textAlign: 'center', padding: '8px 0' }
const preArgsStyle: Record<string, string | number> = {
  fontFamily: monoFont, fontSize: '11px', lineHeight: 1.5, margin: '6px 0 0', whiteSpace: 'pre-wrap',
  wordBreak: 'break-all', maxHeight: '12em', overflow: 'auto', background: C.layer2,
  padding: '6px', borderRadius: '6px', color: C.text,
}
const buttonStyle: Record<string, string | number> = {
  appearance: 'none', font: 'inherit', fontSize: '12px', cursor: 'pointer', color: C.text,
  background: C.layer2, border: `1px solid ${C.border}`, borderRadius: '8px', padding: '4px 12px',
}
const linkStyle: Record<string, string | number> = {
  color: C.brand, cursor: 'pointer', background: 'none', border: 'none', padding: 0,
  font: 'inherit', fontSize: '12px',
}

/** 内联关闭图标（currentColor 跟随主题，与主面板同款画法）。 */
function CloseIcon(): ReturnType<typeof h> {
  return h('svg', {
    width: 15, height: 15, viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor',
    strokeWidth: 2, strokeLinecap: 'round',
  },
    h('path', { d: 'M6 6l12 12M18 6L6 18' }),
  )
}

/** 提取内容块的可读文本：text 拼接、图片占位（官方 ContentBlock 是 merge-extensible map）。 */
function contentText(blocks: readonly ContentBlockLike[] | undefined): string {
  if (blocks === undefined) return ''
  const parts = blocks.map((block) => {
    if (block !== null && typeof block === 'object' && block.type === 'text' && typeof block.text === 'string') return block.text
    if (block !== null && typeof block === 'object' && block.type === 'image') return '[图片]'
    return ''
  }).filter(part => part !== '')
  return parts.join('\n')
}

/** assistant 块的可读文本：只保留 text / image 占位（reasoning / tool-call / other 不渲染）。 */
function assistantText(blocks: readonly AssistantBlockLike[] | undefined): string {
  if (blocks === undefined) return ''
  const parts = blocks.map((block) => {
    if (block.kind === 'text') return block.text
    if (block.kind === 'image') return '[图片]'
    return ''
  }).filter(part => part !== '')
  return parts.join('\n')
}

/** 单个节点的自绘渲染；返回 null = 按决策 28 过滤的噪音 kind。 */
function renderNode(node: ConversationNodeLike, t: Translate): ReturnType<typeof h> | null {
  switch (node.kind) {
    case 'user':
    case 'steering': {
      const text = contentText(node.content)
      return text === '' ? null : h('div', { key: node.seq, style: bubbleStyle }, text)
    }
    case 'assistant': {
      const text = assistantText(node.blocks)
      return text === '' ? null : h('div', { key: node.seq, style: assistantStyle }, text)
    }
    case 'tool-result': {
      const name = node.call?.name ?? 'tool'
      const argsRaw = node.call?.argsRaw ?? ''
      const output = contentText(node.content)
      return h('div', { key: node.seq, style: toolCardStyle },
        h('div', { style: { display: 'flex', gap: '8px', alignItems: 'baseline', flexWrap: 'wrap' } },
          h('span', { style: toolTitleStyle }, `⚙ ${name}`),
          node.isError === true ? h('span', { style: toolErrorStyle }, `✕ ${node.error?.name ?? 'error'}`) : null,
        ),
        argsRaw.trim() !== ''
          ? h('details', null,
              h('summary', { style: { cursor: 'pointer', fontSize: '11px', color: C.textFaint, margin: '2px 0 0' } }, t('sessionArgs')),
              h('pre', { style: preArgsStyle }, argsRaw),
            )
          : null,
        output.trim() !== ''
          ? h('details', { open: node.isError === true },
              h('summary', { style: { cursor: 'pointer', fontSize: '11px', color: C.textFaint, margin: '2px 0 0' } }, t('sessionOutput')),
              h('pre', { style: preArgsStyle }, output),
            )
          : null,
      )
    }
    case 'command': {
      const line = `/${node.name ?? '?'}${node.args === null || node.args === undefined ? '' : ` ${node.args}`}`
      return h('div', { key: node.seq, style: toolCardStyle },
        h('span', { style: { fontFamily: monoFont, fontSize: '12px' } }, line),
        node.outcome !== null && node.outcome !== undefined
          ? h('span', {
              style: {
                fontFamily: monoFont, fontSize: '11px', margin: '4px 0 0', display: 'block',
                color: node.outcome.kind === 'error' ? C.danger : C.textDim,
              },
            }, node.outcome.text ?? node.outcome.kind)
          : null,
      )
    }
    case 'turn-error':
      return h('div', { key: node.seq, style: noticeErrorStyle },
        `${t('sessionTurnError')}${node.message === undefined || node.message === '' ? '' : `：${node.message}`}`,
      )
    case 'turn-max-tokens':
      return h('div', { key: node.seq, style: noticeRowStyle }, t('sessionMaxTokens'))
    case 'model-retry':
      return h('div', { key: node.seq, style: noticeRowStyle }, `${t('sessionRetry')}（${node.retryState ?? 'scheduled'}）`)
    // 决策 28：默认过滤的噪音 kind —— context（系统注入）、compaction（压缩标记）、
    // unknown（未知事件面）。assistant 里的 reasoning（「技术规划」）在 assistantText 已滤。
    case 'context':
    case 'compaction':
    case 'unknown':
      return null
    default:
      // 决策 28：不认识的 kind 一律 fallback（折叠原文），升级不白屏。
      return h('details', { key: node.seq, style: toolCardStyle },
        h('summary', { style: { cursor: 'pointer', fontSize: '11px', color: C.textFaint } }, `${t('sessionUnknownKind')} ${node.kind}`),
        h('pre', { style: preArgsStyle }, JSON.stringify(node, null, 2)),
      )
  }
}

/**
 * 面板内只读会话弹窗（决策 28）：官方解析 + 自绘简化渲染，只读、不可续聊。
 * @param props - viewSessionId 指向的执行会话；数据经 openSessionView 建好传入。
 */
export function SessionViewModal(props: {
  t: Translate
  /** 弹窗标题（执行记录里该行的任务名 · 刻度）。 */
  heading: string
  sessionId: string
  view: SessionViewTarget
  onClose: () => void
}): ReturnType<typeof h> {
  const { t, heading, sessionId, view, onClose } = props
  const subscribe = useMemo(() => (onChange: () => void): (() => void) => {
    const unsub = view.target.subscribe(onChange)
    return unsub
  }, [view])
  const getSnapshot = useMemo(() => (): ChatViewFace | undefined => view.target.getSnapshot(), [view])
  const chat = useSyncExternalStore(subscribe, getSnapshot)

  // 会话生命周期（加载态 / 向前翻页按钮），同样只读订阅。
  const sessionSub = useMemo(() => (onChange: () => void): (() => void) => view.session.subscribe(onChange), [view])
  const sessionGet = useMemo(() => (): SessionSnapshotFace => view.session.getSnapshot(), [view])
  const sessionSnap = useSyncExternalStore(sessionSub, sessionGet)

  const nodes = chat?.legacy?.nodes ?? []
  const rendered = nodes
    .map(node => renderNode(node, t))
    .filter((item): item is NonNullable<ReturnType<typeof h>> => item !== null)

  const openState = sessionSnap?.openState
  const body = rendered.length === 0
    ? h('div', { style: hintRowStyle },
        openState === 'error' ? t('sessionLoadFailed')
          : openState === 'loading' || openState === 'cold' ? t('sessionLoading')
          : t('sessionEmpty'),
      )
    : rendered

  // 关闭途径：右上角关闭按钮 / 点遮罩（主面板同款，不监听 document —— tsconfig.client 无 DOM lib）。

  const showLoadOlder = sessionSnap?.hasMore !== false

  return h('div', { style: sessionOverlayStyle, onClick: onClose },
    h('div', { style: sessionPanelStyle, onClick: (event: { stopPropagation(): void }) => { event.stopPropagation() } },
      h('div', { style: sessionHeaderStyle },
        h('div', null,
          h('div', { style: sessionTitleStyle }, `${t('sessionViewerTitle')} · ${heading}`),
          h('div', { style: sessionIdStyle }, sessionId),
        ),
        h('div', { style: { display: 'flex', alignItems: 'center', gap: '8px' } },
          showLoadOlder
            ? h('button', { type: 'button', style: buttonStyle, onClick: () => view.loadOlder() }, t('sessionLoadOlder'))
            : null,
          h('button', { type: 'button', style: { ...buttonStyle, padding: '4px 6px' }, 'aria-label': t('debugClose'), onClick: onClose }, h(CloseIcon, {})),
        ),
      ),
      h('div', { style: sessionBodyStyle }, body),
    ),
  )
}

/** 供执行记录页复用的链接文案样式（与主面板 linkStyle 同形，避免跨文件样式耦合）。 */
export const sessionLinkStyle = linkStyle
