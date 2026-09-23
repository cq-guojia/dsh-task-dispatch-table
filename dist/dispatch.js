// 派发（决策 22 + 23 + 24）：模型漏斗解析 + 部署默认 preset 解析 → assign-session 落库
// → ctx.agents.create 驱动模型（内部自建会话：sessions.prepare + enter + announce；setup 里
//   mount preset（工具/提示词/skill 跟随系统）+ 注册本任务专属的回执工具（receipt.ts））
// → 工作区 attachSession 归组 → agent.send 拼装消息。
// 不要预建 ctx.sessions.create——会撞 store 的 'session "…" already exists'（真机教训 2026-09-23）。
import { randomUUID } from 'node:crypto';
import { receiptInstruction, registerReceiptTool } from './receipt.js';
/**
 * 派发前置条件失败（决策 22 / 决策 23）：scheduler 按具体 reason 收敛实例，而非笼统 dispatch-error。
 * reason 取值：no-model-route / agent-create-failed / receipt-tool-unavailable / workspace-attach-failed。
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
 * 解析「与用户新建会话相同」的 agent 组装方式（决策 23）：取**部署默认** preset
 * （`resolve()` 省略 id = settings 的 selectionPolicy().defaultId，热读）。
 *
 * preset 决定 agent 的**工具、prompt sections、skill 目录**（含工作区 AGENTS.md 注入）。
 * 不挂 preset 的 agent 落到「空的全局层」——真机实测只剩下根作用域的 MCP 工具，fs/bash 全无。
 * 这里没有任何硬编码工具清单：部署往 preset 的 composition 里加什么，派发的会话就有什么。
 *
 * @returns 组装方式；presets 服务未挂载、或部署无可用 preset（rosterless）时返回 undefined
 * ——那种部署下这些行住在宿主 composition 的全局层，不挂也看得见，故**跳过而非判失败**。
 */
async function resolveAgentComposition(ctx, logger, task) {
    const presets = ctx.get('agentPresets');
    if (presets === undefined) {
        logger.warn(`任务 ${task.id}: 宿主未挂载 agentPresets 服务，按 rosterless 处理（工具/提示词取全局层）`);
        return undefined;
    }
    try {
        const { id } = await presets.resolve();
        return { presets, presetId: id };
    }
    catch (error) {
        logger.warn(`任务 ${task.id}: 解析部署默认 preset 失败，按 rosterless 处理: ${String(error)}`);
        return undefined;
    }
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
 * 派发消息拼装（决策 12 模板 + 决策 24 回执工具）：短指令 prompt + 手册路径 + 回执调用说明。
 * 回执不再走命令行（决策 24）——说明文案见 receipt.ts，含「失败重试 ≤3 次、仍失败立即停止」的硬策略。
 */
export function buildMessage(task, workspacePath, logicalDate) {
    const lines = [task.target.prompt, '', `任务实例：${task.id} · ${logicalDate}（目标工作区：${workspacePath}）`];
    if (task.target.manual !== undefined) {
        lines.push(`任务手册：先读工作区内 ${task.target.manual}，再按手册执行。`);
    }
    lines.push(receiptInstruction(task));
    return userNotice(lines.join('\n'), `[TASK] ${task.id} · ${logicalDate}`);
}
/**
 * 派发一个已 CAS 领取的实例（决策 22 顺序 + 决策 23 preset 组装）：
 * 解析模型漏斗 → **解析部署默认 preset** → 落 session_id → agents.create（自建会话并
 * announce session/created，晚于 assign-session，对账收到时实例必已带 session_id；preset 在
 * create 的 setup 里 mount，工具/prompt sections/skill 由此挂上）→ **工作区 attachSession 归组**
 * → 落 dispatch 事件（含本次实测 route、命中层级与 preset）→ send。
 * 会话改名在 reconciler.onCreated 做——此处拿不到 Session 对象（handle 只有 agent）。
 * @returns sessionId 与 agent handle——handle 供对账层超时追问（决策 19 第二层）。
 * @throws DispatchPreconditionError 模型解析不出、会话建不起来（含 preset 挂载失败）、
 *   或会话建好后无法归组工作区。
 */
export async function dispatchTask(input) {
    const { ctx, logger, store, task, instanceId, logicalDate, workspace, config } = input;
    const route = await resolveModelRoute(ctx, logger, task, config);
    if (route === undefined) {
        // 前置条件不足：不建会话、不派发（先于 session_id 落库，实例行不留假 session）。
        throw new DispatchPreconditionError('no-model-route', `任务 ${task.id} 无法解析出 provider+model，不派发（决策 22 漏斗四层全空）`);
    }
    // 组装方式（决策 23）：部署默认 preset——与用户在 UI 新建会话同一套。
    const composition = await resolveAgentComposition(ctx, logger, task);
    const sessionId = randomUUID();
    // 领取后先把会话身份落到实例行，再建 agent——session/created（factory announce）
    // 到达时实例必已带 session_id，对账可立即转 running。
    store.transition(instanceId, { status: 'dispatched', session_id: sessionId, detail: 'assign-session' });
    // provider/model 必须成对显式传（决策 22）：宿主缺省不填 {{model}}，deployment persona
    // 里的 {{model}} 取不到值会直接抛错、本轮秒结束。会话由本调用自建，禁止预建（见文件头）。
    // setup（决策 23）是**唯一**能挂上模型可见层（工具 / prompt sections / skill）的时机：
    // 在 mint agentCtx 之后、发布之前。抛错则工厂回滚作用域、会话与 agent 都不发布，故这里
    // 撤回占位 session_id——实例行不留一个从未发布过的会话身份。
    let handle;
    try {
        handle = await ctx.agents.create({
            sessionId,
            meta: {
                cwd: workspace.path,
                ...(composition === undefined ? {} : { agentPreset: composition.presetId }),
            },
            agentOptions: { provider: route.provider, model: route.model },
            // setup 是发布前唯一能组装 agent 作用域的时机（决策 23 / 24）：
            // ① 挂 preset（工具 / prompt sections / skill 跟随系统）；② 注册本任务专属的回执工具
            // （per-agent，只对该会话可见；execute 在插件进程内写库，绕开 agent 沙箱——决策 24）。
            setup: async (agentCtx) => {
                if (composition !== undefined)
                    await composition.presets.mount(agentCtx, composition.presetId);
                // 回执工具注册不上 ⇒ 这个会话没有任何回执通道，跑完必然白跑（决策 24）：当作前置条件
                // 失败直接抛，工厂会回滚作用域、不发布会话；scheduler 按 receipt-tool-unavailable 收敛。
                if (!registerReceiptTool(agentCtx, { store, task, instanceId, sessionId, logger })) {
                    throw new DispatchPreconditionError('receipt-tool-unavailable', `任务 ${task.id} 的回执工具未注册成功（同名冲突或宿主未暴露 tools 服务），不派发`);
                }
            },
        });
    }
    catch (error) {
        store.transition(instanceId, { status: 'dispatched', session_id: null, detail: 'create-failed' });
        // setup 里抛的前置条件失败（如 receipt-tool-unavailable）原样上抛，保住具体 reason。
        if (error instanceof DispatchPreconditionError)
            throw error;
        throw new DispatchPreconditionError('agent-create-failed', `任务 ${task.id} 会话 ${sessionId} 未能建立（preset=${composition?.presetId ?? '(rosterless)'}）: ${String(error)}`);
    }
    // 归组（决策 22）：只设 meta.cwd 不会进工作区 sessionIds，必须显式 attach；
    // attach 内部要求 session header 的 cwd 归一后 === workspace.path，故 cwd 只能取自本实体。
    try {
        await workspace.attachSession(sessionId);
    }
    catch (error) {
        void handle.dispose().catch(() => { });
        throw new DispatchPreconditionError('workspace-attach-failed', `会话 ${sessionId} 已建立但无法归入工作区 "${workspace.title}"（${workspace.path}）: ${String(error)}`);
    }
    // route/source/preset 落事件：只记本次实测用了什么，不回写任务定义或配置。
    store.appendEvent(instanceId, 'dispatch', {
        sessionId,
        workspacePath: workspace.path,
        provider: route.provider,
        model: route.model,
        modelSource: route.source,
        ...(composition === undefined ? {} : { agentPreset: composition.presetId }),
    });
    // 会话列表治理：规范名在 reconciler.onCreated 改，跑完归档在 succeeded 对账后。
    handle.agent.send(buildMessage(task, workspace.path, logicalDate), 'next-turn', true);
    return { sessionId, handle };
}
