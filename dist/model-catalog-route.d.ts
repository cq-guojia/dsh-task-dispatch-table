/**
 * 核心 `ModelPicker` 的模型目录 HTTP 路由（宿主注册 / 客户端连接共用同一条常量）。
 *
 * 宿主 `apply` 调 `serveModelCatalog(ctx, { path: MODELS_ROUTE, authorize })`，
 * 客户端 `apply` 调 `connectHost(ctx, { modelsPath: MODELS_ROUTE })`；两侧必须是同一个值，
 * 选模型控件才吃得到宿主的真实目录（不传 modelsPath 时核心直接不取，见 host-data.ts）。
 * 与 `fs-route.ts` 同前缀，避免与其他插件撞车。
 */
export declare const MODELS_ROUTE = "/api/task-dispatch-table/models";
