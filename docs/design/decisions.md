# 已定型的决策

> 含理由，**勿重复讨论**。要推翻请在本文件里改，并同步更新 [`docs/PROGRESS.md`](../PROGRESS.md) 的进展日志。

| # | 决策 | 理由 |
|---|---|---|
| 1 | **不用外部工作流引擎（n8n 等）做主引擎** | 它们的价值在大量 SaaS 连接器 + 可视化编排，本场景一个都用不上，退化成「一个 cron + 一个 HTTP 客户端」却仍压着一套中间件；且没有「会话/工作区」概念，感知不到 agent 执行状态 |
| 2 | **调度器 = DSH host 层插件** | 进程内可直接调 `ctx.sessions` / `ctx.on('session/event')`，比跨进程少一层中间层，感知最准 |
| 3 | **不走 ACP** | ACP（stdio JSON-RPC）是给**外部进程**用的协议；插件已在进程内，没有理由绕远路讲协议 |
| 4 | **不用子 agent 派发** | DSH subagent `inheritsParentContext: false`，且工作目录继承父会话 ⇒ 结构上做不到「派到另一个工作区」 |
| 5 | **不用同类的现成任务类插件** | 自研更可控；现有同类插件的维护活跃度与成熟度不足以满足需求 |
| 6 | **任务定义存 JSON 文件** | 人改、低频、需 diff/review/git。**不进数据库** |
| 7 | **任务状态存 SQLite** | ① JSON 做不到**原子领取**（CAS）② 文件同步工具会生成冲突副本、撕碎状态文件 ③ 跨天查询要遍历多文件。Postgres 对这个规模太重 |
| 8 | **依赖由下游声明**（dependents declared by downstream） | 加下游不改上游：A 本来无下游，后来 B、D 都要用 A，只需在 B、D 上声明，A 一无所知。Airflow / K8s Job / GHA `needs` / Bazel 都是这个模型 |
| 9 | **依赖语义两种，任务自己声明** | `same_period`（找**同一 logical date** 的上游实例，缺则跳过）/ `latest_success`（找**最近一次成功** + 新鲜度上限）。只有前者的话，跨周期依赖（月榜→日报）会失效——详见 [state-machine.md](state-machine.md) |
| 10 | **失败策略** | 重试 N 次 → 仍失败则 `failed` → **下游跳过（不分配）**；当日窗口内修复则继续，**过窗口则整条链作废、切次日新实例** |
| 11 | **agent 不写任务状态** | 控制平面 / 数据平面分离：agent 只能写**产物文件**，状态**只由调度器写**。理由：大模型自报不可信 |
| 12 | **任务手册用工作区 MD 文件**（调度器把路径写进派发 prompt），**不做成 skill** | 见 [task-manual-vs-skill.md](task-manual-vs-skill.md) |
| 13 | **调度器的定时器用官方 `ctx.interval` / `inject: ['timer']`** | 模块作用域的裸 `setInterval` 永不被清理；官方机制在插件卸载时自动清理 |

---

## 附录：插件命名与查重记录

**已定名**：`dsh-task-dispatch-table`。
构词与官方示例 `dsh-session-title-pattern` 同构：`<对象>-<动作>-<载体>` = task(对象) / dispatch(动作) / **table(载体)**。
用 "table" 是因为本设计最独特的一点——**表驱动**（其他插件是看板/管理器，不是「一张表 + 派发」）。

**同名设想（未采用）**：`dsh-task-reconciler`（对账器，最短）/ `dsh-task-dispatch-loop`（派发循环）/ `dsh-agent-task-dispatch`（强调派给 agent）/ `dsh-workspace-task-dispatch`（强调派到指定工作区）/ `dsh-dispatch-table`、`dsh-task-dispatch-engine`（备用）。

**生态现状**：`task` + 通用词（scheduler / runner / manager / engine / orchestrator / board / dag / flow / hub / center / relay）的组合基本已被占满，取新名必须带**差异化词素**。

查重方法（可复现）：

```bash
# npm：404=可用，200=已占
curl -sS -m 15 -o /dev/null -w "%{http_code}\n" https://registry.npmjs.org/<name>
# GitHub：输出为空=未占用（需 gh 已登录）
gh api -X GET search/repositories -f q='<name> in:name' --jq '.items[].name' | grep -cx '<name>'
```

备注：npm 上 DSH 插件多为 **scoped 包**，公开发布时用 scoped 包名防撞且归属清晰。
