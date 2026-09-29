// data/ — the pure math behind the sibling-order Field. What rank does an entry hold among its
// siblings, and what rank does it hold after a write moves it? Neither question touches the store:
// a caller hands in the facts (list order, or a log of moves plus the committed groups), and reads
// back a rank per id. `buildCommitChangeSet` turns these ranks into rows for a live write; replay
// (`changesToReplay`) reuses the same math to renumber the sibling groups undo and redo touch.

import { SiblingIndexOutOfRangeError } from '../model/index.js';
import type { EntryId } from '../model/index.js';

/** The group an entry belongs to — a Hierarchy source's answer, or `undefined` for a root. The same
 *  shape a `HierarchySource` returns, because a sibling group is exactly that source's checked tree. */
export type SiblingGroupKey = EntryId | string | undefined;

/** One step of a write that places an entry: it ends up in `group`, at index `at`. */
export interface SiblingPlacement {
  readonly id: EntryId;
  readonly group: SiblingGroupKey;
  readonly at: number;
}

/** One step of a write that removes an entry from its group entirely — a remove, or the first half
 *  of a reparent. */
export interface SiblingDeparture {
  readonly id: EntryId;
}

/** One step of a write's effect on sibling order, in the order the write made it. */
export type SiblingChange = SiblingPlacement | SiblingDeparture;

/**
 * Each entry's rank among its siblings, read straight off list order (construction, `load`).
 *
 * Call: `siblingIndexesInListOrder(entries, (entry) => entry.id, (entry) => parents.get(entry.id))`.
 * The first entry in `entries` whose group is `p1` gets rank 0, the next entry whose group is `p1`
 * gets rank 1, and so on — one counter per distinct group, each starting at 0.
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

/** A `SiblingPlacement` is the only variant that carries a target group — telling the two apart this
 *  way reads a shape, never a discriminant literal. Exported: `EntryStore`'s own call-site bookkeeping
 *  (a live group count per open transaction, kept current one write at a time) tells the two apart the
 *  same way, so the two never drift onto separate rules for what counts as a placement. */
export function isSiblingPlacement(change: SiblingChange): change is SiblingPlacement {
  return 'group' in change;
}

/**
 * The final rank of every id in every group a write's changes touched.
 *
 * Call: `renumberSiblingGroups(changes, committedSiblingsOf, committedGroupOf)`. Replays `changes` in
 * call order over each touched group's committed order — read lazily through `committedSiblingsOf`,
 * one call per distinct group — and returns a rank for every id left standing in a touched group,
 * not only the ids `changes` named: a `SiblingPlacement` in the middle of a group shifts every
 * sibling after it.
 *
 * A placement whose `at` lands past the end of the group it targets lands at the end instead of
 * throwing. This clamp is only a safety net here: every caller checks the range before it logs a
 * placement, so this function never actually sees one out of range.
 */
export function renumberSiblingGroups(
  changes: readonly SiblingChange[],
  committedSiblingsOf: (group: SiblingGroupKey) => readonly EntryId[],
  committedGroupOf: (id: EntryId) => SiblingGroupKey,
): ReadonlyMap<EntryId, number> {
  const groups = new Map<SiblingGroupKey, EntryId[]>();
  const currentGroupOf = new Map<EntryId, SiblingGroupKey>();
  // Every id with no group right now — distinct from `currentGroupOf`, whose key space is a group
  // (`undefined` included, for the root group): an id that departed has no group at all, and
  // conflating the two once seeded the root group's array on a second departure for the same id
  // (a remove replayed twice, or a remove followed by a re-add), corrupting a group nothing touched.
  const departed = new Set<EntryId>();

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
    if (departed.has(id)) return;
    const group = currentGroupFor(id);
    const siblings = groupArray(group);
    const at = siblings.indexOf(id);
    if (at >= 0) siblings.splice(at, 1);
    departed.add(id);
  }

  for (const change of changes) {
    leave(change.id);
    if (!isSiblingPlacement(change)) continue;
    departed.delete(change.id);
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

/** One entry a delta places: the group it ends up in, and the index the delta named, if any. */
export interface DeltaPlacement {
  readonly id: EntryId;
  readonly group: SiblingGroupKey;
  readonly namedIndex: number | undefined;
  /** True for an id the store did not hold before the delta. */
  readonly isNew: boolean;
}

/**
 * The final rank of every id in every group a delta's removals and placements touched.
 * Replays each removal, then each placement, over the group's committed order — the same
 * rule a live transaction applies at commit. A named index outside the group's own live
 * count throws `SiblingIndexOutOfRangeError`, and nothing in the delta is placed.
 */
export function siblingIndexesAfterDelta(
  removedIds: readonly EntryId[],
  placements: readonly DeltaPlacement[],
  committedSiblingIds: (group: SiblingGroupKey) => readonly EntryId[],
  committedGroupOf: (id: EntryId) => SiblingGroupKey,
  operation: string,
): ReadonlyMap<EntryId, number> {
  const counts = new Map<SiblingGroupKey, number>();

  function countFor(group: SiblingGroupKey): number {
    const known = counts.get(group);
    if (known !== undefined) return known;
    const seeded = committedSiblingIds(group).length;
    counts.set(group, seeded);
    return seeded;
  }

  function adjustCount(group: SiblingGroupKey, by: number): void {
    counts.set(group, countFor(group) + by);
  }

  const log: SiblingChange[] = [];

  for (const id of removedIds) {
    log.push({ id });
    adjustCount(committedGroupOf(id), -1);
  }

  for (const placement of placements) {
    const { id, group, namedIndex, isNew } = placement;
    let others: number;
    if (isNew) {
      others = countFor(group);
    } else {
      const previous = committedGroupOf(id);
      others = countFor(group) - (group === previous ? 1 : 0);
      log.push({ id });
      adjustCount(previous, -1);
    }
    const at = namedIndex ?? others;
    if (
      namedIndex !== undefined &&
      (!Number.isInteger(namedIndex) || namedIndex < 0 || namedIndex > others)
    ) {
      throw new SiblingIndexOutOfRangeError(id, namedIndex, others, operation);
    }
    log.push({ id, group, at });
    adjustCount(group, 1);
  }

  return renumberSiblingGroups(log, committedSiblingIds, committedGroupOf);
}

/** One `entries.update` call a block move issues, in call order, and the rank it names. */
export interface SiblingBlockMoveCall {
  readonly id: EntryId;
  readonly at: number;
}

/** A vertical drag's whole write: one or more Entries land together in one group, at one drop
 *  index, keeping their own row order among themselves. */
export interface SiblingBlockMove {
  /** One `entries.update` per moved id, in call order — the `siblingIndex` each call names. Every
   *  moved id gets a call, even one whose place does not change: the renumber pass a no-op write
   *  still runs makes it a no-op row, not a skipped one. */
  readonly calls: readonly SiblingBlockMoveCall[];
  /** The rank each moved id holds once every call above has committed — what the event payload
   *  reports (`view/row-drop.ts`'s `PlacedEntry.place`). A call's own `at` is a call-time index
   *  into the group as it stood *when that call ran*, not this final rank. */
  readonly finalRanks: ReadonlyMap<EntryId, number>;
}

/**
 * The index math behind a vertical drag that places one or more Entries — grabbed first, then any
 * co-selected Entry, in row order — into `targetSiblings` at `index`.
 *
 * Call: `siblingBlockMove({ movedIds, targetSiblings, index })`. `targetSiblings` is the target
 * group's own committed order, moved ids already there included — the same list `DropPlace.index`
 * was read against. `index` counts among that list.
 *
 * Two questions, two passes. Where does each moved id *end up* (`finalRanks`) is a pure
 * concatenation: drop every moved id out of `targetSiblings`, splice them back in as one block at
 * `index`'s position among what is left. What `siblingIndex` does each `entries.update` *call*
 * name (`calls`) is a replay: `EntryStore` writes one moved id at a time, and every write after the
 * first sees the group as the write before it left it — so the first call's `at` names its place
 * among the group as committed, and every call after it names one past the id the call before it
 * just placed. Both passes agree on the final shape; only the reasoning from "we're partway
 * through this transaction" to "what index does this one call name" differs.
 */
export function siblingBlockMove(input: {
  readonly movedIds: readonly EntryId[];
  readonly targetSiblings: readonly EntryId[];
  readonly index: number;
}): SiblingBlockMove {
  const { movedIds, targetSiblings, index } = input;
  const moved = new Set(movedIds);
  const stays = targetSiblings.filter((id) => !moved.has(id));
  const keptBeforeIndex = targetSiblings.slice(0, index).filter((id) => !moved.has(id)).length;
  const finalOrder = [...stays.slice(0, keptBeforeIndex), ...movedIds, ...stays.slice(keptBeforeIndex)];
  const finalRanks = new Map<EntryId, number>();
  finalOrder.forEach((id, rank) => finalRanks.set(id, rank));

  // The first id after the whole moved block, in final order — `undefined` when the block lands
  // last. Always a kept id (every moved id sits inside the block), so its own position in the live
  // list below never shifts as later moved ids leave or land elsewhere in that same list.
  const afterBlock = finalOrder[keptBeforeIndex + movedIds.length];

  const live = [...targetSiblings];
  const calls: SiblingBlockMoveCall[] = movedIds.map((id, position) => {
    const departingAt = live.indexOf(id);
    if (departingAt >= 0) live.splice(departingAt, 1);
    const at =
      position === 0
        ? afterBlock !== undefined
          ? live.indexOf(afterBlock)
          : live.length
        : live.indexOf(movedIds[position - 1]!) + 1;
    live.splice(at, 0, id);
    return { id, at };
  });

  return { calls, finalRanks };
}
