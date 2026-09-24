import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { entryId } from '../model/index.js';
import { renumberSiblingGroups } from './sibling-order.js';
import type { SiblingChange, SiblingGroupKey } from './sibling-order.js';

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
