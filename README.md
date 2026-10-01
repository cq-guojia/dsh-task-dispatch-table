# dsh-task-dispatch-table · 定时任务调度器

一个 **dsh（DeepSeek Harness）host 层插件**：用**一张任务定义表**驱动周期性任务，按时间窗与依赖关系把每个任务派发成一个**独立的 dsh 会话**去执行。

> ⚠️ **项目状态：骨架已实现（v0.0.1），未做真机联调，请勿安装。** 进度见 [`docs/PROGRESS.md`](docs/PROGRESS.md)。

## 它要解决什么

起因是四类周期性自动化需求：

| # | 需求 | 核心难点 |
|---|---|---|
| 1 | 每 N 小时巡检容器与主机资源，异常立即上报 | 高频、纯阈值判断，不该烧 token |
| 2 | 每天查镜像升级，汇报「更新了什么 + 是否建议升」 | 需要**判断**（读 release notes 评风险） |
| 3 | 每天汇报 GitHub 上自己的 PR / Issue 进展 | 归纳 |
| 4 | 每天列 GitHub 趋势项目，给出「新增 / 替换 / 观望」建议 | 重度判断 |

这四件事本身不是重点，重点是：**这类任务以后会有很多，需要一套通用的调度体系**——能拆解、有依赖、可复用、可无人值守。

其中 3 件事的价值在「判断」，而判断只有 agent 能做；**调度本身是纯程序逻辑，一行 token 都不该烧**。

## 设计要点

- **表驱动**：任务定义是一份 JSON 文件，人改、可 review、进 Git。
- **调度器零大模型介入**：定时 tick → 判时间 → 判前置 → 派发，全部是程序逻辑。
- **下依赖由下游声明**：加下游不改上游（Airflow / GitHub Actions `needs` 的模型）。
- **控制平面与数据平面分离**：agent 只写产物，**任务状态只由调度器写**。
- **状态存 SQLite**（原子领取），任务定义存 JSON。

选型理由（为什么不引外部工作流引擎 / 不走 ACP / 不用 subagent 派发）见 [`docs/design/architecture.md`](docs/design/architecture.md) 的「关键约束」。

## 文档

| 想看什么 | 去哪 |
|---|---|
| 项目进度、未决项、下一步 | [`docs/PROGRESS.md`](docs/PROGRESS.md) |
| **文档规范**（写文档放哪、怎么写） | [`docs/README.md`](docs/README.md) |
| 三层架构与职责边界、选型约束 | [`docs/design/architecture.md`](docs/design/architecture.md) |
| 表结构与字段语义 | [`docs/design/data-model.md`](docs/design/data-model.md) |
| 有哪些功能、对应哪个页面 | [`docs/design/features.md`](docs/design/features.md) |
| 状态机、依赖语义、必补机制 | [`docs/design/features/state-machine.md`](docs/design/features/state-machine.md) |
| 通用方法复用规范 | [`docs/design/code-conventions.md`](docs/design/code-conventions.md) |
| 界面样式规范 | [`docs/design/ui-style-guide.md`](docs/design/ui-style-guide.md) |
| agent 接手守则（工具自动挂载） | [`AGENTS.md`](AGENTS.md) |
| 公用规则真源（跨工作区） | [`RULES.md`](RULES.md) |

## 环境前提（脱敏）

| 项 | 结论 |
|---|---|
| 宿主形态 | DSH 以容器运行，工作区是**挂载卷** ⇒ SQLite 状态文件必须落在挂载卷内，否则容器重建即丢 |
| 网络 | 宿主同时接内网与公网 ⇒ 可直连内网服务；注意代理 / `NO_PROXY` 配置 |
| 容器巡检数据入口 | Docker 引擎提供只读 HTTP API；容器内无 curl，用 node `fetch` |
| 配置生效 | 改工作区文件不等于改运行中的配置，实际生效以部署侧为准 |

## 项目信息

- 包名规划：采用 scoped 包名（npm 上 dsh 插件多为 scoped 包）。
- 当前最缺拍板的几个问题列在 [`docs/PROGRESS.md`](docs/PROGRESS.md) 的「未决项」。

## License

[MIT](LICENSE) © 2026 cq-guojia
