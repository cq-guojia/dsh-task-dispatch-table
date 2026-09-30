// 回执工具（决策 24，修订决策 19 的 shell 通道）：插件注册一个**只对该任务会话可见**的工具
// `task_dispatch_table_receipt`，agent 做完任务后调用它提交回执；**写库发生在插件进程内**，绕开 agent 沙箱。
//
// 为什么必须换通道（真机 2026-09-23）：agent 的 bash 跑在 Landlock 沙箱的 workspace-write
// 模式——只能写工作区内；而 submit.js 要写宿主数据根下的 state.db ⇒ 被拒（SQLite 报
// `attempt to write a readonly database`，`chmod u+w` 无效——拦的是沙箱不是权限位，`cp` 回写
// 更被 `[sandbox: file access denied under workspace-write mode]` 点名拒绝）。agent 甚至自己
// 去拷贝数据库绕道。**路径谁传不是根因：在 agent 沙箱里写宿主状态库这件事本身不成立。**
//
// 注册点 = dispatch 的 setup(agentCtx)：宿主 tools.register 按**调用它的 ctx 分层**
// （@deepseek-ai/dsh-tools 原文：`Register globally or in the calling agent scope`；冲突文案
// `for a per-agent variant, register through that agent's agent.ctx instead`），故经 agentCtx
// 注册即 per-agent——发布前生效、只对该会话可见，用户自己的会话看不到。
//
// 绑定信息（实例 id / 会话 id / status 合法值）全部由**闭包注入**，不经过模型：
//   · 模型拿不到、也伪造不了 session_id ⇒ 回执无法冒充其它会话；
//   · 模型不必知道状态库在哪、不必有 node、不必有写权限 ⇒ 零环境猜测（决策 19 的初衷保留）。
import type { HostLogger } from './host.js'
import type { TaskStore } from './store.js'

/**
 * 工具名 = **包名去掉 `dsh-` 前缀 + `_receipt`** ⇒ `task_dispatch_table_receipt`。
 *
 * 为什么带命名空间而不是短名：宿主对重名的处理是「**同层抛错 / 跨层 scoped 遮蔽 global**」
 * （`@deepseek-ai/dsh-tools`：`NamedEntries` 冲突直接 throw；类注释 `Scoped registrations
 * shadow globals`）——两种都不希望发生。带插件名前缀把撞名概率压到可忽略，也让模型一眼看出归属。
 * 宿主对工具名没有格式/长度校验，所以这纯粹是防撞考虑。
 */
export const RECEIPT_TOOL_NAME = 'task_dispatch_table_receipt'

/** 可提交回执的实例状态（与 submit.ts 的判定一致）。 */
const RECEIPT_ACCEPTING = ['dispatched', 'running', 'unknown'] as const

/** 工具返回的规范值（受 output.schema 约束）。 */
interface ReceiptResult {
  ok: boolean
  message: string
}

/** 本插件用到的 tools 服务最小面（@deepseek-ai/dsh-tools：ToolRuntime.register）。 */
interface ToolRegistry {
  register(definition: unknown): unknown
}

/** 宿主 turnBoundary 投影读取面（最小契约；插件刻意不引宿主运行时包，故用松散类型）。 */
interface TurnBoundaryProjection {
  stateOf(session: unknown, name: 'turnBoundary'): { lastTurn?: number; openTurnStartSeq?: number | null } | undefined
}

export interface ReceiptToolDeps {
  store: TaskStore
  /** 会话显示名（决策 42 快照 title）：只用于工具描述文案，模型不可据此伪造身份。 */
  taskName: string
  /** 闭包注入的实例身份（UUID 主键），模型不可见。 */
  instanceId: string
  /** 闭包注入的本次派发会话，模型不可见 ⇒ 回执不可冒充。 */
  sessionId: string
  /** 回执 status 合法值（决策 41：来自派发快照，不读活任务表）。 */
  validStatuses: readonly string[]
  logger: HostLogger
  /** 闭包注入的 turnBoundary 投影读取面：取 `deliverables/presented` 事件所需的 turn。 */
  sessionProjections?: unknown
}

const asRecord = (value: unknown): Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {}

/** 文本归一：去零宽字符（模型偶发插入 U+200B..U+200D / U+FEFF）+ 去首尾空白。 */
const normalizeText = (value: string): string => value.replace(/[\u200B-\u200D\uFEFF]/g, '').trim()

/**
 * 全角 → 半角折叠（含全角空格 U+3000）：中文语境下模型偶发输出 `ｏｋ` / `ｏｋ　`。
 * ⚠️ 只用于 `status` 比对，不碰 `note` 正文（中文标点是正常内容，不该被改写）。
 */
const foldFullWidth = (value: string): string =>
  value
    .replace(/[\uFF01-\uFF5E]/g, ch => String.fromCharCode(ch.charCodeAt(0) - 0xFEE0))
    .replace(/\u3000/g, ' ')

/**
 * status 归一（**宽松接受、存声明值**）：大小写不敏感 + 去空白/零宽字符后与
 * `contract.validStatuses` 比对，命中则**存回任务声明的那个值**。
 *
 * 这样做的两个理由：① 对账侧的 `validStatuses.includes(status)` 永远成立（因为存的就是声明值）；
 * ② agent 写 `OK` / `ok ` / `ｏｋ` 之类不会被判非法而白白重试一轮（无人值守链路里，一次重试
 * 就是一轮 token）。其余写法（如 `success`、`完成`）一律不认，如实性不受影响。
 *
 * @returns 任务声明的规范值；没命中返回 undefined（调用方按「参数不合法」告知并让其修正）。
 */
function normalizeStatus(raw: unknown, statuses: readonly string[]): string | undefined {
  if (typeof raw !== 'string') return undefined
  const wanted = foldFullWidth(normalizeText(raw)).toLowerCase()
  return statuses.find(status => status.toLowerCase() === wanted)
}

/**
 * outputs 归一：数组取字符串项；字符串按逗号切（模型偶尔传逗号串）；其余忽略。
 * 逐项去空白 / 零宽字符、反斜杠统一成 `/`、去掉 `./` 前缀（宿主对账按工作区相对路径 `resolve`）。
 */
function normalizeOutputs(raw: unknown): string[] {
  const list = typeof raw === 'string' ? raw.split(',') : Array.isArray(raw) ? raw : []
  return list
    .filter((item): item is string => typeof item === 'string')
    .map(item => normalizeText(item).replace(/\\/g, '/').replace(/^\.\//, ''))
    .filter(item => item.length > 0)
}

/** 合法 status 清单（空数组兜底成 `['ok']`：schema 允许显式传空，但工具的 enum 不能为空）。 */
function receiptStatuses(validStatuses: readonly string[]): readonly string[] {
  return validStatuses.length > 0 ? validStatuses : ['ok']
}

/**
 * 工具定义（**裸 definition**、零依赖）：宿主 `register` 只强校验
 * `output: { schema, render, presentationMeta? }`，参数 schema 是纯 JSON Schema，
 * 故无需引宿主包（`defineTool` 那套要引 `@deepseek-ai/dsh-tools`，本插件刻意不依赖宿主运行时包）。
 */
function buildDefinition(deps: ReceiptToolDeps): unknown {
  const { store, taskName, instanceId, sessionId, logger, sessionProjections } = deps
  const statuses = receiptStatuses(deps.validStatuses)

  return {
    name: RECEIPT_TOOL_NAME,
    // 工具描述是**常驻上下文里的另一个指令面**（用户 2026-09-30：与消息体是两条独立通道，两边都要压硬）。
    // 时机由「任务做完后」改成「**本轮回复结束前**」——真机失败模式正是"回了一句就当收工"；
    // outputs 的填写粒度放这里（属"怎么填"，不再占用消息体那段的篇幅）。
    description:
      `提交任务「${taskName}」的执行回执。**本轮回复结束前必须调用一次**（准备输出最后一句之前）；`
      + `调度器以它判定本次任务成败，不调用等于失败——任务指令说「不要做其他操作」也不豁免。`
      + `参数：status（必填，如实）、outputs（可选，本次真实交付物相对工作区根的路径）、note（可选备注）。`
      + `outputs 粒度：装产物的文件夹是为本任务专门建的（如 "web-app/"）→ 填文件夹路径；`
      + `只是写进既有或按规范建的目录（如按日期的日常目录）→ 逐个列文件路径（如 ["20260928/a.md"]）；`
      + `没有产出就省略。重复调用安全（只认第一次）。`,
    parameters: {
      type: 'object',
      additionalProperties: false,
      properties: {
        status: {
          type: 'string',
          enum: [...statuses],
          description: `执行结果，必须如实，只能取：${statuses.join(' / ')}`,
        },
        outputs: {
          type: 'array',
          items: { type: 'string' },
          description: '本次真实交付物，相对工作区根。粒度判断：装产物的文件夹是为本任务专门建的（如网页/项目专属文件夹）→ 填文件夹路径（如 "web-app/"）；文件只是写进既有或按规范建的目录（如按日期的日常目录）→ 逐个列文件路径。可同时含多个目录与多个文件；没有产出可省略。',
        },
        note: {
          type: 'string',
          description: '可选备注，例如失败原因或关键结论。',
        },
      },
      required: ['status'],
    },
    output: {
      schema: {
        type: 'object',
        additionalProperties: false,
        properties: {
          ok: { type: 'boolean' },
          message: { type: 'string' },
        },
      },
      render: (_args: unknown, value: unknown): { type: 'text'; text: string }[] => [
        { type: 'text', text: (value as ReceiptResult).message },
      ],
    },
    execute: async (args: unknown, exec?: unknown): Promise<ReceiptResult> => {
      try {
        const input = asRecord(args)
        const rawStatus = typeof input.status === 'string' ? input.status : ''
        const status = normalizeStatus(input.status, statuses)
        if (status === undefined) {
          return {
            ok: false,
            message: `回执未提交：status "${rawStatus}" 不在允许值内（只能是 ${statuses.join(' | ')}；`
              + `大小写与首尾空白会自动归一，其余写法一律不认）。请修正参数后重试一次；这是参数错误，不必等待。`,
          }
        }
        const outputs = normalizeOutputs(input.outputs)
        const rawNote = typeof input.note === 'string' ? normalizeText(input.note) : ''
        const note = rawNote.length > 0 ? rawNote : undefined

        const instance = store.get(instanceId)
        if (instance === undefined) {
          return { ok: false, message: `回执未提交：实例 ${instanceId} 不存在。请停止重试并说明情况。` }
        }
        if (!(RECEIPT_ACCEPTING as readonly string[]).includes(instance.status)) {
          return {
            ok: false,
            message: `回执未提交：实例 ${instanceId} 已是终态（${instance.status}），回执不再计入。不必重试。`,
          }
        }
        if (instance.session_id !== sessionId) {
          return {
            ok: false,
            message: `回执未提交：实例当前会话已是 ${instance.session_id ?? 'null'}，本会话无权提交。不必重试。`,
          }
        }

        // 与 submit.ts 写进 receipt 事件的形状完全一致（对账逻辑零改动）：status/outputs/note/session_id。
        store.appendEvent(instanceId, 'receipt', { status, outputs, note, session_id: sessionId })
        logger.info(`回执已记录 ${instanceId}: status=${status}${outputs.length > 0 ? `, outputs=${outputs.length} 项` : ''}`)

        // B 路线：插件代写官方交付事件（决策 40 演进：插件作唯一写入方，禁止 LLM 调 present）。
        // 失败只记日志、绝不拖垮回执（外层 try 已兜底，这里再独立 try 防任何意外上抛）。
        try {
          const execCtx = exec as { agent?: { session?: unknown }; callId?: unknown } | undefined
          const session = execCtx?.agent?.session
          const callId = execCtx?.callId
          const projections = sessionProjections as TurnBoundaryProjection | undefined
          if (session !== undefined && callId !== undefined && projections !== undefined) {
            const boundary = projections.stateOf(session, 'turnBoundary')
            const turn = boundary?.lastTurn
            if (typeof turn === 'number' && turn >= 1) {
              ;(session as { append(type: string, data: unknown): unknown }).append('deliverables/presented', {
                turn,
                callId,
                files: outputs.map((path) => ({ path })),
              })
            } else {
              logger.warn(`交付事件跳过（turnBoundary.lastTurn 缺失）${instanceId}`)
            }
          } else {
            logger.warn(`交付事件跳过（session/callId/sessionProjections 缺失）${instanceId}`)
          }
        } catch (deliverErr) {
          logger.warn(`交付事件写入失败 ${instanceId}: ${String(deliverErr)}`)
        }

        return {
          ok: true,
          message: `回执已记录（${instanceId}，status=${status}`
            + `${outputs.length > 0 ? `，outputs ${outputs.length} 项` : ''}）。任务结束，无需再做任何事。`,
        }
      } catch (error) {
        // 写库异常（连接已关、磁盘满等）：明确告知可重试次数与停止条件（决策 24 提示词策略）。
        logger.warn(`回执写入失败 ${instanceId}: ${String(error)}`)
        return {
          ok: false,
          message: `回执未提交：写入状态库失败（${String(error)}）。`
            + `请等约 10 秒后原样重试，最多 3 次；仍失败就立即停止，不要尝试其他任何手段。`,
        }
      }
    },
  }
}

/**
 * 把回执工具注册进该 agent 的作用域（**只在 setup 里调**——发布前生效，见文件头）。
 * @returns true = 已注册；false = 宿主 agent 作用域未暴露 tools 服务（跳过并告警：
 *   该会话没有回执通道，对账会按「缺回执」收敛，reason 会指向这里）。
 */
export function registerReceiptTool(agentCtx: unknown, deps: ReceiptToolDeps): boolean {
  const tools = (agentCtx as { tools?: ToolRegistry } | undefined)?.tools
  if (tools === undefined || typeof tools.register !== 'function') {
    deps.logger.warn(
      `agent 作用域未暴露 tools 服务，${RECEIPT_TOOL_NAME} 未注册——本会话无法提交回执（决策 24）`,
    )
    return false
  }
  try {
    tools.register(buildDefinition(deps))
    return true
  } catch (error) {
    deps.logger.warn(`注册工具 ${RECEIPT_TOOL_NAME} 失败: ${String(error)}`)
    return false
  }
}

/**
 * 回执调用说明（派发消息与追问消息共用）。写给模型看：**传什么、失败怎么办、什么时候必须停**。
 *
 * ⚠️ 刻意不提供任何替代通道（不跑命令、不写库、不碰沙箱）——真机上 agent 曾自行 `chmod`、
 * 拷库、改用 sqlite3/node 绕道，全是无效动作（沙箱层面就不可能成功），白烧 token。
 */
export function receiptInstruction(validStatuses: readonly string[]): string {
  const statuses = receiptStatuses(validStatuses)
  // ⚠️ 写法原则（用户 2026-09-30 拍板 + 真机证据，改前 10 行、改后 7 行）：
  // ① 只讲这一件事，**越短越硬**（长段会被模型当背景噪音忽略）；
  // ② 把"压过任务指令"写成**显式优先级裁决句** —— 模型对"最高优先级"这种形容词不敏感，对"谁跟谁冲突、
  //    以谁为准"的裁决句敏感；
  // ③ 时机写成「**本轮回复结束前**」——真机失败正是"回了一句就当收工"；
  // ④ 本段**只在派发消息最末出现一处**（同一条指令出现两处，模型会挑最弱的一处遵守）。
  // 具体的 outputs 填写粒度挪进**工具描述**（模型看得到、且常驻上下文），本段不重复。
  return [
    `【回执·唯一权威段】本轮回复结束前，必须调用一次 ${RECEIPT_TOOL_NAME}。`,
    `⚖️ 冲突裁决：任务提示词里任何「不要做其他操作 / 只做某件事 / 什么都不用做 / 只回复一句话」的说法，`
      + `对回执**不生效**——它约束的是任务内容，不约束回执。不提交 = 本次任务失败。`,
    `- 没有产出文件也要交（省略 outputs）。`,
    `${RECEIPT_TOOL_NAME}({ status: "${statuses[0] ?? 'ok'}", outputs: ["<产物，相对工作区根路径>"] })`,
    `- status 只能取：${statuses.join(' | ')}（如实填写）。`,
    `- 调用失败：等 10 秒**原样重试**，最多 3 次；仍失败就**停下**（不要跑命令、不要动状态库、不要绕过沙箱）。`,
    `- 不要调用 present：交付卡片由插件按 outputs 统一生成。`,
  ].join('\n')
}
