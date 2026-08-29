// view/ — the Gantt's own event map. `plans/02` §3 puts view events on the Gantt and data events on
// the Dataset — two emitters, not one object. `GanttShell` owns its `EventBus<GanttEventMap>` instance
// because the shell is what holds the splitter; `Gantt.on`/`Gantt.off` delegate to it, the same way
// `Gantt` delegates every other job to its shell.
//
// The bus mechanism itself moved to `data/event-bus.ts` in S2.1 (D-S2-5) — `view/` imports it from
// there rather than owning a second copy.

import type { TimeScaleFit } from '../layout/index.js';

export { EventBus } from '../data/event-bus.js';

export interface GridWidthChange {
  readonly from: number;
  readonly to: number;
}

/** One Viewport Batch completed. Chrome re-reads these, or reads the live Gantt getters. */
export interface NavigationChange {
  readonly presetId: string;
  readonly fit: TimeScaleFit;
  readonly canZoomIn: boolean;
  readonly canZoomOut: boolean;
}

/** Declared events fire (I11). `navigationChange` has no `before*` pair: Preset/Fit/Pan writes are
 *  reconfiguration, not a vetoable gesture (S1.9). Sync veto only on grid width; the async-veto path
 *  `plans/02` §3 describes belongs to S3's gesture controllers. */
export interface GanttEventMap {
  beforeGridWidthChange: GridWidthChange;
  gridWidthChange: GridWidthChange;
  navigationChange: NavigationChange;
}
