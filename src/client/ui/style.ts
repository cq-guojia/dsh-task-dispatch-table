/**
 * 统一样式注入器（UI 基础层 · P0 地基）
 *
 * 为什么必须运行时注入：客户端产物是 `window.__ModuleLoader__.load({ factory })` 的 CJS 闭包，
 * `import './x.css'` 只会产出独立 css 资源、内核不会加载它（task-editor-css.ts / archive-session-css.ts /
 * toast-css.ts 三处注释已结论）⇒ CSS 只能以字符串在运行时打进 `<style>`。
 *
 * 本模块把「各文件自己 createElement('style')」收成**唯一入口**：
 *  - 全站只有**一个** `<style id="dsh-task-dispatch-table-ui">`；
 *  - 按「域」登记（`tokens` / `controls` / `official` / `domain:editor` / `domain:session-view` / `domain:toast` /
 *    `domain:records`（执行记录时间轴）/ `domain:taskpicker`（任务选择器）…），
 *    同一域重复登记 = 覆盖（后写胜），便于过渡期逐块搬；
 *  - `tokens` 域恒排最前 —— 变量定义必须先于消费它的规则出现（同一条 style 内也讲先后）；
 *  - 幂等：重复调用不重复插入；`registerStyle` 在标签已挂上时会立刻刷新内容。
 *
 * 三条硬规矩（docs/design/ui-style-guide.md）：
 *  ① 不许再有第二处 `document.createElement('style')`；
 *  ② 不许再出现第二套 style 标签 id；
 *  ③ 域内的规则只能消费 `var(--tdt-*)`（颜色 / 尺寸 / 字号一律来自 token 层）。
 */

import { UI_TOKENS_CSS } from './tokens'

/** 全站唯一的样式标签 id（改名 = 大范围回归，不要动）。 */
export const UI_STYLE_ID = 'dsh-task-dispatch-table-ui'

/** 契约：域 → CSS 文本（插入顺序 = 首次登记顺序，`tokens` 恒最前）。 */
const domains = new Map<string, string>()

/** token 域固定名（`ui/index.ts` 的 ensureUiBase 用它登记变量表）。 */
export const TOKENS_DOMAIN = 'tokens'

/** 已挂载的 style 标签（缓存引用；被外部移除时 ensureUiStyles 会重新接管）。 */
let tag: HTMLStyleElement | null = null

/** 内容是否落后于 domains（登记后置位，flush 后清除）。 */
let dirty = true

/** 按「tokens 优先、其余按登记顺序」拼出整条 CSS。 */
function buildCss(): string {
  const entries = [...domains.entries()]
  // Array#sort 稳定 ⇒ 非 tokens 的域保持登记顺序
  entries.sort((a, b) => (a[0] === TOKENS_DOMAIN ? -1 : b[0] === TOKENS_DOMAIN ? 1 : 0))
  return entries.map(([, css]) => css).join('\n')
}

/** 把最新内容写进标签（唯一写点）。 */
function flush(): void {
  if (tag === null) return
  tag.textContent = buildCss()
  dirty = false
}

/**
 * 登记一个域的样式（纯登记，不强制挂载）。
 *
 * @param domain 域名（见本文件头部的清单）；同名重复登记 = 覆盖。
 * @param css 该域的 CSS 文本。
 */
export function registerStyle(domain: string, css: string): void {
  if (domains.get(domain) === css) return
  domains.set(domain, css)
  dirty = true
  // 标签已在页面上 ⇒ 立刻生效，别让调用方等下一次 ensure
  if (tag !== null && tag.isConnected) flush()
}

/**
 * 确保样式已挂载且是最新（幂等；无 document / 无 head 的环境静默跳过）。
 */
export function ensureUiStyles(): void {
  if (typeof document === 'undefined') return
  if (tag === null || !tag.isConnected) {
    const found = document.getElementById(UI_STYLE_ID)
    if (found !== null) {
      tag = found as unknown as HTMLStyleElement
    } else {
      const head = document.head
      if (head === null) return
      const el = document.createElement('style')
      el.id = UI_STYLE_ID
      head.appendChild(el)
      tag = el
    }
    dirty = true
  }
  if (dirty) flush()
}

/**
 * 过渡期便捷入口：登记 + 立刻确保挂载（老 `ensureXxxStyle()` 一行替换成这个）。
 *
 * @param domain 域名。
 * @param css 该域的 CSS 文本。
 */
export function applyStyle(domain: string, css: string): void {
  registerStyle(domain, css)
  ensureUiStyles()
}

/**
 * 入口 / 组件调用一次即可：登记 token 层并确保样式已注入（幂等）。
 *
 * 放在本文件（而不是 index.ts）是为了让 `ui/` 内的组件也能直接调用它而不产生循环依赖。
 */
export function ensureUiBase(): void {
  registerStyle(TOKENS_DOMAIN, UI_TOKENS_CSS)
  ensureUiStyles()
}
