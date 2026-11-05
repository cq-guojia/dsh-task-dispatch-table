# 20261105-1252-6f7c-样式改接-dsh-plugin-core: 样式改接 dsh-plugin-core

- **Tags**: 样式, 组件复用, 插件核心, DSH
- **Status**: doing · 2026-11-05 12:52:51 · @GuoJia-Agent · 8d557c6d-7c93-43ac-8c73-5d623e82e1c6
- **Created**: 2026-11-05 12:52:17 · @GuoJia-Agent · 8d557c6d-7c93-43ac-8c73-5d623e82e1c6

<!-- Header lines are maintained by the script, fixed order: Tags → Status → Created → Sealed.
     The `- **Tags**: …` line is inserted at the top by new --tags; omitted when there are no tags
     (category goes to the ledger and history only, never into this document).
     The `- **Sealed**: …` line is appended on close. -->

## Background

本仓库较早，UI 样式多为项目内自研。此后抽出了面向 DSH 的通用基础核心：

- 远端：https://github.com/cq-guojia/dsh-plugin-core
- 本地：`/code/dsh-plugins/dsh-plugin-core`（分支 `main`）

用户判断：现有样式（button、分块标签、提示框、移动端提示、绘画预览、文件预览等）估算 95% 以上已被核心覆盖。

用户原话（2026-11-05）：

> 现在我们要干的事情就是去看我们现在所有的样式：button、一块一块的标签、提示框、手机上的提示，所有所有的样式。几乎应该是 95% 以上都被这个核心的样式已经涵盖了。包括绘画预览呀，文件预览呀，全都涵盖了。所以说，我们要从这个项目里排除很多东西，用核心的这些东西来接。所有的样式只要是核心有的，我们一律不自己手搓。

## To Do

三条硬要求（用户已给定，不自行扩展、不自行裁决）：

1. **核心有的统一走核心，绝不手搓。** 核心已覆盖的样式 / 组件，一律改为引用核心，删除本项目的手写实现。
2. **核心没有的，列清单交用户判断。** 每一项写清用途、本项目位置、核心现状，由用户决定：本项目自研，还是让核心去做。
3. **核心控件不满足需求 / 实现不规范，反馈 + 建议。** 逐条给出现状问题与建议，由用户决定：本项目定制化，还是核心改来支持。

待办（执行顺序，做一步用户看一步）：

- [ ] 盘清本项目全部样式的落点（组件、CSS、注入、宿主 UI 镜像相关部分）
- [ ] 盘清 `dsh-plugin-core` 实际导出的能力与版本基线（不凭名字猜，读 `package.json` / `exports` / 源码）
- [ ] 出一张逐项映射表：本项目样式 → 核心对应物 → 结论（可替换 / 核心缺失 / 核心不足）
- [ ] 出「核心缺失」清单，交用户判断归属（本项目自研 or 核心新增）
- [ ] 出「核心不足 / 不规范」清单（含问题、证据行号、建议），交用户判断归属
- [ ] 用户逐条拍板后再动代码；拍板结论回写 `docs/design/` 对应槽位

## Next

扫 `/code/dsh-plugins/dsh-plugin-core`：读 `package.json`（`exports` / 依赖 / 版本）与入口导出源码，列出全部可用组件与样式开关；同时枚举本项目 `src/client/` 下自研 UI 文件，形成对照底稿供用户讨论。

## Process

（尚无执行记录）

## Execution Log

<!-- Maintained by the script: appended by new / claim / set / release / log / close. Do not edit.
     Backfill with: progress log --id 20261105-1252-6f7c-样式改接-dsh-plugin-core --note "...". -->
- 2026-11-05 12:52:17 · new · @GuoJia-Agent · 8d557c6d-7c93-43ac-8c73-5d623e82e1c6 · created and claimed
- 2026-11-05 12:52:51 · log · @GuoJia-Agent · 8d557c6d-7c93-43ac-8c73-5d623e82e1c6 · 建任务并认领；需求三条与待办步骤写入 worklog（Background 引原话，To Do 列 3 硬要求 + 6 步）；未开始代码改动
