// data/ — the pure math behind the sibling-order Field. What rank does an entry hold among its
// siblings, and what rank does it hold after a write moves it? Neither question touches the store:
// a caller hands in the facts (list order, or a log of moves plus the committed groups), and reads
// back a rank per id. `buildCommitChangeSet` is the one caller that turns these ranks into rows.

import type { EntryId } from '../model/index.js';

/** The group an entry belongs to — a Hierarchy source's answer, or `undefined` for a root. The same
 *  shape a `HierarchySource` returns, because a sibling group is exactly that source's checked tree. */
export type SiblingGroupKey = EntryId | string | undefined;

/** One step of a write's effect on sibling order, in the order the write made it. `place` says
 *  where an entry ends up: in `group`, at index `at`. `leave` says an entry left its group entirely
 *  — a remove, or the first half of a reparent. */
export type SiblingChange =
  | { readonly kind: 'place'; readonly id: EntryId; readonly group: SiblingGroupKey; readonly at: number }
  | { readonly kind: 'leave'; readonly id: EntryId };

/**
 * Each entry's rank among its siblings, read straight off list order (construction, `load`).
 *
 * Call: `siblingIndexesInListOrder(entries, (entry) => entry.parentId)`. The first entry in `entries`
 * whose group is `p1` gets rank 0, the next entry whose group is `p1` gets rank 1, and so on — one
 * counter per distinct group, each starting at 0.
 */
export function siblingIndexesInListOrder<T>(
  entries: readonly T[],
  idOf: (entry: T) => EntryId,
  groupOf: (entry: T) => SiblingGroupKey,
): ReadonlyMap<EntryId, number> {
  const nextRankInGroup = new Map<SiblingGroupKey, number>();
  const ranks = new Map<EntryId, number>();
  for (const entry of entries) {
    const group = groupOf(entry);
    const rank = nextRankInGroup.get(group) ?? 0;
    ranks.set(idOf(entry), rank);
    nextRankInGroup.set(group, rank + 1);
  }
  return ranks;
}

/**
 * The final rank of every id in every group a write's changes touched.
 *
 * Call: `renumberSiblingGroups(changes, committedSiblingsOf, committedGroupOf)`. Replays `changes` in
 * call order over each touched group's committed order — read lazily through `committedSiblingsOf`,
 * one call per distinct group — and returns a rank for every id left standing in a touched group,
 * not only the ids `changes` named: a `place` in the middle of a group shifts every sibling after it.
 *
 * A `place` whose `at` lands past the end of the group it targets — an `EditExtender` may ask for
 * one — lands at the end instead of throwing. The typed range check at the call site guards an
 * explicit write; this function only has to stay correct, never round-trip that error.
 */
/** A `place` change is the only kind that carries a target group — telling the two apart this way
 *  reads a shape, never a `kind` literal. */
function isPlaceChange(change: SiblingChange): change is Extract<SiblingChange, { kind: 'place' }> {
  return 'group' in change;
}

export function renumberSiblingGroups(
  changes: readonly SiblingChange[],
  committedSiblingsOf: (group: SiblingGroupKey) => readonly EntryId[],
  committedGroupOf: (id: EntryId) => SiblingGroupKey,
): ReadonlyMap<EntryId, number> {
  const groups = new Map<SiblingGroupKey, EntryId[]>();
  const currentGroupOf = new Map<EntryId, SiblingGroupKey>();

  function groupArray(group: SiblingGroupKey): EntryId[] {
    const found = groups.get(group);
    if (found !== undefined) return found;
    const seeded = [...committedSiblingsOf(group)];
    groups.set(group, seeded);
    return seeded;
  }

  function currentGroupFor(id: EntryId): SiblingGroupKey {
    return currentGroupOf.has(id) ? currentGroupOf.get(id) : committedGroupOf(id);
  }

  function leave(id: EntryId): void {
    const group = currentGroupFor(id);
    const siblings = groupArray(group);
    const at = siblings.indexOf(id);
    if (at >= 0) siblings.splice(at, 1);
    currentGroupOf.set(id, undefined);
  }

  for (const change of changes) {
    leave(change.id);
    if (!isPlaceChange(change)) continue;
    const siblings = groupArray(change.group);
    const at = Math.min(Math.max(change.at, 0), siblings.length);
    siblings.splice(at, 0, change.id);
    currentGroupOf.set(change.id, change.group);
  }

  const ranks = new Map<EntryId, number>();
  for (const siblings of groups.values()) {
    siblings.forEach((id, index) => ranks.set(id, index));
  }
  return ranks;
}
