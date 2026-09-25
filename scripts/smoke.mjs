// 冒烟测试：验证决策 25 的两处底层改造（刻度化调度 + 执行身份/防重）以及旧库可继续用。
//
// 跑法：npm run smoke（先 npm run build，本脚本直接引 dist 产物，测的是真正要发布的代码）。
// 刻意不引任何测试框架：零新增依赖，宿主环境装不了也照样能跑。
import { mkdtempSync, readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { DatabaseSync } from 'node:sqlite'
import {
  ensureIdsInInlineJson, existingUuidIds, firstSlotOnDay, nextSlotAfter, parseInlineTasks, scheduledSlotsFor, applyIdentity, isUuid,
} from '../dist/tasks.js'
import { TaskStore } from '../dist/store.js'
import { createReconciler } from '../dist/reconcile.js'
import { createScheduler } from '../dist/scheduler.js'

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
  const first1 = store.ensureInstance(idA, '2026-09-24', '2026-09-24T09:00:00.000Z', 'pending')
  const again = store.ensureInstance(idA, '2026-09-24', '2026-09-24T09:00:00.000Z', 'pending')
  check('同一任务同一刻度只建一条（tick 幂等）', first1 === true && again === false)
  const otherSlot = store.ensureInstance(idA, '2026-09-24', '2026-09-24T10:00:00.000Z', 'pending')
  check('不同刻度各一条', otherSlot === true)
  const otherDay = store.ensureInstance(idA, '2026-09-25', '2026-09-25T09:00:00.000Z', 'pending')
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
  check('旧库同样按（任务 + 刻度）去重', legacyStore.ensureInstance('legacy-task', '2026-09-23', '2026-09-23T09:00:00.000Z', 'pending') === false)
  legacyStore.close()

  // ── 5. 调度器：小时级 cron 一天能出多条（旧实现只能 1 条）──
  console.log('\n[5] 调度器刻度化 ensureInstances')
  const schedDir = mkdtempSync(join(tmpdir(), 'dsh-tdt-sched-'))
  const schedStore = new TaskStore(join(schedDir, 'state.db'))
  const logger = { info() {}, warn() {}, error() {} }
  const fakeCtx = {
    // 工作区注册为空 ⇒ 派发会以 workspace-not-found 收敛，本例只验证实例生成数量。
    workspaceRegistry: { list: () => [], archiveSession: async () => {} },
    get: () => undefined,
  }
  const reconciler = createReconciler({
    ctx: fakeCtx,
    logger,
    store: schedStore,
    options: { leaseMs: 60_000, dispatchGraceMs: 60_000, unknownGraceMs: 300_000, tasks: () => new Map() },
  })
  const scheduler = createScheduler({
    ctx: fakeCtx,
    logger,
    store: schedStore,
    reconciler,
    config: () => ({
      tasksInline: JSON.stringify([
        { id: UUID_A, title: '小时任务', enabled: true, schedule: { cron: '0 * * * *', timezone: 'UTC', window: 'PT2H' }, target: { workspace: 'Temp', prompt: 'x' } },
        // 故意不带 id：运行时只认不修（决策 30 修订）——这条应被 warn 跳过、不产生任何实例
        { enabled: true, schedule: { cron: '0 3 * * *', timezone: 'UTC', window: 'PT2H' }, target: { workspace: 'Temp', prompt: 'y' } },
      ]),
      tasksDir: 'tasks',
      tickMs: 60_000,
      statePath: '',
      dispatchGraceMs: 60_000,
      leaseMs: 60_000,
      unknownGraceMs: 300_000,
      debugSnapshot: '',
      defaultProvider: '',
      defaultModel: '',
    }),
  })
  scheduler.tick()
  const generated = [...schedStore.listByStatus(['pending']), ...schedStore.listByStatus(['failed']), ...schedStore.listByStatus(['skipped'])]
  check('小时级 cron 一次 ensure 建出多条（> 1）', generated.length > 1, `实际 ${generated.length}`)
  const loaded = [...scheduler.getTasks().values()]
  check('运行时只认 UUID：无 id 条目被跳过，仅剩合法那条', loaded.length === 1 && loaded[0]?.id === UUID_A, loaded.map(t => t.id).join(', '))
  check('title 保留用户写的（不被 id 顶替）', loaded.some(task => task.title === '小时任务'))
  // 第二次 tick：幂等，不该再多出实例
  const before = generated.length
  scheduler.tick()
  const after = schedStore.listByStatus(['pending']).length
    + schedStore.listByStatus(['failed']).length
    + schedStore.listByStatus(['skipped']).length
  check('重复 tick 不产生重复实例（数量不增长）', after === before, `${before} → ${after}`)
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
    options: { leaseMs: 60_000, dispatchGraceMs: 60_000, unknownGraceMs: 300_000, tasks: () => new Map() },
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
  const clientPath = join(import.meta.dirname, '..', 'dist', 'client.js')
  const clientJs = readFileSync(clientPath, 'utf8')
  check('SessionViewModal 组件已打进 bundle', clientJs.includes('SessionViewModal'))
  check('openSessionView 数据闸门已打进 bundle', clientJs.includes('openSessionView'))
  check('loadOlder 探测调用已打进 bundle', clientJs.includes('loadOlder'))
  check('chat target 组装已打进 bundle（target("chat")）', clientJs.includes('target("chat")') || clientJs.includes("target('chat')") || /target\(["']chat["']\)/.test(clientJs))
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
} finally {
  rmSync(root, { recursive: true, force: true })
}

console.log(`\n冒烟结果：${passed} 项通过，${failures.length} 项失败`)
if (failures.length > 0) {
  for (const item of failures) console.log(`  - ${item}`)
  process.exit(1)
}
