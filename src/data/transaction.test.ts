import { describe, expect, it } from 'vitest';
import { runTransaction } from './transaction.js';
import { DatasetState } from './dataset-state.js';
import { fieldRowsOf } from './change-set.js';
import { MutationCancelledError, MutationDuringNotificationError, entryId } from '../model/index.js';
import { toEndInstant, toInstant } from '../time/index.js';
import type { EntryEdits, StoredEdit } from './edit-extension.js';

function dataset(entries: { id: string; parentId?: string }[] = []): DatasetState {
  return new DatasetState({
    entries: entries.map((e) => ({
      id: e.id,
      ...(e.parentId !== undefined ? { parentId: e.parentId } : {}),
      name: e.id,
      start: 0,
      end: 1,
    })),
    timeZone: 'UTC',
  });
}

describe('runTransaction', () => {
  it('N mutations inside one transaction produce exactly one changeset and one change event', () => {
    const state = dataset([{ id: 't1' }, { id: 't2' }]);
    let changeCount = 0;
    let lastRows = 0;
    state.on('change', ({ changeSet }) => {
      changeCount += 1;
      lastRows = changeSet.updated.length;
    });

    runTransaction(
      state,
      (token) => {
        state.entries.stageUpdate(token, entryId('t1'), { name: 'Roofing' });
        state.entries.stageUpdate(token, entryId('t2'), { name: 'Framing' });
      },
      'user',
    );

    expect(changeCount).toBe(1);
    expect(lastRows).toBe(2);
  });

  it("the changeset's updated rows carry from and to for every touched field", () => {
    const state = dataset([{ id: 't1' }]);
    let captured: unknown;
    state.on('change', ({ changeSet }) => {
      captured = changeSet.updated;
    });

    runTransaction(
      state,
      (token) => state.entries.stageUpdate(token, entryId('t1'), { name: 'Roofing' }),
      'user',
    );

    expect(captured).toEqual([
      { store: 'entries', id: entryId('t1'), field: 'name', from: 't1', to: 'Roofing' },
    ]);
  });

  it('a field set back to its original value inside the transaction is absent from the changeset', () => {
    const state = dataset([{ id: 't1' }]);
    let fired = false;
    state.on('change', () => {
      fired = true;
    });

    runTransaction(
      state,
      (token) => {
        state.entries.stageUpdate(token, entryId('t1'), { name: 'Roofing' });
        state.entries.stageUpdate(token, entryId('t1'), { name: 't1' });
      },
      'user',
    );

    expect(fired).toBe(false);
  });

  it('an add followed by a remove of the same id inside one transaction records neither', () => {
    const state = dataset([]);
    let fired = false;
    state.on('change', () => {
      fired = true;
    });

    runTransaction(
      state,
      (token) => {
        state.entries.stageAdd(token, {
          id: entryId('t9'),
          name: 't9',
          start: 0 as never,
          end: 1 as never,
          kind: 'span',
        });
        state.entries.stageRemove(token, entryId('t9'));
      },
      'user',
    );

    expect(fired).toBe(false);
    expect(state.entries.has(entryId('t9'))).toBe(false);
  });

  it('a remove followed by an add of the same committed id replaces it — not a cancelled no-op', () => {
    const state = dataset([{ id: 't1' }]);
    let fired = false;
    state.on('change', () => {
      fired = true;
    });

    runTransaction(
      state,
      (token) => {
        state.entries.stageRemove(token, entryId('t1'));
        state.entries.stageAdd(token, {
          id: entryId('t1'),
          name: 'reborn',
          start: 0 as never,
          end: 1 as never,
          kind: 'span',
        });
      },
      'user',
    );

    expect(fired).toBe(true);
    expect(state.entries.get(entryId('t1'))?.name).toBe('reborn');
  });

  it('an empty transaction emits nothing, writes nothing, and returns the body value', () => {
    const state = dataset([{ id: 't1' }]);
    let fired = false;
    state.on('change', () => {
      fired = true;
    });

    const result = runTransaction(state, () => 42, 'user');

    expect(fired).toBe(false);
    expect(result).toBe(42);
  });

  it("transaction() returns the body's own value, in the outermost and the nested case alike", () => {
    const state = dataset([{ id: 't1' }]);
    const outer = state.transaction(() => {
      const inner = state.transaction(() => 'inner-value');
      expect(inner).toBe('inner-value');
      return 'outer-value';
    });
    expect(outer).toBe('outer-value');
  });

  it('a nested transaction() joins the outer one: one changeset, one event', () => {
    const state = dataset([{ id: 't1' }, { id: 't2' }]);
    let changeCount = 0;
    state.on('change', () => {
      changeCount += 1;
    });

    runTransaction(
      state,
      (token) => {
        state.entries.stageUpdate(token, entryId('t1'), { name: 'a' });
        runTransaction(
          state,
          (innerToken) => state.entries.stageUpdate(innerToken, entryId('t2'), { name: 'b' }),
          'user',
        );
      },
      'user',
    );

    expect(changeCount).toBe(1);
  });

  it('read-your-own-writes: get/size/childrenOf see a staged add; all does not, until commit (D-S2-21)', () => {
    const state = dataset([{ id: 'root' }]);
    let sizeDuring = -1;
    let childDuring: unknown;
    let allDuring: readonly unknown[] = [];

    runTransaction(
      state,
      (token) => {
        state.entries.stageAdd(token, {
          id: entryId('child'),
          parentId: entryId('root'),
          name: 'child',
          start: 0 as never,
          end: 1 as never,
          kind: 'span',
        });
        sizeDuring = state.entries.size;
        childDuring = state.entries.childrenOf(entryId('root')).map((e) => e.id);
        allDuring = state.entries.all;
      },
      'user',
    );

    expect(state.entries.get(entryId('child'))).toBeDefined();
    expect(sizeDuring).toBe(2);
    expect(childDuring).toEqual([entryId('child')]);
    expect(allDuring.map((e) => (e as { id: unknown }).id)).toEqual([entryId('root')]);
  });

  it('childrenOf sees a parentId edit in the write set', () => {
    const state = dataset([{ id: 'a' }, { id: 'b' }, { id: 'c', parentId: 'a' }]);
    state.transaction(() => {
      state.entries.update('c', { parentId: 'b' });
      expect(state.entries.childrenOf('a').map((e) => e.id)).toEqual([]);
      expect(state.entries.childrenOf('b').map((e) => e.id)).toEqual([entryId('c')]);
    });
  });

  it('rollback: a body that throws after two successful mutations leaves the store exactly as it was, and emits nothing', () => {
    const state = dataset([{ id: 't1' }, { id: 't2' }]);
    let fired = false;
    state.on('change', () => {
      fired = true;
    });

    expect(() =>
      runTransaction(
        state,
        (token) => {
          state.entries.stageUpdate(token, entryId('t1'), { name: 'a' });
          state.entries.stageUpdate(token, entryId('t2'), { name: 'b' });
          throw new Error('boom');
        },
        'user',
      ),
    ).toThrow('boom');

    expect(fired).toBe(false);
    expect(state.entries.get(entryId('t1'))?.name).toBe('t1');
    expect(state.entries.get(entryId('t2'))?.name).toBe('t2');
  });

  it('a mutation from inside a change handler throws MutationDuringNotificationError', () => {
    const state = dataset([{ id: 't1' }]);
    state.on('change', () => {
      state.transaction(() => undefined);
    });

    expect(() =>
      runTransaction(
        state,
        (token) => state.entries.stageUpdate(token, entryId('t1'), { name: 'a' }),
        'user',
      ),
    ).toThrow(MutationDuringNotificationError);
  });

  it('the hook is generic: an injected extender patches a second entry in the same changeset (D-S2-6)', () => {
    const state = new DatasetState({
      entries: [
        { id: 't1', name: 't1', start: 0, end: 1 },
        { id: 't2', name: 't2', start: 0, end: 1 },
      ],
      timeZone: 'UTC',
      editExtender: (): EntryEdits =>
        new Map<ReturnType<typeof entryId>, StoredEdit>([[entryId('t2'), { name: 'cascaded' }]]),
    });
    let captured: readonly unknown[] = [];
    state.on('change', ({ changeSet }) => {
      captured = changeSet.updated;
    });

    runTransaction(state, (token) => state.entries.stageUpdate(token, entryId('t1'), { name: 'a' }), 'user');

    expect(captured).toEqual([
      { store: 'entries', id: entryId('t1'), field: 'name', from: 't1', to: 'a' },
      { store: 'entries', id: entryId('t2'), field: 'name', from: 't2', to: 'cascaded' },
    ]);
  });

  it('with identityExtender, the same shape transaction produces the user edit alone', () => {
    const state = dataset([{ id: 't1' }]);
    let captured: readonly unknown[] = [];
    state.on('change', ({ changeSet }) => {
      captured = changeSet.updated;
    });

    runTransaction(state, (token) => state.entries.stageUpdate(token, entryId('t1'), { name: 'a' }), 'user');

    expect(captured).toEqual([{ store: 'entries', id: entryId('t1'), field: 'name', from: 't1', to: 'a' }]);
  });

  it('I4 (dev-mode assert): an extender may not touch a field the body already proposed', () => {
    const state = new DatasetState({
      entries: [{ id: 't1', name: 't1', start: 0, end: 1 }],
      timeZone: 'UTC',
      editExtender: (): EntryEdits =>
        new Map<ReturnType<typeof entryId>, StoredEdit>([[entryId('t1'), { name: 'clobbered' }]]),
    });

    expect(() =>
      runTransaction(
        state,
        (token) => state.entries.stageUpdate(token, entryId('t1'), { name: 'a' }),
        'user',
      ),
    ).toThrow(/I4/);
  });

  // #197: `proposedKeys` is bookkeeping on a `StoredEdit`, not a Field. The body edit always carries
  // it, so comparing raw object keys made I4 refuse any extender edit that carried one — which every
  // extender composed with `mergeEntryEdits` now does.
  it('I4 reads proposedKeys as the Fields proposed, not as a Field named "proposedKeys"', () => {
    const state = new DatasetState({
      entries: [{ id: 't1', name: 't1', start: 0, end: 1 }],
      timeZone: 'UTC',
      fieldTypes: { money: { rollUp: 'sum' } },
      fields: [{ key: 'cost', type: 'money' }],
      editExtender: (): EntryEdits =>
        new Map<ReturnType<typeof entryId>, StoredEdit>([
          [entryId('t1'), { meta: { cost: 500 }, proposedKeys: new Set(['cost']) }],
        ]),
    });

    runTransaction(state, (token) => state.entries.stageUpdate(token, entryId('t1'), { name: 'a' }), 'user');

    expect(state.entries.get(entryId('t1'))?.meta).toEqual({ cost: 500 });
  });

  it('I4 still fires when body and extender propose the same meta-sourced Field', () => {
    const state = new DatasetState({
      entries: [{ id: 't1', name: 't1', start: 0, end: 1 }],
      timeZone: 'UTC',
      fieldTypes: { money: { rollUp: 'sum' } },
      fields: [{ key: 'cost', type: 'money' }],
      editExtender: (): EntryEdits =>
        new Map<ReturnType<typeof entryId>, StoredEdit>([
          [entryId('t1'), { meta: { cost: 500 }, proposedKeys: new Set(['cost']) }],
        ]),
    });

    expect(() =>
      runTransaction(
        state,
        (token) =>
          state.entries.stageUpdate(token, entryId('t1'), {
            meta: { cost: 1 },
            proposedKeys: new Set(['cost']),
          }),
        'user',
      ),
    ).toThrow(/I4/);
  });

  it('the changeset is frozen in dev mode — a beforeChange handler cannot edit it', () => {
    const state = dataset([{ id: 't1' }]);
    let sawFrozen = false;
    state.on('beforeChange', ({ changeSet }) => {
      sawFrozen = Object.isFrozen(changeSet) && Object.isFrozen(changeSet.updated);
    });

    runTransaction(state, (token) => state.entries.stageUpdate(token, entryId('t1'), { name: 'a' }), 'user');

    expect(sawFrozen).toBe(true);
  });

  it('the extension hook is called exactly once per transaction, whatever the body size', () => {
    let calls = 0;
    const state = new DatasetState({
      entries: [
        { id: 't1', name: 't1', start: 0, end: 1 },
        { id: 't2', name: 't2', start: 0, end: 1 },
      ],
      timeZone: 'UTC',
      editExtender: () => {
        calls += 1;
        return new Map();
      },
    });

    runTransaction(
      state,
      (token) => {
        state.entries.stageUpdate(token, entryId('t1'), { name: 'a' });
        state.entries.stageUpdate(token, entryId('t2'), { name: 'b' });
      },
      'user',
    );

    expect(calls).toBe(1);
  });

  it('veto: a beforeChange handler returning false leaves the store as it was, throws MutationCancelledError', () => {
    const state = dataset([{ id: 't1' }]);
    let changeFired = false;
    state.on('beforeChange', () => false);
    state.on('change', () => {
      changeFired = true;
    });

    expect(() =>
      runTransaction(
        state,
        (token) => state.entries.stageUpdate(token, entryId('t1'), { name: 'a' }),
        'user',
      ),
    ).toThrow(MutationCancelledError);

    expect(changeFired).toBe(false);
    expect(state.entries.get(entryId('t1'))?.name).toBe('t1');
  });

  it('a beforeChange handler that throws still discards the write set — not left open for the next transaction', () => {
    const state = dataset([{ id: 't1' }]);
    const explode = (): void => {
      throw new Error('handler blew up');
    };
    state.on('beforeChange', explode);

    expect(() =>
      runTransaction(
        state,
        (token) => state.entries.stageUpdate(token, entryId('t1'), { name: 'a' }),
        'user',
      ),
    ).toThrow('handler blew up');

    // A prior open write set would leak this uncommitted 'a' back out here.
    expect(state.entries.get(entryId('t1'))?.name).toBe('t1');

    state.off('beforeChange', explode);
    runTransaction(state, (token) => state.entries.stageUpdate(token, entryId('t1'), { name: 'b' }), 'user');
    expect(state.entries.get(entryId('t1'))?.name).toBe('b');
  });

  it('a beforeChange handler that returns nothing does not veto; one false among two handlers is enough', () => {
    const state = dataset([{ id: 't1' }]);
    let secondRan = false;
    state.on('beforeChange', () => undefined);
    state.on('beforeChange', () => {
      secondRan = true;
      return false;
    });

    expect(() =>
      runTransaction(
        state,
        (token) => state.entries.stageUpdate(token, entryId('t1'), { name: 'a' }),
        'user',
      ),
    ).toThrow(MutationCancelledError);
    expect(secondRan).toBe(true);
  });

  it('beforeChange fires after the extension hook, seeing the extender fields too', () => {
    const state = new DatasetState({
      entries: [
        { id: 't1', name: 't1', start: 0, end: 1 },
        { id: 't2', name: 't2', start: 0, end: 1 },
      ],
      timeZone: 'UTC',
      editExtender: (): EntryEdits => new Map([[entryId('t2'), { name: 'cascaded' }]]),
    });
    let seenFields: readonly string[] = [];
    state.on('beforeChange', ({ changeSet }) => {
      seenFields = fieldRowsOf(changeSet).map((row) => row.field);
    });

    runTransaction(state, (token) => state.entries.stageUpdate(token, entryId('t1'), { name: 'a' }), 'user');

    expect(seenFields).toEqual(['name', 'name']);
  });

  it('an empty transaction emits neither beforeChange nor change', () => {
    const state = dataset([{ id: 't1' }]);
    let beforeFired = false;
    let changeFired = false;
    state.on('beforeChange', () => {
      beforeFired = true;
    });
    state.on('change', () => {
      changeFired = true;
    });

    runTransaction(state, () => undefined, 'user');

    expect(beforeFired).toBe(false);
    expect(changeFired).toBe(false);
  });

  it('a mutation from inside a beforeChange handler throws MutationDuringNotificationError', () => {
    const state = dataset([{ id: 't1' }]);
    state.on('beforeChange', () => {
      state.transaction(() => undefined);
      return undefined;
    });

    expect(() =>
      runTransaction(
        state,
        (token) => state.entries.stageUpdate(token, entryId('t1'), { name: 'a' }),
        'user',
      ),
    ).toThrow(MutationDuringNotificationError);
  });

  it('one channel: on(change) sees every commit this file makes', () => {
    const state = dataset([{ id: 't1' }]);
    const seen: unknown[] = [];
    state.on('change', ({ changeSet }) => {
      seen.push(changeSet.id);
    });

    runTransaction(state, (token) => state.entries.stageUpdate(token, entryId('t1'), { name: 'a' }), 'user');
    runTransaction(state, (token) => state.entries.stageUpdate(token, entryId('t1'), { name: 'b' }), 'user');

    expect(seen.length).toBe(2);
  });

  it('a 500-entry bulk edit still produces one changeset and touches only the ancestors it must', () => {
    const leafCount = 500;
    const leaves = Array.from({ length: leafCount }, (_, i) => ({
      id: `c${i}`,
      parentId: 'root' as const,
      name: `c${i}`,
      start: '2026-01-01',
      end: '2026-01-02',
      meta: { cost: 1 },
    }));
    const state = new DatasetState({
      entries: [
        { id: 'root', kind: 'group', name: 'root' },
        { id: 'other', kind: 'group', name: 'other' },
        {
          id: 'kept',
          parentId: 'other',
          name: 'kept',
          start: '2026-01-01',
          end: '2026-01-02',
          meta: { cost: 7 },
        },
        ...leaves,
      ],
      timeZone: 'UTC',
      fieldTypes: { money: { rollUp: 'sum' } },
      fields: [{ key: 'cost', type: 'money' }],
    });
    const costOf = (id: string): number | undefined => {
      const entry = state.entries.get(id);
      if (!entry) return undefined;
      return state.fieldContext.read(entry, 'cost') as number | undefined;
    };

    let changeCount = 0;
    const updatedIds = new Set<string>();
    state.on('change', ({ changeSet }) => {
      changeCount += 1;
      for (const row of changeSet.updated) updatedIds.add(String(row.id));
    });

    state.transaction(() => {
      for (const leaf of leaves) state.entries.update(leaf.id, { cost: 2 });
    });

    expect(changeCount).toBe(1);
    expect(costOf('root')).toBe(leafCount * 2);
    expect(costOf('other')).toBe(7);
    expect(updatedIds.has('other')).toBe(false);
    expect(updatedIds.has('kept')).toBe(false);
    expect(updatedIds.has('root')).toBe(true);
  });

  it('a parent promoted on this commit is inside the Rollup reach on the same commit (D-S4-17)', () => {
    const state = new DatasetState({
      entries: [
        { id: 'p1', name: 'p1', start: '2026-01-01', end: '2026-01-02' },
        { id: 'c1', name: 'c1', start: '2026-03-01', end: '2026-03-05' },
      ],
      timeZone: 'UTC',
    });

    state.entries.update('c1', { parentId: 'p1' });

    const parent = state.entries.get('p1')!;
    expect(parent.kind).toBe('group');
    expect(parent.start).toBe(toInstant('UTC', '2026-03-01'));
    expect(parent.end).toBe(toEndInstant('UTC', '2026-03-05', 'inclusive'));
  });
});
