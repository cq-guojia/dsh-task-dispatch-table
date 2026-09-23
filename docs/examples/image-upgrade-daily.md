# 示例：镜像升级日报任务

> **这是什么**：本仓库的**文档示例**——演示一个真实任务如何用本插件定义，也是数据模型字段设计的验证物与实现阶段的验收参照。
> 它不是插件代码，不会被安装、执行或打进 npm 包；部署时，任务定义、手册、产物都落在**用户自己的 DSH 工作区**，与本仓库零耦合。
> 字段语义见 [`design/data-model.md`](../design/data-model.md)。

## 一、任务定义 `tasks/image-upgrade-daily.json`

```jsonc
{
  "id": "image-upgrade-daily",
  "enabled": true,
  "schedule": {
    "cron": "0 9 * * *",          // 每天 09:00（timezone 缺省 = 宿主时区）
    "window": "PT4H"              // 09:00–13:00 内没跑成 → skipped，切次日实例
  },
  "target": {
    "workspace": "ops",           // 派发到 ops 工作区（独立会话，非子 agent）
    "provider": "deepseek",       // provider + model 成对；两者都省略 = 走宿主默认模型漏斗（决策 22）
    "model": "deepseek-chat",
    "manual": "manuals/image-upgrade-daily.md",
    "prompt": "执行镜像升级日报任务，按手册完成。"
  },
  "contract": {
    "validStatuses": ["ok"]       // 回执 status 合法值（决策 19：无契约文件，回执直写状态库）
  },
  "retry": { "maxAttempts": 2 }   // 重试 1 次仍失败 → failed
  // depends_on 省略：本样例是独立任务；链式依赖（same_period / latest_success）
  // 等有真实需求时再补第二个样例展示
}
```

## 二、回执（决策 19：直写插件状态库，无契约文件）

agent 干完活后执行**调度器拼好、随派发消息下发**的命令，把回执直写插件状态库（`state.db` 的 `task_events` 表）：

```bash
node <插件dist>/submit.js --db <state.db> \
  --task image-upgrade-daily --date 2026-09-23 --session <sessionId> \
  --status ok --outputs "artifacts/image-upgrade-daily/2026-09-23.md"
```

调度器对账**只查库不读文件**，三查：**派发之后有 receipt 事件 + `status` ∈ validStatuses + outputs 逐一存在且 mtime 晚于本次派发**（防旧产物冒充）。
跑完没交回执 → 宽限期后插件对原会话追问（重发命令，≤2 次）→ 仍无按失败处理。

## 三、任务手册 `manuals/image-upgrade-daily.md`

调度器把路径拼进派发消息，agent 主动读（决策 12：工作区 MD 文件，非 skill）。

```markdown
# 镜像升级日报

1. 用 node fetch 调 Docker 引擎只读 HTTP API，列出全部容器及其当前镜像
2. 逐个查 registry 是否有更新版本；读 release notes 评估升级风险
3. 产出日报 MD：今天查了什么、哪些可升、建议（升 / 观望）及理由
4. 执行派发消息里的回执命令提交回执（--status 必须如实，失败的检查不得伪装成 ok）
```

> 手册逐字版在实现阶段对着真实 DSH 环境再敲定，这里只给形状。
