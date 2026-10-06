// error-text.ts — 服务端**机器码错误 → 人话**（唯一实现）。
//
// **为什么单独成文件**（design/client-refresh-disposition.md §四 W3）：它本来住在 `task-editor.tsx`
// （138 KB 的编辑器**页**）里，却被宿主页 `index.ts` 反向 import ⇒ 纯文案工具寄居页面。
// 与 `schedule-text.ts` / `status-text.ts` / `time-text.ts` 同类：**文案单源**。

/**
 * 把宿主返回的机器码错误翻成人话（保底用：客户端校验已拦掉绝大多数必填问题，这里只兜底漏网的）。
 * 命中已知 zod 片段就翻译，否则原样返回（前缀「任务定义不合法（…）」尽量保留上下文）。
 */
export function humanizeTaskError(raw: string): string {
  if (raw.includes('target.workspace') && raw.toLowerCase().includes('too small')) {
    return '工作区不能为空，请先选择工作区'
  }
  if (raw.includes('target.prompt') && raw.toLowerCase().includes('too small')) {
    return '提示词不能为空，请先填写提示词'
  }
  // ⚠️ 宿主路径是 `title`（`path.join('.')`，**无前导点**）——此前写成 `.title` 永不命中（2026-09-30 专家团复核）。
  if (raw.includes('title') && raw.toLowerCase().includes('too small')) {
    return '任务名称不能为空'
  }
  // 排期时长（允许延迟）非法：宿主只认 `PT…H/M/S`（如选了 `P1D` 这类会走到这里）。
  if (raw.includes('ISO 8601') || raw.includes('schedule.window')) {
    return '「允许延迟」的时长不合法——请从下拉里重选一个（如 4 小时）。'
  }
  if (raw.includes('schedule.cron')) {
    return '执行排期不合法——请重新选一次执行频率。'
  }
  // 附件 ref 非法（选工作区文件的历史 bug 会走到这里）：给出可执行的动作，别把「相对路径上跳」这种黑话甩给用户。
  if (raw.includes('附件 ref 非法') || (raw.includes('attachments') && raw.includes('ref'))) {
    return '附加文件的引用路径不合法——必须是工作区内的相对路径。请删掉那个附件、重新选择一次。'
  }
  return raw
}
