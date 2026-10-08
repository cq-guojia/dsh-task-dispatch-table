# 进度（进行中）

> **这是什么**：本仓库**唯一**的在办事项真源 —— 现在做到哪、欠什么、下一步做什么。
> **已结案的**看 [`PROGRESS-HISTORY.md`](PROGRESS-HISTORY.md)（一行一条：时间 / 完成了什么 / 过程文档）。
> **文档规矩**看 [`README.md`](README.md)。
>
> 本文件**只装在办的事**；事项结案即从本文件移入 `PROGRESS-HISTORY.md`。
> ⚠️ README / issue / 聊天记录都不是真源。

---

## 一、当前状态

### 1.2 真机验收批次（用户装 `dist/` 实测）—— ⏳ **待验 1 项：U33 Office 预览**

> 2026-10-04 用户真机实测：本轮在办事项（立即执行 §1.5 / 执行记录总查询页 §1.6 / 文件预览 U26–U30 / U32 观察项）**全部验收通过并已结案**。
> ⏳ **当前待验**：U33 Office 预览（doc/docx/ppt/pptx 转 PDF）—— 取决于宿主是否启用文档预览服务；宿主未启用时**预期就是**「Office 预览不可用」（与官方一致，非 bug）。验收清单见 [worklog/office-preview-officetopdf.md](worklog/office-preview-officetopdf.md) §四。

> 已验项（用户 2026-10-01 / 10-03 / 10-04 分批复核）已移 [PROGRESS-HISTORY.md](PROGRESS-HISTORY.md)：主界面+运行态摘要、高级区第二轮+多 Agent 协作、表单弹窗观感第五轮+脏判定、附加文件选择+上传（U15①）、UI 基础层收口（冒烟 390）、新增/编辑任务（U16）、任务展开三面板（规格 [design/features/task-expand-panels.md](design/features/task-expand-panels.md) §3.1b · §3.1d · 过程 [worklog/expand-panels-round4.md](worklog/expand-panels-round4.md)）、工作区候选真源统一、立即执行、执行记录总查询页、文件预览五项。

### 1.9 事件推送机制（SSE 事件总线）—— 🔵 **进行中**（2026-10-06 开工）

> 用户拍板：别再老用轮询，建一套「后端发事件、前端订阅」的推送总线。定型文档 = [design/event-push.md](design/event-push.md)；过程 = [worklog/event-push.md](worklog/event-push.md)。
> ✅ **基建已落码（2026-10-06）**：事件目录 + 广播器（按 type+身份 合并/窗口）+ SSE 端点 `/events` + 全量变更点接线 + 前端单例订阅 + 主列表/执行记录/日程接入。
> ✅ **专家团审计 + 修正已完（2026-10-06/07，六轮）**：① 四路独立只读审计提出 **20 项**（7 🔴 / 11 🟡）**已全部修完**；② 复核轮**无 🔴**；③ 换角度再审（**完整性/缺口** + **对抗**）挖出「**文档承诺了、代码没做**」的实症 —— **P3 的「`CONFIG_CHANGED` 接管设置页快照」根本没落地**（设置页/调试页无人订阅）、**查看档「上次执行」不在事件覆盖内**，均已补；④ 验证轮再次**无 🔴**；⑤ **不变量/破坏面** + **从零重算覆盖矩阵** 又挖出 **3 处未覆盖展示点**（卡片展开面板的**行级**变化、调试页 `/db` 转储、设置页配置表单），并钉下 **11 条不变量守卫**（`[21]`）；⑥ **四项新方向一次打完**（数据新鲜度与竞态 / 性能与放大 / 自动刷新副作用 / 安全与输入面）⇒ 又修 **1 条 🔴 静默过期**（附件路径不进 rev ⇒ 附件永久不可点，rev 已改**复合版本**）、**3 条上一轮引入的回退**（调试页每次事件重拉 1–3MB、日程页同批并发 N 个整月请求、查看档刷新闪空白）、`window` 未进排期指纹致卡片与调度分叉、`tickMs` 卡在 `unchanged` 早退后致前端口径不更新、`/events` 连接数无上限；再加 **10 条守卫**（`[22]`）。
> 最要紧的三条都是**实证 / 反向核验 / 新角度**逼出来的：SSE 清理曾同时挂 `req` 的 `close`（Node ≥16 该事件在**请求流被消费过**时会**建连瞬间**触发 ⇒ 当场退订，现状能跑纯属侥幸）；`CONFIG_CHANGED` 曾在正常路径**一次改动发两次**、靠合并窗口吃掉多余的（拿下游兜上游的底）⇒ 改为 `scope.watch` **唯一发射点 + 边沿触发**；`rev` 只覆盖内容 rev ⇒ 附件解析变化**永久静默过期** ⇒ 改**复合版本**。
> ⑦ **第七轮：六个方向一次打完**（i18n/边界数据 / 兼容性与产物 / 降级与宿主矩阵 / 可观测性）⇒ 又修 **1 条持久化丢数据路径**（整批 `tasksInline` 非法 JSON 能落盘成权威表 ⇒ 任务整表消失且每次启动复现，已补形状闸门）+ **推送链可观测性**（调试页印推送通道自述：连接状态/最后收帧/重连次数；订阅回调抛错与 SSE 写出失败都留痕）+ 关掉默认开着的调试日志。
> ⑧ **第八轮：把「登记不改」的全部修掉**（用户拍板「是问题就改」）：i18n 三处硬编码中文（含 `validateTaskDraft` 增加 `t` 席位）+ 30 个死键清理 + 动态 locale key 收窄；并**纠正自己两条判错**：~~版本偏移~~（前后端同一个包，不可达 ⇒ 已从文档撤掉）、~~CSS 该补回退~~（语义色浅底用 `color-mix` 是刻意跟随宿主主题色，改为基线明写 + 只给固定中性面 6 个 token 补无损回退）。评审两轮：字典三集合 **611/611/611** 一致、整体回归**无 🔴**。
> 校验：typecheck 绿、build 过、冒烟 **718/0**（`[19]` 8 + `[20]` 31 + `[21]` 11 + `[22]` 10 + `[23]` 5 + `[24]` 13）。已知边界（多标签页覆盖 / 记录页塌页 / 时钟 / rebinding / 重复 apply 幂等）逐条登记在 [design/event-push.md](design/event-push.md) §十二。过程与全部结论见 [worklog/event-push.md](worklog/event-push.md)。
> ⏳ **待真机验收**：装 `dist/` 后确认「任务跑完 / 改开关 ⇒ 开着的那页即时更新」；反向代理场景需关 SSE 缓冲（见文档 §九）。
> 本轮范围：**只建机制**；轮询处置见 §1.10（2026-10-06 已开工）。

### 1.10 轮询 → 事件驱动 处置 —— 🔵 **进行中**（2026-10-06 开工）

> 处置清单（真源）= [design/client-refresh-disposition.md](design/client-refresh-disposition.md)：R1 该用通知的全换通知 / R2 重连保底**统一一份**（不给每条轮询各做）/ R3 断 **>30s** 自动重连、数据脏了页面自读**不回补**。
> ✅ **批次一已落码**：① 统一重连 —— `event-subscribe.ts` 浏览器重连 + **30s 看门狗** + 连上即补读；② **三条数据轮询退场** —— 实例 5s（`instances-poll.ts` 已删、两页改事件驱动）、overview 10s（主列表改 `TASKS_CHANGED`/`TASK_RUN_*`）、设置页快照 2s（收窄为**有订阅者才轮**）。
> ✅ **批次二~六已落码**：心跳与 `LiveText` 归位 `ui/`（`NextPill` 并回全局心跳）、时间文案层归位 `time-text.ts`、列表取数层归位 `task-overview.ts`、`humanizeTaskError` 归位 `error-text.ts`；`pad2` / `formatBytes` / `baseNameOf` 各两份收编进 `format.ts`；**API 前缀 4 份 → 1 份**（`query.ts` 的 `API_PREFIX`）；barrel 收尾（删 `editor-fields` 二次再导出、`ui/running` + `ui/CodeViewer` 补登记）；死代码 `markdown.ts` / `formatShortStamp` / `marked` 依赖已删。
> 🔎 **剩余项复核后判定「不做」**（M2/M6/M7/W4/W5/M8 —— 复核发现不是「寄居页面」或已随批次解决），逐条理由见 [design/client-refresh-disposition.md](design/client-refresh-disposition.md) §八。
> ⏳ **真机验收由用户最后一次性做**（本次改动跨前后端，建议连同事件推送一起验）。

---

## 二、未决项

> 📌 **2026-10-05 未决项大清理**：U2 / U4 / U5–U9 / U10–U15 / U17 / U20⑧ 均已结案移 [PROGRESS-HISTORY.md](PROGRESS-HISTORY.md)（其中 U7 / U8 / U10–U14 此前就已收口、历史里已有记录，本表属残留陈旧行；U6 按用户拍板随调试页重构一并处理，不再单独立项）。**U20「待抽象」7 项已于 2026-10-05 收口**（上提 `Textarea`/`Checkbox`/`FloatingToast`closable/`.dsh-tdt-resizer`+`startResizeLayoutWidth`/`.dsh-tdt-ellipsis`，token 兜底归一；编辑器侧本就单一定义，镜像层外壳随 [design/ui-style-guide.md](design/ui-style-guide.md) §七「宿主会话面 1:1 镜像」边界不抽，见 [PROGRESS-HISTORY.md](PROGRESS-HISTORY.md)）。本表现在只剩真正开着的：**U1**（用户确认推迟远期）、**U31 / U33 / U34**（见 §三）。

| # | 问题 | 现状与影响 | 将来怎么解（方向，未定） |
|---|---|---|---|
| U1 | **任务跑到一半插件重启 ⇒ 这趟执行就废了**（2026-09-23 真机暴露，用户拍板推迟；**2026-10-05 确认继续推迟远期**，条目重写为人话） | **哪些情况算「重启」**（三种效果一样）：升级/重装插件（进程重启）、宿主重启、机器重启——重启后插件把「正在跑的会话」的句柄丢了。**断了之后发生什么**：① 该实例先被 `startupScan` 标 `unknown`（未知）；② 静默观察 65 分钟没动静 ⇒ 判死；③ 默认 `retry.maxAttempts=1` ⇒ 直接记 `failed`，这趟白跑。**更深的坑**：用户在界面手动「继续」那个会话也没用——回执工具是派发时挂在会话上的，重启恢复出来的会话里没有它 ⇒ 插件永远收不到「我干完了」，就算聊完了也照样判失败。**一句话：定时任务扛不住任何形式的重启** | 方向（未定）：① **续跑（接着跑）**＝启动时找回未终态实例的会话 + 重新挂回执工具 + 补发一次追问 ⇒ 「手动继续」这条路才真正通；② **补跑（重头再跑一次）**＝确认会话已死的，判死时自动补跑一次，且这次额度**独立于**用户配的重试次数（不混算）；③ 补跑前要处理上次可能留下的**半成品文件**（约定清理或幂等） |
| U31 | **任务选择器替换「前置任务」下拉的时机与范围**（2026-10-03 随执行记录总查询页登记；2026-10-04 更新） | 用户要求带搜索的任务选择器**必须抽象成共用控件**（「很多地方都要用」）。✅ **其中「工作区候选真源统一」已于 2026-10-04 单独完成**（三处一律取 `/options`，任务列表顶部手搓下拉收编为 `SelectField`，见 §1.7）。✅ **① 已完成（2026-10-04）**：执行记录过滤行的任务选择已换 `TaskPicker`（`records-timeline.tsx:863`），原生 `<select>` 不再用。**剩余**：② 编辑器「前置任务」第②级（`task-editor.tsx:1929-1937`）仍是 `SelectField`、作用域 `depWs`（`:1865`）仍是**内部** state；③ 任务选项文案两套（`title（id）` vs `[code] name`） | ② 换 `TaskPicker` 并把第①级工作区从内部 state 改**受控入参**；③ 统一取 `[code] name` |
| U33 | **Office 预览（doc/docx/ppt/pptx）接入官方 `remote.officeToPdf`**（2026-10-05 用户报 + 已落码；⏳ **真机验收待做**，取决于宿主是否启用文档预览服务） | 用户报：本插件预览面里 `.xlsx` / `.ppt` 都显示「二进制文件，暂不支持预览…」，而原生工作区里 PPT 报「Office 预览不可用…」、Excel 却能渲染。**核实结论（两条完全不同的路）**：Office = **主机侧转换**（官方 `ctx.inject(['remote','remote.officeToPdf',…])` → `render()` 转 PDF 再渲染）；Excel = **纯前端**（官方私有分包 `client.excel.js` 的 `@fortune-sheet` + SheetJS，**借不到**：导出面全 type / 引擎在私有分包 / 只绑右栏 seat，且每插件独立打包不共享）。**Office 路线反而零 npm 依赖**（`dsh-office-to-pdf` 的 `./remote` 只做 `declare module` 类型扩展，`documentpreview` 也只放 devDependencies ⇒ 运行时服务由宿主提供）⇒ 按本仓惯例**本地声明服务面 + dotted inject** 即可 | **已落码**：① `previewKind` 加 `office` 分支（`OFFICE_KINDS = doc/docx/ppt/pptx`，**刻意不含 xls/xlsx**——Excel 待用户定）；② `OfficeToPdfFace` 本地声明（零 npm 依赖，契约出处写进注释）；③ `OfficePreview`：`render(sessionId,path,'foreground')` → `bytesOf` 取 `data` → Blob → objectURL → **复用既有 PDF 的 iframe**；④ `ctx.inject(['remote','remote.officeToPdf'])`（**dotted**，只注 `remote` 会永久探测失败——2026-09-28 同款根因）经 `officeRef` 下发；⑤ `errView` 加 `invocation-unavailable`/`service-unavailable`/`failed+reason==='unavailable'` → 「Office 预览不可用」（与官方逐字一致）；⑥ 中英文案齐备。typecheck 绿、**冒烟 598/0**（+6 断言）、build 过。过程 [worklog/office-preview-officetopdf.md](worklog/office-preview-officetopdf.md)。⏳ **真机**：宿主未启用服务时**预期就是**「Office 预览不可用」（与官方一致，非 bug），启用后应看到渲染后的 PDF；验收清单见该 worklog §四 |
| U34 | **Excel 预览路线待用户定**（2026-10-05 用户拍板「向后讨论」，本轮未动） | 官方 `OfficeExtension` **含 `xls` / `xlsx`** ⇒ 表格**也能**经 `officeToPdf` 转 PDF 预览。故 Excel 有两条路：① **转 PDF**（零 npm 依赖、复用 U33 同一条链路，但**不可编辑**、只是页面图像）；② **可编辑表格**（自引 `@fortune-sheet` + `xlsx`，增体量 ~1~2 MB，**破本仓「绝不引第三方包」原则**，且官方那份在私有分包里借不到） | 待用户定路线后落码。⚠️ 另记一处**宿主侧**风险（前端无解）：引擎 `@deepseek-ai/libreoffice-kit` 的 `optionalDependencies` **没有 linux-x64 原生包**（仅 wasm / win32-x64 / win32-arm64 / darwin-x64 / darwin-arm64）⇒ 宿主启用服务 ≠ Linux 主机一定能转；真机若在 Linux 上报「不可用」，先查宿主服务再查该原生包 |

---

## 三、下一步

> 文档体系整理已于 2026-10-01 结案（见 [`PROGRESS-HISTORY.md`](PROGRESS-HISTORY.md)）。以下为**在办事项**（已完成的 1–13 项已随各工作包结案移出）。

1. **U33 Office 预览真机验收**：宿主启用文档预览服务后，确认 doc/docx/ppt/pptx 能渲染出 PDF。
2. **U34 Excel 预览路线**：待用户拍板「转 PDF」还是「可编辑表格」，拍板后落码。
3. **U31 剩余 ②③**：编辑器「前置任务」第②级换 `TaskPicker` + 第①级工作区改受控入参；任务选项文案统一取 `[code] name`。
4. **任务日程：日期右上角标农历（初一 / 十五等）** —— ⏸️ **用户 2026-10-06 拍板暂缓**：先把日程样式调好再说。⚠️ 开工前必读：农历**算不出来，只能内置数据表**（本仓不引第三方包 ⇒ 不引 lunar 库）；表是 200 多个常量，必须**用已知锚点做冒烟断言校验**（如春节：2024-02-10 / 2025-01-29 / 2026-02-17 均为正月初一），**锚点对不上就不许提交** —— 算错就等于界面上显示假日期，直接违反「禁止模拟数据」的硬规矩。显示范围暂定只标农历日名（不标节日 / 节气）。
5. **（🔵 进行中）事件推送机制（见 §1.9）**：按 [design/event-push.md](design/event-push.md) §八 实施步骤推进——核实宿主流式能力 → 事件目录 / 广播器 / SSE 端点 → 全量变更点接线 → 前端订阅封装 → 页面接入 → build / smoke / typecheck。
6. **（⏳ 真机验收待做）插件配置改存自有状态库**（2026-10-08）：设置页保存改走 `meta.pluginConfig`（不再碰宿主配置面）。待验：改设置 → 保存 → 刷新页面值仍在；改回默认值 → 该字段从库里消失。已知代价：宿主通用「插件配置」页不再反映本插件设置。




