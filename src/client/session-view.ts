// 面板内只读会话弹窗（决策 28 数据链 + 决策 34 渲染）。
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
// 5. 归档/非活跃会话（host 将其标为 inactive）：uiConversation.binding 直接抛
//    `inactive session`，sessions.binding(id) 也返回空，故步骤 1-4 全程走不通。
//    改走冷读入口 session/follow / session/page（决策 28 核实：按 durable address
//    {kind:'session',sessionId} 读、不激活 Agent、归档会话日志仍可读）。projectionStores
//    是惰性投影（归档会话未观察不填充、rows 为空对象），非冷读源。冷读在 openSessionView
//    内异步回填给 renderNode —— 无需激活会话、不依赖 uiConversation 装配。
//
// 渲染（决策 34）：不挂官方 ChatView（其只渲染「当前会话」，喂不进归档 id），改为
// **自渲染 DOM + 套官方 design token**。样式规则见 ./archive-session-css（运行时注入），
// 颜色走全局 `--dsw-alias-*`、布局走 `--dsh-chat-*`，明/暗自动跟随；正文走 markdown。
//
// 类型全部本地结构化声明（本仓库 client 惯例）：官方包不在我们的产物依赖里，
// ChatSnapshot 所在的 ui-chat 包 npm 版本线（0.1.2-alpha.2）与运行时（0.1.5-rc.2）
// 不同步，跨版本引类型比本地复述更危险。官方升级时只需对齐本文件的类型复述。

import { createElement as h, useMemo, useSyncExternalStore } from 'react'
import { ensureArchiveSessionStyle } from './archive-session-css'
import { renderMarkdown } from './markdown'
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
  const log = (level: 'warn' | 'info', msg: string, extra?: unknown): void => {
    if (level === 'warn') console.warn(`[task-dispatch:session-view] ${msg}`, extra ?? '')
    else console.info(`[task-dispatch:session-view] ${msg}`)
  }
  let binding: SessionBindingFace
  try {
    const found: SessionBindingFace | undefined = sessions.binding(id)
    if (found === undefined || found === null) {
      // 归档/非活跃会话：uiConversation.binding 拒绝 inactive 会话（抛 "inactive session"），
      // sessions.binding(id) 也返回空。按 dsh-capabilities 决策 28：冷读入口是 session/follow /
      // session/page（按 durable address {kind:'session',sessionId} 读，不激活 Agent，归档可读）。
      // projectionStores[id].rows 是惰性投影（归档会话未观察不填充，为空对象），非冷读源。
      // 本实现并发试三路（sess.remote.follow / mgr.remote.follow / 通用 RPC call('session/follow')），
      // 命中即异步回填弹窗；全失败则打全方法名与返回形状，便于定位。
      const keysOf = (o: unknown): string[] => (o == null || typeof o !== 'object') ? [] : Object.keys(o as object)
      const protoFnKeys = (o: unknown): string[] => {
        const out = new Set<string>()
        let cur: unknown = o
        while (cur && (typeof cur === 'object' || typeof cur === 'function')) {
          try {
            for (const k of Object.getOwnPropertyNames(cur as object)) {
              const v = (cur as Record<string, unknown>)[k]
              if (typeof v === 'function' && k !== 'constructor') out.add(k)
            }
          } catch { /* 跨 realm 保护 */ }
          cur = Object.getPrototypeOf(cur)
        }
        return [...out]
      }
      const shape0 = (o: unknown): string => {
        if (o == null) return 'null'
        if (typeof o !== 'object') return typeof o
        if (Array.isArray(o)) return `array(${o.length})`
        return '{' + keysOf(o).slice(0, 12).join(',') + '}'
      }
      const deepShape = (o: unknown, depth = 0): string => {
        if (o == null || typeof o !== 'object') return o === null ? 'null' : typeof o
        if (depth > 3) return shape0(o)
        if (Array.isArray(o)) {
          const head = o.slice(0, 2).map(x => deepShape(x, depth + 1))
          return `array(${o.length})${head.length ? '<' + head.join('|') + '>' : ''}`
        }
        const entries = keysOf(o).slice(0, 16).map(k => `${k}:${deepShape((o as Record<string, unknown>)[k], depth + 1)}`)
        return '{' + entries.join(',') + '}'
      }
      const S = sessions as unknown as Record<string, unknown>
      const mgr = S.manager as Record<string, unknown> | undefined
      // 逐会话 remote（文档冷读入口所在处）。
      const sess = (mgr && typeof mgr.get === 'function')
        ? (() => { try { return (mgr.get as (x: string) => unknown).call(mgr, id) } catch { return undefined } })()
        : undefined
      const sessRemote = (sess as Record<string, unknown> | undefined)?.remote
      const mgrRemote = mgr?.remote
      const addr = { kind: 'session', sessionId: id }
      log('warn', `inactive 会话冷读探测：${id}；sess.remote 原型方法=[${protoFnKeys(sessRemote).join(',')}]；mgr.remote 原型方法=[${protoFnKeys(mgrRemote).join(',')}]`)
      // 行 → ConversationNodeLike：兼容行本身即节点，或被 record/node/value/data 包裹。
      const toNode = (raw: unknown, fallbackSeq: number): ConversationNodeLike | null => {
        if (!raw || typeof raw !== 'object') return null
        const pick = (cand: unknown): ConversationNodeLike | null => {
          if (!cand || typeof cand !== 'object') return null
          const c = cand as Record<string, unknown>
          if (typeof c.kind !== 'string') return null
          const seqNum = typeof c.seq === 'number' ? c.seq : typeof c.seq === 'string' ? Number(c.seq) : fallbackSeq
          const node: ConversationNodeLike = {
            kind: c.kind,
            seq: Number.isFinite(seqNum) ? seqNum : fallbackSeq,
            time: typeof c.time === 'number' ? c.time : 0,
            content: c.content as ConversationNodeLike['content'],
            blocks: c.blocks as ConversationNodeLike['blocks'],
            call: c.call as ConversationNodeLike['call'],
            isError: c.isError as boolean | undefined,
            error: c.error as ConversationNodeLike['error'],
            name: c.name as string | null | undefined,
            args: c.args as string | null | undefined,
            outcome: c.outcome as ConversationNodeLike['outcome'],
            message: c.message as string | undefined,
            code: c.code as string | undefined,
            turn: c.turn as number | undefined,
            retryState: c.retryState as ConversationNodeLike['retryState'],
            summary: c.summary as string | null | undefined,
            type: c.type as string | undefined,
            data: c.data,
          }
          return node
        }
        const r = raw as Record<string, unknown>
        return pick(r) ?? pick(r.record) ?? pick(r.node) ?? pick(r.value) ?? pick(r.data) ?? null
      }
      const extractNodes = (res: unknown): ConversationNodeLike[] => {
        if (!res || typeof res !== 'object') return []
        const r = res as Record<string, unknown>
        const arrOf = (c: unknown): unknown[] | null => {
          if (Array.isArray(c)) return c
          if (c && typeof c === 'object' && Array.isArray((c as Record<string, unknown>).value)) return (c as Record<string, unknown>).value as unknown[]
          return null
        }
        const buckets: unknown[][] = []
        for (const k of ['records', 'nodes', 'messages', 'data', 'values']) {
          const a = arrOf(r[k]); if (a) buckets.push(a)
        }
        if (r.legacy && typeof r.legacy === 'object') { const a = arrOf((r.legacy as Record<string, unknown>).nodes); if (a) buckets.push(a) }
        if (r.projection && typeof r.projection === 'object') { const a = arrOf((r.projection as Record<string, unknown>).nodes); if (a) buckets.push(a) }
        for (const bucket of buckets) {
          const mapped = bucket.map((raw, i) => toNode(raw, i)).filter((n): n is ConversationNodeLike => n !== null)
          if (mapped.length > 0) return mapped
        }
        return []
      }
      // 异步回填的 target：立即弹窗（loading 态），RPC 落定后通知 React 重渲染。
      // ⚠ 快照必须缓存：useSyncExternalStore 要求 getSnapshot 在值未变时返回同一引用；
      // 若每次返回新对象 ⇒ 无限更新（React #185「Maximum update depth exceeded」）⇒ 面板崩溃黑屏。
      const makeAsyncTarget = (promise: Promise<unknown> | null): SessionViewTarget => {
        let nodes: ConversationNodeLike[] = []
        let openState: SessionSnapshotFace['openState'] = 'loading'
        let chatSnap: ChatViewFace = { legacy: { nodes: [] } }
        let sessionSnap: SessionSnapshotFace = { openState: 'loading', hasMore: false }
        const listeners = new Set<() => void>()
        const commit = (): void => {
          chatSnap = { legacy: { nodes } }
          sessionSnap = { openState, hasMore: false }
          listeners.forEach(l => l())
        }
        if (promise) {
          promise.then((res) => {
            nodes = extractNodes(res)
            openState = nodes.length > 0 ? 'open' : 'error'
            log('info', `冷读回填完成（${id}）：nodes=${nodes.length}；kinds=[${nodes.slice(0, 24).map(n => n.kind).join(',')}]；首节点=${nodes.length ? deepShape(nodes[0], 0) : '（无）'}`)
            commit()
          }).catch((err) => {
            openState = 'error'
            log('warn', `冷读 RPC 失败（${id}）`, err)
            commit()
          })
        } else {
          openState = 'error'
          commit()
        }
        const target: SnapshotFace<ChatViewFace | undefined> = {
          getSnapshot: () => chatSnap,
          subscribe: (fn) => { listeners.add(fn); return () => { listeners.delete(fn) } },
        }
        const session: SnapshotFace<SessionSnapshotFace> & { open?: () => Promise<void>; loadOlder?: () => Promise<void> } = {
          getSnapshot: () => sessionSnap,
          subscribe: (fn) => { listeners.add(fn); return () => { listeners.delete(fn) } },
        }
        return { target, session, loadOlder: () => {} }
      }
      // 收集所有可用冷读调用（直接方法 + 通用 RPC）。
      const calls: Array<{ label: string; promise: Promise<unknown> }> = []
      const pushDirect = (label: string, obj: unknown, methods: string[]): void => {
        if (!obj) return
        const o = obj as Record<string, unknown>
        for (const m of methods) {
          const fn = o[m]
          if (typeof fn === 'function') {
            try {
              const arg = m === 'page' ? { address: addr } : addr
              const r = (fn as (x: unknown) => unknown).call(o, arg)
              if (r && typeof r === 'object' && typeof (r as { then?: unknown }).then === 'function') {
                calls.push({ label: `${label}.${m}`, promise: r as Promise<unknown> })
              } else log('info', `${label}.${m} sync=${deepShape(r, 0)}`)
            } catch (e) { log('warn', `${label}.${m} threw:${(e as Error)?.message ?? e}`) }
          }
        }
      }
      pushDirect('sess.remote', sessRemote, ['follow', 'page', 'getHistory', 'history', 'read', 'fetch', 'load'])
      pushDirect('mgr.remote', mgrRemote, ['follow', 'page', 'getHistory', 'history', 'read', 'fetch', 'load'])
      // 这两个 remote 的原型方法只有 `$stream` + Object 内置 ⇒ `$stream` 是唯一的真实 RPC 通道，
      // 而 session/follow 语义即「订阅流」（opening snapshot + 后续事件），故走
      // $stream('session/follow', addr)。返回值可能是 Promise / 可订阅对象 / 异步可迭代：
      // 统一收敛成 Promise（取首个值），并加超时避免永久挂起。
      const toPromise = (r: unknown): Promise<unknown> => {
        if (r && typeof r === 'object' && typeof (r as { then?: unknown }).then === 'function') return r as Promise<unknown>
        if (r && typeof r === 'object' && typeof (r as { subscribe?: unknown }).subscribe === 'function') {
          return new Promise<unknown>((resolve) => {
            let done = false
            const sub = (r as { subscribe(fn: (v: unknown) => void): { unsubscribe?(): void } }).subscribe((v) => {
              if (done) return
              done = true
              resolve(v)
              try { sub?.unsubscribe?.() } catch { /* 订阅器可能不支持退订 */ }
            })
          })
        }
        if (r && typeof r === 'object' && typeof (r as Record<symbol, unknown>)[Symbol.asyncIterator] === 'function') {
          return (async (): Promise<unknown> => {
            for await (const v of r as AsyncIterable<unknown>) return v
            return undefined
          })()
        }
        return Promise.resolve(r)
      }
      const withTimeout = (p: Promise<unknown>, ms: number): Promise<unknown> => Promise.race([
        p,
        new Promise<unknown>((_, rej) => { setTimeout(() => { rej(new Error(`超时 ${ms}ms 无响应`)) }, ms) }),
      ])
      for (const [obj, label] of [[sessRemote, 'sess.remote'], [mgrRemote, 'mgr.remote']] as const) {
        if (!obj) continue
        const o = obj as Record<string, unknown>
        for (const rpc of ['$stream', 'stream', 'call', 'send', 'invoke']) {
          const fn = o[rpc]
          if (typeof fn === 'function') {
            for (const method of ['session/follow', 'session/page', 'follow', 'page']) {
              try {
                const arg = method.endsWith('page') ? { address: addr } : addr
                const r = (fn as (a: unknown, b: unknown) => unknown).call(o, method, arg)
                calls.push({ label: `${label}.${rpc}('${method}')`, promise: withTimeout(toPromise(r), 8000) })
              } catch (e) { log('warn', `${label}.${rpc}('${method}') threw:${(e as Error)?.message ?? e}`) }
            }
          }
        }
      }
      if (calls.length === 0) {
        log('warn', `inactive 会话 ${id}：未找到任何冷读 RPC（sess.remote/mgr.remote 均无 follow/page/call/send/invoke）。归档会话无法读取。`)
        return null
      }
      // 全部发起，取首个能解出节点的结果；无可解则把每源形状打出。
      const combined: Promise<unknown> = Promise.allSettled(calls.map(c => c.promise)).then((results) => {
        let hit = -1
        for (let i = 0; i < results.length; i++) {
          const res = results[i]
          if (res.status === 'fulfilled') {
            if (extractNodes(res.value).length > 0) { hit = i; break }
          } else log('warn', `冷读源 ${calls[i].label} reject:${(res.reason as Error)?.message ?? res.reason}`)
        }
        if (hit >= 0) { log('info', `冷读命中源=${calls[hit].label}（共试 ${calls.length} 路）`); return calls[hit].promise }
        calls.forEach((c, i) => {
          const res = results[i]
          if (res.status === 'fulfilled') log('info', `冷读源 ${c.label} resolve 深形状=${deepShape(res.value, 0)}`)
        })
        return null
      })
      return makeAsyncTarget(combined)
    }
    binding = found
  } catch (err) {
    log('warn', `openSessionView 返回 null：sessions.binding(${id}) 抛错`, err)
    return null
  }
  const session = binding.session
  // 数据闸门：官方 Session.open() 幂等拉历史尾页（session.ts:378-388）。类型未公开 ⇒
  // 探测调用；失败软着陆（界面显示空态与重试提示，不崩面板）。
  try {
    const opened = (session as { open?: () => Promise<void> }).open?.()
    if (opened !== undefined && typeof opened.catch === 'function') {
      opened.catch((err) => log('warn', `session.open(${id}) 失败（仅影响历史加载，不阻断弹窗）`, err))
    }
  } catch (err) { log('warn', `session.open(${id}) 抛错`, err) }
  let conversation: ReturnType<UiConversationFace['binding']>
  try {
    conversation = uiConversation.binding(binding)
  } catch (err) {
    log('warn', 'openSessionView 返回 null：uiConversation.binding 抛错（binding 已取得，断点在 uiConversation 装配）', err)
    return null
  }
  let target: SnapshotFace<ChatViewFace | undefined>
  try {
    target = conversation.target('chat')
  } catch (err) {
    log('warn', "openSessionView 返回 null：conversation.target('chat') 抛错", err)
    return null
  }
  log('info', `openSessionView 成功建立 target（${id}）；首屏 nodes 待订阅回填`)
  return {
    target,
    session,
    loadOlder(): void {
      try {
        const page = (session as { loadOlder?: () => Promise<void> }).loadOlder?.()
        if (page !== undefined && typeof page.catch === 'function') {
          page.catch((err) => log('warn', `session.loadOlder(${id}) 失败`, err))
        }
      } catch (err) { log('warn', `session.loadOlder(${id}) 抛错`, err) }
    },
  }
}

// ─────────────────────────── 渲染（决策 34：类名 + 官方 design token） ───────────────────────────

// 样式表注入（幂等；无 document 环境静默跳过）。规则定义见 ./archive-session-css。
ensureArchiveSessionStyle()

/** markdown 富文本块：marked 渲染 HTML，套 `.dsh-tdt-sv-md`（样式见 archive-session-css）。 */
function Md(props: { text: string }): ReturnType<typeof h> {
  const html = renderMarkdown(props.text)
  if (html === '') return h('span', null)
  return h('div', { className: 'dsh-tdt-sv-md', dangerouslySetInnerHTML: { __html: html } })
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

/** JSON 安全序列化（循环引用 / 特殊值不抛）。 */
function safeJson(value: unknown): string {
  try {
    return JSON.stringify(value, null, 2) ?? String(value)
  } catch {
    return String(value)
  }
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

/**
 * 工具卡（工具调用 / 工具结果共形）：名称 + 「参数」「输出」可展开。
 * 调用方负责在外层数组里给 key。
 */
function ToolCard(props: {
  name: string
  argsRaw: string
  output: string
  isError: boolean
  errorName?: string
  t: Translate
}): ReturnType<typeof h> {
  const { name, argsRaw, output, isError, errorName, t } = props
  return h('div', { className: 'dsh-tdt-sv-tool' },
    h('div', { className: 'dsh-tdt-sv-tool-head' },
      h('span', { className: 'dsh-tdt-sv-tool-name' }, `⚙ ${name}`),
      isError ? h('span', { className: 'dsh-tdt-sv-tool-err' }, `✕ ${errorName ?? 'error'}`) : null,
    ),
    argsRaw.trim() !== ''
      ? h('details', null,
          h('summary', null, t('sessionArgs')),
          h('pre', null, argsRaw),
        )
      : null,
    output.trim() !== ''
      ? h('details', { open: isError },
          h('summary', null, t('sessionOutput')),
          h('pre', null, output),
        )
      : null,
  )
}

/** assistant 内容块 → 子元素数组（text 走 markdown、reasoning 折叠、tool-call 工具卡）。 */
function assistantBlocks(blocks: readonly AssistantBlockLike[] | undefined, t: Translate): ReturnType<typeof h>[] {
  if (blocks === undefined) return []
  const parts: ReturnType<typeof h>[] = []
  blocks.forEach((block, index) => {
    switch (block.kind) {
      case 'text':
        if (block.text.trim() !== '') parts.push(h(Md, { key: `t${index}`, text: block.text }))
        break
      case 'reasoning':
        if (block.text.trim() !== '') {
          parts.push(h('details', { key: `r${index}`, className: 'dsh-tdt-sv-reasoning' },
            h('summary', null, t('sessionReasoning')),
            h('div', { className: 'dsh-tdt-sv-reasoning-body' }, block.text),
          ))
        }
        break
      case 'image':
        parts.push(h('div', { key: `i${index}`, className: 'dsh-tdt-sv-image' }, '[图片]'))
        break
      case 'tool-call':
        parts.push(h(ToolCard, {
          key: `c${index}`, name: block.name, argsRaw: block.argsRaw, output: '', isError: false, t,
        }))
        break
      default:
        // 未知 block：折叠原文，升级不白屏。
        parts.push(h('details', { key: `o${index}`, className: 'dsh-tdt-sv-tool' },
          h('summary', null, t('sessionUnknownKind')),
          h('pre', null, safeJson(block.block)),
        ))
    }
  })
  return parts
}

/** 单个节点的自绘渲染；返回 null = 按决策 28 过滤的噪音 kind。 */
function renderNode(node: ConversationNodeLike, t: Translate): ReturnType<typeof h> | null {
  switch (node.kind) {
    case 'user':
    case 'steering': {
      const text = contentText(node.content)
      return text === '' ? null : h('div', { key: node.seq, className: 'dsh-tdt-sv-user' }, h(Md, { text }))
    }
    case 'assistant': {
      const parts = assistantBlocks(node.blocks, t)
      return parts.length === 0 ? null : h('div', { key: node.seq, className: 'dsh-tdt-sv-assistant' }, parts)
    }
    case 'tool-result': {
      return h(ToolCard, {
        key: node.seq,
        name: node.call?.name ?? 'tool',
        argsRaw: node.call?.argsRaw ?? '',
        output: contentText(node.content),
        isError: node.isError === true,
        errorName: node.error?.name,
        t,
      })
    }
    case 'command': {
      const line = `/${node.name ?? '?'}${node.args === null || node.args === undefined ? '' : ` ${node.args}`}`
      return h('div', { key: node.seq, className: 'dsh-tdt-sv-tool' },
        h('div', { className: 'dsh-tdt-sv-tool-head' },
          h('span', { className: 'dsh-tdt-sv-tool-name' }, line),
        ),
        node.outcome !== null && node.outcome !== undefined
          ? h('span', {
              className: `dsh-tdt-sv-outcome ${node.outcome.kind === 'error' ? 'dsh-tdt-sv-outcome-err' : 'dsh-tdt-sv-outcome-ok'}`,
            }, node.outcome.text ?? node.outcome.kind)
          : null,
      )
    }
    case 'turn-error':
      return h('div', { key: node.seq, className: 'dsh-tdt-sv-notice-err' },
        `${t('sessionTurnError')}${node.message === undefined || node.message === '' ? '' : `：${node.message}`}`,
      )
    case 'turn-max-tokens':
      return h('div', { key: node.seq, className: 'dsh-tdt-sv-notice' }, t('sessionMaxTokens'))
    case 'model-retry':
      return h('div', { key: node.seq, className: 'dsh-tdt-sv-notice' }, `${t('sessionRetry')}（${node.retryState ?? 'scheduled'}）`)
    // 决策 28：默认过滤的噪音 kind —— context（系统注入）、compaction（压缩标记）、
    // unknown（未知事件面）。assistant 里的 reasoning 现在由 assistantBlocks 折叠渲染。
    case 'context':
    case 'compaction':
    case 'unknown':
      return null
    default:
      // 决策 28：不认识的 kind 一律 fallback（折叠原文），升级不白屏。
      return h('details', { key: node.seq, className: 'dsh-tdt-sv-tool' },
        h('summary', { className: 'dsh-tdt-sv-notice' }, `${t('sessionUnknownKind')} ${node.kind}`),
        h('pre', null, safeJson(node)),
      )
  }
}

/**
 * 面板内只读会话弹窗（决策 28 数据链 + 决策 34 渲染）：只读、不可续聊。
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
    ? h('div', { className: 'dsh-tdt-sv-hint' },
        openState === 'error' ? t('sessionLoadFailed')
          : openState === 'loading' || openState === 'cold' ? t('sessionLoading')
          : t('sessionEmpty'),
      )
    : rendered

  // 关闭途径：右上角关闭按钮 / 点遮罩（主面板同款，不监听 document）。
  const showLoadOlder = sessionSnap?.hasMore !== false

  return h('div', { className: 'dsh-tdt-sv-overlay', onClick: onClose },
    h('div', { className: 'dsh-tdt-sv-panel', onClick: (event: { stopPropagation(): void }) => { event.stopPropagation() } },
      h('div', { className: 'dsh-tdt-sv-header' },
        h('div', { className: 'dsh-tdt-sv-heading' },
          h('div', { className: 'dsh-tdt-sv-title' }, `${t('sessionViewerTitle')} · ${heading}`),
          h('div', { className: 'dsh-tdt-sv-sid' }, sessionId),
        ),
        h('div', { className: 'dsh-tdt-sv-actions' },
          showLoadOlder
            ? h('button', { type: 'button', className: 'dsh-tdt-sv-btn', onClick: () => view.loadOlder() }, t('sessionLoadOlder'))
            : null,
          h('button', {
            type: 'button',
            className: 'dsh-tdt-sv-btn dsh-tdt-sv-btn-icon',
            'aria-label': t('debugClose'),
            onClick: onClose,
          }, h(CloseIcon, {})),
        ),
      ),
      h('div', { className: 'dsh-tdt-sv-body' },
        h('div', { className: 'dsh-tdt-sv-col' }, body),
      ),
    ),
  )
}

/** 供执行记录页复用的链接文案样式（行内文字按钮，与主面板 linkStyle 同形）。 */
export const sessionLinkStyle: Record<string, string | number> = {
  color: 'var(--dsw-alias-brand-primary, #2f6feb)',
  cursor: 'pointer',
  background: 'none',
  border: 'none',
  padding: 0,
  font: 'inherit',
  fontSize: '12px',
}
