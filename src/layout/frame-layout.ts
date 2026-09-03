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
import type { ChangeSet, EntryId, RowId } from '../model/index.js';
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
  #parentOfRow = new Map<RowId, RowId>();

  get heightIndexRevision(): number {
    return this.#memory.heightIndexRevision;
  }

  computeFrame(input: LayoutInput): GeometryFrame {
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
    this.#parentOfRow.clear();
    for (const row of open) {
      for (const id of row.entryIds) this.#rowOfEntry.set(id, row.id);
      if (row.parentRowId !== undefined) this.#parentOfRow.set(row.id, row.parentRowId);
    }
  }
}
