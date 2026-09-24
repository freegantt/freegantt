import { describe, expect, it, vi } from 'vitest';
import { DatasetState } from './dataset-state.js';
import { PluginStores, pluginStoreName } from './plugin-store.js';
import { fieldRowsOf } from './change-set.js';
import { MutationDuringExtensionHookError, entryId } from '../model/index.js';
import type { ChangeSet, DatasetEventMap, EntryId, PluginId, PluginStoreName } from '../model/index.js';

const LOCK: PluginId = 'demo.lock';
const LOCK_STORE = pluginStoreName(LOCK);

interface LockRow {
  readonly locked: true;
}

const twoEntries = [
  { id: 't1', name: 'Design', start: '2026-09-01', end: '2026-09-08' },
  { id: 't2', name: 'Build', start: '2026-09-08', end: '2026-09-15' },
];

function newState(): DatasetState {
  return new DatasetState({ entries: twoEntries, timeZone: 'UTC' });
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

  // A3 (#247 S3-3): `get`/`set`/`remove` accept a plain string, like `dataset.entries.get` does —
  // an app author never brands an id by hand to call a plugin store.
  it('accepts a plain string id everywhere a branded EntryId works, on the owner handle and the read-only view', () => {
    const state = newState();
    const lock = state.pluginStores.reserve<LockRow>(LOCK);

    lock.set('t1', { locked: true });
    lock.set(entryId('t2'), { locked: true });
    expect(lock.get('t1')).toEqual({ locked: true });
    expect(lock.get(entryId('t1'))).toEqual({ locked: true });
    expect(lock.get('t2')).toEqual({ locked: true });

    const view = state.pluginStores.read<LockRow>(LOCK);
    expect(view?.get('t1')).toEqual({ locked: true });
    expect(view?.get(entryId('t2'))).toEqual({ locked: true });

    lock.remove('t1');
    expect(lock.get('t1')).toBeUndefined();
    expect(view?.get('t1')).toBeUndefined();
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

  it('a replace in one transaction removes the old plugin rows too — the fresh entity starts with none', () => {
    // `remove('t1'); add({ id: 't1' })` in one transaction is a replace, not an update: the entry
    // that owned the plugin row is gone, so the row goes with it, the same as an ordinary remove.
    const state = newState();
    const lock = state.pluginStores.reserve<LockRow>(LOCK);
    lock.set(entryId('t1'), { locked: true });
    const committed = recordChangeSets(state);

    state.transaction(() => {
      state.entries.remove('t1');
      state.entries.add({ id: 't1', name: 'Design (reborn)', start: '2026-09-01', end: '2026-09-08' });
    });

    expect(committed).toHaveLength(1);
    expect(storeRowsOf(committed[0]!)).toEqual([
      { store: LOCK_STORE, id: entryId('t1'), from: { locked: true }, to: undefined },
    ]);
    expect(lock.get(entryId('t1'))).toBeUndefined();
  });

  it('a plugin row written for the replaced id after the add lands as one net row, not a second one', () => {
    const state = newState();
    const lock = state.pluginStores.reserve<LockRow>(LOCK);
    const original: LockRow = { locked: true };
    lock.set(entryId('t1'), original);
    const committed = recordChangeSets(state);
    // A fresh object, same shape as `original` — `PluginStore` diffs by identity (`Object.is`), not
    // by value, so this still counts as a change even though `locked` reads `true` on both.
    const freshValue: LockRow = { locked: true };

    state.transaction(() => {
      state.entries.remove('t1');
      state.entries.add({ id: 't1', name: 'Design (reborn)', start: '2026-09-01', end: '2026-09-08' });
      lock.set(entryId('t1'), freshValue);
    });

    // A write this same transaction stages for the row wins over the synthetic removal row `remove()`
    // would otherwise add: one net row, the store's own pre-transaction value to the value this
    // transaction set — not a delete row and a write row both landing for the same (store, id).
    expect(committed).toHaveLength(1);
    expect(storeRowsOf(committed[0]!)).toEqual([
      { store: LOCK_STORE, id: entryId('t1'), from: original, to: freshValue },
    ]);
    expect(lock.get(entryId('t1'))).toEqual(freshValue);
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

describe('a plugin-store write during the extension hook', () => {
  it('throws MutationDuringExtensionHookError rather than opening a nested transaction (#323)', () => {
    const state = new DatasetState({
      entries: twoEntries,
      timeZone: 'UTC',
      editExtender: () => {
        state.pluginStores.reserve<LockRow>(LOCK).set(entryId('t2'), { locked: true });
        return new Map();
      },
    });
    const thrown = vi.fn();

    try {
      state.entries.update('t1', { name: 'Design review' });
    } catch (error) {
      thrown(error);
    }

    expect(thrown).toHaveBeenCalledOnce();
    expect(thrown.mock.calls[0]?.[0]).toBeInstanceOf(MutationDuringExtensionHookError);
  });
});
