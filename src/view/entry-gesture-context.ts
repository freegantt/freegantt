// view/ — the seam `interaction/entry-gestures.ts` drives and `GanttShell` implements (plans/03 §S3,
// D-S3-5). `interaction/` performs no arithmetic of its own: every date/pixel computation a gesture
// needs runs behind `EntryGestureSession`, built by `GanttShell`'s `GesturePipeline` (D-GH-1).
//
// The sole declaration (C5): `interaction/` may import `view/` (the legal edge, plans/01 §1), so this
// type lives here once instead of being mirrored on both sides of that edge.

import type { Entry, EntryId, ItemId, RowId, SegmentId, ClientPoint } from '../model/index.js';
import type { GestureCapability } from './capability.js';

/** What kind of data gesture is in flight — `'move'` (S3.3) or `'resize'` with the grabbed edge (S3.4). */
export type EntryGesture = { kind: 'move' } | { kind: 'resize'; edge: 'start' | 'end' };

/** Alt suspends snapping for fine placement during a gesture (D-S3-12) — `entry-gestures.ts` reads
 *  `e.altKey` off the pointer event and passes it through here; only `GanttShell` knows how a
 *  preset's own `snap` setting resolves, so `interaction/` never resolves it itself. */
export interface DraftOptions {
  suspendSnap?: boolean;
  /** S3.8, D-S3-15: content-x under the pointer, already converted by `contentXAtPaneOffset`.
   *  `preview()` paints the Cursor line here; `commit()`/`nudge()` ignore it. */
  cursorX?: number;
}

/** What `hitTest` found: a bar in the timeline pane, or a row in the grid pane (#185).
 *
 *  On a bar hit, `edge` is set only for a hit on the shared resize-handle pair — sourced from the
 *  handle's own `data-edge` attribute (D-S3-8) — never for a hit on the bar body (S3.4, D-S3-4).
 *
 *  A row hit names the row alone. Which Entries the row owns is `entriesForRow`'s answer, so
 *  `interaction/` never turns a row into an Entry by itself. */
export type EntryHit =
  { kind: 'bar'; itemId: ItemId; edge?: 'start' | 'end' } | { kind: 'row'; rowId: RowId };

/** One armed gesture (D-GH-1): `session()` resolves what moves once, at arm time, so
 *  `interaction/entry-gestures.ts`'s pointer machine holds this one object instead of separately
 *  tracking `armedEntries`/`grabbedId`/`grabbedEdge`. */
export interface EntryGestureSession {
  /** Raw-pixel preview, coalesced on the pipeline's own rAF (D-S3-18). `entry-gestures.ts` always
   *  passes `{ suspendSnap: true }` so the grabbed spot on the bar tracks the pointer with no drift. */
  preview(dxPx: number, options?: DraftOptions): void;
  /** Snapped write: `beforeEntry{Move,Resize}` → commit → `entry{Move,Resize}` (D-S3-16). Resolves
   *  `false` on a sync veto or a `MutationCancelledError` — both restore silently. A returned Promise
   *  from a `before*` handler resolves this one asynchronously instead (D-S3-17): the pipeline marks
   *  itself `pending` (paint + arm lock) until it settles. */
  commit(dxPx: number, options?: DraftOptions): Promise<boolean>;
  /** S3.5, D-S3-13: one discrete step in `direction`, sized to one resolved snap unit and written
   *  straight through `commit`'s own veto/pending path — `interaction/keyboard-editing.ts`'s only way
   *  to move an entry, so it never resolves a pixel width or reads a `TimeScale` itself. */
  nudge(direction: 1 | -1, options?: DraftOptions): Promise<boolean>;
  /** Escape / pointer cancel — clears the preview, writes nothing. */
  cancel(): void;
}

/** What `interaction/` asks the Selection (#230 R4). `view/segment-selection.ts`'s `SegmentSelection`
 *  answers all of it; `GanttShell` adds `segmentIdsOfEntries`, which is the Dataset's own projection.
 *
 *  One member on `EntryGestureContext`, not eight, for the reason R3 gave `ContainerDomPorts`: a port
 *  bag whose members answer one collaborator's questions is that collaborator, spelled out. The names
 *  say `segmentIds`, not `segments`, because every one of them returns ids — the same word
 *  `DomTarget.segmentIds` and `FrameLayoutView.segmentIdsForItem` already use. */
export interface SelectionForGestures {
  /** The Selection itself — Segment ids. */
  segmentIds(): readonly SegmentId[];
  /** The Entries the Selection's Segments belong to, deduped, in row order (#212) — the reading a
   *  row step and a nudge need, because both act on a whole record. */
  entryIds(): readonly EntryId[];
  /** The cancelable `beforeSelectionChange` → apply → `selectionChange` sequence (D-S3-10). */
  propose(next: readonly SegmentId[]): void;
  /** The selectable entries in resolved row order — a keyboard row step walks this list (D-S4-32). */
  selectableEntriesInRowOrder(): readonly EntryId[];
  /** Every selectable Segment in the order the panes draw it (#212, ADR 0010) — row by row, and
   *  inside a row the order that row's Entries draw their own Segments. Shift-click ranges over
   *  this list, because the Selection holds Segments and a range must name the same unit. */
  selectableSegmentsInRowOrder(): readonly SegmentId[];
  /** The Segments this hit would select (#212, ADR 0010, #230 R4) — a row names every selectable
   *  Entry it owns; a bar names its own Segment when its Entry may be selected, else nothing.
   *  `interaction/` asks this instead of re-deriving the pane rule from `hit.kind` itself. */
  selectableSegmentsOf(hit: EntryHit): readonly SegmentId[];
  /** Every Segment of these Entries, in the order given (#212, ADR 0010). A grid-row click, a
   *  shift-range and a keyboard select all name Entries and select every Segment those Entries draw. */
  segmentIdsOfEntries(ids: readonly EntryId[]): readonly SegmentId[];
  /** Every Segment this bar stands for (#212, ADR 0010) — the pane picks the unit. A bar that drew
   *  one Segment names that Segment alone. A bar that drew an Entry's whole span (a group, a
   *  milestone) names every Segment of that Entry. It reads the same answer `DomTarget.segmentIds`
   *  reads — `FrameLayoutView.segmentIdsForItem` — so the pointer path and this one cannot disagree. */
  segmentIdsForItem(item: ItemId): readonly SegmentId[];
}

/** Grown from S3.1/S3.2's `EntrySelectionContext` into the full gesture context (D-S3-5/D-GH-1): the
 *  selection half (`hitTest`/`selectableEntriesInRowOrder`/`selection`/`setHovered`) is unchanged; `entryFor`/`can`
 *  replace `entryIdFor`/`canSelect` (one capability resolution serves both selection and gesture
 *  checks, I14); `session` replaces `entriesForGesture`/`draftFor`/`commit`/`preview`. */
export interface EntryGestureContext {
  /** Content-surface hit test — `RenderBackend.hitTest`, already client-relative (S1 D-D). */
  hitTest(at: ClientPoint): EntryHit | undefined;
  /** The entry under an item id, or undefined once segments exist and an id outlives its item. */
  entryFor(itemId: ItemId): Entry | undefined;
  /** One resolution (I14, D-S3-9) — `view/capability.ts`'s answer for `entry` on `capability`.
   *  `edge` narrows a `'resize'` question to one handle (#142); every other capability ignores it. */
  can(capability: GestureCapability, entry: Entry, edge?: 'start' | 'end'): boolean;
  /** What is selected, and what a hit would select — one collaborator, one member (#230 R4). */
  selection: SelectionForGestures;
  /** S3.2 (D-S3-6): the item id under the pointer, or undefined on pointerleave. */
  setHovered(itemId: ItemId | undefined): void;
  /** S3.8: pane-local `offsetX` (`clientX - pane left`) plus the bound `ScrollModel`'s x — content
   *  x for the Cursor line. `interaction/` never reads element scroll (I12). */
  contentXAtPaneOffset(offsetX: number): number;
  /** Arms a gesture on the grabbed entry (+ capable co-selected entries, D-S3-19/22). Returns
   *  `undefined` when nothing capable is grabbed — replaces the length check `start()` in
   *  `entry-gestures.ts` used to make by hand against `entriesForGesture()`'s result. */
  session(grabbed: EntryId, gesture: EntryGesture): EntryGestureSession | undefined;
}
