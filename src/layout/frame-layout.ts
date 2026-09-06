// layout/ owns the layout pass and whatever that pass must remember between renders (plans/01 §4,
// D-C). `computeFrame` is pure and stateless by design; a Gantt renders many frames over the same
// entries, and `PrefixSumHeightIndex` exists precisely so "top of row i" is O(log n) ACROSS those
// renders (#47) — which a fresh index per pass throws away. `FrameLayout` is where that memory
// lives, so that no caller has to hold it: a caller states what to draw, and the index, its cache
// key and its invalidation never cross the seam into `view/`.

import { placeFrame } from './frame.js';
import type { GeometryFrame, LayoutInput } from './frame.js';
import { FrameMemory } from './frame-memory.js';
import { DecorationRunner } from './decorations.js';
import type { PlannedRow, UnindexedRow } from './rows/row-source.js';
import { resolveOpenRows, stampIndex } from './rows/resolve-rows.js';
import { applyCollapse } from './rows/collapse.js';
import { segmentIdsAnItemStandsFor } from './items/segment-ids-an-item-stands-for.js';
import { entryIdOfItem } from '../model/index.js';
import type { ChangeSet, EntryId, ItemId, RowId, SegmentId } from '../model/index.js';
import { DEFAULT_LANE_GAP_PX } from './lanes/pack-lanes.js';

/** One Gantt's layout pass, with the row-height index kept alive between passes. One instance per
 * Gantt: the cached index describes that Gantt's rows, and nothing about it is shareable. */
export class FrameLayout {
  #memory = new FrameMemory();
  /** D-S5-15: registered decoration providers' own memory, kept alive the same way `#memory` is —
   *  `run()` recomputes only when the window actually changed since the last `computeFrame` call. */
  #decorations = new DecorationRunner();
  #plan: readonly PlannedRow[] = [];
  #rowOfEntry = new Map<EntryId, RowId>();
  #entryIdsOfRow = new Map<RowId, readonly EntryId[]>();
  #parentOfRow = new Map<RowId, RowId>();
  #frameRevision = 0;

  get heightIndexRevision(): number {
    return this.#memory.heightIndexRevision;
  }

  /** How many frames this layout has planned (#212). A reader that caches an answer taken from this
   * layout holds this number beside it, and drops the cache once the layout has planned another
   * frame. `view/gantt-dom.ts`'s one-slot pointer memo is that reader. A rendered node cannot report
   * the same thing: a bar keeps its `data-item-id` while the Segment under it changes. */
  get frameRevision(): number {
    return this.#frameRevision;
  }

  computeFrame(input: LayoutInput): GeometryFrame {
    this.#frameRevision++;
    const open = resolveOpenRows({
      entries: input.entries,
      ...(input.rows !== undefined ? { rows: input.rows } : {}),
      ...(input.fieldCompares !== undefined ? { fieldCompares: input.fieldCompares } : {}),
      ...(input.fieldContext !== undefined ? { fieldContext: input.fieldContext } : {}),
    });
    this.#indexOpenRows(open);
    this.#plan = stampIndex(applyCollapse(open, new Set(input.collapsed ?? [])));
    this.#memory.sync({
      plan: this.#plan,
      rowHeight: input.rowHeight,
      laneGap: input.laneGapPx ?? DEFAULT_LANE_GAP_PX,
      entries: input.entries,
      registry: input.itemProducerRegistry,
      ...(input.datasetRevision !== undefined ? { datasetRevision: input.datasetRevision } : {}),
    });
    return placeFrame(input, this.#plan, this.#memory, this.#decorations);
  }

  /** The row-height index's own `topAt`, exposed so `reveal` can ask for a row's position without a
   * full layout pass. Available once `computeFrame` has run at least once — true for any Gantt that
   * has completed construction, which is the only caller. */
  rowTop(index: number): number {
    return this.#memory.heights.topAt(index);
  }

  /** Index of the first planned row that carries this entry, or `-1` when collapse hid it. */
  rowIndexForEntry(id: EntryId): number {
    return this.#plan.findIndex((row) => row.entryIds.includes(id));
  }

  /** Row that currently displays this entry, including a row collapse later hid (D4). */
  rowIdForEntry(id: EntryId): RowId | undefined {
    return this.#rowOfEntry.get(id);
  }

  /** Every Entry this row owns, in row order — the answer `rowIdForEntry` gives, read the other way
   * round (#199). A row source may put several Entries on one Row, so a caller that acts on "the
   * row" needs all of them and must not guess from the row's subject. Empty for a grouping header
   * row, and for a `RowId` no current frame planned. */
  entryIdsForRow(id: RowId): readonly EntryId[] {
    return this.#entryIdsOfRow.get(id) ?? NO_ENTRY_IDS;
  }

  /** Every Item this entry draws, in the packed order its row produced them (#185). It answers from
   * the producer output, never from the `${entryId}:${segmentIndex}` id convention, so a plugin Kind
   * that draws several Items from an entry with no Segments gets the same true answer. Empty when
   * collapse hid the row, or when the entry draws nothing. */
  itemIdsForEntry(id: EntryId): readonly ItemId[] {
    const rowId = this.#rowOfEntry.get(id);
    if (rowId === undefined) return [];
    const ids: ItemId[] = [];
    for (const item of this.#memory.packedRow(rowId).items) {
      if (item.entryId === id) ids.push(item.id);
    }
    return ids;
  }

  /** Every Segment this Item stands for (#212, ADR 0010) — the one answer, which the pointer path
   * and the gesture path both read. An Item that drew one Segment names it alone; an Item that drew
   * the Entry's whole span names every Segment of that Entry. It answers from the producer output,
   * the same way `itemIdsForEntry` does, so no caller reads a Segment out of the
   * `${entryId}:${segmentIndex}` id convention or off a rendered node. Empty for an Item no current
   * frame planned. */
  segmentIdsForItem(id: ItemId): readonly SegmentId[] {
    const entryId = entryIdOfItem(id);
    const rowId = this.#rowOfEntry.get(entryId);
    if (rowId === undefined) return NO_SEGMENT_IDS;
    for (const item of this.#memory.packedRow(rowId).items) {
      if (item.id === id) return segmentIdsAnItemStandsFor(item, this.#memory.entry(entryId));
    }
    return NO_SEGMENT_IDS;
  }

  /** Every Segment of every Entry this row owns, in row order (#199, #212) — what a click on a row
   * or on one of its cells stands for. Unfiltered, exactly like `entryIdsForRow`: it states what the
   * row holds, and a caller applies its own capability rule. Empty for a grouping header row, and
   * for a `RowId` no current frame planned. */
  segmentIdsForRow(id: RowId): readonly SegmentId[] {
    const entryIds = this.entryIdsForRow(id);
    if (entryIds.length === 0) return NO_SEGMENT_IDS;
    const segmentIds: SegmentId[] = [];
    for (const entryId of entryIds) {
      const entry = this.#memory.entry(entryId);
      if (entry === undefined) continue;
      for (const segment of entry.segments) segmentIds.push(segment.id);
    }
    return segmentIds;
  }

  /** Collapsed ancestors of this entry's row, walking `parentRowId` recorded before collapse. */
  ancestorRowIds(id: EntryId): readonly RowId[] {
    const ids: RowId[] = [];
    let current = this.#rowOfEntry.get(id);
    while (current !== undefined) {
      const parent = this.#parentOfRow.get(current);
      if (parent === undefined) break;
      ids.push(parent);
      current = parent;
    }
    return ids;
  }

  /** Resolved rows after the latest `computeFrame` — filter, sort, and collapse already applied. */
  plannedRows(): readonly PlannedRow[] {
    return this.#plan;
  }

  invalidateFrom(index: number): void {
    this.#memory.invalidateFrom(index);
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

  #indexOpenRows(open: readonly UnindexedRow[]): void {
    this.#rowOfEntry.clear();
    this.#entryIdsOfRow.clear();
    this.#parentOfRow.clear();
    for (const row of open) {
      this.#entryIdsOfRow.set(row.id, row.entryIds);
      for (const id of row.entryIds) this.#rowOfEntry.set(id, row.id);
      if (row.parentRowId !== undefined) this.#parentOfRow.set(row.id, row.parentRowId);
    }
  }
}

/** Shared, so a row that owns nothing costs no allocation on the pointer path (I5). */
const NO_ENTRY_IDS: readonly EntryId[] = Object.freeze([]);

/** Shared for the same reason — a node that stands for no Segment allocates nothing (#212, I5). */
const NO_SEGMENT_IDS: readonly SegmentId[] = Object.freeze([]);
