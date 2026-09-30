import { describe, expect, it } from 'vitest';
import { DatasetState } from './dataset-state.js';
import { pluginStoreName } from './plugin-store.js';
import { EMPTY_ENTRY_IDS } from './edit-extension.js';
import { MutationDuringExtensionHookError, entryId } from '../model/index.js';
import type {
  ChangeSet,
  DatasetEventMap,
  EditRequest,
  EntryId,
  PluginId,
  RemovalExtender,
} from '../model/index.js';

const NOTE: PluginId = 'demo.note';

interface NoteRow {
  readonly text: string;
}

/** Root order: a, p, z. `p` holds one child, `c`. */
function newState(): DatasetState {
  return new DatasetState({
    entries: [
      { id: 'a', name: 'a', start: 0, end: 1 },
      { id: 'p', name: 'p', start: 0, end: 1 },
      { id: 'c', parentId: 'p', name: 'c', start: 0, end: 1 },
      { id: 'z', name: 'z', start: 0, end: 1 },
    ],
    timeZone: 'UTC',
  });
}

function recordChangeSets(state: DatasetState): ChangeSet[] {
  const committed: ChangeSet[] = [];
  state.on('change', ({ changeSet }: DatasetEventMap['change']) => {
    committed.push(changeSet);
  });
  return committed;
}

function ids(...names: string[]): ReadonlySet<EntryId> {
  return new Set(names.map(entryId));
}

/** A parent with no child left has no reason to stay. */
const removesChildlessParent: RemovalExtender = (request) =>
  request.removedEntryIds.has(entryId('c')) && !request.hasChildren('p') ? ids('p') : ids();

describe('the removal hook', () => {
  it('answers no id when no plugin claims it, from one shared frozen set', () => {
    const state = newState();
    const seen: ReadonlySet<EntryId>[] = [];
    state.setRemovalExtender((next) => (request) => {
      seen.push(next(request));
      return next(request);
    });

    state.entries.update('a', { name: 'renamed' });

    expect(seen[0]).toBe(EMPTY_ENTRY_IDS);
    expect(Object.isFrozen(EMPTY_ENTRY_IDS)).toBe(true);
  });

  it('builds no request when no plugin claims it', () => {
    const state = newState();
    let built = 0;

    const removals = state.removalsFor(() => {
      built += 1;
      throw new Error('the request must not be built');
    });

    expect(removals).toBe(EMPTY_ENTRY_IDS);
    expect(built).toBe(0);
  });

  it('removes the parent of the last child that goes, in one ChangeSet and one undo step', () => {
    const state = newState();
    const notes = state.pluginStores.reserve<NoteRow>(NOTE);
    notes.set(entryId('p'), { text: 'keep me' });
    state.setRemovalExtender(() => removesChildlessParent);
    const committed = recordChangeSets(state);

    state.entries.remove('c');

    expect(committed).toHaveLength(1);
    expect(committed[0]!.removed.map((row) => row.entity.id).sort()).toEqual([entryId('c'), entryId('p')]);
    expect(committed[0]!.updated).toContainEqual({
      store: pluginStoreName(NOTE),
      id: entryId('p'),
      from: { text: 'keep me' },
      to: undefined,
    });
    expect(state.entries.has('p')).toBe(false);
    expect(state.entries.get('z')?.read('siblingIndex')).toBe(1);

    state.undo();

    expect(state.entries.has('p')).toBe(true);
    expect(state.entries.has('c')).toBe(true);
    expect(notes.get(entryId('p'))).toEqual({ text: 'keep me' });
    expect(state.entries.get('z')?.read('siblingIndex')).toBe(2);
    expect(state.entries.get('p')?.read('siblingIndex')).toBe(1);

    state.redo();

    expect(state.entries.has('p')).toBe(false);
    expect(state.entries.has('c')).toBe(false);
  });

  it('takes the subtree of a returned id with it', () => {
    const state = newState();
    state.setRemovalExtender(
      () => (request) => (request.removedEntryIds.has(entryId('a')) ? ids('p') : ids()),
    );
    const committed = recordChangeSets(state);

    state.entries.remove('a');

    expect(committed[0]!.removed.map((row) => row.entity.id).sort()).toEqual(
      [entryId('a'), entryId('c'), entryId('p')].sort(),
    );
  });

  it('shows the edit extender the removal in removedEntryIds, descendants included', () => {
    const state = newState();
    state.setRemovalExtender(
      () => (request) => (request.removedEntryIds.has(entryId('a')) ? ids('p') : ids()),
    );
    let seen: EditRequest | undefined;
    state.setExtender(() => (request) => {
      seen = request;
      return new Map();
    });

    state.entries.remove('a');

    expect(new Set(seen!.removedEntryIds)).toEqual(ids('a', 'p', 'c'));
    expect(seen!.entryAfterEdits('p')).toBeUndefined();
  });

  it('calls the occupant once per transaction, even when a removal follows', () => {
    const state = newState();
    let calls = 0;
    state.setRemovalExtender(() => (request) => {
      calls += 1;
      return removesChildlessParent(request);
    });

    state.entries.remove('c');

    expect(calls).toBe(1);
  });

  it('composes: the wrapper receives the current occupant, and both answers apply', () => {
    const state = newState();
    const order: string[] = [];
    state.setRemovalExtender((next) => (request) => {
      order.push('first');
      return new Set([...next(request), entryId('a')]);
    });
    state.setRemovalExtender((next) => (request) => {
      order.push('second');
      return new Set([...next(request), entryId('z')]);
    });

    state.entries.update('p', { name: 'renamed' });

    expect(order).toEqual(['second', 'first']);
    expect(state.entries.has('a')).toBe(false);
    expect(state.entries.has('z')).toBe(false);
  });

  it('skips an unknown id and an id the body already removes, in silence', () => {
    const state = newState();
    state.setRemovalExtender(() => () => ids('nobody', 'c'));
    const committed = recordChangeSets(state);

    state.entries.remove('c');

    expect(committed).toHaveLength(1);
    expect(committed[0]!.removed.map((row) => row.entity.id)).toEqual([entryId('c')]);
  });

  it('folds away an Entry the body adds and the hook removes', () => {
    const state = newState();
    state.setRemovalExtender(() => (request) => (request.addedEntryIds.has(entryId('n')) ? ids('n') : ids()));
    const committed = recordChangeSets(state);

    state.entries.add({ id: 'n', name: 'n', start: 0, end: 1 });

    expect(committed).toHaveLength(0);
    expect(state.entries.has('n')).toBe(false);
  });

  it('never runs on load, syncAll, syncChanges, undo, redo or replay', () => {
    const state = newState();
    state.entries.update('a', { name: 'first' });
    let calls = 0;
    state.setRemovalExtender((next) => (request) => {
      calls += 1;
      return next(request);
    });
    const recorded = recordChangeSets(state);

    state.undo();
    state.redo();
    state.replay({ ...recorded[0]!, origin: 'undo' });
    state.entries.syncAll([{ id: 'a', name: 'server', start: 0, end: 1 }]);
    state.entries.syncChanges({ upsert: [{ id: 'a', name: 'delta', start: 0, end: 1 }] });
    state.entries.load([{ id: 'a', name: 'loaded', start: 0, end: 1 }]);

    expect(calls).toBe(0);
  });

  it('throws MutationDuringExtensionHookError on a store write, and saves nothing', () => {
    const state = newState();
    state.setRemovalExtender(() => () => {
      state.entries.update('z', { name: 'reentrant' });
      return ids();
    });
    const committed = recordChangeSets(state);

    expect(() => state.entries.update('a', { name: 'edited' })).toThrow(MutationDuringExtensionHookError);
    expect(committed).toHaveLength(0);
    expect(state.entries.get('a')?.name).toBe('a');
  });
});
