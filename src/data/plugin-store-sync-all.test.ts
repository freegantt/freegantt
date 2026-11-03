import { describe, expect, it } from 'vitest';
import { DatasetState } from './dataset-state.js';
import { pluginStoreName } from './plugin-store.js';
import { EntryNotFoundError, MutationDuringNotificationError, entryId } from '../model/index.js';
import type { ChangeSet, DatasetEventMap, PluginStore } from '../model/index.js';

const NOTES = 'demo.notes';

interface NoteRow {
  readonly text: string;
}

function newState(): { state: DatasetState; notes: PluginStore<NoteRow> } {
  const state = new DatasetState({
    entries: ['a', 'b', 'c'].map((id) => ({ id, name: id, start: 0, end: 1 })),
    timeZone: 'UTC',
  });
  return { state, notes: state.pluginStores.reserve<NoteRow>(NOTES) };
}

function recordChangeSets(state: DatasetState): ChangeSet[] {
  const committed: ChangeSet[] = [];
  state.on('change', ({ changeSet }: DatasetEventMap['change']) => {
    committed.push(changeSet);
  });
  return committed;
}

describe('store.syncAll', () => {
  it('writes, adds and removes rows in one sync change set', () => {
    const { state, notes } = newState();
    notes.set('a', { text: 'old a' });
    notes.set('b', { text: 'old b' });
    const committed = recordChangeSets(state);

    notes.syncAll(
      new Map([
        ['b', { text: 'new b' }],
        ['c', { text: 'new c' }],
      ]),
    );

    expect(committed).toHaveLength(1);
    expect(committed[0]!.origin).toBe('sync');
    expect([...notes.all]).toEqual([
      [entryId('b'), { text: 'new b' }],
      [entryId('c'), { text: 'new c' }],
    ]);
    expect(committed[0]!.updated).toContainEqual({
      store: pluginStoreName(NOTES),
      id: entryId('a'),
      from: { text: 'old a' },
      to: undefined,
    });
  });

  it('commits nothing when every row is the same object', () => {
    const { state, notes } = newState();
    const row = { text: 'same' };
    notes.set('a', row);
    const committed = recordChangeSets(state);

    notes.syncAll(new Map([['a', row]]));

    expect(committed).toHaveLength(0);
  });

  it('throws for an id with no Entry and writes nothing', () => {
    const { state, notes } = newState();
    notes.set('a', { text: 'keep' });
    const committed = recordChangeSets(state);

    expect(() =>
      notes.syncAll(
        new Map([
          ['b', { text: 'b' }],
          ['ghost', { text: 'ghost' }],
        ]),
      ),
    ).toThrow(EntryNotFoundError);

    expect(committed).toHaveLength(0);
    expect([...notes.all]).toEqual([[entryId('a'), { text: 'keep' }]]);
  });

  it('records no undo step: undo skips it and still undoes the earlier user write', () => {
    const { state, notes } = newState();
    notes.set('a', { text: 'user write' });

    notes.syncAll(new Map([['b', { text: 'synced' }]]));
    state.undo();

    expect(notes.get('a')).toBeUndefined();
    expect(notes.get('b')).toEqual({ text: 'synced' });
    expect(state.canUndo).toBe(false);
  });

  it('keeps the Redo stack', () => {
    const { state, notes } = newState();
    notes.set('a', { text: 'user write' });
    state.undo();

    notes.syncAll(new Map([['b', { text: 'synced' }]]));

    expect(state.canRedo).toBe(true);
  });

  it('refuses to run inside a change handler', () => {
    const { state, notes } = newState();
    let thrown: unknown;
    state.on('change', () => {
      try {
        notes.syncAll(new Map());
      } catch (error) {
        thrown = error;
      }
    });

    notes.set('a', { text: 'x' });

    expect(thrown).toBeInstanceOf(MutationDuringNotificationError);
  });
});
