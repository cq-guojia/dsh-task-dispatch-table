/**
 * 附件上传的**共享约束**：体积上限 + 扩展名白名单 + 扩展名解析。
 *
 * 宿主路由（src/index.ts，服务端 415/413 拦截）与浏览器端预检（src/client/task-editor.tsx，
 * 发包前当场拒）**必须用同一份**——两处各写一份必然漂移（白名单改了这边忘了那边）。
 * 客户端打包（tsdown alwaysBundle）会把本模块内联进 client.js，宿主侧 tsc 直编，均无碍。
 */
/** 附件上传：体积上限（字节，20MB）。 */
export declare const ATTACHMENT_MAX_BYTES: number;
/** 附件上传：允许的常见扩展名（文本/代码/图片/文档）。命中白名单才收。 */
export declare const ALLOWED_ATTACHMENT_EXT: ReadonlySet<string>;
/** 取文件名扩展名（小写，无点返回 ''）。 */
export declare const extOf: (name: string) => string;
