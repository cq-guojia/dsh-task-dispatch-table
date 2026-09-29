# 新增 / 编辑任务功能面落码（工作包）

> 状态：✅ 完成封卷（2026-09-30 落码，**真机验证待做**——需要用户装 `dist/` 实测）。
> 决策依据：决策 51（[`design/decisions.md`](../design/decisions.md)）；需求口径 [`design/creation-edit-requirements.md`](../design/creation-edit-requirements.md)；数据设计 [`design/data-model.md`](../design/data-model.md) §五 §六。
> 本文件只记过程与踩坑；定型结论看上面三处。

## 一、范围（用户 2026-09-30 拍板，整条线由 agent 主导）

1. 「添加」功能做通；「修改」复用同一界面；表单重置。
2. 文件处理全链路 + 临时区定期删除；版本自动管理口径修正为**不自动删、用户自己删**（用户澄清：自动删的口径收回）。
3. 版本找回两档（只恢复提示词 / **整份找回**），找回前严厉确认。
4. 删除任务按钮（保存旁红色）+ 严厉确认（不可逆）。
5. 所有操作记数据库（新 `task_audit` 表）；两个循环按新需求**补齐**（已落码的 Loop A/B 不重写）。

## 二、落码清单

| 层 | 文件 | 内容 |
|---|---|---|
| 服务端 | `src/task-assets.ts`（新） | 版本 / 快照 / 附件 / 临时区清道夫 / 整目录删除；`moveAttachmentsIn` + `removeAttachmentFiles` 分离（先落库后真删） |
| 服务端 | `src/tasks.ts` | `schedule.ui` 双写 schema + `attachments[].workspace` + ref 防穿越 refine；`validateDefinitionForSave` / `upsertDefinitionInline(allowNew)` / `removeDefinitionInline`；`parseInlineTasks` 支持 includeDisabled |
| 服务端 | `src/store.ts` | `task_audit` 表 + appendAudit/listAudit；`purgeHistory`（默认 0 不清、保护每任务最近终态）；快照补 `attachments` |
| 服务端 | `src/index.ts` | POST /tasks 重写（整批 / 单任务 / DELETE）；GET /tasks/history、GET·DELETE /tasks/history/item；上传落盘改临时区；清道夫 interval（跨天才干活） |
| 双循环 | `src/scheduler.ts`（Loop A） | 依赖阻塞三分类（dep_blocked / dep_disabled / dep_missing，改吃含停用的全量表）；附件缺失不建行；日志「结论变化才记」；快照带附件 |
| 双循环 | `src/reconcile.ts`（Loop B） | 发动前凭快照校验附件（缺 ⇒ 不发动；超窗删行防串行互斥卡死）；link 型按来源工作区校验 |
| 客户端 | `src/client/task-editor.tsx` | 间隔档产出 cron（P0）+ 双写；`definitionToDraft` 反解（ui > cron 反解 > customCron 降级）；每季度 off-by-one 修；版本面板接真历史 + 两档找回严厉确认；删除任务红钮 + 重置 |
| 客户端 | `src/client/index.ts` | editor state（id/history 分离，不脏判定）；saveEditor / deleteEditorTask / restore×2 / deleteVersion / loadHistory / openEditor；任务列表编辑入口 |

## 三、评审与修复（专家组一轮，14 条发现）

用户要求「专家团评估直到没问题」。评审 1 个 P0 + 8 个 P1 + 5 个 P2，处理如下：

| # | 级别 | 发现 | 处理 |
|---|---|---|---|
| 1 | P0 | 附件 ref 全链路零校验 ⇒ 「提交穿越 ref → 再保存一次」可 rmSync 删数据根外任意文件 | ✅ schema + 搬移定位 + **真删循环**三处对称白名单（禁 `..` / 绝对路径 / 反斜杠）+ 冒烟回归 |
| 2 | P1 | 单任务保存不过 zod ⇒ 坏定义 200 假成功、运行时静默跳过 | ✅ `taskDefinitionSchema.safeParse` 前置，422 带字段定位 |
| 3 | P1 | 附件「先删/先搬、后落库」⇒ 落库失败丢文件 | ✅ 拆 `moveAttachmentsIn`（只搬）与 `removeAttachmentFiles`（落库成功后才真删）；DELETE 同序 |
| 4 | P1 | `dep_disabled` 不可达：停用上游被报成"已删除"（taskMap 只有 enabled） | ✅ `loadTasks(..., includeDisabled)` 全量表供依赖判定 |
| 5 | P1 | 每季度 cron 漏起月（选第 1 月 ⇒ 4,7,10，1 月永不执行） | ✅ `[0,1,2,3]` |
| 6 | P1 | customCron 降级态仍写 `schedule.ui` ⇒ 二次保存手写 cron 被覆盖 | ✅ customCron 独立分支：不写 ui / start |
| 7 | P1 | `safeFileName` 字符类 `[ -/]` 是 0x20–0x2F 范围 ⇒ 空格和点被吃、扩展名丢失 | ✅ 改控制字符 + 非法字符白名单式清洗（过程中发现 write_to_file 把 `\u0000` 写成了真实控制字符，用临时脚本规范化，脚本即用即删） |
| 8 | P1 | link 型附件校验用任务目标工作区 ⇒ 跨工作区附件误报缺失 | ✅ 按 `item.workspace`（来源工作区）解析 |
| 9 | P1 | 附件缺失行永久 dispatched ⇒ 串行互斥卡死同任务 | ✅ 超窗删行（stray_pending 同语义） |
| 10-14 | P2 | allowNew 旁路闸门（新增忽略客户端 id）✅；timezone + 自依赖校验 ✅；整批通道审计 + 版本备注接线（备注未接，版本面板已有备注字段、保存链路传 ''，见遗留）；`parseSnapshotAttachments` 重复计算 + 空数组语义 ✅；删除任务不感知在飞实例（保持：快照驱动收口，接受） | 部分修，见括号 |

**评审结论落实**：P0/P1 全修；P2 中 #10/#11/#14 顺手修，#13 的「版本备注」与「任务列表审计展示」留待真机验证后的小轮次，#12（删除感知在飞）按快照驱动架构接受现状。

## 四、验证

- typecheck（host + client）✅、build（dist 4.72 MB）✅、冒烟 **236 项全过**（新增 38 项：保存校验 15 / purgeHistory 5 / task-assets 17 / 穿越回归 1）。
- **真机验证清单（待用户）**：① 新增任务全字段 → 任务列表出行、cron 按意图跑；② 编辑反解（周期 / 间隔 / 每 N 周 / 手改 cron 降级）；③ 版本留档与两档找回（严厉确认文案）；④ 附件上传 → 保存搬移（原始名）→ 移除真删 → 执行期缺失拦停；⑤ 删除任务（不可逆确认 + 整目录删 + 审计留痕）；⑥ 上游停用 / 删除时下游日志文案（dep_disabled / dep_missing）；⑦ GET /tasks/history 的 query 参数在宿主 webServer 的真实行为（`req.url` 是否带 query——评审后仍无法离线核实，版本面板若空先查这里）。

## 五、遗留

- 版本备注（`saveVersion` 的 note 参数）保存链路传 ''：UI 的备注输入在版本面板（找回/删除已有），「保存时填备注」未做——待用户真机反馈要不要。
- `listAudit` 暂无 UI 消费面（审计已落库，调试页 dump 可看；正式展示等面板整体重建）。
- 附件总量上限：按用户拍板不做。
