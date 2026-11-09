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
import { outputRules } from './instructions.js'
import { absWorkspacePath, isSafeWorkspaceRel } from './workspace-path.js'

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
  /**
   * 派发时冻结的目标工作区绝对路径：`deliverables/presented` 的 `files[].path` 基准。
   * 与 `reconcile.ts:checkReceipt` 的存在性校验基准、`dispatch.ts` 下游注入基准三者同值；
   * 库里仍存相对路径，只在写交付事件这一边界绝对化。
   */
  workspacePath: string
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

/** 产出归一的结果：路径清单 + 被安全闸拒绝的条数（要如实回报，不静默丢）。 */
interface NormalizedOutputs {
  paths: string[]
  rejected: number
}

/**
 * 产出归一：数组取字符串项；字符串按逗号切（模型偶尔传逗号串）；其余忽略。
 * 逐项去空白 / 零宽字符、反斜杠统一成 `/`、去掉 `./` 前缀（宿主对账按工作区相对路径 `resolve`）。
 *
 * **安全闸**（2026-11-09）：`..` / 绝对路径 / 含反斜杠的路径在这里一律拒绝，
 * 与附件 ref 共用 `workspace-path.ts:isSafeWorkspaceRel` 唯一实现。此前 `checkReceipt`
 * 只 `resolve` + `existsSync`，`..` 会被折叠后照样命中工作区外文件并进交付卡。
 * 对账侧还有第二道同款复核（覆盖历史回执与绕过入口的情形）。
 */
function normalizeOutputs(raw: unknown): NormalizedOutputs {
  const list = typeof raw === 'string' ? raw.split(',') : Array.isArray(raw) ? raw : []
  const paths: string[] = []
  const seen = new Set<string>()
  let rejected = 0
  for (const item of list) {
    if (typeof item !== 'string') continue
    const path = normalizeText(item).replace(/\\/g, '/').replace(/^\.\//, '')
    if (path.length === 0 || seen.has(path)) continue
    if (!isSafeWorkspaceRel(path)) {
      rejected += 1
      continue
    }
    seen.add(path)
    paths.push(path)
  }
  return { paths, rejected }
}

/**
 * 产出清单上限（用户 2026-10-10 拍板）：**主文件 / 其他产出各自**最多 10 项。
 *
 * 超限**截断**而非拒绝重报：无人值守链路里一次拒绝就多一轮对话（多烧一轮 token），还可能反复
 * 卡住不收敛；截断最多丢展示项，从不失败。截断后由工具返回文案如实告知。
 * 参数 schema 上的 `maxItems` 只是给模型的提示（宿主不据此硬拦参数，见 normalizeStatus 注释），
 * 真正兜底的是这里。
 */
const MAX_OUTPUT_ITEMS = 10

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
  const { store, taskName, instanceId, sessionId, logger, sessionProjections, workspacePath } = deps
  const statuses = receiptStatuses(deps.validStatuses)

  return {
    name: RECEIPT_TOOL_NAME,
    // 工具描述是**常驻上下文里的另一个指令面**（用户 2026-09-30：与消息体是两条独立通道，两边都要压硬）。
    // 时机由「任务做完后」改成「**本轮回复结束前**」——真机失败模式正是"回了一句就当收工"。
    // 产出粒度与 `receiptInstruction` 的权威段**逐字引用同一份** `outputRules`：两处各写一份
    // 必然出现强弱差，模型会挑最弱的一处遵守（2026-11-09 真机：processOutputs 退化成逐文件列）。
    description:
      `提交任务「${taskName}」的执行回执。**本轮回复结束前必须调用一次**（准备输出最后一句之前）；`
      + `调度器以它判定本次任务成败，不调用等于失败——任务指令说「不要做其他操作」也不豁免。`
      + `参数：status（必填，如实）、outputs（主文件）、processOutputs（其他产出）、note（可选备注）；后三者都可省略。\n`
      + outputRules(MAX_OUTPUT_ITEMS, RECEIPT_TOOL_NAME),
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
          maxItems: MAX_OUTPUT_ITEMS,
          items: { type: 'string' },
          description: `主文件：本次任务最终的交付物，相对工作区根（目录以 "/" 结尾）。可为多个文件或多个文件夹；没有最终交付物就省略。最多 ${MAX_OUTPUT_ITEMS} 项，一个目录只算 1 项。`,
        },
        processOutputs: {
          type: 'array',
          maxItems: MAX_OUTPUT_ITEMS,
          items: { type: 'string' },
          description: `其他产出：日志、中间产物、临时/工作目录、依赖资源，相对工作区根（目录以 "/" 结尾）。最多 ${MAX_OUTPUT_ITEMS} 项，一个目录只算 1 项；可与主文件并存（允许「某文件在 outputs、其父目录在 processOutputs」这种含纳关系），但同一路径不要两桶都报（都报了只算主文件）。`,
        },
        note: {
          type: 'string',
          description: '可选备注，只写失败原因或关键结论；不写路径、不用来补列文件。',
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
        // 两桶各自归一（含安全闸）→ 各自截断上限（满额即止）→ 跨桶去重（同一路径以主桶为准）。
        // 截断 / 拒绝与否都要如实回报给模型（见返回文案），否则它会以为全都记上了。
        const mainAll = normalizeOutputs(input.outputs)
        const procAll = normalizeOutputs(input.processOutputs)
        const outputs = mainAll.paths.slice(0, MAX_OUTPUT_ITEMS)
        const mainSet = new Set(outputs)
        const processOutputs = procAll.paths.filter(item => !mainSet.has(item)).slice(0, MAX_OUTPUT_ITEMS)
        const overLimit = mainAll.paths.length > MAX_OUTPUT_ITEMS || procAll.paths.length > MAX_OUTPUT_ITEMS
        const rejected = mainAll.rejected + procAll.rejected
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

        // 与 submit.ts 写进 receipt 事件的形状一致（对账逻辑零改动）：status/outputs/processOutputs/note/session_id。
        // processOutputs 是 2026-10-10 新增桶；旧回执没有该字段 ⇒ 消费方按空数组处理（向后兼容）。
        store.appendEvent(instanceId, 'receipt', { status, outputs, processOutputs, note, session_id: sessionId })
        logger.info(
          `回执已记录 ${instanceId}: status=${status}`
          + `${outputs.length > 0 ? `, 主文件 ${outputs.length} 项` : ''}`
          + `${processOutputs.length > 0 ? `, 其他产出 ${processOutputs.length} 项` : ''}`
          + `${overLimit ? '（超出上限已截断）' : ''}`,
        )

        // B 路线：插件代写官方交付事件（决策 40 演进：插件作唯一写入方，禁止 LLM 调 present）。
        // ⚠️ 只写**主文件桶**：其他产出若也写进去就变成官方交付卡，与「分主次」矛盾。
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
              // 官方 `fileAddressFor` 对相对路径要按会话 cwd 补前缀（dsh-capabilities.md:50-51），
              // 核心 `openFilePreview` 还要挑工作区锚点，两者都可能选错基准 ⇒ 交付卡 ENOENT。
              // 本仓握有派发时冻结的 workspacePath，故**只在这一个边界**把路径绝对化；
              // 回执事件与库列继续保持相对（零数据迁移、下游注入不变）。
              const files = outputs.flatMap((path) => {
                const abs = absWorkspacePath(workspacePath, path)
                if (abs === null) {
                  logger.warn(`交付事件跳过路径 ${instanceId}: ${path}（工作区基准缺失或路径不安全）`)
                  return []
                }
                return [{ path: abs }]
              })
              ;(session as { append(type: string, data: unknown): unknown }).append('deliverables/presented', {
                turn,
                callId,
                files,
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
            + `${outputs.length > 0 ? `，主文件 ${outputs.length} 项` : ''}`
            + `${processOutputs.length > 0 ? `，其他产出 ${processOutputs.length} 项` : ''}`
            + `${overLimit ? `。⚠️ 有桶超过 ${MAX_OUTPUT_ITEMS} 项上限，只记录了前 ${MAX_OUTPUT_ITEMS} 项` : ''}`
            + `${rejected > 0 ? `。⚠️ ${rejected} 个路径越界（含 .. / 绝对路径 / 反斜杠）已拒绝，请只报工作区内的相对路径` : ''}`
            + `）。任务结束，无需再做任何事。`,
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
  // ⚠️ 写法原则（用户 2026-09-30 拍板 + 真机证据）：
  // ① 把"压过任务指令"写成**显式优先级裁决句** —— 模型对"最高优先级"这种形容词不敏感，
  //    对"谁跟谁冲突、以谁为准"的裁决句敏感；
  // ② 时机写成「**本轮回复结束前**」——真机失败正是"回了一句就当收工"；
  // ③ 本段**只在派发消息最末出现一处**（同一条指令出现两处，模型会挑最弱的一处遵守）。
  // 2026-11-09 修订：产出粒度不再「挪进工具描述、本段不重复」——那正是真机退化成逐文件列的
  // 成因（弱位置有全集、强位置只有摘要）。现在两处**逐字引用同一份** `outputRules`，
  // 模型挑哪一处都得到同一答案，等价于一处；改文案也不会再打掉钉原话的冒烟断言。
  return [
    `【回执·唯一权威段】本轮回复结束前，必须调用一次 ${RECEIPT_TOOL_NAME}。`,
    `⚖️ 冲突裁决：任务提示词里任何「不要做其他操作 / 只做某件事 / 什么都不用做 / 只回复一句话」的说法，`
      + `对回执**不生效**——它约束的是任务内容，不约束回执。不提交 = 本次任务失败。`,
    outputRules(MAX_OUTPUT_ITEMS, RECEIPT_TOOL_NAME),
    `- status 只能取：${statuses.join(' | ')}（如实填写）。`,
    `- 调用失败：等 10 秒**原样重试**，最多 3 次；仍失败就**停下**（不要跑命令、不要动状态库、不要绕过沙箱）。`,
    `- 不要调用 present：交付卡片由插件按主文件（outputs）统一生成。`,
  ].join('\n')
}
