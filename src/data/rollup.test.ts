import { describe, expect, it } from 'vitest';
import { DatasetState } from './dataset-state.js';
import { AggregatorFailedError } from '../model/index.js';
import { toEndInstant, toInstant } from '../time/index.js';

function treeDataset(
  entries: {
    id: string;
    parentId?: string;
    kind?: string;
    start?: string;
    end?: string;
    meta?: { cost?: number };
  }[],
  options: { rollUpKinds?: readonly string[] | 'none' } = {},
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
    ...options,
  });
}

function costOf(state: DatasetState, id: string): number | undefined {
  const entry = state.entries.get(id);
  if (!entry) return undefined;
  return state.fieldContext.read<number>(entry, 'cost');
}

describe('rollUpFields (S4.2)', () => {
  it('construction writes parent meta.cost from children (D-S4-35)', () => {
    const state = treeDataset([
      { id: 'root', kind: 'group' },
      { id: 'a', parentId: 'root', meta: { cost: 40 } },
      { id: 'b', parentId: 'root', meta: { cost: 60 } },
    ]);

    expect(costOf(state, 'root')).toBe(100);
    expect((state.entries.get('root')!.meta as { cost: number }).cost).toBe(100);
  });

  it('sum rolls cost up two levels in one commit', () => {
    const state = treeDataset([
      { id: 'root', kind: 'group' },
      { id: 'mid', parentId: 'root', kind: 'group' },
      { id: 'leaf', parentId: 'mid', meta: { cost: 100 } },
    ]);

    state.entries.update('leaf', { cost: 250 });

    expect(costOf(state, 'mid')).toBe(250);
    expect(costOf(state, 'root')).toBe(250);
  });

  it('a parent not in rollUpKinds keeps its authored cost', () => {
    const state = treeDataset(
      [
        { id: 'p1', kind: 'span', meta: { cost: 99 } },
        { id: 'c1', parentId: 'p1', meta: { cost: 10 } },
      ],
      { rollUpKinds: ['group'] },
    );

    state.entries.update('c1', { cost: 50 });

    expect(costOf(state, 'p1')).toBe(99);
  });

  it("rollUpKinds: 'none' leaves the caller's parent start/end/cost after a child edit", () => {
    const state = new DatasetState({
      entries: [
        { id: 'p1', kind: 'group', start: '2026-01-01', end: '2026-01-05', name: 'p1', meta: { cost: 40 } },
        { id: 'c1', parentId: 'p1', start: '2026-06-01', end: '2026-06-05', name: 'c1', meta: { cost: 10 } },
      ],
      timeZone: 'UTC',
      rollUpKinds: 'none',
      fieldTypes: { money: { rollUp: 'sum' } },
      fields: [{ key: 'cost', type: 'money' }],
    });

    state.entries.update('c1', { start: '2026-09-01', end: '2026-09-05', cost: 20 });

    const p1 = state.entries.get('p1')!;
    expect(p1.start).toBe(toInstant('UTC', '2026-01-01'));
    expect(p1.end).toBe(toEndInstant('UTC', '2026-01-05', 'inclusive'));
    expect(costOf(state, 'p1')).toBe(40);
    expect(state.isRollUpKind('group')).toBe(false);
  });

  it('[S4-A8] an empty group keeps its zero-length span, then gains a real one when a child arrives', () => {
    const state = new DatasetState({
      entries: [{ id: 'g1', kind: 'group', name: 'g1' }],
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
        { id: 'p1', kind: 'group', name: 'p1' },
        { id: 'c1', parentId: 'p1', name: 'c1', start: '2026-01-01', end: '2026-01-05', meta: { cost: 1 } },
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
            const value = (child.meta as { cost?: number } | undefined)?.cost;
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
    expect(fired).toBe(false);
    expect(costOf(state, 'c1')).toBe(1);
    expect(state.canUndo).toBe(false);
  });

  it('[S4-A1] undo reverts a rolled-up parent cost with the child edit in one step', () => {
    const state = treeDataset([
      { id: 'root', kind: 'group' },
      { id: 'leaf', parentId: 'root', meta: { cost: 100 } },
    ]);

    state.entries.update('leaf', { cost: 500 });
    expect(costOf(state, 'root')).toBe(500);

    state.undo();
    expect(costOf(state, 'leaf')).toBe(100);
    expect(costOf(state, 'root')).toBe(100);
  });

  it('a parent whose Field has rollUp: none keeps its cost while span still rolls up', () => {
    const state = new DatasetState({
      entries: [
        { id: 'p1', kind: 'group', name: 'p1', meta: { notes: 5 } },
        { id: 'c1', parentId: 'p1', name: 'c1', start: '2026-01-01', end: '2026-01-05', meta: { notes: 2 } },
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
    const state = treeDataset([
      { id: 'a', kind: 'group' },
      { id: 'b', kind: 'group' },
      { id: 'c', parentId: 'a', meta: { cost: 10 } },
    ]);

    state.entries.update('c', { parentId: 'b', cost: 20 });

    expect(costOf(state, 'a')).toBe(10);
    expect(costOf(state, 'b')).toBe(20);
  });

  it('D-S4-11: every store child counts toward the parent, including one a view would hide', () => {
    const state = treeDataset([
      { id: 'root', kind: 'group' },
      { id: 'visible', parentId: 'root', meta: { cost: 40 } },
      { id: 'hidden', parentId: 'root', meta: { cost: 60 } },
    ]);

    expect(costOf(state, 'root')).toBe(100);
    state.entries.update('visible', { cost: 50 });
    expect(costOf(state, 'hidden')).toBe(60);
    expect(costOf(state, 'root')).toBe(110);
  });
});
