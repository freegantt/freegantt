// layout/ — `{ source: 'group', groupBy }`. One header per value, first-seen order (D-S4-21, D-S4-23).

import { entryId, rowId } from '../../model/index.js';
import type { Entry } from '../../model/index.js';
import type { GroupRowSource, UnindexedRow } from './row-source.js';
import { heightModeOf } from './row-source.js';

export function resolveGroupSource(
  entries: readonly Entry[],
  source: GroupRowSource,
  collapsed: ReadonlySet<string>,
): UnindexedRow[] {
  const heightMode = heightModeOf(source);
  const order: string[] = [];
  const grouped = new Map<string, Entry[]>();
  for (const entry of entries) {
    const key = source.groupBy(entry);
    const bucket = grouped.get(key);
    if (bucket) bucket.push(entry);
    else {
      grouped.set(key, [entry]);
      order.push(key);
    }
  }

  const rows: UnindexedRow[] = [];
  for (const key of order) {
    const members = grouped.get(key) ?? [];
    const headerId = rowId(`group:${key}`);
    const expandable = members.length > 0;
    const expanded = expandable && !collapsed.has(headerId);
    rows.push({
      id: headerId,
      depth: 0,
      entryIds: [],
      expandable,
      expanded,
      heightMode,
      headerLabel: key,
    });
    if (!expanded) continue;
    for (const entry of members) {
      rows.push({
        id: rowId(entry.id),
        depth: 1,
        entryIds: [entryId(entry.id)],
        expandable: false,
        expanded: false,
        heightMode,
      });
    }
  }
  return rows;
}
