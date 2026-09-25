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
			tasksParsedTitle: "已解析的任务（id 由系统生成，改名字不影响历史）",
			tasksParsedEmpty: "（无任务：内嵌任务表为空且任务目录无合法定义）",
			colTask: "任务",
			colTitle: "名称",
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
			tasksParsedTitle: "Parsed tasks (ids are generated; renaming never breaks history)",
			tasksParsedEmpty: "(no tasks: inline table empty and task dir has no valid definition)",
			colTask: "Task",
			colTitle: "Title",
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
			sessionLoadOlder: "Load earlier messages"
		};
		//#endregion
		//#region src/client/session-view.ts
		/** 打开只读视图：物化 binding → 探测拉尾页 → 建 chat target。会话不可解析时返回 null。 */
		function openSessionView(sessions, uiConversation, id) {
			let binding;
			try {
				const found = sessions.binding(id);
				if (found === void 0 || found === null) return null;
				binding = found;
			} catch {
				return null;
			}
			const session = binding.session;
			try {
				const opened = session.open?.();
				if (opened !== void 0 && typeof opened.catch === "function") opened.catch(() => {});
			} catch {}
			let conversation;
			try {
				conversation = uiConversation.binding(binding);
			} catch {
				return null;
			}
			return {
				target: conversation.target("chat"),
				session,
				loadOlder() {
					try {
						const page = session.loadOlder?.();
						if (page !== void 0 && typeof page.catch === "function") page.catch(() => {});
					} catch {}
				}
			};
		}
		const C$1 = {
			text: "var(--dsw-alias-label-primary, #1f2328)",
			textDim: "var(--dsw-alias-label-secondary, rgba(128,128,128,0.95))",
			textFaint: "var(--dsw-alias-label-tertiary, rgba(128,128,128,0.8))",
			layer1: "var(--dsw-alias-bg-layer-1, rgba(128,128,128,0.10))",
			layer2: "var(--dsw-alias-bg-layer-2, rgba(128,128,128,0.14))",
			border: "var(--dsw-alias-border-l2, rgba(128,128,128,0.35))",
			brand: "var(--dsw-alias-brand-primary, #2f6feb)",
			danger: "var(--dsw-alias-state-error-primary, #c0392b)",
			hover: "var(--dsw-alias-interactive-bg-hover, rgba(128,128,128,0.16))",
			shadow: "var(--dsw-shadow-lv3, 0 12px 40px rgba(0,0,0,0.32))"
		};
		const monoFont$1 = "var(--ds-font-family-code, ui-monospace, SFMono-Regular, Menlo, Consolas, monospace)";
		const sessionOverlayStyle = {
			position: "fixed",
			inset: 0,
			zIndex: 1010,
			background: C$1.layer2,
			display: "flex",
			alignItems: "center",
			justifyContent: "center",
			padding: "24px"
		};
		const sessionPanelStyle = {
			background: C$1.layer1,
			color: C$1.text,
			borderRadius: "14px",
			width: "100%",
			maxWidth: "860px",
			maxHeight: "86vh",
			display: "flex",
			flexDirection: "column",
			boxSizing: "border-box",
			border: `1px solid ${C$1.border}`,
			boxShadow: C$1.shadow
		};
		const sessionHeaderStyle = {
			display: "flex",
			alignItems: "center",
			justifyContent: "space-between",
			gap: "12px",
			padding: "14px 18px 10px",
			borderBottom: `1px solid ${C$1.border}`,
			flexWrap: "wrap"
		};
		const sessionTitleStyle = {
			fontSize: "15px",
			fontWeight: 600,
			color: C$1.text
		};
		const sessionBodyStyle = {
			overflow: "auto",
			padding: "12px 18px 18px",
			display: "flex",
			flexDirection: "column",
			gap: "10px"
		};
		const sessionIdStyle = {
			fontFamily: monoFont$1,
			fontSize: "11px",
			color: C$1.textFaint,
			wordBreak: "break-all"
		};
		const bubbleStyle = {
			alignSelf: "flex-start",
			maxWidth: "92%",
			background: C$1.layer2,
			borderRadius: "10px",
			padding: "8px 12px",
			whiteSpace: "pre-wrap",
			wordBreak: "break-word",
			fontSize: "13px",
			lineHeight: 1.55
		};
		const assistantStyle = {
			alignSelf: "flex-end",
			maxWidth: "92%",
			background: C$1.layer1,
			border: `1px solid ${C$1.border}`,
			borderRadius: "10px",
			padding: "8px 12px",
			whiteSpace: "pre-wrap",
			wordBreak: "break-word",
			fontSize: "13px",
			lineHeight: 1.55
		};
		const toolCardStyle = {
			alignSelf: "stretch",
			border: `1px solid ${C$1.border}`,
			borderRadius: "8px",
			padding: "6px 10px",
			fontSize: "12px",
			background: C$1.layer1
		};
		const toolTitleStyle = {
			fontFamily: monoFont$1,
			fontSize: "12px",
			fontWeight: 600,
			color: C$1.brand
		};
		const toolErrorStyle = {
			color: C$1.danger,
			fontWeight: 600
		};
		const noticeRowStyle = {
			alignSelf: "center",
			fontSize: "12px",
			color: C$1.textFaint,
			padding: "2px 8px"
		};
		const noticeErrorStyle = {
			alignSelf: "center",
			fontSize: "12px",
			color: C$1.danger,
			padding: "2px 8px",
			textAlign: "center"
		};
		const hintRowStyle = {
			fontSize: "12px",
			color: C$1.textDim,
			textAlign: "center",
			padding: "8px 0"
		};
		const preArgsStyle = {
			fontFamily: monoFont$1,
			fontSize: "11px",
			lineHeight: 1.5,
			margin: "6px 0 0",
			whiteSpace: "pre-wrap",
			wordBreak: "break-all",
			maxHeight: "12em",
			overflow: "auto",
			background: C$1.layer2,
			padding: "6px",
			borderRadius: "6px",
			color: C$1.text
		};
		const buttonStyle = {
			appearance: "none",
			font: "inherit",
			fontSize: "12px",
			cursor: "pointer",
			color: C$1.text,
			background: C$1.layer2,
			border: `1px solid ${C$1.border}`,
			borderRadius: "8px",
			padding: "4px 12px"
		};
		C$1.brand;
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
		/** 提取内容块的可读文本：text 拼接、图片占位（官方 ContentBlock 是 merge-extensible map）。 */
		function contentText(blocks) {
			if (blocks === void 0) return "";
			return blocks.map((block) => {
				if (block !== null && typeof block === "object" && block.type === "text" && typeof block.text === "string") return block.text;
				if (block !== null && typeof block === "object" && block.type === "image") return "[图片]";
				return "";
			}).filter((part) => part !== "").join("\n");
		}
		/** assistant 块的可读文本：只保留 text / image 占位（reasoning / tool-call / other 不渲染）。 */
		function assistantText(blocks) {
			if (blocks === void 0) return "";
			return blocks.map((block) => {
				if (block.kind === "text") return block.text;
				if (block.kind === "image") return "[图片]";
				return "";
			}).filter((part) => part !== "").join("\n");
		}
		/** 单个节点的自绘渲染；返回 null = 按决策 28 过滤的噪音 kind。 */
		function renderNode(node, t) {
			switch (node.kind) {
				case "user":
				case "steering": {
					const text = contentText(node.content);
					return text === "" ? null : (0, react.createElement)("div", {
						key: node.seq,
						style: bubbleStyle
					}, text);
				}
				case "assistant": {
					const text = assistantText(node.blocks);
					return text === "" ? null : (0, react.createElement)("div", {
						key: node.seq,
						style: assistantStyle
					}, text);
				}
				case "tool-result": {
					const name = node.call?.name ?? "tool";
					const argsRaw = node.call?.argsRaw ?? "";
					const output = contentText(node.content);
					return (0, react.createElement)("div", {
						key: node.seq,
						style: toolCardStyle
					}, (0, react.createElement)("div", { style: {
						display: "flex",
						gap: "8px",
						alignItems: "baseline",
						flexWrap: "wrap"
					} }, (0, react.createElement)("span", { style: toolTitleStyle }, `⚙ ${name}`), node.isError === true ? (0, react.createElement)("span", { style: toolErrorStyle }, `✕ ${node.error?.name ?? "error"}`) : null), argsRaw.trim() !== "" ? (0, react.createElement)("details", null, (0, react.createElement)("summary", { style: {
						cursor: "pointer",
						fontSize: "11px",
						color: C$1.textFaint,
						margin: "2px 0 0"
					} }, t("sessionArgs")), (0, react.createElement)("pre", { style: preArgsStyle }, argsRaw)) : null, output.trim() !== "" ? (0, react.createElement)("details", { open: node.isError === true }, (0, react.createElement)("summary", { style: {
						cursor: "pointer",
						fontSize: "11px",
						color: C$1.textFaint,
						margin: "2px 0 0"
					} }, t("sessionOutput")), (0, react.createElement)("pre", { style: preArgsStyle }, output)) : null);
				}
				case "command": {
					const line = `/${node.name ?? "?"}${node.args === null || node.args === void 0 ? "" : ` ${node.args}`}`;
					return (0, react.createElement)("div", {
						key: node.seq,
						style: toolCardStyle
					}, (0, react.createElement)("span", { style: {
						fontFamily: monoFont$1,
						fontSize: "12px"
					} }, line), node.outcome !== null && node.outcome !== void 0 ? (0, react.createElement)("span", { style: {
						fontFamily: monoFont$1,
						fontSize: "11px",
						margin: "4px 0 0",
						display: "block",
						color: node.outcome.kind === "error" ? C$1.danger : C$1.textDim
					} }, node.outcome.text ?? node.outcome.kind) : null);
				}
				case "turn-error": return (0, react.createElement)("div", {
					key: node.seq,
					style: noticeErrorStyle
				}, `${t("sessionTurnError")}${node.message === void 0 || node.message === "" ? "" : `：${node.message}`}`);
				case "turn-max-tokens": return (0, react.createElement)("div", {
					key: node.seq,
					style: noticeRowStyle
				}, t("sessionMaxTokens"));
				case "model-retry": return (0, react.createElement)("div", {
					key: node.seq,
					style: noticeRowStyle
				}, `${t("sessionRetry")}（${node.retryState ?? "scheduled"}）`);
				case "context":
				case "compaction":
				case "unknown": return null;
				default: return (0, react.createElement)("details", {
					key: node.seq,
					style: toolCardStyle
				}, (0, react.createElement)("summary", { style: {
					cursor: "pointer",
					fontSize: "11px",
					color: C$1.textFaint
				} }, `${t("sessionUnknownKind")} ${node.kind}`), (0, react.createElement)("pre", { style: preArgsStyle }, JSON.stringify(node, null, 2)));
			}
		}
		/**
		* 面板内只读会话弹窗（决策 28）：官方解析 + 自绘简化渲染，只读、不可续聊。
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
			const body = rendered.length === 0 ? (0, react.createElement)("div", { style: hintRowStyle }, openState === "error" ? t("sessionLoadFailed") : openState === "loading" || openState === "cold" ? t("sessionLoading") : t("sessionEmpty")) : rendered;
			const showLoadOlder = sessionSnap?.hasMore !== false;
			return (0, react.createElement)("div", {
				style: sessionOverlayStyle,
				onClick: onClose
			}, (0, react.createElement)("div", {
				style: sessionPanelStyle,
				onClick: (event) => {
					event.stopPropagation();
				}
			}, (0, react.createElement)("div", { style: sessionHeaderStyle }, (0, react.createElement)("div", null, (0, react.createElement)("div", { style: sessionTitleStyle }, `${t("sessionViewerTitle")} · ${heading}`), (0, react.createElement)("div", { style: sessionIdStyle }, sessionId)), (0, react.createElement)("div", { style: {
				display: "flex",
				alignItems: "center",
				gap: "8px"
			} }, showLoadOlder ? (0, react.createElement)("button", {
				type: "button",
				style: buttonStyle,
				onClick: () => view.loadOlder()
			}, t("sessionLoadOlder")) : null, (0, react.createElement)("button", {
				type: "button",
				style: {
					...buttonStyle,
					padding: "4px 6px"
				},
				"aria-label": t("debugClose"),
				onClick: onClose
			}, (0, react.createElement)(CloseIcon, {})))), (0, react.createElement)("div", { style: sessionBodyStyle }, body)));
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
			const [failed, setFailed] = (0, react.useState)(false);
			const [manualAt, setManualAt] = (0, react.useState)(void 0);
			const [statusFilter, setStatusFilter] = (0, react.useState)("all");
			const [taskFilter, setTaskFilter] = (0, react.useState)("all");
			const [expanded, setExpanded] = (0, react.useState)(null);
			const [viewing, setViewing] = (0, react.useState)(null);
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
				setFailed(false);
				try {
					if (draft.trim() === "") await scope.unset("tasksInline");
					else await scope.set("tasksInline", draft);
					setDraft(void 0);
				} catch {
					setFailed(true);
				} finally {
					setSaving(false);
				}
			};
			const taskRows = data?.tasks ?? [];
			const titleOfTask = (id) => {
				const row = taskRows.find((item) => item.id === id);
				return row === void 0 ? id : `${row.title}（${row.id}）`;
			};
			/** 打开只读会话弹窗：组装失败（服务缺失 / 会话不可解析）时静默不动。 */
			const openView = (sessionId, heading) => {
				if (viewSession === null) return;
				const target = viewSession(sessionId);
				if (target === null) return;
				setViewing({
					sessionId,
					heading,
					view: target
				});
			};
			const instances = (data?.instances ?? []).filter((row) => statusFilter === "all" || row.status === statusFilter).filter((row) => taskFilter === "all" || row.task_id === taskFilter).slice().sort((a, b) => a.scheduled_at < b.scheduled_at ? 1 : a.scheduled_at > b.scheduled_at ? -1 : 0);
			const hasRaw = raw.trim() !== "";
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
			}, t("tabRecords"))))), (0, react.createElement)("p", { style: hintStyle }, t("debugAutoHint")), data === void 0 ? (0, react.createElement)("div", null, (0, react.createElement)("p", { style: hintStyle }, hasRaw ? t("debugRaw") : t("debugEmpty")), hasRaw ? (0, react.createElement)("pre", { style: preStyle }, raw) : null, (0, react.createElement)("pre", { style: {
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
					setFailed(false);
				},
				disabled: saving || !dirty
			}, t("discard"))), failed ? (0, react.createElement)("p", { style: errorStyle }, t("saveFailed")) : null, (0, react.createElement)("h4", { style: sectionTitleStyle }, t("tasksParsedTitle")), taskRows.length === 0 ? (0, react.createElement)("p", { style: hintStyle }, t("tasksParsedEmpty")) : (0, react.createElement)("table", { style: tableStyle }, (0, react.createElement)("thead", null, (0, react.createElement)("tr", null, [
				t("colTask"),
				t("colTitle"),
				t("colSchedule"),
				t("colNext")
			].map((name) => (0, react.createElement)("th", {
				key: name,
				style: cellStyle
			}, name)))), (0, react.createElement)("tbody", null, taskRows.map((row) => (0, react.createElement)("tr", { key: row.id }, (0, react.createElement)("td", { style: cellStyle }, row.id), (0, react.createElement)("td", { style: cellStyle }, row.title), (0, react.createElement)("td", { style: cellStyle }, scheduleSummary(row)), (0, react.createElement)("td", { style: cellStyle }, row.next === null ? "—" : formatTime(row.next)))))), (0, react.createElement)("h4", { style: sectionTitleStyle }, t("debugWarns")), data.warns.length === 0 ? (0, react.createElement)("p", { style: hintStyle }, t("debugNoWarns")) : (0, react.createElement)("pre", { style: preStyle }, data.warns.join("\n")), (0, react.createElement)("details", { style: { marginTop: "16px" } }, (0, react.createElement)("summary", null, t("paramsTitle")), (0, react.createElement)("dl", { style: dlStyle }, (0, react.createElement)("dt", null, t("paramStatePath")), (0, react.createElement)("dd", { style: { margin: 0 } }, displayParam(t, section.statePath)), (0, react.createElement)("dt", null, t("paramTickMs")), (0, react.createElement)("dd", { style: { margin: 0 } }, displayParam(t, section.tickMs)), (0, react.createElement)("dt", null, t("paramDispatchGraceMs")), (0, react.createElement)("dd", { style: { margin: 0 } }, displayParam(t, section.dispatchGraceMs)), (0, react.createElement)("dt", null, t("paramLeaseMs")), (0, react.createElement)("dd", { style: { margin: 0 } }, displayParam(t, section.leaseMs)), (0, react.createElement)("dt", null, t("paramUnknownGraceMs")), (0, react.createElement)("dd", { style: { margin: 0 } }, displayParam(t, section.unknownGraceMs)), (0, react.createElement)("dt", null, t("paramTasksDir")), (0, react.createElement)("dd", { style: { margin: 0 } }, displayParam(t, section.tasksDir)), (0, react.createElement)("dt", null, t("paramDefaultProvider")), (0, react.createElement)("dd", { style: { margin: 0 } }, displayParam(t, section.defaultProvider)), (0, react.createElement)("dt", null, t("paramDefaultModel")), (0, react.createElement)("dd", { style: { margin: 0 } }, displayParam(t, section.defaultModel))))) : (0, react.createElement)("div", null, (0, react.createElement)("p", { style: hintStyle }, t("recordsHint")), (0, react.createElement)("div", { style: rowStyle }, (0, react.createElement)("label", { style: { fontSize: "12px" } }, `${t("filterStatus")} `, (0, react.createElement)("select", {
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
					setViewing(null);
				}
			}) : null);
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
					await fetch(`${DISPATCH_API_PREFIX}/tasks`, {
						method: "POST",
						headers: { "content-type": "application/json" },
						body: JSON.stringify({ tasksInline: String(value) })
					});
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