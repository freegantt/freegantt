// layout/ — `{ source: 'entries' }`. Flat list matches S1; tree is depth-first in insertion order.

import { entryId, rowId } from '../../model/index.js';
import type { Entry, EntryId } from '../../model/index.js';
import type { EntriesRowSource, PlannedRow, RowHeightMode } from './row-source.js';
import { heightModeOf } from './row-source.js';

function childrenByParent(entries: readonly Entry[]): {
  roots: readonly Entry[];
  childrenOf: ReadonlyMap<EntryId, readonly Entry[]>;
} {
  const known = new Set(entries.map((entry) => entry.id));
  const childrenOf = new Map<EntryId, Entry[]>();
  const roots: Entry[] = [];
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
  entry: Entry,
  depth: number,
  expandable: boolean,
  expanded: boolean,
  heightMode: RowHeightMode,
): PlannedRow {
  return {
    id: rowId(entry.id),
    kind: 'entry',
    index: 0,
    depth,
    entryIds: [entryId(entry.id)],
    expandable,
    expanded,
    heightMode,
  };
}

export function resolveEntriesSource(
  entries: readonly Entry[],
  source: EntriesRowSource,
  collapsed: ReadonlySet<string>,
): PlannedRow[] {
  const heightMode = heightModeOf(source);
  if (source.tree !== true) {
    return entries.map((entry) => entryRow(entry, 0, false, false, heightMode));
  }

  const { roots, childrenOf } = childrenByParent(entries);
  const rows: PlannedRow[] = [];
  const stack: { list: readonly Entry[]; index: number; depth: number }[] = [
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
    const expandable = children.length > 0;
    const id = rowId(entry.id);
    const expanded = expandable && !collapsed.has(id);
    rows.push(entryRow(entry, frame.depth, expandable, expanded, heightMode));
    if (expanded) stack.push({ list: children, index: 0, depth: frame.depth + 1 });
  }
  return rows;
}
