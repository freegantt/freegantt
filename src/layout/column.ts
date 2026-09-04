// layout/ — plain-data column types. No registry, no Dataset, no FieldSource (D-S4-13).

import type { ColumnAlign, ColumnCellRenderer, Entry, FieldKey } from '../model/index.js';

/** Paint description for one Grid column. `format` stays on `ResolvedColumn` and never reaches a
 *  backend. `resizable`/`movable` do reach a backend (S5.7, D-S5-18) — they paint the resizer grip's
 *  visibility and the header cell's cursor, so they travel the same path `width`/`flex` already take
 *  from `ResolvedColumn` down through `columnsForFrame` (`layout/frame.ts`). */
export interface FrameColumn {
  key: FieldKey;
  header: string;
  width?: number;
  flex?: number;
  align: ColumnAlign;
  resizable?: boolean;
  movable?: boolean;
}

/** Visible Grid column, bound with this Gantt's locale (D-S4-13). `resizable`/`movable` are optional
 *  — absent reads as the default `true` (S5.7, D-S5-18); a fixture that never mentions column chrome
 *  stays unchanged. `cellRenderer` stays optional too: undefined means "fall back to the Gantt-wide
 *  one" (D-S5-17). */
export interface ResolvedColumn extends FrameColumn {
  format(entry: Entry): string;
  cellRenderer?: ColumnCellRenderer;
  resizable?: boolean;
  movable?: boolean;
  /** S5.8 honours this; S5.7 only carries it through resolution (I11 — appears with the code that
   *  honours it, not before, is about behaviour, not about the field existing on the resolved shape
   *  a later step reads). */
  editable?: boolean;
}

/** Default sort order for one declared Field. Bound with this Gantt's locale. Not a Grid column. */
export interface FieldCompare {
  key: FieldKey;
  readStored(entry: Entry): unknown;
  compareStored(a: unknown, b: unknown): number;
}

/** #126: the grid pane's own content width, in px. Fixed-width columns (`width` set) never
 *  shrink; flex columns (`width` unset) fill whatever room is left and shrink to fit, so they
 *  never force overflow on their own. When fixed columns alone already exceed `paneWidth`, the
 *  pane must widen to hold them (and gains a horizontal scrollbar) — otherwise it stays exactly
 *  `paneWidth`, which is today's byte-identical layout. */
export function gridContentWidth(columns: readonly FrameColumn[], paneWidth: number): number {
  const fixedWidth = columns.reduce((sum, column) => sum + (column.width ?? 0), 0);
  return Math.max(paneWidth, fixedWidth);
}
