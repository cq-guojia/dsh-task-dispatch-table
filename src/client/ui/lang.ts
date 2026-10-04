/**
 * 源码态语法高亮：扩展名 → CodeMirror 语言映射（移植自 DSH-better-sidebar，
 * 仅保留本仓已引入的语言包：javascript/json/markdown/python/html/css/yaml +
 * legacy-modes 长尾，避免引入新品类依赖）。纯函数、可单测。
 */
import { Language, LanguageSupport, StreamLanguage } from '@codemirror/language'
import { javascript } from '@codemirror/lang-javascript'
import { json } from '@codemirror/lang-json'
import { markdown } from '@codemirror/lang-markdown'
import { python } from '@codemirror/lang-python'
import { html } from '@codemirror/lang-html'
import { css } from '@codemirror/lang-css'
import { yaml } from '@codemirror/lang-yaml'
import { shell } from '@codemirror/legacy-modes/mode/shell'
import { toml } from '@codemirror/legacy-modes/mode/toml'
import { nginx } from '@codemirror/legacy-modes/mode/nginx'
import { dockerFile } from '@codemirror/legacy-modes/mode/dockerfile'
import { properties } from '@codemirror/legacy-modes/mode/properties'
import { csharp, kotlin, dart, scala, objectiveCpp } from '@codemirror/legacy-modes/mode/clike'
import { swift } from '@codemirror/legacy-modes/mode/swift'
import { sCSS, less } from '@codemirror/legacy-modes/mode/css'
import { sass } from '@codemirror/legacy-modes/mode/sass'
import { stylus } from '@codemirror/legacy-modes/mode/stylus'
import { ruby } from '@codemirror/legacy-modes/mode/ruby'
import { lua } from '@codemirror/legacy-modes/mode/lua'
import { perl } from '@codemirror/legacy-modes/mode/perl'
import { r } from '@codemirror/legacy-modes/mode/r'
import { groovy } from '@codemirror/legacy-modes/mode/groovy'
import { powerShell } from '@codemirror/legacy-modes/mode/powershell'
import { diff } from '@codemirror/legacy-modes/mode/diff'
import { protobuf } from '@codemirror/legacy-modes/mode/protobuf'
import { cmake } from '@codemirror/legacy-modes/mode/cmake'
import { pug } from '@codemirror/legacy-modes/mode/pug'
import { tcl } from '@codemirror/legacy-modes/mode/tcl'
import { haskell } from '@codemirror/legacy-modes/mode/haskell'
import { clojure } from '@codemirror/legacy-modes/mode/clojure'
import { erlang } from '@codemirror/legacy-modes/mode/erlang'
import { julia } from '@codemirror/legacy-modes/mode/julia'
import { pascal } from '@codemirror/legacy-modes/mode/pascal'
import { vb } from '@codemirror/legacy-modes/mode/vb'
import { vhdl } from '@codemirror/legacy-modes/mode/vhdl'
import { stex } from '@codemirror/legacy-modes/mode/stex'

/** 取路径的扩展名（小写，无点）。 */
export function extOf(path: string): string {
  const base = path.slice(path.lastIndexOf('/') + 1)
  const dot = base.lastIndexOf('.')
  return dot <= 0 ? '' : base.slice(dot + 1).toLowerCase()
}

/** 扩展名对应的语言键；无匹配返回 null（纯文本）。 */
export function languageKeyForExt(ext: string): string | null {
  switch (ext) {
    case 'js': case 'mjs': case 'cjs': return 'js'
    case 'jsx': return 'jsx'
    case 'ts': case 'mts': case 'cts': return 'ts'
    case 'tsx': return 'tsx'
    case 'json': case 'jsonc': return 'json'
    case 'md': case 'markdown': return 'md'
    case 'py': case 'pyw': return 'python'
    case 'html': case 'htm': return 'html'
    case 'css': return 'css'
    case 'yaml': case 'yml': return 'yaml'
    case 'sh': case 'bash': case 'zsh': return 'shell'
    case 'toml': return 'toml'
    case 'nginx': case 'conf': return 'nginx'
    case 'dockerfile': case 'docker': return 'dockerfile'
    case 'properties': case 'env': return 'properties'
    case 'scss': return 'scss'
    case 'sass': return 'sass'
    case 'less': return 'less'
    case 'styl': return 'stylus'
    case 'rb': return 'ruby'
    case 'lua': return 'lua'
    case 'pl': case 'pm': return 'perl'
    case 'r': return 'r'
    case 'groovy': return 'groovy'
    case 'ps1': case 'psm1': return 'powershell'
    case 'diff': case 'patch': return 'diff'
    case 'proto': return 'protobuf'
    case 'cmake': return 'cmake'
    case 'pug': return 'pug'
    case 'tcl': return 'tcl'
    case 'hs': return 'haskell'
    case 'clj': case 'cljs': return 'clojure'
    case 'erl': return 'erlang'
    case 'jl': return 'julia'
    case 'pas': return 'pascal'
    case 'vb': return 'vb'
    case 'vhd': return 'vhdl'
    case 'tex': return 'stex'
    case 'cs': return 'csharp'
    case 'kt': case 'kts': return 'kotlin'
    case 'dart': return 'dart'
    case 'scala': case 'sc': return 'scala'
    case 'mm': return 'objectivecpp'
    case 'c': case 'h': case 'cc': case 'cpp': case 'cxx': case 'hpp': case 'hh': case 'hxx': return 'cpp'
    default: return null
  }
}

type LangFactory = () => Language | LanguageSupport

const FACTORIES: Record<string, LangFactory> = {
  js: () => javascript({ jsx: true }),
  jsx: () => javascript({ jsx: true }),
  ts: () => javascript({ typescript: true }),
  tsx: () => javascript({ typescript: true, jsx: true }),
  json: () => json(),
  md: () => markdown(),
  python: () => python(),
  html: () => html(),
  css: () => css(),
  yaml: () => yaml(),
  shell: () => StreamLanguage.define(shell),
  toml: () => StreamLanguage.define(toml),
  nginx: () => StreamLanguage.define(nginx),
  dockerfile: () => StreamLanguage.define(dockerFile),
  properties: () => StreamLanguage.define(properties),
  csharp: () => StreamLanguage.define(csharp),
  kotlin: () => StreamLanguage.define(kotlin),
  dart: () => StreamLanguage.define(dart),
  scala: () => StreamLanguage.define(scala),
  objectivecpp: () => StreamLanguage.define(objectiveCpp),
  swift: () => StreamLanguage.define(swift),
  scss: () => StreamLanguage.define(sCSS),
  sass: () => StreamLanguage.define(sass),
  less: () => StreamLanguage.define(less),
  stylus: () => StreamLanguage.define(stylus),
  ruby: () => StreamLanguage.define(ruby),
  lua: () => StreamLanguage.define(lua),
  perl: () => StreamLanguage.define(perl),
  r: () => StreamLanguage.define(r),
  groovy: () => StreamLanguage.define(groovy),
  powershell: () => StreamLanguage.define(powerShell),
  diff: () => StreamLanguage.define(diff),
  protobuf: () => StreamLanguage.define(protobuf),
  cmake: () => StreamLanguage.define(cmake),
  pug: () => StreamLanguage.define(pug),
  tcl: () => StreamLanguage.define(tcl),
  haskell: () => StreamLanguage.define(haskell),
  clojure: () => StreamLanguage.define(clojure),
  erlang: () => StreamLanguage.define(erlang),
  julia: () => StreamLanguage.define(julia),
  pascal: () => StreamLanguage.define(pascal),
  vb: () => StreamLanguage.define(vb),
  vhdl: () => StreamLanguage.define(vhdl),
  stex: () => StreamLanguage.define(stex),
  // C/C++/Obj-C 无独立 lang 包，回落到 C 系 StreamLanguage（近似上色，纯只读渲染足够）。
  cpp: () => StreamLanguage.define(csharp),
}

/** 路径对应的 CodeMirror 语法扩展；未知扩展回落 null（纯文本）。 */
export function languageForPath(path: string): Language | LanguageSupport | null {
  const key = languageKeyForExt(extOf(path))
  if (key === null) return null
  try {
    return FACTORIES[key]!()
  } catch (error) {
    // 单个语言工厂失败 ⇒ 退化为纯文本，绝不让查看器崩。
    console.warn(`[dsh-task-dispatch] language factory "${key}" failed:`, error)
    return null
  }
}
