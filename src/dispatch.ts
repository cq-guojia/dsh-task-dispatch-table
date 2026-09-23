// 派发：assign-session 落库 → ctx.agents.create 驱动模型（内部自建会话：sessions.prepare +
// enter + announce，core/agent-loop/src/index.ts:767、core/session/src/index.ts:969-979）
// → agent.send 拼装消息。不要预建 ctx.sessions.create——会撞 store 的
// 'session "…" already exists'（core/session/src/index.ts:1009，真机教训 2026-09-23）。
import { randomUUID } from 'node:crypto'
import { fileURLToPath } from 'node:url'
import type { HostContext, UserMessage } from './host.js'
import type { TaskDefinition } from './tasks.js'
import type { TaskStore } from './store.js'

/** 回执提交程序（决策 19）：与本文件同在 dist/，运行期按自身位置定位（包 type=module，.js 即 ESM）。 */
export const SUBMIT_JS = fileURLToPath(new URL('./submit.js', import.meta.url))

/**
 * 工作区名 → 绝对路径。registry 无按 name 查询 API
 * （packages/workspace/workspace/src/index.ts:157-305），遍历 list() 比对：
 * title 精确匹配优先，id 兜底（WorkspaceEntity title/path 见 entity.ts:79-91）。
 */
export function resolveWorkspacePath(ctx: HostContext, name: string): string {
  const workspaces = ctx.workspaceRegistry.list()
  const hit = workspaces.find(workspace => workspace.title === name)
    ?? workspaces.find(workspace => workspace.id === name)
  if (hit === undefined) {
    throw new Error(`找不到工作区 "${name}"（已注册: ${workspaces.map(workspace => workspace.title).join(', ')}）`)
  }
  return hit.path
}

/**
 * 回执提交命令行（决策 19）：--db/--task/--date/--session 由调度器填好，
 * agent 只补 --status 与 --outputs。派发消息与追问消息共用同一拼装。
 */
export function submitCommand(
  task: TaskDefinition,
  logicalDate: string,
  sessionId: string,
  statePath: string,
): string {
  return [
    `node "${SUBMIT_JS}"`,
    `--db "${statePath}"`,
    `--task "${task.id}"`,
    `--date "${logicalDate}"`,
    `--session "${sessionId}"`,
    `--status ${task.contract.validStatuses[0] ?? 'ok'}`,
    `--outputs "<实际产出的文件，相对工作区路径，多个用英文逗号分隔；无产出可省略整个参数>"`,
  ].join(' ')
}

/** 插件→会话的用户消息（决策 19：追问层用，form=notice 走系统通知样式）。 */
export function userNotice(text: string, summary: string): UserMessage {
  return {
    id: randomUUID(),
    role: 'user',
    content: [{ type: 'text', text }],
    source: {
      kind: 'plugin',
      plugin: 'dsh-task-dispatch-table',
      form: 'notice',
      summary,
    },
  }
}

/**
 * 派发消息拼装（决策 12 模板 + 决策 19 回执命令）：短指令 prompt + 手册路径
 * + 现成的回执提交命令行（submitCommand 拼装，agent 只补 --status 与 --outputs）。
 */
export function buildMessage(
  task: TaskDefinition,
  workspacePath: string,
  logicalDate: string,
  sessionId: string,
  statePath: string,
): UserMessage {
  const lines = [task.target.prompt, '', `任务实例：${task.id} · ${logicalDate}（目标工作区：${workspacePath}）`]
  if (task.target.manual !== undefined) {
    lines.push(`任务手册：先读工作区内 ${task.target.manual}，再按手册执行。`)
  }
  lines.push(
    `回执（必须）：全部完成后执行下面这条命令提交回执，调度器以回执判定任务成败：`,
    submitCommand(task, logicalDate, sessionId, statePath),
    `--status 只能填：${task.contract.validStatuses.join(' | ')}（必须如实）。`
      + `未提交回执的任务会被追问，追问后仍无回执按失败处理。`,
  )
  return userNotice(lines.join('\n'), `[TASK] ${task.id} · ${logicalDate}`)
}

export interface DispatchInput {
  ctx: HostContext
  store: TaskStore
  task: TaskDefinition
  /** 已领取实例：形如 "<task_id>:<logical_date>"，状态应为 dispatched。 */
  instanceId: string
  logicalDate: string
  workspacePath: string
  /** 状态库绝对路径（决策 19）：拼进回执命令行，agent 侧零环境猜测。 */
  statePath: string
}

/** agent handle：ctx.agents.create 的返回（追问时用于再推一轮对话）。 */
export type AgentHandle = Awaited<ReturnType<HostContext['agents']['create']>>

/**
 * 派发一个已 CAS 领取的实例。同步段先落 session_id 再 await agents.create：
 * 会话由 factory 内部创建并 announce session/created（AgentFactory 契约），晚于
 * assign-session，事件对账收到时实例必已带 session_id，可立即转 running。
 * 会话改名在 reconciler.onCreated 做——此处拿不到 Session 对象（handle 只有 agent）。
 * @returns sessionId 与 agent handle——handle 供对账层超时追问（决策 19 第二层）。
 */
export async function dispatchTask(input: DispatchInput): Promise<{ sessionId: string; handle: AgentHandle }> {
  const { ctx, store, task, instanceId, logicalDate, workspacePath, statePath } = input
  const sessionId = randomUUID()
  // 领取后先把会话身份落到实例行，再建 agent——session/created（factory announce）
  // 到达时实例必已带 session_id，对账可立即转 running。
  store.transition(instanceId, { status: 'dispatched', session_id: sessionId, detail: 'assign-session' })

  // agentOptions.model 仅在任务定义给出时传；provider/model 缺省语义 = 宿主默认路由
  // （core/agent/src/runtime-types.ts:26-35）。会话由本调用自建，禁止预建（见文件头）。
  const handle = await ctx.agents.create({
    sessionId,
    meta: { cwd: workspacePath },
    agentOptions: task.target.model === undefined ? undefined : { model: task.target.model },
  })

  store.appendEvent(instanceId, 'dispatch', { sessionId, workspacePath })
  // 会话列表治理：规范名在 reconciler.onCreated 改，跑完归档在 succeeded 对账后。
  handle.agent.send(buildMessage(task, workspacePath, logicalDate, sessionId, statePath), 'next-turn', true)
  return { sessionId, handle }
}
