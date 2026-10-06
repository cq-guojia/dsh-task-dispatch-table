// running.ts — 「运行中」视觉的**单一真源**（用户 2026-10-06：颜色 + 脉动只在这里定，别再散落各文件东改西改）。
//
// 任务配置（RunningRail / NextPill）、执行记录（状态条）、日程（复用执行记录的块）共用同一套。
// 改颜色 ⇒ 只动 `RUNNING_TONE`；改脉动形状/时长 ⇒ 只动下面的 keyframe / `--tdt-dur-run` token。
import { applyStyle } from './style'

/** 运行中配色：蓝（前后两端统一；成功绿 / 失败红留给终态）。 */
export const RUNNING_TONE = 'var(--tdt-business)'

/** 脉动动画类：挂到任意元素上即获得「运行中」明暗脉冲（与执行记录页同款 keyframe，单一定义）。 */
export const RUN_PULSE_CLASS = 'dsh-tdt-run-pulse'

const RUNNING_CSS = `
@keyframes dsh-tdt-run-pulse { 0%,100% { opacity: 1 } 50% { opacity: .35 } }
.${RUN_PULSE_CLASS} { animation: dsh-tdt-run-pulse var(--tdt-dur-run) var(--tdt-ease) infinite; }
@media (prefers-reduced-motion: reduce) { .${RUN_PULSE_CLASS} { animation: none; } }
`

let ensured = false
/** 幂等注入「运行中」脉动样式（keyframe + 动画类，全局生效一次即可）。 */
export const ensureRunningStyle = (): void => {
  if (ensured) return
  ensured = true
  applyStyle('domain:running', RUNNING_CSS)
}
