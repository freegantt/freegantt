// layout/ — row-source types. Pure data: no pixels, no Dataset, no FieldSource (D-S4-19, D-S4-21).

import type { Entry, EntryId, FieldKey, RowId } from '../../model/index.js';

export type RowHeightMode = 'fixed' | 'pack';

/** Call: `filter: (entry) => entry.meta.team === 'A'`. Applied in S4.9. */
export type RowFilter = (entry: Entry) => boolean;

/** Call: `sort: { field: 'start', direction: 'asc' }`. Applied in S4.9. */
export interface RowSort {
  field: FieldKey;
  direction?: 'asc' | 'desc';
  compare?(a: unknown, b: unknown): number;
}

export type FilterPolicy = 'keepAncestors' | 'matchOnly';

export interface EntriesRowSource {
  source: 'entries';
  tree?: boolean;
  heightMode?: RowHeightMode;
  filter?: RowFilter;
  sort?: RowSort;
  filterPolicy?: FilterPolicy;
}

export interface GroupRowSource {
  source: 'group';
  groupBy(entry: Entry): string;
  heightMode?: RowHeightMode;
  filter?: RowFilter;
  sort?: RowSort;
  filterPolicy?: FilterPolicy;
}

/** What `{ source: 'custom', resolve }` receives. Entries only — no pixels, no Gantt. */
export interface RowResolveInput {
  entries: readonly Entry[];
}

/** Public DTO for `{ source: 'custom' }`. Not the internal `PlannedRow`. */
export interface CustomRow {
  id: string;
  entryIds?: readonly string[];
  label?: string;
}

export interface CustomRowSource {
  source: 'custom';
  resolve(input: RowResolveInput): readonly CustomRow[];
  heightMode?: RowHeightMode;
}

export type RowSource = EntriesRowSource | GroupRowSource | CustomRowSource;

export const DEFAULT_ROW_SOURCE: EntriesRowSource = Object.freeze({ source: 'entries', tree: false });

/** Internal row before pixels. `kind: 'header'` stands for no Entry (D-S4-23). */
export interface PlannedRow {
  id: RowId;
  kind: 'entry' | 'header';
  index: number;
  depth: number;
  entryIds: readonly EntryId[];
  expandable: boolean;
  expanded: boolean;
  heightMode: RowHeightMode;
  headerLabel?: string;
}

export interface RowResolutionInput {
  entries: readonly Entry[];
  source: RowSource;
  collapsed: ReadonlySet<string>;
}

export function heightModeOf(source: RowSource): RowHeightMode {
  return source.heightMode ?? 'fixed';
}
