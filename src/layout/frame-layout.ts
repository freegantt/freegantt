// layout/ owns the layout pass and whatever that pass must remember between renders (plans/01 §4,
// D-C). `computeFrame` is pure and stateless by design; a Gantt renders many frames over the same
// entries, and `PrefixSumHeightIndex` exists precisely so "top of row i" is O(log n) ACROSS those
// renders (#47) — which a fresh index per pass throws away. `FrameLayout` is where that memory
// lives, so that no caller has to hold it: a caller states what to draw, and the index, its cache
// key and its invalidation never cross the seam into `view/`.

import { placeFrame, resolveLayoutRows } from './frame.js';
import type { GeometryFrame, LayoutInput } from './frame.js';
import { PrefixSumHeightIndex } from './row-height-index.js';
import { FrameMemory } from './frame-memory.js';
import type { PlannedRow } from './rows/row-source.js';
import type { ChangeSet, Entry, EntryId } from '../model/index.js';
import { createItemProducerRegistry, produceItemsForRow } from './items/produce-items.js';
import type { ItemProducerRegistry } from './items/produce-items.js';
import { DEFAULT_LANE_GAP_PX, packRow, packedRowHeight } from './lanes/pack-lanes.js';

/** One Gantt's layout pass, with the row-height index kept alive between passes. One instance per
 * Gantt: the cached index describes that Gantt's rows, and nothing about it is shareable. */
export class FrameLayout {
  #memory: FrameMemory | undefined;
  /** Cache key for the live index. Distinct from `#rowHeight` / `#laneGap`, which `getHeight` reads. */
  #cachedRowCount = -1;
  #cachedRowHeight = -1;
  #cachedLaneGap = -1;
  #rowHeight = -1;
  #laneGap = -1;
  #plan: readonly PlannedRow[] = [];
  #entryById = new Map<EntryId, Entry>();
  #registry: ItemProducerRegistry = createItemProducerRegistry();
  /** Bumped whenever `#memoryFor` builds a fresh index (D-S2-16) — what turns "a changeset with
   *  only `updated` rows never rebuilds the row-height index" from a property of the cache key
   *  into something `[S2-A3]` can assert. */
  heightIndexRevision = 0;

  computeFrame(input: LayoutInput): GeometryFrame {
    this.#plan = resolveLayoutRows(input);
    this.#rowHeight = input.rowHeight;
    this.#laneGap = input.laneGapPx ?? DEFAULT_LANE_GAP_PX;
    this.#entryById = new Map(input.entries.map((entry) => [entry.id, entry]));
    this.#registry = input.itemProducerRegistry;
    return placeFrame(input, this.#plan, this.#memoryFor(this.#plan.length, this.#rowHeight, this.#laneGap));
  }

  /** The row-height index's own `topAt`, exposed so `reveal` can ask for a row's position without a
   * full layout pass. Available once `computeFrame` has run at least once — true for any Gantt that
   * has completed construction, which is the only caller. */
  rowTop(index: number): number {
    return this.#memory?.heights.topAt(index) ?? 0;
  }

  /** Index of the first planned row that carries this entry, or `-1` when collapse hid it. */
  rowIndexForEntry(id: EntryId): number {
    return this.#plan.findIndex((row) => row.entryIds.includes(id));
  }

  /** Resolved rows after the latest `computeFrame` — filter, sort, and collapse already applied. */
  plannedRows(): readonly PlannedRow[] {
    return this.#plan;
  }

  invalidateFrom(index: number): void {
    this.#memory?.heights.invalidateFrom(index);
    for (let i = index; i < this.#plan.length; i++) {
      this.#memory?.forgetPacked(this.#plan[i]!.id);
    }
  }

  /** Field-only updates invalidate from the lowest changed row; add/remove rebuilds from 0 (D-S2-16). */
  invalidateForChange(changeSet: ChangeSet): void {
    this.invalidateFrom(this.#indexToInvalidate(changeSet));
  }

  #indexToInvalidate(changeSet: ChangeSet): number {
    if (changeSet.added.length > 0 || changeSet.removed.length > 0) return 0;
    let lowest = Infinity;
    for (const update of changeSet.updated) {
      const index = this.rowIndexForEntry(update.id);
      if (index >= 0 && index < lowest) lowest = index;
    }
    return Number.isFinite(lowest) ? lowest : 0;
  }

  #heightAt(index: number): number {
    const row = this.#plan[index];
    if (row === undefined || row.heightMode !== 'pack') return this.#rowHeight;
    const packed = this.#memory!.packedRow(row.id, () => {
      const items = produceItemsForRow(row, this.#entryById, this.#registry);
      return { items, packing: packRow(items) };
    });
    return packedRowHeight(packed.packing.laneCount, this.#rowHeight, this.#laneGap);
  }

  #memoryFor(rowCount: number, rowHeight: number, laneGap: number): FrameMemory {
    if (
      this.#memory &&
      this.#cachedRowCount === rowCount &&
      this.#cachedRowHeight === rowHeight &&
      this.#cachedLaneGap === laneGap
    ) {
      return this.#memory;
    }
    this.#memory = new FrameMemory(new PrefixSumHeightIndex(rowCount, (i) => this.#heightAt(i)));
    this.#cachedRowCount = rowCount;
    this.#cachedRowHeight = rowHeight;
    this.#cachedLaneGap = laneGap;
    this.heightIndexRevision++;
    return this.#memory;
  }
}
