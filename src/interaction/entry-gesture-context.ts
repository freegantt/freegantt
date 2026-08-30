// interaction/ — the seam `entry-gestures.ts` drives and `GanttShell` implements (plans/03 §S3,
// D-S3-5). `interaction/` performs no arithmetic of its own: every date/pixel computation a gesture
// needs is a pure `layout/` function the shell hands back through this context.

import type { Entry, EntryEdits, EntryId, ItemId } from '../model/index.js';
import type { Interactions } from '../view/index.js';

/** What kind of data gesture is in flight. Only `'move'` exists in S3.3 — `'resize'` lands in S3.4. */
export type Gesture = { kind: 'move' } | { kind: 'resize'; edge: 'start' | 'end' };

/** Alt suspends snapping for fine placement during a gesture (D-S3-12) — `entry-gestures.ts` reads
 *  `e.altKey` off the pointer event and passes it through here; only the shell knows how a preset's
 *  own `snap` setting resolves, so `interaction/` never resolves it itself. */
export interface DraftOptions {
  suspendSnap?: boolean;
}

/** Grown from S3.1/S3.2's `EntrySelectionContext` into the full gesture context (D-S3-5): the
 *  selection half (`hitTest`/`rowOrder`/`selection`/`setHovered`) is unchanged; `entryFor`/`can`
 *  replace `entryIdFor`/`canSelect` (one capability resolution serves both selection and gesture
 *  checks, I14); `entriesForGesture` through `pointerAt` are new. */
export interface EntryGestureContext {
  /** Content-surface hit test — `RenderBackend.hitTest`, already client-relative (S1 D-D). */
  hitTest(x: number, y: number): ItemId | undefined;
  /** The entry under an item id, or undefined once segments exist and an id outlives its item. */
  entryFor(itemId: ItemId): Entry | undefined;
  /** One resolution (I14, D-S3-9) — `view/capability.ts`'s answer for `entry` on `capability`. */
  can(capability: keyof Interactions, entry: Entry): boolean;
  /** The current row order, oldest-first — shift-click ranges over it (S4's row sources replace this
   *  once they exist). */
  rowOrder(): readonly EntryId[];
  selection: { get(): readonly EntryId[]; propose(next: readonly EntryId[]): void };
  /** S3.2 (D-S3-6): the item id under the pointer, or undefined on pointerleave. */
  setHovered(itemId: ItemId | undefined): void;
  /** The entries one gesture moves, grabbed entry first (D-S3-19, D-S3-22): just the grabbed entry
   *  when it is not part of a multi-entry selection, else every *capable* selected entry — an
   *  incapable one is skipped, not blocking. */
  entriesForGesture(grabbed: EntryId): readonly Entry[];
  /** Pure gesture math (`layout/gesture-draft.ts`'s `draftForMove`), with the shell's own zone/scale/
   *  snap already resolved in. `dxPx` is horizontal pointer travel since the gesture armed.
   *  `entry-gestures.ts` always passes `{ suspendSnap: true }` for the live preview (so the bar
   *  tracks the pointer with no drift) and only lets the preset's snap through at commit. */
  draftFor(gesture: Gesture, entries: readonly Entry[], dxPx: number, options?: DraftOptions): EntryEdits;
  /** `beforeEntryMove` → one `dataset.transaction()` → `entryMove` (D-S3-16). Resolves `false` on a
   *  sync veto or a `MutationCancelledError` from `beforeChange` — both restore silently, nothing
   *  thrown back into the pointer handler. */
  commit(gesture: Gesture, draft: EntryEdits): Promise<boolean>;
  /** Coalesced on the shell's own rAF (D-S3-18): `undefined` clears whatever was previewing. */
  preview(draft: EntryEdits | undefined): void;
  /** The item id and content-x under the pointer during a gesture, or `undefined` once the gesture
   *  ends — S3.6's extender-ghost trigger; unused by anything else in S3.3. */
  pointerAt(at: { itemId?: ItemId; x?: number } | undefined): void;
}
