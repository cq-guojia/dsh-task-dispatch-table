// 浏览器半侧：本插件的 Web 配置页（设置页「插件」标签页 → 本插件卡片）。
//
// 机制（真机作业核实：dsh-session-title-pattern 的同款入口已在宿主跑通）：
// 1. 注册面 = settings.plugin.item（keyed slot，key = settings 命名空间）。设置页
//    「插件」标签页遍历已服务命名空间并与 key 自动配对渲染，不需要自己 gating。
// 2. 顶层不得导出 inject：声明了组合满足不了的依赖会让 entry 一直 pending，
//    卡死整个 dsh 启动。服务等待一律写在 apply 内的 ctx.inject([...], cb)。
// 3. t 席位由渲染器按注册项的 locale: 声明合成进 props；scope 由 inject 工厂注入。
// 4. 组件经 useSyncExternalStore 消费 scope 快照（value = schema 默认兜底的完整值、
//    user = 用户层稀疏覆盖、writable）；保存走 scope.set/unset —— 写入走
//    remote.settings.mutate，以快照 revision 设栅，并发脱节时抛错。
//
// 纯净度：本文件不 import 任何 Node 侧模块，也不 import 宿主 @deepseek-ai/* 包的
// 值——跨插件协作走 cordis 服务注入（locale/slots/settingsScope），类型全部本地
// 结构化声明。客户端 bundle 不打包 src/config.ts（Node 侧），Config 语义在此以
// 字段名复述。

import { createElement as h, useCallback, useState, useSyncExternalStore } from 'react'
import { en, zh, type LocaleKey } from './locales'

/** 设置命名空间 = 宿主 apply() 里 ctx.settings.register 的注册名（src/index.ts:42）。 */
const SETTINGS_NS = 'dsh-task-dispatch-table'
/** 字典命名空间（locale 注册表独立于 settings 命名空间，取同名便于对应）。 */
const LOCALE_NS = SETTINGS_NS

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

/** 浏览器插件上下文：只声明本文件实际用到的服务面。 */
interface ClientContext {
  /** 延迟等待服务就位后执行回调（服务名 = cordis 声明名）。 */
  inject(deps: readonly string[], cb: (ctx: ClientContext) => void): void
  /** 组合内副作用：进入时 setup、离开时执行返回的清理函数。 */
  effect(setup: () => (() => void) | void): void
  locale: {
    register(ns: string, dictionaries: Record<string, Record<string, string>>): void
  }
  slots: {
    /** 延迟注册：slot 声明出现时才调用 factory，返回注销函数。 */
    inject(slot: string, factory: () => () => void): () => void
    /** 注册一个条目，返回注销函数。 */
    register(options: Record<string, unknown>, component: unknown): () => void
  }
  settingsScope: {
    bind(spec: { namespace: string }): SettingsScope
  }
}

/** 组件 props：渲染器合成的 t 席位 + 注册项 inject 工厂注入的 scope。 */
interface PageProps {
  t: Translate
  scope: SettingsScope
}

// ─────────────────────────── 页面组件 ───────────────────────────

/** 只读参数展示值：undefined 显示占位符，statePath 空串 = 宿主数据根默认（决策 14）。 */
function displayParam(t: Translate, value: unknown): string {
  if (value === undefined) return '—'
  if (typeof value === 'string' && value.trim() === '') return t('paramDefault')
  return String(value)
}

const textareaStyle: Record<string, string | number> = {
  width: '100%', boxSizing: 'border-box', minHeight: '16em', resize: 'vertical',
  fontFamily: 'ui-monospace, SFMono-Regular, Menlo, Consolas, monospace',
  fontSize: '12px', lineHeight: 1.5, padding: '8px',
}

const hintStyle: Record<string, string | number> = { opacity: 0.7, fontSize: '12px', margin: '4px 0 8px' }
const errorStyle: Record<string, string | number> = { color: '#c0392b', fontSize: '12px', margin: '4px 0 0' }
const rowStyle: Record<string, string | number> = { display: 'flex', gap: '8px', margin: '8px 0' }
const dlStyle: Record<string, string | number> = { display: 'grid', gridTemplateColumns: 'auto 1fr', gap: '4px 16px', margin: '8px 0 0' }

/** 任务表草稿是否为宿主可解析的 JSON 数组（空白串视为清空，合法）。 */
function isValidTaskTable(text: string): boolean {
  if (text.trim() === '') return true
  try {
    return Array.isArray(JSON.parse(text))
  } catch {
    return false
  }
}

/**
 * 渲染设置卡片：tasksInline 文本框（暂存 + 保存）+ 只读运行参数。
 *
 * 用「暂存 + 保存」而不是改一下就提交：每次写入都是可持久化的、带修订号栅栏的
 * 文档变更，边改边写会把一次输入变成用户没要求、也无法预览的写入。
 * @param props - t 席位与绑定的设置作用域。
 */
function TasksConfigPage(props: PageProps) {
  const { t, scope } = props
  const subscribe = useCallback((onChange: () => void) => scope.subscribe(onChange), [scope])
  // getSnapshot 必须返回稳定引用：作用域的实现在值不变时保证同一引用。
  const getSnapshot = useCallback(() => scope.getSnapshot(), [scope])
  const snapshot = useSyncExternalStore(subscribe, getSnapshot)

  // 暂存草稿：undefined = 无草稿（textarea 显示生效值）。保存成功即清草稿；
  // 离开页面组件销毁，未保存的草稿自然丢弃。
  const [draft, setDraft] = useState<string | undefined>(undefined)
  const [saving, setSaving] = useState(false)
  const [failed, setFailed] = useState(false)

  const section = (snapshot.value ?? {}) as Record<string, unknown>
  const effectiveInline = typeof section.tasksInline === 'string' ? section.tasksInline : ''
  const current = draft ?? effectiveInline
  const invalid = draft !== undefined && !isValidTaskTable(draft)
  const dirty = draft !== undefined && draft !== effectiveInline
  const ready = snapshot.status === 'ready'
  const writable = ready && snapshot.writable && !saving

  const save = async (): Promise<void> => {
    if (draft === undefined || invalid || !ready || !snapshot.writable) return
    setSaving(true)
    setFailed(false)
    try {
      // 空白串 = 清空 = 回到默认（host 侧 tasksInline 默认空串），走 unset 不留覆盖。
      if (draft.trim() === '') await scope.unset('tasksInline')
      else await scope.set('tasksInline', draft)
      setDraft(undefined)
    } catch {
      // 草稿保留，用户可以改完再存一次，而不是重打一遍。
      setFailed(true)
    } finally {
      setSaving(false)
    }
  }

  if (!ready) return h('p', null, t('unavailable'))

  return h('div', null,
    h('h3', null, t('title')),
    h('p', { style: hintStyle }, t('description')),
    h('label', { htmlFor: 'dsh-tdt-tasks-inline', style: { fontWeight: 600 } }, t('tasksInlineLabel')),
    h('p', { style: hintStyle }, t('tasksInlineHint')),
    h('textarea', {
      id: 'dsh-tdt-tasks-inline',
      value: current,
      disabled: !writable,
      onChange: (event: { target: { value: string } }) => { setDraft(event.target.value) },
      spellCheck: false,
      style: textareaStyle,
    }),
    invalid ? h('p', { style: errorStyle }, t('invalidJson')) : null,
    h('div', { style: rowStyle },
      h('button', {
        type: 'button',
        onClick: () => { void save() },
        disabled: !writable || invalid || !dirty,
      }, saving ? t('saving') : t('save')),
      h('button', {
        type: 'button',
        onClick: () => { setDraft(undefined); setFailed(false) },
        disabled: saving || !dirty,
      }, t('discard')),
    ),
    failed ? h('p', { style: errorStyle }, t('saveFailed')) : null,
    h('details', { style: { marginTop: '16px' } },
      h('summary', null, t('paramsTitle')),
      h('dl', { style: dlStyle },
        h('dt', null, t('paramStatePath')), h('dd', { style: { margin: 0 } }, displayParam(t, section.statePath)),
        h('dt', null, t('paramTickMs')), h('dd', { style: { margin: 0 } }, displayParam(t, section.tickMs)),
        h('dt', null, t('paramDispatchGraceMs')), h('dd', { style: { margin: 0 } }, displayParam(t, section.dispatchGraceMs)),
        h('dt', null, t('paramLeaseMs')), h('dd', { style: { margin: 0 } }, displayParam(t, section.leaseMs)),
        h('dt', null, t('paramUnknownGraceMs')), h('dd', { style: { margin: 0 } }, displayParam(t, section.unknownGraceMs)),
        h('dt', null, t('paramTasksDir')), h('dd', { style: { margin: 0 } }, displayParam(t, section.tasksDir)),
      ),
    ),
  )
}

// ─────────────────────────── 插件主体 ───────────────────────────

/**
 * 浏览器插件入口：注册文案字典；在 slots + settingsScope 就位后把配置页注册进
 * settings.plugin.item（keyed 槽位，key = 设置命名空间）。
 * @param ctx - 浏览器插件上下文。
 */
export function apply(ctx: ClientContext): void {
  // 词典注册要等 locale 服务；绝不能写进模块级注入声明（组合缺服务会 pending 卡死）。
  ctx.inject(['locale'], (localeCtx) => {
    ctx.effect(() => localeCtx.locale.register(LOCALE_NS, { zh, en }))
  })

  // host 半侧用同一命名空间注册 settings section；设置页「插件」标签页遍历
  // 已服务命名空间并自动配对渲染，这里只需按命名空间贡献卡片。
  ctx.inject(['slots', 'settingsScope'], (sub) => {
    const scope = sub.settingsScope.bind({ namespace: SETTINGS_NS })
    sub.slots.inject('settings.plugin.item', () =>
      sub.slots.register(
        {
          name: 'settings.plugin.item',
          // keyed 槽位用 key 声明本条贡献给哪个命名空间。
          key: SETTINGS_NS,
          locale: LOCALE_NS,
          inject: () => ({ scope }),
        },
        TasksConfigPage,
      ),
    )
  })
}
