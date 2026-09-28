# 依赖快照（决策 43）——排查与落码

> 工作包：依赖（前置任务）解析结果冻结 + 产出下传。
> 状态：🔵 落码完成（2026-09-28，冒烟 172 项全过）；**真机复验未做**（清单见 design §六）。

## 一、排查过程（2026-09-28，用户点破）

用户口述其理解的两层循环模型，并连提两个疑问：① Loop A 判完依赖把任务写进记录表后「就不管了」，但发动可能在数分钟后——写库那一瞬间命中的前置会话是哪一条，有没有定死？② 光存会话 ID 不够，前置任务产出的文件 / 文件夹（可能多份）也得一起带上，否则下游拿什么执行？

**结论：两个疑问都成立，且现状比疑问更「空」——不是冻结晚了，是从根上没保留。** 证据链（改动前）：

1. `judgeDependencies`（scheduler.ts:73-103）判定时 `store.getSamePeriod` / `store.getLatestInstance` 返回的完整 `TaskInstance`（含 `id` / `session_id` / `outputs`）在循环内只用了 `.status` / `.scheduled_at`，对象引用即丢；函数返回 `{ ready, staleNotes }`。⇒ 判定「哪条上游放的行」这一信息无人生成。
2. `snapshotOf`（scheduler.ts:151-163）与 `ensureInstance`（store.ts:298-308）、`task_instances` DDL（store.ts:118-136）、`InstanceSnapshot`（store.ts:38-52）均无依赖字段 ⇒ 有信息也没处放。
3. Loop B 明确不重判（reconcile.ts sweep「依赖不复判」注释）——不重判是对的，但它也拿不到任何上游引用。
4. `depends_on` schema（tasks.ts:55-62）只有 `{task, semantics}`；上游 `outputs` 列（决策 32 修订 `recordCompletion` 落库）无人为依赖目的读取；`buildMessage`（dispatch.ts:227-234）只用 prompt / manual / validStatuses。⇒ 产出零下传。

**失败场景复现**：10:00 上游 U 成功（U-1，产出 O1）→ 10:05 Loop A 判下游 D 放行（依据 U-1）→ 10:20 U 再跑成功（U-2，产出 O2）→ 10:30 Loop B 发动 D。此刻 D 对 U-1 一无所知；若 prompt 让 agent 自己找「最新报告」，吃到的是 O2（U-2 覆盖 / 更新），与判定依据 O1 不符。

**时序红利**：本插件用 `cron` 驱动 tick、依赖判定与发动同 tick 顺次执行（Loop A → Loop B），间隙通常只有秒级；但模型解析 / 会话创建失败走重试回退 pending 时，再发动与判定可能隔几分钟以上，场景成立。

## 二、方案定型（2026-09-28 拍板）

见 [design/dependency-snapshot.md](../design/dependency-snapshot.md)（决策 43）。要点：

- `InstanceSnapshot` 加 `resolvedDeps: ResolvedDependency[]`（task / semantics / instanceId / scheduledAt / sessionId / 上游 workspacePath / outputs）。
- `judgeDependencies` 放行时返回 `resolved`；`snapshotOf` 写入快照；Loop B 只读不重判，重试沿用。
- `buildMessage` 注入「上游依赖（本次已锁定）」段：任务 id + 语义 + 实例短 id + 计划时刻 + 产出绝对路径（按上游工作区基准）；未声明产出如实写。
- 不改 DDL、不改 `depends_on` schema、不做产出内容校验。

## 三、落码记录（2026-09-28 同日）

按 design §四改动点清单全量落码：

- `src/store.ts`：新增 `ResolvedDependency` 接口；`InstanceSnapshot` 加可选 `resolvedDeps`；`parseInstanceSnapshot` 增加 `parseResolvedDeps`（字段缺失 ⇒ undefined 旧行为不变；任一条形状不对 ⇒ 整组丢弃，不让坏数据进消息）。
- `src/scheduler.ts`：`DependencyVerdict` 加 `resolved`；`judgeDependencies` 两种语义命中即 `resolvedOf(dep, upstream)` 固化（产出取上游实例 `outputs` 列，坏 JSON / 未声明 ⇒ 空数组；上游工作区取上游快照，旧行无 ⇒ null），阻塞 ⇒ `resolved: []`；`snapshotOf` 收 `resolvedDeps` 写入快照；`dispatchNewSlots` 透传 `depVerdict.resolved`。
- `src/dispatch.ts`：新增 `dependencyLines`；`buildMessage` 注入「上游依赖（落库时已锁定，勿自行查找最新产出）」段——任务 id + 语义 + 实例短 id + 计划时刻 + 产出**按上游工作区绝对化**（基准未知时原样相对路径并注明）；未声明产出如实写「未声明产出」。
- `scripts/smoke.mjs`：[9] 节新增 10 条断言（§四清单五组全覆盖）。

## 四、验证

- `npm run build` ✅（dist/client.js 248.53 kB）；`npm run typecheck` ✅。
- `npm run smoke`：**172 项通过，0 项失败**（含新增 10 条）。
- **真机复验未做**，五点清单见 [design/dependency-snapshot.md §六](../design/dependency-snapshot.md)；关键一点：上游在「下游落库」与「下游发动」之间再跑成功一轮 ⇒ 下游会话消息仍指向**落库时**那条上游实例的产出（冻结生效）。
