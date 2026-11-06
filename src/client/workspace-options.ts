// 工作区展示名口径（用户 2026-11-06）：任务定义里存 **id**（改名不失效）；
// 界面要显示的是**当前**标题，所以只在展示处做 id→标题映射。
import type { EditorOption } from './ui'

/** 展示归一：id → 当前标题；认不出原样返回（不编造工作区名）。 */
export function workspaceLabelOf(options: readonly EditorOption[], raw: string): string {
  if (raw === '') return ''
  const hit = options.find(option => option.value === raw)
  return hit === undefined ? raw : hit.label
}
