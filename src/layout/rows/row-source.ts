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

/** Shared by every row source that walks Entries directly — `'custom'` resolves its own rows, so it
 *  does not take these (D-S4-21). */
export interface RowSourceCommon {
  heightMode?: RowHeightMode;
  filter?: RowFilter;
  sort?: RowSort;
  filterPolicy?: FilterPolicy;
}

export interface EntriesRowSource extends RowSourceCommon {
  source: 'entries';
  tree?: boolean;
}

export interface GroupRowSource extends RowSourceCommon {
  source: 'group';
  groupBy(entry: Entry): string;
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

/** Internal row before pixels. Empty `entryIds` stands for a header row, no Entry (D-S4-23). */
export interface PlannedRow {
  id: RowId;
  index: number;
  depth: number;
  entryIds: readonly EntryId[];
  expandable: boolean;
  expanded: boolean;
  heightMode: RowHeightMode;
  headerLabel?: string;
}

/** What a row source builds before `resolveRows` stamps the real `index` (St6) — `index` has one
 *  owner, so a source never invents a placeholder for it. */
export type UnindexedRow = Omit<PlannedRow, 'index'>;

export interface RowResolutionInput {
  entries: readonly Entry[];
  source: RowSource;
  collapsed: ReadonlySet<string>;
}

export function heightModeOf(source: RowSource): RowHeightMode {
  return source.heightMode ?? 'fixed';
}
