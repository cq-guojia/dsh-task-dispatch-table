/**
 * 侧栏入口的「显示名 + 位置」：按插件设置把入口挂到一级菜单（`sidebar.panellist`）或
 * 「更多」菜单（`sidebar.panellist.actions`），并在设置变化后重挂。
 *
 * 做法照抄兄弟仓 `dsh-task-ledger` 的同款模块（2026-11-08 用户要求「跟它几乎一模一样」）：
 * 两个 slot 的 owner 到达顺序、以及设置与 slots 两块注入谁先到都没有保证 ⇒ 每次都用
 * **模块级当前值**重挂一遍；重复调用无害。
 */
import { createElement as h, type ComponentType, type ReactNode } from "react";
import { MenuItemButton } from "@deepseek-ai/dsh-client-ui-primitives";
import { fetchWithTimeout } from "./http";
import { API_PREFIX } from "./query";

/** 主面板 id：`main` 槽的 key 与 `sidebar.panellist` 条目的 id 必须一致，选中才对得上。 */
export const PANEL_ID = "dsh-task-dispatch-table";

/** 本模块用到的最小 slots 面（`ClientContext['slots']` 的子集）。 */
interface SlotsFace {
	inject(name: string, callback: () => () => void): () => void;
	register(options: Record<string, unknown>, component: unknown): () => void;
}

/** 入口的两档位置（与 `src/config.ts` 的 `EntryMode` 同值）。 */
type EntryMode = "first" | "more";

let entryMode: EntryMode = "first";
/** 自定义显示名；空串 = 用词典默认名。 */
let customName = "";

let slotsRef: SlotsFace | null = null;
let iconFace: ComponentType<{ size?: number }> | null = null;
let localeNs = PANEL_ID;
let defaultLabel: () => string = () => PANEL_ID;
/** 「更多」那一行点击后切到本面板（布局服务由 index 注入）。 */
let navigate: (id: string) => void = () => {};

let injected: (() => void) | null = null;
let disposeEntry: (() => void) | null = null;

/** 侧栏行标题：自定义名优先，空则回落词典默认名。 */
function entryLabel(): string {
	return customName === "" ? defaultLabel() : customName;
}

/** 「更多」菜单里的一行（官方 menu 行样式，点完先关菜单再切页面）。 */
function MoreEntry(props: { onDismiss?: () => void }): ReactNode {
	const icon = iconFace;
	return h(MenuItemButton, {
		...(icon === null ? {} : { icon: h(icon, { size: 16 }) }),
		onSelect: () => {
			props.onDismiss?.();
			navigate(PANEL_ID);
		},
		children: entryLabel(),
	});
}

/** 按当前 `entryMode` 重挂入口：先摘旧的 factory 与旧条目，再按现值注册。 */
function applyEntry(): void {
	const slots = slotsRef;
	if (slots === null || iconFace === null) return;
	injected?.();
	disposeEntry?.();
	injected = null;
	disposeEntry = null;
	if (entryMode === "more") {
		injected = slots.inject("sidebar.panellist.actions", () => {
			disposeEntry = slots.register(
				{ name: "sidebar.panellist.actions", id: `${PANEL_ID}-more`, order: 30, locale: localeNs },
				MoreEntry,
			);
			return disposeEntry;
		});
		return;
	}
	const icon = iconFace;
	injected = slots.inject("sidebar.panellist", () => {
		disposeEntry = slots.register(
			{ name: "sidebar.panellist", id: PANEL_ID, order: 30, label: entryLabel, locale: localeNs },
			(props: { size?: number }) => h(icon, { size: props.size ?? 18 }),
		);
		return disposeEntry;
	});
}

/**
 * 接上 slots 并挂入口（每次 slots 注入都会重跑一遍，幂等）。
 * @param options - slots 面、行图标、词典默认名与命名空间。
 */
export function initSidebarEntry(options: {
	slots: SlotsFace;
	icon: ComponentType<{ size?: number }>;
	locale: string;
	defaultLabel: () => string;
}): void {
	slotsRef = options.slots;
	iconFace = options.icon;
	localeNs = options.locale;
	defaultLabel = options.defaultLabel;
	applyEntry();
}

/** 布局服务就位后注入：点「更多」那一行才能切到本面板。 */
export function setSidebarNavigator(fn: (id: string) => void): void {
	navigate = fn;
}

/**
 * 从 `GET /config` 取「显示名 / 入口位置」并重挂入口。
 * 读不到就维持当前外观（侧栏不能因为配置读失败而消失）。
 */
export async function refreshAppearance(): Promise<void> {
	try {
		const res = await fetchWithTimeout(`${API_PREFIX}/config`, { cache: "no-store" });
		const body = (await res.json()) as { ok?: unknown; config?: { displayName?: unknown; entryMode?: unknown } };
		if (body.ok !== true) return;
		const name = body.config?.displayName;
		customName = typeof name === "string" ? name.trim() : "";
		entryMode = body.config?.entryMode === "first" ? "first" : "more";
		applyEntry();
	} catch {
		/* 配置通道未就绪：保持默认外观，等设置页保存后再刷 */
	}
}
