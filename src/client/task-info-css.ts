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
  // ── 「任务会话」：放大镜走核心 Button 的 `icon` 槽（2026-11-06），18px 自绘灰底座已删 ──
  // ── 前置任务名可点（查看档入口，用户 2026-10-05）────────────────────────
  // 与「任务会话」同款做法：整体是个按钮、清掉默认外壳、hover 只让文字变蓝。
  // ⚠️ 序号徽标（18×18 小方块）在按钮**内部**，`:hover` 只改文字色 ⇒ 徽标保持灰底不跟着变。
  // ── 纸表格「标签—值」两栏 ───────────────────────────────────────────────
  // 整栏**共用一个 grid** ⇒ 标签列按当前语言最长标签**自动定宽**（中文≈48px、英文≈95px），
  // 零留白且各行对齐。原固定 66px 在英文下被「Preceding tasks」撑爆、溢出去压到值上（用户 2026-10-03 反馈）。
  // InfoField 返回 Fragment，label / value 是直接子格。
  '.dsh-tdt-info-cfg, .dsh-tdt-info-rec-fields { display: grid; grid-template-columns: max-content 1fr; align-items: stretch; }',
  // 每格自带底边缝：label 与 value 相邻（**不用 column-gap**）⇒ 两条缝连成整行线；标签右侧留白当列间距。
  // ⚠️ **行高必须两格同一个**（用户 2026-10-03 反馈「字全贴上面那条线」）：grid 是 `align-items: stretch`，
  // 格子高度由行内最高的那格决定 ⇒ label 若继承宿主行高（与 value 的 `--dshpc-line-md` 不等），矮的那格内容
  // 会被顶对齐、看着贴上边线。统一成 `--dshpc-line-md` 后：单行 = 上下居中；值多行时标签与值第一行齐平。
  // ⚠️ **光学居中**（用户 2026-11-06 二次反馈「每行数据离上缝近、离下缝远」）：宿主字体的字形在行盒里偏上，
  // 只靠上下等内边距看着仍贴上缝 ⇒ 把总内边距 12px 拆成上 9 / 下 3，字形整体下移 3px 落回视觉中心，
  // 行高不变（仍是 12px 内边距 + `--dshpc-line-md` 行盒）。
  '.dsh-tdt-info-label, .dsh-tdt-info-value { padding: 9px 0 3px; border-bottom: 1px solid var(--dshpc-border-faint); line-height: var(--dshpc-line-md); }',
  '.dsh-tdt-info-label { padding-right: 12px; }',
  // 附件用的是核心 `Chip`（20px 高 = `--dshpc-line-md`）；补一条 `vertical-align` 让它与标签同基线居中。
  '.dsh-tdt-info-file { vertical-align: middle; }',
  // 每栏**最底下那一条线**去掉（用户 2026-10-03 二次修订）：判据不是写死某一行（如 Token），而是由
  // DOM 实际决定 —— 左栏最后一块就是字段区；右栏**有产出物时最后一块是产出物区** ⇒ 字段区末行
  // 只有"它后面没别的块"（`:last-child`）时才去缝，否则会把 Token 的线也去掉、让字段区与产出物断线。
  '.dsh-tdt-info-cfg > :nth-last-child(-n+2), .dsh-tdt-info-rec-body > .dsh-tdt-info-rec-fields:last-child > :nth-last-child(-n+2) { border-bottom: 0; }',
  // ── 状态图标配色（官方图标吃 currentColor）：圆勾绿 / 圆叉红 / 转圈主题色 ──────
  // 卡片展开区「上次执行」、执行记录 tab、右侧栏查看档三处共用同一个 `StatusIcon`（task-info.tsx）。
  '.dsh-tdt-rec-ic-ok { color: var(--dshpc-success); }',
  '.dsh-tdt-rec-ic-bad { color: var(--dshpc-danger); }',
  // 转圈动画归核心 Loader；本类只定色（用户 2026-11-06）。
  '.dsh-tdt-rec-ic-run { color: var(--dshpc-accent); }',
  '@keyframes dsh-tdt-rec-rotate { to { transform: rotate(360deg) } }',
  '.dsh-tdt-rec-ic-idle { box-sizing: border-box; display: inline-block; width: 12px; height: 12px; border: 1.5px solid var(--dshpc-border-strong); border-radius: 50%; }',
].join('\n')

/** 幂等注入（走 ui/style.ts 单一 <style>）。卡片展开区与查看档渲染前都调用它。 */
export function ensureTaskInfoStyle(): void {
  applyStyle(TASK_INFO_DOMAIN, TASK_INFO_CSS)
}
