window.__ModuleLoader__.load({
	id: "dsh-task-dispatch-table",
	factory: (require) => {
		var module = { exports: {} };
		var exports = module.exports;
		Object.defineProperty(exports, Symbol.toStringTag, { value: "Module" });
		let react = require("react");
		let _deepseek_ai_dsh_client_ui_primitives = require("@deepseek-ai/dsh-client-ui-primitives");
		let react_dom = require("react-dom");
		//#region src/client/locales.ts
		/** 把宿主给的无参 t 包成带占位符替换的 t（官方模板一律 `{name}`）。 */
		function interpolateTranslate(base) {
			return (key, params) => {
				const raw = base(key);
				if (params === void 0) return raw;
				return raw.replace(/\{(\w+)\}/g, (match, name) => name in params ? String(params[name]) : match);
			};
		}
		/** 中文文案。 */
		const zh = {
			title: "任务调度表（dsh-task-dispatch-table）",
			description: "用任务表驱动定时派发：配置任务、查看每次执行的记录。点击打开面板。",
			trayLabel: "任务调度",
			unavailable: "设置命名空间当前不可用（插件未运行或宿主未提供），暂时无法配置。",
			tasksInlineLabel: "任务表（tasksInline，JSON 数组）",
			tasksInlineHint: "每项一个任务定义；非空时优先于任务目录 tasksDir。清空并保存 = 回到默认（空，改用 tasksDir）。",
			invalidJson: "任务表不是合法 JSON，已阻止保存；请修正后重试。",
			save: "保存",
			saving: "保存中…",
			saveFailed: "保存未生效：草稿已保留，请修改后重试（宿主可能拒绝了部分值或已有并发修改）。",
			discard: "放弃更改",
			paramsTitle: "运行参数（只读）",
			paramDefault: "（默认）",
			paramStatePath: "状态库路径 statePath",
			paramTickMs: "调度周期 tickMs（毫秒）",
			paramDispatchGraceMs: "派发宽限 dispatchGraceMs（毫秒）",
			paramLeaseMs: "运行租约 leaseMs（毫秒）",
			paramUnknownGraceMs: "观察宽限 unknownGraceMs（毫秒）",
			paramTasksDir: "任务目录 tasksDir",
			paramDefaultProvider: "默认模型 provider defaultProvider",
			paramDefaultModel: "默认模型 model defaultModel",
			debugButton: "打开面板（配置 / 执行记录）",
			debugTitle: "调试快照（临时面板，随宿主状态自动刷新）",
			debugClose: "关闭",
			debugRefresh: "刷新",
			debugRefreshedAt: "手动刷新于",
			debugAutoHint: "快照随宿主调度自动刷新（每 tick / 会话事件 / 5 分钟心跳）；时间为本机时区。",
			debugEmpty: "暂无快照：宿主完成一次调度（或派发 / 会话事件）后自动写入。若持续为空，说明宿主侧运行的还是旧版插件，请重装后重试。",
			debugRaw: "快照解析失败，原文如下：",
			debugTasks: "已加载任务",
			debugWarns: "最近告警 / 错误（≤20 条）",
			debugNoWarns: "（无）",
			debugInstances: "实例 task_instances",
			debugInstancesEmpty: "（尚无实例）",
			debugEvents: "事件 task_events（最近 200 条，旧 → 新）",
			debugEventsEmpty: "（尚无事件）",
			panelTitle: "任务调度表",
			backToConversation: "返回会话",
			tabConfig: "任务配置",
			tabRecords: "执行记录",
			tabDebug: "调试",
			debugDbHint: "状态库（state.db）三张表的原始记录，只读展示：task_instances = 每次执行一行、task_events = 每个事件一行、meta = 插件元数据（含内嵌任务表）。每表最多显示最新 500 行，点右上角刷新重取。",
			debugDbLoading: "状态库读取中…",
			debugDbFail: "状态库读取失败（未就绪或请求被拒），稍后点刷新重试。",
			debugDbEmpty: "（空表：还没有任何记录）",
			debugDbTruncated: "行数超出上限，仅显示最新一部分",
			tasksParsedTitle: "已解析的任务（id 由系统生成，改名字不影响历史）",
			tasksParsedEmpty: "（无任务：内嵌任务表为空且任务目录无合法定义）",
			colTask: "任务",
			colTitle: "名称",
			colCode: "编号",
			colId: "任务ID",
			colSchedule: "周期",
			colNext: "下次执行",
			colSlot: "计划时刻",
			colStatus: "状态",
			colAttempt: "第几次",
			colSession: "会话",
			colUpdated: "更新于",
			colSeq: "seq",
			colTs: "时间",
			colKind: "类型",
			colDetail: "详情",
			filterStatus: "状态筛选",
			filterTask: "任务筛选",
			filterAll: "全部",
			expandHint: "点击任意一行展开该次执行的事件时间线",
			eventsOf: "本次执行的事件",
			eventsEmpty: "（该次执行暂无事件，或已超出最近 200 条的快照窗口）",
			recordsHint: "一次执行 = 一个计划刻度（决策 25）；同一任务同一刻度只可能有一条 ⇒ 不会重复执行。",
			viewSession: "查看会话",
			viewSessionHint: "在面板内只读查看本次执行的会话记录（含归档会话）；简化渲染、不可续聊。",
			sessionViewerTitle: "会话记录（只读）",
			sessionArgs: "参数",
			sessionOutput: "输出",
			sessionTurnError: "轮次失败",
			sessionMaxTokens: "该轮达到输出上限",
			sessionRetry: "模型重试",
			sessionUnknownKind: "未支持的节点类型：",
			sessionLoading: "正在加载会话记录…",
			sessionEmpty: "该会话暂无可显示的记录（可能刚建窗或已被清理）。",
			sessionLoadFailed: "会话记录加载失败（会话可能已不可读）。",
			sessionLoadOlder: "加载更早记录",
			sessionProcess: "过程",
			triggerRequest: "收到执行请求",
			triggerGoal: "继续执行目标",
			triggerAgent: "收到任务消息",
			triggerTeam: "收到团队消息",
			triggerSubagent: "子任务状态更新",
			triggerGithub: "收到 GitHub 事件",
			triggerWebhook: "收到外部事件",
			triggerSchedule: "定时任务",
			triggerJob: "后台任务状态更新",
			triggerPlugin: "插件状态更新",
			triggerExplanation: "这条通知触发了本轮回复。",
			turnProcessTook: "用时 {duration}",
			turnProcessDeepDiving: "深度求索中，用时{duration}",
			turnProcessWorked: "已完成工作",
			turnProcessFailed: "处理失败",
			turnStopped: "已停止",
			chatDeepDiving: "深度求索中",
			thinkLabel: "思考",
			durationSeconds: "{seconds}秒",
			durationMinutes: "{minutes}分{seconds}秒",
			durationHours: "{hours}小时{minutes}分{seconds}秒",
			clockDate: "{m}月{d}日",
			clockDateYear: "{y}年{m}月{d}日",
			copyLabel: "复制",
			copiedLabel: "已复制",
			branchLabel: "在新对话中分支",
			branchUnavailableLabel: "只读会话记录不可分支",
			turnUsageTitle: "本轮用量",
			turnUsageModel: "提供方 / 模型",
			turnUsageCacheHit: "缓存命中",
			turnUsageInput: "未缓存输入",
			turnUsageCacheRead: "缓存读取",
			turnUsageCacheWrite: "缓存写入",
			turnUsageOutput: "输出",
			turnUsageReasoning: "（其中推理 {tokens}）",
			turnUsageConsumed: "用量 {total}",
			turnUsageCount: "{count} tok",
			numberThousand: "{value}K",
			numberMillion: "{value}M",
			numberGroupSeparator: ",",
			stepProcessDoneThinking: "已完成分析",
			stepProcessDoneRead: "已读取文件",
			stepProcessDoneReadImage: "已读取图片",
			stepProcessDoneWrite: "已写入文件",
			stepProcessDoneSearch: "已搜索代码",
			stepProcessDoneEdit: "修改了文件",
			stepProcessDoneCommands: "执行了命令",
			stepProcessDoneCode: "运行了代码",
			stepProcessDoneWebSearch: "已搜索网页",
			stepProcessDoneWebFetch: "已访问网页",
			stepProcessDoneSubagents: "已协调子智能体",
			stepProcessDonePlan: "更新了计划",
			stepProcessDoneQuestions: "向用户提出了问题",
			stepProcessDoneTools: "已调用工具",
			stepProcessJoinTwo: "{first}并{second}",
			stepProcessComma: "，",
			stepProcessSharedPrefix: "已",
			stepProcessMore: "{title}等",
			toolTitleRead: "读取",
			toolTitleReadImage: "读取图片",
			toolTitleGrep: "搜索文件内容",
			toolTitleGlob: "查找文件",
			toolTitleBash: "运行命令",
			toolTitleWrite: "写入",
			toolTitleEdit: "编辑",
			toolTitleCode: "代码",
			toolTitleWebSearch: "网页搜索",
			toolTitleWebFetch: "网页获取",
			toolTitleGeneric: "工具调用",
			toolInputLabel: "输入",
			toolOutputLabel: "输出",
			codeBlockLabel: "代码块",
			diffWrapLabel: "自动换行",
			diffUnwrapLabel: "取消换行",
			diffCollapseAria: "收起差异",
			diffExpandAria: "展开其余 {count} 行差异",
			diffCollapseLabel: "收起",
			diffExpandRest: "… 其余 {count} 行",
			continueBranch: "继续对话",
			forkConfirmTitle: "开分支继续对话",
			forkConfirmText: "是否需要基于此会话开一个新分支继续对话？原会话保持只读留档，新分支复制本会话内容并可继续对话。",
			forkConfirmAccept: "开分支并跳转",
			forkCancel: "取消",
			forkWorking: "正在开分支…",
			forkFailed: "开分支失败：{error}"
		};
		/** English copy. */
		const en = {
			title: "Task dispatch table (dsh-task-dispatch-table)",
			description: "Schedule agent tasks from a task table: configure tasks and review every run. Click to open the panel.",
			trayLabel: "Task dispatch",
			unavailable: "The settings namespace is currently unavailable (plugin not running or not served by the host); configuration is disabled.",
			tasksInlineLabel: "Task table (tasksInline, JSON array)",
			tasksInlineHint: "One task definition per entry; when non-empty it takes precedence over tasksDir. Clear and save to fall back to the default (empty, use tasksDir).",
			invalidJson: "The task table is not valid JSON; the save was blocked. Fix it and try again.",
			save: "Save",
			saving: "Saving…",
			saveFailed: "The save did not land; your draft was kept for correction (the host may have rejected values or applied concurrent changes).",
			discard: "Discard changes",
			paramsTitle: "Runtime parameters (read-only)",
			paramDefault: "(default)",
			paramStatePath: "State database path statePath",
			paramTickMs: "Tick interval tickMs (ms)",
			paramDispatchGraceMs: "Dispatch grace dispatchGraceMs (ms)",
			paramLeaseMs: "Run lease leaseMs (ms)",
			paramUnknownGraceMs: "Observation grace unknownGraceMs (ms)",
			paramTasksDir: "Task directory tasksDir",
			paramDefaultProvider: "Default model provider defaultProvider",
			paramDefaultModel: "Default model defaultModel",
			debugButton: "Open panel (config / runs)",
			debugTitle: "Debug snapshot (temporary panel; auto-refreshes with host state)",
			debugClose: "Close",
			debugRefresh: "Refresh",
			debugRefreshedAt: "Manual refresh at",
			debugAutoHint: "Snapshot auto-refreshes with host scheduling (every tick / session event / 5-min heartbeat); times are in your local timezone.",
			debugEmpty: "No snapshot yet: the host writes one after each scheduling pass (or dispatch / session event). If it stays empty, the host is still running an old plugin build — reinstall and retry.",
			debugRaw: "Failed to parse the snapshot; raw text below:",
			debugTasks: "Loaded tasks",
			debugWarns: "Recent warnings / errors (≤20 entries)",
			debugNoWarns: "(none)",
			debugInstances: "Instances task_instances",
			debugInstancesEmpty: "(no instances yet)",
			debugEvents: "Events task_events (latest 200, oldest → newest)",
			debugEventsEmpty: "(no events yet)",
			panelTitle: "Task dispatch table",
			backToConversation: "Back to conversation",
			tabConfig: "Configuration",
			tabRecords: "Run records",
			tabDebug: "Debug",
			debugDbHint: "Raw rows of all three state.db tables, read-only: task_instances = one row per run, task_events = one row per event, meta = plugin metadata (incl. the inline task table). Newest 500 rows per table; use the refresh button to re-fetch.",
			debugDbLoading: "Loading state.db…",
			debugDbFail: "Failed to read state.db (not ready or request rejected); retry with the refresh button.",
			debugDbEmpty: "(empty table: no rows yet)",
			debugDbTruncated: "row count exceeds the cap, showing only the newest rows",
			tasksParsedTitle: "Parsed tasks (ids are generated; renaming never breaks history)",
			tasksParsedEmpty: "(no tasks: inline table empty and task dir has no valid definition)",
			colTask: "Task",
			colTitle: "Title",
			colCode: "Code",
			colId: "Task ID",
			colSchedule: "Schedule",
			colNext: "Next run",
			colSlot: "Scheduled",
			colStatus: "Status",
			colAttempt: "Attempt",
			colSession: "Session",
			colUpdated: "Updated",
			colSeq: "seq",
			colTs: "Time",
			colKind: "Kind",
			colDetail: "Detail",
			filterStatus: "Status filter",
			filterTask: "Task filter",
			filterAll: "All",
			expandHint: "Click any row to expand the event timeline of that run",
			eventsOf: "Events of this run",
			eventsEmpty: "(no events for this run, or it falls outside the latest-200 snapshot window)",
			recordsHint: "One run = one schedule slot (decision 25); a task can only have one row per slot ⇒ no duplicate runs.",
			viewSession: "View session",
			viewSessionHint: "Read this run's session transcript in a read-only panel (archived sessions included); simplified rendering, no follow-up replies.",
			sessionViewerTitle: "Session transcript (read-only)",
			sessionArgs: "Arguments",
			sessionOutput: "Output",
			sessionTurnError: "Turn failed",
			sessionMaxTokens: "This turn hit the output token cap",
			sessionRetry: "Model retry",
			sessionUnknownKind: "Unsupported node kind: ",
			sessionLoading: "Loading session transcript…",
			sessionEmpty: "Nothing to show for this session yet (window just opened, or the log was cleaned up).",
			sessionLoadFailed: "Failed to load the session transcript (the session may no longer be readable).",
			sessionLoadOlder: "Load earlier messages",
			sessionProcess: "Process",
			triggerRequest: "Execution request received",
			triggerGoal: "Continuing the goal",
			triggerAgent: "Task message received",
			triggerTeam: "Team message received",
			triggerSubagent: "Subagent status update",
			triggerGithub: "GitHub event received",
			triggerWebhook: "External event received",
			triggerSchedule: "Scheduled task",
			triggerJob: "Background task status update",
			triggerPlugin: "Plugin status update",
			triggerExplanation: "This notification triggered the reply below.",
			turnProcessTook: "Took {duration}",
			turnProcessDeepDiving: "Thinking, {duration}",
			turnProcessWorked: "Work completed",
			turnProcessFailed: "Failed",
			turnStopped: "Stopped",
			chatDeepDiving: "Thinking",
			thinkLabel: "Think",
			durationSeconds: "{seconds}s",
			durationMinutes: "{minutes}m {seconds}s",
			durationHours: "{hours}h {minutes}m {seconds}s",
			clockDate: "{m}/{d}",
			clockDateYear: "{y}/{m}/{d}",
			copyLabel: "Copy",
			copiedLabel: "Copied",
			branchLabel: "Branch into a new conversation",
			branchUnavailableLabel: "A read-only transcript cannot be branched",
			turnUsageTitle: "Turn usage",
			turnUsageModel: "Provider / model",
			turnUsageCacheHit: "Cache hit",
			turnUsageInput: "Uncached input",
			turnUsageCacheRead: "Cached input",
			turnUsageCacheWrite: "Cache write",
			turnUsageOutput: "Output",
			turnUsageReasoning: " ({tokens} reasoning)",
			turnUsageConsumed: "Usage {total}",
			turnUsageCount: "{count} tok",
			numberThousand: "{value}K",
			numberMillion: "{value}M",
			numberGroupSeparator: ",",
			stepProcessDoneThinking: "Analysis completed",
			stepProcessDoneRead: "Read files",
			stepProcessDoneReadImage: "Read images",
			stepProcessDoneWrite: "Wrote files",
			stepProcessDoneSearch: "Searched code",
			stepProcessDoneEdit: "Edited files",
			stepProcessDoneCommands: "Ran commands",
			stepProcessDoneCode: "Ran code",
			stepProcessDoneWebSearch: "Searched the web",
			stepProcessDoneWebFetch: "Fetched web pages",
			stepProcessDoneSubagents: "Coordinated subagents",
			stepProcessDonePlan: "Updated the plan",
			stepProcessDoneQuestions: "Asked you questions",
			stepProcessDoneTools: "Called tools",
			stepProcessJoinTwo: "{first} and {second}",
			stepProcessComma: ", ",
			stepProcessSharedPrefix: "",
			stepProcessMore: "{title}, etc.",
			toolTitleRead: "Read",
			toolTitleReadImage: "Read image",
			toolTitleGrep: "Search file contents",
			toolTitleGlob: "Find files",
			toolTitleBash: "Run command",
			toolTitleWrite: "Write",
			toolTitleEdit: "Edit",
			toolTitleCode: "Code",
			toolTitleWebSearch: "Web search",
			toolTitleWebFetch: "Web fetch",
			toolTitleGeneric: "Tool call",
			toolInputLabel: "Input",
			toolOutputLabel: "Output",
			codeBlockLabel: "Code",
			diffWrapLabel: "Wrap lines",
			diffUnwrapLabel: "Unwrap lines",
			diffCollapseAria: "Collapse diff",
			diffExpandAria: "Expand {count} more diff lines",
			diffCollapseLabel: "Collapse",
			diffExpandRest: "… {count} more lines",
			continueBranch: "Continue conversation",
			forkConfirmTitle: "Fork to continue",
			forkConfirmText: "Start a new branch from this session to continue the conversation? The original stays read-only; the branch copies this conversation and can continue.",
			forkConfirmAccept: "Fork & open",
			forkCancel: "Cancel",
			forkWorking: "Forking…",
			forkFailed: "Fork failed: {error}"
		};
		//#endregion
		//#region src/client/archive-session-css.ts
		/** 弹窗根类名前缀（稳定，不随宿主哈希变化）。 */
		const SV_STYLE_ID = "dsh-task-dispatch-table-archive-session";
		/** 归档会话弹窗全部样式规则（一条 <style> 注入，见 ensureArchiveSessionStyle）。 */
		const ARCHIVE_SESSION_CSS = `
.dsh-tdt-sv-overlay{position:fixed;inset:0;z-index:1000;display:flex;align-items:center;justify-content:center;background:var(--dsw-alias-bg-mask-1,rgba(0,0,0,.45));}
/* 尺寸照抄宿主「左下角弹窗」卡片（dsh-context .lc-ov-card）：width min(1120px,100vw-32px)、height 100%-80px（遮罩满屏 ⇒ 等价 100vh-80px）、radius 12px、padding 16px 18px 18px。 */
/* 内间距定尺（用户拍板：不按官方内容列宽算）：官方 scroll = 16px + side-clearance ⇒ clearance 给 8px = 左右各 24px 定尺；内容列不设上限（100%）。 */
/* 面板底色 = 官方会话面 --dsw-alias-bg-base（官方 chat 页即此色）：
   官方 ReasoningRow 展开行是 sticky + background:var(--dsw-alias-bg-base)（ReasoningRow.module.css），
   若面板用 layer-1 会比行底色浅 ⇒ 展开思考时出现一条更黑的带（真机踩过）；统一 bg-base 即消失。 */
/* 内间距定尺（用户拍板：四边等距 34px）。纵向全在会话区上：官方 scroll 纵向固定 16px，
   面板不再吃纵向 padding（否则只会加在标题栏外侧，标题分割线与首条消息之间仍是 16px——真机踩过），
   由 .dsh-tdt-sv-frame 补 18px ⇒ 标题线下 16+18=34、底部 16+18=34；左右 = 16 + clearance(18px) = 34。 */
.dsh-tdt-sv-panel{--dsh-composer-side-clearance:18px;--dsh-chat-content-width:100%;--dsh-chat-flow-gap:16px;background:var(--dsw-alias-bg-base,#1a1a1a);color:var(--dsw-alias-label-primary,#1f2328);border:1px solid var(--dsw-alias-border-l2,rgba(128,128,128,.35));border-radius:12px;box-shadow:var(--dsw-shadow-lv3,0 12px 32px rgba(0,0,0,.4));width:min(1120px,calc(100vw - 32px));height:calc(100% - 80px);display:flex;flex-direction:column;box-sizing:border-box;overflow:hidden;}
.dsh-tdt-sv-header{display:flex;align-items:center;justify-content:space-between;gap:12px;padding:18px 34px 12px;border-bottom:1px solid var(--dsw-alias-border-l2,rgba(128,128,128,.35));flex-wrap:wrap;}
.dsh-tdt-sv-frame{padding:18px 0;}
/* 头部关闭钮规格照官方 primitives Modal.close（设置窗口关闭钮同源）：28×28、radius-sm、
   透明底，hover 才出 interactive-bg-hover（官方无色变、无阴影）。 */
.dsh-tdt-sv-close{appearance:none;background:0 0;border:none;flex:none;width:28px;height:28px;border-radius:var(--dsw-radius-sm,6px);cursor:pointer;color:var(--dsw-alias-label-secondary,rgba(128,128,128,.95));display:inline-flex;align-items:center;justify-content:center;transition:background var(--ds-transition-duration,.15s) var(--ds-ease-in-out,ease);}
.dsh-tdt-sv-close:hover{background:var(--dsw-alias-interactive-bg-hover,rgba(128,128,128,.16));}
.dsh-tdt-sv-heading{min-width:0;}
.dsh-tdt-sv-title{font-size:15px;font-weight:600;color:var(--dsw-alias-label-primary,#1f2328);}
.dsh-tdt-sv-sid{font-family:var(--ds-font-family-code,ui-monospace,SFMono-Regular,Menlo,Consolas,monospace);font-size:11px;color:var(--dsw-alias-label-tertiary,rgba(128,128,128,.8));word-break:break-all;}
.dsh-tdt-sv-actions{display:flex;align-items:center;gap:8px;}
.dsh-tdt-sv-btn{appearance:none;font:inherit;font-size:12px;line-height:18px;cursor:pointer;color:var(--dsw-alias-label-primary,#1f2328);background:var(--dsw-alias-bg-layer-2,rgba(128,128,128,.14));border:1px solid var(--dsw-alias-border-l2,rgba(128,128,128,.35));border-radius:8px;padding:4px 12px;transition:background var(--ds-transition-duration,.15s) var(--ds-ease-in-out,ease);}
.dsh-tdt-sv-btn:hover{background:var(--dsw-alias-interactive-bg-hover,rgba(128,128,128,.16));}
.dsh-tdt-sv-btn-icon{padding:4px 6px;display:inline-flex;align-items:center;justify-content:center;}
/* 会话区边距 = 官方 ChatView.scroll：16px + --dsh-composer-side-clearance(18px) ⇒ 左右各 34px；纵向由 frame 补足。 */
.dsh-tdt-sv-body{flex:1;min-height:0;overflow:auto;padding:16px calc(var(--dsh-composer-side-clearance,16px) + 16px) 16px;}
.dsh-tdt-sv-col{width:100%;max-width:var(--dsh-chat-content-width,920px);margin:0 auto;display:flex;flex-direction:column;gap:var(--dsh-chat-flow-gap,16px);}
/* 官方 ChatView.column 的兄弟间距（:not([hidden]) 才占位；折叠掉的过程节点不留空档）。 */
.dsh-tdt-sv-col>:not([hidden]):not(.dsh-tdt-sv-flowitem:empty)~:not([hidden]):not(.dsh-tdt-sv-flowitem:empty){margin-top:var(--dsh-chat-flow-gap,16px);}
.dsh-tdt-sv-visuallyhidden{position:absolute;width:1px;height:1px;margin:-1px;padding:0;overflow:hidden;clip:rect(0,0,0,0);white-space:nowrap;border:0;}
.dsh-tdt-sv-flowitem{min-width:0;}
.dsh-tdt-sv-official{flex:1;min-height:0;display:flex;flex-direction:column;overflow:hidden;}
.dsh-tdt-sv-older{display:flex;justify-content:center;}
.dsh-tdt-sv-older button{appearance:none;font:inherit;font-size:12px;line-height:18px;cursor:pointer;color:var(--dsw-alias-label-secondary,rgba(128,128,128,.9));background:var(--dsw-alias-interactive-bg-hover-solid,rgba(128,128,128,.2));border:none;border-radius:var(--dsw-radius-sm,6px);padding:4px 12px;}
.dsh-tdt-sv-older button:disabled{cursor:default;opacity:.6;}
.dsh-tdt-sv-process{box-sizing:border-box;width:100%;min-width:0;height:calc(33px + var(--dsh-content-font-delta,0px));border:none;border-bottom:.5px solid var(--dsw-alias-border-l2,rgba(128,128,128,.35));color:var(--dsw-alias-label-tertiary,rgba(128,128,128,.8));cursor:pointer;text-align:left;background:0 0;align-items:center;padding:0 0 8px;transition:color .1s;display:flex;}
.dsh-tdt-sv-process:hover{color:var(--dsw-alias-label-primary,#1f2328);}
.dsh-tdt-sv-process:not([data-open]){margin-bottom:8px;}
.dsh-tdt-sv-process-label{min-width:0;font-size:var(--dsh-content-font-size-secondary,13px);line-height:calc(24px + var(--dsh-content-font-delta,0px));text-overflow:ellipsis;white-space:nowrap;overflow:hidden;}
.dsh-tdt-sv-process-chevron{width:14px;height:14px;color:var(--dsw-alias-label-caption,rgba(128,128,128,.6));flex:none;margin-left:4px;transition:transform .1s;display:inline-flex;align-items:center;justify-content:center;}
.dsh-tdt-sv-process[data-open] .dsh-tdt-sv-process-chevron{transform:rotate(180deg);}
.dsh-tdt-sv-process-body{min-width:0;}
.dsh-tdt-sv-actions{height:calc(28px + var(--dsh-content-font-delta,0px));align-items:center;gap:8px;display:flex;margin-top:4px;}
.dsh-tdt-sv-action{display:inline-flex;align-items:center;justify-content:center;width:24px;height:24px;color:var(--dsw-alias-label-tertiary,rgba(128,128,128,.8));background:0 0;border:none;cursor:pointer;}
.dsh-tdt-sv-action:hover{color:var(--dsw-alias-label-primary,#1f2328);}
.dsh-tdt-sv-user{align-self:flex-start;max-width:100%;background:var(--dsw-alias-bg-layer-2,rgba(128,128,128,.14));border:1px solid var(--dsw-alias-border-l2,rgba(128,128,128,.28));border-radius:12px;padding:10px 14px;font-size:14px;line-height:1.6;word-break:break-word;}
.dsh-tdt-sv-assistant{align-self:stretch;font-size:14px;line-height:1.7;word-break:break-word;}
.dsh-tdt-sv-image{align-self:flex-start;font-size:12px;color:var(--dsw-alias-label-tertiary,rgba(128,128,128,.8));border:1px dashed var(--dsw-alias-border-l2,rgba(128,128,128,.35));border-radius:8px;padding:4px 10px;}
.dsh-tdt-sv-md>*:first-child{margin-top:0;}
.dsh-tdt-sv-md>*:last-child{margin-bottom:0;}
.dsh-tdt-sv-md p{margin:.5em 0;}
.dsh-tdt-sv-md h1,.dsh-tdt-sv-md h2,.dsh-tdt-sv-md h3,.dsh-tdt-sv-md h4,.dsh-tdt-sv-md h5,.dsh-tdt-sv-md h6{margin:.9em 0 .4em;font-weight:600;line-height:1.3;}
.dsh-tdt-sv-md h1{font-size:1.4em;}
.dsh-tdt-sv-md h2{font-size:1.25em;}
.dsh-tdt-sv-md h3{font-size:1.1em;}
.dsh-tdt-sv-md ul,.dsh-tdt-sv-md ol{margin:.5em 0;padding-left:1.4em;}
.dsh-tdt-sv-md li{margin:.2em 0;}
.dsh-tdt-sv-md code{font-family:var(--ds-font-family-code,ui-monospace,SFMono-Regular,Menlo,Consolas,monospace);font-size:.9em;background:var(--dsw-alias-bg-layer-2,rgba(128,128,128,.14));padding:.1em .35em;border-radius:4px;}
.dsh-tdt-sv-md pre{margin:.6em 0;background:var(--dsw-alias-bg-layer-2,rgba(128,128,128,.14));border:1px solid var(--dsw-alias-border-l2,rgba(128,128,128,.28));border-radius:8px;padding:10px 12px;overflow:auto;font-size:12px;line-height:1.5;}
.dsh-tdt-sv-md pre code{background:none;padding:0;font-size:inherit;}
.dsh-tdt-sv-md blockquote{margin:.5em 0;padding:.2em .9em;border-left:3px solid var(--dsw-alias-border-l2,rgba(128,128,128,.35));color:var(--dsw-alias-label-secondary,rgba(128,128,128,.95));}
.dsh-tdt-sv-md a{color:var(--dsw-alias-brand-primary,#2f6feb);text-decoration:none;}
.dsh-tdt-sv-md a:hover{text-decoration:underline;}
.dsh-tdt-sv-md table{border-collapse:collapse;font-size:12px;margin:.6em 0;display:block;overflow:auto;}
.dsh-tdt-sv-md th,.dsh-tdt-sv-md td{border:1px solid var(--dsw-alias-border-l2,rgba(128,128,128,.35));padding:4px 8px;text-align:left;}
.dsh-tdt-sv-md hr{border:none;border-top:1px solid var(--dsw-alias-border-l2,rgba(128,128,128,.35));margin:1em 0;}
.dsh-tdt-sv-md img{max-width:100%;}
/* 思考行（ReasoningRow.module.css 照抄：root[row]/leading/chevron/title/separator/summary/thinkBody）。 */
.dsh-tdt-sv-reasoning{flex-direction:column;display:flex;}
.dsh-tdt-sv-reasoning:not([data-expanded]){contain:size layout;height:calc(24px + var(--dsh-content-font-delta,0px));}
.dsh-tdt-sv-reasoning-row{position:relative;overflow:hidden;}
.dsh-tdt-sv-reasoning-leading{flex-shrink:0;}
.dsh-tdt-sv-reasoning-chevron{color:var(--dsw-alias-label-secondary,rgba(128,128,128,.95));}
.dsh-tdt-sv-reasoning-title{font-weight:400;}
.dsh-tdt-sv-reasoning-sep{background:var(--dsw-alias-label-caption,rgba(128,128,128,.7));border-radius:1px;flex:none;width:2px;height:2px;margin:0 8px;}
.dsh-tdt-sv-reasoning-preview{min-width:0;color:var(--dsw-alias-label-tertiary,rgba(128,128,128,.8));font-size:var(--dsh-content-font-size-secondary,13px);line-height:calc(20px + var(--dsh-content-font-delta-secondary,0px));white-space:nowrap;flex:auto;overflow:hidden;}
.dsh-tdt-sv-reasoning-preview-text{text-overflow:ellipsis;display:block;overflow:hidden;}
/* 工具卡展开体（无 diff 的工具）：输入 / 输出 两行，行间分隔线。
   对齐与字号照官方截图：标签 13px tertiary、内容 12px 等宽且行高与标签同拍（20px）⇒ 首行与续行同列同基线。 */
.dsh-tdt-sv-io{flex-direction:column;display:flex;}
.dsh-tdt-sv-io-row{display:flex;gap:12px;padding:10px 16px;align-items:baseline;}
.dsh-tdt-sv-io-row+.dsh-tdt-sv-io-row{border-top:.5px solid var(--dsw-alias-border-l1,rgba(128,128,128,.24));}
.dsh-tdt-sv-io-label{flex:none;color:var(--dsw-alias-label-tertiary,rgba(128,128,128,.8));font-size:var(--dsh-content-font-size-secondary,13px);line-height:20px;}
.dsh-tdt-sv-io-content{flex:1;min-width:0;margin:0;font-family:var(--ds-font-family-code,ui-monospace,SFMono-Regular,Menlo,Consolas,monospace);font-size:12px;line-height:20px;white-space:pre;overflow-x:auto;word-break:normal;color:var(--dsw-alias-label-primary,#1f2328);}
.dsh-tdt-sv-reasoning:not([data-preview]) .dsh-tdt-sv-reasoning-sep,.dsh-tdt-sv-reasoning:not([data-preview]) .dsh-tdt-sv-reasoning-preview{display:none;}
.dsh-tdt-sv-reasoning-body{padding:4px 0 4px calc(22px + var(--dsh-content-font-delta,0px));min-width:0;}
.dsh-tdt-sv-tool{align-self:stretch;border:1px solid var(--dsw-alias-border-l2,rgba(128,128,128,.28));border-radius:10px;background:var(--dsw-alias-bg-layer-1,rgba(128,128,128,.10));overflow:hidden;}
.dsh-tdt-sv-tool-head{display:flex;align-items:center;gap:8px;padding:6px 10px;flex-wrap:wrap;font-size:12px;}
.dsh-tdt-sv-tool-name{font-family:var(--ds-font-family-code,ui-monospace,SFMono-Regular,Menlo,Consolas,monospace);font-weight:600;color:var(--dsw-alias-brand-primary,#2f6feb);}
.dsh-tdt-sv-tool-err{color:var(--dsw-alias-state-error-primary,#c0392b);font-weight:600;}
.dsh-tdt-sv-tool details{border-top:1px solid var(--dsw-alias-border-l2,rgba(128,128,128,.24));}
.dsh-tdt-sv-tool summary{cursor:pointer;list-style:none;padding:6px 10px;font-size:12px;display:flex;align-items:center;gap:8px;flex-wrap:wrap;}
.dsh-tdt-sv-tool summary::-webkit-details-marker{display:none;}
.dsh-tdt-sv-tool summary>span:last-child{margin-left:auto;color:var(--dsw-alias-label-secondary,rgba(128,128,128,.9));}
.dsh-tdt-sv-tool>details>summary{border-top:none;}
.dsh-tdt-sv-tool>details:not(:first-child)>summary{border-top:1px solid var(--dsw-alias-border-l2,rgba(128,128,128,.24));}
.dsh-tdt-sv-tool pre{margin:0;padding:8px 10px;font-family:var(--ds-font-family-code,ui-monospace,SFMono-Regular,Menlo,Consolas,monospace);font-size:11px;line-height:1.5;white-space:pre-wrap;word-break:break-all;max-height:14em;overflow:auto;background:var(--dsw-alias-bg-layer-2,rgba(128,128,128,.14));color:var(--dsw-alias-label-primary,#1f2328);}
.dsh-tdt-sv-outcome{display:block;margin-top:4px;font-family:var(--ds-font-family-code,ui-monospace,SFMono-Regular,Menlo,Consolas,monospace);font-size:11px;}
.dsh-tdt-sv-outcome-err{color:var(--dsw-alias-state-error-primary,#c0392b);}
.dsh-tdt-sv-outcome-ok{color:var(--dsw-alias-label-secondary,rgba(128,128,128,.95));}
.dsh-tdt-sv-notice{align-self:center;font-size:12px;color:var(--dsw-alias-label-tertiary,rgba(128,128,128,.8));padding:2px 8px;}
.dsh-tdt-sv-notice-err{align-self:center;font-size:12px;color:var(--dsw-alias-state-error-primary,#c0392b);padding:2px 8px;text-align:center;}
.dsh-tdt-sv-hint{font-size:12px;color:var(--dsw-alias-label-secondary,rgba(128,128,128,.95));text-align:center;padding:12px 0;}
/* ── 里程碑 15 新增：触发行 / 尾部操作行 / 用量 pill / 明细弹层（官方类缺失时的兜底） ── */
.dsh-tdt-sv-process:disabled{cursor:default;}
.dsh-tdt-sv-trigger{align-self:stretch;background:var(--dsw-alias-markdown-code-block,rgba(128,128,128,.10));border:.5px solid var(--dsw-alias-border-l1,rgba(128,128,128,.24));border-radius:var(--dsw-radius-xl,12px);transition:background .1s;}
.dsh-tdt-sv-trigger:hover{background:var(--dsw-alias-interactive-bg-hover,rgba(128,128,128,.16));}
.dsh-tdt-sv-trigger-header{display:flex;align-items:center;gap:10px;width:100%;padding:12px 16px;background:0 0;border:none;cursor:pointer;color:inherit;font:inherit;text-align:left;}
.dsh-tdt-sv-trigger-icon{display:inline-flex;align-items:center;color:var(--dsw-alias-label-tertiary,rgba(128,128,128,.8));flex:none;}
.dsh-tdt-sv-trigger-title{font-size:var(--dsw-font-xs-13,13px);color:var(--dsw-alias-label-primary,#1f2328);min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;}
.dsh-tdt-sv-trigger-time{margin-left:auto;font-size:var(--dsw-font-xxs-12,12px);color:var(--dsw-alias-label-caption,rgba(128,128,128,.7));white-space:nowrap;}
.dsh-tdt-sv-trigger-chevron{flex:none;color:var(--dsw-alias-label-caption,rgba(128,128,128,.7));transition:transform .1s;}
.dsh-tdt-sv-trigger-chevron-open{flex:none;color:var(--dsw-alias-label-caption,rgba(128,128,128,.7));transform:rotate(180deg);}
.dsh-tdt-sv-trigger-body{padding:0 16px 12px 40px;}
.dsh-tdt-sv-trigger-explanation{margin:8px 0 0;font-size:12px;color:var(--dsw-alias-label-tertiary,rgba(128,128,128,.8));}
.dsh-tdt-sv-trigger-content{margin-top:6px;font-size:13px;line-height:1.6;color:var(--dsw-alias-label-secondary,rgba(128,128,128,.95));white-space:pre-wrap;word-break:break-word;max-height:240px;overflow:auto;}
.dsh-tdt-sv-tail{display:flex;flex-direction:column;gap:16px;}
.dsh-tdt-sv-tail-actions{margin-top:4px;margin-left:-6px;}
.dsh-tdt-sv-clock{font-size:12px;color:var(--dsw-alias-label-tertiary,rgba(128,128,128,.8));white-space:nowrap;}
.dsh-tdt-sv-endinfo{display:inline-flex;align-items:center;gap:8px;margin-left:8px;}
.dsh-tdt-sv-usage{display:inline-flex;align-items:center;}
.dsh-tdt-sv-usage-trigger{display:inline-flex;align-items:center;gap:4px;appearance:none;background:0 0;border:none;cursor:pointer;padding:0 4px;font:inherit;font-size:12px;color:var(--dsw-alias-label-tertiary,rgba(128,128,128,.8));}
.dsh-tdt-sv-usage-trigger:hover{color:var(--dsw-alias-label-primary,#1f2328);}
.dsh-tdt-sv-stats{position:fixed;z-index:1200;min-width:200px;max-width:min(440px,calc(100vw - 24px));background:var(--dsw-alias-bg-layer-1,rgba(30,30,30,.98));border:1px solid var(--dsw-alias-border-l2,rgba(128,128,128,.35));border-radius:12px;box-shadow:var(--dsw-shadow-lv3,0 12px 32px rgba(0,0,0,.4));padding:12px;font-size:12px;color:var(--dsw-alias-label-primary,#1f2328);}
.dsh-tdt-sv-stats-title{display:flex;align-items:center;justify-content:space-between;gap:12px;}
.dsh-tdt-sv-stats-titlelabel{display:inline-flex;align-items:center;gap:6px;color:var(--dsw-alias-label-secondary,rgba(128,128,128,.95));}
.dsh-tdt-sv-stats-titlevalue{font-variant-numeric:tabular-nums;}
.dsh-tdt-sv-stats-rule{height:1px;background:var(--dsw-alias-border-l2,rgba(128,128,128,.35));margin:8px 0;}
.dsh-tdt-sv-stats-details{display:grid;grid-template-columns:auto 1fr;gap:4px 12px;margin:0;}
.dsh-tdt-sv-stats-details dt{color:var(--dsw-alias-label-tertiary,rgba(128,128,128,.8));}
.dsh-tdt-sv-stats-details dd{margin:0;text-align:right;font-variant-numeric:tabular-nums;}
.dsh-tdt-sv-stats-route{word-break:break-all;}
.dsh-tdt-sv-stats-reasoning{color:var(--dsw-alias-label-tertiary,rgba(128,128,128,.8));}
/* ── 过程分组（二级收折，ChatGroupSeat.module.css 照抄：root/title/leading/activityIcon/chevron/label/body/content/fade） ── */
.dsh-tdt-sv-group{min-width:0;}
.dsh-tdt-sv-group-title{max-width:100%;color:var(--dsw-alias-label-secondary,rgba(128,128,128,.95));font:inherit;font-size:var(--dsh-content-font-size,14px);text-align:left;cursor:pointer;background:0 0;border:0;align-items:center;gap:6px;padding:0;transition:color .1s;display:flex;}
.dsh-tdt-sv-group-title:hover{color:var(--dsw-alias-label-primary,#1f2328);}
.dsh-tdt-sv-group-leading{width:16px;height:16px;color:var(--dsw-alias-label-tertiary,rgba(128,128,128,.8));flex:none;justify-content:center;align-items:center;display:inline-flex;position:relative;}
.dsh-tdt-sv-group-icon,.dsh-tdt-sv-group-chevron{justify-content:center;align-items:center;transition:opacity .1s;display:inline-flex;position:absolute;inset:0;}
.dsh-tdt-sv-group-icon{opacity:1;}
.dsh-tdt-sv-group-chevron{opacity:0;}
.dsh-tdt-sv-group-title:hover .dsh-tdt-sv-group-icon,.dsh-tdt-sv-group-title:focus-visible .dsh-tdt-sv-group-icon{opacity:0;}
.dsh-tdt-sv-group-title:hover .dsh-tdt-sv-group-chevron,.dsh-tdt-sv-group-title:focus-visible .dsh-tdt-sv-group-chevron{opacity:1;}
.dsh-tdt-sv-group-title[aria-expanded=true] .dsh-tdt-sv-group-icon{opacity:0;}
.dsh-tdt-sv-group-title[aria-expanded=true] .dsh-tdt-sv-group-chevron{opacity:1;}
.dsh-tdt-sv-group-title[aria-expanded=true]{padding-bottom:16px;}
.dsh-tdt-sv-group-body{--dsh-chat-flow-gap:8px;overscroll-behavior-y:auto;scrollbar-gutter:stable;max-height:min(400px,50vh);overflow-y:auto;}
.dsh-tdt-sv-group-label{text-overflow:ellipsis;white-space:nowrap;min-width:0;overflow:hidden;}
.dsh-tdt-sv-group-fade-top{mask-image:linear-gradient(#0000 0,#000 24px 100%);}
.dsh-tdt-sv-group-fade-bottom{mask-image:linear-gradient(#000 0 calc(100% - 24px),#0000 100%);}
.dsh-tdt-sv-group-fade-top.dsh-tdt-sv-group-fade-bottom{mask-image:linear-gradient(#0000 0,#000 24px calc(100% - 24px),#0000 100%);}
.dsh-tdt-sv-group-content{flex-direction:column;display:flex;}
.dsh-tdt-sv-group-content>*{flex-shrink:0;}
.dsh-tdt-sv-group-content>:not([hidden]):not(:empty)~:not([hidden]):not(:empty){margin-top:var(--dsh-chat-flow-gap,8px);}
.dsh-tdt-sv-group-expanded{--dsh-chat-flow-gap:16px;scrollbar-gutter:auto;max-height:none;overflow:visible;}
/* U10 继续对话（开分支）：头部按钮组 + 确认框。确认框 = 官方 primitives Modal + Button
   （portal 到 body，与本弹窗同 z-index 层、后挂载居上），此处只留头部钮规格与 Modal 内错误行。 */
.dsh-tdt-sv-headerbtns{display:flex;align-items:center;gap:8px;flex:none;}
/* 分支钮对齐官方 outline 小钮（Button.module.css .sm：28 高、radius-sm、0.5px border-l3、12/18 字、padding 0 10px）。 */
.dsh-tdt-sv-branch{appearance:none;font:inherit;font-size:12px;line-height:18px;height:28px;cursor:pointer;display:inline-flex;align-items:center;gap:4px;color:var(--dsw-alias-label-primary,#1f2328);background:transparent;border:.5px solid var(--dsw-alias-border-l3,rgba(128,128,128,.4));border-radius:var(--dsw-radius-sm,6px);padding:0 10px;transition:background var(--ds-transition-duration,.15s) var(--ds-ease-in-out,ease);}
.dsh-tdt-sv-branch:hover{background:var(--dsw-alias-interactive-bg-hover,rgba(128,128,128,.16));}
.dsh-tdt-sv-branch:disabled{opacity:.4;cursor:not-allowed;}
/* 官方 Modal 卡片宽（RiskConfirmation 同款 min(440px,100%)；我方样式后注入，同特异性覆盖 .dialog 的 380px）。 */
.dsh-tdt-sv-forkmodal{width:min(440px,100%);}
/* Modal body 内错误行：官方 error 变量（明暗自适应）。 */
.dsh-tdt-sv-forkerr{margin:0;font-size:14px;line-height:22px;color:var(--dsw-alias-state-error-primary,#e5484d);word-break:break-word;}
`;
		let injected = false;
		/**
		* 幂等注入样式（一次挂入 document.head）。SSR / 无 document 环境静默跳过。
		* 宿主升级换 token 名时，未命中的变量回退到兜底值（仍可读、不崩）。
		*/
		function ensureArchiveSessionStyle() {
			if (injected) return;
			injected = true;
			if (typeof document === "undefined") return;
			if (document.getElementById("dsh-task-dispatch-table-archive-session") !== null) return;
			const el = document.createElement("style");
			el.id = SV_STYLE_ID;
			el.textContent = ARCHIVE_SESSION_CSS;
			document.head.appendChild(el);
		}
		//#endregion
		//#region src/client/official-classes.ts
		/** 官方 chat 包注入的 style 标签 data-plugin-css 前缀。 */
		const CSS_PREFIX = "@deepseek-ai/dsh-client-ui-chat/";
		let discovered = null;
		/**
		* 解析一段官方 CSS module 文本，抽出 {语义名 → 真实类名}。
		* 纯函数、无 DOM 依赖（冒烟可直接对夹具断言）。
		* @param css - style 标签的 textContent。
		* @returns 语义名到真实类名的映射；解析不出哈希前缀时为空表。
		*/
		function parseOfficialCss(css) {
			const out = /* @__PURE__ */ new Map();
			const tokens = [];
			const tokenRe = /\.([A-Za-z0-9_-]+)/g;
			let m = tokenRe.exec(css);
			while (m !== null) {
				tokens.push(m[1]);
				m = tokenRe.exec(css);
			}
			const counts = /* @__PURE__ */ new Map();
			for (const token of tokens) {
				const at = token.lastIndexOf("_");
				if (at <= 0 || at === token.length - 1) continue;
				const prefix = token.slice(0, at);
				counts.set(prefix, (counts.get(prefix) ?? 0) + 1);
			}
			let prefix = "";
			let best = 0;
			counts.forEach((count, key) => {
				if (count > best) {
					best = count;
					prefix = key;
				}
			});
			if (prefix === "") return out;
			for (const token of tokens) {
				if (!token.startsWith(prefix + "_")) continue;
				const semantic = token.slice(prefix.length + 1);
				if (semantic === "" || semantic.includes("_")) continue;
				if (!out.has(semantic)) out.set(semantic, token);
			}
			return out;
		}
		/**
		* 扫描 document 里官方 chat 包注入的 style 标签，按模块缓存解析结果。
		* 无 document（SSR / 冒烟）时返回空表。
		*/
		function discoverOfficialClasses() {
			if (discovered !== null) return discovered;
			const result = /* @__PURE__ */ new Map();
			if (typeof document !== "undefined") {
				const tags = document.querySelectorAll("style[data-plugin-css]");
				for (let i = 0; i < tags.length; i++) {
					const tag = tags[i];
					const id = tag.dataset.pluginCss ?? "";
					if (!id.startsWith(CSS_PREFIX)) continue;
					const module = id.slice(32).replace(/\.module\.css$/, "");
					const parsed = parseOfficialCss(tag.textContent ?? "");
					if (parsed.size === 0 && (tag.textContent ?? "").includes(".")) console.warn(`[task-dispatch:official-classes] 官方模块 ${module} 类名解析为空（格式可能变了）`);
					result.set(module, parsed);
				}
			}
			if (result.size > 0) discovered = result;
			return result;
		}
		/** 已发现的官方模块数（0 = 官方样式未注入，调用方应走自绘兜底）。 */
		function officialModuleCount() {
			return discoverOfficialClasses().size;
		}
		/**
		* 取一个官方类名；取不到返回 null（调用方回退自绘样式）。
		* @param module - 模块名（如 `ChatView`）。
		* @param semantic - 语义名（如 `frame`）。
		*/
		function officialClass(module, semantic) {
			return discoverOfficialClasses().get(module)?.get(semantic) ?? null;
		}
		/** className 拼接：官方类优先，缺失时回退自绘类（两者只取其一，避免样式打架）。 */
		function ocOr(module, semantic, fallback) {
			return officialClass(module, semantic) ?? fallback;
		}
		//#endregion
		//#region src/client/mirror/ChatNodeSeat.tsx
		/**
		* 官方 TURN_PROCESS_INDEPENDENT_KINDS（lib/client.js:1525）：这些 kind 永远不进过程折叠区。
		*/
		const TURN_PROCESS_INDEPENDENT_KINDS = /* @__PURE__ */ new Set([
			"system-prompt",
			"user",
			"steering",
			"turn-trigger",
			"turn-process",
			"turn-error",
			"turn-max-tokens",
			"turn-tail"
		]);
		/**
		* 读过程席位快照。宿主 API 形态变了也只降级成「不折叠」，不让整个弹窗白屏。
		*/
		function readPresentation(store, key) {
			if (store === void 0) return void 0;
			try {
				const source = store.processSource;
				if (typeof source !== "function") return void 0;
				return source.call(store, key)?.getSnapshot();
			} catch {
				return;
			}
		}
		/** 取节点所属 turn（官方 turnOf，ChatNodeSeat.tsx:1660）。 */
		function turnOf(node) {
			const location = node?.location;
			return location?.kind === "turn" || location?.kind === "step" ? location.turn?.turn : void 0;
		}
		/** 官方 turnProcessAlwaysOpen（lib/client.js:1558）：live / 已停止 / 失败的 turn 不折叠。 */
		function turnProcessAlwaysOpen(node) {
			const location = node?.location;
			if (location?.kind !== "turn" && location?.kind !== "step") return false;
			const reason = location.turn?.end?.data?.reason?.kind;
			return location.turn?.status === "open" || reason === "aborted" || reason === "error";
		}
		/** 一个 keyed 节点 → 一个 flowItem（官方 ChatNodeSeat 的 JSX 等价物）。 */
		function ChatNodeSeatMirror(props) {
			const { node, groupPart, store, openState, onSetOpen, foldCompleted, renderNode } = props;
			const turn = turnOf(node);
			const presentation = readPresentation(store, node.key);
			const spec = presentation?.spec ?? void 0 ?? (node.kind === "turn-process" ? node.data : void 0);
			const liveProcess = presentation !== void 0 && presentation.turnClosed !== true;
			const interleavedInput = presentation?.hasInterleavedInput === true;
			const alwaysOpen = liveProcess || interleavedInput || turnProcessAlwaysOpen(node);
			const storedAnswerStep = turn === void 0 ? void 0 : openState.get(turn);
			const processOpen = alwaysOpen || spec !== void 0 && storedAnswerStep === (spec.answerStep ?? 0);
			const setOpen = (open) => {
				if (spec !== void 0 && !alwaysOpen && turn !== void 0) onSetOpen(turn, spec.answerStep ?? 0, open);
			};
			const processWindowReady = spec !== void 0 && presentation !== void 0 && foldCompleted && presentation.turn === spec.turn && (presentation.turnStarted === true || presentation.turnClosed === true);
			const dataStep = typeof node.data?.step === "number" ? node.data.step : void 0;
			const processMember = processWindowReady && spec !== void 0 && !TURN_PROCESS_INDEPENDENT_KINDS.has(node.kind) && node.anchorSeq >= spec.processStartSeq && (liveProcess || spec.answerAnchorSeq === null || node.anchorSeq < spec.answerAnchorSeq || groupPart === "reasoning" && node.kind === "assistant-step" && dataStep === spec.answerStep);
			const processAnswer = processWindowReady && spec !== void 0 && !liveProcess && groupPart !== "reasoning" && node.kind === "assistant-step" && dataStep === spec.answerStep;
			const ownsDisclosure = node.kind === "turn-process" || processAnswer;
			const foldable = processWindowReady && (liveProcess || processMember || ownsDisclosure);
			const turnProcess = spec === void 0 ? void 0 : {
				spec,
				foldable,
				hasContent: !interleavedInput && (presentation?.hasExternalProcess === true || spec.inlineReasoning),
				open: processOpen,
				alwaysOpen,
				setOpen
			};
			const controllerInactive = node.kind === "turn-process" && foldCompleted && !foldable;
			const compactAnswer = processAnswer && foldable && presentation?.compactAnswer === true && !processOpen;
			const processHidden = controllerInactive || foldable && processMember && !processOpen;
			const inner = renderNode(node, turnProcess, groupPart);
			if (inner === null || inner === void 0) return null;
			const flowKey = groupPart === void 0 || groupPart === "response" ? node.key : JSON.stringify([node.key, groupPart]);
			return (0, react.createElement)("div", {
				className: ocOr("ChatView", "flowItem", "dsh-tdt-sv-flowitem"),
				"data-chat-anchor-key": flowKey,
				"data-chat-flow-key": flowKey,
				"data-chat-paging-anchor": node.kind !== "turn-process" || void 0,
				"data-chat-node-key": node.key,
				"data-chat-group-part": groupPart,
				"data-chat-flow-kind": node.kind,
				"data-chat-turn": turn,
				"data-turn-process-member": processMember || void 0,
				"data-turn-process-hidden": processHidden || void 0,
				"data-turn-process-answer": compactAnswer || void 0,
				hidden: processHidden || void 0
			}, inner);
		}
		//#endregion
		//#region src/client/mirror/process-groups.ts
		/** 官方 INDEPENDENT（process-groups.js:10565；注意与 ChatNodeSeat 的清单不同）。 */
		const INDEPENDENT = /* @__PURE__ */ new Set([
			"user",
			"steering",
			"turn-trigger",
			"model-retry",
			"turn-error",
			"turn-max-tokens",
			"turn-tail"
		]);
		/** 节点所属 turn（官方 turnOf，process-groups.js:10574）。 */
		function turnOfNode(node) {
			const location = node.location;
			return location?.kind === "turn" || location?.kind === "step" ? location.turn?.turn : void 0;
		}
		/** 官方 reasoning（10578）：assistant-step 带非空思考块。 */
		function hasReasoning(node) {
			if (node.kind !== "assistant-step" || !Array.isArray(node.data?.blocks)) return false;
			return (node.data?.blocks).some((block) => block?.kind === "reasoning" && (block.text ?? "").trim() !== "");
		}
		/** 官方 reply（10581）：assistant-step 带回复内容（reasoning / tool-call 不算，空文本不算）。 */
		function hasReply(node) {
			if (node.kind !== "assistant-step" || !Array.isArray(node.data?.blocks)) return false;
			return (node.data?.blocks).some((block) => {
				if (block === null || typeof block !== "object") return false;
				if (block.kind === "reasoning" || block.kind === "tool-call") return false;
				if (block.kind === "text") return (block.text ?? "").trim() !== "";
				return true;
			});
		}
		/** 官方 activity（10426-10449）：工具名 → 活动类别。 */
		function toolActivity(name) {
			if (name === "read") return "read";
			if (name === "read_image") return "readImage";
			if (name === "grep" || name === "glob" || name.endsWith("_inspect")) return "search";
			if (name === "write") return "write";
			if (name === "edit" || name === "apply_patch") return "edit";
			if ([
				"bash",
				"pwsh",
				"exec_command",
				"write_stdin"
			].includes(name) || name.startsWith("terminal_")) return "commands";
			if (name === "run_code") return "code";
			if (name === "web_search") return "webSearch";
			if (name === "web_fetch") return "webFetch";
			if (name === "subagent" || name.startsWith("subagent_")) return "subagents";
			if ([
				"todo_write",
				"create_goal",
				"update_goal",
				"get_goal"
			].includes(name)) return "plan";
			if (name === "ask_user_question" || name === "request_user_input") return "questions";
			return "tools";
		}
		/** ToolCallBlock → 本次调用的名字面（running 半截在根上，settled 在 call 里）。 */
		function toolCallFace(root) {
			const callId = typeof root.callId === "string" ? root.callId : "";
			if (root.kind === "tool-result") {
				const name = typeof root.call?.name === "string" ? root.call.name : "";
				return callId === "" || name === "" ? null : {
					callId,
					name
				};
			}
			const name = typeof root.name === "string" ? root.name : "";
			return callId === "" || name === "" ? null : {
				callId,
				name
			};
		}
		/** 官方 processActivity（10527-10561）：按去重调用数排序的活动类别（含子调用递归）。 */
		function processActivity(nodes) {
			const counts = /* @__PURE__ */ new Map();
			const seen = /* @__PURE__ */ new Set();
			const visit = (tool) => {
				const face = toolCallFace(tool);
				if (face !== null && !seen.has(face.callId)) {
					seen.add(face.callId);
					const kind = toolActivity(face.name);
					counts.set(kind, (counts.get(kind) ?? 0) + 1);
				}
				for (const child of tool.subCalls ?? []) visit(child);
			};
			for (const node of nodes) {
				if (node.kind !== "tool-call") continue;
				const root = node.data?.root;
				if (root !== void 0 && root !== null) visit(root);
			}
			return [...counts].map(([kind, count]) => ({
				kind,
				count
			})).sort((left, right) => right.count - left.count);
		}
		/**
		* 官方 TurnGroups.rebuild 的移植：把 keyed 流切成「独立条目 + 过程分组」。
		* @param order - 官方渲染顺序（node key 列表）。
		* @param readNode - keyed 节点读取。
		* @param isTurnClosed - turn 是否已闭合（官方 turns.get(turn).status === 'closed'）。
		*/
		function buildProcessGroups(order, readNode, isTurnClosed) {
			const entries = [];
			const groups = /* @__PURE__ */ new Map();
			let pending = [];
			let currentTurn;
			const flush = (closed) => {
				const first = pending[0];
				if (first === void 0) return;
				const turn = currentTurn;
				const ended = closed || turn !== void 0 && isTurnClosed(turn);
				const members = pending;
				const nodes = members.map((member) => readNode(member.key)).filter((node) => node !== void 0);
				const groupKey = JSON.stringify([
					"process",
					first.key,
					first.groupPart ?? null
				]);
				groups.set(groupKey, {
					key: groupKey,
					members,
					data: {
						turn: turn ?? -1,
						closed: ended,
						summary: { counts: processActivity(nodes) }
					}
				});
				entries.push({
					kind: "group",
					key: groupKey
				});
				pending = [];
			};
			for (const key of order) {
				const node = readNode(key);
				if (node === void 0) continue;
				const turn = turnOfNode(node);
				if (turn !== currentTurn) {
					flush(true);
					currentTurn = turn;
				}
				if (INDEPENDENT.has(node.kind)) {
					flush(true);
					entries.push({
						kind: "node",
						key
					});
				} else if (node.kind === "turn-process") entries.push({
					kind: "node",
					key
				});
				else if (node.kind === "assistant-step") {
					if (hasReasoning(node)) pending.push({
						key,
						groupPart: "reasoning"
					});
					if (hasReply(node)) {
						flush(true);
						entries.push({
							kind: "node",
							key,
							groupPart: "response"
						});
					}
				} else pending.push({ key });
			}
			flush(currentTurn === void 0 ? true : isTurnClosed(currentTurn));
			return {
				entries,
				groups
			};
		}
		/** 官方 message.stepProcess.done.* 的键面（zh/en 文案见 locales.ts）。 */
		const STEP_DONE_KEYS = {
			thinking: "stepProcessDoneThinking",
			read: "stepProcessDoneRead",
			readImage: "stepProcessDoneReadImage",
			write: "stepProcessDoneWrite",
			search: "stepProcessDoneSearch",
			edit: "stepProcessDoneEdit",
			commands: "stepProcessDoneCommands",
			code: "stepProcessDoneCode",
			webSearch: "stepProcessDoneWebSearch",
			webFetch: "stepProcessDoneWebFetch",
			subagents: "stepProcessDoneSubagents",
			plan: "stepProcessDonePlan",
			questions: "stepProcessDoneQuestions",
			tools: "stepProcessDoneTools"
		};
		/**
		* 官方 processTitle（1820-1836）：closed 组标题 = 前 3 类活动拼接
		* （2 类用「A并B」且去「已」前缀；≥3 类用「，」连接、超 3 类补「等」）。
		*/
		function processTitle(summary, t) {
			const labels = summary.counts.slice(0, 3).map(({ kind }) => t(STEP_DONE_KEYS[kind]));
			const first = labels[0];
			if (first === void 0) return t("stepProcessDoneThinking");
			const continuation = (label) => label.charAt(0).toLowerCase() + label.slice(1);
			const second = labels[1];
			if (second === void 0) return first;
			if (labels.length === 2) {
				const prefix = t("stepProcessSharedPrefix");
				return t("stepProcessJoinTwo", {
					first,
					second: continuation(prefix !== "" && first.startsWith(prefix) && second.startsWith(prefix) ? second.slice(prefix.length) : second)
				});
			}
			const title = [first, ...labels.slice(1).map(continuation)].join(t("stepProcessComma"));
			return summary.counts.length > 3 ? t("stepProcessMore", { title }) : title;
		}
		//#endregion
		//#region src/client/mirror/ChatGroupSeat.tsx
		/** 官方 PROCESS_ICONS（lib/client.js:2187-2201）；工具行图标同源（edit/write=铅笔、generic=sparkle）。 */
		const PROCESS_ICONS = {
			thinking: _deepseek_ai_dsh_client_ui_primitives.IconThinkOutlineRegular,
			read: _deepseek_ai_dsh_client_ui_primitives.IconBrowseOutlineRegular,
			readImage: _deepseek_ai_dsh_client_ui_primitives.IconBrowseOutlineRegular,
			search: _deepseek_ai_dsh_client_ui_primitives.IconSearchOutlineRegular,
			edit: _deepseek_ai_dsh_client_ui_primitives.IconEditOutlineRegular,
			write: _deepseek_ai_dsh_client_ui_primitives.IconEditOutlineRegular,
			commands: _deepseek_ai_dsh_client_ui_primitives.IconApiOutlineRegular,
			code: _deepseek_ai_dsh_client_ui_primitives.IconCodeOutlineRegular,
			webSearch: _deepseek_ai_dsh_client_ui_primitives.IconGlobeOutlineRegular,
			webFetch: _deepseek_ai_dsh_client_ui_primitives.IconBrowseOutlineRegular,
			subagents: _deepseek_ai_dsh_client_ui_primitives.IconAgentPresetOutlineRegular,
			plan: _deepseek_ai_dsh_client_ui_primitives.IconPlanOutlineRegular,
			questions: _deepseek_ai_dsh_client_ui_primitives.IconQuestionOutlineRegular,
			tools: _deepseek_ai_dsh_client_ui_primitives.IconSparkleRegular
		};
		/** 官方图标尺寸（14px，除 thinking/commands/webSearch/plan/questions 用默认）。 */
		const SMALL_ICONS = /* @__PURE__ */ new Set([
			"read",
			"readImage",
			"search",
			"edit",
			"write",
			"code",
			"webFetch",
			"subagents",
			"tools"
		]);
		/** 过程分组（二级收折）：汇总行 + 组内条目。 */
		function ChatGroupSeatMirror(props) {
			const { group, grouped, store, openState, onSetOpen, foldCompleted, renderNode, t } = props;
			const [open, setOpen] = (0, react.useState)(false);
			const first = group.members[0];
			const firstNode = first === void 0 ? void 0 : store?.get(first.key);
			const presentation = first === void 0 ? void 0 : readPresentation(store, first.key);
			const spec = presentation?.spec ?? void 0;
			const location = firstNode?.location;
			const reason = location?.kind === "turn" || location?.kind === "step" ? location.turn?.end?.data?.reason?.kind : void 0;
			const alwaysOpen = presentation?.turnClosed === false || presentation?.hasInterleavedInput === true || reason === "aborted" || reason === "error";
			const storedAnswerStep = openState.get(group.data.turn);
			const outerHidden = foldCompleted && presentation?.turnClosed === true && spec !== void 0 && !alwaysOpen && storedAnswerStep !== (spec.answerStep ?? 0);
			(0, react.useEffect)(() => {
				if (outerHidden) setOpen(false);
			}, [outerHidden]);
			const bodyRef = (0, react.useRef)(null);
			const [edges, setEdges] = (0, react.useState)({
				up: false,
				down: false
			});
			const measure = (0, react.useCallback)(() => {
				const el = bodyRef.current;
				if (el === null) return;
				setEdges({
					up: el.scrollTop > 1,
					down: el.scrollTop + el.clientHeight < el.scrollHeight - 1
				});
			}, []);
			(0, react.useEffect)(() => {
				if (grouped && open) measure();
			}, [
				grouped,
				open,
				measure
			]);
			if (first === void 0 || firstNode === void 0) return null;
			const label = group.data.closed ? processTitle(group.data.summary, t) : t("stepProcessDoneThinking");
			const activity = group.data.summary.counts[0]?.kind ?? "thinking";
			const ActivityIcon = PROCESS_ICONS[activity] ?? _deepseek_ai_dsh_client_ui_primitives.IconThinkOutlineRegular;
			const bodyClass = [
				ocOr("ChatGroupSeat", "body", "dsh-tdt-sv-group-body"),
				grouped ? "" : ocOr("ChatGroupSeat", "expandedBody", "dsh-tdt-sv-group-expanded"),
				grouped && edges.up ? ocOr("ChatGroupSeat", "fadeTop", "dsh-tdt-sv-group-fade-top") : "",
				grouped && edges.down ? ocOr("ChatGroupSeat", "fadeBottom", "dsh-tdt-sv-group-fade-bottom") : ""
			].filter((part) => part !== "").join(" ");
			return (0, react.createElement)("div", {
				className: ocOr("ChatGroupSeat", "root", "dsh-tdt-sv-group"),
				"data-chat-group-key": group.key,
				"data-chat-flow-key": group.key,
				"data-chat-anchor-key": `group:${group.key}`,
				"data-chat-turn": group.data.turn,
				"data-step-process": true,
				"data-group-expanded-mode": !grouped || void 0,
				hidden: outerHidden || void 0
			}, grouped ? (0, react.createElement)("button", {
				type: "button",
				className: ocOr("ChatGroupSeat", "title", "dsh-tdt-sv-group-title"),
				"aria-expanded": open,
				onClick: () => {
					setOpen((value) => !value);
				}
			}, (0, react.createElement)("span", {
				className: ocOr("ChatGroupSeat", "leading", "dsh-tdt-sv-group-leading"),
				"aria-hidden": true
			}, (0, react.createElement)("span", {
				className: ocOr("ChatGroupSeat", "activityIcon", "dsh-tdt-sv-group-icon"),
				"data-step-process-icon": true
			}, (0, react.createElement)(ActivityIcon, SMALL_ICONS.has(activity) ? { size: 14 } : {})), open ? (0, react.createElement)(_deepseek_ai_dsh_client_ui_primitives.IconChevronUpOutlineRegular, { className: ocOr("ChatGroupSeat", "chevron", "dsh-tdt-sv-group-chevron") }) : (0, react.createElement)(_deepseek_ai_dsh_client_ui_primitives.IconChevronDownOutlineRegular, { className: ocOr("ChatGroupSeat", "chevron", "dsh-tdt-sv-group-chevron") })), (0, react.createElement)("span", { className: ocOr("ChatGroupSeat", "label", "dsh-tdt-sv-group-label") }, label)) : null, (0, react.createElement)("div", {
				ref: bodyRef,
				className: bodyClass,
				"data-step-process-body": true,
				"data-scroll-up": edges.up || void 0,
				"data-scroll-down": edges.down || void 0,
				onScroll: measure,
				hidden: grouped && !open || void 0
			}, (0, react.createElement)("div", {
				className: ocOr("ChatGroupSeat", "content", "dsh-tdt-sv-group-content"),
				"data-step-process-content": true,
				"data-chat-flow": ""
			}, group.members.map((member) => (0, react.createElement)(ChatNodeSeatMirror, {
				key: JSON.stringify([member.key, member.groupPart ?? null]),
				node: store?.get(member.key) ?? {
					key: member.key,
					kind: "",
					anchorSeq: 0
				},
				groupPart: member.groupPart,
				store,
				openState,
				onSetOpen,
				foldCompleted,
				renderNode
			})))));
		}
		//#endregion
		//#region src/client/mirror/ChatView.tsx
		/** 会话区骨架：frame > root > scroll > column（类名取官方 ChatView.module.css，缺失回退自绘）。
		*  `dsh-tdt-sv-frame` = 本插件稳定钩子类：弹窗用它把会话区上下内边距补到 34px（官方 scroll 纵向是固定 16px）。 */
		function ChatViewFrame(props) {
			return (0, react.createElement)("div", { className: `${ocOr("ChatView", "frame", "dsh-tdt-sv-body")} dsh-tdt-sv-frame` }, (0, react.createElement)("div", { className: ocOr("ChatView", "root", "") }, (0, react.createElement)("div", { className: ocOr("ChatView", "scroll", "") }, (0, react.createElement)("div", {
				className: ocOr("ChatView", "column", "dsh-tdt-sv-col"),
				"data-chat-flow": ""
			}, props.children))));
		}
		/** 官方 ChatNodeList：order → seat 列表（grouped 视图未实现 ⇒ 走官方 order 兜底分支）。 */
		function ChatNodeListMirror(props) {
			const { order, store, entries, groups, turns, openState, onSetOpen, foldCompleted, renderNode, t } = props;
			const rows = [];
			const read = store === void 0 ? void 0 : store.get;
			if (typeof read !== "function" || store === void 0) return rows;
			const readSafe = (key) => {
				try {
					return read.call(store, key);
				} catch {
					return;
				}
			};
			if (entries !== void 0 && groups !== void 0) {
				for (const entry of entries) if (entry.kind === "group") {
					const group = groups.get(entry.key);
					if (group === void 0) continue;
					rows.push((0, react.createElement)(ChatGroupSeatMirror, {
						key: entry.key,
						group,
						grouped: turnStatus(turns, group.data.turn) !== "open",
						store,
						openState,
						onSetOpen,
						foldCompleted,
						renderNode,
						t
					}));
				} else {
					const node = readSafe(entry.key);
					if (node === void 0) continue;
					rows.push((0, react.createElement)(ChatNodeSeatMirror, {
						key: JSON.stringify([entry.key, entry.groupPart ?? null]),
						node,
						groupPart: entry.groupPart,
						store,
						openState,
						onSetOpen,
						foldCompleted,
						renderNode
					}));
				}
				return rows;
			}
			for (const key of order) {
				const node = readSafe(key);
				if (node === void 0) continue;
				rows.push((0, react.createElement)(ChatNodeSeatMirror, {
					key,
					node,
					store,
					openState,
					onSetOpen,
					foldCompleted,
					renderNode
				}));
			}
			return rows;
		}
		/** turn 状态（官方 turns.get(turn)?.status）。 */
		function turnStatus(turns, turn) {
			return (turns?.get(turn) ?? turns?.get(String(turn)))?.status;
		}
		/** 加载 / 空态提示行（13px tertiary）。 */
		function ChatHint(props) {
			return (0, react.createElement)("div", { className: ocOr("ChatView", "hint", "dsh-tdt-sv-hint") }, props.text);
		}
		/** 「加载更早记录」按钮（官方 older：按钮 4px 12px / 12px 字号 / radius-sm / 底色 interactive-bg-hover-solid）。 */
		function ChatOlderButton(props) {
			return (0, react.createElement)("div", { className: ocOr("ChatView", "older", "dsh-tdt-sv-older") }, (0, react.createElement)("button", {
				type: "button",
				onClick: props.onClick
			}, props.label));
		}
		//#endregion
		//#region src/client/mirror/GenericCommandCard.tsx
		/** 官方 tool.title.*（uic lib/client.js:14703-14719）：工具名 → 本地化标题；未收录走 generic「工具调用」。 */
		const TOOL_TITLE_KEYS = {
			read: "toolTitleRead",
			read_image: "toolTitleReadImage",
			grep: "toolTitleGrep",
			glob: "toolTitleGlob",
			bash: "toolTitleBash",
			pwsh: "toolTitleBash",
			write: "toolTitleWrite",
			edit: "toolTitleEdit",
			run_code: "toolTitleCode",
			web_search: "toolTitleWebSearch",
			web_fetch: "toolTitleWebFetch"
		};
		/** 工具行标题：官方字典命中用本地化动词，未命中 = generic（摘要补工具名，对齐官方「工具调用 · name · 摘要」）。 */
		const toolTitle = (name, t) => {
			const key = TOOL_TITLE_KEYS[name];
			if (key !== void 0) return {
				title: t(key),
				generic: false
			};
			return {
				title: t("toolTitleGeneric"),
				generic: true
			};
		};
		function diffsFromMeta(meta) {
			if (typeof meta !== "object" || meta === null || Array.isArray(meta)) return void 0;
			const diffs = meta.diffs;
			if (!Array.isArray(diffs) || diffs.length === 0) return void 0;
			return diffs.every((diff) => {
				if (typeof diff !== "object" || diff === null || Array.isArray(diff)) return false;
				const { path, oldText, newText } = diff;
				return typeof path === "string" && (oldText === null || typeof oldText === "string") && typeof newText === "string";
			}) ? diffs : void 0;
		}
		/**
		* meta 无 diff 时的参数侧兜底（真实数据，非模拟）：tool-fs 的 `presentationMeta` 在
		* `before === null`（无观察快照）时给 `diffs: []`（lib/index.js:572）——官方此况走参数呈现。
		* write（新建文件）⇒ oldText:null 全绿 +；edit ⇒ old_string→new_string 红绿对比。解析失败回 undefined。
		*/
		function diffsFromArgs(name, argsRaw) {
			if (name !== "write" && name !== "edit" && name !== "apply_patch") return void 0;
			const raw = argsRaw.trim();
			if (!raw.startsWith("{")) return void 0;
			let args;
			try {
				args = JSON.parse(raw);
			} catch {
				return;
			}
			const path = args.file_path ?? args.path;
			if (typeof path !== "string" || path === "") return void 0;
			if (name === "write") {
				const content = args.content;
				if (typeof content !== "string") return void 0;
				return [{
					path,
					oldText: null,
					newText: content
				}];
			}
			const { old_string: oldString, new_string: newString } = args;
			if (typeof oldString !== "string" || typeof newString !== "string") return void 0;
			return [{
				path,
				oldText: oldString,
				newText: newString
			}];
		}
		/** 单行截断（官方 summary 是单行省略号样式）。 */
		const preview = (text) => {
			const first = text.split("\n").find((line) => line.trim() !== "") ?? "";
			return first.length > 90 ? `${first.slice(0, 90)}…` : first;
		};
		/** 人话摘要：优先取常见工具参数的关键字段，否则回退「输出优先、参数次之」的首行。 */
		const summarize = (argsRaw, output) => {
			const raw = argsRaw.trim();
			if (raw.startsWith("{")) try {
				const parsed = JSON.parse(raw);
				for (const key of [
					"command",
					"file_path",
					"path",
					"pattern",
					"query",
					"url",
					"title"
				]) {
					const value = parsed[key];
					if (typeof value === "string" && value.trim() !== "") return value;
				}
			} catch {}
			return preview(output.trim() !== "" ? output : argsRaw);
		};
		/** 官方 diff 面文案（codeLabel = 官方截图里的「代码块」；diff.*：收起差异 / 展开其余 N 行差异）。 */
		const diffLabels = (t) => ({
			codeLabel: t("codeBlockLabel"),
			wrapLabel: t("diffWrapLabel"),
			unwrapLabel: t("diffUnwrapLabel"),
			copy: t("copyLabel"),
			copied: t("copiedLabel"),
			collapseAria: t("diffCollapseAria"),
			expandAria: (count) => t("diffExpandAria", { count }),
			collapse: t("diffCollapseLabel"),
			expand: (count) => t("diffExpandRest", { count })
		});
		/** 工具调用 / 命令卡（默认折叠成一行；错误态摘要变红由 summary[data-error] 承担）。 */
		function GenericCommandCard(props) {
			const { name, argsRaw, output, isError, errorName, meta, t } = props;
			const [open, setOpen] = (0, react.useState)(isError);
			const diffs = diffsFromMeta(meta) ?? diffsFromArgs(name, argsRaw);
			const localized = toolTitle(name, t);
			const totals = diffs === void 0 ? void 0 : (0, _deepseek_ai_dsh_client_ui_primitives.diffTotals)(diffs);
			const summaryText = (diffs === void 0 || totals === void 0 ? null : (0, react.createElement)(react.Fragment, null, (0, react.createElement)("span", { style: {
				textDecoration: "underline",
				textUnderlineOffset: "2px"
			} }, diffs[0]?.path ?? ""), ` +${totals.added} -${totals.removed}`)) ?? (localized.generic ? `${name} · ${summarize(argsRaw, output)}` : summarize(argsRaw, output));
			const rowTitle = isError ? `${localized.title}  ✕ ${errorName ?? "error"}` : localized.title;
			const prettyArgs = (() => {
				const raw = argsRaw.trim();
				if (raw === "") return "";
				if (raw.startsWith("{") || raw.startsWith("[")) try {
					return JSON.stringify(JSON.parse(raw), null, 2);
				} catch {}
				return raw;
			})();
			const ActivityIcon = PROCESS_ICONS[toolActivity(name)] ?? PROCESS_ICONS.tools;
			return (0, react.createElement)("div", {
				className: ocOr("GenericCommandCard", "root", "dsh-tdt-sv-tool"),
				"data-variant": "others",
				"data-state": isError ? "error" : "success"
			}, (0, react.createElement)(_deepseek_ai_dsh_client_ui_primitives.DisclosureRow, {
				icon: (0, react.createElement)(ActivityIcon, { size: 14 }),
				title: rowTitle,
				open,
				expandable: diffs !== void 0 || prettyArgs !== "" || output !== "",
				onToggle: () => {
					setOpen((value) => !value);
				},
				expandOnRowClick: true,
				keepContentWhenOpen: true,
				rowClassName: ocOr("GenericCommandCard", "row", "dsh-tdt-sv-tool-head"),
				collapsedContent: (0, react.createElement)(react.Fragment, null, (0, react.createElement)("span", {
					className: ocOr("GenericCommandCard", "separator", ""),
					"aria-hidden": true
				}), (0, react.createElement)("span", {
					className: ocOr("GenericCommandCard", "summary", "dsh-tdt-sv-outcome-ok"),
					"data-error": isError || void 0
				}, summaryText)),
				children: diffs !== void 0 ? (0, react.createElement)(_deepseek_ai_dsh_client_ui_primitives.DiffBlock, {
					diffs,
					labels: diffLabels(t)
				}) : (0, react.createElement)("div", { className: "dsh-tdt-sv-io" }, prettyArgs === "" ? null : (0, react.createElement)("div", { className: "dsh-tdt-sv-io-row" }, (0, react.createElement)("span", { className: "dsh-tdt-sv-io-label" }, t("toolInputLabel")), (0, react.createElement)("pre", { className: "dsh-tdt-sv-io-content" }, prettyArgs)), output.trim() === "" ? null : (0, react.createElement)("div", { className: "dsh-tdt-sv-io-row" }, (0, react.createElement)("span", { className: "dsh-tdt-sv-io-label" }, t("toolOutputLabel")), (0, react.createElement)("pre", { className: "dsh-tdt-sv-io-content" }, output)))
			}));
		}
		//#endregion
		//#region src/client/mirror/message-chrome.ts
		/** 两位补零（官方 message-chrome pad2）。 */
		function pad2(n) {
			return String(n).padStart(2, "0");
		}
		/**
		* 官方 formatRunDuration：整秒；≥1 分带零补秒；≥1 小时带零补分秒。
		*/
		function formatRunDuration(ms, t) {
			const total = Math.max(0, Math.floor(ms / 1e3));
			const hours = Math.floor(total / 3600);
			const minutes = Math.floor(total / 60) % 60;
			const seconds = total % 60;
			if (hours > 0) return t("durationHours", {
				hours,
				minutes: pad2(minutes),
				seconds: pad2(seconds)
			});
			return minutes > 0 ? t("durationMinutes", {
				minutes,
				seconds: pad2(seconds)
			}) : t("durationSeconds", { seconds });
		}
		/** 官方 formatLiveRunDuration：秒不补零、分钟自 60 秒起。 */
		function formatLiveRunDuration(ms, t) {
			const totalSeconds = Math.max(0, Math.floor(ms / 1e3));
			const hours = Math.floor(totalSeconds / 3600);
			const minutes = Math.floor(totalSeconds / 60) % 60;
			const seconds = String(totalSeconds % 60);
			if (hours > 0) return t("durationHours", {
				hours,
				minutes: pad2(minutes),
				seconds
			});
			return minutes > 0 ? t("durationMinutes", {
				minutes,
				seconds
			}) : t("durationSeconds", { seconds });
		}
		/**
		* 官方 formatMessageClock：同日 → `HH:mm`；同年 → `{m}月{d}日 HH:mm`；跨年 → `{y}年{m}月{d}日 HH:mm`。
		*/
		function formatMessageClock(time, t, now = Date.now()) {
			const d = new Date(time);
			const n = new Date(now);
			const clock = `${pad2(d.getHours())}:${pad2(d.getMinutes())}`;
			if (d.getFullYear() === n.getFullYear() && d.getMonth() === n.getMonth() && d.getDate() === n.getDate()) return clock;
			const params = {
				y: d.getFullYear(),
				m: d.getMonth() + 1,
				d: d.getDate()
			};
			return `${d.getFullYear() === n.getFullYear() ? t("clockDate", params) : t("clockDateYear", params)} ${clock}`;
		}
		/** 官方 formatTokens：517 / 12.2K / 517K / 1.2M。 */
		function formatTokens(value, t) {
			const scaled = (candidate) => candidate >= 100 ? String(Math.round(candidate)) : String(Math.round(candidate * 10) / 10);
			if (value < 1e3) return String(value);
			if (value < 1e6) return t("numberThousand", { value: scaled(value / 1e3) });
			return t("numberMillion", { value: scaled(value / 1e6) });
		}
		/** 官方 formatCompactCount：紧凑 token 数 + 「 tok」。 */
		function formatCompactCount(value, t) {
			return t("turnUsageCount", { count: formatTokens(value, t) });
		}
		/** 官方 formatExactTokens：按本地千分位分组（number.groupSeparator）。 */
		function formatExactTokens(value, t) {
			const digits = String(value);
			const groups = [];
			for (let end = digits.length; end > 0; end -= 3) groups.unshift(digits.slice(Math.max(0, end - 3), end));
			return groups.join(t("numberGroupSeparator"));
		}
		/** 官方 formatExactCount：精确计数 + 「 tok」。 */
		function formatExactCount(value, t) {
			return t("turnUsageCount", { count: formatExactTokens(value, t) });
		}
		/** 官方 roundedPercentUnits（message-chrome.ts:1024）：按精确比例取整，正半数向上。 */
		function roundedPercentUnits(cacheReadTokens, denominator, decimalPlaces) {
			const scale = (decimalPlaces === 0 ? 1 : 10) * 100;
			const doubledScale = scale * 2;
			const denominatorQuotient = Math.floor(denominator / doubledScale);
			const denominatorRemainder = denominator % doubledScale;
			let lower = 0;
			let upper = scale;
			while (lower < upper) {
				const candidate = Math.floor((lower + upper + 1) / 2);
				const factor = candidate * 2 - 1;
				if (cacheReadTokens >= factor * denominatorQuotient + Math.ceil(factor * denominatorRemainder / doubledScale)) lower = candidate;
				else upper = candidate - 1;
			}
			return lower;
		}
		/** 官方 displayPercentUnits。 */
		function displayPercentUnits(units, decimalPlaces) {
			if (decimalPlaces === 0) return String(units);
			const whole = Math.floor(units / 10);
			const tenths = units % 10;
			return tenths === 0 ? String(whole) : `${whole}.${tenths}`;
		}
		/**
		* 官方 formatCacheHitPercent：缓存命中率；部分命中不四舍五入成 100%（自动加精度）。
		* @returns 百分比文本；无输入时 null。
		*/
		function formatCacheHitPercent(cacheReadTokens, promptTokens, decimalPlaces = 0) {
			if (promptTokens === 0) return null;
			const missedInputTokens = promptTokens - cacheReadTokens;
			if (missedInputTokens === 0) return "100";
			const roundedUnits = roundedPercentUnits(cacheReadTokens, promptTokens, decimalPlaces);
			if (roundedUnits < (decimalPlaces === 0 ? 100 : 1e3)) return displayPercentUnits(roundedUnits, decimalPlaces);
			let distinguishingPlaces = 1;
			let scaledDoubleGap = missedInputTokens * 200;
			const denominatorTens = Math.floor(promptTokens / 10);
			while (scaledDoubleGap <= denominatorTens) {
				scaledDoubleGap *= 10;
				distinguishingPlaces += 1;
			}
			const denominatorOnes = promptTokens % 10;
			let roundedLoss = 5;
			for (let loss = 1; loss < 5; loss += 1) {
				const factor = loss * 2 + 1;
				const threshold = factor * denominatorTens + Math.floor(factor * denominatorOnes / 10);
				if (scaledDoubleGap <= threshold) {
					roundedLoss = loss;
					break;
				}
			}
			return `99.${"9".repeat(distinguishingPlaces - 1)}${10 - roundedLoss}`;
		}
		//#endregion
		//#region src/client/mirror/MessageIconActions.tsx
		/** 官方「已复制」复位时间。 */
		const COPIED_RESET_MS = 1e3;
		/** 消息操作行（复制 / 分支 / 用量 / 时钟）。 */
		function MessageIconActionsMirror(props) {
			const { text, time, clock, onBranch, branchUnavailable = false, className, extraActions, usageAction, t } = props;
			const [copied, setCopied] = (0, react.useState)(false);
			const [pending, setPending] = (0, react.useState)(false);
			const timerRef = (0, react.useRef)(void 0);
			(0, react.useEffect)(() => () => {
				if (timerRef.current !== void 0) clearTimeout(timerRef.current);
			}, []);
			const copyLabel = copied ? t("copiedLabel") : t("copyLabel");
			const onCopy = () => {
				if (copied || pending) return;
				setPending(true);
				(0, _deepseek_ai_dsh_client_ui_primitives.writeClipboard)(text).then((ok) => {
					setPending(false);
					if (!ok) return;
					setCopied(true);
					timerRef.current = setTimeout(() => {
						setCopied(false);
					}, COPIED_RESET_MS);
				});
			};
			const clockEl = time === void 0 ? null : (0, react.createElement)("time", {
				className: ocOr("MessageIconActions", "clock", "dsh-tdt-sv-clock"),
				dateTime: new Date(time).toISOString()
			}, formatMessageClock(time, t));
			const reasonId = "dsh-tdt-branch-unavailable";
			return (0, react.createElement)("div", {
				className: `${ocOr("MessageIconActions", "actions", "dsh-tdt-sv-actions")}${className === void 0 ? "" : ` ${className}`}`,
				"data-clock": clock
			}, clock === "start" ? clockEl : null, (0, react.createElement)(_deepseek_ai_dsh_client_ui_primitives.Tooltip, {
				label: copyLabel,
				side: "bottom"
			}, (0, react.createElement)("button", {
				type: "button",
				className: ocOr("MessageIconActions", "action", "dsh-tdt-sv-action"),
				"aria-label": copyLabel,
				onClick: onCopy
			}, copied ? (0, react.createElement)(_deepseek_ai_dsh_client_ui_primitives.IconCheckOutlineRegular, null) : (0, react.createElement)(_deepseek_ai_dsh_client_ui_primitives.IconCopyOutlineRegular, null))), extraActions, onBranch === void 0 ? null : (0, react.createElement)(_deepseek_ai_dsh_client_ui_primitives.Tooltip, {
				label: branchUnavailable ? t("branchUnavailableLabel") : t("branchLabel"),
				side: "bottom"
			}, (0, react.createElement)("button", {
				type: "button",
				className: ocOr("MessageIconActions", "action", "dsh-tdt-sv-action"),
				"aria-label": t("branchLabel"),
				"aria-disabled": branchUnavailable || void 0,
				"aria-describedby": branchUnavailable ? reasonId : void 0,
				"data-unavailable": branchUnavailable || void 0,
				onClick: branchUnavailable ? void 0 : onBranch
			}, (0, react.createElement)(_deepseek_ai_dsh_client_ui_primitives.IconBranchOutlineRegular, null))), onBranch === void 0 || !branchUnavailable ? null : (0, react.createElement)("span", {
				id: reasonId,
				className: ocOr("accessibility", "visuallyHidden", "dsh-tdt-sv-visuallyhidden")
			}, t("branchUnavailableLabel")), clock === "end" ? (0, react.createElement)("span", { className: ocOr("MessageIconActions", "endInfo", "dsh-tdt-sv-endinfo") }, usageAction, clockEl) : usageAction);
		}
		//#endregion
		//#region src/client/mirror/MessageItem.tsx
		/** markdown 文档级外壳文案（引用稳定——新身份会打断 MarkdownText 的流式渲染缓存）。 */
		const MD_LABELS$1 = {
			code: {
				copyLabel: "复制",
				copiedLabel: "已复制"
			},
			footnotes: "脚注"
		};
		/** 助手正文：官方 MarkdownText 渲染 + 官方 AssistantMarkdown.root 类（fallback 自绘）。 */
		function AssistantMarkdown(props) {
			if (props.text.trim() === "") return (0, react.createElement)("span", null);
			return (0, react.createElement)("div", { className: ocOr("AssistantMarkdown", "root", "dsh-tdt-sv-md") }, (0, react.createElement)(_deepseek_ai_dsh_client_ui_primitives.MarkdownText, {
				text: props.text,
				labels: MD_LABELS$1
			}));
		}
		/** 用户消息：官方 MessageItem userRow > userStack > bubble（右对齐气泡）。 */
		function UserMessage(props) {
			return (0, react.createElement)("div", { className: ocOr("MessageItem", "userRow", "") }, (0, react.createElement)("div", { className: ocOr("MessageItem", "userStack", "") }, (0, react.createElement)("div", { className: ocOr("MessageItem", "bubble", "dsh-tdt-sv-user") }, (0, react.createElement)(_deepseek_ai_dsh_client_ui_primitives.MarkdownText, {
				text: props.text,
				labels: MD_LABELS$1
			}))));
		}
		//#endregion
		//#region src/client/mirror/ReasoningRow.tsx
		const MD_LABELS = {
			code: {
				copyLabel: "复制",
				copiedLabel: "已复制"
			},
			footnotes: "脚注"
		};
		/** 官方 firstLine（lib/client.js:5687）：首行。 */
		function firstLine(text) {
			const newline = text.indexOf("\n");
			return newline === -1 ? text : text.slice(0, newline);
		}
		/** 思考行：折叠 = 「思考 · 首行预览 ⌄」；展开 = thinkBody 全文（MarkdownText compact）。 */
		function ReasoningRowMirror(props) {
			const { text, running = false, preview = true, t } = props;
			const [open, setOpen] = (0, react.useState)(false);
			if (text.trim() === "") return null;
			const summary = firstLine(text).replaceAll("**", "");
			return (0, react.createElement)("div", {
				className: ocOr("ReasoningRow", "root", "dsh-tdt-sv-reasoning"),
				"data-variant": "think",
				"data-state": running ? "running" : "ok",
				"data-expanded": open || void 0,
				"data-preview": preview && summary !== "" || void 0
			}, (0, react.createElement)(_deepseek_ai_dsh_client_ui_primitives.DisclosureRow, {
				icon: (0, react.createElement)(_deepseek_ai_dsh_client_ui_primitives.IconThinkOutlineRegular, { size: 14 }),
				title: t("thinkLabel"),
				open,
				expandable: true,
				expandOnRowClick: true,
				onToggle: () => {
					setOpen((value) => !value);
				},
				rowClassName: ocOr("ReasoningRow", "row", "dsh-tdt-sv-reasoning-row"),
				leadingClassName: ocOr("ReasoningRow", "leading", "dsh-tdt-sv-reasoning-leading"),
				titleClassName: ocOr("ReasoningRow", "title", "dsh-tdt-sv-reasoning-title"),
				chevronClassName: ocOr("ReasoningRow", "chevron", "dsh-tdt-sv-reasoning-chevron"),
				collapsedContent: (0, react.createElement)(react.Fragment, null, (0, react.createElement)("span", {
					className: ocOr("ReasoningRow", "separator", "dsh-tdt-sv-reasoning-sep"),
					"aria-hidden": true
				}), (0, react.createElement)("span", { className: ocOr("ReasoningRow", "summary", "dsh-tdt-sv-reasoning-preview") }, (0, react.createElement)("span", { className: ocOr("ReasoningRow", "summaryText", "dsh-tdt-sv-reasoning-preview-text") }, summary))),
				children: open ? (0, react.createElement)("div", { className: ocOr("ReasoningRow", "thinkBody", "dsh-tdt-sv-reasoning-body") }, (0, react.createElement)(_deepseek_ai_dsh_client_ui_primitives.MarkdownText, {
					text,
					labels: MD_LABELS,
					variant: "compact"
				})) : void 0
			}));
		}
		//#endregion
		//#region src/client/mirror/TurnProcessNodeView.tsx
		/** 官方 LIVE_RUN_CLOCK_INTERVAL_MS（lib/client.js:979）。 */
		const LIVE_RUN_CLOCK_INTERVAL_MS = 1e3;
		/** Turn 过程行：折叠时只有 label + 箭头；点开由外层 seat 把过程节点放出来。 */
		function TurnProcessNodeViewMirror(props) {
			const { turn, turnProcess, t } = props;
			const open = !turnProcess.foldable || turnProcess.open;
			const [now, setNow] = (0, react.useState)(() => Date.now());
			const ticking = turn?.status === "open" && turn.start !== void 0;
			(0, react.useEffect)(() => {
				if (!ticking) return;
				setNow(Date.now());
				const timer = setInterval(() => {
					setNow(Date.now());
				}, LIVE_RUN_CLOCK_INTERVAL_MS);
				return () => {
					clearInterval(timer);
				};
			}, [ticking]);
			if (turn === void 0 || turn.start === void 0 && turn.status !== "closed") return null;
			const canCollapse = turnProcess.foldable && turnProcess.hasContent && !turnProcess.alwaysOpen;
			const running = turn.status === "open";
			const reason = turn.end?.data?.reason?.kind;
			const elapsedMs = turn.start === void 0 ? void 0 : Math.max(1e3, (turn.end?.time ?? now) - turn.start.time);
			const duration = elapsedMs === void 0 ? void 0 : running ? formatLiveRunDuration(elapsedMs, t) : formatRunDuration(elapsedMs, t);
			const label = running ? duration === void 0 ? t("chatDeepDiving") : t("turnProcessDeepDiving", { duration }) : reason === "aborted" ? t("turnStopped") : reason === "error" ? t("turnProcessFailed") : duration === void 0 ? t("turnProcessWorked") : t("turnProcessTook", { duration });
			const announcement = running ? t("chatDeepDiving") : reason === "aborted" ? t("turnStopped") : reason === "error" ? t("turnProcessFailed") : t("turnProcessWorked");
			const spec = turnProcess.spec;
			return (0, react.createElement)(react.Fragment, null, (0, react.createElement)("span", {
				className: ocOr("accessibility", "visuallyHidden", "dsh-tdt-sv-visuallyhidden"),
				role: "status",
				"aria-live": "polite",
				"aria-atomic": "true"
			}, announcement), (0, react.createElement)("button", {
				type: "button",
				className: ocOr("TurnProcessNodeView", "root", "dsh-tdt-sv-process"),
				"data-open": open || void 0,
				"data-turn-process": spec?.turn,
				"data-turn-process-messages": spec?.messageCount,
				"data-turn-process-tool-calls": spec?.toolCallCount,
				"data-turn-process-subagents": spec?.subagentCount,
				disabled: !canCollapse,
				"aria-expanded": turnProcess.hasContent ? open : void 0,
				onClick: () => {
					turnProcess.setOpen(!open);
				}
			}, (0, react.createElement)("span", { className: ocOr("TurnProcessNodeView", "label", "dsh-tdt-sv-process-label") }, label), canCollapse ? (0, react.createElement)(_deepseek_ai_dsh_client_ui_primitives.IconChevronDownOutlineRegular, { className: ocOr("TurnProcessNodeView", "chevron", "dsh-tdt-sv-process-chevron") }) : null));
		}
		//#endregion
		//#region src/client/mirror/StatDialog.tsx
		const PANEL_MARGIN = 12;
		const PANEL_GAP = 8;
		/** 官方 useStatDialog：把弹层挂在触发器上方（side: 'top'），点外 / Esc 关闭。 */
		function useStatDialog(controlled) {
			const [ownOpen, setOwnOpen] = (0, react.useState)(false);
			const open = controlled?.open ?? ownOpen;
			const setOpen = controlled?.setOpen ?? setOwnOpen;
			const rootRef = (0, react.useRef)(null);
			const panelRef = (0, react.useRef)(null);
			const pos = (0, _deepseek_ai_dsh_client_ui_primitives.useAnchoredPosition)({
				open,
				anchorRef: rootRef,
				panelRef,
				side: "top",
				gap: PANEL_GAP,
				margin: PANEL_MARGIN
			});
			(0, _deepseek_ai_dsh_client_ui_primitives.useDismissOnOutsidePointer)(rootRef, open, setOpen, panelRef);
			(0, react.useEffect)(() => {
				if (!open) return;
				const onKeyDown = (event) => {
					if (event.key === "Escape") setOpen(false);
				};
				document.addEventListener("keydown", onKeyDown);
				return () => {
					document.removeEventListener("keydown", onKeyDown);
				};
			}, [open, setOpen]);
			return {
				open,
				setOpen,
				rootRef,
				panelRef,
				pos
			};
		}
		//#endregion
		//#region src/client/mirror/TurnUsagePanel.tsx
		/** 本轮用量 pill + 明细弹层。 */
		function TurnUsagePanelMirror(props) {
			const { usage, t } = props;
			const { open, setOpen, rootRef, panelRef, pos } = useStatDialog();
			const cacheHit = usage.cacheReadTokens === void 0 ? null : formatCacheHitPercent(usage.cacheReadTokens, usage.totalTokens - usage.outputTokens, 1);
			const total = formatCompactCount(usage.totalTokens, t);
			const routes = usage.routes?.map((route) => `${route.provider}/${route.model}`).join(", ") ?? "";
			return (0, react.createElement)("span", {
				ref: rootRef,
				className: ocOr("TurnUsagePanel", "root", "dsh-tdt-sv-usage")
			}, (0, react.createElement)("button", {
				type: "button",
				className: ocOr("TurnUsagePanel", "trigger", "dsh-tdt-sv-usage-trigger"),
				"aria-haspopup": "dialog",
				"aria-expanded": open,
				onClick: () => {
					setOpen(!open);
				}
			}, (0, react.createElement)(_deepseek_ai_dsh_client_ui_primitives.IconDatabaseOutlineRegular, null), (0, react.createElement)("span", { className: ocOr("TurnUsagePanel", "label", "dsh-tdt-sv-usage-label") }, t("turnUsageConsumed", { total }))), open ? (0, react_dom.createPortal)((0, react.createElement)("div", {
				ref: panelRef,
				className: ocOr("statDialog", "panel", "dsh-tdt-sv-stats"),
				role: "dialog",
				"aria-label": t("turnUsageTitle"),
				style: pos
			}, (0, react.createElement)("div", { className: ocOr("statDialog", "title", "dsh-tdt-sv-stats-title") }, (0, react.createElement)("span", { className: ocOr("statDialog", "titleLabel", "dsh-tdt-sv-stats-titlelabel") }, (0, react.createElement)(_deepseek_ai_dsh_client_ui_primitives.IconDatabaseOutlineRegular, null), t("turnUsageTitle")), (0, react.createElement)("span", { className: ocOr("statDialog", "titleValue", "dsh-tdt-sv-stats-titlevalue") }, formatExactCount(usage.totalTokens, t))), (0, react.createElement)("div", {
				className: ocOr("statDialog", "titleRule", "dsh-tdt-sv-stats-rule"),
				"aria-hidden": true
			}), (0, react.createElement)("dl", {
				className: ocOr("statDialog", "details", "dsh-tdt-sv-stats-details"),
				"data-turn-usage-details": true
			}, routes === "" ? null : (0, react.createElement)(react.Fragment, null, (0, react.createElement)("dt", null, t("turnUsageModel")), (0, react.createElement)("dd", { className: ocOr("statDialog", "route", "dsh-tdt-sv-stats-route") }, routes)), cacheHit === null ? null : (0, react.createElement)(react.Fragment, null, (0, react.createElement)("dt", null, t("turnUsageCacheHit")), (0, react.createElement)("dd", null, `${cacheHit}%`)), (0, react.createElement)("dt", null, t("turnUsageInput")), (0, react.createElement)("dd", null, formatExactCount(usage.uncachedInputTokens, t)), usage.cacheReadTokens === void 0 ? null : (0, react.createElement)(react.Fragment, null, (0, react.createElement)("dt", null, t("turnUsageCacheRead")), (0, react.createElement)("dd", null, formatExactCount(usage.cacheReadTokens, t))), usage.cacheWriteTokens === void 0 ? null : (0, react.createElement)(react.Fragment, null, (0, react.createElement)("dt", null, t("turnUsageCacheWrite")), (0, react.createElement)("dd", null, formatExactCount(usage.cacheWriteTokens, t))), (0, react.createElement)("dt", null, t("turnUsageOutput")), (0, react.createElement)("dd", null, formatExactCount(usage.outputTokens, t), usage.reasoningTokens === void 0 ? null : (0, react.createElement)("span", { className: ocOr("statDialog", "reasoning", "dsh-tdt-sv-stats-reasoning") }, t("turnUsageReasoning", { tokens: formatExactCount(usage.reasoningTokens, t) }))))), document.body) : null);
		}
		//#endregion
		//#region src/client/mirror/TurnTailNodeView.tsx
		/** 官方 assistantText：只取 text 块。 */
		function assistantText$1(blocks) {
			return blocks.flatMap((block) => block.kind === "text" ? [block.text ?? ""] : []).join("");
		}
		/** Turn 尾部操作行：复制 / 分支 / 用量 / 结束时钟。 */
		function TurnTailNodeViewMirror(props) {
			const { data, onBranchAt, t } = props;
			const closing = data.closing;
			if (closing === null || closing === void 0) return null;
			const text = assistantText$1(closing.blocks);
			return (0, react.createElement)("div", {
				className: ocOr("TurnTailNodeView", "root", "dsh-tdt-sv-tail"),
				"data-turn-tail": data.turn,
				"data-actions-reveal": "always"
			}, (0, react.createElement)(MessageIconActionsMirror, {
				text,
				time: closing.time,
				clock: "end",
				onBranch: onBranchAt === void 0 ? void 0 : () => {
					onBranchAt(data.seq);
				},
				className: ocOr("TurnTailNodeView", "actions", "dsh-tdt-sv-tail-actions"),
				usageAction: data.tokenUsage === void 0 ? void 0 : (0, react.createElement)(TurnUsagePanelMirror, {
					usage: data.tokenUsage,
					t
				}),
				t
			}));
		}
		//#endregion
		//#region src/client/mirror/TurnTriggerNodeView.tsx
		/** 官方 TRIGGER_ICONS（lib/client.js:6634）。 */
		const TRIGGER_ICONS = {
			request: _deepseek_ai_dsh_client_ui_primitives.IconContextInjectionOutlineRegular,
			goal: _deepseek_ai_dsh_client_ui_primitives.IconGoalOutlineRegular,
			agent: _deepseek_ai_dsh_client_ui_primitives.IconPaperPlaneOutlineRegular,
			team: _deepseek_ai_dsh_client_ui_primitives.IconAgentPresetOutlineRegular,
			subagent: _deepseek_ai_dsh_client_ui_primitives.IconAgentPresetOutlineRegular,
			github: _deepseek_ai_dsh_client_ui_primitives.IconBranchOutlineRegular,
			webhook: _deepseek_ai_dsh_client_ui_primitives.IconGlobeOutlineRegular,
			schedule: _deepseek_ai_dsh_client_ui_primitives.IconAlarmClockOutlineRegular,
			job: _deepseek_ai_dsh_client_ui_primitives.IconQueueOutlineRegular,
			plugin: _deepseek_ai_dsh_client_ui_primitives.IconCordisPluginOutlineRegular
		};
		/** 官方 turnTriggerDetails：source.kind → 标题与图标家族（默认 request）。 */
		function turnTriggerDetails(source) {
			const record = (value) => typeof value === "object" && value !== null && !Array.isArray(value) ? value : {};
			const src = record(source);
			switch (typeof src.kind === "string" ? src.kind : "") {
				case "goal": return {
					title: "triggerGoal",
					icon: "goal"
				};
				case "agent-message": return {
					title: "triggerAgent",
					icon: "agent"
				};
				case "team-message": return {
					title: "triggerTeam",
					icon: "team"
				};
				case "subagent-settled": return {
					title: "triggerSubagent",
					icon: "subagent"
				};
				case "webhook": return src.provider === "github" ? {
					title: "triggerGithub",
					icon: "github"
				} : {
					title: "triggerWebhook",
					icon: "webhook"
				};
				case "schedule": return {
					title: "triggerSchedule",
					icon: "schedule"
				};
				case "tool-jobs": return {
					title: "triggerJob",
					icon: "job"
				};
				case "cordis-host-runner": return {
					title: "triggerPlugin",
					icon: "plugin"
				};
				default: return {
					title: "triggerRequest",
					icon: "request"
				};
			}
		}
		/** 触发行：折叠时只有「图标 + 标题 + 时间 + 箭头」，点开展示注入原文。 */
		function TurnTriggerNodeViewMirror(props) {
			const { data, t } = props;
			const [open, setOpen] = (0, react.useState)(false);
			const details = turnTriggerDetails(data?.source);
			const TriggerIcon = TRIGGER_ICONS[details.icon] ?? _deepseek_ai_dsh_client_ui_primitives.IconContextInjectionOutlineRegular;
			const time = typeof data?.time === "number" ? data.time : void 0;
			const content = triggerContent(data?.content);
			return (0, react.createElement)("section", {
				className: ocOr("TurnTriggerNodeView", "root", "dsh-tdt-sv-trigger"),
				"data-turn-trigger": true
			}, (0, react.createElement)("button", {
				type: "button",
				className: ocOr("TurnTriggerNodeView", "header", "dsh-tdt-sv-trigger-header"),
				"aria-expanded": open,
				onClick: () => {
					setOpen((value) => !value);
				}
			}, (0, react.createElement)("span", {
				className: ocOr("TurnTriggerNodeView", "icon", "dsh-tdt-sv-trigger-icon"),
				"aria-hidden": true
			}, (0, react.createElement)(TriggerIcon, { size: 14 })), (0, react.createElement)("span", { className: ocOr("TurnTriggerNodeView", "title", "dsh-tdt-sv-trigger-title") }, t(details.title)), time === void 0 ? null : (0, react.createElement)("time", {
				className: ocOr("TurnTriggerNodeView", "time", "dsh-tdt-sv-trigger-time"),
				dateTime: new Date(time).toISOString()
			}, formatMessageClock(time, t)), (0, react.createElement)(_deepseek_ai_dsh_client_ui_primitives.IconChevronDownOutlineRegular, {
				size: 12,
				className: open ? ocOr("TurnTriggerNodeView", "openChevron", "dsh-tdt-sv-trigger-chevron-open") : ocOr("TurnTriggerNodeView", "chevron", "dsh-tdt-sv-trigger-chevron")
			})), open ? (0, react.createElement)("div", { className: ocOr("TurnTriggerNodeView", "body", "dsh-tdt-sv-trigger-body") }, (0, react.createElement)("p", { className: ocOr("TurnTriggerNodeView", "explanation", "dsh-tdt-sv-trigger-explanation") }, t("triggerExplanation")), (0, react.createElement)("div", { className: ocOr("TurnTriggerNodeView", "content", "dsh-tdt-sv-trigger-content") }, content === "" ? t("sessionEmpty") : content)) : null);
		}
		/** 注入原文：content 块的 text 拼接（官方 NoticeBody 的文本消费面）。 */
		function triggerContent(content) {
			if (!Array.isArray(content)) return "";
			return content.map((block) => {
				const b = block;
				if (b !== null && typeof b === "object" && b.type === "text" && typeof b.text === "string") return b.text;
				return "";
			}).filter((part) => part !== "").join("\n");
		}
		//#endregion
		//#region src/client/session-view.ts
		/** 稳定的空序列（避免默认值每次新建数组）。 */
		const EMPTY_ORDER = [];
		/** 官方样式缺失告警只打一次（避免每次渲染刷屏）。 */
		let officialWarned = false;
		/** 打开只读视图：物化 binding → 探测拉尾页 → 建 chat target。会话不可解析时返回 null。 */
		function openSessionView(sessions, uiConversation, id) {
			const log = (level, msg, extra) => {
				if (level === "warn") console.warn(`[task-dispatch:session-view] ${msg}`, extra ?? "");
				else console.info(`[task-dispatch:session-view] ${msg}`);
			};
			let retainedRef = null;
			const releaseRef = () => {
				try {
					retainedRef?.release();
				} catch (err) {
					log("warn", `sessions.retain 引用释放失败（${id}）`, err);
				}
				retainedRef = null;
			};
			let binding;
			try {
				const S0 = sessions;
				const retainFn = S0.retain;
				if (typeof retainFn === "function") try {
					retainedRef = retainFn.call(S0, id, { source: "dsh-task-dispatch-table" });
					log("info", `sessions.retain(${id}, { source }) 成功：scope 已物化`);
				} catch (err) {
					log("warn", `sessions.retain(${id}) 抛错（未知会话？）`, err);
				}
				else log("warn", `sessions 无 retain 方法；自身键=[${Object.keys(S0).join(",")}]`);
				const found = sessions.binding(id);
				if (found === void 0 || found === null) {
					const S0d = sessions;
					log("warn", `sessions.binding(${id}) 为空（会话未就位）。sessions 方法全清单=[${(() => {
						const out = /* @__PURE__ */ new Set();
						let cur = S0d;
						while (cur && (typeof cur === "object" || typeof cur === "function")) {
							for (const k of Object.getOwnPropertyNames(cur)) if (typeof cur[k] === "function" && k !== "constructor") out.add(k);
							cur = Object.getPrototypeOf(cur);
						}
						return [...out];
					})().join(",")}]；自身键=[${Object.keys(S0d).join(",")}]`);
					releaseRef();
					return null;
				}
				binding = found;
			} catch (err) {
				log("warn", `openSessionView 返回 null：sessions.binding(${id}) 抛错`, err);
				releaseRef();
				return null;
			}
			const session = binding.session;
			try {
				const opened = session.open?.();
				if (opened !== void 0 && typeof opened.catch === "function") opened.catch((err) => log("warn", `session.open(${id}) 失败（仅影响历史加载，不阻断弹窗）`, err));
			} catch (err) {
				log("warn", `session.open(${id}) 抛错`, err);
			}
			let conversation;
			try {
				conversation = uiConversation.binding(binding);
			} catch (err) {
				log("warn", "openSessionView 返回 null：uiConversation.binding 抛错（binding 已取得，断点在 uiConversation 装配）", err);
				return null;
			}
			let target;
			try {
				target = conversation.target("chat");
			} catch (err) {
				log("warn", "openSessionView 返回 null：conversation.target('chat') 抛错", err);
				return null;
			}
			log("info", `openSessionView 成功建立 target（${id}）；首屏 nodes 待订阅回填`);
			return {
				target,
				session,
				dispose: releaseRef,
				loadOlder() {
					try {
						const page = session.loadOlder?.();
						if (page !== void 0 && typeof page.catch === "function") page.catch((err) => log("warn", `session.loadOlder(${id}) 失败`, err));
					} catch (err) {
						log("warn", `session.loadOlder(${id}) 抛错`, err);
					}
				}
			};
		}
		ensureArchiveSessionStyle();
		/** JSON 安全序列化（循环引用 / 特殊值不抛）。 */
		function safeJson(value) {
			try {
				return JSON.stringify(value, null, 2) ?? String(value);
			} catch {
				return String(value);
			}
		}
		/** 提取内容块的可读文本：text 拼接、图片占位（官方 ContentBlock 是 merge-extensible map）。 */
		function contentText(blocks) {
			if (blocks === void 0) return "";
			return blocks.map((block) => {
				if (block !== null && typeof block === "object" && block.type === "text" && typeof block.text === "string") return block.text;
				if (block !== null && typeof block === "object" && block.type === "image") return "[图片]";
				return "";
			}).filter((part) => part !== "").join("\n");
		}
		/** legacy assistant 节点的纯文本（复制按钮用）。 */
		function assistantText(node) {
			return (node.blocks ?? []).map((block) => block.kind === "text" ? block.text : "").join("");
		}
		/** keyed 节点的 data（官方 ChatNodeDataMap[kind]）。 */
		function dataOf(node) {
			return node.data ?? {};
		}
		/** 节点位置 → turn 位置（官方 node.location 收窄，ChatNodeSeat.tsx:1660 的反向）。 */
		function turnLocationOf(node) {
			const location = node.location;
			return location?.kind === "turn" || location?.kind === "step" ? location.turn : void 0;
		}
		/** 官方 AssistantChatData.blocks（ui-chat contract/chat-nodes.d.ts:22）。 */
		function blocksOf(value) {
			return Array.isArray(value) ? value : void 0;
		}
		/**
		* 官方 ToolCallBlock（uic contract/records.d.ts:140）→ 工具卡 props。
		* running 半截（phase: preparing/start）只有 name/argsRaw；settled（kind: tool-result）带输出与错误。
		*/
		function toolCallCard(node, t) {
			const root = dataOf(node).root;
			if (root === void 0 || root === null) return null;
			const settled = root.kind === "tool-result";
			const call = settled ? root.call : root;
			const error = root.error;
			return {
				name: typeof call?.name === "string" ? call.name : "tool",
				argsRaw: typeof call?.argsRaw === "string" ? call.argsRaw : "",
				output: settled ? contentText(root.content) : "",
				isError: root.isError === true,
				errorName: error?.name,
				meta: root.meta,
				t
			};
		}
		/**
		* keyed 节点 → 视图（等价于官方 slot "conversation.chat.node" 的按 kind 分发）。
		* @param node - keyed ChatNode。
		* @param turnProcess - seat 下发的过程席位（turn-process / 折叠答案节点要用）。
		* @param t - 翻译席位（已包占位符替换）。
		* @param onBranchAt - 消息行分支按钮（以该轮 tail seq 开分支；undefined = 不渲染按钮）。
		* @returns 节点视图；null = 决策 28 过滤的噪音 kind。
		*/
		function renderKeyedNode(node, turnProcess, t, onBranchAt, groupPart) {
			switch (node.kind) {
				case "turn-trigger": return (0, react.createElement)(TurnTriggerNodeViewMirror, {
					data: node.data,
					t
				});
				case "turn-process": return turnProcess === void 0 ? null : (0, react.createElement)(TurnProcessNodeViewMirror, {
					turn: turnLocationOf(node),
					turnProcess,
					t
				});
				case "turn-tail": {
					const data = node.data;
					if (data === void 0 || data.closing === null || data.closing === void 0) return null;
					return (0, react.createElement)(TurnTailNodeViewMirror, {
						data,
						onBranchAt,
						t
					});
				}
				case "assistant-step": {
					const blocks = blocksOf(dataOf(node).blocks) ?? [];
					const contentBlocks = blocks.filter((block) => block.kind !== "tool-call");
					if (blocks.length > 0 && contentBlocks.length === 0) return null;
					const parts = assistantBlocks(groupPart === "reasoning" ? contentBlocks.filter((block) => block.kind === "reasoning") : groupPart === "response" ? contentBlocks.filter((block) => block.kind !== "reasoning") : contentBlocks, t);
					return parts.length === 0 ? null : (0, react.createElement)("div", { className: "dsh-tdt-sv-assistant" }, parts);
				}
				case "tool-call": {
					const card = toolCallCard(node, t);
					return card === null ? null : (0, react.createElement)(GenericCommandCard, card);
				}
				case "user":
				case "steering": {
					const text = contentText(dataOf(node).content);
					if (text === "") return null;
					return (0, react.createElement)(UserMessage, { text });
				}
				case "turn-error": return (0, react.createElement)("div", { className: "dsh-tdt-sv-notice-err" }, `${t("sessionTurnError")}${typeof dataOf(node).message === "string" && dataOf(node).message !== "" ? `：${String(dataOf(node).message)}` : ""}`);
				case "turn-max-tokens": return (0, react.createElement)("div", { className: "dsh-tdt-sv-notice" }, t("sessionMaxTokens"));
				case "model-retry": return (0, react.createElement)("div", { className: "dsh-tdt-sv-notice" }, `${t("sessionRetry")}（${typeof dataOf(node).retryState === "string" ? String(dataOf(node).retryState) : "scheduled"}）`);
				case "context":
				case "compaction":
				case "manual-compaction":
				case "unknown": return null;
				default: return (0, react.createElement)("details", { className: "dsh-tdt-sv-tool" }, (0, react.createElement)("summary", { className: "dsh-tdt-sv-notice" }, `${t("sessionUnknownKind")} ${node.kind}`), (0, react.createElement)("pre", null, safeJson(node.data)));
			}
		}
		/**
		* assistant 内容块 → 子元素数组（官方块渲染器 lib/client.js:5826-5870 的同构）：
		* text → 官方 MarkdownText、reasoning → 官方 ReasoningRow（标题「思考」）、image 占位；
		* tool-call 块一律跳过（官方 case "tool-call": break——由独立工具节点渲染，重复画 = ×2）；
		* 未知块折叠原文。
		*/
		function assistantBlocks(blocks, t) {
			if (blocks === void 0) return [];
			const parts = [];
			blocks.forEach((block, index) => {
				switch (block.kind) {
					case "text":
						if (block.text.trim() !== "") parts.push((0, react.createElement)(AssistantMarkdown, {
							key: `t${index}`,
							text: block.text
						}));
						break;
					case "reasoning":
						if (block.text.trim() !== "") parts.push((0, react.createElement)(ReasoningRowMirror, {
							key: `r${index}`,
							text: block.text,
							t
						}));
						break;
					case "image":
						parts.push((0, react.createElement)("div", {
							key: `i${index}`,
							className: "dsh-tdt-sv-image"
						}, "[图片]"));
						break;
					case "tool-call": break;
					default: parts.push((0, react.createElement)("details", {
						key: `o${index}`,
						className: "dsh-tdt-sv-tool"
					}, (0, react.createElement)("summary", null, t("sessionUnknownKind")), (0, react.createElement)("pre", null, safeJson(block.block))));
				}
			});
			return parts;
		}
		/**
		* legacy 兜底渲染：官方兼容投影（老 kind 名）的单个节点；返回 null = 按决策 28 过滤的噪音 kind。
		* 仅在 keyed `order` 缺失时使用（正常路径见 renderKeyedNode）。
		*/
		function renderLegacyNode(node, t) {
			switch (node.kind) {
				case "user":
				case "steering": {
					const text = contentText(node.content);
					if (text === "") return null;
					return (0, react.createElement)(UserMessage, {
						key: node.seq,
						text
					});
				}
				case "assistant": {
					const parts = assistantBlocks(node.blocks, t);
					return parts.length === 0 ? null : (0, react.createElement)("div", {
						key: node.seq,
						className: "dsh-tdt-sv-assistant"
					}, parts);
				}
				case "tool-result": return (0, react.createElement)(GenericCommandCard, {
					key: node.seq,
					name: node.call?.name ?? "tool",
					argsRaw: node.call?.argsRaw ?? "",
					output: contentText(node.content),
					isError: node.isError === true,
					errorName: node.error?.name,
					t
				});
				case "command": return (0, react.createElement)(GenericCommandCard, {
					key: node.seq,
					name: `/${node.name ?? "?"}`,
					argsRaw: node.args ?? "",
					output: node.outcome?.text ?? "",
					isError: node.outcome?.kind === "error",
					t
				});
				case "turn-error": return (0, react.createElement)("div", {
					key: node.seq,
					className: "dsh-tdt-sv-notice-err"
				}, `${t("sessionTurnError")}${node.message === void 0 || node.message === "" ? "" : `：${node.message}`}`);
				case "turn-max-tokens": return (0, react.createElement)("div", {
					key: node.seq,
					className: "dsh-tdt-sv-notice"
				}, t("sessionMaxTokens"));
				case "model-retry": return (0, react.createElement)("div", {
					key: node.seq,
					className: "dsh-tdt-sv-notice"
				}, `${t("sessionRetry")}（${node.retryState ?? "scheduled"}）`);
				case "context":
				case "compaction":
				case "unknown": return null;
				default: return (0, react.createElement)("details", {
					key: node.seq,
					className: "dsh-tdt-sv-tool"
				}, (0, react.createElement)("summary", { className: "dsh-tdt-sv-notice" }, `${t("sessionUnknownKind")} ${node.kind}`), (0, react.createElement)("pre", null, safeJson(node)));
			}
		}
		/**
		* 把连续的 tool-result / command 收成一个「过程」组——官方就是把工具调用折进
		* turn 的过程块（默认收起），页面才不会变成一列流水账。单个工具不再包组，避免多一层。
		*/
		function groupNodes(list) {
			const out = [];
			let run = [];
			const flush = () => {
				if (run.length === 0) return;
				if (run.length >= 2) out.push({
					kind: "process",
					nodes: run
				});
				else out.push({
					kind: "node",
					node: run[0]
				});
				run = [];
			};
			for (const node of list) {
				if (node.kind === "tool-result" || node.kind === "command") {
					run.push(node);
					continue;
				}
				flush();
				out.push({
					kind: "node",
					node
				});
			}
			flush();
			return out;
		}
		/** legacy 兜底整流的渲染（keyed order 缺失时才会走到）。 */
		function renderLegacyRows(nodes, t) {
			const items = groupNodes(nodes);
			const rows = [];
			items.forEach((entry, index) => {
				const parts = [];
				if (entry.kind === "process") {
					parts.push((0, react.createElement)("div", {
						key: "lead",
						className: "dsh-tdt-sv-notice"
					}, `${t("sessionProcess")} · ${entry.nodes.length}`));
					entry.nodes.forEach((node, i) => {
						const rendered = renderLegacyNode(node, t);
						if (rendered !== null) parts.push((0, react.createElement)("div", { key: `p${i}` }, rendered));
					});
				} else {
					const inner = renderLegacyNode(entry.node, t);
					if (inner !== null) parts.push(inner);
					if (entry.node.kind === "assistant") {
						const next = items[index + 1];
						if (next === void 0 || !(next.kind === "node" && next.node.kind === "assistant")) parts.push((0, react.createElement)(MessageIconActionsMirror, {
							key: "act",
							text: assistantText(entry.node),
							clock: "end",
							t
						}));
					}
				}
				if (parts.length === 0) return;
				rows.push((0, react.createElement)("div", {
					key: `lg${index}`,
					className: ocOr("ChatView", "flowItem", "dsh-tdt-sv-flowitem")
				}, parts));
			});
			return rows;
		}
		/**
		* 面板内只读会话弹窗（决策 28 数据链 + 决策 34 渲染）：只读、不可续聊。
		* U10「继续对话（开分支）」：头部按钮 → 确认框 → `sessions.fork`（官方 ISessions 契约，
		* 不带 atSeq = 最新已完成 turn 前缀，increaseTitle 让子会话标题递增 (1)）→ 先关弹窗
		* （release 源会话）→ `uiWorkspace.openSession(childId)`（官方导航服务：内部自己
		* retain('mainView') + selection.set + selectPanel(null)，我们只调服务、不碰保留值）。
		* @param props - viewSessionId 指向的执行会话；数据经 openSessionView 建好传入。
		*   forkSession / openHostSession 缺一即不渲染按钮（服务未就位时功能降级）。
		*/
		function SessionViewModal(props) {
			const { t, heading, sessionId, view, onClose, forkSession, openHostSession } = props;
			const tt = (0, react.useMemo)(() => interpolateTranslate(t), [t]);
			const subscribe = (0, react.useMemo)(() => (onChange) => view.target.subscribe(onChange), [view]);
			const getSnapshot = (0, react.useMemo)(() => () => view.target.getSnapshot(), [view]);
			const chat = (0, react.useSyncExternalStore)(subscribe, getSnapshot);
			const sessionSub = (0, react.useMemo)(() => (onChange) => view.session.subscribe(onChange), [view]);
			const sessionGet = (0, react.useMemo)(() => () => view.session.getSnapshot(), [view]);
			const sessionSnap = (0, react.useSyncExternalStore)(sessionSub, sessionGet);
			const [openTurns, setOpenTurns] = (0, react.useState)(() => /* @__PURE__ */ new Map());
			const onSetOpen = (0, react.useCallback)((turn, answerStep, open) => {
				setOpenTurns((prev) => {
					const next = new Map(prev);
					if (open) next.set(turn, answerStep);
					else next.delete(turn);
					return next;
				});
			}, []);
			const canFork = forkSession !== void 0 && openHostSession !== void 0;
			const [forkTarget, setForkTarget] = (0, react.useState)(null);
			const [forking, setForking] = (0, react.useState)(false);
			const [forkErr, setForkErr] = (0, react.useState)(null);
			const aliveRef = (0, react.useRef)(true);
			(0, react.useEffect)(() => () => {
				aliveRef.current = false;
			}, []);
			const onForkAccept = (0, react.useCallback)(() => {
				if (forking || forkSession === void 0 || openHostSession === void 0) return;
				setForking(true);
				setForkErr(null);
				(async () => {
					try {
						const child = await forkSession(sessionId, forkTarget?.atSeq);
						if (!aliveRef.current) return;
						onClose();
						openHostSession(child);
					} catch (error) {
						if (!aliveRef.current) return;
						setForkErr(error instanceof Error ? error.message : String(error));
					} finally {
						setForking(false);
					}
				})();
			}, [
				forking,
				forkSession,
				openHostSession,
				sessionId,
				forkTarget,
				onClose
			]);
			const onBranchAt = (0, react.useCallback)((seq) => {
				setForkErr(null);
				setForkTarget({ atSeq: seq });
			}, []);
			const order = chat?.order ?? EMPTY_ORDER;
			const store = chat?.nodes;
			const keyed = order.length > 0 && store !== void 0;
			const turns = chat?.timeline?.turns;
			const renderNode = (0, react.useCallback)((node, turnProcess, groupPart) => renderKeyedNode(node, turnProcess, tt, onBranchAt, groupPart), [tt, onBranchAt]);
			const isTurnClosed = (0, react.useCallback)((turn) => (turns?.get(turn) ?? turns?.get(String(turn)))?.status !== "open", [turns]);
			const groupedView = (0, react.useMemo)(() => keyed ? buildProcessGroups(order, (key) => store?.get(key), isTurnClosed) : void 0, [
				keyed,
				order,
				store,
				isTurnClosed
			]);
			const rendered = (keyed ? ChatNodeListMirror({
				order,
				store,
				entries: groupedView?.entries,
				groups: groupedView?.groups,
				turns,
				openState: openTurns,
				onSetOpen,
				foldCompleted: true,
				renderNode,
				t: tt
			}) : renderLegacyRows(chat?.legacy?.nodes ?? [], tt)).filter((row) => row !== null && row !== void 0);
			const officialCount = officialModuleCount();
			if (!officialWarned) {
				officialWarned = true;
				console.info(`[task-dispatch:session-view] 官方 ui-chat 模块数=${officialCount}；类名样例 frame=${officialClass("ChatView", "frame")} flowItem=${officialClass("ChatView", "flowItem")} trigger=${officialClass("TurnTriggerNodeView", "root")} turnProcess=${officialClass("TurnProcessNodeView", "root")} tail=${officialClass("TurnTailNodeView", "root")}`);
				if (officialCount === 0) console.warn("[task-dispatch:session-view] 未发现官方 ui-chat 样式模块 ⇒ 弹窗观感退回自绘样式（功能不受影响）");
			}
			const openState = sessionSnap?.openState;
			const showLoadOlder = sessionSnap?.hasMore !== false;
			const body = rendered.length === 0 ? (0, react.createElement)(ChatHint, { text: openState === "error" ? tt("sessionLoadFailed") : openState === "loading" || openState === "cold" ? tt("sessionLoading") : tt("sessionEmpty") }) : [showLoadOlder ? (0, react.createElement)(ChatOlderButton, {
				key: "older",
				label: tt("sessionLoadOlder"),
				onClick: () => {
					view.loadOlder();
				}
			}) : null, ...rendered];
			return (0, react.createElement)(react.Fragment, null, (0, react.createElement)("div", {
				className: "dsh-tdt-sv-overlay",
				onClick: onClose
			}, (0, react.createElement)("div", {
				className: "dsh-tdt-sv-panel",
				onClick: (event) => {
					event.stopPropagation();
				}
			}, (0, react.createElement)("div", { className: "dsh-tdt-sv-header" }, (0, react.createElement)("div", { className: "dsh-tdt-sv-heading" }, (0, react.createElement)("div", { className: "dsh-tdt-sv-title" }, `${tt("sessionViewerTitle")} · ${heading}`), (0, react.createElement)("div", { className: "dsh-tdt-sv-sid" }, sessionId), officialCount === 0 ? (0, react.createElement)("div", {
				className: "dsh-tdt-sv-sid",
				style: { color: "var(--dsw-alias-state-warn-primary, #b7791f)" }
			}, "⚠ 官方样式未命中（当前为自绘回退）") : null), (0, react.createElement)("div", { className: "dsh-tdt-sv-headerbtns" }, canFork ? (0, react.createElement)("button", {
				type: "button",
				className: "dsh-tdt-sv-branch",
				disabled: forking,
				title: tt("continueBranch"),
				onClick: () => {
					setForkErr(null);
					setForkTarget({});
				}
			}, (0, react.createElement)(_deepseek_ai_dsh_client_ui_primitives.IconBranchOutlineRegular, { size: 14 }), tt("continueBranch")) : null, (0, react.createElement)("button", {
				type: "button",
				className: "dsh-tdt-sv-close",
				"aria-label": tt("debugClose"),
				onClick: onClose
			}, (0, react.createElement)(_deepseek_ai_dsh_client_ui_primitives.IconCloseOutlineRegular, { size: 14 })))), (0, react.createElement)(ChatViewFrame, { children: body }))), (0, react.createElement)(_deepseek_ai_dsh_client_ui_primitives.Modal, {
				open: forkTarget !== null,
				onClose: () => {
					if (!forking) setForkTarget(null);
				},
				title: tt("forkConfirmTitle"),
				closeLabel: tt("debugClose"),
				description: tt("forkConfirmText"),
				className: "dsh-tdt-sv-forkmodal",
				footer: [(0, react.createElement)(_deepseek_ai_dsh_client_ui_primitives.Button, {
					key: "cancel",
					variant: "outline",
					disabled: forking,
					onClick: () => {
						setForkTarget(null);
					}
				}, tt("forkCancel")), (0, react.createElement)(_deepseek_ai_dsh_client_ui_primitives.Button, {
					key: "accept",
					variant: "primary",
					disabled: forking,
					onClick: onForkAccept
				}, forking ? tt("forkWorking") : tt("forkConfirmAccept"))]
			}, forkErr !== null ? (0, react.createElement)("p", { className: "dsh-tdt-sv-forkerr" }, tt("forkFailed", { error: forkErr })) : null));
		}
		//#endregion
		//#region src/client/index.ts
		/** 设置命名空间 = 宿主 apply() 里 ctx.settings.register 的注册名（src/index.ts:42）。 */
		const SETTINGS_NS = "dsh-task-dispatch-table";
		/** 字典命名空间（locale 注册表独立于 settings 命名空间，取同名便于对应）。 */
		const LOCALE_NS = SETTINGS_NS;
		/** 主面板 id：`main` 槽的 key 与 `sidebar.panellist` 条目的 id 必须一致，选中才对得上。 */
		const PANEL_ID = SETTINGS_NS;
		/** 模块级 t 席位：`sidebar.panellist` 的 label 在渲染期由侧栏求值，拿不到组件 props 的 t。 */
		let runtimeT = (key) => key;
		/** 只读参数展示值：undefined 显示占位符，statePath 空串 = 宿主数据根默认（决策 14）。 */
		function displayParam(t, value) {
			if (value === void 0) return "—";
			if (typeof value === "string" && value.trim() === "") return t("paramDefault");
			return String(value);
		}
		const C = {
			text: "var(--dsw-alias-label-primary, #1f2328)",
			textDim: "var(--dsw-alias-label-secondary, rgba(128,128,128,0.95))",
			textFaint: "var(--dsw-alias-label-tertiary, rgba(128,128,128,0.8))",
			layer1: "var(--dsw-alias-bg-layer-1, rgba(128,128,128,0.10))",
			layer2: "var(--dsw-alias-bg-layer-2, rgba(128,128,128,0.14))",
			layer3: "var(--dsw-alias-bg-layer-3, rgba(128,128,128,0.20))",
			mask: "var(--dsw-alias-bg-mask-1, rgba(0,0,0,0.45))",
			border: "var(--dsw-alias-border-l2, rgba(128,128,128,0.35))",
			borderStrong: "var(--dsw-alias-border-l3, rgba(128,128,128,0.5))",
			brand: "var(--dsw-alias-brand-primary, #2f6feb)",
			danger: "var(--dsw-alias-state-error-primary, #c0392b)",
			hover: "var(--dsw-alias-interactive-bg-hover, rgba(128,128,128,0.16))",
			activeRow: "var(--dsw-alias-interactive-bg-active, rgba(128,128,128,0.20))",
			shadow: "var(--dsw-shadow-lv3, 0 12px 40px rgba(0,0,0,0.32))",
			duration: "var(--ds-transition-duration, 0.15s)",
			ease: "var(--ds-ease-in-out, ease)"
		};
		const monoFont = "var(--ds-font-family-code, ui-monospace, SFMono-Regular, Menlo, Consolas, monospace)";
		const transition = `background ${C.duration} ${C.ease}, color ${C.duration} ${C.ease}, border-color ${C.duration} ${C.ease}`;
		const textareaStyle = {
			width: "100%",
			boxSizing: "border-box",
			minHeight: "16em",
			resize: "vertical",
			fontFamily: monoFont,
			fontSize: "12px",
			lineHeight: 1.5,
			padding: "8px",
			color: C.text,
			background: C.layer1,
			border: `1px solid ${C.border}`,
			borderRadius: "8px"
		};
		const hintStyle = {
			color: C.textDim,
			fontSize: "12px",
			margin: "4px 0 8px"
		};
		const errorStyle = {
			color: C.danger,
			fontSize: "12px",
			margin: "4px 0 0"
		};
		const rowStyle = {
			display: "flex",
			gap: "8px",
			margin: "8px 0"
		};
		const dlStyle = {
			display: "grid",
			gridTemplateColumns: "auto 1fr",
			gap: "4px 16px",
			margin: "8px 0 0"
		};
		const cardStyle = {
			display: "flex",
			alignItems: "center",
			justifyContent: "space-between",
			gap: "12px",
			padding: "12px 14px",
			border: `1px solid ${C.border}`,
			borderRadius: "10px",
			cursor: "pointer",
			width: "100%",
			boxSizing: "border-box",
			background: "transparent",
			textAlign: "left",
			color: C.text,
			transition
		};
		const cardTitleStyle = {
			fontSize: "14px",
			fontWeight: 600,
			color: C.text
		};
		const cardDescStyle = {
			fontSize: "12px",
			color: C.textDim,
			marginTop: "2px"
		};
		const chevronStyle = {
			color: C.textFaint,
			display: "flex",
			alignItems: "center"
		};
		/** 主区整页容器：占满中栏、自己滚动（会话区被 main 槽整页替换，无需遮罩）。 */
		const pageStyle = {
			height: "100%",
			width: "100%",
			boxSizing: "border-box",
			overflow: "auto",
			padding: "18px 22px",
			color: C.text,
			background: "transparent"
		};
		/** 「返回会话」按钮：轻量文字按钮，退回会话区（selectPanel(null)）。 */
		const backButtonStyle = {
			display: "inline-flex",
			alignItems: "center",
			gap: "6px",
			flex: "none",
			padding: "5px 10px",
			borderRadius: "8px",
			border: `1px solid ${C.border}`,
			background: "transparent",
			color: C.textDim,
			cursor: "pointer",
			fontFamily: "inherit",
			fontSize: "12px",
			lineHeight: "18px",
			transition
		};
		/** 抬头的三块：标题在左，右依次是「刷新 · 分组标签 · 关闭」。 */
		const panelHeaderStyle = {
			display: "flex",
			alignItems: "center",
			justifyContent: "space-between",
			gap: "12px",
			marginBottom: "4px",
			flexWrap: "wrap"
		};
		const headerRightStyle = {
			display: "flex",
			alignItems: "center",
			gap: "8px"
		};
		const panelTitleStyle = {
			fontSize: "15px",
			fontWeight: 600,
			color: C.text
		};
		/** 分组标签组（分段控件）：与宿主「近 24 小时 / 近 7 天 …」同形。 */
		const segmentedStyle = {
			display: "inline-flex",
			alignItems: "center",
			gap: "2px",
			padding: "2px",
			borderRadius: "8px",
			background: C.layer2,
			border: `1px solid ${C.border}`
		};
		function segmentStyle(active) {
			return {
				padding: "3px 12px",
				borderRadius: "6px",
				border: "none",
				cursor: "pointer",
				fontSize: "12px",
				lineHeight: "18px",
				fontFamily: "inherit",
				transition,
				background: active ? C.layer1 : "transparent",
				color: active ? C.text : C.textDim,
				fontWeight: active ? 600 : 400,
				boxShadow: active ? C.shadow : "none"
			};
		}
		/** 图标按钮（刷新 / 关闭）：方形、圆角、悬停高亮，尺寸与分段控件同高。 */
		const iconButtonStyle = {
			display: "inline-flex",
			alignItems: "center",
			justifyContent: "center",
			width: "26px",
			height: "26px",
			padding: 0,
			border: "none",
			borderRadius: "6px",
			background: "transparent",
			color: C.textDim,
			cursor: "pointer",
			transition
		};
		const sectionTitleStyle = {
			margin: "12px 0 4px",
			fontSize: "13px",
			color: C.text
		};
		const preStyle = {
			fontFamily: monoFont,
			fontSize: "12px",
			lineHeight: 1.5,
			margin: "4px 0",
			whiteSpace: "pre-wrap",
			wordBreak: "break-all",
			maxHeight: "12em",
			overflow: "auto",
			background: C.layer2,
			color: C.text,
			padding: "8px",
			borderRadius: "6px"
		};
		const tableStyle = {
			borderCollapse: "collapse",
			width: "100%",
			fontFamily: monoFont,
			fontSize: "12px",
			margin: "4px 0"
		};
		const cellStyle = {
			border: `1px solid ${C.border}`,
			padding: "2px 6px",
			textAlign: "left",
			verticalAlign: "top"
		};
		const detailCellStyle = {
			...cellStyle,
			whiteSpace: "pre-wrap",
			wordBreak: "break-all",
			maxWidth: "480px"
		};
		/** 行内文字按钮（链接样式）：用于「查看会话」等轻量动作。 */
		const linkStyle = {
			color: C.brand,
			cursor: "pointer",
			background: "none",
			border: "none",
			padding: 0,
			font: "inherit",
			fontSize: "12px",
			transition
		};
		/** 刷新图标（内联 SVG：不引宿主包，颜色走 currentColor ⇒ 自动跟随主题）。 */
		function RefreshIcon() {
			return (0, react.createElement)("svg", {
				width: 15,
				height: 15,
				viewBox: "0 0 24 24",
				fill: "none",
				stroke: "currentColor",
				strokeWidth: 2,
				strokeLinecap: "round",
				strokeLinejoin: "round"
			}, (0, react.createElement)("path", { d: "M21 12a9 9 0 1 1-2.64-6.36" }), (0, react.createElement)("path", { d: "M21 3v6h-6" }));
		}
		/** 任务表图标（内联 SVG：清单勾选，颜色走 currentColor ⇒ 自动跟随主题）。 */
		function TaskIcon(props) {
			const size = props.size ?? 18;
			return (0, react.createElement)("svg", {
				width: size,
				height: size,
				viewBox: "0 0 24 24",
				fill: "none",
				stroke: "currentColor",
				strokeWidth: 2,
				strokeLinecap: "round",
				strokeLinejoin: "round"
			}, (0, react.createElement)("rect", {
				x: 4,
				y: 4,
				width: 16,
				height: 16,
				rx: 3
			}), (0, react.createElement)("path", { d: "M8 9.5l2 2 3.5-3.5" }), (0, react.createElement)("path", { d: "M8 15.5h8" }));
		}
		/** 任务表草稿是否为宿主可解析的 JSON 数组（空白串视为清空，合法）。 */
		function isValidTaskTable(text) {
			if (text.trim() === "") return true;
			try {
				return Array.isArray(JSON.parse(text));
			} catch {
				return false;
			}
		}
		/** 宿主写入的 ISO 时间串 → 浏览器本机时区可读格式（解析失败原样返回）。 */
		function formatTime(iso) {
			const ms = Date.parse(iso);
			if (Number.isNaN(ms)) return iso;
			return new Date(ms).toLocaleString(void 0, { hour12: false });
		}
		/** 任务行归一：旧版快照的 tasks 是 string[]（只有 id），兼容成明细行。 */
		function normalizeTaskRow(item) {
			if (typeof item === "string") return {
				id: item,
				title: item,
				code: null,
				enabled: true,
				cron: null,
				once: null,
				timezone: null,
				window: "",
				workspace: "",
				next: null
			};
			const row = item ?? {};
			return {
				id: String(row.id ?? ""),
				title: String(row.title ?? row.id ?? ""),
				code: row.code === null || row.code === void 0 ? null : String(row.code),
				enabled: row.enabled !== false,
				cron: row.cron ?? null,
				once: row.once ?? null,
				timezone: row.timezone ?? null,
				window: String(row.window ?? ""),
				workspace: String(row.workspace ?? ""),
				next: row.next ?? null
			};
		}
		/** 解析快照 JSON；为空或形状不符返回 undefined（原文由调用方兜底展示）。 */
		function parseDebugSnapshot(raw) {
			if (typeof raw !== "string" || raw.trim() === "") return void 0;
			try {
				const parsed = JSON.parse(raw);
				if (typeof parsed !== "object" || parsed === null) return void 0;
				const candidate = parsed;
				if (!Array.isArray(candidate.instances) || !Array.isArray(candidate.events)) return void 0;
				const tasks = Array.isArray(candidate.tasks) ? candidate.tasks.map(normalizeTaskRow) : [];
				return {
					...parsed,
					tasks
				};
			} catch {
				return;
			}
		}
		/** 周期摘要：once 优先，其次 cron（带时区），都没有显示占位。 */
		function scheduleSummary(row) {
			if (row.once !== null && row.once !== "") return `once ${row.once}`;
			if (row.cron !== null && row.cron !== "") return `cron ${row.cron}${row.timezone === null ? "" : ` (${row.timezone})`}`;
			return "—";
		}
		const STATUS_OPTIONS = [
			"pending",
			"dispatched",
			"running",
			"succeeded",
			"failed",
			"skipped",
			"unknown"
		];
		/**
		* 调度表整页（`main` 槽，双标签）：
		* - **任务配置**：内嵌任务表 JSON 输入框（暂存 + 保存）+ 已解析任务列表（id / 名称 / 周期 / 下次执行）；
		* - **执行记录**：全部执行记录，支持按状态 / 按任务过滤，点一行展开该次执行的事件时间线。
		*
		* 数据来自 settings 快照的 debugSnapshot 字段（host 周期写入），经 useSyncExternalStore
		* 订阅自动刷新，无需手动重开。整页由布局服务的 `main` 槽承载：选中侧栏条目即替换会话区。
		*/
		function TaskPage(props) {
			const { t, scope, onBack, viewSession, forkSession, openHostSession } = props;
			const subscribe = (0, react.useCallback)((onChange) => scope.subscribe(onChange), [scope]);
			const getSnapshot = (0, react.useCallback)(() => scope.getSnapshot(), [scope]);
			const snapshot = (0, react.useSyncExternalStore)(subscribe, getSnapshot);
			const [tab, setTab] = (0, react.useState)("config");
			const [draft, setDraft] = (0, react.useState)(void 0);
			const [saving, setSaving] = (0, react.useState)(false);
			const [failed, setFailed] = (0, react.useState)(null);
			const [manualAt, setManualAt] = (0, react.useState)(void 0);
			const [statusFilter, setStatusFilter] = (0, react.useState)("all");
			const [taskFilter, setTaskFilter] = (0, react.useState)("all");
			const [expanded, setExpanded] = (0, react.useState)(null);
			const [viewing, setViewing] = (0, react.useState)(null);
			const [viewErr, setViewErr] = (0, react.useState)(null);
			const [dbDump, setDbDump] = (0, react.useState)(null);
			const [dbState, setDbState] = (0, react.useState)("idle");
			(0, react.useEffect)(() => {
				if (tab !== "debug") return;
				let alive = true;
				setDbState("loading");
				fetch(`${DISPATCH_API_PREFIX}/db`).then((res) => res.json()).then((body) => {
					if (!alive) return;
					if (body.ok === true && Array.isArray(body.tables)) {
						setDbDump({
							at: typeof body.at === "string" ? body.at : "",
							tables: body.tables
						});
						setDbState("ok");
					} else setDbState("fail");
				}).catch(() => {
					if (alive) setDbState("fail");
				});
				return () => {
					alive = false;
				};
			}, [tab, manualAt]);
			const section = snapshot.value ?? {};
			const raw = typeof section.debugSnapshot === "string" ? section.debugSnapshot : "";
			const data = parseDebugSnapshot(raw);
			const effectiveInline = typeof section.tasksInline === "string" ? section.tasksInline : "";
			const current = draft ?? effectiveInline;
			const invalid = draft !== void 0 && !isValidTaskTable(draft);
			const dirty = draft !== void 0 && draft !== effectiveInline;
			const writable = snapshot.status === "ready" && snapshot.writable && !saving;
			const save = async () => {
				if (draft === void 0 || invalid || !writable) return;
				setSaving(true);
				setFailed(null);
				try {
					if (draft.trim() === "") await scope.unset("tasksInline");
					else await scope.set("tasksInline", draft);
					setDraft(void 0);
				} catch (error) {
					setFailed(error instanceof Error ? error.message : String(error));
				} finally {
					setSaving(false);
				}
			};
			const taskRows = data?.tasks ?? [];
			const titleOfTask = (id) => {
				const row = taskRows.find((item) => item.id === id);
				return row === void 0 ? id : `${row.title}（${row.id}）`;
			};
			/**
			* 归档会话查看：sessions.binding 只查已物化的 scope ⇒ openSessionView 内会先
			* sessions.retain(id, { source }) 物化（官方源码 client.js:3410 / 3472），通常无需反归档。
			* 仅当 retain 仍失败时才兜底反归档重试，并在关闭时归档回去。
			*/
			const rearchive = (sessionId) => {
				fetch(`${DISPATCH_API_PREFIX}/session/archive`, {
					method: "POST",
					headers: { "content-type": "application/json" },
					body: JSON.stringify({ sessionId })
				}).catch(() => {});
			};
			/** 打开只读会话弹窗：retain 物化 scope 直开；失败才兜底反归档重试；不再静默无反应。 */
			const openView = async (sessionId, heading) => {
				if (viewSession === null) {
					setViewErr("查看会话不可用：sessions / uiConversation 注入未就位（见控制台）");
					return;
				}
				setViewErr(null);
				let target = viewSession(sessionId);
				let didUnarchive = false;
				if (target === null) try {
					const res = await fetch(`${DISPATCH_API_PREFIX}/session/unarchive`, {
						method: "POST",
						headers: { "content-type": "application/json" },
						body: JSON.stringify({ sessionId })
					});
					const body = await res.json();
					if (res.ok && body.ok === true) {
						didUnarchive = true;
						target = viewSession(sessionId);
					}
				} catch {}
				if (target === null) {
					setViewErr("会话无法打开：retain / 物化 scope 失败（原因见控制台 [task-dispatch:session-view] 日志）");
					return;
				}
				setViewing({
					sessionId,
					heading,
					view: target,
					didUnarchive
				});
			};
			const instances = (data?.instances ?? []).filter((row) => statusFilter === "all" || row.status === statusFilter).filter((row) => taskFilter === "all" || row.task_id === taskFilter).slice().sort((a, b) => a.scheduled_at < b.scheduled_at ? 1 : a.scheduled_at > b.scheduled_at ? -1 : 0);
			const hasRaw = raw.trim() !== "";
			/** 调试页：一张表的原始行渲染（列按建表顺序；长值截断显示，悬停 title 看全文）。 */
			const renderDbTable = (dump) => (0, react.createElement)("div", {
				key: dump.name,
				style: { marginBottom: "20px" }
			}, (0, react.createElement)("h4", { style: sectionTitleStyle }, `${dump.name} · ${dump.count} 行${dump.truncated ? `（${t("debugDbTruncated")}）` : ""}`), dump.rows.length === 0 ? (0, react.createElement)("p", { style: hintStyle }, t("debugDbEmpty")) : (0, react.createElement)("div", { style: { overflowX: "auto" } }, (0, react.createElement)("table", { style: tableStyle }, (0, react.createElement)("thead", null, (0, react.createElement)("tr", null, dump.columns.map((col) => (0, react.createElement)("th", {
				key: col,
				style: cellStyle
			}, col)))), (0, react.createElement)("tbody", null, dump.rows.map((row, index) => (0, react.createElement)("tr", { key: index }, dump.columns.map((col) => {
				const value = row[col];
				const text = value === null || value === void 0 ? "—" : String(value);
				const clipped = text.length > 160 ? `${text.slice(0, 160)}…` : text;
				return (0, react.createElement)("td", {
					key: col,
					style: col === "detail" || col === "value" ? detailCellStyle : cellStyle,
					title: text
				}, clipped);
			})))))));
			return (0, react.createElement)(react.Fragment, null, (0, react.createElement)("div", { style: pageStyle }, (0, react.createElement)("div", { style: panelHeaderStyle }, (0, react.createElement)("div", { style: {
				display: "flex",
				alignItems: "center",
				gap: "10px",
				minWidth: 0
			} }, (0, react.createElement)("button", {
				type: "button",
				style: backButtonStyle,
				title: t("backToConversation"),
				onClick: onBack
			}, `← ${t("backToConversation")}`), (0, react.createElement)("div", { style: { minWidth: 0 } }, (0, react.createElement)("div", { style: panelTitleStyle }, t("panelTitle")), data !== void 0 ? (0, react.createElement)("div", { style: {
				...hintStyle,
				margin: "2px 0 0"
			} }, formatTime(data.at)) : null)), (0, react.createElement)("div", { style: headerRightStyle }, (0, react.createElement)("button", {
				type: "button",
				style: iconButtonStyle,
				title: t("debugRefresh"),
				"aria-label": t("debugRefresh"),
				onClick: () => {
					setManualAt(Date.now());
				}
			}, (0, react.createElement)(RefreshIcon, {})), (0, react.createElement)("div", { style: segmentedStyle }, (0, react.createElement)("button", {
				type: "button",
				style: segmentStyle(tab === "config"),
				onClick: () => {
					setTab("config");
				}
			}, t("tabConfig")), (0, react.createElement)("button", {
				type: "button",
				style: segmentStyle(tab === "records"),
				onClick: () => {
					setTab("records");
				}
			}, t("tabRecords")), (0, react.createElement)("button", {
				type: "button",
				style: segmentStyle(tab === "debug"),
				onClick: () => {
					setTab("debug");
				}
			}, t("tabDebug"))))), (0, react.createElement)("p", { style: hintStyle }, t("debugAutoHint")), data === void 0 ? (0, react.createElement)("div", null, (0, react.createElement)("p", { style: hintStyle }, hasRaw ? t("debugRaw") : t("debugEmpty")), hasRaw ? (0, react.createElement)("pre", { style: preStyle }, raw) : null, (0, react.createElement)("pre", { style: {
				...preStyle,
				color: C.textFaint
			} }, describeDiag())) : tab === "config" ? (0, react.createElement)("div", null, (0, react.createElement)("label", {
				htmlFor: "dsh-tdt-modal-inline",
				style: { fontWeight: 600 }
			}, t("tasksInlineLabel")), (0, react.createElement)("p", { style: hintStyle }, t("tasksInlineHint")), (0, react.createElement)("textarea", {
				id: "dsh-tdt-modal-inline",
				value: current,
				disabled: !writable,
				onChange: (event) => {
					setDraft(event.target.value);
				},
				spellCheck: false,
				style: textareaStyle
			}), invalid ? (0, react.createElement)("p", { style: errorStyle }, t("invalidJson")) : null, (0, react.createElement)("div", { style: rowStyle }, (0, react.createElement)("button", {
				type: "button",
				onClick: () => {
					save();
				},
				disabled: !writable || invalid || !dirty
			}, saving ? t("saving") : t("save")), (0, react.createElement)("button", {
				type: "button",
				onClick: () => {
					setDraft(void 0);
					setFailed(null);
				},
				disabled: saving || !dirty
			}, t("discard"))), failed !== null ? (0, react.createElement)("p", { style: errorStyle }, failed) : null, (0, react.createElement)("h4", { style: sectionTitleStyle }, t("tasksParsedTitle")), taskRows.length === 0 ? (0, react.createElement)("p", { style: hintStyle }, t("tasksParsedEmpty")) : (0, react.createElement)("table", { style: tableStyle }, (0, react.createElement)("thead", null, (0, react.createElement)("tr", null, [
				t("colId"),
				t("colTitle"),
				t("colCode"),
				t("colSchedule"),
				t("colNext")
			].map((name) => (0, react.createElement)("th", {
				key: name,
				style: cellStyle
			}, name)))), (0, react.createElement)("tbody", null, taskRows.map((row) => (0, react.createElement)("tr", { key: row.id }, (0, react.createElement)("td", { style: cellStyle }, row.id), (0, react.createElement)("td", { style: cellStyle }, row.title), (0, react.createElement)("td", { style: cellStyle }, row.code ?? "—"), (0, react.createElement)("td", { style: cellStyle }, scheduleSummary(row)), (0, react.createElement)("td", { style: cellStyle }, row.next === null ? "—" : formatTime(row.next)))))), (0, react.createElement)("h4", { style: sectionTitleStyle }, t("debugWarns")), data.warns.length === 0 ? (0, react.createElement)("p", { style: hintStyle }, t("debugNoWarns")) : (0, react.createElement)("pre", { style: preStyle }, data.warns.join("\n")), (0, react.createElement)("details", { style: { marginTop: "16px" } }, (0, react.createElement)("summary", null, t("paramsTitle")), (0, react.createElement)("dl", { style: dlStyle }, (0, react.createElement)("dt", null, t("paramStatePath")), (0, react.createElement)("dd", { style: { margin: 0 } }, displayParam(t, section.statePath)), (0, react.createElement)("dt", null, t("paramTickMs")), (0, react.createElement)("dd", { style: { margin: 0 } }, displayParam(t, section.tickMs)), (0, react.createElement)("dt", null, t("paramDispatchGraceMs")), (0, react.createElement)("dd", { style: { margin: 0 } }, displayParam(t, section.dispatchGraceMs)), (0, react.createElement)("dt", null, t("paramLeaseMs")), (0, react.createElement)("dd", { style: { margin: 0 } }, displayParam(t, section.leaseMs)), (0, react.createElement)("dt", null, t("paramUnknownGraceMs")), (0, react.createElement)("dd", { style: { margin: 0 } }, displayParam(t, section.unknownGraceMs)), (0, react.createElement)("dt", null, t("paramTasksDir")), (0, react.createElement)("dd", { style: { margin: 0 } }, displayParam(t, section.tasksDir)), (0, react.createElement)("dt", null, t("paramDefaultProvider")), (0, react.createElement)("dd", { style: { margin: 0 } }, displayParam(t, section.defaultProvider)), (0, react.createElement)("dt", null, t("paramDefaultModel")), (0, react.createElement)("dd", { style: { margin: 0 } }, displayParam(t, section.defaultModel))))) : tab === "debug" ? (0, react.createElement)("div", null, (0, react.createElement)("p", { style: hintStyle }, t("debugDbHint")), dbState === "loading" ? (0, react.createElement)("p", { style: hintStyle }, t("debugDbLoading")) : null, dbState === "fail" ? (0, react.createElement)("p", { style: errorStyle }, t("debugDbFail")) : null, dbState === "ok" && dbDump !== null ? (0, react.createElement)("div", null, (0, react.createElement)("p", { style: hintStyle }, `${t("debugRefreshedAt")} ${formatTime(dbDump.at)}`), dbDump.tables.map((dump) => renderDbTable(dump))) : null) : (0, react.createElement)("div", null, (0, react.createElement)("p", { style: hintStyle }, t("recordsHint")), (0, react.createElement)("div", { style: rowStyle }, (0, react.createElement)("label", { style: { fontSize: "12px" } }, `${t("filterStatus")} `, (0, react.createElement)("select", {
				value: statusFilter,
				onChange: (event) => {
					setStatusFilter(event.target.value);
				}
			}, (0, react.createElement)("option", { value: "all" }, t("filterAll")), STATUS_OPTIONS.map((status) => (0, react.createElement)("option", {
				key: status,
				value: status
			}, status)))), (0, react.createElement)("label", { style: { fontSize: "12px" } }, `${t("filterTask")} `, (0, react.createElement)("select", {
				value: taskFilter,
				onChange: (event) => {
					setTaskFilter(event.target.value);
				}
			}, (0, react.createElement)("option", { value: "all" }, t("filterAll")), taskRows.map((row) => (0, react.createElement)("option", {
				key: row.id,
				value: row.id
			}, `${row.title}（${row.id}）`))))), (0, react.createElement)("p", { style: hintStyle }, t("expandHint")), instances.length === 0 ? (0, react.createElement)("p", { style: hintStyle }, t("debugInstancesEmpty")) : (0, react.createElement)("table", { style: tableStyle }, (0, react.createElement)("thead", null, (0, react.createElement)("tr", null, [
				t("colTask"),
				t("colSlot"),
				t("colStatus"),
				t("colAttempt"),
				t("colSession"),
				t("colUpdated")
			].map((name) => (0, react.createElement)("th", {
				key: name,
				style: cellStyle
			}, name)))), (0, react.createElement)("tbody", null, instances.map((row) => {
				const open = expanded === row.id;
				const events = open ? (data.events ?? []).filter((event) => event.instance_id === row.id).sort((a, b) => a.seq - b.seq) : [];
				return (0, react.createElement)(react.Fragment, { key: row.id }, (0, react.createElement)("tr", {
					style: {
						cursor: "pointer",
						background: open ? C.activeRow : void 0
					},
					onClick: () => {
						setExpanded(open ? null : row.id);
					}
				}, (0, react.createElement)("td", { style: cellStyle }, titleOfTask(row.task_id)), (0, react.createElement)("td", { style: cellStyle }, formatTime(row.scheduled_at)), (0, react.createElement)("td", { style: cellStyle }, row.status), (0, react.createElement)("td", { style: cellStyle }, String(row.attempt)), (0, react.createElement)("td", { style: cellStyle }, row.session_id === null ? "—" : viewSession !== null ? (0, react.createElement)("button", {
					type: "button",
					style: linkStyle,
					title: row.session_id,
					onClick: (event) => {
						event.stopPropagation();
						openView(row.session_id, titleOfTask(row.task_id));
					}
				}, row.session_id.slice(0, 8)) : row.session_id.slice(0, 8)), (0, react.createElement)("td", { style: cellStyle }, formatTime(row.updated_at))), open ? (0, react.createElement)("tr", null, (0, react.createElement)("td", {
					colSpan: 6,
					style: cellStyle
				}, (0, react.createElement)("div", { style: {
					fontSize: "12px",
					marginBottom: "4px",
					display: "flex",
					justifyContent: "space-between",
					alignItems: "center",
					gap: "8px"
				} }, (0, react.createElement)("span", null, t("eventsOf")), viewSession !== null && row.session_id !== null ? (0, react.createElement)("button", {
					type: "button",
					style: linkStyle,
					onClick: () => {
						openView(row.session_id, titleOfTask(row.task_id));
					}
				}, `↗ ${t("viewSession")}`) : null), events.length === 0 ? (0, react.createElement)("p", { style: hintStyle }, t("eventsEmpty")) : (0, react.createElement)("table", { style: tableStyle }, (0, react.createElement)("thead", null, (0, react.createElement)("tr", null, [
					t("colSeq"),
					t("colTs"),
					t("colKind"),
					t("colDetail")
				].map((name) => (0, react.createElement)("th", {
					key: name,
					style: cellStyle
				}, name)))), (0, react.createElement)("tbody", null, events.map((event) => (0, react.createElement)("tr", { key: event.seq }, (0, react.createElement)("td", { style: cellStyle }, String(event.seq)), (0, react.createElement)("td", { style: cellStyle }, formatTime(event.ts)), (0, react.createElement)("td", { style: cellStyle }, event.kind), (0, react.createElement)("td", { style: detailCellStyle }, event.detail ?? ""))))))) : null);
			}))))), viewing !== null ? (0, react.createElement)(SessionViewModal, {
				t,
				heading: viewing.heading,
				sessionId: viewing.sessionId,
				view: viewing.view,
				forkSession: forkSession ?? void 0,
				openHostSession: openHostSession ?? void 0,
				onClose: () => {
					const closed = viewing.sessionId;
					const needArchive = viewing.didUnarchive === true;
					viewing.view.dispose();
					setViewing(null);
					setViewErr(null);
					if (needArchive) rearchive(closed);
				}
			}) : null, viewErr !== null ? (0, react.createElement)("div", {
				style: {
					position: "fixed",
					left: "50%",
					bottom: "18px",
					transform: "translateX(-50%)",
					zIndex: 1020,
					maxWidth: "90%",
					boxSizing: "border-box",
					background: "var(--dsw-alias-bg-layer-1, rgba(40,40,40,.92))",
					color: "var(--dsw-alias-label-primary, #fff)",
					border: "1px solid var(--dsw-alias-border-l2, rgba(128,128,128,.4))",
					borderRadius: "10px",
					padding: "10px 14px",
					fontSize: "12px",
					lineHeight: "1.5",
					display: "flex",
					alignItems: "center",
					gap: "10px",
					boxShadow: "var(--dsw-shadow-lv3, 0 8px 28px rgba(0,0,0,.3))"
				},
				onClick: (event) => {
					event.stopPropagation();
				}
			}, (0, react.createElement)("span", null, viewErr), (0, react.createElement)("button", {
				type: "button",
				style: {
					appearance: "none",
					font: "inherit",
					fontSize: "12px",
					cursor: "pointer",
					color: "inherit",
					background: "none",
					border: "none",
					padding: "0 2px"
				},
				"aria-label": t("debugClose"),
				onClick: () => {
					setViewErr(null);
				}
			}, "✕")) : null);
		}
		/**
		* 设置页卡片：**只留一行「标题 + 描述 + 箭头」**，点一下切到整页（布局服务 selectPanel）。
		* 内嵌 JSON 输入框与只读运行参数都在整页里——设置页保持干净。
		* @param props - t 席位 + 打开整页的回调。
		*/
		function TasksConfigPage(props) {
			const { t, open } = props;
			return (0, react.createElement)("div", {
				style: cardStyle,
				role: "button",
				tabIndex: 0,
				onClick: open,
				onKeyDown: (event) => {
					if (event.key === "Enter" || event.key === " ") open();
				}
			}, (0, react.createElement)("div", null, (0, react.createElement)("div", { style: cardTitleStyle }, t("title")), (0, react.createElement)("div", { style: cardDescStyle }, t("description"))), (0, react.createElement)("span", { style: chevronStyle }, "›"));
		}
		/**
		* 侧栏顶部面板图标（slot = sidebar.panellist，list 槽）：组件**只画图标**——
		* 行按钮由侧栏渲染，点击由侧栏调 `ctx.layout.selectPanel(id)`，激活态由布局服务托管
		* （与「插件」行同一套样式，无需自绘）。图标颜色走 currentColor，自动跟随行的选中态。
		* @param props - size：宽栏 16 / 折叠栏 18（侧栏传入）。
		*/
		function TaskPanelIcon(props) {
			return (0, react.createElement)(TaskIcon, { size: props.size ?? 18 });
		}
		/** 当前作用域（null = 尚未就位）。 */
		let currentScope = null;
		const scopeListeners = /* @__PURE__ */ new Set();
		const getScopeValue = () => currentScope;
		const subscribeScope = (listener) => {
			scopeListeners.add(listener);
			return () => {
				scopeListeners.delete(listener);
			};
		};
		/** 采纳一个作用域（先到先用，不互相覆盖），并通知已挂载的整页重渲染。 */
		const adoptScope = (next) => {
			if (currentScope === null) {
				currentScope = next;
				afterAdopt();
				return;
			}
			if (currentScope.getSnapshot().status === "unavailable") {
				currentScope = next;
				afterAdopt();
				return;
			}
		};
		/** 通知已挂载的整页重渲染（作用域切换后）。 */
		const afterAdopt = () => {
			for (const listener of [...scopeListeners]) listener();
		};
		let channelDiag = {
			entry: "(未绑定)",
			status: "(无)",
			keys: "(无)",
			snapshotLen: 0,
			note: "作用域尚未就位"
		};
		/** @returns 诊断信息的可读文本。 */
		function describeDiag() {
			return `[数据通道诊断] entry=${channelDiag.entry} status=${channelDiag.status} snapshotLen=${channelDiag.snapshotLen} keys=${channelDiag.keys} note=${channelDiag.note}`;
		}
		/**
		* rc.1 起设置表单按 **profile entry id** 寻址，而本插件在不同部署下的行 id 可能是聚合行 id
		* 或裸命名空间——照参考插件的做法，从已服务命名空间里挑第一个命中的候选。
		*/
		const ENTRY_ID_CANDIDATES = [
			"dsh-task-dispatch-table",
			"ui-task-dispatch-table",
			"web-ui-task-dispatch-table"
		];
		/** @param forms - 共享配置表单服务。 @returns 本插件应绑定的 entry id。 */
		function servedEntryId(forms) {
			let served;
			try {
				served = forms.describe().getSnapshot().view?.namespaces?.map((item) => item.ns);
			} catch {
				served = void 0;
			}
			if (served === void 0) return SETTINGS_NS;
			return ENTRY_ID_CANDIDATES.find((id) => served.includes(id)) ?? SETTINGS_NS;
		}
		/**
		* 把 rc.1 的 ConfigForm 适配为本插件的 SettingsScope 形状。
		*
		* ⚠️ `getSnapshot` **必须返回稳定引用**：useSyncExternalStore 每次渲染都会拿快照比对，
		* 若每次都新建对象会被判定为「一直在变」⇒ 无限重渲染（React #185 Maximum update depth
		* exceeded，真机实测）。故按底层快照的引用缓存映射结果，只在底层真变了才产出新对象。
		*/
		function configFormScope(form) {
			let lastRaw;
			let lastMapped;
			return {
				getSnapshot: () => {
					const raw = form.getSnapshot();
					if (raw === lastRaw && lastMapped !== void 0) return lastMapped;
					lastRaw = raw;
					lastMapped = {
						status: raw.status,
						value: raw.value,
						base: raw.base,
						user: raw.user,
						writable: raw.writable
					};
					const debugSnapshot = typeof raw.value?.debugSnapshot === "string" ? raw.value.debugSnapshot : "";
					channelDiag = {
						entry: channelDiag.entry,
						status: raw.status,
						keys: raw.value === void 0 ? "(value 未定义)" : Object.keys(raw.value).join(","),
						snapshotLen: debugSnapshot.length,
						note: `writable=${String(raw.writable)}`
					};
					return lastMapped;
				},
				subscribe: (listener) => form.subscribe(listener),
				set: async (field, value) => {
					await form.set(field, value);
				},
				unset: async (field) => {
					await form.unset(field);
				}
			};
		}
		/**
		* rc.1 运行时数据通道：宿主经 `webServer.register` 暴露 HTTP 路由（照抄参考插件
		* dsh-task-board 的已验证通道），客户端同源 fetch 轮询，适配成 SettingsScope。
		* 宿主插件配置字段不能标 volatile，故快照 / 任务表不走 configForms。
		* 2s 轮询（宿主每 tick 写），保存任务表后即时刷新；诊断行实时反映 HTTP 状态。
		*/
		const DISPATCH_API_PREFIX = "api/task-dispatch-table";
		function httpScope() {
			let lastDebug = "";
			let lastInline = "";
			let lastMapped;
			const listeners = /* @__PURE__ */ new Set();
			let busy = false;
			const poll = async () => {
				if (busy) return;
				busy = true;
				try {
					const res = await fetch(`${DISPATCH_API_PREFIX}/snapshot`, { cache: "no-store" });
					if (!res.ok) {
						channelDiag = {
							...channelDiag,
							entry: SETTINGS_NS,
							status: "loading",
							note: `HTTP ${res.status}（轮询中）`
						};
						return;
					}
					const data = await res.json();
					const debug = data.snapshot ?? "";
					const inline = data.tasksInline ?? "";
					if (debug === lastDebug && inline === lastInline && lastMapped !== void 0) return;
					lastDebug = debug;
					lastInline = inline;
					lastMapped = {
						status: "ready",
						value: {
							debugSnapshot: debug,
							tasksInline: inline
						},
						base: void 0,
						user: void 0,
						writable: true
					};
					channelDiag = {
						entry: SETTINGS_NS,
						status: "ready",
						keys: "debugSnapshot,tasksInline",
						snapshotLen: debug.length,
						note: `HTTP ${DISPATCH_API_PREFIX}/snapshot`
					};
					for (const l of [...listeners]) l();
				} catch (error) {
					const message = error instanceof Error ? error.message : String(error);
					channelDiag = {
						...channelDiag,
						entry: SETTINGS_NS,
						status: "loading",
						note: `fetch 失败：${message}`
					};
				} finally {
					busy = false;
				}
			};
			poll();
			setInterval(() => {
				poll();
			}, 2e3);
			return {
				getSnapshot: () => lastMapped ?? {
					status: "loading",
					value: void 0,
					base: void 0,
					user: void 0,
					writable: false
				},
				subscribe: (listener) => {
					listeners.add(listener);
					return () => {
						listeners.delete(listener);
					};
				},
				set: async (field, value) => {
					if (field !== "tasksInline") return;
					const res = await fetch(`${DISPATCH_API_PREFIX}/tasks`, {
						method: "POST",
						headers: { "content-type": "application/json" },
						body: JSON.stringify({ tasksInline: String(value) })
					});
					if (!res.ok) {
						let message = `HTTP ${res.status}`;
						try {
							const body = await res.json();
							if (typeof body.error === "string" && body.error.trim() !== "") message = body.error;
						} catch {}
						throw new Error(message);
					}
					poll();
				},
				unset: async () => {}
			};
		}
		/**
		* 整页外壳（`main` 槽）：订阅作用域可用性——配置表单异步就位后自动从占位切到真页面。
		* @param props - t 席位、会话视图工厂、返回会话回调。
		*/
		function TaskPageHost(props) {
			const { t, viewRef, forkRef, openRef, onBack } = props;
			const scope = (0, react.useSyncExternalStore)(subscribeScope, getScopeValue);
			if (scope === null) return (0, react.createElement)("div", { style: pageStyle }, (0, react.createElement)("div", { style: panelHeaderStyle }, (0, react.createElement)("button", {
				type: "button",
				style: backButtonStyle,
				title: t("backToConversation"),
				onClick: onBack
			}, `← ${t("backToConversation")}`), (0, react.createElement)("div", { style: panelTitleStyle }, t("panelTitle"))), (0, react.createElement)("p", { style: hintStyle }, t("unavailable")));
			return (0, react.createElement)(TaskPage, {
				t,
				scope,
				onBack,
				viewSession: viewRef(),
				forkSession: forkRef(),
				openHostSession: openRef()
			});
		}
		/**
		* 浏览器插件入口：注册文案字典；三处注册各自挂进「服务就位才触发」的 slots 注入——
		* 设置页卡片（settings.plugin.item）、侧栏顶部条目（sidebar.panellist）与主区整页（main）。
		* 侧栏条目与整页只依赖 slots，不因 settings 服务缺席/改名而消失。
		* @param ctx - 浏览器插件上下文。
		*/
		function apply(ctx) {
			ctx.inject(["locale"], (localeCtx) => {
				ctx.effect(() => localeCtx.locale.register(LOCALE_NS, {
					zh,
					en
				}));
				try {
					runtimeT = localeCtx.locale.bind(LOCALE_NS);
				} catch {}
			});
			let viewSession = null;
			let forkSession = null;
			ctx.inject(["sessions", "uiConversation"], (sub) => {
				const sessions = sub.sessions;
				const uiConversation = sub.uiConversation;
				if (sessions !== void 0 && uiConversation !== void 0) viewSession = (id) => openSessionView(sessions, uiConversation, id);
				const forkFn = sessions?.fork;
				if (typeof forkFn === "function") forkSession = (id, atSeq) => forkFn.call(sessions, atSeq === void 0 ? {
					sessionId: id,
					increaseTitle: true
				} : {
					sessionId: id,
					increaseTitle: true,
					atSeq
				});
			});
			let openHostSession = null;
			ctx.inject(["uiWorkspace"], (sub) => {
				const ws = sub.uiWorkspace;
				if (ws !== void 0 && typeof ws.openSession === "function") openHostSession = (id) => {
					ws.openSession(id);
				};
			});
			let selectPanel = () => {};
			ctx.inject(["layout"], (sub) => {
				const layout = sub.layout;
				if (layout !== void 0) selectPanel = (id) => {
					layout.selectPanel(id);
				};
			});
			let cardRegistered = false;
			const registerCard = (sub) => {
				if (cardRegistered) return;
				cardRegistered = true;
				sub.slots.inject("settings.plugin.item", () => sub.slots.register({
					name: "settings.plugin.item",
					key: SETTINGS_NS,
					locale: LOCALE_NS,
					inject: () => ({ open: () => {
						selectPanel(PANEL_ID);
					} })
				}, TasksConfigPage));
			};
			ctx.inject(["slots", "configForms"], (sub) => {
				const forms = sub.configForms;
				if (forms === void 0) return;
				const entryId = servedEntryId(forms);
				channelDiag = {
					...channelDiag,
					entry: entryId,
					note: "已绑定 configForms"
				};
				adoptScope(configFormScope(forms.get(entryId)));
				registerCard(sub);
			});
			ctx.inject(["slots", "settingsScope"], (sub) => {
				const bound = sub.settingsScope?.bind({ namespace: SETTINGS_NS });
				if (bound === void 0) return;
				channelDiag = {
					...channelDiag,
					entry: SETTINGS_NS,
					note: "已绑定 settingsScope（旧契约）"
				};
				adoptScope(bound);
				registerCard(sub);
			});
			ctx.inject(["slots"], (sub) => {
				currentScope = httpScope();
				afterAdopt();
				registerCard(sub);
			});
			ctx.inject(["slots"], (sub) => {
				sub.slots.inject("sidebar.panellist", () => sub.slots.register({
					name: "sidebar.panellist",
					id: PANEL_ID,
					order: 30,
					label: () => runtimeT("panelTitle"),
					locale: LOCALE_NS
				}, TaskPanelIcon));
				sub.slots.inject("main", () => sub.slots.register({
					name: "main",
					key: PANEL_ID,
					locale: LOCALE_NS
				}, (props) => (0, react.createElement)(TaskPageHost, {
					t: props.t,
					viewRef: () => viewSession,
					forkRef: () => forkSession,
					openRef: () => openHostSession,
					onBack: () => {
						selectPanel(null);
					}
				})));
			});
		}
		//#endregion
		exports.apply = apply;
		return module.exports;
	}
});

//# sourceMappingURL=client.js.map