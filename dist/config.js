// 插件配置：schemastery z schema 一份两用——patch Config 导出 + ctx.settings 命名空间。
// schemastery 与宿主 vendor 同版本（宿主 vendor/schemastery package.json = 3.18.2 = npm @deepseek-ai/schemastery）。
import z from '@deepseek-ai/schemastery';
export const ConfigDefaults = {
    tickMs: 60_000,
    dispatchGraceMs: 60_000,
    leaseMs: 30 * 60_000,
    unknownGraceMs: 5 * 60_000,
};
export const Config = z.object({
    statePath: z.string().default(''),
    tickMs: z.number().default(ConfigDefaults.tickMs),
    dispatchGraceMs: z.number().default(ConfigDefaults.dispatchGraceMs),
    leaseMs: z.number().default(ConfigDefaults.leaseMs),
    unknownGraceMs: z.number().default(ConfigDefaults.unknownGraceMs),
    tasksDir: z.string().default('tasks'),
});
