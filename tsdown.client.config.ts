import { readFileSync } from 'node:fs'
import { isBuiltin } from 'node:module'
import { defineConfig } from 'tsdown'

/**
 * 浏览器端产物不是普通 ESM，而是 dsh 模块内核消费的 CJS 闭包工厂：
 *
 *   window.__ModuleLoader__.load({ id, factory: (require) => { ... } })
 *
 * 因此 format 必须是 cjs，且要在产物外包上固定的 banner / footer / intro。
 * 这套契约来自 dsh 上游 packages/client/tsdown.client.ts 的 clientConfig()。
 */

/**
 * dsh 浏览器内核共享出来的模块表。命中这些 specifier 必须保留成 require()，
 * 由内核的模块表回答；打进包里会产生重复的运行时实例。
 *
 * 来源：上游 packages/client/web/src/platform.ts 的 PLATFORM_MODULES。
 */
const PLATFORM_MODULES = new Set([
  'react',
  'react/jsx-runtime',
  'react-dom',
  'react-dom/client',
  '@deepseek-ai/cordis',
  '@deepseek-ai/dsh-client-store',
  '@deepseek-ai/dsh-client-ui-slots',
  '@deepseek-ai/dsh-client-ui-primitives',
  '@deepseek-ai/dsh-client-ui-dockkit',
])

const PACKAGE_NAME = 'dsh-task-dispatch-table'

/** 版本号 + 构建编码：构建期烤进 bundle（与 dsh-task-ledger 同口径），判「宿主里跑的是不是刚 build 的」不用猜。
 *  编码用编译时刻的本地时间戳（非随机数）：年月日-时分秒-毫秒。 */
const PLUGIN_VERSION = JSON.parse(
  readFileSync(new URL('./package.json', import.meta.url), 'utf8'),
).version as string
const BUILD_STAMP = (() => {
  const d = new Date()
  const p = (n: number, w = 2) => String(n).padStart(w, '0')
  return `${p(d.getFullYear() % 100)}${p(d.getMonth() + 1)}${p(d.getDate())}-${p(d.getHours())}${p(d.getMinutes())}${p(d.getSeconds())}-${p(d.getMilliseconds(), 3)}`
})()

const isExternal = (specifier: string): boolean => PLATFORM_MODULES.has(specifier)

export default defineConfig({
  // 产出固定为 dist/client.js（单文件），与 exports['./client'] 一致；
  // dist 里同时有 host 侧 tsc 产物，所以 clean 必须关。
  entry: { client: 'src/client/index.ts' },
  outDir: 'dist',
  format: 'cjs',
  platform: 'browser',
  target: 'chrome99',
  dts: false,
  clean: false,
  sourcemap: true,
  // 浏览器里没有 Node 的 process。核心 UI（DateTimePicker / Picker）经 @floating-ui
  // 带来 `process.env.NODE_ENV` 的模块级判断，不替换会在 import 阶段直接抛
  // 「process is not defined」，整个 client entry 激活失败。
  define: {
    'process.env.NODE_ENV': '"production"',
    __PLUGIN_VERSION__: JSON.stringify(PLUGIN_VERSION),
    __BUILD_STAMP__: JSON.stringify(BUILD_STAMP),
  },
  deps: {
    // 模块表请求保留为 require；其余全部内联 —— 模块表回答不了的
    // require() 在运行时必然抛。
    neverBundle: isExternal,
    alwaysBundle: (specifier) => !isBuiltin(specifier) && !isExternal(specifier),
  },
  outputOptions: {
    entryFileNames: 'client.js',
    banner: `window.__ModuleLoader__.load({ id: ${JSON.stringify(PACKAGE_NAME)}, factory: (require) => {`,
    footer: 'return module.exports; } });',
    intro: 'var module = { exports: {} }; var exports = module.exports;',
  },
})
