/** 任务目录根名。 */
export declare const TASKS_DIR_NAME = "tasks";
/** 上传临时区（新上传先落这里，保存时才搬进任务目录）。 */
export declare const TMP_DIR_NAME = "task-attachments-tmp";
/** 旧平铺目录（历史上传落在插件数据根下，迁移期只读不写）。 */
export declare const LEGACY_DIR_NAME = "task-attachments";
/** 资产根路径（state.db 所在目录 = 插件数据根；statePath 启动时定格，运行期不变）。 */
export interface AssetPaths {
    dataRoot: string;
    tasksRoot: string;
    tmpDir: string;
    legacyDir: string;
}
export declare function assetPaths(statePath: string): AssetPaths;
/** 任务目录（id 必须是 UUID，防路径穿越——校验由调用方 `isUuid` 保证）。 */
export declare function taskDirOf(paths: AssetPaths, taskId: string): string;
/**
 * 落盘文件名清洗：**保留原始文件名（含中文与空格）**，只去掉路径分隔符、系统非法字符与控制字符。
 * 用户要自己看得懂、自己管理；改成 UID 就没法管了。
 */
export declare function safeFileName(name: string): string;
/** 时间戳文件名（本地墙上时间，毫秒）：字典序 = 时间序。 */
export declare function stampOf(date: Date): string;
/** 时间戳文件名 → ISO 串（按本地时间解析；解不出返回原名，绝不编造时间）。 */
export declare function stampToIso(stamp: string): string;
export interface VersionEntry {
    /** 文件名（= 时间戳 + .md）。 */
    file: string;
    /** ISO 时间（展示用）。 */
    ts: string;
    /** 备注（没填 = ''）。 */
    note: string;
}
/** 版本列表：新的在前。 */
export declare function listVersions(paths: AssetPaths, taskId: string): VersionEntry[];
/** 最新版本的内容（用于「变了才留版」的比较基准）。 */
export declare function latestVersionContent(paths: AssetPaths, taskId: string): string | null;
/**
 * 留一版提示词：**与最新版本不同才写**（去首尾空白比较 ⇒ 只按了个回车不算改动）。
 * 目录里没有版本（新建首次保存）⇒ 无条件写。
 * @returns `created=false` 表示内容没变、没留新版。
 */
export declare function saveVersion(paths: AssetPaths, taskId: string, content: string, note: string): {
    created: boolean;
    file: string;
};
/** 读某个版本的提示词全文（文件不存在 ⇒ null，绝不返回假内容）。 */
export declare function readVersion(paths: AssetPaths, taskId: string, file: string): string | null;
/** 删除一个版本（用户在版本面板自己删；系统**从不**自动删）。 */
export declare function deleteVersion(paths: AssetPaths, taskId: string, file: string): boolean;
export interface SnapshotEntry {
    file: string;
    ts: string;
}
/** 快照列表：新的在前。 */
export declare function listSnapshots(paths: AssetPaths, taskId: string): SnapshotEntry[];
/**
 * 留一份整份配置快照：**与最新快照不同才写**（连点保存不刷屏）。
 * @param definition 任务定义对象（含 id；快照就是它的原文）。
 */
export declare function saveSnapshot(paths: AssetPaths, taskId: string, definition: unknown): {
    created: boolean;
    file: string;
};
/** 读快照内容（解析失败 ⇒ null）。 */
export declare function readSnapshot(paths: AssetPaths, taskId: string, file: string): unknown | null;
/** 删除一个快照。 */
export declare function deleteSnapshot(paths: AssetPaths, taskId: string, file: string): boolean;
export interface AttachmentRef {
    id: string;
    name: string;
    kind: 'link' | 'upload';
    ref: string;
    /** link 型：来源工作区 title（同一路径在不同工作区指向不同文件）。 */
    workspace?: string;
}
export interface ReconcileResult {
    /** 落定后的附件清单（upload 型的 ref 已改写成「相对任务目录」的路径）。 */
    attachments: AttachmentRef[];
    /** 引用了但盘上找不到的（临时区被清 / 手删了）⇒ 上层提示「需重新上传」。 */
    missing: string[];
    /** 本次从清单里移除、已真删的文件名。 */
    removed: string[];
    /** 搬移 / 删除过程中出错的文件名。 */
    errors: string[];
}
/**
 * 附件落定第一步（保存时调用）：**只搬移、不真删**。
 * ① upload 型：临时区（或旧平铺目录）的文件 → 搬进 `tasks/<id>/attachments/<原始名>`，
 *    ref 改写为**相对任务目录**的路径；已在任务目录里的不动。
 * ② 上次有、这次没有的 upload 项只记进 `removed`（引用 diff），**真删由调用方在
 *    定义成功落库之后**调 `removeAttachmentFiles` 执行——顺序反了会「文件已删、
 *    落库失败」两头空（评审 P1#3）。
 * ③ link 型（工作区已有文件）只记引用，不复制、不搬。
 */
export declare function moveAttachmentsIn(paths: AssetPaths, taskId: string, next: AttachmentRef[], prev: AttachmentRef[]): ReconcileResult;
/**
 * 附件落定第二步：真删被移除的文件（**必须在定义成功落库之后**调用）。
 * ref 白名单：任务目录相对路径（attachments/ 前缀）或旧平铺目录的纯文件名；
 * 含 `..` / 绝对路径 / 反斜杠的一律跳过（评审 P0#1：真删循环必须有与 locateUploaded 对称的防御）。
 * @returns 删除失败的展示名（进 errors）。
 */
export declare function removeAttachmentFiles(paths: AssetPaths, taskId: string, removedRefs: string[]): string[];
/**
 * 便捷组合：搬移 + 真删一步到位（冒烟与不关心时序的调用方用；
 * webServer 保存链路**必须**分两步走，见 moveAttachmentsIn 注释）。
 */
export declare function reconcileAttachments(paths: AssetPaths, taskId: string, next: AttachmentRef[], prev: AttachmentRef[]): ReconcileResult;
/** 附件绝对路径（执行期存在性校验用）。 */
export declare function attachmentAbsPath(paths: AssetPaths, taskId: string, ref: string): string;
/** 清上传临时区：删掉 mtime 早于 N 天前的文件（跨天调用一次即可）。 */
export declare function purgeTmp(paths: AssetPaths, days: number): number;
/** 删除任务的整个目录（附件 + 版本 + 快照一起）。实例 / 事件保留在库里做审计。 */
export declare function deleteTaskAssets(paths: AssetPaths, taskId: string): boolean;
