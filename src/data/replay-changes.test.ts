// data/ — the read-onto-current-values rule undo, redo and `dataset.replay()` now share (#517
// amendment, ADR 0035). Exercised through `state.replay(changeSet)`, the same public seam `undo()`
// and `redo()` call — `changesToReplay` itself is not a public export.

import { describe, expect, it } from 'vitest';
import type { ChangeSet, EntryInput } from '../model/index.js';
import { changeSetId, entryId } from '../model/index.js';
import { DatasetState } from './dataset-state.js';
import { pluginStoreName } from './plugin-store.js';

interface Seed extends Partial<Omit<EntryInput, 'id'>> {
  id: string;
}

function dataset(entries: Seed[] = []): DatasetState {
  return new DatasetState({
    entries: entries.map((e) => ({ start: 0, end: 1, ...e, name: e.name ?? e.id })),
    timeZone: 'UTC',
  });
}

/** A hand-built recorded step, `origin: 'undo'` — `state.replay(step)` is the same door `undo()`
 *  and `redo()` write through. `id` is a placeholder: `changesToReplay` mints its own. */
function step(rows: Partial<ChangeSet>): ChangeSet {
  return { id: changeSetId(0), origin: 'undo', added: [], removed: [], updated: [], ...rows };
}

function changeSets(state: DatasetState): ChangeSet[] {
  const seen: ChangeSet[] = [];
  state.on('change', ({ changeSet }) => {
    seen.push(changeSet);
  });
  return seen;
}

describe('replay writes each row onto the current value', () => {
  it('the change carries the value it replaced, not the value the step recorded', () => {
    const state = dataset([{ id: 'a', name: 'Server value' }]);
    const seen = changeSets(state);

    state.replay(
      step({
        updated: [
          { store: 'entries', id: entryId('a'), field: 'name', from: 'Stale recorded value', to: 'Old' },
        ],
      }),
    );

    expect(state.entries.get('a')!.name).toBe('Old');
    expect(seen).toEqual([
      expect.objectContaining({
        updated: [{ store: 'entries', id: entryId('a'), field: 'name', from: 'Server value', to: 'Old' }],
      }),
    ]);
  });

  it('a row for an id that is gone writes nothing for it, and the rest of the step still lands', () => {
    const state = dataset([{ id: 'a', name: 'Old' }]);
    const seen = changeSets(state);

    state.replay(
      step({
        updated: [
          { store: 'entries', id: entryId('ghost'), field: 'name', from: 'x', to: 'y' },
          { store: 'entries', id: entryId('a'), field: 'name', from: 'Old', to: 'New' },
        ],
      }),
    );

    expect(state.entries.get('a')!.name).toBe('New');
    expect(seen[0]!.updated).toEqual([
      { store: 'entries', id: entryId('a'), field: 'name', from: 'Old', to: 'New' },
    ]);
  });

  it('a Field row whose current value already equals what the step would write makes no row', () => {
    const state = dataset([{ id: 'a', name: 'Same' }]);
    const seen = changeSets(state);

    state.replay(
      step({
        updated: [{ store: 'entries', id: entryId('a'), field: 'name', from: 'Whatever', to: 'Same' }],
      }),
    );

    expect(seen).toEqual([]);
    expect(state.entries.get('a')!.name).toBe('Same');
  });
});

describe('replay re-adds a missing id, and skips an id that already exists', () => {
  it('re-adds an id the store no longer holds', () => {
    const state = dataset([{ id: 'a', name: 'A' }]);
    const removed = state.entries.storedEntry('a')!;
    state.entries.remove('a');
    expect(state.entries.has('a')).toBe(false);

    state.replay(step({ added: [{ store: 'entries', entity: removed }] }));

    expect(state.entries.get('a')!.name).toBe('A');
  });

  it("skips an id the server re-sent — the server's copy stays", () => {
    const state = dataset([{ id: 'b', name: 'B' }]);
    const staleSnapshot = { ...state.entries.storedEntry('b')!, name: 'Stale snapshot' };
    const seen = changeSets(state);

    state.replay(step({ added: [{ store: 'entries', entity: staleSnapshot }] }));

    expect(seen).toEqual([]);
    expect(state.entries.get('b')!.name).toBe('B');
  });
});

describe('replay removes the entry as it stands now, and its children the step did not name', () => {
  it('removes the current entity, not the stale recorded one, and cascades to committed children', () => {
    const state = dataset([
      { id: 'p', name: 'Parent' },
      { id: 'c1', name: 'C1', parentId: 'p' },
    ]);
    const staleParent = state.entries.storedEntry('p')!;
    state.entries.update('p', { name: 'Edited since' });
    const seen = changeSets(state);

    state.replay(step({ removed: [{ store: 'entries', entity: staleParent }] }));

    expect(state.entries.has('p')).toBe(false);
    expect(state.entries.has('c1')).toBe(false);
    const removedIds = seen[0]!.removed.map((row) => row.entity.id);
    expect(new Set(removedIds)).toEqual(new Set([entryId('p'), entryId('c1')]));
    const removedParent = seen[0]!.removed.find((row) => row.entity.id === entryId('p'))!;
    expect(removedParent.entity.name).toBe('Edited since');
  });

  it('a row for an id already gone writes nothing for it', () => {
    const state = dataset([{ id: 'a', name: 'A' }]);
    const stale = state.entries.storedEntry('a')!;
    state.entries.remove('a');
    const seen = changeSets(state);

    state.replay(step({ removed: [{ store: 'entries', entity: stale }] }));

    expect(seen).toEqual([]);
  });

  it('undo of a remove does not cascade onto a root this same step reparented away from it', () => {
    const state = dataset([
      { id: 'a', name: 'A' },
      { id: 'b', name: 'B' },
      { id: 'c', name: 'C' },
      { id: 'x', name: 'X' },
    ]);

    state.transaction(() => {
      state.entries.add({ id: 'n1', name: 'N1', start: 0, end: 1 });
      state.entries.update('a', { parentId: 'n1' });
    });
    expect(state.entries.get('a')!.read('parentId')).toBe('n1');

    state.undo();

    expect(state.entries.has('n1')).toBe(false);
    expect(state.entries.has('a')).toBe(true);
    expect(state.entries.get('a')!.read('parentId')).toBeUndefined();
    expect(state.entries.get('a')!.read('name')).toBe('A');
  });

  it('a cascaded id keeps only its removal and its store deletion row — no stale Field or store-write row', () => {
    const state = dataset([{ id: 'q', name: 'Old' }]);
    // Stands in for the original step's own commit: `p` exists, and `q` carries the name the
    // undo step is about to revert.
    state.entries.add({ id: 'p', name: 'P' });
    state.entries.update('q', { name: 'New' });
    state.pluginStores.reserve<{ locked: true }>('demo.lock').set('q', { locked: true });
    const staleP = state.entries.storedEntry('p')!;
    // A foreign write joins q to p before the undo step's own removal of p replays.
    state.entries.update('q', { parentId: 'p' });
    const seen = changeSets(state);

    state.replay(
      step({
        removed: [{ store: 'entries', entity: staleP }],
        updated: [
          { store: 'entries', id: entryId('q'), field: 'name', from: 'New', to: 'Old' },
          { store: pluginStoreName('demo.lock'), id: entryId('q'), from: undefined, to: { locked: true } },
        ],
      }),
    );

    expect(state.entries.has('p')).toBe(false);
    expect(state.entries.has('q')).toBe(false);
    const removedIds = new Set(seen[0]!.removed.map((row) => row.entity.id));
    expect(removedIds).toEqual(new Set([entryId('p'), entryId('q')]));
    const qRows = seen[0]!.updated.filter((row) => row.id === entryId('q'));
    expect(qRows).toEqual([
      { store: pluginStoreName('demo.lock'), id: entryId('q'), from: { locked: true }, to: undefined },
    ]);
  });
});

describe('replay drops a store row whose entry is gone', () => {
  it('makes no orphan plugin-store row', () => {
    const state = dataset([{ id: 'a', name: 'A' }]);
    state.entries.remove('a');
    const seen = changeSets(state);

    state.replay(
      step({
        updated: [
          { store: pluginStoreName('demo.lock'), id: entryId('a'), from: undefined, to: { locked: true } },
        ],
      }),
    );

    expect(seen).toEqual([]);
  });

  it('a store row whose current value already matches makes no row', () => {
    const state = dataset([{ id: 'a', name: 'A' }]);
    // Store rows compare by identity (`Object.is`), the same rule `plugin-store.ts`'s own diff uses —
    // so the row must carry the exact object the store already holds, not an equal-looking copy.
    const row = { locked: true as const };
    state.pluginStores.reserve<{ locked: true }>('demo.lock').set('a', row);
    const seen = changeSets(state);

    state.replay(
      step({
        updated: [{ store: pluginStoreName('demo.lock'), id: entryId('a'), from: undefined, to: row }],
      }),
    );

    expect(seen).toEqual([]);
  });
});

describe('a store deletion row applies even when its entry is gone', () => {
  it('redo of a remove deletes the store row that came back on undo', () => {
    const state = dataset([{ id: 'x', name: 'X' }]);
    state.pluginStores.reserve<{ locked: true }>('demo.lock').set('x', { locked: true });
    state.entries.remove('x');

    state.undo();
    expect(state.pluginStores.read<{ locked: true }>('demo.lock')?.get('x')).toEqual({ locked: true });

    state.redo();
    expect(state.entries.has('x')).toBe(false);
    expect(state.pluginStores.read<{ locked: true }>('demo.lock')?.get('x')).toBeUndefined();
  });

  it('undo of an add-with-a-store-row leaves no orphan row', () => {
    const state = dataset([]);
    state.transaction(() => {
      state.entries.add({ id: 'x', name: 'X', start: 0, end: 1 });
      state.pluginStores.reserve<{ locked: true }>('demo.lock').set('x', { locked: true });
    });

    state.undo();

    expect(state.entries.has('x')).toBe(false);
    expect(state.pluginStores.read<{ locked: true }>('demo.lock')?.get('x')).toBeUndefined();
  });
});

describe('replay judges a same-id replace in the store’s own apply order — removed, then added', () => {
  it('undo restores the old row with its old values and its old position; redo brings back the new row', () => {
    const state = dataset([{ id: 'a' }, { id: 'b', name: 'B' }, { id: 'c' }]);

    state.transaction(() => {
      state.entries.remove('b');
      state.entries.add({ id: 'b', name: 'New B', start: 0, end: 1 });
    });
    expect(state.entries.all.map((entry) => entry.id)).toEqual([entryId('a'), entryId('c'), entryId('b')]);
    expect(state.entries.get('b')!.name).toBe('New B');

    state.undo();
    expect(state.entries.all.map((entry) => entry.id)).toEqual([entryId('a'), entryId('b'), entryId('c')]);
    expect(state.entries.get('b')!.name).toBe('B');

    state.redo();
    expect(state.entries.all.map((entry) => entry.id)).toEqual([entryId('a'), entryId('c'), entryId('b')]);
    expect(state.entries.get('b')!.name).toBe('New B');
  });

  it('undoing every step after a replace returns to the seed, with no step stuck mid-stack', () => {
    const state = dataset([{ id: 'a', name: 'A' }]);
    const before = JSON.stringify(state.entries.all);

    state.entries.add({ id: 'n3', name: 'N3', start: 0, end: 1 });
    state.transaction(() => {
      state.entries.remove('n3');
      state.entries.add({ id: 'n3', name: 'New N3', start: 0, end: 1 });
    });
    state.entries.update('a', { name: '' });

    let guard = 0;
    while (state.canUndo) {
      guard++;
      expect(guard).toBeLessThan(10);
      state.undo();
    }

    expect(JSON.stringify(state.entries.all)).toBe(before);
  });
});

describe('replay that has nothing left to write', () => {
  it('fires no beforeChange and no change', () => {
    const state = dataset([{ id: 'a', name: 'Same' }]);
    let beforeChangeFired = false;
    state.on('beforeChange', () => {
      beforeChangeFired = true;
    });
    const seen = changeSets(state);

    state.replay(
      step({
        updated: [{ store: 'entries', id: entryId('a'), field: 'name', from: 'Whatever', to: 'Same' }],
      }),
    );

    expect(beforeChangeFired).toBe(false);
    expect(seen).toEqual([]);
  });
});

describe('replay never stores a parentId loop or a dangling parentId', () => {
  it('drops a parentId row that would close a loop, and raises no hierarchy fault', () => {
    const state = dataset([{ id: 'a' }, { id: 'b' }]);
    state.entries.update('b', { parentId: 'a' }); // b sits under a
    const reports: unknown[] = [];
    state.on('error', (report) => {
      reports.push(report);
    });
    const seen = changeSets(state);

    state.replay(
      step({
        updated: [
          { store: 'entries', id: entryId('a'), field: 'parentId', from: undefined, to: entryId('b') },
          { store: 'entries', id: entryId('a'), field: 'name', from: 'stale', to: 'New A' },
        ],
      }),
    );

    // The loop row (a under b, while b is under a) is dropped; a keeps its current parent. The
    // other row in the same step still lands.
    expect(state.entries.get('a')?.read('parentId')).toBeUndefined();
    expect(state.entries.get('a')?.name).toBe('New A');
    expect(seen).toEqual([
      expect.objectContaining({
        updated: [{ store: 'entries', id: entryId('a'), field: 'name', from: 'a', to: 'New A' }],
      }),
    ]);
    expect(reports).toEqual([]);
  });

  it('lands a re-added entry whose parent is gone as a root, and toInput() loads again', () => {
    const state = dataset([{ id: 'a' }]);
    state.entries.remove('a');

    state.replay(
      step({
        added: [
          {
            store: 'entries',
            entity: { id: entryId('orphan'), parentId: entryId('a'), siblingIndex: 0, name: 'X', props: {} },
          },
        ],
      }),
    );

    expect(state.entries.get('orphan')?.read('parentId')).toBeUndefined();
    const inputs = state.entries.all.map((entry) => entry.toInput());
    expect(() => new DatasetState({ timeZone: 'UTC', entries: inputs })).not.toThrow();
  });
});

describe('replay judges a step’s parentId rows against each other, not one row at a time', () => {
  it('undo of a subtree remove re-adds the child under its own parent, neither as a root', () => {
    const state = dataset([{ id: 'p' }, { id: 'c', parentId: 'p' }]);
    state.entries.remove('p');
    expect(state.entries.has('c')).toBe(false);

    state.undo();

    expect(state.entries.get('p')?.read('parentId')).toBeUndefined();
    expect(state.entries.get('c')?.read('parentId')).toBe('p');
  });

  it('undo of a parent swap restores both sides, instead of reading a mid-step loop and dropping one', () => {
    // The store holds the swap's result: a moved under b, and b moved to root.
    const state = dataset([{ id: 'a', parentId: 'b' }, { id: 'b' }]);

    // Undo's own inverted rows, in the order the swap itself named them.
    state.replay(
      step({
        updated: [
          { store: 'entries', id: entryId('b'), field: 'parentId', from: undefined, to: entryId('a') },
          { store: 'entries', id: entryId('a'), field: 'parentId', from: entryId('b'), to: undefined },
        ],
      }),
    );

    expect(state.entries.get('b')?.read('parentId')).toBe('a');
    expect(state.entries.get('a')?.read('parentId')).toBeUndefined();
  });
});

describe('replay renumbers the sibling groups it touches, dense from 0', () => {
  it('undo of a subtree remove restores the children in dense order after a foreign removal', () => {
    const state = dataset([
      { id: 'p' },
      { id: 'a', parentId: 'p' },
      { id: 'b', parentId: 'p' },
      { id: 'c', parentId: 'p' },
    ]);
    const staleA = state.entries.storedEntry('a')!;
    const staleC = state.entries.storedEntry('c')!;
    state.entries.remove('a');
    state.entries.remove('c');
    state.entries.remove('b'); // a foreign write this step never named

    state.replay(
      step({
        added: [
          { store: 'entries', entity: staleA },
          { store: 'entries', entity: staleC },
        ],
      }),
    );

    expect(state.entries.get('a')!.read('siblingIndex')).toBe(0);
    expect(state.entries.get('c')!.read('siblingIndex')).toBe(1);
  });

  it('undo of a cross-group move restores both groups densely', () => {
    const state = dataset([
      { id: 'p' },
      { id: 'q' },
      { id: 'b', parentId: 'p' },
      { id: 'a', parentId: 'q' },
      { id: 'x', parentId: 'q' },
    ]);
    // A foreign write joins p before a's move back to p replays.
    state.entries.add({ id: 'z', name: 'Z', parentId: 'p', start: 0, end: 1 });

    state.replay(
      step({
        updated: [
          { store: 'entries', id: entryId('a'), field: 'parentId', from: entryId('q'), to: entryId('p') },
        ],
      }),
    );

    expect(state.entries.get('a')!.read('parentId')).toBe('p');
    expect(state.entries.get('a')!.read('siblingIndex')).toBe(0);
    expect(state.entries.get('b')!.read('siblingIndex')).toBe(1);
    expect(state.entries.get('z')!.read('siblingIndex')).toBe(2);
    // q loses a and closes the gap behind it.
    expect(state.entries.get('x')!.read('siblingIndex')).toBe(0);
  });

  it('after a foreign reorder, undo leaves the touched group dense', () => {
    const state = dataset([
      { id: 'p' },
      { id: 'a', parentId: 'p' },
      { id: 'b', parentId: 'p' },
      { id: 'c', parentId: 'p' },
    ]);
    const staleA = state.entries.storedEntry('a')!;
    state.entries.remove('a');

    // A foreign reorder swaps b and c ahead of a's undo landing back in the group.
    state.entries.sync([
      { id: 'p', start: 0, end: 1 },
      { id: 'c', parentId: 'p', start: 0, end: 1 },
      { id: 'b', parentId: 'p', start: 0, end: 1 },
    ]);
    expect(state.entries.get('c')!.read('siblingIndex')).toBe(0);
    expect(state.entries.get('b')!.read('siblingIndex')).toBe(1);

    state.replay(step({ added: [{ store: 'entries', entity: staleA }] }));

    expect(state.entries.get('a')!.read('siblingIndex')).toBe(0);
    expect(state.entries.get('c')!.read('siblingIndex')).toBe(1);
    expect(state.entries.get('b')!.read('siblingIndex')).toBe(2);
  });
});
