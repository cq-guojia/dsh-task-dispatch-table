/**
 * L1 语义 token 层（UI 基础层 · P0 地基）
 *
 * 这一份文件是**全站唯一的「宿主变量 → 插件语义名」翻译表**。规矩见
 * docs/design/ui-style-guide.md：
 *  - `--tdt-*` **只允许在本文件定义**；其它任何文件只能 `var(--tdt-*)` 消费，
 *    不许再定义 `--tdt-*`，也不许直接写 `var(--dsw-*)`；
 *  - 每个 token 都带兜底值 ⇒ 宿主升级换名时不炸（最坏退到兜底色，不会白屏）；
 *  - **明暗差异只写在本文件**：能靠宿主 alias 表达的一律不写覆盖段（alias 自己随主题变），
 *    只有 alias 表达不了的「固定中性面 / 反色面」才进 `body[data-ds-dark-theme]` 段。
 *
 * 宿主变量名 / 亮暗取值 / 哪个是真变量 —— 真源是
 * docs/design/external/dsh-capabilities.md §主题与设计变量
 * （2026-10-01 按宿主 0.2.0-rc.2 解包五个包逐条核实；兜底值取的就是宿主真值）。
 *
 * 挂载点选 `body`：插件界面（含 portal 到 body 的弹窗）全在 body 内，
 * 定义在 body 上零调用点成本；名字统一带 `--tdt-` 前缀，不会与宿主变量打架。
 */
export const UI_TOKENS_CSS = `
/* ── 文字（宿主 label 四档 + 反色面用字）────────────────────────────── */
body{
  --tdt-fg:var(--dsw-alias-label-primary,#1f2328);
  --tdt-fg-2:var(--dsw-alias-label-secondary,#5c6370);
  --tdt-fg-3:var(--dsw-alias-label-tertiary,#767d87);
  --tdt-fg-4:var(--dsw-alias-label-caption,#9aa1ab);
  --tdt-fg-dim:var(--dsw-alias-label-dimmed,#b9bfc7);
  /* 反色面上的字（实心钮 / 角标）：暗色下是 bluish-1000，故用 -foreground 而非 -inverted */
  --tdt-fg-inverse:var(--dsw-alias-label-primary-foreground,#fff);

  /* ── 面（宿主 bg-layer 三档 + 下沉轨道底）──────────────────────────── */
  --tdt-surface-1:var(--dsw-alias-bg-layer-1,#fff);
  --tdt-surface-2:var(--dsw-alias-bg-layer-2,#fff);
  --tdt-surface-3:var(--dsw-alias-bg-layer-3,#fff);
  /* 「选中亮片」的底盘色（配 --tdt-shadow-raised 用） */
  --tdt-surface-raised:var(--dsw-alias-bg-layer-1,#fff);
  /* 轨道 / 下沉底（官方分段控件轨道用的就是这条） */
  --tdt-surface-sunken:var(--dsw-alias-interactive-bg-hover,rgba(38,49,72,.06));
  /* 整页 / 编辑器底（bg-base） */
  --tdt-surface-base:var(--dsw-alias-bg-base,#fff);
  /* 自绘浮层 / 菜单卡的不透明底（= base；不要用半透明的 specific-menu） */
  --tdt-surface-menu:var(--tdt-surface-base);
  /* markdown 代码块面 / 字体（会话镜像里用到） */
  --tdt-code-surface:var(--dsw-alias-markdown-code-block,rgba(128,128,128,.10));
  --tdt-code-font:var(--dsw-font-markdown-code-block-small,12px/18px var(--ds-font-family-code,monospace));
  /* 警告文字色（宿主 state-warn-label） */
  --tdt-warning-label:var(--dsw-alias-state-warn-label,#f5a623);
  /* 固定中性实面（自绘浮层、深色主题下必须自己变的那几个）——只有它需要暗色覆盖 */
  --tdt-solid:var(--dsw-static-neutral-00,#fff);
  --tdt-on-solid:var(--dsw-alias-label-primary,#1f2328);
  /* 交付文件卡那种「浅底盘 + hover 加深」两拍 */
  --tdt-plate:var(--dsw-static-neutral-50,#fafafa);
  --tdt-plate-hover:var(--dsw-static-neutral-100,#f5f5f5);
  --tdt-icon-plate:color-mix(in srgb,var(--dsw-static-neutral-00,#fff) 50%,transparent);
  /* 表头底：浅色主题**偏深**，且必须**比斑马纹（--tdt-plate）再深一档**——
     两者不能撞色（用户 2026-10-02：表头跟斑马纹一模一样）。 */
  --tdt-head-bg:var(--dsw-static-neutral-100,#f5f5f5);
  /* 图标小底板（产出物）：浅色下要**看得见**（原先取 plate ⇒ 在白底上等于没有）；hover 加倍。 */
  --tdt-chip-bg:color-mix(in srgb,var(--dsw-static-neutral-900,#0f0f0f) 7%,transparent);
  --tdt-chip-bg-hover:color-mix(in srgb,var(--dsw-static-neutral-900,#0f0f0f) 14%,transparent);
  /* 展开行：**带透明度的蓝**——不是灰、也不是纯色，透出卡片底色，一眼看出「这是展开的」
     （用户 2026-10-02：灰色跟斑马纹分不出来）。内容区再淡一档，形成「行深 / 内容浅」的区隔。 */
  --tdt-open-bg:rgba(37,99,235,.10);
  --tdt-open-bg-soft:rgba(37,99,235,.05);
  --tdt-card-hover:rgba(37,99,235,.07);

  /* ── 描边四档（宿主真值：l1 4% / l2 10% / l3 12% / l4 16%）────────── */
  --tdt-border-faint:var(--dsw-alias-border-l1,#0000000a);
  --tdt-border:var(--dsw-alias-border-l2,#0000001a);
  --tdt-border-strong:var(--dsw-alias-border-l3,#0000001f);
  --tdt-border-heavy:var(--dsw-alias-border-l4,#00000029);

  /* ── 品牌 / 语义色 ────────────────────────────────────────────────── */
  /* 品牌「面」色：明色近黑、暗色近白（官方 Switch 选中态即此），**不是蓝色** */
  --tdt-accent:var(--dsw-alias-brand-primary,#0f1115);
  /* 蓝色：强调 / 选中 / 焦点，一律走这条 */
  --tdt-business:var(--dsw-alias-state-business-primary,#3b5bdb);
  --tdt-success:var(--dsw-alias-state-success-primary,#22c55e);
  /* ⚠️ 是 state-warn（不是 state-warning，后者宿主无此定义） */
  --tdt-warning:var(--dsw-alias-state-warn-primary,#f59e0b);
  --tdt-danger:var(--dsw-alias-state-error-primary,#ec1313);
  --tdt-link:var(--dsw-alias-link,#3b5bdb);
  /* 语义色**实面**上的字（角标 / 实心提示）：宿主红绿黄三色都是中调 ⇒ 白字两个主题都可读，
     故这是一条与主题无关的常量；不要拿 --tdt-fg-inverse 顶——它在暗色下是近黑，压在红底上看不清。 */
  --tdt-on-signal:#fff;
  /* 语义色**浅底**：状态色系的「一块底色」——执行记录页每条流水账的块底就是它
     （用户 2026-10-04：正常态给同色系很浅的透明底、失败用红底透出来）。
     用 「color-mix」 现算而不写死 rgba：状态色本身跟随宿主 alias，主题一换自动成立。
     ⚠️ **深色下要更淡**：用户 2026-10-04「深色风格的绿色和红色好像都有点深」⇒ dark 段
     把这四条压到 5%（更贴近面板底、存在感更弱）；浅色段维持 8%。两端各自给值，不共用一条曲线。
     命名收在 tokens.ts 单点（本仓硬规矩：业务文件不许自造 --tdt-*）。 */
  --tdt-success-soft:color-mix(in srgb,var(--tdt-success) 8%,transparent);
  --tdt-warning-soft:color-mix(in srgb,var(--tdt-warning) 8%,transparent);
  --tdt-danger-soft:color-mix(in srgb,var(--tdt-danger) 8%,transparent);
  --tdt-business-soft:color-mix(in srgb,var(--tdt-business) 8%,transparent);

  /* ── 交互底 / 遮罩 ────────────────────────────────────────────────── */
  --tdt-hover:var(--dsw-alias-interactive-bg-hover,rgba(38,49,72,.06));
  --tdt-active:var(--dsw-alias-interactive-bg-active,#2631481a);
  --tdt-mask:var(--dsw-alias-bg-mask-1,#0000003d);
  /* 「选中面」（2026-10-06，任务日程页首创）= 当前底色**朝更深掺 12% 文字色**：
     浅色主题下文字色是黑 ⇒ 选中面比常态底色**深一档**。深色分支见 body[data-ds-dark-theme]（朝背景色掺）。
     语义：标记「正在看的东西」，比常态明显、又不许盖住内容（不许用半透明叠状态色）。 */
  --tdt-selected-bg:color-mix(in srgb,var(--tdt-surface-1) 88%,var(--tdt-fg));
  /* 任务日程页本月格默认底（2026-10-06 → 续2）：浅色下给**淡蓝**（business 8% 透白底）——
     参照用户参考稿里未选中日程块 / Tuesday 列的那种蓝、再浅一点点；
     相邻月补位格仍走 --tdt-surface-2（更灰），不受影响。
     深色段维持 #23262e（用户：深色 UI 已差不多，不动）。 */
  --tdt-cal-cell-bg:color-mix(in srgb,var(--tdt-business) 8%,var(--tdt-surface-1));
  /* 任务日程页「点开某天」展开的面板底（2026-10-06 续）：浅色下**无限接近白、只带一丁点灰**
     （neutral-50 = #fafafa）——面板里装半透明执行记录列表，底再深整片就发糊发灰；
     深色段沿用原 selected-bg 暗值，保持不动。 */
  --tdt-cal-panel-bg:var(--dsw-static-neutral-50,#fafafa);
  /* 任务日程页本月格 hover 底（浅色段，2026-10-06 续3）：不再走灰色通用交互底——
     鼠标移上去应是「更亮一点点的蓝」（与深色段同语义：hover = 提亮的蓝，不是灰下去）。
     business 16% 透白底，比未选中格的 8% 更亮一档。 */
  --tdt-cal-cell-hover:color-mix(in srgb,var(--tdt-business) 16%,var(--tdt-surface-1));

  /* ── 投影 / 焦点 ──────────────────────────────────────────────────── */
  --tdt-shadow-1:var(--dsw-elevation-soft,0 4px 16px 0 #00000008);
  /* 亮片自带的浮起感（选中态用；与 --tdt-surface-raised 配对） */
  --tdt-shadow-raised:var(--dsw-elevation-soft,0 4px 16px 0 #00000008);
  --tdt-shadow-2:var(--dsw-shadow-lv3,0 12px 32px 0 #00000014);
  /* 键盘焦点环。⚠️ 不用宿主 --dsw-focus-ring-color：它默认值是 transparent（兜底不生效、会隐身） */
  --tdt-focus:var(--dsw-alias-state-business-primary,#3b5bdb);

  /* ── 圆角（宿主真值 4 / 8 / 12 / 16 / 20 / 28）─────────────────────── */
  --tdt-radius-xs:var(--dsw-radius-xs,4px);
  --tdt-radius-sm:var(--dsw-radius-sm,8px);
  --tdt-radius-md:var(--dsw-radius-md,12px);
  --tdt-radius-lg:var(--dsw-radius-lg,16px);
  --tdt-radius-xl:var(--dsw-radius-xl,20px);
  --tdt-radius-panel:var(--dsw-radius-panel,28px);

  /* ── 间距四拍（只许用这四档，不许出现 5 / 7 / 9px）────────────────── */
  --tdt-space-1:4px;
  --tdt-space-2:8px;
  --tdt-space-3:12px;
  --tdt-space-4:16px;

  /* ── 控件高度：离散三档（控件用 size="sm|md|lg" 选；调用点不许自定义高度，
       真不够用才允许在调用点本地覆盖 --tdt-control-h-*，属例外而非常态）── */
  --tdt-control-h-sm:24px;
  --tdt-control-h-md:28px;
  --tdt-control-h-lg:32px;

  /* ── 字号 / 行高：直绑宿主字号族（宿主真值 11 / 12 / 13 / 14 / 16）───── */
  --tdt-font-xs:var(--dsw-font-xxxs-11-font-size,11px);
  --tdt-font-sm:var(--dsw-font-xxs-12-font-size,12px);
  --tdt-font-md:var(--dsw-font-xs-13-font-size,13px);
  --tdt-font-lg:var(--dsw-font-s-14-font-size,14px);
  --tdt-font-xl:var(--dsw-font-base-16-font-size,16px);
  --tdt-line-xs:var(--dsw-font-xxxs-11-line-height,14px);
  --tdt-line-sm:var(--dsw-font-xxs-12-line-height,18px);
  --tdt-line-md:var(--dsw-font-xs-13-line-height,20px);
  --tdt-line-lg:var(--dsw-font-s-14-line-height,22px);
  --tdt-line-xl:var(--dsw-font-base-16-line-height,24px);
  --tdt-font-mono:var(--ds-font-family-code,monospace);

  /* ── 层级阶梯（业务文件不许再写裸 z-index）───────────────────────── */
  /* 页面级预览分栏 → 抽屉（新建/编辑）→ 弹窗/确认框 → 浮层菜单 → 浮层提示 */
  /* 内容层吸顶（天标签 / 表头这类「跟着滚但压住同层内容」的元素）：只压同层兄弟，
     必须低于下面所有浮层档 —— 所以它不是「开新浮层档」，而是内容层内部的排序位。 */
  --tdt-z-sticky:10;
  --tdt-z-dock:1030;
  --tdt-z-drawer:1040;
  --tdt-z-modal:1070;
  --tdt-z-menu:1100;
  --tdt-z-tip:1200;

  /* ── 动效 ─────────────────────────────────────────────────────────── */
  --tdt-dur:var(--ds-transition-duration,.2s);
  --tdt-dur-fast:var(--ds-transition-duration-fast,.12s);
  --tdt-ease:var(--ds-ease-in-out,cubic-bezier(.4,0,.2,1));
  /* 运行中状态的脉动时长（2026-10-06 统一前后两端：任务配置里的绿呼吸 → 蓝、放慢；
     执行记录里的蓝闪 → 放慢一点。两者用同一个值，动画形状本就一致）。 */
  --tdt-dur-run:500ms;
}

/* ── 明暗差异的**唯一**落点 ──────────────────────────────────────────────
   判据 = body[data-ds-dark-theme]（宿主 0.2.0-rc.2 源码核实：启动脚本 toggleAttribute 写入，
   唯一明暗判据；插件禁止用 prefers-color-scheme —— 它跟的是系统、不是用户在宿主里的选择）。
   下面只放 alias 表达不了的「固定中性面」；颜色若能靠 alias 自动跟随，一律不要写在这里。 */
body[data-ds-dark-theme]{
  --tdt-solid:var(--dsw-static-neutral-900,#0f0f0f);
  --tdt-on-solid:var(--dsw-static-neutral-00,#fff);
  --tdt-plate:var(--dsw-static-neutral-850,#212123);
  --tdt-plate-hover:var(--dsw-static-neutral-800,#292929);
  --tdt-icon-plate:color-mix(in srgb,var(--dsw-static-neutral-00,#fff) 5%,transparent);
  /* 暗色主题**反过来**：表头要比卡片面**亮**、比斑马纹再**浅一档**（用户：纯黑背景没法看）。 */
  --tdt-head-bg:var(--tdt-surface-2);
  /* 暗色底板**微亮**；hover **更亮**（原先 hover 取 plate-hover 反而更淡 ⇒ 鼠标移上去就没了）。 */
  --tdt-chip-bg:color-mix(in srgb,var(--dsw-static-neutral-00,#fff) 8%,transparent);
  --tdt-chip-bg-hover:color-mix(in srgb,var(--dsw-static-neutral-00,#fff) 16%,transparent);
  /* 暗色下蓝色要更亮、透明度略高才压得住深底。 */
  --tdt-open-bg:rgba(96,165,250,.18);
  --tdt-open-bg-soft:rgba(96,165,250,.08);
  --tdt-card-hover:rgba(96,165,250,.13);
  /* 语义色**浅底**（深色版）：用户嫌深色的绿 / 红「有点深」⇒ 压到 **5%**（浅色段是 8%），
     更贴近面板底色、存在感更弱；块底与状态色竖条仍同源（竖条是实色，不受这条影响）。 */
  --tdt-success-soft:color-mix(in srgb,var(--tdt-success) 5%,transparent);
  --tdt-warning-soft:color-mix(in srgb,var(--tdt-warning) 5%,transparent);
  --tdt-danger-soft:color-mix(in srgb,var(--tdt-danger) 5%,transparent);
  --tdt-business-soft:color-mix(in srgb,var(--tdt-business) 5%,transparent);
  /* 「选中面」（深色版，2026-10-06）：掺 **~40% 背景色**（--tdt-surface-base）⇒ 无限接近页面背景的黑、
     只比背景略深一点点（用户：深色下展开区压着任务透明绿会发灰，底色要尽量贴近背景才不显灰）。
     ⚠️ 深色下不能掺文字色 —— 那是白，会变亮，选中反而比本月日期浅。 */
  --tdt-selected-bg:color-mix(in srgb,var(--tdt-surface-1) 60%,var(--tdt-surface-base));
  /* 任务日程页本月格的默认底（深色版，2026-10-06）：深的、带点灰蓝的暗色（用户给的参考图 ≈ #23262e），
     比原来的卡片面更沉、更偏蓝灰；选中格仍走 --tdt-selected-bg（更暗一档），层级不变。 */
  --tdt-cal-cell-bg:#23262e;
  /* 任务日程页本月格 hover 底（深色段，2026-10-06）：原先走 --tdt-hover（宿主浅色叠加）在深底上显得
     「灰发亮」，不好看 ⇒ 换成更贴底的蓝调微亮（与 open-bg-soft 同族），hover 时不刺眼、又有反馈。 */
  --tdt-cal-cell-hover:rgba(96,165,250,.12);
  /* 任务日程页展开面板底（深色段，2026-10-06 续）：与原 selected-bg 暗值一致，深色 UI 不动 */
  --tdt-cal-panel-bg:color-mix(in srgb,var(--tdt-surface-1) 60%,var(--tdt-surface-base));
}
`
