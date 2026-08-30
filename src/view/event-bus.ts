// view/ — the Gantt's own event map. `plans/02` §3 puts view events on the Gantt and data events on
// the Dataset — two emitters, not one object. `GanttShell` owns its `EventBus<GanttEventMap>` instance
// because the shell is what holds the splitter; `Gantt.on`/`Gantt.off` delegate to it, the same way
// `Gantt` delegates every other job to its shell.
//
// The bus mechanism itself moved to `data/event-bus.ts` in S2.1 (D-S2-5) — `view/` imports it from
// there rather than owning a second copy.

import type { TimeScaleFit } from '../layout/index.js';
import type { EntryId, Instant } from '../model/index.js';

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

/** S3.3, D-S3-19/D-S3-22: the grabbed entry's own proposed span, plus every entry the drag moves
 *  with it (grabbed first) — a multi-selection drag reports one event, not one per row. Extender
 *  extras are never in `entries` (S3.6): a handler sees only what the user actually grabbed. */
export interface EntryMove extends ProposedSpan {
  readonly entries: readonly ProposedSpan[];
}

/** Declared events fire (I11). `navigationChange` has no `before*` pair: Preset/Fit/Pan writes are
 *  reconfiguration, not a vetoable gesture (S1.9). Sync veto only on grid width and selection; the
 *  async-veto path `plans/02` §3 describes is `beforeEntryMove`/`beforeEntryResize` only (D-S3-17),
 *  landing with S3.5 — S3.3 ships `beforeEntryMove`'s sync half only (a handler may still return
 *  `false` to veto; nothing here awaits a returned Promise yet). */
export interface GanttEventMap {
  beforeGridWidthChange: GridWidthChange;
  gridWidthChange: GridWidthChange;
  navigationChange: NavigationChange;
  /** S3, D-S3-10. Sync veto: returning `false` leaves the selection untouched. */
  beforeSelectionChange: SelectionChange;
  selectionChange: SelectionChange;
  /** S3.3, D-S3-16. Sync veto: returning `false` commits nothing. */
  beforeEntryMove: EntryMove;
  entryMove: EntryMove;
}
