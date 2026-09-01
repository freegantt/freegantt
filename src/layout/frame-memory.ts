// layout/ — what one layout pass remembers between renders (D-S4-26). The height index and the
// per-row pack memo live here so a pack row is produced and packed once per revision, whether
// `getHeight` forced it above the viewport or `computeFrame` placed it in the window.

import type { RowHeightIndex } from './row-height-index.js';
import type { PackedRow } from './lanes/pack-lanes.js';

export class FrameMemory {
  readonly heights: RowHeightIndex;
  #packed = new Map<string, PackedRow>();

  constructor(heights: RowHeightIndex) {
    this.heights = heights;
  }

  /** Call: `memory.packedRow(row.id, () => ({ items, packing: packRow(items) }))`. */
  packedRow(rowId: string, compute: () => PackedRow): PackedRow {
    const hit = this.#packed.get(rowId);
    if (hit !== undefined) return hit;
    const packed = compute();
    this.#packed.set(rowId, packed);
    return packed;
  }

  forgetPacked(rowId: string): void {
    this.#packed.delete(rowId);
  }
}
