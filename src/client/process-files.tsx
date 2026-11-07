// 「过程文件」块 —— 回执**过程文件桶**（2026-10-10）的**全站唯一展示件**。
//
// 为什么要一个共用件：同一份东西要在三处出现 —— ① 会话弹窗交付卡网格下方、② 执行记录页展开区、
// ③ 基础信息/查看档「上次执行」的产出清单。三处各写一份就是违规（本仓规矩：一类东西一个实现，
// 见 query.ts `outputsOf` 的收编注释）。
//
// 观感纪律（用户 2026-10-10 拍板「都显示，但分主次」）：**次级** —— 小字浅灰标题 + 数量，
// 展开后是横向文件行；不许抢主文件（交付卡 / 产出物清单）的视线。默认是否展开由调用方
// 经 `defaultOpen` 控制（会话 / 上次执行 / 执行记录展开区均展开）。
//
// 数据真源 = `task_instances.process_outputs`（回执声明并经 checkReceipt 校验的 JSON 数组）；
// 拿不到就整块不渲染（返回 null），绝不显示假文件。
import { createElement as h, useState } from 'react'
import { FileTypeIcon, IconChevronDownOutlineRegular, IconChevronUpOutlineRegular, IconFolderCloseRegular } from '@deepseek-ai/dsh-client-ui-primitives'
import { Button, IconButton, MarqueeText, ensureControlsStyle } from './ui'
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
  /** 默认展开（会话 / 上次执行处）；不传 = 收起（执行记录「详细」处）。 */
  defaultOpen?: boolean | undefined
  t: Translate
}): ReturnType<typeof h> | null {
  const { paths, onOpen, className, defaultOpen, t } = props
  const [open, setOpen] = useState(defaultOpen ?? false)
  ensureControlsStyle()
  const list = paths ?? []
  if (list.length === 0) return null
  return h('div', {
    className: className === undefined ? 'dsh-tdt-proc' : `dsh-tdt-proc ${className}`,
    'data-process-files': true,
  },
    // 折叠头（用户 2026-11-07）：整行可点展开、hover 不变底色；只有右侧核心 IconButton 三角 hover 亮。
    h('div', {
      role: 'button', tabIndex: 0, 'aria-expanded': open,
      style: { display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '8px', cursor: 'pointer' },
      onClick: () => { setOpen((value) => !value) },
      onKeyDown: (event: { key: string; preventDefault: () => void }) => {
        if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); setOpen((value) => !value) }
      },
    },
      // 与「产出」标题同一档（2026-11-07）：小字 + 浅灰。不写 color 就继承 --dshpc-fg，
      // 深色主题下会白得盖过主文件标题（用户点名「为什么其他产出是白色的」）。
      h('span', { style: { fontSize: 'var(--dshpc-font-xs)', color: 'var(--dshpc-fg-3)' } }, t('procFilesTitle', { count: list.length })),
      // 三角不另绑 onClick：点击冒泡到整行，避免同一次点击切换两回。
      h(IconButton, {
        variant: 'plain',
        size: 'sm',
        icon: open ? h(IconChevronUpOutlineRegular, { size: 12 }) : h(IconChevronDownOutlineRegular, { size: 12 }),
        label: t('procFilesTitle', { count: list.length }),
        'aria-expanded': open,
        title: '',
      }),
    ),
    open
      ? h('div', { className: 'dsh-tdt-proc-list' },
        list.map((path) => h(Button, {
          key: path,
          // 文件行 = 核心 Button 的 ghost 档（图标 + 文字，与产出物清单同一套皮肤；2026-11-06 全站收口）。
          variant: 'ghost', size: 'sm',
          icon: isDirPath(path) ? h(IconFolderCloseRegular, { size: 14 }) : h(FileTypeIcon, { path, size: 14 }),
          disabled: onOpen === undefined,
          onClick: onOpen === undefined ? undefined : () => { onOpen(path) },
          style: { flex: '0 0 auto', maxWidth: '100%' },
        }, h(MarqueeText, { text: baseNameOf(path), style: { maxWidth: '40ch', minWidth: 0 } }))),
      )
      : null,
  )
}
