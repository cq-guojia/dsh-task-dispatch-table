# 本工作区的强制约定（Agent 每次会话自动遵守）

> 本工作区是 Git 仓库，由 CodeBuddy / TraeCode / DSH 等多个 coding agent、多台机器共用；文件随仓库提交入 Git，**从 Git 取用**。
> 本文件每轮全量加载 ⇒ 只写「不写就会做错」的规则；会变的事实不写。

<!-- ==== RULES BEGIN ==== -->
> ⚠️ 本标记区内容由程序自动注入，禁止手改（改了下轮同步即被覆盖）；工作区自有规则写在下方「RULES END」标记之后。

**公用规则（强制）**：全文在同级 [`RULES.md`](RULES.md)，由用户独占维护、随时会改。

- 会话开始前**必须完整读取该文件并遵守**，不要凭印象代替阅读。
- 本文件**不复述、不摘引、不指代**它的任何条目与序号；两边序号各自独立。
<!-- ==== RULES END ==== -->

---

# dsh-task-dispatch-table — agent 操作守则

> 本文件只写**本仓库独有**的东西：本项目的文档落点与本项目约定。
> 通用规矩（写操作、git、接手入口、文档骨架）在程序注入区指向的那份公用规则文件里，**本文件不重复、不摘引、不指代**它。

## 一、本项目的文档落点（要做什么 → 先读哪份）

| 我要做 | 先读 |
|---|---|
| 写界面 / 改样式 | [`docs/design/ui-style-guide.md`](docs/design/ui-style-guide.md)（要动抽象本身再看 [`ui-foundation.md`](docs/design/ui-foundation.md)） |
| 抽公共逻辑 / 复用方法 | [`docs/design/code-conventions.md`](docs/design/code-conventions.md) |
| 改表 / 写 SQL / 查字段语义 | [`docs/design/data-model.md`](docs/design/data-model.md) |
| 找功能、看它对应哪个页面 | [`docs/design/features.md`](docs/design/features.md) |
| 接宿主（DSH）接口 | [`docs/design/dsh-capabilities.md`](docs/design/dsh-capabilities.md) |
| 镜像官方会话 UI | [`docs/design/session-view-ui-map.md`](docs/design/session-view-ui-map.md) |
| 某个功能当时怎么做的、踩过什么坑 | `docs/worklog/<工作包名>.md` |
| **写 / 归置任何文档** | [`docs/README.md`](docs/README.md)（唯一索引） |

## 二、本项目独有的约定

1. **dist 入库**：`dist/` 提交进仓库（dsh 生态 git 安装的惯例——pnpm 不跑构建脚本，装完即用）。**任何代码变更推送前必须 `npm run build` 并把最新 `dist/` 一并提交**，否则用户装到旧产物。
2. **代码改动先过冒烟**：`npm run smoke` 直接测 `dist/` 产物；发布前另跑 `npm run typecheck`。
3. **远端 = SSH 直连**：remote 为 `git@github.com:cq-guojia/dsh-task-dispatch-table.git`，走 `~/.ssh/id_ed25519`；**本仓库用户说「提交」= `commit` + `push` 一次做完**；不得改回 https、不得走代理或任何绕路（推不上去原样报告）。
4. **凡涉及宿主（DSH）接口，一律「先读源码与文档，再动手」，禁止靠运行时试探猜 API**：
   - 顺序固定：**① 查本项目的 [`dsh-capabilities.md`](docs/design/dsh-capabilities.md) 与相关定型文档（已核实的源码级事实，先查再动手）→ ② 找源码读实现 → ③ 仍无结论才问用户**。
   - 找源码两条路：**本地先找**（`node_modules/@deepseek-ai/*`、宿主安装目录）；**本地没有就上网拽**——`npm view @deepseek-ai/<包> dist-tags` 取与宿主一致的版本（宿主版本线见 capabilities 表头），再 `npm pack @deepseek-ai/<包>@<版本>` 下载解包，直接读 `lib/*.js`。
   - **要读到实现本体**（方法签名、判空、抛错分支），不是只看 `.d.ts`；报错栈给出的 `client.js:行号` 就是精确坐标，直接定位。
   - ⚠️ **禁止**：凭方法名猜签名后反复真机试错（本仓库曾因此在「查看会话」一个点上耗掉十几轮）；「一次把候选全埋探针刷日志」同样违规——**要的是读源码，不是加探针**。
5. **正常功能的数据一律真实取数，禁止模拟**：界面上展示的任何数据（token 用量、时间、状态、计数……）必须来自宿主/官方数据面或自有存储的**真实值**；不得编造、占位或「先放个假数据看看效果」。只有用户**明确要求**「做个效果看看」时才允许 mock，且必须在代码与交付说明里标注是模拟数据。
6. **文档与代码冲突时，以源码现状为准**：发现文档说法与实现不一致，先读源码确认「现在实际是什么」，按实现回改文档并向用户提示分歧；**不得凭文档猜实现**（2026-10-01 一次性回改 9 处即此例）。

## 三、本项目的文档体系（细则一律见 [`docs/README.md`](docs/README.md)）

| 层 | 本项目落位 | 规矩 |
|---|---|---|
| 现场·进行中 | [`docs/PROGRESS.md`](docs/PROGRESS.md) | 只装在办的事：当前状态 / 未决项 / 下一步 |
| 现场·已结案 | [`docs/PROGRESS-HISTORY.md`](docs/PROGRESS-HISTORY.md) | 一行一条：时间 / 完成了什么 / 过程文档；不写过程 |
| 叙事 | `docs/worklog/<工作包名>.md` | 一个工作包一个文件；完成即封卷，此后不改 |
| 定型 | `docs/design/`（各专题 + `features/` 功能文档） | 改它 = 改规矩 |
| 样例 | `docs/examples/` | 与代码零耦合 |

- **拍板结论写进归属文档**（功能决策进功能文档、样式决策进样式文档……），**不另建决策文件**。
- 目录、命名、每类"必须写 / 不得写"、生命周期、硬规则：**全在 [`docs/README.md`](docs/README.md)**，本文件不复述。
