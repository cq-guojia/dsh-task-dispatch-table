// http.ts — 客户端统一的「带超时 fetch」（2026-09-30 收敛：原先三份各写一遍，其中一份还没超时）。
//
// **为什么单独成文件**（评审核实）：`index.ts`（主面板）与 `session-view.ts`（只读会话弹窗）都要用，
// 而 session-view 是**被 index 引用**的一侧 ⇒ 放进 index 会形成 session-view ← index 的反向依赖。
// 抽成两者共同引用的**叶子模块**，谁都不依赖谁；tsdown 的 `alwaysBundle` 会把它内联进单文件产物
// `dist/client.js`（必须用**静态 import**，用动态 import 会被切成额外 chunk，与单文件契约冲突）。
//
// **为什么必须有超时**：一次挂起的请求会让对应通道**永久停摆**（真机「卡片 5 分钟不动、倒计时照跳」
// 的根因），也让「保存中…」的按钮永久禁用。默认 8s：小于 10s 轮询间隔，避免一轮拖过下一轮把间隔拉成 2 倍。
//
// ⚠️ **本函数不接受外部 signal**（`init.signal` 会被这里覆盖）：把「卸载 / 换轮 abort」与「超时 abort」
// 合并需要 `AbortSignal.any`（Chrome 116+），而产物 target 是 chrome99（tsdown.client.config.ts）⇒
// **需要持有 controller 句柄**的两处继续各自内联，**不要并**：
//   - `task-list.tsx` 的轮询（换轮 / 卸载要逐个 abort，见其 `inflight`）；
//   - `task-editor.tsx` 的附件上传（90s，且要按文件逐个 abort）。
export const DEFAULT_TIMEOUT_MS = 8_000

/** 带超时的 fetch：超时即 `controller.abort()`（调用方按「本次请求失败」处理，保持上一份数据）。 */
export async function fetchWithTimeout(
  input: string,
  init: RequestInit = {},
  timeoutMs = DEFAULT_TIMEOUT_MS,
): Promise<Response> {
  const controller = new AbortController()
  // ⚠️ **必须带 reason**（2026-10-07 事故）：`abort()` 不给 reason 时，浏览器把 `error.message`
  // 填成「signal is aborted without reason」—— 这句话**完全看不出是超时**，真机上被当成
  // 「数据库读不出来」排查，白白误导一次。带上 reason 后界面直接显示「请求超时（8000ms 未响应）」。
  const timer = window.setTimeout(() => {
    controller.abort(new DOMException(`请求超时（${timeoutMs}ms 未响应）`, 'TimeoutError'))
  }, timeoutMs)
  try {
    return await fetch(input, { ...init, signal: controller.signal })
  } finally {
    window.clearTimeout(timer)
  }
}
