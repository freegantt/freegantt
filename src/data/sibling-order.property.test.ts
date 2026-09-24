import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { entryId } from '../model/index.js';
import { renumberSiblingGroups } from './sibling-order.js';
import type { SiblingChange, SiblingGroupKey } from './sibling-order.js';

// #528, I16: every sibling group holds exactly the ranks 0 through one less than its own size, with
// no gap and no repeat, once a write's changes are replayed. Random places, leaves, moves within a
// group and moves across groups, over a small fixed set of ids and two named groups, check that no
// sequence of changes can break the rule.

const IDS = ['a', 'b', 'c', 'd', 'e'] as const;
const GROUPS = ['p', 'q', undefined] as const;
const LEFT = Symbol('left'); // an id no place change named since its last leave — no group holds it

const changeArb: fc.Arbitrary<SiblingChange> = fc.oneof(
  fc.record({
    kind: fc.constant('place' as const),
    id: fc.constantFrom(...IDS).map(entryId),
    group: fc.constantFrom<SiblingGroupKey>(...GROUPS),
    at: fc.nat({ max: IDS.length }),
  }),
  fc.record({
    kind: fc.constant('leave' as const),
    id: fc.constantFrom(...IDS).map(entryId),
  }),
);

// Every id starts in one of the two named groups; `fc.shuffledSubarray` also varies the starting
// rank within each group.
const initialGroupsArb: fc.Arbitrary<Record<'p' | 'q', readonly string[]>> = fc
  .shuffledSubarray([...IDS], { minLength: IDS.length, maxLength: IDS.length })
  .map((shuffled) => {
    const half = Math.ceil(shuffled.length / 2);
    return { p: shuffled.slice(0, half), q: shuffled.slice(half) };
  });

/** The group each id ends in, read the same way `renumberSiblingGroups` reads it: the last change
 *  that names the id wins. Independent of the module under test — it never touches rank or order,
 *  only membership — so it is a fair oracle for I16. */
function finalGroupOf(
  initial: Record<'p' | 'q', readonly string[]>,
  changes: readonly SiblingChange[],
): Map<string, SiblingGroupKey | typeof LEFT> {
  const group = new Map<string, SiblingGroupKey | typeof LEFT>();
  for (const [key, ids] of Object.entries(initial)) for (const id of ids) group.set(id, key);
  for (const change of changes) group.set(change.id, 'group' in change ? change.group : LEFT);
  return group;
}

describe('renumberSiblingGroups property', () => {
  it('leaves every touched group holding exactly its own 0..n-1, no gap, no repeat', () => {
    fc.assert(
      fc.property(initialGroupsArb, fc.array(changeArb, { maxLength: 10 }), (initial, changes) => {
        const groupOfId = new Map<string, string>();
        for (const [key, ids] of Object.entries(initial)) for (const id of ids) groupOfId.set(id, key);
        const committedSiblingsOf = (group: SiblingGroupKey) =>
          (initial[group as 'p' | 'q'] ?? []).map(entryId);
        const committedGroupOf = (id: string) => groupOfId.get(id);

        const ranks = renumberSiblingGroups(changes, committedSiblingsOf, committedGroupOf);
        const finalGroup = finalGroupOf(initial, changes);

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
});
