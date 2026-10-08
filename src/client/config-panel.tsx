// 插件设置详情页（plugins.bundle.config）——2026-10-08 起只保留说明文字（用户拍板）。
//
// 本插件的所有配置都在插件主界面（侧栏面板的「设置」标签页）内完成，宿主这个详情页
// 不需要任何配置项 / 输入框 / 保存按钮——原「运行参数」表单与自有 HTTP 通道整体移除
// （宿主侧 /config 路由保留：主界面设置页仍在用）。页面上方的图标 / 名称 / 简介
// 由宿主渲染（package.json `icon` + locale/*.json 的 meta，随界面语言切换）。
import { createElement as h } from 'react'
import type { Translate } from './locales'

export interface ConfigPanelProps {
  t: Translate
  view?: 'summary' | 'page'
}

export function ConfigPanel(props: ConfigPanelProps) {
  const { t, view } = props
  // 列表摘要态不渲染说明块（与官方 SettingsForm 行为一致）。
  if (view !== undefined && view !== 'page') return null
  return h('div', { style: { padding: '4px 2px', maxWidth: '640px' } },
    h('p', {
      style: {
        fontSize: 'var(--tdt-font-md)', color: 'var(--tdt-fg,#1f2328)',
        lineHeight: 1.6, margin: 0, whiteSpace: 'pre-wrap',
      },
    }, t('settingsIntro')),
  )
}
