// interaction/ — resize and reorder pointer sequences for grid columns (S5.7, D-S5-18), built over
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

/** Pointerdown on `.fg-column-resizer` arms a resize; pointerdown anywhere else on `.fg-col-header`
 *  arms a reorder — `resizable`/`movable` (D-S5-18) refuse arming the same way `EntryGestureContext`'s
 *  own capability checks refuse a data gesture. */
export function attachColumnGestures(
  headerPane: HTMLElement,
  container: HTMLElement,
  ctx: ColumnGestureContext,
): Detachable {
  let grabbedKind: 'resize' | 'reorder' | undefined;
  let grabbedKey: FieldKey | undefined;
  let grabbedStartWidthPx = 0;
  let grabbedDropTargets: readonly DropTarget[] = [];
  // `pointer-gesture.ts` tracks at most one pointer at a time (`onPointerDown`'s "already dragging"
  // branch below refuses a second one), so this always names the pointer `grabbedKind` belongs to —
  // it lets `onPointerCancel` tell "my grab was interrupted" from "an unrelated pointer cancelled".
  let grabbedPointerId: number | undefined;

  // `pointer-gesture.ts` only calls `cancel()` for an armed drag (movement past the threshold) — an
  // Escape or pointercancel that lands before arming leaves `grabbedKind`/`grabbedKey` untouched at
  // that layer. Without this, the next pointerdown on a *different* grip would hit the "already
  // dragging" branch below and resize/reorder the wrong column using this stale grab.
  function clearGrabbedState(): void {
    grabbedKind = undefined;
    grabbedKey = undefined;
    grabbedPointerId = undefined;
  }

  const drag = createPointerGesture(headerPane, {
    start(): boolean {
      return grabbedKind !== undefined;
    },
    move(e, dxPx): void {
      if (grabbedKey === undefined) return;
      if (grabbedKind === 'resize') {
        const widthPx = Math.max(ctx.minColumnWidthPx(), grabbedStartWidthPx + dxPx);
        ctx.previewColumnWidth(grabbedKey, widthPx);
      } else if (grabbedKind === 'reorder') {
        ctx.previewColumnReorder({
          columnKey: grabbedKey,
          offsetPx: dxPx,
          beforeColumnKey: dropTargetAt(grabbedDropTargets, e.clientX),
        });
      }
    },
    commit(e, dxPx): void {
      if (grabbedKey === undefined) return;
      if (grabbedKind === 'resize') {
        const widthPx = Math.max(ctx.minColumnWidthPx(), grabbedStartWidthPx + dxPx);
        if (!ctx.commitColumnWidth(grabbedKey, widthPx)) ctx.cancelColumnResize();
      } else if (grabbedKind === 'reorder') {
        const before = dropTargetAt(grabbedDropTargets, e.clientX);
        if (!ctx.commitColumnReorder(grabbedKey, before)) ctx.cancelColumnReorder();
      }
      clearGrabbedState();
    },
    cancel(): void {
      if (grabbedKey !== undefined) {
        if (grabbedKind === 'resize') ctx.cancelColumnResize();
        else if (grabbedKind === 'reorder') ctx.cancelColumnReorder();
      }
      clearGrabbedState();
    },
  });

  function onPointerDown(e: PointerEvent): void {
    if (grabbedKind !== undefined) {
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
      grabbedKind = 'resize';
      grabbedKey = key;
      grabbedStartWidthPx = cell.getBoundingClientRect().width;
      grabbedPointerId = e.pointerId;
    } else if (!onGrip && ctx.isMovable(key)) {
      grabbedKind = 'reorder';
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
    // (D-S5-18/D-S5-26) — regardless of `resizable`/`movable`, since a fixed or pinned column can
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

  // B3: a plain click on a header cell sets "the focused header column" for `Shift+Arrow` (D-S5-18/
  // D-S5-26, `onPointerUp` above). JS focus is not the same as "the header still has the user's
  // attention" — a later pointerdown anywhere else in this Gantt (a bar, a body cell, empty timeline)
  // must clear it, the same posture a click on empty timeline already takes for the entry selection.
  function onContainerPointerDown(e: PointerEvent): void {
    const target = e.target instanceof Node ? e.target : null;
    if (target !== null && headerPane.contains(target)) return;
    ctx.setFocusedColumn(undefined);
  }

  // B6: `createPointerGesture` documents `pointercancel` as a cancel path (Escape's own sibling), but
  // nothing fed it — a browser cancel (touch interrupt, drag into a scrollbar) could leave
  // `grabbedKind` set and a live width/drop preview stuck until the next successful gesture or
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
