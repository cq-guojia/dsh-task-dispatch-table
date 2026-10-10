// 任务定义：从任务表目录读 *.json，zod 校验 14 字段（data-model.md 一节），enabled 过滤。
// 定义存 JSON 文件人改进 Git（决策 6），本模块只读不写。
import { readdirSync, readFileSync, statSync } from 'node:fs'
import { randomUUID } from 'node:crypto'
import { resolve } from 'node:path'
import { z } from 'zod'
// cron-parser 5.x 为 ESM，命名导出 CronExpressionParser。
import { CronExpressionParser } from 'cron-parser'
import type { HostLogger } from './host.js'
import { isSafeAttachmentRef } from './attachment-allowlist.js'
// 「cron / once → 时刻」纯核已于 2026-10-05 抽出至 [`./schedule-next.ts`](./schedule-next.ts)
//（零 node 依赖，客户端 bundle 与服务端**同一份**）。这里 import 供内部使用（firstSlotOnDay 等），
// 并 re-export 保持既有调用面（runtime-index / scheduler / index）零改动。
import {
  filterSlotsBySchedule, logicalDateOf, nextSlotAfter, onceScheduledAt, scheduledSlotsFor,
} from './schedule-next.js'
export {
  filterSlotsBySchedule, logicalDateOf, nextSlotAfter, onceScheduledAt, scheduledSlotsFor,
} from './schedule-next.js'

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
  /**
   * 创建时间（2026-09-30，主界面卡片「创建于 X」）：**首次保存时由服务端写入，此后不再改**。
   * 可选 —— 老定义 / 手写 JSON 没有它，卡片就不显示这一行（不编造时间）。
   */
  createdAt: z.string().optional(),
  schedule: z.object({
    cron: z.string().min(1).optional(),
    timezone: z.string().optional(),
    window: isoDuration,
    once: z.string().optional(),
    /** 周期任务的锚点（YYYY-MM-DDTHH:mm）：首跑下界，也是「每 N 周」取模的参考周（该周 = 第 0 周）。缺省无锚点。 */
    start: z.string().optional(),
    /** 每周档的重复步长（周）：1 = 每周；≥2 = 每 N 周。cron 无隔周位 ⇒ 用锚点 + 取模实现（决策）。 */
    everyNWeeks: z.number().int().min(1).optional(),
    /**
     * 结构化排期的**编辑态快照**（2026-09-30 双写，data-model §5.4）：表单控件原样留档，
     * 供「编辑现有任务」反解。**执行永不读它**——排期真源恒为 `cron` / `once`。
     */
    ui: z.record(z.string(), z.unknown()).optional(),
  }),
  target: z.object({
    // 工作区（非工作目录，决策 22）：按 registry 的 title 精确匹配、id 兜底；目录由工作区 path 派生。
    workspace: z.string().min(1),
    /** 派发模型（决策 22 漏斗第①层）：provider 与 model 成对；都留空则漏到插件配置 / 宿主默认。 */
    provider: z.string().optional(),
    model: z.string().optional(),
    manual: z.string().optional(),
    prompt: z.string().min(1),
    /** 以 dsh 内置 /goal 开始执行（多轮续跑，决策 48）：缺省 true（用户拍板「默认都是多轮会话」）。 */
    goal: z.boolean().optional(),
    /** 多 Agent 协作（决策 49）：缺省 false；开启时派发消息注入官方 Agent Teams 执行指令（缺宿主组件降级单轮）。 */
    agentTeam: z.boolean().optional(),
    /** Agent 权限档位（决策 50）：缺省 'default' = 会话默认。宿主 0.2.0-rc.2 无按任务下发权限的
     *  参数（AgentOptions 只有 provider/model/reasoningEffort/maxTokens）⇒ 经派发消息约束指令执行。 */
    permission: z.enum(['default', 'readOnly', 'workspace', 'full']).optional(),
  }),
  // 回执机制（决策 19）：不再有契约文件与 path——agent 经 submit.mjs 直写状态库，
  // 这里只保留 status 合法值清单。
  contract: z
    .object({
      validStatuses: z.array(z.string()).default(['ok']),
    })
    .default({ validStatuses: ['ok'] }),
  retry: z.object({ maxAttempts: z.number().int().min(1).default(1) }).default({ maxAttempts: 1 }),
  depends_on: z
    .array(
      z.object({
        task: z.string().min(1),
        semantics: z.enum(dependencySemantics),
      }),
    )
    .optional(),
  // 附加文件（用户 2026-09-29）：link = 工作区路径（不复制）；upload = 插件数据目录文件名（落盘于 task-attachments/）。
  // 持久化随 P2 落库；此处先纳入 schema，保证手写 JSON 也能带附件、且 P2 无需再改型。
  attachments: z
    .array(
      z.object({
        id: z.string().min(1),
        name: z.string().min(1),
        kind: z.enum(['link', 'upload']),
        ref: z.string().min(1),
        /** link 型必带：来源工作区 title（同一路径在不同工作区指向不同文件）。 */
        workspace: z.string().optional(),
        /** 是否为目录（2026-10-09 起允许把整个文件夹当附件）。 */
        isDir: z.boolean().optional(),
      })
      .refine(
        // 唯一实现 = attachment-allowlist.isSafeAttachmentRef（客户端保存前校验 / 真删 / 上传定位同源）。
        item => isSafeAttachmentRef(item.ref),
        { message: '附件 ref 非法：不允许相对路径上跳、绝对路径或反斜杠' },
      ),
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
 * 会话显示名标题（决策 42）：title 回退 code，再回退短 id（前 8 位）。
 * 与 titleOf 的差别：code 也参与回退（编号比 UUID 对人更有意义），且永不落完整 UUID。
 */
export function displayNameOf(task: TaskDefinition): string {
  if (task.title !== undefined && task.title.trim() !== '') return task.title.trim()
  if (task.code !== undefined && task.code.trim() !== '') return task.code.trim()
  return task.id.slice(0, 8)
}

/** 计划时刻短格式 `YYMMDD-HHmm`（本地时区，决策 42；例 `260928-1600`）。 */
export function formatSlotShort(scheduledAtIso: string): string {
  const d = new Date(scheduledAtIso)
  if (Number.isNaN(d.getTime())) return scheduledAtIso
  const p = (n: number): string => String(n).padStart(2, '0')
  return `${p(d.getFullYear() % 100)}${p(d.getMonth() + 1)}${p(d.getDate())}-${p(d.getHours())}${p(d.getMinutes())}`
}

/**
 * 派发会话名（决策 42）：`[TASK] <260928-1600> · <标题>`，attempt>0（第 2 次起）追加「 · 第N次」。
 * 时间取计划时刻（重试不变，与执行记录「计划时刻」列一致）；重试后缀既点明重试、又防同刻度重名。
 */
export function sessionTitleOf(scheduledAtIso: string, displayName: string, attempt: number): string {
  const base = `[TASK] ${formatSlotShort(scheduledAtIso)} · ${displayName}`
  return attempt > 0 ? `${base} · 第${attempt + 1}次` : base
}

/** 标准 UUID（36 位带横线，大小写不敏感）——任务 id 的唯一合法形态（决策 30 修订）。 */
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

/** 任务 id 是否合法：必须是标准 UUID。手写 kebab-case / 旧内容指纹等一律不算。 */
export function isUuid(value: unknown): value is string {
  return typeof value === 'string' && UUID_RE.test(value)
}

/** 生成一个任务 id：标准 UUID（决策 30：机器身份与内容、名称彻底解耦，保存时生成并固化写入）。 */
export function newTaskId(): string {
  return randomUUID()
}

/** 保存闸门的身份处理结果。 */
export interface EnsureIdsResult {
  json: string
  changed: boolean
  assigned: number
  /** 非 null = **整批拒绝保存**：id 非 UUID，或 UUID 不在现有任务表中（决策 30 第三次拍板）。 */
  error: string | null
}

/**
 * 从已保存的 tasksInline 文本里提取全部合法 UUID 集合（保存闸门「修改必须命中」的比对基准）。
 * 非法 JSON / 非数组 / 非 UUID id（老数据）一律不算 ⇒ 拿 UUID 去改老记录同样会被拒（老记录无 UUID 身份，想用就删 id 重录）。
 */
export function existingUuidIds(raw: string): ReadonlySet<string> {
  let data: unknown
  try {
    data = JSON.parse(raw.trim())
  } catch {
    return new Set()
  }
  if (!Array.isArray(data)) return new Set()
  const ids = new Set<string>()
  for (const item of data) {
    if (item === null || typeof item !== 'object' || Array.isArray(item)) continue
    const id = (item as { id?: unknown }).id
    if (isUuid(id)) ids.add(id)
  }
  return ids
}

/**
 * 保存闸门（决策 30 修订版 + 第三次拍板，用户 2026-09-25：**保存时固化，运行时只认，UUID 不能凭空引入**）。
 * ① 条目无 id ⇒ 生成随机 UUID 补上（= 新增任务，这一刻固化进 JSON）；
 * ② 有 id 且是 UUID ⇒ 必须在 `existingIds`（现有已保存任务表）中命中，命中即原样保留（= 修改既有任务）；
 *    不命中 ⇒ 报错拒绝——带 UUID 就是修改，修改目标必须存在，UUID 身份只能由本闸门生成，不允许凭空写入；
 * ③ 有 id 但不是 UUID ⇒ 报错，**整批拒绝保存**；
 * 非法 JSON / 非数组原样返回（error=null）——那是既有校验的职责，不是身份闸门的。
 * `existingIds` 缺省（undefined）时跳过 ② 的命中校验（仅单测直调用）。
 */
export function ensureIdsInInlineJson(raw: string, existingIds?: ReadonlySet<string>): EnsureIdsResult {
  const text = raw.trim()
  if (text === '') return { json: raw, changed: false, assigned: 0, error: null }
  let data: unknown
  try {
    data = JSON.parse(text)
  } catch {
    return { json: raw, changed: false, assigned: 0, error: null }
  }
  if (!Array.isArray(data)) return { json: raw, changed: false, assigned: 0, error: null }
  let assigned = 0
  for (const [index, item] of data.entries()) {
    if (item === null || typeof item !== 'object' || Array.isArray(item)) continue
    const record = item as Record<string, unknown>
    const id = record.id
    if (id === undefined || id === null || (typeof id === 'string' && id.trim() === '')) {
      record.id = newTaskId() // 新增：保存这一刻生成并固化，之后运行时不再生成任何 id
      assigned++
      continue
    }
    if (typeof id === 'string' && UUID_RE.test(id)) {
      // 修改：带 UUID 即修改既有任务，必须在现有表中命中；UUID 只能由本闸门生成，凭空引入即非法
      if (existingIds !== undefined && !existingIds.has(id)) {
        const title = (record as { title?: unknown }).title
        return {
          json: raw, changed: false, assigned: 0,
          error: `第 ${index + 1} 条（${typeof title === 'string' && title.trim() !== '' ? title : '未命名'}）的 id "${id}"`
            + ' 不在现有任务表中——带 UUID 的 id 即为修改，只能指向已有任务；新增任务请删掉该条目的 id 字段',
        }
      }
      continue
    }
    const title = (record as { title?: unknown }).title
    return {
      json: raw, changed: false, assigned: 0,
      error: `第 ${index + 1} 条（${typeof title === 'string' && title.trim() !== '' ? title : '未命名'}）的 id "${String(id)}"`
        + ' 不是合法 UUID，拒绝保存。删掉该条目的 id 字段让系统重新生成，或原样保留系统生成的 id',
    }
  }
  if (assigned === 0) return { json: raw, changed: false, assigned: 0, error: null }
  return { json: JSON.stringify(data, null, 2), changed: true, assigned, error: null }
}

/**
 * 运行时身份校验（保存闸门的另一半，用户拍板：**运行时只认不修**）。
 * 有 id 且为 UUID ⇒ 归一返回（code trim、title 缺省回退 id）；
 * 无 id（老数据）或 id 非 UUID ⇒ 返回 null，调用方记一条 warn 后跳过，不做任何兜底。
 */
export function applyIdentity(def: TaskDefinitionInput): TaskDefinition | null {
  if (!isUuid(def.id)) return null
  const code = def.code !== undefined && def.code.trim() !== '' ? def.code.trim() : undefined
  return { ...def, id: def.id, title: def.title ?? def.id, code }
}

// ───────────────── 保存校验与整表合并（2026-09-30，P2 保存链路） ─────────────────

export interface SaveValidation {
  ok: boolean
  /** 不通过的原因（中文，直接给 UI 展示）。 */
  error: string | null
}

/**
 * 单条任务定义的保存校验（服务端把关，data-model §5.2 校验清单）：
 * ① 提示词非空；② 工作区非空；③ `cron` 与 `once` **恰有其一**且 cron 可解析；
 * ④ 前置任务必须指向已存在的任务（**停用可以、不存在不行**）。
 * `title` / `code` **不做**格式与唯一性校验（决策 30：它们只是人读字段）。
 */
export function validateDefinitionForSave(def: TaskDefinitionInput, existingIds: ReadonlySet<string>): SaveValidation {
  const prompt = typeof def.target?.prompt === 'string' ? def.target.prompt.trim() : ''
  if (prompt === '') return { ok: false, error: '提示词不能为空' }
  const workspace = typeof def.target?.workspace === 'string' ? def.target.workspace.trim() : ''
  if (workspace === '') return { ok: false, error: '工作区不能为空' }
  const cron = typeof def.schedule?.cron === 'string' && def.schedule.cron.trim() !== '' ? def.schedule.cron.trim() : undefined
  const once = typeof def.schedule?.once === 'string' && def.schedule.once.trim() !== '' ? def.schedule.once.trim() : undefined
  if (cron === undefined && once === undefined) return { ok: false, error: '排期缺失：周期任务必须有 cron，单次任务必须有 once' }
  if (cron !== undefined && once !== undefined) return { ok: false, error: '排期冲突：cron 与 once 只能有一个' }
  if (cron !== undefined) {
    try {
      CronExpressionParser.parse(cron, { tz: typeof def.schedule?.timezone === 'string' ? def.schedule.timezone : undefined })
    } catch (error) {
      return { ok: false, error: `cron 无法解析（${cron}）：${error instanceof Error ? error.message : String(error)}` }
    }
  } else if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(once ?? '')) {
    return { ok: false, error: '单次执行时刻格式应为 YYYY-MM-DDTHH:mm' }
  }
  const deps = def.depends_on
  if (Array.isArray(deps)) {
    for (const dep of deps) {
      if (dep === null || typeof dep !== 'object') continue
      const task = typeof (dep as { task?: unknown }).task === 'string' ? (dep as { task: string }).task : ''
      if (typeof def.id === 'string' && task === def.id) {
        return { ok: false, error: '前置任务不能是它自己（必然死锁）' }
      }
      if (task === '' || !existingIds.has(task)) {
        return { ok: false, error: `前置任务「${task === '' ? '（空）' : task}」不存在——停用可以，不存在不行` }
      }
    }
  }
  const timezone = def.schedule?.timezone
  if (typeof timezone === 'string' && timezone.trim() !== '') {
    try {
      new Intl.DateTimeFormat('en-US', { timeZone: timezone })
    } catch {
      return { ok: false, error: `时区「${timezone}」无法识别` }
    }
  }
  return { ok: true, error: null }
}

export interface UpsertResult {
  json: string
  mode: 'create' | 'update'
  /** 落定后的任务 id（新增时为系统刚生成的 UUID）。 */
  id: string
  error: string | null
}

/**
 * 把一条任务定义并回整表（新增 = 追加，修改 = 按 id 替换）。
 * **身份闸门在这里落地**：无 id ⇒ 生成 UUID（新增）；带 UUID ⇒ 必须命中现有表（修改）；
 * 非 UUID ⇒ 拒绝。
 * @param opts.allowNew - 表单通道专用：带 UUID 但表中没有 ⇒ **视为新增**（id 由服务端刚生成，
 *   可信）。整批 JSON 通道不传 ⇒ 沿用闸门语义（凭空引入的 UUID 一律拒）。
 */
export function upsertDefinitionInline(
  raw: string,
  definition: TaskDefinitionInput,
  opts: { allowNew?: boolean } = {},
): UpsertResult {
  const text = raw.trim()
  let data: unknown
  if (text === '') data = []
  else {
    try { data = JSON.parse(text) } catch { return { json: raw, mode: 'create', id: '', error: '现有任务表不是合法 JSON，无法保存' } }
    if (!Array.isArray(data)) return { json: raw, mode: 'create', id: '', error: '现有任务表不是数组，无法保存' }
  }
  const rows = data as Record<string, unknown>[]
  const rawId = definition.id
  if (rawId === undefined || rawId === null || (typeof rawId === 'string' && rawId.trim() === '')) {
    const id = newTaskId()
    rows.push({ ...definition, id })
    return { json: JSON.stringify(rows, null, 2), mode: 'create', id, error: null }
  }
  if (!isUuid(rawId)) return { json: raw, mode: 'update', id: String(rawId), error: `id "${String(rawId)}" 不是合法 UUID` }
  const index = rows.findIndex(row => row !== null && typeof row === 'object' && (row as { id?: unknown }).id === rawId)
  if (index < 0) {
    // 表单通道（id 由服务端刚生成）⇒ 视为新增；整批 JSON 通道 ⇒ 拒（闸门：UUID 不能凭空引入）。
    if (opts.allowNew === true) {
      rows.push({ ...definition, id: rawId })
      return { json: JSON.stringify(rows, null, 2), mode: 'create', id: rawId, error: null }
    }
    return { json: raw, mode: 'update', id: rawId, error: `任务 ${rawId} 不在现有任务表中，无法修改` }
  }
  rows[index] = { ...definition, id: rawId }
  return { json: JSON.stringify(rows, null, 2), mode: 'update', id: rawId, error: null }
}

export interface RemoveResult {
  json: string
  removed: boolean
  error: string | null
}

/** 从整表里摘掉一条任务定义（删除任务；实例 / 事件保留在库里做审计）。 */
export function removeDefinitionInline(raw: string, id: string): RemoveResult {
  const text = raw.trim()
  if (text === '') return { json: raw, removed: false, error: null }
  let data: unknown
  try { data = JSON.parse(text) } catch { return { json: raw, removed: false, error: '现有任务表不是合法 JSON，无法删除' } }
  if (!Array.isArray(data)) return { json: raw, removed: false, error: '现有任务表不是数组，无法删除' }
  const rows = (data as Record<string, unknown>[]).filter(
    row => !(row !== null && typeof row === 'object' && (row as { id?: unknown }).id === id),
  )
  const removed = rows.length !== (data as unknown[]).length
  return { json: JSON.stringify(rows, null, 2), removed, error: null }
}

export interface SetEnabledResult { json: string; changed: boolean; error: string | null }

/**
 * 只改一条任务的 `enabled`（编辑器头部的启用开关实时写回，用户 2026-09-30：独立于保存按钮）。
 * 定义不存在 ⇒ error（404 语义）；值没变 ⇒ changed=false（不落库不审计）。
 */
export function setEnabledDefinitionInline(raw: string, id: string, enabled: boolean): SetEnabledResult {
  const text = raw.trim()
  let data: unknown
  if (text === '') return { json: raw, changed: false, error: 'task-not-found' }
  try { data = JSON.parse(text) } catch { return { json: raw, changed: false, error: '现有任务表不是合法 JSON，无法修改' } }
  if (!Array.isArray(data)) return { json: raw, changed: false, error: '现有任务表不是数组，无法修改' }
  const rows = data as Record<string, unknown>[]
  const row = rows.find(item => item !== null && typeof item === 'object' && item.id === id)
  if (row === undefined) return { json: raw, changed: false, error: 'task-not-found' }
  if (row.enabled === enabled) return { json: raw, changed: false, error: null }
  row.enabled = enabled
  return { json: JSON.stringify(rows, null, 2), changed: true, error: null }
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

// 「cron / once → 时刻」的纯计算（logicalDateOf / intervalSpecOf / anchoredIntervalSlots /
// scheduledSlotsFor / filterSlotsBySchedule / wallClockToAbsolute 及其私有辅助）
// 已于 2026-10-05 **原样迁出** ⇒ [`./schedule-next.ts`](./schedule-next.ts)（见该文件头说明）。
// tasks.ts 顶部已 import + re-export，内部（firstSlotOnDay）与外部调用面零改动。

/**
 * 某日历日上的第一个刻度（面板展示「下次执行」/ 目录模式历史锚点用；
 * 决策 20 的 live 重排与 §7 backfill 已于决策 31 移除，不再依赖「天」粒度补跑）。
 */
export function firstSlotOnDay(task: TaskDefinition, day: string): Date | undefined {
  if (task.schedule.once !== undefined) return onceScheduledAt(task, day)
  const anchor = Date.parse(`${day}T00:00:00`)
  // 前后各放宽：起点减 26h 覆盖最大时区偏移，终点加 48h 覆盖 DST 造成的日界漂移。
  const slots = scheduledSlotsFor(task, new Date(anchor - 26 * 3600_000), new Date(anchor + 48 * 3600_000))
  return slots.find(slot => logicalDateOf(slot, task.schedule.timezone) === day)
}

// nextSlotAfter / tzOffsetMs / onceScheduledAt 同批迁出 ⇒ schedule-next.ts（见上方说明）。

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
  if (def.schedule.start !== undefined && !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(def.schedule.start)) {
    logger.warn(`任务定义 start 格式非法 ${label}: ${def.schedule.start}（应为 YYYY-MM-DDTHH:mm）`)
    return undefined
  }
  return def
}

/**
 * 解析内嵌任务表 JSON（tasksInline 配置）：须为数组，逐项校验，坏项告警跳过。
 * 身份走 `applyIdentity`（决策 30 修订：**运行时只认不修**）——无 id / 非 UUID 的条目
 * warn 跳过，绝不在这里生成或兜底 id；生成只发生在保存闸门 `ensureIdsInInlineJson`。
 */
export function parseInlineTasks(
  logger: HostLogger,
  raw: string,
  opts: { includeDisabled?: boolean } = {},
): TaskDefinition[] {
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
    if (def === undefined || (!opts.includeDisabled && !def.enabled)) continue
    const task = applyIdentity(def)
    if (task === null) {
      logger.warn(`内嵌任务表[${index}] 缺少合法 UUID 的 id，不处理（保存时应由系统生成并固化写入）`)
      continue
    }
    tasks.push(task)
  }
  return tasks
}

/** 目录读取告警去重：dir → 上次告警的错误文本（恢复可读时清空并提示一次）。 */
const dirWarnMemo = new Map<string, string>()

/**
 * 读任务表目录：逐文件 safeParse，坏文件告警跳过；返回 enabled 的定义。
 * 身份同样「运行时只认」（决策 30 修订）：缺 id / id 非 UUID 的文件 warn 跳过，**不再写回**。
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
      const def = checkedTask(logger, file, raw)
      if (def === undefined || !def.enabled) continue
      const task = applyIdentity(def)
      if (task === null) {
        logger.warn(`任务定义 ${file} 缺少合法 UUID 的 id，不处理（请补一个 UUID 或删掉 id 字段后经面板保存生成）`)
        continue
      }
      tasks.push(task)
    } catch (error) {
      logger.warn(`任务定义读取失败 ${file}: ${String(error)}`)
    }
  }
  return tasks
}
