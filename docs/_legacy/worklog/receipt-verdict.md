# 回执裁决口径与时机（三处拍板）

> **状态**：✅ 完成封卷（用户 2026-10-03 拍板并落码，冒烟 482/0；调度侧口径已定型，见 state-machine.md §1）
> **开工**：2026-10-03
> **起因**：真机一次任务「文件明明在」却判 `failed / output-stale`，用户要求讲清原因并给出正确修法。
> **定型**：[`../design/features/state-machine.md`](../design/features/state-machine.md) §1 判定树 · [`../design/data-model.md`](../design/data-model.md)「回执机制」· [`../design/external/dsh-capabilities.md`](../design/external/dsh-capabilities.md) §会话与派发（`whenIdle`）

---

## 一、起因：一次 `output-stale` 失败

用户贴的执行记录（时间本地 UTC+8）：

```
10:13:00  state_change dispatched→dispatched "assign-session"
10:13:00  state_change dispatched→running "session/created"
10:13:00  dispatch { workspacePath:"/workspace/Temp", goal:true, ... }
10:13:03  session_event turn/end            ← 第一轮结束，但**没交回执**
10:14:00  nudge                              ← 过了 30 秒还没回执 ⇒ 追问
10:14:01  receipt { status:"ok", outputs:[] }
10:14:02  receipt { status:"ok", outputs:[] }
10:14:03  receipt { status:"ok", outputs:[] }
10:14:05  receipt { status:"ok", outputs:["uuid.txt"] }   ← 改口
10:14:06  session_event turn/end            ← 第二轮结束 ⇒ 此刻才去验收
10:14:06  receipt_check {"reason":"output-stale","detail":{"output":"uuid.txt","dispatchedAtMs":1790993580171}}
10:14:06  state_change running→failed "output-stale"
```

`1790993580171` = `2026-10-03T10:13:00.171`（= 派发时刻，**时间戳本身没问题**）。

**当时的判定链**：`mtime(uuid.txt) <= dispatched_at` ⇒ 认为「这是派发前就存在的旧文件，不是本次写的」⇒ `failed`。

**真因**：任务是「判断 `uuid.txt` 是否存在、存在就别动它」⇒ **本就不该被改写** ⇒ 「新鲜度」这道闸必然误伤。
用户看到的是「文件明明在」，插件看的是「是不是这次写的」——两边口径不同。

---

## 二、用户拍板（三条）

| # | 原话要点 | 落点 |
|---|---|---|
| 1 | 「**只要他交出来的文件确实存在、格式是对的，就不用管**」「大模型是不是企图蒙混过关，你不用去管」「**任务执行得好不好是大模型的事**，你只要确定它确实执行了」 | **去掉 `mtime > dispatched_at` 新鲜度闸**，只留「存在性」 |
| 2 | 「**以最后一次判断为准**」「如果第二次还要提交新文件，它得把第一次的文件带上，不然第一次的文件就会丢」「**询问的时候也是一样**」 | 提示词明确「以最后一次为准 + 再提交须带上先前的产出」 |
| 3 | 「不是回执到了就裁决，也不是 Agent 说这轮结束了才验收」「**等到会话完成**」「Session 正在进行的时候，人家还在执行，你去验收个屁」 | **裁决改等 `agent.whenIdle()`**（会话真正空闲） |

---

## 三、落码

### 1. 去掉新鲜度闸（`reconcile.ts` `checkReceipt`）

- 移除 `if (statSync(outputPath).mtimeMs <= dispatchedAtMs)` 整段；
- 同时移除已无用的 `dispatchedAtMs` 参数与 `statSync` import；
- 现行三道闸 = **回执存在 / `status ∈ validStatuses` / `outputs` 里每个路径 `existsSync`**。
- `dispatched_at` 列**保留**（另有两处用途，见 §五）。

### 2. 以最后一次为准（`receipt.ts`）

- 工具描述：`重复调用安全（只认第一次）` → **「以最后一次提交为准：每一次都会整体覆盖，再次提交时先前报过的产物必须一并带上（不回带＝放弃）」**；
- 末段权威指令（`receiptInstruction`）加同义一条 —— **追问（nudge）重发的就是这一段** ⇒ 询问场景同口径。

### 3. 裁决等会话真正空闲（`reconcile.ts`）

```505:521:src/reconcile.ts
  function settleWhenIdle(sessionId: string): void {
    if (awaitingIdle.has(sessionId)) return
    const handle = handles.get(sessionId)
    if (handle === undefined) return
    awaitingIdle.add(sessionId)
    void handle.agent.whenIdle().then(
      () => {
        awaitingIdle.delete(sessionId)
        settleBySessionId(sessionId, 'agent/idle')
      },
      (error: unknown) => {
        awaitingIdle.delete(sessionId)
        logger.warn(`等待会话空闲失败（${sessionId}）：${String(error)}`)
      },
    )
  }
```

- `onEvent` 的 `turn/end`：**只记信号**（`noteRunSignal`，供 sweep 判「无回执该追问」）+ `settleWhenIdle`，**不再裁决**；
- `session/disposed` 仍直接裁决（会话已销毁 = 一定结束）；
- **sweep 关键改动**：`turn/end` 分支**去掉 `continue`** —— 旧版「turn/end ⇒ 会话已跑完，租约不适用」的前提在等空闲后不成立；不去掉的话，agent 卡死（`whenIdle` 永不来 + handle 丢失）时实例会**永久挂在 running**。现在 `turn/end` 只追究问，租约 / `running-stale` 兜底照常生效；只有 `agent/idle` / `session/disposed` 才 `continue` 跳过租约。

### 4. 冒烟（+9 ⇒ 482/0）

- 新口径 8 项：旧文件也通过 / 不存在才失败 / status 非法仍失败 / 目录算存在 / 空 outputs 通过 / 无回执 / 坏 JSON；
- 裁决时机 2 项：`settleWhenIdle`+`whenIdle`+`agent/idle` 进产物；sweep 的 `turn/end` 不再 `continue`；
- 提示词 1 项：「以最后一次提交为准」出现 ≥2 处（工具描述 + 末段指令）。

---

## 四、⚠️ 自纠：中途一次**改错**（同日撤回，务必别重蹈）

**当时的错误判断**：认定「多回执只看最后一条」是 bug（理由：前 3 条 `outputs:[]` 本可通过却被第 4 条顶掉），并改成「`receiptsSince` 取全部 + 倒序逐条校验、任一条通过即成功」。

**为什么错**：`outputs:[]`（空申报）在 `checkReceipt` 里**天然放行**（不校验任何文件）⇒ 那个改法等于
**「agent 先交一次『我没有产出』就能绕过全部产出校验」**= 给没干活的 agent 开后门，比原问题严重。

**撤回**：删除 `store.receiptsSince`、`settleByReceipt` 恢复取 `latestReceipt`（单条）、删除基于错误前提的断言。

**教训**：判定树是核心逻辑，**改它之前先确认「原本是不是设计意图」**——不能把「我不理解的行为」直接当 bug。
本次失败的**唯一**直接原因是新鲜度闸（而它按设计工作，只是**语义选错了**，用户不要这道闸）。

---

## 五、附带查清（不动）

1. **`receipt_check` 事件写两遍**（纯日志噪音，用户拍板**不管**）：`settleByReceipt` 写一次，
   `finishTerminal`（`reconcile.ts:285`）里又写一次。**不影响判定**。
2. **`dispatched_at` 仍需保留**（去掉新鲜度闸后依然有两处用途）：
   ① sweep 算「等 session/created」的派发宽限；② `latestReceipt` 的 afterIso（防上一轮 attempt 的旧回执冒充）。
3. **`whenIdle()` 的边界**：agent **一次都没跑过**时可能已 resolve ⇒ 只能在首次 `turn/end` 之后挂
   （本实现正是如此）。已回写 `dsh-capabilities.md`。

---

## 六、真机验证清单

1. 一个「复用已有文件」类任务（如判断某文件是否存在、不动它）⇒ 应判 **succeeded**（旧版本会 `output-stale` 失败）。
2. 开了 `/goal` 的常规任务：裁决发生在 agent **彻底空闲之后**（而不是第一轮 `turn/end` 时）；执行记录里
   应能看到 `session_event agent/idle`。
3. agent 中途反复交回执 ⇒ 以**最后一次**为准（看 `outputs` 落库值）。
4. agent 真卡死（会话不再发事件）⇒ 租约 / `running-stale` 仍能收口，**不再永久挂 running**。
