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
  compareStored(a: unknown, b: unknown): number;
}
