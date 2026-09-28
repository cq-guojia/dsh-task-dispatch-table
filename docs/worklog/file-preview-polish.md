# 文件预览打磨：代码强制折行禁横向滚动 + 图标官方 Tooltip（2026-09-29）

> 工作包归类：U11 收尾打磨（非新功能，纯根因修复）。commit `8c3d0dd`，冒烟 172 项全过。

## 一、问题

用户真机复验 U11 后反馈两点：

1. **代码显示横向滚动条 + 换行无效**：打开代码/文本文件时，长行不折行、一直往右拉，底部出现横向滚动条；「自动换行」开关点了没效果。
2. **图标无 hover 提示**：刷新、复制、复制文件路径等图标，鼠标移上去没有任何提示。

## 二、根因

### 2.1 换行/滚动条

- `src/client/file-preview.tsx` 里代码块 `CodeBlock` 的 `wrap` 传值是 `markdown === true ? true : undefined`——**只有 markdown 文件传 `wrap:true`，代码/文本文件永远是 `undefined`**。官方 `CodeBlock` 在 `wrap` 未置时不设置 `data-code-wrap='true'`，于是我方上一轮写的「跟随 `data-code-wrap='true'` 补换行」CSS 规则对代码文件根本不触发 → 走官方默认 `white-space:pre` 不折行。
- 横向滚动条其实来自预览体外壳 `archive-session-css.ts` 里 `.dsh-tdt-sv-preview-body{overflow:auto}` 与代码内容容器 `[data-code-block-content]{overflow-x:auto}`——内容不折行就撑出滚动条。

### 2.2 图标 tooltip

- 图标钮只有 `aria-label`（无障碍读屏用），**没有任何视觉 hover 提示**。用户明确要求「用官方的，不要自己写样式或 JS 触发」。

## 三、修复

### 3.1 换行 + 禁滚动条（`archive-session-css.ts` + `file-preview.tsx`）

- `file-preview.tsx`：`wrap` 改为始终 `true`（代码/文本文件也折行）。
- `archive-session-css.ts`：
  - 代码内容容器 `[data-code-block-content]{overflow-x:auto}` → `overflow-x:hidden` + `max-width:100%`；
  - 预览体 `.dsh-tdt-sv-preview-body{overflow:auto}` → `overflow-x:hidden;overflow-y:auto`（双层兜底，永不出现横向滚动条）；
  - 保留并补强折行规则（`pre-wrap` + `overflow-wrap:anywhere` + `word-break:break-word`，超长串也能断行）。
- 效果：**该多宽就多宽，到宽度限制即折行，底部零横向滚动条**；「自动换行」开关照常可切。

### 3.2 图标提示（官方 `Tooltip`）

- 确认官方 `@deepseek-ai/dsh-client-ui-primitives` 已导出 `Tooltip`（`{label, side?, align?, children}`，`children` 为唯一锚点、ref/事件由其接管），与 `CodeBlock`/`IconX` 同模块 → 直接用，零自研。
- 两文件各加 `tooled(label, node)` 包装 helper，把图标钮包进 `<Tooltip label side="bottom">`：
  - 预览头：`复制路径` / `刷新` / `关闭`
  - 目录浏览器：面包屑 `▾选层` / `返回` / `上一层` / `关闭` / 标题栏 `复制路径` / `刷新` / 树 `▸展开收起`
- 文案复用现有 `aria-label` 键（zh/en 都有）；删除按钮上重复的 `title` 属性，防原生 title 与官方 Tooltip 双提示。

## 四、验证

- `npm run build` 通过（dist/client.js 305.31 kB）。
- `npm run smoke`：172 项全过。
- 已 commit + push（`8c3d0dd`）。

## 五、真机复验点（待用户）

1. 打开长行代码文件 → 自动折行、底部无横向滚动条；点「取消换行」仍不出现滚动条（按用户要求折行是强制行为）。
2. 鼠标悬停各图标 → 官方气泡显示对应中/英提示。
