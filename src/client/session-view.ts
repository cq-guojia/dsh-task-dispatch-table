// 面板内只读会话弹窗（决策 28 数据链 + 决策 34 渲染 + 里程碑 15「照抄官方折叠关系」）。
//
// 数据链（全部经源码核实）：
// 1. `sessions.binding(id)`（api-session-controller/client）：**只查已物化的 scope、从不创建**
//    （0.1.7-rc.2 lib/client.js:3406）⇒ 归档/久未打开的会话返回 undefined。
//    正解 = 先 `sessions.retain(id, { source })` → retainScope → materializeScope（3410/3472），
//    并在内部触发 manager.get(id).open() 拉历史尾页；引用用完 release()。
// 2. `uiConversation.binding(binding)`：校验 `sessions.binding(sessionId) !== owner` 即抛
//    `inactive session`（ui-conversation lib/client.js:3083）——retain 之后即通过。
// 3. `.target('chat')`：快照 = ChatSnapshot，**同时**带两份数据：
//      · `order` + `nodes`（keyed ChatNodeStore）= 官方 ChatView 真正渲染的那条流，
//        turn-trigger / turn-process / assistant-step / tool-call / turn-tail 都在这里；
//      · `legacy.nodes` = 官方兼容投影（老 kind 名，缺 turn-trigger / turn-process）。
//    里程碑 15 起改用 keyed 流 ⇒ 折叠关系、触发行、尾部操作行与官方同构；
//    `legacy.nodes` 只作 order 为空时的兜底（归档会话理论上不会走到）。
//
// ⛔ 已证伪的两条路（勿再尝试，详见 docs/design/session-view-ui-map.md §十二）：
//    - 弹窗内渲染官方 ChatView：`ctx.slots.renderSlot` 只接受 key='root'（运行时强制）；
//    - `retain(source:'mainView')` 切官方视图：会锁死宿主会话导航（真机事故，已回退）。
//
// 渲染组织（里程碑 15）：**「官方零件 + 自绘容器」，组件按官方文件名一一对应放在 ./mirror/**
// （ChatView / ChatNodeSeat / MessageItem / GenericCommandCard / ReasoningRow / TurnProcessNodeView /
//  TurnTriggerNodeView / TurnTailNodeView / MessageIconActions / TurnUsagePanel / StatDialog /
//  message-chrome / Composer）——官方改哪个，diff 哪个文件。折叠判定照抄 ChatNodeSeat，
// 见 ./mirror/ChatNodeSeat.tsx 顶部注释与 docs/design/session-view-ui-map.md §十七。

import { Fragment, createElement as h, useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore } from 'react'
import { Button, IconBranchOutlineRegular, IconCloseOutlineRegular, Modal } from '@deepseek-ai/dsh-client-ui-primitives'
import { ensureArchiveSessionStyle } from './archive-session-css'
import { ChatHint, ChatNodeListMirror, ChatOlderButton, ChatViewFrame, type TurnsFace } from './mirror/ChatView'
import { GenericCommandCard } from './mirror/GenericCommandCard'
import { MessageIconActionsMirror } from './mirror/MessageIconActions'
import { AssistantMarkdown, UserMessage, ModelRetryItemMirror, TurnErrorItemMirror, TurnMaxTokensItemMirror, type RetryAttemptFace, type TurnErrorFace } from './mirror/MessageItem'
import { ReasoningRowMirror } from './mirror/ReasoningRow'
import { TurnProcessNodeViewMirror } from './mirror/TurnProcessNodeView'
import { TurnTailNodeViewMirror, type TurnTailDataFace } from './mirror/TurnTailNodeView'
import { TurnTriggerNodeViewMirror } from './mirror/TurnTriggerNodeView'
import { DeliverablesGridMirror, PresentRowMirror, type DeliveredFileFace } from './mirror/Deliverables'
import type { ChatNodeFace, ChatNodeStoreFace, NodeRenderer, TurnProcessHandle, TurnLocationFace } from './mirror/ChatNodeSeat'
import { buildProcessGroups } from './mirror/process-groups'
import { officialClass, officialModuleCount, ocOr } from './official-classes'
import type { WorkspaceFilesFace } from './file-preview'
import { interpolateTranslate, type Translate } from './locales'

export type { Translate } from './locales'

/** 稳定的空序列（避免默认值每次新建数组）。 */
const EMPTY_ORDER: readonly string[] = []

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
  /** 渲染顺序（官方 order：immutable 的 node key 列表）。 */
  readonly order?: readonly string[]
  /** keyed 节点仓库（官方 ChatNodeStore：get + processSource）。 */
  readonly nodes?: ChatNodeStoreFace
  /** 时间线（官方 ConversationTimelineSnapshot：turnOrder / turns 供尾部行与分组收折判定）。 */
  readonly timeline?: {
    readonly turnOrder?: readonly number[]
    readonly turns?: TurnsFace
  }
  /** 官方兼容投影（老 kind 名；仅在 order 缺失时兜底）。 */
  readonly legacy?: {
    readonly nodes?: readonly ConversationNodeLike[]
    readonly turnTimings?: ReadonlyMap<number, { startTime: number; endTime?: number }>
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
  /** 官方 ToolResultNode.meta（tool-fs diffs / read 窗口；归档快照透传）。 */
  meta?: unknown
  // command（records.d.ts:225-247）
  name?: string | null
  args?: string | null
  outcome?: { kind: 'success' | 'error'; text?: string } | null
  // turn-error（records.d.ts:127-139）
  message?: string
  code?: string
  turn?: number
  // model-retry（records.d.ts:112-122，= LlmRetryEventData & { retryState }）
  retryState?: 'scheduled' | 'started' | 'cancelled'
  mode?: string
  retry?: number
  maxRetries?: number
  delayMs?: number
  failure?: { message?: string; code?: string } | null
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
  /** 释放 sessions.retain 引用（弹窗关闭时必调；否则会话 scope 永不回收）。 */
  dispose(): void
}

/**
 * 冷读探测开关：已证伪——当前宿主 remote 只有 $stream/invoke，invoke 报「无活动通道」，
 * projectionStores.rows 为空 ⇒ 默认关闭，避免每点一次刷十几条 reject。
 */
const COLD_READ_PROBE = false

/** 官方样式缺失告警只打一次（避免每次渲染刷屏）。 */
let officialWarned = false

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
  // retain 引用：用完必须 release（否则会话 scope 不会被回收）。
  let retainedRef: { release(): void } | null = null
  const releaseRef = (): void => {
    try { retainedRef?.release() } catch (err) { log('warn', `sessions.retain 引用释放失败（${id}）`, err) }
    retainedRef = null
  }
  let binding: SessionBindingFace
  try {
    // ── 根因（读官方源码 @deepseek-ai/dsh-api-session-controller@0.1.7-rc.2 lib/client.js）──
    // binding(id) = this.scopes.get(id)?.binding：**只查已物化的 scope，从不创建**（3406 行）。
    // 归档/久未打开的会话没有 scope ⇒ 返回 undefined；uiConversation.binding 随即抛
    // `inactive session`（ui-conversation lib/client.js:3083 判 sessions.binding(id) !== owner）。
    // 正解：先 retain(id, { source }) → retainScope → materializeScope 物化 scope（3410 / 3472 行），
    // 并在内部触发 manager.get(id).open() 拉历史尾页；返回引用需在使用结束后 release()。
    const S0 = sessions as unknown as Record<string, unknown>
    const retainFn = S0.retain
    if (typeof retainFn === 'function') {
      try {
        retainedRef = (retainFn as (t: string, o: { source: string }) => { release(): void })
          .call(S0, id, { source: 'dsh-task-dispatch-table' })
        log('info', `sessions.retain(${id}, { source }) 成功：scope 已物化`)
      } catch (err) { log('warn', `sessions.retain(${id}) 抛错（未知会话？）`, err) }
    } else {
      log('warn', `sessions 无 retain 方法；自身键=[${Object.keys(S0).join(',')}]`)
    }
    const found: SessionBindingFace | undefined = sessions.binding(id)
    if (found === undefined || found === null) {
      // —— 取证优先：把 sessions 服务真实方法面全打出来，下次不再猜 ——
      const S0d = sessions as unknown as Record<string, unknown>
      const allFn = ((): string[] => {
        const out = new Set<string>()
        let cur: unknown = S0d
        while (cur && (typeof cur === 'object' || typeof cur === 'function')) {
          for (const k of Object.getOwnPropertyNames(cur as object)) {
            const v = (cur as Record<string, unknown>)[k]
            if (typeof v === 'function' && k !== 'constructor') out.add(k)
          }
          cur = Object.getPrototypeOf(cur)
        }
        return [...out]
      })()
      log('warn', `sessions.binding(${id}) 为空（会话未就位）。sessions 方法全清单=[${allFn.join(',')}]；自身键=[${Object.keys(S0d).join(',')}]`)
      if (!COLD_READ_PROBE) { releaseRef(); return null }
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
        return { target, session, dispose: () => {}, loadOlder: () => {} }
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
    releaseRef()
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
    dispose: releaseRef,
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

// ─────────────────────────── 渲染（mirror/ 目录：组件按官方文件名一一对应） ───────────────────────────

// 样式表注入（幂等；无 document 环境静默跳过）。规则定义见 ./archive-session-css。
ensureArchiveSessionStyle()

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

/** legacy assistant 节点的纯文本（复制按钮用）。 */
function assistantText(node: ConversationNodeLike): string {
  return (node.blocks ?? []).map(block => block.kind === 'text' ? block.text : '').join('')
}

// ─────────────────── keyed 节点流（官方 ChatView 真正渲染的那条流） ───────────────────

/** keyed 节点的 data（官方 ChatNodeDataMap[kind]）。 */
function dataOf(node: ChatNodeFace): Record<string, unknown> {
  return node.data ?? {}
}

/** 节点位置 → turn 位置（官方 node.location 收窄，ChatNodeSeat.tsx:1660 的反向）。 */
function turnLocationOf(node: ChatNodeFace): TurnLocationFace | undefined {
  const location = node.location
  return location?.kind === 'turn' || location?.kind === 'step' ? location.turn : undefined
}

/** 官方 AssistantChatData.blocks（ui-chat contract/chat-nodes.d.ts:22）。 */
function blocksOf(value: unknown): readonly AssistantBlockLike[] | undefined {
  return Array.isArray(value) ? value as readonly AssistantBlockLike[] : undefined
}

/**
 * 官方 ToolCallBlock（uic contract/records.d.ts:140）→ 工具卡 props。
 * running 半截（phase: preparing/start）只有 name/argsRaw；settled（kind: tool-result）带输出与错误。
 */
function toolCallCard(node: ChatNodeFace, t: Translate, onOpenFile?: (path: string) => void): Parameters<typeof GenericCommandCard>[0] | null {
  const root = dataOf(node).root as Record<string, unknown> | undefined
  if (root === undefined || root === null) return null
  const settled = root.kind === 'tool-result'
  const call = settled ? root.call as Record<string, unknown> | undefined : root
  const error = root.error as { name?: string; code?: string } | undefined
  return {
    name: typeof call?.name === 'string' ? call.name : 'tool',
    argsRaw: typeof call?.argsRaw === 'string' ? call.argsRaw : '',
    output: settled ? contentText(root.content as readonly ContentBlockLike[] | undefined) : '',
    isError: root.isError === true,
    errorName: error?.name,
    meta: root.meta,
    settled,
    phase: settled ? undefined : root.phase === 'preparing' ? 'preparing' : 'start',
    interrupted: error?.code === 'interrupted',
    onOpenFile,
    t,
  }
}

/** 官方 Tool / ToolResult block 是否为 present 调用（交付文件行专属渲染；running 名在顶层，结算名在 call 里）。 */
function isPresentRoot(root: unknown): boolean {
  if (typeof root !== 'object' || root === null) return false
  const r = root as { name?: unknown; kind?: unknown; call?: { name?: unknown } | null }
  if (r.name === 'present') return true
  return r.kind === 'tool-result' && r.call !== null && typeof r.call === 'object' && r.call.name === 'present'
}

/** 官方 present 调用参数里的 files（deliverables/presented 事件同源数据）。 */
function presentFiles(root: unknown): DeliveredFileFace[] {
  if (typeof root !== 'object' || root === null) return []
  const r = root as { kind?: unknown; call?: { argsRaw?: unknown } | null; argsRaw?: unknown; isError?: unknown }
  const settled = r.kind === 'tool-result'
  if (r.isError === true) return []
  const raw = settled ? r.call?.argsRaw : r.argsRaw
  if (typeof raw !== 'string') return []
  try {
    const parsed = JSON.parse(raw) as unknown
    const files = (parsed as { files?: unknown } | null)?.files
    if (!Array.isArray(files)) return []
    const out: DeliveredFileFace[] = []
    for (const file of files) {
      if (typeof file !== 'object' || file === null) continue
      const path = (file as { path?: unknown }).path
      if (typeof path !== 'string' || path.trim() === '') continue
      const description = (file as { description?: unknown }).description
      out.push(typeof description === 'string' && description.trim() !== '' ? { path, description } : { path })
    }
    return out
  } catch {
    return []
  }
}

/**
 * keyed 节点 → 视图（等价于官方 slot "conversation.chat.node" 的按 kind 分发）。
 * @param node - keyed ChatNode。
 * @param turnProcess - seat 下发的过程席位（turn-process / 折叠答案节点要用）。
 * @param t - 翻译席位（已包占位符替换）。
 * @param onBranchAt - 消息行分支按钮（以该轮 tail seq 开分支；undefined = 不渲染按钮）。
 * @param fileOpen - U11 文件打开上下文（undefined = workspaceFiles 未就位，链接全部降级为纯文本）。
 * @param groupPart - 过程分组侧（'response' | 'reasoning'）。
 * @param deliveredByTurn - 每轮交付文件（present 工具调用同源推导；官方 DeliverablesTail 同态）。
 * @returns 节点视图；null = 决策 28 过滤的噪音 kind。
 */
function renderKeyedNode(
  node: ChatNodeFace,
  turnProcess: TurnProcessHandle | undefined,
  t: Translate,
  onBranchAt: ((seq: number) => void) | undefined,
  fileOpen: FileOpenFace | undefined,
  groupPart?: 'response' | 'reasoning',
  deliveredByTurn?: ReadonlyMap<number, readonly DeliveredFileFace[]>,
): ReturnType<typeof h> | null {
  switch (node.kind) {
    case 'turn-trigger':
      return h(TurnTriggerNodeViewMirror, { data: node.data, t })
    case 'turn-process':
      return turnProcess === undefined ? null : h(TurnProcessNodeViewMirror, {
        turn: turnLocationOf(node),
        turnProcess,
        t,
      })
    case 'turn-tail': {
      // 官方 turnTail 插槽（closing === null 也渲染）：本弹窗用它承载交付文件卡网格
      // （DeliverablesTail 镜像：present 交付的文件整卡可点 → openFile 预览）。
      const data = node.data as unknown as TurnTailDataFace | undefined
      const tail = data === undefined || data.closing === null || data.closing === undefined
        ? null
        : h(TurnTailNodeViewMirror, { data, onBranchAt, t })
      const turn = data?.turn ?? turnLocationOf(node)?.turn
      const delivered = turn === undefined ? undefined : deliveredByTurn?.get(turn)
      const grid = delivered === undefined || delivered.length === 0
        ? null
        : h(DeliverablesGridMirror, { files: delivered, onOpen: fileOpen?.open, t })
      if (tail === null && grid === null) return null
      return h(Fragment, null, tail, grid)
    }
    case 'assistant-step': {
      // 官方块渲染器（lib/client.js:5818-5871）：
      //   · 整步只有 tool-call 块 ⇒ 整步不渲染（工具调用由独立的 tool-call 节点画）；
      //   · tool-call 块一律跳过（case "tool-call": break）——重复渲染卡片即真机踩过的「编辑/写入×2」；
      //   · groupPart 'reasoning' 只画思考块、'response' 跳过思考块；未分组全画（除工具块）。
      const blocks = blocksOf(dataOf(node).blocks) ?? []
      const contentBlocks = blocks.filter(block => block.kind !== 'tool-call')
      if (blocks.length > 0 && contentBlocks.length === 0) return null
      const visible = groupPart === 'reasoning'
        ? contentBlocks.filter(block => block.kind === 'reasoning')
        : groupPart === 'response'
          ? contentBlocks.filter(block => block.kind !== 'reasoning')
          : contentBlocks
      const parts = assistantBlocks(visible, t, fileOpen?.mentions)
      return parts.length === 0 ? null : h('div', { className: 'dsh-tdt-sv-assistant' }, parts)
    }
    case 'tool-call': {
      // present（交付文件）走官方 tool.call.toolview 槽位 key='present' 的专属 PresentRow
      // （标题「交付文件」+ 状态词 + 路径列表；不经通用工具卡）。
      const root = dataOf(node).root
      if (isPresentRoot(root)) return h(PresentRowMirror, { block: root, t })
      const card = toolCallCard(node, t, fileOpen?.open)
      return card === null ? null : h(GenericCommandCard, card)
    }
    case 'user':
    case 'steering': {
      const text = contentText(dataOf(node).content as readonly ContentBlockLike[] | undefined)
      if (text === '') return null
      return h(UserMessage, { text })
    }
    case 'turn-error':
      return h(TurnErrorItemMirror, { node: dataOf(node) as TurnErrorFace, t })
    case 'turn-max-tokens':
      return h(TurnMaxTokensItemMirror, { t })
    case 'model-retry': {
      // 官方 RetryNodeView（lib/client.js:1493）：只画 data.current（链上最近一次尝试），
      // active = retryState === 'scheduled'。keyed 节点 data = { attempts, current }；
      // 数据薄时兜底取 attempts 末项（与官方 buildViewNode 的 current 取法同构）。
      const data = dataOf(node)
      const attempts = Array.isArray(data.attempts) ? data.attempts as RetryAttemptFace[] : []
      const current = (typeof data.current === 'object' && data.current !== null
        ? data.current
        : attempts[attempts.length - 1]) as RetryAttemptFace | undefined
      if (current === undefined) return null
      return h(ModelRetryItemMirror, { node: current, active: current.retryState === 'scheduled', t })
    }
    // 决策 28：context（系统注入）/ compaction / unknown 仍默认过滤；
    // ⚠ ui-map §十一-B：官方 ContextInjectionRow / SystemPromptRow 待实施——届时从这里放行。
    case 'context':
    case 'compaction':
    case 'manual-compaction':
    case 'unknown':
      return null
    default:
      // 决策 28：不认识的 kind 一律 fallback（折叠原文），升级不白屏。
      return h('details', { className: 'dsh-tdt-sv-tool' },
        h('summary', { className: 'dsh-tdt-sv-notice' }, `${t('sessionUnknownKind')} ${node.kind}`),
        h('pre', null, safeJson(node.data)),
      )
  }
}

/**
 * assistant 内容块 → 子元素数组（官方块渲染器 lib/client.js:5826-5870 的同构）：
 * text → 官方 MarkdownText、reasoning → 官方 ReasoningRow（标题「思考」）、image 占位；
 * tool-call 块一律跳过（官方 case "tool-call": break——由独立工具节点渲染，重复画 = ×2）；
 * 未知块折叠原文。
 */
function assistantBlocks(
  blocks: readonly AssistantBlockLike[] | undefined,
  t: Translate,
  fileMentions?: FileOpenFace['mentions'],
): ReturnType<typeof h>[] {
  if (blocks === undefined) return []
  const parts: ReturnType<typeof h>[] = []
  blocks.forEach((block, index) => {
    switch (block.kind) {
      case 'text':
        if (block.text.trim() !== '') parts.push(h(AssistantMarkdown, { key: `t${index}`, text: block.text, fileMentions }))
        break
      case 'reasoning':
        if (block.text.trim() !== '') parts.push(h(ReasoningRowMirror, { key: `r${index}`, text: block.text, t }))
        break
      case 'image':
        parts.push(h('div', { key: `i${index}`, className: 'dsh-tdt-sv-image' }, '[图片]'))
        break
      case 'tool-call':
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

/**
 * legacy 兜底渲染：官方兼容投影（老 kind 名）的单个节点；返回 null = 按决策 28 过滤的噪音 kind。
 * 仅在 keyed `order` 缺失时使用（正常路径见 renderKeyedNode）。
 */
function renderLegacyNode(node: ConversationNodeLike, t: Translate, fileOpen?: FileOpenFace): ReturnType<typeof h> | null {
  switch (node.kind) {
    case 'user':
    case 'steering': {
      const text = contentText(node.content)
      if (text === '') return null
      return h(UserMessage, { key: node.seq, text })
    }
    case 'assistant': {
      const parts = assistantBlocks(node.blocks, t, fileOpen?.mentions)
      return parts.length === 0 ? null : h('div', { key: node.seq, className: 'dsh-tdt-sv-assistant' }, parts)
    }
    case 'tool-result': {
      if (node.call?.name === 'present') return h(PresentRowMirror, { key: node.seq, block: node, t })
      return h(GenericCommandCard, {
        key: node.seq,
        name: node.call?.name ?? 'tool',
        argsRaw: node.call?.argsRaw ?? '',
        output: contentText(node.content),
        isError: node.isError === true,
        errorName: node.error?.name,
        meta: node.meta,
        settled: true,
        interrupted: (node.error as { code?: string } | undefined)?.code === 'interrupted',
        onOpenFile: fileOpen?.open,
        t,
      })
    }
    case 'command': {
      return h(GenericCommandCard, {
        key: node.seq,
        name: `/${node.name ?? '?'}`,
        argsRaw: node.args ?? '',
        output: node.outcome?.text ?? '',
        isError: node.outcome?.kind === 'error',
        t,
      })
    }
    case 'turn-error':
      return h(TurnErrorItemMirror, { key: node.seq, node, t })
    case 'turn-max-tokens':
      return h(TurnMaxTokensItemMirror, { key: node.seq, t })
    case 'model-retry':
      // legacy 兼容投影的 model-retry = 单次尝试（ModelRetryNode 扁平节点）。
      return h(ModelRetryItemMirror, { key: node.seq, node, active: node.retryState === 'scheduled', t })
    // 决策 28：默认过滤的噪音 kind —— context（系统注入）、compaction（压缩标记）、
    // unknown（未知事件面）。assistant 里的 reasoning 由 mirror/ReasoningRow 折叠渲染。
    // ⚠ ui-map §十一-B：系统提示/上下文注入行（官方 ContextInjectionRow）待实施——届时从这里放行。
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

/** 渲染项：单节点，或一组被折叠的「过程」（连续工具调用）。 */
type RenderItem = { kind: 'node'; node: ConversationNodeLike } | { kind: 'process'; nodes: ConversationNodeLike[] }

/**
 * 把连续的 tool-result / command 收成一个「过程」组——官方就是把工具调用折进
 * turn 的过程块（默认收起），页面才不会变成一列流水账。单个工具不再包组，避免多一层。
 */
function groupNodes(list: readonly ConversationNodeLike[]): RenderItem[] {
  const out: RenderItem[] = []
  let run: ConversationNodeLike[] = []
  const flush = (): void => {
    if (run.length === 0) return
    if (run.length >= 2) out.push({ kind: 'process', nodes: run })
    else out.push({ kind: 'node', node: run[0] })
    run = []
  }
  for (const node of list) {
    if (node.kind === 'tool-result' || node.kind === 'command') { run.push(node); continue }
    flush()
    out.push({ kind: 'node', node })
  }
  flush()
  return out
}

/** legacy 兜底整流的渲染（keyed order 缺失时才会走到）。 */
function renderLegacyRows(nodes: readonly ConversationNodeLike[], t: Translate, fileOpen?: FileOpenFace): ReturnType<typeof h>[] {
  const items = groupNodes(nodes)
  const rows: ReturnType<typeof h>[] = []
  items.forEach((entry, index) => {
    const parts: ReturnType<typeof h>[] = []
    if (entry.kind === 'process') {
      // legacy 兜底没有 turn 位置 ⇒ 拿不到官方「用时 N 秒」行，退回计数行。
      parts.push(h('div', { key: 'lead', className: 'dsh-tdt-sv-notice' }, `${t('sessionProcess')} · ${entry.nodes.length}`))
      entry.nodes.forEach((node, i) => {
        const rendered = renderLegacyNode(node, t, fileOpen)
        if (rendered !== null) parts.push(h('div', { key: `p${i}` }, rendered))
      })
    } else {
      const inner = renderLegacyNode(entry.node, t)
      if (inner !== null) parts.push(inner)
      if (entry.node.kind === 'assistant') {
        const next = items[index + 1]
        const isTurnEnd = next === undefined || !(next.kind === 'node' && next.node.kind === 'assistant')
        if (isTurnEnd) parts.push(h(MessageIconActionsMirror, { key: 'act', text: assistantText(entry.node), clock: 'end', t }))
      }
    }
    if (parts.length === 0) return
    rows.push(h('div', { key: `lg${index}`, className: ocOr('ChatView', 'flowItem', 'dsh-tdt-sv-flowitem') }, parts))
  })
  return rows
}

// ── U11 产出物预览：统一 openFile 单一入口 + markdown 行内文件词表 ──

/** 官方 MarkdownText.fileMentions 的消费面（resolve 命中渲成链接，解析不出保持惰性 code）。 */
interface FileMentionsFace {
  resolve(value: string): { open(): void; label: string; title: string } | undefined
}

/** U11 文件打开上下文：openFile 单一入口（工具卡路径 + md 行内引用共用）+ 词表。 */
interface FileOpenFace {
  open(path: string): void
  mentions: FileMentionsFace
}

/** 路径归一：去 './' 前缀（词表键与 resolve 两侧同规则）。 */
function normalizeFilePath(p: string): string {
  let s = p.trim()
  while (s.startsWith('./')) s = s.slice(2)
  return s
}

/**
 * 从 keyed 节点流收集真实文件词表（禁模拟：全部来自工具调用参数 / meta.diffs）：
 * tool-call 节点 argsRaw 的 file_path/path 字段（read/grep/glob/write/edit…）与
 * tool-fs 写入 meta.diffs[].path。会话级词表 = 官方 per-turn chatFileMentions 的简化偏差
 * （决策 39：resolve 命中才渲链接，解析不出保持惰性 code，永不猜）。
 */
function collectFilePaths(order: readonly string[], store: ChatNodeStoreFace | undefined): string[] {
  if (store === undefined) return []
  const out = new Set<string>()
  for (const key of order) {
    const node = store.get(key)
    if (node === undefined || node.kind !== 'tool-call') continue
    const root = (node.data as { root?: Record<string, unknown> } | undefined)?.root
    if (root === undefined || root === null || typeof root !== 'object') continue
    if (isPresentRoot(root)) {
      // present（交付文件）：files[].path 全进词表（官方 chatFileMentions 同源：produced + presented）。
      for (const file of presentFiles(root)) out.add(normalizeFilePath(file.path))
      continue
    }
    const call = (root.kind === 'tool-result' ? root.call : root) as Record<string, unknown> | undefined
    if (call === null || typeof call !== 'object') continue
    const raw = typeof call.argsRaw === 'string' ? call.argsRaw.trim() : ''
    if (raw.startsWith('{')) {
      try {
        const parsed = JSON.parse(raw) as Record<string, unknown>
        for (const field of ['file_path', 'path']) {
          const value = parsed[field]
          if (typeof value === 'string' && value.trim() !== '') out.add(normalizeFilePath(value))
        }
      } catch { /* 非法 JSON 不进词表 */ }
    }
    const meta = root.meta
    if (typeof meta === 'object' && meta !== null) {
      const diffs = (meta as { diffs?: unknown }).diffs
      if (Array.isArray(diffs)) {
        for (const diff of diffs) {
          const p = (diff as { path?: unknown } | null)?.path
          if (typeof p === 'string' && p.trim() !== '') out.add(normalizeFilePath(p))
        }
      }
    }
  }
  return [...out]
}

/**
 * 每轮交付文件（官方 DeliverablesTail 的 presented 数据同源推导）：keyed 流里
 * settled 且成功的 present 调用参数 files，按 turn 归组、按路径去重（后者覆盖前者，
 * 与官方 presentedForClosing 的 map 语义一致）。纯客户端推导，零额外请求。
 */
function collectDeliveredFiles(order: readonly string[], store: ChatNodeStoreFace | undefined): ReadonlyMap<number, readonly DeliveredFileFace[]> {
  const out = new Map<number, readonly DeliveredFileFace[]>()
  const byTurn = new Map<number, Map<string, DeliveredFileFace>>()
  if (store === undefined) return out
  for (const key of order) {
    const node = store.get(key)
    if (node === undefined || node.kind !== 'tool-call') continue
    const root = (node.data as { root?: unknown } | undefined)?.root
    if (!isPresentRoot(root)) continue
    const turn = turnLocationOf(node)?.turn
    if (turn === undefined) continue
    const files = presentFiles(root)
    if (files.length === 0) continue
    let bucket = byTurn.get(turn)
    if (bucket === undefined) { bucket = new Map(); byTurn.set(turn, bucket) }
    for (const file of files) bucket.set(file.path, file)
  }
  byTurn.forEach((bucket, turn) => { out.set(turn, [...bucket.values()]) })
  return out
}

/**
 * 构建 fileMentions：归一化精确匹配优先、唯一 basename 兜底（官方 fileMentions 语义：
 * 词表外一律 undefined ⇒ MarkdownText 保持惰性 code，renderer never guesses）。
 */
function makeFileMentions(paths: readonly string[], open: (path: string) => void): FileMentionsFace {
  const exact = new Map<string, string>()
  const byBase = new Map<string, string[]>()
  for (const p of paths) {
    exact.set(p, p)
    const base = p.includes('/') ? p.slice(p.lastIndexOf('/') + 1) : p
    const bucket = byBase.get(base)
    if (bucket === undefined) byBase.set(base, [p])
    else bucket.push(p)
  }
  return {
    resolve(value: string): { open(): void; label: string; title: string } | undefined {
      const norm = normalizeFilePath(value)
      const hit = exact.get(norm) ?? (() => {
        const base = norm.includes('/') ? norm.slice(norm.lastIndexOf('/') + 1) : norm
        const bucket = byBase.get(base)
        return bucket !== undefined && bucket.length === 1 ? bucket[0] : undefined
      })()
      if (hit === undefined) return undefined
      return { label: value, title: hit, open: () => { open(hit) } }
    },
  }
}

/**
 * 面板内只读会话弹窗（决策 28 数据链 + 决策 34 渲染）：只读、不可续聊。
 * U10「继续对话（开分支）」：头部按钮 → 确认框 → `sessions.fork`（官方 ISessions 契约，
 * 不带 atSeq = 最新已完成 turn 前缀，increaseTitle 让子会话标题递增 (1)）→ 先关弹窗
 * （release 源会话）→ `uiWorkspace.openSession(childId)`（官方导航服务：内部自己
 * retain('mainView') + selection.set + selectPanel(null)，我们只调服务、不碰保留值）。
 * @param props - viewSessionId 指向的执行会话；数据经 openSessionView 建好传入。
 *   forkSession / openHostSession 缺一即不渲染按钮（服务未就位时功能降级）。
 */
export function SessionViewModal(props: {
  t: Translate
  /** 弹窗标题（执行记录里该行的任务名 · 刻度）。 */
  heading: string
  sessionId: string
  view: SessionViewTarget
  onClose: () => void
  /** fork 源会话：`sessions.fork({ sessionId, increaseTitle: true })`，解析为子会话 id。 */
  forkSession?: (sessionId: string, atSeq?: number) => Promise<string>
  /** 官方导航跳转：`uiWorkspace.openSession(id)`（会话区打开目标会话）。 */
  openHostSession?: (sessionId: string) => void
  /** U11 产出物预览：remote.workspaceFiles 服务（未就位 = 链接降级纯文本，不渲染预览入口）。 */
  workspaceFiles?: WorkspaceFilesFace
  /**
   * U11 统一入口（页面级）：点任意文件链接 → 由外层（整页）渲染**唯一那份**预览 dock
   * （弹窗与整页共用同一个预览面；弹窗不遮盖它，见 docs/design/artifact-opening.md §四-C）。
   * 未传 = 预览能力未就位 ⇒ 弹窗内链接降级纯文本。
   */
  onOpenFile?: (path: string) => void
}): ReturnType<typeof h> {
  const { t, heading, sessionId, view, onClose, forkSession, openHostSession, workspaceFiles, onOpenFile } = props
  // 宿主 t 可能不做 {占位符} 替换 ⇒ 统一包一层（官方模板一律 {name}）。
  const tt = useMemo(() => interpolateTranslate(t), [t])
  const subscribe = useMemo(() => (onChange: () => void): (() => void) => view.target.subscribe(onChange), [view])
  const getSnapshot = useMemo(() => (): ChatViewFace | undefined => view.target.getSnapshot(), [view])
  const chat = useSyncExternalStore(subscribe, getSnapshot)

  // 会话生命周期（加载态 / 向前翻页按钮），同样只读订阅。
  const sessionSub = useMemo(() => (onChange: () => void): (() => void) => view.session.subscribe(onChange), [view])
  const sessionGet = useMemo(() => (): SessionSnapshotFace => view.session.getSnapshot(), [view])
  const sessionSnap = useSyncExternalStore(sessionSub, sessionGet)

  // 折叠状态：turn → 已展开的 answerStep（官方 store 的 storedTurnProcessEntry，同语义）。
  const [openTurns, setOpenTurns] = useState<ReadonlyMap<number, number>>(() => new Map<number, number>())
  const onSetOpen = useCallback((turn: number, answerStep: number, open: boolean): void => {
    setOpenTurns((prev) => {
      const next = new Map(prev)
      if (open) next.set(turn, answerStep)
      else next.delete(turn)
      return next
    })
  }, [])

  // U10 开分支：确认框显隐 + fork 进行中 + 失败原因。aliveRef 防「fork 在途时用户关弹窗」
  // 后仍跳转（await 回来时弹窗已卸载 ⇒ 放弃跳转，不 setState）。
  const canFork = forkSession !== undefined && openHostSession !== undefined
  const [forkTarget, setForkTarget] = useState<{ atSeq?: number } | null>(null)
  const [forking, setForking] = useState(false)
  const [forkErr, setForkErr] = useState<string | null>(null)
  const aliveRef = useRef(true)
  useEffect(() => () => { aliveRef.current = false }, [])
  const onForkAccept = useCallback((): void => {
    if (forking || forkSession === undefined || openHostSession === undefined) return
    setForking(true)
    setForkErr(null)
    void (async () => {
      try {
        const child = await forkSession(sessionId, forkTarget?.atSeq)
        if (!aliveRef.current) return
        // 先关弹窗（dispose ⇒ release 源会话 scope），再跳宿主会话区（官方导航服务）。
        onClose()
        openHostSession(child)
      } catch (error) {
        if (!aliveRef.current) return
        setForkErr(error instanceof Error ? error.message : String(error))
      } finally {
        setForking(false)
      }
    })()
  }, [forking, forkSession, openHostSession, sessionId, forkTarget, onClose])
  // 消息行分支按钮（官方分支 icon 位置）：从该轮 tail 消息截断开分支（同样先出确认框）。
  const onBranchAt = useCallback((seq: number): void => {
    setForkErr(null)
    setForkTarget({ atSeq: seq })
  }, [])

  // U11 统一入口：弹窗内所有文件链接走外层（整页）的 openFile —— 预览面只有一份、页面级，
  // 弹窗不再自带分栏（用户 2026-09-28 拍板：弹窗与整页共用同一个预览面，弹窗不遮盖它）。
  const openFile = useCallback((path: string): void => { onOpenFile?.(path) }, [onOpenFile])

  const order = chat?.order ?? EMPTY_ORDER
  const store = chat?.nodes
  const keyed = order.length > 0 && store !== undefined
  const turns = chat?.timeline?.turns
  // markdown 行内文件词表（来自 keyed 工具流；workspaceFiles 未就位 = 整个上下文不启用）。
  const fileOpen = useMemo<FileOpenFace | undefined>(() => {
    // 预览能力 = workspaceFiles 已就位 **且** 外层给了 openFile（两者缺一即链接降级纯文本）。
    if (workspaceFiles === undefined || onOpenFile === undefined) return undefined
    return {
      open: openFile,
      mentions: makeFileMentions(collectFilePaths(order, store), openFile),
    }
  }, [workspaceFiles, onOpenFile, openFile, order, store])
  // 每轮交付文件（present 调用同源推导，独立于 workspaceFiles：卡片照官方常渲染，点击才走 openFile）。
  const deliveredByTurn = useMemo(() => collectDeliveredFiles(order, store), [order, store])
  const renderNode = useCallback<NodeRenderer>(
    (node, turnProcess, groupPart) => renderKeyedNode(node, turnProcess, tt, onBranchAt, fileOpen, groupPart, deliveredByTurn),
    [tt, onBranchAt, fileOpen, deliveredByTurn],
  )
  // 官方 grouped('chat')：把 keyed 流切成「独立条目 + 过程分组」（二级收折）。
  const isTurnClosed = useCallback((turn: number): boolean =>
    (turns?.get(turn) ?? turns?.get(String(turn)))?.status !== 'open', [turns])
  const groupedView = useMemo(
    () => keyed ? buildProcessGroups(order, key => store?.get(key), isTurnClosed) : undefined,
    [keyed, order, store, isTurnClosed],
  )

  // ChatNodeList 直接调用（无 hook 的纯函数）：它产出的是「flowItem 数组」，不是单个元素。
  const rows: Array<ReturnType<typeof h> | null> = keyed
    ? ChatNodeListMirror({
        order,
        store,
        entries: groupedView?.entries,
        groups: groupedView?.groups,
        turns,
        openState: openTurns,
        onSetOpen,
        // 官方 usePresentation(policy => policy.foldCompletedTurns)：只读历史视图按「折叠已完成轮次」处理。
        foldCompleted: true,
        renderNode,
        t: tt,
      })
    : renderLegacyRows(chat?.legacy?.nodes ?? [], tt, fileOpen)
  const rendered = rows.filter((row): row is NonNullable<ReturnType<typeof h>> => row !== null && row !== undefined)

  const officialCount = officialModuleCount()
  if (!officialWarned) {
    officialWarned = true
    console.info(`[task-dispatch:session-view] 官方 ui-chat 模块数=${officialCount}；类名样例 frame=${officialClass('ChatView', 'frame')} flowItem=${officialClass('ChatView', 'flowItem')} trigger=${officialClass('TurnTriggerNodeView', 'root')} turnProcess=${officialClass('TurnProcessNodeView', 'root')} tail=${officialClass('TurnTailNodeView', 'root')}`)
    if (officialCount === 0) {
      console.warn('[task-dispatch:session-view] 未发现官方 ui-chat 样式模块 ⇒ 弹窗观感退回自绘样式（功能不受影响）')
    }
  }
  const openState = sessionSnap?.openState
  const showLoadOlder = sessionSnap?.hasMore !== false
  const body = rendered.length === 0
    ? h(ChatHint, {
        text: openState === 'error' ? tt('sessionLoadFailed')
          : openState === 'loading' || openState === 'cold' ? tt('sessionLoading')
          : tt('sessionEmpty'),
      })
    : [
        showLoadOlder
          ? h(ChatOlderButton, { key: 'older', label: tt('sessionLoadOlder'), onClick: () => { view.loadOlder() } })
          : null,
        ...rendered,
      ]

  // 关闭途径：右上角关闭按钮 / 点遮罩（主面板同款，不监听 document）。
  // U10：头部「继续对话」按钮（fork 服务就位才渲染）→ 确认框 = 官方 Modal（portal 到 body，
  // 与本弹窗同 z-index 层、后挂载居上；Escape / 遮罩点击 / 头部叉均触发 onClose）。
  return h(Fragment, null,
    h('div', { className: 'dsh-tdt-sv-overlay', onClick: onClose },
      h('div', { className: 'dsh-tdt-sv-panel', onClick: (event: { stopPropagation(): void }) => { event.stopPropagation() } },
        h('div', { className: 'dsh-tdt-sv-header' },
          h('div', { className: 'dsh-tdt-sv-heading' },
            h('div', { className: 'dsh-tdt-sv-title' }, `${tt('sessionViewerTitle')} · ${heading}`),
            h('div', { className: 'dsh-tdt-sv-sid' }, sessionId),
            // 可见探针：官方样式未命中时直接显示（省得翻控制台）。命中则不显示。
            officialCount === 0
              ? h('div', {
                  className: 'dsh-tdt-sv-sid',
                  style: { color: 'var(--dsw-alias-state-warn-primary, #b7791f)' },
                }, '⚠ 官方样式未命中（当前为自绘回退）')
              : null,
          ),
          h('div', { className: 'dsh-tdt-sv-headerbtns' },
            canFork
              ? h('button', {
                  type: 'button',
                  className: 'dsh-tdt-sv-branch',
                  disabled: forking,
                  title: tt('continueBranch'),
                  onClick: () => { setForkErr(null); setForkTarget({}) },
                }, h(IconBranchOutlineRegular, { size: 14 }), tt('continueBranch'))
              : null,
            h('button', {
              type: 'button',
              className: 'dsh-tdt-sv-close',
              'aria-label': tt('debugClose'),
              onClick: onClose,
            }, h(IconCloseOutlineRegular, { size: 14 })),
          ),
        ),
        // 会话区 = mirror/ChatView（frame > root > scroll > column > flowItem*，官方类优先）。
        // U11：预览面已上提到页面级 dock（弹窗不再自带分栏），此处只留会话区本身。
        h(ChatViewFrame, { children: body }),
      ),
    ),
    // 开分支确认框（用户拍板：必须先确认再 fork，防误点）——官方 primitives Modal + Button
    // （官方 RiskConfirmation 同源组合：outline 取消 / primary 确认；primary 底色走
    // --dsw-alias-button-primary-fill，明暗主题自适应；失败留在框内提示、不关会话弹窗）。
    h(Modal, {
      open: forkTarget !== null,
      onClose: () => { if (!forking) setForkTarget(null) },
      title: tt('forkConfirmTitle'),
      closeLabel: tt('debugClose'),
      description: tt('forkConfirmText'),
      className: 'dsh-tdt-sv-forkmodal',
      footer: [
        h(Button, { key: 'cancel', variant: 'outline', disabled: forking, onClick: () => { setForkTarget(null) } }, tt('forkCancel')),
        h(Button, { key: 'accept', variant: 'primary', disabled: forking, onClick: onForkAccept }, forking ? tt('forkWorking') : tt('forkConfirmAccept')),
      ],
    }, forkErr !== null ? h('p', { className: 'dsh-tdt-sv-forkerr' }, tt('forkFailed', { error: forkErr })) : null),
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
