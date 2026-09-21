// 浏览器半侧：本插件的 Web 配置页（dsh「插件」页 → 本组合包详情页）。
//
// 机制结论（宿主源码核实，/tmp/dsh-source，deepseek-harness 0.1.6-alpha.2）：
// 1. 宿主发现 client bundle：packages/client/modules/src/index.ts:781-816 —— 节点半侧扫描
//    Loader 行，读包 manifest 的 dsh.client 声明（须 platform: 'web'）+ exports['./client']
//    指向的产物路径，把产物以 /plugins/<包名>/client.js 供出；浏览器半侧挂在说明符恰为
//    包名的那一行 Loader 行上（本包 cordis.patch.yml 的行 name = dsh-task-dispatch-table）。
// 2. 产物格式 = lazy-CJS factory（packages/client/tsdown.client.ts:618-624 的 banner/footer/
//    intro）：window.__ModuleLoader__.load({ id, factory(require){ ... return module.exports } })，
//    externals 经注入的 require 从基座模块表解析（PLATFORM_MODULES 含 react 与
//    react/jsx-runtime，packages/client/web/src/platform.ts:8-14）。构建复刻见 scripts/build-client.mjs。
// 3. 配置页 slot：packages/client/ui-plugin-manager/src/client/slot-contract.ts:27-38 ——
//    plugins.item 保留给宿主平面配置页（ui-settings-plugins 占用）；组合包自己的配置注册进
//    plugins.bundle.config（keyed，键 = 包名，owner 只索要 view: 'page'），渲染在组合包页面
//    描述与行之间（PluginManagerPage.tsx:470）。ui-plugin-manager/README.zh.md:46-58 给出
//    组合包注册示例。
// 4. 读写路径：ui-settings 浏览器半侧提供 ctx.settingsScope 服务（settings-scope.ts:232-298），
//    bind({ namespace }) 得到快照读取 + set/unset 写入（写走 remote.settings.mutate，
//    以草稿读取时的 revision 设栅，脱节即拒绝）；已服务命名空间目录经
//    ctx.settingsScope.describe() 镜像读取（ui-settings-plugins/src/client/index.ts:124-148 的
//    同款 gating：命名空间被服务期间才注册页面）。
//
// 纯净度：本文件不 import 任何 Node 侧模块，也不 import 宿主 @deepseek-ai/* 包的值——
// 跨插件协作走 cordis 服务注入（settingsScope/locale/slots），类型全部本地结构化声明。
// 客户端 bundle 不打包 src/config.ts（Node 侧），Config 语义在此以字段名复述。

import { createElement as h } from 'react'
import { en, zh, type LocaleKey } from './locales.ts'

/** 设置命名空间 = 宿主 apply() 里 ctx.settings.register 的注册名（src/index.ts:42）。 */
const SETTINGS_NS = 'dsh-task-dispatch-table'
/** 字典命名空间（locale 注册表独立于 settings 命名空间，取同名便于对应）。 */
const LOCALE_NS = SETTINGS_NS
/** plugins.bundle.config 的键 = 组合包包名（slot-contract.ts:32-38）。 */
const BUNDLE_KEY = SETTINGS_NS

/** cordis 浏览器半侧依赖的服务：页面注册（slots）、文案（locale）、settings 读写（settingsScope）。 */
export const inject = ['slots', 'locale', 'settingsScope'] as const

// ─────────────────────────── 本地结构类型（不 import 宿主包） ───────────────────────────

type Translate = (key: LocaleKey) => string

/** settingsScope 快照中本页消费的切片（SettingsScopeSnapshot 的结构子集）。 */
interface ScopeSnapshot {
  status: string
  value: Record<string, unknown> | undefined
  base: Record<string, unknown> | undefined
  user: Record<string, unknown> | undefined
  writable: boolean
}

/** 一个 settings 命名空间的作用域（SettingsScopeController 的结构子集）。 */
interface SettingsScope {
  getSnapshot(): ScopeSnapshot
  subscribe(listener: () => void): () => void
  set(field: string, value: unknown): Promise<void>
  unset(field: string): Promise<void>
}

/** 已服务命名空间目录面（SettingsDescribeMirror 的结构子集）。 */
interface DescribeFace {
  getSnapshot(): { view?: { namespaces: ReadonlyArray<{ ns: string }> } | undefined }
  subscribe(listener: () => void): () => void
  ensure(): unknown
}

/** 最小快照仓（createSnapshotStore 的结构子集）：渲染侧的 useX 席位只要求这两个方法。 */
interface SnapshotStore<T> {
  getSnapshot(): T
  subscribe(listener: () => void): () => void
  set(next: T): void
}

/** 浏览器插件上下文：只声明本文件实际用到的服务面。 */
interface ClientContext {
  slots: {
    /** 延迟注册：slot 声明出现时才调用 factory，返回注销函数。 */
    inject(slot: string, factory: () => () => void): () => void
    /** 注册一个条目，返回注销函数。 */
    register(options: Record<string, unknown>, component: unknown): () => void
  }
  locale: {
    bind(ns: string): Translate
    register(ns: string, dictionaries: Record<string, Record<string, string>>): void
  }
  settingsScope: {
    bind(spec: { namespace: string }): SettingsScope
    describe(): DescribeFace
  }
  effect(setup: () => (() => void) | void, label: string): void
}

/** 组件状态：表单壳 + 草稿 + 只读参数（字段名与 src/config.ts 的 Config 一一对应）。 */
interface PageState {
  available: boolean
  writable: boolean
  dirty: boolean
  invalid: boolean
  saving: boolean
  failed: boolean
  /** textarea 当前展示文本：草稿优先，否则取生效值。 */
  draft: string
  /** 用户层是否已带 tasksInline 覆盖。 */
  overridden: boolean
  values: {
    statePath: string | undefined
    tickMs: number | undefined
    dispatchGraceMs: number | undefined
    leaseMs: number | undefined
    unknownGraceMs: number | undefined
    tasksDir: string | undefined
  }
}

/** 组件 props：渲染器合成的 t 席位 + owner 的 view + 注入面（hooks → useX 席位）。 */
interface PageProps {
  t: Translate
  view: 'summary' | 'page'
  useTasksConfig(selector: (state: PageState) => PageState): PageState
  edit(text: string): void
  save(): void
  discard(): void
}

// ─────────────────────────── 页面组件 ───────────────────────────

/** 只读参数展示值：undefined 显示占位符，statePath 空串 = 宿主数据根默认（决策 14）。 */
function displayParam(t: Translate, value: string | number | undefined): string {
  if (value === undefined) return '—'
  if (typeof value === 'string' && value.trim() === '') return t('paramDefault')
  return String(value)
}

const textareaStyle: Record<string, string> = {
  width: '100%', boxSizing: 'border-box', minHeight: '16em', resize: 'vertical',
  fontFamily: 'ui-monospace, SFMono-Regular, Menlo, Consolas, monospace',
  fontSize: '12px', lineHeight: 1.5, padding: '8px',
}

const hintStyle: Record<string, string> = { opacity: 0.7, fontSize: '12px', margin: '4px 0 8px' }
const errorStyle: Record<string, string> = { color: '#c0392b', fontSize: '12px', margin: '4px 0 0' }
const rowStyle: Record<string, string> = { display: 'flex', gap: '8px', margin: '8px 0' }
const dlStyle: Record<string, string> = { display: 'grid', gridTemplateColumns: 'auto 1fr', gap: '4px 16px', margin: '8px 0 0' }

/**
 * 渲染组合包配置页（plugins.bundle.config 只索要 view: 'page'，summary 视图仅防御性支持）。
 * @param props - t 席位、视图名、状态席位居、表单动作。
 * @returns 一句话简介（summary），或整页表单（page）。
 */
function TasksConfigPage(props: PageProps) {
  const { t } = props
  const state = props.useTasksConfig((s) => s)
  if (props.view === 'summary') return h('span', null, t('summary'))
  if (!state.available) return h('p', null, t('unavailable'))
  return h('div', null,
    h('h3', null, t('title')),
    h('p', { style: hintStyle }, t('description')),
    h('label', { htmlFor: 'dsh-tdt-tasks-inline', style: { fontWeight: 600 } }, t('tasksInlineLabel')),
    h('p', { style: hintStyle }, t('tasksInlineHint')),
    h('textarea', {
      id: 'dsh-tdt-tasks-inline',
      value: state.draft,
      disabled: !state.writable || state.saving,
      onChange: (event: { target: { value: string } }) => { props.edit(event.target.value) },
      spellCheck: false,
      style: textareaStyle,
    }),
    state.invalid ? h('p', { style: errorStyle }, t('invalidJson')) : null,
    h('div', { style: rowStyle },
      h('button', {
        type: 'button',
        onClick: () => { props.save() },
        disabled: !state.writable || state.saving || state.invalid,
      }, state.saving ? t('saving') : t('save')),
      h('button', {
        type: 'button',
        onClick: () => { props.discard() },
        disabled: state.saving || !state.dirty,
      }, t('discard')),
    ),
    state.failed ? h('p', { style: errorStyle }, t('saveFailed')) : null,
    h('details', { style: { marginTop: '16px' } },
      h('summary', null, t('paramsTitle')),
      h('dl', { style: dlStyle },
        h('dt', null, t('paramStatePath')), h('dd', { style: { margin: 0 } }, displayParam(t, state.values.statePath)),
        h('dt', null, t('paramTickMs')), h('dd', { style: { margin: 0 } }, displayParam(t, state.values.tickMs)),
        h('dt', null, t('paramDispatchGraceMs')), h('dd', { style: { margin: 0 } }, displayParam(t, state.values.dispatchGraceMs)),
        h('dt', null, t('paramLeaseMs')), h('dd', { style: { margin: 0 } }, displayParam(t, state.values.leaseMs)),
        h('dt', null, t('paramUnknownGraceMs')), h('dd', { style: { margin: 0 } }, displayParam(t, state.values.unknownGraceMs)),
        h('dt', null, t('paramTasksDir')), h('dd', { style: { margin: 0 } }, displayParam(t, state.values.tasksDir)),
      ),
    ),
  )
}

// ─────────────────────────── 插件主体 ───────────────────────────

/** 任务表草稿是否为宿主可解析的 JSON（空串视为清空，合法）。 */
function isValidTaskTable(text: string): boolean {
  if (text.trim() === '') return true
  try {
    const parsed: unknown = JSON.parse(text)
    return typeof parsed === 'object' && parsed !== null
  } catch {
    return false
  }
}

/**
 * 浏览器插件入口：注册文案字典、绑定 settings 作用域、在命名空间被服务期间
 * 把配置页注册进 plugins.bundle.config。
 * @param ctx - 浏览器插件上下文。
 */
export function apply(ctx: ClientContext): void {
  ctx.effect(() => ctx.locale.register(LOCALE_NS, { zh, en }), 'dsh-task-dispatch-table: 页面字典')

  const scope = ctx.settingsScope.bind({ namespace: SETTINGS_NS })

  // 暂存表单（只有保存才写入；离开页面即随插件 fiber 销毁，等同丢弃草稿）。
  let staged: string | undefined
  let saving = false
  let failed = false

  const effectiveInline = (): string => {
    const value = scope.getSnapshot().value?.['tasksInline']
    return typeof value === 'string' ? value : ''
  }
  const publish = (): void => { store.set(buildState()) }

  const buildState = (): PageState => {
    const snapshot = scope.getSnapshot()
    const value = snapshot.value
    const invalid = staged !== undefined && !isValidTaskTable(staged)
    return {
      available: snapshot.status === 'ready',
      writable: snapshot.writable,
      dirty: staged !== undefined,
      invalid,
      saving,
      failed,
      draft: staged ?? effectiveInline(),
      overridden: snapshot.user !== undefined && Object.hasOwn(snapshot.user, 'tasksInline'),
      values: {
        statePath: typeof value?.['statePath'] === 'string' ? value['statePath'] as string : undefined,
        tickMs: typeof value?.['tickMs'] === 'number' ? value['tickMs'] as number : undefined,
        dispatchGraceMs: typeof value?.['dispatchGraceMs'] === 'number' ? value['dispatchGraceMs'] as number : undefined,
        leaseMs: typeof value?.['leaseMs'] === 'number' ? value['leaseMs'] as number : undefined,
        unknownGraceMs: typeof value?.['unknownGraceMs'] === 'number' ? value['unknownGraceMs'] as number : undefined,
        tasksDir: typeof value?.['tasksDir'] === 'string' ? value['tasksDir'] as string : undefined,
      },
    }
  }

  // 最小快照仓：注入面的 hooks 席位只要求 getSnapshot/subscribe（渲染器在其上合成 useX）。
  const store: SnapshotStore<PageState> = (() => {
    let state = buildState()
    const listeners = new Set<() => void>()
    return {
      getSnapshot: () => state,
      subscribe(listener) { listeners.add(listener); return () => { listeners.delete(listener) } },
      set(next) { state = next; for (const listener of [...listeners]) listener() },
    }
  })()
  scope.subscribe(publish)

  const actions = {
    edit(text: string): void {
      staged = text
      failed = false
      publish()
    },
    save(): void { void saveNow() },
    discard(): void {
      if (staged === undefined && !failed) return
      staged = undefined
      failed = false
      publish()
    },
  }

  /** 写暂存草稿并回读落地结果；宿主是唯一裁判，未落地保留草稿。 */
  async function saveNow(): Promise<void> {
    const snapshot = scope.getSnapshot()
    if (saving || snapshot.status !== 'ready' || !snapshot.writable) return
    const text = staged
    if (text === undefined) return
    if (!isValidTaskTable(text)) { publish(); return }
    saving = true
    failed = false
    publish()
    let landed: boolean
    if (text.trim() === '') {
      await scope.unset('tasksInline')
      const user = scope.getSnapshot().user
      landed = !(user !== undefined && Object.hasOwn(user, 'tasksInline'))
    } else {
      await scope.set('tasksInline', text)
      const user = scope.getSnapshot().user
      landed = user !== undefined && user['tasksInline'] === text
    }
    if (landed) staged = undefined
    saving = false
    failed = !landed
    publish()
  }

  // 命名空间被服务期间注册页面，停止服务即撤下（ui-settings-plugins/src/client/index.ts:124-148 同款 gating）。
  const describeFace = ctx.settingsScope.describe()
  ctx.effect(() => {
    let off: (() => void) | undefined
    const sync = (): void => {
      const namespaces = describeFace.getSnapshot().view?.namespaces
      const served = namespaces?.some((view) => view.ns === SETTINGS_NS) ?? false
      if (served && off === undefined) {
        off = ctx.slots.inject('plugins.bundle.config', () => ctx.slots.register({
          name: 'plugins.bundle.config',
          key: BUNDLE_KEY,
          locale: LOCALE_NS,
          inject: () => ({ hooks: { tasksConfig: store }, ...actions }),
        }, TasksConfigPage))
      } else if (!served && off !== undefined) {
        off()
        off = undefined
      }
    }
    const unsubscribe = describeFace.subscribe(sync)
    void describeFace.ensure()
    sync()
    return () => {
      unsubscribe()
      if (off !== undefined) {
        off()
        off = undefined
      }
    }
  }, 'dsh-task-dispatch-table: 配置页注册')
}
