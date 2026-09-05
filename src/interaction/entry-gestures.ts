// interaction/ — the one pointer stream over the bar layer (plans/01 §9, `plans/03` §S3). A
// pointerdown that becomes a drag never also changes the selection — every pointerup that
// `createPointerGesture.up()` reports as a drag skips the click/selection path below entirely.
//
// Never writes on pointerdown (plans/01 §9) — arming a drag previews nothing but its own hover state
// until the drag threshold (or a touch long-press) is crossed. `mousedown` is only there so a
// double-click cannot start a native text range; it writes no Gantt state.

import type { EntryId } from '../model/index.js';
import { itemId } from '../model/index.js';
import { createPointerGesture } from './pointer-gesture.js';
import type {
  Detachable,
  EntryGestureContext,
  EntryGesture,
  EntryGestureSession,
  EntryHit,
} from '../view/index.js';

export type { EntryGestureContext, EntryGesture, DraftOptions, EntryHit } from '../view/index.js';

/** Pointer semantics (D-S3-10): plain click replaces, ctrl/⌘-click toggles, shift-click extends over
 *  `selectableEntriesInRowOrder()`, a click on empty timeline clears, Escape clears. A click on an incapable bar leaves
 *  the selection untouched (it is not an empty-timeline clear); ctrl/⌘-click on one is a no-op;
 *  shift-click omits incapable entries from the range and writes nothing if that empties the range.
 *
 *  Move (S3.3, D-S3-16): a pointerdown on a `move`-capable bar arms a drag once the pointer clears
 *  the drag threshold; every subsequent move previews the draft (`session().preview`) at full pixel
 *  resolution — never snapped — so the grabbed spot on the bar tracks the cursor with no drift, and
 *  pointerup commits the snapped draft (`session().commit`) through `beforeEntryMove` → one
 *  transaction → `entryMove`. Escape mid-drag clears the preview and commits nothing (`[S3-A2]`) —
 *  the store was never touched.
 *
 *  Resize (S3.4, D-S3-4): a pointerdown on the shared resize-handle pair (`ctx.hitTest`'s `edge`)
 *  arms the same drag machinery with a `{ kind: 'resize', edge }` gesture instead — one pointer
 *  stream, one state machine, only the grabbed gesture shape differs.
 *
 *  Grid row click (bug hunt, "grid row highlight and row click"): `rowLayer` gets its own, narrower
 *  pointerup listener — a row click selects with the same rules as a bar click (plain/ctrl/shift),
 *  but it never arms move or resize (`ctx.hitTest`'s grid-row fallback never grabs `pane`'s own drag
 *  machinery) and a miss on the grid never clears (only an empty *timeline* click does). */
export function attachEntryGestures(
  pane: HTMLElement,
  rowLayer: HTMLElement,
  container: HTMLElement,
  ctx: EntryGestureContext,
): Detachable {
  /** Last plain- or ctrl-clicked capable entry — shift-click's range end. Cleared on an empty-click
   *  or Escape clear, so a shift-click right after either one degenerates to selecting just its
   *  target (there is no prior anchor to range from). */
  let anchor: EntryId | undefined;

  /** Set on pointerdown when the hit is a `move`-capable bar or a `resize`-capable handle; cleared
   *  once the pointer stream for that gesture ends (commit or cancel), never read past that point. */
  let grabbedId: EntryId | undefined;
  /** Set alongside `grabbedId` only for a handle grab (S3.4) — its presence is what distinguishes a
   *  resize gesture from a move gesture everywhere below. */
  let grabbedEdge: 'start' | 'end' | undefined;
  /** D-GH-1: what `ctx.session()` armed for this drag — replaces `armedEntries` (`session` already
   *  closes over the capable entries and the grabbed `EntryGesture` shape). Defined only between a
   *  successful `start()` and the matching `commit`/`cancel`. */
  let session: EntryGestureSession | undefined;

  function currentGesture(): EntryGesture {
    return grabbedEdge !== undefined ? { kind: 'resize', edge: grabbedEdge } : { kind: 'move' };
  }

  const drag = createPointerGesture(pane, {
    start(): boolean {
      if (grabbedId === undefined) return false;
      session = ctx.session(grabbedId, currentGesture());
      return session !== undefined;
    },
    move(e, dxPx): void {
      // The live preview always tracks the pointer at full resolution (never quantized to a snap
      // unit) so the grabbed spot on the bar never drifts from the cursor mid-drag. Snapping still
      // applies to what actually gets written — see commit() below — this only affects what paints
      // while the gesture is in flight. Cursor line x is content space (D-S3-15): pane-local offset
      // plus the bound scroll, never element.scrollLeft (I12).
      const offsetX = e.clientX - pane.getBoundingClientRect().left;
      session!.preview(dxPx, { suspendSnap: true, cursorX: ctx.contentXAtPaneOffset(offsetX) });
    },
    commit(e, dxPx): void {
      // The committed value snaps to the preset's tick unit unless Alt held it off for fine
      // placement (D-S3-12) — this is the one place snapping actually lands, now that move() above
      // always previews raw.
      void session!.commit(dxPx, e.altKey ? { suspendSnap: true } : undefined);
      session = undefined;
      grabbedId = undefined;
      grabbedEdge = undefined;
    },
    cancel(): void {
      session!.cancel();
      session = undefined;
      grabbedId = undefined;
      grabbedEdge = undefined;
    },
  });

  /** The range from the shift-anchor to `to`'s last member (#185). A row that owns several Entries
   *  ends the range on its last one; a bar hit passes a list of one, exactly as before. */
  function selectRange(to: readonly EntryId[]): readonly EntryId[] {
    const order = ctx.selectableEntriesInRowOrder();
    const fromIndex = anchor !== undefined ? order.indexOf(anchor) : -1;
    const toIndex = order.indexOf(to[to.length - 1]!);
    if (fromIndex === -1 || toIndex === -1) return to;
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
    // A drag only ever starts on a bar: a row hit arms nothing (D-S3-10's grid-row clause).
    const hit = ctx.hitTest({ x: e.clientX, y: e.clientY });
    const bar = hit?.kind === 'bar' ? hit : undefined;
    const entry = bar !== undefined ? ctx.entryFor(bar.itemId) : undefined;
    if (entry !== undefined && bar?.edge !== undefined && ctx.can('resize', entry)) {
      grabbedId = entry.id;
      grabbedEdge = bar.edge;
    } else if (entry !== undefined && bar !== undefined && ctx.can('move', entry)) {
      grabbedId = entry.id;
      grabbedEdge = undefined;
    } else {
      grabbedId = undefined;
      grabbedEdge = undefined;
    }
    drag.down(e);
  }

  /** Pointer semantics shared by a timeline click and a grid-row click (D-S3-10, bug hunt: "grid row
   *  highlight and row click") — everything past "what did we hit". `clearOnMiss` is the one place
   *  the two surfaces differ: an empty timeline click clears the selection; a grid miss (a header
   *  row, padding, a twisty — `render/dom`'s `hitTest` already returns no hit for those) never does. */
  function selectFromHit(
    e: Pick<PointerEvent, 'shiftKey' | 'ctrlKey' | 'metaKey'>,
    hit: EntryHit | undefined,
    clearOnMiss: boolean,
  ): void {
    // A grid miss (`clearOnMiss = false`, see the doc comment above) leaves the shift-anchor alone
    // too — only a genuine miss-clears-everything surface (the timeline) drops it here.
    if (hit === undefined || missesEveryEntry(hit)) {
      if (clearOnMiss) {
        anchor = undefined;
        if (ctx.selection.get().length > 0) ctx.selection.propose([]);
      }
      return;
    }

    // #185: one hit resolves to a list of Entries — one for a bar, every selectable one the row
    // owns for a row. The rules below then run over the list as a unit. An empty list means the hit
    // landed on something no gesture may select, which writes nothing and clears nothing.
    const targets = selectableEntriesOf(hit);
    if (targets.length === 0) return;
    // #185: the bar the pointer landed on, so the paint can narrow to it. A row hit names a row, not
    // a bar, and its Entries paint whole.
    const picked = hit.kind === 'bar' ? hit.itemId : undefined;

    if (e.shiftKey) {
      // A range spans whole Entries, so it picks no bar: narrowing the one bar the range ended on
      // while its neighbours paint whole would read as two kinds of selection at once.
      const next = selectRange(targets);
      if (next.length > 0) ctx.selection.propose(next);
      return;
    }

    anchor = targets[0];

    if (e.ctrlKey || e.metaKey) {
      ctx.selection.propose(toggled(targets), picked);
      return;
    }

    ctx.selection.propose(targets, picked);
  }

  /** True when the hit stands for nothing the Dataset still holds — a stale Item id, which is the
   *  same "nothing there" a miss reports. A row that exists but owns nothing selectable is not this:
   *  the pointer did land on a row, so an empty timeline's clear must not fire for it. */
  function missesEveryEntry(hit: EntryHit): boolean {
    return hit.kind === 'bar' && ctx.entryFor(hit.itemId) === undefined;
  }

  /** The Entries this hit selects (#185): the bar's own Entry when it may be selected, or every
   *  selectable Entry the row owns. `entriesForRow` resolves the capability, so both branches
   *  answer with ids a `select` already allowed. */
  function selectableEntriesOf(hit: EntryHit): readonly EntryId[] {
    if (hit.kind === 'row') return ctx.entriesForRow(hit.rowId);
    const entry = ctx.entryFor(hit.itemId);
    return entry !== undefined && ctx.can('select', entry) ? [entry.id] : [];
  }

  /** Ctrl/⌘ moves the whole list at once: it removes the list when every member is already
   *  selected, else it adds the members that are missing (#185). */
  function toggled(targets: readonly EntryId[]): readonly EntryId[] {
    const current = ctx.selection.get();
    if (targets.every((id) => current.includes(id))) {
      return current.filter((id) => !targets.includes(id));
    }
    return [...current, ...targets.filter((id) => !current.includes(id))];
  }

  function onPointerUp(e: PointerEvent): void {
    if (drag.up(e)) return; // was a drag — commit/cancel already ran inside pointer-gesture's callbacks
    selectFromHit(e, ctx.hitTest({ x: e.clientX, y: e.clientY }), true);
  }

  /** The grid pane's own pointerup — never fed through `drag` (D-S3-19/22's move/resize machinery
   *  is armed only from a timeline `pointerdown`, `onPointerDown` below), so a row click can only
   *  ever be a click, never the start of a drag. */
  function onRowLayerPointerUp(e: PointerEvent): void {
    selectFromHit(e, ctx.hitTest({ x: e.clientX, y: e.clientY }), false);
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
    const hit = ctx.hitTest({ x: e.clientX, y: e.clientY });
    ctx.setHovered(hit?.kind === 'bar' ? hit.itemId : undefined);
  }

  function onPointerLeave(): void {
    ctx.setHovered(undefined);
  }

  // Bug hunt B6: a browser-issued cancel (touch interrupt, drag into a scrollbar) has no other path
  // to `cancel()` — Escape's own `drag.escape()` needs a keydown that a cancelled touch never sends.
  function onPointerCancel(e: PointerEvent): void {
    drag.pointercancel(e);
  }

  pane.addEventListener('pointerdown', onPointerDown);
  pane.addEventListener('pointerup', onPointerUp);
  pane.addEventListener('pointermove', onPointerMove);
  pane.addEventListener('pointerleave', onPointerLeave);
  pane.addEventListener('pointercancel', onPointerCancel);
  rowLayer.addEventListener('pointerup', onRowLayerPointerUp);
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
      pane.removeEventListener('pointercancel', onPointerCancel);
      rowLayer.removeEventListener('pointerup', onRowLayerPointerUp);
      container.removeEventListener('keydown', onKeyDown);
      container.removeEventListener('mousedown', onMouseDown);
      container.removeEventListener('selectstart', onSelectStart);
    },
  };
}
