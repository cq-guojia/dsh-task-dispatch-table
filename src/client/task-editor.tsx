// 浏览器侧：新建 / 编辑任务的**右侧分栏**（用户 2026-10-01 拍板形态，U21）：
// 占布局的分栏（把主窗口往左推窄），不再是从右边浮出来盖住页面的浮层。
// 2026-11-06：外壳改挂核心 `PanelDock`（与 U11 预览 dock 同一套分栏控件，核心支持同页双分栏）——
// 本文件只负责面板**内容**，拖拽 / 宽度记忆 / 收起 / `--dshpc-page-inset-right` 全部归核心。
//
// 2026-10-01 U21：
//   ① 头部「基本信息 / 执行记录」切换删除 ⇒ 编辑界面只管表单，不再展示执行记录
//      （执行记录归主面板自己的 tab）。
//   ② 「启用」开关从标题左边挪回头部**右侧、关闭 ✕ 的左边**（09-29 就是这个位置，
//      09-30 挪到左边，本轮依用户要求复位；此后再动先看这里）。
//
// 2026-09-29 用户返工轮（本文件形状的全部来由）：
//   ① 「启用」不再单占一行 ⇒ 移到头部右侧、关闭钮左边；选中色按用户要求改绿。
//   ② 次要说明进输入框的 placeholder，不再单独占行。
//   ③ 提示词区按参考图重排：大输入框 + **左下角选工作区 / 右下角选模型**；
//      右侧原来的「来源」文字 chip 行去掉，改成右上角**三项切换（手输 / 选择 / 上传）**
//      ——即原来挂「版本历史」的位置。
//   ④ 执行频率整段重做：照参考图 = 顶部「周期 / 间隔」两档；周期含单次/每天/每周/双周/每月/每年，
//      间隔 = 周几多选 + 每隔 N 单位执行一次。
//   ⑤ 原生 `<select>` / `<input type=datetime-local>` 全部换掉（前者是自绘箭头太贴边，
//      后者是浏览器原生控件、丑）：下拉改用**官方 `Menu`**，日期/时间改用自绘日历与时分列。
//
// P0 边界（分期见 docs/worklog/task-editor-ui.md §九）：只做界面与前端交互。
// **不接保存逻辑**（P2）、**不接工作区/模型数据面**（P1，未接时下拉显示空态，不塞假数据）、
// **不做版本历史**（P3）。

import { markdown } from "@codemirror/lang-markdown";
import { EditorView } from "@codemirror/view";
import {
	FileTypeIcon,
	IconChevronDownOutlineRegular,
	IconCloseOutlineRegular,
	IconFolderCloseRegular,
	IconFolderOpenOutlineRegular,
	IconPlanOutlineRegular,
	IconPlusOutlineRegular,
	MarkdownText,
	Switch,
	Tooltip,
} from "@deepseek-ai/dsh-client-ui-primitives";
import CodeMirror from "@uiw/react-codemirror";
import {
	type OfficeToPdfFace,
	pickWorkspaceFile,
} from "dsh-plugin-core/adv/explorer";
import { t as coreT } from "dsh-plugin-core/utils";
import type { ReactElement, ReactNode } from "react";
import {
	Fragment,
	createElement as h,
	useCallback,
	useEffect,
	useMemo,
	useRef,
	useState,
} from "react";
import {
	ALLOWED_ATTACHMENT_EXT,
	ATTACHMENT_MAX_BYTES,
	extOf,
	isSafeAttachmentRef,
} from "../attachment-allowlist.js";
// 表单控件一律走基础层 barrel；`./editor-fields` 只留文案单源与周几多选（W6：不再二次再导出）。
import {
	type WeekdayLabels,
	WeekdayPicker,
} from "./editor-fields";
import { formatDateTime, pad2 } from "./format";
import {
	interpolateTranslate,
	type LocaleKey,
	type Translate,
} from "./locales";
import { MD_LABELS } from "./md-labels";
// API 前缀唯一真源（M9；附件上传原先硬编码了一份、还多了个前导 `/`）。
import { API_PREFIX } from "./query";
import {
	renderSchedule,
	scheduleCron,
	scheduleSpecFromCron,
	scheduleSpecFromDraft,
} from "./schedule-text";
import { ensureTaskEditorStyle } from "./task-editor-css";
import { type TaskOverviewRow } from "./task-overview";
// 查看档正文（右侧栏「查看 / 编辑」两档的只读面，用户 2026-10-05）：纵向单栏 = 基础信息 → 提示词 → 上次执行。
// ⚠️ 它与本文件是「组件互相引用 + 类型单向依赖」：task-view 只 `import type` 本文件的草稿类型（编译期擦除）。
import { TaskViewPanel } from "./task-view";
import {
	CodeViewer,
	DateTimePicker,
	type DateTimeOutput,
	type EditorOption,
	FieldHint,
	FIELD_LABEL_STYLE,
	IconButton,
	ListRow,
	MarqueeText,
	ModelPicker,
	notify as coreNotify,
	NumberInput,
	Segmented,
	SectionHead,
	SelectField,
	Button,
	Chip,
	Checkbox,
	confirmModal,
	InputGroup,
	Modal,
	Surface,
	surfaceClass,
	Textarea,
	type PickerGroup,
} from "./ui";
// 工作区展示名（定义里存 id，界面显示当前标题）。
import { workspaceLabelOf } from "./workspace-options";

/**
 * 「?」说明钮 —— 核心 `FieldHint` 的薄包装（2026-11-06）。
 *
 * 图标、气泡、键盘焦点全部归核心；本仓只补 `insideClickable` 一种位置：挂在可点行
 * 里时，外面套一层 `span` 吞掉点击冒泡，免得点说明把行本身开关了。
 */
/** 「?」说明钮 —— 全站唯一实现（设置页每项标题右侧的小问号也用它，2026-10-08 导出复用）。 */
export function HelpButton(props: {
	hint: string;
	side?: "top" | "bottom";
	align?: "center" | "end";
	maxWidth?: number;
	insideClickable?: boolean;
}) {
	const {
		hint,
		side = "bottom",
		align,
		maxWidth = 300,
		insideClickable = false,
	} = props;
	const hintNode = h(FieldHint, {
		text: hint,
		side,
		maxWidth,
		...(align === undefined ? {} : { align }),
	});
	return insideClickable
		? h(
				"span",
				{
					style: { display: "inline-flex", minWidth: 0 },
					onClick: (event: { stopPropagation: () => void }) => {
						event.stopPropagation();
					},
				},
				hintNode,
			)
		: hintNode;
}

/** 与 index.ts 同形的 t 席位（本仓库 client 半侧惯例：无参 t；带占位符的文案走 tTemplate）。 */
type T = (key: LocaleKey) => string;

/**
 * 日期 + 时刻组合控件 —— 核心 `DateTimePicker`（单值 / 分钟精度）的薄包装。
 * 草稿里日期与时刻是两个字段，这里只在边界做换算：核心值 = `date + "T" + time`。
 */
function MomentField(props: {
	date: string;
	time: string;
	onChange: (date: string, time: string) => void;
	placeholder: string;
	ariaLabel: string;
}): ReactElement {
	const time = props.time === "" ? "00:00" : props.time;
	const value = props.date === "" ? null : `${props.date}T${time}:00.000`;
	return h(DateTimePicker, {
		mode: "single",
		precision: "minute",
		value,
		onChange: (next: DateTimeOutput) => {
			if (typeof next !== "string") return;
			props.onChange(next.slice(0, 10), next.slice(11, 16));
		},
		placeholder: props.placeholder,
		ariaLabel: props.ariaLabel,
		size: "lg",
	});
}

export type { EditorOption };

export type EditorMode = "create" | "edit";

/** 服务端历史版本条目（对应 `tasks/<id>/prompt-versions/<时间戳>.md`）。 */
export interface HistoryVersion {
	file: string;
	ts: string;
	note: string;
}
/** 服务端配置快照条目（对应 `tasks/<id>/snapshots/<时间戳>.json`，整份找回用）。 */
export interface HistorySnapshot {
	file: string;
	ts: string;
}
/** 编辑态历史面板的数据面（新建任务为 null）。 */
export interface EditorHistory {
	versions: HistoryVersion[];
	snapshots: HistorySnapshot[];
}

/** 提示词来源：手输（我们管版本）/ 选择工作区里的任务手册（只记路径）/ 上传 MD（我们管版本）。 */
export type PromptSource = "inline" | "manual" | "upload";

/** 附加文件（2026-09-29）：链接工作目录已有文件，或上传到插件数据目录。 */
export interface Attachment {
	/** 草稿内唯一 id（用于增删）。 */
	id: string;
	/** 展示名（上传原名 / 链接文件名）。 */
	name: string;
	/** 'link' = 链接工作区已有文件（只存路径，不复制）；'upload' = 已上传到插件数据目录（UID-序号. ext，不覆盖累加）。 */
	kind: "link" | "upload";
	/** link：**工作区相对**路径（宿主 zod 拒绝对路径 / `..` / 反斜杠；派发期按 workspace 绝对化）；upload：插件数据目录下的文件名。 */
	ref: string;
	/** 是否为目录（2026-10-09 起允许把整个文件夹当附件；选择器按 entry.type 透传）。 */
	isDir?: boolean;
	/**
	 * link：来源工作区 title（选择器现可浏览任意有历史会话的工作区，同一路径在不同工作区
	 * 指向不同文件 ⇒ 必须带上来源，P2 派发注入时按它把 ref 绝对化）。upload 无此字段。
	 */
	workspace?: string;
}

/** 提示词版本（2026-09-29）：每次保存快照，文件系统方案落库（P3 决策）。 */
export interface PromptVersion {
	/** 版本唯一 id。 */
	id: string;
	/** ISO 时间戳。 */
	ts: string;
	/** 该版本的提示词全文。 */
	content: string;
	/** 版本备注（可选）。 */
	note: string;
}

/** 排期三档（用户 2026-09-29：参考图是「周期 / 间隔」，周期里含「单次」）。 */
export type ScheduleKind = "periodic" | "interval";

/**
 * 周期档内的频率粒度。
 * 「每 N 周」（含双周）不靠 cron 的隔周位——cron 没有该位——而是由每周档的 `weekStep`
 * + 任务定义的 `start` 锚点 + 引擎取模实现（用户 2026-09-29）。隔月仍走「单数月 / 双数月」。
 */
export type PeriodFreq =
	| "once"
	| "daily"
	| "weekly"
	| "monthly"
	| "quarterly"
	| "yearly";

/** 每月档的月份口径：每月 / 单数月(1,3,5,7,9,11) / 双数月(2,4,6,8,10,12)——用来表达「隔月执行」。 */
export type MonthMode = "every" | "odd" | "even";

/** 间隔单位（只留 cron 能表达的两种；天/周的映射待 P2 定）。 */
export type IntervalUnit = "minute" | "hour";

/** 依赖语义：与宿主 schema 一致（决策 33 后只有这两种）。 */
export type DepSemantics = "same_period" | "latest_success";

export interface EditorDependency {
	task: string;
	semantics: DepSemantics;
}

/**
 * 前置任务可选项（= 现有任务表行，真数据）。`workspace` = 该任务定义 `target.workspace`
 * 的工作区 title ⇒ 表单里「先选工作区、再选任务」两级过滤（用户 2026-09-29）。
 * `enabled` = 任务启停开关：**停用（锁住）的任务同样可选**——用户 2026-09-29 拍板：
 * 发布任务只是「暂时不开它」，设置前置不受影响；下拉里显式标「（已停用）」让这件事看得见。
 */
export interface EditorTaskOption {
	id: string;
	label: string;
	workspace: string;
	enabled: boolean;
}

/**
 * Agent 权限档位（决策 50，用户 2026-09-29：照宿主新建会话的权限三档 + 默认档）。
 * `default` = 会话默认（沿用宿主新建会话时的权限设置，不额外约束）。
 * ⚠️ 与 src/tasks.ts 的同名类型**两处各写一份**：client bundle 不引 host 模块（构建双轨），
 * 改枚举务必两边同步。
 */
export type PermissionMode = "default" | "readOnly" | "workspace" | "full";

/**
 * 表单草稿：字段与 taskDefinitionSchema（src/tasks.ts:24-63）一一对应（`id` 不在表单里，
 * 只有高级区的 JSON 逃生口认得它）。排期在草稿里是**结构化**的（档 + 粒度 + 时刻），
 * 落到 cron / once 的映射归 P2 —— 本轮 `draftToDefinitionJson` 只做只读预览。
 */
export interface TaskEditorDraft {
	title: string;
	code: string;
	enabled: boolean;
	prompt: string;
	promptSource: PromptSource;
	/** 来源 = 选择文件时的路径（工作区内相对路径）。 */
	manualPath: string;
	workspace: string;
	/** 选中项的 id；`HostLlmModelInfo` 自带 provider ⇒ 一个下拉同时填 provider + model。 */
	model: string;
	/** 附加文件（链接 / 上传），见 {@link Attachment}。 */
	attachments: Attachment[];
	/** 提示词版本历史，见 {@link PromptVersion}。 */
	versions: PromptVersion[];
	/**
	 * 创建时间（**表单不管理**，只做原样透传，用户 2026-09-30）：编辑保存必须把它带回定义，
	 * 否则卡片「创建于 X」会消失。服务端更新时也会从原定义保留一份，这里是**双保险**。
	 */
	createdAt?: string;
	scheduleKind: ScheduleKind;
	periodFreq: PeriodFreq;
	/** 周一 = 1 … 周日 = 7（周期-每周/双周 与 间隔 共用）。 */
	weekdays: number[];
	/** 每月 / 每年第几日（1..31）。 */
	monthDay: string;
	/** 每月档的月份口径（每月 / 单数月 / 双数月）。 */
	monthMode: MonthMode;
	/** 每季度档：季度里的第几个月（1..3）。 */
	quarterMonth: string;
	/** 每年档：第几月（1..12）。 */
	yearMonth: string;
	intervalUnit: IntervalUnit;
	intervalStep: string;
	/** 每周档重复步长（周）：1=每周，2=每两周……上限 12（2026-11-08 由 4 放宽）。 */
	weekStep: string;
	/** 每天档重复步长（天）：1=每天，3=每 3 天……上限 999（用户 2026-11-08）。 */
	dayStep: string;
	/** `YYYY-MM-DD`（单次运行时刻 / 周期锚点「开始时间」）。 */
	date: string;
	/** `HH:mm`。 */
	time: string;
	window: string;
	maxAttempts: string;
	/** 保留字段（round-trip）：UI 已砍（用户：无意义），JSON 预览与任务定义照旧带 contract.validStatuses。 */
	validStatuses: string;
	/** 以 dsh 内置 /goal 开始执行（多轮续跑）；默认开（用户 2026-09-29），派发侧缺省一致。 */
	goalMode: boolean;
	/** 多 Agent 协作（决策 49，用户 2026-09-29）：默认关；派发侧缺宿主 Agent Teams 时降级单轮。 */
	agentTeam: boolean;
	/** Agent 权限档位（决策 50，用户 2026-09-29）：默认「会话默认」；宿主暂无按任务下发权限的接口，
	 *  所选档位经派发消息的约束指令执行。 */
	permission: PermissionMode;
	deps: EditorDependency[];
	/**
	 * 排期降级（编辑态反解不出结构化形态时）：**保留 JSON 里的原始 cron**，保存时原样写回
	 * ⇒ 手改过的 cron 不会被表单悄悄重写（不丢原值）。非空即代表「自定义 cron」态。
	 */
	customCron?: string;
}

const WEEKDAY_KEYS: LocaleKey[] = [
	"editorWeekday1",
	"editorWeekday2",
	"editorWeekday3",
	"editorWeekday4",
	"editorWeekday5",
	"editorWeekday6",
	"editorWeekday7",
];

/** 本地今天（真实时间）。 */
function todayIso(): string {
	const now = new Date();
	return `${now.getFullYear()}-${pad2(now.getMonth() + 1)}-${pad2(now.getDate())}`;
}

/**
 * 表单里的「日期 + 时刻」是否**已经过去**（缺值 / 解析不出也算过去 ⇒ 走智能默认）。
 * 用户在表单里填的是**宿主本地时间**（没有时区字段，见草稿注释）⇒ 这里也按本地解析，口径一致。
 */
function isPastMoment(date: string, time: string): boolean {
	const parsed = Date.parse(`${date}T${time}`);
	return !Number.isFinite(parsed) || parsed <= Date.now();
}

/**
 * **新建任务的智能默认时刻**（用户 2026-09-30）：`现在 + 1 小时` → 再**往上取整点**。
 * 例：22:10 → 23:10 → 次日 `00:00`；8:50 → 9:50 → `10:00`。正好落在整点就取它本身（提前量仍 ≥ 1 小时）。
 *
 * 目的：单次执行 / 间隔锚点**别默认落在过去** —— 原先写死「今天 09:00」，晚上新建时那个时刻早就过了
 * （用户真机点名）。周期档不参与：每天 / 每周… 本来就不挑「今天这一下」。
 */
function smartDefaultMoment(now: Date = new Date()): {
	date: string;
	time: string;
} {
	const target = new Date(now.getTime() + 3_600_000);
	if (
		target.getMinutes() !== 0 ||
		target.getSeconds() !== 0 ||
		target.getMilliseconds() !== 0
	) {
		target.setHours(target.getHours() + 1, 0, 0, 0);
	}
	return {
		date: `${target.getFullYear()}-${pad2(target.getMonth() + 1)}-${pad2(target.getDate())}`,
		time: `${pad2(target.getHours())}:${pad2(target.getMinutes())}`,
	};
}

/** 新建任务的初始草稿（与 task-template.jsonc 的推荐默认值同拍）。 */
export function emptyTaskDraft(): TaskEditorDraft {
	return {
		title: "",
		code: "",
		enabled: true,
		prompt: "",
		promptSource: "inline",
		manualPath: "",
		workspace: "",
		model: "",
		attachments: [],
		versions: [],
		scheduleKind: "periodic",
		periodFreq: "daily",
		// 星期默认**一到星期日全选**（用户 2026-09-29）。
		weekdays: [1, 2, 3, 4, 5, 6, 7],
		monthDay: "1",
		monthMode: "every",
		quarterMonth: "1",
		yearMonth: "1",
		intervalUnit: "hour",
		intervalStep: "1",
		weekStep: "1",
		dayStep: "1",
		date: todayIso(),
		time: "09:00",
		// 没有时区字段：**一律跟随宿主时区**（用户 2026-09-29：没人会去选标准时区，要算自己算）。
		window: "PT4H",
		maxAttempts: "1",
		validStatuses: "ok",
		goalMode: true,
		agentTeam: false,
		permission: "default",
		deps: [],
	};
}

// `scheduleCron`（草稿 → cron）已于 2026-10-05 迁至 [`./schedule-text.ts`](./schedule-text.ts)
//（与「排期 → 人话」同模块；查看档「预计下次执行」也从那里取，避免 task-view ↔ task-editor 运行时循环）。

/** 结构化排期（双写的 `schedule.ui`）：表单控件的原样留档，供下次编辑反解。 */
function structuredOf(draft: TaskEditorDraft): Record<string, unknown> {
	return {
		scheduleKind: draft.scheduleKind,
		periodFreq: draft.periodFreq,
		weekdays: [...draft.weekdays],
		monthDay: draft.monthDay,
		monthMode: draft.monthMode,
		quarterMonth: draft.quarterMonth,
		yearMonth: draft.yearMonth,
		intervalUnit: draft.intervalUnit,
		intervalStep: draft.intervalStep,
		weekStep: draft.weekStep,
		dayStep: draft.dayStep,
	};
}

/**
 * 草稿 → 任务定义 JSON（保存 / 预览同源）。
 * 排期**双写**（data-model §5.4）：`cron`/`once`/`start`/`everyNWeeks` 是执行真源，
 * `schedule.ui` 是编辑态反解真源；两者都由**表单**产出 ⇒ 保存以表单为准重写 cron
 * （用户手改坏了 JSON 里的 cron，保存时被覆盖，不会留个坏 cron 在库里）。
 *
 * ⚠️ 间隔档（每隔 N 分钟 / 小时）**必须产出 cron**——此前漏了 ⇒ 任务保存后
 * `scheduledSlotsFor` 取不到 cron、永不执行（评审 P2 / C1）。
 */
export function draftToDefinitionJson(draft: TaskEditorDraft): string {
	const schedule: Record<string, unknown> = { window: draft.window };
	const customCron =
		draft.customCron !== undefined ? draft.customCron.trim() : "";
	if (customCron !== "") {
		// 自定义 cron 降级态（编辑时反解不出来）：cron **原样写回**，且**不写 schedule.ui / start**——
		// 否则 ui 与 cron 相互矛盾，下次反解会被 ui 带偏、再保存把手写 cron 悄悄覆盖掉（评审 P1#6）。
		schedule.cron = customCron;
	} else if (draft.scheduleKind === "periodic" && draft.periodFreq === "once") {
		schedule.once = `${draft.date}T${draft.time}`;
	} else if (draft.scheduleKind === "periodic") {
		const cron = scheduleCron(draft);
		if (cron !== null) schedule.cron = cron;
		// 「任务开始时间」(date+time) 作为周期锚点：首跑下界 + 每 N 周取模参考（与频率区时刻对齐，避免跨周偏移）。
		schedule.start = `${draft.date}T${draft.time}`;
		const step = Number.parseInt(draft.weekStep, 10);
		if (draft.periodFreq === "weekly" && Number.isFinite(step) && step > 1)
			schedule.everyNWeeks = step;
		const dayStep = Number.parseInt(draft.dayStep, 10);
		if (draft.periodFreq === "daily" && Number.isFinite(dayStep) && dayStep > 1)
			schedule.everyNDays = dayStep;
		schedule.ui = structuredOf(draft);
	} else if (draft.scheduleKind === "interval") {
		// 间隔档：cron 必须由表单产出（`*/N * * * *` / `0 */N * * <dow>`），否则任务永不执行。
		const cron = scheduleCron(draft);
		if (cron !== null) schedule.cron = cron;
		schedule.start = `${draft.date}T${draft.time}`;
		schedule.ui = structuredOf(draft);
	}

	const target: Record<string, unknown> = {
		workspace: draft.workspace,
		goal: draft.goalMode,
		agentTeam: draft.agentTeam,
		permission: draft.permission,
	};
	if (draft.model.trim() !== "") {
		// 模型下拉的 value 形如 `provider/model`，写回时拆成成对的 provider + model（决策 22）。
		const slash = draft.model.indexOf("/");
		if (slash > 0) {
			target.provider = draft.model.slice(0, slash);
			target.model = draft.model.slice(slash + 1);
		} else target.model = draft.model;
	}
	if (draft.promptSource === "manual") {
		if (draft.manualPath.trim() !== "") target.manual = draft.manualPath.trim();
		target.prompt =
			draft.prompt.trim() === "" ? "按任务手册执行。" : draft.prompt;
	} else target.prompt = draft.prompt;

	const definition: Record<string, unknown> = {
		enabled: draft.enabled,
		schedule,
		target,
		contract: {
			validStatuses: draft.validStatuses
				.split(",")
				.map((item) => item.trim())
				.filter((item) => item !== ""),
		},
		retry: {
			maxAttempts:
				Number.parseInt(draft.maxAttempts, 10) > 0
					? Number.parseInt(draft.maxAttempts, 10)
					: 1,
		},
	};
	if (draft.title.trim() !== "") definition.title = draft.title.trim();
	if (draft.code.trim() !== "") definition.code = draft.code.trim();
	// 创建时间原样带回（表单不管理它，只透传）—— 用户 2026-09-30：编辑保存不能把「创建于」弄丢。
	if (draft.createdAt !== undefined && draft.createdAt !== "")
		definition.createdAt = draft.createdAt;
	if (draft.deps.length > 0)
		definition.depends_on = draft.deps.filter((dep) => dep.task !== "");
	if (draft.attachments.length > 0) definition.attachments = draft.attachments;
	return JSON.stringify(definition, null, 2);
}

/** 校验出的问题归属字段（决定哪个框描红）。 */
export type ErrorField =
	| "title"
	| "workspace"
	| "prompt"
	| "schedule"
	| "attachments";

/** 一条校验问题：归属字段 + 人话说明（用户 2026-09-30：逐项判断、逐框描红、文案说人话不啰嗦但讲清后果）。 */
export interface FieldProblem {
	field: ErrorField;
	message: string;
}

/**
 * 保存前的客户端校验（用户 2026-09-30：别把宿主那串机器码「任务定义不合法（target.workspace: Too small…）」
 * 直接甩给用户——先在本地把必填项 / 排期冲突查清楚、用人话列出来）。空数组 = 可保存。
 *
 * 必填判定严格对齐宿主 zod schema（src/tasks.ts）：`target.workspace` 与 `target.prompt` 都是 `.min(1)`，
 * 二者空了保存必被拒。`title` 在 schema 里是可选（空则回退 id）⇒ 不强制；提示词在「按任务手册」模式下由
 * `manual` 兜底默认句 ⇒ 也不空。排期则对齐 `scheduleCron`：每周没勾星期 / 间隔步长非法都产不出 cron ⇒ 永不执行。
 * 附件则对齐 schema 的 `ref` refine：link 型 ref 必须是**工作区相对路径**（不许绝对 / `..` / 反斜杠）。
 */
export function validateTaskDraft(
	draft: TaskEditorDraft,
	t: Translate,
	knownWorkspaces?: ReadonlySet<string>,
): FieldProblem[] {
	const problems: FieldProblem[] = [];
	// ⓪ 必填：任务名称（用户 2026-09-30 明确要求：列表里要靠名字认任务，不能空着保存）。
	if (draft.title.trim() === "") {
		problems.push({ field: "title", message: t("vTitleRequired") });
	}
	// ① 必填：工作区（target.workspace .min(1)）。
	if (draft.workspace.trim() === "") {
		problems.push({ field: "workspace", message: t("vWorkspaceRequired") });
	} else if (knownWorkspaces !== undefined && !knownWorkspaces.has(draft.workspace)) {
		// ①b 工作区必须**当前存在**（用户 2026-11-06）：只判非空会把「改名 / 删除后残留的旧值」
		// 放过；列表拿不到（降级）时不传该集合，交由服务端兜底。
		problems.push({ field: "workspace", message: t("vWorkspaceUnknown") });
	}
	// ② 必填：提示词（target.prompt .min(1)）；「按任务手册」模式由 manual 兜底，不在此查。
	if (draft.promptSource !== "manual" && draft.prompt.trim() === "") {
		problems.push({ field: "prompt", message: t("vPromptRequired") });
	}
	// ③ 排期冲突：产不出 cron 的组合（每周没勾星期 / 间隔步长非法）⇒ 任务永不执行。
	const step = Number.parseInt(draft.intervalStep, 10);
	if (
		draft.scheduleKind === "interval" &&
		(!Number.isFinite(step) || step <= 0)
	) {
		problems.push({ field: "schedule", message: t("vIntervalInvalid") });
	} else if (
		draft.scheduleKind === "periodic" &&
		draft.periodFreq === "weekly" &&
		draft.weekdays.length === 0
	) {
		problems.push({ field: "schedule", message: t("vWeekdayRequired") });
	}
	// ④ 附加文件：link 型 ref 必须**工作区相对**（宿主 zod：不许 `..` / 绝对路径 / 反斜杠）。
	//    ⚠️ 用户 2026-09-30 真机：选工作区文件曾把**绝对路径**当 ref 存 ⇒ 保存被 422 拒、且**无红框**、文案还是黑话。
	//    根因已在选择器修（回调改为工作区相对路径）；这里是**兜底** + 归属附件卡描红，防止再有非法 ref 写进来。
	const badAttachment = draft.attachments.find(
		(att) => !isSafeAttachmentRef(att.ref),
	);
	if (badAttachment !== undefined) {
		problems.push({
			field: "attachments",
			message: t("vAttachmentInvalid", { name: badAttachment.name }),
		});
	}
	return problems;
}

// ─────────────────────── 定义 → 草稿（编辑态反解，P1） ───────────────────────

/** 附件 / 草稿条目的本地 id（反解时补上定义里缺失的 id）。 */
function newAttachmentId(): string {
	return typeof crypto !== "undefined" && crypto.randomUUID !== undefined
		? crypto.randomUUID()
		: `a-${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`;
}

/**
 * 五段 cron → 表单字段；表达不了的组合返回 null（调用方降级为「自定义 cron」，不丢原值）。
 *
 * ⚠️ **解析唯一实现** = [`./schedule-text.ts`](./schedule-text.ts) 的 `scheduleSpecFromCron`
 * （2026-09-30 抽象收敛：此前列表文案与编辑器**各写一份反解**、严格度还不一致 ⇒
 * 同一个 cron 两处说法不一样，修 bug 还得两边分别修）。这里只做 spec → 表单字段的映射。
 */
function scheduleFromCron(
	cron: string,
	everyNWeeks: number | null,
	everyNDays: number | null,
): Partial<TaskEditorDraft> | null {
	const spec = scheduleSpecFromCron(cron, everyNWeeks, everyNDays);
	if (spec.kind === "custom" || spec.kind === "once") return null;
	const draft: Partial<TaskEditorDraft> =
		spec.kind === "interval"
			? {
					scheduleKind: "interval",
					intervalUnit: spec.intervalUnit,
					intervalStep: String(spec.intervalStep),
					weekdays: spec.weekdays,
				}
			: {
					scheduleKind: "periodic",
					periodFreq: spec.freq,
					weekdays: spec.weekdays,
					weekStep: String(spec.weekStep),
					dayStep: String(spec.dayStep),
				};
	if (spec.kind === "periodic") {
		if (spec.freq === "monthly") {
			draft.monthDay = spec.monthDay;
			// spec.monthMode 是宽泛 string（来自 cron / 老 `ui`）⇒ 收窄到表单三档，认不出回 'every'。
			draft.monthMode =
				spec.monthMode === "odd" || spec.monthMode === "even"
					? spec.monthMode
					: "every";
		}
		if (spec.freq === "quarterly") {
			draft.monthDay = spec.monthDay;
			draft.quarterMonth = spec.quarterMonth;
		}
		if (spec.freq === "yearly") {
			draft.monthDay = spec.monthDay;
			draft.yearMonth = spec.yearMonth;
		}
	}
	// ⚠️ 只有**周期档**才把 cron 的时分当执行时刻套用（那时分/时是具体数字）。间隔档的 cron 形如
	// `*/N …`，`spec.time` 是 `timeFromCron` 认不出时**编造**的 `09:00`——套上去会把 `start` 推导出的
	// 真实锚点（如 18:03）覆盖掉，保存即写回 `T09:00`，用户设的「18:03 起每 10 分钟」当场作废
	// （2026-09-30 复核发现的硬伤）。
	if (spec.kind === "periodic") draft.time = spec.time;
	return draft;
}

/**
 * 任务定义 → 表单草稿（编辑现有任务用）。
 * 排期反解优先级：`schedule.ui`（双写的结构化留档）> cron 尽力反解 > **自定义 cron 降级**
 * （保留原串，保存时原样写回 ⇒ 手改过的 cron 不会被悄悄重写）。
 */
export function definitionToDraft(
	definition: Record<string, unknown>,
): TaskEditorDraft {
	const base = emptyTaskDraft();
	const target = (definition.target ?? {}) as Record<string, unknown>;
	const schedule = (definition.schedule ?? {}) as Record<string, unknown>;
	const retry = (definition.retry ?? {}) as Record<string, unknown>;
	const contract = (definition.contract ?? {}) as Record<string, unknown>;

	const model =
		typeof target.provider === "string" && typeof target.model === "string"
			? `${target.provider}/${target.model}`
			: typeof target.model === "string"
				? target.model
				: "";

	const draft: TaskEditorDraft = {
		...base,
		title: typeof definition.title === "string" ? definition.title : "",
		code: typeof definition.code === "string" ? definition.code : "",
		enabled: definition.enabled !== false,
		prompt: typeof target.prompt === "string" ? target.prompt : "",
		workspace: typeof target.workspace === "string" ? target.workspace : "",
		model,
		permission: (typeof target.permission === "string"
			? target.permission
			: "default") as PermissionMode,
		goalMode: target.goal !== false,
		agentTeam: target.agentTeam === true,
		window: typeof schedule.window === "string" ? schedule.window : base.window,
		maxAttempts: String(
			typeof retry.maxAttempts === "number" ? retry.maxAttempts : 1,
		),
		validStatuses: Array.isArray(contract.validStatuses)
			? contract.validStatuses
					.filter((item): item is string => typeof item === "string")
					.join(",")
			: "ok",
		deps: Array.isArray(definition.depends_on)
			? definition.depends_on
					.filter(
						(item): item is { task: string; semantics: DepSemantics } =>
							item !== null &&
							typeof item === "object" &&
							typeof (item as { task?: unknown }).task === "string" &&
							((item as { semantics?: unknown }).semantics === "same_period" ||
								(item as { semantics?: unknown }).semantics ===
									"latest_success"),
					)
					.map((item) => ({ task: item.task, semantics: item.semantics }))
			: [],
		attachments: Array.isArray(definition.attachments)
			? definition.attachments
					.filter(
						(item): item is Attachment =>
							item !== null &&
							typeof item === "object" &&
							typeof (item as { name?: unknown }).name === "string" &&
							typeof (item as { ref?: unknown }).ref === "string" &&
							((item as { kind?: unknown }).kind === "link" ||
								(item as { kind?: unknown }).kind === "upload"),
					)
					.map((item) => ({
						id:
							typeof (item as { id?: unknown }).id === "string"
								? (item as { id: string }).id
								: newAttachmentId(),
						name: item.name,
						kind: item.kind,
						ref: item.ref,
						...(typeof (item as { workspace?: unknown }).workspace === "string"
							? { workspace: (item as { workspace: string }).workspace }
							: {}),
						...(typeof (item as { isDir?: unknown }).isDir === "boolean"
							? { isDir: (item as { isDir: boolean }).isDir }
							: {}),
					}))
			: [],
		versions: [],
		// 创建时间原样反解进草稿（表单不管理它，只透传）——保存时再写回，双保险防「创建于」消失。
		...(typeof definition.createdAt === "string" && definition.createdAt !== ""
			? { createdAt: definition.createdAt }
			: {}),
	};

	const start = typeof schedule.start === "string" ? schedule.start : "";
	const once = typeof schedule.once === "string" ? schedule.once : "";
	if (start.length >= 16) {
		draft.date = start.slice(0, 10);
		if (once === "") draft.time = start.slice(11, 16);
	}
	if (once !== "") {
		draft.scheduleKind = "periodic";
		draft.periodFreq = "once";
		draft.date = once.slice(0, 10);
		draft.time = once.slice(11, 16);
	} else {
		const ui = (
			typeof schedule.ui === "object" && schedule.ui !== null ? schedule.ui : {}
		) as Record<string, unknown>;
		if (Object.keys(ui).length > 0) {
			if (ui.scheduleKind === "interval" || ui.scheduleKind === "periodic")
				draft.scheduleKind = ui.scheduleKind as ScheduleKind;
			if (typeof ui.periodFreq === "string")
				draft.periodFreq = ui.periodFreq as PeriodFreq;
			if (Array.isArray(ui.weekdays))
				draft.weekdays = ui.weekdays.filter(
					(n): n is number => typeof n === "number",
				);
			if (typeof ui.monthDay === "string") draft.monthDay = ui.monthDay;
			if (
				ui.monthMode === "every" ||
				ui.monthMode === "odd" ||
				ui.monthMode === "even"
			)
				draft.monthMode = ui.monthMode;
			if (typeof ui.quarterMonth === "string")
				draft.quarterMonth = ui.quarterMonth;
			if (typeof ui.yearMonth === "string") draft.yearMonth = ui.yearMonth;
			if (ui.intervalUnit === "minute" || ui.intervalUnit === "hour")
				draft.intervalUnit = ui.intervalUnit;
			if (typeof ui.intervalStep === "string")
				draft.intervalStep = ui.intervalStep;
			if (typeof ui.weekStep === "string") draft.weekStep = ui.weekStep;
			if (typeof ui.dayStep === "string") draft.dayStep = ui.dayStep;
		} else {
			const cron = typeof schedule.cron === "string" ? schedule.cron : "";
			const nWeeks =
				typeof schedule.everyNWeeks === "number" ? schedule.everyNWeeks : null;
			const nDays =
				typeof schedule.everyNDays === "number" ? schedule.everyNDays : null;
			const parsed = cron === "" ? null : scheduleFromCron(cron, nWeeks, nDays);
			if (parsed !== null) Object.assign(draft, parsed);
			else if (cron !== "") draft.customCron = cron;
		}
	}
	const everyNWeeks =
		typeof schedule.everyNWeeks === "number" ? schedule.everyNWeeks : undefined;
	if (everyNWeeks !== undefined && everyNWeeks > 1)
		draft.weekStep = String(everyNWeeks);
	// 定义里的 `everyNDays` 才是真值（`ui` 可能被手改坏）⇒ 与周档同口径以定义覆盖。
	const everyNDays =
		typeof schedule.everyNDays === "number" ? schedule.everyNDays : undefined;
	if (everyNDays !== undefined && everyNDays > 1)
		draft.dayStep = String(everyNDays);
	return draft;
}

// ─────────────────────── 布局小件 ───────────────────────

/**
 * 前置标签输入框 —— 核心 `InputGroup` 的薄包装（2026-11-06 改接）。
 *
 * 用户 2026-09-29：「任务名称」别单独占一行，位置紧张 ⇒ 标签塞进框里、与输入框**同格**；
 * 这正是核心 `InputGroup.label` 的形态（同格灰底标题格），本仓不再自绘。
 */
function PrefixedInput(props: {
	prefix: string;
	value: string;
	placeholder: string;
	onChange: (next: string) => void;
	/** 校验不通过：描红边（明暗自适应，与卡片 / 下拉同源）。 */
	error?: boolean;
}): ReactElement {
	return h(InputGroup, {
		// 与同排卡片一致的高度档（核心默认 lg = 32）。
		size: "lg",
		label: props.prefix,
		value: props.value,
		placeholder: props.placeholder,
		error: props.error,
		"aria-label": props.prefix,
		onChange: props.onChange,
		// 撑满整行：InputGroup 根是 inline-flex（收缩盒），不指定宽度会缩到「标签 + 默认 input 宽」，
		// 比下面各张全宽卡片短一截（用户 2026-10-01 点名）。
		style: { width: "100%" },
	});
}

// ─────────────────────── 排期区 ───────────────────────

/** 周期档的子控件：内容行 = 频率 + 月/日 + 时间；星期恒定在下面一行。 */
function PeriodControls(props: {
	draft: TaskEditorDraft;
	patch: (part: Partial<TaskEditorDraft>) => void;
	freqOptions: EditorOption[];
	t: T;
	tt: (key: LocaleKey, params?: Record<string, string | number>) => string;
	weekdayLabels: WeekdayLabels;
}): ReactElement {
	const { draft, patch, t, tt, weekdayLabels } = props;
	const monthOptions: EditorOption[] = useMemo(
		() =>
			Array.from({ length: 12 }, (_, index) => ({
				value: String(index + 1),
				label: tt("editorMonthOption", { m: index + 1 }),
			})),
		[tt],
	);
	const dayOptions: EditorOption[] = useMemo(
		() =>
			Array.from({ length: 31 }, (_, index) => ({
				value: String(index + 1),
				label: tt("editorDayOption", { d: index + 1 }),
			})),
		[tt],
	);
	/** 每月档：每月 / 单数月 / 双数月（隔月执行就选单/双数月）。 */
	const monthModeOptions: EditorOption[] = useMemo(
		() => [
			{ value: "every", label: t("editorMonthEvery") },
			{ value: "odd", label: t("editorMonthOdd") },
			{ value: "even", label: t("editorMonthEven") },
		],
		[t],
	);
	/** 每季度档：季度里的第 1 / 2 / 3 个月。 */
	const quarterMonthOptions: EditorOption[] = useMemo(
		() =>
			[1, 2, 3].map((m) => ({
				value: String(m),
				label: tt("editorQuarterMonthOption", { m }),
			})),
		[tt],
	);

	// 单行说完：频率（+ 月 / 日 / 每 N 周）；单次档没有频率，整行就是「运行时刻 = 日期 + 时间」。
	// 周期档的时刻与「任务开始时间」共用下方那个核心日期+时间组合控件（2026-11-06），这里不再单放时分。
	const above: ReactNode[] = [];
	if (draft.periodFreq === "once") {
		above.push(
			h(MomentField, {
				key: "once-moment",
				date: draft.date,
				time: draft.time,
				onChange: (date, time) => {
					patch({ date, time });
				},
				placeholder: t("editorDatePh"),
				ariaLabel: t("editorDate"),
			}),
		);
	} else {
		above.push(
			h(SelectField, {
				key: "freq",
				value: draft.periodFreq,
				options: props.freqOptions,
				onChange: (value) => {
					patch({ periodFreq: value as PeriodFreq });
				},
				placeholder: t("editorFreqDaily"),
				emptyLabel: t("editorNoOptions"),
				ariaLabel: t("editorFreq"),
			}),
		);
		if (draft.periodFreq === "monthly") {
			above.push(
				h(SelectField, {
					key: "month-mode",
					value: draft.monthMode,
					options: monthModeOptions,
					onChange: (value) => {
						patch({ monthMode: value as MonthMode });
					},
					placeholder: t("editorMonthEvery"),
					emptyLabel: t("editorNoOptions"),
					ariaLabel: t("editorMonth"),
				}),
			);
		}
		if (draft.periodFreq === "yearly") {
			above.push(
				h(SelectField, {
					key: "month",
					value: draft.yearMonth,
					options: monthOptions,
					onChange: (value) => {
						patch({ yearMonth: value });
					},
					placeholder: t("editorMonth"),
					emptyLabel: t("editorNoOptions"),
					ariaLabel: t("editorMonth"),
				}),
			);
		}
		if (draft.periodFreq === "quarterly") {
			above.push(
				h(SelectField, {
					key: "quarter-month",
					value: draft.quarterMonth,
					options: quarterMonthOptions,
					onChange: (value) => {
						patch({ quarterMonth: value });
					},
					placeholder: quarterMonthOptions[0]?.label ?? t("editorMonth"),
					emptyLabel: t("editorNoOptions"),
					ariaLabel: t("editorMonth"),
				}),
			);
		}
		if (
			draft.periodFreq === "monthly" ||
			draft.periodFreq === "quarterly" ||
			draft.periodFreq === "yearly"
		) {
			above.push(
				h(SelectField, {
					key: "day",
					value: draft.monthDay,
					options: dayOptions,
					onChange: (value) => {
						patch({ monthDay: value });
					},
					placeholder: t("editorDayOfMonth"),
					emptyLabel: t("editorNoOptions"),
					ariaLabel: t("editorDayOfMonth"),
				}),
			);
		}
		// 每天档：每 N 天（步进框，1–999，用户 2026-11-08）。
		if (draft.periodFreq === "daily") {
			above.push(
				h(NumberInput, {
					key: "day-step",
					// 核心默认 sm(24)，显式 lg(32) —— 与同排「频率」下拉同档。
					size: "lg",
					value: Number.parseInt(draft.dayStep, 10) || 1,
					min: 1,
					max: 999,
					suffix: t("unitDays"),
					label: tt("editorSchedEveryNDay", { n: 1 }),
					onChange: (value) => {
						patch({ dayStep: String(value) });
					},
				}),
			);
		}
		// 每周档：每 N 周（步进框，1–12；原来 1–4 ⇒「每 5 周」设不出来，2026-11-08 放宽）。
		if (draft.periodFreq === "weekly") {
			above.push(
				h(NumberInput, {
					key: "week-step",
					size: "lg",
					value: Number.parseInt(draft.weekStep, 10) || 1,
					min: 1,
					max: 12,
					suffix: t("unitWeeks"),
					label: tt("editorEveryNWeeks", { n: 1 }),
					onChange: (value) => {
						patch({ weekStep: String(value) });
					},
				}),
			);
		}
	}
	// 时刻已并入「任务开始时间」的核心组合控件；周期档此处只剩频率相关控件。

	return h(
		"div",
		{ style: { display: "flex", flexDirection: "column", gap: "10px" } },
		h("div", { className: "dsh-tdt-ed-row" }, above),
		draft.periodFreq === "weekly"
			? h(WeekdayPicker, {
					value: draft.weekdays,
					onChange: (value) => {
						patch({ weekdays: value });
					},
					labels: weekdayLabels,
					label: t("editorWeekdayLabel"),
				})
			: null,
		draft.periodFreq === "once"
			? h("p", { className: "dsh-tdt-ed-hint" }, t("editorOnceHint"))
			: null,
	);
}

/** 间隔档的子控件（照参考图：每隔 N 单位执行一次 + 周几筛选）。 */
function IntervalControls(props: {
	draft: TaskEditorDraft;
	patch: (part: Partial<TaskEditorDraft>) => void;
	t: T;
	weekdayLabels: WeekdayLabels;
}): ReactElement {
	const { draft, patch, t, weekdayLabels } = props;
	const unitOptions: EditorOption[] = [
		{ value: "minute", label: t("unitMinutes") },
		{ value: "hour", label: t("unitHours") },
	];
	return h(
		"div",
		{ style: { display: "flex", flexDirection: "column", gap: "8px" } },
		// 一行说完：每隔 [1] [小时] 执行一次（照参考图的写法，不再拆成标签列）。
		h(
			"div",
			{ className: "dsh-tdt-ed-row" },
			h(
				"span",
				{
					style: { fontSize: "var(--dshpc-font-md)", color: "var(--dshpc-fg)" },
				},
				t("editorIntervalEvery"),
			),
			h(NumberInput, {
				// 核心默认 sm(24)，显式 lg(32) —— 与同排「小时 / 分钟」下拉同档。
				size: "lg",
				value: Number.parseInt(draft.intervalStep, 10) || 1,
				min: 1,
				step: 1,
				label: t("editorIntervalStep"),
				onChange: (n: number) => {
					patch({ intervalStep: String(n) });
				},
			}),
			h(SelectField, {
				value: draft.intervalUnit,
				options: unitOptions,
				onChange: (value) => {
					patch({ intervalUnit: value as IntervalUnit });
				},
				placeholder: t("unitHours"),
				emptyLabel: t("editorNoOptions"),
				ariaLabel: t("editorIntervalUnit"),
				width: 96,
			}),
			h(
				"span",
				{
					style: { fontSize: "var(--dshpc-font-md)", color: "var(--dshpc-fg)" },
				},
				t("editorIntervalSuffix"),
			),
		),
		h(WeekdayPicker, {
			value: draft.weekdays,
			onChange: (value) => {
				patch({ weekdays: value });
			},
			labels: weekdayLabels,
			label: t("editorWeekdayLabel"),
		}),
	);
}

// ─────────────────────── 弹窗本体 ───────────────────────

/**
 * 主面板的最小宽度（≥1120 的列永远不被压到出横向滚动条）。
 * 2026-11-06 起交给核心 `PanelDock` 的 `mainMinWidth`：分栏宽度 / 拖拽 / 记忆 / 让位变量全部归核心，
 * 本仓不再自己算宽度上下限（旧 `clampEditorWidth` / `readEditorWidth` / `writeEditorWidth` 已删）。
 */
export const PAGE_MIN_WIDTH = 760;

/**
 * 提示词卡底部三下拉的**定宽**（用户 2026-10-02）：
 * 以「权限」为基准 120px，工作区 / 模型 = 1.5 倍 = 180px。
 * 不再按选项文字自适应宽度——那样换一个选项宽度就变一下（先各自撑到上限、三个都长才开始挤），
 * 观感一直在跳；用户很清楚自己选的工作区和模型，显示不下就省略号（MarqueeText 悬停可读全名）。
 * 2026-11-07：分栏拉大时跟着父宽变宽、各自封顶；`clamp` 下限就是原来的定宽 ⇒ 默认观感不变。
 * ⚠️ 核心 `Picker.resolveTriggerSizing` 一收到 `width` 就把 width / minWidth / maxWidth 全设为它，
 *    所以「下限 + 弹性 + 上限」必须写进**这一个** CSS 表达式，另传 maxWidth 会被忽略。
 */
const PROMPT_SELECT_BASE = "clamp(120px, 14%, 200px)";
const PROMPT_SELECT_WIDE = "clamp(180px, 22%, 300px)";

/**
 * 模型下拉的分组数据（`ModelPicker` 的 `groups` 口径：一组 = 一个供应商）。
 * 候选来自 `/options`（真实目录）；不在目录里的旧值补一组「当前」，
 * 否则编辑老任务时看不见自己配的模型（值没丢，只是别处选了它）。
 */
function modelGroupsOf(
	models: readonly EditorOption[],
	current: string,
): PickerGroup[] {
	const byProvider = new Map<string, PickerGroup>();
	for (const model of models) {
		if (model.value === "") continue;
		const slash = model.value.indexOf("/");
		const provider = slash < 0 ? "" : model.value.slice(0, slash);
		// label 由服务端拼成 `名称（供应商）`；分组后组头已经是供应商，去掉重复尾缀。
		const label =
			provider === ""
				? model.label
				: model.label.replace(`（${provider}）`, "");
		const group = byProvider.get(provider);
		if (group === undefined)
			byProvider.set(provider, {
				value: provider,
				label: provider,
				options: [{ value: model.value, label }],
			});
		else group.options.push({ value: model.value, label });
	}
	const groups = [...byProvider.values()];
	if (
		current !== "" &&
		!groups.some((group) =>
			group.options.some((option) => option.value === current),
		)
	) {
		groups.push({
			value: "__current",
			label: "",
			options: [{ value: current, label: current }],
		});
	}
	return groups;
}

/** 版本条目时间（tooltip / 行内）：`YYYY-MM-DD HH:mm`。 */
const formatVersionTime = (iso: string): string => formatDateTime(iso);

/**
 * 键序稳定的 JSON 序列化（脏判定专用）：草稿永远是 `{...draft, ...part}` 摊开出来的，
 * 键序本来就不会变，但这里仍按键名排序，保证「值相同 ⇒ 串相同」与历史无关——
 * 「1 改成 2 再改回 1」比较结果与最初一致，不算改过（用户 2026-09-29 的判定口径）。
 */
function stableStringify(value: unknown): string {
	if (value === null || typeof value !== "object")
		return JSON.stringify(value) ?? "undefined";
	if (Array.isArray(value))
		return `[${value.map((item) => stableStringify(item)).join(",")}]`;
	const record = value as Record<string, unknown>;
	return `{${Object.keys(record)
		.sort()
		.map((key) => `${JSON.stringify(key)}:${stableStringify(record[key])}`)
		.join(",")}}`;
}

/**
 * 全屏提示词编辑器：编辑态用 CodeMirror 6（@uiw/react-codemirror + @codemirror/lang-markdown）
 * 提供语法高亮 + 行号；预览态复用官方 MarkdownText（GFM + KaTeX，主题与宿主一致）。
 * 右侧版本历史（保存 / 回滚）保留；编辑 / 预览切换在顶部（复用任务编辑器 tab 样式）。
 */
// CodeMirror 主题：背景 / 文字 / 行号全部走 `--dshpc-*` token，明暗自适应；
// 编辑器本身只负责「带语法高亮的纯文本」（gzip ~60KB，且仅在全屏编辑时才加载）。
const promptEditorTheme = EditorView.theme(
	{
		"&": {
			backgroundColor: "var(--dshpc-surface-base, #22252a)",
			color: "var(--dshpc-fg)",
			height: "100%",
			width: "100%",
		},
		".cm-editor": {
			height: "100%",
			width: "100%",
			backgroundColor: "var(--dshpc-surface-base, #22252a)",
		},
		// 软折行：长行自动换行，不出现横向滚动条（编辑器随列宽收缩也跟着重折）。
		".cm-scroller": {
			fontFamily: "ui-monospace, SFMono-Regular, Menlo, Consolas, monospace",
			fontSize: "var(--dshpc-font-md)",
			lineHeight: "1.6",
			overflowX: "hidden",
		},
		".cm-content": { width: "100%" },
		".cm-line": { padding: "0 4px" },
		".cm-gutters": {
			backgroundColor: "var(--dshpc-surface-1, rgba(128,128,128,0.08))",
			color: "var(--dshpc-fg-2)",
			border: "none",
		},
		".cm-activeLine": {
			backgroundColor: "var(--dshpc-hover, rgba(128,128,128,0.16))",
		},
		".cm-activeLineGutter": {
			backgroundColor: "transparent",
			color: "var(--dshpc-fg)",
		},
		"&.cm-focused": { outline: "none" },
	},
	{ dark: true },
);

/**
 * 高危确认框（「完全权限」保存）：**核心 `Modal` + 核心 `Checkbox`**（2026-11-06）。
 * 普通确认一律走核心命令式 `confirmModal`；只有这张需要「勾选风险」才留在组件内。
 * 标题染警告橙；勾选前置灰确认钮 —— 逐条保留 2026-09-30 的交互口径，只换外壳。
 */
function ConfirmDialog(props: {
	t: T;
	title: string;
	desc: string;
	/** 结构化圆点清单（用户 2026-09-30：正文别糊成一坨——说明是说明、条目是条目，层级拉开）。 */
	bullets?: readonly string[];
	confirmLabel?: string;
	cancelLabel?: string;
	/** 标题染警告橙（高危确认，如「完全权限」保存确认）。 */
	warning?: boolean;
	/** 勾选确认：提供时确认钮在勾选前置灰（用户 2026-09-30：完全权限保存前须打勾）。 */
	checkbox?: {
		label: string;
		checked: boolean;
		onToggle: (next: boolean) => void;
	};
	onCancel: () => void;
	onConfirm: () => void;
}): ReactNode {
	const needAck = props.checkbox !== undefined;
	const acked = needAck && props.checkbox?.checked === true;
	return h(
		Modal,
		{
			size: "sm",
			title: props.warning === true
				? h("span", { style: { color: "var(--dshpc-warning)" } }, props.title)
				: props.title,
			onClose: props.onCancel,
			closeOnMask: false,
			footer: h(
				"div",
				{ style: { display: "flex", justifyContent: "flex-end", gap: "8px" } },
				h(
					Button,
					{ variant: "outline", size: "sm", onClick: props.onCancel },
					props.cancelLabel ?? props.t("editorCancel"),
				),
				h(
					Button,
					{
						variant: "primary",
						size: "sm",
						disabled: needAck && !acked,
						onClick: props.onConfirm,
					},
					props.confirmLabel ?? props.t("editorConfirm"),
				),
			),
		},
		props.desc !== ""
			? h(
					"div",
					{
						style: {
							fontSize: "var(--dshpc-font-md)",
							lineHeight: "var(--dshpc-line-md)",
							color: "var(--dshpc-fg-2)",
							marginBottom: props.bullets !== undefined ? "8px" : "0",
						},
					},
					props.desc,
				)
			: null,
		props.bullets !== undefined && props.bullets.length > 0
			? h(
					Surface,
					{
						tone: "subtle",
						border: "none",
						radius: "md",
						padding: "sm",
						style: { marginBottom: "14px" },
					},
					h(
						"ul",
						{
							style: {
								listStyle: "none",
								margin: 0,
								padding: 0,
								display: "flex",
								flexDirection: "column",
								gap: "6px",
							},
						},
						...props.bullets.map((b) =>
						h(
							"li",
							{
								key: b,
								style: {
									fontSize: "var(--dshpc-font-md)",
									lineHeight: "var(--dshpc-line-md)",
									display: "flex",
									gap: "8px",
								},
							},
							h("span", {
								style: {
									flex: "none",
									width: "5px",
									height: "5px",
									borderRadius: "50%",
									background: "var(--dshpc-fg-3,rgba(128,128,128,.8))",
									margin: "7px 0 0",
								},
							}),
							h("span", null, b),
						),
					),
				),
			)
			: null,
		needAck
			? h(Checkbox, {
					checked: props.checkbox?.checked === true,
					label: props.checkbox?.label,
					accentColor: "var(--dshpc-warning)",
					onChange: (next: boolean) => {
						props.checkbox?.onToggle(next);
					},
				})
			: null,
	);
}

function PromptEditorModal(props: {
	t: T;
	/** 抽屉模式：'create' = 新建（标签叫「历史版本」且暂无可查版本）；'edit' = 编辑（标签「版本历史」）。 */
	mode: EditorMode;
	value: string;
	/** 服务端真历史（`tasks/<id>/prompt-versions` 与 `snapshots`）；新建态为 null。 */
	history: EditorHistory | null;
	onChange: (value: string) => void;
	onClose: () => void;
	/** 只找回提示词（把该版本内容填进编辑器）。 */
	onRestoreVersion: (file: string) => void;
	/** 删除某个版本（用户自己删；系统从不自动删）。 */
	onDeleteVersion: (file: string) => void;
	/**
	 * 只读查看（r12 查看档「全屏查看」）：源码 / 预览两态、**默认预览**，无编辑、无保存、无版本面板
	 * —— 等同展示一个 MD 文件。不给或 false = 编辑器本体（原行为）。
	 */
	readonly?: boolean;
}): ReactNode {
	const {
		t,
		mode: editorMode,
		value,
		history,
		onChange,
		onClose,
		onRestoreVersion,
		onDeleteVersion,
		readonly,
	} = props;
	// 编辑器扩展固定引用：markdown 高亮 + 软折行（长行自动换行，宽度失控/横向滚动的根源在此）。
	const cmExtensions = useMemo(() => [markdown(), EditorView.lineWrapping], []);
	const [mode, setMode] = useState<"edit" | "preview">(
		readonly === true ? "preview" : "edit",
	);
	const [showVersions, setShowVersions] = useState(false);
	const versions = history?.versions ?? [];
	const [hoveredId, setHoveredId] = useState<string | null>(null);

	/** 删除某个版本：核心命令式确认框（不再自绘内联层）。 */
	const askDeleteVersion = (file: string): void => {
		void confirmModal({
			title: t("editorConfirmDeleteTitle"),
			message: t("editorConfirmDeleteDesc"),
			tone: "danger",
			confirmText: t("editorDeleteVersion"),
			cancelText: t("editorCancel"),
		}).then((ok) => {
			if (ok) onDeleteVersion(file);
		});
	};
	/** 找回某个版本：同上。 */
	const askUseVersion = (file: string): void => {
		void confirmModal({
			title: t("editorRestorePromptTitle"),
			message: t("editorRestorePromptDesc"),
			confirmText: t("editorUseVersion"),
			cancelText: t("editorCancel"),
		}).then((ok) => {
			if (ok) onRestoreVersion(file);
		});
	};

	const versionTitle =
		editorMode === "create" ? t("editorHistoryVersions") : t("editorVersions");

	return h(
		"div",
		{
			style: {
				display: "flex",
				flexDirection: "column",
				flex: "1 1 auto",
				minHeight: 0,
				background: "var(--dshpc-surface-base, #22252a)",
				color: "var(--dshpc-fg)",
				overflow: "hidden",
				position: "relative",
			},
		},
		h(
			"div",
			{
				style: {
					display: "flex",
					alignItems: "center",
					justifyContent: "space-between",
					gap: "12px",
					padding: "10px 14px",
					borderBottom: `1px solid var(--dshpc-border)`,
				},
			},
			h(
				"span",
				{ style: { fontSize: "var(--dshpc-font-lg)", fontWeight: 600 } },
				t("editorPromptEditorTitle"),
			),
			h(
				"div",
				{ style: { display: "flex", alignItems: "center", gap: "8px" } },
				h(Segmented, {
					id: "dsh-tdt-ed-prompt-mode",
					value: mode,
					size: "md",
					bordered: false,
					tone: "business",
					items: [
						{ value: "edit", label: t("editorModeEdit") },
						{ value: "preview", label: t("editorModePreview") },
					],
					onChange: (next: string) => {
						setMode(next as "edit" | "preview");
					},
					label: t("editorPromptEditorTitle"),
				}),
				// 版本开关（2026-10-01：并入统一 Segmented——multiple 单段做 on/off，根 id 保留 dsh-tdt-ed-histtoggle
				// 供冒烟/锚点使用；样式走灰底变体 inset，即「版本」观感本身）。只读查看（r12）不出现。
				readonly === true
					? null
					: h(Segmented, {
							id: "dsh-tdt-ed-histtoggle",
							size: "md",
							bordered: false,
							tone: "business",
							multiple: true,
							value: showVersions ? ["on"] : [],
							items: [{ value: "on", label: t("editorVersionToggle") }],
							onChange: (next: string[]) => {
								setShowVersions(next.includes("on"));
							},
							label: versionTitle,
						}),
				h(
					Button,
					{ variant: "ghost", size: "sm", onClick: onClose },
					t("editorClose"),
				),
			),
		),
		// minWidth:0 ⇒ 编辑态长内容时编辑器自行横向滚动，固定 232px 的版本面板不再被挤掉。
		h(
			"div",
			{
				style: { flex: "1 1 auto", display: "flex", minHeight: 0, minWidth: 0 },
			},
			mode === "edit"
				? h(
						"div",
						{
							style: {
								flex: "1 1 auto",
								display: "flex",
								minHeight: 0,
								minWidth: 0,
							},
						},
						h(CodeMirror, {
							value,
							onChange: (next: string) => {
								onChange(next);
							},
							extensions: cmExtensions,
							theme: promptEditorTheme,
							height: "100%",
							// 只读查看（r12 查看档「全屏查看」的源码态）：同编辑器观感，但不可改、不聚焦。
							editable: readonly !== true,
							basicSetup: {
								lineNumbers: true,
								foldGutter: false,
								highlightActiveLine: true,
								autocompletion: false,
								searchKeymap: false,
							},
							// 每次切回编辑（CodeMirror 重新挂载）即聚焦，免去手动点一下（只读态不聚焦）。
							onCreateEditor:
								readonly === true
									? undefined
									: (view: EditorView) => {
											view.focus();
										},
						} as never),
					)
				: h(
						"div",
						{
							className: "dshpc-scroll-thin",
							style: {
								flex: "1 1 auto",
								minWidth: 0,
								overflow: "auto",
								padding: "14px 18px",
							},
						},
						h(MarkdownText, { text: value, labels: MD_LABELS }),
					),
			showVersions
				? // 面板缩窄（用户 2026-09-30：固定 280 太占地方）= 232px：够放日期 + hover 两个小钮，左栏多让 48px。
					h(
						"div",
						{
							style: {
								flex: "0 0 232px",
								borderLeft: `1px solid var(--dshpc-border-heavy)`,
								display: "flex",
								flexDirection: "column",
								minHeight: 0,
							},
						},
						h(
							"div",
							{
								style: {
									padding: "10px 12px",
									borderBottom: `1px solid var(--dshpc-border-heavy)`,
									fontSize: "var(--dshpc-font-md)",
									fontWeight: 600,
								},
							},
							versionTitle,
						),
						editorMode === "create"
							? h(
									"div",
									{
										style: {
															fontSize: "var(--dshpc-font-sm)",
											color: "var(--dshpc-fg-2)",
											lineHeight: "1.6",
										},
									},
									t("editorNewTaskNoVersions"),
								)
							: h(
									"div",
									{
										className: "dshpc-scroll-thin",
										style: {
											display: "flex",
											flexDirection: "column",
											minHeight: 0,
											overflow: "auto",
										},
									},
									versions.length === 0
										? h(
												"p",
												{
													style: {
														padding: "0 12px",
														fontSize: "var(--dshpc-font-sm)",
														color: "var(--dshpc-fg-2)",
													},
												},
												t("editorNoVersions"),
											)
										: h(
												"ul",
												{
													style: {
														listStyle: "none",
														margin: 0,
														padding: "0 0 8px",
														overflow: "auto",
													},
												},
												versions.map((v) =>
													h(
														"li",
														{
															key: v.file,
															className: "dsh-tdt-ed-ver",
															onMouseEnter: () => {
																setHoveredId(v.file);
															},
															onMouseLeave: () => {
																setHoveredId((cur) =>
																	cur === v.file ? null : cur,
																);
															},
														},
														// 行首小尖括号（用户 2026-09-30：弃时钟，用右指小角标）。
														h(
															"span",
															{
																className: "dsh-tdt-ed-ver-ic",
																style: { transform: "rotate(-90deg)" },
															},
															h(IconChevronDownOutlineRegular, { size: 12 }),
														),
														// 左边 = **版本日期**（用户点名：左边正常显示日期，别挪去右边）；有备注补一行小字。
														h(
															"span",
															{ className: "dsh-tdt-ed-ver-main" },
															h(MarqueeText, { text: formatVersionTime(v.ts) }),
															v.note !== ""
																? h(
																		"span",
																		{ className: "dsh-tdt-ed-ver-note" },
																		v.note,
																	)
																: null,
														),
														// 右侧固定槽（宽高恒定 ⇒ hover 出按钮绝不撑高行高）：常态空，hover 出「使用 / ×」。
														h(
															"span",
															{ className: "dsh-tdt-ed-ver-right" },
															hoveredId === v.file
																? h(
																		"span",
																		{ className: "dsh-tdt-ed-ver-actions" },
																		h(
																			Button,
																			{
																				variant: "link",
																				size: "sm",
																				onClick: () => {
																					askUseVersion(v.file);
																				},
																			},
																			t("editorUseShort"),
																		),
																		h(
																			Tooltip,
																				{ label: t("editorDeleteVersion"), side: "top" },
																			h(IconButton, {
																				variant: "danger",
																				size: "sm",
																				icon: h(IconCloseOutlineRegular, {
																					size: 12,
																				}),
																				label: t("editorDeleteVersion"),
																				onClick: () => {
																					askDeleteVersion(v.file);
																				},
																			}),
																		),
																	)
																: null,
														),
													),
												),
											),
								),
					)
				: null,
		),
	);
}

/**
 * 配置预览面板（用户 2026-09-29 定稿）：与「编辑提示词」一样大的右侧面板，覆盖拉篮区域；
 * 只读展示当前配置生成的任务定义 JSON——用 CodeViewer（只读 CodeMirror 6：行号 + 语法着色 + 右上角官方复制图标），
 * 面板按钮只有「关闭」（复制由 CodeViewer 复制钮承担），不允许修改。
 */
function ConfigPreviewPanel(props: {
	t: T;
	json: string;
	onClose: () => void;
}): ReactNode {
	const { t, json, onClose } = props;
	return h(
		"div",
		{
			style: {
				display: "flex",
				flexDirection: "column",
				flex: "1 1 auto",
				minHeight: 0,
				background: "var(--dshpc-surface-base, #22252a)",
				color: "var(--dshpc-fg)",
				overflow: "hidden",
				position: "relative",
			},
		},
		h(
			"div",
			{
				style: {
					display: "flex",
					alignItems: "center",
					justifyContent: "space-between",
					gap: "12px",
					padding: "10px 14px",
					borderBottom: `1px solid var(--dshpc-border)`,
				},
			},
			h(
				"span",
				{ style: { fontSize: "var(--dshpc-font-lg)", fontWeight: 600 } },
				t("editorPreview"),
			),
			h(
				Button,
				{ variant: "ghost", size: "sm", onClick: onClose },
				t("editorClose"),
			),
		),
		h(
			"div",
			{
				style: {
					flex: "1 1 auto",
					minWidth: 0,
					minHeight: 0,
					overflow: "hidden",
				},
			},
			h(CodeViewer, { text: json, path: "task-definition.json", t: coreT }),
		),
	);
}

/**
 * 新建 / 编辑任务弹窗：右侧贴边、上下顶满、左缘可拖拽、**浮层盖在整页之上**（不推压页面）。
 */
export function TaskEditorDrawer(props: {
	t: T;
	mode: EditorMode;
	draft: TaskEditorDraft;
	onChange: (next: TaskEditorDraft) => void;
	/** 工作区列表（P1 接真数据；空 ⇒ 下拉显示空态）。 */
	workspaces: EditorOption[];
	/** 模型列表（P1 接真数据；空 ⇒ 下拉显示空态）。 */
	models: EditorOption[];

	/** 可选的前置任务（= 现有任务表，真数据，带所属工作区）。 */
	tasks: EditorTaskOption[];
	/** 当前正在编辑的任务 id（编辑态有；新建态无）。用于在前置列表里**排除自己**（防止自我依赖）。 */
	currentTaskId?: string;
	onClose: () => void;
	/** 保存回调（新增 / 修改都走它）。未接时点「保存」只提示待接。 */
	onSave?: ((draft: TaskEditorDraft) => void) | undefined;
	/** 删除任务（仅编辑态有按钮）；未接时不显示按钮。 */
	onDelete?: (() => void) | undefined;
	/** 保存失败原因（服务端文案），由外部回传展示。 */
	saveError?: string | null;
	/** 服务端历史（版本 + 快照）；编辑态由外部拉取后传入。 */
	history?: EditorHistory | null;
	/** 只找回提示词（外部取内容后回填表单）。 */
	onRestoreVersion?: ((file: string) => void) | undefined;
	/** 删除某个历史版本。 */
	onDeleteVersion?: ((file: string) => void) | undefined;
	/** 启用开关实时写回（编辑态）：null = 成功，否则返回人话错误。新建态不接（统一保存时建）。 */
	onToggleEnabled?: ((enabled: boolean) => Promise<string | null>) | undefined;
	/** 共享任务列表 store（只读其 `rows`）：左列表拨片 → 右抽屉联动用（2026-10-05）。 */
	overview?: { readonly rows: readonly TaskOverviewRow[] };
	/** 本抽屉对应任务 id（从 overview.rows 定位该行）；左列表拨片靠它把 enabled 同步进草稿。 */
	syncTaskId?: string;
	/**
	 * 打开时的**默认档**（2026-10-05）：卡片「编辑」与「＋ 新建任务」= `'edit'`；
	 * 从卡片展开区「前置任务」行点任务名进来 = `'view'`（只读人话视图）。
	 */
	initialView?: "view" | "edit";
	/**
	 * 脏状态上报（外部只**观察**、不重算）：用来判「有未保存的修改时要去查看另一个任务」。
	 * 脏判定真源仍在本组件（`initialDraftRef` + `stableStringify`），外部不得自己再算一份。
	 */
	onDirtyChange?: (dirty: boolean) => void;
	/** 有待确认的「放弃修改、改看别的任务」请求（非 null ⇒ 本组件弹确认）；确认 / 取消回调由外部给。 */
	pendingView?: { id: string } | null;
	onConfirmPendingView?: () => void;
	onCancelPendingView?: () => void;
	/** 有待确认的「放弃修改、改去编辑另一个任务」请求（非 null ⇒ 本组件弹三选确认）。 */
	pendingEdit?: { id: string } | null;
	onConfirmPendingEdit?: () => void;
	onCancelPendingEdit?: () => void;
	/** 查看档里点「任务会话」打开归档会话（不给 ⇒ 该行不可点）。 */
	onOpenSession?: ((sessionId: string) => void) | undefined;
	/** 查看档里点产出物打开文件预览（不给 ⇒ 该行不可点）。 */
	onOpenFile?: ((sessionId: string, path: string) => void) | undefined;
	/** 查看档里点前置任务名 ⇒ 打开那个任务的查看档（r12：与卡片口径一致）。 */
	onViewTask?: ((id: string) => void) | undefined;
	/**
	 * 该任务在 overview 里的**附件解析结果**（服务端补好的绝对路径 + 预览锚点会话；`GET /tasks/overview`）。
	 * 透传给查看档 ⇒ 附件按 kind+name 配对后可点开预览（r13；不给/配不上 ⇒ 纯展示，不装可点）。
	 */
	resolvedAttachments?: readonly {
		name: string;
		kind: "link" | "upload";
		path?: string;
		anchorSessionId?: string;
	}[];
	/** Office 预览服务（remote.officeToPdf；未就位为 null ⇒ Office 文件出「不可用」空态）。 */
	officeToPdf?: OfficeToPdfFace | null;
	/**
	 * 工作区 title → 锚点会话 id（GET /options 下发：该工作区最近一个会话，官方 entity.sessionIds 末位）。
	 * 核心 `pickWorkspaceFile` 只用它当**相对路径基准**（打开时落在该工作区根）；文件浏览本身不需要会话，
	 * 没有锚点就退化成核心的根节点选择面（工作区清单 + 盘符），不造会话、不阻断开。
	 */
	workspaceAnchors?: Record<string, string>;
}): ReactElement {
	const {
		t,
		mode,
		draft,
		onChange,
		workspaces,
		models,
		tasks,
		onClose,
		onSave,
		onDelete,
		saveError,
		history,
		onRestoreVersion,
		onDeleteVersion,
		onToggleEnabled,
		overview,
		syncTaskId,
		workspaceAnchors,
		officeToPdf,
		currentTaskId,
		initialView,
		onDirtyChange,
		pendingView,
		onConfirmPendingView,
		onCancelPendingView,
		pendingEdit,
		onConfirmPendingEdit,
		onCancelPendingEdit,
		onOpenSession,
		onOpenFile,
		onViewTask,
		resolvedAttachments,
	} = props;
	/**
	 * 带 `{name}` 占位符的文案席位（复用 locales 的替换器；本页 `t` 是**无参**形态）。
	 * ⚠️ 声明位置必须**早于** `validateTaskDraft` 的调用点（约 1332 / 2311）：那条校验用到
	 * `vAttachmentInvalid`（含 `{name}`）⇒ 必须走 `tt`，否则占位符会**原样显示**成 `{name}`。
	 * （本仓同款真 bug 前科：docs/worklog/task-file-context.md「传了宿主原始 t ⇒ {count} 原样显示」。）
	 */
	const tt = useMemo(() => interpolateTranslate(t), [t]);

	// ── 档位（用户 2026-10-05）────────────────────────────────────────────
	// 查看 = 只读人话视图（基础信息 → 提示词 → 上次执行）；编辑 = 表单。
	// 切档**不重挂载**（同一组件内换 body）⇒ 草稿与滚动位置都在，不丢用户改动。
	const [viewTab, setViewTab] = useState<"view" | "edit">(
		initialView ?? "edit",
	);
	// 换任务（外部把 editor state 换成另一个 id）⇒ 档位回到这次打开要求的默认档：
	// 点 A 的「编辑」→ 编辑档；再去点 B 的前置任务名 → 查看档。同一个 id 内切档不受影响。
	const openedTaskRef = useRef(currentTaskId ?? "");
	useEffect(() => {
		const id = currentTaskId ?? "";
		if (openedTaskRef.current !== id) {
			// 换了任务 ⇒ 回到「这次打开要求的档」（点 A 的「编辑」→ 编辑档；再去点 B 的前置任务名 → 查看档）。
			openedTaskRef.current = id;
			// ⚠️ 脏判定基线必须跟着换成新任务的打开快照（r13 修 bug）：`initialDraftRef` 只在**挂载**时初始化，
			// 抽屉不重挂载 ⇒ 换任务后 draft 已是新任务的、基线还是旧任务的 ⇒ dirty 恒 true、关闭必弹「未保存」。
			initialDraftRef.current = draft;
			setViewTab(initialView ?? "edit");
			return;
		}
		// 同一个任务：只有**外部明确要求换档**时才跟随（如「再看一眼查看档」）；
		// 用户在抽屉里手动切档不会被打断 —— `initialView` 的值没变，这个 effect 不会再跑。
		if (initialView !== undefined) setViewTab(initialView);
	}, [currentTaskId, initialView]);
	const [advancedOpen, setAdvancedOpen] = useState(false);
	const [editorOpen, setEditorOpen] = useState(false);
	const [previewOpen, setPreviewOpen] = useState(false);
	const [pendingHint, setPendingHint] = useState(0); // >0 = Toast seq（「预览态不可保存」中性提示）
	const [resetHint, setResetHint] = useState(0); // >0 = Toast seq（「已恢复为打开时的内容」中性提示）
	const hintSeq = useRef(0);
	// 保存失败：服务端文案不「长显」占 footer，改为浮现 Toast（用户 2026-09-30：与面板保存提示同款）。
	// 用本地副本 + 自增 seq，使得同一句错误连点也能重播淡入淡出动画。
	const [saveErrToast, setSaveErrToast] = useState<{
		msg: string;
		seq: number;
	} | null>(null);
	const saveErrSeq = useRef(0);
	useEffect(() => {
		if (saveError === null || saveError === undefined) return;
		saveErrSeq.current += 1;
		setSaveErrToast({ msg: saveError, seq: saveErrSeq.current });
	}, [saveError]);
	// 保存前的客户端校验总览（用户 2026-09-30：点保存才判定；判定后问题逐项列出、对应框描红，随用户修正实时消退）。
	const [showErrors, setShowErrors] = useState(false);
	// 当前真实存在的工作区值（用户 2026-11-06：保存前必须验证工作区，不能「有值就 OK」）。
	// 列表为空 = 降级 / 拿不到，交给服务端兜底，不做本地误杀。
	const knownWorkspaces =
		props.workspaces.length === 0
			? undefined
			: new Set(props.workspaces.map((option) => option.value));
	const fieldProblems = showErrors ? validateTaskDraft(draft, tt, knownWorkspaces) : [];
	const fieldErrorMap: Record<string, string> = {};
	for (const p of fieldProblems)
		if (!(p.field in fieldErrorMap)) fieldErrorMap[p.field] = p.message;
	const problemsByField = (field: ErrorField): boolean =>
		field in fieldErrorMap;
	// 校验提示 Toast：**与判断逻辑解耦**（用户 2026-09-30）——红框是持续态（改好才退），
	// 文字提示是一次性的：点保存弹一次、统一 2.8s 自退，全部问题拼成一句（红框负责逐项指位）。
	const [problemsToast, setProblemsToast] = useState<{
		text: string;
		seq: number;
	} | null>(null);
	const problemsSeq = useRef(0);
	// 「完全权限」保存确认（用户 2026-09-30）：选 full 时点保存先弹高危确认，**打勾后**确认钮才可点；
	// 确认按钮就叫「保存」（保持原样），确认即执行保存。勾选每次打开弹窗都要重勾（高危操作不记忆）。
	const [fullPermOpen, setFullPermOpen] = useState(false);
	const [fullPermAck, setFullPermAck] = useState(false);
	// 启用开关 = 独立操作（用户 2026-09-30）：编辑态点击即写回（不走保存链路），成败都弹 Toast；
	// 新建态只改草稿（统一保存时建）。写回成功后同步脏判定基线 ⇒ 关弹窗不会被误问「放弃更改」。
	const [enabledToast, setEnabledToast] = useState<{
		msg: string;
		err: boolean;
		seq: number;
	} | null>(null);
	const enabledSeq = useRef(0);
	/**
	 * 本抽屉刚拨出的开关**目标值**（等待服务端快照确认）。
	 *
	 * ⚠️ 存在意义（2026-10-06 真机「开关来回晃两次才停」的根因）：拨片期间，`overview.rows` 可能落下一份
	 * **比这次拨动更旧的快照**（轮询 / 事件推送都会触发重拉，每次都换出新的 `rows` 数组）——若下面的同步
	 * effect 照单全收，就会把用户刚拨的开关拨回去，下一份快照又拨回来，看起来就是「来回晃」。
	 * 故**拨片未被确认前，只认与目标值一致的快照，其余一律忽略**。
	 */
	const pendingToggleRef = useRef<boolean | null>(null);
	/**
	 * `pendingToggleRef` 的**失效兜底时刻**（2026-10-06 审计 🟡）：万一「确认快照」永远不来
	 * （服务端 no-op、或刷新链路整个断掉），守卫不能把「左列表 → 右抽屉」的 enabled 同步**永久锁死**
	 * ⇒ 超过这个时刻就放弃守卫、恢复照单全收。3s 是合并窗口（200ms）的十几倍，远大于任何竞态窗口。
	 */
	const pendingUntilRef = useRef(0);
	/** 拨片守卫的最长寿命（毫秒）。 */
	const TOGGLE_GUARD_MS = 3_000;
	const handleToggleEnabled = (next: boolean): void => {
		patch({ enabled: next });
		if (
			mode !== "edit" ||
			currentTaskId === undefined ||
			currentTaskId === "" ||
			onToggleEnabled === undefined
		)
			return;
		pendingToggleRef.current = next;
		pendingUntilRef.current = Date.now() + TOGGLE_GUARD_MS;
		void onToggleEnabled(next).then((error) => {
			if (error !== null) {
				pendingToggleRef.current = null;
				patch({ enabled: !next }); // 写回失败：开关回弹，草稿与真值保持一致
				enabledSeq.current += 1;
				setEnabledToast({ msg: error, err: true, seq: enabledSeq.current });
				return;
			}
			// 服务端若本来就等于该值 ⇒ 不会 bump rev、也就不会有「确认快照」来解锁守卫 ⇒ 这里主动放行。
			const current = overview?.rows.find((r) => r.id === syncTaskId);
			if (current !== undefined && current.enabled === next)
				pendingToggleRef.current = null;
			initialDraftRef.current = { ...initialDraftRef.current, enabled: next };
			enabledSeq.current += 1;
			setEnabledToast({
				msg: next ? t("editorToggleOn") : t("editorToggleOff"),
				err: false,
				seq: enabledSeq.current,
			});
		});
	};
	// 「已重置」提示走核心 notify（2026-11-06），不再用定时器或本地 toast 动画。
	// 附加文件：选择器 / 上传交互状态（2026-09-29 本轮新增）。
	// 选择器浮层整段交给核心 `pickWorkspaceFile`（锚定模态、Esc / 点外 / ▾ 工作区切换都由核心做），
	// 这里只留「是否正在选」防止连点重复开两个。
	const [pickerOpen, setPickerOpen] = useState(false);
	const [uploading, setUploading] = useState(false);
	// 选择器浮层锚点：「工作区文件」方按钮（核心面板贴着它弹）。
	const pickerAnchorRef = useRef<HTMLDivElement | null>(null);
	// 上传失败的机器码（file-type-not-allowed / payload-too-large / …），渲染时映射成具体文案。
	// 呈现为核心 notify 提示（2026-11-06），不占卡内版面。
	const [uploadError, setUploadError] = useState<string | null>(null);
	// 一次性提示统一走核心 `notify`（Sonner）：state 里的 seq 只负责「同一条提示再弹一次」。
	useEffect(() => {
		if (pendingHint !== 0)
			coreNotify(t("editorSavePending"), { variant: "info" });
	}, [pendingHint]);
	useEffect(() => {
		if (resetHint !== 0)
			coreNotify(t("editorResetDone"), { variant: "info" });
	}, [resetHint]);
	useEffect(() => {
		if (problemsToast !== null)
			coreNotify(problemsToast.text, { variant: "error", durationMs: 5000 });
	}, [problemsToast]);
	useEffect(() => {
		if (saveErrToast !== null)
			coreNotify(saveErrToast.msg, { variant: "error", durationMs: 4000 });
	}, [saveErrToast]);
	useEffect(() => {
		if (enabledToast !== null)
			coreNotify(enabledToast.msg, {
				variant: enabledToast.err ? "error" : "success",
			});
	}, [enabledToast]);
	useEffect(() => {
		if (uploadError !== null)
			coreNotify(uploadErrText(uploadError), {
				variant: "error",
				durationMs: 4000,
			});
	}, [uploadError]);
	/**
	 * 刚上传、还没保存的附件：文件已在**服务端临时区**，但绝对路径只有服务端知道 ⇒ 由上传回包带回来存这里
	 * （用户 2026-10-09：进了列表就要能点开预览，不能等保存）。
	 * ⚠️ 只活组件内存，**绝不写进 draft** —— draft 会被序列化进任务定义 JSON，路径是服务端的、也不该留痕。
	 */
	const [uploadPaths, setUploadPaths] = useState<Record<string, string>>({});
	// 脏判定 + 关闭确认（用户 2026-09-29：点 ✕ / 点遮罩空白 / Esc / 取消，只要改过就先确认再关）。
	// 原始快照：挂载那一刻定死。弹窗关闭即卸载、重开即重挂 ⇒ 每次打开都从当次初始值算起；
	// 「改成 2 又改回 1」序列化结果与快照一致 ⇒ 不算改过。
	const initialDraftRef = useRef(draft);
	const dirty =
		stableStringify(draft) !== stableStringify(initialDraftRef.current);
	// 脏状态上报（唯一用途：外部据此判「有未保存修改时，能不能直接切去看别的任务」）。
	// ⚠️ 只上报、不接管：脏判定的真源就是上面这一行，外部不许自己再算一份。
	useEffect(() => {
		onDirtyChange?.(dirty);
	}, [dirty, onDirtyChange]);

	// 全屏面板（提示词编辑 / 配置预览）滚动位置保持（用户 2026-09-29 bug）：面板打开 = 表单整体
	// 换挂载（同一容器二选一渲染），关闭重挂后 scrollTop 归零——打开前把滚动位置存下来，
	// 回到表单后（重挂提交完成）在 effect 里原样恢复。
	const bodyRef = useRef<HTMLDivElement | null>(null);
	const savedScrollRef = useRef(0);
	const openEditorPanel = useCallback((): void => {
		savedScrollRef.current = bodyRef.current?.scrollTop ?? 0;
		setEditorOpen(true);
	}, []);
	const openPreviewPanel = useCallback((): void => {
		savedScrollRef.current = bodyRef.current?.scrollTop ?? 0;
		setPreviewOpen(true);
	}, []);
	useEffect(() => {
		if (!editorOpen && !previewOpen && bodyRef.current !== null) {
			bodyRef.current.scrollTop = savedScrollRef.current;
		}
	}, [editorOpen, previewOpen]);

	useEffect(() => {
		ensureTaskEditorStyle();
	}, []);

	const patch = useCallback(
		(part: Partial<TaskEditorDraft>): void => {
			onChange({ ...draft, ...part });
		},
		[draft, onChange],
	);

	// 左列表拨片 → 右抽屉联动（用户 2026-10-05）：抽屉只读共享 store 的 enabled，左拨片成功后 bump
	// 该 store（overview.refresh），这里把草稿与脏基线一并对齐 ⇒ 右立刻跟上、且不会误标「未保存」。
	// 守卫只比对「store 与脏基线」：抽屉自己拨片时基线已先更新（handleToggleEnabled 成功分支），
	// 故不会把用户刚拨的乐观值冲掉；只有外部（左列表）造成的 store 变化才落下来。
	useEffect(() => {
		if (overview === undefined || syncTaskId === undefined) return;
		const row = overview.rows.find((r) => r.id === syncTaskId);
		if (row === undefined) return;
		// 本抽屉刚拨过、还没被服务端快照确认 ⇒ 只认「已反映目标值」的那一份，挡掉期间更旧的快照
		// （否则开关会被拨回去，见 pendingToggleRef 注释）。**但守卫有寿命**：超时即放弃，
		// 免得确认快照永远不来时把「左列表 → 右抽屉」的同步永久锁死（见 pendingUntilRef 注释）。
		if (pendingToggleRef.current !== null) {
			const expired = Date.now() > pendingUntilRef.current;
			if (!expired && row.enabled !== pendingToggleRef.current) return;
			pendingToggleRef.current = null;
		}
		if (row.enabled === initialDraftRef.current.enabled) return;
		patch({ enabled: row.enabled });
		initialDraftRef.current = {
			...initialDraftRef.current,
			enabled: row.enabled,
		};
	}, [overview?.rows, syncTaskId, patch]);

	/** 统一关闭入口：改过 ⇒ 先弹核心 `confirmModal` 确认；没改过 ⇒ 直接关。 */
	const requestClose = useCallback((): void => {
		if (!dirty) {
			onClose();
			return;
		}
		void confirmModal({
			title: t("editorDiscardTitle"),
			message: t("editorDiscardDesc"),
			confirmText: t("editorDiscardLeave"),
			cancelText: t("editorDiscardStay"),
		}).then((ok) => {
			if (ok) onClose();
		});
	}, [dirty, onClose, t]);

	// Esc 关闭；浮层（下拉 / 日历 / 时分）自己先处理并 preventDefault ⇒ 此处不再关弹窗。
	useEffect(() => {
		const onKey = (event: KeyboardEvent): void => {
			if (event.key === "Escape" && !event.defaultPrevented) requestClose();
		};
		window.addEventListener("keydown", onKey);
		return () => {
			window.removeEventListener("keydown", onKey);
		};
	}, [requestClose]);

	/** 删除任务：核心命令式确认（措辞严厉，用户 2026-09-30 定稿）。 */
	const askDeleteTask = (): void => {
		void confirmModal({
			title: t("editorDeleteTaskTitle"),
			message: t("editorDeleteTaskDesc"),
			tone: "danger",
			confirmText: t("editorDeleteTask"),
			cancelText: t("editorCancel"),
		}).then((ok) => {
			if (ok) onDelete?.();
		});
	};
	/** 重置表单：核心命令式确认（避免误点清空已填内容，用户 2026-09-30）。 */
	const askReset = (): void => {
		void confirmModal({
			title: t("editorResetTitle"),
			message: t("editorResetDesc"),
			confirmText: t("editorReset"),
			cancelText: t("editorCancel"),
		}).then((ok) => {
			if (!ok) return;
			onChange(initialDraftRef.current);
			hintSeq.current += 1;
			setResetHint(hintSeq.current);
		});
	};

	// 左缘拖拽调宽 / 宽度记忆 / 收起耳朵：全部由核心 PanelDock 承担（2026-11-06），
	// 本组件不再自己处理指针手势与 CSS 变量（`--dsh-tdt-editor-w` 已随自建外壳删除）。

	/** 周几的**单字**标签（方块上显示；`editorWeekdayShorts` 里以 `|` 分隔，两种语言各自给全）。 */
	const weekdayShorts = useMemo(() => t("editorWeekdayShorts").split("|"), [t]);

	const weekdayLabels: WeekdayLabels = useMemo(
		() => ({
			weekdays: WEEKDAY_KEYS.map((key) => t(key)),
			shorts: weekdayShorts,
			empty: t("editorWeekdayEmpty"),
		}),
		[t, weekdayShorts],
	);

	// 提示词一律手输（2026-09-29 决定）：来源三档选择器已废除，「选文件 / 上传」挪到下方独立的「附加文件」框。
	// 「单次」已经提上去当独立的档了 ⇒ 周期下拉里只有重复的那几个（用户 2026-09-29）。
	// 「双周」语义不明（哪几周、从哪周开始）且 cron 无隔周位 ⇒ 不做；隔月走「单数月 / 双数月」。
	const freqOptions: EditorOption[] = [
		{ value: "daily", label: t("editorFreqDaily") },
		{ value: "weekly", label: t("editorFreqWeekly") },
		{ value: "monthly", label: t("editorFreqMonthly") },
		{ value: "quarterly", label: t("editorFreqQuarterly") },
		{ value: "yearly", label: t("editorFreqYearly") },
	];

	// 允许延迟（原「有效期」）：说人话（`PT4H` 没人看得懂 ⇒ 显示「4 小时」）。
	const windowOptions: EditorOption[] = [
		{ value: "PT30M", label: `30 ${t("unitMinutes")}` },
		{ value: "PT1H", label: `1 ${t("unitHours")}` },
		{ value: "PT2H", label: `2 ${t("unitHours")}` },
		{ value: "PT4H", label: `4 ${t("unitHours")}` },
		{ value: "PT8H", label: `8 ${t("unitHours")}` },
		// ⚠️ 必须写 `PT24H` 而不是 `P1D`：宿主 isoDuration 正则只认 `PT…H/M/S`（2026-09-30 专家团复核：
		//    选「1 天」此前会 422「must match pattern /^PT…/」，且文案是机器码）。
		{ value: "PT24H", label: `1 ${t("unitDays")}` },
	];

	/**
	 * 顶部三档的当前值：**推导**出来的，不是另存一份状态——
	 * 「单次」只是「周期档的频率 = 单次」，所以周期档里把频率改成别的，顶部自动回到「周期」。
	 */
	const scheduleTab: "once" | "periodic" | "interval" =
		draft.scheduleKind === "interval"
			? "interval"
			: draft.periodFreq === "once"
				? "once"
				: "periodic";

	// 任务开始时间（锚点）：周期（非单次）/ 间隔都有；单次没有（单次整行就是运行时刻）。
	const showTaskStart =
		draft.scheduleKind === "interval" ||
		(draft.scheduleKind === "periodic" && draft.periodFreq !== "once");

	// 权限档位（决策 50，用户 2026-09-29：照宿主新建会话的权限选择）——默认档 = 会话默认
	// （沿用宿主新建会话的权限设置，我们不加约束）。宿主 0.2.0-rc.2 的 AgentOptions 只有
	// provider / model / reasoningEffort / maxTokens，**没有按任务下发权限的参数** ⇒ 所选档位
	// 经派发消息的约束指令执行（真实行为，非系统级拦截），说明文案已如实写明。
	const permissionOptions: EditorOption[] = [
		{ value: "default", label: t("editorPermDefault") },
		{ value: "readOnly", label: t("editorPermReadOnly") },
		{ value: "workspace", label: t("editorPermWorkspace") },
		{ value: "full", label: t("editorPermFull") },
	];

	// ① 提示词卡（主视觉）：提示词一律手输（版本管理由插件负责，P 待做）；
	// 选文件 / 上传不再属于提示词，挪到下方独立的「附加文件」框（决策：提示词只手输）。
	const promptCard = h(
		Surface,
		{ className: "dsh-tdt-ed-card", padding: "md" },
		h(SectionHead, {
			title: t("editorPrompt"),
			right: h(
				// 全屏编辑 = **核心 Button**（2026-11-06 用户点名核实：这不是手搓，之前误用了宿主 primitives 的
				// 同形按钮，圆角与全站基础层不一致；改用 `dsh-plugin-core/ui` 的 Button）。
				Button,
				{
					variant: "ghost",
					size: "sm",
					"aria-label": t("editorOpenEditor"),
					onClick: openEditorPanel,
				},
				t("editorOpenEditor"),
			),
		}),
		h(Textarea, {
			id: "dsh-tdt-ed-source-inline-panel",
			value: draft.prompt,
			placeholder: t("editorPromptPh"),
			spellCheck: false,
			error: problemsByField("prompt"),
			onChange: (value: string) => {
				patch({ prompt: value });
			},
		}),
		// 底部一行：左 = 工作区（真实工作区列表，P1 接）；工作区右侧 = 权限档位（决策 50）；
		// 右 = 模型（不填 = 默认模型）。
		// 三框宽度下限沿用 2026-10-02 的定宽口径（权限 120 / 工作区 180 / 模型 140），
		// 2026-11-07 起分栏拉大时按父宽比例跟着变宽、各自封顶（见 PROMPT_SELECT_*）。
		// 仍不按选项文字自适应 —— 换选项宽度就跟着变，观感一直在跳；显示不下就省略号。
		h(
			"div",
			{ className: "dsh-tdt-ed-card-foot" },
			h(SelectField, {
				// 定义里存 id；不在候选项里就不选（保存校验会拦住，让用户重选）。
				value: draft.workspace,
				options: workspaces,
				onChange: (value) => {
					patch({ workspace: value });
				},
				placeholder: t("editorWorkspacePh"),
				emptyLabel: t("editorNoOptions"),
				ariaLabel: t("editorWorkspace"),
				error: problemsByField("workspace"),
				icon: h(IconFolderOpenOutlineRegular, { size: 16 }),
				width: PROMPT_SELECT_WIDE,
				// 工作区可能很多：候选列表必须带搜索框（核心 Picker 自带）。
				searchable: true,
			}),
			// 权限：紧挨工作区（用户 2026-09-29：选完工作区就定权限，两者同一件事的前后脚）。
			// 2026-11-07：悬停说明去掉（那句提示太长，用户点名不要）；档位名自明，不再套 Tooltip。
			h(SelectField, {
				value: draft.permission,
				options: permissionOptions,
				onChange: (value) => {
					patch({ permission: value as PermissionMode });
				},
				placeholder: t("editorPermDefault"),
				emptyLabel: t("editorNoOptions"),
				ariaLabel: t("editorPermission"),
				width: PROMPT_SELECT_BASE,
			}),
			h("span", { className: "dsh-tdt-ed-spacer" }),
			// 选模型 = 核心 `ModelPicker` 分组态（一组 = 一个供应商）；「默认模型」是核心内置首项。
			// ⚠️ 候选为空但草稿里**已经有模型**（宿主没接上 llm ⇒ degraded 时常发生）⇒ `modelGroupsOf`
			// 会补一组「当前值」，否则编辑老任务时看不见自己配的是哪个（值没丢、保存也照写）。
			h(ModelPicker, {
				value: draft.model,
				variant: "grouped",
				groups: modelGroupsOf(models, draft.model),
				// 只有「默认模型」一项 ⇒ 如实降级，不伪装成完整目录。
				degraded: models.length <= 1,
				defaultLabel: t("editorFollowHost"),
				placeholder: t("editorModelPh"),
				size: "lg",
				className: "dsh-tdt-ed-model",
				onChange: (value) => {
					patch({ model: value });
				},
			}),
		),
	);

	// ①-附加：附加文件卡（展示 + 删除 + 选择/上传入口；选择=链接工作区文件，上传=拖拽/本地文件落盘）。
	const fileInputRef = useRef<HTMLInputElement>(null);
	const addAttachment = (att: Attachment): void => {
		patch({ attachments: [...draft.attachments, att] });
	};
	const makeId = (): string =>
		typeof crypto !== "undefined" && crypto.randomUUID !== undefined
			? crypto.randomUUID()
			: Math.random().toString(36).slice(2);
	/**
	 * 选择工作区文件：整段交给核心 `pickWorkspaceFile`——锚定在方按钮左侧、下缘齐平的模态，
	 * Esc / 点外 / ▾ 切工作区都由核心接管；回调给的是**绝对路径**（`workspaceRel` 是相对该工作区的路径）。
	 * 默认落点 = 任务已选工作区的根（`sessionId` 同时是相对路径基准）；没有锚点会话 ⇒ 核心给根选择面。
	 */
	const openPicker = (): void => {
		const anchor = pickerAnchorRef.current;
		if (anchor === null || pickerOpen) return;
		const workspace =
			draft.workspace !== "" ? draft.workspace : (workspaces[0]?.value ?? "");
		setPickerOpen(true);
		void pickWorkspaceFile({
			anchor,
			// 旧浮层是「面板在按钮左侧、下缘与按钮下缘齐平」⇒ 左侧 + 底边对齐。
			placement: "left-end",
			sessionId: workspaceAnchors?.[workspace],
			rootName: workspace === "" ? undefined : workspace,
			workspaces: workspaces.map((item) => item.value),
			officeToPdf: officeToPdf ?? undefined,
			translate: coreT,
		}).then(
			(picked) => {
				setPickerOpen(false);
				if (picked === null) return;
				const ref = picked.workspaceRel ?? picked.path;
				const name = ref.slice(
					Math.max(ref.lastIndexOf("/"), ref.lastIndexOf("\\")) + 1,
				);
				addAttachment({
					id: makeId(),
					name,
					kind: "link",
					ref,
					workspace: picked.workspace ?? workspace,
					isDir: picked.isDir,
				});
			},
			() => {
				setPickerOpen(false);
			},
		);
	};
	// 上传失败机器码 → 具体文案（用户 2026-09-29：报错要按具体情况说人话，不透出机器码）。
	const uploadErrText = (code: string): string => {
		if (code === "file-type-not-allowed") return t("editorUploadErrType");
		if (code === "payload-too-large" || code === "body-too-large")
			return t("editorUploadErrSize");
		if (code === "empty-file") return t("editorUploadErrEmpty");
		return t("editorUploadErrGeneric");
	};
	const uploadFiles = async (files: FileList | File[]): Promise<void> => {
		const list = Array.from(files);
		if (list.length === 0 || uploading) return;
		setUploadError(null);
		// 发包前当场预检（与宿主共用同一份约束，src/attachment-allowlist.ts）：
		// 尺寸超限 / 扩展名不在白名单都直接拒，不白传（用户 2026-09-29：不该转半天才报错）。
		// 不合规的跳过并提示，其余照传。
		const oversize = list.filter((file) => file.size > ATTACHMENT_MAX_BYTES);
		const badType = list.filter(
			(file) =>
				file.size <= ATTACHMENT_MAX_BYTES &&
				!ALLOWED_ATTACHMENT_EXT.has(extOf(file.name)),
		);
		const sendable = list.filter(
			(file) =>
				file.size <= ATTACHMENT_MAX_BYTES &&
				ALLOWED_ATTACHMENT_EXT.has(extOf(file.name)),
		);
		if (oversize.length > 0) setUploadError("payload-too-large");
		if (badType.length > 0) setUploadError("file-type-not-allowed");
		if (sendable.length === 0) return;
		setUploading(true);
		// ⚠️ 多选修复：逐个收进本地数组、循环末**一次性** patch。此前每次 addAttachment 都展开
		// 渲染闭包里的旧 draft.attachments ⇒ 多选时后一个把前一个覆盖掉，列表只剩最后一个文件。
		const added: Attachment[] = [];
		const nextPaths: Record<string, string> = {};
		let lastErr: string | null = null;
		for (const file of sendable) {
			// 每个文件独立超时（90s：附件上限 20MB，给慢盘留余量）——此前**没有超时**，
			// 一旦请求挂住 ⇒ 循环卡死、`setUploading(false)` 永不执行 ⇒ **上传按钮永久禁用**
			// （2026-09-30 评审 P0；与列表轮询那条同款病）。
			const controller = new AbortController();
			const abortTimer = window.setTimeout(() => controller.abort(), 90_000);
			try {
				const res = await fetch(`${API_PREFIX}/attachment`, {
					method: "POST",
					headers: {
						"x-filename": encodeURIComponent(file.name),
						"content-type": "application/octet-stream",
					},
					body: file,
					signal: controller.signal,
				});
				const data = await res.json().catch(() => null);
				if (data === null || data.ok !== true) {
					lastErr =
						typeof data?.error === "string" ? data.error : "upload-failed";
					continue;
				}
				const id = makeId();
				if (typeof data.path === "string" && data.path !== "")
					nextPaths[id] = data.path;
				added.push({ id, name: data.name, kind: "upload", ref: data.ref });
			} catch (error) {
				lastErr = error instanceof Error ? error.message : "network-error";
			} finally {
				window.clearTimeout(abortTimer);
			}
		}
		setUploading(false);
		if (added.length > 0)
			patch({ attachments: [...draft.attachments, ...added] });
		if (Object.keys(nextPaths).length > 0)
			setUploadPaths((prev) => ({ ...prev, ...nextPaths }));
		if (lastErr !== null) setUploadError(lastErr);
	};
	/**
	 * 这一行的预览目标（路径 + 锚点会话）。三档递进，**服务端解析优先**（已保存任务的绝对路径最权威）：
	 *   ① overview 命中（服务端把 ref 绝对化 + 配好锚点会话）；
	 *   ② link 型当场算：`ref` 本来就是**工作区相对路径**，而 FileBrowser 的 path 就是同一口径
	 *      （相对会话 cwd = 工作区根）⇒ **零换算**，锚点取该工作区最近会话（与选择器同一份 workspaceAnchors）；
	 *   ③ upload 型（还没保存）：用上传回包带回的临时区绝对路径，锚点任一有会话的工作区即可
	 *      （宿主要的只是「某个有效会话」，与服务端 `attachmentsWithPaths` 的兜底同款）。
	 * 算不出锚点 ⇒ 返回 null ⇒ 该行不可点：**没有会话的工作区宿主列不出文件，不给假入口**。
	 */
	/**
	 * 取某个工作区的锚点会话。键有两套口径：草稿里存的是工作区 **id**（2026-11-06 改），
	 * 而核心 `pickWorkspaceFile` 回传的 `workspace` 是工作区 **显示名**（`PickedPath.workspace`
	 * = title）⇒ 名字也要认，否则刚选进来的附件算不出锚点、整行点不动（2026-11-08 用户报的）。
	 */
	const anchorOfWorkspace = (key: string): string | undefined => {
		const anchors = workspaceAnchors ?? {};
		if (key === "") return undefined;
		const byId = anchors[key];
		if (byId !== undefined && byId !== "") return byId;
		const byTitle = workspaces.find((item) => item.label === key)?.value ?? "";
		const hit = byTitle === "" ? undefined : anchors[byTitle];
		return hit === undefined || hit === "" ? undefined : hit;
	};
	const previewTargetOf = (
		att: Attachment,
	): { path: string; anchorSessionId: string } | null => {
		const hit = resolvedAttachments?.find(
			(r) =>
				r.name === att.name &&
				r.kind === att.kind &&
				r.path !== undefined &&
				r.anchorSessionId !== undefined,
		);
		if (hit !== undefined)
			return {
				path: hit.path as string,
				anchorSessionId: hit.anchorSessionId as string,
			};
		if (att.kind === "link") {
			const source =
				att.workspace !== undefined && att.workspace !== ""
					? att.workspace
					: draft.workspace;
			const anchor = anchorOfWorkspace(source);
			return anchor === undefined
				? null
				: { path: att.ref, anchorSessionId: anchor };
		}
		const abs = uploadPaths[att.id];
		if (abs === undefined || abs === "") return null;
		const anyAnchor = Object.values(workspaceAnchors ?? {}).find(
			(item) => typeof item === "string" && item !== "",
		);
		return anyAnchor === undefined
			? null
			: { path: abs, anchorSessionId: anyAnchor };
	};
	const attachmentsCard = h(
		Surface,
		{
			className: `dsh-tdt-ed-card${problemsByField("attachments") ? " dsh-tdt-ed-card--error" : ""}`,
			padding: "md",
		},
		h(SectionHead, {
			title: h(
				"span",
				{ style: { display: "inline-flex", alignItems: "center", gap: "4px" } },
				t("editorAttachments"),
				h(HelpButton, { hint: t("editorAttachmentsHint") }),
			),
		}),
		// 附件列表（空数组不渲染任何东西——投放框常驻已是明确的空态，不再重复「暂无」文案）。
		draft.attachments.length === 0
			? null
			: h(
					"div",
					{
						style: {
							display: "flex",
							flexDirection: "column",
							gap: "6px",
							marginBottom: "10px",
						},
					},
					// 行样式（用户 2026-09-29）：不要边框，用半透明浅底衬出每一行。
					// 整行可点开预览（用户 2026-10-06：去掉「查看」按钮，点整行即查看）——只要算出预览目标就给入口：
					// 已保存的走服务端解析，**刚加进来的当场在本地算**（用户 2026-10-09：写提示词时要当场翻文件夹，
					// 不可能先保存）。算不出（该工作区没有会话 ⇒ 宿主列不出文件）才保持不可点，不给假入口。
					draft.attachments.map((att) => {
						const target = previewTargetOf(att);
						const canView = target !== null && onOpenFile !== undefined;
						// 附件行 = 核心 ListRow（0.35.4）：常态带底、hover 提亮、整行可点（看文件）、
						// 右侧 actions 槽放来源标签与移除叉（核心自己挡冒泡）。图标加大到 18 而行高不变。
						const icon =
							att.isDir === true
								? h(IconFolderCloseRegular, { size: 18 })
								: h(FileTypeIcon, { path: att.name, size: 18 });
						const name = h(MarqueeText, {
							text: att.name,
							style: { minWidth: 0 },
						});
						return h(
							ListRow,
							{
								key: att.id,
								hoverable: true,
								onClick: canView
									? () => {
											onOpenFile?.(target!.anchorSessionId, target!.path);
										}
									: undefined,
								actions: h(
									"span",
									{ style: { display: "inline-flex", alignItems: "center", gap: "4px" } },
									h(
										Chip,
										{ size: "xs" },
										att.kind === "link"
											? t("editorAttachmentLink")
											: t("editorAttachmentUpload"),
									),
									h(IconButton, {
										variant: "danger",
										size: "sm",
										icon: h(IconCloseOutlineRegular, { size: 14 }),
										label: t("editorAttachmentRemove"),
										onClick: (event: { stopPropagation: () => void }) => {
											event.stopPropagation();
											patch({
												attachments: draft.attachments.filter(
													(a) => a.id !== att.id,
												),
											});
											setUploadPaths((prev) => {
												const next = { ...prev };
												delete next[att.id];
												return next;
											});
										},
										style: { flex: "none" },
									}),
								),
							},
							h(
								"span",
								{ style: { display: "inline-flex", alignItems: "center", gap: "6px", minWidth: 0 } },
								icon,
								name,
							),
						);
					}),
				),
		// 一行两块（用户 2026-09-29）：左边大块 = 点击/拖拽上传；右边 = 小号「选择工作区文件」按钮。
		// 隐藏 input 挂卡片层、始终在册。
		h(
			"div",
			{ style: { display: "flex", gap: "10px", alignItems: "stretch" } },
			h(
				"div",
					{
						className: surfaceClass({ tone: "plain", border: "dashed", radius: "md", padding: "md" }),
						style: {
							flex: "1 1 auto",
							textAlign: "center",
							cursor: uploading ? "default" : "pointer",
						},
					onClick: () => {
						if (!uploading) fileInputRef.current?.click();
					},
					onDragOver: (event: { preventDefault(): void }) => {
						event.preventDefault();
					},
					onDrop: (event: {
						preventDefault(): void;
						dataTransfer?: { files?: FileList };
					}) => {
						event.preventDefault();
						if (!uploading && event.dataTransfer?.files !== undefined)
							void uploadFiles(event.dataTransfer.files);
					},
				},
				h(
					"div",
					{
						style: {
							fontSize: "var(--dshpc-font-md)",
							color: "var(--dshpc-fg)",
						},
					},
					uploading ? t("editorUploading") : t("editorDropZoneHint"),
				),
				uploading
					? null
					: h(
							"div",
							{
								style: {
									fontSize: "var(--dshpc-font-xs)",
									color: "var(--dshpc-fg-2)",
									marginTop: "4px",
								},
							},
							t("editorDropZoneFormats"),
						),
			),
			h(
				"div",
				// 核心 Button 不透传外部 ref（内部 ref 会覆盖 rest.ref）⇒ 锚点挂外层 div。
				{ ref: pickerAnchorRef, style: { flex: "none", display: "flex" } },
				// 核心 Button：虚线沿用投放区的设计语言，不再手搓原生 button。
				h(
					Button,
					{
						variant: "outline",
						"aria-haspopup": "dialog",
						"aria-expanded": pickerOpen,
						onClick: openPicker,
						style: {
							flexDirection: "column",
							gap: "6px",
							width: "92px",
							height: "auto",
							minHeight: "72px",
							borderStyle: "dashed",
						},
					},
					h(IconPlusOutlineRegular, { size: 20 }),
					h(
						"span",
						{ style: { fontSize: "var(--dshpc-font-sm)", lineHeight: 1.2 } },
						t("editorPickWorkspaceFileShort"),
					),
				),
			),
		),
		h("input", {
			ref: fileInputRef,
			type: "file",
			multiple: true,
			style: { display: "none" },
			onChange: (event: { target: { files?: FileList } }) => {
				if (event.target.files !== undefined)
					void uploadFiles(event.target.files);
			},
		}),
	);

	// ② 执行频率卡：**单次 / 周期 / 间隔** 三档 + 时区 / 有效期。
	//    「单次」不是第四种排期，它就是「周期档的频率 = 单次」——所以切到单次时把 periodFreq 设成 once，
	//    而在周期档里把频率改成别的，顶部会自动回到「周期」（值是从 periodFreq 推导的，无需额外回写）。
		const scheduleCard = h(
			Surface,
			{
				className: `dsh-tdt-ed-card${problemsByField("schedule") ? " dsh-tdt-ed-card--error" : ""}`,
				padding: "md",
			},
			h(SectionHead, {
				title: h(
					"span",
					{ style: { display: "flex", alignItems: "center", gap: "4px" } },
					t("editorSchedule"),
					h(HelpButton, { hint: t("editorScheduleHint") }),
				),
				right: h(
					"div",
					{
						style: {
							display: "flex",
							alignItems: "center",
							gap: "8px",
							flex: "none",
						},
					},
					h(Segmented<string>, {
						id: "dsh-tdt-ed-schedule",
						value: scheduleTab,
						size: "md",
						bordered: false,
						tone: "business",
						items: [
							{ value: "once", label: t("editorFreqOnce") },
							{ value: "periodic", label: t("editorSchedulePeriodic") },
							{ value: "interval", label: t("editorScheduleInterval") },
						],
						onChange: (value: string) => {
							// 智能默认（用户 2026-09-30）：切到「单次 / 间隔」时，若表单里那个时刻**已经过去**，就换成
							// 「现在 + 1 小时再取整点」（22:10 ⇒ 次日 00:00；8:50 ⇒ 10:00）—— 免得一进表单就是个过期时刻
							//（原先写死「今天 09:00」）。**已填的未来时刻不覆盖**；周期档（每天/每周…）不参与。
							// ⚠️ **只在「新建」态替换**（2026-09-30 验收评审抓到的必修项）：编辑既有任务时点一下档位，
							// 就会把人家填好的时刻换成「明天整点」，保存即写回 `schedule.start` / `once` —— 间隔任务的
							// 锚点是创建时刻（必然在过去）⇒ 被改后 `filterSlotsBySchedule` 会丢掉所有早于 `start` 的刻度
							// ⇒ **当天直接不再跑、相位也变了**。
							const notPast = (): Partial<TaskEditorDraft> =>
								mode === "create" && isPastMoment(draft.date, draft.time)
									? smartDefaultMoment()
									: {};
							if (value === "once") {
								patch({
									scheduleKind: "periodic",
									periodFreq: "once",
									...notPast(),
								});
								return;
							}
							if (value === "interval") {
								patch({ scheduleKind: "interval", ...notPast() });
								return;
							}
							// 回到「周期」：原来停在一次性的话，落到每天（否则保持原频率）。
							patch({
								scheduleKind: "periodic",
								periodFreq:
									draft.periodFreq === "once" ? "daily" : draft.periodFreq,
							});
						},
						label: t("editorSchedule"),
					}),
				),
			}),
		draft.scheduleKind === "interval"
			? h(
					"div",
					{
						id: "dsh-tdt-ed-schedule-interval-panel",
						role: "tabpanel",
						"aria-label": t("editorScheduleInterval"),
					},
					h(IntervalControls, { draft, patch, t, weekdayLabels }),
				)
			: h(
					"div",
					{
						id: `dsh-tdt-ed-schedule-${draft.periodFreq === "once" ? "once" : "periodic"}-panel`,
						role: "tabpanel",
						"aria-label":
							draft.periodFreq === "once"
								? t("editorFreqOnce")
								: t("editorSchedulePeriodic"),
					},
					h(PeriodControls, {
						draft,
						patch,
						freqOptions,
						t,
						tt,
						weekdayLabels,
					}),
				),
		// 「预计执行」人话说明（用户 2026-09-30）：在「任务开始时间」上方画两条**虚线**，中间夹一句实时翻译。
		h(
			"div",
			{ style: { marginTop: "14px" } },
			h(
				"div",
				{
					style: {
						borderTop: `1px dashed var(--dshpc-border)`,
						paddingTop: "10px",
						fontSize: "var(--dshpc-font-sm)",
						lineHeight: "1.6",
						color: "var(--dshpc-fg-2)",
					},
				},
				h(
					"span",
					{
						style: {
							color: "var(--dshpc-fg)",
							fontWeight: 600,
							marginRight: "4px",
						},
					},
					`${t("editorSchedForecast")}：`,
				),
				// 关键片段（时间 / 「每 N 分钟执行一次」）加粗提亮（用户 2026-09-30：方法要支持样式参数）。
				renderSchedule(scheduleSpecFromDraft(draft), t, {
					emphasisStyle: { color: "var(--dshpc-fg)" },
				}),
			),
			h("div", {
				style: {
					borderTop: `1px dashed var(--dshpc-border)`,
					marginTop: "10px",
				},
			}),
		),
		// 底部：左 = 任务开始时间（锚点，周期/间隔都有，带 ? 说明），右 = 允许延迟（次要，居右）。
		// 上间距与「预计执行」上边线离「星期」的间距对齐 = 14px（此前 CSS margin12+padding12=24 是两倍）。
		// ⚠️ 窄分栏（最小 530）下的空间账（用户 2026-10-02：中文标签被压成两行）：
		//   标签一律 `flex:none + nowrap`（标签**永不被压折行**），三个控件也 `flex:none` 只吃自己那份宽度
		//   （谁都不许被挤到出省略号 —— 用户点名「不要影响那三个框的字的显示」）；
		//   空间不够时靠 `flexWrap` 让右组（允许延迟）整组落到第二行，绝不切字。
		h(
			"div",
			{
				className: "dsh-tdt-ed-schedfoot",
				style: {
					display: "flex",
					alignItems: "center",
					flexWrap: "wrap",
					gap: "6px",
					borderTop: "none",
					marginTop: "14px",
					paddingTop: "0",
				},
			},
			showTaskStart
				? h(
						"div",
						{ style: { display: "flex", alignItems: "center", gap: "4px" } },
						h(
							"span",
							{
								style: {
									flex: "none",
									whiteSpace: "nowrap",
									fontSize: "var(--dshpc-font-xs)",
									color: "var(--dshpc-fg)",
								},
							},
							t("editorTaskStart"),
						),
						// 日期 / 时刻走核心 `DateTimePicker`（单值 / 分钟精度）的组合控件；
						// 周期档与间隔档都在这里选开始时刻（用户 2026-11-06：日期时间只用核心）。
						h(MomentField, {
							date: draft.date,
							time: draft.time,
							onChange: (date, time) => {
								patch({ date, time });
							},
							placeholder: t("editorDatePh"),
							ariaLabel: t("editorTaskStart"),
						}),
						h(HelpButton, {
							hint: t("editorTaskStartHint"),
							side: "top",
							align: "center",
						}),
					)
				: null,
			h("span", {
				className: "dsh-tdt-ed-spacer",
				style: { flex: "1 1 auto", minWidth: 0 },
			}),
			h(
				"div",
				{ style: { display: "flex", alignItems: "center", gap: "6px" } },
				h(
					"span",
					{
						style: {
							flex: "none",
							whiteSpace: "nowrap",
							fontSize: "var(--dshpc-font-xs)",
							color: "var(--dshpc-fg-2)",
						},
					},
					t("editorWindow"),
				),
				h(
					"span",
					{ style: { flex: "none", display: "inline-flex" } },
					h(SelectField, {
						value: draft.window,
						options: windowOptions,
						onChange: (value) => {
							patch({ window: value });
						},
						placeholder: t("editorWindow"),
						emptyLabel: t("editorNoOptions"),
						ariaLabel: t("editorWindow"),
						// 高度走默认 lg(=32)，与同排「开始时间」的日期 / 时间锚点同档（此前 sm=24 显矮）。
						// 定宽 96（同排下拉定宽那条规矩，不随选项文字跳）：按**最宽**那一档取值定（`30 分钟`
						// ≈ 46 + 内边距/箭头 38 ≈ 84），留足余量 ⇒ 切到哪一档都不会被省略号吃掉。
						width: 96,
					}),
				),
				h(HelpButton, {
					hint: t("editorWindowHint"),
					side: "top",
					align: "end",
					maxWidth: 320,
				}),
			),
		),
	);

	// ③ 前置任务卡（用户 2026-09-29 多轮拍板，照「附加文件」卡同款灰框 + 同款外距）：
	//  - 停用（锁住）的任务同样可选（快照本就全量下发，无启停过滤）；下拉里标「（已停用）」；
	//  - 布局：上 = 已选前置任务列表（空则显示上传投放区同款虚线占位框）；下 = 分组下拉 + 添加；
	//  - 标题「添加前置任务」+「?」Tooltip：含义（强调『所有』）/ 判定方式（所有前置任务上一次
	//    执行必须成功，跳过不算失败）/ 执行时自动移交前置产出文件；
	//  - 选择 = 核心 Picker 分组下拉（用户 2026-11-07）：一组 = 一个工作区，组内是它的任务；
	//    没有可选任务的工作区整组不进候选；下拉带搜索框，触发器吃掉整行剩余宽度；
	//    行内「移除」可删；同一任务不能加两次（选项里直接排除已加的，按钮再拦一道）；
	//  - 支持跨工作区（每个前置任务可来自不同工作区）；加完清空选择，可连着加第二个；
	//  - 语义下拉删除（用户：选「同一天的」没有意义）——判定方式就是「上一次执行必须成功」，
	//    新增依赖固定写 `latest_success`；存量依赖的 semantics 原样保留（编辑无损往返）。
	const addedDepIds = new Set(draft.deps.map((dep) => dep.task));
	const [depTaskId, setDepTaskId] = useState("");
	// 空组不显示：先按真源工作区收集可选任务，再把 options 为空的工作区整组滤掉。
	const depGroups: PickerGroup[] = workspaces
		.map((ws) => ({
			value: ws.value,
			label: ws.label,
			options: tasks
				.filter(
					(task) =>
						task.workspace === ws.value &&
						!addedDepIds.has(task.id) &&
						task.id !== currentTaskId,
				)
				.map((task) => ({
					value: task.id,
					label:
						task.enabled === false
							? `${task.label}${t("editorDepDisabledTag")}`
							: task.label,
				})),
		}))
		.filter((group) => group.options.length > 0);
	const addDep = (): void => {
		if (depTaskId === "" || addedDepIds.has(depTaskId)) return;
		// semantics 固定 latest_success = 「上一次执行必须成功」（用户口述的判定方式）。
		patch({
			deps: [...draft.deps, { task: depTaskId, semantics: "latest_success" }],
		});
		setDepTaskId("");
	};
		const depsBlock = h(
			Surface,
			{ className: "dsh-tdt-ed-card", padding: "md" },
			h(SectionHead, {
				title: h(
					"span",
					{ style: { display: "flex", alignItems: "center", gap: "4px" } },
					t("editorDeps"),
					h(HelpButton, { hint: t("editorDepsHint"), maxWidth: 320 }),
				),
			}),
		// 上：已选前置任务列表；空 = 上传投放区同款虚线占位框（灰字居中，主行 + 次行提示）。
		h(
			"div",
			{ style: { marginBottom: "10px" } },
			draft.deps.length === 0
							? h(
								"div",
								{
									// 空态 = 上传投放区（上方附件卡）同款虚线框，同一组 --dshpc-* token 保证观感一致。
									className: surfaceClass({ tone: "plain", border: "dashed", radius: "md", padding: "md" }),
									style: { textAlign: "center" },
								},
								h(
									"div",
									{ style: { fontSize: "var(--dshpc-font-md)" } },
									t("editorDepEmpty"),
								),
						h(
							"div",
							{
								style: {
									color: "var(--dshpc-fg-2)",
									fontSize: "var(--dshpc-font-sm)",
									marginTop: "4px",
								},
							},
							t("editorDepEmptyHint"),
						),
					)
				: h(
						"div",
						{ style: { display: "flex", flexDirection: "column", gap: "6px" } },
						draft.deps
							.filter((dep) => dep.task !== currentTaskId)
							.map((dep, index) => {
								const known = tasks.find((task) => task.id === dep.task);
								const ws = known?.workspace ?? "";
								// 前置任务条目 = 核心 ListRow（0.35.4）：整行可点（看那个任务的查看档）、
								// 右侧 actions 槽放工作区小字与移除叉；图标 + 名字走 children。
								return h(
									ListRow,
									{
										key: index,
										hoverable: true,
										onClick:
											onViewTask === undefined
												? undefined
												: () => {
														onViewTask(dep.task);
													},
										actions: h(
											"span",
											{ style: { display: "inline-flex", alignItems: "center", gap: "4px" } },
											// 工作区定宽 + 跑马灯（跨工作区时分得清是哪个区的任务）。
											ws === ""
												? null
												: h(MarqueeText, {
														text: ws,
														style: {
															width: "72px",
															color: "var(--dshpc-fg-2)",
															fontSize: "var(--dshpc-font-xs)",
														},
													}),
											// 「移除」= 核心 IconButton（与附件行小叉同款）。
											h(IconButton, {
												variant: "danger",
												size: "sm",
												icon: h(IconCloseOutlineRegular, { size: 14 }),
												label: t("editorDepRemove"),
												onClick: () => {
													patch({
														deps: draft.deps.filter((d) => d.task !== dep.task),
													});
												},
											}),
										),
									},
									h(
										"span",
										{ style: { display: "inline-flex", alignItems: "center", gap: "6px", minWidth: 0 } },
										h(
											"span",
											{ style: { display: "inline-flex", flex: "none", color: "var(--dshpc-fg-3)" } },
											h(IconPlanOutlineRegular, { size: 14 }),
										),
										h(MarqueeText, {
											text: known?.label ?? dep.task,
											style: { minWidth: 0, fontSize: "var(--dshpc-font-md)" },
										}),
									),
								);
							}),
					),
		),
		// 下：分组下拉吃掉整行剩余宽度 + 右侧定宽「添加」（间距由 .dsh-tdt-ed-deppick 定）。
		h(
			"div",
			{ className: "dsh-tdt-ed-deppick" },
			h(
				"span",
				{ className: "dsh-tdt-ed-deppick-task" },
				h(SelectField, {
					value: depTaskId,
					groups: depGroups,
					onChange: setDepTaskId,
					placeholder: t("editorDepTaskPh"),
					// 所有工作区都没有可选任务 ⇒ 明说，不塞假数据（核心 Picker 的空态）。
					emptyLabel: t("editorDepTaskEmpty"),
					ariaLabel: t("editorDepTask"),
					width: "100%",
					// 候选可能很多：下拉带搜索框（核心 Picker 自带，全站统一口径）。
					searchable: true,
				}),
			),
			h(
				Button,
				{
					variant: "outline",
					size: "sm",
					icon: h(IconPlusOutlineRegular, { size: 14 }),
					disabled: depTaskId === "",
					onClick: addDep,
					// 右段定宽 72px、居右，文字图标居中；剩余宽度全给分组下拉。
					style: {
						flex: "0 0 72px",
						height: "var(--dshpc-control-h-lg)",
						justifyContent: "center",
					},
				},
				t("editorDepAdd"),
			),
		),
	);

	// ④ 高级设置（用户 2026-09-29 第二轮返工）：收起 = 整卡一条灰、**无内层黑框**——「高级设置」
	//    +「?」说明气泡 + 官方 chevron-down（12px；展开 rotate 180°，照官方 TurnTriggerNodeView
	//    的展开图标）。展开 = 每项「控件一行 + 说明一行」两拍，项与项之间虚线分隔。
	//    重置次数改官方 Segmented 长条（同星期块观感）且标题与控件同一排；配置预览不设标题，
	//    按钮直接叫「配置预览」；新增「多 Agent 协作」开关（决策 49，默认关，派发侧缺宿主组件降级）。
	const retryOptions: EditorOption[] = [
		{ value: "1", label: t("editorRetryOnce") },
		{ value: "2", label: t("editorRetryTwice") },
		{ value: "3", label: t("editorRetryThrice") },
		{ value: "5", label: t("editorRetryFive") },
	];
	const advancedBlock = h(
		"div",
		{ className: "dsh-tdt-ed-section" },
			h(
				Surface,
				{ className: "dsh-tdt-ed-card", padding: "md" },
			// 折叠头（用户 2026-11-07 二次拍板）：整行可点展开、只给手形、不变底色；
			// 只有右侧核心 IconButton 箭头 hover 才提亮。标题字号跟其它 SectionHead 标题一致。
			h(
				"div",
				{
					role: "button",
					tabIndex: 0,
					"aria-expanded": advancedOpen,
					style: {
						display: "flex",
						alignItems: "center",
						justifyContent: "space-between",
						gap: "8px",
						cursor: "pointer",
					},
					onClick: () => {
						setAdvancedOpen(!advancedOpen);
					},
					onKeyDown: (event: { key: string; preventDefault: () => void }) => {
						if (event.key === "Enter" || event.key === " ") {
							event.preventDefault();
							setAdvancedOpen(!advancedOpen);
						}
					},
				},
				h(
					"span",
					{
						style: {
							display: "inline-flex",
							alignItems: "center",
							gap: "4px",
							fontSize: "var(--dshpc-font-lg)",
							lineHeight: "var(--dshpc-line-lg)",
							fontWeight: 600,
						},
					},
					t("editorAdvanced"),
					// 说明气泡点一下不该顺带展开（可点行内的吞冒泡包装）。
					h(HelpButton, { hint: t("editorAdvancedHelp"), insideClickable: true }),
				),
				// 箭头不另绑 onClick：点击冒泡到整行，避免同一次点击切换两回。
				h(IconButton, {
					variant: "plain",
					size: "sm",
					icon: h(IconChevronDownOutlineRegular, {
						size: 12,
						className: advancedOpen
							? "dsh-tdt-ed-advchevron-open"
							: "dsh-tdt-ed-advchevron",
					}),
					label: t("editorAdvanced"),
					"aria-expanded": advancedOpen,
				}),
			),
			advancedOpen
				? h(
						"div",
						{ className: "dsh-tdt-ed-advbody" },
						// ① 重置次数：四档 Segmented 长条（一次/两次/三次/五次），标题与控件同一排。
						h(
							"div",
							{ className: "dsh-tdt-ed-advitem" },
							h(
								"div",
								{ className: "dsh-tdt-ed-row" },
								h("span", { style: FIELD_LABEL_STYLE }, t("editorRetry")),
								h(Segmented, {
									id: "dsh-tdt-ed-retry",
									value: draft.maxAttempts,
									size: "md",
									bordered: false,
									tone: "business",
									items: retryOptions,
									onChange: (value: string) => {
										patch({ maxAttempts: value });
									},
									label: t("editorRetry"),
								}),
							),
							h("p", { className: "dsh-tdt-ed-hint" }, t("editorRetryHint")),
						),
						// ② 以 dsh 内置 /goal 开始执行（多轮续跑），默认开；派发侧缺省一致（决策 48）。
						h(
							"div",
							{ className: "dsh-tdt-ed-advitem" },
							h(
								"div",
								{ className: "dsh-tdt-ed-row" },
								h(Switch, {
									checked: draft.goalMode,
									onChange: (next: boolean) => {
										patch({ goalMode: next });
									},
									label: t("editorGoal"),
								}),
								h(
									"span",
									{
										style: {
											fontSize: "var(--dshpc-font-md)",
											fontWeight: 600,
										},
									},
									t("editorGoal"),
								),
							),
							h("p", { className: "dsh-tdt-ed-hint" }, t("editorGoalHint")),
						),
						// ③ 多 Agent 协作（决策 49，用户 2026-09-29），默认关：宿主启用 Agent Teams 时
						//    派发消息注入团队执行指令；未启用自动降级单轮（不阻塞、日志留痕）。
						h(
							"div",
							{ className: "dsh-tdt-ed-advitem" },
							h(
								"div",
								{ className: "dsh-tdt-ed-row" },
								h(Switch, {
									checked: draft.agentTeam,
									onChange: (next: boolean) => {
										patch({ agentTeam: next });
									},
									label: t("editorAgentTeam"),
								}),
								h(
									"span",
									{
										style: {
											fontSize: "var(--dshpc-font-md)",
											fontWeight: 600,
										},
									},
									t("editorAgentTeam"),
								),
							),
							h(
								"p",
								{ className: "dsh-tdt-ed-hint" },
								t("editorAgentTeamHint"),
							),
						),
						// ④ 配置预览：右侧展开只读面板（同「编辑提示词」大小），带行号与着色，可复制不可改。
						//    不设标题，按钮直接叫「配置预览」（用户 2026-09-29）。
						h(
							"div",
							{ className: "dsh-tdt-ed-advitem" },
							h(
								"div",
								{ className: "dsh-tdt-ed-row" },
													// 核心 secondary = 灰底、无描边（用户 2026-11-07：不要描边，要带背景）。
									h(
										Button,
										{ variant: "secondary", size: "sm", onClick: openPreviewPanel },
										t("editorPreview"),
									),
							),
							h("p", { className: "dsh-tdt-ed-hint" }, t("editorPreviewHint")),
						),
					)
				: null,
		),
	);

	// 正文恒为表单（U21：删掉「基本信息 / 执行记录」切换 ⇒ 编辑界面不展示执行记录，
	// 执行记录归主面板自己的 tab；那条分支原本也只有一句占位文案）。
	const body = h(
		"div",
		null,
		// 任务名称 / 编号：标签**塞进框里**（左半段带底 + 分隔线），不再单独占一行。
		h(
			"div",
			{ className: "dsh-tdt-ed-section" },
			h(PrefixedInput, {
				prefix: t("editorTitle"),
				value: draft.title,
				placeholder: t("editorTitlePh"),
				onChange: (value) => {
					patch({ title: value });
				},
				error: problemsByField("title"),
			}),
		),
		h(
			"div",
			{ className: "dsh-tdt-ed-section" },
			h(PrefixedInput, {
				prefix: t("editorCode"),
				value: draft.code,
				placeholder: t("editorCodePh"),
				onChange: (value) => {
					patch({ code: value });
				},
			}),
		),
		// 各区块间距统一走 `.dsh-tdt-ed-section` 的 margin（此前这里多了两个 16px 空 div，
		// 导致「编号 → 提示词」比别的间隔小一截）。
		h("div", { className: "dsh-tdt-ed-section" }, promptCard),
		// 附件卡（上传失败提示已改接核心 notify，2026-11-06）。
		h("div", { className: "dsh-tdt-ed-section" }, attachmentsCard),
		h("div", { className: "dsh-tdt-ed-section" }, scheduleCard),
		h("div", { className: "dsh-tdt-ed-section" }, depsBlock),
		advancedBlock,
	);

	// 全屏编辑 = 把整条分栏的内容换成编辑器（同样的边、同样的宽度、随左缘拖拽一起变宽）；
	// 关闭编辑器即把后面的表单露出来。故编辑器与表单在分栏内二选一，而不是再做一个居中弹窗。
	const panelInner = editorOpen
		? h(PromptEditorModal, {
				t,
				mode,
				value: draft.prompt,
				history: history ?? null,
				onChange: (value: string) => {
					patch({ prompt: value });
				},
				onClose: () => {
					setEditorOpen(false);
				},
				// 找回版本 = 把内容覆盖到左侧编辑器（用户 2026-09-30：不关全屏编辑器，用户接着改）。
				onRestoreVersion: (file: string) => {
					onRestoreVersion?.(file);
				},
				onDeleteVersion: (file: string) => {
					onDeleteVersion?.(file);
				},
			})
		: previewOpen
			? h(ConfigPreviewPanel, {
					t,
					json: draftToDefinitionJson(draft),
					onClose: () => {
						setPreviewOpen(false);
					},
				})
			: h(
					"div",
					{
						style: {
							display: "flex",
							flexDirection: "column",
							flex: "1 1 auto",
							minHeight: 0,
						},
					},
					// 头部：左 = 标题；右 = 启用开关（**独立操作**：编辑态点击即写回+Toast，不走保存）
					//       → 关闭 ✕（用户 2026-10-01：开关回到右侧、紧贴关闭钮左边）。
					h(
						"div",
						{ className: "dsh-tdt-ed-header" },
						h(
							"div",
							{ className: "dsh-tdt-ed-headleft" },
							// 查看档标题 = **任务名**（还没起名就给「未命名任务」）；编辑档仍是「新建任务 / 编辑任务」。
							// （r12 用户反馈：草稿未保存标记**不放头部**——任务名可能很长，改挂查看档正文「任务配置」标题旁。）
							h(
								"div",
								{ className: "dsh-tdt-ed-title" },
								viewTab === "view"
									? draft.title.trim() === ""
										? t("editorViewUntitled")
										: draft.title
									: mode === "create"
										? t("editorNew")
										: t("editorEdit"),
							),
						),
						h(
							"div",
							{ className: "dsh-tdt-ed-headactions" },
							// 启用开关写回结果走核心 notify（成功绿 / 失败红），2026-11-06。
							// 启用开关 + 联动状态文字：**紧挨关闭钮左边**（U21）。
							// ⚠️ 查看档是只读视图 ⇒ **不出现可写的开关**（启用状态改由基础信息的「状态」一行表达）。
							viewTab === "view"
								? null
								: h(
										"span",
										{ className: "dsh-tdt-ed-enable dsh-tdt-switch" },
										h(Switch, {
											checked: draft.enabled,
											onChange: handleToggleEnabled,
											label: t("editorEnabled"),
										}),
										h(
											"span",
											{
												style: {
													fontSize: "var(--dshpc-font-sm)",
													color: "var(--dshpc-fg-2,rgba(128,128,128,.95))",
												},
											},
											draft.enabled
												? t("editorEnabledStateOn")
												: t("editorEnabledStateOff"),
										),
									),
							h(
								Tooltip,
								{ label: t("editorClose"), side: "bottom" },
								h(IconButton, {
									variant: "plain",
									size: "md",
									icon: h(IconCloseOutlineRegular, { size: 16 }),
									label: t("editorClose"),
									onClick: requestClose,
								}),
							),
						),
					),
					// 正文：查看档 = 只读人话视图（自己取「上次执行」）；编辑档 = 表单（或其上的全屏子面板）。
					h(
						"div",
						{ className: "dsh-tdt-ed-body dshpc-scroll-thin", ref: bodyRef },
						viewTab === "view"
							? h(TaskViewPanel, {
									t,
									draft,
									mode,
									dirty,
									// 任务 id 只在编辑态有 ⇒ 新建态给空串，查看档据此**不发**「上次执行」请求（任务还不存在）。
									taskId: mode === "edit" ? (currentTaskId ?? "") : "",
									tasks,
									// 定义里存工作区 id ⇒ 查看档显示当前标题（老任务存标题时也会原样显示）。
									workspaceLabel: (value) => workspaceLabelOf(workspaces, value),
									resolvedAttachments,
									onOpenSession,
									onOpenFile,
									onViewTask,
								})
							: body,
					),
					// 底部：删除任务（红，仅编辑态）· 重置 · 取消 · 保存。
					// 校验问题 / 重置完成 / 预览态不可保存 / 保存失败一律走核心 notify（2026-11-06）。
					h(
						"div",
						{ className: "dsh-tdt-ed-footer" },
						// 档位切换（用户 2026-10-05）：**恒显在最左**；切档只是换 body，不重开分栏、不丢草稿。
						h(Segmented, {
							id: "dsh-tdt-ed-viewtab",
							value: viewTab,
							size: "md",
							bordered: false,
							tone: "business",
							items: [
								{ value: "view", label: t("editorTabView") },
								{ value: "edit", label: t("editorTabEdit") },
							],
							onChange: (next: string) => {
								setViewTab(next as "view" | "edit");
							},
							label: t("editorTabEdit"),
						}),
						// 查看档是只读 ⇒ 删除 / 重置 / 取消 / 保存**一律不渲染**，只留一个弹性占位把切换钮顶到最左
						//（footer 是 `justify-content:flex-end`，没有占位的话这个仅剩的元素会被推到右边）。
						viewTab === "view"
							? h("span", { style: { flex: "1 1 auto" } })
							: h(
									Fragment,
									null,
									mode === "edit" && onDelete !== undefined
										? // 底栏按钮统一**基础层**（用户 2026-10-05：圆角要与左边的档位切换同属一套——
											// 官方 Button 的圆角由宿主 CSS 决定、与 .dsh-tdt-seg 的 radius-md 天生不一致）。
											h(
												Button,
												{
													variant: "outline",
													size: "sm",
													className: "dsh-tdt-ed-danger",
													onClick: () => {
														askDeleteTask();
													},
												},
												t("editorDeleteTask"),
											)
										: null,
									// 「重置」只在**改过内容**时才出现（用户 2026-09-30）：直接复用关闭确认那份脏判定
									// （`dirty` = 当前草稿 ≠ 打开时快照）；重置后草稿回到初始 ⇒ dirty 变 false ⇒ 按钮自己消失。
									dirty
										? h(
												Button,
												{
													variant: "ghost",
													size: "sm",
													onClick: () => {
														askReset();
													},
												},
												t("editorReset"),
											)
										: null,
									h("span", { style: { flex: "1 1 auto" } }),
									h(
										Button,
										{ variant: "outline", size: "sm", onClick: requestClose },
										t("editorCancel"),
									),
									h(
										Button,
										{
											variant: "primary",
											size: "sm",
											onClick: () => {
												if (onSave === undefined) {
													hintSeq.current += 1;
													setPendingHint(hintSeq.current);
													return;
												}
												// 保存前先本地查必填 / 排期冲突：问题字段描红（持续态）+ 一次性 Toast 列全部问题。
												const problems = validateTaskDraft(draft, tt, knownWorkspaces);
												if (problems.length > 0) {
													setShowErrors(true);
													problemsSeq.current += 1;
													// 一行一条（\n 换行，Toast 文字区 pre-line），每条以句号收尾——标点统一，不混分号。
													setProblemsToast({
														text: problems.map((p) => p.message).join("\n"),
														seq: problemsSeq.current,
													});
													return;
												}
												setShowErrors(false);
												setProblemsToast(null);
												// 「完全权限」= 高危档：保存前强制勾选确认（每次保存都确认，勾选不记忆）。
												if (draft.permission === "full") {
													setFullPermAck(false);
													setFullPermOpen(true);
													return;
												}
												onSave(draft);
											},
										},
										t("editorSave"),
									),
								),
					),
					// 「完全权限」保存确认（高危）：核心 `Modal` 壳 + 风险清单 + 勾选后才可保存。
					fullPermOpen
						? h(ConfirmDialog, {
								t,
								warning: true,
								title: t("editorFullPermTitle"),
								desc: t("editorFullPermDesc"),
								bullets: [t("editorFullPermB1"), t("editorFullPermB2")],
								checkbox: {
									label: t("editorFullPermCheck"),
									checked: fullPermAck,
									onToggle: setFullPermAck,
								},
								confirmLabel: t("editorSave"),
								onCancel: () => {
									setFullPermOpen(false);
								},
								onConfirm: () => {
									setFullPermOpen(false);
									onSave?.(draft);
								},
							})
						: null,
					// 未保存时要去查看**另一个任务**：核心 `Modal` 确认后再切（用户 2026-10-05 拍板）。
					pendingView !== null && pendingView !== undefined
						? h(ConfirmDialog, {
								t,
								title: t("editorViewSwitchTitle"),
								desc: t("editorViewSwitchDesc"),
								confirmLabel: t("editorTabView"),
								cancelLabel: t("editorEditSwitchKeep"),
								onCancel: () => {
									onCancelPendingView?.();
								},
								onConfirm: () => {
									onConfirmPendingView?.();
								},
							})
						: null,
					// 未保存时要去编辑**另一个任务**：两选（继续编辑 / 直接覆盖）——用户 2026-10-05 修正静默覆盖。
					pendingEdit !== null && pendingEdit !== undefined
						? h(ConfirmDialog, {
								t,
								title: t("editorEditSwitchTitle"),
								desc: t("editorEditSwitchDesc"),
								confirmLabel: t("editorEditSwitchOverwrite"),
								cancelLabel: t("editorEditSwitchKeep"),
								onCancel: () => {
									onCancelPendingEdit?.();
								},
								onConfirm: () => {
									onConfirmPendingEdit?.();
								},
							})
						: null,
					// r13：查看档「全屏查看」已按用户要求撤掉（改为提示词块内就地「源码 / 预览 + 展开 / 收起」）。
				);

	// 外壳（面板 / 拖拽调宽 / 宽度记忆 / 收起）已交给核心 `PanelDock`（见 index.ts 的 DockPanel），
	// 这里只返回**内容本体**：填满核心给的 body，自带滚动（body 的 overflow 不参与滚动）。
	// 关闭路径仍是 ✕ / Esc / 取消钮三条。
	return h(
		"div",
		{
			className: "dsh-tdt-ed-content",
			// 非模态：主窗口此刻仍可见可点（这话原来写 aria-modal=true 就不成立了）。
			role: "dialog",
			"aria-label": mode === "create" ? t("editorNew") : t("editorEdit"),
		},
		panelInner,
	);
}
