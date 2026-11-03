import { describe, expect, it } from 'vitest';
import { DatasetState } from './dataset-state.js';
import { NO_STORE_ROWS } from './edit-extension.js';
import { createEditRequest } from './edit-request.js';
import { storedParentSource } from './hierarchy-source.js';
import { pluginStoreName } from './plugin-store.js';
import { entryId } from '../model/index.js';
import type { ChangeSet, EditRequest, PluginStore } from '../model/index.js';

const NOTES = 'demo.notes';

interface NoteRow {
  readonly text: string;
}

/** Entries a and b, a notes store, and an extender that renames `b` whenever a note changes. */
function newState(): {
  state: DatasetState;
  notes: PluginStore<NoteRow>;
  requests: EditRequest[];
} {
  const requests: EditRequest[] = [];
  const state = new DatasetState({
    entries: ['a', 'b'].map((id) => ({ id, name: id, start: 0, end: 1 })),
    timeZone: 'UTC',
  });
  const notes = state.pluginStores.reserve<NoteRow>(NOTES);
  state.setExtender(() => (request) => {
    requests.push(request);
    return request.changedStoreRows.length === 0
      ? new Map()
      : new Map([[entryId('b'), { name: 'after note' }]]);
  });
  return { state, notes, requests };
}

function recordChangeSets(state: DatasetState): ChangeSet[] {
  const committed: ChangeSet[] = [];
  state.on('change', ({ changeSet }) => {
    committed.push(changeSet);
  });
  return committed;
}

describe('an edit extender and a transaction that writes only a plugin store', () => {
  it('calls the extender once, with the changed rows', () => {
    const { notes, requests } = newState();

    notes.set('a', { text: 'hello' });

    expect(requests).toHaveLength(1);
    expect(requests[0]!.changedStoreRows).toEqual([
      { store: pluginStoreName(NOTES), id: entryId('a'), from: undefined, to: { text: 'hello' } },
    ]);
  });

  it('lands the extender edits in the same ChangeSet as the row', () => {
    const { state, notes } = newState();
    const committed = recordChangeSets(state);

    notes.set('a', { text: 'hello' });

    expect(committed).toHaveLength(1);
    expect(committed[0]!.updated).toContainEqual(
      expect.objectContaining({ store: pluginStoreName(NOTES), id: entryId('a') }),
    );
    expect(committed[0]!.updated).toContainEqual(
      expect.objectContaining({ id: entryId('b'), field: 'name', to: 'after note' }),
    );
    expect(state.entries.get('b')?.name).toBe('after note');
  });

  it('reverts the row and the edits with one undo', () => {
    const { state, notes } = newState();

    notes.set('a', { text: 'hello' });
    state.undo();

    expect(notes.get('a')).toBeUndefined();
    expect(state.entries.get('b')?.name).toBe('b');
    expect(state.canUndo).toBe(false);
  });

  it('lets the extender read the row as the commit leaves it', () => {
    const { state, notes } = newState();
    let seen: unknown;
    state.setExtender(() => () => {
      seen = state.pluginStores.read<NoteRow>(NOTES)?.get('a');
      return new Map();
    });

    notes.set('a', { text: 'hello' });

    expect(seen).toEqual({ text: 'hello' });
  });

  it('lists no row for a write of the row the store holds', () => {
    const { notes, requests } = newState();
    const row = { text: 'hello' };
    notes.set('a', row);
    requests.length = 0;

    notes.set('a', row);

    expect(requests.every((request) => request.changedStoreRows.length === 0)).toBe(true);
  });

  it('calls the extender with no changed rows for an Entry edit', () => {
    const { state, requests } = newState();

    state.entries.update('a', { name: 'renamed' });

    expect(requests).toHaveLength(1);
    expect(requests[0]!.changedStoreRows).toEqual([]);
  });

  it('commits nothing and lists no row when the transaction writes nothing', () => {
    const { state, requests } = newState();
    const committed = recordChangeSets(state);

    state.transaction(() => undefined);

    expect(committed).toHaveLength(0);
    expect(requests.every((request) => request.changedStoreRows.length === 0)).toBe(true);
    expect(state.entries.get('b')?.name).toBe('b');
  });
});

describe('a drag preview request', () => {
  it('shares one frozen empty list for the changed rows', () => {
    const request = (): EditRequest =>
      createEditRequest({
        isPreview: false,
        entries: new Map(),
        proposed: new Map(),
        added: [],
        removed: [],
        hierarchySource: storedParentSource,
        committedChildIds: new Map(),
        fields: { get: () => undefined },
        lockRule: () => 'anywhere',
      });

    expect(request().changedStoreRows).toBe(NO_STORE_ROWS);
    expect(request().changedStoreRows).toBe(request().changedStoreRows);
  });
});
