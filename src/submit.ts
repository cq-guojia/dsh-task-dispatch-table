// 回执提交 CLI（决策 19）：agent 完成任务后执行本程序，把回执直写 state.db 事件表。
// 只记录不裁决——对账由调度器统一做（控制平面单一裁决点）；重复提交无害（调度器取最新）。
//
// 用法（命令行由调度器在派发消息里拼好，agent 只补 --status / --outputs / --note）：
//   node submit.js --db <statePath> --task <taskId> --date <YYYY-MM-DD> \
//     --session <sessionId> --status <s> [--outputs a.md,b.png] [--note "..."]
import { DatabaseSync } from 'node:sqlite'

function fail(message: string): never {
  console.error(`[dsh-task-dispatch-table] 回执提交失败: ${message}`)
  process.exit(1)
}

// 极简参数解析：--key value（零依赖）。
const args = process.argv.slice(2)
const get = (key: string): string | undefined => {
  const index = args.indexOf(`--${key}`)
  return index >= 0 ? args[index + 1] : undefined
}

const dbPath = get('db')
const taskId = get('task')
const logicalDate = get('date')
const sessionId = get('session')
const status = get('status')
if (dbPath === undefined || taskId === undefined || logicalDate === undefined || sessionId === undefined || status === undefined) {
  fail('缺少必填参数（--db --task --date --session --status）')
}

const outputs = (get('outputs') ?? '')
  .split(',')
  .map(part => part.trim())
  .filter(part => part.length > 0)
const note = get('note')

const instanceId = `${taskId}:${logicalDate}`
let db: DatabaseSync
try {
  db = new DatabaseSync(dbPath)
} catch (error) {
  fail(`状态库打不开 ${dbPath}: ${String(error)}`)
}
db.exec('PRAGMA busy_timeout = 5000;') // 与调度器进程并发写（WAL），等锁 5s

const instance = db
  .prepare('SELECT status, session_id FROM task_instances WHERE id = ?')
  .get(instanceId) as { status: string; session_id: string | null } | undefined
if (instance === undefined) fail(`实例不存在: ${instanceId}`)
if (instance.status !== 'dispatched' && instance.status !== 'running' && instance.status !== 'unknown') {
  fail(`实例已终态（${instance.status}），回执无效`)
}
if (instance.session_id !== sessionId) {
  fail(`会话不匹配（回执来自 ${sessionId}，实例当前会话 ${instance.session_id ?? 'null'}）`)
}

db.prepare('INSERT INTO task_events (instance_id, ts, kind, detail) VALUES (?, ?, ?, ?)').run(
  instanceId,
  new Date().toISOString(),
  'receipt',
  JSON.stringify({ status, outputs, note, session_id: sessionId }),
)
db.close()
console.log(
  `回执已提交: ${instanceId} (status=${status}${outputs.length > 0 ? `, outputs=${outputs.length} 项` : ''})`,
)
