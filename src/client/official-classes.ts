// 复用官方真实 CSS-module 类名（弹窗外观对齐官方，方案 ①）。
//
// 事实（读 @deepseek-ai/dsh-client-ui-chat@0.1.7-rc.2 源码 lib/client.js）：
// 官方 CSS module 由宿主在运行时注入 document.head，形如
//   <style data-plugin="@deepseek-ai/dsh-client-ui-chat"
//          data-plugin-css="@deepseek-ai/dsh-client-ui-chat/ChatView.module.css">
//     .EvIC1a_frame{...} .EvIC1a_root{...} .EvIC1a_scroll{...} ...
// 类名 = <构建哈希>_<语义名>（语义名是 camelCase，来自源码里的 *_module_css_default 映射表）。
//
// 为什么要「运行时发现」而不是把类名写死：哈希每次构建都可能变，写死就会在某次宿主升级后
// 集体失效；运行时解析则**自动跟随**。语义名若被改名，取不到 ⇒ 回退到本插件自绘样式（不崩、
// 不空白），并在控制台告警一次。
//
// 已知官方模块与语义名（源码 *_module_css_default 实测清单）：
//   ChatView(12): frame root scroll column flowItem hint older callRow openError modalAction toBottom toBottomSlot
//   AssistantMarkdown(4): root body actions stopped
//   MessageItem(32): bubble userRow userStack contextRow fileCard ... turnErrorRow retryRow ...
//   GenericCommandCard(8): root row title summary body chevron leading separator
//   （另有 ContextBody / StatsPills / TurnNavigator / accessibility 等，按需取用）

/** 官方 chat 包注入的 style 标签 data-plugin-css 前缀。 */
const CSS_PREFIX = '@deepseek-ai/dsh-client-ui-chat/'

/** 语义名 → 真实（带哈希）类名。 */
export type OfficialClassMap = Map<string, string>

let discovered: Map<string, OfficialClassMap> | null = null

/**
 * 解析一段官方 CSS module 文本，抽出 {语义名 → 真实类名}。
 * 纯函数、无 DOM 依赖（冒烟可直接对夹具断言）。
 * @param css - style 标签的 textContent。
 * @returns 语义名到真实类名的映射；解析不出哈希前缀时为空表。
 */
export function parseOfficialCss(css: string): OfficialClassMap {
  const out: OfficialClassMap = new Map()
  const tokens: string[] = []
  const tokenRe = /\.([A-Za-z0-9_-]+)/g
  let m: RegExpExecArray | null = tokenRe.exec(css)
  while (m !== null) { tokens.push(m[1]); m = tokenRe.exec(css) }
  // 类名形如 <hash>_<semantic>：按首个下划线切分，取出现次数最多的前缀作为本模块哈希
  // （CSS 里还有 [data-*] 属性选择器与全局类，靠「最多数」把真正的模块哈希选出来）。
  const counts = new Map<string, number>()
  for (const token of tokens) {
    const at = token.indexOf('_')
    if (at <= 0 || at === token.length - 1) continue
    const prefix = token.slice(0, at)
    counts.set(prefix, (counts.get(prefix) ?? 0) + 1)
  }
  let prefix = ''
  let best = 0
  counts.forEach((count, key) => { if (count > best) { best = count; prefix = key } })
  if (prefix === '') return out
  for (const token of tokens) {
    if (!token.startsWith(prefix + '_')) continue
    const semantic = token.slice(prefix.length + 1)
    // 语义名是 camelCase，不含下划线；跳过复合类名（如 foo_bar_baz 的剩余部分）
    if (semantic === '' || semantic.includes('_')) continue
    if (!out.has(semantic)) out.set(semantic, token)
  }
  return out
}

/**
 * 扫描 document 里官方 chat 包注入的 style 标签，按模块缓存解析结果。
 * 无 document（SSR / 冒烟）时返回空表。
 */
export function discoverOfficialClasses(): Map<string, OfficialClassMap> {
  if (discovered !== null) return discovered
  const result = new Map<string, OfficialClassMap>()
  if (typeof document !== 'undefined') {
    const tags = document.querySelectorAll('style[data-plugin-css]')
    for (let i = 0; i < tags.length; i++) {
      const tag = tags[i] as HTMLElement
      const id = tag.dataset.pluginCss ?? ''
      if (!id.startsWith(CSS_PREFIX)) continue
      const module = id.slice(CSS_PREFIX.length).replace(/\.module\.css$/, '')
      result.set(module, parseOfficialCss(tag.textContent ?? ''))
    }
  }
  // 只在真的发现到模块时才缓存：本插件 client 可能先于官方 chat 包加载，
  // 此时扫到空表若缓存住，后面官方样式注入了也取不到。
  if (result.size > 0) discovered = result
  return result
}

/** 已发现的官方模块数（0 = 官方样式未注入，调用方应走自绘兜底）。 */
export function officialModuleCount(): number {
  return discoverOfficialClasses().size
}

/**
 * 取一个官方类名；取不到返回 null（调用方回退自绘样式）。
 * @param module - 模块名（如 `ChatView`）。
 * @param semantic - 语义名（如 `frame`）。
 */
export function officialClass(module: string, semantic: string): string | null {
  return discoverOfficialClasses().get(module)?.get(semantic) ?? null
}

/**
 * 取多个官方类名并拼成 className；取不到的项自动跳过。
 * @param pairs - [模块名, 语义名] 列表。
 */
export function officialClasses(...pairs: Array<[string, string]>): string {
  const out: string[] = []
  for (const [module, semantic] of pairs) {
    const found = officialClass(module, semantic)
    if (found !== null) out.push(found)
  }
  return out.join(' ')
}

/** className 拼接：官方类优先，缺失时回退自绘类（两者只取其一，避免样式打架）。 */
export function ocOr(module: string, semantic: string, fallback: string): string {
  return officialClass(module, semantic) ?? fallback
}

/** 拼接非空类名片段。 */
export function cx(...parts: Array<string | null | undefined>): string {
  return parts.filter((part): part is string => typeof part === 'string' && part !== '').join(' ')
}
