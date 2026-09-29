// view/ — the seam `interaction/entry-gestures.ts` drives and `GanttShell` implements.
// `interaction/` performs no arithmetic of its own: every date/pixel computation a gesture
// needs runs behind `EntryGestureSession`, built by `GanttShell`'s `GesturePipeline` (D-GH-1).
//
// The sole declaration (C5): `interaction/` may import `view/` (the legal edge, plans/01 §1), so this
// type lives here once instead of being mirrored on both sides of that edge.

import type { Entry, EntryId, BarId, RowId, ClientPoint } from '../model/index.js';
import type { GestureCapability } from './capability.js';

/** What kind of data gesture is in flight — a bar drag that moves it, a bar drag that resizes one
 *  edge, or a grid row drag that reorders or re-parents the Entry and writes no date. */
export type EntryGesture = { kind: 'move' } | { kind: 'resize'; edge: 'start' | 'end' } | { kind: 'reorder' };

/** Alt suspends snapping for fine placement during a gesture — `entry-gestures.ts` reads
 *  `e.altKey` off the pointer event and passes it through here; only `GanttShell` knows how a
 *  preset's own `snap` setting resolves, so `interaction/` never resolves it itself. */
export interface DraftOptions {
  suspendSnap?: boolean;
  /** Content-x under the pointer, already converted by `contentXAtPaneOffset`.
   *  `preview()` paints the Cursor line here; `commit()`/`nudge()` ignore it. */
  cursorX?: number;
  /** #425: content-y under the pointer, already converted by `contentYAtClientY`. `preview()`
   *  and `commit()` resolve the vertical drag's row drop from it; `nudge()` ignores it — a keyboard
   *  step never reparents. */
  contentY?: number;
}

/** What `hitTest` found: a bar in the timeline pane, or a row in the grid pane (#185).
 *
 *  On a bar hit, `edge` is set only for a hit on the shared resize-handle pair — sourced from the
 *  handle's own `data-edge` attribute — never for a hit on the bar body.
 *
 *  A row hit names the row alone. Which Entries the row owns is `entriesForRow`'s answer, so
 *  `interaction/` never turns a row into an Entry by itself. */
export type EntryHit = { kind: 'bar'; barId: BarId; edge?: 'start' | 'end' } | { kind: 'row'; rowId: RowId };

/** One armed gesture (D-GH-1): `session()` resolves what moves once, at arm time, so
 *  `interaction/entry-gestures.ts`'s pointer machine holds this one object instead of separately
 *  tracking `armedEntries`/`grabbedId`/`grabbedEdge`. */
export interface EntryGestureSession {
  /** Raw-pixel preview, coalesced on the pipeline's own rAF. `entry-gestures.ts` always
   *  passes `{ suspendSnap: true }` so the grabbed spot on the bar tracks the pointer with no drift. */
  preview(dxPx: number, options?: DraftOptions): void;
  /** Snapped write: `beforeEntry{Move,Resize}` → commit → `entry{Move,Resize}`. Resolves
   *  `false` on a sync veto or a `MutationCancelledError` — both restore silently. A returned Promise
   *  from a `before*` handler resolves this one asynchronously instead: the pipeline paints
   *  `pending` and holds this gesture until it settles, a new gesture supersedes it, or something
   *  discards it (`discardHeldGesture`, #272/#273). */
  commit(dxPx: number, options?: DraftOptions): Promise<boolean>;
  /** One discrete step in `direction`, sized to one resolved snap unit and written
   *  straight through `commit`'s own veto/pending path — `interaction/keyboard-editing.ts`'s only way
   *  to move an entry, so it never resolves a pixel width or reads a `TimeScale` itself. */
  nudge(direction: 1 | -1, options?: DraftOptions): Promise<boolean>;
  /** Escape / pointer cancel — clears the preview, writes nothing. */
  cancel(): void;
}

/** What `interaction/` asks the Selection (#230). `view/entry-selection.ts`'s `EntrySelection`
 *  answers all of it.
 *
 *  One member on `EntryGestureContext`, not five, for the reason `ContainerDomPorts` is shaped
 *  the same way: a port bag whose members answer one collaborator's questions is that collaborator,
 *  spelled out. */
export interface SelectionForGestures {
  /** The Selection itself — Entry ids (#421, ADR 0025). */
  entryIds(): readonly EntryId[];
  /** The cancelable `beforeSelectionChange` → apply → `selectionChange` sequence. */
  propose(next: readonly EntryId[]): void;
  /** The selectable entries in resolved row order — a keyboard row step and a shift-range both walk
   *  this list. */
  selectableEntriesInRowOrder(): readonly EntryId[];
  /** The Entries this hit would select (#212, ADR 0010, ADR 0025, #230) — a row names every
   *  selectable Entry it owns; a bar names its own Entry when it may be selected, else nothing.
   *  `interaction/` asks this instead of re-deriving the pane rule from `hit.kind` itself. */
  selectableEntriesOf(hit: EntryHit): readonly EntryId[];
}

/** #434: what a click activates, independent of Selection (I14) — the same shape `SelectionForGestures`
 *  takes for `select`, one collaborator answering one hit's worth of questions. */
export interface ActivationForGestures {
  /** The Entry a hit stands for — a bar names its own Entry; a row names its subject, the row's
   *  first Entry (the same subject a `DomTarget` reads for a row). `undefined` when the row owns
   *  none, or the bar's Entry is gone. Names *which* Entry only; the caller still asks
   *  `can('activate', entry)` before firing (I14). */
  subjectEntryOf(hit: EntryHit): Entry | undefined;
  /** Fires `entryActivate` with cause `'click'`, gated by both the pointer trigger
   *  (`GanttShellOptions.pointerActivation`) and `detail`, the click's own click count. Under
   *  `pointerActivation: 'click'` (default) this fires only for a click's first physical press —
   *  `detail >= 2` is a no-op, so one physical double-click still activates once, not twice. Under
   *  `'dblclick'` this never fires at all; that mode's only pointer trigger is `GanttShell`'s own
   *  native `dblclick` listener. No veto: activation mutates nothing. */
  activateFromClick(entry: Entry, detail: number, target: 'bar' | 'row'): void;
}

/** Grown from S3.1/S3.2's `EntrySelectionContext` into the full gesture context: the
 *  selection half (`hitTest`/`selectableEntriesInRowOrder`/`selection`/`setHovered`) is unchanged; `entryFor`/`can`
 *  replace `entryIdFor`/`canSelect` (one capability resolution serves both selection and gesture
 *  checks, I14); `session` replaces `entriesForGesture`/`draftFor`/`commit`/`preview`. */
export interface EntryGestureContext {
  /** Content-surface hit test — `RenderBackend.hitTest`, already client-relative (S1 D-D). */
  hitTest(at: ClientPoint): EntryHit | undefined;
  /** The entry under a bar id, or undefined once a stale bar id outlives its frame. */
  entryFor(barId: BarId): Entry | undefined;
  /** One resolution (I14) — `view/capability.ts`'s answer for `entry` on `capability`.
   *  `edge` narrows a `'resize'` question to one handle (#142); every other capability ignores it. */
  can(capability: GestureCapability, entry: Entry, edge?: 'start' | 'end'): boolean;
  /** What is selected, and what a hit would select — one collaborator, one member (#230). */
  selection: SelectionForGestures;
  /** What a hit would activate, and the door to fire it (#434). */
  activation: ActivationForGestures;
  /** The bar id under the pointer, or undefined on pointerleave. */
  setHovered(barId: BarId | undefined): void;
  /** The grid row under the pointer, or undefined once it leaves the grid pane. The timeline pane
   *  reports no row of its own: over there a bar names the row, and the shell reads it off the frame
   *  rather than asking the pointer twice. */
  setHoveredRow(rowId: RowId | undefined): void;
  /** S3.8: pane-local `offsetX` (`clientX - pane left`) plus the bound x `ScrollAxis`'s position —
   *  content x for the Cursor line. `interaction/` never reads element scroll (I12). */
  contentXAtPaneOffset(offsetX: number): number;
  /** Content-y under a pointer at `clientY`, read through the bound y `ScrollAxis`. Both panes
   *  share one row geometry, so it needs no pane. */
  contentYAtClientY(clientY: number): number;
  /** Arms a gesture on the grabbed entry (+ capable co-selected entries). Returns
   *  `undefined` when nothing capable is grabbed — replaces the length check `start()` in
   *  `entry-gestures.ts` used to make by hand against `entriesForGesture()`'s result. */
  session(grabbed: EntryId, gesture: EntryGesture): EntryGestureSession | undefined;
  /** Ends a currently-held gesture without writing anything: clears the hold, flushes the preview,
   *  and reports it dropped. `false` when nothing was held. Escape reaches for this when there is no
   *  live drag left to cancel (#272, #273) — a held gesture's Promise is still out with a `before*`
   *  handler, so there is nothing `cancel()` on an `EntryGestureSession` could act on any more. */
  discardHeldGesture(): boolean;
}
