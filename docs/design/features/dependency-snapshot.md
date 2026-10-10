# 依赖快照（决策 43）：写库瞬间冻结「命中了哪条上游实例 + 其产出」

> **状态**：✅ 收口（真机验证通过）
> **来源**：决策 43（依赖快照）
> **配套**：过程见 [`worklog/dependency-snapshot.md`](../../worklog/dependency-snapshot.md)；判定语义见 [`state-machine.md`](state-machine.md)

> 状态：✅ 方案定型（2026-09-28 用户拍板）并落码。
> 关联：决策 33（依赖判定语义）、决策 41（两层循环解耦 + 派发快照）。
> 问题排查记录见 [worklog/dependency-snapshot.md](../../worklog/dependency-snapshot.md)。

---

## 一、问题（2026-09-28 用户点破，代码级核实）

决策 41 落地后，两层循环已解耦：Loop A（`scheduler.dispatchNewSlots`）判「该不该跑」并落库执行记录；Loop B（`reconcile.sweep`）只读执行记录发动 / 重试 / 追问。依赖判定归属 Loop A，Loop B 不复判（`reconcile.ts` sweep 注释）。但排查发现**两处缺口**：

1. **判定结果没有冻结**：`judgeDependencies` 判定通过时手里已经拿到命中的上游实例对象（`getSamePeriod` / `getLatestInstance` 返回完整 `TaskInstance`，含 `id` / `session_id` / `outputs`），但只用 `.status` / `.scheduled_at`，对象引用在循环内被丢弃，函数只 `return { ready, staleNotes }`。落库的派发快照（决策 41）也不含任何依赖字段。⇒ Loop B 发动时（可能比判定晚数分钟），下游任务对「本次依赖是按哪条上游实例放的行」**一无所知**。若上游在此间隙又跑成功一轮，下游凭 prompt 自己找「最新产出」就会吃到**不是判定依据的那一份**。
2. **产出没有下传通道**：`depends_on` schema 只有 `{ task, semantics }`；上游回执声明并校验过的产出其实已写进 `task_instances.outputs` 列（决策 32 修订 `recordCompletion`），但依赖逻辑从不读它，`buildMessage` 也不注入。⇒ 下游 agent 想消费前置产出的文件 / 文件夹，**没有任何确定的数据通道**。

用户拍板的正确语义：**Loop A 判定通过的那一刻，把命中的上游实例（ID + 产出）定死进执行记录；Loop B 只消费这个冻结值。**

---

## 二、决策（决策 43）

1. **依赖解析结果随派发快照冻结**：`InstanceSnapshot` 增加可选字段 `resolvedDeps: ResolvedDependency[]`——每条上游依赖一项，含上游任务 id、判定语义、命中的上游实例 id、计划时刻、会话 id、上游工作区 path、产出清单。Loop A 落库时写入；Loop B（发动 / 重试 / 追问 / 回执裁决）只读，**不再重判**（与决策 41「落库即止」同构）。
2. **产出随实例注入下游消息**：`buildMessage` 把每条 resolvedDeps 渲染成「上游任务 + 命中实例 + 产出路径」段落，产出路径按上游工作区 path 绝对化（相对路径的基准是**上游**的工作区，不是下游的）；无产出声明时如实写「未声明产出」。下游 agent 因此拿到**判定那一刻的那一份产出**，不自行找最新。
3. **重试沿用同一冻结值**：重试是同一份执行记录的再发动（决策 41），`resolvedDeps` 随快照原样复用——不因重试间隙上游又有新成功而换产出。
4. **不做的**：不改 `task_instances` DDL（快照是 JSON TEXT 列，无需迁移）；不改 `depends_on` schema（声明面不变，变化只在运行时解析结果）；不做依赖产出的内容校验（沿用决策 33 复用旧产出只告警的立场）。

---

## 三、数据结构

```ts
/** 一条已解析的上游依赖（决策 43）：Loop A 判定通过时固化，Loop B 只读。 */
export interface ResolvedDependency {
  /** 上游任务 id（depends_on.task 原值）。 */
  task: string
  semantics: 'same_period' | 'latest_success'
  /** 判定通过那一刻命中的上游实例 id。 */
  instanceId: string
  /** 上游实例的计划时刻（ISO）。 */
  scheduledAt: string
  /** 上游实例的会话 id（无则 null）。 */
  sessionId: string | null
  /** 上游实例快照的工作区 path（产出相对路径的绝对化基准）；上游旧行无快照为 null。 */
  workspacePath: string | null
  /** 上游回执声明并校验过的**主文件**产出（相对上游工作区；未声明为空数组）。2026-10-10：只取主桶。 */
  outputs: string[]
}

// InstanceSnapshot 增加可选字段：
resolvedDeps?: ResolvedDependency[]
```

解析细则（`parseInstanceSnapshot`）：

- 字段缺失（决策 41 旧行）⇒ `resolvedDeps` 为 `undefined` ⇒ `buildMessage` 跳过注入（旧行为不变）。
- 字段存在但形状不对 ⇒ 整组丢弃（`undefined`），不让坏数据进消息。
- `workspacePath` 为 null 时产出保持相对路径原样输出（并注明基准未知）。
- **产出 = 主文件桶**（2026-10-10，[data-model.md](../data-model.md) §一 产出双桶）：`task_instances.outputs` 的语义已收窄为**主文件**（核心交付物），过程文件另存 `process_outputs` 列。`resolvedOf` 读的就是 `outputs` 这一列 ⇒ **下游天然只拿到主文件，本模块零改动**（用户口径：下级任务不需要整个文件夹里的构成文件，只要最终交付的那份）。

---

## 四、改动点清单

| 文件 | 改动 |
|---|---|
| `src/store.ts` | 新增 `ResolvedDependency` 接口；`InstanceSnapshot` 加 `resolvedDeps?`；`parseInstanceSnapshot` 解析 / 校验该字段 |
| `src/scheduler.ts` | `DependencyVerdict` 加 `resolved: ResolvedDependency[]`；`judgeDependencies` 两种语义命中时把上游实例固化为 `ResolvedDependency`（阻塞 ⇒ 空数组）；`snapshotOf` 接收并写入快照；`dispatchNewSlots` 透传 |
| `src/dispatch.ts` | `buildMessage` 注入「上游依赖（本次已锁定）」段落：任务 id + 语义 + 实例短 id + 计划时刻 + 产出绝对路径列表（或「未声明产出」） |
| `scripts/smoke.mjs` | ① `judgeDependencies` 放行时 `resolved` 命中正确的上游实例 id；② 阻塞时 `resolved` 为空；③ 快照带 resolvedDeps 经 `ensureInstance` → `get` → `parseInstanceSnapshot` 往返无损；④ `buildMessage` 含产出绝对路径与「未声明产出」兜底；⑤ 旧形状快照（无 resolvedDeps）解析不报错、消息不含该段 |

---

## 五、语义细则

| 场景 | 行为 |
|---|---|
| `same_period` 放行 | 固化 `getSamePeriod` 命中的那条（同 logical_date 最新一条，决策 33） |
| `latest_success` 放行 | 固化 `getLatestInstance` 命中的那条（最近一条，必须正好 succeeded） |
| 复用旧产出（stale 告警放行） | 照常固化那条旧实例——告警说的是「复用了它」，冻结的正是它 |
| 任一依赖阻塞 | 不落库（决策 31 前置检查语义不变），无 resolvedDeps 产生 |
| 上游实例无快照（旧行） | `workspacePath = null`，产出以相对路径原样注入并注明基准未知 |
| 上游回执未声明 outputs | `outputs = []`，消息写「未声明产出」 |
| 重试 / 追问 | 快照原样复用，依赖不复判、产出不换 |
| Loop B 发动失败重试窗口内再发动 | 同上，仍是同一冻结值 |

---

## 六、验证清单

### 冒烟（已加，§四⑤）

如改动点清单所列五组断言，随 `npm run smoke` 跑。

### 真机复验（待做）

1. 配 A → B 依赖（A 先跑成功），观察 B 的执行记录行：调试页看快照 JSON 含 `resolvedDeps`，且 `instanceId` = A 那次成功的实例。
2. B 的会话消息末段出现「上游依赖」列表，产出路径为**绝对路径**且指向 A 的产出。
3. A 在 B 落库后、B 发动前再跑成功一轮 ⇒ B 的消息仍指向**落库时**那条（冻结生效）。
4. B 失败重试 ⇒ 第 2 次发动的消息产出与第 1 次完全一致。
5. 无依赖任务的消息不含「上游依赖」段（旧行为不变）。
