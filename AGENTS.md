# AGENTS.md

> 给 coding agent 的操作守则。**接手本仓库前先读完本文件。** README.md 是给人的门面，本文件才是 agent 的操作入口。
> 遵循 [AGENTS.md](https://agents.md) 开放标准，固定放仓库根目录；文档全部用中文。

## 一、接手流程（每次换会话从这里开始）

1. **读现场**：读 [`docs/PROGRESS.md`](docs/PROGRESS.md) 的三节——**当前状态 → 未决项 → 下一步**。这就是全部工作现场，不依赖聊天记录。
2. **动手前**：涉及「未决项」的先推动拍板再动工；发现与 `docs/design/` 冲突的，以 design/ 为准，并向用户提示冲突。
3. **干完后必须回写**（规则见下节）：
   - PROGRESS.md：更新「当前状态 / 未决项 / 下一步」，追加进展日志
   - 有决策拍板 → 追加 [`docs/design/decisions.md`](docs/design/decisions.md)
   - 设计定型 → 升格 `docs/design/` 专题文档，PROGRESS 只留链接

## 二、文档体系（唯一真源，不建副本）

| 文档 | 角色 | 何时更新 |
|---|---|---|
| README.md | 给人的门面：是什么、怎么装 | 项目定位变化 |
| AGENTS.md（本文件） | 给 agent 的守则与导航 | 工作规矩变化 |
| docs/PROGRESS.md | **唯一进度真源**：状态 / 未决项 / 下一步 / 进展日志 | **每次推进后** |
| docs/design/decisions.md | 已定型决策 + 理由（ADR 日志，勿重复讨论） | 决策拍板时 |
| docs/design/architecture.md | 架构参考（稳定） | 定型内容变更 |
| docs/design/data-model.md | 任务定义字段与状态库 DDL（定型） | 定型内容变更 |
| docs/design/state-machine.md | 状态机与依赖语义规格（活跃） | 设计推进时 |
| docs/examples/ | 任务样例（仅文档示例，与代码零耦合） | 新样例或字段变化 |

**维护规则**：

1. **真源分工**：进度只在 PROGRESS.md，决策只在 decisions.md，设计只在 design/。README / Issues / 聊天记录都不算真源。
2. **就地更新**：文件名与位置固定，不新建、不改名、不搬走、不做日期归档——版本历史由 Git 承担。
3. **定型升格**：内容一旦定型，从 PROGRESS.md 升格到 design/ 专题文档，PROGRESS 只留链接，避免双份副本过期。
4. **日志追加**：PROGRESS.md 的进展日志是追加式、最新在最后，每条一行带日期。
5. **命名**：文档/文件固定名、纯 ASCII 小写 kebab-case，表角色不表时间（不带日期前缀、不带版本号）。

## 三、工作规矩

1. **写操作闸门**：destructive 操作（重写历史、强推、删远端）必须先获用户明确指令。
2. **dist 入库**：`dist/` 提交进仓库（dsh 生态 git 安装的惯例——pnpm 不跑构建脚本，装完即用）。**任何代码变更推送前必须 `npm run build` 并把最新 `dist/` 一并提交**，否则用户装到旧产物。
3. **先结论后证据**：结论必须可追溯到源码 `文件:行号` 或日志原文。
4. **少折腾**：先问「能不能直连 / 有没有更短路径」，再考虑加组件。
5. **脱敏**：本机与私有部署细节（容器名、内网地址与端口、代理地址、compose 位置等）一律不入仓库，只保留抽象结论。
6. **跨会话记忆**：长期记忆由 Hindsight（记忆层，见 architecture.md）自动承载，会话结束自动回写，无需手动保存；但**项目现场以 PROGRESS.md 为准**。

## 四、仓库布局

```
README.md              # 门面（人看）
AGENTS.md              # agent 守则（本文件）
LICENSE                # MIT
package.json           # npm 包元数据（v0.0.1，含 dsh.bundle.patch 声明）
index.js               # 占位 stub（已由 dist/ 取代，见 git 历史）
dist/                  # 构建产物（入库：git 安装免构建）
docs/
  PROGRESS.md          # 进度真源（换会话先读）
  design/
    architecture.md    # 三层架构、职责边界
    decisions.md       # 已定型决策 + 理由
    data-model.md      # 任务定义字段、状态库 DDL
    state-machine.md   # 状态机与依赖语义
  examples/
    image-upgrade-daily.md  # 首个任务样例
```
