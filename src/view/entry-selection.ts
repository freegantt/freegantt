// view/ — one sentence: what is selected, and what would this land select? (finding 15, #230 R4;
// ADR 0010, #212, #216 Q3, #421 ADR 0025).
//
// Question B, one owner. `interaction/entry-gestures.ts` used to re-derive ADR 0010's pane rule with
// its own switch on hit kind — the same switch `ContainerDom#resolve` already makes.
// `selectableEntriesOf` moved here so that switch runs once, in `view/`, and `interaction/` only
// ever asks the answer.
//
// Its home is a class, not a free function on `GanttShell`, because the shell must not grow (#230
// §8). `EntrySelection` takes the shell's own Selection members with it — the getter, the setter,
// the row-rank cache, the sole-entry read and the propose/step/forget verbs. They move here as one
// unit, so a later reader finds the whole story in one file.
//
// `entryIds` publishes on the `ActedOn` shape (`api/command.ts`). `GanttShell#buildCommandContext`
// reads this one object where it used to compose a literal from two separate reads — the #216 Q3
// carry this plan hands off.
//
// #421, ADR 0025: the Selection holds `EntryId` alone. A former Segment is an ordinary child Entry
// now, so there is no second id space to project through.

import { entryIdOfBar } from '../model/index.js';
import type { ChangeSet, EntryId, RowId } from '../model/index.js';
import type { PlannedRowKind } from '../layout/index.js';
import { isPlannedHeaderRow } from '../layout/index.js';
import type { GestureCapability } from './capability.js';
import type { SelectionChange } from './event-bus.js';
import type { EntryHit } from './entry-gesture-context.js';

/** The row fields this module reads. `FrameLayout.plannedRows()` returns more; a narrower shape
 *  keeps this module's coupling to the layout's own row type as small as `TreeCollapseRow`'s. */
export interface EntrySelectionRow {
  readonly id: RowId;
  readonly kind: PlannedRowKind;
  readonly entryIds: readonly EntryId[];
}

/** What `EntrySelection` asks the shell. Call: `new EntrySelection({ plannedRows: () =>
 *  layout.plannedRows(), ... })` (the `TreeCollapse`/`ColumnChrome` style, `gantt-shell.ts`'s own
 *  `#entrySelectionPorts`). */
export interface EntrySelectionPorts {
  /** The resolved row plan, after filter, sort and collapse (#199). */
  plannedRows(): readonly EntrySelectionRow[];
  /** Which row currently shows this Entry (D4). */
  rowIdForEntry(id: EntryId): RowId | undefined;
  /** D-S3-9's one capability resolution (I14) — never resolved twice for the same question. */
  canGesture(capability: GestureCapability, id: EntryId): boolean;
  /** The cancelable `beforeSelectionChange` → apply → `selectionChange` sequence (D-S3-10). Returns
   *  whether `apply` ran, the same boolean `GanttShell#proposeChange` already returns. */
  confirm(change: SelectionChange, apply: () => void): boolean;
  /** The past-tense event alone, with no veto — the prune below is not a user gesture to cancel. */
  announce(change: SelectionChange): void;
  /** Writes the backend's own Selection state and re-derives hover/gesture affordances from it. */
  paint(entryIds: readonly EntryId[]): void;
}

/** The Selection (#212, ADR 0010, ADR 0025) — Entry ids, plus the pane rule that decides what a
 *  pointer hit would add to it. One instance per Gantt (I2): two Gantts bound to one Dataset hold
 *  independent Selections. */
export class EntrySelection {
  #ports: EntrySelectionPorts;
  #entries: readonly EntryId[] = [];

  constructor(ports: EntrySelectionPorts) {
    this.#ports = ports;
  }

  /** The Selection itself — Entry ids, in the order the pane rule (or a proposed write) gave them. */
  get entryIds(): readonly EntryId[] {
    return this.#entries;
  }

  /** The Entries this hit selects (#212, ADR 0010, ADR 0025). A row names every selectable Entry it
   *  owns; a bar names its own Entry when that Entry may be selected. Both branches read the answer
   *  the view already holds — a bar's Entry is `entryIdOfBar`, the same lookup `DomTarget` uses. The
   *  one switch on hit kind `ContainerDom#resolve` also makes; `interaction/` never makes it a
   *  second time. */
  selectableEntriesOf(hit: EntryHit): readonly EntryId[] {
    if (hit.kind === 'row') return this.#selectableEntriesOfRow(hit.rowId);
    const entryId = entryIdOfBar(hit.barId);
    return this.#ports.canGesture('select', entryId) ? [entryId] : [];
  }

  /** The selectable entries in resolved row order — a keyboard row step, a shift-range, and a
   *  select-all all walk this list (D-S4-32). */
  selectableEntriesInRowOrder(): readonly EntryId[] {
    const out: EntryId[] = [];
    for (const row of this.#ports.plannedRows()) {
      if (isPlannedHeaderRow(row)) continue;
      for (const id of row.entryIds) if (this.#ports.canGesture('select', id)) out.push(id);
    }
    return out;
  }

  /** The Selection's sole Entry, when it names exactly one (#212, ADR 0025): O(1). */
  soleEntry(): EntryId | undefined {
    return this.#entries.length === 1 ? this.#entries[0] : undefined;
  }

  /** Drops the Entries `changeSet.removed` names (#212, finding 8) — left uncorrected, a dead id
   *  reaches a mutation and throws. Announces `selectionChange` alone; there is no user gesture here
   *  for a veto to refuse. */
  forgetEntriesTheDatasetDropped(changeSet: ChangeSet): void {
    if (this.#entries.length === 0) return;
    const dropped = new Set(changeSet.removed.map(({ entity }) => entity.id));
    if (dropped.size === 0) return;
    const kept = this.#entries.filter((id) => !dropped.has(id));
    if (kept.length === this.#entries.length) return;
    const from = this.#entries;
    this.#entries = kept;
    this.#ports.paint(kept);
    this.#ports.announce({ from, to: kept });
  }

  /** Proposes a new Selection through the cancelable `beforeSelectionChange` → `selectionChange`
   *  sequence (D-S3-10). A no-op when `next` is the same list already selected. */
  propose(next: readonly EntryId[]): void {
    const from = this.#entries;
    if (from.length === next.length && from.every((id, i) => id === next[i])) return;
    this.#ports.confirm({ from, to: next }, () => {
      this.#entries = next;
      this.#ports.paint(next);
    });
  }

  /** #212: steps every selected Entry one position within its own row (#421 C3, spike Q9).
   *  `Mod+ArrowRight` and `Mod+ArrowLeft` run it. A shared row can hold several selected Entries.
   *  Each one steps on its own row's list, so a multi-Entry pick on one row moves together instead of
   *  collapsing to the first. An Entry already at the end of its row's list stays. The chord writes
   *  nothing when no Entry can move — the same clamp the `ArrowUp`/`ArrowDown` row step uses. */
  step(direction: 1 | -1): void {
    if (this.#entries.length === 0) return;
    const rowEntryIds = new Map<RowId, readonly EntryId[]>();
    let moved = false;
    const next = this.#entries.map((entryId) => {
      const rowId = this.#ports.rowIdForEntry(entryId);
      if (rowId === undefined) return entryId;
      let entryIds = rowEntryIds.get(rowId);
      if (entryIds === undefined) {
        entryIds = this.#selectableEntriesOfRow(rowId);
        rowEntryIds.set(rowId, entryIds);
      }
      const current = entryIds.indexOf(entryId);
      const stepped = current === -1 ? undefined : entryIds[current + direction];
      if (stepped === undefined) return entryId;
      moved = true;
      return stepped;
    });
    if (!moved) return;
    this.propose(next);
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
