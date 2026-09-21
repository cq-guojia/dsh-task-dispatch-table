// 构建 client bundle：dist/client.js（lazy-CJS factory，宿主 clientBundle 预设的第三方复刻）。
//
// 宿主预设 packages/client/tsdown.client.ts:473-627 产出格式（未发布为 npm 包，第三方插件自行复刻，
// 见 ui-settings-plugins/README.zh.md「已知限制」）：format cjs + platform browser，入口命名
// client.js，产物首尾拼装——
//   banner: window.__ModuleLoader__.load({ id: "<包名>", factory: (require) => {
//   intro : var module = { exports: {} }; var exports = module.exports;
//   footer: return module.exports; } });
// esbuild 没有独立 intro 槽位，把 intro 并入 banner 末尾，语义等价。externals（react、
// react/jsx-runtime）留在 require() 调用上，由宿主基座模块表解析（PLATFORM_MODULES，
// packages/client/web/src/platform.ts:8-14）；其余依赖全部内联（本页只有 react 一个运行时依赖）。
// sourcemap 不产出：宿主对缺失 map 容忍（modules/src/index.ts:287-302，ENOENT → undefined）。
import { build } from 'esbuild'
import { readFileSync } from 'node:fs'

const pkg = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8'))

const banner = [
  `window.__ModuleLoader__.load({ id: ${JSON.stringify(pkg.name)}, factory: (require) => {`,
  'var module = { exports: {} }; var exports = module.exports;',
].join('\n')
const footer = ';return module.exports; } });'

await build({
  entryPoints: ['src/client/index.ts'],
  outfile: 'dist/client.js',
  bundle: true,
  format: 'cjs',
  platform: 'browser',
  target: 'es2024',
  // 基座模块表里的说明符保持 require() 外链，其余内联（对齐 tsdown.client.ts:491-499 的 deps 规则）。
  external: ['react', 'react/jsx-runtime'],
  banner: { js: banner },
  footer: { js: footer },
  logLevel: 'info',
})
