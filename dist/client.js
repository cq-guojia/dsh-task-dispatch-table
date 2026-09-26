window.__ModuleLoader__.load({
	id: "dsh-task-dispatch-table",
	factory: (require) => {
		var module = { exports: {} };
		var exports = module.exports;
		Object.defineProperty(exports, Symbol.toStringTag, { value: "Module" });
		let react = require("react");
		let _deepseek_ai_dsh_client_ui_primitives = require("@deepseek-ai/dsh-client-ui-primitives");
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
			sessionLoadOlder: "加载更早记录",
			sessionProcess: "过程"
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
			sessionLoadOlder: "Load earlier messages",
			sessionProcess: "Process"
		};
		//#endregion
		//#region src/client/archive-session-css.ts
		/** 弹窗根类名前缀（稳定，不随宿主哈希变化）。 */
		const SV_STYLE_ID = "dsh-task-dispatch-table-archive-session";
		/** 归档会话弹窗全部样式规则（一条 <style> 注入，见 ensureArchiveSessionStyle）。 */
		const ARCHIVE_SESSION_CSS = `
.dsh-tdt-sv-overlay{position:fixed;inset:0;z-index:1010;display:flex;align-items:center;justify-content:center;padding:24px;background:var(--dsw-alias-bg-mask-1,rgba(0,0,0,.45));}
.dsh-tdt-sv-panel{--dsh-tdt-content-width:var(--dsh-chat-content-width,748px);--dsh-tdt-flow-gap:var(--dsh-chat-flow-gap,8px);background:var(--dsw-alias-bg-layer-1,rgba(128,128,128,.10));color:var(--dsw-alias-label-primary,#1f2328);border:1px solid var(--dsw-alias-border-l2,rgba(128,128,128,.35));border-radius:14px;box-shadow:var(--dsw-shadow-lv3,0 12px 40px rgba(0,0,0,.32));width:100%;max-width:1180px;max-height:92vh;display:flex;flex-direction:column;box-sizing:border-box;overflow:hidden;}
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
.dsh-tdt-sv-flowitem{min-width:0;}
.dsh-tdt-sv-official{flex:1;min-height:0;display:flex;flex-direction:column;overflow:hidden;}
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
		//#region src/client/session-view.ts
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
		/** markdown 文档级外壳文案（引用稳定，避免打断 MarkdownText 的流式渲染缓存）。 */
		const MD_LABELS = {
			code: {
				copyLabel: "复制",
				copiedLabel: "已复制"
			},
			footnotes: "脚注"
		};
		/**
		* markdown 正文：直接用**官方** `MarkdownText` 渲染（mdast + KaTeX + 官方代码块工具条），
		* 比自带 marked 管线更接近官方观感；外层仍套官方 AssistantMarkdown 类。
		*/
		function Md(props) {
			if (props.text.trim() === "") return (0, react.createElement)("span", null);
			return (0, react.createElement)("div", { className: officialClass("AssistantMarkdown", "root") ?? "dsh-tdt-sv-md" }, (0, react.createElement)(_deepseek_ai_dsh_client_ui_primitives.MarkdownText, {
				text: props.text,
				labels: MD_LABELS
			}));
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
			const [open, setOpen] = (0, react.useState)(isError);
			const preCls = ocOr("GenericCommandCard", "body", "");
			const summaryCls = ocOr("GenericCommandCard", "summary", "");
			/** 单行截断（官方 summary 是单行省略号样式）。 */
			const preview = (text) => {
				const first = text.split("\n").find((line) => line.trim() !== "") ?? "";
				return first.length > 90 ? `${first.slice(0, 90)}…` : first;
			};
			/** 人话摘要：优先取常见工具参数的关键字段（command / file_path / path / …），否则回退首行。 */
			const argSummary = (() => {
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
				return "";
			})();
			const summaryText = preview(argSummary !== "" ? argSummary : output.trim() !== "" ? output : argsRaw);
			const bodyText = [argsRaw.trim() !== "" ? `${t("sessionArgs")}:\n${argsRaw}` : "", output.trim() !== "" ? `${t("sessionOutput")}:\n${output}` : ""].filter((part) => part !== "").join("\n\n");
			const body = bodyText !== "" ? (0, react.createElement)("pre", { className: preCls }, bodyText) : null;
			return (0, react.createElement)("div", {
				className: ocOr("GenericCommandCard", "root", "dsh-tdt-sv-tool"),
				"data-state": isError ? "error" : "success"
			}, (0, react.createElement)(_deepseek_ai_dsh_client_ui_primitives.DisclosureRow, {
				icon: (0, react.createElement)(_deepseek_ai_dsh_client_ui_primitives.IconCodeOutlineRegular, {}),
				title: isError ? `${name}  ✕ ${errorName ?? "error"}` : name,
				open,
				expandable: body !== null,
				onToggle: () => {
					setOpen((value) => !value);
				},
				expandOnRowClick: true,
				rowClassName: ocOr("GenericCommandCard", "row", "dsh-tdt-sv-tool-head"),
				leadingClassName: ocOr("GenericCommandCard", "leading", ""),
				titleClassName: ocOr("GenericCommandCard", "title", "dsh-tdt-sv-tool-name"),
				chevronClassName: ocOr("GenericCommandCard", "chevron", ""),
				collapsedContent: summaryText !== "" ? (0, react.createElement)("span", { className: summaryCls }, summaryText) : null,
				children: body
			}));
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
							className: ocOr("ReasoningRow", "root", "dsh-tdt-sv-reasoning")
						}, (0, react.createElement)("summary", { className: ocOr("ReasoningRow", "row", "") }, (0, react.createElement)("span", { className: ocOr("ReasoningRow", "title", "") }, t("sessionReasoning"))), (0, react.createElement)("div", { className: ocOr("ReasoningRow", "thinkBody", "dsh-tdt-sv-reasoning-body") }, block.text)));
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
					if (text === "") return null;
					return (0, react.createElement)("div", {
						key: node.seq,
						className: ocOr("MessageItem", "userRow", "")
					}, (0, react.createElement)("div", { className: ocOr("MessageItem", "userStack", "") }, (0, react.createElement)("div", { className: ocOr("MessageItem", "bubble", "dsh-tdt-sv-user") }, (0, react.createElement)(Md, { text }))));
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
		/** 过程组：一行标题（过程 · N）+ 可展开的工具卡列表；用官方 ChatGroupSeat 类名。 */
		function ProcessGroup(props) {
			const [open, setOpen] = (0, react.useState)(false);
			const rendered = props.nodes.map((node) => renderNode(node, props.t)).filter((item) => item !== null);
			if (rendered.length === 0) return null;
			const items = rendered.map((item, index) => (0, react.createElement)("div", {
				key: `p${index}`,
				className: ocOr("ChatView", "flowItem", "dsh-tdt-sv-flowitem")
			}, item));
			return (0, react.createElement)("div", { className: ocOr("ChatGroupSeat", "root", "dsh-tdt-sv-group") }, (0, react.createElement)(_deepseek_ai_dsh_client_ui_primitives.DisclosureRow, {
				icon: (0, react.createElement)(_deepseek_ai_dsh_client_ui_primitives.IconCodeOutlineRegular, {}),
				title: `${props.t("sessionProcess")} · ${props.nodes.length}`,
				open,
				expandable: true,
				onToggle: () => {
					setOpen((value) => !value);
				},
				expandOnRowClick: true,
				rowClassName: ocOr("ChatGroupSeat", "row", ""),
				leadingClassName: ocOr("ChatGroupSeat", "leading", ""),
				titleClassName: ocOr("ChatGroupSeat", "title", ""),
				chevronClassName: ocOr("ChatGroupSeat", "chevron", ""),
				children: open ? (0, react.createElement)("div", { className: ocOr("ChatGroupSeat", "body", "") }, items) : null
			}));
		}
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
			const nodes = chat?.legacy?.nodes ?? [];
			const flowItemCls = ocOr("ChatView", "flowItem", "dsh-tdt-sv-flowitem");
			const rendered = groupNodes(nodes).map((entry, index) => {
				const inner = entry.kind === "process" ? (0, react.createElement)(ProcessGroup, {
					key: `g${index}`,
					nodes: entry.nodes,
					t
				}) : renderNode(entry.node, t);
				if (inner === null) return null;
				return (0, react.createElement)("div", {
					key: `flow${index}`,
					className: flowItemCls
				}, inner);
			}).filter((item) => item !== null);
			const officialCount = officialModuleCount();
			if (!officialWarned) {
				officialWarned = true;
				console.info(`[task-dispatch:session-view] 官方 ui-chat 模块数=${officialCount}；类名样例 frame=${officialClass("ChatView", "frame")} cardRoot=${officialClass("GenericCommandCard", "root")} bubble=${officialClass("MessageItem", "bubble")} reasoningRoot=${officialClass("ReasoningRow", "root")}`);
				if (officialCount === 0) console.warn("[task-dispatch:session-view] 未发现官方 ui-chat 样式模块 ⇒ 弹窗观感退回自绘样式（功能不受影响）");
			}
			const openState = sessionSnap?.openState;
			const body = rendered.length === 0 ? (0, react.createElement)("div", { className: ocOr("ChatView", "hint", "dsh-tdt-sv-hint") }, openState === "error" ? t("sessionLoadFailed") : openState === "loading" || openState === "cold" ? t("sessionLoading") : t("sessionEmpty")) : rendered;
			const showLoadOlder = sessionSnap?.hasMore !== false;
			return (0, react.createElement)("div", {
				className: "dsh-tdt-sv-overlay",
				onClick: onClose
			}, (0, react.createElement)("div", {
				className: "dsh-tdt-sv-panel",
				onClick: (event) => {
					event.stopPropagation();
				}
			}, (0, react.createElement)("div", { className: "dsh-tdt-sv-header" }, (0, react.createElement)("div", { className: "dsh-tdt-sv-heading" }, (0, react.createElement)("div", { className: "dsh-tdt-sv-title" }, `${t("sessionViewerTitle")} · ${heading}`), (0, react.createElement)("div", { className: "dsh-tdt-sv-sid" }, sessionId), officialModuleCount() === 0 ? (0, react.createElement)("div", {
				className: "dsh-tdt-sv-sid",
				style: { color: "var(--dsw-alias-state-warn-primary, #b7791f)" }
			}, "⚠ 官方样式未命中（当前为自绘回退）") : null), (0, react.createElement)("div", { className: "dsh-tdt-sv-actions" }, showLoadOlder ? (0, react.createElement)("button", {
				type: "button",
				className: "dsh-tdt-sv-btn",
				onClick: () => view.loadOlder()
			}, t("sessionLoadOlder")) : null, (0, react.createElement)("button", {
				type: "button",
				className: "dsh-tdt-sv-btn dsh-tdt-sv-btn-icon",
				"aria-label": t("debugClose"),
				onClick: onClose
			}, (0, react.createElement)(CloseIcon, {})))), (0, react.createElement)("div", { className: ocOr("ChatView", "frame", "dsh-tdt-sv-body") }, (0, react.createElement)("div", { className: officialClass("ChatView", "root") ?? "" }, (0, react.createElement)("div", { className: officialClass("ChatView", "scroll") ?? "" }, (0, react.createElement)("div", { className: ocOr("ChatView", "column", "dsh-tdt-sv-col") }, body))))));
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