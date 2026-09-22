// ADR 0013: there is no `autoGroup` and no `kind` any more. An Entry derives when it has children —
// gaining one promotes it, losing the last one demotes it — and neither door writes a Field for it.
import { describe, expect, it } from 'vitest';
import { DatasetState } from './dataset-state.js';
import { fieldRowsOf } from './change-set.js';
import { entryId } from '../model/index.js';
import { toEndInstant, toInstant } from '../time/index.js';

function withEntries(
  entries: { id: string; parentId?: string; start?: string; end?: string; name?: string; cost?: number }[],
) {
  return new DatasetState({
    entries: entries.map((e) => ({
      name: e.name ?? e.id,
      start: e.start ?? '2026-01-01',
      end: e.end ?? '2026-01-10',
      ...e,
    })),
    timeZone: 'UTC',
    fields: [{ key: 'cost', rollUp: 'sum' }],
  });
}

describe('structure decides derivation (ADR 0013)', () => {
  it('add({ parentId }) promotes a childless entry; one changeset carries the new span, no kind row', () => {
    const state = withEntries([
      { id: 'p1', start: '2026-01-01', end: '2026-01-02' },
      { id: 'c1', start: '2026-03-01', end: '2026-03-05' },
    ]);
    const rows: { field: string; from: unknown; to: unknown }[] = [];
    let changeCount = 0;
    state.on('change', ({ changeSet }) => {
      changeCount += 1;
      for (const row of fieldRowsOf(changeSet)) {
        if (row.id === entryId('p1')) rows.push({ field: String(row.field), from: row.from, to: row.to });
      }
    });

    state.entries.add({ id: 'c2', parentId: 'p1', name: 'c2', start: '2026-06-01', end: '2026-06-05' });

    expect(changeCount).toBe(1);
    expect(rows.some((row) => row.field === 'kind')).toBe(false);
    expect(state.entries.get('p1')!.start).toBe(toInstant('UTC', '2026-06-01', 'test'));
    expect(state.entries.get('p1')!.end).toBe(toEndInstant('UTC', '2026-06-05', 'inclusive', 'test'));
    expect(rows.some((row) => row.field === 'start')).toBe(true);
    expect(rows.some((row) => row.field === 'end')).toBe(true);
  });

  it('update(id, { parentId }) promotes the new parent in the same changeset', () => {
    const state = withEntries([
      { id: 'p1', start: '2026-01-01', end: '2026-01-02' },
      { id: 'c1', start: '2026-03-01', end: '2026-03-05' },
    ]);
    expect(state.entries.get('p1')?.children() ?? []).toEqual([]);

    state.entries.update('c1', { parentId: 'p1' });

    expect(state.entries.get('p1')?.children() ?? []).toHaveLength(1);
    expect(state.entries.get('p1')!.start).toBe(toInstant('UTC', '2026-03-01', 'test'));
    expect(state.entries.get('p1')!.end).toBe(toEndInstant('UTC', '2026-03-05', 'inclusive', 'test'));
  });

  it('promotion drops the parent’s authored rolling-up value in the same ChangeSet as the parentId write', () => {
    const state = withEntries([
      { id: 'p1', start: '2026-01-01', end: '2026-01-02', cost: 500 },
      { id: 'c1', start: '2026-03-01', end: '2026-03-05', cost: 10 },
    ]);
    expect(state.entries.get('p1')!.read('cost')).toBe(500);

    let sawCostDrop = false;
    state.on('change', ({ changeSet }) => {
      sawCostDrop = fieldRowsOf(changeSet).some(
        (row) => row.id === entryId('p1') && row.field === 'cost' && row.from === 500 && row.to === 10,
      );
    });

    state.entries.update('c1', { parentId: 'p1' });

    expect(sawCostDrop).toBe(true);
    expect(state.entries.get('p1')!.read('cost')).toBe(10);
  });

  it('[ADR 0013] losing the last child demotes: name stays, dates clear, no bar', () => {
    const state = withEntries([
      { id: 'p1', start: '2026-01-01', end: '2026-01-02' },
      { id: 'c1', parentId: 'p1', start: '2026-03-01', end: '2026-03-05' },
    ]);
    expect(state.entries.get('p1')!.start).toBe(toInstant('UTC', '2026-03-01', 'test'));

    state.entries.remove('c1');

    const p1 = state.entries.get('p1')!;
    expect(p1.name).toBe('p1');
    expect(p1.start).toBeUndefined();
    expect(p1.end).toBeUndefined();
    expect(state.entries.get('p1')?.children() ?? []).toEqual([]);
  });

  it('construction rolls up a parent that already has children, silently', () => {
    const state = withEntries([
      { id: 'p1', start: '2026-01-01', end: '2026-01-02' },
      { id: 'c1', parentId: 'p1', start: '2026-03-01', end: '2026-03-05' },
    ]);

    expect(state.entries.get('p1')!.start).toBe(toInstant('UTC', '2026-03-01', 'test'));
    expect(state.canUndo).toBe(false);
  });

  it('undo of a promoting transaction restores the parent span and the parentId together', () => {
    const state = withEntries([
      { id: 'p1', start: '2026-01-01', end: '2026-01-02' },
      { id: 'c1', start: '2026-03-01', end: '2026-03-05' },
    ]);
    const start = state.entries.get('p1')!.start;
    const end = state.entries.get('p1')!.end;

    state.entries.update('c1', { parentId: 'p1' });
    expect(state.entries.get('p1')?.children() ?? []).toHaveLength(1);

    state.undo();
    expect(state.entries.get('p1')?.children() ?? []).toEqual([]);
    expect(state.entries.get('p1')!.start).toBe(start);
    expect(state.entries.get('p1')!.end).toBe(end);
    expect(state.entries.get('c1')!.parent()?.id).toBeUndefined();
  });

  it('one undo reverses both the parentId write and the dropped authored value it caused (ADR 0013)', () => {
    const state = withEntries([
      { id: 'p1', start: '2026-01-01', end: '2026-01-02', cost: 500 },
      { id: 'c1', start: '2026-03-01', end: '2026-03-05', cost: 10 },
    ]);

    state.entries.update('c1', { parentId: 'p1' });
    expect(state.entries.get('p1')!.read('cost')).toBe(10); // the authored 500 already dropped
    expect(state.canUndo).toBe(true);

    state.undo();
    expect(state.entries.get('c1')!.parent()?.id).toBeUndefined();
    expect(state.entries.get('p1')!.read('cost')).toBe(500); // one undo restores both
    expect(state.canUndo).toBe(false);
  });
});
