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
			recordsHint: "一次执行 = 一个计划刻度（决策 25）；同一任务同一刻度只可能有一条 ⇒ 不会重复执行。"
		};
		/** English copy. */
		const en = {
			title: "Task dispatch table (dsh-task-dispatch-table)",
			description: "Schedule agent tasks from a task table: configure tasks and review every run. Click to open the panel.",
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
			recordsHint: "One run = one schedule slot (decision 25); a task can only have one row per slot ⇒ no duplicate runs."
		};
		//#endregion
		//#region src/client/index.ts
		/** 设置命名空间 = 宿主 apply() 里 ctx.settings.register 的注册名（src/index.ts:42）。 */
		const SETTINGS_NS = "dsh-task-dispatch-table";
		/** 字典命名空间（locale 注册表独立于 settings 命名空间，取同名便于对应）。 */
		const LOCALE_NS = SETTINGS_NS;
		/** 只读参数展示值：undefined 显示占位符，statePath 空串 = 宿主数据根默认（决策 14）。 */
		function displayParam(t, value) {
			if (value === void 0) return "—";
			if (typeof value === "string" && value.trim() === "") return t("paramDefault");
			return String(value);
		}
		const textareaStyle = {
			width: "100%",
			boxSizing: "border-box",
			minHeight: "16em",
			resize: "vertical",
			fontFamily: "ui-monospace, SFMono-Regular, Menlo, Consolas, monospace",
			fontSize: "12px",
			lineHeight: 1.5,
			padding: "8px"
		};
		const hintStyle = {
			opacity: .7,
			fontSize: "12px",
			margin: "4px 0 8px"
		};
		const cardStyle = {
			display: "flex",
			alignItems: "center",
			justifyContent: "space-between",
			gap: "12px",
			padding: "12px 14px",
			border: "1px solid rgba(128,128,128,0.35)",
			borderRadius: "8px",
			cursor: "pointer",
			width: "100%",
			boxSizing: "border-box",
			background: "transparent",
			textAlign: "left"
		};
		const cardTitleStyle = {
			fontSize: "14px",
			fontWeight: 600
		};
		const cardDescStyle = {
			fontSize: "12px",
			opacity: .7,
			marginTop: "2px"
		};
		const chevronStyle = {
			fontSize: "18px",
			opacity: .6,
			lineHeight: 1
		};
		const errorStyle = {
			color: "#c0392b",
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
		const monoFont = "ui-monospace, SFMono-Regular, Menlo, Consolas, monospace";
		const preStyle = {
			fontFamily: monoFont,
			fontSize: "12px",
			lineHeight: 1.5,
			margin: "4px 0",
			whiteSpace: "pre-wrap",
			wordBreak: "break-all",
			maxHeight: "12em",
			overflow: "auto",
			background: "rgba(128,128,128,0.12)",
			padding: "8px",
			borderRadius: "4px"
		};
		const overlayStyle = {
			position: "fixed",
			inset: 0,
			zIndex: 1e3,
			background: "rgba(0,0,0,0.45)",
			display: "flex",
			alignItems: "center",
			justifyContent: "center",
			padding: "24px"
		};
		const panelStyle = {
			background: "#ffffff",
			color: "#1f2328",
			borderRadius: "8px",
			width: "100%",
			maxWidth: "1100px",
			maxHeight: "86vh",
			overflow: "auto",
			padding: "16px",
			boxSizing: "border-box"
		};
		const modalHeaderStyle = {
			display: "flex",
			alignItems: "center",
			justifyContent: "space-between",
			gap: "8px",
			marginBottom: "8px"
		};
		const sectionTitleStyle = {
			margin: "12px 0 4px",
			fontSize: "13px"
		};
		const tableStyle = {
			borderCollapse: "collapse",
			width: "100%",
			fontFamily: monoFont,
			fontSize: "12px",
			margin: "4px 0"
		};
		const cellStyle = {
			border: "1px solid rgba(128,128,128,0.35)",
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
		/** 标签页按钮样式：当前页加底部高亮条。 */
		function tabStyle(active) {
			return {
				padding: "6px 14px",
				cursor: "pointer",
				fontSize: "13px",
				border: "1px solid rgba(128,128,128,0.4)",
				borderBottom: active ? "2px solid #2f6feb" : "none",
				background: active ? "rgba(47,111,235,0.08)" : "transparent",
				fontWeight: active ? 600 : 400,
				borderRadius: "4px 4px 0 0"
			};
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
		* 调度表面板（双标签弹窗）：
		* - **任务配置**：内嵌任务表 JSON 输入框（暂存 + 保存）+ 已解析任务列表（id / 名称 / 周期 / 下次执行）；
		* - **执行记录**：全部执行记录，支持按状态 / 按任务过滤，点一行展开该次执行的事件时间线。
		*
		* 数据来自 settings 快照的 debugSnapshot 字段（host 周期写入），经 useSyncExternalStore
		* 订阅自动刷新，无需手动重开。
		*/
		function DispatcherModal(props) {
			const { t, scope, data, raw, onClose } = props;
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
			const section = snapshot.value ?? {};
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
			const instances = (data?.instances ?? []).filter((row) => statusFilter === "all" || row.status === statusFilter).filter((row) => taskFilter === "all" || row.task_id === taskFilter).slice().sort((a, b) => a.scheduled_at < b.scheduled_at ? 1 : a.scheduled_at > b.scheduled_at ? -1 : 0);
			const hasRaw = raw.trim() !== "";
			return (0, react.createElement)("div", {
				style: overlayStyle,
				onClick: onClose
			}, (0, react.createElement)("div", {
				style: panelStyle,
				onClick: (event) => {
					event.stopPropagation();
				}
			}, (0, react.createElement)("div", { style: modalHeaderStyle }, (0, react.createElement)("h3", { style: { margin: 0 } }, t("panelTitle")), (0, react.createElement)("div", { style: {
				display: "flex",
				alignItems: "center",
				gap: "12px"
			} }, data !== void 0 ? (0, react.createElement)("span", { style: hintStyle }, formatTime(data.at)) : null, manualAt !== void 0 ? (0, react.createElement)("span", { style: hintStyle }, `${t("debugRefreshedAt")} ${formatTime(new Date(manualAt).toISOString())}`) : null, (0, react.createElement)("button", {
				type: "button",
				onClick: () => {
					setManualAt(Date.now());
				}
			}, t("debugRefresh")), (0, react.createElement)("button", {
				type: "button",
				onClick: onClose
			}, t("debugClose")))), (0, react.createElement)("div", { style: {
				display: "flex",
				gap: "4px",
				borderBottom: "1px solid rgba(128,128,128,0.3)"
			} }, (0, react.createElement)("button", {
				type: "button",
				style: tabStyle(tab === "config"),
				onClick: () => {
					setTab("config");
				}
			}, t("tabConfig")), (0, react.createElement)("button", {
				type: "button",
				style: tabStyle(tab === "records"),
				onClick: () => {
					setTab("records");
				}
			}, t("tabRecords"))), (0, react.createElement)("p", { style: hintStyle }, t("debugAutoHint")), data === void 0 ? (0, react.createElement)("div", null, (0, react.createElement)("p", { style: hintStyle }, hasRaw ? t("debugRaw") : t("debugEmpty")), hasRaw ? (0, react.createElement)("pre", { style: preStyle }, raw) : null) : tab === "config" ? (0, react.createElement)("div", null, (0, react.createElement)("label", {
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
						background: open ? "rgba(47,111,235,0.08)" : void 0
					},
					onClick: () => {
						setExpanded(open ? null : row.id);
					}
				}, (0, react.createElement)("td", { style: cellStyle }, titleOfTask(row.task_id)), (0, react.createElement)("td", { style: cellStyle }, formatTime(row.scheduled_at)), (0, react.createElement)("td", { style: cellStyle }, row.status), (0, react.createElement)("td", { style: cellStyle }, String(row.attempt)), (0, react.createElement)("td", { style: cellStyle }, row.session_id === null ? "—" : row.session_id.slice(0, 8)), (0, react.createElement)("td", { style: cellStyle }, formatTime(row.updated_at))), open ? (0, react.createElement)("tr", null, (0, react.createElement)("td", {
					colSpan: 6,
					style: cellStyle
				}, (0, react.createElement)("div", { style: {
					fontSize: "12px",
					marginBottom: "4px"
				} }, t("eventsOf")), events.length === 0 ? (0, react.createElement)("p", { style: hintStyle }, t("eventsEmpty")) : (0, react.createElement)("table", { style: tableStyle }, (0, react.createElement)("thead", null, (0, react.createElement)("tr", null, [
					t("colSeq"),
					t("colTs"),
					t("colKind"),
					t("colDetail")
				].map((name) => (0, react.createElement)("th", {
					key: name,
					style: cellStyle
				}, name)))), (0, react.createElement)("tbody", null, events.map((event) => (0, react.createElement)("tr", { key: event.seq }, (0, react.createElement)("td", { style: cellStyle }, String(event.seq)), (0, react.createElement)("td", { style: cellStyle }, formatTime(event.ts)), (0, react.createElement)("td", { style: cellStyle }, event.kind), (0, react.createElement)("td", { style: detailCellStyle }, event.detail ?? ""))))))) : null);
			}))))));
		}
		/**
		* 设置页卡片（决策 26 修订）：**只留一行「标题 + 描述 + 箭头」**，点一下打开调度面板。
		* 原来的内嵌 JSON 输入框与只读运行参数都挪进了面板的「任务配置」页——设置页保持干净。
		* @param props - t 席位与绑定的设置作用域。
		*/
		function TasksConfigPage(props) {
			const { t, scope } = props;
			const subscribe = (0, react.useCallback)((onChange) => scope.subscribe(onChange), [scope]);
			const getSnapshot = (0, react.useCallback)(() => scope.getSnapshot(), [scope]);
			const snapshot = (0, react.useSyncExternalStore)(subscribe, getSnapshot);
			const [panelOpen, setPanelOpen] = (0, react.useState)(false);
			const section = snapshot.value ?? {};
			const debugRaw = typeof section.debugSnapshot === "string" ? section.debugSnapshot : "";
			const debugData = parseDebugSnapshot(debugRaw);
			if (snapshot.status !== "ready") return (0, react.createElement)("p", null, t("unavailable"));
			return (0, react.createElement)("div", null, (0, react.createElement)("div", {
				style: cardStyle,
				role: "button",
				tabIndex: 0,
				onClick: () => {
					setPanelOpen(true);
				},
				onKeyDown: (event) => {
					if (event.key === "Enter" || event.key === " ") setPanelOpen(true);
				}
			}, (0, react.createElement)("div", null, (0, react.createElement)("div", { style: cardTitleStyle }, t("title")), (0, react.createElement)("div", { style: cardDescStyle }, t("description"))), (0, react.createElement)("span", { style: chevronStyle }, "›")), panelOpen ? (0, react.createElement)(DispatcherModal, {
				t,
				scope,
				data: debugData,
				raw: debugRaw,
				onClose: () => {
					setPanelOpen(false);
				}
			}) : null);
		}
		/**
		* 浏览器插件入口：注册文案字典；在 slots + settingsScope 就位后把配置页注册进
		* settings.plugin.item（keyed 槽位，key = 设置命名空间）。
		* @param ctx - 浏览器插件上下文。
		*/
		function apply(ctx) {
			ctx.inject(["locale"], (localeCtx) => {
				ctx.effect(() => localeCtx.locale.register(LOCALE_NS, {
					zh,
					en
				}));
			});
			ctx.inject(["slots", "settingsScope"], (sub) => {
				const scope = sub.settingsScope.bind({ namespace: SETTINGS_NS });
				sub.slots.inject("settings.plugin.item", () => sub.slots.register({
					name: "settings.plugin.item",
					key: SETTINGS_NS,
					locale: LOCALE_NS,
					inject: () => ({ scope })
				}, TasksConfigPage));
			});
		}
		//#endregion
		exports.apply = apply;
		return module.exports;
	}
});

//# sourceMappingURL=client.js.map