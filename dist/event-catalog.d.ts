/** 事件类型目录（前后端唯一真源；新增类型只在这里加）。 */
export declare const EventType: {
    /** 任务定义增删改（含开关 / 整批替换 / 版本删除 / 附件文件变更；这些写路径都汇聚到 onDefinitionsChanged）。 */
    readonly TASKS_CHANGED: "tasks.changed";
    /** 实例进入 dispatched / running（自动调度或「立即执行」）。 */
    readonly TASK_RUN_STARTED: "task.run.started";
    /** 实例成功终态。 */
    readonly TASK_RUN_SUCCEEDED: "task.run.succeeded";
    /** 实例失败终态（含判死 / 租约回收 / 回执缺失收敛）。 */
    readonly TASK_RUN_FAILED: "task.run.failed";
    /** 跳过 / 错过刻度 / 过期（「未执行」的原因类）。 */
    readonly TASK_RUN_SKIPPED: "task.run.skipped";
    /** 其余实例行变化（重试退回 / unknown 复活 / 转 running / redispatch / 删行 / 阻塞原因变化）。 */
    readonly TASK_RUN_CHANGED: "task.run.changed";
    /** 插件配置变更。 */
    readonly CONFIG_CHANGED: "config.changed";
    /** 无参：强制前端重读一次当前值（后端升级 / 索引重建等）。 */
    readonly FORCE_REFRESH: "force.refresh";
};
export type EventTypeValue = typeof EventType[keyof typeof EventType];
/** 「实例运行态」这一族事件（订阅方通常一并关心）。 */
export declare const RUN_EVENT_TYPES: readonly EventTypeValue[];
/** 事件信封：type 固定；payload 任意（可为空）。 */
export interface PushEvent {
    type: EventTypeValue;
    payload?: Record<string, unknown>;
}
/**
 * 实例状态 → 事件类型（`RuntimeIndex.markTerminal` / `markDispatched` 的映射）。
 * 只按「类型」订阅的前端拿它区分成功 / 失败 / 跳过 / 其它；状态细节交给重读。
 */
export declare function runEventTypeOf(status: string): EventTypeValue;
