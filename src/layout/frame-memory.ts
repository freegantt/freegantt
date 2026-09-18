// layout/ — what one layout pass remembers between renders (D-S4-26). Bar production lives here so
// a row's Bars are produced once per dataset revision, whether `heightOfRow` forced it above the
// viewport or `placeFrame` placed it in the window.

import type { Entry, EntryId } from '../model/index.js';
import type { PlannedRow } from './rows/row-source.js';
import { PrefixSumHeightIndex } from './row-height-index.js';
import type { RowHeightIndex } from './row-height-index.js';
import { produceBarsForRow } from './items/produce-items.js';
import { NO_VARIANTS } from './items/item.js';
import type { Bar, VariantBars } from './items/item.js';

/** What this memory remembers about one row (#212, ADR 0010): the Bars its Entries produced,
 *  cached together under one key. */
export interface RowMemory {
  readonly items: readonly Bar[];
}

export interface FrameMemoryBind {
  readonly plan: readonly PlannedRow[];
  readonly rowHeight: number;
  readonly entries: readonly Entry[];
  readonly registry: VariantBars;
  readonly datasetRevision: number;
  /** Test seam: override row height for index-space overscan checks. */
  readonly heightAt?: (index: number) => number;
}

export class FrameMemory {
  #heights: PrefixSumHeightIndex | undefined;
  #produced = new Map<string, RowMemory>();
  /** The answer for a row no current frame planned. One per memory, not one per call, and not a
   * module-level constant — two Gantts must not share it (I2). */
  readonly #noRow: RowMemory = { items: [] };
  #plan: readonly PlannedRow[] = [];
  #rowById = new Map<string, PlannedRow>();
  #entryById = new Map<EntryId, Entry>();
  #registry: VariantBars = NO_VARIANTS;
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

  /** Call: `memory.rowMemory(row.id)` — produce a row's Bars once per dataset revision. */
  rowMemory(id: string): RowMemory {
    const hit = this.#produced.get(id);
    if (hit !== undefined) return hit;
    const row = this.#rowById.get(id);
    if (row === undefined) return this.#noRow;
    const items = produceBarsForRow(row, this.#entryById, this.#registry);
    const produced: RowMemory = { items };
    this.#produced.set(id, produced);
    return produced;
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
