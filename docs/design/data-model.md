# 数据模型：任务定义与状态库

> **定型依据**：决策 6（定义存 JSON）/ 7（状态存 SQLite）/ 8（依赖下游声明）/ 9（两种依赖语义）/ 10（失败策略）/ 12（任务手册）/ 14（状态库路径）。
> **边界**：通知机制本期不设计——`failed` 的证据落在 `task_events`，通知渠道另立决策。
> ⚠️ **决策 31 修订**：调度**不再产生 `skipped` 行**（过期 / 被依赖卡 / 预条件失败一律不建 `task_instances` 记录），
> 这类「未推进到执行那一步」的诊断改记独立的 `task_log` 表（可定时清除）。`skipped` 状态仅作历史兼容保留。

## 一、任务定义（JSON 文件，人改、进 Git，不入库）

| 字段 | 类型 | 说明 | 依据 |
|---|---|---|---|
| `id` | string? | **机器身份，只认 UUID**。**保存闸门**（POST /tasks）：无 id ⇒ 系统生成随机 UUID 补上并固化写入（= 新增）；有 id 且为 UUID ⇒ **必须在现有已保存任务表中命中**才原样保留（= 修改——带 UUID 即修改，修改目标必须存在，UUID 身份只能由系统生成、不能凭空引入）；有 id 但非 UUID（数字 / kebab-case / 旧指纹），或 UUID 不在现有表中（含首次录入自带 UUID）⇒ **整批拒绝保存**（HTTP 422 带原因）。**运行时只认不修**：解析遇到无 id / 非 UUID 条目 warn 跳过、绝不生成兜底 id（tick 不再写回） | 决策 25 / 30 |
| `title` | string | 用户可读名称：**任意文本（中文亦可）、随时可改**，**不参与身份** ⇒ 改名不改 `id`，历史不断链。缺省回退 id | 决策 25 / 30 |
| `code` | string? | **任务编号（可选，人读）**：用户自编便于查询与管理，**只做记录、不参与任何唯一性判断**（空格 / 重名 / 格式差异都不影响身份——判断只走 `id` + 计划刻度）。存前 trim，空白视为未填。快照与面板任务表展示 | 决策 30 |
| `enabled` | bool | 停用任务不删定义 | — |
| `schedule.cron` | string? | 生成计划时刻；纯程序解析，零 token。**与 `once` 互斥**（周期任务用） | 架构约束 |
| `schedule.once` | string? | `YYYY-MM-DDTHH:mm`；按 `timezone` 墙上时间解释，仅该日派发一次，跑完自动停。**与 `cron` 互斥**（一次性任务用，决策 18）。**窗口内才作数**（2026-09-30 拍板 A）：`once + window` 之内迟到照旧补跑，**出窗口即过期作废**，并补一条 `skipped`（事件 `expired-once`）留痕 | 决策 18 / 拍板 A |
| `schedule.timezone` | string? | 缺省用宿主时区；**logical date 的归属判定靠它** | 决策 9 |
| `schedule.window` | string | ISO 8601 时长（如 `PT4H`）；计划时刻 + 窗口 = 当日截止线，过窗 → `skipped` 并切次日 | 决策 10 |
| `target.workspace` | string | 派发到哪个**工作区**（按 registry 的 `title` 精确匹配、`id` 兜底；**不是工作目录**——cwd 由工作区实体的 `path` 派生）。匹配不到 ⇒ 实例判失败，不派发 | 决策 4 / 22 |
| `target.provider` | string? | 派发模型漏斗第①层的 provider；与 `target.model` **成对**，只填一个视为该层未配 | 决策 22 |
| `target.model` | string? | 派发模型漏斗第①层的 model。两层 `target.*` 都留空则依次漏到：插件配置 `defaultProvider/defaultModel` → 宿主 `agentDefaultModel`（= 用户配的 / 上次用的模型）→ `llm` 首个可用模型；四层全空 ⇒ 实例判失败。**派发时现算，不回写本字段** | 决策 22 |
| `target.manual` | string? | 任务手册 MD 路径（相对目标工作区），由调度器拼进派发消息 | 决策 12 |
| `target.prompt` | string | 短指令，调度器拼进派发消息 | 决策 12 |
| `contract.validStatuses` | string[]? | 回执 `status` 的合法值清单，默认 `["ok"]` | 决策 19 |
| `retry.maxAttempts` | int? | 默认 1；重试耗尽 → `failed`，下游跳过 | 决策 10 |
| `depends_on` | object[]? | `{ task, semantics }`，**由下游声明**；`semantics` = `same_period`（同 logical date）/ `latest_success`（上游最近一条必须 succeeded）。⚠️ `freshness` 字段已于**决策 33 删除** | 决策 8/9/33 |
| `attachments` | object[]? | **附加文件清单**（只记引用，不存内容）：`{ id, name, kind, ref, workspace? }`。`kind='link'` = 工作区已有文件（只记路径、不复制，`workspace` = 来源工作区 title，派发注入时按它把 `ref` 绝对化）；`kind='upload'` = 已上传到插件数据目录的文件，**`ref` = 相对该任务目录的路径**（`attachments/<原始文件名>`，迁移见 §五.3）。同源文件见 §五 | 2026-09-30 |
| `schedule.ui` | object? | **结构化排期（编辑态反解用）**：`{ scheduleKind, periodFreq, weekdays[], monthDay, monthMode, quarterMonth, yearMonth, intervalUnit, intervalStep, weekStep }`，与 `cron` / `once` / `start` / `everyNWeeks` **并存**。**执行只读 `cron`/`once`（唯一排期真源），表单反解只读 `schedule.ui`**；两者不一致（用户手改过 cron）⇒ 表单进「自定义 cron」只读态并提示，`schedule.ui` 不回写。✅ 已定双写（见 §5.4） | 2026-09-30 |

**回执机制（决策 19 + 决策 24 改通道）**：agent 跑完调用插件注册的工具 `task_dispatch_table_receipt({ status, outputs?, note? })` 提交回执——该工具由插件在派发时经 `agentCtx.tools.register` 注册，**只对该任务会话可见**，`execute` 在**插件进程内**直写状态库 `task_events`（`kind='receipt'`，detail 形状 `{ status, outputs, note, session_id }`）。对账**只查库**：取派发时刻之后的最新 receipt，校验 `status ∈ contract.validStatuses` + `outputs` 逐一在目标工作区存在且 mtime 晚于本次派发（防旧产物冒充）。只记录不裁决，实例状态仍只由调度器写（决策 11）；重复提交无害（对账取最新）。⚠️ **为什么不再用命令行**：agent 的 bash 在 Landlock 沙箱 `workspace-write` 模式下**只能写工作区**，写不了宿主数据根下的 `state.db`（决策 24 真机证据）；`submit.js` 保留为手动 / 排查备用通道。

## 二、状态库（SQLite，路径见决策 14）

```sql
-- 状态库**两张执行表 + 一张元数据表**：任务定义（含 id）存在用户的 JSON 里（决策 6），库里不存定义，
-- 也不存任何「位置 → id」的对照表（决策 25 修订版：下标锚点会在「删第一条」时串号）。

-- 任务实例状态表：状态机 7 态的载体，一行 = **一次执行（一个计划刻度）**
CREATE TABLE task_instances (
  id            TEXT PRIMARY KEY,        -- ★ UUID 不透明主键（决策 25）。
                                         --   列名沿用 id（而非 run_id）：旧库无需重建表即可升级
  task_id       TEXT NOT NULL,           -- 任务定义 JSON 里的 id（用户写的，或系统生成并回写的）
  scheduled_at  TEXT NOT NULL,           -- ★ 计划时刻（cron 算出的**刻度**，ISO 8601 含时分秒 + 时区偏移）
                                         --   = 身份锚点 + 防重键。**不是实际执行时刻**
  logical_date  TEXT NOT NULL,           -- = scheduled_at 所在日历日；仅供 same_period 依赖判定与界面分组
  status        TEXT NOT NULL CHECK (status IN
                  ('pending','dispatched','running','succeeded','failed','skipped','unknown')),
  attempt       INTEGER NOT NULL DEFAULT 0,  -- 重试在行内递增，不换行（决策 10）
  session_id    TEXT,                    -- 派发会话 id（对账信源）
  lease_until   TEXT,                    -- running 租约到期时刻（机制 #2）
  dispatched_at TEXT,                    -- ★ 实际派发时刻（可能晚于 scheduled_at），**不进身份**
  finished_at   TEXT,
  outputs       TEXT,                    -- 决策 32：完成瞬间写回的产出（回执 outputs 的 JSON 文本，冗余）
  token_in      INTEGER,                 -- 决策 32（修订）：输入（prompt）token，宿主事件带 usage 才累计，否则 NULL
  token_out     INTEGER,                 -- 决策 32（修订）：输出（completion）token
  token_in_cache INTEGER,                -- 决策 32（修订）：命中上下文缓存的输入 token
  updated_at    TEXT NOT NULL
);
-- ★ 防重闸门（唯一索引而非表约束：旧库加索引即可升级，不必重建表）
CREATE UNIQUE INDEX idx_instances_slot ON task_instances(task_id, scheduled_at);
  -- 待确认（未拍板，见 PROGRESS 未决项 U5）：def_revision（跑的是哪版定义）/
  --   def_snapshot（当时的配置快照 JSON）/ run_type（scheduled | manual | retry）

-- 执行日志表：append-only，对账与排障的证据链（**真实实例**的生命周期证据）
CREATE TABLE task_events (
  seq         INTEGER PRIMARY KEY AUTOINCREMENT,
  instance_id TEXT NOT NULL,
  ts          TEXT NOT NULL,
  kind        TEXT NOT NULL,             -- state_change | dispatch | session_event | receipt | nudge | receipt_check | error
  detail      TEXT                       -- JSON 原文
);

CREATE INDEX idx_events_instance ON task_events(instance_id, seq);

-- 诊断日志表（决策 32）：只收「**未推进到执行那一步**」的诊断，与 task_instances / task_events 分离，
-- 可定时清除（logRetentionDays，默认 30 天）。任务没到推进那一步，就不写任务记录表（用户拍板）。
CREATE TABLE task_log (
  seq          INTEGER PRIMARY KEY AUTOINCREMENT,
  ts           TEXT NOT NULL,
  task_id      TEXT,                     -- 可能为空（如启动汇总）
  scheduled_at TEXT,                     -- 错过的刻度，可能为空
  level        TEXT NOT NULL,            -- info | warn | error
  kind         TEXT NOT NULL,            -- dep_blocked | dep_disabled | dep_missing | expired-once | missed-slot | stale-upstream | precondition | attachment-missing | startup_missed | stray_pending（2026-10-01 依 scheduler/reconcile 实际写入更正）
  message      TEXT NOT NULL
);

CREATE INDEX idx_task_log_ts ON task_log(ts);

-- 元数据表：跨重启 / 重装必须存活的插件级键值。内嵌任务表 tasksInline 的**持久化主通道**
-- 在这里（entry config 会在插件重装时丢；state.db 在宿主数据根挂载卷上，不丢）。
-- 「无行 = 从未写过（回退 entry config 初始值）」与「value='' = 用户清空过」语义不同，勿合并。
CREATE TABLE meta (
  key   TEXT PRIMARY KEY,                -- 如 'tasksInline'
  value TEXT NOT NULL                    -- 原文（tasksInline 为 JSON 数组文本）
);
```

## 三、关键设计

1. **执行身份（决策 25）**：**不透明主键** `run_id`（UUID）+ **业务键** `(task_id, scheduled_at)` 唯一约束。锚点是 **cron 算出的刻度**（含时分秒、带时区偏移），**不是日期**：

   | 周期 | 刻度（`scheduled_at`） | 一天几条 |
   |---|---|---|
   | 每天 09:00 | `2026-09-24T09:00:00+08:00` | 1 |
   | 每 2 小时（`0 */2 * * *`） | `…T08:00` / `…T10:00` / `…T12:00` | 多条，天然不同 |
   | 每 15 分钟 | `…T09:00` / `…T09:15` / `…T09:30` | 多条 |
   | 每月 1 号 09:00 | `2026-09-01T09:00:00+08:00` | 1 |
   | `once` | 就是它那个时刻 | 1 |

   刻度**由 cron 决定**，不是「上一次 + 间隔」⇒ 迟到 / 重启 / 多跑几轮都不漂移（8:01 才跑，记的仍是 `08:00` 这个槽）。**防重 = 唯一约束**：到点那一刻才 INSERT 一条（懒建行，决策 31），撞 `UNIQUE(task_id, scheduled_at)` 即视为「该刻度已处理」⇒ 幂等。下游依赖判定仍是「一条 SELECT」：`same_period` 查同 `logical_date`，`latest_success` 查 `succeeded` 的最近 `logical_date`（`freshness` 比对 `scheduled_at`）。展示用可读串拼 `task_id:scheduled_at`，**但不作主键**。

   **不再有 `ensureInstances` 窗口回看**（决策 31）：原来是 `[now - max(窗口时长, 26h), now + 2×tick]` 逐个刻度补建（窗口内 `pending` / 过窗 `skipped`），会塞满任务记录表 ⇒ **已删除**。现在只取「当前该跑的那一下」，不回看、不补跑、不预建。
2. **重试不换行**：`attempt` 行内递增，状态流转 `dispatched → running → (failed → pending)* → 终态`（懒建行后 `pending` 只由重试回退产生）；下游只见最终态，半成品状态不外泄。
3. **懒建行 + 幂等**（决策 31）：到点且预条件通过时直接以 `dispatched` 落库（`INSERT OR IGNORE`），随后异步拉起会话；预条件不过则**不落库**。单进程插件的 tick 顺序执行，`casClaim`（`UPDATE ... WHERE status='pending'`）保留为重启恢复与未来多实例兜底。

## 四、已记录的取舍

| 取舍 | 结论 | 理由 |
|---|---|---|
| `logical_date` 存储格式 | ISO 字符串，不用 epoch | 可读、diff 友好、SQL 直接比较 |
| 执行主键形态 | **UUID（不透明）**，不用自增、也不用可读复合串当主键 | 自增在客户端 / 重装 / 多实例环境下不可靠；可读串作**唯一约束**即可（Airflow 同款：整数 `id` 主键 + `run_id` 可读串去重）。界面不必显示该串 |
| 锚点粒度 | **`scheduled_at` 刻度（含时分秒）**，不用日历日 | 日历日粒度会让每小时 / 每几分钟的 cron 一天只能出一条；刻度由 cron 决定 ⇒ 迟到不漂移、改周期类型不撞车 |
| 计划时刻 vs 实际时刻 | 分开存：`scheduled_at`（锚点）/ `dispatched_at`（实际派发）/ `finished_at` | 同 Airflow（`logical_date` vs `start_date`/`end_date`）与 k8s（`cronjob-scheduled-timestamp` annotation）。对账的「mtime 晚于派发」用 `dispatched_at` |
| 通知机制 | 本期不做 | 只留 `task_events` 证据；渠道选型另立决策，不塞进状态库 |

---

## 五、文件资产与保存链路（2026-09-30 设计）

> 需求口径见 [`creation-edit-requirements.md`](creation-edit-requirements.md)。本节只写**数据长什么样、落在哪、按什么顺序写**。

### 5.0 三类真源（不混淆）

| 真源 | 内容 | 落点 | 谁写 |
|---|---|---|---|
| **任务定义** | 任务配置（§一 全字段） | **整份 `tasksInline` JSON 数组**，主通道 = state.db `meta` 表；次通道 = 插件 entry config（尽力写回） | 保存链路（服务端） |
| **文件资产** | 提示词版本 / 配置快照 / 附件 | 文件系统 `tasks/<uuid>/…` | 保存链路（服务端） |
| **运行时** | 实例 / 事件 / 诊断日志 | SQLite `task_instances` / `task_events` / `task_log` | Loop A / Loop B |

**不建附件表、不建版本表、不建快照表**：清单在定义 JSON 里，内容在文件系统里，两处都已有真源，建表只会多一份会对不上的副本。任务定义也**不拆表**（保持整份 `tasksInline`）——规模是几十个任务、几 KB，拆表换不来收益；**何时该拆**：任务数上百、或需要「按任务级」并发写 / 复杂查询 / 单条审计时再议。

> 附带的性质：`state.db` 与 `tasks/` 同父目录 ⇒ **备份 / 迁移 = 拷整个数据根**，不需要分别导出。

### 5.1 目录布局

```
<插件数据根>                       # = dirname(statePath)（state.db 同目录，挂载卷上）
├── state.db
├── tasks/<task_uuid>/             # 任务目录，目录名 = 纯 UUID（title/code 可改，不能做目录名）
│   ├── prompt-versions/
│   │   ├── 20260930T101530123.md  # 一个版本一个文件（内容即提示词全文）
│   │   └── 20260930T101530123.note# 版本备注（填了才有）
│   ├── snapshots/
│   │   └── 20260930T101530123.json# 整份配置快照（任务定义原文）
│   └── attachments/<原始文件名>    # upload 型附件（同名冲突加序号后缀）
└── task-attachments-tmp/          # 上传临时区（每天清 3 天前）
```

文件名 = 纯时间戳（`yyyyMMddTHHmmssSSS`），字典序 = 时间序 ⇒ **读目录即版本列表**，不需要序号、不需要索引文件。

### 5.2 保存动作里每一步的顺序（服务端一次完成）

| # | 动作 | 失败怎么办 |
|---|---|---|
| 1 | 校验 + 身份闸门（决策 30：无 id 补 UUID；带 UUID 必须命中现有表；否则整批 422） | 整批拒，什么都不写 |
| 2 | **写定义**（meta 表主通道，entry config 次通道尽力） | 报「未持久化」，用户重存 |
| 3 | 建任务目录（首次才有） | 告警，后续步骤跳过 |
| 4 | 提示词版本：与最新版本**去首尾空白**比较 ⇒ 不同才写新文件（新建首次无条件写） | 只告警 |
| 5 | 整份配置快照：与最新快照比较 ⇒ **不同才写**（R1） | 只告警 |
| 6 | 附件搬移：临时区文件（**区内用随机尾缀唯一命名**，避免两个任务传同名文件互相覆盖）→ 任务目录时**恢复原始文件名**（同名加序号）；本次从列表移除的 ⇒ **真删**；**临时文件已被清道夫清掉的 ⇒ 照常保存，但 UI 明示「以下附件已失效，需重新上传」** | 只告警 |

> **定义先落、文件动作尽力**：4–6 失败**不回滚定义**。理由：文件动作失败不会让定义不一致（附件缺失由执行期兜住 ⇒ 不执行 + 记 error），而回滚定义会让用户白改一次。

**第 1 步的校验清单**（服务端把关，不过即整批 422）：

- `target.prompt` 非空；`target.workspace` 非空（能否解析成工作区由执行期判，保存不严）
- `schedule.cron` 与 `schedule.once` **恰有其一**；周期档必须产得出 cron（含间隔档，见 C1），`once` 档必须匹配 `YYYY-MM-DDTHH:mm`
- `depends_on[].task` 指向的任务**必须存在**（**停用可以、不存在不行**——表单只列已有任务，只有手改 JSON 才可能踩）
- `title` / `code` **不做**格式与唯一性校验（决策 30）

### 5.3 迁移（老数据）

老 upload 附件平铺在 `task-attachments/`、**`ref` = 文件名（原始名+随机尾缀）**。迁移 ⇒ 按 `ref` 在 `task-attachments/` 定位 → 搬进 `tasks/<id>/attachments/<原始名>`（冲突加序号）→ `ref` 改写为**相对任务目录的路径**（如 `attachments/报告.md`）。老库没有 `tasks/` 目录 ⇒ 首次保存时建。**不做静默搬迁**，未保存过的任务不动。

### 5.4 ✅ 已定：结构化排期**双写**（`schedule.ui` + `cron`）

用户 2026-09-30 拍板 **A 双写**。

**硬规则（防两份数据打架）**：

| 谁 | 读什么 | 写什么 |
|---|---|---|
| 执行（Loop A / `scheduledSlotsFor`） | **只读 `cron` / `once` / `start` / `everyNWeeks`**，永不读 `schedule.ui` | 不写 |
| 表单（编辑态反解 / 展示） | 只读 `schedule.ui` | 保存时**同时写两者**，且 **cron 以表单为准重新生成** |

- `schedule.ui` 缺失（手写的老 JSON）⇒ 表单按 cron 尽力反解，解不出进「自定义 cron」态（不丢原值）。
- 两者不符（用户手改了 JSON 里的 cron）⇒ 表单**正常按 `schedule.ui` 展示**，顶部提示「JSON 中的 cron 与此处设置不一致（可能被手改过），保存将以本表单为准覆盖 cron」。用户改了文件改出错，不是插件能兜的，但**保存一定以表单为准**，不让坏 cron 悄悄留下。

**cron 必须「完全按意图执行」——落码验收清单（P0）**：

| # | 检查项 | 现状 |
|---|---|---|
| C1 | **间隔档必须产出 cron** | 🔴 **缺陷**：`draftToDefinitionJson`（`src/client/task-editor.tsx:308-312`）间隔档只写 `schedule.start`、**不写 cron** ⇒ `scheduledSlotsFor` 无 cron 返回 `[]` ⇒ **任务保存后永不执行**。`scheduleCron` 其实已能生成（`*/N * * * *` / `0 */N * * <dow>`）⇒ 修法：间隔档照常 `schedule.cron = scheduleCron(draft)` |
| C2 | DOM 与 DOW 不得同时指定（cron 的 OR 语义陷阱） | ✅ 现状各档只写其一（周档 DOW、月/季/年档 DOM + 月份位） |
| C3 | 每月 31 日 / 2 月 29 日 | ⚠️ 已知边界：cron 语义下该月**不出刻度**（不顺延）。UI 提示待定 |
| C4 | 「每 N 周」取模基准 | ✅ `start` 锚点 + 整周差取模（`filterSlotsBySchedule`）。⚠️ 跨 DST 的一周不是整 168h ⇒ 基准周可能偏移（宿主无 DST，低风险） |
| C5 | 时区 | ✅ 无时区字段，一律跟随宿主时区；`wallClockToAbsolute` 与 cron-parser 同一口径 |
| C6 | cron 合法性 | ✅ 服务端 `parseInlineTasks` 已用 `CronExpressionParser.parse` 校验，非法整条跳过 + warn |

### 5.5 派发快照要补 `attachments`（落码必做）

`InstanceSnapshot`（`src/store.ts:63`）当前**不含 attachments** ⇒ Loop B 要按需求校验「附件还在不在」就只能回头读任务定义，违反决策 41「Loop B 只读快照」。补字段：

```ts
attachments?: { name: string; kind: 'link' | 'upload'; ref: string; workspace?: string }[]
```

旧行无此字段 ⇒ `undefined` = 无附件，不猜。

### 5.6 表单控件 → JSON 字段对照（对着新增 / 编辑 UI）

| UI 控件 | 草稿字段 | 落 JSON | 备注 |
|---|---|---|---|
| 任务名称 | `title` | `title` | trim，空则不写 |
| 任务编号 | `code` | `code` | trim，空则不写，不参与唯一性 |
| 启用开关 | `enabled` | `enabled` | |
| 提示词（含全屏编辑器） | `prompt` | `target.prompt` | |
| 工作区 | `workspace` | `target.workspace` | |
| 模型 | `model`（`provider/model`） | `target.provider` + `target.model` | |
| 权限下拉 | `permission` | `target.permission` | 决策 50 |
| 附加文件 | `attachments[]` | `attachments[]` | 内容不进 JSON |
| 前置任务 | `deps[]` | `depends_on[]` | 固定 `latest_success` |
| 周期 / 间隔 / 频率 / 星期 / 月日 / 每 N 周 / 开始时间 | `scheduleKind` `periodFreq` `weekdays` `monthDay` `monthMode` `quarterMonth` `yearMonth` `intervalUnit` `intervalStep` `weekStep` `date` `time` | `schedule.cron` / `schedule.start` / `schedule.everyNWeeks` / （`schedule.ui`，见 5.4） | 执行真源 = cron |
| 单次运行 | `periodFreq='once'` | `schedule.once` | 与 cron 互斥 |
| 允许延迟 | `window` | `schedule.window` | |
| 重试次数 | `maxAttempts` | `retry.maxAttempts` | |
| 高级区 /goal | `goalMode` | `target.goal` | |
| 高级区 多 Agent 协作 | `agentTeam` | `target.agentTeam` | |
| 任务手册 | `promptSource` `manualPath` | `target.manual` | UI 已砍入口，**字段保留 round-trip** |
| 成功状态清单 | `validStatuses` | `contract.validStatuses` | UI 已砍，**保留 round-trip** |
| 提示词版本面板 | `versions` | **不落 JSON** | 落 `tasks/<id>/prompt-versions/` |
| — | — | `id` | 不在表单里；保存闸门生成并固化 |

---

## 六、保留与清理（2026-09-30）

| 对象 | 落在 | 策略 |
|---|---|---|
| `task_log` | SQLite | `logRetentionDays`（默认 **30 天**），tick 内跨天清（既有） |
| `task_instances` + `task_events` | SQLite | **默认不清**（`historyRetentionDays = 0` = 不清；用户设了天数才清）。清理时按 `updated_at` / `ts` 删、**删实例行连带删它的 events**，且**每任务最近一条终态记录永不删**（否则 `latest_success` 判定静默阻塞，评审 P1）。⚠️ 删行不会让 SQLite 文件变小，要回收磁盘还得 `VACUUM`——这也是「干脆不清」的一条理由 |
| 上传临时区 | 文件系统 | **7 天**（D1 已拍），tick 内跨天清（一个「上次清理日期」内存变量 + 一次删除，无持续负载） |
| 提示词版本 / 配置快照 | 文件系统 | **不自动删**；用户在版本面板自己删（配置快照的管理入口本轮不做） |
| 任务目录 | 文件系统 | 删除任务时**整目录删**（附件 + 版本 + 快照）；删除按钮 + 二次确认待做 |

### 6.1 容量：为什么执行记录可以不清（2026-09-30 复核）

用户质疑「90 天」⇒ 复核后**推翻原设计**：执行记录**默认不清**。理由不是「SQLite 撑不住」，恰恰相反——**数据量根本不是约束**。

**单实例的数据量**（实测代码口径，非估算上限）：

| 项 | 量级 |
|---|---|
| `task_instances` 一行 | 固定字段 ~400 B + `snapshot` JSON（含 prompt / manual / resolvedDeps，**提示词越长越大**）≈ **1.5–4 KB** |
| `task_events` 每实例 | **约 8–15 条**（dispatch 1 + state_change 3~5 + receipt 1 + receipt_check 1~2 + session_event 信号 1~3 + nudge 0~3）。`session_event` **只在信号时记**（turn/end、lease-expired），不是每个 token 一条 ⇒ 单实例事件合计 ≈ **2–4 KB** |
| 合计 | **≈ 5–8 KB / 实例** |

**按此推算**：

| 每天实例数 | 1 年行数（实例+事件） | 2 年累计体积（估） |
|---|---|---|
| 10 | ~15 万 | **~50 MB** |
| 100 | ~150 万 | **~0.5 GB** |
| 1000（极端：每 1.4 分钟一个实例） | ~1500 万 | **~5 GB** |

**SQLite 承受力**（官方 `sqlite.org/limits.html`）：单库上限 **281 TB**、单表行数上限 **2^64**；百万行表带索引的按 `instance_id` / `task_id` 查询是毫秒级。**十万、百万行完全不在话下**——所以「怕撑不住而清理」这个前提不成立。

> 结论：**历史查询的价值（年任务想看去年跑了什么）远大于几百 MB 的磁盘成本** ⇒ 执行记录默认不清；真需要控制体积时由用户自己设 `historyRetentionDays`（此时 P1 的保护规则生效）。

**插件配置新增两项**：`historyRetentionDays: number`（**默认 0 = 不清**；>0 才按天清）、`attachmentTmpRetentionDays: number`（默认 **7**）。

**`task_log` 的 kind 扩充**（kind 是文本列，不动 DDL）：

| kind | 何时记 |
|---|---|
| `dep_disabled` | Loop A 判定发现上游 `enabled=false`（warn）——与「上游还没成功」的 `dep_blocked` 分开 |
| `attachment-missing` | 附件在执行期校验时不在（Loop A 记一次、Loop B 记一次） |

**去重改「结论变化才记」**：进程内 Map 记 `taskId → 上次结论签名（kind+原因）`，签名变了才写一条；一直卡住不重复写（取代现状「5 分钟一条」）。重启后 Map 清空 ⇒ 每个卡住的任务各补记一条，可接受。

---

## 七、设计评审（2026-09-30 自查）：已修 / 待拍

> 对 §五 §六 的结构做了一轮「挑刺」，按后果严重度排序。

| # | 问题 | 后果 | 处理 |
|---|---|---|---|
| P1 | **清理执行记录会打断依赖判定** | 上游（月 / 季 / 年任务）历史被清干净 ⇒ 下游 `latest_success` 永远查不到 ⇒ 静默阻塞，日志只显示 `dep_blocked`，排查不出原因 | ✅ **已修**：清理时**保护每个任务最近一条终态记录**（§六） |
| P2 | **间隔档不产出 cron** | 用户选「每隔 N 分钟 / 小时」保存后，JSON 里没有 cron ⇒ 任务**永不执行** | ✅ **已写入设计**（§5.4 C1），落码列为 **P0 必修** |
| P3 | **临时区清理 vs 未保存草稿** | 上传后超过 3 天没保存 ⇒ 文件被清 ⇒ 定义里 `ref` 悬空 ⇒ 执行期才报错 | ✅ **已修**：保存时若临时文件已不在 ⇒ 照常保存 + UI 明示「以下附件已失效，需重新上传」（§5.2）；临时区保留期 **已拍 7 天**（D1） |
| P4 | **删除任务 ⇒ 依赖悬空** | 下游的 `depends_on` 指向已删任务 ⇒ 永远阻塞，且与「上游还没成功」「上游停用」混为一谈 | ✅ **已修**：新增日志 kind **`dep_missing`**（上游任务已不存在），与 `dep_disabled` 并列。⚠️ **更正（2026-10-01）**：删除确认框**尚未**明示「有 N 个任务以它为前置」——此前记为「已修」有误；当前删除确认仅有不可逆措辞（`src/client/task-editor.tsx` 的 `confirmDeleteTask` → `editorDeleteTaskDesc`）。 |
| P5 | **临时区平铺 + 保留原始名** | 两个任务上传同名文件 ⇒ 后传覆盖先传，附件张冠李戴 | ✅ **已修**：临时区内**随机尾缀唯一命名**，搬进任务目录时**恢复原始名**（§5.2 第 6 步） |
| P6 | **删除任务后实例 / 事件变孤儿** | 执行记录页出现无主行 | ✅ **已定**：定义与任务目录**物理删**；实例 / 事件**保留**（审计证据）；面板按 `taskMap` 展示，无主行不显示 |
| P7 | **整批覆盖保存的并发覆盖** | 两端同时改不同任务 ⇒ 后写覆盖先写 | ⚠️ **已知取舍，不做乐观锁**（单用户、规模小） |
| P8 | **附件总量无上限** | 磁盘可无限涨 | ✅ **已拍不做**（D2）：用户自己的系统自己管，插件不替用户设限；单文件 20MB 上限不变 |

**评审没发现问题的地方**（记录结论，免得下次重复审）：cron 的 DOM/DOW 未同时指定（无 OR 语义陷阱）；时区单一口径（跟随宿主）；身份不随改名 / 回滚漂移（UUID 恒定）；同名附件跨任务不冲突（各任务独立目录）；upload 型附件互不共享（各存一份）⇒ 删一个不影响另一个。

### 待拍（2026-09-30 已全部拍定）

| # | 问题 | 结论 |
|---|---|---|
| D1 | 临时区保留期 | **7 天** |
| D2 | 单任务附件总量上限 | **不做**——用户自己的系统自己管，插件不替用户设限；单文件 20MB 上限不变 |
| D3 | 执行记录保留期 | **默认不清**（`historyRetentionDays = 0`），见 §6.1；此前设计的「90 天」**已推翻**——数据量不是约束，历史查询才是刚需 |
