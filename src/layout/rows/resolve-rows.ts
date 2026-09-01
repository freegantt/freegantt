// layout/ — dispatch to the three row sources, then filter → sort → collapse (D-S4-19, D-S4-28).

import type { FieldCompare } from '../column.js';
import { applyCollapse } from './collapse.js';
import { applyFilter } from './filter.js';
import { resolveEntriesSource } from './entries-source.js';
import { resolveGroupSource } from './group-source.js';
import { resolveCustomSource } from './custom-source.js';
import { applySort } from './sort.js';
import type { PlannedRow, RowResolutionInput, RowSource, UnindexedRow } from './row-source.js';
import { DEFAULT_ROW_SOURCE } from './row-source.js';

export type {
  RowResolutionInput,
  PlannedRow,
  RowSource,
  RowFilter,
  RowSort,
  FilterPolicy,
} from './row-source.js';
export { DEFAULT_ROW_SOURCE };

export function rowResolutionInput(input: {
  entries: readonly import('../../model/index.js').Entry[];
  rows?: RowSource;
  collapsed?: readonly string[];
  fieldCompares?: readonly FieldCompare[];
}): RowResolutionInput {
  return {
    entries: input.entries,
    source: input.rows ?? DEFAULT_ROW_SOURCE,
    collapsed: new Set(input.collapsed ?? []),
    ...(input.fieldCompares !== undefined ? { fieldCompares: input.fieldCompares } : {}),
  };
}

function stampIndex(rows: readonly UnindexedRow[]): readonly PlannedRow[] {
  return rows.map((row, index) => ({ ...row, index }));
}

function resolveSource(input: RowResolutionInput): UnindexedRow[] {
  const { source, entries } = input;
  if (source.source === 'group') return resolveGroupSource(entries, source);
  if (source.source === 'custom') return resolveCustomSource(source, { entries });
  return resolveEntriesSource(entries, source);
}

function filterPolicyOf(source: RowSource): 'keepAncestors' | 'matchOnly' {
  if (source.source === 'custom') return 'keepAncestors';
  return source.filterPolicy ?? 'keepAncestors';
}

function treeModeOf(source: RowSource): boolean {
  return source.source === 'entries' && source.tree === true;
}

export function resolveRows(input: RowResolutionInput): readonly PlannedRow[] {
  const { source, entries, collapsed, fieldCompares = [] } = input;
  const built = resolveSource(input);
  const filtered =
    source.source === 'custom' ? built : applyFilter(built, entries, source.filter, filterPolicyOf(source));
  const sorted =
    source.source === 'custom'
      ? filtered
      : applySort(filtered, entries, source.sort, fieldCompares, treeModeOf(source));
  const collapsedRows = applyCollapse(sorted, collapsed);
  return stampIndex(collapsedRows);
}
