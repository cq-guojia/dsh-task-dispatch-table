# 为什么任务手册用 MD 文件而不是 skill

官方 handbook（`sessions-vs-memory`）明确立场：

> "A fifth mechanism—**Skills or workspace instructions**—stores stable operating guidance.
> **Do not put policy into semantic memory** and hope retrieval happens.
> **If an Agent must always follow a rule, mount that rule deterministically.**"

## 分层方案（四层，非二选一）

| 内容 | 放哪 | 加载方式 |
|---|---|---|
| 短指令 | 任务定义 JSON 的 `prompt` 字段 | 调度器拼进派发消息 |
| **任务专属长手册** | **工作区里的 MD 文件**，路径写进 prompt | agent 主动读 |
| 跨任务铁律 | 工作区 `AGENTS.md` | **确定性挂载**（官方指定） |
| 多任务 + 人机共享的流程 | skill | 元数据常驻 + 正文按需 |

## skill 的唯一适用场景

某流程**既要被自动任务用、又要被人手动问时用**。

只服务一个任务的手册做成 skill 是绕远路——skill 的机制价值在「让模型自己发现」，而调度器**已经知道该用哪份**。
