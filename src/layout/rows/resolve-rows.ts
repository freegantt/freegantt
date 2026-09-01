// layout/ — one row pass: produce, filter, sort, collapse (D-S4-19, D-S4-28).

import type { Entry } from '../../model/index.js';
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
import { DEFAULT_ROW_SOURCE } from './row-source.js';

export type { PlannedRow, RowFilter, RowPassInput, RowSort, FilterPolicy } from './row-source.js';
export { DEFAULT_ROW_SOURCE };

type RowProducer = (input: RowPassInput) => UnindexedRow[];

const PRODUCE_ROWS = {
  entries: (input) => resolveEntriesSource(input.entries, input.source as EntriesRowSource),
  group: (input) => resolveGroupSource(input.entries, input.source as GroupRowSource),
  custom: (input) => resolveCustomSource(input.source as CustomRowSource, { entries: input.entries }),
} as const satisfies Record<RowSource['source'], RowProducer>;

function produceRows(input: RowPassInput): UnindexedRow[] {
  return PRODUCE_ROWS[input.source.source](input);
}

function stampIndex(rows: readonly UnindexedRow[]): readonly PlannedRow[] {
  return rows.map((row, index) => {
    const { parentRowId: _parent, ...planned } = row;
    return { ...planned, index };
  });
}

function filterPolicyOf(source: Exclude<RowSource, CustomRowSource>): FilterPolicy {
  return source.filterPolicy ?? 'keepAncestors';
}

/** Call: `resolveRows({ entries, rows: gantt.rowSource, collapsed })`. */
export function resolveRows(input: {
  entries: readonly Entry[];
  rows?: RowSource;
  collapsed?: readonly string[];
  fieldCompares?: readonly FieldCompare[];
}): readonly PlannedRow[] {
  const pass: RowPassInput = {
    entries: input.entries,
    source: input.rows ?? DEFAULT_ROW_SOURCE,
    collapsed: new Set(input.collapsed ?? []),
    ...(input.fieldCompares !== undefined ? { fieldCompares: input.fieldCompares } : {}),
  };
  const built = produceRows(pass);
  const { source, entries, collapsed, fieldCompares = [] } = pass;
  if (source.source === 'custom') {
    return stampIndex(applyCollapse(built, collapsed));
  }
  const filtered = applyFilter(built, entries, source.filter, filterPolicyOf(source));
  const sorted = applySort(filtered, entries, source.sort, fieldCompares);
  return stampIndex(applyCollapse(sorted, collapsed));
}
