// 插件配置：schemastery z schema 一份两用——patch Config 导出 + ctx.settings 命名空间。
// ⚠️ 升到 @deepseek-ai/schemastery ^3.18.4：rc.1 设置系统（SettingsForms）要求运行时可写字段
// 标 .volatile()（3.18.2 无此方法）；该版本与 dsh 0.1.7-rc.1 线一致（参考插件即依赖 ^3.18.4）。
import { homedir } from 'node:os';
import { join, resolve } from 'node:path';
import z from '@deepseek-ai/schemastery';
export const ConfigDefaults = {
    tickMs: 60_000,
    dispatchGraceMs: 60_000,
    leaseMs: 30 * 60_000,
    unknownGraceMs: 5 * 60_000,
};
export const Config = z.object({
    statePath: z.string().default(''),
    // ↓ rc.1（0.1.7-rc.1）要求运行时可写字段标 .volatile()：否则 SettingsForms.write 抛
    // "has no volatile fields" 写不进（宿主每 tick 写 debugSnapshot / 写回 tasksInline 都会失败）。
    // 标记为 volatile 的字段由 Loader 经 loader/volatile-update 提交，客户端 configForms 同步可见。
    tickMs: z.number().default(ConfigDefaults.tickMs).volatile(),
    dispatchGraceMs: z.number().default(ConfigDefaults.dispatchGraceMs).volatile(),
    leaseMs: z.number().default(ConfigDefaults.leaseMs).volatile(),
    unknownGraceMs: z.number().default(ConfigDefaults.unknownGraceMs).volatile(),
    tasksDir: z.string().default('tasks'),
    tasksInline: z.string().role('textarea').default('').volatile(),
    debugSnapshot: z.string().default('').volatile(),
    // 决策 22 漏斗第②层：留空 = 未配，派发时漏到下一层。解析结果只用于本次派发，不回写本字段。
    defaultProvider: z.string().default(''),
    defaultModel: z.string().default(''),
});
/**
 * rc.1 volatile 字段的解析结果是**带 get() 的引用**（非纯值）；读取时解包（与参考插件
 * dsh-task-board 的 readConfigField 同款）。非 volatile 字段原样返回；undefined/null 回落 fallback。
 * @param field - 配置字段（可能是 Volatile 引用或纯值）。
 * @param fallback - 字段缺失时的回落值。
 */
export function readConfigField(field, fallback) {
    if (field === undefined || field === null)
        return fallback;
    if (typeof field === 'object' && typeof field.get === 'function') {
        return field.get();
    }
    return field;
}
/**
 * 状态库路径（决策 14）：配置覆盖 > 宿主数据根 storages/dsh-task-dispatch-table/state.db。
 * 宿主数据根解析复刻 packages/util/home-paths/src/index.ts:87-100：配置路径 > $DSH_HOME > ~/.dsh。
 * 放 config.ts 而非 index.ts：scheduler/submit 也要用（避免 index 循环导入）。
 */
export function resolveStatePath(statePath) {
    if (statePath.trim().length > 0)
        return resolve(statePath);
    const raw = process.env['DSH_HOME'];
    const selected = raw !== undefined && raw.trim().length > 0 ? raw : join(homedir(), '.dsh');
    const home = selected === '~' || selected.startsWith('~/')
        ? join(homedir(), selected.slice(selected.length === 1 ? 1 : 2))
        : selected;
    return join(resolve(home), 'storages', 'dsh-task-dispatch-table', 'state.db');
}
