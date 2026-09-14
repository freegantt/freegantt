// layout/ — `{ source: 'entries' }`. Flat list matches S1; tree is depth-first in insertion order.

import { entryId, rowId } from '../../model/index.js';
import type { Entry, EntryId, RowId } from '../../model/index.js';
import type { EntriesRowSource, UnindexedRow } from './row-source.js';
import { PLANNED_ROW_KIND } from './row-source.js';

export function entryTreeIndex(entries: readonly Entry[]): {
  roots: readonly Entry[];
  childRowsOf: ReadonlyMap<EntryId, readonly Entry[]>;
} {
  const known = new Set(entries.map((entry) => entry.id));
  const childRowsOf = new Map<EntryId, Entry[]>();
  const roots: Entry[] = [];
  for (const entry of entries) {
    const parent = entry.parent()?.id;
    if (parent === undefined || !known.has(parent)) {
      roots.push(entry);
      continue;
    }
    const siblings = childRowsOf.get(parent);
    if (siblings) siblings.push(entry);
    else childRowsOf.set(parent, [entry]);
  }
  return { roots, childRowsOf };
}

function entryRow(
  entry: Entry,
  fields: {
    depth: number;
    expandable: boolean;
    parentRowId?: RowId;
  },
): UnindexedRow {
  return {
    id: rowId(entry.id),
    kind: PLANNED_ROW_KIND.entry,
    depth: fields.depth,
    entryIds: [entryId(entry.id)],
    expandable: fields.expandable,
    expanded: false,
    ...(fields.parentRowId !== undefined ? { parentRowId: fields.parentRowId } : {}),
  };
}

export function resolveEntriesSource(entries: readonly Entry[], source: EntriesRowSource): UnindexedRow[] {
  if (source.tree !== true) {
    return entries.map((entry) => entryRow(entry, { depth: 0, expandable: false }));
  }

  const { roots, childRowsOf } = entryTreeIndex(entries);
  const rows: UnindexedRow[] = [];
  const stack: { list: readonly Entry[]; index: number; depth: number; parentRowId?: RowId }[] = [
    { list: roots, index: 0, depth: 0 },
  ];
  while (stack.length > 0) {
    const frame = stack[stack.length - 1]!;
    if (frame.index >= frame.list.length) {
      stack.pop();
      continue;
    }
    const entry = frame.list[frame.index]!;
    frame.index += 1;
    const children = childRowsOf.get(entry.id) ?? [];
    rows.push(
      entryRow(entry, {
        depth: frame.depth,
        expandable: children.length > 0,
        ...(frame.parentRowId !== undefined ? { parentRowId: frame.parentRowId } : {}),
      }),
    );
    stack.push({ list: children, index: 0, depth: frame.depth + 1, parentRowId: rowId(entry.id) });
  }
  return rows;
}
