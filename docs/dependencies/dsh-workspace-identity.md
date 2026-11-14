# 工作区（Workspace）身份：`id` / `title` / `path`

- 用途：记录该外部依赖在本项目里实际用到的行为与边界（宿主升级后据此复核）。
- 版本真源：包名与版本见上「适用版本」；每条结论的 `文件:行号` 就在正文各节。
- 复核日期：2026-11-09（第三节按本仓源码复核；宿主事实沿用各节标注版本）

- 类型：外部事实（宿主工作区注册表）
- 适用版本：`@deepseek-ai/dsh-workspace@0.2.0-rc.2`、`@deepseek-ai/dsh-api-workspace-controller@0.2.0-rc.2`
- 状态：已核实（2026-11-06 读 npm 解包实现源码，非试错；2026-11-09 复核存储口径）
- 来源：`dsh-workspace/lib/index.js`、`dsh-workspace/lib/types/types.d.ts`、`dsh-api-workspace-controller/lib/index.js`、`lib/client.js`
- 配套：[`dsh-capabilities.md`](dsh-capabilities.md)（工作区取数通路 / 会话锚点）

## 一、三个字段各是什么

| 字段 | 事实 |
|---|---|
| `id` | 创建时 `WorkspaceId(randomUUID())` —— **随机 UUID**，不是路径也不是标题（`dsh-workspace/lib/index.js:644`；bootstrap 建记录同 `:786`） |
| `title` | 纯展示名，可改；`rename` 只调 `workspace.setTitle(title)`，**`id` 不变**（`dsh-api-workspace-controller/lib/index.js:234-242`；client 侧 `rename(workspaceId, title)` 见 `lib/client.js:72-75`） |
| `path` | 绝对路径（工作区根）。会话按 header cwd 归一后归组；`bootstrap` 按 `path` 复用例表里**仍存在**的旧 id（`dsh-workspace/lib/index.js:775-786`） |

## 二、关键事实（宿主侧）

| 动作 | `id` 是否稳定 | 后果 |
|---|---|---|
| 改工作区**标题** | ✅ 不变 | 按 id 关联的记录照常可用；按旧标题关联则失联 |
| **删除**工作区 | — | 记录从表里消失 |
| 删除后**同路径重建** | ❌ 新 UUID | 旧 id 变成悬空值，但 `path` 不变 |
| 移动工作区目录 | ❌ 视为另一个工作区 | `path` 变了 ⇒ 本仓任务需重选 |

- **registry 没有按标题查询的接口**：只有 `list()` / `get(id)`（`dsh-workspace/lib/index.js:637-654`、controller `requireWorkspace`）⇒ 按标题找只能自己遍历。
- **历史结论（2026-11-06，已被 2026-11-09 推翻）**：任务当初记 `title` ⇒ 改名后必然找不到；当时的答案是改存 `id`（改名不失效）、删了重建则必须报错重选。现改为存 `path`（第三节）。

## 三、本仓落地口径（2026-11-09 修订，推翻 11-06 的「存 id」）

- `target.workspace` **存 `workspace.path`**（绝对路径）：宿主派发的 `meta.cwd` 本就是它，改名 / 宿主重启 / 注册表重建 id 都不变；移动目录才需重选。附件 `workspace` 同口径。
- **下拉控件（2026-11-15）**：4 处「选工作区」改用核心 `WorkspacePicker` + `valueKey: 'path'`（候选取自宿主快照）。
  老值 title / id 的归一仍由本仓 `workspaceValueOf(workspaces, …)` 承担 —— 核心快照没有 aliases，`workspaces` 仍来自 `GET /options`（今仅作显示名映射与归一来源）。存储口径未变。
- **唯一真源** = `findWorkspace(workspaces, raw)`（`src/dispatch.ts`）：按 `path` → `title` → `id` 精确匹配；`workspaceValueSet()` 供保存校验，`resolveWorkspace()` / `resolveWorkspaceByPath()` 都走它。
- **老数据无迁移程序**：老任务存 title / id 时，保存（单条 + 整批）与执行期解析成功后就地改存 path；`/options` 下发 `path` 作 value、`title` / `id` 作 aliases ⇒ 显示、校验与附件锚点都不断。
- **降级不误杀**：`registry.list()` 为空（宿主重启 / ctx 失活）⇒ 保存校验跳过、展示不露裸值；`/options` 在降级态退避重取，拿到真实候选即停（正常态不轮询）。
- 删了工作区后同路径重建 ⇒ 视为同一工作区继续可用（path 相同）。这是相对 2026-11-06「必须报错重选」的**口径反转**：插件派发只用 path，不依赖工作区的会话归组历史，继续跑不会挂错身份。
- **唯一已知边界**：老任务存 `title` 且宿主存在**同名工作区**时，title 本身不唯一 ⇒ 按 `list()` 首个命中归一（与旧 `resolveWorkspace` 行为一致）；这类老值建议手动重选一次。全部收敛为 path 后不再有此问题。

## 更新日志

- 2026-11-08 23:05:00：按 koc-code-docwriter 槽位规范从 design/ 迁入 dependencies/（仅移动，正文未改）
- 2026-11-09：工作区标识由 `id` 改存 `path`，唯一真源 `findWorkspace`；补齐保存归一、降级重取与降级跳过校验；第二节旧结论标注为历史。
- 2026-11-15：4 处下拉改核心 `WorkspacePicker`（`valueKey: 'path'`，核心 0.35.31：`ariaLabel` / `error` / `emptyLabel` 齐备），存储口径与 `findWorkspace` 不变。
