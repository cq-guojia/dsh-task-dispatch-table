# 附加文件：选择 / 上传交互（2026-09-29）

> 工作包：任务表单弹窗「附加文件」框的**选择工作区文件**与**本地文件上传**两条交互全链路落码。
> 前置事实：展示 + 删除已做（`e2bea3a` 一轮的「附加文件卡壳」），「添加文件」按钮当时 disabled。

## 一、方案拍板（动手前与用户对齐）

- 现状核对：`Attachment` 接口已有（`kind:'link'|'upload'`、`ref`、`name`），草稿挂 `attachments:[]`；官方 `primitives` **无** Upload / Dropzone / FilePicker 组件（清单逐项核实过）。
- **不引包**：范围小（拖拽区 + 隐藏 input 约 30–50 行），按用户规则「(b) 东西少就自己做」；自研才能完全贴合官方 `--dsw-alias-*` token，不给受限 bundle 添依赖。
- 用户拍板：**选择 + 上传一起做**（含宿主路由）；上传**放开常见类型**（文本/图片/文档扩展名白名单）、体积上限 **20MB**。
- 形态：`link` = 只记工作区路径（沿用「选文件只记路径」既定语义）；`upload` = 宿主落盘、**不覆盖累加**。

## 二、落码内容（`680d23f`）

**客户端（task-editor.tsx / locales.ts / file-browser.tsx / client/index.ts）**

- 「添加文件」拆两入口：「选择工作区文件」「上传文件」。
- **选择工作区文件**：官方 `Modal` 内嵌工作区文件选择器——目录浏览逻辑抽自 `file-browser.tsx`（复用 `workspaceFiles.list`，不含预览），面包屑 + 目录/文件列表，选中即关弹窗，挂 `Attachment{kind:'link', ref:路径, name}`。
- **上传**：拖拽投放区（`onDragOver`/`onDrop`）+ 点击触发隐藏 `<input type=file>`（`multiple`）；文件逐个 `POST /api/task-dispatch-table/attachment`，原始名走 **`x-filename` 头**（URL 编码，避免二进制体夹带名字），成功后挂 `Attachment{kind:'upload', ref, name}`；在途 `uploading` 态、失败红字提示（`editorUploadFailedMsg` 占位符插值）。

**宿主（src/index.ts）**

- 新路由 `POST /api/task-dispatch-table/attachment`：同源守卫 → `x-filename` 解码 → **扩展名白名单**（`ALLOWED_ATTACHMENT_EXT`，文本/图片/文档常见类型）→ 读体（`readDispatchBodyBuffer`，20MB 上限）→ 落盘 `task-attachments/<原始名>-<randomBytes(3) hex><ext>`（**不覆盖累加**：随机尾缀撞名概率可忽略）→ 返回 `{ok, ref, name}`。
- 目录 = 插件数据根（statePath 同层）下 `task-attachments/`。

## 三、踩坑与修复（本仓库惯例记全）

1. **`scope` 越界**：首版在 webServer inject 回调里直接写 `resolveStatePath(scope.get().statePath)` 求附件目录——但 `scope` 是 **settings inject 里才创建**的（webServer 回调先跑）⇒ `TS2304: Cannot find name 'scope'`。修法 = `attachmentsDirRef` 提到 apply 作用域，settings inject 就绪时随 statePath 定格，路由 handler **惰性读取**（未就绪上传返回 503 `attachments-dir-not-ready`）。这个时序差本身就是事实：statePath 在 settings inject 才定格。
2. **`@types/node` 的 fs 只有回调式重载**：`fs.mkdir(path, {recursive:true})` 报 `TS2353`（把 options 当 `NoParamCallback` 匹配）、`fs.writeFile(file, buffer)` 报 `TS2554`（要求 3–4 参）——本仓库 `@types/node@22.20.4` 的 `fs` 命名空间 promise 重载在 `fs/promises`，主命名空间全回调式。修法 = `mkdirSync`/`writeFileSync`（低频落盘，同步足够）。
3. **`t()` 不收插值参数**：`Translate` 类型有 `params` 但组件里解构出的 `t` 是单参形态 ⇒ `TS2554`。仓库惯例 = `tt = useMemo(() => interpolateTranslate(t), [t])`，插值文案一律走 `tt`。

## 四、验证

- typecheck（宿主 + client 两套 tsconfig）+ build（dist 入库）+ 冒烟 **176 项全过**。
- 真机验证：**待用户测**——选择工作区文件（浏览/选中/卡片出现/删除）、拖拽上传与点选上传、超限与类型拒绝的报错、上传文件卡片展示与删除。

## 五、边界与后续

- 上传文件与任务的关联目前只在**草稿层**（`attachments` 数组）；是否随任务定义持久化、执行时如何注入给 agent，**未做**——待用户拍板（可能并入 P2 保存链路）。
- `link` 型路径的执行期语义沿用「只记路径、agent 执行时自读」。

## 六、第二轮（`2bd4ccd`，用户真机反馈五连）

1. **布局重排**：「上传文件 / 选择工作区文件」改卡片**右上两个小按钮**；投放区**常驻**（不经按钮开合，删 `uploadOpen` 态）；「上传文件」点击 = 直接弹本地选择框（隐藏 input 提到卡片层、始终在册）。投放区两行：操作提示 + 支持格式 / 20MB 说明。
2. **多选丢失（真 bug）**：`uploadFiles` 循环里每次 `addAttachment` 都展开**渲染闭包里的旧 `draft.attachments`** ⇒ 多选时后一个 patch 覆盖前一个，列表只剩最后一个文件。修 = 本地累积 `added[]`、循环末一次性 `patch({attachments:[...draft.attachments, ...added]})`。
3. **附件行样式**：弃 `border`（用户嫌丑），改半透明浅底 `--dsw-alias-interactive-bg-hover`（带 rgba 兜底）；文件名前加官方 `FileTypeIcon`（同 file-browser 目录树）。
4. **报错说人话**：`uploadError` 改存宿主返回的机器码，渲染按码映射中英文具体文案（格式不支持 / 超 20MB / 空文件 / 通用失败），不再透出 `file-type-not-allowed` 之类。
5. **「暂无可浏览的工作区」根因定位（未动代码，待讨论）**：选择器依赖 `workspaceSessionId`，而它只在用户点开过会话文件链接（`openFile`）后才有值 ⇒ 新建任务/没浏览过文件时必空。按守则拽官方 `dsh-api-workspace-files@0.1.7-rc.2` 源码核实：**所有方法（list/read/stat/readBytes/changes）第一个参数都是 `workspaceFileScopeId: SessionId`**，scope 由会话 header 的 cwd 派生；**目录列举被限定在「该会话所属工作区根」内**（types 注释：directory listings remain workspace-scoped），read/stat 虽允许工作区外绝对路径但只能读已知路径、不能枚举。**官方没有「按工作区路径列文件」的无会话接口**。可行官方路子 = 给选择器喂一个属于目标工作区的已有会话 id（来源：执行记录 `session_id` / registry 实体 sessionIds）；没跑过会话的工作区官方就没有浏览入口，**不造会话绕开**。根目录本身能读（有会话锚点时 `list('')` 即列该工作区根，U11 已真机验证）——不是用户猜的「跑到工作区上层根目录」问题，是前端压根没拿到会话锚点。

## 七、第三轮（会话锚点落地，用户拍板）

- **先复核了宿主 0.2.0-rc.1**：`dsh-api-workspace-files@0.2.0-rc.1` 与 rc.2 契约**逐字一致**（仍全要 sessionId，无按工作区路径入口）⇒ 无会话直取**官方不支持**，结论已沉淀进 dsh-capabilities.md（含跟进项：官方将来提供直取面就撤锚点方案）。
- **用户拍板**：不找「根目录」，浏览范围 = **任务已选的那个工作区**；未选工作区点「选择工作区文件」⇒ **官方 Toast** 提示「请选择任务执行的工作区后，再选择工作区文件。」。
- **锚点来源（官方数据）**：`/options` 路由按工作区下发 `anchorSessionId` = `entity.sessionIds` 末位（最近一个会话；`@deepseek-ai/dsh-workspace@0.2.0-rc.1` `lib/types/entity.d.ts:68` 核实有该 getter，归档会话保留槽位 ⇒ scope 解析无需激活 agent）。没有会话的工作区不下发 ⇒ 选择器显示「该工作区还没有历史会话，暂无法浏览其文件，请使用上传」空态。
- **官方 Toast**：`primitives` 公开导出（0.2.0-rc.1 `lib/types/Toast.d.ts`）：`{text, tone?, anchor?, holdMs?, onDone}`，重播须换 key 重挂；`primitives.d.ts` 补消费面声明。顶部居中 body 传送门，与抽屉无层叠冲突。
- **其余两处**：① 删「暂无附加文件」空态文案（投放框常驻已是空态，键 `editorAttachmentNone` 全删）；② **上传先验尺寸再发包**——超 20MB 当场报「文件超过大小限制」，不再白传半天才失败（此前服务端才拦，用户真机抱怨「转了很久才报错」）。

## 八、第四轮（预检补格式 + 附件落点死规则）

- **白名单收敛为共享模块** `src/attachment-allowlist.ts`（`ATTACHMENT_MAX_BYTES` / `ALLOWED_ATTACHMENT_EXT` / `extOf`）：宿主路由与浏览器端预检**必须同一份**，防两处漂移；客户端打包 alwaysBundle 内联、宿主 tsc 直编。
- **客户端预检补格式判断**：发包前先滤尺寸、再滤扩展名（不在白名单 ⇒ 当场报「格式不支持」），不合规跳过、其余照传；两类都不合规时以最后一条错误显示。
- **附件落点死规则（用户拍板，写进决策 46 ⑥）**：link 型附件必须位于任务所选工作区内——UI 选择器只列已选工作区是第一道闸，**P2 保存链路宿主必须二道校验（ref 归一后越界 ⇒ 拒绝保存）**；upload 型落插件数据根不受此限。
