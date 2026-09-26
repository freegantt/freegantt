// layout/ — plain-data column types. No registry, no Dataset, no Field value access.

import type { ColumnAlign, ColumnRenderer, Entry, FieldKey } from '../model/index.js';

export type { ColumnAlign } from '../model/index.js';

/** Paint description for one Grid column. `format` stays on `ResolvedColumn` and never reaches a
 *  backend. `resizable`/`movable` do reach a backend (S5.7) — they paint the resizer grip's
 *  visibility and the header cell's cursor, so they travel the same path `width`/`flex` already take
 *  from `ResolvedColumn` down through `columnsForFrame` (`layout/frame.ts`).
 *
 *  `field` names the column, everywhere a column is named (#194): a Field has a `key`, and
 *  a Grid column carries the `field` it shows. `render/dom` then uses that value as its own keyed
 *  paint key, which is a different job and keeps its own word. */
export interface FrameColumn {
  field: FieldKey;
  header: string;
  width?: number;
  flex?: number;
  align: ColumnAlign;
  resizable?: boolean;
  movable?: boolean;
}

/** Visible Grid column, bound with this Gantt's locale. `resizable`/`movable` are optional
 *  — absent reads as the default `true` (S5.7); a fixture that never mentions column chrome
 *  stays unchanged. `columnRenderer` stays optional too: undefined means "fall back to the Gantt-wide
 *  one". */
export interface ResolvedColumn extends FrameColumn {
  format(entry: Entry): string;
  columnRenderer?: ColumnRenderer;
  resizable?: boolean;
  movable?: boolean;
  /** `true` marks this column for the default tooltip body. Not a paint concern, so it
   *  stays off `FrameColumn`. */
  tooltip?: boolean;
}

/** Default sort order for one declared Field. Bound with this Gantt's locale. Not a Grid column. */
export interface FieldCompare {
  key: FieldKey;
  readStored(entry: Entry): unknown;
  compareStored(a: unknown, b: unknown): number;
}

/** #139: how wide the columns themselves are — where the last column's right edge falls. Every
 *  column fixed means the sum answers it. A flex column has no width until the pane lays it out, so
 *  a set holding one has no edge to name: `undefined`. `GanttShell` caps the splitter drag with
 *  this, so dragging the grid pane wider than its own columns cannot open dead space beside them. */
export function totalColumnWidth(columns: readonly FrameColumn[]): number | undefined {
  let total = 0;
  for (const column of columns) {
    if (column.width === undefined) return undefined;
    total += column.width;
  }
  return total;
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
