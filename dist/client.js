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
			description: "在下方编辑内嵌任务表 JSON；保存后写入用户配置层并即时生效，离开页面丢弃未保存的草稿。",
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
			debugButton: "调试日志",
			debugTitle: "调试快照（临时面板，随宿主状态自动刷新）",
			debugClose: "关闭",
			debugEmpty: "暂无快照：宿主完成一次调度（或派发 / 会话事件）后自动写入。若持续为空，说明宿主侧运行的还是旧版插件，请重装后重试。",
			debugRaw: "快照解析失败，原文如下：",
			debugTasks: "已加载任务",
			debugWarns: "最近告警 / 错误（≤20 条）",
			debugNoWarns: "（无）",
			debugInstances: "实例 task_instances",
			debugInstancesEmpty: "（尚无实例）",
			debugEvents: "事件 task_events（最近 40 条，旧 → 新）",
			debugEventsEmpty: "（尚无事件）"
		};
		/** English copy. */
		const en = {
			title: "Task dispatch table (dsh-task-dispatch-table)",
			description: "Edit the inline task-table JSON below; saving writes the user settings layer and takes effect immediately. Unsaved drafts are dropped when you leave the page.",
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
			debugButton: "Debug logs",
			debugTitle: "Debug snapshot (temporary panel; auto-refreshes with host state)",
			debugClose: "Close",
			debugEmpty: "No snapshot yet: the host writes one after each scheduling pass (or dispatch / session event). If it stays empty, the host is still running an old plugin build — reinstall and retry.",
			debugRaw: "Failed to parse the snapshot; raw text below:",
			debugTasks: "Loaded tasks",
			debugWarns: "Recent warnings / errors (≤20 entries)",
			debugNoWarns: "(none)",
			debugInstances: "Instances task_instances",
			debugInstancesEmpty: "(no instances yet)",
			debugEvents: "Events task_events (latest 40, oldest → newest)",
			debugEventsEmpty: "(no events yet)"
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
			maxWidth: "920px",
			maxHeight: "82vh",
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
		/** 解析快照 JSON；为空或形状不符返回 undefined（原文由调用方兜底展示）。 */
		function parseDebugSnapshot(raw) {
			if (typeof raw !== "string" || raw.trim() === "") return void 0;
			try {
				const parsed = JSON.parse(raw);
				if (typeof parsed !== "object" || parsed === null) return void 0;
				const candidate = parsed;
				if (!Array.isArray(candidate.instances) || !Array.isArray(candidate.events)) return void 0;
				return parsed;
			} catch {
				return;
			}
		}
		/**
		* 渲染调试弹窗：任务表 ids / 告警环形缓冲 / 实例表 / 事件表。
		* 数据来自 settings 快照的 debugSnapshot 字段（host 周期写入），经 useSyncExternalStore
		* 订阅自动刷新，无需手动重开。
		*/
		function DebugModal(props) {
			const { t, data, raw, onClose } = props;
			const hasRaw = raw.trim() !== "";
			return (0, react.createElement)("div", {
				style: overlayStyle,
				onClick: onClose
			}, (0, react.createElement)("div", {
				style: panelStyle,
				onClick: (event) => {
					event.stopPropagation();
				}
			}, (0, react.createElement)("div", { style: modalHeaderStyle }, (0, react.createElement)("h3", { style: { margin: 0 } }, t("debugTitle")), (0, react.createElement)("div", { style: {
				display: "flex",
				alignItems: "center",
				gap: "12px"
			} }, data !== void 0 ? (0, react.createElement)("span", { style: hintStyle }, data.at) : null, (0, react.createElement)("button", {
				type: "button",
				onClick: onClose
			}, t("debugClose")))), data === void 0 ? (0, react.createElement)("div", null, (0, react.createElement)("p", { style: hintStyle }, hasRaw ? t("debugRaw") : t("debugEmpty")), hasRaw ? (0, react.createElement)("pre", { style: preStyle }, raw) : null) : (0, react.createElement)("div", null, (0, react.createElement)("p", { style: hintStyle }, `${t("debugTasks")}：${data.tasks.length > 0 ? data.tasks.join(", ") : "—"}`), (0, react.createElement)("h4", { style: sectionTitleStyle }, t("debugWarns")), data.warns.length === 0 ? (0, react.createElement)("p", { style: hintStyle }, t("debugNoWarns")) : (0, react.createElement)("pre", { style: preStyle }, data.warns.join("\n")), (0, react.createElement)("h4", { style: sectionTitleStyle }, t("debugInstances")), data.instances.length === 0 ? (0, react.createElement)("p", { style: hintStyle }, t("debugInstancesEmpty")) : (0, react.createElement)("table", { style: tableStyle }, (0, react.createElement)("thead", null, (0, react.createElement)("tr", null, [
				"id",
				"status",
				"attempt",
				"session",
				"updated_at"
			].map((name) => (0, react.createElement)("th", {
				key: name,
				style: cellStyle
			}, name)))), (0, react.createElement)("tbody", null, data.instances.map((row) => (0, react.createElement)("tr", { key: row.id }, (0, react.createElement)("td", { style: cellStyle }, row.id), (0, react.createElement)("td", { style: cellStyle }, row.status), (0, react.createElement)("td", { style: cellStyle }, String(row.attempt)), (0, react.createElement)("td", { style: cellStyle }, row.session_id === null ? "—" : row.session_id.slice(0, 8)), (0, react.createElement)("td", { style: cellStyle }, row.updated_at))))), (0, react.createElement)("h4", { style: sectionTitleStyle }, t("debugEvents")), data.events.length === 0 ? (0, react.createElement)("p", { style: hintStyle }, t("debugEventsEmpty")) : (0, react.createElement)("table", { style: tableStyle }, (0, react.createElement)("thead", null, (0, react.createElement)("tr", null, [
				"seq",
				"ts",
				"kind",
				"detail"
			].map((name) => (0, react.createElement)("th", {
				key: name,
				style: cellStyle
			}, name)))), (0, react.createElement)("tbody", null, data.events.map((row) => (0, react.createElement)("tr", { key: row.seq }, (0, react.createElement)("td", { style: cellStyle }, String(row.seq)), (0, react.createElement)("td", { style: cellStyle }, row.ts), (0, react.createElement)("td", { style: cellStyle }, row.kind), (0, react.createElement)("td", { style: detailCellStyle }, row.detail ?? ""))))))));
		}
		/**
		* 渲染设置卡片：tasksInline 文本框（暂存 + 保存）+ 只读运行参数。
		*
		* 用「暂存 + 保存」而不是改一下就提交：每次写入都是可持久化的、带修订号栅栏的
		* 文档变更，边改边写会把一次输入变成用户没要求、也无法预览的写入。
		* @param props - t 席位与绑定的设置作用域。
		*/
		function TasksConfigPage(props) {
			const { t, scope } = props;
			const subscribe = (0, react.useCallback)((onChange) => scope.subscribe(onChange), [scope]);
			const getSnapshot = (0, react.useCallback)(() => scope.getSnapshot(), [scope]);
			const snapshot = (0, react.useSyncExternalStore)(subscribe, getSnapshot);
			const [draft, setDraft] = (0, react.useState)(void 0);
			const [saving, setSaving] = (0, react.useState)(false);
			const [failed, setFailed] = (0, react.useState)(false);
			const [debugOpen, setDebugOpen] = (0, react.useState)(false);
			const section = snapshot.value ?? {};
			const effectiveInline = typeof section.tasksInline === "string" ? section.tasksInline : "";
			const current = draft ?? effectiveInline;
			const invalid = draft !== void 0 && !isValidTaskTable(draft);
			const dirty = draft !== void 0 && draft !== effectiveInline;
			const ready = snapshot.status === "ready";
			const writable = ready && snapshot.writable && !saving;
			const debugRaw = typeof section.debugSnapshot === "string" ? section.debugSnapshot : "";
			const debugData = parseDebugSnapshot(debugRaw);
			const save = async () => {
				if (draft === void 0 || invalid || !ready || !snapshot.writable) return;
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
			if (!ready) return (0, react.createElement)("p", null, t("unavailable"));
			return (0, react.createElement)("div", null, (0, react.createElement)("h3", null, t("title")), (0, react.createElement)("p", { style: hintStyle }, t("description")), (0, react.createElement)("label", {
				htmlFor: "dsh-tdt-tasks-inline",
				style: { fontWeight: 600 }
			}, t("tasksInlineLabel")), (0, react.createElement)("p", { style: hintStyle }, t("tasksInlineHint")), (0, react.createElement)("textarea", {
				id: "dsh-tdt-tasks-inline",
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
			}, t("discard"))), failed ? (0, react.createElement)("p", { style: errorStyle }, t("saveFailed")) : null, (0, react.createElement)("div", { style: rowStyle }, (0, react.createElement)("button", {
				type: "button",
				onClick: () => {
					setDebugOpen(true);
				}
			}, t("debugButton"))), (0, react.createElement)("details", { style: { marginTop: "16px" } }, (0, react.createElement)("summary", null, t("paramsTitle")), (0, react.createElement)("dl", { style: dlStyle }, (0, react.createElement)("dt", null, t("paramStatePath")), (0, react.createElement)("dd", { style: { margin: 0 } }, displayParam(t, section.statePath)), (0, react.createElement)("dt", null, t("paramTickMs")), (0, react.createElement)("dd", { style: { margin: 0 } }, displayParam(t, section.tickMs)), (0, react.createElement)("dt", null, t("paramDispatchGraceMs")), (0, react.createElement)("dd", { style: { margin: 0 } }, displayParam(t, section.dispatchGraceMs)), (0, react.createElement)("dt", null, t("paramLeaseMs")), (0, react.createElement)("dd", { style: { margin: 0 } }, displayParam(t, section.leaseMs)), (0, react.createElement)("dt", null, t("paramUnknownGraceMs")), (0, react.createElement)("dd", { style: { margin: 0 } }, displayParam(t, section.unknownGraceMs)), (0, react.createElement)("dt", null, t("paramTasksDir")), (0, react.createElement)("dd", { style: { margin: 0 } }, displayParam(t, section.tasksDir)))), debugOpen ? (0, react.createElement)(DebugModal, {
				t,
				data: debugData,
				raw: debugRaw,
				onClose: () => {
					setDebugOpen(false);
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