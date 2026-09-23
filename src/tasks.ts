// 任务定义：从任务表目录读 *.json，zod 校验 14 字段（data-model.md 一节），enabled 过滤。
// 定义存 JSON 文件人改进 Git（决策 6），本模块只读不写。
import { readdirSync, readFileSync, statSync } from 'node:fs'
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
 * 任务定义输入 schema（决策 25）：`id` **可选**——用户不写，由系统在首次加载时生成并
 * 记进状态库 `task_defs` 表（跨重启稳定）；`title` 是给人看的名字，任意文本（中文亦可），
 * 随时可改、**不参与身份**。
 */
export const taskDefinitionSchema = z.object({
  /** 系统生成并持久化（`task_defs` 表）；用户显式写了则以用户写的为准（兼容既有定义）。 */
  id: z.string().min(1).optional(),
  /** 用户可读名称：任意文本，可改，不影响身份与历史记录。缺省回退到 id。 */
  title: z.string().min(1).optional(),
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
 * 解析后的任务定义：`id` **必有**（未写时由调度器经 `store.resolveTaskId` 生成并回填）。
 * 全链路（scheduler / dispatch / reconcile）都按这个类型走，避免到处判空。
 */
export type TaskDefinition = Omit<TaskDefinitionInput, 'id'> & { id: string }

/** 展示名：优先 title，回退 id（决策 25：title 只是给人看的，永不参与身份）。 */
export function titleOf(task: TaskDefinition): string {
  return task.title ?? task.id
}

/** 任务来源标识（系统生成 id 的稳定锚点：inline 用下标，目录模式用文件路径）。 */
export interface TaskSource {
  /** 同一定位在多次加载间保持稳定 ⇒ 生成的 id 不会漂。 */
  sourceKey: string
  def: TaskDefinitionInput
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
 * 解析内嵌任务表 JSON（tasksInline 配置，临时 UI）：须为数组，逐项校验，坏项告警跳过。
 * 返回 **来源对**：`sourceKey` 用下标定位，供系统生成 / 复用的稳定 id 锚定（决策 25）。
 */
export function parseInlineTasks(logger: HostLogger, raw: string): TaskSource[] {
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
  const sources: TaskSource[] = []
  for (const [index, item] of data.entries()) {
    const def = checkedTask(logger, `内嵌任务表[${index}]`, item)
    if (def?.enabled) sources.push({ sourceKey: `inline:${index}`, def })
  }
  return sources
}

/**
 * 读任务表目录：逐文件 safeParse，坏文件告警跳过；返回 enabled 的定义。
 * `sourceKey` 用**文件绝对路径**（一文件一任务）⇒ 改文件内容、改 title 都不会丢 id。
 */
export function loadTasks(logger: HostLogger, tasksDir: string): TaskSource[] {
  const dir = resolve(tasksDir)
  let names: string[]
  try {
    names = readdirSync(dir).filter(name => name.endsWith('.json')).sort()
  } catch (error) {
    logger.warn(`任务表目录不可读 ${dir}: ${String(error)}`)
    return []
  }
  const sources: TaskSource[] = []
  for (const name of names) {
    const file = `${dir}/${name}`
    try {
      if (!statSync(file).isFile()) continue
      const def = checkedTask(logger, file, JSON.parse(readFileSync(file, 'utf8')))
      if (def?.enabled) sources.push({ sourceKey: `file:${file}`, def })
    } catch (error) {
      logger.warn(`任务定义读取失败 ${file}: ${String(error)}`)
    }
  }
  return sources
}
