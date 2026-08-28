// layout/ owns the layout pass and whatever that pass must remember between renders (plans/01 §4,
// D-C). `computeFrame` is pure and stateless by design; a Gantt renders many frames over the same
// entries, and `PrefixSumHeightIndex` exists precisely so "top of row i" is O(log n) ACROSS those
// renders (#47) — which a fresh index per pass throws away. `FrameLayout` is where that memory
// lives, so that no caller has to hold it: a caller states what to draw, and the index, its cache
// key and its invalidation never cross the seam into `view/`.

import { computeFrame } from './frame.js';
import type { GeometryFrame, LayoutInput } from './frame.js';
import { PrefixSumHeightIndex } from './row-height-index.js';
import type { RowHeightIndex } from './row-height-index.js';

/** One Gantt's layout pass, with the row-height index kept alive between passes. One instance per
 * Gantt: the cached index describes that Gantt's rows, and nothing about it is shareable. */
export class FrameLayout {
  #heights: RowHeightIndex | undefined;
  /** The two inputs the cached index is built from. Row heights are uniform today, so they are the
   * whole invalidation surface; S5's variable per-row heights bring `invalidateFrom` calls here —
   * inside `layout/`, where the height index and its tests already are. */
  #rowCount = -1;
  #rowHeight = -1;
  /** Bumped whenever `#heightsFor` builds a fresh index (D-S2-16) — what turns "a changeset with
   *  only `updated` rows never rebuilds the row-height index" from a property of the cache key
   *  into something `[S2-A3]` can assert. */
  heightIndexRevision = 0;

  computeFrame(input: LayoutInput): GeometryFrame {
    return computeFrame(input, this.#heightsFor(input.entries.length, input.rowHeight));
  }

  /** The row-height index's own `topAt`, exposed so `reveal` can ask for a row's position without a
   * full layout pass. Available once `computeFrame` has run at least once — true for any Gantt that
   * has completed construction, which is the only caller. */
  rowTop(index: number): number {
    return this.#heights?.topAt(index) ?? 0;
  }

  #heightsFor(rowCount: number, rowHeight: number): RowHeightIndex {
    if (this.#heights && this.#rowCount === rowCount && this.#rowHeight === rowHeight) {
      return this.#heights;
    }
    this.#heights = new PrefixSumHeightIndex(rowCount, () => rowHeight);
    this.#rowCount = rowCount;
    this.#rowHeight = rowHeight;
    this.heightIndexRevision++;
    return this.#heights;
  }
}
