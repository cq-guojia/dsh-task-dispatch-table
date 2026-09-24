// 配置页文案字典（zh / en）。命名空间 = 'dsh-task-dispatch-table'，
// 经 ctx.locale.register 注册；slot 注册项的 locale: 声明把 t 席位合成进组件 props
// （注册面 settings.plugin.item，真机作业：dsh-session-title-pattern 的设置卡片）。
// 文案主体全中文（任务要求）；en 供非中文界面语言回退。

/** 本页渲染的全部字典键。 */
export type LocaleKey =
  | 'title' | 'description' | 'unavailable' | 'trayLabel'
  | 'tasksInlineLabel' | 'tasksInlineHint' | 'invalidJson'
  | 'save' | 'saving' | 'saveFailed' | 'discard'
  | 'paramsTitle' | 'paramDefault'
  | 'paramStatePath' | 'paramTickMs' | 'paramDispatchGraceMs'
  | 'paramLeaseMs' | 'paramUnknownGraceMs' | 'paramTasksDir'
  | 'paramDefaultProvider' | 'paramDefaultModel'
  | 'debugButton' | 'debugTitle' | 'debugClose' | 'debugEmpty' | 'debugRaw'
  | 'debugTasks' | 'debugWarns' | 'debugNoWarns'
  | 'debugInstances' | 'debugInstancesEmpty' | 'debugEvents' | 'debugEventsEmpty'
  | 'debugRefresh' | 'debugRefreshedAt' | 'debugAutoHint'
  | 'panelTitle' | 'backToConversation' | 'tabConfig' | 'tabRecords'
  | 'tasksParsedTitle' | 'tasksParsedEmpty'
  | 'colTask' | 'colTitle' | 'colSchedule' | 'colNext' | 'colSlot'
  | 'colStatus' | 'colAttempt' | 'colSession' | 'colUpdated'
  | 'colSeq' | 'colTs' | 'colKind' | 'colDetail'
  | 'filterStatus' | 'filterTask' | 'filterAll'
  | 'expandHint' | 'eventsOf' | 'eventsEmpty' | 'recordsHint'
  | 'viewSession' | 'viewSessionHint'
  | 'sessionViewerTitle' | 'sessionArgs' | 'sessionOutput'
  | 'sessionTurnError' | 'sessionMaxTokens' | 'sessionRetry' | 'sessionUnknownKind'
  | 'sessionLoading' | 'sessionEmpty' | 'sessionLoadFailed' | 'sessionLoadOlder'

/** 中文文案。 */
export const zh: Record<LocaleKey, string> = {
  title: '任务调度表（dsh-task-dispatch-table）',
  description: '用任务表驱动定时派发：配置任务、查看每次执行的记录。点击打开面板。',
  trayLabel: '任务调度',
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
  paramDefaultProvider: '默认模型 provider defaultProvider',
  paramDefaultModel: '默认模型 model defaultModel',
  debugButton: '打开面板（配置 / 执行记录）',
  debugTitle: '调试快照（临时面板，随宿主状态自动刷新）',
  debugClose: '关闭',
  debugRefresh: '刷新',
  debugRefreshedAt: '手动刷新于',
  debugAutoHint: '快照随宿主调度自动刷新（每 tick / 会话事件 / 5 分钟心跳）；时间为本机时区。',
  debugEmpty: '暂无快照：宿主完成一次调度（或派发 / 会话事件）后自动写入。若持续为空，说明宿主侧运行的还是旧版插件，请重装后重试。',
  debugRaw: '快照解析失败，原文如下：',
  debugTasks: '已加载任务',
  debugWarns: '最近告警 / 错误（≤20 条）',
  debugNoWarns: '（无）',
  debugInstances: '实例 task_instances',
  debugInstancesEmpty: '（尚无实例）',
  debugEvents: '事件 task_events（最近 200 条，旧 → 新）',
  debugEventsEmpty: '（尚无事件）',
  panelTitle: '任务调度表',
  backToConversation: '返回会话',
  tabConfig: '任务配置',
  tabRecords: '执行记录',
  tasksParsedTitle: '已解析的任务（id 由系统生成，改名字不影响历史）',
  tasksParsedEmpty: '（无任务：内嵌任务表为空且任务目录无合法定义）',
  colTask: '任务',
  colTitle: '名称',
  colSchedule: '周期',
  colNext: '下次执行',
  colSlot: '计划时刻',
  colStatus: '状态',
  colAttempt: '第几次',
  colSession: '会话',
  colUpdated: '更新于',
  colSeq: 'seq',
  colTs: '时间',
  colKind: '类型',
  colDetail: '详情',
  filterStatus: '状态筛选',
  filterTask: '任务筛选',
  filterAll: '全部',
  expandHint: '点击任意一行展开该次执行的事件时间线',
  eventsOf: '本次执行的事件',
  eventsEmpty: '（该次执行暂无事件，或已超出最近 200 条的快照窗口）',
  recordsHint: '一次执行 = 一个计划刻度（决策 25）；同一任务同一刻度只可能有一条 ⇒ 不会重复执行。',
  viewSession: '查看会话',
  viewSessionHint: '在面板内只读查看本次执行的会话记录（含归档会话）；简化渲染、不可续聊。',
  sessionViewerTitle: '会话记录（只读）',
  sessionArgs: '参数',
  sessionOutput: '输出',
  sessionTurnError: '轮次失败',
  sessionMaxTokens: '该轮达到输出上限',
  sessionRetry: '模型重试',
  sessionUnknownKind: '未支持的节点类型：',
  sessionLoading: '正在加载会话记录…',
  sessionEmpty: '该会话暂无可显示的记录（可能刚建窗或已被清理）。',
  sessionLoadFailed: '会话记录加载失败（会话可能已不可读）。',
  sessionLoadOlder: '加载更早记录',
}

/** English copy. */
export const en: Record<LocaleKey, string> = {
  title: 'Task dispatch table (dsh-task-dispatch-table)',
  description: 'Schedule agent tasks from a task table: configure tasks and review every run. Click to open the panel.',
  trayLabel: 'Task dispatch',
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
  paramDefaultProvider: 'Default model provider defaultProvider',
  paramDefaultModel: 'Default model defaultModel',
  debugButton: 'Open panel (config / runs)',
  debugTitle: 'Debug snapshot (temporary panel; auto-refreshes with host state)',
  debugClose: 'Close',
  debugRefresh: 'Refresh',
  debugRefreshedAt: 'Manual refresh at',
  debugAutoHint: 'Snapshot auto-refreshes with host scheduling (every tick / session event / 5-min heartbeat); times are in your local timezone.',
  debugEmpty: 'No snapshot yet: the host writes one after each scheduling pass (or dispatch / session event). If it stays empty, the host is still running an old plugin build — reinstall and retry.',
  debugRaw: 'Failed to parse the snapshot; raw text below:',
  debugTasks: 'Loaded tasks',
  debugWarns: 'Recent warnings / errors (≤20 entries)',
  debugNoWarns: '(none)',
  debugInstances: 'Instances task_instances',
  debugInstancesEmpty: '(no instances yet)',
  debugEvents: 'Events task_events (latest 200, oldest → newest)',
  debugEventsEmpty: '(no events yet)',
  panelTitle: 'Task dispatch table',
  backToConversation: 'Back to conversation',
  tabConfig: 'Configuration',
  tabRecords: 'Run records',
  tasksParsedTitle: 'Parsed tasks (ids are generated; renaming never breaks history)',
  tasksParsedEmpty: '(no tasks: inline table empty and task dir has no valid definition)',
  colTask: 'Task',
  colTitle: 'Title',
  colSchedule: 'Schedule',
  colNext: 'Next run',
  colSlot: 'Scheduled',
  colStatus: 'Status',
  colAttempt: 'Attempt',
  colSession: 'Session',
  colUpdated: 'Updated',
  colSeq: 'seq',
  colTs: 'Time',
  colKind: 'Kind',
  colDetail: 'Detail',
  filterStatus: 'Status filter',
  filterTask: 'Task filter',
  filterAll: 'All',
  expandHint: 'Click any row to expand the event timeline of that run',
  eventsOf: 'Events of this run',
  eventsEmpty: '(no events for this run, or it falls outside the latest-200 snapshot window)',
  recordsHint: 'One run = one schedule slot (decision 25); a task can only have one row per slot ⇒ no duplicate runs.',
  viewSession: 'View session',
  viewSessionHint: 'Read this run\'s session transcript in a read-only panel (archived sessions included); simplified rendering, no follow-up replies.',
  sessionViewerTitle: 'Session transcript (read-only)',
  sessionArgs: 'Arguments',
  sessionOutput: 'Output',
  sessionTurnError: 'Turn failed',
  sessionMaxTokens: 'This turn hit the output token cap',
  sessionRetry: 'Model retry',
  sessionUnknownKind: 'Unsupported node kind: ',
  sessionLoading: 'Loading session transcript…',
  sessionEmpty: 'Nothing to show for this session yet (window just opened, or the log was cleaned up).',
  sessionLoadFailed: 'Failed to load the session transcript (the session may no longer be readable).',
  sessionLoadOlder: 'Load earlier messages',
}
