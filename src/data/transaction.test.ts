import { describe, expect, it } from 'vitest';
import { runTransaction } from './transaction.js';
import { DatasetState } from './dataset-state.js';
import { fieldRowsOf } from './change-set.js';
import {
  MutationCancelledError,
  MutationDuringExtensionHookError,
  MutationDuringNotificationError,
  UnknownFieldError,
  entryId,
} from '../model/index.js';
import type { ChangeSet, ErrorReport } from '../model/index.js';
import { toEndInstant, toInstant } from '../time/index.js';
import type { EditExtender, EditRequest, EntryEdit, EntryEdits, ProposedEdit } from './edit-extension.js';

/** A `ProposedEdit` for `stageUpdate`'s own test-fixture door (its doc comment names this file):
 *  fills the required brand/`props`/`proposedKeys` a raw patch no longer carries, inferring
 *  `proposedKeys` from the patch's own keys when the caller does not state one explicitly — the
 *  same rule `entries.update()` itself follows for a plain patch. */
function edit(patch: Record<string, unknown> = {}): ProposedEdit {
  const { props, proposedKeys, ...envelope } = patch as {
    props?: Record<string, unknown>;
    proposedKeys?: Set<string>;
  } & Record<string, unknown>;
  return {
    __brand: 'ProposedEdit',
    props: props ?? {},
    proposedKeys: proposedKeys ?? new Set(Object.keys(envelope)),
    ...envelope,
  };
}

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
        state.entries.stageUpdate(token, entryId('t1'), edit({ name: 'Roofing' }));
        state.entries.stageUpdate(token, entryId('t2'), edit({ name: 'Framing' }));
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
      (token) => state.entries.stageUpdate(token, entryId('t1'), edit({ name: 'Roofing' })),
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
        state.entries.stageUpdate(token, entryId('t1'), edit({ name: 'Roofing' }));
        state.entries.stageUpdate(token, entryId('t1'), edit({ name: 't1' }));
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
          siblingIndex: 0,
          name: 't9',
          start: 0 as never,
          end: 1 as never,
          props: {},
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
          siblingIndex: 0,
          name: 'reborn',
          start: 0 as never,
          end: 1 as never,
          props: {},
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
        state.entries.stageUpdate(token, entryId('t1'), edit({ name: 'a' }));
        runTransaction(
          state,
          (innerToken) => state.entries.stageUpdate(innerToken, entryId('t2'), edit({ name: 'b' })),
          'user',
        );
      },
      'user',
    );

    expect(changeCount).toBe(1);
  });

  it('read-your-own-writes: get/size and a row’s children see a staged add; all does not, until commit (D-S2-21)', () => {
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
          siblingIndex: 0,
          name: 'child',
          start: 0 as never,
          end: 1 as never,
          props: {},
        });
        sizeDuring = state.entries.size;
        childDuring = (state.entries.get(entryId('root'))?.children() ?? []).map((e) => e.id);
        allDuring = state.entries.all;
      },
      'user',
    );

    expect(state.entries.get(entryId('child'))).toBeDefined();
    expect(sizeDuring).toBe(2);
    expect(childDuring).toEqual([entryId('child')]);
    expect(allDuring.map((e) => (e as { id: unknown }).id)).toEqual([entryId('root')]);
  });

  it('entry.children() sees a parentId edit in the write set', () => {
    const state = dataset([{ id: 'a' }, { id: 'b' }, { id: 'c', parentId: 'a' }]);
    state.transaction(() => {
      state.entries.update('c', { parentId: 'b' });
      expect((state.entries.get('a')?.children() ?? []).map((e) => e.id)).toEqual([]);
      expect((state.entries.get('b')?.children() ?? []).map((e) => e.id)).toEqual([entryId('c')]);
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
          state.entries.stageUpdate(token, entryId('t1'), edit({ name: 'a' }));
          state.entries.stageUpdate(token, entryId('t2'), edit({ name: 'b' }));
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
        (token) => state.entries.stageUpdate(token, entryId('t1'), edit({ name: 'a' })),
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
        new Map<ReturnType<typeof entryId>, EntryEdit>([[entryId('t2'), { name: 'cascaded' }]]),
    });
    let captured: readonly unknown[] = [];
    state.on('change', ({ changeSet }) => {
      captured = changeSet.updated;
    });

    runTransaction(
      state,
      (token) => state.entries.stageUpdate(token, entryId('t1'), edit({ name: 'a' })),
      'user',
    );

    expect(captured).toEqual([
      { store: 'entries', id: entryId('t1'), field: 'name', from: 't1', to: 'a' },
      { store: 'entries', id: entryId('t2'), field: 'name', from: 't2', to: 'cascaded' },
    ]);
  });

  it('an EditExtender that writes through the store instead of returning its edit throws MutationDuringExtensionHookError, and the user edit is not saved either (#323)', () => {
    const state = new DatasetState({
      entries: [{ id: 't1', name: 't1', start: 0, end: 1 }],
      timeZone: 'UTC',
      editExtender: (): EntryEdits => {
        state.entries.update(entryId('t1'), { name: 'reentrant' });
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
    expect(state.entries.get(entryId('t1'))?.name).toBe('t1');
  });

  it('with identityExtender, the same shape transaction produces the user edit alone', () => {
    const state = dataset([{ id: 't1' }]);
    let captured: readonly unknown[] = [];
    state.on('change', ({ changeSet }) => {
      captured = changeSet.updated;
    });

    runTransaction(
      state,
      (token) => state.entries.stageUpdate(token, entryId('t1'), edit({ name: 'a' })),
      'user',
    );

    expect(captured).toEqual([{ store: 'entries', id: entryId('t1'), field: 'name', from: 't1', to: 'a' }]);
  });

  it('I4 (dev-mode assert): an extender may not touch a field the body already proposed', () => {
    const state = new DatasetState({
      entries: [{ id: 't1', name: 't1', start: 0, end: 1 }],
      timeZone: 'UTC',
      editExtender: (): EntryEdits =>
        new Map<ReturnType<typeof entryId>, EntryEdit>([[entryId('t1'), { name: 'clobbered' }]]),
    });

    expect(() =>
      runTransaction(
        state,
        (token) => state.entries.stageUpdate(token, entryId('t1'), edit({ name: 'a' })),
        'user',
      ),
    ).toThrow(/I4/);
  });

  // #197: `proposedKeys` is bookkeeping on a `ProposedEdit`, not a Field. The body edit always carries
  // it, so comparing raw object keys made I4 refuse any extender edit that carried one — which every
  // extender composed with `mergeEntryEdits` now does. The extender states no keys of its own since
  // #209 C3: it writes `{ cost: 500 }`, the same object `entries.update()` takes, and core derives
  // the set. A hand-built `proposedKeys` here is now an undeclared Field key and is refused.
  it('I4 reads proposedKeys as the Fields proposed, not as a Field named "proposedKeys"', () => {
    const state = new DatasetState({
      entries: [{ id: 't1', name: 't1', start: 0, end: 1 }],
      timeZone: 'UTC',
      fieldTypes: { money: { rollUp: 'sum' } },
      fields: [{ key: 'cost', type: 'money' }],
      editExtender: (): EntryEdits => new Map([[entryId('t1'), { cost: 500 }]]),
    });

    runTransaction(
      state,
      (token) => state.entries.stageUpdate(token, entryId('t1'), edit({ name: 'a' })),
      'user',
    );

    expect(state.entries.get(entryId('t1'))?.toInput().props).toEqual({ cost: 500 });
  });

  it('I4 still fires when body and extender propose the same props-addressed Field', () => {
    const state = new DatasetState({
      entries: [{ id: 't1', name: 't1', start: 0, end: 1 }],
      timeZone: 'UTC',
      fieldTypes: { money: { rollUp: 'sum' } },
      fields: [{ key: 'cost', type: 'money' }],
      editExtender: (): EntryEdits => new Map([[entryId('t1'), { cost: 500 }]]),
    });

    expect(() =>
      runTransaction(
        state,
        (token) =>
          state.entries.stageUpdate(
            token,
            entryId('t1'),
            edit({
              props: { cost: 1 },
              proposedKeys: new Set(['cost']),
            }),
          ),
        'user',
      ),
    ).toThrow(/I4/);
  });

  // #209: two different props-addressed Fields used to intersect on a shared container key, and I4
  // refused a transaction that writes no Field twice.
  it('I4 does not fire when the body and the extender write two different props-addressed Fields', () => {
    const state = new DatasetState({
      entries: [{ id: 't1', name: 't1', start: 0, end: 1 }],
      timeZone: 'UTC',
      fieldTypes: { money: { rollUp: 'sum' } },
      fields: [
        { key: 'cost', type: 'money' },
        { key: 'risk', type: 'money' },
      ],
      editExtender: (): EntryEdits => new Map([[entryId('t1'), { cost: 500 }]]),
    });

    expect(() =>
      runTransaction(
        state,
        (token) =>
          state.entries.stageUpdate(
            token,
            entryId('t1'),
            edit({
              props: { risk: 1 },
              proposedKeys: new Set(['risk']),
            }),
          ),
        'user',
      ),
    ).not.toThrow();

    expect(state.entries.get(entryId('t1'))?.toInput().props).toEqual({ cost: 500, risk: 1 });
  });

  it('the changeset is frozen in dev mode — a beforeChange handler cannot edit it', () => {
    const state = dataset([{ id: 't1' }]);
    let sawFrozen = false;
    state.on('beforeChange', ({ changeSet }) => {
      sawFrozen = Object.isFrozen(changeSet) && Object.isFrozen(changeSet.updated);
    });

    runTransaction(
      state,
      (token) => state.entries.stageUpdate(token, entryId('t1'), edit({ name: 'a' })),
      'user',
    );

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
        state.entries.stageUpdate(token, entryId('t1'), edit({ name: 'a' }));
        state.entries.stageUpdate(token, entryId('t2'), edit({ name: 'b' }));
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
        (token) => state.entries.stageUpdate(token, entryId('t1'), edit({ name: 'a' })),
        'user',
      ),
    ).toThrow(MutationCancelledError);

    expect(changeFired).toBe(false);
    expect(state.entries.get(entryId('t1'))?.name).toBe('t1');
  });

  it('veto: the refusal also raises one Error report, carrying the MutationCancelledError (D-S5-40)', () => {
    const state = dataset([{ id: 't1' }]);
    const reports: ErrorReport[] = [];
    state.on('beforeChange', () => false);
    state.on('error', (report) => {
      reports.push(report);
    });

    expect(() =>
      runTransaction(
        state,
        (token) => state.entries.stageUpdate(token, entryId('t1'), edit({ name: 'a' })),
        'user',
      ),
    ).toThrow(MutationCancelledError);

    expect(reports).toHaveLength(1);
    const [report] = reports;
    expect(report?.code).toBe('mutation-cancelled');
    expect(report?.severity).toBe('info');
    expect(report?.by).toBe('consumer');
    expect(typeof report?.at).toBe('number');
    const cause = report?.cause;
    expect(cause).toBeInstanceOf(MutationCancelledError);
    expect((cause as MutationCancelledError).changeSet.updated).toHaveLength(1);
  });

  it('veto: a handler that calls refuse puts its own words on the report and on the error (#210)', () => {
    const state = dataset([{ id: 't1' }]);
    const reports: ErrorReport[] = [];
    state.on('beforeChange', ({ refuse }) => refuse('"t1" is locked.'));
    state.on('error', (report) => {
      reports.push(report);
    });

    expect(() =>
      runTransaction(
        state,
        (token) => state.entries.stageUpdate(token, entryId('t1'), edit({ name: 'a' })),
        'user',
      ),
    ).toThrow(MutationCancelledError);

    expect(reports).toHaveLength(1);
    expect(reports[0]?.reason).toBe('"t1" is locked.');
    expect(reports[0]?.message).toBe(
      'Nothing was saved. A beforeChange handler refused this change and said: ""t1" is locked.". Read "changeSet" on this error to see what it refused.',
    );
    expect((reports[0]?.cause as MutationCancelledError).reason).toBe('"t1" is locked.');
  });

  it('veto: a bare false still refuses, and states no reason', () => {
    const state = dataset([{ id: 't1' }]);
    const reports: ErrorReport[] = [];
    state.on('beforeChange', () => false);
    state.on('error', (report) => {
      reports.push(report);
    });

    expect(() =>
      runTransaction(
        state,
        (token) => state.entries.stageUpdate(token, entryId('t1'), edit({ name: 'a' })),
        'user',
      ),
    ).toThrow(MutationCancelledError);

    expect(reports[0]?.reason).toBeUndefined();
    expect(reports[0]?.message).toBe(
      'Nothing was saved. A beforeChange handler refused this change. Read "changeSet" on this error to see what it refused.',
    );
  });

  it('veto: two handlers both refuse — the first reason is kept, and the two are never joined', () => {
    const state = dataset([{ id: 't1' }]);
    const reports: ErrorReport[] = [];
    state.on('beforeChange', ({ refuse }) => refuse('first'));
    state.on('beforeChange', ({ refuse }) => refuse('second'));
    state.on('error', (report) => {
      reports.push(report);
    });

    expect(() =>
      runTransaction(
        state,
        (token) => state.entries.stageUpdate(token, entryId('t1'), edit({ name: 'a' })),
        'user',
      ),
    ).toThrow(MutationCancelledError);

    expect(reports[0]?.reason).toBe('first');
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
        (token) => state.entries.stageUpdate(token, entryId('t1'), edit({ name: 'a' })),
        'user',
      ),
    ).toThrow('handler blew up');

    // A prior open write set would leak this uncommitted 'a' back out here.
    expect(state.entries.get(entryId('t1'))?.name).toBe('t1');

    state.off('beforeChange', explode);
    runTransaction(
      state,
      (token) => state.entries.stageUpdate(token, entryId('t1'), edit({ name: 'b' })),
      'user',
    );
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
        (token) => state.entries.stageUpdate(token, entryId('t1'), edit({ name: 'a' })),
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

    runTransaction(
      state,
      (token) => state.entries.stageUpdate(token, entryId('t1'), edit({ name: 'a' })),
      'user',
    );

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
        (token) => state.entries.stageUpdate(token, entryId('t1'), edit({ name: 'a' })),
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

    runTransaction(
      state,
      (token) => state.entries.stageUpdate(token, entryId('t1'), edit({ name: 'a' })),
      'user',
    );
    runTransaction(
      state,
      (token) => state.entries.stageUpdate(token, entryId('t1'), edit({ name: 'b' })),
      'user',
    );

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
      props: { cost: 1 },
    }));
    const state = new DatasetState({
      entries: [
        { id: 'root', name: 'root' },
        { id: 'other', name: 'other' },
        {
          id: 'kept',
          parentId: 'other',
          name: 'kept',
          start: '2026-01-01',
          end: '2026-01-02',
          props: { cost: 7 },
        },
        ...leaves,
      ],
      timeZone: 'UTC',
      fieldTypes: { money: { rollUp: 'sum' } },
      fields: [{ key: 'cost', type: 'money' }],
    });
    const costOf = (id: string): number | undefined =>
      state.entries.get(id)?.read('cost') as number | undefined;

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
    expect(parent.start).toBe(toInstant('UTC', '2026-03-01', 'test'));
    expect(parent.end).toBe(toEndInstant('UTC', '2026-03-05', 'inclusive', 'test'));
  });
});

// #212 fix-plan review, finding B1 remainder: the envelope invariant binds an `EditExtender`'s
// `ProposedEdit` exactly as it binds `entries.update()` — a plugin cascade is not a second, looser door
// onto `start`/`end`.
//
// Retired (ADR 0026, #421): the envelope invariant used to guard a several-Segment Entry — a plugin
// (or `entries.update()`) writing `start` or `end` alone against one had to move every Segment in
// step, or `SegmentsOutOfSyncError` refused the write. A Segment is an ordinary child Entry now, so
// there is no several-Segment single Entry left to guard, and `SegmentsOutOfSyncError` is gone with
// it. The two refusal tests this used to run are deleted; the three tests below keep their surviving
// questions, rewritten against a plain one-span Entry with no `segments` array.
describe('the EditExtender seam writes start/end the same as entries.update() (#212 R2 fix-plan review)', () => {
  it("pairs a plugin's direct start/end write onto the Entry's own span, the same as entries.update()", () => {
    const state = new DatasetState({
      entries: [{ id: 't1', name: 't1', start: '2026-01-01', end: '2026-01-02' }],
      timeZone: 'UTC',
      editExtender: (): EntryEdits =>
        new Map<ReturnType<typeof entryId>, EntryEdit>([
          [
            entryId('t1'),
            {
              start: toInstant('UTC', '2026-02-01', 'test'),
              end: toEndInstant('UTC', '2026-02-05', 'inclusive', 'test'),
            },
          ],
        ]),
    });

    runTransaction(
      state,
      (token) => state.entries.stageUpdate(token, entryId('t1'), edit({ name: 'a' })),
      'user',
    );

    const entry = state.entries.get(entryId('t1'))!;
    expect(entry.start).toBe(toInstant('UTC', '2026-02-01', 'test'));
    expect(entry.end).toBe(toEndInstant('UTC', '2026-02-05', 'inclusive', 'test'));
  });

  it(
    'reconciles an extender cascade against an Entry this same transaction adds, not just one ' +
      'the store already committed (#212 R2 fix-plan review, finding A, hole 1)',
    () => {
      const state = new DatasetState({
        entries: [],
        timeZone: 'UTC',
        editExtender: (): EntryEdits =>
          new Map<ReturnType<typeof entryId>, EntryEdit>([
            [entryId('t1'), { start: toInstant('UTC', '2026-02-01', 'test') }],
          ]),
      });

      runTransaction(
        state,
        (token) =>
          state.entries.stageAdd(token, {
            id: entryId('t1'),
            siblingIndex: 0,
            name: 't1',
            // The cascade below moves start to 2026-02-01, so the added entity's own end sits after
            // that or the move itself would be an inverted span the #143 ruling now refuses — not the
            // reconciliation-target bug this test is about.
            start: toInstant('UTC', '2026-01-01', 'test'),
            end: toInstant('UTC', '2026-03-01', 'test'),
            props: {},
          }),
        'user',
      );

      // Before the fix, `byId` (committed, pre-transaction state) held nothing for `t1`, so the
      // extender's cascade reconciled against `undefined` and passed through unreconciled — and
      // separately, `addedEntitiesForFold` only overlaid hierarchy edits, so even a correctly
      // reconciled cascade never reached the entity the changeset published.
      const entry = state.entries.get(entryId('t1'))!;
      expect(entry.start).toBe(toInstant('UTC', '2026-02-01', 'test'));
      expect(entry.end).toBe(toInstant('UTC', '2026-03-01', 'test'));
    },
  );

  it(
    "hands the hook `entryAfterEdits`, which sees this transaction's own body rewrite, not just " +
      '`entries` — the pre-transaction snapshot the hook is no longer graded against alone (D-S5-45)',
    () => {
      let sawStartAtHookTime: unknown;
      const state = new DatasetState({
        entries: [{ id: 't1', name: 't1', start: '2026-01-01', end: '2026-01-10' }],
        timeZone: 'UTC',
        editExtender: (request): EntryEdits => {
          // The pre-transaction snapshot still shows the original start — this is the rewrite the hook
          // must not be graded against (`entries.get` alone answers the wrong question here).
          expect(request.entries.get(entryId('t1'))?.start).toBe(toInstant('UTC', '2026-01-01', 'test'));
          // A plain string, not `entryId('t1')` — `entryAfterEdits` is loose on this scalar id
          // (#305).
          sawStartAtHookTime = request.entryAfterEdits('t1')?.start;
          return new Map();
        },
      });

      runTransaction(
        state,
        (token) =>
          state.entries.stageUpdate(
            token,
            entryId('t1'),
            edit({ start: toInstant('UTC', '2026-01-04', 'test') }),
          ),
        'user',
      );

      expect(sawStartAtHookTime).toBe(toInstant('UTC', '2026-01-04', 'test'));
    },
  );

  it(
    'a body-authored start and an EditExtender-cascaded end on the same Entry commit as one ' +
      'row per field, not two rows for the same field with two different `to` values (#232)',
    () => {
      const state = new DatasetState({
        entries: [{ id: 't1', name: 't1', start: '2026-01-01', end: '2026-03-01' }],
        timeZone: 'UTC',
        editExtender: (): EntryEdits => new Map([[entryId('t1'), { end: '2026-02-05' }]]),
      });

      let captured: ChangeSet | undefined;
      state.on('change', ({ changeSet }) => {
        captured = changeSet;
      });

      expect(() => state.entries.update('t1', { start: '2026-01-05' })).not.toThrow();

      const rows = fieldRowsOf(captured!);
      const fieldsSeen = rows.map((row) => row.field);
      expect(new Set(fieldsSeen).size).toBe(fieldsSeen.length);

      const startRow = rows.find((row) => row.field === 'start');
      const endRow = rows.find((row) => row.field === 'end');
      expect(startRow?.to).toBe(toInstant('UTC', '2026-01-05', 'test'));
      expect(endRow?.to).toBe(toEndInstant('UTC', '2026-02-05', 'inclusive', 'test'));

      const entry = state.entries.get(entryId('t1'))!;
      expect(entry.start).toBe(toInstant('UTC', '2026-01-05', 'test'));
      expect(entry.end).toBe(toEndInstant('UTC', '2026-02-05', 'inclusive', 'test'));
    },
  );
});

// #209 C3: the extension hook writes what `update()` takes. Everything a plugin author used to have
// to learn — a storage-shaped `Instant`, the end rule, `proposedKeys` — is core's job now, done in
// one place (`DatasetState.extraEditsFor` -> `toEditsReading` -> `toEditReading`), the same road every other
// write takes.
describe('the extension hook writes the loose shape (#209)', () => {
  function datasetCascading(edit: Record<string, unknown>, timeZone = 'UTC'): DatasetState {
    return new DatasetState({
      entries: [
        { id: 't1', name: 't1', start: '2026-01-01', end: '2026-01-02' },
        { id: 't2', name: 't2', start: '2026-01-01', end: '2026-01-02' },
      ],
      timeZone,
      fieldTypes: { money: { rollUp: 'sum' } },
      fields: [{ key: 'cost', type: 'money' }],
      editExtender: (): EntryEdits => new Map([[entryId('t2'), edit]]),
    });
  }

  function renameT1(state: DatasetState): void {
    runTransaction(
      state,
      (token) => state.entries.stageUpdate(token, entryId('t1'), edit({ name: 'a' })),
      'user',
    );
  }

  it('reads a loose date in the dataset’s own zone, so a plugin never calls time/', () => {
    // Both dates, because the cascade moves the whole span — a `start` past the stored `end` is an
    // inverted span, and `toEditReading` refuses one for a plugin exactly as it does for `update()`.
    const state = datasetCascading({ start: '2026-02-01', end: '2026-02-03' }, 'America/Denver');
    renameT1(state);
    expect(state.entries.get(entryId('t2'))?.start).toBe(toInstant('America/Denver', '2026-02-01', 'test'));
  });

  it('reads a date-only end by the dataset’s DateOnlyEndRule, not as a raw midnight', () => {
    const state = datasetCascading({ end: '2026-02-05' });
    renameT1(state);
    expect(state.entries.get(entryId('t2'))?.end).toBe(toInstant('UTC', '2026-02-06', 'test'));
  });

  it('derives the proposed keys, so a props-addressed Field write is still recognized', () => {
    const state = datasetCascading({ cost: 500 });
    let rows: readonly { field: string }[] = [];
    state.on('change', ({ changeSet }) => {
      rows = changeSet.updated as readonly { field: string }[];
    });

    renameT1(state);

    expect(state.entries.get(entryId('t2'))?.read('cost')).toBe(500);
    expect(rows.some((row) => row.field === 'cost')).toBe(true);
  });

  it('refuses a Field no Dataset declares, the same way entries.update() refuses one (Q2)', () => {
    const state = datasetCascading({ nope: 1 });
    expect(() => renameT1(state)).toThrow(UnknownFieldError);
  });

  // The two shapes stay apart for good: `proposedKeys` is core's bookkeeping on a `ProposedEdit`, and
  // it is not a Field anybody may write — not through `update()`, and not through the hook.
  it('proposedKeys is not writable from outside', () => {
    const state = dataset([{ id: 't1' }]);
    expect(() => state.entries.update(entryId('t1'), { proposedKeys: new Set() })).toThrow(UnknownFieldError);
  });
});

// #235: the hook could reach an added or removed Entry only by an id it already held. These two
// members give it the ids without asking it to compare snapshots or infer them from `proposed`.
describe('EditRequest.addedEntryIds / removedEntryIds (#235)', () => {
  function captor(): { seen: EditRequest[]; extender: EditExtender } {
    const seen: EditRequest[] = [];
    return {
      seen,
      extender: (request) => {
        seen.push(request);
        return new Map();
      },
    };
  }

  it('carries the id of an Entry this transaction adds, empty when it adds none', () => {
    const state = dataset([{ id: 't1' }]);
    const { seen, extender } = captor();
    state.setExtender(() => extender);

    state.entries.add({ id: 't3', name: 'Added', start: 0, end: 1 });

    expect(seen).toHaveLength(1);
    expect([...seen[0]!.addedEntryIds]).toEqual([entryId('t3')]);
    expect(seen[0]!.removedEntryIds.size).toBe(0);
    expect(seen[0]!.entryAfterEdits(entryId('t3'))?.name).toBe('Added');

    seen.length = 0;
    state.entries.update(entryId('t1'), { name: 'Renamed' });
    expect(seen[0]!.addedEntryIds.size).toBe(0);
  });

  it('carries every id a subtree remove takes, empty when it removes none', () => {
    const state = dataset([
      { id: 'p1' },
      { id: 'c1', parentId: 'p1' },
      { id: 'c2', parentId: 'p1' },
      { id: 'other' },
    ]);
    const { seen, extender } = captor();
    // `entries` is `#byId` itself, so it keeps updating after the transaction commits —
    // reading whether it "still holds" a removed id has to happen inside the hook's own call, not
    // from the request this test kept a reference to afterward.
    let c1NameAtHookTime: string | undefined;
    state.setExtender(() => (request) => {
      c1NameAtHookTime = request.entries.get(entryId('c1'))?.name;
      return extender(request);
    });

    state.entries.remove(entryId('p1'));

    expect(seen).toHaveLength(1);
    expect(new Set(seen[0]!.removedEntryIds)).toEqual(new Set([entryId('p1'), entryId('c1'), entryId('c2')]));
    expect(seen[0]!.addedEntryIds.size).toBe(0);
    for (const id of seen[0]!.removedEntryIds) expect(seen[0]!.entryAfterEdits(id)).toBeUndefined();
    // The pre-transaction snapshot still answers for a removed id, at hook time — only
    // `entryAfterEdits` reflects the removal.
    expect(c1NameAtHookTime).toBe('c1');
  });

  it('an Entry added and removed in the same transaction is in neither set', () => {
    const state = dataset([]);
    const { seen, extender } = captor();
    state.setExtender(() => extender);

    state.transaction(() => {
      state.entries.add({ id: 't9', name: 't9', start: 0, end: 1 });
      state.entries.remove(entryId('t9'));
    });

    expect(seen).toHaveLength(1);
    expect(seen[0]!.addedEntryIds.size).toBe(0);
    expect(seen[0]!.removedEntryIds.size).toBe(0);
  });
});

describe('the refused hierarchy answer report runs once the commit is whole', () => {
  function ghostDataset(): DatasetState {
    return new DatasetState({
      entries: [{ id: 'a', name: 'a', start: 0, end: 1 }],
      timeZone: 'UTC',
      // Answers 'c' with an id no Entry holds — a refused answer the added row below raises.
      hierarchySourceWrappers: [() => (entry) => (entry.id === 'c' ? 'nobody' : undefined)],
    });
  }

  it("an error handler's own write reaches change after the commit that raised the report", () => {
    const state = ghostDataset();
    const changes: ChangeSet[] = [];
    state.on('change', ({ changeSet }) => {
      changes.push(changeSet);
    });
    let handled = false;
    state.on('error', () => {
      if (handled) return;
      handled = true;
      state.entries.update(entryId('c'), { name: 'C2' });
    });

    state.entries.add({ id: 'c', name: 'C', start: 0, end: 1 });

    expect(changes).toHaveLength(2);
    expect(changes[0]!.added.map((row) => row.entity.id)).toEqual([entryId('c')]);
    expect(fieldRowsOf(changes[1]!).map((row) => [row.field, row.to])).toEqual([['name', 'C2']]);
  });

  it('a throwing error handler still leaves the whole commit applied and recorded', () => {
    const state = ghostDataset();
    const lock = state.pluginStores.reserve<{ locked: true }>('demo.lock');
    const changes: ChangeSet[] = [];
    state.on('change', ({ changeSet }) => {
      changes.push(changeSet);
    });
    state.on('error', () => {
      throw new Error('handler bug');
    });

    expect(() =>
      state.transaction(() => {
        state.entries.add({ id: 'c', name: 'C', start: 0, end: 1 });
        lock.set(entryId('c'), { locked: true });
      }),
    ).toThrow('handler bug');

    expect(state.entries.get(entryId('c'))).toBeDefined();
    expect(lock.get(entryId('c'))).toEqual({ locked: true });
    expect(changes).toHaveLength(1);
    expect(state.canUndo).toBe(true);
  });
});
