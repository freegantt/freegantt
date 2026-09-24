import { describe, expect, it } from 'vitest';
import { DatasetState } from './dataset-state.js';
import { changeSetId, entryId, MutationCancelledError } from '../model/index.js';
import type { EditExtender } from './edit-extension.js';

function dataset(
  entries: { id: string; parentId?: string; kind?: string; start?: number; end?: number }[],
  options: { editExtender?: EditExtender; capacity?: number } = {},
): DatasetState {
  return new DatasetState({
    entries: entries.map((e) => ({
      id: e.id,
      ...(e.parentId !== undefined ? { parentId: e.parentId } : {}),
      ...(e.kind !== undefined ? { kind: e.kind } : {}),
      name: e.id,
      ...(e.kind === 'group' && e.start === undefined ? {} : { start: e.start ?? 0, end: e.end ?? 1 }),
    })),
    timeZone: 'UTC',
    ...(options.editExtender ? { editExtender: options.editExtender } : {}),
    ...(options.capacity !== undefined ? { history: { capacity: options.capacity } } : {}),
  });
}

describe('History', () => {
  it('is not undoable on a fresh dataset', () => {
    const state = dataset([{ id: 't1' }]);
    expect(state.canUndo).toBe(false);
    expect(state.canRedo).toBe(false);
  });

  it('undo after one update restores the field', () => {
    const state = dataset([{ id: 't1' }]);
    state.entries.update('t1', { name: 'Roofing' });
    expect(state.entries.get('t1')?.name).toBe('Roofing');

    state.undo();

    expect(state.entries.get('t1')?.name).toBe('t1');
    expect(state.canUndo).toBe(false);
  });

  it('undo of a transaction with fifty edits restores all fifty in one call, one change event', () => {
    const state = dataset(Array.from({ length: 50 }, (_, i) => ({ id: `t${i}` })));
    state.transaction(() => {
      for (let i = 0; i < 50; i += 1) state.entries.update(`t${i}`, { name: `renamed-${i}` });
    });

    let changeCount = 0;
    state.on('change', () => {
      changeCount += 1;
    });
    state.undo();

    expect(changeCount).toBe(1);
    for (let i = 0; i < 50; i += 1) expect(state.entries.get(`t${i}`)?.name).toBe(`t${i}`);
  });

  it('undo of a cascade from the Rollup restores the user field and the parent span (D-S2-22)', () => {
    const state = dataset([
      { id: 'parent', kind: 'group' },
      { id: 'child', parentId: 'parent', start: 0, end: 10 },
    ]);
    // An `Entry` is one object per id and every read is live (ADR 0017), so a "before" reading is a
    // value held, never a row held.
    const parentStartBefore = state.entries.get('parent')!.start;
    const parentEndBefore = state.entries.get('parent')!.end;
    const childEndBefore = state.entries.get('child')!.end;

    state.entries.update('child', { end: 20 });
    expect(state.entries.get('parent')?.end).not.toEqual(parentEndBefore);

    state.undo();

    expect(state.entries.get('child')?.end).toEqual(childEndBefore);
    expect(state.entries.get('parent')?.start).toEqual(parentStartBefore);
    expect(state.entries.get('parent')?.end).toEqual(parentEndBefore);
  });

  it('undoAll restores a group span two separate steps and the Rollup both wrote (#517 review)', () => {
    const state = dataset([
      { id: 'parent', kind: 'group' },
      { id: 'a', parentId: 'parent', start: 0, end: 100 },
      { id: 'b', parentId: 'parent', start: 100, end: 200 },
    ]);
    const parentEndBefore = state.entries.get('parent')!.end;

    state.transaction(() => {
      state.entries.remove('a');
    });
    state.transaction(() => {
      state.entries.remove('b'); // parent's last child — the Rollup now owns nothing to roll up
      state.entries.update('parent', { end: 101 });
    });
    state.entries.add({ id: 'n1', name: 'n1', start: 0, end: 1 });

    while (state.canUndo) state.undo();

    expect(state.entries.get('parent')?.end).toEqual(parentEndBefore);
  });

  it('undo of a cascade from an injected extender restores both the user field and the patched one', () => {
    const cascade: EditExtender = ({ proposed }) => {
      if (proposed.has(entryId('t1'))) return new Map([[entryId('t2'), { name: 'cascaded' }]]);
      return new Map();
    };
    const state = dataset([{ id: 't1' }, { id: 't2' }], { editExtender: cascade });

    state.entries.update('t1', { name: 'edited' });
    expect(state.entries.get('t2')?.name).toBe('cascaded');

    state.undo();

    expect(state.entries.get('t1')?.name).toBe('t1');
    expect(state.entries.get('t2')?.name).toBe('t2');
  });

  it('redo re-applies an undone change; a new edit after undo clears the redo stack', () => {
    const state = dataset([{ id: 't1' }]);
    state.entries.update('t1', { name: 'Roofing' });
    state.undo();
    expect(state.canRedo).toBe(true);

    state.redo();
    expect(state.entries.get('t1')?.name).toBe('Roofing');
    expect(state.canRedo).toBe(false);

    state.undo();
    state.entries.update('t1', { name: 'Framing' });
    expect(state.canRedo).toBe(false);
    expect(state.entries.get('t1')?.name).toBe('Framing');
  });

  it('capacity: with capacity 3, four transactions leave three undoable, the oldest dropped', () => {
    const state = dataset([{ id: 't1' }], { capacity: 3 });
    for (let i = 0; i < 4; i += 1) state.entries.update('t1', { name: `v${i}` });

    let undone = 0;
    while (state.canUndo) {
      state.undo();
      undone += 1;
    }

    expect(undone).toBe(3);
    expect(state.entries.get('t1')?.name).toBe('v0');
  });

  it('undo and redo emit change with origin undo/redo and push nothing onto the stack', () => {
    const state = dataset([{ id: 't1' }]);
    state.entries.update('t1', { name: 'Roofing' });

    const origins: string[] = [];
    state.on('change', ({ changeSet }) => {
      origins.push(changeSet.origin);
    });

    state.undo();
    state.redo();

    expect(origins).toEqual(['undo', 'redo']);
    expect(state.canRedo).toBe(false);
    expect(state.canUndo).toBe(true);
  });

  it('undo of a cascading remove restores the whole subtree', () => {
    const state = dataset([
      { id: 'parent', kind: 'group' },
      { id: 'child', parentId: 'parent', start: 0, end: 10 },
      { id: 'grandchild', parentId: 'child', start: 0, end: 5 },
    ]);

    state.entries.remove('parent');
    expect(state.entries.has('parent')).toBe(false);
    expect(state.entries.has('child')).toBe(false);
    expect(state.entries.has('grandchild')).toBe(false);

    state.undo();

    expect(state.entries.has('parent')).toBe(true);
    expect(state.entries.has('child')).toBe(true);
    expect(state.entries.has('grandchild')).toBe(true);
    expect(state.entries.get('child')?.read('parentId')).toBe('parent');
    expect(state.entries.get('grandchild')?.read('parentId')).toBe('child');
  });

  it('a refused undo throws MutationCancelledError and leaves the stack exactly where it was', () => {
    const state = dataset([{ id: 't1' }]);
    state.entries.update('t1', { name: 'Roofing' });

    const refuse = (): false => false;
    state.on('beforeChange', refuse);
    expect(() => state.undo()).toThrow(MutationCancelledError);
    expect(state.entries.get('t1')?.name).toBe('Roofing');
    expect(state.canUndo).toBe(true);
    expect(state.canRedo).toBe(false);

    state.off('beforeChange', refuse);
    state.undo();
    expect(state.entries.get('t1')?.name).toBe('t1');
  });

  it('removability (D-S2-23): a fresh DatasetState with no history import records nothing and commits identically', () => {
    // History is a subscriber, not a step in the commit path — the commit path never reads it.
    // This test documents the contract; deleting data/history.ts is proven by
    // .dependency-cruiser.cjs's history-is-removable rule plus this behaviour staying observable.
    const state = dataset([{ id: 't1' }]);
    const changeSets: string[] = [];
    state.on('change', ({ changeSet }) => {
      changeSets.push(changeSet.origin);
    });

    state.entries.update('t1', { name: 'Roofing' });

    expect(changeSets).toEqual(['user']);
  });

  it('subscriber order: a handler registered after construction reads canUndo === true inside the change that enabled it', () => {
    const state = dataset([{ id: 't1' }]);
    let sawCanUndo: boolean | undefined;
    state.on('change', () => {
      sawCanUndo = state.canUndo;
    });

    state.entries.update('t1', { name: 'Roofing' });

    expect(sawCanUndo).toBe(true);
  });

  it('subscriber order: a handler registered after construction reads canUndo === false inside the undo change (D-S2-25)', () => {
    const state = dataset([{ id: 't1' }]);
    state.entries.update('t1', { name: 'Roofing' });
    let sawCanUndo: boolean | undefined;
    state.on('change', () => {
      sawCanUndo = state.canUndo;
    });

    state.undo();

    expect(sawCanUndo).toBe(false);
  });

  it('undo-all after remove-then-re-add of the same id restores the original insertion order', () => {
    const state = dataset([{ id: 'a' }, { id: 'b' }, { id: 'c' }]);
    const before = JSON.stringify(state.entries.all.map((entry) => entry.id));

    state.entries.remove('a');
    state.entries.add({ id: 'a', name: 'a', start: 0, end: 1 });
    while (state.canUndo) state.undo();

    expect(JSON.stringify(state.entries.all.map((entry) => entry.id))).toBe(before);
  });

  it('undo-all survives an added id the same step later cascades away (#517 property test)', () => {
    const state = dataset([
      { id: 'a', start: 0, end: 100 },
      { id: 'b', start: 100, end: 200 },
      { id: 'c', start: 200, end: 300 },
      { id: 'x', start: 0, end: 10 },
    ]);
    const before = JSON.stringify(state.entries.all);

    // Step 1: a fresh entry `n3` joins the root sibling group alongside `a`.
    state.entries.add({ id: 'n3', name: 'n3', start: 0, end: 1 });
    // Step 2: `a` moves under `n3`, so undoing step 3 below must place `a` back into a sibling
    // group headed by the very `n3` that step 3 also removes.
    state.entries.update('a', { parentId: 'n3' });
    // Step 3: `n3` is removed — carrying `a` away with it, live, as its last child — and
    // immediately re-added under the same id, a fresh entity with no children. Undo re-adds `a`
    // via this step's recorded row, but the cascade this same undo step runs then carries `a`
    // back out of `working`, because the entity undo restored under `n3`'s id is the fresh one
    // from this step's `added` row, not the one `a` was parented to. `siblingChangesToReplay`
    // must not place an id the cascade has already carried out of `working`.
    state.transaction(() => {
      state.entries.remove('n3');
      state.entries.add({ id: 'n3', name: 'n3', start: 0, end: 1 });
    });

    while (state.canUndo) state.undo();

    expect(JSON.stringify(state.entries.all)).toBe(before);
  });

  it('ignores an outside undo replay with an empty stack instead of moving the cursor negative', () => {
    const state = dataset([{ id: 't1' }]);
    expect(state.canUndo).toBe(false);

    // A hand-built `origin: 'undo'` changeset, replayed straight through the public door
    // (`Dataset.replay`), not through `state.undo()` — the app's own stack never held this step.
    state.replay({
      id: changeSetId(1),
      origin: 'undo',
      added: [],
      removed: [],
      updated: [{ store: 'entries', id: entryId('t1'), field: 'name', from: 't1', to: 'outside-write' }],
    });

    expect(state.entries.get('t1')?.name).toBe('outside-write');
    expect(state.canUndo).toBe(false);
    expect(state.canRedo).toBe(false);

    state.redo();
    expect(state.entries.get('t1')?.name).toBe('outside-write');
  });

  it('ignores an outside redo replay with a full stack instead of appending a phantom step', () => {
    const state = dataset([{ id: 't1' }]);
    state.entries.update('t1', { name: 'Roofing' });
    state.undo();
    state.redo(); // canRedo now false, nothing above the top of the stack

    state.replay({
      id: changeSetId(99),
      origin: 'redo',
      added: [],
      removed: [],
      updated: [{ store: 'entries', id: entryId('t1'), field: 'name', from: 'Roofing', to: 'outside-write' }],
    });

    expect(state.entries.get('t1')?.name).toBe('outside-write');
    // No phantom entry appended, and the cursor did not advance past the real top.
    expect(state.canRedo).toBe(false);
    expect(state.canUndo).toBe(true);
    state.undo();
    expect(state.entries.get('t1')?.name).toBe('t1'); // the real step 1, not the outside write
  });

  it('ignores an outside undo replay against a non-empty stack instead of corrupting the stack slot', () => {
    const state = dataset([{ id: 't1' }]);
    state.entries.update('t1', { name: 'Roofing' }); // the one real undoable step

    state.replay({
      id: changeSetId(99),
      origin: 'undo',
      added: [],
      removed: [],
      updated: [{ store: 'entries', id: entryId('t1'), field: 'name', from: 'Roofing', to: 'outside-write' }],
    });
    expect(state.entries.get('t1')?.name).toBe('outside-write');

    state.undo(); // must still invert the real step 1, not the outside write it never recorded

    expect(state.entries.get('t1')?.name).toBe('t1');
  });

  it('a refused undo un-forgets a moot step the same click already forgot on the way to the throw', () => {
    const state = dataset([{ id: 't1' }]); // name starts as 't1'
    state.entries.update('t1', { name: 'b' }); // step 1
    state.entries.update('t1', { name: 'c' }); // step 2

    // A sync independently sets the field back to what undoing step 2 would write — step 2 is
    // moot, and undo() forgets it on the way to step 1 in the same click.
    state.entries.sync([{ id: 't1', name: 'b', start: 0, end: 1 }]);

    const refuse = (): false => false;
    state.on('beforeChange', refuse);
    expect(() => state.undo()).toThrow(MutationCancelledError);
    state.off('beforeChange', refuse);

    // Step 1's write never landed, and step 2 — forgotten mid-click — is back too.
    expect(state.entries.get('t1')?.name).toBe('b');
    expect(state.canUndo).toBe(true);
    expect(state.canRedo).toBe(false);

    state.undo(); // step 2 is moot again and forgotten; step 1 lands
    expect(state.entries.get('t1')?.name).toBe('t1');
  });

  it('a later change subscriber that throws after a landed undo does not un-forget a moot step the same click already forgot', () => {
    const state = dataset([{ id: 't1' }]); // name starts as 't1'
    state.entries.update('t1', { name: 'b' }); // step 1
    state.entries.update('t1', { name: 'c' }); // step 2

    // Step 2's undo is moot, the same as the test above, so undo() forgets it for real on the way
    // to step 1 — which does land. This handler is added after History's own, so it runs once step
    // 1's write has already moved the cursor, and its throw must not undo that real forget too.
    state.entries.sync([{ id: 't1', name: 'b', start: 0, end: 1 }]);

    const explode = (): void => {
      throw new Error('boom');
    };
    state.on('change', explode);
    expect(() => state.undo()).toThrow('boom');
    state.off('change', explode);

    // Step 1's write landed before the later handler threw. Step 2 had nothing left to write either
    // way, so its forget stays too — there is nothing left to undo, and step 1 alone is redoable.
    expect(state.entries.get('t1')?.name).toBe('t1');
    expect(state.canUndo).toBe(false);
    expect(state.canRedo).toBe(true);
  });

  it('undo of a declared props key removes the key instead of writing undefined onto props', () => {
    const state = new DatasetState({
      entries: [{ id: 't1', name: 't1', start: 0, end: 1 }],
      timeZone: 'UTC',
      fields: [{ key: 'team' }],
    });
    expect(state.entries.get('t1')!.read('team')).toBeUndefined();

    state.entries.update('t1', { team: 'A' });
    state.undo();

    expect(state.entries.get('t1')!.read('team')).toBeUndefined();
  });
});
