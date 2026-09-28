// 复现脚本：老库（无 snapshot 列）+ 旧 running 实例，跑新代码迁移 + 启动扫描 + tick。
// 验证：① 迁移不崩；② 老 unknown 实例不再永久挡住同任务新刻度（修复后应立即写出 cron 新行）。
import { DatabaseSync } from 'node:sqlite'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { TaskStore } from '../dist/store.js'
import { createScheduler } from '../dist/scheduler.js'
import { createReconciler } from '../dist/reconcile.js'

const dir = mkdtempSync(join(tmpdir(), 'olddb-'))
const dbPath = join(dir, 'task-instances.db')
const raw = new DatabaseSync(dbPath)
raw.exec(`CREATE TABLE task_instances (
  id TEXT PRIMARY KEY, task_id TEXT NOT NULL, logical_date TEXT NOT NULL, scheduled_at TEXT NOT NULL,
  status TEXT NOT NULL, attempt INTEGER NOT NULL DEFAULT 0, session_id TEXT, lease_until TEXT,
  dispatched_at TEXT, finished_at TEXT, outputs TEXT, token_in INTEGER, token_out INTEGER, token_in_cache INTEGER, updated_at TEXT NOT NULL
);
CREATE UNIQUE INDEX idx_instances_slot ON task_instances(task_id, scheduled_at);`)
raw.prepare(`INSERT INTO task_instances (id, task_id, logical_date, scheduled_at, status, attempt, session_id, dispatched_at, updated_at)
  VALUES (?, ?, ?, ?, 'running', 0, ?, ?, ?)`).run(
  'old-instance-1', '480f3ef1-05b4-4717-b297-3a5a4f7b1fbd', '2026-09-28', '2026-09-28T10:00:00.000Z',
  'sess-old', '2026-09-28T10:00:00.000Z', '2026-09-28T10:03:00.000Z',
)
raw.close()

const store = new TaskStore(dbPath)
console.log('迁移后列含 snapshot?', store.dumpTable('task_instances', 50).columns.includes('snapshot'))
store.startupScan()
console.log('旧实例状态(应为 unknown) =', store.get('old-instance-1')?.status)

// 真机同款：parseInlineTasks 会给 contract/retry 全字段默认值
const tasks = [
  { id: '480f3ef1-05b4-4717-b297-3a5a4f7b1fbd', title: 'cron-5min', code: 'CRON', enabled: true, schedule: { cron: '*/5 * * * *', window: 'PT1H' }, target: { workspace: 'Temp', prompt: '记时间' }, contract: { validStatuses: ['ok'] }, retry: { maxAttempts: 1 } },
  { id: 'd693ab17-05d6-4e00-b5b3-e223f85ec6be', title: 'once', enabled: true, schedule: { once: '2026-09-25T22:20', window: 'PT2H' }, target: { workspace: 'Temp', prompt: '诗' }, contract: { validStatuses: ['ok'] }, retry: { maxAttempts: 1 } },
]
const fakeCtx = {
  workspaceRegistry: {
    list: () => [{ title: 'Temp', path: '/tmp/temp-ws', attachSession: async () => {}, archiveSession: async () => {} }],
    archiveSession: async () => {},
  },
  agents: { create: async () => ({ id: 's', agent: { send: () => {} }, dispose: async () => {} }) },
  get: () => undefined, interval: (fn) => { fn(); return () => {} }, on: () => {},
}
const logger = { info: (m) => console.log('  [info]', m), warn: (m) => console.log('  [warn]', m), error: (m) => console.log('  [error]', m) }
const tasksJson = JSON.stringify(tasks)
const cfg = () => ({ tasksInline: tasksJson, tasksDir: '', tickMs: 60_000, statePath: '', dispatchGraceMs: 60_000, leaseMs: 60_000, unknownGraceMs: 300_000, debugSnapshot: '', defaultProvider: '', defaultModel: '' })
const reconciler = createReconciler({ ctx: fakeCtx, logger, store, options: { leaseMs: 60_000, dispatchGraceMs: 60_000, unknownGraceMs: 300_000, config: cfg, legacyTask: (id) => tasks.find((t) => t.id === id) } })
const scheduler = createScheduler({ ctx: fakeCtx, logger, store, reconciler, config: cfg })

console.log('tick（老 unknown 实例在 10:00 槽、远离当前窗口，修复后 cron 应立刻写出【当前槽】新行）')
scheduler.tick()
const newRows = store.listByStatus(['dispatched', 'running', 'failed', 'pending'])
  .filter((r) => r.task_id === '480f3ef1-05b4-4717-b297-3a5a4f7b1fbd' && r.id !== 'old-instance-1')
console.log('cron 当前槽新实例数 =', newRows.length, JSON.stringify(newRows.map((r) => [r.status, r.scheduled_at, r.snapshot ? 'snap✓' : 'snap✗'])))
console.log('旧实例最终状态 =', store.get('old-instance-1')?.status)
console.log(newRows.length >= 1 ? '✅ 修复生效：同任务新刻度不再被老孤儿挡死' : '❌ 仍被挡死')
rmSync(dir, { recursive: true, force: true })
