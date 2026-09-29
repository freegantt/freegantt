import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { DatasetState } from './dataset-state.js';
import { entryId } from '../model/index.js';
import { renumberSiblingGroups, siblingBlockMove } from './sibling-order.js';
import type { SiblingChange, SiblingGroupKey } from './sibling-order.js';
import type { Entry } from '../model/index.js';

// #528, I16: every sibling group holds exactly the ranks 0 through one less than its own size, with
// no gap and no repeat, once a write's changes are replayed. Random places, leaves, moves within a
// group and moves across groups, over a small fixed set of ids and three groups (two named, one the
// root), check that no sequence of changes can break the rule.

const IDS = ['a', 'b', 'c', 'd', 'e'] as const;
const GROUPS = ['p', 'q', undefined] as const;
const LEFT = Symbol('left'); // an id no place change named since its last leave — no group holds it

type Bucket = 'p' | 'q' | 'root';
type InitialGroups = Record<Bucket, readonly string[]>;

const changeArb: fc.Arbitrary<SiblingChange> = fc.oneof(
  fc.record({
    id: fc.constantFrom(...IDS).map(entryId),
    group: fc.constantFrom<SiblingGroupKey>(...GROUPS),
    at: fc.nat({ max: IDS.length }),
  }),
  fc.record({
    id: fc.constantFrom(...IDS).map(entryId),
  }),
);

// Every id starts in one of the three groups — `p`, `q`, or the root group (`undefined`) — so the
// root group is not always the one group every run leaves untouched. `fc.shuffledSubarray` also
// varies the starting rank within each group.
const initialGroupsArb: fc.Arbitrary<InitialGroups> = fc
  .shuffledSubarray([...IDS], { minLength: IDS.length, maxLength: IDS.length })
  .map((shuffled) => {
    const third = Math.ceil(shuffled.length / 3);
    return {
      p: shuffled.slice(0, third),
      q: shuffled.slice(third, third * 2),
      root: shuffled.slice(third * 2),
    };
  });

/** `'root'` is this test's own bucket name for the group `renumberSiblingGroups` itself calls
 *  `undefined` — the two named groups pass through unchanged. */
function groupKeyForBucket(bucket: Bucket): SiblingGroupKey {
  return bucket === 'root' ? undefined : bucket;
}

/** The committed facts `renumberSiblingGroups` reads, built from one `initialGroupsArb` draw. */
function committedGroupsFrom(initial: InitialGroups) {
  const groupOfId = new Map<string, SiblingGroupKey>();
  const idsByGroup = new Map<SiblingGroupKey, readonly string[]>();
  for (const bucket of ['p', 'q', 'root'] as const) {
    const group = groupKeyForBucket(bucket);
    idsByGroup.set(group, initial[bucket]);
    for (const id of initial[bucket]) groupOfId.set(id, group);
  }
  return {
    groupOfId,
    committedSiblingsOf: (group: SiblingGroupKey) => (idsByGroup.get(group) ?? []).map(entryId),
    committedGroupOf: (id: string) => groupOfId.get(id),
  };
}

/** The group each id ends in, read the same way `renumberSiblingGroups` reads it: the last change
 *  that names the id wins. Independent of the module under test — it never touches rank or order,
 *  only membership — so it is a fair oracle for I16. */
function finalGroupOf(
  groupOfId: ReadonlyMap<string, SiblingGroupKey>,
  changes: readonly SiblingChange[],
): Map<string, SiblingGroupKey | typeof LEFT> {
  const group = new Map<string, SiblingGroupKey | typeof LEFT>(groupOfId);
  for (const change of changes) group.set(change.id, 'group' in change ? change.group : LEFT);
  return group;
}

describe('renumberSiblingGroups property', () => {
  it('leaves every touched group holding exactly its own 0..n-1, no gap, no repeat', () => {
    fc.assert(
      fc.property(initialGroupsArb, fc.array(changeArb, { maxLength: 10 }), (initial, changes) => {
        const { groupOfId, committedSiblingsOf, committedGroupOf } = committedGroupsFrom(initial);

        const ranks = renumberSiblingGroups(changes, committedSiblingsOf, committedGroupOf);
        const finalGroup = finalGroupOf(groupOfId, changes);

        // Only a group a change actually reached gets recomputed — untouched groups keep no entry
        // in `ranks` at all, so an id whose group nothing ever reached must not appear either.
        const touchedGroups = new Set<SiblingGroupKey>();
        for (const change of changes) {
          touchedGroups.add(groupOfId.get(change.id));
          if ('group' in change) touchedGroups.add(change.group);
        }

        const idsByGroup = new Map<SiblingGroupKey, string[]>();
        for (const id of IDS) {
          if (!touchedGroups.has(groupOfId.get(id))) {
            expect(ranks.has(entryId(id))).toBe(false);
            continue;
          }
          const group = finalGroup.get(id);
          if (group === LEFT) {
            expect(ranks.has(entryId(id))).toBe(false);
            continue;
          }
          expect(ranks.has(entryId(id))).toBe(true);
          if (!idsByGroup.has(group)) idsByGroup.set(group, []);
          idsByGroup.get(group)!.push(id);
        }

        for (const ids of idsByGroup.values()) {
          const sortedRanks = ids.map((id) => ranks.get(entryId(id))!).sort((a, b) => a - b);
          expect(sortedRanks).toEqual(ids.map((_unused, index) => index));
        }
      }),
    );
  });

  it('keeps the committed relative order of ids no change named', () => {
    fc.assert(
      fc.property(initialGroupsArb, fc.array(changeArb, { maxLength: 10 }), (initial, changes) => {
        const { committedSiblingsOf, committedGroupOf } = committedGroupsFrom(initial);
        const named = new Set(changes.map((change) => String(change.id)));
        const ranks = renumberSiblingGroups(changes, committedSiblingsOf, committedGroupOf);

        for (const bucket of ['p', 'q', 'root'] as const) {
          const untouched = initial[bucket].filter((id) => !named.has(id));
          const inFinalOrder = [...untouched].sort(
            (a, b) => (ranks.get(entryId(a)) ?? -1) - (ranks.get(entryId(b)) ?? -1),
          );
          expect(inFinalOrder).toEqual(untouched);
        }
      }),
    );
  });

  it('lands a placement that is the very last change at min(at, group size - 1)', () => {
    fc.assert(
      fc.property(
        initialGroupsArb,
        fc.array(changeArb, { minLength: 1, maxLength: 10 }),
        (initial, changes) => {
          const last = changes[changes.length - 1]!;
          fc.pre('group' in last);

          const { groupOfId, committedSiblingsOf, committedGroupOf } = committedGroupsFrom(initial);
          const ranks = renumberSiblingGroups(changes, committedSiblingsOf, committedGroupOf);
          const finalGroup = finalGroupOf(groupOfId, changes);
          const groupSize = [...finalGroup.values()].filter((group) => group === last.group).length;

          expect(ranks.get(last.id)).toBe(Math.min(last.at, groupSize - 1));
        },
      ),
    );
  });
});

// #425: a vertical drag's own block move. `siblingBlockMove` answers two questions about the same
// write — the final rank each moved id ends up at (`finalRanks`), and the call-time index each
// `entries.update` must name to get there (`calls`) — and this property checks the two never
// disagree: replaying `calls` as placements through `renumberSiblingGroups` (the same replay a live
// commit runs) must land every moved id at its own `finalRanks` answer, and must leave every group a
// moved id left holding its own remaining members, dense, in their committed relative order (I16).
describe('siblingBlockMove property', () => {
  it('replays to the ids finalRanks names, and leaves every touched group dense (I16)', () => {
    fc.assert(
      fc.property(
        initialGroupsArb,
        fc.uniqueArray(fc.constantFrom(...IDS), { minLength: 1, maxLength: 3 }),
        fc.constantFrom<SiblingGroupKey>(...GROUPS),
        fc.nat({ max: IDS.length }),
        (initial, movedIdStrings, targetGroup, rawIndex) => {
          const { groupOfId, committedSiblingsOf, committedGroupOf } = committedGroupsFrom(initial);
          const movedIds = movedIdStrings.map(entryId);
          const targetSiblings = committedSiblingsOf(targetGroup);
          const index = Math.min(rawIndex, targetSiblings.length);

          const { calls, finalRanks } = siblingBlockMove({ movedIds, targetSiblings, index });

          const placements: SiblingChange[] = calls.map((call) => ({
            id: call.id,
            group: targetGroup,
            at: call.at,
          }));
          const ranks = renumberSiblingGroups(placements, committedSiblingsOf, committedGroupOf);

          // Every id the target group ends up holding — moved or already there — lands at exactly
          // the rank finalRanks names for it.
          for (const [id, rank] of finalRanks) {
            expect(ranks.get(id)).toBe(rank);
          }

          // A group a moved id departed keeps every remaining member, dense from 0, in the order
          // it already held them.
          const movedSet = new Set<string>(movedIdStrings);
          for (const bucket of ['p', 'q', 'root'] as const) {
            const group = groupKeyForBucket(bucket);
            if (group === targetGroup) continue;
            const departedFromHere = movedIdStrings.some((id) => groupOfId.get(id) === group);
            if (!departedFromHere) continue;
            initial[bucket]
              .filter((id) => !movedSet.has(id))
              .forEach((id, rank) => expect(ranks.get(entryId(id))).toBe(rank));
          }
        },
      ),
      { numRuns: 200 },
    );
  });
});

// The store-level property (#528, step 7): the same rule the pure property above proves — every
// sibling group holds exactly 0..n-1, no gap and no repeat — holds after a random sequence of
// `add`, `remove`, a reparent (an `update()` that names `parentId`) and a move (an `update()` that
// names `siblingIndex`), driven through `DatasetState` the way a consumer reaches it — not the pure
// `renumberSiblingGroups` call above. Two containers, `p1` and `p2`, seed the tree and never move or
// leave; the leaves `a`–`d` come and go, and drift between the two containers and the root group.

const LEAVES = ['a', 'b', 'c', 'd'] as const;
const PARENTS = ['p1', 'p2', undefined] as const;

type StoreOp =
  | { kind: 'add'; id: string; parentId: string | undefined }
  | { kind: 'remove'; id: string }
  | { kind: 'reparent'; id: string; parentId: string | undefined }
  | { kind: 'move'; id: string; at: number };

const storeOpArb: fc.Arbitrary<StoreOp> = fc.oneof(
  fc.record({
    kind: fc.constant('add' as const),
    id: fc.constantFrom(...LEAVES),
    parentId: fc.constantFrom(...PARENTS),
  }),
  fc.record({ kind: fc.constant('remove' as const), id: fc.constantFrom(...LEAVES) }),
  fc.record({
    kind: fc.constant('reparent' as const),
    id: fc.constantFrom(...LEAVES),
    parentId: fc.constantFrom(...PARENTS),
  }),
  fc.record({
    kind: fc.constant('move' as const),
    id: fc.constantFrom(...LEAVES),
    at: fc.nat({ max: LEAVES.length }),
  }),
);

function newSeededState(): DatasetState {
  return new DatasetState({
    timeZone: 'UTC',
    entries: [
      { id: 'p1', name: 'p1', start: 0, end: 1 },
      { id: 'p2', name: 'p2', start: 0, end: 1 },
    ],
  });
}

/** Applies one op, the way `history.property.test.ts` does: a duplicate id, a missing id or an
 *  out-of-range move is not the property — skip it and move on. */
function applyStoreOp(state: DatasetState, op: StoreOp): void {
  try {
    switch (op.kind) {
      case 'add':
        state.entries.add({ id: op.id, name: op.id, start: 0, end: 1, parentId: op.parentId });
        return;
      case 'remove':
        state.entries.remove(op.id);
        return;
      case 'reparent':
        state.entries.update(op.id, { parentId: op.parentId });
        return;
      case 'move':
        state.entries.update(op.id, { siblingIndex: op.at });
        return;
    }
  } catch {
    // Duplicate ids, missing ids, and an out-of-range move are not the property — skip the op.
  }
}

/** Every sibling group in `state` holds exactly its own 0..n-1, no gap and no repeat — the invariant
 *  the renumber pass owes after every commit. */
function assertEveryGroupIsExact(state: DatasetState): void {
  const rankByGroup = new Map<string, number[]>();
  for (const entry of state.entries.all) {
    const groupKey = String(entry.parent()?.id ?? 'root');
    const ranks = rankByGroup.get(groupKey) ?? [];
    ranks.push(entry.read('siblingIndex') as number);
    rankByGroup.set(groupKey, ranks);
  }
  for (const ranks of rankByGroup.values()) {
    expect([...ranks].sort((a, b) => a - b)).toEqual(ranks.map((_unused, index) => index));
  }
}

/** `all`'s order, read back through the public `children()` door alone — independent of `#byParent`,
 *  the structure `all` itself walks — so a divergence between the two would show up here. */
function assertAllIsDepthFirst(state: DatasetState): void {
  const roots = state.entries.all
    .filter((entry) => entry.parent() === undefined)
    .sort((a, b) => (a.read('siblingIndex') as number) - (b.read('siblingIndex') as number));
  const ordered: string[] = [];
  const walk = (entry: Entry): void => {
    ordered.push(String(entry.id));
    for (const child of entry.children()) walk(child);
  };
  for (const root of roots) walk(root);
  expect(state.entries.all.map((entry) => String(entry.id))).toEqual(ordered);
}

function snapshotOf(state: DatasetState): string {
  return JSON.stringify(state.entries.all);
}

describe('add, remove, reparent and move keep every group exact, on a small tree (#528)', () => {
  it('holds after every step, restores through undo-all and redo-all, and survives a load round-trip', () => {
    fc.assert(
      fc.property(fc.array(storeOpArb, { minLength: 1, maxLength: 20 }), (ops) => {
        const state = newSeededState();
        const before = snapshotOf(state);

        for (const op of ops) {
          applyStoreOp(state, op);
          assertEveryGroupIsExact(state);
          assertAllIsDepthFirst(state);
        }
        const afterAllOps = snapshotOf(state);

        while (state.canUndo) state.undo();
        expect(snapshotOf(state)).toBe(before);

        while (state.canRedo) state.redo();
        expect(snapshotOf(state)).toBe(afterAllOps);

        const ranksBeforeLoad = new Map(
          state.entries.all.map((entry) => [String(entry.id), entry.read('siblingIndex') as number]),
        );
        state.entries.load(state.entries.all.map((entry) => entry.toInput()));
        for (const entry of state.entries.all) {
          expect(entry.read('siblingIndex')).toBe(ranksBeforeLoad.get(String(entry.id)));
        }
      }),
      { numRuns: 40 },
    );
  });
});
