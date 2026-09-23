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
import type { PlannedRow, RowSource, UnindexedRow } from './rows/row-source.js';
import { resolveOpenRows, stampIndex } from './rows/resolve-rows.js';
import { applyCollapse } from './rows/collapse.js';
import type { ChangeSet, EntryId, BarId, RowId, Entry, FieldContext } from '../model/index.js';
import type { Bar, VariantBars } from './bars/bar.js';
import type { FieldCompare } from './column.js';
import type { EntryRulePorts } from './entry-rule.js';

/** Every input the row plan (`resolveOpenRows` → `applyCollapse` → `stampIndex`) reads, and nothing
 *  else (#495, #414). `#planRows` takes only this type, never `LayoutInput`, so a field it reads
 *  that is missing here is a compile error, not a cache that silently ignores it. Compared field by
 *  field, identity only:
 *
 *  - `entries` — `dataset.entries.all` keeps its array identity until a commit
 *    (`docs/agents/modules/data.md`).
 *  - `rows`, `fieldCompares`, `fieldContext` — `FrameSettings` replaces these whole, never mutates
 *    in place (#187).
 *  - `collapsed` — `TreeCollapse` replaces its frozen id array on every change (`view/tree-collapse.ts`).
 *  - `entryRulePorts` — built once per Gantt; `fieldRegistryRevision` sits beside it because its own
 *    `fieldFor` read has no cache of its own. */
export interface RowPlanInput {
  entries: readonly Entry[];
  datasetRevision: number;
  rows: RowSource | undefined;
  fieldCompares: readonly FieldCompare[] | undefined;
  fieldContext: FieldContext | undefined;
  entryRulePorts: EntryRulePorts | undefined;
  collapsed: readonly string[] | undefined;
  fieldRegistryRevision: number;
}

type RowPlanInputKey = keyof RowPlanInput;

/** What `ensureRowPlan` needs beyond `RowPlanInput` to keep `#memory` in step with `#plan` (#424
 *  review, point 1). Neither field ever moves a row between parents or hides one, so neither belongs
 *  in `RowPlanInput`'s own replan gate — a row-height or a registry change never changes which rows
 *  exist. `FrameMemory.sync` still needs both on every call, replan or not: see `ensureRowPlan`'s
 *  own comment for why the sync itself is unconditional. */
export interface RowPlanMemoryInput {
  rowHeight: number;
  registry: VariantBars;
}

/** One comparator per `RowPlanInput` field (`frame-settings.ts`'s `INVALIDATION` table is the same
 *  shape) — the mapped type forces an entry for every key the interface declares, so a field added
 *  there and forgotten here is a compile error, not a cache that silently ignores it. */
const SAME_ROW_PLAN_INPUT: {
  readonly [K in RowPlanInputKey]: (a: RowPlanInput, b: RowPlanInput) => boolean;
} = Object.freeze({
  entries: (a, b) => a.entries === b.entries,
  datasetRevision: (a, b) => a.datasetRevision === b.datasetRevision,
  rows: (a, b) => a.rows === b.rows,
  fieldCompares: (a, b) => a.fieldCompares === b.fieldCompares,
  fieldContext: (a, b) => a.fieldContext === b.fieldContext,
  entryRulePorts: (a, b) => a.entryRulePorts === b.entryRulePorts,
  collapsed: (a, b) => a.collapsed === b.collapsed,
  fieldRegistryRevision: (a, b) => a.fieldRegistryRevision === b.fieldRegistryRevision,
});

function samePlanInput(a: RowPlanInput, b: RowPlanInput): boolean {
  return (Object.keys(SAME_ROW_PLAN_INPUT) as RowPlanInputKey[]).every((key) =>
    SAME_ROW_PLAN_INPUT[key](a, b),
  );
}

function planInputFrom(input: LayoutInput): RowPlanInput {
  return {
    entries: input.entries,
    datasetRevision: input.datasetRevision,
    rows: input.rows,
    fieldCompares: input.fieldCompares,
    fieldContext: input.fieldContext,
    entryRulePorts: input.entryRulePorts,
    collapsed: input.collapsed,
    fieldRegistryRevision: input.fieldRegistryRevision ?? 0,
  };
}

/** What a reader asks the current frame about what it drew (#185, #199, #212). `FrameLayout`
 *  satisfies it; a test hands a literal. It is the read half of `FrameLayout`, the same split
 *  `EntryStoreView` makes over `EntryStore`. */
export interface FrameLayoutView {
  barsForEntry(id: EntryId): readonly Bar[];
  barIdsForEntry(id: EntryId): readonly BarId[];
  entryIdsForRow(id: RowId): readonly EntryId[];
  readonly frameRevision: number;
}

/** One Gantt's layout pass, with the row-height index kept alive between passes. One instance per
 * Gantt: the cached index describes that Gantt's rows, and nothing about it is shareable. */
export class FrameLayout implements FrameLayoutView {
  #memory = new FrameMemory();
  /** D-S5-15: registered decoration providers' own memory, kept alive the same way `#memory` is —
   *  `run()` recomputes only when the window actually changed since the last `computeFrame` call. */
  #decorations = new DecorationRunner();
  #plan: readonly PlannedRow[] = [];
  #rowOfEntry = new Map<EntryId, RowId>();
  #entryIdsOfRow = new Map<RowId, readonly EntryId[]>();
  #parentOfRow = new Map<RowId, RowId>();
  #expandableOfRow = new Map<RowId, boolean>();
  #frameRevision = 0;
  /** What `#plan` (and the four maps above) were last planned from — `undefined` before the first
   *  `ensureRowPlan` call. `ensureRowPlan` replans only when its own `RowPlanInput` disagrees with
   *  it (#495, #414). `computeFrame` is one caller, not the only one (#424): a synchronous reader
   *  like `collapseStateOf` calls `ensureRowPlan` too, between frames. */
  #lastPlanInput: RowPlanInput | undefined;

  get heightIndexRevision(): number {
    return this.#memory.heightIndexRevision;
  }

  /** How many frames this layout has planned (#212). A reader that caches an answer taken from this
   * layout holds this number beside it, and drops the cache once the layout has planned another
   * frame. `view/gantt-dom.ts`'s one-slot pointer memo is that reader. A rendered node cannot report
   * the same thing: a bar keeps its `data-bar-id` while what it draws can still change underneath. */
  get frameRevision(): number {
    return this.#frameRevision;
  }

  computeFrame(input: LayoutInput): GeometryFrame {
    this.#frameRevision++;
    // #495, #414: does this frame ask a different question about which rows exist, in what order,
    // than the last one did? A scroll or a pan never does — `visible`/`revision`/`rowHeight` are not
    // in `RowPlanInput` at all — so most frames skip straight to the cached `#plan` below.
    this.ensureRowPlan(planInputFrom(input), { rowHeight: input.rowHeight, registry: input.variants });
    return placeFrame(input, this.#plan, this.#memory, this.#decorations);
  }

  /** Brings `#plan` — and `#memory`, the height index and `rowMemory` a Bar read answers from — up
   *  to date with `input`, without painting a frame (#424). A write between frames —
   *  `entries.remove()`, `entries.add()`, a reparent, a `rowSource` change — leaves the row tree
   *  this planned stale until the next `computeFrame` call; a synchronous reader like
   *  `collapseStateOf` cannot wait for that, and neither can a `reveal` that follows it in the same
   *  tick: `rowTop`/`barsForEntry` must answer about the same row tree `rowIndexForEntry` just did.
   *
   *  Review #424 point 1 named the gap this closes: an earlier cut synced `#plan` here but left
   *  `#memory` behind, so a read landed between two different row trees — `rowIndexForEntry` saw the
   *  new one, `rowTop`/`barsForEntry` still saw the last painted frame's. Chosen fix: `#memory.sync`
   *  runs here too, every call, replan or not — never a second, memory-only staleness for a caller
   *  to reason about. `sync` is itself a set of identity checks (`frame-memory.ts`), so a call where
   *  nothing moved costs one pass, not a rebuild — the same price `computeFrame` already pays on
   *  every scroll frame. `rowHeight`/`registry` sit outside `RowPlanInput` on purpose (they never
   *  decide whether to replan), so the caller hands them here as `RowPlanMemoryInput`. */
  ensureRowPlan(input: RowPlanInput, memory: RowPlanMemoryInput): void {
    if (this.#lastPlanInput === undefined || !samePlanInput(this.#lastPlanInput, input)) {
      this.#planRows(input);
      this.#lastPlanInput = input;
    }
    this.#memory.sync({
      plan: this.#plan,
      rowHeight: memory.rowHeight,
      entries: input.entries,
      registry: memory.registry,
      datasetRevision: input.datasetRevision,
    });
  }

  // #495, #414: takes `RowPlanInput`, never `LayoutInput` — a field this method reads that is not
  // on that type is a compile error, so the cache key can never fall out of step with what plans.
  #planRows(planInput: RowPlanInput): void {
    const open = resolveOpenRows({
      entries: planInput.entries,
      ...(planInput.rows !== undefined ? { rows: planInput.rows } : {}),
      ...(planInput.fieldCompares !== undefined ? { fieldCompares: planInput.fieldCompares } : {}),
      ...(planInput.fieldContext !== undefined ? { fieldContext: planInput.fieldContext } : {}),
      ...(planInput.entryRulePorts !== undefined ? { entryRulePorts: planInput.entryRulePorts } : {}),
    });
    this.#indexOpenRows(open);
    this.#plan = stampIndex(applyCollapse(open, new Set(planInput.collapsed ?? [])));
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

  /** Every Bar this entry draws, in the order its row produced them (#185, #295) — the full Bar,
   * box included, not just its id. `reveal` needs a boxed Bar's own painted width (`barSpan` takes
   * the whole `Bar`), and this is the one place that answer comes from: the row memory
   * `computeFrame` already built. Empty when collapse hid the row, or when the entry draws nothing.
   * Producing a row on demand costs a memoized pass (`rowMemory`), acceptable here because reveal
   * is a gesture, not the hot path. */
  barsForEntry(id: EntryId): readonly Bar[] {
    const rowId = this.#rowOfEntry.get(id);
    if (rowId === undefined) return [];
    const bars: Bar[] = [];
    for (const bar of this.#memory.rowMemory(rowId).bars) {
      if (bar.entryId === id) bars.push(bar);
    }
    return bars;
  }

  /** Every Bar this entry draws, by id, in the order its row produced them (#185). It answers from
   * the producer output, never from the `${entryId}:${partIndex}` id convention, so a plugin Kind
   * that draws several Bars from one Entry gets the same true answer. Empty when collapse hid the
   * row, or when the entry draws nothing. */
  barIdsForEntry(id: EntryId): readonly BarId[] {
    return this.barsForEntry(id).map((bar) => bar.id);
  }

  /** Whether this row can expand or collapse, read from the row tree before collapse hides
   *  descendants — so a row a collapsed ancestor hides still answers (#424). `undefined` for an id
   *  no current row plan holds: a removed row, or a stale id. */
  expandableOfRow(id: RowId): boolean | undefined {
    return this.#expandableOfRow.get(id);
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
    this.#expandableOfRow.clear();
    for (const row of open) {
      this.#entryIdsOfRow.set(row.id, row.entryIds);
      for (const id of row.entryIds) this.#rowOfEntry.set(id, row.id);
      if (row.parentRowId !== undefined) this.#parentOfRow.set(row.id, row.parentRowId);
      this.#expandableOfRow.set(row.id, row.expandable);
    }
  }
}

/** Shared, so a row that owns nothing costs no allocation on the pointer path (I5). */
const NO_ENTRY_IDS: readonly EntryId[] = Object.freeze([]);
