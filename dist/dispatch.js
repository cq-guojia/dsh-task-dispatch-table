// 派发（决策 22 + 23 + 24）：模型漏斗解析 + 部署默认 preset 解析 → assign-session 落库
// → ctx.agents.create 驱动模型（内部自建会话：sessions.prepare + enter + announce；setup 里
//   mount preset（工具/提示词/skill 跟随系统）+ 注册本任务专属的回执工具（receipt.ts））
// → 工作区 attachSession 归组 → agent.send 拼装消息。
// 不要预建 ctx.sessions.create——会撞 store 的 'session "…" already exists'（真机教训 2026-09-23）。
import { randomUUID } from 'node:crypto';
import { resolve } from 'node:path';
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
 * （Loop A 落库前的前置检查用；Loop B 发动走 resolveWorkspaceByPath——快照里存的是 path。）
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
 * 工作区 path → 工作区实体（决策 41：Loop B 发动只读快照的 workspacePath）。
 * 快照里的 path 是落库时从实体原样取的，精确比对即可；找不到 = 工作区被删/重建，
 * 行保留走重试判定（失败原因落事件）。
 */
export function resolveWorkspaceByPath(ctx, path) {
    const hit = ctx.workspaceRegistry.list().find(workspace => workspace.path === path);
    if (hit === undefined) {
        throw new Error(`找不到 path 为 "${path}" 的工作区（派发时存在、发动时消失；请在工作区注册表里恢复后等重试）`);
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
 * 模型解析漏斗（决策 22，决策 41 修订第①层来源）：逐层下漏，四层全空返回 undefined
 * （调用方判失败，走重试判定、行保留）。
 *
 * ① 派发快照的 provider/model 提示（= 落库时的任务 target，决策 41：Loop B 不读任务表）
 * ② 插件配置 defaultProvider/defaultModel
 * ③ 宿主默认 ctx.get('agentDefaultModel').currentSelection()（= 用户配的 / 上次用的模型）
 * ④ llm 首个可用：listProviders() 首个能列出模型的 provider + 其首个模型
 *
 * ⚠️ 只在落库 / 发动时现算，**绝不回写**任务定义或配置：用户日后换模型要能自动跟上，
 * 在配置期固化等于自己废掉兜底。
 */
export async function resolveModelRoute(ctx, logger, providerHint, modelHint, config, hintLabel = '派发快照的 target') {
    const fromTask = await resolveLayer(ctx, logger, 'task', hintLabel, {
        provider: providerHint,
        model: modelHint,
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
    logger.warn('模型漏斗四层全部落空（决策 22）：请在 target 或插件配置里指定 provider+model');
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
async function resolveAgentComposition(ctx, logger, instanceId) {
    const presets = ctx.get('agentPresets');
    if (presets === undefined) {
        logger.warn(`实例 ${instanceId}: 宿主未挂载 agentPresets 服务，按 rosterless 处理（工具/提示词取全局层）`);
        return undefined;
    }
    try {
        const { id } = await presets.resolve();
        return { presets, presetId: id };
    }
    catch (error) {
        logger.warn(`实例 ${instanceId}: 解析部署默认 preset 失败，按 rosterless 处理: ${String(error)}`);
        return undefined;
    }
}
/**
 * 插件→会话的用户消息（决策 19：追问层用，form=notice 走系统通知样式）。
 * source.kind 用**生产者自有 kind**（0.1.7 v4 格式要求，`kind: 'plugin'` 已废弃被拒）。
 */
export function userNotice(text, summary) {
    return {
        id: randomUUID(),
        role: 'user',
        content: [{ type: 'text', text }],
        source: {
            kind: 'task-dispatch-table',
            form: 'notice',
            summary,
        },
    };
}
/**
 * 宿主 ctx 命名空间属性的安全读取：ctx 的属性是 getter，**对应模块未 inject 时读取直接 throw**
 * （真机实证：`cannot get property "agentTeams" without inject` ⇒ 派发 launch-error）。
 * 探测语义 = 「有就用、没有就降级」，所以这里把 throw 归一成 undefined，绝不让它炸掉派发。
 */
function readCtxProp(ctx, key) {
    try {
        return ctx[key];
    }
    catch {
        return undefined;
    }
}
/**
 * 上游依赖段（决策 43）：把快照里冻结的 resolvedDeps 渲染给下游 agent——
 * 产出路径按**上游**工作区绝对化（基准不是下游工作区）；上游旧行无快照 ⇒ 基准未知，原样给相对路径。
 */
function dependencyLines(snapshot) {
    const deps = snapshot.resolvedDeps;
    if (deps === undefined || deps.length === 0)
        return [];
    const lines = ['', '上游依赖（落库时已锁定，勿自行查找最新产出）：'];
    for (const dep of deps) {
        const head = `- 任务 ${dep.task}（${dep.semantics === 'same_period' ? '同周期' : '最近成功'}）：`
            + `实例 ${dep.instanceId.slice(0, 8)} · 计划时刻 ${dep.scheduledAt}`;
        if (dep.outputs.length === 0) {
            lines.push(`${head} · 未声明产出`);
            continue;
        }
        lines.push(`${head}，产出：`);
        for (const output of dep.outputs) {
            lines.push(`  - ${dep.workspacePath === null ? `${output}（基准工作区未知，相对路径）` : resolve(dep.workspacePath, output)}`);
        }
    }
    return lines;
}
/**
 * 权限约束指令（决策 50）：宿主 0.2.0-rc.2 的 `AgentOptions` 只有 provider / model /
 * reasoningEffort / maxTokens，**没有按任务下发权限的参数**（权限是宿主新建会话 UI 的会话级设置），
 * 故所选档位以派发消息中的约束指令执行——这是我们能真执行的语义，不做系统级拦截的假承诺；
 * 宿主一旦开放 per-task 权限参数，此处改为随派发下发。默认档不加任何指令。
 */
function permissionInstruction(mode) {
    if (mode === 'readOnly')
        return '权限：本次仅可查看。只读工作区内容，禁止写入、修改或删除任何文件，禁止执行会产生副作用的命令。';
    if (mode === 'workspace')
        return `权限：仅可在目标工作区（${WORKSPACE_PLACEHOLDER}）内修改文件，禁止改动工作区之外的任何内容。`;
    if (mode === 'full')
        return '权限：完全权限，按任务需要执行（工作目录仍为目标工作区）。';
    return null;
}
/** 权限指令里的工作区占位符：拼装时替换成真实工作区绝对路径（文案不写死路径）。 */
const WORKSPACE_PLACEHOLDER = '{{workspace}}';
/**
 * 派发消息拼装（决策 12 模板 + 决策 24 回执工具 + 决策 41 快照化 + 决策 43 依赖冻结段 +
 * 决策 49 团队段 + **随附文件段（决策 54）**）：短指令 prompt + 手册路径 + 上游依赖段 + **随附文件段** +
 * 团队执行段（仅 agentTeam 且宿主具备时）+ 回执调用说明。
 * prompt / manual / validStatuses / resolvedDeps / attachments 全部来自派发快照，与任务设置无关。
 *
 * ⚠️ 随附文件**只能给路径**（宿主 `UserMessage.content` 目前只声明 text 内容块）⇒ 这里把**绝对路径**
 * 逐条写清（「从哪一层开始」就是它），并显式声明「允许读取」，否则会与下面的权限指令（「仅工作区」）打架
 * ——upload 型附件落在**任务目录**（工作区之外），不开口子模型就等于看不见。
 */
export function buildMessage(snapshot, workspacePath, logicalDate, teamMode = false, attachments = []) {
    // ⚠️ 回执说明**放最前**（用户 2026-09-30 拍板）：它是判定成败的唯一依据，必须压过任务指令本身——
    // 真机已发生「任务指令写着『不要做任何其他操作』⇒ 模型把回执也当成多余操作跳过、要追问第二次才交」。
    // 只放最前、不首尾各放一次（用户明确说没必要）。
    const lines = [
        receiptInstruction(snapshot.validStatuses),
        '',
        snapshot.prompt,
        '',
        `任务实例：${snapshot.title} · ${logicalDate}（目标工作区：${workspacePath}）`,
    ];
    if (snapshot.manual !== null && snapshot.manual.trim() !== '') {
        lines.push(`任务手册：先读工作区内 ${snapshot.manual}，再按手册执行。`);
    }
    lines.push(...dependencyLines(snapshot));
    lines.push(...attachmentLines(attachments));
    if (teamMode) {
        // 决策 49 多 Agent 协作段：官方 experimental profile（tool-agent-team）已给根会话 agent
        // 装好 spawn_teammate / send_message / list_agents / wait_agent / interrupt_agent /
        // team_task_* 工具（lib/index.js:242-445 源码核实），这里只负责把「按团队方式执行」讲清楚；
        // 工具名如实列出，不做任何模拟通道。
        lines.push('执行方式：本次启用多 Agent 协作。你作为团队队长（lead），请按需把可并行的子工作拆给队友：'
            + '用 spawn_teammate 创建命名队友（写清职责），用 team_task_create 在共享任务板上登记分工与依赖，'
            + '用 send_message 向队友下发具体指引，并用 wait_agent 等待其完成；'
            + '队友与你在同一工作区工作。所有工作收束后由你统一汇总，并按下方要求交回执行结果。');
    }
    const permissionLine = permissionInstruction(snapshot.permission ?? 'default');
    if (permissionLine !== null) {
        lines.push(permissionLine.replace(WORKSPACE_PLACEHOLDER, workspacePath));
        // 权限口子：随附文件可能是「工作区之外」的只读输入 ⇒ 必须显式豁免，且只放开读、不放开写。
        if (attachments.length > 0) {
            lines.push('说明：上方「本次随附文件」列出的路径是本次派发随附的只读输入，允许读取；'
                + '它们不受本条权限指令里「仅在目标工作区内」的限制（同样不得修改、删除）。');
        }
    }
    lines.push(receiptInstruction(snapshot.validStatuses));
    return userNotice(lines.join('\n'), `[TASK] ${snapshot.title} · ${logicalDate}`);
}
/** 随附文件段（用户 2026-09-30：必须让模型明确知道文件在哪一层、在什么地方）。 */
function attachmentLines(list) {
    if (list.length === 0)
        return [];
    const lines = ['', '本次随附文件（只读输入，请勿修改；以下均为可直接读取的绝对路径）：'];
    for (const item of list) {
        const tag = item.kind === 'upload' ? '上传' : '工作区';
        lines.push(item.path === null
            ? `  - ${item.name}（${tag}）：${item.ref}（基准工作区未知，为工作区相对路径）`
            : `  - ${item.name}（${tag}）：${item.path}`);
    }
    return lines;
}
/**
 * 发动一个已落库实例（决策 41：Loop B 发动；决策 22 顺序 + 决策 23 preset 组装）：
 * 解析模型漏斗（第①层取快照提示）→ **解析部署默认 preset** → 落 session_id → agents.create
 * （自建会话并 announce session/created，对账收到时实例必已带 session_id；preset 在 create 的
 * setup 里 mount，工具/prompt sections/skill 由此挂上）→ **工作区 attachSession 归组**
 * → 落 dispatch 事件（含本次实测 route、命中层级与 preset）→ send。
 * 会话改名在 reconciler.onCreated 做——此处拿不到 Session 对象（handle 只有 agent）。
 * @returns sessionId 与 agent handle——handle 供对账层超时追问（决策 19 第二层）。
 * @throws DispatchPreconditionError 模型解析不出、会话建不起来（含 preset 挂载失败）、
 *   或会话建好后无法归组工作区——调用方（Loop B）按重试判定收敛、**行保留**。
 */
export async function dispatchTask(input) {
    const { ctx, logger, store, instanceId, logicalDate, snapshot, workspace, config } = input;
    const route = await resolveModelRoute(ctx, logger, snapshot.provider, snapshot.model, config);
    if (route === undefined) {
        // 前置条件不足：不建会话、不发动（先于 session_id 落库，实例行不留假 session）。
        throw new DispatchPreconditionError('no-model-route', `实例 ${instanceId} 无法解析出 provider+model，不发动（决策 22 漏斗四层全空）`);
    }
    // 组装方式（决策 23）：部署默认 preset——与用户在 UI 新建会话同一套。
    const composition = await resolveAgentComposition(ctx, logger, instanceId);
    const sessionId = randomUUID();
    // 领取后先把会话身份落到实例行，再建 agent——session/created（factory announce）
    // 到达时实例必已带 session_id，对账可立即转 running。
    // ⚠️ dispatched_at 必须在此写入（原由 store.casClaim 负责，决策 31 懒建行后已不走 CAS）：
    // 回执校验（reconcile.ts）用「产物 mtime > dispatched_at」判新鲜，sweep 也用它算派发宽限；
    // 缺失会回退到 updated_at（最后一次状态变更，晚于产物写入）⇒ 每次都误判 output-stale。
    store.transition(instanceId, {
        status: 'dispatched',
        session_id: sessionId,
        dispatched_at: new Date().toISOString(),
        detail: 'assign-session',
    });
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
            // ① 挂 preset（工具 / prompt sections / skill 跟随系统）；② 注册本实例专属的回执工具
            // （per-agent，只对该会话可见；execute 在插件进程内写库，绕开 agent 沙箱——决策 24）。
            setup: async (agentCtx) => {
                if (composition !== undefined)
                    await composition.presets.mount(agentCtx, composition.presetId);
                // 回执工具注册不上 ⇒ 这个会话没有任何回执通道，跑完必然白跑（决策 24）：当作前置条件
                // 失败直接抛，工厂会回滚作用域、不发布会话；Loop B 按 receipt-tool-unavailable 收敛。
                if (!registerReceiptTool(agentCtx, {
                    store,
                    taskName: snapshot.title,
                    instanceId,
                    sessionId,
                    validStatuses: snapshot.validStatuses,
                    logger,
                    sessionProjections: ctx.sessionProjections,
                })) {
                    throw new DispatchPreconditionError('receipt-tool-unavailable', `实例 ${instanceId} 的回执工具未注册成功（同名冲突或宿主未暴露 tools 服务），不发动`);
                }
            },
        });
    }
    catch (error) {
        store.transition(instanceId, { status: 'dispatched', session_id: null, detail: 'create-failed' });
        // setup 里抛的前置条件失败（如 receipt-tool-unavailable）原样上抛，保住具体 reason。
        if (error instanceof DispatchPreconditionError)
            throw error;
        throw new DispatchPreconditionError('agent-create-failed', `实例 ${instanceId} 会话 ${sessionId} 未能建立（preset=${composition?.presetId ?? '(rosterless)'}）: ${String(error)}`);
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
    // 多 Agent 协作探测（决策 49）：快照开启且宿主暴露 ctx.agentTeams（experimental Agent Teams
    // profile）才注入团队执行指令；profile 未启用 ⇒ 降级单 Agent + 告警留痕，不阻塞派发
    // （与决策 48 goal-unavailable 同款语义；正常功能一律真实——绝不注入装不出来的假指令）。
    // ⚠️ 宿主 ctx 的命名空间属性是 getter：**对应模块未 inject 时读取会直接 throw**（真机实证：
    // `cannot get property "agentTeams" without inject` ⇒ 整次派发 launch-error），必须护栏读。
    const teamAvailable = readCtxProp(ctx, 'agentTeams') !== undefined;
    const teamMode = snapshot.agentTeam === true && teamAvailable;
    if (snapshot.agentTeam === true && !teamAvailable) {
        logger.warn(`[dispatch] agent-team-unavailable 实例 ${instanceId}：宿主未启用 Agent Teams（ctx.agentTeams 缺失），按单 Agent 执行`);
    }
    // route/source/preset 落事件：只记本次实测用了什么，不回写任务定义或配置。
    store.appendEvent(instanceId, 'dispatch', {
        sessionId,
        workspacePath: workspace.path,
        provider: route.provider,
        model: route.model,
        modelSource: route.source,
        ...(composition === undefined ? {} : { agentPreset: composition.presetId }),
        goal: snapshot.goal !== false,
        agentTeam: snapshot.agentTeam === true,
        permission: snapshot.permission ?? 'default',
        teamMode,
    });
    // /goal 多轮续跑（决策 48，用户 2026-09-29「默认都是多轮会话」）：目标开启时把任务目标交给
    // dsh 内置 /goal（ctx.goals，@deepseek-ai/dsh-goal 0.2.0-rc.2：CreateGoalRequest { objective }；
    // goal continuation round 自动续跑、agent 标记 complete 收束，看板届时才结算）。宿主未暴露
    // goals 服务或创建失败都不阻塞派发（本轮照常执行），只落警告留痕——行为与开关语义一致。
    if (snapshot.goal !== false) {
        const goals = readCtxProp(ctx, 'goals');
        if (goals === undefined) {
            logger.warn(`[dispatch] goal-unavailable 实例 ${instanceId}：宿主 ctx 未暴露 goals 服务，本轮按单轮执行`);
        }
        else {
            try {
                await goals.create(handle.agent, { objective: `${snapshot.title}：${snapshot.prompt}` });
            }
            catch (error) {
                logger.warn(`[dispatch] goal-create-failed 实例 ${instanceId}：${String(error)}`);
            }
        }
    }
    // 会话列表治理：规范名在 reconciler.onCreated 改（决策 42 格式），跑完归档在 succeeded 对账后。
    handle.agent.send(buildMessage(snapshot, workspace.path, logicalDate, teamMode, input.attachments), 'next-turn', true);
    return { sessionId, handle };
}
