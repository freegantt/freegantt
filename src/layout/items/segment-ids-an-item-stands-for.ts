// layout/ — the one answer to "which Segments does this Item stand for" (#212, ADR 0010). Two
// layers ask it. `view/gantt-dom.ts` answers a pointer with it, and `render/dom` files each mounted
// bar under it. Both reach `layout/`, and `layout/` reaches neither, so this is where the rule lives.
//
// Why one home. Before this file the rule had two bodies. The pointer path read a bar node's
// `data-segment-id`, and the gesture path asked the layout. A removed Segment renumbers the bars,
// so a recycled node kept the id of the Segment it drew before, and the two paths disagreed.

import type { Entry, SegmentId } from '../../model/index.js';
import type { Item } from './produce-items.js';

/** Shared and frozen, so an Item that stands for no Segment costs no allocation (I5). */
const NO_SEGMENT_IDS: readonly SegmentId[] = Object.freeze([]);

/** Call: `segmentIdsAnItemStandsFor(bar, entryById(bar.entryId))`.
 *
 *  An Item that drew one Segment stands for that Segment alone. An Item that drew its Entry's whole
 *  span — a group, a milestone, a plugin's own kind — stands for every Segment of that Entry,
 *  because any of them selects it. An Entry the caller cannot resolve stands for no Segment.
 *
 *  Which Segment an Item *draws* is the other, narrower fact, and `Item.segmentId` states it. A
 *  resize handle and the `data-segment-id` stamp both need that one; nothing else does.
 *
 *  `Pick` on the parameter is deliberate: `FrameBar` satisfies it structurally, so `render/` passes
 *  a bar and `layout/` passes an Item, with no adapter and no second type. */
export function segmentIdsAnItemStandsFor(
  item: Pick<Item, 'entryId' | 'segmentId'>,
  entry: Entry | undefined,
): readonly SegmentId[] {
  if (item.segmentId !== undefined) return [item.segmentId];
  if (entry === undefined) return NO_SEGMENT_IDS;
  return entry.segments.map((segment) => segment.id);
}
