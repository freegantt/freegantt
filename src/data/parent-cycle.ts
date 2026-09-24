// data/ — one walk two callers share: `entry-batch.ts` runs it over a whole-list write's own batch
// before any of it stages, and `replay-changes.ts` runs it over the batch a replay is rebuilding.
// Both ask the same question — which ids' `parentId` chain loops back onto itself, self-parenting
// included — so one walk answers it for both instead of two copies drifting apart.

import type { EntryId, StoredEntry } from '../model/index.js';

/** The two fields the walk reads — `id` and `parentId` — nothing more, so it runs over an
 *  `UnplacedEntry` before a batch has placed it, or over a placed `StoredEntry` just as well. */
export type ParentCycleRow = Pick<StoredEntry, 'id' | 'parentId'>;

/** Every id in `rows` whose `parentId` chain loops back onto itself — one colouring walk over the
 *  whole batch (O(n), the same shape `hierarchy-source.ts`'s `breakCycles` walks), not one walk per
 *  entry: a chain shared by a deep batch is walked once, not once per descendant.
 *
 *  `settled` holds every id a finished walk already cleared, so a later start skips it outright.
 *  `visiting` holds only the current walk's own chain, so revisiting one of its own ids is the loop
 *  signal; revisiting a `settled` id just means this chain runs into ground a prior walk already
 *  charted, cycle or not. */
export function findParentCycleMembers(
  rows: Iterable<EntryId>,
  byId: ReadonlyMap<EntryId, ParentCycleRow>,
): ReadonlySet<EntryId> {
  const settled = new Set<EntryId>();
  const visiting = new Set<EntryId>();
  const members = new Set<EntryId>();

  for (const startId of rows) {
    if (settled.has(startId)) continue;
    const chain: EntryId[] = [];
    let current: EntryId | undefined = startId;
    while (current !== undefined && !settled.has(current) && !visiting.has(current)) {
      visiting.add(current);
      chain.push(current);
      current = byId.get(current)?.parentId;
    }
    // `current` is still in this walk's own `visiting` set, so the chain arrived back at an id it
    // already passed — everything from that id to the end of the chain is one loop.
    if (current !== undefined && visiting.has(current)) {
      const loopStart = chain.indexOf(current);
      for (const id of chain.slice(loopStart)) members.add(id);
    }
    for (const id of chain) {
      visiting.delete(id);
      settled.add(id);
    }
  }
  return members;
}
