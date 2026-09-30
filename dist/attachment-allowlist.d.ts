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
/**
 * 附件 `ref` 是否**安全**（可以拼进路径）：非空、不含 `..`（相对路径上跳）、
 * 不以 `/` 或 `\` 开头（绝对路径）、不含 `\`（Windows 分隔符）。
 *
 * **唯一实现**（2026-09-30 抽象收敛）：此前同一规则写了 **4 份**且各有出入——
 * 宿主 zod（`tasks.ts`：拒绝 `..`/绝对/反斜杠）、客户端保存前校验（`task-editor`：多查了开头 `\`）、
 * 真删前防御（`task-assets.removeAttachmentFiles`：没查开头 `\`）、上传定位
 * （`task-assets.locateUploaded`：连反斜杠都没查）。各写一份必然漂移——
 * 「选工作区文件报 422 附件 ref 非法」那类 bug 的温床就在这。
 */
export declare const isSafeAttachmentRef: (ref: string) => boolean;
