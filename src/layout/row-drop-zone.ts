// layout/ — which row a vertical drag sits over, and which third of it (plans/01 §4, D-C). Pure
// and DOM-free: a caller hands in content-y plus the row-height index `computeFrame` already
// keeps, and reads back a `RowDropZone`. `view/row-drop-target.ts` turns that zone into a Tree
// place; this file only answers "where is the pointer", never "what does that mean".

import type { RowHeightIndex } from './row-height-index.js';

/** Which third of a row the pointer is over. A `childrenAsSegments` row is `into` over its whole
 *  height — it has no before/after edge of its own, its children live inside it. */
export type RowDropSide = 'before' | 'into' | 'after';

/** Where a vertical drag's pointer sits, right now:
 *  - `sourceRow` — over the row the grabbed bar itself sits on. A drop here is a time-only move.
 *  - `row` — over some other row, in one of its thirds.
 *  - `belowLastRow` — past the bottom of the last row, or the plan is empty. */
export type RowDropZone =
  | { readonly kind: 'sourceRow' }
  | { readonly kind: 'row'; readonly rowIndex: number; readonly side: RowDropSide }
  | { readonly kind: 'belowLastRow' };

/** A dispatch a `.kind` compare reads through, never a bare string literal (`no-kind-literal`) —
 *  the same convention `rows/row-source.ts`'s `PLANNED_ROW_KIND` sets for this layer. Exported so a
 *  caller resolving a `RowDropZone` (`row-drop-target.ts`, `view/row-drop.ts`) dispatches on it the
 *  same way, rather than growing its own literal. */
export const ROW_DROP_ZONE_KIND = Object.freeze({
  sourceRow: 'sourceRow',
  row: 'row',
  belowLastRow: 'belowLastRow',
} as const satisfies Record<string, RowDropZone['kind']>);

/** How close the pointer must sit to the edge that faces the source row before leaving `sourceRow`
 *  counts as a real row change. Without this, a pointer sitting right at the source row's own edge
 *  flickers between `sourceRow` and the neighbour on sub-pixel jitter. */
export const ROW_CHANGE_THRESHOLD_PX = 4;

/** How far a before/into/after boundary the pointer just left must be crossed again before the
 *  side flips back — the standard hysteresis band that stops a pointer sitting on a boundary from
 *  flickering between two answers. Applies to the boundary inside one row, and to the boundary
 *  between two rows when the previous zone named the row on the other side of it. */
export const DROP_ZONE_HYSTERESIS_PX = 3;

export interface RowDropZoneInput {
  /** Content-y of the pointer, in the same space `heights` measures. */
  readonly y: number;
  /** The row the grabbed bar sits on — that row is always `sourceRow`, never `before`/`into`/`after`. */
  readonly sourceRowIndex: number;
  readonly heights: Pick<RowHeightIndex, 'indexAtY' | 'topAt' | 'heightAt' | 'totalHeight'>;
  readonly rowCount: number;
  /** True for a row whose children draw as bars on it rather than rows of their own
   *  (`childrenAsSegments`) — such a row has no before/after edge, it is `into` everywhere. */
  readonly takesWholeRowInto: (index: number) => boolean;
}

/** Reads the pointer's row drop zone, holding the previous answer through a jitter band so a
 *  caller that repaints on every `pointermove` does not flicker between two answers a pixel apart.
 *  Returns `previous` itself, by reference, when the zone did not change (I5: no allocation on an
 *  unchanged zone). */
export function rowDropZoneAt(input: RowDropZoneInput, previous: RowDropZone): RowDropZone {
  const { y, sourceRowIndex, heights, rowCount, takesWholeRowInto } = input;

  if (rowCount === 0 || y >= heights.totalHeight) {
    return sameZone(previous, { kind: 'belowLastRow' });
  }

  const rowIndex = heights.indexAtY(Math.max(y, 0));

  if (rowIndex === sourceRowIndex) {
    return sameZone(previous, { kind: 'sourceRow' });
  }

  const top = heights.topAt(rowIndex);
  const height = heights.heightAt(rowIndex);
  const offset = y - top;

  if (
    previous.kind === ROW_DROP_ZONE_KIND.sourceRow &&
    insideSourceDeadZone(rowIndex, sourceRowIndex, offset, height)
  ) {
    return previous;
  }

  if (
    previous.kind === ROW_DROP_ZONE_KIND.row &&
    previous.rowIndex !== rowIndex &&
    Math.abs(previous.rowIndex - rowIndex) === 1 &&
    Math.abs(y - heights.topAt(Math.max(previous.rowIndex, rowIndex))) < DROP_ZONE_HYSTERESIS_PX
  ) {
    return previous;
  }

  if (takesWholeRowInto(rowIndex)) {
    return sameZone(previous, { kind: 'row', rowIndex, side: 'into' });
  }

  const side =
    previous.kind === ROW_DROP_ZONE_KIND.row && previous.rowIndex === rowIndex
      ? sideWithHysteresis(offset, height, previous.side)
      : plainSide(offset, height);

  return sameZone(previous, { kind: 'row', rowIndex, side });
}

/** True while the pointer, having just left the source row, still sits within
 *  `ROW_CHANGE_THRESHOLD_PX` of the edge that faces it — the source row's own dead zone. */
function insideSourceDeadZone(
  rowIndex: number,
  sourceRowIndex: number,
  offset: number,
  height: number,
): boolean {
  if (rowIndex === sourceRowIndex + 1) return offset < ROW_CHANGE_THRESHOLD_PX;
  if (rowIndex === sourceRowIndex - 1) return height - offset < ROW_CHANGE_THRESHOLD_PX;
  return false;
}

/** Before/into/after by raw thirds, no hysteresis — used whenever the previous zone named a
 *  different row than the one the pointer now sits over. */
function plainSide(offset: number, height: number): RowDropSide {
  const beforeBoundary = 0.25 * height;
  const afterBoundary = 0.75 * height;
  if (offset < beforeBoundary) return 'before';
  if (offset >= afterBoundary) return 'after';
  return 'into';
}

/** Before/into/after by thirds, with the boundary next to `previousSide` moved
 *  `DROP_ZONE_HYSTERESIS_PX` toward the side the pointer would have to leave — so a pointer sitting
 *  on a boundary needs to cross it by that much before the answer actually flips. */
function sideWithHysteresis(offset: number, height: number, previousSide: RowDropSide): RowDropSide {
  const beforeBoundary = 0.25 * height;
  const afterBoundary = 0.75 * height;
  let effectiveBeforeBoundary = beforeBoundary;
  let effectiveAfterBoundary = afterBoundary;
  if (previousSide === 'before') {
    effectiveBeforeBoundary = beforeBoundary + DROP_ZONE_HYSTERESIS_PX;
  } else if (previousSide === 'into') {
    effectiveBeforeBoundary = beforeBoundary - DROP_ZONE_HYSTERESIS_PX;
    effectiveAfterBoundary = afterBoundary + DROP_ZONE_HYSTERESIS_PX;
  } else {
    effectiveAfterBoundary = afterBoundary - DROP_ZONE_HYSTERESIS_PX;
  }
  if (offset < effectiveBeforeBoundary) return 'before';
  if (offset >= effectiveAfterBoundary) return 'after';
  return 'into';
}

/** `next` unless it equals `previous`, in which case `previous` itself — the identity `rowDropZoneAt`
 *  promises callers that repaint on reference change (I5). */
function sameZone(previous: RowDropZone, next: RowDropZone): RowDropZone {
  return zonesEqual(previous, next) ? previous : next;
}

function zonesEqual(a: RowDropZone, b: RowDropZone): boolean {
  if (a.kind !== b.kind) return false;
  if (a.kind === ROW_DROP_ZONE_KIND.row && b.kind === ROW_DROP_ZONE_KIND.row) {
    return a.rowIndex === b.rowIndex && a.side === b.side;
  }
  return true;
}
