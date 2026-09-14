// layout/ — what one layout pass remembers between renders (D-S4-26). Item production lives here so
// a row's Items are produced once per dataset revision, whether `heightOfRow` forced it above the
// viewport or `placeFrame` placed it in the window.

import type { Entry, EntryId, ItemId, SegmentId } from '../model/index.js';
import type { PlannedRow } from './rows/row-source.js';
import { PrefixSumHeightIndex } from './row-height-index.js';
import type { RowHeightIndex } from './row-height-index.js';
import { produceItemsForRow } from './items/produce-items.js';
import { NO_VARIANTS } from './items/item.js';
import type { Item, VariantItems } from './items/item.js';

/** Shared and frozen, so a row or an Item that stands for no Segment costs no allocation (I5). */
export const NO_SEGMENT_IDS: readonly SegmentId[] = Object.freeze([]);

/** What this memory remembers about one row (#212, ADR 0010). One record, so the Items and the
 *  Segments they stand for can never fall out of step: they are produced together, from one Entry
 *  source, and cached together under one key. */
export interface RowMemory {
  readonly items: readonly Item[];
  /** Which Segments each produced Item stands for. */
  readonly segmentIdsByItem: ReadonlyMap<ItemId, readonly SegmentId[]>;
  /** Every Segment of every Entry this row owns, in row order. */
  readonly segmentIds: readonly SegmentId[];
}

export interface FrameMemoryBind {
  readonly plan: readonly PlannedRow[];
  readonly rowHeight: number;
  readonly entries: readonly Entry[];
  readonly registry: VariantItems;
  readonly datasetRevision: number;
  /** Test seam: override row height for index-space overscan checks. */
  readonly heightAt?: (index: number) => number;
}

export class FrameMemory {
  #heights: PrefixSumHeightIndex | undefined;
  #produced = new Map<string, RowMemory>();
  /** The answer for a row no current frame planned. One per memory, not one per call, and not a
   *  module-level constant — two Gantts must not share it (I2). */
  readonly #noRow: RowMemory = {
    items: [],
    segmentIdsByItem: new Map(),
    segmentIds: NO_SEGMENT_IDS,
  };
  #plan: readonly PlannedRow[] = [];
  #rowById = new Map<string, PlannedRow>();
  #entryById = new Map<EntryId, Entry>();
  #registry: VariantItems = NO_VARIANTS;
  #rowHeight = 0;
  #cachedRowCount = -1;
  #cachedRowHeight = -1;
  #datasetRevision: number | undefined;
  #heightAt: ((index: number) => number) | undefined;
  /** Bumped when this memory builds a fresh height index (D-S2-16). */
  heightIndexRevision = 0;

  get heights(): RowHeightIndex {
    return this.#heights ?? new PrefixSumHeightIndex(0, () => 0);
  }

  /** Call: `memory.sync({ plan, rowHeight, entries, registry, datasetRevision })`. */
  sync(bind: FrameMemoryBind): void {
    this.#plan = bind.plan;
    this.#rowById = new Map(bind.plan.map((row) => [row.id, row]));
    this.#rowHeight = bind.rowHeight;
    this.#entryById = new Map(bind.entries.map((entry) => [entry.id, entry]));
    this.#registry = bind.registry;
    if (bind.heightAt !== undefined) this.#heightAt = bind.heightAt;
    else this.#heightAt = undefined;

    const countChanged = this.#cachedRowCount !== bind.plan.length;
    const metricsChanged = this.#cachedRowHeight !== bind.rowHeight;
    const revisionChanged = bind.datasetRevision !== this.#datasetRevision;

    if (this.#heights === undefined || countChanged || metricsChanged) {
      this.#produced.clear();
      this.#heights = new PrefixSumHeightIndex(bind.plan.length, (index) => this.heightOfRow(index));
      this.#cachedRowCount = bind.plan.length;
      this.#cachedRowHeight = bind.rowHeight;
      this.heightIndexRevision++;
    } else if (revisionChanged) {
      this.#produced.clear();
      this.#heights.invalidateFrom(0);
    }
    this.#datasetRevision = bind.datasetRevision;
  }

  /** Call: `memory.heightOfRow(index)` — every row uses `rowHeight` (singleLane, D-S4-19). */
  heightOfRow(index: number): number {
    if (this.#heightAt !== undefined) return this.#heightAt(index);
    return this.#rowHeight;
  }

  /** Call: `memory.rowMemory(row.id)` — produce a row's Items once per dataset revision. */
  rowMemory(id: string): RowMemory {
    const hit = this.#produced.get(id);
    if (hit !== undefined) return hit;
    const row = this.#rowById.get(id);
    if (row === undefined) return this.#noRow;
    const items = produceItemsForRow(row, this.#entryById, this.#registry);
    const produced: RowMemory = {
      items,
      segmentIdsByItem: this.#segmentIdsEachItemStandsFor(items),
      segmentIds: this.segmentIdsOfEntries(row.entryIds),
    };
    this.#produced.set(id, produced);
    return produced;
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

  /** The one rule — "which Segments does this Item stand for" (#212, #230, ADR 0010) — asked for a
   *  whole row at once, so the answer is cached beside the Items it describes instead of recomputed
   *  per pointer event (I5). It is private, and it is the rule's only body: `placeFrame` copies the
   *  answer onto `FrameBar.segmentIds` and `FrameLayout.segmentIdsForItem` reads the same map, so
   *  no layer outside `layout/` can restate the rule against an Entry source of its own.
   *
   *  An Item that drew one Segment stands for that Segment alone. An Item that drew its Entry's
   *  whole span — a parent, or a plugin's own variant — stands for every Segment of that Entry,
   *  because any of them selects it. An Item whose Entry this memory does not hold stands for no
   *  Segment.
   *
   *  Which Segment an Item *draws* is the other, narrower fact, and `Item.segmentId` states it. A
   *  resize handle and the `data-segment-id` stamp both need that one; nothing else does. */
  #segmentIdsEachItemStandsFor(items: readonly Item[]): ReadonlyMap<ItemId, readonly SegmentId[]> {
    const byItem = new Map<ItemId, readonly SegmentId[]>();
    for (const item of items) {
      byItem.set(item.id, this.#segmentIdsOneItemStandsFor(item));
    }
    return byItem;
  }

  #segmentIdsOneItemStandsFor(item: Item): readonly SegmentId[] {
    if (item.segmentId !== undefined) return [item.segmentId];
    const entry = this.#entryById.get(item.entryId);
    if (entry === undefined) return NO_SEGMENT_IDS;
    return entry.segments.map((segment) => segment.id);
  }

  forgetProduced(rowId: string): void {
    this.#produced.delete(rowId);
  }

  invalidateFrom(index: number): void {
    this.#heights?.invalidateFrom(index);
    for (let i = index; i < this.#plan.length; i++) {
      this.forgetProduced(this.#plan[i]!.id);
    }
  }
}
