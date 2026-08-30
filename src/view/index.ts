// view/ — Gantt shell, grid pane, timeline pane, viewport binding (plans/01 §8.2-8.3). Touches the DOM.
// Full grid/timeline/viewport split lands in S1. No view code reads/writes scroll except through the
// bound ScrollModel (I12).
export { GanttShell } from './gantt-shell.js';
export type { GanttShellOptions, Theme } from './gantt-shell.js';
export type {
  GanttEventMap,
  GridWidthChange,
  NavigationChange,
  SelectionChange,
  ProposedSpan,
  EntryGestureEvent,
  EntryMove,
  EntryResize,
} from './event-bus.js';
export type { CapabilityRule, Interactions } from './capability.js';
