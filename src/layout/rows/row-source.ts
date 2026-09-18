// layout/ — row-source types. Pure data: no pixels, no Dataset (D-S4-19, D-S4-21). A Field registry
// reaches this file as a port only (`EntryRulePorts`, #421 C1) — `childrenAsSegments`'s match needs
// each Field's own `equals`, the same way `fieldCompares`/`fieldContext` already carry a bound
// answer in rather than importing the registry itself.

import type { Entry, EntryId, FieldContext, FieldKey, RowId } from '../../model/index.js';
import type { EntryRule, EntryRulePorts } from '../entry-rule.js';
import type { FieldCompare } from '../column.js';

export type FilterPolicy = 'keepAncestors' | 'matchOnly';

/** Does this row stay? The row answers its own questions — `entry.read('team')`, `entry.hasChildren`
 *  — so nothing rides beside it (ADR 0017). */
export type RowFilter = (entry: Entry) => boolean;

export interface RowSort {
  field: FieldKey;
  direction?: 'asc' | 'desc';
  compare?(a: unknown, b: unknown, fields?: FieldContext): number;
}

/** Shared by every row source that walks Entries directly — `'custom'` resolves its own rows, so it
 *  does not take these (D-S4-21).
 *
 *  Every key takes an explicit `undefined`, so one setting turns off through the same spread that
 *  turns it on (#254): `{ ...current, sort: undefined }`. A bare `sort?: RowSort` rejects that
 *  spread under `exactOptionalPropertyTypes`, and the only route left is a rest-destructure with a
 *  discarded binding. `applyFilter` and `applySort` already take `undefined` and return early on
 *  it, so the value reaches a reader that handles it and costs no new branch. */
export interface RowSourceCommon {
  filter?: RowFilter | undefined;
  sort?: RowSort | undefined;
  filterPolicy?: FilterPolicy | undefined;
}

export interface EntriesRowSource extends RowSourceCommon {
  source: 'entries';
  /** Takes an explicit `undefined` for the reason `RowSourceCommon` states (#254). */
  tree?: boolean | undefined;
  /** Matches a parent Entry: its children draw as bars on its own row instead of rows of their own
   *  (#421). `true` matches every parent with at least one child; a `FieldMatch` or `EntryPredicate`
   *  matches only the parents the rule answers yes for — the same `when` syntax a variant's `when`
   *  takes (`EntryRule`, `layout/entry-rule.ts`). A parent this rule does not match is untouched:
   *  it keeps its own row, gives each child a row, and rolls up exactly as it does today (README's
   *  hard rule 6). Orthogonal to `tree` — `tree` nests a *non-segmented* parent's children; this
   *  decides whether a *segmented* parent's children become rows at all (README's hard rule 5). */
  childrenAsSegments?: EntryRule | true | undefined;
}

export interface GroupRowSource extends RowSourceCommon {
  source: 'group';
  /** Which group this row joins. Read the value off the row: `entry.read('team')`. */
  groupBy(entry: Entry): string;
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
}

export type RowSource = EntriesRowSource | GroupRowSource | CustomRowSource;

export const DEFAULT_ROW_SOURCE: EntriesRowSource = Object.freeze({ source: 'entries', tree: true });

/** `filterPolicyOf`'s default (#248 S4-2) — named here, beside the type it defaults, so
 *  `resolveRowSource` and `filterPolicyOf` share one literal instead of two. */
export const DEFAULT_FILTER_POLICY: FilterPolicy = 'keepAncestors';

/** Each resolved source extends the source a consumer authored, and narrows the keys it fills from
 *  optional to required (#248 S4-2). A consumer who omits `filterPolicy`/`tree` still reads a value
 *  back off `gantt.rowSource`. */
export interface ResolvedEntriesRowSource extends EntriesRowSource {
  filterPolicy: FilterPolicy;
  tree: boolean;
}

export interface ResolvedGroupRowSource extends GroupRowSource {
  filterPolicy: FilterPolicy;
}

/** What `Gantt.rowSource` reads back (#248 S4-2): every key a `RowSource` may omit, filled with the
 *  default `layout/` already applies at consumption (`filterPolicyOf`, the entries source's own
 *  `tree` check) — so a consumer never has to know those defaults to read them. `'custom'` takes no
 *  `filter`/`sort`/`filterPolicy`/`tree` (D-S4-21), so it has nothing left to fill and reads back as
 *  the `CustomRowSource` a consumer authored. */
export type ResolvedRowSource = ResolvedEntriesRowSource | ResolvedGroupRowSource | CustomRowSource;

/** Fills every key `layout/` defaults at consumption, once, so a caller reads the same answer
 *  `layout/` would compute (#248 S4-2). `tree` mirrors `entries-source.ts`'s own check: anything but the
 *  literal `true` resolves to `false`. */
export function resolveRowSource(source: RowSource): ResolvedRowSource {
  if (source.source === 'custom') return { ...source };
  const filterPolicy = source.filterPolicy ?? DEFAULT_FILTER_POLICY;
  if (source.source === 'entries') {
    return { ...source, filterPolicy, tree: source.tree === true };
  }
  return { ...source, filterPolicy };
}

/** True when this source can put one row under another. The tree entries source does, and so does
 *  the group source — a group header owns the rows below it. `'custom'` returns a flat list of
 *  `CustomRow`, which carries no parent, so it never nests.
 *
 *  S5.11, D-S5-25 reads this to pick the grid pane's authoring pattern: a nesting source is a
 *  `treegrid`, a flat one a `grid`, and only a `treegrid` row may carry `aria-level`. */
export function nestsRows(source: RowSource): boolean {
  if (source.source === 'entries') return source.tree === true;
  return source.source === 'group';
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
  headerLabel?: string;
  /** `true` when this row's entry matched the active filter; `false` when kept only for descendants. */
  matched?: boolean;
  /** `true` when `childrenAsSegments` matches this row's subject: its children draw on this row and
   *  take no row of their own (#421). A real field, not `entryIds.length > 1` — that count says how
   *  many Entries a row carries, and a custom source hands several with no subject among them
   *  (`custom-source.ts`). This field says something the count cannot: `entryIds[0]` is the parent
   *  the rule matched, and `produceBarsForRow` tells its producer to draw no bar of its own for it.
   *  Absent on every row no rule matches, so the path a match never touches reads exactly as it does
   *  today. */
  childrenAsSegments?: boolean;
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
  /** What `childrenAsSegments` compiles through (`layout/entry-rule.ts`) — the Field registry read
   *  and the unknown-key sink. Absent when no caller wired a Field registry in (a pure `layout/`
   *  test, say); `resolveEntriesSource` then treats an unset `childrenAsSegments` as non-segmented,
   *  same as always, and a set one as unmatchable rather than throwing. */
  entryRulePorts?: EntryRulePorts;
}
