// layout/ — dispatch to the three row sources, then stamp index (D-S4-19, D-S4-21). Collapse is
// applied inside each source so absent rows never exist (D-S4-20).

import type { Entry } from '../../model/index.js';
import { resolveEntriesSource } from './entries-source.js';
import { resolveGroupSource } from './group-source.js';
import { resolveCustomSource } from './custom-source.js';
import type { PlannedRow, RowResolutionInput, RowSource, UnindexedRow } from './row-source.js';
import { DEFAULT_ROW_SOURCE } from './row-source.js';

export type { RowResolutionInput, PlannedRow, RowSource };
export { DEFAULT_ROW_SOURCE };

export function rowResolutionInput(input: {
  entries: readonly Entry[];
  rows?: RowSource;
  collapsed?: readonly string[];
}): RowResolutionInput {
  return {
    entries: input.entries,
    source: input.rows ?? DEFAULT_ROW_SOURCE,
    collapsed: new Set(input.collapsed ?? []),
  };
}

function stampIndex(rows: readonly UnindexedRow[]): readonly PlannedRow[] {
  return rows.map((row, index) => ({ ...row, index }));
}

function resolveSource(input: RowResolutionInput, source: RowSource): UnindexedRow[] {
  if (source.source === 'group') return resolveGroupSource(input.entries, source, input.collapsed);
  if (source.source === 'custom') return resolveCustomSource(source, { entries: input.entries });
  return resolveEntriesSource(input.entries, source, input.collapsed);
}

export function resolveRows(input: RowResolutionInput): readonly PlannedRow[] {
  return stampIndex(resolveSource(input, input.source));
}
