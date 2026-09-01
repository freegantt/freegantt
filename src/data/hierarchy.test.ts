import { describe, expect, it } from 'vitest';
import { DatasetState } from './dataset-state.js';
import { entryId } from '../model/index.js';
import { toEndInstant, toInstant } from '../time/index.js';

function withAutoGroup(
  entries: {
    id: string;
    parentId?: string;
    kind?: string;
    start?: string;
    end?: string;
    name?: string;
  }[],
  autoGroup = true,
) {
  return new DatasetState({
    entries: entries.map((e) => ({
      name: e.name ?? e.id,
      start: e.start ?? '2026-01-01',
      end: e.end ?? '2026-01-10',
      ...e,
    })),
    timeZone: 'UTC',
    hierarchy: { autoGroup },
  });
}

describe('autoGroup (S4.5, [S4-A9])', () => {
  it('add({ parentId }) promotes a span parent; one changeset carries kind and the parent span', () => {
    const state = withAutoGroup([
      { id: 'p1', start: '2026-01-01', end: '2026-01-02' },
      { id: 'c1', start: '2026-03-01', end: '2026-03-05' },
    ]);
    const rows: { field: string; from: unknown; to: unknown }[] = [];
    let changeCount = 0;
    state.on('change', ({ changeSet }) => {
      changeCount += 1;
      for (const row of changeSet.updated) {
        if (row.id === entryId('p1')) rows.push({ field: String(row.field), from: row.from, to: row.to });
      }
    });

    state.entries.add({
      id: 'c2',
      parentId: 'p1',
      name: 'c2',
      start: '2026-06-01',
      end: '2026-06-05',
    });

    expect(changeCount).toBe(1);
    expect(state.entries.get('p1')!.kind).toBe('group');
    expect(rows.some((row) => row.field === 'kind' && row.from === 'span' && row.to === 'group')).toBe(true);
    expect(state.entries.get('p1')!.start).toBe(toInstant('UTC', '2026-06-01'));
    expect(state.entries.get('p1')!.end).toBe(toEndInstant('UTC', '2026-06-05', 'inclusive'));
    expect(rows.some((row) => row.field === 'start')).toBe(true);
    expect(rows.some((row) => row.field === 'end')).toBe(true);
  });

  it('update(id, { parentId }) promotes the new parent in the same changeset', () => {
    const state = withAutoGroup([
      { id: 'p1', start: '2026-01-01', end: '2026-01-02' },
      { id: 'c1', start: '2026-03-01', end: '2026-03-05' },
    ]);
    let kindRow = false;
    state.on('change', ({ changeSet }) => {
      kindRow = changeSet.updated.some(
        (row) =>
          row.id === entryId('p1') && row.field === 'kind' && row.from === 'span' && row.to === 'group',
      );
    });

    state.entries.update('c1', { parentId: 'p1' });

    expect(state.entries.get('p1')!.kind).toBe('group');
    expect(kindRow).toBe(true);
    expect(state.entries.get('p1')!.start).toBe(toInstant('UTC', '2026-03-01'));
    expect(state.entries.get('p1')!.end).toBe(toEndInstant('UTC', '2026-03-05', 'inclusive'));
  });

  it("a non-span parent is not promoted; a second child on an already-'group' promotes nothing", () => {
    const state = withAutoGroup([
      { id: 'm1', kind: 'buffer', start: '2026-01-01', end: '2026-01-02' },
      { id: 'g1', kind: 'group', start: '2026-02-01', end: '2026-02-10' },
      { id: 'leaf', parentId: 'g1', start: '2026-02-01', end: '2026-02-10' },
    ]);
    const kinds: string[] = [];
    state.on('change', ({ changeSet }) => {
      for (const row of changeSet.updated) {
        if (row.field === 'kind') kinds.push(`${String(row.id)}:${String(row.to)}`);
      }
    });

    state.entries.add({
      id: 'under-m',
      parentId: 'm1',
      name: 'under-m',
      start: '2026-04-01',
      end: '2026-04-02',
    });
    expect(state.entries.get('m1')!.kind).toBe('buffer');

    state.entries.add({
      id: 'under-g',
      parentId: 'g1',
      name: 'under-g',
      start: '2026-08-01',
      end: '2026-08-05',
    });
    expect(state.entries.get('g1')!.kind).toBe('group');
    expect(kinds).toEqual([]);
  });

  it('[S4-A9] removing every child demotes nothing', () => {
    const state = withAutoGroup([
      { id: 'p1', kind: 'group' },
      { id: 'c1', parentId: 'p1', start: '2026-03-01', end: '2026-03-05' },
    ]);

    state.entries.remove('c1');

    expect(state.entries.get('p1')!.kind).toBe('group');
    expect(state.entries.childrenOf('p1')).toEqual([]);
  });

  it('autoGroup: false promotes nothing anywhere', () => {
    const state = new DatasetState({
      entries: [
        { id: 'p1', name: 'p1', start: '2026-01-01', end: '2026-01-02' },
        { id: 'c1', parentId: 'p1', name: 'c1', start: '2026-03-01', end: '2026-03-05' },
      ],
      timeZone: 'UTC',
      hierarchy: { autoGroup: false },
    });
    expect(state.hierarchy.autoGroup).toBe(false);
    expect(state.entries.get('p1')!.kind).toBe('span');
    expect(state.entries.get('p1')!.start).toBe(toInstant('UTC', '2026-01-01'));

    state.entries.add({
      id: 'c2',
      parentId: 'p1',
      name: 'c2',
      start: '2026-06-01',
      end: '2026-06-05',
    });
    expect(state.entries.get('p1')!.kind).toBe('span');
  });

  it('construction promotes a span that already has children, silently', () => {
    const state = withAutoGroup([
      { id: 'p1', start: '2026-01-01', end: '2026-01-02' },
      { id: 'c1', parentId: 'p1', start: '2026-03-01', end: '2026-03-05' },
    ]);

    expect(state.entries.get('p1')!.kind).toBe('group');
    expect(state.entries.get('p1')!.start).toBe(toInstant('UTC', '2026-03-01'));
    expect(state.canUndo).toBe(false);
  });

  it('undo of a promoting transaction restores kind and the parent span together', () => {
    const state = withAutoGroup([
      { id: 'p1', start: '2026-01-01', end: '2026-01-02' },
      { id: 'c1', start: '2026-03-01', end: '2026-03-05' },
    ]);
    const start = state.entries.get('p1')!.start;
    const end = state.entries.get('p1')!.end;

    state.entries.update('c1', { parentId: 'p1' });
    expect(state.entries.get('p1')!.kind).toBe('group');

    state.undo();
    expect(state.entries.get('p1')!.kind).toBe('span');
    expect(state.entries.get('p1')!.start).toBe(start);
    expect(state.entries.get('p1')!.end).toBe(end);
    expect(state.entries.get('c1')!.parentId).toBeUndefined();
  });
});
