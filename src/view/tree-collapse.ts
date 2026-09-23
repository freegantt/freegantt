// view/ — collapse set plus tree-arrow and ancestor-expand policy (C4).
// The shell still owns events, frames, twisty clicks, and `reveal()` geometry.

import { rowId } from '../model/index.js';
import type { Entry, EntryId, RowId } from '../model/index.js';
import type { CollapseChange, CollapseState } from './collapse-state.js';

/** The PlannedRow fields this module reads. Layout keeps the full row. */
export interface TreeCollapseRow {
  readonly id: RowId;
  readonly expandable: boolean;
  readonly expanded: boolean;
  readonly entryIds: readonly EntryId[];
}

/** What `TreeCollapse` asks the shell. Call: `new TreeCollapse({ plannedRows: () => layout.plannedRows(), ... })`. */
export interface TreeCollapseContext {
  plannedRows(): readonly TreeCollapseRow[];
  entries(): readonly Entry[];
  entry(id: EntryId): Entry | undefined;
  canSelect(id: EntryId): boolean;
  selected(): EntryId | undefined;
  proposeSelection(ids: readonly EntryId[]): void;
  /** Call: `confirm(change)` — the shell vetoes or applies; this module then stores `change.to`. */
  confirm(change: CollapseChange): boolean;
  /** The past-tense event alone, with no veto (#496 L2) — a load already committed, so there is no
   *  user gesture here for `beforeCollapseChange` to refuse. */
  announce(change: CollapseChange): void;
  rowIdForEntry(id: EntryId): RowId | undefined;
  ancestorRowIds(id: EntryId): readonly RowId[];
  /** Call: `expandableOfRow(rowId)` — the row tree's own answer, read past a collapsed ancestor
   *  (#424). `undefined` when no current row holds this id. */
  expandableOfRow(id: RowId): boolean | undefined;
}

function sameIds(a: readonly string[], b: readonly string[]): boolean {
  return a.length === b.length && a.every((id, i) => id === b[i]);
}

export class TreeCollapse {
  #ids: readonly RowId[] = [];
  /** The set `hydrate` last wrote — the Gantt's own starting collapse state (#496 L2). `[]` when
   *  `hydrate` is never called: an unhydrated Gantt starts with nothing collapsed. */
  #startIds: readonly RowId[] = [];
  #ctx: TreeCollapseContext;

  constructor(ctx: TreeCollapseContext) {
    this.#ctx = ctx;
  }

  get ids(): readonly RowId[] {
    return this.#ids;
  }

  /** Constructor-only: write the initial set with no event. Also remembers it as the starting
   *  state `resetToStartState` (#496 L2) returns to. */
  hydrate(next: readonly string[]): void {
    this.#ids = Object.freeze(next.map((id) => rowId(id)));
    this.#startIds = this.#ids;
  }

  /** Call: `tree.replace(gantt.collapsed)` — the live setter; vetoable through `confirm`. */
  replace(next: readonly string[]): void {
    this.#confirmIds(next);
  }

  collapse(id: RowId | string): void {
    const branded = rowId(String(id));
    if (this.#ids.includes(branded)) return;
    this.#confirmIds([...this.#ids, branded]);
  }

  expand(id: RowId | string): void {
    const branded = rowId(String(id));
    this.#confirmIds(this.#ids.filter((current) => current !== branded));
  }

  toggleCollapse(id: RowId | string): void {
    const branded = rowId(String(id));
    if (this.#ids.includes(branded)) this.expand(branded);
    else this.collapse(branded);
  }

  /** Call: `tree.collapseStateOf('p1')` — the row tree's own answer, not the frame's (#424): a row a
   *  collapsed ancestor hides still answers its own state. `undefined` for an id no current row
   *  holds, so "no such row" stays apart from `'leaf'`. A grouping header row answers by the same
   *  rule as any other row. */
  collapseStateOf(id: RowId | string): CollapseState | undefined {
    const branded = rowId(String(id));
    const expandable = this.#ctx.expandableOfRow(branded);
    if (expandable === undefined) return undefined;
    if (!expandable) return 'leaf';
    return this.#ids.includes(branded) ? 'collapsed' : 'expanded';
  }

  /** Collapses every expandable row in the current plan, and keeps ids already in the set. */
  collapseAll(): void {
    this.#confirmIds(this.#idsForCollapseAll());
  }

  expandAll(): void {
    if (this.#ids.length === 0) return;
    this.#confirmIds([]);
  }

  /** #496 L2: on `origin: 'load'`, collapse state returns to the Gantt's own starting state — the
   *  set `hydrate` last wrote, or `[]` when it was never called. Scroll and zoom are view settings,
   *  not data, and stay untouched (L2). Skips `confirm`'s `beforeCollapseChange` veto, the same
   *  posture `EntrySelection#forgetEntriesTheDatasetDropped` takes: a load already committed, so
   *  refusing the reset would leave collapse ids naming rows this data no longer has. */
  resetToStartState(): void {
    if (sameIds(this.#ids, this.#startIds)) return;
    const from = this.#ids;
    this.#ids = this.#startIds;
    this.#ctx.announce({ from, to: this.#startIds });
  }

  /** Call: `this.#treeCollapse.handleArrow('right')`. */
  handleArrow(direction: 'left' | 'right'): boolean {
    const selected = this.#ctx.selected();
    if (selected === undefined) return false;
    const row = this.#ctx.plannedRows().find((planned) => planned.entryIds.includes(selected));
    if (row === undefined) return false;
    const entry = this.#ctx.entry(selected);
    if (entry === undefined) return false;

    if (direction === 'right') {
      if (row.expandable && !row.expanded) {
        this.expand(row.id);
        return true;
      }
      if (row.expandable && row.expanded) {
        const child = this.#firstChildOf(selected);
        if (child !== undefined && this.#ctx.canSelect(child)) {
          this.#ctx.proposeSelection([child]);
          return true;
        }
      }
      return false;
    }

    if (row.expandable && row.expanded) {
      this.collapse(row.id);
      return true;
    }
    const parentId = entry.parent()?.id;
    if (parentId !== undefined && this.#ctx.canSelect(parentId)) {
      this.#ctx.proposeSelection([parentId]);
      return true;
    }
    return false;
  }

  /** Drops collapsed ancestors of `entryId`. Returns true when the set changed. */
  expandAncestorsOf(entryId: EntryId): boolean {
    const hiding = new Set(this.#ctx.ancestorRowIds(entryId).map(String));
    const own = this.#ctx.rowIdForEntry(entryId);
    if (own !== undefined) hiding.add(String(own));
    const keep = this.#ids.filter((id) => !hiding.has(String(id)));
    if (keep.length === this.#ids.length) return false;
    return this.#confirmIds(keep);
  }

  #confirmIds(next: readonly string[]): boolean {
    const to = Object.freeze(next.map((id) => rowId(id)));
    if (sameIds(this.#ids, to)) return false;
    const change: CollapseChange = { from: this.#ids, to };
    if (!this.#ctx.confirm(change)) return false;
    this.#ids = to;
    return true;
  }

  #idsForCollapseAll(): readonly string[] {
    const seen = new Set(this.#ids.map(String));
    const next = this.#ids.map(String);
    for (const row of this.#ctx.plannedRows()) {
      if (!row.expandable) continue;
      const id = String(row.id);
      if (seen.has(id)) continue;
      seen.add(id);
      next.push(id);
    }
    return next;
  }

  #firstChildOf(parentId: EntryId): EntryId | undefined {
    for (const entry of this.#ctx.entries()) {
      if (entry.parent()?.id === parentId) return entry.id;
    }
    return undefined;
  }
}
