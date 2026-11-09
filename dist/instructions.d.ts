/**
 * 派发给执行 agent 的指令文本 —— **唯一真源**。
 *
 * 此前同一套规则分散在四个指令面：工具 `description`（常驻上下文）、`receiptInstruction`
 * （派发消息最末「唯一权威段」，缺回执追问复用）、`buildMessage` 的【执行约束】、
 * `/goal` objective。各写一份必然漂移，真机上已发生过两次：
 *   · 产出粒度在 description 里有三条细则，权威段却只剩一句压缩句 ⇒ 模型按最弱的一处
 *     遵守（`receipt.ts` 历史注释原话），`processOutputs` 退化成逐文件列；
 *   · 无人值守约束只进派发段，追问轮（伪装成 `role:'user'`）与 goal 续跑轮读不到。
 *
 * 本模块只导出常量与纯函数，四个面只做引用；冒烟断言钉「引用了同一常量」而非钉原话，
 * 因此以后调整文案不会再打掉断言（`ledger/worklog/202610/10-0000-…270e.md` 记过这个教训）。
 */
/**
 * 无人值守约束。派发消息、缺回执追问、`/goal` objective 三处必须逐字引用同一份。
 */
export declare const UNATTENDED_RULE: string;
/**
 * 缺回执追问走 `userNotice`，生成的是 `role:'user'` 消息 —— 模型会误以为有人回复了。
 * 追问必须先声明身份，再复述 {@link UNATTENDED_RULE}。
 */
export declare const NUDGE_NOTICE: string;
/**
 * 产出两桶的申报口径与粒度规则。
 *
 * 工具 `description` 与 `receiptInstruction` 的「唯一权威段」必须引用**同一份返回值**，
 * 避免再出现「一处全集、一处摘要」的强弱差。
 *
 * 规则按①→②→③写成可终止的判定顺序：把「只有…才逐个列文件」从段末唯一许可
 * 降级成第③步兜底分支，并给正反例；`web-app/` 与按日期归档两个误导锚点已删除。
 *
 * @param maxItems 每桶上限（`receipt.ts` 的 `MAX_OUTPUT_ITEMS`），不在本模块另写数字。
 * @param toolName 回执工具名（`receipt.ts` 的 `RECEIPT_TOOL_NAME`），用于正例的调用形状。
 */
export declare function outputRules(maxItems: number, toolName: string): string;
