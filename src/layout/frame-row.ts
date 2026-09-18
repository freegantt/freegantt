// layout/ — one row of a computed frame. Split out of frame.ts so the decoration provider types
// (layout/decoration.ts, D-S5-15) can name `FrameRow` without importing frame.ts back — frame.ts is
// itself the file that calls the decoration runner, so the dependency can only run one way.

import type { EntryId, RowId } from '../model/index.js';
import type { PlannedRowKind } from './rows/row-source.js';

export interface FrameRow {
  id: RowId;
  kind: PlannedRowKind;
  index: number;
  top: number;
  height: number;
  depth: number;
  expandable: boolean;
  expanded: boolean;
  /** `false` when the row was kept only because a descendant matched the filter. */
  matched?: boolean;
  /** One library-formatted string per configured grid column, in column order (ADR 0005). */
  gridCells: readonly string[];
  /** Every Entry this row owns, in the order the row source gave them (#185). Empty for a header
   *  row (D-S4-23) and for a custom row with none. A row click selects all of them.
   *
   *  The first one is the row's *subject*: what `cellsForRow` formats `cells` from, and what a
   *  `gridCellRenderer` resolves its `entry` context from (S5.4, D-S5-11). "The Entries this row owns"
   *  and "the Entry this row's cells describe" are two jobs, and only the second one is singular. */
  entryIds: readonly EntryId[];
}
