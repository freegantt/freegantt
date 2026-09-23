// data/ — entries.load() (#496): a full fresh start. Exercised through DatasetState the way a
// consumer would reach it (`dataset.entries.load(...)`), the same posture entry-store.mutation.test.ts
// takes for add/update/remove.

import { describe, expect, it } from 'vitest';
import { DatasetState } from './dataset-state.js';
import {
  DuplicateEntryIdError,
  EntryNotFoundError,
  MutationCancelledError,
  MutationDuringExtensionHookError,
  ParentCycleError,
  TransactionAlreadyOpenError,
  entryId,
} from '../model/index.js';
import type { ChangeSet, EntryEdits, EntryInput, ErrorReport, FlatEntryInput } from '../model/index.js';
import {
  assertEntryBatchIsSound,
  assertNoOpenTransaction,
  assertNoRunningExtensionHook,
  listOrderOf,
} from './entry-batch.js';
import { toEntries } from './entry-reader.js';
import { FieldRegistry } from './fields/field-registry.js';

interface Seed extends Partial<Omit<EntryInput, 'id'>> {
  id: string;
}

function dataset(entries: Seed[] = []): DatasetState {
  return new DatasetState({
    entries: entries.map((e) => ({ start: 0, end: 1, ...e, name: e.name ?? e.id })),
    timeZone: 'UTC',
  });
}

function changeSets(state: DatasetState): ChangeSet[] {
  const seen: ChangeSet[] = [];
  state.on('change', ({ changeSet }) => {
    seen.push(changeSet);
  });
  return seen;
}

describe('entry-batch.ts — the shared functions load and sync (#517) both reuse', () => {
  const registry = new FieldRegistry();
  const context = { timeZone: 'UTC', dateOnlyEnd: 'inclusive' as const };
  const read = (inputs: readonly Seed[]) =>
    toEntries(
      inputs.map((e) => ({ start: 0, end: 1, ...e, name: e.name ?? e.id })),
      context,
      registry,
      'test',
    );

  it('assertEntryBatchIsSound throws for a duplicate id, an unknown parent, or a loop — and passes a sound batch', () => {
    expect(() => assertEntryBatchIsSound(read([{ id: 'a' }, { id: 'a' }]), 'test')).toThrow(
      DuplicateEntryIdError,
    );
    expect(() => assertEntryBatchIsSound(read([{ id: 'a', parentId: 'ghost' }]), 'test')).toThrow(
      EntryNotFoundError,
    );
    expect(() =>
      assertEntryBatchIsSound(
        read([
          { id: 'a', parentId: 'b' },
          { id: 'b', parentId: 'a' },
        ]),
        'test',
      ),
    ).toThrow(ParentCycleError);
    expect(() =>
      assertEntryBatchIsSound(read([{ id: 'a' }, { id: 'b', parentId: 'a' }]), 'test'),
    ).not.toThrow();
  });

  it('listOrderOf reads back the ids in the list order it was given', () => {
    expect(listOrderOf(read([{ id: 'c' }, { id: 'a' }, { id: 'b' }]))).toEqual([
      entryId('c'),
      entryId('a'),
      entryId('b'),
    ]);
  });

  it('assertNoOpenTransaction is silent at 0 and throws above it', () => {
    expect(() => assertNoOpenTransaction(0, 'test')).not.toThrow();
    expect(() => assertNoOpenTransaction(1, 'test')).toThrow(TransactionAlreadyOpenError);
  });

  it('assertNoRunningExtensionHook is silent when false and throws when true', () => {
    expect(() => assertNoRunningExtensionHook(false, 'test')).not.toThrow();
    expect(() => assertNoRunningExtensionHook(true, 'test')).toThrow(MutationDuringExtensionHookError);
  });
});

describe('entries.load', () => {
  it('a child listed before its parent lands, and entries.all takes the list order (Q1)', () => {
    const state = dataset();
    state.entries.load([
      { id: 'c', parentId: 'a', name: 'Child', start: 0, end: 1 },
      { id: 'a', name: 'Parent', start: 0, end: 1 },
      { id: 'b', name: 'Sibling', start: 0, end: 1 },
    ]);

    expect(state.entries.all.map((e) => e.id)).toEqual([entryId('c'), entryId('a'), entryId('b')]);
    expect(state.entries.get('c')!.parent()?.id).toBe(entryId('a'));
  });

  it('matches new Dataset({ entries }) for the same valid input (Q1 oracle)', () => {
    const rows = [
      { id: 'a', name: 'Parent', start: 0, end: 1 },
      { id: 'b', name: 'Child', parentId: 'a', start: 0, end: 1 },
    ];
    const fresh = new DatasetState({ entries: rows, timeZone: 'UTC' });
    const state = dataset([{ id: 'stale' }]);
    state.entries.load(rows);

    expect(state.entries.all.map((e) => e.toInput())).toEqual(fresh.entries.all.map((e) => e.toInput()));
  });

  it('an id both the old data and the input list name lands at its input-list position, not its old one', () => {
    const state = dataset([{ id: 'a' }, { id: 'b' }, { id: 'c' }]);

    state.entries.load([
      { id: 'x', name: 'New first', start: 0, end: 1 },
      { id: 'b', name: 'Kept, now last', start: 0, end: 1 },
    ]);

    expect(state.entries.all.map((e) => e.id)).toEqual([entryId('x'), entryId('b')]);
    expect(state.entries.get('b')!.name).toBe('Kept, now last');
  });

  it('a duplicate id, an unknown parent, or a loop throws and leaves the store and History untouched', () => {
    const state = dataset([{ id: 'old' }]);
    state.entries.update('old', { name: 'Edited' });

    expect(() => state.entries.load([{ id: 'a' }, { id: 'a' }])).toThrow(DuplicateEntryIdError);
    expect(() => state.entries.load([{ id: 'a', parentId: 'ghost' }])).toThrow(EntryNotFoundError);
    expect(() =>
      state.entries.load([
        { id: 'a', parentId: 'b' },
        { id: 'b', parentId: 'a' },
      ]),
    ).toThrow(ParentCycleError);

    expect(state.entries.all.map((e) => e.id)).toEqual([entryId('old')]);
    expect(state.entries.get('old')!.name).toBe('Edited');
    expect(state.canUndo).toBe(true);
  });

  it('commits one change with origin "load", and canUndo/canRedo both read false after it', () => {
    const state = dataset([{ id: 'old' }]);
    state.entries.update('old', { name: 'Edited' });
    expect(state.canUndo).toBe(true);

    const seen = changeSets(state);
    state.entries.load([{ id: 'new', name: 'New', start: 0, end: 1 }]);

    expect(seen).toHaveLength(1);
    expect(seen[0]!.origin).toBe('load');
    expect(seen[0]!.removed.map((row) => row.entity.id)).toEqual([entryId('old')]);
    expect(seen[0]!.added.map((row) => row.entity.id)).toEqual([entryId('new')]);
    expect(state.canUndo).toBe(false);
    expect(state.canRedo).toBe(false);
  });

  it('an empty load into an empty Dataset still commits and still clears History (Q9)', () => {
    const state = dataset();
    const seen = changeSets(state);

    state.entries.load([]);

    expect(seen).toHaveLength(1);
    expect(seen[0]).toEqual({ id: seen[0]!.id, origin: 'load', added: [], removed: [], updated: [] });
    expect(state.canUndo).toBe(false);
  });

  it('after a load, a later user edit is the only undo step', () => {
    const state = dataset([{ id: 'old' }]);
    state.entries.update('old', { name: 'Edited' });
    state.entries.load([{ id: 'new', name: 'New', start: 0, end: 1 }]);

    state.entries.update('new', { name: 'Renamed' });
    expect(state.canUndo).toBe(true);
    state.undo();
    expect(state.entries.get('new')!.name).toBe('New');
    expect(state.canUndo).toBe(false);
  });

  it('a beforeChange veto throws MutationCancelledError, and leaves the store and History as they were', () => {
    const state = dataset([{ id: 'old' }]);
    state.entries.update('old', { name: 'Edited' });
    state.on('beforeChange', ({ refuse }) => {
      refuse('no loads today');
      return false;
    });

    expect(() => state.entries.load([{ id: 'new', name: 'New', start: 0, end: 1 }])).toThrow(
      MutationCancelledError,
    );
    expect(state.entries.all.map((e) => e.id)).toEqual([entryId('old')]);
    expect(state.canUndo).toBe(true);
  });

  it('called inside dataset.transaction(), it refuses with TransactionAlreadyOpenError', () => {
    const state = dataset([{ id: 'old' }]);
    expect(() =>
      state.transaction(() => {
        state.entries.load([{ id: 'new', name: 'New', start: 0, end: 1 }]);
      }),
    ).toThrow(TransactionAlreadyOpenError);
    expect(state.entries.all.map((e) => e.id)).toEqual([entryId('old')]);
  });

  it('an EditExtender that calls entries.load() throws MutationDuringExtensionHookError, and the user edit is not saved either (#323)', () => {
    const state = new DatasetState({
      entries: [{ id: 't1', name: 't1', start: 0, end: 1 }],
      timeZone: 'UTC',
      editExtender: (): EntryEdits => {
        state.entries.load([{ id: 'new', name: 'New', start: 0, end: 1 }]);
        return new Map();
      },
    });
    let changeCount = 0;
    state.on('change', () => {
      changeCount += 1;
    });

    expect(() => state.entries.update(entryId('t1'), { name: 'a' })).toThrow(
      MutationDuringExtensionHookError,
    );
    expect(changeCount).toBe(0);
    expect(state.entries.all.map((e) => e.id)).toEqual([entryId('t1')]);
  });

  it('an id in both lists keeps no old plugin-store row, selection or other per-entry state (L1)', () => {
    const state = dataset([{ id: 'kept' }]);
    state.pluginStores.reserve<{ locked: true }>('demo.lock').set('kept', { locked: true });
    expect(state.pluginStores.read<{ locked: true }>('demo.lock')!.get('kept')).toEqual({ locked: true });

    state.entries.load([{ id: 'kept', name: 'Fresh kept', start: 0, end: 1 }]);

    expect(state.pluginStores.read<{ locked: true }>('demo.lock')!.get('kept')).toBeUndefined();
    expect(state.entries.get('kept')!.name).toBe('Fresh kept');
  });

  it("a plugin's declared Field value loads (Q6), through toInput() the same as any other key", () => {
    const state = new DatasetState({
      entries: [],
      timeZone: 'UTC',
      fields: [{ key: 'phaseId', type: 'text', editable: 'api' }],
    });

    const inputs: FlatEntryInput<{ phaseId: string }>[] = [
      { id: 't1', name: 'Task', start: 0, end: 1, phaseId: 'ph-1' },
    ];
    state.entries.load(inputs);

    expect(state.entries.get('t1')!.read('phaseId')).toBe('ph-1');
  });

  it('a derived parent cell re-rolls on load, the same as construction (Q3)', () => {
    const state = new DatasetState({
      entries: [],
      timeZone: 'UTC',
      fields: [{ key: 'cost', type: 'number', rollUp: 'sum' }],
    });

    const inputs: FlatEntryInput<{ cost: number }>[] = [
      { id: 'p1', name: 'Parent', cost: 999 },
      { id: 'c1', name: 'Child', parentId: 'p1', cost: 100 },
      { id: 'c2', name: 'Child', parentId: 'p1', cost: 200 },
    ];
    state.entries.load(inputs);

    expect(state.entries.get('p1')!.read('cost')).toBe(300);
  });

  it('a load that authors a value on a parent whose only child has none drops it and reports "derived-values-dropped", the same as construction (ADR 0013 decision 5, Q3)', () => {
    const reports: ErrorReport[] = [];
    const state = new DatasetState({
      entries: [],
      timeZone: 'UTC',
      fields: [{ key: 'cost', type: 'number', rollUp: 'sum' }],
    });
    state.on('error', (report) => {
      reports.push(report);
    });

    const inputs: FlatEntryInput<{ cost: number }>[] = [
      { id: 'p1', name: 'Parent', cost: 999 },
      { id: 'c1', name: 'Child', parentId: 'p1' },
    ];
    state.entries.load(inputs);

    expect(state.entries.get('p1')!.read('cost')).toBeUndefined();
    expect(reports).toHaveLength(1);
    expect(reports[0]?.code).toBe('derived-values-dropped');
    expect(reports[0]?.message).toContain('"cost"');
    expect(reports[0]?.message).toContain('"p1"');
  });
});
