window.__ModuleLoader__.load({
	id: "dsh-task-dispatch-table",
	factory: (require) => {
		var module = { exports: {} };
		var exports = module.exports;
		Object.defineProperty(exports, Symbol.toStringTag, { value: "Module" });
		let react = require("react");
		//#region src/client/locales.ts
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
			sessionReasoning: "思考过程",
			sessionLoading: "正在加载会话记录…",
			sessionEmpty: "该会话暂无可显示的记录（可能刚建窗或已被清理）。",
			sessionLoadFailed: "会话记录加载失败（会话可能已不可读）。",
			sessionLoadOlder: "加载更早记录"
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
			sessionReasoning: "Reasoning",
			sessionLoading: "Loading session transcript…",
			sessionEmpty: "Nothing to show for this session yet (window just opened, or the log was cleaned up).",
			sessionLoadFailed: "Failed to load the session transcript (the session may no longer be readable).",
			sessionLoadOlder: "Load earlier messages"
		};
		//#endregion
		//#region src/client/archive-session-css.ts
		/** 弹窗根类名前缀（稳定，不随宿主哈希变化）。 */
		const SV_STYLE_ID = "dsh-task-dispatch-table-archive-session";
		/** 归档会话弹窗全部样式规则（一条 <style> 注入，见 ensureArchiveSessionStyle）。 */
		const ARCHIVE_SESSION_CSS = `
.dsh-tdt-sv-overlay{position:fixed;inset:0;z-index:1010;display:flex;align-items:center;justify-content:center;padding:24px;background:var(--dsw-alias-bg-mask-1,rgba(0,0,0,.45));}
.dsh-tdt-sv-panel{--dsh-tdt-content-width:var(--dsh-chat-content-width,748px);--dsh-tdt-flow-gap:var(--dsh-chat-flow-gap,8px);background:var(--dsw-alias-bg-layer-1,rgba(128,128,128,.10));color:var(--dsw-alias-label-primary,#1f2328);border:1px solid var(--dsw-alias-border-l2,rgba(128,128,128,.35));border-radius:14px;box-shadow:var(--dsw-shadow-lv3,0 12px 40px rgba(0,0,0,.32));width:100%;max-width:900px;max-height:86vh;display:flex;flex-direction:column;box-sizing:border-box;overflow:hidden;}
.dsh-tdt-sv-header{display:flex;align-items:center;justify-content:space-between;gap:12px;padding:14px 18px 10px;border-bottom:1px solid var(--dsw-alias-border-l2,rgba(128,128,128,.35));flex-wrap:wrap;}
.dsh-tdt-sv-heading{min-width:0;}
.dsh-tdt-sv-title{font-size:15px;font-weight:600;color:var(--dsw-alias-label-primary,#1f2328);}
.dsh-tdt-sv-sid{font-family:var(--ds-font-family-code,ui-monospace,SFMono-Regular,Menlo,Consolas,monospace);font-size:11px;color:var(--dsw-alias-label-tertiary,rgba(128,128,128,.8));word-break:break-all;}
.dsh-tdt-sv-actions{display:flex;align-items:center;gap:8px;}
.dsh-tdt-sv-btn{appearance:none;font:inherit;font-size:12px;line-height:18px;cursor:pointer;color:var(--dsw-alias-label-primary,#1f2328);background:var(--dsw-alias-bg-layer-2,rgba(128,128,128,.14));border:1px solid var(--dsw-alias-border-l2,rgba(128,128,128,.35));border-radius:8px;padding:4px 12px;transition:background var(--ds-transition-duration,.15s) var(--ds-ease-in-out,ease);}
.dsh-tdt-sv-btn:hover{background:var(--dsw-alias-interactive-bg-hover,rgba(128,128,128,.16));}
.dsh-tdt-sv-btn-icon{padding:4px 6px;display:inline-flex;align-items:center;justify-content:center;}
.dsh-tdt-sv-body{overflow:auto;padding:16px 18px 20px;}
.dsh-tdt-sv-col{width:100%;max-width:var(--dsh-tdt-content-width);margin:0 auto;display:flex;flex-direction:column;gap:var(--dsh-tdt-flow-gap);}
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
.dsh-tdt-sv-reasoning{align-self:stretch;border:1px solid var(--dsw-alias-border-l2,rgba(128,128,128,.28));border-radius:10px;background:var(--dsw-alias-bg-layer-1,rgba(128,128,128,.10));}
.dsh-tdt-sv-reasoning>summary{cursor:pointer;list-style:none;display:flex;align-items:center;gap:6px;padding:6px 12px;font-size:12px;color:var(--dsw-alias-label-tertiary,rgba(128,128,128,.8));user-select:none;}
.dsh-tdt-sv-reasoning>summary::-webkit-details-marker{display:none;}
.dsh-tdt-sv-reasoning>summary::before{content:'▸';font-size:10px;}
.dsh-tdt-sv-reasoning[open]>summary::before{content:'▾';}
.dsh-tdt-sv-reasoning-body{padding:0 12px 10px;white-space:pre-wrap;word-break:break-word;font-size:13px;line-height:1.6;color:var(--dsw-alias-label-secondary,rgba(128,128,128,.95));}
.dsh-tdt-sv-tool{align-self:stretch;border:1px solid var(--dsw-alias-border-l2,rgba(128,128,128,.28));border-radius:10px;background:var(--dsw-alias-bg-layer-1,rgba(128,128,128,.10));overflow:hidden;}
.dsh-tdt-sv-tool-head{display:flex;align-items:center;gap:8px;padding:6px 10px;flex-wrap:wrap;font-size:12px;}
.dsh-tdt-sv-tool-name{font-family:var(--ds-font-family-code,ui-monospace,SFMono-Regular,Menlo,Consolas,monospace);font-weight:600;color:var(--dsw-alias-brand-primary,#2f6feb);}
.dsh-tdt-sv-tool-err{color:var(--dsw-alias-state-error-primary,#c0392b);font-weight:600;}
.dsh-tdt-sv-tool details{border-top:1px solid var(--dsw-alias-border-l2,rgba(128,128,128,.24));}
.dsh-tdt-sv-tool summary{cursor:pointer;padding:4px 10px;font-size:11px;color:var(--dsw-alias-label-tertiary,rgba(128,128,128,.8));}
.dsh-tdt-sv-tool pre{margin:0;padding:8px 10px;font-family:var(--ds-font-family-code,ui-monospace,SFMono-Regular,Menlo,Consolas,monospace);font-size:11px;line-height:1.5;white-space:pre-wrap;word-break:break-all;max-height:14em;overflow:auto;background:var(--dsw-alias-bg-layer-2,rgba(128,128,128,.14));color:var(--dsw-alias-label-primary,#1f2328);}
.dsh-tdt-sv-outcome{display:block;margin-top:4px;font-family:var(--ds-font-family-code,ui-monospace,SFMono-Regular,Menlo,Consolas,monospace);font-size:11px;}
.dsh-tdt-sv-outcome-err{color:var(--dsw-alias-state-error-primary,#c0392b);}
.dsh-tdt-sv-outcome-ok{color:var(--dsw-alias-label-secondary,rgba(128,128,128,.95));}
.dsh-tdt-sv-notice{align-self:center;font-size:12px;color:var(--dsw-alias-label-tertiary,rgba(128,128,128,.8));padding:2px 8px;}
.dsh-tdt-sv-notice-err{align-self:center;font-size:12px;color:var(--dsw-alias-state-error-primary,#c0392b);padding:2px 8px;text-align:center;}
.dsh-tdt-sv-hint{font-size:12px;color:var(--dsw-alias-label-secondary,rgba(128,128,128,.95));text-align:center;padding:12px 0;}
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
		//#region node_modules/marked/lib/marked.esm.js
		/**
		* marked v18.0.14 - a markdown parser
		* Copyright (c) 2018-2026, MarkedJS. (MIT License)
		* Copyright (c) 2011-2018, Christopher Jeffrey. (MIT License)
		* https://github.com/markedjs/marked
		*/
		/**
		* DO NOT EDIT THIS FILE
		* The code in this file is generated from files in ./src/
		*/
		function I() {
			return {
				async: !1,
				breaks: !1,
				extensions: null,
				gfm: !0,
				hooks: null,
				pedantic: !1,
				renderer: null,
				silent: !1,
				tokenizer: null,
				walkTokens: null
			};
		}
		var y = I();
		function W(l) {
			y = l;
		}
		var A = { exec: () => null };
		function C$1(l) {
			let e = [];
			return (t) => {
				let n = Math.max(0, Math.min(3, t - 1)), s = e[n];
				return s || (s = l(n), e[n] = s), s;
			};
		}
		function h$2(l, e = "") {
			let t = typeof l == "string" ? l : l.source, n = {
				replace: (s, r) => {
					let o = typeof r == "string" ? r : r.source;
					return o = o.replace(x.caret, "$1"), t = t.replace(s, o), n;
				},
				getRegex: () => new RegExp(t, e)
			};
			return n;
		}
		var _e = ((l = "") => {
			try {
				return !!new RegExp("(?<=1)(?<!1)" + l);
			} catch {
				return !1;
			}
		})();
		var x = {
			codeRemoveIndent: /^(?: {0,3}\t| {1,4})/gm,
			outputLinkReplace: /\\([\[\]])/g,
			indentCodeCompensation: /^(\s+)(?:```)/,
			beginningSpace: /^\s+/,
			endingHash: /#$/,
			startingSpaceChar: /^ /,
			endingSpaceChar: / $/,
			endingSpaceTabChar: /[ \t]$/,
			nonSpaceChar: /[^ ]/,
			newLineCharGlobal: /\n/g,
			tabCharGlobal: /\t/g,
			leadingSpaceTab: /^[ \t]+/,
			multipleSpaceGlobal: /\s+/g,
			blankLine: /^[ \t]*$/,
			doubleBlankLine: /\n[ \t]*\n[ \t]*$/,
			blockquoteStart: /^ {0,3}>/,
			blockquoteSetextReplace: /\n {0,3}((?:=+|-+) *)(?=\n|$)/g,
			blockquoteSetextReplace2: /^ {0,3}>[ \t]?/gm,
			listReplaceNesting: /^ {1,4}(?=( {4})*[^ ])/g,
			listIsTask: /^\[[ xX]\] +\S/,
			listReplaceTask: /^\[[ xX]\] +/,
			listTaskCheckbox: /\[[ xX]\]/,
			anyLine: /\n.*\n/,
			hrefBrackets: /^<(.*)>$/,
			tableDelimiter: /[:|]/,
			tableAlignChars: /^\||\| *$/g,
			tableRowBlankLine: /\n[ \t]*$/,
			tableAlignRight: /^ *-+: *$/,
			tableAlignCenter: /^ *:-+: *$/,
			tableAlignLeft: /^ *:-+ *$/,
			startATag: /^<a /i,
			endATag: /^<\/a>/i,
			startPreScriptTag: /^<(pre|code|kbd|script)(\s|>)/i,
			endPreScriptTag: /^<\/(pre|code|kbd|script)(\s|>)/i,
			startAngleBracket: /^</,
			endAngleBracket: />$/,
			pedanticHrefTitle: /^([^'"]*[^\s])\s+(['"])(.*)\2/,
			unicodeAlphaNumeric: /[\p{L}\p{N}]/u,
			numericCharacterReference: /&#(?:(\d{1,7})|[Xx]([A-Fa-f0-9]{1,6}));/g,
			escapeTest: /[&<>"']/,
			escapeReplace: /[&<>"']/g,
			escapeTestNoEncode: /[<>"']|&(?!(#\d{1,7}|#[Xx][a-fA-F0-9]{1,6}|\w+);)/,
			escapeReplaceNoEncode: /[<>"']|&(?!(#\d{1,7}|#[Xx][a-fA-F0-9]{1,6}|\w+);)/g,
			caret: /(^|[^\[])\^/g,
			percentDecode: /%25/g,
			findPipe: /\|/g,
			splitPipe: / \|/,
			slashPipe: /\\\|/g,
			carriageReturn: /\r\n|\r/g,
			spaceLine: /^ +$/gm,
			notSpaceStart: /^\S*/,
			endingNewline: /\n$/,
			listItemRegex: (l) => new RegExp(`^( {0,3}${l})((?:[	 ][^\\n]*)?(?:\\n|$))`),
			nextBulletRegex: C$1((l) => new RegExp(`^ {0,${l}}(?:[*+-]|\\d{1,9}[.)])((?:[ 	][^\\n]*)?(?:\\n|$))`)),
			hrRegex: C$1((l) => new RegExp(`^ {0,${l}}((?:-[ 	]*){3,}|(?:_[ 	]*){3,}|(?:\\*[ 	]*){3,})(?:\\n+|$)`)),
			fencesBeginRegex: C$1((l) => new RegExp(`^ {0,${l}}(?:\`\`\`|~~~)`)),
			headingBeginRegex: C$1((l) => new RegExp(`^ {0,${l}}#`)),
			htmlBeginRegex: C$1((l) => new RegExp(`^ {0,${l}}(?:</?(?:${N})(?: +|$|/?>)|<(?:script|pre|style|textarea|!--))`, "i")),
			blockquoteBeginRegex: C$1((l) => new RegExp(`^ {0,${l}}>`))
		};
		var $e = /^(?:[ \t]*(?:\n|$))+/;
		var Le = /^((?: {4}| {0,3}\t)[^\n]+(?:\n(?:[ \t]*(?:\n|$))*)?)+/;
		var ze = /^ {0,3}(`{3,}(?=[^`\n]*(?:\n|$))|~{3,})([^\n]*)(?:\n|$)(?:|([\s\S]*?)(?:\n|$))(?: {0,3}\1[~`]* *(?=\n|$)|$)/;
		var G = /^ {0,3}((?:-[\t ]*){3,}|(?:_[ \t]*){3,}|(?:\*[ \t]*){3,})(?:\n+|$)/;
		var Ae = /^ {0,3}(#{1,6})(?=\s|$)(.*)(?:\n+|$)/;
		var J = / {0,3}(?:[*+-]|\d{1,9}[.)])/;
		var ce = /^(?!bull |blockCode|fences|blockquote|heading|html|table)((?:.|\n(?!\s*?\n|bull |fences|blockquote|heading|hr|html|table))+?)\n {0,3}(=+|-+) *(?:\n+|$)/;
		var he = h$2(ce).replace(/bull/g, J).replace(/blockCode/g, /(?: {4}| {0,3}\t)/).replace(/fences/g, / {0,3}(?:`{3,}|~{3,})/).replace(/blockquote/g, / {0,3}>/).replace(/heading/g, / {0,3}#{1,6}(?:\s|$)/).replace(/hr/g, / {0,3}(?:(?:-[\t ]*){3,}|(?:_[ \t]*){3,}|(?:\*[ \t]*){3,})(?:\n+|$)/).replace(/html/g, / {0,3}<[^\n>]+>\n/).replace(/\|table/g, "").getRegex();
		var Ee = h$2(ce).replace(/bull/g, J).replace(/blockCode/g, /(?: {4}| {0,3}\t)/).replace(/fences/g, / {0,3}(?:`{3,}|~{3,})/).replace(/blockquote/g, / {0,3}>/).replace(/heading/g, / {0,3}#{1,6}(?:\s|$)/).replace(/hr/g, / {0,3}(?:(?:-[\t ]*){3,}|(?:_[ \t]*){3,}|(?:\*[ \t]*){3,})(?:\n+|$)/).replace(/html/g, / {0,3}<[^\n>]+>\n/).replace(/table/g, / {0,3}\|?(?:[:\- ]*\|)+[\:\- ]*\n/).getRegex();
		var V = /^([^\n]+(?:\n(?!hr|heading|lheading|blockquote|fences|list|html|table|[ \t]+\n)[^\n]+)*)/;
		var Me = /^[^\n]+/;
		var Y = /(?!\s*\])(?:\\[\s\S]|[^\[\]\\])+/;
		var Ie = h$2(/^ {0,3}\[(label)\]: *(?:\n[ \t]*)?([^<\s][^\s]*|<.*?>)(?:(?: +(?:\n[ \t]*)?| *\n[ \t]*)(title))? *(?:\n+|$)/).replace("label", Y).replace("title", /(?:"(?:\\"?|[^"\\])*"|'[^'\n]*(?:\n[^'\n]+)*\n?'|\([^()]*\))/).getRegex();
		var Ce = h$2(/^(bull)([ \t][^\n]*?)?(?:\n|$)/).replace(/bull/g, J).getRegex();
		var N = "address|article|aside|base|basefont|blockquote|body|caption|center|col|colgroup|dd|details|dialog|dir|div|dl|dt|fieldset|figcaption|figure|footer|form|frame|frameset|h[1-6]|head|header|hr|html|iframe|legend|li|link|main|menu|menuitem|meta|nav|noframes|ol|optgroup|option|p|param|search|section|summary|table|tbody|td|tfoot|th|thead|title|tr|track|ul";
		var ee = /<!--(?:-?>|[\s\S]*?(?:-->|$))/;
		var Be = h$2("^ {0,3}(?:<(script|pre|style|textarea)[\\s>][\\s\\S]*?(?:</\\1>[^\\n]*\\n*|$)|comment[^\\n]*(\\n+|$)|<\\?[\\s\\S]*?(?:\\?>[^\\n]*\\n*|$)|<![A-Z][\\s\\S]*?(?:>[^\\n]*\\n*|$)|<!\\[CDATA\\[[\\s\\S]*?(?:\\]\\]>[^\\n]*\\n*|$)|</?(tag)(?: +|\\n|/?>)[\\s\\S]*?(?:(?:\\n[ 	]*)+\\n|$)|<(?!script|pre|style|textarea)([a-z][a-z0-9-]*)(?:attribute)*? */?>(?=[ \\t]*(?:\\n|$))[\\s\\S]*?(?:(?:\\n[ 	]*)+\\n|$)|</(?!script|pre|style|textarea)[a-z][a-z0-9-]*\\s*>(?=[ \\t]*(?:\\n|$))[\\s\\S]*?(?:(?:\\n[ 	]*)+\\n|$))", "i").replace("comment", ee).replace("tag", N).replace("attribute", / +[a-zA-Z:_][\w.:-]*(?: *= *"[^"\n]*"| *= *'[^'\n]*'| *= *[^\s"'=<>`]+)?/).getRegex();
		var de = (l) => h$2(V).replace("hr", G).replace("heading", " {0,3}#{1,6}(?:\\s|$)").replace("|lheading", "").replace("|table", "").replace("blockquote", " {0,3}>").replace("fences", " {0,3}(?:`{3,}(?=[^`\\n]*(?:\\n|$))|~~~)[^\\n]*(?:\\n|$)").replace("list", l).replace("html", "</?(?:tag)(?: +|\\n|/?>)|<(?:script|pre|style|textarea|!--)").replace("tag", N).getRegex();
		var De = de(/ {0,3}(?:[*+-]|1[.)])[ \t]+[^ \t\n]/);
		var qe = de(/ {0,3}(?:[*+-]|\d{1,9}[.)])(?:[ \t]|\n|$)/);
		var te = {
			blockquote: h$2(/^( {0,3}> ?(paragraph|[^\n]*)(?:\n|$))+/).replace("paragraph", qe).getRegex(),
			code: Le,
			def: Ie,
			fences: ze,
			heading: Ae,
			hr: G,
			html: Be,
			lheading: he,
			list: Ce,
			newline: $e,
			paragraph: De,
			table: A,
			text: Me
		};
		var le = h$2("^ *([^\\n ].*)\\n {0,3}((?:\\| *)?:?-+:? *(?:\\| *:?-+:? *)*(?:\\| *)?)(?:\\n((?:(?! *\\n|hr|heading|blockquote|code|fences|list|html).*(?:\\n|$))*)\\n*|$)").replace("hr", G).replace("heading", " {0,3}#{1,6}(?:\\s|$)").replace("blockquote", " {0,3}>").replace("code", "(?: {4}| {0,3}	)[^\\n]").replace("fences", " {0,3}(?:`{3,}(?=[^`\\n]*(?:\\n|$))|~~~)[^\\n]*(?:\\n|$)").replace("list", " {0,3}(?:[*+-]|1[.)])[ \\t]").replace("html", "</?(?:tag)(?: +|\\n|/?>)|<(?:script|pre|style|textarea|!--)").replace("tag", N).getRegex();
		var Ze = {
			...te,
			lheading: Ee,
			table: le,
			paragraph: h$2(V).replace("hr", G).replace("heading", " {0,3}#{1,6}(?:\\s|$)").replace("|lheading", "").replace("table", le).replace("blockquote", " {0,3}>").replace("fences", " {0,3}(?:`{3,}(?=[^`\\n]*(?:\\n|$))|~~~)[^\\n]*(?:\\n|$)").replace("list", " {0,3}(?:[*+-]|1[.)])[ \\t]+[^ \\t\\n]").replace("html", "</?(?:tag)(?: +|\\n|/?>)|<(?:script|pre|style|textarea|!--)").replace("tag", N).getRegex()
		};
		var He = {
			...te,
			html: h$2(`^ *(?:comment *(?:\\n|\\s*$)|<(tag)[\\s\\S]+?</\\1> *(?:\\n{2,}|\\s*$)|<tag(?:"[^"]*"|'[^']*'|\\s[^'"/>\\s]*)*?/?> *(?:\\n{2,}|\\s*$))`).replace("comment", ee).replace(/tag/g, "(?!(?:a|em|strong|small|s|cite|q|dfn|abbr|data|time|code|var|samp|kbd|sub|sup|i|b|u|mark|ruby|rt|rp|bdi|bdo|span|br|wbr|ins|del|img)\\b)\\w+(?!:|[^\\w\\s@]*@)\\b").getRegex(),
			def: /^ *\[([^\]]+)\]: *<?([^\s>]+)>?(?: +(["(][^\n]+[")]))? *(?:\n+|$)/,
			heading: /^(#{1,6})(.*)(?:\n+|$)/,
			fences: A,
			lheading: /^(.+?)\n {0,3}(=+|-+) *(?:\n+|$)/,
			paragraph: h$2(V).replace("hr", G).replace("heading", ` *#{1,6} *[^
]`).replace("lheading", he).replace("|table", "").replace("blockquote", " {0,3}>").replace("|fences", "").replace("|list", "").replace("|html", "").replace("|tag", "").getRegex()
		};
		var Ge = /^\\([!"#$%&'()*+,\-./:;<=>?@\[\]\\^_`{|}~])/;
		var Ne = /^(`+)([^`]|[^`][\s\S]*?[^`])\1(?!`)/;
		var ke = /^( {2,}|\\)\n(?!\s*$)[ \t]*/;
		var Qe = /^(`+|[^`])(?:(?= {2,}\n)|[\s\S]*?(?:(?=[\\<!\[`*_]|\b_|$)|[^ ](?= {2,}\n)))/;
		var $ = /[\p{P}\p{S}]/u;
		var B = /[\s\p{P}\p{S}]/u;
		var Q = /[^\s\p{P}\p{S}]/u;
		var je = h$2(/^((?![*_])punctSpace)/, "u").replace(/punctSpace/g, B).getRegex();
		var Fe = /[\p{Pi}\p{Ps}"']/u;
		var ge = /(?!~)[\p{P}\p{S}]/u;
		var Ue = /(?!~)[\s\p{P}\p{S}]/u;
		var Ke = /(?:[^\s\p{P}\p{S}]|~)/u;
		var We = h$2(/link|precode-code|html/, "g").replace("link", /\[(?:[^\[\]`]|(?<a>`+)[^`]+\k<a>(?!`))*?\]\((?:\\[\s\S]|[^\\\(\)]|\((?:\\[\s\S]|[^\\\(\)])*\))*\)/).replace("precode-", _e ? "(?<!`)()" : "(^^|[^`])").replace("code", /(?<b>`+)[^`]+\k<b>(?!`)/).replace("html", /<(?! )[^<>]*?>/).getRegex();
		var fe = /^(?:\*+(?:((?!\*)punct)|([^\s*]))?)|^_+(?:((?!_)punct)|([^\s_]))?/;
		var Xe = h$2(fe, "u").replace(/punct/g, $).getRegex();
		var Je = h$2(fe, "u").replace(/punct/g, ge).getRegex();
		var Ye = h$2(/^(?:\*+(?:((?!\*)(?!openQuote)punct)|([^\s*]))?)|^_+(?:((?!_)(?!openQuote)punct)|([^\s_]))?/, "u").replace(/openQuote/g, Fe).replace(/punct/g, $).getRegex();
		var me = "^[^_*]*?__[^_*]*?\\*[^_*]*?(?=__)|[^*]+(?=[^*])|(?!\\*)punct(\\*+)(?=[\\s]|$)|notPunctSpace(\\*+)(?!\\*)(?=punctSpace|$)|(?!\\*)punctSpace(\\*+)(?=notPunctSpace)|[\\s](\\*+)(?!\\*)(?=punct)|(?!\\*)punct(\\*+)(?!\\*)(?=punct)|notPunctSpace(\\*+)(?=notPunctSpace)";
		var et = h$2(me, "gu").replace(/notPunctSpace/g, Q).replace(/punctSpace/g, B).replace(/punct/g, $).getRegex();
		var tt = h$2(me, "gu").replace(/notPunctSpace/g, Ke).replace(/punctSpace/g, Ue).replace(/punct/g, ge).getRegex();
		var rt = h$2("^[^_*]*?__[^_*]*?\\*[^_*]*?(?=__)|[^*]+(?=[^*])|(?!\\*)punct(\\*+)(?=[\\s]|$)|notPunctSpace(\\*+)(?!\\*)(?=punctSpace|$)|(?!\\*)[\\s](\\*+)(?=notPunctSpace)|[\\s](\\*+)(?!\\*)(?=punct)|(?!\\*)punct(\\*+)(?!\\*)(?=punct)|(?:(?!\\*)punct|notPunctSpace)(\\*+)(?!\\*)(?=notPunctSpace)", "gu").replace(/notPunctSpace/g, Q).replace(/punctSpace/g, B).replace(/punct/g, $).getRegex();
		var st = h$2("^[^_*]*?\\*\\*[^_*]*?_[^_*]*?(?=\\*\\*)|[^_]+(?=[^_])|(?!_)punct(_+)(?=[\\s]|$)|notPunctSpace(_+)(?!_)(?=punctSpace|$)|(?!_)punctSpace(_+)(?=notPunctSpace)|[\\s](_+)(?!_)(?=punct)|(?!_)punct(_+)(?!_)(?=punct)", "gu").replace(/notPunctSpace/g, Q).replace(/punctSpace/g, B).replace(/punct/g, $).getRegex();
		var ot = h$2("^[^_*]*?\\*\\*[^_*]*?_[^_*]*?(?=\\*\\*)|[^_]+(?=[^_])|(?!_)punct(_+)(?=[\\s]|$)|notPunctSpace(_+)(?!_)(?=punctSpace|$)|(?!_)[\\s](_+)(?=notPunctSpace)|[\\s](_+)(?!_)(?=punct)|(?!_)punct(_+)(?!_)(?=punct)|(?:(?!_)punct|notPunctSpace)(_+)(?!_)(?=notPunctSpace)", "gu").replace(/notPunctSpace/g, Q).replace(/punctSpace/g, B).replace(/punct/g, $).getRegex();
		var at = h$2(/^~~?(?:((?!~)punct)|[^\s~])/, "u").replace(/punct/g, $).getRegex();
		var ut = h$2("^[^~]+(?=[^~])|(?!~)punct(~~?)(?=[\\s]|$)|notPunctSpace(~~?)(?!~)(?=punctSpace|$)|(?!~)punctSpace(~~?)(?=notPunctSpace)|[\\s](~~?)(?!~)(?=punct)|(?!~)punct(~~?)(?!~)(?=punct)|notPunctSpace(~~?)(?=notPunctSpace)", "gu").replace(/notPunctSpace/g, Q).replace(/punctSpace/g, B).replace(/punct/g, $).getRegex();
		var pt = h$2(/\\(punct)/, "gu").replace(/punct/g, $).getRegex();
		var ct = h$2(/^<(scheme:[^\s\x00-\x1f<>]*|email)>/).replace("scheme", /[a-zA-Z][a-zA-Z0-9+.-]{1,31}/).replace("email", /[a-zA-Z0-9.!#$%&'*+/=?^_`{|}~-]+(@)[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?(?:\.[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?)+(?![-_])/).getRegex();
		var ht = h$2(ee).replace("(?:-->|$)", "-->").getRegex();
		var dt = h$2("^comment|^</[a-zA-Z][a-zA-Z0-9-]*\\s*>|^<[a-zA-Z][a-zA-Z0-9-]*(?:attribute)*?\\s*/?>|^<\\?[\\s\\S]*?\\?>|^<![a-zA-Z]+\\s[\\s\\S]*?>|^<!\\[CDATA\\[[\\s\\S]*?\\]\\]>").replace("comment", ht).replace("attribute", /\s+[a-zA-Z:_][\w.:-]*(?:\s*=\s*"[^"]*"|\s*=\s*'[^']*'|\s*=\s*[^\s"'=<>`]+)?/).getRegex();
		var xe = /\[(?:\\[\s\S]|[^\[\]\\])*\]/;
		var U = h$2(/(?:\[(?:brackets|\\[\s\S]|[^\[\]\\])*\]|\\[\s\S]|`+(?!`)[^`]*?`+(?!`)|``+(?=\])|[^\[\]\\`])*?/).replace("brackets", xe).getRegex();
		var kt = h$2(/^!?\[(label)\]\(\s*(href)(?:(?:[ \t]+(?:\n[ \t]*)?|\n[ \t]*)(title))?\s*\)/).replace("label", U).replace("href", /<(?:\\.|[^\n<>\\])+>|[^ \t\n\x00-\x1f]+|(?=\))/).replace("title", /"(?:\\"?|[^"\\])*"|'(?:\\'?|[^'\\])*'|\((?:\\\)?|[^)\\])*\)/).getRegex();
		var gt = h$2(/^!?\[(label)\]\[(ref)\]/).replace("label", U).replace("ref", Y).getRegex();
		var ft = h$2(/^!?\[(ref)\](?:\[\])?/).replace("ref", Y).getRegex();
		var ue = /(?!\s*\])(?:\\[\s\S]|[^\[\]\\]){1,999}/;
		var mt = h$2(/(?:[^\[\]\\`]*(?:\[(?:brackets|\\[\s\S]|[^\[\]\\])*\]|\\[\s\S]|`+(?!`)[^`]*?`+(?!`)|``+(?=\]))){0,999}?[^\[\]\\`]*?/).replace("brackets", xe).getRegex();
		var xt = h$2("reflink|nolink(?!\\()", "g").replace("reflink", h$2(/^!?\[(label)\]\[(ref)\]/).replace("label", mt).replace("ref", ue).getRegex()).replace("nolink", h$2(/^!?\[(ref)\](?:\[\])?/).replace("ref", ue).getRegex()).getRegex();
		var pe = /[hH][tT][tT][pP][sS]?|[fF][tT][pP]/;
		var Rt = h$2(/(?:mailto:email|xmpp:email(?:\/[A-Za-z0-9@.]+)?)/).replace(/email/g, /[A-Za-z0-9._+-]+@[a-zA-Z0-9-_]+(?:\.[a-zA-Z0-9-_]*[a-zA-Z0-9])+(?![\w-])/).getRegex();
		var ne = {
			_backpedal: A,
			anyPunctuation: pt,
			autolink: ct,
			blockSkip: We,
			br: ke,
			code: Ne,
			del: A,
			delLDelim: A,
			delRDelim: A,
			emStrongLDelim: Xe,
			emStrongRDelimAst: et,
			emStrongRDelimUnd: st,
			escape: Ge,
			link: kt,
			nolink: ft,
			punctuation: je,
			reflink: gt,
			reflinkSearch: xt,
			tag: dt,
			text: Qe,
			url: A
		};
		var Tt = {
			...ne,
			emStrongLDelim: Ye,
			emStrongRDelimAst: rt,
			emStrongRDelimUnd: ot,
			link: h$2(/^!?\[(label)\]\((.*?)\)/).replace("label", U).getRegex(),
			reflink: h$2(/^!?\[(label)\]\s*\[([^\]]*)\]/).replace("label", U).getRegex()
		};
		var X = {
			...ne,
			emStrongRDelimAst: tt,
			emStrongLDelim: Je,
			delLDelim: at,
			delRDelim: ut,
			url: h$2(/^emailProtocol|^((?:protocol):\/\/|www\.)(?:[a-zA-Z0-9\-]+\.?)+[^\s<]*|^email/).replace("emailProtocol", Rt).replace("protocol", pe).replace("email", /[A-Za-z0-9._+-]+(@)[a-zA-Z0-9-_]+(?:\.[a-zA-Z0-9-_]*[a-zA-Z0-9])+(?![\w-])/).getRegex(),
			_backpedal: /(?:[^?!.,:;*_'"~()&]+|\([^)]*\)|&(?![a-zA-Z0-9]+;$)|[?!.,:;*_'"~)]+(?!$))+/,
			del: /^(~~?)(?=[^\s~])((?:\\[\s\S]|[^\\])*?(?:\\[\s\S]|[^\s~\\]))\1(?=[^~]|$)/,
			text: h$2(/^(?:[^a-zA-Z0-9](?=emailProtocol)|(`+|~+|[^`~])(?:(?=[`~])|(?= {2,}\n)|(?=[a-zA-Z0-9.!#$%&'*+\/=?_`{\|}~-]+@)|[\s\S]*?(?:(?=[\\<!\[`*~_]|\b_|protocol:\/\/|www\.|$)|[^ ](?= {2,}\n)|[^a-zA-Z0-9](?=emailProtocol)|[^a-zA-Z0-9.!#$%&'*+\/=?_`{\|}~-](?=[a-zA-Z0-9.!#$%&'*+\/=?_`{\|}~-]+@))))/).replace("protocol", pe).replace(/emailProtocol/g, /(?:mailto|xmpp):/).getRegex()
		};
		var Ot = {
			...X,
			br: h$2(ke).replace("{2,}", "*").getRegex(),
			text: h$2(X.text).replace("\\b_", "\\b_| {2,}\\n").replace(/\{2,\}/g, "*").getRegex()
		};
		var j = {
			normal: te,
			gfm: Ze,
			pedantic: He
		};
		var D = {
			normal: ne,
			gfm: X,
			breaks: Ot,
			pedantic: Tt
		};
		var wt = {
			"&": "&amp;",
			"<": "&lt;",
			">": "&gt;",
			"\"": "&quot;",
			"'": "&#39;"
		};
		var be = (l) => wt[l];
		function O(l, e) {
			if (e) {
				if (x.escapeTest.test(l)) return l.replace(x.escapeReplace, be);
			} else if (x.escapeTestNoEncode.test(l)) return l.replace(x.escapeReplaceNoEncode, be);
			return l;
		}
		function Re(l) {
			return l.replace(x.numericCharacterReference, (e, t, n) => {
				let s = t === void 0 ? Number.parseInt(n, 16) : Number.parseInt(t, 10);
				return s === 0 || s > 1114111 || s >= 55296 && s <= 57343 ? "�" : String.fromCodePoint(s);
			});
		}
		function re(l) {
			try {
				l = encodeURI(l).replace(x.percentDecode, "%");
			} catch {
				return null;
			}
			return l;
		}
		function se(l, e) {
			let n = l.replace(x.findPipe, (r, o, i) => {
				let u = !1, a = o;
				for (; --a >= 0 && i[a] === "\\";) u = !u;
				return u ? "|" : " |";
			}).split(x.splitPipe), s = 0;
			if (n[0].trim() || n.shift(), n.length > 0 && !n.at(-1)?.trim() && n.pop(), e) if (n.length > e) n.splice(e);
			else for (; n.length < e;) n.push("");
			for (; s < n.length; s++) n[s] = n[s].trim().replace(x.slashPipe, "|");
			return n;
		}
		function L(l, e, t) {
			let n = l.length;
			if (n === 0) return "";
			let s = 0;
			for (; s < n;) {
				let r = l.charAt(n - s - 1);
				if (r === e && !t) s++;
				else if (r !== e && t) s++;
				else break;
			}
			return l.slice(0, n - s);
		}
		function ie(l) {
			let e = l.split(`
`), t = e.length - 1;
			for (; t >= 0 && x.blankLine.test(e[t]);) t--;
			return e.length - t <= 2 ? l : e.slice(0, t + 1).join(`
`);
		}
		function q(l) {
			return l.trim().toLowerCase().toUpperCase().toLowerCase();
		}
		function Te(l, e) {
			if (l.indexOf(e[1]) === -1) return -1;
			let t = 0;
			for (let n = 0; n < l.length; n++) if (l[n] === "\\") n++;
			else if (l[n] === e[0]) t++;
			else if (l[n] === e[1] && (t--, t < 0)) return n;
			return t > 0 ? -2 : -1;
		}
		function oe(l, e = 0) {
			let t = e, n = "";
			for (let s of l) if (s === "	") {
				let r = 4 - t % 4;
				n += " ".repeat(r), t += r;
			} else n += s, t++;
			return n;
		}
		function Oe(l, e, t, n, s) {
			let r = e.href, o = e.title || null, i = l[1].replace(s.other.outputLinkReplace, "$1"), u = l[0].charAt(0) === "!";
			n.state.inLink = !0;
			let a = n.state.linkEmitted, p = n.state.inRawBlock;
			n.state.linkEmitted = !1;
			let c = n.inlineTokens(i), d = n.state.linkEmitted;
			if (n.state.linkEmitted = a, n.state.inLink = !1, !u) {
				if (d) {
					n.state.inRawBlock = p;
					return;
				}
				n.state.linkEmitted = !0;
			}
			return {
				type: u ? "image" : "link",
				raw: t,
				href: r,
				title: o,
				text: i,
				tokens: c
			};
		}
		function yt(l, e, t) {
			let n = l.match(t.other.indentCodeCompensation);
			if (n === null) return e;
			let s = n[1];
			return e.split(`
`).map((r) => {
				let o = r.match(t.other.beginningSpace);
				if (o === null) return r;
				let [i] = o;
				return r.slice(Math.min(i.length, s.length));
			}).join(`
`);
		}
		function we(l, e, t, n) {
			if (!e.includes("<")) return !1;
			for (let s = 0; s < e.length; s++) {
				if (e[s] === "\\") {
					s++;
					continue;
				}
				if (e[s] === "`") {
					let i = n.inline.code.exec(e.slice(s));
					if (i) {
						s += i[0].length - 1;
						continue;
					}
				}
				if (e[s] !== "<") continue;
				let r = l.slice(t + s), o = n.inline.tag.exec(r) || n.inline.autolink.exec(r);
				if (o) {
					if (o[0].length > e.length - s) return !0;
					s += o[0].length - 1;
				}
			}
			return !1;
		}
		var P = class {
			options;
			rules;
			lexer;
			constructor(e) {
				this.options = e || y;
			}
			space(e) {
				let t = this.rules.block.newline.exec(e);
				if (t && t[0].length > 0) return {
					type: "space",
					raw: t[0]
				};
			}
			code(e) {
				let t = this.rules.block.code.exec(e);
				if (t) {
					let n = this.options.pedantic ? t[0] : ie(t[0]);
					return {
						type: "code",
						raw: n,
						codeBlockStyle: "indented",
						text: n.replace(this.rules.other.codeRemoveIndent, "")
					};
				}
			}
			fences(e) {
				let t = this.rules.block.fences.exec(e);
				if (t) {
					let n = t[0], s = yt(n, t[3] || "", this.rules);
					return {
						type: "code",
						raw: n,
						lang: t[2] ? t[2].trim().replace(this.rules.inline.anyPunctuation, "$1") : t[2],
						text: s
					};
				}
			}
			heading(e) {
				let t = this.rules.block.heading.exec(e);
				if (t) {
					let n = t[2].trim();
					if (this.rules.other.endingHash.test(n)) {
						let s = L(n, "#");
						(this.options.pedantic || !s || this.rules.other.endingSpaceTabChar.test(s)) && (n = s.trim());
					}
					return {
						type: "heading",
						raw: L(t[0], `
`),
						depth: t[1].length,
						text: n,
						tokens: this.lexer.inline(n)
					};
				}
			}
			hr(e) {
				let t = this.rules.block.hr.exec(e);
				if (t) return {
					type: "hr",
					raw: L(t[0], `
`)
				};
			}
			blockquote(e) {
				let t = this.rules.block.blockquote.exec(e);
				if (t) {
					let n = L(t[0], `
`).split(`
`), s = "", r = "", o = [];
					for (; n.length > 0;) {
						let i = !1, u = [], a = 0;
						for (; a < n.length; a++) if (this.rules.other.blockquoteStart.test(n[a])) u.push(n[a]), i = !0;
						else if (!i) u.push(n[a]);
						else break;
						n = n.slice(a);
						let p = u.join(`
`), c = p.replace(this.rules.other.blockquoteSetextReplace, `
    $1`).replace(this.rules.other.blockquoteSetextReplace2, "");
						s = s ? `${s}
${p}` : p, r = r ? `${r}
${c}` : c;
						let d = this.lexer.state.top;
						if (this.lexer.state.top = !0, this.lexer.blockTokens(c, o, !0), this.lexer.state.top = d, n.length === 0) break;
						let m = o.at(-1);
						if (m?.type === "code") break;
						if (m?.type === "blockquote") {
							let b = m, g = n.join(`
`), w = b.raw + `
` + g.replace(this.rules.other.blockquoteSetextReplace2, ""), f = this.blockquote(w);
							o[o.length - 1] = f;
							let M = w.substring(f.raw.length).replace(/^\n/, ""), v = M ? M.split(`
`).length : 0, Z = v ? n.slice(0, -v) : n;
							Z.length > 0 && (s = `${s}
${Z.join(`
`)}`), r = r.substring(0, r.length - b.text.length) + f.text;
							break;
						} else if (m?.type === "list") {
							let b = m, g = b.raw + `
` + n.join(`
`), w = this.list(g);
							o[o.length - 1] = w, s = s.substring(0, s.length - m.raw.length) + w.raw, r = r.substring(0, r.length - b.raw.length) + w.raw, n = g.substring(o.at(-1).raw.length).split(`
`);
							continue;
						}
					}
					return {
						type: "blockquote",
						raw: s,
						tokens: o,
						text: r
					};
				}
			}
			list(e) {
				let t = this.rules.block.list.exec(e);
				if (t) {
					let n = t[1].trim(), s = n.length > 1, r = {
						type: "list",
						raw: "",
						ordered: s,
						start: s ? +n.slice(0, -1) : "",
						loose: !1,
						items: []
					};
					n = s ? `\\d{1,9}\\${n.slice(-1)}` : `\\${n}`, this.options.pedantic && (n = s ? n : "[*+-]");
					let o = this.rules.other.listItemRegex(n), i = !1;
					for (; e;) {
						let a = !1, p = "", c = "";
						if (!(t = o.exec(e)) || this.rules.block.hr.test(e)) break;
						p = t[0], e = e.substring(p.length);
						let d = t[2].split(`
`, 1)[0], m = t[1].length, b = this.options.pedantic ? oe(d, m) : d.replace(this.rules.other.leadingSpaceTab, (M) => oe(M, m)), g = e.split(`
`, 1)[0], w = !b.trim(), f = 0;
						if (this.options.pedantic ? (f = 2, c = b.trimStart()) : w ? f = m + 1 : (f = b.search(this.rules.other.nonSpaceChar), f = f > 4 ? 1 : f, c = b.slice(f), f += m), w && this.rules.other.blankLine.test(g) && (p += g + `
`, e = e.substring(g.length + 1), a = !0), !a) {
							let M = this.rules.other.nextBulletRegex(f), v = this.rules.other.hrRegex(f), Z = this.rules.other.fencesBeginRegex(f), ae = this.rules.other.headingBeginRegex(f), ye = this.rules.other.htmlBeginRegex(f), Pe = this.rules.other.blockquoteBeginRegex(f);
							for (; e;) {
								let K = e.split(`
`, 1)[0], H;
								if (g = K, this.options.pedantic ? (g = g.replace(this.rules.other.listReplaceNesting, "  "), H = g) : H = g.replace(this.rules.other.leadingSpaceTab, (Se) => Se.replace(this.rules.other.tabCharGlobal, "    ")), Z.test(g) || ae.test(g) || ye.test(g) || Pe.test(g) || M.test(g) || v.test(g)) break;
								if (H.search(this.rules.other.nonSpaceChar) >= f || !g.trim()) c += `
` + H.slice(f);
								else {
									if (w || b.replace(this.rules.other.tabCharGlobal, "    ").search(this.rules.other.nonSpaceChar) >= 4 || Z.test(b) || ae.test(b) || v.test(b)) break;
									c += `
` + g;
								}
								w = !g.trim(), p += K + `
`, e = e.substring(K.length + 1), b = H.slice(f);
							}
						}
						r.loose || (i ? r.loose = !0 : this.rules.other.doubleBlankLine.test(p) && (i = !0)), r.items.push({
							type: "list_item",
							raw: p,
							task: !!this.options.gfm && this.rules.other.listIsTask.test(c),
							loose: !1,
							text: c,
							tokens: []
						}), r.raw += p;
					}
					let u = r.items.at(-1);
					if (u) u.raw = u.raw.trimEnd(), u.text = u.text.trimEnd();
					else return;
					r.raw = r.raw.trimEnd();
					for (let a of r.items) if (this.lexer.state.top = !1, a.tokens = this.lexer.blockTokens(a.text, []), !r.loose) {
						let p = a.tokens.filter((d) => d.type === "space");
						r.loose = p.length > 0 && p.some((d) => this.rules.other.anyLine.test(d.raw));
					}
					for (let a of r.items) {
						let p = a.tokens[0];
						if (a.task && (p?.type === "text" || p?.type === "paragraph")) {
							a.text = a.text.replace(this.rules.other.listReplaceTask, ""), p.raw = p.raw.replace(this.rules.other.listReplaceTask, ""), p.text = p.text.replace(this.rules.other.listReplaceTask, "");
							for (let d = this.lexer.inlineQueue.length - 1; d >= 0; d--) if (this.rules.other.listIsTask.test(this.lexer.inlineQueue[d].src)) {
								this.lexer.inlineQueue[d].src = this.lexer.inlineQueue[d].src.replace(this.rules.other.listReplaceTask, "");
								break;
							}
							let c = this.rules.other.listTaskCheckbox.exec(a.raw);
							if (c) {
								let d = {
									type: "checkbox",
									raw: c[0] + " ",
									checked: c[0] !== "[ ]"
								};
								a.checked = d.checked, r.loose ? a.tokens[0] && ["paragraph", "text"].includes(a.tokens[0].type) && "tokens" in a.tokens[0] && a.tokens[0].tokens ? (a.tokens[0].raw = d.raw + a.tokens[0].raw, a.tokens[0].text = d.raw + a.tokens[0].text, a.tokens[0].tokens.unshift(d)) : a.tokens.unshift({
									type: "paragraph",
									raw: d.raw,
									text: d.raw,
									tokens: [d]
								}) : a.tokens.unshift(d);
							}
						} else a.task && (a.task = !1);
					}
					if (r.loose) for (let a of r.items) {
						a.loose = !0;
						for (let p of a.tokens) p.type === "text" && (p.type = "paragraph");
					}
					return r;
				}
			}
			html(e) {
				let t = this.rules.block.html.exec(e);
				if (t) {
					let n = ie(t[0]);
					return {
						type: "html",
						block: !0,
						raw: n,
						pre: t[1] === "pre" || t[1] === "script" || t[1] === "style",
						text: n
					};
				}
			}
			def(e) {
				let t = this.rules.block.def.exec(e);
				if (t) {
					let n = q(t[1]).replace(this.rules.other.multipleSpaceGlobal, " "), s = t[2] ? t[2].replace(this.rules.other.hrefBrackets, "$1").replace(this.rules.inline.anyPunctuation, "$1") : "", r = t[3] ? t[3].substring(1, t[3].length - 1).replace(this.rules.inline.anyPunctuation, "$1") : t[3];
					return {
						type: "def",
						tag: n,
						raw: L(t[0], `
`),
						href: s,
						title: r
					};
				}
			}
			table(e) {
				let t = this.rules.block.table.exec(e);
				if (!t || !this.rules.other.tableDelimiter.test(t[2])) return;
				let n = se(t[1]), s = t[2].replace(this.rules.other.tableAlignChars, "").split("|"), r = t[3]?.trim() ? t[3].replace(this.rules.other.tableRowBlankLine, "").split(`
`) : [], o = {
					type: "table",
					raw: L(t[0], `
`),
					header: [],
					align: [],
					rows: []
				};
				if (n.length === s.length) {
					for (let i of s) this.rules.other.tableAlignRight.test(i) ? o.align.push("right") : this.rules.other.tableAlignCenter.test(i) ? o.align.push("center") : this.rules.other.tableAlignLeft.test(i) ? o.align.push("left") : o.align.push(null);
					for (let i = 0; i < n.length; i++) o.header.push({
						text: n[i],
						tokens: this.lexer.inline(n[i]),
						header: !0,
						align: o.align[i]
					});
					for (let i of r) o.rows.push(se(i, o.header.length).map((u, a) => ({
						text: u,
						tokens: this.lexer.inline(u),
						header: !1,
						align: o.align[a]
					})));
					return o;
				}
			}
			lheading(e) {
				let t = this.rules.block.lheading.exec(e);
				if (t) {
					let n = t[1].trim();
					return {
						type: "heading",
						raw: L(t[0], `
`),
						depth: t[2].charAt(0) === "=" ? 1 : 2,
						text: n,
						tokens: this.lexer.inline(n)
					};
				}
			}
			paragraph(e) {
				let t = this.rules.block.paragraph.exec(e);
				if (t) {
					let n = t[1].charAt(t[1].length - 1) === `
` ? t[1].slice(0, -1) : t[1];
					return {
						type: "paragraph",
						raw: t[0],
						text: n,
						tokens: this.lexer.inline(n)
					};
				}
			}
			text(e) {
				let t = this.rules.block.text.exec(e);
				if (t) return {
					type: "text",
					raw: t[0],
					text: t[0],
					tokens: this.lexer.inline(t[0])
				};
			}
			escape(e) {
				let t = this.rules.inline.escape.exec(e);
				if (t) return {
					type: "escape",
					raw: t[0],
					text: t[1]
				};
			}
			tag(e) {
				let t = this.rules.inline.tag.exec(e);
				if (t) return !this.lexer.state.inLink && this.rules.other.startATag.test(t[0]) ? this.lexer.state.inLink = !0 : this.lexer.state.inLink && this.rules.other.endATag.test(t[0]) && (this.lexer.state.inLink = !1), !this.lexer.state.inRawBlock && this.rules.other.startPreScriptTag.test(t[0]) ? this.lexer.state.inRawBlock = !0 : this.lexer.state.inRawBlock && this.rules.other.endPreScriptTag.test(t[0]) && (this.lexer.state.inRawBlock = !1), {
					type: "html",
					raw: t[0],
					inLink: this.lexer.state.inLink,
					inRawBlock: this.lexer.state.inRawBlock,
					block: !1,
					text: t[0]
				};
			}
			link(e) {
				let t = this.rules.inline.link.exec(e);
				if (t) {
					let n = t[0].charAt(0) === "!" ? 2 : 1;
					if (!this.options.pedantic && we(e, t[1], n, this.rules)) return;
					let s = t[2].trim();
					if (!this.options.pedantic && this.rules.other.startAngleBracket.test(s)) {
						if (!this.rules.other.endAngleBracket.test(s)) return;
						let i = L(s.slice(0, -1), "\\");
						if ((s.length - i.length) % 2 === 0) return;
					} else {
						let i = Te(t[2], "()");
						if (i === -2) return;
						if (i > -1) {
							let a = (t[0].indexOf("!") === 0 ? 5 : 4) + t[1].length + i;
							t[2] = t[2].substring(0, i), t[0] = t[0].substring(0, a).trim(), t[3] = "";
						}
					}
					let r = t[2], o = "";
					if (this.options.pedantic) {
						let i = this.rules.other.pedanticHrefTitle.exec(r);
						i && (r = i[1], o = i[3]);
					} else o = t[3] ? t[3].slice(1, -1) : "";
					return r = r.trim(), this.rules.other.startAngleBracket.test(r) && (this.options.pedantic && !this.rules.other.endAngleBracket.test(s) ? r = r.slice(1) : r = r.slice(1, -1)), Oe(t, {
						href: r && r.replace(this.rules.inline.anyPunctuation, "$1"),
						title: o && o.replace(this.rules.inline.anyPunctuation, "$1")
					}, t[0], this.lexer, this.rules);
				}
			}
			reflink(e, t) {
				let n;
				if ((n = this.rules.inline.reflink.exec(e)) || (n = this.rules.inline.nolink.exec(e))) {
					let s = n[0].charAt(0) === "!" ? 2 : 1;
					if (!this.options.pedantic && we(e, n[1], s, this.rules)) return;
					let o = t[q((n[2] || n[1]).replace(this.rules.other.multipleSpaceGlobal, " "))];
					if (!o) {
						let i = n[0].charAt(0);
						return {
							type: "text",
							raw: i,
							text: i
						};
					}
					return Oe(n, o, n[0], this.lexer, this.rules);
				}
			}
			emStrong(e, t, n = "") {
				let s = this.rules.inline.emStrongLDelim.exec(e);
				if (!s || !s[1] && !s[2] && !s[3] && !s[4] || s[4] && n.match(this.rules.other.unicodeAlphaNumeric)) return;
				if (!(s[1] || s[3] || "") || !n || this.rules.inline.punctuation.exec(n)) {
					let o = [...s[0]].length - 1, i, u, a = o, p = 0, c = s[0][0], d = n === c, m = c === "*" ? this.rules.inline.emStrongRDelimAst : this.rules.inline.emStrongRDelimUnd;
					for (m.lastIndex = 0, t = t.slice(-1 * e.length + o); (s = m.exec(t)) !== null;) {
						if (i = s[1] || s[2] || s[3] || s[4] || s[5] || s[6], !i) continue;
						if (u = [...i].length, s[3] || s[4]) {
							a += u;
							continue;
						} else if (s[5] || s[6]) {
							if (o % 3 && !((o + u) % 3)) {
								p += u;
								continue;
							}
							if (d) break;
						}
						if (a -= u, a > 0) continue;
						u = Math.min(u, u + a + p);
						let b = [...s[0]][0].length, g = e.slice(0, o + s.index + b + u);
						if (Math.min(o, u) % 2) {
							let f = g.slice(1, -1);
							return {
								type: "em",
								raw: g,
								text: f,
								tokens: this.lexer.inlineTokens(f)
							};
						}
						let w = g.slice(2, -2);
						return {
							type: "strong",
							raw: g,
							text: w,
							tokens: this.lexer.inlineTokens(w)
						};
					}
				}
			}
			codespan(e) {
				let t = this.rules.inline.code.exec(e);
				if (t) {
					let n = t[2].replace(this.rules.other.newLineCharGlobal, " "), s = this.rules.other.nonSpaceChar.test(n), r = this.rules.other.startingSpaceChar.test(n) && this.rules.other.endingSpaceChar.test(n);
					return s && r && (n = n.substring(1, n.length - 1)), {
						type: "codespan",
						raw: t[0],
						text: n
					};
				}
			}
			br(e) {
				let t = this.rules.inline.br.exec(e);
				if (t) return {
					type: "br",
					raw: t[0]
				};
			}
			del(e, t, n = "") {
				let s = this.rules.inline.delLDelim.exec(e);
				if (!s) return;
				if (!(s[1] || "") || !n || this.rules.inline.punctuation.exec(n)) {
					let o = [...s[0]].length - 1, i, u, a = o, p = this.rules.inline.delRDelim;
					for (p.lastIndex = 0, t = t.slice(-1 * e.length + o); (s = p.exec(t)) !== null;) {
						if (i = s[1] || s[2] || s[3] || s[4] || s[5] || s[6], !i || (u = [...i].length, u !== o)) continue;
						if (s[3] || s[4]) {
							a += u;
							continue;
						}
						if (a -= u, a > 0) continue;
						u = Math.min(u, u + a);
						let c = [...s[0]][0].length, d = e.slice(0, o + s.index + c + u), m = d.slice(o, -o);
						return {
							type: "del",
							raw: d,
							text: m,
							tokens: this.lexer.inlineTokens(m)
						};
					}
				}
			}
			autolink(e) {
				let t = this.rules.inline.autolink.exec(e);
				if (t) {
					let n, s;
					return t[2] === "@" ? (n = t[1], s = "mailto:" + n) : (n = t[1], s = n), {
						type: "link",
						raw: t[0],
						text: n,
						href: s,
						autolink: !0,
						tokens: [{
							type: "text",
							raw: n,
							text: n
						}]
					};
				}
			}
			url(e) {
				let t;
				if (t = this.rules.inline.url.exec(e)) {
					let n, s;
					if (t[2] === "@") n = t[0], s = "mailto:" + n;
					else {
						let r;
						do
							r = t[0], t[0] = this.rules.inline._backpedal.exec(t[0])?.[0] ?? "";
						while (r !== t[0]);
						n = t[0], t[1] === "www." ? s = "http://" + t[0] : s = t[0];
					}
					return {
						type: "link",
						raw: t[0],
						text: n,
						href: s,
						autolink: !0,
						tokens: [{
							type: "text",
							raw: n,
							text: n
						}]
					};
				}
			}
			inlineText(e) {
				let t = this.rules.inline.text.exec(e);
				if (t) {
					let n = this.lexer.state.inRawBlock;
					return {
						type: "text",
						raw: t[0],
						text: n ? t[0] : Re(t[0]),
						escaped: n
					};
				}
			}
		};
		var R = class l {
			tokens;
			options;
			state;
			inlineQueue;
			tokenizer;
			constructor(e) {
				this.tokens = [], this.tokens.links = Object.create(null), this.options = e || y, this.options.tokenizer = this.options.tokenizer || new P(), this.tokenizer = this.options.tokenizer, this.tokenizer.options = this.options, this.tokenizer.lexer = this, this.inlineQueue = [], this.state = {
					inLink: !1,
					inRawBlock: !1,
					linkEmitted: !1,
					top: !0
				};
				let t = {
					other: x,
					block: j.normal,
					inline: D.normal
				};
				this.options.pedantic ? (t.block = j.pedantic, t.inline = D.pedantic) : this.options.gfm && (t.block = j.gfm, this.options.breaks ? t.inline = D.breaks : t.inline = D.gfm), this.tokenizer.rules = t;
			}
			static get rules() {
				return {
					block: j,
					inline: D
				};
			}
			static lex(e, t) {
				return new l(t).lex(e);
			}
			static lexInline(e, t) {
				return new l(t).inlineTokens(e);
			}
			lex(e) {
				e = e.replace(x.carriageReturn, `
`), this.blockTokens(e, this.tokens);
				for (let t = 0; t < this.inlineQueue.length; t++) {
					let n = this.inlineQueue[t];
					this.inlineTokens(n.src, n.tokens);
				}
				return this.inlineQueue = [], this.tokens;
			}
			blockTokens(e, t = [], n = !1) {
				this.tokenizer.lexer = this, this.options.pedantic && (e = e.replace(x.tabCharGlobal, "    ").replace(x.spaceLine, ""));
				let s = 1 / 0;
				for (; e;) {
					if (e.length < s) s = e.length;
					else {
						this.infiniteLoopError(e.charCodeAt(0));
						break;
					}
					let r;
					if (this.options.extensions?.block?.some((i) => (r = i.call({ lexer: this }, e, t)) ? (e = e.substring(r.raw.length), t.push(r), !0) : !1)) continue;
					if (r = this.tokenizer.space(e)) {
						e = e.substring(r.raw.length);
						let i = t.at(-1);
						r.raw.length === 1 && i !== void 0 ? i.raw += `
` : t.push(r);
						continue;
					}
					if (r = this.tokenizer.code(e)) {
						e = e.substring(r.raw.length);
						let i = t.at(-1);
						i?.type === "paragraph" || i?.type === "text" ? (i.raw += (i.raw.endsWith(`
`) ? "" : `
`) + r.raw, i.text += `
` + r.text, this.inlineQueue.at(-1).src = i.text) : t.push(r);
						continue;
					}
					if (r = this.tokenizer.fences(e)) {
						e = e.substring(r.raw.length), t.push(r);
						continue;
					}
					if (r = this.tokenizer.heading(e)) {
						e = e.substring(r.raw.length), t.push(r);
						continue;
					}
					if (r = this.tokenizer.hr(e)) {
						e = e.substring(r.raw.length), t.push(r);
						continue;
					}
					if (r = this.tokenizer.blockquote(e)) {
						e = e.substring(r.raw.length), t.push(r);
						continue;
					}
					if (r = this.tokenizer.list(e)) {
						e = e.substring(r.raw.length), t.push(r);
						continue;
					}
					if (r = this.tokenizer.html(e)) {
						e = e.substring(r.raw.length), t.push(r);
						continue;
					}
					if (r = this.tokenizer.def(e)) {
						e = e.substring(r.raw.length);
						let i = t.at(-1);
						i?.type === "paragraph" || i?.type === "text" ? (i.raw += (i.raw.endsWith(`
`) ? "" : `
`) + r.raw, i.text += `
` + r.raw, this.inlineQueue.at(-1).src = i.text) : this.tokens.links[r.tag] || (this.tokens.links[r.tag] = {
							href: r.href,
							title: r.title
						}, t.push(r));
						continue;
					}
					if (r = this.tokenizer.table(e)) {
						e = e.substring(r.raw.length), t.push(r);
						continue;
					}
					if (r = this.tokenizer.lheading(e)) {
						e = e.substring(r.raw.length), t.push(r);
						continue;
					}
					let o = e;
					if (this.options.extensions?.startBlock) {
						let i = 1 / 0, u = e.slice(1), a;
						this.options.extensions.startBlock.forEach((p) => {
							a = p.call({ lexer: this }, u), typeof a == "number" && a >= 0 && (i = Math.min(i, a));
						}), i < 1 / 0 && i >= 0 && (o = e.substring(0, i + 1));
					}
					if (this.state.top && (r = this.tokenizer.paragraph(o))) {
						let i = t.at(-1);
						n && i?.type === "paragraph" ? (i.raw += (i.raw.endsWith(`
`) ? "" : `
`) + r.raw, i.text += `
` + r.text, this.inlineQueue.pop(), this.inlineQueue.at(-1).src = i.text) : t.push(r), n = o.length !== e.length, e = e.substring(r.raw.length);
						continue;
					}
					if (r = this.tokenizer.text(e)) {
						e = e.substring(r.raw.length);
						let i = t.at(-1);
						i?.type === "text" ? (i.raw += (i.raw.endsWith(`
`) ? "" : `
`) + r.raw, i.text += `
` + r.text, this.inlineQueue.pop(), this.inlineQueue.at(-1).src = i.text) : t.push(r);
						continue;
					}
					if (e) {
						this.infiniteLoopError(e.charCodeAt(0));
						break;
					}
				}
				return this.state.top = !0, t;
			}
			inline(e, t = []) {
				return this.inlineQueue.push({
					src: e,
					tokens: t
				}), t;
			}
			linkInText(e) {
				if (!e.includes("[")) return !1;
				let t = this.tokenizer.rules.inline.link;
				for (let n of e.matchAll(this.tokenizer.rules.inline.blockSkip)) if (t.test(n[0]) && e.charAt(n.index - 1) !== "!") return !0;
				for (let n of e.matchAll(this.tokenizer.rules.inline.reflinkSearch)) {
					let s = n[0], r = s.lastIndexOf("[");
					if (!(s.charAt(0) === "!" || !Object.hasOwn(this.tokens.links, q(s.slice(r + 1, -1)))) && !(r > 1 && this.linkInText(s.slice(1, r - 1)))) return !0;
				}
				return !1;
			}
			inlineTokens(e, t = []) {
				this.tokenizer.lexer = this;
				let n = e;
				if (this.tokens.links && e.includes("[")) {
					let i = this.tokenizer.rules.inline.reflinkSearch, u = (a) => {
						let p = a.lastIndexOf("[");
						if (!Object.hasOwn(this.tokens.links, q(a.slice(p + 1, -1)))) return a;
						if (p > 1 && a.charAt(0) !== "!") {
							let c = a.slice(1, p - 1);
							if (this.linkInText(c)) return "[" + c.replace(i, u) + "][" + "a".repeat(a.length - p - 2) + "]";
						}
						return "[" + "a".repeat(a.length - 2) + "]";
					};
					n = n.replace(i, u);
				}
				n = n.replace(this.tokenizer.rules.inline.anyPunctuation, (i) => "+".repeat(i.length)), n = n.replace(this.tokenizer.rules.inline.blockSkip, (i, u, a) => {
					let p = a ? a.length : 0;
					return i.slice(0, p) + "[" + "a".repeat(i.length - p - 2) + "]";
				}), n = this.options.hooks?.emStrongMask?.call({ lexer: this }, n) ?? n;
				let s = !1, r = "", o = 1 / 0;
				for (; e;) {
					if (e.length < o) o = e.length;
					else {
						this.infiniteLoopError(e.charCodeAt(0));
						break;
					}
					s || (r = ""), s = !1;
					let i;
					if (this.options.extensions?.inline?.some((a) => (i = a.call({ lexer: this }, e, t)) ? (e = e.substring(i.raw.length), t.push(i), !0) : !1)) continue;
					if (i = this.tokenizer.escape(e)) {
						e = e.substring(i.raw.length), t.push(i);
						continue;
					}
					if (i = this.tokenizer.tag(e)) {
						e = e.substring(i.raw.length), t.push(i);
						continue;
					}
					if (i = this.tokenizer.link(e)) {
						e = e.substring(i.raw.length), t.push(i);
						continue;
					}
					if (i = this.tokenizer.reflink(e, this.tokens.links)) {
						e = e.substring(i.raw.length);
						let a = t.at(-1);
						i.type === "text" && a?.type === "text" ? (a.raw += i.raw, a.text += i.text) : t.push(i);
						continue;
					}
					if (i = this.tokenizer.emStrong(e, n, r)) {
						e = e.substring(i.raw.length), t.push(i);
						continue;
					}
					if (i = this.tokenizer.codespan(e)) {
						e = e.substring(i.raw.length), t.push(i);
						continue;
					}
					if (i = this.tokenizer.br(e)) {
						e = e.substring(i.raw.length), t.push(i);
						continue;
					}
					if (i = this.tokenizer.del(e, n, r)) {
						e = e.substring(i.raw.length), t.push(i);
						continue;
					}
					if (i = this.tokenizer.autolink(e)) {
						e = e.substring(i.raw.length), t.push(i);
						continue;
					}
					if (!this.state.inLink && (i = this.tokenizer.url(e))) {
						e = e.substring(i.raw.length), t.push(i);
						continue;
					}
					let u = e;
					if (this.options.extensions?.startInline) {
						let a = 1 / 0, p = e.slice(1), c;
						this.options.extensions.startInline.forEach((d) => {
							c = d.call({ lexer: this }, p), typeof c == "number" && c >= 0 && (a = Math.min(a, c));
						}), a < 1 / 0 && a >= 0 && (u = e.substring(0, a + 1));
					}
					if (i = this.tokenizer.inlineText(u)) {
						e = e.substring(i.raw.length), i.raw.slice(-1) !== "_" && (r = i.raw.slice(-1)), s = !0;
						let a = t.at(-1);
						a?.type === "text" ? (a.raw += i.raw, a.text += i.text) : t.push(i);
						continue;
					}
					if (e) {
						this.infiniteLoopError(e.charCodeAt(0));
						break;
					}
				}
				return t;
			}
			infiniteLoopError(e) {
				let t = "Infinite loop on byte: " + e;
				if (this.options.silent) console.error(t);
				else throw new Error(t);
			}
		};
		var S = class {
			options;
			parser;
			constructor(e) {
				this.options = e || y;
			}
			space(e) {
				return "";
			}
			code({ text: e, lang: t, escaped: n }) {
				let s = (t || "").match(x.notSpaceStart)?.[0], r = e ? e.replace(x.endingNewline, "") + `
` : "";
				return s ? "<pre><code class=\"language-" + O(s) + "\">" + (n ? r : O(r, !0)) + `</code></pre>
` : "<pre><code>" + (n ? r : O(r, !0)) + `</code></pre>
`;
			}
			blockquote({ tokens: e }) {
				return `<blockquote>
${this.parser.parse(e)}</blockquote>
`;
			}
			html({ text: e }) {
				return e;
			}
			def(e) {
				return "";
			}
			heading({ tokens: e, depth: t }) {
				return `<h${t}>${this.parser.parseInline(e)}</h${t}>
`;
			}
			hr(e) {
				return `<hr>
`;
			}
			list(e) {
				let t = e.ordered, n = e.start, s = "";
				for (let i = 0; i < e.items.length; i++) {
					let u = e.items[i];
					s += this.listitem(u);
				}
				let r = t ? "ol" : "ul", o = t && n !== 1 ? " start=\"" + n + "\"" : "";
				return "<" + r + o + `>
` + s + "</" + r + `>
`;
			}
			listitem(e) {
				return `<li>${this.parser.parse(e.tokens)}</li>
`;
			}
			checkbox({ checked: e }) {
				return "<input " + (e ? "checked=\"\" " : "") + "disabled=\"\" type=\"checkbox\"> ";
			}
			paragraph({ tokens: e }) {
				return `<p>${this.parser.parseInline(e)}</p>
`;
			}
			table(e) {
				let t = "", n = "";
				for (let r = 0; r < e.header.length; r++) n += this.tablecell(e.header[r]);
				t += this.tablerow({ text: n });
				let s = "";
				for (let r = 0; r < e.rows.length; r++) {
					let o = e.rows[r];
					n = "";
					for (let i = 0; i < o.length; i++) n += this.tablecell(o[i]);
					s += this.tablerow({ text: n });
				}
				return s && (s = `<tbody>${s}</tbody>`), `<table>
<thead>
` + t + `</thead>
` + s + `</table>
`;
			}
			tablerow({ text: e }) {
				return `<tr>
${e}</tr>
`;
			}
			tablecell(e) {
				let t = this.parser.parseInline(e.tokens), n = e.header ? "th" : "td";
				return (e.align ? `<${n} align="${e.align}">` : `<${n}>`) + t + `</${n}>
`;
			}
			strong({ tokens: e }) {
				return `<strong>${this.parser.parseInline(e)}</strong>`;
			}
			em({ tokens: e }) {
				return `<em>${this.parser.parseInline(e)}</em>`;
			}
			codespan({ text: e }) {
				return `<code>${O(e, !0)}</code>`;
			}
			br(e) {
				return "<br>";
			}
			del({ tokens: e }) {
				return `<del>${this.parser.parseInline(e)}</del>`;
			}
			link({ href: e, title: t, text: n, tokens: s, autolink: r }) {
				let o = r ? O(n, !0) : this.parser.parseInline(s), i = re(e);
				if (i === null) return o;
				e = O(i, r);
				let u = "<a href=\"" + e + "\"";
				return t && (u += " title=\"" + O(t) + "\""), u += ">" + o + "</a>", u;
			}
			image({ href: e, title: t, text: n, tokens: s }) {
				s && (n = this.parser.parseInline(s, this.parser.textRenderer));
				let r = re(e);
				if (r === null) return O(n);
				e = r;
				let o = `<img src="${O(e)}" alt="${O(n)}"`;
				return t && (o += ` title="${O(t)}"`), o += ">", o;
			}
			text(e) {
				return "tokens" in e && e.tokens ? this.parser.parseInline(e.tokens) : "escaped" in e && e.escaped ? e.text : O(e.text);
			}
		};
		var z = class {
			strong({ text: e }) {
				return e;
			}
			em({ text: e }) {
				return e;
			}
			codespan({ text: e }) {
				return e;
			}
			del({ text: e }) {
				return e;
			}
			html({ text: e }) {
				return e;
			}
			text({ text: e }) {
				return e;
			}
			link({ text: e }) {
				return "" + e;
			}
			image({ text: e }) {
				return "" + e;
			}
			br() {
				return "";
			}
			checkbox({ raw: e }) {
				return e;
			}
		};
		var T = class l {
			options;
			renderer;
			textRenderer;
			constructor(e) {
				this.options = e || y, this.options.renderer = this.options.renderer || new S(), this.renderer = this.options.renderer, this.renderer.options = this.options, this.renderer.parser = this, this.textRenderer = new z();
			}
			static parse(e, t) {
				return new l(t).parse(e);
			}
			static parseInline(e, t) {
				return new l(t).parseInline(e);
			}
			parse(e) {
				this.renderer.parser = this;
				let t = "";
				for (let n = 0; n < e.length; n++) {
					let s = e[n];
					if (this.options.extensions?.renderers?.[s.type]) {
						let o = s, i = this.options.extensions.renderers[o.type].call({ parser: this }, o);
						if (i !== !1 || ![
							"space",
							"hr",
							"heading",
							"code",
							"table",
							"blockquote",
							"list",
							"checkbox",
							"html",
							"def",
							"paragraph",
							"text"
						].includes(o.type)) {
							t += i || "";
							continue;
						}
					}
					let r = s;
					switch (r.type) {
						case "space":
							t += this.renderer.space(r);
							break;
						case "hr":
							t += this.renderer.hr(r);
							break;
						case "heading":
							t += this.renderer.heading(r);
							break;
						case "code":
							t += this.renderer.code(r);
							break;
						case "table":
							t += this.renderer.table(r);
							break;
						case "blockquote":
							t += this.renderer.blockquote(r);
							break;
						case "list":
							t += this.renderer.list(r);
							break;
						case "checkbox":
							t += this.renderer.checkbox(r);
							break;
						case "html":
							t += this.renderer.html(r);
							break;
						case "def":
							t += this.renderer.def(r);
							break;
						case "paragraph":
							t += this.renderer.paragraph(r);
							break;
						case "text":
							t += this.renderer.text(r);
							break;
						default: {
							let o = "Token with \"" + r.type + "\" type was not found.";
							if (this.options.silent) return console.error(o), "";
							throw new Error(o);
						}
					}
				}
				return t;
			}
			parseInline(e, t = this.renderer) {
				this.renderer.parser = this;
				let n = "";
				for (let s = 0; s < e.length; s++) {
					let r = e[s];
					if (this.options.extensions?.renderers?.[r.type]) {
						let i = this.options.extensions.renderers[r.type].call({ parser: this }, r);
						if (i !== !1 || ![
							"escape",
							"html",
							"link",
							"image",
							"checkbox",
							"strong",
							"em",
							"codespan",
							"br",
							"del",
							"text"
						].includes(r.type)) {
							n += i || "";
							continue;
						}
					}
					let o = r;
					switch (o.type) {
						case "escape":
							n += t.text(o);
							break;
						case "html":
							n += t.html(o);
							break;
						case "link":
							n += t.link(o);
							break;
						case "image":
							n += t.image(o);
							break;
						case "checkbox":
							n += t.checkbox(o);
							break;
						case "strong":
							n += t.strong(o);
							break;
						case "em":
							n += t.em(o);
							break;
						case "codespan":
							n += t.codespan(o);
							break;
						case "br":
							n += t.br(o);
							break;
						case "del":
							n += t.del(o);
							break;
						case "text":
							n += t.text(o);
							break;
						default: {
							let i = "Token with \"" + o.type + "\" type was not found.";
							if (this.options.silent) return console.error(i), "";
							throw new Error(i);
						}
					}
				}
				return n;
			}
		};
		var _ = class {
			options;
			block;
			constructor(e) {
				this.options = e || y;
			}
			static passThroughHooks = /* @__PURE__ */ new Set([
				"preprocess",
				"postprocess",
				"processAllTokens",
				"emStrongMask"
			]);
			static passThroughHooksRespectAsync = /* @__PURE__ */ new Set([
				"preprocess",
				"postprocess",
				"processAllTokens"
			]);
			preprocess(e) {
				return e;
			}
			postprocess(e) {
				return e;
			}
			processAllTokens(e) {
				return e;
			}
			emStrongMask(e) {
				return e;
			}
			provideLexer(e = this.block) {
				return e ? R.lex : R.lexInline;
			}
			provideParser(e = this.block) {
				return e ? T.parse : T.parseInline;
			}
		};
		var F = class {
			defaults = I();
			options = this.setOptions;
			parse = this.parseMarkdown(!0);
			parseInline = this.parseMarkdown(!1);
			Parser = T;
			Renderer = S;
			TextRenderer = z;
			Lexer = R;
			Tokenizer = P;
			Hooks = _;
			constructor(...e) {
				this.use(...e);
			}
			walkTokens(e, t) {
				let n = [];
				for (let s of e) switch (n = n.concat(t.call(this, s)), s.type) {
					case "table": {
						let r = s;
						for (let o of r.header) n = n.concat(this.walkTokens(o.tokens, t));
						for (let o of r.rows) for (let i of o) n = n.concat(this.walkTokens(i.tokens, t));
						break;
					}
					case "list": {
						let r = s;
						n = n.concat(this.walkTokens(r.items, t));
						break;
					}
					default: {
						let r = s;
						this.defaults.extensions?.childTokens?.[r.type] ? this.defaults.extensions.childTokens[r.type].forEach((o) => {
							let i = r[o].flat(1 / 0);
							n = n.concat(this.walkTokens(i, t));
						}) : r.tokens && (n = n.concat(this.walkTokens(r.tokens, t)));
					}
				}
				return n;
			}
			use(...e) {
				let t = this.defaults.extensions || {
					renderers: {},
					childTokens: {}
				};
				return e.forEach((n) => {
					let s = { ...n };
					if (s.async = this.defaults.async || s.async || !1, n.extensions && (n.extensions.forEach((r) => {
						if (!r.name) throw new Error("extension name required");
						if ("renderer" in r) {
							let o = t.renderers[r.name];
							o ? t.renderers[r.name] = function(...i) {
								let u = r.renderer.apply(this, i);
								return u === !1 && (u = o.apply(this, i)), u;
							} : t.renderers[r.name] = r.renderer;
						}
						if ("tokenizer" in r) {
							if (!r.level || r.level !== "block" && r.level !== "inline") throw new Error("extension level must be 'block' or 'inline'");
							let o = t[r.level];
							o ? o.unshift(r.tokenizer) : t[r.level] = [r.tokenizer], r.start && (r.level === "block" ? t.startBlock ? t.startBlock.push(r.start) : t.startBlock = [r.start] : r.level === "inline" && (t.startInline ? t.startInline.push(r.start) : t.startInline = [r.start]));
						}
						"childTokens" in r && r.childTokens && (t.childTokens[r.name] = r.childTokens);
					}), s.extensions = t), n.renderer) {
						let r = this.defaults.renderer || new S(this.defaults);
						for (let o in n.renderer) {
							if (!(o in r)) throw new Error(`renderer '${o}' does not exist`);
							if (["options", "parser"].includes(o)) continue;
							let i = o, u = n.renderer[i], a = r[i];
							r[i] = (...p) => {
								let c = u.apply(r, p);
								return c === !1 && (c = a.apply(r, p)), c || "";
							};
						}
						s.renderer = r;
					}
					if (n.tokenizer) {
						let r = this.defaults.tokenizer || new P(this.defaults);
						for (let o in n.tokenizer) {
							if (!(o in r)) throw new Error(`tokenizer '${o}' does not exist`);
							if ([
								"options",
								"rules",
								"lexer"
							].includes(o)) continue;
							let i = o, u = n.tokenizer[i], a = r[i];
							r[i] = (...p) => {
								let c = u.apply(r, p);
								return c === !1 && (c = a.apply(r, p)), c;
							};
						}
						s.tokenizer = r;
					}
					if (n.hooks) {
						let r = this.defaults.hooks || new _();
						for (let o in n.hooks) {
							if (!(o in r)) throw new Error(`hook '${o}' does not exist`);
							if (["options", "block"].includes(o)) continue;
							let i = o, u = n.hooks[i], a = r[i];
							_.passThroughHooks.has(o) ? r[i] = (p) => {
								if (this.defaults.async && _.passThroughHooksRespectAsync.has(o)) return (async () => {
									let d = await u.call(r, p);
									return a.call(r, d);
								})();
								let c = u.call(r, p);
								return a.call(r, c);
							} : r[i] = (...p) => {
								if (this.defaults.async) return (async () => {
									let d = await u.apply(r, p);
									return d === !1 && (d = await a.apply(r, p)), d;
								})();
								let c = u.apply(r, p);
								return c === !1 && (c = a.apply(r, p)), c;
							};
						}
						s.hooks = r;
					}
					if (n.walkTokens) {
						let r = this.defaults.walkTokens, o = n.walkTokens;
						s.walkTokens = function(i) {
							let u = [];
							return u.push(o.call(this, i)), r && (u = u.concat(r.call(this, i))), u;
						};
					}
					this.defaults = {
						...this.defaults,
						...s
					};
				}), this;
			}
			setOptions(e) {
				return this.defaults = {
					...this.defaults,
					...e
				}, this;
			}
			lexer(e, t) {
				return R.lex(e, t ?? this.defaults);
			}
			parser(e, t) {
				return T.parse(e, t ?? this.defaults);
			}
			parseMarkdown(e) {
				return (n, s) => {
					let r = { ...s }, o = {
						...this.defaults,
						...r
					}, i = this.onError(!!o.silent, !!o.async);
					if (this.defaults.async === !0 && r.async === !1) return i(/* @__PURE__ */ new Error("marked(): The async option was set to true by an extension. Remove async: false from the parse options object to return a Promise."));
					if (typeof n > "u" || n === null) return i(/* @__PURE__ */ new Error("marked(): input parameter is undefined or null"));
					if (typeof n != "string") return i(/* @__PURE__ */ new Error("marked(): input parameter is of type " + Object.prototype.toString.call(n) + ", string expected"));
					if (o.hooks && (o.hooks.options = o, o.hooks.block = e), o.async) return (async () => {
						let u = o.hooks ? await o.hooks.preprocess(n) : n, p = await (o.hooks ? await o.hooks.provideLexer(e) : e ? R.lex : R.lexInline)(u, o), c = o.hooks ? await o.hooks.processAllTokens(p) : p;
						o.walkTokens && await Promise.all(this.walkTokens(c, o.walkTokens));
						let m = await (o.hooks ? await o.hooks.provideParser(e) : e ? T.parse : T.parseInline)(c, o);
						return o.hooks ? await o.hooks.postprocess(m) : m;
					})().catch(i);
					try {
						o.hooks && (n = o.hooks.preprocess(n));
						let a = (o.hooks ? o.hooks.provideLexer(e) : e ? R.lex : R.lexInline)(n, o);
						o.hooks && (a = o.hooks.processAllTokens(a)), o.walkTokens && this.walkTokens(a, o.walkTokens);
						let c = (o.hooks ? o.hooks.provideParser(e) : e ? T.parse : T.parseInline)(a, o);
						return o.hooks && (c = o.hooks.postprocess(c)), c;
					} catch (u) {
						return i(u);
					}
				};
			}
			onError(e, t) {
				return (n) => {
					if (n.message += `
Please report this to https://github.com/markedjs/marked.`, e) {
						let s = "<p>An error occurred:</p><pre>" + O(n.message + "", !0) + "</pre>";
						return t ? Promise.resolve(s) : s;
					}
					if (t) return Promise.reject(n);
					throw n;
				};
			}
		};
		var E = new F();
		function k(l, e) {
			return E.parse(l, e);
		}
		k.options = k.setOptions = function(l) {
			return E.setOptions(l), k.defaults = E.defaults, W(k.defaults), k;
		};
		k.getDefaults = I;
		k.defaults = y;
		function Pt(...l) {
			return E.use(...l), k.defaults = E.defaults, W(k.defaults), k;
		}
		k.use = Pt;
		k.walkTokens = function(l, e) {
			return E.walkTokens(l, e);
		};
		k.parseInline = E.parseInline;
		k.Parser = T;
		k.parser = T.parse;
		k.Renderer = S;
		k.TextRenderer = z;
		k.Lexer = R;
		k.lexer = R.lex;
		k.Tokenizer = P;
		k.Hooks = _;
		k.parse = k;
		k.options;
		k.setOptions;
		k.walkTokens;
		k.parseInline;
		T.parse;
		R.lex;
		//#endregion
		//#region src/client/markdown.ts
		const md = new F({
			gfm: true,
			breaks: true
		});
		/**
		* markdown 文本 → HTML 字符串（同步）。渲染失败 / 空输入一律返回 ''，调用方回退到纯文本。
		* @param text - markdown 原文。
		*/
		function renderMarkdown(text) {
			if (text.trim() === "") return "";
			try {
				const html = md.parse(text);
				return typeof html === "string" ? html : "";
			} catch {
				return "";
			}
		}
		//#endregion
		//#region src/client/session-view.ts
		/** 打开只读视图：物化 binding → 探测拉尾页 → 建 chat target。会话不可解析时返回 null。 */
		function openSessionView(sessions, uiConversation, id) {
			const log = (level, msg, extra) => {
				if (level === "warn") console.warn(`[task-dispatch:session-view] ${msg}`, extra ?? "");
				else console.info(`[task-dispatch:session-view] ${msg}`);
			};
			let binding;
			try {
				const S0 = sessions;
				const retainFn = S0.retain;
				if (typeof retainFn === "function") try {
					const r = retainFn.call(S0, id);
					log("info", `sessions.retain(${id}) 已调用；返回=${r === void 0 ? "undefined" : typeof r}`);
				} catch (err) {
					log("warn", `sessions.retain(${id}) 抛错`, err);
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
					return null;
				}
				binding = found;
			} catch (err) {
				log("warn", `openSessionView 返回 null：sessions.binding(${id}) 抛错`, err);
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
		/** markdown 富文本块：marked 渲染 HTML，套 `.dsh-tdt-sv-md`（样式见 archive-session-css）。 */
		function Md(props) {
			const html = renderMarkdown(props.text);
			if (html === "") return (0, react.createElement)("span", null);
			return (0, react.createElement)("div", {
				className: "dsh-tdt-sv-md",
				dangerouslySetInnerHTML: { __html: html }
			});
		}
		/** 内联关闭图标（currentColor 跟随主题，与主面板同款画法）。 */
		function CloseIcon() {
			return (0, react.createElement)("svg", {
				width: 15,
				height: 15,
				viewBox: "0 0 24 24",
				fill: "none",
				stroke: "currentColor",
				strokeWidth: 2,
				strokeLinecap: "round"
			}, (0, react.createElement)("path", { d: "M6 6l12 12M18 6L6 18" }));
		}
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
		/**
		* 工具卡（工具调用 / 工具结果共形）：名称 + 「参数」「输出」可展开。
		* 调用方负责在外层数组里给 key。
		*/
		function ToolCard(props) {
			const { name, argsRaw, output, isError, errorName, t } = props;
			return (0, react.createElement)("div", { className: "dsh-tdt-sv-tool" }, (0, react.createElement)("div", { className: "dsh-tdt-sv-tool-head" }, (0, react.createElement)("span", { className: "dsh-tdt-sv-tool-name" }, `⚙ ${name}`), isError ? (0, react.createElement)("span", { className: "dsh-tdt-sv-tool-err" }, `✕ ${errorName ?? "error"}`) : null), argsRaw.trim() !== "" ? (0, react.createElement)("details", null, (0, react.createElement)("summary", null, t("sessionArgs")), (0, react.createElement)("pre", null, argsRaw)) : null, output.trim() !== "" ? (0, react.createElement)("details", { open: isError }, (0, react.createElement)("summary", null, t("sessionOutput")), (0, react.createElement)("pre", null, output)) : null);
		}
		/** assistant 内容块 → 子元素数组（text 走 markdown、reasoning 折叠、tool-call 工具卡）。 */
		function assistantBlocks(blocks, t) {
			if (blocks === void 0) return [];
			const parts = [];
			blocks.forEach((block, index) => {
				switch (block.kind) {
					case "text":
						if (block.text.trim() !== "") parts.push((0, react.createElement)(Md, {
							key: `t${index}`,
							text: block.text
						}));
						break;
					case "reasoning":
						if (block.text.trim() !== "") parts.push((0, react.createElement)("details", {
							key: `r${index}`,
							className: "dsh-tdt-sv-reasoning"
						}, (0, react.createElement)("summary", null, t("sessionReasoning")), (0, react.createElement)("div", { className: "dsh-tdt-sv-reasoning-body" }, block.text)));
						break;
					case "image":
						parts.push((0, react.createElement)("div", {
							key: `i${index}`,
							className: "dsh-tdt-sv-image"
						}, "[图片]"));
						break;
					case "tool-call":
						parts.push((0, react.createElement)(ToolCard, {
							key: `c${index}`,
							name: block.name,
							argsRaw: block.argsRaw,
							output: "",
							isError: false,
							t
						}));
						break;
					default: parts.push((0, react.createElement)("details", {
						key: `o${index}`,
						className: "dsh-tdt-sv-tool"
					}, (0, react.createElement)("summary", null, t("sessionUnknownKind")), (0, react.createElement)("pre", null, safeJson(block.block))));
				}
			});
			return parts;
		}
		/** 单个节点的自绘渲染；返回 null = 按决策 28 过滤的噪音 kind。 */
		function renderNode(node, t) {
			switch (node.kind) {
				case "user":
				case "steering": {
					const text = contentText(node.content);
					return text === "" ? null : (0, react.createElement)("div", {
						key: node.seq,
						className: "dsh-tdt-sv-user"
					}, (0, react.createElement)(Md, { text }));
				}
				case "assistant": {
					const parts = assistantBlocks(node.blocks, t);
					return parts.length === 0 ? null : (0, react.createElement)("div", {
						key: node.seq,
						className: "dsh-tdt-sv-assistant"
					}, parts);
				}
				case "tool-result": return (0, react.createElement)(ToolCard, {
					key: node.seq,
					name: node.call?.name ?? "tool",
					argsRaw: node.call?.argsRaw ?? "",
					output: contentText(node.content),
					isError: node.isError === true,
					errorName: node.error?.name,
					t
				});
				case "command": {
					const line = `/${node.name ?? "?"}${node.args === null || node.args === void 0 ? "" : ` ${node.args}`}`;
					return (0, react.createElement)("div", {
						key: node.seq,
						className: "dsh-tdt-sv-tool"
					}, (0, react.createElement)("div", { className: "dsh-tdt-sv-tool-head" }, (0, react.createElement)("span", { className: "dsh-tdt-sv-tool-name" }, line)), node.outcome !== null && node.outcome !== void 0 ? (0, react.createElement)("span", { className: `dsh-tdt-sv-outcome ${node.outcome.kind === "error" ? "dsh-tdt-sv-outcome-err" : "dsh-tdt-sv-outcome-ok"}` }, node.outcome.text ?? node.outcome.kind) : null);
				}
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
		* 面板内只读会话弹窗（决策 28 数据链 + 决策 34 渲染）：只读、不可续聊。
		* @param props - viewSessionId 指向的执行会话；数据经 openSessionView 建好传入。
		*/
		function SessionViewModal(props) {
			const { t, heading, sessionId, view, onClose } = props;
			const subscribe = (0, react.useMemo)(() => (onChange) => {
				return view.target.subscribe(onChange);
			}, [view]);
			const getSnapshot = (0, react.useMemo)(() => () => view.target.getSnapshot(), [view]);
			const chat = (0, react.useSyncExternalStore)(subscribe, getSnapshot);
			const sessionSub = (0, react.useMemo)(() => (onChange) => view.session.subscribe(onChange), [view]);
			const sessionGet = (0, react.useMemo)(() => () => view.session.getSnapshot(), [view]);
			const sessionSnap = (0, react.useSyncExternalStore)(sessionSub, sessionGet);
			const rendered = (chat?.legacy?.nodes ?? []).map((node) => renderNode(node, t)).filter((item) => item !== null);
			const openState = sessionSnap?.openState;
			const body = rendered.length === 0 ? (0, react.createElement)("div", { className: "dsh-tdt-sv-hint" }, openState === "error" ? t("sessionLoadFailed") : openState === "loading" || openState === "cold" ? t("sessionLoading") : t("sessionEmpty")) : rendered;
			const showLoadOlder = sessionSnap?.hasMore !== false;
			return (0, react.createElement)("div", {
				className: "dsh-tdt-sv-overlay",
				onClick: onClose
			}, (0, react.createElement)("div", {
				className: "dsh-tdt-sv-panel",
				onClick: (event) => {
					event.stopPropagation();
				}
			}, (0, react.createElement)("div", { className: "dsh-tdt-sv-header" }, (0, react.createElement)("div", { className: "dsh-tdt-sv-heading" }, (0, react.createElement)("div", { className: "dsh-tdt-sv-title" }, `${t("sessionViewerTitle")} · ${heading}`), (0, react.createElement)("div", { className: "dsh-tdt-sv-sid" }, sessionId)), (0, react.createElement)("div", { className: "dsh-tdt-sv-actions" }, showLoadOlder ? (0, react.createElement)("button", {
				type: "button",
				className: "dsh-tdt-sv-btn",
				onClick: () => view.loadOlder()
			}, t("sessionLoadOlder")) : null, (0, react.createElement)("button", {
				type: "button",
				className: "dsh-tdt-sv-btn dsh-tdt-sv-btn-icon",
				"aria-label": t("debugClose"),
				onClick: onClose
			}, (0, react.createElement)(CloseIcon, {})))), (0, react.createElement)("div", { className: "dsh-tdt-sv-body" }, (0, react.createElement)("div", { className: "dsh-tdt-sv-col" }, body))));
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
			const { t, scope, onBack, viewSession } = props;
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
			* 归档会话查看（当前宿主把归档会话标为 inactive：sessions.binding 返回空、
			* uiConversation.binding 抛 inactive session）⇒ 查看前先反归档让它恢复可读，
			* 弹窗关闭时再归档回去，平时列表依旧干净。
			*/
			const rearchive = (sessionId) => {
				fetch(`${DISPATCH_API_PREFIX}/session/archive`, {
					method: "POST",
					headers: { "content-type": "application/json" },
					body: JSON.stringify({ sessionId })
				}).catch(() => {});
			};
			/** 打开只读会话弹窗：反归档 → 组装 → 失败给出可见提示，不再静默无反应。 */
			const openView = async (sessionId, heading) => {
				if (viewSession === null) {
					setViewErr("查看会话不可用：sessions / uiConversation 注入未就位（见控制台）");
					return;
				}
				setViewErr(null);
				try {
					const res = await fetch(`${DISPATCH_API_PREFIX}/session/unarchive`, {
						method: "POST",
						headers: { "content-type": "application/json" },
						body: JSON.stringify({ sessionId })
					});
					const body = await res.json();
					if (!res.ok || body.ok !== true) {
						setViewErr(`反归档失败（${body.error ?? `HTTP ${res.status}`}）：无法查看该会话`);
						return;
					}
				} catch (error) {
					setViewErr(`反归档请求失败：${error instanceof Error ? error.message : String(error)}`);
					return;
				}
				let target = null;
				for (let attempt = 0; attempt < 8 && target === null; attempt++) {
					target = viewSession(sessionId);
					if (target === null) await new Promise((resolve) => {
						setTimeout(resolve, 150);
					});
				}
				if (target === null) {
					setViewErr("会话已反归档但仍打不开：sessions.binding 返回空或装配失败（原因见控制台 [task-dispatch:session-view] 日志）；已尝试归档回去");
					rearchive(sessionId);
					return;
				}
				setViewing({
					sessionId,
					heading,
					view: target
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
				onClose: () => {
					const closed = viewing.sessionId;
					setViewing(null);
					setViewErr(null);
					rearchive(closed);
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
			const { t, viewRef, onBack } = props;
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
				viewSession: viewRef()
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
			ctx.inject(["sessions", "uiConversation"], (sub) => {
				const sessions = sub.sessions;
				const uiConversation = sub.uiConversation;
				if (sessions !== void 0 && uiConversation !== void 0) viewSession = (id) => openSessionView(sessions, uiConversation, id);
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