// 「过程文件」块 —— 回执**过程文件桶**（2026-10-10）的**全站唯一展示件**。
//
// 为什么要一个共用件：同一份东西要在三处出现 —— ① 会话弹窗交付卡网格下方、② 执行记录页展开区、
// ③ 基础信息/查看档「上次执行」的产出清单。三处各写一份就是违规（本仓规矩：一类东西一个实现，
// 见 query.ts `outputsOf` 的收编注释）。
//
// 观感纪律（用户 2026-10-10 拍板「都显示，但分主次」）：**次级** —— 小字浅灰标题 + 数量，
// **默认收起**，展开后才是横向文件行；不许抢主文件（交付卡 / 产出物清单）的视线。
//
// 数据真源 = `task_instances.process_outputs`（回执声明并经 checkReceipt 校验的 JSON 数组）；
// 拿不到就整块不渲染（返回 null），绝不显示假文件。
import { createElement as h, useState } from 'react'
import { FileTypeIcon, IconChevronDownOutlineRegular, IconChevronUpOutlineRegular, IconFolderCloseRegular } from '@deepseek-ai/dsh-client-ui-primitives'
import { MarqueeText, ensureControlsStyle } from './ui'
import { baseNameOf } from './format'
import type { Translate } from './locales'

/** 目录以尾斜杠表达（与 `normalizeOutputs` / `baseNameOf` 同一约定）。 */
const isDirPath = (path: string): boolean => path.endsWith('/')

export function ProcessFiles(props: {
  /** 过程文件路径（相对工作区根）；空 / 未传 ⇒ 整块不渲染。 */
  paths?: readonly string[] | undefined
  /** 点开预览。undefined = 打不开 ⇒ 降级纯文本行（不给假入口）。 */
  onOpen?: ((path: string) => void) | undefined
  /** 调用方补的容器修饰类（三处的间距不同）。 */
  className?: string | undefined
  t: Translate
}): ReturnType<typeof h> | null {
  const { paths, onOpen, className, t } = props
  const [open, setOpen] = useState(false)
  ensureControlsStyle()
  const list = paths ?? []
  if (list.length === 0) return null
  return h('div', {
    className: className === undefined ? 'dsh-tdt-proc' : `dsh-tdt-proc ${className}`,
    'data-process-files': true,
  },
    h('button', {
      type: 'button',
      className: 'dsh-tdt-proc-head',
      'aria-expanded': open,
      onClick: () => { setOpen((value) => !value) },
    },
      h('span', null, t('procFilesTitle', { count: list.length })),
      open ? h(IconChevronUpOutlineRegular, { size: 12 }) : h(IconChevronDownOutlineRegular, { size: 12 }),
    ),
    open
      ? h('div', { className: 'dsh-tdt-proc-list' },
        list.map((path) => {
          // 与既有文件行同一口径：行内文件按钮基础层 `.dsh-tdt-filechip--inline`（图标 + 名字 + 跑马灯）。
          const body = [
            isDirPath(path) ? h(IconFolderCloseRegular, { size: 14 }) : h(FileTypeIcon, { path, size: 14 }),
            h(MarqueeText, { text: baseNameOf(path), title: path, style: { maxWidth: '40ch', minWidth: 0 } }),
          ]
          return onOpen === undefined
            ? h('span', {
              key: path,
              className: 'dsh-tdt-filechip dsh-tdt-filechip--inline',
              title: path,
              'data-noclick': true,
            }, ...body)
            : h('button', {
              key: path,
              type: 'button',
              className: 'dsh-tdt-filechip dsh-tdt-filechip--inline',
              title: path,
              onClick: () => { onOpen(path) },
            }, ...body)
        }),
      )
      : null,
  )
}
