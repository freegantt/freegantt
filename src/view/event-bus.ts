// view/ — the Gantt's own event map. `plans/02` §3 puts view events on the Gantt and data events on
// the Dataset — two emitters, not one object. `GanttShell` owns its `EventBus<GanttEventMap>` instance
// because the shell is what holds the splitter; `Gantt.on`/`Gantt.off` delegate to it, the same way
// `Gantt` delegates every other job to its shell.
//
// The bus mechanism itself moved to `data/event-bus.ts` in S2.1 (D-S2-5) — `view/` imports it from
// there rather than owning a second copy.

import type { TimeScaleFit } from '../layout/index.js';
import type {
  Entry,
  EntryId,
  ErrorReport,
  FieldKey,
  GridColumn,
  Instant,
  Refusable,
  SegmentId,
} from '../model/index.js';
import type { CollapseChange } from './collapse-state.js';
import type { ResolvedTheme } from './theme.js';

export type { CollapseChange };

export { EventBus, RefusalNote } from '../data/event-bus.js';

export interface GridWidthChange {
  readonly from: number;
  readonly to: number;
}

/** S5.7, D-S5-18: what a resize drag, a reorder drop, and a plain `gantt.gridColumns = […]`
 *  assignment all fire, through one commit sequence in `GanttShell`. Payload columns are **resolved**
 *  — Field defaults already merged (D-S4-12) — but shaped as `GridColumn` (not the layout-only
 *  `ResolvedColumn`): a consumer keeps `to` in memory and passes it straight back as `gridColumns`
 *  within the same session, so the payload must be the same public shape that property already takes.
 *  `grid-columns.ts`'s `toGridColumn` builds one from a `ResolvedColumn`, dropping `format` (a
 *  render-time closure with no public type of its own).
 *
 *  Both lists hold the columns the **consumer** authored, and only those (D-S5-33, #181). A column a
 *  plugin registered renders, but it is that plugin's declaration, so it never appears in either
 *  list. `from` is therefore always a list the consumer recognises. Resizing or reordering a plugin
 *  column still fires this pair, with `from` and `to` equal: the grid repainted, and the consumer's
 *  own configuration did not change. A handler that saves `to` saves exactly what it authored. */
export interface GridColumnsChange {
  readonly from: readonly GridColumn[];
  readonly to: readonly GridColumn[];
}

/** S3, D-S3-10/D-S3-22; ADR 0010, #212. Fires on the Gantt, never the Dataset — selection is Gantt
 *  state, so two Gantt instances bound to one Dataset can hold different selections. It carries
 *  Segment ids, because the Selection holds Segments. */
export interface SelectionChange {
  readonly from: readonly SegmentId[];
  readonly to: readonly SegmentId[];
}

/** S5.8, D-S5-19: what `beforeEntryEdit`/`entryEdit` carry — named `EntryFieldEdit`, not `EntryEdit`
 *  (`EntryEdit` is already the write shape `update()` takes, `plans/02` §1 "one write shape", one
 *  name one concept). `beforeEntryEdit` fires **before the editor opens**, not before the write, so
 *  no candidate value exists yet at that point — `from` and `to` are both the entry's current stored
 *  value for that field. `entryEdit` fires after the commit, with `to` the value actually written. */
export interface EntryFieldEdit {
  readonly entry: Entry;
  readonly field: FieldKey;
  readonly from: unknown;
  readonly to: unknown;
}

/** One Viewport Batch completed. Chrome re-reads these, or reads the live Gantt getters. */
export interface NavigationChange {
  readonly presetId: string;
  readonly fit: TimeScaleFit;
  readonly canZoomIn: boolean;
  readonly canZoomOut: boolean;
}

/** #330. `Gantt.resolvedTheme` moved — a `theme` assignment that changes the pin, or the OS
 *  flipping under `'auto'` with no ancestor pin in the way. */
export interface ThemeChange {
  readonly from: ResolvedTheme;
  readonly to: ResolvedTheme;
}

/** ADR 0013, Q9: where one entry the gesture moves lands. Both dates are optional, because a
 *  descendant of a dragged parent bar may hold only one of them: a child with a `start` and no `end`
 *  shows in the grid, draws no bar, and still travels with its parent. The date it holds moves, and
 *  the date it lacks stays absent.
 *
 *  `ProposedSpan` below is the stricter reading, and the bar the user grabbed always gets that one. */
export interface ProposedDates {
  readonly entry: EntryId;
  readonly start?: Instant;
  readonly end?: Instant;
}

/** S3.3, D-S3-22: what one entry's drag proposes for an entry that spans. Public — a
 *  `beforeEntryMove` handler reads `start`/`end` to veto or clamp a specific placement (U5).
 *
 *  Both dates are required here. A bar is what the user grabs, and an entry draws a bar only when it
 *  spans (ADR 0012), so the grabbed entry holds both (Q9's ruling). */
export interface ProposedSpan extends ProposedDates {
  readonly start: Instant;
  readonly end: Instant;
}

/** S3.3/S3.4, D-S3-19/D-S3-22: the grabbed entry's own proposed span, plus every entry the gesture
 *  moves or resizes with it — a multi-selection gesture reports one event, not one per row. Extender
 *  extras are never in `entries` (S3.6): a handler sees only what the user actually grabbed. Shared
 *  by `EntryMove` and `EntryResize` — resize is not a subtype of move, both extend this instead
 *  (D-S3-22).
 *
 *  `entries` is what the gesture **writes**, grabbed first. A parent bar is the one gesture where the
 *  grabbed entry is not in that list (ADR 0013): a parent's dates roll up from its children, so
 *  dragging it translates the dated descendants below it, and `entries` holds those descendants. The
 *  parent's own envelope follows from the Rollup, and this payload's own `start`/`end` say where it
 *  lands. */
export interface EntryGestureEvent extends ProposedSpan {
  readonly entries: readonly ProposedDates[];
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
export type AsyncCancelableEvent = 'beforeEntryMove' | 'beforeEntryResize' | 'beforeEntryEdit';

/** Declared events fire (I11). `navigationChange` has no `before*` pair: Preset/Fit/Pan writes are
 *  reconfiguration, not a vetoable gesture (S1.9). */
export interface GanttEventMap {
  beforeGridWidthChange: GridWidthChange;
  gridWidthChange: GridWidthChange;
  navigationChange: NavigationChange;
  /** #330. No `before*` pair, the same reason `navigationChange` has none: the OS half of this is
   *  not a vetoable gesture, and the `theme` half already has its own live setter. */
  themeChange: ThemeChange;
  /** S3, D-S3-10. Sync veto: returning `false` leaves the selection untouched. */
  beforeSelectionChange: SelectionChange;
  selectionChange: SelectionChange;
  /** S4.6, D-S4-22. Sync veto: returning `false` leaves the collapsed set untouched. */
  beforeCollapseChange: CollapseChange;
  collapseChange: CollapseChange;
  /** S3.3, D-S3-16. Sync or async veto (D-S3-17): returning `false` or a Promise that settles
   *  `false` commits nothing. A returned Promise holds the commit-draft ghost until it settles.
   *  `Refusable` on the `before*` half only (#210): `return move.refuse('…')` says why, and the
   *  words reach the `entry-move-cancelled` report core raises for the veto. */
  beforeEntryMove: EntryMove & Refusable;
  entryMove: EntryMove;
  /** S3.4, D-S3-22. Sync or async veto (D-S3-17): returning `false` or a Promise that settles
   *  `false` commits nothing. A returned Promise holds the commit-draft ghost until it settles.
   *  `Refusable` on the `before*` half only (#210), the same as `beforeEntryMove`. */
  beforeEntryResize: EntryResize & Refusable;
  entryResize: EntryResize;
  /** S5.7, D-S5-18. Sync veto: returning `false` leaves `gridColumns` (and whatever was live-painted
   *  during the drag that proposed this change) untouched. */
  beforeGridColumnsChange: GridColumnsChange;
  gridColumnsChange: GridColumnsChange;
  /** S5.8, D-S5-19. Fires before the built-in editor opens, not before the write. Sync or async
   *  veto (D-S3-17's same shape): returning `false`, or a Promise that settles `false`, suppresses
   *  the built-in editor entirely — a consumer opens its own dialog instead (U8). */
  beforeEntryEdit: EntryFieldEdit;
  /** S5.8, D-S5-19. Fires after the commit, `to` the value actually written. */
  entryEdit: EntryFieldEdit;
  /** S5.12, D-S5-40: every refusal and every recovered fault a Gantt observes — a vetoed drag, a
   *  renderer that threw, a plugin disposer that threw. The same name and the same payload the
   *  Dataset raises (`DatasetEventMap.error`), because a consumer knows one shape either way; the
   *  Gantt never forwards the Dataset's own reports, so nothing arrives twice (D-S5-42). Sync only,
   *  and no `before*` pair: a report states what already happened. */
  error: ErrorReport;
}

/** The one handler shape `Gantt.on`/`Gantt.off` and `GanttShell.on`/`GanttShell.off` all share
 *  (D-S3-17) — declared once here rather than repeating the same conditional at each of those four
 *  call sites. `K extends AsyncCancelableEvent` is the only two names a handler may resolve async. */
export type GanttEventHandler<K extends keyof GanttEventMap> = (
  payload: GanttEventMap[K],
) => void | false | (K extends AsyncCancelableEvent ? Promise<void | false> : never);

/** S5.1, D-S5-1: `PluginContext.events` is this pair, so a plugin author's autocomplete reads the
 *  same as a consumer's own `gantt.on(...)` (one name, one concept — CLAUDE.md) rather than a second,
 *  differently-shaped events surface. `GanttShell`'s own `on`/`off` below already satisfy this shape;
 *  a plugin gets a plain object built from them, not the shell itself (no back-door to its other
 *  public methods). */
export interface GanttEvents {
  on<K extends keyof GanttEventMap>(name: K, handler: GanttEventHandler<K>): void;
  off<K extends keyof GanttEventMap>(name: K, handler: GanttEventHandler<K>): void;
}
