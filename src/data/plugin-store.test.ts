import { describe, expect, it, vi } from 'vitest';
import { DatasetState } from './dataset-state.js';
import { PluginStores, pluginStoreName } from './plugin-store.js';
import { fieldRowsOf } from './change-set.js';
import { entryId } from '../model/index.js';
import type {
  ChangeSet,
  DatasetEventMap,
  EntryId,
  PluginId,
  PluginStore,
  PluginStoreName,
} from '../model/index.js';

const LOCK: PluginId = 'demo.lock';
const LOCK_STORE = pluginStoreName(LOCK);

interface LockRow {
  readonly locked: true;
}

const twoEntries = [
  { id: 't1', name: 'Design', start: '2026-09-01', end: '2026-09-08' },
  { id: 't2', name: 'Build', start: '2026-09-08', end: '2026-09-15' },
];

function newState(options: { installPlugins?: (state: DatasetState) => () => void } = {}): DatasetState {
  return new DatasetState({ entries: twoEntries, timeZone: 'UTC', ...options });
}

/** Every changeset this Dataset commits, in order — what the "one changeset" claims below read. */
function recordChangeSets(state: DatasetState): ChangeSet[] {
  const committed: ChangeSet[] = [];
  state.on('change', ({ changeSet }: DatasetEventMap['change']) => {
    committed.push(changeSet);
  });
  return committed;
}

/** The rows one plugin store contributed to a changeset. Defaults to the lock store most tests use. */
function storeRowsOf(
  changeSet: ChangeSet,
  store: PluginStoreName = LOCK_STORE,
): readonly { store: unknown; id: EntryId; from: unknown; to: unknown }[] {
  return changeSet.updated.filter((row) => row.store === store);
}

describe('PluginStores.reserve', () => {
  it('returns the same handle when one plugin reserves twice (issue #137 F17)', () => {
    const state = newState();
    expect(state.pluginStores.reserve<LockRow>(LOCK)).toBe(state.pluginStores.reserve<LockRow>(LOCK));
  });

  it('keeps two plugins apart, because the store name is the reserving plugin id', () => {
    const state = newState();
    const lock = state.pluginStores.reserve<LockRow>(LOCK);
    const other = state.pluginStores.reserve<{ note: string }>('demo.notes');

    lock.set(entryId('t1'), { locked: true });
    expect(other.get(entryId('t1'))).toBeUndefined();
    expect(lock.get(entryId('t1'))).toEqual({ locked: true });
  });
});

describe('PluginStores.read (D-S5-30)', () => {
  it('sees the owner rows and offers no way to write them', () => {
    const state = newState();
    state.pluginStores.reserve<LockRow>(LOCK).set(entryId('t1'), { locked: true });

    const view = state.pluginStores.read<LockRow>(LOCK);
    expect(view?.get(entryId('t1'))).toEqual({ locked: true });
    expect([...(view?.all ?? [])]).toHaveLength(1);
    expect(view).not.toHaveProperty('set');
    expect(view).not.toHaveProperty('remove');
  });

  it('answers undefined for a plugin that never reserved a store', () => {
    const state = newState();
    expect(state.pluginStores.read('demo.neverReserved')).toBeUndefined();
  });

  it('answers undefined for rows the Document carried in for an uninstalled plugin', () => {
    // Passenger data is not a store anyone may read — it is data this Dataset only carries through.
    const state = new DatasetState({
      entries: twoEntries,
      timeZone: 'UTC',
      pluginRows: { 'demo.absent': { t1: { locked: true } } },
    });
    expect(state.pluginStores.read('demo.absent')).toBeUndefined();
    expect(state.pluginStores.toDocument()).toEqual({ 'demo.absent': { t1: { locked: true } } });
  });
});

describe('a plugin-store write on the commit path (D-S5-24)', () => {
  it('lands in the same changeset as the entry edit it accompanies', () => {
    const state = newState();
    const lock = state.pluginStores.reserve<LockRow>(LOCK);
    const committed = recordChangeSets(state);

    state.transaction(() => {
      state.entries.update('t1', { name: 'Design review' });
      lock.set(entryId('t1'), { locked: true });
    });

    expect(committed).toHaveLength(1);
    const changeSet = committed[0]!;
    expect(fieldRowsOf(changeSet).map((row) => row.field)).toEqual(['name']);
    expect(storeRowsOf(changeSet)).toEqual([
      { store: LOCK_STORE, id: entryId('t1'), from: undefined, to: { locked: true } },
    ]);
  });

  it('reverts with the entry edit in one undo step (I7)', () => {
    const state = newState();
    const lock = state.pluginStores.reserve<LockRow>(LOCK);

    state.transaction(() => {
      state.entries.update('t1', { name: 'Design review' });
      lock.set(entryId('t1'), { locked: true });
    });
    state.undo();

    expect(state.entries.get('t1')?.name).toBe('Design');
    expect(lock.get(entryId('t1'))).toBeUndefined();

    state.redo();
    expect(state.entries.get('t1')?.name).toBe('Design review');
    expect(lock.get(entryId('t1'))).toEqual({ locked: true });
  });

  it('commits on its own, with no entry row touched (#156)', () => {
    const state = newState();
    const lock = state.pluginStores.reserve<LockRow>(LOCK);
    const committed = recordChangeSets(state);
    const revisionBefore = state.datasetRevision;

    lock.set(entryId('t2'), { locked: true });

    expect(committed).toHaveLength(1);
    expect(fieldRowsOf(committed[0]!)).toHaveLength(0);
    expect(storeRowsOf(committed[0]!)).toHaveLength(1);
    expect(state.datasetRevision).toBe(revisionBefore + 1);
    expect(state.canUndo).toBe(true);

    state.undo();
    expect(lock.get(entryId('t2'))).toBeUndefined();
  });

  it('records no row when the write stores the value already there', () => {
    const state = newState();
    const lock = state.pluginStores.reserve<LockRow>(LOCK);
    const row: LockRow = { locked: true };
    lock.set(entryId('t1'), row);

    const committed = recordChangeSets(state);
    lock.set(entryId('t1'), row);
    expect(committed).toHaveLength(0);
  });

  it('removes an entry plugin rows in the same changeset that removes the entry', () => {
    const state = newState();
    const lock = state.pluginStores.reserve<LockRow>(LOCK);
    lock.set(entryId('t1'), { locked: true });
    const committed = recordChangeSets(state);

    state.entries.remove('t1');

    expect(committed).toHaveLength(1);
    expect(storeRowsOf(committed[0]!)).toEqual([
      { store: LOCK_STORE, id: entryId('t1'), from: { locked: true }, to: undefined },
    ]);
    expect(lock.get(entryId('t1'))).toBeUndefined();
  });

  it('removes an entry row from a second store, even when a staged row in another store spells the same characters', () => {
    // `plugin:` + `tt1` and `plugin:t` + `t1` join to the same string. `pendingRows` must tell these
    // two stores apart by structure, not by a concatenated key (R4).
    const state = newState();
    const short = state.pluginStores.reserve<LockRow>('');
    const long = state.pluginStores.reserve<LockRow>('t');
    long.set(entryId('t1'), { locked: true });
    const committed = recordChangeSets(state);

    state.transaction(() => {
      short.set(entryId('tt1'), { locked: true });
      state.entries.remove('t1');
    });

    expect(committed).toHaveLength(1);
    // Each store keeps its own row. A concatenated key would have merged or dropped one of them.
    expect(storeRowsOf(committed[0]!, pluginStoreName(''))).toEqual([
      { store: pluginStoreName(''), id: entryId('tt1'), from: undefined, to: { locked: true } },
    ]);
    expect(storeRowsOf(committed[0]!, pluginStoreName('t'))).toEqual([
      { store: pluginStoreName('t'), id: entryId('t1'), from: { locked: true }, to: undefined },
    ]);
  });

  it('reads its own staged row back inside the open transaction', () => {
    const state = newState();
    const lock = state.pluginStores.reserve<LockRow>(LOCK);

    state.transaction(() => {
      lock.set(entryId('t1'), { locked: true });
      expect(lock.get(entryId('t1'))).toEqual({ locked: true });
      expect(lock.all.get(entryId('t1'))).toEqual({ locked: true });
    });
  });

  it('writes nothing when a beforeChange handler refuses the commit', () => {
    const state = newState();
    const lock = state.pluginStores.reserve<LockRow>(LOCK);
    state.on('beforeChange', () => false);

    expect(() => lock.set(entryId('t1'), { locked: true })).toThrow();
    expect(lock.get(entryId('t1'))).toBeUndefined();
  });
});

describe('a plugin-store write while a plugin sets up (issue #137 F17)', () => {
  it('wraps itself in its own transaction, before history exists', () => {
    let lock: PluginStore<LockRow> | undefined;
    const state = newState({
      installPlugins: (installing) => {
        lock = installing.pluginStores.reserve<LockRow>(LOCK);
        lock.set(entryId('t2'), { locked: true });
        return () => undefined;
      },
    });

    expect(lock?.get(entryId('t2'))).toEqual({ locked: true });
    // History subscribes after installation, so seeding a store is not itself an undoable step.
    expect(state.canUndo).toBe(false);
  });
});

describe('PluginStores.toDocument', () => {
  it('writes no plugins key when no plugin holds a row', () => {
    expect(newState().pluginStores.toDocument()).toBeUndefined();
  });

  it('drops the store once its last row goes', () => {
    const state = newState();
    const lock = state.pluginStores.reserve<LockRow>(LOCK);
    lock.set(entryId('t1'), { locked: true });
    lock.remove(entryId('t1'));
    expect(state.pluginStores.toDocument()).toBeUndefined();
  });

  it('carries every plugin rows, uninstalled ones included', () => {
    const state = new DatasetState({
      entries: twoEntries,
      timeZone: 'UTC',
      pluginRows: { 'demo.absent': { t2: { note: 'kept' } } },
    });
    state.pluginStores.reserve<LockRow>(LOCK).set(entryId('t1'), { locked: true });

    expect(state.pluginStores.toDocument()).toEqual({
      'demo.absent': { t2: { note: 'kept' } },
      [LOCK]: { t1: { locked: true } },
    });
  });
});

describe('PluginStores with no transaction runner', () => {
  it('explains itself rather than dropping the write', () => {
    // `data/dataset-state.ts` always binds one; an unbound instance is a wiring mistake, so it says so.
    const stores = new PluginStores();
    expect(() => stores.reserve<LockRow>(LOCK).set(entryId('t1'), { locked: true })).toThrow(
      /not bound to a transaction runner/,
    );
  });
});

describe('two Datasets (I2)', () => {
  it('keep independent stores under the same plugin id', () => {
    const first = newState();
    const second = newState();
    first.pluginStores.reserve<LockRow>(LOCK).set(entryId('t1'), { locked: true });

    expect(second.pluginStores.reserve<LockRow>(LOCK).all.size).toBe(0);
    expect(second.pluginStores.toDocument()).toBeUndefined();
  });
});

describe('a plugin-store write during a change handler', () => {
  it('throws MutationDuringNotificationError rather than opening a nested transaction', () => {
    const state = newState();
    const lock = state.pluginStores.reserve<LockRow>(LOCK);
    const thrown = vi.fn();
    state.on('change', () => {
      try {
        lock.set(entryId('t1'), { locked: true });
      } catch (error) {
        thrown(error);
      }
    });

    state.entries.update('t1', { name: 'Design review' });
    expect(thrown).toHaveBeenCalledOnce();
  });
});
