// layout/ — what one layout pass remembers between renders (D-S4-26). Produce, pack, and row height
// live here so a pack row is produced once per dataset revision, whether `heightOfRow` forced it
// above the viewport or `placeFrame` placed it in the window.

import type { Entry, EntryId } from '../model/index.js';
import type { PlannedRow } from './rows/row-source.js';
import { PrefixSumHeightIndex } from './row-height-index.js';
import type { RowHeightIndex } from './row-height-index.js';
import { createItemProducerRegistry, produceItemsForRow } from './items/produce-items.js';
import type { ItemProducerRegistry } from './items/produce-items.js';
import { packRow, packedRowHeight, singleLane } from './lanes/pack-lanes.js';
import type { PackedRow } from './lanes/pack-lanes.js';

export interface FrameMemoryBind {
  readonly plan: readonly PlannedRow[];
  readonly rowHeight: number;
  readonly laneGap: number;
  readonly entries: readonly Entry[];
  readonly registry: ItemProducerRegistry;
  readonly datasetRevision?: number;
  /** Test seam: override packed/fixed height for index-space overscan checks. */
  readonly heightAt?: (index: number) => number;
}

export class FrameMemory {
  #heights: PrefixSumHeightIndex | undefined;
  #packed = new Map<string, PackedRow>();
  #plan: readonly PlannedRow[] = [];
  #rowById = new Map<string, PlannedRow>();
  #entryById = new Map<EntryId, Entry>();
  #registry: ItemProducerRegistry = createItemProducerRegistry();
  #rowHeight = 0;
  #cachedRowCount = -1;
  #cachedRowHeight = -1;
  #cachedLaneGap = -1;
  #datasetRevision: number | undefined;
  #heightAt: ((index: number) => number) | undefined;
  /** Bumped when this memory builds a fresh height index (D-S2-16). */
  heightIndexRevision = 0;

  get heights(): RowHeightIndex {
    return this.#heights ?? new PrefixSumHeightIndex(0, () => 0);
  }

  /** Call: `memory.sync({ plan, rowHeight, laneGap, entries, registry, datasetRevision })`. */
  sync(bind: FrameMemoryBind): void {
    this.#plan = bind.plan;
    this.#rowById = new Map(bind.plan.map((row) => [row.id, row]));
    this.#rowHeight = bind.rowHeight;
    this.#entryById = new Map(bind.entries.map((entry) => [entry.id, entry]));
    this.#registry = bind.registry;
    if (bind.heightAt !== undefined) this.#heightAt = bind.heightAt;
    else this.#heightAt = undefined;

    const countChanged = this.#cachedRowCount !== bind.plan.length;
    const metricsChanged = this.#cachedRowHeight !== bind.rowHeight || this.#cachedLaneGap !== bind.laneGap;
    const revisionChanged =
      bind.datasetRevision !== undefined && bind.datasetRevision !== this.#datasetRevision;

    if (this.#heights === undefined || countChanged || metricsChanged) {
      this.#packed.clear();
      this.#heights = new PrefixSumHeightIndex(bind.plan.length, (index) => this.heightOfRow(index));
      this.#cachedRowCount = bind.plan.length;
      this.#cachedRowHeight = bind.rowHeight;
      this.#cachedLaneGap = bind.laneGap;
      this.heightIndexRevision++;
    } else if (revisionChanged) {
      this.#packed.clear();
      this.#heights.invalidateFrom(0);
    }
    this.#datasetRevision = bind.datasetRevision;
  }

  /** Call: `memory.heightOfRow(index)` — fixed rows use `rowHeight`; pack rows use the packed lane count. */
  heightOfRow(index: number): number {
    if (this.#heightAt !== undefined) return this.#heightAt(index);
    const row = this.#plan[index];
    if (row === undefined || row.heightMode !== 'pack') return this.#rowHeight;
    return packedRowHeight(this.packedRow(row.id).packing.laneCount, this.#rowHeight, this.#cachedLaneGap);
  }

  /** Call: `memory.packedRow(row.id)` — produce and pack once per dataset revision. */
  packedRow(id: string): PackedRow {
    const hit = this.#packed.get(id);
    if (hit !== undefined) return hit;
    const row = this.#rowById.get(id);
    if (row === undefined) return { items: [], packing: { laneByItem: new Map(), laneCount: 1 } };
    const items = produceItemsForRow(row, this.#entryById, this.#registry);
    const packed: PackedRow = {
      items,
      packing: row.heightMode === 'pack' ? packRow(items) : singleLane(items),
    };
    this.#packed.set(id, packed);
    return packed;
  }

  /** Call: `memory.entry(item.entryId)` — the Entry this memory produced Items from (#212). It is
   *  the Entry of the last `sync`, not of the live Dataset, so an answer built from it describes the
   *  frame on screen. `undefined` when the last frame did not hold that Entry. */
  entry(id: EntryId): Entry | undefined {
    return this.#entryById.get(id);
  }

  forgetPacked(rowId: string): void {
    this.#packed.delete(rowId);
  }

  invalidateFrom(index: number): void {
    this.#heights?.invalidateFrom(index);
    for (let i = index; i < this.#plan.length; i++) {
      this.forgetPacked(this.#plan[i]!.id);
    }
  }
}
