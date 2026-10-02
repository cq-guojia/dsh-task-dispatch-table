import { Config, ConfigDefaults, readConfigField, resolveStatePath } from './config.js';
import { ensureIdsInInlineJson, existingUuidIds, isUuid, newTaskId, nextSlotAfter, removeDefinitionInline, setEnabledDefinitionInline, taskDefinitionSchema, titleOf, upsertDefinitionInline, validateDefinitionForSave, } from './tasks.js';
import { parseInstanceSnapshot, TaskStore } from './store.js';
import { assetPaths, attachmentAbsPath, deleteSnapshot, deleteTaskAssets, deleteVersion, listSnapshots, listVersions, moveAttachmentsIn, purgeTmp, readSnapshot, readVersion, removeAttachmentFiles, saveSnapshot, saveVersion, } from './task-assets.js';
import * as fs from 'fs';
import path from 'path';
import { randomBytes } from 'crypto';
import { createReconciler } from './reconcile.js';
import { createScheduler } from './scheduler.js';
import { createRuntimeIndex } from './runtime-index.js';
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
/**
 * 从 tasksInline 反查「某工作区下的全部任务 id」（决策 55：workspace 过滤）。
 * `task_instances` / `task_log` 均无工作区列 ⇒ 由任务定义反查 task_id 集合再 `WHERE task_id IN`（不碰表结构）。
 * 只读展示面：解析失败 / 形状不符一律返回空数组（调用方据此返回空结果，不猜）。
 */
function workspaceTaskIdsOf(raw, workspace) {
    try {
        const data = JSON.parse(raw.trim());
        if (!Array.isArray(data))
            return [];
        const out = [];
        for (const item of data) {
            if (typeof item !== 'object' || item === null)
                continue;
            const task = item;
            const target = task.target;
            if (typeof target !== 'object' || target === null)
                continue;
            if (typeof task.id !== 'string')
                continue;
            const ws = target.workspace;
            if (typeof ws === 'string' && ws === workspace)
                out.push(task.id);
        }
        return out;
    }
    catch {
        return [];
    }
}
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
/** 从现有任务表里读出某任务的**整份定义**（更新时保留「表单不管理的字段」用）。 */
function readDefinitionOf(raw, id) {
    try {
        const data = JSON.parse(raw.trim() === '' ? '[]' : raw);
        if (!Array.isArray(data))
            return undefined;
        return data.find((item) => (item !== null && typeof item === 'object' && item.id === id));
    }
    catch {
        return undefined;
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
getConfig, 
/** 主界面运行态内存索引（2026-09-30：卡片「运行中 / 上次 / 下次」的读源，不查库）。 */
runtimeIndex, 
/** 当前任务定义（含停用）—— overview 组装用。 */
getTasks, 
/**
 * 任务定义被改动后立刻同步快照（2026-09-30）：主界面「点了开关要立即生效」——
 * 否则要等下一个 tick 才把新定义同步给 overview，用户看到的就是「点了没反应」。
 */
onDefinitionsChanged, 
/**
 * 取插件配置（运行期 live 合并值：base + 用户层）。设置页 GET 当前值用。
 * 注：本插件配置刻意非 volatile（rc.1 约束），官方 configForms 不可用，
 * 故设置页走本项目自有的 HTTP 通道读写，而非 configForms。
 */
getScopeConfig, 
/**
 * 写回插件配置（仅限计时类字段）。经 settings scope.update 合并进用户层并持久化，
 * scope.watch 即时生效（tickMs 重启 interval，其余字段 reconcile/scheduler 实时读 scope.get()）。
 */
updateScopeConfig) => [
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
                    onDefinitionsChanged();
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
                    onDefinitionsChanged();
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
                // 创建时间（主界面卡片「创建于 X」）：**首次保存时写一次**，此后不改——
                // 改标题 / 改排期都不算重建；老定义没有它 ⇒ 卡片不显示这一行（不编造时间）。
                if (!isUpdate && def.createdAt === undefined)
                    finalDef.createdAt = new Date().toISOString();
                if ((def.attachments ?? []).length > 0)
                    finalDef.attachments = moved.attachments;
                // ⑤ 表单不管理的字段：更新时从原定义**保留**（2026-09-30 专家团复核发现的「编辑即丢」）。
                //    这些字段执行 / 展示要用，但编辑表单没有入口 ⇒ 表单 JSON 天然不带，不保留就被抹掉：
                //    ① createdAt（卡片「创建于」消失）；② schedule.timezone（显式时区任务被改成宿主机本地时区，
                //    执行时刻整体偏移）；③ target.manual（任务手册引用被删，派发手册段随之消失）；
                //    ④ 自定义 cron 降级保存时表单只写 cron ⇒ 保留原 start / everyNWeeks（每 N 周的取模基准）。
                if (isUpdate) {
                    const prev = readDefinitionOf(runtimeRef.tasksInline, id);
                    if (prev !== undefined) {
                        if (finalDef.createdAt === undefined && prev.createdAt !== undefined)
                            finalDef.createdAt = prev.createdAt;
                        const finalTarget = (finalDef.target ?? {});
                        const prevTarget = (prev.target ?? {});
                        if (finalTarget.manual === undefined && prevTarget.manual !== undefined)
                            finalTarget.manual = prevTarget.manual;
                        const finalSchedule = (finalDef.schedule ?? {});
                        const prevSchedule = (prev.schedule ?? {});
                        if (finalSchedule.timezone === undefined && prevSchedule.timezone !== undefined)
                            finalSchedule.timezone = prevSchedule.timezone;
                        // 降级态（有 cron、没有结构化 ui）⇒ 表单没产出 start / everyNWeeks，从原定义保留。
                        if (finalSchedule.cron !== undefined && finalSchedule.ui === undefined) {
                            if (finalSchedule.start === undefined && prevSchedule.start !== undefined)
                                finalSchedule.start = prevSchedule.start;
                            if (finalSchedule.everyNWeeks === undefined && prevSchedule.everyNWeeks !== undefined)
                                finalSchedule.everyNWeeks = prevSchedule.everyNWeeks;
                        }
                    }
                }
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
                onDefinitionsChanged();
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
                    // 立即同步任务表快照 ⇒ 客户端紧接着拉的那一次 overview 就能拿到新值。
                    onDefinitionsChanged();
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
        // 主界面任务列表数据（2026-09-30，design/features/main-panel.md §四）：
        // **一次请求出全部卡片数据** = 任务定义投影 + 内存运行态（运行中 / 上次执行 / 下次执行）。
        // **不查库**：运行态全在内存摘要里（启动一条聚合 SQL 建索引 + Loop A/B 事件增量维护），
        // 定义指纹变了才重算刻度、刻度过期才就地前移 ⇒ 10 秒轮询的成本是一次内存遍历。
        // `?rev=` 带上一次的版本号：未变即回 unchanged（几十字节）。
        // ⚠️ 该参数只是省流量，**功能不依赖它**——宿主若不透传 query（`req.url` 是否带 query
        // 评审后仍无法离线核实，见 worklog/creation-edit-implementation.md），则 rev 取不到 ⇒
        // 照常返回全量，行为完全一致。
        kind: 'exact',
        path: `${DISPATCH_API_PREFIX}/tasks/overview`,
        handler: (req, res) => {
            if (req.method !== 'GET')
                return writeJson(res, 405, { ok: false, error: 'method-not-allowed' });
            if (!isTrustedDispatchRequest(req))
                return writeJson(res, 403, { ok: false, error: 'forbidden' });
            const nowMs = Date.now();
            const { rev, rows } = runtimeIndex.overview([...getTasks().values()], nowMs);
            const asked = queryOf(req, 'rev');
            if (asked !== '' && asked === String(rev))
                return writeJson(res, 200, { ok: true, unchanged: true });
            // `now` / `tickMs` 供客户端做「到点钳位」（排序抖动，2026-09-30）：`now` = 服务端当前时间
            // （客户端时钟可能与宿主有时差，判定「上一版刻度是否已过去」以它为准）；`tickMs` = 巡检间隔
            // （钳位时长跟着它走，不写死）。两者都是**只读**展示/排序辅助，不参与调度。
            writeJson(res, 200, { ok: true, rev, tasks: rows, now: nowMs, tickMs: getConfig()?.tickMs ?? 60_000 });
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
    // —— 插件设置页（基础信息 + 计时参数）HTTP 通道 ——
    // 本插件配置刻意非 volatile，官方 configForms 不可用，故设置表单走自有 HTTP 通道读写。
    // ⚠️ **GET / POST 必须合在一条路由里**：宿主 webServer 对重复 (kind, path) 注册**直接 throw**
    // （@deepseek-ai/dsh-host-webserver@0.2.0-rc.2 `lib/index.js` register：`duplicate exact route`），
    // 拆两条会在第二条抛错、把注册循环打断 ⇒ 其后的路由全部注册不上（2026-10-02 真机三面板 404 根因）。
    {
        kind: 'exact',
        path: `${DISPATCH_API_PREFIX}/config`,
        handler: async (req, res) => {
            if (req.method !== 'GET' && req.method !== 'POST') {
                writeJson(res, 405, { ok: false, error: 'method-not-allowed' });
                return;
            }
            if (!isTrustedDispatchRequest(req)) {
                writeJson(res, 403, { ok: false, error: 'forbidden' });
                return;
            }
            // GET = 读当前计时参数（设置页回填）。
            if (req.method === 'GET') {
                const config = getScopeConfig();
                writeJson(res, 200, {
                    ok: true,
                    config: {
                        tickMs: config.tickMs,
                        dispatchGraceMs: config.dispatchGraceMs,
                        leaseMs: config.leaseMs,
                        unknownGraceMs: config.unknownGraceMs,
                    },
                });
                return;
            }
            // POST = 写回（仅限计时字段，范围校验后经 scope.update 落盘并即时生效）。
            try {
                const body = JSON.parse(await readDispatchBody(req));
                const allowed = ['tickMs', 'dispatchGraceMs', 'leaseMs', 'unknownGraceMs'];
                const patch = {};
                for (const key of allowed) {
                    const raw = body[key];
                    if (raw === undefined)
                        continue;
                    if (typeof raw !== 'number' || !Number.isFinite(raw)) {
                        writeJson(res, 400, { ok: false, error: `invalid-${key}` });
                        return;
                    }
                    // 下限 1s、上限 7 天，避免误填把调度器打挂。
                    if (raw < 1000 || raw > 7 * 24 * 3600 * 1000) {
                        writeJson(res, 400, { ok: false, error: `out-of-range-${key}` });
                        return;
                    }
                    patch[key] = raw;
                }
                if (Object.keys(patch).length === 0) {
                    writeJson(res, 400, { ok: false, error: 'empty-patch' });
                    return;
                }
                const ok = await updateScopeConfig(patch);
                if (!ok) {
                    writeJson(res, 503, { ok: false, error: 'update-failed' });
                    return;
                }
                const config = getScopeConfig();
                writeJson(res, 200, {
                    ok: true,
                    config: {
                        tickMs: config.tickMs,
                        dispatchGraceMs: config.dispatchGraceMs,
                        leaseMs: config.leaseMs,
                        unknownGraceMs: config.unknownGraceMs,
                    },
                });
            }
            catch (error) {
                const message = error instanceof Error ? error.message : String(error);
                writeJson(res, message === 'body-too-large' ? 413 : 400, { ok: false, error: message });
            }
        },
    },
    {
        // 按任务 / 工作区检索执行记录（任务卡片「执行记录」面板 + 未来总查询页共用，决策 55）：
        //   GET /tasks/instances?taskId=&workspace=&status=a,b&from=&to=&cursor=&limit=
        // workspace 过滤：`task_instances` 无工作区列 ⇒ 由 tasksInline 反查 task_id 集合（不碰表结构）；
        // taskId 与 workspace 同时给时以 taskId 为准（单任务面板只用 taskId）。
        kind: 'exact',
        path: `${DISPATCH_API_PREFIX}/tasks/instances`,
        handler: (req, res) => {
            if (req.method !== 'GET')
                return writeJson(res, 405, { ok: false, error: 'method-not-allowed' });
            if (!isTrustedDispatchRequest(req))
                return writeJson(res, 403, { ok: false, error: 'forbidden' });
            const store = getStore();
            if (store === null)
                return writeJson(res, 503, { ok: false, error: 'store-not-ready' });
            const taskId = queryOf(req, 'taskId') || undefined;
            // 按会话 id 取（2026-10-03）：会话弹窗只拿得到会话 id ⇒ 自取实例行（快照 / 产出），
            // 保证「从哪进都同一个渲染」；一个会话最多一条实例行。
            const sessionId = queryOf(req, 'sessionId') || undefined;
            const workspace = queryOf(req, 'workspace') || undefined;
            const statusRaw = queryOf(req, 'status');
            // 逗号分隔多状态；非法值不拦——IN 子句参数化，查不到即为空，无注入面。
            const statuses = statusRaw === '' ? undefined : statusRaw.split(',').filter(s => s !== '');
            const limitRaw = queryOf(req, 'limit');
            const limit = limitRaw === '' || !Number.isFinite(Number(limitRaw)) ? undefined : Number(limitRaw);
            const taskIds = taskId === undefined && workspace !== undefined
                ? workspaceTaskIdsOf(runtimeRef.tasksInline, workspace)
                : undefined;
            const page = store.listInstancesByQuery({
                taskId,
                sessionId,
                taskIds,
                statuses,
                fromTs: queryOf(req, 'from') || undefined,
                toTs: queryOf(req, 'to') || undefined,
                cursor: queryOf(req, 'cursor') || undefined,
                limit,
            });
            // 会话弹窗场景（带 sessionId）：顺带把**附加文件的绝对路径**解析出来一起给（2026-10-03）。
            // 为什么必须服务端给：upload 型落在插件数据目录（客户端根本不知道 statePath），
            // link 型的基准是**工作区 title**（客户端没有 title → path 映射）⇒ 不给就点不开。
            // 解析不出 ⇒ null（绝不猜路径）。只在带 sessionId 时做，列表场景零成本。
            const rows = sessionId === undefined ? page.rows : page.rows.map(row => {
                const snap = parseInstanceSnapshot(row.snapshot ?? null);
                const assets = getAssets();
                const registry = getRegistry();
                return {
                    ...row,
                    attachmentPaths: (snap?.attachments ?? []).map(item => {
                        if (item.kind === 'upload') {
                            return assets === null ? null : attachmentAbsPath(assets, row.task_id, item.ref);
                        }
                        const fromTitle = item.workspace !== undefined && item.workspace !== '' && registry !== null
                            ? registry.list().find(workspace => workspace.title === item.workspace)?.path ?? null
                            : null;
                        const base = fromTitle ?? snap?.workspacePath ?? null;
                        return base === null ? null : path.join(base, item.ref);
                    }),
                };
            });
            writeJson(res, 200, { ok: true, rows, nextCursor: page.nextCursor });
        },
    },
    {
        // 按任务 / 工作区检索诊断日志（任务卡片「日志」面板 + 未来总查询页共用，决策 55）：
        //   GET /tasks/log?taskId=&workspace=&level=error,warn&keyword=&from=&to=&cursor=&limit=
        // keyword = message 子串（LIKE %kw%，参数化）；`task_id` 为 NULL 的启动汇总行不命中按任务 / 工作区过滤（符合直觉）。
        kind: 'exact',
        path: `${DISPATCH_API_PREFIX}/tasks/log`,
        handler: (req, res) => {
            if (req.method !== 'GET')
                return writeJson(res, 405, { ok: false, error: 'method-not-allowed' });
            if (!isTrustedDispatchRequest(req))
                return writeJson(res, 403, { ok: false, error: 'forbidden' });
            const store = getStore();
            if (store === null)
                return writeJson(res, 503, { ok: false, error: 'store-not-ready' });
            const taskId = queryOf(req, 'taskId') || undefined;
            const workspace = queryOf(req, 'workspace') || undefined;
            const levelRaw = queryOf(req, 'level');
            const levels = levelRaw === '' ? undefined : levelRaw.split(',').filter(s => s !== '');
            const limitRaw = queryOf(req, 'limit');
            const limit = limitRaw === '' || !Number.isFinite(Number(limitRaw)) ? undefined : Number(limitRaw);
            const taskIds = taskId === undefined && workspace !== undefined
                ? workspaceTaskIdsOf(runtimeRef.tasksInline, workspace)
                : undefined;
            const page = store.listLogsByQuery({
                taskId,
                taskIds,
                levels,
                keyword: queryOf(req, 'keyword') || undefined,
                fromTs: queryOf(req, 'from') || undefined,
                toTs: queryOf(req, 'to') || undefined,
                cursor: queryOf(req, 'cursor') || undefined,
                limit,
            });
            writeJson(res, 200, { ok: true, rows: page.rows, nextCursor: page.nextCursor });
        },
    },
    {
        // 某次执行的事件时间线（执行记录下钻，决策 55）：GET /tasks/events?instanceId=<uuid>
        // legacy `records` 标签从全局 debugSnapshot（最近 200 条）里捞 ⇒ 按任务面板改走按实例精确取。
        kind: 'exact',
        path: `${DISPATCH_API_PREFIX}/tasks/events`,
        handler: (req, res) => {
            if (req.method !== 'GET')
                return writeJson(res, 405, { ok: false, error: 'method-not-allowed' });
            if (!isTrustedDispatchRequest(req))
                return writeJson(res, 403, { ok: false, error: 'forbidden' });
            const store = getStore();
            if (store === null)
                return writeJson(res, 503, { ok: false, error: 'store-not-ready' });
            const instanceId = queryOf(req, 'instanceId');
            if (instanceId === '')
                return writeJson(res, 400, { ok: false, error: 'instanceId-required' });
            writeJson(res, 200, { ok: true, events: store.listEventsByInstance(instanceId) });
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
    /**
     * 主界面运行态内存索引（2026-09-30，design/features/main-panel.md §四）：
     * 卡片「运行中 / 上次执行 / 下次执行」的读源。**派生态、不入数据库**——
     * 状态库就绪后建一次索引（一条聚合 SQL），之后由 Loop A 落库 / Loop B 收口事件增量维护。
     */
    const runtimeIndex = createRuntimeIndex();
    /** 当前任务定义（含停用）：overview 路由组装卡片用；随 tick 同步。 */
    let panelTaskMap = new Map();
    /**
     * 「任务定义改了」的同步钩子：settings inject 内赋值为 safeTick（重跑一次 tick 即可刷新
     * panelTaskMap）。webServer 注入早于 settings ⇒ 只能先声明、后赋值。
     */
    let resyncTaskMap = null;
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
    /** settings inject 就绪后捕获的官方/降级作用域，供设置页经 scope.update 写回配置。 */
    let scopeRef = null;
    /** 设置页写回插件配置（仅计时字段经 route 校验后调用）；作用域未就绪时返回 false。 */
    const updateScopeConfig = async (patch) => {
        if (!scopeRef)
            return false;
        try {
            await scopeRef.update(patch);
            return true;
        }
        catch {
            return false;
        }
    };
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
        () => attachmentsDirRef, () => assetsRef, () => configRef, runtimeIndex, () => panelTaskMap, () => { resyncTaskMap?.(); }, () => configRef, updateScopeConfig)) {
            // 逐条容错：宿主对重复 (kind, path) 注册会 throw（dsh-host-webserver register），
            // 一条坏路由绝不能把后面的路由全部拖死（2026-10-02 真机「部分接口 404」的放大器）。
            try {
                webServer.register(route);
            }
            catch (error) {
                wctx.logger.warn(`[数据通道] 路由注册失败 ${route.path}：${error instanceof Error ? error.message : String(error)}`);
            }
        }
        wctx.logger.info('[数据通道] webServer 路由已注册：GET /api/task-dispatch-table/snapshot、GET /api/task-dispatch-table/db、GET /api/task-dispatch-table/options、GET/POST /api/task-dispatch-table/config、GET /api/task-dispatch-table/tasks/instances、GET /api/task-dispatch-table/tasks/log、GET /api/task-dispatch-table/tasks/events、POST /api/task-dispatch-table/session/unarchive、POST /api/task-dispatch-table/session/archive、POST /api/task-dispatch-table/tasks/enabled');
    });
    ctx.inject(['settings'], (sctx) => {
        const settings = sctx.settings;
        // 有 register 面 → 官方命名空间作用域（配置 live 生效）；无（0.1.7-rc.1）→ 降级为
        // 启动配置作用域，调度照跑（见 fallbackScope：不能因为缺 register 就整体不启动）。
        const scope = typeof settings.register === 'function'
            ? settings.register(SETTINGS_NS, Config, { base: initial })
            : fallbackScope(sctx, settings, initial);
        scopeRef = scope;
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
        const reconciler = createReconciler({ ctx: sctx, logger: teeLogger, store, options: reconcileOptions, runtime: runtimeIndex });
        const scheduler = createScheduler({
            ctx: sctx, logger: teeLogger, store, reconciler, runtime: runtimeIndex,
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
                panelTaskMap = taskMap;
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
        /**
         * 定义被改动的**唯一同步点**（2026-09-30 抽象统一）：保存 / 删除 / 启停等任何写路径改完
         * 都只调这一个 ⇒ ① 重解析任务表（刷新 panelTaskMap）② 让运行态索引重算展示指纹与下一
         * 刻度并按需 bump rev（客户端下一次轮询必定拿到新数据）。
         * ⚠️ 新增写路径时**只在这里加一处**，不要在各自 handler 里散着改内存。
         */
        resyncTaskMap = () => {
            safeTick();
            runtimeIndex.markDefinitionsChanged([...taskMap.values()]);
        };
        safeTick();
        // 主界面运行态**启动初始化一次**：一条聚合 SQL 取每任务最近执行 + 在飞行扫描 + 逐任务算下一刻度。
        // 之后全靠事件增量维护（Loop A 落库 / Loop B 收口），轮询不再查库。
        runtimeIndex.rebuild([...taskMap.values()], store);
        scheduler.startupDiagnostics();
        updateSnapshot(); // 启动诊断可能写 task_log，立即落一版快照
        sctx.on('dispose', () => {
            stopInterval();
            stopSweeper();
            store.close();
        });
    });
}
