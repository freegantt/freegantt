// layout/ — what one layout pass remembers between renders. Bar production lives here so
// a row's Bars are produced once per dataset revision, whether `heightOfRow` forced it above the
// viewport or `placeFrame` placed it in the window.

import type { Entry, EntryId } from '../model/index.js';
import type { PlannedRow } from './rows/row-source.js';
import type { RowHeightResolver } from './row-height.js';
import { laneBandsOf, laneCountOf, laneRowHeight } from './lane.js';
import type { FrameLane, LaneLayout } from './lane.js';
import { HeaderTickPaintCache } from './header-tick.js';
import { PrefixSumHeightIndex } from './row-height-index.js';
import type { RowHeightIndex } from './row-height-index.js';
import { produceBarsForRow } from './bars/produce-bars.js';
import { NO_VARIANTS } from './bars/bar.js';
import type { Bar, VariantBars } from './bars/bar.js';

/** What this memory remembers about one row (#212, ADR 0010): the Bars its Entries produced,
 *  cached together under one key. */
export interface RowMemory {
  readonly bars: readonly Bar[];
}

const NO_LANES: readonly FrameLane[] = Object.freeze([]);

export interface FrameMemoryBind {
  readonly plan: readonly PlannedRow[];
  readonly rowHeight: number;
  /** Answers a Row's height when the consumer gave a function. Absent: every Row is `rowHeight`. */
  readonly rowHeightOf?: RowHeightResolver;
  /** Which Rows hold Lanes. Absent: no Row does. */
  readonly lanes?: LaneLayout;
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
  readonly #noRow: RowMemory = { bars: [] };
  #plan: readonly PlannedRow[] = [];
  #rowById = new Map<string, PlannedRow>();
  #entryById = new Map<EntryId, Entry>();
  /** The `entries` array `#entryById` was built from (#414). Identity, not `datasetRevision`: a
   *  drag preview can leave the revision untouched while still wanting the committed entries — it
   *  never reaches `placeFrame` at all (`GanttShell` paints a preview through `#backend.applyState`),
   *  so an identity check is exact and never serves a stale entry. */
  #entriesForEntryById: readonly Entry[] | undefined;
  #registry: VariantBars = NO_VARIANTS;
  #rowHeight = 0;
  #rowHeightOf: RowHeightResolver | undefined;
  #lanes: LaneLayout | undefined;
  #cachedLanes: LaneLayout | undefined;
  #cachedRowHeightOf: RowHeightResolver | undefined;
  #cachedRowCount = -1;
  #cachedRowHeight = -1;
  #datasetRevision: number | undefined;
  #heightAt: ((index: number) => number) | undefined;
  /** What the consumer's header tick renderer answered, kept between frames. */
  readonly headerTickPaints = new HeaderTickPaintCache();
  /** Bumped when this memory builds a fresh height index. */
  heightIndexRevision = 0;
  /** Bumped each time produced Bars are dropped. A reader that caches geometry built from Bars
   *  compares it to know the cache is stale. */
  producedRevision = 0;

  get heights(): RowHeightIndex {
    return this.#heights ?? new PrefixSumHeightIndex(0, () => 0);
  }

  /** Call: `memory.entryById` — every synced Entry, keyed by id, rebuilt only when `sync` sees a new
   *  `entries` array (#414). `placeFrame` reads this instead of allocating its own Map every frame. */
  get entryById(): ReadonlyMap<EntryId, Entry> {
    return this.#entryById;
  }

  /** Call: `memory.sync({ plan, rowHeight, entries, registry, datasetRevision })`. */
  sync(bind: FrameMemoryBind): void {
    // #495, #414: `FrameLayout.computeFrame` hands back the same `#plan` array on a frame that
    // replanned nothing (a scroll, a pan) — rebuilding this Map on every such frame costs one pass
    // over every row for no reason: the row a `RowId` names cannot have changed underneath an array
    // that is the very one already indexed here.
    const planChanged = bind.plan !== this.#plan;
    this.#plan = bind.plan;
    if (planChanged) this.#rowById = new Map(bind.plan.map((row) => [row.id, row]));
    this.#rowHeight = bind.rowHeight;
    this.#rowHeightOf = bind.rowHeightOf;
    this.#lanes = bind.lanes;
    if (bind.entries !== this.#entriesForEntryById) {
      this.#entryById = new Map(bind.entries.map((entry) => [entry.id, entry]));
      this.#entriesForEntryById = bind.entries;
    }
    this.#registry = bind.registry;
    if (bind.heightAt !== undefined) this.#heightAt = bind.heightAt;
    else this.#heightAt = undefined;

    const countChanged = this.#cachedRowCount !== bind.plan.length;
    const metricsChanged =
      this.#cachedRowHeight !== bind.rowHeight ||
      this.#cachedRowHeightOf !== bind.rowHeightOf ||
      this.#cachedLanes !== bind.lanes;
    const revisionChanged = bind.datasetRevision !== this.#datasetRevision;

    if (this.#heights === undefined || countChanged || metricsChanged) {
      this.#produced.clear();
      this.producedRevision++;
      this.#heights = new PrefixSumHeightIndex(bind.plan.length, (index) => this.heightOfRow(index));
      this.#cachedRowCount = bind.plan.length;
      this.#cachedRowHeight = bind.rowHeight;
      this.#cachedRowHeightOf = bind.rowHeightOf;
      this.#cachedLanes = bind.lanes;
      this.heightIndexRevision++;
    } else if (revisionChanged) {
      this.#produced.clear();
      this.producedRevision++;
      this.#heights.invalidateFrom(0);
    } else if (planChanged) {
      // A re-sort or a same-size filter keeps the row count and the data but moves every Row's height.
      this.#heights.invalidateFrom(0);
      this.heightIndexRevision++;
    }
    this.#datasetRevision = bind.datasetRevision;
  }

  /** Call: `memory.laneCountOfRow(index)` — how many Lanes the row holds. `0` for a row with none. */
  laneCountOfRow(index: number): number {
    const planned = this.#plan[index];
    const subject = planned?.entryIds[0];
    const entry = subject === undefined ? undefined : this.#entryById.get(subject);
    if (this.#lanes === undefined || entry === undefined || planned?.kind === 'header') return 0;
    return laneCountOf(this.#lanes, entry);
  }

  /** Call: `memory.lanesOfRow(index, top, height)` — the Lanes to draw in the row, or none. */
  lanesOfRow(index: number, top: number, height: number): readonly FrameLane[] {
    const count = this.laneCountOfRow(index);
    if (this.#lanes === undefined || count === 0) return NO_LANES;
    return laneBandsOf(top, height, count, this.#lanes.geometry);
  }

  /** Call: `memory.heightOfRow(index)` — the height function's answer for the row, else the Lane
   *  height when the row holds Lanes, else `rowHeight`. */
  heightOfRow(index: number): number {
    if (this.#heightAt !== undefined) return this.#heightAt(index);
    const planned = this.#plan[index];
    if (planned === undefined) return this.#rowHeight;
    const lanes = this.laneCountOfRow(index);
    const laneHeight =
      this.#lanes === undefined || lanes === 0 ? undefined : laneRowHeight(lanes, this.#lanes.geometry);
    const resolve = this.#rowHeightOf;
    // A Lane Row never clips its stack: a default height taller than the stack wins, a shorter one does not.
    if (resolve === undefined) return Math.max(laneHeight ?? 0, this.#rowHeight);
    const subject = planned.entryIds[0];
    const height = resolve({
      entry: subject === undefined ? undefined : this.#entryById.get(subject),
      kind: planned.kind,
      depth: planned.depth,
      lanes,
      laneHeight,
    });
    // A function that answers nothing usable gets the default, so one bad Row never zeroes the pane.
    return Number.isFinite(height) && height > 0 ? height : Math.max(laneHeight ?? 0, this.#rowHeight);
  }

  /** Call: `memory.rowMemory(row.id)` — produce a row's Bars once per dataset revision. */
  rowMemory(id: string): RowMemory {
    const hit = this.#produced.get(id);
    if (hit !== undefined) return hit;
    const row = this.#rowById.get(id);
    if (row === undefined) return this.#noRow;
    const bars = produceBarsForRow(row, this.#entryById, this.#registry);
    const produced: RowMemory = { bars };
    this.#produced.set(id, produced);
    return produced;
  }

  forgetProduced(rowId: string): void {
    this.#produced.delete(rowId);
    this.producedRevision++;
  }

  invalidateFrom(index: number): void {
    this.#heights?.invalidateFrom(index);
    for (let i = index; i < this.#plan.length; i++) {
      this.forgetProduced(this.#plan[i]!.id);
    }
  }
}
