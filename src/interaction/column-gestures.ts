// interaction/ — resize and reorder pointer sequences for grid columns (S5.7), built over
// the same `createPointerGesture` controller `entry-gestures.ts` already drives. Column state is
// Gantt view state, never Dataset data (ADR 0005) — this file commits nothing to `data/`; every
// commit routes through `ColumnGestureContext`, `GanttShell`'s one place for the `gridColumns`
// sequence. One pointer stream, one state machine, only the grabbed gesture (resize vs. reorder)
// differs — the same shape `entry-gestures.ts`'s move/resize split already uses.

import { createPointerGesture } from './pointer-gesture.js';
import type { Detachable, ColumnGestureContext } from '../view/index.js';
import type { FieldKey } from '../model/index.js';

const RESIZER_SELECTOR = '.fg-column-resizer';
const HEADER_CELL_SELECTOR = '.fg-col-header';

function headerCellFor(el: Element | null): HTMLElement | undefined {
  return el?.closest<HTMLElement>(HEADER_CELL_SELECTOR) ?? undefined;
}

function columnKeyOf(cell: HTMLElement): FieldKey | undefined {
  return cell.dataset['field'];
}

interface DropTarget {
  key: FieldKey;
  midX: number;
}

/** Every *other* header cell's key and horizontal midpoint, read once when a reorder arms (I5: a
 *  prebuilt index, not a per-move DOM query) — column order and width do not change over the course
 *  of a reorder drag, only the drop indicator does, so one `querySelectorAll` + one
 *  `getBoundingClientRect` per cell at arm time is enough for the whole gesture, not one pair per
 *  `pointermove`. Excludes `draggedKey` itself: a column cannot drop before/after its own cell.
 *  The grabbed cell follows the pointer by transform alone (#140) — it keeps its slot in the header's
 *  flex flow, so no neighbour moves and this snapshot stays true for the whole gesture. Revisit if a
 *  drag ever re-parents that cell instead: that would reflow every other cell's rect mid-drag. */
function computeDropTargets(headerPane: HTMLElement, draggedKey: FieldKey): readonly DropTarget[] {
  const targets: DropTarget[] = [];
  for (const cell of Array.from(headerPane.querySelectorAll<HTMLElement>(HEADER_CELL_SELECTOR))) {
    const key = columnKeyOf(cell);
    if (key === undefined || key === draggedKey) continue;
    const rect = cell.getBoundingClientRect();
    targets.push({ key, midX: rect.left + rect.width / 2 });
  }
  return targets;
}

/** Which column key `clientX` would drop before — `null` for "at the end". Compares against each
 *  target's own midpoint (`computeDropTargets`), so the indicator flips exactly halfway across a
 *  neighbour rather than at its far edge. */
function dropTargetAt(targets: readonly DropTarget[], clientX: number): FieldKey | null {
  for (const target of targets) {
    if (clientX < target.midX) return target.key;
  }
  return null;
}

/** One column gesture's three moves. `resize` and `reorder` differ in exactly these three and in
 *  nothing else, so the pointer state machine below holds one grabbed gesture. A `pointermove`
 *  previews, a `pointerup` commits, and an Escape or a veto cancels. `commit` reports whether the
 *  commit landed; the caller cancels when it did not ("a veto restores the state the drag
 *  started from"). `clientX` is the pointer's page position, which only the reorder drop indicator
 *  reads. */
interface ColumnGesture {
  preview(key: FieldKey, dxPx: number, clientX: number): void;
  commit(key: FieldKey, dxPx: number, clientX: number): boolean;
  cancel(): void;
}

/** Pointerdown on `.fg-column-resizer` arms a resize; pointerdown anywhere else on `.fg-col-header`
 *  arms a reorder — `resizable`/`movable` refuse arming the same way `EntryGestureContext`'s
 *  own capability checks refuse a data gesture. */
export function attachColumnGestures(
  headerPane: HTMLElement,
  container: HTMLElement,
  ctx: ColumnGestureContext,
): Detachable {
  let grabbedGesture: ColumnGesture | undefined;
  let grabbedKey: FieldKey | undefined;
  let grabbedStartWidthPx = 0;
  let grabbedDropTargets: readonly DropTarget[] = [];
  // `pointer-gesture.ts` tracks at most one pointer at a time (`onPointerDown`'s "already dragging"
  // branch below refuses a second one), so this always names the pointer `grabbedGesture` belongs to
  // — it lets `onPointerCancel` tell "my grab was interrupted" from "an unrelated pointer cancelled".
  let grabbedPointerId: number | undefined;

  // `pointer-gesture.ts` only calls `cancel()` for an armed drag (movement past the threshold) — an
  // Escape or pointercancel that lands before arming leaves `grabbedGesture`/`grabbedKey` untouched
  // at that layer. Without this, the next pointerdown on a *different* grip would hit the "already
  // dragging" branch below and resize/reorder the wrong column using this stale grab.
  function clearGrabbedState(): void {
    grabbedGesture = undefined;
    grabbedKey = undefined;
    grabbedPointerId = undefined;
  }

  /** The width a resize is asking for, from where the grabbed cell started and how far the pointer
   *  has travelled, floored by the same `--fg-column-min-width` a keyboard step honours. */
  function widthFrom(dxPx: number): number {
    return Math.max(ctx.minColumnWidthPx(), grabbedStartWidthPx + dxPx);
  }

  const resizeGesture: ColumnGesture = {
    preview: (key, dxPx) => ctx.previewColumnWidth(key, widthFrom(dxPx)),
    commit: (key, dxPx) => ctx.commitColumnWidth(key, widthFrom(dxPx)),
    cancel: () => ctx.cancelColumnResize(),
  };

  const reorderGesture: ColumnGesture = {
    preview: (key, dxPx, clientX) =>
      ctx.previewColumnReorder({
        columnKey: key,
        offsetPx: dxPx,
        beforeColumnKey: dropTargetAt(grabbedDropTargets, clientX),
      }),
    commit: (key, _dxPx, clientX) => ctx.commitColumnReorder(key, dropTargetAt(grabbedDropTargets, clientX)),
    cancel: () => ctx.cancelColumnReorder(),
  };

  const drag = createPointerGesture(headerPane, {
    start(): boolean {
      return grabbedGesture !== undefined;
    },
    move(e, dxPx): void {
      if (grabbedKey === undefined) return;
      grabbedGesture?.preview(grabbedKey, dxPx, e.clientX);
    },
    commit(e, dxPx): void {
      if (grabbedKey === undefined || grabbedGesture === undefined) return;
      if (!grabbedGesture.commit(grabbedKey, dxPx, e.clientX)) grabbedGesture.cancel();
      clearGrabbedState();
    },
    cancel(): void {
      if (grabbedKey !== undefined) grabbedGesture?.cancel();
      clearGrabbedState();
    },
  });

  function onPointerDown(e: PointerEvent): void {
    if (grabbedGesture !== undefined) {
      // A second pointer went down while a column drag is already tracked (e.g. two-finger touch on
      // the header) — `drag`'s own `down()` already refuses a second pointer ("one gesture at a
      // time"), so the first pointer's grabbed state must not be overwritten or cleared either.
      drag.down(e);
      return;
    }
    const target = e.target instanceof Element ? e.target : null;
    const cell = headerCellFor(target);
    const key = cell !== undefined ? columnKeyOf(cell) : undefined;
    const onGrip = target?.closest(RESIZER_SELECTOR) != null;
    if (cell === undefined || key === undefined) {
      clearGrabbedState();
    } else if (onGrip && ctx.isResizable(key)) {
      grabbedGesture = resizeGesture;
      grabbedKey = key;
      grabbedStartWidthPx = cell.getBoundingClientRect().width;
      grabbedPointerId = e.pointerId;
    } else if (!onGrip && ctx.isMovable(key)) {
      grabbedGesture = reorderGesture;
      grabbedKey = key;
      grabbedDropTargets = computeDropTargets(headerPane, key);
      grabbedPointerId = e.pointerId;
    } else {
      clearGrabbedState();
    }
    drag.down(e);
  }

  function onPointerMove(e: PointerEvent): void {
    drag.move(e);
  }

  function onPointerUp(e: PointerEvent): void {
    if (drag.up(e)) return; // was a drag — commit/cancel already ran inside pointer-gesture's callbacks
    // A plain click (no drag armed): sets the "focused" header cell for `Alt+Arrow`/`Shift+Arrow`
    // — regardless of `resizable`/`movable`, since a fixed or pinned column can
    // still be the command target even though both chords will decline for it.
    const target = e.target instanceof Element ? e.target : null;
    const cell = headerCellFor(target);
    ctx.setFocusedColumn(cell !== undefined ? columnKeyOf(cell) : undefined);
  }

  function onKeyDown(e: KeyboardEvent): void {
    if (e.key !== 'Escape') return;
    const wasArmed = drag.escape();
    // An unarmed Escape does not run `cancel()` above — clear the grab here too, or the next
    // pointerdown on a different grip would reuse this stale grab (see `clearGrabbedState`).
    clearGrabbedState();
    // A column drag was cancelled — swallow the key so it does not also reach
    // `entry-gestures.ts`'s own Escape handler (same container, sibling `keydown` listener) and clear
    // the entry selection as a side effect of dismissing an unrelated gesture.
    if (wasArmed) e.stopImmediatePropagation();
  }

  // B3: a plain click on a header cell sets "the focused header column" for `Shift+Arrow`
  // (`onPointerUp` above). JS focus is not the same as "the header still has the user's
  // attention" — a later pointerdown anywhere else in this Gantt (a bar, a body cell, empty timeline)
  // must clear it, the same posture a click on empty timeline already takes for the entry selection.
  function onContainerPointerDown(e: PointerEvent): void {
    const target = e.target instanceof Node ? e.target : null;
    if (target !== null && headerPane.contains(target)) return;
    ctx.setFocusedColumn(undefined);
  }

  // B6: `createPointerGesture` documents `pointercancel` as a cancel path (Escape's own sibling), but
  // nothing fed it — a browser cancel (touch interrupt, drag into a scrollbar) could leave
  // `grabbedGesture` set and a live width/drop preview stuck until the next successful gesture or
  // Escape. Only `pointerup`/`pointermove` carry `pointerId`-scoped state today; a bare `cancel()`
  // call mirrors `escape()`'s own shape without needing one.
  function onPointerCancel(e: PointerEvent): void {
    drag.pointercancel(e);
    // Same unarmed-cancel gap as `onKeyDown`: `pointercancel` only runs `cancel()` above once armed.
    // Gate on `grabbedPointerId` (not just "some grab is pending") so an unrelated pointer's cancel
    // does not wipe out a grab this event has nothing to do with.
    if (e.pointerId === grabbedPointerId) clearGrabbedState();
  }

  headerPane.addEventListener('pointerdown', onPointerDown);
  headerPane.addEventListener('pointermove', onPointerMove);
  headerPane.addEventListener('pointerup', onPointerUp);
  headerPane.addEventListener('pointercancel', onPointerCancel);
  container.addEventListener('pointerdown', onContainerPointerDown);
  container.addEventListener('keydown', onKeyDown);

  return {
    detach(): void {
      drag.detach();
      headerPane.removeEventListener('pointerdown', onPointerDown);
      headerPane.removeEventListener('pointermove', onPointerMove);
      headerPane.removeEventListener('pointerup', onPointerUp);
      headerPane.removeEventListener('pointercancel', onPointerCancel);
      container.removeEventListener('pointerdown', onContainerPointerDown);
      container.removeEventListener('keydown', onKeyDown);
    },
  };
}
