// view/ — the seam `interaction/entry-gestures.ts` drives and `GanttShell` implements (plans/03 §S3,
// D-S3-5). `interaction/` performs no arithmetic of its own: every date/pixel computation a gesture
// needs runs behind `EntryGestureSession`, built by `GanttShell`'s `GesturePipeline` (D-GH-1).
//
// The sole declaration (C5): `interaction/` may import `view/` (the legal edge, plans/01 §1), so this
// type lives here once instead of being mirrored on both sides of that edge.

import type { Entry, EntryId, ItemId, RowId, ClientPoint } from '../model/index.js';
import type { Interactions } from './capability.js';

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

/** Grown from S3.1/S3.2's `EntrySelectionContext` into the full gesture context (D-S3-5/D-GH-1): the
 *  selection half (`hitTest`/`selectableEntriesInRowOrder`/`selection`/`setHovered`) is unchanged; `entryFor`/`can`
 *  replace `entryIdFor`/`canSelect` (one capability resolution serves both selection and gesture
 *  checks, I14); `session` replaces `entriesForGesture`/`draftFor`/`commit`/`preview`. */
export interface EntryGestureContext {
  /** Content-surface hit test — `RenderBackend.hitTest`, already client-relative (S1 D-D). */
  hitTest(at: ClientPoint): EntryHit | undefined;
  /** The entry under an item id, or undefined once segments exist and an id outlives its item. */
  entryFor(itemId: ItemId): Entry | undefined;
  /** One resolution (I14, D-S3-9) — `view/capability.ts`'s answer for `entry` on `capability`. */
  can(capability: keyof Interactions, entry: Entry): boolean;
  /** The selectable entries in resolved row order — shift-click ranges over this list (D-S4-32). */
  selectableEntriesInRowOrder(): readonly EntryId[];
  /** The selectable Entries one row owns, in the row's own order (#185). A row click selects all of
   *  them. Empty for a header row, and for a row whose every Entry refuses `select` — the capability
   *  is resolved here, once (I14), so `interaction/` still performs no lookups of its own. */
  entriesForRow(rowId: RowId): readonly EntryId[];
  selection: {
    get(): readonly EntryId[];
    /** `pickedItemId` is the one bar the pointer landed on (#185) — where the shared resize-handle
     *  pair parks while nothing is hovered. Omit it when no pointer picked a bar. */
    propose(next: readonly EntryId[], pickedItemId?: ItemId): void;
  };
  /** S3.2 (D-S3-6): the item id under the pointer, or undefined on pointerleave. */
  setHovered(itemId: ItemId | undefined): void;
  /** S3.8: pane-local `offsetX` (`clientX - pane left`) plus the bound `ScrollModel`'s x — content
   *  x for the Cursor line. `interaction/` never reads element scroll (I12). */
  contentXAtPaneOffset(offsetX: number): number;
  /** When focus is on an expandable tree row, handles ArrowLeft/Right before nudge (D-S4-33). */
  tryTreeArrow?(direction: 'left' | 'right'): boolean;
  /** Expands every collapsed row in the current tree (`*` key, D-S4-33). */
  expandAllRows?(): void;
  /** Arms a gesture on the grabbed entry (+ capable co-selected entries, D-S3-19/22). Returns
   *  `undefined` when nothing capable is grabbed — replaces the length check `start()` in
   *  `entry-gestures.ts` used to make by hand against `entriesForGesture()`'s result. */
  session(grabbed: EntryId, gesture: EntryGesture, grabbedItemId?: ItemId): EntryGestureSession | undefined;
}
