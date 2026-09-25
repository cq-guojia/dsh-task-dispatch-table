# 任务身份闸门（决策 30 三拍）

> 时间范围：2026-09-25 · **状态：✅ 完成封卷**（本文件是该工作包完成时的快照记录，不再更新）。
> 
> 三字段模型（id/title/code）→「保存时固化，运行时只认」→ UUID 必须命中现有表；真机验证闸门生效；configEditor 次通道 try/catch 修复。
>
> 定型结论见 [`design/decisions.md`](../design/decisions.md)；设计与事实清单见 [`design/`](../design/)。本文只保留过程叙事：踩坑、定位、修复与真机证据。

## 2026-09-25 (13) — 任务身份三字段模型落地（决策 30，用户拍板）

`id` = 机器身份（系统生成 UUID）/ `title` = 名称 / `code` = 任务编号（可选、用户自编、只做记录与查询，不参与唯一性判断——根治「录 ABC 与 ABC␣ 被判成两个任务」）。落地：schema 加 code（trim、空白归 undefined）；`newTaskId()` 改 `randomUUID()`；快照任务行与面板任务表加「编号」列；data-model.md + decisions.md 决策 30。冒烟 [2.1] 组（67 项全过）。

## 2026-09-25 (14) — 身份闸门规则化为「保存时固化，运行时只认」（决策 30 同日二次拍板，推翻 (13) 的指纹兜底）

用户指出 (13) 的「固化疑虑」是伪问题——保存本身就是固化点，规则应为：① **保存闸门**（POST /tasks）：无 id ⇒ 生成 UUID 固化写入（= 新增）；有 id 且为 UUID ⇒ 保留（= 修改，身份连历史）；有 id 非 UUID（数字 / kebab-case / 旧指纹）⇒ **整批拒绝保存**，HTTP 422 带第几条与原因，面板保存失败处直接显示该文案（client `failed` 状态从 boolean 改 string，persist set 非 ok 时抛服务端 error）。② **运行时只认不修**：parseInlineTasks / loadTasks 遇无 id / 非 UUID 条目 warn 跳过，绝不生成兜底；tick 补写函数 `ensureInlineIds` 删除；`withIdentity` 与内容指纹兜底废除，改 `applyIdentity`（isUuid 校验 + code/title 归一），loadTasks 不再写回文件。**冒烟 67 项全过**（新增：422 拒绝、kebab-case 拒绝、无 id 运行时跳过、调度器组改「仅 UUID 条生效」）。**真机影响提醒**：meta 里现存的老格式 id 任务（link-test-once 等）重启后会被跳过不执行，重新保存（删 id 或清空重录）即可；含非 UUID id 的整批保存会被拒。**未推送**：github 443 仍不通，`257e7f5` / `602fd7a` / 本笔三笔在本地排队。

## 2026-09-25 (15) — 保存闸门第三道闸：带 UUID 必须命中现有已保存表（决策 30 同日三次拍板：UUID 不能凭空引入）

用户指出二次拍板规则的漏洞：带 UUID 却在现有任务表中无此记录，也应判非法——**带 UUID 即修改，修改目标必须存在**。落地：`ensureIdsInInlineJson` 加 `existingIds` 参数（undefined 时跳过命中校验，仅限单测直调），新导出 `existingUuidIds(json)` 从已存 tasksInline 提取 UUID 集合（非法 JSON / 非数组 / 非 UUID 老数据一律不进集合 ⇒ 拿 UUID 去「改」老 kebab-case 记录同样被拒——老记录无 UUID 身份，想用就删 id 重录）；POST /tasks 以 `existingUuidIds(runtimeRef.tasksInline)` 传入。**推论：首次录入（现有表为空）不能自带 UUID，身份只能由系统生成**。运行时（applyIdentity / loadTasks）无需改动——运行时读的就是全量表，不存在「不命中」问题。冒烟：替换过时的「kebab-case id 保留」用例为 [2.2] 组（命中保留 / 不命中拒绝 / 空表拒绝 / 新增不受影响 / 非 UUID 不进集合），**71 项全过**。decisions.md 决策 30 三拍补充、data-model.md id 行同步。

## 2026-09-25 (16) — 真机验证身份闸门 + 修保存被次通道连累（cannot get property "configEditor" without inject）

① **闸门真机全部生效**：用户贴面板实测——老任务（link-test-once）保存被 422 拒且文案指明第几条；删 id 后保存触发新问题（见 ②）；「已解析的任务」为空证实运行时跳过旧 id；旧任务定义从 meta 表恢复可见 ⇒ **meta 持久化主通道真机验证通过**。② **保存报错但实际已成功**：删 id 保存报 `cannot get property "configEditor" without inject`——`persistTasksInline` 次通道用**属性访问**探测 `sctx.configEditor`，而 cordis ctx 是 Proxy，服务未提供时 get trap 直接 throw（决策 21 同源教训：属性访问探测形同虚设），异常冒泡到 POST /tasks 的 catch 变 400。**实际影响为零**：settingsCtxRef 与 storeRef 同一 inject 回调赋值 ⇒ 能走到探测行即 store 已就绪 ⇒ 主通道 `setMeta('tasksInline')` 已落盘、内存已生效，任务照跑。**修复**：次通道整块 try/catch（本就是「尽力写回、缺席属预期」语义），异常只 warn、绝不连累主通道保存。冒烟 71 项全过。

