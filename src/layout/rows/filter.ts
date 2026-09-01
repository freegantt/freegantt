// layout/ — row-source filter policies. Pure: no Dataset, no FieldSource (D-S4-28, D-S4-29).

import type { Entry, EntryId } from '../../model/index.js';
import type { FilterPolicy, RowFilter, UnindexedRow } from './row-source.js';
import { isPlannedHeaderRow } from './row-source.js';

export type { RowFilter } from './row-source.js';

export function visibleEntryIds(
  entries: readonly Entry[],
  filter: RowFilter,
  policy: FilterPolicy,
): { visible: ReadonlySet<EntryId>; matched: ReadonlySet<EntryId> } {
  const matched = new Set<EntryId>();
  for (const entry of entries) {
    if (filter(entry)) matched.add(entry.id);
  }

  if (policy === 'matchOnly') {
    return { visible: matched, matched };
  }

  const known = new Set(entries.map((entry) => entry.id));
  const visible = new Set<EntryId>(matched);
  for (const id of matched) {
    let parent = parentOf(entries, id, known);
    while (parent !== undefined) {
      visible.add(parent);
      parent = parentOf(entries, parent, known);
    }
  }
  return { visible, matched };
}

function parentOf(entries: readonly Entry[], id: EntryId, known: ReadonlySet<EntryId>): EntryId | undefined {
  const entry = entries.find((row) => row.id === id);
  const parent = entry?.parentId;
  if (parent === undefined || !known.has(parent)) return undefined;
  return parent;
}

function filterEntryRows(
  rows: readonly UnindexedRow[],
  visible: ReadonlySet<EntryId>,
  matched: ReadonlySet<EntryId>,
  policy: FilterPolicy,
): UnindexedRow[] {
  const out: UnindexedRow[] = [];
  for (const row of rows) {
    if (isPlannedHeaderRow(row)) continue;
    const entryId = row.entryIds[0];
    if (entryId === undefined || !visible.has(entryId)) continue;
    const depth = policy === 'matchOnly' ? 0 : row.depth;
    out.push({ ...row, depth, matched: matched.has(entryId) });
  }
  return out;
}

function filterGroupRows(
  rows: readonly UnindexedRow[],
  visible: ReadonlySet<EntryId>,
  matched: ReadonlySet<EntryId>,
  policy: FilterPolicy,
): UnindexedRow[] {
  const out: UnindexedRow[] = [];
  let index = 0;
  while (index < rows.length) {
    const header = rows[index]!;
    if (!isPlannedHeaderRow(header)) {
      index += 1;
      continue;
    }
    index += 1;
    const members: UnindexedRow[] = [];
    while (index < rows.length && !isPlannedHeaderRow(rows[index]!)) {
      members.push(rows[index]!);
      index += 1;
    }
    const kept = members.filter((row) => {
      const entryId = row.entryIds[0];
      return entryId !== undefined && visible.has(entryId);
    });
    if (kept.length === 0) continue;

    if (policy === 'matchOnly') {
      for (const row of kept) {
        out.push({ ...row, depth: 0, matched: matched.has(row.entryIds[0]!) });
      }
      continue;
    }

    out.push({ ...header, expandable: true, expanded: true });
    for (const row of kept) {
      out.push({ ...row, matched: matched.has(row.entryIds[0]!) });
    }
  }
  return out;
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

  const { visible, matched } = visibleEntryIds(entries, filter, policy);
  const hasHeaders = rows.some(isPlannedHeaderRow);
  if (hasHeaders) return filterGroupRows(rows, visible, matched, policy);
  return filterEntryRows(rows, visible, matched, policy);
}
