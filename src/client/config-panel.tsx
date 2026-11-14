// 插件详情页的配置区（宿主 `plugins.bundle.config` 槽，key = 包名）。
//
// **版式照兄弟仓 `dsh-task-ledger` 的 config-panel 抄**（用户 2026-11-08：「一模一样」）：
//  · 两个设置项一行左右各半：左「显示名称」、右「入口位置」；
//  · 改过的字段出「自定义」标签 +「恢复默认」，没改过两者都不出现；
//  · 保存与两个链接同一排，保存最前；
//  · 控件只吃核心控件库（Input / Picker / Checkbox / Chip / Button），本文件只排
//    label、hint 与容器（`.tdt-config__*`），颜色只吃 `--dshpc-*`。
//
// 「屏蔽官方自动化」是兄弟仓没有的第三项：同一套两列网格里的第三个格子（只占左半），
// 控件也用同一套下拉（不屏蔽 / 屏蔽 两档，默认不屏蔽）。
//
// 数据走本插件自有 HTTP 通道：设置区渲染在**宿主的插件详情页**，不是本插件面板页，
// 相对路径会解析到别的目录 ⇒ 两个基准各试一次（相对 → 根路径），见 `requestConfig`。
import { createElement as h, useCallback, useEffect, useState, type ReactNode } from "react";
import { FontIcon } from "dsh-plugin-core/ui/icons";
import { Button } from "dsh-plugin-core/ui/button";
import { Chip } from "dsh-plugin-core/ui/chip";
import { Input } from "dsh-plugin-core/ui/input";
import { Picker } from "dsh-plugin-core/ui/picker";
import { API_PREFIX } from "./query";
import { fetchWithTimeout } from "./http";
import { applyStyle } from "./ui";
import { refreshAppearance } from "./sidebar-entry";
import type { Translate } from "./locales";

/** 本仓库地址（设置区的第一个链接）。 */
const PROJECT_URL = "https://github.com/cq-guojia/dsh-task-dispatch-table";
/** 友情链接：组件库（UI 基础控件包）。 */
const COMPONENTS_URL = "https://github.com/cq-guojia/dsh-plugin-core";

/** 入口位置两档：`first` = 侧栏一级菜单（默认）/ `more` = 收进「更多」菜单。 */
type EntryMode = "first" | "more";

/** 设置区三个字段的默认值（与 host 侧 `CONFIG_DEFAULTS` 同值；用来看「是否改过」）。 */
const DEFAULTS = { displayName: "", entryMode: "first" as EntryMode, hideOfficialSchedule: false };

/** 用到的最小配置面（`GET/POST /config` 的 `config` 投影）。 */
interface PanelValues {
	displayName: string;
	entryMode: EntryMode;
	hideOfficialSchedule: boolean;
}

/**
 * 详情页与面板页的 URL 目录不同：先按相对路径打，失败再按根路径打一次。
 * 403/404 时 `res.ok` 为假 / 返回非 JSON，都会落到下一次尝试。
 */
async function requestConfig(init?: RequestInit): Promise<PanelValues> {
	let last: unknown = null;
	for (const base of [API_PREFIX, `/${API_PREFIX}`]) {
		try {
			const res = await fetchWithTimeout(`${base}/config`, { cache: "no-store", ...init });
			const body = (await res.json()) as { ok?: unknown; config?: Record<string, unknown> };
			if (body.ok !== true) throw new Error(`config ${res.status}`);
			const config = body.config ?? {};
			return {
				displayName: typeof config.displayName === "string" ? config.displayName : DEFAULTS.displayName,
				entryMode: config.entryMode === "first" ? "first" : "more",
				hideOfficialSchedule: config.hideOfficialSchedule === true,
			};
		} catch (error) {
			last = error;
		}
	}
	throw last instanceof Error ? last : new Error("config unavailable");
}

// 颜色/字号/间距只吃核心 token（`--dshpc-*` 白名单外的变量会让产物 token 检查变红）。
// 尺寸与兄弟仓 `.dtl-config__*` 同源（pair 16px 间距、字段 24px 上留白、按钮行 24px 上留白）。
const CONFIG_CSS = `
.tdt-config__pair{display:grid;grid-template-columns:1fr 1fr;gap:16px;align-items:start;
  border-top:1px solid var(--dshpc-border);}
.tdt-config__field{display:flex;flex-direction:column;gap:6px;padding:24px 0 12px;}
.tdt-config__head{display:flex;align-items:center;gap:8px;}
.tdt-config__label{flex:1;min-width:0;font-size:var(--dshpc-font-md);font-weight:500;
  line-height:var(--dshpc-line-md);color:var(--dshpc-fg);}
.tdt-config__hint{margin:0;font-size:var(--dshpc-font-sm);line-height:var(--dshpc-line-sm);
  color:var(--dshpc-fg-3);}
.tdt-config__row{display:flex;align-items:center;gap:8px;flex-wrap:wrap;
  margin-top:24px;padding:0 0 32px;border-bottom:1px solid var(--dshpc-border);}
.tdt-config__failed{margin:0;font-size:var(--dshpc-font-sm);line-height:var(--dshpc-line-sm);
  color:var(--dshpc-danger);}
.tdt-config__note{margin:0;font-size:var(--dshpc-font-sm);line-height:var(--dshpc-line-sm);
  color:var(--dshpc-fg-3);}
`;

/** 一个字段：标签行（标签 + 改过徽标 + 恢复默认）→ 控件 → 说明。 */
function configField(props: {
	id: string;
	label: string;
	hint: string;
	overridden: boolean;
	overriddenLabel: string;
	resetLabel: string;
	onReset: () => void;
	control: ReactNode;
}): ReactNode {
	return h(
		"div",
		{ className: "tdt-config__field" },
		h(
			"div",
			{ className: "tdt-config__head" },
			h("span", { className: "tdt-config__label", id: props.id }, props.label),
			props.overridden ? h(Chip, { tone: "neutral", size: "xs" }, props.overriddenLabel) : null,
			props.overridden
				? h(Button, { variant: "link", size: "sm", onClick: props.onReset }, props.resetLabel)
				: null,
		),
		props.control,
		h("p", { className: "tdt-config__hint" }, props.hint),
	);
}

/** 一个小外链按钮（图标 + 文案，核心 Button，尺寸与兄弟仓一致）。 */
const linkButton = (label: string, url: string): ReactNode =>
	h(
		Button,
		{
			size: "lg",
			variant: "outline",
			// 两个按钮都指向 GitHub 仓库 ⇒ 统一用核心字体图标 `common.logo:github`（2026-11-15 用户指定）。
			icon: h(FontIcon, { name: "common.logo:github", size: 16 }),
			onClick: () => {
				window.open(url, "_blank", "noopener");
			},
		},
		label,
	);

export interface ConfigPanelProps {
	t: Translate;
	view?: "summary" | "page";
}

export function ConfigPanel(props: ConfigPanelProps): ReactNode {
	const { t, view } = props;
	const [loaded, setLoaded] = useState<PanelValues | null>(null);
	const [draft, setDraft] = useState<PanelValues | null>(null);
	const [saving, setSaving] = useState(false);
	const [failed, setFailed] = useState(false);

	useEffect(() => {
		applyStyle("domain:config-panel", CONFIG_CSS);
	}, []);

	const load = useCallback(async (): Promise<void> => {
		try {
			const next = await requestConfig();
			setLoaded(next);
			setDraft(next);
			setFailed(false);
		} catch {
			// 读不到就按默认值把表单摆出来（按钮照样在），只多一条提示。
			setLoaded(DEFAULTS);
			setDraft(DEFAULTS);
			setFailed(true);
		}
	}, []);

	useEffect(() => {
		void load();
	}, [load]);

	if (view !== undefined && view !== "page") return null;
	if (draft === null || loaded === null)
		return h("p", { className: "tdt-config__note", role: "status" }, t("configUnavailable"));

	const dirty = JSON.stringify(draft) !== JSON.stringify(loaded);
	const mode: EntryMode = draft.entryMode === "more" ? "more" : "first";

	const save = (): void => {
		setSaving(true);
		setFailed(false);
		void (async (): Promise<void> => {
			try {
				await requestConfig({
					method: "POST",
					headers: { "content-type": "application/json" },
					body: JSON.stringify(draft),
				});
				setLoaded(draft);
				// 侧栏的显示名 / 位置立刻跟着变（同一次保存）。
				void refreshAppearance();
			} catch {
				setFailed(true);
			} finally {
				setSaving(false);
			}
		})();
	};

	return h(
		"div",
		null,
		h(
			"div",
			{ className: "tdt-config__pair" },
			configField({
				id: "tdt-config-name",
				label: t("configNameLabel"),
				hint: t("configNameHint"),
				overridden: draft.displayName.trim() !== DEFAULTS.displayName,
				overriddenLabel: t("configOverridden"),
				resetLabel: t("configReset"),
				onReset: () => {
					setDraft({ ...draft, displayName: DEFAULTS.displayName });
				},
				control: h(Input, {
					value: draft.displayName,
					onChange: (text: string) => {
						setDraft({ ...draft, displayName: text });
					},
					placeholder: t("panelTitle"),
					size: "lg",
					"aria-label": t("configNameLabel"),
				}),
			}),
			configField({
				id: "tdt-config-entry",
				label: t("configEntryLabel"),
				hint: t("configEntryHint"),
				overridden: mode !== DEFAULTS.entryMode,
				overriddenLabel: t("configOverridden"),
				resetLabel: t("configReset"),
				onReset: () => {
					setDraft({ ...draft, entryMode: DEFAULTS.entryMode });
				},
				control: h(Picker, {
					value: mode,
					options: [
						{ value: "first", label: t("configEntryFirst") },
						{ value: "more", label: t("configEntryMore") },
					],
					mode: "single",
					size: "lg",
					width: "100%",
					ariaLabel: t("configEntryLabel"),
					onChange: (next: string | string[]) => {
						// 选中的就是当前值 ⇒ 不算改动，别把表单弄脏。
						const picked = String(next);
						if (picked !== mode) setDraft({ ...draft, entryMode: picked === "more" ? "more" : "first" });
					},
				}),
			}),
			configField({
				id: "tdt-config-hide-official",
				label: t("configHideOfficialLabel"),
				hint: t("configHideOfficialHint"),
				overridden: draft.hideOfficialSchedule !== DEFAULTS.hideOfficialSchedule,
				overriddenLabel: t("configOverridden"),
				resetLabel: t("configReset"),
				onReset: () => {
					setDraft({ ...draft, hideOfficialSchedule: DEFAULTS.hideOfficialSchedule });
				},
				control: h(Picker, {
					value: draft.hideOfficialSchedule ? "hide" : "show",
					options: [
						{ value: "show", label: t("configHideOff") },
						{ value: "hide", label: t("configHideOn") },
					],
					mode: "single",
					size: "lg",
					width: "100%",
					ariaLabel: t("configHideOfficialLabel"),
					onChange: (next: string | string[]) => {
						const picked = String(next) === "hide";
						if (picked !== draft.hideOfficialSchedule) setDraft({ ...draft, hideOfficialSchedule: picked });
					},
				}),
			}),
		),
		// ── 一排：保存最前，其后两个链接 ──
		h(
			"div",
			{ className: "tdt-config__row" },
			h(
				Button,
				{ variant: "primary", size: "lg", disabled: !dirty || saving, onClick: save },
				saving ? t("configSaving") : t("configSave"),
			),
			linkButton(t("configGithub"), PROJECT_URL),
			linkButton(t("configComponents"), COMPONENTS_URL),
			failed ? h("p", { className: "tdt-config__failed", role: "status" }, t("configSaveFailed")) : null,
		),
	);
}
