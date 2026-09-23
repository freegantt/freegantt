// view/ — Gantt shell, grid pane, timeline pane, viewport binding (plans/01 §8.2-8.3). Touches the DOM.
// Full grid/timeline/viewport split lands in S1. No view code reads/writes scroll except through the
// bound ScrollAxis instances (I12).
export { GanttShell } from './gantt-shell.js';
export type {
  GanttShellOptions,
  GanttShellWiring,
  Theme,
  Detachable,
  PointerActivation,
} from './gantt-shell.js';
export type { GridWidth } from './grid-pane-width.js';
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
  ThemeChange,
  ProposedDates,
  ProposedSpan,
  EntryGestureEvent,
  EntryMove,
  EntryResize,
  EntryFieldEdit,
  EntryActivate,
} from './event-bus.js';
export type { ResolvedTheme } from './theme.js';
export type {
  CapabilityRule,
  GestureCapability,
  Capabilities,
  ResolvedCapabilities,
  WriteRefusalReason,
  WriteRule,
  WriteVerdict,
} from './capability.js';
export type { MountLayer } from './mount-layer.js';
export type { GanttDom, DomTarget } from './gantt-dom.js';
// #177: `GanttDom.paneOf` answers with it, and `pane-layout.ts` is where the panes themselves live.
export type { PaneName } from './pane-layout.js';
export type { DomEventHandler, DomEventOptions, PluginContextParts } from './plugin-ports.js';
export type { ViewportGestures, ViewportGestureFlags } from './viewport-gestures.js';
export type { ConvenienceChords } from './convenience-chords.js';
export type {
  DraftOptions,
  EntryGesture,
  EntryGestureContext,
  EntryGestureSession,
  EntryHit,
  SelectionForGestures,
  ActivationForGestures,
} from './entry-gesture-context.js';
export type {
  ColumnGestureContext,
  ColumnGestureCommit,
  ColumnReorderPreview,
} from './column-gesture-context.js';
