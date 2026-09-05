// view/ — Gantt shell, grid pane, timeline pane, viewport binding (plans/01 §8.2-8.3). Touches the DOM.
// Full grid/timeline/viewport split lands in S1. No view code reads/writes scroll except through the
// bound ScrollModel (I12).
export { GanttShell } from './gantt-shell.js';
export type { GanttShellOptions, Theme, GridWidth, Detachable } from './gantt-shell.js';
export type {
  GanttEventMap,
  GanttEventHandler,
  GanttEvents,
  AsyncCancelableEvent,
  GridWidthChange,
  GridColumnsChange,
  NavigationChange,
  SelectionChange,
  CollapseChange,
  ProposedSpan,
  EntryGestureEvent,
  EntryMove,
  EntryResize,
  EntryFieldEdit,
} from './event-bus.js';
export type { CapabilityRule, Interactions, KindDefaults } from './capability.js';
export type { Overlay, OverlayHandle } from './overlay.js';
export type { GanttDom, DomTarget } from './gantt-dom.js';
export type { DomEventHandler, DomEventOptions } from './plugin-ports.js';
export type { ViewportGestures, ViewportGestureFlags } from './viewport-gestures.js';
export type {
  DraftOptions,
  EntryGesture,
  EntryGestureContext,
  EntryGestureSession,
  EntryHit,
} from './entry-gesture-context.js';
export type {
  ColumnGestureContext,
  ColumnGestureCommit,
  ColumnReorderPreview,
} from './column-gesture-context.js';
