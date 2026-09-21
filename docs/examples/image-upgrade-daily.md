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
    "model": "deepseek-chat",
    "manual": "manuals/image-upgrade-daily.md",
    "prompt": "执行镜像升级日报任务，按手册完成并写契约文件。"
  },
  "contract": {
    "path": "artifacts/image-upgrade-daily/report.json",
    "validStatuses": ["ok"]
  },
  "retry": { "maxAttempts": 2 }   // 重试 1 次仍失败 → failed
  // depends_on 省略：本样例是独立任务；链式依赖（same_period / latest_success）
  // 等有真实需求时再补第二个样例展示
}
```

## 二、产物契约 `artifacts/image-upgrade-daily/report.json`

由 agent 在目标工作区写出，调度器对账时三查：**存在 + `status` 合法 + mtime 晚于本次派发**。

```jsonc
{
  "status": "ok",                 // 合法值来自 contract.validStatuses
  "checked": 12,                  // 巡检容器数
  "upgradable": 2,                // 有新版本的容器数
  "report": "artifacts/image-upgrade-daily/2026-09-21.md"   // 人类可读日报的位置
}
```

## 三、任务手册 `manuals/image-upgrade-daily.md`

调度器把路径拼进派发消息，agent 主动读（决策 12：工作区 MD 文件，非 skill）。

```markdown
# 镜像升级日报

1. 用 node fetch 调 Docker 引擎只读 HTTP API，列出全部容器及其当前镜像
2. 逐个查 registry 是否有更新版本；读 release notes 评估升级风险
3. 产出日报 MD：今天查了什么、哪些可升、建议（升 / 观望）及理由
4. 写契约文件 report.json——status 必须如实，失败的检查不得伪装成 ok
```

> 手册逐字版在实现阶段对着真实 DSH 环境再敲定，这里只给形状。
