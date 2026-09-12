// layout/ — `{ source: 'entries' }`. Flat list matches S1; tree is depth-first in insertion order.

import { entryId, rowId } from '../../model/index.js';
import type { StoredEntry, EntryId, RowId } from '../../model/index.js';
import type { EntriesRowSource, RowHeightMode, UnindexedRow } from './row-source.js';
import { heightModeOf, PLANNED_ROW_KIND } from './row-source.js';

export function entryTreeIndex(entries: readonly StoredEntry[]): {
  roots: readonly StoredEntry[];
  childrenOf: ReadonlyMap<EntryId, readonly StoredEntry[]>;
} {
  const known = new Set(entries.map((entry) => entry.id));
  const childrenOf = new Map<EntryId, StoredEntry[]>();
  const roots: StoredEntry[] = [];
  for (const entry of entries) {
    const parent = entry.parentId;
    if (parent === undefined || !known.has(parent)) {
      roots.push(entry);
      continue;
    }
    const siblings = childrenOf.get(parent);
    if (siblings) siblings.push(entry);
    else childrenOf.set(parent, [entry]);
  }
  return { roots, childrenOf };
}

function entryRow(
  entry: StoredEntry,
  fields: {
    depth: number;
    expandable: boolean;
    heightMode: RowHeightMode;
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
    heightMode: fields.heightMode,
    ...(fields.parentRowId !== undefined ? { parentRowId: fields.parentRowId } : {}),
  };
}

export function resolveEntriesSource(
  entries: readonly StoredEntry[],
  source: EntriesRowSource,
): UnindexedRow[] {
  const heightMode = heightModeOf(source);
  if (source.tree !== true) {
    return entries.map((entry) => entryRow(entry, { depth: 0, expandable: false, heightMode }));
  }

  const { roots, childrenOf } = entryTreeIndex(entries);
  const rows: UnindexedRow[] = [];
  const stack: { list: readonly StoredEntry[]; index: number; depth: number; parentRowId?: RowId }[] = [
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
    const children = childrenOf.get(entry.id) ?? [];
    rows.push(
      entryRow(entry, {
        depth: frame.depth,
        expandable: children.length > 0,
        heightMode,
        ...(frame.parentRowId !== undefined ? { parentRowId: frame.parentRowId } : {}),
      }),
    );
    stack.push({ list: children, index: 0, depth: frame.depth + 1, parentRowId: rowId(entry.id) });
  }
  return rows;
}
