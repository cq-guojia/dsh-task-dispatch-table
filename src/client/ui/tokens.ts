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
  /* 固定中性实面（自绘浮层、深色主题下必须自己变的那几个）——只有它需要暗色覆盖 */
  --tdt-solid:var(--dsw-static-neutral-00,#fff);
  --tdt-on-solid:var(--dsw-alias-label-primary,#1f2328);
  /* 交付文件卡那种「浅底盘 + hover 加深」两拍 */
  --tdt-plate:var(--dsw-static-neutral-50,#fafafa);
  --tdt-plate-hover:var(--dsw-static-neutral-100,#f5f5f5);
  --tdt-icon-plate:color-mix(in srgb,var(--dsw-static-neutral-00,#fff) 50%,transparent);

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

  /* ── 交互底 / 遮罩 ────────────────────────────────────────────────── */
  --tdt-hover:var(--dsw-alias-interactive-bg-hover,rgba(38,49,72,.06));
  --tdt-active:var(--dsw-alias-interactive-bg-active,#2631481a);
  --tdt-mask:var(--dsw-alias-bg-mask-1,#0000003d);

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

  /* ── 控件高度：全站只此两档（控件用 size="sm|md" 选，调用点不许自定义高度）── */
  --tdt-control-h-sm:24px;
  --tdt-control-h-md:28px;

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
  --tdt-z-dock:1030;
  --tdt-z-drawer:1040;
  --tdt-z-modal:1070;
  --tdt-z-menu:1100;
  --tdt-z-tip:1200;

  /* ── 动效 ─────────────────────────────────────────────────────────── */
  --tdt-dur:var(--ds-transition-duration,.2s);
  --tdt-dur-fast:var(--ds-transition-duration-fast,.12s);
  --tdt-ease:var(--ds-ease-in-out,cubic-bezier(.4,0,.2,1));
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
}
`
