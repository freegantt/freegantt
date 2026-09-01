// view/ — collapsed RowIds for one Gantt (D-S4-22). Never reaches the Dataset.

import { rowId } from '../model/index.js';
import type { RowId } from '../model/index.js';

export interface CollapseChange {
  readonly from: readonly RowId[];
  readonly to: readonly RowId[];
}

function sameIds(a: readonly string[], b: readonly string[]): boolean {
  return a.length === b.length && a.every((id, i) => id === b[i]);
}

export class CollapseState {
  #ids: readonly RowId[] = [];

  get ids(): readonly RowId[] {
    return this.#ids;
  }

  propose(next: readonly string[]): CollapseChange | undefined {
    const to = Object.freeze(next.map((id) => rowId(id)));
    if (sameIds(this.#ids, to)) return undefined;
    return { from: this.#ids, to };
  }

  commit(to: readonly RowId[]): void {
    this.#ids = to;
  }
}
