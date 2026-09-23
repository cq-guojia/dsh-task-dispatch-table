// 冒烟测试：验证决策 25 的两处底层改造（刻度化调度 + 执行身份/防重）以及旧库可继续用。
//
// 跑法：npm run smoke（先 npm run build，本脚本直接引 dist 产物，测的是真正要发布的代码）。
// 刻意不引任何测试框架：零新增依赖，宿主环境装不了也照样能跑。
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { DatabaseSync } from 'node:sqlite'
import { firstSlotOnDay, nextSlotAfter, scheduledSlotsFor } from '../dist/tasks.js'
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

  // ── 2. 定义身份：用户不写 id，系统生成并记住 ──
  console.log('\n[2] 定义身份 resolveTaskId')
  const store = new TaskStore(join(root, 'state.db'))
  const idA = store.resolveTaskId('inline:0', '日报')
  const idA2 = store.resolveTaskId('inline:0', '日报（改名不影响）')
  check('同一来源跨次加载复用同一 id', idA === idA2, `${idA} vs ${idA2}`)
  check('无 id 时系统生成（前缀 t- + UUID）', /^t-[0-9a-f-]{36}$/.test(idA), idA)
  const idB = store.resolveTaskId('inline:1', '周报', 'my-weekly')
  check('显式写了 id 则以用户写的为准', idB === 'my-weekly')
  const idC = store.resolveTaskId('file:/tmp/a.json', '文件任务')
  check('不同来源得到不同 id', idA !== idC)

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
  store.close()

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
        { title: '小时任务', enabled: true, schedule: { cron: '0 * * * *', timezone: 'UTC', window: 'PT2H' }, target: { workspace: 'Temp', prompt: 'x' } },
        // 故意不写 title 也不写 id：两个都该由系统兜出来
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
  check('未写 id 的任务也由系统生成', loaded.length === 2 && loaded.every(task => task.id.startsWith('t-')), loaded.map(t => t.id).join(', '))
  check('title 保留用户写的（不被 id 顶替）', loaded.some(task => task.title === '小时任务'))
  check('未写 title 时回退成 id（面板不会空着）', loaded.some(task => task.title === task.id))
  check('两条任务 id 互不相同', loaded[0].id !== loaded[1].id)
  // 第二次 tick：幂等，不该再多出实例
  const before = generated.length
  scheduler.tick()
  const after = schedStore.listByStatus(['pending']).length
    + schedStore.listByStatus(['failed']).length
    + schedStore.listByStatus(['skipped']).length
  check('重复 tick 不产生重复实例（数量不增长）', after === before, `${before} → ${after}`)
  schedStore.close()
  rmSync(schedDir, { recursive: true, force: true })
} finally {
  rmSync(root, { recursive: true, force: true })
}

console.log(`\n冒烟结果：${passed} 项通过，${failures.length} 项失败`)
if (failures.length > 0) {
  for (const item of failures) console.log(`  - ${item}`)
  process.exit(1)
}
