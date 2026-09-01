// layout/ — one Item for a group Entry; render/ draws the bracket off data-kind (D-S4-24).

import { itemId } from '../../model/index.js';
import type { Entry } from '../../model/index.js';
import type { Item, ItemEmissionContext } from './item.js';

export function emitGroup(entry: Entry, _ctx: ItemEmissionContext): readonly Item[] {
  return [
    {
      id: itemId(entry.id, 0),
      entryId: entry.id,
      kind: entry.kind,
      label: entry.name,
      start: entry.start,
      end: entry.end,
    },
  ];
}
