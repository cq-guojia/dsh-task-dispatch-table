import { Config, ConfigDefaults, readConfigField, resolveStatePath } from './config.js';
import { ensureIdsInInlineJson, existingUuidIds, isUuid, newTaskId, nextSlotAfter, removeDefinitionInline, setEnabledDefinitionInline, taskDefinitionSchema, titleOf, upsertDefinitionInline, validateDefinitionForSave, } from './tasks.js';
import { TaskStore } from './store.js';
import { assetPaths, deleteSnapshot, deleteTaskAssets, deleteVersion, listSnapshots, listVersions, moveAttachmentsIn, purgeTmp, readSnapshot, readVersion, removeAttachmentFiles, saveSnapshot, saveVersion, } from './task-assets.js';
import * as fs from 'fs';
import path from 'path';
import { randomBytes } from 'crypto';
import { createReconciler } from './reconcile.js';
import { createScheduler } from './scheduler.js';
export const name = 'dsh-task-dispatch-table';
/** 宿主服务依赖：以源码实际服务名为准（决策 15 / PROGRESS「已核实的 DSH 能力」）。
 * ⚠️ settings 不在此列：settings 服务以「带 register 面」或「惰性形态」两种组合入场，
 * 缺失 register 时硬性依赖会令 entry 卡死/崩；改由 apply 内 ctx.inject(['settings'], ...)
 * 订阅并在 register 就绪才激活（参照 dsh-context installSettings，决策 17 真机教训）。 */
export const inject = ['timer', 'agents', 'sessions', 'workspaceRegistry', 'sessionTitle', 'sessionProjections'];
export { Config, resolveStatePath };
// ── 临时调试通道参数（决策 16 例外：完善 UI 后随面板一起回收）──
/** 告警环形缓冲上限（条）。 */
const DEBUG_WARN_LIMIT = 20;
/** 快照最小写入间隔（毫秒）：会话事件逐条续租改 updated_at，不节流会写放大。 */
const DEBUG_WRITE_MIN_INTERVAL_MS = 2_000;
/** 无变化时的强制心跳间隔：让面板时间戳持续刷新，证明宿主存活。 */
const DEBUG_FORCE_INTERVAL_MS = 5 * 60_000;
/** settings 命名空间（与浏览器半侧的 SETTINGS_NS 同名，两侧按它配对）。 */
const SETTINGS_NS = 'dsh-task-dispatch-table';
const DISPATCH_API_PREFIX = '/api/task-dispatch-table';
const DISPATCH_BODY_LIMIT = 1024 * 1024;
const writeJson = (res, code, body) => {
    res.writeHead(code, { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' });
    res.end(JSON.stringify(body));
};
/** 同源 / loopback 守卫：浏览器 fetch 必带与 Host 同源的 Origin；无 Origin 的只放行本机回环。 */
const isTrustedDispatchRequest = (req) => {
    const origin = typeof req.headers.origin === 'string' ? req.headers.origin : undefined;
    const host = typeof req.headers.host === 'string' ? req.headers.host : undefined;
    if (origin === undefined) {
        const addr = req.socket.remoteAddress;
        return addr === '127.0.0.1' || addr === '::1' || addr === '::ffff:127.0.0.1';
    }
    if (host === undefined)
        return false;
    try {
        return new URL(origin).host === host;
    }
    catch {
        return false;
    }
};
const readDispatchBody = async (req) => {
    const chunks = [];
    let size = 0;
    for await (const chunk of req) {
        const buffer = chunk;
        size += buffer.length;
        if (size > DISPATCH_BODY_LIMIT)
            throw new Error('body-too-large');
        chunks.push(buffer);
    }
    return Buffer.concat(chunks).toString('utf8');
};
/** 同 readDispatchBody，但原样返回二进制 Buffer（上传附件用）。 */
const readDispatchBodyBuffer = async (req, limit) => {
    const chunks = [];
    let size = 0;
    for await (const chunk of req) {
        const buffer = chunk;
        size += buffer.length;
        if (size > limit)
            throw new Error('body-too-large');
        chunks.push(buffer);
    }
    return Buffer.concat(chunks);
};
/** 附件约束（白名单/上限/扩展名解析）与浏览器端预检**共用同一份**，防两处漂移。 */
export { ATTACHMENT_MAX_BYTES, ALLOWED_ATTACHMENT_EXT, extOf } from './attachment-allowlist.js';
import { ATTACHMENT_MAX_BYTES, ALLOWED_ATTACHMENT_EXT, extOf } from './attachment-allowlist.js';
/** 文件名去路径 + 仅留安全字符，截断到 60，避免落盘文件名注入。 */
const sanitizeBase = (name) => {
    const base = name.slice(Math.max(name.lastIndexOf('/'), name.lastIndexOf('\\')) + 1);
    const dot = base.lastIndexOf('.');
    const noExt = dot <= 0 ? base : base.slice(0, dot);
    const cleaned = noExt.replace(/[^a-zA-Z0-9._-]/g, '_').slice(0, 60);
    return cleaned === '' ? 'file' : cleaned;
};
const safeDecode = (value) => {
    try {
        return decodeURIComponent(value);
    }
    catch {
        return value;
    }
};
/** 取查询参数（GET 路由用；宿主传入的 req 带 url）。 */
const queryOf = (req, key) => {
    const url = req.url ?? '';
    const mark = url.indexOf('?');
    if (mark < 0)
        return '';
    return new URLSearchParams(url.slice(mark + 1)).get(key) ?? '';
};
/** 从现有任务表里读出某任务的附件清单（附件搬移的「上一次」基准）。 */
function readAttachmentsOf(raw, id) {
    try {
        const data = JSON.parse(raw.trim() === '' ? '[]' : raw);
        if (!Array.isArray(data))
            return [];
        const hit = data.find((item) => (item !== null && typeof item === 'object' && item.id === id));
        return hit !== undefined && Array.isArray(hit.attachments) ? hit.attachments : [];
    }
    catch {
        return [];
    }
}
/**
 * 构造本插件的 webServer 路由（快照读 + 任务表写）。
 * @param runtimeRef - 宿主运行时数据 store（apply 内共用同一份）。
 * @param persistTasksInline - 任务表保存回调（写回 config profile）。
 */
const makeDispatchRoutes = (runtimeRef, persistTasksInline, 
/** 取状态库（settings inject 就绪后非空）；未就绪时 /db 返回 503。 */
getStore, 
/** 取 workspaceRegistry（归档会话的临时反归档 / 回归档；任务表单的工作区下拉）。 */
getRegistry, 
/** 取 llm 服务（任务表单的模型下拉）；未挂载时返回 undefined。 */
getLlm, 
/** 宿主日志（取证：反归档到底有没有跑、宿主有没有该面）。 */
log, 
/** 取附件落盘目录（settings inject 就绪后才有值：statePath 在那里定格）；未就绪时上传返回 503。 */
getAttachmentsDir, 
/** 取任务文件资产根（state.db 同目录）；未就绪时版本 / 快照相关路由返回 503。 */
getAssets, 
/** 取插件配置（清道夫天数等）。 */
getConfig) => [
    {
        // 附件上传（选择/上传交互：拖拽或本地文件 → 宿主落盘到插件数据目录，按原始名+随机尾缀、不覆盖累加）。
        // 原始文件名经 x-filename 头（URL 编码）传入，避免二进制体里夹带名字；扩展名走白名单。
        kind: 'exact',
        path: `${DISPATCH_API_PREFIX}/attachment`,
        handler: async (req, res) => {
            if (req.method !== 'POST')
                return writeJson(res, 405, { ok: false, error: 'method-not-allowed' });
            if (!isTrustedDispatchRequest(req))
                return writeJson(res, 403, { ok: false, error: 'forbidden' });
            const dir = getAttachmentsDir();
            if (dir === null)
                return writeJson(res, 503, { ok: false, error: 'attachments-dir-not-ready' });
            const rawName = typeof req.headers['x-filename'] === 'string' ? req.headers['x-filename'] : '';
            const originalName = safeDecode(rawName);
            if (originalName === '')
                return writeJson(res, 400, { ok: false, error: 'filename-required' });
            const ext = extOf(originalName);
            if (!ALLOWED_ATTACHMENT_EXT.has(ext))
                return writeJson(res, 415, { ok: false, error: 'file-type-not-allowed', ext });
            let buffer;
            try {
                buffer = await readDispatchBodyBuffer(req, ATTACHMENT_MAX_BYTES);
            }
            catch {
                return writeJson(res, 413, { ok: false, error: 'payload-too-large' });
            }
            if (buffer.length === 0)
                return writeJson(res, 400, { ok: false, error: 'empty-file' });
            const stored = `${sanitizeBase(originalName)}-${randomBytes(3).toString('hex')}${ext === '' ? '' : '.' + ext}`;
            try {
                // 同步式落盘：本仓库 @types/node 的 fs 命名空间只有回调式重载（promise 版在 fs/promises），
                // 附件上传是低频操作，mkdirSync/writeFileSync 足够。
                fs.mkdirSync(dir, { recursive: true });
                fs.writeFileSync(path.join(dir, stored), buffer);
            }
            catch (error) {
                return writeJson(res, 500, { ok: false, error: 'write-failed', message: error instanceof Error ? error.message : String(error) });
            }
            writeJson(res, 200, { ok: true, ref: stored, name: originalName });
        },
    },
    {
        kind: 'exact',
        path: `${DISPATCH_API_PREFIX}/snapshot`,
        handler: (req, res) => {
            if (req.method !== 'GET')
                return writeJson(res, 405, { ok: false, error: 'method-not-allowed' });
            if (!isTrustedDispatchRequest(req))
                return writeJson(res, 403, { ok: false, error: 'forbidden' });
            writeJson(res, 200, { ok: true, snapshot: runtimeRef.debugSnapshot, tasksInline: runtimeRef.tasksInline });
        },
    },
    {
        // 调试页数据通道：三张表原样导出（用户机器上没有 sqlite CLI，面板里直接看库）。
        kind: 'exact',
        path: `${DISPATCH_API_PREFIX}/db`,
        handler: (req, res) => {
            if (req.method !== 'GET')
                return writeJson(res, 405, { ok: false, error: 'method-not-allowed' });
            if (!isTrustedDispatchRequest(req))
                return writeJson(res, 403, { ok: false, error: 'forbidden' });
            const store = getStore();
            if (store === null)
                return writeJson(res, 503, { ok: false, error: 'store-not-ready' });
            writeJson(res, 200, {
                ok: true,
                at: new Date().toISOString(),
                tables: TaskStore.DUMP_TABLES.map(name => store.dumpTable(name, 500)),
            });
        },
    },
    {
        // 任务保存 / 删除（2026-09-30）：
        //   POST   { tasksInline } = 整批（配置页 JSON 编辑，走身份闸门）
        //   POST   { task }        = 单条（新增 / 编辑表单：校验 → 附件落定 → 落库 → 版本 / 快照 → 审计）
        //   DELETE { id }          = 删除任务（定义摘掉 + 任务目录整删，实例 / 事件保留做审计）
        kind: 'exact',
        path: `${DISPATCH_API_PREFIX}/tasks`,
        handler: async (req, res) => {
            if (req.method !== 'POST' && req.method !== 'DELETE')
                return writeJson(res, 405, { ok: false, error: 'method-not-allowed' });
            if (!isTrustedDispatchRequest(req))
                return writeJson(res, 403, { ok: false, error: 'forbidden' });
            try {
                const body = await readDispatchBody(req);
                const parsed = JSON.parse(body);
                // ── 删除任务：**先落库、后删目录**（评审 P1#3：落库失败时不能已把文件删了）──
                if (req.method === 'DELETE') {
                    const id = typeof parsed.id === 'string' ? parsed.id : '';
                    if (!isUuid(id))
                        return writeJson(res, 400, { ok: false, error: 'id-required' });
                    const rm = removeDefinitionInline(runtimeRef.tasksInline, id);
                    if (rm.error !== null)
                        return writeJson(res, 400, { ok: false, error: rm.error });
                    const prevInline = runtimeRef.tasksInline;
                    runtimeRef.tasksInline = rm.json;
                    try {
                        await persistTasksInline(rm.json);
                    }
                    catch (error) {
                        runtimeRef.tasksInline = prevInline; // 回滚内存，定义还在
                        return writeJson(res, 500, { ok: false, error: 'persist-failed', message: error instanceof Error ? error.message : String(error) });
                    }
                    const paths = getAssets();
                    if (paths !== null)
                        deleteTaskAssets(paths, id);
                    getStore()?.appendAudit({ taskId: id, action: 'task_deleted' });
                    log(`任务 ${id} 已删除（定义已摘除，任务目录整删；执行记录保留）`);
                    return writeJson(res, 200, { ok: true, removed: rm.removed });
                }
                // ── 整批（配置页 JSON 编辑，身份闸门不变）──
                if (typeof parsed.tasksInline === 'string') {
                    const { json, changed, assigned, error } = ensureIdsInInlineJson(parsed.tasksInline, existingUuidIds(runtimeRef.tasksInline));
                    if (error !== null)
                        return writeJson(res, 422, { ok: false, error });
                    runtimeRef.tasksInline = json;
                    await persistTasksInline(json);
                    // 整批替换是最重的改动，审计不能缺（评审 P2#13）。
                    getStore()?.appendAudit({ action: 'tasks_replaced', detail: { bytes: json.length, assigned: changed ? assigned : 0 } });
                    return writeJson(res, 200, { ok: true, assigned: changed ? assigned : 0 });
                }
                // ── 单条（新增 / 编辑表单）──
                if (parsed.task === null || typeof parsed.task !== 'object' || Array.isArray(parsed.task)) {
                    return writeJson(res, 400, { ok: false, error: 'task-or-tasksInline-required' });
                }
                const store = getStore();
                const paths = getAssets();
                if (store === null || paths === null)
                    return writeJson(res, 503, { ok: false, error: 'store-or-assets-not-ready' });
                // ① zod 全量校验（评审 P1#2：坏定义不能 200 假成功进权威表，之后运行时静默跳过）
                const checked = taskDefinitionSchema.safeParse(parsed.task);
                if (!checked.success) {
                    const first = checked.error.issues[0];
                    const where = first === undefined ? '' : `${first.path.join('.')}: `;
                    return writeJson(res, 422, { ok: false, error: `任务定义不合法（${where}${first?.message ?? '未知原因'}）` });
                }
                const def = checked.data;
                const existing = existingUuidIds(runtimeRef.tasksInline);
                const validation = validateDefinitionForSave(def, existing);
                if (validation.ok !== true)
                    return writeJson(res, 422, { ok: false, error: validation.error });
                // ② 身份：带 UUID 且命中现有表 ⇒ 修改；否则**一律服务端生成新 id**——
                //    客户端给的 id 不采纳，闸门「UUID 不能凭空引入」不被表单通道旁路（评审 P2#10）。
                const incomingId = isUuid(def.id) ? def.id : null;
                const isUpdate = incomingId !== null && existing.has(incomingId);
                const id = isUpdate ? incomingId : newTaskId();
                // ③ 附件搬移：**只搬不删**（评审 P1#3：真删延后到落库成功之后，否则落库失败时文件已没了）
                const prevAttachments = readAttachmentsOf(runtimeRef.tasksInline, id);
                const moved = moveAttachmentsIn(paths, id, def.attachments ?? [], prevAttachments);
                const finalDef = { ...def, id };
                if ((def.attachments ?? []).length > 0)
                    finalDef.attachments = moved.attachments;
                // ④ 落库（定义先落：它是唯一权威）
                const up = upsertDefinitionInline(runtimeRef.tasksInline, finalDef, { allowNew: true });
                if (up.error !== null)
                    return writeJson(res, 422, { ok: false, error: up.error });
                runtimeRef.tasksInline = up.json;
                await persistTasksInline(up.json);
                // ⑤ 落库成功 ⇒ 才真删被移除的附件文件
                const removeFailed = removeAttachmentFiles(paths, id, moved.removed);
                // ⑥ 版本 / 快照（变了才留；失败只告警，不回滚定义）
                let versionCreated = false;
                let snapshotCreated = false;
                const promptText = typeof finalDef.target === 'object' && finalDef.target !== null
                    ? finalDef.target.prompt
                    : undefined;
                try {
                    versionCreated = saveVersion(paths, id, typeof promptText === 'string' ? promptText : '', '').created;
                }
                catch (error) {
                    log(`任务 ${id} 提示词版本留档失败（不阻塞保存）：${error instanceof Error ? error.message : String(error)}`);
                }
                try {
                    snapshotCreated = saveSnapshot(paths, id, finalDef).created;
                }
                catch (error) {
                    log(`任务 ${id} 配置快照留档失败（不阻塞保存）：${error instanceof Error ? error.message : String(error)}`);
                }
                // ⑦ 审计
                store.appendAudit({
                    taskId: id,
                    action: up.mode === 'create' ? 'task_created' : 'task_updated',
                    detail: { versionCreated, snapshotCreated, attachments: moved.attachments.length },
                });
                if (versionCreated)
                    store.appendAudit({ taskId: id, action: 'version_created' });
                for (const ref of moved.removed)
                    store.appendAudit({ taskId: id, action: 'attachment_removed', detail: { ref } });
                for (const name of moved.missing)
                    store.appendAudit({ taskId: id, action: 'attachment_missing', detail: { name } });
                const removedNames = moved.removed.map(ref => prevAttachments.find(item => item.ref === ref)?.name ?? ref);
                writeJson(res, 200, {
                    ok: true,
                    mode: up.mode,
                    id,
                    versionCreated,
                    snapshotCreated,
                    missingAttachments: moved.missing,
                    removedAttachments: removedNames,
                    assetErrors: [...moved.errors, ...removeFailed],
                });
            }
            catch (error) {
                const message = error instanceof Error ? error.message : String(error);
                writeJson(res, message === 'body-too-large' ? 413 : 400, { ok: false, error: message });
            }
        },
    },
    {
        // 启用开关实时写回（用户 2026-09-30：编辑态头部开关点了立即生效，不走整个保存链路）：
        //   POST { id, enabled } ⇒ 只改该任务定义的 enabled 字段并落库（定义不存在 = task-not-found）。
        kind: 'exact',
        path: `${DISPATCH_API_PREFIX}/tasks/enabled`,
        handler: async (req, res) => {
            if (req.method !== 'POST')
                return writeJson(res, 405, { ok: false, error: 'method-not-allowed' });
            if (!isTrustedDispatchRequest(req))
                return writeJson(res, 403, { ok: false, error: 'forbidden' });
            try {
                const body = await readDispatchBody(req);
                const parsed = JSON.parse(body);
                const id = typeof parsed.id === 'string' ? parsed.id : '';
                if (!isUuid(id))
                    return writeJson(res, 400, { ok: false, error: 'id-required' });
                if (typeof parsed.enabled !== 'boolean')
                    return writeJson(res, 400, { ok: false, error: 'enabled-required' });
                const r = setEnabledDefinitionInline(runtimeRef.tasksInline, id, parsed.enabled);
                if (r.error !== null)
                    return writeJson(res, r.error === 'task-not-found' ? 404 : 400, { ok: false, error: r.error });
                if (r.changed) {
                    const prevInline = runtimeRef.tasksInline;
                    runtimeRef.tasksInline = r.json;
                    try {
                        await persistTasksInline(r.json);
                    }
                    catch (error) {
                        runtimeRef.tasksInline = prevInline; // 回滚内存，开关维持原值
                        return writeJson(res, 500, { ok: false, error: 'persist-failed', message: error instanceof Error ? error.message : String(error) });
                    }
                    getStore()?.appendAudit({ taskId: id, action: 'task_updated', detail: { enabled: parsed.enabled } });
                    log(`任务 ${id} 启用开关已实时写回：${parsed.enabled ? 'enabled' : 'disabled'}`);
                }
                writeJson(res, 200, { ok: true, id, enabled: parsed.enabled });
            }
            catch (error) {
                const message = error instanceof Error ? error.message : String(error);
                writeJson(res, message === 'body-too-large' ? 413 : 400, { ok: false, error: message });
            }
        },
    },
    {
        // 版本 / 快照列表（编辑态「历史版本」面板）：GET /tasks/history?id=<uuid>
        kind: 'exact',
        path: `${DISPATCH_API_PREFIX}/tasks/history`,
        handler: (req, res) => {
            if (req.method !== 'GET')
                return writeJson(res, 405, { ok: false, error: 'method-not-allowed' });
            if (!isTrustedDispatchRequest(req))
                return writeJson(res, 403, { ok: false, error: 'forbidden' });
            const paths = getAssets();
            if (paths === null)
                return writeJson(res, 503, { ok: false, error: 'assets-not-ready' });
            const id = queryOf(req, 'id');
            if (!isUuid(id))
                return writeJson(res, 400, { ok: false, error: 'id-required' });
            writeJson(res, 200, {
                ok: true,
                versions: listVersions(paths, id),
                snapshots: listSnapshots(paths, id),
            });
        },
    },
    {
        // 版本 / 快照内容与删除：
        //   GET    /tasks/history/item?id=&kind=prompt|snapshot&file=   ⇒ 内容（找回时用它回填表单）
        //   DELETE /tasks/history/item?id=&kind=&file=                  ⇒ 用户自己删（系统从不自动删）
        kind: 'exact',
        path: `${DISPATCH_API_PREFIX}/tasks/history/item`,
        handler: (req, res) => {
            if (req.method !== 'GET' && req.method !== 'DELETE')
                return writeJson(res, 405, { ok: false, error: 'method-not-allowed' });
            if (!isTrustedDispatchRequest(req))
                return writeJson(res, 403, { ok: false, error: 'forbidden' });
            const paths = getAssets();
            if (paths === null)
                return writeJson(res, 503, { ok: false, error: 'assets-not-ready' });
            const id = queryOf(req, 'id');
            const kind = queryOf(req, 'kind');
            const file = queryOf(req, 'file');
            if (!isUuid(id) || file === '')
                return writeJson(res, 400, { ok: false, error: 'id-and-file-required' });
            if (req.method === 'DELETE') {
                const gone = kind === 'snapshot' ? deleteSnapshot(paths, id, file) : deleteVersion(paths, id, file);
                if (gone)
                    getStore()?.appendAudit({ taskId: id, action: kind === 'snapshot' ? 'snapshot_deleted' : 'version_deleted', detail: { file } });
                return writeJson(res, 200, { ok: true, deleted: gone });
            }
            const content = kind === 'snapshot' ? readSnapshot(paths, id, file) : readVersion(paths, id, file);
            if (content === null)
                return writeJson(res, 404, { ok: false, error: 'not-found' });
            return writeJson(res, 200, { ok: true, content });
        },
    },
    {
        // 任务表单的下拉数据面（P1）：真实工作区 + 真实模型目录，只读、不写任何东西。
        // ⚠️ 只给「宿主真实存在的」——拿不到就是拿不到（返回空数组 + degraded 标记），不塞兜底假值。
        kind: 'exact',
        path: `${DISPATCH_API_PREFIX}/options`,
        handler: async (req, res) => {
            if (req.method !== 'GET')
                return writeJson(res, 405, { ok: false, error: 'method-not-allowed' });
            if (!isTrustedDispatchRequest(req))
                return writeJson(res, 403, { ok: false, error: 'forbidden' });
            const registry = getRegistry();
            const llm = getLlm();
            const workspaces = registry === null
                ? []
                // value 用 **title**：`resolveWorkspace`（src/dispatch.ts:33-35）就是按 title 精确匹配、id 兜底。
                // anchorSessionId = 该工作区最近一个会话（entity.sessionIds 末位，官方 0.2.0-rc.1 已核实；
                // 含归档会话槽位 ⇒ scope 解析无需激活 agent）——客户端「选择工作区文件」的浏览锚点。
                // 没有会话的工作区不下发该字段（客户端显示「无历史会话」空态，不造假会话）。
                : registry.list().map(workspace => {
                    const sessions = workspace.sessionIds;
                    const anchorSessionId = sessions !== undefined && sessions.length > 0 ? sessions[sessions.length - 1] : undefined;
                    return { title: workspace.title, path: workspace.path, anchorSessionId };
                });
            const models = [];
            try {
                for (const provider of llm?.listProviders() ?? []) {
                    try {
                        // 模型目录是 advisory（host.ts:157-163）：单个 provider 失败不影响其他。
                        for (const model of await llm.listModels(provider.id)) {
                            models.push({ provider: model.provider, id: model.id, name: model.name });
                        }
                    }
                    catch (error) {
                        log(`[表单下拉] provider ${provider.id} 取模型目录失败：${error instanceof Error ? error.message : String(error)}`);
                    }
                }
            }
            catch (error) {
                log(`[表单下拉] 枚举 provider 失败：${error instanceof Error ? error.message : String(error)}`);
            }
            if (registry === null)
                log('[表单下拉] workspaceRegistry 未就绪 ⇒ 工作区下拉为空');
            if (llm === undefined)
                log('[表单下拉] 宿主无 llm 服务 ⇒ 模型下拉为空（不填模型仍走决策 22 漏斗）');
            // 宿主真实时区（Intl 解出来）。UI 按用户 2026-09-29 的决定**不再让选时区**（一律跟随宿主），
            // 这里保留下发：排期判定本来就走宿主时区，将来若要显式指定时区，直接接上即可。
            let timezone = '';
            try {
                timezone = Intl.DateTimeFormat().resolvedOptions().timeZone ?? '';
            }
            catch (error) {
                log(`[表单下拉] 解不出宿主时区：${error instanceof Error ? error.message : String(error)}`);
            }
            writeJson(res, 200, {
                ok: true,
                workspaces,
                models,
                timezone,
                /** 客户端据此区分「真的没有」与「面没接上」，UI 上不撒谎。 */
                degraded: { workspaces: registry === null, models: llm === undefined },
            });
        },
    },
    {
        // 归档会话查看：当前宿主把归档会话标为 inactive（sessions.binding 返回空、
        // uiConversation.binding 抛 inactive session）⇒ 查看前先反归档让它恢复可读。
        kind: 'exact',
        path: `${DISPATCH_API_PREFIX}/session/unarchive`,
        handler: async (req, res) => {
            if (req.method !== 'POST')
                return writeJson(res, 405, { ok: false, error: 'method-not-allowed' });
            if (!isTrustedDispatchRequest(req))
                return writeJson(res, 403, { ok: false, error: 'forbidden' });
            try {
                const parsed = JSON.parse(await readDispatchBody(req));
                if (typeof parsed.sessionId !== 'string' || parsed.sessionId === '') {
                    return writeJson(res, 400, { ok: false, error: 'sessionId-required' });
                }
                const registry = getRegistry();
                if (registry === null) {
                    log(`[查看会话] 反归档 ${parsed.sessionId}：registry 未就绪`);
                    return writeJson(res, 503, { ok: false, error: 'registry-not-ready' });
                }
                if (typeof registry.unarchiveSession !== 'function') {
                    log(`[查看会话] 反归档 ${parsed.sessionId}：宿主无 unarchiveSession 面（B 方案不可用）`);
                    return writeJson(res, 501, { ok: false, error: 'unarchiveSession-unavailable：当前宿主版本无该面' });
                }
                await registry.unarchiveSession(parsed.sessionId);
                log(`[查看会话] 反归档 ${parsed.sessionId} 成功`);
                writeJson(res, 200, { ok: true });
            }
            catch (error) {
                const message = error instanceof Error ? error.message : String(error);
                writeJson(res, message === 'body-too-large' ? 413 : 400, { ok: false, error: message });
            }
        },
    },
    {
        // 关闭弹窗后把会话归档回去，平时列表依旧干净。
        kind: 'exact',
        path: `${DISPATCH_API_PREFIX}/session/archive`,
        handler: async (req, res) => {
            if (req.method !== 'POST')
                return writeJson(res, 405, { ok: false, error: 'method-not-allowed' });
            if (!isTrustedDispatchRequest(req))
                return writeJson(res, 403, { ok: false, error: 'forbidden' });
            try {
                const parsed = JSON.parse(await readDispatchBody(req));
                if (typeof parsed.sessionId !== 'string' || parsed.sessionId === '') {
                    return writeJson(res, 400, { ok: false, error: 'sessionId-required' });
                }
                const registry = getRegistry();
                if (registry === null) {
                    log(`[查看会话] 回归档 ${parsed.sessionId}：registry 未就绪`);
                    return writeJson(res, 503, { ok: false, error: 'registry-not-ready' });
                }
                await registry.archiveSession(parsed.sessionId);
                log(`[查看会话] 回归档 ${parsed.sessionId} 成功`);
                writeJson(res, 200, { ok: true });
            }
            catch (error) {
                const message = error instanceof Error ? error.message : String(error);
                writeJson(res, message === 'body-too-large' ? 413 : 400, { ok: false, error: message });
            }
        },
    },
];
/**
 * 无 `register` 面时的等价作用域（dsh 0.1.7-rc.1 起把注册改成「注册项 Config 自动投影」）。
 *
 * ⚠️ 这里**不能让插件整体 inert**：那样调度器根本不启动，比「页面没数据」严重得多。
 * 退化为「用启动配置运行」——调度 / 派发 / 对账照常；快照与任务 id 回写走 rc.1 的
 * `settings.update(ns, patch)`（该组合若无 update 则放弃回写，仅告警一次）。
 * @param sctx - 已就位 settings 服务的上下文（用于告警日志）。
 * @param settings - settings 服务实例。
 * @param initial - 启动期定格的插件配置。
 * @returns 与 register 产物同形的作用域。
 */
function fallbackScope(sctx, settings, initial) {
    const updater = settings.update;
    sctx.logger.warn('dsh-task-dispatch-table: 当前 dsh 的 settings 服务未提供 register 面（0.1.7-rc.1 起改为注册项'
        + ' Config 自动投影），已退化为「启动配置运行」：调度照常执行，但运行期改配置需重启才生效'
        + (typeof updater === 'function' ? '。' : '；且该组合也没有 settings.update，页面快照无法回写。'));
    return {
        get: () => initial,
        update: async (patch) => {
            if (typeof updater !== 'function')
                return;
            await updater.call(settings, SETTINGS_NS, patch);
        },
        watch: () => () => { },
    };
}
/** 快照携带的最近事件条数（面板按实例过滤展开用，故比单页展示量多留一些）。 */
const DEBUG_EVENT_LIMIT = 200;
export function apply(ctx, config) {
    // rc.1 兼容：本插件早前版本把 volatile 字段经 settings.update 提交，Loader 把 volatile 默认按
    // `{}` 写进了 profile；重装后 z.number()/z.string() 校验 `{}` 会失败导致 entry 不激活。本插件
    // 配置全是 number/string，不可能有合法的空对象，故把入参里残留的 `{}` 剥掉，让默认值生效。
    const cleanConfig = (() => {
        if (typeof config !== 'object' || config === null || Array.isArray(config))
            return config;
        const out = {};
        for (const [k, v] of Object.entries(config)) {
            if (typeof v === 'object' && v !== null && !Array.isArray(v) && Object.keys(v).length === 0)
                continue;
            out[k] = v;
        }
        return out;
    })();
    // Config 解析（非 volatile 字段是纯值；readConfigField 对纯值原样返回，对残留 Volatile 引用解包）。
    const raw = Config(cleanConfig);
    const initial = {
        statePath: typeof raw.statePath === 'string' ? raw.statePath : '',
        tickMs: readConfigField(raw.tickMs, ConfigDefaults.tickMs),
        dispatchGraceMs: readConfigField(raw.dispatchGraceMs, ConfigDefaults.dispatchGraceMs),
        leaseMs: readConfigField(raw.leaseMs, ConfigDefaults.leaseMs),
        unknownGraceMs: readConfigField(raw.unknownGraceMs, ConfigDefaults.unknownGraceMs),
        tasksDir: typeof raw.tasksDir === 'string' ? raw.tasksDir : 'tasks',
        tasksInline: readConfigField(raw.tasksInline, ''),
        debugSnapshot: readConfigField(raw.debugSnapshot, ''),
        defaultProvider: typeof raw.defaultProvider === 'string' ? raw.defaultProvider : '',
        defaultModel: typeof raw.defaultModel === 'string' ? raw.defaultModel : '',
        logRetentionDays: readConfigField(raw.logRetentionDays, ConfigDefaults.logRetentionDays),
        historyRetentionDays: readConfigField(raw.historyRetentionDays, ConfigDefaults.historyRetentionDays),
        attachmentTmpRetentionDays: readConfigField(raw.attachmentTmpRetentionDays, ConfigDefaults.attachmentTmpRetentionDays),
    };
    // v1 零自建 UI（决策 16）：配置走官方 ctx.settings 命名空间，patch config 作为 base 层，
    // 用户文档层 live 覆盖（packages/settings/settings/src/index.ts:49-59）。
    // ⚠️ settings 服务以「带 register 面」或「无 register 面」两种组合入场（参照 dsh-context
    // installSettings）：用 ctx.inject 订阅；缺失 register 时**不再 inert**，而是降级为启动配置
    // 作用域（fallbackScope）——否则调度器根本不启动。顶层 inject 写法会在 register 尚未挂上
    // 时误激活并崩（TypeError: ctx.settings.register is not a function），故不进顶层 inject 列表。
    // ── 运行时数据 store（提升到 apply 作用域，webServer 路由与 settings inject 共用）。
    const runtime = {
        tasksInline: initial.tasksInline,
        debugSnapshot: '',
    };
    /** settings inject 就绪后的宿主上下文（persistTasksInline 经它找 configEditor）。 */
    let settingsCtxRef = null;
    /** settings inject 就绪后的状态库：任务表持久化**主通道**（entry config 在插件重装时会丢）。 */
    let storeRef = null;
    /** settings inject 就绪后的附件落盘目录（插件数据根下 task-attachments/，随 statePath 定格）。 */
    let attachmentsDirRef = null;
    /** settings inject 就绪后的任务文件资产根（tasks/ 与临时区都在 state.db 同目录）。 */
    let assetsRef = null;
    /** settings inject 就绪后的插件配置（清道夫天数等；无 register 面时沿用启动配置）。 */
    let configRef = initial;
    const persistTasksInline = async (json) => {
        // 主通道：写状态库 meta 表（state.db 在宿主数据根 = 挂载卷，容器重建 / 插件重装都不丢）。
        // 未就绪只告警不静默——用户必须知道这次保存没落盘。
        const store = storeRef;
        if (store === null) {
            settingsCtxRef?.logger.warn('任务表保存：状态库未就绪，本次只在内存生效、未持久化，请稍后重新保存');
        }
        else {
            store.setMeta('tasksInline', json);
        }
        // 次通道：尽力写回插件 entry config（官方配置面可见）；rc.1 缺 configEditor / entry 属预期。
        // ⚠️ cordis ctx 是 Proxy：属性访问未提供的get trap 直接 throw（cannot get property ... without
        // inject，真机 2026-09-25 实证；决策 21 同源教训），「访问后判 undefined」的探测形同虚设
        // ⇒ 整块 try/catch：任何异常只告警，绝不连累主通道（meta 表已落盘、内存已生效）。
        const sctx = settingsCtxRef;
        if (sctx === null)
            return;
        try {
            const configEditor = sctx.configEditor;
            if (configEditor === undefined)
                return;
            const entry = configEditor.entries().find((e) => e.options?.id === SETTINGS_NS);
            if (entry === undefined)
                return;
            await configEditor.edit(entry, (raw) => ({ ...raw, tasksInline: json }));
        }
        catch (error) {
            sctx.logger.warn(`任务表次通道写回 entry config 失败（不影响保存：主通道 meta 表已落盘）: ${error instanceof Error ? error.message : String(error)}`);
        }
    };
    // ── rc.1 数据通道：webServer HTTP 路由（照抄参考插件 dsh-task-board 的已验证通道：
    // 宿主 ctx.webServer.register(route)，客户端同源 fetch 轮询）。
    ctx.inject(['webServer'], (wctx) => {
        const webServer = wctx.webServer;
        if (webServer === undefined || typeof webServer.register !== 'function') {
            wctx.logger.warn('[数据通道] 宿主上下文无 webServer.register 面，HTTP 路由未注册；客户端画面将无数据');
            return;
        }
        for (const route of makeDispatchRoutes(runtime, persistTasksInline, () => storeRef, () => ctx.workspaceRegistry, () => ctx.get('llm'), (msg) => { ctx.logger.info(msg); }, 
        // 惰性取附件目录：settings inject 在 webServer 之后就绪，届时才定得出 statePath。
        () => attachmentsDirRef, () => assetsRef, () => configRef))
            webServer.register(route);
        wctx.logger.info('[数据通道] webServer 路由已注册：GET /api/task-dispatch-table/snapshot、GET /api/task-dispatch-table/db、GET /api/task-dispatch-table/options、POST /api/task-dispatch-table/session/unarchive、POST /api/task-dispatch-table/session/archive、POST /api/task-dispatch-table/tasks/enabled');
    });
    ctx.inject(['settings'], (sctx) => {
        const settings = sctx.settings;
        // 有 register 面 → 官方命名空间作用域（配置 live 生效）；无（0.1.7-rc.1）→ 降级为
        // 启动配置作用域，调度照跑（见 fallbackScope：不能因为缺 register 就整体不启动）。
        const scope = typeof settings.register === 'function'
            ? settings.register(SETTINGS_NS, Config, { base: initial })
            : fallbackScope(sctx, settings, initial);
        // ── rc.1 运行时数据通道：宿主插件不能走 configForms（volatile 会让 entry 不激活），
        // 改走 webServer HTTP 路由（照抄参考插件 dsh-task-board 的已验证通道：宿主注册
        // GET /api/<name>/snapshot，客户端同源 fetch 轮询）。runtime 提升到 apply 作用域供路由闭包读。
        settingsCtxRef = sctx;
        // statePath 启动时定格，运行期改配置不迁移库。
        const store = new TaskStore(resolveStatePath(scope.get().statePath));
        storeRef = store;
        // 附件上传落盘目录 = 上传**临时区**（task-attachments-tmp/，2026-09-30）：
        // 新上传先进临时区，保存时才搬进 tasks/<id>/attachments/（原始名）。旧平铺目录
        // task-attachments/ 只作老数据迁移源，不再有新文件写入。
        attachmentsDirRef = path.join(path.dirname(resolveStatePath(scope.get().statePath)), 'task-attachments-tmp');
        // 任务文件资产根（tasks/<uuid>/ + 上传临时区）随 statePath 定格。
        assetsRef = assetPaths(resolveStatePath(scope.get().statePath));
        // 任务表恢复（主通道 = 状态库 meta）：state.db 在宿主数据根（挂载卷），容器重建 /
        // 插件重装都不丢。meta 无行（从未保存过）⇒ 沿用 entry config 初始值（兼容旧部署）。
        const savedInline = store.getMeta('tasksInline');
        if (savedInline !== undefined) {
            runtime.tasksInline = savedInline;
            sctx.logger.info(`任务表已从状态库恢复（${savedInline.length} 字节）`);
        }
        // 迁移若真的合并掉了重复行（正常应为 0），必须让用户看见——绝不静默删数据。
        if (store.dupRowsRemoved > 0) {
            sctx.logger.warn(`状态库迁移：发现并合并了 ${store.dupRowsRemoved} 组「同任务同刻度」的重复实例行`
                + `（保留每组最早的一条）。这通常不该发生，请检查是否有手工改动过状态库。`);
        }
        // 临时调试通道：宿主侧把「告警 + 状态库快照」写进本命名空间的 debugSnapshot 字段
        // （scope.update 合并进用户层并提交 'settings/updated'，packages/settings/settings/src/index.ts:133,456,562），
        // 配置页订阅同一 scope 实时渲染。仅诊断用，全部异常自兜，不触碰调度主流程。
        //
        // ⚠️ ctx 不可包装（cordis ctx 是 Proxy：set trap 拒绝赋值 vendor/cordis/src/reflect.ts:172-196，
        // on/interval 等 mixin 方法不在自有属性上，展开拷贝拿不到 :221）——tee logger 作为
        // 显式参数传给各模块（见 host.ts HostLogger 注释），sctx 原样传递。
        const debugWarns = [];
        const pushWarn = (level, message) => {
            debugWarns.push(`${new Date().toISOString()} [${level}] ${message}`);
            if (debugWarns.length > DEBUG_WARN_LIMIT)
                debugWarns.shift();
        };
        const teeLogger = {
            info: (message) => sctx.logger.info(message),
            warn: (message) => { pushWarn('warn', message); sctx.logger.warn(message); },
            error: (message) => { pushWarn('error', message); sctx.logger.error(message); },
        };
        let taskMap = new Map();
        // 快照写入：内容去重（数据未变不写）+ 2s 节流（尾随写入保证最终态必落）+ 5min 心跳。
        let lastContent = '';
        let lastWriteAt = 0;
        let lastPushAt = 0;
        let writePending = false;
        /** 快照首次写入成功只记一次日志，避免每 tick 刷屏。 */
        let snapshotWriteLogged = false;
        const writeSnapshot = () => {
            try {
                const snap = store.snapshot(DEBUG_EVENT_LIMIT);
                const now = new Date();
                // 任务明细（决策 25：id 系统生成 + title 给人看；带下次执行刻度便于核对配置是否生效）。
                const tasks = [...taskMap.values()].map(task => {
                    let next = null;
                    try {
                        next = nextSlotAfter(task, now)?.toISOString() ?? null;
                    }
                    catch {
                        next = null; // 单个任务的刻度计算异常不影响整份快照
                    }
                    return {
                        id: task.id,
                        title: titleOf(task),
                        code: task.code ?? null,
                        enabled: task.enabled,
                        cron: task.schedule.cron ?? null,
                        once: task.schedule.once ?? null,
                        timezone: task.schedule.timezone ?? null,
                        window: task.schedule.window,
                        workspace: task.target.workspace,
                        next,
                    };
                });
                const body = { tasks, instances: snap.instances, events: snap.events, warns: [...debugWarns] };
                const content = JSON.stringify(body);
                lastWriteAt = Date.now();
                if (content === lastContent && Date.now() - lastPushAt < DEBUG_FORCE_INTERVAL_MS)
                    return;
                lastContent = content;
                lastPushAt = Date.now();
                // rc.1：宿主运行时数据不走 settings.update（要求 volatile，会让 entry 不激活）；
                // 改为写进内存 store，经 taskDispatchTable 宿主服务暴露给客户端。
                runtime.debugSnapshot = JSON.stringify({ at: new Date().toISOString(), ...body });
                // 只记一次：证明写通道真的通了（否则日志会被每 tick 刷屏）。
                if (snapshotWriteLogged)
                    return;
                snapshotWriteLogged = true;
                sctx.logger.info(`调试快照首次写入成功（${body.tasks.length} 个任务 / ${snap.instances.length} 条实例`
                    + ` / ${snap.events.length} 条事件，${JSON.stringify(body).length} 字节；客户端经 remote.taskDispatchTable 读取）`);
            }
            catch (error) {
                sctx.logger.warn(`调试快照组装失败: ${String(error)}`);
            }
        };
        const updateSnapshot = () => {
            if (writePending)
                return;
            const wait = lastWriteAt + DEBUG_WRITE_MIN_INTERVAL_MS - Date.now();
            if (wait <= 0) {
                writeSnapshot();
                return;
            }
            writePending = true;
            setTimeout(() => { writePending = false; writeSnapshot(); }, wait);
        };
        const pluginConfig = () => ({ ...scope.get(), tasksInline: runtime.tasksInline });
        const reconcileOptions = {
            get leaseMs() { return scope.get().leaseMs; },
            get dispatchGraceMs() { return scope.get().dispatchGraceMs; },
            get unknownGraceMs() { return scope.get().unknownGraceMs; },
            config: pluginConfig,
            // 决策 41 一次性兼容：旧库实例无快照时按当前任务定义当场补快照（只此一处对账读任务表）。
            legacyTask: (taskId) => taskMap.get(taskId),
            // 附加文件兜底校验（Loop B 发动前）：资产根随 statePath 定格。
            assets: () => assetsRef,
        };
        const reconciler = createReconciler({ ctx: sctx, logger: teeLogger, store, options: reconcileOptions });
        const scheduler = createScheduler({
            ctx: sctx, logger: teeLogger, store, reconciler,
            // tasksInline 以 runtime 内存值为准（用户经 remote 服务改后即时生效，无需等 settings 落盘）。
            config: pluginConfig,
            // 附加文件存在性校验（Loop A）：资产根随 statePath 定格，未就绪 ⇒ 跳过 upload 型校验。
            assets: () => assetsRef,
        });
        // 启动扫描（机制 #5）：重启期间 disposed 事件可能全部丢失，已派发未定态实例置 unknown，
        // 随后按 unknown 流程自然收敛（§3）。pending 从未派发、无可丢事件，保持原状。
        const scanned = store.startupScan();
        if (scanned > 0)
            teeLogger.info(`启动扫描：${scanned} 个已派发实例置 unknown`);
        sctx.on('session/created', session => { reconciler.onCreated(session); updateSnapshot(); });
        sctx.on('session/event', (session, event) => { reconciler.onEvent(session, event); updateSnapshot(); });
        sctx.on('session/disposed', session => { reconciler.onDisposed(session); updateSnapshot(); });
        // 决策 30 修订（用户 2026-09-25 拍板「运行时只认不修」）：tick 不再补写任务 id——
        // id 只在保存闸门（POST /tasks → ensureIdsInInlineJson）生成并固化；运行时遇到
        // 无 id / 非 UUID 的条目由 parseInlineTasks warn 跳过，不做任何兜底或写回。
        const safeTick = () => {
            try {
                scheduler.tick();
                taskMap = scheduler.getTasks();
            }
            catch (error) {
                pushWarn('error', `tick 异常: ${String(error)}`);
                sctx.logger.error(`tick 异常: ${String(error)}`);
            }
            updateSnapshot();
        };
        // 官方定时器（决策 13）：ctx.interval 卸载自动清理（vendor/timer/src/index.ts:47-62）。
        // tickMs live 变更时重启 interval。
        let stopInterval = sctx.interval(safeTick, scope.get().tickMs);
        scope.watch((next, prev) => {
            // 配置 live 变更 ⇒ 同步给路由层（清道夫天数等）。
            configRef = { ...next, tasksInline: runtime.tasksInline };
            if (next.tickMs === prev.tickMs)
                return;
            stopInterval();
            stopInterval = sctx.interval(safeTick, next.tickMs);
        });
        // 上传临时区清道夫：每 6 小时看一次，**跨天**才真干活 ⇒ 平时一轮只多一次日期比较，
        // 无持续负载。删掉 N 天前没被保存带走的临时文件（data-model §六）。
        let lastSweepDay = '';
        const stopSweeper = sctx.interval(() => {
            const paths = assetsRef;
            if (paths === null)
                return;
            const day = new Date().toISOString().slice(0, 10);
            if (day === lastSweepDay)
                return;
            lastSweepDay = day;
            try {
                const removed = purgeTmp(paths, configRef.attachmentTmpRetentionDays);
                if (removed > 0) {
                    sctx.logger.info(`附件临时区清理：删除 ${removed} 个超过 ${configRef.attachmentTmpRetentionDays} 天的未保存文件`);
                }
            }
            catch (error) {
                sctx.logger.warn(`附件临时区清理失败（不影响调度）：${error instanceof Error ? error.message : String(error)}`);
            }
        }, 6 * 3600_000);
        safeTick();
        scheduler.startupDiagnostics();
        updateSnapshot(); // 启动诊断可能写 task_log，立即落一版快照
        sctx.on('dispose', () => {
            stopInterval();
            stopSweeper();
            store.close();
        });
    });
}
