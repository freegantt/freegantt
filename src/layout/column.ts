// layout/ — plain-data column types. No registry, no Dataset, no FieldSource (D-S4-13).

import type { Entry, FieldKey } from '../model/index.js';

/** Paint description for one Grid column. `format` stays on `ResolvedColumn` and never reaches a backend. */
export interface FrameColumn {
  key: FieldKey;
  header: string;
  width?: number;
  flex?: number;
  align: 'start' | 'end';
}

/** Visible Grid column, bound with this Gantt's locale (D-S4-13). */
export interface ResolvedColumn extends FrameColumn {
  format(entry: Entry): string;
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
