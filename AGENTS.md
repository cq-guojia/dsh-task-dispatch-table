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

> 本文件只写**本仓库独有**的东西：接手流程与仓库独有约定；与上方标记区指向的公用规则文件**互不引用、各自自洽**。

## 一、接手流程（每次换会话从这里开始）

1. **读现场**：读 [`docs/PROGRESS.md`](docs/PROGRESS.md) 的三节——**当前状态 → 未决项 → 下一步**。这就是全部工作现场，不依赖聊天记录。需要某个历史工作包的细节（踩坑 / 定位 / 真机证据），按 PROGRESS「里程碑索引」里的链接读对应的 [`docs/worklog/`](docs/worklog/) 文件，**不全文通读**。
2. **动手前**：涉及「未决项」的先推动拍板再动工；发现与 [`docs/design/`](docs/design/) 冲突的，以 design/ 为准，并向用户提示冲突。
3. **干完后必须回写**：
   - 现场 → [`docs/PROGRESS.md`](docs/PROGRESS.md)：当前状态 / 未决项 / 下一步 / 里程碑索引
   - 过程 → `docs/worklog/<工作包名>.md`
   - 决策 → [`docs/design/decisions.md`](docs/design/decisions.md)；定型设计 → [`docs/design/`](docs/design/) 专题文档

## 二、本仓库独有的约定

1. **dist 入库**：`dist/` 提交进仓库（dsh 生态 git 安装的惯例——pnpm 不跑构建脚本，装完即用）。**任何代码变更推送前必须 `npm run build` 并把最新 `dist/` 一并提交**，否则用户装到旧产物。
2. **代码改动先过冒烟**：`npm run smoke` 直接测 `dist/` 产物；发布前另跑 `npm run typecheck`。
3. **远端 = SSH 直连**：remote 为 `git@github.com:cq-guojia/dsh-task-dispatch-table.git`，走 `~/.ssh/id_ed25519`；**本仓库用户说「提交」= `commit` + `push` 一次做完**；不得改回 https、不得走代理或任何绕路（推不上去原样报告）。
4. **凡涉及宿主（DSH）接口，一律「先读源码与文档，再动手」，禁止靠运行时试探猜 API**：
   - 顺序固定：**① 查 [`docs/design/dsh-capabilities.md`](docs/design/dsh-capabilities.md) 与 [`docs/design/decisions.md`](docs/design/decisions.md)（已核实的源码级事实，先查再动手）→ ② 找源码读实现 → ③ 仍无结论才问用户**。
   - 找源码两条路：**本地先找**（`node_modules/@deepseek-ai/*`、宿主安装目录）；**本地没有就上网拽**——`npm view @deepseek-ai/<包> dist-tags` 取与宿主一致的版本（宿主版本线见 capabilities 表头），再 `npm pack @deepseek-ai/<包>@<版本>` 下载解包，直接读 `lib/*.js`。
   - **要读到实现本体**（方法签名、判空、抛错分支），不是只看 `.d.ts`；报错栈给出的 `client.js:行号` 就是精确坐标，直接定位。
   - ⚠️ **禁止**：凭方法名猜签名后反复真机试错（本仓库曾因此在「查看会话」一个点上耗掉十几轮）；「一次把候选全埋探针刷日志」同样违规——**要的是读源码，不是加探针**。

