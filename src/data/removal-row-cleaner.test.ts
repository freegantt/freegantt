import { describe, expect, it } from 'vitest';
import { DatasetState } from './dataset-state.js';
import { pluginStoreName } from './plugin-store.js';
import { MutationDuringExtensionHookError, entryId } from '../model/index.js';
import type { ChangeSet, DatasetEventMap, PluginStore, RemovalRowCleaner } from '../model/index.js';

const NOTES = 'demo.notes';

interface NoteRow {
  readonly about: readonly string[];
}

/** Entries a, b, c. `b` holds a note about `a`; `c` holds a note about `a` and `b`. */
function newState(): { state: DatasetState; notes: PluginStore<NoteRow> } {
  const state = new DatasetState({
    entries: ['a', 'b', 'c'].map((id) => ({ id, name: id, start: 0, end: 1 })),
    timeZone: 'UTC',
  });
  const notes = state.pluginStores.reserve<NoteRow>(NOTES);
  notes.set('b', { about: ['a'] });
  notes.set('c', { about: ['a', 'b'] });
  return { state, notes };
}

/** Drops the removed ids from every note that names one. */
const forgetRemoved =
  (notes: PluginStore<NoteRow>): RemovalRowCleaner =>
  (request) =>
    [...notes.all]
      .filter(([, row]) => row.about.some((id) => request.removedEntryIds.has(entryId(id))))
      .map(([id, row]) => ({
        id,
        row: { about: row.about.filter((name) => !request.removedEntryIds.has(entryId(name))) },
      }));

function recordChangeSets(state: DatasetState): ChangeSet[] {
  const committed: ChangeSet[] = [];
  state.on('change', ({ changeSet }: DatasetEventMap['change']) => {
    committed.push(changeSet);
  });
  return committed;
}

describe('a removal row cleaner', () => {
  it('lands its row writes in the same changeset as the removal', () => {
    const { state, notes } = newState();
    state.addRowCleaner(NOTES, forgetRemoved(notes));
    const committed = recordChangeSets(state);

    state.entries.remove('a');

    expect(committed).toHaveLength(1);
    expect(committed[0]!.removed.map((row) => row.entity.id)).toEqual([entryId('a')]);
    expect(committed[0]!.updated).toContainEqual({
      store: pluginStoreName(NOTES),
      id: entryId('c'),
      from: { about: ['a', 'b'] },
      to: { about: ['b'] },
    });
    expect(notes.get('b')).toEqual({ about: [] });
    expect(notes.get('c')).toEqual({ about: ['b'] });
  });

  it('restores the removal and the rows with one undo, and removes both again with redo', () => {
    const { state, notes } = newState();
    state.addRowCleaner(NOTES, forgetRemoved(notes));

    state.entries.remove('a');
    state.undo();

    expect(state.entries.has('a')).toBe(true);
    expect(notes.get('b')).toEqual({ about: ['a'] });
    expect(notes.get('c')).toEqual({ about: ['a', 'b'] });

    state.redo();

    expect(state.entries.has('a')).toBe(false);
    expect(notes.get('c')).toEqual({ about: ['b'] });
  });

  it('sees the whole subtree and skips a write for an Entry that goes', () => {
    const state = new DatasetState({
      entries: [
        { id: 'p', name: 'p', start: 0, end: 1 },
        { id: 'k', parentId: 'p', name: 'k', start: 0, end: 1 },
        { id: 'z', name: 'z', start: 0, end: 1 },
      ],
      timeZone: 'UTC',
    });
    const notes = state.pluginStores.reserve<NoteRow>(NOTES);
    notes.set('k', { about: ['z'] });
    state.addRowCleaner(NOTES, (request) => [
      { id: 'k', row: { about: [] } },
      { id: 'z', row: { about: [...request.removedEntryIds].map(String).sort() } },
    ]);

    state.entries.remove('p');

    expect(notes.get('k')).toBeUndefined();
    expect(notes.get('z')).toEqual({ about: ['k', 'p'] });
  });

  it('aborts the whole removal when the cleaner throws', () => {
    const { state, notes } = newState();
    state.addRowCleaner(NOTES, () => {
      throw new Error('cleaner failed');
    });
    const committed = recordChangeSets(state);

    expect(() => state.entries.remove('a')).toThrow('cleaner failed');

    expect(committed).toHaveLength(0);
    expect(state.entries.has('a')).toBe(true);
    expect(notes.get('c')).toEqual({ about: ['a', 'b'] });
  });

  it('refuses a store write from inside the cleaner', () => {
    const { state, notes } = newState();
    state.addRowCleaner(NOTES, () => {
      notes.set('b', { about: [] });
      return [];
    });

    expect(() => state.entries.remove('a')).toThrow(MutationDuringExtensionHookError);
    expect(state.entries.has('a')).toBe(true);
  });

  it('builds no request when no plugin installs a cleaner', () => {
    const { state } = newState();

    const writes = state.rowCleanupsFor(() => {
      throw new Error('the request must not be built');
    });

    expect(writes).toEqual([]);
  });
});
