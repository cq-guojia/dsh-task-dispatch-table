// 事件驱动对账（state-machine §1 判定树 + §3 转移表）——**Loop B（执行循环，决策 41）**：
// 只读执行记录 + 派发快照，全程不读任务表。职责：发动执行（无会话的 dispatched / 窗口内的
// pending 重试行）、session/created → running+租约、turn/end 与 session/disposed → 查回执收敛、
// tick 兜底扫描 sweep()。
// 回执机制（决策 19 + 24）：agent 经插件注册的工具写 task_events 的 receipt 事件，对账只查库
// 不读文件；跑完信号后无回执 → 宽限 → 追问×2 → 按失败收敛。
// 唯一例外（决策 41 兼容口）：旧库实例无快照列值时，按 legacyTask 当场合成快照并固化（一次性
// 兼容、带 warn）——兜底也不落库 ⇒ 无法发动 / 无法校验，如实按失败收敛，绝不静默。
import { stat } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { displayNameOf, durationMs, sessionTitleOf } from './tasks.js';
import { dispatchTask, resolveWorkspace, resolveWorkspaceByPath, userNotice, DispatchPreconditionError, } from './dispatch.js';
import { receiptInstruction } from './receipt.js';
import { parseInstanceSnapshot } from './store.js';
import { EventType } from './event-catalog.js';
import { join } from 'node:path';
import { attachmentAbsPath } from './task-assets.js';
/**
 * 快照里的附加文件是否还在（Loop B 发动前兜底）：返回**缺失**的展示名。
 * upload 型按任务目录绝对路径（需 task_id），link 型按快照里冻结的工作区路径。
 * 拿不到基准 ⇒ 跳过不判，绝不猜。
 */
export function missingSnapshotAttachments(ctx, taskId, snap, assets) {
    const list = snap.attachments;
    if (list === undefined || list.length === 0)
        return [];
    const out = [];
    for (const item of list) {
        let abs = null;
        if (item.kind === 'upload') {
            abs = assets === null ? null : attachmentAbsPath(assets, taskId, item.ref);
        }
        else {
            // link 型按附件来源工作区解析（item.workspace 随快照冻结）；来源解析不出 ⇒ 不判，绝不猜。
            const source = item.workspace !== undefined && item.workspace.trim() !== '' ? item.workspace : null;
            try {
                abs = source === null ? join(snap.workspacePath, item.ref) : join(resolveWorkspace(ctx, source).path, item.ref);
            }
            catch {
                abs = null;
            }
        }
        if (abs === null || abs.includes('..'))
            continue;
        if (!existsSync(abs))
            out.push(item.name);
    }
    return out;
}
/** 跑完信号后允许补交回执的追问上限（写死不加配置，事件表可查次数）。 */
const NUDGE_LIMIT = 2;
/** 回执载荷里的路径数组（非数组 / 非字符串项一律剔除；缺字段 ⇒ 空数组）。 */
const receiptPaths = (raw) => Array.isArray(raw) ? raw.filter((item) => typeof item === 'string') : [];
/**
 * 回执裁决（决策 19，替代旧契约文件三查）：
 * receipt 事件存在 + status ∈ validStatuses + outputs / processOutputs 里的每个路径**确实存在**。
 *
 * ⚠️ **已去掉「mtime 新鲜度」闸**（用户 2026-10-03 拍板，原为「防旧产物冒充」）：
 * 那道闸会误伤「复用 / 检查已有文件」类任务 —— 真机案例：任务是判断 `uuid.txt`
 * 是否存在（存在就不动它），agent 如实回执 `outputs:["uuid.txt"]`，但文件本来就在、
 * 没被改写 ⇒ mtime 早于派发时刻 ⇒ 被判 `output-stale` 失败，用户看到的却是「文件明明在」。
 *
 * 用户口径（原话）：「**只要他交出来的文件确实存在、格式是对的，就不用管**」；
 * 「大模型是不是企图蒙混过关，你不用去管」——**任务做得怎么样是大模型的事，
 * 插件只确认它确实执行了**。故只保留「存在性」一道闸，不再替模型判断产出新鲜度。
 *
 * status 仍必须如实 ∈ validStatuses（agent 自报不可信，决策 11）。
 * 决策 41：workspacePath / validStatuses 来自派发快照，与任务设置无关。
 */
export function checkReceipt(workspacePath, validStatuses, receipt) {
    if (receipt === undefined)
        return { ok: false, reason: 'receipt-missing' };
    let payload;
    try {
        payload = JSON.parse(receipt.detail ?? '{}');
    }
    catch (error) {
        return { ok: false, reason: 'receipt-unreadable', detail: String(error) };
    }
    if (typeof payload.status !== 'string' || !validStatuses.includes(payload.status)) {
        return {
            ok: false,
            reason: 'receipt-status-invalid',
            detail: { status: payload.status, validStatuses: [...validStatuses] },
        };
    }
    // 两桶同一道闸（2026-10-10）：主文件与过程文件都按「确实存在」校验，防幽灵路径进界面与下游消息。
    // ⚠️ 取舍：过程文件路径写错同样会让整次回执判失败并走重试（与主桶今天的行为一致）；
    //    若真机上因此频繁误失败，可降级为「只校验主桶」——改这一处即可。
    const buckets = [
        { bucket: 'main', list: receiptPaths(payload.outputs) },
        { bucket: 'process', list: receiptPaths(payload.processOutputs) },
    ];
    for (const { bucket, list } of buckets) {
        for (const output of list) {
            const outputPath = resolve(workspacePath, output);
            if (!existsSync(outputPath))
                return { ok: false, reason: 'output-missing', detail: { output, bucket } };
        }
    }
    return { ok: true, detail: payload };
}
function num(v) {
    return typeof v === 'number' && Number.isFinite(v) ? v : undefined;
}
/**
 * 从会话事件里取 token 用量分量（决策 32 修订）。
 *
 * **权威来源已核实**（宿主 `@deepseek-ai/dsh-session` `lib/types/types.d.ts`）：官方用量挂在
 * `assistant/message` 事件的 `usage?: TokenUsage` 上（`@deepseek-ai/dsh-llm` `lib/types/types.d.ts:160`），
 * 一次模型调用一条。**不需要我们自己推**——事件里带的就是官方算好的。
 *
 * ⚠️ 官方 `TokenUsage` 的计数是**互斥的**（原文：*Counts are DISJOINT*）：
 *   - `inputTokens` = **未缓存**输入（不含缓存）；
 *   - 缓存单列 `cacheReadTokens` / `cacheWriteTokens`；
 *   - **计费输入 = inputTokens + cacheReadTokens + cacheWriteTokens**；
 *   - `totalTokens` = 这一次调用的完整总量（prompt + output）。
 * ⇒ 只取 `inputTokens` 会**漏掉缓存**（大头）⇒ 面板数远小于会话。这就是之前对不上的根因。
 *
 * 取不到（事件不带 usage）返回 undefined（三列留 null，不阻塞链路）。
 */
export function extractTokenUsage(event) {
    if (typeof event !== 'object' || event === null)
        return undefined;
    const root = event;
    const holders = [
        root.usage,
        root.tokenUsage,
        root.tokens,
        root.data?.usage,
        root.detail?.usage,
        root.message?.usage,
    ];
    for (const holder of holders) {
        if (typeof holder !== 'object' || holder === null)
            continue;
        const u = holder;
        const outOut = num(u.completionTokens) ?? num(u.outputTokens) ?? num(u.completion_tokens);
        // 缓存读取（官方字段名 cacheReadTokens；沿用旧别名兜底）。
        const cacheRead = num(u.cacheReadTokens) ?? num(u.cachedTokens) ?? num(u.cacheTokens) ?? num(u.cached_tokens)
            ?? num(u.promptTokensDetails?.cachedTokens)
            ?? num(u.prompt_tokens_details?.cached_tokens);
        const cacheWrite = num(u.cacheWriteTokens);
        const total = num(u.totalTokens);
        // 输入（计费 prompt）：
        //  ① `promptTokens` 这类命名通常**已含缓存** ⇒ 直接用；
        //  ② 否则按官方口径：**未缓存 inputTokens + cacheRead + cacheWrite**（互斥相加）；
        //  ③ 都没有 ⇒ 用 `totalTokens − outputTokens` 兜底。
        const legacyPrompt = num(u.promptTokens) ?? num(u.prompt_tokens);
        const uncached = num(u.inputTokens) ?? num(u.uncachedInputTokens);
        const inOut = legacyPrompt
            ?? (uncached !== undefined || cacheRead !== undefined || cacheWrite !== undefined
                ? (uncached ?? 0) + (cacheRead ?? 0) + (cacheWrite ?? 0)
                : undefined)
            ?? (total !== undefined && outOut !== undefined ? Math.max(0, total - outOut) : undefined);
        // 三者任一有值才算取到（避免对空 usage 对象误报；只给总数无法归属则不记）
        if (inOut !== undefined || outOut !== undefined || cacheRead !== undefined) {
            return { in: inOut, out: outOut, cache: cacheRead };
        }
    }
    return undefined;
}
export function createReconciler({ ctx, logger, store, options, runtime, emit }) {
    const handles = new Map();
    /** token 用量分量累计（决策 32 修订）：按 instance.id 累计，跨重试仍归同一实例；完成写回后清除。 */
    const tokenTotals = new Map();
    /** 发动在途去重（tick 1s 一次，发动是异步的——模型解析期间不能重复发动同一实例）。 */
    const launching = new Set();
    /** 已挂上「等 agent 空闲（`whenIdle`）」的会话：同一会话只挂一个，多次 `turn/end` 共享同一份等待。 */
    const awaitingIdle = new Set();
    /** 事件字段只打印一次（用于确认宿主把用量挂在哪，便于收紧取值逻辑）。 */
    let eventShapeLogged = false;
    const windowDeadline = (instance) => Date.parse(instance.scheduled_at) + durationMs(snapOf(instance)?.window ?? 'PT0S');
    /**
     * 取实例的派发快照（决策 41）。旧行无快照 ⇒ 按 legacyTask 当场合成并固化（一次性兼容）；
     * 兜底也不成立 ⇒ undefined（调用方如实按失败收敛，不静默、不猜）。
     */
    function snapOf(instance) {
        const parsed = parseInstanceSnapshot(instance.snapshot);
        if (parsed !== undefined)
            return parsed;
        const task = options.legacyTask?.(instance.task_id);
        if (task === undefined)
            return undefined;
        let workspacePath;
        try {
            workspacePath = resolveWorkspace(ctx, task.target.workspace).path;
        }
        catch {
            logger.warn(`旧实例 ${instance.id} 补快照失败：工作区解析不出（${task.target.workspace}）`);
            return undefined;
        }
        // 防御：legacyTask 兜底路径可能拿到畸形定义（缺 contract/retry/schedule），绝不让 sweep 崩。
        const contract = task.contract ?? { validStatuses: ['ok'] };
        const retry = task.retry ?? { maxAttempts: 1 };
        const schedule = task.schedule ?? { window: 'PT0S' };
        const snap = {
            title: displayNameOf(task),
            prompt: task.target.prompt ?? '',
            manual: task.target.manual ?? null,
            workspacePath,
            provider: task.target.provider ?? '',
            model: task.target.model ?? '',
            validStatuses: contract.validStatuses.length > 0 ? [...contract.validStatuses] : ['ok'],
            goal: task.target.goal !== false,
            agentTeam: task.target.agentTeam === true,
            permission: task.target.permission ?? 'default',
            maxAttempts: retry.maxAttempts >= 1 ? retry.maxAttempts : 1,
            window: schedule.window ?? 'PT0S',
        };
        try {
            store.setSnapshot(instance.id, snap);
            logger.warn(`旧实例 ${instance.id} 无派发快照，已按当前任务定义补快照（一次性兼容，决策 41）`);
        }
        catch (error) {
            logger.warn(`旧实例 ${instance.id} 补快照写库失败: ${String(error)}`);
        }
        return snap;
    }
    function registerHandle(sessionId, handle) {
        handles.set(sessionId, handle);
    }
    function forgetHandle(sessionId) {
        if (sessionId !== null)
            handles.delete(sessionId);
    }
    /**
     * 实例行被删（窗口外残留 pending / 附件缺失过窗）后的运行态同步：
     * 该任务若已无任何在飞行实例（一条聚合 SQL，删行是低频事件），主界面的转圈就该停。
     */
    function syncRunningAfterDrop(taskId) {
        if (runtime === undefined)
            return;
        if (store.inFlightByTask().has(taskId)) {
            // 该任务**还有别的在飞实例** ⇒ 不该清 running；但**这一行已经从库里没了**（调用方刚 deleteInstance），
            // 记录页 / 日历要少一行 ⇒ 仍必须通知（2026-10-06 审计：这条路径原来完全静默，删行前端看不见）。
            emit?.({ type: EventType.TASK_RUN_CHANGED, payload: { taskId } });
            return;
        }
        runtime.clearRunning(taskId);
    }
    /**
     * 实例行在 **DB 层**的变化（不经 `RuntimeIndex` 的那些：重试退回 / unknown 复活 / 转 running /
     * redispatch）也通知前端重读——`RuntimeIndex` 包裹层覆盖不到它们（design/event-push.md §六）。
     */
    const notifyRow = (instance) => {
        emit?.({ type: EventType.TASK_RUN_CHANGED, payload: { taskId: instance.task_id, instanceId: instance.id } });
    };
    function finishTerminal(instance, status, reason, detail, outputs, processOutputs) {
        const tk = tokenTotals.get(instance.id);
        if (tokenTotals.has(instance.id))
            tokenTotals.delete(instance.id);
        const finishedAt = new Date().toISOString();
        store.transition(instance.id, { status, finished_at: finishedAt, detail: reason });
        // 主界面运行态（内存，非真源）：实例进终态 ⇒ 该任务不再在飞，并记录「上次执行」。
        runtime?.markTerminal(instance.task_id, status, instance.scheduled_at, finishedAt);
        if (detail !== undefined)
            store.appendEvent(instance.id, 'receipt_check', { reason, detail });
        // 决策 32 修订：完成瞬间写回两桶产出与 token 三拆列到总表（冗余，task_events 仍为真源）
        store.recordCompletion(instance.id, outputs ?? null, processOutputs ?? null, tk?.in ?? null, tk?.out ?? null, tk?.cache ?? null);
        forgetHandle(instance.session_id);
        // 会话已结束（turn/end / disposed 触发的收敛）→ 归档；租约误判的回收不归档。
        if (instance.session_id !== null)
            void ctx.workspaceRegistry.archiveSession(instance.session_id).catch((error) => {
                logger.warn(`归档失败 ${instance.session_id}: ${String(error)}`);
            });
    }
    /** 重试判定（state-machine §6，决策 41：maxAttempts / 窗口都读快照）：未耗尽且未超窗 → 回 pending；否则终态 failed。 */
    function retryOrFail(instance, reason, detail) {
        const snap = snapOf(instance);
        const overWindow = Date.now() > windowDeadline(instance);
        if (snap !== undefined && !overWindow && instance.attempt + 1 < snap.maxAttempts) {
            forgetHandle(instance.session_id);
            store.transition(instance.id, {
                status: 'pending',
                attempt: instance.attempt + 1,
                session_id: null,
                lease_until: null,
                dispatched_at: null,
                finished_at: null,
                detail: `retry:${reason}`,
            });
            notifyRow(instance);
            return;
        }
        finishTerminal(instance, 'failed', overWindow ? `${reason}:over-window` : reason, detail);
    }
    /**
     * 回执收敛（state-machine §1 判定树，决策 19 版；决策 41：工作区与合法值读快照）。
     *
     * 取**最新一条**回执裁决（`latestReceipt` = `ORDER BY seq DESC LIMIT 1`）：
     * agent 可能反复交回执（真机见过 66 秒内 4 次），**最后一次申报才是它的最终声明**，
     * 也是本设计的前提 ——「agent 会撒谎」（once-dispatch.md），所以必须以它的最终声明去验产物。
     *
     * ⚠️ 2026-10-03 曾把这里改成「逐条校验、任一条通过即成功」，**是错的、已撤回**：
     * 因为 `outputs:[]`（空申报）在 `checkReceipt` 里天然放行 ⇒ 那个改法等于
     * 「agent 先交一次『我没有产出』就能绕过全部产出校验」= 给没干活的 agent 开后门。
     */
    function settleByReceipt(instance) {
        const snap = snapOf(instance);
        if (snap === undefined) {
            logger.warn(`实例 ${instance.id} 无派发快照，无法校验回执，按失败收敛（决策 41）`);
            store.appendEvent(instance.id, 'receipt_check', { reason: 'no-snapshot' });
            retryOrFail(instance, 'no-snapshot');
            return;
        }
        const receipt = store.latestReceipt(instance.id, instance.dispatched_at ?? undefined);
        const verdict = checkReceipt(snap.workspacePath, snap.validStatuses, receipt);
        if (verdict.ok) {
            const payload = verdict.detail;
            const outputsField = Array.isArray(payload?.outputs) ? JSON.stringify(payload.outputs) : null;
            const processField = Array.isArray(payload?.processOutputs) ? JSON.stringify(payload.processOutputs) : null;
            finishTerminal(instance, 'succeeded', 'receipt-pass', verdict.detail, outputsField, processField);
        }
        else {
            store.appendEvent(instance.id, 'receipt_check', { reason: verdict.reason, detail: verdict.detail });
            retryOrFail(instance, verdict.reason ?? 'receipt-failed', verdict.detail);
        }
    }
    /** 追问（决策 19 第二层）：跑完信号后无回执，对原会话再推一轮、重发回执命令。 */
    function nudge(instance) {
        const snap = snapOf(instance);
        const handle = instance.session_id !== null ? handles.get(instance.session_id) : undefined;
        store.appendEvent(instance.id, 'nudge', { at: new Date().toISOString() });
        if (snap === undefined || handle === undefined) {
            // 追问通道不可用（如插件重启后 handle 丢失）→ 直接按失败收敛。
            retryOrFail(instance, 'receipt-missing-no-handle');
            return;
        }
        try {
            handle.agent.send(userNotice(`任务实例 ${instance.id} 已结束但尚未收到回执。请立即按下面说明调用工具提交回执：\n`
                + receiptInstruction(snap.validStatuses), `[TASK] 回执追问 ${snap.title} · ${instance.logical_date}`), 'next-turn', true);
        }
        catch (error) {
            logger.warn(`追问发送失败 ${instance.id}: ${String(error)}`);
            retryOrFail(instance, 'nudge-send-failed');
        }
    }
    /** 会话活动信号：unknown → running（续租，防双跑不重派），其余续心跳。 */
    function markActivity(instance) {
        if (instance.status === 'unknown') {
            store.transition(instance.id, { status: 'running', lease_until: leaseUntil(), detail: 'unknown-revived' });
            notifyRow(instance);
            return;
        }
        if (instance.status === 'running')
            store.renewLease(instance.id, options.leaseMs);
    }
    function leaseUntil() {
        return new Date(Date.now() + options.leaseMs).toISOString();
    }
    /**
     * 发动执行（决策 41：Loop B 独有动作）。只凭实例行 + 快照：
     * 按 path 反查工作区 → 解析模型漏斗（①层 = 快照提示）→ 建会话挂 preset + 回执工具 → 归组 → 发消息。
     * 任何前置失败（含模型解析不出、工作区消失、create 失败）⇒ **行保留**、走重试判定，原因落事件。
     */
    async function launch(instance) {
        if (launching.has(instance.id))
            return;
        const snap = snapOf(instance);
        if (snap === undefined) {
            retryOrFail(instance, 'no-snapshot');
            return;
        }
        // 附加文件兜底校验（2026-09-30）：只凭快照判定，不读任务定义。
        // 缺失 ⇒ **不发动**，只记一条实例事件（同一实例不重复记）。不判失败、不吃重试额度——
        // 重试也不会把文件变回来；文件一旦恢复，下个 tick 自然放行。
        const assets = options.assets === undefined ? null : options.assets();
        const gone = missingSnapshotAttachments(ctx, instance.task_id, snap, assets);
        if (gone.length > 0) {
            if (store.countEvents(instance.id, 'attachment-missing') === 0) {
                store.appendEvent(instance.id, 'attachment-missing', { files: gone });
            }
            logger.warn(`实例 ${instance.id} 未发动：附加文件不存在（${gone.join('、')}）`);
            // 超过窗口截止 ⇒ 删行（视为未执行，同 stray_pending 语义）：否则行永久 dispatched，
            // 串行互斥会把同任务后续刻度全部挡死（评审 P1#9）。文件没恢复是常态 ⇒ 不能无限等。
            if (Date.now() > Date.parse(instance.scheduled_at) + durationMs(snap.window)) {
                store.deleteInstance(instance.id);
                syncRunningAfterDrop(instance.task_id);
                store.appendLog({
                    taskId: instance.task_id,
                    scheduledAt: instance.scheduled_at,
                    level: 'error',
                    kind: 'attachment-missing',
                    message: `附加文件缺失且已过窗口截止，执行记录已删除：${gone.join('、')}`,
                });
            }
            return;
        }
        launching.add(instance.id);
        try {
            const workspace = resolveWorkspaceByPath(ctx, snap.workspacePath);
            // 随附文件段（2026-09-30）：把快照里的附件 ref 解析成**绝对路径**随派发消息注入
            // （用户要求：必须让模型明确知道文件在哪一层、在什么地方）。与上面存在性校验同款口径——
            // link 按附件来源工作区、upload 按任务目录；解析不出 ⇒ path=null（如实标注，绝不猜）。
            // 同上口径 + **是否目录**（用户 2026-10-09：文件夹本身也能当附件）。
            // ref 指的是目录还是文件，只有这一刻 stat 才知道——服务侧刻意不区分两者，schema / 快照零改动。
            // stat 失败 ⇒ 按文件处理：缺失项已被上面的 missingSnapshotAttachments 拦掉，这里不该失败，
            // 标错也只退化成旧文案，绝不阻断派发。
            const attachments = await Promise.all((snap.attachments ?? []).map(async (item) => {
                let path = null;
                if (item.kind === 'upload') {
                    path = assets === null ? null : attachmentAbsPath(assets, instance.task_id, item.ref);
                }
                else {
                    const source = item.workspace !== undefined && item.workspace.trim() !== '' ? item.workspace : null;
                    try {
                        path = source === null ? join(snap.workspacePath, item.ref) : join(resolveWorkspace(ctx, source).path, item.ref);
                    }
                    catch {
                        path = null;
                    }
                }
                if (path !== null && path.includes('..'))
                    path = null;
                const isDir = path === null ? undefined : await stat(path).then(info => info.isDirectory()).catch(() => undefined);
                return { name: item.name, kind: item.kind, ref: item.ref, path, isDir };
            }));
            const { sessionId, handle } = await dispatchTask({
                ctx, logger, store,
                instanceId: instance.id,
                logicalDate: instance.logical_date,
                scheduledAt: instance.scheduled_at,
                snapshot: snap,
                workspace,
                attachments,
                config: options.config(),
            });
            registerHandle(sessionId, handle);
        }
        catch (error) {
            const reason = error instanceof DispatchPreconditionError ? error.reason : 'launch-error';
            logger.warn(`发动失败（实例 ${instance.id}，reason=${reason}）：${error instanceof Error ? error.message : String(error)}`);
            retryOrFail(store.get(instance.id) ?? instance, reason, String(error));
        }
        finally {
            launching.delete(instance.id);
        }
    }
    /** 发动一个实例（fire-and-forget 包装：launch 内部已兜底，这里再拦异步余波）。 */
    function launchAsyncFire(instance) {
        void launch(instance).catch((error) => {
            logger.warn(`发动异步余波异常（实例 ${instance.id}）: ${String(error)}`);
        });
    }
    /** 落一条「跑完信号」事件（补 running 兜底 + 写 session_event）；**不含裁决**，返回当前实例行供调用方接着判。 */
    function noteRunSignal(sessionId, signal) {
        const instance = store.getBySession(sessionId);
        if (instance === undefined)
            return undefined;
        if (instance.status === 'dispatched') {
            // session/created 事件同步于 sessions.create 内发出，能进 dispatched 又收到跑完信号
            // 说明 created 对账被跳过（如插件重启恢复），先补 running 语义再判定。
            store.transition(instance.id, { status: 'running', lease_until: leaseUntil(), detail: signal });
            notifyRow(instance);
        }
        const current = store.get(instance.id);
        if (current === undefined || (current.status !== 'running' && current.status !== 'unknown'))
            return undefined;
        store.appendEvent(current.id, 'session_event', { type: signal });
        return current;
    }
    /**
     * 等 agent **真正空闲**（会话不再执行）之后再裁决 —— **用户 2026-10-03 拍板**。
     *
     * ⚠️ 为什么不能收到 `turn/end` 就裁：`turn/end` 只是**一轮**结束。开了 `/goal`
     * （本插件默认 `goal: true`）时 agent 会**自动续跑下一轮** —— 宿主 `dsh-agent-loop`
     * 的 `kick()` 就是 `while (await this.turn())`（0.2.0-rc.2 `lib/index.js:886`），
     * 所有轮次（含 goal 续跑）跑完、phase 转 `idle` 才算真正结束。在轮次间隙验收
     * = 「人家还在干活，你就去收卷」（用户原话：「Session 正在进行的时候，你去验收个屁」）。
     *
     * ✅ 正解 = `agent.whenIdle()`：宿主语义是「**没有任何活动中的 driver / maintenance 任务**」
     * （`dsh-agent` `lib/types/runtime-types.d.ts`：*fulfillment after no active driver or
     * maintenance task remains*），实现是等 `activityDone` 稳定不再被替换
     * （`index.js:870` 的 do/while）；`kick()` 的 while 循环把全部轮次跑完才 resolve
     * ⇒ **它就是「会话没有在跑了」这个信号**。
     *
     * 防重入：同一会话只挂一个等待（goal 续跑期间会有多次 `turn/end`，共享同一份 idle）。
     * 拿不到 handle（如插件重启过）⇒ 不挂，交给 sweep 的租约兜底。
     */
    function settleWhenIdle(sessionId) {
        if (awaitingIdle.has(sessionId))
            return;
        const handle = handles.get(sessionId);
        if (handle === undefined)
            return;
        awaitingIdle.add(sessionId);
        void handle.agent.whenIdle().then(() => {
            awaitingIdle.delete(sessionId);
            settleBySessionId(sessionId, 'agent/idle');
        }, (error) => {
            awaitingIdle.delete(sessionId);
            logger.warn(`等待会话空闲失败（${sessionId}）：${String(error)}`);
        });
    }
    /** 有回执就裁决（无回执交给 sweep 追究问）。`agent/idle` / `session/disposed` 走这里。 */
    function settleBySessionId(sessionId, signal) {
        const current = noteRunSignal(sessionId, signal);
        if (current === undefined)
            return;
        if (store.latestReceipt(current.id, current.dispatched_at ?? undefined) !== undefined) {
            settleByReceipt(current);
        }
        // 无回执：不立即判失败——agent 可能只是还没执行提交命令，等 sweep 按宽限期追问。
    }
    return {
        registerHandle,
        retryOrFail,
        /** dispatched → running + 起租约（state-machine §3）；会话改名只凭快照（决策 41/42）。 */
        onCreated(session) {
            const instance = store.getBySession(session.id);
            if (instance === undefined || instance.status !== 'dispatched')
                return;
            store.transition(instance.id, { status: 'running', lease_until: leaseUntil(), detail: 'session/created' });
            notifyRow(instance);
            const snap = snapOf(instance);
            if (snap === undefined) {
                logger.warn(`实例 ${instance.id} 无快照，会话保持默认名（决策 42 改名跳过）`);
                return;
            }
            // 会话改名（会话列表治理，决策 42：[TASK] <260928-1600> · <标题>（· 第N次））。
            // Session 对象只能在这里拿——agents.create 自建会话后 announce，handle 上没有 session。
            // 改名失败只告警不影响对账。
            try {
                ctx.sessionTitle.rename(session, sessionTitleOf(instance.scheduled_at, snap.title, instance.attempt));
            }
            catch (error) {
                logger.warn(`会话改名失败 ${session.id}: ${String(error)}`);
            }
        },
        onEvent(session, event) {
            const instance = store.getBySession(session.id);
            if (instance === undefined)
                return;
            // 累计 token 用量分量（决策 32 修订）：宿主事件带用量则累加；不带则留 null，不阻塞链路
            const used = extractTokenUsage(event);
            if (used !== undefined) {
                const cur = tokenTotals.get(instance.id) ?? {};
                tokenTotals.set(instance.id, {
                    in: (cur.in ?? 0) + (used.in ?? 0),
                    out: (cur.out ?? 0) + (used.out ?? 0),
                    cache: (cur.cache ?? 0) + (used.cache ?? 0),
                });
            }
            else if (!eventShapeLogged) {
                eventShapeLogged = true;
                logger.info(`会话事件字段（确认 token 用量挂载位置用）：${Object.keys(event).join(', ')}`);
            }
            if (event.type === 'turn/end') {
                // 只**记信号**（sweep 的追问判定以它为据），**不在这里裁决**：`turn/end` 只是**一轮**结束，
                // 开了 `/goal` 时 agent 会立刻续跑下一轮，此刻会话仍在执行。真正的裁决等 agent 空闲
                // （`settleWhenIdle` → `whenIdle()`），见该函数注释（用户 2026-10-03 拍板）。
                noteRunSignal(session.id, 'turn/end');
                settleWhenIdle(session.id);
                return;
            }
            // 心跳语义（§4）：该会话任何事件即续租。
            markActivity(instance);
        },
        /** 会话结束 → 查回执收敛（§10：disposed 只是移出内存 store，日志仍在）。 */
        onDisposed(session) {
            settleBySessionId(session.id, 'session/disposed');
            forgetHandle(session.id);
        },
        /** tick 兜底（重启后事件可能丢失，轮询只作兜底，§10）+ **发动执行**（决策 41）。 */
        sweep() {
            const now = Date.now();
            // 发动①：重试回退的 pending 行——窗口内转 dispatched 并发动；窗口外删行记日志（决策 31.6）。
            // 依赖不复判：依赖在首次落库时已过（Loop A 职责），重试是同一份执行记录的再发动。
            for (const instance of store.listByStatus(['pending'])) {
                if (snapOf(instance) === undefined) {
                    retryOrFail(instance, 'no-snapshot');
                    continue;
                }
                if (now > windowDeadline(instance)) {
                    store.deleteInstance(instance.id);
                    syncRunningAfterDrop(instance.task_id);
                    store.appendLog({ taskId: instance.task_id, scheduledAt: instance.scheduled_at, level: 'warn', kind: 'stray_pending', message: '窗口外残留 pending，已删除（视为未执行）' });
                    continue;
                }
                store.transition(instance.id, { status: 'dispatched', detail: 'redispatch' });
                notifyRow(instance);
                launchAsyncFire(store.get(instance.id) ?? instance);
            }
            // 发动②：无会话的 dispatched 行（Loop A 新落库 / create-failed 撤回的）——发动之。
            // 已发动（有 session_id）未 created 的走派发宽限期。
            for (const instance of store.listByStatus(['dispatched'])) {
                if (instance.session_id === null) {
                    launchAsyncFire(instance);
                    continue;
                }
                const dispatchedAtMs = Date.parse(instance.dispatched_at ?? instance.updated_at);
                if (now > dispatchedAtMs + options.dispatchGraceMs) {
                    retryOrFail(instance, 'dispatch-grace-exceeded');
                }
            }
            for (const instance of store.listByStatus(['running'])) {
                const leaseExpired = instance.lease_until !== null && now > Date.parse(instance.lease_until);
                // 决策 19：已收到跑完信号但无回执 → 宽限期后追问，追问 NUDGE_LIMIT 次仍无 → 失败收敛。
                const signalType = parseEventType(store.latestEvent(instance.id, 'session_event')?.detail);
                const signalAtMs = Date.parse(store.latestEvent(instance.id, 'session_event')?.ts ?? instance.updated_at);
                // 追问的等待时长（用户 2026-09-30 拍板）：**会话这一轮真的结束（`turn/end`）之后 30 秒**
                // 还没回执就追问。不再借用 `dispatchGraceMs`（那是"等会话建立"的语义）：真机实测 60 秒宽限
                // + 一轮 tick 粒度 = 118 秒才追问。模型还在干活（没有 `turn/end`）时**绝不追问**，不打扰它。
                const dueNudge = now > signalAtMs + 30_000
                    && store.latestReceipt(instance.id, instance.dispatched_at ?? undefined) === undefined;
                const nudgeOrFail = () => {
                    if (store.countEvents(instance.id, 'nudge') < NUDGE_LIMIT)
                        nudge(instance);
                    else
                        retryOrFail(instance, 'receipt-missing-after-nudge');
                };
                // ① 会话**真的不再执行**了（agent 空闲 / 会话销毁）⇒ 追问判定后即可收口，租约不再适用。
                if (signalType === 'agent/idle' || signalType === 'session/disposed') {
                    if (dueNudge)
                        nudgeOrFail();
                    continue;
                }
                // ② 仅仅「一轮结束」（`turn/end`）：goal 模式下 agent 可能**仍在续跑**（`turn/end` ≠ 会话结束）
                //    ⇒ 照常追究问，但**不能 `continue`**：要让下面的租约 / 失联兜底仍然生效。
                //    （改成「等空闲才裁决」后，旧版 turn/end 后的 `continue` 会把卡死实例永久挂在 running。）
                if (signalType === 'turn/end' && dueNudge)
                    nudgeOrFail();
                if (leaseExpired) {
                    // 租约超时回收（§3）：会话可能仍在跑，不归档；走重试判定。
                    store.appendEvent(instance.id, 'session_event', { type: 'lease-expired' });
                    retryOrFail(instance, 'lease-expired');
                }
                else if (now > Date.parse(instance.updated_at) + options.unknownGraceMs) {
                    // 长期无活动（如漏掉 session/created 导致 lease_until 为 null、租约永不触发）：
                    // 会话已事实上失联，走重试判定收口，避免卡死阻塞同任务（本次真机 bug 同类）。
                    retryOrFail(instance, 'running-stale');
                }
            }
            for (const instance of store.listByStatus(['unknown'])) {
                // unknown 只可能由 startupScan 产生（= 重启孤儿，插件进程重建致 agent 句柄消失，会话已不可控）。
                // 给 30s 短宽限：够活会话经 onEvent 复活为 running；超时则判失败收口——不再等 5+2 分钟，
                // 也避免反复重启不断重置宽限导致永久卡死（且 unknown 已移出串行互斥集，不会挡新刻度）。
                if (now > Date.parse(instance.updated_at) + Math.min(options.unknownGraceMs, 30_000)) {
                    retryOrFail(instance, 'unknown-orphan');
                }
            }
        },
    };
}
/** 从 session_event 事件的 detail JSON 里取 type（sweep 判定跑完信号用）。 */
function parseEventType(detail) {
    if (detail === null || detail === undefined)
        return undefined;
    try {
        const parsed = JSON.parse(detail);
        return typeof parsed?.type === 'string' ? parsed.type : undefined;
    }
    catch {
        return undefined;
    }
}
