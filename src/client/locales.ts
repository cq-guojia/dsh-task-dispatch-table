// 配置页文案字典（zh / en）。命名空间 = 'dsh-task-dispatch-table'，
// 经 ctx.locale.register 注册；slot 注册项的 locale: 声明把 t 席位合成进组件 props
// （注册面 settings.plugin.item，真机作业：dsh-session-title-pattern 的设置卡片）。
// 文案主体全中文（任务要求）；en 供非中文界面语言回退。

/** 本页渲染的全部字典键。 */
export type LocaleKey =
  | 'title' | 'description' | 'unavailable'
  | 'tasksInlineLabel' | 'tasksInlineHint' | 'invalidJson'
  | 'save' | 'saving' | 'saveFailed' | 'discard'
  | 'paramsTitle' | 'paramDefault'
  | 'paramStatePath' | 'paramTickMs' | 'paramDispatchGraceMs'
  | 'paramLeaseMs' | 'paramUnknownGraceMs' | 'paramTasksDir'

/** 中文文案。 */
export const zh: Record<LocaleKey, string> = {
  title: '任务调度表（dsh-task-dispatch-table）',
  description: '在下方编辑内嵌任务表 JSON；保存后写入用户配置层并即时生效，离开页面丢弃未保存的草稿。',
  unavailable: '设置命名空间当前不可用（插件未运行或宿主未提供），暂时无法配置。',
  tasksInlineLabel: '任务表（tasksInline，JSON 数组）',
  tasksInlineHint: '每项一个任务定义；非空时优先于任务目录 tasksDir。清空并保存 = 回到默认（空，改用 tasksDir）。',
  invalidJson: '任务表不是合法 JSON，已阻止保存；请修正后重试。',
  save: '保存',
  saving: '保存中…',
  saveFailed: '保存未生效：草稿已保留，请修改后重试（宿主可能拒绝了部分值或已有并发修改）。',
  discard: '放弃更改',
  paramsTitle: '运行参数（只读）',
  paramDefault: '（默认）',
  paramStatePath: '状态库路径 statePath',
  paramTickMs: '调度周期 tickMs（毫秒）',
  paramDispatchGraceMs: '派发宽限 dispatchGraceMs（毫秒）',
  paramLeaseMs: '运行租约 leaseMs（毫秒）',
  paramUnknownGraceMs: '观察宽限 unknownGraceMs（毫秒）',
  paramTasksDir: '任务目录 tasksDir',
}

/** English copy. */
export const en: Record<LocaleKey, string> = {
  title: 'Task dispatch table (dsh-task-dispatch-table)',
  description: 'Edit the inline task-table JSON below; saving writes the user settings layer and takes effect immediately. Unsaved drafts are dropped when you leave the page.',
  unavailable: 'The settings namespace is currently unavailable (plugin not running or not served by the host); configuration is disabled.',
  tasksInlineLabel: 'Task table (tasksInline, JSON array)',
  tasksInlineHint: 'One task definition per entry; when non-empty it takes precedence over tasksDir. Clear and save to fall back to the default (empty, use tasksDir).',
  invalidJson: 'The task table is not valid JSON; the save was blocked. Fix it and try again.',
  save: 'Save',
  saving: 'Saving…',
  saveFailed: 'The save did not land; your draft was kept for correction (the host may have rejected values or applied concurrent changes).',
  discard: 'Discard changes',
  paramsTitle: 'Runtime parameters (read-only)',
  paramDefault: '(default)',
  paramStatePath: 'State database path statePath',
  paramTickMs: 'Tick interval tickMs (ms)',
  paramDispatchGraceMs: 'Dispatch grace dispatchGraceMs (ms)',
  paramLeaseMs: 'Run lease leaseMs (ms)',
  paramUnknownGraceMs: 'Observation grace unknownGraceMs (ms)',
  paramTasksDir: 'Task directory tasksDir',
}
