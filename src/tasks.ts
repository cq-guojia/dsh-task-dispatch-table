// 任务定义：从任务表目录读 *.json，zod 校验 14 字段（data-model.md 一节），enabled 过滤。
// 定义存 JSON 文件人改进 Git（决策 6），本模块只读不写。
import { readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs'
import { createHash, randomUUID } from 'node:crypto'
import { resolve } from 'node:path'
import { z } from 'zod'
// cron-parser 5.x 为 ESM，命名导出 CronExpressionParser。
import { CronExpressionParser } from 'cron-parser'
import type { HostLogger } from './host.js'

/** ISO 8601 时长（如 PT4H），只支持 H/M/S 组合——窗口与新鲜度够用。 */
const isoDuration = z.string().regex(/^PT(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?$/, 'ISO 8601 时长，如 PT4H')

export const dependencySemantics = ['same_period', 'latest_success'] as const
export type DependencySemantics = (typeof dependencySemantics)[number]

/**
 * 任务定义输入 schema（决策 25/30）：身份三字段分离——
 * `id` = **机器身份**，录入瞬间由系统生成 UUID 并**写回这段 JSON**（inline 回写 settings、
 * 目录模式回写该文件），人不手写、不参与展示；`title` = 任务名称（人读、随时可改）；
 * `code` = 任务编号（**可选**、用户自编，仅便于查询与管理，**只做记录、不参与任何唯一性判断**
 * ——空格、重名、格式差异都不影响身份判定，因为判断只走 id + 计划刻度）。
 */
export const taskDefinitionSchema = z.object({
  /** 系统生成并**写回 JSON**；用户显式写了则以用户写的为准（兼容既有定义 / 手写 JSON 的老手）。 */
  id: z.string().min(1).optional(),
  /** 用户可读名称：任意文本，可改，不影响身份与历史记录。缺省回退到 id。 */
  title: z.string().min(1).optional(),
  /** 任务编号（决策 30）：可选、纯记录与查询用，不参与唯一性判断；存前 trim，空白视为未填。 */
  code: z.string().optional(),
  enabled: z.boolean(),
  schedule: z.object({
    cron: z.string().min(1).optional(),
    timezone: z.string().optional(),
    window: isoDuration,
    once: z.string().optional(),
  }),
  target: z.object({
    // 工作区（非工作目录，决策 22）：按 registry 的 title 精确匹配、id 兜底；目录由工作区 path 派生。
    workspace: z.string().min(1),
    /** 派发模型（决策 22 漏斗第①层）：provider 与 model 成对；都留空则漏到插件配置 / 宿主默认。 */
    provider: z.string().optional(),
    model: z.string().optional(),
    manual: z.string().optional(),
    prompt: z.string().min(1),
  }),
  // 回执机制（决策 19）：不再有契约文件与 path——agent 经 submit.mjs 直写状态库，
  // 这里只保留 status 合法值清单。
  contract: z
    .object({
      validStatuses: z.array(z.string()).default(['ok']),
    })
    .default({ validStatuses: ['ok'] }),
  retry: z.object({ maxAttempts: z.number().int().min(1).default(1) }).default({ maxAttempts: 1 }),
  backfill: z.object({ days: z.number().int().min(0).default(0) }).default({ days: 0 }),
  depends_on: z
    .array(
      z.object({
        task: z.string().min(1),
        semantics: z.enum(dependencySemantics),
        freshness: isoDuration.optional(),
      }),
    )
    .optional(),
})

/** 用户书写形态：`id` 可缺省。 */
export type TaskDefinitionInput = z.infer<typeof taskDefinitionSchema>

/**
 * 解析后的任务定义：`id` **必有**（用户未写时由 `withIdentity` 生成并回写 JSON）。
 * 全链路（scheduler / dispatch / reconcile）都按这个类型走，避免到处判空。
 */
export type TaskDefinition = Omit<TaskDefinitionInput, 'id'> & { id: string }

/** 展示名：优先 title，回退 id（决策 25：title 只是给人看的，永不参与身份）。 */
export function titleOf(task: TaskDefinition): string {
  return task.title ?? task.id
}

/**
 * id 是否可用：**任意非空字符串**都算数（兼容既有定义里手写的 kebab-case id）。
 * 只有「没写 / 空串 / 不是字符串」才算没有——按用户口径：格式不对就当没有，重新生成一个。
 */
function isUsableId(value: unknown): value is string {
  return typeof value === 'string' && value.trim() !== ''
}

/** 生成一个任务 id：标准 UUID（决策 30：机器身份与内容、名称彻底解耦，录入/解析瞬间随机生成）。 */
export function newTaskId(): string {
  return randomUUID()
}

/**
 * 解析后补齐身份（决策 25/30）。
 * ① 有 id ⇒ 直接用（trim 后）——手写 JSON 的老手自带 id 也算数，写错了后果自负；
 * ② 没 id ⇒ **内容指纹兜底**（`t-` + 32 位十六进制）。主路径（`ensureIdsInInlineJson`，
 * 录入瞬间随机 UUID 并回写）正常生效时走不到这里；兜底保持「同内容同 id」是**故意的**：
 * 万一回写失败（settings 面故障 / 容器在 meta 落盘前重启），每 tick 重新解析同一份
 * 无 id 文本时身份不会漂移、历史执行记录不会断链——随机 id 在这条异常路径上会每 tick
 * 换一个身份、把 pending 实例全部重建（冒烟当场测出）。
 */
export function withIdentity(def: TaskDefinitionInput): TaskDefinition {
  const code = def.code !== undefined && def.code.trim() !== '' ? def.code.trim() : undefined
  if (isUsableId(def.id)) {
    const id = def.id.trim()
    return { ...def, id, title: def.title ?? id, code }
  }
  const { id: _dropped, ...rest } = def
  const id = `t-${createHash('sha256').update(JSON.stringify(rest)).digest('hex').slice(0, 32)}`
  return { ...def, id, title: def.title ?? code ?? id, code }
}

/**
 * 给**内嵌任务表 JSON** 补 id（决策 25 修订版）：逐项检查，缺 id（或 id 格式不对）的生成并
 * 就地写回；返回新的 JSON 文本供宿主写回 settings。用户以后改名字、调顺序、删条目都不受影响
 * ——**id 就在配置里，跟着这条任务走**。
 *
 * @returns changed=true 表示有新增 id，调用方应把 json 写回配置；assigned 是补的条数。
 */
export function ensureIdsInInlineJson(raw: string): { json: string; changed: boolean; assigned: number } {
  const text = raw.trim()
  if (text === '') return { json: raw, changed: false, assigned: 0 }
  let data: unknown
  try {
    data = JSON.parse(text)
  } catch {
    return { json: raw, changed: false, assigned: 0 } // 非法 JSON：交给既有校验去告警，这里不动
  }
  if (!Array.isArray(data)) return { json: raw, changed: false, assigned: 0 }
  let assigned = 0
  for (const item of data) {
    if (item === null || typeof item !== 'object' || Array.isArray(item)) continue
    const record = item as Record<string, unknown>
    if (isUsableId(record.id)) {
      const trimmed = record.id.trim()
      if (trimmed !== record.id) record.id = trimmed
      continue
    }
    record.id = newTaskId() // 写进 JSON ⇒ 持久化，不再依赖任何位置或指纹
    assigned++
  }
  if (assigned === 0) return { json: raw, changed: false, assigned: 0 }
  return { json: JSON.stringify(data, null, 2), changed: true, assigned }
}

/** 把 ISO 8601 时长解析成毫秒。 */
export function durationMs(iso: string): number {
  const match = /^PT(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?$/.exec(iso)
  if (match === null) throw new Error(`非法 ISO 8601 时长: ${iso}`)
  const [, h, m, s] = match
  return (Number(h ?? 0) * 3600 + Number(m ?? 0) * 60 + Number(s ?? 0)) * 1000
}

/** 用 Intl 验证 IANA 时区名（schedule.timezone 缺省 = 宿主时区）。 */
export function isValidTimeZone(tz: string): boolean {
  try {
    new Intl.DateTimeFormat('en-CA', { timeZone: tz })
    return true
  } catch {
    return false
  }
}

/** 取某时刻在指定时区的日历日（logical date 归属用计划时刻，state-machine §9）。 */
export function logicalDateOf(date: Date, timeZone: string | undefined): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: timeZone ?? undefined,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(date)
}

/**
 * cron 在 `[from, to)` 区间内的**全部刻度**（决策 25 的核心改动）。
 *
 * 旧实现 `scheduledAtFor` 按「天」只取第一个匹配 ⇒ **每小时 / 每几分钟的 cron 一天只能出
 * 一条**，是功能缺陷。刻度**由 cron 表达式决定**，不是「上一次 + 间隔」⇒ 迟到 / 重启 /
 * 多跑几轮都不会漂移（8:01 才跑，记的仍是 `08:00` 这个槽）。
 *
 * @param cap 迭代上限（防御 cron 表达成极小间隔导致死循环）；超出即截断。
 */
export function scheduledSlotsFor(task: TaskDefinition | TaskDefinitionInput, from: Date, to: Date, cap = 20_000): Date[] {
  const cron = task.schedule.cron
  if (cron === undefined) return [] // once 任务不走 cron（互斥校验保证恰有其一）
  const interval = CronExpressionParser.parse(cron, {
    // -1ms：保证恰好落在 from 上的刻度不会被漏掉（cron-parser 的 next() 是严格大于）。
    currentDate: new Date(from.getTime() - 1),
    tz: task.schedule.timezone,
  })
  const slots: Date[] = []
  for (let i = 0; i < cap; i++) {
    const next = interval.next().toDate()
    if (next.getTime() >= to.getTime()) break
    if (next.getTime() >= from.getTime()) slots.push(next)
  }
  return slots
}

/**
 * 某日历日上的第一个刻度（重排与历史补跑用：决策 20 的 live 重排、§7 backfill
 * 都以「天」为粒度，保留一个刻度/天 的语义即可）。
 */
export function firstSlotOnDay(task: TaskDefinition, day: string): Date | undefined {
  if (task.schedule.once !== undefined) return onceScheduledAt(task, day)
  const anchor = Date.parse(`${day}T00:00:00`)
  // 前后各放宽：起点减 26h 覆盖最大时区偏移，终点加 48h 覆盖 DST 造成的日界漂移。
  const slots = scheduledSlotsFor(task, new Date(anchor - 26 * 3600_000), new Date(anchor + 48 * 3600_000))
  return slots.find(slot => logicalDateOf(slot, task.schedule.timezone) === day)
}

/** 给定时刻之后的下一个刻度（面板展示「下次执行」用）。 */
export function nextSlotAfter(task: TaskDefinition, from: Date): Date | undefined {
  if (task.schedule.once !== undefined) return onceScheduledAt(task, task.schedule.once.slice(0, 10))
  const slots = scheduledSlotsFor(task, from, new Date(from.getTime() + 366 * 24 * 3600_000), 2_000)
  return slots[0]
}

/** 某时区在给定绝对时刻的 UTC 偏移毫秒（DST 敏感）。 */
function tzOffsetMs(date: Date, timeZone: string): number {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone, hour12: false,
    year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', second: '2-digit',
  }).formatToParts(date)
  const value: Record<string, string> = {}
  for (const part of parts) value[part.type] = part.value
  const asUTC = Date.UTC(
    Number(value.year), Number(value.month) - 1, Number(value.day),
    Number(value.hour === '24' ? '0' : value.hour), Number(value.minute), Number(value.second),
  )
  return asUTC - date.getTime()
}

/**
 * 一次性任务的计划时刻（决策 18）：`once` = "YYYY-MM-DDTHH:mm"，
 * 按 schedule.timezone 的墙上时间解释（缺省 = 宿主时区）。
 * 仅当 once 的日期部分 == day 时返回该时刻，其余日期返回 undefined ——
 * 实例身份 = task_id + logical_date，once 只有一个日期 ⇒ 只生成一条实例，
 * 跑完（终态）后行已存在、日期已过 ⇒ 天然「跑完自动停」，次年不再触发。
 */
export function onceScheduledAt(task: TaskDefinition, day: string): Date | undefined {
  const once = task.schedule.once
  if (once === undefined || once.slice(0, 10) !== day) return undefined
  const match = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})$/.exec(once)
  if (match === null) return undefined // checkedTask 已保证格式，防御兜底
  const [, y, mo, d, h, mi] = match
  const tz = task.schedule.timezone
  if (tz === undefined) return new Date(`${once}:00`) // 无时区串 = 按宿主本地时区解释
  // 目标 = 「tz 墙上时间等于 once」的绝对时刻：wall 当 UTC 减去 tz 偏移；
  // 偏移依赖结果本身（DST 边界），迭代两次即收敛。
  const wallAsUTC = Date.UTC(Number(y), Number(mo) - 1, Number(d), Number(h), Number(mi))
  let t = new Date(wallAsUTC)
  t = new Date(wallAsUTC - tzOffsetMs(t, tz))
  t = new Date(wallAsUTC - tzOffsetMs(t, tz))
  return t
}

/** 单个任务定义的公共校验（schema + 互斥 + 时区 + cron/once），文件目录与内嵌两路共用。 */
function checkedTask(logger: HostLogger, label: string, data: unknown): TaskDefinitionInput | undefined {
  const parsed = taskDefinitionSchema.safeParse(data)
  if (!parsed.success) {
    logger.warn(`任务定义校验失败 ${label}: ${parsed.error.message}`)
    return undefined
  }
  const def = parsed.data
  // cron 与 once 恰有其一：周期任务用 cron，一次性任务用 once（决策 18）。
  if ((def.schedule.cron === undefined) === (def.schedule.once === undefined)) {
    logger.warn(`任务定义校验失败 ${label}: schedule.cron 与 schedule.once 必须恰有其一`)
    return undefined
  }
  if (def.schedule.timezone !== undefined && !isValidTimeZone(def.schedule.timezone)) {
    logger.warn(`任务定义时区非法 ${label}: ${def.schedule.timezone}`)
    return undefined
  }
  if (def.schedule.cron !== undefined) {
    try {
      CronExpressionParser.parse(def.schedule.cron, { tz: def.schedule.timezone })
    } catch (error) {
      logger.warn(`任务定义 cron 非法 ${label}: ${String(error)}`)
      return undefined
    }
  } else if (def.schedule.once !== undefined && !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(def.schedule.once)) {
    logger.warn(`任务定义 once 格式非法 ${label}: ${def.schedule.once}（应为 YYYY-MM-DDTHH:mm）`)
    return undefined
  }
  return def
}

/**
 * 解析内嵌任务表 JSON（tasksInline 配置，临时 UI）：须为数组，逐项校验，坏项告警跳过；
 * 每条经 `withIdentity` 补齐 id（没写就按定义内容取指纹兜底——正常路径下 id 已写回 JSON）。
 */
export function parseInlineTasks(logger: HostLogger, raw: string): TaskDefinition[] {
  const text = raw.trim()
  if (text.length === 0) return []
  let data: unknown
  try {
    data = JSON.parse(text)
  } catch (error) {
    logger.warn(`内嵌任务表 JSON 非法: ${String(error)}`)
    return []
  }
  if (!Array.isArray(data)) {
    logger.warn('内嵌任务表必须是 JSON 数组')
    return []
  }
  const tasks: TaskDefinition[] = []
  for (const [index, item] of data.entries()) {
    const def = checkedTask(logger, `内嵌任务表[${index}]`, item)
    if (def?.enabled) tasks.push(withIdentity(def))
  }
  return tasks
}

/** 目录读取告警去重：dir → 上次告警的错误文本（恢复可读时清空并提示一次）。 */
const dirWarnMemo = new Map<string, string>()

/**
 * 读任务表目录：逐文件 safeParse，坏文件告警跳过；返回 enabled 的定义。
 * 缺 id 的文件**直接写回**（决策 25 修订版：id 跟着定义走，不靠任何位置或指纹去推断）。
 * 目录不存在（ENOENT）= 合法空态（用户没在用目录模式），静默返回，不刷告警。
 */
export function loadTasks(logger: HostLogger, tasksDir: string): TaskDefinition[] {
  const dir = resolve(tasksDir)
  let names: string[]
  try {
    names = readdirSync(dir).filter(name => name.endsWith('.json')).sort()
  } catch (error) {
    if ((error as NodeJS.ErrnoException | undefined)?.code === 'ENOENT') return []
    // 其余不可读错误（权限等）：同一错误只告警一次，恢复可读或错误变化时再提示。
    const message = String(error)
    if (dirWarnMemo.get(dir) !== message) {
      dirWarnMemo.set(dir, message)
      logger.warn(`任务表目录不可读 ${dir}: ${message}`)
    }
    return []
  }
  if (dirWarnMemo.delete(dir)) logger.info(`任务表目录 ${dir} 恢复可读`)
  const tasks: TaskDefinition[] = []
  for (const name of names) {
    const file = `${dir}/${name}`
    try {
      if (!statSync(file).isFile()) continue
      const raw: unknown = JSON.parse(readFileSync(file, 'utf8'))
      // 决策 25 修订版：id 就写在定义文件里。缺 id ⇒ 生成并**写回文件**（用户看得见、进 Git）。
      if (raw !== null && typeof raw === 'object' && !Array.isArray(raw)) {
        const record = raw as Record<string, unknown>
        if (!isUsableId(record.id)) {
          record.id = newTaskId()
          writeFileSync(file, `${JSON.stringify(record, null, 2)}\n`)
          logger.info(`任务定义 ${file} 缺少 id，已生成并写回: ${record.id}`)
        }
      }
      const def = checkedTask(logger, file, raw)
      if (def?.enabled) tasks.push(withIdentity(def))
    } catch (error) {
      logger.warn(`任务定义读取失败 ${file}: ${String(error)}`)
    }
  }
  return tasks
}
