// layout/ — row-source sort. Reads stored values through bound FieldCompare (D-S4-28, D-S4-29).

import { UnknownFieldError } from '../../model/index.js';
import type { Entry, FieldContext, RowId } from '../../model/index.js';
import type { FieldCompare } from '../column.js';
import type { RowSort, UnindexedRow } from './row-source.js';

export type { RowSort } from './row-source.js';

type EntryComparer = (left: Entry, right: Entry) => number;

function comparerFor(
  sort: RowSort,
  fieldCompares: readonly FieldCompare[],
  fields?: FieldContext,
): EntryComparer {
  const fieldCompare = fieldCompares.find((compare) => compare.key === sort.field);
  if (fieldCompare === undefined) throw new UnknownFieldError(String(sort.field));

  const direction = sort.direction === 'desc' ? -1 : 1;

  return (left, right) => {
    const a = fieldCompare.readStored(left);
    const b = fieldCompare.readStored(right);
    const order = sort.compare !== undefined ? sort.compare(a, b, fields) : fieldCompare.compareStored(a, b);
    return direction * order;
  };
}

function siblingsByParentRow(rows: readonly UnindexedRow[]): Map<RowId | undefined, UnindexedRow[]> {
  const childrenOf = new Map<RowId | undefined, UnindexedRow[]>();
  for (const row of rows) {
    const parent = row.parentRowId;
    const siblings = childrenOf.get(parent);
    if (siblings) siblings.push(row);
    else childrenOf.set(parent, [row]);
  }
  return childrenOf;
}

function sortSiblings(
  siblings: readonly UnindexedRow[],
  entriesById: ReadonlyMap<Entry['id'], Entry>,
  compare: EntryComparer,
): UnindexedRow[] {
  return [...siblings].sort((left, right) => {
    const leftEntry = left.entryIds[0] !== undefined ? entriesById.get(left.entryIds[0]) : undefined;
    const rightEntry = right.entryIds[0] !== undefined ? entriesById.get(right.entryIds[0]) : undefined;
    if (leftEntry === undefined || rightEntry === undefined) return 0;
    return compare(leftEntry, rightEntry);
  });
}

function emitSorted(
  parentId: RowId | undefined,
  childrenOf: ReadonlyMap<RowId | undefined, readonly UnindexedRow[]>,
  entriesById: ReadonlyMap<Entry['id'], Entry>,
  compare: EntryComparer,
): UnindexedRow[] {
  const siblings = childrenOf.get(parentId) ?? [];
  const sorted = sortSiblings(siblings, entriesById, compare);
  const out: UnindexedRow[] = [];
  for (const row of sorted) {
    out.push(row);
    out.push(...emitSorted(row.id, childrenOf, entriesById, compare));
  }
  return out;
}

/** Reorders sibling rows that share a `parentRowId`. Tree, group, and flat lists use this one walk. */
export function applySort(
  rows: readonly UnindexedRow[],
  entries: readonly Entry[],
  sort: RowSort | undefined,
  fieldCompares: readonly FieldCompare[],
  fields?: FieldContext,
): UnindexedRow[] {
  if (sort === undefined) return [...rows];

  const compare = comparerFor(sort, fieldCompares, fields);
  const entriesById = new Map(entries.map((entry) => [entry.id, entry]));
  return emitSorted(undefined, siblingsByParentRow(rows), entriesById, compare);
}
