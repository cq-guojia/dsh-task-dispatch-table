# 工作区（Workspace）身份：`id` / `title` / `path`

- **类型**：外部事实（宿主工作区注册表）
- **适用版本**：`@deepseek-ai/dsh-workspace@0.2.0-rc.2`、`@deepseek-ai/dsh-api-workspace-controller@0.2.0-rc.2`
- **状态**：已核实（2026-11-06，读 npm 解包实现源码，非试错）
- **来源**：`dsh-workspace/lib/index.js`、`dsh-workspace/lib/types/types.d.ts`、`dsh-api-workspace-controller/lib/index.js`、`lib/client.js`
- **配套**：[`dsh-capabilities.md`](dsh-capabilities.md)（工作区取数通路 / 会话锚点）

## 一、三个字段各是什么

| 字段 | 事实 |
|---|---|
| `id` | 创建时 `WorkspaceId(randomUUID())` —— **随机 UUID**，不是路径也不是标题（`dsh-workspace/lib/index.js:644`；bootstrap 建记录同 `:786`） |
| `title` | 纯展示名，可改；`rename` 只调 `workspace.setTitle(title)`，**`id` 不变**（`dsh-api-workspace-controller/lib/index.js:234-242`；client 侧 `rename(workspaceId, title)` 见 `lib/client.js:72-75`） |
| `path` | 绝对路径（工作区根）。会话按 header cwd 归一后归组；`bootstrap` 按 `path` 复用例表里**仍存在**的旧 id（`dsh-workspace/lib/index.js:775-786`） |

## 二、关键推论（本仓据此做存储决策）

| 动作 | `id` 是否稳定 | 后果 |
|---|---|---|
| 改工作区**标题** | ✅ 不变 | 存 id 的任务**照常可用**；存旧标题则失联 |
| **删除**工作区 | — | 记录从表里消失 |
| 删除后**同路径重建** | ❌ 新 UUID | 旧 id 变成悬空值（任务必须报错让用户重选，不能按路径猜「还是那个工作区」） |
| 移动工作区目录 | ❌ 视为另一个工作区 | 按 path 存同样会失联 |

- **registry 没有按标题查询的接口**：只有 `list()` / `get(id)`（`dsh-workspace/lib/index.js:637-654`、controller `requireWorkspace`）⇒ 按标题找只能自己遍历。本仓 `resolveWorkspace`（`src/dispatch.ts`）就是 **title 精确匹配 + id 兜底**。
- **用户的问题与答案**（2026-11-06）：任务当初记的是 `title` ⇒ 改名后找不到是**必然**；应改存 `id`（改名不失效）；删了重建则 id 变、必须报错重选。

## 三、本仓落地口径

- `target.workspace` **存 `id`**（任务定义、附件 `workspace` 同口径）。
- **向下兼容只在执行期做**：老任务存 `title` 时，调度解析成功后**就地改存 `id`**；解析不到 ⇒ 执行失败报错（不猜、不拿「未知工作区」硬跑）。**不做启动批量迁移**、保存时也不做标题→id 翻译（用户 2026-11-06 明确要求，减少常驻负担）。
- 保存（单条 + 整批 `tasksInline`）**必须校验工作区 id 真实存在**，否则 422 让用户重选。
