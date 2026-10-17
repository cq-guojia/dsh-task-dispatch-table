# 文档规范：每种文档落在哪

> 本文件只回答一件事：**本项目每一种文档落在哪个实际路径**。
> 槽位全集、命名纪律、写权限、生命周期由工作区级规则与进度工具定义 —— 本文件不复述、不摘引、不编号指代它们的条目（它们独立改版，抄来的必然过期）。
> 本仓库独有的其他约定见根目录 [`AGENTS.md`](../AGENTS.md)。

---

## 一、槽位表

| 槽位 | 本项目落位 |
|---|---|
| 文档规范 | `docs/README.md`（本文件） |
| 状态表 | `ledger/progress.json`（只由 task-ledger skill 的脚本写） |
| 已结案 | `ledger/history/<年月>.md`（只由脚本写；查询走 task-ledger skill 的 `history`） |
| 过程叙事 | `ledger/worklog/<年月>/`（一个任务一篇；实际路径由工具生成并记在状态表 `worklog` 字段，不靠推算） |
| 运行逻辑 | `docs/design/architecture.md`（总览）；系统机制规格另见 `docs/design/event-push.md`、`docs/design/client-refresh.md`、`docs/design/client-refresh-disposition.md` |
| 功能总索引 | `docs/design/features.md` |
| 各功能 | `docs/design/features/`（一功能一文件，清单见功能总索引） |
| 外部事实 | `docs/design/external/`：`dsh-capabilities.md`、`session-view-ui-map.md`、`host-webserver-streaming.md` |
| 数据库说明 | `docs/design/data-model.md` |
| 样式规范 | `docs/design/ui-foundation.md`（方案 = 抽象清单）+ `docs/design/ui-style-guide.md`（手册 = 使用规范） |
| 方法规范 | `docs/design/code-conventions.md` |
| 样例 | `docs/examples/`：`image-upgrade-daily.md`、`task-template.jsonc` |
| 对外配图（本项目追加槽位） | `docs/screenshots/`（根 `README.md` / `README.zh.md` 的配图，kebab-case 命名） |

---

## 二、本项目补充的写作约定

### 2.1 头部（`design/` 下文档必带）

```markdown
# <标题>

> **状态**：📝 待拍板 / 🔵 落码 / ✅ 定型
> **来源**：需求出处（用户原话 / 决策编号）
> **配套**：相关文档链接
```

`external/` 下的另加 `> **类型**：` 与 `> **适用版本**：`（写清是哪个包、哪个版本；宿主 / 官方升级后据此复核）。

### 2.2 命名

- `*-foundation.md` = 为什么这么设计；`*-guide.md` = 怎么做；两者内容不重复。

### 2.3 各层不得写什么

| 层 | 不得写 |
|---|---|
| `design/` 定型 | 进度、过程日志 |
| `external/` 外部事实 | 猜测、未核实内容；不得写成「我们的设计」 |
| `features/` 各功能 | 实现细节（归过程叙事） |
| 根 `README` 对外 | 内部设计 |

### 2.4 只链接，不摘引

文档之间、以及文档与外部规则之间，一律用链接指路 —— 不抄正文，也不用「见某文件第 X 节 / 第 X 条」这类编号定位：被引用方随时改版，抄来的和编号指来的都会过期。
