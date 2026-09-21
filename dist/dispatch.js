// 派发：ctx.sessions.create（供 id）→ ctx.agents.create 驱动模型 → agent.send 拼装消息。
// 派发不走 sessions.create 直驱——它只建存储会话不驱动模型（决策 15，core/agent/src/index.ts:62-119）。
import { randomUUID } from 'node:crypto';
/**
 * 工作区名 → 绝对路径。registry 无按 name 查询 API
 * （packages/workspace/workspace/src/index.ts:157-305），遍历 list() 比对：
 * title 精确匹配优先，id 兜底（WorkspaceEntity title/path 见 entity.ts:79-91）。
 */
export function resolveWorkspacePath(ctx, name) {
    const workspaces = ctx.workspaceRegistry.list();
    const hit = workspaces.find(workspace => workspace.title === name)
        ?? workspaces.find(workspace => workspace.id === name);
    if (hit === undefined) {
        throw new Error(`找不到工作区 "${name}"（已注册: ${workspaces.map(workspace => workspace.title).join(', ')}）`);
    }
    return hit.path;
}
/** 派发消息拼装（决策 12 模板：短指令 prompt + 手册路径 + 契约文件要求）。 */
export function buildMessage(task, workspacePath, logicalDate) {
    const lines = [task.target.prompt, '', `任务实例：${task.id} · ${logicalDate}（目标工作区：${workspacePath}）`];
    if (task.target.manual !== undefined) {
        lines.push(`任务手册：先读工作区内 ${task.target.manual}，再按手册执行。`);
    }
    lines.push(`产物契约：完成后把契约 JSON 写到工作区内 ${task.contract.path}，`
        + `至少含 "status" 字段（合法值：${task.contract.validStatuses.join(' | ')}）。status 必须如实。`);
    return {
        id: randomUUID(),
        role: 'user',
        content: [{ type: 'text', text: lines.join('\n') }],
        source: {
            kind: 'plugin',
            plugin: 'dsh-task-dispatch-table',
            form: 'notice',
            summary: `[TASK] ${task.id} · ${logicalDate}`,
        },
    };
}
/**
 * 派发一个已 CAS 领取的实例。同步段（写 session_id → sessions.create）不 await，
 * 保证 session/created 同步 emit（core/session/src/index.ts:50）时实例已带 session_id，
 * 事件对账可立即转 running。
 */
export async function dispatchTask(input) {
    const { ctx, store, task, instanceId, logicalDate, workspacePath } = input;
    const sessionId = randomUUID();
    // 领取后先把会话身份落到实例行，再建会话——同 tick 同步顺序，无中间态外泄。
    store.transition(instanceId, { status: 'dispatched', session_id: sessionId, detail: 'assign-session' });
    const session = ctx.sessions.create(sessionId);
    // agentOptions.model 仅在任务定义给出时传；provider/model 缺省语义 = 宿主默认路由
    // （core/agent/src/runtime-types.ts:26-35）。
    const handle = await ctx.agents.create({
        sessionId,
        meta: { cwd: workspacePath },
        agentOptions: task.target.model === undefined ? undefined : { model: task.target.model },
    });
    // 会话列表治理（PROGRESS「会话列表治理策略」）：规范名 + 跑完归档（归档在 succeeded 对账后）。
    try {
        ctx.sessionTitle.rename(session, `[TASK] ${task.id} · ${logicalDate}`);
    }
    catch (error) {
        ctx.logger.warn(`会话改名失败 ${sessionId}: ${String(error)}`);
    }
    store.appendEvent(instanceId, 'dispatch', { sessionId, workspacePath });
    handle.agent.send(buildMessage(task, workspacePath, logicalDate), 'next-turn', true);
}
