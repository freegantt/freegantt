// view/ — Gantt shell, grid pane, timeline pane, viewport binding (plans/01 §8.2-8.3). Touches the DOM.
// Full grid/timeline/viewport split lands in S1. No view code reads/writes scroll except through the
// bound ScrollModel (I12).
export { GanttShell } from './gantt-shell.js';
export type { GanttShellOptions } from './gantt-shell.js';
export { TimeScaleModel, dayPreset, instant } from '../layout/index.js';
export type { TimeScaleIntent, ViewPreset } from '../layout/index.js';
