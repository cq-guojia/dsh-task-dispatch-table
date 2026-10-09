# dsh-task-dispatch-table — agent 操作守则

> 本工作区是 Git 仓库，由 CodeBuddy / TraeCode / DSH 等多个 coding agent、多台机器共用；文件随仓库提交入 Git，**从 Git 取用**。
> 本文件每轮全量加载 ⇒ 只写「不写就会做错」的东西；会变的事实不写。
> 通用规矩由工作区级规则统一注入，本文件不重复、不指代它们，只写本仓库独有的补充。

## 一、本项目的文档落点（要做什么 → 先读哪份）

| 我要做 | 先读 |
|---|---|
| 写界面 / 改样式 | [`docs/design/ui-style-guide.md`](docs/design/ui-style-guide.md)（要动抽象本身再看 [`ui-foundation.md`](docs/design/ui-foundation.md)） |
| 抽公共逻辑 / 复用方法 | [`docs/design/code-conventions.md`](docs/design/code-conventions.md) |
| 改表 / 写 SQL / 查字段语义 | [`docs/design/data-model.md`](docs/design/data-model.md) |
| 找功能、看它对应哪个页面 | [`docs/design/features.md`](docs/design/features.md) |
| 接宿主（DSH）接口 | [`docs/design/external/dsh-capabilities.md`](docs/design/external/dsh-capabilities.md) |
| 镜像官方会话 UI | [`docs/design/external/session-view-ui-map.md`](docs/design/external/session-view-ui-map.md) |
| 某个功能当时怎么做的、踩过什么坑 | `docs/worklog/<工作包名>.md` |
| **写 / 归置任何文档** | [`docs/README.md`](docs/README.md)（唯一索引） |

## 二、本项目独有的约定

1. **验证命令**：改动先跑 `npm run smoke`（直接测 `dist/` 产物）；推送前另跑 `npm run typecheck`。
2. **远端 = SSH 直连**：remote 为 `git@github.com:cq-guojia/dsh-task-dispatch-table.git`，走 `~/.ssh/id_ed25519`；**不得擅改**（改回 https、走代理、改凭证链都算改；推不上去就原样报告错误）。
3. **宿主（DSH）接口的结论必须回写**：读源码 / 读文档得到的结论（**含对旧结论的更正**）写进 [`docs/design/external/`](docs/design/external/) —— 该主题**已有**文档就补充或更正，**没有**就新建一篇（头部写清：类型 / 适用版本 / 状态 / 来源 / 配套）；过程另记 `docs/worklog/<工作包名>.md`。**不许只留在对话里** —— 下次没人知道，同一个点会被重复排查。
   - **每条结论都标「适用版本」**：写清是哪个包、哪个版本（宿主 / 官方升级后据此复核）；跨版本有差异就逐条注明。
