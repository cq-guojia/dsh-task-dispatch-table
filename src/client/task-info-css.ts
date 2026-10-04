// 任务信息展示皮肤（域 `domain:task-info`，2026-10-05 立）：
// 卡片展开区「基础信息」与右侧栏**查看档**共用同一份「标签—值纸表格 + 上次执行 + 状态图标」的观感。
//
// **为什么单独成文件**（本仓库规矩：同一个东西被写第二遍就是违规）：
// 这两处看的是同一份任务信息，但数据源不同（卡片吃 `GET /tasks/overview` 的摘要行、查看档吃编辑草稿）
// ⇒ 若各写一份 CSS，用户切换两处会看到同一行字段两种观感，且日后改一处必漏另一处。
//
// 规则来源：原先全部挤在 `task-list.tsx` 的 `TASK_LIST_CSS` 里（与卡片外壳 / 执行记录表格混在一个常量）。
// 2026-10-05 原样迁出 —— 迁出的规则**全部类作用域、彼此无跨规则顺序依赖**，换域不改变层叠结果。
// ⚠️ 域按登记顺序拼接同一 `<style>`，所以「同一元素被两条规则命中」的情形不要跨域拆分。
import { applyStyle } from './ui'

/** 本皮肤所属的样式域（`ui/style.ts` 的域清单里登记）。 */
export const TASK_INFO_DOMAIN = 'domain:task-info'

const TASK_INFO_CSS = [
  // ── 「任务会话」（用户 2026-10-03 四次修订 · 定稿）────────────────────────
  // **不要虚线、不要边框 / 白框**；= 图标包一个**灰色小标签框**（提示可查看）+ 会话名，hover 整体变蓝。
  // ⚠️ ① `border: 0` 必须先清掉**按钮默认边框**（否则会留一圈白框）；
  //    ② color 必须写在 class（inline 会盖掉 :hover，鼠标上去就不变色）。
  '.dsh-tdt-info-session { appearance: none; -webkit-appearance: none; border: 0; border-radius: 0; background: transparent; color: var(--tdt-fg); transition: color var(--tdt-dur) var(--tdt-ease); }',
  // hover **只让文字变蓝**：放大镜和它的灰框都保持原样（用户 2026-10-03）。图标框自带固定色 ⇒ 不跟随文字变色。
  '.dsh-tdt-info-session:hover { color: var(--tdt-business); }',
  '.dsh-tdt-info-session-icon { display: inline-flex; align-items: center; justify-content: center; width: 18px; height: 18px; flex: none; border-radius: var(--tdt-radius-xs); background: var(--tdt-chip-bg); color: var(--tdt-fg-2); }',
  // ── 前置任务名可点（查看档入口，用户 2026-10-05）────────────────────────
  // 与「任务会话」同款做法：整体是个按钮、清掉默认外壳、hover 只让文字变蓝。
  // ⚠️ 序号徽标（18×18 小方块）在按钮**内部**，`:hover` 只改文字色 ⇒ 徽标保持灰底不跟着变。
  '.dsh-tdt-info-dep { appearance: none; -webkit-appearance: none; border: 0; border-radius: 0; background: transparent; padding: 0; font: inherit; font-size: var(--tdt-font-sm); color: var(--tdt-fg); cursor: pointer; display: inline-flex; align-items: center; gap: 6px; min-width: 0; text-align: left; transition: color var(--tdt-dur) var(--tdt-ease); }',
  '.dsh-tdt-info-dep:hover { color: var(--tdt-business); }',
  // ── 纸表格「标签—值」两栏 ───────────────────────────────────────────────
  // 整栏**共用一个 grid** ⇒ 标签列按当前语言最长标签**自动定宽**（中文≈48px、英文≈95px），
  // 零留白且各行对齐。原固定 66px 在英文下被「Preceding tasks」撑爆、溢出去压到值上（用户 2026-10-03 反馈）。
  // InfoField 返回 Fragment，label / value 是直接子格。
  '.dsh-tdt-info-cfg, .dsh-tdt-info-rec-fields { display: grid; grid-template-columns: max-content 1fr; align-items: stretch; }',
  // 每格自带底边缝：label 与 value 相邻（**不用 column-gap**）⇒ 两条缝连成整行线；标签右侧留白当列间距。
  // ⚠️ **行高必须两格同一个**（用户 2026-10-03 反馈「字全贴上面那条线」）：grid 是 `align-items: stretch`，
  // 格子高度由行内最高的那格决定 ⇒ label 若继承宿主行高（与 value 的 `--tdt-line-md` 不等），矮的那格内容
  // 会被顶对齐、看着贴上边线。统一成 `--tdt-line-md` 后：单行 = 上下居中；值多行时标签与值第一行齐平。
  '.dsh-tdt-info-label, .dsh-tdt-info-value { padding: 6px 0; border-bottom: 1px solid var(--tdt-border-faint); line-height: var(--tdt-line-md); }',
  '.dsh-tdt-info-label { padding-right: 12px; }',
  // 每栏**最底下那一条线**去掉（用户 2026-10-03 二次修订）：判据不是写死某一行（如 Token），而是由
  // DOM 实际决定 —— 左栏最后一块就是字段区；右栏**有产出物时最后一块是产出物区** ⇒ 字段区末行
  // 只有"它后面没别的块"（`:last-child`）时才去缝，否则会把 Token 的线也去掉、让字段区与产出物断线。
  '.dsh-tdt-info-cfg > :nth-last-child(-n+2), .dsh-tdt-info-rec-body > .dsh-tdt-info-rec-fields:last-child > :nth-last-child(-n+2) { border-bottom: 0; }',
  // ── 状态图标配色（官方图标吃 currentColor）：圆勾绿 / 圆叉红 / 转圈主题色 ──────
  // 卡片展开区「上次执行」、执行记录 tab、右侧栏查看档三处共用同一个 `StatusIcon`（task-info.tsx）。
  '.dsh-tdt-rec-ic-ok { color: var(--tdt-success); }',
  '.dsh-tdt-rec-ic-bad { color: var(--tdt-danger); }',
  '.dsh-tdt-rec-ic-run { color: var(--tdt-accent); animation: dsh-tdt-rec-rotate .9s linear infinite; }',
  '@keyframes dsh-tdt-rec-rotate { to { transform: rotate(360deg) } }',
  '.dsh-tdt-rec-ic-idle { box-sizing: border-box; display: inline-block; width: 12px; height: 12px; border: 1.5px solid var(--tdt-border-strong); border-radius: 50%; }',
  '@media (prefers-reduced-motion: reduce) { .dsh-tdt-rec-ic-run { animation: none; } }',
].join('\n')

/** 幂等注入（走 ui/style.ts 单一 <style>）。卡片展开区与查看档渲染前都调用它。 */
export function ensureTaskInfoStyle(): void {
  applyStyle(TASK_INFO_DOMAIN, TASK_INFO_CSS)
}
