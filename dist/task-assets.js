// 任务文件资产（2026-09-30，design/data-model.md §五）：提示词版本 / 整份配置快照 / 附加文件。
//
// **这一层只碰文件系统，不碰数据库**：任务定义的真源是 `tasksInline`（state.db meta 表），
// 版本与快照是「给人兜底」的副本，附件是落盘实体。目录名一律 = 任务 UUID（title/code 可改，
// 不能用来命名目录）。
//
// 布局：
//   <数据根>/tasks/<uuid>/prompt-versions/<时间戳>.md       一个版本一个文件（内容即提示词全文）
//   <数据根>/tasks/<uuid>/prompt-versions/<时间戳>.note     版本备注（填了才有）
//   <数据根>/tasks/<uuid>/snapshots/<时间戳>.json           整份配置快照
//   <数据根>/tasks/<uuid>/attachments/<原始文件名>           upload 型附件
//   <数据根>/task-attachments-tmp/                          上传临时区（每天清 N 天前）
//   <数据根>/task-attachments/                              旧平铺目录（迁移用，只出不进）
//
// 文件名 = 纯时间戳（yyyyMMddTHHmmssSSS，本地墙上时间）⇒ 字典序 = 时间序，
// 读目录即得版本列表，不需要序号维护、不需要索引文件。
import { copyFileSync, existsSync, mkdirSync, readdirSync, readFileSync, rmSync, statSync, writeFileSync, } from 'node:fs';
import { isSafeAttachmentRef } from './attachment-allowlist.js';
import { basename, dirname, extname, join } from 'node:path';
/** 任务目录根名。 */
export const TASKS_DIR_NAME = 'tasks';
/** 上传临时区（新上传先落这里，保存时才搬进任务目录）。 */
export const TMP_DIR_NAME = 'task-attachments-tmp';
/** 旧平铺目录（历史上传落在插件数据根下，迁移期只读不写）。 */
export const LEGACY_DIR_NAME = 'task-attachments';
export function assetPaths(statePath) {
    const dataRoot = dirname(statePath);
    return {
        dataRoot,
        tasksRoot: join(dataRoot, TASKS_DIR_NAME),
        tmpDir: join(dataRoot, TMP_DIR_NAME),
        legacyDir: join(dataRoot, LEGACY_DIR_NAME),
    };
}
/** 任务目录（id 必须是 UUID，防路径穿越——校验由调用方 `isUuid` 保证）。 */
export function taskDirOf(paths, taskId) {
    return join(paths.tasksRoot, taskId);
}
// ─────────────────────── 文件名与时间戳 ───────────────────────
/**
 * 落盘文件名清洗：**保留原始文件名（含中文与空格）**，只去掉路径分隔符、系统非法字符与控制字符。
 * 用户要自己看得懂、自己管理；改成 UID 就没法管了。
 */
export function safeFileName(name) {
    const base = basename(name.replace(/\\/g, '/')).trim();
    const cleaned = base.replace(/[\u0000-\u001f/\\:*?"<>|]/g, '_').replace(/^\.+/, '').trim();
    const cut = cleaned.length > 120 ? cleaned.slice(0, 120) : cleaned;
    return cut === '' ? 'file' : cut;
}
/** 时间戳文件名（本地墙上时间，毫秒）：字典序 = 时间序。 */
export function stampOf(date) {
    const p = (n, width = 2) => String(n).padStart(width, '0');
    return `${date.getFullYear()}${p(date.getMonth() + 1)}${p(date.getDate())}`
        + `T${p(date.getHours())}${p(date.getMinutes())}${p(date.getSeconds())}${p(date.getMilliseconds(), 3)}`;
}
/** 时间戳文件名 → ISO 串（按本地时间解析；解不出返回原名，绝不编造时间）。 */
export function stampToIso(stamp) {
    const m = /^(\d{4})(\d{2})(\d{2})T(\d{2})(\d{2})(\d{2})(\d{3})$/.exec(stamp);
    if (m === null)
        return stamp;
    const d = new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]), Number(m[4]), Number(m[5]), Number(m[6]), Number(m[7]));
    return Number.isNaN(d.getTime()) ? stamp : d.toISOString();
}
/** 同名冲突：在扩展名前加「 2」「 3」……（不覆盖已有文件）。 */
function uniqueTarget(dir, fileName) {
    if (!existsSync(join(dir, fileName)))
        return fileName;
    const dot = extname(fileName);
    const stem = dot === '' ? fileName : fileName.slice(0, -dot.length);
    for (let i = 2; i < 1000; i++) {
        const candidate = `${stem} ${i}${dot}`;
        if (!existsSync(join(dir, candidate)))
            return candidate;
    }
    return `${stem} ${Date.now()}${dot}`;
}
/** 读目录里的文件名（只取普通文件），按名字排序 ⇒ 时间序。 */
function listFiles(dir, ext) {
    if (!existsSync(dir))
        return [];
    return readdirSync(dir)
        .filter(name => name.endsWith(ext) && !name.startsWith('.'))
        .filter(name => {
        try {
            return statSync(join(dir, name)).isFile();
        }
        catch {
            return false;
        }
    })
        .sort();
}
/** 版本列表：新的在前。 */
export function listVersions(paths, taskId) {
    const dir = join(taskDirOf(paths, taskId), 'prompt-versions');
    return listFiles(dir, '.md').reverse().map(file => {
        const stamp = file.slice(0, -3);
        const noteFile = join(dir, `${stamp}.note`);
        let note = '';
        if (existsSync(noteFile)) {
            try {
                note = readFileSync(noteFile, 'utf8');
            }
            catch {
                note = '';
            }
        }
        return { file, ts: stampToIso(stamp), note };
    });
}
/** 最新版本的内容（用于「变了才留版」的比较基准）。 */
export function latestVersionContent(paths, taskId) {
    const first = listVersions(paths, taskId)[0];
    if (first === undefined)
        return null;
    try {
        return readFileSync(join(taskDirOf(paths, taskId), 'prompt-versions', first.file), 'utf8');
    }
    catch {
        return null;
    }
}
/**
 * 留一版提示词：**与最新版本不同才写**（去首尾空白比较 ⇒ 只按了个回车不算改动）。
 * 目录里没有版本（新建首次保存）⇒ 无条件写。
 * @returns `created=false` 表示内容没变、没留新版。
 */
export function saveVersion(paths, taskId, content, note) {
    const dir = join(taskDirOf(paths, taskId), 'prompt-versions');
    mkdirSync(dir, { recursive: true });
    const latest = latestVersionContent(paths, taskId);
    if (latest !== null && latest.trim() === content.trim())
        return { created: false, file: '' };
    const stamp = stampOf(new Date());
    writeFileSync(join(dir, `${stamp}.md`), content, 'utf8');
    if (note.trim() !== '')
        writeFileSync(join(dir, `${stamp}.note`), note.trim(), 'utf8');
    return { created: true, file: `${stamp}.md` };
}
/** 读某个版本的提示词全文（文件不存在 ⇒ null，绝不返回假内容）。 */
export function readVersion(paths, taskId, file) {
    const target = join(taskDirOf(paths, taskId), 'prompt-versions', basename(file));
    if (!target.endsWith('.md') || !existsSync(target))
        return null;
    try {
        return readFileSync(target, 'utf8');
    }
    catch {
        return null;
    }
}
/** 删除一个版本（用户在版本面板自己删；系统**从不**自动删）。 */
export function deleteVersion(paths, taskId, file) {
    const dir = join(taskDirOf(paths, taskId), 'prompt-versions');
    const stamp = basename(file).endsWith('.md') ? basename(file).slice(0, -3) : basename(file);
    let removed = false;
    for (const name of [`${stamp}.md`, `${stamp}.note`]) {
        const target = join(dir, name);
        if (!existsSync(target))
            continue;
        try {
            rmSync(target);
            removed = true;
        }
        catch { /* 单个删不掉不致命 */ }
    }
    return removed;
}
/** 快照列表：新的在前。 */
export function listSnapshots(paths, taskId) {
    const dir = join(taskDirOf(paths, taskId), 'snapshots');
    return listFiles(dir, '.json').reverse().map(file => ({ file, ts: stampToIso(file.slice(0, -5)) }));
}
/**
 * 留一份整份配置快照：**与最新快照不同才写**（连点保存不刷屏）。
 * @param definition 任务定义对象（含 id；快照就是它的原文）。
 */
export function saveSnapshot(paths, taskId, definition) {
    const dir = join(taskDirOf(paths, taskId), 'snapshots');
    const text = JSON.stringify(definition, null, 2);
    const latest = listSnapshots(paths, taskId)[0];
    if (latest !== undefined) {
        try {
            if (readFileSync(join(dir, latest.file), 'utf8') === text)
                return { created: false, file: '' };
        }
        catch { /* 读不出就当不同，照写 */ }
    }
    mkdirSync(dir, { recursive: true });
    const stamp = stampOf(new Date());
    writeFileSync(join(dir, `${stamp}.json`), text, 'utf8');
    return { created: true, file: `${stamp}.json` };
}
/** 读快照内容（解析失败 ⇒ null）。 */
export function readSnapshot(paths, taskId, file) {
    const target = join(taskDirOf(paths, taskId), 'snapshots', basename(file));
    if (!target.endsWith('.json') || !existsSync(target))
        return null;
    try {
        return JSON.parse(readFileSync(target, 'utf8'));
    }
    catch {
        return null;
    }
}
/** 删除一个快照。 */
export function deleteSnapshot(paths, taskId, file) {
    const target = join(taskDirOf(paths, taskId), 'snapshots', basename(file));
    if (!target.endsWith('.json') || !existsSync(target))
        return false;
    try {
        rmSync(target);
        return true;
    }
    catch {
        return false;
    }
}
const ATTACHMENT_PREFIX = 'attachments/';
/**
 * 附件落定第一步（保存时调用）：**只搬移、不真删**。
 * ① upload 型：临时区（或旧平铺目录）的文件 → 搬进 `tasks/<id>/attachments/<原始名>`，
 *    ref 改写为**相对任务目录**的路径；已在任务目录里的不动。
 * ② 上次有、这次没有的 upload 项只记进 `removed`（引用 diff），**真删由调用方在
 *    定义成功落库之后**调 `removeAttachmentFiles` 执行——顺序反了会「文件已删、
 *    落库失败」两头空（评审 P1#3）。
 * ③ link 型（工作区已有文件）只记引用，不复制、不搬。
 */
export function moveAttachmentsIn(paths, taskId, next, prev) {
    const dir = join(taskDirOf(paths, taskId), 'attachments');
    const missing = [];
    const removed = [];
    const errors = [];
    const out = [];
    for (const item of next) {
        if (item.kind !== 'upload') {
            out.push(item);
            continue;
        }
        // 已在任务目录（ref 形如 attachments/xxx 且文件在）⇒ 原地不动。
        if (item.ref.startsWith(ATTACHMENT_PREFIX) && existsSync(join(dir, item.ref.slice(ATTACHMENT_PREFIX.length)))) {
            out.push(item);
            continue;
        }
        const source = locateUploaded(paths, item.ref);
        if (source === null) {
            // 找不到：照常记进定义，由执行期兜住（缺失 ⇒ 不执行 + 记日志），并回报给 UI 提示重传。
            missing.push(item.name);
            out.push(item);
            continue;
        }
        try {
            mkdirSync(dir, { recursive: true });
            const target = uniqueTarget(dir, safeFileName(item.name));
            copyFileSync(source, join(dir, target));
            out.push({ ...item, ref: `${ATTACHMENT_PREFIX}${target}` });
        }
        catch {
            errors.push(item.name);
            out.push(item);
        }
    }
    // 被移除的 upload 项（上次有、这次没有）⇒ 只记名单，真删延后（见函数注释）。
    for (const item of prev) {
        if (item.kind !== 'upload')
            continue;
        if (next.some(candidate => candidate.ref === item.ref))
            continue;
        removed.push(item.ref);
    }
    return { attachments: out, missing, removed, errors };
}
/**
 * 附件落定第二步：真删被移除的文件（**必须在定义成功落库之后**调用）。
 * ref 白名单：任务目录相对路径（attachments/ 前缀）或旧平铺目录的纯文件名；
 * 含 `..` / 绝对路径 / 反斜杠的一律跳过（评审 P0#1：真删循环必须有与 locateUploaded 对称的防御）。
 * @returns 删除失败的展示名（进 errors）。
 */
export function removeAttachmentFiles(paths, taskId, removedRefs) {
    const dir = join(taskDirOf(paths, taskId), 'attachments');
    const failed = [];
    for (const ref of removedRefs) {
        if (!isSafeAttachmentRef(ref))
            continue;
        const target = ref.startsWith(ATTACHMENT_PREFIX)
            ? join(dir, ref.slice(ATTACHMENT_PREFIX.length))
            : join(paths.legacyDir, ref);
        if (!existsSync(target))
            continue;
        try {
            rmSync(target);
        }
        catch {
            failed.push(ref);
        }
    }
    return failed;
}
/**
 * 便捷组合：搬移 + 真删一步到位（冒烟与不关心时序的调用方用；
 * webServer 保存链路**必须**分两步走，见 moveAttachmentsIn 注释）。
 */
export function reconcileAttachments(paths, taskId, next, prev) {
    const moved = moveAttachmentsIn(paths, taskId, next, prev);
    const removeFailed = removeAttachmentFiles(paths, taskId, moved.removed);
    const removedNames = [];
    for (const ref of moved.removed) {
        const hit = prev.find(item => item.ref === ref);
        removedNames.push(hit !== undefined ? hit.name : ref);
    }
    return { ...moved, removed: removedNames, errors: [...moved.errors, ...removeFailed] };
}
/** 按 ref 定位**待搬移**的上传文件：临时区 → 旧平铺目录。找不到返回 null。 */
function locateUploaded(paths, ref) {
    if (!isSafeAttachmentRef(ref))
        return null;
    // ⚠️ 这里**不**放「任务目录」候选：调用方 `moveAttachmentsIn` 在调本函数**之前**已按
    // `attachmentAbsPath` 判过「已在任务目录就原地不动」，走到这里就说明它不在任务目录。
    // （2026-09-30 修：此前用 `join(paths.tasksRoot, ref)` 充当任务目录候选 —— 那个基准也是错的，
    // 正确基准是 `tasks/<任务id>/`，缺任务 id 根本拼不出来；删掉这个永不命中的假候选。）
    const candidates = [join(paths.tmpDir, ref), join(paths.legacyDir, ref)];
    for (const file of candidates) {
        if (!existsSync(file))
            continue;
        try {
            if (statSync(file).isFile())
                return file;
        }
        catch { /* 继续找下一个 */ }
    }
    return null;
}
/**
 * 附件绝对路径（执行期存在性校验 Loop A / Loop B、派发注入共用）。
 *
 * ref 的基准是**任务目录**：upload 型由 `moveAttachmentsIn` 落盘到 `<任务目录>/attachments/<文件名>`
 * 并把 ref 记成 `attachments/<文件名>` ⇒ **直接拼接**即可。
 *
 * ⚠️ 2026-09-30 真机修：此前把 `attachments/` 前缀**剥掉**再拼（拼成 `<任务目录>/<文件名>`，少一层），
 * 而写入侧与「已在任务目录」判断（`moveAttachmentsIn`）用的都是**带 `attachments/` 的**基准 ⇒
 * **任何带上传附件的任务恒被判「附件不存在」**：Loop A 不建实例行（`scheduler` 校验后 continue 在
 * `ensureInstance` 之前）、Loop B 不发动（`reconcile` 兜底同款）⇒ 执行记录里一条都没有、任务永不执行。
 */
export function attachmentAbsPath(paths, taskId, ref) {
    return join(taskDirOf(paths, taskId), ref);
}
// ─────────────────────── 清理与删除 ───────────────────────
/** 清上传临时区：删掉 mtime 早于 N 天前的文件（跨天调用一次即可）。 */
export function purgeTmp(paths, days) {
    const dir = paths.tmpDir;
    if (!existsSync(dir))
        return 0;
    const cutoff = Date.now() - days * 86_400_000;
    let removed = 0;
    for (const name of readdirSync(dir)) {
        const target = join(dir, name);
        try {
            const st = statSync(target);
            if (!st.isFile() || st.mtimeMs >= cutoff)
                continue;
            rmSync(target);
            removed++;
        }
        catch { /* 单个删不掉不影响整体 */ }
    }
    return removed;
}
/** 删除任务的整个目录（附件 + 版本 + 快照一起）。实例 / 事件保留在库里做审计。 */
export function deleteTaskAssets(paths, taskId) {
    const dir = taskDirOf(paths, taskId);
    if (!existsSync(dir))
        return false;
    try {
        rmSync(dir, { recursive: true, force: true });
        return true;
    }
    catch {
        return false;
    }
}
