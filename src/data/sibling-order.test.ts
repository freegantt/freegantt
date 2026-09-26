import { describe, expect, it } from 'vitest';
import { entryId, SiblingIndexOutOfRangeError } from '../model/index.js';
import {
  renumberSiblingGroups,
  siblingIndexesAfterDelta,
  siblingIndexesInListOrder,
} from './sibling-order.js';
import type { DeltaPlacement, SiblingChange } from './sibling-order.js';

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
      { id: entryId('c'), group: 'p', at: 0 },
      { id: entryId('a'), group: 'p', at: 2 },
    ];

    const ranks = renumberSiblingGroups(changes, committedSiblingsOf, committedGroupOf);

    // Start [a, b, c]. Move c to 0: [c, a, b]. Move a to 2: [c, b, a].
    expect(ranks.get(entryId('c'))).toBe(0);
    expect(ranks.get(entryId('b'))).toBe(1);
    expect(ranks.get(entryId('a'))).toBe(2);
  });

  it('leaves, then places into the vacated spot — the gap does not linger', () => {
    const { committedSiblingsOf, committedGroupOf } = committedGroupsFrom({ p: ['a', 'b', 'c'] });
    const changes: SiblingChange[] = [{ id: entryId('b') }, { id: entryId('c'), group: 'p', at: 0 }];

    const ranks = renumberSiblingGroups(changes, committedSiblingsOf, committedGroupOf);

    // b leaves: [a, c]. c moves to 0: [c, a].
    expect(ranks.get(entryId('c'))).toBe(0);
    expect(ranks.get(entryId('a'))).toBe(1);
    expect(ranks.has(entryId('b'))).toBe(false);
  });

  it('re-adds an id that left the group earlier in the same replay', () => {
    const { committedSiblingsOf, committedGroupOf } = committedGroupsFrom({ p: ['a', 'b'] });
    const changes: SiblingChange[] = [{ id: entryId('a') }, { id: entryId('a'), group: 'p', at: 1 }];

    const ranks = renumberSiblingGroups(changes, committedSiblingsOf, committedGroupOf);

    // a leaves: [b]. a returns at 1: [b, a].
    expect(ranks.get(entryId('b'))).toBe(0);
    expect(ranks.get(entryId('a'))).toBe(1);
  });

  it('filters a left id out of every group the answer reports', () => {
    const { committedSiblingsOf, committedGroupOf } = committedGroupsFrom({ p: ['a', 'b', 'c'] });
    const changes: SiblingChange[] = [{ id: entryId('b') }];

    const ranks = renumberSiblingGroups(changes, committedSiblingsOf, committedGroupOf);

    expect(ranks.has(entryId('b'))).toBe(false);
    expect(ranks.get(entryId('a'))).toBe(0);
    expect(ranks.get(entryId('c'))).toBe(1);
  });

  it('clamps an at that lands past the end of its group, instead of throwing', () => {
    const { committedSiblingsOf, committedGroupOf } = committedGroupsFrom({ p: ['a', 'b'] });
    const changes: SiblingChange[] = [{ id: entryId('c'), group: 'p', at: 99 }];

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
    const changes: SiblingChange[] = [{ id: entryId('a'), group: 'p2', at: 0 }];

    const ranks = renumberSiblingGroups(changes, committedSiblingsOf, committedGroupOf);

    expect(ranks.get(entryId('b'))).toBe(0);
    expect(ranks.get(entryId('a'))).toBe(0);
    expect(ranks.get(entryId('c'))).toBe(1);
  });
});

describe('siblingIndexesAfterDelta', () => {
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

  function placement(
    id: string,
    group: string | undefined,
    namedIndex: number | undefined,
    isNew: boolean,
  ): DeltaPlacement {
    return { id: entryId(id), group, namedIndex, isNew };
  }

  it('lands a new id with no named index at the end of its group', () => {
    const { committedSiblingsOf, committedGroupOf } = committedGroupsFrom({ p: ['a', 'b'] });

    const ranks = siblingIndexesAfterDelta(
      [],
      [placement('n', 'p', undefined, true)],
      committedSiblingsOf,
      committedGroupOf,
      'entries.syncChanges',
    );

    expect(ranks.get(entryId('n'))).toBe(2);
  });

  it('shifts the later siblings by one for a new id at a named index', () => {
    const { committedSiblingsOf, committedGroupOf } = committedGroupsFrom({ p: ['a', 'b'] });

    const ranks = siblingIndexesAfterDelta(
      [],
      [placement('n', 'p', 0, true)],
      committedSiblingsOf,
      committedGroupOf,
      'entries.syncChanges',
    );

    expect(ranks.get(entryId('n'))).toBe(0);
    expect(ranks.get(entryId('a'))).toBe(1);
    expect(ranks.get(entryId('b'))).toBe(2);
  });

  it('leaves a dense old group and lands at the end of the new one for a kept id that changes group', () => {
    const { committedSiblingsOf, committedGroupOf } = committedGroupsFrom({
      p1: ['a', 'b'],
      p2: ['c'],
    });

    const ranks = siblingIndexesAfterDelta(
      [],
      [placement('a', 'p2', undefined, false)],
      committedSiblingsOf,
      committedGroupOf,
      'entries.syncChanges',
    );

    expect(ranks.get(entryId('b'))).toBe(0);
    expect(ranks.get(entryId('c'))).toBe(0);
    expect(ranks.get(entryId('a'))).toBe(1);
  });

  it('counts only the other members for a kept id with a named index in its own group', () => {
    const { committedSiblingsOf, committedGroupOf } = committedGroupsFrom({ p: ['a', 'b', 'c'] });

    const ranks = siblingIndexesAfterDelta(
      [],
      [placement('c', 'p', 0, false)],
      committedSiblingsOf,
      committedGroupOf,
      'entries.syncChanges',
    );

    expect(ranks.get(entryId('c'))).toBe(0);
    expect(ranks.get(entryId('a'))).toBe(1);
    expect(ranks.get(entryId('b'))).toBe(2);
  });

  it('leaves a removed id group dense from 0', () => {
    const { committedSiblingsOf, committedGroupOf } = committedGroupsFrom({ p: ['a', 'b', 'c'] });

    const ranks = siblingIndexesAfterDelta(
      [entryId('b')],
      [],
      committedSiblingsOf,
      committedGroupOf,
      'entries.syncChanges',
    );

    expect(ranks.get(entryId('a'))).toBe(0);
    expect(ranks.get(entryId('c'))).toBe(1);
    expect(ranks.has(entryId('b'))).toBe(false);
  });

  it('applies two placements into one group in call order', () => {
    const { committedSiblingsOf, committedGroupOf } = committedGroupsFrom({ p: ['a'] });

    const ranks = siblingIndexesAfterDelta(
      [],
      [placement('n1', 'p', 0, true), placement('n2', 'p', 0, true)],
      committedSiblingsOf,
      committedGroupOf,
      'entries.syncChanges',
    );

    // n1 lands at 0: [n1, a]. n2 lands at 0: [n2, n1, a].
    expect(ranks.get(entryId('n2'))).toBe(0);
    expect(ranks.get(entryId('n1'))).toBe(1);
    expect(ranks.get(entryId('a'))).toBe(2);
  });

  it('throws SiblingIndexOutOfRangeError with lastIndex set to the others count', () => {
    const { committedSiblingsOf, committedGroupOf } = committedGroupsFrom({ p: ['a', 'b'] });

    expect(() =>
      siblingIndexesAfterDelta(
        [],
        [placement('n', 'p', 5, true)],
        committedSiblingsOf,
        committedGroupOf,
        'entries.syncChanges',
      ),
    ).toThrow(SiblingIndexOutOfRangeError);

    try {
      siblingIndexesAfterDelta(
        [],
        [placement('n', 'p', 5, true)],
        committedSiblingsOf,
        committedGroupOf,
        'entries.syncChanges',
      );
    } catch (error) {
      expect((error as SiblingIndexOutOfRangeError).lastIndex).toBe(2);
    }
  });

  it('leaves a group the delta did not touch out of the result', () => {
    const { committedSiblingsOf, committedGroupOf } = committedGroupsFrom({
      p1: ['a'],
      p2: ['b'],
    });

    const ranks = siblingIndexesAfterDelta(
      [],
      [placement('n', 'p1', undefined, true)],
      committedSiblingsOf,
      committedGroupOf,
      'entries.syncChanges',
    );

    expect(ranks.has(entryId('b'))).toBe(false);
  });
});
