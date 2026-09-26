// view/ — collapsed RowIds for one Gantt. Never reaches the Dataset.

import type { RowId } from '../model/index.js';

export interface CollapseChange {
  readonly from: readonly RowId[];
  readonly to: readonly RowId[];
}

/** What `gantt.collapseStateOf(id)` answers for one row (#424): `'leaf'` for a row that cannot
 *  expand, `'collapsed'`/`'expanded'` for one that can. Apart from `undefined`, which the method
 *  answers instead for an id no current row holds — a removed row, or a stale id. */
export type CollapseState = 'collapsed' | 'expanded' | 'leaf';
