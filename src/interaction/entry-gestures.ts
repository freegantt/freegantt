// interaction/ — the one pointer stream over the bar layer (plans/01 §9, `plans/03` §S3). A
// pointerdown that becomes a drag never also changes the selection — every pointerup that
// `attachPointerGesture.up()` reports as a drag skips the click/selection path below entirely.
//
// Never writes on pointerdown (plans/01 §9) — arming a drag previews nothing but its own hover state
// until the drag threshold (or a touch long-press) is crossed. `mousedown` is only there so a
// double-click cannot start a native text range; it writes no Gantt state.

import type { Entry, EntryId } from '../model/index.js';
import { itemId } from '../model/index.js';
import { attachPointerGesture } from './pointer-gesture.js';
import type { EntryGestureContext, Gesture } from './entry-gesture-context.js';

export type { EntryGestureContext, Gesture, DraftOptions } from './entry-gesture-context.js';

export interface EntryGesturesAttachment {
  detach(): void;
}

function moveGesture(): Gesture {
  return { kind: 'move' };
}

/** Pointer semantics (D-S3-10): plain click replaces, ctrl/⌘-click toggles, shift-click extends over
 *  `rowOrder()`, a click on empty timeline clears, Escape clears. A click on an incapable bar leaves
 *  the selection untouched (it is not an empty-timeline clear); ctrl/⌘-click on one is a no-op;
 *  shift-click omits incapable entries from the range and writes nothing if that empties the range.
 *
 *  Move (S3.3, D-S3-16): a pointerdown on a `move`-capable bar arms a drag once the pointer clears
 *  the drag threshold; every subsequent move previews the draft (`ctx.preview`) and pointerup commits
 *  it (`ctx.commit`) through `beforeEntryMove` → one transaction → `entryMove`. Escape mid-drag
 *  clears the preview and commits nothing (`[S3-A2]`) — the store was never touched. */
export function attachEntryGestures(
  pane: HTMLElement,
  container: HTMLElement,
  ctx: EntryGestureContext,
): EntryGesturesAttachment {
  /** Last plain- or ctrl-clicked capable entry — shift-click's range end. Cleared on an empty-click
   *  or Escape clear, so a shift-click right after either one degenerates to selecting just its
   *  target (there is no prior anchor to range from). */
  let anchor: EntryId | undefined;

  /** Set on pointerdown when the hit is a `move`-capable bar; cleared once the pointer stream for
   *  that gesture ends (commit or cancel), never read past that point. */
  let grabbedId: EntryId | undefined;
  let armedEntries: readonly Entry[] = [];

  const drag = attachPointerGesture(pane, {
    start(): boolean {
      if (grabbedId === undefined) return false;
      armedEntries = ctx.entriesForGesture(grabbedId);
      return armedEntries.length > 0;
    },
    move(e, dxPx): void {
      const draft = ctx.draftFor(
        moveGesture(),
        armedEntries,
        dxPx,
        e.altKey ? { suspendSnap: true } : undefined,
      );
      ctx.preview(draft);
    },
    commit(e, dxPx): void {
      const draft = ctx.draftFor(
        moveGesture(),
        armedEntries,
        dxPx,
        e.altKey ? { suspendSnap: true } : undefined,
      );
      ctx.preview(undefined);
      void ctx.commit(moveGesture(), draft);
      armedEntries = [];
      grabbedId = undefined;
    },
    cancel(): void {
      ctx.preview(undefined);
      armedEntries = [];
      grabbedId = undefined;
    },
  });

  function selectRange(to: EntryId): readonly EntryId[] {
    const order = ctx.rowOrder();
    const fromIndex = anchor !== undefined ? order.indexOf(anchor) : -1;
    const toIndex = order.indexOf(to);
    if (fromIndex === -1 || toIndex === -1) return [to].filter((id) => canSelect(id));
    const [lo, hi] = fromIndex <= toIndex ? [fromIndex, toIndex] : [toIndex, fromIndex];
    return order.slice(lo, hi + 1).filter((id) => canSelect(id));
  }

  /** `entryFor` takes an `ItemId`; the selection half of this file works in `EntryId` (row order,
   *  anchor, proposals) — `itemId(id)` bridges the one call site that needs both (S1 §2.4: segment 0
   *  of an entry with no segments yet is the whole bar). */
  function canSelect(id: EntryId): boolean {
    const entry = ctx.entryFor(itemId(id));
    return entry !== undefined && ctx.can('select', entry);
  }

  function onPointerDown(e: PointerEvent): void {
    const hit = ctx.hitTest(e.clientX, e.clientY);
    const entry = hit !== undefined ? ctx.entryFor(hit) : undefined;
    grabbedId = entry !== undefined && ctx.can('move', entry) ? entry.id : undefined;
    drag.down(e);
  }

  function onPointerUp(e: PointerEvent): void {
    if (drag.up(e)) return; // was a drag — commit/cancel already ran inside pointer-gesture's callbacks

    const itemId = ctx.hitTest(e.clientX, e.clientY);
    const entry = itemId !== undefined ? ctx.entryFor(itemId) : undefined;

    if (entry === undefined) {
      anchor = undefined;
      if (ctx.selection.get().length > 0) ctx.selection.propose([]);
      return;
    }

    if (e.shiftKey) {
      const next = selectRange(entry.id);
      if (next.length > 0) ctx.selection.propose(next);
      return;
    }

    if (!ctx.can('select', entry)) return;

    if (e.ctrlKey || e.metaKey) {
      anchor = entry.id;
      const current = ctx.selection.get();
      const next = current.includes(entry.id)
        ? current.filter((id) => id !== entry.id)
        : [...current, entry.id];
      ctx.selection.propose(next);
      return;
    }

    anchor = entry.id;
    ctx.selection.propose([entry.id]);
  }

  function onKeyDown(e: KeyboardEvent): void {
    if (e.key !== 'Escape') return;
    if (drag.escape()) return; // was dragging — cancelled, does not also clear the selection
    anchor = undefined;
    if (ctx.selection.get().length > 0) ctx.selection.propose([]);
  }

  /** `user-select: none` stops highlight *inside* the Gantt. A double-click still starts a native
   *  word range on nearby page text (the harness chrome). `detail > 1` is the second click of that
   *  sequence; the first click still focuses the container (preventDefault on mousedown would not). */
  function onMouseDown(e: MouseEvent): void {
    if (e.detail > 1) e.preventDefault();
  }

  function onSelectStart(e: Event): void {
    e.preventDefault();
  }

  /** Reports the raw hit under the pointer on every move (D-S3-5's `pointerAt` precedent a step
   *  early, S3.2) and feeds the same event into the drag state machine — one pointer stream, not two
   *  independent listeners racing each other. */
  function onPointerMove(e: PointerEvent): void {
    drag.move(e);
    ctx.setHovered(ctx.hitTest(e.clientX, e.clientY));
  }

  function onPointerLeave(): void {
    ctx.setHovered(undefined);
  }

  pane.addEventListener('pointerdown', onPointerDown);
  pane.addEventListener('pointerup', onPointerUp);
  pane.addEventListener('pointermove', onPointerMove);
  pane.addEventListener('pointerleave', onPointerLeave);
  container.addEventListener('keydown', onKeyDown);
  container.addEventListener('mousedown', onMouseDown);
  container.addEventListener('selectstart', onSelectStart);

  return {
    detach(): void {
      drag.detach();
      pane.removeEventListener('pointerdown', onPointerDown);
      pane.removeEventListener('pointerup', onPointerUp);
      pane.removeEventListener('pointermove', onPointerMove);
      pane.removeEventListener('pointerleave', onPointerLeave);
      container.removeEventListener('keydown', onKeyDown);
      container.removeEventListener('mousedown', onMouseDown);
      container.removeEventListener('selectstart', onSelectStart);
    },
  };
}
