// data/ — entries.sync() (#517): make a live Dataset match a full list, and record no undo step of
// its own — undo of a user edit still lands after a sync, overwriting whatever the sync wrote.
// Exercised through DatasetState the way a consumer would reach it (`dataset.entries.sync(...)`),
// the same posture entry-store.load.test.ts takes for load.

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
import type { ChangeSet, EntryEdits, EntryInput, FlatEntryInput } from '../model/index.js';

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

describe('entries.sync', () => {
  it('a child listed before its parent lands, and entries.all walks the tree depth-first', () => {
    const state = dataset();
    state.entries.sync([
      { id: 'c', parentId: 'a', name: 'Child', start: 0, end: 1 },
      { id: 'a', name: 'Parent', start: 0, end: 1 },
      { id: 'b', name: 'Sibling', start: 0, end: 1 },
    ]);

    expect(state.entries.all.map((e) => e.id)).toEqual([entryId('a'), entryId('c'), entryId('b')]);
    expect(state.entries.get('c')!.parent()?.id).toBe(entryId('a'));
  });

  it('a duplicate id, an unknown parent, or a loop throws and leaves the store and History untouched', () => {
    const state = dataset([{ id: 'old' }]);
    state.entries.update('old', { name: 'Edited' });

    expect(() => state.entries.sync([{ id: 'a' }, { id: 'a' }])).toThrow(DuplicateEntryIdError);
    expect(() => state.entries.sync([{ id: 'a', parentId: 'ghost' }])).toThrow(EntryNotFoundError);
    expect(() =>
      state.entries.sync([
        { id: 'a', parentId: 'b' },
        { id: 'b', parentId: 'a' },
      ]),
    ).toThrow(ParentCycleError);

    expect(state.entries.all.map((e) => e.id)).toEqual([entryId('old')]);
    expect(state.entries.get('old')!.name).toBe('Edited');
    expect(state.canUndo).toBe(true);
  });

  it('commits one change with origin "sync", and records no undo step', () => {
    const state = dataset([{ id: 'old' }]);
    const seen = changeSets(state);

    state.entries.sync([{ id: 'new', name: 'New', start: 0, end: 1 }]);

    expect(seen).toHaveLength(1);
    expect(seen[0]!.origin).toBe('sync');
    expect(state.canUndo).toBe(false);
  });

  it("a sync keeps Redo, and redo re-applies the user's edit", () => {
    const state = dataset([{ id: 'a' }]);
    state.entries.update('a', { name: 'first edit' });
    state.undo();
    expect(state.canRedo).toBe(true);

    state.entries.sync([
      { id: 'a', name: 'a', start: 0, end: 1 },
      { id: 'b', name: 'b', start: 0, end: 1 },
    ]);

    expect(state.canRedo).toBe(true);
    state.redo();
    expect(state.entries.get('a')!.name).toBe('first edit');
  });

  it('a sync with no changes fires no beforeChange and no change, and keeps entries.all identity and History', () => {
    const state = dataset([{ id: 'a' }]);
    state.entries.update('a', { name: 'edited' });
    const canUndoBefore = state.canUndo;
    const allBefore = state.entries.all;
    let beforeChangeFired = false;
    let changeFired = false;
    state.on('beforeChange', () => {
      beforeChangeFired = true;
    });
    state.on('change', () => {
      changeFired = true;
    });

    state.entries.sync(state.entries.all.map((e) => e.toInput()));

    expect(beforeChangeFired).toBe(false);
    expect(changeFired).toBe(false);
    expect(state.entries.all).toBe(allBefore);
    expect(state.canUndo).toBe(canUndoBefore);
  });

  it('a beforeChange veto throws MutationCancelledError, and leaves the store and History as they were', () => {
    const state = dataset([{ id: 'old' }]);
    state.entries.update('old', { name: 'Edited' });
    state.on('beforeChange', ({ refuse }) => {
      refuse('no syncs today');
      return false;
    });

    expect(() => state.entries.sync([{ id: 'new', name: 'New', start: 0, end: 1 }])).toThrow(
      MutationCancelledError,
    );
    expect(state.entries.all.map((e) => e.id)).toEqual([entryId('old')]);
    expect(state.canUndo).toBe(true);
  });

  it('a "never" lock does not refuse the sync', () => {
    const state = new DatasetState({
      entries: [{ id: 'a', name: 'a', start: 0, end: 1 }],
      timeZone: 'UTC',
    });
    state.fields.setEditable('name', 'never');

    expect(() => state.entries.sync([{ id: 'a', name: 'renamed', start: 0, end: 1 }])).not.toThrow();
    expect(state.entries.get('a')!.name).toBe('renamed');
  });

  it('a derived parent cell re-rolls on sync, the same as load', () => {
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
    state.entries.sync(inputs);

    expect(state.entries.get('p1')!.read('cost')).toBe(300);
  });

  it('an EditExtender is not called by a sync', () => {
    let cascadeCalls = 0;
    const state = new DatasetState({
      entries: [{ id: 't1', name: 't1', start: 0, end: 1 }],
      timeZone: 'UTC',
      editExtender: (): EntryEdits => {
        cascadeCalls += 1;
        return new Map();
      },
    });

    state.entries.sync([{ id: 't1', name: 'renamed', start: 0, end: 1 }]);

    expect(cascadeCalls).toBe(0);
  });

  it("a kept id's store row stays, a removed id's store row goes, and sync records no undo step", () => {
    const state = dataset([{ id: 'kept' }, { id: 'gone' }]);
    state.pluginStores.reserve<{ v: number }>('demo.store').set('kept', { v: 1 });
    state.pluginStores.reserve<{ v: number }>('demo.store').set('gone', { v: 2 });
    const canUndoBeforeSync = state.canUndo;

    state.entries.sync([{ id: 'kept', name: 'kept', start: 0, end: 1 }]);

    expect(state.pluginStores.read<{ v: number }>('demo.store')!.get('kept')).toEqual({ v: 1 });
    expect(state.pluginStores.read<{ v: number }>('demo.store')!.get('gone')).toBeUndefined();
    expect(state.canUndo).toBe(canUndoBeforeSync); // sync records no undo step of its own
  });

  it("a local edit the server has not seen is overwritten; undo writes the value before the edit, and redo gives the server's value back", () => {
    const state = dataset([{ id: 'a', name: 'from server v1' }]);
    state.entries.update('a', { name: 'local edit' });

    state.entries.sync([{ id: 'a', name: 'from server v2', start: 0, end: 1 }]);
    expect(state.entries.get('a')!.name).toBe('from server v2');

    state.undo();
    expect(state.entries.get('a')!.name).toBe('from server v1');

    state.redo();
    expect(state.entries.get('a')!.name).toBe('from server v2');
  });

  it('a reorder writes siblingIndex rows only', () => {
    const state = dataset([{ id: 'a' }, { id: 'b' }, { id: 'c' }]);
    const seen = changeSets(state);

    state.entries.sync(
      [{ id: 'c' }, { id: 'a' }, { id: 'b' }].map((e) => ({ ...e, name: e.id, start: 0, end: 1 })),
    );

    expect(state.entries.all.map((e) => e.id)).toEqual([entryId('c'), entryId('a'), entryId('b')]);
    const fieldRows = seen[0]!.updated.filter((row) => row.store === 'entries') as {
      field: string;
    }[];
    expect(new Set(fieldRows.map((row) => row.field))).toEqual(new Set(['siblingIndex']));
  });

  it('undo after a sync renumbers the group it touches dense from 0, and redo gives the server order back', () => {
    const state = dataset([{ id: 'a' }, { id: 'b' }, { id: 'c' }]);

    state.entries.update('c', { siblingIndex: 0 }); // c moves to the front: c, a, b
    expect(state.entries.all.map((e) => e.id)).toEqual([entryId('c'), entryId('a'), entryId('b')]);

    state.entries.sync(
      [{ id: 'a' }, { id: 'd' }, { id: 'b' }, { id: 'c' }].map((e) => ({
        ...e,
        name: e.id,
        start: 0,
        end: 1,
      })),
    );
    const afterSync = state.entries.all.map((e) => e.id);

    state.undo();

    expect(state.entries.all.map((e) => e.id)).toEqual([
      entryId('a'),
      entryId('b'),
      entryId('c'),
      entryId('d'),
    ]);
    expect(state.entries.all.map((e) => e.read('siblingIndex'))).toEqual([0, 1, 2, 3]);

    state.redo();

    expect(state.entries.all.map((e) => e.id)).toEqual(afterSync);
  });

  it('called inside dataset.transaction(), it refuses with TransactionAlreadyOpenError', () => {
    const state = dataset([{ id: 'old' }]);
    expect(() =>
      state.transaction(() => {
        state.entries.sync([{ id: 'new', name: 'New', start: 0, end: 1 }]);
      }),
    ).toThrow(TransactionAlreadyOpenError);
    expect(state.entries.all.map((e) => e.id)).toEqual([entryId('old')]);
  });

  it('an EditExtender that calls entries.sync() throws MutationDuringExtensionHookError, and the user edit is not saved either', () => {
    const state = new DatasetState({
      entries: [{ id: 't1', name: 't1', start: 0, end: 1 }],
      timeZone: 'UTC',
      editExtender: (): EntryEdits => {
        state.entries.sync([{ id: 'new', name: 'New', start: 0, end: 1 }]);
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

  it('sync called inside a change handler throws MutationDuringNotificationError, naming entries.sync', () => {
    const state = dataset([{ id: 'old' }]);
    state.on('change', () => {
      state.entries.sync([{ id: 'second', name: 'Second', start: 0, end: 1 }]);
    });

    expect(() => state.entries.sync([{ id: 'first', name: 'First', start: 0, end: 1 }])).toThrow(
      'entries.sync: you cannot change the Dataset while a beforeChange or change handler runs. Nothing was saved. Make the change after the handler returns.',
    );
  });

  it('sync called inside a beforeChange handler throws MutationDuringNotificationError, naming entries.sync', () => {
    const state = dataset([{ id: 'old' }]);
    state.on('beforeChange', () => {
      state.entries.sync([{ id: 'second', name: 'Second', start: 0, end: 1 }]);
    });

    expect(() => state.entries.sync([{ id: 'first', name: 'First', start: 0, end: 1 }])).toThrow(
      'entries.sync: you cannot change the Dataset while a beforeChange or change handler runs. Nothing was saved. Make the change after the handler returns.',
    );
  });
});

describe('undo and redo across a sync (#517)', () => {
  it("undo of a user edit after a sync changed the same Field writes the user's old value, and undo then redo gives the server's value back", () => {
    const state = dataset([{ id: 'a', name: 'original' }]);
    state.entries.update('a', { name: 'local edit' });

    state.entries.sync([{ id: 'a', name: 'server value', start: 0, end: 1 }]);
    expect(state.entries.get('a')!.name).toBe('server value');

    state.undo();
    expect(state.entries.get('a')!.name).toBe('original');

    state.redo();
    expect(state.entries.get('a')!.name).toBe('server value');
  });

  it('undo of an add whose id the server removed skips that step and undoes the step before it', () => {
    const state = dataset([{ id: 'a' }, { id: 'b' }]);
    state.entries.update('a', { name: 'renamed' });
    state.entries.add({ id: 'n1', name: 'n1', start: 0, end: 1 });

    state.entries.sync([
      { id: 'a', name: 'renamed', start: 0, end: 1 },
      { id: 'b', name: 'b', start: 0, end: 1 },
    ]);
    expect(state.entries.has('n1')).toBe(false);

    state.undo();

    expect(state.entries.get('a')!.name).toBe('a');
    expect(state.entries.has('n1')).toBe(false);
    expect(state.canUndo).toBe(false);
  });

  it("undo of a remove whose id the server re-sent keeps the server's entry and restores its store rows", () => {
    const state = dataset([{ id: 'a' }, { id: 'b' }]);
    state.pluginStores.reserve<{ v: number }>('demo.store').set('b', { v: 1 });

    state.entries.remove('b');
    expect(state.pluginStores.read<{ v: number }>('demo.store')!.get('b')).toBeUndefined();

    state.entries.sync([
      { id: 'a', name: 'a', start: 0, end: 1 },
      { id: 'b', name: 'b from server', start: 0, end: 1 },
    ]);
    expect(state.entries.get('b')!.name).toBe('b from server');

    state.undo();

    expect(state.entries.get('b')!.name).toBe('b from server'); // the server's entry stays; the add is skipped
    expect(state.pluginStores.read<{ v: number }>('demo.store')!.get('b')).toEqual({ v: 1 });
  });

  it('undo leaves a reparented entry as a root when its old parent now loops through it, and raises no hierarchy-cycle', () => {
    const state = dataset([{ id: 'b' }, { id: 'a', parentId: 'b' }]);
    state.entries.update('a', { parentId: undefined });
    expect(state.entries.get('a')!.parent()).toBeUndefined();

    state.entries.sync([
      { id: 'b', name: 'b', parentId: 'a', start: 0, end: 1 },
      { id: 'a', name: 'a', start: 0, end: 1 },
    ]);
    expect(state.entries.get('b')!.parent()?.id).toBe(entryId('a'));

    expect(() => state.undo()).not.toThrow();
    expect(state.entries.get('a')!.parent()).toBeUndefined();
    expect(state.entries.get('b')!.parent()?.id).toBe(entryId('a'));
  });

  it('undo re-rolls a parent whose other child the server moved since the step', () => {
    const state = new DatasetState({
      entries: [
        { id: 'p', name: 'p' },
        { id: 'c1', name: 'c1', parentId: 'p', start: 100, end: 110 },
        { id: 'c2', name: 'c2', parentId: 'p', start: 200, end: 210 },
      ],
      timeZone: 'UTC',
    });
    expect(state.entries.get('p')!.start).toBe(100);

    state.entries.update('c1', { start: 50, end: 60 });
    expect(state.entries.get('p')!.start).toBe(50);

    state.entries.sync([
      { id: 'p', name: 'p' },
      { id: 'c1', name: 'c1', parentId: 'p', start: 50, end: 60 },
      { id: 'c2', name: 'c2', parentId: 'p', start: 10, end: 20 },
    ]);
    expect(state.entries.get('p')!.start).toBe(10);

    state.undo();

    expect(state.entries.get('c1')!.start).toBe(100);
    expect(state.entries.get('p')!.start).toBe(10); // c2's server value, not c1's restored one
  });
});
