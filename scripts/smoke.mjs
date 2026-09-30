// 冒烟测试：验证决策 25 的两处底层改造（刻度化调度 + 执行身份/防重）以及旧库可继续用。
//
// 跑法：npm run smoke（先 npm run build，本脚本直接引 dist 产物，测的是真正要发布的代码）。
// 刻意不引任何测试框架：零新增依赖，宿主环境装不了也照样能跑。
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { randomUUID } from 'node:crypto'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { DatabaseSync } from 'node:sqlite'
import {
  ensureIdsInInlineJson, existingUuidIds, firstSlotOnDay, nextSlotAfter, parseInlineTasks, scheduledSlotsFor, applyIdentity, isUuid,
  displayNameOf, formatSlotShort, sessionTitleOf,
  removeDefinitionInline, setEnabledDefinitionInline, upsertDefinitionInline, validateDefinitionForSave,
} from '../dist/tasks.js'
import {
  assetPaths, deleteTaskAssets, deleteVersion, listVersions, purgeTmp, readSnapshot, readVersion,
  reconcileAttachments, saveSnapshot, saveVersion,
} from '../dist/task-assets.js'
import { TaskStore, parseInstanceSnapshot } from '../dist/store.js'
import { createReconciler, extractTokenUsage } from '../dist/reconcile.js'
import { createScheduler, judgeDependencies } from '../dist/scheduler.js'
import { buildMessage } from '../dist/dispatch.js'
import { createRuntimeIndex } from '../dist/runtime-index.js'

let passed = 0
const failures = []

/** 断言：通过计数，失败收集（最后统一报，便于一次看全）。 */
function check(name, ok, extra = '') {
  if (ok) {
    passed++
    console.log(`  ✓ ${name}`)
  } else {
    failures.push(`${name}${extra === '' ? '' : ` — ${extra}`}`)
    console.log(`  ✗ ${name}${extra === '' ? '' : ` — ${extra}`}`)
  }
}

/** 一个最小可用的任务定义（schema 必填项：enabled / schedule / target）。 */
function def(overrides) {
  return {
    enabled: true,
    schedule: { cron: '0 9 * * *', timezone: 'UTC', window: 'PT4H' },
    target: { workspace: 'Temp', prompt: 'do the thing' },
    ...overrides,
  }
}

const root = mkdtempSync(join(tmpdir(), 'dsh-tdt-smoke-'))

try {
  // ── 1. 刻度计算（决策 25 核心：锚点是刻度，不是日期）──
  console.log('\n[1] 刻度计算 scheduledSlotsFor')
  const daily = def({ id: 'daily', title: '日报' })
  const day0 = new Date('2026-09-24T00:00:00Z')
  const day3 = new Date('2026-09-27T00:00:00Z')
  const dailySlots = scheduledSlotsFor(daily, day0, day3)
  check('每天 09:00：3 天 → 3 个刻度', dailySlots.length === 3, `实际 ${dailySlots.length}`)
  check('每天 09:00：刻度都在 09:00', dailySlots.every(slot => slot.getUTCHours() === 9))

  const hourly = def({ id: 'hourly', schedule: { cron: '0 * * * *', timezone: 'UTC', window: 'PT1H' } })
  const hourlySlots = scheduledSlotsFor(hourly, day0, new Date('2026-09-25T00:00:00Z'))
  check('每小时：1 天 → 24 个刻度（旧实现只能出 1 个）', hourlySlots.length === 24, `实际 ${hourlySlots.length}`)

  const quarter = def({ id: 'q', schedule: { cron: '*/15 * * * *', timezone: 'UTC', window: 'PT10M' } })
  const quarterSlots = scheduledSlotsFor(quarter, day0, new Date('2026-09-25T00:00:00Z'))
  check('每 15 分钟：1 天 → 96 个刻度', quarterSlots.length === 96, `实际 ${quarterSlots.length}`)

  const biMonthly = def({ id: 'bm', schedule: { cron: '0 9 1 */2 *', timezone: 'UTC', window: 'PT4H' } })
  const biMonthlySlots = scheduledSlotsFor(biMonthly, new Date('2026-09-01T00:00:00Z'), new Date('2027-09-01T00:00:00Z'))
  check('每 2 个月：1 年 → 6 个刻度', biMonthlySlots.length === 6, `实际 ${biMonthlySlots.length}`)
  check(
    '每 2 个月的刻度落在单数月 1 号 09:00',
    biMonthlySlots.every(slot => slot.getUTCMonth() % 2 === 0 && slot.getUTCDate() === 1 && slot.getUTCHours() === 9),
  )

  const onceTask = def({ id: 'once', schedule: { once: '2026-09-24T21:00', timezone: 'UTC', window: 'PT4H' } })
  const onceSlots = scheduledSlotsFor(onceTask, day0, day3)
  check('once 任务不走 cron（刻度为空）', onceSlots.length === 0)

  // 1.1 开始时间（锚点）+ 每 N 周（cron 无隔周位 ⇒ 引擎用锚点 + 取模）
  console.log('\n[1.1] 开始时间 + 每 N 周')
  const anchor = '2026-09-28T09:00' // 锚点（首跑取锚点之后的第一个周一，周几无关）
  const every2 = def({ id: 'e2', schedule: { cron: '0 9 * * 1', timezone: 'UTC', window: 'PT4H', start: anchor, everyNWeeks: 2 } })
  const e2Slots = scheduledSlotsFor(every2, new Date('2026-09-28T00:00:00Z'), new Date('2026-11-10T00:00:00Z'))
  check('每 2 周：刻度均落在周一 09:00', e2Slots.length > 0 && e2Slots.every(s => s.getUTCDay() === 1 && s.getUTCHours() === 9))
  check('每 2 周：相邻刻度间隔 14 天', e2Slots.every((s, i) => i === 0 || (s.getTime() - e2Slots[i - 1].getTime() === 14 * 24 * 3600 * 1000)))
  check('每 2 周：首刻 = 锚点之后的第一个周一',
    e2Slots.length > 0 && e2Slots[0].getTime() >= Date.parse(`${anchor}:00Z`)
      && (e2Slots[0].getTime() - Date.parse(`${anchor}:00Z`)) < 7 * 24 * 3600 * 1000)
  const startLower = def({ id: 'sl', schedule: { cron: '0 9 * * *', timezone: 'UTC', window: 'PT4H', start: '2026-10-01T09:00' } })
  const slSlots = scheduledSlotsFor(startLower, new Date('2026-09-28T00:00:00Z'), new Date('2026-10-10T00:00:00Z'))
  check('开始时间作为下界：首刻不早于锚点', slSlots.length > 0 && slSlots[0].getTime() === Date.parse('2026-10-01T09:00:00Z'),
    slSlots.map(s => s.toISOString()).slice(0, 1).join())

  const first = firstSlotOnDay(daily, '2026-09-25')
  check('firstSlotOnDay 命中当日刻度', first !== undefined && first.getUTCHours() === 9)
  // 一年只跑 1 月 1 号的 cron，问 9 月 24 号必然没有刻度
  const yearly = def({ id: 'yearly', schedule: { cron: '0 9 1 1 *', timezone: 'UTC', window: 'PT4H' } })
  check('firstSlotOnDay 取不到时返回 undefined', firstSlotOnDay(yearly, '2026-09-24') === undefined)

  const next = nextSlotAfter(hourly, new Date('2026-09-24T10:30:00Z'))
  check('nextSlotAfter 给出下一个刻度', next !== undefined && next.getTime() > Date.parse('2026-09-24T10:30:00Z'))

  // ── 2. 定义身份：id 写进 JSON（不依赖位置、不需要登记表）──
  console.log('\n[2] 定义身份 ensureIdsInInlineJson')
  const noopLogger = { info() {}, warn() {}, error() {} }
  const store = new TaskStore(join(root, 'state.db'))
  const twoTasks = JSON.stringify([
    { title: 'A', enabled: true, schedule: { cron: '0 9 * * *', timezone: 'UTC', window: 'PT4H' }, target: { workspace: 'T', prompt: 'a' } },
    { title: 'B', enabled: true, schedule: { cron: '0 10 * * *', timezone: 'UTC', window: 'PT4H' }, target: { workspace: 'T', prompt: 'b' } },
  ])
  const r1 = ensureIdsInInlineJson(twoTasks)
  check('缺 id 时生成并标记写回', r1.changed === true && r1.assigned === 2, `changed=${r1.changed} assigned=${r1.assigned}`)
  const ids1 = JSON.parse(r1.json).map(item => item.id)
  check('生成的 id 形态：标准 UUID（决策 30：机器身份随机生成，不派生自内容/名称）',
    ids1.every(id => isUuid(id)), ids1.join(', '))
  check('两条拿到不同 id', ids1[0] !== ids1[1])

  const r2 = ensureIdsInInlineJson(r1.json)
  check('二次调用不再变更（幂等，不会每 tick 重写）', r2.changed === false && r2.assigned === 0)

  // ── 2.1 编号 code（决策 30）：可选、trim、空白视为未填、不参与身份 ──
  console.log('\n[2.1] 身份只认 UUID（运行时不修）+ 编号 code 仅记录（决策 30）')
  const UUID_A = '3f2b8c1a-9d4e-4f5a-8b7c-1a2b3c4d5e6f'
  const UUID_B = '7c9e2f40-3a1b-4c8d-9e2f-5a6b7c8d9e0f'
  const schedA = { cron: '0 9 * * *', timezone: 'UTC', window: 'PT4H' }
  const targetA = { workspace: 'T', prompt: 'a' }
  const codeTask = applyIdentity({ id: UUID_A, code: '  RPT-001  ', title: '日报', enabled: true, schedule: schedA, target: targetA })
  check('code 存前 trim', codeTask?.code === 'RPT-001')
  const blankCode = applyIdentity({ id: UUID_A, code: '   ', title: '日报', enabled: true, schedule: schedA, target: targetA })
  check('空白 code 归一为未填（undefined）', blankCode?.code === undefined)
  const noCode = applyIdentity({ id: UUID_A, title: '日报', enabled: true, schedule: schedA, target: targetA })
  check('不填 code 也能正常解析（可选字段）', noCode?.code === undefined && noCode?.id === UUID_A)
  check('无 id ⇒ 运行时不处理（返回 null；id 只在保存闸门生成固化）', (() => {
    try { return applyIdentity({ title: '日报', enabled: true, schedule: schedA, target: targetA }) === null } catch { return false }
  })())
  check('旧格式 id（kebab-case / t- 指纹）⇒ 运行时同样不处理', (() => {
    try { return applyIdentity({ id: 'work-report-once9', title: '日报', enabled: true, schedule: schedA, target: targetA }) === null } catch { return false }
  })())
  check('同 code 的两条任务身份互不相干（code 不进判断）', (() => {
    const a = applyIdentity({ id: UUID_A, code: 'X', title: '甲', enabled: true, schedule: schedA, target: targetA })
    const b = applyIdentity({ id: UUID_B, code: 'X', title: '乙', enabled: true, schedule: { cron: '0 10 * * *', timezone: 'UTC', window: 'PT4H' }, target: { workspace: 'T', prompt: 'b' } })
    return a?.id === UUID_A && b?.id === UUID_B
  })())

  // 关键回归：删掉第一条后，剩下那条必须还是原来的 id（下标方案会串号，写进 JSON 不会）
  const arr = JSON.parse(r1.json)
  const bIdBefore = arr[1].id
  arr.shift()
  const afterDelete = ensureIdsInInlineJson(JSON.stringify(arr))
  check('删掉第一条后，剩下任务的 id 不变', JSON.parse(afterDelete.json)[0].id === bIdBefore)
  check('删掉第一条后不需要补 id', afterDelete.changed === false)

  // 调顺序也不该动 id
  const swapped = [JSON.parse(r1.json)[1], JSON.parse(r1.json)[0]]
  const afterSwap = ensureIdsInInlineJson(JSON.stringify(swapped))
  check('调换顺序后 id 各自跟着任务走', JSON.parse(afterSwap.json)[0].id === ids1[1] && afterSwap.changed === false)

  // id 格式不对 ⇒ 视为没有，重新生成并覆盖
  const badId = JSON.stringify([
    { id: 123, title: 'C', enabled: true, schedule: { cron: '0 9 * * *', timezone: 'UTC', window: 'PT4H' }, target: { workspace: 'T', prompt: 'c' } },
  ])
  const rBad = ensureIdsInInlineJson(badId)
  check('id 格式不对（数字）⇒ 整批拒绝保存（决策 30 修订：非 UUID 报错，不静默重生成）', (() => {
    const out = ensureIdsInInlineJson(badId)
    return out.error !== null && out.changed === false && /第 1 条/.test(out.error)
  })())
  check('手写 kebab-case id 同样被拒（只认 UUID）', (() => {
    const out = ensureIdsInInlineJson(JSON.stringify([
      { id: 'link-test-once', title: 'C', enabled: true, schedule: { cron: '0 9 * * *', timezone: 'UTC', window: 'PT4H' }, target: { workspace: 'T', prompt: 'c' } },
    ]))
    return out.error !== null && out.changed === false
  })())
  const emptyId = JSON.stringify([
    { id: '   ', title: 'D', enabled: true, schedule: { cron: '0 9 * * *', timezone: 'UTC', window: 'PT4H' }, target: { workspace: 'T', prompt: 'd' } },
  ])
  check('id 是空串也当成没有', ensureIdsInInlineJson(emptyId).changed === true)

  // ── 2.2 决策 30 第三次拍板：带 UUID = 修改，必须在现有已保存表中命中；UUID 不能凭空引入 ──
  console.log('\n[2.2] 修改必须命中现有表（UUID 只能由保存闸门生成）')
  const uuidEntry = (id) => JSON.stringify([
    { id, title: 'E', enabled: true, schedule: { cron: '0 9 * * *', timezone: 'UTC', window: 'PT4H' }, target: { workspace: 'T', prompt: 'e' } },
  ])
  const oldFormatEntry = JSON.stringify([
    { id: 'daily-report', title: 'E', enabled: true, schedule: { cron: '0 9 * * *', timezone: 'UTC', window: 'PT4H' }, target: { workspace: 'T', prompt: 'e' } },
  ])
  const rKeep = ensureIdsInInlineJson(uuidEntry(UUID_A), existingUuidIds(uuidEntry(UUID_A)))
  check('带 UUID 且命中现有表 ⇒ 原样保留（修改语义）', rKeep.error === null && rKeep.changed === false && JSON.parse(rKeep.json)[0].id === UUID_A)
  const rMiss = ensureIdsInInlineJson(uuidEntry(UUID_B), existingUuidIds(uuidEntry(UUID_A)))
  check('带 UUID 但不在现有表 ⇒ 拒绝保存（凭空引入即非法）', rMiss.error !== null && rMiss.changed === false && /不在现有任务表/.test(rMiss.error))
  const rFresh = ensureIdsInInlineJson(uuidEntry(UUID_A), new Set())
  check('现有表为空（首次录入）时带 UUID 同样被拒', rFresh.error !== null && rFresh.changed === false)
  const rNew = ensureIdsInInlineJson(twoTasks, existingUuidIds(uuidEntry(UUID_A)))
  check('无 id 的新增不受命中校验影响（照常生成固化）', rNew.error === null && rNew.changed === true && rNew.assigned === 2)
  check('existingUuidIds：非 UUID id（老数据）不进集合', existingUuidIds(oldFormatEntry).size === 0)

  // 解析侧：每条都带 id，且有 title
  const parsed = parseInlineTasks(noopLogger, r1.json)
  check('解析后每条都有 id 与 title', parsed.length === 2 && parsed.every(task => task.id.length > 0 && task.title.length > 0))
  check('解析出的 id 与写回 JSON 的一致', parsed[0].id === ids1[0] && parsed[1].id === ids1[1])
  const idA = ids1[0]

  // ── 3. 执行身份与防重（UNIQUE(task_id, scheduled_at)）──
  console.log('\n[3] 执行身份与防重 ensureInstance')
  // 新签名：ensureInstance(id, taskId, logicalDate, scheduledAt, status)；去重走唯一索引 UNIQUE(task_id, scheduled_at)
  const first1 = store.ensureInstance(randomUUID(), idA, '2026-09-24', '2026-09-24T09:00:00.000Z', 'pending')
  const again = store.ensureInstance(randomUUID(), idA, '2026-09-24', '2026-09-24T09:00:00.000Z', 'pending') // 同 (task,scheduled_at) 不同 id ⇒ 唯一索引拦截 ⇒ false
  check('同一任务同一刻度只建一条（INSERT OR IGNORE 走唯一索引）', first1 === true && again === false)
  const otherSlot = store.ensureInstance(randomUUID(), idA, '2026-09-24', '2026-09-24T10:00:00.000Z', 'pending')
  check('不同刻度各一条', otherSlot === true)
  const otherDay = store.ensureInstance(randomUUID(), idA, '2026-09-25', '2026-09-25T09:00:00.000Z', 'pending')
  check('不同日期各一条', otherDay === true)
  const rows = store.listByStatus(['pending'])
  check('实例 id 是不透明 UUID（不再含 ":" 拼串）', rows.every(row => !row.id.includes(':')))
  check('实例保留 logical_date 供依赖判定', rows.every(row => /^\d{4}-\d{2}-\d{2}$/.test(row.logical_date)))
  const found = store.findBySlot(idA, '2026-09-24T10:00:00.000Z')
  check('可按（任务 + 刻度）定位实例', found !== undefined && found.logical_date === '2026-09-24')
  // meta 表：任务表 tasksInline 的持久化主通道（面板保存 → state.db，重装/重建不丢）。
  check('meta 未写过的键返回 undefined（区分「从未写」与「写过空串」）', store.getMeta('tasksInline') === undefined)
  store.setMeta('tasksInline', '[{"id":"a"}]')
  check('meta 键值可写可读', store.getMeta('tasksInline') === '[{"id":"a"}]')
  store.setMeta('tasksInline', '[]')
  check('meta 覆盖写生效（upsert，清空语义也是一次写入）', store.getMeta('tasksInline') === '[]')
  store.close()

  // ── 3.5 meta 持久化：重开库（模拟插件重装 / 容器重建）后任务表仍在 ──
  console.log('\n[3.5] meta 持久化（重开库 = 重装场景）')
  const reopened = new TaskStore(join(root, 'state.db'))
  check('重开库后 meta 值原样恢复', reopened.getMeta('tasksInline') === '[]')
  const dump = reopened.dumpTable('meta', 500)
  check('dumpTable：meta 导出含已写行且列齐全', dump.count === 1 && dump.columns.includes('key') && dump.rows[0]['value'] === '[]')
  check('dumpTable：instances 导出形状合法（列齐全、count=rows、无截断）', (() => {
    const d = reopened.dumpTable('task_instances', 500)
    return d.columns.length > 0 && d.rows.length === d.count && d.truncated === false
      && d.columns.includes('task_id') && d.columns.includes('scheduled_at')
  })())
  let dumpRejected = false
  try { reopened.dumpTable('sqlite_master', 10) } catch { dumpRejected = true }
  check('dumpTable：白名单外的表名被拒绝（防注入）', dumpRejected)
  reopened.close()

  // ── 4. 旧库迁移：老数据不丢、索引能建起来 ──
  console.log('\n[4] 旧库迁移')
  const legacyPath = join(root, 'legacy.db')
  const legacy = new DatabaseSync(legacyPath)
  legacy.exec(`CREATE TABLE task_instances (
    id TEXT PRIMARY KEY, task_id TEXT NOT NULL, logical_date TEXT NOT NULL, scheduled_at TEXT NOT NULL,
    status TEXT NOT NULL, attempt INTEGER NOT NULL DEFAULT 0, session_id TEXT, lease_until TEXT,
    dispatched_at TEXT, finished_at TEXT, updated_at TEXT NOT NULL)`)
  legacy
    .prepare('INSERT INTO task_instances (id, task_id, logical_date, scheduled_at, status, updated_at) VALUES (?,?,?,?,?,?)')
    .run('legacy-task:2026-09-23', 'legacy-task', '2026-09-23', '2026-09-23T09:00:00.000Z', 'succeeded', '2026-09-23T09:05:00.000Z')
  legacy.close()
  const legacyStore = new TaskStore(legacyPath)
  const legacyRow = legacyStore.get('legacy-task:2026-09-23')
  check('旧库可读、历史行不丢', legacyRow !== undefined && legacyRow.status === 'succeeded')
  check('旧库同样按（任务 + 刻度）去重', legacyStore.ensureInstance('legacy-task-x', 'legacy-task', '2026-09-23', '2026-09-23T09:00:00.000Z', 'pending') === false)
  legacyStore.close()

  // ── 5. 调度器（决策 31 重设计：懒建行 + 不回看 + 不补跑 + skipped 只进日志）──
  console.log('\n[5] 调度器：懒建行 / 不回看 / 不补跑 / skipped 只进日志')
  const schedDir = mkdtempSync(join(tmpdir(), 'dsh-tdt-sched-'))
  const schedStore = new TaskStore(join(schedDir, 'state.db'))
  const logger = { info() {}, warn() {}, error() {}, debug() {} }

  // 5a. 预条件满足（工作区 / 模型齐全）⇒ 当前刻度恰好派发 1 条 dispatched，绝不预建 pending/skipped
  const okCtx = {
    // 工作区实体须带 attachSession（host.ts HostWorkspace）：派发归组会调它，缺了会判 workspace-attach-failed
    workspaceRegistry: { list: () => [{ title: 'Temp', path: schedDir, attachSession: async () => {} }], attachWorkspace: async () => {}, archiveSession: async () => {} },
    agents: { listModels: async () => [{ provider: 'p', models: ['m'] }], create: async () => ({ id: 'sess-1', agent: { send: () => {} } }) },
    sessionTitle: { rename: () => {} },
    // 模型路由走 ctx.get('agentDefaultModel')（真机日志里的 modelSource=host-default），不是 agents.listModels
    get: (name) => (name === 'agentDefaultModel' ? { currentSelection: () => ({ provider: 'omniroute', model: 'custom.free' }) } : undefined),
  }
  const okCfg = () => ({
    tasksInline: JSON.stringify([
      { id: UUID_A, title: '小时任务', enabled: true, schedule: { cron: '0 * * * *', timezone: 'UTC', window: 'PT2H' }, target: { workspace: 'Temp', prompt: 'x' } },
      // 故意不带 id：运行时只认不修（决策 30 修订）——这条应被 warn 跳过、不产生任何实例
      { enabled: true, schedule: { cron: '0 3 * * *', timezone: 'UTC', window: 'PT2H' }, target: { workspace: 'Temp', prompt: 'y' } },
    ]),
    tasksDir: '', tickMs: 60_000, statePath: '', dispatchGraceMs: 60_000, leaseMs: 60_000, unknownGraceMs: 300_000,
    debugSnapshot: '', defaultProvider: '', defaultModel: '', logRetentionDays: 30,
  })
  const okReconciler = createReconciler({ ctx: okCtx, logger, store: schedStore, options: { leaseMs: 60_000, dispatchGraceMs: 60_000, unknownGraceMs: 300_000, config: okCfg, legacyTask: () => undefined } })
  const okScheduler = createScheduler({ ctx: okCtx, logger, store: schedStore, reconciler: okReconciler, config: okCfg })
  okScheduler.tick() // taskMap 在 tick 内填充 ⇒ getTasks 需在 tick 后取
  const loaded = [...okScheduler.getTasks().values()]
  check('运行时只认 UUID：无 id 条目被跳过，仅剩合法那条', loaded.length === 1 && loaded[0]?.id === UUID_A, loaded.map(t => t.id).join(', '))
  check('title 保留用户写的（不被 id 顶替）', loaded.some(task => task.title === '小时任务'))
  check('当前刻度恰好派发 1 条 dispatched（懒建行）', schedStore.listByStatus(['dispatched']).length === 1, `实际 ${schedStore.listByStatus(['dispatched']).length}`)
  check('不预建 pending', schedStore.listByStatus(['pending']).length === 0)
  check('不补建 skipped（无洪水）', schedStore.listByStatus(['skipped']).length === 0)
  // 让异步拉起（launchAsync）跑完，验证派发确实写了 dispatched_at：
  // 回执校验「产物 mtime > dispatched_at」与 sweep 派发宽限都依赖它；缺失会回退 updated_at ⇒ 每次误判 output-stale
  await new Promise((resolve) => setTimeout(resolve, 0))
  const dispatchedRows = schedStore.listByStatus(['dispatched'])
  check(
    '派发行写了 dispatched_at（缺失会误判 output-stale）',
    dispatchedRows.length === 1 && dispatchedRows[0].dispatched_at !== null && !Number.isNaN(Date.parse(dispatchedRows[0].dispatched_at)),
    JSON.stringify(dispatchedRows.map(r => r.dispatched_at)),
  )
  okScheduler.tick()
  check('重复 tick 不重复派发同一刻度', schedStore.listByStatus(['dispatched']).length === 1, `实际 ${schedStore.listByStatus(['dispatched']).length}`)
  // 决策 41：派发快照随行固化——Loop B 发动 / 裁决只读快照，与任务设置解耦
  const snap0 = JSON.parse(dispatchedRows[0].snapshot ?? 'null')
  check(
    '派发快照已固化（title/prompt/workspacePath/validStatuses/maxAttempts/window）',
    snap0 !== null && snap0.title === '小时任务' && snap0.prompt === 'x' && snap0.workspacePath === schedDir
      && Array.isArray(snap0.validStatuses) && snap0.validStatuses[0] === 'ok' && snap0.maxAttempts === 1 && snap0.window === 'PT2H',
    JSON.stringify(snap0),
  )

  // ── 5c. 决策 41 两层循环解耦 + 决策 42 会话命名 ──
  console.log('\n[5c] 决策 41/42：解耦发动 + 派发快照 + 会话命名')
  // 命名（纯函数）：短时刻本地时区化；attempt>0 追加「第N次」
  const named = new Date('2026-09-28T16:00:00.000Z')
  const p2 = (n) => String(n).padStart(2, '0')
  const expectShort = `${p2(named.getFullYear() % 100)}${p2(named.getMonth() + 1)}${p2(named.getDate())}-${p2(named.getHours())}${p2(named.getMinutes())}`
  check('计划时刻短格式 YYMMDD-HHmm（本地时区）', formatSlotShort('2026-09-28T16:00:00.000Z') === expectShort, formatSlotShort('2026-09-28T16:00:00.000Z'))
  check('会话名 = [TASK] <短时刻> · <标题>', sessionTitleOf('2026-09-28T16:00:00.000Z', '周报生成', 0) === `[TASK] ${expectShort} · 周报生成`)
  check('attempt>0 追加「 · 第N次」', sessionTitleOf('2026-09-28T16:00:00.000Z', '周报生成', 1) === `[TASK] ${expectShort} · 周报生成 · 第2次`)
  const uuidA2 = '12345678-1234-1234-1234-123456789012'
  check('display 名 title → code → 短 id 回退',
    displayNameOf(def({ title: 'T' })) === 'T'
    && displayNameOf(def({ code: 'C-1' })) === 'C-1'
    && displayNameOf(def({ id: uuidA2 })) === '12345678')

  // 解耦发动：任务 disabled 只挡新行，在飞实例照常由 Loop B 发动（发动只读快照）
  const decStore = new TaskStore(join(schedDir, 'state-decouple.db'))
  const decCfg = () => ({
    ...okCfg(),
    tasksInline: JSON.stringify([
      { id: UUID_A, title: '已停用任务', enabled: false, schedule: { cron: '0 * * * *', timezone: 'UTC', window: 'PT2H' }, target: { workspace: 'Temp', prompt: 'x' } },
    ]),
  })
  const decReconciler = createReconciler({ ctx: okCtx, logger, store: decStore, options: { leaseMs: 60_000, dispatchGraceMs: 60_000, unknownGraceMs: 300_000, config: decCfg, legacyTask: () => undefined } })
  const decSnapshot = { title: '已停用任务', prompt: 'x', manual: null, workspacePath: schedDir, provider: '', model: '', validStatuses: ['ok'], maxAttempts: 1, window: 'PT2H' }
  check('带快照落库成功（决策 41）', decStore.ensureInstance(randomUUID(), UUID_A, '2026-09-28', '2026-09-28T08:00:00.000Z', 'dispatched', decSnapshot) === true)
  const decScheduler = createScheduler({ ctx: okCtx, logger, store: decStore, reconciler: decReconciler, config: decCfg })
  decScheduler.tick()
  // 关键：停用任务不能从 getTasks（快照/前置候选来源）被过滤掉——否则它在前置列表里永远不出现。
  check('停用任务仍进入 getTasks（前置候选不被过滤）', decScheduler.getTasks().has(UUID_A), `getTasks=${[...decScheduler.getTasks().keys()].join(',')}`)
  await new Promise((resolve) => setTimeout(resolve, 0))
  const decRows = decStore.listByStatus(['dispatched', 'running', 'failed'])
  check('disabled 任务的在飞实例照常被 Loop B 发动（session_id 已落）', decRows.length === 1 && decRows[0].session_id !== null, JSON.stringify(decRows.map(r => [r.status, r.session_id])))
  check('disabled 不产生新行（仍只有 1 条执行记录）', decStore.dumpTable('task_instances', 500).rows.length === 1, `实际 ${decStore.dumpTable('task_instances', 500).rows.length}`)
  decStore.close()

  // legacy 兼容：无快照旧行经 legacyTask 当场合成快照并照常发动
  const healStore = new TaskStore(join(schedDir, 'state-heal.db'))
  const futureIso = new Date(Date.now() + 3600_000).toISOString()
  healStore.ensureInstance(randomUUID(), 'legacy-task', futureIso.slice(0, 10), futureIso, 'pending') // 5 参 = 无快照
  const legacyDef = { id: 'legacy-task', title: '旧任务', enabled: true, schedule: { cron: '0 * * * *', timezone: 'UTC', window: 'PT2H' }, target: { workspace: 'Temp', prompt: 'legacy', provider: '', model: '' }, contract: { validStatuses: ['ok'] }, retry: { maxAttempts: 1 } }
  const healReconciler = createReconciler({
    ctx: okCtx, logger, store: healStore,
    options: { leaseMs: 60_000, dispatchGraceMs: 60_000, unknownGraceMs: 300_000, config: okCfg, legacyTask: (taskId) => (taskId === 'legacy-task' ? legacyDef : undefined) },
  })
  healReconciler.sweep()
  await new Promise((resolve) => setTimeout(resolve, 0))
  const healRow = healStore.dumpTable('task_instances', 500).rows[0]
  check('旧实例补快照（legacyTask 一次性兼容）并照常发动', healRow.snapshot !== null && healRow.session_id !== null, JSON.stringify({ snapshot: typeof healRow.snapshot, session: healRow.session_id, status: healRow.status }))
  healStore.close()

  // 5b. 预条件失败（工作区找不到）⇒ 不建 task_instances 行，只记 task_log
  const noWsCtx = { workspaceRegistry: { list: () => [], attachWorkspace: async () => {}, archiveSession: async () => {} }, get: () => undefined }
  // 注意：必须带 id（无 id 条目按决策 30 运行时跳过，就走不到预条件分支）
  const noWsCfg = () => ({ ...okCfg(), tasksInline: JSON.stringify([{ id: UUID_A, title: '无工作区', enabled: true, schedule: { cron: '0 * * * *', timezone: 'UTC', window: 'PT2H' }, target: { workspace: 'Nope', prompt: 'x' } }]) })
  const noWsStore = new TaskStore(join(schedDir, 'state-nows.db'))
  const noWsReconciler = createReconciler({ ctx: noWsCtx, logger, store: noWsStore, options: { leaseMs: 60_000, dispatchGraceMs: 60_000, unknownGraceMs: 300_000, config: noWsCfg, legacyTask: () => undefined } })
  const noWsScheduler = createScheduler({ ctx: noWsCtx, logger, store: noWsStore, reconciler: noWsReconciler, config: noWsCfg })
  noWsScheduler.tick()
  check('工作区找不到 ⇒ 不建 task_instances 行', noWsStore.listByStatus(['dispatched', 'pending', 'skipped', 'failed']).length === 0)
  const logs = noWsStore.dumpTable('task_log', 500)
  check('工作区找不到 ⇒ 记 task_log(precondition)', logs.rows.some(l => l.kind === 'precondition'), JSON.stringify(logs.rows.map(l => l.kind)))
  noWsStore.close()
  schedStore.close()
  rmSync(schedDir, { recursive: true, force: true })
  // ── 6. 真机形态旧库兼容：老 id 形态 + 各状态历史行 + 新代码跑一遍 ──
  console.log('\n[6] 真机形态旧库兼容（最怕的「新旧格式冲突」）')
  const realPath = join(root, 'real-legacy.db')
  const seed = new DatabaseSync(realPath)
  // 完全按**旧版** schema 建表（没有 task_defs、没有唯一索引）
  seed.exec(`CREATE TABLE task_instances (
    id TEXT PRIMARY KEY, task_id TEXT NOT NULL, logical_date TEXT NOT NULL, scheduled_at TEXT NOT NULL,
    status TEXT NOT NULL, attempt INTEGER NOT NULL DEFAULT 0, session_id TEXT, lease_until TEXT,
    dispatched_at TEXT, finished_at TEXT, updated_at TEXT NOT NULL)`)
  seed.exec(`CREATE TABLE task_events (
    seq INTEGER PRIMARY KEY AUTOINCREMENT, instance_id TEXT NOT NULL,
    ts TEXT NOT NULL, kind TEXT NOT NULL, detail TEXT)`)
  const insertRow = seed.prepare(`INSERT INTO task_instances
    (id, task_id, logical_date, scheduled_at, status, attempt, session_id, updated_at)
    VALUES (?,?,?,?,?,?,?,?)`)
  // 与真机面板里一致的老 id 形态："<task_id>:<日期>"
  const recent = new Date(Date.now() - 3600_000) // 落在 ensureInstances 窗口内 ⇒ 会被新代码重新算出同一刻度
  const recentIso = recent.toISOString()
  const recentDay = recentIso.slice(0, 10)
  insertRow.run('work-report-once8:2026-09-23', 'work-report-once8', '2026-09-23', '2026-09-23T13:20:00.000Z', 'succeeded', 0, null, '2026-09-23T13:20:30.000Z')
  insertRow.run('work-report-once7:2026-09-23', 'work-report-once7', '2026-09-23', '2026-09-23T13:20:00.000Z', 'succeeded', 0, null, '2026-09-23T13:20:30.000Z')
  insertRow.run('work-report-once6:2026-09-23', 'work-report-once6', '2026-09-23', '2026-09-23T13:20:00.000Z', 'unknown', 0, '06e4633c-5ddb', '2026-09-23T13:25:00.000Z')
  insertRow.run('work-report-once5:2026-09-23', 'work-report-once5', '2026-09-23', '2026-09-23T13:20:00.000Z', 'failed', 0, 'ad1c5743-692a', '2026-09-23T13:28:00.000Z')
  insertRow.run('work-report-once2:2026-09-23', 'work-report-once2', '2026-09-23', '2026-09-23T07:30:00.000Z', 'skipped', 0, null, '2026-09-23T07:30:00.000Z')
  // 关键一行：任务仍存在、刻度落在窗口内、状态 pending ⇒ 新代码必须复用它而不是再建一条
  insertRow.run(`daily-report:${recentDay}`, 'daily-report', recentDay, recentIso, 'pending', 0, null, recentIso)
  // 一个 dispatched 老行 ⇒ 启动扫描应置 unknown（不该炸）
  insertRow.run('daily-report:2026-09-22', 'daily-report', '2026-09-22', '2026-09-22T21:00:00.000Z', 'dispatched', 0, 'legacy-session', '2026-09-22T21:00:05.000Z')
  seed.close()

  const realStore = new TaskStore(realPath)
  check('旧库打开不抛错（自动迁移成功）', true)
  check('旧库没有重复行被合并（正常应为 0）', realStore.dupRowsRemoved === 0, `实际 ${realStore.dupRowsRemoved}`)
  check('历史行一条不少', realStore.listByStatus(['succeeded', 'failed', 'skipped', 'pending', 'unknown', 'dispatched']).length === 7)
  const scanned = realStore.startupScan()
  check('启动扫描把旧 dispatched 置 unknown', scanned === 1, `实际 ${scanned}`)

  // 用**同一批任务**（显式写 id，与历史一致）跑一次 tick：不应炸、不应重复建行
  const realCtx = { workspaceRegistry: { list: () => [], archiveSession: async () => {} }, get: () => undefined }
  const realReconciler = createReconciler({
    ctx: realCtx,
    logger,
    store: realStore,
    options: {
      leaseMs: 60_000, dispatchGraceMs: 60_000, unknownGraceMs: 300_000,
      config: () => ({ tasksInline: '', tasksDir: '', tickMs: 60_000, statePath: '', dispatchGraceMs: 60_000, leaseMs: 60_000, unknownGraceMs: 300_000, debugSnapshot: '', defaultProvider: '', defaultModel: '' }),
      legacyTask: () => undefined, // 旧行无快照 ⇒ 如实按失败收敛（不静默猜）
    },
  })
  const realScheduler = createScheduler({
    ctx: realCtx,
    logger,
    store: realStore,
    reconciler: realReconciler,
    config: () => ({
      tasksInline: JSON.stringify([
        { id: 'daily-report', enabled: true, schedule: { cron: '0 * * * *', timezone: 'UTC', window: 'PT2H' }, target: { workspace: 'Temp', prompt: 'x' } },
      ]),
      tasksDir: 'tasks', tickMs: 60_000, statePath: '', dispatchGraceMs: 60_000,
      leaseMs: 60_000, unknownGraceMs: 300_000, debugSnapshot: '', defaultProvider: '', defaultModel: '',
    }),
  })
  let tickError = null
  try {
    realScheduler.tick()
  } catch (error) {
    tickError = String(error)
  }
  check('旧库上跑 tick 不抛错', tickError === null, tickError ?? '')
  const dailyRows = realStore.listByStatus(['pending', 'dispatched', 'running', 'succeeded', 'failed', 'skipped', 'unknown'])
    .filter(row => row.task_id === 'daily-report')
  const sameSlot = dailyRows.filter(row => row.scheduled_at === recentIso)
  check('同一刻度没有被建出第二条（新旧格式不打架）', sameSlot.length === 1, `实际 ${sameSlot.length}`)
  check('老 id 形态的历史行原样保留', realStore.get('work-report-once8:2026-09-23')?.status === 'succeeded')
  realStore.close()

  // ── 7. 最坏情况：旧库真有「同任务同刻度」重复行 —— 必须优雅降级而不是崩 ──
  console.log('\n[7] 最坏情况：旧库存在重复刻度')
  const dupPath = join(root, 'dup-legacy.db')
  const dupSeed = new DatabaseSync(dupPath)
  dupSeed.exec(`CREATE TABLE task_instances (
    id TEXT PRIMARY KEY, task_id TEXT NOT NULL, logical_date TEXT NOT NULL, scheduled_at TEXT NOT NULL,
    status TEXT NOT NULL, attempt INTEGER NOT NULL DEFAULT 0, session_id TEXT, lease_until TEXT,
    dispatched_at TEXT, finished_at TEXT, updated_at TEXT NOT NULL)`)
  const dupInsert = dupSeed.prepare(`INSERT INTO task_instances
    (id, task_id, logical_date, scheduled_at, status, updated_at) VALUES (?,?,?,?,?,?)`)
  dupInsert.run('dup-task:2026-09-23', 'dup-task', '2026-09-23', '2026-09-23T09:00:00.000Z', 'succeeded', '2026-09-23T09:05:00.000Z')
  dupInsert.run('dup-task:2026-09-23-b', 'dup-task', '2026-09-23', '2026-09-23T09:00:00.000Z', 'failed', '2026-09-23T09:06:00.000Z')
  dupSeed.close()
  let dupError = null
  let dupStore
  try {
    dupStore = new TaskStore(dupPath)
  } catch (error) {
    dupError = String(error)
  }
  check('重复刻度不会让插件起不来', dupError === null, dupError ?? '')
  check('合并行数被如实报告（供宿主告警，不静默删）', dupStore?.dupRowsRemoved === 1, `实际 ${dupStore?.dupRowsRemoved}`)
  const left = dupStore?.listByStatus(['succeeded', 'failed']) ?? []
  check('重复组只留一条', left.length === 1, `实际 ${left.length}`)
  check('去重后仍可按刻度定位', dupStore?.findBySlot('dup-task', '2026-09-23T09:00:00.000Z') !== undefined)
  dupStore?.close()

  // ── 8. client 产物检查（决策 28：面板内只读会话弹窗必须真的进了 bundle）──
  // tsdown 产物未混淆（标识符原样保留），可直接按符号名断言。
  console.log('\n[8] client 产物检查（dist/client.js + package.json inject 清单）')
  const dispatchPath = join(import.meta.dirname, '..', 'dist', 'dispatch.js')
const reconcilePath = join(import.meta.dirname, '..', 'dist', 'reconcile.js')
const clientPath = join(import.meta.dirname, '..', 'dist', 'client.js')
  const clientJs = readFileSync(clientPath, 'utf8')
  const dispatchJs = readFileSync(dispatchPath, 'utf8')
  const reconcileJs = readFileSync(reconcilePath, 'utf8')
  const schedulerJs = readFileSync(join(import.meta.dirname, '..', 'dist', 'scheduler.js'), 'utf8')
  check('SessionViewModal 组件已打进 bundle', clientJs.includes('SessionViewModal'))
  check('openSessionView 数据闸门已打进 bundle', clientJs.includes('openSessionView'))
  check('loadOlder 探测调用已打进 bundle', clientJs.includes('loadOlder'))
  // 编辑器 UX 第二轮（2026-09-30）：版本开关分段同款 / 条目卡片+hover 小钮 / 启用 Toast / 校验红框 / 快照 UI 已删
  check('版本开关走分段同款（histtoggle 轨道+亮片）', clientJs.includes('dsh-tdt-ed-histtoggle') && clientJs.includes('dsh-tdt-ed-histtoggle-seg'))
  check('版本条目卡片式 + 使用/移除小钮', clientJs.includes('dsh-tdt-ed-ver-use') && clientJs.includes('dsh-tdt-ed-ver-del') && clientJs.includes('MarqueeText'))
  check('启用开关写回 Toast（--below 变体）', clientJs.includes('dsh-tdt-toast--below'))
  check('任务名称/下拉校验红框类', clientJs.includes('dsh-tdt-ed-pfx--error') && clientJs.includes('dsh-tdt-ed-field--error'))
  check('配置快照 UI 已整体移除（无 Snapshots 区块文案）', !clientJs.includes('editorSnapshotsHint') && !clientJs.includes('editorNoSnapshots'))
  check('启用实时写回走独立端点 tasks/enabled', dispatchJs.includes('tasks/enabled') || clientJs.includes('tasks/enabled'))
  // UX 第二轮·第三次返工（2026-09-30）：Toast 抽象共用（三色）+ 派发 ctx 读护栏
  check('浮层 Toast 共用组件 + 四档语义色（success/warning/neutral/error）',
    clientJs.includes('FloatingToast') && clientJs.includes('dsh-tdt-toast--success') && clientJs.includes('dsh-tdt-toast--warning') && clientJs.includes('dsh-tdt-toast--neutral'))
  check('派发 ctx 属性读取带防抛错护栏（readCtxProp，agentTeams/goals 未注入不再炸派发）', dispatchJs.includes('readCtxProp'))
  // 完全权限保存确认（2026-09-30）：勾选后确认钮才可点；确认钮沿用「保存」不改名
  check('完全权限保存确认弹窗（勾选门槛 + 确认钮沿用保存）',
    clientJs.includes('editorFullPermTitle') && clientJs.includes('editorFullPermCheck') && clientJs.includes("full") && clientJs.includes('confirmLabel'))
  // 保存成功反馈（2026-09-30）：成功弹绿色「任务已保存」；版本找回不关全屏编辑器
  check('保存成功 Toast（editorTaskSaved）打进 bundle', clientJs.includes('editorTaskSaved'))
  check('chat target 组装已打进 bundle（target("chat")）', clientJs.includes('target("chat")') || clientJs.includes("target('chat')") || /target\(["']chat["']\)/.test(clientJs))
  // 官方外观复用（方案 ①）：运行时从宿主注入的 style 标签解析官方真实 CSS-module 类名。
  // 纯解析函数 parseOfficialCss 无 DOM 依赖（可对夹具断言）；冒烟这里只验产物里确实带上了。
  check('官方类名解析器已打进 bundle（parseOfficialCss）', clientJs.includes('parseOfficialCss'))
  check('官方类名发现已打进 bundle（discoverOfficialClasses）', clientJs.includes('discoverOfficialClasses'))
  check('官方 chat 包 CSS 前缀已打进 bundle', clientJs.includes('@deepseek-ai/dsh-client-ui-chat/'))
  // 回归：官方哈希可能以 `_` 开头（如 `._5OnbHa_root`），必须按**末位**下划线切分，
  // 按首位切分会把整类跳过、导致 GenericCommandCard 这类模块解析成空表（真机踩过）。
  check('官方类名前缀按末位下划线切分（兼容 _5OnbHa 这类哈希）',
    clientJs.includes('lastIndexOf("_")') || clientJs.includes("lastIndexOf('_')"))
  check('弹窗套用官方 ChatView 结构语义名（frame/root/scroll/column/flowItem）',
    ['frame', 'root', 'scroll', 'column', 'flowItem'].every(k => clientJs.includes(`'${k}'`) || clientJs.includes(`"${k}"`)))
  check('官方类缺失时回退自绘类（dsh-tdt-sv-body/col/flowitem 仍在）',
    clientJs.includes('dsh-tdt-sv-body') && clientJs.includes('dsh-tdt-sv-col') && clientJs.includes('dsh-tdt-sv-flowitem'))
  // 主界面任务列表重建（2026-09-30，design/main-panel-design.md）
  check('任务列表视图已打进 bundle（TaskListView + useTaskOverview）',
    clientJs.includes('TaskListView') && clientJs.includes('useTaskOverview'))
  check('卡片数据走聚合端点 tasks/overview（不逐任务查库）', clientJs.includes('tasks/overview'))
  check('轮询带 rev 比对（unchanged 即不重渲染、不重排）', clientJs.includes('unchanged') && clientJs.includes('rev='))
  check('内容列限宽居中（min 760 / max 1120）', clientJs.includes('760px') && clientJs.includes('1120px'))
  check('排序位移走 FLIP 动画 + 尊重减弱动效', clientJs.includes('translateY(') && clientJs.includes('prefers-reduced-motion'))
  check('运行中状态条脉动（纯 CSS keyframes，零请求）', clientJs.includes('dsh-tdt-rail-pulse'))
  check('「异常」筛选（上次执行失败计数，0 不显示）', clientJs.includes('listFilterAbnormal'))
  check('拨片乐观更新（点了即变，不等轮询）', clientJs.includes('optimistic'))
  check('刷新请求不被在途那轮吞掉（pendingRef 补跑）', clientJs.includes('pendingRef'))
  // 2026-09-30 真机返工：合并成一条太丑 ⇒ 恢复**两个独立小标签**；悬浮提示挂在真 DOM 上
  // （裸函数组件 ref 挂不上 ⇒ 官方 Tooltip 静默失效，正是用户「移上去没提示」的根因）。
  check('上次 / 下次恢复成两个独立小标签（PastPill + NextPill，不再合并）',
    clientJs.includes('function PastPill') && clientJs.includes('function NextPill') && !clientJs.includes('RunPills'))
  check('悬浮提示挂在真 DOM 上（Tooltip 子元素是真 <div>，不再是裸 LiveText）',
    /side: "bottom"\s*\},\s*\(0, react\.createElement\)\("div", \{ style: pillOuterStyle \}/.test(clientJs))
  // 排期人话**单源**（用户 2026-09-30 拍板：列表与编辑器不许各写一份，否则同一排期两处文案不一样）：
  // 两处都走 client/schedule-text.ts，旧的 cronToHuman 已删。
  check('排期文案单源（scheduleSpecFromSchedule + scheduleSpecFromDraft，旧 cronToHuman 已删）',
    clientJs.includes('scheduleSpecFromSchedule') && clientJs.includes('scheduleSpecFromDraft') && !clientJs.includes('cronToHuman'))
  check('排期文案支持样式参数（scheduleSegments 片段 + emphasis 标记）',
    clientJs.includes('scheduleSegments') && clientJs.includes('emphasis'))
  check('排期反解读结构化 ui（老任务才退回 cron）', clientJs.includes('ui.weekdays'))
  // 列表启用开关与编辑器同款（官方默认选中色是 brand-primary ⇒ 亮色近黑 / 暗色近白，两处看着不一样）。
  check('列表启用开关与编辑器同款（switchwrap + success 绿）', clientJs.includes('dsh-tdt-tl-switchwrap'))
  // 右上角刷新按钮已撤（用户 2026-09-30：反正改完立刻刷新，按钮没用）。
  check('右上角刷新按钮已移除（不再有 debugRefresh 按钮）', !clientJs.includes('title: t("debugRefresh")'))
  // 保存后乐观补行 ⇒ 改完**立刻**可见，不等服务端那 ~1 秒的落盘 + 重拉。
  check('保存后乐观补行（patchRow + rowPatchOf）',
    clientJs.includes('patchRow') && clientJs.includes('rowPatchOf'))
  check('倒计时等宽数字（tabular-nums ⇒ 不左右蹦）', clientJs.includes('tabular-nums'))
  check('无下次执行显示 --:-- 占位（图标保留）', clientJs.includes('--:--'))
  check('展开区四区块（执行设置 / 附加文件 / 前置任务 / 提示词）',
    clientJs.includes('listSectionSchedule') && clientJs.includes('listSectionAttachments')
    && clientJs.includes('listSectionDepends') && clientJs.includes('listSectionPrompt'))
  // 回归（2026-09-27）：ChatNodeSeat 必须把 groupPart 传给节点视图——漏传会把整步全画出来，
  // 步内 tool-call 块再画一张 = 与独立工具节点重复（真机「编辑/写入×2」）。
  check('seat 向节点视图下发 groupPart（reasoning/response 分流）',
    clientJs.includes('renderNode(node, turnProcess, groupPart)'))
  // 官方块渲染器 case "tool-call": break——步内工具块永不渲染成卡片。
  check('assistant 块渲染跳过 tool-call（官方 case break 同构）',
    /case ['"]tool-call['"]:\s*break/.test(clientJs))
  // 官方 ui-tool ToolRow 对齐（2026-09-28）：read→ReadBlock(8 行中间截断)、bash→TerminalBlock(∞)、
  // 其余→ioCard 灰框；官方类发现扩展到 ui-tool 包前缀。
  // 产物里正则字面量的斜杠是 \/ 转义形式，envelope 只查 '<type>file' 前缀。
  check('工具卡接官方 ReadBlock（maxLines 8 + read envelope 校验）',
    clientJs.includes('ReadBlock') && /maxLines:\s*8\b/.test(clientJs) && clientJs.includes('<type>file'))
  check('工具卡接官方 TerminalBlock（maxLines ∞ + 退出码/信号标记解析）',
    clientJs.includes('TerminalBlock') && /maxLines:\s*Infinity/.test(clientJs)
    && clientJs.includes('killed by signal') && clientJs.includes('[exit code: '))
  check('其余工具展开体 = 官方 ioCard 灰框（输入/分隔/输出 + data-error）',
    clientJs.includes('ioCard') && clientJs.includes('ioSection') && clientJs.includes('ioDivider') && clientJs.includes('ioText'))
  check('官方 ToolRow 类发现已扩展 ui-tool 包前缀',
    clientJs.includes('@deepseek-ai/dsh-client-ui-tool/'))
  check('官方 ReadBlock/TerminalBlock 文案词典已打进 bundle',
    clientJs.includes('显示 {shown} / {total} 行') && clientJs.includes('展开其余 {n} 行输出') && clientJs.includes('未正常退出'))
  check('工具行五态 data-state（preparing/running/ok/error/stopped）+ data-tool/data-variant',
    ['preparing', 'running', 'stopped'].every(k => clientJs.includes(`'${k}'`) || clientJs.includes(`"${k}"`))
    && clientJs.includes('"data-tool"') && clientJs.includes('"data-variant"') && clientJs.includes('"data-state"'))
  check('思考行标题用官方 message.think（「思考」，非「思考过程」）',
    clientJs.includes('thinkLabel') && !clientJs.includes('sessionReasoning'))
  // 官方 primitives 是 dsh 浏览器内核的平台模块：产物里必须保留成 require（不能内联），
  // 正文走官方 MarkdownText、工具行走官方 DisclosureRow。
  check('正文/工具行用官方 primitives（MarkdownText / DisclosureRow，保留为 require）',
    clientJs.includes('@deepseek-ai/dsh-client-ui-primitives'))
  // 官方 Chat 的 labels **必带** code.toolbarLabels（primitives lib/index.js:10679-10710）：
  // 缺它 ⇒ 官方 CodeBlock 分叉进老式 banner（右 = **文字**「复制」钮、无换行钮、左 = fence 语言），
  // 与我们弹窗里该有的官方代码块卡片（CodeToolbar = 语言/「代码块」+ 换行·复制图标钮）不一致。
  check('代码块走官方卡片工具条（MarkdownText labels 带 code.toolbarLabels）',
    /code:\s*\{[^}]*toolbarLabels:/.test(clientJs)
      && clientJs.includes('自动换行') && clientJs.includes('取消换行'))
  const pkg = JSON.parse(readFileSync(join(import.meta.dirname, '..', 'package.json'), 'utf8'))
  const injectList = pkg.dsh?.client?.inject ?? []
  check('inject 清单声明 sessions 提供方（dsh-api-session-controller）',
    injectList.includes('@deepseek-ai/dsh-api-session-controller'), injectList.join(', '))
  check('inject 清单声明 uiConversation 提供方（dsh-client-ui-conversation）',
    injectList.includes('@deepseek-ai/dsh-client-ui-conversation'), injectList.join(', '))
  check('inject 清单声明 layout 提供方（dsh-client-ui-layout，main/layout 服务）',
    injectList.includes('@deepseek-ai/dsh-client-ui-layout'), injectList.join(', '))
  check('inject 清单声明 sidebar 提供方（dsh-client-ui-sidebar，sidebar.panellist 槽）',
    injectList.includes('@deepseek-ai/dsh-client-ui-sidebar'), injectList.join(', '))
  check('inject 清单声明 uiWorkspace 提供方（dsh-client-ui-workspace，U10 开分支跳转）',
    injectList.includes('@deepseek-ai/dsh-client-ui-workspace'), injectList.join(', '))
  // U10「继续对话（开分支）」：官方 ISessions.fork 调用面 + 确认框（先确认再 fork，防误点）。
  check('bundle 含 sessions.fork 调用面（increaseTitle: true，官方 fork 按钮同款）',
    clientJs.includes('increaseTitle'))
  check('bundle 含开分支确认框（forkConfirmText，必须先确认再 fork）',
    clientJs.includes('forkConfirmText'))
  check('确认框挂官方 Modal 组件（dsh-tdt-sv-forkmodal，弃自绘弹窗）',
    clientJs.includes('dsh-tdt-sv-forkmodal'))
  check('消息行分支带 atSeq（从该条消息截断开分支）',
    clientJs.includes('atSeq'))
  // 重试/轮次失败/限长三件套（官方 MessageItem 逐字照抄，2026-09-27 用户反馈对齐官方样式）：
  // 折叠摘要「已重试模型请求 (n/m) · Ns」+ 展开重试延迟/失败原因；轮次失败 = 红点+红标题+灰原因+右侧机器码。
  check('重试行挂官方 retryRow 类（MessageItem.retryRow，缺失回退自绘）',
    clientJs.includes('retryRow') && clientJs.includes('dsh-tdt-sv-retry'))
  check('重试摘要走官方 retryStatus 模板（retryStatus 文案键在 bundle）',
    clientJs.includes('retryStatus') && clientJs.includes('retryStarted') && clientJs.includes('retryCancelled'))
  check('重试展开含重试延迟/失败原因（retryDelay / retryFailure 文案键）',
    clientJs.includes('retryDelay') && clientJs.includes('retryFailure'))
  check('轮次失败行走官方 turnErrorRow 组（StateDot + 标题/原因分离 + 机器码标签）',
    clientJs.includes('turnErrorRow') && clientJs.includes('turnErrorCode') && clientJs.includes('turnErrorTitle'))
  check('限长行走官方 maxTokensTitle（黄点警示，非红）',
    clientJs.includes('maxTokensTitle') && clientJs.includes('maxTokensHint'))
  check('旧自绘 notice-err / 旧文案键已删除（sessionTurnError 不再进 bundle）',
    !clientJs.includes('dsh-tdt-sv-notice-err') && !clientJs.includes('sessionTurnError'))
  // U11 产出物预览（决策 39）：分栏推压 + 统一 openFile 单一入口 + 官方错误码 + workspaceFiles 注入。
  check('预览分栏组件已打进 bundle（FilePreviewPanel）', clientJs.includes('FilePreviewPanel'))
  // 决策 39 的形态仍是「分栏推压」，但预览面已上提到页面级 dock（第三轮）：弹窗内不再有分栏。
  check('分栏推压（页面级 dock）已打进 bundle（preview + 让位变量 + 根容器 flex 分栏）',
    clientJs.includes('dsh-tdt-sv-preview') && clientJs.includes('--dsh-tdt-preview-w') && clientJs.includes("display:flex"))
  // 第四轮：dock 占布局（不再遮盖滚动条）+ 远端错误信封 + 文本渲染对齐官方 CodeBody。
  check('dock 是布局分栏不是浮层（sticky + 占宽，滚动条不被压住）',
    clientJs.includes('dsh-tdt-sv-preview-dock') && clientJs.includes('position:sticky'))
  check('远端 {ok:false,error} 信封被识别（失败走官方错误码文案，不再当成空内容）',
    clientJs.includes('unwrapEnvelope') && clientJs.includes('ok === false'))
  check('文本渲染照官方 CodeBody（CodeBlock + lineNumbers + languageForPath）',
    clientJs.includes('languageForPath') && clientJs.includes('lineNumbers'))
  check('md 两态：渲染视图 ⇄ 源码（官方分段控件放在顶栏按钮组，不飘进内容区）',
    clientJs.includes('previewSource') && clientJs.includes('previewRender')
      && clientJs.includes('dsh-tdt-sv-seg') && !clientJs.includes('dsh-tdt-sv-preview-mdbar')
      && !clientJs.includes('dsh-tdt-sv-preview-mdwrap'))
  check('顶栏按钮组（复制 / 刷新 / 关闭，图标钮无中文）',
    clientJs.includes('dsh-tdt-sv-head-btn') && clientJs.includes('previewRefresh')
      && clientJs.includes('previewCopyPath') && clientJs.includes('IconRefreshOutlineRegular'))
  check('拖拽条高亮 = 6px 浅色半透明带（与任务抽屉 .dsh-tdt-ed-resizer 同款，2026-09-29 改版；不再变纯白线）',
    clientJs.includes('dsh-tdt-sv-resizer')
      && clientJs.includes('dsh-tdt-sv-resizer:hover{background:var(--dsw-alias-interactive-bg-hover')
      && clientJs.includes('dsh-tdt-sv-resizer:active{background:var(--dsw-alias-interactive-bg-hover')
      && !clientJs.includes('.dsh-tdt-sv-preview-dock:has(')
      && !clientJs.includes('border-left-color:rgba(255,255,255,1)'))
  check('统一 openFile 单一入口（工具卡 onOpenFile 与 md 行内 fileMentions 共用）',
    clientJs.includes('onOpenFile') && clientJs.includes('fileMentions'))
  check('文件词表来自 keyed 工具流（collectFilePaths / makeFileMentions，禁模拟）',
    clientJs.includes('collectFilePaths') && clientJs.includes('makeFileMentions'))
  check('预览走 remote.workspaceFiles 真实取数（read + readBytes 消费面）',
    clientJs.includes('workspaceFiles') && clientJs.includes('readBytes'))
  check('官方错误码分支齐全（not-found / too-large / not-text / not-regular-file）',
    clientJs.includes('lookup-not-found') && clientJs.includes('too-large') && clientJs.includes('not-text') && clientJs.includes('not-regular-file'))
  check('文本翻页按官方契约（previewLoadMore + eof 判定）',
    clientJs.includes('previewLoadMore') && clientJs.includes('eof'))
  check('图片/PDF 走 readBytes → objectURL（卸载 revoke）',
    clientJs.includes('createObjectURL') && clientJs.includes('revokeObjectURL'))
  check('md 预览用官方 MarkdownText、代码用官方 CodeBlock（非自研渲染器）',
    clientJs.includes('dsh-tdt-sv-preview-md') && clientJs.includes('CodeBlock'))
  check('inject 清单声明 workspace-files 提供方（dsh-api-workspace-files）',
    injectList.includes('@deepseek-ai/dsh-api-workspace-files'), injectList.join(', '))
  // U11 第二轮（交付文件官方化）：present 行 + 交付文件卡网格 + 词表收录 present 路径。
  check('present 工具走官方 PresentRow 镜像（data-tool=present + IconDeliverDocRegular，不经通用工具卡）',
    clientJs.includes('IconDeliverDocRegular') && /data-tool"?\s*[:=]\s*"?present/.test(clientJs))
  check('交付文件卡网格已打进 bundle（DeliverablesGridMirror + FileTypeIcon，整卡可点 openFile）',
    clientJs.includes('DeliverablesGridMirror') && clientJs.includes('FileTypeIcon') && clientJs.includes('data-presented-file'))
  check('交付文件卡折叠上限照官方（>4 折叠 + 全部 N 个文件）',
    clientJs.includes('deliverAll') && clientJs.includes('deliverExpandAria'))
  check('交付词典齐备（row.* 五态 + presented 简介/收起）',
    clientJs.includes('deliverRowOk') && clientJs.includes('deliverRowError') && clientJs.includes('deliverRowStopped')
      && clientJs.includes('deliverPreviewHint') && clientJs.includes('deliverCollapseAria'))
  check('交付数据读会话 turn 级 deliverables.presented（turn.data 是 Map，须用 .get 而非对象式访问；同源覆盖 present 工具与插件代写）',
    clientJs.includes('turnDeliverablesPresented') && clientJs.includes('instanceof Map') && clientJs.includes("get('deliverables')"))
  check('弹窗交付卡挂最后一轮 turn-tail（官方 DeliverablesTail 同位），数据以实例 outputs 权威（合并快照去重）',
    clientJs.includes('lastTailTurn') && clientJs.includes('deliverFiles') && !clientJs.includes('dsh-tdt-sv-deliver-section'))
  check('回执提示词含 outputs 粒度判断规则（本任务专用文件夹→报目录；既有/规范目录→逐个报文件）',
    readFileSync(join(import.meta.dirname, '..', 'dist', 'receipt.js'), 'utf8').includes('为本任务专门建')
      && readFileSync(join(import.meta.dirname, '..', 'dist', 'receipt.js'), 'utf8').includes('按规范建的目录'))
  check('官方类发现扩 ui-deliverables 前缀（PresentRow / Deliverables 模块可命中）',
    clientJs.includes('@deepseek-ai/dsh-client-ui-deliverables/'))
  check('交付文件兜底样式入库（deliv-file / deliv-grid / deliv-toggle）',
    clientJs.includes('dsh-tdt-sv-deliv-file') && clientJs.includes('dsh-tdt-sv-deliv-grid') && clientJs.includes('dsh-tdt-sv-deliv-toggle'))
  check('workspaceFiles 未就位有诊断日志（真机排障锚点）',
    clientJs.includes('remote.workspaceFiles 未就位'))
  check('注入键含 dotted remote.workspaceFiles（等命名空间挂载，真机「链接不可点」根因修复）',
    /inject\(\[.{0,20}remote\.workspaceFiles/.test(clientJs))
  // U11 第三轮（页面级预览 dock）：一份预览面，弹窗与整页共用 + 拖拽调宽 + 崩溃不黑屏 + 记录行产出链接。
  check('预览面唯一且页面级（dock 形态 + 整页让位变量 --dsh-tdt-preview-w）',
    clientJs.includes('dsh-tdt-sv-preview-dock') && clientJs.includes('--dsh-tdt-preview-w'))
  check('弹窗让位预览（overlay right 走同一变量，弹窗不遮盖预览面）',
    clientJs.includes('right:var(--dsh-tdt-preview-w,0px)'))
  check('预览栏可拖拽调宽（resizer + pointermove/up + 宽度持久化与夹取）',
    clientJs.includes('dsh-tdt-sv-resizer') && clientJs.includes('pointermove') && clientJs.includes('clampPreviewWidth'))
  check('预览渲染崩溃拦在预览体内（PreviewBoundary 错误边界，不再黑屏整页）',
    clientJs.includes('PreviewBoundary') && clientJs.includes('componentDidCatch'))
  check('远端返回防御解析（text/data 不符契约走错误态，不把 undefined 喂渲染器）',
    clientJs.includes('textPageOf') && clientJs.includes('bytesOf') && clientJs.includes('previewBadPayload'))
  check('执行记录行产出物可点（outputs 列 → 同一 openFile 入口）',
    clientJs.includes('parseOutputs') && clientJs.includes('basenameOf') && clientJs.includes('colOutputs'))
  check('弹窗内链接走上提后的唯一入口（onOpenFile 透传，弹窗不再自带分栏）',
    clientJs.includes('onOpenFile') && !clientJs.includes('dsh-tdt-sv-chatpane'))
  // 前置任务卡（2026-09-29 用户拍板的交互）：灰框卡 + ?说明 + 工作区→任务两级选择 + 添加/移除 + 判定说明。
  check('前置任务卡灰框与两级选择行已打进 bundle（dsh-tdt-ed-card + dsh-tdt-ed-deppick + 双层跑马灯 dsh-tdt-mq/-in）',
    clientJs.includes('dsh-tdt-ed-card') && clientJs.includes('dsh-tdt-ed-deppick')
      && clientJs.includes('dsh-tdt-ed-depitem') && clientJs.includes('dsh-tdt-mq') && clientJs.includes('dsh-tdt-mq-in'))
  check('停用（锁住）任务可选且显式标「（已停用）」——前置任务下拉不做启停过滤',
    clientJs.includes('editorDepDisabledTag') && clientJs.includes('（已停用）')
      && /enabled\s*===\s*false/.test(clientJs))
  check('高级区：重试四档 Segmented + /goal 开关（默认开）+ 配置预览按钮直呼「配置预览」已打进 bundle，成功状态清单 UI 已移除',
    clientJs.includes('editorRetryFive') && clientJs.includes('editorGoal') && /t\(["']editorPreview["']\)/.test(clientJs)
      && clientJs.includes('lang: "json"') && !clientJs.includes('editorValidStatuses'))
  check('高级区第二轮：灰条收折头（无内层黑框）+「?」说明 + 官方 chevron 展开图标 + 虚线分隔两拍排版',
    clientJs.includes('dsh-tdt-ed-advhead') && clientJs.includes('editorAdvancedHelp')
      && clientJs.includes('dsh-tdt-ed-advchevron-open') && clientJs.includes('dsh-tdt-ed-advitem')
      && !clientJs.includes('dsh-tdt-ed-summary'))
  check('全屏面板（提示词编辑 / 配置预览）滚动位置保持：打开前存 scrollTop、关闭重挂后恢复',
    clientJs.includes('savedScrollRef') && clientJs.includes('savedScrollRef.current = bodyRef.current?.scrollTop ?? 0'))
  check('文案：高级区为「重试次数」（非「重置次数」），说明只讲失败后重试几次；配置预览说明为「查看本任务的配置原文件」',
    clientJs.includes('重试次数') && !clientJs.includes('重置次数')
      && clientJs.includes('任务执行失败后，自动重试的次数。') && clientJs.includes('查看本任务的配置原文件'))
  check('模型下拉默认文案为「默认模型」（不再出现「跟随宿主默认」）',
    clientJs.includes('默认模型') && !clientJs.includes('跟随宿主默认'))
  check('Agent 权限选择器（决策 50）：工作区右侧四档（权限：默认 / 仅可查看 / 工作区内修改 / 完全权限），默认「权限：默认」',
    clientJs.includes('editorPermFull') && clientJs.includes('权限：默认')
      && clientJs.includes('仅可查看')
      && clientJs.includes('工作区内修改') && clientJs.includes('完全权限') && /permission: ["']default["']/.test(clientJs))
  check('工作区下拉封顶 + 跑马灯（不压文件夹图标）：SelectField 支持 maxWidth/marquee，工作区传 200px',
    clientJs.includes('marquee: true') && /maxWidth:\s*200/.test(clientJs) && clientJs.includes('dsh-tdt-mq-in'))
  check('前置任务「添加」按钮收窄到 72px（把宽度让给任务名）', /flex: ["']0 0 72px["']/.test(clientJs))
  check('多 Agent 协作开关（决策 49）：默认关 + 说明含「Agent Teams」与降级语义，配置预览 JSON 带 target.agentTeam',
    clientJs.includes('editorAgentTeam') && clientJs.includes('agentTeam: false')
      && clientJs.includes('Agent Teams') && clientJs.includes('agentTeam: draft.agentTeam'))
  check('派发侧 /goal 接线：快照 goal 开关（缺省开）+ ctx.goals 创建持久目标（失败不阻塞），快照构建读定义 target.goal',
    dispatchJs.includes('goal-unavailable') && dispatchJs.includes('goal-create-failed')
      && dispatchJs.includes('goal: snapshot.goal !== false') && dispatchJs.includes('.goals')
      && dispatchJs.includes('objective')
      && reconcileJs.includes('goal: task.target.goal !== false'))
  check('多 Agent 协作派发（决策 49）：ctx.agentTeams 探测缺则降级（agent-team-unavailable）+ 团队指令段 + 快照固化 target.agentTeam',
    dispatchJs.includes('agent-team-unavailable') && dispatchJs.includes('spawn_teammate')
      && dispatchJs.includes('team_task_create') && schedulerJs.includes('agentTeam: task.target.agentTeam === true')
      && dispatchJs.includes('teamMode'))
  check('前置任务「?」说明含判定方式与产出移交（上一次执行必须成功 / 跳过不算失败 / 移交产出文件）',
    clientJs.includes('添加前置任务') && clientJs.includes('上一次执行必须是成功')
      && clientJs.includes('都算前置任务成功') && clientJs.includes('移交给本次任务'))
  check('先选工作区占位与空态虚线框文案已打进 bundle（行内「前置任务：」前缀已按用户要求删除）',
    clientJs.includes('请先选择工作区')
      && clientJs.includes('尚未配置前置任务') && clientJs.includes('在下方选择工作区与任务后点')
      && !clientJs.includes('前置任务：'))
  check('语义下拉已删除（不再出现「同一天的 / 最近一次成功的」选项文案）',
    !clientJs.includes('同一天的') && !clientJs.includes('最近一次成功的'))
  check('新增依赖固定 latest_success（语义写死在添加动作里）',
    /semantics:\s*['"]latest_success['"]/.test(clientJs))
} finally {
  rmSync(root, { recursive: true, force: true })
}

// ── 9. 依赖判定（决策 33：上游最近一条必须 succeeded）──
console.log('\n[9] 依赖判定：上游最近一条必须 succeeded')
{
  const depDir = mkdtempSync(join(tmpdir(), 'dsh-tdt-dep-'))
  const depStore = new TaskStore(join(depDir, 'state.db'))
  // 上游 A：10:00 成功（旧），11:00 失败（最近一条）⇒ 必须阻塞，不能拿 10:00 放行
  depStore.ensureInstance(randomUUID(), 'A', '2026-09-26', '2026-09-26T10:00:00.000Z', 'succeeded')
  depStore.ensureInstance(randomUUID(), 'A', '2026-09-26', '2026-09-26T11:00:00.000Z', 'failed')
  // 上游 B：10:00 成功，11:00 在跑 ⇒ 阻塞等
  depStore.ensureInstance(randomUUID(), 'B', '2026-09-26', '2026-09-26T10:00:00.000Z', 'succeeded')
  depStore.ensureInstance(randomUUID(), 'B', '2026-09-26', '2026-09-26T11:00:00.000Z', 'running')
  // 上游 C：仅 09:00 成功
  depStore.ensureInstance(randomUUID(), 'C', '2026-09-26', '2026-09-26T09:00:00.000Z', 'succeeded')

  const mkTask = (dependsOn) => ({
    id: 'DOWN', title: 'down', enabled: true,
    schedule: { cron: '0 * * * *', window: 'PT2H' },
    target: { workspace: 'Temp', prompt: 'x' },
    depends_on: dependsOn,
  })
  const at = '2026-09-26T11:30:00.000Z'

  check('上游最近一条 failed ⇒ 阻塞（不拿更早的旧成功放行）',
    judgeDependencies(depStore, mkTask([{ task: 'A', semantics: 'latest_success' }]), '2026-09-26', at).ready === false)
  check('上游最近一条 running ⇒ 阻塞等',
    judgeDependencies(depStore, mkTask([{ task: 'B', semantics: 'latest_success' }]), '2026-09-26', at).ready === false)
  check('上游无任何记录 ⇒ 阻塞',
    judgeDependencies(depStore, mkTask([{ task: 'NOPE', semantics: 'latest_success' }]), '2026-09-26', at).ready === false)
  check('上游最近一条 succeeded ⇒ 放行',
    judgeDependencies(depStore, mkTask([{ task: 'C', semantics: 'latest_success' }]), '2026-09-26', at).ready === true)
  check('same_period 同日 succeeded ⇒ 放行',
    judgeDependencies(depStore, mkTask([{ task: 'C', semantics: 'same_period' }]), '2026-09-26', at).ready === true)
  check('same_period 同日 failed ⇒ 阻塞',
    judgeDependencies(depStore, mkTask([{ task: 'A', semantics: 'same_period' }]), '2026-09-26', at).ready === false)

  // 复用旧产出告警：下游上次执行 11:00，上游成功仅到 09:00 ⇒ 复用
  depStore.ensureInstance(randomUUID(), 'DOWN', '2026-09-26', '2026-09-26T11:00:00.000Z', 'succeeded')
  const stale = judgeDependencies(depStore, mkTask([{ task: 'C', semantics: 'latest_success' }]), '2026-09-26', '2026-09-26T12:00:00.000Z')
  check('复用旧产出 ⇒ 放行但带 stale 告警（只提示不拦）',
    stale.ready === true && stale.staleNotes.length === 1, JSON.stringify(stale.staleNotes))

  // 上游有更新的成功（11:30）⇒ 不告警
  depStore.ensureInstance(randomUUID(), 'C', '2026-09-26', '2026-09-26T11:30:00.000Z', 'succeeded')
  const fresh = judgeDependencies(depStore, mkTask([{ task: 'C', semantics: 'latest_success' }]), '2026-09-26', '2026-09-26T12:00:00.000Z')
  check('上游有新成功 ⇒ 放行且无告警', fresh.ready === true && fresh.staleNotes.length === 0, JSON.stringify(fresh.staleNotes))

  // ── 决策 43：依赖解析冻结（resolvedDeps）+ 产出下传 ──
  // 上游 D：12:30 成功，带快照（workspacePath=/ws/up）与回执 outputs
  const upId = randomUUID()
  depStore.ensureInstance(upId, 'D', '2026-09-26', '2026-09-26T12:30:00.000Z', 'succeeded', {
    title: 'up', prompt: 'p', manual: null, workspacePath: '/ws/up', provider: '', model: '',
    validStatuses: ['ok'], maxAttempts: 1, window: 'PT0S',
  })
  depStore.recordCompletion(upId, JSON.stringify(['report.md', 'data']), null, null, null)

  const verdict = judgeDependencies(depStore, mkTask([{ task: 'D', semantics: 'latest_success' }]), '2026-09-26', '2026-09-26T13:00:00.000Z')
  check('依赖放行 ⇒ resolved 固化命中的上游实例（id/工作区/产出，决策 43）',
    verdict.ready === true && verdict.resolved.length === 1
    && verdict.resolved[0].instanceId === upId
    && verdict.resolved[0].sessionId === null
    && verdict.resolved[0].workspacePath === '/ws/up'
    && JSON.stringify(verdict.resolved[0].outputs) === JSON.stringify(['report.md', 'data']),
    JSON.stringify(verdict.resolved))
  const blocked = judgeDependencies(depStore, mkTask([{ task: 'A', semantics: 'latest_success' }]), '2026-09-26', '2026-09-26T13:00:00.000Z')
  check('依赖阻塞 ⇒ resolved 为空（决策 43）', blocked.ready === false && blocked.resolved.length === 0)

  // 快照 resolvedDeps 落库 → 读回 → 解析往返无损
  const rtId = randomUUID()
  const rtDeps = [{
    task: 'D', semantics: 'latest_success', instanceId: upId,
    scheduledAt: '2026-09-26T12:30:00.000Z', sessionId: 'sess-1', workspacePath: '/ws/up', outputs: ['report.md'],
  }]
  depStore.ensureInstance(rtId, 'RT', '2026-09-26', '2026-09-26T14:00:00.000Z', 'dispatched', {
    title: 'rt', prompt: 'p', manual: null, workspacePath: '/ws/down', provider: '', model: '',
    validStatuses: ['ok'], maxAttempts: 1, window: 'PT2H', resolvedDeps: rtDeps,
  })
  const rtParsed = parseInstanceSnapshot(depStore.get(rtId).snapshot)
  check('resolvedDeps 落库→读回→解析往返无损（决策 43）',
    rtParsed !== undefined && rtParsed.resolvedDeps !== undefined && rtParsed.resolvedDeps.length === 1
    && rtParsed.resolvedDeps[0].instanceId === upId && rtParsed.resolvedDeps[0].sessionId === 'sess-1'
    && rtParsed.resolvedDeps[0].workspacePath === '/ws/up' && rtParsed.resolvedDeps[0].outputs[0] === 'report.md')
  const legacySnap = parseInstanceSnapshot(JSON.stringify({
    title: 'x', prompt: 'p', manual: null, workspacePath: '/w', provider: '', model: '',
    validStatuses: ['ok'], maxAttempts: 1, window: 'PT0S',
  }))
  check('旧形状快照（无 resolvedDeps）解析不报错、字段缺失（决策 43）',
    legacySnap !== undefined && legacySnap.resolvedDeps === undefined)
  const badSnap = parseInstanceSnapshot(JSON.stringify({
    title: 'x', prompt: 'p', manual: null, workspacePath: '/w', provider: '', model: '',
    validStatuses: ['ok'], maxAttempts: 1, window: 'PT0S', resolvedDeps: [{ nope: true }],
  }))
  check('坏形状 resolvedDeps 整组丢弃（决策 43）', badSnap !== undefined && badSnap.resolvedDeps === undefined)

  // 派发消息注入
  const snapWithDeps = {
    title: 'down', prompt: 'p', manual: null, workspacePath: '/ws/down', provider: '', model: '',
    validStatuses: ['ok'], maxAttempts: 1, window: 'PT2H', resolvedDeps: rtDeps,
  }
  const msgWith = buildMessage(snapWithDeps, '/ws/down', '2026-09-26')
  const msgText = msgWith.content[0].text
  check('派发消息注入上游依赖段：产出按上游工作区绝对化（决策 43）',
    msgText.includes('上游依赖') && msgText.includes('/ws/up/report.md')
    && msgText.includes(upId.slice(0, 8)) && msgText.includes('2026-09-26T12:30:00.000Z'))
  const snapNoDeps = { ...snapWithDeps }
  delete snapNoDeps.resolvedDeps
  const msgNoDep = buildMessage(snapNoDeps, '/ws/down', '2026-09-26')
  check('无依赖任务的消息不含上游依赖段（旧行为不变）', !msgNoDep.content[0].text.includes('上游依赖'))
  const msgUndeclared = buildMessage({
    ...snapWithDeps,
    resolvedDeps: [{ task: 'D', semantics: 'latest_success', instanceId: upId, scheduledAt: '2026-09-26T12:30:00.000Z', sessionId: null, workspacePath: null, outputs: [] }],
  }, '/ws/down', '2026-09-26')
  check('上游未声明产出 ⇒ 消息如实标注（决策 43）', msgUndeclared.content[0].text.includes('未声明产出'))
  // 决策 49：多 Agent 指令段只在 teamMode=true 时注入；缺省（老调用）消息不含团队段。
  const msgTeam = buildMessage({ ...snapWithDeps, agentTeam: true }, '/ws/down', '2026-09-29', true)
  check('多 Agent 指令段：teamMode=true 注入 spawn_teammate / team_task_create 指引；缺省调用不注入',
    msgTeam.content[0].text.includes('多 Agent 协作') && msgTeam.content[0].text.includes('spawn_teammate')
      && msgTeam.content[0].text.includes('team_task_create') && !msgText.includes('spawn_teammate'))
  // 决策 48 缺陷修复回归：goal / agentTeam 必须经快照 round-trip 保留（此前解析层丢 goal）。
  const snapRT = parseInstanceSnapshot(JSON.stringify({
    title: 't', prompt: 'p', manual: null, workspacePath: '/ws', provider: '', model: '',
    validStatuses: ['ok'], maxAttempts: 1, window: 'PT1H', goal: false, agentTeam: true,
  }))
  check('快照 round-trip：goal:false 与 agentTeam:true 不被解析丢弃（决策 48 缺陷修复）',
    snapRT?.goal === false && snapRT?.agentTeam === true)
  // 决策 50：权限档位——默认档不发指令；三档各自注入约束，工作区档把真实路径写进去。
  check('权限档位（决策 50）：默认档不注入权限指令', !msgNoDep.content[0].text.includes('权限：'))
  check('权限档位（决策 50）：仅可查看 / 工作区内修改 / 完全权限各自注入约束指令，工作区档带真实路径',
    buildMessage({ ...snapNoDeps, permission: 'readOnly' }, '/ws/down', '2026-09-29').content[0].text.includes('权限：本次仅可查看')
      && buildMessage({ ...snapNoDeps, permission: 'workspace' }, '/ws/down', '2026-09-29').content[0].text.includes('仅可在目标工作区（/ws/down）内修改')
      && buildMessage({ ...snapNoDeps, permission: 'full' }, '/ws/down', '2026-09-29').content[0].text.includes('完全权限'))
  const snapPermRT = parseInstanceSnapshot(JSON.stringify({
    title: 't', prompt: 'p', manual: null, workspacePath: '/ws', provider: '', model: '',
    validStatuses: ['ok'], maxAttempts: 1, window: 'PT1H', permission: 'workspace',
  }))
  check('权限档位快照 round-trip：合法档位保留、非法档位丢弃回默认',
    snapPermRT?.permission === 'workspace'
      && parseInstanceSnapshot(JSON.stringify({
        title: 't', prompt: 'p', manual: null, workspacePath: '/ws', provider: '', model: '',
        validStatuses: ['ok'], maxAttempts: 1, window: 'PT1H', permission: 'bogus',
      }))?.permission === undefined)

  depStore.close()
  rmSync(depDir, { recursive: true, force: true })
}

// ── 10. token 用量提取（决策 32 修订：结构化 TokenUsage，不再返回单一总数）──
console.log('\n[10] token 用量提取')
{
  const eq = (a, b) => JSON.stringify(a) === JSON.stringify(b)
  // 只给总数无法归属 ⇒ 三列全 null（不伪造）
  check('仅 totalTokens ⇒ undefined（不记单一总数）', extractTokenUsage({ usage: { totalTokens: 123 } }) === undefined)
  check('usage.promptTokens + completionTokens', eq(extractTokenUsage({ usage: { promptTokens: 10, completionTokens: 5 } }), { in: 10, out: 5 }))
  check('data.usage.inputTokens + outputTokens', eq(extractTokenUsage({ data: { usage: { inputTokens: 3, outputTokens: 4 } } }), { in: 3, out: 4 }))
  check('usage 下划线命名（prompt_tokens/completion_tokens）', eq(extractTokenUsage({ usage: { prompt_tokens: 1, completion_tokens: 2 } }), { in: 1, out: 2 }))
  check('usage.cachedTokens', eq(extractTokenUsage({ usage: { promptTokens: 1, completionTokens: 2, cachedTokens: 3 } }), { in: 1, out: 2, cache: 3 }))
  check('prompt_tokens_details.cached_tokens（OpenAI 风格）', eq(extractTokenUsage({ usage: { prompt_tokens: 1, completion_tokens: 2, prompt_tokens_details: { cached_tokens: 4 } } }), { in: 1, out: 2, cache: 4 }))
  check('detail.usage 仅 total ⇒ undefined', extractTokenUsage({ detail: { usage: { total: 9 } } }) === undefined)
  check('无用量字段 ⇒ undefined（三列留 null，不阻塞）', extractTokenUsage({ type: 'turn/end' }) === undefined)
  check('非对象 ⇒ undefined', extractTokenUsage(null) === undefined)
}

// ── 11. 保存校验与整表合并（2026-09-30 P2 保存链路）──
console.log('\n[11] 保存校验 upsert / validate / remove')
{
  const base = {
    enabled: true,
    schedule: { cron: '0 9 * * *', window: 'PT4H' },
    target: { workspace: 'Temp', prompt: 'do it' },
  }
  const existing = existingUuidIds(JSON.stringify([{ ...base, id: '11111111-1111-4111-8111-111111111111' }]))
  const validate = (definition, ids = existing) => validateDefinitionForSave(definition, ids)
  check('校验：合法定义通过', validate(base).ok)
  check('校验：提示词空 ⇒ 拒', validate({ ...base, target: { workspace: 'Temp', prompt: '  ' } }).error === '提示词不能为空')
  check('校验：工作区空 ⇒ 拒', validate({ ...base, target: { workspace: ' ', prompt: 'p' } }).error === '工作区不能为空')
  check('校验：cron 与 once 双缺 ⇒ 拒', validate({ ...base, schedule: { window: 'PT4H' } }).error?.includes('排期缺失') === true)
  check('校验：cron 与 once 并存 ⇒ 拒', validate({ ...base, schedule: { cron: '0 9 * * *', once: '2026-10-01T09:00', window: 'PT4H' } }).error?.includes('排期冲突') === true)
  check('校验：坏 cron ⇒ 拒', validate({ ...base, schedule: { cron: 'not a cron', window: 'PT4H' } }).ok === false)
  check('校验：前置任务不存在 ⇒ 拒', validate({ ...base, depends_on: [{ task: 'ghost', semantics: 'latest_success' }] }).error?.includes('不存在') === true)
  const upstreamId = '22222222-2222-4222-8222-222222222222'
  check(
    '校验：前置任务存在（停用也行）⇒ 通过',
    validate({ ...base, depends_on: [{ task: upstreamId, semantics: 'latest_success' }] },
      new Set([upstreamId])).ok,
  )

  const uuid = '33333333-3333-4333-8333-333333333333'
  // 新增：无 id ⇒ 系统生成
  const created = upsertDefinitionInline('[]', { ...base })
  check('upsert：无 id ⇒ 新建并生成 UUID', created.mode === 'create' && isUuid(created.id))
  check('upsert：结果 JSON 里有该 id', JSON.parse(created.json).some(row => row.id === created.id))
  // 修改：命中现有表
  const seeded = JSON.stringify([{ ...base, id: uuid, title: '旧名' }])
  const updated = upsertDefinitionInline(seeded, { ...base, title: '新名', id: uuid })
  check('upsert：带 UUID 命中 ⇒ 修改', updated.mode === 'update' && JSON.parse(updated.json)[0].title === '新名')
  // 闸门：带 UUID 不在表内 ⇒ 拒（表单通道 allowNew 除外）
  const ghostId = '44444444-4444-4444-8444-444444444444'
  check('upsert：凭空 UUID ⇒ 拒', upsertDefinitionInline('[]', { ...base, id: ghostId }).error !== null)
  check(
    'upsert：allowNew ⇒ 视为新增（表单通道：id 由服务端刚生成）',
    upsertDefinitionInline('[]', { ...base, id: ghostId }, { allowNew: true }).mode === 'create',
  )
  // 删除
  const removed = removeDefinitionInline(seeded, uuid)
  check('remove：按 id 摘除', removed.removed && JSON.parse(removed.json).length === 0)
  check('remove：id 不存在 ⇒ removed=false', removeDefinitionInline(seeded, ghostId).removed === false)
  // 启用开关实时写回（2026-09-30：编辑器头部开关独立操作，不走保存链路）
  const en1 = setEnabledDefinitionInline(seeded, uuid, false)
  check('enabled：命中 ⇒ 改写并落 JSON', en1.error === null && en1.changed && JSON.parse(en1.json)[0].enabled === false)
  check('enabled：值没变 ⇒ 不动（changed=false）', setEnabledDefinitionInline(en1.json, uuid, false).changed === false)
  check('enabled：id 不存在 ⇒ task-not-found', setEnabledDefinitionInline(seeded, ghostId, true).error === 'task-not-found')
  check('enabled：空表 ⇒ task-not-found', setEnabledDefinitionInline('', uuid, true).error === 'task-not-found')
}

// ── 12. 执行记录清理 purgeHistory（2026-09-30：默认不清 + 保护每任务最近终态）──
console.log('\n[12] purgeHistory')
{
  const dir = join(root, 'purge-db')
  const store = new TaskStore(join(dir, 'state.db'))
  const t0 = '2026-01-01T00:00:00.000Z'
  const recent = '2100-01-01T00:00:00.000Z'
  const mk = (id, taskId, status, updated, scheduledAt = t0) => {
    store.ensureInstance(id, taskId, '2026-01-01', scheduledAt, status, { title: 't', prompt: 'p', workspacePath: '/ws', provider: '', model: '', validStatuses: ['ok'], maxAttempts: 1, window: 'PT1H' })
    store.transition(id, { status })
    // 手动把 updated_at 拨到目标时刻（transition 用 now）
    store.db.prepare('UPDATE task_instances SET updated_at = ? WHERE id = ?').run(updated, id)
  }
  const oldDone = '55555555-5555-4555-8555-555555555555'
  const oldKeep = '66666666-6666-4666-8666-666666666666' // 该任务最近一条终态 ⇒ 保护
  mk(oldDone, 'task-a', 'failed', t0)
  mk(oldKeep, 'task-b', 'succeeded', t0)
  mk('77777777-7777-4777-8777-777777777777', 'task-b', 'failed', '2026-06-01T00:00:00.000Z', '2026-06-01T00:00:00.000Z')
  const run1 = store.purgeHistory(0)
  check('默认（days=0）⇒ 不清', run1.instances === 0)
  const run2 = store.purgeHistory(90)
  // task-a：oldDone 是它唯一（=最近）终态 ⇒ 保护；task-b：7777(updated 06-01) 比 oldKeep(updated 01-01) 新
  // ⇒ 7777 保护、oldKeep 被清。清理 = 删「非该任务最近终态」的过期行。
  check('清掉过期且非最近终态的行', run2.instances === 1, `实际 ${run2.instances}`)
  check('保护：task-a 最近终态保留', store.get(oldDone) !== undefined)
  check('保护：task-b 最近终态保留', store.get('77777777-7777-4777-8777-777777777777') !== undefined)
  check('task-b 较旧的 succeeded 行被清', store.get(oldKeep) === undefined)
  store.close()
  rmSync(dir, { recursive: true, force: true })
}

// ── 13. 任务文件资产 task-assets（版本 / 快照 / 附件）──
console.log('\n[13] task-assets')
{
  const dir = join(root, 'assets-root')
  const paths = assetPaths(join(dir, 'state.db'))
  // 上传路由落盘前会建临时区；直测 reconcile 时也要先有它。
  mkdirSync(paths.tmpDir, { recursive: true })
  const taskId = '88888888-8888-4888-8888-888888888888'
  const save1 = saveVersion(paths, taskId, '# v1\n内容', '初版')
  check('版本：首次保存 ⇒ 建版', save1.created && save1.file !== '')
  const save2 = saveVersion(paths, taskId, '# v1\n内容', '')
  check('版本：内容没变 ⇒ 不留版', save2.created === false)
  const save3 = saveVersion(paths, taskId, '  # v1\n内容  ', '')
  check('版本：只差首尾空白 ⇒ 不算改动', save3.created === false)
  const save4 = saveVersion(paths, taskId, '# v2\n改了', '第二版')
  check('版本：内容变了 ⇒ 留新版', save4.created && save4.file > save1.file)
  const versions = listVersions(paths, taskId)
  check('版本：列表新的在前', versions.length === 2 && versions[0].file === save4.file)
  check('版本：备注落 .note 文件', versions[1].note === '初版' && versions[0].note === '第二版')
  check('版本：读回内容一致', readVersion(paths, taskId, save4.file) === '# v2\n改了')
  check('版本：删除连 note 一起删', deleteVersion(paths, taskId, save4.file) && listVersions(paths, taskId).length === 1)

  const snap1 = saveSnapshot(paths, taskId, { id: taskId, title: 'A' })
  const snap2 = saveSnapshot(paths, taskId, { id: taskId, title: 'A' })
  const snap3 = saveSnapshot(paths, taskId, { id: taskId, title: 'B' })
  check('快照：没变不留 / 变了才留', snap1.created && snap2.created === false && snap3.created)
  check('快照：读回一致', readSnapshot(paths, taskId, snap3.file).title === 'B')

  // 附件：临时区 → 任务目录（ref 改写为相对路径）→ 移除真删
  writeFileSync(join(paths.tmpDir, 'tmp-abc.md'), 'hello', 'utf8')
  const att = [{ id: 'a1', name: '报告.md', kind: 'upload', ref: 'tmp-abc.md' }]
  const rec1 = reconcileAttachments(paths, taskId, att, [])
  check('附件：搬进任务目录且 ref 改写', rec1.missing.length === 0 && rec1.attachments[0].ref.startsWith('attachments/') && rec1.attachments[0].ref.endsWith('报告.md'))
  check('附件：原始名保留（盘上就叫 报告.md）', readFileSync(join(paths.tasksRoot, taskId, 'attachments', '报告.md'), 'utf8') === 'hello')
  check('附件：已在任务目录 ⇒ 原地不动', reconcileAttachments(paths, taskId, rec1.attachments, rec1.attachments).attachments[0].ref === rec1.attachments[0].ref)
  check('附件：临时文件丢了 ⇒ missing（不静默）', reconcileAttachments(paths, taskId, [{ ...att[0], ref: 'tmp-gone.md' }], []).missing.length === 1)
  const rec2 = reconcileAttachments(paths, taskId, [], rec1.attachments)
  check('附件：移除 ⇒ 真删', rec2.removed.length === 1 && !existsSync(join(paths.tasksRoot, taskId, 'attachments', '报告.md')))
  // 评审 P0#1 回归：ref 带路径穿越 ⇒ 真删循环直接跳过，绝不碰任务目录外的文件
  writeFileSync(join(paths.dataRoot, 'guard.txt'), 'x', 'utf8')
  const recE = reconcileAttachments(paths, taskId, [], [{ id: 'e', name: 'evil', kind: 'upload', ref: '../guard.txt' }])
  check('附件：穿越 ref 不执行删除', existsSync(join(paths.dataRoot, 'guard.txt')) && recE.errors.filter(x => x.includes('guard')).length === 0)
  rmSync(join(paths.dataRoot, 'guard.txt'), { force: true })

  check('清道夫：清临时区过期文件', purgeTmp(paths, 7) >= 0)
  check('删除任务：整目录删', deleteTaskAssets(paths, taskId) && !existsSync(join(paths.tasksRoot, taskId)))
  rmSync(dir, { recursive: true, force: true })
}

// ── 14. 主界面运行态内存索引（2026-09-30：一条聚合 SQL 建索引 + 两循环事件增量维护 ⇒ 轮询不查库）──
console.log('\n[14] runtime-index')
{
  const dir = join(root, 'runtime-db')
  const store = new TaskStore(join(dir, 'state.db'))
  // task-a：08:00 失败 → 09:00 成功（最近一条必须是 09:00 那条）；task-b：一条在飞的 dispatched。
  const a1 = randomUUID()
  store.ensureInstance(a1, 'task-a', '2026-09-01', '2026-09-01T08:00:00.000Z', 'failed')
  store.transition(a1, { status: 'failed', finished_at: '2026-09-01T08:01:00.000Z' })
  const a2 = randomUUID()
  store.ensureInstance(a2, 'task-a', '2026-09-01', '2026-09-01T09:00:00.000Z', 'succeeded')
  store.transition(a2, { status: 'succeeded', finished_at: '2026-09-01T09:05:00.000Z' })
  store.ensureInstance(randomUUID(), 'task-b', '2026-09-01', '2026-09-01T09:00:00.000Z', 'dispatched')

  const last = store.lastRunByTask()
  check('lastRunByTask：取每任务最近一条（不是最早）', last.get('task-a')?.status === 'succeeded' && last.get('task-a')?.scheduledAt === '2026-09-01T09:00:00.000Z')
  check('lastRunByTask：finished_at 同源', last.get('task-a')?.finishedAt === '2026-09-01T09:05:00.000Z')
  const flying = store.inFlightByTask()
  check('inFlightByTask：只认 dispatched/running', flying.has('task-b') && !flying.has('task-a'))
  check('lastRunByTask：在飞行的行不算「上次执行」（运行中不得覆盖上次）', !last.has('task-b'))

  const idx = createRuntimeIndex()
  const taskA = def({ id: 'task-a', title: '日报', target: { workspace: 'Temp', prompt: '写日报' } })
  const taskB = def({ id: 'task-b', title: '周报', enabled: false, target: { workspace: 'Temp', prompt: '写周报' } })
  const t0 = Date.parse('2026-09-01T10:00:00.000Z')
  idx.rebuild([taskA, taskB], store, t0)
  const base = idx.overview([taskA, taskB], Date.parse('2026-09-01T10:00:00.000Z'))
  const rowA = base.rows.find(r => r.id === 'task-a')
  const rowB = base.rows.find(r => r.id === 'task-b')
  check('rebuild：上次执行取自库里最近一条', rowA?.lastStatus === 'succeeded' && rowA?.lastScheduledAt === '2026-09-01T09:00:00.000Z')
  check('rebuild：在飞行实例 ⇒ running', rowB?.running === true && rowB?.runningSince === '2026-09-01T09:00:00.000Z')
  check('nextSlotAt：按 cron 算出下一刻度（次日 09:00）', rowA?.nextSlotAt === '2026-09-02T09:00:00.000Z', `实际 ${rowA?.nextSlotAt}`)
  // 2026-09-30 修订（用户拍板）：关掉的任务**不再**判断下次几点跑 ⇒ 没有刻度；
  // 排序仍按「已关闭」组沉底（组内按上次执行倒序，不依赖 nextSlotAt）。
  check('停用任务不给下一刻度（关掉了不判断几点跑）', rowB?.nextSlotAt === null && rowB?.enabled === false)

  const revBefore = base.rev
  const again = idx.overview([taskA, taskB], Date.parse('2026-09-01T10:30:00.000Z'))
  check('overview：内容未变 ⇒ rev 不变（轮询可回 unchanged，不传整份）', again.rev === revBefore)

  const moved = idx.overview([taskA, taskB], Date.parse('2026-09-02T10:00:00.000Z'))
  check('overview：刻度过期 ⇒ 就地前移 + rev 变化', moved.rows.find(r => r.id === 'task-a')?.nextSlotAt === '2026-09-03T09:00:00.000Z' && moved.rev !== revBefore)

  const taskA2 = def({ id: 'task-a', title: '日报', schedule: { cron: '0 18 * * *', timezone: 'UTC', window: 'PT4H' } })
  const edited = idx.overview([taskA2, taskB], Date.parse('2026-09-02T10:00:00.000Z'))
  check('overview：排期改了 ⇒ 立刻重算（18:00）', new Date(edited.rows.find(r => r.id === 'task-a')?.nextSlotAt).getUTCHours() === 18 && edited.rev !== moved.rev)

  idx.markDispatched('task-a', '2026-09-02T18:00:00.000Z')
  check('markDispatched：卡片转运行中', idx.overview([taskA2], Date.parse('2026-09-02T10:00:00.000Z')).rows[0]?.running === true)
  check('markDispatched：**不覆盖上次执行**（该成功还是成功）', (() => {
    const r = idx.overview([taskA2], Date.parse('2026-09-02T10:00:00.000Z')).rows[0]
    return r?.lastStatus === 'succeeded' && r?.lastScheduledAt === '2026-09-01T09:00:00.000Z'
  })())
  idx.markTerminal('task-a', 'failed', '2026-09-02T18:00:00.000Z', '2026-09-02T18:03:00.000Z')
  const done = idx.overview([taskA2], Date.parse('2026-09-02T10:00:00.000Z')).rows[0]
  check('markTerminal：不再在飞 + 记录上次失败', done?.running === false && done?.lastStatus === 'failed' && done?.lastFinishedAt === '2026-09-02T18:03:00.000Z')

  const long = '长'.repeat(300)
  const rich = def({
    id: 'task-a', title: '日报', code: 'D1', target: { workspace: 'Temp', prompt: long },
    attachments: [{ id: 'a1', name: '报告.md', kind: 'upload', ref: 'x.md' }],
    depends_on: [{ task: 'task-b', semantics: 'latest_success' }],
  })
  const proj = idx.overview([rich, taskB], Date.parse('2026-09-02T10:00:00.000Z')).rows.find(r => r.id === 'task-a')
  check('投影：提示词只给首段（不传全文）', proj?.promptHead.length === 121 && proj?.promptHead.endsWith('…'))
  check('投影：附件只给名与类型', proj?.attachments.length === 1 && proj?.attachments[0].name === '报告.md' && proj?.attachments[0].kind === 'upload')
  check('投影：前置任务带标题与启停', proj?.depends[0]?.title === '周报' && proj?.depends[0]?.enabled === false)
  check('投影：createdAt 缺省为 null（不编造时间）', proj?.createdAt === null)

  // ── rev 必须覆盖**全部展示字段**（历史 bug：只比排期 ⇒ 改标题 / 提示词 / 附件永远不刷新）──
  const revBeforeEdit = idx.revision()
  const renamed = def({ id: 'task-b', title: '周报改名了', enabled: false, target: { workspace: 'Temp', prompt: '写周报' } })
  const afterRename = idx.overview([taskA2, renamed], Date.parse('2026-09-02T10:00:00.000Z'))
  check('rev：改标题也算变化（界面必须刷新）', afterRename.rev !== revBeforeEdit, `rev ${revBeforeEdit} → ${afterRename.rev}`)
  const stillSame = idx.overview([taskA2, renamed], Date.parse('2026-09-02T10:00:00.000Z'))
  check('rev：内容未变 ⇒ rev 不变（可回 unchanged）', stillSame.rev === afterRename.rev)
  check('停用任务：nextSlotAt = null（关掉了不再算几点跑）',
    afterRename.rows.find(r => r.id === 'task-b')?.nextSlotAt === null)
  // 定义改动的统一入口：调一次即重算指纹（幂等，重复调不再 bump）
  idx.markDefinitionsChanged([def({ id: 'task-b', title: '又改名' })])
  const afterHook = idx.overview([taskA2, def({ id: 'task-b', title: '又改名', enabled: false })], Date.parse('2026-09-02T10:00:00.000Z'))
  check('markDefinitionsChanged：定义改动统一入口生效', afterHook.rev !== stillSame.rev)
  const afterHook2 = idx.overview([taskA2, def({ id: 'task-b', title: '又改名', enabled: false })], Date.parse('2026-09-02T10:00:00.000Z'))
  check('markDefinitionsChanged：幂等（重复调用不刷 rev）', afterHook2.rev === afterHook.rev)

  const pruned = idx.overview([taskB], Date.parse('2026-09-02T10:00:00.000Z'))
  check('overview：任务表里没有的条目被剔除', pruned.rows.length === 1 && pruned.rows[0].id === 'task-b')
  store.close()
  rmSync(dir, { recursive: true, force: true })
}

console.log(`\n冒烟结果：${passed} 项通过，${failures.length} 项失败`)
if (failures.length > 0) {
  for (const item of failures) console.log(`  - ${item}`)
  process.exit(1)
}
