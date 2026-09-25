# AGENTS.md

> 给 coding agent 的操作守则。**接手本仓库前先读完本文件。** README.md 是给人的门面，本文件才是 agent 的操作入口。
> 遵循 [AGENTS.md](https://agents.md) 开放标准，固定放仓库根目录；文档全部用中文。

## 一、接手流程（每次换会话从这里开始）

1. **读现场**：读 [`docs/PROGRESS.md`](docs/PROGRESS.md) 的三节——**当前状态 → 未决项 → 下一步**。这就是全部工作现场，不依赖聊天记录。需要某个历史工作包的细节（踩坑 / 定位 / 真机证据），按 PROGRESS「里程碑索引」里的链接读对应的 [`docs/worklog/`](docs/worklog/) 文件，**不全文通读**。
2. **动手前**：涉及「未决项」的先推动拍板再动工；发现与 `docs/design/` 冲突的，以 design/ 为准，并向用户提示冲突。
3. **干完后必须回写**（规则见下节）：
   - PROGRESS.md：更新「当前状态 / 未决项 / 下一步 / 里程碑索引」
   - 工作包详情（踩坑、定位、决策过程、真机证据）→ 写 `docs/worklog/<工作包名>.md`，做完**封卷**，PROGRESS 索引表只留一行
   - 有决策拍板 → 追加 [`docs/design/decisions.md`](docs/design/decisions.md)（只留结论与核心理由）
   - 设计定型 → 升格 `docs/design/` 专题文档，PROGRESS 只留链接

## 二、文档体系（唯一真源，不建副本）

三层按**信息寿命**分层：现场层（短命，随时覆盖）→ 叙事层（中命，封卷不再动）→ 定型层（长命，稳定）。

| 文档 | 层 | 角色 | 何时更新 |
|---|---|---|---|
| README.md | 门面 | 给人的门面：是什么、怎么装 | 项目定位变化 |
| AGENTS.md（本文件） | 规则 | 给 agent 的守则与导航 | 工作规矩变化 |
| docs/PROGRESS.md | **现场** | **唯一进度真源**：当前状态 / 未决项 / 下一步 / 里程碑索引 | **每次推进后** |
| docs/worklog/*.md | **叙事** | 工作包过程叙事：每个工作包一个文件，做完封卷不再更新 | 工作包进行中 |
| docs/design/decisions.md | **定型** | 已定型决策 + 理由（ADR 日志，勿重复讨论） | 决策拍板时 |
| docs/design/architecture.md | **定型** | 架构参考（稳定） | 定型内容变更 |
| docs/design/data-model.md | **定型** | 任务定义字段与状态库 DDL（定型） | 定型内容变更 |
| docs/design/state-machine.md | **定型** | 状态机与依赖语义规格 | 设计推进时 |
| docs/design/dsh-capabilities.md | **定型** | 已核实的 DSH 宿主能力事实清单（源码级） | 新能力核实后 |
| docs/examples/ | **定型** | 任务样例（仅文档示例，与代码零耦合） | 新样例或字段变化 |

**维护规则**：

1. **真源分工**：进度只在 PROGRESS.md，工作包过程只在 worklog/，决策只在 decisions.md，设计只在 design/。README / Issues / 聊天记录都不算真源。
2. **分层归宿**：写任何东西前先问它属于哪一层——「现在该干什么」进 PROGRESS；「这事当时怎么踩坑怎么解的」进 worklog；「以后一直要遵守的」进 design/。
3. **worklog 封卷制**：**一个工作包一个文件**（纯 ASCII 小写 kebab-case 命名，如 `identity-gate.md`），进行中实时更新，**做完即封卷**——文件头部标「✅ 完成封卷」，此后不再修改（遗留问题回 PROGRESS 的未决项）。不按日期归档、不合并、不拆分。
4. **PROGRESS 恒定小**：进展日志**不写进 PROGRESS**；工作包完成后在里程碑索引表**加一行**（编号 / 名称 / 状态 / 时间 / 一句话 / worklog 链接）。目标是任何 agent 30 秒读完现场。
5. **定型升格**：内容一旦定型，从 PROGRESS / worklog 升格到 design/ 专题文档，原处只留链接，避免双份副本过期。
6. **命名**：文档/文件固定名、纯 ASCII 小写 kebab-case，表角色不表时间（不带日期前缀、不带版本号）。

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
  PROGRESS.md          # 进度真源·现场层（换会话先读，恒定小）
  worklog/             # 工作包过程叙事·叙事层（一个工作包一个文件，做完封卷）
    genesis.md         #   立项、选型与设计定型（含 Web 配置页）
    once-dispatch.md   #   一次性任务、回执与派发链路（决策 18-24，首链路跑绿）
    ticks-identity.md  #   刻度化调度与执行身份（决策 25/26）
    session-view.md    #   查看会话三部曲（决策 27→28→29）
    rc1-migration.md   #   宿主 0.1.7-rc.1 迁移与数据通道重构
    runtime-compat.md  #   0.1.7 兼容性排障（ENOENT / v4 格式）
    persistence.md     #   持久化主通道（meta 表）与调试页
    identity-gate.md   #   任务身份闸门（决策 30 三拍）
  design/              # 定型层（稳定，只记结论与事实）
    architecture.md    # 三层架构、职责边界
    decisions.md       # 已定型决策 + 理由（30 条）
    data-model.md      # 任务定义字段、状态库 DDL
    state-machine.md   # 状态机与依赖语义
    dsh-capabilities.md # 已核实的 DSH 宿主能力事实清单（源码级）
  examples/
    image-upgrade-daily.md  # 首个任务样例
    task-template.jsonc     # 全字段注释版任务定义模板
```
