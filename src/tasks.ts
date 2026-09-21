// 任务定义：从任务表目录读 *.json，zod 校验 14 字段（data-model.md 一节），enabled 过滤。
// 定义存 JSON 文件人改进 Git（决策 6），本模块只读不写。
import { readdirSync, readFileSync, statSync } from 'node:fs'
import { resolve } from 'node:path'
import { z } from 'zod'
// cron-parser 5.x 为 ESM，命名导出 CronExpressionParser。
import { CronExpressionParser } from 'cron-parser'
import type { HostContext } from './host.js'

/** ISO 8601 时长（如 PT4H），只支持 H/M/S 组合——窗口与新鲜度够用。 */
const isoDuration = z.string().regex(/^PT(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?$/, 'ISO 8601 时长，如 PT4H')

export const dependencySemantics = ['same_period', 'latest_success'] as const
export type DependencySemantics = (typeof dependencySemantics)[number]

/** 任务定义 14 字段：data-model.md「任务定义」表，字段名严格照抄。 */
export const taskDefinitionSchema = z.object({
  id: z.string().regex(/^[a-z0-9]+(-[a-z0-9]+)*$/, 'kebab-case'),
  enabled: z.boolean(),
  schedule: z.object({
    cron: z.string().min(1),
    timezone: z.string().optional(),
    window: isoDuration,
  }),
  target: z.object({
    workspace: z.string().min(1),
    model: z.string().optional(),
    manual: z.string().optional(),
    prompt: z.string().min(1),
  }),
  contract: z.object({
    path: z.string().min(1),
    validStatuses: z.array(z.string()).default(['ok']),
  }),
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

export type TaskDefinition = z.infer<typeof taskDefinitionSchema>

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

/** 算任务在指定日历日的计划时刻；找不到（cron 与日历不产生该日）返回 undefined。 */
export function scheduledAtFor(task: TaskDefinition, day: string, searchFrom: Date): Date | undefined {
  const interval = CronExpressionParser.parse(task.schedule.cron, {
    currentDate: searchFrom,
    tz: task.schedule.timezone,
  })
  for (let i = 0; i < 62; i++) {
    const next = interval.next().toDate()
    const dayOf = logicalDateOf(next, task.schedule.timezone)
    if (dayOf === day) return next
    if (dayOf > day) return undefined
  }
  return undefined
}

/** 读任务表目录：逐文件 safeParse，坏文件告警跳过；返回 enabled 的定义。 */
export function loadTasks(ctx: HostContext, tasksDir: string): TaskDefinition[] {
  const dir = resolve(tasksDir)
  let names: string[]
  try {
    names = readdirSync(dir).filter(name => name.endsWith('.json')).sort()
  } catch (error) {
    ctx.logger.warn(`任务表目录不可读 ${dir}: ${String(error)}`)
    return []
  }
  const tasks: TaskDefinition[] = []
  for (const name of names) {
    const file = `${dir}/${name}`
    try {
      if (!statSync(file).isFile()) continue
      const parsed = taskDefinitionSchema.safeParse(JSON.parse(readFileSync(file, 'utf8')))
      if (!parsed.success) {
        ctx.logger.warn(`任务定义校验失败 ${file}: ${parsed.error.message}`)
        continue
      }
      const def = parsed.data
      if (def.schedule.timezone !== undefined && !isValidTimeZone(def.schedule.timezone)) {
        ctx.logger.warn(`任务定义时区非法 ${file}: ${def.schedule.timezone}`)
        continue
      }
      try {
        CronExpressionParser.parse(def.schedule.cron, { tz: def.schedule.timezone })
      } catch (error) {
        ctx.logger.warn(`任务定义 cron 非法 ${file}: ${String(error)}`)
        continue
      }
      if (def.enabled) tasks.push(def)
    } catch (error) {
      ctx.logger.warn(`任务定义读取失败 ${file}: ${String(error)}`)
    }
  }
  return tasks
}
