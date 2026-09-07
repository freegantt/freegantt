// view/ — one sentence: what is selected, and what would this land select? (finding 15, #230 R4;
// ADR 0010, #212, #216 Q3).
//
// Question B, one owner. `interaction/entry-gestures.ts` used to re-derive ADR 0010's pane rule with
// its own switch on hit kind — the same switch `ContainerDom#resolve` already makes. `selectableSegmentsOf`
// moved here so that switch runs once, in `view/`, and `interaction/` only ever asks the answer.
//
// Its home is a class, not a free function on `GanttShell`, because the shell must not grow (#230
// §8). `SegmentSelection` takes the shell's own six Selection members with it — the getter, the
// setter, the row-rank cache, the sole-entry read and the propose/step/forget verbs. They move here
// as one unit, so a later reader finds the whole story in one file.
//
// `segmentIds` and `entryIds` publish on one object, which is structurally an `ActedOn`
// (`api/command.ts`). `GanttShell#buildCommandContext` reads this one object where it used to
// compose a literal from two separate reads — the #216 Q3 carry this plan hands off.

import { segmentIdsDroppedBy } from '../data/change-set.js';
import { entryIdOfItem } from '../model/index.js';
import type { ChangeSet, EntryId, ItemId, RowId, SegmentId } from '../model/index.js';
import type { PlannedRowKind } from '../layout/index.js';
import { isPlannedHeaderRow } from '../layout/index.js';
import type { EntryStoreView } from '../model/index.js';
import type { Interactions } from './capability.js';
import type { SelectionChange } from './event-bus.js';
import type { EntryHit } from './entry-gesture-context.js';

/** The row fields this module reads. `FrameLayout.plannedRows()` returns more; a narrower shape
 *  keeps this module's coupling to the layout's own row type as small as `TreeCollapseRow`'s. */
export interface SegmentSelectionRow {
  readonly id: RowId;
  readonly kind: PlannedRowKind;
  readonly entryIds: readonly EntryId[];
}

/** What `SegmentSelection` asks the shell. Call: `new SegmentSelection({ entries: () =>
 *  dataset.entries, ... })` (the `TreeCollapse`/`ColumnChrome` style, `gantt-shell.ts`'s own
 *  `#segmentSelectionPorts`). */
export interface SegmentSelectionPorts {
  /** The Dataset's own read view — Entry lookups, and the Entry/Segment id projections ADR 0010
   *  introduced. */
  entries(): EntryStoreView;
  /** The resolved row plan, after filter, sort and collapse (#199). */
  plannedRows(): readonly SegmentSelectionRow[];
  /** Which row currently shows this Entry (D4). */
  rowIdForEntry(id: EntryId): RowId | undefined;
  /** Every Segment this bar stands for — `FrameLayout.segmentIdsForItem` (#212). */
  segmentIdsForItem(id: ItemId): readonly SegmentId[];
  /** D-S3-9's one capability resolution (I14) — never resolved twice for the same question. */
  canGesture(capability: keyof Interactions, id: EntryId): boolean;
  /** The cancelable `beforeSelectionChange` → apply → `selectionChange` sequence (D-S3-10). Returns
   *  whether `apply` ran, the same boolean `GanttShell#proposeChange` already returns. */
  confirm(change: SelectionChange, apply: () => void): boolean;
  /** The past-tense event alone, with no veto — the prune below is not a user gesture to cancel. */
  announce(change: SelectionChange): void;
  /** Writes the backend's own Selection state and re-derives hover/gesture affordances from it. */
  paint(segmentIds: readonly SegmentId[]): void;
}

/** The Selection (#212, ADR 0010) — Segment ids, plus the pane rule that decides what a pointer hit
 *  would add to it. One instance per Gantt (I2): two Gantts bound to one Dataset hold independent
 *  Selections. */
export class SegmentSelection {
  #ports: SegmentSelectionPorts;
  #segments: readonly SegmentId[] = [];

  constructor(ports: SegmentSelectionPorts) {
    this.#ports = ports;
  }

  /** The Selection itself — Segment ids. */
  get segmentIds(): readonly SegmentId[] {
    return this.#segments;
  }

  /** The Entries the Selection's Segments belong to, deduped, in row order (#212, ADR 0010). It is
   *  one projection. The public getter, the affordance ids, the gesture pipeline and every command
   *  context read it. So no two of them can disagree about what is selected. An Entry a collapse hid
   *  keeps its place behind the rows that are showing. `Array.prototype.sort` is stable, and two
   *  Entries with no row rank compare equal, so both fall back to the order `entryIdsOfSegments`
   *  gave them. (Finding 13: a naive `rank ?? Infinity` subtraction gives `Infinity - Infinity`,
   *  which is `NaN` — not the equal-comparison a stable sort needs.) */
  get entryIds(): readonly EntryId[] {
    const rank = this.#rowRankByEntryId();
    const ids = this.#ports.entries().entryIdsOfSegments(this.#segments);
    return [...ids].sort((a, b) => {
      const rankA = rank.get(a);
      const rankB = rank.get(b);
      if (rankA === undefined) return rankB === undefined ? 0 : 1;
      if (rankB === undefined) return -1;
      return rankA - rankB;
    });
  }

  /** The Segments this hit selects (#212, ADR 0010). A row names every Segment of every selectable
   *  Entry it owns; a bar names its own Segment when its Entry may be selected. Both branches read
   *  the answer the view already holds — `segmentIdsForItem` fills the same table
   *  `DomTarget.segmentIds` does. The one switch on hit kind `ContainerDom#resolve` also makes;
   *  `interaction/` never makes it a second time. */
  selectableSegmentsOf(hit: EntryHit): readonly SegmentId[] {
    if (hit.kind === 'row') {
      return this.#ports.entries().segmentIdsOfEntries(this.#selectableEntriesOfRow(hit.rowId));
    }
    const entryId = entryIdOfItem(hit.itemId);
    return this.#ports.canGesture('select', entryId) ? this.#ports.segmentIdsForItem(hit.itemId) : [];
  }

  /** The selectable entries in resolved row order — a keyboard row step and a shift-range both walk
   *  this list (D-S4-32). */
  selectableEntriesInRowOrder(): readonly EntryId[] {
    const out: EntryId[] = [];
    for (const row of this.#ports.plannedRows()) {
      if (isPlannedHeaderRow(row)) continue;
      for (const id of row.entryIds) if (this.#ports.canGesture('select', id)) out.push(id);
    }
    return out;
  }

  /** Row order, then each Entry's own Segment order — the order the panes draw them (#212). It
   *  reuses the row walk the keyboard step already uses, so a shift-range and a row step cannot
   *  disagree about which Entry comes first. */
  selectableSegmentsInRowOrder(): readonly SegmentId[] {
    return this.#ports.entries().segmentIdsOfEntries(this.selectableEntriesInRowOrder());
  }

  /** The Selection's sole Entry, and its Segment count (#212, findings 6-7): O(selection) (I5). */
  soleEntry(): { id: EntryId; segmentCount: number } | undefined {
    const entries = this.#ports.entries();
    let soleId: EntryId | undefined;
    let count = 0;
    for (const id of this.#segments) {
      const ownerId = entries.entryIdOfSegment(id);
      if (ownerId === undefined) continue;
      if (soleId === undefined) soleId = ownerId;
      else if (soleId !== ownerId) return undefined;
      count++;
    }
    return soleId === undefined ? undefined : { id: soleId, segmentCount: count };
  }

  /** Drops the Segments `segmentIdsDroppedBy(changeSet)` names (#212, finding 8) — left uncorrected,
   *  a dead id reaches a mutation and throws. Announces `selectionChange` alone; there is no user
   *  gesture here for a veto to refuse. */
  forgetSegmentsTheDatasetDropped(changeSet: ChangeSet): void {
    if (this.#segments.length === 0) return;
    const dropped = segmentIdsDroppedBy(changeSet);
    if (dropped.size === 0) return;
    const kept = this.#segments.filter((id) => !dropped.has(id));
    if (kept.length === this.#segments.length) return;
    const from = this.#segments;
    this.#segments = kept;
    this.#ports.paint(kept);
    this.#ports.announce({ from, to: kept });
  }

  /** Proposes a new Selection through the cancelable `beforeSelectionChange` → `selectionChange`
   *  sequence (D-S3-10). A no-op when `next` is the same list already selected. */
  propose(next: readonly SegmentId[]): void {
    const from = this.#segments;
    if (from.length === next.length && from.every((id, i) => id === next[i])) return;
    this.#ports.confirm({ from, to: next }, () => {
      this.#segments = next;
      this.#ports.paint(next);
    });
  }

  /** #212: steps the Selection between the Segments of the row it already sits on. `Mod+ArrowRight`
   *  and `Mod+ArrowLeft` run it. A row that draws one bar has nowhere to step, so the chord writes
   *  nothing. It clamps at both ends, the same way the `ArrowUp`/`ArrowDown` row step does. */
  step(direction: 1 | -1): void {
    const selected = this.entryIds[0];
    if (selected === undefined) return;
    const rowId = this.#ports.rowIdForEntry(selected);
    if (rowId === undefined) return;
    const segmentIds = this.#ports.entries().segmentIdsOfEntries(this.#selectableEntriesOfRow(rowId));
    const current = segmentIds.findIndex((id) => this.#segments.includes(id));
    const next = segmentIds[current + direction];
    if (current === -1 || next === undefined) return;
    this.propose([next]);
  }

  /** Where each Entry sits in the resolved row order. It is built once per projection. So ordering
   *  the Selection costs one pass over the plan, not one search per selected Entry. */
  #rowRankByEntryId(): ReadonlyMap<EntryId, number> {
    const rank = new Map<EntryId, number>();
    for (const row of this.#ports.plannedRows()) {
      for (const id of row.entryIds) if (!rank.has(id)) rank.set(id, rank.size);
    }
    return rank;
  }

  /** #185: which Entries a row click selects. The row plan owns the relation and `canGesture`
   *  owns the answer, so a caller asks one question instead of looking either one up. An Entry
   *  that refuses `select` is skipped; it never blocks the rest of the row. */
  #selectableEntriesOfRow(id: RowId): readonly EntryId[] {
    const row = this.#ports.plannedRows().find((planned) => planned.id === id);
    if (row === undefined || isPlannedHeaderRow(row)) return [];
    return row.entryIds.filter((entryId) => this.#ports.canGesture('select', entryId));
  }
}
