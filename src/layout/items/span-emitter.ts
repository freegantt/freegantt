// layout/ — one Item per Segment, or one Item for the whole span (D-S4-25).

import { itemId } from '../../model/index.js';
import type { Entry } from '../../model/index.js';
import type { Item, ItemEmissionContext } from './item-emitter.js';

export function emitSpan(entry: Entry, _ctx: ItemEmissionContext): readonly Item[] {
  const segments = entry.segments;
  if (segments !== undefined && segments.length > 0) {
    return segments.map((segment, index) => ({
      id: itemId(entry.id, index),
      entryId: entry.id,
      kind: entry.kind,
      label: entry.name,
      start: segment.start,
      end: segment.end,
    }));
  }
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
