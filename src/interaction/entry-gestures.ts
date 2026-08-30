// interaction/ — the one pointer stream over the bar layer (plans/01 §9, `plans/03` §S3). S3.1 ships
// its first outcome only: selection. Move/resize preview and commit join this file in S3.3/S3.4 over
// the same pointer stream, so a pointerdown that becomes a drag never also changes the selection —
// today there is no drag yet, so every pointerup is read as a click.
//
// Never writes on pointerdown (plans/01 §9) — S3.1 does not listen for it at all.

import type { EntryId, ItemId } from '../model/index.js';

/** S3.1's slice of what S3.3 grows into `EntryGestureContext` (`plans/s3-direct-manipulation/README.md`
 *  D-S3-5) — selection is the one outcome this step ships, so this is the one seam it needs. Building
 *  the seven-member context ahead of the gestures that use it would be exactly the premature
 *  abstraction CLAUDE.md warns against. */
export interface EntrySelectionContext {
  /** Content-surface hit test — `RenderBackend.hitTest`, already client-relative (S1 D-D). */
  hitTest(x: number, y: number): ItemId | undefined;
  /** The entry under an item id, or undefined once segments exist and an id outlives its item. */
  entryIdFor(itemId: ItemId): EntryId | undefined;
  /** One resolution (I14, D-S3-9) — `() => true` until S3.2 installs `view/capability.ts`. */
  canSelect(entryId: EntryId): boolean;
  /** The current row order, oldest-first — S4's row sources supply this once they exist; today it is
   *  `dataset.entries.all`'s own order, the only order there is. Shift-click ranges over it. */
  rowOrder(): readonly EntryId[];
  selection: { get(): readonly EntryId[]; propose(next: readonly EntryId[]): void };
}

export interface EntryGesturesAttachment {
  detach(): void;
}

/** Pointer semantics (D-S3-10): plain click replaces, ctrl/⌘-click toggles, shift-click extends over
 *  `rowOrder()`, a click on empty timeline clears, Escape clears. A click on an incapable bar leaves
 *  the selection untouched (it is not an empty-timeline clear); ctrl/⌘-click on one is a no-op;
 *  shift-click omits incapable entries from the range and writes nothing if that empties the range. */
export function attachEntryGestures(
  pane: HTMLElement,
  container: HTMLElement,
  ctx: EntrySelectionContext,
): EntryGesturesAttachment {
  /** Last plain- or ctrl-clicked capable entry — shift-click's range end. Cleared on an empty-click
   *  or Escape clear, so a shift-click right after either one degenerates to selecting just its
   *  target (there is no prior anchor to range from). */
  let anchor: EntryId | undefined;

  function selectRange(to: EntryId): readonly EntryId[] {
    const order = ctx.rowOrder();
    const fromIndex = anchor !== undefined ? order.indexOf(anchor) : -1;
    const toIndex = order.indexOf(to);
    if (fromIndex === -1 || toIndex === -1) return [to].filter((id) => ctx.canSelect(id));
    const [lo, hi] = fromIndex <= toIndex ? [fromIndex, toIndex] : [toIndex, fromIndex];
    return order.slice(lo, hi + 1).filter((id) => ctx.canSelect(id));
  }

  function onPointerUp(e: PointerEvent): void {
    const itemId = ctx.hitTest(e.clientX, e.clientY);
    const entryId = itemId !== undefined ? ctx.entryIdFor(itemId) : undefined;

    if (entryId === undefined) {
      anchor = undefined;
      if (ctx.selection.get().length > 0) ctx.selection.propose([]);
      return;
    }

    if (e.shiftKey) {
      const next = selectRange(entryId);
      if (next.length > 0) ctx.selection.propose(next);
      return;
    }

    if (!ctx.canSelect(entryId)) return;

    if (e.ctrlKey || e.metaKey) {
      anchor = entryId;
      const current = ctx.selection.get();
      const next = current.includes(entryId) ? current.filter((id) => id !== entryId) : [...current, entryId];
      ctx.selection.propose(next);
      return;
    }

    anchor = entryId;
    ctx.selection.propose([entryId]);
  }

  function onKeyDown(e: KeyboardEvent): void {
    if (e.key !== 'Escape') return;
    anchor = undefined;
    if (ctx.selection.get().length > 0) ctx.selection.propose([]);
  }

  pane.addEventListener('pointerup', onPointerUp);
  container.addEventListener('keydown', onKeyDown);

  return {
    detach(): void {
      pane.removeEventListener('pointerup', onPointerUp);
      container.removeEventListener('keydown', onKeyDown);
    },
  };
}
