// `react-dom` 在宿主模块表里（tsdown.client.config.ts 的 PLATFORM_MODULES，上游 platform.ts 同源），
// 运行时由内核的 require 回答；但本仓库没装 @types/react-dom ⇒ 只声明我们用到的那一个函数。
// 官方对照：ui-chat stat-dialog 用 createPortal 把明细弹层挂到 document.body。
declare module 'react-dom' {
  export function createPortal(
    children: unknown,
    container: Element | DocumentFragment,
    key?: string | number,
  ): import('react').ReactPortal
}
