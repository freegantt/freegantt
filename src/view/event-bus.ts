// view/ — the Gantt's own event map. `plans/02` §3 puts view events on the Gantt and data events on
// the Dataset — two emitters, not one object. `GanttShell` owns its `EventBus<GanttEventMap>` instance
// because the shell is what holds the splitter; `Gantt.on`/`Gantt.off` delegate to it, the same way
// `Gantt` delegates every other job to its shell.
//
// The bus mechanism itself moved to `data/event-bus.ts` in S2.1 (D-S2-5) — `view/` imports it from
// there rather than owning a second copy.

import type { TimeScaleFit } from '../layout/index.js';
import type { EntryId, Instant } from '../model/index.js';
import type { CollapseChange } from './collapse-state.js';

export type { CollapseChange };

export { EventBus } from '../data/event-bus.js';

export interface GridWidthChange {
  readonly from: number;
  readonly to: number;
}

/** S3, D-S3-10/D-S3-22. Fires on the Gantt, never the Dataset — selection is Gantt state, so two
 *  Gantt instances bound to one Dataset can hold different selections. */
export interface SelectionChange {
  readonly from: readonly EntryId[];
  readonly to: readonly EntryId[];
}

/** One Viewport Batch completed. Chrome re-reads these, or reads the live Gantt getters. */
export interface NavigationChange {
  readonly presetId: string;
  readonly fit: TimeScaleFit;
  readonly canZoomIn: boolean;
  readonly canZoomOut: boolean;
}

/** S3.3, D-S3-22: what one entry's drag proposes. Public — a `beforeEntryMove` handler reads `start`/
 *  `end` to veto or clamp a specific placement (U5). */
export interface ProposedSpan {
  readonly entry: EntryId;
  readonly start: Instant;
  readonly end: Instant;
}

/** S3.3/S3.4, D-S3-19/D-S3-22: the grabbed entry's own proposed span, plus every entry the gesture
 *  moves or resizes with it (grabbed first) — a multi-selection gesture reports one event, not one
 *  per row. Extender extras are never in `entries` (S3.6): a handler sees only what the user actually
 *  grabbed. Shared by `EntryMove` and `EntryResize` — resize is not a subtype of move, both extend
 *  this instead (D-S3-22). */
export interface EntryGestureEvent extends ProposedSpan {
  readonly entries: readonly ProposedSpan[];
}

export type EntryMove = EntryGestureEvent;

/** S3.4, D-S3-22: which edge was dragged — a `beforeEntryResize` handler reads this alongside the
 *  proposed span to veto or clamp a specific edge placement. */
export interface EntryResize extends EntryGestureEvent {
  readonly edge: 'start' | 'end';
}

/** S3.5, D-S3-17: the only two event names whose handler may veto asynchronously, by returning a
 *  `Promise<void | false>` instead of resolving `false` synchronously — `EventBus<GanttEventMap,
 *  AsyncCancelableEvent>` is what actually grants that return shape at `on`/`off`/`emit`'s call sites
 *  (`data/event-bus.ts`'s `TAsyncKeys`). Every other event (grid width, selection) stays sync-only:
 *  `plans/02` §3's async-veto path is scoped to a data gesture's own before-event, not every veto. */
export type AsyncCancelableEvent = 'beforeEntryMove' | 'beforeEntryResize';

/** Declared events fire (I11). `navigationChange` has no `before*` pair: Preset/Fit/Pan writes are
 *  reconfiguration, not a vetoable gesture (S1.9). */
export interface GanttEventMap {
  beforeGridWidthChange: GridWidthChange;
  gridWidthChange: GridWidthChange;
  navigationChange: NavigationChange;
  /** S3, D-S3-10. Sync veto: returning `false` leaves the selection untouched. */
  beforeSelectionChange: SelectionChange;
  selectionChange: SelectionChange;
  /** S4.6, D-S4-22. Sync veto: returning `false` leaves the collapsed set untouched. */
  beforeCollapseChange: CollapseChange;
  collapseChange: CollapseChange;
  /** S3.3, D-S3-16. Sync or async veto (D-S3-17): returning `false` or a Promise that settles
   *  `false` commits nothing. A returned Promise holds the commit-draft ghost until it settles. */
  beforeEntryMove: EntryMove;
  entryMove: EntryMove;
  /** S3.4, D-S3-22. Sync or async veto (D-S3-17): returning `false` or a Promise that settles
   *  `false` commits nothing. A returned Promise holds the commit-draft ghost until it settles. */
  beforeEntryResize: EntryResize;
  entryResize: EntryResize;
}

/** The one handler shape `Gantt.on`/`Gantt.off` and `GanttShell.on`/`GanttShell.off` all share
 *  (D-S3-17) — declared once here rather than repeating the same conditional at each of those four
 *  call sites. `K extends AsyncCancelableEvent` is the only two names a handler may resolve async. */
export type GanttEventHandler<K extends keyof GanttEventMap> = (
  payload: GanttEventMap[K],
) => void | false | (K extends AsyncCancelableEvent ? Promise<void | false> : never);
