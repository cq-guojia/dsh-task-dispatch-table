# 20261109-0752-1ae7-修复卡片-padding-点不中: 修复卡片 padding 点不中

- **Tags**: 点击区域, 卡片组件, 核心依赖
- **Status**: done · 2026-11-09 14:07:36 · @GuoJia-Agent · 8d557c6d-7c93-43ac-8c73-5d623e82e1c6
- **Created**: 2026-11-09 07:52:10 · @GuoJia-Agent · 8d557c6d-7c93-43ac-8c73-5d623e82e1c6
- **Sealed**: 2026-11-09 14:07:36 · @GuoJia-Agent · 8d557c6d-7c93-43ac-8c73-5d623e82e1c6

<!-- Header lines are maintained by the script, fixed order: Tags → Status → Created → Sealed.
     The `- **Tags**: …` line is inserted at the top by new --tags; omitted when there are no tags
     (category goes to the ledger and history only, never into this document).
     The `- **Sealed**: …` line is appended on close. -->

## Background

用户反馈：任务配置卡 hover 整条边到边变色、显示手形，但点在卡片内边距（padding）圈里无反应，只有点中间文字小块才生效。经核实（上轮）：dsh-plugin-core@0.35.8 的 `Card` 根节点无 `onClick`，消费方只能把点击挂在内层 `children` 子元素，落在 `__body` 的 padding 圈之外，而 hover/cursor 在 `__body` 层，导致「看着能点、点不中」。该缺口转交核心（何心）补齐，核心在 0.35.10 新增 `CardSharedProps.onClick`，绑在 `__body`（与 hover 同层）。

## To Do

无（全部完成并验证）。

## Next

无（已结案）。

## Process

- 核心 0.35.10 实现：`onClick` 绑 `div.dshpc-card__body`（`hoverScope:'head'`）或根节点（`'card'`），与 `--card-pad-*` 内距同层；`role="button"` + `tabIndex=0` + Enter/Space（`onKeyDown` 仅在 `event.target === event.currentTarget` 时触发）；`__side` 槽 `stopPropagation` 挡 action/折叠箭头；`panel` 是 `__body` 兄弟节点、天然不误触（`node_modules/dsh-plugin-core/dist/ui/display/Card.js`、`Card.d.ts`）。
- 本仓接入（纯换 prop，无补丁）：
  - `src/client/task-list.tsx:1085` `Card` props 加 `onClick`（保留「拖选文字不展开」守卫 `window.getSelection()`），删内层 `div.dsh-tdt-card-row` 的 `onClick` 与内联 `cursor`。
  - `src/client/records-timeline.tsx:495` `cardProps` 加 `onClick: onHeadClick`，删内层 head 的 `onClick`；删 `.dsh-tdt-rec-head{cursor:pointer;}` 与过时注释。
  - `scripts/smoke.mjs:3517` 那条「容器不挂交互」守卫改为钉新契约，并补「内层头部不得再自挂 onClick/cursor」反断言。
- 取版本：`pnpm view` latest = 0.35.10；`pnpm update` 被 `pnpm-workspace.yaml` 的 `minimumReleaseAgeExclude` 白名单（只列到 0.35.8）挡住，改 `pnpm add dsh-plugin-core@0.35.10`，pnpm 自动把 `|| 0.35.10` 加入白名单，`package.json` → `^0.35.10`。
- 验证：`pnpm run build` ✓（产物含 `dshpc-card__hit`、`onClick: onHeadClick`）、`pnpm run smoke` 779 通过 0 失败（途中一次 `scripts/smoke.mjs:5273` 版本测试偶发 TypeError，重跑即过，与本改动无关）、`pnpm run typecheck` ✓、`koc-codelint` 15 文件六层全过。

## Conclusion

任务配置卡与执行记录卡整行（含 padding 圈）现在均可点击触发展开/收起，hover 与点击同层，展开区 `panel` 不误触，键盘 Enter/Space 可达。验证全过。遗留：本仓 `docs/dependencies/plugin-core-controls.md:219` 旧结论「`Card`/`StripCard` 根节点没有 `onClick`」已过时（0.35.10 有 `onClick`，绑 `__body`），待用户授权回写，本次未动文档。

## Execution Log

<!-- Maintained by the script: appended by new / claim / set / release / log / close. Do not edit.
     Backfill with: progress log --id 20261109-0752-1ae7-修复卡片-padding-点不中 --note "...". -->
- 2026-11-09 07:52:10 · new · @GuoJia-Agent · 8d557c6d-7c93-43ac-8c73-5d623e82e1c6 · created
- 2026-11-09 14:03:07 · claim · @GuoJia-Agent · 8d557c6d-7c93-43ac-8c73-5d623e82e1c6 · claimed → doing
- 2026-11-09 14:07:31 · log · @GuoJia-Agent · 8d557c6d-7c93-43ac-8c73-5d623e82e1c6 · 接入核心 0.35.10 的 Card.onClick：task-list.tsx/records-timeline.tsx 整行可点、smoke.mjs 守卫同步；build+smoke(779/0)+typecheck+codelint 全过
- 2026-11-09 14:07:36 · close · @GuoJia-Agent · 8d557c6d-7c93-43ac-8c73-5d623e82e1c6 · sealed: 接入核心 0.35.10 的 Card.onClick，任务配置卡/执行记录卡整行（含 padding 圈）可点击；hover 与点击同层、panel 不误触、键盘可达；build/smoke/typecheck/codelint 全过
