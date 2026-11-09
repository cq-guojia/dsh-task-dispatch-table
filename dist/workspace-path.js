/**
 * 工作区相对路径的**唯一实现**（host / client 共用）。
 *
 * 纯字符串实现、刻意不引 `node:path`：客户端产物是单文件 bundle，Node 内置模块不可用
 * （`attachment-allowlist.ts` 头注释记录过同一约束）。
 *
 * 收口了此前分散的四份路径逻辑，各写一份必然漂移：
 *   · `attachment-allowlist.ts:isSafeAttachmentRef` —— 附件 ref 安全判据；
 *   · `client/task-file-context.tsx:upstreamAbsPath` —— 上游产出的相对→绝对；
 *   · `index.ts` 附件按来源工作区绝对化、`dispatch.ts` 下游依赖注入绝对化。
 *
 * 契约：存储层（`task_events` / `task_instances.outputs`）**始终存工作区相对路径**；
 * 只在两个边界转成绝对 —— 回执写 `deliverables/presented` 时、客户端读实例行展示时。
 * 这样零数据迁移，历史实例由展示侧按同一函数兜住。
 */
/** 绝对路径的字面判据：POSIX `/` 或 Windows 盘符（`C:\` / `C:/`）。 */
export function isAbsolutePath(path) {
    return path.startsWith('/') || /^[A-Za-z]:[\\/]/.test(path);
}
/**
 * 工作区相对引用是否安全：非空、不含 `..`、非绝对、不含反斜杠。
 * 回执归一已把 `\` 统一成 `/`，故仍含反斜杠一律视为异常输入。
 * 目录项（以 `/` 结尾）合法。
 */
export const isSafeWorkspaceRel = (ref) => ref !== ''
    && !ref.includes('..')
    && !isAbsolutePath(ref)
    && !ref.includes('\\');
/**
 * 相对路径 → 绝对路径（基准 = 该实例的工作区 path）。
 *
 * - 已绝对 ⇒ **原样返回**（幂等，可对同一路径重复调用）；
 * - 基准缺失、或相对引用不安全 ⇒ `null`，调用方按「如实降级」处理，
 *   **不拿当前工作区猜**（与 `task-file-context.tsx` 旧 `upstreamAbsPath` 同口径）。
 */
export function absWorkspacePath(base, rel) {
    if (base === null || base === undefined || base === '')
        return null;
    if (isAbsolutePath(rel))
        return rel;
    if (!isSafeWorkspaceRel(rel))
        return null;
    const trimmed = rel.replace(/^\.\//, '');
    return base.endsWith('/') || base.endsWith('\\') ? `${base}${trimmed}` : `${base}/${trimmed}`;
}
/**
 * 实例快照 → 本任务工作区 path。
 * 不强求整份快照合法：解析不出 / 字段缺失 ⇒ `null`（调用方按「未知」降级，不猜）。
 */
export function workspacePathOf(snapshot) {
    if (snapshot === null || snapshot === undefined || snapshot === '')
        return null;
    try {
        const parsed = JSON.parse(snapshot);
        if (typeof parsed !== 'object' || parsed === null)
            return null;
        const path = parsed.workspacePath;
        return typeof path === 'string' && path !== '' ? path : null;
    }
    catch {
        return null;
    }
}
