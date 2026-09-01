// view/ — collapsed RowIds for one Gantt (D-S4-22). Never reaches the Dataset.

import type { RowId } from '../model/index.js';

export interface CollapseChange {
  readonly from: readonly RowId[];
  readonly to: readonly RowId[];
}
