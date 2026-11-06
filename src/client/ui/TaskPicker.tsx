/**
 * 任务选择器 —— **核心 `Picker` 的薄包装**（2026-11-06 起）。
 *
 * 本文件只做四件业务事，其余（浮层、搜索、分页、空态、键盘、明暗）全交给 `dsh-plugin-core/ui`：
 *  ① 按 `scope`（工作区）与 `excludeIds` 过滤候选；
 *  ② 「全部任务」作为**第一个普通选项**（`value: ''`）传进去（用户 2026-11-05 拍板，核心零改动）；
 *  ③ 停用任务照常可选，只在 `label` 尾部拼 `disabledTag`（不加字段）；
 *  ④ 已选项掉出作用域 ⇒ 仍留在列表里 + 触发器前置 `!` 告警（`title` 给说明），不静默清空。
 *
 * 搜索：核心按 `label` + `keywords` 子串匹配；这里把任务 UUID 放进 `keywords`（只搜不显示）。
 */
import { createElement as h, useMemo } from 'react'
import { Picker, type PickerOption, type FieldSize } from 'dsh-plugin-core/ui'
import { t as coreT } from 'dsh-plugin-core/utils'

/** 一条任务候选（与 L3 的 `EditorTaskOption` 同形 ⇒ 结构兼容；**刻意不反向 import 业务文件**）。 */
export interface TaskOption {
  /** 任务 UUID。 */
  id: string
  /** 展示名（统一口径 `[编号] 名称`）。 */
  label: string
  /** 所属工作区（title），供 `scope` 过滤。 */
  workspace: string
  /** 停用任务照常可选，只是尾部加 `disabledTag`。 */
  enabled: boolean
}

export interface TaskPickerProps {
  /** 当前选中的任务 id；'' = 未选。 */
  value: string
  /** 选中回调（传值，不传 event）。 */
  onChange: (id: string) => void
  /** 候选全量（调用方负责按 `[code] name` 组装 label）。 */
  options: readonly TaskOption[]
  /** 外部受控的工作区作用域；'' 或 undefined = 不限。 */
  scope?: string
  /** 排除项（已选前置 / 当前任务自己）。 */
  excludeIds?: readonly string[]
  /** 首屏展示条数（默认 10），其余走「显示更多」。 */
  recentLimit?: number
  placeholder: string
  /** 候选为空 / 搜不到时的文案。 */
  emptyLabel: string
  ariaLabel: string
  /** 搜索框占位。 */
  searchPlaceholder: string
  /** 停用任务的尾缀（如「（已停用）」）。 */
  disabledTag?: string
  /** 已选项不在当前作用域时的悬浮说明。 */
  outOfScopeHint?: string
  /** 「显示更多」按钮文案（默认走核心 i18n）。 */
  moreLabel?: string
  /** 顶部「全部 / 清空」项（value 通常为 ''）；传入即作为**第一个普通选项**。 */
  allOption?: { value: string; label: string }
  disabled?: boolean
  /** 高度档（sm / md / lg，默认 lg）。 */
  size?: FieldSize
  /** 触发器定宽（数字 = px）。 */
  width?: number | string
}

/** 带搜索的任务选择器。 */
export function TaskPicker(props: TaskPickerProps): ReturnType<typeof h> {
  const scope = props.scope ?? ''
  const excludes = props.excludeIds ?? []
  const current = props.options.find(o => o.id === props.value)

  // 候选 = 全量 → 过作用域 → 排除项。作用域是受控入参，变化即重算。
  const candidates = useMemo(
    () => props.options.filter(o => (scope === '' || o.workspace === scope) && !excludes.includes(o.id)),
    [props.options, scope, excludes],
  )

  const labelOf = (o: TaskOption): string => (o.enabled ? o.label : `${o.label}${props.disabledTag ?? ''}`)

  const list: PickerOption[] = []
  if (props.allOption !== undefined) list.push({ value: props.allOption.value, label: props.allOption.label })
  for (const o of candidates) list.push({ value: o.id, label: labelOf(o), keywords: o.id })

  // 「掉出作用域」只看**工作区**（`excludeIds` 是调用方的临时排除，不算作用域外，不能打 `!`）。
  // 掉出时仍放进列表：否则触发器只剩占位符，与「实际正在按它过滤」的事实不符
  // （用户 2026-10-03 定：显式提示，不静默清空）。
  const outOfScope = current !== undefined && props.value !== '' && scope !== '' && current.workspace !== scope
  if (outOfScope && current !== undefined) {
    list.splice(props.allOption === undefined ? 0 : 1, 0, { value: current.id, label: labelOf(current), keywords: current.id })
  }

  return h(Picker, {
    options: list,
    value: props.value,
    onChange: (next) => {
      const id = Array.isArray(next) ? (next[0] ?? '') : next
      props.onChange(id)
    },
    searchable: true,
    limit: props.recentLimit ?? 10,
    placeholder: props.placeholder,
    size: props.size,
    width: props.width,
    disabled: props.disabled,
    ariaLabel: props.ariaLabel,
    icon: outOfScope
      ? h('span', { style: { color: 'var(--dshpc-warning)', fontWeight: 600 }, title: props.outOfScopeHint }, '!')
      : undefined,
    translate: (key, vars) => {
      if (key === 'pickerSearch') return props.searchPlaceholder
      if (key === 'pickerEmpty' || key === 'pickerNoMatch') return props.emptyLabel
      if (key === 'pickerMore' && props.moreLabel !== undefined) return props.moreLabel
      return coreT(key, vars)
    },
  })
}
