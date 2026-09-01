// layout/ — `{ source: 'group', groupBy }`. One header per value, first-seen order (D-S4-21, D-S4-23).

import { entryId, rowId } from '../../model/index.js';
import type { Entry, FieldContext } from '../../model/index.js';
import type { GroupRowSource, UnindexedRow } from './row-source.js';
import { heightModeOf, PLANNED_ROW_KIND } from './row-source.js';

export function resolveGroupSource(
  entries: readonly Entry[],
  source: GroupRowSource,
  fields?: FieldContext,
): UnindexedRow[] {
  const heightMode = heightModeOf(source);
  const order: string[] = [];
  const grouped = new Map<string, Entry[]>();
  for (const entry of entries) {
    const key = source.groupBy(entry, fields);
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
    rows.push({
      id: headerId,
      kind: PLANNED_ROW_KIND.header,
      depth: 0,
      entryIds: [],
      expandable,
      expanded: false,
      heightMode,
      headerLabel: key,
    });
    for (const entry of members) {
      rows.push({
        id: rowId(entry.id),
        kind: PLANNED_ROW_KIND.entry,
        depth: 1,
        entryIds: [entryId(entry.id)],
        expandable: false,
        expanded: false,
        heightMode,
        parentRowId: headerId,
      });
    }
  }
  return rows;
}
