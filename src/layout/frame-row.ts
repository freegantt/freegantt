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
  laneCount: number;
  depth: number;
  expandable: boolean;
  expanded: boolean;
  /** `false` when the row was kept only because a descendant matched the filter. */
  matched?: boolean;
  /** One library-formatted string per configured grid column, in column order (ADR 0005). */
  cells: readonly string[];
  /** The row's own Entry (undefined for a header row, D-S4-23, or a custom row with none). What a
   *  `cellRenderer` resolves its `entry` context from (S5.4, D-S5-11) — the same primary entry
   *  `cellsForRow` already reads to format `cells` above, just carried out to the paint step too. */
  entryId?: EntryId;
}
