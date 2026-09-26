// markdown 渲染（决策 34）：只做本地渲染、不联网。
//
// 安全取舍（design R3）：归档会话内容是本机自家 agent 的产出，风险低，故先不引入
// DOMPurify（marked 原样透传原始 HTML）。若日后接入外部内容来源，再补消毒层。
//
// 用局部 Marked 实例而非全局 marked：避免与宿主页面里其它插件的 marked 全局状态互相污染。

import { Marked } from 'marked'

const md = new Marked({ gfm: true, breaks: true })

/**
 * markdown 文本 → HTML 字符串（同步）。渲染失败 / 空输入一律返回 ''，调用方回退到纯文本。
 * @param text - markdown 原文。
 */
export function renderMarkdown(text: string): string {
  if (text.trim() === '') return ''
  try {
    const html = md.parse(text)
    return typeof html === 'string' ? html : ''
  } catch {
    return ''
  }
}
