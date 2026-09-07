// layout/ — row-source types. Pure data: no pixels, no Dataset, no FieldSource (D-S4-19, D-S4-21).

import type { Entry, EntryId, FieldContext, FieldKey, RowId } from '../../model/index.js';
import type { FieldCompare } from '../column.js';

export type RowHeightMode = 'fixed' | 'pack';

export type FilterPolicy = 'keepAncestors' | 'matchOnly';

export type RowFilter = (entry: Entry, fields?: FieldContext) => boolean;

export interface RowSort {
  field: FieldKey;
  direction?: 'asc' | 'desc';
  compare?(a: unknown, b: unknown, fields?: FieldContext): number;
}

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
  groupBy(entry: Entry, fields?: FieldContext): string;
}

/** What `{ source: 'custom', resolve }` receives. Entries only — no pixels, no Gantt. */
export interface CustomRowInput {
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
  resolve(input: CustomRowInput): readonly CustomRow[];
  heightMode?: RowHeightMode;
}

export type RowSource = EntriesRowSource | GroupRowSource | CustomRowSource;

export const DEFAULT_ROW_SOURCE: EntriesRowSource = Object.freeze({ source: 'entries', tree: false });

/** `filterPolicyOf`'s default (#248 S4-2) — named here, beside the type it defaults, so
 *  `resolveRowSource` and `filterPolicyOf` share one literal instead of two. */
export const DEFAULT_FILTER_POLICY: FilterPolicy = 'keepAncestors';

/** Each resolved source extends the source a consumer authored, and narrows the keys it fills from
 *  optional to required (#248 S4-2). A consumer who omits `heightMode`/`filterPolicy`/`tree` still
 *  reads a value back off `gantt.rowSource`. */
export interface ResolvedEntriesRowSource extends EntriesRowSource {
  heightMode: RowHeightMode;
  filterPolicy: FilterPolicy;
  tree: boolean;
}

export interface ResolvedGroupRowSource extends GroupRowSource {
  heightMode: RowHeightMode;
  filterPolicy: FilterPolicy;
}

/** `'custom'` takes no `filter`/`sort`/`filterPolicy`/`tree` (D-S4-21) — only `heightMode` to fill. */
export interface ResolvedCustomRowSource extends CustomRowSource {
  heightMode: RowHeightMode;
}

/** What `Gantt.rowSource` reads back (#248 S4-2): every key a `RowSource` may omit, filled with the
 *  default `layout/` already applies at consumption (`heightModeOf`, `filterPolicyOf`, the entries
 *  source's own `tree` check) — so a consumer never has to know those defaults to read them. */
export type ResolvedRowSource = ResolvedEntriesRowSource | ResolvedGroupRowSource | ResolvedCustomRowSource;

/** Fills every key `layout/` defaults at consumption, once, so a caller reads the same answer
 *  `layout/` would compute (#248 S4-2). `tree` mirrors `entries-source.ts`'s own check: anything but the
 *  literal `true` resolves to `false`. */
export function resolveRowSource(source: RowSource): ResolvedRowSource {
  const heightMode = heightModeOf(source);
  if (source.source === 'custom') return { ...source, heightMode };
  const filterPolicy = source.filterPolicy ?? DEFAULT_FILTER_POLICY;
  if (source.source === 'entries') {
    return { ...source, heightMode, filterPolicy, tree: source.tree === true };
  }
  return { ...source, heightMode, filterPolicy };
}

/** Derived row classification — not `Entry.kind` (D-S4-23). */
export type PlannedRowKind = 'entry' | 'header';

/** Row sources build rows through this lookup, never a bare `'header'`/`'entry'` literal, so the
 *  kind used to construct a row and the kind `isPlannedHeaderRow` reads back stay the same guard. */
export const PLANNED_ROW_KIND = Object.freeze({
  header: 'header',
  entry: 'entry',
} as const satisfies Record<string, PlannedRowKind>);

/** True when the row stands for no Entry (D-S4-23). Compares through a frozen lookup so `layout/`
 *  never branches on a kind string literal inline (`no-kind-literal`). */
export function isPlannedHeaderRow(row: Pick<PlannedRow, 'kind'>): boolean {
  return row.kind === PLANNED_ROW_KIND.header;
}

/** Internal row before pixels. A header row stands for no Entry (D-S4-23). */
export interface PlannedRow {
  id: RowId;
  kind: PlannedRowKind;
  index: number;
  depth: number;
  entryIds: readonly EntryId[];
  expandable: boolean;
  expanded: boolean;
  heightMode: RowHeightMode;
  headerLabel?: string;
  /** `true` when this row's entry matched the active filter; `false` when kept only for descendants. */
  matched?: boolean;
}

/** What a row source builds before `resolveRows` stamps the real `index` (St6) — `index` has one
 *  owner, so a source never invents a placeholder for it. `parentRowId` is pipeline-only: filter,
 *  sort, and collapse walk it, then `stampIndex` drops it. */
export type UnindexedRow = Omit<PlannedRow, 'index'> & {
  parentRowId?: RowId;
};

/** One pass over the rows: source production plus filter, sort, and collapse. */
export interface RowPassInput {
  entries: readonly Entry[];
  source: RowSource;
  collapsed: ReadonlySet<string>;
  fieldCompares?: readonly FieldCompare[];
  fieldContext?: FieldContext;
}

export function heightModeOf(source: RowSource): RowHeightMode {
  return source.heightMode ?? 'fixed';
}
