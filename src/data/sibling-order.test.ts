import { describe, expect, it } from 'vitest';
import { entryId } from '../model/index.js';
import { renumberSiblingGroups, siblingIndexesInListOrder } from './sibling-order.js';
import type { SiblingChange } from './sibling-order.js';

describe('siblingIndexesInListOrder', () => {
  it('ranks each group from 0, counting only entries in that group', () => {
    const entries = [
      { id: entryId('a'), parentId: undefined },
      { id: entryId('b'), parentId: entryId('p') },
      { id: entryId('c'), parentId: undefined },
      { id: entryId('d'), parentId: entryId('p') },
    ];

    const ranks = siblingIndexesInListOrder(
      entries,
      (entry) => entry.id,
      (entry) => entry.parentId,
    );

    expect(ranks.get(entryId('a'))).toBe(0);
    expect(ranks.get(entryId('c'))).toBe(1);
    expect(ranks.get(entryId('b'))).toBe(0);
    expect(ranks.get(entryId('d'))).toBe(1);
  });
});

describe('renumberSiblingGroups', () => {
  function committedGroupsFrom(groups: Record<string, readonly string[]>) {
    const groupOfId = new Map<string, string>();
    for (const [group, ids] of Object.entries(groups)) {
      for (const id of ids) groupOfId.set(id, group);
    }
    return {
      committedSiblingsOf: (group: string | undefined) => (groups[group ?? ''] ?? []).map(entryId),
      committedGroupOf: (id: string) => groupOfId.get(id),
    };
  }

  it('applies two moves in one call in call order', () => {
    const { committedSiblingsOf, committedGroupOf } = committedGroupsFrom({ p: ['a', 'b', 'c'] });
    const changes: SiblingChange[] = [
      { kind: 'place', id: entryId('c'), group: 'p', at: 0 },
      { kind: 'place', id: entryId('a'), group: 'p', at: 2 },
    ];

    const ranks = renumberSiblingGroups(changes, committedSiblingsOf, committedGroupOf);

    // Start [a, b, c]. Move c to 0: [c, a, b]. Move a to 2: [c, b, a].
    expect(ranks.get(entryId('c'))).toBe(0);
    expect(ranks.get(entryId('b'))).toBe(1);
    expect(ranks.get(entryId('a'))).toBe(2);
  });

  it('leaves, then places into the vacated spot — the gap does not linger', () => {
    const { committedSiblingsOf, committedGroupOf } = committedGroupsFrom({ p: ['a', 'b', 'c'] });
    const changes: SiblingChange[] = [
      { kind: 'leave', id: entryId('b') },
      { kind: 'place', id: entryId('c'), group: 'p', at: 0 },
    ];

    const ranks = renumberSiblingGroups(changes, committedSiblingsOf, committedGroupOf);

    // b leaves: [a, c]. c moves to 0: [c, a].
    expect(ranks.get(entryId('c'))).toBe(0);
    expect(ranks.get(entryId('a'))).toBe(1);
    expect(ranks.has(entryId('b'))).toBe(false);
  });

  it('re-adds an id that left the group earlier in the same replay', () => {
    const { committedSiblingsOf, committedGroupOf } = committedGroupsFrom({ p: ['a', 'b'] });
    const changes: SiblingChange[] = [
      { kind: 'leave', id: entryId('a') },
      { kind: 'place', id: entryId('a'), group: 'p', at: 1 },
    ];

    const ranks = renumberSiblingGroups(changes, committedSiblingsOf, committedGroupOf);

    // a leaves: [b]. a returns at 1: [b, a].
    expect(ranks.get(entryId('b'))).toBe(0);
    expect(ranks.get(entryId('a'))).toBe(1);
  });

  it('filters a left id out of every group the answer reports', () => {
    const { committedSiblingsOf, committedGroupOf } = committedGroupsFrom({ p: ['a', 'b', 'c'] });
    const changes: SiblingChange[] = [{ kind: 'leave', id: entryId('b') }];

    const ranks = renumberSiblingGroups(changes, committedSiblingsOf, committedGroupOf);

    expect(ranks.has(entryId('b'))).toBe(false);
    expect(ranks.get(entryId('a'))).toBe(0);
    expect(ranks.get(entryId('c'))).toBe(1);
  });

  it('clamps an at that lands past the end of its group, instead of throwing', () => {
    const { committedSiblingsOf, committedGroupOf } = committedGroupsFrom({ p: ['a', 'b'] });
    const changes: SiblingChange[] = [{ kind: 'place', id: entryId('c'), group: 'p', at: 99 }];

    const ranks = renumberSiblingGroups(changes, committedSiblingsOf, committedGroupOf);

    expect(ranks.get(entryId('a'))).toBe(0);
    expect(ranks.get(entryId('b'))).toBe(1);
    expect(ranks.get(entryId('c'))).toBe(2);
  });

  it('moves an id to a different group, leaving its old group closed and no gap', () => {
    const { committedSiblingsOf, committedGroupOf } = committedGroupsFrom({
      p1: ['a', 'b'],
      p2: ['c'],
    });
    const changes: SiblingChange[] = [{ kind: 'place', id: entryId('a'), group: 'p2', at: 0 }];

    const ranks = renumberSiblingGroups(changes, committedSiblingsOf, committedGroupOf);

    expect(ranks.get(entryId('b'))).toBe(0);
    expect(ranks.get(entryId('a'))).toBe(0);
    expect(ranks.get(entryId('c'))).toBe(1);
  });
});
