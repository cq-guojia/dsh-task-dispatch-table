/** 一条已解析的上游依赖：Loop A 判定通过时固化，Loop B 只读不重判。 */
export interface ResolvedDependency {
    /** 上游任务 id（depends_on.task 原值）。 */
    task: string;
    semantics: 'same_period' | 'latest_success';
    /** 判定通过那一刻命中的上游实例 id。 */
    instanceId: string;
    /** 上游实例的计划时刻（ISO）。 */
    scheduledAt: string;
    /** 上游实例的会话 id（无则 null）。 */
    sessionId: string | null;
    /** 上游实例快照的工作区 path（产出相对路径的绝对化基准）；上游旧行无快照为 null。 */
    workspacePath: string | null;
    /** 上游回执声明并校验过的产出（相对上游工作区；未声明为空数组）。目录以尾斜杠结尾。 */
    outputs: string[];
}
/** 解析 resolvedDeps：字段缺失（旧行）⇒ undefined；任一条形状不对 ⇒ 整组丢弃（不让坏数据进 UI）。 */
export declare function parseResolvedDeps(raw: unknown): ResolvedDependency[] | undefined;
/**
 * 实例快照 JSON → 已解析的上游依赖清单（**客户端便捷入口**）。
 * 与服务端 `parseInstanceSnapshot` 同一套校验，但**不强求整份快照合法**——
 * 客户端只想看「接收了什么」，快照里别的字段缺了不该让这一块消失。
 * 空 / 坏 JSON / 旧行（无 resolvedDeps）⇒ `[]`（调用方按「无上游」渲染，不显示该区）。
 */
export declare function resolvedDepsOf(raw: string | null): ResolvedDependency[];
