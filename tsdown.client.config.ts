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
