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

/** Header cells in their current DOM order — reading it fresh at every move keeps the drop
 *  computation correct across a reorder that already re-parented cells mid-drag (render/dom moves the
 *  grabbed header cell to follow the pointer). */
function headerCells(headerPane: HTMLElement): readonly HTMLElement[] {
  return Array.from(headerPane.querySelectorAll<HTMLElement>(HEADER_CELL_SELECTOR));
}

/** Which column key `clientX` would drop `draggedKey` before — `null` for "at the end". Compares
 *  against each other header cell's own midpoint, so the indicator flips exactly halfway across a
 *  neighbour rather than at its far edge. */
function dropTargetAt(cells: readonly HTMLElement[], draggedKey: FieldKey, clientX: number): FieldKey | null {
  for (const cell of cells) {
    const key = columnKeyOf(cell);
    if (key === undefined || key === draggedKey) continue;
    const rect = cell.getBoundingClientRect();
    if (clientX < rect.left + rect.width / 2) return key;
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
        ctx.previewColumnDrop(dropTargetAt(headerCells(headerPane), grabbedKey, e.clientX));
      }
    },
    commit(e, dxPx): void {
      if (grabbedKey === undefined) return;
      if (grabbedKind === 'resize') {
        const widthPx = Math.max(ctx.minColumnWidthPx(), grabbedStartWidthPx + dxPx);
        if (!ctx.commitColumnWidth(grabbedKey, widthPx))
          ctx.previewColumnWidth(grabbedKey, grabbedStartWidthPx);
      } else if (grabbedKind === 'reorder') {
        const before = dropTargetAt(headerCells(headerPane), grabbedKey, e.clientX);
        ctx.previewColumnDrop(null);
        ctx.commitColumnReorder(grabbedKey, before);
      }
      grabbedKind = undefined;
      grabbedKey = undefined;
    },
    cancel(): void {
      if (grabbedKey !== undefined) {
        if (grabbedKind === 'resize') ctx.previewColumnWidth(grabbedKey, grabbedStartWidthPx);
        else if (grabbedKind === 'reorder') ctx.previewColumnDrop(null);
      }
      grabbedKind = undefined;
      grabbedKey = undefined;
    },
  });

  function onPointerDown(e: PointerEvent): void {
    const target = e.target instanceof Element ? e.target : null;
    const cell = headerCellFor(target);
    const key = cell !== undefined ? columnKeyOf(cell) : undefined;
    const onGrip = target?.closest(RESIZER_SELECTOR) != null;
    if (cell === undefined || key === undefined) {
      grabbedKind = undefined;
      grabbedKey = undefined;
    } else if (onGrip && ctx.isResizable(key)) {
      grabbedKind = 'resize';
      grabbedKey = key;
      grabbedStartWidthPx = cell.getBoundingClientRect().width;
    } else if (!onGrip && ctx.isMovable(key)) {
      grabbedKind = 'reorder';
      grabbedKey = key;
    } else {
      grabbedKind = undefined;
      grabbedKey = undefined;
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
    if (e.key === 'Escape') drag.escape();
  }

  headerPane.addEventListener('pointerdown', onPointerDown);
  headerPane.addEventListener('pointermove', onPointerMove);
  headerPane.addEventListener('pointerup', onPointerUp);
  container.addEventListener('keydown', onKeyDown);

  return {
    detach(): void {
      drag.detach();
      headerPane.removeEventListener('pointerdown', onPointerDown);
      headerPane.removeEventListener('pointermove', onPointerMove);
      headerPane.removeEventListener('pointerup', onPointerUp);
      container.removeEventListener('keydown', onKeyDown);
    },
  };
}
