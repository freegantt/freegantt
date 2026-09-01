// layout/ — row-source filter policies. Pure: no Dataset, no FieldSource (D-S4-28, D-S4-29).

import type { Entry, EntryId, RowId } from '../../model/index.js';
import type { FilterPolicy, RowFilter, UnindexedRow } from './row-source.js';

export type { RowFilter } from './row-source.js';

function entryIdOf(row: UnindexedRow): EntryId | undefined {
  return row.entryIds[0];
}

export function visibleRowIds(
  rows: readonly UnindexedRow[],
  entries: readonly Entry[],
  filter: RowFilter,
  policy: FilterPolicy,
): { visible: ReadonlySet<RowId>; matched: ReadonlySet<RowId> } {
  const entryById = new Map(entries.map((entry) => [entry.id, entry]));
  const matched = new Set<RowId>();
  for (const row of rows) {
    const id = entryIdOf(row);
    if (id === undefined) continue;
    const entry = entryById.get(id);
    if (entry !== undefined && filter(entry)) matched.add(row.id);
  }

  if (policy === 'matchOnly') {
    return { visible: matched, matched };
  }

  const rowById = new Map(rows.map((row) => [row.id, row]));
  const visible = new Set<RowId>(matched);
  for (const id of matched) {
    let parent = rowById.get(id)?.parentRowId;
    while (parent !== undefined) {
      visible.add(parent);
      parent = rowById.get(parent)?.parentRowId;
    }
  }
  return { visible, matched };
}

function flattenMatched(row: UnindexedRow, matched: ReadonlySet<RowId>): UnindexedRow {
  return {
    id: row.id,
    kind: row.kind,
    depth: 0,
    entryIds: row.entryIds,
    expandable: false,
    expanded: false,
    heightMode: row.heightMode,
    matched: matched.has(row.id),
    ...(row.headerLabel !== undefined ? { headerLabel: row.headerLabel } : {}),
  };
}

/** Applies `filter` with `policy`. When `filter` is omitted every row is `matched: true`. */
export function applyFilter(
  rows: readonly UnindexedRow[],
  entries: readonly Entry[],
  filter: RowFilter | undefined,
  policy: FilterPolicy,
): UnindexedRow[] {
  if (filter === undefined) {
    return rows.map((row) => ({ ...row, matched: true }));
  }

  const { visible, matched } = visibleRowIds(rows, entries, filter, policy);
  const out: UnindexedRow[] = [];
  for (const row of rows) {
    if (!visible.has(row.id)) continue;
    if (policy === 'matchOnly') {
      out.push(flattenMatched(row, matched));
      continue;
    }
    out.push({ ...row, matched: matched.has(row.id) });
  }
  return out;
}
