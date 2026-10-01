# 任务展开三面板 · 第四轮 UX 迭代（工作包）

> **状态**：🔵 已落码（2026-10-02；typecheck + build 绿），⏳ 真机验证待做
> **设计**：[`design/features/task-expand-panels.md`](../design/features/task-expand-panels.md) §三
> **范围**：三面板（基础信息 / 执行记录 / 日志）观感与交互第四轮：定高、表格列重排、时间范围控件、状态过滤修复、滚动结构。

---

## 一、用户需求原话（逐条）

1. 三个切换面板**统一定高**，不然会不停闪。
2. 执行记录面板：过滤行**收窄一档**；抽象**通用时间筛选控件**（多处复用，含日志模块）；状态过滤**完全没效果**要修。
3. 滚动区 = 下方内容；上方**筛选与表头不滚**。
4. 表格太丑，**找官方表格**（官方没有则照参考图重做）；列序与格式：
   `状态图标 | 计划执行(YYMMDD HH:mm) | 实际开始(HH:mm:ss) | 执行时长(MM:ss，小时折分) | 产出物(文件类型图标，1/2/3 个) | 会话记录(会话图标点击打开)`

## 二、二次确认（用户 2026-10-02）

- 时长：`1:15:30`；不足 1 小时 ⇒ `MM:SS`，**分秒两位补零**（`05:30` / `00:30`）。
- 产出物 >3：显示 3 个 + 一个 `…` 更多按钮，点 `…` **打开会话**（完整清单在会话里）；无产出则**压缩该格**。
- 实际开始：取 `dispatched_at`，未派发显 `-`。
- 时间控件：整体包一个（预设 + 起 + 止），**必须传高度**；**要能选到小时/分**（日志定位到分钟）。
- **日期边界**：选 1/1~1/10 时，若直接用 `20260110` 当上界会漏掉 1/10 当天；要含当天。要求先调研成熟做法。

## 三、日期边界调研结论（成熟做法）

**通行口径 = 半开区间 `[from, to)`**（含起点、不含终点）：上界取**结束日期的次日 00:00**（day）/ **下一分的下一分钟 :00**（minute），比较用 `ts >= from AND ts < to`。出处：SQL / Elasticsearch / 各类 API 的通用约定（"inclusive start and exclusive end to match a whole date range without missing rows that include times"）。

对照：
- 现状 `dayEndIso` 用 `T23:59:59.999` + 服务端 `<=`：**结果对但属补丁式**（依赖 `.999`）。
- `BETWEEN a AND b`：❌ 时间戳上只含 b 的 `00:00`（正是用户说的坑）。
- 对列套 `date()`：丢索引，不用。

⇒ 本轮统一到半开区间，边界归一**只在 `ui/time-range.ts` 一处**。

## 四、落码清单

| 层 | 文件 | 内容 |
|---|---|---|
| 基础层 | `src/client/ui/time-range.ts`（新） | 预设档计算（今天/昨天/本周/上周/本月/上月，参数化档保留）+ `rangeToQuery`（**半开区间**归一，day/minute 两档） |
| 基础层 | `src/client/ui/TimeRange.tsx`（新） | 时间范围控件：预设下拉（官方 `Menu`）+ 起/止（自绘 `DateField`，minute 档加 `TimeField`）+ 清除；`precision` / `size` / `presets` 可配 |
| 基础层 | `src/client/ui/index.ts` | 导出 TimeRange + 纯函数 |
| 基础层 | `src/client/ui/controls-css.ts` | 无需新增（复用既有皮肤 + token） |
| 客户端 | `src/client/task-list.tsx` | ① 定高盒 `panelBoxStyle`（**基础信息也纳入**）+ 内滚动 `panelScrollFillStyle`；② 执行记录表 6 列重排；③ 产出物走官方 `FileTypeIcon`（≤3 + `…`）；④ 会话列 `IconNewChatOutlineRegular`；⑤ 过滤行改 `TimeRange`（records=day / logs=**minute**）并收窄到 md |
| 客户端 | `src/client/format.ts` | 新增 `formatPlanStamp`（`YYMMDD HH:mm`）/ `formatClock`（`HH:mm:ss`）/ `formatDurationHms`（`H:MM:SS`·`MM:SS`） |
| 客户端 | `src/client/editor-fields.tsx` | 新增 `timeLabelsOf`（时分文案单源） |
| 客户端 | `src/client/query.ts` | **修 bug**：出口参数名 `statuses→status`、`levels→level`（此前与服务端读的对不上 ⇒ 状态过滤失效） |
| 服务端 | `src/store.ts` | `listInstancesByQuery` / `listLogsByQuery` 上界 `<=` → `<`（半开区间） |
| 客户端 | `src/client/locales.ts` / `primitives.d.ts` | 列名 + 控件文案；补 `IconNewChatOutlineRegular` 声明 |

**关键修复（真 bug）**：状态过滤「完全没效果」= 客户端发 `statuses`（复数），服务端读 `status`（单数）⇒ 参数对不上、恒等于全部。已在 `query.ts` 出口改名修掉。

## 五、验证

- `npm run typecheck`：✅ 全绿。
- `npm run build`：✅ 绿（dist 入库）。
- `npm run smoke`：**396 通过 / 1 失败**；唯一失败项 = **他人并发的 U21「编辑器分栏形态」**断言（`[17b] 面板改占布局的一列`），与本次改动无关（本次未触碰 `task-editor*`）。

## 六、真机验证清单（待用户）

1. 展开任一任务：切「基础信息 / 执行记录 / 日志」，**卡片高度完全不变**（不再闪）。
2. 执行记录：过滤行更矮（md）；**状态选「失败」只剩失败/未执行**（本次修的 bug）；时间预设「上周」两框自动填对且**含结束日当天**。
3. 表格：6 列顺序与格式 = 状态图标 / 计划执行 `YYMMDD HH:mm` / 实际开始 `HH:mm:ss`（未派发 `-`）/ 时长 `H:MM:SS` 或 `MM:SS` / 产出物官方文件类型图标（≤3，>3 出 `…` 点开会话）/ 会话图标点开会话。
4. 滚动：内容区滚，**过滤行与表头不动**；表头吸顶。
5. 日志：时间范围可**选到分钟**（预设 + 起止时分）；关键字 / 条数照旧。
6. 明暗两种主题下图标与表格可读。
