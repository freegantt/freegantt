// interaction/ — the one pointer stream over the bar layer (plans/01 §9, `plans/03` §S3). A
// pointerdown that becomes a drag never runs the click/selection path below — every pointerup that
// `createPointerGesture.up()` reports as a drag skips `selectFromHit` entirely.
//
// Writes on pointerdown only once (#211, D-S4-30): when a move drag actually arms (the threshold is
// crossed) on a bar whose Entry is not already in the Selection, `drag`'s own `start()` proposes the
// Selection right there, so the pick a picked-Entry drag reads is never stale relative to what it
// grabbed — see the decision table's "grabbed bar not in the Selection" row in
// `plans/s5-extensibility-and-editing/spec-211-gesture-units.md` §4. A gesture that never crosses the
// threshold (a plain click) still resolves through `selectFromHit` on pointerup, unchanged; `mousedown`
// itself still writes nothing — it exists only so a double-click cannot start a native text range.

import type { EntryId, BarId } from '../model/index.js';
import { entryIdOfBar } from '../model/index.js';
import { createPointerGesture } from './pointer-gesture.js';
import type {
  Detachable,
  EntryGestureContext,
  EntryGesture,
  EntryGestureSession,
  EntryHit,
} from '../view/index.js';

export type { EntryGestureContext, EntryGesture, DraftOptions, EntryHit } from '../view/index.js';

/** Is this button event the primary (left-click, touch, pen) one? A right-click and a middle-click
 *  are not (#199/#205). Only a primary button may pick, replace, toggle, or range the Selection. A
 *  right-click instead reaches `context-menu.ts`'s `contextmenu` handler with whatever Selection it
 *  landed on. */
function isPrimaryButton(e: Pick<PointerEvent, 'button'>): boolean {
  return e.button === 0;
}

/** Is this button event a right-click? A right-click still triggers the empty-timeline clear
 *  (#199/#205 follow-up, `plans/02` D-S3-10 amendment). A background right-click opens a menu. A
 *  surviving highlight would misstate what the menu acts on. A middle-click opens no menu, so it
 *  does not clear. */
function isRightClick(e: Pick<PointerEvent, 'button'>): boolean {
  return e.button === 2;
}

/** Pointer semantics (D-S3-10): plain click replaces, ctrl/⌘-click toggles, shift-click extends over
 *  `selectableEntriesInRowOrder()`, a click on empty timeline clears, Escape clears. A right-click is
 *  a click for the clearing rule too (#199/#205 follow-up): it clears the same empty timeline, but it
 *  never picks, replaces, toggles, or ranges — a right-click that lands on a bar or a row leaves the
 *  Selection for `context-menu.ts` to read as-is. A click on an incapable bar leaves
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
  /** Last plain- or ctrl-clicked capable Entry — shift-click's range end (#212, ADR 0010, ADR
   *  0025). Cleared on an empty-click or Escape clear, so a shift-click right after either one
   *  degenerates to selecting just its target (there is no prior anchor to range from). */
  let anchor: EntryId | undefined;

  /** Set on pointerdown when the hit is a `move`-capable bar or a `resize`-capable handle; cleared
   *  once the pointer stream for that gesture ends (commit or cancel), never read past that point. */
  let grabbedId: EntryId | undefined;
  /** Set alongside `grabbedId` only for a handle grab (S3.4) — its presence is what distinguishes a
   *  resize gesture from a move gesture everywhere below. */
  let grabbedEdge: 'start' | 'end' | undefined;
  /** The bar the pointer actually landed on, set alongside `grabbedId` for a move grab only (#211).
   *  `drag`'s `start()` reads it once, to name the pick if this grab turns out to arm the Selection. */
  let grabbedBarId: BarId | undefined;
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
      // #211/#212: a move drag that just armed on a bar the Selection does not already hold selects
      // that bar's Entry before asking for the session — so the draft `session()` builds reads the
      // same Selection this write just made, and the drag moves only the grabbed Entry rather than
      // every Entry of whatever was selected before (or nothing at all). A resize grab is left
      // alone: `resizableEntryId` resolves off hover, not the Selection, so a handle grab selects
      // nothing here.
      if (grabbedEdge === undefined && grabbedBarId !== undefined) {
        const grabbedEntryId = entryIdOfBar(grabbedBarId);
        const selected = ctx.selection.entryIds();
        if (!selected.includes(grabbedEntryId)) {
          anchor = grabbedEntryId;
          ctx.selection.propose([grabbedEntryId]);
        }
      }
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
      grabbedBarId = undefined;
    },
    cancel(): void {
      session!.cancel();
      session = undefined;
      grabbedId = undefined;
      grabbedEdge = undefined;
      grabbedBarId = undefined;
    },
  });

  /** The range from the shift-anchor to `to`'s last member (#212, ADR 0010, ADR 0025). The range
   *  steps over Entries in the order the panes draw them: row by row. A row click names every
   *  selectable Entry the row owns, so that row's last Entry ends the range.
   *
   *  It ranges over Entries rather than whole rows so that a shift-click selects what the pointer
   *  crossed. Ranging over rows would select every Entry of every row the range touched, including
   *  the ones before the anchor and after the target inside those two end rows. */
  function selectRange(to: readonly EntryId[]): readonly EntryId[] {
    const order = ctx.selection.selectableEntriesInRowOrder();
    const fromIndex = anchor !== undefined ? order.indexOf(anchor) : -1;
    const toIndex = order.indexOf(to[to.length - 1]!);
    if (fromIndex === -1 || toIndex === -1) return to;
    const [lo, hi] = fromIndex <= toIndex ? [fromIndex, toIndex] : [toIndex, fromIndex];
    // No capability filter here: `selectableEntriesInRowOrder()` is already capability-filtered,
    // and the capability resolves once, in the shell (I14).
    return order.slice(lo, hi + 1);
  }

  function onPointerDown(e: PointerEvent): void {
    // #199/#205 (mouse path): a right-button pointerdown arms no gesture, so a right-click never
    // steals the pointer stream from a later primary-button drag.
    if (!isPrimaryButton(e)) return;
    // A drag only ever starts on a bar: a row hit arms nothing (D-S3-10's grid-row clause).
    const hit = ctx.hitTest({ x: e.clientX, y: e.clientY });
    const bar = hit?.kind === 'bar' ? hit : undefined;
    const entry = bar !== undefined ? ctx.entryFor(bar.barId) : undefined;
    if (entry !== undefined && bar?.edge !== undefined && ctx.can('resize', entry, bar.edge)) {
      grabbedId = entry.id;
      grabbedEdge = bar.edge;
      grabbedBarId = undefined;
    } else if (entry !== undefined && bar !== undefined && ctx.can('move', entry)) {
      grabbedId = entry.id;
      grabbedEdge = undefined;
      grabbedBarId = bar.barId;
    } else {
      grabbedId = undefined;
      grabbedEdge = undefined;
      grabbedBarId = undefined;
    }
    drag.down(e);
  }

  /** Pointer semantics shared by a timeline click and a grid-row click (D-S3-10, bug hunt: "grid row
   *  highlight and row click") — everything past "what did we hit". `clearOnMiss` is the one place
   *  the two surfaces differ: an empty timeline click clears the selection; a grid miss (a header
   *  row, padding, a twisty — `render/dom`'s `hitTest` already returns no hit for those) never does. */
  function selectFromHit(
    e: Pick<PointerEvent, 'shiftKey' | 'ctrlKey' | 'metaKey' | 'button'>,
    hit: EntryHit | undefined,
    clearOnMiss: boolean,
  ): void {
    // A grid miss (`clearOnMiss = false`, see the doc comment above) leaves the shift-anchor alone
    // too — only a genuine miss-clears-everything surface (the timeline) drops it here. A middle-click
    // (or any other non-clearing button) never clears either — see `isPrimaryButton`/`isRightClick`.
    if (hit === undefined || missesEveryEntry(hit)) {
      if (clearOnMiss && (isPrimaryButton(e) || isRightClick(e))) {
        anchor = undefined;
        if (ctx.selection.entryIds().length > 0) ctx.selection.propose([]);
      }
      return;
    }

    // Past the miss check, only a primary button may pick, replace, toggle, or range (`isPrimaryButton`).
    if (!isPrimaryButton(e)) return;

    // #434, I14: independent of `select` — a plain click still activates a capable Entry even when
    // its row/bar refuses `select` (`{ select: false, activate: true }` on a rollup row). Ctrl/Shift
    // modify the Selection instead of opening anything, so neither modifier activates.
    if (!e.shiftKey && !e.ctrlKey && !e.metaKey) {
      const subject = ctx.activation.subjectEntryOf(hit);
      if (subject !== undefined && ctx.can('activate', subject)) {
        ctx.activation.activate(subject, 'click', hit.kind);
      }
    }

    // #212: one hit resolves to a list of Entries — the pane picks the unit. A bar names its own
    // Entry; a row names every selectable Entry it owns. The rules below then run over the list as a
    // unit. An empty list means the hit landed on something no gesture may select, which writes
    // nothing and clears nothing.
    const targets = ctx.selection.selectableEntriesOf(hit);
    if (targets.length === 0) return;

    if (e.shiftKey) {
      const next = selectRange(targets);
      if (next.length > 0) ctx.selection.propose(next);
      return;
    }

    anchor = targets[0];

    if (e.ctrlKey || e.metaKey) {
      ctx.selection.propose(toggled(targets));
      return;
    }

    ctx.selection.propose(targets);
  }

  /** True when the hit stands for nothing the Dataset still holds — a stale Bar id, which is the
   *  same "nothing there" a miss reports. A row that exists but owns nothing selectable is not this:
   *  the pointer did land on a row, so an empty timeline's clear must not fire for it. */
  function missesEveryEntry(hit: EntryHit): boolean {
    return hit.kind === 'bar' && ctx.entryFor(hit.barId) === undefined;
  }

  /** Ctrl/⌘ moves the whole list at once: it removes the list when every member is already
   *  selected, else it adds the members that are missing (#185). */
  function toggled(targets: readonly EntryId[]): readonly EntryId[] {
    const current = ctx.selection.entryIds();
    if (targets.every((id) => current.includes(id))) {
      return current.filter((id) => !targets.includes(id));
    }
    return [...current, ...targets.filter((id) => !current.includes(id))];
  }

  function onPointerUp(e: PointerEvent): void {
    if (drag.up(e)) return; // was a drag — commit/cancel already ran inside pointer-gesture's callbacks
    // Every button reaches `selectFromHit`; the button and clearOnMiss checks live inside it.
    selectFromHit(e, ctx.hitTest({ x: e.clientX, y: e.clientY }), true);
  }

  /** The grid pane's own pointerup — never fed through `drag` (D-S3-19/22's move/resize machinery
   *  is armed only from a timeline `pointerdown`, `onPointerDown` below), so a row click can only
   *  ever be a click, never the start of a drag. */
  function onRowLayerPointerUp(e: PointerEvent): void {
    // The button check lives inside `selectFromHit` (its clearOnMiss=false leaves it a no-op on miss).
    selectFromHit(e, ctx.hitTest({ x: e.clientX, y: e.clientY }), false);
  }

  function onKeyDown(e: KeyboardEvent): void {
    if (e.key !== 'Escape') return;
    if (drag.escape()) return; // was dragging — cancelled, does not also clear the selection
    // #272/#273: a held async veto has no live drag left to cancel, so Escape ends the wait instead.
    if (ctx.discardHeldGesture()) return;
    anchor = undefined;
    if (ctx.selection.entryIds().length > 0) ctx.selection.propose([]);
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
    ctx.setHovered(hit?.kind === 'bar' ? hit.barId : undefined);
  }

  function onPointerLeave(): void {
    ctx.setHovered(undefined);
  }

  /** The grid pane's own hover feed. The timeline pane's `onPointerMove` above reports bars, and a
   *  bar already names its row; this reports the rows the timeline pane never sees — a row hovered
   *  anywhere along its label and cells, including the stretch past the last bar. */
  function onRowLayerPointerMove(e: PointerEvent): void {
    const hit = ctx.hitTest({ x: e.clientX, y: e.clientY });
    ctx.setHoveredRow(hit?.kind === 'row' ? hit.rowId : undefined);
  }

  function onRowLayerPointerLeave(): void {
    ctx.setHoveredRow(undefined);
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
  rowLayer.addEventListener('pointermove', onRowLayerPointerMove);
  rowLayer.addEventListener('pointerleave', onRowLayerPointerLeave);
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
      rowLayer.removeEventListener('pointermove', onRowLayerPointerMove);
      rowLayer.removeEventListener('pointerleave', onRowLayerPointerLeave);
      container.removeEventListener('keydown', onKeyDown);
      container.removeEventListener('mousedown', onMouseDown);
      container.removeEventListener('selectstart', onSelectStart);
    },
  };
}
