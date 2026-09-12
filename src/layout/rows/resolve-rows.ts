// layout/ — one row pass: produce, filter, sort, collapse (D-S4-19, D-S4-28).

import type { StoredEntry, FieldContext } from '../../model/index.js';
import type { FieldCompare } from '../column.js';
import { applyCollapse } from './collapse.js';
import { applyFilter } from './filter.js';
import { resolveEntriesSource } from './entries-source.js';
import { resolveGroupSource } from './group-source.js';
import { resolveCustomSource } from './custom-source.js';
import { applySort } from './sort.js';
import type {
  CustomRowSource,
  EntriesRowSource,
  FilterPolicy,
  GroupRowSource,
  PlannedRow,
  RowPassInput,
  RowSource,
  UnindexedRow,
} from './row-source.js';
import { DEFAULT_FILTER_POLICY, DEFAULT_ROW_SOURCE } from './row-source.js';

export type { PlannedRow, RowFilter, RowPassInput, RowSort, FilterPolicy } from './row-source.js';
export { DEFAULT_ROW_SOURCE };

type RowProducer = (input: RowPassInput) => UnindexedRow[];

const PRODUCE_ROWS = {
  entries: (input) => resolveEntriesSource(input.entries, input.source as EntriesRowSource),
  group: (input) => resolveGroupSource(input.entries, input.source as GroupRowSource, input.fieldContext),
  custom: (input) => resolveCustomSource(input.source as CustomRowSource, { entries: input.entries }),
} as const satisfies Record<RowSource['source'], RowProducer>;

function produceRows(input: RowPassInput): UnindexedRow[] {
  return PRODUCE_ROWS[input.source.source](input);
}

export function stampIndex(rows: readonly UnindexedRow[]): readonly PlannedRow[] {
  return rows.map((row, index) => {
    const { parentRowId: _parent, ...planned } = row;
    return { ...planned, index };
  });
}

/** Produce, filter, and sort — collapse is a later pass so ancestry still has `parentRowId` (D4). */
export function resolveOpenRows(input: {
  entries: readonly StoredEntry[];
  rows?: RowSource;
  fieldCompares?: readonly FieldCompare[];
  fieldContext?: FieldContext;
}): UnindexedRow[] {
  const pass: RowPassInput = {
    entries: input.entries,
    source: input.rows ?? DEFAULT_ROW_SOURCE,
    collapsed: new Set(),
    ...(input.fieldCompares !== undefined ? { fieldCompares: input.fieldCompares } : {}),
    ...(input.fieldContext !== undefined ? { fieldContext: input.fieldContext } : {}),
  };
  const built = produceRows(pass);
  const { source, entries, fieldCompares = [], fieldContext } = pass;
  if (source.source === 'custom') return built;
  const filtered = applyFilter(built, entries, source.filter, filterPolicyOf(source), fieldContext);
  return applySort(filtered, entries, source.sort, fieldCompares, fieldContext);
}

function filterPolicyOf(source: Exclude<RowSource, CustomRowSource>): FilterPolicy {
  return source.filterPolicy ?? DEFAULT_FILTER_POLICY;
}

/** Call: `resolveRows({ entries, rows: gantt.rowSource, collapsed })`. */
export function resolveRows(input: {
  entries: readonly StoredEntry[];
  rows?: RowSource;
  collapsed?: readonly string[];
  fieldCompares?: readonly FieldCompare[];
  fieldContext?: FieldContext;
}): readonly PlannedRow[] {
  const open = resolveOpenRows(input);
  return stampIndex(applyCollapse(open, new Set(input.collapsed ?? [])));
}
