// view/ — the Gantt's own event map. `plans/02` §3 puts view events on the Gantt and data events on
// the Dataset — two emitters, not one object. `GanttShell` owns its `EventBus<GanttEventMap>` instance
// because the shell is what holds the splitter; `Gantt.on`/`Gantt.off` delegate to it, the same way
// `Gantt` delegates every other job to its shell.
//
// The bus mechanism itself moved to `data/event-bus.ts` in S2.1 — `view/` imports it from
// there rather than owning a second copy.

import type { TimeScaleFit } from '../layout/index.js';
import type {
  Disposer,
  Entry,
  EntryId,
  ErrorReport,
  FieldKey,
  GridColumn,
  Instant,
  Refusable,
  TargetKind,
  TimeSpan,
  TreePlace,
} from '../model/index.js';
import type { CollapseChange } from './collapse-state.js';
import type { ResolvedTheme } from './theme.js';

export type { CollapseChange };

export { EventBus, RefusalNote } from '../data/event-bus.js';

export interface GridWidthChange {
  readonly from: number;
  readonly to: number;
}

/** S5.7: what a resize drag, a reorder drop, and a plain `gantt.gridColumns = […]`
 *  assignment all fire, through one commit sequence in `GanttShell`. Payload columns are **resolved**
 *  — Field defaults already merged — but shaped as `GridColumn` (not the layout-only
 *  `ResolvedColumn`): a consumer keeps `to` in memory and passes it straight back as `gridColumns`
 *  within the same session, so the payload must be the same public shape that property already takes.
 *  `grid-columns.ts`'s `toGridColumn` builds one from a `ResolvedColumn`, dropping `format` (a
 *  render-time closure with no public type of its own).
 *
 *  Both lists hold the columns the **consumer** authored, and only those (#181). A column a
 *  plugin registered renders, but it is that plugin's declaration, so it never appears in either
 *  list. `from` is therefore always a list the consumer recognises. Resizing or reordering a plugin
 *  column still fires this pair, with `from` and `to` equal: the grid repainted, and the consumer's
 *  own configuration did not change. A handler that saves `to` saves exactly what it authored. */
export interface GridColumnsChange {
  readonly from: readonly GridColumn[];
  readonly to: readonly GridColumn[];
}

/** S3; ADR 0010, ADR 0025, #212. Fires on the Gantt, never the Dataset — selection
 *  is Gantt state, so two Gantt instances bound to one Dataset can hold different selections. It
 *  carries Entry ids, because the Selection holds Entries. */
export interface SelectionChange {
  readonly from: readonly EntryId[];
  readonly to: readonly EntryId[];
}

/** S5.8: what `beforeEntryEdit`/`entryEdit` carry — named `EntryFieldEdit`, not `EntryEdit`
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

/** #434: what a click, an `Enter`, or a double-click (opt-in, `pointerActivation: 'dblclick'`)
 *  fires. `target` names which node it landed on, the same word `DomTarget.kind` and
 *  `CommandTarget.kind` use, so a handler that reads one already knows the other. A plain click
 *  never lands on `'gridCell'` — a click on the grid pane never runs the bar/row gesture stream at
 *  all. `'dblclick'` and `'key'` both can: each mirrors the other's editable-cell precedence — a
 *  writable cell's double-click stays `inlineEditing()`'s own editor, and `'gridCell'` reaches here
 *  from `cause: 'dblclick'` only for an unwritable cell, the same way it reaches here from
 *  `cause: 'key'` only once `inlineEditing()`'s own `Enter` binding declines one. */
export interface EntryActivate {
  readonly entry: Entry;
  readonly cause: 'click' | 'key' | 'dblclick';
  readonly target: TargetKind;
}

/** One Viewport Batch completed. Chrome re-reads these, or reads the live Gantt getters.
 *
 *  `visibleSpan` is `Gantt.visibleSpan` at the moment of this fire (issue #461) — the window, not
 *  the content extent (`range`). It carries the getter's own name because it is that number: bare
 *  `span` already means the overscan-widened `DecorationContext.span` on this same surface. Pure
 *  scrolling moves it while `presetId`/`fit`/`canZoom*` stand still, so a fire this payload used to
 *  report as identical to the last one now carries the new window. No library-side throttling: a
 *  consumer doing expensive work on this event throttles or snaps it itself. */
export interface NavigationChange {
  readonly presetId: string;
  readonly fit: TimeScaleFit;
  readonly canZoomIn: boolean;
  readonly canZoomOut: boolean;
  readonly visibleSpan: TimeSpan;
}

/** #330. `Gantt.resolvedTheme` moved — a `theme` assignment that changes the pin, or the OS
 *  flipping under `'auto'` with no ancestor pin in the way. */
export interface ThemeChange {
  readonly from: ResolvedTheme;
  readonly to: ResolvedTheme;
}

/** ADR 0013: where one entry the gesture moves lands. Both dates are optional, because a
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

/** S3.3: what one entry's drag proposes for an entry that spans. Public — a
 *  `beforeEntryMove` handler reads `start`/`end` to veto or clamp a specific placement (U5).
 *
 *  Both dates are required here. A bar is what the user grabs, and an entry draws a bar only when it
 *  spans (ADR 0012), so the grabbed entry holds both. */
export interface ProposedSpan extends ProposedDates {
  readonly start: Instant;
  readonly end: Instant;
}

/** S3.3/S3.4: the grabbed entry's own proposed span, plus every entry the gesture
 *  moves or resizes with it — a multi-selection gesture reports one event, not one per row. Extender
 *  extras are never in `entries` (S3.6): a handler sees only what the user actually grabbed. Shared
 *  by `EntryMove` and `EntryResize` — resize is not a subtype of move, both extend this instead.
 *
 *  `entries` is what the gesture **writes**, grabbed first. A parent that derives its dates from a
 *  Rollup is the one gesture where the grabbed entry is not in that list (ADR 0013): dragging it
 *  translates the dated descendants below it, and `entries` holds those descendants. A parent that
 *  owns its dates (`rollUp: 'none'`) is in that list, grabbed first, the same as any other bar. */
export interface EntryGestureEvent extends ProposedSpan {
  readonly entries: readonly ProposedDates[];
}

/** #425: where a vertical drag lands, or the proof it never asked the tree at all. A drop that
 *  changes the tree states both `place` (where the Entry lands) and `currentPlace` (where it sat
 *  before the drop); a time-only drag states neither — `move.place === undefined` is how a handler
 *  tells the two apart, with no third state to guard against under `exactOptionalPropertyTypes`. */
export type TreePlaceChange =
  | { readonly place: TreePlace; readonly currentPlace: TreePlace }
  | { readonly place?: never; readonly currentPlace?: never };

/** #425: one Entry's own share of a move's proposed dates, tagged with whether this Entry's tree
 *  place changed and whether its dates did. A pointer drag locks to one axis at arm time and holds
 *  it for the whole gesture (#425 axis lock), so a real drag only ever sets one of the two: `place`
 *  alone (row axis) or `shiftsTime` alone (time axis), never both together. */
export type EntryMoveDetail = ProposedDates &
  TreePlaceChange & {
    /** True when this Entry's proposed dates differ from what is stored now — `false` for a
     *  vertical-only drag that only changes the tree. Answers "did time change", the question
     *  `place`'s absence cannot: a vertical-only drag still reports `start`/`end` equal to today's. */
    readonly shiftsTime: boolean;
  };

/** #425/#602: the grabbed Entry's own proposed dates, plus every entry the gesture moves or
 *  reorders with it. A move that shifts time always gets `ProposedSpan`: an Entry with a bar to
 *  grab already spans (ADR 0012). A tree-only move writes no dates — an undated Entry can still
 *  reorder — so it gets `ProposedDates` instead, with the grabbed Entry's own dates present only
 *  when it already had them. A handler narrows on `shiftsTime` before it reads `start`/`end`. */
export type EntryMove = TreePlaceChange & {
  readonly entries: readonly EntryMoveDetail[];
} & ((ProposedSpan & { readonly shiftsTime: true }) | (ProposedDates & { readonly shiftsTime: false }));

/** S3.4: which edge was dragged — a `beforeEntryResize` handler reads this alongside the
 *  proposed span to veto or clamp a specific edge placement. */
export interface EntryResize extends EntryGestureEvent {
  readonly edge: 'start' | 'end';
}

/** S3.5: the only two event names whose handler may veto asynchronously, by returning a
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
   *  not a vetoable gesture, and the `theme` half already has its own live setter.
   *  #375: fires for any of three causes the library can see moving `resolvedTheme` — a `theme`
   *  write, the OS, or an ancestor's own `data-fg-theme` pin (#271). The `theme`-write and OS causes
   *  fire synchronously; the ancestor-pin cause fires on a later task (a `MutationObserver`'s own).
   *  `resolvedTheme` itself already answers correctly, synchronously, in every case — only this
   *  event's timing differs by cause. Re-parenting the container under a differently-pinned wrapper
   *  moves `resolvedTheme`'s answer too, but fires no event: no `data-fg-theme` attribute changed. */
  themeChange: ThemeChange;
  /** S3. Sync veto: returning `false` leaves the selection untouched. */
  beforeSelectionChange: SelectionChange;
  selectionChange: SelectionChange;
  /** S4.6. Sync veto: returning `false` leaves the collapsed set untouched. */
  beforeCollapseChange: CollapseChange;
  collapseChange: CollapseChange;
  /** S3.3. Sync or async veto: returning `false` or a Promise that settles
   *  `false` commits nothing. A returned Promise holds the commit-draft ghost until it settles.
   *  `Refusable` on the `before*` half only (#210): `return move.refuse('…')` says why, and the
   *  words reach the `entry-move-cancelled` report core raises for the veto. */
  beforeEntryMove: EntryMove & Refusable;
  entryMove: EntryMove;
  /** S3.4. Sync or async veto: returning `false` or a Promise that settles
   *  `false` commits nothing. A returned Promise holds the commit-draft ghost until it settles.
   *  `Refusable` on the `before*` half only (#210), the same as `beforeEntryMove`. */
  beforeEntryResize: EntryResize & Refusable;
  entryResize: EntryResize;
  /** S5.7. Sync veto: returning `false` leaves `gridColumns` (and whatever was live-painted
   *  during the drag that proposed this change) untouched. */
  beforeGridColumnsChange: GridColumnsChange;
  gridColumnsChange: GridColumnsChange;
  /** S5.8. Fires before the built-in editor opens, not before the write. Sync or async
   *  veto: returning `false`, or a Promise that settles `false`, suppresses
   *  the built-in editor entirely — a consumer opens its own dialog instead (U8). */
  beforeEntryEdit: EntryFieldEdit;
  /** S5.8. Fires after the commit, `to` the value actually written. */
  entryEdit: EntryFieldEdit;
  /** #434: a click, `Enter`, or an opt-in double-click "opening" an Entry — independent of
   *  Selection and of `capabilities.select` (I14). Mutates nothing, so there is no `before*` pair,
   *  the same reason `navigationChange`/`themeChange` have none. */
  entryActivate: EntryActivate;
  /** S5.12: every refusal and every recovered fault a Gantt observes — a vetoed drag, a
   *  renderer that threw, a plugin disposer that threw. The same name and the same payload the
   *  Dataset raises (`DatasetEventMap.error`), because a consumer knows one shape either way; the
   *  Gantt never forwards the Dataset's own reports, so nothing arrives twice. Sync only,
   *  and no `before*` pair: a report states what already happened. */
  error: ErrorReport;
}

/** The one handler shape `Gantt.on`/`Gantt.off` and `GanttShell.on`/`GanttShell.off` all share
 *  — declared once here rather than repeating the same conditional at each of those four
 *  call sites. `K extends AsyncCancelableEvent` is the only two names a handler may resolve async. */
export type GanttEventHandler<K extends keyof GanttEventMap> = (
  payload: GanttEventMap[K],
) => void | false | (K extends AsyncCancelableEvent ? Promise<void | false> : never);

/** S5.1: `PluginContext.events` is this pair, so a plugin author's autocomplete reads the
 *  same as a consumer's own `gantt.on(...)` (one name, one concept — CLAUDE.md) rather than a second,
 *  differently-shaped events surface. `GanttShell`'s own `on`/`off` below already satisfy this shape;
 *  a plugin gets a plain object built from them, not the shell itself (no back-door to its other
 *  public methods). */
export interface GanttEvents {
  /** Every plugin registration seam returns a `Disposer` that removes exactly its own registration
   *  (I2); `on` is that seam for a Gantt event. */
  on<K extends keyof GanttEventMap>(name: K, handler: GanttEventHandler<K>): Disposer;
  off<K extends keyof GanttEventMap>(name: K, handler: GanttEventHandler<K>): void;
}
