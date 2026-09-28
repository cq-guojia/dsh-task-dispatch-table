import type { HostLogger } from './host.js';
import type { TaskStore } from './store.js';
/**
 * 工具名 = **包名去掉 `dsh-` 前缀 + `_receipt`** ⇒ `task_dispatch_table_receipt`。
 *
 * 为什么带命名空间而不是短名：宿主对重名的处理是「**同层抛错 / 跨层 scoped 遮蔽 global**」
 * （`@deepseek-ai/dsh-tools`：`NamedEntries` 冲突直接 throw；类注释 `Scoped registrations
 * shadow globals`）——两种都不希望发生。带插件名前缀把撞名概率压到可忽略，也让模型一眼看出归属。
 * 宿主对工具名没有格式/长度校验，所以这纯粹是防撞考虑。
 */
export declare const RECEIPT_TOOL_NAME = "task_dispatch_table_receipt";
export interface ReceiptToolDeps {
    store: TaskStore;
    /** 会话显示名（决策 42 快照 title）：只用于工具描述文案，模型不可据此伪造身份。 */
    taskName: string;
    /** 闭包注入的实例身份（UUID 主键），模型不可见。 */
    instanceId: string;
    /** 闭包注入的本次派发会话，模型不可见 ⇒ 回执不可冒充。 */
    sessionId: string;
    /** 回执 status 合法值（决策 41：来自派发快照，不读活任务表）。 */
    validStatuses: readonly string[];
    logger: HostLogger;
    /** 闭包注入的 turnBoundary 投影读取面：取 `deliverables/presented` 事件所需的 turn。 */
    sessionProjections?: unknown;
}
/**
 * 把回执工具注册进该 agent 的作用域（**只在 setup 里调**——发布前生效，见文件头）。
 * @returns true = 已注册；false = 宿主 agent 作用域未暴露 tools 服务（跳过并告警：
 *   该会话没有回执通道，对账会按「缺回执」收敛，reason 会指向这里）。
 */
export declare function registerReceiptTool(agentCtx: unknown, deps: ReceiptToolDeps): boolean;
/**
 * 回执调用说明（派发消息与追问消息共用）。写给模型看：**传什么、失败怎么办、什么时候必须停**。
 *
 * ⚠️ 刻意不提供任何替代通道（不跑命令、不写库、不碰沙箱）——真机上 agent 曾自行 `chmod`、
 * 拷库、改用 sqlite3/node 绕道，全是无效动作（沙箱层面就不可能成功），白烧 token。
 */
export declare function receiptInstruction(validStatuses: readonly string[]): string;
