// data/ — entries.syncChanges(delta): apply only the rows a server changed, where syncAll takes the
// whole list. Exercised through DatasetState the way a consumer would reach it
// (`dataset.entries.syncChanges(delta)`), the same posture entry-store.sync-all.test.ts takes for
// syncAll. The batch mechanics (placement, the tree check) already have unit coverage in
// entry-delta.test.ts and sibling-order.test.ts; this file covers the store door: commits, History,
// reports and refusals.

import { describe, expect, it, vi } from 'vitest';
import { DatasetState } from './dataset-state.js';
import {
  DuplicateEntryIdError,
  EntryNotFoundError,
  MutationCancelledError,
  MutationDuringExtensionHookError,
  ParentCycleError,
  SiblingIndexOutOfRangeError,
  TransactionAlreadyOpenError,
  entryId,
} from '../model/index.js';
import type { ChangeSet, EntryEdits, EntryInput } from '../model/index.js';

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

describe('entries.syncChanges', () => {
  it('an unknown id adds an entry at the end of its group, one change with origin sync, canUndo unchanged', () => {
    const state = dataset([{ id: 'a' }, { id: 'b' }]);
    const seen = changeSets(state);
    const canUndoBefore = state.canUndo;

    state.entries.syncChanges({ upsert: [{ id: 'c', name: 'c', start: 0, end: 1 }] });

    expect(state.entries.all.map((e) => e.id)).toEqual([entryId('a'), entryId('b'), entryId('c')]);
    expect(seen).toHaveLength(1);
    expect(seen[0]!.origin).toBe('sync');
    expect(state.canUndo).toBe(canUndoBefore);
  });

  it('a known id keeps a key its row leaves out, and undefined clears name, start and a declared prop', () => {
    const state = new DatasetState({
      entries: [{ id: 'a', name: 'a', start: 5, end: 10, props: { cost: 3 } }],
      timeZone: 'UTC',
      fields: [{ key: 'cost', type: 'number' }],
    });

    state.entries.syncChanges({ upsert: [{ id: 'a', name: undefined, props: { cost: undefined } }] });

    expect(state.entries.get('a')!.read('start')).toBe(5); // left out, keeps its value
    expect(state.entries.get('a')!.read('name')).toBeUndefined();
    expect(state.entries.get('a')!.read('cost')).toBeUndefined();
  });

  it("remove takes the subtree; a removed id's plugin store row goes, a kept id's row stays", () => {
    const state = dataset([{ id: 'p' }, { id: 'c', parentId: 'p' }, { id: 'kept' }]);
    state.pluginStores.reserve<{ v: number }>('demo.store').set('c', { v: 1 });
    state.pluginStores.reserve<{ v: number }>('demo.store').set('kept', { v: 2 });

    state.entries.syncChanges({ remove: ['p'] });

    expect(state.entries.has('p')).toBe(false);
    expect(state.entries.has('c')).toBe(false);
    expect(state.entries.has('kept')).toBe(true);
    expect(state.pluginStores.read<{ v: number }>('demo.store')!.get('c')).toBeUndefined();
    expect(state.pluginStores.read<{ v: number }>('demo.store')!.get('kept')).toEqual({ v: 2 });
  });

  it('a delta of only unknown remove ids commits nothing', () => {
    const state = dataset([{ id: 'a' }]);
    const seen = changeSets(state);

    state.entries.syncChanges({ remove: ['ghost'] });

    expect(seen).toHaveLength(0);
  });

  it('a new child listed before its new parent lands, and a new child under a stored parent lands last', () => {
    const state = dataset([{ id: 'p' }, { id: 'c1', parentId: 'p' }]);

    state.entries.syncChanges({
      upsert: [
        { id: 'child', parentId: 'parent', name: 'child', start: 0, end: 1 },
        { id: 'parent', name: 'parent', start: 0, end: 1 },
        { id: 'c2', parentId: 'p', name: 'c2', start: 0, end: 1 },
      ],
    });

    expect(state.entries.get('child')!.parent()?.id).toBe(entryId('parent'));
    expect(
      state.entries
        .get('p')!
        .children()
        .map((e) => e.id),
    ).toEqual([entryId('c1'), entryId('c2')]);
  });

  it('an upsert whose parent is removed throws EntryNotFoundError, and leaves the store and History untouched', () => {
    const state = dataset([{ id: 'p' }, { id: 'm', parentId: 'p' }, { id: 'c', parentId: 'm' }]);
    state.entries.update('c', { name: 'edited' });
    const canUndoBefore = state.canUndo;
    const allBefore = state.entries.all;

    // direct parent removed
    expect(() => state.entries.syncChanges({ upsert: [{ id: 'c', name: 'kept' }], remove: ['m'] })).toThrow(
      EntryNotFoundError,
    );
    // grandparent removed
    expect(() => state.entries.syncChanges({ upsert: [{ id: 'c', name: 'kept' }], remove: ['p'] })).toThrow(
      EntryNotFoundError,
    );
    // parent missing from both upsert and the store
    expect(() =>
      state.entries.syncChanges({ upsert: [{ id: 'new', parentId: 'ghost', name: 'n', start: 0, end: 1 }] }),
    ).toThrow(EntryNotFoundError);

    expect(state.entries.all).toBe(allBefore);
    expect(state.canUndo).toBe(canUndoBefore);
  });

  it('a loop throws ParentCycleError; a duplicate upsert id and an id in both lists throw DuplicateEntryIdError', () => {
    const state = dataset([{ id: 'a' }, { id: 'b', parentId: 'a' }]);

    expect(() => state.entries.syncChanges({ upsert: [{ id: 'a', parentId: 'b' }] })).toThrow(
      ParentCycleError,
    );
    expect(() =>
      state.entries.syncChanges({
        upsert: [
          { id: 'n', name: 'n1', start: 0, end: 1 },
          { id: 'n', name: 'n2', start: 0, end: 1 },
        ],
      }),
    ).toThrow(DuplicateEntryIdError);
    expect(() =>
      state.entries.syncChanges({ upsert: [{ id: 'a', name: 'renamed' }], remove: ['a'] }),
    ).toThrow(DuplicateEntryIdError);
  });

  it('order: a rename keeps position, a reparent lands last, a named siblingIndex places, an out-of-range index throws', () => {
    const state = dataset([{ id: 'a' }, { id: 'b' }, { id: 'c' }, { id: 'p2' }]);

    state.entries.syncChanges({ upsert: [{ id: 'b', name: 'B renamed' }] });
    expect(state.entries.all.map((e) => e.id)).toEqual([
      entryId('a'),
      entryId('b'),
      entryId('c'),
      entryId('p2'),
    ]);

    state.entries.syncChanges({
      upsert: [
        { id: 'new', parentId: 'p2', name: 'new', start: 0, end: 1 },
        { id: 'first', siblingIndex: 0, name: 'first', start: 0, end: 1 },
      ],
    });
    expect(state.entries.get('new')!.parent()?.id).toBe(entryId('p2'));
    expect(state.entries.all.map((e) => e.id)[0]).toBe(entryId('first'));

    expect(() => state.entries.syncChanges({ upsert: [{ id: 'a', siblingIndex: 99 }] })).toThrow(
      SiblingIndexOutOfRangeError,
    );
  });

  it('an empty delta and a delta equal to current values commit nothing, and keep entries.all identity', () => {
    const state = dataset([{ id: 'a' }]);
    const allBefore = state.entries.all;
    let beforeChangeFired = false;
    let changeFired = false;
    state.on('beforeChange', () => {
      beforeChangeFired = true;
    });
    state.on('change', () => {
      changeFired = true;
    });

    state.entries.syncChanges({});
    state.entries.syncChanges({ upsert: [state.entries.get('a')!.toInput()] });

    expect(beforeChangeFired).toBe(false);
    expect(changeFired).toBe(false);
    expect(state.entries.all).toBe(allBefore);
  });

  it('keeps Redo, and an undo after syncChanges changed the same Field keeps the server value', () => {
    const state = dataset([{ id: 'a', name: 'original' }]);
    state.entries.update('a', { name: 'local edit' });
    state.undo();
    expect(state.canRedo).toBe(true);

    state.entries.syncChanges({ upsert: [{ id: 'a', name: 'from server' }] });

    expect(state.canRedo).toBe(true);
    state.entries.update('a', { name: 'another local edit' });
    state.entries.syncChanges({ upsert: [{ id: 'a', name: 'server wins' }] });
    state.undo();
    expect(state.entries.get('a')!.name).toBe('server wins');
  });

  it('a "never" lock does not refuse it, a derived parent cell re-rolls, and an EditExtender is not called', () => {
    let cascadeCalls = 0;
    const state = new DatasetState({
      entries: [
        { id: 'p', name: 'p' },
        { id: 'c1', name: 'c1', parentId: 'p', start: 0, end: 1 },
      ],
      timeZone: 'UTC',
      fields: [{ key: 'cost', type: 'number', rollUp: 'sum' }],
      editExtender: (): EntryEdits => {
        cascadeCalls += 1;
        return new Map();
      },
    });
    state.fields.setEditable('name', 'never');

    expect(() =>
      state.entries.syncChanges({
        upsert: [
          { id: 'c1', name: 'renamed', props: { cost: 100 } },
          { id: 'c2', parentId: 'p', name: 'c2', start: 0, end: 1, props: { cost: 200 } },
        ],
      }),
    ).not.toThrow();

    expect(state.entries.get('c1')!.name).toBe('renamed');
    expect(state.entries.get('p')!.read('cost')).toBe(300);
    expect(cascadeCalls).toBe(0);
  });

  it('raises derived-values-dropped only for a rolled-up key the delta named on the parent', () => {
    const state = new DatasetState({
      entries: [
        { id: 'p', name: 'p' },
        { id: 'c1', name: 'c1', parentId: 'p', start: 0, end: 1, props: { cost: 100 } },
      ],
      timeZone: 'UTC',
      fields: [{ key: 'cost', type: 'number', rollUp: 'sum' }],
    });
    const reports: unknown[] = [];
    state.on('error', (report) => {
      reports.push(report);
    });

    // Clearing the only child's value re-rolls the parent to undefined, but the delta named no
    // rolled-up key on the parent itself, so nothing is reported.
    state.entries.syncChanges({ upsert: [{ id: 'c1', props: { cost: undefined } }] });
    expect(reports).toHaveLength(0);

    // The delta names a rolled-up key directly on the parent, alongside a real change to another
    // row so the delta actually commits: the authored value re-rolls to undefined and is reported.
    state.entries.syncChanges({
      upsert: [
        { id: 'p', props: { cost: 999 } },
        { id: 'c1', name: 'c1 renamed' },
      ],
    });
    expect(reports).toHaveLength(1);
    expect((reports[0] as { code: string }).code).toBe('derived-values-dropped');
  });

  it('a parent that loses its last child through remove clears its rolled-up cells, the same as entries.remove()', () => {
    const withDates = () =>
      new DatasetState({
        entries: [
          { id: 'p', name: 'p' },
          { id: 'a', name: 'a', parentId: 'p', start: 0, end: 10 },
          { id: 'b', name: 'b', parentId: 'p', start: 5, end: 20 },
          { id: 'q', name: 'q' },
        ],
        timeZone: 'UTC',
      });

    const viaSync = withDates();
    viaSync.entries.syncChanges({ remove: ['a', 'b'] });

    const viaRemove = withDates();
    viaRemove.entries.remove('a');
    viaRemove.entries.remove('b');

    expect(viaSync.entries.get('p')!.toInput()).toEqual(viaRemove.entries.get('p')!.toInput());
    expect(viaSync.entries.get('p')!.read('start')).toBeUndefined();
    expect(viaSync.entries.get('p')!.read('end')).toBeUndefined();
  });

  it('a parent that loses its last child through reparent clears its rolled-up cells, the same as entries.update()', () => {
    const withCost = () =>
      new DatasetState({
        entries: [
          { id: 'p', name: 'p' },
          { id: 'c1', name: 'c1', parentId: 'p', start: 0, end: 1, props: { cost: 100 } },
          { id: 'q', name: 'q' },
        ],
        timeZone: 'UTC',
        fields: [{ key: 'cost', type: 'number', rollUp: 'sum' }],
      });

    const viaSync = withCost();
    viaSync.entries.syncChanges({ upsert: [{ id: 'c1', parentId: undefined }] });

    const viaUpdate = withCost();
    viaUpdate.entries.update('c1', { parentId: undefined });

    expect(viaSync.entries.get('p')!.toInput()).toEqual(viaUpdate.entries.get('p')!.toInput());
    expect(viaSync.entries.get('p')!.read('cost')).toBeUndefined();
  });

  it('an undeclared flat key on a known id warns and is ignored, and does not throw', () => {
    const state = dataset([{ id: 'a' }]);
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});

    expect(() =>
      state.entries.syncChanges({ upsert: [{ id: 'a', mystery: 'x' } as unknown as { id: string }] }),
    ).not.toThrow();

    expect(warn).toHaveBeenCalled();
    warn.mockRestore();
  });

  it('refusals name entries.syncChanges', () => {
    const state = dataset([{ id: 'a' }]);
    expect(() =>
      state.transaction(() => {
        state.entries.syncChanges({ upsert: [{ id: 'new', name: 'New', start: 0, end: 1 }] });
      }),
    ).toThrow(TransactionAlreadyOpenError);

    const extended = new DatasetState({
      entries: [{ id: 't1', name: 't1', start: 0, end: 1 }],
      timeZone: 'UTC',
      editExtender: (): EntryEdits => {
        extended.entries.syncChanges({ upsert: [{ id: 'new', name: 'New', start: 0, end: 1 }] });
        return new Map();
      },
    });
    expect(() => extended.entries.update('t1', { name: 'edited' })).toThrow(MutationDuringExtensionHookError);

    const notifying = dataset([{ id: 'old' }]);
    notifying.on('change', () => {
      notifying.entries.syncChanges({ upsert: [{ id: 'second', name: 'Second', start: 0, end: 1 }] });
    });
    expect(() =>
      notifying.entries.syncChanges({ upsert: [{ id: 'first', name: 'First', start: 0, end: 1 }] }),
    ).toThrow(
      'entries.syncChanges: you cannot change the Dataset while a beforeChange or change handler runs. Nothing was saved. Make the change after the handler returns.',
    );

    const beforeChanging = dataset([{ id: 'old' }]);
    beforeChanging.on('beforeChange', () => {
      beforeChanging.entries.syncChanges({ upsert: [{ id: 'second', name: 'Second', start: 0, end: 1 }] });
    });
    expect(() =>
      beforeChanging.entries.syncChanges({ upsert: [{ id: 'first', name: 'First', start: 0, end: 1 }] }),
    ).toThrow(
      'entries.syncChanges: you cannot change the Dataset while a beforeChange or change handler runs. Nothing was saved. Make the change after the handler returns.',
    );
  });

  it('a beforeChange veto throws MutationCancelledError, and leaves the store as it was', () => {
    const state = dataset([{ id: 'old' }]);
    state.on('beforeChange', ({ refuse }) => {
      refuse('no syncs today');
      return false;
    });

    expect(() =>
      state.entries.syncChanges({ upsert: [{ id: 'new', name: 'New', start: 0, end: 1 }] }),
    ).toThrow(MutationCancelledError);
    expect(state.entries.all.map((e) => e.id)).toEqual([entryId('old')]);
  });
});
