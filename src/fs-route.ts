/**
 * 核心 `adv/explorer` 的文件系统 HTTP 路由（宿主注册 / 客户端连接共用一条常量）。
 *
 * 核心 `FileBrowser` 只吃 `FsFace`（绝对路径）；宿主侧由 `serveFsRoute` 提供该路由，
 * 客户端由 `connectFs({ path })` 建 HTTP face。路径与插件路由同前缀，避免与其他插件撞车。
 */
export const FS_ROUTE = '/api/task-dispatch-table/fs'
