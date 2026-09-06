// layout/ — what one layout pass remembers between renders (D-S4-26). Produce, pack, and row height
// live here so a pack row is produced once per dataset revision, whether `heightOfRow` forced it
// above the viewport or `placeFrame` placed it in the window.

import type { Entry, EntryId, ItemId, SegmentId } from '../model/index.js';
import type { PlannedRow } from './rows/row-source.js';
import { PrefixSumHeightIndex } from './row-height-index.js';
import type { RowHeightIndex } from './row-height-index.js';
import { createItemProducerRegistry, produceItemsForRow } from './items/produce-items.js';
import type { Item, ItemProducerRegistry } from './items/produce-items.js';
import { segmentIdsAnItemStandsFor } from './items/segment-ids-an-item-stands-for.js';
import { packRow, packedRowHeight, singleLane } from './lanes/pack-lanes.js';
import type { PackedRow } from './lanes/pack-lanes.js';

/** Shared and frozen, so a row or an Item that stands for no Segment costs no allocation (I5). */
const NO_SEGMENT_IDS: readonly SegmentId[] = Object.freeze([]);

/** What this memory remembers about one row (#212, ADR 0010). One record, so the Items, their lanes
 *  and the Segments they stand for can never fall out of step: they are produced together, from one
 *  Entry source, and cached together under one key. */
export interface RowMemory extends PackedRow {
  /** Which Segments each produced Item stands for. */
  readonly segmentIdsByItem: ReadonlyMap<ItemId, readonly SegmentId[]>;
  /** Every Segment of every Entry this row owns, in row order. */
  readonly segmentIds: readonly SegmentId[];
}

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
  #packed = new Map<string, RowMemory>();
  /** The answer for a row no current frame planned. One per memory, not one per call, and not a
   *  module-level constant — two Gantts must not share it (I2). */
  readonly #noRow: RowMemory = {
    items: [],
    packing: { laneByItem: new Map(), laneCount: 1 },
    segmentIdsByItem: new Map(),
    segmentIds: NO_SEGMENT_IDS,
  };
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
  packedRow(id: string): RowMemory {
    const hit = this.#packed.get(id);
    if (hit !== undefined) return hit;
    const row = this.#rowById.get(id);
    if (row === undefined) return this.#noRow;
    const items = produceItemsForRow(row, this.#entryById, this.#registry);
    const packed: RowMemory = {
      items,
      packing: row.heightMode === 'pack' ? packRow(items) : singleLane(items),
      segmentIdsByItem: this.#segmentIdsEachItemStandsFor(items),
      segmentIds: this.segmentIdsOfEntries(row.entryIds),
    };
    this.#packed.set(id, packed);
    return packed;
  }

  /** Call: `memory.segmentIdsOfEntries(layout.entryIdsForRow(id))` — every Segment of every named
   *  Entry, in the order named (#199, #212). Unfiltered: it states what those Entries hold, and a
   *  caller applies its own capability rule. Entries come from the last `sync`, not from the live
   *  Dataset, so the answer describes the frame on screen. An Entry that sync did not hold
   *  contributes nothing.
   *
   *  It answers for any Entry this memory holds, not only for one a planned row owns — which is why
   *  it is not read off `RowMemory.segmentIds`. `FrameLayout.entryIdsForRow` still names the Entries
   *  of a row collapse has hidden, and its Segment answer must agree with it. */
  segmentIdsOfEntries(entryIds: readonly EntryId[]): readonly SegmentId[] {
    if (entryIds.length === 0) return NO_SEGMENT_IDS;
    const segmentIds: SegmentId[] = [];
    for (const entryId of entryIds) {
      const entry = this.#entryById.get(entryId);
      if (entry === undefined) continue;
      for (const segment of entry.segments) segmentIds.push(segment.id);
    }
    return segmentIds;
  }

  /** The one rule — `segmentIdsAnItemStandsFor` — asked for a whole row at once, so the answer is
   *  cached beside the Items it describes instead of recomputed per pointer event (I5). */
  #segmentIdsEachItemStandsFor(items: readonly Item[]): ReadonlyMap<ItemId, readonly SegmentId[]> {
    const byItem = new Map<ItemId, readonly SegmentId[]>();
    for (const item of items) {
      byItem.set(item.id, segmentIdsAnItemStandsFor(item, this.#entryById.get(item.entryId)));
    }
    return byItem;
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
