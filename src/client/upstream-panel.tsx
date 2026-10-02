// 会话弹窗「接收 · 来自上游任务」区（2026-10-03，工作包 task-file-context）。
//
// 定位：官方**没有**「上游任务产出」这个概念（任务依赖是本插件调度域独有的）⇒ 这一块只能自绘，
// 但零件全用官方件（`FileTypeIcon`）与官方 token，观感与会话区一致。
// 数据真源 = 实例快照 `resolvedDeps`（决策 43：判定那一刻冻结的上游实例 + 产出），**绝不造值**。
//
// ⚠️ 只在我们自己的弹窗里可见：上游清单对模型仍是消息文本里的路径清单（走官方那条路），
// 从本弹窗 fork 出去的会话在官方页里看不到这一块——这是已知边界，不做伪原生兜底。
import { createElement as h } from 'react'
import { FileTypeIcon } from '@deepseek-ai/dsh-client-ui-primitives'
import { formatDateTime } from './format'
import type { ResolvedDependency } from '../deps.js'
import type { Translate } from './locales'

/** 一条上游输入的客户端视图模型（任务名已由调用方按 id 反查）。 */
export interface UpstreamInputView extends ResolvedDependency {
  /** 上游任务名（反查不到 ⇒ 短 id，绝不显示空白）。 */
  taskTitle: string
}

/** 目录标记：上游产出按「尾斜杠」表示目录（回执归一 `receipt.ts` normalizeOutputs 的约定）。 */
export function isDirPath(path: string): boolean {
  return path.endsWith('/')
}

/**
 * 上游产出的相对路径 → 绝对路径（基准 = **上游**实例的工作区，不是当前会话的）。
 * 无基准（上游旧行无快照）⇒ null：如实降级为「不可点」，绝不拿当前工作区去猜。
 */
export function upstreamAbsPath(base: string | null, rel: string): string | null {
  if (base === null || base === '') return null
  const trimmed = rel.replace(/^\.\//, '')
  return base.endsWith('/') ? `${base}${trimmed}` : `${base}/${trimmed}`
}

/** 文件名（去掉尾斜杠，目录显示最后一段）。 */
function displayName(path: string): string {
  const raw = path.replace(/\/+$/, '')
  const cut = Math.max(raw.lastIndexOf('/'), raw.lastIndexOf('\\'))
  return cut < 0 ? raw : raw.slice(cut + 1)
}

/**
 * 接收区：按上游任务分组，每组 = 任务名 + 计划时刻（+ «查看该会话»）+ 文件行（图标 + 名字）。
 * 输入文件可能很多（十几个），故用**一行一个小标签**，不用产出卡那种大卡（用户 2026-10-02）。
 * 无上游依赖 ⇒ 整块不渲染（返回 null），不留空壳。
 */
export function UpstreamInputsPanel(props: {
  items: readonly UpstreamInputView[]
  /** 打开文件（U11 单一入口 `openFile`）；undefined ⇒ 文件行降级纯文本。 */
  onOpenFile?: (path: string) => void
  /** 打开上游那次的会话（**只传会话 id**：标题由弹窗自取）；undefined ⇒ 不出链接。 */
  onOpenSession?: (sessionId: string) => void
  t: Translate
}): ReturnType<typeof h> | null {
  const { items, onOpenFile, onOpenSession, t } = props
  if (items.length === 0) return null
  return h('div', { className: 'dsh-tdt-sv-up', 'data-upstream-inputs': true },
    h('div', { className: 'dsh-tdt-sv-up-head' },
      h('span', { className: 'dsh-tdt-sv-up-title' }, t('svUpstreamTitle', { count: items.length })),
    ),
    h('div', { className: 'dsh-tdt-sv-up-groups' },
      items.map(item => h('div', { key: `${item.task}:${item.instanceId}`, className: 'dsh-tdt-sv-up-group' },
        h('div', { className: 'dsh-tdt-sv-up-task' },
          h('span', { className: 'dsh-tdt-sv-up-name', title: item.task }, item.taskTitle),
          h('span', { className: 'dsh-tdt-sv-up-meta' }, formatDateTime(item.scheduledAt, { fallback: item.scheduledAt })),
          item.sessionId !== null && onOpenSession !== undefined
            ? h('button', {
                type: 'button',
                className: 'dsh-tdt-sv-up-link',
                onClick: () => { onOpenSession(item.sessionId as string) },
              }, t('svUpstreamSession'))
            : null,
        ),
        item.outputs.length === 0
          ? h('div', { className: 'dsh-tdt-sv-up-none' }, t('svUpstreamNoOutputs'))
          : h('div', { className: 'dsh-tdt-sv-up-files' },
              item.outputs.map(path => {
                const abs = upstreamAbsPath(item.workspacePath, path)
                const name = displayName(path)
                const label = abs === null ? `${name} ${t('svUpstreamRelOnly')}` : name
                const clickable = abs !== null && onOpenFile !== undefined
                return h(clickable ? 'button' : 'span', {
                  key: path,
                  className: 'dsh-tdt-sv-up-file',
                  ...(clickable
                    ? {
                        type: 'button' as const,
                        title: abs ?? path,
                        'aria-label': t('svUpstreamFileAria', { name }),
                        onClick: () => { onOpenFile?.(abs as string) },
                      }
                    : { title: label }),
                },
                  h('span', { className: 'dsh-tdt-sv-up-icon' },
                    h(FileTypeIcon, { path: isDirPath(path) ? name : name, size: 14 })),
                  h('span', { className: 'dsh-tdt-sv-up-fileName' }, label),
                )
              }),
            ),
      )),
    ),
  )
}
