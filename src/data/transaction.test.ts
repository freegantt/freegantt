import { describe, expect, it } from 'vitest';
import { runTransaction } from './transaction.js';
import { DatasetState } from './dataset-state.js';
import { fieldRowsOf } from './change-set.js';
import {
  MutationCancelledError,
  MutationDuringNotificationError,
  SegmentsOutOfSyncError,
  UnknownFieldError,
  entryId,
  segmentId,
} from '../model/index.js';
import type { ErrorReport } from '../model/index.js';
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
          segments: [{ id: segmentId('t9-seg'), start: 0 as never, end: 1 as never }],
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
          segments: [{ id: segmentId('t1-reborn-seg'), start: 0 as never, end: 1 as never }],
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
          segments: [{ id: segmentId('child-seg'), start: 0 as never, end: 1 as never }],
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
  // extender composed with `mergeEntryEdits` now does. The extender states no keys of its own since
  // #209 C3: it writes `{ cost: 500 }`, the same object `entries.update()` takes, and core derives
  // the set. A hand-built `proposedKeys` here is now an undeclared Field key and is refused (Q2).
  it('I4 reads proposedKeys as the Fields proposed, not as a Field named "proposedKeys"', () => {
    const state = new DatasetState({
      entries: [{ id: 't1', name: 't1', start: 0, end: 1 }],
      timeZone: 'UTC',
      fieldTypes: { money: { rollUp: 'sum' } },
      fields: [{ key: 'cost', type: 'money' }],
      editExtender: (): EntryEdits => new Map([[entryId('t1'), { cost: 500 }]]),
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
      editExtender: (): EntryEdits => new Map([[entryId('t1'), { cost: 500 }]]),
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

  // #209: the raw loop in `fieldsWrittenBy` used to add the `meta` container key even when an edit
  // already stated `proposedKeys`, so two different meta-sourced Fields intersected on "meta" and I4
  // refused a transaction that writes no Field twice.
  it('I4 does not fire when the body and the extender write two different meta-sourced Fields', () => {
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
          state.entries.stageUpdate(token, entryId('t1'), {
            meta: { risk: 1 },
            proposedKeys: new Set(['risk']),
          }),
        'user',
      ),
    ).not.toThrow();

    expect(state.entries.get(entryId('t1'))?.meta).toEqual({ cost: 500, risk: 1 });
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
        (token) => state.entries.stageUpdate(token, entryId('t1'), { name: 'a' }),
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
        (token) => state.entries.stageUpdate(token, entryId('t1'), { name: 'a' }),
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
        (token) => state.entries.stageUpdate(token, entryId('t1'), { name: 'a' }),
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
        (token) => state.entries.stageUpdate(token, entryId('t1'), { name: 'a' }),
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

// #212 R2 fix-plan review, finding B1 remainder: the envelope invariant binds an `EditExtender`'s
// `StoredEdit` exactly as it binds `entries.update()` — a plugin cascade is not a second, looser door
// onto `start`/`end`.
describe('the EditExtender seam owes the envelope invariant too (#212 R2 fix-plan review)', () => {
  it("pairs a plugin's direct start/end write onto the Entry's one Segment, the same as entries.update()", () => {
    const state = new DatasetState({
      entries: [{ id: 't1', name: 't1', start: '2026-01-01', end: '2026-01-02' }],
      timeZone: 'UTC',
      editExtender: (): EntryEdits =>
        new Map<ReturnType<typeof entryId>, StoredEdit>([
          [
            entryId('t1'),
            {
              start: toInstant('UTC', '2026-02-01'),
              end: toEndInstant('UTC', '2026-02-05', 'inclusive'),
            },
          ],
        ]),
    });

    runTransaction(state, (token) => state.entries.stageUpdate(token, entryId('t1'), { name: 'a' }), 'user');

    const entry = state.entries.get(entryId('t1'))!;
    expect(entry.start).toBe(toInstant('UTC', '2026-02-01'));
    expect(entry.end).toBe(toEndInstant('UTC', '2026-02-05', 'inclusive'));
    expect(entry.segments).toEqual([{ id: entry.segments[0]!.id, start: entry.start, end: entry.end }]);
  });

  it(
    'refuses a plugin writing start alone against a several-Segment Entry, the same as ' +
      'entries.update() (unified at D-S5-44; a computed answer was tried and rejected)',
    () => {
      const state = new DatasetState({
        entries: [
          {
            id: 't1',
            name: 't1',
            start: '2026-01-01',
            end: '2026-01-10',
            segments: [
              { id: 'sg1', start: '2026-01-01', end: '2026-01-05' },
              { id: 'sg2', start: '2026-01-05', end: '2026-01-10' },
            ],
          },
        ],
        timeZone: 'UTC',
        editExtender: (): EntryEdits =>
          new Map<ReturnType<typeof entryId>, StoredEdit>([
            [entryId('t1'), { start: toInstant('UTC', '2026-02-01') }],
          ]),
      });

      expect(() =>
        runTransaction(
          state,
          (token) => state.entries.stageUpdate(token, entryId('t1'), { name: 'a' }),
          'user',
        ),
      ).toThrow(SegmentsOutOfSyncError);
    },
  );

  it('refuses a plugin writing both start and end against a several-Segment Entry, whatever duration they imply', () => {
    const state = new DatasetState({
      entries: [
        {
          id: 't1',
          name: 't1',
          start: '2026-01-01',
          end: '2026-01-10',
          segments: [
            { id: 'sg1', start: '2026-01-01', end: '2026-01-05' },
            { id: 'sg2', start: '2026-01-05', end: '2026-01-10' },
          ],
        },
      ],
      timeZone: 'UTC',
      editExtender: (): EntryEdits =>
        new Map<ReturnType<typeof entryId>, StoredEdit>([
          [
            entryId('t1'),
            { start: toInstant('UTC', '2026-01-03'), end: toEndInstant('UTC', '2026-01-04', 'inclusive') },
          ],
        ]),
    });

    expect(() =>
      runTransaction(
        state,
        (token) => state.entries.stageUpdate(token, entryId('t1'), { name: 'a' }),
        'user',
      ),
    ).toThrow(SegmentsOutOfSyncError);
  });

  it(
    'reconciles an extender cascade against an Entry this same transaction adds, not just one ' +
      'the store already committed (#212 R2 fix-plan review, finding A, hole 1)',
    () => {
      const state = new DatasetState({
        entries: [],
        timeZone: 'UTC',
        editExtender: (): EntryEdits =>
          new Map<ReturnType<typeof entryId>, StoredEdit>([
            [entryId('t1'), { start: toInstant('UTC', '2026-02-01') }],
          ]),
      });

      runTransaction(
        state,
        (token) =>
          state.entries.stageAdd(token, {
            id: entryId('t1'),
            name: 't1',
            // The cascade below moves start to 2026-02-01, so the added entity's own end sits after
            // that or the move itself would be an inverted span the #143 ruling now refuses — not the
            // reconciliation-target bug this test is about.
            start: toInstant('UTC', '2026-01-01'),
            end: toInstant('UTC', '2026-03-01'),
            kind: 'span',
            segments: [
              {
                id: segmentId('sg1'),
                start: toInstant('UTC', '2026-01-01'),
                end: toInstant('UTC', '2026-03-01'),
              },
            ],
          }),
        'user',
      );

      // Before the fix, `byId` (committed, pre-transaction state) held nothing for `t1`, so the
      // extender's cascade reconciled against `undefined` and passed through unreconciled — and
      // separately, `addedEntitiesForFold` only overlaid hierarchy edits, so even a correctly
      // reconciled cascade never reached the entity the changeset published. One Segment (rather than
      // several) keeps this test about that reconciliation-target bug, not about the several-Segment
      // envelope-only refusal a different pair of tests above covers.
      const entry = state.entries.get(entryId('t1'))!;
      expect(entry.start).toBe(toInstant('UTC', '2026-02-01'));
      expect(entry.segments).toHaveLength(1);
      expect(entry.segments[0]!.start).toBe(toInstant('UTC', '2026-02-01'));
      expect(entry.segments[0]!.end).toBe(entry.end);
    },
  );

  it(
    "hands the hook `entryAfterEdits`, which sees this transaction's own body rewrite, not just " +
      '`entries` — the pre-transaction snapshot the hook is no longer graded against alone (D-S5-45)',
    () => {
      let sawSegmentCount: number | undefined;
      const state = new DatasetState({
        entries: [
          {
            id: 't1',
            name: 't1',
            start: '2026-01-01',
            end: '2026-01-10',
            segments: [{ id: 'sg1', start: '2026-01-01', end: '2026-01-10' }],
          },
        ],
        timeZone: 'UTC',
        editExtender: (request): EntryEdits => {
          // The pre-transaction snapshot still shows one Segment — this is the split the hook must not
          // be graded against (`entries.get` alone answers the wrong question here).
          expect(request.entries.get(entryId('t1'))?.segments).toHaveLength(1);
          sawSegmentCount = request.entryAfterEdits(entryId('t1'))?.segments.length;
          return new Map();
        },
      });

      runTransaction(
        state,
        (token) =>
          state.entries.stageUpdate(token, entryId('t1'), {
            segments: [
              {
                id: segmentId('sg1'),
                start: toInstant('UTC', '2026-01-01'),
                end: toInstant('UTC', '2026-01-04'),
              },
              {
                id: segmentId('sg2'),
                start: toInstant('UTC', '2026-01-04'),
                end: toInstant('UTC', '2026-01-07'),
              },
              {
                id: segmentId('sg3'),
                start: toInstant('UTC', '2026-01-07'),
                end: toInstant('UTC', '2026-01-10'),
              },
            ],
          }),
        'user',
      );

      expect(sawSegmentCount).toBe(3);
    },
  );
});

// #209 C3: the extension hook writes what `update()` takes. Everything a plugin author used to have
// to learn — a storage-shaped `Instant`, the end rule, `proposedKeys` — is core's job now, done in
// one place (`DatasetState.extraEditsFor` -> `readEdits` -> `readEdit`), the same road every other
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
    runTransaction(state, (token) => state.entries.stageUpdate(token, entryId('t1'), { name: 'a' }), 'user');
  }

  it('reads a loose date in the dataset’s own zone, so a plugin never calls time/', () => {
    // Both dates, because the cascade moves the whole span — a `start` past the stored `end` is an
    // inverted span, and `readEdit` refuses one for a plugin exactly as it does for `update()`.
    const state = datasetCascading({ start: '2026-02-01', end: '2026-02-03' }, 'America/Denver');
    renameT1(state);
    expect(state.entries.get(entryId('t2'))?.start).toBe(toInstant('America/Denver', '2026-02-01'));
  });

  it('reads a date-only end by the dataset’s DateOnlyEndRule, not as a raw midnight', () => {
    const state = datasetCascading({ end: '2026-02-05' });
    renameT1(state);
    expect(state.entries.get(entryId('t2'))?.end).toBe(toInstant('UTC', '2026-02-06'));
  });

  it('derives the proposed keys, so a meta-sourced Field write is still recognized', () => {
    const state = datasetCascading({ cost: 500 });
    let rows: readonly { field: string }[] = [];
    state.on('change', ({ changeSet }) => {
      rows = changeSet.updated as readonly { field: string }[];
    });

    renameT1(state);

    expect(state.entries.fieldValue(entryId('t2'), 'cost')).toBe(500);
    expect(rows.some((row) => row.field === 'cost')).toBe(true);
  });

  it('refuses a Field no Dataset declares, the same way entries.update() refuses one (Q2)', () => {
    const state = datasetCascading({ nope: 1 });
    expect(() => renameT1(state)).toThrow(UnknownFieldError);
  });

  // The two shapes stay apart for good: `proposedKeys` is core's bookkeeping on a `StoredEdit`, and
  // it is not a Field anybody may write — not through `update()`, and not through the hook.
  it('proposedKeys is not writable from outside', () => {
    const state = dataset([{ id: 't1' }]);
    expect(() => state.entries.update(entryId('t1'), { proposedKeys: new Set() })).toThrow(UnknownFieldError);
  });
});
