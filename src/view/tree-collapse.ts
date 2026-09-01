// view/ — collapse set plus tree-arrow and ancestor-expand policy (C4).
// The shell still owns events, frames, twisty clicks, and `reveal()` geometry.

import { rowId } from '../model/index.js';
import type { Entry, EntryId, RowId } from '../model/index.js';
import { CollapseState } from './collapse-state.js';
import type { CollapseChange } from './collapse-state.js';

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
  applyCollapsed(ids: readonly string[]): void;
}

export class TreeCollapse {
  #state = new CollapseState();
  #ctx: TreeCollapseContext;

  constructor(ctx: TreeCollapseContext) {
    this.#ctx = ctx;
  }

  get ids(): readonly RowId[] {
    return this.#state.ids;
  }

  propose(next: readonly string[]): CollapseChange | undefined {
    return this.#state.propose(next);
  }

  commit(to: readonly RowId[]): void {
    this.#state.commit(to);
  }

  collapse(id: RowId | string): void {
    const branded = rowId(String(id));
    if (this.#state.ids.includes(branded)) return;
    this.#ctx.applyCollapsed([...this.#state.ids, branded]);
  }

  expand(id: RowId | string): void {
    const branded = rowId(String(id));
    this.#ctx.applyCollapsed(this.#state.ids.filter((current) => current !== branded));
  }

  toggleCollapse(id: RowId | string): void {
    const branded = rowId(String(id));
    if (this.#state.ids.includes(branded)) this.expand(branded);
    else this.collapse(branded);
  }

  /** Collapses every expandable row in the current plan, and keeps ids already in the set. */
  collapseAll(): void {
    this.#ctx.applyCollapsed(this.#idsForCollapseAll());
  }

  expandAll(): void {
    if (this.#state.ids.length === 0) return;
    this.#ctx.applyCollapsed([]);
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
    const parentId = entry.parentId;
    if (parentId !== undefined && this.#ctx.canSelect(parentId)) {
      this.#ctx.proposeSelection([parentId]);
      return true;
    }
    return false;
  }

  /** Drops collapsed ancestors of `entryId`. Returns true when the set changed. */
  expandAncestorsOf(entryId: EntryId): boolean {
    const keep = this.#state.ids.filter((id) => !this.#isAncestorRow(entryId, String(id)));
    if (keep.length === this.#state.ids.length) return false;
    this.#ctx.applyCollapsed(keep);
    return true;
  }

  #idsForCollapseAll(): readonly string[] {
    const seen = new Set(this.#state.ids.map(String));
    const next = this.#state.ids.map(String);
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
      if (entry.parentId === parentId) return entry.id;
    }
    return undefined;
  }

  #isAncestorRow(entryId: EntryId, candidateRowId: string): boolean {
    let current = this.#ctx.entry(entryId);
    while (current?.parentId !== undefined) {
      if (String(current.parentId) === candidateRowId) return true;
      current = this.#ctx.entry(current.parentId);
    }
    return false;
  }
}
