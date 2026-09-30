// interaction/ — the one pointer stream over the bar layer (plans/01 §9, `plans/03` §S3). A
// pointerdown that becomes a drag never runs the click/selection path below — every pointerup that
// `createPointerGesture.up()` reports as a drag skips `selectFromHit` entirely.
//
// Writes on pointerdown only once (#211): when a move drag actually arms (the threshold is
// crossed) on a bar whose Entry is not already in the Selection, `drag`'s own `start()` proposes the
// Selection right there, so the pick a picked-Entry drag reads is never stale relative to what it
// grabbed — see the decision table's "grabbed bar not in the Selection" row in
// `plans/s5-extensibility-and-editing/spec-211-gesture-units.md` §4. A gesture that never crosses the
// threshold (a plain click) still resolves through `selectFromHit` on pointerup, unchanged; `mousedown`
// itself still writes nothing — it exists only so a double-click cannot start a native text range.

import type { Entry, EntryId, BarId } from '../model/index.js';
import { entryIdOfBar } from '../model/index.js';
import { createPointerGesture, isPrimaryButton } from './pointer-gesture.js';
import type { DragAxis } from './pointer-gesture.js';
import { createRowReorderDrag } from './row-reorder-drag.js';
import type {
  Detachable,
  EntryGestureContext,
  EntryGesture,
  EntryGestureSession,
  EntryHit,
} from '../view/index.js';

export type { EntryGestureContext, EntryGesture, DraftOptions, EntryHit } from '../view/index.js';

/** Is this button event a right-click? A right-click still triggers the empty-timeline clear
 *  (#199/#205 follow-up). A background right-click opens a menu. A
 *  surviving highlight would misstate what the menu acts on. A middle-click opens no menu, so it
 *  does not clear. */
function isRightClick(e: Pick<PointerEvent, 'button'>): boolean {
  return e.button === 2;
}

/** Pointer semantics: plain click replaces, ctrl/⌘-click toggles, shift-click extends over
 *  `selectableEntriesInRowOrder()`, a click on empty timeline clears, Escape clears. A right-click is
 *  a click for the clearing rule too (#199/#205 follow-up): it clears the same empty timeline, but it
 *  never picks, replaces, toggles, or ranges — a right-click that lands on a bar or a row leaves the
 *  Selection for `context-menu.ts` to read as-is. A click on an incapable bar leaves
 *  the selection untouched (it is not an empty-timeline clear); ctrl/⌘-click on one is a no-op;
 *  shift-click omits incapable entries from the range and writes nothing if that empties the range.
 *
 *  Move (S3.3): a pointerdown on a `move`-capable bar arms a drag once the pointer clears
 *  the drag threshold; every subsequent move previews the draft (`session().preview`) at full pixel
 *  resolution — never snapped — so the grabbed spot on the bar tracks the cursor with no drift, and
 *  pointerup commits the snapped draft (`session().commit`) through `beforeEntryMove` → one
 *  transaction → `entryMove`. Escape mid-drag clears the preview and commits nothing (`[S3-A2]`) —
 *  the store was never touched.
 *
 *  Resize (S3.4): a pointerdown on the shared resize-handle pair (`ctx.hitTest`'s `edge`)
 *  arms the same drag machinery with a `{ kind: 'resize', edge }` gesture instead — one pointer
 *  stream, one state machine, only the grabbed gesture shape differs.
 *
 *  Grid row click (bug hunt, "grid row highlight and row click"): `rowLayer` gets its own, narrower
 *  pointerup listener — a row click selects with the same rules as a bar click (plain/ctrl/shift),
 *  and a miss on the grid never clears (only an empty *timeline* click does).
 *
 *  Row reorder (#602): `rowLayer` also runs its own drag, `row-reorder-drag.ts`'s `RowReorderDrag`
 *  — a second pointer stream, separate from `drag` above, so a row grab and a bar grab never
 *  compete for the same one. `rowReorder.up()` runs ahead of the row click path, so an armed drag's
 *  pointerup skips it, the same way `drag.up()` skips it on the timeline pane. */
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

  /** #434: the activation candidate `selectFromHit` names on `pointerup`, held until the native
   *  `click` that always follows it in the same synchronous dispatch. `PointerEvent.detail` never
   *  counts clicks (Chromium always reports `0` there); `MouseEvent.detail` on `click` does (`1`,
   *  then `2` for a double-click's second one — the browser's own count, no timer needed). So
   *  `selectFromHit` only names *what* would activate; `onClick` below reads `event.detail` off the
   *  one event that actually carries it, and fires. A pointerup that never reaches `selectFromHit`
   *  (a drag release, `onPointerUp`'s own `drag.up(e)` early return) leaves this `undefined`, so the
   *  `click` a completed drag still dispatches confirms nothing. */
  let pendingActivation: { entry: Entry; target: 'bar' | 'row' } | undefined;

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

  /** True once a bar drag asked for its session and got none — the locked axis's capability is off.
   *  The rest of that drag then does nothing, and `move()` stops asking. */
  let sessionRefused = false;

  /** A resize arms on its edge alone, so it reads no axis. A bar drag arms on `move` or `reorder`,
   *  and the axis lock picks one: a row-axis drag asks `reorder`, a time-axis drag asks `move`. */
  function gestureFor(axis: DragAxis | undefined): EntryGesture {
    if (grabbedEdge !== undefined) return { kind: 'resize', edge: grabbedEdge };
    return axis === 'y' ? { kind: 'reorder' } : { kind: 'move' };
  }

  /** #211/#212: a bar drag whose session arms on a bar the Selection does not already hold selects
   *  that bar's Entry first — so the draft `session()` builds reads the same Selection this write
   *  just made, and the drag moves only the grabbed Entry rather than every Entry of whatever was
   *  selected before (or nothing at all). A resize grab is left alone: `resizableEntryId` resolves
   *  off hover, not the Selection, so a handle grab selects nothing here. */
  function selectGrabbedBar(): void {
    if (grabbedEdge !== undefined || grabbedBarId === undefined) return;
    const grabbedEntryId = entryIdOfBar(grabbedBarId);
    if (ctx.selection.entryIds().includes(grabbedEntryId)) return;
    anchor = grabbedEntryId;
    ctx.selection.propose([grabbedEntryId]);
  }

  function armSession(axis: DragAxis | undefined): void {
    selectGrabbedBar();
    session = ctx.session(grabbedId!, gestureFor(axis));
    sessionRefused = session === undefined;
  }

  /** The last row-axis pointer reading, so a scroll step can preview again with no pointer move. */
  let lastClientY = 0;
  let lastCursorX = 0;

  function previewRowAxis(): void {
    session?.preview(0, {
      suspendSnap: true,
      cursorX: lastCursorX,
      contentY: ctx.contentYAtClientY(lastClientY),
    });
  }

  function endGrab(): void {
    ctx.rowEdgeScroll.stop();
    session = undefined;
    sessionRefused = false;
    grabbedId = undefined;
    grabbedEdge = undefined;
    grabbedBarId = undefined;
  }

  const drag = createPointerGesture(
    pane,
    {
      start(): boolean {
        if (grabbedId === undefined) return false;
        // A resize reads no axis, so it asks for its session now. A bar drag asks in `move()`, once
        // the axis is known. A refused bar session there ends in no drag and keeps the Selection.
        if (grabbedEdge !== undefined) armSession(undefined);
        return grabbedEdge === undefined || session !== undefined;
      },
      // `dyPx` only tells travel from no travel. A row drop reads the pointer's content-y instead —
      // the row under the pointer, not how far it moved. `elementFromPoint` would read the bar itself, since the bar tracks the
      // pointer during the drag.
      //
      // #425 axis lock: the owner's ruling ("if you start dragging vertically it only allows
      // vertical, and vice versa") only bears on a move gesture — a resize already reads nothing
      // but its own edge's horizontal travel, so `grabbedEdge` (set only for a resize) opts it out.
      // A row-axis move zeroes `dxPx` (the bar's dates hold still) and omits `contentY` when the
      // axis is time instead (`options.contentY === undefined` is `dropFor`'s own "no row drop" read,
      // `view/gesture-pipeline.ts`).
      move(e, dxPx, dyPx, axis): void {
        // The live preview always tracks the pointer at full resolution (never quantized to a snap
        // unit) so the grabbed spot on the bar never drifts from the cursor mid-drag. Snapping still
        // applies to what actually gets written — see commit() below — this only affects what paints
        // while the gesture is in flight. Cursor line x and row-drop y are both content space: pane-local
        // offset plus the bound scroll, never element.scrollLeft/scrollTop (I12).
        // The rect only serves `offsetX`: content-y goes straight through `clientY` now, since both
        // panes share one row geometry and the door reads the pane top itself.
        // A touch long-press arms with no travel, so its axis is not known yet. The session waits
        // for the first travel, or a still finger would lock the drag to the wrong axis.
        if (session === undefined && !sessionRefused && (dxPx !== 0 || dyPx !== 0)) armSession(axis);
        if (session === undefined) return;
        const rect = pane.getBoundingClientRect();
        const offsetX = e.clientX - rect.left;
        const rowAxisLocked = grabbedEdge === undefined && axis === 'y';
        const cursorX = ctx.contentXAtPaneOffset(offsetX);
        if (!rowAxisLocked) {
          session.preview(dxPx, { suspendSnap: true, cursorX });
          return;
        }
        lastClientY = e.clientY;
        lastCursorX = cursorX;
        previewRowAxis();
        // A row-axis drag held near the rows' edge scrolls them, so a drop can reach an off-screen row.
        ctx.rowEdgeScroll.follow(e.clientY, previewRowAxis);
      },
      commit(e, dxPx, _dyPx, axis): void {
        // The committed value snaps to the preset's tick unit unless Alt held it off for fine
        // placement — this is the one place snapping actually lands, now that move() above
        // always previews raw. The row drop itself reads the same content-y move() already resolved,
        // so a drag that ends over row 3 commits into row 3 even where the pointer never fires
        // another move first.
        const rowAxisLocked = grabbedEdge === undefined && axis === 'y';
        void session?.commit(rowAxisLocked ? 0 : dxPx, {
          ...(e.altKey ? { suspendSnap: true } : undefined),
          ...(rowAxisLocked ? { contentY: ctx.contentYAtClientY(e.clientY) } : undefined),
        });
        endGrab();
      },
      cancel(): void {
        session?.cancel();
        endGrab();
      },
    },
    { arm: 'xy' },
  ); // #425: a straight-down pull must arm — a bar move can lock to the row axis.

  /** #602: what a row grab that arms selects, when its subject is not already in the Selection —
   *  the same #211 rule the bar drag's own `start()` runs, spelled out for `row-reorder-drag.ts` to
   *  call, since it holds no `anchor` of its own. */
  function selectGrabbedRow(hit: EntryHit): void {
    const targets = ctx.selection.selectableEntriesOf(hit);
    if (targets.length > 0) {
      anchor = targets[0];
      ctx.selection.propose(targets);
    }
  }

  const rowReorder = createRowReorderDrag(rowLayer, ctx, selectGrabbedRow);

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
    // #434: a candidate lives for exactly one pointer sequence. Clearing here — before this
    // pointerdown's own stream can name a new one — catches every way the last sequence's `click`
    // never came: a `pointercancel`, a touch the browser turned into a scroll, or a `click` target
    // outside `container`.
    pendingActivation = undefined;
    // #199/#205 (mouse path): a right-button pointerdown arms no gesture, so a right-click never
    // steals the pointer stream from a later primary-button drag.
    if (!isPrimaryButton(e)) return;
    // A drag only ever starts on a bar: a row hit arms nothing.
    const hit = ctx.hitTest({ x: e.clientX, y: e.clientY });
    const bar = hit?.kind === 'bar' ? hit : undefined;
    sessionRefused = false;
    const entry = bar !== undefined ? ctx.entryFor(bar.barId) : undefined;
    if (entry !== undefined && bar?.edge !== undefined && ctx.can('resize', entry, bar.edge)) {
      grabbedId = entry.id;
      grabbedEdge = bar.edge;
      grabbedBarId = undefined;
    } else if (
      entry !== undefined &&
      bar !== undefined &&
      (ctx.can('move', entry) || ctx.can('reorder', entry))
    ) {
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

  /** Pointer semantics shared by a timeline click and a grid-row click (bug hunt: "grid row
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
      // #434: a miss never activates, so any candidate an earlier, unconfirmed pointerup left
      // pending must not survive to confirm on this miss's own `click`.
      pendingActivation = undefined;
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
    // modify the Selection instead of opening anything, so neither modifier activates. This only
    // *names* the candidate — `onClick` below confirms it once the native `click` that always
    // follows this `pointerup` carries the real click count (see `pendingActivation`'s own comment).
    // Cleared unconditionally first: a hit that is not a miss but also not activate-capable (a
    // modifier held, or the row/bar itself refuses) must drop an older, still-unconfirmed candidate
    // too, not just leave it for this hit's own `click` to wrongly confirm.
    pendingActivation = undefined;
    if (!e.shiftKey && !e.ctrlKey && !e.metaKey) {
      const subject = ctx.subjectEntryOf(hit);
      if (subject !== undefined && ctx.can('activate', subject)) {
        pendingActivation = { entry: subject, target: hit.kind };
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

  /** The grid pane's own pointerup — a row click when `rowReorder` never armed, an armed row
   *  reorder's commit when it did (#602: `rowReorder.up()` runs `commit`/`cancel` inside its own
   *  callbacks, the same way `drag.up()` does on the timeline pane, before this ever reaches the
   *  click path). */
  function onRowLayerPointerUp(e: PointerEvent): void {
    if (rowReorder.up(e)) return; // was a row drag — already committed
    // The button check lives inside `selectFromHit` (its clearOnMiss=false leaves it a no-op on miss).
    selectFromHit(e, ctx.hitTest({ x: e.clientX, y: e.clientY }), false);
  }

  function onKeyDown(e: KeyboardEvent): void {
    if (e.key !== 'Escape') return;
    const barCancelled = drag.escape();
    const rowCancelled = rowReorder.escape(); // #602: run both, so neither keeps stale state
    if (barCancelled || rowCancelled) return; // was dragging — cancelled, does not also clear the selection
    // #272/#273: a held async veto has no live drag left to cancel, so Escape ends the wait instead.
    if (ctx.discardHeldGesture()) return;
    anchor = undefined;
    if (ctx.selection.entryIds().length > 0) ctx.selection.propose([]);
  }

  /** #434: confirms `pendingActivation` with the click count the browser's own `click` event
   *  carries (`e.detail`) — see that field's own doc comment for why `pointerup` cannot read this
   *  itself. Runs on `container` so one listener covers both the timeline pane's bars/rows and the
   *  grid pane's own row layer. A `click` the browser dispatches with nothing pending (a drag
   *  release, or a miss) is a no-op — `pendingActivation` is `undefined` there. */
  function onClick(e: MouseEvent): void {
    const pending = pendingActivation;
    pendingActivation = undefined;
    if (pending === undefined) return;
    ctx.activation.activateFromClick(pending.entry, e.detail, pending.target);
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

  /** Reports the raw hit under the pointer on every move (the `pointerAt` precedent a step
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
    rowReorder.move(e);
    const hit = ctx.hitTest({ x: e.clientX, y: e.clientY });
    ctx.setHoveredRow(hit?.kind === 'row' ? hit.rowId : undefined);
  }

  function onRowLayerPointerLeave(): void {
    ctx.setHoveredRow(undefined);
  }

  // Bug hunt B6: a browser-issued cancel (touch interrupt, drag into a scrollbar) has no other path
  // to `cancel()` — Escape's own `drag.escape()` needs a keydown that a cancelled touch never sends.
  function onPointerCancel(e: PointerEvent): void {
    // #434: a cancelled pointer sequence sends no `click`, so a candidate `selectFromHit` named on
    // an earlier pointerup within this same sequence must not outlive it.
    pendingActivation = undefined;
    drag.pointercancel(e);
  }

  /** #434: a candidate `onRowLayerPointerUp` (through `selectFromHit`) named on an earlier
   *  pointerup must not outlive a cancelled or superseded row-layer sequence — the same clear
   *  `onPointerDown`/`onPointerCancel` give `pane` above. #602: this pointerdown also feeds
   *  `rowReorder`, which grabs the row under it when it may reorder. */
  function onRowLayerPointerDown(e: PointerEvent): void {
    pendingActivation = undefined;
    rowReorder.down(e);
  }

  function onRowLayerPointerCancel(e: PointerEvent): void {
    pendingActivation = undefined;
    rowReorder.pointercancel(e);
  }

  /** #602: registered `{ passive: false }` — a touch long-press that armed a reorder must stop the
   *  browser's own page pan, or the finger scrolls the page instead of dragging the row. */
  function onRowLayerTouchMove(e: TouchEvent): void {
    rowReorder.touchmove(e);
  }

  pane.addEventListener('pointerdown', onPointerDown);
  pane.addEventListener('pointerup', onPointerUp);
  pane.addEventListener('pointermove', onPointerMove);
  pane.addEventListener('pointerleave', onPointerLeave);
  pane.addEventListener('pointercancel', onPointerCancel);
  rowLayer.addEventListener('pointerdown', onRowLayerPointerDown);
  rowLayer.addEventListener('pointerup', onRowLayerPointerUp);
  rowLayer.addEventListener('pointermove', onRowLayerPointerMove);
  rowLayer.addEventListener('pointerleave', onRowLayerPointerLeave);
  rowLayer.addEventListener('pointercancel', onRowLayerPointerCancel);
  rowLayer.addEventListener('touchmove', onRowLayerTouchMove, { passive: false });
  container.addEventListener('keydown', onKeyDown);
  container.addEventListener('mousedown', onMouseDown);
  container.addEventListener('selectstart', onSelectStart);
  container.addEventListener('click', onClick);

  return {
    detach(): void {
      ctx.rowEdgeScroll.stop();
      drag.detach();
      rowReorder.detach();
      pane.removeEventListener('pointerdown', onPointerDown);
      pane.removeEventListener('pointerup', onPointerUp);
      pane.removeEventListener('pointermove', onPointerMove);
      pane.removeEventListener('pointerleave', onPointerLeave);
      pane.removeEventListener('pointercancel', onPointerCancel);
      rowLayer.removeEventListener('pointerdown', onRowLayerPointerDown);
      rowLayer.removeEventListener('pointerup', onRowLayerPointerUp);
      rowLayer.removeEventListener('pointermove', onRowLayerPointerMove);
      rowLayer.removeEventListener('pointerleave', onRowLayerPointerLeave);
      rowLayer.removeEventListener('pointercancel', onRowLayerPointerCancel);
      rowLayer.removeEventListener('touchmove', onRowLayerTouchMove);
      container.removeEventListener('keydown', onKeyDown);
      container.removeEventListener('mousedown', onMouseDown);
      container.removeEventListener('selectstart', onSelectStart);
      container.removeEventListener('click', onClick);
    },
  };
}
