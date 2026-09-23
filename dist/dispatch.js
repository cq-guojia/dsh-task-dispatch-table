// 派发（决策 22）：模型漏斗解析 → assign-session 落库 → ctx.agents.create 驱动模型
// （内部自建会话：sessions.prepare + enter + announce）→ 工作区 attachSession 归组
// → agent.send 拼装消息。不要预建 ctx.sessions.create——会撞 store 的
// 'session "…" already exists'（真机教训 2026-09-23）。
import { randomUUID } from 'node:crypto';
import { fileURLToPath } from 'node:url';
/** 回执提交程序（决策 19）：与本文件同在 dist/，运行期按自身位置定位（包 type=module，.js 即 ESM）。 */
export const SUBMIT_JS = fileURLToPath(new URL('./submit.js', import.meta.url));
/**
 * 派发前置条件失败（决策 22）：scheduler 按具体 reason 收敛实例，而非笼统 dispatch-error。
 * reason 取值：no-model-route / workspace-attach-failed。
 */
export class DispatchPreconditionError extends Error {
    reason;
    constructor(reason, message) {
        super(message);
        this.reason = reason;
        this.name = 'DispatchPreconditionError';
    }
}
/**
 * 工作区名 → 工作区实体（决策 22：target.workspace 语义是**工作区**，不是工作目录；
 * 目录由实体 path 派生）。registry 无按 name 查询 API，遍历 list() 比对：
 * title 精确匹配优先，id 兜底。匹配不到即抛错 ⇒ 任务判失败，绝不落到「未分组」或随便找个目录跑。
 */
export function resolveWorkspace(ctx, name) {
    const workspaces = ctx.workspaceRegistry.list();
    const hit = workspaces.find(workspace => workspace.title === name)
        ?? workspaces.find(workspace => workspace.id === name);
    if (hit === undefined) {
        throw new Error(`找不到工作区 "${name}"（任务必须挂在一个已注册工作区下；已注册: ${workspaces.map(workspace => workspace.title).join(', ') || '(无)'}）`);
    }
    return hit;
}
/**
 * provider 反查：在已注册 provider 里找第一个能发现该 model 的。
 * 宿主明示模型目录是 advisory（未列出不等于不可用），故本函数只用于「补全」，
 * 查不到时由调用方继续下漏，而不是把这一层判成非法。
 */
async function lookupProvider(llm, model, logger, label) {
    for (const provider of llm.listProviders()) {
        try {
            const models = await llm.listModels(provider.id);
            if (models.some(item => item.id === model))
                return provider.id;
        }
        catch (error) {
            logger.warn(`${label} 反查 provider 时读取 ${provider.id} 模型目录失败: ${String(error)}`);
        }
    }
    return undefined;
}
/** 解析漏斗的一层：成对直接用；只给 model 则反查 provider；只给 provider 或反查失败 → 跳过该层。 */
async function resolveLayer(ctx, logger, source, label, candidate) {
    const provider = candidate.provider.trim();
    const model = candidate.model.trim();
    if (provider.length === 0 && model.length === 0)
        return undefined;
    if (model.length === 0) {
        logger.warn(`${label} 配了 provider 但没有 model（须成对）→ 跳过该层`);
        return undefined;
    }
    if (provider.length > 0)
        return { provider, model, source };
    const llm = ctx.get('llm');
    if (llm === undefined) {
        logger.warn(`${label} 只给了 model "${model}"，但宿主未挂载 llm 服务、无法反查 provider → 跳过该层`);
        return undefined;
    }
    const found = await lookupProvider(llm, model, logger, label);
    if (found === undefined) {
        logger.warn(`${label} 只给了 model "${model}"，已注册 provider 中未反查到（模型目录为 advisory）→ 跳过该层`);
        return undefined;
    }
    return { provider: found, model, source };
}
/**
 * 模型解析漏斗（决策 22）：逐层下漏，四层全空返回 undefined（调用方判任务失败，不派发）。
 *
 * ① 任务定义 target.provider/target.model
 * ② 插件配置 defaultProvider/defaultModel
 * ③ 宿主默认 ctx.get('agentDefaultModel').currentSelection()（= 用户配的 / 上次用的模型）
 * ④ llm 首个可用：listProviders() 首个能列出模型的 provider + 其首个模型
 *
 * ⚠️ 只在派发时现算，**绝不回写**任务定义或配置：用户日后换模型要能自动跟上，
 * 在配置期固化等于自己废掉兜底。
 */
export async function resolveModelRoute(ctx, logger, task, config) {
    const fromTask = await resolveLayer(ctx, logger, 'task', `任务 ${task.id} 的 target`, {
        provider: task.target.provider ?? '',
        model: task.target.model ?? '',
    });
    if (fromTask !== undefined)
        return fromTask;
    const fromConfig = await resolveLayer(ctx, logger, 'plugin-config', '插件配置 defaultProvider/defaultModel', {
        provider: config.defaultProvider,
        model: config.defaultModel,
    });
    if (fromConfig !== undefined)
        return fromConfig;
    const hostDefault = ctx.get('agentDefaultModel');
    if (hostDefault !== undefined) {
        try {
            const route = hostDefault.currentSelection();
            if (typeof route?.provider === 'string' && route.provider.length > 0
                && typeof route.model === 'string' && route.model.length > 0) {
                return { provider: route.provider, model: route.model, source: 'host-default' };
            }
            logger.warn('宿主 agentDefaultModel 未给出可用的 provider/model → 继续下漏');
        }
        catch (error) {
            logger.warn(`读取宿主默认模型失败: ${String(error)}`);
        }
    }
    const llm = ctx.get('llm');
    if (llm !== undefined) {
        for (const provider of llm.listProviders()) {
            try {
                const first = (await llm.listModels(provider.id))[0];
                if (first !== undefined)
                    return { provider: provider.id, model: first.id, source: 'llm-first' };
            }
            catch (error) {
                logger.warn(`llm 首个可用模型探测失败 ${provider.id}: ${String(error)}`);
            }
        }
    }
    logger.warn(`任务 ${task.id} 四层模型漏斗全部落空（决策 22）：请在 target 或插件配置里指定 provider+model`);
    return undefined;
}
/**
 * 回执提交命令行（决策 19）：--db/--task/--date/--session 由调度器填好，
 * agent 只补 --status 与 --outputs。派发消息与追问消息共用同一拼装。
 */
export function submitCommand(task, logicalDate, sessionId, statePath) {
    return [
        `node "${SUBMIT_JS}"`,
        `--db "${statePath}"`,
        `--task "${task.id}"`,
        `--date "${logicalDate}"`,
        `--session "${sessionId}"`,
        `--status ${task.contract.validStatuses[0] ?? 'ok'}`,
        `--outputs "<实际产出的文件，相对工作区路径，多个用英文逗号分隔；无产出可省略整个参数>"`,
    ].join(' ');
}
/** 插件→会话的用户消息（决策 19：追问层用，form=notice 走系统通知样式）。 */
export function userNotice(text, summary) {
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
    };
}
/**
 * 派发消息拼装（决策 12 模板 + 决策 19 回执命令）：短指令 prompt + 手册路径
 * + 现成的回执提交命令行（submitCommand 拼装，agent 只补 --status 与 --outputs）。
 */
export function buildMessage(task, workspacePath, logicalDate, sessionId, statePath) {
    const lines = [task.target.prompt, '', `任务实例：${task.id} · ${logicalDate}（目标工作区：${workspacePath}）`];
    if (task.target.manual !== undefined) {
        lines.push(`任务手册：先读工作区内 ${task.target.manual}，再按手册执行。`);
    }
    lines.push(`回执（必须）：全部完成后执行下面这条命令提交回执，调度器以回执判定任务成败：`, submitCommand(task, logicalDate, sessionId, statePath), `--status 只能填：${task.contract.validStatuses.join(' | ')}（必须如实）。`
        + `未提交回执的任务会被追问，追问后仍无回执按失败处理。`);
    return userNotice(lines.join('\n'), `[TASK] ${task.id} · ${logicalDate}`);
}
/**
 * 派发一个已 CAS 领取的实例（决策 22 顺序）：
 * 解析模型漏斗 → 落 session_id → agents.create（自建会话并 announce session/created，
 * 晚于 assign-session，对账收到时实例必已带 session_id）→ **工作区 attachSession 归组**
 * → 落 dispatch 事件（含本次实测 route 与命中层级）→ send。
 * 会话改名在 reconciler.onCreated 做——此处拿不到 Session 对象（handle 只有 agent）。
 * @returns sessionId 与 agent handle——handle 供对账层超时追问（决策 19 第二层）。
 * @throws DispatchPreconditionError 模型解析不出、或会话建好后无法归组工作区。
 */
export async function dispatchTask(input) {
    const { ctx, logger, store, task, instanceId, logicalDate, workspace, statePath, config } = input;
    const route = await resolveModelRoute(ctx, logger, task, config);
    if (route === undefined) {
        // 前置条件不足：不建会话、不派发（先于 session_id 落库，实例行不留假 session）。
        throw new DispatchPreconditionError('no-model-route', `任务 ${task.id} 无法解析出 provider+model，不派发（决策 22 漏斗四层全空）`);
    }
    const sessionId = randomUUID();
    // 领取后先把会话身份落到实例行，再建 agent——session/created（factory announce）
    // 到达时实例必已带 session_id，对账可立即转 running。
    store.transition(instanceId, { status: 'dispatched', session_id: sessionId, detail: 'assign-session' });
    // provider/model 必须成对显式传（决策 22）：宿主缺省不填 {{model}}，deployment persona
    // 里的 {{model}} 取不到值会直接抛错、本轮秒结束。会话由本调用自建，禁止预建（见文件头）。
    const handle = await ctx.agents.create({
        sessionId,
        meta: { cwd: workspace.path },
        agentOptions: { provider: route.provider, model: route.model },
    });
    // 归组（决策 22）：只设 meta.cwd 不会进工作区 sessionIds，必须显式 attach；
    // attach 内部要求 session header 的 cwd 归一后 === workspace.path，故 cwd 只能取自本实体。
    try {
        await workspace.attachSession(sessionId);
    }
    catch (error) {
        void handle.dispose().catch(() => { });
        throw new DispatchPreconditionError('workspace-attach-failed', `会话 ${sessionId} 已建立但无法归入工作区 "${workspace.title}"（${workspace.path}）: ${String(error)}`);
    }
    // route/source 落事件：只记本次实测用了什么，不回写任务定义或配置。
    store.appendEvent(instanceId, 'dispatch', {
        sessionId,
        workspacePath: workspace.path,
        provider: route.provider,
        model: route.model,
        modelSource: route.source,
    });
    // 会话列表治理：规范名在 reconciler.onCreated 改，跑完归档在 succeeded 对账后。
    handle.agent.send(buildMessage(task, workspace.path, logicalDate, sessionId, statePath), 'next-turn', true);
    return { sessionId, handle };
}
