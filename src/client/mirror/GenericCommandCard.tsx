// 官方对照：packages/client/ui-tool/src/client/tool/（0.1.7-rc.2 lib/client.js）。
// 官方会话里的工具卡 = ui-tool 的 GenericToolCard → ToolRow（chat 包同名文件只是 command 节点兜底，
// 本文件名沿用历史，实际镜像 GenericToolCard + ToolRow 一套）。
// 展开体分发链照官方 ToolRow（lib/client.js:1598-1688）：
//   TerminalBlock（bash/pwsh/terminal_send，maxLines:∞）→ DiffBlock（write/edit，maxLines:9）
//   → ReadBlock（read，maxLines:8 = 头 4 + 尾 4，中间「… 其余 N 行」）→ 兜底 ioCard 灰框（输入/分隔/输出）。
// 数据模型照官方 models/*（行号为 lib/client.js）：toolRowModel 273、diffCardModel 534、
//   readCardModel 421、terminalCardModel 929、parseExitStatus 903、hasSpillNotice 692；
// 摘要与五态同构：state = preparing|running|ok|error|stopped（成功结算但退出码非 0 ⇒ error，1767）；
//   summary = [generic? 工具名, deriveSummary]，终端卡优先 description；error 态摘要 = 输出首行。
import { Fragment, createElement as h, useMemo, useState } from 'react'
import type { MouseEvent as ReactMouseEvent, ReactNode } from 'react'
import {
  DiffBlock,
  DisclosureRow,
  IconApiOutlineRegular,
  IconBrowseOutlineRegular,
  IconCodeOutlineRegular,
  IconEditOutlineRegular,
  IconSearchOutlineRegular,
  IconSparkleRegular,
  ReadBlock,
  TerminalBlock,
  TextShimmer,
  diffTotals,
} from '@deepseek-ai/dsh-client-ui-primitives'
import { ocOr } from '../official-classes'
import type { LocaleKey, Translate } from '../locales'
import { CodeViewer } from '../ui/CodeViewer'

type ToolState = 'preparing' | 'running' | 'ok' | 'error' | 'stopped'
type Variant = 'bash' | 'read' | 'search' | 'write' | 'edit' | 'code' | 'others'

/** 官方 TOOL_VARIANTS（tool client.js:83-100，cordis_* 一并保留）。 */
const TOOL_VARIANTS: Readonly<Record<string, Variant>> = {
  bash: 'bash',
  pwsh: 'bash',
  read: 'read',
  read_image: 'read',
  web_fetch: 'read',
  web_search: 'search',
  grep: 'search',
  glob: 'search',
  write: 'write',
  edit: 'edit',
  run_code: 'code',
  cordis_package_inspect: 'read',
  cordis_runtime_inspect: 'read',
  cordis_run: 'others',
  cordis_stop: 'others',
  cordis_undefine: 'others',
}
const classifyTool = (name: string): Variant => TOOL_VARIANTS[name] ?? 'others'

/** 官方 VARIANT_TITLE_KEYS + TOOL_TITLE_KEYS（tool client.js:65-149；本仓库键名前缀 toolTitle）。 */
const VARIANT_TITLE_KEYS: Readonly<Record<Variant, LocaleKey>> = {
  search: 'toolTitleSearch',
  read: 'toolTitleRead',
  bash: 'toolTitleBash',
  write: 'toolTitleWrite',
  edit: 'toolTitleEdit',
  code: 'toolTitleCode',
  others: 'toolTitleGeneric',
}
const TOOL_TITLE_KEYS: Readonly<Record<string, LocaleKey>> = {
  pwsh: 'toolTitleBash',
  read_image: 'toolTitleReadImage',
  grep: 'toolTitleGrep',
  glob: 'toolTitleGlob',
  web_search: 'toolTitleWebSearch',
  web_fetch: 'toolTitleWebFetch',
}
const toolTitleKey = (name: string): LocaleKey =>
  TOOL_TITLE_KEYS[name] ?? VARIANT_TITLE_KEYS[classifyTool(name)]

/** 官方 VARIANT_ICONS（tool client.js:1749-1757，size 14）。 */
const VARIANT_ICONS: Readonly<Record<Variant, ReactNode>> = {
  search: h(IconSearchOutlineRegular, { size: 14 }),
  read: h(IconBrowseOutlineRegular, { size: 14 }),
  bash: h(IconApiOutlineRegular, { size: 14 }),
  write: h(IconEditOutlineRegular, { size: 14 }),
  edit: h(IconEditOutlineRegular, { size: 14 }),
  code: h(IconCodeOutlineRegular, { size: 14 }),
  others: h(IconSparkleRegular, { size: 14 }),
}

/** 官方 SUMMARY_KEYS（tool client.js:204-220）：摘要取参键偏好。 */
const SUMMARY_KEYS: Readonly<Record<Variant, readonly string[]>> = {
  bash: ['description', 'command'],
  read: ['path', 'file_path', 'url'],
  search: ['query', 'pattern', 'url'],
  write: ['path', 'file_path'],
  edit: ['path', 'file_path'],
  code: ['description'],
  others: [],
}
/** 官方 FILE_PATH_VARIANTS（tool client.js:237-241）：摘要可开预览的文件型变体。 */
const FILE_PATH_VARIANTS: ReadonlySet<Variant> = new Set(['read', 'write', 'edit'])

const firstLine = (text: string): string => {
  const nl = text.indexOf('\n')
  return nl === -1 ? text : text.slice(0, nl)
}
/** 官方 parseArgs（tool client.js:186-192）。 */
const parseArgs = (raw: string): unknown => {
  try { return JSON.parse(raw) } catch { return undefined }
}
const pickString = (args: Record<string, unknown>, keys: readonly string[]): string | undefined => {
  for (const key of keys) {
    const value = args[key]
    if (typeof value === 'string' && value !== '') return value
  }
  return undefined
}

/** 官方 deriveSummary（tool client.js:221-233）。 */
function deriveSummary(variant: Variant, argsRaw: string): string {
  const parsed = parseArgs(argsRaw)
  if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) return firstLine(argsRaw)
  const args = parsed as Record<string, unknown>
  if (variant === 'search' && Array.isArray(args.queries)) {
    const queries = (args.queries as unknown[]).filter((query): query is string => typeof query === 'string' && query !== '')
    if (queries.length > 0) return queries.map(firstLine).join(', ')
  }
  const picked = pickString(args, SUMMARY_KEYS[variant])
  if (picked !== undefined) return firstLine(picked)
  for (const value of Object.values(args)) if (typeof value === 'string' && value !== '') return firstLine(value)
  return firstLine(argsRaw)
}

/** 官方 deriveFilePath（tool client.js:242-248）：read/write/edit 的路径取参。 */
function deriveFilePath(variant: Variant, argsRaw: string): string | undefined {
  if (!FILE_PATH_VARIANTS.has(variant)) return undefined
  const parsed = parseArgs(argsRaw)
  if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) return undefined
  const picked = pickString(parsed as Record<string, unknown>, ['path', 'file_path'])
  return picked === undefined ? undefined : firstLine(picked)
}

/** 官方 formatToolBody（tool client.js:255-264）：通用展开体的输入正文。 */
function formatToolBody(variant: Variant, argsRaw: string): string | null {
  if (argsRaw === '') return null
  const parsed = parseArgs(argsRaw)
  if (parsed === undefined) return argsRaw
  if (variant === 'code' && typeof parsed === 'object' && parsed !== null) {
    const code = (parsed as Record<string, unknown>).code
    if (typeof code === 'string' && code !== '') return code
  }
  return JSON.stringify(parsed, null, 2)
}

/** 官方 validEscalationFields（tool client.js:347-353）。 */
function validEscalationFields(args: Record<string, unknown>): boolean {
  const permission = args.sandbox_permissions
  const justification = args.justification
  if (permission === undefined && justification === undefined) return true
  if (permission !== 'workspace-write' && permission !== 'danger-full-access') return false
  return typeof justification === 'string' && justification.trim() !== ''
}

interface DiffFace { path: string; oldText: string | null; newText: string }

/** 官方 intendedDiff（tool client.js:460-517）：write/edit/str_replace_editor 的参数侧意图 diff。 */
function intendedDiff(name: string, argsRaw: string): { tool: string; diff: DiffFace } | null {
  const parsed = parseArgs(argsRaw)
  if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) return null
  const args = parsed as Record<string, unknown>
  if (name === 'str_replace_editor') {
    const { command, path, file_text: fileText, old_str: oldText, new_str: newText } = args
    if (typeof path !== 'string' || path.trim() === '') return null
    if (command === 'create') {
      if (fileText !== undefined && typeof fileText !== 'string') return null
      return { tool: name, diff: { path, oldText: null, newText: typeof fileText === 'string' ? fileText : '' } }
    }
    if (command === 'str_replace') {
      if (oldText !== undefined && typeof oldText !== 'string') return null
      if (newText !== undefined && typeof newText !== 'string') return null
      return { tool: name, diff: { path, oldText: typeof oldText === 'string' ? oldText : null, newText: typeof newText === 'string' ? newText : '' } }
    }
    return null
  }
  const { file_path: path } = args
  if (typeof path !== 'string' || path.trim() === '') return null
  if (!validEscalationFields(args)) return null
  if (name === 'write') {
    const { content } = args
    return typeof content === 'string' ? { tool: name, diff: { path, oldText: null, newText: content } } : null
  }
  if (name !== 'edit') return null
  const { old_string: oldText, new_string: newText, replace_all: replaceAll } = args
  if (typeof oldText !== 'string' || typeof newText !== 'string') return null
  if (replaceAll !== undefined && typeof replaceAll !== 'boolean') return null
  return { tool: name, diff: { path, oldText: oldText || null, newText } }
}

/** 官方 narrowDiffs（tool client.js:443-459）。 */
function narrowDiffs(diffs: unknown): DiffFace[] | null {
  if (!Array.isArray(diffs) || diffs.length === 0) return null
  const out: DiffFace[] = []
  for (const hunk of diffs) {
    if (typeof hunk !== 'object' || hunk === null || Array.isArray(hunk)) return null
    const { path, oldText, newText } = hunk as Record<string, unknown>
    if (typeof path !== 'string') return null
    if (oldText !== null && typeof oldText !== 'string') return null
    if (typeof newText !== 'string') return null
    out.push({ path, oldText, newText })
  }
  return out
}

/** 官方 appliedDiffs（tool client.js:518-524）。 */
function appliedDiffs(meta: unknown): DiffFace[] | 'empty' | null {
  if (typeof meta !== 'object' || meta === null || Array.isArray(meta)) return null
  const diffs = (meta as { diffs?: unknown }).diffs
  if (!Array.isArray(diffs)) return null
  if (diffs.length === 0) return 'empty'
  return narrowDiffs(diffs)
}

/** 官方 diffCardModel（tool client.js:534-544；keyed 流里只有根调用，parentCallId 分支略）。 */
function diffCardModel(name: string, argsRaw: string, meta: unknown, isError: boolean, settled: boolean): DiffFace[] | null {
  const intended = intendedDiff(name, argsRaw)
  if (intended === null) return null
  if (!settled) return [intended.diff]
  if (name === 'str_replace_editor') return null
  if (isError) return null
  const applied = appliedDiffs(meta)
  if (applied === null || applied === 'empty') return name === 'write' ? [intended.diff] : null
  return applied
}

interface ReadFace { label: string; lines: readonly { number: number; text: string }[]; totalLines: number; lang?: string }

const positiveInteger = (value: unknown): value is number =>
  typeof value === 'number' && Number.isInteger(value) && value >= 1

/** 官方 readMeta（tool client.js:369-395）：宿主写入的读取窗口 meta 收窄。 */
function readMeta(meta: unknown): ReadFace | null {
  if (typeof meta !== 'object' || meta === null || Array.isArray(meta)) return null
  const { path, offset, lines, totalLines, lang } = meta as Record<string, unknown>
  if (typeof path !== 'string' || typeof offset !== 'number' || !Number.isInteger(offset) || offset < 1) return null
  if (typeof totalLines !== 'number' || !Number.isInteger(totalLines) || totalLines < 0 || !Array.isArray(lines)) return null
  if (lang !== undefined && typeof lang !== 'string') return null
  const narrowed: { number: number; text: string }[] = []
  let previous = offset - 1
  for (const line of lines as unknown[]) {
    if (typeof line !== 'object' || line === null || Array.isArray(line)) return null
    const { number, text } = line as Record<string, unknown>
    if (typeof number !== 'number' || !Number.isInteger(number) || number < 1 || number <= previous) return null
    if (number > (totalLines as number) || typeof text !== 'string') return null
    previous = number
    narrowed.push({ number, text })
  }
  return { label: path, lines: narrowed, totalLines: totalLines as number, ...(lang === undefined ? {} : { lang }) }
}

/** 官方 readCardModel（tool client.js:421-435）：read + 合法参数 + meta + 结果 envelope。 */
function readCardModel(name: string, argsRaw: string, output: string, meta: unknown, isError: boolean, settled: boolean): ReadFace | null {
  if (!settled || isError || name !== 'read') return null
  const parsed = parseArgs(argsRaw)
  if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) return null
  const { file_path: path, offset, limit } = parsed as Record<string, unknown>
  if (typeof path !== 'string' || path.trim() === '') return null
  if (offset !== undefined && !positiveInteger(offset)) return null
  if (limit !== undefined && !positiveInteger(limit)) return null
  const face = readMeta(meta)
  if (face === null) return null
  // 官方结果 envelope（read 工具输出格式）不匹配 ⇒ 走 generic。
  if (/^<path>[^\n]*<\/path>\n<type>file<\/type>\n<content>\n([\s\S]*)\n<\/content>$/u.exec(output)?.[1] === undefined) return null
  return face
}

/** 终端卡规格（官方 localizeTerminalCardModel 的 card 面；send 的命令/描述在组件侧词典化）。 */
interface TerminalFace {
  command: string
  cwd?: string
  output?: string
  exitCode?: number | null
  signal?: string
  running: boolean
  /** send 卡：描述 = t('terminalSession', { sessionId })；shell 卡描述直接来自参数。 */
  sessionId?: string
  description?: string
}

/** 官方 shellCall（tool client.js:831-855）：无 description = persistent（结算走 generic）。 */
function shellCall(name: string, args: Record<string, unknown>): { command: string; description: string; workdir?: string; persistent: boolean; background: boolean } | null {
  if (name !== 'bash' && name !== 'pwsh') return null
  const { command, description, timeoutMs, workdir, run_in_background: background } = args
  if (typeof command !== 'string' || command.trim() === '') return null
  if (timeoutMs !== undefined && (typeof timeoutMs !== 'number' || !Number.isFinite(timeoutMs) || timeoutMs <= 0)) return null
  if (workdir !== undefined && typeof workdir !== 'string') return null
  if (background !== undefined && typeof background !== 'boolean') return null
  if (!validEscalationFields(args)) return null
  if (description === undefined) return { command, description: '', workdir: undefined, persistent: true, background: false }
  if (typeof description !== 'string' || description.trim() === '') return null
  return { command, description, workdir, persistent: false, background: background === true }
}

/** 官方 terminalSendCall（tool client.js:884-896）。 */
function terminalSendCall(name: string, args: Record<string, unknown>): { text: string; sessionId: string; background: boolean } | null {
  if (name !== 'terminal_send') return null
  const { sessionId, text, run_in_background: background } = args
  if (typeof sessionId !== 'string' || sessionId === '' || typeof text !== 'string') return null
  if (background !== undefined && typeof background !== 'boolean') return null
  return { text, sessionId, background: background === true }
}

/** 官方 parseExitStatus（tool client.js:903-918）：结果尾部退出码 / 信号标记剥离。 */
function parseExitStatus(text: string): { output: string; exitCode?: number; signal?: string } {
  const signal = /\n\[killed by signal: ([^\]\n]+)\]$/.exec(text)
  if (signal?.[1] !== undefined) return { output: text.slice(0, signal.index), signal: signal[1] }
  const exit = /\n\[exit code: (\d+)\]$/.exec(text)
  if (exit?.[1] !== undefined) return { output: text.slice(0, exit.index), exitCode: Number(exit[1]) }
  return { output: text, exitCode: 0 }
}

/**
 * 官方 spill notice 识别（spill-policy notice.ts，tool client.js:660-703）：
 * 结尾 `)` + 「\n\n( Full formatted result stored at: 」段。超长输出被 spill 化的
 * bash 结果走 generic（官方 isSpilledShellCall 同向；此处放宽为字面匹配，宁滥勿漏）。
 */
function hasSpillNotice(text: string): boolean {
  if (!text.endsWith(')')) return false
  return text.includes('\n\n( Full formatted result stored at: ')
}

/** 官方 resolveTerminalCwd + normalizeSegments（tool client.js:776-798）的显示用简化版：
 *  弹窗侧拿不到会话 cwd ⇒ 绝对路径原样、相对路径弹出 `.`/`..` 段。 */
function normalizeSegments(path: string): string {
  if (!/(?:^|[/\\])\.\.?(?:[/\\]|$)/.test(path)) return path
  const out: string[] = []
  for (const segment of path.split(/[/\\]+/)) {
    if (segment === '' || segment === '.') continue
    if (segment === '..') { out.pop(); continue }
    out.push(segment)
  }
  return out.join('/')
}

/** 官方 terminalCardModel（tool client.js:929-968）：running 半截返回 running 卡。 */
function terminalCardModel(name: string, argsRaw: string, output: string, isError: boolean, settled: boolean): TerminalFace | null {
  const parsed = parseArgs(argsRaw)
  if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) return null
  const args = parsed as Record<string, unknown>
  const shell = shellCall(name, args)
  const send = shell === null ? terminalSendCall(name, args) : null
  if (shell === null && send === null) return null
  if ((shell !== null && shell.background) || (send !== null && send.background)) return null
  if (!settled) {
    return shell !== null
      ? { command: shell.command, cwd: shell.workdir === undefined ? undefined : normalizeSegments(shell.workdir), running: true }
      : { command: (send as NonNullable<typeof send>).text, running: true, sessionId: (send as NonNullable<typeof send>).sessionId }
  }
  if (isError || (shell !== null && shell.persistent) || hasSpillNotice(output)) return null
  if (send !== null) return { command: send.text, running: false, sessionId: send.sessionId }
  const shellCmd = shell as NonNullable<typeof shell>
  const status = parseExitStatus(output)
  return {
    command: shellCmd.command,
    cwd: shellCmd.workdir === undefined ? undefined : normalizeSegments(shellCmd.workdir),
    output: status.output,
    exitCode: status.exitCode,
    signal: status.signal,
    running: false,
  }
}

/** 词典：代码工具栏（官方 codeToolbarLabels，tool client.js:1098-1104）。 */
const codeToolbarLabels = (t: Translate) => ({
  codeLabel: t('codeBlockLabel'),
  wrapLabel: t('diffWrapLabel'),
  unwrapLabel: t('diffUnwrapLabel'),
})
/** 官方 diffBlockLabels（tool client.js:1125-1135）。 */
const diffLabels = (t: Translate) => ({
  ...codeToolbarLabels(t),
  copy: t('copyLabel'),
  copied: t('copiedLabel'),
  collapseAria: t('diffCollapseAria'),
  expandAria: (count: number) => t('diffExpandAria', { count }),
  collapse: t('collapseLabel'),
  expand: (count: number) => t('diffExpandRest', { count }),
})
/** 官方 readBlockLabels（tool client.js:1141-1155）。 */
const readLabels = (t: Translate) => ({
  ...codeToolbarLabels(t),
  window: (shown: number, total: number) => t('readWindow', { shown, total }),
  copy: t('copyLabel'),
  copied: t('copiedLabel'),
  collapseAria: t('readCollapseAria'),
  expandAria: (count: number) => t('readExpandAria', { count }),
  collapse: t('collapseLabel'),
  expand: (count: number) => t('readExpandRest', { count }),
})
/** 官方 terminalBlockLabels（tool client.js:708-737 的键面）。 */
const terminalLabels = (t: Translate) => ({
  signal: (signal: string) => t('terminalSignal', { signal }),
  exitCode: (code: number) => t('terminalExitCode', { code }),
  noExitCode: t('terminalNoExitCode'),
  running: t('terminalRunning'),
  failed: t('terminalFailed'),
  done: t('terminalDone'),
  copy: t('copyLabel'),
  copied: t('copiedLabel'),
  noOutput: t('terminalNoOutput'),
  collapseAria: t('terminalCollapseAria'),
  collapse: t('collapseLabel'),
  expandAria: (hidden: number) => t('terminalExpandAria', { n: hidden }),
  expand: (hidden: number) => t('terminalExpandRest', { n: hidden }),
})

/** 摘要链接（官方 fileLink）：点击只跟随、不折叠行。 */
const stopLinkClick = (event: ReactMouseEvent<HTMLButtonElement>): void => { event.stopPropagation() }

/**
 * 工具调用 / 命令卡（官方 GenericToolCard + ToolRow 镜像）。
 * 折叠行 = 图标 + 标题 [+ 分隔点 + 摘要（文件路径链接化）+ 后缀]；展开体按官方分发链。
 */
export function GenericCommandCard(props: {
  name: string
  argsRaw: string
  output: string
  isError: boolean
  errorName?: string
  /** 官方 ToolResultNode.meta（tool-fs diffs / read 窗口；归档会话经 snapshot 透传）。 */
  meta?: unknown
  /** 上游是否已结算（keyed kind==='tool-result'）；缺省按已结算（legacy 节点）。 */
  settled?: boolean
  /** running 半截的 phase（官方 Tool block.phase）。 */
  phase?: 'preparing' | 'start'
  /** root.error.code === 'interrupted' ⇒ 官方 stopped 态。 */
  interrupted?: boolean
  /** U11 统一 openFile 入口：read/write/edit 摘要路径渲染成官方 fileLink。 */
  onOpenFile?: (path: string) => void
  t: Translate
}): ReturnType<typeof h> {
  const { name, argsRaw, output, isError, meta, settled = true, phase, interrupted, onOpenFile, t } = props
  const [expanded, setExpanded] = useState(false)
  const variant = classifyTool(name)
  const titleKey = toolTitleKey(name)
  const state: ToolState = !settled
    ? (phase === 'preparing' ? 'preparing' : 'running')
    : interrupted ? 'stopped' : isError ? 'error' : 'ok'
  const terminalFace = useMemo(() => terminalCardModel(name, argsRaw, output, isError, settled), [name, argsRaw, output, isError, settled])
  const read = useMemo(() => readCardModel(name, argsRaw, output, meta, isError, settled), [name, argsRaw, output, meta, isError, settled])
  const diffs = useMemo(() => diffCardModel(name, argsRaw, meta, isError, settled), [name, argsRaw, meta, isError, settled])
  // 终端卡展开体（官方 localizeTerminalCardModel：send 命令空 = （发送输入），描述 = 终端 {sessionId}）。
  const terminal = useMemo(() => {
    if (terminalFace === null) return null
    return terminalFace.sessionId !== undefined
      ? { ...terminalFace, command: terminalFace.command === '' ? t('terminalSendInput') : terminalFace.command, description: t('terminalSession', { sessionId: terminalFace.sessionId }) }
      : terminalFace
  }, [terminalFace, t])
  // 官方 terminalFailed（tool client.js:763-766）：成功结算但退出码非 0 / 有信号 ⇒ 整行 error。
  const failedTerminal = terminal !== null && terminal.running !== true
    && ((terminal.exitCode !== undefined && terminal.exitCode !== 0) || terminal.signal !== undefined)
  const rowState: ToolState = state === 'ok' && failedTerminal ? 'error' : state
  const running = rowState === 'running' || rowState === 'preparing'
  // 摘要（官方 toolRowModel 273-295 + ToolRow 1527-1528）：generic 标题补工具名；
  // 终端卡优先 description；error 态摘要 = 输出首行。
  const generic = titleKey === 'toolTitleGeneric'
  const base = argsRaw === '' ? '' : deriveSummary(variant, argsRaw)
  const plainSummary = [generic ? name : '', base].filter(Boolean).join(' · ')
  const errorSummary = rowState === 'error' && output !== '' ? firstLine(output) : null
  const summaryText = (rowState === 'error' ? errorSummary ?? (terminal?.description ?? plainSummary) : null) ?? terminal?.description ?? plainSummary
  // diffStat 后缀（官方 1529-1535）：error/stopped 不显示；diff 卡 = 「+N -M」独立 span。
  const totals = diffs === null ? null : diffTotals(diffs)
  const diffStat = totals === null ? null : `+${totals.added} -${totals.removed}`
  const settledWithCue = rowState === 'error' || rowState === 'stopped'
  const suffix = settledWithCue ? null : diffStat
  // 官方 fileLink（1536-1545）：read/write/edit 摘要路径 + onOpenFile + 非 error/stopped ⇒ 链接钮。
  const filePath = argsRaw === '' ? undefined : deriveFilePath(variant, argsRaw)
  const openFile = filePath !== undefined && onOpenFile !== undefined && !settledWithCue
    ? () => { onOpenFile(filePath) }
    : undefined
  // 展开体（官方 1514-1550）：input/output/card 三源；bodyText 仅展开且无专属卡时格式化。
  const inputRaw = argsRaw === '' ? null : argsRaw
  const outputText = output === '' ? null : output
  const card = terminal !== null ? 'terminal' : diffs !== null ? 'diff' : read !== null ? 'read' : null
  const bodyText = expanded && card === null && inputRaw !== null ? formatToolBody(variant, inputRaw) : null
  const cardBody = variant === 'code' ? null : bodyText
  const expandable = rowState !== 'preparing' && (inputRaw !== null || outputText !== null || card !== null)
  const open = expanded && expandable
  const blockLabels = useMemo(() => ({ diff: diffLabels(t), read: readLabels(t), terminal: terminalLabels(t) }), [t])
  const statusText = rowState === 'preparing' ? t('rowPreparing')
    : rowState === 'running' ? t('rowRunning')
    : rowState === 'error' ? t('rowFailed')
    : rowState === 'stopped' ? t('rowStopped')
    : null
  const summaryClassName = `${ocOr('ToolRow', 'summary', 'dsh-tdt-sv-tool-summary')}${
    rowState === 'error' ? ` ${ocOr('ToolRow', 'errorSummary', 'dsh-tdt-sv-tool-errmark')}` : ''
  }${rowState === 'stopped' ? ` ${ocOr('ToolRow', 'stoppedSummary', 'dsh-tdt-sv-tool-stopmark')}` : ''}`
  const collapsedContent = summaryText === '' ? undefined : h(Fragment, null,
    h('span', { className: ocOr('ToolRow', 'sep', 'dsh-tdt-sv-tool-sep'), 'aria-hidden': true }),
    openFile !== undefined
      ? h('button', {
          type: 'button',
          className: ocOr('ToolRow', 'fileLink', 'dsh-tdt-sv-tool-filelink'),
          onClick: (event: ReactMouseEvent<HTMLButtonElement>) => { stopLinkClick(event); openFile() },
        }, h(TextShimmer, { active: running }, summaryText))
      : h('span', { className: summaryClassName }, h(TextShimmer, { active: running }, summaryText)),
    suffix !== null
      ? h(TextShimmer, {
          className: `${ocOr('ToolRow', 'summarySuffix', 'dsh-tdt-sv-tool-suffix')} ${ocOr('ToolRow', 'diffStat', 'dsh-tdt-sv-tool-diffstat')}`,
          active: running,
        }, suffix)
      : null,
  )
  const expandedContent = open ? h('div', { className: ocOr('ToolRow', 'bodyWrap', 'dsh-tdt-sv-tool-bodywrap') },
    terminal !== null
      ? h(TerminalBlock, {
          command: terminal.command,
          cwd: terminal.cwd,
          output: terminal.output,
          exitCode: terminal.exitCode,
          signal: terminal.signal,
          running: terminal.running,
          maxLines: Infinity,
          labels: blockLabels.terminal,
          className: ocOr('ToolRow', 'terminalBody', 'dsh-tdt-sv-tool-terminal'),
        })
      : diffs !== null
        ? h(DiffBlock, { diffs, labels: blockLabels.diff, maxLines: 9, className: ocOr('ToolRow', 'diffBody', 'dsh-tdt-sv-tool-block') })
        : read !== null
          ? h(ReadBlock, {
              label: read.label,
              lines: read.lines,
              totalLines: read.totalLines,
              lang: read.lang,
              labels: blockLabels.read,
              maxLines: 8,
              className: ocOr('ToolRow', 'readBody', 'dsh-tdt-sv-tool-block'),
            })
          : h(Fragment, null,
              variant === 'code' && bodyText !== null
                ? h('div', { className: ocOr('ToolRow', 'bodyScroll', 'dsh-tdt-sv-tool-block') },
                    h(CodeViewer, {
                      text: bodyText,
                      path: 'tool-code.ts',
                      t,
                      className: ocOr('ToolRow', 'codeBody', 'dsh-tdt-sv-tool-block'),
                      height: 'auto',
                      style: { height: 'auto' },
                    }))
                : null,
              (cardBody !== null || outputText !== null) && h('div', { className: ocOr('ToolRow', 'ioCard', 'dsh-tdt-sv-io-card') },
                cardBody !== null && h('div', { className: ocOr('ToolRow', 'ioSection', 'dsh-tdt-sv-io-section') },
                  h('span', { className: ocOr('ToolRow', 'ioLabel', 'dsh-tdt-sv-io-label') }, t('toolInputLabel')),
                  h('span', { className: ocOr('ToolRow', 'ioText', 'dsh-tdt-sv-io-text') }, cardBody)),
                cardBody !== null && outputText !== null
                  && h('span', { className: ocOr('ToolRow', 'ioDivider', 'dsh-tdt-sv-io-divider'), 'aria-hidden': true }),
                outputText !== null && h('div', { className: ocOr('ToolRow', 'ioSection', 'dsh-tdt-sv-io-section') },
                  h('span', { className: ocOr('ToolRow', 'ioLabel', 'dsh-tdt-sv-io-label') }, t('toolOutputLabel')),
                  h('span', { className: ocOr('ToolRow', 'ioText', 'dsh-tdt-sv-io-text'), 'data-error': rowState === 'error' || undefined }, outputText))),
            ),
  ) : undefined
  return h('div', {
    className: ocOr('ToolRow', 'root', 'dsh-tdt-sv-tool'),
    'data-variant': variant,
    'data-tool': name,
    'data-state': rowState,
  },
    statusText !== null
      ? h('span', { className: ocOr('ToolRow', 'visuallyHidden', 'dsh-tdt-sv-visuallyhidden') }, statusText)
      : null,
    h(DisclosureRow, {
      rowClassName: ocOr('ToolRow', 'row', 'dsh-tdt-sv-tool-row'),
      leadingClassName: ocOr('ToolRow', 'leading', 'dsh-tdt-sv-tool-leading'),
      titleClassName: ocOr('ToolRow', 'title', 'dsh-tdt-sv-tool-title'),
      chevronClassName: ocOr('ToolRow', 'chevron', 'dsh-tdt-sv-tool-chevron'),
      icon: VARIANT_ICONS[variant],
      title: t(titleKey),
      running,
      open,
      expandable,
      expandOnRowClick: true,
      keepContentWhenOpen: true,
      onToggle: () => { setExpanded(value => !value) },
      collapsedContent,
      children: expandedContent,
    }),
  )
}
