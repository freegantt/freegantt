import { describe, expect, it } from 'vitest';
import { DatasetState } from './dataset-state.js';
import { AggregatorFailedError, entryId } from '../model/index.js';
import type { ChangeSet } from '../model/index.js';
import { toEndInstant, toInstant } from '../time/index.js';

function treeDataset(
  entries: {
    id: string;
    parentId?: string;
    start?: string;
    end?: string;
    props?: { cost?: number };
  }[],
) {
  return new DatasetState({
    entries: entries.map((e) => ({
      name: e.id,
      start: e.start ?? '2026-01-01',
      end: e.end ?? '2026-01-10',
      ...e,
    })),
    timeZone: 'UTC',
    fieldTypes: { money: { rollUp: 'sum' } },
    fields: [{ key: 'cost', type: 'money' }],
  });
}

function costOf(state: DatasetState, id: string): number | undefined {
  const entry = state.entries.get(id);
  if (!entry) return undefined;
  return state.fieldContext.read(entry, 'cost') as number | undefined;
}

describe('rollUpFields (S4.2)', () => {
  it('construction writes parent props.cost from children (ADR 0011)', () => {
    const state = treeDataset([
      { id: 'root' },
      { id: 'a', parentId: 'root', props: { cost: 40 } },
      { id: 'b', parentId: 'root', props: { cost: 60 } },
    ]);

    expect(costOf(state, 'root')).toBe(100);
    expect((state.entries.get('root')!.props as { cost: number }).cost).toBe(100);
  });

  it('sum rolls cost up two levels in one commit', () => {
    const state = treeDataset([
      { id: 'root' },
      { id: 'mid', parentId: 'root' },
      { id: 'leaf', parentId: 'mid', props: { cost: 100 } },
    ]);

    state.entries.update('leaf', { cost: 250 });

    expect(costOf(state, 'mid')).toBe(250);
    expect(costOf(state, 'root')).toBe(250);
  });

  // `rollUpKinds`/`hierarchy.autoGroup` (a per-kind opt-out of rolling up) were retired end to end
  // by ADR 0013: a Field rolls up for every Entry that has children, with no kind to opt out by.
  // Their two tests are gone with the feature, not weakened.

  it('[S4-A8] an empty group keeps its zero-length span, then gains a real one when a child arrives', () => {
    const state = new DatasetState({
      entries: [{ id: 'g1', name: 'g1' }],
      timeZone: 'UTC',
    });
    const g1 = state.entries.get('g1')!;
    expect(g1.start).toBe(g1.end);

    state.entries.add({
      id: 'c1',
      parentId: 'g1',
      name: 'c1',
      start: '2026-03-01',
      end: '2026-03-05',
    });

    const rolled = state.entries.get('g1')!;
    expect(rolled.start).toBe(toInstant('UTC', '2026-03-01'));
    expect(rolled.end).toBe(toEndInstant('UTC', '2026-03-05', 'inclusive'));
  });

  it('D-S4-9: a throwing Aggregator raises AggregatorFailedError and commits nothing', () => {
    let rollupCalls = 0;
    const state = new DatasetState({
      entries: [
        { id: 'p1', name: 'p1' },
        { id: 'c1', parentId: 'p1', name: 'c1', start: '2026-01-01', end: '2026-01-05', props: { cost: 1 } },
      ],
      timeZone: 'UTC',
      fieldTypes: { money: { rollUp: 'sum' } },
      fields: [{ key: 'cost', type: 'money' }],
      aggregators: {
        sum: (children) => {
          rollupCalls += 1;
          if (rollupCalls > 1) throw new Error('boom');
          let total = 0;
          for (const child of children) {
            const value = (child.props as { cost?: number } | undefined)?.cost;
            if (typeof value === 'number') total += value;
          }
          return total;
        },
      },
    });
    let fired = false;
    state.on('change', () => {
      fired = true;
    });

    expect(() => state.entries.update('c1', { cost: 2 })).toThrow(AggregatorFailedError);
    try {
      state.entries.update('c1', { cost: 2 });
    } catch (error) {
      expect(error).toBeInstanceOf(AggregatorFailedError);
      expect((error as AggregatorFailedError).cause).toBeInstanceOf(Error);
      expect(((error as AggregatorFailedError).cause as Error).message).toBe('boom');
    }
    expect(fired).toBe(false);
    expect(costOf(state, 'c1')).toBe(1);
    expect(state.canUndo).toBe(false);
  });

  it('[S4-A1] undo reverts a rolled-up parent cost with the child edit in one step', () => {
    const state = treeDataset([{ id: 'root' }, { id: 'leaf', parentId: 'root', props: { cost: 100 } }]);

    state.entries.update('leaf', { cost: 500 });
    expect(costOf(state, 'root')).toBe(500);

    state.undo();
    expect(costOf(state, 'leaf')).toBe(100);
    expect(costOf(state, 'root')).toBe(100);
  });

  it('a parent whose Field has rollUp: none keeps its cost while span still rolls up', () => {
    const state = new DatasetState({
      entries: [
        { id: 'p1', name: 'p1', props: { notes: 5 } },
        { id: 'c1', parentId: 'p1', name: 'c1', start: '2026-01-01', end: '2026-01-05', props: { notes: 2 } },
      ],
      timeZone: 'UTC',
      fieldTypes: { tally: { rollUp: 'sum' } },
      fields: [{ key: 'notes', type: 'tally', rollUp: 'none' }],
    });

    state.entries.update('c1', { start: '2026-06-01', end: '2026-06-05', notes: 9 });

    const parent = state.entries.get('p1')!;
    expect(state.fieldContext.read(parent, 'notes')).toBe(5);
    expect(parent.start).toBe(toInstant('UTC', '2026-06-01'));
  });
  it('reparenting recomputes both the old and new parent', () => {
    // `a` keeps a second child (`d`) so the reparent below does not also demote it (ADR 0013) —
    // this test's claim is the recompute on both sides, not the demotion clear hierarchy.test.ts
    // already covers.
    const state = treeDataset([
      { id: 'a' },
      { id: 'b' },
      { id: 'c', parentId: 'a', props: { cost: 10 } },
      { id: 'd', parentId: 'a', props: { cost: 5 } },
    ]);

    state.entries.update('c', { parentId: 'b', cost: 20 });

    expect(costOf(state, 'a')).toBe(5);
    expect(costOf(state, 'b')).toBe(20);
  });

  describe('D-S4-8 / P1 — rollup after child removal', () => {
    it('[P1 regression] the review probe: parent cost drops when the cheaper child is removed', () => {
      const state = treeDataset([
        { id: 'p' },
        { id: 'a', parentId: 'p', props: { cost: 10 } },
        { id: 'b', parentId: 'p', props: { cost: 5 } },
      ]);

      expect(costOf(state, 'p')).toBe(15);

      state.entries.remove('b');

      expect(costOf(state, 'p')).toBe(10);
      expect((state.entries.get('p')!.props as { cost: number }).cost).toBe(10);
    });

    it('[P1 regression] removing the child that extended the parent span shrinks start/end', () => {
      const state = treeDataset([
        { id: 'p', start: '2026-01-01', end: '2026-01-10' },
        { id: 'a', parentId: 'p', start: '2026-01-01', end: '2026-01-05', props: { cost: 10 } },
        { id: 'b', parentId: 'p', start: '2026-06-01', end: '2026-06-10', props: { cost: 5 } },
      ]);

      const before = state.entries.get('p')!;
      expect(before.end).toBe(toEndInstant('UTC', '2026-06-10', 'inclusive'));

      state.entries.remove('b');

      const after = state.entries.get('p')!;
      expect(costOf(state, 'p')).toBe(10);
      expect(after.end).toBe(toEndInstant('UTC', '2026-01-05', 'inclusive'));
      expect(after.start).toBe(toInstant('UTC', '2026-01-01'));
    });

    it('[P1 / D-S4-8] removing a grandchild recomputes every roll-up ancestor in one commit', () => {
      const state = treeDataset([
        { id: 'root' },
        { id: 'mid', parentId: 'root' },
        { id: 'leaf', parentId: 'mid', props: { cost: 100 } },
        { id: 'sibling', parentId: 'mid', props: { cost: 25 } },
      ]);

      expect(costOf(state, 'mid')).toBe(125);
      expect(costOf(state, 'root')).toBe(125);

      state.entries.remove('leaf');

      expect(costOf(state, 'mid')).toBe(25);
      expect(costOf(state, 'root')).toBe(25);
    });

    it('[P1] undo restores the parent aggregate with the removed child', () => {
      const state = treeDataset([
        { id: 'p' },
        { id: 'a', parentId: 'p', props: { cost: 10 } },
        { id: 'b', parentId: 'p', props: { cost: 5 } },
      ]);

      state.entries.remove('b');
      expect(costOf(state, 'p')).toBe(10);
      expect(state.entries.has('b')).toBe(false);

      state.undo();

      expect(state.entries.has('b')).toBe(true);
      expect(costOf(state, 'p')).toBe(15);
      expect(costOf(state, 'b')).toBe(5);
    });

    it('[P1] removal records the parent rollup in the changeset', () => {
      const state = treeDataset([
        { id: 'p' },
        { id: 'a', parentId: 'p', props: { cost: 10 } },
        { id: 'b', parentId: 'p', props: { cost: 5 } },
      ]);

      let changeSet: ChangeSet | undefined;
      state.on('change', ({ changeSet: cs }) => {
        changeSet = cs;
      });

      state.entries.remove('b');

      expect(changeSet).toBeDefined();
      const parentCost = changeSet!.updated.find(
        (row) => row.store === 'entries' && row.id === entryId('p') && row.field === 'cost',
      );
      expect(parentCost).toEqual({
        store: 'entries',
        id: entryId('p'),
        field: 'cost',
        from: 15,
        to: 10,
      });
    });
  });

  it('D-S4-11: every store child counts toward the parent, including one a view would hide', () => {
    const state = treeDataset([
      { id: 'root' },
      { id: 'visible', parentId: 'root', props: { cost: 40 } },
      { id: 'hidden', parentId: 'root', props: { cost: 60 } },
    ]);

    expect(costOf(state, 'root')).toBe(100);
    state.entries.update('visible', { cost: 50 });
    expect(costOf(state, 'hidden')).toBe(60);
    expect(costOf(state, 'root')).toBe(110);
  });
});
