# 方法规范：通用能力分几类、必须复用哪些、不满足怎么办

> **状态**：📝 新立（2026-10-01，待用户过目）
> **来源**：用户 2026-10-01 要求「方法也要规范：通用功能分几类、抽象到哪、哪些必须调用、不满足怎么提」
> **配套**：[`../README.md`](../README.md)（文档规范）· [`data-model.md`](data-model.md)（表结构）· [`architecture.md`](architecture.md)（分层与职责）

---

## 一、一句话规矩

**凡是"多处会用到"的能力，先查本文件；有就复用，没有或不满足就走 §四 提，不许就地另写一份。**

判据很简单：**同一个东西被写了第二遍，就是违规**（本专项的起因正是"每个地方都在写自己的样式"）。

---

## 二、通用能力清单（客户端 `src/client/`）

| 类 | 模块 | 提供什么 | **为什么单抽**（源码注释依据） |
|---|---|---|---|
| 网络 | `http.ts` | **带超时的 fetch**（默认 8s） | 原先三份各写一遍、其中一份还没超时 ⇒ 挂起一次即永久停摆；`session-view` 与 `index` 都要用，抽成**叶子模块**避免反向依赖 |
| 数据查询 | `query.ts` | 执行记录 / 日志 / 事件查询（过滤 + 游标分页） | 卡片三面板与未来的**总查询页**共用一套接口（小面板传 `limit`、总页面传 `cursor`），绝不允许两处各写 fetch |
| 时间格式化 | `format.ts` | `pad2` / `formatDateTime` / 大数计数格式 | `padStart` 曾散在 6 处、时间串手拼 3 份且口径不一（有无秒、失败回退不同） |
| 排期文案 | `schedule-text.ts` | 排期 → 人话的**唯一**实现（`ScheduleSpec` → 文案，支持样式参数） | 列表（`cronToHuman`）与编辑器（`describeSchedule`）曾各写一份 ⇒ 同一排期两处文案不一样 |
| 状态文案 | `status-text.ts` | 实例七态 → 通用短名（走 `t()`，跟随宿主语言） | 禁止就地打印原始 `status` 串或另写映射 |
| **时间文案** | `time-text.ts` | 相对时间 / 倒计时 / `HH:mm`（`clockOf`）/ 「预计执行」整行 | 2026-10-06 从 `task-info.tsx`（面板）归位：原来 4 个页面反向 import 一个页面；见 [client-refresh-disposition.md](client-refresh-disposition.md) §三 A3 |
| **错误文案** | `error-text.ts` | 服务端机器码错误 → 人话（`humanizeTaskError`） | 2026-10-06 从 `task-editor.tsx`（编辑器页）归位：宿主页反向 import 一个页面（§四 W3） |
| **列表取数** | `task-overview.ts` | 主界面清单数据（`useTaskOverview`：`rev` 增量 + 看门狗 + 乐观 patch）+ 行类型 | 2026-10-06 从 `task-list.tsx`（页面）归位：页面只该有视图（§四 W2） |
| **全局心跳** | `ui/ticker.ts` + `ui/LiveText.tsx` | 全站**唯一** 1s 心跳（`subscribeTicker` / `useNowMs`）与每秒自刷文本壳 | 2026-10-06 从 `task-info.tsx` 归位；**不许再自建 `setInterval(…,1000)`**（§三 A1/A2/M1） |
| 官方适配 | `official-classes.ts` | 运行时解析官方 CSS-module 真实类名 | 哈希每次构建都可能变，**写死必在某次宿主升级后集体失效** |
| 官方文案 | `md-labels.ts` | markdown labels（代码块工具条三条文案） | 是官方 `CodeBlock` 的**分叉开关**；且必须引用稳定（换身份会丢流式渲染缓存） |
| 提示反馈 | `toast-css.ts`（`FloatingToast`） | 浮层 Toast 唯一实现（四档语义色、2.8s 时间线） | 四处手写已收敛为一处 |
| 文案 | `locales.ts` | 全部界面文案（zh / en） | 面板语言跟随宿主 |
| 任务信息展示 | `task-info.tsx` + `task-info-css.ts` | 「基础信息」的标签—值纸表格渲染件（`InfoField`、排期行、`windowLabel`、`renderNextExec`）与「上次执行」渲染；两个视图模型构造函数 `taskInfoViewFromDraft` / `taskInfoViewFromRow` | 卡片展开区「基础信息」与右侧栏**查看档**同看一份任务信息，但数据源不同（前者吃 `TaskOverviewRow`、后者吃草稿）⇒ 若各写一份，同一个字段必然两处口径不一（重演 `schedule-text.ts` 头注那件事）。**叶子模块**：不得 import `task-list.tsx` / `task-editor.tsx` |

## 三、通用能力清单（宿主侧 `src/`）

| 类 | 模块 | 提供什么 |
|---|---|---|
| 数据访问 | `store.ts` | **唯一 SQLite 访问层**（所有 SQL 只在此） |
| 任务定义 | `tasks.ts` | 定义解析 + cron 计算 |
| 调度 | `scheduler.ts` | 刻度与派发时机 |
| 对账 | `reconcile.ts` + `runtime-index.ts` | 实例收口、运行态索引 |
| 派发 | `dispatch.ts` | 派发消息组装 |
| 回执 | `receipt.ts` | 回执校验 |
| 任务资产 | `task-assets.ts` | 版本 / 快照 / 附件 / 清理 / 整目录删 |
| 配置 | `config.ts` | 插件配置 |

---

## 四、调用规范（硬约束）

| 场景 | **必须走** | 禁止 |
|---|---|---|
| 发 HTTP 请求 | `http.ts` | 自己 `fetch`（必然漏超时） |
| 查库（任何 SQL） | `store.ts` | 业务代码里写 SQL |
| 时间 / 日期 / 计数显示 | `format.ts` | `toLocaleString`、手写 `padStart`、手拼时间串 |
| 排期给人看的一句话 | `schedule-text.ts` | 自己解析 cron 出文案 |
| 实例状态名 | `status-text.ts` | 直接打印 `status` 原始串 |
| 引用官方组件的类名 | `official-classes.ts` | 写死哈希类名 |
| 弹提示（成 / 败 / 警告） | `FloatingToast` | 行内 `<p>` / `<span>` 手写提示 |
| 界面文字 | `locales.ts` | 硬编码中文 |
| 任务文件 / 版本 / 附件读写 | `task-assets.ts` | 自己拼目录、直接 `fs` 操作 |
| 基础信息的标签—值与「上次执行」展示 | `task-info.tsx` | 在页面里另写一套字段行 / 另写一份上次执行渲染 |

**已知例外**（写在代码注释里，允许单独实现，不许推广）：

| 例外 | 位置 | 原因 |
|---|---|---|
| 需要持有 abort 句柄的 fetch | `task-list.tsx` 轮询、`task-editor.tsx` 附件上传（90s） | `AbortSignal.any` 需 Chrome 116+，产物 target 是 chrome99 ⇒ 无法与超时 abort 合并 |

---

## 五、不满足需求时怎么办（流程）

1. **先查**：本文件里有没有现成能力？
2. **有但不满足**（缺参数 / 语义不同 / 性能不够）：**停下来向用户提**，说清「现成的是什么、我要什么、差在哪」。
3. **用户定两种处理**：
   - **(a) 在方法里重载** —— 加参数 / 加选项，让方法更灵活，**调用方语义不变**（首选；改一处全站生效）；
   - **(b) 允许单独写** —— 就地实现，代价是这个能力从此有两份，**必须**在本文件「已知例外」表里记一行（例外是什么、在哪、为什么）。
4. **做完回写本文件**（新增 / 重载 / 例外都要更新清单）。

> ⚠️ **(b) 不是默认选项**：允许单独写意味着今后要改两处。用户没明确说 (b)，一律按 (a) 做。

---

## 六、新增一个通用能力的规矩

| 规矩 | 说明 |
|---|---|
| 放**叶子模块** | 谁被谁依赖要想清楚，避免反向依赖（理由写进文件头注释） |
| 文件头注释必须写「为什么单独成文件」 | 写清「此前几处各写一遍 / 会有什么后果」，后来人才知道不许再抄一份 |
| 客户端模块必须能被**静态 import** | 动态 import 会被 tsdown 切成额外 chunk，与「单文件产物 `dist/client.js`」契约冲突 |
| 加进本文件清单 | 否则等于没抽象 |
| 真实取数纪律 | 传输层只做形状校验，**不造兜底假值**；失败就让调用方显示错误态 |
