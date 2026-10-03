// 冒烟测试：验证决策 25 的两处底层改造（刻度化调度 + 执行身份/防重）以及旧库可继续用。
//
// 跑法：npm run smoke（先 npm run build，本脚本直接引 dist 产物，测的是真正要发布的代码）。
// 刻意不引任何测试框架：零新增依赖，宿主环境装不了也照样能跑。
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, utimesSync, writeFileSync } from 'node:fs'
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
  assetPaths, attachmentAbsPath, deleteTaskAssets, deleteVersion, listVersions, moveAttachmentsIn,
  purgeTmp, readSnapshot, readVersion, reconcileAttachments, saveSnapshot, saveVersion,
} from '../dist/task-assets.js'
import { TaskStore, parseInstanceSnapshot } from '../dist/store.js'
import { createReconciler, checkReceipt, extractTokenUsage } from '../dist/reconcile.js'
import { createScheduler, judgeDependencies } from '../dist/scheduler.js'
import { attachmentFileBlocks, buildMessage } from '../dist/dispatch.js'
import { createRuntimeIndex } from '../dist/runtime-index.js'
import { groupOf, pinMsFor, sortKeyOf, sortRows } from '../dist/task-sort.js'

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

  // ── 间隔型：刻度 = 锚点（任务开始时间）+ k×步长（用户 2026-09-30 拍板，不再整点对齐）──
  const anchored = def({ id: 'anchored', schedule: { cron: '*/10 * * * *', timezone: 'UTC', window: 'PT4H', start: '2026-09-30T18:03' } })
  const aSlots = scheduledSlotsFor(anchored, new Date('2026-09-30T18:00:00Z'), new Date('2026-09-30T19:00:00Z'))
  check('间隔锚点：18:03 起每 10 分钟 ⇒ 18:03 / 18:13 / …（不是 :00 / :10 整点）',
    aSlots.length === 6 && aSlots[0].toISOString() === '2026-09-30T18:03:00.000Z' && aSlots[1].toISOString() === '2026-09-30T18:13:00.000Z',
    `实际 ${aSlots.slice(0, 3).map(s => s.toISOString()).join(',')}`)
  check('间隔锚点：锚点之前不产刻度（开始时间是下界）',
    scheduledSlotsFor(anchored, new Date('2026-09-30T17:00:00Z'), new Date('2026-09-30T18:20:00Z'))
      .every(s => s.getTime() >= Date.parse('2026-09-30T18:03:00.000Z')))
  const anchoredHour = def({ id: 'ah', schedule: { cron: '0 */2 * * *', timezone: 'UTC', window: 'PT4H', start: '2026-09-30T18:30' } })
  const hSlots = scheduledSlotsFor(anchoredHour, new Date('2026-09-30T18:00:00Z'), new Date('2026-10-01T01:00:00Z'))
  check('间隔锚点：小时档同理（18:30 起每 2 小时 ⇒ 18:30 / 20:30 …）',
    hSlots.length === 4 && hSlots[0].toISOString() === '2026-09-30T18:30:00.000Z' && hSlots[1].toISOString() === '2026-09-30T20:30:00.000Z')
  const anchoredWeek = def({ id: 'aw', schedule: { cron: '*/10 * * * 1,2,3,4,5', timezone: 'UTC', window: 'PT4H', start: '2026-09-30T18:03' } })
  const wSlots = scheduledSlotsFor(anchoredWeek, new Date('2026-09-30T18:00:00Z'), new Date('2026-10-05T00:00:00Z'))
  check('间隔锚点：星期位照旧生效（周一~周五，周末不产刻度）',
    wSlots.length > 0 && wSlots.every(s => s.getUTCDay() >= 1 && s.getUTCDay() <= 5))
  const noStart = def({ id: 'ns', schedule: { cron: '*/10 * * * *', timezone: 'UTC', window: 'PT4H' } })
  check('间隔锚点：锚点缺失（老数据 / 手写）⇒ 退回 cron 整点对齐，不猜',
    scheduledSlotsFor(noStart, new Date('2026-09-30T18:00:00Z'), new Date('2026-09-30T19:00:00Z'))[0].toISOString() === '2026-09-30T18:00:00.000Z')

  // ── 1b. 排序（决策 54：到点钳位已整删，抖动改由服务端冻结刻度根治）──
  console.log('\n[1b] 排序 sortRows / sortKeyOf（+ 派发延迟预算 pinMsFor）')
  const rowOf = (id, over = {}) => ({ id, enabled: true, running: false, nextSlotAt: null, lastScheduledAt: null, runningSince: null, ...over })
  check('分组：运行中 0 / 已启用 1 / 无刻度 2 / 已关闭 3',
    groupOf(rowOf('a', { running: true })) === 0 && groupOf(rowOf('a', { nextSlotAt: '2026-09-30T18:10:00.000Z' })) === 1
    && groupOf(rowOf('a')) === 2 && groupOf(rowOf('a', { enabled: false })) === 3)
  // 用户报的原场景：A 每 10 分钟、B 还有 3 分钟 —— **纯按下次执行升序**（B 在前）。
  const rowA = rowOf('A', { nextSlotAt: '2026-09-30T18:10:00.000Z' })
  const rowB = rowOf('B', { nextSlotAt: '2026-09-30T18:03:00.000Z' })
  check('已启用组内按下次执行升序（谁的刻度近谁在前）',
    sortRows([rowA, rowB]).map(r => r.id).join(',') === 'B,A')
  check('运行中永远在最上（不被任何已启用行顶下去）',
    sortRows([rowA, rowOf('C', { running: true, nextSlotAt: '2026-09-30T18:20:00.000Z' })]).map(r => r.id).join(',') === 'C,A')
  // 决策 54 的关键不变量：**到点还没跑**的行 `nextSlotAt` 是**过去时刻**（服务端闸门冻结刻度保证）
  // ⇒ 在组内**自然排最前**，**不需要任何「插队哨兵」**。
  const rowDue = rowOf('D', { nextSlotAt: '2026-09-30T17:59:00.000Z' })
  check('到点未派发（刻度已过、未处理）⇒ 自然排最前（不靠哨兵）',
    sortRows([rowB, rowDue]).map(r => r.id).join(',') === 'D,B')
  // 附件路径**写 → 读往返**（2026-09-30 真机根因）：保存时把上传文件搬到 `<任务目录>/attachments/<名>`
  // 并把 ref 改写成 `attachments/<名>`；执行前校验必须按**同一基准**解析回同一个绝对路径。
  // 此前读侧把 `attachments/` 前缀剥掉（少一层）⇒ 带上传附件的任务恒判「附件不存在」：
  // Loop A 不建实例行、Loop B 不发动 ⇒ 执行记录里一条都没有。这条断言就是当时缺的那条。
  {
    const rpRoot = join(root, 'attach-roundtrip')
    mkdirSync(rpRoot, { recursive: true })
    const rpPaths = assetPaths(join(rpRoot, 'state.db'))
    const rpTaskId = randomUUID()
    mkdirSync(rpPaths.tmpDir, { recursive: true })
    writeFileSync(join(rpPaths.tmpDir, 'nv.html'), '<h1>hi</h1>')
    const moved = moveAttachmentsIn(rpPaths, rpTaskId, [{ id: 'a1', name: 'nv.html', kind: 'upload', ref: 'nv.html' }], [])
    const rpRef = moved.attachments[0]?.ref
    check('附件落定：ref 改写为「相对任务目录」的 attachments/<名>', rpRef === 'attachments/nv.html', `实际 ${rpRef}`)
    check('附件校验：attachmentAbsPath 解析回真实落盘路径（写读同一基准）',
      rpRef !== undefined
      && attachmentAbsPath(rpPaths, rpTaskId, rpRef) === join(rpPaths.tasksRoot, rpTaskId, 'attachments', 'nv.html')
      && existsSync(attachmentAbsPath(rpPaths, rpTaskId, rpRef)))
  }
  // 补记「未执行」（决策 54）：终态 `skipped` + `attempt=0` + **幂等**（同一刻度只写一条）。
  // 用户明确要求「要确定：重试几次也不要去重试」⇒ 这里钉住它**进不了 Loop B 的巡检范围**
  // （sweep 只遍历 pending/dispatched/running/unknown，见 reconcile.ts 的四张列表）。
  {
    const skRoot = join(root, 'skipped-record')
    const skStore = new TaskStore(join(skRoot, 'state.db'))
    const slotIso = '2026-09-30T18:44:00.000Z'
    const first = skStore.ensureSkipped(randomUUID(), 'task-y', '2026-09-30', slotIso)
    const latest = skStore.getLatestInstance('task-y')
    check('补记「未执行」：写一条 skipped 终态行（attempt=0、无 session/lease/快照）',
      first === true && latest?.status === 'skipped' && latest?.attempt === 0
      && latest?.session_id === null && latest?.snapshot === null)
    check('补记「未执行」：同一刻度重复写不新增（唯一键闸门 ⇒ tick 幂等）',
      skStore.ensureSkipped(randomUUID(), 'task-y', '2026-09-30', slotIso) === false
      && skStore.listByStatus(['skipped']).length === 1)
    check('补记「未执行」：不在 Loop B 的巡检范围内 ⇒ 永不重试',
      skStore.listByStatus(['pending', 'dispatched', 'running', 'unknown']).length === 0)
    skStore.close()
    rmSync(skRoot, { recursive: true, force: true })
  }
  // 派发延迟预算（决策 54：原「钳位时长」，现为客户端「到点未派发」loading 上界的**唯一口径**）。
  check('派发延迟预算跟着巡检间隔走（默认 60s ⇒ 80s；带 30s ~ 10min 上下限）',
    pinMsFor(60_000, 10_000) === 80_000 && pinMsFor(5_000, 10_000) === 30_000 && pinMsFor(3_600_000, 10_000) === 600_000)
  check('排序键：无刻度 = +∞；有刻度 = 该时刻本身（**没有插队哨兵**）',
    sortKeyOf(rowOf('x', { nextSlotAt: null })) === Number.POSITIVE_INFINITY
    && sortKeyOf(rowA) === Date.parse('2026-09-30T18:10:00.000Z'))
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
  // 2026-09-30 门禁放宽（用户拍板）：紧邻的前一槽若没跑过，**会补一条**「未执行」——
  // 但仍**只补紧邻那一条**（无洪水）：这里同时钉住"补了"与"只补一条"。
  const okSkipped = schedStore.listByStatus(['skipped'])
  check('补记：只补紧邻一条「未执行」（不是不补、也不是刷屏）',
    okSkipped.length === 1 && schedStore.countEvents(okSkipped[0].id, 'missed-slot') === 1)
  // 让异步拉起（launchAsync）跑完，验证派发确实写了 dispatched_at：
  // sweep 派发宽限（等 session/created）与 `latestReceipt` 的 afterIso（防上一轮 attempt 的旧回执冒充）都依赖它。
  await new Promise((resolve) => setTimeout(resolve, 0))
  const dispatchedRows = schedStore.listByStatus(['dispatched'])
  check(
    '派发行写了 dispatched_at（sweep 宽限与回执按次取新都依赖它）',
    dispatchedRows.length === 1 && dispatchedRows[0].dispatched_at !== null && !Number.isNaN(Date.parse(dispatchedRows[0].dispatched_at)),
    JSON.stringify(dispatchedRows.map(r => r.dispatched_at)),
  )
  okScheduler.tick()
  check('重复 tick 不重复派发同一刻度', schedStore.listByStatus(['dispatched']).length === 1, `实际 ${schedStore.listByStatus(['dispatched']).length}`)
  // ── 5b-2. 回执校验口径（2026-10-03 用户拍板：**只验产出存在，不验新鲜度**） ──
  // 真机事故：任务是「判断 uuid.txt 是否存在，存在就别动它」，agent 如实回执该文件，
  // 但文件本来就在、没被改写 ⇒ 旧「mtime > dispatched_at」闸判 output-stale 失败
  // ⇒ 用户看到的却是「文件明明在，为什么失败」。用户口径：只要交出来的文件**确实存在、格式对**
  // 就行；「是不是蒙混过关」不归插件判断 —— **任务做得好坏是大模型的事**。
  {
    const probeDir = mkdtempSync(join(tmpdir(), 'dsh-tdt-receipt-'))
    const oldFile = join(probeDir, 'uuid.txt')
    writeFileSync(oldFile, 'created long ago')
    // 把 mtime 压到一天前：模拟「本任务之前就存在、本次没被改写」的文件
    const longAgo = new Date(Date.now() - 86_400_000)
    utimesSync(oldFile, longAgo, longAgo)
    const mk = (outputs, status = 'ok') => ({ ts: new Date().toISOString(), detail: JSON.stringify({ status, outputs }) })
    check('回执校验：产出文件**存在即通过**（旧文件也算数，不再看 mtime）',
      checkReceipt(probeDir, ['ok'], mk(['uuid.txt'])).ok === true)
    check('回执校验：文件很旧（mtime 一天前）也通过 —— 本次修复点',
      checkReceipt(probeDir, ['ok'], mk(['uuid.txt'])).ok === true)
    check('回执校验：产出**不存在**才失败（output-missing）',
      checkReceipt(probeDir, ['ok'], mk(['nope.txt'])).reason === 'output-missing')
    check('回执校验：status 不在 validStatuses 仍判失败（agent 自报不可信，决策 11）',
      checkReceipt(probeDir, ['ok'], mk([], 'failed')).reason === 'receipt-status-invalid')
    check('回执校验：目录也算存在（回执允许报目录，与 deliverables 同语义）',
      checkReceipt(probeDir, ['ok'], mk(['./'])).ok === true)
    check('回执校验：空 outputs 通过（「确实执行了、没产出文件」是合法完成申报）',
      checkReceipt(probeDir, ['ok'], mk([])).ok === true)
    check('回执校验：无回执 ⇒ receipt-missing',
      checkReceipt(probeDir, ['ok'], undefined).reason === 'receipt-missing')
    check('回执校验：坏 JSON ⇒ receipt-unreadable（不静默放过）',
      checkReceipt(probeDir, ['ok'], { ts: '', detail: '{not json' }).reason === 'receipt-unreadable')
    rmSync(probeDir, { recursive: true, force: true })
  }
  // ── 5b-3. 裁决时机（2026-10-03 用户拍板：等会话**真正空闲**，不是 turn/end） ──
  // 起因：goal 模式下 agent 自动续跑多轮（宿主 kick 是 while (await this.turn())），
  // `turn/end` 只是**一轮**结束 ⇒ 在轮次间隙验收等于「人家还在干活就去收卷」。
  {
    const reconcileJs = readFileSync(join(process.cwd(), 'dist', 'reconcile.js'), 'utf8')
    check('裁决时机：turn/end 不再直接裁决，改挂 agent.whenIdle（会话真正空闲才验收）',
      reconcileJs.includes('settleWhenIdle') && reconcileJs.includes('whenIdle')
      && reconcileJs.includes('awaitingIdle') && reconcileJs.includes('agent/idle'))
    check('裁决时机：sweep 里 turn/end 只追究问、**不再 continue** 跳过租约兜底（否则卡死实例永久挂 running）',
      /signalType === ['"]turn\/end['"] && dueNudge/.test(reconcileJs)
      && /signalType === ['"]agent\/idle['"] \|\| signalType === ['"]session\/disposed['"]/.test(reconcileJs))
    const receiptJs = readFileSync(join(process.cwd(), 'dist', 'receipt.js'), 'utf8')
    check('回执提示词：**以最后一次提交为准** + 再次提交须带上先前的产出（工具描述与末段指令各一处）',
      receiptJs.includes('以最后一次提交为准') && receiptJs.includes('一并带上')
      && (receiptJs.match(/以最后一次提交为准/g) ?? []).length >= 2)
  }
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
  // 2026-09-30 口径变更（用户拍板）：工作区找不到属**任务级错误** ⇒ **当场写一条执行记录**
  //（终态 skipped ⇒ 永不重试；卡片立刻红、执行记录里看得见），不再是旧的「只记日志不建行」。
  // ⚠️ 门禁放宽后这里会有**两条** skipped：一条是「任务级错误」（task-error）、一条是补记紧邻前槽
  // （missed-slot，此前被"插件启动/任务创建"门禁挡掉）⇒ 断言要**按事件类型挑那条**，不能按数量。
  const noWsRows = noWsStore.listByStatus(['skipped'])
  const noWsErrRows = noWsRows.filter(r => noWsStore.countEvents(r.id, 'task-error') === 1)
  check('工作区找不到 ⇒ 当场写一条 skipped 执行记录（任务级错误）',
    noWsErrRows.length === 1 && noWsStore.listByStatus(['dispatched', 'pending', 'failed']).length === 0)
  check('工作区找不到 ⇒ 该记录挂原因事件（执行记录展开能看到为什么没跑）',
    noWsErrRows.length === 1 && noWsStore.countEvents(noWsErrRows[0].id, 'task-error') === 1)
  const logs = noWsStore.dumpTable('task_log', 500)
  check('工作区找不到 ⇒ 记 task_log(precondition)', logs.rows.some(l => l.kind === 'precondition'), JSON.stringify(logs.rows.map(l => l.kind)))
  noWsStore.close()
  // 一次性任务的**窗口闸门**（用户 2026-09-30 拍板 A）：`到期时刻 + window` 之内照旧补跑，出了窗口就**不跑**。
  // 配对断言：① 窗口内（迟到 1 分钟）⇒ 会派发（正例，同时证明这套 ctx / 工作区是可用的）；
  //           ② 出窗口（2020 年）⇒ 一条实例行都不建（不再无限期补跑，面板与调度器口径一致）。
  // ⚠️ `once` 的格式是 **"YYYY-MM-DDTHH:mm"**（不带秒 / 不带 Z），按 `timezone` 的墙上时间解释；
  // 写成 ISO（带 `.000Z`）会被 `checkedTask` 直接判非法 ⇒ 任务根本没进模型（断言会「假通过」）。
  const onceInWindowCfg = () => ({ ...okCfg(), tasksInline: JSON.stringify([{ id: UUID_A, title: '一次性(窗口内)', enabled: true, schedule: { once: new Date(Date.now() - 60_000).toISOString().slice(0, 16), timezone: 'UTC', window: 'PT4H' }, target: { workspace: 'Temp', prompt: 'x' } }]) })
  const onceOkStore = new TaskStore(join(schedDir, 'state-once-ok.db'))
  const onceOkReconciler = createReconciler({ ctx: okCtx, logger, store: onceOkStore, options: { leaseMs: 60_000, dispatchGraceMs: 60_000, unknownGraceMs: 300_000, config: onceInWindowCfg, legacyTask: () => undefined } })
  createScheduler({ ctx: okCtx, logger, store: onceOkStore, reconciler: onceOkReconciler, config: onceInWindowCfg }).tick()
  check('一次性任务在窗口内（迟到 1 分钟）⇒ 照旧补跑',
    onceOkStore.listByStatus(['dispatched', 'pending', 'running']).length === 1)
  const onceExpiredCfg = () => ({ ...okCfg(), tasksInline: JSON.stringify([{ id: UUID_A, title: '一次性(已过期)', enabled: true, schedule: { once: '2020-01-01T00:00', timezone: 'UTC', window: 'PT4H' }, target: { workspace: 'Temp', prompt: 'x' } }]) })
  const onceExpiredStore = new TaskStore(join(schedDir, 'state-once-expired.db'))
  const onceExpiredReconciler = createReconciler({ ctx: okCtx, logger, store: onceExpiredStore, options: { leaseMs: 60_000, dispatchGraceMs: 60_000, unknownGraceMs: 300_000, config: onceExpiredCfg, legacyTask: () => undefined } })
  createScheduler({ ctx: okCtx, logger, store: onceExpiredStore, reconciler: onceExpiredReconciler, config: onceExpiredCfg }).tick()
  // 出窗口 ⇒ **不派发**；门禁放宽后（用户 2026-09-30：「时间输错了、前面漏了多少次也补一条」）⇒
  // 它会留一条「过期未执行」的记录 —— 这正是要的效果：**不无声无息地消失**。
  // （此前"整个窗口都在进程/任务创建之前 ⇒ 不记"的分支由下面 `gate = expNow` 那条单测覆盖。）
  const onceExpiredRows = onceExpiredStore.listByStatus(['skipped'])
  check('一次性任务出窗口（2020 年）⇒ 不派发，但留一条「过期未执行」记录',
    onceExpiredStore.listByStatus(['dispatched', 'pending', 'running']).length === 0
    && onceExpiredRows.length === 1
    && onceExpiredStore.countEvents(onceExpiredRows[0].id, 'expired-once') === 1)
  // 一次性任务「过期未执行」记录（拍板 A 的配套）：本轮唯一新增逻辑，**集成测试几乎构造不出来**
  //（门禁要求 once 时刻晚于进程启动，而 once 精度只到分钟）⇒ 直接单测（该函数已导出）。
  {
    const { recordExpiredOnce } = await import('../dist/scheduler.js')
    const expDir = join(process.cwd(), '.smoke-expired-once')
    rmSync(expDir, { recursive: true, force: true })
    const expTask = { id: UUID_A, title: '一次性(过期记录)', enabled: true, schedule: { once: '2026-10-01T09:00', timezone: 'UTC', window: 'PT1H' }, target: { workspace: 'Temp', prompt: 'x' } }
    const expNow = Date.parse('2026-10-01T10:00:01.000Z') // 窗口 09:00–10:00 已过
    const expStore = new TaskStore(join(expDir, 'state.db'))
    const wrote = recordExpiredOnce(expStore, null, expTask, expNow, 0)
    const expRows = expStore.listByStatus(['skipped'])
    check('过期一次性任务 ⇒ 写一条 skipped + expired-once 事件 + 日志',
      wrote === true && expRows.length === 1
      && expStore.countEvents(expRows[0].id, 'expired-once') === 1
      && expStore.dumpTable('task_log', 20).rows.some(l => l.kind === 'expired-once'))
    check('过期一次性任务：再跑一轮 ⇒ 幂等（仍只 1 条，不重复写）',
      recordExpiredOnce(expStore, null, expTask, expNow, 0) === true
      && expStore.listByStatus(['skipped']).length === 1)
    const expStore2 = new TaskStore(join(expDir, 'state2.db'))
    check('过期一次性任务：**整个窗口都在进程启动之前**（停机期间错过）⇒ 不记',
      recordExpiredOnce(expStore2, null, expTask, expNow, expNow) === false
      && expStore2.listByStatus(['skipped']).length === 0)
    const expStore3 = new TaskStore(join(expDir, 'state3.db'))
    check('一次性任务还在窗口内 ⇒ 不记（下一步会照常派发）',
      recordExpiredOnce(expStore3, null, expTask, Date.parse('2026-10-01T09:30:00.000Z'), 0) === false
      && expStore3.listByStatus(['skipped']).length === 0)
    // 门禁**区分度**（二轮验收评审要求）：gate 落在窗口**之内**（进程在窗口内接管过）⇒ 出窗必须留痕。
    // 这条能区分正确判据 `once+window < gate` 与错误判据 `once < gate`（后者在这里会返回 false ⇒ 假绿）。
    const expStore4 = new TaskStore(join(expDir, 'state4.db'))
    check('过期一次性任务：进程在窗口内接管过（gate 落在窗口内）⇒ 出窗必须留痕',
      recordExpiredOnce(expStore4, null, expTask, expNow, Date.parse('2026-10-01T09:30:00.000Z')) === true
      && expStore4.listByStatus(['skipped']).length === 1)
    expStore4.close()
    expStore.close()
    expStore2.close()
    expStore3.close()
    rmSync(expDir, { recursive: true, force: true })
  }
  onceOkStore.close()
  onceExpiredStore.close()
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

  // ⚠️ 第二个参数此前是**字面 `true`** ⇒ 恒真、什么都没证明（构造若抛错会直接从 try 逃逸、脚本栈退出）。
  // 2026-09-30 复核点名，改为真跑一次构造（同文件别处的 try/catch 写法）。
  const openOk = (() => { try { new TaskStore(realPath).close(); return true } catch { return false } })()
  check('旧库打开不抛错（自动迁移成功）', openOk)
  const realStore = new TaskStore(realPath)
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
  // 2026-10-01：版本开关已并入统一 Segmented（id=dsh-tdt-ed-histtoggle，multiple 单段），旧 .dsh-tdt-ed-histtoggle-seg 类已删
  check('版本开关走统一 Segmented（id dsh-tdt-ed-histtoggle + 旧自绘类已删）', clientJs.includes('dsh-tdt-ed-histtoggle') && clientJs.includes('dsh-tdt-seg') && !clientJs.includes('dsh-tdt-ed-histtoggle-seg'))
  // 2026-10-01：版本条目「使用/移除」已收编基础层（使用 = Button link 档；移除 = IconButton danger），旧自绘类已删。
  check('版本条目 + 使用/移除钮走基础层（link 钮 + danger 图标钮；旧自绘类已删）',
    clientJs.includes('dsh-tdt-btn--link') && clientJs.includes('dsh-tdt-iconbtn--danger')
    && !clientJs.includes('dsh-tdt-ed-ver-use') && !clientJs.includes('dsh-tdt-ed-ver-del') && clientJs.includes('MarqueeText'))
  check('启用开关写回 Toast（--below 变体）', clientJs.includes('dsh-tdt-toast--below'))
  // 2026-10-01：前缀框红框已走 ui 基础层 `.dsh-tdt-pfx--error`（旧 `.dsh-tdt-ed-pfx--error` 已删）；下拉用 `.dsh-tdt-ed-field--error`。
  check('任务名称/下拉校验红框类（走 ui 基础层 .dsh-tdt-pfx--error）',
    clientJs.includes('dsh-tdt-pfx--error') && clientJs.includes('dsh-tdt-ed-field--error') && !clientJs.includes('dsh-tdt-ed-pfx--error'))
  check('启用实时写回走独立端点 tasks/enabled', dispatchJs.includes('tasks/enabled') || clientJs.includes('tasks/enabled'))
  // UX 第二轮·第三次返工（2026-09-30）：Toast 抽象共用（三色）+ 派发 ctx 读护栏
  check('浮层 Toast 共用组件 + 四档语义色（success/warning/neutral/error）',
    clientJs.includes('FloatingToast') && clientJs.includes('dsh-tdt-toast--success') && clientJs.includes('dsh-tdt-toast--warning') && clientJs.includes('dsh-tdt-toast--neutral'))
  check('派发 ctx 属性读取带防抛错护栏（readCtxProp，agentTeams/goals 未注入不再炸派发）', dispatchJs.includes('readCtxProp'))
  // 完全权限保存确认（2026-09-30）：勾选后确认钮才可点；确认钮沿用「保存」不改名
  check('完全权限保存确认弹窗（勾选门槛 + 确认钮沿用保存）',
    clientJs.includes('editorFullPermTitle') && clientJs.includes('editorFullPermCheck') && clientJs.includes('confirmLabel'))
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
  // 运行中不再跳倒计时（用户 2026-09-30）：NextPill 见 row.running 即改显「三个小方块脉动」活动指示；
  // 上一轮的「补跑时间」显示已撤（用户：根本不用判断补跑时间）。
  check('运行中改显活动指示（dsh-tdt-run-blocks + 动画），补跑时间显示已撤',
    clientJs.includes('dsh-tdt-run-blocks') && clientJs.includes('@keyframes dsh-tdt-run-block') && !clientJs.includes('listNextCatchupPrefix'))
  // 到点分支（决策 54 · P3a）：`diff <= 0`（该槽已到点且还没被处理）⇒ 也显活动指示，不再显示「即将执行」。
  // 此前**只有「运行中」分支有断言** ⇒ 到点分支零覆盖（正是「改动被静默丢掉」那类教训要防的）。
  check('到点分支也显活动指示（走 pinMsFor 算加载上界，不再写死魔数）',
    clientJs.includes('dueLoadingMs') && clientJs.includes('pinMsFor(currentTickMs'))
  // 决策 54 · P3b：超上界仍未派发 ⇒ 显「延期」（用户点名：卡片上不要再出现「即将执行」那句）。
  // ⚠️ 不能断言「bundle 里没有 relNow」——该键仍被 `relativePast`/`relativeFuture` 合法复用
  //（「刚刚」「N 分钟后」那几档）；这里只钉住新分支的文案键已进包。
  check('超上界改显「延期」（listDeferred 进包）', clientJs.includes('listDeferred'))
  // 用户 2026-09-30：卡片展开箭头误用了执行记录页的 `expandHint`（悬停冒出「展开该次执行的事件时间线」，
  // 与卡片实际展开的「任务设置」对不上）⇒ 撤掉该 title，另立 listExpandHint 作无障碍名。
  check('卡片展开箭头不再复用执行记录页的展开提示（title 不再挂 expandHint）',
    !clientJs.includes('title: t("expandHint")') && clientJs.includes('listExpandHint'))
  // ⚠️ 2026-09-30 复核教训：客户端内部逻辑不在冒烟覆盖面内，曾有编辑被静默丢掉（谁都没发现）。
  // 决策 54：到点钳位整套已删（抖动改由服务端冻结刻度解决）⇒ 这里改钉「它确实消失了」。
  check('到点钳位状态机已从客户端删除（bundle 里不再有 prunePins）',
    !clientJs.includes('prunePins'))
  // ⚠️ `justCrossedSlot` 此刻**仍留在 `task-sort.ts` 的导出里**（阶段三才删）⇒ 这里先不断言它的缺席。
  check('小时间隔反解与执行器同口径（守卫：分钟须具体数字 / 整点才等价「每隔 1 小时」）',
    clientJs.includes('/^\\d+$/.test(minute)') && clientJs.includes('minute === "0"'))
  // 轮询轮次令牌（2026-09-30 复核 P1）：看门狗把新一轮放出去时**旧轮仍在飞**，abort 只缩小窗口 ⇒
  // ① 认领数据也要验令牌（否则旧响应把旧数据盖回新数据上）；② 收口（清 busy / 补跑）只在令牌属于自己时做。
  check('轮询认领数据前验轮次令牌（旧轮不得覆盖新数据）',
    clientJs.includes('genRef.current !== myGen'))
  check('轮询收口只在令牌仍属本轮时执行（旧轮不得清掉新一轮的 busy）',
    clientJs.includes('if (genRef.current === myGen)'))
  // 2026-09-30 收尾：① 超时 fetch 收敛到**叶子模块** `./http`（静态 import ⇒ 被内联进单文件 bundle）；
  // ② 会话弹窗那条**全仓唯一没有超时**的请求补上；③ 轮询那条**刻意不合并**（要持有 controller 句柄）。
  check('超时 fetch 收敛到共用叶子模块（http.ts 已内联进 bundle）',
    clientJs.includes('fetchWithTimeout'))
  check('present.host 走超时封装（不再裸 fetch：端口一挂不再永久 pending）',
    clientJs.includes('fetchWithTimeout("/api/present.host"') && !clientJs.includes('fetch("/api/present.host"'))
  check('轮询那条仍持有 controller（卸载 abort 与超时是两种需求，刻意不合并）',
    clientJs.includes('inflight.add(controller)'))
  check('超时 fetch 默认 8s（< 10s 轮询间隔）+ finally 清定时器',
    clientJs.includes('DEFAULT_TIMEOUT_MS = 8e3') && clientJs.includes('clearTimeout(timer)'))
  // 悬浮文案必须与那一格**同一个 1 秒时钟**（用户 2026-09-30 真机：到点那一秒方块已切过来、
  // 文案还写着「下次执行：<刚过去的时间>」——因为它原先只在组件渲染时算一次，最长滞后一个轮询周期）。
  check('「下次执行」格的悬浮文案与方块同源（1 秒时钟驱动，不再滞后）',
    clientJs.includes('setNowMs(Date.now())'))
  // 2026-09-30 二轮评审：服务端事务（三条改动里**唯一零覆盖**的核心机制）必须真断言，
  // 否则「行 + 原因事件要么都在、要么都不在」随时会被静默改掉。
  {
    const txDir = join(process.cwd(), '.smoke-tx')
    rmSync(txDir, { recursive: true, force: true })
    const txStore = new TaskStore(join(txDir, 'state.db'))
    const txFalse = txStore.transaction(() => {
      txStore.ensureSkipped(randomUUID(), 'task-tx', '2026-09-30', '2026-09-30T19:00:00.000Z')
      return false
    })
    check('事务：fn 返回 false 仍 COMMIT（连接不会卡在事务里）',
      txFalse === false
      && txStore.listByStatus(['skipped']).some(o => o.task_id === 'task-tx')
      && txStore.transaction(() => true) === true)
    let txThrew = false
    try {
      txStore.transaction(() => {
        txStore.ensureSkipped(randomUUID(), 'task-tx2', '2026-09-30', '2026-09-30T19:01:00.000Z')
        throw new Error('boom')
      })
    } catch { txThrew = true }
    check('事务：抛异常 ⇒ ROLLBACK（半截行不留，且之后还能正常开事务）',
      txThrew === true
      && !txStore.listByStatus(['skipped']).some(o => o.task_id === 'task-tx2')
      && txStore.transaction(() => true) === true)
    txStore.close()
    rmSync(txDir, { recursive: true, force: true })
  }
  // 产物证据（防静默丢弃）：两条「写行 + 写原因」的服务端路径必须**真的**包在事务里。
  {
    const schedulerJs = readFileSync(join(process.cwd(), 'dist', 'scheduler.js'), 'utf8')
    check('调度器两处写行点已包事务（产物证据）',
      /const written = store\.transaction\(/.test(schedulerJs) && /const recorded = store\.transaction\(/.test(schedulerJs))
    check('runtime-index 的闸门抽成单点（产物证据：两个私有函数都在）',
      /latestDueSlotIso/.test(readFileSync(join(process.cwd(), 'dist', 'runtime-index.js'), 'utf8'))
      && /freezeOrAdvance/.test(readFileSync(join(process.cwd(), 'dist', 'runtime-index.js'), 'utf8')))
    // 新建任务的智能默认时刻（用户 2026-09-30）：单次执行 / 间隔锚点别再默认落在过去。
    // ⚠️ **必须带 `mode === "create"` 守卫这条断言**（2026-09-30 收口验收）：上一轮"编辑既有任务点档位
    // 被静默改时刻"的必修项，正是因为没钉住它才漏到验收轮才被发现。
    check('新建任务：切到「单次/间隔」时，时刻已过 ⇒ 换成「现在+1h 再取整点」（且**仅新建态**）',
      clientJs.includes('smartDefaultMoment') && clientJs.includes('isPastMoment')
      && clientJs.includes('setHours') && clientJs.includes('mode === "create" && isPastMoment'))
  }
  // 用户 2026-09-30 真机：选工作区文件报 422「附件 ref 非法」、无红框、文案看不懂。
  // 修法 = ① 选择器回调**工作区相对**路径；② 客户端兜底校验 + 归属附件卡描红；③ 服务端错误翻人话。
  check('附件 ref 改为工作区相对（选择器走 relativizeToRoot）', clientJs.includes('relativizeToRoot'))
  check('附件 ref 客户端兜底校验 + 人话文案', clientJs.includes('引用路径不合法'))
  // 排期人话**单源**（用户 2026-09-30 拍板：列表与编辑器不许各写一份，否则同一排期两处文案不一样）：
  // 两处都走 client/schedule-text.ts，旧的 cronToHuman 已删。
  check('排期文案单源（scheduleSpecFromSchedule + scheduleSpecFromDraft，旧 cronToHuman 已删）',
    clientJs.includes('scheduleSpecFromSchedule') && clientJs.includes('scheduleSpecFromDraft') && !clientJs.includes('cronToHuman'))
  check('排期文案支持样式参数（scheduleSegments 片段 + emphasis 标记）',
    clientJs.includes('scheduleSegments') && clientJs.includes('emphasis'))
  check('排期反解读结构化 ui（老任务才退回 cron）', clientJs.includes('ui.weekdays'))
  // 列表启用开关与编辑器同款（官方默认选中色是 brand-primary ⇒ 亮色近黑 / 暗色近白，两处看着不一样）。
  // 2026-10-01：列表与编辑器启用开关共用 `.dsh-tdt-switch` 包装类（选中 success 绿）；空壳 `dsh-tdt-tl-switchwrap` 已删。
  check('列表启用开关与编辑器同款（共用 .dsh-tdt-switch，选中 success 绿）',
    clientJs.includes('dsh-tdt-switch') && clientJs.includes('--tdt-success') && !clientJs.includes('dsh-tdt-tl-switchwrap'))
  // 右上角刷新按钮已撤（用户 2026-09-30：反正改完立刻刷新，按钮没用）。
  check('右上角刷新按钮已移除（不再有 debugRefresh 按钮）', !clientJs.includes('title: t("debugRefresh")'))
  // 保存后乐观补行 ⇒ 改完**立刻**可见，不等服务端那 ~1 秒的落盘 + 重拉。
  check('保存后乐观补行（patchRow + rowPatchOf）',
    clientJs.includes('patchRow') && clientJs.includes('rowPatchOf'))
  // 时间显示一律两位（用户 2026-09-30：「都把它补成两位」）——补零收敛到共用 pad2，时间戳显式拼秒。
  check('时间显示一律两位（共用 pad2 + formatDateTime 拼秒，不再用 toLocaleString）',
    clientJs.includes('function pad2') && clientJs.includes('function formatDateTime') && !clientJs.includes('toLocaleString('))
  // 展示名与图标（用户 2026-09-30 拍板：名字用「定时任务调度器」，图标用 assets/icon-scheduler.svg）。
  check('面板 / 侧栏展示名 = 定时任务调度器', clientJs.includes('定时任务调度器'))
  check('侧栏图标 = 用户指定的调度器图标（方括号 + 红 S 方块，内联进 bundle）',
    clientJs.includes('M19 16 H9 V112 H19') && clientJs.includes('#E03E3E'))
  check('倒计时等宽数字（tabular-nums ⇒ 不左右蹦）', clientJs.includes('tabular-nums'))
  check('无下次执行占位符 = `--`（图标保留，不再 `--:--`）', !clientJs.includes('--:--') && clientJs.includes('const NO_TIME = "--"'))
  // 用户 2026-09-30 / 2026-10-03：展开区「太丑了」——从「一句 `·` 串联的长文本」改成逐字段成行，
  // 再于 2026-10-03 改版为「左配置 + 右最近执行」两栏纸表格。
  check('展开区为标签/值网格（InfoField + 纸表格网格）',
    clientJs.includes('InfoField') && clientJs.includes('infoGridRowStyle') && clientJs.includes('infoGridLabelStyle'))
  check('基础信息改版：左配置 + 右「上次执行」（状态/完成时间/耗时/Token/备注），且不再展示提示词',
    clientJs.includes('infoSectionConfig') && clientJs.includes('infoLastRun')
    && clientJs.includes('infoNoRun') && clientJs.includes('infoFinishedAt')
    // 提示词从展开区移除（字段本身仍在数据类型里，但不再被渲染）。
    && !clientJs.includes('row.promptHead'))
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
  check('md 两态：渲染视图 ⇄ 源码 已迁统一 Segmented（顶栏按钮组，不飘进内容区；旧自绘 sv-seg / 浮层 mdbar·mdwrap 已删）',
    clientJs.includes('previewSource') && clientJs.includes('previewRender')
      && !clientJs.includes('dsh-tdt-sv-seg') && !clientJs.includes('dsh-tdt-sv-seg-btn')
      && !clientJs.includes('dsh-tdt-sv-preview-mdbar')
      && !clientJs.includes('dsh-tdt-sv-preview-mdwrap'))
  check('顶栏按钮组（复制 / 刷新 / 关闭，图标钮无中文）',
    clientJs.includes('dsh-tdt-sv-head-btn') && clientJs.includes('previewRefresh')
      && clientJs.includes('previewCopyPath') && clientJs.includes('IconRefreshOutlineRegular'))
  check('拖拽条高亮 = 6px 浅色半透明带（与任务抽屉 .dsh-tdt-ed-resizer 同款，2026-09-29 改版；不再变纯白线）',
    clientJs.includes('dsh-tdt-sv-resizer')
      && clientJs.includes('dsh-tdt-sv-resizer:hover{background:var(--tdt-hover')
      && clientJs.includes('dsh-tdt-sv-resizer:active{background:var(--tdt-hover')
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
  // U21 起右侧可有两条 dock（预览 + 编辑），让位宽度改成两者之和。
  check('弹窗让位右侧 dock（overlay right = 预览宽 + 编辑宽，弹窗不遮盖任何一条）',
    clientJs.includes('right:calc(var(--dsh-tdt-preview-w,0px) + var(--dsh-tdt-editor-w,0px))'))
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
  // 2026-10-02：三下拉改**定宽**（工作区/模型 = 180 = 权限 120 的 1.5 倍），不再随选项自适应。
  check('提示词下三下拉全部定宽（权限 120 基准，工作区 / 模型各 180；不再 maxWidth 自适应）',
    clientJs.includes('180px') && clientJs.includes('120px') && !/maxWidth:\s*200/.test(clientJs)
    && clientJs.includes('marquee: true') && clientJs.includes('dsh-tdt-mq-in'))
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
  // 用户 2026-09-30：回执说明必须**压过任务指令**（真机上「不要做任何其他操作」被理解成连回执也跳过），
  // 且要**置顶**（不首尾各放）。文案里用通用说法，不举具体那句误写的任务指令。
  // 2026-09-30 拍板（**推翻**旧结构"置顶 + 不首尾各放"）：回执段**只在最末出现一处** ——
  // 真机证据是「模型跳过第 1 段、却对只含回执要求的追问立刻照做」⇒ 末段 + 只讲这一件事才被遵守。
  {
    const text = msgNoDep.content[0].text
    const marker = '【回执·唯一权威段】'
    const iReceipt = text.indexOf(marker)
    check('回执说明只在**最末**出现一处 + 含冲突裁决与「本轮回复结束前」',
      iReceipt > text.indexOf('任务实例：')            // 在任务内容之后
      && text.indexOf(marker, iReceipt + 1) === -1     // 全消息只此一处（不再首尾重复）
      && text.includes('冲突裁决') && text.includes('本轮回复结束前'))
  }
  const msgUndeclared = buildMessage({
    ...snapWithDeps,
    resolvedDeps: [{ task: 'D', semantics: 'latest_success', instanceId: upId, scheduledAt: '2026-09-26T12:30:00.000Z', sessionId: null, workspacePath: null, outputs: [] }],
  }, '/ws/down', '2026-09-26')
  check('上游未声明产出 ⇒ 消息如实标注（决策 43）', msgUndeclared.content[0].text.includes('未声明产出'))
  // 随附文件段（2026-09-30 真机需求）：附件必须**明确告诉模型在哪一层** —— 逐条给绝对路径；
  // upload 型落在任务目录（工作区之外）⇒ 必须同时给权限豁免，否则会被「仅工作区」的指令挡掉。
  {
    const msgAtt = buildMessage(snapNoDeps, '/ws/down', '2026-09-26', false, [
      { name: 'nv.html', kind: 'upload', ref: 'attachments/nv.html', path: '/data/tasks/T1/attachments/nv.html' },
      { name: 'cfg.json', kind: 'link', ref: 'conf/cfg.json', path: '/ws/up/conf/cfg.json' },
      { name: 'gone.json', kind: 'link', ref: 'gone.json', path: null },
    ])
    const attText = msgAtt.content[0].text
    check('随附文件段：逐条注入绝对路径 + 标注来源（上传 / 工作区）',
      attText.includes('本次随附文件') && attText.includes('/data/tasks/T1/attachments/nv.html')
      && attText.includes('/ws/up/conf/cfg.json') && attText.includes('（上传）') && attText.includes('（工作区）'))
    check('随附文件段：基准工作区解析不出 ⇒ 如实标注，绝不猜路径',
      attText.includes('gone.json') && attText.includes('基准工作区未知'))
    check('随附文件段：无附件时整段不注入（旧行为不变）', !msgNoDep.content[0].text.includes('本次随附文件'))
    check('随附文件 + 权限指令：显式豁免「仅工作区」（只放开读）',
      buildMessage({ ...snapNoDeps, permission: 'workspace' }, '/ws/down', '2026-09-26', false, [
        { name: 'nv.html', kind: 'upload', ref: 'attachments/nv.html', path: '/data/nv.html' },
      ]).content[0].text.includes('不受本条权限指令里「仅在目标工作区内」的限制'))
  }
  // 任务文件上下文（2026-10-03 拍板「附加文件走 A」）：随附文件除文本路径外，另发**官方 file 内容块**
  // ⇒ 官方界面渲染成附件卡、fork 续聊带得走、当时那份内容被钉住。**任何一步失败都不阻塞派发**。
  {
    const attRoot = mkdtempSync(join(tmpdir(), 'dsh-tdt-att-'))
    const fileA = join(attRoot, 'a.md')
    writeFileSync(fileA, 'hello')
    mkdirSync(join(attRoot, 'sub'))
    const warnLogs = []
    const logger = { warn: (line) => { warnLogs.push(String(line)) }, info: () => {}, error: () => {} }
    const store = {
      saveFile: async ({ data, name }) => ({ attachmentId: `sha256:${data.length}`, name: name ?? '', bytes: data.length }),
    }
    const one = [{ name: 'a.md', kind: 'upload', ref: 'attachments/a.md', path: fileA }]
    // ① 宿主未暴露 ctx.attachments ⇒ 降级空数组 + 告警，不抛（旧行为不变）
    const none = await attachmentFileBlocks({}, one, logger, 'i-1')
    check('file 块：宿主无附件服务 ⇒ 降级为空（只给路径），不抛',
      none.length === 0 && warnLogs.some(line => line.includes('attachment-store-unavailable')))
    // ② 正常路径：拿到官方附件引用（引用里**没有路径**，只有 id / 名字 / 字节数）
    const ok = await attachmentFileBlocks({ attachments: store }, one, logger, 'i-1')
    check('file 块：正常注册 ⇒ { type:"file", attachment:{ attachmentId, name, bytes } }',
      ok.length === 1 && ok[0].type === 'file' && ok[0].attachment.bytes === 5
      && ok[0].attachment.name === 'a.md' && typeof ok[0].attachment.attachmentId === 'string')
    // ③ 目录**不是**附件（官方附件 = 一段字节）⇒ 跳过；path 解析不出（null）⇒ 跳过
    const skipped = await attachmentFileBlocks({ attachments: store }, [
      { name: 'sub', kind: 'link', ref: 'sub/', path: join(attRoot, 'sub') },
      { name: 'gone', kind: 'link', ref: 'gone.md', path: null },
      { name: 'missing', kind: 'link', ref: 'no.md', path: join(attRoot, 'no.md') },
    ], logger, 'i-1')
    check('file 块：目录 / 路径为空 / 文件已不在盘 ⇒ 跳过，不进附件库', skipped.length === 0)
    // ④ saveFile 抛错 ⇒ 该附件跳过（其余不受影响），派发照常
    const boom = await attachmentFileBlocks({ attachments: { saveFile: async () => { throw new Error('backend down') } } }, one, logger, 'i-1')
    check('file 块：saveFile 抛错 ⇒ 只跳过该附件并留痕，不阻塞派发',
      boom.length === 0 && warnLogs.some(line => line.includes('attachment-block-failed')))
    // ⑤ 消息结构：文本块在前、file 块在后（官方按 content 顺序渲染 ⇒ 气泡正文 + 下方附件卡）
    const msgBlocks = buildMessage(snapNoDeps, '/ws/down', '2026-09-26', false, one, ok)
    check('file 块：随派发消息发出，text 块在前、file 块在后',
      msgBlocks.content.length === 1 + ok.length && msgBlocks.content[0].type === 'text'
      && msgBlocks.content.slice(1).every(block => block.type === 'file'))
    check('file 块：不带附件时消息仍是单文本块（旧行为不变）',
      buildMessage(snapNoDeps, '/ws/down', '2026-09-26').content.length === 1)
  }
  // 顶部输入区（2026-10-03）产物证据：服务端下发的附件路径字段 + 客户端面板与文案键都在发布物里。
  {
    const server = readFileSync(join(process.cwd(), 'dist', 'index.js'), 'utf8')
    const client = readFileSync(join(process.cwd(), 'dist', 'client.js'), 'utf8')
    check('顶部输入区：服务端解析附件绝对路径（upload 走任务目录 / link 走来源工作区）',
      server.includes('attachmentPaths') && server.includes('attachmentAbsPath')
      && server.includes('isSafeAttachmentRef'))
    check('顶部输入区：附件卡去重不让整条用户消息消失（hadFiles 判空）', client.includes('hadFiles'))
    check('顶部输入区：文案走带占位符插值的 tt（宿主 t 不做 {count} 替换）',
      client.includes('data-task-file-context') && !client.includes('svUpstream'))
    check('顶部输入区：客户端面板与文案键进产物（接收 / 随附 / 折叠 / 来源标记）',
      client.includes('dsh-tdt-sv-tfc') && client.includes('tfcReceived') && client.includes('tfcAttached')
      && client.includes('tfcMore') && client.includes('tfcMoreTasks') && client.includes('tfcNoOutputs'))
    check('顶部输入区：左右不自带 padding（靠 frame 的 34 与下方会话正文同基线，避免双重缩进）；自身上 padding 归 0、下 18',
      client.includes('padding:0 0 18px'))
    check('顶部输入区：**不自带滚动条**（已搬进 column 内与会话同滚，全弹窗只一个滚动条；用户 2026-10-03）',
      !/\.dsh-tdt-sv-tfc\{[^}]*max-height/.test(client)
      && !/\.dsh-tdt-sv-tfc\{[^}]*overflow-y/.test(client)
      && /ChatViewFrame,\s*\{[\s\S]{0,400}TaskFileContextPanel/.test(client))
    check('顶部输入区：抵消 column 兄弟间距（顶部区自带 padding-bottom，紧随的消息不再加 margin-top）',
      client.includes('dsh-tdt-sv-tfc~:not([hidden]):not(.dsh-tdt-sv-flowitem:empty){margin-top:0;}'))
    check('顶部输入区：文件**横向排**（用户 2026-10-03 二次点名「不能竖着一溜」）+ 组间细线分隔',
      client.includes('.dsh-tdt-sv-tfc-files{flex-direction:row;flex-wrap:wrap')
      && !client.includes('.dsh-tdt-sv-tfc-files{flex-direction:column')
      && client.includes('.dsh-tdt-sv-tfc-group+.dsh-tdt-sv-tfc-group{border-top'))
    check('顶部输入区：chip **按内容宽**（flex:0 0 auto、**无最小宽度**）+ label 40ch 上限（用户三次点名）',
      client.includes('min-width:0;max-width:100%') && client.includes('flex:0 0 auto;display:flex')
      && !client.includes('min-width:10ch') && client.includes('max-width:40ch'))
    check('主界面「基础信息 · 附加文件」文件名**同样限宽 40ch**（原先完全不限，超长撑爆整行）',
      /maxWidth:\s*["']40ch["']/.test(client) && /textOverflow:\s*["']ellipsis["']/.test(client))
    check('顶部输入区：文件名跑马灯走全站唯一实现 MarqueeText（不自己造第二套）',
      client.includes('MarqueeText') && client.includes('dsh-tdt-sv-tfc-label{min-width:0;max-width:40ch;flex:0 1 auto;}'))
    check('顶部输入区：前置任务标记 = **宽高相等的方块序号**，字号与基础信息「前置任务」行同源（var(--tdt-font-sm)）',
      client.includes('dsh-tdt-sv-tfc-seq') && client.includes('width:16px;height:16px;padding:0;border-radius:4px')
      && client.includes('font-size:var(--tdt-font-sm)') && client.includes('String(index + 1)')
      && !client.includes('dsh-tdt-sv-tfc-taskbar'))
    check('顶部输入区：序号块亮度 = chip-bg 底 + fg-2 字（比 plate/fg-3 亮一档、且非纯白）',
      /background:\s*var\(--tdt-chip-bg/.test(client) && /color:\s*var\(--tdt-fg-2/.test(client)
      && !/\.dsh-tdt-sv-tfc-seq\{[^}]*--tdt-plate/.test(client))
    check('顶部输入区：附件 >10 个才折叠（10 个以下全显示；用户 2026-10-03）',
      client.includes('COLLAPSE_FILES = 10') || /const COLLAPSE_FILES = 10/.test(client))
    check('顶部输入区：来源 / 状态标记方括号**前置**（[链接]foo.md），不再挂右侧像按钮',
      client.includes('dsh-tdt-sv-tfc-namewrap') && client.includes('dsh-tdt-sv-tfc-note'))
    check('顶部输入区：前置任务一排两个（窄容器降一列，用容器宽度判据）',
      client.includes('grid-template-columns:repeat(2,minmax(0,1fr))')
      && client.includes('container-type:inline-size') && client.includes('@container (width<=620px)'))
    check('顶部输入区：两种竖线**都已去掉**（块前 3px 跨两行线 + 任务名前 4px 短线），只留序号块',
      !client.includes('dsh-tdt-sv-tfc-task::before')
      && !client.includes('padding-left:10px')
      && !client.includes('dsh-tdt-sv-tfc-taskbar'))
    check('顶部输入区：前置任务序号按**显示顺序** 1、2、3…（折叠/展开不跳号）',
      client.includes('dsh-tdt-sv-tfc-seq') && client.includes('String(index + 1)'))
    check('顶部输入区：组标题叫「任务附件」；来源标记与编辑处统一为「上传 / 链接」（不查引号形式，只查文案）',
      client.includes('任务附件 · {count} 个文件')
      && /tfcFromWorkspace:\s*["']链接["']/.test(client)
      && /tfcFromUpload:\s*["']上传["']/.test(client))
    check('顶部输入区：两列降级不得靠视口宽度（弹窗会被分栏挤窄）',
      !client.includes('@media') || !client.includes('dsh-tdt-sv-tfc-tasks{grid-template-columns:minmax(0,1fr)}\n}'))
    check('顶部输入区：目录走官方文件夹图标（FileTypeIcon 按扩展名分类，尾斜杠拿不到 folder）',
      client.includes('IconFolderCloseRegular'))
    check('顶部输入区：跨区目录 / 未解析路径降级不可点（data-noclick 淡一档）',
      client.includes('data-noclick') && client.includes('.dsh-tdt-sv-tfc-file[data-noclick]{opacity:.6;}'))
    // 会话区纵向间距：官方类命中与否必须一致（2026-10-03 修 18px 跳变）。
    check('会话区纵向单一真源：frame 钩子独占上下（17/17 减半）+ scroll 钩子归零官方纵向（双类名压过 CSS module）',
      client.includes('.dsh-tdt-sv-frame.dsh-tdt-sv-frame{padding-top:17px;padding-bottom:17px;}')
      && client.includes('.dsh-tdt-sv-scroll.dsh-tdt-sv-scroll{padding-top:0;padding-bottom:0;}'))
    check('会话区：body 兜底类不再抢纵向 padding（曾盖掉 frame 补足 ⇒ 差 18px）',
      !client.includes('.dsh-tdt-sv-body{flex:1;min-height:0;overflow:auto;padding:16px'))
    check('卡片创建时间：挂标题行尾部（同一 faintStyle）+ 四位年 YYYY-MM-DD，第三行不再单起',
      client.includes('listCreatedTag') && client.includes('formatYmd')
      && !client.includes("dateOf(iso: string)"))
    check('卡片创建时间：**每个任务都有这一行**（老定义缺 createdAt 显示占位，不整段消失、也不编造时间）',
      client.includes('listCreatedUnknown') && client.includes('创建时间未知'))
    check('筛选角标：**正圆**（固定 16×16 + border-radius 50%，多位数字不再撑成椭圆）',
      client.includes('border-radius:50%;background:var(--tdt-danger)')
      && !client.includes('min-width:16px;height:16px;padding:0 4px'))
    // 术语：界面一律叫「前置任务」（用户 2026-10-03）。⚠️ 只断言**产物里出现给用户看的文案**，
    // 源码内部术语（resolvedDeps / upstream 字段 / BLOCK_KIND 的 key）沿用既有决策 43 的叫法，不动。
    check('文案术语统一：界面叫「前置任务」不叫「上游任务」（顶部区 / 分区标题 / 延期原因 / 阻塞原因）',
      client.includes('前置任务') && !client.includes('上游任务')
      && client.includes('Preceding tasks') && !client.includes('Upstream tasks')
      && !client.includes('upstream task'))
  }
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

  // 2026-09-30（决策 54）：刻度过期**但该槽还没被处理、且仍在窗口内** ⇒ **冻结不前移**
  // —— 这是「排序键不随读变化」的关键（否则到点瞬间键跳大 ⇒ 卡片掉下去、running 翻转又跳回来）。
  const frozen = idx.overview([taskA, taskB], Date.parse('2026-09-02T10:00:00.000Z'))
  check('overview：刻度过期但未处理且在窗口内 ⇒ 冻结不前移（键稳定 ⇒ rev 也不用变）',
    frozen.rows.find(r => r.id === 'task-a')?.nextSlotAt === '2026-09-02T09:00:00.000Z'
    && frozen.rev === revBefore)
  // 阻塞原因透出（决策 54 · P3b）：`markBlocked` 把「这一槽被什么挡住」写进运行态、随行下发，
  // 供卡片「延期」悬浮说明用。**边沿触发** ⇒ 值没变不 bump（否则每 tick 整份重发，unchanged 报废）。
  {
    // ⚠️ rev 从 `overview()` 的返回里取（`idx.rev` 不是公开属性；`runtime-index` 只把它随 overview 吐出）。
    const revBeforeBlocked = idx.overview([taskA, taskB], Date.parse('2026-09-02T10:00:00.000Z')).rev
    const reason = '附加文件不存在：nv.html'
    idx.markBlocked('task-a', reason)
    const blocked = idx.overview([taskA, taskB], Date.parse('2026-09-02T10:00:00.000Z'))
    check('阻塞原因：写进行 + 边沿 bump 一次',
      blocked.rows.find(r => r.id === 'task-a')?.blockedReason === reason && blocked.rev === revBeforeBlocked + 1)
    idx.markBlocked('task-a', reason)
    check('阻塞原因：同值重复写不 bump（unchanged 优化不被打破）',
      idx.overview([taskA, taskB], Date.parse('2026-09-02T10:00:00.000Z')).rev === revBeforeBlocked + 1)
    idx.markBlocked('task-a', null)
    check('阻塞原因：放行时清空（行里回到 null）',
      idx.overview([taskA, taskB], Date.parse('2026-09-02T10:00:00.000Z')).rows.find(r => r.id === 'task-a')?.blockedReason === null)
  }
  // 该槽被处理（有实例行）⇒ 正常前移。
  idx.markDispatched('task-a', '2026-09-02T09:00:00.000Z')
  const moved = idx.overview([taskA, taskB], Date.parse('2026-09-02T10:00:00.000Z'))
  check('overview：该槽已处理 ⇒ 就地前移 + rev 变化',
    moved.rows.find(r => r.id === 'task-a')?.nextSlotAt === '2026-09-03T09:00:00.000Z' && moved.rev !== revBefore)

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

// ── 任务卡片三面板数据通道（决策 55）：过滤 + 游标分页 + 按任务隔离 ──
{
  const dir = join(root, 'panels-db')
  const store = new TaskStore(join(dir, 'state.db'))
  // 两个任务各 3 条实例（交错时刻）⇒ 验「按任务隔离」不串；A 的前两条带事件。
  const idA1 = randomUUID()
  store.ensureInstance(idA1, 'panel-a', '2026-09-01', '2026-09-01T08:00:00.000Z', 'succeeded')
  const idA2 = randomUUID()
  store.ensureInstance(idA2, 'panel-a', '2026-09-02', '2026-09-02T08:00:00.000Z', 'failed')
  store.ensureInstance(randomUUID(), 'panel-a', '2026-09-03', '2026-09-03T08:00:00.000Z', 'skipped')
  store.ensureInstance(randomUUID(), 'panel-b', '2026-09-02', '2026-09-02T09:00:00.000Z', 'succeeded')
  store.ensureInstance(randomUUID(), 'panel-b', '2026-09-03', '2026-09-03T09:00:00.000Z', 'pending')
  store.ensureInstance(randomUUID(), 'panel-b', '2026-09-04', '2026-09-04T09:00:00.000Z', 'running')
  // appendLog 的 ts = 写入时刻（非 scheduledAt）⇒ 后写的 seq 更大、排在更前。
  store.appendLog({ taskId: 'panel-a', scheduledAt: '2026-09-02T08:00:00.000Z', level: 'error', kind: 'missed-slot', message: '附件 nv.html 不见了' })
  store.appendLog({ taskId: 'panel-a', scheduledAt: '2026-09-03T08:00:00.000Z', level: 'info', kind: 'dep_blocked', message: '等上游成功' })
  store.appendLog({ taskId: 'panel-b', scheduledAt: '2026-09-04T09:00:00.000Z', level: 'warn', kind: 'stale-upstream', message: '复用旧产出' })
  store.appendEvent(idA1, 'state_change', { to: 'succeeded' })
  store.appendEvent(idA1, 'receipt', { ok: true })
  store.appendEvent(idA2, 'state_change', { to: 'failed' })

  check('三面板·执行记录按任务隔离（A 只见 A 的 3 条，不串 B）',
    store.listInstancesByQuery({ taskId: 'panel-a' }).rows.length === 3
    && store.listInstancesByQuery({ taskId: 'panel-a' }).rows.every(r => r.task_id === 'panel-a'))
  check('三面板·执行记录排序 scheduled_at DESC（最新在前）',
    JSON.stringify(store.listInstancesByQuery({ taskId: 'panel-a' }).rows.map(r => r.scheduled_at.slice(0, 10)))
      === JSON.stringify(['2026-09-03', '2026-09-02', '2026-09-01']))
  check('三面板·limit 取最新 N，剩余才给 nextCursor',
    (() => {
      const p = store.listInstancesByQuery({ taskId: 'panel-a', limit: 2 })
      return p.rows.length === 2 && p.nextCursor !== null
        && p.rows[0].scheduled_at === '2026-09-03T08:00:00.000Z'
    })())
  check('三面板·cursor 翻页接续不重不漏（末页无游标）',
    (() => {
      const p1 = store.listInstancesByQuery({ taskId: 'panel-a', limit: 2 })
      const p2 = store.listInstancesByQuery({ taskId: 'panel-a', limit: 2, cursor: p1.nextCursor ?? '' })
      return p2.rows.length === 1 && p2.nextCursor === null
        && p2.rows[0].scheduled_at === '2026-09-01T08:00:00.000Z'
    })())
  check('三面板·状态过滤（failed + skipped）',
    store.listInstancesByQuery({ taskId: 'panel-a', statuses: ['failed', 'skipped'] }).rows.length === 2)
  check('三面板·时间范围过滤（只 09-02 当天）',
    store.listInstancesByQuery({ taskId: 'panel-a', fromTs: '2026-09-02T00:00:00.000Z', toTs: '2026-09-02T23:59:59.999Z' }).rows.length === 1)
  // 会话弹窗取数（2026-10-03）：**只认会话 id** —— 所有入口只传 sessionId，弹窗据此自取快照 / 产出
  // ⇒ 从任务列表 / 老界面执行记录 / 接收区「查看该会话」进，渲染必须一致（用户抓出过两处不一致）。
  {
    // 独立任务 + 独立实例：不碰上面那些按条数断言的用例。
    const idS = randomUUID()
    const sessS = `sess-${idS}`
    store.ensureInstance(idS, 'panel-sess', '2026-09-05', '2026-09-05T08:00:00.000Z', 'succeeded')
    store.transition(idS, { status: 'succeeded', session_id: sessS })
    check('会话弹窗取数：按 sessionId 精确命中那一条实例行',
      store.listInstancesByQuery({ sessionId: sessS, limit: 1 }).rows.length === 1
      && store.listInstancesByQuery({ sessionId: sessS, limit: 1 }).rows[0].id === idS)
    check('会话弹窗取数：未知 sessionId ⇒ 空（调用方照常开弹窗，只少产出卡 / 接收区）',
      store.listInstancesByQuery({ sessionId: 'no-such-session', limit: 1 }).rows.length === 0)
  }
  check('三面板·不存在的任务 = 空态（空 rows + 无游标）',
    (() => {
      const p = store.listInstancesByQuery({ taskId: 'no-such-task' })
      return p.rows.length === 0 && p.nextCursor === null
    })())
  check('三面板·workspace 过滤走 taskIds（全量 6 条 / 单工作区只见该区）',
    store.listInstancesByQuery({ taskIds: ['panel-a', 'panel-b'] }).rows.length === 6
    && store.listInstancesByQuery({ taskIds: ['panel-b'] }).rows.every(r => r.task_id === 'panel-b'))
  check('三面板·日志按任务隔离 + ts DESC（A 只见 A 的 2 条，最新在前）',
    (() => {
      const p = store.listLogsByQuery({ taskId: 'panel-a' })
      return p.rows.length === 2 && p.rows[0].kind === 'dep_blocked' && p.rows[1].kind === 'missed-slot'
    })())
  check('三面板·日志关键字过滤（message LIKE）',
    (() => {
      const p = store.listLogsByQuery({ taskId: 'panel-a', keyword: '附件' })
      return p.rows.length === 1 && p.rows[0].kind === 'missed-slot'
    })())
  check('三面板·日志级别过滤（只 error）',
    store.listLogsByQuery({ taskId: 'panel-a', levels: ['error'] }).rows.length === 1)
  check('三面板·事件时间线按实例精确取且 seq 升序',
    (() => {
      const ev1 = store.listEventsByInstance(idA1)
      const ev2 = store.listEventsByInstance(idA2)
      return ev1.length === 2 && ev1[0].seq < ev1[1].seq && ev2.length === 1
    })())
  check('三面板·产物证据：路由 / 查询方法 / 客户端通道与文案键都在发布物里',
    readFileSync(join(process.cwd(), 'dist', 'index.js'), 'utf8').includes('/tasks/instances')
    && readFileSync(join(process.cwd(), 'dist', 'index.js'), 'utf8').includes('/tasks/log')
    && readFileSync(join(process.cwd(), 'dist', 'index.js'), 'utf8').includes('/tasks/events')
    && readFileSync(join(process.cwd(), 'dist', 'store.js'), 'utf8').includes('listInstancesByQuery')
    && readFileSync(join(process.cwd(), 'dist', 'store.js'), 'utf8').includes('listLogsByQuery')
    && readFileSync(join(process.cwd(), 'dist', 'store.js'), 'utf8').includes('listEventsByInstance')
    && (() => {
      const client = readFileSync(join(process.cwd(), 'dist', 'client.js'), 'utf8')
      return client.includes('fetchInstances') && client.includes('fetchLogs') && client.includes('fetchEvents')
        && client.includes('cardTabInfo') && client.includes('cardTabRecords') && client.includes('cardTabLogs')
        && client.includes('cardDeleteDesc') && client.includes('cardRecordsEmpty') && client.includes('cardRecordsEmptyFiltered') && client.includes('cardLogsEmpty')
    })())
  // 2026-10-02 真机 404 根因回归钉：宿主 webServer 对重复 (kind, path) 注册 throw
  // （dsh-host-webserver lib/index.js register）⇒ /config 的 GET+POST 必须合一条路由
  // （重复注册会把循环打断、其后路由全部 404），且注册循环必须逐条容错。
  check('三面板·404 根因回归：/config 只注册一条（GET/POST 合一），注册循环逐条容错',
    (() => {
      const host = readFileSync(join(process.cwd(), 'dist', 'index.js'), 'utf8')
      return host.split('api/task-dispatch-table/config').length - 1 === 1
        && host.includes('路由注册失败')
    })())
  check('三面板·状态短名走单源 statusTextOf（zh 词典与七态映射都在 bundle，两字短名）',
    (() => {
      const client = readFileSync(join(process.cwd(), 'dist', 'client.js'), 'utf8')
      // 2026-10-02 用户改两字短名：排队/派发/运行/成功/失败/跳过/未知。
      // （「执行中」仍出现在源码注释里，反断言只针对词典旧值「待执行」。）
      return client.includes('statusTextOf') && client.includes('statusPending') && client.includes('排队')
        && client.includes('跳过') && !client.includes('待执行')
    })())

  // ── 15. UI 基础层 P0：token 层（--tdt-*）与唯一样式注入入口 ──
  // 本期的验收口径：地基进产物、变量名/取值按宿主 0.2.0-rc.2 核实结果直绑、明暗差异只有一处、
  // 注入入口唯一；**且界面零变化**（此时还没有任何规则消费 --tdt-*）。
  console.log('\n[15] UI 基础层 P0（token 层 + 统一样式入口）')
  {
    const uiJs = readFileSync(join(process.cwd(), 'dist', 'client.js'), 'utf8')
    const countOf = (needle) => uiJs.split(needle).length - 1
    check('token 表已打进产物（文字 / 面 / 两档控件高度）',
      uiJs.includes('--tdt-fg:') && uiJs.includes('--tdt-surface-sunken:')
      && uiJs.includes('--tdt-control-h-sm:24px') && uiJs.includes('--tdt-control-h-md:28px'))
    check('token 直绑宿主真变量（含 warn 真名；焦点环不走默认透明的 focus-ring-color）',
      uiJs.includes('--tdt-warning:var(--dsw-alias-state-warn-primary')
      && uiJs.includes('--tdt-focus:var(--dsw-alias-state-business-primary')
      && uiJs.includes('--tdt-surface-sunken:var(--dsw-alias-interactive-bg-hover')
      && !uiJs.includes('--tdt-focus:var(--dsw-focus-ring-color'))
    check('字号 / 圆角直绑宿主字号族与圆角真值（不自定 px 刻度）',
      uiJs.includes('--tdt-font-md:var(--dsw-font-xs-13-font-size')
      && uiJs.includes('--tdt-radius-md:var(--dsw-radius-md,12px)'))
    check('同一 token 只在一处定义（P0「--tdt- 只有一处定义」验收）',
      countOf('--tdt-control-h-md:') === 1 && countOf('--tdt-fg:') === 1 && countOf('--tdt-radius-sm:') === 1)
    check('明暗差异唯一落点 = token 层（固定中性面覆盖段在产物里）',
      uiJs.includes('body[data-ds-dark-theme]{') && uiJs.includes('--tdt-plate:var(--dsw-static-neutral-850'))
    // 注：applyStyle 是给 P5 过渡期用的便捷入口，此刻无调用点 ⇒ 被摇树属正常，不为它写断言。
    check('统一样式入口唯一（单 style id + 注入器 API + 入口接线）',
      uiJs.includes('dsh-task-dispatch-table-ui') && uiJs.includes('ensureUiBase')
      && uiJs.includes('registerStyle') && uiJs.includes('ensureUiStyles'))
  }

  // ── 16. UI 基础层 P1：分段控件（滑动块）唯一实现 ──
  // 正向 = 组件 + 皮肤进产物、皮肤只吃 token；
  // 反向 = 三处就地自绘的旧实现标识全部消失（它们才是「同一个控件写三遍」的证据）。
  console.log('\n[16] UI 基础层 P1（分段控件唯一实现）')
  {
    const p1Js = readFileSync(join(process.cwd(), 'dist', 'client.js'), 'utf8')
    check('分段控件进了产物（段 / 变体 / 两档高度 / 段内角标 / 无障碍组）',
      p1Js.includes('dsh-tdt-seg__item') && p1Js.includes('dsh-tdt-seg--default') && p1Js.includes('dsh-tdt-seg--inset')
      && p1Js.includes('dsh-tdt-seg--md') && p1Js.includes('dsh-tdt-seg__badge') && p1Js.includes('aria-pressed'))
    check('两套基础样式都在（纯黑 default=第二层面+描边 / 灰底 inset=交互灰 hover 底无描边；段高两档；角标 --tdt-on-signal）',
      p1Js.includes('--seg-track:var(--tdt-surface-2)') && p1Js.includes('--seg-track:var(--tdt-hover)')
      && p1Js.includes('--seg-thumb:var(--tdt-surface-raised)')
      && p1Js.includes('height:calc(var(--tdt-control-h-sm) - 6px)') && p1Js.includes('height:calc(var(--tdt-control-h-md) - 6px)')
      && p1Js.includes('background:var(--tdt-danger);color:var(--tdt-on-signal)'))
    // 2026-10-01 用户拍板（同日修正 +2）：有边 / 无边总高必须 == token，边框在内部补回，不许额外撑高。
    // 统一几何 = 段高 = token − 6px（上下各 2px padding + 1px 边框）：default 真边框 + padding2；inset 无边框 + padding3 补回缺的 1px。
    check('有边 / 无边等高（1px 边框 + 2px padding：default 真边框 + padding2；inset 无边框 + padding3，外框 == token）',
      p1Js.includes('.dsh-tdt-seg{display:inline-flex;align-items:center;gap:2px;padding:2px;')
      && p1Js.includes('--seg-thumb:var(--tdt-surface-raised);border:1px solid var(--tdt-border);}')
      && p1Js.includes('--seg-thumb:var(--tdt-surface-raised);border:0;padding:3px;}'))
    check('三处就地自绘的旧实现已删（同一控件不再有第二/三份）',
      !p1Js.includes('segTrackStyle') && !p1Js.includes('segStyle') && !p1Js.includes('tabStyle')
      && !p1Js.includes('countBadge') && !p1Js.includes('segmentStyle') && !p1Js.includes('segmentedStyle'))
    check('预览 渲染/源码 + 版本开关 都已迁到统一 Segmented（自绘 sv-seg / 旧 histtoggle 类已删）',
      !p1Js.includes('dsh-tdt-sv-seg') && !p1Js.includes('dsh-tdt-sv-seg-btn')
        && !p1Js.includes('dsh-tdt-ed-histtoggle-seg')
        && p1Js.includes('previewRender') && p1Js.includes('previewSource')
        && p1Js.includes('dsh-tdt-ed-histtoggle') && p1Js.includes('dsh-tdt-seg'))
  }

  // ── 17. UI 基础层 P1b：编辑器分段控件也归一（删官方薄封装 + 周几多选走统一件）──
  console.log('\n[17] UI 基础层 P1b（编辑器分段归一）')
  {
    const p1bJs = readFileSync(join(process.cwd(), 'dist', 'client.js'), 'utf8')
    check('第三档高度 lg 已进基础层（token + 皮肤规则）',
      p1bJs.includes('--tdt-control-h-lg:32px') && p1bJs.includes('dsh-tdt-seg--lg'))
    check('编辑器卡内分段已迁到统一 Segmented（编辑预览 · 排期 两处 id 在产物中）',
      p1bJs.includes('dsh-tdt-ed-prompt-mode') && p1bJs.includes('dsh-tdt-ed-schedule'))
    check('周几多选组件仍在且挂在间隔卡（multiple 模式走统一 Segmented，由类型与导入保证）',
      p1bJs.includes('dsh-tdt-ed-schedule-interval-panel') && p1bJs.includes('WeekdayPicker'))
    check('官方分段控件薄封装已删（编辑器不再用官方 SegmentedControl 作分段；死 CSS 也清掉）',
      !p1bJs.includes('dsh-tdt-ed-seg{padding:3px}') && !p1bJs.includes(".dsh-tdt-ed-seg>span[aria-hidden"))
    check('周几多选特殊化变体：正方形 + 蓝选中（用户 2026-10-01 定制，复刻原 WeekdayPicker 观感）',
      p1bJs.includes('dsh-tdt-seg--weekday')
      && p1bJs.includes('.dsh-tdt-seg--weekday .dsh-tdt-seg__item{width:calc(var(--tdt-control-h-lg) - 6px)')
      && p1bJs.includes('background:var(--tdt-business);color:var(--tdt-fg-inverse)'))
  }

  // ── 17b. U21：新增 / 编辑任务改「占布局的分栏」+ 删执行记录切换 ──
  console.log('\n[17b] U21（编辑/新建任务：分栏形态 + 去切换）')
  {
    const edJs = readFileSync(join(process.cwd(), 'dist', 'client.js'), 'utf8')
    check('编辑/新建不再是浮层：全屏遮罩层 ed-overlay 已彻底消失（不再压暗主窗口）',
      !edJs.includes('.dsh-tdt-ed-overlay{') && !edJs.includes('dsh-tdt-ed-overlay'))
    check('面板改占布局的一列（sticky + 100vh + flex:0 0 auto，与预览 dock 同套）且宽度走 --dsh-tdt-editor-w',
      edJs.includes('.dsh-tdt-ed-panel{position:sticky;top:0;align-self:stretch;height:100vh;')
      && edJs.includes('width:var(--dsh-tdt-editor-w,520px)'))
    check('「基本信息 / 执行记录」切换已删（id 与三处文案双语全无）',
      !edJs.includes('dsh-tdt-ed-tabs') && !edJs.includes('editorTabBasic') && !edJs.includes('editorTabRecords')
      && !edJs.includes('editorRecordsPending') && !edJs.includes('执行记录待接'))
    check('会话弹窗让位两条分栏（right = 预览宽 + 编辑宽）',
      edJs.includes('right:calc(var(--dsh-tdt-preview-w,0px) + var(--dsh-tdt-editor-w,0px))'))
    // 开关位置 / 宽度守则看源码（产物里顺序不好断言），与 §19 同源。
    const edSrc = readFileSync(join(process.cwd(), 'src', 'client', 'task-editor.tsx'), 'utf8')
    const headIdx = edSrc.indexOf('dsh-tdt-ed-headactions')
    const switchIdx = edSrc.indexOf('dsh-tdt-ed-enable', headIdx)
    const closeIdx = edSrc.indexOf('IconCloseOutlineRegular', headIdx)
    check('启用开关回到头部右侧且**排在关闭 ✕ 之前**（headactions → 开关 → ✕ 的顺序成立）',
      headIdx > 0 && switchIdx > headIdx && closeIdx > switchIdx)
    check('宽度下限 / 默认 = 520（用户 2026-10-02 定）且给主面板留够最小宽（两条分栏互相当预留）',
      edSrc.includes('EDITOR_WIDTH_MIN = 520') && edSrc.includes('EDITOR_WIDTH_DEFAULT = 520')
      && edSrc.includes('window.innerWidth - PAGE_MIN_WIDTH - reserved'))
    // 用户 2026-10-02：最小宽（530）下排期底部行的中文标签被压成两行 ⇒ 标签 nowrap + 三控件 flex:none
    // 收窄（126→108 / 92→78，延迟下拉定宽 80）+ flexWrap 兜底，规则是「宁可换行，也不折标签 / 不切框内字」。
    // 2026-10-02 返工：给日期 / 时刻定宽会被内容顶破 ⇒ 框内文字直接变「2026-09-3…」。
    // 现规则：日期 / 时刻 = 内容宽 + flex:none（**天然切不掉**，且比原定宽 126/92 更省），
    // 只有下拉才定宽（按最宽那一档定 96），标签缩短为「开始时间」。
    check('排期底部行：日期 / 时刻走内容宽（不给定宽）+ flex:none，延迟下拉按最宽档定宽 96，标签 nowrap',
      edSrc.includes("flexWrap: 'wrap'") && edSrc.includes('width: 96')
      && edSrc.includes("flex: 'none', whiteSpace: 'nowrap'")
      && edSrc.includes("flex: 'none', display: 'inline-flex'")
      && !edSrc.includes('width: 108') && !edSrc.includes('width: 78'))
    check('开始时间标签去掉「任务」两字（窄栏排得下，语义由 ？ 气泡补）',
      readFileSync(join(process.cwd(), 'src', 'client', 'locales.ts'), 'utf8').includes("editorTaskStart: '开始时间'"))
    // 用户 2026-10-02：拖拽会顺手选中一片文字 ⇒ pointerdown preventDefault + 拖动期间全域禁选。
    check('拖拽调宽不再选中文字（两处 resizer 都做了 preventDefault + 拖动期间 user-select:none）',
      edSrc.includes('userSelect') && edSrc.includes("body.style.userSelect = 'none'")
      && edSrc.includes('removeAllRanges')
      && readFileSync(join(process.cwd(), 'src', 'client', 'index.ts'), 'utf8').includes("body.style.userSelect = 'none'")
      && edJs.includes('.dsh-tdt-ed-resizer{position:absolute;top:0;bottom:0;left:0;width:6px;cursor:col-resize;z-index:2;touch-action:none;user-select:none;'))
  }

  // ── 18. UI 基础层 P2/P3/P4：按钮 / 输入 / 数字步进 / 开关 ──
  {
    const p23Js = readFileSync(join(process.cwd(), 'dist', 'client.js'), 'utf8')
    check('按钮 / 图标钮皮肤进产物（dsh-tdt-btn / dsh-tdt-iconbtn）',
      p23Js.includes('.dsh-tdt-btn{') && p23Js.includes('dsh-tdt-btn--primary') && p23Js.includes('.dsh-tdt-iconbtn{'))
    check('输入类皮肤进产物（input / pfx / num）且原生 number 已清零',
      p23Js.includes('.dsh-tdt-input{') && p23Js.includes('.dsh-tdt-pfx{') && p23Js.includes('.dsh-tdt-num{')
      && !p23Js.includes("type: 'number'") && !p23Js.includes('type: "number"'))
    check('开关 success 绿覆盖已上提基础层（.dsh-tdt-switch）',
      p23Js.includes(".dsh-tdt-switch button[role='switch'][aria-checked='true']"))
    check('日期 / 时间皮肤进产物（dsh-tdt-dtf / cal__cell / time__opt）',
      p23Js.includes('.dsh-tdt-dtf{') && p23Js.includes('.dsh-tdt-cal__cell{') && p23Js.includes('.dsh-tdt-time__opt{'))
    check('业务文件明暗特判已清零（body[data-ds-dark-theme] 只剩 token 层）',
      !p23Js.includes('body[data-ds-dark-theme] .dsh-tdt') && p23Js.includes('body[data-ds-dark-theme]{'))
  }

  // ── 19. P6：业务文件不许再出现宿主变量直引 / C 常量表（源码级反断言）──
  {
    const business = [
      'index.ts', 'task-list.tsx', 'task-editor.tsx', 'task-editor-css.ts', 'editor-fields.tsx',
      'file-browser.tsx', 'file-preview.tsx', 'config-panel.tsx', 'session-view.ts',
      'archive-session-css.ts', 'toast-css.ts',
    ]
    let dswFiles = 0
    let cTableFiles = 0
    let selfInjectFiles = 0
    for (const f of business) {
      const src = readFileSync(join(process.cwd(), 'src', 'client', f), 'utf8')
      if (src.includes('--dsw-')) dswFiles++
      if (src.includes('const C = {')) cTableFiles++
      if (src.includes("createElement('style')")) selfInjectFiles++
    }
    check('业务文件宿主变量引用清零（--dsw- 只应出现在 ui/tokens.ts）', dswFiles === 0)
    check('C 常量表已删净（const C = { 为 0）', cTableFiles === 0)
    check('使用点不再自注入 <style>（统一走 ui/style.ts 的 applyStyle）', selfInjectFiles === 0)
  }

  // ── 20. 三面板第四轮 UX：定高 / 表格列重做 / 时间范围控件（半开区间）/ 状态过滤修复 ──
  {
    const tl = readFileSync(join(process.cwd(), 'src', 'client', 'task-list.tsx'), 'utf8')
    const q = readFileSync(join(process.cwd(), 'src', 'client', 'query.ts'), 'utf8')
    const st = readFileSync(join(process.cwd(), 'src', 'store.ts'), 'utf8')
    const tr = readFileSync(join(process.cwd(), 'src', 'client', 'ui', 'time-range.ts'), 'utf8')
    const fmt = readFileSync(join(process.cwd(), 'src', 'client', 'format.ts'), 'utf8')
    const uidx = readFileSync(join(process.cwd(), 'src', 'client', 'ui', 'index.ts'), 'utf8')
    const cc = readFileSync(join(process.cwd(), 'src', 'client', 'ui', 'controls-css.ts'), 'utf8')
    const trc = readFileSync(join(process.cwd(), 'src', 'client', 'ui', 'TimeRange.tsx'), 'utf8')
    const ld = readFileSync(join(process.cwd(), 'src', 'client', 'ui', 'Loading.tsx'), 'utf8')
    const dist = readFileSync(join(process.cwd(), 'dist', 'client.js'), 'utf8')
    check('三面板统一固定高度：panelBoxStyle 覆盖三个 tab（基础信息也纳入定高盒）',
      (tl.match(/panelBoxStyle/g) ?? []).length >= 4
      // 基础信息改版（2026-10-03）：不再是单一滚动列，改成左配置 + 右最近执行两栏、只滚右栏。
      && tl.includes('infoWrapStyle') && tl.includes('infoConfigStyle') && tl.includes('infoRecentStyle')
      && !tl.includes('PANEL_MAX_H'))
    check('执行记录表格 8 列（含新增「备注」弹性列）+ 官方状态图标 + 斑马纹 + 查看小按钮',
      tl.includes("t('colPlanned')") && tl.includes("t('colActualStart')") && tl.includes("t('colSession')")
      && tl.includes("t('colTokens')") && tl.includes("t('colView')") && tl.includes("t('colNote')")
      && tl.includes('FileTypeIcon') && tl.includes('IconCheckCircleFillRegular') && tl.includes('IconCloseCircleFillRegular')
      && tl.includes('dsh-tdt-rec-alt') && tl.includes('StatusIcon')
      && tl.includes('colSpan: 8') && !tl.includes('colSpan: 7')
      && !tl.includes('chipStyleOf') && !tl.includes('IconNewChatOutlineRegular'))
    check('备注列是唯一弹性列（其余 7 列定长）+ 除产出物 / 备注外内容居中',
      tl.includes('miniCellCenterStyle') && tl.includes('maxWidth: 0')
      && (tl.match(/width: '\d+px'/g) ?? []).length >= 7)
    // 只锁定表头那一块（弹窗等处用 surface-base 是合理的，不在本断言范围）。
    const headBlock = /const recHeadStyle[\s\S]*?\n}/.exec(tl)?.[0] ?? ''
    check('表头：居中 + 加高 + 上下各一条线（走 **box-shadow** ⇒ 跟着表头不随滚动滑走）',
      headBlock.includes("textAlign: 'center'") && headBlock.includes("background: 'var(--tdt-head-bg)'")
      && headBlock.includes("padding: '11px 10px'")
      && headBlock.includes('boxShadow:') && headBlock.includes('inset 0 1px 0 var(--tdt-border)')
      && headBlock.includes('inset 0 -1px 0 var(--tdt-border)')
      && !headBlock.includes('borderTop:') && !headBlock.includes('borderBottom:'))
    check('状态过滤下拉顺序 全部 / 成功 / 失败 / 运行中（下拉不必守两字）',
      tl.includes("value: 'succeeded'") && tl.includes("value: 'failed'") && tl.includes("value: 'running'")
      && tl.includes("t('filterRunning')"))
    check('日期 / 时间锚点边框与下拉一致（0.5px + radius-md，同排并放是一套）',
      cc.includes('border:0.5px solid var(--tdt-border-heavy);border-radius:var(--tdt-radius-md)'))
    check('日志条数选择器居右（marginLeft:auto）', tl.includes("marginLeft: 'auto'"))
    check('时间范围控件：半开区间上界（次日 00:00 / 下一分钟 :00），不再用 .999 补丁',
      tr.includes('toParsed.d + 1') && tr.includes('toParsed.mm + 1') && !tr.includes('23:59:59.999')
      && uidx.includes('TimeRange') && uidx.includes('rangeToQuery'))
    check('预设档 = 整档（今天 / 本周 / 本月上界一律 23:59，不取「此刻」）',
      !tr.includes('ymdhm(now)') && tr.includes('endOfDay(start)')
      && tr.includes('endOfDay(sun)') && tr.includes('endOfDay(last)'))
    check('结束框未选时刻 ⇒ 默认 23:59（起始仍 00:00）：否则选「10-2 作结束」当天数据全漏',
      trc.includes("which === 'to' ? '23:59' : '00:00'") && trc.includes('join(which,'))
    check('时间控件定式 = <起> <止> <范围>（不写「时间：」/「到」，靠灰色占位区分起止）',
      !trc.includes('labels.time') && trc.includes("endFields('from')") && trc.includes("endFields('to')")
      && trc.indexOf("endFields('to')") < trc.lastIndexOf('h(SelectField'))
    check('状态下拉不再单写「状态：」二字：未选时占位 = 灰色的「状态」',
      tl.includes("placeholder: t('colStatus')") && tl.includes("useState('')"))
    check('计划执行年份改**四位**（2026-09-30 15:10）',
      fmt.includes('${d.getFullYear()}-') && !fmt.includes('getFullYear() % 100'))
    check('产出物图标放大到 28×28（间距翻倍）+ 底板 hover 两端都更明显',
      tl.includes("width: '28px'") && tl.includes('--tdt-chip-bg-hover'))
    check('列序：查看会话在最后、产出物在倒数第二（「要点的」排在一起）',
      tl.indexOf("t('colNote')") < tl.indexOf("t('colOutputs')")
      && tl.indexOf("t('colOutputs')") < tl.indexOf("t('colSession')"))
    check('备注**不用红色**：走最浅的灰 --tdt-fg-3（不是要提醒他去看）',
      tl.includes("color: 'var(--tdt-fg-3)'") && !tl.includes("color: 'var(--tdt-danger)',\n"))
    check('展开行 / 展开内容区走**带透明度的蓝**（--tdt-open-bg / -soft），不用灰色',
      tl.includes('var(--tdt-open-bg)') && tl.includes('var(--tdt-open-bg-soft)')
      && !tl.includes("open ? { background: 'var(--tdt-surface-2)' }"))
    check('展开区直接铺执行日志：**无标题、无黑框**（小字段亦已移除）',
      !tl.includes("t('eventsOf')") && !tl.includes("t('colAttempt')")
      && !tl.includes("t('colDispatchedAt')")
      // 黑框 `logBoxStyle` 只留给「日志」面板本体，展开区不再套框。
      && !tl.includes('eventsLoading'))
    check('两个时间框之间有分隔符 ～', trc.includes("'～'"))
    check('日志整区：不套框（logBoxStyle 已废）+ 上沿一条线 + 整块底色 logAreaStyle',
      tl.includes('const logAreaStyle') && tl.includes('logRowStyle') && !tl.includes('const logBoxStyle'))
    check('过滤行上下间距一致：下间距 10px = 上间距（面板外虚线 → 过滤行）',
      tl.includes("marginBottom: '10px',"))
    check('loading 阈值已回归正式值：400ms 后才显 + 返回即消失（无保底停留）',
      tl.includes('BUSY_DELAY_MS = 400') && tl.includes('BUSY_HOLD_MS = 0'))
    check('任务卡片 hover 只作用主行（dsh-tdt-card-row），展开区不会跟着变蓝',
      tl.includes('.dsh-tdt-card-row:hover { background: var(--tdt-card-hover); }')
      && tl.includes("className: 'dsh-tdt-card-row'")
      // 整卡 hover 已废除：否则展开后整页发蓝（用户 2026-10-03）。
      && !tl.includes('.dsh-tdt-card:hover')
      // 只查 cardStyle 这个对象：inline 背景优先级高于 CSS class，会盖掉 :hover；
      // 且卡片本身不再统一 padding（padding 移到主行 / 展开区各自带，hover 才能边到边高亮）。
      // （别的控件比如控制按钮确实有 `background: var(--tdt-surface-1), color: var(--tdt-fg)`，那条正经，故收口到 cardStyle 块内。）
      && (() => {
        const m = tl.match(/const cardStyle[\s\S]*?\n\}/)
        const block = m ? m[0] : ''
        return !block.includes("background: 'var(--tdt-surface-1)'") && !block.includes('padding:')
      })())
    check('loading 定位：fixed 到页面底部，right 按 #dsh-tdt-main 内容盒右边缘动态量',
      ld.includes("position: 'fixed'") && ld.includes('function useContentRight') && ld.includes('function Loading')
      && tl.includes("id: 'dsh-tdt-main'") && tl.includes('Loading, RunningBlocks'))
    check('日志关键字**同时匹配 message 与 kind**（否则搜 missed-slot 的 kind 搜不到）',
      st.includes("(message LIKE ? OR kind LIKE ?)"))
    check('任务卡片整行可点展开；开关 / 箭头拦下冒泡（不穿透、不双触发）',
      tl.includes("className: 'dsh-tdt-card-row'") && tl.includes('event.stopPropagation()')
      && (tl.match(/stopPropagation\(\)/g) ?? []).length >= 4)
    check('忙碌指示：沿用三个脉动方块 + 不吃鼠标事件 + 过滤行不再插占位文字',
      tl.includes('useDelayedBusy') && tl.includes('BUSY_DELAY_MS')
      && ld.includes('dsh-tdt-run-blocks') && ld.includes('pointerEvents:')
      && tl.includes('h(Loading, { label:')
      // 过滤行里那个会占位的一闪文字已经移除。
      && !tl.includes("recLoading ? h('span'") && !tl.includes("logLoading ? h('span'"))
    check('展开区排布放宽：外圈 padding 翻倍 + 日志行间距 + 字色压暗一档',
      tl.includes("padding: '18px 20px'") && tl.includes("marginBottom: '7px'")
      && tl.includes("color: 'var(--tdt-fg-2)'") && !tl.includes("color: 'var(--tdt-accent)' }, `${event.kind}"))
    check('执行记录 / 日志都有条数过滤：`显示 <N> 条`，统一居右',
      tl.includes("t('limitPrefix')") && tl.includes("t('limitSuffix')") && tl.includes('recLimit')
      && (tl.match(/limitRowStyle/g) ?? []).length >= 3)
    check('产出物图标有浅色圆角底板且 hover 变亮；行 hover 高亮',
      tl.includes('.dsh-tdt-rec-out') && tl.includes('.dsh-tdt-rec-out:hover')
      && tl.includes('.dsh-tdt-rec-row:hover') && tl.includes('dsh-tdt-rec-row'))
    // 表底贴虚线：底栏去掉 marginTop（面板总高由 panelBoxStyle 定高保持不变）。
    const barBlock = /const panelBarStyle[\s\S]*?\n}/.exec(tl)?.[0] ?? ''
    check('表底贴着虚线（底栏去掉 marginTop），面板高度不变',
      barBlock.includes('borderTop:') && !barBlock.includes('marginTop'))
    check('新增格式 helper：计划执行 / 实际开始 / 时长（H:MM:SS·MM:SS）',
      fmt.includes('export function formatPlanStamp')
      && fmt.includes('export function formatClock')
      && fmt.includes('export function formatDurationHms'))
    check('状态过滤失效已修：客户端出口参数名对齐（status / level）',
      q.includes('status: statuses') && q.includes('level: levels'))
    check('半开区间服务端比较：scheduled_at < ? / ts < ?（不再 <=，边界归一单源）',
      st.includes("'scheduled_at < ?'") && st.includes("'ts < ?'") && !st.includes("'scheduled_at <= ?'"))
    check('时间范围 / 新列文案进产物（trAll / trCustom / colPlanned / colActualStart）',
      dist.includes('trAll') && dist.includes('trCustom') && dist.includes('colPlanned') && dist.includes('colActualStart'))
  }

  // ── 21. 基础信息改版追加（2026-10-03）：右栏定宽 + 产出物行 hover 底色 ──
  {
    const tl = readFileSync(join(process.cwd(), 'src', 'client', 'task-list.tsx'), 'utf8')
    const dist = readFileSync(join(process.cwd(), 'dist', 'client.js'), 'utf8')
    check('基础信息右栏定宽（窗口缩放只让左栏变）+ 产出物行 hover 有底色',
      tl.includes("flex: 'none', width: '320px'")
      && tl.includes('.dsh-tdt-info-out:hover { background: var(--tdt-chip-bg); }')
      && dist.includes('dsh-tdt-info-out:hover'))
    const sv = readFileSync(join(process.cwd(), 'src', 'index.ts'), 'utf8')
    check('附件可点开预览：overview 补绝对路径 + 锚点会话（upload 走 attachmentAbsPath，link 走工作区 path+ref）',
      sv.includes('attachmentsWithPaths') && sv.includes('anchorSessionId')
      && sv.includes('attachmentAbsPath(assets, task.id, item.ref)') && sv.includes('path.join(source.path, item.ref)')
      && sv.includes('anyAnchor'))
    check('附件行在拿到 path + 锚点会话时可点（走统一 openFile），缺则退回纯展示',
      tl.includes('onOpenFile(anchor, absPath)') && tl.includes('item.anchorSessionId'))
    check('基础信息忙碌指示统一走右下角共用 Loading（不再另写「载入中」文字）',
      tl.includes("? h(Loading, { label: t('loading') })")
      // 基础信息右栏不再出现把 loading 文案直接当文字渲染的旧写法。
      && !tl.includes("color: 'var(--tdt-fg-3)' } }, t('loading'))"))
    const rec = readFileSync(join(process.cwd(), 'src', 'reconcile.ts'), 'utf8')
    check('token 取数按官方 TokenUsage 口径：inputTokens 是**未缓存**输入 ⇒ 计费输入 = inputTokens + cacheReadTokens + cacheWriteTokens',
      rec.includes('num(u.inputTokens)') && rec.includes('num(u.cacheReadTokens)')
      && rec.includes('num(u.cacheWriteTokens)') && rec.includes('num(u.totalTokens)')
      && rec.includes('(uncached ?? 0) + (cacheRead ?? 0) + (cacheWrite ?? 0)'))
    const qsrc = readFileSync(join(process.cwd(), 'src', 'client', 'query.ts'), 'utf8')
    check('基础信息「任务会话」：灰底小图标框 + 会话名（无虚线 / 无边框），hover 变蓝；不再用独立「查看会话」按钮',
      tl.includes("t('infoSession')") && tl.includes('dsh-tdt-info-session')
      && tl.includes("children: sessionChip")
      && tl.includes('session_title')
      && tl.includes('MarqueeText, { text: sessionName }')
      && tl.includes('IconSearchOutlineRegular')
      // 无虚线 / 无边框；图标包一个灰色小标签框；hover 变蓝。
      && tl.includes('dsh-tdt-info-session-icon') && tl.includes('background: var(--tdt-chip-bg)')
      && !tl.includes('border-bottom: 1px dashed var(--tdt-border-strong)')
      && tl.includes('.dsh-tdt-info-session:hover { color: var(--tdt-business)')
      && tl.includes('width: 18px; height: 18px')
      // 标签列缩一个字：78 → 66px。
      && tl.includes("gridTemplateColumns: '66px 1fr'")
      // 旧的独立按钮已删；执行时长标签也改了。
      && !tl.includes("}, t('viewSession')))")
      && tl.includes("t('infoDuration')"))
    check('会话名由服务端按 sessionTitleOf 单源重建（快照标题优先，旧行回退当前任务标题）',
      sv.includes('sessionTitleOf(row.scheduled_at') && sv.includes('session_title')
      && qsrc.includes('session_title'))

    // ── 立即执行（2026-10-03 用户拍板）：run_type 落库 + 路由 / 前端接线 ──
    const rnStore = new TaskStore(join(root, 'run-now.db'))
    rnStore.ensureInstance('rn-1', 'rn-task', '2026-10-03', '2026-10-03T01:00:00.000Z', 'dispatched', undefined, 'manual')
    check('立即执行：手动触发的执行记录 run_type=manual 落库', rnStore.get('rn-1')?.run_type === 'manual')
    rnStore.ensureInstance('rn-2', 'rn-task', '2026-10-03', '2026-10-03T02:00:00.000Z', 'dispatched')
    check('自动调度：不传 run_type 时缺省 scheduled（旧调用零改动）', rnStore.get('rn-2')?.run_type === 'scheduled')
    rnStore.close()
    const storeSrc = readFileSync(join(process.cwd(), 'src', 'store.ts'), 'utf8')
    check('存储层：task_instances 含 run_type 列且旧库自动补列迁移',
      storeSrc.includes('run_type      TEXT') && storeSrc.includes('ADD COLUMN run_type TEXT'))
    const schedSrc = readFileSync(join(process.cwd(), 'src', 'scheduler.ts'), 'utf8')
    check('调度层：runNow 按 id 取全量定义（绕 enabled）+ 串行/前置/工作区/附件预条件 + 写 manual',
      schedSrc.includes('runNow(taskId: string): RunNowResult')
      && schedSrc.includes('loadTasks(logger, config(), true)')
      && schedSrc.includes("'already-running'")
      && schedSrc.includes("'manual'"))
    const idxSrc = readFileSync(join(process.cwd(), 'src', 'index.ts'), 'utf8')
    check('接口层：新增 POST /tasks/run，业务性拒绝回 200 + ok:false（原因交前端 Toast）',
      idxSrc.includes('${DISPATCH_API_PREFIX}/tasks/run') && idxSrc.includes('scheduler.runNow(id)'))
    check('前端：按钮组在删除与编辑之间插「立即执行」+ 确认框 + 结果 Toast + 播放三角图标 + 成功后立即重拉记录',
      tl.includes("t('cardRunNow')") && tl.includes("t('cardRunNowDesc')")
      && tl.includes('renderRunConfirm') && tl.includes('FloatingToast')
      && tl.includes('IconPlayOutlineRegular') && tl.includes('runNonce'))
    const primSrc = readFileSync(join(process.cwd(), 'src', 'client', 'primitives.d.ts'), 'utf8')
    check('图标：改用官方「播放三角」IconPlayOutlineRegular（用户点名闹钟不对，2026-10-03）',
      primSrc.includes('IconPlayOutlineRegular'))
    const locSrc = readFileSync(join(process.cwd(), 'src', 'client', 'locales.ts'), 'utf8')
    check('文案：确认框文案与中英双语键齐备',
      locSrc.includes("cardRunNowDesc: '你确定要立即执行此任务吗？'")
      && locSrc.includes("cardRunNowDesc: 'Run this task immediately?'"))
  }

  store.close()
  rmSync(dir, { recursive: true, force: true })
}

console.log(`\n冒烟结果：${passed} 项通过，${failures.length} 项失败`)
if (failures.length > 0) {
  for (const item of failures) console.log(`  - ${item}`)
  process.exit(1)
}
