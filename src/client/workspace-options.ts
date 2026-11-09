// 工作区展示名口径：任务定义里存 **path**（宿主派发即用此值，重启 / 重建 id 都不变）；
// 界面显示的是当前标题。老任务存 title / id 时靠选项的 aliases 一并认出。
import type { EditorOption } from './ui'

/**
 * 展示归一：path（或历史 title / id）→ 当前标题。
 * 候选还没取到（宿主重启 / 降级）时不把内部标识露给用户，返回空串；
 * 候选齐了却仍认不出 ⇒ 该工作区真的没了，如实显示原值让用户重选（不编造名字）。
 */
export function workspaceLabelOf(options: readonly EditorOption[], raw: string): string {
  if (raw === '') return ''
  const hit = options.find(option => option.value === raw || option.aliases?.includes(raw) === true)
  if (hit !== undefined) return hit.label
  return options.length === 0 ? '' : raw
}

/**
 * 选中态归一：老 title / id → 当前选项值（path）。
 * 下拉只按 value 全等匹配，不做别名 ⇒ 渲染前必须先过这一道，否则老任务打开编辑时显示「未选择」。
 * 认不出原样返回（保存校验与派发错误会兜底，不在这里猜）。
 */
export function workspaceValueOf(options: readonly EditorOption[], raw: string): string {
  if (raw === '') return ''
  const hit = options.find(option => option.value === raw || option.aliases?.includes(raw) === true)
  return hit === undefined ? raw : hit.value
}
