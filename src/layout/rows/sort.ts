// layout/ — row-source sort. Reads stored values through bound FieldCompare (D-S4-28, D-S4-29).

import { UnknownFieldError } from '../../model/index.js';
import type { Entry, EntryId } from '../../model/index.js';
import type { FieldCompare } from '../column.js';
import type { RowSort, UnindexedRow } from './row-source.js';
import { isPlannedHeaderRow } from './row-source.js';
import { childrenByParent } from './entries-source.js';

export type { RowSort } from './row-source.js';

type EntryComparer = (left: Entry, right: Entry) => number;

function comparerFor(sort: RowSort, fieldCompares: readonly FieldCompare[]): EntryComparer {
  const fieldCompare = fieldCompares.find((compare) => compare.key === sort.field);
  if (fieldCompare === undefined) throw new UnknownFieldError(String(sort.field));

  const direction = sort.direction === 'desc' ? -1 : 1;

  return (left, right) => {
    const a = fieldCompare.readStored(left);
    const b = fieldCompare.readStored(right);
    const order = sort.compare !== undefined ? sort.compare(a, b) : fieldCompare.compareStored(a, b);
    return direction * order;
  };
}

function sortEntries(entries: readonly Entry[], compare: EntryComparer): Entry[] {
  return [...entries].sort(compare);
}

function emitTreeRows(
  list: readonly Entry[],
  depth: number,
  childrenOf: ReadonlyMap<EntryId, readonly Entry[]>,
  visibleIds: ReadonlySet<EntryId>,
  rowByEntryId: ReadonlyMap<EntryId, UnindexedRow>,
  compare: EntryComparer,
): UnindexedRow[] {
  const out: UnindexedRow[] = [];
  for (const entry of sortEntries(list, compare)) {
    if (!visibleIds.has(entry.id)) continue;
    const row = rowByEntryId.get(entry.id);
    if (row === undefined) continue;
    out.push({ ...row, depth });
    const children = (childrenOf.get(entry.id) ?? []).filter((child) => visibleIds.has(child.id));
    out.push(...emitTreeRows(children, depth + 1, childrenOf, visibleIds, rowByEntryId, compare));
  }
  return out;
}

function sortTreeRows(
  rows: readonly UnindexedRow[],
  entries: readonly Entry[],
  compare: EntryComparer,
): UnindexedRow[] {
  const visibleIds = new Set<EntryId>();
  const rowByEntryId = new Map<EntryId, UnindexedRow>();
  for (const row of rows) {
    if (isPlannedHeaderRow(row)) continue;
    const entryId = row.entryIds[0];
    if (entryId === undefined) continue;
    visibleIds.add(entryId);
    rowByEntryId.set(entryId, row);
  }

  const known = visibleIds;
  const { roots, childrenOf } = childrenByParent(entries);
  const treeRoots = roots.filter((entry) => {
    if (!visibleIds.has(entry.id)) return false;
    const parent = entry.parentId;
    return parent === undefined || !known.has(parent);
  });

  return emitTreeRows(treeRoots, 0, childrenOf, visibleIds, rowByEntryId, compare);
}

function sortFlatRows(
  rows: readonly UnindexedRow[],
  entries: readonly Entry[],
  compare: EntryComparer,
): UnindexedRow[] {
  const entryById = new Map(entries.map((entry) => [entry.id, entry]));
  const entryRows = rows.filter((row) => !isPlannedHeaderRow(row));
  return [...entryRows].sort((left, right) => {
    const leftEntry = entryById.get(left.entryIds[0]!);
    const rightEntry = entryById.get(right.entryIds[0]!);
    if (leftEntry === undefined || rightEntry === undefined) return 0;
    return compare(leftEntry, rightEntry);
  });
}

function sortGroupRows(
  rows: readonly UnindexedRow[],
  entries: readonly Entry[],
  compare: EntryComparer,
): UnindexedRow[] {
  const entryById = new Map(entries.map((entry) => [entry.id, entry]));
  const out: UnindexedRow[] = [];
  let index = 0;
  while (index < rows.length) {
    const header = rows[index]!;
    if (!isPlannedHeaderRow(header)) {
      index += 1;
      continue;
    }
    out.push(header);
    index += 1;
    const members: UnindexedRow[] = [];
    while (index < rows.length && !isPlannedHeaderRow(rows[index]!)) {
      members.push(rows[index]!);
      index += 1;
    }
    const sorted = [...members].sort((left, right) => {
      const leftEntry = entryById.get(left.entryIds[0]!);
      const rightEntry = entryById.get(right.entryIds[0]!);
      if (leftEntry === undefined || rightEntry === undefined) return 0;
      return compare(leftEntry, rightEntry);
    });
    out.push(...sorted);
  }
  return out;
}

/** Reorders rows. Tree mode sorts siblings under each parent; group mode sorts within each header block. */
export function applySort(
  rows: readonly UnindexedRow[],
  entries: readonly Entry[],
  sort: RowSort | undefined,
  fieldCompares: readonly FieldCompare[],
  tree: boolean,
): UnindexedRow[] {
  if (sort === undefined || fieldCompares.length === 0) return [...rows];

  const compare = comparerFor(sort, fieldCompares);
  const hasHeaders = rows.some(isPlannedHeaderRow);
  if (hasHeaders) return sortGroupRows(rows, entries, compare);
  if (tree) return sortTreeRows(rows, entries, compare);
  return sortFlatRows(rows, entries, compare);
}
